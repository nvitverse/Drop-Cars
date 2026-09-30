<?php
/**
 * IP-based Rate Limiter - Time-window reset
 * Stores timestamp + count. Resets after 60 seconds.
 */
defined('DROP_CARS_SAFE') || die('Direct access not permitted');

function dc_rate_limit_check(string $storageDir, int $maxPerMinute = 50, bool $isApi = false) {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    $now = time();
    $windowStart = floor($now / 60) * 60;
    $file = rtrim($storageDir, '/') . '/rl_' . md5($ip) . '.json';

    if (!is_dir($storageDir)) {
        @mkdir($storageDir, 0750, true);
    }

    $data = ['ts' => $windowStart, 'count' => 0];
    if (is_file($file)) {
        $raw = @file_get_contents($file);
        $decoded = $raw ? @json_decode($raw, true) : null;
        if (is_array($decoded) && isset($decoded['ts'], $decoded['count'])) {
            if ($decoded['ts'] === $windowStart) {
                $data['count'] = (int) $decoded['count'];
            }
        }
    }

    if ($data['count'] >= $maxPerMinute) {
        return $isApi ? ['allowed' => false, 'retry_after' => 60] : false;
    }

    $data['count']++;
    @file_put_contents($file, json_encode($data), LOCK_EX);

    return $isApi ? ['allowed' => true] : true;
}

function dc_rate_limit_response(bool $isApi, int $retryAfter = 60): void {
    if ($isApi) {
        http_response_code(429);
        header('Content-Type: application/json; charset=utf-8');
        header('Retry-After: ' . $retryAfter);
        echo json_encode(['error' => 'Too many requests', 'retry_after' => $retryAfter]);
    } else {
        http_response_code(429);
        header('Retry-After: ' . $retryAfter);
        echo '<!DOCTYPE html><html><head><title>Too Many Requests</title></head><body><h1>429</h1><p>Too many requests. Please try again later.</p></body></html>';
    }
    exit;
}
