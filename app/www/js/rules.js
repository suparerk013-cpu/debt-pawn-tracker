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
  // Dates inside notification and reminder text are read by a person, not a parser, so they
  // are written the Thai way (27 ก.ย. 69) rather than as the stored ISO string.
  const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  function thaiDate(iso) {
    if (!iso) return '-';
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return String(iso);
    return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${String(d.getFullYear() + 543).slice(-2)}`;
  }

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
        body: `${d.name} — ${baht(i.amount)} ครบกำหนด ${thaiDate(i.due_date)}`,
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
            body: `${p.item_name} — ครบกำหนดไถ่ถอนสุดท้ายวันนี้ (${thaiDate(finalDueStr)})`,
            sent_at: today + 'T00:00:00', persistent: true,
          });
          return;
        }
        const term = jewelryTerm(pawnDate, today);
        if (term.billed >= JEWELRY_BILLED_MONTHS && p.interest) {
          items.push({
            id: 'pawn-' + p.id, ref_type: 'pawn', ref_id: p.id,
            title: term.overdue ? '⚠️ เลยกำหนดต่อดอกแล้ว' : '⚠️ ครบ 4 เดือนแล้ว',
            body: `${p.item_name} — ดอกเบี้ยสะสม ${baht(p.interest * term.billed)} ต้องต่อดอกหรือไถ่ถอนก่อน ${thaiDate(finalDueStr)}`,
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
            body: `${p.item_name} — ดอก ${baht(p.interest || 0)} ครบกำหนด ${thaiDate(p.due_date)} (ยังไม่ได้ต่อดอก)`,
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
          body: `${p.item_name} — ${baht(p.amount)} ครบกำหนด ${thaiDate(p.due_date)}`,
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
        body: `${e.name} — ${amountPart}ครบกำหนด ${thaiDate(dueDate)}`,
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

  // Google Calendar subscription feed. Every date the app tracks becomes an all-day event;
  // the UID is derived from the record and its date, so when a pawn is renewed or an
  // installment is paid the old event disappears on the next refresh instead of piling up.
  const EXPENSE_MONTHS_AHEAD = 3;
  function buildCalendarEvents({ debts = [], pawns = [], expenses = [], todayStr }) {
    const today = todayStr || dateStr(new Date());
    const events = [];

    debts.forEach((d) => (d.installments || []).forEach((i) => {
      if (i.paid || !i.due_date) return;
      events.push({
        uid: `installment-${i.id}`, date: i.due_date,
        summary: `💳 ผ่อน ${d.name} ${baht(i.amount)}`,
        description: `งวดผ่อนหนี้ "${d.name}" ยอด ${baht(i.amount)} · คงเหลือ ${baht(d.remaining_amount)}`,
      });
    }));

    pawns.forEach((p) => {
      const shop = p.shop_name ? ` · ร้าน ${p.shop_name}` : '';
      const ticket = p.ticket_code ? ` · เลขที่ตั๋ว ${p.ticket_code}` : '';
      if (p.category === 'jewelry') {
        const pawnDate = p.pawn_date || (p.created_at || '').slice(0, 10);
        if (!pawnDate) return;
        const renewBy = addMonths(pawnDate, JEWELRY_BILLED_MONTHS);
        const finalDue = addMonths(pawnDate, JEWELRY_BILLED_MONTHS + 1);
        events.push({
          uid: `pawn-${p.id}-renew-${renewBy}`, date: renewBy,
          summary: `💍 ครบ 4 เดือน ต่อดอก/ไถ่ถอน ${p.item_name}`,
          description: `ตั๋วทอง เงินต้น ${baht(p.amount)} · ดอกสะสม ${baht((p.interest || 0) * JEWELRY_BILLED_MONTHS)} · ต้องจัดการก่อน ${finalDue}${shop}${ticket}`,
        });
        events.push({
          uid: `pawn-${p.id}-final-${finalDue}`, date: finalDue,
          summary: `⚠️ วันสุดท้ายไถ่ถอน ${p.item_name}`,
          description: `ครบกำหนดสุดท้าย (เดือนที่ 5) — ถ้าไม่ไถ่ถอน/ต่อดอกจะขาดจำนำ · เงินต้น ${baht(p.amount)}${shop}${ticket}`,
        });
        return;
      }
      if (!p.due_date) return;
      events.push({
        uid: `pawn-${p.id}-due-${p.due_date}`, date: p.due_date,
        summary: `🎫 ต่อดอก ${p.item_name} ${baht(p.interest || 0)}`,
        description: `ตั๋วจำนำครบกำหนด · เงินต้น ${baht(p.amount)} · ดอก ${baht(p.interest || 0)}${shop}${ticket}`,
      });
    });

    // Expenses repeat forever, so the feed carries a rolling window: this month (unless
    // already paid) plus the next few, rather than an open-ended recurrence rule that would
    // outlive a deleted expense in a calendar that refreshes lazily.
    const [y, m] = today.slice(0, 7).split('-').map(Number);
    expenses.forEach((e) => {
      const day = String(e.due_day || 1).padStart(2, '0');
      for (let k = 0; k < EXPENSE_MONTHS_AHEAD; k++) {
        const d = new Date(y, m - 1 + k, 1);
        const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (e.payments && e.payments[month]) continue;
        const amount = e.expense_type === 'fixed' ? ' ' + baht(e.amount || 0) : '';
        events.push({
          uid: `expense-${e.id}-${month}`, date: `${month}-${day}`,
          summary: `🧾 ${e.name}${amount}`,
          description: e.expense_type === 'fixed' ? `ค่าใช้จ่ายประจำ ยอดคงที่ ${baht(e.amount || 0)}` : 'ค่าใช้จ่ายประจำ (ยอดไม่คงที่)',
        });
      }
    });

    return events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  // ---- Per-day payment calendar -------------------------------------------------
  // The same due dates the feed and the notifications use, but answering a different
  // question: "how much money has to leave my pocket on this day?". Built one calendar
  // month at a time because that is exactly what the dashboard grid shows, and kept as
  // individual entries (not pre-summed per day) so tapping a day can list what makes it up.
  function daysInMonth(month) {
    const [y, m] = String(month).split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }
  function latestPaymentAmount(e) {
    const months = Object.keys(e.payments || {}).sort();
    if (!months.length) return 0;
    return (e.payments[months[months.length - 1]] || {}).amount || 0;
  }
  function buildPaymentCalendar({ debts = [], pawns = [], expenses = [], month, todayStr }) {
    const today = todayStr || dateStr(new Date());
    const m = month || today.slice(0, 7);
    const inMonth = (iso) => typeof iso === 'string' && iso.slice(0, 7) === m;
    const items = [];

    debts.forEach((d) => (d.installments || []).forEach((i) => {
      if (i.paid || !inMonth(i.due_date)) return;
      items.push({
        date: i.due_date, amount: i.amount || 0, kind: 'installment',
        title: d.name, note: 'งวดผ่อน', ref_id: i.id, debt_id: d.id,
      });
    }));

    pawns.forEach((p) => {
      const pawnDate = p.pawn_date || (p.created_at || '').slice(0, 10);
      // Jewelry has no moving due_date: interest is settled when the 4 billed months are up,
      // and the principal is what it costs to get the item back on the 5th-month deadline.
      if (p.category === 'jewelry') {
        if (!pawnDate) return;
        const renewBy = addMonths(pawnDate, JEWELRY_BILLED_MONTHS);
        const finalDue = addMonths(pawnDate, JEWELRY_BILLED_MONTHS + 1);
        if (inMonth(renewBy)) items.push({
          date: renewBy, amount: (p.interest || 0) * JEWELRY_BILLED_MONTHS, kind: 'pawn',
          category: 'jewelry', title: p.item_name, note: 'ต่อดอกตั๋วทอง (ครบ 4 เดือน)', ref_id: p.id,
        });
        if (inMonth(finalDue)) items.push({
          date: finalDue, amount: p.amount || 0, kind: 'pawn', category: 'jewelry',
          title: p.item_name, note: 'วันสุดท้ายไถ่ถอน (เงินต้น)', ref_id: p.id, final: true,
        });
        return;
      }
      if (!inMonth(p.due_date)) return;
      items.push({
        date: p.due_date, amount: p.interest || 0, kind: 'pawn', category: p.category || 'other',
        title: p.item_name, note: 'ต่อดอกตั๋วจำนำ', ref_id: p.id,
      });
    });

    // Recurring expenses have no stored due_date — they land on due_day of whichever month is
    // being viewed (clamped, so day 31 still shows in February), and drop out once that month
    // is marked paid. A variable expense has no amount yet, so last month's stands in as an
    // estimate rather than showing the day as free.
    expenses.forEach((e) => {
      if (e.payments && e.payments[m]) return;
      const day = Math.min(Math.max(1, e.due_day || 1), daysInMonth(m));
      const fixed = e.expense_type !== 'variable';
      items.push({
        date: `${m}-${String(day).padStart(2, '0')}`,
        amount: fixed ? (e.amount || 0) : latestPaymentAmount(e),
        kind: 'expense', title: e.name,
        note: fixed ? 'ค่าใช้จ่ายประจำ' : 'ค่าใช้จ่ายประจำ (ยอดโดยประมาณ)',
        estimated: !fixed, ref_id: e.id,
      });
    });

    items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return { month: m, items, total: items.reduce((a, it) => a + (it.amount || 0), 0) };
  }

  // RFC 5545: escape text, CRLF line endings, and fold lines at 75 octets — Thai characters
  // are 3 bytes in UTF-8, so folding has to count bytes, not string length.
  function icsEscape(s) {
    return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }
  function icsFold(line) {
    const enc = new TextEncoder();
    const parts = [];
    let cur = '', bytes = 0;
    for (const ch of line) {
      const b = enc.encode(ch).length;
      // Continuation lines start with a space, which counts toward their 75 octets.
      if (bytes + b > (parts.length ? 74 : 75)) { parts.push(cur); cur = ''; bytes = 0; }
      cur += ch; bytes += b;
    }
    parts.push(cur);
    return parts.join('\r\n ');
  }
  function buildICS(events, { calName = 'หนี้สิน & ตั๋วจำนำ', stamp } = {}) {
    const dtstamp = (stamp || new Date().toISOString()).replace(/[-:]/g, '').replace(/\.\d+/, '');
    const compact = (iso) => iso.replace(/-/g, '');
    const nextDay = (iso) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + 1); return dateStr(d); };
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//debt-pawn-tracker//TH', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:' + icsEscape(calName), 'X-WR-TIMEZONE:Asia/Bangkok',
      'REFRESH-INTERVAL;VALUE=DURATION:PT3H', 'X-PUBLISHED-TTL:PT3H',
    ];
    events.forEach((ev) => {
      lines.push(
        'BEGIN:VEVENT',
        `UID:${ev.uid}@debt-pawn-tracker`,
        'DTSTAMP:' + dtstamp,
        'DTSTART;VALUE=DATE:' + compact(ev.date),
        'DTEND;VALUE=DATE:' + compact(nextDay(ev.date)),
        'SUMMARY:' + icsEscape(ev.summary),
        'DESCRIPTION:' + icsEscape(ev.description),
        'TRANSP:TRANSPARENT',
        // 09:00 the day before — an all-day event starts at midnight, so that is -15h.
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(ev.summary), 'TRIGGER:-PT15H', 'END:VALARM',
        'END:VEVENT'
      );
    });
    lines.push('END:VCALENDAR');
    return lines.map(icsFold).join('\r\n') + '\r\n';
  }

  return {
    dateStr, addMonths, monthsBetween, daysBetween,
    JEWELRY_BILLED_MONTHS, jewelryTerm,
    buildNotifications, buildPushPayload, buildTelegramMessage,
    buildCalendarEvents, buildICS, buildPaymentCalendar,
  };
});
