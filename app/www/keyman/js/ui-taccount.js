// แท็บ 5 — ตารางเพื่อแสดงงบ (ชีต "ตารางเพื่อแสดงงบ") อ้างอิงล้วน ไม่มีช่องกรอก
(function (root) {
  'use strict';
  const K = root.K, h = K.h, E = root.KeymanEngine;

  const latest = (bag, key) => {
    const arr = (K.state.kase[bag] || {})[key] || [];
    for (let i = arr.length - 1; i >= 0; i--) if (E.num(arr[i]) !== null) return E.num(arr[i]);
    return null;
  };
  const pl = (key) => latest('financials', key);
  const bs = (key) => latest('balance', key);

  const row = (label, ref, fn) => h('tr', null, [K.labelCell(label, ref), K.outCell(fn)]);

  function render(main) {
    main.appendChild(K.card('ตารางเพื่อแสดงงบ (T-account)', 'ชีต ตารางเพื่อแสดงงบ · อ้างอิงล้วน ไม่มีช่องกรอก', [
      h('p.note', { text: 'หน้านี้ใช้คุยกับลูกค้า — ตัวเลขทั้งหมดอ้างอิงจากงบปีล่าสุดที่กรอกไว้ในแท็บ 2 และ 3 แก้ที่นี่ไม่ได้' }),

      h('h3', { style: 'font-size:14px;margin:10px 0 4px', text: 'งบกำไรขาดทุน' }),
      h('div.grid2', null, [
        K.table([h('tr.head-band', null, [h('th.label', { text: 'DR — รายจ่าย' }), h('th', { text: 'จำนวนเงิน' })])], [
          row('-ต้นทุนการขาย', 'D6', () => K.money(pl('cogs'))),
          row('-คชจ.การขายและบริหาร', 'D7', () => K.money(pl('sga'))),
          row('รวมค่าใช้จ่าย', 'D9', () => K.money(pl('totalExpense'))),
          row('-กำไรสุทธิ(บัญชี)', 'D10', () => K.money(pl('profitsBeforeTax'))),
          row('-รายจ่ายต้องห้าม', 'D11', (c) => (c && !c.forbidden.hidden ? K.money(c.forbidden.amount) : 'ไม่แสดง')),
          row('-กำไรสุทธิ(ภาษี)', 'D12', (c) => {
            const p = pl('profitsBeforeTax');
            if (p === null) return '–';
            return K.money(p + (c && !c.forbidden.hidden ? c.forbidden.amount : 0));
          }),
          row('-ภาษีเงินได้', 'D13', () => K.money(pl('taxPaid'))),
          row('กำไรสุทธิหลังภาษี', 'D14', () => K.money(pl('netProfit'))),
        ]),
        K.table([h('tr.head-band', null, [h('th.label', { text: 'CR — รายได้' }), h('th', { text: 'จำนวนเงิน' })])], [
          row('-รายได้หลัก', 'F6', () => K.money(pl('mainRevenue'))),
          row('-รายได้อื่นๆ', 'F7', () => {
            const a = pl('revenues'), b = pl('mainRevenue');
            return a === null || b === null ? '–' : K.money(a - b);
          }),
          row('รายได้รวม', 'F9', () => K.money(pl('revenues'))),
          row('อัตราภาษีที่ใช้', 'E10', (c) => (c ? (c.sme.isSme ? 'SME: ยกเว้น 0–300,000 · 15% · 20%' : 'Non-SME: 20% ตลอด') : '–')),
        ]),
      ]),

      h('h3', { style: 'font-size:14px;margin:14px 0 4px', text: 'งบแสดงฐานะทางการเงิน' }),
      h('div.grid2', null, [
        K.table([h('tr.head-band', null, [h('th.label', { text: 'DR — สินทรัพย์' }), h('th', { text: 'จำนวนเงิน' })])], [
          row('-สินค้าคงเหลือ', 'I9', () => K.money(bs('inventory'))),
          row('-ลูกหนี้การค้า', 'I10', () => K.money(bs('receivables'))),
          row('ทรัพย์สินหมุนเวียนรวม', 'I12', () => K.money(bs('currentAssets'))),
          row('-อาคาร/ที่ดิน', 'I14', () => K.money(bs('ppe'))),
          row('ทรัพย์สินไม่หมุนเวียนรวม', 'I15', () => K.money(bs('nonCurrentAssets'))),
          row('รวมสินทรัพย์', 'I16', () => K.money(bs('totalAssets'))),
        ]),
        K.table([h('tr.head-band', null, [h('th.label', { text: 'CR — หนี้สินและทุน' }), h('th', { text: 'จำนวนเงิน' })])], [
          row('หนี้สินหมุนเวียนรวม', 'K9', () => K.money(bs('currentLiabilities'))),
          row('-เจ้าหนี้เงินกู้ยืมระยะยาว', 'K11', () => K.money(bs('nonCurrentLiabilities'))),
          row('-ทุนหุ้นสามัญ', 'K13', (c, kk) => K.money(kk.company.paidUpCapital)),
          row('-กำไรสะสม', 'K14', (c, kk) => {
            const eq = bs('equity'), cap = E.num(kk.company.paidUpCapital);
            return eq === null || cap === null ? '–' : K.money(eq - cap);
          }),
          row('ส่วนของผู้ถือหุ้นรวม', 'K15', () => K.money(bs('equity'))),
          row('รวมหนี้สินและทุน', 'K16', () => K.money(bs('totalLiabEquity'))),
        ]),
      ]),
      K.disclaimer(),
    ]));
  }

  K.registerTab(5, 'taccount', 'ตารางเพื่อแสดงงบ', render, { num: 5 });
})(typeof self !== 'undefined' ? self : this);
