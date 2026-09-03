// Service worker: offline caching so the PWA installs/works like a real app.
// Data lives in Firestore (its own network layer), so this only caches this app's own
// same-origin static files — Firestore/Auth/font requests always go straight to the network.
//
// Network-first, not cache-first: fetch() inside cache.addAll()/put() would otherwise happily
// return a browser-HTTP-cached (stale) response instead of a truly fresh one — that's what let
// updates silently fail to reach installed devices even after bumping CACHE_NAME. Every request
// here explicitly bypasses that layer with {cache: 'reload'} and only falls back to the cached
// copy when the network is unavailable.
const CACHE_NAME = 'debtpawn-v12';
const PRECACHE = ['./', 'index.html', 'css/style.css', 'js/rules.js', 'js/api.js', 'js/app.js', 'firebase-config.js', 'manifest.json', 'icons/icon.svg'];

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

// ---------------- Push ----------------
// This is what makes a reminder arrive with the app closed. The scheduled GitHub Actions job
// (scripts/send-notifications.js) works out what is due and sends the message; all this side
// does is display it. Sent as a data-only message on purpose — Chrome would otherwise render
// a `notification` payload itself and ignore the tag/click handling set up here.
// FCM reporting "delivered" only means it accepted the message, not that this device woke
// up for it. Recording arrivals in Cache Storage — the one store a worker can write with no
// credentials — lets the app show afterwards whether the push event ever fired here, which
// separates "never arrived" from "arrived but did not display".
const PUSH_LOG = "dpt-push-log";
async function logPush(entry) {
  try {
    const c = await caches.open(PUSH_LOG);
    const prev = await c.match("/__push_log");
    const list = prev ? await prev.json().catch(() => []) : [];
    list.unshift(entry);
    await c.put("/__push_log", new Response(JSON.stringify(list.slice(0, 20))));
  } catch (err) { /* diagnostics must never break delivery */ }
}

self.addEventListener("push", (e) => {
  let payload = {};
  let raw = "";
  try { raw = e.data ? e.data.text() : ""; } catch (err) { raw = "<unreadable>"; }
  try { payload = e.data ? e.data.json() : {}; } catch (err) { payload = { body: raw }; }
  const data = payload.data || payload;
  const title = data.title || "หนี้สิน & ตั๋วจำนำ";
  e.waitUntil((async () => {
    const entry = { at: new Date().toISOString(), title, rawLen: raw.length, shown: false, error: null };
    try {
      await self.registration.showNotification(title, {
        body: data.body || "",
        icon: "icons/icon.svg",
        badge: "icons/icon.svg",
        // One reminder replaces the previous one rather than stacking a new row every send.
        tag: data.tag || "dpt-due",
        renotify: true,
        data: { url: data.url || "./" },
      });
      entry.shown = true;
    } catch (err) {
      entry.error = (err && err.message) || String(err);
    }
    await logPush(entry);
  })());
});

// Focus the already-open app if there is one, rather than opening a second copy.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
