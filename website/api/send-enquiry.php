<?php
// display_errors is OFF - this is a public write endpoint; a PHP error
// before the output buffer is cleared would otherwise leak file paths/
// stack traces straight into the HTTP response. Errors are still captured
// via log_errors for debugging - check the PHP error log, not the response.
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);
date_default_timezone_set('Asia/Kolkata');
/**
 * Drop Cars – Enquiry notification (Email + Telegram)
 * Receives JSON payload from booking form, sends to configured recipients.
 *
 * Setup:
 * 1. Copy api/config.example.php to api/config.php
 * 2. Add Gmail App Password (https://myaccount.google.com/apppasswords)
 * 3. Optionally add Telegram bot token and chat IDs
 * 4. Install PHPMailer: composer require phpmailer/phpmailer (or manual)
 */

header('Content-Type: application/json; charset=utf-8');
// CORS: Allow all origins for hassle-free API access from booking forms
$__origin = $_SERVER['HTTP_ORIGIN'] ?? '';
header('Access-Control-Allow-Origin: ' . ($__origin !== '' ? $__origin : '*'));
header('Access-Control-Allow-Credentials: true');
header('Vary: Origin');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-DROPCARS-TOKEN');

ob_start();

// Safety net: guarantee this endpoint never returns broken/non-JSON output to
// the frontend fetch() call, even on an uncaught exception or PHP fatal error
// deep inside the enquiry logic below.
if (!function_exists('dropcars_send_enquiry_fatal_json')) {
    function dropcars_send_enquiry_fatal_json($message = 'An unexpected error occurred. Please try again.') {
        if (ob_get_length()) { @ob_end_clean(); }
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode(['success' => false, 'message' => $message]);
    }
}
set_exception_handler(function ($e) {
    error_log('Drop Cars send-enquiry uncaught exception: ' . $e->getMessage());
    dropcars_send_enquiry_fatal_json();
    exit;
});
register_shutdown_function(function () {
    $err = error_get_last();
    if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        error_log('Drop Cars send-enquiry fatal error: ' . $err['message']);
        dropcars_send_enquiry_fatal_json();
    }
});

require_once __DIR__ . '/../config/security.php';
dropcars_rate_limit('api_enquiry', 20, 60);
dropcars_block_if_scraper();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
    exit;
}

$blockedCheckPath = __DIR__ . '/../admin/includes/check-blocked.php';
if (is_file($blockedCheckPath)) {
    require_once $blockedCheckPath;
    if (function_exists('dropcars_check_blocked_ip')) {
        dropcars_check_blocked_ip();
    }
}

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid or empty JSON.']);
    exit;
}

$configPath = __DIR__ . '/config.php';
if (!is_file($configPath)) {
    $configPath = __DIR__ . '/config.example.php';
}
$config = is_file($configPath) ? (include $configPath) : [];
$isExampleConfig = basename($configPath) === 'config.example.php';
require_once __DIR__ . '/../config/env.php';
require_once __DIR__ . '/smtp-settings.php';
require_once __DIR__ . '/../includes/google-sheet-sync.php';

$smtp = dropcars_resolve_smtp($config, $isExampleConfig, 'leads');
$mailFrom = $smtp['mailFrom'];
$mailTo = $smtp['mailTo'];
$mailFromName = $smtp['mailFromName'];
$appPassword = $smtp['appPassword'];

// Subdomain Overrides Lookup
$subdomainSlug = '';
$pageUrlRaw = trim((string) ($data['pageUrl'] ?? ''));
if ($pageUrlRaw !== '') {
    $parsed = parse_url($pageUrlRaw);
    $host = $parsed['host'] ?? '';
    $parts = explode('.', $host);
    if (count($parts) >= 2) {
        $firstPart = strtolower($parts[0]);
        if (!in_array($firstPart, ['www', 'localhost', 'admin', 'api', 'dev', 'staging', 'mail', 'dropcars', 'drpcars'], true)) {
            $subdomainSlug = $firstPart;
        }
    }
}
if ($subdomainSlug !== '' && isset($config['subdomainConfig'][$subdomainSlug])) {
    $subConfig = $config['subdomainConfig'][$subdomainSlug];
    if (!empty($subConfig['enabled'])) {
        if (!empty($subConfig['mailTo'])) {
            $mailTo = trim($subConfig['mailTo']);
            $smtp['mailTo'] = $mailTo;
        }
        if (!empty($subConfig['displayName'])) {
            $mailFromName = trim($subConfig['displayName']);
            $smtp['mailFromName'] = $mailFromName;
        }
    }
}

if (!defined('DROP_CARS_DB_OPTIONAL')) {
    define('DROP_CARS_DB_OPTIONAL', true);
}
require_once __DIR__ . '/../config/env.php';
require_once __DIR__ . '/../admin/config/database.php';
if (function_exists('dropcars_get_db')) {
    $pdo = dropcars_get_db();
} elseif ((!isset($pdo) || !$pdo instanceof PDO) && !empty($GLOBALS['db']) && $GLOBALS['db'] instanceof PDO) {
    $pdo = $GLOBALS['db'];
}

require_once __DIR__ . '/../admin/includes/enquiries-schema.php';
if (isset($pdo) && $pdo instanceof PDO) {
    dropcars_ensure_enquiries_columns($pdo);
}
$incomingBid = preg_replace('/[^A-Za-z0-9]/', '', (string)($data['bookingId'] ?? $data['booking_id'] ?? ''));
$isRepeatSubmission = false;

// For website enquiries, always generate a fresh daily sequential ID (E26100201, E26100202...)
// Only treat as repeat if explicit admin update flag or verified session token is provided.
$bookingId = dropcars_next_enquiry_booking_id(isset($pdo) && $pdo instanceof PDO ? $pdo : null, 'E');
$idBeforeDb = $bookingId;
$customerName = htmlspecialchars($data['customerName'] ?? 'N/A');
$contactValue = htmlspecialchars($data['contactValue'] ?? $data['contactPhone'] ?? $data['contactEmail'] ?? 'N/A');
$whatsappValue = htmlspecialchars($data['whatsappPhone'] ?? '');

if (function_exists('dropcars_check_blocked_phone')) {
    dropcars_check_blocked_phone($contactValue);
    if ($whatsappValue !== '') {
        dropcars_check_blocked_phone($whatsappValue);
    }
}

if (function_exists('dropcars_is_fake_phone')) {
    if (dropcars_is_fake_phone($contactValue)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Please enter a valid mobile number. Fake or sequence numbers are not allowed.']);
        exit;
    }
}

$formattedContact = $contactValue;
$cleanPhoneForFormat = preg_replace('/[^\d]/', '', $contactValue);
if (strlen($cleanPhoneForFormat) === 10) {
    $formattedContact = '+91 ' . substr($cleanPhoneForFormat, 0, 5) . ' ' . substr($cleanPhoneForFormat, 5);
} elseif (strlen($cleanPhoneForFormat) === 12 && substr($cleanPhoneForFormat, 0, 2) === '91') {
    $formattedContact = '+91 ' . substr($cleanPhoneForFormat, 2, 5) . ' ' . substr($cleanPhoneForFormat, 7);
}

$formattedWhatsapp = $whatsappValue;
if ($whatsappValue !== '') {
    $cleanWhatsappForFormat = preg_replace('/[^\d]/', '', $whatsappValue);
    if (strlen($cleanWhatsappForFormat) === 10) {
        $formattedWhatsapp = '+91 ' . substr($cleanWhatsappForFormat, 0, 5) . ' ' . substr($cleanWhatsappForFormat, 5);
    } elseif (strlen($cleanWhatsappForFormat) === 12 && substr($cleanWhatsappForFormat, 0, 2) === '91') {
        $formattedWhatsapp = '+91 ' . substr($cleanWhatsappForFormat, 2, 5) . ' ' . substr($cleanWhatsappForFormat, 7);
    }
}
$pickup = htmlspecialchars($data['pickup'] ?? 'N/A');
$pickupLat = isset($data['pickupLat']) ? (float) $data['pickupLat'] : null;
$pickupLng = isset($data['pickupLng']) ? (float) $data['pickupLng'] : null;
$pickupMapsUrl = ($pickupLat !== null && $pickupLng !== null && $pickupLat >= -90 && $pickupLat <= 90 && $pickupLng >= -180 && $pickupLng <= 180)
    ? 'https://www.google.com/maps/search/?api=1&query=' . $pickupLat . ',' . $pickupLng
    : null;
$pickupHtml = $pickupMapsUrl
    ? '<a href="' . htmlspecialchars($pickupMapsUrl) . '" target="_blank" style="color:#0b4a8f;font-weight:600;text-decoration:underline;">' . $pickup . ' 📍</a>'
    : $pickup;
$dropSource = $data['drop'] ?? '';
if (!$dropSource && !empty($data['hourlyPickup'])) {
    $dropSource = 'Hourly Rental';
}
$drop = htmlspecialchars($dropSource ?: 'N/A');
$dropLat = isset($data['dropLat']) ? (float) $data['dropLat'] : null;
$dropLng = isset($data['dropLng']) ? (float) $data['dropLng'] : null;

$mapOrigin = ($pickupLat !== null && $pickupLng !== null && $pickupLat >= -90 && $pickupLat <= 90 && $pickupLng >= -180 && $pickupLng <= 180)
    ? ($pickupLat . ',' . $pickupLng)
    : strip_tags($pickup);
$mapDest = ($dropLat !== null && $dropLng !== null && $dropLat >= -90 && $dropLat <= 90 && $dropLng >= -180 && $dropLng <= 180)
    ? ($dropLat . ',' . $dropLng)
    : strip_tags($drop);

$viewMapUrl = 'https://www.google.com/maps/dir/?api=1&origin=' . rawurlencode($mapOrigin) . '&destination=' . rawurlencode($mapDest);
$stopsList = $data['stops'] ?? [];
if (!empty($stopsList) && is_array($stopsList)) {
    $cleanStops = array_filter(array_map('strip_tags', $stopsList));
    if (!empty($cleanStops)) {
        $viewMapUrl .= '&waypoints=' . rawurlencode(implode('|', $cleanStops));
    }
}
$tripType = $data['serviceType'] ?? 'one_way';
$vehicleType = $data['vehicleType'] ?? 'Sedan'; // Preferred from passenger count
$fareEstimate = (int) ($data['fareEstimate'] ?? 0);
$distance = (int) ($data['distanceHint'] ?? $data['distance'] ?? 0);

// Curated route distance guard: if standard highway distance exists and client sent an excessive detour (> 20%)
require_once __DIR__ . '/../engine/seo-core.php';
$seoCore = new SEOCore();
$normPickup = $seoCore->normalizeCitySlug(preg_replace('/[^a-zA-Z0-9\s-]/', '', strtolower($dropSource ? $pickupSource : $pickup)));
$normDrop   = $seoCore->normalizeCitySlug(preg_replace('/[^a-zA-Z0-9\s-]/', '', strtolower($dropSource ?: $drop)));
$rInfo = $seoCore->getRouteInfo($normPickup, $normDrop);
if ($rInfo && !empty($rInfo['distanceKm'])) {
    $stdDistance = (int)$rInfo['distanceKm'];
    if ($stdDistance > 0 && $distance > $stdDistance * 1.2 && $tripType === 'one_way') {
        $distance = $stdDistance;
    }
}

$selectedVehicle = strtoupper((string)($data['selectedVehicle'] ?? ''));
$vehicleMeta = [
    'SEDAN' => ['name' => 'Sedan (Dzire/Aura or Equivalent)', 'capacity' => '4 seats', 'ac' => 'A/C'],
    'SUV' => ['name' => 'SUV (Ertiga or Equivalent)', 'capacity' => '6 seats', 'ac' => 'A/C'],
    'INNOVA' => ['name' => 'Innova', 'capacity' => '6/7 seats', 'ac' => 'A/C'],
    'CRYSTA' => ['name' => 'Innova Crysta', 'capacity' => '6/7 seats', 'ac' => 'A/C'],
];
$rawVehicleEstimates = isset($data['vehicleEstimates']) && is_array($data['vehicleEstimates']) ? $data['vehicleEstimates'] : [];
$travelDate = $data['travelDate'] ?? '';
$travelTime = $data['travelTime'] ?? '';
$stops = $data['stops'] ?? [];
$fareTypeRaw = (string) ($data['fareType'] ?? 'base');

require_once __DIR__ . '/../includes/page-name-resolver.php';

$pageTitleRaw  = trim((string) ($data['pageTitle'] ?? ''));
$sourcePageRaw = trim((string) ($data['sourcePage'] ?? $data['source_page'] ?? ''));
$pageUrlRaw    = trim((string) ($data['pageUrl'] ?? ''));

$urlQuery = [];
if ($pageUrlRaw !== '') {
    $parsedQueryStr = parse_url($pageUrlRaw, PHP_URL_QUERY);
    if ($parsedQueryStr) {
        parse_str($parsedQueryStr, $urlQuery);
    }
}

$rawSource     = $data['source'] ?? '';
$gclid         = trim((string) ($data['gclid'] ?? $urlQuery['gclid'] ?? ''));
$gadCampaignId = trim((string) ($data['gadCampaignId'] ?? $urlQuery['gad_campaignid'] ?? ''));
$gadSource     = trim((string) ($urlQuery['gad_source'] ?? ''));
$gbraid        = trim((string) ($data['gbraid'] ?? $urlQuery['gbraid'] ?? ''));
$wbraid        = trim((string) ($data['wbraid'] ?? $urlQuery['wbraid'] ?? ''));
$utmSource     = trim((string) ($data['utmSource'] ?? $data['utm_source'] ?? $urlQuery['utm_source'] ?? ''));
$utmMedium     = trim((string) ($data['utmMedium'] ?? $data['utm_medium'] ?? $urlQuery['utm_medium'] ?? ''));
$rawCampaign = trim((string) (
    $data['campaignname'] ?? $urlQuery['campaignname'] ??
    $data['_campaignname'] ?? $urlQuery['_campaignname'] ??
    $data['campaign'] ?? $urlQuery['campaign'] ??
    $data['_campaign'] ?? $urlQuery['_campaign'] ??
    $data['utmCampaign'] ?? $data['utm_campaign'] ?? $urlQuery['utm_campaign'] ?? ''
));
if ($rawCampaign === '' || strtolower($rawCampaign) === 'none' || $rawCampaign === '{_campaign}' || $rawCampaign === '{_campaignname}') {
    $rawCampaign = $gadCampaignId ?: trim((string) ($urlQuery['campaignid'] ?? ''));
}
$utmCampaign = $rawCampaign;

$rawContent = trim((string) (
    $data['adgroupname'] ?? $urlQuery['adgroupname'] ??
    $data['_adgroupname'] ?? $urlQuery['_adgroupname'] ??
    $data['adgroup'] ?? $urlQuery['adgroup'] ??
    $data['_adgroup'] ?? $urlQuery['_adgroup'] ??
    $data['utmContent'] ?? $data['utm_content'] ?? $urlQuery['utm_content'] ?? ''
));
if ($rawContent === '' || strtolower($rawContent) === 'none' || $rawContent === '{_adgroup}' || $rawContent === '{_adgroupname}') {
    $rawContent = trim((string) ($urlQuery['adgroupid'] ?? ''));
}
$utmContent = $rawContent;

$utmTerm       = trim((string) ($data['utmTerm'] ?? $data['utm_term'] ?? $urlQuery['utm_term'] ?? $urlQuery['keyword'] ?? ''));
if (strtolower($utmTerm) === 'none') $utmTerm = '';
$matchtypeRaw  = strtolower(trim((string) ($data['matchtype'] ?? $urlQuery['matchtype'] ?? '')));
$deviceRaw     = strtolower(trim((string) ($data['device'] ?? $urlQuery['device'] ?? '')));

if ($matchtypeRaw === 'e') {
    $matchtypeLabel = 'Exact Match';
} elseif ($matchtypeRaw === 'p') {
    $matchtypeLabel = 'Phrase Match';
} elseif ($matchtypeRaw === 'b') {
    $matchtypeLabel = 'Broad Match';
} else {
    $matchtypeLabel = $matchtypeRaw !== '' ? ucfirst($matchtypeRaw) : '';
}

if ($deviceRaw === 'm' || $deviceRaw === 'mobile') {
    $deviceLabel = '📱 Mobile (Phone)';
    $deviceDb = 'mobile';
} elseif ($deviceRaw === 'c' || $deviceRaw === 'desktop') {
    $deviceLabel = '💻 Desktop (Computer)';
    $deviceDb = 'desktop';
} elseif ($deviceRaw === 't' || $deviceRaw === 'tablet') {
    $deviceLabel = '📱 Tablet';
    $deviceDb = 'tablet';
} else {
    $deviceLabel = '💻 Desktop (Computer)';
    $deviceDb = 'desktop';
}

$hasGadsClick = ($gclid !== '' || $gadCampaignId !== '' || $gadSource !== '' || $gbraid !== '' || $wbraid !== '');
$normalizedSource = dropcars_normalize_source($rawSource, $hasGadsClick ? '1' : '', $utmSource, $utmMedium);
$data['source']   = $normalizedSource;

$pageMeta        = dropcars_resolve_page_name($sourcePageRaw, $pageUrlRaw, $tripType, $pageTitleRaw);
$pageDisplayName = $pageMeta['name'];
$sourcePage      = $pageMeta['path'];
$isAirportFlag   = $pageMeta['isAirport'];

$airportSubtype = (string) ($data['airportSubtype'] ?? '');
$isHourlyCheck = (strpos($tripType, 'hourly') !== false);
$isAirportLocalCheck = ($tripType === 'airport_transfer' && $airportSubtype === 'local');

$extraKmRateStr = '?';
$tariffsPath = __DIR__ . '/../data/tariffs.json';
if (file_exists($tariffsPath)) {
    $tariffs = json_decode(file_get_contents($tariffsPath), true);
    if (is_array($tariffs)) {
        foreach ($tariffs as $t) {
            if (strtoupper($t['vehicle_type']) === strtoupper($selectedVehicle) &&
                (((strpos($tripType, 'round') !== false || $isAirportLocalCheck) && $t['trip_type'] === 'round') ||
                 ((strpos($tripType, 'round') === false && !$isAirportLocalCheck) && $t['trip_type'] === 'oneway'))) {
                $extraKmRateStr = '₹' . $t['per_km_rate'];
                break;
            }
        }
    }
}
$isRoundTripCheck = (strpos($tripType, 'round') !== false || $isHourlyCheck || $isAirportLocalCheck);
$garageText = $isRoundTripCheck ? ' - calculated garage-to-garage/until return to pickup point' : '';

// Hourly Rental & airport "Local" drop use the hourly/per-km tariff for
// waiting & extra time/km, not the flat outstation ₹150/stop/hour fee -
// mirrors assets/js/booking-form.js's renderDrawerContent() exclusions list.
$waitingChargeText = "Waiting or additional stop charges (₹150 per stop/hour), if availed";
$dcFaresConfig = null;
$dcConfigJsonPath = __DIR__ . '/../data/config.json';
if (file_exists($dcConfigJsonPath)) {
    $dcConfigJson = json_decode(file_get_contents($dcConfigJsonPath), true);
    $dcFaresConfig = $dcConfigJson['fares'] ?? null;
}
if ($isHourlyCheck && $dcFaresConfig) {
    $hourlyRate = (int) ($dcFaresConfig['hourlyRates'][$selectedVehicle] ?? 0);
    if ($hourlyRate > 0) {
        $waitingChargeText = "Extra hour beyond package at ₹{$hourlyRate}/hr, Extra km beyond package at ₹" . round($hourlyRate / 10) . "/km (as per hourly tariff)";
    }
} elseif ($isAirportLocalCheck && $dcFaresConfig) {
    $localRate = (int) ($dcFaresConfig['baseFareRoundTrip'][$selectedVehicle] ?? 0);
    if ($localRate > 0) {
        $waitingChargeText = "Waiting charges beyond 15 mins at ₹" . round($localRate * 10) . "/hour (10× per-km rate, excl. GST), if availed";
    }
}

$isInclusive = ($fareTypeRaw === 'inclusive');
$includeTolls = isset($data['includeTolls'])
    ? (bool)$data['includeTolls']
    : (isset($data['fareBreakdown']['includeTolls'])
        ? (bool)$data['fareBreakdown']['includeTolls']
        : $isInclusive);

$includeTaxes = isset($data['includeTaxes'])
    ? (bool)$data['includeTaxes']
    : (isset($data['fareBreakdown']['includeTaxes'])
        ? (bool)$data['fareBreakdown']['includeTaxes']
        : $isInclusive);

$fareBreakdown = [];
if (isset($data['fareBreakdown']) && is_array($data['fareBreakdown'])) {
    $fareBreakdown = $data['fareBreakdown'];
    $fareBreakdown['fareType'] = $fareTypeRaw;
}
if (!empty($stops) && is_array($stops)) {
    $fareBreakdown['stops'] = $stops;
}
require_once __DIR__ . '/fare-breakdown-format.php';
$fareBreakdown['pickup'] = $pickup;
$fareBreakdown['drop'] = $drop;
if (empty($fareBreakdown['borderTransitions'])) {
    $fareBreakdown['borderTransitions'] = dropcars_detect_border_transitions((string)$pickup, (string)$drop, is_array($stops) ? $stops : []);
}

$borderList = !empty($fareBreakdown['borderTransitions']) && is_array($fareBreakdown['borderTransitions']) ? $fareBreakdown['borderTransitions'] : [];
$borderCount = count($borderList);
$selVehUpper = strtoupper($selectedVehicle ?: $vehicleType);
$vTaxRate = 500;
if ($selVehUpper === 'SUV') $vTaxRate = 1000;
if ($selVehUpper === 'INNOVA' || $selVehUpper === 'CRYSTA') $vTaxRate = 1500;
$totalTaxCalculated = 0;
foreach ($borderList as $b) {
    if (($selVehUpper === 'INNOVA' || $selVehUpper === 'CRYSTA') && !empty($b['andhraBorder'])) {
        $totalTaxCalculated += 2000;
    } else {
        $totalTaxCalculated += $vTaxRate;
    }
}

$inclusions = "Air-conditioned vehicle with driver, Base fare and fuel charges, Driver allowance (bata), 24/7 customer support";
if ($includeTolls) {
    $inclusions .= ", Toll charges";
}
if ($includeTaxes) {
    $inclusions .= ", State border tax" . ($totalTaxCalculated > 0 ? " included (₹" . number_format($totalTaxCalculated) . ")" : "");
}

$exclusions = "";
if (!$includeTolls) {
    $exclusions .= "Toll charges, as applicable, ";
}
if (!$includeTaxes) {
    if ($totalTaxCalculated > 0) {
        $exclusions .= "State border tax: ₹" . number_format($totalTaxCalculated) . " (" . ($borderCount === 1 ? "crossing 1 state border" : "crossing {$borderCount} state borders") . ", payable extra to driver), ";
    } else {
        $exclusions .= "State border tax (applicable only if crossing state border), ";
    }
} else {
    $exclusions .= "State border tax (if crossing border & not explicitly shown above), ";
}
$exclusions .= "Parking and entry fees, (if any), " . ($isHourlyCheck ? "" : "Extra {$extraKmRateStr}/KM (if exceeded the KMs calculated{$garageText}), ") . $waitingChargeText;

if ($selectedVehicle !== '') {
    $breakdownHtml = dropcars_fare_breakdown_html($fareBreakdown, $selectedVehicle);
    $breakdownPlain = dropcars_fare_breakdown_plain($fareBreakdown, $selectedVehicle);
    $telegramFareBreakdownBlock = ($fareBreakdown !== []) ? dropcars_fare_breakdown_telegram_html($fareBreakdown, $selectedVehicle) : '';
} else {
    $breakdownHtml = dropcars_fare_breakdown_html($fareBreakdown);
    $breakdownPlain = dropcars_fare_breakdown_plain($fareBreakdown);
    $telegramFareBreakdownBlock = ($fareBreakdown !== []) ? dropcars_fare_breakdown_telegram_html($fareBreakdown) : '';
}

$tripTypeLabels = [
    'one_way' => 'One-Way Drop',
    'round_trip' => 'Round Trip',
    'multi_city' => 'Multi City',
    'hourly_rental' => 'Hourly Rental'
];
$tripLabel = $tripTypeLabels[$tripType] ?? $tripType;

// Use the new clean SEO URL format
$pickupShort = trim(explode(',', strip_tags($pickup))[0]);
$dropShort = trim(explode(',', strip_tags($drop))[0]);
$routeDisplay = ($pickupShort !== '' && $dropShort !== '') ? "{$pickupShort} ➔ {$dropShort}" : (strip_tags($pickup) . " ➔ " . strip_tags($drop));

$tripLabelShort = ($tripType === 'round_trip') ? 'Round Trip' : (($tripType === 'hourly_rental') ? 'Hourly Rental' : (($tripType === 'airport_transfer') ? 'Airport Transfer' : 'One Way'));
$vehicleLabelShort = $selectedVehicle ? ucfirst(strtolower($selectedVehicle)) : ($vehicleType ? ucfirst(strtolower($vehicleType)) : 'Sedan');
if (strcasecmp($vehicleLabelShort, 'CRYSTA') === 0) $vehicleLabelShort = 'Innova Crysta';

$cleanCustomerName = trim(strip_tags((string)$customerName));
if ($cleanCustomerName === '' || $cleanCustomerName === 'N/A') {
    $cleanCustomerName = 'Customer';
}

$formattedDateTime = (!empty($travelDate) ? date('d M', strtotime($travelDate)) : date('d M')) . ($travelTime ? ', ' . $travelTime : '');

// Subject format: 🚖 #E26100201: Chennai ➔ Coimbatore (One Way - Sedan) - Pugazh
$subject = "\u{1F696} #{$bookingId}: {$routeDisplay} ({$tripLabelShort} - {$vehicleLabelShort}) - {$cleanCustomerName}";

$estimatesForEmail = [];
if ($selectedVehicle !== '' && isset($rawVehicleEstimates[$selectedVehicle])) {
    $estimatesForEmail[$selectedVehicle] = (int)$rawVehicleEstimates[$selectedVehicle];
} elseif (!empty($rawVehicleEstimates)) {
    foreach (['SEDAN', 'SUV', 'INNOVA', 'CRYSTA'] as $vehicleKey) {
        if (isset($rawVehicleEstimates[$vehicleKey])) {
            $estimatesForEmail[$vehicleKey] = (int)$rawVehicleEstimates[$vehicleKey];
        }
    }
}
if (empty($estimatesForEmail) && $selectedVehicle !== '' && $fareEstimate > 0) {
    $estimatesForEmail[$selectedVehicle] = $fareEstimate;
}
if (empty($estimatesForEmail) && $fareEstimate > 0) {
    $estimatesForEmail['SEDAN'] = $fareEstimate;
}
$hasSingleVehicleEstimate = count($estimatesForEmail) === 1;
$selectedEstimateVehicleKey = $hasSingleVehicleEstimate ? array_key_first($estimatesForEmail) : '';

// ── Early client IP (needed in email body & WA links) ─────────────────────────
$clientIp = trim(explode(',', (string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['HTTP_X_REAL_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? ''))[0] ?? '');

// ── WhatsApp share URL generation ────────────────────────────────────────────
// Enquiries strictly use 'E' prefix (e.g. E26100301); Confirmed bookings use 'DC'
$waBookingId = $bookingId;
if (preg_match('/^DE/i', $waBookingId)) {
    $waBookingId = 'E' . substr($waBookingId, 2);
}
if (!function_exists('get_route_explore_url')) {
    function get_route_explore_url($pickup, $drop) {
        if (empty($pickup) || empty($drop)) {
            return 'https://dropcars.in';
        }
        $pParts = explode(',', $pickup);
        $dParts = explode(',', $drop);
        $pCity = trim($pParts[0]);
        $dCity = trim($dParts[0]);
        
        $slugP = strtolower(preg_replace('/[^a-zA-Z0-9\s]/', '', $pCity));
        $slugP = preg_replace('/\s+/', '-', trim($slugP));
        
        $slugD = strtolower(preg_replace('/[^a-zA-Z0-9\s]/', '', $dCity));
        $slugD = preg_replace('/\s+/', '-', trim($slugD));
        
        if (empty($slugP) || empty($slugD)) {
            return 'https://dropcars.in';
        }
        
        // Return clean URL path
        return 'https://dropcars.in/drop-cars/' . $slugP . '-to-' . $slugD;
    }
}

$waPhone     = preg_replace('/[^\d]/', '', strip_tags($contactValue));
if (strlen($waPhone) === 10) $waPhone = '91' . $waPhone;
$waVehicle   = strtoupper(trim($selectedVehicle ?: $vehicleType));
$waGroupDate = !empty($travelDate) ? date('d M Y', strtotime($travelDate)) : '';
$waPickTime  = $travelTime ? ', ' . $travelTime : '';

// Per-km rate & driver bata for group message
$waPerKm = ''; $waDriverBata = '';
if (!empty($tariffsPath) && file_exists($tariffsPath)) {
    $_waTariffs  = json_decode(file_get_contents($tariffsPath), true) ?: [];
    $_waTTSearch = (strpos($tripType, 'round') !== false) ? 'round' : 'oneway';
    foreach ($_waTariffs as $_wt) {
        if (strtoupper($_wt['vehicle_type']) === $waVehicle && strtolower($_wt['trip_type']) === $_waTTSearch) {
            $waPerKm      = '₹' . $_wt['per_km_rate'] . '/KM';
            $waDriverBata = '₹' . ($_wt['driver_beta'] ?? $_wt['driver_allowance'] ?? 0);
            break;
        }
    }
    unset($_waTariffs, $_waTTSearch, $_wt);
}

// Calculate minimum billable KM & included KM limit
$calculatedMinKm = ($tripType === 'round_trip') ? max(250, (int)$distance * 2) : max(130, (int)$distance);

// Share Customer — enquiry quote message (all emoji as real UTF-8 characters)
$waVehicleDisplay = $waVehicle !== '' ? $waVehicle : 'Sedan';
$waCustomerMsg  = "🌟 *DROP CARS — TRIP QUOTE & SUMMARY* 🌟\n";
$waCustomerMsg .= "_Your Trusted Outstation & Intercity Cab Partner_\n\n";
$waCustomerMsg .= "Dear *" . strip_tags($customerName) . "*,\n\n";
$waCustomerMsg .= "Thank you for choosing *Drop Cars*! Here is your complete trip itinerary & fare estimate for reference:\n\n";
$waCustomerMsg .= "━━━━━━━━━━━━━━━━━━━\n🗺️ *YOUR TRIP AT A GLANCE*\n━━━━━━━━━━━━━━━━━━━\n";
$waCustomerMsg .= "📌 *Enquiry Reference:* *#" . $waBookingId . "*\n";
$waCustomerMsg .= "📍 *From (Pickup):* " . strip_tags($pickup) . "\n";
$waCustomerMsg .= "🏁 *To (Drop):* " . strip_tags($drop) . "\n";
$waCustomerMsg .= "🚗 *Vehicle Choice:* " . $waVehicleDisplay . "\n";
$waCustomerMsg .= "💼 *Trip Type:* " . $tripLabel . "\n";
if ($waGroupDate) $waCustomerMsg .= "📅 *Travel Date:* " . $waGroupDate . "\n";
if ($travelTime)  $waCustomerMsg .= "⏰ *Pickup Time:* " . $travelTime . "\n";
if ($isRoundTripCheck && !empty($data['returnDate'])) {
    $waCustomerMsg .= "📅 *Return Date:* " . date('d M Y', strtotime($data['returnDate'])) . "\n";
}
if ($distance > 0) {
    $waCustomerMsg .= "🛣️ *Approx Route Distance:* ~" . number_format($distance) . " KM\n";
    $waCustomerMsg .= "📏 *Included KM Limit:* " . number_format($calculatedMinKm) . " KM\n";
}
if ($fareEstimate > 0) {
    $waCustomerMsg .= "\n━━━━━━━━━━━━━━━━━━━\n💰 *FARE DETAILS*\n━━━━━━━━━━━━━━━━━━━\n";
    $waCustomerMsg .= "💵 *Estimated Fare:* *₹" . number_format($fareEstimate) . "* _(" . ($fareTypeRaw === 'inclusive' ? 'All-Inclusive Fare' : 'Excl. toll & state tax') . ")_\n";
    $waCustomerMsg .= "💳 *Payment:* Payable to driver via Cash / UPI at trip end\n";
}
$waCustomerMsg .= "\n━━━━━━━━━━━━━━━━━━━\n✅ *WHAT'S INCLUDED*\n━━━━━━━━━━━━━━━━━━━\n";
$waCustomerMsg .= "🟢 AC Cab, fuel charges & driver allowance (bata)\n";
$waCustomerMsg .= "🟢 24x7 Customer assistance & real-time dispatch\n";
if ($includeTolls) $waCustomerMsg .= "🟢 Highway toll charges included\n";
if ($includeTaxes) $waCustomerMsg .= "🟢 State border permit / tax included (if crossing state border)\n";
$waCustomerMsg .= "\n⚠️ *WHAT'S EXTRA / EXCLUDED*\n";
$waCustomerMsg .= "🔸 Parking and entry fees (if any, paid as actuals)\n";
if (!$includeTolls) $waCustomerMsg .= "🔸 Highway toll charges (paid as actuals)\n";
if (!$includeTaxes) {
    if (!empty($fareBreakdown['borderTransitions'])) {
        $taxAmtStr = ($selectedVehicle === 'INNOVA' || $selectedVehicle === 'CRYSTA') ? '₹1,500' : (($selectedVehicle === 'SUV') ? '₹1,000' : '₹500');
        $waCustomerMsg .= "🔸 State permit / border tax: {$taxAmtStr} (crossing state border, paid to driver)\n";
    } else {
        $waCustomerMsg .= "🔸 State border tax (applicable only if crossing state border)\n";
    }
}
if (!$isHourlyCheck) $waCustomerMsg .= "🔸 Extra KM beyond " . number_format($calculatedMinKm) . " KM at " . $extraKmRateStr . "/KM" . $garageText . "\n";

$waCustomerMsg .= "\n━━━━━━━━━━━━━━━━━━━\n⚡ *CONFIRM YOUR TRIP*\n━━━━━━━━━━━━━━━━━━━\n";
$waCustomerMsg .= "To verify and confirm your booking instantly:\n";
$waCustomerMsg .= "👉 https://dropcars.in/track-booking/" . $bookingId . "\n";
$waCustomerMsg .= "_Or reply *CONFIRM* directly to this WhatsApp message!_\n\n";

$waCustomerMsg .= "━━━━━━━━━━━━━━━━━━━\n🎁 *SAVE SEARCH & EARN ₹100*\n━━━━━━━━━━━━━━━━━━━\n";
$waCustomerMsg .= "Log in with your email at https://dropcars.in/login to save your trip searches, earn ₹100 wallet credits, and unlock exclusive promo codes!\n\n";

$waCustomerMsg .= "━━━━━━━━━━━━━━━━━━━\n📄 *POLICIES & SIGHTSEEING*\n━━━━━━━━━━━━━━━━━━━\n";
$waCustomerMsg .= "• Explore Route Details: " . get_route_explore_url($pickup, $drop) . "\n";
$waCustomerMsg .= "• Terms & Policies: https://dropcars.in/terms\n\n";

$waCustomerMsg .= "━━━━━━━━━━━━━━━━━━━\n_Need help? We are available 24x7:_\n";
$waCustomerMsg .= "📞 *" . ($config['supportPhone'] ?? '+91 7200217986') . "*\n";
$waCustomerMsg .= "🌐 https://dropcars.in\n\n";
$waCustomerMsg .= "_Have a safe and pleasant journey!_\n*— Drop Cars Team* 🙏";
$waCustomerUrl  = ($waPhone !== '' && $waPhone !== '91') ? 'https://wa.me/' . $waPhone . '?text=' . rawurlencode($waCustomerMsg) : '#';

// Share Group — broadcast announcement style
$waRateKmDisplay = $waPerKm !== '' ? $waPerKm : '₹15/KM';
$waBataDisplay = '₹300'; // Always show 300 only for drivers bata in group post

$waGroupMsg  = "🚖 *DROP CARS — VEHICLE REQUIREMENT* 🚖\n";
$waGroupMsg .= "_New outstation trip requirement posted. Please verify details and accept._\n\n";
if ($waBookingId) $waGroupMsg .= "📌 *Booking ID:* *#" . $waBookingId . "*\n";
$waGroupMsg .= "━━━━━━━━━━━━━━━━━━━\n🗺️ *TRIP INFORMATION*\n━━━━━━━━━━━━━━━━━━━\n";
$waGroupMsg .= "📍 *Pickup:* " . strip_tags($pickup) . "\n";
$waGroupMsg .= "🏁 *Drop Location:* " . strip_tags($drop) . "\n";
$waGroupMsg .= "🚗 *Required Vehicle:* " . $waVehicleDisplay . "\n";
$waGroupMsg .= "💼 *Trip Type:* " . $tripLabel . "\n";
if ($waGroupDate) $waGroupMsg .= "📅 *Date:* " . $waGroupDate . "\n";
if ($travelTime)  $waGroupMsg .= "⏰ *Reporting Time:* " . $travelTime . "\n";
if ($isRoundTripCheck && !empty($data['returnDate'])) {
    $waGroupMsg .= "📅 *Return Date:* " . date('d M Y', strtotime($data['returnDate'])) . "\n";
}
if ($distance > 0) $waGroupMsg .= "🛣️ *Approx Distance:* ~" . number_format($distance, 0) . " KM\n";
$waGroupMsg .= "━━━━━━━━━━━━━━━━━━━\n💰 *DRIVERS PAYOUT & DETAILS*\n━━━━━━━━━━━━━━━━━━━\n";
$waGroupMsg .= "💵 *KM Rate:* " . $waRateKmDisplay . "\n";
$waGroupMsg .= "👨‍✈️ *Driver Bata:* " . $waBataDisplay . " / Day\n";
$waGroupMsg .= "🧾 *Agency Commission:* 10%\n";
$waGroupMsg .= "🛣️ *Exclusions:* Toll, Parking, State Permit charges paid extra (as actuals)\n";
$waGroupMsg .= "━━━━━━━━━━━━━━━━━━━\n\n";
$waGroupMsg .= "📣 Book/Attach your vehicles with *Drop Cars*!\n";
$waGroupMsg .= "📞 *Drop Cars Control:* +91 75988 99579\n";
$waGroupMsg .= "🌐 https://dropcars.in\n\n";
$waGroupMsg .= "📱 *Driver App Download:*\nhttps://play.google.com/store/apps/details?id=com.dropcars.driverapp\n\n";
$waGroupMsg .= "📢 *Follow Telegram for Live Booking Updates:*\nhttps://t.me/drop_cars\n\n";
$waGroupMsg .= "💬 *WhatsApp Channel (🚖 Drop Cars - Driver Updates 🚨):*\nhttps://whatsapp.com/channel/0029VbB6Wj04tRrza58IwZ2p\n\n";
$waGroupMsg .= "_Reply with vehicle number and driver details to accept._";
$waGroupUrl = 'https://wa.me/?text=' . rawurlencode($waGroupMsg);

// Share Driver — full trip brief with passenger contact
$waDriverMsg  = "🚖 *DROP CARS — TRIP ASSIGNMENT* 🚖\n";
$waDriverMsg .= "_Please read carefully and reply ✅ to confirm this trip._\n\n";
$waDriverMsg .= "📌 *Booking ID:* *#" . $waBookingId . "*\n";
$waDriverMsg .= "━━━━━━━━━━━━━━━━━━━\n👤 *PASSENGER CONTACT DETAILS*\n━━━━━━━━━━━━━━━━━━━\n";
$waDriverMsg .= "🙋 *Name:* " . strip_tags($customerName) . "\n";
$waDriverMsg .= "📞 *Phone:* " . strip_tags($formattedContact) . "\n\n";
$waDriverMsg .= "━━━━━━━━━━━━━━━━━━━\n🗺️ *TRIP INFORMATION*\n━━━━━━━━━━━━━━━━━━━\n";
$waDriverMsg .= "📍 *Pickup Address:* " . strip_tags($pickup) . "\n";
$waDriverMsg .= "🏁 *Drop Address:* " . strip_tags($drop) . "\n";
$waDriverMsg .= "🚗 *Vehicle Category:* " . $waVehicleDisplay . "\n";
$waDriverMsg .= "💼 *Trip Type:* " . $tripLabel . "\n";
if ($waGroupDate)  $waDriverMsg .= "📅 *Travel Date:* " . $waGroupDate . $waPickTime . "\n";
if ($isRoundTripCheck && !empty($data['returnDate'])) {
    $waDriverMsg .= "📅 *Return Date:* " . date('d M Y', strtotime($data['returnDate'])) . "\n";
}
if ($distance > 0) $waDriverMsg .= "🛣️ *Approx Distance:* ~" . number_format($distance, 0) . " KM\n";
$waDriverMsg .= "📍 *Navigate Pickup:* https://www.google.com/maps/search/?api=1&query=" . urlencode(strip_tags($pickup)) . "\n";
$waDriverMsg .= "🏁 *Navigate Drop:* https://www.google.com/maps/search/?api=1&query=" . urlencode(strip_tags($drop)) . "\n";
$waDriverMsg .= "━━━━━━━━━━━━━━━━━━━\n💰 *FARE & COLLECTION REMINDER*\n━━━━━━━━━━━━━━━━━━━\n";
$waDriverMsg .= "💵 *Amount to Collect:* *₹" . number_format($fareEstimate) . "*\n";
$waDriverMsg .= "🧾 *Fare Inclusions:* " . ($fareTypeRaw === 'inclusive' ? 'Inclusive of Highway Toll & Permit Tax' : 'Exclusions apply (Passenger pays Toll/Permit extra)') . "\n";
$waDriverMsg .= "🚨 _Collect exact balance amount from passenger at trip end._\n";
$waDriverMsg .= "━━━━━━━━━━━━━━━━━━━\n📋 *MANDATORY DRIVER REMINDERS*\n━━━━━━━━━━━━━━━━━━━\n";
$waDriverMsg .= "1. Ensure vehicle is fully washed, clean, and has working A/C.\n";
$waDriverMsg .= "2. Be punctual — arrive 15 minutes before pickup time.\n";
$waDriverMsg .= "3. Carry valid license (DL), RC book, permit, and insurance.\n";
$waDriverMsg .= "4. Take start-trip and end-trip odometer photos and share with office.\n\n";
$waDriverMsg .= "📞 *Drop Cars Dispatch Control:* +91 75988 99579\n\n";
$waDriverMsg .= "📱 *Driver App Download:*\nhttps://play.google.com/store/apps/details?id=com.dropcars.driverapp\n\n";
$waDriverMsg .= "📢 *Follow Telegram for Live Booking Updates:*\nhttps://t.me/drop_cars\n\n";
$waDriverMsg .= "💬 *WhatsApp Channel (🚖 Drop Cars - Driver Updates 🚨):*\nhttps://whatsapp.com/channel/0029VbB6Wj04tRrza58IwZ2p\n\n";
$waDriverMsg .= "_Reply with your vehicle details and ✅ to accept._";
$waDriverUrl = 'https://wa.me/?text=' . rawurlencode($waDriverMsg);

$bodyHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
body{font-family:Arial,sans-serif;line-height:1.6;color:#333;}
.container{max-width:640px;margin:0 auto;padding:18px;background:#f3f7fd;border:1px solid #d8e4f3;border-radius:14px;}
.header{background:linear-gradient(135deg,#ff7a00 0%,#ff5f00 100%);color:#ffffff !important;padding:20px;text-align:center;border-radius:10px;}
.header h1{margin:0;font-size:24px;letter-spacing:0.2px;color:#ffffff !important;}
.header p{margin:6px 0 0;color:#ffffff !important;}
.block{margin:14px 0 0;background:#fff;border:1px solid #d8e4f3;border-radius:10px;overflow:hidden;}
.block-title{background:#edf4ff;color:#0b4a8f;font-size:13px;font-weight:700;padding:10px 14px;letter-spacing:0.3px;text-transform:uppercase;border-bottom:1px solid #d8e4f3;}
.block-body{padding:0 14px;}
.kv{width:100%;border-collapse:collapse;font-size:14px;}
.kv tr td{padding:9px 0;border-bottom:1px solid #eef3fb;vertical-align:top;}
.kv tr:last-child td{border-bottom:none;}
.kv .k{width:150px;color:#5f7290;font-weight:700;}
.kv .v{color:#0e2f56;font-weight:600;}
.vehicle-fare-grid{display:grid;gap:10px;padding:12px 0;}
.vehicle-fare-card{border:1px solid #d8e4f3;background:#f9fbff;border-radius:10px;padding:12px 14px;}
.vehicle-fare-title{font-weight:700;color:#0b4a8f;font-size:15px;}
.vehicle-fare-meta{font-size:12px;color:#5f7290;margin-top:3px;}
.vehicle-fare-amt{font-size:24px;font-weight:800;color:#0f8a5f;margin-top:6px;}
.note{font-size:12px;color:#5f7290;padding:0 0 12px;}
.list-title{font-weight:700;color:#0b4a8f;margin:10px 0 4px;}
.list{margin:0 0 10px 18px;padding:0;font-size:14px;color:#203a5c;}
.footer{font-size:12px;color:#68748c;margin-top:24px;text-align:center;}
</style></head><body>
<!-- Preheader / Inbox Preview Snippet -->
<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;mso-hide:all;">
📅 ' . htmlspecialchars($formattedDateTime) . ' &nbsp;|&nbsp; 📍 ' . htmlspecialchars($routeDisplay) . ' &nbsp;|&nbsp; ' . "\u{1F696}" . ' Enquiry #' . htmlspecialchars($bookingId) . ' &nbsp;|&nbsp; 🚗 ' . htmlspecialchars($tripLabelShort . ' - ' . $vehicleLabelShort) . '
</div>
<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;mso-hide:all;">
&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
</div>
<div class="container">
<div class="header" style="background:linear-gradient(135deg,#ea580c 0%,#c2410c 100%);color:#ffffff !important;padding:22px 18px;text-align:center;border-radius:10px;">
<h1 style="color:#ffffff !important;margin:0;font-size:24px;font-weight:800;letter-spacing:0.3px;text-shadow:0 1px 2px rgba(0,0,0,0.3);"><span style="color:#ffffff !important;">DROP CARS</span></h1>
<p style="color:#ffffff !important;margin:6px 0 2px 0;font-size:16px;font-weight:700;text-shadow:0 1px 2px rgba(0,0,0,0.3);"><span style="color:#ffffff !important;">🚖 New Taxi Enquiry</span></p>
<p style="color:#fff7ed !important;font-size:13px;font-weight:600;margin:0;opacity:0.95;text-shadow:0 1px 2px rgba(0,0,0,0.3);"><span style="color:#fff7ed !important;">Enquiry ID: ' . $bookingId . '</span></p>
</div>';

$contactValueHtml = '<div style="font-size: 15px; font-weight: 700; color: #0e2f56; margin-bottom: 4px;">' . htmlspecialchars($formattedContact) . '</div>';
if (preg_match('/[0-9]/', $contactValue)) {
    $telHref = 'tel:' . preg_replace('/[^\d\+]/', '', $formattedContact);
    $contactValueHtml .= '<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-top: 6px;"><tr>'
        . '<td style="padding-right: 8px;">'
        . '<a href="' . $telHref . '" style="display: inline-block; background-color: #2563eb; color: #ffffff !important; padding: 8px 20px; border-radius: 6px; font-weight: 700; text-decoration: none; font-size: 13px; text-align: center; border: 1px solid #1d4ed8; line-height: 1.2; box-shadow: 0 2px 4px rgba(37,99,235,0.25);">'
        . '<span style="color: #ffffff !important;">📞 Call</span></a>'
        . '</td>'
        . '<td>'
        . '<a href="' . $waCustomerUrl . '" target="_blank" style="display: inline-block; background-color: #059669; color: #ffffff !important; padding: 8px 20px; border-radius: 6px; font-weight: 700; text-decoration: none; font-size: 13px; text-align: center; border: 1px solid #047857; line-height: 1.2; box-shadow: 0 2px 4px rgba(5,150,105,0.25);">'
        . '<span style="color: #ffffff !important;">💬 WhatsApp</span></a>'
        . '</td>'
        . '</tr></table>';
}

$whatsappValueHtml = '';
if ($whatsappValue !== '') {
    $whatsappValueHtml = '<div style="font-size: 15px; font-weight: 700; color: #0e2f56; margin-bottom: 4px;">' . htmlspecialchars($formattedWhatsapp) . '</div>';
    if (preg_match('/[0-9]/', $whatsappValue)) {
        $cleanWa = preg_replace('/[^\d]/', '', $whatsappValue);
        $waPhoneAlt = (strlen($cleanWa) === 10) ? '91' . $cleanWa : $cleanWa;
        $telHref = 'tel:' . preg_replace('/[^\d\+]/', '', $formattedWhatsapp);
        $waHrefAlt = ($waPhoneAlt !== '' && $waPhoneAlt !== '91') ? 'https://wa.me/' . $waPhoneAlt . '?text=' . rawurlencode($waCustomerMsg) : '#';

        $whatsappValueHtml .= '<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-top: 6px;"><tr>'
            . '<td style="padding-right: 8px;">'
            . '<a href="' . $telHref . '" style="display: inline-block; background-color: #2563eb; color: #ffffff !important; padding: 8px 20px; border-radius: 6px; font-weight: 700; text-decoration: none; font-size: 13px; text-align: center; border: 1px solid #1d4ed8; line-height: 1.2; box-shadow: 0 2px 4px rgba(37,99,235,0.25);">'
            . '<span style="color: #ffffff !important;">📞 Call</span></a>'
            . '</td>'
            . '<td>'
            . '<a href="' . $waHrefAlt . '" target="_blank" style="display: inline-block; background-color: #059669; color: #ffffff !important; padding: 8px 20px; border-radius: 6px; font-weight: 700; text-decoration: none; font-size: 13px; text-align: center; border: 1px solid #047857; line-height: 1.2; box-shadow: 0 2px 4px rgba(5,150,105,0.25);">'
            . '<span style="color: #ffffff !important;">💬 WhatsApp</span></a>'
            . '</td>'
            . '</tr></table>';
    }
}

$bodyHtml .= '
<div class="block"><div class="block-title">👤 Customer Details</div><div class="block-body"><table class="kv">
<tr><td class="k">👤 Name</td><td class="v">' . htmlspecialchars($customerName) . '</td></tr>
<tr><td class="k">📞 Phone</td><td class="v">' . $contactValueHtml . '</td></tr>'
. ($whatsappValue !== '' ? '<tr><td class="k">💬 WhatsApp</td><td class="v">' . $whatsappValueHtml . '</td></tr>' : '') . '
</table></div></div>';

$vehicleLineHtml = '';
if ($selectedVehicle !== '' && isset($vehicleMeta[$selectedVehicle])) {
    $vm = $vehicleMeta[$selectedVehicle];
    $vehicleLineHtml = htmlspecialchars($vm['name'])
        . ($vm['capacity'] !== '' ? ' <span style="font-size:12px;color:#64748b;">👥 ' . htmlspecialchars($vm['capacity']) . ' • ❄︎ ' . htmlspecialchars($vm['ac']) . '</span>' : '');
} else {
    $vehicleLineHtml = 'Not Selected';
}

$bodyHtml .= '
<div class="block"><div class="block-title">🚖 Trip Details</div><div class="block-body"><table class="kv">
<tr><td class="k">🚖 Trip Type</td><td class="v">' . $tripLabel . ($isAirportFlag ? ' <span style="background:#0ea5e9;color:#ffffff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;margin-left:6px;">AIRPORT TRANSFER</span>' : '') . '</td></tr>
<tr><td class="k">📍 From (Pickup)</td><td class="v">' . $pickupHtml . '</td></tr>
<tr><td class="k">🏁 To (Drop)</td><td class="v">' . $drop . '</td></tr>
<tr><td class="k">🗓️ Pickup Date</td><td class="v">' . htmlspecialchars($travelDate) . '</td></tr>
<tr><td class="k">⏰ Pickup Time</td><td class="v">' . htmlspecialchars($travelTime) . '</td></tr>
<tr><td class="k">🚗 Vehicle</td><td class="v">' . $vehicleLineHtml . '</td></tr>
' . ($distance > 0 ? '<tr><td class="k">🛣️ Approx Distance</td><td class="v">~' . number_format($distance, 0) . ' km</td></tr>' : '') . '
</table>
<div style="padding: 12px 0 14px 0; text-align: center; border-top: 1px dashed #d8e4f3; margin-top: 8px;">
    <a href="' . htmlspecialchars($viewMapUrl) . '" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #ffffff !important; padding: 11px 24px; border-radius: 8px; font-weight: 700; text-decoration: none; font-size: 13px; box-shadow: 0 2px 6px rgba(2,132,199,0.35); border: 1px solid #0284c7;">
        <span style="color: #ffffff !important; font-weight: 700;">🗺️ View Map &amp; Route Directions ↗</span>
    </a>
</div>
</div></div>

';
if (!empty($stops)) {
    $bodyHtml .= '<div class="block"><div class="block-title">🛑 Enroute Stops</div><div class="block-body"><ul class="list">';
    foreach ($stops as $s) {
        $bodyHtml .= '<li>📍 ' . htmlspecialchars($s) . '</li>';
    }
    $bodyHtml .= '</ul></div></div>';
}

$sourceBadgeBg = ($normalizedSource === 'Google Ads') ? '#16a34a' : '#0284c7';
$websiteUrl = $config['websiteUrl'] ?? 'https://dropcars.in';
$bodyHtml .= $breakdownHtml
    . "<div class='block'><div class='block-title'>🛡️ Admin Management &amp; CRM Tools</div><div class='block-body' style='padding: 16px; text-align: center;'>
    <div style='display: inline-block; width: 100%; text-align: center;'>
    <div style='margin-bottom: 10px; font-size: 13px; color: #475569; font-weight: bold; text-align: left;'>📲 WhatsApp Dispatch &amp; Broadcasting:</div>
    <a href='" . $waGroupUrl . "' target='_blank' style='display: inline-block; background: #128C7E; color: #ffffff !important; padding: 10px 18px; border-radius: 8px; font-weight: bold; text-decoration: none; font-size: 13px; margin: 4px 6px; box-shadow: 0 2px 4px rgba(18,140,126,0.20);'><span style='color:#ffffff !important;'>👥 Group Post</span></a>
    <a href='" . $waDriverUrl . "' target='_blank' style='display: inline-block; background: #075E54; color: #ffffff !important; padding: 10px 18px; border-radius: 8px; font-weight: bold; text-decoration: none; font-size: 13px; margin: 4px 6px; box-shadow: 0 2px 4px rgba(7,94,84,0.20);'><span style='color:#ffffff !important;'>🚖 Driver Post</span></a>
    
    <div style='margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 12px; margin-bottom: 10px; font-size: 13px; color: #475569; font-weight: bold; text-align: left;'>Execute quick CRM actions from your inbox:</div>
    <table role='presentation' style='width: 100%; border-collapse: separate; border-spacing: 6px;'>
    <tr>
    <td style='width: 50%; background: #0b4a8f; border-radius: 8px; padding: 0;'><a href='" . rtrim($websiteUrl, '/') . "/admin/enquiries?search=" . urlencode($bookingId) . "' target='_blank' style='display: block; color: #ffffff !important; padding: 12px 10px; text-decoration: none; text-align: center;'><span style='font-size: 15px;'>🔍</span><br><span style='font-weight: bold; font-size: 13px; color: #ffffff !important;'>View Enquiry Detail</span></a></td>
    <td style='width: 50%; background: #16a34a; border-radius: 8px; padding: 0;'><a href='" . rtrim($websiteUrl, '/') . "/admin/enquiries?action=confirm&booking_id=" . urlencode($bookingId) . "' target='_blank' style='display: block; color: #ffffff !important; padding: 12px 10px; text-decoration: none; text-align: center;'><span style='font-size: 15px;'>⚡</span><br><span style='font-weight: bold; font-size: 13px; color: #ffffff !important;'>Confirm Booking</span></a></td>
    </tr>
    <tr>
    <td style='width: 50%; background: #d97706; border-radius: 8px; padding: 0;'><a href='" . rtrim($websiteUrl, '/') . "/admin/customer-history?phone=" . urlencode($contactValue) . "' target='_blank' style='display: block; color: #ffffff !important; padding: 12px 10px; text-decoration: none; text-align: center;'><span style='font-size: 15px;'>👤</span><br><span style='font-weight: bold; font-size: 13px; color: #ffffff !important;'>Verify Customer History</span></a></td>
    <td style='width: 50%; background: #ef4444; border-radius: 8px; padding: 0;'><a href='" . rtrim($websiteUrl, '/') . "/admin/settings?cat=operations&block_ip=" . urlencode($clientIp) . "' target='_blank' style='display: block; color: #ffffff !important; padding: 12px 10px; text-decoration: none; text-align: center;'><span style='font-size: 15px;'>🚫</span><br><span style='font-weight: bold; font-size: 13px; color: #ffffff !important;'>Spam? Block Client IP</span></a></td>
    </tr>
    </table>
    </div>
    </div></div>"
    . "<div class='block'><div class='block-title'>Coverage &amp; Trip Guidelines</div><div class='block-body' style='padding-top: 12px; padding-bottom: 12px;'>
    <div style='display: table; width: 100%;'>
        <div style='display: table-row;'>
            <div style='display: table-cell; width: 50%; vertical-align: top; padding-right: 10px;'>
                <div style='font-weight:700; color:#0f8a5f; margin-bottom: 8px; font-size: 13px; text-transform: uppercase;'>✓ What's Included</div>
                <ul style='list-style: none; padding-left: 0; margin: 0; font-size: 13px; color: #2c3e50;'>
                    <li style='margin-bottom: 6px;'>🟢 Base fare and fuel charges</li>
                    <li style='margin-bottom: 6px;'>🟢 Driver allowance (bata)</li>" . ($includeTolls ? "<li style='margin-bottom: 6px; font-weight: 700; color: #0f8a5f;'>🟢 Toll charges included</li>" : "") . ($includeTaxes ? "<li style='margin-bottom: 6px; font-weight: 700; color: #0f8a5f;'>🟢 State border tax included" . ($totalTaxCalculated > 0 ? " (₹" . number_format($totalTaxCalculated) . ")" : "") . "</li>" : "") . "
                </ul>
            </div>
            <div style='display: table-cell; width: 50%; vertical-align: top; padding-left: 10px; border-left: 1px solid #eef3fb;'>
                <div style='font-weight:700; color:#d97706; margin-bottom: 8px; font-size: 13px; text-transform: uppercase;'>⚠️ What's Excluded</div>
                <ul style='list-style: none; padding-left: 0; margin: 0; font-size: 13px; color: #64748b;'>
                    <li style='margin-bottom: 6px;'>🔴 Parking and entry fees, (if any)</li>" . ($includeTolls ? "" : "<li style='margin-bottom: 6px;'>🔴 Toll charges, as applicable</li>") . ($includeTaxes ? "" : ($totalTaxCalculated > 0 ? "<li style='margin-bottom: 6px; font-weight: 700; color: #c2410c;'>🔴 State border tax: ₹" . number_format($totalTaxCalculated) . " (crossing state border, payable extra)</li>" : "<li style='margin-bottom: 6px;'>🔴 State border tax (applicable only if crossing state border)</li>")) . "
                    " . ($isHourlyCheck ? "" : "<li style='margin-bottom: 6px;'>🔴 Extra " . $extraKmRateStr . "/KM (if exceeded the KMs calculated" . $garageText . ")</li>") . "
                    <li style='margin-bottom: 6px;'>🔴 " . $waitingChargeText . "</li>
                </ul>
            </div>
        </div>
    </div>
    </div></div>"
    . ($isRoundTripCheck ? "<div class='block' style='background: #fffbeb; border-left: 4px solid #f59e0b;'><div class='block-body' style='padding: 14px;'>
    <div style='font-weight: 750; color: #b45309; font-size: 14px; margin-bottom: 4px;'>ℹ️ Trip Rule &amp; KM Calculation</div>
    <div style='font-size: 13px; color: #78350f; line-height: 1.5;'>
      KM limits and round trip KMs are always calculated on a garage-to-garage basis until the vehicle returns back to the pickup point.
    </div>
    </div></div>" : "")
    . '<div class="block"><div class="block-title">📡 Source &amp; Lead Intelligence</div><div class="block-body"><table class="kv">'
        . '<tr><td class="k">Source</td><td class="v"><span style="background:' . $sourceBadgeBg . ';color:#ffffff;padding:3px 9px;border-radius:4px;font-weight:bold;font-size:12px;display:inline-block;">' . htmlspecialchars($normalizedSource) . '</span></td></tr>'
        . ($utmCampaign !== '' ? '<tr><td class="k">📢 Campaign Name</td><td class="v"><span style="background:#f1f5f9;color:#0f172a;padding:3px 8px;border-radius:4px;font-weight:700;font-size:13px;">' . htmlspecialchars(str_replace('_', ' ', $utmCampaign)) . '</span></td></tr>' : '')
        . ($utmTerm !== '' ? '<tr><td class="k">🎯 Search Keyword</td><td class="v"><strong>' . htmlspecialchars($utmTerm) . '</strong>' . ($matchtypeLabel !== '' ? ' <span style="background:#e0f2fe;color:#0369a1;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:700;margin-left:6px;border:1px solid #bae6fd;">' . htmlspecialchars($matchtypeLabel) . '</span>' : '') . '</td></tr>' : '')
        . ($utmContent !== '' ? '<tr><td class="k">📂 Ad Group Name</td><td class="v"><span style="background:#f1f5f9;color:#0f172a;padding:3px 8px;border-radius:4px;font-weight:700;font-size:13px;">' . htmlspecialchars(str_replace('_', ' ', $utmContent)) . '</span></td></tr>' : '')
        . '<tr><td class="k">📱 Device</td><td class="v"><strong>' . htmlspecialchars($deviceLabel) . '</strong></td></tr>'
        . '<tr><td class="k">🌐 Page Name</td><td class="v"><strong>' . htmlspecialchars($pageDisplayName) . '</strong></td></tr>'
        . '<tr><td class="k">🔗 Page URL</td><td class="v">' . ($pageUrlRaw !== '' ? '<a href="' . htmlspecialchars($pageUrlRaw) . '" target="_blank" style="color:#0284c7;font-weight:600;word-break:break-all;">' . htmlspecialchars($pageUrlRaw) . '</a>' : htmlspecialchars($sourcePage)) . '</td></tr>'
        . '<tr><td class="k">💻 IP Address</td><td class="v"><span style="font-family:monospace;background:#f1f5f9;padding:2px 6px;border-radius:4px;">' . htmlspecialchars($clientIp) . '</span></td></tr>'
        . '<tr><td class="k">⏰ Lead Captured</td><td class="v">' . date('d M Y, h:i A') . ' IST</td></tr>'
        . '</table></div></div>'
    . '<div class="footer">Automated enquiry from Drop Cars website. Phone: +91 7200217986</div>
</div></body></html>';

$bodyPlain = "\u{1F696} Drop Cars – New Taxi Enquiry\n\n";
$bodyPlain .= "Enquiry ID: {$bookingId}\n";
$bodyPlain .= "Customer: {$customerName}\n";
$bodyPlain .= "Phone: {$formattedContact}\n";
$bodyPlain .= "Trip Type: {$tripLabel}\n";
$bodyPlain .= "Pickup: {$pickup}\n";
$bodyPlain .= "Drop: {$drop}\n";
$bodyPlain .= "🗺️ View Map: {$viewMapUrl}\n";
$bodyPlain .= "Date: {$travelDate} | Time: {$travelTime}\n";
if ($hasSingleVehicleEstimate && $selectedEstimateVehicleKey !== '') {
    $meta = $vehicleMeta[$selectedEstimateVehicleKey] ?? ['name' => $selectedEstimateVehicleKey];
    $bodyPlain .= "Vehicle: {$meta['name']}\n";
    $bodyPlain .= "Estimated Fare: ₹" . number_format((int)$estimatesForEmail[$selectedEstimateVehicleKey], 0) . "\n";
} else {
    $bodyPlain .= "Estimated Fares:\n";
    foreach ($estimatesForEmail as $vKey => $vFare) {
        $meta = $vehicleMeta[$vKey] ?? ['name' => $vKey];
        $bodyPlain .= "- {$meta['name']}: ₹" . number_format((int)$vFare, 0) . "\n";
    }
}
$inclusions = "Air-conditioned vehicle with driver, Base fare and fuel charges, Driver allowance (bata), 24/7 customer support";
if ($includeTolls) {
    $inclusions .= ", Toll charges included";
}
if ($includeTaxes) {
    $inclusions .= ", State border tax included (if crossing state border)";
}

$exclusions = "";
if (!$includeTolls) {
    $exclusions .= "Toll charges, as applicable, ";
}
if (!$includeTaxes) {
    $exclusions .= "State border tax (applicable only if crossing state border), ";
} else {
    $exclusions .= "State border tax (if crossing border & not explicitly shown above), ";
}
$exclusions .= "Parking and entry fees, (if any), " . ($isHourlyCheck ? "" : "Extra {$extraKmRateStr}/KM (if exceeded the KMs calculated{$garageText}), ") . $waitingChargeText;
$bodyPlain .= "Inclusions: {$inclusions}\n";
$bodyPlain .= "Exclusions: {$exclusions}\n";
$bodyPlain .= "\n--- Source & Lead Intelligence ---\n";
$bodyPlain .= "Source: {$normalizedSource}\n";
if ($utmTerm !== '')     $bodyPlain .= "Search Keyword: {$utmTerm}" . ($matchtypeLabel ? " [{$matchtypeLabel}]" : "") . "\n";
if ($utmCampaign !== '') $bodyPlain .= "Campaign: {$utmCampaign}\n";
if ($utmContent !== '')  $bodyPlain .= "Ad Group: {$utmContent}\n";
$bodyPlain .= "Device: {$deviceDb}\n";
$bodyPlain .= "Enquiry Page: {$pageDisplayName}\n";
$bodyPlain .= "Page URL: {$pageUrlRaw}\n";
$bodyPlain .= "IP: {$clientIp}\n";
if ($isRoundTripCheck) {
    $bodyPlain .= "\nℹ️ Trip Rule: KM limits and round trip KMs are always calculated garage-to-garage until return back to the pickup point.\n";
}
if ($breakdownPlain !== '') {
    $bodyPlain .= "\n" . $breakdownPlain;
}

$clientIp = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['HTTP_X_REAL_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '';
$clientIp = trim(explode(',', (string) $clientIp)[0] ?? '');
$idBeforeDb = $bookingId;
$isRegularCustomer = false;
$dbSaveError = null;
$dbSaved = false;
require_once __DIR__ . '/includes/regular-customer.php';
try {
    if (!defined('DROP_CARS_DB_OPTIONAL')) {
        define('DROP_CARS_DB_OPTIONAL', true);
    }
    if (!isset($pdo) || !$pdo instanceof PDO) {
        require_once __DIR__ . '/../config/env.php';
        require_once __DIR__ . '/../admin/config/database.php';
        if (function_exists('dropcars_get_db')) {
            $pdo = dropcars_get_db();
        }
        if ((!isset($pdo) || !$pdo instanceof PDO) && !empty($GLOBALS['db']) && $GLOBALS['db'] instanceof PDO) {
            $pdo = $GLOBALS['db'];
        }
    }
    if (!isset($pdo) || !$pdo instanceof PDO) {
        $dbSaveError = 'PDO connection null';
    }
    $dbSaved = false;
    if (isset($pdo) && $pdo instanceof PDO) {
        require_once __DIR__ . '/../admin/includes/enquiries-schema.php';
        dropcars_ensure_enquiries_columns($pdo);

        $distanceHint = (int) ($data['distanceHint'] ?? 0);
        $durationHint = htmlspecialchars($data['durationHint'] ?? '');

        // 1. Detect a repeat submission.
        //    A repeat = same customer name, same contact number, same pickup,
        //    same drop and same trip type, still sitting as an unconfirmed lead
        //    within the last 24h. Only the vehicle and fare type may differ.
        //    Changing the name, contact, pickup, drop or trip type is NOT a
        //    repeat - it is treated as a brand-new enquiry (its own lead + ID).
        $existingEnquiry = null;
        try {
            $stmtDup = $pdo->prepare("SELECT * FROM `enquiries`
                WHERE LOWER(TRIM(`name`)) = LOWER(TRIM(?)) AND `phone` = ? AND `pickup` = ? AND `drop_location` = ? AND `trip_type` = ?
                  AND `status` = 'not_confirmed' AND `created_at` >= NOW() - INTERVAL 1 DAY
                ORDER BY `id` DESC LIMIT 1");
            $stmtDup->execute([$customerName, $contactValue, $pickup, $drop, $tripType]);
            $existingEnquiry = $stmtDup->fetch(PDO::FETCH_ASSOC);
            
            if ($existingEnquiry) {
                // If travel date has changed, treat as a brand-new enquiry instead of duplicate
                $newDateStr = $travelDate ? date('Y-m-d', strtotime($travelDate)) : '';
                $existingDateStr = !empty($existingEnquiry['travel_date']) ? date('Y-m-d', strtotime($existingEnquiry['travel_date'])) : '';
                if ($newDateStr !== $existingDateStr) {
                    $existingEnquiry = null;
                }
            }
            
            if ($existingEnquiry) {
                // If stops have changed, treat as a brand-new enquiry instead of duplicate
                $existingBreakdown = json_decode((string) ($existingEnquiry['fare_breakdown'] ?? '[]'), true) ?: [];
                $existingStops = $existingBreakdown['stops'] ?? [];
                
                $newStops = is_array($stops) ? array_values(array_filter(array_map('trim', $stops))) : [];
                $oldStops = is_array($existingStops) ? array_values(array_filter(array_map('trim', $existingStops))) : [];
                
                if ($newStops !== $oldStops) {
                    $existingEnquiry = null;
                }
            }
        } catch (Throwable $ex) {
            error_log("Duplication lookup failed: " . $ex->getMessage());
        }

        if ($existingEnquiry) {
            // Repeat submission for an existing trip: merge into the existing
            // lead (no new admin row) and flag it so the email goes out as a
            // threaded reply rather than a brand-new standalone message.
            $isDuplicateSubmission = true;
            // Keep the same booking ID
            $bookingId = $existingEnquiry['booking_id'];

            // Merge estimates
            $existingEstimates = json_decode((string) ($existingEnquiry['vehicle_estimates'] ?? '[]'), true) ?: [];
            if (!is_array($existingEstimates)) {
                $existingEstimates = [];
            }
            $mergedEstimates = array_merge($existingEstimates, $estimatesForEmail);
            $veJson = json_encode($mergedEstimates);

            // Merge breakdowns
            $existingBreakdown = json_decode((string) ($existingEnquiry['fare_breakdown'] ?? '[]'), true) ?: [];
            if (!is_array($existingBreakdown)) {
                $existingBreakdown = [];
            }
            $mergedBreakdown = $existingBreakdown;
            if (!empty($fareBreakdown)) {
                if (empty($mergedBreakdown)) {
                    $mergedBreakdown = $fareBreakdown;
                } else {
                    $mergedBreakdown['vehicles'] = array_merge(
                        $existingBreakdown['vehicles'] ?? [],
                        $fareBreakdown['vehicles'] ?? []
                    );
                    if (isset($fareBreakdown['borderTransitions'])) {
                        $mergedBreakdown['borderTransitions'] = $fareBreakdown['borderTransitions'];
                    }
                }
            }
            $fbJson = !empty($mergedBreakdown) ? json_encode($mergedBreakdown) : null;

            // Update database row
            try {
                $sqlUpdate = "UPDATE `enquiries` SET
                    `name` = ?,
                    `travel_date` = ?,
                    `travel_time` = ?,
                    `vehicle_estimates` = ?,
                    `fare_estimate` = ?,
                    `fare_breakdown` = ?,
                    `vehicle_type` = ?,
                    `fare_type` = ?,
                    `ip_address` = ?,
                    `created_at` = NOW()
                    WHERE `id` = ?";
                $pdo->prepare($sqlUpdate)->execute([
                    $customerName,
                    $travelDate ?: $existingEnquiry['travel_date'],
                    $travelTime ?: $existingEnquiry['travel_time'],
                    $veJson,
                    $fareEstimate ?: $existingEnquiry['fare_estimate'],
                    $fbJson,
                    $selectedVehicle ?: $existingEnquiry['vehicle_type'],
                    $fareTypeRaw ?: ($existingEnquiry['fare_type'] ?? 'base'),
                    $clientIp,
                    $existingEnquiry['id']
                ]);
                $dbSaved = true;
            } catch (Throwable $e) {
                error_log("Failed to update duplicate enquiry: " . $e->getMessage());
            }

            // Sync updated variables for subsequent email/Telegram/logging actions
            $estimatesForEmail = $mergedEstimates;
            $fareBreakdown = $mergedBreakdown;
            
            // Regenerate breakdown HTML/plain/Telegram blocks
            if ($selectedVehicle !== '') {
                $breakdownHtml = dropcars_fare_breakdown_html($fareBreakdown, $selectedVehicle);
                $breakdownPlain = dropcars_fare_breakdown_plain($fareBreakdown, $selectedVehicle);
                $telegramFareBreakdownBlock = ($fareBreakdown !== []) ? dropcars_fare_breakdown_telegram_html($fareBreakdown, $selectedVehicle) : '';
            } else {
                $breakdownHtml = dropcars_fare_breakdown_html($fareBreakdown);
                $breakdownPlain = dropcars_fare_breakdown_plain($fareBreakdown);
                $telegramFareBreakdownBlock = ($fareBreakdown !== []) ? dropcars_fare_breakdown_telegram_html($fareBreakdown) : '';
            }
        } else {
            $websiteVal = trim((string) ($data['website'] ?? $data['domain'] ?? ''));
            if ($websiteVal === '') {
                $pUrl = trim((string) ($data['pageUrl'] ?? $_SERVER['HTTP_ORIGIN'] ?? $_SERVER['HTTP_REFERER'] ?? ''));
                if ($pUrl !== '') {
                    $parsedHost = parse_url($pUrl, PHP_URL_HOST);
                    if ($parsedHost) {
                        $websiteVal = preg_replace('/^www\./i', '', strtolower($parsedHost));
                    }
                }
            }
            if ($websiteVal === '' && !empty($_SERVER['HTTP_HOST'])) {
                $websiteVal = preg_replace('/^www\./i', '', strtolower($_SERVER['HTTP_HOST']));
            }
            if ($websiteVal === '' || $websiteVal === 'localhost' || stristr($websiteVal, '127.0.0.1')) {
                $websiteVal = 'dropcars.in';
            }

            $distanceHint = (int) ($data['distanceHint'] ?? $data['distance'] ?? $distance ?? 0);
            $durationHint = trim((string)($data['durationHint'] ?? $data['duration'] ?? ''));
            $veJson = !empty($estimatesForEmail) ? json_encode($estimatesForEmail) : null;
            $fbJson = !empty($fareBreakdown) ? json_encode($fareBreakdown) : null;

            $enquiryPayload = [
                'name' => $customerName,
                'phone' => $contactValue,
                'pickup' => $pickup,
                'drop_location' => $drop,
                'trip_type' => $tripType,
                'vehicle_type' => $selectedVehicle,
                'travel_date' => $travelDate ?: date('Y-m-d'),
                'travel_time' => $travelTime,
                'vehicle_estimates' => $veJson,
                'fare_estimate' => (int) $fareEstimate,
                'fare_type' => $fareTypeRaw,
                'distance_km' => $distanceHint,
                'duration' => $durationHint,
                'ip_address' => $clientIp,
                'source' => $normalizedSource,
                'utm_source' => $utmSource,
                'utm_medium' => $utmMedium,
                'utm_campaign' => $utmCampaign,
                'utm_term' => $utmTerm,
                'utm_content' => $utmContent,
                'device' => $deviceDb,
                'matchtype' => $matchtypeRaw,
                'gclid' => $gclid,
                'source_page' => $sourcePage,
                'status' => 'not_confirmed',
                'booking_id' => $bookingId,
                'fare_breakdown' => $fbJson,
                'website' => $websiteVal
            ];

            try {
                $existingCols = $pdo->query("SHOW COLUMNS FROM `enquiries`")->fetchAll(PDO::FETCH_COLUMN);
                $insertCols = [];
                $insertVals = [];
                $placeholders = [];
                foreach ($enquiryPayload as $colName => $colVal) {
                    if (in_array($colName, $existingCols, true)) {
                        $insertCols[] = "`{$colName}`";
                        $insertVals[] = $colVal;
                        $placeholders[] = '?';
                    }
                }
                if (!empty($insertCols)) {
                    $sqlInsert = "INSERT INTO `enquiries` (" . implode(', ', $insertCols) . ") VALUES (" . implode(', ', $placeholders) . ")";
                    $stmt = $pdo->prepare($sqlInsert);
                    $stmt->execute($insertVals);
                    $dbSaved = true;
                }
            } catch (PDOException $e) {
                error_log('[dropcars send-enquiry DB insert error] ' . $e->getMessage());
                $code = (int) $e->getCode();
                $msg = $e->getMessage();
                if ($code === 23000 || stripos($msg, 'Duplicate') !== false) {
                    for ($attempt = 0; $attempt < 8; $attempt++) {
                        $bookingId = dropcars_next_enquiry_booking_id($pdo, 'E');
                        $enquiryPayload['booking_id'] = $bookingId;
                        try {
                            $insertVals[array_search('`booking_id`', $insertCols)] = $bookingId;
                            $stmt->execute($insertVals);
                            $dbSaved = true;
                            break;
                        } catch (PDOException $e2) {
                            if (stripos($e2->getMessage(), 'Duplicate') === false && (int) $e2->getCode() !== 23000) {
                                throw $e2;
                            }
                            if ($attempt === 7) {
                                throw $e2;
                            }
                        }
                    }
                } else {
                    throw $e;
                }
            }
        }

        // Optional free-text message (e.g. from the Contact Us page form,
        // which has no other field for a customer's written query) - stored
        // into dispatcher_notes so staff see it on the enquiry. Additive
        // only: never overwrites existing dispatcher notes, and failure here
        // must not affect the already-saved enquiry above.
        $customerMessage = trim((string) ($data['message'] ?? ''));
        if ($customerMessage !== '' && $dbSaved && $bookingId !== '') {
            try {
                $noteStmt = $pdo->prepare("UPDATE `enquiries` SET `dispatcher_notes` = CONCAT(COALESCE(`dispatcher_notes`, ''), ?) WHERE `booking_id` = ?");
                $noteStmt->execute(["[Customer message] " . $customerMessage, $bookingId]);
            } catch (Throwable $e) {
                error_log('send-enquiry.php - failed to save customer message: ' . $e->getMessage());
            }
        }

        $isRegularCustomer = dropcars_is_regular_customer($pdo, strip_tags($contactValue));
        
        // Trigger customer enquiry notifications using the central notification engine
        try {
            require_once __DIR__ . '/../includes/notification-engine.php';
            dropcars_dispatch_notifications($pdo, $bookingId, 'enquiry');
        } catch (\Throwable $e) {
            error_log('send-enquiry.php - Central customer notification dispatch failed: ' . $e->getMessage());
        }

        // Push alert to the Admin App - the original ask behind building the
        // enquiry-management mirror there in the first place.
        try {
            require_once __DIR__ . '/../admin/includes/push-notify.php';
            dropcars_send_admin_push_notification(
                $pdo,
                'New Enquiry',
                trim(($customerName ?: 'Guest') . ' - ' . ($pickup ?: '?') . ' to ' . ($drop ?: '?')),
                ['type' => 'enquiry', 'booking_id' => $bookingId]
            );
        } catch (\Throwable $e) {
            error_log('send-enquiry.php - Admin push notification failed: ' . $e->getMessage());
        }
    }
} catch (\Throwable $e) {
    $dbSaveError = $e->getMessage() . ' at ' . $e->getFile() . ':' . $e->getLine();
    error_log('Database save enquiry error: ' . $dbSaveError);
}

$sheetEnquiryRow = null;
if (isset($pdo) && $pdo instanceof PDO) {
    try {
        $sheetStmt = $pdo->prepare('SELECT * FROM `enquiries` WHERE `booking_id` = ? LIMIT 1');
        $sheetStmt->execute([(string) $bookingId]);
        $sheetEnquiryRow = $sheetStmt->fetch(PDO::FETCH_ASSOC) ?: null;
    } catch (Throwable $e) {
        error_log('Drop Cars send-enquiry sheet row fetch error: ' . $e->getMessage());
    }
}

if ($bookingId !== $idBeforeDb) {
    $subject = str_replace($idBeforeDb, $bookingId, $subject);
    $bodyHtml = str_replace($idBeforeDb, $bookingId, $bodyHtml);
    $bodyPlain = str_replace($idBeforeDb, $bookingId, $bodyPlain);
    $trackingLink = str_replace($idBeforeDb, $bookingId, $trackingLink);
}

$emailSent = false;
$enableEmail = $config['enableEmailNotifications_Admin'] ?? true;
if ($enableEmail && $appPassword) {
    $threadContactRaw = strtolower(trim(strip_tags((string) $contactValue)));
    if ($threadContactRaw === '' || $threadContactRaw === 'n/a') {
        $threadContactRaw = strtolower(trim(strip_tags((string) $customerName)));
    }
    $pickupPlain = trim((string) ($data['pickup'] ?? ''));
    $dropPlain = trim((string) ($dropSource ?: ''));
    $pickupClean = strtolower(preg_replace('/[^a-z0-9]/', '', $pickupPlain));
    $dropClean = strtolower(preg_replace('/[^a-z0-9]/', '', $dropPlain));
    $threadKeySource = preg_replace('/\s+/', '', $threadContactRaw) . '||' . $pickupClean . '||' . $dropClean;
    if ($threadKeySource === '||||') {
        $threadKeySource = 'unknown';
    }
    $threadHash = substr(sha1($threadKeySource), 0, 24);
    $mailDomain = 'dropcars.in';
    if (!empty($mailFrom) && strpos($mailFrom, '@') !== false) {
        $mailDomain = substr(strrchr($mailFrom, '@'), 1);
    }
    $threadRootMessageId = '<trip-thread-' . $threadHash . '@' . $mailDomain . '>';
    $currentMessageId = '<enquiry-' . preg_replace('/[^A-Za-z0-9]/', '', (string) $bookingId) . '-' . uniqid('', true) . '@' . $mailDomain . '>';

    // Thread grouping: the first email for a trip owns the thread-root
    // Message-ID; any later repeat submission replies into that same thread so
    // they group together in the inbox like a conversation.
    if ($isDuplicateSubmission) {
        $emailSubject = 'Re: ' . $subject;
        $outgoingMessageId = $currentMessageId;
        $replyToThreadRoot = true;
        $dupBannerHtml = '<div style="background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;padding:10px 14px;border-radius:10px;margin-bottom:12px;font-size:13px;font-weight:700;">&#128257; Repeat enquiry for the same trip &mdash; updated on existing lead ' . htmlspecialchars((string) $bookingId) . '.</div>';
        $bodyHtml = str_replace('<div class="container">', '<div class="container">' . $dupBannerHtml, $bodyHtml);
        $bodyPlain = "[Repeat enquiry for the same trip - updated on existing lead {$bookingId}]\n\n" . $bodyPlain;
    } else {
        $emailSubject = $subject;
        $outgoingMessageId = $threadRootMessageId;
        $replyToThreadRoot = false;
    }

    $phpmailerPath = __DIR__ . '/phpmailer/src/PHPMailer.php';
    // Local dev (php -S built-in server) is single-threaded; a blocking SMTP
    // handshake would stall every other request. Email also can't authenticate
    // from localhost. Skip the actual send on the dev server.
    if (php_sapi_name() === 'cli-server') {
        $emailSent = false;
        error_log('[dropcars] Skipping SMTP send on built-in dev server (cli-server).');
    } else {
        $customHeaders = [
            'Message-ID' => $outgoingMessageId,
            'X-DropCars-Thread-Key' => $threadHash,
            'X-Entity-Ref-ID' => 'enquiry-' . $bookingId . '-' . uniqid(),
        ];
        if ($replyToThreadRoot) {
            $customHeaders['In-Reply-To'] = $threadRootMessageId;
            $customHeaders['References'] = $threadRootMessageId;
        }

        $mailRes = dropcars_send_mail_with_fallback(
            $smtp,
            __DIR__ . '/phpmailer/src',
            $mailTo,
            $emailSubject,
            $bodyHtml,
            $bodyPlain,
            $customHeaders,
            $config
        );

        if ($mailRes['ok']) {
            $emailSent = true;
        } else {
            error_log("Drop Cars send-enquiry mail failed: " . $mailRes['error']);
        }
    }
}

$telegramSent = false;
$enableTelegram = $config['enableTelegramNotifications_Admin'] ?? true;
if ($enableTelegram) {
    require_once __DIR__ . '/telegram-notify.php';
    require_once __DIR__ . '/telegram-customer-message.php';
    $telegramToken = defined('TELEGRAM_BOT_TOKEN') ? TELEGRAM_BOT_TOKEN : (getenv('TELEGRAM_BOT_TOKEN') ?: ($config['telegramBotToken'] ?? ''));
    $telegramChatIds = [];
    if (defined('TELEGRAM_CHAT_ID') && trim(TELEGRAM_CHAT_ID) !== '') {
        $telegramChatIds[] = trim(TELEGRAM_CHAT_ID);
    } elseif (getenv('TELEGRAM_CHAT_ID') !== false && trim(getenv('TELEGRAM_CHAT_ID')) !== '') {
        $telegramChatIds[] = trim(getenv('TELEGRAM_CHAT_ID'));
    }
    if (isset($config['telegramChatIds']) && is_array($config['telegramChatIds'])) {
        $telegramChatIds = array_values(array_unique(array_merge($telegramChatIds, $config['telegramChatIds'])));
    }
    if ($telegramToken !== '' && !empty($telegramChatIds)) {
        $vehicleTypeDisplay = (string) ($vehicleType ?: 'Not Selected');
        $managementLink = "https://dropcars.in/admin/enquiries?search=" . urlencode($bookingId);
        $customerEmailRaw = (string) ($data['contactEmail'] ?? $data['email'] ?? '');
        $telegramHtml = dropcars_telegram_enquiry_admin_html(
            (string) $bookingId,
            strip_tags($customerName),
            strip_tags($contactValue) . ($whatsappValue !== '' ? ' (WA: ' . strip_tags($whatsappValue) . ')' : ''),
            $tripLabel,
            strip_tags($pickup),
            strip_tags($drop),
            (string) $travelDate,
            (string) $travelTime,
            $vehicleTypeDisplay,
            is_array($stops) ? $stops : [],
            $estimatesForEmail,
            $vehicleMeta,
            $hasSingleVehicleEstimate,
            $selectedEstimateVehicleKey,
            $fareTypeRaw,
            $telegramFareBreakdownBlock,
            $isRegularCustomer,
            $managementLink,
            $pageDisplayName,
            $normalizedSource,
            $customerEmailRaw
        );
        $telegramButtons = dropcars_telegram_enquiry_admin_buttons(
            (string) $bookingId,
            strip_tags($contactValue),
            $customerEmailRaw,
            $config['websiteUrl'] ?? 'https://dropcars.in'
        );
        if (dropcars_telegram_send_html($telegramToken, $telegramChatIds, $telegramHtml, $telegramButtons)) {
            $telegramSent = true;
        }
    }
}

$appendBookingLog = function (array $entry) {
    $storageDir = __DIR__ . '/storage';
    if (!is_dir($storageDir)) {
        @mkdir($storageDir, 0775, true);
    }
    $logFile = $storageDir . '/bookings-log.jsonl';
    @file_put_contents($logFile, json_encode($entry, JSON_UNESCAPED_UNICODE) . PHP_EOL, FILE_APPEND | LOCK_EX);
};

$logEntry = [
    'type' => 'ENQUIRY',
    'bookingId' => $bookingId,
    'tripType' => $tripType ?? 'enquiry',
    'name' => strip_tags($customerName) ?? '',
    'phone' => strip_tags($contactValue) ?? '',
    'customerName' => strip_tags($customerName),
    'contact' => strip_tags($contactValue),
    'pickup' => strip_tags($pickup),
    'drop' => strip_tags($drop),
    'travelDate' => $travelDate,
    'travelTime' => $travelTime,
    'vehicleType' => $vehicleType,
    'fareEstimate' => $fareEstimate,
    'serviceType' => $tripType,
    'ip' => $clientIp,
    'source' => $data['source'] ?? 'organic',
    'utmSource' => $data['utmSource'] ?? '',
    'utmMedium' => $data['utmMedium'] ?? '',
    'utmCampaign' => $data['utmCampaign'] ?? '',
    'gclid' => $data['gclid'] ?? '',
    'status' => 'enquiry',
    'emailSent' => $emailSent,
    'telegramSent' => $telegramSent,
    'is_regular_customer' => $isRegularCustomer,
    'createdAt' => date('c')
];
$appendBookingLog($logEntry);

try {
    $sheetPayloadRow = is_array($sheetEnquiryRow) ? $sheetEnquiryRow : [];
    $sheetPayloadRow['created_at'] = $sheetPayloadRow['created_at'] ?? date('c');
    $sheetPayloadRow['booking_id'] = $sheetPayloadRow['booking_id'] ?? (string) $bookingId;
    $sheetPayloadRow['status'] = $sheetPayloadRow['status'] ?? 'enquiry';
    $sheetPayloadRow['name'] = $sheetPayloadRow['name'] ?? strip_tags($customerName);
    $sheetPayloadRow['phone'] = $sheetPayloadRow['phone'] ?? strip_tags($contactValue);
    $sheetPayloadRow['trip_type'] = $sheetPayloadRow['trip_type'] ?? $tripType;
    $sheetPayloadRow['pickup'] = $sheetPayloadRow['pickup'] ?? strip_tags($pickup);
    $sheetPayloadRow['via_locations'] = $sheetPayloadRow['via_locations'] ?? (is_array($stops) ? implode(' | ', $stops) : '');
    $sheetPayloadRow['drop_location'] = $sheetPayloadRow['drop_location'] ?? strip_tags($drop);
    $sheetPayloadRow['travel_date'] = $sheetPayloadRow['travel_date'] ?? (string) $travelDate;
    $sheetPayloadRow['travel_time'] = $sheetPayloadRow['travel_time'] ?? (string) $travelTime;
    $sheetPayloadRow['return_date'] = $sheetPayloadRow['return_date'] ?? (string) ($data['endDate'] ?? '');
    $sheetPayloadRow['return_time'] = $sheetPayloadRow['return_time'] ?? (string) ($data['dropTime'] ?? '');
    $sheetPayloadRow['trip_days'] = $sheetPayloadRow['trip_days'] ?? (string) ($data['tripDays'] ?? '');
    $sheetPayloadRow['vehicle_type'] = $sheetPayloadRow['vehicle_type'] ?? (string) $vehicleType;
    $sheetPayloadRow['distance_km'] = $sheetPayloadRow['distance_km'] ?? ($data['distanceHint'] ?? 0);
    $sheetPayloadRow['fare_estimate'] = $sheetPayloadRow['fare_estimate'] ?? $fareEstimate;
    $sheetPayloadRow['final_fare'] = $sheetPayloadRow['final_fare'] ?? '';
    $sheetPayloadRow['discount_amount'] = $sheetPayloadRow['discount_amount'] ?? '';
    $sheetPayloadRow['fare_type'] = $sheetPayloadRow['fare_type'] ?? $fareTypeRaw;
    $sheetPayloadRow['driver_name'] = $sheetPayloadRow['driver_name'] ?? '';
    $sheetPayloadRow['driver_phone'] = $sheetPayloadRow['driver_phone'] ?? '';
    $sheetPayloadRow['car_number'] = $sheetPayloadRow['car_number'] ?? '';
    $sheetPayloadRow['source'] = $sheetPayloadRow['source'] ?? ($data['source'] ?? 'organic');
    $sheetPayloadRow['utm_source'] = $sheetPayloadRow['utm_source'] ?? ($data['utmSource'] ?? '');
    $sheetPayloadRow['utm_medium'] = $sheetPayloadRow['utm_medium'] ?? ($data['utmMedium'] ?? '');
    $sheetPayloadRow['utm_campaign'] = $sheetPayloadRow['utm_campaign'] ?? ($data['utmCampaign'] ?? '');
    $sheetPayloadRow['gclid'] = $sheetPayloadRow['gclid'] ?? ($data['gclid'] ?? '');
$googleSheetSent = false;
if ($config['enableGoogleSheetSync'] ?? true) {
    try {
        require_once __DIR__ . '/../includes/google-sheet-sync.php';
        
        $sheetPayload = [
            'bookingId' => $bookingId,
            'tripType' => $tripType,
            'status' => 'Enquiry',
            'name' => $customerName,
            'phone' => $contactValue,
            'leadType' => 'Enquiry',
            'pickup' => $pickup,
            'drop' => $drop,
            'source' => $data['source'] ?? 'organic',
            'ip' => $_SERVER['REMOTE_ADDR'] ?? '',
            'fareType' => $fareTypeRaw,
            'estFare' => $hasSingleVehicleEstimate ? ($estimatesForEmail[$selectedEstimateVehicleKey]['totalFare'] ?? '') : '',
            'loyaltyStatus' => $isRegularCustomer ? 'Regular' : '',
        ];

        if (sendToGoogleSheet($sheetPayload)) {
            $googleSheetSent = true;
        }
    } catch (Throwable $e) {
        error_log('Google Sheet Sync Error: ' . $e->getMessage());
    }
}
} catch (Throwable $e) {
    error_log('Drop Cars send-enquiry Google Sheet sync error: ' . $e->getMessage());
}

// NOTE: This endpoint already persists the complete enquiry (with travel time,
// fare estimate, vehicle and booking id) directly to the `enquiries` table above.
// Forwarding to the legacy ADMIN_ENQUIRY_API (admin/api/receive-enquiry.php) wrote
// a SECOND, stripped-down row (no time/fare/vehicle/booking_id), which surfaced in
// the admin dashboard as a duplicate "₹0 / 05:30 AM" lead. The forward is removed
// to keep a single source of truth.

// ── Post to the driver/vendor app marketplace, pending admin approval ──────
// An enquiry is an earlier-stage lead than a full confirm_booking.php
// booking, but the owner wants the same safety net: it still goes in as
// PENDING, still sits in the same admin-review window, and still only
// auto-posts to drivers if untouched after that timer - same as confirm_booking.php.
// A vague enquiry with no real route/phone is NOT posted (nothing for a driver
// to act on yet); only ones with a real phone + pickup + drop are.
if (($data['source'] ?? '') !== 'admin') {
    try {
        require_once __DIR__ . '/includes/backend-client.php';

        $enquiryPhoneDigits = preg_replace('/[^\d]/', '', (string) $contactValue);
        $hasRealRoute = ($pickup !== 'N/A' && $drop !== 'N/A' && $pickup !== '' && $drop !== '');

        if ($enquiryPhoneDigits !== '' && $hasRealRoute) {
            $enquiryTripTypeMap = [
                'one_way' => 'Oneway',
                'oneway' => 'Oneway',
                'round_trip' => 'Round Trip',
                'roundtrip' => 'Round Trip',
                'hourly' => 'Hourly Rental',
                'local' => 'Hourly Rental',
                'local_package' => 'Hourly Rental',
                'hourly_rental' => 'Hourly Rental',
                'multi_city' => 'Multy City',
                'multicity' => 'Multy City',
            ];
            $enquiryBackendTripType = $enquiryTripTypeMap[strtolower((string) $tripType)] ?? 'Oneway';

            $enquiryCarTypeMap = [
                'SEDAN' => 'SEDAN_4_PLUS_1',
                'SUV' => 'SUV',
                'INNOVA' => 'INNOVA',
                'CRYSTA' => 'INNOVA_CRYSTA',
            ];
            $enquiryVehicleKey = strtoupper(trim((string) $vehicleType));
            $enquiryBackendCarType = 'SEDAN_4_PLUS_1';
            foreach ($enquiryCarTypeMap as $needle => $mapped) {
                if (stripos($enquiryVehicleKey, $needle) !== false) {
                    $enquiryBackendCarType = $mapped;
                    break;
                }
            }

            $enquiryStartDateTime = date('c');
            if (!empty($travelDate)) {
                $ts = strtotime($travelDate . ' ' . ($travelTime ?: '00:00'));
                if ($ts !== false) {
                    $enquiryStartDateTime = date('c', $ts);
                }
            }

            $enquiryCustomerEmail = trim((string) ($data['contactEmail'] ?? ''));

            $enquiryBackendResult = dropcars_backend_request('POST', '/api/website/bookings', [
                'customer_name' => $customerName !== 'N/A' ? strip_tags($customerName) : 'Guest',
                'customer_number' => $enquiryPhoneDigits,
                'customer_email' => $enquiryCustomerEmail !== '' ? $enquiryCustomerEmail : null,
                'pickup_drop_location' => ['0' => strip_tags($pickup), '1' => strip_tags($drop)],
                'trip_type' => $enquiryBackendTripType,
                'car_type' => $enquiryBackendCarType,
                'start_date_time' => $enquiryStartDateTime,
                'is_urgent' => false,
                // A soft lead, not a committed booking - stays pending until
                // someone explicitly confirms it, never auto-posts on a timer.
                'is_enquiry' => true,
            ]);

            if ($enquiryBackendResult['ok'] && is_array($enquiryBackendResult['data'])) {
                $enquiryBackendRequestId = $enquiryBackendResult['data']['id'] ?? null;
                if ($enquiryBackendRequestId && isset($pdo) && $pdo instanceof PDO) {
                    try {
                        $pdo->prepare("UPDATE `enquiries` SET `backend_request_id` = ? WHERE `booking_id` = ?")
                            ->execute([(string) $enquiryBackendRequestId, (string) $bookingId]);
                    } catch (Throwable $e) {
                        // enquiries table may not have this column on older installs - non-fatal
                        error_log('Drop Cars send-enquiry: could not store backend_request_id: ' . $e->getMessage());
                    }
                }
            } else {
                error_log('Drop Cars send-enquiry backend posting failed: ' . ($enquiryBackendResult['error'] ?? 'unknown error'));
            }
        }
    } catch (Throwable $e) {
        error_log('Drop Cars send-enquiry backend posting exception: ' . $e->getMessage());
    }
}

if (ob_get_length()) ob_end_clean();
echo json_encode([
    'v' => '20261003_SUPPORT_SMTP_V1',
    'success' => $dbSaved || $emailSent || $telegramSent || (isset($data['source']) && $data['source'] === 'admin'),
    'emailSent' => $emailSent,
    'telegramSent' => $telegramSent,
    'bookingId' => $bookingId,
    'dbSaved' => $dbSaved,
    'dbError' => $dbSaveError,
    'emailSubject' => $emailSubject ?? $subject,
    'mailAccountUsed' => $mailRes['account_used'] ?? 'none',
    'mailError' => $mailRes['error'] ?? '',
    'resolvedSmtpUser' => $smtp['smtpUser'] ?? '',
    'resolvedMailFrom' => $smtp['mailFrom'] ?? '',
    'message' => $emailSent ? 'Notification sent.' : 'Response captured.'
]);

