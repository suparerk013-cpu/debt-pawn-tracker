// แท็บ 7 — ภาษีทุกทอด (ชีต "ภาษีทุกทอดกรรมการ1..N") มีแท็บย่อยรายกรรมการ
// ────────────────────────────────────────────────────────────────────────────
// การนับคอลัมน์ตาม Excel: E (เงินเดือนอย่างเดียว) → F (เงินเดือน+เบี้ย) → ทอดที่ 1 → 2 → …
// ทอดที่ 1 ดึงภาษีมาจากคอลัมน์ F (H9 = F42) จึงห้ามเริ่มนับ "ทอดที่ 1" ที่คอลัมน์ F
//
// หน้าจอปกติแสดง "ตารางสุดท้าย" คือทอดที่ลู่เข้าแล้วคอลัมน์เดียว เพราะนั่นคือตัวเลข
// ที่เอาไปใช้จริง — กดสวิตช์เพื่อกางทุกทอดแบบ Excel ไว้ตรวจทานได้
(function (root) {
  'use strict';
  const K = root.K, h = K.h, E = root.KeymanEngine;

  K.state.dirTab = 0;
  const delta = (v) => Number(v || 0).toLocaleString('th-TH', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  const view = () => (localStorage.getItem('keyman.grossView') === 'all' ? 'all' : 'final');
  // ชีตแสดงค่าลดหย่อนครบทุกแถวเสมอ แอปจึงตั้งต้นแบบเดียวกัน (กดย่อเหลือเฉพาะที่กรอกได้)
  const allowView = () => (localStorage.getItem('keyman.allowView') === 'used' ? 'used' : 'all');
  const setPref = (k, v) => { localStorage.setItem(k, v); K.render(); };

  function render(main) {
    const k = K.state.kase;
    const c = K.state.computed;
    if (K.state.dirTab >= k.directors.length) K.state.dirTab = 0;
    const i = K.state.dirTab;
    const d = k.directors[i];
    const g = c.perDirector[i].gross;
    const auto = K.isAutoAllocation();

    // ── แท็บย่อยรายกรรมการ ───────────────────────────────────────────────
    main.appendChild(h('nav.subtabs', null, k.directors.map((dd, j) => {
      const gg = c.perDirector[j].gross;
      return h('button', { class: j === i ? 'on' : '', onclick: () => { K.state.dirTab = j; K.render(); } }, [
        h('span.who', { text: dd.name || 'กรรมการท่านที่ ' + (j + 1) }),
        h('span.amt', { text: 'ภาษีทุกทอด ' + K.money(gg.tax) + ' บาท' }),
      ]);
    })));

    // ── ช่องกรอกของกรรมการท่านนี้ ────────────────────────────────────────
    const money = (path) => {
      const inp = K.input(path, { onchange: () => K.refreshOutputs() });
      inp.addEventListener('change', () => K.render());
      return inp;
    };
    const premiumField = auto
      ? h('div', null, [
          h('input.cell.num', { value: K.money(d.premiumAllocated), disabled: true }),
          h('span.hint', { text: 'มาจาก "ค่าเบี้ยประกันเฉลี่ยคนละ" (งบกำไรขาดทุน!C22) = เบี้ยรวม ÷ จำนวนกรรมการ' }),
        ])
      : h('div', null, [money('directors.' + i + '.premiumAllocated'), h('span.hint', { text: 'โหมดจัดสรรเอง — กรอกเบี้ยของท่านนี้ได้โดยตรง' })]);

    main.appendChild(K.card('ช่องกรอกของ ' + (d.name || 'กรรมการท่านที่ ' + (i + 1)), 'ชีต ภาษีทุกทอดกรรมการ' + (i + 1) + ' · E7 / F8', [
      h('div.verdict', null, [
        h('div.k', { text: 'ภาษีทุกทอดที่บริษัทออกให้ท่านนี้ ปีละ' }),
        h('div.v', null, [K.money(g.tax), h('span.unit', { text: 'บาท' })]),
        h('div.sub', {
          text: 'ถ้ารับเงินเดือนอย่างเดียวเสีย ' + K.money(g.salaryOnlyTax) + ' บาท · บริษัทรับภาระเพิ่ม ' +
            K.money(g.tax - g.salaryOnlyTax) + ' บาท · นำส่ง ภ.ง.ด.1 เดือนละ ' + K.money(g.monthlyWithholding) + ' บาท',
        }),
        h('div.side', null, [h('span', {
          class: 'pill ' + (g.converged ? 'ok' : 'block'),
          text: g.converged ? '✓ ลู่เข้าที่ทอดที่ ' + g.tiers : '⛔ ยังไม่ลู่เข้า',
        })]),
      ]),
      h('div.grid2', null, [
        h('label.field', null, [h('span.lbl', null, ['เงินเดือนทั้งปี (บาท)', h('span.ref', { text: 'E7' })]), money('directors.' + i + '.salary')]),
        h('label.field', null, [h('span.lbl', { text: 'โบนัสทั้งปี (บาท)' }), money('directors.' + i + '.bonus')]),
        h('label.field', null, [
          h('span.lbl', null, ['เบี้ยประกันคีย์แมนของท่านนี้ (บาท)', h('span.ref', { text: 'F8' }),
            auto ? h('span.badge.auto', { text: 'อัตโนมัติ' }) : null]),
          premiumField,
        ]),
        h('label.field', null, [h('span.lbl', { text: 'เกณฑ์ตามระดับตำแหน่ง (CHK-06)' }), K.input('directors.' + i + '.positionCriteria', { kind: 'text' })]),
      ]),
      h('p.hint', { text: 'เปลี่ยนโหมดจัดสรรเบี้ย (เฉลี่ยเท่ากัน / กรอกรายคนเอง) ได้ที่แท็บ 2 งบกำไรขาดทุน หรือแท็บ 1 ข้อมูลบริษัท' }),
    ]));

    // ── ตารางคำนวณ ──────────────────────────────────────────────────────
    // มุมมองปกติวางคอลัมน์แบบเดียวกับที่ใช้จริงในไฟล์ Excel (ซ่อนทอดกลางไว้):
    //   E = รายได้ (เงินเดือนอย่างเดียว) · F = รายได้ + สวัสดิการ · ทอดสุดท้ายที่ลู่เข้าแล้ว
    // กด "กางทุกทอด" เพื่อดูทีละทอดตั้งแต่ทอดที่ 1
    const allCols = view() === 'all';
    const lastTier = g.trace[g.trace.length - 1];
    const cols = allCols
      ? [g.columnE].concat(g.trace)
      : (g.trace.length > 1 ? [g.columnE, g.trace[0], lastTier] : [g.columnE, g.trace[0]]);
    const isFinalCol = (idx) => !allCols ? (idx === 2) : (idx === cols.length - 1 && cols.length > 2);
    const colLabel = (idx) => {
      if (allCols) return idx === 0 ? 'รายได้' : idx === 1 ? 'รายได้ + สวัสดิการ' : 'ออกให้ทอดที่ ' + (idx - 1);
      return idx === 0 ? 'รายได้' : idx === 1 ? 'รายได้ + สวัสดิการ' : 'ออกให้ทอดที่ ' + g.tiers;
    };
    const colSub = (idx) => (idx === 0 ? 'เงินเดือนอย่างเดียว' : idx === 1 ? 'ยังไม่มีภาษีออกให้' : isFinalCol(idx) ? 'ลู่เข้าแล้ว' : '');
    const colRef = (idx) => {
      if (idx === 0) return 'E';
      if (idx === 1) return 'F';
      return E.columnLetter(5 + (allCols ? idx : g.trace.length));   // ทอดที่ 1 = คอลัมน์ H ของ Excel
    };

    const head = h('tr.head-band', null, [h('th.label', { text: 'ประเภทเงินได้' })]
      .concat(cols.map((col, idx) => h('th', null, [
        h('span', { text: colLabel(idx) }),
        colSub(idx) ? h('span', { style: 'display:block;font-weight:400;font-size:11px;opacity:.8', text: colSub(idx) }) : null,
        h('span.ref', { text: colRef(idx) }),
      ]))));

    const rows = [];
    const sectionRow = (text, ref) => rows.push(h('tr.section', null,
      [h('th.label', null, [h('span', { text }), ref ? h('span.ref', { text: ref }) : null])]
        .concat(cols.map(() => h('th', { text: '' })))));
    // cellClass ให้สีตามธรรมเนียมไฟล์เดิม (แถวรวม = ส้มอ่อน, ภาษีที่เสีย = เขียว/แดงที่ทอดสุดท้าย)
    const dataRow = (label, ref, fn, cls, cellClass) => rows.push(h('tr', { class: cls || '' },
      [K.labelCell(label, ref)].concat(cols.map((col, idx) =>
        h('td', { class: 'calc num ' + (cellClass ? cellClass(idx) : '') }, K.money(fn(col, idx)))))));

    dataRow('เงินเดือน + โบนัส', 'B7', (col) => col.salaryBonus);
    dataRow('สวัสดิการพิเศษอื่น เช่น ประกัน Keyman', 'B8', (col) => col.keymanPremium);
    dataRow('ภาษีที่ออกแทน', 'B9', (col) => col.taxCarried);
    dataRow('รวมรายได้', 'D10', (col) => col.totalIncome, 'total', () => 'sum');
    dataRow('หัก: ค่าใช้จ่าย 50% แต่สูงสุดไม่เกิน 100,000 บาท', 'D12', (col) => -col.expense, '', () => 'sum');

    // ── ค่าลดหย่อน 19 รายการ ตามลำดับแถว B15–B33 ของชีต ──────────────────
    // ชีตตีกรอบสีคร่อมกลุ่มที่มีเพดานรวม แล้วเขียน "รวมกันไม่เกิน …" ไว้ข้าง ๆ
    // แอปทำเป็นเส้นสีข้างแถว + แถวยอดรวมกลุ่มที่เปลี่ยนเป็นสีแดงเมื่อเกินเพดาน
    const used = (f) => f.key === 'personal' || E.n0((d.allowances || {})[f.key]) !== 0;
    const shown = allowView() === 'all' ? E.ALLOWANCE_FIELDS : E.ALLOWANCE_FIELDS.filter(used);
    const GROUP_LABEL = { lifeHealth: 'ประกันชีวิต + ประกันสุขภาพตนเอง', retirement: 'กองทุนเพื่อการเกษียณและประกันบำนาญ' };
    const sums = E.sumAllowances(d.allowances, K.T.tableFor(k.taxYear));
    sectionRow('รายการค่าลดหย่อน', 'B15');

    const groupSumRow = (gk) => {
      const total = sums.groups[gk] || 0;
      const counted = sums.groupsCounted[gk] || 0;
      const cap = sums.caps[gk];
      const over = cap !== undefined && total > cap;
      rows.push(h('tr', { class: 'grpsum ' + (over ? 'over' : '') }, [
        h('td.label', null, [
          h('span', { text: 'รวมกลุ่ม ' + GROUP_LABEL[gk] }),
          h('span.badge', { text: over ? 'เกินเพดาน ' + K.money(cap, '–') : 'เพดาน ' + K.money(cap, '–') }),
        ]),
        h('td.num', null, [
          h('span', { text: K.money(total) }),
          over ? h('small', { style: 'display:block;font-weight:600', text: 'หักได้จริง ' + K.money(counted) }) : null,
        ]),
      ].concat(cols.slice(1).map(() => h('td', { text: '' })))));
    };

    shown.forEach((f, n) => {
      const inp = K.input('directors.' + i + '.allowances.' + f.key, { onchange: () => K.refreshOutputs() });
      inp.addEventListener('change', () => K.render());
      const label = h('td.label', null, [
        h('span', { text: f.label }),
        f.note ? h('span.badge', { text: f.note }) : null,
        h('span.ref', { text: f.ref }),
      ]);
      const cells = [label, h('td', null, [inp])];
      for (let x = 1; x < cols.length; x++) cells.push(h('td.calc.num', { text: K.money(E.n0((d.allowances || {})[f.key])) }));
      rows.push(h('tr', { class: f.group ? 'grp grp-' + f.group : '' }, cells));
      // ปิดท้ายกลุ่มเมื่อแถวถัดไปไม่ได้อยู่กลุ่มเดียวกันแล้ว
      const next = shown[n + 1];
      if (f.group && (!next || next.group !== f.group)) groupSumRow(f.group);
    });

    dataRow('รวมค่าลดหย่อน', 'D34', (col) => col.allowanceTotal, 'total', () => 'sum');
    dataRow('เงินได้หลังหักค่าลดหย่อน', 'D36', (col) => col.afterAllowance, 'total', () => 'sum');

    sectionRow('ส่วนของเงินบริจาค', 'B38');
    E.DONATION_FIELDS.forEach((f) => {
      const inp = K.input('directors.' + i + '.donations.' + f.key, { onchange: () => K.refreshOutputs() });
      inp.addEventListener('change', () => K.render());
      const cells = [K.labelCell(f.label, f.ref), h('td', null, [inp])];
      for (let x = 1; x < cols.length; x++) cells.push(h('td.calc.num', { text: K.money(E.n0((d.donations || {})[f.key])) }));
      rows.push(h('tr', null, cells));
    });

    dataRow('เงินได้สุทธิสำหรับคำนวนภาษี', 'D40', (col) => col.netIncome, 'total', () => 'sum');
    dataRow('ภาษีที่เสีย', 'D42', (col) => col.tax, 'total', (idx) => (isFinalCol(idx) ? 'tax-final' : 'tax-base'));
    rows.push(h('tr', null, [K.labelCell('อัตราภาษีที่แท้จริง', 'E43')]
      .concat(cols.map((col, idx) => h('td', { class: 'calc num rate' }, K.ratio(col.effectiveRate))))));

    const convergeText = g.mode === 'once'
      ? `คำนวณ 2 รอบแล้วหยุด · ผลต่างสองรอบสุดท้าย ${delta(g.lastDelta)} บาท · ป.96/2543 ข้อ 1(8) ออกให้ครั้งเดียว`
      : `${g.converged ? '✓ ลู่เข้าที่ทอดที่ ' + g.tiers : '⛔ ยังไม่ลู่เข้าหลังครบ ' + E.MAX_ROUNDS + ' รอบ'} · ผลต่างสองทอดสุดท้าย ${delta(g.lastDelta)} บาท · ป.96/2543 ข้อ 1(7) ออกให้ตลอดไป`;

    const tableNode = K.table([head], rows);
    // บนจอแคบ คอลัมน์ที่สำคัญที่สุดคือทอดสุดท้าย จึงเลื่อนตารางไปสุดขวาให้ตั้งแต่แรก
    // (คอลัมน์ชื่อรายการตรึงอยู่ซ้ายอยู่แล้ว เลื่อนกลับมาดูคอลัมน์ E/F ได้ตลอด)
    if (!allCols && window.innerWidth < 620) {
      requestAnimationFrame(() => { tableNode.scrollLeft = tableNode.scrollWidth; });
    }
    main.appendChild(K.card(allCols ? 'ตารางภาษีทุกทอด (กางทุกทอดแบบ Excel)' : 'ตารางสุดท้าย — ทอดที่ลู่เข้าแล้ว', 'ชีต ภาษีทุกทอดกรรมการ' + (i + 1), [
      h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px' }, [
        K.switch2([{ value: 'final', label: 'ตารางสุดท้าย' }, { value: 'all', label: 'กางทุกทอด' }], view(), (v) => setPref('keyman.grossView', v)),
        K.switch2([{ value: 'all', label: 'ค่าลดหย่อนครบ 19 แถว' }, { value: 'used', label: 'เฉพาะที่กรอก' }],
          allowView(), (v) => setPref('keyman.allowView', v)),
        h('span.hint', { text: 'กรอกได้เฉพาะช่องพื้นสีเหลืองเท่านั้น', style: 'margin:0 0 0 auto' }),
      ]),
      tableNode,
      K.callout(g.converged ? 'ok' : 'block', convergeText),
      h('p.hint', {
        text: allCols
          ? 'คอลัมน์ E คือฝั่ง Before (เงินเดือนอย่างเดียว) · คอลัมน์ F คือเงินเดือน+เบี้ยแต่ยังไม่มีภาษีออกให้ · ทอดที่ 1 ดึงภาษีมาจากคอลัมน์ F แล้ววนต่อจนลู่เข้า (ไม่กาง 20 ทอดตายตัวเหมือนไฟล์เดิม)'
          : 'วางคอลัมน์แบบเดียวกับที่เปิดใช้จริงในไฟล์ Excel — E รายได้ · F รายได้+สวัสดิการ · แล้วข้ามไปทอดสุดท้ายที่ลู่เข้าแล้ว (ทอดกลางซ่อนไว้ กด "กางทุกทอด" เพื่อดู) ' +
            'ตัวเลขคอลัมน์สุดท้ายคือชุดที่เอาไปบันทึกบัญชีและนำส่ง ภ.ง.ด.1 จริง',
      }),
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
