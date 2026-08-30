<?php
// DELETE /api/debts/delete.php  body: { id }
// Permanently removes a debt and its installments (ON DELETE CASCADE).
require_once __DIR__ . '/../../lib/bootstrap.php';

$userId = require_auth();
if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') json_error('Method not allowed', 405);

$body = read_json_body();
$id = (int)($body['id'] ?? 0);
if (!$id) json_error('Missing id');

$stmt = db()->prepare('DELETE FROM debts WHERE id = ? AND user_id = ?');
$stmt->execute([$id, $userId]);
if ($stmt->rowCount() === 0) json_error('Not found', 404);

json_response(['ok' => true]);
