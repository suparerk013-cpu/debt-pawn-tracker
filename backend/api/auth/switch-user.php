<?php
// POST /api/auth/switch-user.php  body: { user_id }
// Admin-only: re-issues a token acting as a different user (or back to the admin's own
// account by passing their own id). Every other endpoint just sees the new `uid` — no
// other code needs to know about admin/switching at all.
require_once __DIR__ . '/../../lib/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_error('Method not allowed', 405);

$ctx = require_auth_ctx();
if (!$ctx['real_is_admin']) json_error('ไม่มีสิทธิ์สลับผู้ใช้', 403);

$body = read_json_body();
$targetId = (int)($body['user_id'] ?? 0);
if (!$targetId) json_error('Missing user_id');

$stmt = db()->prepare('SELECT * FROM users WHERE id = ?');
$stmt->execute([$targetId]);
$target = $stmt->fetch();
if (!$target) json_error('Not found', 404);

$token = Jwt::encode([
  'uid' => (int)$target['id'],
  'is_admin' => (bool)$target['is_admin'],
  'real_uid' => $ctx['real_uid'],
  'real_is_admin' => true,
], JWT_SECRET, JWT_TTL_SECONDS);

json_response(['token' => $token, 'user' => ['id' => (int)$target['id'], 'username' => $target['username'], 'is_admin' => (bool)$target['is_admin']]]);
