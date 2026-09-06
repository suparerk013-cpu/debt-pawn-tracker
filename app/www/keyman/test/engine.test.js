// ชุดทดสอบเอนจิน — รันด้วย `node app/www/keyman/test/engine.test.js` เท่านั้น
// ไม่ต้องติดตั้งเฟรมเวิร์กทดสอบ ไม่ต้อง npm install
'use strict';
const E = require('../js/engine.js');
const T = require('../js/tax-tables.js');

const Y = 2567;
let pass = 0;
const fails = [];

function near(actual, expected, tol, name) {
  const ok = Math.abs(actual - expected) <= (tol === undefined ? 0.02 : tol);
  if (ok) pass++;
  else fails.push(`${name}\n    ได้   ${actual}\n    ควรได้ ${expected}`);
}
function eq(actual, expected, name) {
  const ok = actual === expected;
  if (ok) pass++;
  else fails.push(`${name}\n    ได้   ${JSON.stringify(actual)}\n    ควรได้ ${JSON.stringify(expected)}`);
}
function section(t) { console.log('\n── ' + t); }

// ── อัตราภาษีเงินได้บุคคลธรรมดา ────────────────────────────────────────────
section('อัตราภาษีบุคคลธรรมดา (เงินได้สุทธิ → ภาษี)');
[[150000, 0], [300000, 7500], [500000, 27500], [750000, 65000],
 [1000000, 115000], [2000000, 365000], [5000000, 1265000], [6000000, 1615000],
].forEach(([net, tax]) => near(E.pitTax(net, Y), tax, 0.0001, `pitTax(${net})`));
near(E.pitTax(-5000, Y), 0, 0, 'pitTax(ติดลบ) = 0');

// ── ภาษีทุกทอด — ต้องตรงกับตัวเลขในแฟ้ม Excel ─────────────────────────────
section('ภาษีทุกทอด (ป.96/2543 ข้อ 1(7) ออกให้ตลอดไป)');
const only = (salary, premium) =>
  E.grossUpTax({ salary, keymanPremium: premium, allowances: { personal: 60000 } }, Y, { mode: 'perpetual' });

const knowledger = only(1440000, 2000000);
near(knowledger.salaryOnlyTax, 185000, 0.0001, 'โนวเลดเจอร์ · ภาษีเงินเดือนอย่างเดียว');
near(knowledger.tax, 1070000, 0.02, 'โนวเลดเจอร์ · ภาษีทุกทอด');
eq(knowledger.converged, true, 'โนวเลดเจอร์ · ลู่เข้า');

const sj = only(600000, 333333.33);
near(sj.salaryOnlyTax, 21500, 0.0001, 'เอสเจ · ภาษีเงินเดือนอย่างเดียว');
near(sj.tax, 87083.33, 0.02, 'เอสเจ · ภาษีทุกทอด (ต่อท่าน)');

const pathom1 = only(1020000, 750000);
near(pathom1.salaryOnlyTax, 87000, 0.0001, 'ปฐมอินทีเรีย ท่าน 1 · ภาษีเงินเดือนอย่างเดียว');
near(pathom1.tax, 356666.67, 0.02, 'ปฐมอินทีเรีย ท่าน 1 · ภาษีทุกทอด');

// ท่าน 2 ข้ามขั้นภาษี 25% → 30% ระหว่างวน ถ้าใช้สมการปิดอัตราเดียวจะได้ 416,666.67 ซึ่งผิด
const pathom2 = only(1200000, 750000);
near(pathom2.salaryOnlyTax, 125000, 0.0001, 'ปฐมอินทีเรีย ท่าน 2 · ภาษีเงินเดือนอย่างเดียว');
near(pathom2.tax, 431428.57, 0.02, 'ปฐมอินทีเรีย ท่าน 2 · ภาษีทุกทอด (ข้ามขั้น 25%→30%)');
eq(Math.abs(pathom2.tax - 416666.67) > 1000, true, 'ปฐมอินทีเรีย ท่าน 2 · ไม่ใช่ผลของสมการปิดอัตราเดียว');

section('ป.96/2543 สองวิธี (เงินเดือน 600,000 ไม่มีเบี้ย)');
const once = E.grossUpTax({ salary: 600000, allowances: { personal: 60000 } }, Y, { mode: 'once' });
const perpetual = E.grossUpTax({ salary: 600000, allowances: { personal: 60000 } }, Y, { mode: 'perpetual' });
near(once.tax, 23650, 0.0001, 'ข้อ 1(8) ออกให้ครั้งเดียว');
eq(once.rounds, 2, 'ข้อ 1(8) หยุดที่ 2 รอบพอดี');
near(perpetual.tax, 23888.89, 0.02, 'ข้อ 1(7) ออกให้ตลอดไป');
eq(perpetual.tax > once.tax, true, 'ข้อ 1(7) ต้องมากกว่าข้อ 1(8) เสมอ');

section('trace ของภาษีทุกทอด');
eq(sj.trace.length, sj.rounds, 'trace มีครบทุกรอบ');
eq(sj.trace[0].taxCarried, 0, 'รอบแรก (คอลัมน์ F) ยังไม่มีภาษีที่ออกแทน');
near(sj.trace[0].tax, 69666.67, 0.01, 'คอลัมน์ F ตรงกับ Excel F42');
near(sj.trace[1].tax, 83600, 0.01, 'ทอดที่ 1 ตรงกับ Excel H42');
eq(sj.lastDelta < E.CONVERGE_EPSILON, true, 'ผลต่างสองรอบสุดท้ายต่ำกว่าเกณฑ์ลู่เข้า');
near(sj.monthlyWithholding, sj.tax / 12, 0.0001, 'ยอดหัก ณ ที่จ่ายต่อเดือน = ภาษีทุกทอด ÷ 12');

// ── สถานะ SME ─────────────────────────────────────────────────────────────
section('สถานะ SME (ระบบตัดสินเอง)');
eq(E.determineSme({ paidUpCapital: 1000000, revenueLatest: 16049353.24 }, Y).isSme, true, 'ทุน 1 ล้าน รายได้ 16 ล้าน → เข้าเกณฑ์');
const bigCapital = E.determineSme({ paidUpCapital: 70000000, revenueLatest: 25533511.14 }, Y);
eq(bigCapital.isSme, false, 'ทุน 70 ล้าน → ไม่เข้าเกณฑ์');
eq(bigCapital.capitalOk, false, 'ทุน 70 ล้าน → เหตุผลคือทุนเกิน');
eq(bigCapital.revenueOk, true, 'ทุน 70 ล้าน → รายได้ยังไม่เกิน');
const bigRevenue = E.determineSme({ paidUpCapital: 5000000, revenueLatest: 54244192.14 }, Y);
eq(bigRevenue.isSme, false, 'รายได้ 54 ล้าน → ไม่เข้าเกณฑ์');
eq(bigRevenue.capitalOk, true, 'รายได้ 54 ล้าน → ทุนยังไม่เกิน');

section('ภาษีเงินได้นิติบุคคล');
near(E.citTax(3000000, true, Y), 405000, 0.0001, 'SME กำไร 3 ล้าน = 405,000');
near(E.citTax(300000, true, Y), 0, 0.0001, 'SME กำไร 300,000 = ยกเว้น');
near(E.citTax(-45239.75, true, Y), 0, 0, 'ขาดทุน → 0 (SME)');
near(E.citTax(-45239.75, false, Y), 0, 0, 'ขาดทุน → 0 (Non-SME)');
near(E.citTax(9673985.31, true, Y), 1739797.062, 0.01, 'SME กำไร 9.67 ล้าน');
near(E.citTax(3786771.51, false, Y), 757354.302, 0.01, 'Non-SME 20% ตลอด');

// ── ค่าใช้จ่ายต้องห้าม ────────────────────────────────────────────────────
section('ค่าใช้จ่ายต้องห้าม');
const f1 = E.forbiddenExpense({ profitBeforeTax: 9673985.31, taxPaid: 1840912.27, isSme: true }, Y);
near(f1.amount, 505576.04, 0.01, 'กำไร 9,673,985.31 ภาษี 1,840,912.27 SME');
eq(f1.hidden, false, 'เคสปกติ แสดงตัวเลขได้');

const f2 = E.forbiddenExpense({ profitBeforeTax: 3786771.51, taxPaid: 255322.38, isSme: false }, Y);
near(f2.raw, -2510159.61, 0.01, 'ค่าดิบติดลบ (Non-SME)');
eq(f2.amount, 0, 'ค่าดิบติดลบ → กลบเป็น 0');
eq(f2.hidden, true, 'ค่าดิบติดลบ → ซ่อนตัวเลข');
eq(f2.note.length > 0, true, 'ค่าดิบติดลบ → มีคำอธิบาย');

const f3 = E.forbiddenExpense({ profitBeforeTax: 2.87, taxPaid: 0, isSme: true }, Y);
eq(f3.amount, 0, 'กำไร 2.87 ภาษี 0 → 0 (ห้ามได้ 299,997)');
[[-45239.75, 0], [-24059.23, 0], [2.87, 0]].forEach(([p, want]) => {
  const f = E.forbiddenExpense({ profitBeforeTax: p, taxPaid: 0, isSme: true }, Y);
  near(f.amount, want, 0, `บริษัทเสียภาษี 0 บาท กำไร ${p} → ${want}`);
});

// ── เพดานเบี้ย ────────────────────────────────────────────────────────────
section('เพดานเบี้ย');
near(E.premiumCeiling({ revenues: [13413308.16, 21796187.29, 25533511.14] }).ceiling5pctAvgRevenue, 1012383.44, 0.01, '5% ของรายได้เฉลี่ย 3 ปี');
near(E.premiumCeiling({ revenues: [15901594.37, 16049353.24] }).ceiling5pctAvgRevenue, 798773.69, 0.01, '5% ของรายได้เฉลี่ย (มี 2 ปี)');
near(E.premiumCeiling({ revenues: [480696, 447401.87, 267402.77] }).ceiling5pctAvgRevenue, 19925.01, 0.01, '5% ของรายได้เฉลี่ย (บริษัทเล็ก)');
const ceilNull = E.premiumCeiling({ revenues: ['', null, 16049353.24] });
near(ceilNull.avgRevenue, 16049353.24, 0.01, 'ช่องว่างไม่ถูกนับเป็น 0 ตอนหาค่าเฉลี่ย');
near(E.premiumCeiling({ revenues: [20000000], profitsBeforeTax: [1000000], taxPaidLatest: 200000 }).ceiling30pctAvgProfit, 300000, 0.01, '30% ของกำไรก่อนภาษีเฉลี่ย');
near(E.premiumCeiling({ revenues: [20000000], taxPaidLatest: 200000 }).reference20pctTax, 40000, 0.01, '20% ของภาษีที่จ่ายปีล่าสุด');

// ── เปรียบเทียบ Before / After ────────────────────────────────────────────
section('เปรียบเทียบ Before / After');
const kn = E.compareScenarios({
  premiumTotal: 2000000, allTierTaxTotal: 1070000, salaryTotal: 1440000,
  salaryOnlyPitTotal: 185000, profitBeforeTax: 9673985.31, isSme: true,
}, Y);
near(kn.after.totalExpense, 3070000, 0.01, 'โนวเลดเจอร์ · ค่าใช้จ่ายรวม');
near(kn.after.citSaving, 614000, 0.01, 'โนวเลดเจอร์ · ประหยัดภาษีนิติ');
near(kn.after.netTax, 456000, 0.01, 'โนวเลดเจอร์ · ภาษีที่เสียสุทธิ');
near(kn.after.ownerCash, 3440000, 0.01, 'โนวเลดเจอร์ · เงินเข้าเจ้าของ');

const sjCmp = E.compareScenarios({
  premiumTotal: 1000000, allTierTaxTotal: 87083.3333333 * 3, salaryTotal: 1800000,
  salaryOnlyPitTotal: 21500 * 3, profitBeforeTax: 2835268.30, isSme: false,
}, Y);
near(sjCmp.after.allTierTax, 261250, 0.02, 'เอสเจ · ภาษีทุกทอดรวม');
near(sjCmp.before.personalTax, 64500, 0.01, 'เอสเจ · ภาษีบุคคลฝั่ง Before');
near(sjCmp.after.citSaving, 252250, 0.02, 'เอสเจ · ประหยัดภาษีนิติ');
near(sjCmp.after.netTax, 9000, 0.02, 'เอสเจ · ภาษีที่เสียสุทธิ');
near(sjCmp.after.ownerCash, 2800000, 0.01, 'เอสเจ · เงินเข้าเจ้าของ');
eq(sjCmp.caveats.length >= 3, true, 'caveats อย่างน้อย 3 ข้อ');
eq(E.compareScenarios({ premiumTotal: 1, allTierTaxTotal: 0, profitBeforeTax: 1, isSme: true, beneficiary: 'company' }, Y).caveats.length >= 4, true, 'บริษัทเป็นผู้รับประโยชน์ → เพิ่ม caveat ค่าสินไหม');

section('ผลประหยัดเมื่อรายจ่ายดึงกำไรข้ามขั้น');
const saving = (profit, cut, isSme) =>
  E.compareScenarios({ premiumTotal: cut, allTierTaxTotal: 0, profitBeforeTax: profit, isSme }, Y).after.citSaving;
near(saving(9673985, 3070000, true), 614000, 0.01, 'กำไร 9,673,985 หัก 3,070,000 SME → 614,000');
near(saving(4000000, 2000000, true), 350000, 0.01, 'กำไร 4,000,000 หัก 2,000,000 SME → 350,000 (ห้ามได้ 400,000)');
near(saving(3500000, 1000000, true), 175000, 0.01, 'กำไร 3,500,000 หัก 1,000,000 SME → 175,000 (ห้ามได้ 200,000)');
near(saving(450000, 300000, true), 22500, 0.01, 'กำไร 450,000 หัก 300,000 SME → 22,500 (ไม่เกินภาษีเดิม)');
near(saving(450000, 300000, true), E.citTax(450000, true, Y), 0.01, 'ประหยัดไม่เกินภาษีที่เคยจ่ายทั้งปี');
near(saving(-45239.75, 300000, true), 0, 0, 'กำไรติดลบ → ประหยัด 0');

section('ฝั่ง Before คิดปันผลจากกำไรหลังภาษี');
const before = E.compareScenarios({ premiumTotal: 1000000, allTierTaxTotal: 0, profitBeforeTax: 2835268.30, isSme: false, salaryTotal: 0, salaryOnlyPitTotal: 0 }, Y).before;
near(before.cit, 200000, 0.01, 'ภาษีนิติของเงินก้อน');
near(before.dividendTax, 80000, 0.01, 'ภาษีปันผล 10% คิดจาก (เงินก้อน − ภาษีนิติ) ไม่ใช่ยอดเต็ม');
eq(before.dividendTax !== 100000, true, 'ไม่ใช่ 10% ของยอดเต็มแบบไฟล์เดิม');
near(before.ownerCash, 720000, 0.01, 'เงินถึงเจ้าของฝั่ง Before หัก CIT และปันผลแล้ว');

// ── กฎตรวจสอบ ─────────────────────────────────────────────────────────────
section('กฎตรวจสอบ CHK');
function baseCase(over) {
  const k = {
    taxYear: Y,
    company: { name: 'บริษัททดสอบ จำกัด', regNo: '0105557181201', paidUpCapital: 1000000 },
    financials: {
      years: ['2563', '2564', '2565'],
      revenues: [13413308.16, 21796187.29, 25533511.14],
      profitsBeforeTax: [3000000, 3500000, 4000000],
      taxPaid: [500000, 600000, 700000],
    },
    directors: [{ name: 'ก', salary: 1440000, premiumAllocated: 900000, positionCriteria: 'กรรมการผู้จัดการ', allowances: { personal: 60000 } }],
    policy: { premiumTotal: 900000, beneficiary: 'heir', taxMethod: 'perpetual', welfareWording: 'perpetual' },
    docs: { welfareRule: true, boardResolution: true, policyReceipt: true, pnd1: true },
  };
  return Object.assign(k, over || {});
}
const has = (r, code) => r.items.some((i) => i.code === code && i.level === 'block');
const hasWarn = (r, code) => r.items.some((i) => i.code === code && i.level === 'warn');

let k = baseCase();
k.policy.premiumTotal = 2000000; k.directors[0].premiumAllocated = 2000000;
let r = E.runChecks(k, {});
eq(has(r, 'CHK-02'), true, 'เบี้ย 2,000,000 บนรายได้เฉลี่ย 20,247,668.86 → CHK-02 บล็อก');
eq(r.canQuote, false, 'มีข้อบล็อก → canQuote = false');

k = baseCase(); r = E.runChecks(k, {});
eq(has(r, 'CHK-02'), false, 'ลดเบี้ยเหลือ 900,000 → CHK-02 ผ่าน');
eq(r.canQuote, true, 'ไม่มีข้อบล็อก → canQuote = true');
eq(r.items.some((i) => i.code === 'CHK-01'), true, 'CHK-01 รายงานผลตัดสิน SME เสมอ');

k = baseCase(); k.docs.welfareRule = false; r = E.runChecks(k, {});
eq(has(r, 'CHK-09'), true, 'ไม่มีระเบียบสวัสดิการ → CHK-09 บล็อก');
k = baseCase(); k.docs.pnd1 = false; r = E.runChecks(k, {});
eq(has(r, 'CHK-09'), true, 'ไม่ส่ง ภ.ง.ด.1 → CHK-09 บล็อก');

k = baseCase(); k.policy.welfareWording = 'once'; r = E.runChecks(k, {});
eq(has(r, 'CHK-11'), true, 'ระเบียบเขียน "ครั้งเดียว" แต่คำนวณ "ตลอดไป" → CHK-11 บล็อก');

k = baseCase(); r = E.runChecks(k, { duplicateOf: 'บริษัทอื่น จำกัด' });
eq(has(r, 'CHK-05'), true, 'งบซ้ำกับเคสอื่น → CHK-05 บล็อก');

k = baseCase(); k.directors[0].premiumAllocated = 500000; r = E.runChecks(k, {});
eq(has(r, 'CHK-06'), true, 'ยอดจัดสรรรายคนไม่ตรงเบี้ยรวม → CHK-06 บล็อก');

k = baseCase();
k.directors.push({ name: 'ข', salary: 600000, premiumAllocated: 0, positionCriteria: 'กรรมการ', allowances: {} });
r = E.runChecks(k, {});
eq(hasWarn(r, 'CHK-06'), true, 'มีกรรมการไม่ได้รับเบี้ย → CHK-06 เตือน');
eq(r.canQuote, true, 'เตือนอย่างเดียวยังออกใบเสนอได้');

k = baseCase(); k.directors[0].positionCriteria = ''; r = E.runChecks(k, {});
eq(hasWarn(r, 'CHK-06'), true, 'ไม่ระบุเกณฑ์ตำแหน่ง → CHK-06 เตือน');

k = baseCase(); k.policy.beneficiary = 'company'; r = E.runChecks(k, {});
eq(hasWarn(r, 'CHK-10'), true, 'บริษัทเป็นผู้รับผลประโยชน์ → CHK-10 เตือน');
k = baseCase(); k.policy.beneficiary = ''; r = E.runChecks(k, {});
eq(hasWarn(r, 'CHK-10'), true, 'ยังไม่ระบุผู้รับผลประโยชน์ → CHK-10 เตือน');

k = baseCase(); k.taxYear = 2599; r = E.runChecks(k, { taxYearInfo: T.resolveTaxYear(2599) });
eq(hasWarn(r, 'CHK-08'), true, 'ไม่มีตารางภาษีของปีที่ออกใบเสนอ → CHK-08 เตือน');

k = baseCase(); k.directors[0].allowances = { personal: 60000, lifeInsurance: 100000, healthSelf: 25000 };
r = E.runChecks(k, {});
eq(hasWarn(r, 'CHK-12'), true, 'ประกันชีวิต+สุขภาพ เกิน 100,000 → CHK-12 เตือน');
k = baseCase(); k.directors[0].allowances = { personal: 60000, rmf: 400000, pension: 200000 };
r = E.runChecks(k, {});
eq(hasWarn(r, 'CHK-12'), true, 'กลุ่ม RMF/บำนาญ เกิน 500,000 → CHK-12 เตือน');

k = baseCase(); k.financials.profitsBeforeTax = [-45239.75, -24059.23, 2.87]; k.financials.taxPaid = [0, 0, 0];
r = E.runChecks(k, {});
eq(hasWarn(r, 'CHK-04'), true, 'คชจ.ต้องห้ามติดลบ/ไม่มีฐาน → CHK-04 เตือน');
eq(r.forbidden.amount, 0, 'CHK-04 → ตัวเลขที่แสดงเป็น 0 ไม่ใช่ค่าติดลบ');
// บริษัทขาดทุนเฉลี่ย: ห้ามเตือนด้วยเพดาน 30% ที่เป็นค่าติดลบ ต้องบอกว่าไม่มีฐานกำไรให้คิด
const lossChk = r.items.filter((i) => i.code === 'CHK-03');
eq(lossChk.length, 1, 'กำไรเฉลี่ยติดลบ → ยังมี CHK-03 หนึ่งข้อ');
eq(lossChk[0].title.indexOf('ไม่มีฐานกำไร') > 0, true, 'CHK-03 บอกว่าไม่มีฐานกำไรให้เทียบสัดส่วน');
eq(/-[\d,]/.test(lossChk[0].title), false, 'หัวข้อ CHK-03 ไม่มีตัวเลขติดลบ');
eq(E.premiumCeiling({ revenues: [480696, 447401.87, 267402.77], profitsBeforeTax: [-45239.75, -24059.23, 2.87] }).avgProfit < 0, true,
  'ค่าเฉลี่ยกำไรติดลบยังคืนค่าจริงให้ชั้นหน้าจอตัดสินใจเอง');

// ── นำเข้าและช่องว่าง ─────────────────────────────────────────────────────
section('การอ่านตัวเลขและช่องว่าง');
eq(E.num(''), null, 'สตริงว่าง → null ไม่ใช่ 0');
eq(E.num('-'), null, 'ขีด → null');
eq(E.num('13,413,308.16'), 13413308.16, 'ตัวเลขที่เก็บเป็นข้อความมีคอมมา');
eq(E.num('(1,000.50)'), -1000.5, 'วงเล็บ = ค่าติดลบ');
eq(E.avg(['', 100, 200]), 150, 'ค่าเฉลี่ยข้ามช่องว่าง');
eq(E.avg(['', '']), null, 'ไม่มีข้อมูลเลย → null');

section('fingerprint สำหรับ CHK-05');
const fa = E.fingerprint({ years: ['2563'], revenues: [100], profitsBeforeTax: [10], taxPaid: [2] });
const fb = E.fingerprint({ years: ['2563'], revenues: [100], profitsBeforeTax: [10], taxPaid: [2] });
const fc = E.fingerprint({ years: ['2563'], revenues: [101], profitsBeforeTax: [10], taxPaid: [2] });
eq(fa, fb, 'งบชุดเดียวกัน → fingerprint เท่ากัน');
eq(fa !== fc, true, 'งบต่างกัน → fingerprint ต่างกัน');
eq(E.fingerprint({ years: [], revenues: [], profitsBeforeTax: [], taxPaid: [] }), null, 'งบว่าง → ไม่มี fingerprint');

section('computeCase รวมทั้งเคส');
const full = E.computeCase(baseCase(), {});
eq(full.perDirector.length, 1, 'คำนวณครบทุกกรรมการ');
near(full.recordedExpenseTotal, full.allTierTaxTotal + 900000, 0.01, 'รวมบันทึกเป็นรายจ่ายของบริษัท = ภาษีทุกทอด + เบี้ย');
near(full.monthlyWithholdingTotal, full.allTierTaxTotal / 12, 0.01, 'ยอดหัก ณ ที่จ่ายต่อเดือนรวม');
eq(full.checks.canQuote, true, 'เคสตัวอย่างออกใบเสนอได้');
eq(typeof full.fingerprint, 'string', 'computeCase คืน fingerprint');

// ── สรุป ──────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
if (fails.length) {
  console.log(`ผ่าน ${pass} ข้อ · ไม่ผ่าน ${fails.length} ข้อ\n`);
  fails.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  process.exit(1);
}
console.log(`ผ่านทั้งหมด ${pass} ข้อ ✓`);
