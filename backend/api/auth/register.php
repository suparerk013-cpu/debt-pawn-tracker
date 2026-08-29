<?php
// POST /api/auth/register.php  body: { username, password, phone }
require_once __DIR__ . '/../../lib/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_error('Method not allowed', 405);

$body = read_json_body();
$username = trim((string)($body['username'] ?? ''));
$password = (string)($body['password'] ?? '');
$phone = preg_replace('/\D+/', '', (string)($body['phone'] ?? ''));

if (!preg_match('/^[a-zA-Z0-9_.]{3,32}$/', $username)) {
  json_error('ชื่อผู้ใช้ต้องเป็นตัวอักษร/ตัวเลข 3-32 ตัวอักษร');
}
if (strlen($password) < 6) json_error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
if (strlen($phone) < 9 || strlen($phone) > 10) json_error('กรอกเบอร์โทรศัพท์ให้ถูกต้อง');

$pdo = db();

$stmt = $pdo->prepare('SELECT id FROM users WHERE username = ?');
$stmt->execute([$username]);
if ($stmt->fetch()) json_error('มีชื่อผู้ใช้นี้อยู่แล้ว');

$hash = password_hash($password, PASSWORD_BCRYPT);
$stmt = $pdo->prepare('INSERT INTO users (username, password_hash, phone) VALUES (?, ?, ?)');
$stmt->execute([$username, $hash, $phone]);
$userId = (int)$pdo->lastInsertId();

$token = Jwt::encode(['uid' => $userId], JWT_SECRET, JWT_TTL_SECONDS);
json_response(['token' => $token, 'needs_pin' => true], 201);
