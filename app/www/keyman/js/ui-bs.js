// แท็บ 3 — งบแสดงฐานะการเงิน (ชีต "งบดุล" แถว 4–21)
// หน้าจอเรียงจากคำตอบไปหาที่มา: แถบกำไรสะสม → ตัวเลขชี้วัด → ตารางกรอก → กำไรสะสมรายปี
// ตารางแบ่งเป็นสามหมวดตามงบดุลจริง (สินทรัพย์ · หนี้สิน · ส่วนของผู้ถือหุ้น)
// ไม่งั้นเป็นกล่องเหลือง 66 กล่องเรียงกันรวดเดียว ไล่สายตาไม่ถูก
(function (root) {
  'use strict';
  const K = root.K, h = K.h, E = root.KeymanEngine;
  const IDX = [0, 1, 2];
  const val = (key, i) => E.num(K.state.kase.balance[key][i]);
  const an = () => E.balanceAnalysis(K.state.kase.balance, K.state.kase.company.paidUpCapital);

  // หมวดของแต่ละแถวตามงบดุลจริง — key แรกของหมวดเป็นตัวจุดหัวหมวด
  const SECTIONS = {
    receivables: 'สินทรัพย์',
    currentLiabilities: 'หนี้สิน',
    equity: 'ส่วนของผู้ถือหุ้น',
  };

  const ratio = (v, digits) => (v === null || v === undefined ? '–' : v.toFixed(digits === undefined ? 2 : digits));

  function render(main) {
    const k = K.state.kase;
    main.appendChild(K.dbdImportCard());

    // ── แถบคำตอบ: กำไรสะสม คือประเด็นที่เปิดบทสนทนาเรื่องคีย์แมน ──────────
    main.appendChild(K.out(() => {
      const a = an();
      const L = a.latest;
      const off = a.offBalance;
      const tone = !L ? 'warn' : off.length ? 'warn' : 'ok';
      return h('div', { class: 'verdict ' + tone }, [
        h('div.k', { text: L && L.year ? 'กำไร(ขาดทุน)สะสม ณ ปี ' + L.year : 'กำไร(ขาดทุน)สะสมปีล่าสุด' }),
        h('div.v', null, [
          L && L.retained !== null ? K.money(L.retained) : 'ยังไม่มีข้อมูล',
          L && L.retained !== null ? h('span.unit', { text: 'บาท' }) : null,
        ]),
        h('div.sub', {
          text: !L ? 'นำเข้างบแสดงฐานะการเงินจาก DBD หรือกรอกในตารางด้านล่าง'
            : 'สินทรัพย์รวม ' + K.money(L.totalAssets) + ' · หนี้สินรวม ' + K.money(L.totalLiabilities) +
              ' · ส่วนของผู้ถือหุ้น ' + K.money(L.equity) + ' · ทุนจดทะเบียนที่ชำระแล้ว ' + K.money(a.paidUpCapital),
        }),
        h('div.side', null, [h('span', {
          class: 'pill ' + (off.length ? 'block' : a.checked ? 'ok' : 'warn'),
          text: off.length
            ? '⛔ งบไม่ลงตัว ' + off.length + ' ปี'
            : a.checked ? '✓ งบดุลลงตัวทั้ง ' + a.checked + ' ปี' : 'ยังไม่มีตัวเลขให้ตรวจ',
        })]),
      ]);
    }));

    // ── ตัวเลขชี้วัดที่คิดจากช่องเดิม ไม่ได้เพิ่มช่องกรอกใหม่ ─────────────
    main.appendChild(K.card('ตัวเลขชี้วัดจากงบล่าสุด', null, [
      K.stats([
        { label: 'กำไร(ขาดทุน)สะสม', tone: 'accent',
          value: () => { const L = an().latest; return L && L.retained !== null ? K.money(L.retained) + ' บาท' : '–'; },
          note: 'ส่วนของผู้ถือหุ้น − ทุนที่ชำระแล้ว' },
        { label: 'เงินทุนหมุนเวียน',
          value: () => { const L = an().latest; return L && L.workingCapital !== null ? K.money(L.workingCapital) + ' บาท' : '–'; },
          note: 'สินทรัพย์หมุนเวียน − หนี้สินหมุนเวียน' },
        { label: 'อัตราส่วนสภาพคล่อง',
          value: () => { const L = an().latest; return L ? ratio(L.currentRatio) + ' เท่า' : '–'; },
          note: 'ต่ำกว่า 1 เท่า = สินทรัพย์หมุนเวียนไม่พอใช้หนี้ระยะสั้น' },
        { label: 'หนี้สินต่อส่วนของผู้ถือหุ้น',
          value: () => { const L = an().latest; return L ? ratio(L.debtToEquity) + ' เท่า' : '–'; },
          note: 'ยิ่งสูง เจ้าของยิ่งรับความเสี่ยงแทนเจ้าหนี้มาก' },
      ]),
      h('p.hint', { text: 'ทั้งสี่ตัวคำนวณจากช่องในตารางด้านล่าง ไม่ต้องกรอกเพิ่ม — ใช้ประกอบการคุยเรื่องทุนประกันที่ควรมี ไม่ใช่ตัวคิดเบี้ย' }),
    ]));

    // ── ตารางกรอก ────────────────────────────────────────────────────────
    const head = [
      h('tr.head-band', null, [h('th.label', { text: 'หน่วย : บาท' })].concat(IDX.map((i) =>
        h('th', { colspan: 2 }, [K.input('balance.years.' + i, { kind: 'text', placeholder: 'ปี พ.ศ.', width: '70px' }), h('span.ref', { text: ['C4', 'E4', 'G4'][i] })])))),
      h('tr', null, [h('th.label', { text: '' })].concat(IDX.reduce((acc) => acc.concat([
        h('th', { text: 'จำนวนเงิน' }), h('th', { text: '%เปลี่ยนแปลง' }),
      ]), []))),
    ];

    const body = [];
    K.BS_ROWS.forEach((r) => {
      if (SECTIONS[r.key]) {
        body.push(h('tr.section', null, [h('th.label', { text: SECTIONS[r.key] })]
          .concat(IDX.reduce((acc) => acc.concat([h('th', { text: '' }), h('th', { text: '' })]), []))));
      }
      const cells = [K.labelCell(r.label, 'B' + r.row)];
      IDX.forEach((i) => {
        cells.push(K.cellIn('balance.' + r.key + '.' + i, { ref: ['C', 'E', 'G'][i] + r.row, onchange: () => K.refreshOutputs() }));
        cells.push(K.cellIn('balance.pct.' + r.key + '.' + i, { kind: 'pct', ref: ['D', 'F', 'H'][i] + r.row }));
      });
      body.push(h('tr', { class: r.bold ? 'total' : '' }, cells));
    });

    main.appendChild(K.card('งบแสดงฐานะการเงิน', 'ชีต งบดุล แถว 4–16', [
      K.table(head, body),
      h('div.btnrow', null, [
        h('button.btn', { text: 'คำนวณ %เปลี่ยนแปลงให้เฉพาะช่องที่เว้นว่าง', onclick: fillPct }),
      ]),
      h('p.hint', { text: 'บริษัทที่ไม่มีลูกหนี้การค้าหรือสินค้าคงเหลือเลย ให้ปล่อยช่องว่างไว้ — ระบบจะแสดงเป็นขีด "–" ไม่ใช่ 0 และไม่นับรวมตอนหาค่าเฉลี่ย' }),
      K.legend(),
    ]));

    // ── กำไรสะสมรายปี ────────────────────────────────────────────────────
    main.appendChild(K.card('กำไรสะสมรายปี', 'ชีต งบดุล แถว 18–21', [
      K.table([h('tr', null, [h('th.label', { text: 'รายการ' })].concat(IDX.map((i) =>
        K.outCell((c, kk) => kk.balance.years[i] || '–', { th: true }))))], [
        h('tr', null, [K.labelCell('ส่วนของผู้ถือหุ้น', 'B19')].concat(IDX.map((i) => K.outCell(() => K.money(val('equity', i)), { ref: ['C', 'E', 'G'][i] + '19' })))),
        h('tr', null, [K.labelCell('ทุนจดทะเบียนที่ชำระแล้ว', 'B20')].concat(IDX.map((i) => K.outCell((c, kk) => K.money(kk.company.paidUpCapital), { ref: ['C', 'E', 'G'][i] + '20' })))),
        h('tr.total', null, [K.labelCell('กำไร(ขาดทุน)สะสม', 'B21')].concat(IDX.map((i) =>
          K.outCell(() => K.money(an().rows[i].retained), { ref: ['C', 'E', 'G'][i] + '21', class: 'sum' })))),
      ]),
      K.out(() => {
        const a = an();
        if (!a.checked) return h('p.hint', { text: 'ยังไม่มีตัวเลขสินทรัพย์รวมและหนี้สินรวมให้ตรวจว่างบลงตัวหรือไม่' });
        if (!a.offBalance.length) return h('div');
        return K.callout('block', 'งบไม่ลงตัว: ' + a.offBalance
          .map((r) => (r.year || 'ปีที่ ' + (r.index + 1)) + ' สินทรัพย์รวมต่างจากหนี้สินรวมและส่วนของผู้ถือหุ้น ' + K.money(r.diff) + ' บาท')
          .join(' · ') + ' — ตรวจตัวเลขที่กรอกก่อนใช้ต่อ');
      }),
      h('p.hint', { text: 'กำไรสะสมที่สูงขึ้นทุกปีคือประเด็นที่ลูกค้ามักถูกเรียกให้ปันผล — เป็นจุดตั้งต้นของบทสนทนาเรื่องคีย์แมน' }),
    ]));
  }

  // เติมเฉพาะช่องที่เว้นว่าง เหมือนแท็บ 2 — ไม่ทับค่าที่มาจาก DBD
  function fillPct() {
    const k = K.state.kase;
    let filled = 0;
    K.BS_ROWS.forEach((r) => {
      [1, 2].forEach((i) => {
        const cur = k.balance.pct[r.key][i];
        if (cur !== '' && cur !== null && cur !== undefined) return;
        const prev = E.num(k.balance[r.key][i - 1]);
        const now = E.num(k.balance[r.key][i]);
        if (prev === null || now === null || prev === 0) return;
        k.balance.pct[r.key][i] = ((now - prev) / Math.abs(prev)) * 100;
        filled++;
      });
    });
    K.touch(); K.render();
    K.alert('คำนวณให้แล้ว', filled ? `เติม %เปลี่ยนแปลงให้ ${filled} ช่อง (เฉพาะช่องที่เว้นว่างและมีปีก่อนหน้าให้เทียบ)` : 'ไม่มีช่องว่างที่คำนวณได้');
  }

  K.registerTab(3, 'bs', 'งบดุล', render, { num: 3 });
})(typeof self !== 'undefined' ? self : this);
