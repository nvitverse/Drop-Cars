<?php
/**
 * Post-booking thank-you page.
 * Integrated with ThemeEngine for consistent styling and theme switching.
 */
require_once __DIR__ . '/../includes/check-blocked-main.php';
if (session_status() === PHP_SESSION_NONE) {
    require_once __DIR__ . '/../config/session.php';
    session_start();
}
if (!defined('DROP_CARS_DB_OPTIONAL')) define('DROP_CARS_DB_OPTIONAL', true);
require_once __DIR__ . '/../admin/config/database.php';
require_once __DIR__ . '/../engine/theme-engine.php';
require_once __DIR__ . '/../engine/shell.php';
require_once __DIR__ . '/../api/fare-breakdown-format.php';
require_once __DIR__ . '/../includes/customer-prefill.php';
$_pfPdo = (isset($pdo) && $pdo instanceof PDO) ? $pdo : null;
[$_pfName, $_pfEmail] = dropcars_customer_prefill($_pfPdo);
$_customerLoggedIn = !empty($_SESSION['customer_email']) || !empty($_SESSION['customer_phone']);
$_loginUrl = '/pages/customer-login.php?redirect=' . urlencode('/pages/thank-you.php' . (!empty($_GET['booking_id']) ? '?booking_id=' . urlencode($_GET['booking_id']) : ''));
$_dashUrl  = '/pages/customer-dashboard.php';

$themeEngine = new ThemeEngine();
$activeTheme = $themeEngine->detectTheme();
$allThemes = $themeEngine->getAllThemes();

$shell = new UIShell($activeTheme, $allThemes);

$rawId = $_GET['booking_id'] ?? $_GET['id'] ?? '';
$bookingId = preg_replace('/[^A-Za-z0-9\-]/', '', (string) $rawId);
$bookingIdDisplay = $bookingId !== '' ? $bookingId : 'pending';

$configPath = __DIR__ . '/../data/config.json';
$config = is_file($configPath) ? json_decode(file_get_contents($configPath), true) : [];

$apiConfigPath = __DIR__ . '/../api/config.php';
$apiConfig = is_file($apiConfigPath) ? (include $apiConfigPath) : [];

// -- Advance payment config (read from data/config.json advancePayment block) --
$advCfg        = $config['advancePayment'] ?? [];
$advEnabled    = !empty($advCfg['enabled']);
$advUpiId      = $advCfg['upiId']     ?? ($apiConfig['upiId']     ?? '7200217986-1@okbizaxis');
$advQrPath     = $advCfg['qrPath']    ?? ($apiConfig['upiQrPath'] ?? 'assets/img/qr-code.jpg');
$advPercent    = (int)($advCfg['percent']   ?? ($apiConfig['advancePercent']   ?? 20));
$advMinAmount  = (int)($advCfg['minAmount'] ?? ($apiConfig['advanceMinAmount'] ?? 300));
$advNote       = $advCfg['note']      ?? ($apiConfig['advanceNote'] ?? '');

$phone = $config['company']['phone'] ?? '7598899579';
$whatsapp = $config['company']['whatsapp'] ?? '917598899579';
$functionalPhone = $config['company']['functional_phone'] ?? '7200217986';
$functionalWhatsApp = $config['company']['functional_whatsapp'] ?? '917200217986';

$formatPhone = function($num) {
    $clean = preg_replace('/\D/', '', (string) $num);
    if (strlen($clean) === 12 && strpos($clean, '91') === 0) { $clean = substr($clean, 2); }
    if (strlen($clean) > 10 && strpos($clean, '91') === 0) { $clean = substr($clean, 2); }
    if (strlen($clean) === 10) { return '+91 ' . substr($clean, 0, 5) . ' ' . substr($clean, 5); }
    return '+91 ' . $clean;
};

$sitePhone = $formatPhone($phone);
$phoneHref = 'tel:+' . preg_replace('/\D/', '', $functionalPhone);
$waHref = 'https://wa.me/' . preg_replace('/\D/', '', $functionalWhatsApp) . '?text=' . rawurlencode('Hi Drop Cars, I just booked. Booking ID: ' . ($bookingId ?: 'pending'));

$bookingRow = null;
if ($bookingId !== '') {
    $dbBootstrap = __DIR__ . '/../admin/config/database.php';
    if (is_file($dbBootstrap)) {
        try {
            if (!defined('DROP_CARS_DB_OPTIONAL')) { define('DROP_CARS_DB_OPTIONAL', true); }
            require_once $dbBootstrap;
            if (isset($pdo) && $pdo instanceof PDO) {
                // Try bookings table first with customer join to get phone
                $stmt = $pdo->prepare('SELECT b.*, c.phone as customer_phone 
                                       FROM `bookings` b 
                                       JOIN `customers` c ON b.customer_id = c.id 
                                       WHERE b.booking_id = ? LIMIT 1');
                $stmt->execute([$bookingId]);
                $bookingRow = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;

                if ($bookingRow) {
                    // Ensure final_fare is never 0 if estimate exists
                    if (empty($bookingRow['final_fare']) || (float)$bookingRow['final_fare'] == 0) {
                        $bookingRow['final_fare'] = $bookingRow['estimated_fare'] ?? $bookingRow['base_fare'] ?? 0;
                    }
                } else {
                    // Fallback to enquiries table if not found in bookings
                    $stmt = $pdo->prepare('SELECT * FROM `enquiries` WHERE `booking_id` = ? LIMIT 1');
                    $stmt->execute([$bookingId]);
                    $enq = $stmt->fetch(PDO::FETCH_ASSOC);
                    if ($enq) {
                        $bookingRow = $enq;
                        // Map enquiry fields to expected bookingRow fields
                        $bookingRow['pickup_location'] = $enq['pickup'] ?? $enq['pickup_location'] ?? 'Pickup';
                        $bookingRow['drop_location'] = $enq['drop_location'] ?? 'Drop';
                        $bookingRow['car_name'] = $enq['vehicle_type'] ?? $enq['car_name'] ?? 'SEDAN';
                        $bookingRow['pickup_date'] = $enq['travel_date'] ?? $enq['pickup_date'] ?? '';
                        $bookingRow['pickup_time'] = $enq['travel_time'] ?? $enq['pickup_time'] ?? '';
                        $bookingRow['final_fare'] = $enq['fare_estimate'] ?? $enq['estimated_fare'] ?? $enq['final_fare'] ?? 0;
                        $bookingRow['fare_type'] = $enq['fare_type'] ?? 'exclusive';
                        $bookingRow['trip_type'] = $enq['trip_type'] ?? 'one_way';
                        $bookingRow['distance_km'] = $enq['distance_km'] ?? 0;
                        $bookingRow['duration'] = $enq['duration'] ?? '';
                    }
                }
            }
        } catch (Throwable $e) {}
    }
}

if (!$bookingRow && !empty($_SESSION['last_booking_' . $bookingId])) {
    $bookingRow = $_SESSION['last_booking_' . $bookingId];
}

$selectedVehicleType = strtoupper((string)($bookingRow['car_name'] ?? 'SEDAN'));
$vehicleInfo = null;
if (!empty($config['vehicles']) && is_array($config['vehicles'])) {
    foreach ($config['vehicles'] as $v) {
        if (strtoupper((string)($v['value'] ?? '')) === $selectedVehicleType) {
            $vehicleInfo = $v; break;
        }
    }
}

$isInclusive = ($bookingRow['fare_type'] ?? 'exclusive') === 'inclusive';
$tripType = strtolower($bookingRow['trip_type'] ?? '');
$isRoundTrip = (strpos($tripType, 'round') !== false || strpos($tripType, 'multi') !== false);

$includeTolls = $isInclusive;
$includeTaxes = $isInclusive;
if (!empty($bookingRow['fare_breakdown'])) {
    $fb = json_decode($bookingRow['fare_breakdown'], true);
    if (is_array($fb)) {
        if (isset($fb['includeTolls'])) {
            $includeTolls = (bool)$fb['includeTolls'];
        }
        if (isset($fb['includeTaxes'])) {
            $includeTaxes = (bool)$fb['includeTaxes'];
        }
    }
}

$inclusions = [
    'Air-conditioned vehicle with driver',
    'Base fare and fuel charges',
    'Driver allowance (bata)',
    'Complimentary meal break of up to 30 minutes',
    '24/7 customer support'
];
if ($includeTolls) { 
    $inclusions[] = 'Toll charges included'; 
}
if ($includeTaxes) { 
    $inclusions[] = 'State border tax included (if crossing state border)'; 
}

$extraKmRate = '?';
$tariffsPath = __DIR__ . '/../data/tariffs.json';
if (file_exists($tariffsPath)) {
    $tariffs = json_decode(file_get_contents($tariffsPath), true);
    if (is_array($tariffs)) {
        foreach ($tariffs as $t) {
            if (strtoupper($t['vehicle_type']) === strtoupper($selectedVehicleType) &&
                ((strpos($tripType, 'round') !== false && $t['trip_type'] === 'round') || 
                 (strpos($tripType, 'round') === false && $t['trip_type'] === 'oneway'))) {
                $extraKmRate = $t['per_km_rate'];
                break;
            }
        }
    }
}

$isHourlyTrip = strpos($tripType, 'hourly') !== false;
$garageText = ($isRoundTrip || $isHourlyTrip) ? ' - calculated garage-to-garage/until return to pickup point' : '';

$exclusions = [
    'Parking and entry fees, (if any)',
];
if (!$isHourlyTrip) {
    $exclusions[] = "Extra ₹{$extraKmRate}/KM (if exceeded the KMs calculated{$garageText})";
}
if (!$includeTolls) {
    $exclusions[] = 'Toll charges, as applicable';
}
if (!$includeTaxes) {
    $exclusions[] = 'State border tax (applicable only if crossing state border)';
}
if ($isRoundTrip) {
    $exclusions[] = 'Night allowance (after 10 PM), if applicable';
} elseif ($isHourlyTrip) {
    // Rental waiting/extra time & km is billed at the same hourly package
    // tariff, not a flat fee - matches assets/js/booking-form.js.
    $dcFaresCfg = null;
    $dcCfgPath = __DIR__ . '/../data/config.json';
    if (file_exists($dcCfgPath)) {
        $dcCfgJson = json_decode(file_get_contents($dcCfgPath), true);
        $dcFaresCfg = $dcCfgJson['fares'] ?? null;
    }
    $hourlyRate = $dcFaresCfg ? (int) ($dcFaresCfg['hourlyRates'][strtoupper($selectedVehicleType)] ?? 0) : 0;
    if ($hourlyRate > 0) {
        $exclusions[] = "Extra hour beyond package at ₹{$hourlyRate}/hr, Extra km beyond package at ₹" . round($hourlyRate / 10) . "/km (as per hourly tariff)";
    } else {
        $exclusions[] = 'Waiting or additional stop charges (₹150 per stop/hour), if availed';
    }
} else {
    $exclusions[] = 'Waiting or additional stop charges (₹150 per stop/hour), if availed';
}

// Pretty format date
$pickupDateRaw = $bookingRow['pickup_date'] ?? '';
$formattedPickupDate = $pickupDateRaw;
if (!empty($pickupDateRaw)) {
    $dateObj = DateTime::createFromFormat('Y-m-d', $pickupDateRaw);
    if ($dateObj) {
        $formattedPickupDate = $dateObj->format('D, d M Y');
    }
}

// Extract booking status and set dynamic page titles, descriptions, theme colors, etc.
$status = strtolower(trim($bookingRow['status'] ?? 'pending'));
if (empty($status) || !in_array($status, ['confirmed', 'pending', 'accepted', 'completed', 'cancelled'])) {
    $status = 'pending';
}

$statusTitle = 'Booking Request Placed!';
$statusDesc  = 'We have received your booking and are currently processing it.';
$statusColor = '#10b981'; // Green
$rippleColor = 'rgba(16, 185, 129, 0.3)';
$headingGradientEnd = 'var(--brand-blue)';
$enableSuccessConfetti = false;

if ($status === 'accepted') {
    // A partner has accepted the booking but hasn't assigned a specific
    // driver/car yet - see api/website-status-webhook.php. Keep the
    // wording reassuring and simple, not technical.
    $statusTitle = 'A Driver Partner Has Accepted!';
    $statusDesc  = 'Someone accepted your booking and is now assigning a driver. Please wait a little while - the driver will contact you shortly.';
    $statusColor = '#10b981'; // Green
    $rippleColor = 'rgba(16, 185, 129, 0.3)';
    $headingGradientEnd = 'var(--brand-blue)';
    $enableSuccessConfetti = false;
} elseif ($status === 'confirmed') {
    $statusTitle = 'Booking Confirmed!';
    $statusDesc  = 'Thank you for booking with Drop Cars. Your ride is guaranteed.';
    $statusColor = '#10b981'; // Green
    $rippleColor = 'rgba(16, 185, 129, 0.3)';
    $headingGradientEnd = 'var(--brand-blue)';
    $enableSuccessConfetti = true;
} elseif ($status === 'completed') {
    $statusTitle = 'Trip Completed!';
    $statusDesc  = 'We hope you had a comfortable and pleasant journey with Drop Cars.';
    $statusColor = '#2563eb'; // Blue
    $rippleColor = 'rgba(37, 99, 235, 0.3)';
    $headingGradientEnd = 'var(--brand-blue)';
    $enableSuccessConfetti = false;
} elseif ($status === 'cancelled') {
    $statusTitle = 'Booking Cancelled';
    $statusDesc  = 'This booking request has been cancelled. No charges were made.';
    $statusColor = '#ef4444'; // Red
    $rippleColor = 'rgba(239, 68, 68, 0.3)';
    $headingGradientEnd = 'var(--red)';
    $enableSuccessConfetti = false;
}

if (isset($_GET['view']) && $_GET['view'] === 'details') {
    $statusTitle = 'Booking Details & Confirmation';
    $statusDesc  = 'Detailed view of your trip and fare breakdown.';
    $enableSuccessConfetti = false;
}

$pageTitle = htmlspecialchars($statusTitle) . ' | Drop Cars';

// Calculate advance amount for this booking early to avoid undefined variable notices
$fareTotal    = (float)($bookingRow['final_fare'] ?? 0);
$calcAdvance  = (int)ceil($fareTotal * $advPercent / 100);
$advAmount    = max($advMinAmount, $calcAdvance);
$custNameAdv  = $bookingRow['customer_name'] ?? $_pfName ?? 'Customer';
$custPhoneAdv = $bookingRow['customer_phone'] ?? $bookingRow['phone'] ?? '';

// ── Live "Broadcasting..." countdown (status === 'pending' only) ───────────
// `is_urgent` mirrors the FastAPI backend's CustomerBookingRequest.is_urgent
// (see admin/sql/migrate-urgent-booking.sql - falls back to false, i.e. the
// normal window, on any DB where that migration hasn't been run yet).
// Timing itself always comes live from the backend's admin-configured
// settings, never hardcoded, per api/website_bookings.py's
// GET /api/website/bookings/settings.
$isUrgentBooking = !empty($bookingRow['is_urgent']);
$autoApproveSeconds = 900;
$urgentApproveSeconds = 120;
if ($status === 'pending') {
    try {
        require_once __DIR__ . '/../api/includes/backend-client.php';
        $settingsResult = dropcars_backend_request('GET', '/api/website/bookings/settings');
        if ($settingsResult['ok'] && is_array($settingsResult['data'])) {
            $autoApproveSeconds = (int) ($settingsResult['data']['auto_approve_seconds'] ?? $autoApproveSeconds);
            $urgentApproveSeconds = (int) ($settingsResult['data']['urgent_approve_seconds'] ?? $urgentApproveSeconds);
        }
    } catch (Throwable $e) {}
}
$broadcastWindowSeconds = $isUrgentBooking ? $urgentApproveSeconds : $autoApproveSeconds;
$bookingCreatedAtTs = !empty($bookingRow['created_at']) ? strtotime((string) $bookingRow['created_at']) : time();
if (!$bookingCreatedAtTs) { $bookingCreatedAtTs = time(); }
$broadcastElapsedSeconds = max(0, time() - $bookingCreatedAtTs);
$broadcastRemainingSeconds = max(0, $broadcastWindowSeconds - $broadcastElapsedSeconds);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($pageTitle); ?></title>
    <meta name="theme-color" content="#ffffff">
<?php dropcars_render_favicons($activeTheme['slug'] ?? null); ?>
    
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@500;600;700;800&family=Share+Tech+Mono&display=swap" rel="stylesheet">
    
    <link rel="stylesheet" href="/assets/css/base.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/base.css'); ?>">
    <link rel="stylesheet" href="/assets/css/layout.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/layout.css'); ?>">
    <link rel="stylesheet" href="/assets/css/navbar.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/navbar.css'); ?>">
    <link rel="stylesheet" href="/assets/css/theme-switcher.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/theme-switcher.css'); ?>">
    <link rel="stylesheet" href="/assets/css/footer.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/footer.css'); ?>">
    <link rel="stylesheet" href="/assets/css/responsive.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/responsive.css'); ?>">
    <link rel="stylesheet" href="/assets/css/whatsapp.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/whatsapp.css'); ?>">
    <link rel="stylesheet" href="/assets/css/dark-mode.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/dark-mode.css'); ?>">
    <link rel="stylesheet" href="/assets/css/light-theme.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/light-theme.css'); ?>">
    <script src="/assets/js/dark-mode.js?v=<?php echo @filemtime(__DIR__ . '/../assets/js/dark-mode.js'); ?>"></script>
    <style>
        :root {
            --success: #059669;
            --success-bg: #ecfdf5;
            --bg-page: #f8fafc;
            --card-border: rgba(148, 163, 184, 0.12);
            --card-bg: #ffffff;
            --muted-text: #64748b;
            --main-text: #0f172a;
            --gold: #f59e0b;
            --wa-green: #128c7e;
            --dark-blue: #1e3a8a;
            --brand-blue: #2563eb;
            --mesh-1: #e0f2fe;
            --mesh-2: #f0fdf4;
            --mesh-3: #eff6ff;
            --ripple-color: rgba(5, 150, 105, 0.4);
            --accent-glow: rgba(37, 99, 235, 0.04);
        }

        [data-active-theme-id="drop-taxi-dark"],
        html.dark-mode {
            --success: #34d399;
            --success-bg: rgba(6, 78, 59, 0.2);
            --bg-page: #030712;
            --card-bg: #0b0f19;
            --card-border: rgba(255,255,255,0.06);
            --main-text: #f8fafc;
            --muted-text: #94a3b8;
            --mesh-1: #1e1b4b;
            --mesh-2: #022c22;
            --mesh-3: #0f172a;
            --ripple-color: rgba(52, 211, 153, 0.3);
            --accent-glow: rgba(37, 99, 235, 0.08);
        }

        body { 
            background: var(--bg-page); 
            background-image: 
                radial-gradient(at 0% 0%, var(--mesh-1) 0, transparent 55%), 
                radial-gradient(at 50% 0%, var(--mesh-2) 0, transparent 55%), 
                radial-gradient(at 100% 0%, var(--mesh-3) 0, transparent 55%);
            background-attachment: fixed;
            color: var(--main-text); 
            font-family: 'Inter', sans-serif; 
            overflow-x: hidden; 
            margin: 0;
            padding: 0;
        }
        .outfit { font-family: 'Outfit', sans-serif; }

        .container-sm { max-width: 680px; margin: 0 auto; padding: 1.5rem 1rem 2rem; animation: fadeInUp 0.8s ease-out both; position: relative; }

        @keyframes fadeInUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes successPop {
            0% { transform: scale(0.3); opacity: 0; filter: blur(5px); }
            50% { transform: scale(1.1); opacity: 1; filter: blur(0px); }
            75% { transform: scale(0.95); }
            100% { transform: scale(1); opacity: 1; }
        }
        @keyframes checkDraw {
            from { stroke-dashoffset: 60; }
            to { stroke-dashoffset: 0; }
        }
        @keyframes ripple {
            0% { transform: scale(0.85); opacity: 0.8; }
            100% { transform: scale(2.6); opacity: 0; }
        }

        .success-blob-wrapper { position: relative; width: 130px; height: 130px; margin: 0 auto 1.5rem; display: flex; align-items: center; justify-content: center; }
        .success-blob { 
            width: 100px; height: 100px; 
            color: #ffffff; 
            border-radius: 50%; display: flex; align-items: center; justify-content: center; 
            animation: successPop 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) both;
            z-index: 5; position: relative;
        }
        .success-blob.state-confirmed {
            background: linear-gradient(135deg, #10b981, #059669); 
            box-shadow: 0 12px 30px rgba(5, 150, 105, 0.3);
        }
        .success-blob.state-pending {
            background: linear-gradient(135deg, #10b981, #059669); 
            box-shadow: 0 12px 30px rgba(16, 185, 129, 0.3);
        }
        .success-blob.state-completed {
            background: linear-gradient(135deg, #2563eb, #1d4ed8); 
            box-shadow: 0 12px 30px rgba(37, 99, 235, 0.3);
        }
        .success-blob.state-cancelled {
            background: linear-gradient(135deg, #ef4444, #dc2626); 
            box-shadow: 0 12px 30px rgba(239, 68, 68, 0.3);
        }
        .success-blob-ripple {
            position: absolute; width: 100px; height: 100px; 
            border: 2px solid var(--ripple-color); border-radius: 50%;
            animation: ripple 2.2s cubic-bezier(0.23, 1, 0.32, 1) infinite; z-index: 1;
            pointer-events: none;
        }
        .success-blob svg { width: 44px; height: 44px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1)); }
        .success-blob svg path {
            stroke-dasharray: 60;
            stroke-dashoffset: 60;
            animation: checkDraw 0.6s 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
        }

        .ty-hero { text-align: center; margin-bottom: 2rem; }
        .ty-hero h1 { 
            font-size: 2.2rem; font-weight: 850; margin: 0; letter-spacing: -0.03em; font-family: 'Outfit'; 
            background: linear-gradient(135deg, var(--main-text), var(--brand-blue));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .ty-hero p { 
            color: var(--muted-text); font-size: 1rem; font-weight: 600; margin: 0.35rem 0 0;
        }

        .glass-block { 
            background: var(--card-bg);
            border: 1px solid var(--card-border); border-radius: 20px; 
            padding: 1.25rem; margin-bottom: 1rem; 
            box-shadow: 0 4px 20px rgba(0,0,0,0.01);
            position: relative; overflow: hidden;
            transition: border-color 0.3s ease;
        }
        .glass-block:hover {
            border-color: rgba(37, 99, 235, 0.1);
        }

        .block-label { font-size: 0.7rem; text-transform: uppercase; color: var(--brand-blue); font-weight: 800; letter-spacing: 0.08em; margin-bottom: 1.25rem; display: block; }
        
        /* Overlap fix: absolute separation between routes and booking tag, especially on mobile */
        .trip-header-wrap { display: flex; flex-direction: column; gap: 1.5rem; margin-bottom: 2rem; }
        @media (min-width: 580px) {
            .trip-header-wrap { flex-direction: row; justify-content: space-between; align-items: flex-start; }
        }
        
        .trip-route-section { flex: 1; min-width: 0; }
        .trip-route { font-size: 1.5rem; font-weight: 850; margin: 0; font-family: 'Outfit'; line-height: 1.3; word-wrap: break-word; }
        .trip-route-arrow { color: var(--gold); margin: 0 0.5rem; display: inline-block; transform: scale(1.1); }
        .trip-meta { font-size: 0.95rem; color: var(--muted-text); font-weight: 500; margin-top: 0.5rem; line-height: 1.5; }
        .trip-meta strong { color: var(--main-text); font-weight: 700; }

        /* Deluxe tag design for Reference */
        .booking-badge-container { display: flex; align-items: center; }
        .booking-badge {
            background: var(--bg-page);
            border: 1px solid var(--card-border);
            padding: 0.6rem 1rem;
            border-radius: 14px;
            font-family: 'Outfit', monospace;
            font-size: 1rem;
            font-weight: 800;
            display: inline-flex;
            align-items: center;
            gap: 0.75rem;
            color: var(--main-text);
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.01);
            position: relative;
        }
        .copy-btn {
            background: transparent; border: none; cursor: pointer; color: var(--muted-text);
            padding: 0.2rem; border-radius: 6px; display: flex; align-items: center; justify-content: center;
            transition: all 0.2s;
        }
        .copy-btn:hover { color: var(--brand-blue); background: rgba(37, 99, 235, 0.08); }
        .copy-tooltip {
            position: absolute; bottom: -30px; left: 50%; transform: translateX(-50%);
            background: #0f172a; color: #fff; font-size: 0.75rem; padding: 0.2rem 0.5rem;
            border-radius: 4px; pointer-events: none; opacity: 0; transition: opacity 0.2s;
            font-family: 'Inter', sans-serif; font-weight: 500;
        }
        .copy-tooltip.show { opacity: 1; }

        /* Smart Grid for Distance & Duration - Keeps items in 1 row compactly on mobile! */
        .stats-grid { 
            display: grid; 
            grid-template-columns: repeat(3, 1fr); 
            gap: 0.5rem; 
            margin-bottom: 1rem; 
        }
        .stat-item { 
            background: var(--card-bg); 
            border: 1px solid var(--card-border); 
            border-radius: 14px; 
            padding: 0.5rem 0.3rem; 
            text-align: center;
            display: flex;
            flex-direction: column;
            justify-content: center;
            box-shadow: 0 4px 10px rgba(0,0,0,0.01);
            min-width: 0; /* Fixes overlapping issues in grid */
        }
        .stat-val {
            font-size: 1.05rem;
            font-weight: 800;
            color: var(--main-text);
            font-family: 'Outfit';
            margin-bottom: 0.1rem;
            overflow-wrap: break-word;
            word-break: break-word;
        }
        .stat-lbl {
            font-size: 0.6rem;
            color: var(--muted-text);
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            overflow-wrap: break-word;
            word-break: break-word;
        }
        @media (min-width: 480px) {
            .stats-grid { gap: 1rem; }
            .stat-item { padding: 1rem; }
            .stat-val { font-size: 1.25rem; }
            .stat-lbl { font-size: 0.725rem; }
        }

        /* Prevent button crowding on small screens */
        .btn-grid-premium { gap: 0.85rem; }
        .btn-action-deluxe { padding: 1.1rem 1rem; }

        /* Vehicle details wrapper */
        .v-badge-premium { display: flex; gap: 1rem; background: var(--accent-glow); padding: 1rem; border-radius: 16px; border: 1px solid rgba(37, 99, 235, 0.15); margin-bottom: 1.5rem; align-items: center; }
        .v-icon { width: 42px; height: 42px; background: #fff; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; box-shadow: 0 4px 12px rgba(0,0,0,0.04); flex-shrink: 0; }
        .v-info { flex: 1; min-width: 0; }
        .v-info strong { color: var(--main-text); font-size: 1rem; display: block; font-family: 'Outfit'; margin-bottom: 0.15rem; }
        .v-info span { font-size: 0.8rem; color: var(--muted-text); font-weight: 500; line-height: 1.3; display: block; }

        /* Clean overlap-free button grid with proper labels */
        .btn-grid-premium { display: grid; grid-template-columns: 1fr; gap: 0.75rem; margin-top: 1rem; }
        @media (min-width: 480px) { .btn-grid-premium { grid-template-columns: 1fr 1fr; } }
        
        .btn-action-deluxe { 
            padding: 1rem; border-radius: 16px; font-weight: 700; font-size: 0.9rem;
            text-decoration: none; text-align: center; display: inline-flex; align-items: center; justify-content: center; gap: 0.6rem; transition: all 0.25s;
            border: 1px solid transparent; cursor: pointer; font-family: 'Outfit', sans-serif;
        }
        .btn-gold-deluxe { background: var(--gold); color: #000; box-shadow: 0 4px 15px rgba(245, 158, 11, 0.2); }
        .btn-green-deluxe { background: var(--wa-green); color: #fff; box-shadow: 0 4px 15px rgba(18, 140, 126, 0.2); }
        .btn-blue-deluxe { background: var(--brand-blue); color: #fff; box-shadow: 0 4px 15px rgba(37, 99, 235, 0.2); }
        .btn-blue-outline { background: transparent; border-color: var(--brand-blue); color: var(--brand-blue); }
        .btn-green-outline { background: transparent; border-color: var(--wa-green); color: var(--wa-green); }
        .btn-green-outline:hover { background: rgba(18, 140, 126, 0.05); }
        .btn-red-outline { background: transparent; border-color: #ef4444; color: #ef4444; }
        .btn-red-outline:hover { background: rgba(239, 68, 68, 0.06); }
        .btn-gold-deluxe:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(245, 158, 11, 0.35); }
        .btn-green-deluxe:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(18, 140, 126, 0.35); }
        .btn-blue-deluxe:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(37, 99, 235, 0.35); }
        .btn-blue-outline:hover { background: rgba(37, 99, 235, 0.05); }

        .btn-full-blue { background: var(--brand-blue); color: #fff; width: 100%; margin-top: 0.75rem; padding: 1.15rem; font-size: 1.05rem; border-radius: 16px; box-shadow: 0 6px 20px rgba(37, 99, 235, 0.2); }
        .btn-full-blue:hover { transform: translateY(-2px); box-shadow: 0 10px 25px rgba(37, 99, 235, 0.35); }

        /* ── Realtime Updates & Rewards Pop-up Modal & Docking Styles ── */

        /* Background blur when modal is open - #cancel-modal-overlay reuses
           this same overlay shell (moved to a <body> child at runtime, same
           as #sug-modal-overlay), so it must be excluded here too or it
           would blur itself. */
        body.dropcars-modal-open > *:not(#sug-modal-overlay):not(#cancel-modal-overlay) {
            filter: blur(7px) brightness(0.75);
            transition: filter 0.38s ease;
            will-change: filter;
        }
        body.dropcars-modal-open > #sug-modal-overlay,
        body.dropcars-modal-open > #cancel-modal-overlay {
            /* overlay itself is never blurred */
            filter: none !important;
        }

        .sug-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            /* pointer-events:none on overlay lets page scroll through */
            pointer-events: none;
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
            box-sizing: border-box;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.38s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.38s ease;
        }
        .sug-modal-overlay.active {
            opacity: 1;
            visibility: visible;
        }
        .sug-modal-overlay.closing {
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s ease-in, visibility 0.3s ease-in;
        }

        /* Card re-enables pointer events — this is the only clickable element */
        .sug-modal-card {
            position: relative;
            max-width: 560px;
            width: 94%;
            max-height: 86vh;
            margin: auto;
            overflow-y: auto;
            overflow-x: hidden;
            border-radius: 26px;
            transform: scale(0.85) translateY(22px);
            transition: transform 0.42s cubic-bezier(0.34, 1.56, 0.64, 1);
            -webkit-overflow-scrolling: touch;
            pointer-events: auto; /* only the card captures clicks/taps */
        }
        .sug-modal-card::-webkit-scrollbar { width: 4px; }
        .sug-modal-card::-webkit-scrollbar-thumb {
            background: rgba(148, 163, 184, 0.4);
            border-radius: 10px;
        }
        .sug-modal-overlay.active .sug-modal-card {
            transform: scale(1) translateY(0);
        }
        .sug-modal-overlay.closing .sug-modal-card {
            transform: scale(0.9) translateY(14px);
            transition: transform 0.3s ease-in;
        }

        .sug-modal-close-btn {
            position: absolute;
            top: 0.8rem;
            right: 0.8rem;
            width: 34px;
            height: 34px;
            border-radius: 50%;
            background: rgba(15, 23, 42, 0.1);
            border: 1px solid rgba(148, 163, 184, 0.25);
            color: #475569;
            font-size: 1.3rem;
            line-height: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s ease;
            z-index: 25;
            pointer-events: auto;
        }
        .sug-modal-close-btn:hover {
            background: #ef4444;
            color: #fff;
            border-color: #ef4444;
            transform: rotate(90deg) scale(1.1);
            box-shadow: 0 4px 14px rgba(239,68,68,0.4);
        }
        [data-active-theme-id="drop-taxi-dark"] .sug-modal-close-btn,
        html.dark-mode .sug-modal-close-btn {
            background: rgba(255, 255, 255, 0.12);
            border-color: rgba(255, 255, 255, 0.2);
            color: #f8fafc;
        }

        .login-suggestion-card {
            position: relative;
            background: linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(16, 185, 129, 0.08) 100%), var(--card-bg);
            border: 1.5px solid rgba(37, 99, 235, 0.22);
            border-radius: 22px;
            padding: 1.5rem;
            margin: 1.5rem 0 2rem 0;
            box-shadow: 0 12px 35px rgba(37, 99, 235, 0.08);
            overflow: hidden;
            text-align: left;
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .sug-modal-card-inner {
            margin: 0 !important;
            box-shadow: 0 25px 65px rgba(15, 23, 42, 0.35), 0 10px 30px rgba(37, 99, 235, 0.25) !important;
            border-color: rgba(37, 99, 235, 0.35) !important;
        }
        .login-suggestion-card:hover {
            box-shadow: 0 16px 45px rgba(37, 99, 235, 0.14);
        }
        .login-sug-glow {
            position: absolute;
            top: -50px;
            right: -50px;
            width: 160px;
            height: 160px;
            background: radial-gradient(circle, rgba(37, 99, 235, 0.15) 0%, transparent 70%);
            border-radius: 50%;
            pointer-events: none;
        }
        .login-sug-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.5rem;
            margin-bottom: 0.85rem;
            flex-wrap: wrap;
        }
        .login-sug-badge {
            display: inline-flex;
            align-items: center;
            gap: 0.45rem;
            background: rgba(37, 99, 235, 0.1);
            color: var(--brand-blue);
            font-size: 0.725rem;
            font-weight: 800;
            letter-spacing: 0.06em;
            padding: 0.35rem 0.75rem;
            border-radius: 20px;
            text-transform: uppercase;
        }
        .pulse-dot {
            width: 8px;
            height: 8px;
            background: var(--brand-blue);
            border-radius: 50%;
            box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.7);
            animation: pulseDot 1.8s infinite;
        }
        @keyframes pulseDot {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(37, 99, 235, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
        }
        .reward-points-pill {
            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
            color: #ffffff;
            font-size: 0.775rem;
            font-weight: 800;
            padding: 0.35rem 0.85rem;
            border-radius: 20px;
            box-shadow: 0 3px 10px rgba(245, 158, 11, 0.3);
            font-family: 'Outfit', sans-serif;
        }
        .login-sug-title {
            font-family: 'Outfit', sans-serif;
            font-size: 1.25rem;
            font-weight: 800;
            color: var(--main-text);
            line-height: 1.35;
            margin: 0 0 0.4rem 0;
            letter-spacing: -0.01em;
        }
        .login-sug-desc {
            font-size: 0.875rem;
            color: var(--muted-text);
            line-height: 1.5;
            margin: 0 0 1.2rem 0;
        }
        .login-sug-features {
            display: grid;
            grid-template-columns: 1fr;
            gap: 0.75rem;
            margin-bottom: 1.25rem;
        }
        @media (min-width: 540px) {
            .login-sug-features {
                grid-template-columns: repeat(3, 1fr);
            }
        }
        .sug-feat-item {
            display: flex;
            align-items: flex-start;
            gap: 0.65rem;
            background: rgba(255, 255, 255, 0.75);
            border: 1px solid rgba(226, 232, 240, 0.9);
            padding: 0.8rem;
            border-radius: 14px;
        }
        [data-active-theme-id="drop-taxi-dark"] .sug-feat-item,
        html.dark-mode .sug-feat-item {
            background: rgba(15, 23, 42, 0.6);
            border-color: rgba(255, 255, 255, 0.08);
        }
        .sug-feat-icon {
            font-size: 1.3rem;
            line-height: 1;
            flex-shrink: 0;
            margin-top: 2px;
        }
        .sug-feat-item strong {
            display: block;
            font-size: 0.825rem;
            font-weight: 700;
            color: var(--main-text);
            font-family: 'Outfit', sans-serif;
            margin-bottom: 0.15rem;
        }
        .sug-feat-item span {
            display: block;
            font-size: 0.725rem;
            color: var(--muted-text);
            line-height: 1.35;
        }
        .login-sug-actions {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.5rem;
        }
        .btn-sug-login {
            width: 100%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.6rem;
            background: linear-gradient(135deg, var(--brand-blue) 0%, #1d4ed8 100%);
            color: #ffffff;
            font-family: 'Outfit', sans-serif;
            font-weight: 800;
            font-size: 1.025rem;
            padding: 0.95rem 1.5rem;
            border-radius: 14px;
            text-decoration: none;
            box-shadow: 0 6px 20px rgba(37, 99, 235, 0.3);
            transition: all 0.25s ease;
        }
        .btn-sug-login:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 28px rgba(37, 99, 235, 0.45);
        }
        .login-sug-subtext {
            font-size: 0.75rem;
            color: var(--muted-text);
            font-weight: 500;
        }

        .logged-in-status-bar {
            background: rgba(16, 185, 129, 0.08);
            border: 1.5px solid rgba(16, 185, 129, 0.25);
            border-radius: 18px;
            padding: 1rem 1.25rem;
            margin: 1.25rem 0 1.75rem 0;
            text-align: left;
        }
        .logged-in-inner {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            flex-wrap: wrap;
        }
        .logged-in-icon { font-size: 1.4rem; }
        .logged-in-text strong { display: block; font-size: 0.925rem; color: var(--main-text); font-family: 'Outfit'; }
        .logged-in-text span { font-size: 0.775rem; color: var(--muted-text); }
        .btn-goto-dash {
            background: #10b981;
            color: #ffffff;
            font-weight: 700;
            font-size: 0.825rem;
            padding: 0.55rem 1rem;
            border-radius: 10px;
            text-decoration: none;
            transition: background 0.2s, transform 0.2s;
            font-family: 'Outfit', sans-serif;
        }
        .btn-goto-dash:hover { background: #059669; transform: translateY(-1px); }

        /* Policy lists styling */
        .policy-wrap-premium { display: grid; grid-template-columns: 1fr; gap: 1.75rem; border-top: 1px solid var(--card-border); margin-top: 1.75rem; padding-top: 1.75rem; }
        @media (min-width: 550px) { .policy-wrap-premium { grid-template-columns: 1fr 1fr; } }
        .policy-list h5 { font-size: 0.75rem; color: var(--brand-blue); text-transform: uppercase; margin: 0 0 0.85rem; letter-spacing: 0.08em; font-family: 'Outfit'; }
        .policy-list ul { list-style: none; padding: 0; margin: 0; }
        .policy-list li { font-size: 0.85rem; margin-bottom: 0.65rem; display: flex; align-items: flex-start; gap: 0.6rem; color: var(--muted-text); font-weight: 500; line-height: 1.4; }
        .policy-list li svg { flex-shrink: 0; margin-top: 0.15rem; }
        
        /* Modern Process Timeline / Stepper */
        .stepper-block { margin-top: 1rem; }
        .stepper-header { font-size: 1rem; font-weight: 800; color: var(--main-text); margin-bottom: 1.25rem; font-family: 'Outfit'; }
        .stepper { display: flex; flex-direction: column; gap: 1.5rem; position: relative; }
        .stepper::before { content: ''; position: absolute; left: 15px; top: 12px; bottom: 12px; width: 2px; background: var(--card-border); }
        .step { display: flex; gap: 1.25rem; position: relative; }
        .step-num { width: 32px; height: 32px; border-radius: 50%; background: var(--bg-page); border: 2px solid var(--card-border); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 800; font-family: 'Outfit'; z-index: 2; flex-shrink: 0; transition: all 0.3s; color: var(--muted-text); }
        .step.active .step-num { background: var(--brand-blue); border-color: var(--brand-blue); color: #fff; box-shadow: 0 4px 10px rgba(37, 99, 235, 0.3); }
        .step-content { flex: 1; min-width: 0; }
        .step-title { font-size: 0.95rem; font-weight: 700; color: var(--main-text); margin-bottom: 0.2rem; font-family: 'Outfit'; }
        .step-desc { font-size: 0.825rem; color: var(--muted-text); line-height: 1.4; margin: 0; font-weight: 500; }

        /* Confetti Pieces */
        .confetti-container { position: absolute; top: 0; left: 0; width: 100%; height: 350px; pointer-events: none; overflow: hidden; z-index: 10; }
        .confetti { position: absolute; width: 10px; height: 10px; opacity: 0.8; }
        @keyframes fall {
            0% { transform: translateY(-100px) rotate(0deg); opacity: 1; }
            100% { transform: translateY(350px) rotate(720deg); opacity: 0; }
        }

        /* Pay Advance Overlay styling */
        .qr-overlay { 
            position: fixed; 
            top: 0; 
            left: 0; 
            width: 100%; 
            height: 100%; 
            background: rgba(15,23,42,0.8); 
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            z-index: 99999; 
            display: none; 
            align-items: center; 
            justify-content: center; 
            padding: 1.25rem;
            box-sizing: border-box;
        }
        .qr-overlay.active { display: flex; animation: fadeIn 0.3s ease; }
        .qr-card { 
            background: var(--card-bg); 
            border: 1px solid var(--card-border); 
            padding: 1.5rem 1.25rem 1.25rem; 
            border-radius: 28px; 
            max-width: 380px; 
            width: 100%; 
            margin: auto;
            text-align: center; 
            box-shadow: 0 20px 50px rgba(0,0,0,0.15); 
            animation: fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
            box-sizing: border-box;
        }
        .qr-img { width: 100%; max-width: 200px; margin: 1.5rem auto; border-radius: 16px; border: 1px solid var(--card-border); padding: 0.5rem; background: #fff; box-sizing: border-box; }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        /* Collapsible compare details style */
        .other-rates-details {
            margin-top: 1.25rem;
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: 16px;
            padding: 1rem 1.25rem;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 4px 12px rgba(0,0,0,0.01);
        }
        .other-rates-details:hover {
            border-color: rgba(37, 99, 235, 0.2);
            box-shadow: 0 6px 15px rgba(37, 99, 235, 0.03);
        }
        .other-rates-details[open] {
            border-color: rgba(37, 99, 235, 0.25);
        }
        .other-rates-summary {
            font-weight: 700;
            color: var(--brand-blue);
            font-size: 0.9rem;
            font-family: 'Outfit', sans-serif;
            list-style: none;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            outline: none;
            user-select: none;
        }
        .other-rates-summary::-webkit-details-marker {
            display: none; /* Hide default browser arrow */
        }
        .other-rates-summary svg {
            transition: transform 0.25s ease;
        }
        .other-rates-details[open] .other-rates-summary svg {
            transform: rotate(180deg);
        }

        /* Stateful Payment Card Styling */
        .payment-status-card {
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: 24px;
            padding: 1.5rem;
            margin-bottom: 1.5rem;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.02);
            position: relative;
            overflow: hidden;
            transition: all 0.3s ease;
            animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        
        .payment-card-inner {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }
        
        .payment-card-header {
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }
        
        .payment-card-title {
            font-size: 1.1rem;
            font-weight: 850;
            font-family: 'Outfit', sans-serif;
            color: var(--main-text);
        }
        
        .payment-card-desc {
            font-size: 0.875rem;
            color: var(--muted-text);
            line-height: 1.55;
            margin: 0;
            font-weight: 500;
        }
        
        .highlight-text {
            color: var(--gold);
            font-weight: 800;
        }
        
        .payment-card-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 0.75rem;
            margin-top: 0.5rem;
        }
        
        .btn-pay-now {
            background: linear-gradient(135deg, var(--gold), #d97706);
            color: #000;
            border: none;
            border-radius: 14px;
            padding: 0.85rem 1.5rem;
            font-weight: 800;
            font-size: 0.9rem;
            font-family: 'Outfit', sans-serif;
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: 0 4px 15px rgba(245, 158, 11, 0.2);
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }
        
        .btn-pay-now:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(245, 158, 11, 0.35);
        }
        
        .btn-continue-no-pay {
            background: transparent;
            border: 1px solid var(--card-border);
            color: var(--muted-text);
            border-radius: 14px;
            padding: 0.85rem 1.5rem;
            font-weight: 700;
            font-size: 0.9rem;
            font-family: 'Outfit', sans-serif;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        
        .btn-continue-no-pay:hover {
            background: rgba(148, 163, 184, 0.05);
            color: var(--main-text);
            border-color: var(--muted-text);
        }

        .btn-small-gold {
            background: linear-gradient(135deg, var(--brand-blue), var(--dark-blue));
            color: #fff;
            box-shadow: 0 4px 15px rgba(37, 99, 235, 0.2);
        }
        .btn-small-gold:hover {
            box-shadow: 0 8px 25px rgba(37, 99, 235, 0.35);
        }
        
        .text-slate { color: var(--muted-text) !important; }
        .text-gold { color: var(--gold) !important; }
        .text-green { color: var(--success) !important; }
        
        /* Interactive Dot indicators */
        .pulse-ring {
            width: 12px;
            height: 12px;
            background: var(--gold);
            border-radius: 50%;
            display: inline-block;
            position: relative;
        }
        .pulse-ring::after {
            content: '';
            position: absolute;
            width: 100%;
            height: 100%;
            background: var(--gold);
            border-radius: 50%;
            animation: ripple 1.6s infinite ease-out;
            top: 0;
            left: 0;
        }
        
        /* Live "Broadcasting..." status card - status === 'pending' only.
           Polls api/check-trip-status.php every ~6s (see script at bottom)
           and swaps its own text/color in place when the status flips to
           accepted/cancelled, or reloads the page on confirmed to reveal
           the driver-assigned view further down. */
        .broadcast-status-card {
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: 20px;
            padding: 1.1rem 1.25rem;
            margin: 1.25rem 0;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.02);
            animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .broadcast-status-inner {
            display: flex;
            align-items: center;
            gap: 0.85rem;
            flex-wrap: wrap;
        }
        .broadcast-pulse-dot {
            flex-shrink: 0;
            width: 12px;
            height: 12px;
            background: var(--gold);
            border-radius: 50%;
            display: inline-block;
            position: relative;
        }
        .broadcast-pulse-dot::after {
            content: '';
            position: absolute;
            width: 100%;
            height: 100%;
            background: var(--gold);
            border-radius: 50%;
            animation: ripple 1.6s infinite ease-out;
            top: 0;
            left: 0;
        }
        .broadcast-status-card.is-accepted .broadcast-pulse-dot,
        .broadcast-status-card.is-accepted .broadcast-pulse-dot::after {
            background: var(--success);
        }
        .broadcast-status-card.is-cancelled .broadcast-pulse-dot,
        .broadcast-status-card.is-cancelled .broadcast-pulse-dot::after {
            background: #ef4444;
        }
        .broadcast-status-text {
            flex: 1;
            min-width: 180px;
            display: flex;
            flex-direction: column;
            gap: 0.2rem;
        }
        .broadcast-status-text strong {
            font-size: 0.95rem;
            font-family: 'Outfit', sans-serif;
            color: var(--main-text);
        }
        .broadcast-status-text span {
            font-size: 0.8rem;
            color: var(--muted-text);
        }
        #broadcast-countdown {
            font-family: 'Share Tech Mono', monospace;
            font-weight: 700;
            color: var(--gold);
        }
        .broadcast-status-card.is-accepted #broadcast-countdown,
        .broadcast-status-card.is-accepted .broadcast-status-text strong {
            color: var(--success);
        }
        .broadcast-call-support {
            flex-shrink: 0;
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            background: transparent;
            border: 1px solid var(--card-border);
            color: var(--main-text);
            border-radius: 12px;
            padding: 0.55rem 0.9rem;
            font-size: 0.78rem;
            font-weight: 700;
            font-family: 'Outfit', sans-serif;
            text-decoration: none;
            transition: all 0.2s ease;
        }
        .broadcast-call-support:hover {
            background: rgba(148, 163, 184, 0.08);
            border-color: var(--brand-blue);
            color: var(--brand-blue);
        }

        .queue-dot {
            width: 12px;
            height: 12px;
            background: #64748b;
            border-radius: 50%;
            display: inline-block;
        }
        
        .pending-ring {
            width: 12px;
            height: 12px;
            background: var(--gold);
            border-radius: 50%;
            display: inline-block;
            animation: dotPulse 1.5s infinite ease-in-out;
        }
        
        .verified-dot {
            width: 18px;
            height: 18px;
            background: var(--success);
            color: #fff;
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 0.7rem;
            font-weight: 900;
        }
        
        /* Card States custom background shadows */
        .payment-status-card:has(.queue-state) {
            border-color: var(--card-border);
            background: linear-gradient(135deg, var(--card-bg), rgba(148, 163, 184, 0.02));
        }
        
        .payment-status-card:has(.pending-state) {
            border-color: rgba(245, 158, 11, 0.25);
            background: linear-gradient(135deg, var(--card-bg), rgba(245, 158, 11, 0.03));
        }
        
        .payment-status-card:has(.verified-state) {
            border-color: rgba(16, 185, 129, 0.25);
            background: linear-gradient(135deg, var(--card-bg), rgba(16, 185, 129, 0.03));
        }

        .btn-center-inline {
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
        }

        /* COMMERCIAL LICENSE PLATE BADGE */
        @keyframes plate-pulse {
            0% { box-shadow: 0 4px 10px rgba(0,0,0,0.1), 0 0 0 0px rgba(251, 192, 45, 0.3); }
            100% { box-shadow: 0 4px 10px rgba(0,0,0,0.1), 0 0 0 8px rgba(251, 192, 45, 0); }
        }
        .ind-plate {
            display: inline-flex;
            align-items: center;
            background: linear-gradient(180deg, #ffd54f 0%, #fbc02d 100%);
            border: 2px solid #222;
            border-radius: 6px;
            padding: 0.25rem 0.5rem;
            color: #111;
            font-family: 'Share Tech Mono', monospace;
            font-weight: 800;
            font-size: 1rem;
            letter-spacing: 1.2px;
            animation: plate-pulse 3s infinite;
            white-space: nowrap;
            flex-shrink: 0;
            box-sizing: border-box;
            max-width: 100%;
            position: relative;
            box-shadow: 
                0 4px 15px rgba(0,0,0,0.1),
                inset 0 1px 0 rgba(255,255,255,0.4),
                inset 0 -1px 0 rgba(0,0,0,0.1);
        }
        .ind-plate .ind-side {
            font-size: 0.45rem;
            border-right: 1.5px solid rgba(0,0,0,0.2);
            padding-right: 6px;
            margin-right: 8px;
            display: flex;
            flex-direction: column;
            align-items: center;
            line-height: 1.1;
            font-family: 'Inter', sans-serif;
            font-weight: 900;
            color: #222;
            opacity: 0.85;
        }
        .ind-plate .ind-seal {
            position: absolute;
            top: 2px;
            right: 4px;
            font-size: 0.35rem;
            opacity: 0.15;
            pointer-events: none;
            font-family: 'Inter';
            font-weight: 900;
        }

        .driver-details-grid {
            display: flex;
            flex-direction: row;
            justify-content: space-between;
            align-items: flex-end;
            gap: 0.5rem;
        }
        /* Modernized Driver card - No dashed lines, just clean design */
        .driver-ticket {
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: 20px;
            overflow: hidden;
            margin-bottom: 1rem;
            box-shadow: 0 4px 15px rgba(0,0,0,0.01);
            animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .ticket-header {
            background: var(--accent-glow);
            padding: 0.75rem 1.25rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--card-border);
        }
    </style>
<script>window.DROP_CARS_THEME_SLUG = <?php echo json_encode($activeTheme['slug'] ?? 'drop-cars'); ?>;</script>
<?php include __DIR__ . '/../includes/google-tag.php'; ?>
</head>
<body data-active-theme-id="<?php echo htmlspecialchars($activeTheme['id'] ?? 'drop-taxi'); ?>">
<?php echo $shell->renderHeader(); ?>

<main class="container-sm">
    <div class="confetti-container" id="confetti-container"></div>
    
    <div class="ty-hero">
        <div class="success-blob-wrapper">
            <div class="success-blob-ripple" style="animation-delay: 0s; border-color: <?php echo $rippleColor; ?>;"></div>
            <div class="success-blob-ripple" style="animation-delay: 0.6s; border-color: <?php echo $rippleColor; ?>;"></div>
            <div class="success-blob-ripple" style="animation-delay: 1.2s; border-color: <?php echo $rippleColor; ?>;"></div>
            <div class="success-blob state-<?php echo $status; ?>">
                <?php if ($status === 'confirmed' || $status === 'pending'): ?>
                    <svg fill="none" stroke="currentColor" stroke-width="4.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg>
                <?php elseif ($status === 'completed'): ?>
                    <svg fill="none" stroke="currentColor" stroke-width="3.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <?php elseif ($status === 'cancelled'): ?>
                    <svg fill="none" stroke="currentColor" stroke-width="4.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
                <?php endif; ?>
            </div>
        </div>
        <h1 style="background: linear-gradient(135deg, var(--main-text), <?php echo $headingGradientEnd; ?>); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
            <?php echo htmlspecialchars($statusTitle); ?>
        </h1>
        <p><?php echo htmlspecialchars($statusDesc); ?></p>
    </div>

    <?php if ($status === 'pending'): ?>
    <!-- LIVE "BROADCASTING..." STATUS + COUNTDOWN - polled by JS at the bottom of this page -->
    <div class="broadcast-status-card" id="broadcast-status-card">
        <div class="broadcast-status-inner">
            <span class="broadcast-pulse-dot" id="broadcast-pulse-dot" aria-hidden="true"></span>
            <div class="broadcast-status-text">
                <strong id="broadcast-status-title"><?php echo $isUrgentBooking ? 'Broadcasting to nearby drivers - Urgent request' : 'Broadcasting to nearby drivers'; ?></strong>
                <span id="broadcast-status-sub">Auto-confirming in <span id="broadcast-countdown"><?php echo gmdate($broadcastWindowSeconds >= 3600 ? 'H:i:s' : 'i:s', $broadcastRemainingSeconds); ?></span></span>
            </div>
            <a href="<?php echo htmlspecialchars($phoneHref); ?>" class="broadcast-call-support">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
                Call Support
            </a>
        </div>
    </div>
    <?php endif; ?>

    <!-- ── REALTIME UPDATES & REWARDS LOGIN SUGGESTION (POPUP MODAL + INLINE DOCK) ── -->
    <?php if (!$_customerLoggedIn): ?>
    <?php 
    $custEmailParam = !empty($bookingRow['customer_email']) ? urlencode($bookingRow['customer_email']) : (!empty($_pfEmail) ? urlencode($_pfEmail) : '');
    $loginTargetUrl = '/pages/customer-login.php?redirect=' . urlencode('/pages/thank-you.php?booking_id=' . $bookingId) . ($custEmailParam ? '&email=' . $custEmailParam : '');
    ?>

    <!-- 1. POPUP MODAL OVERLAY -->
    <div class="sug-modal-overlay" id="sug-modal-overlay">
        <div class="sug-modal-card" id="sug-modal-card">
            <button type="button" class="sug-modal-close-btn" id="sug-close-btn" title="Close Notification">&times;</button>
            <div class="login-suggestion-card sug-modal-card-inner">
                <div class="login-sug-glow"></div>
                <div class="login-sug-content">
                    <div class="login-sug-header" style="padding-right: 2.2rem;">
                        <div class="login-sug-badge">
                            <span class="pulse-dot"></span>
                            <span>RECOMMENDED FOR YOU</span>
                        </div>
                        <span class="reward-points-pill">🎁 Earn +250 Reward Points</span>
                    </div>
                    
                    <h3 class="login-sug-title">
                        Log in with your Email for Real-time Trip Updates &amp; Member Rewards!
                    </h3>
                    <p class="login-sug-desc">
                        Stay updated on your trip! Logging in enables live GPS driver tracking, automated SMS &amp; WhatsApp alerts, and unlocks exclusive member cashbacks on your ride.
                    </p>

                    <div class="login-sug-features">
                        <div class="sug-feat-item">
                            <span class="sug-feat-icon">📡</span>
                            <div>
                                <strong>Real-time Driver Updates</strong>
                                <span>Live GPS, driver contact &amp; cab assignment alerts</span>
                            </div>
                        </div>
                        <div class="sug-feat-item">
                            <span class="sug-feat-icon">🎁</span>
                            <div>
                                <strong>Instant Rewards &amp; Cashback</strong>
                                <span>Earn reward points redeemable on future bookings</span>
                            </div>
                        </div>
                        <div class="sug-feat-item">
                            <span class="sug-feat-icon">🧾</span>
                            <div>
                                <strong>Instant GST Invoices</strong>
                                <span>Access trip receipts and download invoices anytime</span>
                            </div>
                        </div>
                    </div>

                    <div class="login-sug-actions">
                        <a href="<?php echo htmlspecialchars($loginTargetUrl); ?>" class="btn-sug-login">
                            <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>
                            Log In with Email for Updates &amp; Rewards &nbsp;➔
                        </a>
                        <span class="login-sug-subtext">Takes 10 seconds • Seamless 1-click login with Google or Email OTP</span>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- 2. INLINE DOCKED POSITION WRAPPER ON PAGE -->
    <div id="inline-sug-wrapper" style="display: none;">
        <div class="login-suggestion-card">
            <div class="login-sug-glow"></div>
            <div class="login-sug-content">
                <div class="login-sug-header">
                    <div class="login-sug-badge">
                        <span class="pulse-dot"></span>
                        <span>RECOMMENDED FOR YOU</span>
                    </div>
                    <span class="reward-points-pill">🎁 Earn +250 Reward Points</span>
                </div>
                
                <h3 class="login-sug-title">
                    Log in with your Email for Real-time Trip Updates &amp; Member Rewards!
                </h3>
                <p class="login-sug-desc">
                    Stay updated on your trip! Logging in enables live GPS driver tracking, automated SMS &amp; WhatsApp alerts, and unlocks exclusive member cashbacks on your ride.
                </p>

                <div class="login-sug-features">
                    <div class="sug-feat-item">
                        <span class="sug-feat-icon">📡</span>
                        <div>
                            <strong>Real-time Driver Updates</strong>
                            <span>Live GPS, driver contact &amp; cab assignment alerts</span>
                        </div>
                    </div>
                    <div class="sug-feat-item">
                        <span class="sug-feat-icon">🎁</span>
                        <div>
                            <strong>Instant Rewards &amp; Cashback</strong>
                            <span>Earn reward points redeemable on future bookings</span>
                        </div>
                    </div>
                    <div class="sug-feat-item">
                        <span class="sug-feat-icon">🧾</span>
                        <div>
                            <strong>Instant GST Invoices</strong>
                            <span>Access trip receipts and download invoices anytime</span>
                        </div>
                    </div>
                </div>

                <div class="login-sug-actions">
                    <a href="<?php echo htmlspecialchars($loginTargetUrl); ?>" class="btn-sug-login">
                        <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>
                        Log In with Email for Updates &amp; Rewards &nbsp;➔
                    </a>
                    <span class="login-sug-subtext">Takes 10 seconds • Seamless 1-click login with Google or Email OTP</span>
                </div>
            </div>
        </div>
    </div>

    <!-- 3. JAVASCRIPT POP-UP CONTROLLER & DOCKING LOGIC -->
    <script>
    document.addEventListener('DOMContentLoaded', function() {
        var bookingId = "<?php echo htmlspecialchars($bookingIdDisplay); ?>";
        var storageKey = 'dropcars_rewards_modal_closed_' + bookingId;
        var overlay = document.getElementById('sug-modal-overlay');
        var inlineWrapper = document.getElementById('inline-sug-wrapper');

        // ── CRITICAL: Move overlay to <body> level ──
        // This ensures filter:blur on <main> does NOT affect the popup card
        if (overlay && overlay.parentNode !== document.body) {
            document.body.appendChild(overlay);
        }

        var alreadyClosed = false;
        try {
            alreadyClosed = sessionStorage.getItem(storageKey) === 'true';
        } catch (err) {}

        if (!alreadyClosed && overlay) {
            setTimeout(function() {
                overlay.classList.add('active');
                // Blur + dim all background content
                document.body.classList.add('dropcars-modal-open');
            }, 450);
        } else {
            if (inlineWrapper) {
                inlineWrapper.style.display = 'block';
            }
        }

        // Wire up close button — only the ✕ closes the modal
        var closeBtn = document.getElementById('sug-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                closeSugModal();
            });
        }
    });

    function closeSugModal() {
        var overlay = document.getElementById('sug-modal-overlay');
        var inlineWrapper = document.getElementById('inline-sug-wrapper');
        var bookingId = "<?php echo htmlspecialchars($bookingIdDisplay); ?>";
        var storageKey = 'dropcars_rewards_modal_closed_' + bookingId;

        try { sessionStorage.setItem(storageKey, 'true'); } catch (err) {}

        // Remove blur from background immediately
        document.body.classList.remove('dropcars-modal-open');

        if (overlay) {
            overlay.classList.add('closing');
            setTimeout(function() {
                overlay.classList.remove('active', 'closing');
                overlay.style.display = 'none';
                if (inlineWrapper) {
                    inlineWrapper.style.display = 'block';
                    inlineWrapper.style.opacity = '0';
                    inlineWrapper.style.transition = 'opacity 0.45s ease';
                    requestAnimationFrame(function() {
                        requestAnimationFrame(function() {
                            inlineWrapper.style.opacity = '1';
                        });
                    });
                }
            }, 320);
        }
    }
    </script>
    <?php else: ?>
    <div class="logged-in-status-bar">
        <div class="logged-in-inner">
            <span class="logged-in-icon">✅</span>
            <div class="logged-in-text">
                <strong>Logged in as <?php echo htmlspecialchars($_SESSION['customer_email'] ?? $_SESSION['customer_phone'] ?? $_pfEmail ?? 'Member'); ?></strong>
                <span>Real-time trip updates active &amp; Drop Cars reward points credited for Booking #<?php echo htmlspecialchars($bookingIdDisplay); ?></span>
            </div>
            <a href="/pages/customer-dashboard.php" class="btn-goto-dash">Customer Dashboard &rarr;</a>
        </div>
    </div>
    <?php endif; ?>

    <?php if ($bookingRow): ?>
    
    <?php
    $advanceStatus = null;
    if (isset($pdo) && $pdo instanceof PDO) {
        try {
            $tableCheck = $pdo->query("SHOW TABLES LIKE 'advance_payments'")->fetchColumn();
            if ($tableCheck) {
                $stmt = $pdo->prepare("SELECT status FROM `advance_payments` WHERE booking_id = ? ORDER BY id DESC LIMIT 1");
                $stmt->execute([$bookingId]);
                $advanceStatus = $stmt->fetchColumn() ?: null;
            }
        } catch (Throwable $e) {}
    }
    ?>

    <?php if ($status === 'pending' || $status === 'confirmed'): ?>
    <!-- PREMIUM STATEFUL PAYMENT & DISPATCH CARD -->
    <div class="payment-status-card" id="adv-payment-card" style="display: none;">
        <!-- State 1: Unpaid / Prompt -->
        <div id="adv-card-prompt" style="display: none;">
            <div class="payment-card-inner">
                <div class="payment-card-header">
                    <span class="pulse-ring"></span>
                    <strong class="payment-card-title">🔒 Secure Cab Availability & Priority Dispatch</strong>
                </div>
                <p class="payment-card-desc">
                    To guarantee your vehicle reservation and ensure our matching team assigns a cab immediately, please pay a small advance of <strong class="highlight-text">₹<?php echo number_format($advAmount); ?></strong>. The remaining balance of ₹<?php echo number_format(max(0, $fareTotal - $advAmount)); ?> is payable directly to the driver at the end of your trip.
                </p>
                <div class="payment-card-actions">
                    <button onclick="toggleQR(true)" class="btn-pay-now">
                        💳 Pay Advance (₹<?php echo number_format($advAmount); ?>)
                    </button>
                    <button onclick="continueWithoutAdvance()" class="btn-continue-no-pay">
                        Continue without Advance
                    </button>
                </div>
            </div>
        </div>

        <!-- State 2: Queue / Standard (After clicking Continue without Advance) -->
        <div id="adv-card-queue" style="display: none;">
            <div class="payment-card-inner queue-state">
                <div class="payment-card-header">
                    <span class="queue-dot"></span>
                    <strong class="payment-card-title text-slate">⚡ Standard Matching Queue (No Advance)</strong>
                </div>
                <p class="payment-card-desc">
                    Your request is in our standard queue. Driver details will be shared 12-24 hours prior to travel. Bookings with advance payments are matched first. You can prioritize your ride at any time.
                </p>
                <div class="payment-card-actions">
                    <button onclick="toggleQR(true)" class="btn-pay-now btn-small-gold">
                        🚀 Pay Advance to Prioritize (₹<?php echo number_format($advAmount); ?>)
                    </button>
                </div>
            </div>
        </div>

        <!-- State 3: Pending Verification -->
        <div id="adv-card-pending" style="display: none;">
            <div class="payment-card-inner pending-state">
                <div class="payment-card-header">
                    <span class="pending-ring"></span>
                    <strong class="payment-card-title text-gold">⏳ Payment Verification in Progress</strong>
                </div>
                <p class="payment-card-desc">
                    We have received your advance payment notification of <strong>₹<?php echo number_format($advAmount); ?></strong>. Our finance team is currently verifying the transaction. Your booking status will be updated shortly!
                </p>
                <div class="payment-card-actions">
                    <a href="<?php echo $waHref; ?>" target="_blank" class="btn-pay-now btn-green-deluxe btn-center-inline">
                        💬 Chat on WhatsApp for Instant Approval
                    </a>
                </div>
            </div>
        </div>

        <!-- State 4: Verified -->
        <div id="adv-card-verified" style="display: none;">
            <div class="payment-card-inner verified-state">
                <div class="payment-card-header">
                    <span class="verified-dot">✓</span>
                    <strong class="payment-card-title text-green">✅ Advance Payment Confirmed & Ride Secured!</strong>
                </div>
                <p class="payment-card-desc">
                    Your advance payment of <strong>₹<?php echo number_format($advAmount); ?></strong> has been successfully verified! Cab availability is fully locked in and guaranteed. Remaining balance to pay the driver: <strong>₹<?php echo number_format(max(0, $fareTotal - $advAmount)); ?></strong>.
                </p>
            </div>
        </div>
    </div>
    <?php endif; ?>

    <?php if (!empty($bookingRow['driver_name']) || !empty($bookingRow['car_number'])): ?>
    <!-- CHAUFFEUR BOARDING PASS STYLE CARD -->
    <div class="driver-ticket">
        <div class="ticket-header">
            <div>
                <span class="block-label" style="margin: 0; font-size: 0.65rem; color: var(--brand-blue);">Driver & Cab Details</span>
            </div>
            <span style="font-size: 0.75rem; font-weight: 800; color: var(--muted-text); text-transform: uppercase; letter-spacing: 0.05em; font-family: 'Outfit';">Assigned</span>
        </div>
        
        <div style="padding: 1.25rem;">
            <div style="display: flex; flex-direction: column; gap: 1rem;">
                <div style="display: flex; gap: 1rem; align-items: center; border-bottom: 1px solid var(--card-border); padding-bottom: 1rem; flex-wrap: wrap;">
                    <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--accent-glow); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; border: 1px solid rgba(37, 99, 235, 0.15);">👨‍✈️</div>
                    <div>
                        <span class="block-label" style="margin-bottom: 0.15rem; font-size: 0.65rem; color: var(--muted-text);">Assigned Driver</span>
                        <strong style="font-size: 1.25rem; font-family: 'Outfit'; color: var(--main-text); display: block;"><?php echo htmlspecialchars($bookingRow['driver_name'] ?? 'Professional Driver'); ?></strong>
                    </div>
                </div>
                
                <div class="driver-details-grid">
                    <div style="flex: 1; min-width: 0;">
                        <span class="block-label" style="margin-bottom: 0.35rem; font-size: 0.65rem; color: var(--muted-text);">Cab Class</span>
                        <span style="font-size: 1rem; font-weight: 800; color: var(--main-text); display: block; font-family: 'Outfit'; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><?php 
                            $carModelName = htmlspecialchars($bookingRow['car_name'] ?: 'Reserved Cab');
                            if (strpos(strtoupper($carModelName), 'CRYSTA') !== false) {
                                echo 'Crysta';
                            } else {
                                echo $carModelName;
                            }
                        ?></span>
                    </div>
                    <?php if (!empty($bookingRow['car_number'])): ?>
                    <div style="text-align: right;">
                        <span class="block-label" style="margin-bottom: 0.35rem; font-size: 0.65rem; color: var(--muted-text);">Vehicle Number</span>
                        <div class="ind-plate">
                            <div class="ind-side"><span>I</span><span>N</span><span>D</span></div>
                            <div class="ind-seal">IND</div>
                            <span><?php echo htmlspecialchars(strtoupper($bookingRow['car_number'])); ?></span>
                        </div>
                    </div>
                    <?php endif; ?>
                </div>

                <?php if (!empty($bookingRow['driver_phone'])): ?>
                <div class="btn-grid-premium" style="margin-top: 0.75rem; border-top: 1px solid var(--card-border); padding-top: 1rem;">
                    <a href="tel:<?php echo preg_replace('/[^0-9]/', '', $bookingRow['driver_phone']); ?>" class="btn-action-deluxe btn-gold-deluxe">
                        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
                        Call Driver
                    </a>
                    <a href="https://wa.me/<?php echo preg_replace('/[^0-9]/', '', $bookingRow['driver_phone']); ?>" target="_blank" class="btn-action-deluxe btn-green-deluxe">
                        <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.005 5.277 5.282 0 11.768 0c3.141.001 6.094 1.224 8.312 3.444C22.298 5.664 23.516 8.619 23.513 11.76c-.004 6.485-5.281 11.762-11.766 11.762-2.01-.001-3.987-.515-5.742-1.494L0 24zm6.59-4.846c1.6.95 3.19 1.449 4.825 1.451 5.378 0 9.754-4.373 9.757-9.75.001-2.605-1.01-5.053-2.85-6.895C16.48 2.118 14.032 1.05 11.43 1.05c-5.38 0-9.757 4.373-9.76 9.75-.001 1.832.49 3.616 1.42 5.186l-1.016 3.71 3.8-.997zM17.75 14.67c-.33-.165-1.954-.964-2.253-1.073-.3-.11-.518-.165-.736.165-.218.33-.842 1.073-1.03 1.293-.19.22-.377.247-.707.082-.33-.165-1.393-.513-2.653-1.638-.98-.874-1.641-1.953-1.834-2.282-.19-.33-.02-.508.145-.672.15-.147.33-.385.495-.578.165-.192.22-.33.33-.55.11-.22.055-.412-.028-.578-.083-.165-.736-1.775-1.01-2.434-.266-.64-.537-.553-.736-.563l-.627-.01c-.218 0-.573.082-.873.412-.3.33-1.145 1.117-1.145 2.723 0 1.605 1.17 3.155 1.332 3.376.164.22 2.302 3.515 5.578 4.92.778.334 1.385.534 1.857.684.78.248 1.492.213 2.054.129.627-.094 1.954-.8 2.227-1.57.273-.77.273-1.43.19-1.57-.083-.14-.3-.22-.63-.385z"/></svg>
                        WhatsApp Driver
                    </a>
                </div>
                <?php endif; ?>
            </div>
        </div>
    </div>
    <?php endif; ?>

    <!-- MAIN TRIP INFO CARD -->
    <div class="glass-block">
        <div class="trip-header-wrap">
            <div class="trip-route-section">
                <span class="block-label">Trip Details</span>
                <h2 class="trip-route">
                    <?php echo htmlspecialchars($bookingRow['pickup_location'] ?? 'Pickup Location'); ?>
                    <span class="trip-route-arrow">→</span><br>
                    <?php echo htmlspecialchars($bookingRow['drop_location'] ?? 'Dropoff Location'); ?>
                </h2>
                <div class="trip-meta">
                    Trip Type: <strong><?php echo htmlspecialchars(ucfirst(str_replace('_', ' ', $bookingRow['trip_type'] ?? 'one_way'))); ?></strong> • Scheduled for <strong><?php echo htmlspecialchars($formattedPickupDate ?: 'Date Pending'); ?></strong> at <strong><?php echo htmlspecialchars($bookingRow['pickup_time'] ?? 'Time Pending'); ?></strong>
                </div>
            </div>
            
            <div class="booking-badge-container">
                <div class="booking-badge" id="booking-badge">
                    <span>#<?php echo htmlspecialchars($bookingIdDisplay); ?></span>
                    <button class="copy-btn" id="copy-btn" title="Copy Reference ID">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                    <div class="copy-tooltip" id="copy-tooltip">Copied!</div>
                </div>
            </div>
        </div>

        <!-- TRIP STATISTICS GRID -->
        <?php if(!empty($bookingRow['distance_km'])): ?>
        <div class="stats-grid">
            <div class="stat-item">
                <div class="stat-val"><?php echo number_format($bookingRow['distance_km']); ?> KM</div>
                <div class="stat-lbl">Distance</div>
            </div>
            <div class="stat-item">
                <div class="stat-val"><?php
                    $storedDur = trim((string)($bookingRow['duration'] ?? ''));
                    $isOldDuration = (
                        $storedDur === '' ||
                        (stripos($storedDur, 'hour') !== false && stripos($storedDur, 'min') === false) ||
                        (stripos($storedDur, 'hours') !== false && stripos($storedDur, 'mins') === false) ||
                        (stripos($storedDur, 'hr') === false && stripos($storedDur, 'min') === false)
                    );
                    
                    if (!$isOldDuration) {
                        echo htmlspecialchars($storedDur);
                    } else {
                        $d = (float)($bookingRow['distance_km'] ?? 0);
                        $isRoundTrip = (strpos(strtolower($bookingRow['trip_type'] ?? ''), 'round') !== false);
                        $oneWayDist = $isRoundTrip ? ($d / 2) : $d;
                        $rawHrs = $oneWayDist / 55;
                        $hrs = floor($rawHrs);
                        $mins = (int)round(($rawHrs - $hrs) * 60);
                        if ($mins === 60) { $hrs++; $mins = 0; }
                        
                        $timeStr = '';
                        if ($hrs > 0) {
                            $timeStr .= $hrs . ' hr' . ($hrs == 1 ? '' : 's');
                        }
                        if ($mins > 0) {
                            if ($timeStr !== '') $timeStr .= ' ';
                            $timeStr .= $mins . ' min' . ($mins == 1 ? '' : 's');
                        }
                        echo htmlspecialchars($timeStr ?: '0 mins');
                    }
                ?></div>
                <div class="stat-lbl">Duration</div>
            </div>
            <div class="stat-item">
                <div class="stat-val">₹<?php echo number_format($bookingRow['final_fare'] ?? 0); ?></div>
                <div class="stat-lbl">Fare</div>
            </div>
        </div>
        <?php endif; ?>

        <!-- PREMIUM FLEET ASSIGNMENT BADGE -->
        <div class="v-badge-premium">
            <div class="v-icon">🚖</div>
            <div class="v-info">
                <strong><?php 
                    $vDispName = htmlspecialchars($selectedVehicleType);
                    $vModel = htmlspecialchars($vehicleInfo['model'] ?? 'Clean AC Cab');
                    if (strpos(strtoupper($vDispName), 'CRYSTA') !== false || strpos(strtoupper($vModel), 'CRYSTA') !== false) {
                        echo 'Crysta';
                    } else {
                        echo $vDispName . ' (' . $vModel . ')';
                    }
                ?></strong>
                <span>A well-maintained air-conditioned cab and professional driver will be provided for your trip.</span>
            </div>
        </div>

        <!-- REORGANIZED, DE-CLUTTERED ACTIONS GRID -->
        <div class="btn-grid-premium">
            <?php if ($status === 'confirmed' || $status === 'pending'): ?>
            <button onclick="toggleQR(true)" class="btn-action-deluxe btn-gold-deluxe">
                <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
                Pay Advance
            </button>
            <?php 
                $custPhone = $bookingRow['customer_phone'] ?? $bookingRow['phone'] ?? '';
                $trackUrl = '/pages/track-booking.php?booking_id=' . urlencode($bookingId) . '&phone=' . urlencode($custPhone);
            ?>
            <a href="<?php echo htmlspecialchars($trackUrl); ?>" class="btn-action-deluxe btn-blue-deluxe">
                <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                Track Booking
            </a>
            <?php endif; ?>
            
            <a href="<?php echo $waHref; ?>" target="_blank" class="btn-action-deluxe btn-green-outline">
                <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.005 5.277 5.282 0 11.768 0c3.141.001 6.094 1.224 8.312 3.444C22.298 5.664 23.516 8.619 23.513 11.76c-.004 6.485-5.281 11.762-11.766 11.762-2.01-.001-3.987-.515-5.742-1.494L0 24zm6.59-4.846c1.6.95 3.19 1.449 4.825 1.451 5.378 0 9.754-4.373 9.757-9.75.001-2.605-1.01-5.053-2.85-6.895C16.48 2.118 14.032 1.05 11.43 1.05c-5.38 0-9.757 4.373-9.76 9.75-.001 1.832.49 3.616 1.42 5.186l-1.016 3.71 3.8-.997zM17.75 14.67c-.33-.165-1.954-.964-2.253-1.073-.3-.11-.518-.165-.736.165-.218.33-.842 1.073-1.03 1.293-.19.22-.377.247-.707.082-.33-.165-1.393-.513-2.653-1.638-.98-.874-1.641-1.953-1.834-2.282-.19-.33-.02-.508.145-.672.15-.147.33-.385.495-.578.165-.192.22-.33.33-.55.11-.22.055-.412-.028-.578-.083-.165-.736-1.775-1.01-2.434-.266-.64-.537-.553-.736-.563l-.627-.01c-.218 0-.573.082-.873.412-.3.33-1.145 1.117-1.145 2.723 0 1.605 1.17 3.155 1.332 3.376.164.22 2.302 3.515 5.578 4.92.778.334 1.385.534 1.857.684.78.248 1.492.213 2.054.129.627-.094 1.954-.8 2.227-1.57.273-.77.273-1.43.19-1.57-.083-.14-.3-.22-.63-.385z"/></svg>
                WhatsApp Support
            </a>
            <a href="<?php echo $phoneHref; ?>" class="btn-action-deluxe btn-green-outline">
                <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
                Call Support
            </a>
            <?php if (in_array($status, ['pending', 'accepted', 'confirmed'], true)): ?>
            <button type="button" onclick="openCancelBookingModal()" class="btn-action-deluxe btn-red-outline">
                <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M6 6l12 12M6 18L18 6"></path></svg>
                Cancel Booking
            </button>
            <?php endif; ?>
        </div>
        <a href="/" class="btn-action-deluxe btn-full-blue outfit">
            Book Another Trip
        </a>

        <?php if (in_array($status, ['pending', 'accepted', 'confirmed'], true)): ?>
        <!-- CANCEL BOOKING MODAL - reuses the .sug-modal-overlay/.sug-modal-card
             shell + animation defined above for the rewards login pop-up, per
             this codebase's one modal system (moved to <body> by JS below,
             same as #sug-modal-overlay, so main's blur filter never touches it). -->
        <div class="sug-modal-overlay" id="cancel-modal-overlay">
            <div class="sug-modal-card" id="cancel-modal-card" style="max-width: 420px;">
                <button type="button" class="sug-modal-close-btn" id="cancel-modal-close-btn" title="Close">&times;</button>
                <div class="login-suggestion-card sug-modal-card-inner" style="margin: 0;">
                    <div id="cancel-modal-step-otp">
                        <h3 class="login-sug-title">Cancel Booking #<?php echo htmlspecialchars($bookingIdDisplay); ?></h3>
                        <p class="login-sug-desc" id="cancel-otp-sent-msg">We're emailing you a 6-digit verification code to confirm this cancellation...</p>
                        <input type="text" id="cancel-otp-input" maxlength="6" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" placeholder="• • • • • •"
                            style="width: 100%; box-sizing: border-box; text-align: center; letter-spacing: 0.5rem; font-size: 1.4rem; font-weight: 800; padding: 0.85rem; margin-bottom: 0.6rem; border-radius: 12px; border: 1.5px solid var(--card-border); background: var(--card-bg); color: var(--main-text); font-family: 'Share Tech Mono', monospace;" />
                        <p id="cancel-modal-error" style="display:none; color:#ef4444; font-size:0.8rem; font-weight:600; margin: 0 0 0.75rem;"></p>
                        <div class="login-sug-actions">
                            <button type="button" id="cancel-otp-submit-btn" class="btn-sug-login" style="border:none; cursor:pointer;" onclick="submitCancelOtp()">Confirm Cancellation</button>
                            <span class="login-sug-subtext" style="cursor:pointer; text-decoration:underline;" onclick="requestCancelOtp(true)">Didn't get a code? Resend</span>
                        </div>
                    </div>
                    <div id="cancel-modal-step-result" style="display:none;">
                        <h3 class="login-sug-title" id="cancel-result-title">Booking Cancelled</h3>
                        <p class="login-sug-desc" id="cancel-result-desc"></p>
                        <div class="login-sug-actions" id="cancel-refund-actions" style="display:none;">
                            <button type="button" class="btn-sug-login" style="border:none; cursor:pointer;" onclick="submitRefundRequest()" id="cancel-refund-btn">Request Refund</button>
                        </div>
                        <p id="cancel-refund-result-msg" class="login-sug-subtext" style="display:none; margin-top: 0.75rem;"></p>
                    </div>
                </div>
            </div>
        </div>
        <?php endif; ?>

        <!-- PROCESS TIMELINE / STEPPER -->
        <div class="stepper-block" style="border-top: 1px solid var(--card-border); margin-top: 1.75rem; padding-top: 1.75rem;">
            <div class="stepper-header">Booking Progress</div>
            <div class="stepper">
                <div class="step <?php echo in_array($status, ['pending', 'confirmed', 'completed']) ? 'active' : ''; ?>">
                    <div class="step-num">1</div>
                    <div class="step-content">
                        <div class="step-title">Booking Placed</div>
                        <p class="step-desc">Your request has been received by our matching team.</p>
                    </div>
                </div>
                
                <?php if ($status === 'cancelled'): ?>
                <div class="step active" style="--brand-blue: var(--red);">
                    <div class="step-num" style="background: var(--red); border-color: var(--red); color: #fff;">✗</div>
                    <div class="step-content">
                        <div class="step-title" style="color: var(--red);">Booking Cancelled</div>
                        <p class="step-desc">This booking has been marked as cancelled. No charges were made.</p>
                    </div>
                </div>
                <?php else: ?>
                <div class="step <?php echo in_array($status, ['confirmed', 'completed']) ? 'active' : ''; ?>">
                    <div class="step-num">2</div>
                    <div class="step-content">
                        <div class="step-title">Booking Confirmed</div>
                        <p class="step-desc">Slot is reserved. Cab availability is locked in.</p>
                    </div>
                </div>
                
                <div class="step <?php echo (!empty($bookingRow['driver_name']) || $status === 'completed') ? 'active' : ''; ?>">
                    <div class="step-num">3</div>
                    <div class="step-content">
                        <div class="step-title">Driver Assigned</div>
                        <p class="step-desc">
                            <?php if (!empty($bookingRow['driver_name'])): ?>
                                <strong style="color: var(--brand-blue);"><?php echo htmlspecialchars($bookingRow['driver_name']); ?></strong> is assigned. Cab: <strong><?php echo htmlspecialchars(strtoupper($bookingRow['car_number'] ?? 'Assigned Cab')); ?></strong>
                            <?php else: ?>
                                Driver details and vehicle number will be shared 12-24 hours prior to travel.
                            <?php endif; ?>
                        </p>
                    </div>
                </div>
                
                <div class="step <?php echo ($status === 'completed') ? 'active' : ''; ?>">
                    <div class="step-num">4</div>
                    <div class="step-content">
                        <div class="step-title">Trip Completed</div>
                        <p class="step-desc">Arrived safely at your destination.</p>
                    </div>
                </div>
                <?php endif; ?>
            </div>
        </div>
    </div>

        <?php if ($_customerLoggedIn): ?>
        <!-- Logged in confirmation chip -->
        <div style="margin-top:1rem; display:flex; align-items:center; gap:0.6rem; background:rgba(16,185,129,0.06); border:1px solid rgba(16,185,129,0.2); border-radius:14px; padding:0.75rem 1rem; font-size:0.82rem; color:#065f46; font-weight:600;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Logged in<?php if ($_pfName): ?> as <strong style="margin-left:0.25rem;"><?php echo htmlspecialchars($_pfName); ?></strong><?php endif; ?>
            <a href="<?php echo htmlspecialchars($_dashUrl); ?>" style="margin-left:auto; color:var(--brand-blue); text-decoration:none; font-weight:700; font-size:0.8rem;">My Dashboard →</a>
        </div>
        <?php else: ?>
        <!-- Login CTA for non-logged-in customers -->
        <div style="margin-top:1rem; background:linear-gradient(135deg,rgba(37,99,235,0.04),rgba(14,165,233,0.04)); border:1px solid rgba(37,99,235,0.15); border-radius:16px; padding:1.1rem 1.2rem;">
            <div style="display:flex; align-items:flex-start; gap:0.85rem;">
                <div style="width:36px;height:36px;border-radius:10px;background:rgba(37,99,235,0.1);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand-blue)" stroke-width="2.2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
                <div style="flex:1; min-width:0;">
                    <strong style="display:block; font-size:0.9rem; font-family:'Outfit'; color:var(--main-text); margin-bottom:0.2rem;">Save This Booking to Your Account</strong>
                    <p style="margin:0; font-size:0.78rem; color:var(--muted-text); line-height:1.5;">Log in or create a free account to track your ride, receive live updates, and prefill your details on future bookings.</p>
                    <a href="<?php echo htmlspecialchars($_loginUrl); ?>" style="display:inline-flex; align-items:center; gap:0.4rem; margin-top:0.75rem; background:var(--brand-blue); color:#fff; padding:0.55rem 1rem; border-radius:10px; font-size:0.8rem; font-weight:700; text-decoration:none; font-family:'Outfit'; transition:all 0.2s; box-shadow:0 4px 12px rgba(37,99,235,0.2);">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                        Login / Create Account
                    </a>
                </div>
            </div>
        </div>
        <?php endif; ?>

    <?php if ($status === 'completed'): ?>
    <!-- INTERACTIVE REVIEW RATING CARD -->
    <div class="glass-block" style="border-left: 5px solid var(--brand-blue);">
        <span class="block-label" style="color: var(--brand-blue);">Rate Your Experience</span>
        <div style="font-size: 1.25rem; font-weight: 850; color: var(--main-text); margin-bottom: 0.25rem; font-family: 'Outfit';">How was your journey?</div>
        <p style="font-size: 0.85rem; color: var(--muted-text); margin-bottom: 1rem;">Your feedback helps us maintain the highest service quality.</p>
        
        <form id="details-review-form" method="POST" action="/api/submit-review.php">
            <input type="hidden" id="review-customer-phone" name="customer_phone" value="<?php echo htmlspecialchars($custPhone); ?>">
            <input type="hidden" id="review-trip-route" name="trip_route" value="<?php echo htmlspecialchars(($bookingRow['pickup_location'] ?? 'Pickup') . ' to ' . ($bookingRow['drop_location'] ?? 'Drop')); ?>">
            <input type="hidden" id="details-star-rating-hidden" name="rating" value="0">
            
            <div style="font-size: 0.8rem; font-weight: 600; color: var(--muted-text); margin-bottom: 0.25rem;">Tap to Rate:</div>
            <div class="star-row" id="details-star-row" style="margin-bottom: 1rem; display: flex; gap: 6px;">
                <?php for ($s = 1; $s <= 5; $s++): ?>
                <button type="button" class="details-star-btn" data-star="<?php echo $s; ?>" aria-label="<?php echo $s; ?> star" style="font-size: 2rem; color: #cbd5e1; background: none; border: none; cursor: pointer; transition: color 0.15s, transform 0.15s; padding: 0; line-height: 1;">★</button>
                <?php endfor; ?>
            </div>
            
            <textarea class="review-textarea" name="comment" id="details-review-comment" placeholder="How was the driver, the cab, and the journey? (Optional)" style="margin-bottom: 1rem; width: 100%; border: 1px solid var(--card-border); border-radius: 12px; padding: 0.75rem 1rem; font-size: 0.9rem; font-family: 'Inter', sans-serif; resize: vertical; min-height: 90px; outline: none; color: var(--main-text); background: var(--card-bg);"></textarea>
            
            <div id="details-review-msg" style="font-size: 0.85rem; margin-bottom: 0.75rem; display: none;"></div>
            
            <button type="submit" class="review-submit" style="width: 100%; justify-content: center; padding: 0.85rem; background: var(--brand-blue); color: #fff; border: none; border-radius: 10px; font-weight: 700; font-size: 0.85rem; font-family: 'Outfit', sans-serif; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 0.4rem;">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                Submit Rating
            </button>
        </form>
    </div>
    <?php endif; ?>

    <!-- FARES, POLICIES & BREAKDOWN CARD -->
    <div class="glass-block">
        <span class="block-label">Fare Details</span>
        
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--card-border); padding-bottom: 1.25rem; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
            <div>
                <span class="block-label" style="margin-bottom: 0.25rem; font-size: 0.65rem; color: var(--muted-text);">Selected Fare Package</span>
                <strong style="font-size: 1.15rem; font-family: 'Outfit'; color: var(--main-text); display: block;">
                    <?php
                    if ($includeTolls && $includeTaxes) {
                        echo 'Tolls & State permit / border tax Included';
                    } elseif ($includeTolls) {
                        echo 'Tolls Included (State permit / border tax Extra)';
                    } elseif ($includeTaxes) {
                        echo 'State permit / border tax Included (Tolls Extra)';
                    } else {
                        echo 'Base Fare (Tolls & State permit / border tax Extra)';
                    }
                    ?>
                </strong>
            </div>
            <div style="text-align: right; min-width: 120px;">
                <span class="block-label" style="margin-bottom: 0.25rem; font-size: 0.65rem; color: var(--muted-text);">Estimated Fare</span>
                <strong style="font-size: 1.65rem; font-family: 'Outfit'; color: var(--brand-blue); display: block;">
                    ₹<?php echo number_format($bookingRow['final_fare'] ?? 0); ?>
                </strong>
            </div>
        </div>

        <?php 
        if (!empty($bookingRow['fare_breakdown'])) {
            $fb = json_decode($bookingRow['fare_breakdown'], true);
            if ($fb && !empty($bookingRow['fare_type'])) {
                $fb['fareType'] = $bookingRow['fare_type'];
            }
            if ($fb) {
                // 1. Render ONLY the booked vehicle breakdown by default
                $bookedVehicle = $bookingRow['car_name'] ?? 'SEDAN';
                echo dropcars_fare_breakdown_html($fb, $bookedVehicle);

                // 2. Render premium collapsible accordion for other vehicles
                ?>
                <details class="other-rates-details">
                    <summary class="other-rates-summary">
                        <span>🔍 Check other vehicles' prices / comparison</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-left: auto;">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </summary>
                    <div style="margin-top: 1.25rem; cursor: default;" onclick="event.stopPropagation()">
                        <?php 
                        // Display the full comparison list inside the collapsible card
                        echo dropcars_fare_breakdown_html($fb); 
                        ?>
                    </div>
                </details>
                <?php
            }
        }
        ?>

        <div class="policy-wrap-premium" style="margin-top: 0.5rem; border-top: none; padding-top: 0;">
            <div class="policy-list">
                <h5>What's Included</h5>
                <ul>
                    <?php foreach ($inclusions as $inc): ?>
                    <li>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        <?php echo $inc; ?>
                    </li>
                    <?php endforeach; ?>
                </ul>
            </div>
            <div class="policy-list">
                <h5>What's Excluded</h5>
                <ul>
                    <?php foreach ($exclusions as $exc): ?>
                    <li>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        <?php echo $exc; ?>
                    </li>
                    <?php endforeach; ?>
                </ul>
            </div>
        </div>
    </div>

    <!-- IMPORTANT CUSTOMER INTIMATION & TRAVEL POLICIES -->
    <div class="glass-block" style="border-left: 5px solid var(--gold);">
        <span class="block-label" style="color: var(--gold);">Important Customer Intimation</span>
        <div style="font-size: 1.25rem; font-weight: 850; color: var(--main-text); margin-bottom: 1.25rem; font-family: 'Outfit';">Travel Guidelines & Extra Charges</div>
        
        <div style="display: grid; grid-template-columns: 1fr; gap: 1rem;">
            <!-- Intimation 1 -->
            <div style="display: flex; gap: 0.85rem; align-items: flex-start; background: var(--bg-page); padding: 0.85rem; border-radius: 12px; border: 1px solid var(--card-border);">
                <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(245, 158, 11, 0.08); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0; color: var(--gold);">
                    ⏱️
                </div>
                <div>
                    <strong style="display: block; font-size: 0.9rem; font-family: 'Outfit'; color: var(--main-text); margin-bottom: 0.15rem;">20 Minutes Pickup Grace Period</strong>
                    <p style="margin: 0; font-size: 0.8rem; color: var(--muted-text); line-height: 1.4;">A complimentary 20-minute waiting grace period is provided at your pickup location. Beyond 20 minutes, standard waiting charges will apply.</p>
                </div>
            </div>
            
            <!-- Intimation 2 -->
            <div style="display: flex; gap: 0.85rem; align-items: flex-start; background: var(--bg-page); padding: 0.85rem; border-radius: 12px; border: 1px solid var(--card-border);">
                <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(37, 99, 235, 0.08); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0; color: var(--brand-blue);">
                    🛑
                </div>
                <div>
                    <strong style="display: block; font-size: 0.9rem; font-family: 'Outfit'; color: var(--main-text); margin-bottom: 0.15rem;">Intermediate Stops & Waiting</strong>
                    <p style="margin: 0; font-size: 0.8rem; color: var(--muted-text); line-height: 1.4;">For One-Way trips, middle stops or intermediate waiting along the route are charged extra. Please inform support or coordinate in advance.</p>
                </div>
            </div>
            
            <!-- Intimation 3 -->
            <div style="display: flex; gap: 0.85rem; align-items: flex-start; background: var(--bg-page); padding: 0.85rem; border-radius: 12px; border: 1px solid var(--card-border); <?php if ($isRoundTrip) echo 'border-color: rgba(16, 185, 129, 0.3);'; ?>">
                <div style="width: 32px; height: 32px; border-radius: 8px; background: <?php echo $isRoundTrip ? 'rgba(16, 185, 129, 0.08)' : 'rgba(100, 116, 139, 0.08)'; ?>; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0; color: <?php echo $isRoundTrip ? '#10b981' : 'var(--muted-text)'; ?>;">
                    🌙
                </div>
                <div>
                    <strong style="display: block; font-size: 0.9rem; font-family: 'Outfit'; color: var(--main-text); margin-bottom: 0.15rem;">
                        Round Trip Night Allowance <?php if ($isRoundTrip) echo '<span style="background:#10b981;color:#fff;font-size:0.65rem;padding:2px 6px;border-radius:4px;margin-left:5px;font-family:\'Inter\';font-weight:700;">Applicable to Trip</span>'; ?>
                    </strong>
                    <p style="margin: 0; font-size: 0.8rem; color: var(--muted-text); line-height: 1.4;">For Round Trips, a driver night allowance of <strong>₹300</strong> is applicable if traveling after <strong>10:00 PM</strong>.</p>
                </div>
            </div>

            <?php if ($isRoundTrip || strpos($tripType, 'hourly') !== false): ?>
            <!-- Intimation 4: KM Limit and Trip Rules -->
            <div style="display: flex; gap: 0.85rem; align-items: flex-start; background: var(--bg-page); padding: 0.85rem; border-radius: 12px; border: 1px solid var(--card-border);">
                <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(14, 165, 233, 0.08); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0; color: var(--brand-blue);">
                    🔄
                </div>
                <div>
                    <strong style="display: block; font-size: 0.9rem; font-family: 'Outfit'; color: var(--main-text); margin-bottom: 0.15rem;">KM Limit &amp; Trip Rules</strong>
                    <p style="margin: 0; font-size: 0.8rem; color: var(--muted-text); line-height: 1.4;">KM limits and round trip KMs are always calculated on a garage-to-garage basis until the vehicle returns back to the pickup point.</p>
                </div>
            </div>
            <?php endif; ?>
        </div>
    </div>

    <!-- TRAVEL ADVANTAGES / CUSTOMER VALUE BOARD -->
    <div class="glass-block">
        <span class="block-label">Your Booking Benefits</span>
        <div style="font-size: 1.25rem; font-weight: 800; color: var(--main-text); margin-bottom: 1.5rem; font-family: 'Outfit';">Why Book with Drop Cars?</div>
        
        <div style="display: grid; grid-template-columns: 1fr; gap: 1.25rem;">
            <!-- Benefit 1 -->
            <div style="display: flex; gap: 1rem; align-items: flex-start; padding: 0.5rem 0;">
                <div style="width: 38px; height: 38px; border-radius: 10px; background: rgba(16, 185, 129, 0.08); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; flex-shrink: 0; color: #10b981; font-weight: bold;">
                    ✓
                </div>
                <div>
                    <strong style="display: block; font-size: 0.95rem; font-family: 'Outfit'; color: var(--main-text); margin-bottom: 0.15rem;">Transparent Per-KM Pricing</strong>
                    <p style="margin: 0; font-size: 0.825rem; color: var(--muted-text); line-height: 1.4;">Safe, clear, and honest pricing based on actual distance traveled. No hidden costs or surprise mileage surcharges.</p>
                </div>
            </div>
            
            <!-- Benefit 2 -->
            <div style="display: flex; gap: 1rem; align-items: flex-start; padding: 0.5rem 0;">
                <div style="width: 38px; height: 38px; border-radius: 10px; background: rgba(16, 185, 129, 0.08); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; flex-shrink: 0; color: #10b981; font-weight: bold;">
                    ✓
                </div>
                <div>
                    <strong style="display: block; font-size: 0.95rem; font-family: 'Outfit'; color: var(--main-text); margin-bottom: 0.15rem;">Doorstep Pickup & Dropoff</strong>
                    <p style="margin: 0; font-size: 0.825rem; color: var(--muted-text); line-height: 1.4;">The cab will arrive directly at your specified home or office pickup address and drop you off exactly at your destination.</p>
                </div>
            </div>
            
            <!-- Benefit 3 -->
            <div style="display: flex; gap: 1rem; align-items: flex-start; padding: 0.5rem 0;">
                <div style="width: 38px; height: 38px; border-radius: 10px; background: rgba(16, 185, 129, 0.08); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; flex-shrink: 0; color: #10b981; font-weight: bold;">
                    ✓
                </div>
                <div>
                    <strong style="display: block; font-size: 0.95rem; font-family: 'Outfit'; color: var(--main-text); margin-bottom: 0.15rem;">Experienced Highway Drivers</strong>
                    <p style="margin: 0; font-size: 0.825rem; color: var(--muted-text); line-height: 1.4;">Our trips are driven by polite, verified, and licensed commercial chauffeurs specialized in safe long-distance highway travel.</p>
                </div>
            </div>
        </div>
    </div>

    <!-- SERVICE ASSURANCE FLAG -->
    <div class="glass-block" style="background: rgba(14, 165, 233, 0.04); border-color: rgba(14, 165, 233, 0.2); display: flex; gap: 1.25rem; align-items: flex-start; color: var(--main-text); padding: 1.75rem;">
        <svg width="24" height="24" fill="none" stroke="#0ea5e9" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
        <div>
            <strong style="display: block; font-size: 1.05rem; color: #0ea5e9; font-family: 'Outfit'; margin-bottom: 0.35rem;">Our Service Guarantee</strong>
            <p style="margin: 0; font-size: 0.85rem; line-height: 1.5; color: var(--muted-text);">
                We guarantee a clean, well-maintained AC vehicle and a polite, experienced driver for every trip.
            </p>
        </div>
    </div>

    <?php if(!empty($bookingRow['customer_notes'])): ?>
    <div class="glass-block" style="background: rgba(245, 158, 11, 0.03); border-color: rgba(245, 158, 11, 0.15); color: var(--main-text); padding: 1.75rem;">
        <span class="block-label" style="color: var(--gold);">Special Notes</span>
        <p style="font-size: 0.9rem; margin: 0; font-style: italic; line-height: 1.6; color: var(--muted-text);">"<?php echo htmlspecialchars($bookingRow['customer_notes']); ?>"</p>
    </div>
    <?php endif; ?>

    <!-- HELPDESK INFO -->
    <div style="text-align: center; margin-top: 3rem; padding-bottom: 2rem;">
        <p style="font-size: 0.95rem; color: var(--muted-text); line-height: 1.7;">
            Need help? Our 24/7 support team is always ready to assist.<br>
            <a href="<?php echo $phoneHref; ?>" style="color: var(--brand-blue); font-weight: 800; text-decoration: none; font-size: 1.35rem; font-family: 'Outfit'; display: inline-block; margin-top: 0.5rem; transition: color 0.2s;">
                <?php echo $sitePhone; ?>
            </a>
        </p>
    </div>
    <?php else: ?>
    <!-- Premium Warning / Status Card if booking not found yet -->
    <div class="glass-block" style="border-left: 5px solid var(--gold); padding: 2rem; text-align: center;">
        <span class="block-label" style="color: var(--gold); margin-bottom: 1rem;">Booking ID: #<?php echo htmlspecialchars($bookingIdDisplay); ?></span>
        <div style="font-size: 1.5rem; font-weight: 850; color: var(--main-text); margin-bottom: 0.75rem; font-family: 'Outfit';">Checking Ride Details...</div>
        <p style="font-size: 0.95rem; color: var(--muted-text); line-height: 1.6; margin: 0 auto 1.5rem auto; max-width: 500px;">
            We have received your request and our dispatch system is currently processing it. If you just placed your booking, please wait a moment and refresh this page.
        </p>
        <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
            <button onclick="window.location.reload();" class="btn-action-deluxe btn-gold-deluxe" style="padding: 0.85rem 1.75rem; font-size: 0.9rem; border-radius: 12px; border: none; cursor: pointer; font-weight: 700; font-family: 'Outfit';">
                🔄 Refresh Status
            </button>
            <a href="<?php echo $waHref; ?>" target="_blank" class="btn-action-deluxe btn-green-deluxe" style="padding: 0.85rem 1.75rem; font-size: 0.9rem; border-radius: 12px; text-decoration: none; display: inline-flex; align-items: center; gap: 0.5rem; font-weight: 700;">
                💬 WhatsApp Support
            </a>
        </div>
    </div>
    
    <!-- HELPDESK INFO FOR FALLBACK -->
    <div style="text-align: center; margin-top: 3rem; padding-bottom: 2rem;">
        <p style="font-size: 0.95rem; color: var(--muted-text); line-height: 1.7;">
            Need help? Our 24/7 support team is always ready to assist.<br>
            <a href="<?php echo $phoneHref; ?>" style="color: var(--brand-blue); font-weight: 800; text-decoration: none; font-size: 1.35rem; font-family: 'Outfit'; display: inline-block; margin-top: 0.5rem; transition: color 0.2s;">
                <?php echo $sitePhone; ?>
            </a>
        </p>
    </div>
    <?php endif; ?>
</main>

<?php
// Advance calculation already done early in the page
?>

<!-- ═══ UPI ADVANCE PAYMENT MODAL — RAZORPAY-STYLE FLOW ══════════ -->
<div class="qr-overlay" id="qr-overlay" onclick="handleOverlayClick(event)">
    <div class="qr-card adv-modal" onclick="event.stopPropagation()" id="adv-card">

        <!-- ── STEP 1: Payment Options ─────────────────────────────── -->
        <div id="adv-step1">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.6rem;">
                <div style="display:flex;align-items:center;gap:0.5rem;">
                    <div style="width:30px;height:30px;background:linear-gradient(135deg,#f59e0b,#fbbf24);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:0.9rem;box-shadow:0 3px 10px rgba(245,158,11,0.3);">💳</div>
                    <div>
                        <div style="font-family:'Outfit';font-size:0.95rem;font-weight:900;color:var(--main-text);">Pay Advance</div>
                        <div style="font-size:0.65rem;color:var(--muted-text);">Secure your booking instantly</div>
                    </div>
                </div>
                <button onclick="toggleQR(false)" id="adv-close-btn" style="background:var(--bg-page);border:1px solid var(--card-border);border-radius:8px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--muted-text);font-size:1rem;line-height:1;">&times;</button>
            </div>

            <!-- Amount chip -->
            <div style="background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:14px;padding:0.6rem 0.85rem;margin-bottom:0.6rem;position:relative;overflow:hidden;">
                <div style="position:absolute;right:-20px;top:-20px;width:90px;height:90px;background:rgba(255,255,255,0.08);border-radius:50%;"></div>
                <div style="font-size:0.55rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgba(0,0,0,0.55);margin-bottom:0.15rem;">Advance Amount</div>
                <div style="font-size:1.85rem;font-weight:900;color:#000;font-family:'Outfit';line-height:1;">₹<?php echo number_format($advAmount); ?></div>
                <div style="font-size:0.68rem;color:rgba(0,0,0,0.5);margin-top:0.15rem;"><?php echo $advPercent; ?>% of ₹<?php echo number_format($fareTotal); ?> total fare<?php echo $advAmount > $calcAdvance ? ' · minimum' : ''; ?></div>
            </div>

            <!-- QR — generated by qrcode.js with exact amount + booking ID -->
            <div style="text-align:center;background:var(--bg-page);border-radius:12px;padding:0.6rem;margin-bottom:0.6rem;border:1px solid var(--card-border);">
                <div style="font-size:0.58rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--muted-text);margin-bottom:0.4rem;">📱 Scan with any UPI App</div>
                <div id="adv-qr-canvas" style="display:inline-block;background:#fff;padding:4px;border-radius:6px;border:1px solid var(--card-border);"></div>
            </div>

            <!-- UPI ID row -->
            <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-page);padding:0.45rem 0.65rem;border-radius:8px;border:1px dashed var(--card-border);margin-bottom:0.6rem;">
                <div>
                    <div style="font-size:0.55rem;color:var(--muted-text);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">UPI ID</div>
                    <div style="font-family:monospace;font-weight:700;color:var(--main-text);font-size:0.76rem;"><?php echo htmlspecialchars($advUpiId); ?></div>
                </div>
                <button onclick="copyUpiId('<?php echo htmlspecialchars($advUpiId,ENT_QUOTES); ?>')" id="copy-upi-btn" style="background:rgba(37,99,235,0.08);border:none;cursor:pointer;color:var(--brand-blue);padding:0.25rem 0.5rem;border-radius:6px;display:flex;align-items:center;gap:0.25rem;font-size:0.65rem;font-weight:700;transition:all 0.2s;">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    Copy
                </button>
            </div>

            <?php if ($advNote): ?>
            <div style="font-size:0.65rem;color:var(--muted-text);background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.18);border-radius:8px;padding:0.4rem 0.65rem;margin-bottom:0.6rem;line-height:1.35;">ℹ️ <?php echo htmlspecialchars($advNote); ?></div>
            <?php endif; ?>

            <!-- CTA: UPI App Buttons -->
            <?php $upiLink = "upi://pay?pa=".urlencode($advUpiId)."&pn=Drop%20Cars&cu=INR&am=".$advAmount."&tn=Booking%20".urlencode($bookingId); ?>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.35rem;margin-bottom:0.4rem;">
                <a id="btn-gpay" href="#" onclick="onUpiAppOpen()" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.2rem;padding:0.4rem 0.15rem;background:#e8f4fd;border:1px solid #bde0fb;border-radius:9px;text-decoration:none;cursor:pointer;transition:transform 0.15s;">
                    <svg width="18" height="18" viewBox="0 0 48 48"><text y="34" font-size="32">G</text></svg>
                    <span style="font-size:0.54rem;font-weight:800;color:#1a73e8;letter-spacing:0.01em;">GPay</span>
                </a>
                <a id="btn-phonepe" href="#" onclick="onUpiAppOpen()" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.2rem;padding:0.4rem 0.15rem;background:#f3eeff;border:1px solid #d5bbff;border-radius:9px;text-decoration:none;cursor:pointer;transition:transform 0.15s;">
                    <svg width="18" height="18" viewBox="0 0 48 48"><text y="34" font-size="28" fill="#5f259f">₱</text></svg>
                    <span style="font-size:0.54rem;font-weight:800;color:#5f259f;letter-spacing:0.01em;">PhonePe</span>
                </a>
                <a id="btn-paytm" href="#" onclick="onUpiAppOpen()" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.2rem;padding:0.4rem 0.15rem;background:#e0f5ff;border:1px solid #9fdcf7;border-radius:9px;text-decoration:none;cursor:pointer;transition:transform 0.15s;">
                    <svg width="18" height="18" viewBox="0 0 48 48"><text y="34" font-size="28" fill="#00b9f5">P</text></svg>
                    <span style="font-size:0.54rem;font-weight:800;color:#0082b5;letter-spacing:0.01em;">Paytm</span>
                </a>
                <a id="btn-bhim" href="#" onclick="onUpiAppOpen()" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.2rem;padding:0.4rem 0.15rem;background:#e6f9ef;border:1px solid #a3e8c0;border-radius:9px;text-decoration:none;cursor:pointer;transition:transform 0.15s;">
                    <svg width="18" height="18" viewBox="0 0 48 48"><text y="34" font-size="22" fill="#138808">UPI</text></svg>
                    <span style="font-size:0.54rem;font-weight:800;color:#138808;letter-spacing:0.01em;">BHIM</span>
                </a>
            </div>
            <div style="font-size:0.62rem;color:var(--muted-text);text-align:center;margin-bottom:0.25rem;">Tap an app or scan the QR above — we'll detect your return ✦</div>
        </div>

        <!-- ── STEP 2: Waiting for Payment Return ──────────────────── -->
        <div id="adv-step2" style="display:none;text-align:center;padding:0.25rem 0;">
            <!-- Animated lock / waiting icon -->
            <div style="position:relative;width:64px;height:64px;margin:0 auto 1rem;">
                <div style="width:64px;height:64px;border:3px solid rgba(37,99,235,0.12);border-top-color:#2563eb;border-radius:50%;animation:spin 1s linear infinite;position:absolute;inset:0;"></div>
                <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:1.6rem;">🔒</div>
            </div>
            <div style="font-size:1.05rem;font-weight:900;font-family:'Outfit';color:var(--main-text);margin-bottom:0.25rem;">Waiting for Payment…</div>
            <div style="font-size:0.8rem;color:var(--muted-text);line-height:1.5;margin-bottom:1rem;">Complete ₹<?php echo number_format($advAmount); ?> payment in your UPI app.<br>We'll auto-detect when you're done.</div>
            <!-- Live dots -->
            <div style="display:flex;align-items:center;justify-content:center;gap:5px;margin-bottom:1rem;">
                <div class="adv-dot" style="width:8px;height:8px;background:#2563eb;border-radius:50%;animation:dotPulse 1.2s ease-in-out infinite;"></div>
                <div class="adv-dot" style="width:8px;height:8px;background:#2563eb;border-radius:50%;animation:dotPulse 1.2s ease-in-out 0.2s infinite;"></div>
                <div class="adv-dot" style="width:8px;height:8px;background:#2563eb;border-radius:50%;animation:dotPulse 1.2s ease-in-out 0.4s infinite;"></div>
            </div>
            <!-- Amount reminder -->
            <div style="background:rgba(37,99,235,0.06);border:1px solid rgba(37,99,235,0.15);border-radius:12px;padding:0.6rem 0.85rem;margin-bottom:1rem;font-size:0.76rem;color:var(--main-text);">
                <span style="color:var(--muted-text);">Paying to:</span> <strong><?php echo htmlspecialchars($advUpiId); ?></strong><br>
                <span style="color:var(--muted-text);">Booking ID:</span> <strong style="font-family:monospace;"><?php echo htmlspecialchars($bookingId); ?></strong>
            </div>
            <!-- UTR input -->
            <div style="margin-bottom:1rem;text-align:left;">
                <label style="font-size:0.65rem;font-weight:700;color:var(--muted-text);text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:0.25rem;">UPI Transaction ID <span style="font-weight:400;text-transform:none;">(optional but speeds up verification)</span></label>
                <input type="text" id="adv-utr-input" placeholder="e.g. 421234567890" maxlength="22" autocomplete="off" inputmode="numeric" style="width:100%;border:1.5px solid var(--card-border);border-radius:10px;padding:0.55rem 0.75rem;font-size:0.88rem;font-family:'Inter',sans-serif;color:var(--main-text);background:var(--bg-page);outline:none;box-sizing:border-box;transition:border-color 0.2s;" onfocus="this.style.borderColor='#2563eb'" onblur="this.style.borderColor=''">
            </div>
            <button onclick="onAdvancePaid()" style="width:100%;padding:0.7rem;background:rgba(16,185,129,0.1);color:#059669;border:1.5px solid rgba(16,185,129,0.3);border-radius:12px;font-weight:700;font-size:0.8rem;font-family:'Outfit';cursor:pointer;">✅ I've Paid — Notify Team</button>
            <button onclick="showAdvStep(1)" style="background:none;border:none;color:var(--muted-text);font-size:0.7rem;cursor:pointer;margin-top:0.5rem;text-decoration:underline;">← Go Back</button>
        </div>

        <!-- ── STEP 3: Verifying (auto-triggered on return) ─────────── -->
        <div id="adv-step3" style="display:none;text-align:center;padding:1rem 0;">
            <div style="width:72px;height:72px;margin:0 auto 1.25rem;position:relative;">
                <svg viewBox="0 0 72 72" width="72" height="72" style="position:absolute;inset:0;animation:spin 2s linear infinite;">
                    <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(37,99,235,0.12)" stroke-width="5"/>
                    <circle cx="36" cy="36" r="30" fill="none" stroke="#2563eb" stroke-width="5" stroke-dasharray="60 130" stroke-linecap="round"/>
                </svg>
                <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:1.6rem;">🔍</div>
            </div>
            <div style="font-size:1.1rem;font-weight:900;font-family:'Outfit';color:var(--main-text);margin-bottom:0.35rem;">Verifying Payment…</div>
            <div style="font-size:0.8rem;color:var(--muted-text);">Notified our team. Waiting for confirmation…</div>
            <div id="adv-poll-status" style="font-size:0.72rem;color:#2563eb;margin-top:0.6rem;">Checking status…</div>
        </div>

        <!-- ── STEP 4: Confirmed ────────────────────────────────────── -->
        <div id="adv-step4" style="display:none;text-align:center;padding:0.25rem 0;">
            <div style="width:64px;height:64px;background:linear-gradient(135deg,#10b981,#059669);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;box-shadow:0 8px 28px rgba(5,150,105,0.35);animation:successPop 0.55s cubic-bezier(0.34,1.56,0.64,1) both;">
                <svg width="30" height="30" fill="none" stroke="#fff" stroke-width="3.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style="font-size:1.2rem;font-weight:900;font-family:'Outfit';color:var(--main-text);margin-bottom:0.3rem;">Payment Notified! ⏳</div>
            <div style="font-size:0.8rem;color:var(--muted-text);line-height:1.5;margin-bottom:1rem;">Our team has been notified of your payment. We will verify the transaction on our end and confirm your booking via WhatsApp shortly.</div>
            <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:12px;padding:0.8rem;margin-bottom:1rem;text-align:left;">
                <div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#059669;margin-bottom:0.45rem;">📋 Summary</div>
                <div style="display:flex;justify-content:space-between;margin-bottom:0.35rem;font-size:0.8rem;"><span style="color:var(--muted-text);">Booking ID</span><strong style="font-family:monospace;"><?php echo htmlspecialchars($bookingId); ?></strong></div>
                <div style="display:flex;justify-content:space-between;margin-bottom:0.35rem;font-size:0.8rem;"><span style="color:var(--muted-text);">Advance Claimed</span><strong style="color:#059669;">₹<?php echo number_format($advAmount); ?></strong></div>
                <div style="display:flex;justify-content:space-between;font-size:0.8rem;"><span style="color:var(--muted-text);">Balance Due</span><strong>₹<?php echo number_format(max(0,$fareTotal-$advAmount)); ?></strong></div>
            </div>
            <button onclick="toggleQR(false)" style="width:100%;padding:0.75rem;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;border:none;border-radius:14px;font-weight:800;font-size:0.88rem;font-family:'Outfit';cursor:pointer;box-shadow:0 4px 15px rgba(37,99,235,0.25);">Done ✓</button>
        </div>

        <!-- ── STEP 5: Error / Fallback ─────────────────────────────── -->
        <div id="adv-step5" style="display:none;text-align:center;padding:1rem 0;">
            <div style="font-size:2.5rem;margin-bottom:1rem;">⚠️</div>
            <div style="font-size:1rem;font-weight:800;font-family:'Outfit';color:var(--main-text);margin-bottom:0.5rem;">Connection Issue</div>
            <div style="font-size:0.82rem;color:var(--muted-text);margin-bottom:1.25rem;line-height:1.6;">We couldn't reach our server, but your UPI payment was sent.<br>Please WhatsApp us your UPI reference number.</div>
            <a href="<?php echo $waHref; ?>" target="_blank" style="display:flex;align-items:center;justify-content:center;gap:0.5rem;padding:0.85rem;background:#25d366;color:#fff;border-radius:12px;font-weight:700;text-decoration:none;font-family:'Outfit';margin-bottom:0.7rem;">
                <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.999 0C5.373 0 0 5.373 0 12c0 2.118.554 4.107 1.523 5.83L.057 23.98l6.306-1.434A11.95 11.95 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 11.999 0zm.001 21.818a9.818 9.818 0 0 1-5.001-1.373l-.36-.214-3.722.847.86-3.636-.235-.374A9.817 9.817 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182c5.431 0 9.818 4.388 9.818 9.818 0 5.431-4.388 9.818-9.818 9.818z"/></svg>
                WhatsApp Us
            </a>
            <button onclick="showAdvStep(1)" style="background:none;border:1px solid var(--card-border);border-radius:10px;padding:0.6rem 1.2rem;color:var(--muted-text);font-size:0.8rem;cursor:pointer;">← Try Again</button>
        </div>

    </div>
</div>

<style>
@keyframes spin        { to { transform: rotate(360deg); } }
@keyframes successPop  { from { transform:scale(0.3); opacity:0; } to { transform:scale(1); opacity:1; } }
@keyframes dotPulse    { 0%,100%{ opacity:.3; transform:scale(0.8); } 50%{ opacity:1; transform:scale(1.2); } }
.adv-modal { 
    max-height: 92vh; 
    overflow-y: auto; 
    scrollbar-width: none; /* Hide scrollbar for Firefox */
    -ms-overflow-style: none; /* Hide scrollbar for IE/Edge */
}
.adv-modal::-webkit-scrollbar {
    display: none; /* Hide scrollbar for Chrome, Safari, and Opera */
}
</style>


<?php echo $shell->renderFooter(); ?>
<?php echo $shell->renderScripts(); ?>
<script>
    // ── Advance Payment Config (PHP → JS) ─────────────────────────
    const ADV_BOOKING_ID   = <?php echo json_encode($bookingId); ?>;
    const ADV_AMOUNT       = <?php echo (int)($advAmount ?? 0); ?>;
    const ADV_CUST_NAME    = <?php echo json_encode($custNameAdv  ?? 'Customer'); ?>;
    const ADV_CUST_PHONE   = <?php echo json_encode($custPhoneAdv ?? ''); ?>;
    const ADV_STATUS       = <?php echo json_encode($advanceStatus); ?>;
    const ADV_ENABLED      = <?php echo json_encode($advEnabled); ?>;

    // ── Live "Broadcasting..." countdown + status poll (PHP → JS) ────
    const BOOKING_STATUS              = <?php echo json_encode($status); ?>;
    const BROADCAST_REMAINING_SECONDS = <?php echo (int) $broadcastRemainingSeconds; ?>;

    // ── State ───────────────────────────────────────────────────────
    let _upiAppLaunched   = false;
    let _paymentHandled   = false;
    let _advWatchdogTimer = null;
    let _pollTimer        = null;
    let _pollCount        = 0;
    const _MAX_POLLS      = 75;   // 5 min at 4s intervals

    // ── UPI URI builder ─────────────────────────────────────────────
    function _upiUri() {
        return 'upi://pay?pa=' + encodeURIComponent('<?php echo addslashes($advUpiId); ?>') +
               '&pn=Drop%20Cars&am=' + ADV_AMOUNT +
               '&tn=' + encodeURIComponent('Booking ' + ADV_BOOKING_ID) +
               '&cu=INR';
    }

    // ── Generate QR code via api.qrserver.com ────────────────────────
    function _generateQR() {
        const canvas = document.getElementById('adv-qr-canvas');
        if (!canvas) return;
        canvas.innerHTML = '<div style="width:145px;height:145px;display:flex;align-items:center;justify-content:center;"><div style="width:24px;height:24px;border:3px solid #e2e8f0;border-top-color:#2563eb;border-radius:50%;animation:spin 0.8s linear infinite;"></div></div>';
        const img = document.createElement('img');
        img.alt = 'UPI QR Code';
        img.style.cssText = 'width:145px;height:145px;display:block;border-radius:4px;';
        img.onload  = function() { canvas.innerHTML = ''; canvas.appendChild(img); };
        img.onerror = function() { canvas.innerHTML = '<div style="width:145px;padding:0.5rem;font-size:0.7rem;color:#64748b;text-align:center;">QR unavailable<br>Use UPI ID below</div>'; };
        img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=145x145&ecc=M&data=' + encodeURIComponent(_upiUri());
    }

    // ── Set app-specific deep links ──────────────────────────────────
    function _setUpiDeepLinks() {
        const params = 'pa=' + encodeURIComponent('<?php echo addslashes($advUpiId); ?>') +
                       '&pn=Drop%20Cars&am=' + ADV_AMOUNT +
                       '&tn=' + encodeURIComponent('Booking ' + ADV_BOOKING_ID) +
                       '&cu=INR';
        const apps = {
            'btn-gpay':    'com.google.android.apps.nbu.paisa.user',
            'btn-phonepe': 'com.phonepe.app',
            'btn-paytm':   'net.one97.paytm',
            'btn-bhim':    'in.org.npci.upiapp'
        };
        Object.entries(apps).forEach(([id, pkg]) => {
            const el = document.getElementById(id);
            if (el) el.href = 'intent://pay?' + params + '#Intent;scheme=upi;package=' + pkg + ';end';
        });
    }

    // ── Step navigation ─────────────────────────────────────────────
    function showAdvStep(n) {
        [1,2,3,4,5].forEach(i => {
            const el = document.getElementById('adv-step' + i);
            if (el) el.style.display = (i === n) ? '' : 'none';
        });
    }

    // ── Overlay open/close ──────────────────────────────────────────
    function toggleQR(show) {
        const overlay = document.getElementById('qr-overlay');
        if (show) {
            showAdvStep(1);
            _upiAppLaunched = false;
            _paymentHandled = false;
            overlay.classList.add('active');
            document.body.style.overflow = 'hidden';
            _generateQR();
            _setUpiDeepLinks();
        } else {
            overlay.classList.remove('active');
            document.body.style.overflow = '';
            _cleanupListeners();
        }
    }

    function handleOverlayClick(e) {
        if (e.target === document.getElementById('qr-overlay')) {
            const step1 = document.getElementById('adv-step1');
            if (step1 && step1.style.display !== 'none') toggleQR(false);
        }
    }

    // ── Cleanup all listeners + timers ──────────────────────────────
    function _cleanupListeners() {
        document.removeEventListener('visibilitychange', _onVisibilityReturn);
        window.removeEventListener('pageshow', _onPageShow);
        if (_advWatchdogTimer) { clearTimeout(_advWatchdogTimer); _advWatchdogTimer = null; }
        if (_pollTimer)        { clearTimeout(_pollTimer);        _pollTimer = null; }
    }

    // ── Return-from-app detection ───────────────────────────────────
    function _onVisibilityReturn() {
        if (document.visibilityState === 'visible' && _upiAppLaunched && !_paymentHandled)
            setTimeout(_triggerVerification, 600);
    }
    function _onPageShow(e) {
        if (e.persisted && _upiAppLaunched && !_paymentHandled)
            setTimeout(_triggerVerification, 600);
    }

    // ── Called when any UPI app button is tapped ────────────────────
    function onUpiAppOpen() {
        _upiAppLaunched = true;
        setTimeout(() => {
            const overlay = document.getElementById('qr-overlay');
            if (overlay && overlay.classList.contains('active')) showAdvStep(2);
        }, 500);
        document.addEventListener('visibilitychange', _onVisibilityReturn);
        window.addEventListener('pageshow', _onPageShow);
        _advWatchdogTimer = setTimeout(() => {
            if (!_paymentHandled) {
                const btn = document.querySelector('#adv-step2 button');
                if (btn) { btn.style.background='rgba(16,185,129,0.2)'; btn.style.borderColor='#059669'; }
            }
        }, 90000);
    }

    // ── Poll backend for admin verification ─────────────────────────
    function _startPolling() {
        _pollCount = 0;
        _doPoll();
    }

    function _doPoll() {
        if (_pollCount >= _MAX_POLLS) {
            // Timed out — show confirmed anyway (admin will verify)
            showAdvStep(4);
            return;
        }
        const ps = document.getElementById('adv-poll-status');
        if (ps) ps.textContent = 'Checking with server… (' + (_pollCount + 1) + ')';

        fetch('/api/check-payment-status.php?booking_id=' + encodeURIComponent(ADV_BOOKING_ID))
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data) { _schedulePoll(); return; }
                if (data.status === 'verified') {
                    showAdvStep(4);
                    // Also update the on-page card dynamically!
                    const pendingState = document.getElementById('adv-card-pending');
                    const verifiedState = document.getElementById('adv-card-verified');
                    if (pendingState) pendingState.style.display = 'none';
                    if (verifiedState) verifiedState.style.display = 'block';
                } else if (data.status === 'rejected') {
                    showAdvStep(5);
                } else {
                    _schedulePoll();
                }
            })
            .catch(() => _schedulePoll());
    }

    function _schedulePoll() {
        _pollCount++;
        _pollTimer = setTimeout(_doPoll, 4000);
    }

    // ── Core: record payment + start polling ────────────────────────
    function _triggerVerification() {
        if (_paymentHandled) return;
        _paymentHandled = true;
        _cleanupListeners();
        showAdvStep(3);

        const utr = (document.getElementById('adv-utr-input')?.value || '').trim().replace(/\D/g,'');
        const fd  = new FormData();
        fd.append('booking_id',    ADV_BOOKING_ID);
        fd.append('customer_name', ADV_CUST_NAME);
        fd.append('customer_phone',ADV_CUST_PHONE);
        fd.append('amount',        ADV_AMOUNT);
        fd.append('utr',           utr);
        fd.append('note',          utr ? 'UPI Ref: ' + utr : 'UPI payment — auto-detected on app return');

        fetch('/api/record-advance.php', { method:'POST', body: fd })
            .then(r => r.ok ? r.json() : Promise.reject('http-' + r.status))
            .then(() => _startPolling())
            .catch(() => setTimeout(() => showAdvStep(5), 1500));
    }

    // ── Manual "I've Paid" tap ───────────────────────────────────────
    function onAdvancePaid() { _triggerVerification(); }

    // ── Copy UPI ID ─────────────────────────────────────────────────
    function copyUpiId(upiId) {
        const btn = document.getElementById('copy-upi-btn');
        const writeText = navigator.clipboard?.writeText(upiId);
        const succeed = () => {
            if (btn) { btn.style.color='#10b981'; btn.innerHTML='<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Copied!'; }
            setTimeout(() => { if(btn){ btn.style.color=''; btn.innerHTML='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy'; }}, 2200); };
        if (writeText) { writeText.then(succeed).catch(()=>{}); }
        else {
            const ta = Object.assign(document.createElement('textarea'), {value:upiId});
            Object.assign(ta.style,{position:'fixed',opacity:'0'});
            document.body.appendChild(ta); ta.select();
            try{document.execCommand('copy');}catch(e){}
            document.body.removeChild(ta); succeed();
        }
    }

    // ── Booking ID Copier ────────────────────────────────────────
    const copyBtn = document.getElementById('copy-btn');
    const copyTooltip = document.getElementById('copy-tooltip');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const rawId = "<?php echo $bookingId; ?>";
            navigator.clipboard.writeText(rawId).then(() => {
                copyTooltip.classList.add('show');
                setTimeout(() => { copyTooltip.classList.remove('show'); }, 1500);
            });
        });
    }

    // ── Celebration Confetti ─────────────────────────────────────
    <?php if ($enableSuccessConfetti): ?>
    (function createConfetti() {
        const container = document.getElementById('confetti-container');
        if (!container) return;
        const colors = ['#f59e0b', '#2563eb', '#10b981', '#f472b6', '#8b5cf6', '#0ea5e9', '#ffffff'];
        const shapes = ['square', 'circle', 'triangle'];
        
        for (let i = 0; i < 110; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            
            const shape = shapes[Math.floor(Math.random() * shapes.length)];
            const color = colors[Math.floor(Math.random() * colors.length)];
            const size = Math.random() * 8 + 6;
            
            confetti.style.left = Math.random() * 100 + '%';
            confetti.style.backgroundColor = color;
            confetti.style.width = size + 'px';
            confetti.style.height = size + 'px';
            confetti.style.opacity = Math.random() * 0.5 + 0.5;
            
            if (shape === 'circle') confetti.style.borderRadius = '50%';
            if (shape === 'triangle') {
                confetti.style.width = '0';
                confetti.style.height = '0';
                confetti.style.backgroundColor = 'transparent';
                confetti.style.borderLeft = (size/2) + 'px solid transparent';
                confetti.style.borderRight = (size/2) + 'px solid transparent';
                confetti.style.borderBottom = size + 'px solid ' + color;
            }

            const duration = Math.random() * 3.2 + 2.5;
            const delay = Math.random() * 1.8;
            confetti.style.animation = `fall ${duration}s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`;
            confetti.style.animationDelay = delay + 's';
            
            const drift = (Math.random() - 0.5) * 160;
            confetti.style.transform = `translateX(${drift}px)`;
            
            container.appendChild(confetti);
        }
    })();
    <?php endif; ?>

    // ── Interactive Review Stars & AJAX ──────────────────────────
    <?php if ($status === 'completed'): ?>
    (function initReviewRating() {
        const stars = document.querySelectorAll('.details-star-btn');
        const ratingHidden = document.getElementById('details-star-rating-hidden');
        let currentRating = 0;

        stars.forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                const v = +btn.dataset.star;
                stars.forEach(s => s.style.color = +s.dataset.star <= v ? '#f59e0b' : '#cbd5e1');
            });
            btn.addEventListener('mouseleave', () => {
                stars.forEach(s => s.style.color = +s.dataset.star <= currentRating ? '#f59e0b' : '#cbd5e1');
            });
            btn.addEventListener('click', () => {
                currentRating = +btn.dataset.star;
                if (ratingHidden) ratingHidden.value = currentRating;
                stars.forEach(s => s.style.color = +s.dataset.star <= currentRating ? '#f59e0b' : '#cbd5e1');
            });
        });

        const reviewForm = document.getElementById('details-review-form');
        if (reviewForm) {
            reviewForm.addEventListener('submit', function(e) {
                e.preventDefault();
                const msg = document.getElementById('details-review-msg');
                const btn = reviewForm.querySelector('.review-submit');
                
                if (+ratingHidden.value < 1) { 
                    msg.style.display = 'block'; 
                    msg.style.color = '#ef4444'; 
                    msg.textContent = 'Please select a star rating.'; 
                    return; 
                }
                
                btn.disabled = true; 
                btn.textContent = 'Submitting…';
                
                fetch('/api/submit-review.php', { method: 'POST', body: new FormData(reviewForm) })
                    .then(r => r.json())
                    .then(d => {
                        msg.style.display = 'block';
                        if (d.success) {
                            msg.style.color = '#10b981';
                            msg.textContent = '✅ Thank you! Your review has been submitted successfully.';
                            document.getElementById('details-review-comment').value = '';
                            currentRating = 0;
                            if (ratingHidden) ratingHidden.value = 0;
                            stars.forEach(s => s.style.color = '#cbd5e1');
                            reviewForm.reset();
                        } else {
                            msg.style.color = '#ef4444';
                            msg.textContent = d.message || 'Could not submit. Please try again.';
                        }
                    })
                    .catch(() => { 
                        msg.style.display = 'block'; 
                        msg.style.color = '#ef4444'; 
                        msg.textContent = 'Network error. Please try again.'; 
                    })
                    .finally(() => { 
                        btn.disabled = false; 
                        btn.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Submit Rating'; 
                    });
            });
        }
    })();
    <?php endif; ?>

    // ── Advance Payment Stateful Card Initializer ──────────────────
    document.addEventListener('DOMContentLoaded', () => {
        const card = document.getElementById('adv-payment-card');
        const promptState = document.getElementById('adv-card-prompt');
        const queueState = document.getElementById('adv-card-queue');
        const pendingState = document.getElementById('adv-card-pending');
        const verifiedState = document.getElementById('adv-card-verified');
        
        if (!card) return;
        
        if (ADV_STATUS === 'pending') {
            card.style.display = 'block';
            if (pendingState) pendingState.style.display = 'block';
            _startPolling();
        } else if (ADV_STATUS === 'verified') {
            card.style.display = 'block';
            if (verifiedState) verifiedState.style.display = 'block';
        } else if (ADV_STATUS === 'rejected') {
            card.style.display = 'block';
            if (promptState) {
                promptState.style.display = 'block';
                const alertBanner = document.createElement('div');
                alertBanner.style.cssText = 'background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.25); color:#ef4444; padding:0.6rem 0.85rem; border-radius:10px; font-size:0.8rem; font-weight:700; margin-bottom:1rem; text-align:left;';
                alertBanner.innerHTML = '⚠️ Your previous payment verification failed. Please check the transaction details and re-submit, or contact support.';
                promptState.querySelector('.payment-card-inner').prepend(alertBanner);
            }
        } else if (ADV_ENABLED) {
            card.style.display = 'block';
            let wasSkipped = null;
            try { wasSkipped = localStorage.getItem('adv_skipped_' + ADV_BOOKING_ID); } catch (_) {}
            if (wasSkipped === 'true') {
                if (queueState) queueState.style.display = 'block';
            } else {
                if (promptState) promptState.style.display = 'block';
            }
        }
    });

    // ── Live "Broadcasting..." countdown + status poll ──────────────
    // status === 'pending' only (server-rendered broadcast-status-card).
    // Polls api/check-trip-status.php every ~6s; on accepted/cancelled it
    // swaps the hero + card text/color in place, on confirmed it reloads
    // the page to reveal the driver-assigned view rendered further down.
    (function initBroadcastStatus() {
        if (BOOKING_STATUS !== 'pending') return;
        var card = document.getElementById('broadcast-status-card');
        if (!card) return;
        var countdownEl = document.getElementById('broadcast-countdown');
        var subEl = document.getElementById('broadcast-status-sub');
        var titleEl = document.getElementById('broadcast-status-title');

        var remaining = Math.max(0, BROADCAST_REMAINING_SECONDS);
        var countdownTimer = null;
        var pollTimer = null;
        var stopped = false;

        function pad(n) { return (n < 10 ? '0' : '') + n; }
        function formatCountdown(totalSeconds) {
            totalSeconds = Math.max(0, totalSeconds);
            var h = Math.floor(totalSeconds / 3600);
            var m = Math.floor((totalSeconds % 3600) / 60);
            var s = totalSeconds % 60;
            return h > 0 ? (pad(h) + ':' + pad(m) + ':' + pad(s)) : (pad(m) + ':' + pad(s));
        }
        function tickCountdown() {
            if (countdownEl) countdownEl.textContent = formatCountdown(remaining);
            if (remaining <= 0) {
                if (countdownTimer) clearInterval(countdownTimer);
                if (subEl) subEl.textContent = 'Finalizing your booking...';
                return;
            }
            remaining -= 1;
        }
        tickCountdown();
        countdownTimer = setInterval(tickCountdown, 1000);

        function stopBroadcastActivity() {
            stopped = true;
            if (countdownTimer) clearInterval(countdownTimer);
            if (pollTimer) clearTimeout(pollTimer);
        }

        function swapHeroInPlace(newStatus, title, desc, iconSvg) {
            var blob = document.querySelector('.success-blob');
            if (blob) {
                blob.className = 'success-blob state-' + newStatus;
                blob.innerHTML = iconSvg || '';
            }
            var h1 = document.querySelector('.ty-hero h1');
            if (h1) h1.textContent = title;
            var heroDesc = document.querySelector('.ty-hero p');
            if (heroDesc) heroDesc.textContent = desc;
        }

        function applyAcceptedInPlace() {
            card.classList.add('is-accepted');
            if (titleEl) titleEl.textContent = 'A Driver Partner Has Accepted!';
            if (subEl) subEl.textContent = 'Someone accepted your booking and is now assigning a driver.';
            swapHeroInPlace(
                'accepted',
                'A Driver Partner Has Accepted!',
                'Someone accepted your booking and is now assigning a driver. Please wait a little while - the driver will contact you shortly.',
                '<svg fill="none" stroke="currentColor" stroke-width="4.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg>'
            );
            stopBroadcastActivity();
        }

        function applyCancelledInPlace() {
            card.classList.add('is-cancelled');
            if (titleEl) titleEl.textContent = 'Booking Cancelled';
            if (subEl) subEl.textContent = 'This booking has been cancelled. No charges were made.';
            swapHeroInPlace(
                'cancelled',
                'Booking Cancelled',
                'This booking request has been cancelled. No charges were made.',
                '<svg fill="none" stroke="currentColor" stroke-width="4.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>'
            );
            stopBroadcastActivity();
        }

        function schedulePoll() {
            if (stopped) return;
            pollTimer = setTimeout(pollStatus, 6000);
        }

        function pollStatus() {
            if (stopped) return;
            fetch('/api/check-trip-status.php?booking_id=' + encodeURIComponent(ADV_BOOKING_ID))
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (data) {
                    if (!data || stopped) { schedulePoll(); return; }
                    var raw = (data.raw_status || '').toString().toLowerCase();
                    if (raw === 'accepted') {
                        applyAcceptedInPlace();
                    } else if (raw === 'confirmed') {
                        stopBroadcastActivity();
                        window.location.reload();
                    } else if (raw === 'cancelled') {
                        applyCancelledInPlace();
                    } else {
                        schedulePoll();
                    }
                })
                .catch(function () { schedulePoll(); });
        }
        schedulePoll();
    })();

    // ── Cancel Booking + OTP modal (api/website-cancel-booking.php) ──
    // Reuses the .sug-modal-overlay/.sug-modal-card shell (see #cancel-modal-overlay
    // markup above + its move-to-<body> below, same technique as the rewards
    // pop-up's closeSugModal()). ADV_BOOKING_ID (declared above) is this
    // page's booking_id - reused here instead of a second identical const.
    (function initCancelBookingModal() {
        var overlay = document.getElementById('cancel-modal-overlay');
        if (!overlay) return;
        if (overlay.parentNode !== document.body) document.body.appendChild(overlay);

        var closeBtn = document.getElementById('cancel-modal-close-btn');
        if (closeBtn) closeBtn.addEventListener('click', closeCancelModal);

        var otpInput = document.getElementById('cancel-otp-input');
        if (otpInput) {
            otpInput.addEventListener('input', function () {
                otpInput.value = otpInput.value.replace(/\D/g, '').slice(0, 6);
            });
            otpInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); submitCancelOtp(); }
            });
        }

        <?php if (($_GET['action'] ?? '') === 'cancel'): ?>
        // Deep-linked here from pages/track-booking.php's "Cancel This
        // Booking" button (?action=cancel) - auto-open the same flow.
        openCancelBookingModal();
        <?php endif; ?>
    })();

    function openCancelModal() {
        var overlay = document.getElementById('cancel-modal-overlay');
        if (!overlay) return;
        overlay.style.display = '';
        document.body.classList.add('dropcars-modal-open');
        requestAnimationFrame(function () { overlay.classList.add('active'); });
    }

    function closeCancelModal() {
        var overlay = document.getElementById('cancel-modal-overlay');
        if (!overlay) return;
        overlay.classList.add('closing');
        document.body.classList.remove('dropcars-modal-open');
        setTimeout(function () {
            overlay.classList.remove('active', 'closing');
            overlay.style.display = 'none';
        }, 320);
    }

    function openCancelBookingModal() {
        if (!window.confirm('Are you sure you want to cancel this booking?')) return;
        requestCancelOtp(false);
    }

    function requestCancelOtp(isResend) {
        var sentMsg = document.getElementById('cancel-otp-sent-msg');
        var errEl = document.getElementById('cancel-modal-error');
        if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
        if (sentMsg) sentMsg.textContent = isResend ? 'Resending your code…' : 'Sending you a verification code…';
        if (!isResend) openCancelModal();

        fetch('/api/website-cancel-booking.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'request_otp', booking_id: ADV_BOOKING_ID }),
        })
            .then(function (r) { return r.json ? r.json().catch(function () { return {}; }) : {}; })
            .then(function (data) {
                if (data && data.success) {
                    if (sentMsg) sentMsg.textContent = data.message || 'A code has been sent to your email.';
                } else {
                    if (sentMsg) sentMsg.textContent = 'Could not send a code right now.';
                    if (errEl) {
                        errEl.textContent = (data && data.message) || 'Please try again or call support.';
                        errEl.style.display = 'block';
                    }
                }
            })
            .catch(function () {
                if (errEl) {
                    errEl.textContent = 'Network error. Please try again or call support.';
                    errEl.style.display = 'block';
                }
            });
    }

    function submitCancelOtp() {
        var otpInput = document.getElementById('cancel-otp-input');
        var errEl = document.getElementById('cancel-modal-error');
        var submitBtn = document.getElementById('cancel-otp-submit-btn');
        var otp = otpInput ? otpInput.value.trim() : '';
        if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
        if (!otp || otp.length < 4) {
            if (errEl) {
                errEl.textContent = 'Please enter the code sent to your email.';
                errEl.style.display = 'block';
            }
            return;
        }
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Confirming…'; }

        fetch('/api/website-cancel-booking.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'confirm_cancel', booking_id: ADV_BOOKING_ID, otp: otp }),
        })
            .then(function (r) { return r.json ? r.json().catch(function () { return {}; }) : {}; })
            .then(function (data) {
                if (data && data.success) {
                    showCancelResult(data);
                } else if (errEl) {
                    errEl.textContent = (data && data.message) || 'Invalid or expired code. Please try again.';
                    errEl.style.display = 'block';
                }
            })
            .catch(function () {
                if (errEl) {
                    errEl.textContent = 'Network error. Please try again.';
                    errEl.style.display = 'block';
                }
            })
            .finally(function () {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Confirm Cancellation'; }
            });
    }

    function showCancelResult(data) {
        var stepOtp = document.getElementById('cancel-modal-step-otp');
        var stepResult = document.getElementById('cancel-modal-step-result');
        var titleEl = document.getElementById('cancel-result-title');
        var descEl = document.getElementById('cancel-result-desc');
        var refundActions = document.getElementById('cancel-refund-actions');
        if (stepOtp) stepOtp.style.display = 'none';
        if (stepResult) stepResult.style.display = 'block';
        if (titleEl) titleEl.textContent = 'Booking Cancelled';
        if (descEl) {
            descEl.textContent = data.message || (data.refund_eligible
                ? 'Your booking has been cancelled. Your advance is eligible for a full refund.'
                : 'Your booking has been cancelled.');
        }
        if (refundActions) refundActions.style.display = data.refund_eligible ? 'flex' : 'none';

        // Reflect the cancellation on the page itself, no reload needed.
        var broadcastCard = document.getElementById('broadcast-status-card');
        if (broadcastCard) {
            broadcastCard.classList.add('is-cancelled');
            var bt = document.getElementById('broadcast-status-title');
            var bs = document.getElementById('broadcast-status-sub');
            if (bt) bt.textContent = 'Booking Cancelled';
            if (bs) bs.textContent = 'This booking has been cancelled. No charges were made.';
        }
        var blob = document.querySelector('.success-blob');
        if (blob) {
            blob.className = 'success-blob state-cancelled';
            blob.innerHTML = '<svg fill="none" stroke="currentColor" stroke-width="4.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>';
        }
        var h1 = document.querySelector('.ty-hero h1');
        if (h1) h1.textContent = 'Booking Cancelled';
        var heroDesc = document.querySelector('.ty-hero p');
        if (heroDesc) heroDesc.textContent = 'This booking request has been cancelled. No charges were made.';
    }

    function submitRefundRequest() {
        var btn = document.getElementById('cancel-refund-btn');
        var msgEl = document.getElementById('cancel-refund-result-msg');
        if (btn) { btn.disabled = true; btn.textContent = 'Requesting…'; }

        fetch('/api/website-cancel-booking.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'request_refund', booking_id: ADV_BOOKING_ID }),
        })
            .then(function (r) { return r.json ? r.json().catch(function () { return {}; }) : {}; })
            .then(function (data) {
                if (msgEl) {
                    msgEl.style.display = 'block';
                    msgEl.textContent = (data && data.message) || 'Your refund has been requested.';
                    msgEl.style.color = (data && data.success) ? 'var(--success)' : '#ef4444';
                }
                if (data && data.success && btn) {
                    btn.style.display = 'none';
                }
            })
            .catch(function () {
                if (msgEl) {
                    msgEl.style.display = 'block';
                    msgEl.textContent = 'Network error. Please try again or call support.';
                    msgEl.style.color = '#ef4444';
                }
            })
            .finally(function () {
                if (btn && btn.style.display !== 'none') { btn.disabled = false; btn.textContent = 'Request Refund'; }
            });
    }

    window.continueWithoutAdvance = function() {
        const promptState = document.getElementById('adv-card-prompt');
        const queueState = document.getElementById('adv-card-queue');
        if (promptState) promptState.style.display = 'none';
        if (queueState) queueState.style.display = 'block';
        try { localStorage.setItem('adv_skipped_' + ADV_BOOKING_ID, 'true'); } catch (_) {}
    };
</script>

</body>
</html>
