// Debt & Pawn Tracker — vanilla JS PWA. Two fixed users (not/lek), login is just a username,
// no password. The admin user can switch to view/edit the other user's data.
(function () {
  'use strict';

  const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
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
  const JEWELRY_MAX_RENEWALS = 4;

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
    screen: 'login',           // login | dashboard | debtList | debtDetail | debtSettings | pawnList | pawnSettings | expenses | addEdit | settings | notifications
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
    renewPickerFor: null,
    expensePayFor: null,
    debts: [],
    pawns: [],
    expenses: [],
    report: null,
    notifications: [],
    unreadCount: 0,
    forms: {
      loginUsername: '',
      name: '', total: '', remaining: '', dueDay: '5', installmentAmount: '',
      itemName: '', shop: '', ticketCode: '', category: 'jewelry', amount: '', interest: '', dueDate: '', pawnPeriod: '1m', pawnCustomDays: '',
      pawnDate: '', renewUrl: '',
      expenseName: '', expenseType: 'fixed', expenseAmount: '', expenseDueDay: '5', expensePayAmount: '',
      pawnFinalDate: '',
    },
  };

  const app = document.getElementById('app');
  let toastTimer = null;

  function setState(patch) { Object.assign(S, patch); render(); }
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
      const [debts, pawns, expenses, report, settings] = await Promise.all([
        Api.getDebts(), Api.getPawns(), Api.getExpenses(), Api.getReport(), Api.getSettings(),
      ]);
      S.debts = debts;
      S.pawns = pawns;
      S.expenses = expenses;
      S.report = report;
      S.warnDays = settings.warn_days;
    } catch (e) {
      showToast('โหลดข้อมูลไม่สำเร็จ: ' + e.message);
    }
    S.busy = false; render();
  }

  async function loadNotifications() {
    try {
      const res = await Api.getNotifications();
      S.notifications = res.items;
      S.unreadCount = res.unread_count;
      render();
    } catch (e) { /* keep stale data */ }
  }

  // Quiet re-fetch of just the report summary after marking something paid, so the
  // dashboard's totals stay accurate without a full-screen loading spinner.
  async function refreshReport() {
    try { S.report = await Api.getReport(); render(); } catch (e) { /* keep stale data */ }
  }

  async function refreshDebtDetail(id) {
    try {
      const debt = await Api.getDebtDetail(id);
      const idx = S.debts.findIndex((d) => d.id === id);
      if (idx >= 0) S.debts[idx] = debt; else S.debts.push(debt);
    } catch (e) { showToast('โหลดรายละเอียดไม่สำเร็จ'); }
  }

  // ---------------- Navigation ----------------
  function nav(screen) { setState({ screen, fabMenuOpen: false }); }
  function goBack() { setState({ screen: S.returnScreen, fabMenuOpen: false }); }
  async function openDebt(id) {
    setState({ screen: 'debtDetail', selectedDebtId: id, returnScreen: 'debtList' });
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
  function openPawnSettings(id) {
    const p = S.pawns.find((x) => x.id === id);
    if (!p) return;
    const matchedOpt = PERIOD_OPTIONS.find((o) => o.key !== 'custom' && o.unit === p.period_unit && o.value === p.period_value);
    const isCustomCycle = !matchedOpt && p.period_unit === 'day' && p.period_value;
    setState({
      screen: 'pawnSettings', editingPawnId: id, returnScreen: 'pawnList',
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
      loadNotifications();
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
      loadNotifications();
      showToast('กำลังดูข้อมูลของ ' + res.user.username);
    } catch (e) { showToast(e.message || 'สลับผู้ใช้ไม่สำเร็จ'); }
  }

  function logout() {
    clearSession();
    setState({ screen: 'login', userMenuOpen: false, debts: [], pawns: [], expenses: [], report: null, notifications: [], unreadCount: 0 });
  }

  // ---------------- Actions ----------------
  async function markPaid(installmentId, debtId) {
    try {
      await Api.markInstallmentPaid(installmentId);
      await refreshDebtDetail(debtId);
      showToast('บันทึกการจ่ายเงินแล้ว');
      render();
      refreshReport();
    } catch (e) { showToast('บันทึกไม่สำเร็จ'); }
  }

  async function redeemPawn(id) {
    try {
      await Api.redeemPawn(id);
      S.pawns = S.pawns.filter((p) => p.id !== id);
      showToast('ไถ่ถอนสำเร็จ');
      render();
      refreshReport();
    } catch (e) { showToast('ไถ่ถอนไม่สำเร็จ'); }
  }
  function toggleRenewPicker(id) { setState({ renewPickerFor: S.renewPickerFor === id ? null : id, forms: { ...S.forms, pawnFinalDate: '' } }); }

  async function renewPawn(id, opt) {
    const period = opt.unit === 'month' ? { months: opt.value } : { days: opt.value };
    try {
      const res = await Api.renewPawn(id, period);
      const p = S.pawns.find((x) => x.id === id);
      if (p) { p.due_date = res.due_date; p.renewal_count = (p.renewal_count || 0) + 1; }
      setState({ renewPickerFor: null });
      showToast('ต่อดอกแล้ว เลื่อนกำหนดเป็น ' + formatDate(res.due_date));
    } catch (e) { showToast(e.message || 'ต่อดอกไม่สำเร็จ'); }
  }

  async function renewPawnFinal(id) {
    const date = S.forms.pawnFinalDate;
    if (!date) { showToast('กรุณาเลือกวันที่จะชำระ'); return; }
    try {
      const res = await Api.renewPawn(id, { due_date: date });
      const p = S.pawns.find((x) => x.id === id);
      if (p) { p.due_date = res.due_date; p.renewal_count = (p.renewal_count || 0) + 1; }
      setState({ renewPickerFor: null, forms: { ...S.forms, pawnFinalDate: '' } });
      showToast('บันทึกวันชำระเป็น ' + formatDate(res.due_date));
    } catch (e) { showToast(e.message || 'บันทึกไม่สำเร็จ'); }
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

  async function submitMarkExpensePaid(id, amount) {
    try {
      const res = await Api.markExpensePaid(id, amount);
      const exp = S.expenses.find((e) => e.id === id);
      if (exp) { exp.paid_this_month = true; exp.last_amount = res.amount; }
      setState({ expensePayFor: null, forms: { ...S.forms, expensePayAmount: '' } });
      showToast('บันทึกว่าจ่ายแล้ว');
      refreshReport();
    } catch (e) { showToast(e.message || 'บันทึกไม่สำเร็จ'); }
  }

  function confirmExpensePay(id) {
    const amount = Number(S.forms.expensePayAmount) || 0;
    if (!amount) { showToast('กรุณากรอกยอดที่จ่าย'); return; }
    submitMarkExpensePaid(id, amount);
  }

  async function deleteExpense(id) {
    try {
      await Api.deleteExpense(id);
      S.expenses = S.expenses.filter((e) => e.id !== id);
      showToast('ลบค่าใช้จ่ายแล้ว');
      render();
      refreshReport();
    } catch (e) { showToast('ลบไม่สำเร็จ'); }
  }

  async function setWarnDays(n) {
    setState({ warnDays: n });
    try { await Api.updateSettings({ warn_days: n }); } catch (e) { /* keep optimistic value */ }
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
    const isMainTab = ['dashboard', 'debtList', 'pawnList', 'settings'].includes(S.screen);
    const showBack = ['debtDetail', 'debtSettings', 'pawnSettings', 'addEdit', 'expenses', 'notifications'].includes(S.screen);
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
      debtList: 'หนี้สินทั้งหมด', pawnList: 'ตั๋วจำนำ', settings: 'ตั้งค่า',
      expenses: 'ค่าใช้จ่ายประจำต่อเดือน',
      debtDetail: (S.debts.find((d) => d.id === S.selectedDebtId) || {}).name || 'รายละเอียดหนี้',
      debtSettings: 'ตั้งค่าหนี้',
      pawnSettings: 'ตั้งค่าตั๋วจำนำ',
      notifications: 'การแจ้งเตือน',
      addEdit: addTypeTitle[S.addType] || 'เพิ่มรายการใหม่',
    };
    const cls = (S.screen === 'debtList' || S.screen === 'pawnList' || S.screen === 'settings' || S.screen === 'expenses') ? 'header-title-md' : 'header-title';
    const trailing = S.screen === 'debtDetail'
      ? `<button class="icon-btn" data-action="open-debt-settings" data-id="${S.selectedDebtId}">${svgGear('#1B2422')}</button>`
      : (S.screen === 'notifications' && S.unreadCount ? `<button class="mark-paid-btn" style="padding:6px 10px;font-size:12px" data-action="mark-all-read">อ่านทั้งหมด</button>` : '');
    return `<div class="${cls}" style="flex:1">${esc(titleMap[S.screen] || '')}</div>${trailing}`;
  }

  function screenBody() {
    switch (S.screen) {
      case 'dashboard': return renderDashboard();
      case 'debtList': return renderDebtList();
      case 'debtDetail': return renderDebtDetail();
      case 'debtSettings': return renderDebtSettings();
      case 'pawnList': return renderPawnList();
      case 'pawnSettings': return renderPawnSettings();
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

    const stat = (label, amount, bg, fg) => `
      <div class="report-stat" style="background:${bg}">
        <div class="report-stat-label" style="color:${fg}">${label}</div>
        <div class="report-stat-amount" style="color:${fg}">฿${formatMoney(amount)}</div>
      </div>`;

    const stats = `
      <div class="report-grid">
        ${stat('ยอดหนี้สิน', r.total_debt, '#E3F3EF', '#0E6B5C')}
        ${stat('ยอดตั๋วจำนำ', r.total_pawn, '#EFE7F8', '#6B3FA0')}
        ${stat('ค่าใช้จ่ายประจำต่อเดือน', r.total_recurring, '#FFF3DD', '#92600A')}
        ${stat('ต้องชำระเดือนนี้', r.total_due_this_month, '#FDEAEA', '#B23B3B')}
      </div>`;

    const rows = r.breakdown.map((it) => {
      const kindLabel = { installment: 'งวดผ่อน', pawn: 'ตั๋วจำนำ', expense: 'ค่าใช้จ่ายประจำ' }[it.type];
      const kindBg = { installment: '#E3F3EF', pawn: '#EFE7F8', expense: '#FFF3DD' }[it.type];
      const kindFg = { installment: '#0E6B5C', pawn: '#6B3FA0', expense: '#92600A' }[it.type];
      const action = it.type === 'installment'
        ? `<button class="mark-paid-btn" data-action="mark-paid" data-id="${it.ref_id}" data-debt="${it.debt_id}">บันทึกว่าจ่ายแล้ว</button>`
        : it.type === 'expense'
        ? `<button class="mark-paid-btn" data-action="mark-expense-paid" data-id="${it.ref_id}" data-expense-type="${it.expense_type}">บันทึกว่าจ่ายแล้ว</button>`
        : `<button class="mark-paid-btn" data-action="redeem" data-id="${it.ref_id}">ไถ่ถอนแล้ว</button>`;
      const payPrompt = it.type === 'expense' && S.expensePayFor === it.ref_id ? `
        <div class="warn-options" style="width:100%;margin-top:8px">
          <input class="field-input" type="number" data-bind="expensePayAmount" value="${esc(S.forms.expensePayAmount)}" placeholder="ยอดที่จ่ายจริงเดือนนี้"/>
          <button class="submit-btn" data-action="confirm-expense-pay" data-id="${it.ref_id}">ยืนยัน</button>
        </div>` : '';
      return `
        <div class="installment-row" style="flex-wrap:wrap">
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:6px">
              <span class="near-kind" style="background:${kindBg};color:${kindFg}">${kindLabel}</span>
              <span class="installment-date">${esc(it.title)}</span>
            </div>
            <div class="installment-amount">฿${formatMoney(it.amount)} · ครบกำหนด ${formatDate(it.due_date)}</div>
          </div>
          ${action}
          ${payPrompt}
        </div>`;
    }).join('');

    return `
      <div class="screen-pad">
        ${stats}
        <div class="section-title">รายการที่ต้องชำระเดือนนี้</div>
        ${r.breakdown.length ? `<div style="display:flex;flex-direction:column;gap:10px">${rows}</div>` : `
          <div class="empty-card"><div class="empty-emoji">✅</div><div class="empty-text">ชำระครบทุกรายการของเดือนนี้แล้ว</div></div>`}
        <div class="card" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer" data-action="goto-expenses">
          <div>
            <div class="settings-row-title">ค่าใช้จ่ายประจำต่อเดือน</div>
            <div class="settings-row-sub">${S.expenses.length} รายการ · จัดการ/เพิ่มรายการ</div>
          </div>
          ${svgChevron()}
        </div>
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

  function renderPawnList() {
    const empty = !S.pawns.length ? `
      <div class="empty-card"><div class="empty-emoji">🎫</div><div class="empty-text">ยังไม่มีตั๋วจำนำ กดปุ่ม + เพื่อเพิ่ม</div></div>` : '';
    const cards = S.pawns.map(renderPawnCard).join('');
    return `<div class="screen-pad">${empty}${cards}</div>`;
  }

  function renderPawnCard(p) {
    const categoryMeta = PAWN_CATEGORIES.find((c) => c.key === p.category) || PAWN_CATEGORIES[3];
    const isJewelry = p.category === 'jewelry';
    const renewalCount = p.renewal_count || 0;
    const finalDueDate = isJewelry ? addMonths(p.pawn_date || (p.created_at || '').slice(0, 10), 5) : null;
    const pastFinal = isJewelry && finalDueDate && todayISO() >= finalDueDate;
    const atCap = isJewelry && renewalCount >= JEWELRY_MAX_RENEWALS;
    const usedFinalPick = isJewelry && renewalCount > JEWELRY_MAX_RENEWALS;

    const days = daysUntil(p.due_date);
    let badgeLabel, badgeBg, badgeFg;
    if (pastFinal) {
      badgeLabel = '⚠️ ใกล้ขาดจำนำ'; badgeBg = '#D64545'; badgeFg = '#fff';
    } else {
      const status = days < 0 ? 'overdue' : (days <= S.warnDays ? 'due_soon' : 'upcoming');
      const meta = STATUS_META[status];
      badgeLabel = daysLabel(days, status); badgeBg = meta.bg; badgeFg = meta.fg;
    }

    const shopLine = esc(p.shop_name || 'ไม่ระบุร้าน') + (p.ticket_code ? ' · เลขที่ตั๋ว ' + esc(p.ticket_code) : '');

    let actionsHtml;
    if (usedFinalPick) {
      actionsHtml = `
        <div class="pawn-actions"><button class="pawn-btn redeem" data-action="redeem" data-id="${p.id}">ไถ่ถอนแล้ว</button></div>
        <div class="field-label" style="color:#B23B3B;margin-bottom:0">ต่อดอก/เลื่อนกำหนดครบสูงสุดแล้ว กรุณาไถ่ถอนก่อนวันครบกำหนดสุดท้าย</div>`;
    } else if (atCap) {
      actionsHtml = `
        <div class="pawn-actions">
          <button class="pawn-btn redeem" data-action="redeem" data-id="${p.id}">ไถ่ถอนแล้ว</button>
          <button class="pawn-btn renew" data-action="renew-open" data-id="${p.id}">เลือกวันชำระ</button>
        </div>
        <div class="field-label" style="color:#92600A;margin-bottom:0">ต่อดอกครบ 4 เดือนแล้ว เข้าสู่เดือนสุดท้าย — เลือกวันที่จะชำระได้ ไม่เกิน ${formatDate(finalDueDate)}</div>
        ${S.renewPickerFor === p.id ? `
          <div style="display:flex;gap:8px;align-items:flex-end;padding-top:2px">
            <div style="flex:1"><div class="field-label">เลือกวันที่จะชำระ</div><input class="field-input" type="date" data-bind="pawnFinalDate" value="${esc(S.forms.pawnFinalDate)}" min="${todayISO()}" max="${finalDueDate}"/></div>
            <button class="submit-btn" style="width:auto;padding:13px 18px" data-action="renew-final-confirm" data-id="${p.id}">ยืนยัน</button>
          </div>` : ''}`;
    } else {
      actionsHtml = `
        <div class="pawn-actions">
          <button class="pawn-btn redeem" data-action="redeem" data-id="${p.id}">ไถ่ถอนแล้ว</button>
          <button class="pawn-btn renew" data-action="renew-open" data-id="${p.id}">ต่อดอก</button>
        </div>
        ${isJewelry ? `<div class="field-label" style="margin-bottom:0">ต่อดอกแล้ว ${renewalCount}/${JEWELRY_MAX_RENEWALS} ครั้ง</div>` : ''}
        ${S.renewPickerFor === p.id ? `
          <div style="display:flex;flex-direction:column;gap:6px;padding-top:2px">
            <div class="field-label" style="margin-bottom:0">เลือกระยะเวลาต่อดอก</div>
            <div class="warn-options">
              ${PERIOD_OPTIONS.filter((o) => o.unit && o.key !== 'custom').map((o) =>
                `<button class="warn-opt" data-action="renew-confirm" data-id="${p.id}" data-key="${o.key}">${o.label}</button>`
              ).join('')}
            </div>
          </div>` : ''}`;
    }

    return `
      <div class="pawn-card">
        <div style="display:flex;gap:12px;align-items:center">
          <div class="pawn-icon">${svgPawn()}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px">
              <span class="near-kind" style="background:#EFEFEF;color:#5C6C68">${categoryMeta.icon} ${categoryMeta.label}</span>
            </div>
            <div class="pawn-item">${esc(p.item_name)}</div>
            <div class="pawn-shop">${shopLine}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            <div class="near-badge" style="background:${badgeBg};color:${badgeFg}">${badgeLabel}</div>
            <button class="icon-btn" data-action="open-pawn-settings" data-id="${p.id}" style="width:28px;height:28px">${svgGear('#5C6C68')}</button>
          </div>
        </div>
        <div class="pawn-footer">
          <div class="pawn-amount">฿${formatMoney(p.amount)}${p.interest ? ` <span style="font-size:12px;color:#92600A;font-weight:400">(ดอก ฿${formatMoney(p.interest)})</span>` : ''}</div>
          <div class="pawn-due">ครบกำหนด ${formatDate(p.due_date)}</div>
        </div>
        ${p.renew_url ? `<a href="${esc(p.renew_url)}" target="_blank" rel="noopener" class="pawn-btn renew" style="text-align:center;text-decoration:none;display:block">🔗 ต่อดอกออนไลน์ (จาก QR ตั๋ว)</a>` : ''}
        ${actionsHtml}
      </div>`;
  }

  function renderExpenses() {
    const empty = !S.expenses.length ? `
      <div class="empty-card"><div class="empty-emoji">🧾</div><div class="empty-text">ยังไม่มีค่าใช้จ่ายประจำ กดปุ่ม + เพื่อเพิ่ม</div></div>` : '';
    const cards = S.expenses.map((e) => {
      const isVariable = e.expense_type === 'variable';
      const typeLabel = isVariable ? 'ไม่คงที่ ต้องจ่ายทุกเดือน' : 'ยอดคงที่ทุกเดือน';
      const amountLine = isVariable
        ? (e.last_amount != null ? `฿${formatMoney(e.last_amount)} <span style="font-size:12px;color:#8A9490">(ล่าสุด)</span>` : `<span style="font-size:13px;color:#8A9490">ยังไม่มีข้อมูล</span>`)
        : `฿${formatMoney(e.amount)}`;
      const payPrompt = S.expensePayFor === e.id ? `
        <div class="warn-options" style="width:100%">
          <input class="field-input" type="number" data-bind="expensePayAmount" value="${esc(S.forms.expensePayAmount)}" placeholder="ยอดที่จ่ายจริงเดือนนี้"/>
          <button class="submit-btn" data-action="confirm-expense-pay" data-id="${e.id}">ยืนยัน</button>
        </div>` : '';
      return `
      <div class="debt-card">
        <div class="row-between">
          <div class="debt-name">${esc(e.name)}</div>
          <button class="icon-btn" data-action="delete-expense" data-id="${e.id}" style="width:28px;height:28px">${svgTrash()}</button>
        </div>
        <div class="row-between">
          <div class="debt-remaining">${amountLine}</div>
          <div class="debt-total">${typeLabel} · จ่ายทุกวันที่ ${e.due_day}</div>
        </div>
        ${e.paid_this_month
          ? `<div class="status-badge" style="background:#E7F5EE;color:#1F7A52;align-self:flex-start">จ่ายแล้วเดือนนี้</div>`
          : `<button class="mark-paid-btn" data-action="mark-expense-paid" data-id="${e.id}" data-expense-type="${e.expense_type}" style="align-self:flex-start">บันทึกว่าจ่ายแล้ว</button>`}
        ${payPrompt}
      </div>`;
    }).join('');
    return `<div class="screen-pad">${empty}${cards}</div>`;
  }

  // Shared by the "add pawn" form and the pawn settings screen — same fields either way.
  function renderPawnFormFields() {
    const isCustomPeriod = S.forms.pawnPeriod === 'custom';
    const periodChips = PERIOD_OPTIONS.map((o) =>
      `<button class="warn-opt ${o.key === S.forms.pawnPeriod ? 'selected' : ''}" data-action="pawn-period" data-key="${o.key}">${o.label}</button>`
    ).join('');
    const categoryChips = PAWN_CATEGORIES.map((c) =>
      `<button class="warn-opt ${c.key === S.forms.category ? 'selected' : ''}" data-action="pawn-category" data-key="${c.key}">${c.icon} ${c.label}</button>`
    ).join('');
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
          <div class="field-1"><div class="field-label">ยอดต่อดอก (ถ้ามี)</div><input class="field-input" type="number" data-bind="interest" value="${esc(S.forms.interest)}" placeholder="0"/></div>
        </div>
        <div>
          <div class="field-label">วันที่จำนำ</div>
          <input class="field-input" type="date" data-bind="pawnDate" value="${esc(S.forms.pawnDate)}"/>
        </div>
        <div>
          <div class="field-label">ครบกำหนดต่อดอก</div>
          <div class="warn-options">${periodChips}</div>
        </div>
        ${isCustomPeriod ? `<div><div class="field-label">ระบุจำนวนวันต่อรอบ</div><input class="field-input" type="number" min="1" data-bind="pawnCustomDays" value="${esc(S.forms.pawnCustomDays)}" placeholder="เช่น 7, 10, 20"/></div>` : ''}
        <div>
          <div class="field-label">วันครบกำหนดงวดแรก</div>
          <input class="field-input" type="date" data-bind="dueDate" value="${esc(S.forms.dueDate)}"/>
        </div>
        <div class="field-label">ไม่รู้ว่าจำนำมาวันไหน แต่รู้วันครบกำหนด (เช่น ร้านนัดจ่ายวันที่ 10) ก็เลือกวันนั้นเป็นงวดแรกได้เลย — งวดถัดไปจะนับต่อจากวันนี้ไปเรื่อยๆ ทุก${isCustomPeriod ? (S.forms.pawnCustomDays || 'N') + ' วัน' : ' ' + (PERIOD_OPTIONS.find((o) => o.key === S.forms.pawnPeriod) || {}).label}</div>
        ${S.forms.category === 'jewelry' ? `<div class="field-label" style="color:#92600A">หมวดเครื่องประดับ: ต่อดอกได้สูงสุด 4 เดือน นับจาก "วันที่จำนำ" — เดือนที่ 5 คือกำหนดสุดท้าย</div>` : ''}`;
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

  function renderAddEdit() {
    const isDebt = S.addType === 'debt';
    const isPawn = S.addType === 'pawn';
    const isExpense = S.addType === 'expense';
    const dayOptions = Array.from({ length: 28 }, (_, i) => i + 1)
      .map((n) => `<option value="${n}" ${String(n) === S.forms.dueDay ? 'selected' : ''}>${n}</option>`).join('');
    const expenseDayOptions = Array.from({ length: 28 }, (_, i) => i + 1)
      .map((n) => `<option value="${n}" ${String(n) === S.forms.expenseDueDay ? 'selected' : ''}>${n}</option>`).join('');

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

    const isVariableExpense = S.forms.expenseType === 'variable';
    const expenseTypeChips = `
      <button class="warn-opt ${!isVariableExpense ? 'selected' : ''}" data-action="expense-type" data-key="fixed">ยอดคงที่ทุกเดือน</button>
      <button class="warn-opt ${isVariableExpense ? 'selected' : ''}" data-action="expense-type" data-key="variable">ไม่คงที่ ต้องจ่ายทุกเดือน</button>`;
    const expenseForm = `
      <div style="display:flex;flex-direction:column;gap:14px">
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
        ${isVariableExpense ? `<div class="field-label" style="color:#92600A">ยอดไม่คงที่ (เช่น ค่าน้ำ ค่าไฟ ค่าเน็ต): กรอกยอดจริงทุกครั้งตอนบันทึกว่าจ่ายแล้ว</div>` : ''}
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
    const showExpenseOption = S.screen === 'dashboard';
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
      { key: 'dashboard', label: 'หน้าแรก', icon: svgHome },
      { key: 'debtList', label: 'หนี้สิน', icon: svgList },
      { key: 'pawnList', label: 'ตั๋วจำนำ', icon: svgTicket },
      { key: 'settings', label: 'ตั้งค่า', icon: svgGear },
    ];
    return `<div class="bottom-nav">${items.map((it) => {
      const active = S.screen === it.key;
      const color = active ? '#0E6B5C' : '#A6ACAA';
      return `<button class="nav-item" data-action="nav" data-screen="${it.key}">${it.icon(color)}<span class="nav-label" style="color:${color}">${it.label}</span></button>`;
    }).join('')}</div>`;
  }

  // ---------------- Icons ----------------
  function svgLock() { return `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M7 7V5a5 5 0 0110 0v2"/></svg>`; }
  function svgBack(c) { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8"><path d="M15 18l-6-6 6-6"/></svg>`; }
  function svgChevron() { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A6ACAA" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>`; }
  function svgPlus() { return `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>`; }
  function svgPawn() { return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#B8862F" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M8 12h8"/></svg>`; }
  function svgTrash() { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B23B3B" stroke-width="1.8"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0v12a2 2 0 002 2h6a2 2 0 002-2V7"/></svg>`; }
  function svgHome(c) { return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8"><path d="M3 11l9-7 9 7"/><path d="M5 10v9h14v-9"/></svg>`; }
  function svgList(c) { return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/></svg>`; }
  function svgTicket(c) { return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8"><path d="M3 12l6-8h9a3 3 0 013 3v3l-8 9a2 2 0 01-3 0l-7-6z"/><circle cx="15" cy="9" r="1.4"/></svg>`; }
  function svgGear(c) { return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 13a7.6 7.6 0 000-2l1.9-1.5-2-3.4-2.3.6a7.7 7.7 0 00-1.7-1l-.3-2.4h-4l-.3 2.4a7.7 7.7 0 00-1.7 1l-2.3-.6-2 3.4L4.6 11a7.6 7.6 0 000 2l-1.9 1.5 2 3.4 2.3-.6a7.7 7.7 0 001.7 1l.3 2.4h4l.3-2.4a7.7 7.7 0 001.7-1l2.3.6 2-3.4z"/></svg>`; }
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
      case 'open-debt': openDebt(el.dataset.id); break;
      case 'open-debt-settings': openDebtSettings(el.dataset.id); break;
      case 'submit-edit-debt': editDebtSubmit(); break;
      case 'close-debt': closeDebt(el.dataset.id); break;
      case 'delete-debt': deleteDebt(el.dataset.id); break;
      case 'mark-paid': markPaid(el.dataset.id, el.dataset.debt); break;
      case 'redeem': redeemPawn(el.dataset.id); break;
      case 'open-pawn-settings': openPawnSettings(el.dataset.id); break;
      case 'submit-edit-pawn': editPawnSubmit(); break;
      case 'delete-pawn': deletePawnAction(el.dataset.id); break;
      case 'renew-open': toggleRenewPicker(el.dataset.id); break;
      case 'renew-confirm': {
        const opt = PERIOD_OPTIONS.find((o) => o.key === el.dataset.key);
        if (opt && opt.unit) renewPawn(el.dataset.id, opt);
        break;
      }
      case 'renew-final-confirm': renewPawnFinal(el.dataset.id); break;
      case 'pawn-period': setPawnPeriod(el.dataset.key); break;
      case 'pawn-category': setPawnCategory(el.dataset.key); break;
      case 'expense-type': setExpenseType(el.dataset.key); break;
      case 'add-type': setState({ addType: el.dataset.type }); break;
      case 'submit-debt': addDebtSubmit(); break;
      case 'submit-pawn': addPawnSubmit(); break;
      case 'submit-expense': addExpenseSubmit(); break;
      case 'mark-expense-paid': markExpensePaid(el.dataset.id, el.dataset.expenseType); break;
      case 'confirm-expense-pay': confirmExpensePay(el.dataset.id); break;
      case 'delete-expense': deleteExpense(el.dataset.id); break;
      case 'goto-expenses': setState({ screen: 'expenses', returnScreen: 'dashboard' }); break;
      case 'warn-days': setWarnDays(Number(el.dataset.n)); break;
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
      loadAll();
      loadNotifications();
    }
  })();
})();
