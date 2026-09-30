<?php
/**
 * Admin App (React Native) mirror of the CORE of the website's Tariffs
 * admin page (admin/pages/tariffs.php) - per-vehicle-type, per-trip-type
 * per-km rate and driver bata. Reuses the exact same storage functions
 * (get_json_tariffs/save_json_tariffs/sync_tariffs_to_config in
 * admin/includes/functions.php) so a change made here takes effect for
 * real bookings exactly the same way a change made on the website does.
 *
 * Deliberately does NOT expose the dynamic/promo-pricing layer (date-range
 * scheduling, strikethrough old-price display, reasoning notes) - that
 * stays website-only for now. Editing an existing DYNAMIC tariff row's core
 * fields through here preserves its promo scheduling fields as-is rather
 * than blanking them out.
 *
 * Auth: header `X-Admin-App-Key` must match ADMIN_APP_API_KEY
 * (config/env.php).
 *
 * GET  -> { success, tariffs: [...] }  (is_dynamic rows excluded)
 * POST { action: 'add_or_update' | 'delete', ...params }
 *      -> { success, message }
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Admin-App-Key');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../config/env.php';
require_once __DIR__ . '/../admin/config/database.php'; // $pdo / $GLOBALS['db']
require_once __DIR__ . '/../admin/includes/functions.php'; // get_json_tariffs/save_json_tariffs/sync_tariffs_to_config

$providedKey = $_SERVER['HTTP_X_ADMIN_APP_KEY'] ?? '';
if (!defined('ADMIN_APP_API_KEY') || ADMIN_APP_API_KEY === '' || !hash_equals((string) ADMIN_APP_API_KEY, (string) $providedKey)) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Invalid or missing admin app key']);
    exit;
}

function admin_app_tariff_row_out(array $t): array
{
    return [
        'id' => (int) $t['id'],
        'vehicle_type' => $t['vehicle_type'] ?? '',
        'per_km_rate' => (float) ($t['per_km_rate'] ?? 0),
        'driver_beta' => (float) ($t['driver_beta'] ?? 0),
        'trip_type' => $t['trip_type'] ?? 'oneway',
        'passengers' => (int) ($t['passengers'] ?? 0),
        'luggage' => (int) ($t['luggage'] ?? 0),
        'is_ac' => !empty($t['is_ac']),
        'vehicle_model' => $t['vehicle_model'] ?? '',
    ];
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $reqType = $_GET['type'] ?? '';
    if ($reqType === 'airporttaxi') {
        try {
            $airportTariffPath = dirname(__DIR__) . '/data/airporttaxi-tariffs.json';
            $airportTariffs = is_file($airportTariffPath) ? (json_decode(file_get_contents($airportTariffPath), true) ?: []) : [];
            echo json_encode([
                'success' => true,
                'airporttaxi_tariffs' => $airportTariffs,
            ]);
        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Failed to load airport taxi tariffs: ' . $e->getMessage()]);
        }
        exit;
    }

    try {
        $all = get_json_tariffs();
        $core = array_values(array_filter($all, static function ($t) {
            return empty($t['is_dynamic']);
        }));
        echo json_encode([
            'success' => true,
            'tariffs' => array_map('admin_app_tariff_row_out', $core),
        ]);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to load tariffs: ' . $e->getMessage()]);
    }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $action = trim((string) ($input['action'] ?? ''));

    if ($action === 'save_airporttaxi_tariffs') {
        try {
            $airportTariffPath = dirname(__DIR__) . '/data/airporttaxi-tariffs.json';
            $data = $input['airporttaxi_tariffs'] ?? [];
            if (!empty($data)) {
                $data['updatedAt'] = date('Y-m-d');
                file_put_contents($airportTariffPath, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
                echo json_encode(['success' => true, 'message' => 'AirportTaxi tariffs saved.']);
            } else {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'No tariff data provided']);
            }
        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Failed to save airport taxi tariffs: ' . $e->getMessage()]);
        }
        exit;
    }

    try {
        $tariffs = get_json_tariffs();

        if ($action === 'add_or_update') {
            $id = !empty($input['id']) ? (int) $input['id'] : null;
            $vehicleType = strtoupper(trim((string) ($input['vehicle_type'] ?? '')));
            $perKmRate = (float) ($input['per_km_rate'] ?? 0);
            $driverBeta = (float) ($input['driver_beta'] ?? 0);
            $tripType = strtolower(trim((string) ($input['trip_type'] ?? 'oneway')));
            $passengers = (int) ($input['passengers'] ?? 0);
            $luggage = (int) ($input['luggage'] ?? 0);
            $isAc = !empty($input['is_ac']) ? 1 : 0;
            $vehicleModel = trim((string) ($input['vehicle_model'] ?? ''));

            if (!$vehicleType || $perKmRate <= 0) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Vehicle type and a per-KM rate greater than 0 are required']);
                exit;
            }

            if ($id) {
                // Editing an existing row - only touch the core fields the
                // app exposes, leave any dynamic/promo scheduling fields
                // on this row exactly as they were.
                $found = false;
                foreach ($tariffs as &$t) {
                    if ((int) $t['id'] === $id) {
                        $t['vehicle_type'] = $vehicleType;
                        $t['per_km_rate'] = $perKmRate;
                        $t['driver_beta'] = $driverBeta;
                        $t['trip_type'] = $tripType;
                        $t['passengers'] = $passengers;
                        $t['luggage'] = $luggage;
                        $t['is_ac'] = $isAc;
                        $t['vehicle_model'] = $vehicleModel;
                        $found = true;
                        break;
                    }
                }
                unset($t);
                if (!$found) {
                    http_response_code(404);
                    echo json_encode(['success' => false, 'message' => 'Tariff not found']);
                    exit;
                }
                $msg = 'Tariff updated.';
            } else {
                // New core (non-dynamic) tariff - match the website page's
                // own "update if (vehicle_type, trip_type, non-dynamic)
                // already exists, else insert" behaviour.
                $existingIndex = null;
                foreach ($tariffs as $idx => $t) {
                    if (strtoupper($t['vehicle_type']) === $vehicleType && strtolower($t['trip_type']) === $tripType && empty($t['is_dynamic'])) {
                        $existingIndex = $idx;
                        break;
                    }
                }
                if ($existingIndex !== null) {
                    $tariffs[$existingIndex]['per_km_rate'] = $perKmRate;
                    $tariffs[$existingIndex]['driver_beta'] = $driverBeta;
                    $tariffs[$existingIndex]['passengers'] = $passengers;
                    $tariffs[$existingIndex]['luggage'] = $luggage;
                    $tariffs[$existingIndex]['is_ac'] = $isAc;
                    $tariffs[$existingIndex]['vehicle_model'] = $vehicleModel;
                    $msg = 'Existing tariff for this vehicle/trip type updated.';
                } else {
                    $maxId = 0;
                    foreach ($tariffs as $t) {
                        if ((int) $t['id'] > $maxId) {
                            $maxId = (int) $t['id'];
                        }
                    }
                    $tariffs[] = [
                        'id' => $maxId + 1,
                        'vehicle_type' => $vehicleType,
                        'per_km_rate' => $perKmRate,
                        'driver_beta' => $driverBeta,
                        'trip_type' => $tripType,
                        'passengers' => $passengers,
                        'luggage' => $luggage,
                        'is_ac' => $isAc,
                        'vehicle_model' => $vehicleModel,
                        'old_per_km_rate' => 0.0,
                        'old_driver_beta' => 0.0,
                        'effective_from' => null,
                        'effective_until' => null,
                        'is_dynamic' => 0,
                        'reasoning_note' => '',
                        'strike_on' => 0,
                        'display_order' => 100,
                    ];
                    $msg = 'New tariff created.';
                }
            }

            save_json_tariffs($tariffs);
            sync_tariffs_to_config();
            echo json_encode(['success' => true, 'message' => $msg]);
        } elseif ($action === 'delete') {
            $id = (int) ($input['id'] ?? 0);
            if ($id <= 0) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Missing id']);
                exit;
            }
            $filtered = array_values(array_filter($tariffs, static function ($t) use ($id) {
                return (int) $t['id'] !== $id;
            }));
            save_json_tariffs($filtered);
            sync_tariffs_to_config();
            echo json_encode(['success' => true, 'message' => 'Tariff removed.']);
        } else {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Unknown action']);
        }
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Action failed: ' . $e->getMessage()]);
    }
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Method not allowed']);
