<?php
// POST /api/auth/login.php  body: { pin }
// Single-user app: the first PIN ever submitted becomes the account's PIN. Every
// subsequent call must match it. No username/password/registration — just a PIN.
require_once __DIR__ . '/../../lib/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_error('Method not allowed', 405);

$body = read_json_body();
$pin = trim((string)($body['pin'] ?? ''));
if (!preg_match('/^\d{4,6}$/', $pin)) json_error('PIN ต้องเป็นตัวเลข 4-6 หลัก');

$pdo = db();
$user = $pdo->query('SELECT * FROM users ORDER BY id ASC LIMIT 1')->fetch();

if (!$user) {
  $hash = password_hash($pin, PASSWORD_BCRYPT);
  $stmt = $pdo->prepare('INSERT INTO users (username, pin_hash) VALUES (?, ?)');
  $stmt->execute(['owner', $hash]);
  $userId = (int)$pdo->lastInsertId();
  $token = Jwt::encode(['uid' => $userId], JWT_SECRET, JWT_TTL_SECONDS);
  json_response(['token' => $token, 'created' => true]);
}

if (!empty($user['locked_until']) && strtotime($user['locked_until']) > time()) {
  $wait = strtotime($user['locked_until']) - time();
  json_error("ลองผิดหลายครั้งเกินไป กรุณารอ {$wait} วินาที", 429);
}

if (!password_verify($pin, $user['pin_hash'])) {
  $attempts = (int)$user['failed_attempts'] + 1;
  $lockedUntil = null;
  if ($attempts >= LOGIN_MAX_ATTEMPTS) {
    $lockedUntil = date('Y-m-d H:i:s', time() + LOGIN_LOCKOUT_SECONDS);
    $attempts = 0;
  }
  $pdo->prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?')->execute([$attempts, $lockedUntil, $user['id']]);
  json_error('PIN ไม่ถูกต้อง', 401);
}

$pdo->prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?')->execute([$user['id']]);

$token = Jwt::encode(['uid' => (int)$user['id']], JWT_SECRET, JWT_TTL_SECONDS);
json_response(['token' => $token, 'created' => false]);
