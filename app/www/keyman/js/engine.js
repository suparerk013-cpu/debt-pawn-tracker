// เอนจินคำนวณประกันคีย์แมน — บริสุทธิ์ ไม่มี DOM ไม่มี I/O ไม่มี network
// ────────────────────────────────────────────────────────────────────────────
// อัตราภาษีทุกตัวมาจาก tax-tables.js เท่านั้น ห้ามฝังตัวเลขอัตราไว้ในไฟล์นี้
// (ยกเว้นค่าคงที่ที่เป็น "ตรรกะ" เช่น จำนวนรอบสูงสุดของการวนภาษีทุกทอด)
//
// รันได้ทั้งบนเบราว์เซอร์ (global KeymanEngine) และบน node (require) เพื่อให้
// test/engine.test.js รันด้วย `node` เปล่า ๆ ได้โดยไม่ต้องมีเฟรมเวิร์ก
(function (root, factory) {
  const tables =
    typeof module === 'object' && module.exports
      ? require('./tax-tables.js')
      : root.KeymanTaxTables;
  const api = factory(tables);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KeymanEngine = api;
})(typeof self !== 'undefined' ? self : this, function (T) {
  'use strict';

  const MAX_ROUNDS = 50;          // เพดานรอบของ ป.96/2543 ข้อ 1(7)
  const CONVERGE_EPSILON = 0.01;  // ผลต่างสองรอบ < 1 สตางค์ = ลู่เข้าแล้ว

  // ── ค่าลดหย่อน 19 รายการ เรียงตามลำดับในไฟล์ Excel เดิม (แถว 15–33) ──────────
  const ALLOWANCE_FIELDS = [
    { key: 'personal', label: 'ค่าลดหย่อนส่วนตัว', ref: 'B15' },
    { key: 'spouse', label: 'ค่าลดหย่อนคู่สมรส (กรณีคู่สมรสไม่มีเงินได้)', ref: 'B16' },
    { key: 'child', label: 'ค่าลดหย่อนบุตร (ที่ไม่มีเงินได้*)', ref: 'B17' },
    { key: 'maternity', label: 'ค่าคลอดบุตร', ref: 'B18' },
    { key: 'parents', label: 'ค่าเลี้ยงดูบิดามารดา (ของเราและคู่สมรสกรณีคู่สมรสไม่มีเงินได้)', ref: 'B19' },
    { key: 'disabled', label: 'ค่าเลี้ยงดูผู้พิการหรือทุพพลภาพ', ref: 'B20' },
    { key: 'lifeInsurance', label: 'เบี้ยประกันชีวิตทั่วไป (อายุกรมธรรม์ 10 ปีขึ้นไป)', note: 'รวมกันไม่เกิน 100,000', group: 'lifeHealth', ref: 'B21' },
    { key: 'healthSelf', label: 'ค่าเบี้ยประกันสุขภาพตนเอง', note: 'รวมกันไม่เกิน 100,000', group: 'lifeHealth', ref: 'B22' },
    { key: 'healthParents', label: 'เบี้ยประกันสุขภาพบิดามารดา (เราและคู่สมรสกรณีไม่มีเงินได้)', ref: 'B23' },
    { key: 'ssf', label: 'ค่าซื้อกองทุนรวมเพื่อส่งเสริมการออมระยะยาว (SSF/SEF)', group: 'retirement', ref: 'B24' },
    { key: 'rmf', label: 'ค่าซื้อกองทุนรวมเพื่อการเลี้ยงชีพ (RMF)/กบข./กองทุนสำรองเลี้ยงชีพ', note: 'รวมกันไม่เกิน 500,000', group: 'retirement', ref: 'B25' },
    { key: 'nsf', label: 'กองทุนการออมแห่งชาติ (กอช.)', group: 'retirement', ref: 'B26' },
    { key: 'pension', label: 'เบี้ยประกันชีวิตแบบบำนาญ', group: 'retirement', ref: 'B27' },
    { key: 'socialSecurity', label: 'เงินสมทบกองทุนประกันสังคม', ref: 'B28' },
    { key: 'firstHome', label: 'โครงการบ้านหลังแรก (ซื้อระหว่าง 13 ต.ค. 58 – 31 ธ.ค. 59)', ref: 'B29' },
    { key: 'mortgage', label: 'ดอกเบี้ยซื้อที่อยู่อาศัย', ref: 'B30' },
    { key: 'debitCardFee', label: 'ค่าธรรมเนียมจากการรับชำระเงินด้วยบัตรเดบิต', ref: 'B31' },
    { key: 'politicalParty', label: 'บริจาคพรรคการเมือง', ref: 'B32' },
    { key: 'other', label: 'ค่าลดหย่อนอื่นๆ', ref: 'B33' },
  ];

  const DONATION_FIELDS = [
    { key: 'education', label: 'เงินบริจาคเพื่อการศึกษา การกีฬา การพัฒนาสังคม และโรงพยาบาลรัฐ', ref: 'B38' },
    { key: 'general', label: 'เงินบริจาคทั่วไป', ref: 'B39' },
  ];

  const DOC_FIELDS = [
    { key: 'welfareRule', label: 'ระเบียบสวัสดิการพนักงาน/กรรมการ (ระบุว่าบริษัทจ่ายเบี้ยให้กรรมการทุกคนเป็นการทั่วไป)' },
    { key: 'boardResolution', label: 'มติที่ประชุมคณะกรรมการ/ผู้ถือหุ้น อนุมัติการทำประกัน' },
    { key: 'policyReceipt', label: 'กรมธรรม์และใบเสร็จรับเงินเบี้ยประกันในชื่อบริษัท' },
    { key: 'pnd1', label: 'การนำส่ง ภ.ง.ด.1 รายเดือน (บันทึกเบี้ย+ภาษีเป็นเงินได้ ม.40(1) ของกรรมการ)' },
  ];

  // ── ตัวช่วยตัวเลข ────────────────────────────────────────────────────────
  const num = (v) => {
    if (v === null || v === undefined || v === '' || v === '-' || v === '–') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    const cleaned = String(v).replace(/,/g, '').replace(/\s/g, '').replace(/[()]/g, (m) => (m === '(' ? '-' : ''));
    if (cleaned === '' || cleaned === '-') return null;
    const n = Number(cleaned);
    return isFinite(n) ? n : null;
  };
  const n0 = (v) => num(v) || 0;                       // null → 0 (ใช้เฉพาะช่องกรอกเงิน)
  const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
  // ค่าเฉลี่ยที่ "ข้าม" ช่องว่าง — ห้ามนับ '' เป็น 0 ไม่งั้นค่าเฉลี่ยเพี้ยน
  const avg = (arr) => {
    const xs = (arr || []).map(num).filter((v) => v !== null);
    if (!xs.length) return null;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  };
  const lastN = (arr, n) => (arr || []).slice(-n);

  // ── ภาษีเงินได้บุคคลธรรมดา ม.48(1) ────────────────────────────────────────
  function pitTax(netIncome, year) {
    const t = T.tableFor(year);
    let net = num(netIncome) || 0;
    if (net <= 0) return 0;
    let tax = 0;
    for (const b of t.pitBrackets) {
      if (net <= b.over) break;
      tax += (Math.min(net, b.upTo) - b.over) * b.rate;
    }
    return tax;
  }

  // ── ภาษีเงินได้นิติบุคคล — กำไร ≤ 0 คืน 0 เสมอ ────────────────────────────
  function citTax(netProfit, isSme, year) {
    const t = T.tableFor(year);
    const p = num(netProfit) || 0;
    if (p <= 0) return 0;
    if (!isSme) return p * t.citGeneral;
    for (const step of t.citSme) {
      if (p > step.over) return step.base + (p - step.over) * step.rate;
    }
    return 0;
  }

  // อัตราภาษีส่วนเพิ่ม ณ ระดับกำไรนั้น (ใช้ถอดกลับหา คชจ.ต้องห้าม)
  function citMarginalRate(netProfit, isSme, year) {
    const t = T.tableFor(year);
    const p = num(netProfit) || 0;
    if (!isSme) return p > 0 ? t.citGeneral : 0;
    for (const step of t.citSme) {
      if (p > step.over) return step.rate;
    }
    return 0;
  }

  // ── SME: ระบบตัดสินเอง ผู้ใช้เลือกเองไม่ได้ ────────────────────────────────
  function determineSme({ paidUpCapital, revenueLatest }, year) {
    const t = T.tableFor(year);
    const cap = num(paidUpCapital);
    const rev = num(revenueLatest);
    const capitalOk = cap !== null && cap <= t.smePaidUpCapitalMax;
    const revenueOk = rev !== null && rev <= t.smeRevenueMax;
    const isSme = capitalOk && revenueOk;
    // ยังตัดสินไม่ได้ ≠ ไม่เข้าเกณฑ์ — ข้อมูลยังไม่ครบต้องบอกให้ต่างจากตัดสินแล้วว่าไม่เข้า
    const pending = (cap === null && rev === null) || (cap === null && revenueOk) || (rev === null && capitalOk);
    const reasons = [];
    if (cap === null) reasons.push('ยังไม่ได้กรอกทุนจดทะเบียนที่ชำระแล้ว');
    else if (!capitalOk) reasons.push(`ทุนชำระแล้ว ${fmt(cap)} บาท เกิน ${fmt(t.smePaidUpCapitalMax)} บาท`);
    if (rev === null) reasons.push('ยังไม่มีตัวเลขรายได้รวมปีล่าสุด (นำเข้างบกำไรขาดทุนที่แท็บ 2 ก่อน)');
    else if (!revenueOk) reasons.push(`รายได้รวมปีล่าสุด ${fmt(rev)} บาท เกิน ${fmt(t.smeRevenueMax)} บาท`);
    if (isSme) reasons.push(`ทุนชำระแล้ว ${fmt(cap)} ≤ ${fmt(t.smePaidUpCapitalMax)} และรายได้ ${fmt(rev)} ≤ ${fmt(t.smeRevenueMax)} ครบทั้งสองข้อ`);
    return {
      isSme,
      pending,
      capitalOk,
      revenueOk,
      paidUpCapital: cap,
      revenueLatest: rev,
      limits: { capital: t.smePaidUpCapitalMax, revenue: t.smeRevenueMax },
      reason: reasons.join(' · '),
    };
  }

  function fmt(v) {
    if (v === null || v === undefined) return '–';
    return Number(v).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ── ภาษีทุกทอด (gross-up) ป.96/2543 ข้อ 1(7) และ 1(8) ────────────────────
  // mode 'perpetual' = ออกให้ตลอดไป → วนจนลู่เข้า
  // mode 'once'      = ออกให้ครั้งเดียว → คำนวณ 2 รอบแล้วหยุด
  function grossUpTax(input, year, opts) {
    const o = opts || {};
    const mode = o.mode === 'once' ? 'once' : 'perpetual';
    const t = T.tableFor(year);
    const salary = n0(input && input.salary);
    const bonus = n0(input && input.bonus);
    const premium = n0(input && input.keymanPremium);
    const allowances = sumAllowances(input && input.allowances, t);
    const donations = sumDonations(input && input.donations);

    const step = (taxCarried) => {
      const totalIncome = salary + bonus + premium + taxCarried;
      const expense = Math.min(totalIncome * t.expenseRate, t.expenseCap);
      const afterAllowance = totalIncome - expense - allowances.total;
      const netIncome = Math.max(0, afterAllowance - donations.total);
      const tax = pitTax(netIncome, year);
      return {
        salaryBonus: salary + bonus,
        keymanPremium: premium,
        taxCarried,
        totalIncome,
        expense,
        allowanceTotal: allowances.total,
        afterAllowance,
        donationTotal: donations.total,
        netIncome,
        tax,
        effectiveRate: totalIncome > 0 ? tax / totalIncome : 0,
      };
    };

    // คอลัมน์ E ของ Excel — เงินเดือนอย่างเดียว ไม่มีเบี้ย ไม่มีภาษีออกให้ (ฝั่ง Before)
    const salaryOnlyIncome = salary + bonus;
    const salaryOnlyExpense = Math.min(salaryOnlyIncome * t.expenseRate, t.expenseCap);
    const salaryOnlyNet = Math.max(0, salaryOnlyIncome - salaryOnlyExpense - allowances.total - donations.total);
    const columnE = {
      label: 'เงินเดือนอย่างเดียว',
      salaryBonus: salaryOnlyIncome,
      keymanPremium: 0,
      taxCarried: 0,
      totalIncome: salaryOnlyIncome,
      expense: salaryOnlyExpense,
      allowanceTotal: allowances.total,
      afterAllowance: salaryOnlyIncome - salaryOnlyExpense - allowances.total,
      donationTotal: donations.total,
      netIncome: salaryOnlyNet,
      tax: pitTax(salaryOnlyNet, year),
      effectiveRate: salaryOnlyIncome > 0 ? pitTax(salaryOnlyNet, year) / salaryOnlyIncome : 0,
    };

    const trace = [];
    const maxRounds = mode === 'once' ? 2 : MAX_ROUNDS;
    let tax = 0;
    let lastDelta = Infinity;
    let rounds = 0;
    for (let i = 0; i < maxRounds; i++) {
      const row = step(tax);
      lastDelta = Math.abs(row.tax - tax);
      tax = row.tax;
      rounds = i + 1;
      // ทอดที่ 0 = คอลัมน์ F ของ Excel (เงินเดือน+เบี้ย ยังไม่มีภาษีออกให้)
      row.tier = i;
      row.label = i === 0 ? 'รายได้ + สวัสดิการ' : `ออกให้ทอดที่ ${i}`;
      row.ref = i === 0 ? 'F' : columnLetter(6 + i); // F, H, I, J, ... ตาม Excel (ทอดที่ 1 = คอลัมน์ H)
      trace.push(row);
      if (mode === 'perpetual' && lastDelta < CONVERGE_EPSILON) break;
    }

    const converged = mode === 'once' ? true : lastDelta < CONVERGE_EPSILON;
    return {
      mode,
      tax,
      rounds,                       // จำนวนคอลัมน์ที่กางจริง (นับคอลัมน์ F เป็นรอบแรก)
      tiers: Math.max(0, rounds - 1), // "ลู่เข้าที่ทอดที่ N"
      lastDelta: lastDelta === Infinity ? 0 : lastDelta,
      converged,
      trace: o.trace === false ? [] : trace,
      columnE,
      salaryOnlyTax: columnE.tax,
      allowances,
      donations,
      monthlyWithholding: tax / 12,   // ยอดหัก ณ ที่จ่ายต่อเดือน (ภ.ง.ด.1)
      taxYear: t.year,
    };
  }

  // ตัวอักษรคอลัมน์แบบ Excel (0 = A) — ใช้ทำป้ายเลขอ้างอิงเซลล์เดิม
  function columnLetter(index) {
    let s = '';
    let i = index;
    while (i >= 0) {
      s = String.fromCharCode(65 + (i % 26)) + s;
      i = Math.floor(i / 26) - 1;
    }
    return s;
  }

  // เพดานรายกลุ่มเป็นเพดานจริง ไม่ใช่แค่คำเตือน — ชีตต้นฉบับใช้สูตร MIN() ครอบไว้
  // และตามกฎหมายส่วนที่เกินก็ใช้ลดหย่อนไม่ได้อยู่แล้ว total จึงต้องเป็นยอดหลังตัดเพดาน
  // ส่วน groups เก็บยอดดิบไว้ให้ CHK-12 กับหน้าจอบอกได้ว่าเกินไปเท่าไร
  function sumAllowances(allowances, table) {
    const a = allowances || {};
    const byKey = {};
    const groups = {};
    let ungrouped = 0;
    for (const f of ALLOWANCE_FIELDS) {
      const v = n0(a[f.key]);
      byKey[f.key] = v;
      if (f.group) groups[f.group] = (groups[f.group] || 0) + v;
      else ungrouped += v;
    }
    const caps = (table && table.groupCaps) || {};
    const groupsCounted = {};
    let grouped = 0;
    let rawGrouped = 0;
    Object.keys(groups).forEach((g) => {
      const cap = caps[g];
      groupsCounted[g] = cap === undefined ? groups[g] : Math.min(groups[g], cap);
      grouped += groupsCounted[g];
      rawGrouped += groups[g];
    });
    const exceeded = Object.keys(groups)
      .filter((g) => caps[g] !== undefined && groups[g] > caps[g])
      .map((g) => ({ group: g, total: groups[g], cap: caps[g], excess: groups[g] - caps[g] }));
    return {
      total: ungrouped + grouped,        // ยอดที่เอาไปหักจริง (ตัดเพดานแล้ว)
      rawTotal: ungrouped + rawGrouped,  // ยอดที่ผู้ใช้กรอกมาทั้งหมด
      byKey, groups, groupsCounted, caps, exceeded,
    };
  }

  function sumDonations(donations) {
    const d = donations || {};
    const byKey = {};
    let total = 0;
    for (const f of DONATION_FIELDS) {
      const v = n0(d[f.key]);
      byKey[f.key] = v;
      total += v;
    }
    return { total, byKey };
  }

  // ── ค่าใช้จ่ายต้องห้าม (ถอดกลับจากภาษีที่จ่ายเกิน) ─────────────────────────
  function forbiddenExpense({ profitBeforeTax, taxPaid, isSme }, year) {
    const profit = num(profitBeforeTax);
    const paid = num(taxPaid);
    const expectedTax = citTax(profit, isSme, year);
    const marginalRate = citMarginalRate(profit, isSme, year);
    const excessTax = (paid || 0) - expectedTax;
    let raw = null;
    if (marginalRate > 0) raw = excessTax / marginalRate;
    const notes = [];
    let hidden = false;

    if (profit === null || paid === null) {
      hidden = true;
      notes.push('ยังไม่มีตัวเลขกำไรก่อนภาษีหรือภาษีเงินได้ของปีนี้ครบ จึงยังคำนวณไม่ได้');
    } else if (profit <= 0) {
      hidden = true;
      notes.push('บริษัทขาดทุนในปีนี้ ภาษีที่ควรจะเป็นคือ 0 จึงไม่มีฐานให้ถอดกลับหาค่าใช้จ่ายต้องห้าม');
    } else if (marginalRate === 0) {
      hidden = true;
      notes.push('กำไรอยู่ในช่วงที่ได้รับยกเว้นภาษี (SME กำไรไม่เกิน 300,000 บาท) จึงไม่มีอัตราส่วนเพิ่มให้ถอดกลับ');
    } else if (excessTax < 0) {
      hidden = true;
      notes.push(
        'ภาษีที่จ่ายจริงต่ำกว่าภาษีที่ควรจะเป็น — เป็นไปได้ว่ามีผลขาดทุนสะสมยกมา สิทธิ BOI ' +
        'รายได้ที่ได้รับยกเว้น หรือเครดิตภาษีอื่น ระบบจึงไม่แสดงตัวเลขค่าใช้จ่ายต้องห้ามให้'
      );
    }

    const amount = hidden ? 0 : Math.max(0, raw || 0);
    return {
      expectedTax,
      taxPaid: paid,
      excessTax,
      marginalRate,
      raw,
      amount,
      hidden,
      note: notes.join(' '),
      effectiveRate: profit ? (paid || 0) / profit : null,
    };
  }

  // ── ฐานคิดเบี้ยประกัน ────────────────────────────────────────────────────
  // ฐานเดียวที่ใช้อธิบายที่มาของเบี้ยทั้งแอปคือ "ค่าใช้จ่ายในการขายและบริการ" (SG&A)
  // เพราะเบี้ยคีย์แมนถูกบันทึกลงบรรทัดนั้นจริง — ตัวเลขที่คำนวณจากบรรทัดอื่นมีไว้เป็น
  // ตัวคุมภายในเท่านั้น และต้องแปลงกลับเป็น % ของฐานนี้ก่อนแสดงเสมอ (ห้ามพิมพ์ฐานอื่น)
  const PREMIUM_BAND = { low: 0.08, mid: 0.10, high: 0.12 };  // ช่วงที่ได้จากเคสจริงในแฟ้มเดิม
  const BOOKED_SHARE_CAP = 0.20;                              // เบี้ย+ภาษีทุกทอด ไม่เกิน 20% ของฐาน

  function premiumCeiling({ revenues, profitsBeforeTax, taxPaidLatest, sga, netProfits }) {
    const avgRevenue = avg(lastN(revenues, 3));
    const avgProfit = avg(lastN(profitsBeforeTax, 3));
    const tax = num(taxPaidLatest);
    // ฐานคิดเบี้ย: ใช้ค่าที่ต่ำกว่าระหว่างปีล่าสุดกับค่าเฉลี่ย 3 ปี เพื่อไม่ให้ปีที่สูงผิดปกติดันเบี้ยขึ้น
    const sgaLatest = lastValue(sga);
    const sgaAvg = avg(lastN(sga, 3));
    const base = sgaLatest === null ? sgaAvg : (sgaAvg === null ? sgaLatest : Math.min(sgaLatest, sgaAvg));
    return {
      // ── ฐานที่ใช้แสดงผลได้ ──
      base,
      sgaLatest,
      sgaAvg,
      band: base === null ? null : { low: base * PREMIUM_BAND.low, mid: base * PREMIUM_BAND.mid, high: base * PREMIUM_BAND.high },
      bookedShareCap: base === null ? null : base * BOOKED_SHARE_CAP,
      // ── ตัวคุมภายใน ห้ามพิมพ์ตรง ๆ ใช้แปลงเป็น % ของ base ก่อนแสดง ──
      avgRevenue,
      avgProfit,
      netProfitLatest: lastValue(netProfits),
      ceiling5pctAvgRevenue: avgRevenue === null ? null : avgRevenue * 0.05,
      target2to3pct: avgRevenue === null ? null : { low: avgRevenue * 0.02, high: avgRevenue * 0.03 },
      ceiling30pctAvgProfit: avgProfit === null ? null : avgProfit * 0.30,
      reference20pctTax: tax === null ? null : tax * 0.20,
      // ข้อความกำกับที่ต้องติดไปกับตัวเลขเสมอ
      disclaimer:
        'ช่วงเบี้ยที่แนะนำเป็นแนวปฏิบัติจากเคสจริง ไม่ใช่อัตราที่กำหนดไว้ในประมวลรัษฎากร — ' +
        'กฎหมายเขียนไว้เพียงว่ารายจ่ายต้องเป็นไปเพื่อกิจการโดยเฉพาะ (ม.65 ตรี (13)) และต้องจ่ายให้กรรมการ' +
        'ทุกคนเป็นการทั่วไปตามระเบียบสวัสดิการ (กค 0811/408)',
    };
  }

  // ── เบี้ยประกันที่แนะนำ ───────────────────────────────────────────────────
  // คืนช่วงเบี้ย 3 ระดับจากฐานค่าใช้จ่ายในการขายและบริการ พร้อม "เพดานของเคสนี้"
  // ที่บีบด้วยตัวคุมภายใน 4 ตัว — ทุกค่าที่คืนออกไปมี pctOfBase ให้แสดงเป็น % ของฐานเดียวกัน
  function recommendPremium(kase, year) {
    const fin = (kase && kase.financials) || {};
    const policy = (kase && kase.policy) || {};
    const directors = (kase && kase.directors) || [];
    const mode = policy.taxMethod === 'once' ? 'once' : 'perpetual';
    const netProfits = (fin.profitsBeforeTax || []).map((p, i) => {
      const pbt = num(p);
      const t = num((fin.taxPaid || [])[i]);
      return pbt === null ? null : pbt - (t || 0);
    });
    const ceiling = premiumCeiling({
      revenues: fin.revenues, profitsBeforeTax: fin.profitsBeforeTax,
      taxPaidLatest: lastValue(fin.taxPaid), sga: fin.sga, netProfits,
    });
    const base = ceiling.base;
    const pct = (v) => (base && v !== null && v !== undefined ? v / base : null);

    if (!base || base <= 0) {
      return {
        available: false,
        reason: 'ยังไม่มีตัวเลขค่าใช้จ่ายในการขายและบริการ — นำเข้างบกำไรขาดทุนที่แท็บ 2 ก่อน',
        base: null, ceiling,
      };
    }

    // ภาษีทุกทอดรวมทุกท่าน เมื่อเบี้ยรวมเท่ากับ p (จัดสรรตามโหมดที่เลือกไว้)
    const grossUpAt = (p) => {
      if (!directors.length) return 0;
      const alloc = allocationFor(kase, p);
      return directors.reduce((sum, d, i) => sum + grossUpTax({
        salary: d.salary, bonus: d.bonus, keymanPremium: alloc[i],
        allowances: d.allowances, donations: d.donations,
      }, year, { mode, trace: false }).tax, 0);
    };
    const bookedAt = (p) => p + grossUpAt(p);

    // หาเบี้ยสูงสุดที่ยังทำให้ fn(p) ไม่เกิน limit (fn เพิ่มตามเบี้ยเสมอ จึงหาด้วยการแบ่งครึ่ง)
    const solve = (fn, limit, hi) => {
      if (limit === null || limit === undefined) return null;
      if (limit <= 0) return 0;
      let lo = 0; let high = Math.max(hi, 1);
      if (fn(high) <= limit) return high;
      for (let i = 0; i < 44; i++) {
        const mid = (lo + high) / 2;
        if (fn(mid) <= limit) lo = mid; else high = mid;
      }
      return lo;
    };

    const searchTop = base * 2;
    const caps = [];
    // 1) ยอดบันทึกเป็นรายจ่าย (เบี้ย + ภาษีทุกทอด) ไม่เกิน 20% ของฐาน — พูดได้ตรง ๆ
    caps.push({
      key: 'bookedShare',
      label: 'สัดส่วนต่อฐาน',
      detail: 'ยอดที่บันทึกเป็นรายจ่าย (เบี้ย + ภาษีที่บริษัทออกให้) ไม่ควรเกิน 20% ของฐานคิดเบี้ย',
      value: solve(bookedAt, ceiling.bookedShareCap, searchTop),
    });
    // 2) ฐานะการเงินของกิจการ — ตัวคุมภายใน (คิดจากผลประกอบการปีล่าสุด) ห้ามพิมพ์ฐานนี้
    if (ceiling.netProfitLatest !== null) {
      caps.push({
        key: 'financial',
        label: 'ฐานะการเงินของกิจการ',
        detail: 'เบี้ยที่เสนอต้องอยู่ในวิสัยที่ผลประกอบการของกิจการรองรับได้อย่างต่อเนื่องตลอดอายุการชำระเบี้ย',
        value: Math.max(0, ceiling.netProfitLatest * 0.20),   // เกณฑ์คิดกับตัวเบี้ย ไม่รวมภาษีที่ออกให้
      });
    }
    // 3) กิจการต้องไม่ติดลบหลังบันทึกรายจ่ายชุดนี้
    const pbtLatest = lastValue(fin.profitsBeforeTax);
    if (pbtLatest !== null) {
      caps.push({
        key: 'solvency',
        label: 'ความสามารถรองรับรายจ่ายของปีล่าสุด',
        detail: 'ยอดที่บันทึกเป็นรายจ่ายต้องไม่มากกว่าที่ผลประกอบการปีล่าสุดรองรับไหว',
        value: solve(bookedAt, Math.max(0, pbtLatest), searchTop),
      });
    }
    // 4) ค่าตอบแทนรายกรรมการ — เบี้ยของแต่ละท่านไม่ควรเกินค่าจ้างทั้งปีของท่านนั้น
    if (directors.length) {
      const pays = directors.map((d) => n0(d.salary) + n0(d.bonus));
      const minPay = Math.min.apply(null, pays);
      const sumPay = pays.reduce((a, b) => a + b, 0);
      const capPay = policy.allocationMode === 'manual' ? sumPay : minPay * directors.length;
      caps.push({
        key: 'perDirector',
        label: 'ค่าตอบแทนรายกรรมการ',
        detail: 'เบี้ยที่จัดสรรให้กรรมการแต่ละท่าน ไม่ควรเกินค่าจ้างทั้งปีของท่านนั้น เพื่อให้อธิบายความสมเหตุสมผลได้',
        value: capPay,
      });
    }

    const usable = caps.filter((c) => c.value !== null && isFinite(c.value));
    const binding = usable.length ? usable.reduce((a, b) => (b.value < a.value ? b : a)) : null;
    const cap = binding ? binding.value : null;
    const levels = ['low', 'mid', 'high'].map((k) => ({
      key: k,
      label: k === 'low' ? 'ระมัดระวัง' : k === 'mid' ? 'แนะนำ' : 'สูงสุดที่อธิบายได้',
      pct: PREMIUM_BAND[k],
      amount: ceiling.band[k],
      overCap: cap !== null && ceiling.band[k] > cap,
    }));
    const suggested = cap === null ? ceiling.band.mid : Math.min(ceiling.band.mid, cap);
    // เพดานเหลือศูนย์ = โครงสร้างนี้ยังไม่เหมาะกับกิจการขนาดนี้ ต้องบอกตรง ๆ ไม่ใช่โชว์ 0.00
    const notViable = cap !== null && cap <= 0;

    return {
      available: true,
      notViable,
      base,
      sgaLatest: ceiling.sgaLatest,
      sgaAvg: ceiling.sgaAvg,
      levels,
      cap,
      capPct: pct(cap),
      binding,
      caps: usable.map((c) => Object.assign({}, c, { pctOfBase: pct(c.value) })),
      suggested,
      suggestedPct: pct(suggested),
      capBelowBand: cap !== null && cap < ceiling.band.low,
      perDirector: directors.length ? suggested / directors.length : null,
      grossUpAtSuggested: grossUpAt(suggested),
      bookedAtSuggested: bookedAt(suggested),
      ceiling,
      disclaimer: ceiling.disclaimer,
    };
  }

  // จัดสรรเบี้ยรวม p ให้กรรมการตามโหมดที่เคสเลือกไว้ (ใช้ภายใน recommendPremium)
  function allocationFor(kase, p) {
    const directors = (kase && kase.directors) || [];
    const policy = (kase && kase.policy) || {};
    if (!directors.length) return [];
    if (policy.allocationMode === 'manual') {
      const current = directors.map((d) => n0(d.premiumAllocated));
      const total = current.reduce((a, b) => a + b, 0);
      if (total > 0) return current.map((v) => (v / total) * p);
    }
    return directors.map(() => p / directors.length);
  }

  // ── เทียบ After (เบี้ยคีย์แมน) กับ Before (ปล่อยเป็นกำไรแล้วปันผล) ────────
  function compareScenarios(input, year) {
    const t = T.tableFor(year);
    const premium = n0(input.premiumTotal);
    const allTierTax = n0(input.allTierTaxTotal);
    const salaryTotal = n0(input.salaryTotal);
    const salaryOnlyPit = n0(input.salaryOnlyPitTotal);
    const profit = n0(input.profitBeforeTax);
    const isSme = !!input.isSme;
    const lump = input.lumpSum === undefined || input.lumpSum === null ? premium : n0(input.lumpSum);

    // After — จ่ายเป็นเบี้ยคีย์แมน + ภาษีทุกทอด
    const totalExpense = premium + allTierTax;
    const citBefore = citTax(profit, isSme, year);
    const citAfter = citTax(profit - totalExpense, isSme, year);
    const citSaving = citBefore - citAfter;          // คำนวณสองครั้ง ไม่ใช่คูณอัตราเดียว
    const afterNetTax = allTierTax - citSaving;
    const after = {
      premium,
      allTierTax,
      totalExpense,
      citSaving,
      netTax: afterNetTax,
      ownerCash: salaryTotal + premium,              // ไม่ถูกหัก เพราะบริษัทออกภาษีให้
      // เงินเดือน+โบนัสที่กรรมการรับจริง — ฝั่งนี้รับเต็มเพราะบริษัทออกภาษีให้ (ชีตเดิม: "กรรมการรับเงินเดือน, โบนัสจริง")
      directorNet: salaryTotal,
      dividendTax: 0,
      profitAfter: profit - totalExpense,
      cit: citAfter,
    };

    // Before — ปล่อยเป็นกำไร เสียภาษีนิติ แล้วปันผล
    const citOnLump = citTax(profit, isSme, year) - citTax(profit - lump, isSme, year);
    const dividendBase = Math.max(0, lump - citOnLump);
    const dividendTax = dividendBase * t.dividendWht;
    const before = {
      lumpSum: lump,
      personalTax: salaryOnlyPit,
      cit: citOnLump,
      dividendTax,
      totalTax: salaryOnlyPit + citOnLump + dividendTax,
      ownerCash: salaryTotal - salaryOnlyPit + (lump - citOnLump - dividendTax),
      directorNet: salaryTotal - salaryOnlyPit,      // ฝั่งนี้ถูกหักภาษีไว้ก่อน
      totalExpense: 0,
      profitAfter: profit,
      citFull: citBefore,
    };

    const caveats = [
      'ฝั่ง Before คิดภาษีเงินปันผล 10% เป็นภาษีสุดท้าย (final tax) — ผู้ถือหุ้นอาจเลือกนำเงินปันผลไปรวมคำนวณ' +
        'ภาษีสิ้นปีพร้อมใช้เครดิตภาษีเงินปันผล และอาจได้เงินคืนมากกว่าตัวเลขนี้',
      'ฝั่ง After ยังไม่ได้หักผลของเงินสดที่จมอยู่ในกรมธรรม์ ต้องดูตารางมูลค่าเวนคืนรายปีประกอบเสมอ',
      'ตัวเลขชุดนี้เป็นภาพของปีเดียว ควรกางกระแสเงินสดตลอดอายุการชำระเบี้ยก่อนตัดสินใจ',
    ];
    if (input.beneficiary === 'company') {
      caveats.push(
        'บริษัทเป็นผู้รับผลประโยชน์ — ค่าสินไหมที่บริษัทได้รับถือเป็นรายได้ที่ต้องเสียภาษีเงินได้นิติบุคคล ' +
          '(กค 0706/7251 ข้อ 3) ต่างจากกรณีทายาทกรรมการรับซึ่งได้รับยกเว้นตาม ม.42(13)'
      );
    }

    return {
      after,
      before,
      profitBeforeTax: profit,
      profitAfter: after.profitAfter,
      citBefore,
      citAfter,
      isSme,
      salaryTotal,
      taxDiff: before.totalTax - after.netTax,
      cashDiff: after.ownerCash - before.ownerCash,
      directorNetDiff: after.directorNet - before.directorNet,
      caveats,
      // เคสที่บริษัทไม่เคยเสียภาษีเลย → ไม่มีผลประหยัดให้คำนวณ ต้องบอกตรง ๆ
      noTaxBenefit: citBefore <= 0,
    };
  }

  // ── ลายนิ้วมือชุดตัวเลขงบ (CHK-05 ใช้จับงบซ้ำข้ามเคส) ─────────────────────
  function fingerprint(financials) {
    const f = financials || {};
    const parts = []
      .concat((f.years || []).map((y) => String(y)))
      .concat([f.revenues, f.profitsBeforeTax, f.taxPaid].map((arr) =>
        (arr || []).map((v) => (num(v) === null ? '' : round2(num(v)).toFixed(2))).join('|')
      ));
    const s = parts.join('#');
    if (!s.replace(/[#|]/g, '')) return null; // ยังไม่มีตัวเลขเลย ไม่ต้องมี fingerprint
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 + c, 2654435761) >>> 0;
    }
    return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
  }

  // ── กฎตรวจสอบ CHK-01 … CHK-12 ────────────────────────────────────────────
  // ctx = { duplicateOf, taxYearInfo } — ข้อมูลที่เอนจินหาเองไม่ได้
  function runChecks(kase, ctx) {
    const c = ctx || {};
    const year = (kase && kase.taxYear) || T.DEFAULT_YEAR;
    const yearInfo = c.taxYearInfo || T.resolveTaxYear(year);
    const fin = (kase && kase.financials) || {};
    const policy = (kase && kase.policy) || {};
    const directors = (kase && kase.directors) || [];
    const out = [];
    const add = (code, level, title, detail) => out.push({ code, level, title, detail });

    const revenues = fin.revenues || [];
    const revenueLatest = (() => {
      for (let i = revenues.length - 1; i >= 0; i--) if (num(revenues[i]) !== null) return num(revenues[i]);
      return null;
    })();
    const sme = determineSme({ paidUpCapital: kase && kase.company && kase.company.paidUpCapital, revenueLatest }, year);
    const netProfits = (fin.profitsBeforeTax || []).map((p, i) => {
      const pbt = num(p);
      const t = num((fin.taxPaid || [])[i]);
      return pbt === null ? null : pbt - (t || 0);
    });
    const ceiling = premiumCeiling({
      revenues,
      profitsBeforeTax: fin.profitsBeforeTax || [],
      taxPaidLatest: lastValue(fin.taxPaid),
      sga: fin.sga,
      netProfits,
    });
    const premiumTotal = n0(policy.premiumTotal);
    const rec = recommendPremium(kase, year);
    const bookedTotal = premiumTotal + (c.grossUps || []).reduce((s, g) => s + (g && g.tax ? g.tax : 0), 0);
    const pctOfBase = (v) => (ceiling.base ? (v / ceiling.base * 100).toFixed(2) + '%' : '–');

    // CHK-01 — รายงานผลตัดสิน SME
    add('CHK-01', 'info',
      sme.pending ? 'ยังตัดสินสถานะ SME ไม่ได้ — ข้อมูลไม่ครบ'
        : sme.isSme ? 'เข้าเกณฑ์ SME (ใช้อัตรา 15%/20% แบบขั้นบันได)' : 'ไม่เข้าเกณฑ์ SME (ใช้อัตรา 20% ตลอด)',
      sme.reason);

    // CHK-02 — ยอดที่บันทึกเป็นรายจ่าย (เบี้ย + ภาษีที่บริษัทออกให้) เทียบกับฐานคิดเบี้ย = บล็อก
    // ฐานเดียวที่อ้างได้คือค่าใช้จ่ายในการขายและบริการ ตัวเลขจากบรรทัดอื่นเป็นตัวคุมภายในเท่านั้น
    if (ceiling.base === null) {
      add('CHK-02', 'warn', 'ยังตรวจสัดส่วนเบี้ยไม่ได้',
        'ยังไม่มีตัวเลขค่าใช้จ่ายในการขายและบริการในงบกำไรขาดทุน — นำเข้างบที่แท็บ 2 ก่อน');
    } else if (bookedTotal > ceiling.bookedShareCap) {
      add('CHK-02', 'block', 'ยอดที่บันทึกเป็นรายจ่ายเกิน 20% ของค่าใช้จ่ายในการขายและบริการ',
        `เบี้ย + ภาษีที่บริษัทออกให้ รวม ${fmt(bookedTotal)} บาท = ${pctOfBase(bookedTotal)} ของฐาน ` +
        `(เพดาน ${fmt(ceiling.bookedShareCap)} บาท) — ${ceiling.disclaimer}`);
    } else {
      add('CHK-02', 'info', 'สัดส่วนเบี้ยต่อค่าใช้จ่ายในการขายและบริการอยู่ในเกณฑ์',
        `เบี้ย + ภาษีที่บริษัทออกให้ รวม ${fmt(bookedTotal)} บาท = ${pctOfBase(bookedTotal)} ของฐาน ` +
        `(ช่วงที่แนะนำคือ 8–12% ของฐาน = ${fmt(ceiling.band.low)}–${fmt(ceiling.band.high)} บาท)`);
    }

    // CHK-03 — เบี้ยที่เสนอสูงกว่าเพดานของเคสนี้ = เตือน (แสดงเป็น % ของฐานเดียวกันเสมอ)
    if (rec.available && rec.cap !== null && premiumTotal > rec.cap) {
      add('CHK-03', 'warn', `เบี้ยที่เสนอสูงกว่าเพดานของเคสนี้ (${pctOfBase(rec.cap)} ของค่าใช้จ่ายในการขายและบริการ)`,
        `เบี้ยที่เสนอ ${fmt(premiumTotal)} บาท = ${pctOfBase(premiumTotal)} ของฐาน · เพดานของเคสนี้ ${fmt(rec.cap)} บาท ` +
        `— ตัวที่บีบคือ${rec.binding ? '"' + rec.binding.label + '"' : 'เกณฑ์ภายใน'} ` +
        'ถ้ายังยืนเบี้ยเท่านี้ ต้องเตรียมเหตุผลและเอกสารรองรับเป็นพิเศษ');
    } else if (rec.available && rec.capBelowBand && premiumTotal > 0) {
      add('CHK-03', 'warn', 'ฐานะการเงินของกิจการยังรองรับเบี้ยได้จำกัด',
        `เพดานของเคสนี้อยู่ที่ ${fmt(rec.cap)} บาท (${pctOfBase(rec.cap)} ของค่าใช้จ่ายในการขายและบริการ) ` +
        'ต่ำกว่าช่วงที่แนะนำ — ควรเสนอด้วยเหตุผลด้านสวัสดิการและการรักษาคนสำคัญควบคู่ไปด้วย');
    }

    // CHK-04 — คชจ.ต้องห้ามได้ค่าติดลบ → ซ่อนตัวเลข
    const latestProfit = lastValue(fin.profitsBeforeTax);
    const latestTax = lastValue(fin.taxPaid);
    const forb = forbiddenExpense({ profitBeforeTax: latestProfit, taxPaid: latestTax, isSme: sme.isSme }, year);
    if (forb.hidden && forb.note) add('CHK-04', 'warn', 'ไม่แสดงตัวเลขค่าใช้จ่ายต้องห้าม', forb.note);

    // CHK-05 — งบซ้ำกับเคสอื่น
    if (c.duplicateOf) {
      add('CHK-05', 'block', 'ชุดตัวเลขงบการเงินซ้ำกับเคสอื่นในระบบ',
        `ตรงกับเคส "${c.duplicateOf}" — ตรวจว่านำเข้าไฟล์ผิดบริษัทหรือไม่ ก่อนใช้งบชุดนี้ต่อ`);
    }

    // CHK-06 — การจัดสรรเบี้ยรายกรรมการ
    const allocated = directors.reduce((s, d) => s + n0(d.premiumAllocated), 0);
    const withPremium = directors.filter((d) => n0(d.premiumAllocated) > 0);
    if (!directors.length) {
      add('CHK-06', 'block', 'ยังไม่มีรายชื่อกรรมการ', 'ต้องมีรายชื่อกรรมการและเบี้ยที่จัดสรรรายคนก่อนออกใบเสนอ');
    } else if (!withPremium.length) {
      add('CHK-06', 'block', 'ยังไม่ได้จัดสรรเบี้ยรายกรรมการ', 'ต้องระบุเบี้ยที่จัดสรรให้กรรมการแต่ละท่าน');
    } else {
      if (Math.abs(allocated - premiumTotal) > 0.5) {
        add('CHK-06', 'block', 'ยอดจัดสรรรายคนไม่ตรงกับเบี้ยรวม',
          `จัดสรรรวม ${fmt(allocated)} บาท แต่เบี้ยรวมที่ระบุคือ ${fmt(premiumTotal)} บาท (ต่างกัน ${fmt(Math.abs(allocated - premiumTotal))} บาท)`);
      }
      if (withPremium.length < directors.length) {
        add('CHK-06', 'warn', 'มีกรรมการที่ไม่ได้รับเบี้ย',
          `${directors.length - withPremium.length} ท่านจาก ${directors.length} ท่านไม่ได้รับเบี้ย — หนังสือตอบข้อหารือ กค 0811/408 ` +
          'ให้หักเป็นรายจ่ายได้เมื่อ "จ่ายให้กรรมการทุกคนเป็นการทั่วไป" ถ้าจ่ายไม่ครบทุกคนต้องมีเกณฑ์ตามระดับตำแหน่งรองรับ');
      }
      if (directors.some((d) => !String(d.positionCriteria || '').trim())) {
        add('CHK-06', 'warn', 'ยังไม่ระบุเกณฑ์ตามระดับตำแหน่ง',
          'ต้องเขียนเกณฑ์การจัดสรรตามระดับตำแหน่งไว้ในระเบียบสวัสดิการ ไม่ใช่กำหนดเป็นรายบุคคลตามอำเภอใจ');
      }
    }

    // CHK-07 — ลูปภาษีทุกทอดไม่ลู่เข้า
    const nonConverged = (c.grossUps || []).filter((g) => g && g.converged === false);
    if (nonConverged.length) {
      add('CHK-07', 'block', 'ลูปภาษีทุกทอดไม่ลู่เข้า',
        `มี ${nonConverged.length} ท่านที่คำนวณครบ ${MAX_ROUNDS} รอบแล้วผลต่างยังไม่ต่ำกว่า ${CONVERGE_EPSILON} บาท — ตรวจตัวเลขเงินเดือน/เบี้ย/ค่าลดหย่อนอีกครั้ง`);
    }

    // CHK-08 — ไม่มีตารางภาษีของปีที่ออกใบเสนอ
    if (yearInfo.fallback) {
      add('CHK-08', 'warn', `ยังไม่มีตารางภาษีของปี ${yearInfo.requested}`,
        `ระบบใช้ตารางของปี ${yearInfo.year} แทน — ตรวจสอบอัตราภาษีและค่าลดหย่อนของปี ${yearInfo.requested} แล้วเพิ่มลงใน tax-tables.js ก่อนใช้ตัวเลขจริง`);
    }

    // CHK-09 — เอกสารกำกับ 4 ข้อ
    const docs = (kase && kase.docs) || {};
    const missing = DOC_FIELDS.filter((d) => !docs[d.key]);
    if (missing.length) {
      add('CHK-09', 'block', `ขาดเอกสารกำกับ ${missing.length} รายการ`, missing.map((m) => m.label).join(' · '));
    }

    // CHK-10 — ผู้รับผลประโยชน์
    if (!policy.beneficiary) {
      add('CHK-10', 'warn', 'ยังไม่ระบุผู้รับผลประโยชน์', 'ต้องระบุว่าเป็นบริษัท หรือทายาทของกรรมการ เพราะผลทางภาษีของค่าสินไหมต่างกัน');
    } else if (policy.beneficiary === 'company') {
      add('CHK-10', 'warn', 'บริษัทเป็นผู้รับผลประโยชน์',
        'ค่าสินไหมที่บริษัทได้รับต้องนำมาเสียภาษีเงินได้นิติบุคคล (กค 0706/7251 ข้อ 3) — เบี้ยยังหักเป็นรายจ่ายได้ (กค 0706/4227) แต่ต้องอธิบายให้ลูกค้าเข้าใจ');
    }

    // CHK-11 — วิธีคำนวณต้องตรงกับถ้อยคำในระเบียบสวัสดิการ
    if (!policy.welfareWording) {
      add('CHK-11', 'block', 'ยังไม่ระบุถ้อยคำในระเบียบสวัสดิการ',
        'ต้องเลือกว่าระเบียบเขียนว่า "ออกภาษีให้ตลอดไป" (ป.96/2543 ข้อ 1(7)) หรือ "ออกให้ครั้งเดียว" (ข้อ 1(8))');
    } else if (policy.welfareWording !== policy.taxMethod) {
      add('CHK-11', 'block', 'วิธีคำนวณภาษีที่ออกให้ไม่ตรงกับถ้อยคำในระเบียบ',
        `ระเบียบเขียนว่า "${wordingLabel(policy.welfareWording)}" แต่ระบบกำลังคำนวณแบบ "${wordingLabel(policy.taxMethod)}" — ` +
        'ต้องแก้ระเบียบหรือแก้วิธีคำนวณให้ตรงกัน ไม่งั้นยอดที่นำส่ง ภ.ง.ด.1 จะไม่ตรงกับเอกสารของบริษัท');
    }

    // CHK-12 — เพดานค่าลดหย่อนรายกลุ่ม
    const table = yearInfo.table;
    directors.forEach((d, i) => {
      const s = sumAllowances(d.allowances, table);
      s.exceeded.forEach((e) => {
        add('CHK-12', 'warn', `ค่าลดหย่อนเกินเพดาน (${d.name || 'กรรมการท่านที่ ' + (i + 1)})`,
          `${e.group === 'lifeHealth' ? 'กลุ่มเบี้ยประกันชีวิต + สุขภาพ' : 'กลุ่ม RMF/กบข./สำรองเลี้ยงชีพ/กอช./บำนาญ'} ` +
          `รวม ${fmt(e.total)} บาท เกินเพดาน ${fmt(e.cap)} บาท — ระบบหักให้แค่ ${fmt(e.cap)} บาทตามกฎหมายแล้ว ` +
          `ส่วนที่เกิน ${fmt(e.excess)} บาทใช้ลดหย่อนไม่ได้ ตรวจดูว่ากรอกถูกหรือไม่`);
      });
    });

    const blocking = out.filter((x) => x.level === 'block');
    return {
      items: out,
      blocking,
      canQuote: blocking.length === 0,
      sme,
      ceiling,
      recommendation: rec,
      forbidden: forb,
      taxYearInfo: yearInfo,
    };
  }

  function wordingLabel(v) {
    if (v === 'perpetual') return 'ออกภาษีให้ตลอดไป (ป.96/2543 ข้อ 1(7))';
    if (v === 'once') return 'ออกภาษีให้ครั้งเดียว (ป.96/2543 ข้อ 1(8))';
    return 'ยังไม่ระบุ';
  }

  function lastValue(arr) {
    const a = arr || [];
    for (let i = a.length - 1; i >= 0; i--) if (num(a[i]) !== null) return num(a[i]);
    return null;
  }

  // ── จัดสรรเบี้ยรายกรรมการ ────────────────────────────────────────────────
  // Excel คิดเบี้ยเฉลี่ยต่อคนที่ C22 = C18 ÷ C21 แล้วชีตค่าตอบแทนกรรมการกับชีต
  // ภาษีทุกทอดดึงค่านั้นไปใช้ตรง ๆ (E7 = งบกำไรขาดทุน!C22, F8 = งบกำไรขาดทุน!C22)
  // โหมด 'auto' ทำแบบเดียวกัน — เฉลี่ยเท่ากันทุกคนและปัดเศษไปรวมที่คนสุดท้าย
  // เพื่อให้ยอดจัดสรรรวมตรงกับเบี้ยรวมเป๊ะ ๆ (CHK-06)
  // โหมด 'manual' ใช้เลขที่ผู้ใช้กรอกรายคนเอง (กรณีจัดสรรตามระดับตำแหน่ง)
  function allocatePremium(kase) {
    const policy = (kase && kase.policy) || {};
    const directors = (kase && kase.directors) || [];
    const mode = policy.allocationMode === 'manual' ? 'manual' : 'auto';
    if (mode === 'manual' || !directors.length) {
      return { mode, perDirector: directors.map((d) => n0(d.premiumAllocated)), average: null };
    }
    const total = n0(policy.premiumTotal);
    const per = round2(total / directors.length);
    const amounts = directors.map(() => per);
    const drift = round2(total - per * directors.length);
    if (drift !== 0) amounts[amounts.length - 1] = round2(amounts[amounts.length - 1] + drift);
    return { mode, perDirector: amounts, average: total / directors.length };
  }

  // ── คำนวณทั้งเคสในครั้งเดียว (ชั้นหน้าจอเรียกตัวนี้ตัวเดียว) ─────────────
  function computeCase(kase, ctx) {
    const year = (kase && kase.taxYear) || T.DEFAULT_YEAR;
    const yearInfo = T.resolveTaxYear(year);
    const fin = (kase && kase.financials) || {};
    const policy = (kase && kase.policy) || {};
    const directors = (kase && kase.directors) || [];
    const revenueLatest = lastValue(fin.revenues);
    const sme = determineSme({ paidUpCapital: kase && kase.company && kase.company.paidUpCapital, revenueLatest }, year);
    const mode = policy.taxMethod === 'once' ? 'once' : 'perpetual';

    const perDirector = directors.map((d) => {
      const g = grossUpTax(
        { salary: d.salary, bonus: d.bonus, keymanPremium: d.premiumAllocated, allowances: d.allowances, donations: d.donations },
        year,
        { mode }
      );
      return { director: d, gross: g };
    });

    const allTierTaxTotal = perDirector.reduce((s, x) => s + x.gross.tax, 0);
    const salaryOnlyPitTotal = perDirector.reduce((s, x) => s + x.gross.salaryOnlyTax, 0);
    const salaryTotal = perDirector.reduce((s, x) => s + x.gross.columnE.salaryBonus, 0);
    const premiumTotal = n0(policy.premiumTotal);
    const profitBeforeTax = lastValue(fin.profitsBeforeTax) || 0;

    const comparison = compareScenarios(
      {
        premiumTotal,
        allTierTaxTotal,
        salaryTotal,
        salaryOnlyPitTotal,
        profitBeforeTax,
        isSme: sme.isSme,
        lumpSum: policy.lumpSum,
        beneficiary: policy.beneficiary,
      },
      year
    );

    const checks = runChecks(kase, {
      duplicateOf: ctx && ctx.duplicateOf,
      taxYearInfo: yearInfo,
      grossUps: perDirector.map((x) => x.gross),
    });

    const forbiddenByYear = (fin.years || []).map((y, i) =>
      forbiddenExpense(
        { profitBeforeTax: (fin.profitsBeforeTax || [])[i], taxPaid: (fin.taxPaid || [])[i], isSme: sme.isSme },
        year
      )
    );

    return {
      year,
      yearInfo,
      sme,
      recommendation: recommendPremium(kase, year),
      perDirector,
      allTierTaxTotal,
      salaryOnlyPitTotal,
      salaryTotal,
      premiumTotal,
      monthlyWithholdingTotal: allTierTaxTotal / 12,
      recordedExpenseTotal: allTierTaxTotal + premiumTotal,
      comparison,
      checks,
      ceiling: checks.ceiling,
      forbidden: checks.forbidden,
      forbiddenByYear,
      fingerprint: fingerprint(fin),
    };
  }

  return {
    // ค่าคงที่/ตารางฟิลด์
    ALLOWANCE_FIELDS,
    DONATION_FIELDS,
    DOC_FIELDS,
    MAX_ROUNDS,
    CONVERGE_EPSILON,
    // ตัวช่วย
    num,
    n0,
    round2,
    avg,
    fmt,
    columnLetter,
    lastValue,
    wordingLabel,
    // เอนจิน
    pitTax,
    citTax,
    citMarginalRate,
    determineSme,
    grossUpTax,
    sumAllowances,
    sumDonations,
    forbiddenExpense,
    premiumCeiling,
    recommendPremium,
    compareScenarios,
    fingerprint,
    allocatePremium,
    runChecks,
    computeCase,
  };
});
