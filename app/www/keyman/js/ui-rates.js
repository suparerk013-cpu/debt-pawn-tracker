// แท็บ 6 — อัตราภาษี (ชีต "อัตราภาษีบุคคล&นิติบุคคล")
// ตารางเดียวสามคอลัมน์แบบ Excel แต่แก้ช่วงให้ถูกตามกฎหมาย (ดูหมายเหตุใต้ตาราง)
(function (root) {
  'use strict';
  const K = root.K, h = K.h, T = root.KeymanTaxTables;

  const RANGES = [
    { from: 0, to: 150000, pit: 'ยกเว้น', sme: 'ยกเว้น', non: '20%' },
    { from: 150001, to: 300000, pit: '5%', sme: 'ยกเว้น', non: '20%' },
    { from: 300001, to: 500000, pit: '10%', sme: '15%', non: '20%' },
    { from: 500001, to: 750000, pit: '15%', sme: '15%', non: '20%' },
    { from: 750001, to: 1000000, pit: '20%', sme: '15%', non: '20%' },
    { from: 1000001, to: 2000000, pit: '25%', sme: '15%', non: '20%' },
    { from: 2000001, to: 3000000, pit: '30%', sme: '15%', non: '20%' },
    { from: 3000001, to: 5000000, pit: '30%', sme: '20%', non: '20%' },
    { from: 5000001, to: null, pit: '35%', sme: '20%', non: '20%' },
  ];
  const nf = (v) => v === null ? 'ขึ้นไป' : Number(v).toLocaleString('th-TH');

  function render(main) {
    const info = T.resolveTaxYear(K.state.kase.taxYear);
    main.appendChild(K.card('อัตราภาษีเงินได้ ' + info.table.label, 'ชีต อัตราภาษีบุคคล&นิติบุคคล', [
      info.fallback ? h('p', { class: 'pill warn', style: 'display:block;padding:6px 10px',
        text: `ยังไม่มีตารางภาษีของปี ${info.requested} — ระบบใช้ตารางปี ${info.year} แทน (CHK-08)` }) : null,
      K.table([
        h('tr.head-band', null, [h('th.label', { colspan: 2, text: 'เงินได้สุทธิ / กำไรสุทธิ' }), h('th', { text: 'บุคคลธรรมดา' }), h('th', { colspan: 2, text: 'นิติบุคคล' })]),
        h('tr', null, [h('th.label', { text: 'ตั้งแต่' }), h('th', { text: 'ถึง' }), h('th', { text: 'เงินได้สุทธิ' }), h('th', { text: 'กิจการ SME' }), h('th', { text: 'กิจการ Non SME' })]),
      ], RANGES.map((r, i) => h('tr', null, [
        h('td.label', null, [h('span', { text: nf(r.from) }), h('span.ref', { text: 'B' + (6 + i) })]),
        h('td', { text: r.to === null ? '' : nf(r.to) }),
        h('td.calc', { text: r.pit }),
        h('td.calc', { text: r.sme }),
        h('td.calc', { text: r.non }),
      ]))),
      h('p.note.strong', { text: 'เงื่อนไข SME  1) ทุนจดทะเบียนที่ชำระแล้วไม่เกิน 5 ล้านบาท   2) รายได้ไม่เกิน 30 ล้านบาท   *ต้องเข้าทั้ง 2 เงื่อนไข' }),
      h('p.note', { text: 'ระบบตัดสินสถานะ SME ให้เอง จากทุนจดทะเบียนในแท็บ 1 และรายได้รวมปีล่าสุดในแท็บ 2 — ผู้ใช้เลือกเทมเพลตเองไม่ได้' }),
      h('h3', { style: 'font-size:14px;margin:12px 0 4px', text: 'ตารางนี้ต่างจากไฟล์ Excel เดิมตรงไหน' }),
      h('ul', { style: 'font-size:12.5px;color:var(--muted);padding-left:18px' }, [
        h('li', { text: 'ไฟล์เดิมเว้นช่อง D13 ว่างไว้ — ช่วง 3,000,001–5,000,000 บาท ไม่มีอัตราภาษีบุคคลธรรมดาทั้งที่กฎหมายกำหนดไว้ 30% ที่นี่เติมให้ถูกแล้ว' }),
        h('li', { text: 'ไฟล์เดิมวางคอลัมน์ SME ผิดแถว: "ยกเว้น" ไปอยู่บรรทัด 0–150,000 ทั้งที่ SME ยกเว้นถึง 300,000 และ 15% ไปอยู่บรรทัด 300,001–500,000 ทั้งที่กินยาวถึง 3,000,000' }),
        h('li', { text: 'เอนจินคำนวณใช้ค่าจาก tax-tables.js ไม่ได้อ่านจากตารางบนหน้าจอนี้ — ตารางนี้มีไว้ให้คนดูเทียบ' }),
      ]),
      h('p.hint', { text: 'ที่มา: ' + info.table.source }),
    ]));
  }

  K.registerTab(6, 'rates', 'อัตราภาษี', render, { num: 6 });
})(typeof self !== 'undefined' ? self : this);
