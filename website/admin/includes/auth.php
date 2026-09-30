<?php
/**
 * Authentication management for Admin
 */

function isLoggedIn() {
    return !empty($_SESSION['admin_id']) && !empty($_SESSION['admin_email']);
}

function login($adminId, $name, $email, $username = '', $role = 'staff') {
    $_SESSION['admin_id'] = (int) $adminId;
    $_SESSION['admin_name'] = $name;
    $_SESSION['admin_email'] = !empty($email) ? $email : $username;
    $_SESSION['admin_username'] = $username;
    $_SESSION['admin_role'] = $role;
}

function dropcars_admin_require_password_change(bool $required): void
{
    $_SESSION['admin_force_password_change'] = $required ? 1 : 0;
}

function dropcars_admin_password_change_required(): bool
{
    return !empty($_SESSION['admin_force_password_change']);
}

function logout() {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    // Also expire the persistent remember-me cookie so the browser doesn't re-send it
    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    if (defined('DROPCARS_REMEMBER_COOKIE')) {
        setcookie(DROPCARS_REMEMBER_COOKIE, '', [
            'expires'  => time() - 86400,
            'path'     => '/admin',
            'domain'   => '',
            'secure'   => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }
    session_destroy();
    header('Location: ' . (function_exists('admin_url') ? admin_url('login') : '/admin/login'));
    exit;
}

function verifyPassword($password, $hash) {
    return password_verify((string) $password, (string) $hash);
}

/**
 * The permanent main / recovery email. Hardcoded on purpose so it can never be
 * changed from the admin UI — used for account recovery and important security
 * notifications (email-change codes, etc.). Override only via the
 * DROPCARS_RECOVERY_EMAIL environment variable on the server if ever needed.
 */
function dropcars_recovery_email(): string {
    $env = getenv('DROPCARS_RECOVERY_EMAIL');
    if (is_string($env) && filter_var(trim($env), FILTER_VALIDATE_EMAIL)) {
        return strtolower(trim($env));
    }
    return 'dropcarsbookings@gmail.com';
}

/** True when the given email is the protected main/recovery email. */
function dropcars_is_recovery_email(?string $email): bool {
    if ($email === null || trim($email) === '') {
        return false;
    }
    return strcasecmp(trim($email), dropcars_recovery_email()) === 0;
}

function generateToken() {
    return bin2hex(random_bytes(32));
}

function dropcars_admin_ensure_password_policy_columns(PDO $pdo): void
{
    static $checked = false;
    if ($checked) {
        return;
    }
    $checked = true;
    try {
        $pdo->exec("ALTER TABLE `admins` ADD COLUMN `password_must_change` TINYINT(1) NOT NULL DEFAULT 0");
    } catch (Throwable $e) {
        // Column may already exist.
    }
    try {
        $pdo->exec("ALTER TABLE `admins` ADD COLUMN `temporary_password_set_at` DATETIME NULL DEFAULT NULL");
    } catch (Throwable $e) {
        // Column may already exist.
    }
    // Per-admin session token: rotating it invalidates every logged-in device.
    try {
        $pdo->exec("ALTER TABLE `admins` ADD COLUMN `session_token` VARCHAR(64) NULL DEFAULT NULL");
    } catch (Throwable $e) {
        // Column may already exist.
    }
}

// ================================================================
// PERSISTENT SESSION HELPERS (remember-me token system)
// ================================================================

/** Name of the persistent auth cookie. */
if (!defined('DROPCARS_REMEMBER_COOKIE')) {
    define('DROPCARS_REMEMBER_COOKIE', 'dropcars_admin_persist');
}

/**
 * Ensure the admin_remember_tokens table exists (created lazily — no migration needed).
 */
function dropcars_ensure_remember_tokens_table(PDO $pdo): void
{
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS `admin_remember_tokens` (
            `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            `admin_id`   INT UNSIGNED NOT NULL,
            `token_hash` VARCHAR(128) NOT NULL,
            `user_agent` VARCHAR(512) NOT NULL DEFAULT '',
            `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `expires_at` DATETIME NOT NULL,
            KEY `idx_token_hash` (`token_hash`),
            KEY `idx_admin_id`   (`admin_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } catch (Throwable $e) { /* table already exists or no CREATE privilege */ }
}

/**
 * Issue a 365-day persistent auth cookie for the given admin.
 * Call this right after a successful login.
 */
function dropcars_set_remember_token(PDO $pdo, int $adminId): void
{
    dropcars_ensure_remember_tokens_table($pdo);

    $token    = bin2hex(random_bytes(32));
    $hash     = hash('sha256', $token);
    $lifetime = 365 * 24 * 60 * 60;
    $expires  = date('Y-m-d H:i:s', time() + $lifetime);
    $ua       = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 512);

    try {
        $pdo->prepare("INSERT INTO `admin_remember_tokens`
                           (`admin_id`, `token_hash`, `user_agent`, `expires_at`)
                       VALUES (?, ?, ?, ?)")
            ->execute([$adminId, $hash, $ua, $expires]);
    } catch (Throwable $e) {
        return; // Non-fatal — session-only login still works
    }

    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    setcookie(DROPCARS_REMEMBER_COOKIE, $adminId . ':' . $token, [
        'expires'  => time() + $lifetime,
        'path'     => '/admin',
        'domain'   => '',
        'secure'   => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);

    // Store in session so logout() can remove this specific token
    $_SESSION['_remember_token_hash'] = $hash;
}

/**
 * If the PHP session has expired but the persistent cookie is present,
 * look up the token in the DB and restore the admin session automatically.
 * Call BEFORE the isLoggedIn() check in admin/index.php.
 */
function dropcars_restore_session_from_token(PDO $pdo): void
{
    if (!empty($_SESSION['admin_id'])) {
        return; // Already authenticated
    }

    $raw = $_COOKIE[DROPCARS_REMEMBER_COOKIE] ?? '';
    if ($raw === '') return;

    $parts = explode(':', $raw, 2);
    if (count($parts) !== 2) return;

    [$adminId, $token] = $parts;
    $adminId = (int) $adminId;
    if ($adminId <= 0 || $token === '') return;

    dropcars_ensure_remember_tokens_table($pdo);

    $hash = hash('sha256', $token);
    try {
        $stmt = $pdo->prepare(
            "SELECT rt.id, a.id AS admin_id, a.name, a.email, a.username,
                    a.role, a.session_token, a.password_must_change
             FROM `admin_remember_tokens` rt
             JOIN `admins` a ON a.id = rt.admin_id
             WHERE rt.token_hash = ? AND rt.admin_id = ? AND rt.expires_at > NOW()
             LIMIT 1"
        );
        $stmt->execute([$hash, $adminId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        return;
    }

    if (!$row) {
        dropcars_clear_remember_token($pdo);
        return;
    }

    // Rebuild session exactly as login() does
    $_SESSION['admin_id']       = (int) $row['admin_id'];
    $_SESSION['admin_name']     = $row['name']     ?? '';
    $_SESSION['admin_email']    = !empty($row['email']) ? $row['email'] : ($row['username'] ?? '');
    $_SESSION['admin_username'] = $row['username'] ?? '';
    $_SESSION['admin_role']     = $row['role']     ?? 'staff';
    $_SESSION['admin_force_password_change'] = !empty($row['password_must_change']) ? 1 : 0;
    $_SESSION['session_token']  = $row['session_token'] ?? '';
    $_SESSION['_last_activity'] = time();
    $_SESSION['_remember_token_hash'] = $hash;
}

/**
 * Delete this device's persistent token from the DB and expire the cookie.
 * Call on per-device logout.
 */
function dropcars_clear_remember_token(PDO $pdo): void
{
    $hash = $_SESSION['_remember_token_hash'] ?? '';

    if ($hash === '') {
        $raw = $_COOKIE[DROPCARS_REMEMBER_COOKIE] ?? '';
        if ($raw !== '') {
            $parts = explode(':', $raw, 2);
            if (count($parts) === 2) {
                $hash = hash('sha256', $parts[1]);
            }
        }
    }

    if ($hash !== '') {
        try {
            dropcars_ensure_remember_tokens_table($pdo);
            $pdo->prepare("DELETE FROM `admin_remember_tokens` WHERE `token_hash` = ?")
                ->execute([$hash]);
        } catch (Throwable $e) { /* non-fatal */ }
    }

    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    setcookie(DROPCARS_REMEMBER_COOKIE, '', [
        'expires'  => time() - 86400,
        'path'     => '/admin',
        'domain'   => '',
        'secure'   => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

/**
 * Revoke ALL persistent tokens for an admin (used by "Logout all devices").
 */
function dropcars_revoke_all_remember_tokens(PDO $pdo, int $adminId): void
{
    try {
        dropcars_ensure_remember_tokens_table($pdo);
        $pdo->prepare("DELETE FROM `admin_remember_tokens` WHERE `admin_id` = ?")
            ->execute([$adminId]);
    } catch (Throwable $e) { /* non-fatal */ }
}
