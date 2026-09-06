// แท็บ 8 — สรุปผลต่างจาก Keyman (ชีต "สรุปผลต่างจาก Keyman")
// หน้านี้ออกแบบสำหรับจอแท็บเล็ต/พีซีเป็นหลัก: อ่านคำตอบก่อน แล้วค่อยไล่ดูที่มา
//   1) แถบคำตอบ — ตัวเลขเดียวที่ลูกค้าอยากรู้
//   2) การ์ดสองฝั่ง After / Before วางเทียบกัน พร้อมบัญชีย่อยของแต่ละฝั่ง
//   3) กราฟแท่งสองชุด (ภาษีที่เสีย / เงินถึงมือเจ้าของ)
//   4) ตารางเต็มกับข้อควรระวัง พับเก็บไว้หลังปุ่มกด
(function (root) {
  'use strict';
  const K = root.K, h = K.h;

  const B = (v) => K.money(v) + ' บาท';

  // ── บัญชีย่อยในการ์ดแต่ละฝั่ง ──────────────────────────────────────────
  function lr(label, value, opts) {
    const o = opts || {};
    return h('div', { class: 'lr ' + (o.sum ? 'sumline' : '') }, [
      h('div.t', null, [label, o.note ? h('small', { text: o.note }) : null]),
      h('span', { class: 'n ' + (o.tone || ''), text: o.text || K.money(value) }),
    ]);
  }

  function scenario(side, title, tag, cashLabel, cash, rows) {
    return h('div', { class: 'scen ' + side }, [
      h('div.who', null, [h('span.swatch'), h('span', { text: title }), tag ? h('span.tag', { text: tag }) : null]),
      h('div.headline', null, [h('em', { text: cashLabel }), h('b', { text: B(cash) })]),
      h('div.ledger', null, rows),
    ]);
  }

  // ── กราฟแท่ง: แท่งละ 20px ปลายมน โคนชิดเส้นศูนย์เดียวกัน ──────────────
  function facet(title, subtitle, series, deltaText) {
    const max = Math.max.apply(null, series.map((s) => Math.max(0, s.value)).concat([1]));
    const bestValue = series.reduce((b, s) => (b === null ? s.value : Math[series.betterLow ? 'min' : 'max'](b, s.value)), null);
    return h('div.facet', null, [
      h('div.ft', { text: title }),
      h('div.fs', { text: subtitle }),
      h('div', null, series.map((s) => h('div.barrow', { title: s.name + ' · ' + B(s.value) }, [
        h('span.bl', { text: s.name }),
        h('div.btrack', null, [h('div', { class: 'bfill ' + s.cls, style: 'width:' + (Math.max(0, s.value) / max * 100).toFixed(2) + '%' })]),
        h('span', { class: 'bv ' + (s.value === bestValue ? 'win' : ''), text: K.money(s.value) }),
      ]))),
      deltaText ? h('p.fdelta', { text: deltaText }) : null,
    ]);
  }

  function render(main) {
    const c = K.state.computed;
    if (!c) { main.appendChild(K.card('สรุปผลต่างจาก Keyman', null, [h('p.note', { text: 'ยังคำนวณไม่ได้' })])); return; }
    const cmp = c.comparison, A = cmp.after, Bf = cmp.before;
    const wrap = h('div.sumx');

    // ── 1) แถบคำตอบ ──────────────────────────────────────────────────────
    const cashPct = Bf.ownerCash ? (cmp.cashDiff / Bf.ownerCash * 100) : null;
    const taxPct = Bf.totalTax ? (cmp.taxDiff / Bf.totalTax * 100) : null;
    let tone = 'ok', kicker, value, unit, sub;
    if (cmp.noTaxBenefit) {
      tone = 'warn';
      kicker = 'ปีล่าสุดบริษัทนี้ไม่ได้เสียภาษีเงินได้นิติบุคคล';
      value = 'ไม่มีผลประหยัดภาษี'; unit = '';
      sub = 'ต้องเสนอด้วยเหตุผลด้านสวัสดิการและการรักษาคนสำคัญ ไม่ใช่ด้านภาษี';
    } else if (cmp.taxDiff > 0) {
      kicker = 'ทำคีย์แมนแล้วเสียภาษีน้อยลงปีละ';
      value = K.money(cmp.taxDiff); unit = 'บาท';
      sub = 'เงินถึงมือเจ้าของเพิ่มขึ้น ' + B(cmp.cashDiff) +
        (cashPct === null ? '' : ' (+' + cashPct.toFixed(2) + '%)') +
        (taxPct === null ? '' : ' · ภาษีที่เสียลดลง ' + taxPct.toFixed(1) + '%');
    } else {
      tone = 'warn';
      kicker = 'ชุดตัวเลขนี้ยังไม่ประหยัดภาษี — เสียเพิ่มปีละ';
      value = K.money(-cmp.taxDiff); unit = 'บาท';
      sub = 'ลองปรับเบี้ยลงมาที่ระดับแนะนำในแท็บ 2 แล้วดูใหม่';
    }
    wrap.appendChild(h('div', { class: 'verdict ' + tone }, [
      h('div.k', { text: kicker }),
      h('div.v', null, [value, unit ? h('span.unit', { text: unit }) : null]),
      h('div.sub', { text: sub }),
      h('div.side', null, [
        h('span', {
          class: 'pill ' + (c.checks.canQuote ? 'ok' : 'block'),
          text: c.checks.canQuote ? '✓ ออกใบเสนอได้' : '⛔ ยังออกใบเสนอไม่ได้ (' + c.checks.blocking.length + ' ข้อ)',
        }),
      ]),
    ]));

    // ── 2) การ์ดสองฝั่ง ──────────────────────────────────────────────────
    wrap.appendChild(h('div.vs', null, [
      scenario('a', 'ทำคีย์แมน', cmp.taxDiff > 0 && !cmp.noTaxBenefit ? 'ประหยัดกว่า' : null,
        'เงินถึงมือเจ้าของ', A.ownerCash, [
          lr('เบี้ยประกันคีย์แมน', A.premium),
          lr('ภาษีทุกทอดที่บริษัทออกให้', A.allTierTax),
          lr('ค่าใช้จ่ายรวมที่บันทึกได้', A.totalExpense, { note: 'เบี้ย + ภาษีที่บริษัทออกให้' }),
          lr('ภาษีนิติบุคคลที่ลดได้', -A.citSaving,
            A.citSaving ? { tone: 'neg', text: '-' + K.money(A.citSaving) } : { note: 'ปีล่าสุดไม่ได้เสียภาษีนิติบุคคล จึงไม่มีส่วนที่ลดได้' }),
          lr('ภาษีที่เสียสุทธิ', A.netTax, { sum: true }),
        ]),
      scenario('b', 'ปันผล', null, 'เงินถึงมือเจ้าของ', Bf.ownerCash, [
        lr('เงินก้อนที่ปล่อยเป็นกำไร', Bf.lumpSum),
        lr('ภาษีเงินได้บุคคลธรรมดา', Bf.personalTax, { note: 'จากเงินเดือนอย่างเดียว' }),
        lr('ภาษีเงินได้นิติบุคคล', Bf.cit),
        lr('ภาษีเงินปันผล', Bf.dividendTax, { note: 'หัก ณ ที่จ่าย 10%' }),
        lr('ภาษีที่เสียสุทธิ', Bf.totalTax, { sum: true }),
      ]),
    ]));

    // ── 3) กราฟแท่ง ──────────────────────────────────────────────────────
    const taxSeries = [
      { name: 'ทำคีย์แมน', value: A.netTax, cls: 's1' },
      { name: 'ปันผล', value: Bf.totalTax, cls: 's2' },
    ];
    taxSeries.betterLow = true;
    const cashSeries = [
      { name: 'ทำคีย์แมน', value: A.ownerCash, cls: 's1' },
      { name: 'ปันผล', value: Bf.ownerCash, cls: 's2' },
    ];
    wrap.appendChild(K.card('เทียบให้เห็นภาพ', null, [
      h('div.vlegend', null, [
        h('span', { html: '<i class="s1"></i>ทำคีย์แมน (After)' }),
        h('span', { html: '<i class="s2"></i>ปล่อยเป็นเงินปันผล (Before)' }),
      ]),
      facet('ภาษีที่เสียสุทธิ', 'ยิ่งต่ำยิ่งดี · หน่วยเป็นบาทต่อปี', taxSeries,
        cmp.taxDiff > 0 ? 'ต่างกัน ' + B(cmp.taxDiff) + ' — ฝั่งทำคีย์แมนเสียน้อยกว่า'
          : cmp.taxDiff < 0 ? 'ต่างกัน ' + B(-cmp.taxDiff) + ' — ฝั่งทำคีย์แมนเสียมากกว่า'
          : 'สองฝั่งเสียภาษีเท่ากัน'),
      facet('เงินถึงมือเจ้าของ', 'ยิ่งสูงยิ่งดี · หน่วยเป็นบาทต่อปี', cashSeries,
        'ต่างกัน ' + B(Math.abs(cmp.cashDiff)) + (cashPct === null ? '' : ' (' + (cmp.cashDiff >= 0 ? '+' : '−') + Math.abs(cashPct).toFixed(2) + '%)')),
    ]));

    // ── 4) รายละเอียดที่พับเก็บไว้ ────────────────────────────────────────
    const tableRows = [
      ['เบี้ยประกัน / เงินส่วนกำไร', A.premium, Bf.lumpSum],
      ['ภาษีทุกทอด / ภาษีบุคคล', A.allTierTax, Bf.personalTax],
      ['ค่าใช้จ่ายรวมที่บันทึกได้', A.totalExpense, 0],
      ['ภาษีเงินได้นิติบุคคล', -A.citSaving, Bf.cit],
      ['ภาษีเงินปันผล', 0, Bf.dividendTax],
      ['ภาษีที่เสียสุทธิ', A.netTax, Bf.totalTax, 'total'],
      ['เงินถึงมือเจ้าของ', A.ownerCash, Bf.ownerCash, 'total'],
    ];
    wrap.appendChild(h('details.fold', null, [
      h('summary', null, [h('span', { text: 'ตารางเปรียบเทียบเต็ม' }), h('span.cnt', { text: tableRows.length + ' รายการ' })]),
      h('div.foldbody', null, [
        h('p.hint', { text: 'After = จ่ายเป็นเบี้ยคีย์แมนให้กรรมการ · Before = ปล่อยเงินก้อนเดียวกันเป็นกำไรแล้วจ่ายเป็นเงินปันผล · เงินก้อนที่ใช้เทียบ ' + B(Bf.lumpSum) }),
        K.table([h('tr.head-band', null, [
          h('th.label', { text: 'รายการ' }), h('th', { text: 'After (ทำคีย์แมน)' }), h('th', { text: 'Before (ปันผล)' }),
        ])], tableRows.map((r) => h('tr', { class: r[3] || '' }, [
          K.labelCell(r[0]),
          h('td.calc.num', { class: r[1] < 0 ? 'neg' : '', text: K.money(r[1]) }),
          h('td.calc.num', { class: r[2] < 0 ? 'neg' : '', text: K.money(r[2]) }),
        ]))),
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
