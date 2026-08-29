<?php
// Minimal HS256 JWT implementation — no Composer dependency needed (works on any shared PHP host).

class Jwt {
  private static function b64url(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
  }

  private static function b64urlDecode(string $data): string {
    $pad = strlen($data) % 4;
    if ($pad) $data .= str_repeat('=', 4 - $pad);
    return base64_decode(strtr($data, '-_', '+/'));
  }

  public static function encode(array $payload, string $secret, int $ttlSeconds): string {
    $header = ['typ' => 'JWT', 'alg' => 'HS256'];
    $payload['iat'] = time();
    $payload['exp'] = time() + $ttlSeconds;

    $segments = [
      self::b64url(json_encode($header)),
      self::b64url(json_encode($payload)),
    ];
    $signingInput = implode('.', $segments);
    $signature = hash_hmac('sha256', $signingInput, $secret, true);
    $segments[] = self::b64url($signature);
    return implode('.', $segments);
  }

  /** Returns the decoded payload array, or null if invalid/expired. */
  public static function decode(string $token, string $secret): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    [$headerB64, $payloadB64, $sigB64] = $parts;

    $signingInput = $headerB64 . '.' . $payloadB64;
    $expectedSig = hash_hmac('sha256', $signingInput, $secret, true);
    $actualSig = self::b64urlDecode($sigB64);
    if (!hash_equals($expectedSig, $actualSig)) return null;

    $payload = json_decode(self::b64urlDecode($payloadB64), true);
    if (!is_array($payload)) return null;
    if (!isset($payload['exp']) || time() > $payload['exp']) return null;

    return $payload;
  }
}
