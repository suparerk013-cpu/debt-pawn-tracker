<?php
// PATCH /api/debts/close.php  body: { id }
// Marks a debt as paid off/closed — removes it from the active list without deleting its
// history. remaining_amount is zeroed since a closed debt is, by definition, settled.
require_once __DIR__ . '/../../lib/bootstrap.php';

$userId = require_auth();
if ($_SERVER['REQUEST_METHOD'] !== 'PATCH') json_error('Method not allowed', 405);

$body = read_json_body();
$id = (int)($body['id'] ?? 0);
if (!$id) json_error('Missing id');

$pdo = db();
$stmt = $pdo->prepare("UPDATE debts SET status = 'closed', remaining_amount = 0 WHERE id = ? AND user_id = ?");
$stmt->execute([$id, $userId]);
if ($stmt->rowCount() === 0) json_error('Not found', 404);

json_response(['ok' => true]);
