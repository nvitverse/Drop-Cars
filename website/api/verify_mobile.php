<?php
/**
 * api/verify_mobile.php
 * Admin clicks the WhatsApp verification link → customer is marked verified.
 *
 * GET params:
 *   phone  – the customer's phone (URL-encoded)
 *   token  – HMAC token to prevent tampering
 */
if (!defined('DROP_CARS_DB_OPTIONAL')) {
    define('DROP_CARS_DB_OPTIONAL', true);
}
require_once __DIR__ . '/../admin/config/database.php';

$phone = urldecode(trim((string)($_GET['phone'] ?? '')));
$token = trim((string)($_GET['token'] ?? ''));

// HMAC key: use app password or a fixed secret stored in config
$configPath = __DIR__ . '/config.php';
$siteConfig = is_file($configPath) ? (include $configPath) : [];
$hmacKey    = trim((string)($siteConfig['verifyTokenSecret'] ?? 'dropcars-mobile-verify-2025'));

$expectedToken = hash_hmac('sha256', $phone, $hmacKey);

if (!$phone || !hash_equals($expectedToken, $token)) {
    http_response_code(403);
    echo '<h2 style="font-family:sans-serif;color:#ef4444;">❌ Invalid or expired verification link.</h2>';
    exit;
}

if (!isset($pdo) || !($pdo instanceof PDO)) {
    http_response_code(503);
    echo '<h2 style="font-family:sans-serif;color:#ef4444;">⚠️ Database unavailable.</h2>';
    exit;
}

require_once __DIR__ . '/../admin/includes/enquiries-schema.php';
dropcars_ensure_customers_columns($pdo);

$stmt = $pdo->prepare("SELECT * FROM `customers` WHERE `phone` = ? LIMIT 1");
$stmt->execute([$phone]);
$customer = $stmt->fetch();

if (!$customer) {
    http_response_code(404);
    echo '<h2 style="font-family:sans-serif;color:#94a3b8;">ℹ️ Customer not found in database.</h2>';
    exit;
}

if ($customer['is_verified']) {
    echo '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Already Verified</title>
    <meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
    <body style="font-family:sans-serif;padding:40px;background:#f0fdf4;text-align:center;">
    <div style="max-width:420px;margin:0 auto;background:white;padding:32px;border-radius:20px;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
    <p style="font-size:3rem;margin:0 0 12px;">✅</p>
    <h2 style="color:#166534;margin:0 0 8px;">Already Verified</h2>
    <p style="color:#64748b;">This number <strong>' . htmlspecialchars($phone) . '</strong> is already verified.</p>
    </div></body></html>';
    exit;
}

// Mark verified
$pdo->prepare("UPDATE `customers` SET `is_verified` = 1 WHERE `id` = ?")
    ->execute([$customer['id']]);

echo '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Customer Verified</title>
<meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:\'Inter\',sans-serif;padding:40px;background:#f0fdf4;text-align:center;">
<div style="max-width:420px;margin:0 auto;background:white;padding:32px;border-radius:20px;box-shadow:0 8px 30px rgba(0,0,0,0.08);">
  <p style="font-size:3rem;margin:0 0 12px;">🎉</p>
  <h2 style="color:#166534;margin:0 0 8px;font-size:1.5rem;">Customer Verified!</h2>
  <p style="color:#475569;margin:0 0 6px;"><strong>' . htmlspecialchars($customer['name'] ?: 'Customer') . '</strong></p>
  <p style="color:#64748b;font-size:0.9rem;">' . htmlspecialchars($phone) . '</p>
  <p style="margin-top:20px;color:#64748b;font-size:0.85rem;">The customer can now log in. You can close this page.</p>
</div>
</body></html>';
