<?php
// GET /api/expenses/index.php  — list recurring monthly expenses, with this-month paid status
// POST /api/expenses/index.php  body: { name, amount, due_day }
require_once __DIR__ . '/../../lib/bootstrap.php';

$userId = require_auth();
$pdo = db();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $currentMonth = date('Y-m');
  $stmt = $pdo->prepare('SELECT * FROM recurring_expenses WHERE user_id = ? ORDER BY due_day ASC');
  $stmt->execute([$userId]);
  $rows = $stmt->fetchAll();
  foreach ($rows as &$r) {
    $r['amount'] = (float)$r['amount'];
    $r['paid_this_month'] = ($r['last_paid_month'] === $currentMonth);
  }
  json_response($rows);
}

if ($method === 'POST') {
  $body = read_json_body();
  $name = trim((string)($body['name'] ?? ''));
  $amount = (float)($body['amount'] ?? 0);
  $dueDay = max(1, min(28, (int)($body['due_day'] ?? 5)));
  if ($name === '' || $amount <= 0) json_error('กรอกชื่อและยอดค่าใช้จ่ายให้ครบ');

  $stmt = $pdo->prepare('INSERT INTO recurring_expenses (user_id, name, amount, due_day) VALUES (?, ?, ?, ?)');
  $stmt->execute([$userId, $name, $amount, $dueDay]);
  json_response(['id' => (int)$pdo->lastInsertId()], 201);
}

json_error('Method not allowed', 405);
