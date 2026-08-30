<?php
// GET /api/expenses/index.php  — list recurring expenses, with this-month paid status
// POST /api/expenses/index.php  body: { name, expense_type, amount?, due_day }
//   - expense_type 'fixed': amount is required (the same amount every month)
//   - expense_type 'variable': amount is ignored — the real amount is entered per month
//     when marking it paid (see mark-paid.php), since it changes each time (water/electric)
require_once __DIR__ . '/../../lib/bootstrap.php';

$userId = require_auth();
$pdo = db();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $currentMonth = date('Y-m');
  $stmt = $pdo->prepare('SELECT * FROM recurring_expenses WHERE user_id = ? ORDER BY due_day ASC');
  $stmt->execute([$userId]);
  $rows = $stmt->fetchAll();

  $payStmt = $pdo->prepare('SELECT month, amount FROM expense_payments WHERE expense_id = ? ORDER BY month DESC');
  foreach ($rows as &$r) {
    $r['amount'] = $r['amount'] !== null ? (float)$r['amount'] : null;
    $payStmt->execute([$r['id']]);
    $payments = $payStmt->fetchAll();
    $r['paid_this_month'] = !empty($payments) && $payments[0]['month'] === $currentMonth;
    // For variable-type expenses, show the most recent actual amount as an estimate
    // (there's no fixed template amount to show instead).
    $r['last_amount'] = !empty($payments) ? (float)$payments[0]['amount'] : null;
  }
  json_response($rows);
}

if ($method === 'POST') {
  $body = read_json_body();
  $name = trim((string)($body['name'] ?? ''));
  $expenseType = ($body['expense_type'] ?? 'fixed') === 'variable' ? 'variable' : 'fixed';
  $dueDay = max(1, min(28, (int)($body['due_day'] ?? 5)));
  $amount = $expenseType === 'fixed' ? (float)($body['amount'] ?? 0) : null;

  if ($name === '' || ($expenseType === 'fixed' && $amount <= 0)) {
    json_error('กรอกชื่อและยอดค่าใช้จ่ายให้ครบ');
  }

  $stmt = $pdo->prepare('INSERT INTO recurring_expenses (user_id, name, expense_type, amount, due_day) VALUES (?, ?, ?, ?, ?)');
  $stmt->execute([$userId, $name, $expenseType, $amount, $dueDay]);
  json_response(['id' => (int)$pdo->lastInsertId()], 201);
}

json_error('Method not allowed', 405);
