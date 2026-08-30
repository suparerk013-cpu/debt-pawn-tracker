<?php
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/Jwt.php';

function send_cors_headers(): void {
  $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
  if (in_array($origin, ALLOWED_ORIGINS, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
  }
  header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Cron-Secret');
  header('Access-Control-Max-Age: 86400');
}

function json_response($data, int $status = 200): never {
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function json_error(string $message, int $status = 400): never {
  json_response(['error' => $message], $status);
}

function read_json_body(): array {
  $raw = file_get_contents('php://input');
  if (!$raw) return [];
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

/**
 * Verifies the Bearer JWT and returns the full auth context: `uid` is the user whose data
 * this request should read/write (the "acting as" user — see api/auth/switch-user.php),
 * `real_uid`/`real_is_admin` describe who actually logged in, for permission checks.
 */
function require_auth_ctx(): array {
  $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
  if (!preg_match('/^Bearer\s+(.+)$/i', $header, $m)) {
    json_error('Missing or invalid Authorization header', 401);
  }
  $payload = Jwt::decode($m[1], JWT_SECRET);
  if (!$payload || !isset($payload['uid'])) {
    json_error('Invalid or expired token', 401);
  }
  return [
    'uid' => (int) $payload['uid'],
    'is_admin' => !empty($payload['is_admin']),
    'real_uid' => (int) ($payload['real_uid'] ?? $payload['uid']),
    'real_is_admin' => !empty($payload['real_is_admin']),
  ];
}

/** Verifies the Bearer JWT and returns just the "acting as" user id, or aborts with 401. */
function require_auth(): int {
  return require_auth_ctx()['uid'];
}

/** Verifies the cron secret header, or aborts with 401. Use only on /api/cron/* endpoints. */
function require_cron_secret(): void {
  $secret = $_SERVER['HTTP_X_CRON_SECRET'] ?? '';
  if (!hash_equals(CRON_SECRET, $secret)) {
    json_error('Unauthorized', 401);
  }
}

send_cors_headers();
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}
