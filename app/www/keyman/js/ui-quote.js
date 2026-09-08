// ใบเสนอลูกค้า — A4 แนวตั้ง เลือกได้ 2 หน้า (เต็ม) หรือ 1 หน้า (สั้น)
// หลักคิด: กระดาษใบนี้ลูกค้าถือกลับบ้าน และอาจไปอยู่ในแฟ้มที่สรรพากรขอดู
// จึงบอก "เสนออะไร ได้อะไร และทำไมถึงสมเหตุสมผล" แต่ไม่พิมพ์สูตรคิดเบี้ยลงไป
// (เปิดได้ด้วยสวิตช์ ถ้าต้องใช้คุยกับลูกค้าบางราย)
(function (root) {
  'use strict';
  const K = root.K, h = K.h, E = root.KeymanEngine;

  const AGENT_KEY = 'keyman.agent';
  K.agent = function () {
    try { return JSON.parse(localStorage.getItem(AGENT_KEY) || '{}') || {}; } catch (e) { return {}; }
  };
  K.setAgent = function (patch) {
    const next = Object.assign(K.agent(), patch);
    try { localStorage.setItem(AGENT_KEY, JSON.stringify(next)); } catch (e) { /* โหมดส่วนตัวเขียนไม่ได้ */ }
    return next;
  };

  const pref = (k, dflt) => localStorage.getItem(k) || dflt;
  const setPref = (k, v) => { localStorage.setItem(k, v); K.render(); };
  K.quoteLength = () => pref('keyman.quoteLength', 'full');
  K.quoteShowBasis = () => pref('keyman.quoteBasis', '0') === '1';

  // ปัดเป็นบาทเต็มบนใบเสนอ — สตางค์ไม่ได้ช่วยลูกค้าตัดสินใจ
  const B = (v) => {
    const n = E.num(v);
    return n === null ? '–' : Math.round(n).toLocaleString('en-US');
  };
  const today = () => new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
  const quoteNo = (k) => 'KM-' + k.taxYear + '-' + String(k.id || '').slice(-4).toUpperCase();

  // ── หัวกระดาษ ────────────────────────────────────────────────────────
  function letterhead(k, page, total) {
    const a = K.agent();
    return h('div.q-head', null, [
      h('div.q-brand', null, [
        a.logo ? h('img.q-logo', { src: a.logo, alt: '' }) : null,
        h('div', null, [
          h('div.q-title', { text: 'ข้อเสนอโครงสร้างประกันคีย์แมน' }),
          h('div.q-sub', { text: 'สำหรับ ' + (k.company.name || '(ยังไม่ระบุชื่อบริษัท)') +
            (k.company.regNo ? ' · ทะเบียน ' + k.company.regNo : '') }),
        ]),
      ]),
      h('div.q-meta', null, [
        h('div', { text: 'เลขที่ ' + quoteNo(k) }),
        h('div', { text: 'วันที่ ' + today() }),
        total > 1 ? h('div', { text: 'หน้า ' + page + '/' + total }) : null,
      ]),
    ]);
  }

  function agentLine() {
    const a = K.agent();
    const bits = [a.name, a.phone, a.email, a.license ? 'ใบอนุญาตเลขที่ ' + a.license : null,
      a.agency].filter(Boolean);
    if (!bits.length) return h('p.q-agent', { text: 'ผู้เสนอ: (ยังไม่ได้กรอกข้อมูลผู้เสนอ)' });
    return h('p.q-agent', { text: 'ผู้เสนอ: ' + bits.join(' · ') });
  }

  // ── แท่งเทียบสองฝั่ง — ใช้เส้นขอบด้วย จะได้ไม่หายตอนพิมพ์ขาวดำ ─────────
  function compareRow(title, hint, aVal, bVal, diff, base, say, betterLow) {
    const max = Math.max(Math.max(0, aVal), Math.max(0, bVal), 1);
    const bar = (v, cls) => h('div.q-track', null, [
      h('div', { class: 'q-fill ' + cls, style: 'width:' + (Math.max(0, v) / max * 100).toFixed(1) + '%' }),
    ]);
    const pct = base ? Math.abs(diff / base * 100).toFixed(1) + '%' : null;
    return h('div.q-cmp', null, [
      h('div.q-cmp-t', null, [h('b', { text: title }), h('span', { text: hint })]),
      h('div.q-cmp-row', null, [h('span.n', { text: 'ทำคีย์แมน' }), bar(aVal, 'a'), h('span.v', { text: B(aVal) })]),
      h('div.q-cmp-row', null, [h('span.n', { text: 'จ่ายเป็นเงินปันผล' }), bar(bVal, 'b'), h('span.v', { text: B(bVal) })]),
      h('div.q-cmp-d', null, [
        h('span', { text: 'ต่างกัน' }),
        h('b', { text: B(Math.abs(diff)) + ' บาท' }),
        pct ? h('span.q-pct', { text: pct }) : null,
        h('span.q-say', { text: say }),
      ]),
    ]);
  }

  // ── หน้า 1 — ข้อเสนอ ──────────────────────────────────────────────────
  function pageOne(k, c, total) {
    const cmp = c.comparison, A = cmp.after, Bf = cmp.before;
    const saves = !cmp.noTaxBenefit && cmp.taxDiff > 0;
    const tiles = [
      ['เบี้ยประกันที่เสนอ', B(c.premiumTotal) + ' บาท/ปี', k.directors.length + ' ท่าน · เฉลี่ยคนละ ' + B(c.premiumTotal / Math.max(1, k.directors.length)) + ' บาท'],
      ['บริษัทบันทึกเป็นรายจ่ายได้', B(c.recordedExpenseTotal) + ' บาท', 'เบี้ยประกัน + ภาษีที่บริษัทออกให้แทนกรรมการ'],
      ['ประหยัดภาษีนิติบุคคล', B(A.citSaving) + ' บาท', 'จากการที่รายจ่ายชุดนี้ลดฐานภาษีของบริษัท'],
    ];
    return h('div.q-page', null, [
      letterhead(k, 1, total),
      agentLine(),
      h('div', { class: 'q-hero ' + (saves ? 'ok' : 'flat') }, [
        h('div.k', { text: saves ? 'ทำคีย์แมนแล้วบริษัทเสียภาษีน้อยลงปีละ' : 'ผลของโครงสร้างนี้ในปีล่าสุด' }),
        h('div.v', null, [saves ? B(cmp.taxDiff) : 'ไม่มีผลประหยัดภาษี', saves ? h('span.u', { text: 'บาท' }) : null]),
        h('div.s', { text: saves
          ? 'เงินเข้าเจ้าของเพิ่มขึ้น ' + B(cmp.cashDiff) + ' บาท · เงินที่กรรมการรับจริงเพิ่มขึ้น ' + B(cmp.directorNetDiff) + ' บาท'
          : 'ปีล่าสุดบริษัทไม่ได้เสียภาษีเงินได้นิติบุคคล ข้อเสนอนี้จึงเสนอด้วยเหตุผลด้านสวัสดิการและการรักษาบุคลากรสำคัญ' }),
      ]),
      h('div.q-tiles', null, tiles.map((t) => h('div.q-tile', null, [
        h('span.k', { text: t[0] }), h('b', { text: t[1] }), h('span.s', { text: t[2] }),
      ]))),
      h('h4.q-h', { text: 'เทียบกับการจ่ายเงินก้อนเดียวกันเป็นเงินปันผล' }),
      compareRow('1 · ภาษีที่เสียรวมทั้งปี', 'ยิ่งต่ำยิ่งดี', A.netTax, Bf.totalTax, cmp.taxDiff, Bf.totalTax,
        cmp.taxDiff > 0 ? 'เสียภาษีน้อยลง' : cmp.taxDiff < 0 ? 'เสียภาษีมากขึ้น' : 'เท่ากัน', true),
      compareRow('2 · เงินเดือนและโบนัสที่กรรมการรับจริง', 'ยิ่งสูงยิ่งดี', A.directorNet, Bf.directorNet, cmp.directorNetDiff, Bf.directorNet,
        cmp.directorNetDiff > 0 ? 'เงินเข้ากรรมการมากขึ้น' : cmp.directorNetDiff < 0 ? 'เงินเข้ากรรมการน้อยลง' : 'เท่ากัน'),
      compareRow('3 · เงินเข้าเจ้าของทั้งหมด', 'ยิ่งสูงยิ่งดี', A.ownerCash, Bf.ownerCash, cmp.cashDiff, Bf.ownerCash,
        cmp.cashDiff > 0 ? 'เงินเข้าเจ้าของมากขึ้น' : cmp.cashDiff < 0 ? 'เงินเข้าเจ้าของน้อยลง' : 'เท่ากัน'),
      K.quoteShowBasis() ? h('p.q-basis', { text: 'ที่มาของเบี้ย: ฐานคิดเบี้ย ' + B(c.ceiling.base) + ' บาท · เบี้ยที่เสนอคิดเป็น ' +
        (c.ceiling.base ? (c.premiumTotal / c.ceiling.base * 100).toFixed(2) + '%' : '–') + ' ของฐาน' }) : null,
    ]);
  }

  // ── หน้า 2 — รายละเอียดและเหตุผล ──────────────────────────────────────
  function pageTwo(k, c, total) {
    const dirs = k.directors;
    const pays = dirs.map((d) => E.n0(d.salary) + E.n0(d.bonus));
    const allWithinPay = dirs.every((d, i) => E.n0(d.premiumAllocated) <= pays[i] || pays[i] === 0);
    const allBanded = dirs.length > 0 && dirs.every((d) => !!(d.positionCriteria || '').trim());

    const reasons = [
      [k.docs.welfareRule, 'จ่ายให้กรรมการทุกท่านเป็นการทั่วไปตามระเบียบสวัสดิการของบริษัท ไม่ได้เลือกปฏิบัติเฉพาะบุคคลใดบุคคลหนึ่ง'],
      [k.docs.boardResolution, 'ผ่านมติที่ประชุมคณะกรรมการ/ผู้ถือหุ้นก่อนดำเนินการ'],
      [allBanded, 'จัดสรรวงเงินตามระดับตำแหน่งที่กำหนดไว้ล่วงหน้าในระเบียบ'],
      [allWithinPay, 'วงเงินของกรรมการแต่ละท่านไม่เกินค่าตอบแทนทั้งปีที่ท่านนั้นได้รับอยู่'],
      [k.docs.pnd1, 'บันทึกเป็นเงินได้ของกรรมการตามมาตรา 40(1) และนำส่ง ภ.ง.ด.1 ทุกเดือนตลอดอายุการชำระเบี้ย'],
    ];

    return h('div.q-page.last', null, [
      letterhead(k, 2, total),
      h('h4.q-h', { text: 'การจัดสรรเบี้ยรายกรรมการ' }),
      h('table.q-table', null, [
        h('thead', null, [h('tr', null, [
          h('th', { style: 'text-align:left', text: 'กรรมการ' }),
          h('th', { style: 'text-align:left', text: 'ตำแหน่ง' }),
          h('th', { style: 'text-align:left', text: 'เกณฑ์ตามระดับ' }),
          h('th', { text: 'ค่าตอบแทนทั้งปี' }),
          h('th', { text: 'เบี้ยที่จัดสรร' }),
          h('th', { text: 'ภาษีที่บริษัทออกให้' }),
          h('th', { text: 'ภ.ง.ด.1 ต่อเดือน' }),
        ])]),
        h('tbody', null, dirs.map((d, i) => {
          const g = c.perDirector[i].gross;
          return h('tr', null, [
            h('td', { style: 'text-align:left', text: d.name || 'ท่านที่ ' + (i + 1) }),
            h('td', { style: 'text-align:left', text: d.position || '–' }),
            h('td', { style: 'text-align:left', text: d.positionCriteria || '–' }),
            h('td', { text: B(pays[i]) }),
            h('td', { text: B(d.premiumAllocated) }),
            h('td', { text: B(g.tax) }),
            h('td', { text: B(g.monthlyWithholding) }),
          ]);
        }).concat([h('tr.q-total', null, [
          h('th', { style: 'text-align:left', colspan: 3, text: 'รวม' }),
          h('th', { text: B(c.salaryTotal) }),
          h('th', { text: B(c.premiumTotal) }),
          h('th', { text: B(c.allTierTaxTotal) }),
          h('th', { text: B(c.monthlyWithholdingTotal) }),
        ])])),
      ]),

      h('h4.q-h', { text: 'เหตุผลประกอบการเสนอ' }),
      h('ol.q-reasons', null, reasons.map((r) => h('li', { class: r[0] ? 'yes' : 'no' }, [
        h('span.mark', { text: r[0] ? '✓' : '○' }), h('span', { text: r[1] }),
      ]))),
      h('p.q-note', { text: reasons.every((r) => r[0])
        ? 'ทั้งห้าข้อคือสิ่งที่กรมสรรพากรใช้ดูว่ารายจ่ายก้อนนี้เป็นไปเพื่อกิจการโดยเฉพาะหรือไม่'
        : 'ข้อที่ยังเป็นวงกลมคือสิ่งที่ต้องจัดเตรียมให้ครบก่อนเริ่มกรมธรรม์ — ทั้งห้าข้อคือสิ่งที่กรมสรรพากรใช้ดูว่ารายจ่ายก้อนนี้เป็นไปเพื่อกิจการโดยเฉพาะหรือไม่' }),

      h('h4.q-h', { text: 'เอกสารที่ต้องจัดเก็บไว้' }),
      h('ul.q-docs', null, E.DOC_FIELDS.map((f) => h('li', null, [
        h('span.box', { text: k.docs[f.key] ? '☑' : '☐' }), h('span', { text: f.label }),
      ]))),

      h('h4.q-h', { text: 'ข้อควรทราบ' }),
      h('ul.q-caveats', null, [
        h('li', { text: 'ตัวเลขในเอกสารนี้เป็นภาพของปีเดียวจากงบการเงินล่าสุดที่ได้รับ ควรดูกระแสเงินสดตลอดอายุการชำระเบี้ยประกอบก่อนตัดสินใจ' }),
        h('li', { text: 'ยังไม่ได้หักผลของเงินสดที่จมอยู่ในกรมธรรม์ ขอให้ดูตารางมูลค่าเวนคืนรายปีประกอบเสมอ' }),
        k.policy.beneficiary === 'company'
          ? h('li', { text: 'บริษัทเป็นผู้รับผลประโยชน์ ค่าสินไหมที่บริษัทได้รับถือเป็นรายได้ที่ต้องเสียภาษีเงินได้นิติบุคคล' })
          : h('li', { text: 'ทายาทของกรรมการเป็นผู้รับผลประโยชน์ ค่าสินไหมได้รับยกเว้นภาษีตามมาตรา 42(13)' }),
        h('li', { text: 'ฝั่งเงินปันผลคิดภาษีหัก ณ ที่จ่าย 10% เป็นภาษีสุดท้าย ผู้ถือหุ้นอาจเลือกนำไปรวมคำนวณสิ้นปีพร้อมใช้เครดิตภาษีเงินปันผลแทนได้' }),
      ]),

      h('div.q-sign', null, [
        h('div', null, [h('div.line'), h('span', { text: 'ผู้เสนอ' })]),
        h('div', null, [h('div.line'), h('span', { text: 'ผู้รับข้อเสนอ (กรรมการผู้มีอำนาจ)' })]),
      ]),
      h('p.q-foot', { text: 'ตัวเลขทั้งหมดเป็นการประมาณเพื่อการนำเสนอ ไม่ใช่คำวินิจฉัยทางภาษี ควรให้ผู้สอบบัญชีหรือที่ปรึกษาภาษีของบริษัทตรวจสอบก่อนใช้จริง · ' +
        'อ้างอิง: ป.96/2543 · ข้อหารือ กค 0811/408 (2543), กค 0706/4227 (2547), กค 0706/7251 (2549), กค 0702/9358 (2552)' }),
    ]);
  }

  K.renderQuote = function (paper, k, c) {
    if (!c.checks.canQuote) {
      paper.appendChild(h('p', { text: 'ยังพิมพ์ใบเสนอไม่ได้ — แก้ข้อตรวจสอบระดับบล็อกให้ครบก่อน:' }));
      paper.appendChild(h('ul', null, c.checks.blocking.map((b) => h('li', { text: b.code + ' — ' + b.title }))));
      return;
    }
    const full = K.quoteLength() === 'full';
    paper.classList.add('quote');
    if (full) {
      paper.appendChild(pageOne(k, c, 2));
      paper.appendChild(pageTwo(k, c, 2));
    } else {
      const one = pageOne(k, c, 1);
      one.classList.add('last');
      paper.appendChild(one);
    }
  };

  // ── การ์ดตั้งค่าใบเสนอ (ไม่พิมพ์) ─────────────────────────────────────
  K.quoteSettingsCard = function () {
    const a = K.agent();
    const f = (label, key, placeholder) => h('label.field', null, [
      h('span.lbl', { text: label }),
      h('input.cell', { value: a[key] || '', placeholder: placeholder || '',
        oninput: (e) => K.setAgent({ [key]: e.target.value }) }),
    ]);
    const logoRow = h('div.q-logo-row', null, [
      a.logo ? h('img.q-logo-preview', { src: a.logo, alt: '' }) : h('span.hint', { text: 'ยังไม่ได้ใส่โลโก้' }),
      a.logo ? h('button.btn.danger', { text: 'เอาโลโก้ออก', onclick: () => { K.setAgent({ logo: '' }); K.render(); } }) : null,
    ]);
    return K.card('ข้อมูลผู้เสนอ (ใช้กับทุกใบเสนอ)', 'เก็บไว้ในเบราว์เซอร์เครื่องนี้ ไม่ผูกกับเคส', [
      h('div.grid2', null, [
        f('ชื่อผู้เสนอ', 'name', 'ชื่อ-นามสกุล'),
        f('เบอร์โทร', 'phone', '08x-xxx-xxxx'),
        f('อีเมล', 'email', ''),
        f('เลขที่ใบอนุญาตตัวแทน', 'license', ''),
        f('สังกัด/ทีม', 'agency', ''),
      ]),
      logoRow,
      K.dropzone({
        accept: '.png,.jpg,.jpeg,.webp', icon: '🖼',
        title: 'ลากไฟล์โลโก้มาวางตรงนี้',
        hint: 'หรือกดเพื่อเลือกไฟล์ · ไฟล์ไม่ควรเกิน 300 KB เพราะเก็บไว้ในเบราว์เซอร์',
        onFiles: (files) => {
          const file = files[0];
          if (file.size > 400 * 1024) { K.alert('ไฟล์ใหญ่เกินไป', 'โลโก้ควรไม่เกิน 300 KB · ไฟล์นี้ ' + Math.round(file.size / 1024) + ' KB'); return; }
          const r = new FileReader();
          r.onload = () => { K.setAgent({ logo: String(r.result) }); K.render(); };
          r.readAsDataURL(file);
        },
      }),
      h('p.hint', { text: 'ข้อมูลชุดนี้เก็บใน localStorage ของเครื่องนี้เท่านั้น ไม่ได้อยู่ในไฟล์สำรองเคส' }),
    ]);
  };
})(typeof self !== 'undefined' ? self : this);
