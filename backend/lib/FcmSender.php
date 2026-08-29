<?php
// Sends push notifications via Firebase Cloud Messaging HTTP v1 API using a service account.
// Needs: config/firebase-service-account.json (downloaded from Firebase Console >
// Project Settings > Service Accounts > Generate new private key). Never commit that file.

class FcmSender {
  private array $account;

  public function __construct(string $serviceAccountPath) {
    if (!is_file($serviceAccountPath)) {
      throw new RuntimeException('Firebase service account file not found: ' . $serviceAccountPath);
    }
    $this->account = json_decode(file_get_contents($serviceAccountPath), true);
  }

  private function getAccessToken(): string {
    $now = time();
    $header = ['alg' => 'RS256', 'typ' => 'JWT'];
    $claims = [
      'iss' => $this->account['client_email'],
      'scope' => 'https://www.googleapis.com/auth/firebase.messaging',
      'aud' => 'https://oauth2.googleapis.com/token',
      'iat' => $now,
      'exp' => $now + 3600,
    ];

    $b64 = fn($d) => rtrim(strtr(base64_encode(is_string($d) ? $d : json_encode($d)), '+/', '-_'), '=');
    $signingInput = $b64($header) . '.' . $b64($claims);

    $privateKey = openssl_pkey_get_private($this->account['private_key']);
    if (!$privateKey) throw new RuntimeException('Invalid private key in service account file');
    openssl_sign($signingInput, $signature, $privateKey, 'SHA256');
    $jwt = $signingInput . '.' . $b64($signature);

    $ch = curl_init('https://oauth2.googleapis.com/token');
    curl_setopt_array($ch, [
      CURLOPT_POST => true,
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_POSTFIELDS => http_build_query([
        'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        'assertion' => $jwt,
      ]),
      CURLOPT_TIMEOUT => 15,
    ]);
    $resp = curl_exec($ch);
    if ($resp === false) throw new RuntimeException('Token request failed: ' . curl_error($ch));
    curl_close($ch);

    $data = json_decode($resp, true);
    if (!isset($data['access_token'])) throw new RuntimeException('Failed to obtain access token: ' . $resp);
    return $data['access_token'];
  }

  /** Sends a single notification. Returns true on success, false on failure (logged, not thrown). */
  public function send(string $fcmToken, string $title, string $body, array $data = []): bool {
    try {
      $accessToken = $this->getAccessToken();
      $projectId = $this->account['project_id'];

      $payload = [
        'message' => [
          'token' => $fcmToken,
          'notification' => ['title' => $title, 'body' => $body],
          'data' => array_map('strval', $data),
        ],
      ];

      $ch = curl_init("https://fcm.googleapis.com/v1/projects/{$projectId}/messages:send");
      curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
          'Authorization: Bearer ' . $accessToken,
          'Content-Type: application/json',
        ],
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_TIMEOUT => 15,
      ]);
      $resp = curl_exec($ch);
      $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
      curl_close($ch);

      return $status >= 200 && $status < 300;
    } catch (Throwable $e) {
      error_log('FCM send failed: ' . $e->getMessage());
      return false;
    }
  }
}
