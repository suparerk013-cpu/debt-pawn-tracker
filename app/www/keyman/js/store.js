// ที่เก็บเคสในเครื่อง — IndexedDB
// ────────────────────────────────────────────────────────────────────────────
// ข้อมูลอยู่ในเบราว์เซอร์นี้ เครื่องนี้เท่านั้น ล้างข้อมูลเว็บ = หายหมด
// จึงต้องมีปุ่มสำรองเป็นไฟล์ JSON และปุ่มนำกลับเข้าคู่กันเสมอ (ดู ui-cases.js)
(function (root) {
  'use strict';
  const DB_NAME = 'keyman-workbook';
  const DB_VERSION = 1;
  const STORE = 'cases';
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const s = db.createObjectStore(STORE, { keyPath: 'id' });
          // index สำหรับ CHK-05 (งบซ้ำ) และสำหรับค้นด้วยเลขทะเบียนนิติบุคคล 13 หลัก
          s.createIndex('fingerprint', 'fingerprint', { unique: false });
          s.createIndex('regNo', 'company.regNo', { unique: false });
          s.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  function tx(mode, fn) {
    return open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      let result;
      try { result = fn(store); } catch (e) { reject(e); return; }
      t.oncomplete = () => resolve(result && result.__req ? result.__req.result : result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }
  const wrap = (req) => ({ __req: req });

  const Store = {
    all: () => tx('readonly', (s) => wrap(s.getAll())),
    get: (id) => tx('readonly', (s) => wrap(s.get(id))),
    put: (kase) => tx('readwrite', (s) => { s.put(kase); return kase; }),
    remove: (id) => tx('readwrite', (s) => { s.delete(id); return id; }),
    clear: () => tx('readwrite', (s) => { s.clear(); return true; }),
    // งบซ้ำ: fingerprint เดียวกันแต่คนละเคส
    duplicateOf(fingerprint, exceptId) {
      if (!fingerprint) return Promise.resolve(null);
      return Store.all().then((rows) => {
        const hit = rows.find((r) => r.fingerprint === fingerprint && r.id !== exceptId);
        return hit ? (hit.company && hit.company.name) || hit.id : null;
      });
    },
    exportJson() {
      return Store.all().then((rows) => JSON.stringify({
        app: 'keyman-workbook',
        version: 1,
        exportedAt: new Date().toISOString(),
        cases: rows,
      }, null, 2));
    },
    // mode 'merge' = ทับเฉพาะเคสที่ id ตรงกัน · 'replace' = ล้างของเดิมทิ้งก่อน
    importJson(text, mode) {
      let data;
      try { data = JSON.parse(text); } catch (e) { return Promise.reject(new Error('ไฟล์ไม่ใช่ JSON ที่อ่านได้')); }
      const cases = (data && data.cases) || (Array.isArray(data) ? data : null);
      if (!cases || !Array.isArray(cases)) return Promise.reject(new Error('ไม่พบรายการเคสในไฟล์นี้'));
      const start = mode === 'replace' ? Store.clear() : Promise.resolve();
      return start.then(() => tx('readwrite', (s) => {
        cases.forEach((c) => { if (c && c.id) s.put(c); });
        return cases.length;
      }));
    },
  };

  root.KeymanStore = Store;
})(typeof self !== 'undefined' ? self : this);
