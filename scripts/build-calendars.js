#!/usr/bin/env node
// Builds each user's Google Calendar subscription feed (.ics) for Firebase Hosting.
//
// Runs from .github/workflows/calendar.yml. Writes app/www/cal/<token>.ics per user, where
// <token> is a random secret kept on users/<id>.calendar_token — the file name IS the
// access control, so it is never logged (this repo and its Actions logs are public).
//
// Hosting has no server-side code on the free plan, so the feed only changes when the site
// is redeployed. To avoid a deploy every run, the freshly built feed is compared with what
// the live site serves right now; the workflow deploys only when they differ (which also
// restores the feed after a manual deploy from a machine that doesn't have the cal/ files).

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const Rules = require('../app/www/js/rules.js');
const { APP_USERS, initAdmin, bangkokToday, loadUserData } = require('./firestore-data.js');

const SITE = process.env.HOSTING_URL || 'https://debt-pawn-tracker-cc106.web.app';
const OUT_DIR = path.join(__dirname, '..', 'app', 'www', 'cal');

function fetchText(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'Cache-Control': 'no-cache' } }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { raw += d; });
      res.on('end', () => resolve(res.statusCode === 200 ? raw : null));
    }).on('error', () => resolve(null));
  });
}

// DTSTAMP is "when this file was generated", so it differs on every run by design.
const comparable = (ics) => (ics || '').split('\r\n').filter((l) => !l.startsWith('DTSTAMP:')).join('\r\n');

async function main() {
  const db = initAdmin();
  const todayStr = bangkokToday();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let changed = false;
  const report = { at: new Date().toISOString(), todayStr, users: {} };

  for (const userId of APP_USERS) {
    const data = await loadUserData(db, userId);
    let token = data.user.calendar_token;
    if (!token) {
      token = crypto.randomBytes(18).toString('hex');
      await db.collection('users').doc(userId).set({ calendar_token: token }, { merge: true });
      console.log(`[calendar] ${userId}: created a new calendar link`);
    }

    const events = Rules.buildCalendarEvents({ ...data, todayStr });
    const ics = Rules.buildICS(events, { calName: `หนี้สิน & ตั๋วจำนำ (${userId})` });
    fs.writeFileSync(path.join(OUT_DIR, token + '.ics'), ics, 'utf8');

    const live = await fetchText(`${SITE}/cal/${token}.ics`);
    const same = comparable(live) === comparable(ics);
    if (!same) changed = true;
    console.log(`[calendar] ${userId}: ${events.length} event(s) — ${same ? 'unchanged' : 'needs deploy'}`);
    report.users[userId] = { events: events.length, changed: !same };
  }

  report.changed = changed;
  await db.collection('diagnostics').doc('last_calendar_build').set(report).catch((e) => {
    console.log('[calendar] could not write diagnostics: ' + e.message);
  });
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
  console.log(`[calendar] done — ${changed ? 'deploy needed' : 'nothing changed'}`);
}

main().catch((e) => {
  console.error('[calendar] FAILED:', e.message);
  process.exit(1);
});
