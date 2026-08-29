<?php
// PATCH /api/installments/mark.php  body: { id: 123 }
require_once __DIR__ . '/../../lib/bootstrap.php';

$userId = require_auth();
if ($_SERVER['REQUEST_METHOD'] !== 'PATCH') json_error('Method not allowed', 405);

$body = read_json_body();
$id = (int)($body['id'] ?? 0);
if (!$id) json_error('Missing id');

$pdo = db();

// Ownership check via join, and fetch the installment's amount + debt id.
$stmt = $pdo->prepare('
  SELECT i.id, i.amount, i.paid, d.id AS debt_id, d.remaining_amount
  FROM installments i
  JOIN debts d ON d.id = i.debt_id
  WHERE i.id = ? AND d.user_id = ?
');
$stmt->execute([$id, $userId]);
$row = $stmt->fetch();
if (!$row) json_error('Not found', 404);
if ((int)$row['paid'] === 1) json_response(['ok' => true]); // already paid, idempotent

$pdo->beginTransaction();
try {
  $pdo->prepare('UPDATE installments SET paid = 1, paid_at = NOW() WHERE id = ?')->execute([$id]);
  $newRemaining = max(0, (float)$row['remaining_amount'] - (float)$row['amount']);
  $pdo->prepare('UPDATE debts SET remaining_amount = ? WHERE id = ?')->execute([$newRemaining, $row['debt_id']]);
  $pdo->commit();
} catch (Exception $e) {
  $pdo->rollBack();
  json_error('อัปเดตไม่สำเร็จ', 500);
}

json_response(['ok' => true, 'remaining_amount' => $newRemaining]);
