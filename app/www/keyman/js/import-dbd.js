// ตัวอ่านไฟล์ส่งออกจาก DBD DataWarehouse+ (งบกำไรขาดทุน / งบแสดงฐานะการเงิน)
// และตัวแกะข้อความหน้าข้อมูลนิติบุคคลที่ copy มาวาง
(function (root) {
  'use strict';
  const E = root.KeymanEngine;

  // ── ทำข้อความให้เทียบกันได้ (ตัดช่องว่าง วรรณยุกต์ที่ไม่จำเป็น และ nbsp) ──
  const norm = (s) => String(s === null || s === undefined ? '' : s)
    .replace(/ /g, ' ')
    .replace(/\u0e4d\u0e32/g, '\u0e33')   // ' ํา' ที่ PDF ของ DBD ใช้ = 'ำ'
    .replace(/[\u200b\ufeff]/g, '')
    .replace(/[()\s\-–—.]/g, '')
    .trim();

  // ตารางชื่อพ้อง: ไฟล์ DBD ใช้ "บริหาร" ส่วนเทมเพลต Excel เดิมเขียน "บริการ"
  const PL_MAP = [
    { key: 'mainRevenue', names: ['รายได้หลัก'] },
    { key: 'revenues', names: ['รายได้รวม'] },
    { key: 'cogs', names: ['ต้นทุนขาย'] },
    { key: 'grossProfit', names: ['กำไรขาดทุนขั้นต้น', 'กำไรขั้นต้น'] },
    { key: 'sga', names: ['ค่าใช้จ่ายในการขายและบริหาร', 'ค่าใช้จ่ายในการขายและบริการ', 'ค่าใช้จ่ายในการขายและบริหารรวม'] },
    { key: 'totalExpense', names: ['รายจ่ายรวม', 'ค่าใช้จ่ายรวม'] },
    { key: 'interest', names: ['ดอกเบี้ยจ่าย'] },
    { key: 'profitsBeforeTax', names: ['กำไรขาดทุนก่อนภาษี', 'กำไรก่อนภาษี'] },
    { key: 'taxPaid', names: ['ภาษีเงินได้'] },
    { key: 'netProfit', names: ['กำไรขาดทุนสุทธิ', 'กำไรสุทธิ'] },
  ];
  const BS_MAP = [
    { key: 'receivables', names: ['ลูกหนี้การค้าสุทธิ', 'ลูกหนี้การค้า'] },
    { key: 'inventory', names: ['สินค้าคงเหลือ'] },
    { key: 'currentAssets', names: ['สินทรัพย์หมุนเวียน', 'รวมสินทรัพย์หมุนเวียน'] },
    { key: 'ppe', names: ['ที่ดินอาคารและอุปกรณ์'] },
    { key: 'nonCurrentAssets', names: ['สินทรัพย์ไม่หมุนเวียน', 'รวมสินทรัพย์ไม่หมุนเวียน'] },
    { key: 'totalAssets', names: ['สินทรัพย์รวม', 'รวมสินทรัพย์'] },
    { key: 'currentLiabilities', names: ['หนี้สินหมุนเวียน', 'รวมหนี้สินหมุนเวียน'] },
    { key: 'nonCurrentLiabilities', names: ['หนี้สินไม่หมุนเวียน', 'รวมหนี้สินไม่หมุนเวียน'] },
    { key: 'totalLiabilities', names: ['หนี้สินรวม', 'รวมหนี้สิน'] },
    { key: 'equity', names: ['ส่วนของผู้ถือหุ้น', 'รวมส่วนของผู้ถือหุ้น'] },
    { key: 'totalLiabEquity', names: ['หนี้สินรวมและส่วนของผู้ถือหุ้น', 'รวมหนี้สินและส่วนของผู้ถือหุ้น'] },
  ];

  function mapKey(map, label) {
    const n = norm(label);
    if (!n) return null;
    const hit = map.find((m) => m.names.some((x) => norm(x) === n));
    return hit ? hit.key : null;
  }

  // ── อ่านไฟล์ .xlsx จาก DBD ──────────────────────────────────────────────
  // คืน { kind, companyName, title, years[], rows: {key: {amounts[], pct[]}}, unknownLabels[] }
  function readDbdWorkbook(arrayBuffer, fileName) {
    if (typeof XLSX === 'undefined') throw new Error('ยังโหลดตัวอ่าน Excel ไม่สำเร็จ');
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = wb.SheetNames.indexOf('Finance') >= 0 ? 'Finance' : wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    const a1 = String((grid[0] && grid[0][0]) || '').replace(/ /g, ' ').trim();

    let kind = null;
    if (/^งบกำไรขาดทุน/.test(a1)) kind = 'pl';
    else if (/^งบแสดงฐานะการเงิน/.test(a1)) kind = 'bs';
    if (!kind) {
      throw new Error(`ไฟล์ "${fileName}" ไม่ใช่ไฟล์ส่งออกจาก DBD ที่รู้จัก — ข้อความในช่อง A1 คือ "${a1.slice(0, 60)}"`);
    }
    const companyName = a1.replace(/^งบกำไรขาดทุน/, '').replace(/^งบแสดงฐานะการเงิน/, '').trim();

    // แถว 4 (index 3) = ปี อยู่ที่คอลัมน์ B, D, F, H, J (index 1,3,5,7,9)
    const yearRow = grid[3] || [];
    const cols = [];
    for (let c = 1; c <= 9; c += 2) {
      const y = String(yearRow[c] === undefined ? '' : yearRow[c]).trim();
      if (y) cols.push({ col: c, year: y });   // เก็บปีเป็น "สตริง" เสมอ
    }
    if (!cols.length) throw new Error(`ไฟล์ "${fileName}" ไม่พบปีงบการเงินในแถวที่ 4`);

    const map = kind === 'pl' ? PL_MAP : BS_MAP;
    const rows = {};
    const unknownLabels = [];
    for (let r = 5; r < grid.length; r++) {
      const line = grid[r] || [];
      const label = String(line[0] === undefined ? '' : line[0]).trim();
      if (!label) continue;
      const key = mapKey(map, label);
      if (!key) { unknownLabels.push(label); continue; }
      if (rows[key]) continue;                       // ใช้แถวแรกที่เจอ
      rows[key] = {
        label,
        amounts: cols.map((c) => E.num(line[c.col])),        // '' → null ไม่ใช่ 0
        pct: cols.map((c) => E.num(line[c.col + 1])),        // %เปลี่ยนแปลง นำเข้าตามไฟล์
      };
    }
    return { kind, fileName, title: a1, companyName, years: cols.map((c) => c.year), rows, unknownLabels };
  }

  // เลือก 3 ปีล่าสุดจากไฟล์ (อ่านปีจากแถว 4 เสมอ ห้าม hard-code ลำดับ)
  function latestYears(parsed, count) {
    const n = count || 3;
    const idx = parsed.years.map((y, i) => ({ y, i }))
      .sort((a, b) => Number(a.y) - Number(b.y));       // เรียงจากเก่าไปใหม่
    return idx.slice(-n);
  }

  // สร้าง "ผังการเขียนทับ" ไว้ให้หน้ายืนยันดูก่อน — ยังไม่แตะข้อมูลจริง
  function planUpdate(parsed, kase, rowDefs, targetName) {
    const picks = latestYears(parsed, 3);
    const changes = [];
    const years = picks.map((p) => parsed.years[p.i]);
    const target = kase[targetName];
    changes.push({ field: 'ปีงบการเงิน', path: targetName + '.years', old: (target.years || []).join(' · '), value: years, display: years.join(' · ') });
    rowDefs.forEach((def) => {
      const row = parsed.rows[def.key];
      const amounts = picks.map((p) => (row ? row.amounts[p.i] : null));
      const pct = picks.map((p) => (row ? row.pct[p.i] : null));
      changes.push({
        field: def.label,
        path: targetName + '.' + def.key,
        old: (target[def.key] || []).map((v) => (E.num(v) === null ? '–' : E.fmt(E.num(v)))).join(' · '),
        value: amounts,
        display: amounts.map((v) => (v === null ? '–' : E.fmt(v))).join(' · '),
        pctPath: targetName + '.pct.' + def.key,
        pctValue: pct,
      });
    });
    return { changes, years, parsed };
  }

  function planPl(parsed, kase) { return planUpdate(parsed, kase, root.K.PL_ROWS, 'financials'); }
  function planBs(parsed, kase) { return planUpdate(parsed, kase, root.K.BS_ROWS, 'balance'); }

  function applyPlan(plan, kase) {
    plan.changes.forEach((c) => {
      root.K.setPath(kase, c.path, c.value);
      if (c.pctPath) root.K.setPath(kase, c.pctPath, c.pctValue);
    });
  }

  // ── แกะข้อความหน้าข้อมูลนิติบุคคลจาก DBD (ผู้ใช้ copy มาวาง) ─────────────
  // รองรับสามแบบที่เจอจริง:
  //   1) copy จากหน้าเว็บ DBD แบบใหม่ — label อยู่บรรทัดหนึ่ง ค่าอยู่บรรทัดถัดไป ไม่มี ":"
  //   2) copy แบบที่มี ":" คั่นในบรรทัดเดียวกัน  เช่น "ทุนจดทะเบียน (บาท) : 5,000,000.00"
  //   3) copy จาก Company_Profile.pdf — label กองอยู่ก่อนหลายบรรทัดแล้วค่าตามมาทีหลัง
  const LABELS = [
    { key: 'name', names: ['ชื่อนิติบุคคล'] },
    { key: 'regNo', names: ['เลขทะเบียนนิติบุคคล'] },
    { key: 'oldRegNo', names: ['เลขทะเบียนเดิม'] },
    { key: 'entityType', names: ['ประเภทนิติบุคคล'] },
    { key: 'status', names: ['สถานะนิติบุคคล'] },
    { key: 'registeredDate', names: ['วันที่จดทะเบียนจัดตั้ง'] },
    { key: 'paidUpCapital', names: ['ทุนจดทะเบียน'], numeric: true },
    { key: 'businessGroup', names: ['กลุ่มธุรกิจ', 'หมวดธุรกิจ'] },
    { key: 'sizeLabel', names: ['ขนาดธุรกิจ'] },
    { key: 'address', names: ['ที่ตั้งสำนักงานแห่งใหญ่', 'ที่ตั้ง'] },
    { key: 'website', names: ['Website', 'เว็บไซต์'] },
    { key: 'fiscalYearsFiled', names: ['ปีที่ส่งงบการเงิน'] },
    { key: 'signingAuthority', names: ['กรรมการลงชื่อผูกพัน', 'คณะกรรมการลงชื่อผูกพัน'] },
    { key: 'businessType', names: ['ประเภทธุรกิจ'] },
    { key: 'objective', names: ['วัตถุประสงค์'] },
  ];
  // ป้ายที่บอกว่าบรรทัดถัด ๆ ไปคือรายชื่อกรรมการ (ต้องเทียบแบบตรงตัว ไม่งั้นจะไปชนกับ
  // "กรรมการลงชื่อผูกพัน" ซึ่งเป็นคนละเรื่อง)
  const DIRECTOR_LABELS = ['รายชื่อกรรมการ', 'กรรมการ'];
  const EMPTY_VALUES = ['-', '–', 'ไม่มี', 'N/A'];

  // หา label ที่ยาวที่สุดที่ตรงกับข้อความนี้ (ตรงตัวหรือเป็นคำขึ้นต้น)
  function matchLabel(text) {
    const n = norm(text);
    if (!n) return null;
    let best = null;
    LABELS.forEach((l) => {
      l.names.forEach((name) => {
        const nn = norm(name);
        if (n === nn || n.indexOf(nn) === 0 || nn.indexOf(n) === 0) {
          if (!best || nn.length > best.len) best = { hit: l, len: nn.length };
        }
      });
    });
    return best ? best.hit : null;
  }
  const isDirectorLabel = (text) => DIRECTOR_LABELS.some((x) => norm(x) === norm(text));
  const isEmptyValue = (v) => EMPTY_VALUES.indexOf(String(v).trim()) >= 0;

  function parseCompanyText(text) {
    const raw = String(text || '').replace(/ /g, ' ').replace(/ํา/g, 'ำ');
    const lines = raw.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l !== '');
    const fields = {};
    const directors = [];
    let name = '';
    let inDirectors = false;
    const pending = [];   // label ที่ยังไม่มีค่า รอค่าจากบรรทัดถัด ๆ ไป

    lines.forEach((line) => {
      // แยกเป็น key/value ถ้ามี ":" คั่น ไม่งั้นถือว่าทั้งบรรทัดคือ key ที่ยังไม่มีค่า
      const m = line.match(/^([^:]{2,45}?)\s*:\s*(.*)$/);
      const key = m ? m[1].trim() : line;
      const value = m ? m[2].trim() : '';

      if (isDirectorLabel(key)) {                       // "รายชื่อกรรมการ" / "กรรมการ :"
        inDirectors = true;
        pending.length = 0;
        if (value) pushDirector(directors, value);
        return;
      }

      const hit = matchLabel(key);
      if (hit) {
        inDirectors = false;
        if (value && !isEmptyValue(value)) { setField(fields, hit, value); return; }
        if (value) return;                              // ค่าเป็น "-" = ไม่มีข้อมูล ไม่ต้องรอ
        // อย่าเข้าคิวซ้ำ: หน้า DBD มีคำว่า "ประเภทธุรกิจ" สองรอบ (ตอนจดทะเบียน / ปีล่าสุด)
        // ถ้าปล่อยให้ค้างคิวซ้ำ ค่าจะเลื่อนไปลงผิดช่องทั้งแถบ
        const already = fields[hit.key] !== undefined && fields[hit.key] !== null && fields[hit.key] !== '';
        if (!already && pending.indexOf(hit) < 0 && pending.length < 4) pending.push(hit);
        return;
      }

      // บรรทัดที่มี ":" แต่ key ไม่ใช่ label ที่รู้จัก (เช่น "49209 : การขนส่ง…" หรือหัวกระดาษ)
      // ข้ามไปเลย ห้ามเอาไปเป็นค่าของ label ที่รออยู่
      if (m) return;

      // บรรทัดรายชื่อกรรมการ "1. นายประจักษ์ กากแก้ว" หรือ "2.นางสาวกัลยา ศรไชย/"
      // นับเฉพาะตอนที่อยู่ใต้ป้ายรายชื่อกรรมการ ไม่งั้นข้อความ "ข้อควรทราบ" ท้ายเอกสาร
      // ที่ขึ้นต้นด้วยเลขข้อจะถูกดูดมาเป็นชื่อกรรมการด้วย
      if (inDirectors && /^\d+\s*[.)]\s*\S/.test(line)) { pushDirector(directors, line); return; }
      inDirectors = false;

      if (pending.length) {                             // เป็นค่าของ label ตัวแรกที่รออยู่
        const target = pending.shift();
        if (!isEmptyValue(line) && line.length <= 250) setField(fields, target, line);
        return;
      }
      // ชื่อบริษัท: บรรทัดลอย ๆ ที่ขึ้นต้นด้วย บริษัท/ห้างหุ้นส่วน และมีช่องว่างคั่น
      // (กัน "บริษัทจำกัด" ซึ่งเป็นค่าของช่องประเภทนิติบุคคล ไม่ให้กลายเป็นชื่อบริษัท)
      if (!name && /^(บริษัท|ห้างหุ้นส่วน)\s/.test(line) && line.length >= 10) name = line;
    });

    // หมวดธุรกิจในไฟล์ PDF อยู่คนละบรรทัดกับ label และขึ้นต้นด้วยรหัส 5 หลัก
    const groupCode = lines.find((l) => /^\d{4,6}\s*:\s*\S/.test(l));
    if (groupCode) fields.businessGroup = groupCode.trim();
    else if (fields.businessGroup && fields.businessGroup.length > 120) delete fields.businessGroup;

    if (fields.paidUpCapital === undefined || fields.paidUpCapital === null) {
      const m2 = raw.match(/ทุนจดทะเบียน[^\d]{0,20}([\d,]+(?:\.\d+)?)/);
      if (m2) fields.paidUpCapital = E.num(m2[1]);
    }
    // เลขทะเบียนนิติบุคคล 13 หลัก: เอาจากลิงก์หน้า DBD ที่วางมาด้วยก็ได้
    // (เช่น https://datawarehouse.dbd.go.th/company/profile/5/0345563002001)
    if (!fields.regNo) {
      const fromUrl = raw.match(/datawarehouse\.dbd\.go\.th[^\s]*?\/(\d{13,14})/);
      const bare = raw.match(/(?:^|[^\d])(\d{13})(?![\d])/);
      const digits = fromUrl ? fromUrl[1].slice(-13) : (bare ? bare[1] : null);
      if (digits) fields.regNo = digits;
    }
    if (name) fields.name = name;
    return { fields, directors };
  }

  function setField(fields, hit, value) {
    if (fields[hit.key] !== undefined && fields[hit.key] !== null && fields[hit.key] !== '') return; // ค่าแรกที่เจอชนะ
    const clean = String(value).replace(/\s*[:\/]\s*$/, '').trim();   // ตัด ":" หรือ "/" ที่ DBD ใส่ท้ายบรรทัด
    if (!hit.numeric) { fields[hit.key] = clean; return; }
    // ค่าตัวเลขมักมีหน่วยติดมาด้วย เช่น "375,000.00 บาท"
    const m = clean.match(/-?[\d,]+(?:\.\d+)?/);
    fields[hit.key] = m ? E.num(m[0]) : null;
  }

  function pushDirector(list, line) {
    const cleaned = String(line)
      .replace(/^\s*\d+\s*[.)]\s*/, '')   // ตัดเลขนำหน้า "1." "2)"
      .replace(/\s*\/\s*$/, '')           // ตัดเครื่องหมาย / ท้ายชื่อ
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned) list.push(cleaned);
  }

  root.KeymanImport = {
    readDbdWorkbook, planPl, planBs, applyPlan, parseCompanyText, latestYears, norm, PL_MAP, BS_MAP,
    // ชื่อบริษัทของสองไฟล์ต้องตรงกัน ไม่งั้นปฏิเสธการนำเข้าทันที
    sameCompany: (a, b) => norm(a) === norm(b),
  };
})(typeof self !== 'undefined' ? self : this);
