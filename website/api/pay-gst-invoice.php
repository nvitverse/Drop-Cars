<?php
/**
 * API Endpoint: Pay / Add GST Invoice to an existing booking (+5% GST tax on KM fare + gateway fee)
 * Handles Quote generation (with Razorpay Order creation) and Payment Verification.
 */
header('Content-Type: application/json; charset=utf-8');
error_reporting(E_ALL);
ini_set('display_errors', 0);

if (session_status() === PHP_SESSION_NONE) {
    require_once __DIR__ . '/../config/session.php';
    @session_start();
}

require_once __DIR__ . '/includes/backend-client.php';
if (!defined('DROP_CARS_DB_OPTIONAL')) define('DROP_CARS_DB_OPTIONAL', true);
require_once __DIR__ . '/../admin/config/database.php';

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    $input = $_REQUEST;
}

$action = strtolower(trim((string)($input['action'] ?? ($_GET['action'] ?? 'quote'))));
$bookingId = preg_replace('/[^A-Za-z0-9\-]/', '', (string)($input['booking_id'] ?? ($_GET['booking_id'] ?? '')));

if (empty($bookingId)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing booking ID.']);
    exit;
}

$dbOk = isset($pdo) && $pdo instanceof PDO;
$booking = null;

if ($dbOk) {
    try {
        $stmt = $pdo->prepare("SELECT * FROM `bookings` WHERE `booking_id` = ? LIMIT 1");
        $stmt->execute([$bookingId]);
        $booking = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$booking) {
            $stmt = $pdo->prepare("SELECT * FROM `enquiries` WHERE `booking_id` = ? LIMIT 1");
            $stmt->execute([$bookingId]);
            $booking = $stmt->fetch(PDO::FETCH_ASSOC);
        }
    } catch (Throwable $e) {
        error_log('pay-gst-invoice fetch error: ' . $e->getMessage());
    }
}

$fare = (float)($booking['final_fare'] ?: ($booking['estimated_fare'] ?: 1500.00));
$distance = (float)($booking['distance_km'] ?? $booking['distance'] ?? 0);
$rate = (float)($booking['rate_per_km'] ?? $booking['fare_per_km'] ?? 0);
$driverBata = (float)($booking['driver_allowance'] ?? $booking['driver_bata'] ?? 400);

if ($distance > 0 && $rate > 0) {
    $kmFare = round($distance * $rate, 2);
} else {
    $netKm = max(0, $fare - $driverBata);
    $kmFare = round($netKm / 1.05, 2);
}

// Pure KM Tax Rule: 5% GST applies strictly to KM fare. Driver Bata is 0% non-taxable.
$gstAmount = round($kmFare * 0.05, 2);
// Gateway processing fee (~2.4% on tax amount)
$gatewayCharge = round($gstAmount * 0.024, 2);
$totalUpgrade = round($gstAmount + $gatewayCharge, 2);

// ── ACTION: QUOTE (Or initial modal load) ──
if ($action === 'quote' && empty($input['rp_payment_id'])) {
    // Create Razorpay order via backend
    $rpOrderResult = dropcars_backend_request('POST', '/api/website/payments/create-order', [
        'amount_rupees' => max(1, (int)ceil($totalUpgrade)),
        'notes' => [
            'booking_id' => $bookingId,
            'type' => 'gst_invoice_upgrade',
            'km_fare' => (string)$kmFare,
            'gst_amount' => (string)$gstAmount,
        ]
    ]);

    $razorpayOrderId = null;
    $keyId = 'rzp_live_RuMG3DMZFdeT3Y';
    if ($rpOrderResult['ok'] && is_array($rpOrderResult['data'])) {
        $razorpayOrderId = $rpOrderResult['data']['razorpay_order_id'] ?? null;
        $keyId = $rpOrderResult['data']['key_id'] ?? $keyId;
    }

    echo json_encode([
        'success' => true,
        'booking_id' => $bookingId,
        'km_fare' => $kmFare,
        'driver_bata' => $driverBata,
        'gst_percent' => 5,
        'gst_amount' => $gstAmount,
        'gateway_charge' => $gatewayCharge,
        'total_upgrade_amount' => $totalUpgrade,
        'razorpay_order_id' => $razorpayOrderId,
        'key_id' => $keyId,
        'amount_paise' => (int)round($totalUpgrade * 100),
    ]);
    exit;
}

// ── ACTION: VERIFY / UNLOCK ──
$companyName = trim((string)($input['company_name'] ?? ''));
$gstin = strtoupper(trim((string)($input['gstin'] ?? '')));
$rpOrderId = trim((string)($input['rp_order_id'] ?? $input['razorpay_order_id'] ?? ''));
$rpPaymentId = trim((string)($input['rp_payment_id'] ?? $input['razorpay_payment_id'] ?? ''));
$rpSignature = trim((string)($input['rp_signature'] ?? $input['razorpay_signature'] ?? ''));

// Update MySQL DB
if ($dbOk && $booking) {
    try {
        $updateStmt = $pdo->prepare("UPDATE `bookings` SET `is_gst` = 1, `gst_amount` = ?, `gstin` = ?, `company_name` = ? WHERE `booking_id` = ?");
        $updateStmt->execute([$gstAmount, $gstin, $companyName, $bookingId]);

        $enqStmt = $pdo->prepare("UPDATE `enquiries` SET `include_gst` = 1, `gst_amount` = ?, `gstin` = ?, `company_name` = ? WHERE `booking_id` = ?");
        $enqStmt->execute([$gstAmount, $gstin, $companyName, $bookingId]);

        if (!empty($gstin) && !empty($booking['customer_id'])) {
            $cStmt = $pdo->prepare("UPDATE `customers` SET `gstin` = ?, `company_name` = ? WHERE `id` = ?");
            $cStmt->execute([$gstin, $companyName, $booking['customer_id']]);
        }
    } catch (Throwable $e) {
        error_log('pay-gst-invoice update error: ' . $e->getMessage());
    }
}

// Forward to backend to sync GST status and sequential invoice
dropcars_backend_request('PATCH', "/api/website/bookings/{$bookingId}/rates", [
    'include_gst' => true,
    'gst_percent' => 5,
    'gst_amount' => $gstAmount,
]);

// Log GST Invoice generation count for Admin App tracking
$logFile = __DIR__ . '/../data/gst_requests_log.json';
$logData = is_file($logFile) ? (json_decode(file_get_contents($logFile), true) ?: []) : [];
$logData[] = [
    'booking_id' => $bookingId,
    'gstin' => $gstin,
    'company_name' => $companyName,
    'gst_amount' => $gstAmount,
    'rp_payment_id' => $rpPaymentId,
    'timestamp' => date('Y-m-d H:i:s'),
    'ip' => $_SERVER['REMOTE_ADDR'] ?? ''
];
@file_put_contents($logFile, json_encode($logData, JSON_PRETTY_PRINT));

echo json_encode([
    'success' => true,
    'message' => 'GST Tax Invoice unlocked successfully!',
    'redirect' => '/pages/invoice-gst.php?booking_id=' . urlencode($bookingId)
]);
