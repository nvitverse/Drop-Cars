<?php
require_once __DIR__ . '/../engine/shell.php';
if (!defined('DROP_CARS_DB_OPTIONAL')) {
    define('DROP_CARS_DB_OPTIONAL', true);
}
require_once __DIR__ . '/../admin/config/database.php';
require_once __DIR__ . '/../api/fare-breakdown-format.php';
session_start();

// Detect the real active theme the same way index.php does (subdomain / ?theme=)
// instead of always defaulting to drop-cars — otherwise a customer who just
// booked on AirportTaxi.International would land on a "Drop Cars"-branded
// tracking page right after confirming their booking.
require_once __DIR__ . '/../includes/paths.php';
require_once __DIR__ . '/../engine/theme-engine.php';
require_once __DIR__ . '/../engine/theme-seo.php';
$themeEngineForTracking = new ThemeEngine();
$activeTheme = dropcars_merge_theme_seo($themeEngineForTracking->detectTheme());
$themesList = $themeEngineForTracking->getAllThemes();
$shell = new UIShell($activeTheme, $themesList);

$bookingIdInput = trim((string)($_GET['booking_id'] ?? $_POST['booking_id'] ?? ''));
$mobileInput = trim((string)($_GET['phone'] ?? $_POST['phone'] ?? ''));
$error = '';
$booking = null;
$dbUnavailable = !isset($pdo) || !($pdo instanceof PDO);
$advanceClaim = null;

// Resolving vehicles config and active theme
$config = [];
$configPath = __DIR__ . '/../data/config.json';
if (file_exists($configPath)) {
    $config = json_decode(file_get_contents($configPath), true) ?: [];
}
$sitePhone = $config['company']['phone'] ?? $config['contact']['phone'] ?? '7598899579';
$functionalPhone = $config['company']['functional_phone'] ?? '7200217986';
$functionalWhatsApp = $config['company']['functional_whatsapp'] ?? '917200217986';
$phoneHref = 'tel:+' . preg_replace('/\D/', '', $functionalPhone);
$waHref = 'https://wa.me/' . preg_replace('/\D/', '', $functionalWhatsApp);

if ($dbUnavailable && ($bookingIdInput || $mobileInput)) {
    $error = 'Driver lookup is temporarily busy. Please call ' . htmlspecialchars($sitePhone) . ' or WhatsApp us with your booking ID.';
}

if (!$dbUnavailable && $bookingIdInput && $mobileInput) {
    // Attempt to find a SPECIFIC confirmed booking
    $stmt = $pdo->prepare("SELECT b.*, c.name as customer_name, c.phone as customer_phone 
                           FROM `bookings` b 
                           JOIN `customers` c ON b.customer_id = c.id 
                           WHERE (b.booking_id = ? OR b.id = ?) AND c.phone = ?");
    $stmt->execute([$bookingIdInput, $bookingIdInput, $mobileInput]);
    $booking = $stmt->fetch();

    if (!$booking) {
        $error = "No booking found with these details. Please double-check your Booking ID and Registered Phone Number.";
    } else {
        // Fetch latest advance payment claim status
        $advanceClaim = null;
        try {
            $tableCheck = $pdo->query("SHOW TABLES LIKE 'advance_payments'")->fetchColumn();
            if ($tableCheck) {
                $stmtClaim = $pdo->prepare("SELECT * FROM `advance_payments` WHERE booking_id = ? ORDER BY id DESC LIMIT 1");
                $stmtClaim->execute([$booking['booking_id']]);
                $advanceClaim = $stmtClaim->fetch();
            }
        } catch (Throwable $e) {
            error_log('track-booking query error: ' . $e->getMessage());
        }
    }
}

// Check for session-based history (only if NOT currently looking up a specific booking)
$historyBookings = [];
$sessionCustomerId = null;
$sessionCustomer = null;
if (!$dbUnavailable && !$booking) {
    // Look up by phone first, fall back to email (covers all login methods)
    if (!empty($_SESSION['customer_phone'])) {
        try {
            $stmt = $pdo->prepare("SELECT * FROM `customers` WHERE `phone` = ? LIMIT 1");
            $stmt->execute([$_SESSION['customer_phone']]);
            $sessionCustomer = $stmt->fetch();
            $sessionCustomerId = $sessionCustomer['id'] ?? null;
        } catch (Throwable $e) {}
    }
    if (!$sessionCustomerId && !empty($_SESSION['customer_email'])) {
        try {
            $stmt = $pdo->prepare("SELECT * FROM `customers` WHERE `email` = ? LIMIT 1");
            $stmt->execute([$_SESSION['customer_email']]);
            $sessionCustomer = $stmt->fetch();
            $sessionCustomerId = $sessionCustomer['id'] ?? null;
        } catch (Throwable $e) {}
    }
    if ($sessionCustomerId) {
        try {
            $stmt = $pdo->prepare("SELECT * FROM `bookings` WHERE `customer_id` = ? ORDER BY `created_at` DESC");
            $stmt->execute([$sessionCustomerId]);
            $historyBookings = $stmt->fetchAll();
        } catch (Throwable $e) {}
    }
}

// Config was resolved at the top of the file. $activeTheme / $themesList were
// already detected near the top of this file (subdomain / ?theme= aware) and
// passed into `new UIShell($activeTheme, $themesList)` — kept as-is here.

// Config was loaded and resolved at the top of the file

// Prefill phone from session for the search form
$sessionPhone = $_SESSION['customer_phone'] ?? '';
$sessionPrefillNational = '';
if ($sessionPhone) {
    $parts = explode(' ', trim($sessionPhone), 2);
    $sessionPrefillNational = count($parts) === 2 && strpos($parts[0], '+') === 0 ? $parts[1] : $sessionPhone;
} elseif (!empty($_SESSION['customer_email'])) {
    // For email-only logins, try DB lookup
    if (!$dbUnavailable) {
        try {
            $stmt = $pdo->prepare("SELECT phone FROM `customers` WHERE email = ? LIMIT 1");
            $stmt->execute([$_SESSION['customer_email']]);
            $r = $stmt->fetch();
            if ($r && $r['phone']) {
                $parts = explode(' ', trim($r['phone']), 2);
                $sessionPrefillNational = count($parts) === 2 && strpos($parts[0], '+') === 0 ? $parts[1] : $r['phone'];
            }
        } catch (Throwable $e) {}
    }
}
$trackFormPhonePrefill = $mobileInput ?: $sessionPrefillNational;

$selectedVehicleType = 'SEDAN';
$vehicleInfo = null;
$isInclusive = false;
$inclusions = [];
$exclusions = [];
$formattedPickupDate = '';

if ($booking) {
    $selectedVehicleType = strtoupper((string)($booking['car_name'] ?? 'SEDAN'));
    if (!empty($config['vehicles']) && is_array($config['vehicles'])) {
        foreach ($config['vehicles'] as $v) {
            if (strtoupper((string)($v['value'] ?? '')) === $selectedVehicleType) {
                $vehicleInfo = $v; break;
            }
        }
    }
    
    $isInclusive = ($booking['fare_type'] ?? 'exclusive') === 'inclusive';
    $tripType = strtolower($booking['trip_type'] ?? '');
    $isRoundTrip = (strpos($tripType, 'round') !== false || strpos($tripType, 'multi') !== false);

    $includeTolls = $isInclusive;
    $includeTaxes = $isInclusive;
    if (!empty($booking['fare_breakdown'])) {
        $fb = json_decode($booking['fare_breakdown'], true);
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

    $isHourlyTrip = strpos($tripType, 'hourly') !== false;

    $exclusions = [
        'Parking and entry fees, (if any)',
    ];
    if (!$isHourlyTrip) {
        $exclusions[] = 'Extra KMs (if exceeded)';
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
        // Rental waiting/extra time & km is billed at the hourly package
        // tariff, not a flat fee - matches assets/js/booking-form.js.
        $dcFaresCfg = null;
        $dcCfgPath = __DIR__ . '/../data/config.json';
        if (file_exists($dcCfgPath)) {
            $dcCfgJson = json_decode(file_get_contents($dcCfgPath), true);
            $dcFaresCfg = $dcCfgJson['fares'] ?? null;
        }
        $hourlyRate = $dcFaresCfg ? (int) ($dcFaresCfg['hourlyRates'][$selectedVehicleType] ?? 0) : 0;
        if ($hourlyRate > 0) {
            $exclusions[] = "Extra hour beyond package at ₹{$hourlyRate}/hr, Extra km beyond package at ₹" . round($hourlyRate / 10) . "/km (as per hourly tariff)";
        } else {
            $exclusions[] = 'Waiting or additional stop charges (₹150 per stop/hour), if availed';
        }
    } else {
        $exclusions[] = 'Waiting or additional stop charges (₹150 per stop/hour), if availed';
    }

    // Pretty format date
    $pickupDateRaw = $booking['pickup_date'] ?? '';
    $formattedPickupDate = $pickupDateRaw;
    if (!empty($pickupDateRaw)) {
        $dateObj = DateTime::createFromFormat('Y-m-d', $pickupDateRaw);
        if ($dateObj) {
            $formattedPickupDate = $dateObj->format('D, d M Y');
        }
    }
}

$bookingIdDisplay = $booking ? ($booking['booking_id'] ?: $booking['id']) : '';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Track Cab Booking & Live Driver Status | Drop Cars</title>
    <meta name="description" content="Track your Drop Cars cab booking status, driver details & live trip updates in real-time. Enter your booking ID to check status.">
<?php dropcars_render_favicons($activeTheme['slug'] ?? null); ?>
    
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@500;600;700;800&family=Share+Tech+Mono&display=swap" rel="stylesheet">
    
    <link rel="stylesheet" href="/assets/css/base.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/base.css'); ?>">
    <link rel="stylesheet" href="/assets/css/layout.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/layout.css'); ?>">
    <link rel="stylesheet" href="/assets/css/navbar.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/navbar.css'); ?>">
    <link rel="stylesheet" href="/assets/css/theme-switcher.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/theme-switcher.css'); ?>">
    <link rel="stylesheet" href="/assets/css/footer.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/footer.css'); ?>">
    <link rel="stylesheet" href="/assets/css/whatsapp.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/whatsapp.css'); ?>">
    <link rel="stylesheet" href="/assets/css/booking-form.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/booking-form.css'); ?>">
    <link rel="stylesheet" href="/assets/css/responsive.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/responsive.css'); ?>">
    <link rel="stylesheet" href="/assets/css/dark-mode.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/dark-mode.css'); ?>">
    <link rel="stylesheet" href="/assets/css/light-theme.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/light-theme.css'); ?>">
    <?php if (($activeTheme['slug'] ?? '') === 'airport-taxi'): ?>
    <link rel="stylesheet" href="/assets/css/theme-airporttaxi.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/theme-airporttaxi.css'); ?>">
    <?php endif; ?>
    <script src="/assets/js/dark-mode.js?v=<?php echo @filemtime(__DIR__ . '/../assets/js/dark-mode.js'); ?>"></script>
    
    <style>
        :root {
            --success: #10b981;
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
            --accent-glow: rgba(37, 99, 235, 0.04);
            --accent-glow-solid: #f0f5ff;
        }

        /* AirportTaxi.International — elite black & champagne-gold override.
           Reuses the page's existing CSS-variable system (same pattern as the
           dark-mode block below) so every var(--brand-blue) etc. throughout
           this file repaints automatically — no per-rule edits needed. */
        [data-active-theme-id="airporttaxi"] {
            --success: #16a34a;
            --bg-page: #fbf9f4;
            --card-border: rgba(166, 124, 46, 0.22);
            --card-bg: #ffffff;
            --muted-text: #6b6558;
            --main-text: #171612;
            --gold: #a67c2e;
            --dark-blue: #171612;
            --brand-blue: #a67c2e;
            --mesh-1: #f6e9c7;
            --mesh-2: #f0e6d2;
            --mesh-3: #faf6ea;
            --accent-glow: rgba(166, 124, 46, 0.08);
            --accent-glow-solid: #f6e9c7;
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
            --accent-glow: rgba(37, 99, 235, 0.08);
            --accent-glow-solid: #111a2e;
        }

        body { 
            background: var(--bg-page); 
            background-image: 
                radial-gradient(at 0% 0%, var(--mesh-1) 0, transparent 40%), 
                radial-gradient(at 50% 0%, var(--mesh-2) 0, transparent 40%), 
                radial-gradient(at 100% 0%, var(--mesh-3) 0, transparent 40%);
            background-attachment: fixed;
            color: var(--main-text); 
            font-family: 'Inter', sans-serif; 
            overflow-x: hidden; 
            margin: 0;
            padding: 0;
        }
        .outfit { font-family: 'Outfit', sans-serif; }
        .tech-mono { font-family: 'Share Tech Mono', monospace; }

        .container-sm { max-width: 680px; margin: 0 auto; padding: 1.5rem 1rem 2rem; animation: fadeInUp 0.8s ease-out both; position: relative; transition: max-width 0.4s ease; }
        .container-sm.booking-details-mode { max-width: 1080px; }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }

        .tracker-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 1.25rem;
            align-items: start;
        }
        @media (min-width: 768px) {
            .tracker-grid {
                grid-template-columns: 1.25fr 0.75fr;
                gap: 1.5rem;
            }
        }

        .glass-block { 
            background: var(--card-bg);
            border: 1px solid var(--card-border); border-radius: 20px; 
            padding: 1.5rem; margin-bottom: 1.25rem; 
            box-shadow: 0 4px 20px rgba(0,0,0,0.01);
            position: relative; overflow: hidden;
            transition: border-color 0.3s ease, transform 0.3s ease;
        }
        .glass-block:hover {
            border-color: rgba(37, 99, 235, 0.15);
        }

        .block-label { font-size: 0.75rem; text-transform: uppercase; color: var(--brand-blue); font-weight: 800; letter-spacing: 0.08em; margin-bottom: 1rem; display: block; }
        
        .status-badge-premium {
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: 20px;
            padding: 1.5rem;
            color: var(--main-text);
            margin-bottom: 1.25rem;
            box-shadow: 0 4px 15px rgba(0,0,0,0.01);
            position: relative;
        }
        .status-badge-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.75rem;
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

        /* Route Timeline Vertical styles */
        .route-timeline-card {
            padding: 0.25rem 0;
        }
        .route-timeline {
            position: relative;
            padding-left: 2.5rem;
            margin: 0.5rem 0;
        }
        .route-timeline::before {
            content: '';
            position: absolute;
            left: 11px;
            top: 10px;
            bottom: 10px;
            width: 2px;
            background: linear-gradient(180deg, var(--brand-blue) 0%, var(--success) 100%);
        }
        .timeline-point {
            position: relative;
            margin-bottom: 1.5rem;
        }
        .timeline-point:last-child {
            margin-bottom: 0;
        }
        .timeline-point .point-icon {
            position: absolute;
            left: -2.5rem;
            width: 24px;
            height: 24px;
            background: var(--card-bg);
            border: 2px solid var(--brand-blue);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.9rem;
            z-index: 2;
        }
        .timeline-point.drop .point-icon {
            border-color: var(--success);
        }
        .timeline-point .point-icon-dot {
            position: absolute;
            left: -2.15rem;
            top: 6px;
            width: 12px;
            height: 12px;
            background: var(--gold);
            border: 2px solid var(--card-bg);
            border-radius: 50%;
            z-index: 2;
        }
        .point-details {
            display: flex;
            flex-direction: column;
        }
        .point-label {
            font-size: 0.65rem;
            font-weight: 800;
            color: var(--muted-text);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 0.15rem;
        }
        .point-value {
            font-size: 1.05rem;
            font-weight: 700;
            color: var(--main-text);
            font-family: 'Outfit', sans-serif;
            line-height: 1.3;
        }

        /* Stats Grid */
        .stats-grid { 
            display: grid; 
            grid-template-columns: repeat(3, 1fr); 
            gap: 0.75rem; 
            margin-bottom: 1.25rem; 
        }
        .stat-item { 
            background: var(--card-bg); 
            border: 1px solid var(--card-border); 
            border-radius: 14px; 
            padding: 0.75rem 0.5rem; 
            text-align: center;
            display: flex;
            flex-direction: column;
            justify-content: center;
            box-shadow: 0 4px 10px rgba(0,0,0,0.01);
            min-width: 0;
        }
        .stat-val { 
            font-size: 1.15rem; 
            font-weight: 800; 
            color: var(--main-text); 
            font-family: 'Outfit'; 
            margin-bottom: 0.1rem;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .stat-lbl { 
            font-size: 0.65rem; 
            color: var(--muted-text); 
            font-weight: 700; 
            text-transform: uppercase; 
            letter-spacing: 0.04em;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        @media (min-width: 480px) {
            .stats-grid { gap: 1rem; }
            .stat-item { padding: 1rem; }
            .stat-val { font-size: 1.35rem; }
            .stat-lbl { font-size: 0.75rem; }
        }

        /* Copy Tooltip */
        .copy-tooltip {
            position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%) translateY(-8px);
            background: #0f172a; color: #fff; font-size: 0.7rem; padding: 0.3rem 0.6rem;
            border-radius: 6px; pointer-events: none; opacity: 0; transition: all 0.2s;
            font-family: 'Inter', sans-serif; font-weight: 600; z-index: 100;
            white-space: nowrap; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .copy-tooltip.show { opacity: 1; transform: translateX(-50%) translateY(-12px); }

        /* Driver card styling */
        .driver-ticket {
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: 20px;
            overflow: hidden;
            margin-bottom: 1.25rem;
            box-shadow: 0 4px 15px rgba(0,0,0,0.01);
        }
        .ticket-header {
            background: var(--accent-glow);
            padding: 0.85rem 1.5rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--card-border);
        }

        .btn-grid-premium { display: grid; grid-template-columns: 1fr; gap: 0.75rem; margin-top: 1rem; }
        @media (min-width: 480px) { .btn-grid-premium { grid-template-columns: 1fr 1fr; } }
        
        .btn-action-deluxe { 
            padding: 0.9rem 1.2rem; border-radius: 16px; font-weight: 700; font-size: 0.85rem;
            text-decoration: none; text-align: center; display: inline-flex; align-items: center; justify-content: center; gap: 0.6rem; transition: all 0.25s;
            border: 1px solid transparent; cursor: pointer; font-family: 'Outfit', sans-serif;
        }
        .btn-gold-deluxe { background: var(--gold); color: #000; box-shadow: 0 4px 15px rgba(245, 158, 11, 0.2); }
        .btn-green-deluxe { background: var(--wa-green); color: #fff; box-shadow: 0 4px 15px rgba(18, 140, 126, 0.2); }
        .btn-blue-outline { background: transparent; border-color: var(--brand-blue); color: var(--brand-blue); }
        .btn-blue-outline:hover { background: rgba(37, 99, 235, 0.05); }
        .btn-green-outline { background: transparent; border-color: var(--wa-green); color: var(--wa-green); }
        .btn-green-outline:hover { background: rgba(18, 140, 126, 0.05); }
        .btn-red-outline { background: transparent; border-color: #ef4444; color: #ef4444; }
        .btn-red-outline:hover { background: rgba(239, 68, 68, 0.06); }
        .btn-gold-deluxe:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(245, 158, 11, 0.35); }
        .btn-green-deluxe:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(18, 140, 126, 0.35); }

        .btn-full-blue { background: var(--brand-blue); color: #fff; width: 100%; margin-top: 0.75rem; padding: 1.15rem; font-size: 1.05rem; border-radius: 16px; box-shadow: 0 6px 20px rgba(37, 99, 235, 0.2); border: none; cursor: pointer; font-weight: 800; }
        .btn-full-blue:hover { transform: translateY(-2px); box-shadow: 0 10px 25px rgba(37, 99, 235, 0.35); }

        /* Policies list styles */
        .policy-wrap-premium { display: grid; grid-template-columns: 1fr; gap: 1.25rem; border-top: 1px solid var(--card-border); margin-top: 1.25rem; padding-top: 1.25rem; }
        @media (min-width: 550px) { .policy-wrap-premium { grid-template-columns: 1fr 1fr; } }
        .policy-list h5 { font-size: 0.75rem; color: var(--brand-blue); text-transform: uppercase; margin: 0 0 0.75rem; letter-spacing: 0.08em; font-family: 'Outfit'; }
        .policy-list ul { list-style: none; padding: 0; margin: 0; }
        .policy-list li { font-size: 0.8rem; margin-bottom: 0.5rem; display: flex; align-items: flex-start; gap: 0.5rem; color: var(--muted-text); font-weight: 500; line-height: 1.4; }
        .policy-list li svg { flex-shrink: 0; margin-top: 0.15rem; }

        /* Timeline/Stepper */
        .stepper-block { margin-top: 1rem; }
        .stepper-header { font-size: 1rem; font-weight: 800; color: var(--main-text); margin-bottom: 1.25rem; font-family: 'Outfit'; }
        .stepper { display: flex; flex-direction: column; gap: 1.5rem; position: relative; }
        .stepper::before { content: ''; position: absolute; left: 11px; top: 12px; bottom: 12px; width: 2px; background: var(--card-border); }
        .step { display: flex; gap: 1rem; position: relative; }
        .step-num { width: 24px; height: 24px; border-radius: 50%; background: var(--bg-page); border: 2px solid var(--card-border); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 800; font-family: 'Outfit'; z-index: 2; flex-shrink: 0; transition: all 0.3s; color: var(--muted-text); }
        .step.active .step-num { background: var(--brand-blue); border-color: var(--brand-blue); color: #fff; box-shadow: 0 4px 10px rgba(37, 99, 235, 0.3); }
        .step.completed .step-num { background: var(--success); border-color: var(--success); color: #fff; box-shadow: 0 4px 10px rgba(16, 185, 129, 0.3); }
        .step-content { flex: 1; min-width: 0; }
        .step-title { font-size: 0.9rem; font-weight: 700; color: var(--main-text); margin-bottom: 0.2rem; font-family: 'Outfit'; }
        .step-desc { font-size: 0.75rem; color: var(--muted-text); line-height: 1.4; margin: 0; font-weight: 500; }

        /* Form Track Inputs */
        .form-track { display: flex; flex-direction: column; gap: 1.25rem; }
        .track-input { 
            border: 1px solid var(--card-border); border-radius: 12px; padding: 0.8rem 1.1rem; 
            font-size: 0.95rem; width: 100%; outline: none; background: var(--bg-page); color: var(--main-text);
            font-family: 'Inter', sans-serif; transition: all 0.25s; box-shadow: inset 0 2px 4px rgba(0,0,0,0.01);
        }
        .track-input:focus { border-color: var(--brand-blue); background: var(--card-bg); box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.08); }
        
        .no-result { text-align: center; color: #ef4444; font-weight: 600; font-size: 0.9rem; margin-bottom: 1.25rem; line-height: 1.5; padding: 0.75rem; border-radius: 12px; background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.15); }

        .track-grid-split { display: grid; grid-template-columns: 1fr; gap: 2rem; }
        @media (min-width: 680px) {
            .track-grid-split { grid-template-columns: 1.1fr 0.9fr; }
        }

        .phone-input-wrapper { display: flex; border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; background: var(--bg-page); }
        .phone-input-wrapper:focus-within { border-color: var(--brand-blue); background: var(--card-bg); box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.08); }
        .phone-input-wrapper .phone-national-input { border: none !important; background: transparent !important; flex: 1; padding: 0.8rem 1.1rem; font-size: 0.95rem; outline: none; color: var(--main-text); }

        .booking-badge-radar {
            background: rgba(37, 99, 235, 0.05);
            border: 1px solid rgba(37, 99, 235, 0.15);
            padding: 0.5rem 0.85rem;
            border-radius: 12px;
            font-family: 'Outfit', monospace;
            font-size: 0.9rem;
            font-weight: 800;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            color: var(--brand-blue);
        }
        .copy-btn-radar {
            background: transparent; border: none; cursor: pointer; color: var(--muted-text);
            padding: 0.2rem; display: flex; align-items: center; justify-content: center;
            transition: all 0.2s;
        }
        .copy-btn-radar:hover { color: var(--main-text); }

        /* Dynamic Fare Breakdown Table Styles */
        .glass-block .block {
            margin: 0;
            padding: 0;
            border: none;
            background: transparent;
        }
        .glass-block .block-title {
            display: none;
        }
        .glass-block .block-body {
            padding: 0;
        }
        table.kv {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.85rem;
            margin-top: 0.5rem;
        }
        table.kv td {
            padding: 0.6rem 0;
            border-bottom: 1px solid var(--card-border);
            vertical-align: middle;
            color: var(--main-text);
        }
        table.kv tr:last-child td {
            border-bottom: none;
        }
        table.kv td.k {
            font-weight: 500;
            color: var(--muted-text);
            text-align: left;
        }
        table.kv td.v {
            font-weight: 600;
            text-align: right;
            padding-left: 0.5rem;
        }

        /* Payment Summary Styling */
        .payment-summary-box {
            background: var(--accent-glow);
            border: 1px solid var(--card-border);
            border-radius: 16px;
            padding: 1.25rem;
            margin-bottom: 1.25rem;
        }
        .payment-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.5rem 0;
            font-size: 0.9rem;
            border-bottom: 1px dashed var(--card-border);
        }
        .payment-row:last-child {
            border-bottom: none;
        }
        .payment-row.highlighted {
            background: var(--accent-glow-solid);
            margin: 0.5rem -1.25rem -1.25rem;
            padding: 1rem 1.25rem;
            border-radius: 0 0 16px 16px;
            border-top: 1px solid var(--card-border);
        }
        .payment-label {
            font-weight: 500;
            color: var(--muted-text);
        }
        .payment-value {
            font-weight: 700;
            color: var(--main-text);
        }
        
        .support-card {
            background: linear-gradient(135deg, rgba(37, 99, 235, 0.02), rgba(18, 140, 126, 0.02));
            border-color: rgba(37, 99, 235, 0.1);
        }
        .support-links {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            margin-top: 0.75rem;
        }
        .support-link-item {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            text-decoration: none;
            padding: 0.75rem 1rem;
            border-radius: 12px;
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            transition: all 0.2s;
            color: var(--main-text);
            font-weight: 600;
            font-size: 0.85rem;
        }
        .support-link-item:hover {
            border-color: var(--brand-blue);
            transform: translateX(4px);
        }

        @keyframes dotPulse { 
            0%, 100% { opacity: 0.35; transform: scale(0.85); } 
            50% { opacity: 1; transform: scale(1.15); } 
        }

        /* Simulated GPS Map Widget styling */
        .map-container {
            position: relative;
            height: 200px;
            background: #0f172a;
            border-radius: 14px;
            overflow: hidden;
            border: 1px solid rgba(255,255,255,0.06);
            margin-bottom: 1rem;
        }
        .map-grid {
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background-size: 20px 20px;
            background-image: 
                linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px);
            opacity: 0.8;
            pointer-events: none;
        }
        .map-svg {
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            z-index: 2;
        }
        .map-label {
            font-size: 0.55rem;
            font-weight: 850;
            fill: #94a3b8;
            letter-spacing: 0.08em;
        }
        .car-label {
            font-size: 0.55rem;
            font-weight: 900;
            fill: var(--gold);
            letter-spacing: 0.08em;
        }
        
        /* Map overlays */
        .map-overlay-banner {
            position: absolute;
            top: 10px; left: 10px;
            background: rgba(15, 23, 42, 0.85);
            backdrop-filter: blur(8px);
            padding: 0.4rem 0.75rem;
            border-radius: 8px;
            border: 1px solid rgba(255,255,255,0.1);
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            z-index: 5;
        }
        .radar-ping {
            width: 8px; height: 8px;
            background: var(--success);
            border-radius: 50%;
            position: relative;
        }
        .radar-ping::after {
            content: '';
            position: absolute;
            width: 100%; height: 100%;
            background: var(--success);
            border-radius: 50%;
            animation: ping 1.5s infinite ease-out;
        }
        @keyframes ping {
            0% { transform: scale(1); opacity: 1; }
            100% { transform: scale(3.5); opacity: 0; }
        }
        .pulse-text {
            font-size: 0.65rem;
            font-weight: 700;
            color: #f8fafc;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }
        
        .map-dashboard-info {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 0.5rem;
            background: var(--accent-glow);
            border: 1px solid var(--card-border);
            border-radius: 12px;
            padding: 0.65rem;
        }
        .map-dash-item {
            text-align: center;
            display: flex;
            flex-direction: column;
            justify-content: center;
        }
        .dash-lbl {
            font-size: 0.6rem;
            color: var(--muted-text);
            text-transform: uppercase;
            font-weight: 700;
            letter-spacing: 0.03em;
            margin-bottom: 0.15rem;
        }
        .dash-val {
            font-size: 0.85rem;
            font-weight: 800;
            color: var(--main-text);
            font-family: 'Outfit', sans-serif;
        }
        
        /* Pulse rings */
        .pulse-ring {
            animation: ring-pulse 2s infinite ease-out;
            transform-origin: center;
        }
        .pulse-ring-gold {
            animation: ring-pulse-gold 2s infinite ease-out;
            transform-origin: center;
        }
        @keyframes ring-pulse {
            0% { r: 6px; opacity: 0.8; }
            100% { r: 16px; opacity: 0; }
        }
        @keyframes ring-pulse-gold {
            0% { r: 6px; opacity: 0.8; }
            100% { r: 14px; opacity: 0; }
        }

        @keyframes travelAlongPath {
            0% { offset-distance: 0%; }
            100% { offset-distance: 100%; }
        }
        .animated-car {
            offset-path: path("M 40,140 Q 120,40 200,100 T 360,60");
            offset-rotate: auto;
            animation: travelAlongPath 25s infinite linear;
        }

        /* Allocation Countdown Styles */
        .countdown-wrapper {
            margin: 1.5rem auto 0;
            max-width: 320px;
            background: var(--accent-glow);
            border: 1px solid var(--card-border);
            border-radius: 14px;
            padding: 0.85rem 1rem;
            text-align: center;
        }
        .countdown-inner {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 0.75rem;
            margin-bottom: 0.25rem;
        }
        .countdown-section {
            display: flex;
            flex-direction: column;
            align-items: center;
            min-width: 50px;
        }
        .countdown-time {
            font-family: 'Share Tech Mono', monospace;
            font-size: 1.6rem;
            font-weight: 800;
            color: var(--brand-blue);
            line-height: 1;
            letter-spacing: 1px;
        }
        .countdown-divider {
            font-family: 'Share Tech Mono', monospace;
            font-size: 1.6rem;
            font-weight: 800;
            color: var(--muted-text);
            animation: blinker 1s linear infinite;
        }
        .countdown-label {
            font-size: 0.55rem;
            color: var(--muted-text);
            text-transform: uppercase;
            font-weight: 700;
            letter-spacing: 0.05em;
            margin-top: 0.25rem;
        }
        .countdown-footer-label {
            font-size: 0.65rem;
            color: var(--muted-text);
            font-weight: 600;
            display: block;
        }
        @keyframes blinker {
            50% { opacity: 0; }
        }

        /* Accordion Panel */
        .accordion-group {
            margin-top: 0.5rem;
        }
        .accordion-item {
            border-bottom: 1px solid var(--card-border);
            padding: 0.5rem 0;
        }
        .accordion-item:last-child {
            border-bottom: none;
        }
        .accordion-trigger {
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 100%;
            background: none;
            border: none;
            text-align: left;
            padding: 0.5rem 0;
            font-size: 0.85rem;
            font-weight: 700;
            color: var(--main-text);
            cursor: pointer;
            font-family: 'Outfit', sans-serif;
            transition: color 0.2s;
        }
        .accordion-trigger:hover {
            color: var(--brand-blue);
        }
        .accordion-content {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s cubic-bezier(0, 1, 0, 1);
            font-size: 0.8rem;
            color: var(--muted-text);
            line-height: 1.5;
            padding-right: 1.5rem;
        }
        .accordion-content p {
            margin: 0.5rem 0;
        }
        .accordion-item.active .accordion-content {
            max-height: 1000px;
            transition: max-height 0.3s cubic-bezier(1, 0, 1, 0);
        }
        .accordion-icon {
            font-size: 0.6rem;
            transition: transform 0.2s;
            color: var(--muted-text);
        }
        .accordion-item.active .accordion-icon {
            transform: rotate(90deg);
        }
    </style>
<script>window.DROP_CARS_THEME_SLUG = <?php echo json_encode($activeTheme['slug'] ?? 'drop-cars'); ?>;</script>
<?php include __DIR__ . '/../includes/google-tag.php'; ?>
</head>
<body data-active-theme-id="<?php echo htmlspecialchars($activeTheme['id'] ?? 'drop-taxi'); ?>" class="<?php echo ($activeTheme['slug'] ?? '') === 'airport-taxi' ? ('theme-airporttaxi ' . (function_exists('dropcars_is_native_airporttaxi_host') && dropcars_is_native_airporttaxi_host() ? 'ati-native' : 'ati-embedded')) : ''; ?>">
<?php echo $shell->renderHeader(); ?>

<main class="container-sm <?php echo $booking ? 'booking-details-mode' : ''; ?>">
    
    <?php if ($booking): ?>
        <!-- ==================== VIEWING A SPECIFIC BOOKING ==================== -->
        
        <?php
        $status = strtolower($booking['status'] ?? 'pending');
        $badgeColor = '#10b981'; // default green (confirmed)
        $badgeBg = '#ecfdf5';
        $statusText = 'Booking Confirmed';

        if ($status === 'pending') {
            $badgeColor = '#f59e0b'; // gold/yellow
            $badgeBg = '#fffbeb';
            $statusText = 'Awaiting Confirmation';
        } elseif ($status === 'accepted') {
            $badgeColor = '#10b981'; // green
            $badgeBg = '#ecfdf5';
            $statusText = 'Accepted - Assigning Driver';
        } elseif ($status === 'cancelled') {
            $badgeColor = '#ef4444'; // red
            $badgeBg = '#fef2f2';
            $statusText = 'Booking Cancelled';
        } elseif ($status === 'completed') {
            $badgeColor = '#2563eb'; // blue
            $badgeBg = '#eff6ff';
            $statusText = 'Trip Completed';
        }
        ?>
        <div class="status-badge-premium" style="border-color: rgba(<?php
            if ($status === 'pending') echo '245, 158, 11';
            elseif ($status === 'cancelled') echo '239, 68, 68';
            elseif ($status === 'completed') echo '37, 99, 235';
            else echo '16, 185, 129';
        ?>, 0.15);">
            <?php if ($status === 'accepted'): ?>
                <div style="font-size:0.75rem;color:var(--muted-text);padding:0.35rem 0 0;">A driver partner has accepted this booking and is assigning a driver now.</div>
            <?php endif; ?>
            <div class="status-badge-header">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span style="width: 8px; height: 8px; background: <?php echo $badgeColor; ?>; border-radius: 50%; display: inline-block; <?php if ($status === 'pending') echo 'animation: dotPulse 1.5s infinite ease-in-out;'; ?>"></span>
                    <span class="tech-mono" style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px; color: <?php echo $badgeColor; ?>; font-weight: 700;"><?php echo $statusText; ?></span>
                </div>
                
                <div class="booking-badge-radar" id="booking-badge-radar">
                    <span>#<?php echo htmlspecialchars($bookingIdDisplay); ?></span>
                    <button class="copy-btn-radar" id="copy-btn" title="Copy Reference ID">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                    <div class="copy-tooltip" id="copy-tooltip">Copied!</div>
                </div>
            </div>

            <div>
                <span style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted-text); display: block; margin-bottom: 0.25rem;">Travel Route</span>
                <h1 class="outfit" style="font-size: 1.8rem; font-weight: 900; margin: 0; line-height: 1.25; letter-spacing: -0.01em; color: var(--main-text);">
                    <?php echo htmlspecialchars($booking['pickup_location'] ?? 'Pickup'); ?>
                    <span style="color: var(--brand-blue); font-size: 1.25rem; margin: 0 0.35rem;">➔</span>
                    <?php echo htmlspecialchars($booking['drop_location'] ?? 'Drop'); ?>
                </h1>
                
                <div style="margin-top: 0.75rem; font-size: 0.85rem; color: var(--muted-text); font-weight: 500;">
                    <?php if ($status === 'cancelled'): ?>
                        Status: <strong style="color: #ef4444;">Booking Cancelled</strong>
                    <?php elseif ($status === 'completed'): ?>
                        Status: <strong style="color: #2563eb;">Trip Completed Successfully</strong>
                    <?php else: ?>
                        Status: <strong style="color: <?php echo !empty($booking['driver_name']) ? 'var(--success)' : 'var(--gold)'; ?>;"><?php echo !empty($booking['driver_name']) ? 'Driver Assigned' : 'Awaiting Assignment'; ?></strong>
                    <?php endif; ?>
                </div>

                <?php if ($status === 'completed'): ?>
                <div style="margin-top:14px; background:linear-gradient(135deg, rgba(37,99,235,0.08) 0%, rgba(16,185,129,0.08) 100%); border:1.5px solid rgba(37,99,235,0.25); border-radius:14px; padding:14px 18px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:1.6rem;">🧾</span>
                        <div>
                            <div style="font-weight:800; font-size:0.95rem; color:var(--main-text); font-family:'Outfit',sans-serif;">Trip Completed · Official Invoice &amp; Receipt</div>
                            <div style="font-size:0.8rem; color:var(--muted-text);">Download your official GST tax invoice (SAC 9964) or trip settlement receipt instantly.</div>
                        </div>
                    </div>
                    <div style="display:flex; gap:10px; flex-wrap:wrap;">
                        <a href="/pages/invoice-gst.php?booking_id=<?php echo urlencode($booking['booking_id']); ?>" target="_blank" class="btn-action-deluxe" style="background:#2563eb; color:#fff; text-decoration:none; padding:8px 16px; border-radius:10px; font-weight:700; font-size:0.85rem; display:inline-flex; align-items:center; gap:6px;">
                            🧾 View / Print GST Invoice
                        </a>
                        <a href="/pages/invoice-gst.php?booking_id=<?php echo urlencode($booking['booking_id']); ?>&type=receipt" target="_blank" class="btn-action-deluxe" style="background:rgba(15,23,42,0.08); color:var(--main-text); border:1px solid rgba(15,23,42,0.18); text-decoration:none; padding:8px 16px; border-radius:10px; font-weight:700; font-size:0.85rem; display:inline-flex; align-items:center; gap:6px;">
                            📄 Trip Receipt
                        </a>
                    </div>
                </div>
                <?php endif; ?>
            </div>
        </div>

        <div class="tracker-grid">
            <!-- Left Column: Primary Route, Driver & Passenger Info -->
            <div class="tracker-left-col">
                <!-- TRIP STATISTICS GRID -->
                <?php if(!empty($booking['distance_km'])): ?>
                <div class="stats-grid">
                    <div class="stat-item">
                        <div class="stat-val"><?php echo number_format($booking['distance_km']); ?> KM</div>
                        <div class="stat-lbl">Distance</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-val"><?php
                            $storedDur = trim((string)($booking['duration'] ?? ''));
                            $isOldDuration = (
                                $storedDur === '' ||
                                (stripos($storedDur, 'hour') !== false && stripos($storedDur, 'min') === false) ||
                                (stripos($storedDur, 'hours') !== false && stripos($storedDur, 'mins') === false) ||
                                (stripos($storedDur, 'hr') === false && stripos($storedDur, 'min') === false)
                            );
                            
                            if (!$isOldDuration) {
                                echo htmlspecialchars($storedDur);
                            } else {
                                $d = (float)($booking['distance_km'] ?? 0);
                                $isRoundTrip = (strpos(strtolower($booking['trip_type'] ?? ''), 'round') !== false);
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
                        <div class="stat-val">₹<?php echo number_format($booking['final_fare'] ?? 0); ?></div>
                        <div class="stat-lbl">Estimated Fare</div>
                    </div>
                </div>
                <?php endif; ?>

                <!-- ROUTE TIMELINE CARD -->
                <div class="glass-block">
                    <span class="block-label">Route Timeline</span>
                    <?php
                    $stops = [];
                    if (!empty($booking['via_locations'])) {
                        $stops = array_filter(array_map('trim', explode('|', $booking['via_locations'])));
                    }
                    ?>
                    <div class="route-timeline-card">
                        <div class="route-timeline">
                            <div class="timeline-point pickup">
                                <div class="point-icon">📍</div>
                                <div class="point-details">
                                    <span class="point-label">Pickup Location</span>
                                    <span class="point-value"><?php echo htmlspecialchars($booking['pickup_location'] ?? 'Pickup'); ?></span>
                                </div>
                            </div>
                            
                            <?php foreach ($stops as $idx => $stop): ?>
                                <div class="timeline-point stop">
                                    <div class="point-icon-dot"></div>
                                    <div class="point-details">
                                        <span class="point-label">Via Stop <?php echo $idx + 1; ?></span>
                                        <span class="point-value"><?php echo htmlspecialchars($stop); ?></span>
                                    </div>
                                </div>
                            <?php endforeach; ?>

                            <div class="timeline-point drop">
                                <div class="point-icon">🏁</div>
                                <div class="point-details">
                                    <span class="point-label">Drop Location</span>
                                    <span class="point-value"><?php echo htmlspecialchars($booking['drop_location'] ?? 'Drop'); ?></span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- CHAUFFEUR BOARDING PASS STYLE CARD -->
                <div class="driver-ticket">
                    <div class="ticket-header">
                        <div>
                            <span class="block-label" style="margin: 0; font-size: 0.65rem; color: var(--brand-blue);">Driver & Cab Details</span>
                        </div>
                        <span style="font-size: 0.75rem; font-weight: 800; color: var(--muted-text); text-transform: uppercase; letter-spacing: 0.05em; font-family: 'Outfit';">Trip Details</span>
                    </div>
                    
                    <div style="padding: 1.25rem;">
                        <?php if (!empty($booking['driver_name']) || !empty($booking['car_number'])): ?>
                            <div style="display: flex; flex-direction: column; gap: 1rem;">
                                <div style="display: flex; gap: 1rem; align-items: center; border-bottom: 1px solid var(--card-border); padding-bottom: 1rem; flex-wrap: wrap;">
                                    <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--accent-glow); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; border: 1px solid rgba(37, 99, 235, 0.15);">👨‍✈️</div>
                                    <div>
                                        <span class="block-label" style="margin-bottom: 0.15rem; font-size: 0.65rem; color: var(--muted-text);">Assigned Driver</span>
                                        <strong style="font-size: 1.25rem; font-family: 'Outfit'; color: var(--main-text); display: block;"><?php echo htmlspecialchars($booking['driver_name']); ?></strong>
                                    </div>
                                </div>
                                
                                <div class="driver-details-grid">
                                    <div style="flex: 1; min-width: 0;">
                                        <span class="block-label" style="margin-bottom: 0.35rem; font-size: 0.65rem; color: var(--muted-text);">Cab Class</span>
                                        <span style="font-size: 1rem; font-weight: 800; color: var(--main-text); display: block; font-family: 'Outfit'; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><?php 
                                            $carModelName = htmlspecialchars($booking['car_name'] ?: 'Reserved Cab');
                                            if (strpos(strtoupper($carModelName), 'CRYSTA') !== false) {
                                                echo 'Crysta';
                                            } else {
                                                echo $carModelName;
                                            }
                                        ?></span>
                                    </div>
                                    <div style="text-align: right;">
                                        <span class="block-label" style="margin-bottom: 0.35rem; font-size: 0.65rem; color: var(--muted-text);">Vehicle Number</span>
                                        <div class="ind-plate">
                                            <div class="ind-side"><span>I</span><span>N</span><span>D</span></div>
                                            <div class="ind-seal">IND</div>
                                            <span><?php echo htmlspecialchars(strtoupper($booking['car_number'])); ?></span>
                                        </div>
                                    </div>
                                </div>

                                <div class="btn-grid-premium" style="margin-top: 0.75rem; border-top: 1px solid var(--card-border); padding-top: 1rem;">
                                    <a href="tel:<?php echo preg_replace('/[^0-9]/', '', $booking['driver_phone']); ?>" class="btn-action-deluxe btn-gold-deluxe">
                                        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
                                        Call Driver
                                    </a>
                                    <a href="https://wa.me/<?php echo preg_replace('/[^0-9]/', '', $booking['driver_phone']); ?>" target="_blank" class="btn-action-deluxe btn-green-deluxe">
                                        <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.005 5.277 5.282 0 11.768 0c3.141.001 6.094 1.224 8.312 3.444C22.298 5.664 23.516 8.619 23.513 11.76c-.004 6.485-5.281 11.762-11.766 11.762-2.01-.001-3.987-.515-5.742-1.494L0 24zm6.59-4.846c1.6.95 3.19 1.449 4.825 1.451 5.378 0 9.754-4.373 9.757-9.75.001-2.605-1.01-5.053-2.85-6.895C16.48 2.118 14.032 1.05 11.43 1.05c-5.38 0-9.757 4.373-9.76 9.75-.001 1.832.49 3.616 1.42 5.186l-1.016 3.71 3.8-.997zM17.75 14.67c-.33-.165-1.954-.964-2.253-1.073-.3-.11-.518-.165-.736.165-.218.33-.842 1.073-1.03 1.293-.19.22-.377.247-.707.082-.33-.165-1.393-.513-2.653-1.638-.98-.874-1.641-1.953-1.834-2.282-.19-.33-.02-.508.145-.672.15-.147.33-.385.495-.578.165-.192.22-.33.33-.55.11-.22.055-.412-.028-.578-.083-.165-.736-1.775-1.01-2.434-.266-.64-.537-.553-.736-.563l-.627-.01c-.218 0-.573.082-.873.412-.3.33-1.145 1.117-1.145 2.723 0 1.605 1.17 3.155 1.332 3.376.164.22 2.302 3.515 5.578 4.92.778.334 1.385.534 1.857.684.78.248 1.492.213 2.054.129.627-.094 1.954-.8 2.227-1.57.273-.77.273-1.43.19-1.57-.083-.14-.3-.22-.63-.385z"/></svg>
                                        WhatsApp Driver
                                    </a>
                                </div>

                                <?php
                                    // Live location card - only when the driver-trip link has actually
                                    // sent a fix recently (within the last 10 min). Stale/never-shared
                                    // silently shows nothing rather than an empty/broken map.
                                    $hasLiveLoc = !empty($booking['last_lat']) && !empty($booking['last_lng']) && !empty($booking['last_location_at']);
                                    $locIsFresh = $hasLiveLoc && (time() - strtotime($booking['last_location_at'])) < 600;
                                    $trackingPaused = $locIsFresh && !empty($booking['tracking_left_at'])
                                        && strtotime($booking['tracking_left_at']) >= strtotime($booking['last_location_at']);
                                ?>
                                <?php if ($locIsFresh): ?>
                                <div id="live-map-card" style="margin-top: 1rem; border-top: 1px solid var(--card-border); padding-top: 1rem;">
                                    <div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.6rem;">
                                        <span id="live-dot" style="width: 8px; height: 8px; border-radius: 50%; background: <?php echo $trackingPaused ? 'var(--gold)' : 'var(--success)'; ?>; display: inline-block; animation: livePulse 1.4s infinite;"></span>
                                        <span id="live-label-text" style="font-size: 0.75rem; font-weight: 800; color: <?php echo $trackingPaused ? 'var(--gold)' : 'var(--success)'; ?>; text-transform: uppercase; letter-spacing: 0.05em; font-family: 'Outfit';"><?php echo $trackingPaused ? 'Sharing Paused' : 'Live Location'; ?></span>
                                        <span id="live-updated-text" style="font-size: 0.72rem; color: var(--muted-text); margin-left: auto;"></span>
                                    </div>
                                    <iframe id="live-map-frame" width="100%" height="220" style="border: 0; border-radius: 12px;" loading="lazy"
                                        src="https://maps.google.com/maps?q=<?php echo urlencode($booking['last_lat'] . ',' . $booking['last_lng']); ?>&z=15&output=embed"></iframe>
                                    <a id="live-map-link" href="https://www.google.com/maps?q=<?php echo urlencode($booking['last_lat'] . ',' . $booking['last_lng']); ?>" target="_blank" style="display: block; text-align: center; margin-top: 0.6rem; font-size: 0.82rem; color: var(--brand-blue); font-weight: 700; text-decoration: none;">Open in Google Maps →</a>
                                </div>
                                <style>@keyframes livePulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }</style>
                                <script>
                                (function () {
                                    var bookingId = <?php echo json_encode($booking['booking_id'] ?? (string) $booking['id']); ?>;
                                    var phone = <?php echo json_encode($mobileInput); ?>;
                                    function fmtAgo(iso) {
                                        var secs = Math.max(0, Math.floor((Date.now() - new Date(iso.replace(' ', 'T'))) / 1000));
                                        if (secs < 60) return 'Updated ' + secs + 's ago';
                                        return 'Updated ' + Math.floor(secs / 60) + 'm ago';
                                    }
                                    function poll() {
                                        fetch('/api/booking-location.php?booking_id=' + encodeURIComponent(bookingId) + '&phone=' + encodeURIComponent(phone))
                                            .then(function (r) { return r.json(); })
                                            .then(function (d) {
                                                if (!d.success || !d.last_lat || !d.last_lng) return;
                                                document.getElementById('live-map-frame').src = 'https://maps.google.com/maps?q=' + d.last_lat + ',' + d.last_lng + '&z=15&output=embed';
                                                document.getElementById('live-map-link').href = 'https://www.google.com/maps?q=' + d.last_lat + ',' + d.last_lng;
                                                if (d.last_location_at) {
                                                    document.getElementById('live-updated-text').textContent = fmtAgo(d.last_location_at);
                                                }
                                                var dot = document.getElementById('live-dot');
                                                var label = document.getElementById('live-label-text');
                                                var color = d.tracking_paused ? 'var(--gold)' : 'var(--success)';
                                                dot.style.background = color;
                                                label.style.color = color;
                                                label.textContent = d.tracking_paused ? 'Sharing Paused' : 'Live Location';
                                            })
                                            .catch(function () {});
                                    }
                                    document.getElementById('live-updated-text').textContent = 'Updated just now';
                                    setInterval(poll, 20000);
                                })();
                                </script>
                                <?php endif; ?>
                            </div>
                        <?php else: ?>
                            <?php
                                // Calculate dynamic 2-hours assignment time
                                $assignmentTimeText = '2 hours before your pickup time';
                                if (!empty($booking['pickup_date']) && !empty($booking['pickup_time'])) {
                                    try {
                                        $dateTimeStr = $booking['pickup_date'] . ' ' . $booking['pickup_time'];
                                        $pickupDateTime = new DateTime($dateTimeStr);
                                        $pickupDateTime->modify('-2 hours');
                                        $assignmentTimeText = $pickupDateTime->format('d M Y \a\t h:i A');
                                    } catch (Exception $e) {}
                                }

                                // Generate custom request WhatsApp link
                                $bId = htmlspecialchars($booking['booking_id'] ?? $booking['id']);
                                $pickupLoc = htmlspecialchars($booking['pickup_location'] ?? '');
                                $dropLoc = htmlspecialchars($booking['drop_location'] ?? '');
                                $pDate = htmlspecialchars($formattedPickupDate);
                                $pTime = htmlspecialchars($booking['pickup_time'] ?? '');
                                $carType = htmlspecialchars($selectedVehicleType);

                                $waMsg = "🌟 *DROP CARS* 🌟\n"
                                       . "_Driver Details Request_\n\n"
                                       . "Hi Drop Cars Team,\n"
                                       . "I would like to request the driver and cab details for my upcoming trip:\n\n"
                                       . "━━━━━━━━━━━━━━━━━━━\n"
                                       . "🚖 *TRIP DETAILS*\n"
                                       . "━━━━━━━━━━━━━━━━━━━\n"
                                       . "📌 *Booking ID:* #$bId\n"
                                       . "📍 *Route:* $pickupLoc ➔ $dropLoc\n"
                                       . "📅 *Date & Time:* $pDate at $pTime\n"
                                       . "🚗 *Vehicle:* $carType\n\n"
                                       . "━━━━━━━━━━━━━━━━━━━\n"
                                       . "Please share the chauffeur's name, contact number, and plate number. Thank you!";
                                $waRequestUrl = $waHref . '?text=' . rawurlencode($waMsg);
                            ?>
                            <div style="text-align: center; padding: 1rem 0;">
                                <div style="width: 54px; height: 54px; border-radius: 50%; background: rgba(37, 99, 235, 0.08); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem; font-size: 1.5rem;">🕒</div>
                                <strong style="display: block; font-size: 1.1rem; font-family: 'Outfit'; color: var(--main-text); margin-bottom: 0.5rem;">Assigning Driver & Cab Details</strong>
                                <p style="margin: 0; font-size: 0.85rem; color: var(--muted-text); line-height: 1.6; max-width: 480px; margin-left: auto; margin-right: auto;">
                                    Your driver and cab details will be assigned and updated live on this tracking page by <strong style="color: var(--brand-blue);"><?php echo $assignmentTimeText; ?></strong> (2 hours before your scheduled pickup time).
                                </p>

                                <!-- Countdown Timer Widget -->
                                <div id="assignment-countdown" class="countdown-wrapper" data-pickup-datetime="<?php echo htmlspecialchars($booking['pickup_date'] . ' ' . $booking['pickup_time']); ?>">
                                    <div class="countdown-inner">
                                        <div class="countdown-section">
                                            <span class="countdown-time" id="cd-hours">00</span>
                                            <span class="countdown-label">Hours</span>
                                        </div>
                                        <div class="countdown-divider">:</div>
                                        <div class="countdown-section">
                                            <span class="countdown-time" id="cd-mins">00</span>
                                            <span class="countdown-label">Mins</span>
                                        </div>
                                        <div class="countdown-divider">:</div>
                                        <div class="countdown-section">
                                            <span class="countdown-time" id="cd-secs">00</span>
                                            <span class="countdown-label">Secs</span>
                                        </div>
                                    </div>
                                    <span class="countdown-footer-label">Until Driver Allocation Window</span>
                                </div>
                                
                                <div style="margin-top: 1.75rem; border-top: 1px solid var(--card-border); padding-top: 1.5rem;">
                                    <a href="<?php echo $waRequestUrl; ?>" target="_blank" class="btn-action-deluxe btn-green-deluxe" style="width: 100%; box-sizing: border-box; max-width: 320px; display: inline-flex;" onclick="triggerDriverRequestNotification(event, '<?php echo htmlspecialchars($booking['booking_id'] ?? '', ENT_QUOTES); ?>')">
                                        <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.005 5.277 5.282 0 11.768 0c3.141.001 6.094 1.224 8.312 3.444C22.298 5.664 23.516 8.619 23.513 11.76c-.004 6.485-5.281 11.762-11.766 11.762-2.01-.001-3.987-.515-5.742-1.494L0 24zm6.59-4.846c1.6.95 3.19 1.449 4.825 1.451 5.378 0 9.754-4.373 9.757-9.75.001-2.605-1.01-5.053-2.85-6.895C16.48 2.118 14.032 1.05 11.43 1.05c-5.38 0-9.757 4.373-9.76 9.75-.001 1.832.49 3.616 1.42 5.186l-1.016 3.71 3.8-.997zM17.75 14.67c-.33-.165-1.954-.964-2.253-1.073-.3-.11-.518-.165-.736.165-.218.33-.842 1.073-1.03 1.293-.19.22-.377.247-.707.082-.33-.165-1.393-.513-2.653-1.638-.98-.874-1.641-1.953-1.834-2.282-.19-.33-.02-.508.145-.672.15-.147.33-.385.495-.578.165-.192.22-.33.33-.55.11-.22.055-.412-.028-.578-.083-.165-.736-1.775-1.01-2.434-.266-.64-.537-.553-.736-.563l-.627-.01c-.218 0-.573.082-.873.412-.3.33-1.145 1.117-1.145 2.723 0 1.605 1.17 3.155 1.332 3.376.164.22 2.302 3.515 5.578 4.92.778.334 1.385.534 1.857.684.78.248 1.492.213 2.054.129.627-.094 1.954-.8 2.227-1.57.273-.77.273-1.43.19-1.57-.083-.14-.3-.22-.63-.385z"/></svg>
                                        Request Driver Details Now
                                    </a>
                                </div>
                            </div>
                        <?php endif; ?>
                    </div>
                </div>

                <!-- PASSENGER INFORMATION CARD -->
                <div class="glass-block">
                    <span class="block-label">Passenger Information</span>
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <div style="width: 44px; height: 44px; border-radius: 50%; background: var(--accent-glow); display: flex; align-items: center; justify-content: center; font-size: 1.35rem; border: 1px solid rgba(37, 99, 235, 0.15);">👤</div>
                            <div>
                                <span class="point-label">Primary Passenger</span>
                                <strong style="font-size: 1.1rem; font-family: 'Outfit'; color: var(--main-text); display: block;"><?php echo htmlspecialchars($booking['customer_name'] ?: 'Guest Passenger'); ?></strong>
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <span class="point-label">Contact Number</span>
                            <strong style="font-size: 0.95rem; font-family: 'Outfit'; color: var(--main-text); display: block;"><?php echo htmlspecialchars($booking['customer_phone'] ?? 'N/A'); ?></strong>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Right Column: Schedule, Fare Breakdown, Journey Stepper & Support -->
            <div class="tracker-right-col">
                <!-- TRIP SCHEDULE DETAILS CARD -->
                <div class="glass-block">
                    <span class="block-label" style="margin-bottom: 1rem;">Schedule &amp; Vehicle</span>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem 0.5rem;">
                        <div>
                            <span class="block-label" style="margin-bottom: 0.1rem; font-size: 0.6rem; color: var(--muted-text);">Pickup Date</span>
                            <strong style="font-size: 0.95rem; font-family: 'Outfit'; color: var(--main-text);"><?php echo htmlspecialchars($formattedPickupDate ?: 'Date Pending'); ?></strong>
                        </div>
                        <div>
                            <span class="block-label" style="margin-bottom: 0.1rem; font-size: 0.6rem; color: var(--muted-text);">Pickup Time</span>
                            <strong style="font-size: 0.95rem; font-family: 'Outfit'; color: var(--main-text);"><?php echo htmlspecialchars($booking['pickup_time'] ?? 'Time Pending'); ?></strong>
                        </div>
                        
                        <?php
                        $formattedReturnDate = '';
                        $returnDateRaw = $booking['return_date'] ?? '';
                        if (!empty($returnDateRaw) && $returnDateRaw !== '0000-00-00') {
                            $dateObj = DateTime::createFromFormat('Y-m-d', $returnDateRaw);
                            if ($dateObj) {
                                $formattedReturnDate = $dateObj->format('D, d M Y');
                            }
                        }
                        if (!empty($formattedReturnDate)):
                        ?>
                            <div>
                                <span class="block-label" style="margin-bottom: 0.1rem; font-size: 0.6rem; color: var(--muted-text);">Return Date</span>
                                <strong style="font-size: 0.95rem; font-family: 'Outfit'; color: var(--main-text);"><?php echo htmlspecialchars($formattedReturnDate); ?></strong>
                            </div>
                            <div>
                                <span class="block-label" style="margin-bottom: 0.1rem; font-size: 0.6rem; color: var(--muted-text);">Return Time</span>
                                <strong style="font-size: 0.95rem; font-family: 'Outfit'; color: var(--main-text);"><?php echo htmlspecialchars($booking['return_time'] ?? 'N/A'); ?></strong>
                            </div>
                        <?php endif; ?>

                        <div>
                            <span class="block-label" style="margin-bottom: 0.1rem; font-size: 0.6rem; color: var(--muted-text);">Trip Duration</span>
                            <strong style="font-size: 0.95rem; font-family: 'Outfit'; color: var(--main-text);"><?php 
                                $days = (int)($booking['trip_days'] ?? 1);
                                echo $days . ' ' . ($days === 1 ? 'Day' : 'Days');
                            ?></strong>
                        </div>
                        <div>
                            <span class="block-label" style="margin-bottom: 0.1rem; font-size: 0.6rem; color: var(--muted-text);">Trip Type</span>
                            <strong style="font-size: 0.95rem; font-family: 'Outfit'; color: var(--main-text);"><?php echo htmlspecialchars(ucfirst(str_replace('_', ' ', $booking['trip_type'] ?? 'one_way'))); ?></strong>
                        </div>
                        <div style="grid-column: span 2;">
                            <span class="block-label" style="margin-bottom: 0.1rem; font-size: 0.6rem; color: var(--muted-text);">Vehicle Type</span>
                            <strong style="font-size: 0.95rem; font-family: 'Outfit'; color: var(--main-text);"><?php 
                                if (strpos(strtoupper($selectedVehicleType), 'CRYSTA') !== false) {
                                    echo 'Crysta';
                                } else {
                                    echo htmlspecialchars($selectedVehicleType);
                                }
                            ?> (<?php echo htmlspecialchars($vehicleInfo['model'] ?? 'Reserved Class'); ?>)</strong>
                        </div>
                    </div>
                </div>

                <!-- FARES & PAYMENTS SUMMARY CARD -->
                <div class="glass-block">
                    <span class="block-label">Fares &amp; Payment Summary</span>
                    
                    <?php
                    $estTotal = (float)($booking['final_fare'] ?? 0);
                    
                    $advancePaidDisplay = '₹0.00 (No advance paid)';
                    $advancePaidStyle = '';
                    $effectiveAdvancePaid = 0.0;

                    if (isset($advanceClaim) && $advanceClaim) {
                        $claimAmount = (float)$advanceClaim['amount'];
                        $claimStatus = strtolower($advanceClaim['status'] ?? 'pending');
                        
                        if ($claimStatus === 'verified') {
                            $effectiveAdvancePaid = (float)($booking['advance_paid'] ?? 0);
                            if ($effectiveAdvancePaid <= 0 && $claimAmount > 0) {
                                $effectiveAdvancePaid = $claimAmount;
                            }
                            $advancePaidDisplay = '✓ ₹' . number_format($effectiveAdvancePaid) . ' (UPI Verified)';
                            $advancePaidStyle = 'color: var(--success); font-weight: bold;';
                        } elseif ($claimStatus === 'pending') {
                            $effectiveAdvancePaid = 0.0;
                            $advancePaidDisplay = '⏳ ₹' . number_format($claimAmount) . ' (Waiting for Verification)';
                            $advancePaidStyle = 'color: var(--gold); font-weight: bold;';
                        } elseif ($claimStatus === 'rejected') {
                            $effectiveAdvancePaid = 0.0;
                            $advancePaidDisplay = '❌ ₹' . number_format($claimAmount) . ' (Payment Rejected)';
                            $advancePaidStyle = 'color: #ef4444; font-weight: bold;';
                        } else {
                            $effectiveAdvancePaid = (float)($booking['advance_paid'] ?? 0);
                            if ($effectiveAdvancePaid > 0) {
                                $advancePaidDisplay = '✓ ₹' . number_format($effectiveAdvancePaid) . ' (UPI Verified)';
                                $advancePaidStyle = 'color: var(--success); font-weight: bold;';
                            }
                        }
                    } else {
                        $effectiveAdvancePaid = (float)($booking['advance_paid'] ?? 0);
                        if ($effectiveAdvancePaid > 0) {
                            $advancePaidDisplay = '✓ ₹' . number_format($effectiveAdvancePaid) . ' (UPI Verified)';
                            $advancePaidStyle = 'color: var(--success); font-weight: bold;';
                        }
                    }

                    $balancePayable = max(0, $estTotal - $effectiveAdvancePaid);
                    ?>

                    <div class="payment-summary-box">
                        <div class="payment-row">
                            <span class="payment-label">Estimated Total Fare</span>
                            <span class="payment-value">₹<?php echo number_format($estTotal); ?></span>
                        </div>
                        <div class="payment-row">
                            <span class="payment-label">Advance Paid</span>
                            <span class="payment-value" style="<?php echo $advancePaidStyle; ?>">
                                <?php echo $advancePaidDisplay; ?>
                            </span>
                        </div>
                        <div class="payment-row highlighted">
                            <span class="payment-label" style="color: var(--brand-blue); font-weight: 700;">Remaining Balance (Payable to Driver)</span>
                            <span class="payment-value" style="font-size: 1.25rem; color: var(--main-text);;">₹<?php echo number_format($balancePayable); ?></span>
                        </div>
                    </div>

                    <?php 
                    $fb = [];
                    if (!empty($booking['fare_breakdown'])) {
                        $fb = json_decode($booking['fare_breakdown'], true) ?: [];
                        if ($fb && !empty($booking['fare_type'])) {
                            $fb['fareType'] = $booking['fare_type'];
                        }
                    }
                    if (!empty($fb)):
                        echo dropcars_fare_breakdown_html($fb, $selectedVehicleType);
                    else:
                    ?>
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 1.25rem; border-bottom: 1px solid var(--card-border); padding-bottom: 1rem;">
                        <div>
                            <span class="block-label" style="margin-bottom: 0.15rem; font-size: 0.6rem; color: var(--muted-text);">Fare Plan</span>
                            <strong style="font-size: 1.05rem; font-family: 'Outfit'; color: var(--main-text);">
                                <?php
                                if ($includeTolls && $includeTaxes) {
                                    echo 'All-Inclusive';
                                } elseif ($includeTolls) {
                                    echo 'Inclusive (Tolls)';
                                } elseif ($includeTaxes) {
                                    echo 'Inclusive (Taxes)';
                                } else {
                                    echo 'Base Fare';
                                }
                                ?>
                            </strong>
                        </div>
                    </div>

                    <div class="policy-wrap-premium" style="margin-top: 0; border-top: none; padding-top: 0; gap: 1.25rem;">
                        <div class="policy-list">
                            <h5>Inclusions</h5>
                            <ul>
                                <?php foreach ($inclusions as $inc): ?>
                                <li style="font-size: 0.8rem; margin-bottom: 0.4rem;">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    <?php echo $inc; ?>
                                </li>
                                <?php endforeach; ?>
                            </ul>
                        </div>
                        <div class="policy-list">
                            <h5>Exclusions</h5>
                            <ul>
                                <?php foreach ($exclusions as $exc): ?>
                                <li style="font-size: 0.8rem; margin-bottom: 0.4rem;">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                    <?php echo $exc; ?>
                                </li>
                                <?php endforeach; ?>
                            </ul>
                        </div>
                    </div>
                    <?php endif; ?>
                </div>

                <!-- JOURNEY STEPPER -->
                <div class="glass-block">
                    <span class="block-label">Journey Status Protocol</span>
                    <div class="stepper">
                        <?php
                        $step1Active = true;
                        $step1Completed = !empty($booking['driver_name']) || $status === 'completed';
                        
                        $step2Active = !empty($booking['driver_name']);
                        $step2Completed = $status === 'completed';
                        
                        $step3Active = ($status === 'completed');
                        $step3Completed = ($status === 'completed');
                        ?>
                        
                        <?php if ($status === 'cancelled'): ?>
                            <div class="step">
                                <div class="step-num" style="background: #ef4444; border-color: #ef4444; color: #fff;">✕</div>
                                <div class="step-content">
                                    <div class="step-title" style="color: #ef4444;">Booking Cancelled</div>
                                    <p class="step-desc">This booking has been cancelled and is no longer active.</p>
                                </div>
                            </div>
                        <?php else: ?>
                            <div class="step <?php echo $step1Completed ? 'completed' : ($step1Active ? 'active' : ''); ?>">
                                <div class="step-num"><?php echo $step1Completed ? '✓' : '1'; ?></div>
                                <div class="step-content">
                                    <div class="step-title">Booking Confirmed</div>
                                    <p class="step-desc">Your travel request has been logged in our system.</p>
                                </div>
                            </div>
                            
                            <div class="step <?php echo $step2Completed ? 'completed' : ($step2Active ? 'active' : ''); ?>">
                                <div class="step-num"><?php echo $step2Completed ? '✓' : '2'; ?></div>
                                <div class="step-content">
                                    <div class="step-title">Cab &amp; Driver Assignment</div>
                                    <?php if (!empty($booking['driver_name'])): ?>
                                        <p class="step-desc" style="color: var(--success); font-weight: 600;">Driver and vehicle details have been assigned and updated live.</p>
                                    <?php else: ?>
                                        <p class="step-desc">Chauffeur details are allocated 2 hours prior to scheduled departure.</p>
                                    <?php endif; ?>
                                </div>
                            </div>
                            
                            <div class="step <?php echo $step3Completed ? 'completed' : ($step3Active ? 'active' : ''); ?>">
                                <div class="step-num"><?php echo $step3Completed ? '✓' : '3'; ?></div>
                                <div class="step-content">
                                    <div class="step-title">Trip Completed</div>
                                    <p class="step-desc">Chauffeur drops you off safely. Fare settlement is completed directly.</p>
                                    <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
                                        <a href="/pages/invoice-gst.php?booking_id=<?php echo urlencode($booking['booking_id']); ?>" target="_blank" style="display:inline-flex; align-items:center; gap:5px; background:rgba(37,99,235,0.1); color:#2563eb; border:1px solid rgba(37,99,235,0.25); border-radius:8px; padding:5px 12px; font-size:0.78rem; font-weight:700; text-decoration:none;">
                                            🧾 Download GST Invoice
                                        </a>
                                        <a href="/pages/invoice-gst.php?booking_id=<?php echo urlencode($booking['booking_id']); ?>&type=receipt" target="_blank" style="display:inline-flex; align-items:center; gap:5px; background:rgba(15,23,42,0.06); color:var(--main-text); border:1px solid rgba(15,23,42,0.15); border-radius:8px; padding:5px 12px; font-size:0.78rem; font-weight:700; text-decoration:none;">
                                            📄 Print Receipt
                                        </a>
                                    </div>
                                </div>
                            </div>
                        <?php endif; ?>
                    </div>
                </div>

                <!-- HELP FAQ & POLICIES ACCORDION -->
                <div class="glass-block">
                    <span class="block-label">Important Travel Information</span>
                    <div class="accordion-group">
                        <div class="accordion-item">
                            <button class="accordion-trigger">
                                <span>Toll Gate Charges & Rules</span>
                                <span class="accordion-icon">▶</span>
                            </button>
                            <div class="accordion-content">
                                <p><strong>Base Fare Plan:</strong> Toll gate charges are not included. The driver will pay at each toll, and the actual total amount must be paid directly to the driver at the end of the trip.</p>
                                <p><strong>All-Inclusive Plan:</strong> Toll gate charges are fully included in the total fare. You do not need to pay the driver extra for tolls.</p>
                            </div>
                        </div>
                        <div class="accordion-item">
                            <button class="accordion-trigger">
                                <span>State Border Permit Tax</span>
                                <span class="accordion-icon">▶</span>
                            </button>
                            <div class="accordion-content">
                                <p>If crossing state borders (e.g. Tamil Nadu to Karnataka or Pondicherry), state border permit tax is applicable.</p>
                                <p>For all-inclusive plans, this permit cost is covered. For base-fare plans, this must be paid by the customer directly to state border checkpoint authorities or via the driver.</p>
                            </div>
                        </div>
                        <div class="accordion-item">
                            <button class="accordion-trigger">
                                <span>Driver Allowance & Night Bata</span>
                                <span class="accordion-icon">▶</span>
                            </button>
                            <div class="accordion-content">
                                <p>A driver allowance (Driver Bata) is already included in your estimated total fare. However, for journeys extending past 10:00 PM, an additional night allowance of ₹150 is payable to the driver for overnight travel safety.</p>
                            </div>
                        </div>
                        <div class="accordion-item">
                            <button class="accordion-trigger">
                                <span>Waiting Charges & Additional Stops</span>
                                <span class="accordion-icon">▶</span>
                            </button>
                            <div class="accordion-content">
                                <p>A grace time of 45 minutes is complimentary for breaks/stops. Beyond 45 minutes, waiting charges apply at ₹150 per hour.</p>
                                <p>Any deviation from the booked route or adding unplanned via-stops may attract a stop charge of ₹150 per stop.</p>
                            </div>
                        </div>
                        <div class="accordion-item">
                            <button class="accordion-trigger">
                                <span>Luggage & Roof Carrier Policy</span>
                                <span class="accordion-icon">▶</span>
                            </button>
                            <div class="accordion-content">
                                <p>Sedans typically accommodate 2 large bags or 3 medium bags. SUVs accommodate up to 4 large bags.</p>
                                <p>If you have extra or heavy luggage requiring a roof carrier, please let support know in advance to assign a vehicle equipped with a carrier.</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- SUPPORT & QUICK ACTIONS -->
                <div class="glass-block support-card">
                    <span class="block-label">Need Help?</span>
                    <p style="margin: 0 0 0.75rem; font-size: 0.8rem; color: var(--muted-text); line-height: 1.5;">
                        For any immediate schedule changes, questions about details, or driver changes, connect directly with our support team.
                    </p>
                    <div class="support-links">
                        <a href="<?php echo $phoneHref; ?>" class="support-link-item">
                            <span>📞</span> Call Support: <?php echo htmlspecialchars($sitePhone); ?>
                        </a>
                        <a href="<?php echo $waHref; ?>" target="_blank" class="support-link-item" style="border-color: rgba(18, 140, 126, 0.15);">
                            <span style="color: var(--wa-green);">💬</span> WhatsApp Chat Support
                        </a>
                    </div>
                    
                    <button id="share-btn" onclick="shareTrackingLink()" class="btn-action-deluxe btn-blue-outline" style="width: 100%; margin-top: 1.25rem; border-radius: 14px; padding: 0.85rem; font-size: 0.8rem;">
                        📤 Share Live Tracking with Family
                    </button>

                    <?php if (in_array($status, ['pending', 'accepted', 'confirmed'], true)): ?>
                    <!-- Cancel + OTP confirmation itself lives on thank-you.php (which already
                         has the full OTP modal built) - this just deep-links there and asks it
                         to auto-open the cancel flow via ?action=cancel. -->
                    <a href="/pages/thank-you.php?booking_id=<?php echo urlencode($bookingIdDisplay); ?>&action=cancel" class="btn-action-deluxe btn-red-outline" style="width: 100%; margin-top: 0.75rem; border-radius: 14px; padding: 0.85rem; font-size: 0.8rem; box-sizing: border-box;">
                        ✕ Cancel This Booking
                    </a>
                    <?php endif; ?>
                </div>
            </div>
        </div>

        <div style="text-align: center; margin-top: 2.5rem;">
            <a href="/pages/track-booking.php" style="color: var(--brand-blue); font-weight: 700; text-decoration: none; font-size: 0.95rem; font-family: 'Outfit';">Track Another Booking ID →</a>
        </div>

    <?php elseif (!empty($historyBookings)): ?>
        <!-- ==================== VIEWING CUSTOMER TRIP HISTORY ==================== -->
        <div class="status-header" style="margin-bottom: 2rem;">
            <h1 class="outfit" style="font-size: 2rem; font-weight: 850; margin: 0; color: var(--main-text);">My Trip History</h1>
            <p style="color: var(--muted-text); font-size: 1rem; font-weight: 500; margin: 0.25rem 0 0;">Easily track your current and past travel requests</p>
        </div>

        <div class="glass-block" style="background: linear-gradient(135deg, var(--brand-blue), var(--dark-blue)); border: none; color: white;">
            <span class="block-label" style="color: rgba(255,255,255,0.7);">Loyalty Discount</span>
            <h2 class="outfit" style="color: white; margin: 0 0 0.5rem; font-size: 1.4rem; font-weight: 800;">Your Shareable Discount Code</h2>
            <p style="color: rgba(255,255,255,0.8); font-size: 0.85rem; line-height: 1.5; margin-bottom: 1.25rem;">Share this code with your friends! They save ₹100 on their first trip, and you earn booking rewards.</p>
            
            <?php 
            $trackRefCode = htmlspecialchars($sessionCustomer['referral_code'] ?? 'DCFT100'); 
            ?>
            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.08); padding: 0.75rem 1rem; border-radius: 14px; border: 1px dashed rgba(255,255,255,0.25);">
                <span id="referral-code-display" style="font-size: 1.4rem; font-weight: 900; letter-spacing: 2px; color: var(--gold); font-family: 'Outfit';"><?php echo $trackRefCode; ?></span>
                <button onclick="copyReferralCode('<?php echo $trackRefCode; ?>')" style="background: var(--gold); color: #000; border: none; padding: 0.5rem 1rem; border-radius: 10px; font-weight: 800; cursor: pointer; font-size: 0.8rem; font-family: 'Outfit'; transition: transform 0.1s;">COPY</button>
            </div>
            <p id="copy-msg" style="font-size: 0.8rem; margin: 0.5rem 0 0; color: #34d399; font-weight: 600; display: none;">Copied to clipboard!</p>

            <script>
                function copyReferralCode(text) {
                    navigator.clipboard.writeText(text).then(() => {
                        const msg = document.getElementById('copy-msg');
                        msg.style.display = 'block';
                        setTimeout(() => { msg.style.display = 'none'; }, 2000);
                    });
                }
            </script>
        </div>

        <div style="display: flex; flex-direction: column; gap: 1rem; margin-top: 1.5rem;">
            <?php foreach ($historyBookings as $h): ?>
                <?php 
                    $hStatus = $h['status'] ?? 'pending';
                    $hDateRaw = $h['pickup_date'] ?? '';
                    $hFormattedDate = $hDateRaw;
                    if (!empty($hDateRaw)) {
                        $dObj = DateTime::createFromFormat('Y-m-d', $hDateRaw);
                        if ($dObj) $hFormattedDate = $dObj->format('d M Y');
                    }
                ?>
                <div class="glass-block" style="margin-bottom: 0; padding: 1.5rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                        <div>
                            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                                <strong style="font-size: 1.05rem; font-family: 'Outfit'; color: var(--main-text);">ID: <?php echo htmlspecialchars($h['booking_id'] ?: $h['id']); ?></strong>
                                <span class="status-badge" style="padding: 2px 8px; font-size: 0.65rem; background: <?php echo $hStatus === 'confirmed' ? 'var(--success-bg)' : 'rgba(100,116,139,0.08)'; ?>; color: <?php echo $hStatus === 'confirmed' ? 'var(--success)' : 'var(--muted-text)'; ?>;">
                                    <?php echo strtoupper($hStatus); ?>
                                </span>
                            </div>
                            <p style="margin: 0; font-size: 0.9rem; color: var(--main-text); font-weight: 500;"><?php echo htmlspecialchars($h['pickup_location']); ?> → <?php echo htmlspecialchars($h['drop_location']); ?></p>
                            <p style="margin: 0.25rem 0 0; font-size: 0.75rem; color: var(--muted-text);"><?php echo $hFormattedDate; ?> at <?php echo htmlspecialchars($h['pickup_time']); ?></p>
                        </div>
                        <a href="?booking_id=<?php echo urlencode($h['booking_id'] ?: $h['id']); ?>&phone=<?php echo urlencode($_SESSION['customer_phone']); ?>" class="btn-action-deluxe btn-blue-outline" style="padding: 0.6rem 1.25rem; font-size: 0.8rem; border-radius: 12px; font-family: 'Outfit'; font-weight: 800;">
                            Track Details
                        </a>
                    </div>
                </div>
            <?php endforeach; ?>
        </div>

        <div style="text-align: center; margin-top: 2.5rem;">
            <a href="/pages/track-booking.php" style="color: var(--muted-text); font-size: 0.9rem; text-decoration: none;">Track another Booking ID →</a>
        </div>

    <?php else: ?>
        <!-- ==================== TRACKING SEARCH FORM (AESTHETIC ENTRY) ==================== -->
        <div class="status-header" style="margin-bottom: 2rem; text-align: center;">
            <h1 class="outfit" style="font-size: 2rem; font-weight: 850; margin: 0; color: var(--main-text); letter-spacing: -0.02em;">Track Your Booking</h1>
            <p style="color: var(--muted-text); font-size: 0.95rem; font-weight: 500; margin: 0.25rem 0 0;">Enter your details to view driver and cab information</p>
        </div>

        <div class="track-grid-split">
            <!-- Left Side: Interactive Search Box -->
            <div class="glass-block" style="margin-bottom: 0;">
                <span class="block-label">Booking Lookup</span>
                
                <?php if ($error): ?>
                    <p class="no-result"><?php echo htmlspecialchars($error); ?></p>
                <?php endif; ?>

                <?php if ($dbUnavailable): ?>
                    <p style="text-align:center; color:#856404; background:#fff8e6; padding:12px 14px; border-radius:12px; border:1px solid #f0d78c; font-size:0.9rem; margin-bottom:1.25rem;">
                        Driver lookup is temporarily busy. Please call <a href="<?php echo htmlspecialchars($phoneHref); ?>" style="color:var(--brand-blue); font-weight:800;"><?php echo htmlspecialchars($sitePhone); ?></a> directly with your Booking ID.
                    </p>
                <?php endif; ?>

                <form method="POST" action="/pages/track-booking.php" class="form-track">
                    <div style="display: flex; flex-direction: column; gap: 0.35rem;">
                        <label class="block-label" style="margin-bottom: 0; font-size: 0.65rem; color: var(--muted-text);">Booking ID / Reference ID</label>
                        <input type="text" name="booking_id" class="track-input" placeholder="e.g. C26050901" value="<?php echo htmlspecialchars($bookingIdInput); ?>" required>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 0.35rem;">
                        <label class="block-label" style="margin-bottom: 0; font-size: 0.65rem; color: var(--muted-text);">Registered Mobile Number</label>
                        <div class="phone-input-wrapper">
                            <div class="country-code-field">
                                <input type="hidden" name="countryCode" id="country-code-hidden" value="+91" />
                                <button type="button" class="country-code-trigger" id="country-code-trigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="country-code-popover" title="Country code">+91</button>
                                <div id="country-code-popover" class="country-code-popover is-hidden" role="dialog" aria-label="Choose country code">
                                    <button type="button" class="country-code-option" data-code="+91">+91</button>
                                    <input type="text" class="country-code-manual-inline" id="country-code-manual-input" inputmode="tel" autocomplete="off" maxlength="12" placeholder="" aria-label="Type country code" />
                                </div>
                            </div>
                            <input type="tel" name="phone_national" id="customer-phone" data-raw-phone="<?php echo htmlspecialchars($mobileInput); ?>" class="phone-national-input" placeholder="98765 43210" value="<?php echo htmlspecialchars($trackFormPhonePrefill); ?>" required>
                            <input type="hidden" name="phone" id="final-phone-hidden" />
                        </div>
                    </div>

                    <button type="submit" class="btn-full-blue outfit" style="border: none; cursor: pointer; font-weight: 800; margin-top: 0.5rem; padding: 1rem;">
                        Track Your Booking
                    </button>
                </form>

                <div style="text-align: center; margin-top: 1.5rem; border-top: 1px solid var(--card-border); padding-top: 1rem;">
                    <a href="/pages/customer-login.php" style="color: var(--brand-blue); font-size: 0.85rem; font-weight: 700; text-decoration: none;">Login to access Coupon Codes & Offers →</a>
                </div>
            </div>

            <!-- Right Side: Clean Professional Benefits Board to attract enter lead -->
            <div class="glass-block" style="background: var(--accent-glow); border-color: rgba(37, 99, 235, 0.15); margin-bottom: 0;">
                <span class="block-label" style="color: var(--brand-blue);">Trip Features</span>
                <div style="font-size: 1.2rem; font-weight: 800; color: var(--main-text); margin-bottom: 1.25rem; font-family: 'Outfit';">Our Service Details</div>
                
                <div style="display: flex; flex-direction: column; gap: 1.25rem;">
                    <div style="display: flex; gap: 0.75rem; align-items: flex-start;">
                        <span style="font-size: 1.2rem; color: var(--brand-blue); line-height: 1;">👨‍✈️</span>
                        <div>
                            <strong style="display: block; font-size: 0.875rem; font-family: 'Outfit'; color: var(--main-text); margin-bottom: 0.15rem;">Driver & Cab Details</strong>
                            <p style="margin: 0; font-size: 0.775rem; color: var(--muted-text); line-height: 1.4;">Access driver contact numbers and vehicle license numbers instantly on this tracking dashboard prior to pickup.</p>
                        </div>
                    </div>

                    <div style="display: flex; gap: 0.75rem; align-items: flex-start;">
                        <span style="font-size: 1.2rem; color: var(--brand-blue); line-height: 1;">🧾</span>
                        <div>
                            <strong style="display: block; font-size: 0.875rem; font-family: 'Outfit'; color: var(--main-text); margin-bottom: 0.15rem;">Fixed Fare Inclusions</strong>
                            <p style="margin: 0; font-size: 0.775rem; color: var(--muted-text); line-height: 1.4;">Verify your selected package inclusions (Tolls Inclusive or Base Fare) to ensure fully transparent pricing.</p>
                        </div>
                    </div>

                    <div style="display: flex; gap: 0.75rem; align-items: flex-start;">
                        <span style="font-size: 1.2rem; color: var(--brand-blue); line-height: 1;">📞</span>
                        <div>
                            <strong style="display: block; font-size: 0.875rem; font-family: 'Outfit'; color: var(--main-text); margin-bottom: 0.15rem;">24/7 Support Desk</strong>
                            <p style="margin: 0; font-size: 0.775rem; color: var(--muted-text); line-height: 1.4;">Direct, one-click access to communicate with support agents or make adjustments to your schedules.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    <?php endif; ?>

</main>

<?php echo $shell->renderFooter(); ?>
<script defer src="/assets/js/main.js?v=<?php echo @filemtime(__DIR__ . '/../assets/js/main.js'); ?>"></script>
<script defer src="/assets/js/phone-country.js"></script>
<script>
document.addEventListener('DOMContentLoaded', function() {
    var form = document.querySelector('.form-track');
    if (form) {
        form.addEventListener('submit', function(e) {
            var cc = document.getElementById('country-code-hidden').value || '+91';
            var nat = document.getElementById('customer-phone').value.trim();
            document.getElementById('final-phone-hidden').value = cc + ' ' + nat;
        });

        // Initialize from existing input if any
        var rawPhone = document.getElementById('customer-phone').getAttribute('data-raw-phone');
        if (rawPhone && rawPhone.includes(' ')) {
            var parts = rawPhone.split(' ');
            document.getElementById('country-code-hidden').value = parts[0];
            document.getElementById('country-code-trigger').textContent = parts[0];
            document.getElementById('customer-phone').value = parts.slice(1).join(' ');
        } else if (rawPhone) {
            document.getElementById('customer-phone').value = rawPhone;
        }
    }

    // Copier Clipboard Logic
    const copyBtn = document.getElementById('copy-btn');
    const copyTooltip = document.getElementById('copy-tooltip');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const rawId = "<?php echo $bookingIdDisplay; ?>";
            navigator.clipboard.writeText(rawId).then(() => {
                copyTooltip.classList.add('show');
                setTimeout(() => {
                    copyTooltip.classList.remove('show');
                }, 1500);
            });
        });
    }

    // Accordion Toggle Logic
    document.querySelectorAll('.accordion-trigger').forEach(trigger => {
        trigger.addEventListener('click', () => {
            const item = trigger.closest('.accordion-item');
            const isActive = item.classList.contains('active');
            // Close other items
            document.querySelectorAll('.accordion-item').forEach(el => el.classList.remove('active'));
            if (!isActive) {
                item.classList.add('active');
            }
        });
    });

    // Simulated GPS Map Live Ticker
    const tickerEl = document.getElementById('map-update-timer');
    if (tickerEl && tickerEl.textContent.trim().startsWith('Live')) {
        let seconds = 0;
        setInterval(() => {
            seconds++;
            if (seconds > 15) {
                tickerEl.textContent = 'Updating...';
                setTimeout(() => {
                    seconds = 0;
                    tickerEl.textContent = 'Live';
                }, 800);
            } else {
                tickerEl.textContent = `Live (${seconds}s ago)`;
            }
        }, 1000);
    }

    // Allocation Countdown Timer Logic
    const countdownEl = document.getElementById('assignment-countdown');
    if (countdownEl) {
        const pickupStr = countdownEl.getAttribute('data-pickup-datetime');
        if (pickupStr) {
            // Replace hyphens with slashes for safari browser support
            const pickupDate = new Date(pickupStr.replace(/-/g, '/'));
            // Allocation window is 2 hours before pickup time
            const allocationDate = new Date(pickupDate.getTime() - (2 * 60 * 60 * 1000));
            
            function updateCountdown() {
                const now = new Date();
                const diff = allocationDate.getTime() - now.getTime();
                
                if (diff <= 0) {
                    countdownEl.innerHTML = `<span class="countdown-footer-label" style="color: var(--success); font-weight: 700; font-size:0.75rem;">⚡ Allocation window is open. Driver details will be updated here shortly.</span>`;
                    return;
                }
                
                const hrs = Math.floor(diff / (1000 * 60 * 60));
                const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const secs = Math.floor((diff % (1000 * 60)) / 1000);
                
                document.getElementById('cd-hours').textContent = String(hrs).padStart(2, '0');
                document.getElementById('cd-mins').textContent = String(mins).padStart(2, '0');
                document.getElementById('cd-secs').textContent = String(secs).padStart(2, '0');
            }
            
            updateCountdown();
            setInterval(updateCountdown, 1000);
        }
    }
});

/**
 * Share booking tracking link with family/friends.
 */
function shareTrackingLink() {
    const trackingUrl = window.location.href;
    const bookingId = "<?php echo $bookingIdDisplay; ?>";
    const route = "<?php echo htmlspecialchars(($booking['pickup_location'] ?? '') . ' to ' . ($booking['drop_location'] ?? '')); ?>";
    const shareText = `Track my Drop Cars cab ride live!\nBooking ID: ${bookingId}\nRoute: ${route}\nLive Status URL: ${trackingUrl}`;
    
    if (navigator.share) {
        navigator.share({
            title: 'Track My Ride | Drop Cars',
            text: shareText,
            url: trackingUrl
        }).catch(err => {
            // User cancelled or share error
        });
    } else {
        // Fallback: Copy to clipboard
        navigator.clipboard.writeText(shareText).then(() => {
            alert('Ride tracking link copied to clipboard! You can paste and share it with family/friends.');
        }).catch(() => {
            // Secondary fallback: open whatsapp share
            window.open('https://wa.me/?text=' + encodeURIComponent(shareText), '_blank');
        });
    }
}

/**
 * Background fire-and-forget admin Telegram alert when customer requests driver details.
 * Continues to open the WhatsApp link normally — does not block the link.
 */
function triggerDriverRequestNotification(event, bookingId) {
    if (!bookingId) return;
    // Fire background fetch — do NOT await or block the WhatsApp link opening
    fetch('/api/request-driver-notify.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: bookingId })
    }).catch(function() {
        // Silently ignore any network errors — the WhatsApp link still opens
    });
}

</script>
</body>
</html>
