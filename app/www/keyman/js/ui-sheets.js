// ชุดงบการเงินสำหรับพิมพ์ — A4 แนวนอน หน้าละชีต
//   1 งบกำไรขาดทุน · 2 งบดุล · 3 ตารางเพื่อแสดงงบ · 4 สรุปผลต่าง
// วาดใหม่แบบอ่านอย่างเดียว ไม่ใช้ตัวเดียวกับหน้าจอ เพราะหน้าจอมีช่องกรอก ปุ่ม และคำอธิบาย
// ที่ไม่ควรติดไปบนกระดาษ — แถวและสูตรใช้ชุดเดียวกัน (K.PL_ROWS · K.BS_ROWS · K.plRatio)
(function (root) {
  'use strict';
  const K = root.K, h = K.h, E = root.KeymanEngine;
  const IDX = [0, 1, 2];

  const M = (v) => K.money(v);
  const R = (v) => K.ratio(v);
  const fin = () => K.state.kase.financials;
  const bal = () => K.state.kase.balance;
  const plv = (key, i) => E.num(fin()[key][i]);
  const bsv = (key, i) => E.num(bal()[key][i]);
  const yearsOf = (bag) => IDX.map((i) => bag.years[i] || '–');

  const td = (text, cls) => h('td', { class: cls || '', text: text });
  const th = (text, cls) => h('th', { class: cls || '', text: text });

  // หัวชีตของทุกหน้า — บริษัท ปีภาษี ชื่อชีต และเลขหน้า
  // เลขหน้าเป็นไดนามิก เพราะเลือกพิมพ์เฉพาะบางชีตได้
  function sheetHead(no, total, title, sub) {
    const k = K.state.kase;
    return h('div.fsheet-head', null, [
      h('div', null, [
        h('b', { text: title }),
        sub ? h('span.sub', { text: sub }) : null,
      ]),
      h('div.fsheet-meta', null, [
        h('span', { text: k.company.name || '(ยังไม่ระบุชื่อบริษัท)' }),
        h('span', { text: 'ปีภาษี ' + k.taxYear }),
        h('span', { text: 'หน้า ' + no + '/' + total }),
      ]),
    ]);
  }

  // ── ชีต 1 งบกำไรขาดทุน ────────────────────────────────────────────────
  function sheetPl(c, no, total) {
    const y = yearsOf(fin());
    const head = [
      h('tr.head-band', null, [th('หน่วย : บาท', 'label')]
        .concat(IDX.map((i) => h('th', { colspan: 3, text: y[i] })))
        .concat([h('th', { colspan: 2, text: 'ค่าเฉลี่ย 3 ปี' })])),
      h('tr', null, [th('', 'label')]
        .concat(IDX.reduce((a) => a.concat([th('จำนวนเงิน'), th('%เปลี่ยนแปลง'), th('สัดส่วน')]), []))
        .concat([th('จำนวนเงิน'), th('สัดส่วน')])),
    ];
    const SECT = { mainRevenue: 'รายได้', cogs: 'ต้นทุนและค่าใช้จ่าย', profitsBeforeTax: 'กำไรและภาษี' };
    const body = [];
    K.PL_ROWS.forEach((r) => {
      if (SECT[r.key]) {
        body.push(h('tr.section', null, [th(SECT[r.key], 'label')]
          .concat(IDX.reduce((a) => a.concat([th(''), th(''), th('')]), [])).concat([th(''), th('')])));
      }
      const cells = [td(r.label, 'label')];
      IDX.forEach((i) => {
        cells.push(td(M(plv(r.key, i)), 'num'));
        const pct = E.num(fin().pct[r.key][i]);
        cells.push(td(pct === null ? '–' : pct.toFixed(2) + '%', 'num'));
        cells.push(td(r.ratio === 'dash' || r.ratio === 'none' ? '–' : R(K.plRatio(r, i)), 'num'));
      });
      cells.push(td(r.noAvg ? '–' : r.avgZero ? M(0) : M(E.avg(fin()[r.key])), 'num'));
      cells.push(td(r.ratio === 'dash' || r.ratio === 'none' ? '–' : R(K.plRatioAvg(r)), 'num'));
      body.push(h('tr', { class: r.bold ? 'total' : '' }, cells));
    });

    // ค่าใช้จ่ายต้องห้าม — ย่อเหลือเฉพาะตัวเลข คำอธิบายที่มาอยู่บนหน้าจอแล้ว
    const fRow = (label, pick) => h('tr', null, [td(label, 'label')].concat(IDX.map((i) => td(pick(i), 'num'))));
    const fy = (i) => (c && c.forbiddenByYear[i]) || null;
    const fTable = K.table([h('tr', null, [th('ค่าใช้จ่ายต้องห้าม (ถอดกลับจากภาษีที่จ่ายเกินฐาน)', 'label')]
      .concat(IDX.map((i) => th(y[i]))))], [
      fRow('กำไร(ขาดทุน) ก่อนภาษี', (i) => M(plv('profitsBeforeTax', i))),
      fRow('ภาษีเงินได้ที่จ่ายจริง', (i) => M(plv('taxPaid', i))),
      fRow('อัตราภาษีที่จ่าย', (i) => { const p = plv('profitsBeforeTax', i), t = plv('taxPaid', i); return p && t !== null ? (t / p * 100).toFixed(2) + '%' : '–'; }),
      fRow('ฐานภาษี (ภาษีที่ควรจะเป็น)', (i) => { const f = fy(i); return f ? M(f.expectedTax) : '–'; }),
      fRow('ส่วนเกินภาษี', (i) => { const f = fy(i); return f && f.taxPaid !== null ? M(f.excessTax) : '–'; }),
      h('tr.total', null, [td('คชจ.ต้องห้าม (ประมาณการ)', 'label')].concat(IDX.map((i) => {
        const f = fy(i); return td(!f ? '–' : f.hidden ? 'ไม่แสดง' : M(f.amount), 'num');
      }))),
    ]);

    // แถบตัวเลขสรุป — ให้คนที่ได้กระดาษใบนี้อ่านภาพรวมได้ก่อนลงไปในตาราง
    const growth = (key) => {
      const a = plv(key, 1), b = plv(key, 2);
      return a === null || b === null || a === 0 ? null : (b - a) / Math.abs(a) * 100;
    };
    const arrow = (g) => (g === null ? '' : (g > 0 ? '▲ ' : g < 0 ? '▼ ' : '') + g.toFixed(1) + '% จากปีก่อน');
    const kpi = (label, value, note) => h('div.fkpi', null, [
      h('span.k', { text: label }), h('b', { text: value }), h('span.s', { text: note || '' }),
    ]);
    const pbt = plv('profitsBeforeTax', 2), tax = plv('taxPaid', 2);
    const strip = h('div.fkpis', null, [
      kpi('รายได้รวมปีล่าสุด', M(plv('revenues', 2)), arrow(growth('revenues'))),
      kpi('กำไร(ขาดทุน) ก่อนภาษี', M(pbt), arrow(growth('profitsBeforeTax'))),
      kpi('ภาษีเงินได้', M(tax), pbt && tax !== null ? 'คิดเป็น ' + (tax / pbt * 100).toFixed(2) + '% ของกำไรก่อนภาษี' : ''),
      kpi('กำไร(ขาดทุน) สุทธิ', M(plv('netProfit', 2)), arrow(growth('netProfit'))),
    ]);

    return h('div.fsheet', null, [
      sheetHead(no, total, 'งบกำไรขาดทุน', 'ชีต งบกำไรขาดทุน แถว 4–33'),
      strip,
      K.table(head, body),
      h('div.fsheet-gap'),
      fTable,
      h('p.fsheet-note', { text: 'คชจ.ต้องห้ามเป็นการถอดกลับจากส่วนต่างระหว่างภาษีที่จ่ายจริงกับภาษีที่ควรจะเป็น เป็นประมาณการ ไม่ใช่ตัวเลขจากแบบ ภ.ง.ด.50' }),
    ]);
  }

  // ── ชีต 2 งบดุล ───────────────────────────────────────────────────────
  function sheetBs(no, total) {
    const y = yearsOf(bal());
    const a = E.balanceAnalysis(bal(), K.state.kase.company.paidUpCapital);
    const head = [
      h('tr.head-band', null, [th('หน่วย : บาท', 'label')].concat(IDX.map((i) => h('th', { colspan: 2, text: y[i] })))),
      h('tr', null, [th('', 'label')].concat(IDX.reduce((acc) => acc.concat([th('จำนวนเงิน'), th('%เปลี่ยนแปลง')]), []))),
    ];
    const SECT = { receivables: 'สินทรัพย์', currentLiabilities: 'หนี้สิน', equity: 'ส่วนของผู้ถือหุ้น' };
    const body = [];
    K.BS_ROWS.forEach((r) => {
      if (SECT[r.key]) {
        body.push(h('tr.section', null, [th(SECT[r.key], 'label')]
          .concat(IDX.reduce((acc) => acc.concat([th(''), th('')]), []))));
      }
      const cells = [td(r.label, 'label')];
      IDX.forEach((i) => {
        cells.push(td(M(bsv(r.key, i)), 'num'));
        const pct = E.num(bal().pct[r.key][i]);
        cells.push(td(pct === null ? '–' : pct.toFixed(2) + '%', 'num'));
      });
      body.push(h('tr', { class: r.bold ? 'total' : '' }, cells));
    });

    const ratio = (v) => (v === null || v === undefined ? '–' : v.toFixed(2) + ' เท่า');
    const L = a.latest;
    return h('div.fsheet', null, [
      sheetHead(no, total, 'งบแสดงฐานะการเงิน', 'ชีต งบดุล แถว 4–21'),
      K.table(head, body),
      h('div.fsheet-gap'),
      h('div.fsheet-cols', null, [
        K.table([h('tr', null, [th('กำไรสะสมรายปี', 'label')].concat(IDX.map((i) => th(y[i]))))], [
          h('tr', null, [td('ส่วนของผู้ถือหุ้น', 'label')].concat(IDX.map((i) => td(M(bsv('equity', i)), 'num')))),
          h('tr', null, [td('ทุนจดทะเบียนที่ชำระแล้ว', 'label')].concat(IDX.map(() => td(M(K.state.kase.company.paidUpCapital), 'num')))),
          h('tr.total', null, [td('กำไร(ขาดทุน)สะสม', 'label')].concat(IDX.map((i) => td(M(a.rows[i].retained), 'num')))),
        ]),
        K.table([h('tr.head-band', null, [th('ตัวเลขชี้วัดจากงบล่าสุด', 'label'), th('ค่า')])], [
          h('tr', null, [td('เงินทุนหมุนเวียน', 'label'), td(L ? M(L.workingCapital) : '–', 'num')]),
          h('tr', null, [td('อัตราส่วนสภาพคล่อง', 'label'), td(L ? ratio(L.currentRatio) : '–', 'num')]),
          h('tr', null, [td('หนี้สินต่อส่วนของผู้ถือหุ้น', 'label'), td(L ? ratio(L.debtToEquity) : '–', 'num')]),
          h('tr.total', null, [td('งบดุลลงตัว', 'label'),
            td(!a.checked ? 'ยังไม่มีตัวเลขให้ตรวจ' : a.offBalance.length ? 'ไม่ลงตัว ' + a.offBalance.length + ' ปี' : 'ลงตัวทั้ง ' + a.checked + ' ปี', 'num')]),
        ], { class: 'kv' }),
      ]),
    ]);
  }

  // ── ชีต 3 ตารางเพื่อแสดงงบ ────────────────────────────────────────────
  function sheetTaccount(c, no, total) {
    const last = (bag, key) => {
      const arr = (K.state.kase[bag] || {})[key] || [];
      for (let i = arr.length - 1; i >= 0; i--) if (E.num(arr[i]) !== null) return E.num(arr[i]);
      return null;
    };
    const pl = (key) => last('financials', key);
    const bs = (key) => last('balance', key);
    const cap = E.num(K.state.kase.company.paidUpCapital);
    const forb = c && c.forbidden && !c.forbidden.hidden ? c.forbidden.amount : null;
    const tt = (title, rows) => K.table([h('tr.head-band', null, [th(title, 'label'), th('จำนวนเงิน')])],
      rows.map((r) => h('tr', { class: r[2] ? 'total' : '' }, [td(r[0], 'label'), td(r[1], 'num')])), { class: 'kv' });

    return h('div.fsheet', null, [
      sheetHead(no, total, 'ตารางเพื่อแสดงงบ (T-account)', 'ตัวเลขปีล่าสุดที่กรอกไว้'),
      h('div.fsheet-cols', null, [
        tt('DR — รายจ่าย', [
          ['ต้นทุนการขาย', M(pl('cogs'))],
          ['คชจ.การขายและบริหาร', M(pl('sga'))],
          ['รวมค่าใช้จ่าย', M(pl('totalExpense')), true],
          ['กำไรสุทธิ (บัญชี)', M(pl('profitsBeforeTax'))],
          ['รายจ่ายต้องห้าม', forb === null ? 'ไม่แสดง' : M(forb)],
          ['กำไรสุทธิ (ภาษี)', pl('profitsBeforeTax') === null ? '–' : M(pl('profitsBeforeTax') + (forb || 0))],
          ['ภาษีเงินได้', M(pl('taxPaid'))],
          ['กำไรสุทธิหลังภาษี', M(pl('netProfit')), true],
        ]),
        tt('CR — รายได้', [
          ['รายได้หลัก', M(pl('mainRevenue'))],
          ['รายได้อื่นๆ', pl('revenues') === null || pl('mainRevenue') === null ? '–' : M(pl('revenues') - pl('mainRevenue'))],
          ['รายได้รวม', M(pl('revenues')), true],
          ['อัตราภาษีที่ใช้', c ? (c.sme.isSme ? 'SME 0% / 15% / 20%' : 'Non-SME 20% ตลอด') : '–'],
        ]),
      ]),
      h('div.fsheet-gap'),
      h('div.fsheet-cols', null, [
        tt('DR — สินทรัพย์', [
          ['สินค้าคงเหลือ', M(bs('inventory'))],
          ['ลูกหนี้การค้า', M(bs('receivables'))],
          ['ทรัพย์สินหมุนเวียนรวม', M(bs('currentAssets')), true],
          ['อาคาร / ที่ดิน', M(bs('ppe'))],
          ['ทรัพย์สินไม่หมุนเวียนรวม', M(bs('nonCurrentAssets')), true],
          ['รวมสินทรัพย์', M(bs('totalAssets')), true],
        ]),
        tt('CR — หนี้สินและทุน', [
          ['หนี้สินหมุนเวียนรวม', M(bs('currentLiabilities'))],
          ['เจ้าหนี้เงินกู้ยืมระยะยาว', M(bs('nonCurrentLiabilities'))],
          ['ทุนหุ้นสามัญ', M(cap)],
          ['กำไรสะสม', bs('equity') === null || cap === null ? '–' : M(bs('equity') - cap)],
          ['ส่วนของผู้ถือหุ้นรวม', M(bs('equity')), true],
          ['รวมหนี้สินและทุน', M(bs('totalLiabEquity')), true],
        ]),
      ]),
    ]);
  }

  // ── ชีต 4 สรุปผลต่าง ──────────────────────────────────────────────────
  function sheetSummary(c, no, total) {
    const cmp = c.comparison, A = cmp.after, B = cmp.before;
    const pctOf = (d, base) => (base ? Math.abs(d / base * 100).toFixed(1) + '%' : '–');
    const ledger = (title, rows, totalRow) => K.table([h('tr.head-band', null, [th(title, 'label'), th('จำนวนเงิน')])],
      rows.map((r) => h('tr', null, [td(r[0], 'label'), td(r[1], 'num')]))
        .concat([h('tr.total', null, [td(totalRow[0], 'label'), td(totalRow[1], 'num')])]), { class: 'kv' });

    const deltaRow = (no, title, av, bv, diff, base, say) => h('tr', { class: 'total' }, [
      td(no + ' · ' + title, 'label'), td(M(av), 'num'), td(M(bv), 'num'),
      td(M(Math.abs(diff)), 'num'), td(pctOf(diff, base), 'num'), td(say, 'label'),
    ]);

    return h('div.fsheet', null, [
      sheetHead(no, total, 'สรุปผลต่างจาก Keyman', 'เทียบการทำคีย์แมนกับการจ่ายเงินปันผลก้อนเดียวกัน'),
      h('div.fsheet-cols', null, [
        ledger('ทำคีย์แมน', [
          ['เบี้ยประกัน', M(A.premium)],
          ['ภาษีที่บริษัทออกให้แทนกรรมการ', M(A.allTierTax)],
          ['ค่าใช้จ่ายรวมที่บันทึกได้', M(A.totalExpense)],
          ['ประหยัดภาษีนิติบุคคล', (A.citSaving ? '−' : '') + M(A.citSaving)],
          ['ภาษีเงินปันผล', M(A.dividendTax)],
        ], ['เสียภาษีรวม', M(A.netTax)]),
        ledger('จ่ายเป็นเงินปันผล', [
          ['เงินส่วนกำไร', M(B.lumpSum)],
          ['ภาษีบุคคลธรรมดา', M(B.personalTax)],
          ['ค่าใช้จ่ายรวมที่บันทึกได้', '–'],
          ['ภาษีนิติบุคคล', M(B.cit)],
          ['ภาษีเงินปันผล', M(B.dividendTax)],
        ], ['เสียภาษีรวม', M(B.totalTax)]),
      ]),
      h('div.fsheet-gap'),
      K.table([h('tr', null, [th('เทียบสามด้าน', 'label'), th('ทำคีย์แมน'), th('จ่ายเป็นเงินปันผล'), th('ผลต่าง'), th('%'), th('ผลลัพธ์', 'label')])], [
        deltaRow(1, 'ภาษีที่เสียรวม', A.netTax, B.totalTax, cmp.taxDiff, B.totalTax,
          cmp.taxDiff > 0 ? 'เสียภาษีน้อยลง' : cmp.taxDiff < 0 ? 'เสียภาษีมากขึ้น' : 'เท่ากัน'),
        deltaRow(2, 'กรรมการรับเงินเดือน โบนัสจริง', A.directorNet, B.directorNet, cmp.directorNetDiff, B.directorNet,
          cmp.directorNetDiff > 0 ? 'เงินเข้ากรรมการมากขึ้น' : cmp.directorNetDiff < 0 ? 'เงินเข้ากรรมการน้อยลง' : 'เท่ากัน'),
        deltaRow(3, 'เงินเข้าเจ้าของ', A.ownerCash, B.ownerCash, cmp.cashDiff, B.ownerCash,
          cmp.cashDiff > 0 ? 'เงินเข้าเจ้าของมากขึ้น' : cmp.cashDiff < 0 ? 'เงินเข้าเจ้าของน้อยลง' : 'เท่ากัน'),
      ]),
      h('p.fsheet-note', { text: 'เงินก้อนที่ใช้เทียบฝั่งปันผล ' + M(B.lumpSum) + ' บาท · ภาษีเงินปันผลคิด 10% ของเงินก้อนหลังหักภาษีนิติบุคคลแล้ว · ' +
        'ตัวเลขเป็นภาพของปีเดียว ควรกางกระแสเงินสดตลอดอายุการชำระเบี้ยประกอบเสมอ' }),
    ]);
  }

  // เลือกพิมพ์เฉพาะบางชีตได้ — เก็บไว้ในเบราว์เซอร์ ไม่ผูกกับเคส
  K.SHEETS = [
    { id: 'pl', label: 'งบกำไรขาดทุน', build: (c, n, t) => sheetPl(c, n, t) },
    { id: 'bs', label: 'งบดุล', build: (c, n, t) => sheetBs(n, t) },
    { id: 'taccount', label: 'ตารางเพื่อแสดงงบ', build: (c, n, t) => sheetTaccount(c, n, t) },
    { id: 'summary', label: 'สรุปผลต่าง', build: (c, n, t) => sheetSummary(c, n, t) },
  ];
  const ALL = K.SHEETS.map((x) => x.id).join(',');
  K.sheetPick = function () {
    const raw = localStorage.getItem('keyman.sheetPick');
    const ids = (raw === null ? ALL : raw).split(',').filter(Boolean);
    const picked = K.SHEETS.filter((x) => ids.indexOf(x.id) >= 0);
    return picked.length ? picked : K.SHEETS;   // ปิดหมดไม่ได้ ไม่งั้นกดพิมพ์แล้วได้กระดาษเปล่า
  };
  K.toggleSheet = function (id) {
    const cur = K.sheetPick().map((x) => x.id);
    const next = cur.indexOf(id) >= 0 ? cur.filter((x) => x !== id) : K.SHEETS.map((x) => x.id).filter((x) => cur.indexOf(x) >= 0 || x === id);
    if (!next.length) return;   // เหลืออย่างน้อยหนึ่งชีตเสมอ
    localStorage.setItem('keyman.sheetPick', next.join(','));
    K.render();
  };

  K.renderSheets = function (target) {
    const c = K.state.computed;
    if (!c) { target.appendChild(h('p', { text: 'ยังคำนวณไม่ได้' })); return; }
    const picked = K.sheetPick();
    picked.forEach((sh, i) => {
      const node = sh.build(c, i + 1, picked.length);
      if (i === picked.length - 1) node.classList.add('last');
      target.appendChild(node);
    });
  };
})(typeof self !== 'undefined' ? self : this);
