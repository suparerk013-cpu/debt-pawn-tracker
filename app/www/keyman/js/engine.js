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
    const reasons = [];
    if (cap === null) reasons.push('ยังไม่ได้กรอกทุนจดทะเบียนที่ชำระแล้ว');
    else if (!capitalOk) reasons.push(`ทุนชำระแล้ว ${fmt(cap)} บาท เกิน ${fmt(t.smePaidUpCapitalMax)} บาท`);
    if (rev === null) reasons.push('ยังไม่มีตัวเลขรายได้รวมปีล่าสุด');
    else if (!revenueOk) reasons.push(`รายได้รวมปีล่าสุด ${fmt(rev)} บาท เกิน ${fmt(t.smeRevenueMax)} บาท`);
    if (isSme) reasons.push(`ทุนชำระแล้ว ${fmt(cap)} ≤ ${fmt(t.smePaidUpCapitalMax)} และรายได้ ${fmt(rev)} ≤ ${fmt(t.smeRevenueMax)} ครบทั้งสองข้อ`);
    return {
      isSme,
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
      row.ref = i === 0 ? 'F' : columnLetter(7 + i); // F, H, I, J, ... ตาม Excel
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

  function sumAllowances(allowances, table) {
    const a = allowances || {};
    const byKey = {};
    let total = 0;
    const groups = {};
    for (const f of ALLOWANCE_FIELDS) {
      const v = n0(a[f.key]);
      byKey[f.key] = v;
      total += v;
      if (f.group) groups[f.group] = (groups[f.group] || 0) + v;
    }
    const caps = (table && table.groupCaps) || {};
    const exceeded = Object.keys(groups)
      .filter((g) => caps[g] !== undefined && groups[g] > caps[g])
      .map((g) => ({ group: g, total: groups[g], cap: caps[g] }));
    return { total, byKey, groups, caps, exceeded };
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

  // ── เพดานเบี้ยประกัน ─────────────────────────────────────────────────────
  function premiumCeiling({ revenues, profitsBeforeTax, taxPaidLatest }) {
    const avgRevenue = avg(lastN(revenues, 3));
    const avgProfit = avg(lastN(profitsBeforeTax, 3));
    const tax = num(taxPaidLatest);
    return {
      avgRevenue,
      avgProfit,
      ceiling5pctAvgRevenue: avgRevenue === null ? null : avgRevenue * 0.05,
      target2to3pct: avgRevenue === null ? null : { low: avgRevenue * 0.02, high: avgRevenue * 0.03 },
      ceiling30pctAvgProfit: avgProfit === null ? null : avgProfit * 0.30,
      reference20pctTax: tax === null ? null : tax * 0.20,
      // เพดาน 5% ไม่ใช่กฎหมาย — ต้องแสดงข้อความนี้ทุกครั้งที่โชว์ตัวเลขข้างบน
      disclaimer:
        'เพดาน 5% ของรายได้ไม่มีอยู่ในประมวลรัษฎากร เป็นแนวปฏิบัติของตลาดที่ใช้เป็น "ขีดที่ห้ามเกิน" ' +
        'ไม่ใช่ตัวเลขที่เอาไปเสนอ — กฎหมายเขียนไว้เพียงว่ารายจ่ายต้องเป็นไปเพื่อกิจการโดยเฉพาะ (ม.65 ตรี (13))',
    };
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
      taxDiff: before.totalTax - after.netTax,
      cashDiff: after.ownerCash - before.ownerCash,
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
    const ceiling = premiumCeiling({
      revenues,
      profitsBeforeTax: fin.profitsBeforeTax || [],
      taxPaidLatest: lastValue(fin.taxPaid),
    });
    const premiumTotal = n0(policy.premiumTotal);

    // CHK-01 — รายงานผลตัดสิน SME
    add('CHK-01', 'info', sme.isSme ? 'เข้าเกณฑ์ SME (ใช้อัตรา 15%/20% แบบขั้นบันได)' : 'ไม่เข้าเกณฑ์ SME (ใช้อัตรา 20% ตลอด)', sme.reason);

    // CHK-02 — เบี้ยรวมเกิน 5% ของรายได้เฉลี่ย 3 ปี = บล็อก
    if (ceiling.ceiling5pctAvgRevenue === null) {
      add('CHK-02', 'warn', 'ยังตรวจเพดานเบี้ย 5% ไม่ได้', 'ยังไม่มีตัวเลขรายได้รวมในงบกำไรขาดทุน');
    } else if (premiumTotal > ceiling.ceiling5pctAvgRevenue) {
      add('CHK-02', 'block', 'เบี้ยรวมเกินเพดาน 5% ของรายได้เฉลี่ย 3 ปี',
        `เบี้ยที่เสนอ ${fmt(premiumTotal)} บาท > เพดาน ${fmt(ceiling.ceiling5pctAvgRevenue)} บาท ` +
        `(${((premiumTotal / (ceiling.avgRevenue || 1)) * 100).toFixed(2)}% ของรายได้เฉลี่ย) — ${ceiling.disclaimer}`);
    } else {
      add('CHK-02', 'info', 'เบี้ยรวมอยู่ในเพดาน 5% ของรายได้เฉลี่ย 3 ปี',
        `เบี้ย ${fmt(premiumTotal)} บาท = ${((premiumTotal / (ceiling.avgRevenue || 1)) * 100).toFixed(2)}% ของรายได้เฉลี่ย ` +
        `(ช่วงที่ปลอดภัยกว่าคือ 2–3% = ${fmt(ceiling.target2to3pct.low)}–${fmt(ceiling.target2to3pct.high)} บาท)`);
    }

    // CHK-03 — เบี้ยรวมเกิน 30% ของกำไรก่อนภาษีเฉลี่ย 3 ปี = เตือน
    // บริษัทที่ขาดทุนเฉลี่ยไม่มีฐานกำไรให้คิดสัดส่วน จึงไม่แสดงตัวเลขเพดานติดลบให้ผู้ใช้เห็น
    if (ceiling.avgProfit !== null && ceiling.avgProfit <= 0 && premiumTotal > 0) {
      add('CHK-03', 'warn', 'กำไรก่อนภาษีเฉลี่ย 3 ปีติดลบ ไม่มีฐานกำไรให้เทียบสัดส่วน 30%',
        `กำไรก่อนภาษีเฉลี่ย 3 ปี ${fmt(ceiling.avgProfit)} บาท — เบี้ยทุกบาทกินเข้าไปในผลขาดทุน ` +
        'ควรเสนอด้วยเหตุผลด้านสวัสดิการและการรักษาคนสำคัญ ไม่ใช่ด้านภาษี');
    } else if (ceiling.ceiling30pctAvgProfit !== null && ceiling.ceiling30pctAvgProfit > 0 && premiumTotal > ceiling.ceiling30pctAvgProfit) {
      add('CHK-03', 'warn', 'เบี้ยรวมเกิน 30% ของกำไรก่อนภาษีเฉลี่ย 3 ปี',
        `เบี้ย ${fmt(premiumTotal)} บาท > ${fmt(ceiling.ceiling30pctAvgProfit)} บาท — เบี้ยกินกำไรมากพอที่สรรพากรจะตั้งคำถามว่าจ่ายเพื่อกิจการจริงหรือไม่`);
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
          `รวม ${fmt(e.total)} บาท เกินเพดาน ${fmt(e.cap)} บาท — ส่วนที่เกินใช้ลดหย่อนไม่ได้ ถ้าปล่อยไว้ภาษีที่คำนวณจะต่ำกว่าความจริง`);
      });
    });

    const blocking = out.filter((x) => x.level === 'block');
    return {
      items: out,
      blocking,
      canQuote: blocking.length === 0,
      sme,
      ceiling,
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
    compareScenarios,
    fingerprint,
    runChecks,
    computeCase,
  };
});
