// ARENA11 service worker: caches the app shell and static media so the site opens fast and shows an offline page.
// API calls, live sockets and anything private always go to the network and are never cached.
const CACHE = 'arena11-shell-v4';
const SHELL = ['/', '/offline.html', '/manifest.webmanifest', '/favicon-32.png', '/icon-192.png', '/brand/arena11-logo-600.webp', '/media/hero-poster.webp', '/media/hero-poster-sm.webp'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return;
  // Range requests (video seeking) bypass the cache.
  if (req.headers.has('range') || url.pathname.endsWith('.mp4') || url.pathname.endsWith('.webm')) return;

  // Pages: network first; offline falls back to the cached shell, then the offline page.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && url.pathname === '/') caches.open(CACHE).then((c) => c.put('/', res.clone()));
          return res;
        })
        .catch(async () => (await caches.match('/')) || (await caches.match('/offline.html'))),
    );
    return;
  }
  // Hashed build assets and media: cache first.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/media/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
