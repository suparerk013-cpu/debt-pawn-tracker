// แท็บ 4 — ค่าตอบแทนกรรมการ (ชีต "ค่าตอบแทนกรรมการ")
// ในไฟล์เดิม ช่องเบี้ยประกันของทุกท่านคือสูตร =งบกำไรขาดทุน!C22 (เบี้ยเฉลี่ยคนละ)
// ที่นี่ทำเหมือนกันเมื่ออยู่โหมด "เฉลี่ยเท่ากันทุกท่าน" และเปิดให้กรอกเองเมื่อสลับเป็นโหมดจัดสรรรายคน
(function (root) {
  'use strict';
  const K = root.K, h = K.h, E = root.KeymanEngine;

  const totalOf = (d, g) => E.n0(d.salary) + E.n0(d.bonus) + g.tax + E.n0(d.premiumAllocated);

  function render(main) {
    const k = K.state.kase;
    const c = K.state.computed;
    const auto = K.isAutoAllocation();

    main.appendChild(K.card('ค่าตอบแทนกรรมการ', 'ชีต ค่าตอบแทนกรรมการ', [
      K.stats([
        { label: 'เงินเดือน + โบนัส รวมทุกท่าน', value: (cc) => (cc ? K.money(cc.salaryTotal) + ' บาท' : '–') },
        { label: 'เบี้ยประกันรวม', value: (cc) => (cc ? K.money(cc.premiumTotal) + ' บาท' : '–'),
          note: auto ? 'เฉลี่ยคนละ ' + K.money(k.directors.length ? E.n0(k.policy.premiumTotal) / k.directors.length : null) : 'จัดสรรรายคนเอง' },
        { label: 'ภาษีทุกทอดที่บริษัทออกให้', value: (cc) => (cc ? K.money(cc.allTierTaxTotal) + ' บาท' : '–') },
        { label: 'รวมบันทึกเป็นรายจ่ายของบริษัท', tone: 'accent', value: (cc) => (cc ? K.money(cc.recordedExpenseTotal) + ' บาท' : '–') },
      ]),
      h('p.hint', {
        text: auto
          ? 'ช่อง "เบี้ยประกัน" ของทุกท่านมาจาก "ค่าเบี้ยประกันเฉลี่ยคนละ" (งบกำไรขาดทุน!C22) เหมือนสูตรในไฟล์ Excel — อยากกรอกรายคนเองให้สลับโหมดที่แท็บ 1 หรือแท็บ 2'
          : 'โหมดจัดสรรรายคนเอง — กรอกเบี้ยของแต่ละท่านได้ตรงตาราง ยอดรวมต้องเท่ากับเบี้ยรวมพอดี (CHK-06)',
      }),
    ]));

    // ตารางเทียบทุกท่านในมุมเดียว (ของใหม่ — ไฟล์เดิมแยกเป็นบล็อกละท่าน)
    main.appendChild(K.card('เทียบค่าตอบแทนทุกท่าน', 'มุมมองรวม (ของใหม่)', [
      K.table([h('tr.head-band', null, [
        h('th.label', { text: 'กรรมการ' }), h('th', { text: 'เงินเดือนทั้งปี' }), h('th', { text: 'โบนัสทั้งปี' }),
        h('th', { text: 'ภาษีทุกทอด' }), h('th', { text: 'เบี้ยประกัน' }), h('th', { text: 'รวมทั้งปี' }), h('th', { text: 'เฉลี่ย/เดือน' }),
      ])], k.directors.map((d, i) => {
        const g = c.perDirector[i].gross;
        return h('tr', null, [
          h('td.label', null, [h('span', { text: d.name || 'กรรมการท่านที่ ' + (i + 1) }),
            d.position ? h('span.badge', { text: d.position }) : null]),
          h('td.calc.num', { text: K.money(d.salary) }),
          h('td.calc.num', { text: K.money(d.bonus) }),
          h('td.calc.num', { text: K.money(g.tax) }),
          h('td.calc.num', { text: K.money(d.premiumAllocated) }),
          h('td.calc.num', { text: K.money(totalOf(d, g)) }),
          h('td.calc.num', { text: K.money(totalOf(d, g) / 12) }),
        ]);
      }).concat([h('tr.total', null, [
        h('th.label', { text: 'รวมทุกท่าน' }),   // หมายเหตุ: cc.salaryTotal ของเอนจิน = เงินเดือน + โบนัส
        K.outCell((cc) => K.money(k.directors.reduce((s, d) => s + E.n0(d.salary), 0))),
        K.outCell((cc) => K.money(k.directors.reduce((s, d) => s + E.n0(d.bonus), 0))),
        K.outCell((cc) => (cc ? K.money(cc.allTierTaxTotal) : '–')),
        K.outCell((cc) => (cc ? K.money(cc.premiumTotal) : '–')),
        K.outCell((cc) => (cc ? K.money(cc.salaryTotal + cc.allTierTaxTotal + cc.premiumTotal) : '–')),
        K.outCell((cc) => (cc ? K.money((cc.salaryTotal + cc.allTierTaxTotal + cc.premiumTotal) / 12) : '–')),
      ])])),
    ]));

    // บล็อกรายท่านแบบไฟล์เดิม (แถวเดิม ลำดับเดิม)
    k.directors.forEach((d, i) => {
      const g = c.perDirector[i].gross;
      const base = 3 + i * 7;
      const premiumCell = auto
        ? h('td.calc.num', null, [K.money(d.premiumAllocated), h('span.ref', { text: 'งบกำไรขาดทุน!C22' })])
        : K.cellIn('directors.' + i + '.premiumAllocated', { onchange: () => K.refreshOutputs() });
      main.appendChild(K.card('ค่าตอบแทนกรรมการท่านที่ ' + (i + 1) + (d.name ? ' — ' + d.name : ''), 'C' + base, [
        K.table(null, [
          h('tr', null, [K.labelCell('เงินเดือนทั้งปี', 'C' + (base + 1)), K.cellIn('directors.' + i + '.salary', { onchange: () => K.refreshOutputs() })]),
          h('tr', null, [K.labelCell('โบนัสทั้งปี', 'C' + (base + 2)), K.cellIn('directors.' + i + '.bonus', { onchange: () => K.refreshOutputs() })]),
          h('tr', null, [K.labelCell('ค่าตอบแทนอื่นๆ เช่น ภาษีทุกทอด', 'C' + (base + 3)),
            K.outCell((cc) => (cc && cc.perDirector[i] ? K.money(cc.perDirector[i].gross.tax) : '–'), { ref: 'E' + (base + 3) })]),
          h('tr', null, [K.labelCell('เบี้ยประกัน', 'C' + (base + 4)), premiumCell]),
          h('tr.total', null, [K.labelCell('รวมทั้งปี'),
            K.outCell((cc) => (cc && cc.perDirector[i] ? K.money(totalOf(k.directors[i], cc.perDirector[i].gross)) : '–'))]),
          h('tr.total', null, [K.labelCell('เฉลี่ย/เดือน', 'C' + (base + 5)),
            K.outCell((cc) => (cc && cc.perDirector[i] ? K.money(totalOf(k.directors[i], cc.perDirector[i].gross) / 12) : '–'), { ref: 'E' + (base + 5) })]),
        ]),
      ]));
    });

    main.appendChild(K.card(null, null, [
      h('p.hint', { text: 'ค่าตอบแทนอื่นๆ (ภาษีทุกทอด) ดึงมาจากแท็บ 7 อัตโนมัติ — เป็นเงินได้ ม.40(1) ของกรรมการที่ต้องนำส่ง ภ.ง.ด.1 ทุกเดือน' }),
      K.legend(),
      K.disclaimer(),
    ]));
  }

  K.registerTab(4, 'comp', 'ค่าตอบแทนกรรมการ', render, { num: 4 });
})(typeof self !== 'undefined' ? self : this);
