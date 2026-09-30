<?php
/**
 * Public Webhook Endpoint to receive leads (enquiries and bookings) from remote websites
 */

header('Content-Type: application/json; charset=utf-8');

// Allow cross-origin requests from other domains
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../admin/includes/functions.php';
require_once __DIR__ . '/booking-persist.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true) ?: [];
$siteSlug = isset($input['website']) ? preg_replace('/[^a-z0-9_]/', '', strtolower(trim((string)$input['website']))) : '';
$leadType = isset($input['lead_type']) ? trim(strtolower((string)$input['lead_type'])) : 'enquiry';
$leadData = isset($input['data']) && is_array($input['data']) ? $input['data'] : [];

if ($siteSlug === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing website parameter']);
    exit;
}

try {
    // Validate site is registered and active
    $stmt = $pdo->prepare("SELECT `slug`, `status`, `api_key` FROM `registered_sites` WHERE `slug` = ? LIMIT 1");
    $stmt->execute([$siteSlug]);
    $site = $stmt->fetch();

    if (!$site) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Website not registered']);
        exit;
    }

    if ($site['status'] !== 'active') {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Website is suspended/inactive']);
        exit;
    }

    // Optional API key validation if provided
    $providedKey = $_SERVER['HTTP_X_DROPCARS_KEY'] ?? $_SERVER['HTTP_X_API_KEY'] ?? $input['api_key'] ?? '';
    if (!empty($providedKey) && !empty($site['api_key'])) {
        if (!hash_equals((string)$site['api_key'], (string)$providedKey)) {
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Invalid API key for this website']);
            exit;
        }
    }

    $ip = trim((string)($leadData['ip_address'] ?? $leadData['ip'] ?? ''));
    if (!$ip) {
        $ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['HTTP_X_REAL_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '';
        $ip = trim(explode(',', $ip)[0] ?? '');
    }

    if ($leadType === 'booking') {
        // Handle Booking Insertion
        $bookingId = trim((string)($leadData['bookingId'] ?? $leadData['booking_id'] ?? ''));
        if ($bookingId === '') {
            $bookingId = 'B' . date('YmdHis') . rand(1000, 9999);
        }

        $customerName = trim((string)($leadData['customerName'] ?? $leadData['name'] ?? 'Guest'));
        $pickup = trim((string)($leadData['pickup'] ?? $leadData['pickup_location'] ?? ''));
        $drop = trim((string)($leadData['drop'] ?? $leadData['drop_location'] ?? ''));
        $bookingType = trim((string)($leadData['bookingType'] ?? $leadData['trip_type'] ?? 'oneway'));
        $vehicleType = trim((string)($leadData['vehicleType'] ?? $leadData['car_name'] ?? ''));
        $fareEstimate = (int)($leadData['fareEstimate'] ?? $leadData['estimated_fare'] ?? 0);
        $travelDate = trim((string)($leadData['travelDate'] ?? $leadData['pickup_date'] ?? ''));
        $travelTime = trim((string)($leadData['travelTime'] ?? $leadData['pickup_time'] ?? ''));
        $distanceKm = (float)($leadData['distanceKm'] ?? $leadData['distance_km'] ?? 0.0);
        $discountAmount = (int)($leadData['discountAmount'] ?? $leadData['discount_amount'] ?? 0);
        $finalFare = isset($leadData['final_fare']) ? (int)$leadData['final_fare'] : null;
        $duration = trim((string)($leadData['duration'] ?? ''));
        $fareType = trim((string)($leadData['fareType'] ?? $leadData['fare_type'] ?? 'exclusive'));
        $status = trim((string)($leadData['status'] ?? 'pending'));
        $usedReferralCode = trim((string)($leadData['used_referral_code'] ?? ''));

        // Save Customer and Booking
        $success = dropcars_persist_confirmation_booking(
            $pdo,
            $leadData,
            $bookingId,
            $customerName,
            $pickup,
            $drop,
            $bookingType,
            $vehicleType,
            $fareEstimate,
            $travelDate,
            $travelTime,
            $distanceKm,
            $discountAmount,
            $finalFare,
            $duration,
            $fareType,
            $status,
            $usedReferralCode
        );

        if ($success) {
            // Update the website column in bookings table since the persistence helper defaults to dropcars
            $up = $pdo->prepare("UPDATE `bookings` SET `website` = ? WHERE `booking_id` = ?");
            $up->execute([$siteSlug, $bookingId]);

            echo json_encode(['success' => true, 'booking_id' => $bookingId]);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Failed to persist booking record']);
        }

    } else {
        // Handle Enquiry Insertion (default)
        $name = trim((string)($leadData['customerName'] ?? $leadData['name'] ?? ''));
        $phone = trim((string)($leadData['contactPhone'] ?? $leadData['phone'] ?? ''));
        $pickup = trim((string)($leadData['pickup'] ?? $leadData['pickup_location'] ?? ''));
        $drop = trim((string)($leadData['drop'] ?? $leadData['drop_location'] ?? ''));
        $travelDate = trim((string)($leadData['travelDate'] ?? $leadData['pickup_date'] ?? ''));

        if (!$name || !$phone || !$pickup || !$drop) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Missing required fields for enquiry']);
            exit;
        }

        $date = null;
        if ($travelDate && preg_match('/^\d{4}-\d{2}-\d{2}/', $travelDate)) {
            $date = substr($travelDate, 0, 10);
        }

        $bookingId = trim((string)($leadData['bookingId'] ?? $leadData['booking_id'] ?? ''));
        if ($bookingId === '') {
            $bookingId = 'E' . date('YmdHis') . rand(1000, 9999);
        }

        $stmt = $pdo->prepare("INSERT INTO enquiries (website, booking_id, name, phone, pickup, drop_location, travel_date, ip_address, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'not_confirmed')");
        $stmt->execute([$siteSlug, $bookingId, $name, $phone, $pickup, $drop, $date ?: null, $ip ?: null]);
        
        echo json_encode(['success' => true, 'id' => (int)$pdo->lastInsertId(), 'booking_id' => $bookingId]);
    }

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
}
