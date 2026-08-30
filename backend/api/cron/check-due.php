<?php
// POST /api/cron/check-due.php — called once a day by cron-job.org.
// Must send header: X-Cron-Secret: <CRON_SECRET from config.php>
require_once __DIR__ . '/../../lib/bootstrap.php';
require_once __DIR__ . '/../../lib/FcmSender.php';

require_cron_secret();

$pdo = db();
$today = date('Y-m-d');
$sent = 0;
$skipped = 0;

$fcm = null;
try {
  $fcm = new FcmSender(FCM_SERVICE_ACCOUNT_JSON);
} catch (Throwable $e) {
  error_log('FCM init failed: ' . $e->getMessage());
}

function already_notified(PDO $pdo, int $userId, string $type, int $refId, string $today): bool {
  $stmt = $pdo->prepare('SELECT 1 FROM notification_log WHERE user_id = ? AND ref_type = ? AND ref_id = ? AND sent_date = ?');
  $stmt->execute([$userId, $type, $refId, $today]);
  return (bool)$stmt->fetchColumn();
}

/** Days since the last notification for this ref, or null if it was never notified. */
function days_since_last_notified(PDO $pdo, int $userId, string $type, int $refId, string $today): ?int {
  $stmt = $pdo->prepare('SELECT MAX(sent_date) FROM notification_log WHERE user_id = ? AND ref_type = ? AND ref_id = ?');
  $stmt->execute([$userId, $type, $refId]);
  $last = $stmt->fetchColumn();
  if (!$last) return null;
  return (int) round((strtotime($today) - strtotime($last)) / 86400);
}

function log_notified(PDO $pdo, int $userId, string $type, int $refId, string $today): void {
  $stmt = $pdo->prepare('INSERT IGNORE INTO notification_log (user_id, ref_type, ref_id, sent_date) VALUES (?, ?, ?, ?)');
  $stmt->execute([$userId, $type, $refId, $today]);
}

// Due/overdue installments
$stmt = $pdo->query("
  SELECT i.id, i.due_date, i.amount, d.name AS debt_name, d.user_id, u.fcm_token, u.warn_days
  FROM installments i
  JOIN debts d ON d.id = i.debt_id
  JOIN users u ON u.id = d.user_id
  WHERE i.paid = 0
");
foreach ($stmt->fetchAll() as $row) {
  $daysLeft = (strtotime($row['due_date']) - strtotime($today)) / 86400;
  if ($daysLeft > (int)$row['warn_days']) continue;
  if (already_notified($pdo, (int)$row['user_id'], 'installment', (int)$row['id'], $today)) { $skipped++; continue; }
  if (empty($row['fcm_token'])) { $skipped++; continue; }

  $title = $daysLeft < 0 ? 'ค้างชำระ' : 'ใกล้ถึงกำหนดชำระ';
  $body = "{$row['debt_name']} — ฿" . number_format((float)$row['amount']) . " ครบกำหนด {$row['due_date']}";

  if ($fcm && $fcm->send($row['fcm_token'], $title, $body, ['type' => 'installment', 'debt_id' => (string)$row['user_id']])) {
    log_notified($pdo, (int)$row['user_id'], 'installment', (int)$row['id'], $today);
    $sent++;
  } else {
    $skipped++;
  }
}

// Due/overdue pawn tickets — reminders repeat on the ticket's own period (e.g. every 7 days)
// instead of every day, using period_unit/period_value captured when the ticket was created
// or last renewed. Tickets with no period set (older data) fall back to the old daily behavior.
$stmt = $pdo->query("
  SELECT p.id, p.due_date, p.amount, p.item_name, p.category, p.created_at, p.period_unit, p.period_value, u.fcm_token, u.warn_days
  FROM pawn_tickets p
  JOIN users u ON u.id = p.user_id
  WHERE p.status = 'active'
");
foreach ($stmt->fetchAll() as $row) {
  $daysLeft = (strtotime($row['due_date']) - strtotime($today)) / 86400;

  // Jewelry tickets past their hard 5-month deadline: urgent daily red-alert, ignoring the
  // normal period-cycle throttle below — the item is about to be forfeited to the pawn shop.
  $finalDueDate = (new DateTime($row['created_at']))->modify('+5 months')->format('Y-m-d');
  $isForfeitWarning = $row['category'] === 'jewelry' && $today >= $finalDueDate;

  if (!$isForfeitWarning) {
    if ($daysLeft > (int)$row['warn_days']) continue;
    if (already_notified($pdo, (int)$row['user_id'], 'pawn', (int)$row['id'], $today)) { $skipped++; continue; }

    $cycleDays = $row['period_unit'] === 'month' ? ((int)$row['period_value'] * 30) : (int)($row['period_value'] ?: 1);
    $sinceLast = days_since_last_notified($pdo, (int)$row['user_id'], 'pawn', (int)$row['id'], $today);
    if ($sinceLast !== null && $sinceLast < $cycleDays) { $skipped++; continue; }
  } elseif (already_notified($pdo, (int)$row['user_id'], 'pawn', (int)$row['id'], $today)) {
    $skipped++; continue;
  }

  if (empty($row['fcm_token'])) { $skipped++; continue; }

  if ($isForfeitWarning) {
    $title = '⚠️ ตั๋วจำนำใกล้ขาดแล้ว!';
    $body = "{$row['item_name']} — ครบกำหนดไถ่ถอนสุดท้ายวันนี้ ({$finalDueDate}) ไม่ไถ่ถอนจะเสียสิทธิ์ทันที";
  } else {
    $title = $daysLeft < 0 ? 'ตั๋วจำนำเลยกำหนด' : 'ตั๋วจำนำใกล้ครบกำหนด';
    $body = "{$row['item_name']} — ฿" . number_format((float)$row['amount']) . " ครบกำหนด {$row['due_date']}";
  }

  if ($fcm && $fcm->send($row['fcm_token'], $title, $body, ['type' => 'pawn', 'pawn_id' => (string)$row['id']])) {
    log_notified($pdo, (int)$row['user_id'], 'pawn', (int)$row['id'], $today);
    $sent++;
  } else {
    $skipped++;
  }
}

// Due/overdue recurring monthly expenses (rent, utilities, etc). Skipped entirely once marked
// paid for the current month; reminders repeat daily within warn_days like installments do,
// since the "due date" resets automatically every month.
$currentMonth = date('Y-m');
$stmt = $pdo->query("
  SELECT e.id, e.name, e.amount, e.due_day, e.last_paid_month, e.user_id, u.fcm_token, u.warn_days
  FROM recurring_expenses e
  JOIN users u ON u.id = e.user_id
");
foreach ($stmt->fetchAll() as $row) {
  if ($row['last_paid_month'] === $currentMonth) continue;

  $dueDate = date('Y-m-') . str_pad((string)$row['due_day'], 2, '0', STR_PAD_LEFT);
  $daysLeft = (strtotime($dueDate) - strtotime($today)) / 86400;
  if ($daysLeft > (int)$row['warn_days']) continue;
  if (already_notified($pdo, (int)$row['user_id'], 'expense', (int)$row['id'], $today)) { $skipped++; continue; }
  if (empty($row['fcm_token'])) { $skipped++; continue; }

  $title = $daysLeft < 0 ? 'ค่าใช้จ่ายประจำค้างชำระ' : 'ค่าใช้จ่ายประจำใกล้ถึงกำหนด';
  $body = "{$row['name']} — ฿" . number_format((float)$row['amount']) . " ครบกำหนด {$dueDate}";

  if ($fcm && $fcm->send($row['fcm_token'], $title, $body, ['type' => 'expense', 'expense_id' => (string)$row['id']])) {
    log_notified($pdo, (int)$row['user_id'], 'expense', (int)$row['id'], $today);
    $sent++;
  } else {
    $skipped++;
  }
}

json_response(['ok' => true, 'sent' => $sent, 'skipped' => $skipped, 'date' => $today]);
