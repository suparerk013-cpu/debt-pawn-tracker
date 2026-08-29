<?php
// POST /api/auth/forgot-password.php  body: { username, contact, new_password }
// `contact` is either the phone number or the email on file for this account — Google-signup
// accounts often only have an email, not a phone, so either must work.
// Recovery is identity-only, there is no SMS/OTP step (needs a paid gateway). Good enough for
// a personal app, not a bank.
require_once __DIR__ . '/../../lib/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_error('Method not allowed', 405);

$body = read_json_body();
$username = trim((string)($body['username'] ?? ''));
$contact = trim((string)($body['contact'] ?? ''));
$newPassword = (string)($body['new_password'] ?? '');

if ($username === '' || $contact === '') json_error('กรอกชื่อผู้ใช้และเบอร์โทรศัพท์หรืออีเมล');
if (strlen($newPassword) < 6) json_error('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร');

$pdo = db();
$stmt = $pdo->prepare('SELECT id, phone, email FROM users WHERE username = ?');
$stmt->execute([$username]);
$user = $stmt->fetch();

if (!$user || !contact_matches_user($user, $contact)) {
  json_error('ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบชื่อผู้ใช้และเบอร์โทรศัพท์/อีเมล', 401);
}

$hash = password_hash($newPassword, PASSWORD_BCRYPT);
$pdo->prepare('UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?')->execute([$hash, $user['id']]);

json_response(['ok' => true]);
