<?php
require_once __DIR__ . '/../../lib/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_error('Method not allowed', 405);
$userId = require_auth();

$body = read_json_body();
$fcmToken = trim((string)($body['fcm_token'] ?? ''));
if ($fcmToken === '') json_error('fcm_token is required');

$stmt = db()->prepare('UPDATE users SET fcm_token = ? WHERE id = ?');
$stmt->execute([$fcmToken, $userId]);

json_response(['ok' => true]);
