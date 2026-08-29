<?php
// POST /api/auth/login.php  body: { username, password }
require_once __DIR__ . '/../../lib/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_error('Method not allowed', 405);

$body = read_json_body();
$username = trim((string)($body['username'] ?? ''));
$password = (string)($body['password'] ?? '');
if ($username === '' || $password === '') json_error('กรอกชื่อผู้ใช้และรหัสผ่าน');

$pdo = db();
$stmt = $pdo->prepare('SELECT * FROM users WHERE username = ?');
$stmt->execute([$username]);
$user = $stmt->fetch();

if (!$user || empty($user['password_hash'])) {
  json_error('ไม่พบบัญชีนี้ หรือบัญชีนี้สมัครด้วย Google กรุณาเข้าสู่ระบบด้วย Google', 401);
}

if (!empty($user['locked_until']) && strtotime($user['locked_until']) > time()) {
  $wait = strtotime($user['locked_until']) - time();
  json_error("ลองผิดหลายครั้งเกินไป กรุณารอ {$wait} วินาที", 429);
}

if (!password_verify($password, $user['password_hash'])) {
  $attempts = (int)$user['failed_attempts'] + 1;
  $lockedUntil = null;
  if ($attempts >= LOGIN_MAX_ATTEMPTS) {
    $lockedUntil = date('Y-m-d H:i:s', time() + LOGIN_LOCKOUT_SECONDS);
    $attempts = 0;
  }
  $pdo->prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?')->execute([$attempts, $lockedUntil, $user['id']]);
  json_error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 401);
}

$pdo->prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?')->execute([$user['id']]);

$token = Jwt::encode(['uid' => (int)$user['id']], JWT_SECRET, JWT_TTL_SECONDS);
json_response(['token' => $token, 'needs_pin' => empty($user['pin_hash'])]);
