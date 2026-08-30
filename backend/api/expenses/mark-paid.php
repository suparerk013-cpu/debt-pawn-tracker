<?php
// PATCH /api/expenses/mark-paid.php  body: { id, amount? }
// Logs a payment for the current calendar month. `amount` is required for 'variable'-type
// expenses (the actual bill amount); for 'fixed'-type it defaults to the stored template
// amount if not provided. Automatically becomes "unpaid" again next month since paid status
// is derived from whether a row exists for the current month — no cron/reset job needed.
require_once __DIR__ . '/../../lib/bootstrap.php';

$userId = require_auth();
if ($_SERVER['REQUEST_METHOD'] !== 'PATCH') json_error('Method not allowed', 405);

$body = read_json_body();
$id = (int)($body['id'] ?? 0);
if (!$id) json_error('Missing id');

$pdo = db();
$stmt = $pdo->prepare('SELECT * FROM recurring_expenses WHERE id = ? AND user_id = ?');
$stmt->execute([$id, $userId]);
$expense = $stmt->fetch();
if (!$expense) json_error('Not found', 404);

$amount = isset($body['amount']) ? (float)$body['amount'] : (float)$expense['amount'];
if ($amount <= 0) json_error('กรุณากรอกยอดที่จ่ายให้ถูกต้อง');

$month = date('Y-m');
$stmt = $pdo->prepare('
  INSERT INTO expense_payments (expense_id, month, amount) VALUES (?, ?, ?)
  ON DUPLICATE KEY UPDATE amount = VALUES(amount), paid_at = NOW()
');
$stmt->execute([$id, $month, $amount]);

json_response(['ok' => true, 'amount' => $amount]);
