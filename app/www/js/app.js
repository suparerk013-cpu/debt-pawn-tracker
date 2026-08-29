// Debt & Pawn Tracker — vanilla JS app shell (Capacitor-wrapped).
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
    { key: 'custom', label: 'กำหนดเอง', unit: null, value: null },
  ];
  function computePeriodDate(unit, value) {
    const d = new Date();
    if (unit === 'day') d.setDate(d.getDate() + value);
    else if (unit === 'month') d.setMonth(d.getMonth() + value);
    return d.toISOString().slice(0, 10);
  }

  const S = {
    screen: 'auth',            // auth | lock | forgotPassword | forgotPin | dashboard | debtList | debtDetail | pawnList | addEdit | settings
    authTab: 'login',          // login | register
    authError: '',

    needsPinSetup: false,
    pinContext: 'unlock',      // unlock | setup | forgotPin
    pinStage: 'enter',         // enter | confirm  (setup/forgotPin double-entry)
    pinFirstEntry: '',
    pin: [],
    pinError: '',

    forgotStage: 'identify',   // identify | pin  (forgotPin screen)

    busy: false,
    wasBackgrounded: false,
    returnScreen: 'dashboard',
    addType: 'debt',
    fabMenuOpen: false,
    warnDays: 5,
    autoLock: true,
    toast: null,
    selectedDebtId: null,
    renewPickerFor: null,
    debts: [],
    pawns: [],
    expenses: [],
    report: null,
    forms: {
      name: '', total: '', remaining: '', dueDay: '5', installmentAmount: '',
      itemName: '', shop: '', ticketCode: '', amount: '', dueDate: '', pawnPeriod: '1m',
      expenseName: '', expenseAmount: '', expenseDueDay: '5',
      username: '', password: '', phone: '',
      fpUsername: '', fpContact: '',
      fpaUsername: '', fpaContact: '', fpaNewPassword: '',
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
      S.autoLock = settings.auto_lock;
    } catch (e) {
      showToast('โหลดข้อมูลไม่สำเร็จ: ' + e.message);
    }
    S.busy = false; render();
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
  function openAdd(type, from) {
    setState({
      screen: 'addEdit', addType: type, returnScreen: from, fabMenuOpen: false,
      forms: {
        ...S.forms,
        name: '', total: '', remaining: '', dueDay: '5', installmentAmount: '',
        itemName: '', shop: '', ticketCode: '', amount: '', pawnPeriod: '1m', dueDate: computePeriodDate('month', 1),
        expenseName: '', expenseAmount: '', expenseDueDay: '5',
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

  // ---------------- Auth: login / register / google ----------------
  function afterAuthSuccess(needsPin) {
    if (needsPin) {
      setState({ screen: 'lock', needsPinSetup: true, pinContext: 'setup', pinStage: 'enter', pin: [], pinFirstEntry: '', pinError: '', authError: '' });
    } else {
      setState({ screen: 'lock', needsPinSetup: false, pinContext: 'unlock', pin: [], pinError: '', authError: '' });
    }
  }

  async function submitLogin() {
    const f = S.forms;
    if (!f.username.trim() || !f.password) { setState({ authError: 'กรอกชื่อผู้ใช้และรหัสผ่าน' }); return; }
    S.busy = true; render();
    try {
      const res = await Api.loginPassword(f.username.trim(), f.password);
      Api.setToken(res.token);
      S.busy = false;
      afterAuthSuccess(res.needs_pin);
    } catch (e) {
      S.busy = false;
      setState({ authError: e.message || 'เข้าสู่ระบบไม่สำเร็จ' });
    }
  }

  async function submitRegister() {
    const f = S.forms;
    if (!f.username.trim() || !f.password || !f.phone.trim()) { setState({ authError: 'กรอกข้อมูลให้ครบ' }); return; }
    S.busy = true; render();
    try {
      const res = await Api.register(f.username.trim(), f.password, f.phone.trim());
      Api.setToken(res.token);
      S.busy = false;
      afterAuthSuccess(res.needs_pin);
    } catch (e) {
      S.busy = false;
      setState({ authError: e.message || 'สมัครสมาชิกไม่สำเร็จ' });
    }
  }

  async function googleSignIn() {
    try {
      const gauth = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.GoogleAuth;
      if (!gauth) { showToast('ต้อง build เป็นแอป Android ก่อนถึงจะใช้ Google ได้'); return; }
      S.busy = true; render();
      const result = await gauth.signIn();
      const idToken = result && result.authentication && result.authentication.idToken;
      if (!idToken) throw new Error('ไม่ได้รับ token จาก Google');

      const res = await Api.googleLogin(idToken);
      Api.setToken(res.token);
      S.busy = false;
      afterAuthSuccess(res.needs_pin);
    } catch (e) {
      S.busy = false;
      showToast(e.message || 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ');
      render();
    }
  }

  // ---------------- PIN pad (shared: unlock / setup / forgotPin) ----------------
  async function pinPress(d) {
    if (S.pin.length >= 4 || S.busy) return;
    const pin = [...S.pin, d];
    setState({ pin, pinError: '' });
    if (pin.length !== 4) return;
    const entered = pin.join('');

    if (S.pinContext === 'unlock') { await submitPin(entered); return; }

    // setup / forgotPin: double-entry confirmation
    if (S.pinStage === 'enter') {
      setState({ pin: [], pinStage: 'confirm', pinFirstEntry: entered });
      return;
    }
    if (entered !== S.pinFirstEntry) {
      setState({ pin: [], pinStage: 'enter', pinFirstEntry: '', pinError: 'PIN ไม่ตรงกัน กรุณาลองใหม่อีกครั้ง' });
      return;
    }
    if (S.pinContext === 'setup') await submitPinSetup(entered);
    else if (S.pinContext === 'forgotPin') await submitForgotPin(entered);
  }
  function pinBack() { setState({ pin: S.pin.slice(0, -1), pinError: '' }); }

  async function submitPin(pinStr) {
    S.busy = true; render();
    try {
      await Api.verifyPin(pinStr);
      S.pin = []; S.busy = false;
      setState({ screen: 'dashboard' });
      await loadAll();
      registerPushToken();
    } catch (e) {
      S.busy = false;
      if (e.status === 401 && /token/i.test(e.message || '')) {
        Api.setToken(null);
        setState({ screen: 'auth', authTab: 'login', pin: [], pinError: '' });
        showToast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
        return;
      }
      setState({ pin: [], pinError: e.message || 'PIN ไม่ถูกต้อง' });
    }
  }

  async function submitPinSetup(pinStr) {
    S.busy = true; render();
    try {
      await Api.setPin(pinStr);
      S.pin = []; S.busy = false;
      setState({ screen: 'dashboard', needsPinSetup: false, pinContext: 'unlock', pinStage: 'enter', pinFirstEntry: '' });
      await loadAll();
      showToast('ตั้ง PIN สำเร็จ');
      registerPushToken();
    } catch (e) {
      S.busy = false;
      setState({ pin: [], pinStage: 'enter', pinFirstEntry: '', pinError: e.message || 'ตั้ง PIN ไม่สำเร็จ' });
    }
  }

  async function submitForgotPin(pinStr) {
    S.busy = true; render();
    try {
      const res = await Api.forgotPin(S.forms.fpUsername.trim(), S.forms.fpContact.trim(), pinStr);
      Api.setToken(res.token);
      S.pin = []; S.busy = false;
      setState({ screen: 'dashboard', needsPinSetup: false, pinContext: 'unlock', pinStage: 'enter', pinFirstEntry: '' });
      await loadAll();
      showToast('ตั้งค่า PIN ใหม่สำเร็จ');
      registerPushToken();
    } catch (e) {
      S.busy = false;
      setState({
        screen: 'forgotPin', forgotStage: 'identify',
        pin: [], pinStage: 'enter', pinFirstEntry: '', pinError: '',
      });
      showToast(e.message || 'รีเซ็ต PIN ไม่สำเร็จ');
    }
  }

  function forgotPinNext() {
    const f = S.forms;
    if (!f.fpUsername.trim() || !f.fpContact.trim()) { setState({ pinError: 'กรอกชื่อผู้ใช้และเบอร์โทรศัพท์หรืออีเมล' }); return; }
    setState({ forgotStage: 'pin', pinContext: 'forgotPin', pinStage: 'enter', pin: [], pinFirstEntry: '', pinError: '' });
  }

  async function submitForgotPassword() {
    const f = S.forms;
    if (!f.fpaUsername.trim() || !f.fpaContact.trim() || f.fpaNewPassword.length < 6) {
      setState({ authError: 'กรอกข้อมูลให้ครบ (รหัสผ่านอย่างน้อย 6 ตัวอักษร)' });
      return;
    }
    S.busy = true; render();
    try {
      await Api.forgotPassword(f.fpaUsername.trim(), f.fpaContact.trim(), f.fpaNewPassword);
      S.busy = false;
      setState({ screen: 'auth', authTab: 'login', authError: '' });
      showToast('เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบใหม่');
    } catch (e) {
      S.busy = false;
      setState({ authError: e.message || 'เปลี่ยนรหัสผ่านไม่สำเร็จ' });
    }
  }

  async function fingerprintUnlock() {
    if (S.pinContext !== 'unlock') { showToast('กรุณาใช้ PIN'); return; }
    try {
      const bio = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.NativeBiometric;
      if (!bio || !Api.getToken()) { showToast('กรุณาใช้ PIN'); return; }
      const avail = await bio.isAvailable();
      if (!avail || !avail.isAvailable) { showToast('อุปกรณ์นี้ไม่รองรับลายนิ้วมือ'); return; }
      await bio.verifyIdentity({ reason: 'ปลดล็อกแอป', title: 'ยืนยันตัวตน' });
      setState({ screen: 'dashboard', pin: [] });
      await loadAll();
    } catch (e) {
      showToast('ยืนยันตัวตนไม่สำเร็จ กรุณาใช้ PIN');
    }
  }
  function relock() { setState({ screen: 'lock', pin: [], pinContext: 'unlock', pinStage: 'enter', pinFirstEntry: '' }); }

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
  function toggleRenewPicker(id) { setState({ renewPickerFor: S.renewPickerFor === id ? null : id }); }

  async function renewPawn(id, opt) {
    const period = opt.unit === 'month' ? { months: opt.value } : { days: opt.value };
    try {
      const res = await Api.renewPawn(id, period);
      const p = S.pawns.find((x) => x.id === id);
      if (p) p.due_date = res.due_date;
      setState({ renewPickerFor: null });
      showToast('ต่อดอกแล้ว เลื่อนกำหนดเป็น ' + formatDate(res.due_date));
    } catch (e) { showToast('ต่อดอกไม่สำเร็จ'); }
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

  async function addPawnSubmit() {
    const f = S.forms;
    const amount = Number(f.amount) || 0;
    if (!f.itemName.trim() || !amount || !f.dueDate) { showToast('กรอกข้อมูลตั๋วจำนำให้ครบ'); return; }
    const opt = PERIOD_OPTIONS.find((o) => o.key === f.pawnPeriod);
    try {
      await Api.createPawn({
        item_name: f.itemName.trim(), shop_name: f.shop.trim(), ticket_code: f.ticketCode.trim(),
        amount, due_date: f.dueDate,
        period_unit: opt && opt.unit ? opt.unit : null,
        period_value: opt && opt.value ? opt.value : null,
      });
      setState({ screen: 'pawnList', returnScreen: 'pawnList' });
      await loadAll();
      showToast('เพิ่มตั๋วจำนำแล้ว');
    } catch (e) { showToast(e.message || 'บันทึกไม่สำเร็จ'); }
  }

  async function addExpenseSubmit() {
    const f = S.forms;
    const amount = Number(f.expenseAmount) || 0;
    if (!f.expenseName.trim() || !amount) { showToast('กรอกชื่อและยอดค่าใช้จ่ายให้ครบ'); return; }
    try {
      await Api.createExpense({ name: f.expenseName.trim(), amount, due_day: Number(f.expenseDueDay) || 5 });
      setState({ screen: 'expenses', returnScreen: 'dashboard' });
      await loadAll();
      showToast('เพิ่มค่าใช้จ่ายประจำแล้ว');
    } catch (e) { showToast(e.message || 'บันทึกไม่สำเร็จ'); }
  }

  async function markExpensePaid(id) {
    try {
      await Api.markExpensePaid(id);
      const exp = S.expenses.find((e) => e.id === id);
      if (exp) exp.paid_this_month = true;
      showToast('บันทึกว่าจ่ายแล้ว');
      render();
      refreshReport();
    } catch (e) { showToast('บันทึกไม่สำเร็จ'); }
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
  async function toggleAutoLock() {
    setState({ autoLock: !S.autoLock });
    try { await Api.updateSettings({ auto_lock: S.autoLock }); } catch (e) { /* ignore */ }
  }

  // ---------------- Push notifications (optional, needs native build) ----------------
  async function registerPushToken() {
    try {
      const push = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications;
      if (!push) return;
      const perm = await push.requestPermissions();
      if (perm.receive !== 'granted') return;
      await push.register();
      push.addListener('registration', async (token) => {
        try { await Api.registerFcmToken(token.value); } catch (e) { /* ignore */ }
      });
    } catch (e) { /* push not available in this build */ }
  }

  // ---------------- Auto-lock on background ----------------
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (S.autoLock && S.screen !== 'lock' && S.screen !== 'auth') S.wasBackgrounded = true;
    } else if (S.wasBackgrounded) {
      S.wasBackgrounded = false;
      relock();
    }
  });

  // ---------------- Render ----------------
  function render() {
    let html;
    if (S.screen === 'auth') html = renderAuth();
    else if (S.screen === 'lock') html = renderLock();
    else if (S.screen === 'forgotPassword') html = renderForgotPassword();
    else if (S.screen === 'forgotPin') html = renderForgotPin();
    else html = renderApp();
    app.innerHTML = html;
  }

  function toastHtml() { return S.toast ? `<div class="toast">${esc(S.toast)}</div>` : ''; }

  function renderAuth() {
    const isLogin = S.authTab === 'login';
    return `
    <div class="lock-screen" style="justify-content:flex-start;overflow-y:auto">
      <div style="display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:6px;margin-bottom:22px">
        <div class="lock-icon">${svgLock()}</div>
        <div class="lock-title">หนี้สิน & ตั๋วจำนำ</div>
      </div>
      <div class="segmented" style="width:100%;max-width:320px;background:rgba(255,255,255,0.14)">
        <button class="segmented-btn ${isLogin ? 'active' : ''}" data-action="goto-auth-login" style="${isLogin ? '' : 'color:#fff'}">เข้าสู่ระบบ</button>
        <button class="segmented-btn ${!isLogin ? 'active' : ''}" data-action="goto-auth-register" style="${!isLogin ? '' : 'color:#fff'}">สมัครสมาชิก</button>
      </div>
      <div style="width:100%;max-width:320px;display:flex;flex-direction:column;gap:12px;margin-top:18px">
        <div><div class="field-label" style="color:rgba(255,255,255,0.75)">ชื่อผู้ใช้</div><input class="field-input" data-bind="username" value="${esc(S.forms.username)}" placeholder="เช่น somchai01"/></div>
        <div><div class="field-label" style="color:rgba(255,255,255,0.75)">รหัสผ่าน</div><input class="field-input" type="password" data-bind="password" value="${esc(S.forms.password)}" placeholder="อย่างน้อย 6 ตัวอักษร"/></div>
        ${!isLogin ? `<div><div class="field-label" style="color:rgba(255,255,255,0.75)">เบอร์โทรศัพท์</div><input class="field-input" data-bind="phone" value="${esc(S.forms.phone)}" placeholder="0812345678"/></div>` : ''}
        <div class="lock-error" style="text-align:left">${esc(S.authError)}</div>
        <button class="submit-btn" data-action="${isLogin ? 'submit-login' : 'submit-register'}">${isLogin ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}</button>
        ${isLogin ? `<button class="link-btn" data-action="goto-forgot-password">ลืมรหัสผ่าน?</button>` : ''}
        <div style="display:flex;align-items:center;gap:10px;color:rgba(255,255,255,0.5);font-size:12px;margin-top:2px">
          <div style="flex:1;height:1px;background:rgba(255,255,255,0.2)"></div>หรือ<div style="flex:1;height:1px;background:rgba(255,255,255,0.2)"></div>
        </div>
        <button class="google-btn" data-action="google-signin">${svgGoogle()} ${isLogin ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}ด้วย Google</button>
      </div>
      ${toastHtml()}
    </div>`;
  }

  function renderPinDotsAndKeys() {
    const dots = [0, 1, 2, 3].map((i) => `<div class="pin-dot ${i < S.pin.length ? 'filled' : ''}"></div>`).join('');
    const keys = ['1','2','3','4','5','6','7','8','9','fp','0','bs'];
    const keyHtml = keys.map((k) => {
      if (k === 'fp') return `<button class="keypad-key" data-action="fp">${svgFingerprint()}</button>`;
      if (k === 'bs') return `<button class="keypad-key" data-action="bs">${svgBackspace()}</button>`;
      return `<button class="keypad-key" data-action="digit" data-digit="${k}">${k}</button>`;
    }).join('');
    return { dots, keyHtml };
  }

  function renderLock() {
    const { dots, keyHtml } = renderPinDotsAndKeys();
    const isSetup = S.pinContext === 'setup';

    let title, sub;
    if (isSetup) {
      title = S.pinStage === 'enter' ? 'ตั้ง PIN ใหม่ (ขั้นตอน 1/2)' : 'ยืนยัน PIN อีกครั้ง (ขั้นตอน 2/2)';
      sub = 'ใส่ PIN 4 หลักที่ต้องการใช้';
    } else {
      title = 'ปลดล็อกเพื่อดูข้อมูลหนี้สิน';
      sub = 'ใส่ PIN 4 หลักของคุณ';
    }

    return `
    <div class="lock-screen">
      <div style="display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:20px">
        <div class="lock-icon">${svgLock()}</div>
        <div class="lock-title">${title}</div>
        <div class="lock-sub">${sub}</div>
        <div class="lock-error">${esc(S.pinError)}</div>
      </div>
      <div class="pin-dots">${dots}</div>
      <div class="keypad">${keyHtml}</div>
      ${!isSetup ? `<button class="link-btn" data-action="goto-forgot-pin">ลืมรหัส PIN?</button>` : '<div></div>'}
      ${toastHtml()}
    </div>`;
  }

  function renderForgotPin() {
    if (S.forgotStage === 'identify') {
      return `
      <div class="lock-screen" style="justify-content:flex-start;overflow-y:auto">
        <div style="width:100%;display:flex;align-items:center;gap:8px">
          <button class="icon-btn" data-action="back-to-lock" style="background:rgba(255,255,255,0.14)">${svgBack('#fff')}</button>
          <div class="lock-title" style="font-size:17px">ลืมรหัส PIN</div>
        </div>
        <div style="width:100%;max-width:320px;display:flex;flex-direction:column;gap:14px;margin-top:24px">
          <div><div class="field-label" style="color:rgba(255,255,255,0.75)">ชื่อผู้ใช้</div><input class="field-input" data-bind="fpUsername" value="${esc(S.forms.fpUsername)}" placeholder="ชื่อผู้ใช้ของคุณ"/></div>
          <div><div class="field-label" style="color:rgba(255,255,255,0.75)">เบอร์โทรศัพท์หรืออีเมลที่ลงทะเบียนไว้</div><input class="field-input" data-bind="fpContact" value="${esc(S.forms.fpContact)}" placeholder="0812345678 หรือ you@email.com"/></div>
          <div class="lock-error" style="text-align:left">${esc(S.pinError)}</div>
          <button class="submit-btn" data-action="forgot-pin-next">ถัดไป</button>
        </div>
        ${toastHtml()}
      </div>`;
    }

    const { dots, keyHtml } = renderPinDotsAndKeys();
    const title = S.pinStage === 'enter' ? 'ตั้ง PIN ใหม่ (ขั้นตอน 1/2)' : 'ยืนยัน PIN อีกครั้ง (ขั้นตอน 2/2)';
    return `
    <div class="lock-screen">
      <div style="width:100%;display:flex;align-items:center;gap:8px;margin-top:-30px">
        <button class="icon-btn" data-action="back-to-lock" style="background:rgba(255,255,255,0.14)">${svgBack('#fff')}</button>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:10px">
        <div class="lock-icon">${svgLock()}</div>
        <div class="lock-title">${title}</div>
        <div class="lock-sub">ใส่ PIN 4 หลักที่ต้องการใช้</div>
        <div class="lock-error">${esc(S.pinError)}</div>
      </div>
      <div class="pin-dots">${dots}</div>
      <div class="keypad">${keyHtml}</div>
      <div></div>
      ${toastHtml()}
    </div>`;
  }

  function renderForgotPassword() {
    return `
    <div class="lock-screen" style="justify-content:flex-start;overflow-y:auto">
      <div style="width:100%;display:flex;align-items:center;gap:8px">
        <button class="icon-btn" data-action="back-to-auth" style="background:rgba(255,255,255,0.14)">${svgBack('#fff')}</button>
        <div class="lock-title" style="font-size:17px">ลืมรหัสผ่าน</div>
      </div>
      <div style="width:100%;max-width:320px;display:flex;flex-direction:column;gap:14px;margin-top:24px">
        <div><div class="field-label" style="color:rgba(255,255,255,0.75)">ชื่อผู้ใช้</div><input class="field-input" data-bind="fpaUsername" value="${esc(S.forms.fpaUsername)}" placeholder="ชื่อผู้ใช้ของคุณ"/></div>
        <div><div class="field-label" style="color:rgba(255,255,255,0.75)">เบอร์โทรศัพท์หรืออีเมลที่ลงทะเบียนไว้</div><input class="field-input" data-bind="fpaContact" value="${esc(S.forms.fpaContact)}" placeholder="0812345678 หรือ you@email.com"/></div>
        <div><div class="field-label" style="color:rgba(255,255,255,0.75)">รหัสผ่านใหม่</div><input class="field-input" type="password" data-bind="fpaNewPassword" value="${esc(S.forms.fpaNewPassword)}" placeholder="อย่างน้อย 6 ตัวอักษร"/></div>
        <div class="lock-error" style="text-align:left">${esc(S.authError)}</div>
        <button class="submit-btn" data-action="submit-forgot-password">เปลี่ยนรหัสผ่าน</button>
      </div>
      ${toastHtml()}
    </div>`;
  }

  function renderApp() {
    const isMainTab = ['dashboard', 'debtList', 'pawnList', 'settings'].includes(S.screen);
    const showBack = S.screen === 'debtDetail' || S.screen === 'addEdit' || S.screen === 'expenses';
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
      return `
        <div style="flex:1">
          <div class="header-greeting">สวัสดี 👋</div>
          <div class="header-title-lg">ภาพรวมของคุณ</div>
        </div>
        <button class="icon-btn" data-action="relock">${svgLockSmall()}</button>`;
    }
    const addTypeTitle = { debt: 'เพิ่มหนี้ใหม่', pawn: 'เพิ่มตั๋วจำนำใหม่', expense: 'เพิ่มค่าใช้จ่ายประจำ' };
    const titleMap = {
      debtList: 'หนี้สินทั้งหมด', pawnList: 'ตั๋วจำนำ', settings: 'ตั้งค่า',
      expenses: 'ค่าใช้จ่ายประจำต่อเดือน',
      debtDetail: (S.debts.find((d) => d.id === S.selectedDebtId) || {}).name || 'รายละเอียดหนี้',
      addEdit: addTypeTitle[S.addType] || 'เพิ่มรายการใหม่',
    };
    const cls = (S.screen === 'debtList' || S.screen === 'pawnList' || S.screen === 'settings' || S.screen === 'expenses') ? 'header-title-md' : 'header-title';
    return `<div class="${cls}">${esc(titleMap[S.screen] || '')}</div>`;
  }

  function screenBody() {
    switch (S.screen) {
      case 'dashboard': return renderDashboard();
      case 'debtList': return renderDebtList();
      case 'debtDetail': return renderDebtDetail();
      case 'pawnList': return renderPawnList();
      case 'expenses': return renderExpenses();
      case 'addEdit': return renderAddEdit();
      case 'settings': return renderSettings();
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
        ? `<button class="mark-paid-btn" data-action="mark-expense-paid" data-id="${it.ref_id}">บันทึกว่าจ่ายแล้ว</button>`
        : `<button class="mark-paid-btn" data-action="redeem" data-id="${it.ref_id}">ไถ่ถอนแล้ว</button>`;
      return `
        <div class="installment-row">
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:6px">
              <span class="near-kind" style="background:${kindBg};color:${kindFg}">${kindLabel}</span>
              <span class="installment-date">${esc(it.title)}</span>
            </div>
            <div class="installment-amount">฿${formatMoney(it.amount)} · ครบกำหนด ${formatDate(it.due_date)}</div>
          </div>
          ${action}
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

  function renderPawnList() {
    const empty = !S.pawns.length ? `
      <div class="empty-card"><div class="empty-emoji">🎫</div><div class="empty-text">ยังไม่มีตั๋วจำนำ กดปุ่ม + เพื่อเพิ่ม</div></div>` : '';
    const cards = S.pawns.map((p) => {
      const days = daysUntil(p.due_date);
      const status = days < 0 ? 'overdue' : (days <= S.warnDays ? 'due_soon' : 'upcoming');
      const meta = STATUS_META[status];
      const shopLine = esc(p.shop_name || 'ไม่ระบุร้าน') + (p.ticket_code ? ' · เลขที่ตั๋ว ' + esc(p.ticket_code) : '');
      return `
        <div class="pawn-card">
          <div style="display:flex;gap:12px;align-items:center">
            <div class="pawn-icon">${svgPawn()}</div>
            <div style="flex:1;min-width:0">
              <div class="pawn-item">${esc(p.item_name)}</div>
              <div class="pawn-shop">${shopLine}</div>
            </div>
            <div class="near-badge" style="background:${meta.bg};color:${meta.fg}">${daysLabel(days, status)}</div>
          </div>
          <div class="pawn-footer">
            <div class="pawn-amount">฿${formatMoney(p.amount)}</div>
            <div class="pawn-due">ครบกำหนด ${formatDate(p.due_date)}</div>
          </div>
          <div class="pawn-actions">
            <button class="pawn-btn redeem" data-action="redeem" data-id="${p.id}">ไถ่ถอนแล้ว</button>
            <button class="pawn-btn renew" data-action="renew-open" data-id="${p.id}">ต่อดอก</button>
          </div>
          ${S.renewPickerFor === p.id ? `
            <div style="display:flex;flex-direction:column;gap:6px;padding-top:2px">
              <div class="field-label" style="margin-bottom:0">เลือกระยะเวลาต่อดอก</div>
              <div class="warn-options">
                ${PERIOD_OPTIONS.filter((o) => o.unit).map((o) =>
                  `<button class="warn-opt" data-action="renew-confirm" data-id="${p.id}" data-key="${o.key}">${o.label}</button>`
                ).join('')}
              </div>
            </div>` : ''}
        </div>`;
    }).join('');
    return `<div class="screen-pad">${empty}${cards}</div>`;
  }


  function renderExpenses() {
    const empty = !S.expenses.length ? `
      <div class="empty-card"><div class="empty-emoji">🧾</div><div class="empty-text">ยังไม่มีค่าใช้จ่ายประจำ กดปุ่ม + เพื่อเพิ่ม</div></div>` : '';
    const cards = S.expenses.map((e) => `
      <div class="debt-card">
        <div class="row-between">
          <div class="debt-name">${esc(e.name)}</div>
          <button class="icon-btn" data-action="delete-expense" data-id="${e.id}" style="width:28px;height:28px">${svgTrash()}</button>
        </div>
        <div class="row-between">
          <div class="debt-remaining">฿${formatMoney(e.amount)}</div>
          <div class="debt-total">จ่ายทุกวันที่ ${e.due_day}</div>
        </div>
        ${e.paid_this_month
          ? `<div class="status-badge" style="background:#E7F5EE;color:#1F7A52;align-self:flex-start">จ่ายแล้วเดือนนี้</div>`
          : `<button class="mark-paid-btn" data-action="mark-expense-paid" data-id="${e.id}" style="align-self:flex-start">บันทึกว่าจ่ายแล้ว</button>`}
      </div>`).join('');
    return `<div class="screen-pad">${empty}${cards}</div>`;
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

    const isCustomPeriod = S.forms.pawnPeriod === 'custom';
    const periodChips = PERIOD_OPTIONS.map((o) =>
      `<button class="warn-opt ${o.key === S.forms.pawnPeriod ? 'selected' : ''}" data-action="pawn-period" data-key="${o.key}">${o.label}</button>`
    ).join('');

    const pawnForm = `
      <div style="display:flex;flex-direction:column;gap:14px">
        <div><div class="field-label">ชื่อสินค้า</div><input class="field-input" data-bind="itemName" value="${esc(S.forms.itemName)}" placeholder="เช่น ทองคำแท่ง 1 บาท"/></div>
        <div><div class="field-label">ร้านจำนำ</div><input class="field-input" data-bind="shop" value="${esc(S.forms.shop)}" placeholder="ชื่อร้าน"/></div>
        <div><div class="field-label">รหัสตั๋ว (ถ้ามี)</div><input class="field-input" data-bind="ticketCode" value="${esc(S.forms.ticketCode)}" placeholder="เลขที่ตั๋วจำนำ"/></div>
        <div><div class="field-label">ยอดเงิน</div><input class="field-input" type="number" data-bind="amount" value="${esc(S.forms.amount)}" placeholder="0"/></div>
        <div>
          <div class="field-label">ครบกำหนดต่อดอก</div>
          <div class="warn-options">${periodChips}</div>
        </div>
        ${isCustomPeriod
          ? `<div><div class="field-label">วันครบกำหนด</div><input class="field-input" type="date" data-bind="dueDate" value="${esc(S.forms.dueDate)}"/></div>`
          : `<div class="field-label">ครบกำหนดต่อดอก: ${S.forms.dueDate ? formatDate(S.forms.dueDate) : '-'}${S.forms.pawnPeriod !== 'custom' ? ' (แจ้งเตือนซ้ำทุกรอบถ้ายังไม่ต่อดอก)' : ''}</div>`}
        <button class="submit-btn" data-action="submit-pawn">บันทึกตั๋วจำนำ</button>
      </div>`;

    const expenseForm = `
      <div style="display:flex;flex-direction:column;gap:14px">
        <div><div class="field-label">ชื่อค่าใช้จ่าย</div><input class="field-input" data-bind="expenseName" value="${esc(S.forms.expenseName)}" placeholder="เช่น ค่าเช่าห้อง, ค่าไฟ, ค่าเน็ต"/></div>
        <div class="field-row">
          <div class="field-1"><div class="field-label">ยอดต่อเดือน</div><input class="field-input" type="number" data-bind="expenseAmount" value="${esc(S.forms.expenseAmount)}" placeholder="0"/></div>
          <div class="field-1">
            <div class="field-label">จ่ายทุกวันที่</div>
            <select class="field-input" data-bind="expenseDueDay">${expenseDayOptions}</select>
          </div>
        </div>
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
        <div class="card settings-row">
          <div>
            <div class="settings-row-title">ล็อกอัตโนมัติเมื่อไม่ได้ใช้งาน</div>
            <div class="settings-row-sub">ล็อกแอปเมื่อออกจากหน้าจอไปสักพัก</div>
          </div>
          <button class="switch ${S.autoLock ? 'on' : ''}" data-action="toggle-autolock"><div class="switch-knob"></div></button>
        </div>
      </div>`;
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
  function svgLockSmall() { return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5C6C68" stroke-width="1.7"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M7 7V5a5 5 0 0110 0v2"/></svg>`; }
  function svgBack(c) { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8"><path d="M15 18l-6-6 6-6"/></svg>`; }
  function svgChevron() { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A6ACAA" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>`; }
  function svgPlus() { return `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>`; }
  function svgPawn() { return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#B8862F" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M8 12h8"/></svg>`; }
  function svgFingerprint() { return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.5"><path d="M12 2a6 6 0 00-6 6v2c0 3-1 5-2 6"/><path d="M12 2a6 6 0 016 6v2c0 4 1.5 6.5 3 8"/><path d="M8 20c1-1.5 2-4 2-8a2 2 0 014 0c0 2 .3 3.5 1 5"/><path d="M12 10a2 2 0 012 2c0 3 .5 5 1.5 6.5"/></svg>`; }
  function svgBackspace() { return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6"><path d="M21 12H8l-4 0M12 8l-4 4 4 4M8 12h13"/></svg>`; }
  function svgTrash() { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B23B3B" stroke-width="1.8"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0v12a2 2 0 002 2h6a2 2 0 002-2V7"/></svg>`; }
  function svgHome(c) { return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8"><path d="M3 11l9-7 9 7"/><path d="M5 10v9h14v-9"/></svg>`; }
  function svgList(c) { return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/></svg>`; }
  function svgTicket(c) { return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8"><path d="M3 12l6-8h9a3 3 0 013 3v3l-8 9a2 2 0 01-3 0l-7-6z"/><circle cx="15" cy="9" r="1.4"/></svg>`; }
  function svgGoogle() { return `<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34 5.1 29.3 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.4-.1-2.8-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34 5.1 29.3 3 24 3c-7.5 0-14 4.2-17.7 10.7z"/><path fill="#4CAF50" d="M24 45c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.6 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.9 40.7 16.4 45 24 45z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.6l6.2 5.2C40.9 36 44 30.5 44 24c0-1.4-.1-2.8-.4-3.5z"/></svg>`; }
  function svgGear(c) { return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 13a7.6 7.6 0 000-2l1.9-1.5-2-3.4-2.3.6a7.7 7.7 0 00-1.7-1l-.3-2.4h-4l-.3 2.4a7.7 7.7 0 00-1.7 1l-2.3-.6-2 3.4L4.6 11a7.6 7.6 0 000 2l-1.9 1.5 2 3.4 2.3-.6a7.7 7.7 0 001.7 1l.3 2.4h4l.3-2.4a7.7 7.7 0 001.7-1l2.3.6 2-3.4z"/></svg>`; }

  // ---------------- Event delegation ----------------
  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    switch (action) {
      case 'digit': pinPress(el.dataset.digit); break;
      case 'bs': pinBack(); break;
      case 'fp': fingerprintUnlock(); break;
      case 'google-signin': googleSignIn(); break;
      case 'back': goBack(); break;
      case 'relock': relock(); break;
      case 'nav': nav(el.dataset.screen); break;
      case 'open-debt': openDebt(Number(el.dataset.id)); break;
      case 'mark-paid': markPaid(Number(el.dataset.id), Number(el.dataset.debt)); break;
      case 'redeem': redeemPawn(Number(el.dataset.id)); break;
      case 'renew-open': toggleRenewPicker(Number(el.dataset.id)); break;
      case 'renew-confirm': {
        const opt = PERIOD_OPTIONS.find((o) => o.key === el.dataset.key);
        if (opt && opt.unit) renewPawn(Number(el.dataset.id), opt);
        break;
      }
      case 'pawn-period': setPawnPeriod(el.dataset.key); break;
      case 'add-type': setState({ addType: el.dataset.type }); break;
      case 'submit-debt': addDebtSubmit(); break;
      case 'submit-pawn': addPawnSubmit(); break;
      case 'submit-expense': addExpenseSubmit(); break;
      case 'mark-expense-paid': markExpensePaid(Number(el.dataset.id)); break;
      case 'delete-expense': deleteExpense(Number(el.dataset.id)); break;
      case 'goto-expenses': setState({ screen: 'expenses', returnScreen: 'dashboard' }); break;
      case 'warn-days': setWarnDays(Number(el.dataset.n)); break;
      case 'toggle-autolock': toggleAutoLock(); break;
      case 'fab-click':
        if (S.screen === 'dashboard') setState({ fabMenuOpen: !S.fabMenuOpen });
        else if (S.screen === 'debtList') openAdd('debt', 'debtList');
        else if (S.screen === 'expenses') openAdd('expense', 'expenses');
        else openAdd('pawn', 'pawnList');
        break;
      case 'add-from-dash': openAdd(el.dataset.type, S.screen); break;

      case 'goto-auth-login': setState({ authTab: 'login', authError: '' }); break;
      case 'goto-auth-register': setState({ authTab: 'register', authError: '' }); break;
      case 'submit-login': submitLogin(); break;
      case 'submit-register': submitRegister(); break;
      case 'goto-forgot-password': setState({ screen: 'forgotPassword', authError: '' }); break;
      case 'goto-forgot-pin': setState({ screen: 'forgotPin', forgotStage: 'identify', pinError: '' }); break;
      case 'back-to-auth': setState({ screen: 'auth', authError: '' }); break;
      case 'back-to-lock': setState({ screen: 'lock', pinError: '' }); break;
      case 'forgot-pin-next': forgotPinNext(); break;
      case 'submit-forgot-password': submitForgotPassword(); break;
    }
  });

  app.addEventListener('input', (e) => {
    const bind = e.target.dataset.bind;
    if (bind) S.forms[bind] = e.target.value;
  });
  app.addEventListener('change', (e) => {
    const bind = e.target.dataset.bind;
    if (bind) S.forms[bind] = e.target.value;
  });

  // ---------------- Boot ----------------
  render();
  boot();
  async function boot() {
    const token = Api.getToken();
    if (!token) return;
    try {
      const me = await Api.me();
      setState({
        screen: 'lock',
        needsPinSetup: !!me.needs_pin,
        pinContext: me.needs_pin ? 'setup' : 'unlock',
      });
    } catch (e) {
      Api.setToken(null);
    }
  }
})();
