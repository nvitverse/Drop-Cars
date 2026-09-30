<?php
/**
 * api/booking-location.php
 *
 * Lightweight polling endpoint for pages/track-booking.php's live-location
 * card. Reads the local `bookings.last_lat/last_lng/last_location_at`
 * mirror columns (populated by api/website-status-webhook.php's
 * LOCATION_UPDATE pushes from the backend - see
 * app/api/routes/website_bookings.py's /website/trip-link/{token}/location).
 *
 * Requires booking_id + the registered phone (same pair track-booking.php
 * itself requires) so a booking ID alone can't be used to snoop on someone
 * else's live location.
 */

header('Content-Type: application/json; charset=utf-8');

if (!defined('DROP_CARS_DB_OPTIONAL')) {
    define('DROP_CARS_DB_OPTIONAL', true);
}
require_once __DIR__ . '/../admin/config/database.php';

if (!isset($pdo) || !($pdo instanceof PDO)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'message' => 'Database temporarily unavailable']);
    exit;
}

$bookingId = trim((string) ($_GET['booking_id'] ?? ''));
$phone = trim((string) ($_GET['phone'] ?? ''));

if ($bookingId === '' || $phone === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'booking_id and phone are required']);
    exit;
}

try {
    $stmt = $pdo->prepare("SELECT b.last_lat, b.last_lng, b.last_location_at, b.tracking_left_at
                           FROM `bookings` b
                           JOIN `customers` c ON b.customer_id = c.id
                           WHERE (b.booking_id = ? OR b.id = ?) AND c.phone = ?");
    $stmt->execute([$bookingId, $bookingId, $phone]);
    $row = $stmt->fetch();

    if (!$row) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Booking not found']);
        exit;
    }

    // "Paused" only counts if the left-flag is newer than the last real fix -
    // a stale left-flag from an earlier background blip shouldn't override a
    // location that has since resumed.
    $trackingPaused = !empty($row['tracking_left_at'])
        && (empty($row['last_location_at']) || strtotime($row['tracking_left_at']) >= strtotime($row['last_location_at']));

    echo json_encode([
        'success' => true,
        'last_lat' => $row['last_lat'] !== null ? (float) $row['last_lat'] : null,
        'last_lng' => $row['last_lng'] !== null ? (float) $row['last_lng'] : null,
        'last_location_at' => $row['last_location_at'],
        'tracking_paused' => $trackingPaused,
    ]);
} catch (Throwable $e) {
    error_log('booking-location error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Failed to fetch location']);
}
