// แท็บ 4 — ค่าตอบแทนกรรมการ (ชีต "ค่าตอบแทนกรรมการ")
(function (root) {
  'use strict';
  const K = root.K, h = K.h, E = root.KeymanEngine;

  function render(main) {
    const k = K.state.kase;
    const rows = [];
    k.directors.forEach((d, i) => {
      const base = 3 + i * 7;   // C4/C5/… ในไฟล์เดิมเรียงเป็นบล็อกละ 7 แถว
      rows.push(h('tr.head-band', null, [
        h('th.label', null, [h('span', { text: 'ค่าตอบแทนกรรมการท่านที่ ' + (i + 1) }), h('span.ref', { text: 'C' + base })]),
        h('th', { colspan: 1, text: d.name || '(ยังไม่ระบุชื่อ)' }),
      ]));
      rows.push(h('tr', null, [K.labelCell('เงินเดือนทั้งปี', 'C' + (base + 1)), K.cellIn('directors.' + i + '.salary', { onchange: () => K.refreshOutputs() })]));
      rows.push(h('tr', null, [K.labelCell('โบนัสทั้งปี', 'C' + (base + 2)), K.cellIn('directors.' + i + '.bonus', { onchange: () => K.refreshOutputs() })]));
      rows.push(h('tr', null, [K.labelCell('ค่าตอบแทนอื่นๆ เช่น ภาษีทุกทอด', 'C' + (base + 3)),
        K.outCell((c) => (c && c.perDirector[i] ? K.money(c.perDirector[i].gross.tax) : '–'), { ref: 'E' + (base + 3) })]));
      rows.push(h('tr', null, [K.labelCell('เบี้ยประกัน', 'C' + (base + 4)), K.cellIn('directors.' + i + '.premiumAllocated', { onchange: () => K.refreshOutputs() })]));
      rows.push(h('tr.total', null, [K.labelCell('รวมทั้งปี'),
        K.outCell((c) => (c && c.perDirector[i] ? K.money(E.n0(d.salary) + E.n0(d.bonus) + c.perDirector[i].gross.tax + E.n0(d.premiumAllocated)) : '–'))]));
      rows.push(h('tr.total', null, [K.labelCell('เฉลี่ย/เดือน', 'C' + (base + 5)),
        K.outCell((c) => (c && c.perDirector[i] ? K.money((E.n0(d.salary) + E.n0(d.bonus) + c.perDirector[i].gross.tax + E.n0(d.premiumAllocated)) / 12) : '–'), { ref: 'E' + (base + 5) })]));
    });

    main.appendChild(K.card('ค่าตอบแทนกรรมการ', 'ชีต ค่าตอบแทนกรรมการ', [
      K.table(null, rows),
      h('p.note', null, [
        'รวมทุกท่าน: เงินเดือน+โบนัส ', K.out((c) => (c ? K.money(c.salaryTotal) : '–')),
        ' · เบี้ยประกัน ', K.out((c) => (c ? K.money(c.premiumTotal) : '–')),
        ' · ภาษีทุกทอด ', K.out((c) => (c ? K.money(c.allTierTaxTotal) : '–')),
        ' · รวมบันทึกเป็นรายจ่ายของบริษัท ', K.out((c) => (c ? K.money(c.recordedExpenseTotal) : '–')),
      ]),
      h('p.hint', { text: 'ค่าตอบแทนอื่นๆ (ภาษีทุกทอด) ดึงมาจากแท็บ 7 อัตโนมัติ — เป็นเงินได้ ม.40(1) ของกรรมการที่ต้องนำส่ง ภ.ง.ด.1 ทุกเดือน' }),
      K.legend(),
    ]));
  }

  K.registerTab(4, 'comp', 'ค่าตอบแทนกรรมการ', render, { num: 4 });
})(typeof self !== 'undefined' ? self : this);
