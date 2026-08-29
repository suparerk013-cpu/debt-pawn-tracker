<?php
// PATCH /api/pawns/redeem.php  body: { id: 123 }
require_once __DIR__ . '/../../lib/bootstrap.php';

$userId = require_auth();
if ($_SERVER['REQUEST_METHOD'] !== 'PATCH') json_error('Method not allowed', 405);

$body = read_json_body();
$id = (int)($body['id'] ?? 0);
if (!$id) json_error('Missing id');

$pdo = db();
$stmt = $pdo->prepare("UPDATE pawn_tickets SET status = 'redeemed' WHERE id = ? AND user_id = ?");
$stmt->execute([$id, $userId]);
if ($stmt->rowCount() === 0) json_error('Not found', 404);

json_response(['ok' => true]);
