// แกนแอป: สถานะเคสปัจจุบัน, การวาดหน้าจอ, แถบตรวจสอบ, การบันทึกลง IndexedDB
(function (root) {
  'use strict';
  const E = root.KeymanEngine;
  const T = root.KeymanTaxTables;
  const Store = root.KeymanStore;
  const K = (root.K = root.K || {});
  const h = K.h;

  K.E = E; K.T = T; K.Store = Store;

  K.state = {
    kase: null,
    computed: null,
    tabId: 'cases',
    duplicateOf: null,
    dirty: false,
  };

  // ── โครงเคสเปล่า ───────────────────────────────────────────────────────
  const YEARS_SHOWN = 3;
  K.currentThaiYear = () => new Date().getFullYear() + 543;

  K.newCase = function (name) {
    const now = new Date().toISOString();
    return {
      id: 'case-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      createdAt: now,
      updatedAt: now,
      taxYear: K.currentThaiYear(),
      company: {
        name: name || '', regNo: '', entityType: '', status: '', registeredDate: '',
        paidUpCapital: null, address: '', businessGroup: '', sizeLabel: '', fiscalYearsFiled: '',
        consultIssues: '',
      },
      directors: [K.newDirector(1)],
      policy: {
        premiumTotal: null, insurer: '', productName: '', premiumYears: null,
        beneficiary: '', taxMethod: 'perpetual', welfareWording: '', welfareText: '',
        lumpSum: null,
      },
      docs: { welfareRule: false, boardResolution: false, policyReceipt: false, pnd1: false },
      financials: emptyFinancials(),
      balance: emptyBalance(),
    };
  };

  K.newDirector = function (n) {
    return {
      id: 'dir-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: '', position: '', positionCriteria: '',
      premiumAllocated: null, salary: null, bonus: null,
      allowances: { personal: 60000 },
      donations: {},
    };
  };

  K.PL_ROWS = [
    { key: 'mainRevenue', label: 'รายได้หลัก', row: 6, ratio: 'none' },
    { key: 'revenues', label: 'รายได้รวม', row: 7, ratio: 'none', bold: true },
    { key: 'cogs', label: 'ต้นทุนขาย', row: 8, ratio: 'dash' },
    { key: 'grossProfit', label: 'กำไร(ขาดทุน) ขั้นต้น', row: 9, ratio: 'dash', avgZero: true },
    { key: 'sga', label: 'ค่าใช้จ่ายในการขายและบริการ', row: 10, ratio: 'dash' },
    { key: 'totalExpense', label: 'รายจ่ายรวม', row: 11, ratio: 'revenue', bold: true },
    { key: 'interest', label: 'ดอกเบี้ยจ่าย', row: 12, ratio: 'dash', noAvg: true },
    { key: 'profitsBeforeTax', label: 'กำไร(ขาดทุน) ก่อนภาษี', row: 13, ratio: 'revenue', bold: true },
    { key: 'taxPaid', label: 'ภาษีเงินได้', row: 14, ratio: 'profit', bold: true },
    { key: 'netProfit', label: 'กำไร(ขาดทุน) สุทธิ', row: 15, ratio: 'revenue' },
  ];

  K.BS_ROWS = [
    { key: 'receivables', label: 'ลูกหนี้การค้าสุทธิ', row: 6 },
    { key: 'inventory', label: 'สินค้าคงเหลือ', row: 7 },
    { key: 'currentAssets', label: 'สินทรัพย์หมุนเวียน', row: 8, bold: true },
    { key: 'ppe', label: 'ที่ดิน อาคารและอุปกรณ์', row: 9 },
    { key: 'nonCurrentAssets', label: 'สินทรัพย์ไม่หมุนเวียน', row: 10, bold: true },
    { key: 'totalAssets', label: 'สินทรัพย์รวม', row: 11, bold: true },
    { key: 'currentLiabilities', label: 'หนี้สินหมุนเวียน', row: 12 },
    { key: 'nonCurrentLiabilities', label: 'หนี้สินไม่หมุนเวียน', row: 13 },
    { key: 'totalLiabilities', label: 'หนี้สินรวม', row: 14, bold: true },
    { key: 'equity', label: 'ส่วนของผู้ถือหุ้น', row: 15, bold: true },
    { key: 'totalLiabEquity', label: 'หนี้สินรวมและส่วนของผู้ถือหุ้น', row: 16, bold: true },
  ];

  function emptyFinancials() {
    const f = { years: ['', '', ''], pct: {} };
    K.PL_ROWS.forEach((r) => { f[r.key] = ['', '', '']; f.pct[r.key] = ['', '', '']; });
    return f;
  }
  function emptyBalance() {
    const b = { years: ['', '', ''], pct: {} };
    K.BS_ROWS.forEach((r) => { b[r.key] = ['', '', '']; b.pct[r.key] = ['', '', '']; });
    return b;
  }
  K.emptyFinancials = emptyFinancials;
  K.emptyBalance = emptyBalance;
  K.YEARS_SHOWN = YEARS_SHOWN;

  // เติมช่องที่ขาดให้เคสเก่าที่บันทึกไว้ก่อนเพิ่มฟิลด์ใหม่
  K.normalize = function (kase) {
    const base = K.newCase();
    const k = Object.assign({}, base, kase);
    k.company = Object.assign({}, base.company, kase.company);
    k.policy = Object.assign({}, base.policy, kase.policy);
    k.docs = Object.assign({}, base.docs, kase.docs);
    k.financials = Object.assign(emptyFinancials(), kase.financials);
    k.financials.pct = Object.assign(emptyFinancials().pct, (kase.financials || {}).pct);
    k.balance = Object.assign(emptyBalance(), kase.balance);
    k.balance.pct = Object.assign(emptyBalance().pct, (kase.balance || {}).pct);
    k.directors = (kase.directors && kase.directors.length ? kase.directors : base.directors).map((d) =>
      Object.assign({ allowances: {}, donations: {} }, K.newDirector(), d));
    return k;
  };

  // ── การคำนวณ + บันทึก ──────────────────────────────────────────────────
  K.recompute = function () {
    if (!K.state.kase) return null;
    K.state.computed = E.computeCase(K.state.kase, { duplicateOf: K.state.duplicateOf });
    return K.state.computed;
  };

  let saveTimer = null;
  K.scheduleSave = function () {
    if (!K.state.kase) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(K.saveNow, 400);
  };
  K.saveNow = function () {
    const k = K.state.kase;
    if (!k) return Promise.resolve();
    k.updatedAt = new Date().toISOString();
    k.fingerprint = E.fingerprint(k.financials);
    const c = K.state.computed;
    k.summary = {
      name: k.company.name,
      paidUpCapital: k.company.paidUpCapital,
      isSme: c ? c.sme.isSme : null,
      premiumTotal: k.policy.premiumTotal,
      status: c ? (c.checks.blocking.length ? 'block' : c.checks.items.some((i) => i.level === 'warn') ? 'warn' : 'ok') : 'warn',
    };
    return Store.put(JSON.parse(JSON.stringify(k))).then(() => {
      return Store.duplicateOf(k.fingerprint, k.id).then((dup) => {
        if (dup !== K.state.duplicateOf) { K.state.duplicateOf = dup; K.recompute(); K.renderCheckbar(); }
      });
    }).catch((e) => console.warn('บันทึกไม่สำเร็จ', e));
  };

  // เรียกทุกครั้งที่ผู้ใช้พิมพ์ในช่องกรอก
  K.touch = function () {
    K.state.dirty = true;
    clearTimeout(K._touchTimer);
    K._touchTimer = setTimeout(() => K.refreshOutputs(), 120);
  };

  // ── แท็บ ───────────────────────────────────────────────────────────────
  K.tabs = [];
  K.registerTab = function (order, id, label, renderFn, opts) {
    K.tabs.push(Object.assign({ order, id, label, render: renderFn }, opts || {}));
    K.tabs.sort((a, b) => a.order - b.order);
  };

  K.go = function (tabId) {
    K.state.tabId = tabId;
    location.hash = '#' + tabId;
    K.render();
    window.scrollTo(0, 0);
  };

  K.openCase = function (id) {
    return Store.get(id).then((row) => {
      if (!row) { K.alert('ไม่พบเคส', 'เคสนี้ถูกลบไปแล้วหรือยังไม่ได้สร้าง'); return; }
      K.state.kase = K.normalize(row);
      return Store.duplicateOf(K.state.kase.fingerprint, K.state.kase.id).then((dup) => {
        K.state.duplicateOf = dup;
        K.go('company');
      });
    });
  };

  K.closeCase = function () {
    return K.saveNow().then(() => { K.state.kase = null; K.state.computed = null; K.go('cases'); });
  };

  // ── วาดหน้าจอ ──────────────────────────────────────────────────────────
  K.render = function () {
    const main = document.getElementById('main');
    const nav = document.getElementById('tabs');
    K._outputs = [];
    K.clear(main); K.clear(nav);

    if (!K.state.kase && K.state.tabId !== 'cases') K.state.tabId = 'cases';
    const tab = K.tabs.find((t) => t.id === K.state.tabId) || K.tabs[0];

    // แถบแท็บ (ซ่อนเมื่ออยู่หน้ารายชื่อเคส)
    if (K.state.kase) {
      K.tabs.filter((t) => t.id !== 'cases').forEach((t, i) => {
        nav.appendChild(h('button', {
          class: t.id === tab.id ? 'on' : '',
          onclick: () => K.go(t.id),
          text: (t.num ? t.num + '. ' : '') + t.label,
        }));
      });
      nav.style.display = '';
    } else {
      nav.style.display = 'none';
    }

    K.recompute();
    tab.render(main);
    K.renderHeader();
    K.renderCheckbar();
  };

  K.renderHeader = function () {
    const nameEl = document.getElementById('case-name');
    const k = K.state.kase;
    nameEl.textContent = k ? (k.company.name || '(ยังไม่ได้ตั้งชื่อบริษัท)') : 'เลือกเคสจากรายชื่อ';
    document.getElementById('btn-close').style.display = k ? '' : 'none';
    const sel = document.getElementById('year-select');
    sel.style.display = k ? '' : 'none';
    if (k) {
      K.clear(sel);
      const years = [];
      for (let y = K.currentThaiYear() + 1; y >= 2565; y--) years.push(y);
      years.forEach((y) => sel.appendChild(h('option', { value: y, selected: Number(k.taxYear) === y }, 'ปีภาษี ' + y)));
    }
  };

  // ── แถบตรวจสอบ: อยู่บนจอตลอดเวลา ไม่ต้องกดปุ่ม ─────────────────────────
  K.renderCheckbar = function () {
    const bar = document.getElementById('checkbar');
    const c = K.state.computed;
    if (!K.state.kase || !c) { bar.hidden = true; return; }
    bar.hidden = false;
    const items = c.checks.items;
    const blocks = items.filter((i) => i.level === 'block');
    const warns = items.filter((i) => i.level === 'warn');
    const level = blocks.length ? 'block' : warns.length ? 'warn' : 'ok';
    const openState = bar.dataset.open === '1';

    K.clear(bar);
    const head = h('div.head', { onclick: () => { bar.dataset.open = openState ? '0' : '1'; K.renderCheckbar(); } }, [
      h('span', { class: 'pill ' + level, text: blocks.length ? `บล็อก ${blocks.length}` : warns.length ? `เตือน ${warns.length}` : 'ผ่านทุกข้อ' }),
      h('span.grow', { text: blocks.length ? blocks[0].title : warns.length ? warns[0].title : 'ออกใบเสนอได้ — ตรวจครบ ' + items.length + ' ข้อ' }),
      h('span.badge', { text: openState ? 'ย่อ ▲' : 'กาง ▼' }),
    ]);
    bar.appendChild(head);
    if (openState) {
      bar.appendChild(h('ul', null, items.map((i) =>
        h('li', { class: i.level }, [
          h('div', null, [h('span.code', { text: i.code }), h('span', { text: i.title })]),
          i.detail ? h('div.detail', { text: i.detail }) : null,
        ]))));
    }
  };

  // ── เริ่มทำงาน ─────────────────────────────────────────────────────────
  K.boot = function () {
    document.getElementById('btn-refs').addEventListener('click', () => {
      document.body.classList.toggle('show-refs');
      localStorage.setItem('keyman.refs', document.body.classList.contains('show-refs') ? '1' : '0');
    });
    if (localStorage.getItem('keyman.refs') === '1') document.body.classList.add('show-refs');
    document.getElementById('btn-close').addEventListener('click', () => K.closeCase());
    document.getElementById('year-select').addEventListener('change', (e) => {
      K.state.kase.taxYear = Number(e.target.value);
      K.touch(); K.render();
    });
    window.addEventListener('hashchange', () => {
      const id = location.hash.replace('#', '') || 'cases';
      if (id !== K.state.tabId) { K.state.tabId = id; K.render(); }
    });
    window.addEventListener('beforeunload', () => { if (K.state.kase) K.saveNow(); });
    K.state.tabId = 'cases';
    K.render();

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
    }
  };
})(typeof self !== 'undefined' ? self : this);
