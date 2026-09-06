// แท็บ 1 — ข้อมูลบริษัท (ชีต "ข้อมูลบริษัท")
(function (root) {
  'use strict';
  const K = root.K, h = K.h, E = root.KeymanEngine, Imp = root.KeymanImport;

  function field(label, node, ref, hint) {
    return h('label.field', null, [
      h('span.lbl', null, [label, ref ? h('span.ref', { text: ref }) : null]),
      node,
      hint ? h('span.hint', { text: hint }) : null,
    ]);
  }

  function render(main) {
    const k = K.state.kase;

    // อัปโหลดไฟล์ Excel จาก DBD ได้จากแท็บนี้เลย (การ์ดเดียวกับที่อยู่ในแท็บ 2 และ 3)
    main.appendChild(K.dbdImportCard());

    // ── วางข้อมูลจากหน้าเว็บ DBD ─────────────────────────────────────────
    const pasteBox = h('textarea.cell', { rows: 5, placeholder: 'วางข้อความจากหน้า DBD DataWarehouse+ หรือจากไฟล์ Company_Profile.pdf ที่นี่ แล้วกด "แกะข้อมูล"' });
    main.appendChild(K.card('วางข้อมูลนิติบุคคลจาก DBD', 'DBD DataWarehouse+', [
      h('p.note', { text: 'copy ทั้งบล็อกข้อมูลนิติบุคคลจากหน้าเว็บ DBD หรือเปิด Company_Profile.pdf แล้วลากคลุมข้อความมาวางก็ได้ ' +
        'ระบบแกะจาก label ที่ลงท้ายด้วย ":" ให้เอง รองรับทั้งแบบที่ค่าอยู่บรรทัดเดียวกับ label และแบบ PDF ที่ค่าอยู่คนละบรรทัด' }),
      pasteBox,
      h('div.btnrow', null, [
        h('button.btn.primary', { text: 'แกะข้อมูล', onclick: () => parsePaste(pasteBox.value) }),
        h('button.btn', { text: 'ล้างช่อง', onclick: () => { pasteBox.value = ''; } }),
      ]),
    ]));

    // ── ข้อมูลบริษัท ─────────────────────────────────────────────────────
    main.appendChild(K.card('ข้อมูลบริษัท', 'ชีต ข้อมูลบริษัท', [
      h('div.grid2', null, [
        field('ชื่อนิติบุคคล', K.input('company.name', { kind: 'text' }), 'B1'),
        field('เลขทะเบียนนิติบุคคล (13 หลัก)', K.input('company.regNo', { kind: 'text' }), 'B5'),
        field('สถานะนิติบุคคล', K.input('company.status', { kind: 'text' }), 'B2'),
        field('วันที่จดทะเบียนจัดตั้ง', K.input('company.registeredDate', { kind: 'text' }), 'B3'),
        field('ทุนจดทะเบียนที่ชำระแล้ว (บาท)', K.input('company.paidUpCapital'), 'B4', 'ตัวเลขนี้เป็นตัวตัดสินสถานะ SME — ระบบตัดสินเอง ผู้ใช้เลือกเทมเพลตเองไม่ได้'),
        field('ประเภทนิติบุคคล', K.input('company.entityType', { kind: 'text' })),
        field('กลุ่มธุรกิจ / หมวดธุรกิจ', K.input('company.businessGroup', { kind: 'text' }), 'B6'),
        field('ขนาดธุรกิจ', K.input('company.sizeLabel', { kind: 'text' }), 'B7'),
      ]),
      field('ที่ตั้งสำนักงานแห่งใหญ่', K.input('company.address', { kind: 'text' }), 'B8'),
      field('ประเด็นปรึกษา', K.textarea('company.consultIssues', { rows: 3, placeholder: '1. …' }), 'B14–B17'),
      h('p.note.strong', null, [
        'ผลตัดสินสถานะ SME: ',
        K.out((c) => (c ? (c.sme.isSme ? 'เข้าเกณฑ์ SME' : 'ไม่เข้าเกณฑ์ SME') : '–')),
        ' — ',
        K.out((c) => (c ? c.sme.reason : '')),
      ]),
      K.legend(),
    ]));

    // ── กรรมการ ──────────────────────────────────────────────────────────
    const dirCard = K.card('รายชื่อกรรมการและการจัดสรรเบี้ยรายคน', 'ชีต ข้อมูลบริษัท B10+ · CHK-06', []);
    k.directors.forEach((d, i) => dirCard.appendChild(directorBlock(d, i)));
    dirCard.appendChild(h('div.btnrow', null, [
      h('button.btn', {
        text: '+ เพิ่มกรรมการ',
        onclick: () => { k.directors.push(K.newDirector(k.directors.length + 1)); K.touch(); K.render(); },
      }),
      h('button.btn', {
        text: 'เฉลี่ยเบี้ยให้ทุกท่านเท่ากัน',
        onclick: () => {
          const total = E.n0(k.policy.premiumTotal);
          const per = k.directors.length ? total / k.directors.length : 0;
          k.directors.forEach((d) => { d.premiumAllocated = per; });
          K.touch(); K.render();
        },
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
        h('strong', { text: 'กรรมการท่านที่ ' + (i + 1) }),
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
        field('ชื่อ-สกุล', K.input(idx + '.name', { kind: 'text' })),
        field('ตำแหน่ง', K.input(idx + '.position', { kind: 'text' })),
        field('เบี้ยที่จัดสรรให้ท่านนี้ (บาท)', K.input(idx + '.premiumAllocated', { onchange: () => K.refreshOutputs() })),
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
    const labels = {
      name: 'ชื่อนิติบุคคล', regNo: 'เลขทะเบียนนิติบุคคล', entityType: 'ประเภทนิติบุคคล',
      registeredDate: 'วันที่จดทะเบียนจัดตั้ง', status: 'สถานะนิติบุคคล', paidUpCapital: 'ทุนจดทะเบียน',
      address: 'ที่ตั้ง', businessGroup: 'หมวดธุรกิจ', fiscalYearsFiled: 'ปีที่ส่งงบการเงิน',
    };
    Object.keys(out.fields).forEach((key) => {
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
    if (!rows.length) { K.alert('แกะข้อมูลไม่ได้', 'ไม่พบ label ที่รู้จักในข้อความนี้ — ต้องมีบรรทัดแบบ "เลขทะเบียนนิติบุคคล : 0105557181201"'); return; }

    K.dialog('ยืนยันก่อนเขียนทับข้อมูลบริษัท', [
      h('p.note', { text: 'ตรวจดูก่อนว่าค่าใหม่จะไปลงช่องไหน (ค่าเดิมขีดฆ่า / ค่าใหม่สีเขียว)' }),
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
