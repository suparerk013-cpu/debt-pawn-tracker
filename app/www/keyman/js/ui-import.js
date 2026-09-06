// การ์ดนำเข้าไฟล์ Excel จาก DBD — ใช้ร่วมกันทั้งแท็บงบกำไรขาดทุนและงบดุล
(function (root) {
  'use strict';
  const K = root.K, h = K.h, E = root.KeymanEngine, Imp = root.KeymanImport;

  K.dbdImportCard = function () {
    return K.card('นำเข้าไฟล์จาก DBD DataWarehouse+', 'export.xlsx / export1.xlsx', [
      h('p.note', {
        text: 'เลือกได้ทีละ 1 หรือ 2 ไฟล์ (งบกำไรขาดทุน และ/หรือ งบแสดงฐานะการเงิน) ระบบแยกชนิดไฟล์จากข้อความในช่อง A1 เอง ' +
          'ไฟล์มี 5 ปี ระบบจะหยิบ 3 ปีล่าสุดมาลงตาราง และมีหน้ายืนยันให้ดูก่อนเขียนทับเสมอ',
      }),
      K.dropzone({
        accept: '.xlsx,.xls', multiple: true, icon: '📊',
        title: 'ลากไฟล์ .xlsx จาก DBD มาวางตรงนี้',
        hint: 'หรือกดที่กรอบนี้เพื่อเลือกไฟล์ · เลือกพร้อมกันได้ 2 ไฟล์ (งบกำไรขาดทุน + งบแสดงฐานะการเงิน)',
        onFiles: readFiles,
      }),
      h('p.hint', { text: 'ถ้าชื่อบริษัทใน A1 ของสองไฟล์ไม่ตรงกัน ระบบจะปฏิเสธการนำเข้าทันที — กันงบของบริษัทหนึ่งไปโผล่ในเคสของอีกบริษัท' }),
    ]);
  };

  function readFiles(files) {
    if (!files.length) return;
    Promise.all(files.map((f) => f.arrayBuffer().then((buf) => Imp.readDbdWorkbook(new Uint8Array(buf), f.name))))
      .then(handleParsed)
      .catch((err) => K.alert('นำเข้าไม่สำเร็จ', err.message || String(err)));
  }

  function handleParsed(parsedList) {
    // กฎกันบั๊ก: ชื่อบริษัทของทุกไฟล์ต้องตรงกัน
    for (let i = 1; i < parsedList.length; i++) {
      if (!Imp.sameCompany(parsedList[0].companyName, parsedList[i].companyName)) {
        K.alert('ปฏิเสธการนำเข้า',
          `ชื่อบริษัทในสองไฟล์ไม่ตรงกัน:\n• ${parsedList[0].fileName} → ${parsedList[0].companyName}\n• ${parsedList[i].fileName} → ${parsedList[i].companyName}`);
        return;
      }
    }
    const k = K.state.kase;
    const warn = k.company.name && !Imp.sameCompany(k.company.name, parsedList[0].companyName)
      ? `ชื่อบริษัทในไฟล์ ("${parsedList[0].companyName}") ไม่ตรงกับชื่อในเคสนี้ ("${k.company.name}") — ตรวจให้แน่ใจว่าเปิดเคสถูกบริษัท`
      : null;

    const plans = parsedList.map((p) => ({
      parsed: p,
      plan: p.kind === 'pl' ? Imp.planPl(p, k) : Imp.planBs(p, k),
    }));

    const body = [];
    if (warn) body.push(h('p', { class: 'pill warn', text: warn, style: 'display:block;padding:6px 10px' }));
    plans.forEach((entry) => {
      body.push(h('p.note.strong', { text: (entry.parsed.kind === 'pl' ? 'งบกำไรขาดทุน' : 'งบแสดงฐานะการเงิน') + ' — ' + entry.parsed.fileName }));
      body.push(h('p.hint', { text: 'ปีในไฟล์: ' + entry.parsed.years.join(' · ') + ' → จะลง 3 ปีล่าสุด: ' + entry.plan.years.join(' · ') }));
      body.push(K.table(
        [h('tr', null, [h('th.label', { text: 'ช่อง' }), h('th', { text: 'ค่าเดิม' }), h('th', { text: 'ค่าใหม่' })])],
        entry.plan.changes.map((c) => h('tr', null, [
          h('td.label', { text: c.field }),
          h('td', { class: 'diff-old', text: c.old || '(ว่าง)' }),
          h('td', { class: 'diff-new', text: c.display }),
        ]))
      ));
      if (entry.parsed.unknownLabels.length) {
        body.push(h('p.hint', { text: 'แถวที่ระบบไม่รู้จักและข้ามไป: ' + entry.parsed.unknownLabels.slice(0, 8).join(' · ') }));
      }
    });

    K.dialog('ยืนยันก่อนเขียนทับงบการเงิน', body, [
      { label: 'ยกเลิก', onclick: (d) => d.close() },
      {
        label: 'เขียนทับ', primary: true, onclick: (d) => {
          d.close();
          plans.forEach((entry) => Imp.applyPlan(entry.plan, k));
          if (!k.company.name) k.company.name = parsedList[0].companyName;
          K.touch(); K.render();
        },
      },
    ]);
  }
})(typeof self !== 'undefined' ? self : this);
