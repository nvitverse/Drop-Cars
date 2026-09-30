<?php
/**
 * Switch Active Website Action
 */

// Isolated session save path to match admin/index.php session settings
$adminSessionSavePath = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'tmp' . DIRECTORY_SEPARATOR . 'sessions';
if (is_dir($adminSessionSavePath) && is_writable($adminSessionSavePath)) {
    session_save_path($adminSessionSavePath);
}

require_once __DIR__ . '/../../api/config.php';
// Use same session name as defined in admin/index.php config or default
$sessionName = 'dropcars_admin_session';
session_name($sessionName);
session_start();

// Simple Auth Check
if (!isset($_SESSION['admin_id'])) {
    header('Location: ../index.php?page=login');
    exit;
}

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/functions.php';

$targetWebsite = isset($_GET['website']) ? trim((string)$_GET['website']) : 'all';

if ($targetWebsite === 'all') {
    $_SESSION['active_website'] = 'all';
} else {
    // Validate target website exists
    $stmt = $pdo->prepare("SELECT slug FROM `registered_sites` WHERE slug = ? LIMIT 1");
    $stmt->execute([$targetWebsite]);
    $site = $stmt->fetch();
    if ($site) {
        $_SESSION['active_website'] = $site['slug'];
    } else {
        $_SESSION['active_website'] = 'all';
    }
}

// Redirect back to referring page, or fall back to dashboard
$referrer = $_SERVER['HTTP_REFERER'] ?? '';
if ($referrer !== '' && strpos($referrer, '/admin/') !== false) {
    // Strip query parameters to avoid page confusion or force refresh
    $redirectUrl = strtok($referrer, '?');
    // If referrer was on settings, it might need to keep settings tab or reset it
    header('Location: ' . $redirectUrl);
} else {
    header('Location: ../index.php?page=dashboard');
}
exit;
