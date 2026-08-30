<?php
// GET /api/auth/users.php — admin-only: list of switchable users, for the "switch user" UI.
require_once __DIR__ . '/../../lib/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') json_error('Method not allowed', 405);

$ctx = require_auth_ctx();
if (!$ctx['real_is_admin']) json_error('ไม่มีสิทธิ์ดูรายชื่อผู้ใช้', 403);

$rows = db()->query('SELECT id, username, is_admin FROM users ORDER BY is_admin DESC, id ASC')->fetchAll();
foreach ($rows as &$r) { $r['id'] = (int)$r['id']; $r['is_admin'] = (bool)$r['is_admin']; }

json_response($rows);
