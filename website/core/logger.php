<?php
/**
 * Logger - Per-day rotation. Size limit. No sensitive data.
 */
defined('DROP_CARS_SAFE') || die('Direct access not permitted');

define('DC_LOG_MAX_BYTES', 5 * 1024 * 1024);

function dc_log(string $logDir, string $event, array $data = []): void {
    $logDir = rtrim($logDir, '/');
    if (!is_dir($logDir)) @mkdir($logDir, 0750, true);

    $safe = [];
    foreach ($data as $k => $v) {
        if (in_array($k, ['password', 'pass', 'token', 'secret'], true)) continue;
        $safe[$k] = is_string($v) ? substr($v, 0, 500) : $v;
    }

    $file = $logDir . '/dc_' . date('Y-m-d') . '.log';
    $line = date('Y-m-d H:i:s') . ' | ' . $event . ' | ' . json_encode($safe, JSON_UNESCAPED_UNICODE) . "\n";

    if (is_file($file) && filesize($file) > DC_LOG_MAX_BYTES) {
        $bak = $file . '.' . time() . '.bak';
        @rename($file, $bak);
    }
    @file_put_contents($file, $line, FILE_APPEND | LOCK_EX);
}
