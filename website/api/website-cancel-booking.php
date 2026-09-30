<?php
/**
 * api/website-cancel-booking.php
 *
 * Customer-initiated cancel from the website (track-booking.php /
 * thank-you.php). Two-step OTP flow proxied straight through to the
 * backend (dropcars-review/backend/app/api/routes/website_bookings.py) -
 * this file does no cancellation logic itself, it only looks up the
 * backend_request_id for the given website booking_id and forwards the
 * call, same pattern as api/confirm_booking.php's posting step.
 *
 * POST body: { "action": "request_otp" | "confirm_cancel", "booking_id": "...", "otp": "..." (confirm_cancel only) }
 */

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
    exit;
}

require_once __DIR__ . '/includes/backend-client.php';

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    $input = $_POST;
}

$action = trim((string) ($input['action'] ?? ''));
$bookingId = trim((string) ($input['booking_id'] ?? ''));

if ($bookingId === '' || !in_array($action, ['request_otp', 'confirm_cancel', 'request_refund'], true)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'booking_id and a valid action are required']);
    exit;
}

if (!defined('DROP_CARS_DB_OPTIONAL')) {
    define('DROP_CARS_DB_OPTIONAL', true);
}
require_once __DIR__ . '/../admin/config/database.php';

if (!isset($pdo) || !($pdo instanceof PDO)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'message' => 'Database temporarily unavailable']);
    exit;
}

$stmt = $pdo->prepare("SELECT `backend_request_id`, `status` FROM `bookings` WHERE `booking_id` = ? LIMIT 1");
$stmt->execute([$bookingId]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$row || empty($row['backend_request_id'])) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'Booking not found or not yet posted for processing. Please call support to cancel.']);
    exit;
}

$backendRequestId = $row['backend_request_id'];

if ($action === 'request_otp') {
    $result = dropcars_backend_request('POST', '/api/website/bookings/' . urlencode($backendRequestId) . '/request-cancel-otp');
    if ($result['ok']) {
        echo json_encode(['success' => true, 'message' => 'A verification code has been emailed to you. It expires in 10 minutes.']);
    } else {
        http_response_code($result['status'] ?: 500);
        echo json_encode(['success' => false, 'message' => $result['error'] ?: 'Could not send verification code. Please try again or call support.']);
    }
    exit;
}

if ($action === 'request_refund') {
    $result = dropcars_backend_request('POST', '/api/website/bookings/' . urlencode($backendRequestId) . '/request-refund');
    if ($result['ok'] && is_array($result['data'])) {
        echo json_encode(['success' => true, 'message' => $result['data']['message'] ?? 'Your refund has been requested. It will be processed within 1-5 working days.']);
    } else {
        http_response_code($result['status'] ?: 400);
        echo json_encode(['success' => false, 'message' => $result['error'] ?: 'Could not request a refund for this booking.']);
    }
    exit;
}

// confirm_cancel
$otp = trim((string) ($input['otp'] ?? ''));
if ($otp === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Please enter the verification code sent to your email']);
    exit;
}

$result = dropcars_backend_request('POST', '/api/website/bookings/' . urlencode($backendRequestId) . '/confirm-cancel', ['otp' => $otp]);
if ($result['ok'] && is_array($result['data'])) {
    $refundEligible = !empty($result['data']['refund_eligible']);
    // Mirror the cancellation into the website's own bookings row too, so
    // thank-you.php/track-booking.php reflect it immediately even before
    // the backend's own status webhook round-trips back.
    $pdo->prepare("UPDATE `bookings` SET `status` = 'cancelled' WHERE `booking_id` = ?")->execute([$bookingId]);
    echo json_encode([
        'success' => true,
        'refund_eligible' => $refundEligible,
        'message' => $refundEligible
            ? 'Your booking has been cancelled. Your advance is eligible for a full refund - you can request it from your booking page.'
            : 'Your booking has been cancelled. As a driver had already been assigned, this booking is not eligible for a refund.',
    ]);
} else {
    http_response_code($result['status'] ?: 400);
    echo json_encode(['success' => false, 'message' => $result['error'] ?: 'Could not cancel this booking. Please check your code and try again.']);
}
