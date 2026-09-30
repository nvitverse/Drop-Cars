<?php
/**
 * api/verify_email_otp.php
 * Checks the OTP the customer typed against the one stored in their session.
 *
 * POST params:
 *   otp – the 6-digit code entered by the customer
 */
require_once __DIR__ . '/../config/session.php';
session_start();
header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

if (!defined('DROP_CARS_DB_OPTIONAL')) {
    define('DROP_CARS_DB_OPTIONAL', true);
}
require_once __DIR__ . '/../admin/config/database.php';

$entered = trim((string)($_POST['otp'] ?? ''));

if (!$entered || !preg_match('/^\d{6}$/', $entered)) {
    echo json_encode(['status' => 'error', 'message' => 'Please enter the 6-digit code sent to your email.']);
    exit;
}

// Check session slot exists
$pending = $_SESSION['email_otp'] ?? null;
if (!$pending) {
    echo json_encode(['status' => 'error', 'message' => 'No pending verification found. Please request a new code.']);
    exit;
}

// Check expiry
if (time() > ($pending['expires'] ?? 0)) {
    unset($_SESSION['email_otp']);
    echo json_encode(['status' => 'error', 'message' => 'This code has expired. Please request a new one.']);
    exit;
}

// Check attempt limit (max 5 wrong tries)
$_SESSION['email_otp']['attempts'] = (int)($_SESSION['email_otp']['attempts'] ?? 0) + 1;
if ($_SESSION['email_otp']['attempts'] > 5) {
    unset($_SESSION['email_otp']);
    echo json_encode(['status' => 'error', 'message' => 'Too many failed attempts. Please request a new code.']);
    exit;
}

// Compare
if ($entered !== (string)$pending['otp']) {
    $left = max(0, 5 - $_SESSION['email_otp']['attempts']);
    echo json_encode(['status' => 'error', 'message' => "Incorrect code. {$left} attempt(s) remaining."]);
    exit;
}

// ── OTP is correct — create / update customer record ─────────────────────────
$email = $pending['email'];
$name  = $pending['name']  ?? '';
$phone = $pending['phone'] ?? '';
$cc    = $pending['cc']    ?? '+91';

if ($phone && strpos($phone, '+') !== 0) {
    $phone = $cc . ' ' . $phone;
}

if (!isset($pdo) || !($pdo instanceof PDO)) {
    echo json_encode(['status' => 'error', 'message' => 'Database unavailable. Please try again.']);
    exit;
}

require_once __DIR__ . '/../admin/includes/enquiries-schema.php';
dropcars_ensure_customers_columns($pdo);

$stmt = $pdo->prepare("SELECT * FROM `customers` WHERE `email` = ? OR (`phone` != '' AND `phone` = ?) LIMIT 1");
$stmt->execute([$email, $phone]);
$customer = $stmt->fetch();

if ($customer) {
    $pdo->prepare("UPDATE `customers` SET `email` = ?, `name` = ?, `phone` = ?, `is_verified` = 1 WHERE `id` = ?")
        ->execute([$email, $name ?: $customer['name'], $phone ?: $customer['phone'], $customer['id']]);
} else {
    $pdo->prepare("INSERT INTO `customers` (`name`, `email`, `phone`, `is_verified`) VALUES (?, ?, ?, 1)")
        ->execute([$name ?: 'Customer', $email, $phone]);
}

// Set session
$_SESSION['customer_email'] = $email;
if ($phone) {
    $_SESSION['customer_phone'] = $phone;
}

// Clear OTP slot
unset($_SESSION['email_otp']);

$firstName = $name ? explode(' ', trim($name))[0] : 'Customer';
echo json_encode(['status' => 'verified', 'name' => $firstName]);
