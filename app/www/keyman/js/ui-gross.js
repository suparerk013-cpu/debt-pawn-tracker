// แท็บ 7 — ภาษีทุกทอด (ชีต "ภาษีทุกทอดกรรมการ1..N") มีแท็บย่อยรายกรรมการ
// การนับคอลัมน์ตาม Excel: E (เงินเดือนอย่างเดียว) → F (เงินเดือน+เบี้ย) → ทอดที่ 1 → 2 → …
// ทอดที่ 1 ดึงภาษีมาจากคอลัมน์ F (H9 = F42) จึงห้ามเริ่มนับ "ทอดที่ 1" ที่คอลัมน์ F
(function (root) {
  'use strict';
  const K = root.K, h = K.h, E = root.KeymanEngine;

  K.state.dirTab = 0;

  // ผลต่างสองทอดสุดท้ายเป็นหลักฐานว่าลู่เข้าแล้ว จึงต้องเห็นทศนิยมจริง ไม่ใช่ปัดเป็นสตางค์
  const delta = (v) => Number(v || 0).toLocaleString('th-TH', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

  function render(main) {
    const k = K.state.kase;
    const c = K.state.computed;
    if (K.state.dirTab >= k.directors.length) K.state.dirTab = 0;
    const i = K.state.dirTab;
    const d = k.directors[i];
    const g = c.perDirector[i].gross;
    const collapsed = localStorage.getItem('keyman.collapseAllowances') === '1';

    // แท็บย่อยรายกรรมการ
    main.appendChild(h('nav.tabs', { style: 'background:transparent;border:0;padding:0 0 8px' },
      k.directors.map((dd, j) => h('button', {
        class: j === i ? 'on' : '',
        text: 'กรรมการ ' + (j + 1) + (dd.name ? ' — ' + dd.name : ''),
        onclick: () => { K.state.dirTab = j; K.render(); },
      }))));

    const cols = [g.columnE].concat(g.trace);      // E, F, ทอดที่ 1..N
    const colLabel = (col, idx) => idx === 0 ? 'รายได้ (เงินเดือนอย่างเดียว)' : idx === 1 ? 'รายได้ + สวัสดิการ' : 'ออกให้ทอดที่ ' + (idx - 1);
    const colRef = (idx) => idx === 0 ? 'E' : idx === 1 ? 'F' : E.columnLetter(6 + idx); // E, F, H, I, J…

    const head = h('tr.head-band', null, [h('th.label', { text: 'ประเภทเงินได้' })]
      .concat(cols.map((col, idx) => h('th', null, [h('span', { text: colLabel(col, idx) }), h('span.ref', { text: colRef(idx) })]))));

    const rows = [];
    const dataRow = (label, ref, fn, cls) => rows.push(h('tr', { class: cls || '' },
      [K.labelCell(label, ref)].concat(cols.map((col, idx) => h('td', { class: 'calc num' }, K.money(fn(col, idx)))))));

    dataRow('เงินเดือน + โบนัส', 'B7', (col) => col.salaryBonus);
    dataRow('สวัสดิการพิเศษอื่น เช่น ประกัน Keyman', 'B8', (col) => col.keymanPremium);
    dataRow('ภาษีที่ออกแทน', 'B9', (col) => col.taxCarried);
    dataRow('รวมรายได้', 'D10', (col) => col.totalIncome, 'total');
    dataRow('หัก: ค่าใช้จ่าย 50% แต่สูงสุดไม่เกิน 100,000 บาท', 'D12', (col) => -col.expense);

    // ── ค่าลดหย่อน 19 รายการ ─────────────────────────────────────────────
    rows.push(h('tr', null, [h('th.label', { text: 'รายการค่าลดหย่อน' })]
      .concat(cols.map((col, idx) => h('th', { text: idx === 0 ? 'ค่าลดหย่อน' : 'ค่าลดหย่อนใหม่' })))));

    E.ALLOWANCE_FIELDS.forEach((f) => {
      const inp = K.input('directors.' + i + '.allowances.' + f.key, { onchange: () => K.refreshOutputs() });
      inp.addEventListener('change', () => K.render());
      const label = h('td.label', null, [
        h('span', { text: f.label }),
        f.note ? h('span.badge', { text: f.note }) : null,
        h('span.ref', { text: f.ref }),
      ]);
      const cells = [label, h('td', null, [inp])];
      if (collapsed) {
        cells.push(h('td.calc.num', { colspan: cols.length - 1, text: 'ใช้ค่าเดียวกันทุกคอลัมน์' }));
      } else {
        for (let x = 1; x < cols.length; x++) cells.push(h('td.calc.num', { text: K.money(E.n0(d.allowances[f.key])) }));
      }
      rows.push(h('tr', null, cells));
    });

    dataRow('รวมค่าลดหย่อน', 'D34', (col) => col.allowanceTotal, 'total');
    dataRow('เงินได้หลังหักค่าลดหย่อน', 'D36', (col) => col.afterAllowance, 'total');

    rows.push(h('tr', null, [h('th.label', { text: 'ส่วนของเงินบริจาค' })].concat(cols.map(() => h('th', { text: '' })))));
    E.DONATION_FIELDS.forEach((f) => {
      const inp = K.input('directors.' + i + '.donations.' + f.key, { onchange: () => K.refreshOutputs() });
      inp.addEventListener('change', () => K.render());
      const cells = [K.labelCell(f.label, f.ref), h('td', null, [inp])];
      if (collapsed) cells.push(h('td.calc.num', { colspan: cols.length - 1, text: 'ใช้ค่าเดียวกันทุกคอลัมน์' }));
      else for (let x = 1; x < cols.length; x++) cells.push(h('td.calc.num', { text: K.money(E.n0((d.donations || {})[f.key])) }));
      rows.push(h('tr', null, cells));
    });

    dataRow('เงินได้สุทธิสำหรับคำนวนภาษี', 'D40', (col) => col.netIncome, 'total');
    dataRow('ภาษีที่เสีย', 'D42', (col) => col.tax, 'total');
    rows.push(h('tr', null, [K.labelCell('อัตราภาษีที่แท้จริง', 'E43')]
      .concat(cols.map((col) => h('td.calc.num', { text: K.ratio(col.effectiveRate) })))));

    main.appendChild(K.card('ภาษีทุกทอด — ' + (d.name || 'กรรมการท่านที่ ' + (i + 1)), 'ชีต ภาษีทุกทอดกรรมการ' + (i + 1), [
      h('p.note', { text: '*กรอกเฉพาะช่องที่เป็นสีเหลือง — เงินเดือน/โบนัส/เบี้ยแก้ที่แท็บ 1 หรือ 4 ค่าลดหย่อนแก้ได้ที่นี่' }),
      K.table([head], rows),
      h('div.btnrow', null, [
        h('button.btn', {
          text: collapsed ? 'กางค่าลดหย่อนทุกคอลัมน์ (แบบ Excel)' : 'ยุบค่าลดหย่อนให้เหลือคอลัมน์เดียว',
          onclick: () => { localStorage.setItem('keyman.collapseAllowances', collapsed ? '0' : '1'); K.render(); },
        }),
      ]),
      h('p.note.strong', {
        text: g.mode === 'once'
          ? `คำนวณ 2 รอบแล้วหยุด · ผลต่างสองรอบสุดท้าย ${delta(g.lastDelta)} บาท · ป.96/2543 ข้อ 1(8) ออกให้ครั้งเดียว`
          : `${g.converged ? 'ลู่เข้าที่ทอดที่ ' + g.tiers : '⚠️ ยังไม่ลู่เข้าหลังครบ ' + E.MAX_ROUNDS + ' รอบ'} · ผลต่างสองทอดสุดท้าย ${delta(g.lastDelta)} บาท · ป.96/2543 ข้อ 1(7) ออกให้ตลอดไป`,
      }),
      h('p.hint', { text: 'กางเท่าที่ลู่เข้าจริง ไม่ได้กาง 20 ทอดตายตัวเหมือนไฟล์เดิม — คอลัมน์ E คือฝั่ง Before (เงินเดือนอย่างเดียว) ส่วนคอลัมน์ F คือเงินเดือน+เบี้ยแต่ยังไม่มีภาษีออกให้' }),
      K.legend(),
    ]));

    // ── สรุปการบันทึกค่าใช้จ่าย ─────────────────────────────────────────
    main.appendChild(K.card('สรุปการบันทึกค่าใช้จ่าย', 'ชีต ภาษีทุกทอดกรรมการ' + (i + 1) + ' แถว 44–49', [
      K.table(null, [
        h('tr', null, [K.labelCell('ภาษีทุกทอดที่บริษัทฯ จ่าย', 'D45'), h('td.calc.num', { text: K.money(g.tax) })]),
        h('tr', null, [K.labelCell('ภาษีบุคคลธรรมดาที่บ.จ่ายให้', 'D46'), h('td.calc.num', { text: K.money(g.salaryOnlyTax) })]),
        h('tr', null, [K.labelCell('ดังนั้น ภาษีบริษัทฯ ออกให้กรรมการ', 'D47'), h('td.calc.num', { text: K.money(g.tax) })]),
        h('tr', null, [K.labelCell('บวกค่าเบี้ยประกันภัยที่บริษัทฯ จ่าย', 'D48'), h('td.calc.num', { text: K.money(E.n0(d.premiumAllocated)) })]),
        h('tr.total', null, [K.labelCell('รวมบันทึกเป็นรายจ่ายของบริษัท', 'D49'), h('td.calc.num', { text: K.money(g.tax + E.n0(d.premiumAllocated)) })]),
        h('tr.total', null, [K.labelCell('ยอดหัก ณ ที่จ่ายต่อเดือน (ภ.ง.ด.1)', 'เพิ่มใหม่'), h('td.calc.num', { text: K.money(g.monthlyWithholding) })]),
      ]),
      h('p.hint', { text: 'ความผิดพลาดที่พบบ่อยคือคำนวณภาษีหัก ณ ที่จ่ายให้เฉพาะปีแรกแล้วปีต่อไปลืม — ยอดต่อเดือนนี้ต้องนำส่งทุกเดือนตลอดอายุการชำระเบี้ย' }),
      K.disclaimer(),
    ]));
  }

  K.registerTab(7, 'gross', 'ภาษีทุกทอด', render, { num: 7 });
})(typeof self !== 'undefined' ? self : this);
