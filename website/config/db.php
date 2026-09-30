<?php
date_default_timezone_set('Asia/Kolkata');
/**
 * Database Connection - Drop Cars
 * SECURE: This file must be outside public_html. Never expose credentials.
 * Uses environment variables or local config override.
 */

defined('DROP_CARS_SAFE') || define('DROP_CARS_SAFE', true);

$dbHost = getenv('DB_HOST') ?: 'localhost';
$dbName = getenv('DB_NAME') ?: 'u137408789_dropcars';
$dbUser = getenv('DB_USER') ?: 'u137408789_dropcars';
$dbPass = getenv('DB_PASS') ?: 'dropcarsDB12';
$dbCharset = 'utf8mb4';

// Hostinger / production: candidate credentials files
$externalSecretsCandidates = [];
$envSecretFile = getenv('DROP_CARS_SECRETS_FILE');
if ($envSecretFile) {
    $externalSecretsCandidates[] = $envSecretFile;
}
$externalSecretsCandidates[] = dirname(__DIR__, 3) . '/database.local.php';
$externalSecretsCandidates[] = dirname(__DIR__, 2) . '/database.local.php';
$externalSecretsCandidates[] = dirname(__DIR__, 3) . '/secret.php';
$externalSecretsCandidates[] = dirname(__DIR__, 2) . '/secret.php';
$externalSecretsCandidates[] = dirname(__DIR__) . '/secret.php';
$externalSecretsCandidates[] = __DIR__ . '/secret.php';

foreach ($externalSecretsCandidates as $externalSecretsFile) {
    if (is_file($externalSecretsFile)) {
        $external = include $externalSecretsFile;
        if (is_array($external)) {
            $dbHost = $external['DB_HOST'] ?? $external['host'] ?? $dbHost;
            $dbName = $external['DB_NAME'] ?? $external['name'] ?? $dbName;
            $dbUser = $external['DB_USER'] ?? $external['user'] ?? $dbUser;
            $dbPass = $external['DB_PASS'] ?? $external['pass'] ?? $dbPass;
            break;
        }
    }
}

// Prevent accidental production override from local credential files.
$appEnv = strtolower((string) (getenv('APP_ENV') ?: ''));
$serverName = strtolower((string) ($_SERVER['SERVER_NAME'] ?? ''));
$isPhpBuiltIn = (php_sapi_name() === 'cli-server');
$isLocalHost = $isPhpBuiltIn
    || in_array($serverName, ['localhost', '127.0.0.1', '::1'], true);
$isCli = (php_sapi_name() === 'cli');
$allowLocalOverride = ($isCli || $isLocalHost);

$localFile = __DIR__ . '/db.local.php';
if ($allowLocalOverride && is_file($localFile)) {
    $local = include $localFile;
    if (is_array($local)) {
        $dbHost = $local['host'] ?? $dbHost;
        $dbName = $local['name'] ?? $dbName;
        $dbUser = $local['user'] ?? $dbUser;
        $dbPass = $local['pass'] ?? $dbPass;
    }
} elseif ($allowLocalOverride) {
    $adminLocal = dirname(__DIR__) . '/admin/config/database.local.php';
    if (!is_file($adminLocal)) {
        // Look in source folder if deleted from public_html on localhost
        $workspaceAdminLocal = dirname(__DIR__, 2) . '/admin/config/database.local.php';
        if (is_file($workspaceAdminLocal)) {
            $adminLocal = $workspaceAdminLocal;
        }
    }
    if (is_file($adminLocal)) {
        $local = include $adminLocal;
        if (is_array($local)) {
            $dbHost = $local['host'] ?? $dbHost;
            $dbName = $local['name'] ?? $dbName;
            $dbUser = $local['user'] ?? $dbUser;
            $dbPass = $local['pass'] ?? $dbPass;
        }
    }
}

if ($dbName === '' || $dbUser === '' || (!$isLocalHost && $dbPass === '')) {
    if (php_sapi_name() === 'cli') {
        die("Database credentials are missing.\n");
    }
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Service temporarily unavailable.';
    exit;
}

try {
    $pdo = new PDO(
        "mysql:host={$dbHost};dbname={$dbName};charset={$dbCharset}",
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
    if (php_sapi_name() === 'cli') {
        die("Database connection failed: " . $e->getMessage() . "\n");
    }
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Service temporarily unavailable.';
    exit;
}
