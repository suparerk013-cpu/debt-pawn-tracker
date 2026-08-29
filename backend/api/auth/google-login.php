<?php
// POST /api/auth/google-login.php  body: { id_token: "<Google ID token from the app>" }
//
// Verifies the token against Google's tokeninfo endpoint (no library/JWKS caching needed —
// fine for this app's traffic volume). Each distinct Google account gets its own user row,
// same as username/password registration.
require_once __DIR__ . '/../../lib/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_error('Method not allowed', 405);

$body = read_json_body();
$idToken = trim((string)($body['id_token'] ?? ''));
if ($idToken === '') json_error('Missing id_token');

$ch = curl_init('https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($idToken));
curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15]);
$resp = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($resp === false || $status !== 200) json_error('ยืนยันบัญชี Google ไม่สำเร็จ', 401);
$claims = json_decode($resp, true);

if (!isset($claims['aud']) || $claims['aud'] !== GOOGLE_CLIENT_ID) json_error('Token ไม่ถูกต้อง', 401);
if (($claims['email_verified'] ?? 'false') !== 'true') json_error('อีเมล Google ยังไม่ได้ยืนยัน', 401);

$googleId = $claims['sub'];
$email = $claims['email'] ?? null;

$pdo = db();

$stmt = $pdo->prepare('SELECT * FROM users WHERE google_id = ?');
$stmt->execute([$googleId]);
$user = $stmt->fetch();

if (!$user) {
  // Derive a unique username from the email so the account also has one (useful if they
  // later want to set a password too, or just for display).
  $base = preg_replace('/[^a-zA-Z0-9_.]/', '', explode('@', $email ?: 'user')[0]) ?: 'user';
  $username = substr($base, 0, 28);
  $suffix = 0;
  while (true) {
    $candidate = $suffix === 0 ? $username : $username . $suffix;
    $check = $pdo->prepare('SELECT id FROM users WHERE username = ?');
    $check->execute([$candidate]);
    if (!$check->fetch()) { $username = $candidate; break; }
    $suffix++;
  }

  $pdo->prepare('INSERT INTO users (username, google_id, email) VALUES (?, ?, ?)')->execute([$username, $googleId, $email]);
  $userId = (int)$pdo->lastInsertId();
  $user = ['id' => $userId, 'pin_hash' => null];
}

$token = Jwt::encode(['uid' => (int)$user['id']], JWT_SECRET, JWT_TTL_SECONDS);
json_response(['token' => $token, 'needs_pin' => empty($user['pin_hash'])]);
