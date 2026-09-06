// หน้าแรก: รายชื่อเคส + สำรอง/นำกลับข้อมูล
(function (root) {
  'use strict';
  const K = root.K, h = K.h, E = root.KeymanEngine, Store = root.KeymanStore;

  function statusDot(s) {
    const cls = s === 'block' ? 'block' : s === 'ok' ? 'ok' : 'warn';
    const label = s === 'block' ? 'มีข้อบล็อก ออกใบเสนอไม่ได้' : s === 'ok' ? 'ผ่านทุกข้อ' : 'มีข้อเตือน';
    return h('span', null, [h('span', { class: 'dot ' + cls }), ' ' + label]);
  }

  function render(main) {
    main.appendChild(K.card('สมุดงานประกันคีย์แมน', null, [
      h('p.note', {
        text: 'เครื่องมือคำนวณเบี้ยประกันคีย์แมนและตรวจความสอดคล้องกับหลักเกณฑ์ของกรมสรรพากร ' +
          'ข้อมูลทุกเคสเก็บอยู่ในเบราว์เซอร์เครื่องนี้เท่านั้น ไม่ได้ส่งขึ้นเซิร์ฟเวอร์',
      }),
      h('div.btnrow', null, [
        h('button.btn.primary', { onclick: createCase, text: '+ เคสใหม่' }),
        h('button.btn', { onclick: backup, text: '⭳ สำรองข้อมูลเป็นไฟล์ JSON' }),
        h('button.btn', { onclick: restore, text: '⭱ นำข้อมูลกลับเข้า' }),
      ]),
      h('p.hint', { text: 'IndexedDB อยู่แค่ในเบราว์เซอร์นี้ เครื่องนี้ — ถ้าล้างข้อมูลเว็บคือหายหมด สำรองไฟล์ไว้เป็นระยะ' }),
    ]));

    const listCard = K.card('เคสทั้งหมด', null, [h('p.hint', { text: 'กำลังโหลด…' })]);
    main.appendChild(listCard);

    Store.all().then((rows) => {
      K.clear(listCard);
      listCard.appendChild(h('h2', null, [h('span', { text: 'เคสทั้งหมด' }), h('span.sheet', { text: rows.length + ' เคส' })]));
      if (!rows.length) {
        listCard.appendChild(h('p.note', { text: 'ยังไม่มีเคส — กด "+ เคสใหม่" เพื่อเริ่ม' }));
        return;
      }
      rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      const ul = h('ul.cases', null, rows.map((r) => {
        const s = r.summary || {};
        return h('li', null, [
          h('div.name', { text: s.name || r.company && r.company.name || '(ไม่มีชื่อบริษัท)' }),
          h('div.meta', null, [
            h('span', { text: 'ทุนจดทะเบียน ' + K.money(s.paidUpCapital !== undefined ? s.paidUpCapital : (r.company || {}).paidUpCapital) }),
            h('span', { text: s.isSme === null || s.isSme === undefined ? 'สถานะ SME: –' : (s.isSme ? 'เข้าเกณฑ์ SME' : 'ไม่เข้าเกณฑ์ SME') }),
            h('span', { text: 'เบี้ยที่เสนอ ' + K.money(s.premiumTotal) }),
            statusDot(s.status),
            h('span', { text: 'แก้ไขล่าสุด ' + fmtDate(r.updatedAt) }),
          ]),
          h('div.btnrow', null, [
            h('button.btn.primary', { onclick: () => K.openCase(r.id), text: 'เปิด' }),
            h('button.btn.danger', {
              onclick: () => K.confirm('ลบเคส', 'ลบ "' + (s.name || r.id) + '" ถาวร กู้คืนไม่ได้ (สำรองไฟล์ไว้ก่อนหรือยัง)',
                () => Store.remove(r.id).then(() => K.render()), 'ลบถาวร'),
              text: 'ลบ',
            }),
          ]),
        ]);
      }));
      listCard.appendChild(ul);
    });
  }

  function fmtDate(iso) {
    if (!iso) return '–';
    const d = new Date(iso);
    if (isNaN(d)) return '–';
    return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
      d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  }

  function createCase() {
    const kase = K.newCase('');
    Store.put(kase).then(() => K.openCase(kase.id));
  }

  function backup() {
    Store.exportJson().then((json) => {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: 'keyman-backup-' + new Date().toISOString().slice(0, 10) + '.json' });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    });
  }

  function restore() {
    const input = h('input', { type: 'file', accept: 'application/json,.json' });
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      file.text().then((text) => {
        K.dialog('นำข้อมูลกลับเข้า', [
          h('p', { text: 'ไฟล์: ' + file.name }),
          h('p.note', { text: 'เลือก "รวมกับของเดิม" ถ้าต้องการเก็บเคสที่มีอยู่ไว้ (เคสที่ id ตรงกันจะถูกทับ) หรือ "แทนที่ทั้งหมด" เพื่อล้างของเดิมทิ้งก่อน' }),
        ], [
          { label: 'ยกเลิก', onclick: (d) => d.close() },
          { label: 'รวมกับของเดิม', primary: true, onclick: (d) => { d.close(); doImport(text, 'merge'); } },
          { label: 'แทนที่ทั้งหมด', danger: true, onclick: (d) => { d.close(); doImport(text, 'replace'); } },
        ]);
      });
    });
    input.click();
  }

  function doImport(text, mode) {
    Store.importJson(text, mode)
      .then((n) => { K.alert('นำเข้าสำเร็จ', 'นำเข้า ' + n + ' เคสแล้ว'); K.render(); })
      .catch((e) => K.alert('นำเข้าไม่สำเร็จ', e.message));
  }

  K.registerTab(0, 'cases', 'รายชื่อเคส', render);
})(typeof self !== 'undefined' ? self : this);
