/* The club app's launch page worker.
 *
 * The app's icon opens /app/, a small page that sends the person on to the
 * section they used last. Home and Admin are drawn by the server, so with no
 * signal they're the phone's own error screen. This worker keeps the launch
 * page on the phone, so the icon always opens something, and the page can
 * send a registrar to Registration, which has a worker of its own.
 *
 * One worker per section, never one for the site. This file is served from
 * /app/, so the browser won't let it claim a scope above /app/, and it only
 * sees requests from the launch page. The public pages are out of its reach
 * by the browser's rule, not by anything written here. Do not move this file
 * up a directory, and do not add a Service-Worker-Allowed header to widen it.
 * See public/registrar/sw.js, which works the same way.
 */

const VERSION = 'app-v1';
const LAUNCH_PAGE = '/app/';
const IMMUTABLE = '/_astro/';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll([LAUNCH_PAGE])));
});

self.addEventListener('activate', (event) => {
  // Only this worker's own old caches. The registrar's are its business.
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((name) => name.startsWith('app-') && name !== VERSION).map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Network first, so a deploy lands as soon as there's signal.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isTheRealThing(response)) {
            const copy = response.clone();
            void caches.open(VERSION).then((cache) => cache.put(LAUNCH_PAGE, copy));
          }
          return response;
        })
        .catch(() => caches.match(LAUNCH_PAGE).then((cached) => cached ?? Response.error())),
    );
    return;
  }

  // The launch page's script. The hash is the version.
  if (url.pathname.startsWith(IMMUTABLE)) {
    event.respondWith(caches.match(request).then((cached) => cached ?? fetchAndKeep(request)));
    return;
  }

  // The manifest. Its name doesn't change with its contents, so the cache only
  // answers with no signal. Everything else, the launch page's signal check
  // included, goes to the network untouched.
  if (url.pathname.startsWith('/app/')) {
    event.respondWith(
      fetchAndKeep(request).catch(() => caches.match(request).then((cached) => cached ?? Response.error())),
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

// A captive wifi page or a bad deploy's error must not replace the saved page.
function isTheRealThing(response) {
  return response.ok && !response.redirected;
}
