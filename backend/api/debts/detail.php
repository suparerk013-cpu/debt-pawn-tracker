<?php
// GET /api/debts/detail.php?id=123
require_once __DIR__ . '/../../lib/bootstrap.php';

$userId = require_auth();
if ($_SERVER['REQUEST_METHOD'] !== 'GET') json_error('Method not allowed', 405);

$id = (int)($_GET['id'] ?? 0);
if (!$id) json_error('Missing id');

$pdo = db();
$stmt = $pdo->prepare('SELECT * FROM debts WHERE id = ? AND user_id = ?');
$stmt->execute([$id, $userId]);
$debt = $stmt->fetch();
if (!$debt) json_error('Not found', 404);

$instStmt = $pdo->prepare('SELECT * FROM installments WHERE debt_id = ? ORDER BY due_date ASC');
$instStmt->execute([$id]);
$debt['installments'] = $instStmt->fetchAll();
$debt['total_amount'] = (float)$debt['total_amount'];
$debt['remaining_amount'] = (float)$debt['remaining_amount'];

json_response($debt);
