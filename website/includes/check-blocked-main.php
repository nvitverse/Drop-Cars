<?php
/**
 * Global IP block check for main site (index, route, city pages).
 * Include at top of entry files. Exits with "Access restricted" if IP is blocked.
 * If database is unavailable, skips check so the site still loads.
 *
 * Uses admin/config/database.php (same credentials as admin/API: env, secret.php,
 * database.local.php next to public_html, admin/config/database.local.php on localhost).
 */
$ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['HTTP_X_REAL_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '';
$ip = trim(explode(',', $ip)[0] ?? '');
if (!$ip) {
    return;
}

// 1. Maintenance Mode Check
$configPath = __DIR__ . '/../api/config.php';
if (is_file($configPath)) {
    $config = include $configPath;
    if (!empty($config['maintenanceMode'])) {
        // Exclude some paths if needed, e.g. /admin, but this file is only for main site
        require_once __DIR__ . '/maintenance-page.php';
        exit;
    }
}

if (!defined('DROP_CARS_DB_OPTIONAL')) {
    define('DROP_CARS_DB_OPTIONAL', true);
}
if (!defined('DROP_CARS_SKIP_ENQUIRIES_SCHEMA')) {
    define('DROP_CARS_SKIP_ENQUIRIES_SCHEMA', true);
}

require_once __DIR__ . '/../admin/config/database.php';
$pdo = $GLOBALS['db'] ?? null;
if (!$pdo instanceof PDO) {
    return;
}

try {
    $stmt = $pdo->prepare('SELECT 1 FROM blocked_ips WHERE ip_address = ? LIMIT 1');
    $stmt->execute([$ip]);
    if ($stmt->fetch()) {
        exit('Access restricted');
    }
} catch (Throwable $e) {
    // Database unavailable – skip block check, allow site to load
}
