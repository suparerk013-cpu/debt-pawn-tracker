<?php
// Copy this file to config.php and fill in your real values. config.php is gitignored so
// your real secrets never get committed.
// InfinityFree gives you DB host/name/user/pass in the control panel under MySQL Databases.

// --- Database ---
define('DB_HOST', 'sqlXXX.infinityfree.com');   // e.g. from your hosting control panel
define('DB_NAME', 'if0_XXXXXXX_debtpawn');
define('DB_USER', 'if0_XXXXXXX');
define('DB_PASS', 'CHANGE_ME');
define('DB_CHARSET', 'utf8mb4');

// --- Auth ---
// Generate a long random string for this (e.g. run: php -r "echo bin2hex(random_bytes(32));")
define('JWT_SECRET', 'CHANGE_ME_TO_A_LONG_RANDOM_SECRET');
define('JWT_TTL_SECONDS', 60 * 60 * 24 * 7); // 7 days

// --- Cron protection ---
// The cron job (cron-job.org) must send this exact value in the "X-Cron-Secret" header.
define('CRON_SECRET', 'CHANGE_ME_TO_ANOTHER_LONG_RANDOM_SECRET');

// --- Firebase Cloud Messaging (v1 API, for Web Push) ---
// From Firebase Console > Project Settings > Service Accounts > Generate new private key.
// Put the downloaded JSON file's contents' values here.
define('FCM_PROJECT_ID', 'your-firebase-project-id');
define('FCM_SERVICE_ACCOUNT_JSON', __DIR__ . '/firebase-service-account.json'); // upload this file next to this one, keep it OUT of any public git repo

// --- Rate limiting ---
define('LOGIN_MAX_ATTEMPTS', 5);
define('LOGIN_LOCKOUT_SECONDS', 30);

// --- CORS ---
// The web app (PWA) origin(s) allowed to call this API. Add your deployed PWA's real
// origin here once you know it (e.g. 'https://debtpawntracker.42web.io').
define('ALLOWED_ORIGINS', ['http://localhost:5522', 'http://127.0.0.1:5522']);
