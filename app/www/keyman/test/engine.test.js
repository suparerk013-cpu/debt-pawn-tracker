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

// "ยังตัดสินไม่ได้" ต้องต่างจาก "ตัดสินแล้วว่าไม่เข้าเกณฑ์"
const smePending = E.determineSme({ paidUpCapital: 375000, revenueLatest: null }, Y);
eq(smePending.pending, true, 'มีทุนแต่ยังไม่มีรายได้ → ยังตัดสินไม่ได้');
eq(smePending.isSme, false, 'ยังตัดสินไม่ได้ → ยังไม่ถือว่าเข้าเกณฑ์');
eq(smePending.capitalOk, true, 'ทุน 375,000 ผ่านเกณฑ์ทุน');
eq(E.determineSme({ paidUpCapital: 70000000, revenueLatest: null }, Y).pending, false, 'ทุนเกินแล้ว → ตัดสินได้เลยว่าไม่เข้า ไม่ต้องรอรายได้');
eq(E.determineSme({ paidUpCapital: 1000000, revenueLatest: 16049353.24 }, Y).pending, false, 'ข้อมูลครบ → ไม่ pending');
const chkPending = E.runChecks(Object.assign(baseCase(), { financials: { years: [], revenues: [], profitsBeforeTax: [], taxPaid: [] } }), {});
eq(chkPending.items.some((i) => i.code === 'CHK-01' && i.title.indexOf('ยังตัดสิน') === 0), true, 'CHK-01 บอกว่ายังตัดสินไม่ได้ ไม่ใช่บอกว่าไม่เข้าเกณฑ์');

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
// บล็อก "กรรมการรับเงินเดือน, โบนัสจริง" ของชีตเดิม — ฝั่ง After รับเต็มเพราะบริษัทออกภาษีให้
near(kn.after.directorNet, 1440000, 0.01, 'โนวเลดเจอร์ · กรรมการรับจริงฝั่ง After');
near(kn.before.directorNet, 1255000, 0.01, 'โนวเลดเจอร์ · กรรมการรับจริงฝั่ง Before (ถูกหักภาษีไว้)');
near(kn.directorNetDiff, 185000, 0.01, 'โนวเลดเจอร์ · ผลต่างเงินที่กรรมการรับจริง');
near(kn.salaryTotal, 1440000, 0.01, 'โนวเลดเจอร์ · เงินเดือนรวมที่ใช้เทียบสองฝั่ง');
eq(kn.after.dividendTax, 0, 'ฝั่ง After ไม่มีภาษีเงินปันผล');
eq(kn.before.totalExpense, 0, 'ฝั่ง Before ไม่มีค่าใช้จ่ายที่บันทึกได้');

// ── ชีต "ช่วยคำนวณภาษีเงินได้บุคคลธรรมดา" ต่อเข้าชีต "สรุปผลต่าง" โดยตรง ──────
// ล็อกทั้งสายไว้ ไม่ใช่ต่างคนต่างเทสต์แล้วเสียบเลขกลางทางเอง
section('สายเชื่อมจากชีตภาษีบุคคลเข้าชีตสรุป');
const chainG = E.grossUpTax({ salary: 1440000, keymanPremium: 2000000, allowances: { personal: 60000 } }, Y);
near(chainG.columnE.netIncome, 1280000, 0.01, 'คอลัมน์ 1 · เงินได้สุทธิ (1,440,000 − 100,000 − 60,000)');
near(chainG.columnE.tax, 185000, 0.01, 'คอลัมน์ 1 · ภาษีเงินเดือนอย่างเดียว');
near(chainG.trace[0].netIncome, 3280000, 0.01, 'คอลัมน์ 2 · เงินได้สุทธิเมื่อรวมเบี้ยแต่ยังไม่ออกภาษีให้');
near(chainG.trace[0].tax, 749000, 0.01, 'คอลัมน์ 2 · ภาษีก่อนบริษัทออกให้');
near(chainG.trace[chainG.trace.length - 1].netIncome, 4350000, 0.01, 'คอลัมน์ 3 · เงินได้สุทธิเมื่อออกภาษีให้ทุกทอด');
near(chainG.tax, 1070000, 0.02, 'คอลัมน์ 3 · ภาษีทุกทอด');
eq(chainG.converged, true, 'ภาษีทุกทอดลู่เข้าแล้ว ไม่ได้ตัดจบเพราะชนเพดานรอบ');
// ป้อนผลจากชีตภาษีบุคคลเข้าชีตสรุปตรง ๆ ห้ามใส่เลขมือ
const chain = E.compareScenarios({
  premiumTotal: 2000000, allTierTaxTotal: chainG.tax, salaryTotal: 1440000,
  salaryOnlyPitTotal: chainG.columnE.tax, profitBeforeTax: 9673985.31, isSme: true,
}, Y);
near(chain.after.allTierTax, 1070000, 0.02, 'สรุป · ภาษีทุกทอดมาจากชีตภาษีบุคคล');
near(chain.after.totalExpense, 3070000, 0.02, 'สรุป · ค่าใช้จ่ายรวม');
near(chain.after.citSaving, 614000, 0.02, 'สรุป · ประหยัดภาษีนิติ');
near(chain.after.netTax, 456000, 0.02, 'สรุป · เสียภาษีรวมฝั่ง After');
near(chain.before.personalTax, 185000, 0.01, 'สรุป · ภาษีบุคคลฝั่ง Before มาจากคอลัมน์ 1');
near(chain.after.directorNet, 1440000, 0.01, 'สรุป · กรรมการรับจริงฝั่ง After');
near(chain.before.directorNet, 1255000, 0.01, 'สรุป · กรรมการรับจริงฝั่ง Before');
near(chain.after.ownerCash, 3440000, 0.01, 'สรุป · เงินเข้าเจ้าของฝั่ง After');
// สองช่องนี้แอปคิดต่างจากไฟล์เดิมโดยตั้งใจ — ไฟล์เดิมคิดปันผล 10% จากยอดเต็ม
// และแจกเงินให้เจ้าของโดยไม่หักภาษีนิติที่ตัวเองนับเป็นภาษีไปแล้ว
near(chain.before.dividendTax, 160000, 0.01, 'สรุป · ปันผล 10% ของ (เงินก้อน − ภาษีนิติ) ไม่ใช่ยอดเต็ม 200,000');
near(chain.before.ownerCash, 2695000, 0.01, 'สรุป · เงินเข้าเจ้าของฝั่ง Before หักภาษีนิติออกด้วย');

// กรรมการหลายท่านที่เงินเดือนแต่ละคนยังไม่ถึงเกณฑ์ → ภาษีบุคคลรวมเป็นศูนย์
// สองฝั่งของบล็อก 2 จะเท่ากันโดยไม่ใช่บั๊ก หน้าจอต้องอธิบายเหตุผลให้ ไม่ใช่ปล่อยเลขซ้ำเฉย ๆ
const under = E.computeCase({
  taxYear: Y, company: { paidUpCapital: 5000000 },
  directors: [300000, 300000, 300000, 300000, 300000].map((salary, i) =>
    ({ id: 'd' + i, salary, premiumAllocated: 240000, allowances: { personal: 60000 }, donations: {} })),
  policy: { premiumTotal: 1200000, taxMethod: 'perpetual', allocationMode: 'auto' },
  financials: { years: ['', '', '2567'], revenues: ['', '', 20000000], profitsBeforeTax: ['', '', 5000000] },
  balance: {}, docs: {},
});
near(under.salaryTotal, 1500000, 0.01, 'ต่ำกว่าเกณฑ์ · เงินเดือนรวมห้าท่าน');
near(under.salaryOnlyPitTotal, 0, 0.01, 'ต่ำกว่าเกณฑ์ · ภาษีเงินเดือนอย่างเดียวเป็นศูนย์');
near(under.comparison.directorNetDiff, 0, 0.01, 'ต่ำกว่าเกณฑ์ · บล็อก 2 สองฝั่งเท่ากันเพราะไม่มีภาษีให้หัก');
// ท่านเดียวเงินเดือนก้อนเดียวกัน ภาษีไม่เป็นศูนย์ — พิสูจน์ว่าการหักยังทำงาน
const oneDir = E.computeCase({
  taxYear: Y, company: { paidUpCapital: 5000000 },
  directors: [{ id: 'd0', salary: 1500000, premiumAllocated: 1200000, allowances: { personal: 60000 }, donations: {} }],
  policy: { premiumTotal: 1200000, taxMethod: 'perpetual', allocationMode: 'auto' },
  financials: { years: ['', '', '2567'], revenues: ['', '', 20000000], profitsBeforeTax: ['', '', 5000000] },
  balance: {}, docs: {},
});
near(oneDir.salaryOnlyPitTotal, 200000, 0.01, 'ท่านเดียว · ภาษีเงินเดือนอย่างเดียว 200,000');
near(oneDir.comparison.before.directorNet, 1300000, 0.01, 'ท่านเดียว · ฝั่งปันผลถูกหักภาษีออกจริง');

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

// ── เพดานค่าลดหย่อนรายกลุ่ม ───────────────────────────────────────────────
// ชีตต้นฉบับครอบกลุ่มไว้ด้วยสูตร MIN() ยอดที่หักได้จริงจึงต้องไม่เกินเพดาน
section('เพดานค่าลดหย่อนรายกลุ่ม');
const TB = T.tableFor(Y);
const capped = E.sumAllowances({ personal: 60000, lifeInsurance: 100000, healthSelf: 25000, ssf: 200000, rmf: 400000 }, TB);
near(capped.groups.lifeHealth, 125000, 0.01, 'ยอดดิบกลุ่มประกันชีวิต+สุขภาพ');
near(capped.groups.retirement, 600000, 0.01, 'ยอดดิบกลุ่มเกษียณ');
near(capped.groupsCounted.lifeHealth, 100000, 0.01, 'กลุ่มประกันหักได้แค่เพดาน 100,000');
near(capped.groupsCounted.retirement, 500000, 0.01, 'กลุ่มเกษียณหักได้แค่เพดาน 500,000');
near(capped.rawTotal, 785000, 0.01, 'ยอดที่ผู้ใช้กรอกรวม 785,000');
near(capped.total, 660000, 0.01, 'ยอดที่หักได้จริง 60,000 + 100,000 + 500,000');
eq(capped.exceeded.length, 2, 'รายงานว่าเกินเพดานสองกลุ่ม');
near(capped.exceeded[0].excess, 25000, 0.01, 'ส่วนเกินกลุ่มประกัน 25,000');
// ไม่เกินเพดาน → ยอดดิบกับยอดที่หักได้ต้องเท่ากัน
const notCapped = E.sumAllowances({ personal: 60000, lifeInsurance: 80000, rmf: 300000 }, TB);
near(notCapped.total, notCapped.rawTotal, 0.01, 'ไม่เกินเพดาน → หักได้เต็มที่กรอก');
eq(notCapped.exceeded.length, 0, 'ไม่เกินเพดาน → ไม่มีรายการเกิน');
// ภาษีต้องคิดจากยอดหลังตัดเพดาน ไม่ใช่ยอดดิบ
const gCap = E.grossUpTax({ salary: 1400000, keymanPremium: 600000,
  allowances: { personal: 60000, lifeInsurance: 100000, healthSelf: 25000, ssf: 200000, rmf: 400000 } }, Y);
near(gCap.columnE.allowanceTotal, 660000, 0.01, 'ตารางภาษีใช้ค่าลดหย่อนหลังตัดเพดาน');
near(gCap.columnE.netIncome, 1400000 - 100000 - 660000, 0.01, 'เงินได้สุทธิคิดจากยอดหลังตัดเพดาน');

// ── กฎตรวจสอบ ─────────────────────────────────────────────────────────────
section('กฎตรวจสอบ CHK');
function baseCase(over) {
  const k = {
    taxYear: Y,
    company: { name: 'บริษัททดสอบ จำกัด', regNo: '0105557181201', paidUpCapital: 1000000 },
    financials: {
      years: ['2563', '2564', '2565'],
      revenues: [13413308.16, 21796187.29, 25533511.14],
      sga: [9000000, 9500000, 10000000],
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

let // ฐานคิดเบี้ย = ค่าใช้จ่ายในการขายและบริการ (ต่ำกว่าระหว่างปีล่าสุด 10,000,000 กับเฉลี่ย 9,500,000)
k = baseCase();
k.policy.premiumTotal = 2500000; k.directors[0].premiumAllocated = 2500000;
let r = E.runChecks(k, {});
eq(has(r, 'CHK-02'), true, 'เบี้ย+ภาษีที่ออกให้ เกิน 20% ของค่าใช้จ่ายในการขายและบริการ → CHK-02 บล็อก');
eq(r.canQuote, false, 'มีข้อบล็อก → canQuote = false');

k = baseCase(); r = E.runChecks(k, {});
eq(has(r, 'CHK-02'), false, 'ลดเบี้ยเหลือ 900,000 → CHK-02 ผ่าน');
eq(r.canQuote, true, 'ไม่มีข้อบล็อก → canQuote = true');
// ห้ามมีคำที่อ้างรายได้หรือกำไรเป็นที่มาของเบี้ยในข้อความ CHK ใด ๆ
const premiumTexts = r.items.filter((i) => i.code === 'CHK-02' || i.code === 'CHK-03')
  .map((i) => i.title + ' ' + (i.detail || '')).join(' ');
eq(/ของรายได้|ยอดขาย|ของกำไร/.test(premiumTexts), false, 'ข้อความ CHK-02/03 ต้องไม่อ้างรายได้หรือกำไรเป็นฐานคิดเบี้ย');
eq(premiumTexts.indexOf('ค่าใช้จ่ายในการขายและบริการ') >= 0, true, 'ข้อความ CHK-02/03 ต้องอ้างฐานค่าใช้จ่ายในการขายและบริการ');
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
// บริษัทที่ผลประกอบการติดลบ: CHK-03 ต้องเตือนโดยไม่โชว์ตัวเลขติดลบ และไม่มีคำต้องห้าม
const lossChk = r.items.filter((i) => i.code === 'CHK-03');
eq(lossChk.length, 1, 'ผลประกอบการติดลบ → ยังมี CHK-03 หนึ่งข้อ');
eq(/-[\d,]/.test(lossChk[0].title), false, 'หัวข้อ CHK-03 ไม่มีตัวเลขติดลบ');
eq(/ของรายได้|ยอดขาย|ของกำไร/.test(lossChk[0].title + lossChk[0].detail), false, 'CHK-03 ต้องไม่อ้างรายได้หรือกำไรเป็นฐานคิดเบี้ย');

// ── นำเข้าและช่องว่าง ─────────────────────────────────────────────────────
section('การอ่านตัวเลขและช่องว่าง');
eq(E.num(''), null, 'สตริงว่าง → null ไม่ใช่ 0');
eq(E.num('-'), null, 'ขีด → null');
eq(E.num('13,413,308.16'), 13413308.16, 'ตัวเลขที่เก็บเป็นข้อความมีคอมมา');
eq(E.num('(1,000.50)'), -1000.5, 'วงเล็บ = ค่าติดลบ');
eq(E.avg(['', 100, 200]), 150, 'ค่าเฉลี่ยข้ามช่องว่าง');
eq(E.avg(['', '']), null, 'ไม่มีข้อมูลเลย → null');

section('จัดสรรเบี้ยรายกรรมการ (สูตร C22 ของ Excel)');
const alloc3 = E.allocatePremium({ policy: { premiumTotal: 1000000 }, directors: [{}, {}, {}] });
eq(alloc3.mode, 'auto', 'ไม่ระบุโหมด → ใช้ auto');
eq(alloc3.perDirector.join('|'), '333333.33|333333.33|333333.34', 'เฉลี่ยเท่ากัน เศษไปรวมที่ท่านสุดท้าย');
near(alloc3.perDirector.reduce((a, b) => a + b, 0), 1000000, 0, 'ยอดจัดสรรรวมตรงกับเบี้ยรวมเป๊ะ (CHK-06 ต้องผ่าน)');
near(alloc3.average, 1000000 / 3, 0.0001, 'ค่าเฉลี่ยคนละ = เบี้ยรวม ÷ จำนวนกรรมการ');
const alloc1 = E.allocatePremium({ policy: { premiumTotal: 750000 }, directors: [{}] });
eq(alloc1.perDirector.join('|'), '750000', 'กรรมการคนเดียวได้เบี้ยทั้งก้อน');
const allocManual = E.allocatePremium({ policy: { premiumTotal: 1000000, allocationMode: 'manual' }, directors: [{ premiumAllocated: 700000 }, { premiumAllocated: 300000 }] });
eq(allocManual.mode, 'manual', 'โหมด manual ไม่แตะตัวเลขที่ผู้ใช้กรอก');
eq(allocManual.perDirector.join('|'), '700000|300000', 'โหมด manual คืนค่าที่กรอกไว้ตามเดิม');
eq(E.allocatePremium({ policy: { premiumTotal: 100 }, directors: [] }).perDirector.length, 0, 'ยังไม่มีกรรมการ → ไม่หารด้วยศูนย์');

// เบี้ยที่จัดสรรอัตโนมัติต้องทำให้ CHK-06 ผ่าน (ยอดตรงกันเสมอ)
const kAuto = baseCase();
kAuto.policy.premiumTotal = 900000;
kAuto.directors.push({ name: 'ข', salary: 600000, premiumAllocated: null, positionCriteria: 'กรรมการ', allowances: { personal: 60000 } });
kAuto.directors.push({ name: 'ค', salary: 600000, premiumAllocated: null, positionCriteria: 'กรรมการ', allowances: { personal: 60000 } });
const autoAmounts = E.allocatePremium(kAuto).perDirector;
kAuto.directors.forEach((d, i) => { d.premiumAllocated = autoAmounts[i]; });
const rAuto = E.runChecks(kAuto, {});
eq(rAuto.items.some((x) => x.code === 'CHK-06' && x.level === 'block'), false, 'จัดสรรอัตโนมัติแล้ว CHK-06 ไม่บล็อก');

section('เบี้ยประกันที่แนะนำ — ฐานค่าใช้จ่ายในการขายและบริการ');
// เคสจริงจากแฟ้ม Excel เดิม (ตัดไฟล์ที่งบซ้ำกันออกแล้ว) — ล็อกไว้กันสูตรเปลี่ยนโดยไม่ตั้งใจ
function recCase(sga, revenues, pbt, tax, nDirectors, salaryEach) {
  return {
    taxYear: Y,
    company: { paidUpCapital: 5000000 },
    financials: { years: ['2563', '2564', '2565'], sga, revenues, profitsBeforeTax: pbt, taxPaid: tax },
    directors: Array.from({ length: nDirectors }, () => ({ salary: salaryEach, allowances: { personal: 60000 } })),
    policy: { taxMethod: 'perpetual' },
  };
}
// สุนทรไทย — ไม่ถูกเพดานบีบ เบี้ยแนะนำใกล้กับที่เคยเสนอจริง 1,500,000
const recSun = E.recommendPremium(recCase(
  [14620720, 14620720, 15784478], [null, null, 25533511.14], [null, null, 9673985.31], [null, null, 1840912.27], 2, 1110000), Y);
near(recSun.base, 15008639.33, 0.5, 'ฐานคิดเบี้ย = ค่าที่ต่ำกว่าระหว่างปีล่าสุดกับเฉลี่ย 3 ปี');
near(recSun.levels[1].amount, 1500863.93, 0.5, 'ระดับแนะนำ = 10% ของฐาน');
near(recSun.suggested, 1500863.93, 0.5, 'ไม่ถูกเพดานบีบ → ใช้ระดับแนะนำเต็ม');
eq(recSun.suggested <= recSun.cap, true, 'เบี้ยแนะนำต้องไม่เกินเพดานของเคสนี้เสมอ');

// เอสเจ — ฐานะการเงินของกิจการเป็นตัวบีบ
const recSj = E.recommendPremium(recCase(
  [5240332.33, 10375476.30, 10857209.59], [32077355.87, 35578533.65, 54244192.14],
  [3123119.04, 2522143.45, 2835268.30], [680296.27, 521206.15, 617470.38], 3, 600000), Y);
near(recSj.base, 8824339.41, 0.5, 'เอสเจ · ฐานคิดเบี้ย');
near(recSj.cap, 443559.58, 0.5, 'เอสเจ · เพดานของเคสนี้');
eq(recSj.binding.key, 'financial', 'เอสเจ · ตัวที่บีบคือฐานะการเงินของกิจการ');
eq(recSj.suggested < recSj.levels[1].amount, true, 'เอสเจ · เบี้ยแนะนำถูกบีบต่ำกว่าค่ากลาง');

// ควอลิตี้ เกจ — กรรมการคนเดียวเงินเดือน 600,000 ค่าตอบแทนรายท่านเป็นตัวบีบ
const recQg = E.recommendPremium(recCase(
  [21760523, 21760523, 20592601], [null, null, 101502430], [null, null, 3786771.51], [null, null, 255322.38], 1, 600000), Y);
eq(recQg.binding.key, 'perDirector', 'ควอลิตี้ · ตัวที่บีบคือค่าตอบแทนรายกรรมการ');
near(recQg.cap, 600000, 0.5, 'ควอลิตี้ · เพดาน = ค่าจ้างทั้งปีของกรรมการท่านนั้น');
eq(recQg.levels[1].overCap, true, 'ควอลิตี้ · ระดับแนะนำเกินเพดาน ต้องขึ้นธงไว้');

// เพดานทุกตัวต้องแปลงเป็นสัดส่วนของฐานเดียวกันให้ชั้นหน้าจอใช้แสดง
recSj.caps.forEach((cp) => {
  eq(typeof cp.pctOfBase === 'number' && cp.pctOfBase > 0, true, 'เพดาน "' + cp.label + '" มีสัดส่วนต่อฐานให้แสดง');
  eq(/รายได้|ยอดขาย|กำไร/.test(cp.label), false, 'ป้ายเพดาน "' + cp.label + '" ต้องไม่มีคำว่ารายได้/ยอดขาย/กำไร');
});
eq(/ของรายได้|ยอดขาย|ของกำไร/.test(recSj.disclaimer), false, 'ข้อความกำกับต้องไม่อ้างรายได้หรือกำไรเป็นฐานคิดเบี้ย');

// ยังไม่มีงบ → บอกให้ไปนำเข้างบก่อน ไม่ใช่เดาตัวเลขให้
const recNone = E.recommendPremium({ taxYear: Y, financials: {}, directors: [{ salary: 600000 }], policy: {} }, Y);
eq(recNone.available, false, 'ไม่มีค่าใช้จ่ายในการขายและบริการ → ยังแนะนำเบี้ยไม่ได้');
eq(recNone.reason.indexOf('ค่าใช้จ่ายในการขายและบริการ') >= 0, true, 'บอกเหตุผลว่าขาดฐานอะไร');

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
