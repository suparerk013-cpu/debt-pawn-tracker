<?php
// PATCH /api/expenses/mark-paid.php  body: { id }  — marks the current calendar month paid.
// Automatically becomes "unpaid" again next month since paid status is derived from
// last_paid_month === current YYYY-MM, no cron/reset job needed.
require_once __DIR__ . '/../../lib/bootstrap.php';

$userId = require_auth();
if ($_SERVER['REQUEST_METHOD'] !== 'PATCH') json_error('Method not allowed', 405);

$body = read_json_body();
$id = (int)($body['id'] ?? 0);
if (!$id) json_error('Missing id');

$pdo = db();
$stmt = $pdo->prepare('UPDATE recurring_expenses SET last_paid_month = ? WHERE id = ? AND user_id = ?');
$stmt->execute([date('Y-m'), $id, $userId]);
if ($stmt->rowCount() === 0) json_error('Not found', 404);

json_response(['ok' => true]);
