#!/usr/bin/env node
// Scheduled push sender — the piece that makes reminders arrive with the app closed.
//
// Runs from .github/workflows/notify.yml twice a day. Reads each app-user's data straight
// from Firestore with the Admin SDK, evaluates the SAME rules the app uses (app/www/js/rules.js
// is shared, not copied, so the two can't drift), and sends one summarised FCM message per
// registered device.
//
// Auth: expects the service-account JSON in FIREBASE_SERVICE_ACCOUNT (a GitHub secret).
// Run locally with --dry-run to see what it would send without sending anything.

const https = require('https');
const Rules = require('../app/www/js/rules.js');
const { admin, APP_USERS, initAdmin, bangkokToday, loadUserData } = require('./firestore-data.js');

const DRY_RUN = process.argv.includes('--dry-run');

// Telegram delivery. Web push on Android turned out to be at the mercy of the phone's
// power management — messages arrived only once the device happened to wake — so the same
// reminders also go out over Telegram, which is not subject to that. Chat ids live in
// Firestore (telegram_chats/<userId>) so adding a person needs no secret changes.
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

function sendTelegram(chatId, text) {
  return new Promise((resolve) => {
    const body = Buffer.from(JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }), 'utf8');
    const req = https.request({
      hostname: 'api.telegram.org',
      path: '/bot' + TELEGRAM_TOKEN + '/sendMessage',
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length },
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { raw += d; });
      res.on('end', () => {
        let parsed = {};
        try { parsed = JSON.parse(raw); } catch (e) { parsed = { description: 'unparseable response' }; }
        resolve({ ok: !!parsed.ok, error: parsed.ok ? null : (parsed.description || 'unknown') });
      });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.end(body);
  });
}
async function main() {
  const db = initAdmin();
  const todayStr = bangkokToday();
  console.log(`[notify] Bangkok date ${todayStr}${DRY_RUN ? ' (dry run)' : ''}`);

  // One query for every device, grouped in memory — cheaper than a query per user.
  const tokenSnap = await db.collection('push_tokens').get();
  const tokensByUser = {};
  tokenSnap.docs.forEach((d) => {
    const t = d.data();
    if (!t.user_id || !t.token) return;
    (tokensByUser[t.user_id] = tokensByUser[t.user_id] || []).push(t.token);
  });

  const chatSnap = await db.collection('telegram_chats').get();
  const chatByUser = {};
  chatSnap.docs.forEach((d) => { if (d.data().chat_id) chatByUser[d.id] = d.data().chat_id; });

  let sent = 0, skipped = 0, pruned = 0, tgSent = 0;
  // A run that sends nothing and a run that sends into a void look identical from the app,
  // and the workflow log is awkward to reach from a phone. Record the outcome where the
  // app itself can read it back.
  const report = { at: new Date().toISOString(), todayStr, dryRun: DRY_RUN, users: {} };

  for (const userId of APP_USERS) {
    const data = await loadUserData(db, userId);
    const items = Rules.buildNotifications({ debts: data.debts, pawns: data.pawns, expenses: data.expenses, warnDays: data.warnDays, todayStr });
    const payload = Rules.buildPushPayload(items);
    const tokens = tokensByUser[userId] || [];

    if (!payload) {
      console.log(`[notify] ${userId}: nothing due — not sending`);
      report.users[userId] = { items: 0, devices: tokens.length, outcome: "nothing-due" };
      continue;
    }
    console.log(`[notify] ${userId}: ${items.length} item(s) -> "${payload.title}" | ${payload.body}`);

    // Independent of push: a user with a chat id gets told even when no device is registered.
    const chatId = chatByUser[userId];
    let tg = null;
    if (TELEGRAM_TOKEN && chatId && !DRY_RUN) {
      tg = await sendTelegram(chatId, Rules.buildTelegramMessage(items));
      if (tg.ok) tgSent++;
      console.log(`[notify] ${userId}: telegram ${tg.ok ? 'sent' : 'FAILED — ' + tg.error}`);
    } else if (!TELEGRAM_TOKEN) {
      console.log(`[notify] ${userId}: telegram skipped (no TELEGRAM_BOT_TOKEN)`);
    } else if (!chatId) {
      console.log(`[notify] ${userId}: telegram skipped (no chat id registered)`);
    }
    if (!tokens.length) {
      console.log(`[notify] ${userId}: no registered device, skipping`);
      report.users[userId] = { items: items.length, devices: 0, outcome: "no-device", telegram: tg };
      skipped++;
      continue;
    }
    if (DRY_RUN) { report.users[userId] = { items: items.length, devices: tokens.length, outcome: "dry-run", telegram: tg }; skipped += tokens.length; continue; }

    // Data-only: sw.js builds the notification itself so the tag/click behaviour applies.
    const res = await admin.messaging().sendEachForMulticast({
      tokens,
      data: { title: payload.title, body: payload.body, tag: 'dpt-due', url: './' },
      webpush: { headers: { Urgency: 'high', TTL: '43200' } },
    });
    sent += res.successCount;
    report.users[userId] = {
      items: items.length, devices: tokens.length, outcome: "sent",
      successCount: res.successCount, failureCount: res.failureCount,
      errors: res.responses.filter((r) => !r.success).map((r) => (r.error && r.error.code) || "unknown"),
      title: payload.title, telegram: tg,
    };

    // Drop tokens the device has thrown away, or the list grows stale forever.
    await Promise.all(res.responses.map(async (r, i) => {
      if (r.success) return;
      const code = r.error && r.error.code;
      console.log(`[notify] ${userId}: token ${i} failed (${code})`);
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-argument') {
        await db.collection('push_tokens').doc(tokens[i]).delete().catch(() => {});
        pruned++;
      }
    }));
  }

  report.totals = { sent, skipped, pruned, telegramSent: tgSent };
  console.log(`[notify] done — push sent ${sent}, telegram sent ${tgSent}, skipped ${skipped}, pruned ${pruned}`);
  await db.collection("diagnostics").doc("last_notify_run").set(report).catch((e) => {
    console.log("[notify] could not write diagnostics: " + e.message);
  });
}

main().catch((e) => {
  console.error('[notify] FAILED:', e.message);
  process.exit(1);
});
