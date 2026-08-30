// Service worker: offline caching (so the PWA installs/works like a real app) + Web Push
// via Firebase Cloud Messaging (so notifications show up even when the app is closed).
const CACHE_NAME = 'debtpawn-v1';
const PRECACHE = ['./', 'index.html', 'css/style.css', 'js/api.js', 'js/app.js', 'manifest.json', 'icons/icon.svg'];

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
  // Never cache API calls — always hit the network so data stays live.
  if (e.request.url.includes('/api/')) return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => cached))
  );
});

// --- Firebase Cloud Messaging (Web Push) ---
// firebase-config.js must exist (see README) and set self.FIREBASE_CONFIG before this runs.
try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
  importScripts('firebase-config.js');
  if (self.FIREBASE_CONFIG && self.FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY') {
    firebase.initializeApp(self.FIREBASE_CONFIG);
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      const title = (payload.notification && payload.notification.title) || 'แจ้งเตือน';
      const body = (payload.notification && payload.notification.body) || '';
      self.registration.showNotification(title, { body, icon: 'icons/icon.svg' });
    });
  }
} catch (e) {
  // Firebase not configured yet, or offline — push just won't work until firebase-config.js is filled in.
}
