<?php
date_default_timezone_set('Asia/Kolkata');
header('Content-Type: application/json');
if (session_status() === PHP_SESSION_NONE) {
    require_once __DIR__ . '/../config/session.php';
    session_start();
}
if (!defined('DROP_CARS_DB_OPTIONAL')) {
    define('DROP_CARS_DB_OPTIONAL', true);
}
require_once __DIR__ . '/../admin/config/database.php';

$code = $_POST['code'] ?? '';
$base_fare = $_POST['base_fare'] ?? 0;

if (!$code) {
    echo json_encode(['success' => false, 'message' => 'No coupon code provided.']);
    exit;
}

if (!isset($pdo) || !($pdo instanceof PDO)) {
    echo json_encode(['success' => false, 'message' => 'Coupons unavailable right now.']);
    exit;
}

$currentPhone = $_SESSION['customer_phone'] ?? '';
$currentEmail = $_SESSION['customer_email'] ?? '';

// Require Login for Promo Codes
if (!$currentPhone && !$currentEmail) {
    // Save the coupon so it can auto-fill on registration
    $_SESSION['pending_referral'] = strtoupper(trim($code));
    echo json_encode([
        'success' => false,
        'message' => 'Please log in or register to apply promo codes.',
        'require_login' => true
    ]);
    exit;
}

$code = strtoupper(trim($code));
$stmt = $pdo->prepare("SELECT * FROM `coupons` WHERE `code` = ? AND `is_active` = 1 AND (`expiry_date` IS NULL OR `expiry_date` >= CURDATE())");
$stmt->execute([$code]);
$coupon = $stmt->fetch();

$discount = 0;
if ($coupon) {
    // Check trip type applicability
    $trip_type = trim((string)($_POST['trip_type'] ?? ''));
    $apply_to = $coupon['apply_to_trip_type'] ?? 'all';
    if ($apply_to !== 'all' && $trip_type !== '' && strtolower($apply_to) !== strtolower($trip_type)) {
        $tripLabel = str_replace('_', ' ', $apply_to);
        echo json_encode([
            'success' => false,
            'message' => "This coupon is only applicable for " . ucwords($tripLabel) . " journeys."
        ]);
        exit;
    }

    // Check minimum booking amount
    $min_amt = (float)($coupon['min_booking_amount'] ?? 0);
    if ($min_amt > 0 && (float)$base_fare < $min_amt) {
        echo json_encode([
            'success' => false,
            'message' => "Minimum booking amount of ₹" . $min_amt . " is required for this coupon."
        ]);
        exit;
    }

    $dtype = $coupon['discount_type'] ?? $coupon['type'] ?? 'flat';
    $dval = isset($coupon['discount_value']) ? (float) $coupon['discount_value'] : (float) ($coupon['value'] ?? 0);
    if ($dtype === 'percentage') {
        $discount = ((float) $base_fare * $dval) / 100;
    } else {
        $discount = $dval;
    }
} else {
    echo json_encode(['success' => false, 'message' => 'Invalid or expired coupon code.']);
    exit;
}

echo json_encode([
    'success' => true,
    'discount_amount' => round($discount),
    'final_fare' => round($base_fare - $discount)
]);
