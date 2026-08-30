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

// Fixed expenses use their template amount; variable ones use the most recent actual
// payment as an estimate (there's no fixed amount to sum otherwise).
$stmt = $pdo->prepare('SELECT COALESCE(SUM(amount),0) AS s FROM recurring_expenses WHERE user_id = ? AND expense_type = "fixed"');
$stmt->execute([$userId]);
$totalRecurring = (float)$stmt->fetchColumn();

$stmt = $pdo->prepare("
  SELECT e.id, MAX(p.month) AS latest_month
  FROM recurring_expenses e LEFT JOIN expense_payments p ON p.expense_id = e.id
  WHERE e.user_id = ? AND e.expense_type = 'variable'
  GROUP BY e.id
");
$stmt->execute([$userId]);
$variableLatestMonth = $stmt->fetchAll();
$latestAmountStmt = $pdo->prepare('SELECT amount FROM expense_payments WHERE expense_id = ? AND month = ?');
foreach ($variableLatestMonth as $row) {
  if (!$row['latest_month']) continue;
  $latestAmountStmt->execute([$row['id'], $row['latest_month']]);
  $totalRecurring += (float)$latestAmountStmt->fetchColumn();
}

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

// Recurring expenses not yet paid this month. For variable-type ones with no payment logged
// yet this month, fall back to their most recent actual amount as an estimate.
$stmt = $pdo->prepare('SELECT id, name, expense_type, amount, due_day FROM recurring_expenses WHERE user_id = ? ORDER BY due_day ASC');
$stmt->execute([$userId]);
$allExpenses = $stmt->fetchAll();

$monthPayStmt = $pdo->prepare('SELECT amount FROM expense_payments WHERE expense_id = ? AND month = ?');
$latestPayStmt = $pdo->prepare('SELECT amount FROM expense_payments WHERE expense_id = ? ORDER BY month DESC LIMIT 1');
$dueExpenses = [];
foreach ($allExpenses as $e) {
  $monthPayStmt->execute([$e['id'], $currentMonth]);
  if ($monthPayStmt->fetchColumn() !== false) continue; // already paid this month

  if ($e['expense_type'] === 'fixed') {
    $e['display_amount'] = (float)$e['amount'];
  } else {
    $latestPayStmt->execute([$e['id']]);
    $latest = $latestPayStmt->fetchColumn();
    $e['display_amount'] = $latest !== false ? (float)$latest : 0.0;
  }
  $dueExpenses[] = $e;
}

$totalDueThisMonth = array_sum(array_map(fn($r) => (float)$r['amount'], $dueInstallments))
  + array_sum(array_map(fn($r) => (float)$r['amount'], $duePawns))
  + array_sum(array_map(fn($r) => $r['display_amount'], $dueExpenses));

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
    'type' => 'expense', 'ref_id' => (int)$r['id'], 'expense_type' => $r['expense_type'],
    'title' => $r['name'], 'amount' => $r['display_amount'], 'due_date' => $dueDate,
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
