<?php
// GET returns current settings. PATCH body: { warn_days?: number }
require_once __DIR__ . '/../../lib/bootstrap.php';

$userId = require_auth();
$pdo = db();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $stmt = $pdo->prepare('SELECT warn_days FROM users WHERE id = ?');
  $stmt->execute([$userId]);
  $row = $stmt->fetch();
  if (!$row) json_error('Not found', 404);
  json_response(['warn_days' => (int)$row['warn_days']]);
}

if ($method === 'PATCH') {
  $body = read_json_body();
  $fields = [];
  $params = [];

  if (isset($body['warn_days'])) {
    $fields[] = 'warn_days = ?';
    $params[] = max(1, min(30, (int)$body['warn_days']));
  }
  if (!$fields) json_error('Nothing to update');

  $params[] = $userId;
  $pdo->prepare('UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);
  json_response(['ok' => true]);
}

json_error('Method not allowed', 405);
