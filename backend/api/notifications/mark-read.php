<?php
// PATCH /api/notifications/mark-read.php  body: { id } or { all: true }
require_once __DIR__ . '/../../lib/bootstrap.php';

$userId = require_auth();
if ($_SERVER['REQUEST_METHOD'] !== 'PATCH') json_error('Method not allowed', 405);

$body = read_json_body();
$pdo = db();

if (!empty($body['all'])) {
  $pdo->prepare('UPDATE notification_log SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL')->execute([$userId]);
  json_response(['ok' => true]);
}

$id = (int)($body['id'] ?? 0);
if (!$id) json_error('Missing id');
$stmt = $pdo->prepare('UPDATE notification_log SET read_at = NOW() WHERE id = ? AND user_id = ?');
$stmt->execute([$id, $userId]);
if ($stmt->rowCount() === 0) json_error('Not found', 404);

json_response(['ok' => true]);
