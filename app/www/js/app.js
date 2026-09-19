// Debt & Pawn Tracker — vanilla JS PWA. Two fixed users (not/lek), login is just a username,
// no password. The admin user can switch to view/edit the other user's data.
(function () {
  'use strict';

  const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const THAI_MONTHS_FULL = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const THAI_WEEKDAYS = ['อา','จ','อ','พ','พฤ','ศ','ส'];
  const STATUS_META = {
    paid:      { label: 'จ่ายแล้ว',        bg: '#E7F5EE', fg: '#1F7A52', dot: '#2E9E6D' },
    overdue:   { label: 'ค้างชำระ',        bg: '#FDEAEA', fg: '#B23B3B', dot: '#D64545' },
    due_soon:  { label: 'ใกล้ถึงกำหนด',    bg: '#FFF3DD', fg: '#92600A', dot: '#E8A93B' },
    upcoming:  { label: 'ยังไม่ถึงกำหนด',  bg: '#EFEFEF', fg: '#6B6B6B', dot: '#A3A9B8' },
  };

  // Pawn ticket redemption/renewal periods a shop typically offers.
  const PERIOD_OPTIONS = [
    { key: '7d',  label: '7 วัน',    unit: 'day',   value: 7 },
    { key: '15d', label: '15 วัน',   unit: 'day',   value: 15 },
    { key: '1m',  label: '1 เดือน',  unit: 'month', value: 1 },
    { key: '2m',  label: '2 เดือน',  unit: 'month', value: 2 },
    { key: '3m',  label: '3 เดือน',  unit: 'month', value: 3 },
    { key: '4m',  label: '4 เดือน',  unit: 'month', value: 4 },
    { key: 'custom', label: 'กำหนดเอง (ระบุวัน)', unit: 'day', value: null },
  ];
  const PAWN_CATEGORIES = [
    { key: 'jewelry',     label: 'เครื่องประดับ', icon: '💍' },
    { key: 'car',         label: 'รถ',            icon: '🚗' },
    { key: 'electronics', label: 'อุปกรณ์อิเล็กทรอนิก', icon: '📱' },
    { key: 'other',       label: 'อื่นๆ',          icon: '📦' },
  ];

  // Calendar dates use LOCAL Y/M/D, never toISOString() (which converts to UTC and can shift
  // the date by a day in timezones ahead of UTC, e.g. Thailand at UTC+7).
  function dateStr(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function computePeriodDate(unit, value) {
    const d = new Date();
    if (unit === 'day') d.setDate(d.getDate() + value);
    else if (unit === 'month') d.setMonth(d.getMonth() + value);
    return dateStr(d);
  }
  function addMonths(dateStrIn, n) {
    const d = new Date(dateStrIn + 'T00:00:00');
    d.setMonth(d.getMonth() + n);
    return dateStr(d);
  }
  function todayISO() { return dateStr(new Date()); }

  const S = {
    screen: 'login',           // login | dashboard | debtList | debtDetail | debtSettings | pawnList | pawnSettings | expenses | expenseSettings | addEdit | settings | notifications
    currentUser: JSON.parse(localStorage.getItem('dpt_user') || 'null'), // {id, username, is_admin} — the user whose data is being viewed
    realUser: JSON.parse(localStorage.getItem('dpt_real_user') || 'null'), // the account that actually logged in (only differs from currentUser while an admin is "viewing as" someone else)
    switchableUsers: [],
    loginError: '',

    busy: false,
    returnScreen: 'dashboard',
    addType: 'debt',
    fabMenuOpen: false,
    userMenuOpen: false,
    warnDays: 5,
    calendarToken: null,       // secret name of this user's Google Calendar .ics feed
    toast: null,
    selectedDebtId: null,
    editingDebtId: null,
    editingPawnId: null,
    editingExpenseId: null,
    renewPickerFor: null,
    redeemPromptFor: null,
    pendingAction: null,       // key of the write currently in flight; blocks every action button
    detailFor: null,           // pawn id whose detail popup is open
    detailHistoryId: null,     // set when the popup was opened from a history row — enables undo
    detailHistoryItem: null,   // that row's data, so the undo button can render before the pawn loads
    detailPawnCache: null,     // pawn fetched by id when it isn't in S.pawns (i.e. already redeemed)
    pawnFilter: null,          // 'jewelry' | 'nonjewelry' — set by tapping a dashboard total card
    pushStatus: null,          // {supported, permission, enabled} for THIS device, not the account
    pushError: null,           // last enablePush() failure, shown on the card so it can be read back
    expensePayFor: null,
    datePickerFor: null,       // which form field's calendar popup is open, if any
    datePickerView: { y: 0, m: 0 }, // {y,m} (Gregorian, m 0-indexed) the open popup's month grid is showing
    calMonth: null,            // 'YYYY-MM' the dashboard payment calendar is showing (null = this month)
    calSelected: null,         // 'YYYY-MM-DD' whose items are expanded under that calendar
    historyFilter: null,       // history row type to show ('renew' | 'redeem' | 'installment' | 'expense'), null = all
    debts: [],
    pawns: [],
    expenses: [],
    report: null,
    history: null,
    notifications: [],
    unreadCount: 0,
    forms: {
      loginUsername: '',
      name: '', total: '', remaining: '', dueDay: '5', installmentAmount: '',
      itemName: '', shop: '', ticketCode: '', category: 'jewelry', amount: '', interest: '', dueDate: '', pawnPeriod: '1m', pawnCustomDays: '',
      pawnDate: '', renewUrl: '',
      expenseName: '', expenseType: 'fixed', expenseAmount: '', expenseDueDay: '5', expensePayAmount: '',
      redeemAmount: '',
    },
  };

  const app = document.getElementById('app');
  let toastTimer = null;

  function setState(patch) { Object.assign(S, patch); render(); }

  // Wraps every button that writes to Firestore. Each write is 1-2 network round-trips, and
  // before this the UI gave no sign anything was happening in between — on a slow phone
  // connection that read as "the app froze", so people tapped again, and every extra tap ran
  // another real renewal. Now the first tap locks all action buttons and relabels the one that
  // was pressed, so the duplicate taps land on a disabled control instead of the database.
  async function runAction(key, fn) {
    if (S.pendingAction) return;
    S.pendingAction = key;
    render();
    try {
      await fn();
    } finally {
      S.pendingAction = null;
      render();
    }
  }
  // Applied to every action button so a queued tap can't fire while a write is in flight.
  function lockAttr() { return S.pendingAction ? 'disabled style="opacity:.45;pointer-events:none"' : ''; }
  function btnLabel(key, label) { return S.pendingAction === key ? 'กำลังบันทึก...' : label; }
  function showToast(msg) {
    S.toast = msg;
    clearTimeout(toastTimer);
    render();
    toastTimer = setTimeout(() => { S.toast = null; render(); }, 2200);
  }

  function formatMoney(n) { return Math.round(n || 0).toLocaleString('th-TH'); }
  function formatDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    const by = d.getFullYear() + 543;
    return d.getDate() + ' ' + THAI_MONTHS[d.getMonth()] + ' ' + String(by).slice(-2);
  }
  function daysUntil(iso) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(iso + 'T00:00:00');
    return Math.round((d - today) / 86400000);
  }
  function statusOf(paid, iso) {
    if (paid) return 'paid';
    const days = daysUntil(iso);
    if (days < 0) return 'overdue';
    if (days <= S.warnDays) return 'due_soon';
    return 'upcoming';
  }
  function daysLabel(days, status) {
    if (status === 'paid') return '';
    if (days < 0) return 'เลยกำหนด ' + Math.abs(days) + ' วัน';
    if (days === 0) return 'ครบกำหนดวันนี้';
    return 'เหลือ ' + days + ' วัน';
  }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // ---------------- Data loading ----------------
  async function loadAll() {
    S.busy = true; render();
    try {
      const [debts, pawns, expenses, settings] = await Promise.all([
        Api.getDebts(), Api.getPawns(), Api.getExpenses(), Api.getSettings(),
      ]);
      S.debts = debts;
      S.pawns = pawns;
      S.expenses = expenses;
      S.warnDays = settings.warn_days;
      S.calendarToken = settings.calendar_token;
      // Report is recomputed from the data just fetched above instead of its own parallel
      // fetch — getReport() would otherwise re-query debts/pawns/expenses from scratch.
      S.report = await Api.getReport(debts, pawns, expenses);
    } catch (e) {
      showToast('โหลดข้อมูลไม่สำเร็จ: ' + e.message);
    }
    S.busy = false; render();
  }

  async function loadNotifications() {
    try {
      // S.report is only set once loadAll() has actually populated S.debts/S.pawns/S.expenses
      // — before that they're just the initial empty arrays, so pass nothing and let it fetch
      // fresh rather than reading a truthy-but-empty [] as "there's really nothing here yet".
      const res = S.report
        ? await Api.getNotifications(S.debts, S.pawns, S.expenses, { warn_days: S.warnDays })
        : await Api.getNotifications();
      S.notifications = res.items;
      S.unreadCount = res.unread_count;
      render();
    } catch (e) { /* keep stale data */ }
  }

  // Fires a real phone notification for whatever's unread right when the app is opened —
  // separate from loadNotifications() itself so opening the bell manually (which also calls
  // loadNotifications()) doesn't re-fire one every time. Never prompts for permission; only
  // acts if it's already granted (from the manual test button in Settings). Foreground-only —
  // there's no server here to push while the app/tab isn't open at all.
  async function alertUrgentNotifications() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const unread = S.notifications.filter((n) => !n.read_at);
    if (!unread.length) return;
    const title = unread.length === 1 ? unread[0].title : `มีรายการด่วน ${unread.length} รายการ`;
    const body = unread.length === 1 ? unread[0].body : unread.map((n) => n.title).join(' · ');
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, { body, icon: 'icons/icon.svg', tag: 'dpt-urgent' });
      } else {
        new Notification(title, { body, icon: 'icons/icon.svg', tag: 'dpt-urgent' });
      }
    } catch (e) { /* best effort, no UI feedback needed here */ }
  }
  async function loadNotificationsAndAlert() {
    await loadNotifications();
    await alertUrgentNotifications();
  }

  // Quiet re-fetch of just the report summary after marking something paid, so the
  // dashboard's totals stay accurate without a full-screen loading spinner. Reuses whatever's
  // already in S.debts/S.pawns/S.expenses — those are kept in sync by each action that calls
  // this — instead of re-querying Firestore for data already sitting in memory.
  async function refreshReport() {
    try { S.report = await Api.getReport(S.debts, S.pawns, S.expenses); render(); } catch (e) { /* keep stale data */ }
  }

  async function refreshDebtDetail(id) {
    try {
      const debt = await Api.getDebtDetail(id);
      const idx = S.debts.findIndex((d) => d.id === id);
      if (idx >= 0) S.debts[idx] = debt; else S.debts.push(debt);
    } catch (e) { showToast('โหลดรายละเอียดไม่สำเร็จ'); }
  }

  // ---------------- Navigation ----------------
  // Every navigation closes the detail popup — otherwise it would stay pinned over the new
  // screen, since it renders outside screenBody().
  function nav(screen) {
    setState({ screen, fabMenuOpen: false, detailFor: null });
    if (screen === 'history') loadHistory();
    if (screen === 'settings') refreshPushStatus();
  }
  function navFromManage(screen) { setState({ screen, returnScreen: 'manage', fabMenuOpen: false, detailFor: null }); }
  function goBack() { setState({ screen: S.returnScreen, fabMenuOpen: false, detailFor: null }); }
  async function loadHistory() {
    try { S.history = await Api.getHistory(S.report ? S.expenses : undefined); render(); } catch (e) { /* keep stale data */ }
  }
  async function openDebt(id, from) {
    setState({ screen: 'debtDetail', selectedDebtId: id, returnScreen: from || 'debtList' });
    await refreshDebtDetail(id);
    render();
  }
  function openDebtSettings(id) {
    const d = S.debts.find((x) => x.id === id);
    if (!d) return;
    setState({
      screen: 'debtSettings', editingDebtId: id, returnScreen: 'debtDetail',
      forms: {
        ...S.forms, name: d.name, total: String(d.total_amount),
        remaining: String(d.remaining_amount), dueDay: String(d.due_day),
        installmentAmount: String(d.installment_amount || ''),
      },
    });
  }
  function openPawnSettings(id, from) {
    const p = S.pawns.find((x) => x.id === id);
    if (!p) return;
    const matchedOpt = PERIOD_OPTIONS.find((o) => o.key !== 'custom' && o.unit === p.period_unit && o.value === p.period_value);
    const isCustomCycle = !matchedOpt && p.period_unit === 'day' && p.period_value;
    setState({
      screen: 'pawnSettings', editingPawnId: id, returnScreen: from || 'pawnList', detailFor: null,
      forms: {
        ...S.forms, itemName: p.item_name, shop: p.shop_name || '', ticketCode: p.ticket_code || '',
        category: p.category, amount: String(p.amount), interest: p.interest != null ? String(p.interest) : '',
        pawnPeriod: matchedOpt ? matchedOpt.key : 'custom', dueDate: p.due_date,
        pawnCustomDays: isCustomCycle ? String(p.period_value) : '',
        pawnDate: p.pawn_date || (p.created_at || '').slice(0, 10), renewUrl: p.renew_url || '',
      },
    });
  }
  function openAdd(type, from) {
    setState({
      screen: 'addEdit', addType: type, returnScreen: from, fabMenuOpen: false,
      forms: {
        ...S.forms,
        name: '', total: '', remaining: '', dueDay: '5', installmentAmount: '',
        itemName: '', shop: '', ticketCode: '', category: 'jewelry', amount: '', interest: '',
        pawnPeriod: '1m', dueDate: computePeriodDate('month', 1), pawnCustomDays: '',
        pawnDate: todayISO(), renewUrl: '',
        expenseName: '', expenseType: 'fixed', expenseAmount: '', expenseDueDay: '5',
      },
    });
  }
  function setForms(patch) { S.forms = { ...S.forms, ...patch }; render(); }

  // ---------------- Custom Buddhist-era calendar (replaces native <input type="date">) ----------------
  function openDatePicker(field) {
    if (S.datePickerFor === field) { setState({ datePickerFor: null }); return; }
    const current = S.forms[field];
    const base = current ? new Date(current + 'T00:00:00') : new Date();
    setState({ datePickerFor: field, datePickerView: { y: base.getFullYear(), m: base.getMonth() } });
  }
  function shiftDatePickerMonth(delta) {
    let { y, m } = S.datePickerView;
    m += delta;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    setState({ datePickerView: { y, m } });
  }
  function pickDate(field, dateStr) {
    S.forms = { ...S.forms, [field]: dateStr };
    setState({ datePickerFor: null });
  }
  // ---------------- Form building blocks ----------------
  // Every form on this app is the same three pieces: a titled card, a labelled field, and a
  // hint line — so they are written once here instead of inline in five screens.
  function formCard(icon, title, body) {
    return `
      <div class="form-card">
        ${title ? `<div class="form-card-head"><span class="form-card-icon">${icon}</span>${title}</div>` : ''}
        ${body}
      </div>`;
  }
  const formHint = (text, tone) => `<div class="form-hint${tone ? ' ' + tone : ''}">${text}</div>`;
  function textField(label, bind, opts) {
    const o = opts || {};
    return `
      <div class="form-field">
        <div class="field-label">${label}</div>
        <input class="field-input" ${o.type ? `type="${o.type}"` : ''} data-bind="${bind}" value="${esc(S.forms[bind])}" ${o.placeholder ? `placeholder="${esc(o.placeholder)}"` : ''}/>
      </div>`;
  }
  // Money always carries its ฿ inside the box, so an amount never reads as a bare number.
  function moneyField(label, bind, placeholder) {
    return `
      <div class="form-field">
        <div class="field-label">${label}</div>
        <div class="field-money">
          <span>฿</span>
          <input class="field-input" type="number" inputmode="decimal" data-bind="${bind}" value="${esc(S.forms[bind])}" placeholder="${placeholder || '0'}"/>
        </div>
      </div>`;
  }
  function dayField(label, bind) {
    const options = Array.from({ length: 28 }, (_, i) => i + 1)
      .map((n) => `<option value="${n}" ${String(n) === S.forms[bind] ? 'selected' : ''}>วันที่ ${n}</option>`).join('');
    return `
      <div class="form-field">
        <div class="field-label">${label}</div>
        <select class="field-input field-select" data-bind="${bind}">${options}</select>
      </div>`;
  }

  function renderDateField(field, label) {
    const value = S.forms[field];
    const isOpen = S.datePickerFor === field;
    return `
      <div>
        <div class="field-label">${label}</div>
        <button type="button" class="field-input date-field-btn" data-action="toggle-date-picker" data-field="${field}">
          <span style="${value ? '' : 'color:#A3A9B8'}">${value ? formatDate(value) : 'เลือกวันที่'}</span>
          ${svgCalendar()}
        </button>
        ${isOpen ? renderCalendarPopup(field) : ''}
      </div>`;
  }
  function renderCalendarPopup(field) {
    const { y, m } = S.datePickerView;
    const selected = S.forms[field];
    const startWeekday = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const todayStr = todayISO();
    let cells = '';
    for (let i = 0; i < startWeekday; i++) cells += `<div></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const cls = ['cal-day', dateStr === selected ? 'selected' : '', dateStr === todayStr ? 'today' : ''].filter(Boolean).join(' ');
      cells += `<button type="button" class="${cls}" data-action="pick-date" data-field="${field}" data-date="${dateStr}">${d}</button>`;
    }
    return `
      <div class="cal-popup">
        <div class="cal-header">
          <button type="button" class="icon-btn" data-action="shift-date-month" data-delta="-1">${svgChevronDir('left')}</button>
          <div class="cal-title">${THAI_MONTHS_FULL[m]} ${y + 543}</div>
          <button type="button" class="icon-btn" data-action="shift-date-month" data-delta="1">${svgChevronDir('right')}</button>
        </div>
        <div class="cal-weekdays">${THAI_WEEKDAYS.map((w) => `<div>${w}</div>`).join('')}</div>
        <div class="cal-grid">${cells}</div>
        <button type="button" class="cal-today-btn" data-action="pick-date" data-field="${field}" data-date="${todayStr}">วันนี้</button>
      </div>`;
  }
  function setPawnPeriod(key) {
    const opt = PERIOD_OPTIONS.find((o) => o.key === key);
    if (!opt) return;
    if (opt.key === 'custom') { setForms({ pawnPeriod: key }); return; }
    setForms({ pawnPeriod: key, dueDate: computePeriodDate(opt.unit, opt.value) });
  }
  function setPawnCategory(key) { setForms({ category: key }); }

  // ---------------- Auth: pick-a-username, no password (Firestore + anonymous auth) ----------------
  function saveSession(user, realUser) {
    Api.setActiveUser(user.id);
    localStorage.setItem('dpt_user', JSON.stringify(user));
    localStorage.setItem('dpt_real_user', JSON.stringify(realUser));
    S.currentUser = user;
    S.realUser = realUser;
  }
  function clearSession() {
    localStorage.removeItem('dpt_user');
    localStorage.removeItem('dpt_real_user');
    S.currentUser = null;
    S.realUser = null;
    S.switchableUsers = [];
  }

  async function submitLogin() {
    const username = S.forms.loginUsername.trim();
    if (!username) { setState({ loginError: 'กรุณาพิมพ์ชื่อผู้ใช้' }); return; }
    S.busy = true; render();
    try {
      const res = await Api.login(username);
      saveSession(res.user, res.user);
      S.busy = false;
      setState({ screen: 'dashboard', loginError: '', forms: { ...S.forms, loginUsername: '' } });
      if (res.user.is_admin) loadSwitchableUsers();
      await loadAll();
      loadNotificationsAndAlert();
    } catch (e) {
      S.busy = false;
      setState({ loginError: e.message || 'ไม่พบผู้ใช้นี้' });
    }
  }

  async function loadSwitchableUsers() {
    try { S.switchableUsers = await Api.getUsers(); render(); } catch (e) { /* ignore */ }
  }

  async function switchToUser(userId) {
    if (S.currentUser && S.currentUser.id === userId) { setState({ userMenuOpen: false }); return; }
    try {
      const res = await Api.switchUser(userId);
      saveSession(res.user, S.realUser);
      setState({ userMenuOpen: false, screen: 'dashboard', fabMenuOpen: false });
      await loadAll();
      loadNotificationsAndAlert();
      showToast('กำลังดูข้อมูลของ ' + res.user.username);
    } catch (e) { showToast(e.message || 'สลับผู้ใช้ไม่สำเร็จ'); }
  }

  function logout() {
    clearSession();
    setState({ screen: 'login', userMenuOpen: false, debts: [], pawns: [], expenses: [], report: null, notifications: [], unreadCount: 0 });
  }

  // ---------------- Actions ----------------
  function markPaid(installmentId, debtId) {
    return runAction('paid:' + installmentId, async () => {
      try {
        await Api.markInstallmentPaid(installmentId);
        await refreshDebtDetail(debtId);
        showToast('บันทึกการจ่ายเงินแล้ว');
        await refreshReport();
      } catch (e) { showToast('บันทึกไม่สำเร็จ'); }
    });
  }

  // historyId is only passed from the history screen; it's what turns on the "คืนสินค้า"
  // (undo) button in the popup. A redeemed pawn is no longer in S.pawns, so fetch it by id.
  function openPawnDetail(id, historyId) {
    const known = S.pawns.find((x) => x.id === id);
    setState({
      detailFor: id, detailHistoryId: historyId || null,
      detailHistoryItem: historyId && S.history ? S.history.items.find((h) => h.id === historyId) || null : null,
      detailPawnCache: known || null, redeemPromptFor: null, renewPickerFor: null,
    });
    // A redeemed pawn has dropped out of S.pawns, so it always needs this fetch — which is
    // why the undo button is rendered from the history row instead of waiting on it.
    if (!known) {
      Api.getPawnById(id)
        .then((p) => { if (S.detailFor === id) setState({ detailPawnCache: p }); })
        .catch((e) => { if (S.detailFor === id) { showToast(e.message || 'โหลดข้อมูลตั๋วไม่สำเร็จ'); setState({ detailFor: null }); } });
    }
  }
  function closePawnDetail() {
    setState({ detailFor: null, detailHistoryId: null, detailHistoryItem: null, detailPawnCache: null, redeemPromptFor: null, renewPickerFor: null });
  }
  function undoHistoryEntry(historyId) {
    if (!confirm('ยืนยันคืนรายการนี้?\nระบบจะย้อนตั๋วกลับไปสถานะก่อนหน้า และลบรายการนี้ออกจากประวัติ')) return;
    return runAction('undo:' + historyId, async () => {
      try {
        const res = await Api.undoHistory(historyId);
        Object.assign(S, { detailFor: null, detailHistoryId: null, detailHistoryItem: null, detailPawnCache: null });
        showToast(res.type === 'redeem' ? 'คืนตั๋วกลับเป็นจำนำอยู่แล้ว' : 'ย้อนการต่อดอกแล้ว');
        // The pawn list changes shape on undo (a redeemed ticket comes back), so reload it
        // rather than patching S.pawns by hand.
        await loadAll();
        await loadHistory();
      } catch (e) { showToast(e.message || 'คืนรายการไม่สำเร็จ'); }
    });
  }

  function openRedeemPrompt(id) {
    if (S.redeemPromptFor === id) { setState({ redeemPromptFor: null }); return; }
    const p = S.pawns.find((x) => x.id === id);
    setState({ redeemPromptFor: id, forms: { ...S.forms, redeemAmount: p ? String(p.amount) : '' } });
  }
  function redeemPawn(id, amount) {
    return runAction('redeem:' + id, async () => {
      try {
        await Api.redeemPawn(id, amount);
        S.pawns = S.pawns.filter((p) => p.id !== id);
        Object.assign(S, { redeemPromptFor: null, detailFor: null, forms: { ...S.forms, redeemAmount: '' } });
        showToast('ไถ่ถอนสำเร็จ');
        await refreshReport();
      } catch (e) { showToast(e.message || 'ไถ่ถอนไม่สำเร็จ'); }
    });
  }
  function confirmRedeem(id) {
    const amount = Number(S.forms.redeemAmount) || 0;
    redeemPawn(id, amount || null);
  }
  function toggleRenewPicker(id) { setState({ renewPickerFor: S.renewPickerFor === id ? null : id }); }

  // Only reached for non-jewelry categories now — jewelry's renewal_count-based cap and
  // final-date-pick flow were replaced entirely by the monthly interest accrual model.
  function renewPawn(id, opt) {
    const period = opt.unit === 'month' ? { months: opt.value } : { days: opt.value };
    return runAction('renew:' + id, async () => {
      try {
        const res = await Api.renewPawn(id, period);
        const p = S.pawns.find((x) => x.id === id);
        if (p) { p.due_date = res.due_date; p.renewal_count = (p.renewal_count || 0) + 1; }
        Object.assign(S, { renewPickerFor: null });
        showToast('ต่อดอกแล้ว เลื่อนกำหนดเป็น ' + formatDate(res.due_date));
        await refreshReport();
      } catch (e) { showToast(e.message || 'ต่อดอกไม่สำเร็จ'); }
    });
  }

  // Jewelry's "ต่อดอก": paying the accrued interest resets the clock (new pawn_date = today,
  // same as a real "ส่งดอก" ticket), rather than picking a period like other categories.
  function renewJewelryPawn(id) {
    const p = S.pawns.find((x) => x.id === id);
    if (!p) return;
    const term = jewelryTermOf(p);
    const accrued = (p.interest || 0) * term.billed;
    const ok = confirm(`ยืนยันต่อดอก "${p.item_name}"\nจ่ายดอกเบี้ยสะสม ฿${formatMoney(accrued)} (${term.billed} งวด)\nจะเริ่มนับงวดที่ 1 ใหม่จากวันนี้`);
    if (!ok) return;
    return runAction('renew:' + id, async () => {
      try {
        const res = await Api.renewJewelry(id);
        p.pawn_date = res.pawn_date;
        p.renewal_count = (p.renewal_count || 0) + 1;
        showToast('ต่อดอกแล้ว เริ่มนับงวดที่ 1 ใหม่');
        await refreshReport();
      } catch (e) { showToast(e.message || 'ต่อดอกไม่สำเร็จ'); }
    });
  }

  async function addDebtSubmit() {
    const f = S.forms;
    const total = Number(f.total) || 0;
    if (!f.name.trim() || !total) { showToast('กรอกชื่อและยอดหนี้ให้ครบ'); return; }
    try {
      await Api.createDebt({
        name: f.name.trim(), total_amount: total,
        remaining_amount: Number(f.remaining) || total,
        due_day: Number(f.dueDay) || 5,
        installment_amount: Number(f.installmentAmount) || 0,
      });
      setState({ screen: 'debtList', returnScreen: 'debtList' });
      await loadAll();
      showToast('เพิ่มหนี้ใหม่แล้ว');
    } catch (e) { showToast(e.message || 'บันทึกไม่สำเร็จ'); }
  }

  async function editDebtSubmit() {
    const f = S.forms;
    const total = Number(f.total) || 0;
    if (!f.name.trim() || !total) { showToast('กรอกชื่อและยอดหนี้ให้ครบ'); return; }
    try {
      await Api.updateDebt({
        id: S.editingDebtId, name: f.name.trim(), total_amount: total,
        remaining_amount: Number(f.remaining) || 0,
        due_day: Number(f.dueDay) || 5,
        installment_amount: Number(f.installmentAmount) || 0,
      });
      setState({ screen: 'debtDetail', editingDebtId: null });
      await refreshDebtDetail(S.selectedDebtId);
      await loadAll();
      showToast('บันทึกการแก้ไขแล้ว');
    } catch (e) { showToast(e.message || 'บันทึกไม่สำเร็จ'); }
  }

  async function closeDebt(id) {
    if (!confirm('ยืนยันว่าปิดหนี้นี้แล้ว (ชำระครบแล้ว)?')) return;
    try {
      await Api.closeDebt(id);
      setState({ screen: 'debtList', returnScreen: 'debtList', editingDebtId: null });
      await loadAll();
      showToast('ปิดหนี้แล้ว');
    } catch (e) { showToast(e.message || 'ปิดหนี้ไม่สำเร็จ'); }
  }

  async function deleteDebt(id) {
    if (!confirm('ยืนยันลบหนี้นี้ถาวร? ข้อมูลงวดผ่อนทั้งหมดจะหายไปด้วย')) return;
    try {
      await Api.deleteDebt(id);
      setState({ screen: 'debtList', returnScreen: 'debtList', editingDebtId: null });
      await loadAll();
      showToast('ลบหนี้แล้ว');
    } catch (e) { showToast(e.message || 'ลบไม่สำเร็จ'); }
  }

  // Custom period: user types a raw day count (e.g. 10, 20, 45) instead of picking a preset —
  // resolves to the same {unit:'day', value:N} shape the presets use, so renewals/notifications
  // treat it identically (renew again N days later, repeating). The first due date is always
  // whatever's in the date field — presets fill it in as a default (today + period) when
  // clicked, but it stays editable, since the actual first due date (set by the pawnshop) may
  // not fall exactly N days from today, especially when entering a ticket pawned in the past.
  function resolvePawnPeriod(f) {
    // Jewelry has no period/due-date UI at all — due date is always pawn_date+5 months,
    // computed here rather than picked, since the monthly interest model replaced renewal.
    if (f.category === 'jewelry') {
      const pawnDate = f.pawnDate || todayISO();
      return { unit: null, value: null, dueDate: addMonths(pawnDate, 5) };
    }
    if (f.pawnPeriod === 'custom') {
      const days = Number(f.pawnCustomDays) || 0;
      if (days <= 0) return null;
      return { unit: 'day', value: days, dueDate: f.dueDate };
    }
    const opt = PERIOD_OPTIONS.find((o) => o.key === f.pawnPeriod);
    if (!opt) return null;
    return { unit: opt.unit, value: opt.value, dueDate: f.dueDate };
  }

  async function addPawnSubmit() {
    const f = S.forms;
    const amount = Number(f.amount) || 0;
    if (!f.itemName.trim() || !amount) { showToast('กรอกข้อมูลตั๋วจำนำให้ครบ'); return; }
    const period = resolvePawnPeriod(f);
    if (!period || !period.dueDate) { showToast('กรอกข้อมูลตั๋วจำนำให้ครบ (เลือกวันครบกำหนดงวดแรก)'); return; }
    try {
      await Api.createPawn({
        item_name: f.itemName.trim(), shop_name: f.shop.trim(), ticket_code: f.ticketCode.trim(),
        category: f.category, amount, interest: f.interest !== '' ? Number(f.interest) : null,
        due_date: period.dueDate, period_unit: period.unit, period_value: period.value,
        pawn_date: f.pawnDate || todayISO(), renew_url: f.renewUrl.trim() || null,
      });
      setState({ screen: 'pawnList', returnScreen: 'pawnList' });
      await loadAll();
      showToast('เพิ่มตั๋วจำนำแล้ว');
    } catch (e) { showToast(e.message || 'บันทึกไม่สำเร็จ'); }
  }

  async function editPawnSubmit() {
    const f = S.forms;
    const amount = Number(f.amount) || 0;
    if (!f.itemName.trim() || !amount) { showToast('กรอกข้อมูลตั๋วจำนำให้ครบ'); return; }
    const period = resolvePawnPeriod(f);
    if (!period || !period.dueDate) { showToast('กรอกข้อมูลตั๋วจำนำให้ครบ (เลือกวันครบกำหนดงวดแรก)'); return; }
    try {
      await Api.updatePawn({
        id: S.editingPawnId, item_name: f.itemName.trim(), shop_name: f.shop.trim(),
        ticket_code: f.ticketCode.trim(), category: f.category, amount,
        interest: f.interest !== '' ? Number(f.interest) : null,
        due_date: period.dueDate, period_unit: period.unit, period_value: period.value,
        pawn_date: f.pawnDate || todayISO(), renew_url: f.renewUrl.trim() || null,
      });
      setState({ screen: 'pawnList', returnScreen: 'pawnList', editingPawnId: null });
      await loadAll();
      showToast('บันทึกการแก้ไขแล้ว');
    } catch (e) { showToast(e.message || 'บันทึกไม่สำเร็จ'); }
  }

  async function deletePawnAction(id) {
    if (!confirm('ยืนยันลบตั๋วจำนำนี้ถาวร?')) return;
    try {
      await Api.deletePawn(id);
      setState({ screen: 'pawnList', returnScreen: 'pawnList', editingPawnId: null });
      await loadAll();
      showToast('ลบตั๋วจำนำแล้ว');
    } catch (e) { showToast(e.message || 'ลบไม่สำเร็จ'); }
  }

  function setExpenseType(type) { setForms({ expenseType: type }); }

  async function addExpenseSubmit() {
    const f = S.forms;
    const isFixed = f.expenseType !== 'variable';
    const amount = Number(f.expenseAmount) || 0;
    if (!f.expenseName.trim() || (isFixed && !amount)) { showToast('กรอกชื่อและยอดค่าใช้จ่ายให้ครบ'); return; }
    try {
      await Api.createExpense({
        name: f.expenseName.trim(), expense_type: f.expenseType,
        amount: isFixed ? amount : undefined, due_day: Number(f.expenseDueDay) || 5,
      });
      setState({ screen: 'expenses', returnScreen: 'dashboard' });
      await loadAll();
      showToast('เพิ่มค่าใช้จ่ายประจำแล้ว');
    } catch (e) { showToast(e.message || 'บันทึกไม่สำเร็จ'); }
  }

  // Fixed-amount expenses mark paid immediately; variable ones (water/electric/internet)
  // need the actual bill amount entered first, since it changes every month.
  function markExpensePaid(id, expenseType) {
    if (expenseType === 'variable') {
      setState({ expensePayFor: S.expensePayFor === id ? null : id, forms: { ...S.forms, expensePayAmount: '' } });
      return;
    }
    submitMarkExpensePaid(id);
  }

  function submitMarkExpensePaid(id, amount) {
    return runAction('expense:' + id, async () => {
      try {
        const res = await Api.markExpensePaid(id, amount);
        const exp = S.expenses.find((e) => e.id === id);
        if (exp) {
          exp.paid_this_month = true; exp.last_amount = res.amount;
          exp.payments = { ...(exp.payments || {}), [res.month]: { amount: res.amount, paid_at: res.paid_at } };
        }
        Object.assign(S, { expensePayFor: null, forms: { ...S.forms, expensePayAmount: '' } });
        showToast('บันทึกว่าจ่ายแล้ว');
        await refreshReport();
      } catch (e) { showToast(e.message || 'บันทึกไม่สำเร็จ'); }
    });
  }

  function confirmExpensePay(id) {
    const amount = Number(S.forms.expensePayAmount) || 0;
    if (!amount) { showToast('กรุณากรอกยอดที่จ่าย'); return; }
    submitMarkExpensePaid(id, amount);
  }

  // Landing back on 'expenses' needs its own back button re-armed (it always comes from the
  // dashboard) — otherwise it's still pointed at whatever screen we just left, and pressing
  // back there would just reopen the settings screen we came from.
  function backToExpenseList(target) {
    return target === 'expenses' ? { screen: 'expenses', returnScreen: 'dashboard' } : { screen: target };
  }

  async function deleteExpense(id) {
    try {
      await Api.deleteExpense(id);
      S.expenses = S.expenses.filter((e) => e.id !== id);
      if (S.screen === 'expenseSettings') {
        setState({ ...backToExpenseList(S.returnScreen || 'expenses'), editingExpenseId: null });
      } else {
        render();
      }
      showToast('ลบค่าใช้จ่ายแล้ว');
      refreshReport();
    } catch (e) { showToast('ลบไม่สำเร็จ'); }
  }

  function openExpenseSettings(id, from) {
    const e = S.expenses.find((x) => x.id === id);
    if (!e) return;
    setState({
      screen: 'expenseSettings', editingExpenseId: id, returnScreen: from || 'expenses',
      forms: {
        ...S.forms, expenseName: e.name, expenseType: e.expense_type,
        expenseAmount: e.expense_type === 'fixed' ? String(e.amount) : '',
        expenseDueDay: String(e.due_day),
      },
    });
  }

  async function editExpenseSubmit() {
    const f = S.forms;
    const isFixed = f.expenseType !== 'variable';
    const amount = Number(f.expenseAmount) || 0;
    if (!f.expenseName.trim() || (isFixed && !amount)) { showToast('กรอกชื่อและยอดค่าใช้จ่ายให้ครบ'); return; }
    try {
      await Api.updateExpense({
        id: S.editingExpenseId, name: f.expenseName.trim(), expense_type: f.expenseType,
        amount: isFixed ? amount : undefined, due_day: Number(f.expenseDueDay) || 5,
      });
      setState({ ...backToExpenseList(S.returnScreen || 'expenses'), editingExpenseId: null });
      await loadAll();
      showToast('บันทึกการแก้ไขแล้ว');
    } catch (e) { showToast(e.message || 'บันทึกไม่สำเร็จ'); }
  }

  async function setWarnDays(n) {
    setState({ warnDays: n });
    try { await Api.updateSettings({ warn_days: n }); } catch (e) { /* keep optimistic value */ }
  }

  // ---------------- Google Calendar feed ----------------
  function calendarFeedUrl() {
    return S.calendarToken ? `${location.origin}/cal/${S.calendarToken}.ics` : '';
  }
  function createCalendarLink() {
    return runAction('calendar', async () => {
      try {
        const token = await Api.ensureCalendarToken();
        S.calendarToken = token;
        showToast('สร้างลิงก์แล้ว — ปฏิทินจะพร้อมภายใน 3 ชั่วโมง');
      } catch (e) { showToast('สร้างลิงก์ไม่สำเร็จ: ' + (e.message || '')); }
    });
  }
  async function copyCalendarLink() {
    const url = calendarFeedUrl();
    try {
      await navigator.clipboard.writeText(url);
      showToast('คัดลอกลิงก์ปฏิทินแล้ว');
    } catch (e) {
      window.prompt('คัดลอกลิงก์นี้', url);
    }
  }

  // ---------------- Excel export ----------------
  // ExcelJS is the one library that can write real cell styling (fills, fonts, column
  // widths) in the browser — loaded on demand from a CDN so it doesn't bloat every page
  // load for a feature most visits won't use.
  let exceljsLoadPromise = null;
  function loadExcelJS() {
    if (window.ExcelJS) return Promise.resolve();
    if (exceljsLoadPromise) return exceljsLoadPromise;
    exceljsLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
      script.onload = () => resolve();
      script.onerror = () => { exceljsLoadPromise = null; reject(new Error('โหลดตัวสร้างไฟล์ Excel ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่')); };
      document.head.appendChild(script);
    });
    return exceljsLoadPromise;
  }

  async function exportReportToExcel() {
    showToast('กำลังสร้างไฟล์ Excel...');
    try {
      await loadExcelJS();
      const wb = new ExcelJS.Workbook();
      wb.creator = 'หนี้สิน & ตั๋วจำนำ';
      wb.created = new Date();

      const BRAND = 'FF1428A0';
      const HEADER_FONT = { color: { argb: 'FFFFFFFF' }, bold: true, size: 12 };
      const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
      const BORDER = { style: 'thin', color: { argb: 'FFDDE3EE' } };
      const CELL_BORDER = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
      function styleHeaderRow(row) {
        row.eachCell((cell) => {
          cell.font = HEADER_FONT;
          cell.fill = HEADER_FILL;
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.border = CELL_BORDER;
        });
        row.height = 22;
      }
      function styleDataRow(row) {
        row.eachCell((cell) => { cell.border = CELL_BORDER; cell.alignment = { vertical: 'middle' }; });
      }
      function setWidths(sheet, widths) { sheet.columns.forEach((col, i) => { col.width = widths[i]; }); }

      // สรุปภาพรวม
      const r = S.report || {};
      const sSum = wb.addWorksheet('สรุปภาพรวม');
      sSum.mergeCells('A1:B1');
      sSum.getCell('A1').value = `รายงานภาพรวม — ${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}`;
      sSum.getCell('A1').font = { bold: true, size: 14, color: { argb: BRAND } };
      sSum.addRow([]);
      styleHeaderRow(sSum.addRow(['รายการ', 'ยอด (บาท)']));
      [
        ['ยอดหนี้สิน', r.total_debt || 0],
        ['ยอดตั๋วจำนำ', r.total_pawn || 0],
        ['ค่าใช้จ่ายประจำต่อเดือน', r.total_recurring || 0],
        ['ต้องชำระเดือนนี้', r.total_due_this_month || 0],
      ].forEach(([label, amt]) => {
        const row = sSum.addRow([label, amt]);
        row.getCell(2).numFmt = '#,##0.00';
        styleDataRow(row);
      });
      setWidths(sSum, [30, 18]);

      if (S.debts.length) {
        const sD = wb.addWorksheet('หนี้สิน');
        styleHeaderRow(sD.addRow(['ชื่อหนี้', 'ยอดทั้งหมด', 'ยอดคงเหลือ', 'ผ่อนแล้ว', 'จ่ายทุกวันที่', 'ยอดผ่อนต่อเดือน']));
        S.debts.forEach((d) => {
          const paidPercent = d.total_amount ? (d.total_amount - d.remaining_amount) / d.total_amount : 0;
          const row = sD.addRow([d.name, d.total_amount, d.remaining_amount, paidPercent, d.due_day, d.installment_amount || 0]);
          row.getCell(2).numFmt = '#,##0.00'; row.getCell(3).numFmt = '#,##0.00';
          row.getCell(4).numFmt = '0%'; row.getCell(6).numFmt = '#,##0.00';
          styleDataRow(row);
        });
        setWidths(sD, [26, 16, 16, 12, 14, 18]);
      }

      PAWN_CATEGORIES.forEach((c) => {
        const items = S.pawns.filter((p) => p.category === c.key);
        if (!items.length) return;
        const sP = wb.addWorksheet(`ตั๋ว-${c.label}`.slice(0, 31));
        styleHeaderRow(sP.addRow(['ชื่อสินค้า', 'ร้านจำนำ', 'เลขที่ตั๋ว', 'ยอดเงินต้น', 'ดอกเบี้ย', 'วันที่จำนำ', 'วันครบกำหนด', 'ลิงก์ต่อดอก']));
        items.forEach((p) => {
          const row = sP.addRow([
            p.item_name, p.shop_name || '-', p.ticket_code || '-', p.amount, p.interest || 0,
            p.pawn_date ? formatDate(p.pawn_date) : formatDate((p.created_at || '').slice(0, 10)),
            formatDate(p.due_date), p.renew_url || '-',
          ]);
          row.getCell(4).numFmt = '#,##0.00'; row.getCell(5).numFmt = '#,##0.00';
          styleDataRow(row);
        });
        setWidths(sP, [24, 18, 14, 14, 12, 14, 14, 32]);
      });

      if (S.expenses.length) {
        const sE = wb.addWorksheet('ค่าใช้จ่ายประจำ');
        styleHeaderRow(sE.addRow(['ชื่อ', 'ประเภท', 'ยอด / ยอดล่าสุด', 'จ่ายทุกวันที่', 'สถานะเดือนนี้']));
        S.expenses.forEach((e) => {
          const amt = e.expense_type === 'fixed' ? e.amount : (e.last_amount ?? 0);
          const row = sE.addRow([e.name, e.expense_type === 'fixed' ? 'ยอดคงที่' : 'ไม่คงที่', amt, e.due_day, e.paid_this_month ? 'จ่ายแล้ว' : 'ยังไม่จ่าย']);
          row.getCell(3).numFmt = '#,##0.00';
          styleDataRow(row);
        });
        setWidths(sE, [24, 14, 18, 14, 16]);
      }

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `รายงาน-หนี้สินตั๋วจำนำ-${todayISO()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      showToast('ดาวน์โหลดไฟล์ Excel แล้ว');
    } catch (e) {
      showToast(e.message || 'สร้างไฟล์ Excel ไม่สำเร็จ');
    }
  }

  // No server ever sends a real push (see README) — this just proves the browser/OS side of
  // notifications works on this device, triggered locally right here, right now.
  async function testNotification() {
    if (!('Notification' in window)) { showToast('เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน'); return; }
    if (Notification.permission === 'denied') {
      showToast('การแจ้งเตือนถูกปิดไว้ — ไปเปิดเองที่การตั้งค่าเบราว์เซอร์/แอปของเครื่อง');
      return;
    }
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') { showToast('ไม่ได้รับอนุญาตให้แจ้งเตือน'); return; }

    const title = 'ทดสอบการแจ้งเตือน 🔔';
    const body = 'ถ้าเห็นข้อความนี้บนมือถือ แปลว่าการแจ้งเตือนทำงานได้จริง';
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, { body, icon: 'icons/icon.svg' });
      } else {
        new Notification(title, { body, icon: 'icons/icon.svg' });
      }
      showToast('ส่งแจ้งเตือนทดสอบแล้ว ลองดูที่มือถือ');
    } catch (e) { showToast('ส่งแจ้งเตือนไม่สำเร็จ: ' + (e.message || '')); }
  }

  async function refreshPushStatus() {
    try {
      S.pushStatus = await Api.getPushStatus();
      S.pushLog = await Api.readPushLog();
      render();
      Api.reportDeviceState(S.pushStatus, S.pushLog);
    } catch (e) { /* leave as-is */ }
  }
  // The failure is kept on screen, not just flashed as a toast: this runs on a phone that
  // isn't in front of us, so when it goes wrong the message has to survive long enough to
  // be read back.
  function enablePushAction() {
    return runAction('push', async () => {
      S.pushError = null;
      try {
        await Api.enablePush();
        showToast('เปิดแจ้งเตือนอัตโนมัติแล้ว');
      } catch (e) {
        S.pushError = (e && (e.code ? e.code + ' — ' : '') + (e.message || e)) || 'ไม่ทราบสาเหตุ';
        showToast('เปิดไม่สำเร็จ');
      }
      S.pushStatus = await Api.getPushStatus();
    });
  }
  function disablePushAction() {
    return runAction('push', async () => {
      try {
        await Api.disablePush();
        showToast('ปิดแจ้งเตือนอัตโนมัติแล้ว');
      } catch (e) { showToast(e.message || 'ปิดไม่สำเร็จ'); }
      S.pushStatus = await Api.getPushStatus();
    });
  }

  function openNotifications() {
    setState({ screen: 'notifications', returnScreen: 'dashboard' });
    loadNotifications();
  }
  async function markNotifRead(id) {
    const n = S.notifications.find((x) => x.id === id);
    if (n && !n.read_at) {
      n.read_at = new Date().toISOString();
      S.unreadCount = Math.max(0, S.unreadCount - 1);
      render();
      try { await Api.markNotificationRead(id); } catch (e) { /* keep optimistic */ }
    }
  }
  async function markAllNotifsRead() {
    S.notifications.forEach((n) => { n.read_at = n.read_at || new Date().toISOString(); });
    S.unreadCount = 0;
    render();
    try { await Api.markAllNotificationsRead(); } catch (e) { /* keep optimistic */ }
  }

  // ---------------- Render ----------------
  // Every render replaces the whole tree, which recreates the scroll containers at scrollTop 0 —
  // so tapping ต่อดอก halfway down the list (which re-renders to show "กำลังบันทึก...") threw the
  // page back to the top. Positions are carried across a re-render of the same screen; moving to
  // a different screen still starts at the top, as navigation should.
  const SCROLLERS = ['.content-inner', '.modal-sheet'];
  let lastRenderedScreen = null;
  function render() {
    const sameScreen = S.screen === lastRenderedScreen;
    const saved = sameScreen ? SCROLLERS.map((sel) => { const el = app.querySelector(sel); return el ? el.scrollTop : 0; }) : null;
    app.innerHTML = S.screen === 'login' ? renderLogin() : renderApp();
    lastRenderedScreen = S.screen;
    if (saved) SCROLLERS.forEach((sel, i) => { const el = app.querySelector(sel); if (el && saved[i]) el.scrollTop = saved[i]; });
  }

  function toastHtml() { return S.toast ? `<div class="toast">${esc(S.toast)}</div>` : ''; }

  function renderLogin() {
    return `
    <div class="lock-screen">
      <div style="display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:20px">
        <div class="brand-mark" style="margin-bottom:8px">Debt · Pawn Tracker</div>
        <div class="lock-icon">${svgLock()}</div>
        <div class="lock-title">พิมพ์ชื่อผู้ใช้เพื่อเข้าแอป</div>
        <div class="lock-sub">not หรือ lek</div>
        <div class="lock-error">${esc(S.loginError)}</div>
      </div>
      <div style="padding:24px;display:flex;flex-direction:column;gap:14px">
        <input class="field-input" data-bind="loginUsername" value="${esc(S.forms.loginUsername)}" placeholder="ชื่อผู้ใช้" autocapitalize="off" autocomplete="off"/>
        <button class="submit-btn" style="background:#fff;color:#1428A0;box-shadow:0 8px 20px rgba(0,0,0,0.2)" data-action="submit-login" ${S.busy ? 'disabled' : ''}>เข้าแอป</button>
      </div>
      ${toastHtml()}
    </div>`;
  }

  function renderApp() {
    const isMainTab = ['dashboard', 'manage', 'history', 'settings'].includes(S.screen);
    const showBack = ['debtDetail', 'debtSettings', 'pawnSettings', 'expenseSettings', 'addEdit', 'notifications', 'debtList', 'pawnList', 'expenses'].includes(S.screen);
    const showFab = ['dashboard', 'debtList', 'pawnList', 'expenses'].includes(S.screen);

    return `
      <div class="header${S.screen === 'dashboard' ? ' brand' : ''}">
        ${showBack ? `<button class="icon-btn" data-action="back">${svgBack('#141B34')}</button>` : ''}
        ${headerCenter()}
      </div>
      <div class="content-scroll">
        <div class="content-inner">
          ${S.busy ? '<div class="loading-overlay"><div class="spinner"></div></div>' : ''}
          ${screenBody()}
        </div>
        ${showFab ? renderFab() : ''}
        ${S.toast ? `<div class="toast">${esc(S.toast)}</div>` : ''}
      </div>
      ${renderPawnDetailModal()}
      ${isMainTab ? renderBottomNav() : ''}
    `;
  }

  function headerCenter() {
    if (S.screen === 'dashboard') {
      const isAdmin = S.realUser && S.realUser.is_admin;
      const viewingOther = S.currentUser && S.realUser && S.currentUser.id !== S.realUser.id;
      const userMenu = (isAdmin && S.userMenuOpen) ? `
        <div class="fab-menu" style="position:absolute;top:44px;right:0;z-index:20">
          ${S.switchableUsers.map((u) => `<div class="fab-menu-item" data-action="switch-user" data-id="${u.id}" style="${u.id === S.currentUser.id ? 'font-weight:700;color:#1428A0' : ''}">${u.id === S.currentUser.id ? '✓ ' : ''}${esc(u.username)}${u.is_admin ? ' (แอดมิน)' : ''}</div>`).join('')}
        </div>` : '';
      return `
        <div style="flex:1">
          <div class="brand-mark">Debt · Pawn</div>
          <div class="header-greeting">สวัสดี 👋 ${esc((S.currentUser || {}).username || '')}${viewingOther ? ' <span style="color:#FFD58A">(กำลังดูของคนอื่น)</span>' : ''}</div>
          <div class="header-title-lg">ภาพรวมของคุณ</div>
        </div>
        <div style="display:flex;align-items:center;gap:2px;position:relative">
          ${isAdmin ? `<button class="icon-btn" data-action="toggle-user-menu">${svgSwap('#fff')}</button>` : ''}
          <button class="icon-btn" style="position:relative" data-action="open-notifications">${svgBell('#fff')}${S.unreadCount ? `<span style="position:absolute;top:4px;right:4px;background:#D64545;color:#fff;border:1.5px solid #1428A0;border-radius:50%;min-width:16px;height:16px;font-size:10px;display:flex;align-items:center;justify-content:center;padding:0 3px">${S.unreadCount}</span>` : ''}</button>
          <button class="icon-btn" data-action="logout">${svgLogout('#fff')}</button>
          ${userMenu}
        </div>`;
    }
    const addTypeTitle = { debt: 'เพิ่มหนี้ใหม่', pawn: 'เพิ่มตั๋วจำนำใหม่', expense: 'เพิ่มค่าใช้จ่ายประจำ' };
    const titleMap = {
      debtList: 'หนี้สินทั้งหมด', settings: 'ตั้งค่า',
      pawnList: S.pawnFilter === 'jewelry' ? 'ตั๋วจำนำ — ทอง' : S.pawnFilter === 'nonjewelry' ? 'ตั๋วจำนำ — อิเล็กทรอนิก' : 'ตั๋วจำนำ',
      expenses: 'ค่าใช้จ่ายประจำต่อเดือน', manage: 'จัดการ', history: 'ประวัติ',
      debtDetail: (S.debts.find((d) => d.id === S.selectedDebtId) || {}).name || 'รายละเอียดหนี้',
      debtSettings: 'ตั้งค่าหนี้',
      pawnSettings: 'ตั้งค่าตั๋วจำนำ',
      expenseSettings: 'ตั้งค่าค่าใช้จ่าย',
      notifications: 'การแจ้งเตือน',
      addEdit: addTypeTitle[S.addType] || 'เพิ่มรายการใหม่',
    };
    const cls = ['debtList', 'pawnList', 'settings', 'expenses', 'manage', 'history'].includes(S.screen) ? 'header-title-md' : 'header-title';
    const trailing = S.screen === 'debtDetail'
      ? `<button class="icon-btn" data-action="open-debt-settings" data-id="${S.selectedDebtId}">${svgGear('#141B34')}</button>`
      : (S.screen === 'notifications' && S.unreadCount ? `<button class="mark-paid-btn" style="padding:6px 10px;font-size:12px" data-action="mark-all-read">อ่านทั้งหมด</button>` : '');
    return `<div class="${cls}" style="flex:1">${esc(titleMap[S.screen] || '')}</div>${trailing}`;
  }

  function screenBody() {
    switch (S.screen) {
      case 'dashboard': return renderDashboard();
      case 'manage': return renderManage();
      case 'history': return renderHistory();
      case 'debtList': return renderDebtList();
      case 'debtDetail': return renderDebtDetail();
      case 'debtSettings': return renderDebtSettings();
      case 'pawnList': return renderPawnList();
      case 'pawnSettings': return renderPawnSettings();
      case 'expenseSettings': return renderExpenseSettings();
      case 'expenses': return renderExpenses();
      case 'addEdit': return renderAddEdit();
      case 'settings': return renderSettings();
      case 'notifications': return renderNotifications();
      default: return '';
    }
  }

  // One tone per dashboard tile: the fill gradient, the ink on it, and a shadow in the same
  // hue — the calendar's day cells are built from these same four families.
  const STAT_TONES = {
    debt: { grad: 'linear-gradient(150deg, #EDF2FF 0%, #DAE5FC 100%)', fg: '#12309B', shadow: 'rgba(20,40,160,0.16)' },
    expense: { grad: 'linear-gradient(150deg, #FFF6E7 0%, #FBE6C2 100%)', fg: '#92600A', shadow: 'rgba(146,96,10,0.16)' },
    jewelry: { grad: 'linear-gradient(150deg, #FCF3DC 0%, #F4E2AC 100%)', fg: '#8A6A12', shadow: 'rgba(184,134,47,0.2)' },
    electronics: { grad: 'linear-gradient(150deg, #E7F5FC 0%, #C8E8F7 100%)', fg: '#0A6E96', shadow: 'rgba(10,110,150,0.2)' },
  };

  function renderDashboard() {
    const r = S.report;
    if (!r) return `<div class="screen-pad"><div class="empty-card"><div class="empty-text">กำลังโหลด...</div></div></div>`;

    // Same tinted-gradient-plus-coloured-shadow language as the calendar cells, so the tiles
    // read as part of it. `cat` makes the tile a shortcut into the pawn list for that category.
    const stat = (icon, label, amount, tone, sub, cat) => `
      <div class="report-stat" style="background:${tone.grad};box-shadow:0 6px 16px ${tone.shadow}${cat ? ';cursor:pointer' : ''}" ${cat ? `data-action="goto-pawn-cat" data-cat="${cat}"` : ''}>
        <div class="report-stat-top">
          <span class="report-stat-icon">${icon}</span>
          <span class="report-stat-label" style="color:${tone.fg}">${label}</span>
          ${cat ? `<span class="report-stat-go" style="color:${tone.fg}">›</span>` : ''}
        </div>
        <div class="report-stat-amount" style="color:${tone.fg}">฿${formatMoney(amount)}</div>
        ${sub ? `<div class="report-stat-sub" style="color:${tone.fg}">${sub}</div>` : ''}
      </div>`;

    // Jewelry and electronics get their own cards (replacing the single combined pawn card):
    // each shows principal on top with the interest owed underneath, since that's the number
    // actually due each cycle and the two categories accrue it on completely different rules.
    const urgentCount = r.breakdown.filter((it) => daysUntil(it.due_date) <= 2).length;
    const hero = `
      <div class="dash-hero-wrap">
        <div class="hero-card">
          <div class="hero-label">ต้องชำระเดือนนี้ (รวมทุกหมวด)</div>
          <div class="hero-amount">฿${formatMoney(r.total_due_this_month)}</div>
          <div class="hero-meta">
            <span class="hero-chip">${r.breakdown.length} รายการ</span>
            ${urgentCount ? `<span class="hero-chip alert">⚠️ ด่วน ${urgentCount} รายการ</span>` : `<span class="hero-chip">✓ ไม่มีรายการด่วน</span>`}
            <span class="hero-chip">หนี้คงเหลือ ฿${formatMoney(r.total_debt)}</span>
          </div>
        </div>
      </div>`;
    const stats = `
      <div class="report-grid">
        ${stat('📋', 'ยอดหนี้สิน', r.total_debt, STAT_TONES.debt)}
        ${stat('🧾', 'ค่าใช้จ่ายประจำ', r.total_recurring, STAT_TONES.expense, 'ต่อเดือน')}
        ${stat('💍', 'ตั๋วทอง', r.total_pawn_jewelry, STAT_TONES.jewelry, `${r.count_pawn_jewelry} ใบ · ดอก ฿${formatMoney(r.interest_jewelry)}`, 'jewelry')}
        ${stat('📱', 'ตั๋วอิเล็กทรอนิก', r.total_pawn_other, STAT_TONES.electronics, `${r.count_pawn_other} ใบ · ดอก ฿${formatMoney(r.interest_other)}`, 'nonjewelry')}
      </div>`;

    // Overdue or due within 2 days is treated as needing action right now, split into its own
    // "ครบกำหนดชำระ (ด่วน)" section above the regular monthly list so it can't get buried among
    // items that still have weeks to go.
    const urgent = r.breakdown.filter((it) => daysUntil(it.due_date) <= 2);
    const normal = r.breakdown.filter((it) => daysUntil(it.due_date) > 2);

    return `
      <div class="screen-pad">
        ${hero}
        ${renderPayCalendar()}
        ${stats}
        ${urgent.length ? `
          <div class="section-title danger">⚠️ ครบกำหนดชำระ (ด่วน)</div>
          ${renderDueGroups(urgent)}
        ` : ''}
        <div class="section-title">รายการที่ต้องชำระเดือนนี้</div>
        ${normal.length ? renderDueGroups(normal) : (urgent.length ? '' : `
          <div class="empty-card"><div class="empty-emoji">✅</div><div class="empty-text">ชำระครบทุกรายการของเดือนนี้แล้ว</div></div>`)}
      </div>`;
  }

  // ---------------- Dashboard payment calendar ----------------
  // A month grid whose only content per day is the money leaving the pocket that day — the
  // existing report below it still carries the per-item detail. Dates come from Rules so the
  // grid, the push notifications and the Google Calendar feed can never disagree about what
  // is due when. Tapping a day expands the items making up that day's total.
  const THAI_WEEKDAYS_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

  function calMonthStr() { return S.calMonth || todayISO().slice(0, 7); }
  function shiftCalMonth(delta) {
    const [y, m] = calMonthStr().split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    // The selected day belongs to the month that was open, so it is cleared on every move
    // rather than left pointing at a day the new grid doesn't show.
    setState({ calMonth: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, calSelected: null });
  }
  function calGoToday() { setState({ calMonth: todayISO().slice(0, 7), calSelected: todayISO() }); }
  function selectCalDay(date) { setState({ calSelected: S.calSelected === date ? null : date }); }

  // Amounts have to fit seven-across on a phone, so thousands collapse to 1.2K / 45.5K / 450K
  // and millions to 1.2M. Under a thousand is always exact — those are the sums that tend to
  // be read as "is that 900 or 9,000?" when abbreviated.
  function compactMoney(n) {
    const v = Math.round(n || 0);
    if (v >= 1000000) return String((v / 1000000).toFixed(1)).replace(/\.0$/, '') + 'M';
    if (v >= 100000) return Math.round(v / 1000) + 'K';
    if (v >= 1000) return String((v / 1000).toFixed(1)).replace(/\.0$/, '') + 'K';
    return String(v);
  }

  // Same colour coding as the rest of the app: blue = หนี้, gold = ตั๋วทอง, sky = อิเล็กทรอนิก,
  // amber = ค่าใช้จ่ายประจำ. `grad` is the cell/pill sheen built from that same hue.
  const PAY_LEGEND = [
    { label: 'งวดผ่อน', short: 'งวดผ่อน', color: '#1428A0', bg: '#E8EEFB', cell: ['#E6EDFF', '#D2E0FB'], text: '#12309B' },
    { label: 'ตั๋วทอง', short: 'ตั๋วทอง', color: '#B8862F', bg: '#FBF0D2', cell: ['#FCF2D8', '#F4E1AC'], text: '#8A6A12' },
    { label: 'ตั๋วอิเล็กทรอนิก', short: 'อิเล็กทรอนิก', color: '#0A8BC2', bg: '#E0F3FA', cell: ['#E2F4FB', '#C6E7F6'], text: '#0A6E96' },
    { label: 'ค่าใช้จ่ายประจำ', short: 'ค่าใช้จ่าย', color: '#B8791A', bg: '#FFF3DD', cell: ['#FFF4DF', '#FBE4BA'], text: '#92600A' },
  ];
  function payKindMeta(it) {
    if (it.kind === 'installment') return PAY_LEGEND[0];
    if (it.kind === 'expense') return PAY_LEGEND[3];
    if (it.category === 'jewelry') return PAY_LEGEND[1];
    return PAY_LEGEND[2];
  }

  function formatDateLong(iso) {
    const d = new Date(iso + 'T00:00:00');
    return `วัน${THAI_WEEKDAYS_FULL[d.getDay()]}ที่ ${d.getDate()} ${THAI_MONTHS_FULL[d.getMonth()]} ${d.getFullYear() + 543}`;
  }

  function renderPayCalRow(it) {
    const meta = payKindMeta(it);
    const open = it.kind === 'pawn'
      ? `data-action="open-pawn-detail" data-id="${it.ref_id}"`
      : it.kind === 'installment' && it.debt_id
      ? `data-action="open-debt" data-id="${it.debt_id}" data-from="dashboard"`
      : '';
    return `
      <div class="pay-row" ${open} style="background:linear-gradient(115deg, ${meta.bg} 0%, #fff 62%);border-color:${meta.bg}${open ? ';cursor:pointer' : ''}">
        <span class="pay-row-bar" style="background:${meta.color}"></span>
        <div style="flex:1;min-width:0">
          <div class="pay-row-title">${esc(it.title)}</div>
          <div class="pay-row-note"><span class="near-kind" style="background:${meta.bg};color:${meta.color}">${meta.label}</span> ${esc(it.note)}</div>
        </div>
        <div class="pay-row-amt">${it.estimated ? '~' : ''}฿${formatMoney(it.amount)}</div>
      </div>`;
  }

  function renderPayCalendar() {
    // An old cached rules.js (offline, before the service worker refreshes) drops the
    // calendar instead of taking the whole dashboard down with a missing-function error.
    if (typeof Rules === 'undefined' || !Rules.buildPaymentCalendar) return '';
    const month = calMonthStr();
    const [y, m] = month.split('-').map(Number);
    const todayStr = todayISO();
    const cal = Rules.buildPaymentCalendar({
      debts: S.debts, pawns: S.pawns, expenses: S.expenses, month, todayStr,
    });
    const byDay = {};
    cal.items.forEach((it) => { (byDay[it.date] = byDay[it.date] || []).push(it); });

    const startWeekday = new Date(y, m - 1, 1).getDay();
    const lastDay = new Date(y, m, 0).getDate();
    let cells = '';
    for (let i = 0; i < startWeekday; i++) cells += `<span class="pay-cell empty"></span>`;
    for (let d = 1; d <= lastDay; d++) {
      const date = `${month}-${String(d).padStart(2, '0')}`;
      const items = byDay[date] || [];
      const sum = items.reduce((a, it) => a + (it.amount || 0), 0);
      const overdue = !!items.length && date < todayStr;
      const selected = date === S.calSelected;
      const cls = ['pay-cell'];
      if (items.length) cls.push('has-due');
      if (overdue) cls.push('overdue');
      if (date === todayStr) cls.push('today');
      if (selected) cls.push('selected');
      // A day owing only one kind of thing is tinted in that kind's own colour — a gold day
      // reads as "ตั๋วทอง" before the number is even read. Mixed days stay blue, and red
      // (overdue) or the selected day's solid blue always win over the category tint.
      const kinds = new Set(items.map((it) => payKindMeta(it).label));
      const tone = kinds.size === 1 && !overdue && !selected ? payKindMeta(items[0]) : null;
      const style = tone ? ` style="background:linear-gradient(160deg,${tone.cell[0]} 0%,${tone.cell[1]} 100%);color:${tone.text}"` : '';
      // A day with nothing owed is not a button: there is nothing to open, and making the
      // whole month tappable would hide which days actually carry money.
      const tag = items.length ? 'button' : 'span';
      const attrs = items.length ? ` type="button" data-action="pay-cal-day" data-date="${date}"` : '';
      const dots = items.slice(0, 3).map((it) => `<i style="background:${payKindMeta(it).color}"></i>`).join('');
      cells += `<${tag} class="${cls.join(' ')}"${attrs}${style}>
          <span class="pay-cell-day">${d}</span>
          ${items.length ? `<span class="pay-cell-amt">${compactMoney(sum)}</span><span class="pay-cell-dots">${dots}</span>` : '<span class="pay-cell-dots"></span>'}
        </${tag}>`;
    }

    const selItems = S.calSelected ? (byDay[S.calSelected] || []) : [];
    const selSum = selItems.reduce((a, it) => a + (it.amount || 0), 0);
    const detail = selItems.length ? `
      <div class="pay-cal-detail">
        <div class="pay-cal-detail-head">
          <span>${formatDateLong(S.calSelected)}</span>
          <span class="pay-cal-detail-sum">฿${formatMoney(selSum)}</span>
        </div>
        ${selItems.map(renderPayCalRow).join('')}
      </div>` : cal.items.length ? `<div class="pay-cal-hint">แตะวันที่มียอด เพื่อดูว่าวันนั้นต้องจ่ายอะไรบ้าง</div>` : '';

    const isThisMonth = month === todayStr.slice(0, 7);
    const overdueCount = cal.items.filter((it) => it.date < todayStr).length;
    // The month band carries the running total, so the summary reads as one blue surface
    // with the grid hanging under it rather than as a line of grey text.
    return `
      <div class="section-title">ปฏิทินยอดที่ต้องจ่าย</div>
      <div class="card pay-cal">
        <div class="pay-cal-head">
          <button type="button" class="pay-cal-nav" data-action="pay-cal-shift" data-delta="-1">${svgChevronDir('left', '#fff')}</button>
          <div class="pay-cal-head-mid">
            <div class="pay-cal-title">${THAI_MONTHS_FULL[m - 1]} ${y + 543}</div>
            ${cal.items.length ? `
              <div class="pay-cal-total">฿${formatMoney(cal.total)}</div>
              <div class="pay-cal-chips">
                <span class="pay-cal-chip">${cal.items.length} รายการ</span>
                ${overdueCount ? `<span class="pay-cal-chip danger">เลยกำหนด ${overdueCount}</span>` : ''}
              </div>`
            : `<div class="pay-cal-chips"><span class="pay-cal-chip">เดือนนี้ไม่มียอดต้องจ่าย</span></div>`}
          </div>
          <button type="button" class="pay-cal-nav" data-action="pay-cal-shift" data-delta="1">${svgChevronDir('right', '#fff')}</button>
        </div>
        <div class="pay-cal-body">
          <div class="cal-weekdays">${THAI_WEEKDAYS.map((w) => `<div>${w}</div>`).join('')}</div>
          <div class="pay-cal-grid">${cells}</div>
          <div class="pay-cal-foot">
            <div class="pay-cal-legend">
              ${PAY_LEGEND.map((k) => `<span style="background:${k.bg};color:${k.color}"><i style="background:${k.color}"></i>${k.short}</span>`).join('')}
            </div>
            ${isThisMonth ? '' : `<button type="button" class="pay-cal-today-btn" data-action="pay-cal-today">กลับเดือนนี้</button>`}
          </div>
          ${detail}
        </div>
      </div>`;
  }

  // Both due lists are grouped by what kind of thing is owed, mirroring the + menu's
  // categories (with pawns split gold/electronics, since those two settle on different
  // rules). A group with nothing in it is omitted entirely rather than shown empty.
  const DUE_GROUPS = [
    { label: '📋 หนี้สิน', tone: 0, match: (it) => it.type === 'installment' },
    { label: '💍 ตั๋วจำนำ — ทอง', tone: 1, match: (it) => it.type === 'pawn' && it.category === 'jewelry' },
    { label: '📱 ตั๋วจำนำ — อิเล็กทรอนิก', tone: 2, match: (it) => it.type === 'pawn' && it.category !== 'jewelry' },
    { label: '🧾 ค่าใช้จ่ายประจำ', tone: 3, match: (it) => it.type === 'expense' },
  ];
  function renderDueGroups(list) {
    return DUE_GROUPS.map((g) => {
      const items = list.filter(g.match);
      if (!items.length) return '';
      const sum = items.reduce((a, it) => a + (it.amount || 0), 0);
      const tone = PAY_LEGEND[g.tone];
      return `
        <div class="due-group">
          <div class="due-group-head">
            <span class="due-group-label" style="background:${tone.bg};color:${tone.color}">${g.label} (${items.length})</span>
            <span class="due-group-sum">฿${formatMoney(sum)}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px">${items.map(renderDueRow).join('')}</div>
        </div>`;
    }).join('');
  }

  function renderDueRow(it) {
    const kindLabel = { installment: 'งวดผ่อน', pawn: 'ตั๋วจำนำ', expense: 'ค่าใช้จ่ายประจำ' }[it.type];
    const kindBg = { installment: '#E8EEFB', pawn: '#EFE7F8', expense: '#FFF3DD' }[it.type];
    const kindFg = { installment: '#1428A0', pawn: '#6B3FA0', expense: '#92600A' }[it.type];
    const action = it.type === 'installment'
      ? `<button class="mark-paid-btn" data-action="mark-paid" data-id="${it.ref_id}" data-debt="${it.debt_id}" ${lockAttr()}>${btnLabel('paid:' + it.ref_id, 'บันทึกว่าจ่ายแล้ว')}</button>`
      : it.type === 'expense'
      ? `<button class="mark-paid-btn" data-action="mark-expense-paid" data-id="${it.ref_id}" data-expense-type="${it.expense_type}" ${lockAttr()}>${btnLabel('expense:' + it.ref_id, 'บันทึกว่าจ่ายแล้ว')}</button>`
      : `<div class="due-actions">
          <button class="mark-paid-btn" data-action="redeem-open" data-id="${it.ref_id}" ${lockAttr()}>${btnLabel('redeem:' + it.ref_id, 'ไถ่ถอน')}</button>
          <button class="pawn-btn renew" data-action="${it.category === 'jewelry' ? 'jewelry-renew' : 'renew-open'}" data-id="${it.ref_id}" ${lockAttr()}>${btnLabel('renew:' + it.ref_id, 'ต่อดอก')}</button>
        </div>`;
    const payPrompt = it.type === 'expense' && S.expensePayFor === it.ref_id ? `
      <div class="warn-options" style="width:100%;margin-top:8px">
        <input class="field-input" type="number" data-bind="expensePayAmount" value="${esc(S.forms.expensePayAmount)}" placeholder="ยอดที่จ่ายจริงเดือนนี้"/>
        <button class="submit-btn" data-action="confirm-expense-pay" data-id="${it.ref_id}" ${lockAttr()}>${btnLabel('expense:' + it.ref_id, 'ยืนยัน')}</button>
      </div>` : '';
    // Only the text block opens the detail popup — the buttons sit outside it so tapping
    // "ต่อดอก" can't also fire the popup underneath.
    const titleBlock = `
      <div style="flex:1${it.type === 'pawn' ? ';cursor:pointer' : ''}" ${it.type === 'pawn' ? `data-action="open-pawn-detail" data-id="${it.ref_id}"` : ''}>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="near-kind" style="background:${kindBg};color:${kindFg}">${kindLabel}</span>
          <span class="installment-date">${esc(it.title)}</span>
        </div>
        ${it.type === 'pawn' && it.ticket_code ? `<div style="font-size:12px;color:#5B6478;margin-top:2px">เลขที่ตั๋ว ${esc(it.ticket_code)}</div>` : ''}
        <div class="installment-amount">
          ${it.type === 'pawn' && it.category === 'jewelry'
            ? `฿${formatMoney(it.amount)} ดอกสะสม · เงินต้น ฿${formatMoney(it.principal)} · งวดที่ ${it.month_number}/${JEWELRY_BILLED_MONTHS}${it.term_overdue ? ' <span style="color:#B23B3B;font-weight:600">(เลยกำหนดต่อดอก)</span>' : ''}
               <div style="margin-top:2px">จำนำ ${formatDate(it.pawn_date)} · <span style="color:#B23B3B;font-weight:600">ครบกำหนดสุดท้าย ${formatDate(it.final_due)}</span></div>`
            : `฿${formatMoney(it.amount)} · ครบกำหนด ${formatDate(it.due_date)}`}
        </div>
      </div>`;
    return `
      <div class="installment-row${it.type === 'pawn' ? ' cat-' + it.category : ''}" style="flex-wrap:wrap">
        ${titleBlock}
        ${action}
        ${payPrompt}
        ${it.type === 'pawn' ? renderRedeemPrompt(it.ref_id) : ''}
        ${it.type === 'pawn' && it.category !== 'jewelry' ? renderRenewPicker(it.ref_id) : ''}
      </div>`;
  }

  // Manage is the app's table of contents, so each row leads with the number the user came
  // to check (balance owed / principal pawned / monthly spend) and carries its category's
  // tone — the same four families the dashboard tiles and the calendar cells use.
  function renderManage() {
    const r = S.report || {};
    const pawnCount = (r.count_pawn_jewelry || 0) + (r.count_pawn_other || 0);
    const interestTotal = (r.interest_jewelry || 0) + (r.interest_other || 0);
    const burden = (r.total_debt || 0) + (r.total_pawn_jewelry || 0) + (r.total_pawn_other || 0);
    const cards = [
      {
        screen: 'debtList', icon: '📋', tone: STAT_TONES.debt,
        label: 'หนี้สิน', amount: r.total_debt || 0, chips: ['ยอดคงเหลือทั้งหมด'],
      },
      {
        screen: 'pawnList', cat: 'jewelry', icon: '💍', tone: STAT_TONES.jewelry,
        label: 'ตั๋วจำนำ — ทอง', amount: r.total_pawn_jewelry || 0,
        chips: [`${r.count_pawn_jewelry || 0} ใบ`, `ดอก ฿${formatMoney(r.interest_jewelry || 0)}`],
      },
      {
        screen: 'pawnList', cat: 'nonjewelry', icon: '📱', tone: STAT_TONES.electronics,
        label: 'ตั๋วจำนำ — อิเล็กทรอนิก', amount: r.total_pawn_other || 0,
        chips: [`${r.count_pawn_other || 0} ใบ`, `ดอก ฿${formatMoney(r.interest_other || 0)}`],
      },
      {
        screen: 'expenses', icon: '🧾', tone: STAT_TONES.expense,
        label: 'ค่าใช้จ่ายประจำ', amount: r.total_recurring || 0, chips: ['ต่อเดือน'],
      },
    ];
    return `
      <div class="screen-pad">
        <div class="hero-card">
          <div class="hero-label">ภาระรวมทั้งหมด (หนี้ + เงินต้นตั๋วจำนำ)</div>
          <div class="hero-amount">฿${formatMoney(burden)}</div>
          <div class="hero-meta">
            <span class="hero-chip">ตั๋วจำนำ ${pawnCount} ใบ</span>
            <span class="hero-chip">ดอกเบี้ยตั๋วรวม ฿${formatMoney(interestTotal)}</span>
            <span class="hero-chip">ค่าใช้จ่ายประจำ ฿${formatMoney(r.total_recurring || 0)}/เดือน</span>
          </div>
        </div>
        <div class="section-title">เลือกหมวดที่ต้องการจัดการ</div>
        ${cards.map((c) => `
          <div class="manage-card" style="background:${c.tone.grad};box-shadow:0 6px 16px ${c.tone.shadow}" ${c.cat ? `data-action="goto-pawn-cat" data-cat="${c.cat}"` : `data-action="nav-manage" data-screen="${c.screen}"`}>
            <div class="manage-icon">${c.icon}</div>
            <div class="manage-body">
              <div class="manage-label" style="color:${c.tone.fg}">${c.label}</div>
              <div class="manage-amount" style="color:${c.tone.fg}">฿${formatMoney(c.amount)}</div>
              <div class="manage-chips">${c.chips.map((t) => `<span style="color:${c.tone.fg}">${esc(t)}</span>`).join('')}</div>
            </div>
            <div class="manage-go" style="color:${c.tone.fg}">${svgChevronDir('right', c.tone.fg)}</div>
          </div>`).join('')}
      </div>`;
  }

  function formatMonthLabel(monthStr) {
    const [y, m] = monthStr.split('-').map(Number);
    return `${THAI_MONTHS_FULL[m - 1]} ${y + 543}`;
  }

  // Pawn rows (renew/redeem) open the same detail popup as the dashboard, but carry their
  // history-row id so the popup can offer to undo that specific entry. Installment/expense
  // rows have no undoable log row, so they keep navigating to their own screens.
  function historyItemAction(it) {
    if (it.type === 'installment') return `data-action="open-debt" data-id="${it.debt_id}" data-from="history"`;
    if (it.type === 'expense') return `data-action="open-expense-settings" data-id="${it.ref_id}" data-from="history"`;
    if (it.type === 'renew' || it.type === 'redeem') return `data-action="open-pawn-detail" data-id="${it.ref_id}" data-history="${it.id}"`;
    return '';
  }

  // One hue per kind of payment. The three that make up real spending are a validated
  // categorical trio (blue / magenta / gold stay apart under colour-vision deficiency);
  // ไถ่ถอน sits outside the chart — it is principal coming back with the item, not a cost.
  const HISTORY_TYPES = [
    { key: 'renew', label: 'ต่อดอก', color: '#C0399B', bg: '#FBE9F5', spend: true },
    { key: 'installment', label: 'ผ่อนหนี้', color: '#1E5BD6', bg: '#E8EEFB', spend: true },
    { key: 'expense', label: 'ค่าใช้จ่าย', color: '#C1961F', bg: '#FBF0D2', spend: true },
    { key: 'redeem', label: 'ไถ่ถอน', color: '#1F8A70', bg: '#E4F5EF', spend: false },
  ];
  const historyTypeMeta = (type) => HISTORY_TYPES.find((t) => t.key === type) || HISTORY_TYPES[3];

  function renderHistoryItem(it) {
    const meta = historyTypeMeta(it.type);
    const clickable = ['installment', 'expense', 'renew', 'redeem'].includes(it.type);
    return `
      <div class="hist-row" ${clickable ? historyItemAction(it) + ' style="cursor:pointer"' : ''}>
        <span class="hist-bar" style="background:${meta.color}"></span>
        <div class="hist-body">
          <div class="hist-title">${esc(it.title)}</div>
          <div class="hist-meta">
            <span class="near-kind" style="background:${meta.bg};color:${meta.color}">${meta.label}</span>
            <span>${it.date ? formatDate(it.date) : '-'}</span>
          </div>
        </div>
        <div class="hist-amount" style="color:${meta.color}">฿${formatMoney(it.amount)}</div>
        ${clickable ? svgChevron() : ''}
      </div>`;
  }

  // Where this month's money actually went, as one proportion bar: three segments separated
  // by a 2px surface gap, each amount spelled out in the legend so the split never rests on
  // colour alone.
  function renderSpendBreakdown(s) {
    const parts = [
      { key: 'renew', amount: s.interest_paid },
      { key: 'installment', amount: s.installments_paid },
      { key: 'expense', amount: s.expenses_paid },
    ].map((part) => ({ ...part, meta: historyTypeMeta(part.key) }));
    const total = s.net_spend || 0;
    return `
      <div class="card spend-card">
        <div class="spend-head">
          <span>ใช้จ่ายจริงแยกตามประเภท</span>
          <span class="spend-total">฿${formatMoney(total)}</span>
        </div>
        ${total ? `
          <div class="spend-bar">
            ${parts.filter((p) => p.amount > 0).map((p) => `
              <span style="width:${(p.amount / total * 100).toFixed(1)}%;background:${p.meta.color}" title="${p.meta.label} ฿${formatMoney(p.amount)}"></span>`).join('')}
          </div>
          <div class="spend-legend">
            ${parts.map((p) => `
              <div class="spend-legend-row">
                <span class="spend-dot" style="background:${p.meta.color}"></span>
                <span class="spend-legend-label">${p.meta.label}</span>
                <span class="spend-legend-pct">${total ? Math.round(p.amount / total * 100) : 0}%</span>
                <span class="spend-legend-amount">฿${formatMoney(p.amount)}</span>
              </div>`).join('')}
          </div>`
        : `<div class="pay-cal-hint" style="border:0;padding-top:4px">เดือนนี้ยังไม่มีการจ่ายเงินออก</div>`}
        ${s.redeemed_cash ? `<div class="spend-note">ไถ่ถอนคืน ฿${formatMoney(s.redeemed_cash)} — ได้ของคืนมา ไม่นับเป็นค่าใช้จ่าย (เงินสดจ่ายออกจริงทั้งเดือน ฿${formatMoney(s.total_cash_out)})</div>` : ''}
      </div>`;
  }

  function renderHistory() {
    const h = S.history;
    if (!h) return `<div class="screen-pad"><div class="empty-card"><div class="empty-text">กำลังโหลด...</div></div></div>`;
    const s = h.summary;

    const hero = `
      <div class="hero-card">
        <div class="hero-label">ใช้จ่ายจริงเดือนนี้ · ${formatMonthLabel(s.month)}</div>
        <div class="hero-amount">฿${formatMoney(s.net_spend)}</div>
        <div class="hero-meta">
          <span class="hero-chip">ดอกต่อดอก ฿${formatMoney(s.interest_paid)}</span>
          <span class="hero-chip">งวดผ่อน ฿${formatMoney(s.installments_paid)}</span>
          <span class="hero-chip">ค่าใช้จ่ายประจำ ฿${formatMoney(s.expenses_paid)}</span>
        </div>
      </div>`;

    const counts = (key) => h.items.filter((it) => it.type === key).length;
    const filters = `
      <div class="pawn-filters">
        <button class="pawn-filter${!S.historyFilter ? ' selected' : ''}" style="${!S.historyFilter ? 'background:linear-gradient(150deg,#EDF2FF 0%,#DAE5FC 100%);color:#12309B;box-shadow:0 4px 12px rgba(20,40,160,0.16)' : ''}" data-action="set-history-filter" data-type="">ทั้งหมด<i>${h.items.length}</i></button>
        ${HISTORY_TYPES.map((t) => `
          <button class="pawn-filter${S.historyFilter === t.key ? ' selected' : ''}" style="${S.historyFilter === t.key ? `background:${t.bg};color:${t.color};box-shadow:0 4px 12px ${t.color}33` : ''}" data-action="set-history-filter" data-type="${t.key}">${t.label}<i>${counts(t.key)}</i></button>`).join('')}
      </div>`;

    const items = S.historyFilter ? h.items.filter((it) => it.type === S.historyFilter) : h.items;
    if (!items.length) {
      return `<div class="screen-pad">
        ${hero}${renderSpendBreakdown(s)}${filters}
        <div class="empty-card"><div class="empty-emoji">🕐</div><div class="empty-text">${h.items.length ? 'ไม่มีรายการประเภทนี้' : 'ยังไม่มีประวัติ'}</div></div>
      </div>`;
    }

    // Items already arrive newest first, so walking them in order yields month groups in
    // order too — each headed by its own total, which is what a month is usually scanned for.
    const groups = [];
    items.forEach((it) => {
      const month = (it.date || '').slice(0, 7) || 'ไม่ระบุ';
      const last = groups[groups.length - 1];
      if (last && last.month === month) last.items.push(it);
      else groups.push({ month, items: [it] });
    });

    return `<div class="screen-pad">
      ${hero}
      ${renderSpendBreakdown(s)}
      ${filters}
      ${groups.map((g) => `
        <div class="hist-group">
          <div class="hist-group-head">
            <span>${g.month === 'ไม่ระบุ' ? 'ไม่ระบุเดือน' : formatMonthLabel(g.month)}</span>
            <span class="hist-group-sum">${g.items.length} รายการ · จ่ายออก ฿${formatMoney(g.items.reduce((a, it) => a + (it.amount || 0), 0))}</span>
          </div>
          ${g.items.map(renderHistoryItem).join('')}
        </div>`).join('')}
    </div>`;
  }

  // Where a debt stands, derived from its installments: what is still unpaid, which one is
  // next, how many are already late, and how much of the principal is behind it.
  function debtProgress(d) {
    const unpaid = (d.installments || []).filter((i) => !i.paid)
      .sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
    const paidPercent = d.total_amount
      ? Math.min(100, Math.max(0, Math.round((d.total_amount - d.remaining_amount) / d.total_amount * 100)))
      : 0;
    return {
      unpaid, next: unpaid[0] || null, paidPercent,
      overdue: unpaid.filter((i) => daysUntil(i.due_date) < 0).length,
    };
  }

  function renderDebtList() {
    if (!S.debts.length) {
      return `<div class="screen-pad"><div class="empty-card"><div class="empty-emoji">📋</div><div class="empty-text">ยังไม่มีรายการหนี้ กดปุ่ม + เพื่อเพิ่ม</div></div></div>`;
    }
    const totals = S.debts.reduce((a, d) => {
      const p = debtProgress(d);
      return {
        remaining: a.remaining + (d.remaining_amount || 0),
        total: a.total + (d.total_amount || 0),
        monthly: a.monthly + (d.installment_amount || 0),
        overdue: a.overdue + p.overdue,
      };
    }, { remaining: 0, total: 0, monthly: 0, overdue: 0 });
    const paidPercent = totals.total ? Math.min(100, Math.max(0, Math.round((totals.total - totals.remaining) / totals.total * 100))) : 0;

    const hero = `
      <div class="hero-card">
        <div class="hero-label">หนี้คงเหลือทั้งหมด</div>
        <div class="hero-amount">฿${formatMoney(totals.remaining)}</div>
        <div class="hero-meta">
          <span class="hero-chip">${S.debts.length} ก้อน</span>
          <span class="hero-chip">ผ่อนรวม ฿${formatMoney(totals.monthly)}/เดือน</span>
          ${totals.overdue ? `<span class="hero-chip alert">⚠️ ค้าง ${totals.overdue} งวด</span>` : `<span class="hero-chip">ผ่อนแล้ว ${paidPercent}% ของยอดตั้งต้น</span>`}
        </div>
      </div>`;

    const cards = S.debts.map((d) => {
      const p = debtProgress(d);
      const days = p.next ? daysUntil(p.next.due_date) : null;
      const status = !p.next ? 'paid' : days < 0 ? 'overdue' : days <= S.warnDays ? 'due_soon' : 'upcoming';
      const meta = STATUS_META[status];
      const badgeLabel = !p.next ? '✓ ไม่มีงวดค้าง' : daysLabel(days, status);
      const nextColor = status === 'overdue' ? '#B23B3B' : status === 'due_soon' ? '#92600A' : undefined;
      return `
        <div class="debt-card" data-action="open-debt" data-id="${d.id}">
          <div class="item-head">
            <div class="item-icon">📋</div>
            <div class="item-headtext">
              <div class="pawn-item">${esc(d.name)}</div>
              <div class="pawn-shop">งวดละ ฿${formatMoney(d.installment_amount)} · ทุกวันที่ ${d.due_day || '-'}</div>
            </div>
            <div class="item-head-right">
              <div class="near-badge" style="background:${meta.bg};color:${meta.fg}">${badgeLabel}</div>
              ${svgChevron()}
            </div>
          </div>
          <div class="stat-row">
            ${statCell('คงเหลือ', '฿' + formatMoney(d.remaining_amount))}
            ${statCell('ยอดตั้งต้น', '฿' + formatMoney(d.total_amount))}
            ${statCell('งวดถัดไป', p.next ? formatDate(p.next.due_date) : '—', nextColor)}
          </div>
          <div class="progress-wrap">
            <div class="progress-head">
              <span>ผ่อนแล้ว ${p.paidPercent}%</span>
              <span>จ่ายไปแล้ว ฿${formatMoney(Math.max(0, (d.total_amount || 0) - (d.remaining_amount || 0)))}</span>
            </div>
            <div class="progress-track"><div class="progress-fill" style="width:${p.paidPercent}%"></div></div>
          </div>
          ${p.overdue ? `<div class="pawn-note danger">มีงวดค้างชำระ ${p.overdue} งวด — แตะเพื่อดูตารางงวดผ่อน</div>` : ''}
        </div>`;
    }).join('');
    return `<div class="screen-pad">${hero}${cards}</div>`;
  }

  // The schedule is the point of this screen, so it is drawn as a timeline: one dot per
  // installment down a rail, filled green once paid and red once late, with the next one
  // still owed ringed in blue. Reading down it answers "where am I in this debt?".
  function renderDebtDetail() {
    const d = S.debts.find((x) => x.id === S.selectedDebtId);
    if (!d) return `<div class="screen-pad"><div class="empty-card"><div class="empty-text">ไม่พบข้อมูล</div></div></div>`;
    const p = debtProgress(d);
    const inst = (d.installments || []).slice().sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
    const paidCount = inst.filter((i) => i.paid).length;
    const paidAmount = Math.max(0, (d.total_amount || 0) - (d.remaining_amount || 0));
    const nextId = p.next ? p.next.id : null;

    const hero = `
      <div class="hero-card">
        <div class="hero-label">ยอดคงเหลือของหนี้ก้อนนี้</div>
        <div class="hero-amount">฿${formatMoney(d.remaining_amount)}</div>
        <div class="hero-progress"><div class="hero-progress-fill" style="width:${p.paidPercent}%"></div></div>
        <div class="hero-meta">
          <span class="hero-chip">ผ่อนแล้ว ${p.paidPercent}% ของ ฿${formatMoney(d.total_amount)}</span>
          <span class="hero-chip">งวดละ ฿${formatMoney(d.installment_amount)}</span>
          ${p.overdue ? `<span class="hero-chip alert">⚠️ ค้าง ${p.overdue} งวด</span>` : `<span class="hero-chip">ทุกวันที่ ${d.due_day || '-'}</span>`}
        </div>
      </div>`;

    const stats = `
      <div class="stat-row stat-row-plain">
        ${statCell('จ่ายไปแล้ว', '฿' + formatMoney(paidAmount))}
        ${statCell('งวดที่จ่ายแล้ว', `${paidCount}/${inst.length} งวด`)}
        ${statCell('งวดถัดไป', p.next ? formatDate(p.next.due_date) : '—', p.overdue ? '#B23B3B' : undefined)}
      </div>`;

    const rows = inst.map((i, idx) => {
      const status = statusOf(!!i.paid, i.due_date);
      const meta = STATUS_META[status];
      const isNext = i.id === nextId;
      const cls = ['tl-item', status === 'paid' ? 'paid' : status === 'overdue' ? 'overdue' : '', isNext ? 'next' : ''].filter(Boolean).join(' ');
      const label = status === 'paid' ? meta.label : daysLabel(daysUntil(i.due_date), status);
      return `
        <div class="${cls}">
          <div class="tl-rail"><span class="tl-dot">${i.paid ? '✓' : ''}</span></div>
          <div class="tl-card">
            <div class="tl-line">
              <div>
                <div class="tl-date">${formatDate(i.due_date)}</div>
                <div class="tl-sub">งวดที่ ${idx + 1}${isNext ? ' · งวดถัดไป' : ''}</div>
              </div>
              <div class="tl-amount">฿${formatMoney(i.amount)}</div>
            </div>
            <div class="tl-line">
              <span class="status-badge" style="background:${meta.bg};color:${meta.fg}">${label}</span>
              ${i.paid
                ? `<span class="tl-paid-at">${i.paid_at ? 'จ่ายเมื่อ ' + formatDate(String(i.paid_at).slice(0, 10)) : ''}</span>`
                : `<button class="mark-paid-btn" data-action="mark-paid" data-id="${i.id}" data-debt="${d.id}" ${lockAttr()}>${btnLabel('paid:' + i.id, 'บันทึกว่าจ่ายแล้ว')}</button>`}
            </div>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="screen-pad">
        ${hero}
        ${stats}
        <div class="section-title">ตารางงวดผ่อน (${inst.length} งวด)</div>
        ${inst.length ? `<div class="timeline">${rows}</div>` : `
          <div class="empty-card"><div class="empty-emoji">🗓️</div><div class="empty-text">ยังไม่มีงวดผ่อนในรายการนี้</div></div>`}
      </div>`;
  }

  function renderDebtSettings() {
    const id = S.editingDebtId;
    return `
      <div class="screen-pad">
        ${renderDebtFormFields('แก้ "ยอดผ่อนต่อเดือน" แล้วงวดที่ยังไม่จ่ายทั้งหมดจะถูกปรับตามยอดใหม่ทันที')}
        <button class="submit-btn" data-action="submit-edit-debt">บันทึกการแก้ไข</button>
        ${formCard('⚙️', 'การจัดการหนี้ก้อนนี้', `
          <button class="danger-btn ok" data-action="close-debt" data-id="${id}">✓ ปิดหนี้ (ชำระครบแล้ว)</button>
          ${formHint('ปิดหนี้ = เอาออกจากรายการแต่เก็บประวัติไว้ · ลบ = หายถาวรพร้อมงวดผ่อนทั้งหมด กู้คืนไม่ได้')}
          <button class="danger-btn" data-action="delete-debt" data-id="${id}">🗑 ลบหนี้ถาวร</button>`)}
      </div>`;
  }

  // S.pawnFilter narrows the list to one category group when you arrive from a total card;
  // 'nonjewelry' covers electronics/car/other, which all share the same renewal mechanics.
  function filteredPawns() {
    if (S.pawnFilter === 'jewelry') return S.pawns.filter((p) => p.category === 'jewelry');
    if (S.pawnFilter === 'nonjewelry') return S.pawns.filter((p) => p.category !== 'jewelry');
    return S.pawns;
  }
  function renderPawnList() {
    const list = filteredPawns();
    const jewelryCount = S.pawns.filter((p) => p.category === 'jewelry').length;
    const FILTERS = [
      { cat: '', label: 'ทั้งหมด', count: S.pawns.length, tone: STAT_TONES.debt },
      { cat: 'jewelry', label: '💍 ทอง', count: jewelryCount, tone: STAT_TONES.jewelry },
      { cat: 'nonjewelry', label: '📱 อิเล็กทรอนิก', count: S.pawns.length - jewelryCount, tone: STAT_TONES.electronics },
    ];
    const filterChips = `
      <div class="pawn-filters">
        ${FILTERS.map((f) => {
          const on = (S.pawnFilter || '') === f.cat;
          return `<button class="pawn-filter${on ? ' selected' : ''}" style="${on ? `background:${f.tone.grad};color:${f.tone.fg};box-shadow:0 4px 12px ${f.tone.shadow}` : ''}" data-action="set-pawn-filter" data-cat="${f.cat}">${f.label}<i>${f.count}</i></button>`;
        }).join('')}
      </div>`;

    // Interest owed right now, by the same rule each category settles on: jewelry has
    // accrued one rate per billed month, everything else owes one flat renewal fee.
    const totals = list.reduce((a, p) => ({
      amount: a.amount + (p.amount || 0),
      interest: a.interest + (p.category === 'jewelry' ? (p.interest || 0) * jewelryTermOf(p).billed : (p.interest || 0)),
    }), { amount: 0, interest: 0 });
    const summary = list.length ? `
      <div class="card list-summary">
        <div><span>ตั๋วในรายการ</span><b>${list.length} ใบ</b></div>
        <div><span>เงินต้นรวม</span><b>฿${formatMoney(totals.amount)}</b></div>
        <div><span>ดอกที่ต้องจ่าย</span><b class="accent">฿${formatMoney(totals.interest)}</b></div>
      </div>` : '';

    const empty = !list.length ? `
      <div class="empty-card"><div class="empty-emoji">🎫</div><div class="empty-text">${S.pawns.length ? 'ไม่มีตั๋วในหมวดนี้' : 'ยังไม่มีตั๋วจำนำ กดปุ่ม + เพื่อเพิ่ม'}</div></div>` : '';
    const cards = list.map((p) => renderPawnCard(p)).join('');
    return `<div class="screen-pad">${filterChips}${summary}${empty}${cards}</div>`;
  }

  // Whole calendar months between two 'YYYY-MM-DD' dates (0 until the day-of-month is reached again).
  function monthsBetween(fromStr, toStr) {
    const from = new Date(fromStr + 'T00:00:00');
    const to = new Date(toStr + 'T00:00:00');
    let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
    if (to.getDate() < from.getDate()) months--;
    return Math.max(0, months);
  }

  // Mirrors jewelryTerm() in api.js: interest is billed for at most 4 months (the shop
  // forfeits in the 5th), so the counter shown on a card stops at "งวดที่ 4" and switches to
  // an overdue warning rather than climbing to 7, 8, 9 as if it were still accruing.
  const JEWELRY_BILLED_MONTHS = 4;
  function jewelryTermOf(p) {
    const pawnDate = p.pawn_date || (p.created_at || '').slice(0, 10);
    const elapsed = monthsBetween(pawnDate, todayISO()) + 1;
    return {
      pawnDate, elapsed,
      billed: Math.min(elapsed, JEWELRY_BILLED_MONTHS),
      overdue: elapsed > JEWELRY_BILLED_MONTHS,
    };
  }

  // Shared by pawn cards and the dashboard's due-this-month list — lets the redeem amount
  // be typed in (the payout can differ from the recorded pawn amount) instead of assuming it.
  function renderRedeemPrompt(id) {
    if (S.redeemPromptFor !== id) return '';
    return `
      <div class="warn-options" style="width:100%;margin-top:8px">
        <input class="field-input" type="number" data-bind="redeemAmount" value="${esc(S.forms.redeemAmount)}" placeholder="จำนวนเงินไถ่ถอน"/>
        <button class="submit-btn" data-action="redeem-confirm" data-id="${id}" ${lockAttr()}>${btnLabel('redeem:' + id, 'ยืนยันไถ่ถอน')}</button>
      </div>`;
  }

  // Period chips for non-jewelry renewal — shared by the pawn card, the dashboard row, and
  // the detail popup so all three stay in step (and all three respect the in-flight lock).
  function renderRenewPicker(id) {
    if (S.renewPickerFor !== id) return '';
    return `
      <div style="display:flex;flex-direction:column;gap:6px;padding-top:2px;width:100%">
        <div class="field-label" style="margin-bottom:0">เลือกระยะเวลาต่อดอก</div>
        <div class="warn-options">
          ${PERIOD_OPTIONS.filter((o) => o.unit && o.key !== 'custom').map((o) =>
            `<button class="warn-opt" data-action="renew-confirm" data-id="${id}" data-key="${o.key}" ${lockAttr()}>${o.label}</button>`
          ).join('')}
        </div>
      </div>`;
  }

  // Full-detail popup, opened by tapping a pawn anywhere it's listed (dashboard row or pawn
  // card). Carries the same redeem/renew actions as the card so you never have to leave the
  // screen you're on to act on a ticket you just looked up.
  // Only present when the popup came from a history row. Spells out what reverting will do,
  // so it's obvious the button rolls the ticket back rather than returning a physical item.
  function renderUndoButton() {
    if (!S.detailHistoryId) return '';
    const h = S.detailHistoryItem;
    let effect = '';
    if (h && h.type === 'renew') {
      const back = h.category === 'jewelry'
        ? (h.pawn_date_before ? `เริ่มนับงวดใหม่จาก ${formatDate(h.pawn_date_before)}` : 'กลับไปงวดก่อนต่อดอก')
        : (h.due_date_before ? `ครบกำหนดกลับเป็น ${formatDate(h.due_date_before)}` : 'กลับไปวันครบกำหนดเดิม');
      effect = `ยกเลิกการต่อดอกนี้ · ${back}`;
    } else if (h && h.type === 'redeem') {
      effect = 'ยกเลิกการไถ่ถอน · ตั๋วจะกลับมาเป็นจำนำอยู่';
    }
    return `
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid #EFF2F8">
        ${effect ? `<div class="field-label" style="margin:0 0 6px">${esc(effect)}</div>` : ''}
        <button class="pawn-btn" data-action="undo-history" data-id="${S.detailHistoryId}" ${lockAttr()}
          style="width:100%;background:#FDEAEA;color:#B23B3B">${btnLabel('undo:' + S.detailHistoryId, '↩️ คืนสินค้า (ย้อนรายการนี้)')}</button>
      </div>`;
  }

  function renderPawnDetailModal() {
    if (!S.detailFor) return '';
    const p = S.pawns.find((x) => x.id === S.detailFor) || S.detailPawnCache;
    if (!p) {
      // Still fetching the pawn — but the undo button comes from the history row, which is
      // already in hand, so it shows straight away rather than appearing seconds later.
      return `<div class="modal-backdrop" data-action="close-pawn-detail">
        <div class="modal-sheet" data-stop="1">
          <div class="row-between" style="align-items:flex-start">
            <div style="flex:1;min-width:0">
              <div style="font-size:16px;font-weight:700;color:#141B34">${esc((S.detailHistoryItem || {}).title || 'ตั๋วจำนำ')}</div>
              <div class="pawn-shop">กำลังโหลดรายละเอียด...</div>
            </div>
            <button class="icon-btn" data-action="close-pawn-detail" style="width:30px;height:30px;font-size:20px;line-height:1;color:#5B6478">×</button>
          </div>
          ${renderUndoButton()}
        </div>
      </div>`;
    }
    const isRedeemed = p.status === 'redeemed';
    const meta = PAWN_CATEGORIES.find((c) => c.key === p.category) || PAWN_CATEGORIES[3];
    const isJewelry = p.category === 'jewelry';
    const pawnDate = p.pawn_date || (p.created_at || '').slice(0, 10);

    const row = (label, value, color) =>
      `<div class="row-between" style="padding:7px 0;border-bottom:1px solid #EFF2F8">
        <span style="font-size:13px;color:#5B6478">${label}</span>
        <span style="font-size:13.5px;font-weight:600;color:${color || '#141B34'};text-align:right">${value}</span>
      </div>`;

    let detailRows, statusLine = '';
    if (isJewelry) {
      const term = jewelryTermOf(p);
      const finalDueDate = addMonths(pawnDate, 5);
      const accrued = (p.interest || 0) * term.billed;
      const pastFinal = todayISO() >= finalDueDate;
      detailRows = [
        row('เงินต้น', `฿${formatMoney(p.amount)}`),
        row('ดอกเบี้ยต่องวด', `฿${formatMoney(p.interest || 0)}/เดือน`),
        row('งวดปัจจุบัน', `งวดที่ ${term.billed} / ${JEWELRY_BILLED_MONTHS}`, term.overdue ? '#B23B3B' : ''),
        row('ดอกเบี้ยสะสมที่ต้องจ่าย', `฿${formatMoney(accrued)}`, '#B23B3B'),
        row('รวมถ้าไถ่ถอนตอนนี้', `฿${formatMoney(p.amount + accrued)}`),
        row('วันที่จำนำ', formatDate(pawnDate)),
        row('ครบกำหนดสุดท้าย', formatDate(finalDueDate), pastFinal ? '#B23B3B' : ''),
        row('ต่อดอกมาแล้ว', `${p.renewal_count || 0} ครั้ง`),
      ].join('');
      statusLine = pastFinal
        ? `<div class="field-label" style="color:#B23B3B;margin:0">⚠️ เลยกำหนดสุดท้ายแล้ว ต้องไถ่ถอนด่วน มิฉะนั้นจะเสียสิทธิ์</div>`
        : term.overdue
        ? `<div class="field-label" style="color:#B23B3B;margin:0">⚠️ เลยกำหนดต่อดอกมา ${term.elapsed - JEWELRY_BILLED_MONTHS} เดือน (ดอกหยุดนับที่ ${JEWELRY_BILLED_MONTHS} งวด)</div>`
        : term.billed >= JEWELRY_BILLED_MONTHS
        ? `<div class="field-label" style="color:#92600A;margin:0">⚠️ ครบ ${JEWELRY_BILLED_MONTHS} งวดแล้ว ต้องต่อดอกหรือไถ่ถอน</div>` : '';
    } else {
      const days = daysUntil(p.due_date);
      const status = days < 0 ? 'overdue' : (days <= S.warnDays ? 'due_soon' : 'upcoming');
      detailRows = [
        row('เงินต้น', `฿${formatMoney(p.amount)}`),
        row('ดอกต่อรอบ', `฿${formatMoney(p.interest || 0)}`),
        row('รวมถ้าไถ่ถอนตอนนี้', `฿${formatMoney(p.amount + (p.interest || 0))}`),
        row('วันที่จำนำ', formatDate(pawnDate)),
        row('ครบกำหนด', formatDate(p.due_date), status === 'overdue' ? '#B23B3B' : ''),
        row('สถานะ', daysLabel(days, status), STATUS_META[status].fg),
        row('ต่อดอกมาแล้ว', `${p.renewal_count || 0} ครั้ง`),
      ].join('');
    }

    return `
      <div class="modal-backdrop" data-action="close-pawn-detail">
        <div class="modal-sheet cat-${p.category}" data-stop="1">
          <div class="row-between" style="align-items:flex-start;gap:10px">
            <div style="flex:1;min-width:0">
              <span class="near-kind" style="background:#EFEFEF;color:#5B6478">${meta.icon} ${meta.label}</span>
              <div style="font-size:16px;font-weight:700;color:#141B34;margin-top:6px">${esc(p.item_name)}</div>
              <div class="pawn-shop">${esc(p.shop_name || 'ไม่ระบุร้าน')}${p.ticket_code ? ' · เลขที่ตั๋ว ' + esc(p.ticket_code) : ''}</div>
            </div>
            <button class="icon-btn" data-action="close-pawn-detail" style="width:30px;height:30px;font-size:20px;line-height:1;color:#5B6478">×</button>
          </div>
          <div style="margin-top:12px">${detailRows}</div>
          ${statusLine ? `<div style="margin-top:10px">${statusLine}</div>` : ''}
          ${p.renew_url ? `<a href="${esc(p.renew_url)}" target="_blank" rel="noopener" class="pawn-btn renew" style="text-align:center;text-decoration:none;display:block;margin-top:12px">🔗 ต่อดอกออนไลน์ (จาก QR ตั๋ว)</a>` : ''}
          ${isRedeemed
            ? `<div class="status-badge" style="background:#E7F5EE;color:#1F7A52;display:block;text-align:center;margin-top:12px;padding:10px">ไถ่ถอนไปแล้ว${p.redeemed_amount != null ? ` · ฿${formatMoney(p.redeemed_amount)}` : ''}</div>`
            : `<div class="pawn-actions" style="margin-top:12px">
                <button class="pawn-btn redeem" data-action="redeem-open" data-id="${p.id}" ${lockAttr()}>${btnLabel('redeem:' + p.id, 'ไถ่ถอน')}</button>
                <button class="pawn-btn renew" data-action="${isJewelry ? 'jewelry-renew' : 'renew-open'}" data-id="${p.id}" ${lockAttr()}>${btnLabel('renew:' + p.id, 'ต่อดอก')}</button>
              </div>
              ${renderRedeemPrompt(p.id)}
              ${isJewelry ? '' : renderRenewPicker(p.id)}`}
          ${renderUndoButton()}
          <button class="cal-today-btn" data-action="open-pawn-settings" data-id="${p.id}" data-from="${S.screen}" style="margin-top:10px">⚙️ แก้ไขข้อมูลตั๋วนี้</button>
        </div>
      </div>`;
  }

  // A ticket card leads with the three numbers that decide what to do with it — principal,
  // interest owed, deadline — as white panels on the category's tint, with jewelry also
  // showing how far through its four billed months it is.
  function statCell(label, value, accentColor) {
    return `<div class="stat-cell"><span>${label}</span><b${accentColor ? ` style="color:${accentColor}"` : ''}>${value}</b></div>`;
  }

  function renderPawnCard(p, from) {
    const categoryMeta = PAWN_CATEGORIES.find((c) => c.key === p.category) || PAWN_CATEGORIES[3];
    const isJewelry = p.category === 'jewelry';
    const pawnDate = p.pawn_date || (p.created_at || '').slice(0, 10);
    const shopLine = esc(p.shop_name || 'ไม่ระบุร้าน') + (p.ticket_code ? ' · เลขที่ตั๋ว ' + esc(p.ticket_code) : '');

    let badgeLabel, badgeBg, badgeFg, bodyHtml, actionsHtml;

    if (isJewelry) {
      // New model (replaces the old renewal_count-based cap entirely): interest accrues by
      // calendar month from the pawn date — "ยอดต่อดอก" is a per-month rate, not a flat fee.
      // Month 4 triggers the "approaching final month" warning; the 5th month is still the
      // hard forfeit deadline, computed the same way as before.
      const finalDueDate = addMonths(pawnDate, 5);
      const pastFinal = todayISO() >= finalDueDate;
      const term = jewelryTermOf(p);
      const atFourMonths = term.billed >= JEWELRY_BILLED_MONTHS;
      const accrued = (p.interest || 0) * term.billed;
      const urgent = pastFinal || term.overdue;

      if (pastFinal) {
        badgeLabel = '⚠️ ใกล้ขาดจำนำ'; badgeBg = '#D64545'; badgeFg = '#fff';
      } else if (term.overdue) {
        badgeLabel = '⚠️ เลยกำหนดต่อดอก'; badgeBg = '#D64545'; badgeFg = '#fff';
      } else if (atFourMonths) {
        badgeLabel = '⚠️ ครบ 4 งวดแล้ว'; badgeBg = '#FFF3DD'; badgeFg = '#92600A';
      } else {
        badgeLabel = `งวดที่ ${term.billed} / ${JEWELRY_BILLED_MONTHS}`; badgeBg = '#FFFFFF'; badgeFg = '#8A6A12';
      }

      const noteColor = urgent ? '#B23B3B' : atFourMonths ? '#92600A' : '';
      const segColor = urgent ? '#D64545' : '#C1961F';
      // One segment per billed month, plus a fifth for the forfeit deadline — the shape of
      // the ticket's life in one line, rather than a sentence the user has to parse.
      const segments = [1, 2, 3, 4, 5].map((i) => {
        const filled = i <= term.billed || (i === 5 && pastFinal);
        const isFinal = i === 5;
        return `<span class="term-seg${filled ? ' filled' : ''}${isFinal ? ' final' : ''}" style="${filled ? `background:${isFinal ? '#D64545' : segColor}` : ''}"></span>`;
      }).join('');

      bodyHtml = `
        <div class="stat-row">
          ${statCell('เงินต้น', '฿' + formatMoney(p.amount))}
          ${statCell('ดอกสะสม', '฿' + formatMoney(accrued), noteColor || undefined)}
          ${statCell('ไถ่ถอนก่อน', formatDate(finalDueDate), urgent ? '#B23B3B' : undefined)}
        </div>
        <div class="term-wrap">
          <div class="term-head">
            <span>${p.interest ? `ดอก ฿${formatMoney(p.interest)}/งวด × ${term.billed} งวด` : 'ไม่ได้ระบุดอกเบี้ย'}</span>
            <span>งวดที่ ${term.billed}/${JEWELRY_BILLED_MONTHS}${pastFinal ? ' · เลยเดือนที่ 5' : ''}</span>
          </div>
          <div class="term-track">${segments}</div>
        </div>
        ${pastFinal ? `<div class="pawn-note danger">เลยกำหนดสุดท้ายแล้ว กรุณาไถ่ถอนโดยเร็ว มิฉะนั้นจะเสียสิทธิ์</div>`
          : term.overdue ? `<div class="pawn-note danger">เลยกำหนดต่อดอกมา ${term.elapsed - JEWELRY_BILLED_MONTHS} เดือน (ดอกหยุดนับที่ ${JEWELRY_BILLED_MONTHS} งวด) ต้องต่อดอกหรือไถ่ก่อน ${formatDate(finalDueDate)}</div>`
          : atFourMonths ? `<div class="pawn-note warn">ครบ ${JEWELRY_BILLED_MONTHS} งวดแล้ว ต้องต่อดอกหรือไถ่ก่อน ${formatDate(finalDueDate)}</div>` : ''}`;
      actionsHtml = `<div class="pawn-actions">
          <button class="pawn-btn redeem" data-action="redeem-open" data-id="${p.id}" ${lockAttr()}>${btnLabel('redeem:' + p.id, 'ไถ่ถอน')}</button>
          <button class="pawn-btn renew" data-action="jewelry-renew" data-id="${p.id}" ${lockAttr()}>${btnLabel('renew:' + p.id, 'ต่อดอก')}</button>
        </div>${renderRedeemPrompt(p.id)}`;
    } else {
      // Unchanged for non-jewelry: pick-a-period renewal pushes the due date forward.
      const days = daysUntil(p.due_date);
      const status = days < 0 ? 'overdue' : (days <= S.warnDays ? 'due_soon' : 'upcoming');
      const meta = STATUS_META[status];
      badgeLabel = daysLabel(days, status); badgeBg = meta.bg; badgeFg = meta.fg;
      const dueColor = status === 'overdue' ? '#B23B3B' : status === 'due_soon' ? '#92600A' : undefined;

      bodyHtml = `
        <div class="stat-row">
          ${statCell('เงินต้น', '฿' + formatMoney(p.amount))}
          ${statCell('ค่าต่อดอก', p.interest ? '฿' + formatMoney(p.interest) : '—')}
          ${statCell('ครบกำหนด', formatDate(p.due_date), dueColor)}
        </div>`;
      actionsHtml = `
        <div class="pawn-actions">
          <button class="pawn-btn redeem" data-action="redeem-open" data-id="${p.id}" ${lockAttr()}>${btnLabel('redeem:' + p.id, 'ไถ่ถอน')}</button>
          <button class="pawn-btn renew" data-action="renew-open" data-id="${p.id}" ${lockAttr()}>${btnLabel('renew:' + p.id, 'ต่อดอก')}</button>
        </div>
        ${renderRedeemPrompt(p.id)}
        ${renderRenewPicker(p.id)}`;
    }

    return `
      <div class="pawn-card cat-${p.category}">
        <div class="item-head">
          <div class="item-icon">${categoryMeta.icon}</div>
          <div class="item-headtext" data-action="open-pawn-detail" data-id="${p.id}">
            <div class="pawn-item">${esc(p.item_name)}</div>
            <div class="pawn-shop">${shopLine}</div>
            <div class="pawn-shop">จำนำเมื่อ ${formatDate(pawnDate)}</div>
          </div>
          <div class="item-head-right">
            <div class="near-badge" style="background:${badgeBg};color:${badgeFg}">${badgeLabel}</div>
            <button class="icon-btn" data-action="open-pawn-settings" data-id="${p.id}" data-from="${from || ''}" style="width:28px;height:28px">${svgGear('#5B6478')}</button>
          </div>
        </div>
        ${bodyHtml}
        ${p.renew_url ? `<a href="${esc(p.renew_url)}" target="_blank" rel="noopener" class="pawn-link">🔗 ต่อดอกออนไลน์ (จาก QR ตั๋ว)</a>` : ''}
        ${actionsHtml}
      </div>`;
  }

  // Shared by the expenses list and the report screen's expense section. Like a pawn card,
  // it leads with the numbers: what it costs, when it is due this month, and whether it has
  // been paid yet — a paid row goes green and quiet so the unpaid ones stand out.
  function expenseDueDate(e) {
    const month = todayISO().slice(0, 7);
    const lastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
    return `${month}-${String(Math.min(Math.max(1, e.due_day || 1), lastDay)).padStart(2, '0')}`;
  }

  function renderExpenseCard(e, from) {
    const isVariable = e.expense_type === 'variable';
    const dueDate = expenseDueDate(e);
    const days = daysUntil(dueDate);
    const status = e.paid_this_month ? 'paid' : days < 0 ? 'overdue' : days <= S.warnDays ? 'due_soon' : 'upcoming';
    const meta = STATUS_META[status];
    const badgeLabel = e.paid_this_month ? '✓ จ่ายแล้วเดือนนี้' : daysLabel(days, status);
    const amountText = isVariable
      ? (e.last_amount != null ? '~฿' + formatMoney(e.last_amount) : 'ยังไม่มีข้อมูล')
      : '฿' + formatMoney(e.amount);
    const dueColor = status === 'overdue' ? '#B23B3B' : status === 'due_soon' ? '#92600A' : undefined;
    const payPrompt = S.expensePayFor === e.id ? `
        <div class="warn-options" style="width:100%">
          <input class="field-input" type="number" data-bind="expensePayAmount" value="${esc(S.forms.expensePayAmount)}" placeholder="ยอดที่จ่ายจริงเดือนนี้"/>
          <button class="submit-btn" data-action="confirm-expense-pay" data-id="${e.id}" ${lockAttr()}>${btnLabel('expense:' + e.id, 'ยืนยัน')}</button>
        </div>` : '';
    return `
      <div class="expense-card${e.paid_this_month ? ' paid' : ''}">
        <div class="item-head">
          <div class="item-icon">${isVariable ? '📈' : '🧾'}</div>
          <div class="item-headtext" style="cursor:default">
            <div class="pawn-item">${esc(e.name)}</div>
            <div class="pawn-shop">${isVariable ? 'ยอดไม่คงที่ · กรอกยอดจริงตอนจ่าย' : 'ยอดคงที่ทุกเดือน'}</div>
          </div>
          <div class="item-head-right">
            <div class="near-badge" style="background:${meta.bg};color:${meta.fg}">${badgeLabel}</div>
            <button class="icon-btn" data-action="open-expense-settings" data-id="${e.id}" data-from="${from || ''}" style="width:28px;height:28px">${svgGear('#5B6478')}</button>
          </div>
        </div>
        <div class="stat-row">
          ${statCell(isVariable ? 'ยอดล่าสุด' : 'ยอดต่อเดือน', amountText)}
          ${statCell('กำหนดจ่าย', 'ทุกวันที่ ' + (e.due_day || 1))}
          ${statCell('รอบเดือนนี้', e.paid_this_month ? 'จ่ายแล้ว' : formatDate(dueDate), e.paid_this_month ? '#1F7A52' : dueColor)}
        </div>
        ${e.paid_this_month ? '' : `
          <button class="mark-paid-btn expense-pay-btn" data-action="mark-expense-paid" data-id="${e.id}" data-expense-type="${e.expense_type}" ${lockAttr()}>${btnLabel('expense:' + e.id, 'บันทึกว่าจ่ายแล้ว')}</button>`}
        ${payPrompt}
      </div>`;
  }

  function renderExpenses() {
    if (!S.expenses.length) {
      return `<div class="screen-pad">
        <div class="empty-card"><div class="empty-emoji">🧾</div><div class="empty-text">ยังไม่มีค่าใช้จ่ายประจำ กดปุ่ม + เพื่อเพิ่ม</div></div>
      </div>`;
    }
    // A variable expense has no amount until it is paid, so last month's stands in — the
    // monthly total is an estimate whenever one of those is still unpaid.
    const amountOf = (e) => (e.expense_type === 'variable' ? (e.last_amount || 0) : (e.amount || 0));
    const monthlyTotal = S.expenses.reduce((a, e) => a + amountOf(e), 0);
    const unpaid = S.expenses.filter((e) => !e.paid_this_month);
    const remaining = unpaid.reduce((a, e) => a + amountOf(e), 0);
    const paidCount = S.expenses.length - unpaid.length;
    const overdueCount = unpaid.filter((e) => daysUntil(expenseDueDate(e)) < 0).length;
    const allPaid = !unpaid.length;

    const hero = `
      <div class="hero-card">
        <div class="hero-label">ค่าใช้จ่ายประจำเดือนนี้</div>
        <div class="hero-amount">฿${formatMoney(monthlyTotal)}</div>
        <div class="hero-meta">
          <span class="hero-chip">${allPaid ? '✓ จ่ายครบแล้ว' : `ยังต้องจ่าย ฿${formatMoney(remaining)}`}</span>
          <span class="hero-chip">จ่ายแล้ว ${paidCount}/${S.expenses.length} รายการ</span>
          ${overdueCount ? `<span class="hero-chip alert">⚠️ เลยกำหนด ${overdueCount} รายการ</span>` : ''}
        </div>
      </div>`;

    // Whatever still has to be paid this month goes on top; settled rows sink below the
    // divider so the list opens on the part that needs action.
    const byDue = (a, b) => (a.due_day || 0) - (b.due_day || 0);
    const paid = S.expenses.filter((e) => e.paid_this_month).sort(byDue);
    return `
      <div class="screen-pad">
        ${hero}
        ${unpaid.length ? `
          <div class="section-title">ยังไม่ได้จ่ายเดือนนี้ (${unpaid.length})</div>
          ${unpaid.slice().sort(byDue).map((e) => renderExpenseCard(e)).join('')}` : ''}
        ${paid.length ? `
          <div class="section-title done">จ่ายแล้วเดือนนี้ (${paid.length})</div>
          ${paid.map((e) => renderExpenseCard(e)).join('')}` : ''}
      </div>`;
  }

  // Shared by the "add pawn" form and the pawn settings screen — same fields either way,
  // split into three cards so a ticket is entered in the order it is read off the slip:
  // what the item is, what it cost, and when it has to be settled.
  function renderPawnFormFields() {
    const isJewelry = S.forms.category === 'jewelry';
    const isCustomPeriod = S.forms.pawnPeriod === 'custom';
    const periodChips = PERIOD_OPTIONS.map((o) =>
      `<button class="warn-opt ${o.key === S.forms.pawnPeriod ? 'selected' : ''}" data-action="pawn-period" data-key="${o.key}">${o.label}</button>`
    ).join('');
    const categoryChips = PAWN_CATEGORIES.map((c) =>
      `<button class="warn-opt ${c.key === S.forms.category ? 'selected' : ''}" data-action="pawn-category" data-key="${c.key}">${c.icon} ${c.label}</button>`
    ).join('');
    // Jewelry doesn't use the period/due-date renewal system at all — its due date is always
    // pawn_date+5 months, computed automatically, and interest accrues monthly instead (see
    // renderPawnCard). Every other category keeps the original pick-a-period flow unchanged.
    const periodSection = isJewelry ? '' : `
        <div class="form-field">
          <div class="field-label">ครบกำหนดต่อดอก</div>
          <div class="warn-options">${periodChips}</div>
        </div>
        ${isCustomPeriod ? `<div class="form-field"><div class="field-label">ระบุจำนวนวันต่อรอบ</div><input class="field-input" type="number" min="1" data-bind="pawnCustomDays" value="${esc(S.forms.pawnCustomDays)}" placeholder="เช่น 7, 10, 20"/></div>` : ''}
        ${renderDateField('dueDate', 'วันครบกำหนดงวดแรก')}
        ${formHint(`ไม่รู้ว่าจำนำมาวันไหน แต่รู้วันครบกำหนด (เช่น ร้านนัดจ่ายวันที่ 10) ก็เลือกวันนั้นเป็นงวดแรกได้เลย — งวดถัดไปจะนับต่อไปเรื่อยๆ ทุก${isCustomPeriod ? (S.forms.pawnCustomDays || 'N') + ' วัน' : ' ' + (PERIOD_OPTIONS.find((o) => o.key === S.forms.pawnPeriod) || {}).label}`)}`;

    return `
      ${formCard('🎫', 'ข้อมูลตั๋วและสินค้า', `
        <div class="form-field">
          <div class="field-label">หมวดหมู่</div>
          <div class="warn-options">${categoryChips}</div>
        </div>
        ${textField('ชื่อสินค้า', 'itemName', { placeholder: 'เช่น ทองคำแท่ง 1 บาท' })}
        <div class="field-row">
          <div class="field-1">${textField('ร้านจำนำ', 'shop', { placeholder: 'ชื่อร้าน' })}</div>
          <div class="field-1">${textField('เลขที่ตั๋ว', 'ticketCode', { placeholder: 'ถ้ามี' })}</div>
        </div>
        ${textField('ลิงก์ต่อดอกออนไลน์', 'renewUrl', { type: 'url', placeholder: 'https://... (จาก QR บนตั๋ว)' })}`)}

      ${formCard('💰', 'ยอดเงิน', `
        <div class="field-row">
          <div class="field-1">${moneyField('ยอดเงินต้น', 'amount')}</div>
          <div class="field-1">${moneyField(isJewelry ? 'ดอกเบี้ยต่อเดือน' : 'ยอดต่อดอก', 'interest')}</div>
        </div>
        ${isJewelry ? formHint('หมวดเครื่องประดับ: ดอกเบี้ยคิดเป็นรายเดือนจาก "วันที่จำนำ" (เดือนละเท่ากับอัตราที่กรอกไว้ สะสมไปเรื่อยๆ) ครบเดือนที่ 4 จะเตือน เดือนที่ 5 คือกำหนดไถ่ถอนสุดท้าย', 'gold') : ''}`)}

      ${formCard('📅', isJewelry ? 'วันที่จำนำ' : 'วันที่และรอบต่อดอก', `
        ${renderDateField('pawnDate', 'วันที่จำนำ')}
        ${periodSection}`)}`;
  }

  function renderPawnSettings() {
    return `
      <div class="screen-pad">
        ${renderPawnFormFields()}
        <button class="submit-btn" data-action="submit-edit-pawn">บันทึกการแก้ไข</button>
        ${formCard('⚙️', 'การจัดการตั๋วจำนำ', `
          ${formHint('ลบแล้วตั๋วใบนี้จะหายถาวรพร้อมประวัติต่อดอก/ไถ่ถอน กู้คืนไม่ได้')}
          <button class="danger-btn" data-action="delete-pawn" data-id="${S.editingPawnId}">🗑 ลบตั๋วจำนำถาวร</button>`)}
      </div>`;
  }

  // Shared by the "add expense" form and the expense settings screen — same fields either way.
  function renderExpenseFormFields() {
    const isVariableExpense = S.forms.expenseType === 'variable';
    const expenseTypeChips = `
      <button class="warn-opt ${!isVariableExpense ? 'selected' : ''}" data-action="expense-type" data-key="fixed">ยอดคงที่ทุกเดือน</button>
      <button class="warn-opt ${isVariableExpense ? 'selected' : ''}" data-action="expense-type" data-key="variable">ไม่คงที่ ต้องจ่ายทุกเดือน</button>`;
    return formCard('🧾', 'รายละเอียดค่าใช้จ่าย', `
      ${textField('ชื่อค่าใช้จ่าย', 'expenseName', { placeholder: 'เช่น ค่าเช่าห้อง, ค่าไฟ, ค่าเน็ต' })}
      <div class="form-field">
        <div class="field-label">ลักษณะค่าใช้จ่าย</div>
        <div class="warn-options">${expenseTypeChips}</div>
      </div>
      <div class="field-row">
        ${isVariableExpense ? '' : `<div class="field-1">${moneyField('ยอดต่อเดือน', 'expenseAmount')}</div>`}
        <div class="field-1">${dayField('จ่ายทุกวันที่', 'expenseDueDay')}</div>
      </div>
      ${isVariableExpense ? formHint('ยอดไม่คงที่ (เช่น ค่าน้ำ ค่าไฟ ค่าเน็ต): กรอกยอดจริงทุกครั้งตอนบันทึกว่าจ่ายแล้ว', 'gold') : ''}`);
  }

  function renderExpenseSettings() {
    return `
      <div class="screen-pad">
        ${renderExpenseFormFields()}
        <button class="submit-btn" data-action="submit-edit-expense">บันทึกการแก้ไข</button>
        ${formCard('⚙️', 'การจัดการค่าใช้จ่าย', `
          ${formHint('ลบแล้วค่าใช้จ่ายนี้จะหายถาวรพร้อมประวัติการจ่ายทุกเดือน กู้คืนไม่ได้')}
          <button class="danger-btn" data-action="delete-expense" data-id="${S.editingExpenseId}">🗑 ลบค่าใช้จ่ายนี้ถาวร</button>`)}
      </div>`;
  }

  // Debt fields are shared by the add form and the debt settings screen.
  function renderDebtFormFields(installmentNote) {
    return formCard('📋', 'รายละเอียดหนี้', `
      ${textField('ชื่อหนี้', 'name', { placeholder: 'เช่น บัตรเครดิต, สินเชื่อส่วนบุคคล' })}
      <div class="field-row">
        <div class="field-1">${moneyField('ยอดหนี้ทั้งหมด', 'total')}</div>
        <div class="field-1">${moneyField('ยอดคงเหลือ', 'remaining')}</div>
      </div>
      <div class="field-row">
        <div class="field-1">${dayField('จ่ายทุกวันที่', 'dueDay')}</div>
        <div class="field-1">${moneyField('ยอดผ่อนต่อเดือน', 'installmentAmount')}</div>
      </div>
      ${installmentNote ? formHint(installmentNote) : ''}`);
  }

  const ADD_TYPES = [
    { key: 'debt', icon: '📋', label: 'หนี้ใหม่' },
    { key: 'pawn', icon: '🎫', label: 'ตั๋วจำนำ' },
    { key: 'expense', icon: '🧾', label: 'ค่าใช้จ่าย' },
  ];

  function renderAddEdit() {
    const type = S.addType;
    const tabs = `
      <div class="segmented">
        ${ADD_TYPES.map((t) => `
          <button class="segmented-btn ${type === t.key ? 'active' : ''}" data-action="add-type" data-type="${t.key}">${t.icon} ${t.label}</button>`).join('')}
      </div>`;
    const form = type === 'debt'
      ? `${renderDebtFormFields('เพิ่มหนี้ใหม่แล้วระบบจะสร้างงวดผ่อน 3 งวดถัดไปให้อัตโนมัติ แก้ไขภายหลังได้')}
         <button class="submit-btn" data-action="submit-debt">บันทึกหนี้ใหม่</button>`
      : type === 'pawn'
      ? `${renderPawnFormFields()}
         <button class="submit-btn" data-action="submit-pawn">บันทึกตั๋วจำนำ</button>`
      : `${renderExpenseFormFields()}
         <button class="submit-btn" data-action="submit-expense">บันทึกค่าใช้จ่ายประจำ</button>`;
    return `<div class="screen-pad">${tabs}${form}</div>`;
  }

  // Push registration lives on its own card because its state is device-specific: the token
  // belongs to this phone, not the account, so each device has to be switched on once.
  // Every settings block is the same shape: an icon, a title, one line of explanation, an
  // optional status pill, then whatever controls that block owns.
  function setCard(opts) {
    const { icon, title, sub, pill, body, tone } = opts;
    return `
      <div class="set-card${tone ? ' ' + tone : ''}">
        <div class="set-head">
          <div class="item-icon">${icon}</div>
          <div class="set-headtext">
            <div class="set-title">${title}</div>
            ${sub ? `<div class="set-sub">${sub}</div>` : ''}
          </div>
          ${pill || ''}
        </div>
        ${body || ''}
      </div>`;
  }
  const setNote = (text) => `<div class="set-note">${text}</div>`;

  function renderPushCard() {
    const st = S.pushStatus;
    if (!st) return setCard({ icon: '🔔', title: 'แจ้งเตือนอัตโนมัติ', sub: 'กำลังตรวจสอบ...' });
    if (!st.supported) {
      return setCard({
        icon: '🔔', title: 'แจ้งเตือนอัตโนมัติ',
        sub: 'เครื่อง/เบราว์เซอร์นี้ไม่รองรับ — ลองเปิดผ่าน Chrome บน Android แล้วติดตั้งเป็นแอป',
        pill: '<span class="set-pill">ไม่รองรับ</span>',
      });
    }
    if (st.permission === 'denied') {
      return setCard({
        icon: '🔕', tone: 'danger', title: 'การแจ้งเตือนถูกปิดไว้ในเครื่อง',
        sub: 'ต้องเปิดเองที่เครื่องก่อน แอปขอสิทธิ์ซ้ำไม่ได้',
        pill: '<span class="set-pill danger">ถูกบล็อก</span>',
        body: `
          ${setNote('กดไอคอน 🔒 ข้าง URL → การตั้งค่าเว็บไซต์ → การแจ้งเตือน → อนุญาต<br>(หรือ ตั้งค่า Android → แอป → Chrome → การแจ้งเตือน) แล้วกลับมากดปุ่มนี้อีกครั้ง')}
          <button class="set-btn" data-action="refresh-push">ตรวจสอบใหม่</button>
          <div class="set-diag">สถานะเครื่องนี้: permission=${st.permission}</div>`,
      });
    }
    const on = st.enabled;
    return setCard({
      icon: '🔔', title: 'แจ้งเตือนอัตโนมัติ',
      sub: on
        ? 'เครื่องนี้จะได้รับแจ้งเตือนวันละ 2 ครั้ง (8 โมงเช้า / 6 โมงเย็น) แม้ไม่ได้เปิดแอป เฉพาะตอนมีรายการครบกำหนด'
        : 'เปิดเพื่อให้ระบบส่งแจ้งเตือนเข้าเครื่องนี้เอง แม้ไม่ได้เปิดแอป — ต้องเปิดครั้งเดียวต่อเครื่อง',
      pill: `<span class="set-pill ${on ? 'on' : 'off'}">${on ? '● เปิดอยู่' : '○ ปิดอยู่'}</span>`,
      body: `
        ${(S.pushLog && S.pushLog.length)
          ? setNote(`📥 เครื่องนี้ได้รับ ${S.pushLog.length} ครั้ง · ล่าสุด ${esc(new Date(S.pushLog[0].at).toLocaleString('th-TH'))} · ${S.pushLog[0].shown ? 'แสดงผลสำเร็จ' : 'แสดงไม่สำเร็จ: ' + esc(S.pushLog[0].error || 'ไม่ทราบสาเหตุ')}`)
          : setNote('📥 เครื่องนี้ยังไม่เคยได้รับข้อความจากระบบเลย')}
        ${S.pushError ? `<div class="set-note danger">❌ ${esc(S.pushError)}</div>` : ''}
        <button class="set-btn${on ? ' ghost' : ''}" data-action="${on ? 'disable-push' : 'enable-push'}" ${lockAttr()}>
          ${btnLabel('push', on ? 'ปิดแจ้งเตือนอัตโนมัติ' : '🔔 เปิดแจ้งเตือนอัตโนมัติ')}
        </button>
        <div class="set-diag">permission=${st.permission} · subscribed=${st.subscribed ? 'yes' : 'no'} · saved=${st.enabled ? 'yes' : 'no'}${st.detail ? ' · ' + esc(st.detail) : ''}</div>`,
    });
  }

  // Google's "add by URL" only exists on the desktop web, so on a phone the page opens in the
  // browser; the copy button covers pasting the link in by hand.
  function renderCalendarCard() {
    const url = calendarFeedUrl();
    if (!url) {
      return setCard({
        icon: '📅', title: 'เชื่อมกับ Google Calendar',
        sub: 'ให้วันครบกำหนดทุกรายการ (งวดผ่อน · ตั๋วจำนำ · ค่าใช้จ่ายประจำ) ขึ้นในปฏิทิน Google และอัปเดตเองทุกไม่กี่ชั่วโมง',
        pill: '<span class="set-pill off">ยังไม่ได้เชื่อม</span>',
        body: `<button class="set-btn" data-action="create-calendar-link" ${lockAttr()}>${btnLabel('calendar', 'สร้างลิงก์ปฏิทิน')}</button>`,
      });
    }
    const gcal = 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(url.replace(/^https?:/, 'webcal:'));
    return setCard({
      icon: '📅', title: 'เชื่อมกับ Google Calendar',
      sub: 'กด "เพิ่มลง Google Calendar" แล้วกดเพิ่ม (ทำครั้งเดียว) — ปฏิทินจะอัปเดตเองเมื่อจ่าย/ต่อดอก/ไถ่ถอน',
      pill: '<span class="set-pill on">● เชื่อมแล้ว</span>',
      body: `
        <div class="set-url">${esc(url)}</div>
        <div class="set-btn-row">
          <a class="set-btn" href="${esc(gcal)}" target="_blank" rel="noopener">➕ เพิ่มลง Google Calendar</a>
          <button class="set-btn ghost" data-action="copy-calendar-link">📋 คัดลอกลิงก์</button>
        </div>
        ${setNote('บนมือถือ ถ้าเปิดแล้วไม่มีปุ่มเพิ่ม: คัดลอกลิงก์ → เปิด calendar.google.com ในโหมดเดสก์ท็อป → ปฏิทินอื่นๆ ＋ → จาก URL → วางลิงก์ · <b>อย่าแชร์ลิงก์นี้ให้คนอื่น</b>')}`,
    });
  }

  function renderSettings() {
    const user = (S.currentUser || {}).username || '';
    const isAdmin = (S.realUser || {}).is_admin;
    const viewingOther = S.currentUser && S.realUser && S.currentUser.id !== S.realUser.id;
    const opts = [1, 3, 5, 7, 14].map((n) =>
      `<button class="warn-opt ${n === S.warnDays ? 'selected' : ''}" data-action="warn-days" data-n="${n}">${n} วัน</button>`).join('');

    const profile = `
      <div class="hero-card set-profile">
        <div class="set-avatar">${esc(user.slice(0, 1).toUpperCase() || '?')}</div>
        <div style="flex:1;min-width:0">
          <div class="hero-label">เข้าใช้งานในชื่อ</div>
          <div class="set-username">${esc(user)}${isAdmin ? ' <span class="set-admin">แอดมิน</span>' : ''}</div>
          ${viewingOther ? `<div class="set-viewing">กำลังดูข้อมูลของ ${esc((S.currentUser || {}).username || '')}</div>` : ''}
        </div>
        <button class="set-logout" data-action="logout">ออกจากระบบ</button>
      </div>`;

    return `
      <div class="screen-pad">
        ${profile}

        <div class="section-title">การแจ้งเตือน</div>
        ${setCard({
          icon: '⏰', title: 'เตือนล่วงหน้ากี่วัน',
          sub: 'ใช้กับกระดิ่งในแอปและการแจ้งเตือนอัตโนมัติ — นับถอยหลังก่อนถึงวันครบกำหนด',
          pill: `<span class="set-pill on">${S.warnDays} วัน</span>`,
          body: `<div class="warn-options">${opts}</div>`,
        })}
        ${renderPushCard()}
        ${setCard({
          icon: '🧪', title: 'ทดสอบการแจ้งเตือน',
          sub: 'กดเพื่อเช็คว่าเครื่องนี้แสดงการแจ้งเตือนได้จริง (ทดสอบในเครื่อง ไม่เกี่ยวกับการส่งอัตโนมัติด้านบน)',
          body: `<button class="set-btn ghost" data-action="test-notification">🔔 ทดสอบส่งแจ้งเตือน</button>`,
        })}

        <div class="section-title">เชื่อมต่อ &amp; ข้อมูล</div>
        ${renderCalendarCard()}
        ${setCard({
          icon: '📊', title: 'ดาวน์โหลดรายงาน Excel',
          sub: 'รวมหนี้สิน · ตั๋วจำนำ · ค่าใช้จ่ายประจำ ทั้งหมดไว้ในไฟล์เดียว',
          body: `<button class="set-btn" data-action="export-excel">⬇️ ดาวน์โหลดไฟล์ Excel</button>`,
        })}
      </div>`;
  }

  // The bell's list, grouped by urgency: anything the rules flagged with ⚠️ (a ticket about
  // to be forfeited, an overdue renewal) sits above everything else, and a row that has been
  // read goes flat and grey instead of disappearing.
  function notifIcon(n) {
    if (n.ref_type === 'installment') return '📋';
    if (n.ref_type === 'expense') return '🧾';
    return n.title.startsWith('⚠️') ? '⚠️' : '🎫';
  }

  function renderNotifRow(n) {
    const unread = !n.read_at;
    const urgent = n.title.startsWith('⚠️');
    const d = new Date(n.sent_at);
    const dateLabel = formatDate(n.sent_at.slice(0, 10)) + ' ' + d.toTimeString().slice(0, 5);
    const cls = ['notif-row', unread ? 'unread' : 'read', urgent ? 'urgent' : ''].filter(Boolean).join(' ');
    return `
      <div class="${cls}" ${unread ? `data-action="mark-notif-read" data-id="${n.id}"` : ''}>
        <div class="item-icon notif-icon">${notifIcon(n)}</div>
        <div class="notif-body">
          <div class="notif-title">${esc(n.title.replace(/^⚠️\s*/, ''))}</div>
          <div class="notif-text">${esc(n.body)}</div>
          <div class="notif-time">${dateLabel}${n.persistent ? ' · เตือนซ้ำจนกว่าจะจัดการ' : ''}</div>
        </div>
        ${unread ? '<span class="notif-dot"></span>' : ''}
      </div>`;
  }

  function renderNotifications() {
    const list = S.notifications;
    if (!list.length) {
      return `<div class="screen-pad">
        <div class="empty-card"><div class="empty-emoji">✅</div><div class="empty-text">ไม่มีรายการที่ต้องจัดการตอนนี้<br><span style="font-size:12.5px;color:#A3A9B8">กระดิ่งจะเตือนเมื่อใกล้ถึงกำหนดตามจำนวนวันที่ตั้งไว้ (${S.warnDays} วัน)</span></div></div>
      </div>`;
    }
    const urgent = list.filter((n) => n.title.startsWith('⚠️'));
    const normal = list.filter((n) => !n.title.startsWith('⚠️'));
    const unreadCount = list.filter((n) => !n.read_at).length;

    const hero = `
      <div class="hero-card">
        <div class="hero-label">รายการที่ต้องจัดการ</div>
        <div class="hero-amount">${list.length} รายการ</div>
        <div class="hero-meta">
          ${urgent.length ? `<span class="hero-chip alert">⚠️ ด่วน ${urgent.length} รายการ</span>` : '<span class="hero-chip">✓ ไม่มีรายการด่วน</span>'}
          <span class="hero-chip">${unreadCount ? `ยังไม่อ่าน ${unreadCount} รายการ` : 'อ่านครบแล้ว'}</span>
          <span class="hero-chip">เตือนล่วงหน้า ${S.warnDays} วัน</span>
        </div>
      </div>`;

    return `<div class="screen-pad">
      ${hero}
      ${urgent.length ? `
        <div class="section-title danger">ด่วน — ต้องจัดการก่อน (${urgent.length})</div>
        <div class="notif-list">${urgent.map(renderNotifRow).join('')}</div>` : ''}
      ${normal.length ? `
        <div class="section-title">ใกล้ถึงกำหนด (${normal.length})</div>
        <div class="notif-list">${normal.map(renderNotifRow).join('')}</div>` : ''}
      ${unreadCount ? `<div class="notif-hint">แตะรายการเพื่อทำเครื่องหมายว่าอ่านแล้ว — รายการด่วนจะกลับมาเตือนใหม่ทุกครั้งที่เปิดแอปจนกว่าจะจัดการเสร็จ</div>` : ''}
    </div>`;
  }

  function renderFab() {
    const showExpenseOption = S.screen === 'dashboard' || S.screen === 'expenses';
    const menu = S.fabMenuOpen ? `
      <div class="fab-menu">
        <div class="fab-menu-item" data-action="add-from-dash" data-type="debt">+ เพิ่มหนี้ใหม่</div>
        <div class="fab-menu-item" data-action="add-from-dash" data-type="pawn">+ เพิ่มตั๋วจำนำใหม่</div>
        ${showExpenseOption ? `<div class="fab-menu-item" data-action="add-from-dash" data-type="expense">+ เพิ่มค่าใช้จ่ายประจำ</div>` : ''}
      </div>` : '';
    return `<div class="fab-wrap">${menu}<button class="fab-btn" data-action="fab-click">${svgPlus()}</button></div>`;
  }

  function renderBottomNav() {
    const items = [
      { key: 'dashboard', label: 'หน้าแรก', icon: svgHome, match: ['dashboard'] },
      { key: 'manage', label: 'จัดการ', icon: svgList, match: ['manage', 'debtList', 'pawnList', 'expenses'] },
      { key: 'history', label: 'ประวัติ', icon: svgHistory, match: ['history'] },
      { key: 'settings', label: 'ตั้งค่า', icon: svgGear, match: ['settings'] },
    ];
    return `<div class="bottom-nav">${items.map((it) => {
      const active = it.match.includes(S.screen);
      const color = active ? '#1428A0' : '#A3A9B8';
      return `<button class="nav-item${active ? ' active' : ''}" data-action="nav" data-screen="${it.key}"><span class="nav-pill">${it.icon(color)}</span><span class="nav-label" style="color:${color}">${it.label}</span></button>`;
    }).join('')}</div>`;
  }

  // ---------------- Icons ----------------
  function svgLock() { return `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M7 7V5a5 5 0 0110 0v2"/></svg>`; }
  function svgBack(c) { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8"><path d="M15 18l-6-6 6-6"/></svg>`; }
  function svgList(c) { return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/></svg>`; }
  function svgChevron() { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A3A9B8" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>`; }
  function svgChevronDir(dir, color) { return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${color || '#141B34'}" stroke-width="2"><path d="${dir === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'}"/></svg>`; }
  function svgCalendar() { return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B6478" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4" stroke-linecap="round"/></svg>`; }
  function svgPlus() { return `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>`; }
  function svgHome(c) { return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8"><path d="M3 11l9-7 9 7"/><path d="M5 10v9h14v-9"/></svg>`; }
  function svgHistory(c) { return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8"><path d="M3 12a9 9 0 109-9" stroke-linecap="round"/><path d="M3 4v5h5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 7v5l4 2" stroke-linecap="round" stroke-linejoin="round"/></svg>`; }
  function svgGear(c) { return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 13a7.6 7.6 0 000-2l1.9-1.5-2-3.4-2.3.6a7.7 7.7 0 00-1.7-1l-.3-2.4h-4l-.3 2.4a7.7 7.7 0 00-1.7 1l-2.3-.6-2 3.4L4.6 11a7.6 7.6 0 000 2l-1.9 1.5 2 3.4 2.3-.6a7.7 7.7 0 001.7 1l.3 2.4h4l.3-2.4a7.7 7.7 0 001.7-1l2.3.6 2-3.4z"/></svg>`; }
  function svgBell(c) { return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c || '#141B34'}" stroke-width="1.8"><path d="M6 9a6 6 0 0112 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9z"/><path d="M9.5 17a2.5 2.5 0 005 0"/></svg>`; }
  function svgLogout(c) { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c || '#141B34'}" stroke-width="1.8"><path d="M15 17l5-5-5-5M20 12H9"/><path d="M9 19H6a2 2 0 01-2-2V7a2 2 0 012-2h3"/></svg>`; }
  function svgSwap(c) { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${c || '#1428A0'}" stroke-width="2"><path d="M7 4l-4 4 4 4M3 8h13M17 20l4-4-4-4M21 16H8"/></svg>`; }

  // ---------------- Event delegation ----------------
  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    switch (action) {
      case 'submit-login': submitLogin(); break;
      case 'logout': logout(); break;
      case 'toggle-user-menu': setState({ userMenuOpen: !S.userMenuOpen }); break;
      case 'switch-user': switchToUser(el.dataset.id); break;
      case 'open-notifications': openNotifications(); break;
      case 'mark-notif-read': markNotifRead(el.dataset.id); break;
      case 'mark-all-read': markAllNotifsRead(); break;
      case 'back': goBack(); break;
      case 'nav': nav(el.dataset.screen); break;
      case 'nav-manage': navFromManage(el.dataset.screen); break;
      case 'open-debt': openDebt(el.dataset.id, el.dataset.from); break;
      case 'open-debt-settings': openDebtSettings(el.dataset.id); break;
      case 'submit-edit-debt': editDebtSubmit(); break;
      case 'close-debt': closeDebt(el.dataset.id); break;
      case 'delete-debt': deleteDebt(el.dataset.id); break;
      case 'mark-paid': markPaid(el.dataset.id, el.dataset.debt); break;
      case 'redeem-open': openRedeemPrompt(el.dataset.id); break;
      case 'redeem-confirm': confirmRedeem(el.dataset.id); break;
      case 'open-pawn-settings': openPawnSettings(el.dataset.id, el.dataset.from); break;
      case 'submit-edit-pawn': editPawnSubmit(); break;
      case 'delete-pawn': deletePawnAction(el.dataset.id); break;
      case 'renew-open': toggleRenewPicker(el.dataset.id); break;
      case 'jewelry-renew': renewJewelryPawn(el.dataset.id); break;
      case 'open-pawn-detail': openPawnDetail(el.dataset.id, el.dataset.history); break;
      case 'undo-history': undoHistoryEntry(el.dataset.id); break;
      // Backdrop and × share this action; the sheet itself carries data-stop so a tap inside
      // it (on a non-action area) doesn't bubble up here and close the popup.
      case 'close-pawn-detail':
        if (e.target.closest('[data-stop]') && el.classList.contains('modal-backdrop')) break;
        closePawnDetail();
        break;
      case 'goto-pawn-cat': setState({ screen: 'pawnList', returnScreen: S.screen === 'pawnList' ? S.returnScreen : S.screen, pawnFilter: el.dataset.cat, detailFor: null, fabMenuOpen: false }); break;
      case 'set-pawn-filter': setState({ pawnFilter: el.dataset.cat || null }); break;
      case 'set-history-filter': setState({ historyFilter: el.dataset.type || null }); break;
      case 'renew-confirm': {
        const opt = PERIOD_OPTIONS.find((o) => o.key === el.dataset.key);
        if (opt && opt.unit) renewPawn(el.dataset.id, opt);
        break;
      }
      case 'pawn-period': setPawnPeriod(el.dataset.key); break;
      case 'pawn-category': setPawnCategory(el.dataset.key); break;
      case 'expense-type': setExpenseType(el.dataset.key); break;
      case 'add-type': setState({ addType: el.dataset.type }); break;
      case 'submit-debt': addDebtSubmit(); break;
      case 'submit-pawn': addPawnSubmit(); break;
      case 'submit-expense': addExpenseSubmit(); break;
      case 'open-expense-settings': openExpenseSettings(el.dataset.id, el.dataset.from); break;
      case 'submit-edit-expense': editExpenseSubmit(); break;
      case 'mark-expense-paid': markExpensePaid(el.dataset.id, el.dataset.expenseType); break;
      case 'confirm-expense-pay': confirmExpensePay(el.dataset.id); break;
      case 'delete-expense': deleteExpense(el.dataset.id); break;
      case 'warn-days': setWarnDays(Number(el.dataset.n)); break;
      case 'export-excel': exportReportToExcel(); break;
      case 'create-calendar-link': createCalendarLink(); break;
      case 'copy-calendar-link': copyCalendarLink(); break;
      case 'pay-cal-shift': shiftCalMonth(Number(el.dataset.delta)); break;
      case 'pay-cal-today': calGoToday(); break;
      case 'pay-cal-day': selectCalDay(el.dataset.date); break;
      case 'toggle-date-picker': openDatePicker(el.dataset.field); break;
      case 'shift-date-month': shiftDatePickerMonth(Number(el.dataset.delta)); break;
      case 'pick-date': pickDate(el.dataset.field, el.dataset.date); break;
      case 'test-notification': testNotification(); break;
      case 'enable-push': enablePushAction(); break;
      case 'disable-push': disablePushAction(); break;
      case 'refresh-push': refreshPushStatus(); break;
      case 'fab-click':
        if (S.screen === 'dashboard') setState({ fabMenuOpen: !S.fabMenuOpen });
        else if (S.screen === 'debtList') openAdd('debt', 'debtList');
        else if (S.screen === 'expenses') openAdd('expense', 'expenses');
        else openAdd('pawn', 'pawnList');
        break;
      case 'add-from-dash': openAdd(el.dataset.type, S.screen); break;
    }
  });

  app.addEventListener('input', (e) => {
    const bind = e.target.dataset.bind;
    if (bind) S.forms[bind] = e.target.value;
  });
  app.addEventListener('change', (e) => {
    const bind = e.target.dataset.bind;
    if (!bind) return;
    S.forms[bind] = e.target.value;
    // Convenience default: once a custom day count is entered, suggest today+N as the first
    // due date (still fully editable) instead of leaving the date picker blank.
    if (bind === 'pawnCustomDays' && !S.forms.dueDate) {
      const days = Number(e.target.value) || 0;
      if (days > 0) setForms({ dueDate: computePeriodDate('day', days) });
    }
  });
  app.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset.bind === 'loginUsername') submitLogin();
  });

  // ---------------- Boot ----------------
  render();
  (async () => {
    await Api.ready(); // make sure anonymous auth is signed in before any Firestore call
    if (S.currentUser) {
      // Returning user — session already saved on this device, skip straight to the app.
      Api.setActiveUser(S.currentUser.id);
      setState({ screen: 'dashboard' });
      if (S.realUser && S.realUser.is_admin) loadSwitchableUsers();
      await loadAll();
      loadNotificationsAndAlert();
    }
  })();
})();
