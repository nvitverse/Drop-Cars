<?php
/**
 * Admin Detailed Fare View - Premium Version
 * A high-end, immersive breakdown of calculated fares for administrators.
 */

// We expect data to be passed via POST from the booking form JS
$_fvSource    = $_GET['source'] ?? ($_POST['source'] ?? '');
$_fvRecordId  = isset($_GET['id']) ? (int)$_GET['id'] : 0;
$_fvBackUrl   = ($_fvSource === 'enquiry') ? 'enquiries' : (($_fvSource === 'booking') ? 'bookings' : 'bookings-new');
$_fvBackLabel = ($_fvSource === 'enquiry') ? 'Back to Leads' : (($_fvSource === 'booking') ? 'Back to Bookings' : 'Adjust Details');

// Load UPI and advance payment configurations
$fvAdvCfgPath = dirname(__DIR__, 2) . '/api/config.php';
$fvAdvCfg = is_file($fvAdvCfgPath) ? (include $fvAdvCfgPath) : [];
$fvUpiId  = $fvAdvCfg['upiId'] ?? '7200217986-1@okbizaxis';
$fvAdvancePercent = $fvAdvCfg['advancePercent'] ?? 20;

if (!function_exists('dropcars_build_vehicle_breakdown')) {
    function dropcars_build_vehicle_breakdown($vk, $serviceType, $distanceKm, $tripDays, $tariffsList, $storedFare = null) {
        $vk = strtoupper($vk);
        $tripTypeKey = ($serviceType === 'round_trip') ? 'round' : 'oneway';
        
        $perKmRate = 14.0;
        $driverBata = 400.0;
        
        foreach ($tariffsList as $t) {
            if (strtoupper($t['vehicle_type'] ?? '') === $vk && strtolower($t['trip_type'] ?? '') === $tripTypeKey) {
                $perKmRate = (float)($t['per_km_rate'] ?? $perKmRate);
                $driverBata = (float)($t['driver_beta'] ?? $t['driver_allowance'] ?? $driverBata);
                break;
            }
        }
        
        if ($serviceType === 'round_trip') {
            $minKm = 250.0 * $tripDays;
            $effectiveKm = max($distanceKm, $minKm);
            $kmCharge = $effectiveKm * $perKmRate;
            $driverBataTotal = $driverBata * $tripDays;
            $totalFare = $kmCharge + $driverBataTotal;
            
            $breakdown = [
                'minimumBillableKm' => $minKm,
                'effectiveBillableKm' => $effectiveKm,
                'perKmRate' => $perKmRate,
                'kmCharge' => $kmCharge,
                'driverBata' => $driverBata,
                'driverBataPerDay' => $driverBata,
                'driverBataTotal' => $driverBataTotal,
                'tripDays' => $tripDays,
                'actualRouteKmTotal' => $distanceKm,
                'totalFare' => ($storedFare !== null) ? (float)$storedFare : $totalFare
            ];
        } else {
            $minKm = 130.0;
            $effectiveKm = max($distanceKm, $minKm);
            $kmCharge = $effectiveKm * $perKmRate;
            $totalFare = $kmCharge + $driverBata;
            
            $breakdown = [
                'minimumBillableKm' => $minKm,
                'effectiveBillableKm' => $effectiveKm,
                'perKmRate' => $perKmRate,
                'kmCharge' => $kmCharge,
                'driverBata' => $driverBata,
                'totalFare' => ($storedFare !== null) ? (float)$storedFare : $totalFare
            ];
        }
        return $breakdown;
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && !empty($_POST['fare_data'])) {
    $fareData = json_decode($_POST['fare_data'], true);
    $_SESSION['pending_fare_view'] = $fareData;
} elseif (isset($_GET['id']) && ($_GET['source'] ?? '') === 'enquiry') {
    $debugLog = [];
    $debugLog[] = "[" . date('Y-m-d H:i:s') . "] Enquiry Request: " . json_encode($_GET);
    $debugLog[] = "Before db load, pdo defined? " . (isset($pdo) ? 'yes' : 'no');
    if (!isset($pdo)) {
        try {
            require_once __DIR__ . '/../../config/db.php';
            $debugLog[] = "After db load, pdo defined? " . (isset($pdo) ? 'yes' : 'no');
        } catch (Throwable $e) {
            $debugLog[] = "db load failed: " . $e->getMessage();
        }
    } else {
        $debugLog[] = "Skipped db load, using existing pdo connection.";
    }
    $scratchDir = __DIR__ . '/../../scratch';
    if (!is_dir($scratchDir)) {
        @mkdir($scratchDir, 0777, true);
    }
    if (is_dir($scratchDir)) {
        @file_put_contents($scratchDir . '/fare_view_debug.log', implode("\n", $debugLog) . "\n", FILE_APPEND);
    }

    if (isset($pdo)) {
        $rawId = trim((string)($_GET['id'] ?? ''));
        $stmt = $pdo->prepare("SELECT e.*, c.email AS customer_email FROM `enquiries` e LEFT JOIN `customers` c ON e.phone = c.phone WHERE e.id = ? OR e.booking_id = ?");
        $stmt->execute([$rawId, $rawId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            $_fvRecordId = (int)$row['id'];
            
            // Normalize serviceType
            $serviceType = strtolower(trim((string)$row['trip_type']));
            if ($serviceType === 'oneway') {
                $serviceType = 'one_way';
            } elseif ($serviceType === 'round' || $serviceType === 'roundtrip') {
                $serviceType = 'round_trip';
            } elseif ($serviceType === 'multi') {
                $serviceType = 'multi_city';
            }

            $selectedVehicle = strtoupper(trim((string)($row['vehicle_type'] ?? 'SEDAN')));
            if ($selectedVehicle === '') $selectedVehicle = 'SEDAN';

            $fb = null;
            if (!empty($row['fare_breakdown'])) {
                $fb = json_decode((string)$row['fare_breakdown'], true);
            }
            if (empty($fb) || !is_array($fb)) {
                $fb = [];
            }
            if (empty($fb['vehicles']) || !is_array($fb['vehicles'])) {
                $fb['vehicles'] = [];
            }
            $stops = [];
            if (!empty($fb['stops']) && is_array($fb['stops'])) {
                $stops = $fb['stops'];
            }

            // Website enquiries can be saved with distance_km = 0 / duration = NULL when the
            // live Google route wasn't confirmed (cache / min-km path). The real distance is
            // still stored in the fare_breakdown JSON, so fall back to it for display + fare basis.
            $storedBreakdownKm = 0.0;
            if (!empty($fb['totalRoundTripKmUsed'])) {
                $storedBreakdownKm = (float)$fb['totalRoundTripKmUsed'];
            } elseif (!empty($fb['actualRouteKm'])) {
                $storedBreakdownKm = (float)$fb['actualRouteKm'];
            } elseif (!empty($fb['actualRouteKmOneWay'])) {
                $storedBreakdownKm = (float)$fb['actualRouteKmOneWay'] * (($serviceType === 'round_trip') ? 2 : 1);
            }
            $rowDistanceKm = (float)($row['distance_km'] ?? 0);
            $displayDistanceKm = $rowDistanceKm > 0 ? $rowDistanceKm : $storedBreakdownKm;

            $rowDuration = trim((string)($row['duration'] ?? ''));
            $isOldDuration = (
                $rowDuration === '' ||
                (stripos($rowDuration, 'hour') !== false && stripos($rowDuration, 'min') === false) ||
                (stripos($rowDuration, 'hours') !== false && stripos($rowDuration, 'mins') === false) ||
                (stripos($rowDuration, 'hr') === false && stripos($rowDuration, 'min') === false)
            );
            if ($isOldDuration && $displayDistanceKm > 0) {
                $oneWayForDur = ($serviceType === 'round_trip') ? ($displayDistanceKm / 2) : $displayDistanceKm;
                $rawHrs = $oneWayForDur / 55;
                $hrs = floor($rawHrs);
                $mins = (int)round(($rawHrs - $hrs) * 60);
                if ($mins === 60) { $hrs++; $mins = 0; }
                $rowDuration = '';
                if ($hrs > 0) {
                    $rowDuration .= $hrs . ' hr' . ($hrs == 1 ? '' : 's');
                }
                if ($mins > 0) {
                    if ($rowDuration !== '') $rowDuration .= ' ';
                    $rowDuration .= $mins . ' min' . ($mins == 1 ? '' : 's');
                }
                if ($rowDuration === '') {
                    $rowDuration = '0 mins';
                }
            }

            $tariffsList = function_exists('get_json_tariffs') ? get_json_tariffs() : [];
            $distanceKm = $displayDistanceKm > 0 ? $displayDistanceKm : 100;

            $tripDays = 1;
            
            $vehicles = [];
            $allClasses = ['SEDAN', 'SUV', 'INNOVA', 'CRYSTA'];
            foreach ($allClasses as $vk) {
                if ($vk === $selectedVehicle && !empty($fb['vehicles'][$vk]) && is_array($fb['vehicles'][$vk])) {
                    $vehicles[$vk] = $fb['vehicles'][$vk];
                } else {
                    $storedFare = null;
                    if ($vk === $selectedVehicle) {
                        $storedFare = (float)$row['fare_estimate'];
                    }
                    $vehicles[$vk] = dropcars_build_vehicle_breakdown($vk, $serviceType, $distanceKm, $tripDays, $tariffsList, $storedFare);
                }
            }
            
            $fb = [
                'tripMode' => $serviceType,
                'actualRouteKm' => $distanceKm,
                'vehicles' => $vehicles
            ];
            
            if ($serviceType === 'round_trip') {
                $fb['actualRouteKmOneWay'] = $distanceKm / 2;
                $fb['totalRoundTripKmUsed'] = $distanceKm;
                $fb['tripDays'] = $tripDays;
            }

            $e_estimates = [];
            foreach ($fb['vehicles'] as $vk => $v) {
                $e_estimates[$vk] = [
                    'total' => $v['totalFare'] ?? 0,
                    'minimumBillableKm' => $v['minimumBillableKm'] ?? 0,
                    'effectiveBillableKm' => $v['effectiveBillableKm'] ?? 0,
                    'perKmRate' => $v['perKmRate'] ?? 0,
                    'kmCharge' => $v['kmCharge'] ?? 0,
                    'driverBata' => $v['driverBata'] ?? $v['driverBataTotal'] ?? 0,
                    'totalFare' => $v['totalFare'] ?? 0,
                ];
            }
            
            $fareData = [
                'pickup' => $row['pickup'],
                'drop' => $row['drop_location'],
                'estimates' => $e_estimates,
                'selectedVehicle' => $selectedVehicle,
                'distanceHint' => $displayDistanceKm,
                'pricingDistanceHint' => $displayDistanceKm,
                'routeKmOneWay' => $serviceType === 'round_trip' ? ($displayDistanceKm / 2) : $displayDistanceKm,
                'pricingRouteKmOneWay' => $serviceType === 'round_trip' ? ($displayDistanceKm / 2) : $displayDistanceKm,
                'tripTime' => ['startDate' => $row['travel_date'], 'time' => $row['travel_time']],
                'fareType' => $row['fare_type'] ?: 'exclusive',
                'serviceType' => $serviceType,
                'borderTransitions' => [],
                'payload' => [
                    'pickup' => $row['pickup'],
                    'drop' => $row['drop_location'],
                    'travelDate' => $row['travel_date'],
                    'travelTime' => $row['travel_time'],
                    'distanceHint' => $displayDistanceKm,
                    'durationHint' => $rowDuration,
                    'baseFare' => $row['fare_estimate'],
                    'bookingId' => $row['booking_id'],
                    'customerName' => $row['name'] ?? '',
                    'contactValue' => $row['phone'] ?? '',
                    'contactEmail' => $row['customer_email'] ?? '',
                    'contactMode' => 'phone',
                    'stops' => $stops,
                    'vehicleEstimates' => $e_estimates,
                    'fareBreakdown' => $fb,
                    'endDate' => $row['return_date'] ?? null,
                    'dropTime' => $row['return_time'] ?? null,
                    'dispatcherNotes' => $row['dispatcher_notes'] ?? '',
                    'multiCityStopCharge' => 0,
                    'nightAllowance' => 0,
                    'serviceType' => $serviceType,
                ]
            ];
            $_SESSION['pending_fare_view'] = $fareData;
        }
    }
} elseif (isset($_GET['id']) && ($_GET['source'] ?? '') === 'booking') {
    $debugLog = [];
    $debugLog[] = "[" . date('Y-m-d H:i:s') . "] Booking Request: " . json_encode($_GET);
    $debugLog[] = "Before db load, pdo defined? " . (isset($pdo) ? 'yes' : 'no');
    if (!isset($pdo)) {
        try {
            require_once __DIR__ . '/../../config/db.php';
            $debugLog[] = "After db load, pdo defined? " . (isset($pdo) ? 'yes' : 'no');
        } catch (Throwable $e) {
            $debugLog[] = "db load failed: " . $e->getMessage();
        }
    } else {
        $debugLog[] = "Skipped db load, using existing pdo connection.";
    }
    $scratchDir = __DIR__ . '/../../scratch';
    if (!is_dir($scratchDir)) {
        @mkdir($scratchDir, 0777, true);
    }
    if (is_dir($scratchDir)) {
        @file_put_contents($scratchDir . '/fare_view_debug.log', implode("\n", $debugLog) . "\n", FILE_APPEND);
    }

    if (isset($pdo)) {
        $rawId = trim((string)($_GET['id'] ?? ''));
        $stmt = $pdo->prepare("SELECT b.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email FROM `bookings` b LEFT JOIN `customers` c ON b.customer_id = c.id WHERE b.id = ? OR b.booking_id = ?");
        $stmt->execute([$rawId, $rawId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            $_fvRecordId = (int)$row['id'];
            
            // Normalize serviceType
            $serviceType = strtolower(trim((string)$row['trip_type']));
            if ($serviceType === 'oneway') {
                $serviceType = 'one_way';
            } elseif ($serviceType === 'round' || $serviceType === 'roundtrip') {
                $serviceType = 'round_trip';
            } elseif ($serviceType === 'multi') {
                $serviceType = 'multi_city';
            }

            $selectedVehicle = strtoupper(trim((string)($row['car_name'] ?? 'SEDAN')));
            if ($selectedVehicle === '') $selectedVehicle = 'SEDAN';

            $fb = null;
            if (!empty($row['fare_breakdown'])) {
                $fb = json_decode((string)$row['fare_breakdown'], true);
            }
            if (empty($fb) || !is_array($fb)) {
                $fb = [];
            }
            if (empty($fb['vehicles']) || !is_array($fb['vehicles'])) {
                $fb['vehicles'] = [];
            }

            $tariffsList = function_exists('get_json_tariffs') ? get_json_tariffs() : [];
            $distanceKm = (float)($row['distance_km'] ?? 0);
            if ($distanceKm <= 0) $distanceKm = 100;
            
            $tripDays = (int)($row['trip_days'] ?? 1);
            if ($tripDays <= 0) $tripDays = 1;
            
            $vehicles = [];
            $allClasses = ['SEDAN', 'SUV', 'INNOVA', 'CRYSTA'];
            foreach ($allClasses as $vk) {
                if ($vk === $selectedVehicle && !empty($fb['vehicles'][$vk]) && is_array($fb['vehicles'][$vk])) {
                    $vehicles[$vk] = $fb['vehicles'][$vk];
                } else {
                    $storedFare = null;
                    if ($vk === $selectedVehicle) {
                        $storedFare = (float)$row['final_fare'];
                    }
                    $vehicles[$vk] = dropcars_build_vehicle_breakdown($vk, $serviceType, $distanceKm, $tripDays, $tariffsList, $storedFare);
                }
            }
            
            $fb = [
                'tripMode' => $serviceType,
                'actualRouteKm' => $distanceKm,
                'vehicles' => $vehicles
            ];
            
            if ($serviceType === 'round_trip') {
                $fb['actualRouteKmOneWay'] = $distanceKm / 2;
                $fb['totalRoundTripKmUsed'] = $distanceKm;
                $fb['tripDays'] = $tripDays;
            }
            
            $e_estimates = [];
            foreach ($fb['vehicles'] as $vk => $v) {
                $e_estimates[$vk] = [
                    'total' => $v['totalFare'] ?? 0,
                    'minimumBillableKm' => $v['minimumBillableKm'] ?? 0,
                    'effectiveBillableKm' => $v['effectiveBillableKm'] ?? 0,
                    'perKmRate' => $v['perKmRate'] ?? 0,
                    'kmCharge' => $v['kmCharge'] ?? 0,
                    'driverBata' => $v['driverBata'] ?? $v['driverBataTotal'] ?? 0,
                    'totalFare' => $v['totalFare'] ?? 0,
                ];
            }
            
            // Parse via_locations
            $stops = !empty($row['via_locations']) ? explode(' | ', $row['via_locations']) : [];
            
            $rowDuration = trim((string)($row['duration'] ?? ''));
            if ($rowDuration === '' && $distanceKm > 0) {
                $oneWayForDur = ($serviceType === 'round_trip') ? ($distanceKm / 2) : $distanceKm;
                $rawHrs = $oneWayForDur / 55;
                $hrs = floor($rawHrs);
                $mins = (int)round(($rawHrs - $hrs) * 60);
                if ($mins === 60) { $hrs++; $mins = 0; }
                $rowDuration = '';
                if ($hrs > 0) {
                    $rowDuration .= $hrs . ' hr' . ($hrs == 1 ? '' : 's');
                }
                if ($mins > 0) {
                    if ($rowDuration !== '') $rowDuration .= ' ';
                    $rowDuration .= $mins . ' min' . ($mins == 1 ? '' : 's');
                }
                if ($rowDuration === '') {
                    $rowDuration = '0 mins';
                }
            }

            $fareData = [
                'pickup' => $row['pickup_location'],
                'drop' => $row['drop_location'],
                'estimates' => $e_estimates,
                'selectedVehicle' => $selectedVehicle,
                'distanceHint' => (float)$row['distance_km'],
                'pricingDistanceHint' => (float)$row['distance_km'],
                'routeKmOneWay' => $serviceType === 'round_trip' ? ((float)$row['distance_km'] / 2) : (float)$row['distance_km'],
                'pricingRouteKmOneWay' => $serviceType === 'round_trip' ? ((float)$row['distance_km'] / 2) : (float)$row['distance_km'],
                'tripTime' => ['startDate' => $row['pickup_date'], 'time' => $row['pickup_time']],
                'fareType' => $row['fare_type'] ?: 'exclusive',
                'serviceType' => $serviceType,
                'borderTransitions' => [],
                'payload' => [
                    'pickup' => $row['pickup_location'],
                    'drop' => $row['drop_location'],
                    'travelDate' => $row['pickup_date'],
                    'travelTime' => $row['pickup_time'],
                    'distanceHint' => (float)$row['distance_km'],
                    'durationHint' => $rowDuration,
                    'baseFare' => $row['final_fare'],
                    'bookingId' => $row['booking_id'],
                    'customerName' => $row['customer_name'] ?? '',
                    'contactValue' => $row['customer_phone'] ?? '',
                    'contactEmail' => $row['customer_email'] ?? '',
                    'contactMode' => 'phone',
                    'stops' => $stops,
                    'vehicleEstimates' => $e_estimates,
                    'fareBreakdown' => $fb,
                    'endDate' => $row['return_date'] ?? null,
                    'dropTime' => $row['return_time'] ?? null,
                    'dispatcherNotes' => $row['dispatcher_notes'] ?? '',
                    'multiCityStopCharge' => 0,
                    'nightAllowance' => 0,
                    'serviceType' => $serviceType,
                ]
            ];
            $_SESSION['pending_fare_view'] = $fareData;
        }
    }
} elseif (isset($_SESSION['pending_fare_view'])) {
    $fareData = $_SESSION['pending_fare_view'];
}

if (empty($fareData)) {
    echo "<div class='error-msg-full'>
            <div class='error-card'>
                <i class='fa-solid fa-circle-exclamation'></i>
                <h1>Invalid Session Data</h1>
                <p>We couldn't find any fare calculation data. Please return to the booking page to calculate a fare.</p>
                <a href='bookings-new' class='btn-primary'>Return to Booking</a>
            </div>
          </div>";
    ?>
    <style>
        .error-msg-full { height: 100vh; display: flex; align-items: center; justify-content: center; background: #f8fafc; font-family: 'Inter', sans-serif; }
        .error-card { text-align: center; background: white; padding: 3rem; border-radius: 24px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); max-width: 450px; }
        .error-card i { font-size: 4rem; color: #ef4444; margin-bottom: 1.5rem; }
        .error-card h1 { font-size: 1.5rem; font-weight: 800; color: #1e293b; margin-bottom: 1rem; }
        .error-card p { color: #64748b; margin-bottom: 2rem; line-height: 1.6; }
        .btn-primary { display: inline-block; background: #f7b733; color: #0f172a; padding: 0.75rem 1.5rem; border-radius: 12px; text-decoration: none; font-weight: 700; transition: all 0.2s; }
        .btn-primary:hover { filter: brightness(1.05); transform: translateY(-2px); }
    </style>
    <?php
    exit;
}

$pickup = $fareData['pickup'] ?? 'N/A';
$drop = $fareData['drop'] ?? 'N/A';
$estimates = $fareData['estimates'] ?? [];
$selectedVehicle = $fareData['selectedVehicle'] ?? 'SEDAN';
if (!$selectedVehicle) {
    if (!empty($estimates)) {
        $selectedVehicle = array_keys($estimates)[0] ?? 'SEDAN';
    } else {
        $selectedVehicle = 'SEDAN';
    }
}
$distanceHint = (float)($fareData['distanceHint'] ?? 0);
$routeKmRaw = (float)($fareData['routeKmOneWay'] ?? 0);
$pricingRouteKmOneWay = (float)($fareData['pricingRouteKmOneWay'] ?? 0);
$pricedDistanceHint = (float)($fareData['pricingDistanceHint'] ?? ($distanceHint > 0 ? $distanceHint : 0));
$tripTime = $fareData['tripTime'] ?? [];
$fareType = $fareData['fareType'] ?? 'base';
$serviceType = $fareData['serviceType'] ?? 'one_way';
$bookingPayload = $fareData['payload'] ?? [];
$bookingId = $bookingPayload['bookingId'] ?? ($row['booking_id'] ?? ($_GET['id'] ?? ''));
$stops = $bookingPayload['stops'] ?? [];
$isInclusive = ($fareType === 'inclusive');

function dropcars_infer_state_from_location(string $location): string {
    $text = strtolower(trim($location));
    if ($text === '') return '';
    $knownStates = ['tamil nadu', 'karnataka', 'kerala', 'andhra pradesh', 'telangana', 'puducherry', 'pondicherry', 'maharashtra', 'goa', 'gujarat'];
    foreach ($knownStates as $state) {
        if (strpos($text, $state) !== false) {
            return $state === 'pondicherry' ? 'puducherry' : $state;
        }
    }
    $cityToState = [
        // Tamil Nadu
        'chennai' => 'tamil nadu', 'coimbatore' => 'tamil nadu', 'madurai' => 'tamil nadu', 'trichy' => 'tamil nadu',
        'tiruchirappalli' => 'tamil nadu', 'vellore' => 'tamil nadu', 'salem' => 'tamil nadu', 'erode' => 'tamil nadu',
        'tirunelveli' => 'tamil nadu', 'thanjavur' => 'tamil nadu', 'dindigul' => 'tamil nadu', 'karur' => 'tamil nadu',
        'namakkal' => 'tamil nadu', 'krishnagiri' => 'tamil nadu', 'dharmapuri' => 'tamil nadu', 'cuddalore' => 'tamil nadu',
        'villupuram' => 'tamil nadu', 'kanchipuram' => 'tamil nadu', 'chengalpattu' => 'tamil nadu', 'thiruvallur' => 'tamil nadu',
        'nagapattinam' => 'tamil nadu', 'thiruvarur' => 'tamil nadu', 'ramanathapuram' => 'tamil nadu', 'sivagangai' => 'tamil nadu',
        'virudhunagar' => 'tamil nadu', 'thoothukudi' => 'tamil nadu', 'tenkasi' => 'tamil nadu', 'nilgiris' => 'tamil nadu',
        'ooty' => 'tamil nadu', 'coonoor' => 'tamil nadu', 'kodaikanal' => 'tamil nadu', 'yercaud' => 'tamil nadu', 'tiruppur' => 'tamil nadu',
        'ariyalur' => 'tamil nadu', 'pudukkottai' => 'tamil nadu', 'theni' => 'tamil nadu', 'kallakurichi' => 'tamil nadu',
        'tirupattur' => 'tamil nadu', 'ranipet' => 'tamil nadu', 'tiruvannamalai' => 'tamil nadu', 'kanyakumari' => 'tamil nadu',
        'rameshwaram' => 'tamil nadu', 'hosur' => 'tamil nadu', 'bhavani' => 'tamil nadu', 'chidambaram' => 'tamil nadu',
        'perambalur' => 'tamil nadu', 'velankanni' => 'tamil nadu', 'mahabalipuram' => 'tamil nadu',
        // Karnataka
        'bangalore' => 'karnataka', 'bengaluru' => 'karnataka', 'mysore' => 'karnataka', 'mangalore' => 'karnataka',
        'hubli' => 'karnataka', 'dharwad' => 'karnataka', 'belgaum' => 'karnataka', 'udupi' => 'karnataka',
        'gokarna' => 'karnataka', 'hampi' => 'karnataka',
        // Kerala
        'kochi' => 'kerala', 'cochin' => 'kerala', 'trivandrum' => 'kerala', 'thiruvananthapuram' => 'kerala',
        'palakkad' => 'kerala', 'calicut' => 'kerala', 'munnar' => 'kerala', 'wayanad' => 'kerala',
        'alleppey' => 'kerala', 'alappuzha' => 'kerala', 'thekkady' => 'kerala', 'kovalam' => 'kerala',
        // Andhra Pradesh
        'tirupati' => 'andhra pradesh', 'chittoor' => 'andhra pradesh', 'nellore' => 'andhra pradesh',
        'guntur' => 'andhra pradesh', 'vijayawada' => 'andhra pradesh', 'visakhapatnam' => 'andhra pradesh',
        'vizag' => 'andhra pradesh',
        // Telangana
        'hyderabad' => 'telangana', 'secunderabad' => 'telangana', 'warangal' => 'telangana',
        // Puducherry
        'pondicherry' => 'puducherry', 'puducherry' => 'puducherry', 'karaikkal' => 'puducherry', 'karaikal' => 'puducherry',
        // Maharashtra
        'mumbai' => 'maharashtra', 'pune' => 'maharashtra', 'nagpur' => 'maharashtra', 'nasik' => 'maharashtra',
        'nashik' => 'maharashtra', 'shirdi' => 'maharashtra',
        // Goa
        'panaji' => 'goa', 'goa' => 'goa',
        // Gujarat
        'ahmedabad' => 'gujarat', 'surat' => 'gujarat', 'vadodara' => 'gujarat', 'rajkot' => 'gujarat'
    ];
    foreach ($cityToState as $city => $state) {
        if (strpos($text, $city) !== false) {
            return $state;
        }
    }
    return '';
}

function dropcars_state_path_transitions(string $fromLoc, string $toLoc): array {
    $fromState = dropcars_infer_state_from_location($fromLoc);
    $toState = dropcars_infer_state_from_location($toLoc);
    if ($fromState === '' || $toState === '') return [];
    
    // Enclave / Intra-state transit special cases
    if ($fromState === 'tamil nadu' && $toState === 'tamil nadu') {
        $locStr = (string)$fromLoc . '::' . (string)$toLoc;
        $locStrLow = strtolower($locStr);
        // Chennai/nearby to Cuddalore/nearby typically passes through Pondicherry
        if ((strpos($locStrLow, 'chennai') !== false || strpos($locStrLow, 'kanchipuram') !== false || strpos($locStrLow, 'vellore') !== false) 
            && (strpos($locStrLow, 'cuddalore') !== false || strpos($locStrLow, 'chidambaram') !== false || strpos($locStrLow, 'karaikal') !== false)) {
            return [['from' => 'tamil nadu', 'to' => 'puducherry', 'andhraBorder' => false]];
        }
    }

    if ($fromState === $toState) return [];

    $locStr = strtolower(trim($fromLoc) . '::' . trim($toLoc));
    if (($fromState === 'tamil nadu' && $toState === 'karnataka') || ($fromState === 'karnataka' && $toState === 'tamil nadu')) {
        if (strpos($locStr, 'vellore') !== false || strpos($locStr, 'chennai') !== false || strpos($locStr, 'kanchipuram') !== false) {
            return [
                ['from' => $fromState, 'to' => 'andhra pradesh', 'andhraBorder' => true],
                ['from' => 'andhra pradesh', 'to' => $toState, 'andhraBorder' => true]
            ];
        }
    }

    $neighbors = [
        'tamil nadu' => ['kerala', 'karnataka', 'andhra pradesh', 'puducherry'],
        'kerala' => ['tamil nadu', 'karnataka'],
        'karnataka' => ['tamil nadu', 'kerala', 'andhra pradesh', 'telangana', 'maharashtra', 'goa'],
        'andhra pradesh' => ['tamil nadu', 'karnataka', 'telangana'],
        'telangana' => ['andhra pradesh', 'karnataka', 'maharashtra'],
        'puducherry' => ['tamil nadu'],
        'maharashtra' => ['karnataka', 'telangana', 'gujarat', 'goa'],
        'goa' => ['karnataka', 'maharashtra'],
        'gujarat' => ['maharashtra']
    ];
    $queue = [[$fromState]];
    $visited = [$fromState => true];
    while (!empty($queue)) {
        $path = array_shift($queue);
        $last = $path[count($path) - 1];
        if ($last === $toState) {
            $out = [];
            for ($i = 0; $i < count($path) - 1; $i++) {
                $from = $path[$i];
                $to = $path[$i + 1];
                $out[] = [
                    'from' => $from,
                    'to' => $to,
                    'andhraBorder' => ($from === 'andhra pradesh' || $to === 'andhra pradesh')
                ];
            }
            return $out;
        }
        foreach ($neighbors[$last] ?? [] as $next) {
            if (!isset($visited[$next])) {
                $visited[$next] = true;
                $newPath = $path;
                $newPath[] = $next;
                $queue[] = $newPath;
            }
        }
    }
    return [[
        'from' => $fromState,
        'to' => $toState,
        'andhraBorder' => ($fromState === 'andhra pradesh' || $toState === 'andhra pradesh')
    ]];
}

require_once __DIR__ . '/../../includes/paths.php';
require_once __DIR__ . '/../../api/fare-breakdown-format.php';

$envFile = __DIR__ . '/../../config/env.php';
if (is_file($envFile)) {
    require_once $envFile;
}

// Editable permit / inter-state entry charges (set in admin → Tariffs → data/config.json).
$fvConfigPath = __DIR__ . '/../../data/config.json';
$fvConfig = is_file($fvConfigPath) ? (json_decode(file_get_contents($fvConfigPath), true) ?: []) : [];
$fvPermit = array_merge(
    ['SEDAN' => 500, 'SUV' => 1000, 'INNOVA' => 1500, 'CRYSTA' => 1500, 'andhra_premium' => 2000],
    (isset($fvConfig['permitCharges']) && is_array($fvConfig['permitCharges'])) ? $fvConfig['permitCharges'] : []
);

$baseEstimate = $bookingPayload['baseFare'] ?? 0;
$displayTotal = $baseEstimate;
$borderFeeTotal = 0;
// 1. Tolls (₹2/km heuristic) - admin can POST inclusiveTollAmount to override for session/breakdown
$tollHeuristic = round(($pricedDistanceHint > 0 ? $pricedDistanceHint : $distanceHint) * 2);
$tollForInclusive = isset($fareData['inclusiveTollAmount']) ? max(0, (int) $fareData['inclusiveTollAmount']) : $tollHeuristic;

// 2. State Entry Tax - Always calculate for insight card
$borderFeeTotal = 0;
$vk = strtoupper($selectedVehicle);
if (isset($fareData['_overrideBorderCount'])) {
    $overrideCount = max(0, (int)$fareData['_overrideBorderCount']);
    $borders = [];
    for ($i = 0; $i < $overrideCount; $i++) {
        $borders[] = [
            'from' => 'State ' . ($i + 1),
            'to' => 'State ' . ($i + 2),
            'andhraBorder' => false
        ];
    }
} else {
    $borders = $fareData['borderTransitions'] ?? [];
    $recomputedBorders = dropcars_state_path_transitions((string)$pickup, (string)$drop);
    if (!empty($recomputedBorders)) {
        $borders = $recomputedBorders;
    }
}

$taxRates = ['SEDAN' => (int) $fvPermit['SEDAN'], 'SUV' => (int) $fvPermit['SUV'], 'INNOVA' => (int) $fvPermit['INNOVA'], 'CRYSTA' => (int) $fvPermit['CRYSTA']];
$baseTax = $taxRates[$vk] ?? (int) $fvPermit['SEDAN'];
$seenBorders = [];

foreach ($borders as $b) {
    $from = strtolower(trim((string)($b['from'] ?? '')));
    $to = strtolower(trim((string)($b['to'] ?? '')));
    if ($from === '' || $to === '' || $from === $to) {
        continue;
    }
    $key = ($from < $to) ? ($from . '::' . $to) : ($to . '::' . $from);
    if (isset($seenBorders[$key])) {
        continue;
    }
    $seenBorders[$key] = true;
    if (($vk === 'INNOVA' || $vk === 'CRYSTA') && ($b['andhraBorder'] ?? false)) {
        $borderFeeTotal += (int) $fvPermit['andhra_premium'];
    } else {
        $borderFeeTotal += $baseTax;
    }
}

$fareData['borderTransitions'] = $borders;
$_SESSION['pending_fare_view'] = $fareData;

$includeTolls = isset($bookingPayload['includeTolls'])
    ? (bool)$bookingPayload['includeTolls']
    : (isset($bookingPayload['fareBreakdown']['includeTolls'])
        ? (bool)$bookingPayload['fareBreakdown']['includeTolls']
        : $isInclusive);

$includeTaxes = isset($bookingPayload['includeTaxes'])
    ? (bool)$bookingPayload['includeTaxes']
    : (isset($bookingPayload['fareBreakdown']['includeTaxes'])
        ? (bool)$bookingPayload['fareBreakdown']['includeTaxes']
        : $isInclusive);

$taxCount = isset($bookingPayload['fareBreakdown']['overrideTaxCount'])
    ? (int)$bookingPayload['fareBreakdown']['overrideTaxCount']
    : (isset($bookingPayload['overrideTaxCount'])
        ? (int)$bookingPayload['overrideTaxCount']
        : count($seenBorders));
$taxRate = isset($bookingPayload['fareBreakdown']['overrideTaxAmount'])
    ? (int)$bookingPayload['fareBreakdown']['overrideTaxAmount']
    : (isset($bookingPayload['overrideTaxAmount'])
        ? (int)$bookingPayload['overrideTaxAmount']
        : $baseTax);

$hasTaxOverride = isset($bookingPayload['fareBreakdown']['overrideTaxCount']) || isset($bookingPayload['overrideTaxCount']);
if ($hasTaxOverride) {
    $borderFeeTotal = $taxCount * $taxRate;
}

$displayTotal = $baseEstimate;
if ($includeTolls) {
    $displayTotal += $tollForInclusive;
}
if ($includeTaxes) {
    $displayTotal += $borderFeeTotal;
}

$breakdownHtml = '';
if (isset($bookingPayload['fareBreakdown']) && is_array($bookingPayload['fareBreakdown'])) {
    $bookingPayload['fareBreakdown']['fareType'] = $fareType;
    $bookingPayload['fareBreakdown']['borderTransitions'] = $borders;
    $bookingPayload['fareBreakdown']['includeTolls'] = $includeTolls;
    $bookingPayload['fareBreakdown']['includeTaxes'] = $includeTaxes;
    $bookingPayload['fareBreakdown']['overrideTollAmount'] = $tollForInclusive;
    $bookingPayload['fareBreakdown']['overrideTaxAmount'] = $taxRate;
    $bookingPayload['fareBreakdown']['overrideTaxCount'] = $taxCount;
    // Route toll is the same for all vehicle rows; set on each so breakdown HTML uses exact/admin toll
    if (!empty($bookingPayload['fareBreakdown']['vehicles']) && is_array($bookingPayload['fareBreakdown']['vehicles'])) {
        foreach ($bookingPayload['fareBreakdown']['vehicles'] as $vk => $veh) {
            if (is_array($veh)) {
                $bookingPayload['fareBreakdown']['vehicles'][$vk]['includeTolls'] = $includeTolls;
                $bookingPayload['fareBreakdown']['vehicles'][$vk]['includeTaxes'] = $includeTaxes;
                $bookingPayload['fareBreakdown']['vehicles'][$vk]['liveToll'] = $tollForInclusive;
                $bookingPayload['fareBreakdown']['vehicles'][$vk]['overrideTaxAmount'] = $taxRate;
                $bookingPayload['fareBreakdown']['vehicles'][$vk]['overrideTaxCount'] = $taxCount;
            }
        }
    }
    $breakdownHtml = dropcars_fare_breakdown_html($bookingPayload['fareBreakdown']);
}

// -- Dynamic Inclusions / Exclusions --
$selectedEst = $estimates[$selectedVehicle] ?? (reset($estimates) ?: []);
$kmLimit = (isset($selectedEst['minimumBillableKm']) && (float)$selectedEst['minimumBillableKm'] > 0)
    ? (float)$selectedEst['minimumBillableKm']
    : (($distanceHint > 0) ? round($distanceHint) : 0);

$inclusions = [
    '<i class="fa-solid fa-car"></i> Base Fare' . ($kmLimit > 0 ? ' (Up to ' . $kmLimit . ' KM limit)' : ''),
    '<i class="fa-solid fa-user-tie"></i> Driver Allowance (Bata)',
    '<i class="fa-solid fa-gas-pump"></i> Fuel &amp; Maintenance',
    '<i class="fa-solid fa-snowflake"></i> Clean AC Vehicle'
];

$exclusions = [
    ['k' => 'Parking', 'v' => 'Paid by customer at actuals', 'icon' => '<i class="fa-solid fa-square-p"></i>'],
    ['k' => 'Waiting', 'v' => 'Extra after 30 mins grace period', 'icon' => '<i class="fa-solid fa-hourglass-half"></i>']
];

// Extra KM charge note
$perKmRate = (isset($selectedEst['perKmRate']) && (float)$selectedEst['perKmRate'] > 0)
    ? (float)$selectedEst['perKmRate']
    : 0;
if ($perKmRate > 0) {
    $exclusions[] = ['k' => 'Extra KM', 'v' => 'Charged at ₹' . $perKmRate . '/KM beyond limit', 'icon' => '<i class="fa-solid fa-gauge-high"></i>'];
} else {
    $exclusions[] = ['k' => 'Extra KM', 'v' => 'Charged at vehicle per-KM rate', 'icon' => '<i class="fa-solid fa-gauge-high"></i>'];
}

if ($includeTolls) {
    if ($tollForInclusive > 0) {
        $inclusions[] = '<i class="fa-solid fa-road"></i> Fastag / Highway Tolls (Inclusive)';
    }
} else {
    $exclusions[] = ['k' => 'Highway Tolls', 'v' => 'Extra at actuals (Fastag)', 'icon' => '<i class="fa-solid fa-road"></i>'];
}

if ($includeTaxes) {
    if ($borderFeeTotal > 0) {
        $inclusions[] = '<i class="fa-solid fa-building-flag"></i> Inter-State Entry Taxes (Inclusive)';
    }
} else {
    $exclusions[] = ['k' => 'State Entry Taxes', 'v' => 'Extra at actuals (State Entry Tax)', 'icon' => '<i class="fa-solid fa-building-flag"></i>'];
}

// Handle AJAX update for breakdown & policies
if (isset($_POST['ajax_breakdown'])) {
    // Generate policy HTML for AJAX refresh
    ob_start();
    ?>
    <div class="fv-card fv-policy-card">
        <h4><i class="fa-solid fa-circle-check" style="color: #10b981;"></i> Standard Inclusions</h4>
        <ul class="fv-inc-list">
            <?php foreach ($inclusions as $inc): ?>
                <li><?php echo $inc; ?></li>
            <?php endforeach; ?>
        </ul>
    </div>
    <div class="fv-card fv-policy-card">
        <h4><i class="fa-solid fa-circle-info" style="color: #d97706;"></i> Exclusions & Notes</h4>
        <ul class="fv-exc-list">
            <?php foreach ($exclusions as $exc): ?>
                <li>
                    <span class="exc-key"><?php echo $exc['icon'] . ' ' . $exc['k']; ?>:</span>
                    <span class="exc-val"><?php echo $exc['v']; ?></span>
                </li>
            <?php endforeach; ?>
        </ul>
    </div>
    <?php
    $policyHtml = ob_get_clean();

    header('Content-Type: application/json');
    echo json_encode([
        'breakdown' => $breakdownHtml ?: '<p>Breakdown not available.</p>',
        'policies' => $policyHtml
    ]);
    exit;
}

// Map service type to readable label
$serviceLabels = [
    'one_way'          => 'One Way Trip',
    'round_trip'       => 'Round Trip',
    'hourly_rental'    => 'Hourly Rental',
    'multi_city'       => 'Multi-City Trip',
    'airport_transfer' => 'Airport Transfer'
];
$serviceLabel = $serviceLabels[$serviceType] ?? 'Standard Trip';

// ── Booking ID: always show something ─────────────────────────────────────
// booking_id can be NULL in DB for new enquiries; fall back to a prefixed record id
if (empty($bookingId)) {
    if (!empty($_fvRecordId) && $_fvRecordId > 0) {
        $prefix = ($_fvSource === 'booking') ? 'BOOK-' : 'ENQ-';
        $bookingId = $prefix . $_fvRecordId;
    } elseif (!empty($_GET['id'])) {
        $prefix = ($_fvSource === 'booking') ? 'BOOK-' : 'ENQ-';
        $bookingId = $prefix . (int)$_GET['id'];
    }
}

// ── Build print route string ───────────────────────────────────────────────
// For round trips show "Pickup → Stop1 → Drop → Return (Pickup)"
// For one-way / multi-city show "Pickup → Stop1 → Stop2 → Drop"
$_printStops = !empty($stops) ? $stops : [];
if ($serviceType === 'round_trip') {
    $printRouteParts = [$pickup];
    foreach ($_printStops as $_s) { $printRouteParts[] = $_s; }
    $printRouteParts[] = $drop;
    $printRouteParts[] = $pickup; // return leg
    $printRouteStr = implode(' ➔ ', $printRouteParts) . ' <em style="font-size:0.75em;font-weight:700;color:#d97706">(Round Trip)</em>';
} else {
    $printRouteParts = [$pickup];
    foreach ($_printStops as $_s) { $printRouteParts[] = $_s; }
    $printRouteParts[] = $drop;
    $printRouteStr = implode(' ➔ ', $printRouteParts);
}

// ── Customer details for print ─────────────────────────────────────────────
$printCustomerName  = $bookingPayload['customerName']  ?? '';
$printCustomerPhone = $bookingPayload['contactValue']  ?? '';
$printCustomerEmail = $bookingPayload['contactEmail']  ?? '';
$printTravelDate    = !empty($bookingPayload['travelDate'])
    ? date('d M Y', strtotime($bookingPayload['travelDate'])) : '';
$printTravelTime    = !empty($bookingPayload['travelTime'])
    ? date('h:i A', strtotime($bookingPayload['travelTime'])) : '';
?>

<div class="fv-container">
    <div class="print-estimation-header">
        <!-- Top bar: logo + document type -->
        <div class="print-header-top">
            <div class="print-logo"><img src="/assets/img/dropcars-logo-light.png" alt="Drop Cars Logo" style="height:36px; width:auto; max-width:170px; object-fit:contain; vertical-align:middle;" />
                <small style="display:block;font-size:0.35em;font-weight:600;color:#64748b;letter-spacing:0.04em;margin-top:2px;">www.dropcars.in</small>
            </div>
            <div style="text-align:right;">
                <div class="print-doc-type">Fare Estimation &amp; Trip Plan</div>
                <div style="font-size:0.75rem;color:#64748b;margin-top:2px;">
                    <i class="fa fa-phone"></i>&nbsp;<?php echo htmlspecialchars($fvAdvCfg['supportPhone'] ?? '+91 7200217986'); ?>&nbsp;&nbsp;
                    <i class="fa fa-envelope"></i>&nbsp;bookings@dropcars.in
                </div>
            </div>
        </div>

        <!-- Route banner -->
        <div class="print-route-banner">
            <div class="print-route-inner">
                <div class="print-route-point">
                    <span class="prp-dot prp-start"></span>
                    <div class="prp-text">
                        <span class="prp-label">Pickup</span>
                        <span class="prp-loc"><?php echo htmlspecialchars($pickup); ?></span>
                    </div>
                </div>
                <?php foreach ($_printStops as $_i => $_s): ?>
                <div class="print-route-arrow"><i class="fa fa-chevron-right"></i></div>
                <div class="print-route-point">
                    <span class="prp-dot prp-stop"></span>
                    <div class="prp-text">
                        <span class="prp-label">Stop <?php echo $_i + 1; ?></span>
                        <span class="prp-loc"><?php echo htmlspecialchars($_s); ?></span>
                    </div>
                </div>
                <?php endforeach; ?>
                <div class="print-route-arrow"><i class="fa fa-chevron-right"></i></div>
                <div class="print-route-point">
                    <span class="prp-dot prp-end"></span>
                    <div class="prp-text">
                        <span class="prp-label">Drop</span>
                        <span class="prp-loc"><?php echo htmlspecialchars($drop); ?></span>
                    </div>
                </div>
                <?php if ($serviceType === 'round_trip'): ?>
                <div class="print-route-arrow"><i class="fa fa-rotate-right" style="color:#d97706"></i></div>
                <div class="print-route-point">
                    <span class="prp-dot prp-return"></span>
                    <div class="prp-text">
                        <span class="prp-label" style="color:#d97706;">Return</span>
                        <span class="prp-loc" style="color:#d97706;"><?php echo htmlspecialchars($pickup); ?></span>
                    </div>
                </div>
                <?php endif; ?>
            </div>
        </div>

        <!-- Meta grid: booking info + customer details -->
        <div class="print-header-meta">
            <div class="phm-section">
                <div class="phm-title">Booking Details</div>
                <?php if (!empty($bookingId)): ?>
                <div class="phm-row"><span class="phm-k">Reference ID</span><span class="phm-v">#<?php echo htmlspecialchars(ltrim($bookingId, '#')); ?></span></div>
                <?php endif; ?>
                <div class="phm-row"><span class="phm-k">Generated</span><span class="phm-v"><?php echo date('d M Y, h:i A'); ?></span></div>
                <div class="phm-row"><span class="phm-k">Trip Type</span><span class="phm-v"><?php echo htmlspecialchars($serviceLabel); ?></span></div>
                <?php if ($printTravelDate): ?>
                <div class="phm-row"><span class="phm-k">Travel Date</span><span class="phm-v"><?php echo htmlspecialchars($printTravelDate . ($printTravelTime ? ' at ' . $printTravelTime : '')); ?></span></div>
                <?php endif; ?>
                <?php if ($distanceHint > 0): ?>
                <div class="phm-row"><span class="phm-k">Distance</span><span class="phm-v"><?php echo number_format($distanceHint, 0); ?> km</span></div>
                <?php endif; ?>
            </div>
            <div class="phm-section">
                <div class="phm-title">Customer &amp; Vehicle</div>
                <?php if (!empty($printCustomerName)): ?>
                <div class="phm-row"><span class="phm-k">Customer</span><span class="phm-v"><?php echo htmlspecialchars($printCustomerName); ?></span></div>
                <?php endif; ?>
                <?php if (!empty($printCustomerPhone)): ?>
                <div class="phm-row"><span class="phm-k">Phone</span><span class="phm-v"><?php echo htmlspecialchars($printCustomerPhone); ?></span></div>
                <?php endif; ?>
                <?php if (!empty($printCustomerEmail)): ?>
                <div class="phm-row"><span class="phm-k">Email</span><span class="phm-v"><?php echo htmlspecialchars($printCustomerEmail); ?></span></div>
                <?php endif; ?>
                <div class="phm-row"><span class="phm-k">Vehicle</span><span class="phm-v"><?php echo htmlspecialchars($selectedVehicle); ?></span></div>
                <div class="phm-row phm-total"><span class="phm-k">Quoted Fare</span><span class="phm-v">₹<?php echo number_format($displayTotal); ?></span></div>
            </div>
        </div>
    </div>

    <!-- Header Section -->
    <header class="fv-header">
        <div class="fv-header__left">
            <a href="<?php echo htmlspecialchars($_fvBackUrl); ?>" class="fv-back-btn" title="Go back">
                <i class="fa-solid fa-chevron-left"></i>
            </a>
            <div class="fv-title-stack">
                <span class="fv-badge-top"><?php echo htmlspecialchars($serviceLabel); ?></span>
                <h1>
                    <span>Customize Booking<?php if (!empty($bookingId)): ?> <span class="booking-id-header" style="font-size: 1.25rem; color: #64748b; font-weight: 600; margin-left: 0.25rem;">#<?php echo htmlspecialchars(ltrim($bookingId, '#')); ?></span><?php endif; ?></span>
                    <span class="fv-header-route" style="font-size: 1.1rem; color: #64748b; font-weight: 500; display: inline-flex; align-items: center; gap: 0.35rem; white-space: normal;">
                        (<span id="header-pickup-text"><?php echo htmlspecialchars($pickup); ?></span>
                        <?php if (!empty($stops)): ?>
                            <?php foreach ($stops as $s): ?>
                                <span style="color: var(--fv-primary); font-size: 0.95rem;">➔</span>
                                <span class="header-stop-text" style="color: #475569; font-weight: 500;"><?php echo htmlspecialchars($s); ?></span>
                            <?php endforeach; ?>
                        <?php endif; ?>
                        <span style="color: var(--fv-primary); font-size: 0.95rem;">➔</span>
                        <span id="header-drop-text"><?php echo htmlspecialchars($drop); ?></span>)
                    </span>
                </h1>
            </div>
        </div>
        <div class="fv-header__right">
            <div class="fv-stat-item">
                <span class="fv-stat-label"><?php echo ($routeKmRaw <= 0 && $pricingRouteKmOneWay > 0 && $distanceHint > 0) ? 'Quoted distance (fare basis)' : 'Estimated distance'; ?></span>
                <span class="fv-stat-value" title="<?php echo ($routeKmRaw <= 0 && $distanceHint > 0) ? 'Google Matrix route was not confirmed; fare uses route cache or minimum km rules. Use Full Map for real road distance.' : ''; ?>"><?php
                if ($distanceHint > 0) {
                    echo number_format($distanceHint, 1) . ' <small>KM</small>';
                    if ($routeKmRaw <= 0 && $pricingRouteKmOneWay > 0) {
                        echo ' <small style="color:#94a3b8;font-weight:600;">(not GPS — min./estimate)</small>';
                    }
                } else {
                    echo '--';
                }
                ?></span>
            </div>
            <div class="fv-stat-divider"></div>
            <div class="fv-stat-item">
                <span class="fv-stat-label">Estimated Time</span>
                <span class="fv-stat-value" id="admin-estimated-time"><?php echo htmlspecialchars($bookingPayload['durationHint'] ?? '--'); ?></span>
            </div>
        </div>
    </header>
    
    <div class="fv-content-grid">
        <!-- Main Analysis Column -->
        <div class="fv-main">
            <!-- Compact Route & Map Card -->
            <div class="fv-card fv-route-card" style="padding-top: 0;">
                <div class="fv-compact-map">
                    <?php
                    $mapOrigin = $pickup;
                    $mapDest = $drop;
                    $fvMapsKey = (defined('GOOGLE_MAPS_API_KEY') && (string) GOOGLE_MAPS_API_KEY !== '')
                        ? trim((string) GOOGLE_MAPS_API_KEY) : '';
                    if ($fvMapsKey !== '' && strpos($fvMapsKey, 'AIzaSyD7') === false) { // Don't use default mock key
                        $mapIframeSrc = 'https://www.google.com/maps/embed/v1/directions'
                            . '?key='         . rawurlencode($fvMapsKey)
                            . '&origin='      . rawurlencode($mapOrigin . ', India')
                            . '&destination=' . rawurlencode($mapDest   . ', India')
                            . '&mode=driving'
                            . '&language=en';
                    } else {
                        // Keyless direction fallback — always works on any domain, no billing locks
                        $mapIframeSrc = 'https://maps.google.com/maps?saddr='
                            . rawurlencode($mapOrigin . ', India')
                            . '&daddr=' . rawurlencode($mapDest . ', India')
                            . '&hl=en&t=m&output=embed';
                    }
                    $fullMapUrl = 'https://www.google.com/maps/dir/?api=1&origin=' . rawurlencode($mapOrigin) . '&destination=' . rawurlencode($mapDest);
                    ?>
                    <?php if ($mapIframeSrc !== ''): ?>
                    <iframe id="fv-map-iframe" width="100%" height="130" style="border:0;display:block;filter:grayscale(0.1) contrast(1.1);" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="<?php echo htmlspecialchars($mapIframeSrc, ENT_QUOTES, 'UTF-8'); ?>"></iframe>
                    <?php else: ?>
                    <div style="height:130px;display:flex;align-items:center;justify-content:center;background:#f1f5f9;font-size:0.8rem;color:#64748b;">Map unavailable — no Maps API key configured.</div>
                    <?php endif; ?>
                    <a id="fv-full-map-link" href="<?php echo htmlspecialchars($fullMapUrl, ENT_QUOTES, 'UTF-8'); ?>" target="_blank" style="position: absolute; bottom: 10px; right: 10px; background: rgba(255,255,255,0.9); padding: 4px 10px; border-radius: 8px; font-size: 0.65rem; font-weight: 800; color: #1e293b; text-decoration: none; border: 1px solid #e2e8f0; backdrop-filter: blur(4px);">
                        FULL MAP <i class="fa-solid fa-up-right-from-square" style="font-size: 0.6rem; margin-left: 2px;"></i>
                    </a>
                </div>

                <div class="fv-route-path" style="padding: 0 0.25rem; display: flex; align-items: center; justify-content: space-between;">
                    <div class="fv-route-point fv-pickup" style="flex: 1;">
                        <div class="fv-point-marker f-start"></div>
                        <div class="fv-point-info">
                            <span class="fv-point-label">Pickup Location</span>
                            <span class="fv-point-text" id="fv-pickup-text"><?php echo htmlspecialchars($pickup); ?></span>
                        </div>
                    </div>
                    <button type="button" id="btn-swap-locations" style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; background: #0f172a; color: white; border: none; cursor: pointer; transition: all 0.2s; align-self: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); margin: 0 0.75rem; z-index: 10;" title="Swap Locations">
                        <i class="fa-solid fa-right-left" style="font-size: 0.85rem;"></i>
                    </button>
                    <div class="fv-route-point fv-drop" style="flex: 1;">
                        <div class="fv-point-info">
                            <span class="fv-point-label">Drop Destination</span>
                            <span class="fv-point-text" id="fv-drop-text"><?php echo htmlspecialchars($drop); ?></span>
                        </div>
                        <div class="fv-point-marker f-end"></div>
                    </div>
                </div>

                <?php if (!empty($stops)): ?>
                <div class="fv-route-stops" style="margin-top: 0.75rem; padding: 0.6rem 0.8rem; background: #f8fafc; border-top: 1px dashed #e2e8f0; border-radius: 0 0 14px 14px; display: flex; flex-direction: column; gap: 6px;">
                    <div style="font-size: 0.65rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 4px;">
                        <i class="fa-solid fa-map-pin" style="color: #6366f1;"></i> Intermediate Stops
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
                        <?php foreach ($stops as $idx => $stop): ?>
                            <span class="fv-stop-badge" style="display: inline-flex; align-items: center; gap: 4px; background: white; border: 1px solid #cbd5e1; padding: 3px 8px; border-radius: 8px; font-size: 0.78rem; font-weight: 600; color: #334155;">
                                <span style="display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; background: #e0e7ff; color: #4f46e5; border-radius: 50%; font-size: 0.6rem; font-weight: 800;"><?php echo $idx + 1; ?></span>
                                <?php echo htmlspecialchars($stop); ?>
                            </span>
                            <?php if ($idx < count($stops) - 1): ?>
                                <i class="fa-solid fa-chevron-right" style="font-size: 0.65rem; color: #94a3b8;"></i>
                            <?php endif; ?>
                        <?php endforeach; ?>
                    </div>
                </div>
                <?php endif; ?>

                <div style="display: none;">
                    <span id="admin-toll-display-val"><?php echo (int) $tollForInclusive; ?></span>
                    <input type="hidden" id="admin-toll-input" name="admin_toll" value="<?php echo (int) $tollForInclusive; ?>" />
                    <small id="admin-toll-source"></small>
                    <input type="hidden" id="admin-border-count" value="<?php echo count($seenBorders); ?>" />
                </div>
            </div>

            <!-- Breakdown Detail -->
            <div class="fv-card fv-breakdown-card">
                <div class="fv-card-header" style="justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
                    <div class="fv-card-title">
                        <i class="fa-solid fa-calculator"></i>
                        <h3>Calculation Breakdown</h3>
                    </div>
                    <div class="fv-breakdown-header-right">
                        <div class="fv-vehicle-tabs">
                            <button class="fv-vtab active" data-v="all">ALL</button>
                            <button class="fv-vtab" data-v="sedan">SEDAN</button>
                            <button class="fv-vtab" data-v="suv">SUV</button>
                            <button class="fv-vtab" data-v="innova">INNOVA</button>
                            <button class="fv-vtab" data-v="crysta">CRYSTA</button>
                        </div>
                        <a href="<?php echo function_exists('admin_url') ? admin_url('print-estimation', ['id' => $_fvRecordId, 'source' => $_fvSource]) : 'print-estimation'; ?>"
                           target="_blank"
                           class="fv-quote-btn"
                           id="btn-view-quotation"
                           title="Open professional fare quotation page">
                            <i class="fa-solid fa-file-invoice"></i> View Quotation
                        </a>
                    </div>
                </div>
                <div class="fv-card-body">
                    <div id="admin-fare-breakdown-html" class="fv-breakdown-v6">
                        <?php if ($breakdownHtml): ?>
                            <?php echo $breakdownHtml; ?>
                        <?php else: ?>
                            <div class="fv-empty-state">
                                <img src="<?php echo dropcars_url('admin/assets/img/empty-fare.svg'); ?>" alt="No Data" onerror="this.src='https://cdn-icons-png.flaticon.com/512/7486/7486744.png'" style="width: 80px; opacity: 0.5;">
                                <p>Detailed breakdown not available for this session.</p>
                            </div>
                        <?php endif; ?>
                    </div>
                </div>
            </div>

            <div id="admin-policy-section-html" class="fv-info-grid">
                <div class="fv-card fv-policy-card">
                    <h4><i class="fa-solid fa-circle-check" style="color: #10b981;"></i> Standard Inclusions</h4>
                    <ul class="fv-inc-list">
                        <?php foreach ($inclusions as $inc): ?>
                            <li><?php echo $inc; ?></li>
                        <?php endforeach; ?>
                    </ul>
                </div>
                <div class="fv-card fv-policy-card">
                    <h4><i class="fa-solid fa-circle-info" style="color: #d97706;"></i> Exclusions & Notes</h4>
                    <ul class="fv-exc-list">
                        <?php foreach ($exclusions as $exc): ?>
                            <li>
                                <span class="exc-key"><?php echo $exc['icon'] . ' ' . $exc['k']; ?>:</span>
                                <span class="exc-val"><?php echo $exc['v']; ?></span>
                            </li>
                        <?php endforeach; ?>
                    </ul>
                </div>
            </div>
        </div>

        <!-- Sidebar Summary & Actions -->
        <div class="fv-sidebar">
            <div class="fv-sticky-box">
                <div class="fv-summary-card">
                    <div class="fv-summary-top">
                        <div class="fv-vehicle-info">
                            <span class="fv-v-label">Selected Vehicle</span>
                            <span class="fv-v-name"><?php echo htmlspecialchars($selectedVehicle); ?></span>
                        </div>
                    </div>

                    <?php
                    $initialWaiting = 0;
                    $initialWaitingRate = 150;
                    $initialWaitingHours = 1;

                    if (isset($bookingPayload['fareBreakdown']['vehicles'][$selectedVehicle])) {
                        $vData = $bookingPayload['fareBreakdown']['vehicles'][$selectedVehicle];
                        $initialBaseKmFare = (float)($vData['kmCharge'] ?? 0);
                        $initialDriverBata = (float)($vData['driverBata'] ?? $vData['driverBataTotal'] ?? 0);
                        $initialPerKmRate = (float)($vData['perKmRate'] ?? 0);
                        $initialBillableKm = (float)($vData['effectiveBillableKm'] ?? 0);
                        $initialDriverBataPerDay = (float)($vData['driverBataPerDay'] ?? $vData['driverBata'] ?? 0);
                        $initialDriverBataMultiplier = (float)($vData['tripDays'] ?? ($bookingPayload['fareBreakdown']['tripDays'] ?? 1));
                        $initialNightAllowance = (float)($vData['driverNightAllowance'] ?? $vData['multiCityNightAllowance'] ?? 0);
                        $initialParking = (float)($vData['parkingCharges'] ?? $vData['parking'] ?? 0);
                        $initialWaiting = (float)($vData['waitingCharges'] ?? $vData['waiting'] ?? 0);
                        
                        if (isset($vData['waitingRate']) && (float)$vData['waitingRate'] > 0) {
                            $initialWaitingRate = (float)$vData['waitingRate'];
                        }
                        if (isset($vData['waitingHours']) && (float)$vData['waitingHours'] > 0) {
                            $initialWaitingHours = (float)$vData['waitingHours'];
                        } elseif ($initialWaiting > 0) {
                            $initialWaitingHours = $initialWaiting / $initialWaitingRate;
                        }
                    } elseif ($initialWaiting > 0) {
                        $initialWaitingHours = $initialWaiting / $initialWaitingRate;
                    }
                    if ($initialBaseKmFare <= 0) {
                        $initialBaseKmFare = (float)($selectedEst['kmCharge'] ?? 0);
                    }
                    if ($initialDriverBata <= 0) {
                        $initialDriverBata = (float)($selectedEst['driverBata'] ?? $selectedEst['driverBataTotal'] ?? 0);
                    }
                    if ($initialPerKmRate <= 0) {
                        $initialPerKmRate = (float)($selectedEst['perKmRate'] ?? 0);
                    }
                    if ($initialBillableKm <= 0) {
                        $initialBillableKm = (float)($selectedEst['effectiveBillableKm'] ?? 0);
                    }
                    if ($initialDriverBataPerDay <= 0) {
                        $initialDriverBataPerDay = (float)($selectedEst['driverBataPerDay'] ?? $selectedEst['driverBata'] ?? 0);
                    }
                    if ($initialDriverBataMultiplier <= 0) {
                        $initialDriverBataMultiplier = (float)($selectedEst['tripDays'] ?? 1);
                    }
                    if ($initialDriverBataMultiplier <= 0) {
                        $initialDriverBataMultiplier = 1;
                    }

                    $includeTolls = isset($bookingPayload['fareBreakdown']['includeTolls'])
                        ? (bool)$bookingPayload['fareBreakdown']['includeTolls']
                        : $isInclusive;
                    $includeTaxes = isset($bookingPayload['fareBreakdown']['includeTaxes'])
                        ? (bool)$bookingPayload['fareBreakdown']['includeTaxes']
                        : $isInclusive;
                    $taxCount = isset($bookingPayload['fareBreakdown']['overrideTaxCount'])
                        ? (int)$bookingPayload['fareBreakdown']['overrideTaxCount']
                        : $borderCrossCount;
                    $taxRate = isset($bookingPayload['fareBreakdown']['overrideTaxAmount'])
                        ? (int)$bookingPayload['fareBreakdown']['overrideTaxAmount']
                        : $baseTax;

                    $initialNotes = $bookingPayload['dispatcherNotes'] ?? '';
                    $initialEndDate = !empty($bookingPayload['endDate']) ? $bookingPayload['endDate'] : '';
                    $initialDropTime = !empty($bookingPayload['dropTime']) ? $bookingPayload['dropTime'] : '';
                    $initialTravelDate = !empty($bookingPayload['travelDate']) ? $bookingPayload['travelDate'] : '';
                    $initialTravelTime = !empty($bookingPayload['travelTime']) ? $bookingPayload['travelTime'] : '';
                    ?>
                    <div class="fv-options-group" style="display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.85rem;">
                        <!-- Base KM Fare calculation & override -->
                        <div style="background: #f8fafc; padding: 0.65rem 0.75rem; border-radius: 10px; border: 1px solid #cbd5e1; display: flex; flex-direction: column; gap: 6px;">
                            <span style="font-size: 0.82rem; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 4px;"><i class="fa-solid fa-calculator" style="color: #64748b; font-size: 0.85rem;"></i> KM Fare Calculation</span>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                                <div style="display: flex; flex-direction: column; gap: 2px;">
                                    <label style="font-size: 0.65rem; font-weight: 700; color: #64748b;">Rate / KM (₹)</label>
                                    <input type="number" id="admin-per-km-rate-input" min="0" step="0.1" value="<?php echo $initialPerKmRate; ?>" style="padding: 0.25rem 0.4rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.8rem; font-weight: 700; color: #0f172a; background: white;" />
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 2px;">
                                    <label style="font-size: 0.65rem; font-weight: 700; color: #64748b;">Billable KM</label>
                                    <input type="number" id="admin-billable-km-input" min="0" step="0.1" value="<?php echo $initialBillableKm; ?>" style="padding: 0.25rem 0.4rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.8rem; font-weight: 700; color: #0f172a; background: white;" />
                                </div>
                            </div>
                            <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px dashed #cbd5e1; padding-top: 4px; margin-top: 2px;">
                                <span style="font-size: 0.78rem; font-weight: 700; color: #334155;">Base KM Fare <small style="color:#64748b; font-weight:500;">(editable)</small></span>
                                <div style="display: flex; align-items: center; gap: 3px; background: white; border: 1px solid #cbd5e1; border-radius: 6px; padding: 0.15rem 0.35rem;">
                                    <span style="font-weight: 800; color: #64748b; font-size: 0.8rem;">₹</span>
                                    <input type="number" id="admin-base-km-fare-input" min="0" step="1" inputmode="numeric" 
                                        value="<?php echo (int)$initialBaseKmFare; ?>"
                                        style="width: 75px; border: none; font-size: 0.85rem; font-weight: 700; color: #0f172a; outline: none; text-align: right;" />
                                </div>
                            </div>
                        </div>

                        <!-- Driver Bata calculation & override -->
                        <div style="background: #f8fafc; padding: 0.65rem 0.75rem; border-radius: 10px; border: 1px solid #cbd5e1; display: flex; flex-direction: column; gap: 6px;">
                            <span style="font-size: 0.82rem; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 4px;"><i class="fa-solid fa-user-tie" style="color: #64748b; font-size: 0.85rem;"></i> Driver Bata Calculation</span>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                                <div style="display: flex; flex-direction: column; gap: 2px;">
                                    <label style="font-size: 0.65rem; font-weight: 700; color: #64748b;">Bata / Day (₹)</label>
                                    <input type="number" id="admin-driver-bata-per-day-input" min="0" step="1" value="<?php echo (int)$initialDriverBataPerDay; ?>" style="padding: 0.25rem 0.4rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.8rem; font-weight: 700; color: #0f172a; background: white;" />
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 2px;">
                                    <label style="font-size: 0.65rem; font-weight: 700; color: #64748b;">Days Multiplier</label>
                                    <input type="number" id="admin-driver-bata-multiplier-input" min="0.5" step="0.5" value="<?php echo $initialDriverBataMultiplier; ?>" style="padding: 0.25rem 0.4rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.8rem; font-weight: 700; color: #0f172a; background: white;" />
                                </div>
                            </div>
                            <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px dashed #cbd5e1; padding-top: 4px; margin-top: 2px;">
                                <span style="font-size: 0.78rem; font-weight: 700; color: #334155;">Driver Bata <small style="color:#64748b; font-weight:500;">(editable)</small></span>
                                <div style="display: flex; align-items: center; gap: 3px; background: white; border: 1px solid #cbd5e1; border-radius: 6px; padding: 0.15rem 0.35rem;">
                                    <span style="font-weight: 800; color: #64748b; font-size: 0.8rem;">₹</span>
                                    <input type="number" id="admin-driver-bata-input" min="0" step="1" inputmode="numeric" 
                                        value="<?php echo (int)$initialDriverBata; ?>"
                                        style="width: 75px; border: none; font-size: 0.85rem; font-weight: 700; color: #0f172a; outline: none; text-align: right;" />
                                </div>
                            </div>
                        </div>

                        <!-- Driver Night Allowance, Parking and Waiting -->
                        <div style="background: #f8fafc; padding: 0.65rem 0.75rem; border-radius: 10px; border: 1px solid #cbd5e1; display: flex; flex-direction: column; gap: 6px;">
                            <span style="font-size: 0.82rem; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 4px;"><i class="fa-solid fa-coins" style="color: #64748b; font-size: 0.85rem;"></i> Allowances & Extra Charges</span>
                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                <!-- Driver Night Allowance -->
                                <div style="display: flex; flex-direction: column; gap: 4px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 6px;">
                                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.78rem; font-weight: 700; color: #334155; user-select: none; margin: 0;">
                                        <input type="checkbox" id="admin-night-allowance-checkbox" <?php echo $initialNightAllowance > 0 ? 'checked' : ''; ?> style="width: 14px; height: 14px; accent-color: var(--fv-primary); cursor: pointer;" />
                                        Include Driver Night Allowance
                                    </label>
                                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-left: 22px;">
                                        <span style="font-size: 0.7rem; color: #64748b;">Amount:</span>
                                        <div style="display: flex; align-items: center; gap: 3px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 0.1rem 0.3rem; background: white;">
                                            <span style="font-size: 0.7rem; font-weight: 700; color: #64748b;">₹</span>
                                            <input type="number" id="admin-night-allowance-input" min="0" step="1" 
                                                value="<?php echo (int)$initialNightAllowance; ?>"
                                                style="width: 70px; border: none; font-size: 0.8rem; font-weight: 700; color: #0f172a; outline: none; text-align: right;" />
                                        </div>
                                    </div>
                                </div>
                                <!-- Parking Charges -->
                                <div style="display: flex; flex-direction: column; gap: 4px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 6px;">
                                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.78rem; font-weight: 700; color: #334155; user-select: none; margin: 0;">
                                        <input type="checkbox" id="admin-parking-charges-checkbox" <?php echo $initialParking > 0 ? 'checked' : ''; ?> style="width: 14px; height: 14px; accent-color: var(--fv-primary); cursor: pointer;" />
                                        Include Parking Charges
                                    </label>
                                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-left: 22px;">
                                        <span style="font-size: 0.7rem; color: #64748b;">Amount:</span>
                                        <div style="display: flex; align-items: center; gap: 3px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 0.1rem 0.3rem; background: white;">
                                            <span style="font-size: 0.7rem; font-weight: 700; color: #64748b;">₹</span>
                                            <input type="number" id="admin-parking-charges-input" min="0" step="1" 
                                                value="<?php echo (int)$initialParking; ?>"
                                                style="width: 70px; border: none; font-size: 0.8rem; font-weight: 700; color: #0f172a; outline: none; text-align: right;" />
                                        </div>
                                    </div>
                                </div>
                                <!-- Waiting Charges -->
                                <div style="display: flex; flex-direction: column; gap: 4px;">
                                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.78rem; font-weight: 700; color: #334155; user-select: none; margin: 0;">
                                        <input type="checkbox" id="admin-waiting-charges-checkbox" <?php echo $initialWaiting > 0 ? 'checked' : ''; ?> style="width: 14px; height: 14px; accent-color: var(--fv-primary); cursor: pointer;" />
                                        Include Waiting Charges
                                    </label>
                                    <div style="display: grid; grid-template-columns: 1fr 1.2fr; gap: 6px; padding-left: 22px; margin-top: 2px;">
                                        <div style="display: flex; flex-direction: column; gap: 2px;">
                                            <label style="font-size: 0.65rem; font-weight: 700; color: #64748b;">Hours</label>
                                            <input type="number" id="admin-waiting-hours-input" min="0" step="0.5" value="<?php echo $initialWaitingHours; ?>" style="padding: 0.2rem 0.35rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.75rem; font-weight: 700; color: #0f172a; background: white;" />
                                        </div>
                                        <div style="display: flex; flex-direction: column; gap: 2px;">
                                            <label style="font-size: 0.65rem; font-weight: 700; color: #64748b;">Rate / Hr (₹)</label>
                                            <input type="number" id="admin-waiting-rate-input" min="0" step="1" value="<?php echo $initialWaitingRate; ?>" style="padding: 0.2rem 0.35rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.75rem; font-weight: 700; color: #0f172a; background: white;" />
                                        </div>
                                    </div>
                                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-left: 22px; margin-top: 4px;">
                                        <span style="font-size: 0.7rem; color: #64748b;">Total Amount:</span>
                                        <div style="display: flex; align-items: center; gap: 3px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 0.1rem 0.3rem; background: #f8fafc;">
                                            <span style="font-size: 0.7rem; font-weight: 700; color: #64748b;">₹</span>
                                            <input type="number" id="admin-waiting-charges-input" min="0" step="1" readonly 
                                                value="<?php echo (int)$initialWaiting; ?>"
                                                style="width: 70px; border: none; font-size: 0.8rem; font-weight: 700; color: #0f172a; outline: none; text-align: right; background: transparent;" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Trip Start Schedule (editable) -->
                        <div style="background: #f8fafc; padding: 0.65rem 0.75rem; border-radius: 10px; border: 1px solid #cbd5e1; display: flex; flex-direction: column; gap: 6px;">
                            <span style="font-size: 0.82rem; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 4px;"><i class="fa-solid fa-calendar-day" style="color: #64748b; font-size: 0.85rem;"></i> Trip Start Schedule</span>
                            <div style="display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 6px;">
                                <div style="display: flex; flex-direction: column; gap: 2px;">
                                    <label style="font-size: 0.65rem; font-weight: 700; color: #64748b;">Start Date</label>
                                    <input type="date" id="admin-start-date" value="<?php echo htmlspecialchars($initialTravelDate); ?>" style="padding: 0.25rem 0.4rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.8rem; font-weight: 750; color: #0f172a; background: white;" />
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 2px;">
                                    <label style="font-size: 0.65rem; font-weight: 700; color: #64748b; display: flex; justify-content: space-between; align-items: center;">
                                        <span>Start Time</span>
                                        <span id="admin-start-time-ampm" style="font-size: 0.68rem; font-weight: 800; color: #d97706;"></span>
                                    </label>
                                    <input type="time" id="admin-start-time" value="<?php echo htmlspecialchars($initialTravelTime); ?>" style="padding: 0.25rem 0.4rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.8rem; font-weight: 750; color: #0f172a; background: white;" />
                                </div>
                            </div>
                        </div>

                        <!-- Trip End Time (auto-calculated & editable) -->
                        <div style="background: #f8fafc; padding: 0.65rem 0.75rem; border-radius: 10px; border: 1px solid #cbd5e1; display: flex; flex-direction: column; gap: 6px;">
                            <span style="font-size: 0.82rem; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 4px;"><i class="fa-solid fa-clock" style="color: #64748b; font-size: 0.85rem;"></i> Trip End Schedule</span>
                            <div style="display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 6px;">
                                <div style="display: flex; flex-direction: column; gap: 2px;">
                                    <label style="font-size: 0.65rem; font-weight: 700; color: #64748b;">End Date</label>
                                    <input type="date" id="admin-end-date" value="<?php echo htmlspecialchars($initialEndDate); ?>" style="padding: 0.25rem 0.4rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.8rem; font-weight: 750; color: #0f172a; background: white;" />
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 2px;">
                                    <label style="font-size: 0.65rem; font-weight: 700; color: #64748b; display: flex; justify-content: space-between; align-items: center;">
                                        <span>End Time</span>
                                        <span id="admin-end-time-ampm" style="font-size: 0.68rem; font-weight: 800; color: #d97706;"></span>
                                    </label>
                                    <input type="time" id="admin-end-time" value="<?php echo htmlspecialchars($initialDropTime); ?>" style="padding: 0.25rem 0.4rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.8rem; font-weight: 750; color: #0f172a; background: white;" />
                                </div>
                            </div>
                            <span style="font-size: 0.62rem; color: #64748b; text-align: left; font-weight: 600;">(Auto-computed from route duration. Edit to override.)</span>
                        </div>

                        <!-- Highway Tolls Checkbox & Amount -->
                        <div style="background: #f8fafc; padding: 0.5rem 0.75rem; border-radius: 10px; border: 1px solid #cbd5e1; display: flex; flex-direction: column; gap: 6px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.85rem; font-weight: 700; color: #1e293b; user-select: none; margin: 0;">
                                    <input type="checkbox" id="admin-toll-include-checkbox" <?php echo $includeTolls ? 'checked' : ''; ?> style="width: 15px; height: 15px; accent-color: var(--fv-primary); cursor: pointer;" />
                                    Include Highway Tolls
                                </label>
                            </div>
                            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                                <span style="font-size: 0.75rem; color: #64748b;">Toll Amount:</span>
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <button type="button" id="btn-admin-toll-reset" style="padding: 0.15rem 0.35rem; font-size: 0.62rem; font-weight: 700; color: #64748b; background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer; transition: all 0.2s;">Reset to ₹2/km</button>
                                    <div style="display: flex; align-items: center; gap: 4px; background: white; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0.15rem 0.35rem;">
                                        <span style="font-weight: 800; color: #64748b; font-size: 0.85rem;">₹</span>
                                        <input type="number" id="admin-toll-amount-input" min="0" step="1" inputmode="numeric" 
                                            value="<?php echo (int)$tollForInclusive; ?>"
                                            style="width: 60px; border: none; font-size: 0.9rem; font-weight: 700; color: #0f172a; outline: none; text-align: right;" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- State Entry Tax Checkbox, Crossings Count & Rate -->
                        <div style="background: #f8fafc; padding: 0.5rem 0.75rem; border-radius: 10px; border: 1px solid #cbd5e1; display: flex; flex-direction: column; gap: 6px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.85rem; font-weight: 700; color: #1e293b; user-select: none; margin: 0;">
                                    <input type="checkbox" id="admin-tax-include-checkbox" <?php echo $includeTaxes ? 'checked' : ''; ?> style="width: 15px; height: 15px; accent-color: var(--fv-primary); cursor: pointer;" />
                                    Include State Entry Tax
                                </label>
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 6px;">
                                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                                    <span style="font-size: 0.75rem; color: #64748b;">Crossings:</span>
                                    <input type="number" id="admin-tax-count-input" min="0" max="10" 
                                        value="<?php echo (int)$taxCount; ?>"
                                        style="width: 50px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem; font-weight: 700; color: #0f172a; padding: 0.2rem; text-align: center;" />
                                </div>
                                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                                    <span style="font-size: 0.75rem; color: #64748b;">Rate per crossing:</span>
                                    <div style="display: flex; align-items: center; gap: 3px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 0.15rem 0.35rem; background: white;">
                                        <span style="font-size: 0.75rem; font-weight: 700; color: #64748b;">₹</span>
                                        <input type="number" id="admin-tax-rate-input" min="0" 
                                            value="<?php echo (int)$taxRate; ?>"
                                            style="width: 50px; border: none; font-size: 0.85rem; font-weight: 700; color: #0f172a; outline: none; text-align: right;" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Notes Box description -->
                        <div style="background: #f8fafc; padding: 0.65rem 0.75rem; border-radius: 10px; border: 1px solid #cbd5e1; display: flex; flex-direction: column; gap: 4px;">
                            <span style="font-size: 0.82rem; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 4px;"><i class="fa-solid fa-file-signature" style="color: #64748b; font-size: 0.85rem;"></i> Modification Description</span>
                            <textarea id="admin-notes-input" style="width: 100%; min-height: 60px; padding: 0.4rem; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.8rem; font-family: inherit; resize: vertical;" placeholder="Explain the reasons for adjusting this fare (e.g. high demand, customized package, etc.)..."><?php echo htmlspecialchars($initialNotes); ?></textarea>
                        </div>

                        <!-- Manual Override -->
                        <div style="background: #f8fafc; padding: 0.5rem 0.75rem; border-radius: 10px; border: 1px solid #cbd5e1; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                            <div style="display: flex; flex-direction: column;">
                                <span style="font-size: 0.85rem; font-weight: 700; color: #1e293b; text-align: left;">Set Fare Manually</span>
                                <span style="font-size: 0.65rem; color: #64748b; text-align: left;">(override)</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 4px; background: white; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0.15rem 0.35rem;">
                                <span style="font-weight: 800; color: #64748b; font-size: 0.85rem;">₹</span>
                                <input type="number" id="admin-manual-fare" min="0" placeholder="auto"
                                    value="<?php echo $displayTotal !== $baseEstimate + $tollForInclusive + $borderFeeTotal ? (int)$displayTotal : ''; ?>"
                                    style="width: 80px; border: none; font-size: 0.9rem; font-weight: 700; color: #0f172a; outline: none; text-align: right;" />
                            </div>
                        </div>
                    </div>

                    <div class="fv-price-display">
                        <span class="fv-p-label">Total Estimate</span>
                        <h2 id="admin-total-fare">₹<?php echo number_format($displayTotal); ?></h2>
                        <?php
                        $badgeClass = ($includeTolls || $includeTaxes) ? 'badge-inclusive' : 'badge-exclusive';
                        if ($includeTolls && $includeTaxes) {
                            $badgeText = 'Inclusive (Toll/Tax Included)';
                        } elseif ($includeTolls) {
                            $badgeText = 'Inclusive (Tolls Included, Taxes Extra)';
                        } elseif ($includeTaxes) {
                            $badgeText = 'Inclusive (Taxes Included, Tolls Extra)';
                        } else {
                            $badgeText = 'Exclusive (+ Toll/Tax Extra)';
                        }
                        ?>
                        <span id="admin-fare-type-badge" class="fv-price-badge <?php echo $badgeClass; ?>">
                            <?php echo $badgeText; ?>
                        </span>
                    </div>

                    <div class="fv-share-section">
                        <h4 style="font-size: 0.82rem; font-weight: 800; text-transform: uppercase; color: var(--fv-text-light); letter-spacing: 0.05em; margin: 0 0 0.6rem; display: flex; align-items: center; gap: 0.5rem;">
                            <i class="fa-solid fa-share-nodes" style="color: var(--fv-accent-dark);"></i> Share &amp; Export Quote
                        </h4>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; width: 100%;">
                            <button id="btn-sidebar-print" class="btn-share btn-print" style="width: 100%; min-width: 0; font-size: 0.78rem;">
                                <i class="fa-solid fa-print"></i> Print
                            </button>
                            <button id="btn-sidebar-whatsapp" class="btn-share btn-whatsapp" style="width: 100%; min-width: 0; font-size: 0.78rem;">
                                <i class="fa-brands fa-whatsapp"></i> WhatsApp
                            </button>
                        </div>
                    </div>

                    <!-- Admin Management & CRM Tools — pinned below all sections -->
                    <div class="fv-actions" style="margin-top: 0.75rem; border-top: 1px solid var(--fv-border); padding-top: 0.75rem;">
                        <h4 style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: var(--fv-text-light); letter-spacing: 0.06em; margin: 0 0 0.6rem; display: flex; align-items: center; gap: 0.4rem;">
                            <i class="fa-solid fa-sliders" style="color: var(--fv-accent-dark);"></i> Admin Management &amp; CRM
                        </h4>
                        <?php if (empty($_fvSource)): ?>
                        <button id="admin-btn-confirm" class="fv-btn-primary">
                            <i class="fa-solid fa-bolt"></i>
                            Confirm Booking
                        </button>
                        <button id="admin-btn-enquiry" class="fv-btn-secondary">
                            <i class="fa-solid fa-paper-plane"></i>
                            Send as CRM Enquiry
                        </button>
                        <?php endif; ?>
                        <?php if ($_fvSource === 'enquiry' || $_fvSource === 'booking'): ?>
                        <div style="background: #eff6ff; padding: 0.5rem 0.75rem; border-radius: 10px; border: 1px solid #bfdbfe; display: flex; align-items: center; gap: 8px; width: 100%; margin-bottom: 8px;">
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.82rem; font-weight: 750; color: #1e3a8a; user-select: none; margin: 0; text-align: left; width: 100%;">
                                <input type="checkbox" id="admin-send-notification-checkbox" checked style="width: 16px; height: 16px; accent-color: #2563eb; cursor: pointer;" />
                                Send Quote Update to Customer
                            </label>
                        </div>
                        <button id="admin-btn-save-fare" class="fv-btn-save-fare">
                            <i class="fa-solid fa-floppy-disk"></i>
                            Save Changes to Record
                        </button>
                        <?php endif; ?>
                    </div>

                    <div class="fv-meta-footer">
                        <a href="<?php echo htmlspecialchars($_fvBackUrl); ?>" class="fv-link-back">
                            <i class="fa-solid fa-rotate-left"></i> <?php echo htmlspecialchars($_fvBackLabel); ?>
                        </a>
                        <p class="fv-disclaimer">Estimates are based on live traffic and standard routes. Final fare may vary slightly based on actual meter readings.</p>
                    </div>
                </div>

                <div id="admin-response-el" class="fv-feedback-el"></div>
            </div>
        </div>
    </div>

    <!-- Print Only Footer Note -->
    <div class="print-footer-note">
        <p>This estimation is based on standard routes and live traffic data. Final fares may vary based on actual route taken, waiting time, and any additional requests during the trip.</p>
        <p><strong>Drop Cars • Your Trusted Travel Partner</strong></p>
    </div>
</div>

<style>
/* PREMIUM DESIGN SYSTEM: FARE VIEW V3 — Admin gold/navy */
:root {
    --fv-primary: #0f172a;            /* navy — accents, icons, active text */
    --fv-primary-dark: #1e293b;
    --fv-accent: #f7b733;             /* gold — primary CTA + highlights */
    --fv-accent-dark: #f59e0b;
    --fv-accent-soft: #fffbeb;        /* gold tint background */
    --fv-accent-border: #fde68a;
    --fv-success: #16a34a;
    --fv-danger: #ef4444;
    --fv-text: #1e293b;
    --fv-text-light: #64748b;
    --fv-bg: #f8fafc;
    --fv-card-bg: #ffffff;
    --fv-border: #e9eef5;
    --fv-shadow: 0 4px 12px -2px rgba(15, 23, 42, 0.08), 0 1px 3px rgba(15, 23, 42, 0.04);
}

.fv-vtab { background: transparent; border: none; padding: 0.25rem 0.6rem; border-radius: 8px; font-weight: 700; font-size: 0.72rem; cursor: pointer; color: #64748b; transition: all 0.2s; text-transform: uppercase; letter-spacing: 0.05em; }
.fv-vtab:hover { color: #0f172a; background: rgba(255,255,255,0.6); }
.fv-vtab.active { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #f7b733; box-shadow: 0 3px 8px rgba(15,23,42,0.15); }

.fv-toll-input {
    width: 6.5rem;
    max-width: 100%;
    padding: 0.3rem 0.5rem;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    font-size: 0.95rem;
    font-weight: 700;
    color: #0f172a;
    background: #fff;
    height: 32px;
}
.fv-toll-input:focus {
    outline: none;
    border-color: #f7b733;
    box-shadow: 0 0 0 3px rgba(247, 183, 51, 0.25);
}
#btn-admin-toll-reset:hover { border-color: #cbd5e1; color: #334155; background: #f8fafc; }

/* Print icon button styling */
.fv-icon-btn {
    background: #fffbeb !important;
    border: 1px solid #fde68a !important;
    color: #d97706 !important;
    width: 32px !important;
    height: 32px !important;
    border-radius: 8px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    cursor: pointer !important;
    transition: all 0.2s !important;
    font-size: 0.85rem !important;
    padding: 0 !important;
    box-shadow: 0 2px 4px rgba(217, 119, 6, 0.1);
}
.fv-icon-btn:hover {
    background: #fef3c7 !important;
    color: #b45309 !important;
    transform: scale(1.05);
    box-shadow: 0 3px 6px rgba(217, 119, 6, 0.15);
}

/* View Quotation Button */
.fv-quote-btn {
    display: inline-flex !important;
    align-items: center !important;
    gap: 0.4rem !important;
    padding: 0.45rem 0.9rem !important;
    font-size: 0.78rem !important;
    font-weight: 700 !important;
    text-decoration: none !important;
    background: linear-gradient(135deg, #0f172a, #1e293b) !important;
    color: white !important;
    border-radius: 8px !important;
    border: none !important;
    cursor: pointer !important;
    white-space: nowrap !important;
    transition: all 0.2s !important;
    box-shadow: 0 2px 4px rgba(15, 23, 42, 0.15) !important;
    height: 32px !important; /* Keep same height as print icon button */
    box-sizing: border-box !important;
}
.fv-quote-btn:hover {
    background: linear-gradient(135deg, #1e293b, #334155) !important;
    color: white !important;
    transform: scale(1.03) !important;
    box-shadow: 0 4px 6px rgba(15, 23, 42, 0.2) !important;
}

/* Fix sidebar input sizing to prevent overflow issues */
#admin-per-km-rate-input,
#admin-billable-km-input,
#admin-driver-bata-per-day-input,
#admin-driver-bata-multiplier-input,
#admin-waiting-hours-input,
#admin-waiting-rate-input,
#admin-start-date,
#admin-start-time,
#admin-end-date,
#admin-end-time {
    width: 100% !important;
    box-sizing: border-box !important;
}

/* Sidebar Share and Export Section styling */
.fv-share-section {
    margin-top: 1rem;
    border-top: 1px solid var(--fv-border);
    padding-top: 0.75rem;
}
.btn-share {
    height: 38px;
    border-radius: 10px;
    font-size: 0.82rem;
    font-weight: 800;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
    text-decoration: none;
    letter-spacing: 0.01em;
}
.btn-print {
    background: #f1f5f9;
    color: #1e293b;
    border: 1.5px solid #cbd5e1;
}
.btn-print:hover {
    background: #e2e8f0;
    color: #0f172a;
    border-color: #94a3b8;
    transform: translateY(-1px);
}
.btn-whatsapp {
    background: #25D366;
    color: white;
    box-shadow: 0 3px 8px rgba(37, 211, 102, 0.2);
}
.btn-whatsapp:hover {
    background: #20ba5a;
    transform: translateY(-1px);
    box-shadow: 0 5px 12px rgba(37, 211, 102, 0.3);
}

.fv-btn-toll-update {
    padding: 0.3rem 0.6rem;
    font-size: 0.68rem;
    font-weight: 800;
    color: #fff;
    background: #0f766e;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    letter-spacing: 0.02em;
}
.fv-btn-toll-update:hover { background: #0d9488; }
.fv-btn-toll-update:disabled { opacity: 0.5; cursor: not-allowed; }

.fv-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0.25rem 0.75rem 1rem;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    color: var(--fv-text);
}

/* Header */
.fv-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
    padding: 0.4rem 0;
}
.fv-header__left {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
    min-width: 0;
}
.fv-back-btn {
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: white;
    border: 1px solid var(--fv-border);
    border-radius: 10px;
    color: var(--fv-text-light);
    text-decoration: none;
    transition: all 0.2s;
}
.fv-back-btn:hover {
    background: #f1f5f9;
    color: var(--fv-primary);
    transform: translateX(-2px);
}
.fv-title-stack {
    min-width: 0;
}
.fv-title-stack h1 {
    font-size: 1.35rem;
    font-weight: 850;
    margin: 0;
    letter-spacing: -0.02em;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
}
.fv-badge-top {
    font-size: 0.7rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #92400e;
    background: var(--fv-accent-soft);
    border: 1px solid var(--fv-accent-border);
    padding: 1px 7px;
    border-radius: 999px;
    margin-bottom: 0.2rem;
    display: inline-block;
}
.fv-header__right {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    background: white;
    padding: 0.4rem 0.85rem;
    border-radius: 14px;
    border: 1px solid var(--fv-border);
    box-shadow: 0 2px 4px -1px rgba(0,0,0,0.03);
    gap: 0.75rem;
}
.fv-stat-divider {
    width: 1px;
    height: 24px;
    background: var(--fv-border);
    display: block;
}
@media (max-width: 640px) {
    .fv-stat-divider { display: none; }
}
.fv-stat-item {
    display: flex;
    flex-direction: column;
}
.fv-stat-label {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--fv-text-light);
}
.fv-stat-value {
    font-size: 1rem;
    font-weight: 800;
}
.fv-stat-value small { font-size: 0.75rem; opacity: 0.6; }

/* Grid Layout */
.fv-content-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 1rem;
    align-items: start;
}
@media (max-width: 1100px) {
    .fv-content-grid { grid-template-columns: minmax(0, 1fr) 290px; gap: 0.85rem; }
}

/* Cards */
.fv-card {
    background: var(--fv-card-bg);
    border-radius: 14px;
    border: 1px solid var(--fv-border);
    padding: 1rem;
    margin-bottom: 0.75rem;
    box-shadow: var(--fv-shadow);
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.fv-card:hover {
    transform: translateY(-1px);
    box-shadow: 0 12px 20px -5px rgba(15, 23, 42, 0.06), 0 4px 6px -2px rgba(15, 23, 42, 0.02);
}
.fv-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
}
.fv-card-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 800;
}
.fv-card-title i { color: var(--fv-primary); font-size: 1rem; }
.fv-card-title h3 { margin: 0; font-size: 1rem; }

/* Compact Map Container */
.fv-compact-map {
    margin: 0 -1rem 1rem;
    height: 130px;
    position: relative;
    overflow: hidden;
    border-radius: 14px 14px 0 0;
}

/* Route Card */
.fv-route-path {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.25rem;
}
.fv-route-point {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
}
.fv-pickup {
    justify-content: flex-start;
    text-align: left;
}
.fv-drop {
    justify-content: flex-end;
    text-align: right;
}
.fv-drop .fv-point-info {
    margin-right: 0.5rem;
    margin-left: 0;
}
.fv-point-marker {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    position: relative;
}
.fv-point-marker::after {
    content: '';
    position: absolute;
    top: -3px; right: -3px; bottom: -3px; left: -3px;
    border-radius: 50%;
    border: 1px solid currentColor;
    opacity: 0.3;
}
.f-start { background: #f7b733; color: #f7b733; }
.f-end { background: #ef4444; color: #ef4444; }
.fv-point-info { display: flex; flex-direction: column; min-width: 0; }
.fv-point-label { font-size: 0.62rem; font-weight: 700; color: var(--fv-text-light); text-transform: uppercase; letter-spacing: 0.02em; }
.fv-point-text { font-size: 0.85rem; font-weight: 650; line-height: 1.3; margin-top: 1px; word-break: break-word; }
.fv-route-line {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    color: var(--fv-border);
}
.fv-route-line i { font-size: 1rem; color: #cbd5e1; }

/* Breakdown Styling */
.fv-breakdown-v6 .block-title {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--fv-text-light);
    text-transform: uppercase;
    margin-bottom: 0.75rem;
    display: none;
}
.fv-breakdown-v6 table.kv {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0 0.35rem;
    table-layout: fixed;
}
.fv-breakdown-v6 table.kv td {
    padding: 0.45rem 0;
    font-size: 0.88rem;
    border-bottom: 1px solid #f8fafc;
    word-break: break-word;
    vertical-align: top;
}
.fv-breakdown-v6 table.kv td.k { width: 45%; font-weight: 500; color: var(--fv-text-light); }
.fv-breakdown-v6 table.kv td.v { width: 55%; text-align: right; font-weight: 600; padding-left: 0.5rem; }
.fv-breakdown-v6 table.kv tr[style*="background"] td {
    background: #f8fafc !important;
    padding: 0.45rem 0.75rem;
    border-radius: 8px;
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.05em;
    color: var(--fv-primary);
}

/* -- Policy Lists -- */
.fv-inc-list, .fv-exc-list { list-style: none; padding: 0; margin: 0; }
.fv-inc-list li { margin-bottom: 0.45rem; font-size: 0.8rem; font-weight: 600; display: flex; align-items: center; gap: 0.5rem; color: #334155; }
.fv-inc-list li i { color: var(--fv-success); font-size: 0.9rem; width: 16px; text-align: center; }

.fv-exc-list li { margin-bottom: 0.45rem; font-size: 0.8rem; display: flex; flex-direction: column; gap: 0.15rem; }
.fv-exc-list li .exc-key { font-weight: 700; color: #475569; display: flex; align-items: center; gap: 0.4rem; }
.fv-exc-list li .exc-key i { color: #94a3b8; font-size: 0.85rem; width: 16px; text-align: center; }
.fv-exc-list li .exc-val { color: var(--fv-text-light); }

/* ─────────────────────────────────────────────────────────────────────────
   PRINT / PDF STYLES — Professional Fare Estimation Document
   ───────────────────────────────────────────────────────────────────────── */
@page { margin: 0; size: A4 portrait; }

/* Screen: hide print-only elements */
.print-estimation-header, .print-footer-note { display: none; }

@media print {
    /* ── Reset layout constraints ────────────────────────────────── */
    html, body { height: auto !important; overflow: visible !important; background: white !important; }
    .main-content, .admin-content, .fv-container { height: auto !important; overflow: visible !important; }
    * { animation: none !important; transition: none !important; }
    body { 
        -webkit-print-color-adjust: exact; 
        print-color-adjust: exact; 
        font-family: 'Inter', sans-serif; 
        margin: 0 !important;
        padding: 1.2cm 1.5cm !important;
    }

    /* ── Hide all admin / interactive chrome ─────────────────────── */
    .fv-header, .fv-back-btn, .fv-sidebar, .sidebar,
    .mobile-header, header, footer, .admin-footer,
    .fv-toll-insight, .fv-icon-btn, .fv-vehicle-tabs,
    .fv-empty-state, .fv-compact-map,
    .fv-toll-action, #btn-admin-toll-apply, #btn-admin-toll-reset,
    .fv-btn-toll-audit, .manual-entry-box, #btn-swap-locations,
    .fv-sticky-box, .fv-summary-card,
    .fv-options-group, .fv-price-display, .fv-actions,
    .fv-share-section, .fv-meta-footer, .fv-feedback-el,
    #admin-response-el, .fv-breakdown-header-right { display: none !important; }

    /* ── Reset containers to full-width flow ─────────────────────── */
    .main-content, .admin-content { margin: 0 !important; padding: 0 !important; width: 100% !important; max-width: 100% !important; }
    .fv-container { padding: 0 !important; width: 100% !important; max-width: 100% !important; }
    .fv-content-grid { display: block !important; margin: 0 !important; }
    .fv-main { width: 100% !important; margin: 0 !important; }
    .fv-card { border: none !important; box-shadow: none !important; padding: 0 !important; margin-bottom: 1.5rem !important; background: transparent !important; }

    /* ══════════════════════════════════════════════════════════════
       PROFESSIONAL PRINT HEADER
       ══════════════════════════════════════════════════════════════ */
    .print-estimation-header {
        display: block !important;
        margin-bottom: 1.5rem !important;
        page-break-inside: avoid;
    }

    /* Top bar: logo + document title */
    .print-header-top {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        background: #0f172a !important;
        color: white !important;
        padding: 0.85rem 1.25rem !important;
        border-radius: 12px 12px 0 0 !important;
    }
    .print-logo {
        font-size: 1.8rem !important;
        font-weight: 900 !important;
        color: white !important;
        line-height: 1 !important;
        letter-spacing: -0.03em !important;
    }
    .print-logo span { color: #f7b733 !important; }
    .print-logo small { display: block; font-size: 0.4em !important; font-weight: 500 !important; color: #94a3b8 !important; letter-spacing: 0.05em !important; margin-top: 3px; }
    .print-doc-type {
        font-size: 1rem !important;
        font-weight: 800 !important;
        color: #f7b733 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.08em !important;
    }

    /* ── Route Banner ─────────────────────────────────────────────── */
    .print-route-banner {
        display: block !important;
        background: linear-gradient(135deg, #f0f9ff 0%, #fffbeb 100%) !important;
        border: 1px solid #e2e8f0 !important;
        border-top: none !important;
        padding: 1rem 1.25rem !important;
    }
    .print-route-inner {
        display: flex !important;
        align-items: center !important;
        gap: 0.5rem !important;
        flex-wrap: wrap !important;
    }
    .print-route-point {
        display: flex !important;
        align-items: center !important;
        gap: 0.5rem !important;
    }
    .prp-dot {
        display: inline-block !important;
        width: 10px !important;
        height: 10px !important;
        border-radius: 50% !important;
        flex-shrink: 0 !important;
    }
    .prp-start  { background: #22c55e !important; }
    .prp-stop   { background: #6366f1 !important; }
    .prp-end    { background: #ef4444 !important; }
    .prp-return { background: #f59e0b !important; }
    .prp-text {
        display: flex !important;
        flex-direction: column !important;
    }
    .prp-label {
        font-size: 0.58rem !important;
        font-weight: 700 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.05em !important;
        color: #94a3b8 !important;
        line-height: 1 !important;
    }
    .prp-loc {
        font-size: 0.82rem !important;
        font-weight: 700 !important;
        color: #1e293b !important;
        line-height: 1.2 !important;
    }
    .print-route-arrow {
        color: #cbd5e1 !important;
        font-size: 0.7rem !important;
        flex-shrink: 0 !important;
        padding: 0 0.1rem !important;
    }

    /* ── Meta info grid: booking details + customer ───────────────── */
    .print-header-meta {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 0 !important;
        border: 1px solid #e2e8f0 !important;
        border-top: none !important;
        border-radius: 0 0 12px 12px !important;
        margin-bottom: 1.5rem !important;
        overflow: hidden !important;
    }
    .phm-section {
        padding: 0.85rem 1.25rem !important;
    }
    .phm-section:first-child {
        border-right: 1px solid #e2e8f0 !important;
    }
    .phm-title {
        font-size: 0.65rem !important;
        font-weight: 800 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.08em !important;
        color: #94a3b8 !important;
        margin-bottom: 0.5rem !important;
        padding-bottom: 0.35rem !important;
        border-bottom: 1px solid #f1f5f9 !important;
    }
    .phm-row {
        display: flex !important;
        justify-content: space-between !important;
        align-items: baseline !important;
        gap: 0.5rem !important;
        padding: 0.2rem 0 !important;
    }
    .phm-k {
        font-size: 0.75rem !important;
        color: #64748b !important;
        font-weight: 500 !important;
        white-space: nowrap !important;
    }
    .phm-v {
        font-size: 0.78rem !important;
        color: #1e293b !important;
        font-weight: 700 !important;
        text-align: right !important;
    }
    .phm-total .phm-k { color: #0f172a !important; font-weight: 700 !important; }
    .phm-total .phm-v {
        font-size: 1rem !important;
        color: #15803d !important;
        font-weight: 900 !important;
    }

    /* ── Route path (the in-card one from main content) ──────────── */
    .fv-route-path {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 2rem !important;
        padding: 1rem !important;
        background: #fff !important;
        border: 1px solid #e2e8f0 !important;
        border-radius: 12px !important;
        margin-bottom: 1.5rem !important;
    }
    .fv-route-path:has(+ .fv-route-stops) { margin-bottom: 0 !important; border-radius: 12px 12px 0 0 !important; }
    .fv-point-marker { width: 10px !important; height: 10px !important; margin-top: 4px; }
    .fv-point-label  { font-size: 0.7rem !important; color: #94a3b8 !important; }
    .fv-point-text   { font-size: 1rem !important; font-weight: 700 !important; color: #1e293b !important; }
    .fv-route-line   { display: none !important; }

    /* Intermediate stops */
    .fv-route-stops {
        margin-top: -1px !important;
        border: 1px solid #e2e8f0 !important;
        border-top: 1px dashed #cbd5e1 !important;
        border-radius: 0 0 12px 12px !important;
        background: #f8fafc !important;
        padding: 0.75rem 1rem !important;
        page-break-inside: avoid;
    }
    .fv-stop-badge {
        background: white !important; border: 1px solid #cbd5e1 !important;
        padding: 3px 8px !important; border-radius: 8px !important;
        font-size: 0.78rem !important; color: #334155 !important;
        display: inline-flex !important; align-items: center !important; gap: 4px !important;
    }

    /* ── Breakdown table ─────────────────────────────────────────── */
    .fv-card-header { margin-bottom: 1rem !important; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.5rem; }
    .fv-card-title h3 { font-size: 1.1rem !important; color: #1e293b !important; }
    .fv-breakdown-v6 table.kv td { border-bottom: 1px solid #f1f5f9 !important; padding: 0.4rem 0 !important; font-size: 0.85rem !important; }
    .fv-veh-group {
        border: 1.5px solid #e2e8f0 !important;
        border-radius: 15px !important;
        padding: 1.25rem !important;
        margin-bottom: 1.5rem !important;
        page-break-inside: avoid;
        background: white !important;
    }

    /* ── Policy (inclusions / exclusions) ────────────────────────── */
    .fv-info-grid {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 1.5rem !important;
        margin-top: 1.5rem !important;
        page-break-inside: avoid;
    }
    .fv-policy-card {
        border: 1px solid #e2e8f0 !important;
        border-radius: 15px !important;
        padding: 1.25rem !important;
        background: #fcfdfe !important;
    }
    .fv-policy-card h4 {
        margin-top: 0 !important;
        margin-bottom: 1rem !important;
        font-size: 0.9rem !important;
        border-bottom: 1px solid #e2e8f0;
        padding-bottom: 0.5rem;
    }
    .fv-inc-list li, .fv-exc-list li { margin-bottom: 0.5rem !important; font-size: 0.8rem !important; }

    /* ── Footer disclaimer ───────────────────────────────────────── */
    .print-footer-note {
        display: block !important;
        margin-top: 3rem;
        padding-top: 1rem;
        border-top: 2px solid #0f172a;
        font-size: 0.72rem;
        color: #64748b;
        text-align: center;
        line-height: 1.6;
    }
    .print-footer-note strong { color: #0f172a; }
}

/* Sidebar Widget */
.fv-sticky-box { position: sticky; top: 1rem; z-index: 100; }
.fv-summary-card {
    background: white;
    border-radius: 18px;
    padding: 1rem;
    border: 1px solid var(--fv-border);
    border-top: 4px solid var(--fv-accent);   /* gold accent rail */
    box-shadow: 0 15px 30px -10px rgba(15, 23, 42, 0.08);
}
.fv-summary-top {
    text-align: center;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--fv-border);
    margin-bottom: 0.75rem;
}
.fv-v-label { font-size: 0.7rem; font-weight: 700; color: var(--fv-text-light); text-transform: uppercase; letter-spacing: 0.04em; }
.fv-v-name { display: block; font-size: 1.1rem; font-weight: 850; color: var(--fv-primary); margin-top: 0.15rem; }
.fv-price-display { margin-top: 0.5rem; margin-bottom: 1.25rem; background: linear-gradient(160deg, var(--fv-accent-soft) 0%, #ffffff 70%); border: 1px solid var(--fv-accent-border); border-radius: 12px; padding: 0.6rem 0.75rem; text-align: center; }
.fv-p-label { font-size: 0.72rem; font-weight: 700; color: #b45309; text-transform: uppercase; letter-spacing: 0.05em; }
.fv-price-display h2 { font-size: 2.15rem; font-weight: 900; margin: 0.1rem 0 0.25rem; letter-spacing: -0.04em; color: #0f172a; }
.fv-price-badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 100px;
    font-size: 0.65rem;
    font-weight: 800;
    text-transform: uppercase;
}
.badge-inclusive { background: #dcfce7; color: #166534; }
.badge-exclusive { background: #fee2e2; color: #991b1b; }

/* Switches */
.fv-option-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #f8fafc;
    padding: 1rem;
    border-radius: 14px;
    margin-bottom: 1.5rem;
}
.fv-option-text strong { display: block; font-size: 0.9rem; }
.fv-option-text span { font-size: 0.72rem; color: var(--fv-text-light); }

.fv-switch { position: relative; display: inline-block; width: 40px; height: 22px; }
.fv-switch input { opacity: 0; width: 0; height: 0; }
.fv-slider {
    position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
    background-color: #cbd5e1; transition: .4s;
}
.fv-slider:before {
    position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px;
    background-color: white; transition: .4s;
}
input:checked + .fv-slider { background-color: var(--fv-primary); }
input:checked + .fv-slider:before { transform: translateX(18px); }
.fv-slider.round { border-radius: 34px; }
.fv-slider.round:before { border-radius: 50%; }

/* Buttons */
.fv-actions { display: flex; flex-direction: column; gap: 0.5rem; }
.fv-btn-primary {
    width: 100%;
    height: 44px;
    background: linear-gradient(135deg, #f7b733 0%, #f59e0b 100%);
    color: #0f172a;
    border: none;
    border-radius: 12px;
    font-size: 0.95rem;
    font-weight: 800;
    letter-spacing: 0.01em;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 6px 12px -3px rgba(247, 183, 51, 0.4);
}
.fv-btn-primary:hover:not(:disabled) { filter: brightness(1.04); transform: translateY(-1px); box-shadow: 0 10px 18px -4px rgba(247, 183, 51, 0.45); }
.fv-btn-primary:active:not(:disabled) { transform: translateY(0); }
.fv-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

.fv-btn-secondary {
    width: 100%;
    height: 40px;
    background: white;
    color: var(--fv-text);
    border: 1px solid var(--fv-border);
    border-radius: 12px;
    font-size: 0.85rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    cursor: pointer;
    transition: all 0.2s;
}
.fv-btn-secondary:hover:not(:disabled) { background: #f8fafc; border-color: #cbd5e1; }

.fv-btn-save-fare {
    width: 100%;
    height: 40px;
    background: #f0fdf4;
    color: #166534;
    border: 1.5px solid #bbf7d0;
    border-radius: 12px;
    font-size: 0.85rem;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    cursor: pointer;
    transition: all 0.2s;
    letter-spacing: 0.01em;
}
.fv-btn-save-fare:hover:not(:disabled) { background: #dcfce7; border-color: #86efac; transform: translateY(-1px); }
.fv-btn-save-fare:disabled { opacity: 0.55; cursor: not-allowed; }

.fv-meta-footer { text-align: center; margin-top: 0.85rem; }
.fv-link-back {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--fv-text-light);
    text-decoration: none;
    margin-bottom: 0.5rem;
}
.fv-link-back:hover { color: var(--fv-primary); }
.fv-disclaimer { font-size: 0.65rem; color: var(--fv-text-light); line-height: 1.4; padding: 0 0.5rem; }

/* Feedback */
.fv-feedback-el { margin-top: 0.75rem; border-radius: 12px; overflow: hidden; transition: all 0.3s; }

/* Utilities */
.fv-empty-state { text-align: center; padding: 2rem 1rem; color: var(--fv-text-light); }
.fv-empty-state p { margin-top: 0.75rem; font-size: 0.85rem; }

/* -- Breakdown header right group ----------------------------- */
.fv-breakdown-header-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
}
.fv-vehicle-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    background: #f1f5f9;
    padding: 0.25rem;
    border-radius: 8px;
}

/* -- Responsive --------------------------------------------- */
@media screen and (max-width: 860px) {
    .fv-content-grid { grid-template-columns: 1fr; gap: 0.75rem; }
    .fv-summary-card { margin-bottom: 0.75rem !important; }
    .fv-header__right { justify-content: space-between; width: 100%; padding: 0.5rem 0.75rem; }
}

@media screen and (max-width: 768px) {
    .fv-container { padding: 0.4rem 0.5rem 1.5rem; }

    /* Header */
    .fv-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
        padding: 0.25rem 0;
    }
    .fv-header__right {
        width: 100%;
        padding: 0.4rem 0.75rem;
        border-radius: 12px;
        justify-content: space-around;
    }
    .fv-stat-divider { margin: 0 0.5rem; }
    .fv-title-stack h1 { font-size: 1.15rem; }

    /* Route path: side-by-side on mobile */
    .fv-route-path {
        flex-direction: row !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 0.35rem !important;
        padding: 0.25rem 0.15rem !important;
        width: 100% !important;
    }
    .fv-route-point {
        flex: 1 !important;
        width: auto !important;
        gap: 0.35rem !important;
        min-width: 0 !important;
    }
    .fv-pickup {
        justify-content: flex-start !important;
        text-align: left !important;
    }
    .fv-drop {
        justify-content: flex-start !important;
        text-align: left !important;
    }
    .fv-drop .fv-point-marker {
        order: -1 !important; /* Keep dot on left of text */
        margin-right: 0 !important;
    }
    .fv-drop .fv-point-info {
        order: 1 !important;
        margin-right: 0 !important;
        margin-left: 0 !important;
        text-align: left !important;
    }
    #btn-swap-locations {
        align-self: center !important;
        margin: 0 0.25rem !important;
        flex-shrink: 0 !important;
    }
    .fv-route-line {
        display: none !important;
    }
    .fv-point-text { font-size: 0.82rem; }

    /* Toll insight: stack badges on mobile */
    .fv-toll-insight {
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 0.75rem !important;
        padding: 0.75rem !important;
    }
    .fv-toll-badge[id="admin-state-tax-insight"] {
        border-left: none !important;
        border-top: 1px solid #e2e8f0 !important;
        padding-left: 0 !important;
        padding-top: 0.75rem !important;
        margin-left: 0 !important;
    }
    .fv-toll-action { flex-direction: row !important; align-items: center !important; flex-wrap: wrap; }

    /* Breakdown card header */
    .fv-card-header { flex-direction: column; align-items: flex-start !important; }
    .fv-breakdown-header-right { width: 100%; }
    .fv-vehicle-tabs { width: 100%; justify-content: flex-start; }

    /* Info grid: single column */
    .fv-info-grid { grid-template-columns: 1fr; }

    /* Summary card padding */
    .fv-summary-card { padding: 1rem; border-radius: 14px; }
    .fv-price-display h2 { font-size: 1.85rem; }

    /* Compact map */
    .fv-compact-map { height: 130px !important; margin: 0 -0.75rem 0.75rem !important; }
    .fv-card { padding: 0.75rem; margin-bottom: 0.5rem; border-radius: 12px; }
    .fv-breakdown-v6 table.kv td { padding: 0.35rem 0; font-size: 0.82rem; }
    .fv-breakdown-v6 table.kv tr[style*="background"] td { padding: 0.35rem 0.5rem; }
}

/* WhatsApp Share Modal Styles */
.wa-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    z-index: 999999 !important;
    overflow-y: auto;
    padding: 1.5rem 1rem;
    box-sizing: border-box;
    animation: waFadeIn 0.2s ease-out;
}
@media (min-width: 768px) {
    .wa-modal-overlay {
        padding: 3rem 2rem;
    }
}
.wa-modal-content {
    background: #ffffff;
    width: 100%;
    max-width: 600px;
    border-radius: 16px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    border: 1px solid #e2e8f0;
    overflow: hidden;
    margin-top: 1.5rem;
    animation: waSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
@media (min-width: 768px) {
    .wa-modal-content {
        margin: auto;
        max-width: 720px;
    }
}
.wa-modal-header {
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid #f1f5f9;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #f8fafc;
}
.wa-modal-header h3 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 800;
    color: #0f172a;
    display: flex;
    align-items: center;
    gap: 8px;
}
.wa-modal-header h3 i {
    color: #25D366;
    font-size: 1.25rem;
}
.wa-close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #94a3b8;
    transition: color 0.15s;
    line-height: 1;
    padding: 0;
}
.wa-close-btn:hover {
    color: #475569;
}
.wa-modal-body {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
}
.wa-form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
.wa-label {
    font-size: 0.78rem;
    font-weight: 750;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}
.wa-input {
    padding: 0.65rem 0.85rem;
    border: 1.5px solid #cbd5e1;
    border-radius: 10px;
    font-size: 0.9rem;
    font-weight: 600;
    color: #0f172a;
    transition: all 0.15s;
}
.wa-input:focus {
    outline: none;
    border-color: #25D366;
    box-shadow: 0 0 0 3px rgba(37, 211, 102, 0.15);
}
.wa-textarea {
    font-family: inherit;
    font-size: 0.85rem;
    line-height: 1.55;
    color: #1e293b;
    padding: 0.85rem;
    border: 1.5px solid #cbd5e1;
    border-radius: 10px;
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    white-space: pre-wrap;
    transition: all 0.15s;
}
.wa-textarea:focus {
    outline: none;
    border-color: #25D366;
    box-shadow: 0 0 0 3px rgba(37, 211, 102, 0.15);
}
.wa-template-tabs {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.35rem;
    background: #f1f5f9;
    padding: 0.25rem;
    border-radius: 10px;
}
@media (min-width: 600px) {
    .wa-template-tabs {
        grid-template-columns: repeat(4, 1fr);
    }
}
.wa-tab-btn {
    background: transparent;
    border: none;
    padding: 0.5rem;
    font-size: 0.75rem;
    font-weight: 700;
    border-radius: 8px;
    cursor: pointer;
    color: #64748b;
    transition: all 0.2s;
    text-align: center;
}
.wa-tab-btn:hover {
    color: #0f172a;
}
.wa-tab-btn.active {
    background: #ffffff;
    color: #0f172a;
    box-shadow: 0 2px 4px rgba(15, 23, 42, 0.05);
}
.wa-modal-footer {
    padding: 1rem 1.5rem;
    border-top: 1px solid #f1f5f9;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    background: #f8fafc;
}
@media (min-width: 480px) {
    .wa-modal-footer {
        flex-direction: row;
        justify-content: flex-end;
    }
}
.wa-primary-btn {
    background: #25D366;
    color: white;
    font-weight: 750;
    font-size: 0.85rem;
    padding: 0.65rem 1.25rem;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    box-shadow: 0 4px 6px rgba(37, 211, 102, 0.15);
    width: 100%;
}
@media (min-width: 480px) {
    .wa-primary-btn {
        width: auto;
    }
}
.wa-primary-btn:hover {
    background: #20ba56;
    transform: translateY(-1px);
    box-shadow: 0 6px 12px rgba(37, 211, 102, 0.2);
}
.wa-secondary-btn {
    background: #ffffff;
    color: #475569;
    border: 1.5px solid #cbd5e1;
    font-weight: 700;
    font-size: 0.85rem;
    padding: 0.65rem 1.25rem;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
}
@media (min-width: 480px) {
    .wa-secondary-btn {
        width: auto;
    }
}
.wa-secondary-btn:hover {
    background: #f8fafc;
    color: #0f172a;
    border-color: #94a3b8;
}

@keyframes waFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}
@keyframes waSlideUp {
    from { transform: translateY(16px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
}
</style>

<script>
window.DROP_CARS_BASE_PATH    = '<?php echo dropcars_url(''); ?>';
window.DROP_CARS_FARE_VIEW_DATA = <?php echo json_encode($fareData, JSON_HEX_TAG | JSON_HEX_AMP); ?>;
window.DROP_CARS_PERMIT_CHARGES = <?php echo json_encode($fvPermit, JSON_HEX_TAG | JSON_HEX_AMP); ?>;
window.DROP_CARS_WA_CONFIRM_TPL = <?php echo json_encode((string) ($fvConfig['company']['whatsappTemplates']['confirmation'] ?? ''), JSON_HEX_TAG | JSON_HEX_AMP); ?>;
window.DROP_CARS_FV_RECORD_ID   = <?php echo (int)$_fvRecordId; ?>;
window.DROP_CARS_FV_SOURCE      = <?php echo json_encode($_fvSource); ?>;
window.DROP_CARS_FV_ADMIN_URL   = '<?php echo dropcars_url('admin/api/update-fare.php'); ?>';
window.DROP_CARS_UPI_ID         = <?php echo json_encode($fvUpiId, JSON_HEX_TAG | JSON_HEX_AMP); ?>;
window.DROP_CARS_SUPPORT_PHONE  = <?php echo json_encode($fvAdvCfg['supportPhone'] ?? '+91 7200217986', JSON_HEX_TAG | JSON_HEX_AMP); ?>;
window.DROP_CARS_ADVANCE_PERCENT = <?php echo (int)$fvAdvancePercent; ?>;

document.addEventListener('DOMContentLoaded', function() {
    // ── Diagnostic: runs first, always visible in browser console ──────────
    console.log('[DropCars FV] Script loaded. RECORD_ID=', window.DROP_CARS_FV_RECORD_ID,
        'SOURCE=', window.DROP_CARS_FV_SOURCE,
        'save-btn-exists=', !!document.getElementById('admin-btn-save-fare'));
    // ───────────────────────────────────────────────────────────────────────

    // Responsive DOM alignment: move summary card under route card on mobile
    function adjustDomForMobile() {
        const routeCard = document.querySelector('.fv-route-card');
        const summaryCard = document.querySelector('.fv-summary-card');
        const stickyBox = document.querySelector('.fv-sticky-box');
        if (window.innerWidth <= 860) {
            if (routeCard && summaryCard && summaryCard.parentNode !== routeCard.parentNode) {
                routeCard.parentNode.insertBefore(summaryCard, routeCard.nextSibling);
            }
        } else {
            if (stickyBox && summaryCard && summaryCard.parentNode !== stickyBox) {
                stickyBox.insertBefore(summaryCard, stickyBox.firstChild);
            }
        }
    }
    adjustDomForMobile();
    window.addEventListener('resize', adjustDomForMobile);

    const data = window.DROP_CARS_FARE_VIEW_DATA;
    const btnConfirm = document.getElementById('admin-btn-confirm');
    const btnEnquiry = document.getElementById('admin-btn-enquiry');
    const responseEl = document.getElementById('admin-response-el');
    const totalEl = document.getElementById('admin-total-fare');
    const badgeEl = document.getElementById('admin-fare-type-badge');
    const manualFareInput = document.getElementById('admin-manual-fare');

    let basePayload = data.payload || {};

    function getEffectiveFareType() {
        const tollInclude = document.getElementById('admin-toll-include-checkbox');
        const taxInclude = document.getElementById('admin-tax-include-checkbox');
        const isToll = tollInclude ? tollInclude.checked : false;
        const isTax = taxInclude ? taxInclude.checked : false;
        return (isToll || isTax) ? 'inclusive' : 'exclusive';
    }
    /**
     * Infer which Indian state a location text belongs to.
     * Priority: 1) Google Places-derived state, 2) State name in text, 3) City dictionary.
     */
    function inferStateFromLocation(locationText, fieldKey) {
        // 1. Best source: Google Places API state (accurate for any location)
        if (fieldKey && window.DropCarsPlaceStates && window.DropCarsPlaceStates[fieldKey]) {
            return window.DropCarsPlaceStates[fieldKey].toString().toLowerCase().trim();
        }

        const text = (locationText || '').toString().toLowerCase();
        if (!text) return '';

        // 2. State name in the address text
        const knownStates = ['tamil nadu', 'karnataka', 'kerala', 'andhra pradesh', 'telangana', 'puducherry', 'pondicherry', 'maharashtra', 'goa', 'gujarat'];
        for (let i = 0; i < knownStates.length; i += 1) {
            if (text.includes(knownStates[i])) {
                return knownStates[i] === 'pondicherry' ? 'puducherry' : knownStates[i];
            }
        }

        // 3. City dictionary fallback
        const cityToState = {
            // Tamil Nadu
            chennai: 'tamil nadu', coimbatore: 'tamil nadu', madurai: 'tamil nadu', trichy: 'tamil nadu',
            tiruchirappalli: 'tamil nadu', vellore: 'tamil nadu', salem: 'tamil nadu', erode: 'tamil nadu',
            tirunelveli: 'tamil nadu', thanjavur: 'tamil nadu', dindigul: 'tamil nadu', karur: 'tamil nadu',
            namakkal: 'tamil nadu', krishnagiri: 'tamil nadu', dharmapuri: 'tamil nadu', cuddalore: 'tamil nadu',
            villupuram: 'tamil nadu', kanchipuram: 'tamil nadu', chengalpattu: 'tamil nadu', thiruvallur: 'tamil nadu',
            nagapattinam: 'tamil nadu', thiruvarur: 'tamil nadu', ramanathapuram: 'tamil nadu', sivagangai: 'tamil nadu',
            virudhunagar: 'tamil nadu', thoothukudi: 'tamil nadu', tenkasi: 'tamil nadu', nilgiris: 'tamil nadu',
            ooty: 'tamil nadu', coonoor: 'tamil nadu', kodaikanal: 'tamil nadu', yercaud: 'tamil nadu', tiruppur: 'tamil nadu',
            ariyalur: 'tamil nadu', pudukkottai: 'tamil nadu', theni: 'tamil nadu', kallakurichi: 'tamil nadu',
            tirupattur: 'tamil nadu', ranipet: 'tamil nadu', tiruvannamalai: 'tamil nadu', kanyakumari: 'tamil nadu',
            rameshwaram: 'tamil nadu', hosur: 'tamil nadu', bhavani: 'tamil nadu', chidambaram: 'tamil nadu',
            perambalur: 'tamil nadu', velankanni: 'tamil nadu', mahabalipuram: 'tamil nadu',
            katpadi: 'tamil nadu',
            // Karnataka
            bangalore: 'karnataka', bengaluru: 'karnataka', mysore: 'karnataka', mangalore: 'karnataka',
            hubli: 'karnataka', dharwad: 'karnataka', belgaum: 'karnataka', udupi: 'karnataka',
            gokarna: 'karnataka', hampi: 'karnataka', kolar: 'karnataka', tumkur: 'karnataka',
            ramanagara: 'karnataka', mandya: 'karnataka', hassan: 'karnataka', chikmagalur: 'karnataka',
            shimoga: 'karnataka', davangere: 'karnataka', bidar: 'karnataka',
            // Kerala
            kochi: 'kerala', cochin: 'kerala', trivandrum: 'kerala', thiruvananthapuram: 'kerala',
            palakkad: 'kerala', calicut: 'kerala', munnar: 'kerala', wayanad: 'kerala',
            alleppey: 'kerala', alappuzha: 'kerala', thekkady: 'kerala', kovalam: 'kerala',
            thrissur: 'kerala', kozhikode: 'kerala', malappuram: 'kerala', kannur: 'kerala',
            // Andhra Pradesh
            tirupati: 'andhra pradesh', chittoor: 'andhra pradesh', nellore: 'andhra pradesh',
            guntur: 'andhra pradesh', vijayawada: 'andhra pradesh', visakhapatnam: 'andhra pradesh',
            vizag: 'andhra pradesh', kurnool: 'andhra pradesh', kadapa: 'andhra pradesh',
            anantapur: 'andhra pradesh',
            // Telangana
            hyderabad: 'telangana', secunderabad: 'telangana', warangal: 'telangana',
            nizamabad: 'telangana', karimnagar: 'telangana',
            // Puducherry
            pondicherry: 'puducherry', puducherry: 'puducherry', karaikkal: 'puducherry', karaikal: 'puducherry',
            // Maharashtra
            mumbai: 'maharashtra', pune: 'maharashtra', nagpur: 'maharashtra', nasik: 'maharashtra',
            nashik: 'maharashtra', shirdi: 'maharashtra',
            // Goa
            panaji: 'goa', goa: 'goa',
            // Gujarat
            ahmedabad: 'gujarat', surat: 'gujarat', vadodara: 'gujarat', rajkot: 'gujarat'
        };
        for (const city in cityToState) {
            if (Object.prototype.hasOwnProperty.call(cityToState, city) && text.includes(city)) {
                return cityToState[city];
            }
        }
        return '';
    }

    function transitionsByStatePath(fromEntry, toEntry) {
        // Support both old string calls and new { loc, key } object calls
        const fromLoc = (typeof fromEntry === 'object' && fromEntry !== null) ? fromEntry.loc : fromEntry;
        const fromKey = (typeof fromEntry === 'object' && fromEntry !== null) ? fromEntry.key : undefined;
        const toLoc   = (typeof toEntry   === 'object' && toEntry   !== null) ? toEntry.loc   : toEntry;
        const toKey   = (typeof toEntry   === 'object' && toEntry   !== null) ? toEntry.key   : undefined;

        const fromState = inferStateFromLocation(fromLoc, fromKey);
        const toState   = inferStateFromLocation(toLoc, toKey);
        if (!fromState || !toState) return [];

        // Enclave / Intra-state transit special cases
        if (fromState === 'tamil nadu' && toState === 'tamil nadu') {
            const locStrLow = ((fromLoc || "") + "::" + (toLoc || "")).toLowerCase();
            if ((locStrLow.includes('chennai') || locStrLow.includes('kanchipuram') || locStrLow.includes('vellore')) 
                && (locStrLow.includes('cuddalore') || locStrLow.includes('chidambaram') || locStrLow.includes('karaikal'))) {
                return [{ from: 'tamil nadu', to: 'puducherry', andhraBorder: false }];
            }
        }

        if (fromState === toState) return [];

        const locStr = ((fromLoc || "") + "::" + (toLoc || "")).toLowerCase();
        // Vellore/Katpadi district → Karnataka: actual road transits Andhra Pradesh (Chittoor)
        if ((fromState === "tamil nadu" && toState === "karnataka") || (fromState === "karnataka" && toState === "tamil nadu")) {
            if (locStr.includes("vellore") || locStr.includes("katpadi") || locStr.includes("kanchipuram") || locStr.includes("ranipet")) {
                return [
                    { from: fromState, to: "andhra pradesh", andhraBorder: true },
                    { from: "andhra pradesh", to: toState, andhraBorder: true }
                ];
            }
        }

        const neighbors = {
            'tamil nadu': ['kerala', 'karnataka', 'andhra pradesh', 'puducherry'],
            kerala: ['tamil nadu', 'karnataka'],
            karnataka: ['tamil nadu', 'kerala', 'andhra pradesh', 'telangana', 'maharashtra', 'goa'],
            'andhra pradesh': ['tamil nadu', 'karnataka', 'telangana'],
            telangana: ['andhra pradesh', 'karnataka', 'maharashtra'],
            puducherry: ['tamil nadu'],
            maharashtra: ['karnataka', 'telangana', 'gujarat', 'goa'],
            goa: ['karnataka', 'maharashtra'],
            gujarat: ['maharashtra'],
        };
        const queue = [[fromState]];
        const visited = { [fromState]: true };
        while (queue.length) {
            const path = queue.shift();
            const last = path[path.length - 1];
            if (last === toState) {
                const out = [];
                for (let i = 0; i < path.length - 1; i += 1) {
                    const from = path[i];
                    const to = path[i + 1];
                    out.push({ from, to, andhraBorder: from === 'andhra pradesh' || to === 'andhra pradesh' });
                }
                return out;
            }
            (neighbors[last] || []).forEach((next) => {
                if (!visited[next]) {
                    visited[next] = true;
                    queue.push(path.concat(next));
                }
            });
        }
        return [{ from: fromState, to: toState, andhraBorder: fromState === 'andhra pradesh' || toState === 'andhra pradesh' }];
    }

    function dedupeBorders(list) {
        const seen = {};
        return (Array.isArray(list) ? list : []).filter((b) => {
            const from = ((b && b.from) || '').toString().trim().toLowerCase();
            const to = ((b && b.to) || '').toString().trim().toLowerCase();
            if (!from || !to || from === to) return false;
            const key = [from, to].sort().join('::');
            if (seen[key]) return false;
            seen[key] = true;
            return true;
        });
    }

    let finalFare = 0;
    let manualFare = null;
    const estVal = data.estimates[data.selectedVehicle] || data.estimates['SEDAN'] || 0;
    let baseEstimate = Number(typeof estVal === 'object' ? (estVal.totalFare || estVal.total || 0) : estVal);
    const distForTollHint = Number(data.pricingDistanceHint || data.distanceHint) || 0;
    const heuristicToll = Math.round(distForTollHint * 2);

    function getInclusiveTollAmount() {
        const el = document.getElementById('admin-toll-amount-input');
        if (!el) return heuristicToll;
        const v = parseInt(String(el.value).replace(/\D/g, ''), 10);
        if (isNaN(v) || v < 0) return 0;
        return v;
    }

    function setLiveTollOnAllVehicles(fareBreakdown, toll) {
        if (!fareBreakdown || !fareBreakdown.vehicles || typeof fareBreakdown.vehicles !== 'object') return;
        Object.keys(fareBreakdown.vehicles).forEach(function (vk) {
            const row = fareBreakdown.vehicles[vk];
            if (row && typeof row === 'object') {
                row.liveToll = toll;
            }
        });
    }

    let isManualOverride = false;
    // If the loaded fare was inclusive, the stored fare includes tolls & taxes.
    // We must subtract them to get the correct baseEstimate on load, so that
    // subsequent dynamic calculations do not double-add them.
    if (data.fareType === 'inclusive') {
        const initialTollCheckbox = document.getElementById('admin-toll-include-checkbox');
        const initialTaxCheckbox = document.getElementById('admin-tax-include-checkbox');
        const isTollIncl = initialTollCheckbox ? initialTollCheckbox.checked : false;
        const isTaxIncl = initialTaxCheckbox ? initialTaxCheckbox.checked : false;

        const initialToll = getInclusiveTollAmount();
        const initialTaxCountInput = document.getElementById('admin-tax-count-input');
        const initialTaxRateInput = document.getElementById('admin-tax-rate-input');
        const initialTaxCount = initialTaxCountInput ? Math.max(0, parseInt(initialTaxCountInput.value, 10) || 0) : 0;
        const initialTaxRate = initialTaxRateInput ? Math.max(0, parseInt(initialTaxRateInput.value, 10) || 0) : 0;

        if (isTollIncl) {
            baseEstimate -= initialToll;
        }
        if (isTaxIncl) {
            baseEstimate -= (initialTaxCount * initialTaxRate);
        }
        baseEstimate = Math.max(0, baseEstimate);
    }

    function tollSourceIsManual() {
        return getInclusiveTollAmount() !== heuristicToll;
    }

    function refreshTollSourceLabel() {
        const tollSource = document.getElementById('admin-toll-source');
        if (!tollSource) return;
        if (tollSource.dataset.mode === 'live') {
            tollSource.textContent = '(Live from Google Maps — editable)';
            tollSource.style.color = '#10b981';
            return;
        }
        if (tollSourceIsManual()) {
            tollSource.textContent = '(Exact amount — used in inclusive total)';
            tollSource.style.color = '#0f766e';
        } else {
            tollSource.textContent = '(Standard ₹2/km estimate • edit for exact)';
            tollSource.style.color = '#94a3b8';
        }
    }

    function getAdjustedFare(base) {
        let final = base;
        
        // 1. Tolls
        const tollCheckbox = document.getElementById('admin-toll-include-checkbox');
        const isTollIncluded = tollCheckbox ? tollCheckbox.checked : false;
        const toll = getInclusiveTollAmount();
        
        // 2. State Entry Tax
        const taxCheckbox = document.getElementById('admin-tax-include-checkbox');
        const isTaxIncluded = taxCheckbox ? taxCheckbox.checked : false;
        
        let borderFee = 0;
        const taxCountInput = document.getElementById('admin-tax-count-input');
        const taxRateInput = document.getElementById('admin-tax-rate-input');
        const count = taxCountInput ? Math.max(0, parseInt(String(taxCountInput.value), 10) || 0) : 0;
        const rate = taxRateInput ? Math.max(0, parseInt(String(taxRateInput.value), 10) || 0) : 0;
        borderFee = count * rate;
        
        // Update insight card displays
        const taxDisplay = document.getElementById('admin-tax-display');
        const taxInsight = document.getElementById('admin-state-tax-insight');
        if (taxDisplay) {
            taxDisplay.textContent = '₹' + borderFee.toLocaleString('en-IN');
            if (isTaxIncluded) {
                taxDisplay.style.color = '#0f172a';
            } else {
                taxDisplay.style.color = '#94a3b8';
            }
        }
        if (taxInsight) {
            taxInsight.style.display = 'flex';
        }
        
        // Update border count insight input (if it exists) to match our customizer count
        const borderCountInput = document.getElementById('admin-border-count');
        if (borderCountInput) {
            borderCountInput.value = count;
        }

        let addedToll = isTollIncluded ? toll : 0;
        let addedTax = isTaxIncluded ? borderFee : 0;
        
        final = base + addedToll + addedTax;
        return final;
    }

    function updateTotalDisplay() {
        data.fareType = getEffectiveFareType();
        
        const tollCheckbox = document.getElementById('admin-toll-include-checkbox');
        const taxCheckbox = document.getElementById('admin-tax-include-checkbox');
        const isToll = tollCheckbox ? tollCheckbox.checked : false;
        const isTax = taxCheckbox ? taxCheckbox.checked : false;
        
        const toll = getInclusiveTollAmount();
        const addedToll = isToll ? toll : 0;
        
        const taxCountInput = document.getElementById('admin-tax-count-input');
        const taxRateInput = document.getElementById('admin-tax-rate-input');
        const count = taxCountInput ? Math.max(0, parseInt(String(taxCountInput.value), 10) || 0) : 0;
        const rate = taxRateInput ? Math.max(0, parseInt(String(taxRateInput.value), 10) || 0) : 0;
        const addedTax = isTax ? (count * rate) : 0;

        let effectiveBase = baseEstimate;
        if (isManualOverride && manualFare !== null && manualFare > 0) {
            effectiveBase = Math.max(0, manualFare - addedToll - addedTax);
        }
        
        // Update vehicle-specific estimates so breakdown JSON syncs correctly
        const vk = (data.selectedVehicle || 'SEDAN').toUpperCase();
        if (data.estimates && data.estimates[vk]) {
            if (typeof data.estimates[vk] === 'object') {
                data.estimates[vk].totalFare = effectiveBase;
                data.estimates[vk].total = effectiveBase;
            } else {
                data.estimates[vk] = effectiveBase;
            }
        }
        if (data.payload && data.payload.fareBreakdown && data.payload.fareBreakdown.vehicles && data.payload.fareBreakdown.vehicles[vk]) {
            const vRow = data.payload.fareBreakdown.vehicles[vk];
            vRow.totalFare = effectiveBase;
        }

        finalFare = getAdjustedFare(effectiveBase);
        if (isManualOverride && manualFare !== null && manualFare > 0) {
            finalFare = manualFare;
        } else {
            if (manualFareInput) {
                // Synchronize input value with auto fare when not overridden
                manualFareInput.value = finalFare;
            }
        }
        totalEl.textContent = '₹' + finalFare.toLocaleString('en-IN');
        
        if (isToll && isTax) {
            badgeEl.textContent = 'Inclusive (Toll/Tax Included)';
            badgeEl.className = 'fv-price-badge badge-inclusive';
        } else if (isToll) {
            badgeEl.textContent = 'Inclusive (Tolls Included, Taxes Extra)';
            badgeEl.className = 'fv-price-badge badge-inclusive';
        } else if (isTax) {
            badgeEl.textContent = 'Inclusive (Taxes Included, Tolls Extra)';
            badgeEl.className = 'fv-price-badge badge-inclusive';
        } else {
            badgeEl.textContent = 'Exclusive (+ Toll/Tax Extra)';
            badgeEl.className = 'fv-price-badge badge-exclusive';
        }

        // Update the hidden payload for final submission
        basePayload.fareEstimate = finalFare;
        basePayload.fareType = data.fareType;
        
        basePayload.includeTolls = isToll;
        basePayload.includeTaxes = isTax;
        basePayload.inclusiveTollAmount = toll;
        
        basePayload.overrideTaxAmount = rate;
        basePayload.overrideTaxCount = count;
        basePayload.overrideTollAmount = toll;

        if (basePayload.fareBreakdown) {
            basePayload.fareBreakdown.fareType = data.fareType;
            basePayload.fareBreakdown.includeTolls = isToll;
            basePayload.fareBreakdown.includeTaxes = isTax;
            basePayload.fareBreakdown.overrideTollAmount = toll;
            basePayload.fareBreakdown.overrideTaxAmount = rate;
            basePayload.fareBreakdown.overrideTaxCount = count;
            
            setLiveTollOnAllVehicles(basePayload.fareBreakdown, toll);
            if (basePayload.fareBreakdown.vehicles) {
                Object.keys(basePayload.fareBreakdown.vehicles).forEach(function (vkLoop) {
                    const row = basePayload.fareBreakdown.vehicles[vkLoop];
                    if (row && typeof row === 'object') {
                        row.includeTolls = isToll;
                        row.includeTaxes = isTax;
                        row.liveToll = toll;
                        row.overrideTaxAmount = rate;
                        row.overrideTaxCount = count;
                    }
                });
            }
        }
        refreshTollSourceLabel();
    }

    /** Full fare_data for POST (session + breakdown HTML) — call after updateTotalDisplay. */
    function buildSyncedFareData() {
        updateTotalDisplay();
        const merged = JSON.parse(JSON.stringify(data));
        merged.fareType = getEffectiveFareType();
        merged.payload = merged.payload || {};
        Object.assign(merged.payload, basePayload);
        merged.payload.fareEstimate = finalFare;
        merged.payload.fareType = merged.fareType;
        
        const tollCheckbox = document.getElementById('admin-toll-include-checkbox');
        const taxCheckbox = document.getElementById('admin-tax-include-checkbox');
        const isToll = tollCheckbox ? tollCheckbox.checked : false;
        const isTax = taxCheckbox ? taxCheckbox.checked : false;
        
        merged.payload.includeTolls = isToll;
        merged.payload.includeTaxes = isTax;
        
        const toll = getInclusiveTollAmount();
        merged.inclusiveTollAmount = toll;
        merged.payload.inclusiveTollAmount = toll;
        
        const taxCountInput = document.getElementById('admin-tax-count-input');
        const taxRateInput = document.getElementById('admin-tax-rate-input');
        const taxCount = taxCountInput ? Math.max(0, parseInt(String(taxCountInput.value), 10) || 0) : 0;
        const taxRate = taxRateInput ? Math.max(0, parseInt(String(taxRateInput.value), 10) || 0) : 0;
        
        merged.payload.overrideTaxAmount = taxRate;
        merged.payload.overrideTaxCount = taxCount;
        merged.payload.overrideTollAmount = toll;
        
        if (merged.payload.fareBreakdown) {
            merged.payload.fareBreakdown.fareType = merged.fareType;
            merged.payload.fareBreakdown.includeTolls = isToll;
            merged.payload.fareBreakdown.includeTaxes = isTax;
            merged.payload.fareBreakdown.overrideTollAmount = toll;
            merged.payload.fareBreakdown.overrideTaxAmount = taxRate;
            merged.payload.fareBreakdown.overrideTaxCount = taxCount;
            if (basePayload.stops && basePayload.stops.length) {
                merged.payload.fareBreakdown.stops = basePayload.stops;
            }
            
            setLiveTollOnAllVehicles(merged.payload.fareBreakdown, toll);
            if (merged.payload.fareBreakdown.vehicles) {
                Object.keys(merged.payload.fareBreakdown.vehicles).forEach(function (vk) {
                    const row = merged.payload.fareBreakdown.vehicles[vk];
                    if (row && typeof row === 'object') {
                        row.includeTolls = isToll;
                        row.includeTaxes = isTax;
                        row.liveToll = toll;
                        row.overrideTaxAmount = taxRate;
                        row.overrideTaxCount = taxCount;
                    }
                });
            }
        }
        return merged;
    }

    function pullFareViewSync() {
        const payload = buildSyncedFareData();
        const formData = new FormData();
        formData.append('fare_data', JSON.stringify(payload));
        formData.append('ajax_breakdown', '1');
        return fetch(window.location.href, { method: 'POST', body: formData })
            .then(r => r.json())
            .then(json => {
                const breakdownEl = document.getElementById('admin-fare-breakdown-html');
                const policyEl = document.getElementById('admin-policy-section-html');
                if (breakdownEl && json.breakdown) breakdownEl.innerHTML = json.breakdown;
                if (policyEl && json.policies) policyEl.innerHTML = json.policies;
                Object.assign(data, payload);
                if (window.DROP_CARS_FARE_VIEW_DATA) Object.assign(window.DROP_CARS_FARE_VIEW_DATA, payload);

                // Re-apply visual vehicle filter only (without resetting overrides)
                const activeTab = document.querySelector('.fv-vtab.active');
                const vFilter = activeTab ? activeTab.dataset.v : (data.selectedVehicle ? data.selectedVehicle.toLowerCase() : 'all');
                const allGroups = document.querySelectorAll('.fv-veh-group');
                allGroups.forEach(group => {
                    if (vFilter === 'all') {
                        group.style.display = '';
                    } else if (group.classList.contains('fv-veh-all')) {
                        group.style.display = '';
                    } else if (group.classList.contains('fv-veh-' + vFilter)) {
                        group.style.display = '';
                    } else {
                        group.style.display = 'none';
                    }
                });

                return json;
            });
    }

    updateTotalDisplay();

    // Manual fare override — lets the admin set the final fare directly so the
    // actual price always syncs to the booking/enquiry, even if auto-calc gave ₹0.
    if (manualFareInput) {
        const applyManual = function (userInitiated) {
            if (userInitiated) {
                const rawVal = String(manualFareInput.value).replace(/\D/g, '');
                if (rawVal === '') {
                    isManualOverride = false;
                    manualFare = null;
                } else {
                    const v = parseInt(rawVal, 10);
                    if (!isNaN(v) && v > 0) {
                        isManualOverride = true;
                        manualFare = v;
                    } else {
                        isManualOverride = false;
                        manualFare = null;
                    }
                }
            }
            updateTotalDisplay();
        };
        // Do NOT run applyManual on load because isManualOverride starts as false,
        // and updateTotalDisplay() (which runs on load) will set manualFareInput.value = finalFare automatically.
        manualFareInput.addEventListener('input', function () {
            applyManual(true);
        });
        manualFareInput.addEventListener('change', function() {
            applyManual(true);
            pullFareViewSync().catch(function(err) { console.error('Breakdown sync failed:', err); });
        });
    }

    const tollInput = document.getElementById('admin-toll-input');
    const tollSourceEl = document.getElementById('admin-toll-source');
    const customizerTollInput = document.getElementById('admin-toll-amount-input');
    if (tollInput) {
        tollInput.addEventListener('input', function() {
            if (tollSourceEl) tollSourceEl.dataset.mode = '';
            if (customizerTollInput) {
                customizerTollInput.value = tollInput.value;
            }
            const displayVal = document.getElementById('admin-toll-display-val');
            if (displayVal) displayVal.textContent = tollInput.value;
            updateTotalDisplay();
        });
        tollInput.addEventListener('change', function() {
            if (tollSourceEl) tollSourceEl.dataset.mode = '';
            if (customizerTollInput) {
                customizerTollInput.value = tollInput.value;
            }
            const displayVal = document.getElementById('admin-toll-display-val');
            if (displayVal) displayVal.textContent = tollInput.value;
            updateTotalDisplay();
            pullFareViewSync().catch(function(err) { console.error('Breakdown sync failed:', err); });
        });
    }

    const btnTollReset = document.getElementById('btn-admin-toll-reset');
    if (btnTollReset && tollInput) {
        btnTollReset.addEventListener('click', function() {
            tollInput.value = String(heuristicToll);
            if (customizerTollInput) {
                customizerTollInput.value = String(heuristicToll);
            }
            const displayVal = document.getElementById('admin-toll-display-val');
            if (displayVal) displayVal.textContent = String(heuristicToll);
            if (tollSourceEl) tollSourceEl.dataset.mode = '';
            updateTotalDisplay();
            pullFareViewSync().catch(function(err) { console.error('Breakdown sync failed:', err); });
        });
    }



    // ── Customizer Inputs Event Listeners ──
    const baseKmInput = document.getElementById('admin-base-km-fare-input');
    const driverBataInput = document.getElementById('admin-driver-bata-input');
    const tollIncludeCheckbox = document.getElementById('admin-toll-include-checkbox');
    const tollAmountInput = document.getElementById('admin-toll-amount-input');
    const taxIncludeCheckbox = document.getElementById('admin-tax-include-checkbox');
    const taxCountInput = document.getElementById('admin-tax-count-input');
    const taxRateInput = document.getElementById('admin-tax-rate-input');

    const perKmRateInput = document.getElementById('admin-per-km-rate-input');
    const billableKmInput = document.getElementById('admin-billable-km-input');
    const driverBataPerDayInput = document.getElementById('admin-driver-bata-per-day-input');
    const driverBataMultiplierInput = document.getElementById('admin-driver-bata-multiplier-input');

    const nightAllowanceCheckbox = document.getElementById('admin-night-allowance-checkbox');
    const nightAllowanceInput = document.getElementById('admin-night-allowance-input');
    const parkingChargesCheckbox = document.getElementById('admin-parking-charges-checkbox');
    const parkingChargesInput = document.getElementById('admin-parking-charges-input');
    const waitingChargesCheckbox = document.getElementById('admin-waiting-charges-checkbox');
    const waitingChargesInput = document.getElementById('admin-waiting-charges-input');
    
    const notesInput = document.getElementById('admin-notes-input');

    function parseDurationToMinutes(durationStr) {
        if (!durationStr) return 0;
        const cleanStr = durationStr.toLowerCase().trim();
        let totalMinutes = 0;

        const dayMatch = cleanStr.match(/(\d+)\s*d/);
        if (dayMatch) {
            totalMinutes += parseInt(dayMatch[1], 10) * 24 * 60;
        }

        const hrMatch = cleanStr.match(/(\d+)\s*(?:h|hr|hour)/);
        if (hrMatch) {
            totalMinutes += parseInt(hrMatch[1], 10) * 60;
        }

        const minMatch = cleanStr.match(/(\d+)\s*(?:m|min|minute)/);
        if (minMatch) {
            totalMinutes += parseInt(minMatch[1], 10);
        }

        return totalMinutes;
    }

    function formatTime12Hour(timeStr) {
        if (!timeStr) return '';
        const parts = timeStr.split(':');
        if (parts.length < 2) return '';
        let hrs = parseInt(parts[0], 10);
        const mins = parts[1];
        const ampm = hrs >= 12 ? 'PM' : 'AM';
        hrs = hrs % 12;
        hrs = hrs ? hrs : 12;
        const hrsStr = String(hrs).padStart(2, '0');
        return `${hrsStr}:${mins} ${ampm}`;
    }

    function calculateEndTime(startDateStr, startTimeStr, durationMinutes) {
        if (!startDateStr || !startTimeStr) return null;
        
        const [year, month, day] = startDateStr.split('-').map(Number);
        const [hour, minute] = startTimeStr.split(':').map(Number);
        
        const startDate = new Date(year, month - 1, day, hour, minute, 0);
        if (isNaN(startDate.getTime())) return null;
        
        const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
        
        const endYear = endDate.getFullYear();
        const endMonth = String(endDate.getMonth() + 1).padStart(2, '0');
        const endDay = String(endDate.getDate()).padStart(2, '0');
        const endHour = String(endDate.getHours()).padStart(2, '0');
        const endMin = String(endDate.getMinutes()).padStart(2, '0');
        
        return {
            date: `${endYear}-${endMonth}-${endDay}`,
            time: `${endHour}:${endMin}`
        };
    }

    function autoComputeEndSchedule(force) {
        const endDateEl = document.getElementById('admin-end-date');
        const endTimeEl = document.getElementById('admin-end-time');
        if (!endDateEl || !endTimeEl) return;
        
        if (!force && (endDateEl.dataset.overridden === 'true' || endTimeEl.dataset.overridden === 'true')) {
            return;
        }
        
        const startDateEl = document.getElementById('admin-start-date');
        const startTimeEl = document.getElementById('admin-start-time');
        const startDate = startDateEl ? startDateEl.value : (data.tripTime ? data.tripTime.startDate : (basePayload.travelDate || ''));
        const startTime = startTimeEl ? startTimeEl.value : (data.tripTime ? data.tripTime.time : (basePayload.travelTime || ''));
        const durationStr = data.payload ? data.payload.durationHint : (data.durationHint || '');
        
        if (!startDate || !startTime) return;
        
        let minutes = parseDurationToMinutes(durationStr);
        
        // FACTOR IN WAITING HOURS if waiting charges are included
        const waitingChargesCheckbox = document.getElementById('admin-waiting-charges-checkbox');
        const waitingHoursInput = document.getElementById('admin-waiting-hours-input');
        if (waitingChargesCheckbox && waitingChargesCheckbox.checked && waitingHoursInput) {
            const waitingHours = parseFloat(waitingHoursInput.value) || 0;
            minutes += Math.round(waitingHours * 60);
        }
        
        const result = calculateEndTime(startDate, startTime, minutes);
        if (result) {
            if (force || !endDateEl.value) {
                endDateEl.value = result.date;
                basePayload.endDate = result.date;
            }
            if (force || !endTimeEl.value) {
                endTimeEl.value = result.time;
                basePayload.dropTime = result.time;
            }
            // Update AM/PM badge
            updateEndTimeAMPM();
        }
    }

    const startDateEl = document.getElementById('admin-start-date');
    const startTimeEl = document.getElementById('admin-start-time');
    const endDateEl = document.getElementById('admin-end-date');
    const endTimeEl = document.getElementById('admin-end-time');

    function updateStartTimeAMPM() {
        const ampmEl = document.getElementById('admin-start-time-ampm');
        if (ampmEl && startTimeEl) {
            ampmEl.textContent = formatTime12Hour(startTimeEl.value);
        }
    }
    function updateEndTimeAMPM() {
        const ampmEl = document.getElementById('admin-end-time-ampm');
        if (ampmEl && endTimeEl) {
            ampmEl.textContent = formatTime12Hour(endTimeEl.value);
        }
    }

    if (startDateEl) {
        if (startDateEl.value) {
            basePayload.travelDate = startDateEl.value;
            if (data.tripTime) data.tripTime.startDate = startDateEl.value;
        }
        startDateEl.addEventListener('input', function() {
            basePayload.travelDate = startDateEl.value;
            if (data.tripTime) data.tripTime.startDate = startDateEl.value;
            autoComputeEndSchedule(true);
        });
        startDateEl.addEventListener('change', function() {
            pullFareViewSync().catch(function(err) { console.error('Breakdown sync failed:', err); });
        });
    }

    if (startTimeEl) {
        if (startTimeEl.value) {
            basePayload.travelTime = startTimeEl.value;
            if (data.tripTime) data.tripTime.time = startTimeEl.value;
        }
        startTimeEl.addEventListener('input', function() {
            basePayload.travelTime = startTimeEl.value;
            if (data.tripTime) data.tripTime.time = startTimeEl.value;
            updateStartTimeAMPM();
            autoComputeEndSchedule(true);
        });
        startTimeEl.addEventListener('change', function() {
            pullFareViewSync().catch(function(err) { console.error('Breakdown sync failed:', err); });
        });
    }

    if (endDateEl) {
        if (endDateEl.value) {
            basePayload.endDate = endDateEl.value;
        }
        endDateEl.addEventListener('input', function() {
            endDateEl.dataset.overridden = 'true';
            basePayload.endDate = endDateEl.value;
        });
        endDateEl.addEventListener('change', function() {
            pullFareViewSync().catch(function(err) { console.error('Breakdown sync failed:', err); });
        });
    }
    if (endTimeEl) {
        if (endTimeEl.value) {
            basePayload.dropTime = endTimeEl.value;
        }
        endTimeEl.addEventListener('input', function() {
            endTimeEl.dataset.overridden = 'true';
            basePayload.dropTime = endTimeEl.value;
            updateEndTimeAMPM();
        });
        endTimeEl.addEventListener('change', function() {
            pullFareViewSync().catch(function(err) { console.error('Breakdown sync failed:', err); });
        });
    }
    if (notesInput) {
        basePayload.dispatcherNotes = notesInput.value;
        notesInput.addEventListener('input', function() {
            basePayload.dispatcherNotes = notesInput.value;
        });
    }
    
    // Initialise AM/PM display
    updateStartTimeAMPM();
    updateEndTimeAMPM();
    
    // Run once on load to populate if empty
    autoComputeEndSchedule(false);

    function recomputeCustomizerBaseEstimate() {
        const baseKm = parseFloat(baseKmInput.value) || 0;
        const bata = parseFloat(driverBataInput.value) || 0;
        
        const nightChecked = nightAllowanceCheckbox ? nightAllowanceCheckbox.checked : false;
        const nightVal = nightChecked ? (parseFloat(nightAllowanceInput.value) || 0) : 0;
        
        const parkingChecked = parkingChargesCheckbox ? parkingChargesCheckbox.checked : false;
        const parkingVal = parkingChecked ? (parseFloat(parkingChargesInput.value) || 0) : 0;
        
        const waitingChecked = waitingChargesCheckbox ? waitingChargesCheckbox.checked : false;
        const waitingVal = waitingChecked ? (parseFloat(waitingChargesInput.value) || 0) : 0;
        
        baseEstimate = baseKm + bata + nightVal + parkingVal + waitingVal;
        
        const vk = (data.selectedVehicle || 'SEDAN').toUpperCase();
        
        const perKmRate = parseFloat(perKmRateInput ? perKmRateInput.value : 0) || 0;
        const billableKm = parseFloat(billableKmInput ? billableKmInput.value : 0) || 0;
        const driverBataPerDay = parseFloat(driverBataPerDayInput ? driverBataPerDayInput.value : 0) || 0;
        const tripDays = parseFloat(driverBataMultiplierInput ? driverBataMultiplierInput.value : 0) || 0;
        
        const waitingHoursInput = document.getElementById('admin-waiting-hours-input');
        const waitingRateInput = document.getElementById('admin-waiting-rate-input');
        const waitingHours = waitingHoursInput ? parseFloat(waitingHoursInput.value) || 0 : 0;
        const waitingRate = waitingRateInput ? parseFloat(waitingRateInput.value) || 0 : 0;

        if (data.estimates && data.estimates[vk]) {
             if (typeof data.estimates[vk] === 'object') {
                 data.estimates[vk].kmCharge = baseKm;
                 data.estimates[vk].driverBata = bata;
                 data.estimates[vk].driverBataTotal = bata;
                 
                 data.estimates[vk].perKmRate = perKmRate;
                 data.estimates[vk].effectiveBillableKm = billableKm;
                 data.estimates[vk].driverBataPerDay = driverBataPerDay;
                 data.estimates[vk].tripDays = tripDays;
                 
                 data.estimates[vk].driverNightAllowance = nightVal;
                 data.estimates[vk].parkingCharges = parkingVal;
                 data.estimates[vk].waitingCharges = waitingVal;
                 data.estimates[vk].waitingRate = waitingRate;
                 data.estimates[vk].waitingHours = waitingHours;
                 
                 data.estimates[vk].totalFare = baseEstimate;
                 data.estimates[vk].total = baseEstimate;
             } else {
                 data.estimates[vk] = baseEstimate;
             }
        }
        if (data.payload && data.payload.fareBreakdown && data.payload.fareBreakdown.vehicles && data.payload.fareBreakdown.vehicles[vk]) {
             const vRow = data.payload.fareBreakdown.vehicles[vk];
             vRow.kmCharge = baseKm;
             vRow.driverBata = bata;
             vRow.driverBataTotal = bata;
             
             vRow.perKmRate = perKmRate;
             vRow.effectiveBillableKm = billableKm;
             vRow.driverBataPerDay = driverBataPerDay;
             vRow.tripDays = tripDays;
             
             vRow.driverNightAllowance = nightVal;
             vRow.parkingCharges = parkingVal;
             vRow.waitingCharges = waitingVal;
             vRow.waitingRate = waitingRate;
             vRow.waitingHours = waitingHours;
             
             vRow.totalFare = baseEstimate;
        }
    }

    if (baseKmInput) {
        baseKmInput.addEventListener('input', function() {
            recomputeCustomizerBaseEstimate();
            updateTotalDisplay();
        });
        baseKmInput.addEventListener('change', function() {
            pullFareViewSync().catch(function(err) { console.error('Breakdown sync failed:', err); });
        });
    }

    if (driverBataInput) {
        driverBataInput.addEventListener('input', function() {
            recomputeCustomizerBaseEstimate();
            updateTotalDisplay();
        });
        driverBataInput.addEventListener('change', function() {
            pullFareViewSync().catch(function(err) { console.error('Breakdown sync failed:', err); });
        });
    }

    if (perKmRateInput) {
        perKmRateInput.addEventListener('input', function() {
            const rate = parseFloat(perKmRateInput.value) || 0;
            const km = parseFloat(billableKmInput ? billableKmInput.value : 0) || 0;
            if (baseKmInput) baseKmInput.value = Math.round(rate * km);
            recomputeCustomizerBaseEstimate();
            updateTotalDisplay();
        });
        perKmRateInput.addEventListener('change', function() {
            pullFareViewSync().catch(function(err) { console.error('Breakdown sync failed:', err); });
        });
    }

    if (billableKmInput) {
        billableKmInput.addEventListener('input', function() {
            const rate = parseFloat(perKmRateInput ? perKmRateInput.value : 0) || 0;
            const km = parseFloat(billableKmInput.value) || 0;
            if (baseKmInput) baseKmInput.value = Math.round(rate * km);
            recomputeCustomizerBaseEstimate();
            updateTotalDisplay();
        });
        billableKmInput.addEventListener('change', function() {
            pullFareViewSync().catch(function(err) { console.error('Breakdown sync failed:', err); });
        });
    }

    if (driverBataPerDayInput) {
        driverBataPerDayInput.addEventListener('input', function() {
            const bata = parseFloat(driverBataPerDayInput.value) || 0;
            const mult = parseFloat(driverBataMultiplierInput ? driverBataMultiplierInput.value : 1) || 1;
            if (driverBataInput) driverBataInput.value = Math.round(bata * mult);
            recomputeCustomizerBaseEstimate();
            updateTotalDisplay();
        });
        driverBataPerDayInput.addEventListener('change', function() {
            pullFareViewSync().catch(function(err) { console.error('Breakdown sync failed:', err); });
        });
    }

    if (driverBataMultiplierInput) {
        driverBataMultiplierInput.addEventListener('input', function() {
            const bata = parseFloat(driverBataPerDayInput ? driverBataPerDayInput.value : 0) || 0;
            const mult = parseFloat(driverBataMultiplierInput.value) || 1;
            if (driverBataInput) driverBataInput.value = Math.round(bata * mult);
            recomputeCustomizerBaseEstimate();
            updateTotalDisplay();
        });
        driverBataMultiplierInput.addEventListener('change', function() {
            pullFareViewSync().catch(function(err) { console.error('Breakdown sync failed:', err); });
        });
    }

    if (nightAllowanceCheckbox) {
        nightAllowanceCheckbox.addEventListener('change', function() {
            recomputeCustomizerBaseEstimate();
            updateTotalDisplay();
            pullFareViewSync().catch(function(err) { console.error('Breakdown sync failed:', err); });
        });
    }
    if (nightAllowanceInput) {
        nightAllowanceInput.addEventListener('input', function() {
            const val = parseFloat(nightAllowanceInput.value) || 0;
            if (val > 0 && nightAllowanceCheckbox) {
                nightAllowanceCheckbox.checked = true;
            }
            recomputeCustomizerBaseEstimate();
            updateTotalDisplay();
        });
        nightAllowanceInput.addEventListener('change', function() {
            pullFareViewSync().catch(function(err) { console.error('Breakdown sync failed:', err); });
        });
    }

    if (parkingChargesCheckbox) {
        parkingChargesCheckbox.addEventListener('change', function() {
            recomputeCustomizerBaseEstimate();
            updateTotalDisplay();
            pullFareViewSync().catch(function(err) { console.error('Breakdown sync failed:', err); });
        });
    }
    if (parkingChargesInput) {
        parkingChargesInput.addEventListener('input', function() {
            const val = parseFloat(parkingChargesInput.value) || 0;
            if (val > 0 && parkingChargesCheckbox) {
                parkingChargesCheckbox.checked = true;
            }
            recomputeCustomizerBaseEstimate();
            updateTotalDisplay();
        });
        parkingChargesInput.addEventListener('change', function() {
            pullFareViewSync().catch(function(err) { console.error('Breakdown sync failed:', err); });
        });
    }

    const waitingHoursInput = document.getElementById('admin-waiting-hours-input');
    const waitingRateInput = document.getElementById('admin-waiting-rate-input');

    function updateWaitingTotalAmount() {
        if (waitingHoursInput && waitingRateInput && waitingChargesInput) {
            const hrs = parseFloat(waitingHoursInput.value) || 0;
            const rate = parseFloat(waitingRateInput.value) || 0;
            const total = Math.round(hrs * rate);
            waitingChargesInput.value = total;
            
            if (hrs > 0 && waitingChargesCheckbox) {
                waitingChargesCheckbox.checked = true;
            }
        }
    }

    if (waitingChargesCheckbox) {
        waitingChargesCheckbox.addEventListener('change', function() {
            autoComputeEndSchedule(true);
            recomputeCustomizerBaseEstimate();
            updateTotalDisplay();
            pullFareViewSync().catch(function(err) { console.error('Breakdown sync failed:', err); });
        });
    }
    if (waitingHoursInput) {
        waitingHoursInput.addEventListener('input', function() {
            updateWaitingTotalAmount();
            autoComputeEndSchedule(true);
            recomputeCustomizerBaseEstimate();
            updateTotalDisplay();
        });
        waitingHoursInput.addEventListener('change', function() {
            pullFareViewSync().catch(function(err) { console.error('Breakdown sync failed:', err); });
        });
    }
    if (waitingRateInput) {
        waitingRateInput.addEventListener('input', function() {
            updateWaitingTotalAmount();
            recomputeCustomizerBaseEstimate();
            updateTotalDisplay();
        });
        waitingRateInput.addEventListener('change', function() {
            pullFareViewSync().catch(function(err) { console.error('Breakdown sync failed:', err); });
        });
    }

    if (tollIncludeCheckbox) {
        tollIncludeCheckbox.addEventListener('change', function() {
            updateTotalDisplay();
            pullFareViewSync().catch(function(err) { console.error('Breakdown sync failed:', err); });
        });
    }

    if (tollAmountInput) {
        tollAmountInput.addEventListener('input', function() {
            if (tollInput) {
                tollInput.value = tollAmountInput.value;
                const displayVal = document.getElementById('admin-toll-display-val');
                if (displayVal) displayVal.textContent = tollAmountInput.value;
            }
            updateTotalDisplay();
        });
        tollAmountInput.addEventListener('change', function() {
            pullFareViewSync().catch(function(err) { console.error('Breakdown sync failed:', err); });
        });
    }

    if (taxIncludeCheckbox) {
        taxIncludeCheckbox.addEventListener('change', function() {
            updateTotalDisplay();
            pullFareViewSync().catch(function(err) { console.error('Breakdown sync failed:', err); });
        });
    }

    if (taxCountInput) {
        taxCountInput.addEventListener('input', function() {
            const borderCountInput = document.getElementById('admin-border-count');
            if (borderCountInput) borderCountInput.value = taxCountInput.value;
            
            const count = Math.max(0, parseInt(taxCountInput.value, 10) || 0);
            const vk = (data.selectedVehicle || 'SEDAN').toUpperCase();
            const pc = window.DROP_CARS_PERMIT_CHARGES || {};
            const baseTax = (vk === 'SUV') ? (parseInt(pc.SUV, 10) || 1000) : ((vk === 'INNOVA' || vk === 'CRYSTA') ? (parseInt(pc.INNOVA, 10) || 1500) : (parseInt(pc.SEDAN, 10) || 500));
            const overrideFee = count * baseTax;
            data._overrideBorderCount = count;
            data._overrideBorderFee = overrideFee;
            
            updateTotalDisplay();
        });
        taxCountInput.addEventListener('change', function() {
            pullFareViewSync().catch(function(err) { console.error('Breakdown sync failed:', err); });
        });
    }

    if (taxRateInput) {
        taxRateInput.addEventListener('input', function() {
            const count = taxCountInput ? Math.max(0, parseInt(taxCountInput.value, 10) || 0) : 0;
            const rate = parseFloat(taxRateInput.value) || 0;
            const overrideFee = count * rate;
            data._overrideBorderFee = overrideFee;
            updateTotalDisplay();
        });
        taxRateInput.addEventListener('change', function() {
            pullFareViewSync().catch(function(err) { console.error('Breakdown sync failed:', err); });
        });
    }

    // ── Location Swap Button ──
    const btnSwap = document.getElementById('btn-swap-locations');
    if (btnSwap) {
        btnSwap.addEventListener('click', function() {
            const temp = data.pickup;
            data.pickup = data.drop;
            data.drop = temp;
            
            basePayload.pickup = data.pickup;
            basePayload.drop = data.drop;
            
            const pickupEl = document.getElementById('fv-pickup-text');
            const dropEl = document.getElementById('fv-drop-text');
            if (pickupEl) pickupEl.textContent = data.pickup;
            if (dropEl) dropEl.textContent = data.drop;
            
            const headerPickupEl = document.getElementById('header-pickup-text');
            const headerDropEl = document.getElementById('header-drop-text');
            if (headerPickupEl) headerPickupEl.textContent = data.pickup;
            if (headerDropEl) headerDropEl.textContent = data.drop;
            
            const mapIframe = document.getElementById('fv-map-iframe');
            const fullMapLink = document.getElementById('fv-full-map-link');
            
            const mapsKey = <?php echo json_encode($fvMapsKey); ?>;
            let newSrc = '';
            if (mapsKey !== '' && mapsKey.indexOf('AIzaSyD7') === -1) {
                newSrc = 'https://www.google.com/maps/embed/v1/directions'
                    + '?key='         + encodeURIComponent(mapsKey)
                    + '&origin='      + encodeURIComponent(data.pickup + ', India')
                    + '&destination=' + encodeURIComponent(data.drop   + ', India')
                    + '&mode=driving'
                    + '&language=en';
            } else {
                newSrc = 'https://maps.google.com/maps?saddr='
                    + encodeURIComponent(data.pickup + ', India')
                    + '&daddr=' + encodeURIComponent(data.drop + ', India')
                    + '&hl=en&t=m&output=embed';
            }
            if (mapIframe) mapIframe.src = newSrc;
            if (fullMapLink) {
                fullMapLink.href = 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(data.pickup) + '&destination=' + encodeURIComponent(data.drop);
            }
            
            runFetchLiveToll({ silent: true })
                .then(function() {
                    return pullFareViewSync();
                })
                .catch(function(err) {
                    console.error('Swap recalculation failed:', err);
                });
        });
    }

    // Live Toll Fetch (highway toll from Routes API) — auto-run on load
    const apiUrlFetchToll = '<?php echo dropcars_url('api/fetch-live-toll.php'); ?>';

    function runFetchLiveToll(opts) {
        opts = opts || {};
        const silent = !!opts.silent;
        return fetch(apiUrlFetchToll, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ origin: data.pickup, destination: data.drop })
        })
            .then(async function (r) {
                const text = await r.text();
                try {
                    return JSON.parse(text);
                } catch (e) {
                    throw new Error('Invalid Server Response: ' + text.substring(0, 100));
                }
            })
            .then(function (res) {
                if (res.success) {
                    const amt = Math.max(0, Math.round(Number(res.amount) || 0));
                    const ti = document.getElementById('admin-toll-input');
                    const ts = document.getElementById('admin-toll-source');
                    const customizerToll = document.getElementById('admin-toll-amount-input');
                    if (ti) ti.value = String(amt);
                    if (customizerToll) customizerToll.value = String(amt);
                    if (ts) {
                        ts.dataset.mode = 'live';
                        ts.textContent = '(Live from Google Maps — editable)';
                        ts.style.color = '#10b981';
                    }
                    if (res.duration) {
                        const estTimeEl = document.getElementById('admin-estimated-time');
                        if (estTimeEl) {
                            estTimeEl.textContent = res.duration;
                        }
                        data.payload.durationHint = res.duration;
                        data.durationHint = res.duration;
                        autoComputeEndSchedule(true);
                    }
                    updateTotalDisplay();
                    return pullFareViewSync();
                }
                if (!silent) {
                    const errMsg = res.message || 'No data';
                    if (errMsg.includes('ComputeRoutes are blocked') || errMsg.includes('API_KEY_SERVICE_BLOCKED') || errMsg.includes('403')) {
                        alert('Routes API Access Blocked (403):\n\nThe Google Maps "Routes API" is not enabled on your API key.\n\nTo resolve this:\n1. Go to the Google Cloud Console (https://console.cloud.google.com)\n2. Navigate to "APIs & Services" > "Library"\n3. Search for and enable the "Routes API"\n\nLive tolls and travel times will start working immediately once enabled.');
                    } else {
                        alert('Toll Fetch Error: ' + errMsg);
                    }
                }
            })
            .catch(function (e) {
                if (!silent) {
                    const errText = e.message || '';
                    if (errText.includes('ComputeRoutes are blocked') || errText.includes('API_KEY_SERVICE_BLOCKED') || errText.includes('403')) {
                        alert('Routes API Access Blocked (403):\n\nThe Google Maps "Routes API" is not enabled on your API key.\n\nTo resolve this:\n1. Go to the Google Cloud Console (https://console.cloud.google.com)\n2. Navigate to "APIs & Services" > "Library"\n3. Search for and enable the "Routes API"\n\nLive tolls and travel times will start working immediately once enabled.');
                    } else {
                        alert('Connection error: ' + errText);
                    }
                }
            });
    }

    setTimeout(function () {
        var st = (data.serviceType || '').toString();
        if (data.pickup && data.drop && st !== 'hourly_rental') {
            runFetchLiveToll({ silent: true });
        }
    }, 500);

    function showStatus(msg, type) {
        responseEl.innerHTML = `<div style="padding: 1.25rem; background: ${type === 'error' ? '#fee2e2' : (type === 'success' ? '#dcfce7' : '#fffbeb')}; color: ${type === 'error' ? '#991b1b' : (type === 'success' ? '#166534' : '#92400e')}; border-radius: 16px; border: 1px solid ${type === 'error' ? '#fecaca' : (type === 'success' ? '#bbf7d0' : '#fde68a')}; font-size: 0.9rem; font-weight: 500;">${msg}</div>`;
        responseEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function sendApiRequest(endpoint, payloadData, isConfirm) {
        showStatus('<i class="fa-solid fa-spinner fa-spin"></i> Communicating with server...', 'info');
        if (btnConfirm) btnConfirm.disabled = true;
        if (btnEnquiry) btnEnquiry.disabled = true;
        
        fetch(window.DROP_CARS_BASE_PATH + endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadData)
        })
        .then(r => r.json())
        .then(res => {
            if (res.status === 'success' || res.success) {
                const createdId = res.bookingId || basePayload.bookingId || '';
                const adminRedirect = window.DROP_CARS_ADMIN_REDIRECT || 'bookings';
                
                if (isConfirm) {
                    let custPhone = (basePayload.contactValue || '').replace(/\D/g, "");
                    if (custPhone && custPhone.length === 10) custPhone = '91' + custPhone;
                    
                    const waTpl = (window.DROP_CARS_WA_CONFIRM_TPL || '').trim();
                    let msg;
                    if (waTpl) {
                        msg = waTpl
                            .replace(/{name}/g, basePayload.customerName || 'Customer')
                            .replace(/{bookingId}/g, createdId)
                            .replace(/{pickup}/g, basePayload.pickup || '')
                            .replace(/{drop}/g, basePayload.drop || '')
                            .replace(/{fare}/g, finalFare.toLocaleString('en-IN'))
                            .replace(/{date}/g, basePayload.travelDate || '')
                            .replace(/{vehicle}/g, data.selectedVehicle || '');
                    } else {
                        msg = `Dear ${basePayload.customerName || 'Customer'},\nYour Booking with Drop Cars is Confirmed!\n\nBooking ID: ${createdId}\nPickup: ${basePayload.pickup}\nDrop: ${basePayload.drop}\nFare: ₹${finalFare.toLocaleString('en-IN')} (${getEffectiveFareType() === 'inclusive' ? 'Inclusive' : 'Excl.'})\n\nThank you for choosing us!`;
                    }
                    const whatsAppLink = `https://wa.me/${custPhone}?text=${encodeURIComponent(msg)}`;

                    showStatus(`<div style="text-align:center;">
                        <i class="fa-solid fa-circle-check" style="font-size: 2rem; margin-bottom: 0.5rem; display:block;"></i>
                        <strong>Booking Confirmed: ${createdId}</strong><br>
                        <a href="${whatsAppLink}" target="_blank" class="fv-btn-primary" style="margin-top: 1rem; background: #25D366; text-decoration:none; height: 50px; font-size: 0.95rem; box-shadow: 0 4px 6px rgba(37, 211, 102, 0.2);">
                            <i class="fa-brands fa-whatsapp"></i> Send WhatsApp Confirmation
                        </a>
                        <p style="font-size: 0.75rem; margin-top: 1rem; opacity: 0.8;">Redirecting automatically...</p>
                    </div>`, 'success');
                    
                    setTimeout(() => {
                        window.location.href = `${adminRedirect}${adminRedirect.includes('?') ? '&' : '?'}msg=created&booking_id=${createdId}`;
                    }, 5000);
                } else {
                    showStatus('<i class="fa-solid fa-cloud-arrow-up"></i> Enquiry captured in CRM successfully!', 'success');
                    setTimeout(() => {
                        window.location.href = 'enquiries?msg=created';
                    }, 1500);
                }
            } else {
                throw new Error(res.message || 'Server returned an error');
            }
        })
        .catch(e => {
            showStatus(`<i class="fa-solid fa-triangle-exclamation"></i> Error: ${e.message}`, 'error');
            if (btnConfirm) btnConfirm.disabled = false;
            if (btnEnquiry) btnEnquiry.disabled = false;
        });
    }

    if (btnEnquiry) {
        btnEnquiry.addEventListener('click', e => {
            e.preventDefault();
            updateTotalDisplay();
            
            const endDateEl = document.getElementById('admin-end-date');
            const endTimeEl = document.getElementById('admin-end-time');
            const notesEl = document.getElementById('admin-notes-input');
            if (endDateEl) basePayload.endDate = endDateEl.value;
            if (endTimeEl) basePayload.dropTime = endTimeEl.value;
            if (notesEl) basePayload.dispatcherNotes = notesEl.value;

            basePayload.source = 'admin';
            sendApiRequest('api/send-enquiry.php', basePayload, false);
        });
    }

    if (btnConfirm) {
        btnConfirm.addEventListener('click', e => {
            e.preventDefault();
            updateTotalDisplay();
            
            const endDateEl = document.getElementById('admin-end-date');
            const endTimeEl = document.getElementById('admin-end-time');
            const notesEl = document.getElementById('admin-notes-input');
            if (endDateEl) basePayload.endDate = endDateEl.value;
            if (endTimeEl) basePayload.dropTime = endTimeEl.value;
            if (notesEl) basePayload.dispatcherNotes = notesEl.value;

            const confirmData = {
                bookingId: 'DC' + (basePayload.bookingId || '0').replace(/^(DE|DC|[EC])/i, ''),
                enquiryBookingId: basePayload.bookingId || null,
                enquiryId: window.DROP_CARS_FV_RECORD_ID && window.DROP_CARS_FV_SOURCE === 'enquiry' ? window.DROP_CARS_FV_RECORD_ID : null,
                bookingType: data.serviceType === 'round_trip' ? 'ROUND_TRIP' : (data.serviceType === 'hourly_rental' ? 'LOCAL_PACKAGE' : 'ONE_WAY'),
                pickupLocation: basePayload.pickup || '',
                dropLocation: basePayload.drop || '',
                pickupDate: basePayload.travelDate || '',
                pickupTime: basePayload.travelTime || '',
                vehicleType: data.selectedVehicle || 'SEDAN',
                estimatedFare: finalFare,
                distance: basePayload.distanceHint || 0,
                customerName: basePayload.customerName || '',
                customerPhone: basePayload.contactValue || '',
                customerEmail: basePayload.contactEmail || '',
                contactMethod: basePayload.contactMode || 'phone',
                discount_amount: 0,
                final_fare: finalFare,
                source: 'admin',
                fareType: getEffectiveFareType(),
                inclusiveTollAmount: getEffectiveFareType() === 'inclusive' ? getInclusiveTollAmount() : null,
                stops: basePayload.stops || [],
                vehicleEstimates: basePayload.vehicleEstimates || {},
                fareBreakdown: basePayload.fareBreakdown || null,
                endDate: basePayload.endDate || null,
                dropTime: basePayload.dropTime || null,
                dispatcherNotes: basePayload.dispatcherNotes || '',
                multiCityStopCharge: basePayload.multiCityStopCharge || 0,
                nightAllowance: basePayload.nightAllowance || 0
            };

            const finalPayload = { email_type: 'confirmation', booking_data: confirmData };
            sendApiRequest('api/confirm_booking.php', finalPayload, true);
        });
    }

    const vtabs = document.querySelectorAll('.fv-vtab');
    function applyVehicleFilter(vFilter, isInitial) {
        // Update quotation link parameter dynamically
        const quoteBtn = document.getElementById('btn-view-quotation');
        if (quoteBtn) {
            try {
                const url = new URL(quoteBtn.href, window.location.origin);
                url.searchParams.set('vehicle', vFilter);
                quoteBtn.href = url.pathname + url.search;
            } catch (e) {
                let href = quoteBtn.getAttribute('href');
                href = href.replace(/[&?]vehicle=[^&]+/g, '');
                const sep = href.indexOf('?') !== -1 ? '&' : '?';
                quoteBtn.setAttribute('href', href + sep + 'vehicle=' + vFilter);
            }
        }

        vtabs.forEach(btn => btn.classList.toggle('active', btn.dataset.v === vFilter));
        const allGroups = document.querySelectorAll('.fv-veh-group');
        allGroups.forEach(group => {
            if (vFilter === 'all') {
                group.style.display = '';
            } else if (group.classList.contains('fv-veh-all')) {
                group.style.display = '';
            } else if (group.classList.contains('fv-veh-' + vFilter)) {
                group.style.display = '';
            } else {
                group.style.display = 'none';
            }
        });

        // Update selected vehicle and recalculate total fare when switching vehicle tabs
        if (vFilter !== 'all') {
            const uppercaseVehicle = vFilter.toUpperCase();
            data.selectedVehicle = uppercaseVehicle;
            
            // Update sidebar selected vehicle name
            const sidebarVehName = document.querySelector('.fv-v-name');
            if (sidebarVehName) {
                sidebarVehName.textContent = uppercaseVehicle;
            }
            
            // Update baseEstimate for newly selected vehicle type
            const estVal = data.estimates[uppercaseVehicle];
            let initialBaseKmFare = 0;
            let initialDriverBata = 0;
            let initialPerKmRate = 0;
            let initialBillableKm = 0;
            let initialDriverBataPerDay = 0;
            let initialDriverBataMultiplier = 1;
            let initialNightAllowance = 0;
            let initialParking = 0;
            let initialWaiting = 0;

            let initialWaitingRate = 150;
            let initialWaitingHours = 1;

            const vData = (data.payload && data.payload.fareBreakdown && data.payload.fareBreakdown.vehicles) 
                ? data.payload.fareBreakdown.vehicles[uppercaseVehicle] 
                : null;
            
            if (vData) {
                initialBaseKmFare = Number(vData.kmCharge || 0);
                initialDriverBata = Number(vData.driverBata || vData.driverBataTotal || 0);
                initialPerKmRate = Number(vData.perKmRate || 0);
                initialBillableKm = Number(vData.effectiveBillableKm || 0);
                initialDriverBataPerDay = Number(vData.driverBataPerDay || vData.driverBata || 0);
                initialDriverBataMultiplier = Number(vData.tripDays || (data.payload.fareBreakdown && data.payload.fareBreakdown.tripDays) || 1);
                initialNightAllowance = Number(vData.driverNightAllowance || vData.multiCityNightAllowance || 0);
                initialParking = Number(vData.parkingCharges || vData.parking || 0);
                initialWaiting = Number(vData.waitingCharges || vData.waiting || 0);
                initialWaitingRate = Number(vData.waitingRate || 150);
                initialWaitingHours = Number(vData.waitingHours || (initialWaiting > 0 ? (initialWaiting / initialWaitingRate) : 1));
            } else if (estVal && typeof estVal === 'object') {
                initialBaseKmFare = Number(estVal.kmCharge || 0);
                initialDriverBata = Number(estVal.driverBata || estVal.driverBataTotal || 0);
                initialPerKmRate = Number(estVal.perKmRate || 0);
                initialBillableKm = Number(estVal.effectiveBillableKm || 0);
                initialDriverBataPerDay = Number(estVal.driverBataPerDay || estVal.driverBata || 0);
                initialDriverBataMultiplier = Number(estVal.tripDays || 1);
                initialNightAllowance = Number(estVal.driverNightAllowance || estVal.multiCityNightAllowance || 0);
                initialParking = Number(estVal.parkingCharges || estVal.parking || 0);
                initialWaiting = Number(estVal.waitingCharges || estVal.waiting || 0);
                initialWaitingRate = Number(estVal.waitingRate || 150);
                initialWaitingHours = Number(estVal.waitingHours || (initialWaiting > 0 ? (initialWaiting / initialWaitingRate) : 1));
            } else if (estVal) {
                initialBaseKmFare = Number(estVal);
            }
            if (initialDriverBataMultiplier <= 0) {
                initialDriverBataMultiplier = 1;
            }
            
            baseEstimate = initialBaseKmFare + initialDriverBata + initialNightAllowance + initialParking + initialWaiting;
            
            const baseKmInput = document.getElementById('admin-base-km-fare-input');
            const driverBataInput = document.getElementById('admin-driver-bata-input');
            if (baseKmInput) baseKmInput.value = initialBaseKmFare;
            if (driverBataInput) driverBataInput.value = initialDriverBata;
            
            if (perKmRateInput) perKmRateInput.value = initialPerKmRate;
            if (billableKmInput) billableKmInput.value = initialBillableKm;
            if (driverBataPerDayInput) driverBataPerDayInput.value = initialDriverBataPerDay;
            if (driverBataMultiplierInput) driverBataMultiplierInput.value = initialDriverBataMultiplier;

            if (nightAllowanceCheckbox) nightAllowanceCheckbox.checked = initialNightAllowance > 0;
            if (nightAllowanceInput) nightAllowanceInput.value = initialNightAllowance;

            if (parkingChargesCheckbox) parkingChargesCheckbox.checked = initialParking > 0;
            if (parkingChargesInput) parkingChargesInput.value = initialParking;

            if (waitingChargesCheckbox) waitingChargesCheckbox.checked = initialWaiting > 0;
            if (waitingHoursInput) waitingHoursInput.value = initialWaitingHours;
            if (waitingRateInput) waitingRateInput.value = initialWaitingRate;
            if (waitingChargesInput) waitingChargesInput.value = initialWaiting;
            
            autoComputeEndSchedule(true);
            
            // Auto update manual fare input if it exists
            const manualFareInput = document.getElementById('admin-manual-fare');
            if (manualFareInput) {
                if (isInitial) {
                    const initVal = parseInt(manualFareInput.value, 10);
                    if (!isNaN(initVal) && initVal > 0) {
                        manualFare = initVal;
                    } else {
                        manualFare = null;
                    }
                } else {
                    manualFare = null;
                }
                
                // Temporarily unset override to calculate base/inclusive auto fare
                delete data._overrideBorderFee;
                delete data._overrideBorderCount;
                const borderCountInput = document.getElementById('admin-border-count');
                if (borderCountInput) {
                    // Reset border crossings count input to detect state crossings normally
                    const posted = Array.isArray(data.borderTransitions) ? data.borderTransitions : [];
                    const recomputed = transitionsByStatePath(data.pickup, data.drop);
                    const borders = dedupeBorders(posted.length ? posted : (recomputed.length ? recomputed : []));
                    borderCountInput.value = borders.length;
                    const borderNote = document.getElementById('admin-border-count-note');
                    if (borderNote) {
                        borderNote.textContent = borders.length === 0 ? 'No border fee' : borders.length + 'x crossing(s) — auto';
                        borderNote.style.color = '#94a3b8';
                    }
                }
                updateTotalDisplay();
                if (!isInitial || manualFare === null) {
                    manualFareInput.value = finalFare;
                }
            } else {
                updateTotalDisplay();
            }
            pullFareViewSync().catch(function(err) { console.error('Breakdown sync failed:', err); });
        }
    }

    vtabs.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            applyVehicleFilter(btn.dataset.v, false);
        });
    });

    // Auto-select initial vehicle if specified
    if (data.selectedVehicle) {
        applyVehicleFilter(data.selectedVehicle.toLowerCase(), true);
    } else {
        applyVehicleFilter('all', true);
    }

    // ── Border crossing count override ─────────────────────────────────────
    // When admin manually sets the crossing count, recalculate state entry tax
    // and refresh the total so the number shown is always consistent.
    const borderCountInput = document.getElementById('admin-border-count');
    if (borderCountInput) {
        borderCountInput.addEventListener('input', function () {
            // Re-run getAdjustedFare with the overridden count baked in
            const count = Math.max(0, parseInt(String(borderCountInput.value), 10) || 0);
            const vk = (data.selectedVehicle || 'SEDAN').toUpperCase();
            const pc = window.DROP_CARS_PERMIT_CHARGES || {};
            const taxRates = {
                SEDAN: parseInt(pc.SEDAN, 10) || 500,
                SUV: parseInt(pc.SUV, 10) || 1000,
                INNOVA: parseInt(pc.INNOVA, 10) || 1500,
                CRYSTA: parseInt(pc.CRYSTA, 10) || 1500
            };
            const andhraPremium = parseInt(pc.andhra_premium, 10) || 2000;
            const baseTax = taxRates[vk] || 500;
            // Simple flat multiply — "andhra premium" not applicable for manual count mode
            const overrideFee = count * baseTax;

            const taxDisplay = document.getElementById('admin-tax-display');
            if (taxDisplay) {
                taxDisplay.innerHTML = count === 0
                    ? '<span style="color:#64748b;">₹0</span>'
                    : '₹' + overrideFee.toLocaleString('en-IN');
            }
            const borderNote = document.getElementById('admin-border-count-note');
            if (borderNote) {
                borderNote.textContent = count === 0 ? 'No border fee' : count + 'x crossing(s) — manual override';
                borderNote.style.color = count > 0 ? '#f59e0b' : '#94a3b8';
            }

            // Patch data.borderTransitions to a synthetic list matching the count
            // so getAdjustedFare reads the right borderFee
            data._overrideBorderCount = count;
            data._overrideBorderFee = overrideFee;
            updateTotalDisplay();
        });
        borderCountInput.addEventListener('change', function () {
            pullFareViewSync().catch(function(err) { console.error('Breakdown sync failed:', err); });
        });
    }

    // Trigger once to sync state
    updateTotalDisplay();

    // ── Save Changes button ─────────────────────────────────────────────────
    const btnSaveFare = document.getElementById('admin-btn-save-fare');
    if (btnSaveFare && window.DROP_CARS_FV_RECORD_ID && window.DROP_CARS_FV_SOURCE) {
        console.log('[DropCars FV] Attaching save listener...');
        btnSaveFare.addEventListener('click', function () {
            console.log('[DropCars Save] CLICK FIRED');
            // Always re-read the manual fare input before saving
            if (manualFareInput) {
                const v = parseInt(String(manualFareInput.value).replace(/\D/g, ''), 10);
                manualFare = (!isNaN(v) && v > 0) ? v : null;
            }
            updateTotalDisplay();
            const saveFare = (manualFare !== null && manualFare > 0) ? manualFare : finalFare;
            console.log('[DropCars Save] manualFare=', manualFare, 'finalFare=', finalFare, 'saveFare=', saveFare);
            if (!saveFare || saveFare <= 0) {
                showStatus('Set a fare amount before saving.', 'error');
                return;
            }

            btnSaveFare.disabled = true;
            btnSaveFare.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

            const borderCount = borderCountInput ? Math.max(0, parseInt(String(borderCountInput.value), 10) || 0) : 0;
            const formData = new FormData();
            formData.append('source',        window.DROP_CARS_FV_SOURCE);
            formData.append('record_id',     String(window.DROP_CARS_FV_RECORD_ID));
            formData.append('fare_estimate', String(Math.round(saveFare)));
            formData.append('fare_type',     getEffectiveFareType());
            formData.append('toll_amount',   String(getInclusiveTollAmount()));
            formData.append('border_count',  String(borderCount));
            if (data.distanceHint > 0) formData.append('distance_km', String(data.distanceHint));
            if (data.payload && data.payload.durationHint) formData.append('duration', String(data.payload.durationHint));
            formData.append('vehicle_type',  data.selectedVehicle || 'SEDAN');

            const startDateInputEl = document.getElementById('admin-start-date');
            const startTimeInputEl = document.getElementById('admin-start-time');
            const endDateInputEl = document.getElementById('admin-end-date');
            const endTimeInputEl = document.getElementById('admin-end-time');
            const notesInputEl = document.getElementById('admin-notes-input');
            const sendNotifInputEl = document.getElementById('admin-send-notification-checkbox');

            if (startDateInputEl) formData.append('pickup_date', startDateInputEl.value);
            if (startTimeInputEl) formData.append('pickup_time', startTimeInputEl.value);
            if (endDateInputEl) formData.append('end_date', endDateInputEl.value);
            if (endTimeInputEl) formData.append('drop_time', endTimeInputEl.value);
            if (notesInputEl) formData.append('dispatcher_notes', notesInputEl.value);
            if (sendNotifInputEl) formData.append('send_notification', sendNotifInputEl.checked ? '1' : '');

            const syncedData = buildSyncedFareData();
            if (syncedData.payload && syncedData.payload.fareBreakdown) {
                formData.append('fare_breakdown', JSON.stringify(syncedData.payload.fareBreakdown));
            }
            if (syncedData.payload && syncedData.payload.vehicleEstimates) {
                formData.append('vehicle_estimates', JSON.stringify(syncedData.payload.vehicleEstimates));
            }

            fetch(window.DROP_CARS_FV_ADMIN_URL, { method: 'POST', body: formData })
                .then(function (r) {
                    return r.text().then(function(txt) {
                        console.log('[DropCars Save] raw response:', txt);
                        try { return JSON.parse(txt); }
                        catch(parseErr) { return { ok: false, msg: 'Server error: ' + txt.substring(0, 200) }; }
                    });
                })
                .then(function (res) {
                    if (res.ok) {
                        showStatus('<i class="fa-solid fa-circle-check"></i> ' + res.msg, 'success');
                    } else {
                        showStatus('<i class="fa-solid fa-triangle-exclamation"></i> ' + (res.msg || 'Save failed'), 'error');
                    }
                })
                .catch(function (e) {
                    console.error('[DropCars Save] fetch error:', e);
                    showStatus('<i class="fa-solid fa-triangle-exclamation"></i> Network error: ' + e.message, 'error');
                })
                .finally(function () {
                    btnSaveFare.disabled = false;
                    btnSaveFare.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes to Record';
                });
        });
    }

    // ── Sidebar Share & Export buttons ──────────────────────────────────────
    const btnSidebarPrint = document.getElementById('btn-sidebar-print');
    if (btnSidebarPrint) {
        btnSidebarPrint.addEventListener('click', function(e) {
            e.preventDefault();
            const quoteBtn = document.getElementById('btn-view-quotation');
            if (quoteBtn) {
                try {
                    const url = new URL(quoteBtn.href, window.location.origin);
                    url.searchParams.set('autoprint', '1');
                    window.open(url.pathname + url.search, '_blank');
                } catch (err) {
                    let href = quoteBtn.getAttribute('href');
                    href = href.replace(/[&?]autoprint=[^&]+/g, '');
                    const sep = href.indexOf('?') !== -1 ? '&' : '?';
                    window.open(href + sep + 'autoprint=1', '_blank');
                }
            }
        });
    }

    // WhatsApp modal logic
    const modalOverlayEl = document.getElementById('wa-share-modal');
    if (modalOverlayEl) {
        document.body.appendChild(modalOverlayEl);
    }
    const btnSidebarWhatsapp = document.getElementById('btn-sidebar-whatsapp');

    let currentTemplate = 'quote';

    function getRouteUrl(pickup, drop) {
        if (!pickup || !drop) return '';
        const pCity = pickup.split(',')[0].trim();
        const dCity = drop.split(',')[0].trim();
        const slugP = pCity.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-');
        const slugD = dCity.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-');
        if (!slugP || !slugD) return '';
        return `https://dropcars.in/drop-cars/${slugP}-to-${slugD}`;
    }

    function getSelectedTemplateText(type) {
        // Read latest values from page state
        updateTotalDisplay();
        
        const serviceLabels = {
            'one_way': 'One Way Trip',
            'round_trip': 'Round Trip',
            'hourly_rental': 'Hourly Rental',
            'multi_city': 'Multi-City Trip'
        };
        const serviceLabel = serviceLabels[data.serviceType] || 'Cab Trip';
        const dateStr = basePayload.travelDate || '';
        const timeStr = basePayload.travelTime || '';

        const isTolls = document.getElementById('admin-toll-include-checkbox') ? document.getElementById('admin-toll-include-checkbox').checked : false;
        const isTaxes = document.getElementById('admin-tax-include-checkbox') ? document.getElementById('admin-tax-include-checkbox').checked : false;

        const trackingId = basePayload.bookingId || (data.payload && data.payload.bookingId) || '';
        const isEnquiry = (window.DROP_CARS_FV_SOURCE === 'enquiry') || 
                          (trackingId && /^[E]/i.test(trackingId)) ||
                          (trackingId && /ENQ/i.test(trackingId));

        let resolvedBookingId = trackingId;
        if (resolvedBookingId) {
            if (resolvedBookingId.startsWith('DE')) {
                resolvedBookingId = 'C' + resolvedBookingId.substring(2);
            } else if (resolvedBookingId.startsWith('E')) {
                resolvedBookingId = 'C' + resolvedBookingId.substring(1);
            } else if (resolvedBookingId.startsWith('DC')) {
                resolvedBookingId = 'C' + resolvedBookingId.substring(2);
            }
        }

        let routeParts = [];
        if (basePayload.pickup) routeParts.push(basePayload.pickup);
        if (basePayload.stops && basePayload.stops.length > 0) {
            basePayload.stops.forEach(stop => {
                if (stop && stop.trim()) {
                    routeParts.push(stop.trim());
                }
            });
        }
        if (basePayload.drop) routeParts.push(basePayload.drop);
        if (data.serviceType === 'round_trip' && basePayload.pickup) {
            routeParts.push(`Return to ${basePayload.pickup}`);
        }
        const routeString = routeParts.join(" -> ");

        const perKmRateInput = document.getElementById('admin-per-km-rate-input');
        const billableKmInput = document.getElementById('admin-billable-km-input');
        const perKmRate = perKmRateInput ? parseFloat(perKmRateInput.value) || 0 : 0;
        const billableKm = billableKmInput ? parseFloat(billableKmInput.value) || 0 : 0;

        let baseFareInc = 'Base Fare';
        if (billableKm > 0) {
            baseFareInc = `Base Fare (up to ${Math.round(billableKm)} km)`;
        }
        const inclusionsList = [
            baseFareInc,
            'Driver Allowance (Bata)',
            'Fuel and Maintenance',
            'Clean Air-Conditioned Vehicle'
        ];
        if (isTolls) inclusionsList.push('Highway Tolls (Fastag)');
        if (isTaxes) inclusionsList.push('State Permit Tax');
        const inclusionsText = inclusionsList.map(item => `- ${item}`).join('\n');

        const exclusionsList = [];
        if (!isTolls) exclusionsList.push('Highway Tolls (Paid as actuals via Fastag)');
        if (!isTaxes) exclusionsList.push('State Entry Permit Tax (Paid as actuals at border)');
        if (perKmRate > 0 && billableKm > 0) {
            exclusionsList.push(`Extra KM Charge (Rs. ${Math.round(perKmRate)}/km beyond ${Math.round(billableKm)} km)`);
        }
        exclusionsList.push('Parking Charges (Paid at venue)');
        exclusionsList.push('Waiting Charges (Extra after 30-min grace period)');
        const exclusionsText = exclusionsList.map(item => `- ${item}`).join('\n');

        const custName = basePayload.customerName || 'Customer';
        const routeUrl = getRouteUrl(basePayload.pickup, basePayload.drop);
        const fareTypeLabel = (getEffectiveFareType() === 'inclusive') ? 'Inclusive of all taxes' : 'Excl. toll/state tax';
        const formattedFare = finalFare > 0 ? `₹${finalFare.toLocaleString('en-IN')}` : '0';

        if (type === 'quote') {
            let text = `🌟 *DROP CARS* 🌟\n` +
                       `_Premium Intercity Cab Services_\n\n` +
                       `Dear *${custName}*,\n\n` +
                       `Thank you for choosing *Drop Cars*. We have received your travel request. Please find your custom trip quotation below:\n\n` +
                       `━━━━━━━━━━━━━━━━━━━\n` +
                       `🚖 *TRIP DETAILS*\n` +
                       `━━━━━━━━━━━━━━━━━━━\n` +
                       `📍 *Route:* ${basePayload.pickup || 'N/A'} ➔ ${basePayload.drop || 'N/A'}\n` +
                       `💼 *Trip Type:* ${serviceLabel}\n`;
            if (dateStr) text += `📅 *Date:* ${dateStr}\n`;
            if (timeStr) text += `⏰ *Time:* ${timeStr}\n`;
            if (routeUrl) text += `🔗 *Route Details:* ${routeUrl}\n`;
            
            text += `\n━━━━━━━━━━━━━━━━━━━\n` +
                    `💰 *FARE SUMMARY*\n` +
                    `━━━━━━━━━━━━━━━━━━━\n`;
            if (finalFare > 0) {
                text += `💵 *Estimated Fare:* *${formattedFare}*\n` +
                        `ℹ️ *Fare Type:* _${fareTypeLabel}_\n` +
                        `🚗 *Vehicle Class:* ${data.selectedVehicle || 'SEDAN'}\n`;
            } else {
                text += `Our team is currently verifying vehicle availability and will share the best fare details with you shortly.\n`;
            }
            
            text += `\n━━━━━━━━━━━━━━━━━━━\n` +
                    `🎁 *CUSTOMER PRIVILEGES*\n` +
                    `━━━━━━━━━━━━━━━━━━━\n` +
                    `Log in to your customer dashboard to claim exclusive discounts and earn reward points on your booking:\n` +
                    `👉 https://dropcars.in/pages/customer-login.php\n\n` +
                    (resolvedBookingId ? `📌 *Reference ID:* #${resolvedBookingId}\n\n` : '') +
                    `If you would like to proceed with this booking or need assistance, simply reply to this message.\n` +
                    `Regards,\n` +
                    `*Drop Cars Team*`;
            return text;
        } else if (type === 'confirm') {
            const trackingUrl = resolvedBookingId ? `https://dropcars.in/track-booking/${resolvedBookingId}` : '';
            let text = `🌟 *DROP CARS* 🌟\n` +
                       `_Booking Confirmed!_\n\n` +
                       `Dear *${custName}*,\n\n` +
                       `We are pleased to inform you that your booking ${resolvedBookingId ? `*#${resolvedBookingId}*` : ''} has been successfully *CONFIRMED*!\n\n` +
                       `━━━━━━━━━━━━━━━━━━━\n` +
                       `🚖 *TRIP INFORMATION*\n` +
                       `━━━━━━━━━━━━━━━━━━━\n` +
                       `📍 *Route:* ${basePayload.pickup || 'N/A'} ➔ ${basePayload.drop || 'N/A'}\n` +
                       `💼 *Service Type:* ${serviceLabel}\n`;
            if (dateStr) text += `📅 *Travel Date:* ${dateStr}\n`;
            if (timeStr) text += `⏰ *Pickup Time:* ${timeStr}\n`;
            
            if (data.serviceType === 'round_trip') {
                const returnDateEl = document.getElementById('admin-end-date');
                const returnTimeEl = document.getElementById('admin-end-time');
                const returnDateVal = returnDateEl ? returnDateEl.value : '';
                const returnTimeVal = returnTimeEl ? returnTimeEl.value : '';
                if (returnDateVal) {
                    text += `📅 *Return Date:* ${returnDateVal}${returnTimeVal ? ' at ' + returnTimeVal : ''}\n`;
                }
            }
            text += `\n`;
            
            text += `━━━━━━━━━━━━━━━━━━━\n` +
                    `💵 *FARE & BILLING*\n` +
                    `━━━━━━━━━━━━━━━━━━━\n` +
                    `🚗 *Vehicle:* ${data.selectedVehicle || 'SEDAN'}\n` +
                    `💰 *Total Fare:* *${formattedFare}* _(${fareTypeLabel})_\n` +
                    `💳 *Advance Paid:* *₹0* _(No payment received yet)_\n` +
                    `💵 *Balance Due:* *${formattedFare}* _(payable to driver at pickup/trip end)_\n\n`;
            
            if (billableKm > 0) {
                text += `━━━━━━━━━━━━━━━━━━━\n` +
                        `🛣️ *TRIP LIMITS & CHARGES*\n` +
                        `━━━━━━━━━━━━━━━━━━━\n` +
                        `🛣️ *KM Allowance:* ${Math.round(billableKm)} km\n` +
                        `🪙 *Extra KM Rate:* ₹${perKmRate}/km beyond the limit\n` +
                        `⏱️ *Waiting Charges:* ₹150 per hour applies (after 45 mins grace period)\n\n`;
            }
            
            text += `━━━━━━━━━━━━━━━━━━━\n` +
                    `✅ *INCLUSIONS*\n` +
                    `━━━━━━━━━━━━━━━━━━━\n` +
                    `${inclusionsText}\n\n` +
                    `━━━━━━━━━━━━━━━━━━━\n` +
                    `❌ *EXCLUSIONS*\n` +
                    `━━━━━━━━━━━━━━━━━━━\n` +
                    `${exclusionsText}\n\n`;
            
            if (routeUrl) {
                text += `━━━━━━━━━━━━━━━━━━━\n` +
                        `🗺️ *EXPLORE THIS ROUTE*\n` +
                        `━━━━━━━━━━━━━━━━━━━\n` +
                        `Find fare details, travel time & sightseeing info:\n` +
                        `👉 ${routeUrl}\n\n`;
            }
            if (trackingUrl) {
                text += `━━━━━━━━━━━━━━━━━━━\n` +
                        `📱 *REAL-TIME TRACKING*\n` +
                        `━━━━━━━━━━━━━━━━━━━\n` +
                        `Track your driver and trip status in real-time:\n` +
                        `👉 ${trackingUrl}\n\n`;
            }
            
            text += `━━━━━━━━━━━━━━━━━━━\n` +
                    `*Booking Confirmed!* We will notify you once your driver is assigned.` +
                    `\n\n━━━━━━━━━━━━━━━━━━━\n` +
                    `*Website:* https://dropcars.in\n` +
                    `*Email:* support@dropcars.in\n` +
                    `*Support:* ${window.DROP_CARS_SUPPORT_PHONE || '+91 7200217986'}`;
            return text;
        } else if (type === 'updates') {
            const trackingUrl = resolvedBookingId ? `https://dropcars.in/track-booking/${resolvedBookingId}` : '';
            let text = `🌟 *DROP CARS* 🌟\n` +
                       `_Booking Updated!_\n\n` +
                       `Dear *${custName}*,\n\n` +
                       `We have updated the details for your booking ${resolvedBookingId ? `*#${resolvedBookingId}*` : ''} as requested. Please find the revised details below:\n\n` +
                       `━━━━━━━━━━━━━━━━━━━\n` +
                       `🚖 *TRIP INFORMATION*\n` +
                       `━━━━━━━━━━━━━━━━━━━\n` +
                       `📍 *Route:* ${basePayload.pickup || 'N/A'} ➔ ${basePayload.drop || 'N/A'}\n` +
                       `💼 *Service Type:* ${serviceLabel}\n`;
            if (dateStr) text += `📅 *Travel Date:* ${dateStr}\n`;
            if (timeStr) text += `⏰ *Pickup Time:* ${timeStr}\n`;
            
            if (data.serviceType === 'round_trip') {
                const returnDateEl = document.getElementById('admin-end-date');
                const returnTimeEl = document.getElementById('admin-end-time');
                const returnDateVal = returnDateEl ? returnDateEl.value : '';
                const returnTimeVal = returnTimeEl ? returnTimeEl.value : '';
                if (returnDateVal) {
                    text += `📅 *Return Date:* ${returnDateVal}${returnTimeVal ? ' at ' + returnTimeVal : ''}\n`;
                }
            }
            text += `\n`;
            
            text += `━━━━━━━━━━━━━━━━━━━\n` +
                    `💵 *FARE & BILLING*\n` +
                    `━━━━━━━━━━━━━━━━━━━\n` +
                    `🚗 *Vehicle:* ${data.selectedVehicle || 'SEDAN'}\n` +
                    `💰 *Total Fare:* *${formattedFare}* _(${fareTypeLabel})_\n` +
                    `💵 *Balance Due:* *${formattedFare}* _(payable to driver at trip end)_\n\n`;
            
            if (billableKm > 0) {
                text += `━━━━━━━━━━━━━━━━━━━\n` +
                        `🛣️ *TRIP LIMITS & CHARGES*\n` +
                        `━━━━━━━━━━━━━━━━━━━\n` +
                        `🛣️ *KM Allowance:* ${Math.round(billableKm)} km\n` +
                        `🪙 *Extra KM Rate:* ₹${perKmRate}/km beyond the limit\n` +
                        `⏱️ *Waiting Charges:* ₹150 per hour applies (after 45 mins grace period)\n\n`;
            }
            
            text += `━━━━━━━━━━━━━━━━━━━\n` +
                    `✅ *INCLUSIONS*\n` +
                    `━━━━━━━━━━━━━━━━━━━\n` +
                    `${inclusionsText}\n\n` +
                    `━━━━━━━━━━━━━━━━━━━\n` +
                    `❌ *EXCLUSIONS*\n` +
                    `━━━━━━━━━━━━━━━━━━━\n` +
                    `${exclusionsText}\n\n`;
            
            if (routeUrl) {
                text += `━━━━━━━━━━━━━━━━━━━\n` +
                        `🗺️ *EXPLORE THIS ROUTE*\n` +
                        `━━━━━━━━━━━━━━━━━━━\n` +
                        `Find fare details, travel time & sightseeing info:\n` +
                        `👉 ${routeUrl}\n\n`;
            }
            if (trackingUrl) {
                text += `━━━━━━━━━━━━━━━━━━━\n` +
                        `📱 *REAL-TIME TRACKING*\n` +
                        `━━━━━━━━━━━━━━━━━━━\n` +
                        `Track your driver and trip status in real-time:\n` +
                        `👉 ${trackingUrl}\n\n`;
            }
            
            text += `━━━━━━━━━━━━━━━━━━━\n` +
                    `*Booking Updated!* Have a safe and pleasant journey.` +
                    `\n\n━━━━━━━━━━━━━━━━━━━\n` +
                    `*Website:* https://dropcars.in\n` +
                    `*Email:* support@dropcars.in\n` +
                    `*Support:* ${window.DROP_CARS_SUPPORT_PHONE || '+91 7200217986'}`;
            return text;
        } else if (type === 'advance') {
            const advancePct = window.DROP_CARS_ADVANCE_PERCENT || 20;
            const advanceAmt = Math.max(300, Math.round(finalFare * advancePct / 100));
            const upiId = window.DROP_CARS_UPI_ID || '7200217986-1@okbizaxis';
            const cleanId = resolvedBookingId ? resolvedBookingId.replace(/[^a-zA-Z0-9]/g, '') : '';
            
            return `🌟 *DROP CARS* 🌟\n` +
                   `_Booking Confirmation Pending_\n\n` +
                   `Dear *${custName}*,\n\n` +
                   `To secure and finalize your booking ${resolvedBookingId ? `*#${resolvedBookingId}*` : ''} for your upcoming journey from *${basePayload.pickup || 'N/A'}* to *${basePayload.drop || 'N/A'}*, we kindly request an advance payment of *₹${advanceAmt}* (${advancePct}% of the total fare ₹${finalFare.toLocaleString('en-IN')}).\n\n` +
                   `━━━━━━━━━━━━━━━━━━━\n` +
                   `💸 *PAYMENT DETAILS*\n` +
                   `━━━━━━━━━━━━━━━━━━━\n` +
                   `🏦 *UPI ID:* *${upiId}*\n` +
                   `💰 *Amount:* *₹${advanceAmt}*\n` +
                   (resolvedBookingId ? `📌 *Reference ID:* *#${resolvedBookingId}*\n\n` : '\n') +
                   `━━━━━━━━━━━━━━━━━━━\n` +
                   `📲 *UPLOAD PAY RECEIPT*\n` +
                   `━━━━━━━━━━━━━━━━━━━\n` +
                   `Please upload your transaction screenshot to instantly confirm your booking:\n` +
                   `👉 https://dropcars.in/thank-you/${cleanId}\n\n` +
                   `_Your booking will be fully confirmed once we verify the advance payment. Thank you for choosing us!_` +
                   `\n\n━━━━━━━━━━━━━━━━━━━\n` +
                   `*Website:* https://dropcars.in\n` +
                   `*Email:* support@dropcars.in\n` +
                   `*Support:* ${window.DROP_CARS_SUPPORT_PHONE || '+91 7200217986'}`;
        } else if (type === 'customer_share') {
            const trackingUrl = resolvedBookingId ? `https://dropcars.in/track-booking/${resolvedBookingId}` : '';
            let text = `🌟 *DROP CARS* 🌟\n` +
                       `_Your Trusted Outstation Cab Partner_\n\n` +
                       `Dear *${custName}*,\n\n` +
                       `Thank you for choosing *Drop Cars*! Here is a summary of your trip for your reference:\n\n` +
                       `━━━━━━━━━━━━━━━━━━━\n` +
                       `🗺️ *YOUR TRIP AT A GLANCE*\n` +
                       `━━━━━━━━━━━━━━━━━━━\n` +
                       `📍 *From:* ${basePayload.pickup || 'N/A'}\n` +
                       `🏁 *To:* ${basePayload.drop || 'N/A'}\n` +
                       `🚗 *Vehicle:* ${data.selectedVehicle || 'SEDAN'}\n` +
                       `💼 *Trip Type:* ${serviceLabel}\n`;
            if (dateStr) text += `📅 *Travel Date:* ${dateStr}\n`;
            if (timeStr) text += `⏰ *Pickup Time:* ${timeStr}\n`;
            
            if (data.serviceType === 'round_trip') {
                const returnDateEl = document.getElementById('admin-end-date');
                const returnTimeEl = document.getElementById('admin-end-time');
                const returnDateVal = returnDateEl ? returnDateEl.value : '';
                const returnTimeVal = returnTimeEl ? returnTimeEl.value : '';
                if (returnDateVal) {
                    text += `📅 *Return Date:* ${returnDateVal}${returnTimeVal ? ' at ' + returnTimeVal : ''}\n`;
                }
            }
            if (resolvedBookingId) text += `📌 *Booking ID:* *#${resolvedBookingId}*\n`;
            if (finalFare > 0) {
                text += `\n━━━━━━━━━━━━━━━━━━━\n` +
                        `💰 *FARE DETAILS*\n` +
                        `━━━━━━━━━━━━━━━━━━━\n` +
                        `💵 *Total Fare:* *${formattedFare}* _(${fareTypeLabel})_\n` +
                        `💳 *Payment:* Payable to driver at pickup/trip end\n`;
            }
            if (trackingUrl) {
                text += `\n━━━━━━━━━━━━━━━━━━━\n` +
                        `📱 *TRACK YOUR TRIP*\n` +
                        `━━━━━━━━━━━━━━━━━━━\n` +
                        `👉 ${trackingUrl}\n`;
            }
            text += `\n━━━━━━━━━━━━━━━━━━━\n` +
                    `_For any assistance, simply reply or call us:_\n` +
                    `📞 *${window.DROP_CARS_SUPPORT_PHONE || '+91 7200217986'}*\n` +
                    `🌐 https://dropcars.in\n\n` +
                    `_Have a safe and pleasant journey!_\n` +
                    `*— Drop Cars Team* 🙏`;
            return text;
        } else if (type === 'group_share') {
            const bataInput = document.getElementById('admin-driver-bata-per-day-input') || document.getElementById('admin-driver-bata-input');
            const driverBataVal = bataInput ? parseFloat(bataInput.value) || 300 : 300;
            const rateVal = perKmRate > 0 ? perKmRate : 15;
            const distanceVal = data.distance || 0;

            let text = `🚖 *DROP CARS — VEHICLE REQUIREMENT* 🚖\n` +
                       `_New outstation trip requirement posted. Please verify details and accept._\n\n`;
            if (resolvedBookingId) text += `📌 *Booking ID:* *#${resolvedBookingId}*\n`;
            text += `━━━━━━━━━━━━━━━━━━━\n🗺️ *TRIP INFORMATION*\n━━━━━━━━━━━━━━━━━━━\n` +
                    `📍 *Pickup:* ${basePayload.pickup || 'N/A'}\n` +
                    `🏁 *Drop Location:* ${basePayload.drop || 'N/A'}\n` +
                    `🚗 *Required Vehicle:* ${data.selectedVehicle || 'SEDAN'}\n` +
                    `💼 *Trip Type:* ${serviceLabel}\n` +
                    `📅 *Date:* ${dateStr || 'N/A'}\n` +
                    `⏰ *Reporting Time:* ${timeStr || 'N/A'}\n`;
            if (data.serviceType === 'round_trip') {
                const returnDateEl = document.getElementById('admin-end-date');
                const returnTimeEl = document.getElementById('admin-end-time');
                const returnDateVal = returnDateEl ? returnDateEl.value : '';
                const returnTimeVal = returnTimeEl ? returnTimeEl.value : '';
                if (returnDateVal) {
                    text += `📅 *Return Date:* ${returnDateVal}${returnTimeVal ? ' at ' + returnTimeVal : ''}\n`;
                }
            }
            if (distanceVal > 0) {
                text += `🛣️ *Approx Distance:* ~${Math.round(distanceVal)} KM\n`;
            }
            text += `━━━━━━━━━━━━━━━━━━━\n💰 *DRIVERS PAYOUT & DETAILS*\n━━━━━━━━━━━━━━━━━━━\n` +
                    `💵 *KM Rate:* ₹${rateVal}/KM\n` +
                    `👨‍✈️ *Driver Bata:* ₹${driverBataVal} / Day\n` +
                    `🧾 *Agency Commission:* 10%\n` +
                    `🛣️ *Exclusions:* Toll, Parking, State Permit charges paid extra (as actuals)\n` +
                    `━━━━━━━━━━━━━━━━━━━\n\n` +
                    `📣 Book/Attach your vehicles with *Drop Cars*!\n` +
                    `📞 *Drop Cars Control:* +91 75988 99579\n` +
                    `🌐 https://dropcars.in\n\n` +
                    `📱 *Driver App Download:*\nhttps://play.google.com/store/apps/details?id=com.dropcars.driverapp\n\n` +
                    `📢 *Follow Telegram for Live Booking Updates:*\nhttps://t.me/drop_cars\n\n` +
                    `💬 *WhatsApp Channel (🚖 Drop Cars - Driver Updates 🚨):*\nhttps://whatsapp.com/channel/0029VbB6Wj04tRrza58IwZ2p\n\n` +
                    `_Reply with vehicle number and driver details to accept._`;
            return text;
        } else if (type === 'driver_share') {
            const dCustPhone = (basePayload.contactValue || '').replace(/\D/g, '');
            const dCustPhoneDisplay = dCustPhone ? `+91 ${dCustPhone}` : 'N/A';
            const distanceVal = data.distance || 0;
            let text = `🚖 *DROP CARS — TRIP ASSIGNMENT* 🚖\n` +
                       `_Please read carefully and reply ✅ to confirm this trip._\n\n`;
            if (resolvedBookingId) text += `📌 *Booking ID:* *#${resolvedBookingId}*\n`;
            text += `━━━━━━━━━━━━━━━━━━━\n👤 *PASSENGER CONTACT DETAILS*\n━━━━━━━━━━━━━━━━━━━\n` +
                    `🙋 *Name:* ${custName}\n` +
                    `📞 *Phone:* ${dCustPhoneDisplay}\n\n` +
                    `━━━━━━━━━━━━━━━━━━━\n🗺️ *TRIP INFORMATION*\n━━━━━━━━━━━━━━━━━━━\n` +
                    `📍 *Pickup Address:* ${basePayload.pickup || 'N/A'}\n` +
                    `🏁 *Drop Address:* ${basePayload.drop || 'N/A'}\n` +
                    `🚗 *Vehicle Category:* ${data.selectedVehicle || 'SEDAN'}\n` +
                    `💼 *Trip Type:* ${serviceLabel}\n`;
            if (dateStr) text += `📅 *Travel Date:* ${dateStr}\n`;
            if (timeStr) text += `⏰ *Report By:* ${timeStr} _(arrive 10 min early)_\n`;
            if (data.serviceType === 'round_trip') {
                const returnDateEl = document.getElementById('admin-end-date');
                const returnTimeEl = document.getElementById('admin-end-time');
                const returnDateVal = returnDateEl ? returnDateEl.value : '';
                const returnTimeVal = returnTimeEl ? returnTimeEl.value : '';
                if (returnDateVal) {
                    text += `📅 *Return Date:* ${returnDateVal}${returnTimeVal ? ' at ' + returnTimeVal : ''}\n`;
                }
            }
            if (distanceVal > 0) {
                text += `🛣️ *Approx Distance:* ~${Math.round(distanceVal)} KM\n`;
            }
            text += `📍 *Navigate Pickup:* https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(basePayload.pickup || '')}\n` +
                    `🏁 *Navigate Drop:* https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(basePayload.drop || '')}\n`;
            if (finalFare > 0) {
                text += `━━━━━━━━━━━━━━━━━━━\n💰 *FARE & COLLECTION REMINDER*\n━━━━━━━━━━━━━━━━━━━\n` +
                        `💵 *Amount to Collect:* *${formattedFare}*\n` +
                        `🧾 *Fare Inclusions:* ${getEffectiveFareType() === 'inclusive' ? 'Inclusive of Highway Toll & Permit Tax' : 'Exclusions apply (Passenger pays Toll/Permit extra)'}\n` +
                        `🚨 _Collect exact balance amount from passenger at trip end._\n`;
            }
            text += `━━━━━━━━━━━━━━━━━━━\n📋 *MANDATORY DRIVER REMINDERS*\n━━━━━━━━━━━━━━━━━━━\n` +
                    `1. Ensure vehicle is fully washed, clean, and has working A/C.\n` +
                    `2. Be punctual — arrive 15 minutes before pickup time.\n` +
                    `3. Carry valid license (DL), RC book, permit, and insurance.\n` +
                    `4. Take start-trip and end-trip odometer photos and share with office.\n\n` +
                    `📞 *Drop Cars Dispatch Control:* +91 75988 99579\n\n` +
                    `📱 *Driver App Download:*\nhttps://play.google.com/store/apps/details?id=com.dropcars.driverapp\n\n` +
                    `📢 *Follow Telegram for Live Booking Updates:*\nhttps://t.me/drop_cars\n\n` +
                    `💬 *WhatsApp Channel (🚖 Drop Cars - Driver Updates 🚨):*\nhttps://whatsapp.com/channel/0029VbB6Wj04tRrza58IwZ2p\n\n` +
                    `_Reply with your vehicle details and ✅ to accept._`;
            return text;
        }
        return '';
    }

    function updateTextareaAndCount() {
        const messageTextarea = document.getElementById('wa-message-text');
        const charCountEl = document.getElementById('wa-char-count');
        if (messageTextarea) {
            const text = getSelectedTemplateText(currentTemplate);
            messageTextarea.value = text;
            if (charCountEl) {
                charCountEl.textContent = `${text.length} chars`;
            }
        }
    }

    if (btnSidebarWhatsapp) {
        btnSidebarWhatsapp.addEventListener('click', function(e) {
            e.preventDefault();
            
            const modalOverlay = document.getElementById('wa-share-modal');
            const phoneInput = document.getElementById('wa-recipient-phone');
            const templateTabs = document.querySelectorAll('.wa-tab-btn');
            
            let custPhone = (basePayload.contactValue || '').replace(/\D/g, "");
            if (!custPhone) {
                custPhone = "91";
            } else if (custPhone.length === 10) {
                custPhone = '91' + custPhone;
            }
            if (phoneInput) phoneInput.value = custPhone;
            
            // Reset tab highlights
            templateTabs.forEach(t => t.classList.toggle('active', t.dataset.template === 'quote'));
            currentTemplate = 'quote';
            updateTextareaAndCount();
            
            if (modalOverlay) modalOverlay.style.display = 'flex';
        });
    }

    // Modal tabs click
    document.querySelectorAll('.wa-tab-btn').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.wa-tab-btn').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            currentTemplate = this.dataset.template;
            updateTextareaAndCount();
        });
    });

    // Textarea character count updates
    const msgTextarea = document.getElementById('wa-message-text');
    if (msgTextarea) {
        msgTextarea.addEventListener('input', function() {
            const charCountEl = document.getElementById('wa-char-count');
            if (charCountEl) charCountEl.textContent = `${this.value.length} chars`;
        });
    }

    // Close modal handlers
    function hideWaModal() {
        const modalOverlay = document.getElementById('wa-share-modal');
        if (modalOverlay) modalOverlay.style.display = 'none';
    }
    const btnClose = document.getElementById('wa-modal-close');
    if (btnClose) btnClose.addEventListener('click', hideWaModal);
    
    // Reuse the modalOverlayEl declared at the top of the block
    if (modalOverlayEl) {
        modalOverlayEl.addEventListener('click', function(e) {
            if (e.target === modalOverlayEl) hideWaModal();
        });
    }

    // Copy to clipboard
    const btnCopy = document.getElementById('wa-btn-copy');
    if (btnCopy) {
        btnCopy.addEventListener('click', function() {
            const messageTextarea = document.getElementById('wa-message-text');
            if (messageTextarea) {
                messageTextarea.select();
                navigator.clipboard.writeText(messageTextarea.value).then(function() {
                    const originalText = btnCopy.innerHTML;
                    btnCopy.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
                    setTimeout(function() {
                        btnCopy.innerHTML = originalText;
                    }, 2000);
                }).catch(function(err) {
                    alert('Could not copy: ' + err);
                });
            }
        });
    }

    // Send via WhatsApp
    const btnSend = document.getElementById('wa-btn-send');
    if (btnSend) {
        btnSend.addEventListener('click', function() {
            const phoneInput = document.getElementById('wa-recipient-phone');
            const messageTextarea = document.getElementById('wa-message-text');
            if (phoneInput && messageTextarea) {
                let recipient = phoneInput.value.replace(/\D/g, "");
                if (!recipient) {
                    alert("Please enter a valid phone number.");
                    return;
                }
                if (recipient.length === 10) recipient = '91' + recipient;
                
                const textEncoded = encodeURIComponent(messageTextarea.value);
                const whatsAppLink = `https://wa.me/${recipient}?text=${textEncoded}`;
                window.open(whatsAppLink, '_blank');
                hideWaModal();
            }
        });
    }
});
</script>

<!-- WhatsApp Sharing Modal Overlay -->
<div id="wa-share-modal" class="wa-modal-overlay" style="display: none;">
    <div class="wa-modal-content">
        <div class="wa-modal-header">
            <h3><i class="fa-brands fa-whatsapp"></i> Share Trip Details</h3>
            <button id="wa-modal-close" class="wa-close-btn">&times;</button>
        </div>
        <div class="wa-modal-body">
            <div class="wa-form-group">
                <label class="wa-label">Recipient Phone Number</label>
                <input type="text" id="wa-recipient-phone" class="wa-input" placeholder="e.g. 917200217986" />
            </div>
            
            <div class="wa-form-group">
                <label class="wa-label">Select Template Type</label>
                <div class="wa-template-tabs">
                    <button type="button" class="wa-tab-btn active" data-template="quote">📋 Quote</button>
                    <button type="button" class="wa-tab-btn" data-template="confirm">✅ Confirmed</button>
                    <button type="button" class="wa-tab-btn" data-template="updates">🔄 Updates</button>
                    <button type="button" class="wa-tab-btn" data-template="advance">💸 Advance</button>
                    <button type="button" class="wa-tab-btn" data-template="customer_share">👤 Send Customer</button>
                    <button type="button" class="wa-tab-btn" data-template="group_share">📢 Group Post</button>
                    <button type="button" class="wa-tab-btn" data-template="driver_share">🚘 Driver</button>
                </div>
            </div>
            
            <div class="wa-form-group">
                <label class="wa-label" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.2rem;">
                    <span>Message Preview (Editable)</span>
                    <span id="wa-char-count" style="font-size: 0.72rem; color: var(--fv-text-light); font-weight: 500;">0 chars</span>
                </label>
                <textarea id="wa-message-text" class="wa-textarea" rows="12"></textarea>
            </div>
        </div>
        <div class="wa-modal-footer">
            <button type="button" id="wa-btn-copy" class="wa-secondary-btn"><i class="fa-solid fa-copy"></i> Copy Text</button>
            <button type="button" id="wa-btn-send" class="wa-primary-btn"><i class="fa-brands fa-whatsapp"></i> Send to WhatsApp</button>
        </div>
    </div>
</div>
