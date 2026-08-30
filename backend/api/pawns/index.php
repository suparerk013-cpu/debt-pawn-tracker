<?php
require_once __DIR__ . '/../../lib/bootstrap.php';

$userId = require_auth();
$pdo = db();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $stmt = $pdo->prepare("SELECT * FROM pawn_tickets WHERE user_id = ? AND status = 'active' ORDER BY due_date ASC");
  $stmt->execute([$userId]);
  $pawns = $stmt->fetchAll();
  foreach ($pawns as &$p) {
    $p['amount'] = (float)$p['amount'];
    $p['interest'] = $p['interest'] !== null ? (float)$p['interest'] : null;
  }
  json_response($pawns);
}

if ($method === 'POST') {
  $body = read_json_body();
  $item = trim((string)($body['item_name'] ?? ''));
  $shop = trim((string)($body['shop_name'] ?? ''));
  $ticketCode = trim((string)($body['ticket_code'] ?? ''));
  $category = in_array($body['category'] ?? null, ['jewelry', 'car', 'electronics', 'other'], true) ? $body['category'] : 'other';
  $amount = (float)($body['amount'] ?? 0);
  $dueDate = trim((string)($body['due_date'] ?? ''));
  $periodUnit = in_array($body['period_unit'] ?? null, ['day', 'month'], true) ? $body['period_unit'] : null;
  $periodValue = $periodUnit ? max(1, min(120, (int)($body['period_value'] ?? 0))) : null;

  if ($item === '' || $amount <= 0 || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dueDate)) {
    json_error('กรอกข้อมูลตั๋วจำนำให้ครบ');
  }

  $stmt = $pdo->prepare('INSERT INTO pawn_tickets (user_id, ticket_code, shop_name, item_name, category, amount, due_date, period_unit, period_value, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  $stmt->execute([$userId, $ticketCode ?: null, $shop ?: null, $item, $category, $amount, $dueDate, $periodUnit, $periodValue, 'active']);

  json_response(['id' => (int)$pdo->lastInsertId()], 201);
}

json_error('Method not allowed', 405);
