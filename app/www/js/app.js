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
    upcoming:  { label: 'ยังไม่ถึงกำหนด',  bg: '#EFEFEF', fg: '#6B6B6B', dot: '#A6ACAA' },
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
    expensePayFor: null,
    datePickerFor: null,       // which form field's calendar popup is open, if any
    datePickerView: { y: 0, m: 0 }, // {y,m} (Gregorian, m 0-indexed) the open popup's month grid is showing
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
  function renderDateField(field, label) {
    const value = S.forms[field];
    const isOpen = S.datePickerFor === field;
    return `
      <div>
        <div class="field-label">${label}</div>
        <button type="button" class="field-input date-field-btn" data-action="toggle-date-picker" data-field="${field}">
          <span style="${value ? '' : 'color:#A6ACAA'}">${value ? formatDate(value) : 'เลือกวันที่'}</span>
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

      const TEAL = 'FF0E6B5C';
      const HEADER_FONT = { color: { argb: 'FFFFFFFF' }, bold: true, size: 12 };
      const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL } };
      const BORDER = { style: 'thin', color: { argb: 'FFE0E7E5' } };
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
      sSum.getCell('A1').font = { bold: true, size: 14, color: { argb: TEAL } };
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
  function render() {
    app.innerHTML = S.screen === 'login' ? renderLogin() : renderApp();
  }

  function toastHtml() { return S.toast ? `<div class="toast">${esc(S.toast)}</div>` : ''; }

  function renderLogin() {
    return `
    <div class="lock-screen">
      <div style="display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:20px">
        <div class="lock-icon">${svgLock()}</div>
        <div class="lock-title">พิมพ์ชื่อผู้ใช้เพื่อเข้าแอป</div>
        <div class="lock-sub">not หรือ lek</div>
        <div class="lock-error">${esc(S.loginError)}</div>
      </div>
      <div style="padding:24px;display:flex;flex-direction:column;gap:14px">
        <input class="field-input" data-bind="loginUsername" value="${esc(S.forms.loginUsername)}" placeholder="ชื่อผู้ใช้" autocapitalize="off" autocomplete="off"/>
        <button class="submit-btn" data-action="submit-login" ${S.busy ? 'disabled' : ''}>เข้าแอป</button>
      </div>
      ${toastHtml()}
    </div>`;
  }

  function renderApp() {
    const isMainTab = ['dashboard', 'manage', 'history', 'settings'].includes(S.screen);
    const showBack = ['debtDetail', 'debtSettings', 'pawnSettings', 'expenseSettings', 'addEdit', 'notifications', 'debtList', 'pawnList', 'expenses'].includes(S.screen);
    const showFab = ['dashboard', 'debtList', 'pawnList', 'expenses'].includes(S.screen);

    return `
      <div class="header">
        ${showBack ? `<button class="icon-btn" data-action="back">${svgBack('#1B2422')}</button>` : ''}
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
          ${S.switchableUsers.map((u) => `<div class="fab-menu-item" data-action="switch-user" data-id="${u.id}" style="${u.id === S.currentUser.id ? 'font-weight:700;color:#0E6B5C' : ''}">${u.id === S.currentUser.id ? '✓ ' : ''}${esc(u.username)}${u.is_admin ? ' (แอดมิน)' : ''}</div>`).join('')}
        </div>` : '';
      return `
        <div style="flex:1">
          <div class="header-greeting">สวัสดี 👋 ${esc((S.currentUser || {}).username || '')}${viewingOther ? ' <span style="color:#92600A">(กำลังดูของคนอื่น)</span>' : ''}</div>
          <div class="header-title-lg">ภาพรวมของคุณ</div>
        </div>
        <div style="display:flex;align-items:center;gap:2px;position:relative">
          ${isAdmin ? `<button class="icon-btn" data-action="toggle-user-menu">${svgSwap()}</button>` : ''}
          <button class="icon-btn" style="position:relative" data-action="open-notifications">${svgBell()}${S.unreadCount ? `<span style="position:absolute;top:4px;right:4px;background:#D64545;color:#fff;border-radius:50%;min-width:16px;height:16px;font-size:10px;display:flex;align-items:center;justify-content:center;padding:0 3px">${S.unreadCount}</span>` : ''}</button>
          <button class="icon-btn" data-action="logout">${svgLogout()}</button>
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
      ? `<button class="icon-btn" data-action="open-debt-settings" data-id="${S.selectedDebtId}">${svgGear('#1B2422')}</button>`
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

  function renderDashboard() {
    const r = S.report;
    if (!r) return `<div class="screen-pad"><div class="empty-card"><div class="empty-text">กำลังโหลด...</div></div></div>`;

    // `cat` makes the tile a shortcut into the pawn list filtered to that category.
    const stat = (label, amount, bg, fg, sub, cat) => `
      <div class="report-stat" style="background:${bg}${cat ? ';cursor:pointer' : ''}" ${cat ? `data-action="goto-pawn-cat" data-cat="${cat}"` : ''}>
        <div class="report-stat-label" style="color:${fg}">${label}${cat ? ' ›' : ''}</div>
        <div class="report-stat-amount" style="color:${fg}">฿${formatMoney(amount)}</div>
        ${sub ? `<div class="report-stat-sub" style="color:${fg}">${sub}</div>` : ''}
      </div>`;

    // Jewelry and electronics get their own cards (replacing the single combined pawn card):
    // each shows principal on top with the interest owed underneath, since that's the number
    // actually due each cycle and the two categories accrue it on completely different rules.
    const stats = `
      <div class="report-grid">
        ${stat('ยอดหนี้สิน', r.total_debt, '#E3F3EF', '#0E6B5C')}
        ${stat('ค่าใช้จ่ายประจำต่อเดือน', r.total_recurring, '#FFF3DD', '#92600A')}
        ${stat('💍 ตั๋วทอง', r.total_pawn_jewelry, '#FBF0D2', '#8A6A12', `${r.count_pawn_jewelry} ใบ · ดอก ฿${formatMoney(r.interest_jewelry)}`, 'jewelry')}
        ${stat('📱 ตั๋วอิเล็กทรอนิก', r.total_pawn_other, '#E1EBF7', '#2A5F97', `${r.count_pawn_other} ใบ · ดอก ฿${formatMoney(r.interest_other)}`, 'nonjewelry')}
      </div>
      <div class="report-stat" style="background:#FDEAEA;margin-bottom:16px">
        <div class="report-stat-label" style="color:#B23B3B">ต้องชำระเดือนนี้ (รวมทุกหมวด)</div>
        <div class="report-stat-amount" style="color:#B23B3B">฿${formatMoney(r.total_due_this_month)}</div>
      </div>`;

    // Overdue or due within 2 days is treated as needing action right now, split into its own
    // "ครบกำหนดชำระ (ด่วน)" section above the regular monthly list so it can't get buried among
    // items that still have weeks to go.
    const urgent = r.breakdown.filter((it) => daysUntil(it.due_date) <= 2);
    const normal = r.breakdown.filter((it) => daysUntil(it.due_date) > 2);
    const rowsHtml = (list) => `<div style="display:flex;flex-direction:column;gap:10px">${list.map(renderDueRow).join('')}</div>`;

    return `
      <div class="screen-pad">
        ${stats}
        ${urgent.length ? `
          <div class="section-title" style="color:#B23B3B">⚠️ ครบกำหนดชำระ (ด่วน)</div>
          ${rowsHtml(urgent)}
        ` : ''}
        <div class="section-title">รายการที่ต้องชำระเดือนนี้</div>
        ${normal.length ? rowsHtml(normal) : (urgent.length ? '' : `
          <div class="empty-card"><div class="empty-emoji">✅</div><div class="empty-text">ชำระครบทุกรายการของเดือนนี้แล้ว</div></div>`)}
      </div>`;
  }

  function renderDueRow(it) {
    const kindLabel = { installment: 'งวดผ่อน', pawn: 'ตั๋วจำนำ', expense: 'ค่าใช้จ่ายประจำ' }[it.type];
    const kindBg = { installment: '#E3F3EF', pawn: '#EFE7F8', expense: '#FFF3DD' }[it.type];
    const kindFg = { installment: '#0E6B5C', pawn: '#6B3FA0', expense: '#92600A' }[it.type];
    const action = it.type === 'installment'
      ? `<button class="mark-paid-btn" data-action="mark-paid" data-id="${it.ref_id}" data-debt="${it.debt_id}" ${lockAttr()}>${btnLabel('paid:' + it.ref_id, 'บันทึกว่าจ่ายแล้ว')}</button>`
      : it.type === 'expense'
      ? `<button class="mark-paid-btn" data-action="mark-expense-paid" data-id="${it.ref_id}" data-expense-type="${it.expense_type}" ${lockAttr()}>${btnLabel('expense:' + it.ref_id, 'บันทึกว่าจ่ายแล้ว')}</button>`
      : `<div style="display:flex;gap:6px;flex-wrap:wrap">
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

  function renderManage() {
    const r = S.report || {};
    const cards = [
      { screen: 'debtList', icon: svgList('#0E6B5C'), label: 'หนี้สิน', sub: `คงเหลือ ฿${formatMoney(r.total_debt || 0)}`, bg: '#E3F3EF' },
      { screen: 'pawnList', cat: 'jewelry', icon: svgTicket('#8A6A12'), label: '💍 ตั๋วจำนำ — ทอง', sub: `${r.count_pawn_jewelry || 0} ใบ · ฿${formatMoney(r.total_pawn_jewelry || 0)} · ดอก ฿${formatMoney(r.interest_jewelry || 0)}`, bg: '#FBF0D2' },
      { screen: 'pawnList', cat: 'nonjewelry', icon: svgTicket('#2A5F97'), label: '📱 ตั๋วจำนำ — อิเล็กทรอนิก', sub: `${r.count_pawn_other || 0} ใบ · ฿${formatMoney(r.total_pawn_other || 0)} · ดอก ฿${formatMoney(r.interest_other || 0)}`, bg: '#E1EBF7' },
      { screen: 'expenses', icon: svgWallet('#92600A'), label: 'ค่าใช้จ่ายประจำ', sub: `฿${formatMoney(r.total_recurring || 0)}/เดือน`, bg: '#FFF3DD' },
    ];
    return `<div class="screen-pad">${cards.map((c) => `
      <div class="card" style="display:flex;align-items:center;gap:14px;cursor:pointer" ${c.cat ? `data-action="goto-pawn-cat" data-cat="${c.cat}"` : `data-action="nav-manage" data-screen="${c.screen}"`}>
        <div style="width:44px;height:44px;border-radius:12px;background:${c.bg};display:flex;align-items:center;justify-content:center;flex:none">${c.icon}</div>
        <div style="flex:1">
          <div class="settings-row-title">${c.label}</div>
          <div style="font-size:13px;color:#5C6C68">${esc(c.sub)}</div>
        </div>
        ${svgChevron()}
      </div>`).join('')}</div>`;
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

  function renderHistoryItem(it) {
    const typeMeta = {
      renew: { label: 'ต่อดอก', bg: '#EFE7F8', fg: '#6B3FA0' },
      redeem: { label: 'ไถ่ถอน', bg: '#E3F3EF', fg: '#0E6B5C' },
      installment: { label: 'ผ่อนหนี้', bg: '#E3F3EF', fg: '#0E6B5C' },
      expense: { label: 'ค่าใช้จ่าย', bg: '#FFF3DD', fg: '#92600A' },
    }[it.type];
    const clickable = ['installment', 'expense', 'renew', 'redeem'].includes(it.type);
    return `
      <div class="installment-row" ${clickable ? historyItemAction(it) + ' style="cursor:pointer"' : ''}>
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:6px">
            <span class="near-kind" style="background:${typeMeta.bg};color:${typeMeta.fg}">${typeMeta.label}</span>
            <span class="installment-date">${esc(it.title)}</span>
          </div>
          <div class="installment-amount">฿${formatMoney(it.amount)} · ${it.date ? formatDate(it.date) : '-'}</div>
        </div>
        ${clickable ? svgChevron() : ''}
      </div>`;
  }

  function renderHistory() {
    const h = S.history;
    if (!h) return `<div class="screen-pad"><div class="empty-card"><div class="empty-text">กำลังโหลด...</div></div></div>`;
    const s = h.summary;
    const summaryCard = `
      <div class="card" style="display:flex;flex-direction:column;gap:8px">
        <div class="section-title" style="margin:0">สรุปเดือนนี้ (${formatMonthLabel(s.month)})</div>
        <div class="row-between"><span style="color:#5C6C68">ดอกเบี้ยต่อดอก</span><span style="font-weight:600">฿${formatMoney(s.interest_paid)}</span></div>
        <div class="row-between"><span style="color:#5C6C68">งวดผ่อนหนี้</span><span style="font-weight:600">฿${formatMoney(s.installments_paid)}</span></div>
        <div class="row-between"><span style="color:#5C6C68">ค่าใช้จ่ายประจำ</span><span style="font-weight:600">฿${formatMoney(s.expenses_paid)}</span></div>
        <div class="row-between" style="border-top:1px solid #E7ECEA;padding-top:8px">
          <span style="font-weight:700">รวมใช้จ่ายจริง</span><span style="font-weight:700;color:#B23B3B">฿${formatMoney(s.net_spend)}</span>
        </div>
        ${s.redeemed_cash ? `<div style="font-size:12px;color:#A6ACAA">+ เงินต้นไถ่ถอนคืน ฿${formatMoney(s.redeemed_cash)} (ได้ของคืน ไม่นับเป็นค่าใช้จ่าย) · เงินสดจ่ายออกทั้งหมด ฿${formatMoney(s.total_cash_out)}</div>` : ''}
      </div>`;
    const empty = !h.items.length ? `<div class="empty-card"><div class="empty-emoji">🕐</div><div class="empty-text">ยังไม่มีประวัติ</div></div>` : '';
    const rows = h.items.map(renderHistoryItem).join('');
    return `<div class="screen-pad">
      ${summaryCard}
      <div class="section-title">ประวัติทั้งหมด</div>
      ${empty}${h.items.length ? `<div style="display:flex;flex-direction:column;gap:10px">${rows}</div>` : ''}
    </div>`;
  }

  function renderDebtList() {
    if (!S.debts.length) {
      return `<div class="screen-pad"><div class="empty-card"><div class="empty-emoji">📋</div><div class="empty-text">ยังไม่มีรายการหนี้ กดปุ่ม + เพื่อเพิ่ม</div></div></div>`;
    }
    const cards = S.debts.map((d) => {
      const paidPercent = d.total_amount ? Math.min(100, Math.round((d.total_amount - d.remaining_amount) / d.total_amount * 100)) : 0;
      return `
        <div class="debt-card" data-action="open-debt" data-id="${d.id}">
          <div class="row-between">
            <div class="debt-name">${esc(d.name)}</div>
            ${svgChevron()}
          </div>
          <div class="row-between">
            <div class="debt-remaining">฿${formatMoney(d.remaining_amount)}</div>
            <div class="debt-total">จาก ฿${formatMoney(d.total_amount)}</div>
          </div>
          <div class="progress-track"><div class="progress-fill" style="width:${paidPercent}%"></div></div>
          <div class="progress-label">ผ่อนแล้ว ${paidPercent}%</div>
        </div>`;
    }).join('');
    return `<div class="screen-pad">${cards}</div>`;
  }

  function renderDebtDetail() {
    const d = S.debts.find((x) => x.id === S.selectedDebtId);
    if (!d) return `<div class="screen-pad"><div class="empty-card"><div class="empty-text">ไม่พบข้อมูล</div></div></div>`;
    const paidPercent = d.total_amount ? Math.min(100, Math.round((d.total_amount - d.remaining_amount) / d.total_amount * 100)) : 0;
    const installments = (d.installments || []).map((i) => {
      const status = statusOf(!!i.paid, i.due_date);
      const meta = STATUS_META[status];
      const label = status === 'paid' ? meta.label : daysLabel(daysUntil(i.due_date), status);
      return `
        <div class="installment-row">
          <div style="flex:1">
            <div class="installment-date">${formatDate(i.due_date)}</div>
            <div class="installment-amount">฿${formatMoney(i.amount)}</div>
          </div>
          <div class="status-badge" style="background:${meta.bg};color:${meta.fg}">${label}</div>
          ${!i.paid ? `<button class="mark-paid-btn" data-action="mark-paid" data-id="${i.id}" data-debt="${d.id}">บันทึกว่าจ่ายแล้ว</button>` : ''}
        </div>`;
    }).join('');

    return `
      <div class="screen-pad">
        <div class="card" style="display:flex;flex-direction:column;gap:10px">
          <div class="row-between">
            <div style="font-size:22px;font-weight:700;color:#1B2422">฿${formatMoney(d.remaining_amount)}</div>
            <div class="debt-total">จาก ฿${formatMoney(d.total_amount)}</div>
          </div>
          <div class="progress-track"><div class="progress-fill" style="width:${paidPercent}%"></div></div>
          <div class="progress-label">ผ่อนแล้ว ${paidPercent}%</div>
        </div>
        <div class="section-title">ตารางงวดผ่อน</div>
        <div style="display:flex;flex-direction:column;gap:10px">${installments}</div>
      </div>`;
  }

  function renderDebtSettings() {
    const id = S.editingDebtId;
    const dayOptions = Array.from({ length: 28 }, (_, i) => i + 1)
      .map((n) => `<option value="${n}" ${String(n) === S.forms.dueDay ? 'selected' : ''}>${n}</option>`).join('');
    return `
      <div class="screen-pad">
        <div style="display:flex;flex-direction:column;gap:14px">
          <div><div class="field-label">ชื่อหนี้</div><input class="field-input" data-bind="name" value="${esc(S.forms.name)}"/></div>
          <div class="field-row">
            <div class="field-1"><div class="field-label">ยอดหนี้ทั้งหมด</div><input class="field-input" type="number" data-bind="total" value="${esc(S.forms.total)}"/></div>
            <div class="field-1"><div class="field-label">ยอดคงเหลือ</div><input class="field-input" type="number" data-bind="remaining" value="${esc(S.forms.remaining)}"/></div>
          </div>
          <div class="field-row">
            <div class="field-1">
              <div class="field-label">จ่ายทุกวันที่</div>
              <select class="field-input" data-bind="dueDay">${dayOptions}</select>
            </div>
            <div class="field-1"><div class="field-label">ยอดผ่อนต่อเดือน (งวดที่ยังไม่จ่ายจะถูกปรับตามนี้)</div><input class="field-input" type="number" data-bind="installmentAmount" value="${esc(S.forms.installmentAmount)}"/></div>
          </div>
          <button class="submit-btn" data-action="submit-edit-debt">บันทึกการแก้ไข</button>
        </div>
        <div class="section-title">การจัดการหนี้</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <button class="mark-paid-btn" style="width:100%;background:#E7F5EE;color:#1F7A52" data-action="close-debt" data-id="${id}">✓ ปิดหนี้ (ชำระครบแล้ว)</button>
          <button class="mark-paid-btn" style="width:100%;background:#FDEAEA;color:#B23B3B" data-action="delete-debt" data-id="${id}">🗑 ลบหนี้ถาวร</button>
        </div>
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
    const filterChips = `
      <div class="warn-options" style="margin-bottom:12px">
        <button class="warn-opt ${!S.pawnFilter ? 'selected' : ''}" data-action="set-pawn-filter" data-cat="">ทั้งหมด (${S.pawns.length})</button>
        <button class="warn-opt ${S.pawnFilter === 'jewelry' ? 'selected' : ''}" data-action="set-pawn-filter" data-cat="jewelry">💍 ทอง (${S.pawns.filter((p) => p.category === 'jewelry').length})</button>
        <button class="warn-opt ${S.pawnFilter === 'nonjewelry' ? 'selected' : ''}" data-action="set-pawn-filter" data-cat="nonjewelry">📱 อิเล็กทรอนิก (${S.pawns.filter((p) => p.category !== 'jewelry').length})</button>
      </div>`;
    const empty = !list.length ? `
      <div class="empty-card"><div class="empty-emoji">🎫</div><div class="empty-text">${S.pawns.length ? 'ไม่มีตั๋วในหมวดนี้' : 'ยังไม่มีตั๋วจำนำ กดปุ่ม + เพื่อเพิ่ม'}</div></div>` : '';
    const cards = list.map((p) => renderPawnCard(p)).join('');
    return `<div class="screen-pad">${filterChips}${empty}${cards}</div>`;
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
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid #F0F3F2">
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
              <div style="font-size:16px;font-weight:700;color:#1B2422">${esc((S.detailHistoryItem || {}).title || 'ตั๋วจำนำ')}</div>
              <div class="pawn-shop">กำลังโหลดรายละเอียด...</div>
            </div>
            <button class="icon-btn" data-action="close-pawn-detail" style="width:30px;height:30px;font-size:20px;line-height:1;color:#5C6C68">×</button>
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
      `<div class="row-between" style="padding:7px 0;border-bottom:1px solid #F0F3F2">
        <span style="font-size:13px;color:#5C6C68">${label}</span>
        <span style="font-size:13.5px;font-weight:600;color:${color || '#1B2422'};text-align:right">${value}</span>
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
              <span class="near-kind" style="background:#EFEFEF;color:#5C6C68">${meta.icon} ${meta.label}</span>
              <div style="font-size:16px;font-weight:700;color:#1B2422;margin-top:6px">${esc(p.item_name)}</div>
              <div class="pawn-shop">${esc(p.shop_name || 'ไม่ระบุร้าน')}${p.ticket_code ? ' · เลขที่ตั๋ว ' + esc(p.ticket_code) : ''}</div>
            </div>
            <button class="icon-btn" data-action="close-pawn-detail" style="width:30px;height:30px;font-size:20px;line-height:1;color:#5C6C68">×</button>
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

  function renderPawnCard(p, from) {
    const categoryMeta = PAWN_CATEGORIES.find((c) => c.key === p.category) || PAWN_CATEGORIES[3];
    const isJewelry = p.category === 'jewelry';
    const pawnDate = p.pawn_date || (p.created_at || '').slice(0, 10);
    const shopLine = esc(p.shop_name || 'ไม่ระบุร้าน') + (p.ticket_code ? ' · เลขที่ตั๋ว ' + esc(p.ticket_code) : '');
    const pawnDateLine = `<div class="pawn-shop">จำนำเมื่อ ${formatDate(pawnDate)}</div>`;

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

      if (pastFinal) {
        badgeLabel = '⚠️ ใกล้ขาดจำนำ'; badgeBg = '#D64545'; badgeFg = '#fff';
      } else if (term.overdue) {
        badgeLabel = '⚠️ เลยกำหนดต่อดอก'; badgeBg = '#D64545'; badgeFg = '#fff';
      } else if (atFourMonths) {
        badgeLabel = '⚠️ ครบ 4 งวดแล้ว'; badgeBg = '#FFF3DD'; badgeFg = '#92600A';
      } else {
        badgeLabel = `งวดที่ ${term.billed} / ${JEWELRY_BILLED_MONTHS}`; badgeBg = '#EFEFEF'; badgeFg = '#6B6B6B';
      }

      const urgentColor = pastFinal || term.overdue ? ';color:#B23B3B' : atFourMonths ? ';color:#92600A' : '';
      bodyHtml = `
        <div class="pawn-footer">
          <div class="pawn-amount">฿${formatMoney(p.amount)}</div>
          <div class="pawn-due">ครบกำหนดสุดท้าย ${formatDate(finalDueDate)}</div>
        </div>
        ${p.interest ? `<div class="field-label" style="margin-bottom:0${urgentColor}">ดอกเบี้ย ฿${formatMoney(p.interest)}/งวด × ${term.billed} งวด = สะสม ฿${formatMoney(accrued)}</div>` : ''}
        ${pastFinal ? `<div class="field-label" style="color:#B23B3B;margin-bottom:0">เลยกำหนดสุดท้ายแล้ว กรุณาไถ่ถอนโดยเร็ว มิฉะนั้นจะเสียสิทธิ์</div>`
          : term.overdue ? `<div class="field-label" style="color:#B23B3B;margin-bottom:0">เลยกำหนดต่อดอกมา ${term.elapsed - JEWELRY_BILLED_MONTHS} เดือน (ดอกหยุดนับที่ ${JEWELRY_BILLED_MONTHS} งวด) ต้องต่อดอกหรือไถ่ก่อน ${formatDate(finalDueDate)}</div>`
          : atFourMonths ? `<div class="field-label" style="color:#92600A;margin-bottom:0">ครบ ${JEWELRY_BILLED_MONTHS} งวดแล้ว ต้องต่อดอกหรือไถ่ก่อน ${formatDate(finalDueDate)}</div>` : ''}`;
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

      bodyHtml = `
        <div class="pawn-footer">
          <div class="pawn-amount">฿${formatMoney(p.amount)}${p.interest ? ` <span style="font-size:12px;color:#92600A;font-weight:400">(ดอก ฿${formatMoney(p.interest)})</span>` : ''}</div>
          <div class="pawn-due">ครบกำหนด ${formatDate(p.due_date)}</div>
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
        <div style="display:flex;gap:12px;align-items:center">
          <div class="pawn-icon">${svgPawn()}</div>
          <div style="flex:1;min-width:0;cursor:pointer" data-action="open-pawn-detail" data-id="${p.id}">
            <div style="display:flex;align-items:center;gap:6px">
              <span class="near-kind" style="background:#EFEFEF;color:#5C6C68">${categoryMeta.icon} ${categoryMeta.label}</span>
            </div>
            <div class="pawn-item">${esc(p.item_name)}</div>
            <div class="pawn-shop">${shopLine}</div>
            ${pawnDateLine}
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            <div class="near-badge" style="background:${badgeBg};color:${badgeFg}">${badgeLabel}</div>
            <button class="icon-btn" data-action="open-pawn-settings" data-id="${p.id}" data-from="${from || ''}" style="width:28px;height:28px">${svgGear('#5C6C68')}</button>
          </div>
        </div>
        ${bodyHtml}
        ${p.renew_url ? `<a href="${esc(p.renew_url)}" target="_blank" rel="noopener" class="pawn-btn renew" style="text-align:center;text-decoration:none;display:block">🔗 ต่อดอกออนไลน์ (จาก QR ตั๋ว)</a>` : ''}
        ${actionsHtml}
      </div>`;
  }

  // Shared by the expenses list and the report screen's expense section.
  function renderExpenseCard(e, from) {
    const isVariable = e.expense_type === 'variable';
    const typeLabel = isVariable ? 'ไม่คงที่ ต้องจ่ายทุกเดือน' : 'ยอดคงที่ทุกเดือน';
    const amountLine = isVariable
      ? (e.last_amount != null ? `฿${formatMoney(e.last_amount)} <span style="font-size:12px;color:#8A9490">(ล่าสุด)</span>` : `<span style="font-size:13px;color:#8A9490">ยังไม่มีข้อมูล</span>`)
      : `฿${formatMoney(e.amount)}`;
    const payPrompt = S.expensePayFor === e.id ? `
        <div class="warn-options" style="width:100%">
          <input class="field-input" type="number" data-bind="expensePayAmount" value="${esc(S.forms.expensePayAmount)}" placeholder="ยอดที่จ่ายจริงเดือนนี้"/>
          <button class="submit-btn" data-action="confirm-expense-pay" data-id="${e.id}" ${lockAttr()}>${btnLabel('expense:' + e.id, 'ยืนยัน')}</button>
        </div>` : '';
    return `
      <div class="debt-card">
        <div class="row-between">
          <div class="debt-name">${esc(e.name)}</div>
          <button class="icon-btn" data-action="open-expense-settings" data-id="${e.id}" data-from="${from || ''}" style="width:28px;height:28px">${svgGear('#5C6C68')}</button>
        </div>
        <div class="row-between">
          <div class="debt-remaining">${amountLine}</div>
          <div class="debt-total">${typeLabel} · จ่ายทุกวันที่ ${e.due_day}</div>
        </div>
        ${e.paid_this_month
          ? `<div class="status-badge" style="background:#E7F5EE;color:#1F7A52;align-self:flex-start">จ่ายแล้วเดือนนี้</div>`
          : `<button class="mark-paid-btn" data-action="mark-expense-paid" data-id="${e.id}" data-expense-type="${e.expense_type}" style="align-self:flex-start" ${lockAttr()}>${btnLabel('expense:' + e.id, 'บันทึกว่าจ่ายแล้ว')}</button>`}
        ${payPrompt}
      </div>`;
  }

  function renderExpenses() {
    const empty = !S.expenses.length ? `
      <div class="empty-card"><div class="empty-emoji">🧾</div><div class="empty-text">ยังไม่มีค่าใช้จ่ายประจำ กดปุ่ม + เพื่อเพิ่ม</div></div>` : '';
    const cards = S.expenses.map((e) => renderExpenseCard(e)).join('');
    return `<div class="screen-pad">${empty}${cards}</div>`;
  }

  // Shared by the "add pawn" form and the pawn settings screen — same fields either way.
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
        <div>
          <div class="field-label">ครบกำหนดต่อดอก</div>
          <div class="warn-options">${periodChips}</div>
        </div>
        ${isCustomPeriod ? `<div><div class="field-label">ระบุจำนวนวันต่อรอบ</div><input class="field-input" type="number" min="1" data-bind="pawnCustomDays" value="${esc(S.forms.pawnCustomDays)}" placeholder="เช่น 7, 10, 20"/></div>` : ''}
        ${renderDateField('dueDate', 'วันครบกำหนดงวดแรก')}
        <div class="field-label">ไม่รู้ว่าจำนำมาวันไหน แต่รู้วันครบกำหนด (เช่น ร้านนัดจ่ายวันที่ 10) ก็เลือกวันนั้นเป็นงวดแรกได้เลย — งวดถัดไปจะนับต่อจากวันนี้ไปเรื่อยๆ ทุก${isCustomPeriod ? (S.forms.pawnCustomDays || 'N') + ' วัน' : ' ' + (PERIOD_OPTIONS.find((o) => o.key === S.forms.pawnPeriod) || {}).label}</div>`;
    return `
        <div>
          <div class="field-label">หมวดหมู่</div>
          <div class="warn-options">${categoryChips}</div>
        </div>
        <div><div class="field-label">ชื่อสินค้า</div><input class="field-input" data-bind="itemName" value="${esc(S.forms.itemName)}" placeholder="เช่น ทองคำแท่ง 1 บาท"/></div>
        <div><div class="field-label">ร้านจำนำ</div><input class="field-input" data-bind="shop" value="${esc(S.forms.shop)}" placeholder="ชื่อร้าน"/></div>
        <div><div class="field-label">รหัสตั๋ว (ถ้ามี)</div><input class="field-input" data-bind="ticketCode" value="${esc(S.forms.ticketCode)}" placeholder="เลขที่ตั๋วจำนำ"/></div>
        <div><div class="field-label">ลิงก์ต่อดอกออนไลน์ (จาก QR code บนตั๋ว ถ้ามี)</div><input class="field-input" type="url" data-bind="renewUrl" value="${esc(S.forms.renewUrl)}" placeholder="https://..."/></div>
        <div class="field-row">
          <div class="field-1"><div class="field-label">ยอดเงินต้น</div><input class="field-input" type="number" data-bind="amount" value="${esc(S.forms.amount)}" placeholder="0"/></div>
          <div class="field-1"><div class="field-label">${isJewelry ? 'อัตราดอกเบี้ยต่อเดือน' : 'ยอดต่อดอก (ถ้ามี)'}</div><input class="field-input" type="number" data-bind="interest" value="${esc(S.forms.interest)}" placeholder="0"/></div>
        </div>
        ${renderDateField('pawnDate', 'วันที่จำนำ')}
        ${periodSection}
        ${isJewelry ? `<div class="field-label" style="color:#92600A">หมวดเครื่องประดับ: ดอกเบี้ยคิดเป็นรายเดือนจาก "วันที่จำนำ" (เดือนละเท่ากับอัตราที่กรอกไว้ สะสมไปเรื่อยๆ) ครบเดือนที่ 4 จะเตือน เดือนที่ 5 คือกำหนดไถ่ถอนสุดท้าย</div>` : ''}`;
  }

  function renderPawnSettings() {
    return `
      <div class="screen-pad">
        <div style="display:flex;flex-direction:column;gap:14px">
          ${renderPawnFormFields()}
          <button class="submit-btn" data-action="submit-edit-pawn">บันทึกการแก้ไข</button>
        </div>
        <div class="section-title">การจัดการตั๋วจำนำ</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <button class="mark-paid-btn" style="width:100%;background:#FDEAEA;color:#B23B3B" data-action="delete-pawn" data-id="${S.editingPawnId}">🗑 ลบตั๋วจำนำถาวร</button>
        </div>
      </div>`;
  }

  // Shared by the "add expense" form and the expense settings screen — same fields either way.
  function renderExpenseFormFields() {
    const isVariableExpense = S.forms.expenseType === 'variable';
    const expenseDayOptions = Array.from({ length: 28 }, (_, i) => i + 1)
      .map((n) => `<option value="${n}" ${String(n) === S.forms.expenseDueDay ? 'selected' : ''}>${n}</option>`).join('');
    const expenseTypeChips = `
      <button class="warn-opt ${!isVariableExpense ? 'selected' : ''}" data-action="expense-type" data-key="fixed">ยอดคงที่ทุกเดือน</button>
      <button class="warn-opt ${isVariableExpense ? 'selected' : ''}" data-action="expense-type" data-key="variable">ไม่คงที่ ต้องจ่ายทุกเดือน</button>`;
    return `
        <div><div class="field-label">ชื่อค่าใช้จ่าย</div><input class="field-input" data-bind="expenseName" value="${esc(S.forms.expenseName)}" placeholder="เช่น ค่าเช่าห้อง, ค่าไฟ, ค่าเน็ต"/></div>
        <div>
          <div class="field-label">ลักษณะค่าใช้จ่าย</div>
          <div class="warn-options">${expenseTypeChips}</div>
        </div>
        <div class="field-row">
          ${isVariableExpense ? '' : `<div class="field-1"><div class="field-label">ยอดต่อเดือน</div><input class="field-input" type="number" data-bind="expenseAmount" value="${esc(S.forms.expenseAmount)}" placeholder="0"/></div>`}
          <div class="field-1">
            <div class="field-label">จ่ายทุกวันที่</div>
            <select class="field-input" data-bind="expenseDueDay">${expenseDayOptions}</select>
          </div>
        </div>
        ${isVariableExpense ? `<div class="field-label" style="color:#92600A">ยอดไม่คงที่ (เช่น ค่าน้ำ ค่าไฟ ค่าเน็ต): กรอกยอดจริงทุกครั้งตอนบันทึกว่าจ่ายแล้ว</div>` : ''}`;
  }

  function renderExpenseSettings() {
    return `
      <div class="screen-pad">
        <div style="display:flex;flex-direction:column;gap:14px">
          ${renderExpenseFormFields()}
          <button class="submit-btn" data-action="submit-edit-expense">บันทึกการแก้ไข</button>
        </div>
        <div class="section-title">การจัดการค่าใช้จ่าย</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <button class="mark-paid-btn" style="width:100%;background:#FDEAEA;color:#B23B3B" data-action="delete-expense" data-id="${S.editingExpenseId}">🗑 ลบค่าใช้จ่ายนี้ถาวร</button>
        </div>
      </div>`;
  }

  function renderAddEdit() {
    const isDebt = S.addType === 'debt';
    const isPawn = S.addType === 'pawn';
    const isExpense = S.addType === 'expense';
    const dayOptions = Array.from({ length: 28 }, (_, i) => i + 1)
      .map((n) => `<option value="${n}" ${String(n) === S.forms.dueDay ? 'selected' : ''}>${n}</option>`).join('');

    const debtForm = `
      <div style="display:flex;flex-direction:column;gap:14px">
        <div>
          <div class="field-label">ชื่อหนี้</div>
          <input class="field-input" data-bind="name" value="${esc(S.forms.name)}" placeholder="เช่น บัตรเครดิต, สินเชื่อส่วนบุคคล"/>
        </div>
        <div class="field-row">
          <div class="field-1"><div class="field-label">ยอดหนี้ทั้งหมด</div><input class="field-input" type="number" data-bind="total" value="${esc(S.forms.total)}" placeholder="0"/></div>
          <div class="field-1"><div class="field-label">ยอดคงเหลือ</div><input class="field-input" type="number" data-bind="remaining" value="${esc(S.forms.remaining)}" placeholder="0"/></div>
        </div>
        <div class="field-row">
          <div class="field-1">
            <div class="field-label">จ่ายทุกวันที่</div>
            <select class="field-input" data-bind="dueDay">${dayOptions}</select>
          </div>
          <div class="field-1"><div class="field-label">ยอดผ่อนต่อเดือน</div><input class="field-input" type="number" data-bind="installmentAmount" value="${esc(S.forms.installmentAmount)}" placeholder="0"/></div>
        </div>
        <button class="submit-btn" data-action="submit-debt">บันทึกหนี้ใหม่</button>
      </div>`;

    const pawnForm = `
      <div style="display:flex;flex-direction:column;gap:14px">
        ${renderPawnFormFields()}
        <button class="submit-btn" data-action="submit-pawn">บันทึกตั๋วจำนำ</button>
      </div>`;

    const expenseForm = `
      <div style="display:flex;flex-direction:column;gap:14px">
        ${renderExpenseFormFields()}
        <button class="submit-btn" data-action="submit-expense">บันทึกค่าใช้จ่ายประจำ</button>
      </div>`;

    return `
      <div class="screen-pad">
        <div class="segmented">
          <button class="segmented-btn ${isDebt ? 'active' : ''}" data-action="add-type" data-type="debt">หนี้ใหม่</button>
          <button class="segmented-btn ${isPawn ? 'active' : ''}" data-action="add-type" data-type="pawn">ตั๋วจำนำใหม่</button>
          <button class="segmented-btn ${isExpense ? 'active' : ''}" data-action="add-type" data-type="expense">ค่าใช้จ่าย</button>
        </div>
        ${isDebt ? debtForm : isPawn ? pawnForm : expenseForm}
      </div>`;
  }

  function renderSettings() {
    const opts = [1, 3, 5, 7, 14].map((n) => `<button class="warn-opt ${n === S.warnDays ? 'selected' : ''}" data-action="warn-days" data-n="${n}">${n} วัน</button>`).join('');
    return `
      <div class="screen-pad">
        <button class="card" data-action="export-excel" style="width:100%;border:none;cursor:pointer;background:linear-gradient(135deg,#0E6B5C,#123F35);display:flex;align-items:center;gap:14px;text-align:left;font:inherit">
          <div style="width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,0.16);display:flex;align-items:center;justify-content:center;flex:none">${svgDownload()}</div>
          <div style="flex:1;min-width:0">
            <div style="color:#fff;font-weight:700;font-size:15px">ดาวน์โหลดรายงาน Excel</div>
            <div style="color:rgba(255,255,255,0.78);font-size:12.5px">หนี้สิน · ตั๋วจำนำ · ค่าใช้จ่ายประจำ ทั้งหมด</div>
          </div>
        </button>
        <div class="card" style="display:flex;flex-direction:column;gap:12px">
          <div class="settings-row-title">แจ้งเตือนล่วงหน้ากี่วันก่อนครบกำหนด</div>
          <div class="warn-options">${opts}</div>
        </div>
        <div class="card" style="display:flex;flex-direction:column;gap:8px">
          <div class="settings-row-title">ทดสอบการแจ้งเตือน</div>
          <div class="settings-row-sub">แอปนี้ไม่มีการแจ้งเตือนอัตโนมัติตอนปิดแอป (ดูกระดิ่งแจ้งเตือนในแอปแทน) กดปุ่มนี้เพื่อทดสอบว่าเบราว์เซอร์/มือถือของคุณแสดงการแจ้งเตือนได้จริง</div>
          <button class="mark-paid-btn" style="align-self:flex-start" data-action="test-notification">🔔 ทดสอบส่งแจ้งเตือน</button>
        </div>
        <div class="card settings-row">
          <div>
            <div class="settings-row-title">ผู้ใช้งาน</div>
            <div class="settings-row-sub">${esc((S.currentUser || {}).username || '')}${(S.realUser || {}).is_admin ? ' (แอดมิน)' : ''}</div>
          </div>
          <button class="mark-paid-btn" data-action="logout">ออกจากระบบ</button>
        </div>
      </div>`;
  }

  function renderNotifications() {
    const empty = !S.notifications.length ? `
      <div class="empty-card"><div class="empty-emoji">🔔</div><div class="empty-text">ยังไม่มีการแจ้งเตือน</div></div>` : '';
    const items = S.notifications.map((n) => {
      const unread = !n.read_at;
      const d = new Date(n.sent_at);
      const dateLabel = formatDate(n.sent_at.slice(0, 10)) + ' ' + d.toTimeString().slice(0, 5);
      return `
        <div class="card" style="display:flex;flex-direction:column;gap:4px;${unread ? 'border-left:3px solid #0E6B5C' : 'opacity:0.7'}" data-action="${unread ? 'mark-notif-read' : ''}" data-id="${n.id}">
          <div class="row-between">
            <div style="font-weight:600;color:#1B2422">${esc(n.title)}</div>
            ${unread ? `<div style="width:8px;height:8px;border-radius:50%;background:#0E6B5C;flex:none"></div>` : ''}
          </div>
          <div style="font-size:14px;color:#5C6C68">${esc(n.body)}</div>
          <div style="font-size:12px;color:#A6ACAA">${dateLabel}</div>
        </div>`;
    }).join('');
    return `<div class="screen-pad">${empty}${items}</div>`;
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
      const color = active ? '#0E6B5C' : '#A6ACAA';
      return `<button class="nav-item" data-action="nav" data-screen="${it.key}">${it.icon(color)}<span class="nav-label" style="color:${color}">${it.label}</span></button>`;
    }).join('')}</div>`;
  }

  // ---------------- Icons ----------------
  function svgLock() { return `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M7 7V5a5 5 0 0110 0v2"/></svg>`; }
  function svgBack(c) { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8"><path d="M15 18l-6-6 6-6"/></svg>`; }
  function svgChevron() { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A6ACAA" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>`; }
  function svgChevronDir(dir) { return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B2422" stroke-width="2"><path d="${dir === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'}"/></svg>`; }
  function svgCalendar() { return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5C6C68" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4" stroke-linecap="round"/></svg>`; }
  function svgPlus() { return `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>`; }
  function svgPawn() { return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#B8862F" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M8 12h8"/></svg>`; }
  function svgHome(c) { return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8"><path d="M3 11l9-7 9 7"/><path d="M5 10v9h14v-9"/></svg>`; }
  function svgList(c) { return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/></svg>`; }
  function svgTicket(c) { return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8"><path d="M3 12l6-8h9a3 3 0 013 3v3l-8 9a2 2 0 01-3 0l-7-6z"/><circle cx="15" cy="9" r="1.4"/></svg>`; }
  function svgWallet(c) { return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8"><path d="M3 7a2 2 0 012-2h13a1 1 0 011 1v2"/><path d="M3 7v11a2 2 0 002 2h14a1 1 0 001-1v-4"/><rect x="14" y="11" width="7" height="5" rx="1"/><circle cx="17" cy="13.5" r="0.8" fill="${c}"/></svg>`; }
  function svgHistory(c) { return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8"><path d="M3 12a9 9 0 109-9" stroke-linecap="round"/><path d="M3 4v5h5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 7v5l4 2" stroke-linecap="round" stroke-linejoin="round"/></svg>`; }
  function svgGear(c) { return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 13a7.6 7.6 0 000-2l1.9-1.5-2-3.4-2.3.6a7.7 7.7 0 00-1.7-1l-.3-2.4h-4l-.3 2.4a7.7 7.7 0 00-1.7 1l-2.3-.6-2 3.4L4.6 11a7.6 7.6 0 000 2l-1.9 1.5 2 3.4 2.3-.6a7.7 7.7 0 001.7 1l.3 2.4h4l.3-2.4a7.7 7.7 0 001.7-1l2.3.6 2-3.4z"/></svg>`; }
  function svgDownload() { return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><path d="M12 3v12M7 10l5 5 5-5" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 19h16" stroke-linecap="round"/></svg>`; }
  function svgBell(c) { return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c || '#1B2422'}" stroke-width="1.8"><path d="M6 9a6 6 0 0112 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9z"/><path d="M9.5 17a2.5 2.5 0 005 0"/></svg>`; }
  function svgLogout(c) { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c || '#1B2422'}" stroke-width="1.8"><path d="M15 17l5-5-5-5M20 12H9"/><path d="M9 19H6a2 2 0 01-2-2V7a2 2 0 012-2h3"/></svg>`; }
  function svgSwap(c) { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${c || '#0E6B5C'}" stroke-width="2"><path d="M7 4l-4 4 4 4M3 8h13M17 20l4-4-4-4M21 16H8"/></svg>`; }

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
      case 'toggle-date-picker': openDatePicker(el.dataset.field); break;
      case 'shift-date-month': shiftDatePickerMonth(Number(el.dataset.delta)); break;
      case 'pick-date': pickDate(el.dataset.field, el.dataset.date); break;
      case 'test-notification': testNotification(); break;
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
