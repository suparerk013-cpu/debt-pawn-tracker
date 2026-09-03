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

const admin = require('firebase-admin');
const Rules = require('../app/www/js/rules.js');

const DRY_RUN = process.argv.includes('--dry-run');
const APP_USERS = ['not', 'lek'];

function initAdmin() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
  let cred;
  try {
    cred = JSON.parse(raw);
  } catch (e) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON: ' + e.message);
  }
  admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id });
  return admin.firestore();
}

// Thailand is UTC+7 and the workflow runs in UTC, so "today" has to be computed in Bangkok
// time or an 08:00 Thai run would still be reading yesterday's date.
function bangkokToday() {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

async function loadUserData(db, userId) {
  const [debtSnap, pawnSnap, expenseSnap, userDoc] = await Promise.all([
    db.collection('debts').where('user_id', '==', userId).where('status', '==', 'active').get(),
    db.collection('pawns').where('user_id', '==', userId).where('status', '==', 'active').get(),
    db.collection('expenses').where('user_id', '==', userId).get(),
    db.collection('users').doc(userId).get(),
  ]);
  return {
    debts: debtSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    pawns: pawnSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    expenses: expenseSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    warnDays: (userDoc.exists && userDoc.data().warn_days) || 3,
  };
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

  let sent = 0, skipped = 0, pruned = 0;

  for (const userId of APP_USERS) {
    const data = await loadUserData(db, userId);
    const items = Rules.buildNotifications({ ...data, todayStr });
    const payload = Rules.buildPushPayload(items);
    const tokens = tokensByUser[userId] || [];

    if (!payload) {
      console.log(`[notify] ${userId}: nothing due — not sending`);
      continue;
    }
    console.log(`[notify] ${userId}: ${items.length} item(s) -> "${payload.title}" | ${payload.body}`);
    if (!tokens.length) {
      console.log(`[notify] ${userId}: no registered device, skipping`);
      skipped++;
      continue;
    }
    if (DRY_RUN) { skipped += tokens.length; continue; }

    // Data-only: sw.js builds the notification itself so the tag/click behaviour applies.
    const res = await admin.messaging().sendEachForMulticast({
      tokens,
      data: { title: payload.title, body: payload.body, tag: 'dpt-due', url: './' },
      webpush: { headers: { Urgency: 'high', TTL: '43200' } },
    });
    sent += res.successCount;

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

  console.log(`[notify] done — sent ${sent}, skipped ${skipped}, pruned ${pruned}`);
}

main().catch((e) => {
  console.error('[notify] FAILED:', e.message);
  process.exit(1);
});
