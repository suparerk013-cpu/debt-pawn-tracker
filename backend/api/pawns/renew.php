<?php
// PATCH /api/pawns/renew.php  body: { id, days? } OR { id, months? } OR { id, due_date? }
// Pushes due_date forward, calculated from the pawn's current due_date.
//
// Jewelry ('category' = 'jewelry') tickets can only be renewed 4 times total. On the 4th
// renewal the ticket enters a final grace month: instead of a normal day/month renewal, the
// caller must pass an explicit `due_date` (the day they intend to pay), which cannot exceed
// the hard deadline of 5 months after the ticket was created. After that 5th adjustment, no
// further renewal/reschedule is possible — the ticket either gets redeemed or lapses.
require_once __DIR__ . '/../../lib/bootstrap.php';

$userId = require_auth();
if ($_SERVER['REQUEST_METHOD'] !== 'PATCH') json_error('Method not allowed', 405);

$body = read_json_body();
$id = (int)($body['id'] ?? 0);
if (!$id) json_error('Missing id');

const JEWELRY_MAX_RENEWALS = 4;

$pdo = db();
$stmt = $pdo->prepare('SELECT due_date, category, renewal_count, created_at FROM pawn_tickets WHERE id = ? AND user_id = ?');
$stmt->execute([$id, $userId]);
$row = $stmt->fetch();
if (!$row) json_error('Not found', 404);

$isJewelry = $row['category'] === 'jewelry';
$renewalCount = (int)$row['renewal_count'];
$finalDueDate = (new DateTime($row['created_at']))->modify('+5 months');

if ($isJewelry && $renewalCount >= JEWELRY_MAX_RENEWALS + 1) {
  json_error('ตั๋วนี้ต่อดอก/เลื่อนกำหนดครบจำนวนสูงสุดแล้ว กรุณาไถ่ถอนก่อนวันครบกำหนดสุดท้าย', 400);
}

if ($isJewelry && $renewalCount >= JEWELRY_MAX_RENEWALS) {
  // Final grace month: caller must choose an explicit date, capped at the hard deadline.
  $requestedDate = trim((string)($body['due_date'] ?? ''));
  if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $requestedDate)) {
    json_error('กรุณาเลือกวันที่จะชำระ (ไม่เกินวันครบกำหนดสุดท้าย)');
  }
  $newDue = new DateTime($requestedDate);
  $today = new DateTime('today');
  if ($newDue < $today) json_error('เลือกวันที่ในอดีตไม่ได้');
  if ($newDue > $finalDueDate) json_error('เลือกวันเกินวันครบกำหนดสุดท้าย (' . $finalDueDate->format('Y-m-d') . ') ไม่ได้');

  $pdo->prepare("UPDATE pawn_tickets SET due_date = ?, renewal_count = renewal_count + 1, status = 'active' WHERE id = ?")
    ->execute([$newDue->format('Y-m-d'), $id]);
  json_response(['ok' => true, 'due_date' => $newDue->format('Y-m-d'), 'final' => true]);
}

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
$pdo->prepare("UPDATE pawn_tickets SET due_date = ?, period_unit = ?, period_value = ?, renewal_count = renewal_count + 1, status = 'active' WHERE id = ?")
  ->execute([$newDue, $periodUnit, $periodValue, $id]);

json_response(['ok' => true, 'due_date' => $newDue]);
