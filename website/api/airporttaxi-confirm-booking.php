<?php
date_default_timezone_set('Asia/Kolkata');
/**
 * AirportTaxi.International — Booking confirmation.
 *
 * Deliberately modeled on api/confirm_booking.php's core loop (rate/blocked-IP
 * checks -> booking ID -> DB persist -> confirmation email -> Telegram alert),
 * reusing the exact same shared infrastructure Drop Cars uses:
 *   - Same MySQL connection (admin/config/database.php)
 *   - Same booking persistence function (api/booking-persist.php ::
 *     dropcars_persist_confirmation_booking()) writing to the same
 *     `customers` / `bookings` tables
 *   - Same SMTP account + PHPMailer + 587->465 fallback
 *     (admin/includes/mail.php :: dropcars_admin_send_mail())
 *   - Same Telegram bot (helpers/telegram.php :: sendTelegramMessage())
 *
 * What's intentionally different from confirm_booking.php: the fare is
 * computed server-side via engine/airporttaxi-fare.php (never trusts a
 * client-supplied total), the email copy is branded for
 * AirportTaxi.International, and the row is tagged `website = 'airporttaxi'`
 * after persistence so the existing multi-site admin selector
 * (admin/includes/sidebar-nav.php) can filter to it.
 *
 * NOT yet ported from confirm_booking.php (kept out of scope for this pass —
 * see full-functional-parity-plan.md "Implementation status"): WhatsApp
 * group/driver dispatch broadcast messages, Google Sheets sync, referral
 * coupon ledger. The core loop (persist -> email -> Telegram -> admin
 * visibility -> OTP account -> tracking) is fully wired.
 */

header('Content-Type: application/json; charset=utf-8');
$__origin = $_SERVER['HTTP_ORIGIN'] ?? '';
header('Access-Control-Allow-Origin: ' . ($__origin !== '' ? $__origin : '*'));
header('Access-Control-Allow-Credentials: true');
header('Vary: Origin');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

ob_start();

if (session_status() === PHP_SESSION_NONE) {
    require_once __DIR__ . '/../config/session.php';
    session_start();
}

require_once __DIR__ . '/../config/security.php';

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
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid or empty JSON.']);
    exit;
}

require_once __DIR__ . '/../engine/airporttaxi-fare.php';

// ---- Validate + normalize input --------------------------------------------------
$customerName = trim((string) ($data['customerName'] ?? ''));
$contactPhone = preg_replace('/\D/', '', (string) ($data['contactPhone'] ?? ''));
$contactEmail = trim((string) ($data['contactEmail'] ?? ''));
$whatsappSame = !empty($data['useWhatsappSameNumber']);
$whatsappPhone = $whatsappSame ? $contactPhone : preg_replace('/\D/', '', (string) ($data['whatsappPhone'] ?? ''));

$errors = [];
if ($customerName === '') $errors[] = 'Name is required.';
if (!preg_match('/^\d{10}$/', $contactPhone)) $errors[] = 'A valid 10-digit phone number is required.';
if ($contactEmail === '' || !filter_var($contactEmail, FILTER_VALIDATE_EMAIL)) $errors[] = 'A valid email address is required.';
if (!preg_match('/^\d{10}$/', $whatsappPhone)) $errors[] = 'A valid 10-digit WhatsApp number is required.';

$tripMainType = (string) ($data['tripMainType'] ?? 'airport'); // 'airport' | 'rental'
$tripSubType = (string) ($data['tripSubType'] ?? 'local');     // 'local' | 'outstation'
$mode = $tripMainType === 'rental' ? 'rental' : $tripSubType;   // 'local' | 'outstation' | 'rental'

$pickup = trim((string) ($data['pickup'] ?? ''));
$drop = trim((string) ($data['drop'] ?? ''));
$vehicle = strtoupper(trim((string) ($data['vehicle'] ?? 'SEDAN')));
if (!in_array($vehicle, dropcars_airporttaxi_vehicles(), true)) {
    $vehicle = 'SEDAN';
}
if ($pickup === '') $errors[] = 'Pickup location is required.';
if ($mode !== 'rental' && $drop === '') $errors[] = 'Drop location is required.';

if (!empty($errors)) {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => implode(' ', $errors)]);
    exit;
}

// ---- Authoritative server-side fare (never trust the client's number) -----------
$quoteParams = [
    'mode' => $mode,
    'distanceKm' => (float) ($data['distanceKm'] ?? 0),
    'borders' => (int) ($data['borders'] ?? 0),
    'hours' => (int) ($data['hours'] ?? 5),
    'vehicle' => $vehicle,
];
$fare = dropcars_airporttaxi_quote($quoteParams);

$travelDate = (string) ($data['date'] ?? '');
$travelTime = (string) ($data['time'] ?? '');

// ---- Booking ID (same 'C' + YYMMDD + sequence scheme Drop Cars uses, so it
//      lands correctly in the shared `bookings` table's uniqueness logic) --------
if (!defined('DROP_CARS_DB_OPTIONAL')) {
    define('DROP_CARS_DB_OPTIONAL', true);
}
require_once __DIR__ . '/../admin/config/database.php';
if (function_exists('dropcars_get_db')) {
    $pdo = dropcars_get_db();
} elseif ((!isset($pdo) || !$pdo instanceof PDO) && !empty($GLOBALS['db']) && $GLOBALS['db'] instanceof PDO) {
    $pdo = $GLOBALS['db'];
}

$bookingId = '';
if (isset($pdo) && $pdo instanceof PDO) {
    require_once __DIR__ . '/../admin/includes/enquiries-schema.php';
    $bookingId = dropcars_next_enquiry_booking_id($pdo, 'C');
} else {
    $bookingId = 'C' . date('ymd') . str_pad((string) random_int(1, 99), 2, '0', STR_PAD_LEFT);
}

// ---- Persist via the SAME shared function Drop Cars uses ------------------------
$bookingTypeForPersist = $mode === 'rental' ? 'hourly_rental' : ($mode === 'outstation' ? 'one_way' : 'one_way');
$bookingDataForPersist = [
    'customerName' => $customerName,
    // Stored as "+91 9876543210" (country code + space + 10 digits) to match
    // the format track-booking.php and every other Drop Cars flow looks up
    // customers.phone by — see assets/js/booking-form.js's contactValue
    // construction (countryCode + " " + phoneNational). AirportTaxi only
    // serves Tamil Nadu / South India, so the code is always +91 here.
    'customerPhone' => '+91 ' . $contactPhone,
    'customerEmail' => $contactEmail,
    'source' => 'airporttaxi_web',
    'source_page' => 'https://airporttaxi.international/',
    'fareBreakdown' => $fare,
];

$dbSaved = false;
if (isset($pdo) && $pdo instanceof PDO) {
    require_once __DIR__ . '/booking-persist.php';
    $dbSaved = dropcars_persist_confirmation_booking(
        $pdo,
        $bookingDataForPersist,
        $bookingId,
        $customerName,
        $pickup,
        $drop ?: '—',
        $bookingTypeForPersist,
        $vehicle,
        (int) $fare['total'],
        $travelDate,
        $travelTime,
        (float) ($data['distanceKm'] ?? 0),
        0,
        (int) $fare['total'],
        $mode === 'rental' ? (($data['hours'] ?? 5) . ' hrs') : '',
        'inclusive', // AirportTaxi.International fares are always all-inclusive
        'confirmed'
    );

    // Tag this row as belonging to the airporttaxi site so the existing
    // multi-site admin selector (registered_sites / website column, see
    // admin/sql/migrate-airporttaxi.sql) can filter to it. Safe no-op if the
    // `website` column hasn't been migrated in yet.
    if ($dbSaved) {
        try {
            $pdo->prepare("UPDATE `bookings` SET `website` = 'airporttaxi' WHERE `booking_id` = ?")
                ->execute([$bookingId]);
        } catch (Throwable $e) {
            // Column may not exist yet until admin/sql/migrate-airporttaxi.sql runs — non-fatal.
        }
    }
}

// ---- Confirmation email (same SMTP account, AirportTaxi-branded copy) ----------
$mailResult = ['ok' => false, 'error' => 'not attempted'];
$mailBootstrapPath = __DIR__ . '/../admin/includes/mail.php';
if (is_file($mailBootstrapPath)) {
    require_once $mailBootstrapPath;

    $vLabel = ucfirst(strtolower($vehicle));
    $subject = "\u{2705} Your AirportTaxi.International Booking " . $bookingId . " is Confirmed";
    $fareRows = '';
    // dropcars_airporttaxi_quote() doesn't build a `lines` array server-side
    // (that's a JS-only convenience in the standalone prototype) — render a
    // compact breakdown table directly from the fare fields instead.
    foreach ($fare as $k => $v) {
        if (in_array($k, ['tripType', 'vehicle', 'total'], true) || is_array($v)) continue;
        $label = ucwords(preg_replace('/(?<!^)[A-Z]/', ' $0', $k));
        $fareRows .= '<tr><td style="padding:6px 0;color:#5f7290;">' . htmlspecialchars($label) . '</td><td style="padding:6px 0;text-align:right;">' . htmlspecialchars((string) $v) . '</td></tr>';
    }

    $bodyHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:Arial,sans-serif;color:#10131c;">'
        . '<div style="max-width:600px;margin:0 auto;padding:20px;background:#faf8f3;border-radius:14px;">'
        . '<div style="background:#050914;color:#f0cf7c;padding:20px;border-radius:10px;text-align:center;">'
        . '<h1 style="margin:0;color:#f0cf7c;">AirportTaxi.International</h1>'
        . '<p style="color:#ffffff;margin:6px 0 0;">Booking Confirmed — ' . htmlspecialchars($bookingId) . '</p>'
        . '</div>'
        . '<div style="background:#fff;border-radius:10px;margin-top:14px;padding:16px;">'
        . '<h3 style="margin-top:0;">' . htmlspecialchars($fare['tripType']) . '</h3>'
        . '<table style="width:100%;border-collapse:collapse;font-size:14px;">'
        . '<tr><td style="padding:6px 0;color:#5f7290;">Passenger</td><td style="padding:6px 0;text-align:right;">' . htmlspecialchars($customerName) . '</td></tr>'
        . '<tr><td style="padding:6px 0;color:#5f7290;">Pickup</td><td style="padding:6px 0;text-align:right;">' . htmlspecialchars($pickup) . '</td></tr>'
        . '<tr><td style="padding:6px 0;color:#5f7290;">Drop</td><td style="padding:6px 0;text-align:right;">' . htmlspecialchars($drop ?: '—') . '</td></tr>'
        . '<tr><td style="padding:6px 0;color:#5f7290;">Date &amp; Time</td><td style="padding:6px 0;text-align:right;">' . htmlspecialchars($travelDate . ' ' . $travelTime) . '</td></tr>'
        . '<tr><td style="padding:6px 0;color:#5f7290;">Vehicle</td><td style="padding:6px 0;text-align:right;">' . htmlspecialchars($vLabel) . '</td></tr>'
        . $fareRows
        . '<tr><td style="padding:10px 0;font-weight:800;">Total (All Inclusive)</td><td style="padding:10px 0;text-align:right;font-weight:800;font-size:20px;color:#c9a24b;">₹' . number_format((int) $fare['total']) . '</td></tr>'
        . '</table>'
        . '<p style="font-size:12px;color:#6b6656;">Track this booking any time at https://airporttaxi.international/track-booking/' . htmlspecialchars($bookingId) . '</p>'
        . '</div>'
        . '<p style="text-align:center;font-size:12px;color:#6b6656;margin-top:16px;">AirportTaxi.International — A Drop Cars Company<br/>Support: +91 72002 17986 | support@dropcars.in</p>'
        . '</div></body></html>';

    $bodyPlain = "AirportTaxi.International – Booking Confirmation\n\n"
        . "Booking ID: {$bookingId}\n"
        . "Trip: {$fare['tripType']}\n"
        . "Passenger: {$customerName} ({$contactPhone})\n"
        . "Pickup: {$pickup}\nDrop: " . ($drop ?: '—') . "\n"
        . "Date/Time: {$travelDate} {$travelTime}\n"
        . "Vehicle: {$vLabel}\n"
        . 'Total (All Inclusive): Rs. ' . number_format((int) $fare['total']) . "\n"
        . "Track: https://airporttaxi.international/track-booking/{$bookingId}\n";

    // sourcePage drives the subdomainConfig lookup in dropcars_admin_send_mail()
    // (see api/config.php: subdomainConfig.airporttaxi) so the "From" name reads
    // "AirportTaxi.International" while the SMTP account itself is unchanged.
    $mailResult = dropcars_admin_send_mail($contactEmail, $subject, $bodyHtml, $bodyPlain, 'https://airporttaxi.international/');
}

// ---- Telegram alert (same bot/chat Drop Cars uses) ------------------------------
$telegramHelperPath = __DIR__ . '/../helpers/telegram.php';
if (is_file($telegramHelperPath)) {
    require_once $telegramHelperPath;
    if (function_exists('sendTelegramMessage')) {
        $tgMsg = "✈️ <b>AirportTaxi.International — New Booking</b>\n"
            . "Booking: <b>{$bookingId}</b>\n"
            . 'Trip: ' . htmlspecialchars($fare['tripType']) . "\n"
            . 'Passenger: ' . htmlspecialchars($customerName) . ' (' . htmlspecialchars($contactPhone) . ")\n"
            . 'Pickup: ' . htmlspecialchars($pickup) . ' -> Drop: ' . htmlspecialchars($drop ?: '—') . "\n"
            . 'Vehicle: ' . htmlspecialchars($vLabel ?? $vehicle) . "\n"
            . 'Total: Rs. ' . number_format((int) $fare['total']) . ' (all inclusive)';
        @sendTelegramMessage($tgMsg);
    }
}

if (ob_get_length()) ob_end_clean();
echo json_encode([
    'success' => true,
    'bookingId' => $bookingId,
    'fare' => $fare,
    'dbSaved' => $dbSaved,
    'emailSent' => $mailResult['ok'] ?? false,
]);
