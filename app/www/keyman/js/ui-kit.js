// ชั้นหน้าจอ: ตัวช่วยสร้าง DOM + ผูกช่องกรอกเข้ากับข้อมูลเคส
// ไม่มีเฟรมเวิร์ก ไม่มี build step — อ่านแล้วแก้เองได้ด้วย HTML/CSS พื้นฐาน
(function (root) {
  'use strict';
  const E = root.KeymanEngine;
  const K = (root.K = root.K || {});

  // ── DOM ────────────────────────────────────────────────────────────────
  function h(tag, attrs, children) {
    const parts = String(tag).split(/([#.])/);
    const node = document.createElement(parts[0] || 'div');
    for (let i = 1; i < parts.length; i += 2) {
      if (parts[i] === '#') node.id = parts[i + 1];
      else node.classList.add(parts[i + 1]);
    }
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') node.className += (node.className ? ' ' : '') + v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else if (v === true) node.setAttribute(k, '');
        else node.setAttribute(k, v);
      }
    }
    (Array.isArray(children) ? children : children === undefined || children === null ? [] : [children])
      .forEach((c) => {
        if (c === null || c === undefined || c === false) return;
        node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
      });
    return node;
  }
  K.h = h;
  K.clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); return node; };

  // ── ตัวเลข ─────────────────────────────────────────────────────────────
  const nf = (min, max) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: min, maximumFractionDigits: max });
  const NF2 = nf(2, 2);
  const NF0 = nf(0, 0);
  K.money = (v, dash) => {
    const n = E.num(v);
    if (n === null) return dash === undefined ? '–' : dash;
    return NF2.format(n);
  };
  K.int = (v) => { const n = E.num(v); return n === null ? '–' : NF0.format(n); };
  K.pct = (v, digits) => {
    const n = E.num(v);
    if (n === null) return '–';
    return n.toFixed(digits === undefined ? 2 : digits) + '%';
  };
  K.ratio = (v) => (E.num(v) === null ? '–' : (E.num(v) * 100).toFixed(2) + '%');

  // ── อ่าน/เขียนค่าใน object ตาม path ────────────────────────────────────
  function getPath(obj, path) {
    return String(path).split('.').reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
  }
  function setPath(obj, path, value) {
    const keys = String(path).split('.');
    let o = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (o[k] === null || typeof o[k] !== 'object') o[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
      o = o[k];
    }
    o[keys[keys.length - 1]] = value;
  }
  K.getPath = getPath;
  K.setPath = setPath;

  // ── ช่องกรอก (พื้นเหลืองตามธรรมเนียมไฟล์เดิม) ──────────────────────────
  // opts: {kind:'money'|'text'|'pct'|'int', placeholder, ref, onchange, width}
  K.input = function (path, opts) {
    const o = opts || {};
    const kind = o.kind || 'money';
    const raw = getPath(K.state.kase, path);
    const node = h('input.cell', {
      type: 'text',
      inputmode: kind === 'text' ? undefined : 'decimal',
      class: kind === 'text' ? '' : 'num',
      placeholder: o.placeholder || (kind === 'text' ? '' : '0.00'),
      'data-path': path,
      'data-kind': kind,
      value: formatFor(kind, raw),
      style: o.width ? 'min-width:' + o.width : null,
    });
    node.addEventListener('input', () => {
      const v = node.value.trim();
      if (kind === 'text') setPath(K.state.kase, path, node.value);
      else setPath(K.state.kase, path, v === '' ? null : E.num(v));
      K.touch();
      if (o.onchange) o.onchange();
    });
    node.addEventListener('blur', () => {
      node.value = formatFor(kind, getPath(K.state.kase, path));
    });
    return node;
  };
  function formatFor(kind, v) {
    if (kind === 'text') return v === null || v === undefined ? '' : String(v);
    const n = E.num(v);
    if (n === null) return '';
    if (kind === 'pct') return n.toFixed(2);
    if (kind === 'int') return NF0.format(n);
    return NF2.format(n);
  }
  K.formatFor = formatFor;

  K.select = function (path, options, opts) {
    const o = opts || {};
    const cur = getPath(K.state.kase, path);
    const node = h('select.cell', { 'data-path': path },
      options.map((opt) => h('option', { value: opt.value, selected: String(cur || '') === String(opt.value) }, opt.label)));
    node.addEventListener('change', () => {
      setPath(K.state.kase, path, node.value);
      K.touch();
      if (o.rerender !== false) K.render(); else K.refreshOutputs();
      if (o.onchange) o.onchange();
    });
    return node;
  };

  K.checkbox = function (path, label) {
    const node = h('input', { type: 'checkbox', checked: !!getPath(K.state.kase, path) });
    node.addEventListener('change', () => { setPath(K.state.kase, path, node.checked); K.touch(); K.refreshOutputs(); });
    return h('li', null, [node, h('span', { text: label })]);
  };

  K.textarea = function (path, opts) {
    const o = opts || {};
    const node = h('textarea.cell', { rows: o.rows || 3, placeholder: o.placeholder || '' });
    node.value = getPath(K.state.kase, path) || '';
    node.addEventListener('input', () => { setPath(K.state.kase, path, node.value); K.touch(); });
    return node;
  };

  // ── ช่องผลลัพธ์ที่คำนวณสด (เทา แก้ไม่ได้) ──────────────────────────────
  // ลงทะเบียนฟังก์ชันไว้ พอตัวเลขต้นทางเปลี่ยนก็อัปเดตเฉพาะช่องพวกนี้
  // โดยไม่ต้องวาดทั้งแท็บใหม่ (ไม่งั้นเคอร์เซอร์ในช่องกรอกจะกระโดด)
  K._outputs = [];
  K.out = function (fn, opts) {
    const o = opts || {};
    const node = h(o.tag || 'span', { class: o.class || '' });
    const entry = { node, fn, o };
    K._outputs.push(entry);
    K._paintOut(entry);
    return node;
  };
  K._paintOut = function (entry) {
    let v;
    try { v = entry.fn(K.state.computed, K.state.kase); } catch (err) { v = '–'; }
    if (v && typeof v === 'object' && v.nodeType) {
      K.clear(entry.node).appendChild(v);
      return;
    }
    const text = v === null || v === undefined ? '–' : String(v);
    entry.node.textContent = text;
    entry.node.classList.toggle('neg', /^-/.test(text.replace(/[^\d\-.,]/g, '')));
  };
  K.refreshOutputs = function () {
    K.recompute();
    K._outputs.forEach(K._paintOut);
    K.renderCheckbar();
    K.scheduleSave();
  };
  // เซลล์ผลลัพธ์ในตาราง
  K.outCell = function (fn, opts) {
    const o = opts || {};
    const td = h(o.th ? 'th' : 'td', { class: 'calc num ' + (o.class || '') });
    td.appendChild(K.out(fn));
    if (o.ref) td.appendChild(h('span.ref', { text: o.ref }));
    return td;
  };
  K.cellIn = function (path, opts) {
    const o = opts || {};
    const td = h('td', null, [K.input(path, o)]);
    if (o.ref) td.appendChild(h('span.ref', { text: o.ref }));
    return td;
  };
  K.labelCell = function (text, ref) {
    return h('td.label', null, [h('span', { text }), ref ? h('span.ref', { text: ref }) : null]);
  };
  K.dashCell = (ref) => h('td.calc.dash', null, ['–', ref ? h('span.ref', { text: ref }) : null]);

  K.table = function (headRows, bodyRows, opts) {
    const o = opts || {};
    const t = h('table', { class: o.class || '' }, [
      headRows ? h('thead', null, headRows) : null,
      h('tbody', null, bodyRows),
    ]);
    return h('div.tablewrap', null, [t]);
  };

  K.card = function (title, sheetRef, children) {
    return h('section.card', null, [
      title ? h('h2', null, [h('span', { text: title }), sheetRef ? h('span.sheet', { text: sheetRef }) : null]) : null,
    ].concat(Array.isArray(children) ? children : [children]));
  };

  K.legend = () => h('p.legend', null, [
    h('span', { html: '<i class="in"></i>ช่องกรอก (พื้นเหลือง — กรอกเฉพาะช่องนี้)' }),
    h('span', { html: '<i class="ca"></i>ช่องสูตร (คำนวณให้ แก้ไม่ได้)' }),
  ]);

  K.disclaimer = () => h('p.disclaimer', {
    text:
      'ตัวเลขทั้งหมดเป็นการประมาณเพื่อการนำเสนอ ไม่ใช่คำวินิจฉัยทางภาษี ' +
      'ควรให้ผู้สอบบัญชีหรือที่ปรึกษาภาษีของบริษัทนั้นตรวจสอบก่อนใช้จริง',
  });

  // กล่องยืนยัน/แจ้งเตือน
  K.dialog = function (title, bodyNodes, buttons) {
    const dlg = h('dialog', null, [
      h('div.dlg-head', { text: title }),
      h('div.dlg-body', null, bodyNodes),
      h('div.dlg-foot', null, (buttons || []).map((b) =>
        h('button', { class: 'btn ' + (b.primary ? 'primary' : '') + (b.danger ? ' danger' : ''), onclick: () => { if (b.onclick) b.onclick(dlg); } }, b.label))),
    ]);
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.showModal();
    return dlg;
  };
  K.alert = (title, message) =>
    K.dialog(title, [h('p', { text: message })], [{ label: 'ปิด', primary: true, onclick: (d) => d.close() }]);
  K.confirm = (title, message, onYes, yesLabel) =>
    K.dialog(title, [h('p', { text: message })], [
      { label: 'ยกเลิก', onclick: (d) => d.close() },
      { label: yesLabel || 'ตกลง', primary: true, onclick: (d) => { d.close(); onYes(); } },
    ]);
})(typeof self !== 'undefined' ? self : this);
