<?php
/**
 * IP blocking — include at the very start of public API handlers (after OPTIONS/method checks).
 * Silent success: 200 + {"success":true} — no DB writes, no notifications.
 */

if (!function_exists('dropcars_check_blocked_ip')) {
    function dropcars_check_blocked_ip(): void
    {
        $ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['HTTP_X_REAL_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '';
        $ip = trim(explode(',', (string) $ip)[0] ?? '');
        if ($ip === '' || !filter_var($ip, FILTER_VALIDATE_IP)) {
            return;
        }

        if (!defined('DROP_CARS_DB_OPTIONAL')) {
            define('DROP_CARS_DB_OPTIONAL', true);
        }
        $dbPath = dirname(__DIR__) . '/config/database.php';
        if (!is_file($dbPath)) {
            return;
        }
        require_once $dbPath;
        require_once dirname(__DIR__) . '/includes/blocked-ips-schema.php';

        if (!isset($pdo) || !$pdo instanceof PDO) {
            return;
        }

        try {
            dropcars_ensure_blocked_ips_schema($pdo);
            $stmt = $pdo->prepare('SELECT 1 FROM `blocked_ips` WHERE `ip_address` = ? LIMIT 1');
            $stmt->execute([$ip]);
            if ($stmt->fetchColumn()) {
                header('Content-Type: application/json; charset=utf-8');
                http_response_code(200);
                echo json_encode(['success' => true]);
                exit;
            }
        } catch (Throwable $e) {
            error_log('Drop Cars check-blocked: ' . $e->getMessage());
        }
    }
}

if (!function_exists('dropcars_check_blocked_phone')) {
    function dropcars_check_blocked_phone($phone): void
    {
        $cleanPhone = preg_replace('/[^\d]/', '', (string)$phone);
        if ($cleanPhone === '') {
            return;
        }

        if (!defined('DROP_CARS_DB_OPTIONAL')) {
            define('DROP_CARS_DB_OPTIONAL', true);
        }
        $dbPath = dirname(__DIR__) . '/config/database.php';
        if (!is_file($dbPath)) {
            return;
        }
        require_once $dbPath;

        if (!isset($pdo) || !$pdo instanceof PDO) {
            return;
        }

        try {
            $stmt = $pdo->prepare("SELECT 1 FROM `customers` WHERE (phone LIKE ? OR REPLACE(REPLACE(REPLACE(phone, '+', ''), ' ', ''), '-', '') LIKE ?) AND (is_blocked = 1 OR is_spam = 1) LIMIT 1");
            $likePhone = '%' . $cleanPhone;
            $stmt->execute([$likePhone, $likePhone]);
            if ($stmt->fetchColumn()) {
                header('Content-Type: application/json; charset=utf-8');
                http_response_code(200);
                echo json_encode(['success' => true]);
                exit;
            }
        } catch (Throwable $e) {
            error_log('Drop Cars check-blocked phone: ' . $e->getMessage());
        }
    }
}
