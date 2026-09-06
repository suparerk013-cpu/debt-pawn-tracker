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
  ];

  function render(main) {
    const c = K.state.computed;
    const k = K.state.kase;
    const cur = K.state.printDoc || 'quote';

    main.appendChild(K.card('เอกสารสำหรับพิมพ์', 'เฟส 5', [
      h('div.btnrow', null, DOCS.map((d) => h('button', {
        class: 'btn ' + (d.id === cur ? 'primary' : ''),
        text: d.label,
        onclick: () => { K.state.printDoc = d.id; K.render(); },
      })).concat([
        h('button.btn', { text: '🖨 พิมพ์หน้านี้', onclick: () => window.print() }),
      ])),
      !c.checks.canQuote ? h('p', { class: 'pill block', style: 'display:block;padding:6px 10px',
        text: 'มีข้อตรวจสอบระดับบล็อก ' + c.checks.blocking.length + ' ข้อ — ใบเสนอลูกค้าถูกล็อกไว้จนกว่าจะแก้ครบ' }) : null,
    ]));

    const paper = h('div.paper');
    if (cur === 'quote') renderQuote(paper, k, c);
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

  function renderQuote(paper, k, c) {
    if (!c.checks.canQuote) {
      paper.appendChild(h('p', { text: 'ยังพิมพ์ใบเสนอไม่ได้ — แก้ข้อตรวจสอบระดับบล็อกให้ครบก่อน:' }));
      paper.appendChild(h('ul', null, c.checks.blocking.map((b) => h('li', { text: b.code + ' — ' + b.title }))));
      return;
    }
    paper.appendChild(h('h3', { text: 'ข้อเสนอโครงสร้างประกันคีย์แมน' }));
    paper.appendChild(h('p', { text: 'บริษัท: ' + nameOf(k) + '  ·  เลขทะเบียน: ' + (k.company.regNo || '–') + '  ·  วันที่ ' + today() }));
    paper.appendChild(tbl([
      ['สถานะทางภาษี', c.sme.isSme ? 'เข้าเกณฑ์ SME (ยกเว้น 300,000 · 15% · 20%)' : 'ไม่เข้าเกณฑ์ SME (อัตรา 20%)'],
      ['รายได้รวมปีล่าสุด', money(E.lastValue(k.financials.revenues))],
      ['กำไรก่อนภาษีปีล่าสุด', money(E.lastValue(k.financials.profitsBeforeTax))],
      ['เบี้ยประกันคีย์แมนที่เสนอ', money(c.premiumTotal) + ' บาท/ปี'],
      ['เพดาน 5% ของรายได้เฉลี่ย 3 ปี (แนวปฏิบัติ ไม่ใช่กฎหมาย)', money(c.ceiling.ceiling5pctAvgRevenue)],
      ['ภาษีทุกทอดที่บริษัทออกให้', money(c.allTierTaxTotal)],
      ['รวมบันทึกเป็นรายจ่ายของบริษัท', money(c.recordedExpenseTotal)],
      ['ประหยัดภาษีนิติบุคคล', money(c.comparison.after.citSaving)],
      ['ภาษีที่เสียสุทธิฝั่ง After', money(c.comparison.after.netTax)],
      ['ภาษีที่เสียรวมฝั่ง Before (ปันผล)', money(c.comparison.before.totalTax)],
      ['ผลต่างภาษี', money(c.comparison.taxDiff)],
      ['เงินถึงมือเจ้าของ (After)', money(c.comparison.after.ownerCash)],
      ['เงินถึงมือเจ้าของ (Before)', money(c.comparison.before.ownerCash)],
      ['วิธีออกภาษีตาม ป.96/2543', E.wordingLabel(k.policy.taxMethod)],
      ['ผู้รับผลประโยชน์', k.policy.beneficiary === 'company' ? 'บริษัท' : k.policy.beneficiary === 'heir' ? 'ทายาทของกรรมการ' : '–'],
    ]));
    paper.appendChild(h('h4', { text: 'การจัดสรรเบี้ยรายกรรมการ' }));
    paper.appendChild(h('table', null, [
      h('thead', null, [h('tr', null, ['กรรมการ', 'เกณฑ์ตามระดับตำแหน่ง', 'เบี้ยที่จัดสรร', 'ภาษีทุกทอด'].map((t, i) =>
        h('th', { style: i < 2 ? 'text-align:left' : '', text: t })))]),
      h('tbody', null, k.directors.map((d, i) => h('tr', null, [
        h('td', { style: 'text-align:left', text: d.name || 'ท่านที่ ' + (i + 1) }),
        h('td', { style: 'text-align:left', text: d.positionCriteria || '–' }),
        h('td', { text: money(d.premiumAllocated) }),
        h('td', { text: money(c.perDirector[i].gross.tax) }),
      ]))),
    ]));
    paper.appendChild(h('h4', { text: 'ข้อควรระวัง' }));
    paper.appendChild(h('ul', null, c.comparison.caveats.map((t) => h('li', { text: t }))));
    paper.appendChild(h('p', { style: 'margin-top:14px;font-size:12px',
      text: 'ตัวเลขทั้งหมดเป็นการประมาณเพื่อการนำเสนอ ไม่ใช่คำวินิจฉัยทางภาษี ควรให้ผู้สอบบัญชีหรือที่ปรึกษาภาษีของบริษัทตรวจสอบก่อนใช้จริง ' +
        'ฐานอ้างอิง: หนังสือตอบข้อหารือ กค 0811/408 (2543), กค 0706/4227 (2547), กค 0706/7251 (2549), กค 0702/9358 (2552) และคำสั่งกรมสรรพากร ป.96/2543' }));
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
