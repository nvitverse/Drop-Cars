<?php
/**
 * admin/includes/session.php
 *
 * Centralized session initialization for all Drop Cars Admin endpoints.
 * Ensures consistent session name, lifetime, save path, and cookie security.
 */

if (session_status() === PHP_SESSION_NONE) {
    // 1. Locate the admin and site root directories
    $adminDir = dirname(__DIR__); // admin/
    $siteRootDir = dirname($adminDir); // site root/

    // 2. Load admin configuration
    $configPath = $adminDir . DIRECTORY_SEPARATOR . 'config' . DIRECTORY_SEPARATOR . 'config.php';
    $config = is_file($configPath) ? (include $configPath) : [];

    // 3. Configure isolated session save path to prevent shared-hosting cleanup
    $adminSessionSavePath = $siteRootDir . DIRECTORY_SEPARATOR . 'tmp' . DIRECTORY_SEPARATOR . 'sessions';
    if (!is_dir($adminSessionSavePath)) {
        @mkdir($adminSessionSavePath, 0775, true);
    }
    if (is_dir($adminSessionSavePath) && is_writable($adminSessionSavePath)) {
        session_save_path($adminSessionSavePath);
    }

    // 4. Configure session cookie parameters
    $sessionName = $config['sessionName'] ?? 'dropcars_admin_session';
    session_name($sessionName);

    $adminSessionLifetime = 365 * 24 * 60 * 60; // 365 days
    ini_set('session.gc_maxlifetime', $adminSessionLifetime);

    // Resolve base path for cookie path configuration
    $cookiePath = '/admin';
    $pathsFile = $siteRootDir . DIRECTORY_SEPARATOR . 'includes' . DIRECTORY_SEPARATOR . 'paths.php';
    if (is_file($pathsFile)) {
        require_once $pathsFile;
        if (function_exists('dropcars_base_path')) {
            $basePath = dropcars_base_path();
            if ($basePath !== '' && $basePath !== '/') {
                $cookiePath = rtrim($basePath, '/') . '/admin';
            }
        }
    }

    session_set_cookie_params([
        'lifetime' => $adminSessionLifetime,
        'path'     => $cookiePath,
        'domain'   => '',
        'secure'   => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);

    session_start();
}
