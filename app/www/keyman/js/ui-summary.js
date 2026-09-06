// แท็บ 8 — สรุปผลต่างจาก Keyman (ชีต "สรุปผลต่างจาก Keyman")
(function (root) {
  'use strict';
  const K = root.K, h = K.h, E = root.KeymanEngine;

  const row = (label, afterFn, beforeFn, cls) => h('tr', { class: cls || '' }, [
    K.labelCell(label),
    K.outCell((c) => (c ? K.money(afterFn(c)) : '–')),
    K.outCell((c) => (c ? K.money(beforeFn(c)) : '–')),
  ]);

  function render(main) {
    main.appendChild(K.card('สรุปผลต่างจาก Keyman', 'ชีต สรุปผลต่างจาก Keyman', [
      h('p.note', null, [
        'After = จ่ายเป็นเบี้ยคีย์แมนให้กรรมการ · Before = ปล่อยเงินก้อนเดียวกันเป็นกำไรแล้วจ่ายเป็นเงินปันผล · ',
        'เงินก้อนที่ใช้เทียบฝั่ง Before = ', K.out((c) => (c ? K.money(c.comparison.before.lumpSum) : '–')), ' บาท',
      ]),
      K.table([h('tr.head-band', null, [h('th.label', { text: 'รายการ' }), h('th', { text: 'After (ทำคีย์แมน)' }), h('th', { text: 'Before (ปันผล)' })])], [
        row('เบี้ยประกัน / เงินส่วนกำไร', (c) => c.comparison.after.premium, (c) => c.comparison.before.lumpSum),
        row('ภาษีทุกทอด / ภาษีบุคคล', (c) => c.comparison.after.allTierTax, (c) => c.comparison.before.personalTax),
        row('ค่าใช้จ่ายรวมที่บันทึกได้', (c) => c.comparison.after.totalExpense, () => 0),
        row('ภาษีเงินได้นิติบุคคล', (c) => -c.comparison.after.citSaving, (c) => c.comparison.before.cit),
        row('ภาษีเงินปันผล', () => 0, (c) => c.comparison.before.dividendTax),
        row('ภาษีที่เสียสุทธิ', (c) => c.comparison.after.netTax, (c) => c.comparison.before.totalTax, 'total'),
        row('เงินถึงมือเจ้าของ', (c) => c.comparison.after.ownerCash, (c) => c.comparison.before.ownerCash, 'total'),
      ]),
      h('p.note.strong', null, [
        'ผลต่างภาษีที่เสีย ', K.out((c) => (c ? K.money(c.comparison.taxDiff) : '–')), ' บาท',
        ' · ผลต่างเงินถึงมือเจ้าของ ', K.out((c) => (c ? K.money(c.comparison.cashDiff) : '–')), ' บาท',
        ' · คิดเป็น ', K.out((c) => (c && c.comparison.before.ownerCash ? (c.comparison.cashDiff / c.comparison.before.ownerCash * 100).toFixed(2) + '%' : '–')),
        ' ของเงินที่เจ้าของได้ฝั่ง Before',
      ]),
      h('p', null, [K.out((c) => {
        if (!c) return '';
        if (!c.comparison.noTaxBenefit) return '';
        const rec = c.recommendation || {};
        const ceil = rec.available ? rec.suggested : null;
        return 'บริษัทนี้ไม่ได้เสียภาษีเงินได้นิติบุคคลเลยในปีล่าสุด การทำประกันคีย์แมนจึงไม่มีผลประหยัดภาษีให้คำนวณ ' +
          'เบี้ยที่สมเหตุสมผลอยู่ที่ราว ' + (ceil === null ? '–' : K.money(ceil)) + ' บาทต่อปี ' +
          '(คิดจากฐานค่าใช้จ่ายในการขายและบริการ) ควรเสนอด้วยเหตุผลด้านสวัสดิการและการรักษาคนสำคัญ ไม่ใช่ด้านภาษี';
      }, { class: 'pill warn' })]),
      h('h3', { style: 'font-size:14px;margin:12px 0 4px', text: 'ข้อควรระวังที่ต้องอ่านคู่กับตัวเลข' }),
      h('ul', { style: 'font-size:12.5px;color:var(--muted);padding-left:18px' }, [K.out((c) => {
        const ul = h('span');
        (c ? c.comparison.caveats : []).forEach((t) => ul.appendChild(h('li', { text: t })));
        return ul;
      })]),
      h('p.note', null, ['สรุปสถานะการออกใบเสนอ: ', K.out((c) => (c ? (c.checks.canQuote ? 'ออกใบเสนอได้ (ไม่มีข้อตรวจสอบระดับบล็อกค้างอยู่)' : 'ยังออกใบเสนอไม่ได้ — มีข้อบล็อก ' + c.checks.blocking.length + ' ข้อ ดูรายละเอียดที่แถบด้านบน') : '–'))]),
      K.disclaimer(),
    ]));
  }

  K.registerTab(8, 'summary', 'สรุปผลต่าง', render, { num: 8 });
})(typeof self !== 'undefined' ? self : this);
