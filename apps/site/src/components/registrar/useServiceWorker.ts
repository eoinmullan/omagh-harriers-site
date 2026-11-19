import { useEffect } from 'react';

// Registering the worker, from inside the app and nowhere else.
//
// It is deliberately not in Layout.astro or a shared script. Every other page
// on this origin is a public marketing page, and the moment one of them
// registers a worker the blast radius stops being this app.

export function useServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Dev serves the island from source and Vite owns the module graph; a
    // worker caching that is a confusing way to spend an afternoon.
    if (import.meta.env.DEV) return;

    void navigator.serviceWorker
      .register('/registrar/sw.js', { scope: '/registrar/' })
      .catch(() => {
        // A refused registration is not worth a broken screen. The app works
        // online either way; it just will not open without a signal.
      });
  }, []);
}
