const STATIC_CACHE = 'crautosdb-static-v1';

const STATIC_ICONS = new Set([
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.png',
]);

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache navigations, HTML shells, API endpoints, service worker, or manifest.
  if (
    request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname === '/sw.js' ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  const isCacheableStatic =
    url.pathname.startsWith('/assets/') || STATIC_ICONS.has(url.pathname);
  if (!isCacheableStatic) return;

  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;

      const response = await fetch(request);
      if (response && response.ok && response.type === 'basic') {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
  );
});
