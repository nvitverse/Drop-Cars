<?php
/**
 * Admin App (React Native) endpoint for website optimization & pricing settings.
 * Mirrors settings from admin/pages/settings.php.
 *
 * Auth: header `X-Admin-App-Key` must match ADMIN_APP_API_KEY (config/env.php).
 *
 * GET  -> { success: true, settings: { ... } }
 * POST -> { success: true, message: 'Settings updated' }
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
require_once __DIR__ . '/../admin/config/database.php'; // $pdo

$pdo = $GLOBALS['db'] ?? null;
if (!$pdo) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database unavailable']);
    exit;
}

$providedKey = $_SERVER['HTTP_X_ADMIN_APP_KEY'] ?? '';
if (!defined('ADMIN_APP_API_KEY') || ADMIN_APP_API_KEY === '' || !hash_equals((string) ADMIN_APP_API_KEY, (string) $providedKey)) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Invalid or missing admin app key']);
    exit;
}

$configPath = __DIR__ . '/config.php';
$config = is_file($configPath) ? (include $configPath) : [];

if (!function_exists('dropcars_save_config_file_or_db')) {
    function dropcars_save_config_file_or_db($pdo, $configPath, $newConfig) {
        $content = "<?php\nreturn " . var_export($newConfig, true) . ";\n";
        return file_put_contents($configPath, $content) !== false;
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $settings = [
        'advancePaymentPercent' => (int) ($config['advancePaymentPercent'] ?? 20),
        'advancePaymentMin' => (int) ($config['advancePaymentMin'] ?? 500),
        'advancePaymentUpi' => (string) ($config['advancePaymentUpi'] ?? ''),
        'nightSurchargePercent' => (int) ($config['nightSurchargePercent'] ?? 0),
        'holidaySurchargePercent' => (int) ($config['holidaySurchargePercent'] ?? 0),
        'tollEstimatePerKm' => (float) ($config['tollEstimatePerKm'] ?? 1.5),
        'minFareFloor' => (int) ($config['minFareFloor'] ?? 500),
        'luggageSurcharge' => (int) ($config['luggageSurcharge'] ?? 0),
        'petSurcharge' => (int) ($config['petSurcharge'] ?? 0),
        'peakHourSurcharge' => (int) ($config['peakHourSurcharge'] ?? 0),
        'referralRewardAmount' => (int) ($config['referralRewardAmount'] ?? 100),
        'festivalEnabled' => !empty($config['festivalEnabled']),
        'festivalName' => (string) ($config['festivalName'] ?? ''),
        'festivalDiscountPct' => (int) ($config['festivalDiscountPct'] ?? 0),
    ];

    echo json_encode([
        'success' => true,
        'settings' => $settings,
    ]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw = file_get_contents('php://input');
    $input = json_decode($raw, true) ?: [];

    // Whitelist & clamp
    if (isset($input['advancePaymentPercent'])) {
        $config['advancePaymentPercent'] = max(0, min(100, (int) $input['advancePaymentPercent']));
    }
    if (isset($input['advancePaymentMin'])) {
        $config['advancePaymentMin'] = max(0, (int) $input['advancePaymentMin']);
    }
    if (isset($input['advancePaymentUpi'])) {
        $config['advancePaymentUpi'] = trim((string) $input['advancePaymentUpi']);
    }
    if (isset($input['nightSurchargePercent'])) {
        $config['nightSurchargePercent'] = max(0, min(100, (int) $input['nightSurchargePercent']));
    }
    if (isset($input['holidaySurchargePercent'])) {
        $config['holidaySurchargePercent'] = max(0, min(100, (int) $input['holidaySurchargePercent']));
    }
    if (isset($input['tollEstimatePerKm'])) {
        $config['tollEstimatePerKm'] = max(0, (float) $input['tollEstimatePerKm']);
    }
    if (isset($input['minFareFloor'])) {
        $config['minFareFloor'] = max(0, (int) $input['minFareFloor']);
    }
    if (isset($input['luggageSurcharge'])) {
        $config['luggageSurcharge'] = max(0, (int) $input['luggageSurcharge']);
    }
    if (isset($input['petSurcharge'])) {
        $config['petSurcharge'] = max(0, (int) $input['petSurcharge']);
    }
    if (isset($input['peakHourSurcharge'])) {
        $config['peakHourSurcharge'] = max(0, (int) $input['peakHourSurcharge']);
    }
    if (isset($input['referralRewardAmount'])) {
        $config['referralRewardAmount'] = max(0, (int) $input['referralRewardAmount']);
    }

    $ok = dropcars_save_config_file_or_db($pdo, $configPath, $config);

    if ($ok) {
        if (function_exists('opcache_reset')) {
            @opcache_reset();
        }
        echo json_encode(['success' => true, 'message' => 'Website settings saved successfully']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to write website config']);
    }
    exit;
}
