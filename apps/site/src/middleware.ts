import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServerClient, type SupabaseServerClient } from './lib/supabase/server';

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

    const { data: principal } = await context.locals.supabase
      .from('principals')
      .select('is_active, terms_accepted_at, role')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (!principal || !principal.is_active) {
      await context.locals.supabase.auth.signOut();
      return context.redirect('/signin');
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
  }

  return next();
});
