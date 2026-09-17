// Firestore access shared by the scheduled scripts (push/Telegram sender, calendar builder):
// both need the same service-account login, Bangkok "today", and per-user data load.
const admin = require('firebase-admin');

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

// Thailand is UTC+7 and the workflows run in UTC, so "today" has to be computed in Bangkok
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
  const user = userDoc.exists ? userDoc.data() : {};
  return {
    debts: debtSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    pawns: pawnSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    expenses: expenseSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    warnDays: user.warn_days || 3,
    user,
  };
}

module.exports = { admin, APP_USERS, initAdmin, bangkokToday, loadUserData };
