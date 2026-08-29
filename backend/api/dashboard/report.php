<?php
// GET /api/dashboard/report.php — full report: total debt, total pawn value, total monthly
// recurring expenses, and what's still owed this calendar month (shrinks as items get paid).
require_once __DIR__ . '/../../lib/bootstrap.php';

$userId = require_auth();
if ($_SERVER['REQUEST_METHOD'] !== 'GET') json_error('Method not allowed', 405);

$pdo = db();
$monthStart = date('Y-m-01');
$monthEnd = date('Y-m-t');
$currentMonth = date('Y-m');

$stmt = $pdo->prepare('SELECT COALESCE(SUM(remaining_amount),0) AS s FROM debts WHERE user_id = ?');
$stmt->execute([$userId]);
$totalDebt = (float)$stmt->fetchColumn();

$stmt = $pdo->prepare("SELECT COALESCE(SUM(amount),0) AS s FROM pawn_tickets WHERE user_id = ? AND status = 'active'");
$stmt->execute([$userId]);
$totalPawn = (float)$stmt->fetchColumn();

$stmt = $pdo->prepare('SELECT COALESCE(SUM(amount),0) AS s FROM recurring_expenses WHERE user_id = ?');
$stmt->execute([$userId]);
$totalRecurring = (float)$stmt->fetchColumn();

// This month's unpaid installments
$stmt = $pdo->prepare("
  SELECT i.id, i.due_date, i.amount, d.id AS debt_id, d.name AS debt_name
  FROM installments i JOIN debts d ON d.id = i.debt_id
  WHERE d.user_id = ? AND i.paid = 0 AND i.due_date BETWEEN ? AND ?
  ORDER BY i.due_date ASC
");
$stmt->execute([$userId, $monthStart, $monthEnd]);
$dueInstallments = $stmt->fetchAll();

// This month's active pawns due
$stmt = $pdo->prepare("
  SELECT id, item_name, amount, due_date FROM pawn_tickets
  WHERE user_id = ? AND status = 'active' AND due_date BETWEEN ? AND ?
  ORDER BY due_date ASC
");
$stmt->execute([$userId, $monthStart, $monthEnd]);
$duePawns = $stmt->fetchAll();

// Recurring expenses not yet paid this month
$stmt = $pdo->prepare('SELECT id, name, amount, due_day, last_paid_month FROM recurring_expenses WHERE user_id = ? ORDER BY due_day ASC');
$stmt->execute([$userId]);
$allExpenses = $stmt->fetchAll();
$dueExpenses = array_values(array_filter($allExpenses, fn($e) => $e['last_paid_month'] !== $currentMonth));

$totalDueThisMonth = array_sum(array_map(fn($r) => (float)$r['amount'], $dueInstallments))
  + array_sum(array_map(fn($r) => (float)$r['amount'], $duePawns))
  + array_sum(array_map(fn($r) => (float)$r['amount'], $dueExpenses));

$breakdown = [];
foreach ($dueInstallments as $r) {
  $breakdown[] = [
    'type' => 'installment', 'ref_id' => (int)$r['id'], 'debt_id' => (int)$r['debt_id'],
    'title' => $r['debt_name'], 'amount' => (float)$r['amount'], 'due_date' => $r['due_date'],
  ];
}
foreach ($duePawns as $r) {
  $breakdown[] = [
    'type' => 'pawn', 'ref_id' => (int)$r['id'],
    'title' => $r['item_name'], 'amount' => (float)$r['amount'], 'due_date' => $r['due_date'],
  ];
}
foreach ($dueExpenses as $r) {
  $dueDate = date('Y-m-') . str_pad((string)$r['due_day'], 2, '0', STR_PAD_LEFT);
  $breakdown[] = [
    'type' => 'expense', 'ref_id' => (int)$r['id'],
    'title' => $r['name'], 'amount' => (float)$r['amount'], 'due_date' => $dueDate,
  ];
}
usort($breakdown, fn($a, $b) => $a['due_date'] <=> $b['due_date']);

json_response([
  'total_debt' => $totalDebt,
  'total_pawn' => $totalPawn,
  'total_recurring' => $totalRecurring,
  'total_due_this_month' => $totalDueThisMonth,
  'breakdown' => $breakdown,
]);
