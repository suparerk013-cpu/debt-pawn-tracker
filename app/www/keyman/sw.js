// Service worker — แคชทุกไฟล์ของแอปไว้ในเครื่อง เพื่อให้ใช้งานได้ครบตอนไม่มีเน็ต
// ทุกอย่างเป็นไฟล์ในโปรเจคเอง (รวม SheetJS) จึงไม่ต้องพึ่ง network ตอนรันเลย
const CACHE = 'keyman-v23';   // ขึ้นเวอร์ชันทุกครั้งที่แก้ไฟล์ในแอป เพื่อให้เครื่องที่ติดตั้งไว้แล้วโหลดของใหม่
const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'vendor/xlsx.full.min.js',
  'js/tax-tables.js',
  'js/engine.js',
  'js/store.js',
  'js/ui-kit.js',
  'js/app.js',
  'js/import-dbd.js',
  'js/ui-import.js',
  'js/ui-cases.js',
  'js/ui-company.js',
  'js/ui-pl.js',
  'js/ui-bs.js',
  'js/ui-comp.js',
  'js/ui-taccount.js',
  'js/ui-rates.js',
  'js/ui-gross.js',
  'js/ui-summary.js',
  'js/ui-sheets.js',
  'js/ui-quote.js',
  'js/ui-print.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) =>
    Promise.all(PRECACHE.map((url) =>
      fetch(url, { cache: 'reload' }).then((res) => c.put(url, res)).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE && k.indexOf('keyman-') === 0).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// แคชก่อน แล้วค่อยอัปเดตเบื้องหลัง — เปิดแอปได้ทันทีแม้ไม่มีเน็ต
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (!req.url.startsWith(self.location.origin)) return;
  e.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || network;
    })
  );
});
