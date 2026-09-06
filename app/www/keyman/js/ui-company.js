// แท็บ 1 — ข้อมูลบริษัท (ชีต "ข้อมูลบริษัท")
(function (root) {
  'use strict';
  const K = root.K, h = K.h, E = root.KeymanEngine, Imp = root.KeymanImport;

  // ช่องชื่อกรรมการหนึ่งท่าน (B10, B11, B12, …) — แก้ที่นี่แล้วการ์ดอื่นเปลี่ยนตามทันที
  function directorNameRow(d, i) {
    const inp = K.input('directors.' + i + '.name', { kind: 'text', placeholder: 'ชื่อ-สกุล' });
    inp.addEventListener('change', () => K.render());   // ให้หัวข้อการ์ดอื่นอัปเดตชื่อตาม
    return h('label.field', null, [
      h('span.lbl', null, [(i + 1) + '.', h('span.ref', { text: 'B' + (10 + i) })]),
      inp,
    ]);
  }

  // หนึ่งแถวของชีต "ข้อมูลบริษัท" — ชื่อช่องและลำดับตรงกับ A1–A8 ของไฟล์ Excel
  function row(label, path, ref, opts) {
    const o = opts || {};
    return field(label, K.input(path, o.money ? { onchange: () => K.refreshOutputs() } : { kind: 'text' }), ref, o.note);
  }

  function field(label, node, ref, hint) {
    return h('label.field', null, [
      h('span.lbl', null, [label, ref ? h('span.ref', { text: ref }) : null]),
      node,
      hint ? h('span.hint', { text: hint }) : null,
    ]);
  }

  function render(main) {
    const k = K.state.kase;

    // ── วางข้อมูลจากหน้าเว็บ DBD ─────────────────────────────────────────
    const pasteBox = h('textarea.cell', { rows: 5, placeholder: 'วางข้อความจากหน้า DBD DataWarehouse+ หรือจากไฟล์ Company_Profile.pdf ที่นี่ แล้วกด "แกะข้อมูล"' });
    main.appendChild(K.card('วางข้อมูลนิติบุคคลจาก DBD', 'DBD DataWarehouse+', [
      h('p.note', { text: 'ลากคลุมบล็อก "ข้อมูลนิติบุคคล" ทั้งก้อนจากหน้าเว็บ DBD แล้ววางตรงนี้ กด "แกะข้อมูล" ระบบจะแยกลงช่องให้เอง ' +
        'พร้อมตัดสินสถานะ SME และดึงรายชื่อกรรมการออกมาให้ — รองรับทั้งข้อความจากหน้าเว็บ (label อยู่คนละบรรทัดกับค่า), ' +
        'แบบที่มี ":" คั่น และข้อความจาก Company_Profile.pdf' }),
      h('p.hint', { text: 'วางลิงก์หน้า DBD ต่อท้ายมาด้วยก็ได้ ระบบจะดึงเลขทะเบียนนิติบุคคล 13 หลักจากลิงก์ให้ — ' +
        'แต่ดึงข้อมูลจากลิงก์เองไม่ได้ เพราะเบราว์เซอร์บล็อกการอ่านข้ามโดเมน (CORS) และหน้านั้นต้องล็อกอินก่อน' }),
      pasteBox,
      h('div.btnrow', null, [
        h('button.btn.primary', { text: 'แกะข้อมูล', onclick: () => parsePaste(pasteBox.value) }),
        h('button.btn', { text: 'ล้างช่อง', onclick: () => { pasteBox.value = ''; } }),
      ]),
    ]));

    // อัปโหลดไฟล์ Excel งบการเงินจาก DBD ได้จากแท็บนี้เลย (การ์ดเดียวกับที่อยู่ในแท็บ 2 และ 3)
    main.appendChild(K.dbdImportCard());

    // ── ข้อมูลบริษัท ─────────────────────────────────────────────────────
    main.appendChild(K.card('ข้อมูลบริษัท', 'ชีต ข้อมูลบริษัท', [
      K.stats([
        { label: 'สถานะทางภาษี (ระบบตัดสินเอง)', tone: 'accent',
          value: (c) => (!c ? '–' : c.sme.pending ? 'ยังตัดสินไม่ได้' : c.sme.isSme ? 'เข้าเกณฑ์ SME' : 'ไม่เข้าเกณฑ์ SME'),
          note: (c) => (!c ? '' : c.sme.pending ? 'ข้อมูลยังไม่ครบ' : c.sme.isSme ? 'ยกเว้น 300,000 · 15% · 20%' : 'อัตรา 20% ตลอด') },
        { label: 'ทุนจดทะเบียนที่ชำระแล้ว', value: (c, kk) => K.money(kk.company.paidUpCapital) + ' บาท', note: 'เกณฑ์ SME ไม่เกิน 5,000,000' },
        { label: 'รายได้รวมปีล่าสุด', value: (c) => (c && c.sme.revenueLatest !== null ? K.money(c.sme.revenueLatest) + ' บาท' : 'ยังไม่มีข้อมูล'),
          note: 'เกณฑ์ SME ไม่เกิน 30,000,000' },
        { label: 'ขนาดธุรกิจตาม DBD', value: (c, kk) => (kk.company.sizeLabel || '–'), note: 'คนละเกณฑ์กับ SME ทางภาษี' },
      ]),
      K.callout('warn', (c) => (c && c.sme.pending
        ? 'ยังตัดสินสถานะ SME ไม่ได้ — ' + c.sme.reason + ' (สถานะนี้มีผลกับอัตราภาษีนิติบุคคลทั้งหน้าสรุป)'
        : '')),
      h('p.hint', { text: 'ขนาดธุรกิจ S/M/L ของ DBD ดูจากรายได้และการจ้างงานตามนิยาม สสว. ส่วน "SME" ที่ใช้คิดภาษีนิติบุคคลดูสองข้อคือ ' +
        'ทุนชำระแล้วไม่เกิน 5 ล้าน และรายได้ไม่เกิน 30 ล้าน — คนละเกณฑ์กัน ระบบจึงตัดสินเองจากตัวเลขจริง ไม่ได้ใช้ค่าจาก DBD' }),
      // แถวเหมือนชีต "ข้อมูลบริษัท" ของไฟล์ Excel เป๊ะ — A1–A8 ลำดับเดิม ไม่เพิ่มไม่ลด
      // (รายชื่อกรรมการ B10+ อยู่การ์ดถัดไป · ประเด็นปรึกษา B14+ อยู่ใต้ตารางนี้)
      h('div.grid2', null, [
        row('ชื่อนิติบุคคล', 'company.name', 'B1'),
        row('สถานะนิติบุคคล', 'company.status', 'B2'),
        row('วันที่จดทะเบียนจัดตั้ง', 'company.registeredDate', 'B3'),
        row('ทุนจดทะเบียน', 'company.paidUpCapital', 'B4', { money: true, note: '(ข้อมูลจำเป็น) — ตัวเลขนี้เป็นตัวตัดสินสถานะ SME' }),
        row('เลขทะเบียนเดิม', 'company.regNo', 'B5', { note: 'เลขทะเบียนนิติบุคคล 13 หลัก' }),
        row('กลุ่มธุรกิจ', 'company.businessGroup', 'B6'),
        row('ขนาดธุรกิจ', 'company.sizeLabel', 'B7'),
      ]),
      row('ที่ตั้งสำนักงานแห่งใหญ่', 'company.address', 'B8'),

      // รายชื่อกรรมการ A10/B10+ ของชีตเดิม — กี่ท่านก็กางให้ครบเท่านั้น
      // ชื่อที่แกะได้จากหน้า DBD ลงตรงนี้ทันที และเป็นช่องเดียวกับการ์ดจัดสรรเบี้ยด้านล่าง
      h('p.note.strong', null, ['รายชื่อกรรมการ', h('span.ref', { text: 'A10' }),
        h('span.badge', { text: k.directors.length + ' ท่าน' })]),
      h('div.grid2', null, k.directors.map((d, i) => directorNameRow(d, i))),
      h('div.btnrow', null, [
        h('button.btn', {
          text: '+ เพิ่มกรรมการ',
          onclick: () => { k.directors.push(K.newDirector(k.directors.length + 1)); K.touch(); K.render(); },
        }),
      ]),
      h('p.hint', { text: 'เงินเดือน โบนัส เบี้ยที่จัดสรร และเกณฑ์ตามระดับตำแหน่งของแต่ละท่าน กรอกที่การ์ด "รายชื่อกรรมการและการจัดสรรเบี้ยรายคน" ด้านล่าง' }),

      field('ประเด็นปรึกษา', K.textarea('company.consultIssues', { rows: 3, placeholder: '1. …' }), 'B14–B17'),
      h('p.note', null, ['เหตุผลของผลตัดสิน: ', K.out((c) => (c ? c.sme.reason : ''))]),
      K.legend(),
    ]));

    // ── กรรมการ ──────────────────────────────────────────────────────────
    const dirCard = K.card('รายชื่อกรรมการและการจัดสรรเบี้ยรายคน', 'ชีต ข้อมูลบริษัท B10+ · CHK-06', [
      h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px' }, [
        h('span.hint', { text: 'โหมดจัดสรรเบี้ย:', style: 'margin:0' }),
        K.switch2([{ value: 'auto', label: 'เฉลี่ยเท่ากันทุกท่าน' }, { value: 'manual', label: 'จัดสรรรายคนเอง' }],
          K.isAutoAllocation() ? 'auto' : 'manual',
          (v) => { k.policy.allocationMode = v; K.touch(); K.render(); }),
      ]),
      h('p.hint', { text: K.isAutoAllocation()
        ? 'โหมดเฉลี่ยเท่ากัน: เบี้ยรายคน = เบี้ยรวม ÷ จำนวนกรรมการ (สูตร C22 ของ Excel) และส่งไปให้แท็บ 4 กับแท็บ 7 ใช้ต่อทันที — เศษสตางค์ไปรวมที่ท่านสุดท้ายเพื่อให้ยอดรวมตรงเป๊ะ'
        : 'โหมดจัดสรรรายคนเอง: กรอกเบี้ยของแต่ละท่านเอง ยอดรวมต้องเท่ากับเบี้ยรวมพอดี ไม่งั้น CHK-06 จะบล็อก' }),
    ]);
    k.directors.forEach((d, i) => dirCard.appendChild(directorBlock(d, i)));
    dirCard.appendChild(h('div.btnrow', null, [
      h('button.btn', {
        text: '+ เพิ่มกรรมการ',
        onclick: () => { k.directors.push(K.newDirector(k.directors.length + 1)); K.touch(); K.render(); },
      }),
    ]));
    dirCard.appendChild(h('p.note', null, [
      'ยอดจัดสรรรวม ',
      K.out((c, kk) => K.money(kk.directors.reduce((s, d) => s + E.n0(d.premiumAllocated), 0))),
      ' บาท · เบี้ยรวมที่ระบุ ',
      K.out((c, kk) => K.money(kk.policy.premiumTotal)),
      ' บาท — สองยอดนี้ต้องตรงกัน ไม่งั้น CHK-06 จะบล็อกการออกใบเสนอ',
    ]));
    main.appendChild(dirCard);

    // ── กรมธรรม์และวิธีออกภาษี ───────────────────────────────────────────
    main.appendChild(K.card('บล็อกกรมธรรม์', 'ป.96/2543 · CHK-10 · CHK-11', [
      h('div.grid2', null, [
        field('เบี้ยประกันรวมทั้งปี (บาท)', K.input('policy.premiumTotal', { onchange: () => K.refreshOutputs() }), 'งบกำไรขาดทุน!C18'),
        field('จำนวนปีที่ชำระเบี้ย', K.input('policy.premiumYears', { kind: 'int' })),
        field('บริษัทประกัน', K.input('policy.insurer', { kind: 'text' })),
        field('แบบประกัน', K.input('policy.productName', { kind: 'text' })),
        field('ผู้รับผลประโยชน์', K.select('policy.beneficiary', [
          { value: '', label: '— ยังไม่ระบุ —' },
          { value: 'heir', label: 'ทายาทของกรรมการ (ค่าสินไหมยกเว้นภาษีตาม ม.42(13))' },
          { value: 'company', label: 'บริษัท (ค่าสินไหมต้องเสียภาษีนิติบุคคล)' },
        ])),
        field('วิธีคำนวณภาษีที่บริษัทออกให้', K.select('policy.taxMethod', [
          { value: 'perpetual', label: 'ออกให้ตลอดไป — ป.96/2543 ข้อ 1(7)' },
          { value: 'once', label: 'ออกให้ครั้งเดียว — ป.96/2543 ข้อ 1(8)' },
        ])),
        field('ถ้อยคำที่เขียนไว้ในระเบียบสวัสดิการ', K.select('policy.welfareWording', [
          { value: '', label: '— ยังไม่ระบุ —' },
          { value: 'perpetual', label: 'ระเบียบเขียนว่า "ออกภาษีให้ตลอดไป"' },
          { value: 'once', label: 'ระเบียบเขียนว่า "ออกภาษีให้ครั้งเดียว"' },
        ]), null, 'ต้องตรงกับวิธีคำนวณ ไม่งั้น CHK-11 บล็อก'),
      ]),
      field('คัดถ้อยคำในระเบียบสวัสดิการมาไว้ตรงนี้', K.textarea('policy.welfareText', {
        rows: 3, placeholder: 'เช่น "บริษัทฯ จะออกเงินค่าภาษีเงินได้บุคคลธรรมดาให้แก่กรรมการทุกคนตลอดไป…"',
      })),
    ]));

    // ── เอกสารกำกับ ──────────────────────────────────────────────────────
    main.appendChild(K.card('เช็กลิสต์เอกสารกำกับ 4 ข้อ', 'CHK-09 — ขาดข้อใดข้อหนึ่ง = ออกใบเสนอไม่ได้', [
      h('ul.checklist', null, E.DOC_FIELDS.map((d) => K.checkbox('docs.' + d.key, d.label))),
      h('p.note', { text: 'ทั้งสี่ข้อคือสิ่งที่สรรพากรขอดูจริงเวลาตรวจ — ไม่มีข้อใดข้อหนึ่ง เบี้ยมีสิทธิ์ถูกตีเป็นรายจ่ายต้องห้ามและบวกกลับเป็นกำไร' }),
      K.disclaimer(),
    ]));
  }

  function directorBlock(d, i) {
    const idx = 'directors.' + i;
    return h('div', { style: 'border:1px solid var(--line);border-radius:8px;padding:8px;margin-bottom:8px' }, [
      h('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:6px' }, [
        h('strong', { text: 'กรรมการท่านที่ ' + (i + 1) + (d.name ? ' — ' + d.name : '') }),
        h('span.ref', { text: 'ข้อมูลบริษัท!B' + (10 + i) }),
        h('span', { style: 'flex:1' }),
        h('button.btn.danger', {
          text: 'ลบ',
          onclick: () => {
            const k = K.state.kase;
            if (k.directors.length <= 1) { K.alert('ลบไม่ได้', 'ต้องมีกรรมการอย่างน้อย 1 ท่าน'); return; }
            k.directors.splice(i, 1); K.touch(); K.render();
          },
        }),
      ]),
      h('div.grid2', null, [
        // ชื่อ-สกุลกรอกที่บล็อก "รายชื่อกรรมการ" (B10+) ด้านบนที่เดียว จะได้ไม่มีช่องซ้ำสองที่
        field('ตำแหน่ง', K.input(idx + '.position', { kind: 'text' })),
        K.isAutoAllocation()
          ? field('เบี้ยที่จัดสรรให้ท่านนี้ (บาท)',
              h('input.cell.num', { value: K.money(d.premiumAllocated), disabled: true }),
              'งบกำไรขาดทุน!C22', 'คำนวณให้อัตโนมัติ = เบี้ยรวม ÷ จำนวนกรรมการ')
          : field('เบี้ยที่จัดสรรให้ท่านนี้ (บาท)', K.input(idx + '.premiumAllocated', { onchange: () => K.refreshOutputs() })),
        field('เกณฑ์ตามระดับตำแหน่ง (ช่องบังคับ)', K.input(idx + '.positionCriteria', { kind: 'text', placeholder: 'เช่น กรรมการผู้จัดการ = 3 เท่าของกรรมการทั่วไป' })),
        field('เงินเดือนทั้งปี (บาท)', K.input(idx + '.salary', { onchange: () => K.refreshOutputs() }), 'ภาษีทุกทอดกรรมการ' + (i + 1) + '!E7'),
        field('โบนัสทั้งปี (บาท)', K.input(idx + '.bonus', { onchange: () => K.refreshOutputs() })),
      ]),
      h('p.hint', null, [
        'ภาษีทุกทอดของท่านนี้ ',
        K.out((c) => (c && c.perDirector[i] ? K.money(c.perDirector[i].gross.tax) : '–')),
        ' บาท · ภาษีถ้ารับเงินเดือนอย่างเดียว ',
        K.out((c) => (c && c.perDirector[i] ? K.money(c.perDirector[i].gross.salaryOnlyTax) : '–')),
        ' บาท',
      ]),
    ]);
  }

  // ── แกะข้อความ DBD แล้วถามยืนยันก่อนเขียนทับ ──────────────────────────
  function parsePaste(text) {
    if (!String(text || '').trim()) { K.alert('ยังไม่มีข้อความ', 'วางข้อความจากหน้า DBD ลงในช่องก่อน'); return; }
    const out = Imp.parseCompanyText(text);
    const k = K.state.kase;
    const rows = [];
    // เก็บเฉพาะช่องที่ชีต "ข้อมูลบริษัท" ของ Excel มี (บวกกรรมการลงชื่อผูกพันที่ใช้เติมร่างมติที่ประชุม)
    // ช่องอื่นที่ตัวแกะอ่านได้ เช่น Website / ประเภทธุรกิจ / วัตถุประสงค์ ไม่ต้องเอาเข้ามาให้รก
    const labels = {
      name: 'ชื่อนิติบุคคล', status: 'สถานะนิติบุคคล', registeredDate: 'วันที่จดทะเบียนจัดตั้ง',
      paidUpCapital: 'ทุนจดทะเบียน', regNo: 'เลขทะเบียนเดิม (เลขนิติบุคคล 13 หลัก)',
      businessGroup: 'กลุ่มธุรกิจ', sizeLabel: 'ขนาดธุรกิจ', address: 'ที่ตั้งสำนักงานแห่งใหญ่',
      signingAuthority: 'กรรมการลงชื่อผูกพัน (ใช้ในร่างมติที่ประชุม)',
    };
    Object.keys(out.fields).forEach((key) => {
      if (!labels[key]) { delete out.fields[key]; return; }
      const oldV = k.company[key];
      rows.push(h('tr', null, [
        h('td.label', { text: labels[key] || key }),
        h('td', { class: 'diff-old', text: oldV === null || oldV === undefined || oldV === '' ? '(ว่าง)' : String(oldV) }),
        h('td', { class: 'diff-new', text: String(out.fields[key]) }),
      ]));
    });
    if (out.directors.length) {
      rows.push(h('tr', null, [
        h('td.label', { text: 'รายชื่อกรรมการ' }),
        h('td', { class: 'diff-old', text: k.directors.map((d) => d.name).filter(Boolean).join(', ') || '(ว่าง)' }),
        h('td', { class: 'diff-new', text: out.directors.join(', ') }),
      ]));
    }
    if (!rows.length) {
      // บอกให้เห็นว่าระบบอ่านอะไรไปบ้าง จะได้รู้ว่า copy มาผิดก้อนหรือรูปแบบเพี้ยน
      const preview = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 4);
      K.dialog('แกะข้อมูลไม่ได้', [
        h('p', { text: 'ไม่พบหัวข้อที่รู้จักในข้อความนี้ — ระบบมองหาคำพวกนี้: ทุนจดทะเบียน · สถานะนิติบุคคล · วันที่จดทะเบียนจัดตั้ง · กลุ่มธุรกิจ · ขนาดธุรกิจ · ที่ตั้งสำนักงานแห่งใหญ่ · รายชื่อกรรมการ' }),
        h('p.note', { text: 'ให้ลากคลุมทั้งบล็อก "ข้อมูลนิติบุคคล" ในหน้า DBD (ตั้งแต่บรรทัด "ประเภทนิติบุคคล" ลงมาจนถึงรายชื่อกรรมการ) แล้ววางใหม่ ' +
          'ถ้ายังไม่ได้ ลองวางลิงก์หน้า DBD แทน ระบบจะดึงเลขทะเบียนนิติบุคคลให้ แล้วกรอกช่องที่เหลือเอง' }),
        h('p.hint', { text: 'สิ่งที่ระบบอ่านได้จากข้อความที่วาง (' + preview.length + ' บรรทัดแรก):' }),
        h('pre', { style: 'white-space:pre-wrap;font-size:12px;background:var(--surface-2);padding:8px;border-radius:8px;max-height:30vh;overflow:auto',
          text: preview.join('\n') || '(ไม่มีข้อความ)' }),
      ], [{ label: 'ปิด', primary: true, onclick: (d) => d.close() }]);
      return;
    }

    // บอกผลตัดสิน SME ให้เห็นตั้งแต่ในหน้ายืนยัน จะได้รู้ทันทีว่าต้องไปเอางบมาเพิ่มไหม
    const cap = E.num(out.fields.paidUpCapital);
    const rev = E.lastValue(k.financials.revenues);
    const verdict = E.determineSme({ paidUpCapital: cap === null ? k.company.paidUpCapital : cap, revenueLatest: rev }, k.taxYear);
    K.dialog('ยืนยันก่อนเขียนทับข้อมูลบริษัท', [
      h('p.note', { text: 'ตรวจดูก่อนว่าค่าใหม่จะไปลงช่องไหน (ค่าเดิมขีดฆ่า / ค่าใหม่สีเขียว)' }),
      K.callout(verdict.pending ? 'warn' : verdict.isSme ? 'ok' : 'warn',
        (verdict.pending ? 'ยังตัดสินสถานะ SME ไม่ได้' : verdict.isSme ? 'ผลตัดสิน: เข้าเกณฑ์ SME' : 'ผลตัดสิน: ไม่เข้าเกณฑ์ SME')
        + ' — ' + verdict.reason),
      // ชื่อบริษัทอยู่เหนือบล็อก "ข้อมูลนิติบุคคล" ในหน้า DBD คนมักลากคลุมไม่ติดมาด้วย
      (!out.fields.name && !k.company.name)
        ? K.callout('warn', 'ไม่พบชื่อบริษัทในข้อความที่วาง — ชื่อบริษัทอยู่บรรทัดบนสุดเหนือบล็อก "ข้อมูลนิติบุคคล" ' +
            'ลากคลุมให้ติดบรรทัดนั้นมาด้วยแล้ววางใหม่ หรือปล่อยไว้ก็ได้ เดี๋ยวระบบเติมให้เองตอนนำเข้าไฟล์ Excel งบการเงิน (ชื่ออยู่ในช่อง A1 ของไฟล์)')
        : null,
      K.table([h('tr', null, [h('th.label', { text: 'ช่อง' }), h('th', { text: 'ค่าเดิม' }), h('th', { text: 'ค่าใหม่' })])], rows),
    ], [
      { label: 'ยกเลิก', onclick: (d) => d.close() },
      {
        label: 'เขียนทับ', primary: true, onclick: (d) => {
          d.close();
          Object.keys(out.fields).forEach((key) => { k.company[key] = out.fields[key]; });
          if (out.directors.length) {
            const old = k.directors;
            k.directors = out.directors.map((name, i) => Object.assign(K.newDirector(i + 1), old[i] || {}, { name }));
          }
          K.touch(); K.render();
        },
      },
    ]);
  }

  K.registerTab(1, 'company', 'ข้อมูลบริษัท', render, { num: 1 });
})(typeof self !== 'undefined' ? self : this);
