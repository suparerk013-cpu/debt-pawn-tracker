<?php
// PATCH /api/pawns/renew.php  body: { id: 123, days?: 30 } OR { id: 123, months?: 2 }
// Pushes due_date forward by the given period, calculated from the pawn's current due_date.
require_once __DIR__ . '/../../lib/bootstrap.php';

$userId = require_auth();
if ($_SERVER['REQUEST_METHOD'] !== 'PATCH') json_error('Method not allowed', 405);

$body = read_json_body();
$id = (int)($body['id'] ?? 0);
if (!$id) json_error('Missing id');

$pdo = db();
$stmt = $pdo->prepare('SELECT due_date FROM pawn_tickets WHERE id = ? AND user_id = ?');
$stmt->execute([$id, $userId]);
$row = $stmt->fetch();
if (!$row) json_error('Not found', 404);

$due = new DateTime($row['due_date']);
if (isset($body['months'])) {
  $months = max(1, min(12, (int)$body['months']));
  $due->modify("+{$months} month");
  $periodUnit = 'month'; $periodValue = $months;
} else {
  $days = isset($body['days']) ? (int)$body['days'] : 30;
  $days = max(1, min(365, $days));
  $due->modify("+{$days} days");
  $periodUnit = 'day'; $periodValue = $days;
}
$newDue = $due->format('Y-m-d');

// Remember the period the user picked so the reminder cycle (in cron/check-due.php) re-notifies
// on this same cadence instead of every day.
$pdo->prepare("UPDATE pawn_tickets SET due_date = ?, period_unit = ?, period_value = ?, status = 'active' WHERE id = ?")
  ->execute([$newDue, $periodUnit, $periodValue, $id]);

json_response(['ok' => true, 'due_date' => $newDue]);
