<?php
/**
 * config/session.php
 *
 * Central session lifetime configuration.
 * Include this BEFORE the first session_start() in any customer-facing file.
 *
 * Sets:
 *  - gc_maxlifetime  → 30 days  (server-side file lifetime — prevents GC from
 *                                deleting active sessions after 24-minute default)
 *  - cookie lifetime → 30 days  (browser keeps the cookie across restarts)
 *
 * Admin sessions are configured separately in admin/index.php.
 */

if (session_status() === PHP_SESSION_NONE) {
    if (!headers_sent()) {
        // Isolated session save path to bypass global shared-hosting garbage collection (GC) cleanup
        $dropcars_session_save_path = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'tmp' . DIRECTORY_SEPARATOR . 'sessions';
        if (!is_dir($dropcars_session_save_path)) {
            @mkdir($dropcars_session_save_path, 0770, true);
        }
        if (is_dir($dropcars_session_save_path) && is_writable($dropcars_session_save_path)) {
            @session_save_path($dropcars_session_save_path);
        }

        require_once dirname(__DIR__) . '/includes/paths.php';
        $dropcars_session_lifetime = 30 * 24 * 60 * 60; // 30 days in seconds

        @ini_set('session.gc_maxlifetime', $dropcars_session_lifetime);

        @session_set_cookie_params([
            'lifetime' => $dropcars_session_lifetime,
            'path'     => '/',
            'domain'   => function_exists('dropcars_get_cookie_domain') ? dropcars_get_cookie_domain() : '',
            'secure'   => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }
}
