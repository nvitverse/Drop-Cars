<?php
date_default_timezone_set('Asia/Kolkata');
/**
 * Secure Coupon Validation API
 * Returns active coupon metadata for frontend fare calculation
 */
require_once __DIR__ . '/../config/session.php';
session_start();
if (empty($_SESSION['customer_phone']) && empty($_SESSION['customer_email'])) {
    $data = json_decode(file_get_contents('php://input'), true);
    $code = strtoupper(trim($data['code'] ?? ($_POST['code'] ?? '')));
    if ($code) {
        $_SESSION['pending_referral'] = $code;
    }
    echo json_encode(['success' => false, 'message' => 'Please log in or register to apply promo codes.', 'require_login' => true]);
    exit;
}

require_once __DIR__ . '/../config/db.php';

$input = json_encode(file_get_contents('php://input'));
$data = json_decode(file_get_contents('php://input'), true);

$code = strtoupper(trim($data['code'] ?? ''));

if (!$code) {
    echo json_encode(['success' => false, 'message' => 'No code provided']);
    exit;
}

try {
    // 1. First, check generic coupons table
    $stmt = $pdo->prepare("SELECT `code`, `discount_type`, `discount_value`, `apply_to_trip_type`, `min_booking_amount` FROM `coupons` WHERE `code` = ? AND `is_active` = 1 AND `expiry_date` >= CURDATE() LIMIT 1");
    $stmt->execute([$code]);
    $coupon = $stmt->fetch();

    if ($coupon) {
        $trip_type = trim((string)($data['trip_type'] ?? ''));
        $base_fare = (float)($data['base_fare'] ?? 0);

        // Check trip type applicability
        $apply_to = $coupon['apply_to_trip_type'] ?? 'all';
        if ($apply_to !== 'all' && strtolower($apply_to) !== strtolower($trip_type)) {
            $tripLabel = str_replace('_', ' ', $apply_to);
            echo json_encode([
                'success' => false,
                'message' => "This coupon is only applicable for " . ucwords($tripLabel) . " journeys."
            ]);
            exit;
        }

        // Check minimum booking amount
        $min_amt = (float)($coupon['min_booking_amount'] ?? 0);
        if ($min_amt > 0 && $base_fare < $min_amt) {
            echo json_encode([
                'success' => false,
                'message' => "Minimum booking amount of ₹" . $min_amt . " is required for this coupon."
            ]);
            exit;
        }

        echo json_encode([
            'success' => true,
            'type' => $coupon['discount_type'],
            'value' => (float)$coupon['discount_value']
        ]);
        exit;
    }

    echo json_encode(['success' => false, 'message' => 'Invalid or expired coupon']);
} catch (Exception $e) {
    echo json_encode(['success' => false, 'message' => 'Server error']);
}
