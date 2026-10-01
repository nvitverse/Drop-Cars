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
 * Drop Cars – Booking confirmation (Email + Telegram)
 * Called when user clicks "Book Drop Taxi Now" after fare calculation.
 * Uses Drop Cars credentials only (config.php).
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
// deep inside the booking logic below.
if (!function_exists('dropcars_confirm_booking_fatal_json')) {
    function dropcars_confirm_booking_fatal_json($message = 'An unexpected error occurred. Please try again.') {
        if (ob_get_length()) { @ob_end_clean(); }
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode(['success' => false, 'message' => $message]);
    }
}
set_exception_handler(function ($e) {
    error_log('Drop Cars confirm_booking uncaught exception: ' . $e->getMessage());
    dropcars_confirm_booking_fatal_json();
    exit;
});
register_shutdown_function(function () {
    $err = error_get_last();
    if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        error_log('Drop Cars confirm_booking fatal error: ' . $err['message']);
        dropcars_confirm_booking_fatal_json();
    }
});

if (session_status() === PHP_SESSION_NONE) {
    require_once __DIR__ . '/../config/session.php';
    session_start();
}

require_once __DIR__ . '/../config/security.php';
dropcars_rate_limit('api_confirm', 15, 60);
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
require_once __DIR__ . '/../includes/google-sheet-sync.php';
require_once __DIR__ . '/smtp-settings.php';

$smtp = dropcars_resolve_smtp($config, $isExampleConfig);
$mailFrom = $smtp['mailFrom'];
$mailTo = $smtp['mailTo'];
$mailFromName = $smtp['mailFromName'];
$appPassword = $smtp['appPassword'];

$bookingData = $data['booking_data'] ?? $data;
$bookingIdRaw = preg_replace('/[^A-Za-z0-9]/', '', (string) ($bookingData['bookingId'] ?? ''));
$bookingId = strtoupper($bookingIdRaw);

if (strpos($bookingId, 'DE') === 0) {
    $bookingId = 'C' . substr($bookingId, 2);
} elseif (strpos($bookingId, 'E') === 0) {
    $bookingId = 'C' . substr($bookingId, 1);
} elseif (strpos($bookingId, 'DC') === 0) {
    $bookingId = 'C' . substr($bookingId, 2);
}

if (!defined('DROP_CARS_DB_OPTIONAL')) {
    define('DROP_CARS_DB_OPTIONAL', true);
}
require_once __DIR__ . '/../admin/config/database.php';
if (function_exists('dropcars_get_db')) {
    $pdo = dropcars_get_db();
} elseif ((!isset($pdo) || !$pdo instanceof PDO) && !empty($GLOBALS['db']) && $GLOBALS['db'] instanceof PDO) {
    $pdo = $GLOBALS['db'];
}

$needNewId = !preg_match('/^C\d{8,}$/', $bookingId);

// Check if booking ID already exists in DB to prevent overwriting
if (!$needNewId && isset($pdo) && $pdo instanceof PDO) {
    $stmtCheck = $pdo->prepare("SELECT COUNT(*) FROM `bookings` WHERE `booking_id` = ? LIMIT 1");
    $stmtCheck->execute([$bookingId]);
    if ((int)$stmtCheck->fetchColumn() > 0) {
        $needNewId = true;
    }
}

if ($needNewId) {
    require_once __DIR__ . '/../admin/includes/enquiries-schema.php';
    $bookingId = dropcars_next_enquiry_booking_id(isset($pdo) && $pdo instanceof PDO ? $pdo : null, 'C');
}
$customerName = htmlspecialchars($bookingData['customerName'] ?? 'N/A');
$contactValue = htmlspecialchars(
    (!empty($bookingData['customerPhone']) && trim($bookingData['customerPhone']) !== '')
        ? $bookingData['customerPhone']
        : ($bookingData['customerEmail'] ?? 'N/A')
);

if (function_exists('dropcars_check_blocked_phone')) {
    dropcars_check_blocked_phone($contactValue);
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
$pickup = htmlspecialchars($bookingData['pickupLocation'] ?? $bookingData['pickup'] ?? 'N/A');
$drop = htmlspecialchars($bookingData['dropLocation'] ?? $bookingData['drop'] ?? 'N/A');
$bookingType = $bookingData['bookingType'] ?? 'ONE_WAY';
$serviceType = (string) ($bookingData['serviceType'] ?? '');
$airportSubtype = (string) ($bookingData['airportSubtype'] ?? '');
$airportLocalMinOverride = ($serviceType === 'airport_transfer' && $airportSubtype === 'local') ? 20.0 : null;
$vehicleType = $bookingData['vehicleType'] ?? 'Sedan';
$fareEstimate = (int) ($bookingData['estimatedFare'] ?? 0);
$travelDate = $bookingData['pickupDate'] ?? $bookingData['travelDate'] ?? '';
$travelTime = $bookingData['pickupTime'] ?? $bookingData['travelTime'] ?? '';
$distance = (float) ($bookingData['distance'] ?? 0);
$discountAmount = (int) ($bookingData['discount_amount'] ?? 0);
$finalFare = (int) ($bookingData['final_fare'] ?? $fareEstimate);
$customerEmailRaw = trim((string) ($bookingData['customerEmail'] ?? $bookingData['contactEmail'] ?? ''));

// Email is optional for customer bookings. If provided, validate format.
if (($bookingData['source'] ?? '') !== 'admin') {
    if ($customerEmailRaw !== '' && strpos($customerEmailRaw, '@') < 1) {
        if (ob_get_length()) ob_end_clean();
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'message' => 'Please enter a valid email address.',
        ]);
        exit;
    }
}
$pickupPlain = trim((string) ($bookingData['pickupLocation'] ?? $bookingData['pickup'] ?? ''));
$dropPlain = trim((string) ($bookingData['dropLocation'] ?? $bookingData['drop'] ?? ''));

// Live pickup coordinates (from GPS "Use current location" or an exact map
// selection, captured client-side in location-picker.js). When present, a
// Google Maps link is included in the confirmation email so the assigned
// driver can navigate straight to the exact spot rather than relying on the
// typed address alone.
$pickupLat = isset($bookingData['pickupLat']) ? (float) $bookingData['pickupLat'] : null;
$pickupLng = isset($bookingData['pickupLng']) ? (float) $bookingData['pickupLng'] : null;
$pickupMapsLink = ($pickupLat !== null && $pickupLng !== null && $pickupLat >= -90 && $pickupLat <= 90 && $pickupLng >= -180 && $pickupLng <= 180)
    ? 'https://www.google.com/maps?q=' . $pickupLat . ',' . $pickupLng
    : null;
$customerNamePlain = trim((string) ($bookingData['customerName'] ?? 'Guest'));
$fareType = (string) ($bookingData['fareType'] ?? 'base');

$isInclusive = ($fareType === 'inclusive');
$includeTolls = isset($bookingData['includeTolls']) ? (bool)$bookingData['includeTolls'] : (isset($bookingData['fareBreakdown']['includeTolls']) ? (bool)$bookingData['fareBreakdown']['includeTolls'] : $isInclusive);
$includeTaxes = isset($bookingData['includeTaxes']) ? (bool)$bookingData['includeTaxes'] : (isset($bookingData['fareBreakdown']['includeTaxes']) ? (bool)$bookingData['fareBreakdown']['includeTaxes'] : $isInclusive);

$fareBreakdown = [];
if (isset($bookingData['fareBreakdown']) && is_array($bookingData['fareBreakdown'])) {
    $fareBreakdown = $bookingData['fareBreakdown'];
    $fareBreakdown['fareType'] = $fareType;
    $fareBreakdown['includeTolls'] = $includeTolls;
    $fareBreakdown['includeTaxes'] = $includeTaxes;
}

$selectedVehicleKey = strtoupper(trim((string)($bookingData['vehicleType'] ?? '')));
$mappedKey = '';
if (stripos($selectedVehicleKey, 'SEDAN') !== false) $mappedKey = 'SEDAN';
elseif (stripos($selectedVehicleKey, 'SUV') !== false) $mappedKey = 'SUV';
elseif (stripos($selectedVehicleKey, 'INNOVA') !== false) $mappedKey = 'INNOVA';
elseif (stripos($selectedVehicleKey, 'CRYSTA') !== false) $mappedKey = 'CRYSTA';

// Server-side fare sanity check: the client used to be trusted verbatim for
// estimatedFare/final_fare, which meant a direct POST could set any price.
// Admin-created bookings (source=admin) are exempt - an admin typing a
// manually-negotiated fare in the admin panel isn't "tampering".
if (($bookingData['source'] ?? '') !== 'admin' && $mappedKey !== '') {
    require_once __DIR__ . '/includes/fare-validator.php';
    $submittedHours = (int) ($bookingData['fareBreakdown']['hours'] ?? 0);
    $fareCheck = dropcars_validate_submitted_fare(
        $distance,
        $mappedKey,
        (string) $bookingType,
        (int) ($bookingData['tripDays'] ?? 1),
        (float) $finalFare,
        $airportLocalMinOverride,
        $submittedHours
    );
    if (!$fareCheck['ok']) {
        error_log('Drop Cars confirm_booking fare validation failed: ' . $fareCheck['reason']);
        if (ob_get_length()) ob_end_clean();
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'message' => 'The submitted fare could not be verified. Please recalculate the fare and try again.',
        ]);
        exit;
    }
}

require_once __DIR__ . '/fare-breakdown-format.php';
if ($mappedKey !== '') {
    $breakdownHtml = dropcars_fare_breakdown_html($fareBreakdown, $mappedKey);
    $breakdownPlain = dropcars_fare_breakdown_plain($fareBreakdown, $mappedKey);
    $telegramFareBreakdownBlock = ($fareBreakdown !== []) ? dropcars_fare_breakdown_telegram_html($fareBreakdown, $mappedKey) : '';
} else {
    $breakdownHtml = dropcars_fare_breakdown_html($fareBreakdown);
    $breakdownPlain = dropcars_fare_breakdown_plain($fareBreakdown);
    $telegramFareBreakdownBlock = ($fareBreakdown !== []) ? dropcars_fare_breakdown_telegram_html($fareBreakdown) : '';
}

$bookingTypeLabels = [
    'ONE_WAY' => 'One-Way Drop',
    'ROUND_TRIP' => 'Round Trip',
    'LOCAL_PACKAGE' => 'Hourly Rental',
];
$tripLabel = $bookingTypeLabels[$bookingType] ?? $bookingType;

require_once __DIR__ . '/../includes/page-name-resolver.php';

$pageTitleRaw  = trim((string) ($bookingData['pageTitle'] ?? ''));
$sourcePageRaw = trim((string) ($bookingData['source_page'] ?? $bookingData['sourcePage'] ?? ''));
$pageUrlRaw    = trim((string) ($bookingData['pageUrl'] ?? ''));

$urlQuery = [];
if ($pageUrlRaw !== '') {
    $parsedQueryStr = parse_url($pageUrlRaw, PHP_URL_QUERY);
    if ($parsedQueryStr) {
        parse_str($parsedQueryStr, $urlQuery);
    }
}

$rawSource     = $bookingData['source'] ?? '';
$gclid         = trim((string) ($bookingData['gclid'] ?? $urlQuery['gclid'] ?? ''));
$gadCampaignId = trim((string) ($bookingData['gadCampaignId'] ?? $urlQuery['gad_campaignid'] ?? ''));
$gadSource     = trim((string) ($urlQuery['gad_source'] ?? ''));
$gbraid        = trim((string) ($bookingData['gbraid'] ?? $urlQuery['gbraid'] ?? ''));
$wbraid        = trim((string) ($bookingData['wbraid'] ?? $urlQuery['wbraid'] ?? ''));
$utmSource     = trim((string) ($bookingData['utmSource'] ?? $bookingData['utm_source'] ?? $urlQuery['utm_source'] ?? ''));
$utmMedium     = trim((string) ($bookingData['utmMedium'] ?? $bookingData['utm_medium'] ?? $urlQuery['utm_medium'] ?? ''));
$rawCampaign = trim((string) (
    $bookingData['campaignname'] ?? $urlQuery['campaignname'] ??
    $bookingData['_campaignname'] ?? $urlQuery['_campaignname'] ??
    $bookingData['campaign'] ?? $urlQuery['campaign'] ??
    $bookingData['_campaign'] ?? $urlQuery['_campaign'] ??
    $bookingData['utmCampaign'] ?? $bookingData['utm_campaign'] ?? $urlQuery['utm_campaign'] ?? ''
));
if ($rawCampaign === '' || strtolower($rawCampaign) === 'none' || $rawCampaign === '{_campaign}' || $rawCampaign === '{_campaignname}') {
    $rawCampaign = $gadCampaignId ?: trim((string) ($urlQuery['campaignid'] ?? ''));
}
$utmCampaign = $rawCampaign;

$rawContent = trim((string) (
    $bookingData['adgroupname'] ?? $urlQuery['adgroupname'] ??
    $bookingData['_adgroupname'] ?? $urlQuery['_adgroupname'] ??
    $bookingData['adgroup'] ?? $urlQuery['adgroup'] ??
    $bookingData['_adgroup'] ?? $urlQuery['_adgroup'] ??
    $bookingData['utmContent'] ?? $bookingData['utm_content'] ?? $urlQuery['utm_content'] ?? ''
));
if ($rawContent === '' || strtolower($rawContent) === 'none' || $rawContent === '{_adgroup}' || $rawContent === '{_adgroupname}') {
    $rawContent = trim((string) ($urlQuery['adgroupid'] ?? ''));
}
$utmContent = $rawContent;

$utmTerm       = trim((string) ($bookingData['utmTerm'] ?? $bookingData['utm_term'] ?? $urlQuery['utm_term'] ?? $urlQuery['keyword'] ?? ''));
if (strtolower($utmTerm) === 'none') $utmTerm = '';
$matchtypeRaw  = strtolower(trim((string) ($bookingData['matchtype'] ?? $urlQuery['matchtype'] ?? '')));
$deviceRaw     = strtolower(trim((string) ($bookingData['device'] ?? $urlQuery['device'] ?? '')));

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
$bookingData['source']      = $normalizedSource;
$bookingData['utmSource']   = $utmSource;
$bookingData['utmMedium']   = $utmMedium;
$bookingData['utmCampaign'] = $utmCampaign;
$bookingData['utmContent']  = $utmContent;
$bookingData['utmTerm']     = $utmTerm;
$bookingData['matchtype']   = $matchtypeRaw;
$bookingData['device']      = $deviceDb;
$bookingData['gclid']       = $gclid;

$pageMeta        = dropcars_resolve_page_name($sourcePageRaw, $pageUrlRaw, $serviceType, $pageTitleRaw);
$pageDisplayName = $pageMeta['name'];
$sourcePage      = $pageMeta['path'];
$isAirportFlag   = $pageMeta['isAirport'];

// ── Early client IP (needed in email body & WA links) ───────────────────────
$clientIp = trim(explode(',', (string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['HTTP_X_REAL_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? ''))[0] ?? '');

// ── Pre-compute inclusions / exclusions for WA driver message ────────────────
$waInclusionsText = 'Base Fare, Driver Allowance, Clean AC Cab';
if ($includeTolls)  $waInclusionsText .= ', Highway Tolls';
if ($includeTaxes)  $waInclusionsText .= ', State border tax (if crossing state border)';
$waExclusionsText = '';
if (!$includeTolls) $waExclusionsText .= 'Toll, ';
if (!$includeTaxes) $waExclusionsText .= 'State border tax, ';
$waExclusionsText .= 'Parking, Extra KM/Hour, Waiting Charges';

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

// ── WhatsApp share URL generation ───────────────────────────────────────────
$waPhone     = preg_replace('/[^\d]/', '', strip_tags($contactValue));
if (strlen($waPhone) === 10) $waPhone = '91' . $waPhone;
$waVehicle   = strtoupper(trim($vehicleType));
$waGroupDate = !empty($travelDate) ? date('d M Y', strtotime($travelDate)) : '';
$waPickTime  = $travelTime ? ', ' . $travelTime : '';
$waIsRound   = (stripos($bookingType, 'ROUND') !== false);
$waReturnDate = (!empty($bookingData['returnDate'])) ? date('d M Y', strtotime($bookingData['returnDate'])) : '';

// Per-km rate & driver bata for group message
$waPerKm = ''; $waDriverBata = '';
$_waTariffsPath = __DIR__ . '/../data/tariffs.json';
if (file_exists($_waTariffsPath)) {
    $_waTariffs  = json_decode(file_get_contents($_waTariffsPath), true) ?: [];
    $_waTTSearch = $waIsRound ? 'round' : 'oneway';
    foreach ($_waTariffs as $_wt) {
        if (strtoupper($_wt['vehicle_type'] ?? '') === $waVehicle && strtolower($_wt['trip_type'] ?? '') === $_waTTSearch) {
            $waPerKm = '₹' . ($_wt['per_km_rate'] ?? 15) . '/KM';
            break;
        }
    }
}

// Share Customer — confirmed booking message (real UTF-8 emoji)
$waVehicleDisplay = $waVehicle !== '' ? $waVehicle : 'Sedan';
$waCustomerMsg  = "🌟 *DROP CARS — BOOKING CONFIRMATION* 🌟\n";
$waCustomerMsg .= "_Your Trusted Outstation & Airport Cab Partner_\n\n";
$waCustomerMsg .= "Dear *" . strip_tags($customerName) . "*,\n\n";
$waCustomerMsg .= "Thank you for choosing *Drop Cars*! Here is your complete booking summary for reference:\n\n";
$waCustomerMsg .= "━━━━━━━━━━━━━━━━━━━\n🗺️ *TRIP DETAILS*\n━━━━━━━━━━━━━━━━━━━\n";
$waCustomerMsg .= "📌 *Booking ID:* *#" . $bookingId . "*\n";
$waCustomerMsg .= "📍 *Pickup Location:* " . strip_tags($pickup) . "\n";
$waCustomerMsg .= "🏁 *Drop Location:* " . strip_tags($drop) . "\n";
$waCustomerMsg .= "🚗 *Vehicle Choice:* " . $waVehicleDisplay . "\n";
$waCustomerMsg .= "💼 *Service Type:* " . $tripLabel . "\n";
if ($waGroupDate)  $waCustomerMsg .= "📅 *Pickup Date:* " . $waGroupDate . "\n";
if ($travelTime)   $waCustomerMsg .= "⏰ *Pickup Time:* " . $travelTime . "\n";
if ($waIsRound && $waReturnDate) $waCustomerMsg .= "📅 *Return Date:* " . $waReturnDate . "\n";

if ($finalFare > 0) {
    $waCustomerMsg .= "\n━━━━━━━━━━━━━━━━━━━\n💰 *FARE & BILLING SUMMARY*\n━━━━━━━━━━━━━━━━━━━\n";
    $waCustomerMsg .= "💵 *Estimated Total Fare:* *₹" . number_format($finalFare) . "* _(" . ($isInclusive ? 'All-Inclusive Fare' : 'Excl. Toll/Permit') . ")_\n";
    $waCustomerMsg .= "🛣️ *Min Coverage:* " . ($serviceType === 'airport_transfer' && ($airportSubtype ?? '') === 'local' ? '20 KM Local' : '130 KM Outstation Min') . "\n";
    $waCustomerMsg .= "👨‍✈️ *Driver Allowance (Bata):* Included in quote\n";
    $waCustomerMsg .= "💳 *Advance Paid:* *₹0* _(Pay driver directly via Cash / UPI)_\n";
    $waCustomerMsg .= "🧾 *Tolls & Permit:* " . ($isInclusive ? 'Toll, State Border Tax & GST included' : 'Paid extra as actuals') . "\n";
}

$waCustomerMsg .= "\n━━━━━━━━━━━━━━━━━━━\n🔗 *LIVE TRACKING & LINKS*\n━━━━━━━━━━━━━━━━━━━\n";
$waCustomerMsg .= "📍 *Live Driver & Trip Status:* https://dropcars.in/track-booking/" . $bookingId . "\n";
$waCustomerMsg .= "🗺️ *Explore Route Details:* " . get_route_explore_url($pickup, $drop) . "\n";
$waCustomerMsg .= "🔑 *Customer Portal:* https://dropcars.in/pages/customer-login.php\n";

$waCustomerMsg .= "\n━━━━━━━━━━━━━━━━━━━\n🚨 *24x7 CUSTOMER SUPPORT*\n━━━━━━━━━━━━━━━━━━━\n";
$waCustomerMsg .= "Need urgent updates or route changes?\n";
$waCustomerMsg .= "📞 *Call Directly:* +" . ($config['company']['phone'] ?? '917200217986') . "\n";
$waCustomerMsg .= "💬 *WhatsApp Chat:* https://wa.me/" . preg_replace('/\D/', '', ($config['company']['whatsapp'] ?? '917200217986')) . "\n\n";
$waCustomerMsg .= "_Have a safe and pleasant journey!_\n*— Drop Cars Team* 🙏";
$waCustomerUrl  = ($waPhone !== '' && $waPhone !== '91') ? 'https://wa.me/' . $waPhone . '?text=' . rawurlencode($waCustomerMsg) : '#';

// Share Group — broadcast announcement style
$waRateKmDisplay = $waPerKm !== '' ? $waPerKm : '₹15/KM';
$waBataDisplay = '₹300'; // Always show 300 only for drivers bata in group post

$waGroupMsg  = "🚖 *DROP CARS — VEHICLE REQUIREMENT* 🚖\n";
$waGroupMsg .= "_New outstation trip requirement posted. Please verify details and accept._\n\n";
if ($bookingId) $waGroupMsg .= "📌 *Booking ID:* *#" . $bookingId . "*\n";
$waGroupMsg .= "━━━━━━━━━━━━━━━━━━━\n🗺️ *TRIP INFORMATION*\n━━━━━━━━━━━━━━━━━━━\n";
$waGroupMsg .= "📍 *Pickup:* " . strip_tags($pickup) . "\n";
$waGroupMsg .= "🏁 *Drop Location:* " . strip_tags($drop) . "\n";
$waGroupMsg .= "🚗 *Required Vehicle:* " . $waVehicleDisplay . "\n";
$waGroupMsg .= "💼 *Trip Type:* " . $tripLabel . "\n";
if ($waGroupDate) $waGroupMsg .= "📅 *Date:* " . $waGroupDate . "\n";
if ($travelTime)  $waGroupMsg .= "⏰ *Reporting Time:* " . $travelTime . "\n";
if ($waIsRound && $waReturnDate) $waGroupMsg .= "📅 *Return Date:* " . $waReturnDate . "\n";
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


// Share Driver — full operational dispatch brief
$waDriverMsg  = "🚖 *DROP CARS — TRIP ASSIGNMENT* 🚖\n";
$waDriverMsg .= "_Please read carefully and reply ✅ to confirm this trip._\n\n";
$waDriverMsg .= "📌 *Booking ID:* *#" . $bookingId . "*\n";
$waDriverMsg .= "━━━━━━━━━━━━━━━━━━━\n👤 *PASSENGER CONTACT DETAILS*\n━━━━━━━━━━━━━━━━━━━\n";
$waDriverMsg .= "🙋 *Name:* " . strip_tags($customerName) . "\n";
$waDriverMsg .= "📞 *Phone:* " . strip_tags($formattedContact) . "\n\n";
$waDriverMsg .= "━━━━━━━━━━━━━━━━━━━\n🗺️ *TRIP INFORMATION*\n━━━━━━━━━━━━━━━━━━━\n";
$waDriverMsg .= "📍 *Pickup Address:* " . strip_tags($pickup) . "\n";
$waDriverMsg .= "🏁 *Drop Address:* " . strip_tags($drop) . "\n";
$waDriverMsg .= "🚗 *Vehicle Category:* " . $waVehicleDisplay . "\n";
$waDriverMsg .= "💼 *Trip Type:* " . $tripLabel . "\n";
if ($waGroupDate)  $waDriverMsg .= "📅 *Travel Date:* " . $waGroupDate . $waPickTime . "\n";
if ($waIsRound && $waReturnDate) $waDriverMsg .= "📅 *Return Date:* " . $waReturnDate . "\n";
if ($distance > 0) $waDriverMsg .= "🛣️ *Approx Distance:* ~" . number_format($distance, 0) . " KM\n";
$waDriverMsg .= "📍 *Navigate Pickup:* https://www.google.com/maps/search/?api=1&query=" . urlencode(strip_tags($pickup)) . "\n";
$waDriverMsg .= "🏁 *Navigate Drop:* https://www.google.com/maps/search/?api=1&query=" . urlencode(strip_tags($drop)) . "\n";
$waDriverMsg .= "━━━━━━━━━━━━━━━━━━━\n💰 *FARE & COLLECTION REMINDER*\n━━━━━━━━━━━━━━━━━━━\n";
$waDriverMsg .= "💵 *Amount to Collect:* *₹" . number_format($finalFare) . "*\n";
$waDriverMsg .= "🧾 *Fare Inclusions:* " . ($isInclusive ? 'Inclusive of Highway Toll & Permit Tax' : 'Exclusions apply (Passenger pays Toll/Permit extra)') . "\n";
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

$subjectTag = $isAirportFlag ? 'Airport Taxi Confirmed' : 'Booking Confirmed';
$cleanCustomerName = trim(strip_tags((string)$customerName));
if ($cleanCustomerName === '' || $cleanCustomerName === 'N/A') {
    $cleanCustomerName = 'Customer';
}
$cleanPageName = trim(str_replace(["\u{2708}\u{FE0F}", "\u{2708}", "\u{1F696}", "\u{1F3D9}\u{FE0F}", "\u{1F3D9}", "\u{1F3E0}", "\u{1F4C4}", '✈️', '🚖', '🏙️', '🏠', '📄'], '', (string)$pageDisplayName));
$checkEmoji = "\u{2705}";
$subject = "{$checkEmoji} Drop Cars {$subjectTag} #{$bookingId} - {$cleanCustomerName} ({$cleanPageName})";

$bodyHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
body{font-family:Arial,sans-serif;line-height:1.6;color:#333;}
.container{max-width:640px;margin:0 auto;padding:18px;background:#f3f7fd;border:1px solid #d8e4f3;border-radius:14px;}
.header{background:linear-gradient(135deg,#0b4a8f 0%,#1f6fc7 100%);color:#ffffff !important;padding:20px;text-align:center;border-radius:10px;}
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
.fare-amount{font-size:26px;font-weight:800;color:#0f8a5f;}
.note{font-size:12px;color:#5f7290;padding-bottom:12px;}
.list-title{font-weight:700;color:#0b4a8f;margin:10px 0 4px;}
.list{margin:0 0 10px 18px;padding:0;font-size:14px;color:#203a5c;}
.footer{font-size:12px;color:#68748c;margin-top:24px;text-align:center;}
</style></head><body><div class="container">
<div class="header" style="background:linear-gradient(135deg,#0b4a8f 0%,#1f6fc7 100%);color:#ffffff !important;">
<h1 style="color:#ffffff !important;text-shadow:0 1px 1px rgba(0,0,0,0.25);"><span style="color:#ffffff !important;">DROP CARS</span></h1>
<p style="color:#ffffff !important;text-shadow:0 1px 1px rgba(0,0,0,0.25);"><span style="color:#ffffff !important;">' . "\u{2705}" . ' Confirmed Booking</span></p>
<p style="font-size:13px;opacity:0.95;color:#ffffff !important;text-shadow:0 1px 1px rgba(0,0,0,0.25);"><span style="color:#ffffff !important;">Booking ID: ' . $bookingId . '</span></p>
</div>';

$contactValueHtml = htmlspecialchars($formattedContact);
if (preg_match('/[0-9]/', $contactValue)) {
    $telHref = 'tel:' . preg_replace('/[^\d\+]/', '', $formattedContact);
    // Reuse the same rich, pre-filled professional booking-confirmation
    // template built for the "Send Customer" CRM button below instead of
    // opening a bare, empty WhatsApp chat.
    $contactValueHtml .= '<div style="margin-top: 6px;">'
        . '<a href="' . $telHref . '" style="display: inline-block; background-color: #22c55e; color: #ffffff !important; padding: 5px 12px; border-radius: 5px; font-weight: bold; text-decoration: none; font-size: 12px; margin-right: 8px; border: 1px solid #16a34a;">📞 Call</a>'
        . '<a href="' . $waCustomerUrl . '" target="_blank" style="display: inline-block; background-color: #075E54; color: #ffffff !important; padding: 5px 12px; border-radius: 5px; font-weight: bold; text-decoration: none; font-size: 12px; border: 1px solid #054c44;">💬 WhatsApp</a>'
        . '</div>';
}

$bodyHtml .= '
<div class="block"><div class="block-title">👤 Customer Details</div><div class="block-body"><table class="kv">
<tr><td class="k">👤 Name</td><td class="v">' . htmlspecialchars($customerName) . '</td></tr>
<tr><td class="k">📞 Phone</td><td class="v">' . $contactValueHtml . '</td></tr>
</table></div></div>';

$bodyHtml .= '
<div class="block"><div class="block-title">🚖 Trip Details</div><div class="block-body"><table class="kv">
<tr><td class="k">🚖 Trip Type</td><td class="v">' . $tripLabel . ($isAirportFlag ? ' <span style="background:#0ea5e9;color:#ffffff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;margin-left:6px;">AIRPORT TRANSFER</span>' : '') . '</td></tr>
<tr><td class="k">📍 From (Pickup)</td><td class="v">' . $pickup . '</td></tr>
<tr><td class="k">🏁 To (Drop)</td><td class="v">' . $drop . '</td></tr>
' . ($pickupMapsLink ? '<tr><td class="k">📍 Pickup GPS</td><td class="v"><a href="' . htmlspecialchars($pickupMapsLink) . '" target="_blank" style="color:#0b4a8f;font-weight:700;">📍 Open in Google Maps</a></td></tr>' : '') . '
<tr><td class="k">🗓️ Pickup Date</td><td class="v">' . htmlspecialchars($travelDate) . '</td></tr>
<tr><td class="k">⏰ Pickup Time</td><td class="v">' . htmlspecialchars($travelTime) . '</td></tr>
<tr><td class="k">🚗 Vehicle</td><td class="v">' . htmlspecialchars($vehicleType) . '</td></tr>
' . ($distance > 0 ? '<tr><td class="k">🛣️ Distance</td><td class="v">' . number_format($distance, 0) . ' km</td></tr>' : '') . '
</table></div></div>
';


$fareDisplay = '₹' . number_format($finalFare);
if ($discountAmount > 0) {
    $fareDisplay = '<span style="text-decoration: line-through; opacity: 0.6; font-size: 0.8em; margin-right: 8px;">₹' . number_format($fareEstimate) . '</span> ₹' . number_format($finalFare);
}

$note = 'Parking extra. Payment to driver.';
if (!$includeTolls && !$includeTaxes) {
    $note = 'Toll, parking & state permit / border tax extra (applicable only if crossing state border). Payment to driver.';
} elseif (!$includeTolls) {
    $note = 'Toll & parking extra (applicable only if crossing state border). Payment to driver.';
} elseif (!$includeTaxes) {
    $note = 'State permit / border tax & parking extra (applicable only if crossing state border). Payment to driver.';
}

$websiteUrl = $config['websiteUrl'] ?? 'https://dropcars.in';
$bodyHtml .= "<div class='block'><div class='block-title'>💰 Confirmed Fare Payable</div><div class='block-body'><table class='kv'>
<tr><td class='k'>💰 Confirmed Fare</td><td class='v'><div class='fare-amount'>{$fareDisplay}</div></td></tr>
</table><div class='note'>{$note}</div></div></div>"
    . $breakdownHtml
    . "<div class='block'><div class='block-title'>🛡️ Admin Management &amp; CRM Tools</div><div class='block-body' style='padding: 16px; text-align: center;'>
    <div style='display: inline-block; width: 100%; text-align: center;'>
    <div style='margin-bottom: 10px; font-size: 13px; color: #475569; font-weight: bold; text-align: left;'>📲 WhatsApp Quick Share:</div>
    <a href='" . $waCustomerUrl . "' target='_blank' style='display: inline-block; background: #25D366; color: #ffffff !important; padding: 10px 16px; border-radius: 8px; font-weight: bold; text-decoration: none; font-size: 13px; margin: 4px 6px;'>📲 Send Customer</a>
    <a href='" . $waGroupUrl . "' target='_blank' style='display: inline-block; background: #128C7E; color: #ffffff !important; padding: 10px 16px; border-radius: 8px; font-weight: bold; text-decoration: none; font-size: 13px; margin: 4px 6px;'>👥 Group Post</a>
    <a href='" . $waDriverUrl . "' target='_blank' style='display: inline-block; background: #075E54; color: #ffffff !important; padding: 10px 16px; border-radius: 8px; font-weight: bold; text-decoration: none; font-size: 13px; margin: 4px 6px;'>🚖 Driver</a>
    
    <div style='margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 12px; margin-bottom: 10px; font-size: 13px; color: #475569; font-weight: bold; text-align: left;'>Manage and fulfill this confirmed ride directly:</div>
    <a href='" . rtrim($websiteUrl, '/') . "/admin/bookings?search=" . urlencode($bookingId) . "' target='_blank' style='display: inline-block; background: #0b4a8f; color: #ffffff !important; padding: 10px 16px; border-radius: 8px; font-weight: bold; text-decoration: none; font-size: 13px; margin: 4px 6px;'>🚖 View Booking Details</a>
    <a href='" . rtrim($websiteUrl, '/') . "/admin/bookings?search=" . urlencode($bookingId) . "#crew-assignment' target='_blank' style='display: inline-block; background: #7e22ce; color: #ffffff !important; padding: 10px 16px; border-radius: 8px; font-weight: bold; text-decoration: none; font-size: 13px; margin: 4px 6px;'>👨‍✈️ Assign Cab &amp; Driver</a>
    <a href='" . rtrim($websiteUrl, '/') . "/admin/customer-history?phone=" . urlencode($contactValue) . "' target='_blank' style='display: inline-block; background: #d97706; color: #ffffff !important; padding: 10px 16px; border-radius: 8px; font-weight: bold; text-decoration: none; font-size: 13px; margin: 4px 6px;'>👤 Verify Customer Profile</a>
    <a href='" . rtrim($websiteUrl, '/') . "/admin/settings?cat=operations&block_ip=" . urlencode($clientIp) . "' target='_blank' style='display: inline-block; background: #ef4444; color: #ffffff !important; padding: 10px 16px; border-radius: 8px; font-weight: bold; text-decoration: none; font-size: 13px; margin: 4px 6px;'>🚫 Spam? Block Client IP</a>
    </div>
    </div></div>"
    . "<div class='block'><div class='block-title'>Coverage &amp; Trip Guidelines</div><div class='block-body' style='padding-top: 12px; padding-bottom: 12px;'>
    <div style='display: table; width: 100%;'>
        <div style='display: table-row;'>
            <div style='display: table-cell; width: 50%; vertical-align: top; padding-right: 10px;'>
                <div style='font-weight:700; color:#0f8a5f; margin-bottom: 8px; font-size: 13px; text-transform: uppercase;'>✓ What's Included</div>
                <ul style='list-style: none; padding-left: 0; margin: 0; font-size: 13px; color: #2c3e50;'>
                    <li style='margin-bottom: 6px;'>🟢 Base Fare</li>
                    <li style='margin-bottom: 6px;'>🟢 Driver Allowance (Bata)</li>
                    <li style='margin-bottom: 6px;'>🟢 Clean Sanitized AC Cab</li>" . ($includeTolls ? "<li style='margin-bottom: 6px; font-weight: 700; color: #0f8a5f;'>🟢 Highway Toll Charges</li>" : "") . ($includeTaxes ? "<li style='margin-bottom: 6px; font-weight: 700; color: #0f8a5f;'>🟢 State permit / border tax (if crossing state border)</li>" : "") . "
                </ul>
            </div>
            <div style='display: table-cell; width: 50%; vertical-align: top; padding-left: 10px; border-left: 1px solid #eef3fb;'>
                <div style='font-weight:700; color:#0b4a8f; margin-bottom: 4px; font-size: 13px; text-transform: uppercase;'>⚠️ What's Excluded</div>
                <ul style='list-style: none; padding-left: 0; margin: 0; font-size: 13px; color: #64748b;'>
                    <li style='margin-bottom: 6px;'>🔴 Parking Charges (if applicable)</li>" . ($includeTolls ? "" : "<li style='margin-bottom: 6px;'>🔴 Toll Charges</li>") . ($includeTaxes ? "" : "<li style='margin-bottom: 6px;'>🔴 State permit / border tax (applicable only if crossing state border)</li>") . "
                    <li style='margin-bottom: 6px;'>🔴 Extra KM/Hour (if exceeded)</li>
                    <li style='margin-bottom: 6px;'>🔴 Waiting charges (after 20m grace)</li>
                </ul>
            </div>
        </div>
    </div>
    <div style='border-top: 1px solid #eef3fb; margin-top: 12px; padding-top: 10px;'>
        <div style='font-weight:700; color:#0b4a8f; margin-bottom: 4px; font-size: 13px; text-transform: uppercase;'>Terms &amp; Conditions</div>
        <ul style='list-style: none; padding-left: 0; margin: 0; font-size: 12px; color: #64748b;'>
            <li style='margin-bottom: 4px;'>• Extra charges apply for additional distance or time beyond estimates.</li>
            <li style='margin-bottom: 4px;'>• Cancellation charges may apply as per policy.</li>
        </ul>
    </div>
    </div></div>";

$sourceBadgeBg = ($normalizedSource === 'Google Ads') ? '#16a34a' : ($normalizedSource === 'Admin' ? '#7e22ce' : '#0284c7');
$bodyHtml .= '<div class="block"><div class="block-title">📡 Source &amp; Lead Intelligence</div><div class="block-body"><table class="kv">'
        . '<tr><td class="k">Source</td><td class="v"><span style="background:' . $sourceBadgeBg . ';color:#ffffff;padding:3px 9px;border-radius:4px;font-weight:bold;font-size:12px;display:inline-block;">' . htmlspecialchars($normalizedSource) . '</span></td></tr>'
        . ($utmTerm !== '' ? '<tr><td class="k">🎯 Search Keyword</td><td class="v"><strong>' . htmlspecialchars($utmTerm) . '</strong>' . ($matchtypeLabel !== '' ? ' <span style="background:#e0f2fe;color:#0369a1;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:700;margin-left:6px;border:1px solid #bae6fd;">' . htmlspecialchars($matchtypeLabel) . '</span>' : '') . '</td></tr>' : '')
        . ($utmCampaign !== '' ? '<tr><td class="k">📢 Campaign Name</td><td class="v"><span style="background:#f1f5f9;color:#1e293b;padding:3px 8px;border-radius:4px;font-weight:700;font-size:13px;">' . htmlspecialchars(str_replace('_', ' ', $utmCampaign)) . '</span></td></tr>' : '')
        . ($utmContent !== '' ? '<tr><td class="k">📂 Ad Group Name</td><td class="v"><span style="background:#f1f5f9;color:#1e293b;padding:3px 8px;border-radius:4px;font-weight:700;font-size:13px;">' . htmlspecialchars(str_replace('_', ' ', $utmContent)) . '</span></td></tr>' : '')
        . '<tr><td class="k">Device</td><td class="v">' . htmlspecialchars($deviceLabel) . '</td></tr>'
        . '<tr><td class="k">Booking Page</td><td class="v"><strong>' . htmlspecialchars($pageDisplayName) . '</strong></td></tr>'
        . '<tr><td class="k">Page URL</td><td class="v">' . ($pageUrlRaw !== '' ? '<a href="' . htmlspecialchars($pageUrlRaw) . '" target="_blank" style="color:#0b4a8f;font-weight:600;word-break:break-all;">' . htmlspecialchars($pageUrlRaw) . '</a>' : htmlspecialchars($sourcePage)) . '</td></tr>'
        . '<tr><td class="k">IP Address</td><td class="v">' . htmlspecialchars($clientIp) . '</td></tr>'
        . '</table></div></div>'
    . '<div class="footer">Automated confirmation from Drop Cars. Phone: +91 7200217986 | support@dropcars.in</div>
</div></body></html>';

$bodyPlain = "\u{2705} Drop Cars – Booking Confirmation\n\n";
$bodyPlain .= "Booking ID: {$bookingId}\n";
$bodyPlain .= "Customer: {$customerName}\n";
$bodyPlain .= "Phone: {$formattedContact}\n";
$bodyPlain .= "Trip Type: {$tripLabel}\n";
$bodyPlain .= "Pickup: {$pickup}\n";
$bodyPlain .= "Drop: {$drop}\n";
if ($pickupMapsLink) {
    $bodyPlain .= "Pickup GPS: {$pickupMapsLink}\n";
}
$bodyPlain .= "Date: {$travelDate} | Time: {$travelTime}\n";
$bodyPlain .= "Vehicle: {$vehicleType}\n";
if ($distance > 0) {
    $bodyPlain .= 'Calculated trip distance (for fare): ~' . number_format($distance, 0) . " km\n";
}
$bodyPlain .= 'Confirmed Fare: ₹' . number_format($finalFare, 0) . "\n";
if ($discountAmount > 0) {
    $bodyPlain .= 'Original estimate: ₹' . number_format($fareEstimate, 0) . ' | Discount: ₹' . number_format($discountAmount, 0) . "\n";
}
$inclusionsPlain = "Base Fare, Driver Allowance, Selected Car with A/C";
if ($includeTolls) {
    $inclusionsPlain .= ", Highway Tolls";
}
if ($includeTaxes) {
    $inclusionsPlain .= ", State permit / border tax (if crossing state border)";
}

$exclusionsPlain = "";
if (!$includeTolls) {
    $exclusionsPlain .= "Toll, ";
}
if (!$includeTaxes) {
    $exclusionsPlain .= "State permit / border tax (applicable only if crossing state border), ";
}
$exclusionsPlain .= "Parking, Extra KM/Hour, Waiting Charges";
$bodyPlain .= "Inclusions: {$inclusionsPlain}\n";
$bodyPlain .= "Exclusions: {$exclusionsPlain}\n";
$bodyPlain .= "\n--- Source & Lead Intelligence ---\n";
$bodyPlain .= "Source: {$normalizedSource}\n";
if ($utmTerm !== '')     $bodyPlain .= "Search Keyword: {$utmTerm}" . ($matchtypeLabel ? " [{$matchtypeLabel}]" : "") . "\n";
if ($utmCampaign !== '') $bodyPlain .= "Campaign: {$utmCampaign}\n";
if ($utmContent !== '')  $bodyPlain .= "Ad Group: {$utmContent}\n";
$bodyPlain .= "Device: {$deviceDb}\n";
$bodyPlain .= "Booking Page: {$pageDisplayName}\n";
$bodyPlain .= "Page URL: {$pageUrlRaw}\n";
$bodyPlain .= "IP: {$clientIp}\n";
if ($breakdownPlain !== '') {
    $bodyPlain .= "\n" . $breakdownPlain;
}

$adminEmailSent = false;
$customerEmailSent = false;

$appendBookingLog = function (array $entry) {
    $storageDir = __DIR__ . '/storage';
    if (!is_dir($storageDir)) {
        @mkdir($storageDir, 0775, true);
    }
    $logFile = $storageDir . '/bookings-log.jsonl';
    @file_put_contents($logFile, json_encode($entry, JSON_UNESCAPED_UNICODE) . PHP_EOL, FILE_APPEND | LOCK_EX);
};

$clientIp = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['HTTP_X_REAL_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '';
$clientIp = trim(explode(',', $clientIp)[0] ?? '');

$tripTypeForSync = $bookingData['trip_type'] ?? '';
if ($tripTypeForSync === '') {
    $bookingTypeUpper = strtoupper((string) $bookingType);
    if ($bookingTypeUpper === 'ROUND_TRIP') {
        $tripTypeForSync = 'round';
    } elseif ($bookingTypeUpper === 'MULTI_CITY') {
        $tripTypeForSync = 'multi';
    } else {
        $tripTypeForSync = 'oneway';
    }
}

$targetStatus = (isset($bookingData['source']) && $bookingData['source'] === 'admin') ? 'confirmed' : 'pending';

$logEntry = [
    'type' => 'CONFIRMED',
    'bookingId' => $bookingId,
    'tripType' => $tripTypeForSync ?? 'oneway',
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
    'serviceType' => $bookingType,
    'ip' => $clientIp,
    'source' => $bookingData['source'] ?? 'organic',
    'utmSource' => $bookingData['utmSource'] ?? '',
    'utmMedium' => $bookingData['utmMedium'] ?? '',
    'utmCampaign' => $bookingData['utmCampaign'] ?? '',
    'gclid' => $bookingData['gclid'] ?? '',
    'status' => $targetStatus,
    'createdAt' => date('c')
];

$dbSaved = false;
require_once __DIR__ . '/booking-persist.php';
require_once __DIR__ . '/../includes/google-sheet-sync.php';
if (!defined('DROP_CARS_DB_OPTIONAL')) {
    define('DROP_CARS_DB_OPTIONAL', true);
}
require_once __DIR__ . '/../admin/config/database.php';
// database.php may have been included earlier inside a function (e.g. check-blocked),
// leaving the local $pdo unset even though the connection succeeded. Fall back to the global.
if ((!isset($pdo) || !$pdo instanceof PDO) && !empty($GLOBALS['db']) && $GLOBALS['db'] instanceof PDO) {
    $pdo = $GLOBALS['db'];
}
if (isset($pdo) && $pdo instanceof PDO) {
    $couponCodeUsed = strtoupper(trim($bookingData['coupon_code'] ?? $bookingData['promoCode'] ?? ''));
    $refCodeToSave = '';
    if ($couponCodeUsed !== '') {
        if (strpos($couponCodeUsed, 'DCRP-') === 0) {
            $refCodeToSave = $couponCodeUsed;
        } else {
            $stmtRef = $pdo->prepare("SELECT `referral_code` FROM `customers` WHERE `referral_code` = ? LIMIT 1");
            $stmtRef->execute([$couponCodeUsed]);
            $refCodeToSave = $stmtRef->fetchColumn() ?: '';
        }
    }

    $dbSaved = dropcars_persist_confirmation_booking(
        $pdo,
        $bookingData,
        (string) $bookingId,
        $customerNamePlain,
        $pickupPlain,
        $dropPlain,
        (string) $bookingType,
        (string) $vehicleType,
        $fareEstimate,
        (string) $travelDate,
        $travelTime,
        $distance,
        $discountAmount,
        $finalFare,
        htmlspecialchars($bookingData['duration'] ?? $bookingData['durationHint'] ?? ''),
        $fareType,
        $targetStatus,
        $refCodeToSave,
        $_SESSION['admin_name'] ?? '',
        !empty($bookingData['isUrgent'])
    );

    if ($dbSaved) {
        try {
            $enquiryId = isset($bookingData['enquiryId']) ? (int)$bookingData['enquiryId'] : 0;
            $enquiryBookingId = isset($bookingData['enquiryBookingId']) ? trim((string)$bookingData['enquiryBookingId']) : '';
            
            // Derive possible enquiry IDs
            $derivedEId = '';
            $derivedDEId = '';
            if (strpos($bookingId, 'C') === 0) {
                $derivedEId = 'E' . substr($bookingId, 1);
                $derivedDEId = 'DE' . substr($bookingId, 1);
            } elseif (strpos($bookingId, 'DC') === 0) {
                $derivedEId = 'E' . substr($bookingId, 2);
                $derivedDEId = 'DE' . substr($bookingId, 2);
            }

            if ($enquiryId > 0) {
                $pdo->prepare("UPDATE `enquiries` SET `status` = 'confirmed', `booking_id` = ? WHERE `id` = ?")->execute([$bookingId, $enquiryId]);
            }
            
            $stmtUpd = $pdo->prepare("UPDATE `enquiries` SET `status` = 'confirmed', `booking_id` = ? WHERE `booking_id` = ? OR `booking_id` = ? OR `booking_id` = ? OR `booking_id` = ?");
            $stmtUpd->execute([$bookingId, $bookingId, $enquiryBookingId, $derivedEId, $derivedDEId]);
        } catch (Throwable $e) {
            error_log("Failed to clean up matching enquiries: " . $e->getMessage());
        }
    }
}

// Save fallback booking to session for offline DB/migration resilience
$_SESSION['last_booking_' . $bookingId] = [
    'booking_id' => $bookingId,
    'pickup_location' => $pickupPlain,
    'drop_location' => $dropPlain,
    'car_name' => $vehicleType,
    'pickup_date' => $travelDate,
    'pickup_time' => $travelTime,
    'final_fare' => $finalFare,
    'estimated_fare' => $fareEstimate,
    'fare_type' => $fareType,
    'trip_type' => $tripTypeForSync ?? $bookingType,
    'distance_km' => $distance,
    'duration' => htmlspecialchars($bookingData['duration'] ?? $bookingData['durationHint'] ?? ''),
    'status' => $targetStatus
];

$isRegularCustomer = false;
if (isset($pdo) && $pdo instanceof PDO) {
    require_once __DIR__ . '/includes/regular-customer.php';
    $isRegularCustomer = dropcars_is_regular_customer($pdo, strip_tags($contactValue));
}

$response = [
    'success' => true,
    'status' => 'success',
    'bookingId' => $bookingId,
    'message' => 'Booking confirmed.'
];
if (ob_get_length()) ob_end_clean();
echo json_encode($response);

if (function_exists('fastcgi_finish_request')) {
    fastcgi_finish_request();
}
ignore_user_abort(true);
$logEntry['is_regular_customer'] = $isRegularCustomer;

$sheetBookingRow = null;
if (isset($pdo) && $pdo instanceof PDO) {
    try {
        $sheetStmt = $pdo->prepare(
            'SELECT b.*, c.name, c.phone
             FROM `bookings` b
             LEFT JOIN `customers` c ON c.`id` = b.`customer_id`
             WHERE b.`booking_id` = ?
             LIMIT 1'
        );
        $sheetStmt->execute([(string) $bookingId]);
        $sheetBookingRow = $sheetStmt->fetch(PDO::FETCH_ASSOC) ?: null;
    } catch (Throwable $e) {
        error_log('Drop Cars confirm_booking sheet row fetch error: ' . $e->getMessage());
    }
}

// ── Build thread-grouping headers so all emails for the same trip thread together ──
$threadContactRaw = strtolower(trim(strip_tags((string) $contactValue)));
if ($threadContactRaw === '' || $threadContactRaw === 'n/a') {
    $threadContactRaw = strtolower(trim(strip_tags((string) $customerNamePlain)));
}
$pickupClean     = strtolower(preg_replace('/[^a-z0-9]/', '', (string) $pickupPlain));
$dropClean       = strtolower(preg_replace('/[^a-z0-9]/', '', (string) $dropPlain));
$threadKeySource = preg_replace('/\s+/', '', $threadContactRaw) . '||' . $pickupClean . '||' . $dropClean;
if ($threadKeySource === '||||') {
    $threadKeySource = 'unknown';
}
$threadHash          = substr(sha1($threadKeySource), 0, 24);
$threadRootMessageId = '<trip-thread-' . $threadHash . '@gmail.com>';

$phpmailerPath = __DIR__ . '/phpmailer/src/PHPMailer.php';
// Skip blocking SMTP on the single-threaded php -S dev server.
if (php_sapi_name() === 'cli-server') {
    error_log('[dropcars] Skipping SMTP send on built-in dev server (cli-server).');
} elseif (is_file($phpmailerPath) && $appPassword) {
    require_once __DIR__ . '/phpmailer/src/Exception.php';
    require_once __DIR__ . '/phpmailer/src/PHPMailer.php';
    require_once __DIR__ . '/phpmailer/src/SMTP.php';
    $sendEmail = function ($toAddress, $subjectLine, $htmlBody, $plainBody) use ($smtp, $bookingId, $threadRootMessageId, $threadHash) {
        $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
        try {
            $mail->isSMTP();
            $mail->Host = 'smtp.gmail.com';
            $mail->SMTPAuth = true;
            $mail->SMTPSecure = 'tls';
            $mail->Port = 587;
            dropcars_phpmailer_apply_smtp($mail, $smtp);
            $mail->addAddress($toAddress);
            $mail->CharSet = 'UTF-8';
            $mail->MessageID = '<confirm-' . preg_replace('/[^A-Za-z0-9]/', '', (string)$bookingId) . '-' . uniqid('', true) . '@gmail.com>';
            $mail->addCustomHeader('In-Reply-To', $threadRootMessageId);
            $mail->addCustomHeader('References', $threadRootMessageId);
            $mail->addCustomHeader('X-DropCars-Thread-Key', $threadHash);
            $mail->addCustomHeader('X-Entity-Ref-ID', 'confirm-' . $bookingId . '-' . uniqid());
            $mail->Subject = $subjectLine;
            $mail->Body = $htmlBody;
            $mail->AltBody = $plainBody;
            $mail->isHTML(true);
            $mail->send();
            return true;
        } catch (Exception $e) {
            // Fallback to Port 465 SSL
            try {
                $mail2 = new \PHPMailer\PHPMailer\PHPMailer(true);
                $mail2->isSMTP();
                $mail2->Host = 'smtp.gmail.com';
                $mail2->SMTPAuth = true;
                $mail2->SMTPSecure = 'ssl';
                $mail2->Port = 465;
                dropcars_phpmailer_apply_smtp($mail2, $smtp);
                $mail2->addAddress($toAddress);
                $mail2->CharSet = 'UTF-8';
                $mail2->MessageID = '<confirm-' . preg_replace('/[^A-Za-z0-9]/', '', (string)$bookingId) . '-' . uniqid('', true) . '@gmail.com>';
                $mail2->addCustomHeader('In-Reply-To', $threadRootMessageId);
                $mail2->addCustomHeader('References', $threadRootMessageId);
                $mail2->addCustomHeader('X-DropCars-Thread-Key', $threadHash);
                $mail2->addCustomHeader('X-Entity-Ref-ID', 'confirm-' . $bookingId . '-' . uniqid());
                $mail2->Subject = $subjectLine;
                $mail2->Body = $htmlBody;
                $mail2->AltBody = $plainBody;
                $mail2->isHTML(true);
                $mail2->send();
                return true;
            } catch (Exception $e2) {
                error_log("Drop Cars SMTP 587 Error: " . $e->getMessage() . " | Port 465 Fallback Error: " . $e2->getMessage());
                return false;
            }
        }
    };

    $adminRecipients = array_filter(array_map('trim', explode(',', (string) $mailTo)));
    if (empty($adminRecipients)) {
        $adminRecipients = [$mailTo];
    }
    foreach ($adminRecipients as $recipient) {
        if ($recipient !== '' && filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
            if ($sendEmail($recipient, $subject, $bodyHtml, $bodyPlain)) {
                $adminEmailSent = true;
            }
        }
    }
}

// ── Customer notification via central notification engine ────────────────────
try {
    require_once __DIR__ . '/../includes/notification-engine.php';
    if (isset($pdo) && $pdo instanceof PDO) {
        $notifRes        = dropcars_dispatch_notifications($pdo, $bookingId, 'pending');
        $customerEmailSent = $notifRes['emailSent'];
    }
} catch (\Throwable $e) {
    error_log('confirm_booking.php - Central customer notification dispatch failed: ' . $e->getMessage());
}


// Send SMS and WhatsApp confirmations via configured gateways
try {
    require_once __DIR__ . '/includes/sms-whatsapp-gateway.php';
    // Map $bookingData fields to expected formats in the gateway helper
    $gatewayBooking = [
        'customer_name' => $customerName,
        'customer_phone' => $contactValue,
        'booking_id' => $bookingId,
        'pickup_location' => $pickup,
        'drop_location' => $drop,
        'final_fare' => $finalFare,
        'pickup_date' => $travelDate,
        'pickup_time' => $travelTime,
        'car_name' => $vehicleType
    ];
    if (function_exists('dropcars_send_gateway_sms')) {
        dropcars_send_gateway_sms($config, $gatewayBooking);
    }
    if (function_exists('dropcars_send_gateway_whatsapp')) {
        dropcars_send_gateway_whatsapp($config, $gatewayBooking);
    }
} catch (Throwable $e) {
    error_log("Failed to send gateway SMS/WhatsApp confirmations: " . $e->getMessage());
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
        $bookingDbId = 0;
        if (isset($pdo) && $pdo instanceof PDO) {
            try {
                $stmtId = $pdo->prepare("SELECT `id` FROM `bookings` WHERE `booking_id` = ? LIMIT 1");
                $stmtId->execute([$bookingId]);
                $bookingDbId = (int) $stmtId->fetchColumn();
            } catch (Throwable $e) {
                error_log("Failed to fetch numerical booking ID: " . $e->getMessage());
            }
        }
        $managementLink = $bookingDbId > 0 ? "https://dropcars.in/admin/customize-booking?id=" . $bookingDbId . "&source=booking" : '';

        $customerEmailRaw = (string) ($data['contactEmail'] ?? $data['email'] ?? '');
        $telegramHtml = dropcars_telegram_confirm_admin_html(
            (string) $bookingId,
            strip_tags($customerName),
            strip_tags($contactValue),
            $tripLabel,
            strip_tags($pickup),
            strip_tags($drop),
            (string) $travelDate,
            (string) $travelTime,
            strip_tags((string) $vehicleType),
            $distance,
            $fareEstimate,
            $discountAmount,
            $finalFare,
            $fareType,
            $telegramFareBreakdownBlock,
            $isRegularCustomer,
            $managementLink,
            $pageDisplayName,
            $normalizedSource,
            $customerEmailRaw
        );
        $telegramButtons = dropcars_telegram_confirm_admin_buttons(
            (string) $bookingId,
            strip_tags($contactValue),
            $bookingDbId,
            $config['websiteUrl'] ?? 'https://dropcars.in'
        );
        if (dropcars_telegram_send_html($telegramToken, $telegramChatIds, $telegramHtml, $telegramButtons)) {
            $telegramSent = true;
        }
    }
}

// ── Post to the driver/vendor app marketplace, pending admin approval ──────
// See api/includes/backend-client.php and dropcars-review/backend's
// /api/website/bookings endpoints. Only for organic customer bookings -
// a booking an admin creates directly in the admin panel (source=admin) is
// already implicitly approved and skips this gate. Runs after the customer's
// response has already been sent, so a slow/unreachable backend never delays
// booking confirmation.
$postingStatus = null;
if ($targetStatus !== 'confirmed') {
    try {
        require_once __DIR__ . '/includes/backend-client.php';

        $tripTypeMap = [
            'ONE_WAY' => 'Oneway',
            'ROUND_TRIP' => 'Round Trip',
            'LOCAL_PACKAGE' => 'Hourly Rental',
            'MULTI_CITY' => 'Multy City',
        ];
        $backendTripType = $tripTypeMap[strtoupper($bookingType)] ?? 'Oneway';

        // NOTE: verify this against your actual fleet's car-type categories
        // (dropcars-review/backend/app/models/new_orders.py CarTypeEnum) and
        // adjust if the website's vehicle tiers don't line up 1:1.
        $carTypeMap = [
            'SEDAN' => 'SEDAN_4_PLUS_1',
            'SUV' => 'SUV',
            'INNOVA' => 'INNOVA',
            'CRYSTA' => 'INNOVA_CRYSTA',
        ];
        $backendCarType = $carTypeMap[$selectedVehicleKey] ?? 'SEDAN_4_PLUS_1';

        $startDateTime = date('c');
        if (!empty($travelDate)) {
            $ts = strtotime($travelDate . ' ' . ($travelTime ?: '00:00'));
            if ($ts !== false) {
                $startDateTime = date('c', $ts);
            }
        }

        $backendPhone = preg_replace('/[^\d]/', '', (string) $contactValue);

        // The fare the customer saw and confirmed (already validated above by dropcars_validate_submitted_fare): the backend uses it as the
        // booking's quote instead of recomputing one from its own rate card (booking #344: confirmed 15/km + toll + GST was posted at 14/km).
        // Hourly packages have no per-km fare, so nothing is sent for them; the backend ignores a quote that does not make sense.
        $quotedFare = null;
        $qv = ($mappedKey !== '' && isset($fareBreakdown['vehicles'][$mappedKey]) && is_array($fareBreakdown['vehicles'][$mappedKey]))
            ? $fareBreakdown['vehicles'][$mappedKey] : null;
        if ($qv !== null && $backendTripType !== 'Hourly Rental' && !empty($qv['perKmRate']) && !empty($qv['effectiveBillableKm']) && (int) $finalFare > 0) {
            $quotedFare = [
                'per_km_rate' => (float) (!empty($qv['discountedRate']) ? $qv['discountedRate'] : $qv['perKmRate']),
                'driver_bata' => (int) (isset($qv['driverBataTotal']) ? $qv['driverBataTotal'] : (isset($qv['driverBata']) ? $qv['driverBata'] : 0)),
                'billable_km' => (float) $qv['effectiveBillableKm'],
                'total_fare' => (int) $finalFare,
                'include_taxes' => (bool) $includeTaxes,
                'include_tolls' => (bool) $includeTolls,
            ];
        }

        if ($backendPhone !== '') {
            $backendResult = dropcars_backend_request('POST', '/api/website/bookings', [
                'customer_name' => $customerNamePlain !== '' ? $customerNamePlain : 'Guest',
                'customer_number' => $backendPhone,
                'customer_email' => $customerEmailRaw !== '' ? $customerEmailRaw : null,
                'pickup_drop_location' => (object) ['0' => $pickupPlain, '1' => $dropPlain], // (object): a plain 0..1 array would json_encode as a LIST and be rejected (422)
                'trip_type' => $backendTripType,
                'car_type' => $backendCarType,
                'start_date_time' => $startDateTime,
                // "Urgent - need taxi immediately" (website Phase 3) - the
                // customer already completed a Razorpay Checkout payment for
                // the 15% advance client-side (see assets/js/booking-form.js'
                // startUrgentAdvancePayment()) before this request was ever
                // sent, so rp_order_id/rp_payment_id/rp_signature are always
                // present together when isUrgent is true. The backend
                // re-verifies the signature itself and 400s if it's missing
                // or invalid - never trust is_urgent alone.
                'is_urgent' => !empty($bookingData['isUrgent']),
                'rp_order_id' => $bookingData['rpOrderId'] ?? null,
                'rp_payment_id' => $bookingData['rpPaymentId'] ?? null,
                'rp_signature' => $bookingData['rpSignature'] ?? null,
                // The 15% advance actually charged via Razorpay - without this
                // the payment was verified but never reached advance_received
                // on the order the Driver/Vendor/Admin apps read.
                'advance_amount' => !empty($bookingData['isUrgent']) ? (int) ($bookingData['advanceAmount'] ?? 0) : null,
                'quoted_fare' => $quotedFare,
            ]);

            if ($backendResult['ok'] && is_array($backendResult['data'])) {
                $postingStatus = $backendResult['data']['status'] ?? 'PENDING';
                $backendRequestId = $backendResult['data']['id'] ?? null;
                if ($backendRequestId && isset($pdo) && $pdo instanceof PDO) {
                    $pdo->prepare("UPDATE `bookings` SET `backend_request_id` = ?, `posting_status` = ? WHERE `booking_id` = ?")
                        ->execute([(string) $backendRequestId, $postingStatus, (string) $bookingId]);
                }
            } else {
                $postingStatus = 'error';
                error_log('Drop Cars confirm_booking backend posting failed: ' . ($backendResult['error'] ?? 'unknown error'));
                if (isset($pdo) && $pdo instanceof PDO) {
                    $pdo->prepare("UPDATE `bookings` SET `posting_status` = ? WHERE `booking_id` = ?")
                        ->execute(['error', (string) $bookingId]);
                }
            }
        }
    } catch (Throwable $e) {
        error_log('Drop Cars confirm_booking backend posting exception: ' . $e->getMessage());
    }
}

$logEntry['adminEmailSent'] = $adminEmailSent;
$logEntry['customerEmailSent'] = $customerEmailSent;
$logEntry['telegramSent'] = $telegramSent;
$logEntry['dbSaved'] = $dbSaved;
$appendBookingLog($logEntry);

try {
    $sheetPayloadRow = is_array($sheetBookingRow) ? $sheetBookingRow : [];
    $sheetPayloadRow['created_at'] = $sheetPayloadRow['created_at'] ?? date('c');
    $sheetPayloadRow['booking_id'] = $sheetPayloadRow['booking_id'] ?? (string) $bookingId;
    $sheetPayloadRow['status'] = $sheetPayloadRow['status'] ?? $targetStatus;
    $sheetPayloadRow['name'] = $sheetPayloadRow['name'] ?? strip_tags($customerName);
    $sheetPayloadRow['phone'] = $sheetPayloadRow['phone'] ?? strip_tags($contactValue);
    $sheetPayloadRow['trip_type'] = $sheetPayloadRow['trip_type'] ?? ($bookingData['trip_type'] ?? $bookingType);
    $sheetPayloadRow['pickup_location'] = $sheetPayloadRow['pickup_location'] ?? strip_tags($pickup);
    $sheetPayloadRow['via_locations'] = $sheetPayloadRow['via_locations'] ?? (is_array($bookingData['stops'] ?? null) ? implode(' | ', $bookingData['stops']) : ($bookingData['via_locations'] ?? ''));
    $sheetPayloadRow['drop_location'] = $sheetPayloadRow['drop_location'] ?? strip_tags($drop);
    $sheetPayloadRow['pickup_date'] = $sheetPayloadRow['pickup_date'] ?? $sheetPayloadRow['travel_date'] ?? (string) $travelDate;
    $sheetPayloadRow['pickup_time'] = $sheetPayloadRow['pickup_time'] ?? $sheetPayloadRow['travel_time'] ?? (string) $travelTime;
    $sheetPayloadRow['return_date'] = $sheetPayloadRow['return_date'] ?? (string) ($bookingData['endDate'] ?? '');
    $sheetPayloadRow['return_time'] = $sheetPayloadRow['return_time'] ?? (string) ($bookingData['dropTime'] ?? '');
    $sheetPayloadRow['trip_days'] = $sheetPayloadRow['trip_days'] ?? (string) ($bookingData['tripDays'] ?? '');
    $sheetPayloadRow['car_name'] = $sheetPayloadRow['car_name'] ?? (string) $vehicleType;
    $sheetPayloadRow['distance_km'] = $sheetPayloadRow['distance_km'] ?? $distance;
    $sheetPayloadRow['estimated_fare'] = $sheetPayloadRow['estimated_fare'] ?? $fareEstimate;
    $sheetPayloadRow['final_fare'] = $sheetPayloadRow['final_fare'] ?? $finalFare;
    $sheetPayloadRow['discount_amount'] = $sheetPayloadRow['discount_amount'] ?? $discountAmount;
    $sheetPayloadRow['fare_type'] = $sheetPayloadRow['fare_type'] ?? $fareType;
    $sheetPayloadRow['driver_name'] = $sheetPayloadRow['driver_name'] ?? '';
    $sheetPayloadRow['driver_phone'] = $sheetPayloadRow['driver_phone'] ?? '';
    $sheetPayloadRow['car_number'] = $sheetPayloadRow['car_number'] ?? '';
    $sheetPayloadRow['source'] = $sheetPayloadRow['source'] ?? ($bookingData['source'] ?? 'admin');
    $sheetPayloadRow['utm_source'] = $sheetPayloadRow['utm_source'] ?? ($bookingData['utmSource'] ?? '');
    $sheetPayloadRow['utm_medium'] = $sheetPayloadRow['utm_medium'] ?? ($bookingData['utmMedium'] ?? '');
    $sheetPayloadRow['utm_campaign'] = $sheetPayloadRow['utm_campaign'] ?? ($bookingData['utmCampaign'] ?? '');
    $sheetPayloadRow['gclid'] = $sheetPayloadRow['gclid'] ?? ($bookingData['gclid'] ?? '');
    $sheetPayloadRow['ip_address'] = $sheetPayloadRow['ip_address'] ?? $clientIp;
    $sheetPayloadRow['loyalty_status'] = $isRegularCustomer ? 'Regular' : '';
    $entry = [
        'createdAt' => $sheetPayloadRow['created_at'] ?? date('c'),
        'bookingId' => $sheetPayloadRow['booking_id'] ?? '',
        'leadType' => 'Booking',
        'status' => $sheetPayloadRow['status'] ?? '',
        'name' => $sheetPayloadRow['customer_name'] ?? $sheetPayloadRow['name'] ?? '',
        'phone' => $sheetPayloadRow['customer_phone'] ?? $sheetPayloadRow['phone'] ?? '',
        'tripType' => $sheetPayloadRow['trip_type'] ?? 'oneway',
        'pickup' => $sheetPayloadRow['pickup_location'] ?? '',
        'viaLocations' => $sheetPayloadRow['via_locations'] ?? '',
        'drop' => $sheetPayloadRow['drop_location'] ?? '',
        'itinerary' => ($sheetPayloadRow['pickup_location'] ?? '')
            . (!empty($sheetPayloadRow['via_locations']) ? ' → ' . $sheetPayloadRow['via_locations'] : '')
            . ' → ' . ($sheetPayloadRow['drop_location'] ?? ''),
        'pickupDate' => $sheetPayloadRow['pickup_date'] ?? '',
        'pickupTime' => $sheetPayloadRow['pickup_time'] ?? '',
        'returnDate' => $sheetPayloadRow['return_date'] ?? '',
        'returnTime' => $sheetPayloadRow['return_time'] ?? '',
        'tripDays' => $sheetPayloadRow['trip_days'] ?? '',
        'vehicle' => $sheetPayloadRow['car_name'] ?? '',
        'distance' => $sheetPayloadRow['distance_km'] ?? '',
        'estFare' => $sheetPayloadRow['estimated_fare'] ?? '',
        'finalFare' => $sheetPayloadRow['final_fare'] ?? '',
        'discount' => $sheetPayloadRow['discount_amount'] ?? '',
        'fareType' => $sheetPayloadRow['fare_type'] ?? '',
        'driverName' => $sheetPayloadRow['driver_name'] ?? '',
        'driverPhone' => $sheetPayloadRow['driver_phone'] ?? '',
        'carNumber' => $sheetPayloadRow['car_number'] ?? '',
        'source' => $sheetPayloadRow['source'] ?? '',
        'utmSource' => $sheetPayloadRow['utm_source'] ?? '',
        'utmMedium' => $sheetPayloadRow['utm_medium'] ?? '',
        'utmCampaign' => $sheetPayloadRow['utm_campaign'] ?? '',
        'gclid' => $sheetPayloadRow['gclid'] ?? '',
        'ip' => $sheetPayloadRow['ip_address'] ?? '',
        'loyaltyStatus' => $isRegularCustomer ? 'Regular' : '',
    ];

    if ($config['enableGoogleSheetSync'] ?? true) {
        sendToGoogleSheet($entry);
    }
} catch (Throwable $e) {
    error_log('Drop Cars confirm_booking Google Sheet sync error: ' . $e->getMessage());
}

