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

  return next();
});
