<?php
// GET /api/auth/me.php — requires JWT. Used at app boot to decide lock vs PIN-setup screen.
require_once __DIR__ . '/../../lib/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') json_error('Method not allowed', 405);
$userId = require_auth();

$stmt = db()->prepare('SELECT username, phone, pin_hash FROM users WHERE id = ?');
$stmt->execute([$userId]);
$user = $stmt->fetch();
if (!$user) json_error('Not found', 404);

json_response([
  'username' => $user['username'],
  'phone' => $user['phone'],
  'needs_pin' => empty($user['pin_hash']),
]);
