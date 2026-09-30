<?php
/**
 * App config - API secret, etc. Outside public_html.
 */
defined('DROP_CARS_SAFE') || define('DROP_CARS_SAFE', true);

$appFile = __DIR__ . '/app.local.php';
if (is_file($appFile)) {
    $cfg = include $appFile;
    if (isset($cfg['api_secret']) && $cfg['api_secret'] !== '') {
        define('DC_API_SECRET', $cfg['api_secret']);
    }
}
if (!defined('DC_API_SECRET')) {
    define('DC_API_SECRET', getenv('DC_API_SECRET') ?: 'change-me-in-app-local-php');
}
