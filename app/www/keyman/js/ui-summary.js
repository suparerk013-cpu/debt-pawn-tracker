// แท็บ 8 — สรุปผลต่างจาก Keyman (ชีต "สรุปผลต่างจาก Keyman")
// วางตามชีตเดิมทุกบล็อก แต่จัดหน้าใหม่ให้อ่านจากคำตอบไปหาที่มา:
//   1) แถบคำตอบ
//   2) การ์ดสองฝั่ง After / Before — แถวตรงกันบรรทัดต่อบรรทัดแบบในชีต
//   3) สามบล็อกเปรียบเทียบของชีตเดิม: ภาษีที่เสียรวม · เงินที่กรรมการรับจริง · เงินเข้าเจ้าของ
//   4) ตารางเต็มกับข้อควรระวัง พับเก็บไว้
(function (root) {
  'use strict';
  const K = root.K, h = K.h;

  const B = (v) => K.money(v) + ' บาท';
  const pctOf = (diff, base) => (base ? Math.abs(diff / base * 100) : null);

  // ── บัญชีย่อยในการ์ดแต่ละฝั่ง ──────────────────────────────────────────
  function lr(label, opts) {
    const o = opts || {};
    return h('div', { class: 'lr ' + (o.sum ? 'sumline' : '') }, [
      h('div.t', null, [label, o.note ? h('small', { text: o.note }) : null]),
      h('span', { class: 'n ' + (o.tone || ''), text: o.text }),
    ]);
  }

  // ไม่มีตัวเลขพาดหัวในการ์ดนี้ — ยอดเงินเข้าเจ้าของอยู่บล็อก 3 อยู่แล้ว ใส่ซ้ำจะสับสน
  function scenario(side, title, tag, rows) {
    return h('div', { class: 'scen ' + side }, [
      h('div.who', null, [h('span.swatch'), h('span', { text: title }), tag ? h('span.tag', { text: tag }) : null]),
      h('div.ledger', null, rows),
    ]);
  }

  // ── แถบผลต่าง — แทนช่องเขียว/น้ำเงินที่คั่นกลางในชีตเดิม ────────────────
  function deltaBar(d) {
    return h('div', { class: 'fdelta ' + (d.tone || '') }, [
      h('span.dk', { text: 'ผลต่าง' }),
      h('b.dv', { text: B(Math.abs(d.value)) }),
      d.pct === null ? null : h('span.dp', { text: d.pct.toFixed(1) + '%' }),
      h('span.dsay', { text: d.say }),
    ]);
  }

  // ── บล็อกเปรียบเทียบสองฝั่ง วางเป็นสองคอลัมน์ตามชีตเดิม ────────────────
  function block(no, title, hint, sides, delta) {
    const max = Math.max.apply(null, sides.map((s) => Math.max(0, s.value)).concat([1]));
    return h('div', null, [
      h('h3.blkt', null, [h('span.no', { text: no }), title, h('span.hint', { text: hint })]),
      h('div.cmpblk', null, sides.map((s) => h('div', { class: 'pane ' + s.cls }, [
        h('div.ph', null, [h('span.swatch'), h('span', { text: s.name })]),
        h('div.pv', { text: B(s.value) }),
        h('div.meter', null, [h('i', { style: 'width:' + (Math.max(0, s.value) / max * 100).toFixed(2) + '%' })]),
        s.why ? h('div.pc', { text: s.why }) : null,
      ]))),
      deltaBar(delta),
    ]);
  }

  // บล็อก 4 ของชีตเดิมเป็นช่องว่างให้กรอกเอง แอปก็ทำเป็นช่องกรอกเหมือนกัน
  // แถบผลต่างกับแถบวัดห่อด้วย K.out จะได้ขยับตามทันทีที่พิมพ์ โดยไม่ต้องวาดหน้าใหม่
  function blockInput(no, title, hint, sides, delta) {
    const val = (side) => K.E.num(K.state.kase.policy[side.path]) || 0;
    const max = () => Math.max.apply(null, sides.map((x) => Math.max(0, val(x))).concat([1]));
    return h('div', null, [
      h('h3.blkt', null, [h('span.no', { text: no }), title, h('span.hint', { text: hint })]),
      h('div.cmpblk', null, sides.map((s2) => h('div', { class: 'pane ' + s2.cls }, [
        h('div.ph', null, [h('span.swatch'), h('span', { text: s2.name })]),
        h('div.pin', null, [K.input('policy.' + s2.path, { onchange: () => {} }), h('span.baht', { text: 'บาท' })]),
        K.out(() => h('div.meter', null, [h('i', { style: 'width:' + (Math.max(0, val(s2)) / max() * 100).toFixed(2) + '%' })])),
        h('div.pc', { text: s2.why }),
      ]))),
      K.out(() => {
        const d = delta();
        return h('div', { class: 'fdelta ' + (d.tone || '') }, [
          h('span.dk', { text: 'ผลต่าง' }),
          h('b.dv', { text: d.value === null ? '–' : B(Math.abs(d.value)) }),
          d.pct === null ? null : h('span.dp', { text: d.pct.toFixed(1) + '%' }),
          h('span.dsay', { text: d.say }),
        ]);
      }),
    ]);
  }

  function render(main) {
    const c = K.state.computed;
    if (!c) { main.appendChild(K.card('สรุปผลต่างจาก Keyman', null, [h('p.note', { text: 'ยังคำนวณไม่ได้' })])); return; }
    const cmp = c.comparison, A = cmp.after, Bf = cmp.before;
    const wrap = h('div.sumx');

    // ── 1) แถบคำตอบ ──────────────────────────────────────────────────────
    let tone = 'ok', kicker, value, unit, sub;
    if (cmp.noTaxBenefit) {
      tone = 'warn';
      kicker = 'ปีล่าสุดบริษัทนี้ไม่ได้เสียภาษีเงินได้นิติบุคคล';
      value = 'ไม่มีผลประหยัดภาษี'; unit = '';
      sub = 'ต้องเสนอด้วยเหตุผลด้านสวัสดิการและการรักษาคนสำคัญ ไม่ใช่ด้านภาษี';
    } else if (cmp.taxDiff > 0) {
      kicker = 'ทำคีย์แมนแล้วเสียภาษีน้อยลงปีละ';
      value = K.money(cmp.taxDiff); unit = 'บาท';
      sub = 'เงินที่กรรมการรับจริงเพิ่มขึ้น ' + B(cmp.directorNetDiff) +
        ' · เงินเข้าเจ้าของรวมเพิ่มขึ้น ' + B(cmp.cashDiff);
    } else {
      tone = 'warn';
      kicker = 'ชุดตัวเลขนี้ยังไม่ประหยัดภาษี — เสียเพิ่มปีละ';
      value = K.money(-cmp.taxDiff); unit = 'บาท';
      sub = 'ลองปรับเบี้ยลงมาที่ระดับแนะนำในแท็บ 2 งบกำไรขาดทุน แล้วกลับมาดูใหม่';
    }
    wrap.appendChild(h('div', { class: 'verdict ' + tone }, [
      h('div.k', { text: kicker }),
      h('div.v', null, [value, unit ? h('span.unit', { text: unit }) : null]),
      h('div.sub', { text: sub }),
      h('div.side', null, [h('span', {
        class: 'pill ' + (c.checks.canQuote ? 'ok' : 'block'),
        text: c.checks.canQuote ? '✓ ออกใบเสนอได้' : '⛔ ยังออกใบเสนอไม่ได้ (' + c.checks.blocking.length + ' ข้อ)',
      })]),
    ]));

    // ── 2) บล็อกที่ 1 ของชีตเดิม — แถวตรงกันบรรทัดต่อบรรทัด ──────────────
    wrap.appendChild(h('div.vlegend', null, [
      h('span', { html: '<i class="s1"></i>ทำคีย์แมน (After)' }),
      h('span', { html: '<i class="s2"></i>ปล่อยเป็นเงินปันผล (Before)' }),
      h('span.vnote', { text: '% ทุกบล็อกเทียบกับฝั่งปันผล' }),
    ]));
    wrap.appendChild(h('h3.blkt', null, [h('span.no', { text: '1' }), 'ภาษีที่เสียรวม',
      h('span.hint', { text: 'ยิ่งต่ำยิ่งดี · บาทต่อปี' })]));
    wrap.appendChild(h('div.vs', null, [
      scenario('a', 'ทำคีย์แมน', cmp.taxDiff > 0 && !cmp.noTaxBenefit ? 'ประหยัดกว่า' : null, [
        lr('เบี้ยประกัน', { text: K.money(A.premium) }),
        lr('ภาษีทุกทอด', { text: K.money(A.allTierTax), note: 'บริษัทออกให้แทนกรรมการ' }),
        lr('ค่าใช้จ่ายรวม', { text: K.money(A.totalExpense), note: 'เบี้ย + ภาษีที่บริษัทออกให้' }),
        lr('ประหยัดภาษีนิติ', A.citSaving
          ? { text: '−' + K.money(A.citSaving), tone: 'neg' }
          : { text: K.money(0), note: 'ปีล่าสุดไม่ได้เสียภาษีนิติบุคคล จึงไม่มีส่วนที่ลดได้' }),
        lr('ภาษีเงินปันผล', { text: K.money(A.dividendTax), note: 'ไม่ได้ปันผล จึงไม่มี' }),
        lr('เสียภาษีรวม', { text: K.money(A.netTax), sum: true }),
      ]),
      scenario('b', 'ปันผล', null, [
        lr('เงินส่วนกำไร', { text: K.money(Bf.lumpSum) }),
        lr('ภาษีบุคคล', { text: K.money(Bf.personalTax), note: 'จากเงินเดือนอย่างเดียว' }),
        lr('ค่าใช้จ่าย', { text: '–', note: 'เงินส่วนกำไรลงเป็นรายจ่ายไม่ได้' }),
        lr('ภาษีนิติบุคคล', { text: K.money(Bf.cit) }),
        lr('ภาษีเงินปันผล', { text: K.money(Bf.dividendTax), note: 'หัก ณ ที่จ่าย 10%' }),
        lr('เสียภาษีรวม', { text: K.money(Bf.totalTax), sum: true }),
      ]),
    ]));
    wrap.appendChild(deltaBar({
      value: cmp.taxDiff, pct: pctOf(cmp.taxDiff, Bf.totalTax),
      tone: cmp.taxDiff > 0 ? 'good' : cmp.taxDiff < 0 ? 'bad' : '',
      say: cmp.taxDiff > 0 ? 'เสียภาษีน้อยลง' : cmp.taxDiff < 0 ? 'เสียภาษีมากขึ้น' : 'เท่ากันทั้งสองฝั่ง',
    }));

    // ── 3) บล็อกที่ 2 และ 3 ของชีตเดิม ───────────────────────────────────
    const say = (d, up, down) => (d > 0 ? up : d < 0 ? down : 'เท่ากันทั้งสองฝั่ง');
    const dtone = (d) => (d > 0 ? 'good' : d < 0 ? 'bad' : '');
    // ฝั่งปันผลถูกหักภาษีบุคคลจากเงินเดือนออกไป — เขียนการลบให้เห็นเลข ไม่ใช่บอกลอย ๆ ว่า
    // "ถูกหักภาษีไว้" เพราะบางเคสภาษีเป็นศูนย์แล้วสองฝั่งเท่ากัน คนอ่านจะนึกว่าระบบลืมหัก
    const withheld = Bf.personalTax;
    const fullPay = 'เงินเดือนเต็ม ' + K.money(cmp.salaryTotal) + ' บาท';
    wrap.appendChild(block('2', 'กรรมการรับเงินเดือน, โบนัสจริง', 'ยิ่งสูงยิ่งดี · บาทต่อปี', [
      { name: 'ทำคีย์แมน', value: A.directorNet, cls: 'a',
        why: fullPay + ' · บริษัทออกภาษีให้ กรรมการจึงรับเต็มไม่ถูกหัก' },
      { name: 'ปันผล', value: Bf.directorNet, cls: 'b',
        why: withheld > 0
          ? fullPay + ' − ภาษีหัก ณ ที่จ่าย ' + K.money(withheld) + ' บาท'
          : fullPay + ' · เงินเดือนอย่างเดียวยังไม่ถึงเกณฑ์เสียภาษี จึงไม่ถูกหัก สองฝั่งเลยเท่ากัน' },
    ], {
      value: cmp.directorNetDiff, pct: pctOf(cmp.directorNetDiff, Bf.directorNet), tone: dtone(cmp.directorNetDiff),
      say: say(cmp.directorNetDiff, 'เงินเข้ากรรมการมากขึ้น', 'เงินเข้ากรรมการน้อยลง'),
    }));
    wrap.appendChild(block('3', 'เงินเข้าเจ้าของ', 'ยิ่งสูงยิ่งดี · บาทต่อปี', [
      { name: 'ทำคีย์แมน', value: A.ownerCash, cls: 'a', why: 'เงินเดือน + ประกัน' },
      { name: 'ปันผล', value: Bf.ownerCash, cls: 'b', why: 'เงินเดือน + ปันผล (หลังหักภาษีนิติและภาษีปันผล)' },
    ], {
      value: cmp.cashDiff, pct: pctOf(cmp.cashDiff, Bf.ownerCash), tone: dtone(cmp.cashDiff),
      say: say(cmp.cashDiff, 'เงินเข้าเจ้าของมากขึ้น', 'เงินเข้าเจ้าของน้อยลง'),
    }));

    // ── 4) รายละเอียดที่พับเก็บไว้ ────────────────────────────────────────
    const tableRows = [
      ['เบี้ยประกัน / เงินส่วนกำไร', A.premium, Bf.lumpSum],
      ['ภาษีทุกทอด / ภาษีบุคคล', A.allTierTax, Bf.personalTax],
      ['ค่าใช้จ่ายรวมที่บันทึกได้', A.totalExpense, Bf.totalExpense],
      ['ภาษีเงินได้นิติบุคคล', -A.citSaving, Bf.cit],
      ['ภาษีเงินปันผล', A.dividendTax, Bf.dividendTax],
      ['เสียภาษีรวม', A.netTax, Bf.totalTax, 'total'],
      ['เงินเดือน+โบนัสที่กรรมการรับจริง', A.directorNet, Bf.directorNet],
      ['เงินเข้าเจ้าของ', A.ownerCash, Bf.ownerCash, 'total'],
    ];
    const kp = K.state.kase.policy;
    wrap.appendChild(blockInput('4', 'ขอคืนภาษีบุคคลธรรมดา', 'ยิ่งสูงยิ่งดี · บาทต่อปี · กรอกเอง', [
      { name: 'ทำคีย์แมน', cls: 'a', path: 'refundAfter', why: 'ยอดที่กรรมการขอคืนได้ตอนยื่น ภ.ง.ด.90/91' },
      { name: 'ปันผล', cls: 'b', path: 'refundBefore', why: 'เครดิตภาษีเงินปันผลถ้าเลือกนำไปรวมคำนวณสิ้นปี' },
    ], () => {
      const kp = K.state.kase.policy;
      const a = K.E.num(kp.refundAfter), b = K.E.num(kp.refundBefore);
      if (a === null && b === null) return { value: null, pct: null, tone: '', say: 'ยังไม่ได้กรอกทั้งสองฝั่ง' };
      const diff = (a || 0) - (b || 0);
      return {
        value: diff, pct: b ? Math.abs(diff / b * 100) : null, tone: dtone(diff),
        say: say(diff, 'ขอคืนภาษีบุคคลมากขึ้น', 'ขอคืนภาษีบุคคลน้อยลง'),
      };
    }));

    wrap.appendChild(h('div', { style: 'height:26px' }));
    wrap.appendChild(h('details.fold', null, [
      h('summary', null, [h('span', { text: 'ตารางเปรียบเทียบเต็ม' }), h('span.cnt', { text: (tableRows.length + 1) + ' รายการ' })]),
      h('div.foldbody', null, [
        h('p.hint', { text: 'After = จ่ายเป็นเบี้ยคีย์แมนให้กรรมการ · Before = ปล่อยเงินก้อนเดียวกันเป็นกำไรแล้วจ่ายเป็นเงินปันผล · เงินก้อนที่ใช้เทียบ ' + B(Bf.lumpSum) }),
        K.table([h('tr.head-band', null, [
          h('th.label', { text: 'รายการ' }), h('th', { text: 'After (ทำคีย์แมน)' }), h('th', { text: 'Before (ปันผล)' }),
        ])], tableRows.map((r) => h('tr', { class: r[3] || '' }, [
          K.labelCell(r[0]),
          h('td.calc.num', { class: r[1] < 0 ? 'neg' : '', text: K.money(r[1]) }),
          h('td.calc.num', { class: r[2] < 0 ? 'neg' : '', text: K.money(r[2]) }),
        ])).concat([
          // สองแถวนี้เป็นช่องกรอกในบล็อก 4 ใช้ K.outCell จะได้ขยับตามตอนพิมพ์
          h('tr', null, [
            K.labelCell('ขอคืนภาษีบุคคลธรรมดา'),
            K.outCell(() => K.money(kp.refundAfter)),
            K.outCell(() => K.money(kp.refundBefore)),
          ]),
        ])),
      ]),
    ]));

    wrap.appendChild(h('details.fold', null, [
      h('summary', null, [h('span', { text: 'ข้อควรระวังที่ต้องอ่านคู่กับตัวเลข' }), h('span.cnt', { text: cmp.caveats.length + ' ข้อ' })]),
      h('div.foldbody', null, [
        h('ul', null, cmp.caveats.map((t) => h('li', { text: t }))),
        K.disclaimer(),
      ]),
    ]));

    main.appendChild(wrap);
  }

  K.registerTab(8, 'summary', 'สรุปผลต่าง', render, { num: 8 });
})(typeof self !== 'undefined' ? self : this);
