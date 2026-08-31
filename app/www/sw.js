// Service worker: offline caching so the PWA installs/works like a real app.
// Data lives in Firestore (its own network layer), so this only caches this app's own
// same-origin static files — Firestore/Auth/font requests always go straight to the network.
//
// Network-first, not cache-first: fetch() inside cache.addAll()/put() would otherwise happily
// return a browser-HTTP-cached (stale) response instead of a truly fresh one — that's what let
// updates silently fail to reach installed devices even after bumping CACHE_NAME. Every request
// here explicitly bypasses that layer with {cache: 'reload'} and only falls back to the cached
// copy when the network is unavailable.
const CACHE_NAME = 'debtpawn-v7';
const PRECACHE = ['./', 'index.html', 'css/style.css', 'js/api.js', 'js/app.js', 'firebase-config.js', 'manifest.json', 'icons/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((c) =>
      Promise.all(PRECACHE.map((url) => fetch(url, { cache: 'reload' }).then((res) => c.put(url, res)).catch(() => {})))
    )
  );
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
    fetch(e.request, { cache: 'no-store' }).then((res) => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
