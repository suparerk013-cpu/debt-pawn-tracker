// Thin fetch wrapper around the PHP backend REST API.
const Api = (() => {
  // Change this to your deployed backend URL, e.g. 'https://yoursite.infinityfreeapp.com/api'
  // On localhost this auto-points at mock-server.js instead, so `npm run dev` works with no setup.
  const BASE_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? '/api'
    : 'https://yourdomain.example.com/api';

  let token = localStorage.getItem('dpt_token') || null;

  function setToken(t) {
    token = t;
    if (t) localStorage.setItem('dpt_token', t);
    else localStorage.removeItem('dpt_token');
  }

  async function request(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && token) headers['Authorization'] = 'Bearer ' + token;

    const res = await fetch(BASE_URL + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    let data = null;
    try { data = await res.json(); } catch (_) { /* empty body */ }

    if (!res.ok) {
      const err = new Error((data && data.error) || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  return {
    setToken,
    getToken: () => token,
    me: () => request('/auth/me.php'),
    register: (username, password, phone) => request('/auth/register.php', { method: 'POST', body: { username, password, phone }, auth: false }),
    loginPassword: (username, password) => request('/auth/login.php', { method: 'POST', body: { username, password }, auth: false }),
    googleLogin: (id_token) => request('/auth/google-login.php', { method: 'POST', body: { id_token }, auth: false }),
    verifyPin: (pin) => request('/auth/verify-pin.php', { method: 'POST', body: { pin } }),
    setPin: (pin) => request('/auth/set-pin.php', { method: 'POST', body: { pin } }),
    forgotPassword: (username, contact, new_password) => request('/auth/forgot-password.php', { method: 'POST', body: { username, contact, new_password }, auth: false }),
    forgotPin: (username, contact, new_pin) => request('/auth/forgot-pin.php', { method: 'POST', body: { username, contact, new_pin }, auth: false }),
    registerFcmToken: (fcm_token) => request('/auth/register-token.php', { method: 'POST', body: { fcm_token } }),

    getDebts: () => request('/debts/index.php'),
    getDebtDetail: (id) => request(`/debts/detail.php?id=${id}`),
    createDebt: (payload) => request('/debts/index.php', { method: 'POST', body: payload }),
    markInstallmentPaid: (id) => request('/installments/mark.php', { method: 'PATCH', body: { id } }),

    getPawns: () => request('/pawns/index.php'),
    createPawn: (payload) => request('/pawns/index.php', { method: 'POST', body: payload }),
    redeemPawn: (id) => request('/pawns/redeem.php', { method: 'PATCH', body: { id } }),
    renewPawn: (id, period) => request('/pawns/renew.php', { method: 'PATCH', body: { id, ...period } }),

    getReport: () => request('/dashboard/report.php'),

    getExpenses: () => request('/expenses/index.php'),
    createExpense: (payload) => request('/expenses/index.php', { method: 'POST', body: payload }),
    markExpensePaid: (id) => request('/expenses/mark-paid.php', { method: 'PATCH', body: { id } }),
    deleteExpense: (id) => request('/expenses/delete.php', { method: 'DELETE', body: { id } }),

    getSettings: () => request('/settings/update.php'),
    updateSettings: (payload) => request('/settings/update.php', { method: 'PATCH', body: payload }),
  };
})();
