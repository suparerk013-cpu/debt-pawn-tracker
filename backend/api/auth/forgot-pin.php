<?php
// POST /api/auth/forgot-pin.php  body: { username, contact, new_pin }
// `contact` is either the phone number or the email on file for this account (see
// forgot-password.php for why). On success also logs the user back in (returns a fresh JWT)
// since proving username+contact is equivalent to a login for this app.
require_once __DIR__ . '/../../lib/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_error('Method not allowed', 405);

$body = read_json_body();
$username = trim((string)($body['username'] ?? ''));
$contact = trim((string)($body['contact'] ?? ''));
$newPin = trim((string)($body['new_pin'] ?? ''));

if ($username === '' || $contact === '') json_error('กรอกชื่อผู้ใช้และเบอร์โทรศัพท์หรืออีเมล');
if (!preg_match('/^\d{4,6}$/', $newPin)) json_error('PIN ต้องเป็นตัวเลข 4-6 หลัก');

$pdo = db();
$stmt = $pdo->prepare('SELECT id, phone, email FROM users WHERE username = ?');
$stmt->execute([$username]);
$user = $stmt->fetch();

if (!$user || !contact_matches_user($user, $contact)) {
  json_error('ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบชื่อผู้ใช้และเบอร์โทรศัพท์/อีเมล', 401);
}

$hash = password_hash($newPin, PASSWORD_BCRYPT);
$pdo->prepare('UPDATE users SET pin_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?')->execute([$hash, $user['id']]);

$token = Jwt::encode(['uid' => (int)$user['id']], JWT_SECRET, JWT_TTL_SECONDS);
json_response(['ok' => true, 'token' => $token]);
