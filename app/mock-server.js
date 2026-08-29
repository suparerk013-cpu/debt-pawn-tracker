// Local-only mock of the PHP/MySQL backend, for trying the app in a browser without hosting.
// In-memory storage (resets every restart). NOT for production — see backend/ for the real API.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 5522;
const WWW = path.join(__dirname, 'www');
const SECRET = 'local-dev-secret-not-for-production';

// ---------------- In-memory data ----------------
let nextUserId = 1, nextDebtId = 1, nextInstId = 1, nextPawnId = 1, nextExpenseId = 1;
const users = [];        // {id, username, password_hash, phone, pin_hash, google_id, email, warn_days, auto_lock, failed_attempts, locked_until}
const debts = [];        // {id, user_id, name, total_amount, remaining_amount, payment_type, due_day, installment_amount, created_at}
const installments = []; // {id, debt_id, due_date, amount, paid, paid_at}
const pawns = [];        // {id, user_id, ticket_code, shop_name, item_name, amount, due_date, period_unit, period_value, status, created_at}
const expenses = [];     // {id, user_id, name, amount, due_day, last_paid_month, created_at}

// ---------------- Helpers ----------------
function hashSecret(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, 64).toString('hex');
  return salt + ':' + hash;
}
function verifySecret(plain, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(plain, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
}
function signToken(uid) {
  const payload = Buffer.from(JSON.stringify({ uid, exp: Date.now() + 7 * 86400000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return payload + '.' + sig;
}
function verifyToken(token) {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  if (sig !== expected) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp < Date.now()) return null;
    return data.uid;
  } catch (e) { return null; }
}
function todayISO() { return new Date().toISOString().slice(0, 10); }

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(body);
}
function err(res, message, status = 400) { send(res, status, { error: message }); }

function requireAuth(req, res) {
  const header = req.headers['authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) { err(res, 'Missing or invalid Authorization header', 401); return null; }
  const uid = verifyToken(m[1]);
  if (!uid) { err(res, 'Invalid or expired token', 401); return null; }
  return uid;
}
function findUser(id) { return users.find((u) => u.id === id); }

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { resolve({}); } });
  });
}

// ---------------- Route handlers ----------------
const routes = {};
function on(method, route, handler) { routes[method + ' ' + route] = handler; }

on('POST', '/auth/register.php', async (req, res, q, body) => {
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const phone = String(body.phone || '').replace(/\D+/g, '');
  if (!/^[a-zA-Z0-9_.]{3,32}$/.test(username)) return err(res, 'ชื่อผู้ใช้ต้องเป็นตัวอักษร/ตัวเลข 3-32 ตัวอักษร');
  if (password.length < 6) return err(res, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
  if (phone.length < 9 || phone.length > 10) return err(res, 'กรอกเบอร์โทรศัพท์ให้ถูกต้อง');
  if (users.find((u) => u.username === username)) return err(res, 'มีชื่อผู้ใช้นี้อยู่แล้ว');

  const user = {
    id: nextUserId++, username, password_hash: hashSecret(password), phone,
    pin_hash: null, google_id: null, email: null,
    warn_days: 3, auto_lock: true, failed_attempts: 0, locked_until: null,
  };
  users.push(user);
  send(res, 201, { token: signToken(user.id), needs_pin: true });
});

on('POST', '/auth/login.php', async (req, res, q, body) => {
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (!username || !password) return err(res, 'กรอกชื่อผู้ใช้และรหัสผ่าน');
  const user = users.find((u) => u.username === username);
  if (!user || !user.password_hash) return err(res, 'ไม่พบบัญชีนี้ หรือบัญชีนี้สมัครด้วย Google กรุณาเข้าสู่ระบบด้วย Google', 401);
  if (user.locked_until && user.locked_until > Date.now()) {
    return err(res, `ลองผิดหลายครั้งเกินไป กรุณารอ ${Math.ceil((user.locked_until - Date.now()) / 1000)} วินาที`, 429);
  }
  if (!verifySecret(password, user.password_hash)) {
    user.failed_attempts++;
    if (user.failed_attempts >= 5) { user.locked_until = Date.now() + 30000; user.failed_attempts = 0; }
    return err(res, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 401);
  }
  user.failed_attempts = 0; user.locked_until = null;
  send(res, 200, { token: signToken(user.id), needs_pin: !user.pin_hash });
});

on('POST', '/auth/google-login.php', async (req, res, q, body) => {
  // No real Google verification locally — the client only calls this if the native
  // GoogleAuth plugin exists (Android build), which it never does in a plain browser.
  if (!body.id_token) return err(res, 'Missing id_token');
  let user = users.find((u) => u.google_id === body.id_token);
  if (!user) {
    user = {
      id: nextUserId++, username: 'google_' + nextUserId, password_hash: null, phone: null,
      pin_hash: null, google_id: body.id_token, email: null,
      warn_days: 3, auto_lock: true, failed_attempts: 0, locked_until: null,
    };
    users.push(user);
  }
  send(res, 200, { token: signToken(user.id), needs_pin: !user.pin_hash });
});

on('POST', '/auth/verify-pin.php', async (req, res, q, body) => {
  const uid = requireAuth(req, res); if (!uid) return;
  const user = findUser(uid); if (!user) return err(res, 'ไม่พบบัญชี', 404);
  const pin = String(body.pin || '').trim();
  if (!/^\d{4,6}$/.test(pin)) return err(res, 'PIN ต้องเป็นตัวเลข 4-6 หลัก');
  if (!user.pin_hash) return err(res, 'ยังไม่ได้ตั้ง PIN', 400);
  if (user.locked_until && user.locked_until > Date.now()) {
    return err(res, `ลองผิดหลายครั้งเกินไป กรุณารอ ${Math.ceil((user.locked_until - Date.now()) / 1000)} วินาที`, 429);
  }
  if (!verifySecret(pin, user.pin_hash)) {
    user.failed_attempts++;
    if (user.failed_attempts >= 5) { user.locked_until = Date.now() + 30000; user.failed_attempts = 0; }
    return err(res, 'PIN ไม่ถูกต้อง', 401);
  }
  user.failed_attempts = 0; user.locked_until = null;
  send(res, 200, { ok: true });
});

on('POST', '/auth/set-pin.php', async (req, res, q, body) => {
  const uid = requireAuth(req, res); if (!uid) return;
  const user = findUser(uid); if (!user) return err(res, 'ไม่พบบัญชี', 404);
  const pin = String(body.pin || '').trim();
  if (!/^\d{4,6}$/.test(pin)) return err(res, 'PIN ต้องเป็นตัวเลข 4-6 หลัก');
  user.pin_hash = hashSecret(pin); user.failed_attempts = 0; user.locked_until = null;
  send(res, 200, { ok: true });
});

// `contact` is either the phone or the email on file — Google-signup users only have an email.
function contactMatchesUser(user, contact) {
  contact = String(contact || '').trim();
  if (!contact) return false;
  const digits = contact.replace(/\D+/g, '');
  if (user.phone && digits && digits === user.phone) return true;
  if (user.email && contact.toLowerCase() === user.email.toLowerCase()) return true;
  return false;
}

on('POST', '/auth/forgot-password.php', async (req, res, q, body) => {
  const username = String(body.username || '').trim();
  const contact = String(body.contact || '').trim();
  const newPassword = String(body.new_password || '');
  if (!username || !contact) return err(res, 'กรอกชื่อผู้ใช้และเบอร์โทรศัพท์หรืออีเมล');
  if (newPassword.length < 6) return err(res, 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร');
  const user = users.find((u) => u.username === username);
  if (!user || !contactMatchesUser(user, contact)) return err(res, 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบชื่อผู้ใช้และเบอร์โทรศัพท์/อีเมล', 401);
  user.password_hash = hashSecret(newPassword); user.failed_attempts = 0; user.locked_until = null;
  send(res, 200, { ok: true });
});

on('POST', '/auth/forgot-pin.php', async (req, res, q, body) => {
  const username = String(body.username || '').trim();
  const contact = String(body.contact || '').trim();
  const newPin = String(body.new_pin || '').trim();
  if (!username || !contact) return err(res, 'กรอกชื่อผู้ใช้และเบอร์โทรศัพท์หรืออีเมล');
  if (!/^\d{4,6}$/.test(newPin)) return err(res, 'PIN ต้องเป็นตัวเลข 4-6 หลัก');
  const user = users.find((u) => u.username === username);
  if (!user || !contactMatchesUser(user, contact)) return err(res, 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบชื่อผู้ใช้และเบอร์โทรศัพท์/อีเมล', 401);
  user.pin_hash = hashSecret(newPin); user.failed_attempts = 0; user.locked_until = null;
  send(res, 200, { ok: true, token: signToken(user.id) });
});

on('GET', '/auth/me.php', async (req, res) => {
  const uid = requireAuth(req, res); if (!uid) return;
  const user = findUser(uid); if (!user) return err(res, 'Not found', 404);
  send(res, 200, { username: user.username, phone: user.phone, needs_pin: !user.pin_hash });
});

on('POST', '/auth/register-token.php', async (req, res) => {
  const uid = requireAuth(req, res); if (!uid) return;
  send(res, 200, { ok: true });
});

on('GET', '/debts/index.php', async (req, res) => {
  const uid = requireAuth(req, res); if (!uid) return;
  const list = debts.filter((d) => d.user_id === uid).map((d) => ({
    ...d, installments: installments.filter((i) => i.debt_id === d.id).sort((a, b) => a.due_date < b.due_date ? -1 : 1),
  }));
  send(res, 200, list);
});

on('POST', '/debts/index.php', async (req, res, q, body) => {
  const uid = requireAuth(req, res); if (!uid) return;
  const name = String(body.name || '').trim();
  const total = Number(body.total_amount) || 0;
  const remaining = body.remaining_amount !== undefined ? Number(body.remaining_amount) : total;
  const dueDay = Math.max(1, Math.min(28, Number(body.due_day) || 5));
  let instAmount = Number(body.installment_amount) || 0;
  if (instAmount <= 0 && total > 0) instAmount = Math.round((total / 6) * 100) / 100;
  if (!name || total <= 0) return err(res, 'กรอกชื่อและยอดหนี้ให้ครบ');

  const debt = {
    id: nextDebtId++, user_id: uid, name, total_amount: total, remaining_amount: remaining,
    payment_type: 'installment', due_day: dueDay, installment_amount: instAmount,
    created_at: new Date().toISOString(),
  };
  debts.push(debt);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const base = new Date(today.getFullYear(), today.getMonth(), dueDay);
  if (base < today) base.setMonth(base.getMonth() + 1);
  for (let i = 0; i < 3; i++) {
    const d = new Date(base); d.setMonth(d.getMonth() + i);
    installments.push({ id: nextInstId++, debt_id: debt.id, due_date: d.toISOString().slice(0, 10), amount: instAmount, paid: false, paid_at: null });
  }
  send(res, 201, { id: debt.id });
});

on('GET', '/debts/detail.php', async (req, res, q) => {
  const uid = requireAuth(req, res); if (!uid) return;
  const id = Number(q.id || 0);
  const debt = debts.find((d) => d.id === id && d.user_id === uid);
  if (!debt) return err(res, 'Not found', 404);
  send(res, 200, { ...debt, installments: installments.filter((i) => i.debt_id === id).sort((a, b) => a.due_date < b.due_date ? -1 : 1) });
});

on('PATCH', '/installments/mark.php', async (req, res, q, body) => {
  const uid = requireAuth(req, res); if (!uid) return;
  const id = Number(body.id || 0);
  const inst = installments.find((i) => i.id === id);
  const debt = inst && debts.find((d) => d.id === inst.debt_id && d.user_id === uid);
  if (!inst || !debt) return err(res, 'Not found', 404);
  if (inst.paid) return send(res, 200, { ok: true });
  inst.paid = true; inst.paid_at = new Date().toISOString();
  debt.remaining_amount = Math.max(0, debt.remaining_amount - inst.amount);
  send(res, 200, { ok: true, remaining_amount: debt.remaining_amount });
});

on('GET', '/pawns/index.php', async (req, res) => {
  const uid = requireAuth(req, res); if (!uid) return;
  const list = pawns.filter((p) => p.user_id === uid && p.status === 'active').sort((a, b) => a.due_date < b.due_date ? -1 : 1);
  send(res, 200, list);
});

on('POST', '/pawns/index.php', async (req, res, q, body) => {
  const uid = requireAuth(req, res); if (!uid) return;
  const item = String(body.item_name || '').trim();
  const shop = String(body.shop_name || '').trim();
  const ticketCode = String(body.ticket_code || '').trim();
  const amount = Number(body.amount) || 0;
  const dueDate = String(body.due_date || '').trim();
  const periodUnit = ['day', 'month'].includes(body.period_unit) ? body.period_unit : null;
  const periodValue = periodUnit ? Math.max(1, Math.min(120, Number(body.period_value) || 0)) : null;
  if (!item || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return err(res, 'กรอกข้อมูลตั๋วจำนำให้ครบ');
  const pawn = {
    id: nextPawnId++, user_id: uid, ticket_code: ticketCode || null, shop_name: shop || null,
    item_name: item, amount, due_date: dueDate, period_unit: periodUnit, period_value: periodValue,
    status: 'active', created_at: new Date().toISOString(),
  };
  pawns.push(pawn);
  send(res, 201, { id: pawn.id });
});

on('PATCH', '/pawns/redeem.php', async (req, res, q, body) => {
  const uid = requireAuth(req, res); if (!uid) return;
  const pawn = pawns.find((p) => p.id === Number(body.id) && p.user_id === uid);
  if (!pawn) return err(res, 'Not found', 404);
  pawn.status = 'redeemed';
  send(res, 200, { ok: true });
});

on('PATCH', '/pawns/renew.php', async (req, res, q, body) => {
  const uid = requireAuth(req, res); if (!uid) return;
  const pawn = pawns.find((p) => p.id === Number(body.id) && p.user_id === uid);
  if (!pawn) return err(res, 'Not found', 404);
  const d = new Date(pawn.due_date + 'T00:00:00');
  if (body.months) {
    const months = Math.max(1, Math.min(12, Number(body.months)));
    d.setMonth(d.getMonth() + months);
    pawn.period_unit = 'month'; pawn.period_value = months;
  } else {
    const days = Math.max(1, Math.min(365, Number(body.days) || 30));
    d.setDate(d.getDate() + days);
    pawn.period_unit = 'day'; pawn.period_value = days;
  }
  pawn.due_date = d.toISOString().slice(0, 10);
  pawn.status = 'active';
  send(res, 200, { ok: true, due_date: pawn.due_date });
});

on('GET', '/expenses/index.php', async (req, res) => {
  const uid = requireAuth(req, res); if (!uid) return;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const list = expenses.filter((e) => e.user_id === uid).sort((a, b) => a.due_day - b.due_day)
    .map((e) => ({ ...e, paid_this_month: e.last_paid_month === currentMonth }));
  send(res, 200, list);
});

on('POST', '/expenses/index.php', async (req, res, q, body) => {
  const uid = requireAuth(req, res); if (!uid) return;
  const name = String(body.name || '').trim();
  const amount = Number(body.amount) || 0;
  const dueDay = Math.max(1, Math.min(28, Number(body.due_day) || 5));
  if (!name || amount <= 0) return err(res, 'กรอกชื่อและยอดค่าใช้จ่ายให้ครบ');
  const expense = { id: nextExpenseId++, user_id: uid, name, amount, due_day: dueDay, last_paid_month: null, created_at: new Date().toISOString() };
  expenses.push(expense);
  send(res, 201, { id: expense.id });
});

on('PATCH', '/expenses/mark-paid.php', async (req, res, q, body) => {
  const uid = requireAuth(req, res); if (!uid) return;
  const expense = expenses.find((e) => e.id === Number(body.id) && e.user_id === uid);
  if (!expense) return err(res, 'Not found', 404);
  expense.last_paid_month = new Date().toISOString().slice(0, 7);
  send(res, 200, { ok: true });
});

on('DELETE', '/expenses/delete.php', async (req, res, q, body) => {
  const uid = requireAuth(req, res); if (!uid) return;
  const idx = expenses.findIndex((e) => e.id === Number(body.id) && e.user_id === uid);
  if (idx === -1) return err(res, 'Not found', 404);
  expenses.splice(idx, 1);
  send(res, 200, { ok: true });
});

on('GET', '/dashboard/report.php', async (req, res) => {
  const uid = requireAuth(req, res); if (!uid) return;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const currentMonth = now.toISOString().slice(0, 7);

  const totalDebt = debts.filter((d) => d.user_id === uid).reduce((a, d) => a + d.remaining_amount, 0);
  const activePawns = pawns.filter((p) => p.user_id === uid && p.status === 'active');
  const totalPawn = activePawns.reduce((a, p) => a + p.amount, 0);
  const userExpenses = expenses.filter((e) => e.user_id === uid);
  const totalRecurring = userExpenses.reduce((a, e) => a + e.amount, 0);

  const dueInstallments = installments.filter((i) => {
    if (i.paid || i.due_date < monthStart || i.due_date > monthEnd) return false;
    const debt = debts.find((d) => d.id === i.debt_id && d.user_id === uid);
    return !!debt;
  }).map((i) => {
    const debt = debts.find((d) => d.id === i.debt_id);
    return { type: 'installment', ref_id: i.id, debt_id: debt.id, title: debt.name, amount: i.amount, due_date: i.due_date };
  });

  const duePawns = activePawns
    .filter((p) => p.due_date >= monthStart && p.due_date <= monthEnd)
    .map((p) => ({ type: 'pawn', ref_id: p.id, title: p.item_name, amount: p.amount, due_date: p.due_date }));

  const dueExpenses = userExpenses
    .filter((e) => e.last_paid_month !== currentMonth)
    .map((e) => ({
      type: 'expense', ref_id: e.id, title: e.name, amount: e.amount,
      due_date: currentMonth + '-' + String(e.due_day).padStart(2, '0'),
    }));

  const breakdown = [...dueInstallments, ...duePawns, ...dueExpenses].sort((a, b) => a.due_date < b.due_date ? -1 : 1);
  const totalDueThisMonth = breakdown.reduce((a, r) => a + r.amount, 0);

  send(res, 200, { total_debt: totalDebt, total_pawn: totalPawn, total_recurring: totalRecurring, total_due_this_month: totalDueThisMonth, breakdown });
});

on('GET', '/settings/update.php', async (req, res) => {
  const uid = requireAuth(req, res); if (!uid) return;
  const user = findUser(uid);
  send(res, 200, { warn_days: user.warn_days, auto_lock: user.auto_lock });
});

on('PATCH', '/settings/update.php', async (req, res, q, body) => {
  const uid = requireAuth(req, res); if (!uid) return;
  const user = findUser(uid);
  if (body.warn_days !== undefined) user.warn_days = Math.max(1, Math.min(30, Number(body.warn_days)));
  if (body.auto_lock !== undefined) user.auto_lock = !!body.auto_lock;
  send(res, 200, { ok: true });
});

// ---------------- Static file serving ----------------
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function serveStatic(req, res, pathname) {
  let filePath = path.join(WWW, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(WWW)) { res.writeHead(403); return res.end(); }
  fs.readFile(filePath, (e, data) => {
    if (e) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const pathname = u.pathname;
  const query = Object.fromEntries(u.searchParams);

  if (req.method === 'OPTIONS') { send(res, 204, {}); return; }

  if (pathname.startsWith('/api/')) {
    const route = pathname.slice(4); // strip '/api'
    const handler = routes[req.method + ' ' + route];
    if (!handler) return err(res, 'Not found', 404);
    const body = ['POST', 'PATCH', 'DELETE'].includes(req.method) ? await readBody(req) : {};
    try { await handler(req, res, query, body); }
    catch (e) { err(res, 'Server error: ' + e.message, 500); }
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`Mock server (static + API) running at http://localhost:${PORT}`);
});
