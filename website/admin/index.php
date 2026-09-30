<?php
/**
 * Main Controller / Router for Drop Cars Admin
 */

// ── Security: never expose errors on production ──────────────────
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL); // still log, just don't show

// ── Load security middleware ─────────────────────────────────────
require_once __DIR__ . '/../config/security.php';

// Block scraper bots from admin too
dropcars_block_if_scraper();
// Rate-limit admin requests: 30 per minute per IP
dropcars_rate_limit('admin', 30, 60);

$config = require __DIR__ . '/config/config.php';

require_once __DIR__ . '/../includes/paths.php';
require_once __DIR__ . '/includes/functions.php';

// Use /admin/{page} in the browser instead of /admin/index.php?page={page} or direct wrapper .php files
// BUT NEVER REDIRECT IF IT IS A POST REQUEST (to avoid losing POST data)
if ($_SERVER['REQUEST_METHOD'] !== 'POST' && PHP_SAPI !== 'cli') {
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '';
    if (preg_match('#/admin/index\.php$#', $path)) {
        if (isset($_GET['page'])) {
            $slug = preg_replace('/[^a-z0-9-]/i', '', (string) $_GET['page']);
            if ($slug !== '') {
                $qs = $_GET;
                unset($qs['page']);
                header('Location: ' . admin_url($slug, $qs), true, 302);
                exit;
            }
        }
    } elseif (preg_match('#/admin/([a-z0-9-]+)\.php$#i', $path, $matches)) {
        $slug = preg_replace('/[^a-z0-9-]/i', '', $matches[1]);
        if ($slug !== '' && $slug !== 'index') {
            $qs = $_GET;
            unset($qs['page']);
            header('Location: ' . admin_url($slug, $qs), true, 301);
            exit;
        }
    }
}

if (session_status() === PHP_SESSION_NONE) {
    // Isolated session save path to bypass global shared-hosting garbage collection (GC) cleanup
    $adminSessionSavePath = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'tmp' . DIRECTORY_SEPARATOR . 'sessions';
    if (!is_dir($adminSessionSavePath)) {
        @mkdir($adminSessionSavePath, 0770, true);
    }
    if (is_dir($adminSessionSavePath) && is_writable($adminSessionSavePath)) {
        session_save_path($adminSessionSavePath);
    }

    // Secure session cookie settings — 365-day persist sessions
    $sessionName = $config['sessionName'] ?? 'dropcars_admin_session';
    session_name($sessionName);
    $adminSessionLifetime = 365 * 24 * 60 * 60; // 365 days in seconds
    ini_set('session.gc_maxlifetime', $adminSessionLifetime);
    session_set_cookie_params([
        'lifetime' => $adminSessionLifetime, // persist across browser restarts
        'path'     => '/',
        'domain'   => '',
        'secure'   => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true,        // no JS access to session cookie
        'samesite' => 'Lax',       // sent on top-level cross-site navigation (e.g. Telegram links) while still blocking CSRF on POST
    ]);
    session_start();
}
// Session security: auto-logout on timeout (525600 min = 365 days) and fingerprint mismatch
dropcars_admin_secure_session(525600);
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/../engine/theme-engine.php';
require_once __DIR__ . '/../engine/shell.php';

$page = isset($_GET['page']) ? preg_replace('/[^a-z0-9-]/i', '', (string) $_GET['page']) : '';
if ($page === '') {
    $reqPath = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '';
    if (preg_match('#/admin/([a-z0-9-]+)/?$#i', $reqPath, $m)) {
        $page = $m[1];
    }
}
if ($page === '') {
    $page = 'dashboard';
}

// Redirect legacy marketing pages to the new unified Promotions Command Center
if (in_array($page, ['coupons', 'banners'])) {
    $page = 'promotions';
}

// Simple Auth Check
if (!isLoggedIn() && !in_array($page, ['login', 'forgot-password', 'reset-password', 'init-admin'], true)) {
    header('Location: ' . admin_url('login'));
    exit;
}

// Verification: Ensure admin user still exists in database (handle deletion) and
// that this session matches the admin's current session token ("log out all devices").
if (isLoggedIn() && !in_array($page, ['login', 'forgot-password', 'reset-password', 'init-admin'], true)) {
    if (function_exists('dropcars_admin_ensure_password_policy_columns')) {
        dropcars_admin_ensure_password_policy_columns($pdo);
    }
    $stmtCheckExist = $pdo->prepare('SELECT `session_token` FROM `admins` WHERE `id` = ?');
    $stmtCheckExist->execute([$_SESSION['admin_id']]);
    $adminRow = $stmtCheckExist->fetch(PDO::FETCH_ASSOC);
    if ($adminRow === false) {
        // Admin no longer exists.
        logout();
    } else {
        $dbToken = (string) ($adminRow['session_token'] ?? '');
        $sessToken = (string) ($_SESSION['session_token'] ?? '');
        if ($dbToken === '') {
            // No token registered yet (legacy session): adopt the current session's
            // token, or mint one so future "log out all devices" works.
            $dbToken = $sessToken !== '' ? $sessToken : bin2hex(random_bytes(16));
            try {
                $pdo->prepare('UPDATE `admins` SET `session_token` = ? WHERE `id` = ?')
                    ->execute([$dbToken, $_SESSION['admin_id']]);
            } catch (Throwable $e) {
                // Non-fatal.
            }
            $_SESSION['session_token'] = $dbToken;
        } elseif ($sessToken === '') {
            // Legacy session predating tokens: adopt the DB token so it stays valid
            // until an explicit "log out all devices".
            $_SESSION['session_token'] = $dbToken;
        } elseif (!hash_equals($dbToken, $sessToken)) {
            // Token rotated elsewhere ("log out all devices") — this session is stale.
            logout();
        }
    }
}

// RBAC Authorization: Restrict staff from accessing Settings, Sync/Reset, or changing recovery email
if (isLoggedIn() && ($_SESSION['admin_role'] ?? 'staff') === 'staff') {
    if (in_array($page, ['settings', 'sync-and-reset', 'change-email'], true)) {
        header('Location: ' . admin_url('dashboard', ['err' => 'unauthorized']));
        exit;
    }
}

// Rate-limit login page specifically: 10 attempts per minute
if ($page === 'login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    dropcars_rate_limit('admin_login', 10, 60);
}

// Audit log: track which admin accesses sensitive pages
$_sensitiveAdminPages = ['sync-and-reset', 'customers', 'reports', 'settings', 'blocked-ips'];
if (isLoggedIn() && in_array($page, $_sensitiveAdminPages, true)) {
    dropcars_security_log('ADMIN_PAGE_ACCESS', ['page' => $page]);
}
unset($_sensitiveAdminPages);

// SYNC & RESET: extra protection — verify admin is authenticated
if ($page === 'sync-and-reset') {
    dropcars_require_admin_for_sync();
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        dropcars_log_sync_action('SYNC_RESET_INITIATED', [
            'post_keys' => array_keys($_POST),
            'remove_after_sync' => !empty($_POST['remove_after_sync']),
        ]);
    }
}

if (isLoggedIn() && function_exists('dropcars_admin_password_change_required') && dropcars_admin_password_change_required()) {
    if (!in_array($page, ['change-password', 'logout'], true)) {
        header('Location: ' . admin_url('change-password'));
        exit;
    }
}

// Route to pages
$pagePath = __DIR__ . "/pages/{$page}.php";

if (file_exists($pagePath)) {
    ob_start();
    include $pagePath;
    $content = ob_get_clean();

    // Include Layout
    if (in_array($page, ['login', 'forgot-password', 'reset-password', 'init-admin'], true)) {
        include __DIR__ . '/includes/layout-auth.php';
    } else {
        include __DIR__ . '/includes/layout.php';
    }
} else {
    header('HTTP/1.0 404 Not Found');
    echo '<h1>404 Not Found</h1>';
}
