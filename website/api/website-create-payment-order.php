<?php
/**
 * api/website-create-payment-order.php
 *
 * Creates a Razorpay order for the urgent-booking 15% advance, proxied
 * straight through to the backend (dropcars-review/backend/app/api/routes/
 * website_bookings.py's POST /website/payments/create-order) - same
 * Razorpay account/credentials as the Driver/Vendor apps, just a
 * different order. The website's booking-form JS calls this first, opens
 * Razorpay Checkout with the returned order_id + key_id, then submits the
 * resulting rp_order_id/rp_payment_id/rp_signature via confirm_booking.php.
 *
 * POST body: { "amount_rupees": 1500, "notes": { "pickup": "...", ... } }
 */

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
    exit;
}

require_once __DIR__ . '/includes/backend-client.php';
require_once __DIR__ . '/../config/security.php';
dropcars_rate_limit('api_create_payment_order', 15, 60);

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    $input = $_POST;
}

$amountRupees = (int) ($input['amount_rupees'] ?? 0);
if ($amountRupees <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'A valid advance amount is required']);
    exit;
}

$notes = [];
if (isset($input['notes']) && is_array($input['notes'])) {
    foreach ($input['notes'] as $k => $v) {
        $notes[(string) $k] = (string) $v;
    }
}

$result = dropcars_backend_request('POST', '/api/website/payments/create-order', [
    'amount_rupees' => $amountRupees,
    'notes' => $notes,
]);

if ($result['ok'] && is_array($result['data'])) {
    echo json_encode([
        'success' => true,
        'razorpay_order_id' => $result['data']['razorpay_order_id'] ?? null,
        'amount_paise' => $result['data']['amount_paise'] ?? null,
        'currency' => $result['data']['currency'] ?? 'INR',
        'key_id' => $result['data']['key_id'] ?? null,
    ]);
} else {
    http_response_code($result['status'] ?: 500);
    echo json_encode(['success' => false, 'message' => $result['error'] ?: 'Could not start the payment. Please try again.']);
}
