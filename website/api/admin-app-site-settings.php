<?php
/**
 * Admin App (React Native) endpoint for the website's optimisation & pricing settings.
 * The values live in api/config.php under the SAME keys the website admin page (admin/pages/settings.php) writes, so a change made
 * here is a change the booking flow really uses:
 *   advance payment   advanceEnabled, advancePercent, advanceMinAmount, upiId
 *   pricing rules     nightSurchargeEnabled/Percent, holidaySurchargeEnabled/Percent, tollEstimatePerKm, minFareOneWay
 *   extra surcharges  luggageSurchargeEnabled/Amount, petSurchargeEnabled/Amount, peakHourSurchargeEnabled/Percent
 *   referral          referralRewardAmount
 *
 * Auth: header `X-Admin-App-Key` must match ADMIN_APP_API_KEY (config/env.php), same as the other admin-app-*.php mirrors.
 *
 * GET  -> { success: true, settings: { advancePaymentPercent, advancePaymentMin, advancePaymentUpi, nightSurchargePercent,
 *           holidaySurchargePercent, tollEstimatePerKm, minFareFloor, luggageSurcharge, petSurcharge, peakHourSurcharge,
 *           referralRewardAmount } }
 * POST { any of the same fields } -> { success: true, message }
 *
 * Safety: only the whitelisted keys above are touched; the previous api/config.php is copied to api/config.php.bak-<time> first (the
 * newest 5 are kept); the new file is written to a temp file, loaded back to prove it is valid PHP returning an array with the
 * expected values, and only then moved into place.
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

// Authenticate first: nothing below runs for a caller without the key.
$providedKey = $_SERVER['HTTP_X_ADMIN_APP_KEY'] ?? '';
if (!defined('ADMIN_APP_API_KEY') || ADMIN_APP_API_KEY === '' || !hash_equals((string) ADMIN_APP_API_KEY, (string) $providedKey)) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Invalid or missing admin app key']);
    exit;
}

$configPath = __DIR__ . '/config.php';
$config = is_file($configPath) ? (include $configPath) : [];
if (!is_array($config)) {
    $config = [];
}

/** app field => [config key, type, min, max (0 = no upper limit), default] */
$FIELDS = [
    'advancePaymentPercent'   => ['advancePercent',           'int',   0, 100,     20],
    'advancePaymentMin'       => ['advanceMinAmount',         'int',   0, 1000000, 300],
    'advancePaymentUpi'       => ['upiId',                    'str',   0, 0,       ''],
    'nightSurchargePercent'   => ['nightSurchargePercent',    'int',   0, 100,     10],
    'holidaySurchargePercent' => ['holidaySurchargePercent',  'int',   0, 100,     0],
    'tollEstimatePerKm'       => ['tollEstimatePerKm',        'float', 0, 100,     2],
    'minFareFloor'            => ['minFareOneWay',            'int',   0, 1000000, 500],
    'luggageSurcharge'        => ['luggageSurchargeAmount',   'int',   0, 1000000, 0],
    'petSurcharge'            => ['petSurchargeAmount',       'int',   0, 1000000, 0],
    'peakHourSurcharge'       => ['peakHourSurchargePercent', 'int',   0, 100,     0],
    'referralRewardAmount'    => ['referralRewardAmount',     'int',   0, 1000000, 100],
];

/** The on/off switch the website admin keeps next to a value: on when the value is above 0. */
$ENABLE_FLAGS = [
    'advancePercent'           => 'advanceEnabled',
    'nightSurchargePercent'    => 'nightSurchargeEnabled',
    'holidaySurchargePercent'  => 'holidaySurchargeEnabled',
    'luggageSurchargeAmount'   => 'luggageSurchargeEnabled',
    'petSurchargeAmount'       => 'petSurchargeEnabled',
    'peakHourSurchargePercent' => 'peakHourSurchargeEnabled',
];

function dc_site_value($raw, $type, $min, $max)
{
    if ($type === 'str') {
        return trim((string) $raw);
    }
    $n = ($type === 'float') ? (float) $raw : (int) $raw;
    if ($n < $min) {
        $n = $min;
    }
    if ($max > 0 && $n > $max) {
        $n = $max;
    }
    return $n;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $settings = [];
    foreach ($FIELDS as $appKey => $def) {
        $cfgKey = $def[0];
        $val = array_key_exists($cfgKey, $config) ? $config[$cfgKey] : $def[4];
        $settings[$appKey] = dc_site_value($val, $def[1], $def[2], $def[3]);
    }
    echo json_encode(['success' => true, 'settings' => $settings]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

$input = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($input)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Send a JSON object']);
    exit;
}

$newConfig = $config;
$changed = [];
foreach ($FIELDS as $appKey => $def) {
    if (!array_key_exists($appKey, $input)) {
        continue;
    }
    $cfgKey = $def[0];
    $newConfig[$cfgKey] = dc_site_value($input[$appKey], $def[1], $def[2], $def[3]);
    $changed[] = $cfgKey;
    if (isset($ENABLE_FLAGS[$cfgKey])) {
        $newConfig[$ENABLE_FLAGS[$cfgKey]] = ($newConfig[$cfgKey] > 0);
    }
}
if (count($changed) === 0) {
    echo json_encode(['success' => true, 'message' => 'Nothing to change']);
    exit;
}

// 1. keep the previous file (newest 5 backups)
if (is_file($configPath)) {
    @copy($configPath, $configPath . '.bak-' . date('Ymd-His'));
    $backups = glob($configPath . '.bak-*');
    if (!is_array($backups)) {
        $backups = [];
    }
    sort($backups);
    while (count($backups) > 5) {
        @unlink(array_shift($backups));
    }
}

// 2. write to a temp file and prove it loads before it replaces the live file
$tmp = $configPath . '.tmp';
$content = "<?php\nreturn " . var_export($newConfig, true) . ";\n";
if (file_put_contents($tmp, $content) === false) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Could not write the website config (file permissions)']);
    exit;
}
try {
    $check = include $tmp;
} catch (Throwable $e) {
    $check = null;
}
$valid = is_array($check);
if ($valid) {
    foreach ($changed as $k) {
        if (!array_key_exists($k, $check) || $check[$k] !== $newConfig[$k]) {
            $valid = false;
        }
    }
}
if (!$valid) {
    @unlink($tmp);
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'The new config did not load back correctly, so nothing was changed']);
    exit;
}
if (!@rename($tmp, $configPath)) {
    // some hosts refuse a rename over an existing file: copy instead
    $ok = @copy($tmp, $configPath);
    @unlink($tmp);
    if (!$ok) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Could not replace the website config']);
        exit;
    }
}
if (function_exists('opcache_invalidate')) {
    @opcache_invalidate($configPath, true);
}

// 3. mirror to the places the website admin page also keeps in step (best effort: the live file above is already correct)
try {
    $fn = __DIR__ . '/../admin/includes/functions.php';
    $dbFile = __DIR__ . '/../admin/config/database.php';
    if (is_file($dbFile)) {
        require_once $dbFile;
    }
    if (is_file($fn)) {
        require_once $fn;
    }
    $pdo = isset($GLOBALS['db']) ? $GLOBALS['db'] : (isset($GLOBALS['pdo']) ? $GLOBALS['pdo'] : null);
    if ($pdo && function_exists('dropcars_save_site_config_json')) {
        dropcars_save_site_config_json($pdo, 'dropcars', $newConfig);
    }
    if (function_exists('sync_settings_to_public_config')) {
        sync_settings_to_public_config();
    }
} catch (Throwable $e) {
    // the settings are saved; only the mirror failed
}

echo json_encode(['success' => true, 'message' => 'Website settings saved', 'changed' => $changed]);
