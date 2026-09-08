// แท็บ 9 — เอกสารสำหรับพิมพ์ (ใบเสนอ · แผ่นงาน ภ.ง.ด.1 · ร่างระเบียบสวัสดิการ · ร่างมติที่ประชุม)
// ห้ามพิมพ์ใบเสนอเมื่อมีข้อตรวจสอบระดับ "บล็อก" ค้างอยู่
(function (root) {
  'use strict';
  const K = root.K, h = K.h, E = root.KeymanEngine;

  const DOCS = [
    { id: 'quote', label: 'ใบเสนอลูกค้า', needsQuote: true },
    { id: 'pnd1', label: 'แผ่นงานรายกรรมการสำหรับ ภ.ง.ด.1' },
    { id: 'welfare', label: 'ร่างระเบียบสวัสดิการ' },
    { id: 'resolution', label: 'ร่างมติที่ประชุม' },
    { id: 'sheets', label: 'ชุดงบการเงิน 4 หน้า · A4 แนวนอน', landscape: true },
  ];

  // ขนาดกระดาษต้องประกาศใน @page เท่านั้น ใส่ในคลาสไม่ได้ จึงสลับ <style> เอา
  // (ทำแบบนี้ได้ผลทุกเบราว์เซอร์ ไม่ต้องพึ่ง named page ที่บางตัวยังไม่รองรับ)
  const setPref = (k, v) => { localStorage.setItem(k, v); K.render(); };

  function setPageOrientation(landscape) {
    let el = document.getElementById('print-page-size');
    if (!el) {
      el = document.createElement('style');
      el.id = 'print-page-size';
      document.head.appendChild(el);
    }
    el.textContent = landscape
      ? '@page { size: A4 landscape; margin: 10mm; }'
      : '@page { size: A4 portrait; margin: 14mm; }';
  }

  function render(main) {
    const c = K.state.computed;
    const k = K.state.kase;
    const cur = K.state.printDoc || 'quote';
    const curDoc = DOCS.filter(function (d) { return d.id === cur; })[0] || DOCS[0];
    setPageOrientation(!!curDoc.landscape);

    const controls = K.card('เอกสารสำหรับพิมพ์', 'เฟส 5', [
      h('div.btnrow', null, DOCS.map((d) => h('button', {
        class: 'btn ' + (d.id === cur ? 'primary' : ''),
        text: d.label,
        onclick: () => { K.state.printDoc = d.id; K.render(); },
      })).concat([
        h('button.btn', { text: '🖨 พิมพ์หน้านี้', onclick: () => window.print() }),
      ])),
      !c.checks.canQuote ? h('p', { class: 'pill block', style: 'display:block;padding:6px 10px',
        text: 'มีข้อตรวจสอบระดับบล็อก ' + c.checks.blocking.length + ' ข้อ — ใบเสนอลูกค้าถูกล็อกไว้จนกว่าจะแก้ครบ' }) : null,
      h('p.hint', { text: curDoc.landscape
        ? 'เอกสารชุดนี้ตั้งเป็น A4 แนวนอน 4 หน้าให้แล้ว — ในหน้าต่างพิมพ์ให้เปิด "กราฟิกพื้นหลัง" ด้วย ตารางจะได้มีแถบสีหัวตาราง'
        : 'เอกสารนี้ตั้งเป็น A4 แนวตั้ง' }),
      curDoc.landscape ? h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px' },
        [h('span.hint', { text: 'เลือกชีตที่จะพิมพ์:', style: 'margin:0' })].concat(K.SHEETS.map(function (sh) {
          const on = K.sheetPick().some(function (x) { return x.id === sh.id; });
          return h('button', { class: 'btn ' + (on ? 'primary' : ''), text: (on ? '☑ ' : '☐ ') + sh.label,
            onclick: function () { K.toggleSheet(sh.id); } });
        }))) : null,
      curDoc.landscape ? h('p.hint', { text: 'เลือกได้ทีละชีตหรือหลายชีต เลขหน้าปรับตามที่เลือก · ต้องเหลืออย่างน้อยหนึ่งชีต' }) : null,
      cur === 'quote' ? h('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:10px' }, [
        h('span.hint', { text: 'ความยาว:', style: 'margin:0' }),
        K.switch2([{ value: 'full', label: 'เต็ม 2 หน้า' }, { value: 'short', label: 'สั้น 1 หน้า' }],
          K.quoteLength(), (v) => setPref('keyman.quoteLength', v)),
        h('span.hint', { text: 'ที่มาของเบี้ย:', style: 'margin:0 0 0 8px' }),
        K.switch2([{ value: '0', label: 'ไม่พิมพ์' }, { value: '1', label: 'พิมพ์ด้วย' }],
          K.quoteShowBasis() ? '1' : '0', (v) => setPref('keyman.quoteBasis', v)),
      ]) : null,
      cur === 'quote' ? h('p.hint', { text: 'แนะนำให้ปิด "ที่มาของเบี้ย" ไว้ — ใบที่ระบุว่าเบี้ยคิดเป็นกี่ % ของบรรทัดไหนในงบ ตอบคำถามแทนคุณไปแล้วว่าเบี้ยมาจากสูตร ไม่ใช่มาจากเหตุผลทางธุรกิจ' }) : null,
    ]);
    // แถบเลือกเอกสารกับปุ่มพิมพ์ต้องไม่ติดไปบนกระดาษ ไม่งั้นได้หน้าเปล่าเพิ่มมาหนึ่งหน้า
    controls.classList.add('noprint');
    main.appendChild(controls);
    if (cur === 'quote') {
      const settings = K.quoteSettingsCard();
      settings.classList.add('noprint');
      main.appendChild(settings);
    }

    if (cur === 'sheets') {
      // พรีวิวบนจอ: กระดาษแนวนอนกว้างกว่าจอมือถือ ให้เลื่อนในกรอบของตัวเอง ไม่ใช่ทั้งหน้า
      const paper = h('div.paper.landscape');
      K.renderSheets(paper);
      main.appendChild(h('section.card', null, [h('div.paperwrap', null, [paper])]));
      return;
    }
    const paper = h('div.paper');
    if (cur === 'quote') K.renderQuote(paper, k, c);
    else if (cur === 'pnd1') renderPnd1(paper, k, c);
    else if (cur === 'welfare') renderWelfare(paper, k, c);
    else renderResolution(paper, k, c);
    main.appendChild(h('section.card', null, [paper]));
  }

  const money = (v) => K.money(v);
  const nameOf = (k) => k.company.name || '(ยังไม่ระบุชื่อบริษัท)';
  const today = () => new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });

  function tbl(rows) {
    return h('table', null, [h('tbody', null, rows.map((r) => h('tr', null, [
      h('td', { style: 'text-align:left', text: r[0] }), h('td', { text: r[1] }),
    ])))]);
  }

  function renderPnd1(paper, k, c) {
    paper.appendChild(h('h3', { text: 'แผ่นงานรายกรรมการสำหรับยื่น ภ.ง.ด.1' }));
    paper.appendChild(h('p', { text: nameOf(k) + '  ·  ปีภาษี ' + k.taxYear + '  ·  พิมพ์วันที่ ' + today() }));
    paper.appendChild(h('table', null, [
      h('thead', null, [h('tr', null, ['กรรมการ', 'เงินเดือน+โบนัสทั้งปี', 'เบี้ยคีย์แมน (ม.40(1))', 'ภาษีที่บริษัทออกให้', 'เงินได้รวมที่ต้องแจ้ง', 'หัก ณ ที่จ่าย/เดือน'].map((t, i) =>
        h('th', { style: i === 0 ? 'text-align:left' : '', text: t })))]),
      h('tbody', null, k.directors.map((d, i) => {
        const g = c.perDirector[i].gross;
        return h('tr', null, [
          h('td', { style: 'text-align:left', text: d.name || 'ท่านที่ ' + (i + 1) }),
          h('td', { text: money(E.n0(d.salary) + E.n0(d.bonus)) }),
          h('td', { text: money(d.premiumAllocated) }),
          h('td', { text: money(g.tax) }),
          h('td', { text: money(E.n0(d.salary) + E.n0(d.bonus) + E.n0(d.premiumAllocated) + g.tax) }),
          h('td', { text: money(g.monthlyWithholding) }),
        ]);
      }).concat([h('tr', null, [
        h('th', { style: 'text-align:left', text: 'รวม' }),
        h('th', { text: money(c.salaryTotal) }),
        h('th', { text: money(c.premiumTotal) }),
        h('th', { text: money(c.allTierTaxTotal) }),
        h('th', { text: money(c.salaryTotal + c.premiumTotal + c.allTierTaxTotal) }),
        h('th', { text: money(c.monthlyWithholdingTotal) }),
      ])])),
    ]));
    paper.appendChild(h('p', { style: 'font-size:12px', text:
      'เบี้ยประกันและภาษีที่บริษัทออกให้ถือเป็นประโยชน์เพิ่มจากการจ้างแรงงานตาม ม.40(1) ต้องรวมเป็นเงินได้ของกรรมการและนำส่ง ภ.ง.ด.1 ทุกเดือน ' +
      'ตลอดอายุการชำระเบี้ย ไม่ใช่เฉพาะปีแรก' }));
  }

  function renderWelfare(paper, k, c) {
    const wording = k.policy.taxMethod === 'once'
      ? 'บริษัทฯ จะออกเงินค่าภาษีเงินได้บุคคลธรรมดาให้แก่กรรมการเป็นจำนวนที่แน่นอนเพียงครั้งเดียว ตามคำสั่งกรมสรรพากรที่ ป.96/2543 ข้อ 1(8)'
      : 'บริษัทฯ จะออกเงินค่าภาษีเงินได้บุคคลธรรมดาให้แก่กรรมการตลอดไป ตามคำสั่งกรมสรรพากรที่ ป.96/2543 ข้อ 1(7)';
    paper.appendChild(h('h3', { text: 'ร่างระเบียบสวัสดิการว่าด้วยการประกันชีวิตกรรมการ' }));
    paper.appendChild(h('p', { text: 'ของ ' + nameOf(k) + ' (เลขทะเบียน ' + (k.company.regNo || '–') + ')' }));
    paper.appendChild(h('p', { text: 'ข้อ 1  บริษัทฯ จัดให้มีสวัสดิการประกันชีวิตแก่กรรมการทุกคนเป็นการทั่วไป โดยไม่เลือกปฏิบัติเฉพาะบุคคลใดบุคคลหนึ่ง' }));
    paper.appendChild(h('p', { text: 'ข้อ 2  วงเงินเบี้ยประกันจัดสรรตามระดับตำแหน่ง ดังนี้' }));
    paper.appendChild(h('ul', null, k.directors.map((d, i) =>
      h('li', { text: (d.name || 'กรรมการท่านที่ ' + (i + 1)) + (d.position ? ' (' + d.position + ')' : '') + ' — เกณฑ์: ' + (d.positionCriteria || '(ยังไม่ระบุเกณฑ์)') + ' — เบี้ยปีละ ' + money(d.premiumAllocated) + ' บาท' }))));
    paper.appendChild(h('p', { text: 'ข้อ 3  ' + wording }));
    paper.appendChild(h('p', { text: 'ข้อ 4  บริษัทฯ จะบันทึกเบี้ยประกันและภาษีที่ออกให้เป็นเงินได้ของกรรมการตามมาตรา 40(1) และนำส่ง ภ.ง.ด.1 ทุกเดือน' }));
    paper.appendChild(h('p', { text: 'ข้อ 5  ผู้รับผลประโยชน์ตามกรมธรรม์คือ ' + (k.policy.beneficiary === 'company' ? 'บริษัทฯ' : 'ทายาทของกรรมการ') +
      (k.policy.beneficiary === 'company' ? ' ทั้งนี้บริษัทฯ รับทราบว่าค่าสินไหมที่ได้รับต้องนำมาเสียภาษีเงินได้นิติบุคคล' : '') }));
    paper.appendChild(h('p', { text: 'ระเบียบนี้ให้ใช้บังคับตั้งแต่วันที่ ................................ เป็นต้นไป' }));
    paper.appendChild(h('p', { style: 'margin-top:26px', text: 'ลงชื่อ ......................................... กรรมการผู้มีอำนาจ' }));
    paper.appendChild(h('p', { style: 'font-size:12px', text: 'ร่างนี้เป็นแบบตั้งต้นสำหรับให้ที่ปรึกษากฎหมาย/ผู้สอบบัญชีของบริษัทตรวจแก้ก่อนใช้จริง ถ้อยคำในข้อ 3 ต้องตรงกับวิธีคำนวณภาษีที่ใช้จริง (CHK-11)' }));
  }

  function renderResolution(paper, k, c) {
    paper.appendChild(h('h3', { text: 'ร่างรายงานการประชุมคณะกรรมการ' }));
    paper.appendChild(h('p', { text: 'ของ ' + nameOf(k) + '  ·  ประชุมเมื่อวันที่ ................................' }));
    paper.appendChild(h('p', { text: 'กรรมการผู้เข้าประชุม: ' + (k.directors.map((d) => d.name).filter(Boolean).join(', ') || '..............................') }));
    paper.appendChild(h('p', { text: 'วาระที่ 1  พิจารณาอนุมัติการจัดสวัสดิการประกันชีวิตให้แก่กรรมการทุกคนเป็นการทั่วไป' }));
    paper.appendChild(h('p', { text: 'มติ  ที่ประชุมมีมติอนุมัติให้บริษัทฯ ทำประกันชีวิตให้กรรมการทุกคน เบี้ยประกันรวมปีละ ' + money(k.policy.premiumTotal) + ' บาท ' +
      (k.policy.insurer ? 'กับ ' + k.policy.insurer + ' ' : '') + (k.policy.productName ? 'แบบ ' + k.policy.productName + ' ' : '') +
      'ระยะเวลาชำระเบี้ย ' + (k.policy.premiumYears || '....') + ' ปี โดยจัดสรรตามระเบียบสวัสดิการที่บริษัทฯ กำหนด' }));
    paper.appendChild(h('p', { text: 'วาระที่ 2  พิจารณาอนุมัติให้บริษัทฯ ออกเงินค่าภาษีเงินได้บุคคลธรรมดาแทนกรรมการ' }));
    paper.appendChild(h('p', { text: 'มติ  ที่ประชุมมีมติอนุมัติให้บริษัทฯ ออกภาษีแทนกรรมการแบบ "' + (k.policy.taxMethod === 'once' ? 'ออกให้ครั้งเดียว (ป.96/2543 ข้อ 1(8))' : 'ออกให้ตลอดไป (ป.96/2543 ข้อ 1(7))') +
      '" รวมเป็นเงินภาษีที่บริษัทฯ ออกให้ปีละ ' + money(c.allTierTaxTotal) + ' บาท และให้บันทึกเบี้ยประกันกับภาษีดังกล่าวเป็นรายจ่ายของบริษัทฯ รวม ' + money(c.recordedExpenseTotal) + ' บาท' }));
    if (k.company.signingAuthority) {
      paper.appendChild(h('p', { text: 'กรรมการผู้มีอำนาจลงนามผูกพันบริษัท: ' + k.company.signingAuthority }));
    }
    paper.appendChild(h('p', { style: 'margin-top:26px', text: 'ลงชื่อ ......................................... ประธานที่ประชุม' }));
    paper.appendChild(h('p', { style: 'font-size:12px', text: 'ร่างนี้เป็นแบบตั้งต้น ควรให้ที่ปรึกษากฎหมายของบริษัทตรวจแก้ก่อนใช้จริง' }));
  }

  K.registerTab(9, 'print', 'พิมพ์เอกสาร', render, { num: 9 });
})(typeof self !== 'undefined' ? self : this);
