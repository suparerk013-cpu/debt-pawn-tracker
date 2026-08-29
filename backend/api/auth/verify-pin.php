<?php
// POST /api/auth/verify-pin.php  body: { pin }  — requires the existing JWT (Authorization header).
// This is the local re-unlock check for returning users who are already logged in on this device.
require_once __DIR__ . '/../../lib/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_error('Method not allowed', 405);
$userId = require_auth();

$body = read_json_body();
$pin = trim((string)($body['pin'] ?? ''));
if (!preg_match('/^\d{4,6}$/', $pin)) json_error('PIN ต้องเป็นตัวเลข 4-6 หลัก');

$pdo = db();
$stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
$stmt->execute([$userId]);
$user = $stmt->fetch();
if (!$user) json_error('ไม่พบบัญชี', 404);

if (empty($user['pin_hash'])) json_error('ยังไม่ได้ตั้ง PIN', 400);

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
  $pdo->prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?')->execute([$attempts, $lockedUntil, $userId]);
  json_error('PIN ไม่ถูกต้อง', 401);
}

$pdo->prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?')->execute([$userId]);
json_response(['ok' => true]);
