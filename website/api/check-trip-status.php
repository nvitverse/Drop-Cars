<?php
/**
 * api/check-trip-status.php
 * Drop Cars - Live Trip Status API
 * Allows customers and AI Assistant to check live booking status via Booking ID or Phone.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-Content-Type-Options: nosniff');

// Enable CORS for local/domain requests
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
    header('Access-Control-Allow-Credentials: true');
}

if (!defined('DROP_CARS_DB_OPTIONAL')) {
    define('DROP_CARS_DB_OPTIONAL', true);
}

// Include DB config if available
$dbFile = __DIR__ . '/../admin/config/database.php';
if (file_exists($dbFile)) {
    require_once $dbFile;
}

$rawInput = file_get_contents('php://input');
$jsonInput = json_decode($rawInput, true) ?? [];

$bookingId = trim((string)($_GET['booking_id'] ?? $_POST['booking_id'] ?? $jsonInput['booking_id'] ?? ''));
$phone     = preg_replace('/\D/', '', (string)($_GET['phone'] ?? $_POST['phone'] ?? $jsonInput['phone'] ?? ''));

// Normalize Booking ID (e.g. DC-1048, E-1048 -> 1048)
$cleanBookingId = preg_replace('/[^A-Za-z0-9\-]/', '', $bookingId);

if (empty($cleanBookingId) && empty($phone)) {
    echo json_encode([
        'ok' => false,
        'message' => 'Please provide a valid Booking ID (e.g., DC-1048) or registered Phone Number.'
    ]);
    exit;
}

$foundBooking = null;

if (isset($pdo) && $pdo instanceof PDO) {
    try {
        // 1. Search in bookings table
        $hasBookingsTable = (bool)$pdo->query("SHOW TABLES LIKE 'bookings'")->fetchColumn();
        if ($hasBookingsTable) {
            $sql = "SELECT * FROM `bookings` WHERE 1=1 ";
            $params = [];

            if (!empty($cleanBookingId)) {
                $sql .= " AND (`booking_id` = ? OR `id` = ?) ";
                $params[] = $cleanBookingId;
                $params[] = (int)preg_replace('/\D/', '', $cleanBookingId);
            }
            if (!empty($phone)) {
                $sql .= " AND (`customer_phone` LIKE ? OR `phone` LIKE ?) ";
                $params[] = '%' . substr($phone, -10);
                $params[] = '%' . substr($phone, -10);
            }

            $sql .= " ORDER BY id DESC LIMIT 1";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $foundBooking = $stmt->fetch(PDO::FETCH_ASSOC);
        }

        // 2. Fallback to enquiries table if not found
        if (!$foundBooking) {
            $hasEnquiriesTable = (bool)$pdo->query("SHOW TABLES LIKE 'enquiries'")->fetchColumn();
            if ($hasEnquiriesTable) {
                $sql = "SELECT * FROM `enquiries` WHERE 1=1 ";
                $params = [];

                if (!empty($cleanBookingId)) {
                    $sql .= " AND (`booking_id` = ? OR `id` = ?) ";
                    $params[] = $cleanBookingId;
                    $params[] = (int)preg_replace('/\D/', '', $cleanBookingId);
                }
                if (!empty($phone)) {
                    $sql .= " AND (`phone` LIKE ?) ";
                    $params[] = '%' . substr($phone, -10);
                }

                $sql .= " ORDER BY id DESC LIMIT 1";
                $stmt = $pdo->prepare($sql);
                $stmt->execute($params);
                $foundBooking = $stmt->fetch(PDO::FETCH_ASSOC);
            }
        }
    } catch (Throwable $e) {
        error_log("check-trip-status DB error: " . $e->getMessage());
    }
}

if ($foundBooking) {
    $rawStatus = strtolower($foundBooking['status'] ?? 'confirmed');
    $statusLabels = [
        'pending' => 'Pending',
        'accepted' => 'Accepted - Driver Being Assigned',
        'confirmed' => 'Confirmed',
        'completed' => 'Completed',
        'cancelled' => 'Cancelled',
    ];
    $status = $statusLabels[$rawStatus] ?? ucfirst($rawStatus);
    $pickup = $foundBooking['pickup_location'] ?? $foundBooking['pickup'] ?? 'Specified Location';
    $drop   = $foundBooking['drop_location'] ?? $foundBooking['drop'] ?? 'Destination';
    $vehicle = $foundBooking['vehicle_type'] ?? $foundBooking['vehicle'] ?? 'AC Cab';
    $date   = $foundBooking['travel_date'] ?? $foundBooking['date'] ?? 'As Scheduled';
    $time   = $foundBooking['travel_time'] ?? $foundBooking['time'] ?? '';
    
    // Check driver allocation
    $driverName  = $foundBooking['driver_name'] ?? null;
    $driverPhone = $foundBooking['driver_phone'] ?? null;
    $vehicleNum  = $foundBooking['vehicle_number'] ?? null;

    echo json_encode([
        'ok' => true,
        'found' => true,
        'booking_id' => $foundBooking['booking_id'] ?? ('DC-' . ($foundBooking['id'] ?? '1001')),
        'status' => $status,
        // Machine-readable enum for JS polling (pages/thank-you.php's live
        // "Broadcasting..." countdown) - `status` above is a human label and
        // deliberately not matched against in code. is_urgent mirrors the
        // `bookings.is_urgent` column when present (see
        // admin/sql/migrate-urgent-booking.sql); defaults to false before
        // that migration has been run.
        'raw_status' => $rawStatus,
        'is_urgent' => !empty($foundBooking['is_urgent']),
        'pickup' => $pickup,
        'drop' => $drop,
        'vehicle' => $vehicle,
        'date' => $date,
        'time' => $time,
        'driver_name' => $driverName ?: 'Dispatch Assigning (30 mins prior)',
        'driver_phone' => $driverPhone ?: '7200217986 (Support)',
        'vehicle_number' => $vehicleNum ?: 'Assigned upon dispatch'
    ]);
} else {
    // If queried with specific ID/phone, return structured response
    $displayId = !empty($cleanBookingId) ? strtoupper($cleanBookingId) : 'Provided Details';
    echo json_encode([
        'ok' => true,
        'found' => false,
        'booking_id' => $displayId,
        'status' => 'Pending Verification',
        'message' => "Booking details for {$displayId} received and under verification with dispatch. Driver details will be updated shortly via SMS/WhatsApp."
    ]);
}
