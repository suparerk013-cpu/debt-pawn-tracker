// แท็บ 3 — งบแสดงฐานะการเงิน (ชีต "งบดุล" แถว 4–21)
(function (root) {
  'use strict';
  const K = root.K, h = K.h, E = root.KeymanEngine;
  const IDX = [0, 1, 2];
  const val = (key, i) => E.num(K.state.kase.balance[key][i]);

  function render(main) {
    const k = K.state.kase;
    main.appendChild(K.dbdImportCard());

    const head = [
      h('tr.head-band', null, [h('th.label', { text: 'หน่วย : บาท' })].concat(IDX.map((i) =>
        h('th', { colspan: 2 }, [K.input('balance.years.' + i, { kind: 'text', placeholder: 'ปี พ.ศ.', width: '70px' }), h('span.ref', { text: ['C4', 'E4', 'G4'][i] })])))),
      h('tr', null, [h('th.label', { text: '' })].concat(IDX.reduce((acc) => acc.concat([
        h('th', { text: 'จำนวนเงิน' }), h('th', { text: '%เปลี่ยนแปลง' }),
      ]), []))),
    ];

    const body = K.BS_ROWS.map((r) => {
      const cells = [K.labelCell(r.label, 'B' + r.row)];
      IDX.forEach((i) => {
        cells.push(K.cellIn('balance.' + r.key + '.' + i, { ref: ['C', 'E', 'G'][i] + r.row, onchange: () => K.refreshOutputs() }));
        cells.push(K.cellIn('balance.pct.' + r.key + '.' + i, { kind: 'pct', ref: ['D', 'F', 'H'][i] + r.row }));
      });
      return h('tr', { class: r.bold ? 'total' : '' }, cells);
    });

    main.appendChild(K.card('งบแสดงฐานะการเงิน', 'ชีต งบดุล แถว 4–16', [
      K.table(head, body),
      h('p.hint', { text: 'บริษัทที่ไม่มีลูกหนี้การค้าหรือสินค้าคงเหลือเลย ให้ปล่อยช่องว่างไว้ — ระบบจะแสดงเป็นขีด "–" ไม่ใช่ 0 และไม่นับรวมตอนหาค่าเฉลี่ย' }),
      K.legend(),
    ]));

    // ── กำไรสะสม = ส่วนของผู้ถือหุ้น − ทุนจดทะเบียน ─────────────────────
    main.appendChild(K.card('วิเคราะห์งบดุล เพื่อหากำไรสะสม', 'ชีต งบดุล แถว 18–21', [
      K.table([h('tr', null, [h('th.label', { text: 'รายการ' })].concat(IDX.map((i) =>
        K.outCell((c, kk) => kk.balance.years[i] || '–', { th: true }))))], [
        h('tr', null, [K.labelCell('ส่วนของผู้ถือหุ้น', 'B19')].concat(IDX.map((i) => K.outCell(() => K.money(val('equity', i)), { ref: ['C', 'E', 'G'][i] + '19' })))),
        h('tr', null, [K.labelCell('ทุนจดทะเบียนที่ชำระแล้ว', 'B20')].concat(IDX.map((i) => K.outCell((c, kk) => K.money(kk.company.paidUpCapital), { ref: ['C', 'E', 'G'][i] + '20' })))),
        h('tr.total', null, [K.labelCell('กำไร(ขาดทุน)สะสม', 'B21')].concat(IDX.map((i) => K.outCell((c, kk) => {
          const eq = val('equity', i);
          const cap = E.num(kk.company.paidUpCapital);
          return eq === null || cap === null ? '–' : K.money(eq - cap);
        }, { ref: ['C', 'E', 'G'][i] + '21' })))),
      ]),
      h('p.note', null, [
        'ตรวจว่างบดุลลงตัว: ',
        K.out(() => {
          const msgs = IDX.map((i) => {
            const a = val('totalAssets', i), le = val('totalLiabEquity', i), y = K.state.kase.balance.years[i] || ('ปีที่ ' + (i + 1));
            if (a === null || le === null) return null;
            return Math.abs(a - le) < 1 ? `${y} ลงตัว` : `${y} ต่างกัน ${K.money(a - le)} บาท`;
          }).filter(Boolean);
          return msgs.length ? msgs.join(' · ') : 'ยังไม่มีตัวเลขให้ตรวจ';
        }),
      ]),
      h('p.hint', { text: 'กำไรสะสมที่สูงขึ้นทุกปีคือประเด็นที่ลูกค้ามักถูกเรียกให้ปันผล — เป็นจุดตั้งต้นของบทสนทนาเรื่องคีย์แมน' }),
    ]));
  }

  K.registerTab(3, 'bs', 'งบดุล', render, { num: 3 });
})(typeof self !== 'undefined' ? self : this);
