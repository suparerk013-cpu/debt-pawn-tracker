<?php
// POST /api/auth/login.php  body: { username }
// Two fixed users, no password — typing a known username logs straight in. Usernames are
// seeded in schema.sql; this endpoint never creates new accounts.
require_once __DIR__ . '/../../lib/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_error('Method not allowed', 405);

$body = read_json_body();
$username = strtolower(trim((string)($body['username'] ?? '')));
if ($username === '') json_error('กรุณาพิมพ์ชื่อผู้ใช้');

$pdo = db();
$stmt = $pdo->prepare('SELECT * FROM users WHERE LOWER(username) = ?');
$stmt->execute([$username]);
$user = $stmt->fetch();
if (!$user) json_error('ไม่พบผู้ใช้นี้', 404);

$isAdmin = (bool)$user['is_admin'];
$token = Jwt::encode([
  'uid' => (int)$user['id'],
  'is_admin' => $isAdmin,
  'real_uid' => (int)$user['id'],
  'real_is_admin' => $isAdmin,
], JWT_SECRET, JWT_TTL_SECONDS);

json_response(['token' => $token, 'user' => ['id' => (int)$user['id'], 'username' => $user['username'], 'is_admin' => $isAdmin]]);
