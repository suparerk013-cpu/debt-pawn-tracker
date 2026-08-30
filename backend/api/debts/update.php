<?php
// PATCH /api/debts/update.php  body: { id, name?, total_amount?, remaining_amount?, due_day?, installment_amount? }
// Changing installment_amount also updates every not-yet-paid installment to the new
// amount, since "ปรับงวด" means changing the ongoing installment plan, not just the label.
require_once __DIR__ . '/../../lib/bootstrap.php';

$userId = require_auth();
if ($_SERVER['REQUEST_METHOD'] !== 'PATCH') json_error('Method not allowed', 405);

$body = read_json_body();
$id = (int)($body['id'] ?? 0);
if (!$id) json_error('Missing id');

$pdo = db();
$stmt = $pdo->prepare('SELECT * FROM debts WHERE id = ? AND user_id = ?');
$stmt->execute([$id, $userId]);
$debt = $stmt->fetch();
if (!$debt) json_error('Not found', 404);

$fields = [];
$params = [];
if (isset($body['name'])) {
  $name = trim((string)$body['name']);
  if ($name === '') json_error('ชื่อหนี้ห้ามว่าง');
  $fields[] = 'name = ?'; $params[] = $name;
}
if (isset($body['total_amount'])) {
  $total = (float)$body['total_amount'];
  if ($total <= 0) json_error('ยอดหนี้ทั้งหมดต้องมากกว่า 0');
  $fields[] = 'total_amount = ?'; $params[] = $total;
}
if (isset($body['remaining_amount'])) {
  $fields[] = 'remaining_amount = ?'; $params[] = max(0, (float)$body['remaining_amount']);
}
if (isset($body['due_day'])) {
  $fields[] = 'due_day = ?'; $params[] = max(1, min(28, (int)$body['due_day']));
}
$newInstAmount = null;
if (isset($body['installment_amount'])) {
  $newInstAmount = (float)$body['installment_amount'];
  if ($newInstAmount <= 0) json_error('ยอดผ่อนต่อเดือนต้องมากกว่า 0');
  $fields[] = 'installment_amount = ?'; $params[] = $newInstAmount;
}
if (!$fields) json_error('Nothing to update');

$pdo->beginTransaction();
try {
  $params[] = $id;
  $pdo->prepare('UPDATE debts SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);
  if ($newInstAmount !== null) {
    $pdo->prepare('UPDATE installments SET amount = ? WHERE debt_id = ? AND paid = 0')->execute([$newInstAmount, $id]);
  }
  $pdo->commit();
} catch (Exception $e) {
  $pdo->rollBack();
  json_error('บันทึกไม่สำเร็จ', 500);
}

json_response(['ok' => true]);
