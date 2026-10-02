<?php
/**
 * Action: copy every UPCOMING confirmed website booking that the Admin App does not know yet into Admin App > Website Approvals.
 *
 * Why: bookings confirmed on the website (or created in this CRM) before the Admin App queue existed, or whose confirmation
 * never reached the backend, never showed up in Website Approvals - only recent ones did. This creates them there as PENDING
 * (nothing is posted to drivers by this script): the backend then applies the normal auto-post timing rule, and staff can
 * customize, change the posting time, hold or post them from the Admin App.
 *
 * It sends the fare the customer was quoted (from the stored fare breakdown) so the backend does NOT recompute its own rate card.
 * Safe to run again: a booking that already has a backend_request_id is skipped.
 */
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
require_once __DIR__ . '/../includes/session.php';
require_once __DIR__ . '/../../api/includes/backend-client.php';
require_once __DIR__ . '/../../api/fare-breakdown-format.php';
require_once __DIR__ . '/../config/database.php';

$referer = $_SERVER['HTTP_REFERER'] ?? '../upcoming.php';
$back = function (string $msg) use ($referer) {
    header('Location: ' . $referer . (strpos($referer, '?') !== false ? '&' : '?') . 'msg=' . rawurlencode($msg));
    exit;
};

if (empty($_SESSION['admin_id']) || !isset($pdo) || $_SERVER['REQUEST_METHOD'] !== 'POST') {
    $back('sync_not_allowed');
}

$tripTypeMap = ['ONE_WAY' => 'Oneway', 'ROUND_TRIP' => 'Round Trip', 'LOCAL_PACKAGE' => 'Hourly Rental', 'MULTI_CITY' => 'Multy City'];
$carTypeMap = ['SEDAN' => 'SEDAN_4_PLUS_1', 'SUV' => 'SUV', 'INNOVA' => 'INNOVA', 'CRYSTA' => 'INNOVA_CRYSTA'];

// the fare the customer confirmed, from the stored fare breakdown (the same fields confirm_booking.php sends)
$buildQuote = function (array $b, string $mappedKey, string $backendTripType) {
    $quotedFare = null;
    $fb = json_decode((string) ($b['fare_breakdown'] ?? ''), true);
    $finalFare = (int) ($b['final_fare'] ?? 0);
    if (is_array($fb) && $mappedKey !== '' && $backendTripType !== 'Hourly Rental' && $finalFare > 0
        && isset($fb['vehicles'][$mappedKey]) && is_array($fb['vehicles'][$mappedKey])) {
        $qv = $fb['vehicles'][$mappedKey];
        $includeTolls = isset($fb['includeTolls']) ? (bool) $fb['includeTolls'] : false;
        $includeTaxes = isset($fb['includeTaxes']) ? (bool) $fb['includeTaxes'] : false;
        if (!empty($qv['perKmRate']) && !empty($qv['effectiveBillableKm'])) {
            $quotedFare = [
                'per_km_rate' => (float) (!empty($qv['discountedRate']) ? $qv['discountedRate'] : $qv['perKmRate']),
                'driver_bata' => (int) (isset($qv['driverBataTotal']) ? $qv['driverBataTotal'] : (isset($qv['driverBata']) ? $qv['driverBata'] : 0)),
                'billable_km' => (float) $qv['effectiveBillableKm'],
                'total_fare' => $finalFare,
                'include_taxes' => $includeTaxes,
                'include_tolls' => $includeTolls,
            ];
            if (function_exists('dropcars_fare_breakdown_included_extras')) {
                $extras = dropcars_fare_breakdown_included_extras($fb, $qv, $mappedKey, $includeTolls, $includeTaxes);
                $quotedFare['toll_amount'] = $extras['toll'];
                $quotedFare['permit_amount'] = $extras['permit'];
            }
        }
    }
    return $quotedFare;
};

// which website vehicle tier a booking row is
$vehicleKeyOf = function (array $b) {
    $vehicleText = strtoupper(trim((string) (($b['vehicle_type'] ?? '') !== '' ? $b['vehicle_type'] : ($b['car_name'] ?? ''))));
    foreach (['SEDAN', 'SUV', 'INNOVA', 'CRYSTA'] as $k) {
        if (stripos($vehicleText, $k) !== false) {
            return $k;
        }
    }
    return '';
};
$tripTypeOf = function (array $b) use ($tripTypeMap) {
    $typeKey = strtoupper(str_replace([' ', '-'], '_', (string) ($b['trip_type'] ?? 'ONE_WAY')));
    return $tripTypeMap[$typeKey] ?? ((strpos(strtolower((string) ($b['trip_type'] ?? '')), 'round') !== false) ? 'Round Trip' : 'Oneway');
};

$stmt = $pdo->query(
    "SELECT b.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email
       FROM `bookings` b JOIN `customers` c ON b.customer_id = c.id
      WHERE b.status = 'confirmed' AND b.pickup_date >= CURDATE()
        AND (b.backend_request_id IS NULL OR b.backend_request_id = '')
      ORDER BY b.pickup_date ASC, b.pickup_time ASC LIMIT 200"
);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

$synced = 0;
$failed = 0;
foreach ($rows as $b) {
    $phone = preg_replace('/[^\d]/', '', (string) ($b['customer_phone'] ?? ''));
    if (strlen($phone) > 10) {
        $phone = substr($phone, -10);
    }
    if ($phone === '') {
        $failed++;
        continue;
    }

    $typeKey = strtoupper(str_replace([' ', '-'], '_', (string) ($b['trip_type'] ?? 'ONE_WAY')));
    $backendTripType = $tripTypeMap[$typeKey] ?? ((strpos(strtolower((string) ($b['trip_type'] ?? '')), 'round') !== false) ? 'Round Trip' : 'Oneway');

    $vehicleText = strtoupper(trim((string) (($b['vehicle_type'] ?? '') !== '' ? $b['vehicle_type'] : ($b['car_name'] ?? ''))));
    $mappedKey = '';
    foreach (['SEDAN', 'SUV', 'INNOVA', 'CRYSTA'] as $k) {
        if (stripos($vehicleText, $k) !== false) {
            $mappedKey = $k;
            break;
        }
    }
    $backendCarType = $carTypeMap[$mappedKey] ?? 'SEDAN_4_PLUS_1';
    if (preg_match('/^(SUV|INNOVA|INNOVA_CRYSTA)_?(6|7)_PLUS_1$/', $vehicleText) || preg_match('/_(4|6|7)_PLUS_1$/', $vehicleText)) {
        $backendCarType = $vehicleText;     // the CRM already stored the exact backend type
    }

    $ts = strtotime(($b['pickup_date'] ?: date('Y-m-d')) . ' ' . ($b['pickup_time'] ?: '10:00:00'));
    $startDateTime = $ts !== false ? date('c', $ts) : date('c');

    $quotedFare = $buildQuote($b, $mappedKey, $backendTripType);

    $res = dropcars_backend_request('POST', '/api/website/bookings', [
        'customer_name' => ($b['customer_name'] ?? '') !== '' ? $b['customer_name'] : 'Guest',
        'customer_number' => $phone,
        'customer_email' => !empty($b['customer_email']) ? $b['customer_email'] : null,
        'pickup_drop_location' => (object) ['0' => ($b['pickup_location'] ?: 'Pickup'), '1' => ($b['drop_location'] ?: 'Drop')],
        'trip_type' => $backendTripType,
        'car_type' => $backendCarType,
        'start_date_time' => $startDateTime,
        'is_urgent' => false,
        'quoted_fare' => $quotedFare,
    ]);

    if ($res['ok'] && is_array($res['data']) && !empty($res['data']['id'])) {
        try {
            $pdo->prepare("UPDATE `bookings` SET `backend_request_id` = ?, `posting_status` = ? WHERE `id` = ?")
                ->execute([(string) $res['data']['id'], (string) ($res['data']['status'] ?? 'PENDING'), (int) $b['id']]);
        } catch (\Throwable $e) {
        }
        $synced++;
    } else {
        $failed++;
        error_log('sync-upcoming-to-approvals failed for booking ' . ($b['booking_id'] ?? $b['id']) . ': ' . ($res['error'] ?? 'unknown'));
    }
}

// Bookings the Admin App already has, but that were quoted from the backend's own rate card (no confirmed fare): give them the fare the
// customer really confirmed. The backend only accepts this while the booking is still waiting and staff have not edited it.
$repaired = 0;
$rep = $pdo->query(
    "SELECT b.* FROM `bookings` b
      WHERE b.status IN ('pending','confirmed') AND b.pickup_date >= CURDATE()
        AND b.backend_request_id IS NOT NULL AND b.backend_request_id <> ''
        AND (b.posting_status IS NULL OR b.posting_status NOT IN ('APPROVED','REJECTED','CANCELLED'))
      ORDER BY b.pickup_date ASC LIMIT 200"
)->fetchAll(PDO::FETCH_ASSOC);
foreach ($rep as $b) {
    $q = $buildQuote($b, $vehicleKeyOf($b), $tripTypeOf($b));
    if ($q === null) {
        continue;
    }
    $res = dropcars_backend_request('PUT', '/api/website/bookings/' . rawurlencode((string) $b['backend_request_id']) . '/quote', ['quoted_fare' => $q]);
    if ($res['ok'] && is_array($res['data']) && !empty($res['data']['updated'])) {
        $repaired++;
    }
}

$back('synced_' . $synced . '_failed_' . $failed . '_fare_corrected_' . $repaired);
