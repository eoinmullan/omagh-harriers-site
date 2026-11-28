import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServerClient, type SupabaseServerClient } from './lib/supabase/server';
import { orThrow } from './lib/supabase/or-throw';

export const onRequest = defineMiddleware(async (context, next) => {
  let client: SupabaseServerClient | undefined;

  Object.defineProperty(context.locals, 'supabase', {
    configurable: true,
    enumerable: true,
    get() {
      if (!client) {
        client = createSupabaseServerClient({
          request: context.request,
          cookies: context.cookies,
        });
      }
      return client;
    },
  });

  const { pathname } = new URL(context.request.url);

  if (pathname.startsWith('/members') || pathname.startsWith('/admin')) {
    const {
      data: { user },
    } = await context.locals.supabase.auth.getUser();

    if (!user) {
      return context.redirect('/signin');
    }

    const principal = orThrow(await context.locals.supabase
      .from('principals')
      .select('id, display_name, role, is_active, terms_accepted_at, opens_emergency_contacts')
      .eq('auth_user_id', user.id)
      .maybeSingle());

    if (!principal || !principal.is_active) {
      await context.locals.supabase.auth.signOut();
      return context.redirect('/signin?error=not_registered');
    }

    if (!principal.terms_accepted_at) {
      return context.redirect('/signin/terms');
    }

    if (
      pathname.startsWith('/admin') &&
      principal.role !== 'admin' &&
      principal.role !== 'superuser'
    ) {
      return context.redirect('/members');
    }

    // Hand the page what was just established, so it doesn't ask Supabase
    // Auth and read the principal a second time. Pages read these through
    // whoIsSignedIn() in lib/auth/signed-in.ts.
    context.locals.user = user;
    context.locals.principal = {
      id: principal.id,
      display_name: principal.display_name,
      role: principal.role,
      opensEmergencyContacts: principal.opens_emergency_contacts,
    };
  }

  return next();
});
