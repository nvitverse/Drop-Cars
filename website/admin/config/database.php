<?php
date_default_timezone_set('Asia/Kolkata');
/**
 * Database connection for Drop Cars Admin
 * Set DB_HOST, DB_NAME, DB_USER, DB_PASS via env, secret.php, ../database.local.php (outside public_html), or admin/config/database.local.php (localhost only).
 */

if (!function_exists('dropcars_get_db')) {
    function dropcars_get_db(): ?PDO {
        if (!empty($GLOBALS['db']) && $GLOBALS['db'] instanceof PDO) {
            return $GLOBALS['db'];
        }
        $dbHost = getenv('DB_HOST') ?: 'localhost';
        $dbName = getenv('DB_NAME') ?: 'u137408789_dropcars';
        $dbUser = getenv('DB_USER') ?: 'u137408789_dropcars';
        $dbPass = getenv('DB_PASS') ?: 'dropcarsDB12';
        $dbPort = getenv('DB_PORT');

        $externalSecretsCandidates = [
            getenv('DROP_CARS_SECRETS_FILE'),
            dirname(__DIR__, 4) . '/database.local.php',
            dirname(__DIR__, 3) . '/database.local.php',
            dirname(__DIR__, 2) . '/database.local.php',
            dirname(__DIR__, 4) . '/secret.php',
            dirname(__DIR__, 3) . '/secret.php',
            dirname(__DIR__, 2) . '/secret.php',
            dirname(__DIR__) . '/secret.php',
            __DIR__ . '/secret.php',
            __DIR__ . '/database.local.php',
        ];

        foreach ($externalSecretsCandidates as $externalSecretsFile) {
            if ($externalSecretsFile && is_file($externalSecretsFile)) {
                $external = include $externalSecretsFile;
                if (is_array($external)) {
                    $dbHost = $external['DB_HOST'] ?? $external['host'] ?? $dbHost;
                    $dbName = $external['DB_NAME'] ?? $external['name'] ?? $dbName;
                    $dbUser = $external['DB_USER'] ?? $external['user'] ?? $dbUser;
                    $dbPass = $external['DB_PASS'] ?? $external['pass'] ?? $dbPass;
                    if (isset($external['DB_PORT']) && $external['DB_PORT'] !== '') {
                        $dbPort = (int) $external['DB_PORT'];
                    } elseif (isset($external['port']) && $external['port'] !== '') {
                        $dbPort = (int) $external['port'];
                    }
                    break;
                }
            }
        }

        $appEnv = strtolower((string) (getenv('APP_ENV') ?: ''));
        $serverName = strtolower((string) ($_SERVER['SERVER_NAME'] ?? ''));
        $isPhpBuiltIn = (php_sapi_name() === 'cli-server');
        $isCli = (php_sapi_name() === 'cli');
        $isLocalHost = $isPhpBuiltIn || $isCli || in_array($serverName, ['localhost', '127.0.0.1', '::1'], true);
        if ($isLocalHost) {
            $localFile = __DIR__ . '/database.local.php';
            if (!is_file($localFile)) {
                $workspaceLocalFile = dirname(__DIR__, 3) . '/admin/config/database.local.php';
                if (is_file($workspaceLocalFile)) {
                    $localFile = $workspaceLocalFile;
                }
            }
            if (is_file($localFile)) {
                $local = include $localFile;
                if (is_array($local)) {
                    $dbHost = $local['host'] ?? $dbHost;
                    $dbName = $local['name'] ?? $dbName;
                    $dbUser = $local['user'] ?? $dbUser;
                    $dbPass = $local['pass'] ?? $dbPass;
                    if (isset($local['port']) && $local['port'] !== '') {
                        $dbPort = (int) $local['port'];
                    }
                }
            }
        }

        $dsn = !empty($dbPort)
            ? "mysql:host={$dbHost};port={$dbPort};dbname={$dbName};charset=utf8mb4"
            : "mysql:host={$dbHost};dbname={$dbName};charset=utf8mb4";

        try {
            $pdoInstance = new PDO(
                $dsn,
                $dbUser,
                $dbPass,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ]
            );
            $pdoInstance->exec("SET time_zone = '+05:30'");
            $GLOBALS['db'] = $pdoInstance;
            return $pdoInstance;
        } catch (Throwable $e) {
            error_log('[dropcars] dropcars_get_db error: ' . $e->getMessage());
            return null;
        }
    }
}

$dbHost = getenv('DB_HOST') ?: 'localhost';
$dbName = getenv('DB_NAME') ?: 'u137408789_dropcars';
$dbUser = getenv('DB_USER') ?: 'u137408789_dropcars';
$dbPass = getenv('DB_PASS') ?: 'dropcarsDB12';
$dbPort = getenv('DB_PORT');

// Hostinger / production: check candidate paths for database.local.php and secret.php
$externalSecretsCandidates = [];
$envSecretFile = getenv('DROP_CARS_SECRETS_FILE');
if ($envSecretFile) {
    $externalSecretsCandidates[] = $envSecretFile;
}
$externalSecretsCandidates[] = dirname(__DIR__, 4) . '/database.local.php';
$externalSecretsCandidates[] = dirname(__DIR__, 3) . '/database.local.php';
$externalSecretsCandidates[] = dirname(__DIR__, 2) . '/database.local.php';
$externalSecretsCandidates[] = dirname(__DIR__, 4) . '/secret.php';
$externalSecretsCandidates[] = dirname(__DIR__, 3) . '/secret.php';
$externalSecretsCandidates[] = dirname(__DIR__, 2) . '/secret.php';
$externalSecretsCandidates[] = dirname(__DIR__) . '/secret.php';
$externalSecretsCandidates[] = __DIR__ . '/secret.php';
$externalSecretsCandidates[] = __DIR__ . '/database.local.php';

foreach ($externalSecretsCandidates as $externalSecretsFile) {
    if (is_file($externalSecretsFile)) {
        $external = include $externalSecretsFile;
        if (is_array($external)) {
            $dbHost = $external['DB_HOST'] ?? $external['host'] ?? $dbHost;
            $dbName = $external['DB_NAME'] ?? $external['name'] ?? $dbName;
            $dbUser = $external['DB_USER'] ?? $external['user'] ?? $dbUser;
            $dbPass = $external['DB_PASS'] ?? $external['pass'] ?? $dbPass;
            if (isset($external['DB_PORT']) && $external['DB_PORT'] !== '') {
                $dbPort = (int) $external['DB_PORT'];
            } elseif (isset($external['port']) && $external['port'] !== '') {
                $dbPort = (int) $external['port'];
            }
            break;
        }
    }
}

if ($dbPort !== false && $dbPort !== '' && $dbPort !== null) {
    $dbPort = (int) $dbPort;
} else {
    $dbPort = null;
}

// Prevent accidental production override from local credential files.
$appEnv = strtolower((string) (getenv('APP_ENV') ?: ''));
$serverName = strtolower((string) ($_SERVER['SERVER_NAME'] ?? ''));
$isPhpBuiltIn = (php_sapi_name() === 'cli-server');
$isCli = (php_sapi_name() === 'cli');
$isLocalHost = $isPhpBuiltIn
    || $isCli
    || in_array($serverName, ['localhost', '127.0.0.1', '::1'], true);
$allowLocalOverride = ($isCli || $isLocalHost);
$showDevDbHints = $isLocalHost && strtolower((string) (getenv('APP_ENV') ?: '')) !== 'production';

$localFile = __DIR__ . '/database.local.php';
if ($allowLocalOverride) {
    if (!is_file($localFile)) {
        // Look in the workspace root source folder if running on localhost!
        $workspaceLocalFile = dirname(__DIR__, 3) . '/admin/config/database.local.php';
        if (is_file($workspaceLocalFile)) {
            $localFile = $workspaceLocalFile;
        }
    }
    if (is_file($localFile)) {
        $local = include $localFile;
        if (is_array($local)) {
            $dbHost = $local['host'] ?? $dbHost;
            $dbName = $local['name'] ?? $dbName;
            $dbUser = $local['user'] ?? $dbUser;
            $dbPass = $local['pass'] ?? $dbPass;
            if (isset($local['port']) && $local['port'] !== '') {
                $dbPort = (int) $local['port'];
            }
        }
    }
}

if ($dbName === '' || $dbUser === '' || (!$isLocalHost && $dbPass === '')) {
    if (defined('DROP_CARS_DB_OPTIONAL') && DROP_CARS_DB_OPTIONAL) {
        $pdo = null;
        $GLOBALS['db'] = $pdo;
        return;
    }
    if (php_sapi_name() === 'cli') {
        die("Database credentials are missing.\n");
    }
    if (headers_sent()) {
        error_log('[dropcars] Database credentials missing; continuing with null PDO (headers already sent).');
        $pdo = null;
        $GLOBALS['db'] = $pdo;
        return;
    }
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    if ($showDevDbHints) {
        echo "Database credentials are missing.\n\n";
        echo 'Copy admin/config/database.example.php to admin/config/database.local.php and set host, name, user, pass.';
    } else {
        echo 'Database connection failed.';
    }
    exit;
}

$dsn = $dbPort
    ? "mysql:host={$dbHost};port={$dbPort};dbname={$dbName};charset=utf8mb4"
    : "mysql:host={$dbHost};dbname={$dbName};charset=utf8mb4";

$pdo = null;

try {
    $pdo = new PDO(
        $dsn,
        $dbUser,
        $dbPass,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
    $pdo->exec("SET time_zone = '+05:30'");
} catch (PDOException $e) {
    if (defined('DROP_CARS_DB_OPTIONAL') && DROP_CARS_DB_OPTIONAL) {
        $pdo = null;
    } elseif (php_sapi_name() === 'cli') {
        die('Database connection failed: ' . $e->getMessage() . "\n");
    } elseif (headers_sent()) {
        error_log('[dropcars] DB connection failed mid-render: ' . $e->getMessage());
        $pdo = null;
    } else {
        http_response_code(500);
        header('Content-Type: text/plain; charset=utf-8');
        if ($showDevDbHints) {
            echo "Database connection failed.\n\n";
            echo $e->getMessage() . "\n\n";
        } else {
            echo 'Database connection failed.';
        }
        exit;
    }
}

if ($pdo && (!defined('DROP_CARS_SKIP_ENQUIRIES_SCHEMA') || !DROP_CARS_SKIP_ENQUIRIES_SCHEMA)) {
    $schemaFile = __DIR__ . '/../includes/enquiries-schema.php';
    if (is_file($schemaFile)) {
        require_once $schemaFile;
        if (function_exists('dropcars_ensure_enquiries_booking_id_column')) {
            dropcars_ensure_enquiries_booking_id_column($pdo);
        } elseif (function_exists('dropcars_ensure_enquiries_columns')) {
            dropcars_ensure_enquiries_columns($pdo);
        }
    }
}

// ── Auto-seed: ensure the admins table exists and always has at least one account ──
// Runs silently on every admin request. No manual init, no file deletion, no phpMyAdmin needed.
if ($pdo) {
    try {
        // 1. Ensure the admins table exists (safe CREATE IF NOT EXISTS)
        $pdo->exec("CREATE TABLE IF NOT EXISTS `admins` (
            `id`                       INT UNSIGNED NOT NULL AUTO_INCREMENT,
            `name`                     VARCHAR(255) NOT NULL DEFAULT 'Admin',
            `username`                 VARCHAR(64)  NULL,
            `email`                    VARCHAR(191) NULL,
            `password`                 VARCHAR(255) NOT NULL,
            `role`                     VARCHAR(32)  NOT NULL DEFAULT 'staff',
            `password_must_change`     TINYINT(1)   NOT NULL DEFAULT 0,
            `temporary_password_set_at` DATETIME    NULL DEFAULT NULL,
            `created_at`               TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            UNIQUE KEY `username` (`username`),
            UNIQUE KEY `email` (`email`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        // 1b. Run migrations for existing databases
        try {
            $stmtCol = $pdo->query("SHOW COLUMNS FROM `admins` LIKE 'username'");
            if (!$stmtCol->fetch()) {
                $pdo->exec("ALTER TABLE `admins` ADD COLUMN `username` VARCHAR(64) NULL AFTER `name`");
                $pdo->exec("ALTER TABLE `admins` ADD UNIQUE KEY `username` (`username`)");
                $pdo->exec("UPDATE `admins` SET `username` = 'admin' WHERE `email` = 'admin@dropcars.in'");
            }
        } catch (Throwable $e) {}

        try {
            $stmtCol = $pdo->query("SHOW COLUMNS FROM `admins` LIKE 'role'");
            if (!$stmtCol->fetch()) {
                $pdo->exec("ALTER TABLE `admins` ADD COLUMN `role` VARCHAR(32) NOT NULL DEFAULT 'staff' AFTER `password`");
                $pdo->exec("UPDATE `admins` SET `role` = 'admin' WHERE `email` = 'admin@dropcars.in' OR `username` = 'admin'");
            }
        } catch (Throwable $e) {}

        try {
            $pdo->exec("ALTER TABLE `admins` MODIFY COLUMN `email` VARCHAR(191) NULL");
        } catch (Throwable $e) {}

        try {
            $stmtCol = $pdo->query("SHOW COLUMNS FROM `enquiries` LIKE 'responded_by'");
            if (!$stmtCol->fetch()) {
                $pdo->exec("ALTER TABLE `enquiries` ADD COLUMN `responded_by` VARCHAR(255) NULL AFTER `status`");
            }
        } catch (Throwable $e) {}

        try {
            $stmtCol = $pdo->query("SHOW COLUMNS FROM `bookings` LIKE 'responded_by'");
            if (!$stmtCol->fetch()) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `responded_by` VARCHAR(255) NULL AFTER `status`");
            }
        } catch (Throwable $e) {}

        // Live-tracking mirror columns - populated by api/website-status-webhook.php's
        // LOCATION_UPDATE pushes from the backend's driver-trip-link feature
        // (see api/routes/website_bookings.py's /website/trip-link/{token}/location),
        // read by pages/track-booking.php.
        try {
            $stmtCol = $pdo->query("SHOW COLUMNS FROM `bookings` LIKE 'last_lat'");
            if (!$stmtCol->fetch()) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `last_lat` VARCHAR(32) NULL, ADD COLUMN `last_lng` VARCHAR(32) NULL, ADD COLUMN `last_location_at` DATETIME NULL");
            }
        } catch (Throwable $e) {}

        try {
            $stmtCol = $pdo->query("SHOW COLUMNS FROM `bookings` LIKE 'tracking_left_at'");
            if (!$stmtCol->fetch()) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `tracking_left_at` DATETIME NULL");
            }
        } catch (Throwable $e) {}

        // 2. Also ensure password_resets table exists (needed by forgot-password)
        $pdo->exec("CREATE TABLE IF NOT EXISTS `password_resets` (
            `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
            `email`      VARCHAR(255) NOT NULL,
            `token`      VARCHAR(255) NOT NULL,
            `expires_at` DATETIME    NOT NULL,
            PRIMARY KEY (`id`),
            KEY `idx_email` (`email`),
            KEY `idx_token` (`token`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        // 3. If NO admin exists at all, insert the default account automatically
        $adminCount = (int) $pdo->query("SELECT COUNT(*) FROM `admins`")->fetchColumn();
        if ($adminCount === 0) {
            $defaultEmail = 'admin@dropcars.in';
            $defaultPass  = password_hash('admin@dc', PASSWORD_DEFAULT);
            $pdo->prepare("INSERT INTO `admins` (`name`, `username`, `email`, `password`, `role`) VALUES ('Admin', 'admin', ?, ?, 'admin')")
                ->execute([$defaultEmail, $defaultPass]);
            error_log('[dropcars] Auto-seeded default admin account: ' . $defaultEmail);
        }
    } catch (Throwable $e) {
        // Non-fatal — log silently, never break the page
        error_log('[dropcars] Auto-seed error: ' . $e->getMessage());
    }
}

$GLOBALS['db'] = $pdo;
