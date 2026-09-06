// ตารางอัตราภาษี แยกตามปีภาษี (พ.ศ.)
// ────────────────────────────────────────────────────────────────────────────
// ชั้นนี้เก็บ "ตัวเลขที่เปลี่ยนเกือบทุกปี" ไว้ที่เดียว เอนจินใน engine.js ห้ามฝัง
// อัตราภาษีของตัวเอง — เพิ่มปีใหม่ที่นี่ไฟล์เดียวแล้วทั้งแอปใช้ปีใหม่ได้ทันที
//
// วิธีเพิ่มปี: คัดลอกบล็อกของปีล่าสุด วางเป็นคีย์ปีใหม่ แก้ตัวเลข แล้วเขียน
// `source` กำกับว่าตัวเลขมาจากไหน — ปีที่ไม่มีตารางของตัวเองระบบจะถอยไปใช้ปี
// ล่าสุดที่มีให้ พร้อมขึ้นธงเตือน CHK-08 ทุกครั้ง (ดู resolveTaxYear ด้านล่าง)
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KeymanTaxTables = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ขั้นภาษีเงินได้บุคคลธรรมดา ม.48(1) — [ตั้งแต่เกิน, ถึง, อัตรา]
  const PIT_BRACKETS_2560_ONWARD = [
    { over: 0, upTo: 150000, rate: 0 },
    { over: 150000, upTo: 300000, rate: 0.05 },
    { over: 300000, upTo: 500000, rate: 0.10 },
    { over: 500000, upTo: 750000, rate: 0.15 },
    { over: 750000, upTo: 1000000, rate: 0.20 },
    { over: 1000000, upTo: 2000000, rate: 0.25 },
    { over: 2000000, upTo: 5000000, rate: 0.30 },
    { over: 5000000, upTo: Infinity, rate: 0.35 },
  ];

  // ภาษีเงินได้นิติบุคคลของ SME (ทุนชำระแล้ว ≤ 5 ล้าน และรายได้ ≤ 30 ล้าน)
  // เรียงจากขั้นสูงลงต่ำ: กำไรเกิน `over` → ภาษี = base + (กำไร − over) × rate
  const CIT_SME = [
    { over: 3000000, base: 405000, rate: 0.20 },
    { over: 300000, base: 0, rate: 0.15 },
    { over: 0, base: 0, rate: 0 },
  ];

  const TAX_TABLES = {
    2567: {
      year: 2567,
      label: 'ปีภาษี 2567 (ค.ศ. 2024)',
      pitBrackets: PIT_BRACKETS_2560_ONWARD,
      expenseRate: 0.5,
      expenseCap: 100000,
      personalAllowance: 60000,
      citSme: CIT_SME,
      citGeneral: 0.20,
      smePaidUpCapitalMax: 5000000,
      smeRevenueMax: 30000000,
      dividendWht: 0.10,
      // เพดานค่าลดหย่อนที่ระบบบังคับจริง (CHK-12)
      groupCaps: {
        lifeHealth: 100000,   // ประกันชีวิตทั่วไป + ประกันสุขภาพตนเอง
        retirement: 500000,   // SSF/RMF/กบข./สำรองเลี้ยงชีพ/กอช./บำนาญ
      },
      source:
        'ม.48(1) และ พ.ร.ฎ.(ฉบับที่ 530) พ.ศ.2554 แก้ไขโดยฉบับที่ 603 พ.ศ.2559 ' +
        '(อัตรา 7 ขั้นใช้ตั้งแต่ปีภาษี 2560) · SME ตาม พ.ร.ฎ.(ฉบับที่ 530) และ (ฉบับที่ 603)',
    },
    2568: {
      year: 2568,
      label: 'ปีภาษี 2568 (ค.ศ. 2025)',
      pitBrackets: PIT_BRACKETS_2560_ONWARD,
      expenseRate: 0.5,
      expenseCap: 100000,
      personalAllowance: 60000,
      citSme: CIT_SME,
      citGeneral: 0.20,
      smePaidUpCapitalMax: 5000000,
      smeRevenueMax: 30000000,
      dividendWht: 0.10,
      groupCaps: { lifeHealth: 100000, retirement: 500000 },
      source:
        'อัตราและค่าลดหย่อนหลักไม่เปลี่ยนจากปี 2567 — ตรวจสอบซ้ำกับประกาศกรมสรรพากร' +
        'ก่อนออกใบเสนอจริงทุกครั้ง (มาตรการลดหย่อนเฉพาะกิจรายปี เช่น Easy E-Receipt ไม่ได้รวมไว้)',
    },
  };

  const YEARS = Object.keys(TAX_TABLES).map(Number).sort((a, b) => a - b);

  // ปีที่ยังไม่มีตารางของตัวเอง → ถอยไปปีล่าสุดที่มี แล้วขึ้นธง (CHK-08)
  function resolveTaxYear(year) {
    const y = Number(year);
    if (TAX_TABLES[y]) return { year: y, table: TAX_TABLES[y], fallback: false, requested: y };
    const usable = YEARS.filter((k) => k <= y);
    const picked = usable.length ? usable[usable.length - 1] : YEARS[0];
    return { year: picked, table: TAX_TABLES[picked], fallback: true, requested: y };
  }

  function tableFor(year) {
    return resolveTaxYear(year).table;
  }

  return { TAX_TABLES, YEARS, resolveTaxYear, tableFor, DEFAULT_YEAR: YEARS[YEARS.length - 1] };
});
