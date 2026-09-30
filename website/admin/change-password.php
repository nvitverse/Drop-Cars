<?php
/**
 * Stub: delegates to admin/index.php router so direct .php URLs work with web servers
 * that don't apply admin/.htaccess rewrites (e.g. PHP built-in via different routers,
 * Node-based static servers, antigravity, etc.).
 */
$_GET['page'] = 'change-password';
require __DIR__ . '/index.php';
