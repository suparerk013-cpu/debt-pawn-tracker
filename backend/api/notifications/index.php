<?php
// GET /api/notifications/index.php — notification history for the bell icon (what was
// actually pushed to the phone), newest first, plus how many are unread.
require_once __DIR__ . '/../../lib/bootstrap.php';

$userId = require_auth();
if ($_SERVER['REQUEST_METHOD'] !== 'GET') json_error('Method not allowed', 405);

$pdo = db();
$stmt = $pdo->prepare('SELECT id, ref_type, ref_id, title, body, sent_at, read_at FROM notification_log WHERE user_id = ? ORDER BY sent_at DESC LIMIT 50');
$stmt->execute([$userId]);
$rows = $stmt->fetchAll();
foreach ($rows as &$r) { $r['id'] = (int)$r['id']; $r['ref_id'] = (int)$r['ref_id']; }

$stmt = $pdo->prepare('SELECT COUNT(*) FROM notification_log WHERE user_id = ? AND read_at IS NULL');
$stmt->execute([$userId]);
$unread = (int)$stmt->fetchColumn();

json_response(['items' => $rows, 'unread_count' => $unread]);
