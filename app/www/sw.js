// Service worker: offline caching so the PWA installs/works like a real app.
// Data lives in Firestore (its own network layer), so this only caches this app's own
// same-origin static files — Firestore/Auth/font requests always go straight to the network.
const CACHE_NAME = 'debtpawn-v5';
const PRECACHE = ['./', 'index.html', 'css/style.css', 'js/api.js', 'js/app.js', 'firebase-config.js', 'manifest.json', 'icons/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith(self.location.origin)) return; // let Firestore/Auth/fonts hit the network directly
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => cached))
  );
});
