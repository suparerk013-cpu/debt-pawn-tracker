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
  // Date and jewelry-cycle rules come from rules.js (loaded before this file), which the
  // GitHub Actions push sender also imports — one definition, so the notification that
  // arrives on a closed phone can't disagree with what the app shows when it's opened.
  const { monthsBetween, jewelryTerm, JEWELRY_BILLED_MONTHS } = Rules;

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
  // Every pawn mutation below runs in a transaction that also writes its history row, so a
  // double-tap on a slow connection can't leave the two out of sync (which is exactly what
  // happened before: 4 renew rows logged but only 3 due-date bumps, because two concurrent
  // read-modify-writes both read the same stale due_date and one overwrote the other).
  async function redeemPawn(id, amount) {
    const ref = db().collection('pawns').doc(id);
    const histRef = db().collection('history').doc();
    const amt = amount != null && amount !== '' ? Number(amount) : null;
    await db().runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists || doc.data().user_id !== uid()) throw new Error('Not found');
      const p = doc.data();
      if (p.status === 'redeemed') throw new Error('ตั๋วนี้ไถ่ถอนไปแล้ว');
      const patch = { status: 'redeemed' };
      if (amt != null) patch.redeemed_amount = amt;
      tx.update(ref, patch);
      tx.set(histRef, { user_id: uid(), date: dateStr(new Date()), created_at: nowIso(), type: 'redeem', ref_id: id, item_name: p.item_name, category: p.category, amount: amt });
    });
    return { ok: true };
  }
  // Jewelry no longer renews this way — its due date is fixed to pawn_date+5 months and
  // interest accrues monthly instead (see app.js renderPawnCard); this endpoint is only for
  // the other categories' pick-a-period renewal.
  async function renewPawn(id, period) {
    const ref = db().collection('pawns').doc(id);
    const histRef = db().collection('history').doc();
    let dueDate;
    await db().runTransaction(async (tx) => {
      const doc = await tx.get(ref);
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
      dueDate = dateStr(d);
      tx.update(ref, { due_date: dueDate, renewal_count: (p.renewal_count || 0) + 1, status: 'active', period_unit: periodUnit, period_value: periodValue });
      tx.set(histRef, { user_id: uid(), date: dateStr(new Date()), created_at: nowIso(), type: 'renew', ref_id: id, item_name: p.item_name, category: p.category, amount: p.interest || 0, due_date_before: p.due_date, due_date_after: dueDate });
    });
    return { ok: true, due_date: dueDate };
  }
  // Jewelry's "ต่อดอก": paying the accrued interest at a real pawnshop resets the clock —
  // a fresh 4-month term (plus the usual 1-month grace before forfeit) starting from today,
  // same as the "ครั้งที่ 2 ส่งดอก" renewal tickets this data model is based on. There's no
  // due_date to shift for jewelry, so this resets pawn_date instead — jewelryTerm() then
  // naturally starts counting from 1 again, and the 5-month final deadline moves out with it.
  async function renewJewelry(id) {
    const ref = db().collection('pawns').doc(id);
    const histRef = db().collection('history').doc();
    const todayStr = dateStr(new Date());
    let paidInterest = 0;
    await db().runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists || doc.data().user_id !== uid()) throw new Error('Not found');
      const p = doc.data();
      if (p.category !== 'jewelry') throw new Error('รายการนี้ไม่ใช่เครื่องประดับ');
      const oldPawnDate = p.pawn_date || (p.created_at || '').slice(0, 10);
      paidInterest = (p.interest || 0) * jewelryTerm(oldPawnDate, todayStr).billed;
      const finalDue = (iso) => { const d = new Date(iso + 'T00:00:00'); d.setMonth(d.getMonth() + 5); return dateStr(d); };
      tx.update(ref, { pawn_date: todayStr, renewal_count: (p.renewal_count || 0) + 1 });
      // pawn_date_before is what undoHistory() rolls back to — recorded explicitly rather than
      // re-derived from due_date_before, since month arithmetic isn't cleanly invertible
      // around end-of-month dates.
      tx.set(histRef, { user_id: uid(), date: todayStr, created_at: nowIso(), type: 'renew', ref_id: id, item_name: p.item_name, category: 'jewelry', amount: paidInterest, pawn_date_before: oldPawnDate, pawn_date_after: todayStr, due_date_before: finalDue(oldPawnDate), due_date_after: finalDue(todayStr) });
    });
    return { ok: true, pawn_date: todayStr, paid_interest: paidInterest };
  }

  // ---------------- History (renew/redeem log) ----------------
  // Installments and expenses already carry their own paid_at/payments — only pawn
  // renew/redeem events need a dedicated log, since renewPawn/redeemPawn overwrite the pawn
  // doc in place and would otherwise lose the date+amount of each past cycle.

  // Reads any pawn by id regardless of status — getPawns() only returns active ones, but the
  // history screen has to open detail popups for tickets that were redeemed and so dropped out.
  async function getPawnById(id) {
    const doc = await db().collection('pawns').doc(id).get();
    if (!doc.exists || doc.data().user_id !== uid()) throw new Error('ไม่พบตั๋วจำนำนี้');
    return { id: doc.id, ...doc.data() };
  }

  // Reverses one logged renew/redeem and removes its history row — the "คืนสินค้า" escape
  // hatch for a mis-tap. Runs in a transaction so the pawn and the log can't disagree if it
  // fails halfway. Installment/expense history rows are derived from their own documents
  // rather than stored here, so they have no undoable log row and aren't accepted.
  async function undoHistory(historyId) {
    const histRef = db().collection('history').doc(historyId);
    let undone;
    await db().runTransaction(async (tx) => {
      const hDoc = await tx.get(histRef);
      if (!hDoc.exists || hDoc.data().user_id !== uid()) throw new Error('ไม่พบรายการประวัตินี้');
      const h = hDoc.data();
      if (h.type !== 'renew' && h.type !== 'redeem') throw new Error('รายการนี้ย้อนกลับไม่ได้');

      const pawnRef = db().collection('pawns').doc(h.ref_id);
      const pDoc = await tx.get(pawnRef);
      if (!pDoc.exists || pDoc.data().user_id !== uid()) throw new Error('ไม่พบตั๋วจำนำของรายการนี้ (อาจถูกลบไปแล้ว)');
      const p = pDoc.data();

      if (h.type === 'redeem') {
        tx.update(pawnRef, { status: 'active', redeemed_amount: firebase.firestore.FieldValue.delete() });
        undone = 'redeem';
      } else {
        const patch = { renewal_count: Math.max(0, (p.renewal_count || 0) - 1) };
        if (h.category === 'jewelry') {
          // Older rows predate pawn_date_before; fall back to backing the final due date out
          // by the same 5 months renewJewelry() added when it wrote the row.
          let before = h.pawn_date_before;
          if (!before && h.due_date_before) {
            const d = new Date(h.due_date_before + 'T00:00:00'); d.setMonth(d.getMonth() - 5); before = dateStr(d);
          }
          if (!before) throw new Error('รายการนี้ไม่มีข้อมูลวันเดิม ย้อนกลับไม่ได้');
          patch.pawn_date = before;
        } else {
          if (!h.due_date_before) throw new Error('รายการนี้ไม่มีข้อมูลวันเดิม ย้อนกลับไม่ได้');
          patch.due_date = h.due_date_before;
        }
        tx.update(pawnRef, patch);
        undone = 'renew';
      }
      tx.delete(histRef);
    });
    return { ok: true, type: undone };
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
    // Jewelry and everything else are tracked separately end-to-end: they use different
    // renewal mechanics (monthly accrual vs. pick-a-period), so a combined figure hides
    // which half of the money is actually moving.
    const isJewelry = (p) => p.category === 'jewelry';
    const todayForTerms = dateStr(now);
    const jewelryPawns = pawns.filter(isJewelry);
    const otherPawns = pawns.filter((p) => !isJewelry(p));
    const totalPawnJewelry = jewelryPawns.reduce((a, p) => a + p.amount, 0);
    const totalPawnOther = otherPawns.reduce((a, p) => a + p.amount, 0);
    // Interest owed right now: jewelry has accrued since its pawn date (capped at 4 months);
    // other categories owe one flat interest payment per renewal cycle.
    const interestJewelry = jewelryPawns.reduce((a, p) => {
      const pawnDate = p.pawn_date || (p.created_at || '').slice(0, 10);
      return a + (p.interest || 0) * jewelryTerm(pawnDate, todayForTerms).billed;
    }, 0);
    const interestOther = otherPawns.reduce((a, p) => a + (p.interest || 0), 0);
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
    jewelryPawns.forEach((p) => {
      const pawnDate = p.pawn_date || (p.created_at || '').slice(0, 10);
      const term = jewelryTerm(pawnDate, todayStr);
      if (term.billed < JEWELRY_BILLED_MONTHS || !p.interest) return;
      // due_date stays "today" so the row sorts as needing action now; final_due is the real
      // calendar deadline (pawn date + 5 months) the card shows the user.
      const finalDue = new Date(pawnDate + 'T00:00:00'); finalDue.setMonth(finalDue.getMonth() + 5);
      duePawns.push({ type: 'pawn', ref_id: p.id, title: `${p.item_name} (ดอกเบี้ยสะสม)`, amount: p.interest * term.billed, due_date: todayStr, category: p.category, principal: p.amount, month_number: term.billed, months_elapsed: term.elapsed, term_overdue: term.overdue, pawn_date: pawnDate, final_due: dateStr(finalDue) });
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
    return {
      total_debt: totalDebt, total_pawn: totalPawn, total_recurring: totalRecurring,
      total_due_this_month: totalDueThisMonth, breakdown,
      total_pawn_jewelry: totalPawnJewelry, total_pawn_other: totalPawnOther,
      interest_jewelry: interestJewelry, interest_other: interestOther,
      count_pawn_jewelry: jewelryPawns.length, count_pawn_other: otherPawns.length,
    };
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
      items.push({
        id: doc.id, type: h.type, ref_id: h.ref_id, category: h.category, title: h.item_name,
        amount: h.amount || 0, date: h.date,
        // *_before are what the undo button previews and undoHistory() restores.
        due_date_before: h.due_date_before, due_date_after: h.due_date_after, pawn_date_before: h.pawn_date_before,
      });
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
    const todayStr = dateStr(new Date());
    // The rules themselves live in rules.js so the GitHub Actions sender that pushes while
    // the phone is closed evaluates exactly the same conditions this screen does.
    const items = Rules.buildNotifications({ debts, pawns, expenses, warnDays: settings.warn_days, todayStr });

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

  // ---------------- Push registration ----------------
  // Everything above only runs while the app is open. Registering an FCM token here is what
  // lets the scheduled sender reach the phone when it isn't. Tokens are stored per app-user
  // (not/lek) so each person's phone only gets their own reminders; the same device logging
  // in as someone else simply re-points its token at that user.
  function pushSupported() {
    return typeof Notification !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
      && typeof firebase !== 'undefined' && !!firebase.messaging
      && (!firebase.messaging.isSupported || firebase.messaging.isSupported());
  }
  // "enabled" deliberately means "this device's token is stored in Firestore", not merely
  // "the browser has a push subscription". Those two fail independently: a subscription can
  // exist while the write that makes the device reachable never landed — which looks
  // identical on screen but leaves the sender with nobody to send to.
  // Every step here can hang rather than fail: serviceWorker.ready never settles when no
  // worker activates, and getToken can wait on a network round trip that never returns. An
  // unresolved promise leaves the card stuck on "checking" forever, which tells the user less
  // than an error would, so each step gets a deadline and reports which one ran out.
  function withTimeout(promise, ms, label) {
    return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout:" + label)), ms))]);
  }

  // Written by sw.js on every push event. Reading it back is the only way to tell a message
  // that never reached this device from one that reached it and failed to display.
  async function readPushLog() {
    try {
      const c = await caches.open("dpt-push-log");
      const res = await c.match("/__push_log");
      return res ? await res.json() : [];
    } catch (e) { return []; }
  }

  // The arrival log only exists on the phone, and reading it has meant asking the user to
  // photograph a settings card. Mirroring it to Firestore whenever the app opens puts the
  // same evidence somewhere it can be read directly.
  async function reportDeviceState(status, log) {
    try {
      await db().collection("diagnostics").doc("last_device_report").set({
        at: nowIso(), user_id: activeUserId || null, status: status || null,
        pushLog: (log || []).slice(0, 5),
        ua: (navigator.userAgent || "").slice(0, 180),
      });
    } catch (e) { /* diagnostics must never block the app */ }
  }

  async function getPushStatus() {
    if (!pushSupported()) return { supported: false, permission: "unsupported", enabled: false, subscribed: false, detail: "" };
    const permission = Notification.permission;
    const status = { supported: true, permission, enabled: false, subscribed: false, detail: "" };
    if (permission !== "granted") return status;
    try {
      const reg = await withTimeout(navigator.serviceWorker.ready, 8000, "sw-ready");
      const sub = reg && reg.pushManager ? await withTimeout(reg.pushManager.getSubscription(), 5000, "get-subscription") : null;
      status.subscribed = !!sub;
      const vapidKey = (typeof window !== "undefined" && window.FIREBASE_VAPID_KEY) || "";
      if (!vapidKey) { status.detail = "no-vapid-key"; return status; }
      const token = await withTimeout(firebase.messaging().getToken({ vapidKey, serviceWorkerRegistration: reg }), 12000, "get-token");
      if (!token) { status.detail = "no-token"; return status; }
      const doc = await withTimeout(db().collection("push_tokens").doc(token).get(), 8000, "firestore-read");
      status.enabled = doc.exists && doc.data().user_id === uid();
      if (!status.enabled) status.detail = doc.exists ? "token-owned-by-other-user" : "token-not-saved";
    } catch (e) {
      status.detail = (e && (e.code || e.message)) || "check-failed";
    }
    return status;
  }
  async function enablePush() {
    if (!pushSupported()) throw new Error('เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือนแบบส่งเข้าเครื่อง');
    if (Notification.permission === 'denied') {
      throw new Error('การแจ้งเตือนถูกปิดไว้ในเครื่อง — ต้องไปเปิดเองที่ตั้งค่าเบราว์เซอร์/แอปก่อน');
    }
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('ไม่ได้รับอนุญาตให้แจ้งเตือน');

    const vapidKey = (typeof window !== 'undefined' && window.FIREBASE_VAPID_KEY) || '';
    if (!vapidKey) throw new Error('ยังไม่ได้ตั้งค่า VAPID key');
    // Reuse the app's own service worker instead of letting FCM register a second one — the
    // push/notificationclick handlers live in sw.js.
    const reg = await navigator.serviceWorker.ready;
    const token = await firebase.messaging().getToken({ vapidKey, serviceWorkerRegistration: reg });
    if (!token) throw new Error('ขอ token ไม่สำเร็จ');

    await db().collection('push_tokens').doc(token).set({
      user_id: uid(), token, updated_at: nowIso(),
      ua: (navigator.userAgent || '').slice(0, 180),
    });
    // Read it back: the write is what actually makes this device reachable, so confirm it
    // reached the server rather than reporting success off a resolved promise alone.
    const check = await db().collection('push_tokens').doc(token).get();
    if (!check.exists) throw new Error('บันทึก token ไม่สำเร็จ (เขียนแล้วแต่อ่านกลับไม่เจอ)');
    return { ok: true, token };
  }
  async function disablePush() {
    if (!pushSupported()) return { ok: true };
    try {
      const token = await firebase.messaging().getToken({
        vapidKey: (typeof window !== 'undefined' && window.FIREBASE_VAPID_KEY) || '',
        serviceWorkerRegistration: await navigator.serviceWorker.ready,
      });
      if (token) {
        await db().collection('push_tokens').doc(token).delete().catch(() => {});
        await firebase.messaging().deleteToken().catch(() => {});
      }
    } catch (e) { /* nothing registered to remove */ }
    return { ok: true };
  }

  return {
    ready: ensureAuth,
    setActiveUser,
    login, switchUser, getUsers,
    getDebts, getDebtDetail, createDebt, updateDebt, closeDebt, deleteDebt, markInstallmentPaid,
    getPawns, getPawnById, createPawn, updatePawn, deletePawn, redeemPawn, renewPawn, renewJewelry,
    getReport, getHistory, undoHistory,
    getExpenses, createExpense, updateExpense, markExpensePaid, deleteExpense,
    getSettings, updateSettings,
    getNotifications, markNotificationRead, markAllNotificationsRead,
    pushSupported, getPushStatus, enablePush, disablePush, readPushLog, reportDeviceState,
  };
})();
