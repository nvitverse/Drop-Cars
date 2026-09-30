<?php
/**
 * api/website-status-webhook.php
 *
 * Receives live booking-status pushes FROM the FastAPI backend
 * (dropcars-review/backend/app/utils/website_status_webhook.py) - the
 * reverse direction of api/includes/backend-client.php. A vendor accepting
 * a booking, or later assigning a driver+car to it, calls this so the
 * website's own `bookings` row (and the customer-facing thank-you/
 * track-booking pages that read it) reflect the real state without the
 * customer having to guess.
 *
 * Auth: same shared secret as the outbound direction
 * (dropcarsApiWebsiteKey / DROPCARS_API_WEBSITE_KEY), sent as
 * X-DropCars-Website-Key - see api/includes/backend-client.php.
 */

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method Not Allowed']);
    exit;
}

if (!function_exists('dropcars_backend_config')) {
    require_once __DIR__ . '/includes/backend-client.php';
}

$configPath = __DIR__ . '/config.php';
if (!is_file($configPath)) {
    $configPath = __DIR__ . '/config.example.php';
}
$config = is_file($configPath) ? (include $configPath) : [];
$backend = dropcars_backend_config($config);

$providedKey = $_SERVER['HTTP_X_DROPCARS_WEBSITE_KEY'] ?? '';
if ($backend['key'] === '' || !hash_equals($backend['key'], (string) $providedKey)) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Invalid or missing website key']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid JSON body']);
    exit;
}

$backendRequestId = trim((string) ($input['backend_request_id'] ?? ''));
$statusRaw = trim((string) ($input['status'] ?? ''));
$driverName = trim((string) ($input['driver_name'] ?? ''));
$driverPhone = trim((string) ($input['driver_phone'] ?? ''));
$vehicleNumber = trim((string) ($input['vehicle_number'] ?? ''));

$allowedStatuses = ['ACCEPTED', 'ASSIGNED', 'STARTED', 'COMPLETED', 'CANCELLED', 'LOCATION_UPDATE'];
if ($backendRequestId === '' || !in_array($statusRaw, $allowedStatuses, true)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'backend_request_id and a valid status are required']);
    exit;
}

$statusColumnMap = [
    'ACCEPTED'  => 'accepted',
    'ASSIGNED'  => 'confirmed',
    'STARTED'   => 'started',
    'COMPLETED' => 'completed',
    'CANCELLED' => 'cancelled',
];

if (!defined('DROP_CARS_DB_OPTIONAL')) {
    define('DROP_CARS_DB_OPTIONAL', true);
}
require_once __DIR__ . '/../admin/config/database.php';

if (!isset($pdo) || !($pdo instanceof PDO)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'message' => 'Database temporarily unavailable']);
    exit;
}

try {
    // Ensure helper columns exist
    try {
        $chkCols = $pdo->query("SHOW COLUMNS FROM `bookings` LIKE 'closing_km'");
        if (!$chkCols->fetch()) {
            $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `closing_km` DECIMAL(10,2) NULL, ADD COLUMN `starting_km` DECIMAL(10,2) NULL");
        }
    } catch (Throwable $e) {}

    if ($statusRaw === 'LOCATION_UPDATE') {
        $trackingLeft = !empty($input['tracking_left']);
        if ($trackingLeft) {
            $stmt = $pdo->prepare(
                "UPDATE `bookings` SET `tracking_left_at` = NOW() WHERE `backend_request_id` = :backend_request_id"
            );
            $stmt->execute([':backend_request_id' => $backendRequestId]);
        } else {
            $lat = isset($input['last_lat']) ? (string) $input['last_lat'] : null;
            $lng = isset($input['last_lng']) ? (string) $input['last_lng'] : null;
            $stmt = $pdo->prepare(
                "UPDATE `bookings` SET `last_lat` = :lat, `last_lng` = :lng, `last_location_at` = NOW(), `tracking_left_at` = NULL WHERE `backend_request_id` = :backend_request_id"
            );
            $stmt->execute([':lat' => $lat, ':lng' => $lng, ':backend_request_id' => $backendRequestId]);
        }
    } else {
        $statusForColumn = $statusColumnMap[$statusRaw];
        $sql = "UPDATE `bookings` SET `status` = :status";
        $params = [':status' => $statusForColumn, ':backend_request_id' => $backendRequestId];

        if ($statusRaw === 'ASSIGNED') {
            $sql .= ", `driver_name` = :driver_name, `driver_phone` = :driver_phone, `vehicle_number` = :vehicle_number";
            $params[':driver_name'] = $driverName !== '' ? $driverName : null;
            $params[':driver_phone'] = $driverPhone !== '' ? $driverPhone : null;
            $params[':vehicle_number'] = $vehicleNumber !== '' ? $vehicleNumber : null;
        }

        $actualDistance = isset($input['actual_distance']) ? (float)$input['actual_distance'] : (isset($input['total_km']) ? (float)$input['total_km'] : null);
        $closingKm = isset($input['closing_km']) ? (float)$input['closing_km'] : null;
        $startingKm = isset($input['starting_km']) ? (float)$input['starting_km'] : null;
        $tollCharges = isset($input['toll_charges']) ? (float)$input['toll_charges'] : null;
        $finalFare = isset($input['final_fare']) ? (float)$input['final_fare'] : null;

        if ($statusRaw === 'COMPLETED') {
            if ($actualDistance !== null && $actualDistance > 0) {
                $sql .= ", `distance_km` = :distance_km";
                $params[':distance_km'] = $actualDistance;
            }
            if ($closingKm !== null && $closingKm > 0) {
                $sql .= ", `closing_km` = :closing_km";
                $params[':closing_km'] = $closingKm;
            }
            if ($startingKm !== null && $startingKm > 0) {
                $sql .= ", `starting_km` = :starting_km";
                $params[':starting_km'] = $startingKm;
            }
            if ($tollCharges !== null && $tollCharges > 0) {
                $sql .= ", `toll_charges` = :toll_charges";
                $params[':toll_charges'] = $tollCharges;
            }
            if ($finalFare !== null && $finalFare > 0) {
                $sql .= ", `final_fare` = :final_fare";
                $params[':final_fare'] = $finalFare;
            }
        }

        $sql .= " WHERE `backend_request_id` = :backend_request_id";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        // Also sync status and distance to linked enquiries record
        try {
            $enqSql = "UPDATE `enquiries` SET `status` = :enq_status, `is_touched` = 1";
            $enqParams = [':enq_status' => $statusForColumn, ':backend_request_id' => $backendRequestId];
            if ($actualDistance !== null && $actualDistance > 0) {
                $enqSql .= ", `distance_km` = :distance_km";
                $enqParams[':distance_km'] = $actualDistance;
            }
            $enqSql .= " WHERE `backend_request_id` = :backend_request_id OR `booking_id` = (SELECT `booking_id` FROM `bookings` WHERE `backend_request_id` = :backend_request_id LIMIT 1)";
            $pdo->prepare($enqSql)->execute($enqParams);
        } catch (Throwable $e) {}
    }

    echo json_encode([
        'success' => true,
        'updated_rows' => $stmt->rowCount(),
    ]);
} catch (Throwable $e) {
    error_log('website-status-webhook error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Failed to update booking status']);
}
