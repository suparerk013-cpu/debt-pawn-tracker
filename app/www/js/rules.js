// Shared due-date rules — the ONLY place that decides what counts as needing attention.
//
// Loaded two ways on purpose: as a plain <script> in the browser (api.js reads window.Rules)
// and as a CommonJS module by scripts/send-notifications.js in GitHub Actions. The push
// notifications sent while the phone is closed have to agree with what the app shows when it
// is opened, and the only reliable way to guarantee that is for both to run this same code.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Rules = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Calendar dates use LOCAL Y/M/D, never toISOString() (which shifts a day in UTC+7).
  function dateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function addMonths(iso, n) {
    const d = new Date(iso + 'T00:00:00');
    d.setMonth(d.getMonth() + n);
    return dateStr(d);
  }
  // Whole calendar months between two 'YYYY-MM-DD' dates (0 until the day-of-month recurs).
  function monthsBetween(fromStr, toStr) {
    const from = new Date(fromStr + 'T00:00:00');
    const to = new Date(toStr + 'T00:00:00');
    let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
    if (to.getDate() < from.getDate()) months--;
    return Math.max(0, months);
  }
  function daysBetween(fromStr, toStr) {
    return Math.round((new Date(toStr + 'T00:00:00') - new Date(fromStr + 'T00:00:00')) / 86400000);
  }

  // Jewelry is billed for at most 4 months (the shop forfeits in the 5th), so `billed` stops
  // at 4 however long it sits; `elapsed` keeps climbing only so the UI can say how far past.
  const JEWELRY_BILLED_MONTHS = 4;
  function jewelryTerm(pawnDate, todayStr) {
    const elapsed = monthsBetween(pawnDate, todayStr) + 1;
    return {
      elapsed,
      billed: Math.min(elapsed, JEWELRY_BILLED_MONTHS),
      overdue: elapsed > JEWELRY_BILLED_MONTHS,
    };
  }

  const baht = (n) => '฿' + Math.round(n || 0).toLocaleString('th-TH');

  // Builds the "needs attention" digest from already-loaded data. Pure: no I/O, no clock
  // reads beyond the todayStr passed in, so the sender and the app can both call it.
  function buildNotifications({ debts = [], pawns = [], expenses = [], warnDays = 3, todayStr }) {
    const today = todayStr || dateStr(new Date());
    const daysUntil = (due) => daysBetween(today, due);
    const items = [];

    debts.forEach((d) => (d.installments || []).forEach((i) => {
      if (i.paid) return;
      const days = daysUntil(i.due_date);
      if (days > warnDays) return;
      items.push({
        id: 'installment-' + i.id, ref_type: 'installment', ref_id: i.id,
        title: days < 0 ? 'ค้างชำระ' : 'ใกล้ถึงกำหนดชำระ',
        body: `${d.name} — ${baht(i.amount)} ครบกำหนด ${i.due_date}`,
        sent_at: today + 'T00:00:00',
      });
    }));

    pawns.forEach((p) => {
      const pawnDate = p.pawn_date || (p.created_at || '').slice(0, 10);
      if (p.category === 'jewelry') {
        const finalDueStr = addMonths(pawnDate, 5);
        if (today >= finalDueStr) {
          items.push({
            id: 'pawn-' + p.id, ref_type: 'pawn', ref_id: p.id,
            title: '⚠️ ตั๋วจำนำใกล้ขาดแล้ว!',
            body: `${p.item_name} — ครบกำหนดไถ่ถอนสุดท้ายวันนี้ (${finalDueStr})`,
            sent_at: today + 'T00:00:00', persistent: true,
          });
          return;
        }
        const term = jewelryTerm(pawnDate, today);
        if (term.billed >= JEWELRY_BILLED_MONTHS && p.interest) {
          items.push({
            id: 'pawn-' + p.id, ref_type: 'pawn', ref_id: p.id,
            title: term.overdue ? '⚠️ เลยกำหนดต่อดอกแล้ว' : '⚠️ ครบ 4 เดือนแล้ว',
            body: `${p.item_name} — ดอกเบี้ยสะสม ${baht(p.interest * term.billed)} ต้องต่อดอกหรือไถ่ถอนก่อน ${finalDueStr}`,
            sent_at: today + 'T00:00:00', persistent: true,
          });
        }
        return;
      }
      // Electronics: warn from 1 day before due (not the general warnDays), and stay unread
      // every load (persistent) until the due_date actually moves — i.e. it's renewed —
      // rather than going quiet once dismissed. Copy pushes toward renewing, not redeeming.
      if (p.category === 'electronics') {
        const days = daysUntil(p.due_date);
        if (days <= 1) {
          items.push({
            id: 'pawn-' + p.id, ref_type: 'pawn', ref_id: p.id,
            title: days < 0 ? '⚠️ ตั๋วจำนำเลยกำหนดแล้ว ต่อดอกด่วน!'
              : days === 0 ? '⚠️ ตั๋วจำนำครบกำหนดวันนี้ ต่อดอกด่วน!'
              : '⚠️ ตั๋วจำนำใกล้ครบกำหนด เตรียมต่อดอก',
            body: `${p.item_name} — ดอก ${baht(p.interest || 0)} ครบกำหนด ${p.due_date} (ยังไม่ได้ต่อดอก)`,
            sent_at: today + 'T00:00:00', persistent: true,
          });
        }
        return;
      }
      const days = daysUntil(p.due_date);
      if (days <= warnDays) {
        items.push({
          id: 'pawn-' + p.id, ref_type: 'pawn', ref_id: p.id,
          title: days < 0 ? 'ตั๋วจำนำเลยกำหนด' : 'ตั๋วจำนำใกล้ครบกำหนด',
          body: `${p.item_name} — ${baht(p.amount)} ครบกำหนด ${p.due_date}`,
          sent_at: today + 'T00:00:00',
        });
      }
    });

    const currentMonth = today.slice(0, 7);
    expenses.forEach((e) => {
      if (e.payments && e.payments[currentMonth]) return;
      const dueDate = currentMonth + '-' + String(e.due_day).padStart(2, '0');
      const days = daysUntil(dueDate);
      if (days > warnDays) return;
      const amountPart = e.expense_type === 'fixed' ? baht(e.amount || 0) + ' ' : '';
      items.push({
        id: 'expense-' + e.id, ref_type: 'expense', ref_id: e.id,
        title: days < 0 ? 'ค่าใช้จ่ายประจำค้างชำระ' : 'ค่าใช้จ่ายประจำใกล้ถึงกำหนด',
        body: `${e.name} — ${amountPart}ครบกำหนด ${dueDate}`,
        sent_at: today + 'T00:00:00',
      });
    });

    return items;
  }

  // Collapses the digest into the single push message that actually gets sent, so a morning
  // with six overdue tickets is one line in the tray instead of six separate buzzes.
  function buildPushPayload(items) {
    if (!items.length) return null;
    if (items.length === 1) return { title: items[0].title, body: items[0].body };
    const urgent = items.filter((i) => i.title.startsWith('⚠️')).length;
    return {
      title: `มี ${items.length} รายการต้องจัดการ${urgent ? ` (ด่วน ${urgent})` : ''}`,
      body: items.slice(0, 3).map((i) => i.body.split(' — ')[0]).join(', ')
        + (items.length > 3 ? ` และอีก ${items.length - 3} รายการ` : ''),
    };
  }

  // Telegram has no notification-shade length limit, so it lists every item in full rather
  // than the three-item summary a push has to squeeze into. Same items, same wording — only
  // the amount that fits differs.
  function buildTelegramMessage(items) {
    if (!items.length) return null;
    const urgent = items.filter((i) => i.title.startsWith("⚠️")).length;
    const head = `🔔 มี ${items.length} รายการต้องจัดการ${urgent ? ` (ด่วน ${urgent})` : ""}`;
    const NL = String.fromCharCode(10);
    const bullet = String.fromCharCode(8226);
    const lines = items.map((i) => bullet + " " + i.title + NL + "   " + i.body);
    return [head, ""].concat(lines).join(NL);
  }

  return {
    dateStr, addMonths, monthsBetween, daysBetween,
    JEWELRY_BILLED_MONTHS, jewelryTerm,
    buildNotifications, buildPushPayload, buildTelegramMessage,
  };
});
