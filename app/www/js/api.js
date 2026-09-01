// Firestore-backed data layer. No server at all — the browser talks to Firestore directly
// (Anonymous Auth just satisfies "must be signed in" in the security rules; the two named
// users 'not'/'lek' are an app-level concept, not separate Firebase Auth accounts). Every
// method here keeps the exact same name/shape it had as a REST call, so app.js didn't need
// to change for most of them.
const Api = (() => {
  let activeUserId = null; // which app-user's data we read/write — set by setActiveUser()
  const db = () => firebase.firestore();
  const nowIso = () => new Date().toISOString();
  const genId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  // Calendar dates must use LOCAL Y/M/D, never toISOString() (which converts to UTC and can
  // shift the date by a day in timezones ahead of UTC, e.g. Thailand at UTC+7).
  const dateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const monthStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  // Whole calendar months between two 'YYYY-MM-DD' dates (0 until the day-of-month recurs).
  function monthsBetween(fromStr, toStr) {
    const from = new Date(fromStr + 'T00:00:00');
    const to = new Date(toStr + 'T00:00:00');
    let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
    if (to.getDate() < from.getDate()) months--;
    return Math.max(0, months);
  }

  async function ensureAuth() {
    if (!firebase.auth().currentUser) await firebase.auth().signInAnonymously();
  }
  function setActiveUser(id) { activeUserId = id; }
  function uid() {
    if (!activeUserId) throw new Error('No active user');
    return activeUserId;
  }

  // ---------------- Auth (app-level users, not Firebase Auth accounts) ----------------
  async function login(username) {
    await ensureAuth();
    const uname = String(username || '').trim().toLowerCase();
    if (!uname) throw new Error('กรุณาพิมพ์ชื่อผู้ใช้');
    const ref = db().collection('users').doc(uname);
    let snap = await ref.get();
    if (!snap.exists) {
      if (uname !== 'not' && uname !== 'lek') throw new Error('ไม่พบผู้ใช้นี้');
      await ref.set({ username: uname, is_admin: uname === 'not', warn_days: 3, created_at: nowIso() });
      snap = await ref.get();
    }
    const d = snap.data();
    return { user: { id: uname, username: d.username, is_admin: !!d.is_admin } };
  }
  async function switchUser(userId) {
    const snap = await db().collection('users').doc(userId).get();
    if (!snap.exists) throw new Error('Not found');
    const d = snap.data();
    return { user: { id: userId, username: d.username, is_admin: !!d.is_admin } };
  }
  async function getUsers() {
    const snap = await db().collection('users').get();
    return snap.docs.map((d) => ({ id: d.id, username: d.data().username, is_admin: !!d.data().is_admin }));
  }

  // ---------------- Debts ----------------
  function debtOut(doc) {
    const d = doc.data();
    return {
      id: doc.id, name: d.name, total_amount: d.total_amount, remaining_amount: d.remaining_amount,
      payment_type: d.payment_type, due_day: d.due_day, installment_amount: d.installment_amount,
      status: d.status, created_at: d.created_at,
      installments: (d.installments || []).slice().sort((a, b) => a.due_date < b.due_date ? -1 : 1),
    };
  }
  async function getDebts() {
    const snap = await db().collection('debts').where('user_id', '==', uid()).where('status', '==', 'active').get();
    return snap.docs.map(debtOut).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }
  async function getDebtDetail(id) {
    const doc = await db().collection('debts').doc(id).get();
    if (!doc.exists || doc.data().user_id !== uid()) throw new Error('Not found');
    return debtOut(doc);
  }
  async function createDebt(payload) {
    const total = Number(payload.total_amount) || 0;
    const remaining = payload.remaining_amount !== undefined ? Number(payload.remaining_amount) : total;
    const dueDay = Math.max(1, Math.min(28, Number(payload.due_day) || 5));
    let instAmount = Number(payload.installment_amount) || 0;
    if (instAmount <= 0 && total > 0) instAmount = Math.round((total / 6) * 100) / 100;

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const base = new Date(today.getFullYear(), today.getMonth(), dueDay);
    if (base < today) base.setMonth(base.getMonth() + 1);
    const installments = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(base); d.setMonth(d.getMonth() + i);
      installments.push({ id: genId(), due_date: dateStr(d), amount: instAmount, paid: false, paid_at: null });
    }

    const ref = await db().collection('debts').add({
      user_id: uid(), name: String(payload.name || '').trim(), total_amount: total, remaining_amount: remaining,
      payment_type: 'installment', due_day: dueDay, installment_amount: instAmount, status: 'active',
      created_at: nowIso(), installments,
    });
    return { id: ref.id };
  }
  async function updateDebt(payload) {
    const ref = db().collection('debts').doc(payload.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().user_id !== uid()) throw new Error('Not found');
    const patch = {};
    if (payload.name !== undefined) patch.name = String(payload.name).trim();
    if (payload.total_amount !== undefined) patch.total_amount = Number(payload.total_amount);
    if (payload.remaining_amount !== undefined) patch.remaining_amount = Math.max(0, Number(payload.remaining_amount));
    if (payload.due_day !== undefined) patch.due_day = Math.max(1, Math.min(28, Number(payload.due_day)));
    if (payload.installment_amount !== undefined) {
      const instAmount = Number(payload.installment_amount);
      patch.installment_amount = instAmount;
      patch.installments = (doc.data().installments || []).map((i) => i.paid ? i : { ...i, amount: instAmount });
    }
    await ref.update(patch);
    return { ok: true };
  }
  async function closeDebt(id) {
    const ref = db().collection('debts').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().user_id !== uid()) throw new Error('Not found');
    await ref.update({ status: 'closed', remaining_amount: 0 });
    return { ok: true };
  }
  async function deleteDebt(id) {
    const ref = db().collection('debts').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().user_id !== uid()) throw new Error('Not found');
    await ref.delete();
    return { ok: true };
  }
  async function markInstallmentPaid(instId) {
    const snap = await db().collection('debts').where('user_id', '==', uid()).get();
    for (const doc of snap.docs) {
      const d = doc.data();
      const inst = (d.installments || []).find((i) => i.id === instId);
      if (!inst) continue;
      if (inst.paid) return { ok: true, remaining_amount: d.remaining_amount };
      const installments = d.installments.map((i) => i.id === instId ? { ...i, paid: true, paid_at: nowIso() } : i);
      const remaining = Math.max(0, (d.remaining_amount || 0) - inst.amount);
      await doc.ref.update({ installments, remaining_amount: remaining });
      return { ok: true, remaining_amount: remaining };
    }
    throw new Error('Not found');
  }

  // ---------------- Pawns ----------------
  function pawnOut(doc) { return { id: doc.id, ...doc.data() }; }
  async function getPawns() {
    const snap = await db().collection('pawns').where('user_id', '==', uid()).where('status', '==', 'active').get();
    return snap.docs.map(pawnOut).sort((a, b) => a.due_date < b.due_date ? -1 : 1);
  }
  async function createPawn(payload) {
    const category = ['jewelry', 'car', 'electronics', 'other'].includes(payload.category) ? payload.category : 'other';
    const ref = await db().collection('pawns').add({
      user_id: uid(), ticket_code: payload.ticket_code || null, shop_name: payload.shop_name || null,
      item_name: String(payload.item_name || '').trim(), category, amount: Number(payload.amount) || 0,
      interest: payload.interest != null ? Number(payload.interest) : null,
      due_date: payload.due_date, period_unit: payload.period_unit || null, period_value: payload.period_value || null,
      pawn_date: payload.pawn_date || dateStr(new Date()), renew_url: payload.renew_url || null,
      renewal_count: 0, status: 'active', created_at: nowIso(),
    });
    return { id: ref.id };
  }
  async function updatePawn(payload) {
    const ref = db().collection('pawns').doc(payload.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().user_id !== uid()) throw new Error('Not found');
    const patch = {};
    if (payload.item_name !== undefined) patch.item_name = String(payload.item_name).trim();
    if (payload.shop_name !== undefined) patch.shop_name = payload.shop_name || null;
    if (payload.ticket_code !== undefined) patch.ticket_code = payload.ticket_code || null;
    if (payload.category !== undefined) patch.category = ['jewelry', 'car', 'electronics', 'other'].includes(payload.category) ? payload.category : 'other';
    if (payload.amount !== undefined) patch.amount = Number(payload.amount) || 0;
    if (payload.interest !== undefined) patch.interest = payload.interest != null ? Number(payload.interest) : null;
    if (payload.due_date !== undefined) patch.due_date = payload.due_date;
    if (payload.period_unit !== undefined) patch.period_unit = payload.period_unit || null;
    if (payload.period_value !== undefined) patch.period_value = payload.period_value || null;
    if (payload.pawn_date !== undefined) patch.pawn_date = payload.pawn_date || null;
    if (payload.renew_url !== undefined) patch.renew_url = payload.renew_url || null;
    await ref.update(patch);
    return { ok: true };
  }
  async function deletePawn(id) {
    const ref = db().collection('pawns').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().user_id !== uid()) throw new Error('Not found');
    await ref.delete();
    return { ok: true };
  }
  async function redeemPawn(id, amount) {
    const ref = db().collection('pawns').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().user_id !== uid()) throw new Error('Not found');
    const p = doc.data();
    const patch = { status: 'redeemed' };
    const amt = amount != null && amount !== '' ? Number(amount) : null;
    if (amt != null) patch.redeemed_amount = amt;
    await ref.update(patch);
    await logHistory({ type: 'redeem', ref_id: id, item_name: p.item_name, category: p.category, amount: amt });
    return { ok: true };
  }
  // Jewelry no longer renews this way — its due date is fixed to pawn_date+5 months and
  // interest accrues monthly instead (see app.js renderPawnCard); this endpoint is only for
  // the other categories' pick-a-period renewal.
  async function renewPawn(id, period) {
    const ref = db().collection('pawns').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().user_id !== uid()) throw new Error('Not found');
    const p = doc.data();
    if (p.category === 'jewelry') throw new Error('เครื่องประดับไม่ใช้การต่อดอกแบบนี้แล้ว ดูดอกเบี้ยสะสมที่การ์ดตั๋วแทน');

    const d = new Date(p.due_date + 'T00:00:00');
    let periodUnit, periodValue;
    if (period.months) {
      periodValue = Math.max(1, Math.min(12, Number(period.months)));
      d.setMonth(d.getMonth() + periodValue);
      periodUnit = 'month';
    } else {
      periodValue = Math.max(1, Math.min(365, Number(period.days) || 30));
      d.setDate(d.getDate() + periodValue);
      periodUnit = 'day';
    }
    const dueDate = dateStr(d);
    await ref.update({ due_date: dueDate, renewal_count: (p.renewal_count || 0) + 1, status: 'active', period_unit: periodUnit, period_value: periodValue });
    await logHistory({ type: 'renew', ref_id: id, item_name: p.item_name, category: p.category, amount: p.interest || 0, due_date_before: p.due_date, due_date_after: dueDate });
    return { ok: true, due_date: dueDate };
  }
  // Jewelry's "ต่อดอก": paying the accrued interest at a real pawnshop resets the clock —
  // a fresh 4-month term (plus the usual 1-month grace before forfeit) starting from today,
  // same as the "ครั้งที่ 2 ส่งดอก" renewal tickets this data model is based on. There's no
  // due_date to shift for jewelry, so this resets pawn_date instead — monthsBetween() then
  // naturally starts counting from 1 again, and the 5-month final deadline moves out with it.
  async function renewJewelry(id) {
    const ref = db().collection('pawns').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().user_id !== uid()) throw new Error('Not found');
    const p = doc.data();
    if (p.category !== 'jewelry') throw new Error('รายการนี้ไม่ใช่เครื่องประดับ');
    const todayStr = dateStr(new Date());
    const oldPawnDate = p.pawn_date || (p.created_at || '').slice(0, 10);
    const monthNumber = monthsBetween(oldPawnDate, todayStr) + 1;
    const paidInterest = (p.interest || 0) * monthNumber;
    const finalDue = (dateIso) => { const d = new Date(dateIso + 'T00:00:00'); d.setMonth(d.getMonth() + 5); return dateStr(d); };
    await ref.update({ pawn_date: todayStr, renewal_count: (p.renewal_count || 0) + 1 });
    await logHistory({ type: 'renew', ref_id: id, item_name: p.item_name, category: 'jewelry', amount: paidInterest, due_date_before: finalDue(oldPawnDate), due_date_after: finalDue(todayStr) });
    return { ok: true, pawn_date: todayStr, paid_interest: paidInterest };
  }

  // ---------------- History (renew/redeem log) ----------------
  // Installments and expenses already carry their own paid_at/payments — only pawn
  // renew/redeem events need a dedicated log, since renewPawn/redeemPawn overwrite the pawn
  // doc in place and would otherwise lose the date+amount of each past cycle.
  async function logHistory(entry) {
    await db().collection('history').add({ user_id: uid(), date: dateStr(new Date()), created_at: nowIso(), ...entry });
  }

  // ---------------- Expenses ----------------
  function latestPayment(d) {
    const months = Object.keys(d.payments || {}).sort();
    if (!months.length) return null;
    const m = months[months.length - 1];
    return { month: m, ...d.payments[m] };
  }
  async function getExpenses() {
    const snap = await db().collection('expenses').where('user_id', '==', uid()).get();
    const currentMonth = monthStr(new Date());
    return snap.docs.map((doc) => {
      const d = doc.data();
      const latest = latestPayment(d);
      return {
        id: doc.id, name: d.name, expense_type: d.expense_type, amount: d.amount, due_day: d.due_day,
        paid_this_month: !!(d.payments && d.payments[currentMonth]),
        last_amount: latest ? latest.amount : null,
        payments: d.payments || {},
      };
    }).sort((a, b) => a.due_day - b.due_day);
  }
  async function createExpense(payload) {
    const expenseType = payload.expense_type === 'variable' ? 'variable' : 'fixed';
    const dueDay = Math.max(1, Math.min(28, Number(payload.due_day) || 5));
    const amount = expenseType === 'fixed' ? (Number(payload.amount) || 0) : null;
    const ref = await db().collection('expenses').add({
      user_id: uid(), name: String(payload.name || '').trim(), expense_type: expenseType, amount, due_day: dueDay,
      created_at: nowIso(), payments: {},
    });
    return { id: ref.id };
  }
  async function updateExpense(payload) {
    const ref = db().collection('expenses').doc(payload.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().user_id !== uid()) throw new Error('Not found');
    const patch = {};
    if (payload.name !== undefined) patch.name = String(payload.name).trim();
    if (payload.expense_type !== undefined) {
      const expenseType = payload.expense_type === 'variable' ? 'variable' : 'fixed';
      patch.expense_type = expenseType;
      patch.amount = expenseType === 'fixed' ? (Number(payload.amount) || 0) : null;
    } else if (payload.amount !== undefined) {
      patch.amount = Number(payload.amount) || 0;
    }
    if (payload.due_day !== undefined) patch.due_day = Math.max(1, Math.min(28, Number(payload.due_day) || 5));
    await ref.update(patch);
    return { ok: true };
  }
  async function markExpensePaid(id, amount) {
    const ref = db().collection('expenses').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().user_id !== uid()) throw new Error('Not found');
    const d = doc.data();
    const amt = amount !== undefined ? Number(amount) : Number(d.amount);
    if (!amt || amt <= 0) throw new Error('กรุณากรอกยอดที่จ่ายให้ถูกต้อง');
    const month = monthStr(new Date());
    const paidAt = nowIso();
    await ref.update({ [`payments.${month}`]: { amount: amt, paid_at: paidAt } });
    return { ok: true, amount: amt, month, paid_at: paidAt };
  }
  async function deleteExpense(id) {
    const ref = db().collection('expenses').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data().user_id !== uid()) throw new Error('Not found');
    await ref.delete();
    return { ok: true };
  }

  // ---------------- Dashboard report ----------------
  // Accepts already-loaded debts/pawns/expenses (the shapes getDebts/getPawns/getExpenses
  // return) so callers that already have fresh data in memory — which is every caller except
  // the very first load — can recompute the report without re-querying Firestore at all.
  async function getReport(debts, pawns, expenses) {
    [debts, pawns, expenses] = await Promise.all([debts || getDebts(), pawns || getPawns(), expenses || getExpenses()]);
    const now = new Date();
    const monthEnd = dateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    const currentMonth = monthStr(now);

    const totalDebt = debts.reduce((a, d) => a + d.remaining_amount, 0);
    const totalPawn = pawns.reduce((a, p) => a + p.amount, 0);
    const totalRecurring = expenses.reduce((a, e) => {
      if (e.expense_type === 'fixed') return a + (e.amount || 0);
      const latest = latestPayment(e);
      return a + (latest ? latest.amount : 0);
    }, 0);

    // No lower bound on due_date here — an unpaid installment or un-renewed pawn from a
    // PAST month must keep showing (now doubly overdue) once the calendar rolls over, not
    // silently fall out of the window just because it's no longer "this month's" due date.
    const dueInstallments = [];
    debts.forEach((d) => (d.installments || []).forEach((i) => {
      if (i.paid || i.due_date > monthEnd) return;
      dueInstallments.push({ type: 'installment', ref_id: i.id, debt_id: d.id, title: d.name, amount: i.amount, due_date: i.due_date });
    }));
    const todayStr = dateStr(now);
    const duePawns = pawns
      .filter((p) => p.category !== 'jewelry' && p.due_date <= monthEnd)
      .map((p) => ({ type: 'pawn', ref_id: p.id, title: p.item_name, amount: p.interest || 0, due_date: p.due_date, category: p.category }));
    // Jewelry: once accrued interest reaches month 4, it becomes a "due now" line item —
    // there's no calendar due_date to check against since renewal no longer shifts a date.
    pawns.filter((p) => p.category === 'jewelry').forEach((p) => {
      const pawnDate = p.pawn_date || (p.created_at || '').slice(0, 10);
      const monthNumber = monthsBetween(pawnDate, todayStr) + 1;
      if (monthNumber < 4 || !p.interest) return;
      duePawns.push({ type: 'pawn', ref_id: p.id, title: `${p.item_name} (ดอกเบี้ยสะสม)`, amount: p.interest * monthNumber, due_date: todayStr, category: p.category, principal: p.amount, month_number: monthNumber });
    });
    const dueExpenses = expenses
      .filter((e) => !(e.payments && e.payments[currentMonth]))
      .map((e) => {
        const displayAmount = e.expense_type === 'fixed' ? (e.amount || 0) : ((latestPayment(e) || {}).amount || 0);
        return {
          type: 'expense', ref_id: e.id, expense_type: e.expense_type, title: e.name, amount: displayAmount,
          due_date: currentMonth + '-' + String(e.due_day).padStart(2, '0'),
        };
      });

    const breakdown = [...dueInstallments, ...duePawns, ...dueExpenses].sort((a, b) => a.due_date < b.due_date ? -1 : 1);
    const totalDueThisMonth = breakdown.reduce((a, r) => a + r.amount, 0);
    return { total_debt: totalDebt, total_pawn: totalPawn, total_recurring: totalRecurring, total_due_this_month: totalDueThisMonth, breakdown };
  }
  // Combines the pawn renew/redeem log with installments (already carry paid_at) and expense
  // payments (already carry a payments.{month} map) into one chronological list, plus a
  // this-month summary. Redeemed pawn principal is tracked separately from net_spend — it's
  // cash coming back with the item, not a real cost, unlike interest/installments/expenses.
  // debts/history always need a fresh query (debts must include closed ones too, for their
  // past payment history, unlike getDebts() which is active-only; history has no local cache
  // at all) — only expenses can be reused from an already-loaded getExpenses() array.
  async function getHistory(expenses) {
    const [debtsSnap, historySnap, expensesResolved] = await Promise.all([
      db().collection('debts').where('user_id', '==', uid()).get(),
      db().collection('history').where('user_id', '==', uid()).get(),
      expenses || getExpenses(),
    ]);
    expenses = expensesResolved;
    const items = [];

    debtsSnap.docs.forEach((doc) => {
      const d = doc.data();
      (d.installments || []).forEach((i) => {
        if (!i.paid || !i.paid_at) return;
        items.push({ id: 'installment-' + i.id, type: 'installment', ref_id: i.id, debt_id: doc.id, title: d.name, amount: i.amount, date: i.paid_at.slice(0, 10) });
      });
    });

    historySnap.docs.forEach((doc) => {
      const h = doc.data();
      items.push({ id: doc.id, type: h.type, ref_id: h.ref_id, category: h.category, title: h.item_name, amount: h.amount || 0, date: h.date, due_date_after: h.due_date_after });
    });

    expenses.forEach((e) => {
      Object.entries(e.payments || {}).forEach(([month, p]) => {
        items.push({ id: 'expense-' + e.id + '-' + month, type: 'expense', ref_id: e.id, title: e.name, amount: p.amount || 0, date: (p.paid_at || '').slice(0, 10) });
      });
    });

    items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const currentMonth = monthStr(new Date());
    const inMonth = (it) => (it.date || '').slice(0, 7) === currentMonth;
    const sum = (type) => items.filter((it) => it.type === type && inMonth(it)).reduce((a, it) => a + (it.amount || 0), 0);
    const interestPaid = sum('renew');
    const installmentsPaid = sum('installment');
    const expensesPaid = sum('expense');
    const redeemedCash = sum('redeem');
    const netSpend = interestPaid + installmentsPaid + expensesPaid;

    return {
      items,
      summary: {
        month: currentMonth, interest_paid: interestPaid, installments_paid: installmentsPaid,
        expenses_paid: expensesPaid, redeemed_cash: redeemedCash, net_spend: netSpend,
        total_cash_out: netSpend + redeemedCash,
      },
    };
  }

  // ---------------- Settings ----------------
  async function getSettings() {
    const doc = await db().collection('users').doc(uid()).get();
    return { warn_days: (doc.data() || {}).warn_days || 3 };
  }
  async function updateSettings(payload) {
    const patch = {};
    if (payload.warn_days !== undefined) patch.warn_days = Math.max(1, Math.min(30, Number(payload.warn_days)));
    await db().collection('users').doc(uid()).update(patch);
    return { ok: true };
  }

  // ---------------- Notifications ----------------
  // No server/cron here, so there's nothing pushed to the OS notification tray while the app
  // is closed — this is a live "what needs attention" digest computed from current data each
  // time the bell is opened, using the same due/overdue rules the old cron job used. Read
  // state is per-day in localStorage since there's nothing to persist server-side.
  function readNotifIds() {
    try { return JSON.parse(localStorage.getItem('dpt_read_notifs') || '[]'); } catch (e) { return []; }
  }
  function saveNotifIds(ids) { localStorage.setItem('dpt_read_notifs', JSON.stringify(ids)); }

  async function getNotifications(debts, pawns, expenses, settings) {
    [debts, pawns, expenses, settings] = await Promise.all([
      debts || getDebts(), pawns || getPawns(), expenses || getExpenses(), settings || getSettings(),
    ]);
    const warnDays = settings.warn_days;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr = dateStr(today);
    const daysUntil = (due) => Math.round((new Date(due + 'T00:00:00') - today) / 86400000);
    const items = [];

    debts.forEach((d) => (d.installments || []).forEach((i) => {
      if (i.paid) return;
      const days = daysUntil(i.due_date);
      if (days > warnDays) return;
      const title = days < 0 ? 'ค้างชำระ' : 'ใกล้ถึงกำหนดชำระ';
      const body = `${d.name} — ฿${Math.round(i.amount).toLocaleString('th-TH')} ครบกำหนด ${i.due_date}`;
      items.push({ id: 'installment-' + i.id, ref_type: 'installment', ref_id: i.id, title, body, sent_at: todayStr + 'T00:00:00' });
    }));

    pawns.forEach((p) => {
      const pawnDate = p.pawn_date || (p.created_at || '').slice(0, 10);
      if (p.category === 'jewelry') {
        const finalDue = new Date(pawnDate + 'T00:00:00'); finalDue.setMonth(finalDue.getMonth() + 5);
        const finalDueStr = dateStr(finalDue);
        if (todayStr >= finalDueStr) {
          items.push({ id: 'pawn-' + p.id, ref_type: 'pawn', ref_id: p.id, title: '⚠️ ตั๋วจำนำใกล้ขาดแล้ว!', body: `${p.item_name} — ครบกำหนดไถ่ถอนสุดท้ายวันนี้ (${finalDueStr})`, sent_at: todayStr + 'T00:00:00' });
          return;
        }
        const monthNumber = monthsBetween(pawnDate, todayStr) + 1;
        if (monthNumber >= 4 && p.interest) {
          const accrued = p.interest * monthNumber;
          items.push({ id: 'pawn-' + p.id, ref_type: 'pawn', ref_id: p.id, title: '⚠️ ครบ 4 เดือนแล้ว', body: `${p.item_name} — ดอกเบี้ยสะสม ฿${Math.round(accrued).toLocaleString('th-TH')} ใกล้ครบกำหนดสุดท้าย (${finalDueStr})`, sent_at: todayStr + 'T00:00:00' });
        }
        return;
      }
      // Electronics: warn starting 1 day before due (not the general warnDays setting), and
      // keep it unread every load (persistent: true skips the read-id filter below) until the
      // due_date actually moves — i.e. it's renewed — rather than going quiet once dismissed.
      // Copy always pushes toward renewing, never redeeming.
      if (p.category === 'electronics') {
        const days = daysUntil(p.due_date);
        if (days <= 1) {
          const title = days < 0 ? '⚠️ ตั๋วจำนำเลยกำหนดแล้ว ต่อดอกด่วน!' : days === 0 ? '⚠️ ตั๋วจำนำครบกำหนดวันนี้ ต่อดอกด่วน!' : '⚠️ ตั๋วจำนำใกล้ครบกำหนด เตรียมต่อดอก';
          const body = `${p.item_name} — ดอก ฿${Math.round(p.interest || 0).toLocaleString('th-TH')} ครบกำหนด ${p.due_date} (ยังไม่ได้ต่อดอก)`;
          items.push({ id: 'pawn-' + p.id, ref_type: 'pawn', ref_id: p.id, title, body, sent_at: todayStr + 'T00:00:00', persistent: true });
        }
        return;
      }
      const days = daysUntil(p.due_date);
      if (days <= warnDays) {
        const title = days < 0 ? 'ตั๋วจำนำเลยกำหนด' : 'ตั๋วจำนำใกล้ครบกำหนด';
        const body = `${p.item_name} — ฿${Math.round(p.amount).toLocaleString('th-TH')} ครบกำหนด ${p.due_date}`;
        items.push({ id: 'pawn-' + p.id, ref_type: 'pawn', ref_id: p.id, title, body, sent_at: todayStr + 'T00:00:00' });
      }
    });

    const currentMonth = todayStr.slice(0, 7);
    expenses.forEach((e) => {
      if (e.payments && e.payments[currentMonth]) return;
      const dueDate = currentMonth + '-' + String(e.due_day).padStart(2, '0');
      const days = daysUntil(dueDate);
      if (days > warnDays) return;
      const title = days < 0 ? 'ค่าใช้จ่ายประจำค้างชำระ' : 'ค่าใช้จ่ายประจำใกล้ถึงกำหนด';
      const amountPart = e.expense_type === 'fixed' ? `฿${Math.round(e.amount || 0).toLocaleString('th-TH')} ` : '';
      items.push({ id: 'expense-' + e.id, ref_type: 'expense', ref_id: e.id, title, body: `${e.name} — ${amountPart}ครบกำหนด ${dueDate}`, sent_at: todayStr + 'T00:00:00' });
    });

    const readIds = readNotifIds();
    const withRead = items.map((it) => ({ ...it, read_at: it.persistent ? null : (readIds.includes(it.id) ? todayStr : null) }));
    withRead.sort((a, b) => a.title < b.title ? -1 : 1);
    return { items: withRead, unread_count: withRead.filter((it) => !it.read_at).length };
  }
  async function markNotificationRead(id) {
    const ids = readNotifIds();
    if (!ids.includes(id)) { ids.push(id); saveNotifIds(ids); }
    return { ok: true };
  }
  async function markAllNotificationsRead() {
    const res = await getNotifications();
    saveNotifIds(res.items.map((it) => it.id));
    return { ok: true };
  }

  return {
    ready: ensureAuth,
    setActiveUser,
    login, switchUser, getUsers,
    getDebts, getDebtDetail, createDebt, updateDebt, closeDebt, deleteDebt, markInstallmentPaid,
    getPawns, createPawn, updatePawn, deletePawn, redeemPawn, renewPawn, renewJewelry,
    getReport, getHistory,
    getExpenses, createExpense, updateExpense, markExpensePaid, deleteExpense,
    getSettings, updateSettings,
    getNotifications, markNotificationRead, markAllNotificationsRead,
  };
})();
