<?php
/**
 * API Token - Replay prevention. Constant-time validation.
 */
defined('DROP_CARS_SAFE') || die('Direct access not permitted');

function dc_api_token_generate(string $secret): string {
    $payload = (string) time() . '|' . ($_SERVER['REMOTE_ADDR'] ?? '') . '|' . bin2hex(random_bytes(8));
    return hash_hmac('sha256', $payload, $secret) . '.' . base64_encode($payload);
}

function dc_api_token_validate(string $token, string $secret, int $maxAge = 300): bool {
    if ($token === '' || strpos($token, '.') === false) return false;
    $parts = explode('.', $token, 2);
    if (count($parts) !== 2) return false;
    [$hash, $b64] = $parts;
    $payload = base64_decode($b64, true);
    if ($payload === false) return false;
    $segments = explode('|', $payload, 4);
    if (count($segments) < 3) return false;
    $ts = (int) $segments[0];
    $ip = $segments[1] ?? '';
    if (time() - $ts > $maxAge) return false;
    if ($ip !== '' && ($_SERVER['REMOTE_ADDR'] ?? '') !== $ip) return false;

    $expected = hash_hmac('sha256', $payload, $secret);
    if (!hash_equals($expected, $hash)) return false;

    $usedDir = defined('DC_TMP_DIR') ? DC_TMP_DIR . '/token-used' : (dirname(__DIR__) . '/tmp/token-used');
    if (!is_dir($usedDir)) @mkdir($usedDir, 0750, true);
    $usedFile = $usedDir . '/u_' . md5($token) . '.used';
    if (is_file($usedFile)) return false;
    @file_put_contents($usedFile, (string) time(), LOCK_EX);
    $cutoff = time() - $maxAge;
    $files = @glob($usedDir . '/u_*.used');
    if (is_array($files)) {
        foreach ($files as $f) {
            if (is_file($f) && filemtime($f) < $cutoff) @unlink($f);
        }
    }
    return true;
}
