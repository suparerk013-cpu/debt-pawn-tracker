<?php
require_once __DIR__ . '/../../lib/bootstrap.php';

$userId = require_auth();
$pdo = db();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
  $stmt = $pdo->prepare("SELECT * FROM debts WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC");
  $stmt->execute([$userId]);
  $debts = $stmt->fetchAll();

  $instStmt = $pdo->prepare('SELECT * FROM installments WHERE debt_id = ? ORDER BY due_date ASC');
  foreach ($debts as &$d) {
    $instStmt->execute([$d['id']]);
    $d['installments'] = $instStmt->fetchAll();
    $d['total_amount'] = (float)$d['total_amount'];
    $d['remaining_amount'] = (float)$d['remaining_amount'];
  }
  json_response($debts);
}

if ($method === 'POST') {
  $body = read_json_body();
  $name = trim((string)($body['name'] ?? ''));
  $total = (float)($body['total_amount'] ?? 0);
  $remaining = isset($body['remaining_amount']) ? (float)$body['remaining_amount'] : $total;
  $dueDay = isset($body['due_day']) ? max(1, min(28, (int)$body['due_day'])) : 5;
  $instAmount = (float)($body['installment_amount'] ?? 0);
  if ($instAmount <= 0 && $total > 0) $instAmount = round($total / 6, 2);

  if ($name === '' || $total <= 0) json_error('กรอกชื่อและยอดหนี้ให้ครบ');

  $pdo->beginTransaction();
  try {
    $stmt = $pdo->prepare('INSERT INTO debts (user_id, name, total_amount, remaining_amount, payment_type, due_day, installment_amount) VALUES (?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([$userId, $name, $total, $remaining, 'installment', $dueDay, $instAmount]);
    $debtId = (int)$pdo->lastInsertId();

    // Generate the next 3 installments starting from the next occurrence of due_day.
    $today = new DateTime('today');
    $base = new DateTime($today->format('Y-m') . '-' . str_pad((string)$dueDay, 2, '0', STR_PAD_LEFT));
    if ($base < $today) $base->modify('+1 month');

    $instStmt = $pdo->prepare('INSERT INTO installments (debt_id, due_date, amount) VALUES (?, ?, ?)');
    for ($i = 0; $i < 3; $i++) {
      $d = clone $base;
      $d->modify("+{$i} month");
      $instStmt->execute([$debtId, $d->format('Y-m-d'), $instAmount]);
    }

    $pdo->commit();
  } catch (Exception $e) {
    $pdo->rollBack();
    json_error('บันทึกไม่สำเร็จ', 500);
  }

  json_response(['id' => $debtId], 201);
}

json_error('Method not allowed', 405);
