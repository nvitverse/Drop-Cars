<?php
/**
 * Global Error Handler - Production safe. No sensitive data exposed.
 */
defined('DROP_CARS_SAFE') || die('Direct access not permitted');

function dc_error_handler(int $errno, string $errstr, string $errfile, int $errline): bool {
    if (!(error_reporting() & $errno)) return false;
    $logDir = defined('DC_LOG_DIR') ? DC_LOG_DIR : (dirname(__DIR__) . '/logs');
    if (is_dir($logDir)) {
        $file = $logDir . '/dc_' . date('Y-m-d') . '.log';
        $safe = substr($errfile, strrpos($errfile, '/') ?: 0);
        $line = date('Y-m-d H:i:s') . ' | PHP ' . $errno . ' | ' . $errstr . ' | ' . $safe . ':' . $errline . "\n";
        @file_put_contents($file, $line, FILE_APPEND | LOCK_EX);
    }
    return true;
}

function dc_fatal_handler(): void {
    $e = error_get_last();
    if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        $logDir = defined('DC_LOG_DIR') ? DC_LOG_DIR : (dirname(__DIR__) . '/logs');
        if (is_dir($logDir)) {
            $file = $logDir . '/dc_' . date('Y-m-d') . '.log';
            $line = date('Y-m-d H:i:s') . ' | FATAL | ' . ($e['message'] ?? '') . ' | ' . ($e['file'] ?? '') . ':' . ($e['line'] ?? 0) . "\n";
            @file_put_contents($file, $line, FILE_APPEND | LOCK_EX);
        }
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: text/html; charset=utf-8');
        }
        while (ob_get_level()) ob_end_clean();
        if (is_file($fallback = dirname(__DIR__) . '/core/error-fallback.php')) {
            require $fallback;
        } else {
            echo '<!DOCTYPE html><html><head><title>Error</title></head><body><h1>Something went wrong</h1><p>Please try again later.</p></body></html>';
        }
    }
}

register_shutdown_function('dc_fatal_handler');
