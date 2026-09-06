// แท็บ 2 — งบกำไรขาดทุน (ชีต "งบกำไรขาดทุน" แถว 4–33)
// จุดที่ทำให้ตรง Excel เป๊ะ: ดูหมวด 7.1 ของข้อกำหนด — แถวสัดส่วนใช้ตัวหารคนละตัว,
// %เปลี่ยนแปลงเป็นช่องกรอก, สัดส่วนคำนวณจริงแค่ 4 แถว, ค่าเฉลี่ยแถวดอกเบี้ยไม่มีช่อง
(function (root) {
  'use strict';
  const K = root.K, h = K.h, E = root.KeymanEngine;
  const IDX = [0, 1, 2];

  const val = (key, i) => E.num(K.state.kase.financials[key][i]);
  const avg3 = (key) => E.avg(K.state.kase.financials[key]);

  function ratioOf(rowDef, i) {
    if (rowDef.ratio === 'revenue') {
      const base = val('revenues', i);
      const v = val(rowDef.key, i);
      return base && v !== null ? v / base : null;
    }
    if (rowDef.ratio === 'profit') {  // F14 = D14/D13 — หารด้วยกำไรก่อนภาษี ไม่ใช่รายได้
      const base = val('profitsBeforeTax', i);
      const v = val(rowDef.key, i);
      return base && v !== null ? v / base : null;
    }
    return null;
  }
  function ratioAvg(rowDef) {
    if (rowDef.ratio === 'revenue') {
      const base = avg3('revenues'), v = avg3(rowDef.key);
      return base && v !== null ? v / base : null;
    }
    if (rowDef.ratio === 'profit') {
      const base = avg3('profitsBeforeTax'), v = avg3(rowDef.key);
      return base && v !== null ? v / base : null;
    }
    return null;
  }

  // ช่อง C18 ของ Excel เป็นช่องกรอกสีเหลือง (ค่าเบี้ยประกันที่จะเสนอ) ไม่ใช่ช่องสูตร
  // เป็นช่องเดียวกับ "เบี้ยประกันรวมทั้งปี" ในแท็บ 1 — พิมพ์ที่ไหนก็อัปเดตอีกที่ทันที
  function premiumCell() {
    const inp = K.input('policy.premiumTotal', { onchange: () => K.refreshOutputs() });
    inp.addEventListener('change', () => K.render());
    return K.h('td', null, [inp, K.h('span.ref', { text: 'C18' })]);
  }

  // โหมดจัดสรรเบี้ย — 'auto' เดินตามสูตร C22 = C18 ÷ C21 ของ Excel แล้วส่งค่าไปให้
  // แท็บ 4 (ค่าตอบแทนกรรมการ) และแท็บ 7 (ภาษีทุกทอด) ใช้ต่อทันที เหมือนที่ทุกชีตใน
  // ไฟล์เดิมอ้าง C22 · 'manual' ไว้ใช้ตอนจัดสรรไม่เท่ากันตามระดับตำแหน่ง
  function allocationSwitch() {
    return K.switch2(
      [{ value: 'auto', label: 'เฉลี่ยเท่ากันทุกท่าน' }, { value: 'manual', label: 'จัดสรรรายคนเอง' }],
      K.isAutoAllocation() ? 'auto' : 'manual',
      (v) => { K.state.kase.policy.allocationMode = v; K.touch(); K.render(); }
    );
  }

  function render(main) {
    const k = K.state.kase;
    const c = K.state.computed || {};
    main.appendChild(K.dbdImportCard());

    // ── ตารางหลัก 10 แถว × 12 คอลัมน์ ───────────────────────────────────
    const yearCells = IDX.map((i) => h('th', { colspan: 3 }, [
      K.input('financials.years.' + i, { kind: 'text', placeholder: 'ปี พ.ศ.', width: '70px' }),
      h('span.ref', { text: ['D4', 'G4', 'J4'][i] }),
    ]));
    const head = [
      h('tr.head-band', null, [h('th.label', { text: 'หน่วย : บาท' })].concat(yearCells).concat([h('th', { colspan: 2, text: 'ค่าเฉลี่ย 3 ปี' })])),
      h('tr', null, [h('th.label', { text: '' })]
        .concat(IDX.reduce((acc) => acc.concat([
          h('th', { text: 'จำนวนเงิน' }), h('th', { text: '%เปลี่ยนแปลง' }), h('th', { text: 'สัดส่วน' }),
        ]), []))
        .concat([h('th', { text: 'ค่าเฉลี่ย 3 ปี' }), h('th', { text: 'สัดส่วน' })])),
    ];

    const body = K.PL_ROWS.map((r) => {
      const cells = [K.labelCell(r.label, 'B' + r.row)];
      IDX.forEach((i) => {
        const colLetter = ['D', 'G', 'J'][i];
        cells.push(K.cellIn('financials.' + r.key + '.' + i, { ref: colLetter + r.row, onchange: () => K.refreshOutputs() }));
        cells.push(K.cellIn('financials.pct.' + r.key + '.' + i, { kind: 'pct', ref: ['E', 'H', 'K'][i] + r.row }));
        if (r.ratio === 'dash') cells.push(K.dashCell(['F', 'I', 'L'][i] + r.row));
        else if (r.ratio === 'none') cells.push(h('td.calc', { text: '' }));
        else cells.push(K.outCell(() => K.ratio(ratioOf(r, i)), { ref: ['F', 'I', 'L'][i] + r.row }));
      });
      // ค่าเฉลี่ย 3 ปี
      if (r.noAvg) cells.push(h('td.calc', { text: '' }));            // ดอกเบี้ยจ่ายไม่มีช่องค่าเฉลี่ยใน Excel
      else if (r.avgZero) cells.push(K.outCell(() => K.money(0), { ref: 'N' + r.row }));  // กำไรขั้นต้นตรึงเป็น 0
      else cells.push(K.outCell(() => K.money(avg3(r.key)), { ref: 'N' + r.row }));
      if (r.ratio === 'dash') cells.push(K.dashCell('O' + r.row));
      else if (r.ratio === 'none') cells.push(h('td.calc', { text: '' }));
      else cells.push(K.outCell(() => K.ratio(ratioAvg(r)), { ref: 'O' + r.row }));
      return h('tr', { class: r.bold ? 'total' : '' }, cells);
    });

    main.appendChild(K.card('งบกำไรขาดทุน', 'ชีต งบกำไรขาดทุน แถว 4–15', [
      K.table(head, body),
      h('div.btnrow', null, [
        h('button.btn', { text: 'คำนวณ %เปลี่ยนแปลงให้เฉพาะช่องที่เว้นว่าง', onclick: fillPct }),
      ]),
      h('p.hint', {
        text: '%เปลี่ยนแปลงเป็นค่าที่มาจาก DBD จึงทำเป็นช่องกรอก ไม่ใช่สูตร (ปีแรกสุดในตารางไม่มีปีก่อนหน้าให้เทียบอยู่แล้ว) · ' +
          'คอลัมน์สัดส่วนของแถว "ภาษีเงินได้" หารด้วยกำไรก่อนภาษี ไม่ใช่รายได้รวม เพราะมันคืออัตราภาษีที่จ่ายจริง',
      }),
      K.legend(),
    ]));

    // ── ตารางเทียบเบี้ย (แถว 17–22) ─────────────────────────────────────
    const premium = () => E.n0(k.policy.premiumTotal);
    const latest = (key) => val(key, 2) !== null ? val(key, 2) : (val(key, 1) !== null ? val(key, 1) : val(key, 0));
    const cmpRows = [
      h('tr', null, [
        K.labelCell('เปรียบเทียบกับงบการเงินล่าสุด', 'B18'),
        premiumCell(),
        K.outCell(() => K.money(latest('totalExpense')), { ref: 'E18' }),
        K.outCell(() => K.ratio(latest('totalExpense') ? premium() / latest('totalExpense') : null), { ref: 'F18' }),
        K.outCell(() => K.money((latest('sga') || 0) + premium()), { ref: 'G18' }),
        K.outCell(() => K.ratio(latest('revenues') ? ((latest('sga') || 0) + premium()) / latest('revenues') : null), { ref: 'H18' }),
      ]),
      h('tr', null, [
        K.labelCell('เปรียบเทียบกับค่าเฉลี่ย 3 ปี', 'B19'),
        K.outCell(() => K.money(premium()), { ref: 'C19' }),
        K.outCell(() => K.money(avg3('totalExpense')), { ref: 'E19' }),
        K.outCell(() => K.ratio(avg3('totalExpense') ? premium() / avg3('totalExpense') : null), { ref: 'F19' }),
        K.outCell(() => K.money((avg3('sga') || 0) + premium()), { ref: 'G19' }),
        K.outCell(() => K.ratio(avg3('revenues') ? ((avg3('sga') || 0) + premium()) / avg3('revenues') : null), { ref: 'H19' }),
      ]),
    ];

    main.appendChild(K.card('เบี้ยประกันเทียบกับงบ', 'ชีต งบกำไรขาดทุน แถว 17–22', [
      K.stats([
        { label: 'ค่าเบี้ยประกันที่เสนอ', tone: 'accent', value: () => K.money(premium()) + ' บาท' },
        { label: 'ค่าเบี้ยประกันเฉลี่ยคนละ (C22)', value: (c, kk) => K.money(kk.directors.length ? premium() / kk.directors.length : null) + ' บาท',
          note: () => (K.isAutoAllocation() ? 'ส่งไปแท็บ 4 และ 7 ให้อัตโนมัติ' : 'โหมดจัดสรรรายคนเอง') },
        { label: 'สัดส่วนเบี้ยต่อฐาน',
          value: (c) => (c && c.ceiling.base ? (premium() / c.ceiling.base * 100).toFixed(2) + '%' : '–'),
          note: 'ช่วงที่แนะนำ 8–12%' },
      ]),
      K.table([h('tr', null, [
        h('th.label', { text: 'เปรียบเทียบ' }), h('th', { text: 'ค่าเบี้ยประกัน' }), h('th', { text: 'รายจ่ายรวม' }),
        h('th', { text: 'สัดส่วน' }), h('th', { text: 'ค่าใช้จ่ายในการขายและบริการ' }), h('th', { text: 'สัดส่วน' }),
      ])], cmpRows),
      K.table(null, [
        h('tr', null, [
          K.labelCell('จำนวนกรรมการบริหาร', 'B21'),
          K.outCell((c, kk) => K.int(kk.directors.length), { ref: 'C21' }),
          K.labelCell('ช่องอ้างอิงจากไฟล์เดิม (ไม่ใช้คิดเบี้ย)', 'I21'),
          K.outCell(() => K.money(latest('revenues') === null ? null : latest('revenues') * 0.05), { ref: 'I21' }),
          K.outCell(() => 'เก็บไว้ให้ตรงไฟล์ Excel เดิมเท่านั้น'),
        ]),
        h('tr', null, [
          K.labelCell('ค่าเบี้ยประกันเฉลี่ยคนละ', 'B22'),
          K.outCell((c, kk) => K.money(kk.directors.length ? premium() / kk.directors.length : null), { ref: 'C22' }),
          K.labelCell('ช่องอ้างอิงจากไฟล์เดิม (ไม่ใช้คิดเบี้ย)', 'I22'),
          K.outCell(() => K.money(latest('taxPaid') === null ? null : latest('taxPaid') * 0.2), { ref: 'I22' }),
          K.outCell(() => {
            const ref20 = latest('taxPaid') === null ? null : latest('taxPaid') * 0.2;
            if (ref20 === null) return '–';
            return premium() > ref20 ? 'เบี้ยสูงกว่าเกณฑ์อ้างอิงนี้' : 'เบี้ยต่ำกว่าเกณฑ์อ้างอิงนี้';
          }),
        ]),
      ]),
      h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0 6px' }, [
        h('span.hint', { text: 'โหมดจัดสรรเบี้ย:', style: 'margin:0' }),
        allocationSwitch(),
      ]),
      h('p.note', null, [
        'ยอดบันทึกเป็นรายจ่าย (เบี้ย + ภาษีที่บริษัทออกให้) ',
        K.out((cc) => (cc ? K.money(cc.recordedExpenseTotal) : '–')),
        ' บาท = ',
        K.out((cc) => (cc && cc.ceiling.base ? (cc.recordedExpenseTotal / cc.ceiling.base * 100).toFixed(2) + '%' : '–')),
        ' ของฐาน (เพดาน 20%)',
      ]),
      h('p.hint', { text: 'ช่อง C18 พิมพ์ได้ที่นี่ · โหมดเฉลี่ยเท่ากันส่งค่า C22 ไปให้แท็บ 4 และ 7 เอง · ช่อง I21/I22 เก็บไว้ให้ตรงไฟล์เดิม ไม่ได้ใช้คิดเบี้ย' }),
    ]));

    // ── เบี้ยประกันที่แนะนำ ─────────────────────────────────────────────
    // จัดหน้าให้เหลือเท่าที่ต้องตัดสินใจจริง: ตัวเลขเดียวตัวใหญ่ · ปุ่มเลือกระดับ ·
    // บรรทัดเพดานหนึ่งบรรทัด · รายละเอียดที่เหลือพับเก็บไว้ใต้ปุ่ม
    // ชื่อฐานพิมพ์ครั้งเดียวพอ ที่เหลือเรียกสั้น ๆ ว่า "ฐาน"
    const rec = c.recommendation || {};
    const pctText = (v) => (v === null || v === undefined ? '–' : (v * 100).toFixed(1) + '%');

    if (rec.available === false) {
      main.appendChild(K.card('เบี้ยประกันที่แนะนำ', null, [h('p.note', { text: rec.reason || 'ยังคำนวณไม่ได้' })]));
    } else {
      // รายละเอียดเพดาน — ซ่อนไว้ก่อน กดปุ่มถึงจะกาง
      const capRows = (rec.caps || []).map((cap) => h('tr', { class: rec.binding && rec.binding.key === cap.key ? 'total' : '' }, [
        h('td.label', { title: cap.detail, text: cap.label }),
        h('td.calc.num', { text: K.money(cap.value) }),
        // เพดานที่สูงกว่าฐานมาก ๆ ไม่ต้องโชว์เปอร์เซ็นต์ให้รก แค่บอกว่าไม่ใช่ตัวบีบ
        h('td.calc.num', { text: cap.pctOfBase !== null && cap.pctOfBase <= 2 ? pctText(cap.pctOfBase) : '–' }),
      ]));
      const details = h('div', { hidden: true }, [
        K.table([h('tr', null, [h('th.label', { text: 'เพดานที่ใช้บีบ' }), h('th', { text: 'บาท' }), h('th', { text: '% ของฐาน' })])], capRows),
        h('p.hint', null, [
          'ที่ระดับแนะนำ: ภาษีที่บริษัทออกให้ ', K.out(() => K.money((K.state.computed.recommendation || {}).grossUpAtSuggested)),
          ' บาท · บันทึกเป็นรายจ่ายรวม ', K.out(() => K.money((K.state.computed.recommendation || {}).bookedAtSuggested)), ' บาท',
        ]),
        h('p.hint', { text: 'ฐานคิดเบี้ยใช้ค่าที่ต่ำกว่าระหว่างปีล่าสุด (' + K.money(rec.sgaLatest) + ') กับค่าเฉลี่ย 3 ปี (' + K.money(rec.sgaAvg) + ')' }),
        h('p.hint', { text: 'ช่วงที่แนะนำมาจากเคสจริง ไม่ใช่อัตราที่กำหนดไว้ในประมวลรัษฎากร — กฎหมายกำหนดเพียงว่ารายจ่ายต้องเป็นไปเพื่อกิจการโดยเฉพาะ (ม.65 ตรี (13)) และต้องจ่ายให้กรรมการทุกคนเป็นการทั่วไปตามระเบียบสวัสดิการ (กค 0811/408)' }),
      ]);
      const toggle = h('button.btn', {
        text: 'ดูเพดานทั้งหมด ▾',
        onclick: () => {
          details.hidden = !details.hidden;
          toggle.textContent = details.hidden ? 'ดูเพดานทั้งหมด ▾' : 'ซ่อนรายละเอียด ▴';
        },
      });

      main.appendChild(K.card('เบี้ยประกันที่แนะนำ', null, [
        // เพดานเหลือศูนย์ = ยังไม่ควรเสนอ บอกตรง ๆ แทนที่จะโชว์ 0.00
        rec.notViable ? K.callout('warn',
          'ยังไม่แนะนำให้เสนอคีย์แมนกับเคสนี้ — ' + (rec.binding ? '"' + rec.binding.label + '"' : 'เกณฑ์ภายใน') +
          ' ไม่เหลือช่องให้เบี้ยเลย ควรรอให้ผลประกอบการดีขึ้นก่อน หรือเสนอด้วยเหตุผลด้านสวัสดิการล้วน ๆ') : null,
        // ตัวเลขเดียวที่ต้องอ่าน
        rec.notViable ? null : h('div.hero', null, [
          h('b', { text: K.money(rec.suggested) + ' บาท' }),
          h('span', { text: 'ต่อปี · เฉลี่ยคนละ ' + K.money(rec.perDirector) + ' บาท · ' + pctText(rec.suggestedPct) + ' ของฐาน' }),
          h('button.btn.primary', { text: 'ใช้ตัวเลขนี้', onclick: () => usePremium(rec.suggested) }),
        ]),
        // เลือกระดับอื่นได้ด้วยปุ่มเดียว
        rec.notViable ? null : h('div.chips', null, (rec.levels || []).map((lv) => h('button', {
          class: 'chip' + (lv.overCap ? ' off' : '') + (!lv.overCap && Math.abs(lv.amount - rec.suggested) < 0.5 ? ' on' : ''),
          disabled: lv.overCap,
          title: lv.overCap ? 'เกินเพดานของเคสนี้' : 'กดเพื่อใช้ตัวเลขนี้',
          onclick: () => usePremium(lv.amount),
        }, [
          h('span.k', { text: lv.label }),
          h('span.v', { text: K.money(lv.amount) }),
          h('span.p', { text: (lv.pct * 100).toFixed(0) + '%' }),
        ]))),
        // เพดานและฐาน อย่างละบรรทัด
        h('p.note', null, [
          'เพดานของเคสนี้ ', h('strong', { text: K.money(rec.cap) + ' บาท' }),
          rec.binding ? h('span', { text: ' · ตัวบีบ: ' + rec.binding.label }) : null,
        ]),
        h('p.hint', { text: 'ฐานคิดเบี้ย: ค่าใช้จ่ายในการขายและบริการ ' + K.money(rec.base) + ' บาท' }),
        h('div.btnrow', null, [toggle]),
        details,
      ]));
    }

    // ── ค่าใช้จ่ายต้องห้าม (แถว 25–33) ──────────────────────────────────
    const fRows = (label, pick, ref) => h('tr', null, [K.labelCell(label, ref)].concat(IDX.map((i) =>
      K.outCell((c) => pick(c, i), { ref: ['D', 'E', 'F'][i] + (ref ? ref.replace(/^B/, '') : '') }))));

    main.appendChild(K.card('อัตราภาษีที่จ่ายสูงเกิน อาจมาจากค่าใช้จ่ายต้องห้าม (ที่ถูกบวกกลับ)', 'ชีต งบกำไรขาดทุน แถว 25–33 · CHK-04', [
      K.table([h('tr', null, [h('th.label', { text: 'รายการ' })].concat(IDX.map((i) =>
        K.outCell((c, kk) => kk.financials.years[i] || '–', { th: true, ref: ['D26', 'E26', 'F26'][i] }))))], [
        fRows('กำไร(ขาดทุน) ก่อนภาษี', (c, i) => K.money(val('profitsBeforeTax', i)), 'B27'),
        fRows('ภาษีเงินได้', (c, i) => K.money(val('taxPaid', i)), 'B28'),
        fRows('อัตราภาษีที่จ่าย', (c, i) => {
          const p = val('profitsBeforeTax', i), t = val('taxPaid', i);
          return p && t !== null ? (t / p * 100).toFixed(2) + '%' : '–';
        }, 'B29'),
        fRows('ฐานภาษี (ภาษีที่ควรจะเป็น)', (c, i) => (c ? K.money(c.forbiddenByYear[i] && c.forbiddenByYear[i].expectedTax) : '–'), 'B30'),
        fRows('ส่วนเกินภาษี', (c, i) => {
          const f = c && c.forbiddenByYear[i];
          if (!f || f.taxPaid === null) return '–';
          return K.money(f.excessTax);
        }, 'B31'),
        fRows('คชจ.ต้องห้าม', (c, i) => {
          const f = c && c.forbiddenByYear[i];
          if (!f) return '–';
          return f.hidden ? 'ไม่แสดง' : K.money(f.amount);
        }, 'B32'),
        fRows('อัตราส่วนต่อคชจ.รวม', (c, i) => {
          const f = c && c.forbiddenByYear[i];
          const tot = val('totalExpense', i);
          if (!f || f.hidden || !tot) return '–';
          return K.ratio(f.amount / tot);
        }, 'B33'),
      ]),
      h('p.note', null, [K.out((c) => {
        if (!c) return '';
        const notes = c.forbiddenByYear.filter((f) => f.hidden && f.note).map((f, i) => f.note);
        const uniq = notes.filter((v, i) => notes.indexOf(v) === i);
        return uniq.length ? 'หมายเหตุ: ' + uniq.join(' / ') : 'ทุกปีคำนวณค่าใช้จ่ายต้องห้ามได้ตามปกติ';
      })]),
      h('p.hint', {
        text: 'รายจ่ายต้องห้าม หมายถึง รายจ่ายที่บันทึกเป็นค่าใช้จ่ายทางบัญชีแล้ว แต่ในทางภาษีไม่ให้ถือเป็นรายจ่ายในการคำนวณกำไรสุทธิ ' +
          '(ม.65 ตรี) จึงถูกบวกกลับเป็นกำไรและทำให้อัตราภาษีที่จ่ายจริงสูงกว่าอัตราตามกฎหมาย',
      }),
      K.disclaimer(),
    ]));
  }

  // กดจากตารางเบี้ยแนะนำ → เติมลงช่องเบี้ยรวม (C18) แล้ววาดหน้าใหม่ทั้งหน้า
  function usePremium(amount) {
    K.state.kase.policy.premiumTotal = E.round2(amount);
    K.touch();
    K.render();
  }

  function fillPct() {
    const k = K.state.kase;
    let filled = 0;
    K.PL_ROWS.forEach((r) => {
      [1, 2].forEach((i) => {
        const cur = k.financials.pct[r.key][i];
        if (cur !== '' && cur !== null && cur !== undefined) return;
        const prev = E.num(k.financials[r.key][i - 1]);
        const now = E.num(k.financials[r.key][i]);
        if (prev === null || now === null || prev === 0) return;
        k.financials.pct[r.key][i] = ((now - prev) / Math.abs(prev)) * 100;
        filled++;
      });
    });
    K.touch(); K.render();
    K.alert('คำนวณให้แล้ว', filled ? `เติม %เปลี่ยนแปลงให้ ${filled} ช่อง (เฉพาะช่องที่เว้นว่างและมีปีก่อนหน้าให้เทียบ)` : 'ไม่มีช่องว่างที่คำนวณได้');
  }

  K.registerTab(2, 'pl', 'งบกำไรขาดทุน', render, { num: 2 });
})(typeof self !== 'undefined' ? self : this);
