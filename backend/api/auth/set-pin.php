<?php
// POST /api/auth/set-pin.php  body: { pin: "1234" }  — requires a valid JWT.
// Used right after a Google sign-in that has no PIN yet (needs_pin: true), and could
// later be reused for a "change PIN" settings option.
require_once __DIR__ . '/../../lib/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_error('Method not allowed', 405);
$userId = require_auth();

$body = read_json_body();
$pin = trim((string)($body['pin'] ?? ''));
if (!preg_match('/^\d{4,6}$/', $pin)) json_error('PIN ต้องเป็นตัวเลข 4-6 หลัก');

$hash = password_hash($pin, PASSWORD_BCRYPT);
db()->prepare('UPDATE users SET pin_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?')->execute([$hash, $userId]);

json_response(['ok' => true]);
