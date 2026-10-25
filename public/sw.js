// Minimal service worker so phones offer "Install app" / "Add to Home Screen".
// It caches the app's styles, scripts and icons; pages and data always come fresh from the server.
const CACHE = 'nobat-static-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith('/static/')) return;
  // Network first, so updates show at once; the cached copy is used only when offline.
  event.respondWith(fetch(event.request).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(event.request, copy));
    return res;
  }).catch(() => caches.match(event.request)));
});
