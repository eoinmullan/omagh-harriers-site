/* The Emergency contacts section's service worker.
 *
 * It lets the section be opened at a track with no signal. The contacts
 * themselves are kept in IndexedDB by the page (lib/emergency/copy-store.ts),
 * never in this worker's cache: what's cached here is the empty shell, its
 * build assets and its icons.
 *
 * It works exactly as public/registrar/sw.js does, and for the same reasons
 * lives in its own folder: the browser won't let a worker served from
 * /emergency/ claim a scope above it, so the public pages are out of its reach.
 * Do not move this file up a directory, and do not add a
 * Service-Worker-Allowed header to widen it. Supabase and every other
 * cross-origin request are never touched.
 */

const VERSION = 'emergency-v1';
const SHELL = '/emergency/';

// Hashed build assets. The hash is the version, so a cached one is never stale
// — a changed file has a different name and is simply not in the cache yet.
const IMMUTABLE = '/_astro/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll([SHELL])),
  );
});

self.addEventListener('activate', (event) => {
  // Drop caches from older versions of this worker, and nothing else.
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((name) => name.startsWith('emergency-') && name !== VERSION)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Supabase, and anything else off this origin, is never touched. Caching a
  // read would mean showing last week's balances as though they were tonight's.
  if (url.origin !== self.location.origin) return;

  // The app shell. Network first, so a deploy is picked up the moment there is
  // signal; cache second, so there is something to open when there is not.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isTheRealThing(response)) {
            const copy = response.clone();
            void caches.open(VERSION).then((cache) => cache.put(SHELL, copy));
          }
          return response;
        })
        .catch(() => caches.match(SHELL).then((cached) => cached ?? offlineFallback())),
    );
    return;
  }

  // Build assets, which are immutable by construction. Cache first, because the
  // fastest correct answer is the one already on the phone.
  if (url.pathname.startsWith(IMMUTABLE)) {
    event.respondWith(caches.match(request).then((cached) => cached ?? fetchAndKeep(request)));
    return;
  }

  // The app's own files: the manifest, icons and logo. Their names don't change
  // when their contents do, so they are fetched first and the cache only answers
  // with no signal. Serving these cache-first once kept the old manifest, and so
  // the old icon, on every phone that had opened the app before the icon changed.
  if (url.pathname.startsWith('/emergency/')) {
    event.respondWith(
      fetchAndKeep(request).catch(() =>
        caches.match(request).then((cached) => cached ?? Response.error()),
      ),
    );
  }
});

function fetchAndKeep(request) {
  return fetch(request).then((response) => {
    if (isTheRealThing(response)) {
      const copy = response.clone();
      void caches.open(VERSION).then((cache) => cache.put(request, copy));
    }
    return response;
  });
}

// Only a page this site actually served is worth keeping for offline. Leisure-
// centre wifi often answers every request with a redirect to its own sign-in
// page; that page is shown, because it's what the network said, but it must
// not replace the saved app, or the next time there's no signal the registrar
// opens the wifi page instead. An error page from a bad deploy is the same.
function isTheRealThing(response) {
  return response.ok && !response.redirected;
}

function offlineFallback() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><title>Offline</title>' +
      '<body style="background:#000000;color:#f8fafc;font:1rem system-ui;padding:2rem">' +
      '<h1>No signal, and nothing saved yet</h1>' +
      '<p>Open this once with a connection and it will work without one afterwards.</p>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}
