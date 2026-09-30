<?php
/**
 * Customer Dashboard — Premium Redesign
 */
require_once __DIR__ . '/../includes/check-maintenance.php';
if (session_status() === PHP_SESSION_NONE) {
    require_once __DIR__ . '/../config/session.php';
    session_start();
}
require_once __DIR__ . '/../engine/shell.php';
if (!defined('DROP_CARS_DB_OPTIONAL')) define('DROP_CARS_DB_OPTIONAL', true);
require_once __DIR__ . '/../admin/config/database.php';

$configPath = __DIR__ . '/../api/config.php';
$config = is_file($configPath) ? (include $configPath) : [];
$rewardAmt = (float)($config['referralRewardAmount'] ?? 100.00);

// Dynamic support phone & WhatsApp
$supportPhone = $config['supportPhone'] ?? '7200217986';
$supportWhatsApp = $config['whatsappNumber'] ?? '917200217986';
$rawPhone = preg_replace('/\D/', '', $supportPhone);
if (strlen($rawPhone) === 10) {
    $phoneDisplay = '+91 ' . $rawPhone;
    $phoneHref = '+91' . $rawPhone;
} else {
    $phoneDisplay = '+' . $rawPhone;
    $phoneHref = '+' . $rawPhone;
}
$waRaw = preg_replace('/\D/', '', $supportWhatsApp);
if (strlen($waRaw) === 10) {
    $waRaw = '91' . $waRaw;
}
$waHref = 'https://wa.me/' . $waRaw;

// Session check — support phone OR email login
$isLoggedIn = !empty($_SESSION['customer_phone']) || !empty($_SESSION['customer_email']);
if (!$isLoggedIn) {
    header('Location: /pages/customer-login.php?redirect=' . urlencode('/pages/customer-dashboard.php'));
    exit;
}

$customer = null;
$bookings = [];
$reviews  = [];
$dbOk     = isset($pdo) && $pdo instanceof PDO;

if ($dbOk) {
    // Resolve customer by phone first, then email
    try {
        if (!empty($_SESSION['customer_phone'])) {
            $stmt = $pdo->prepare("SELECT * FROM `customers` WHERE `phone` = ? LIMIT 1");
            $stmt->execute([$_SESSION['customer_phone']]);
        } else {
            $stmt = $pdo->prepare("SELECT * FROM `customers` WHERE `email` = ? LIMIT 1");
            $stmt->execute([$_SESSION['customer_email']]);
        }
        $customer = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    } catch (Throwable $e) {}

    if (!$customer) {
        session_destroy();
        header('Location: /pages/customer-login.php');
        exit;
    }

    $customerId = $customer['id'];

    try {
        $stmt = $pdo->prepare("SELECT * FROM `bookings` WHERE `customer_id` = ? ORDER BY `created_at` DESC");
        $stmt->execute([$customerId]);
        $bookings = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {}

    try {
        $phone = $customer['phone'] ?? '';
        $stmt  = $pdo->prepare("SELECT * FROM `reviews` WHERE `customer_phone` = ? ORDER BY `created_at` DESC");
        $stmt->execute([$phone]);
        $reviews = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {}

    // Load referral claims
    $claims = [];
    try {
        $stmt = $pdo->prepare("SELECT * FROM `referral_claims` WHERE `customer_id` = ? ORDER BY `created_at` DESC");
        $stmt->execute([$customerId]);
        $claims = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {}

    // Handle reward redemption POST
    $redeemMsg = '';
    $redeemType = 'success';
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'redeem_rewards') {
        $amountToRedeem = (float)($customer['referral_balance'] ?? 0);
        if ($amountToRedeem <= 0) {
            $redeemMsg = 'You do not have any reward balance to redeem.';
            $redeemType = 'error';
        } else {
            try {
                $pdo->beginTransaction();
                
                // Deduct balance
                $pdo->prepare("UPDATE `customers` SET `referral_balance` = 0.00 WHERE `id` = ?")
                    ->execute([$customerId]);
                    
                // Generate highly attractive and professional claim code
                $prefixes = ['GIFT', 'CASH', 'SAVE', 'RIDE', 'VIP', 'CLUB', 'FREE', 'GOLD', 'LOVE', 'WOW'];
                $prefix = $prefixes[array_rand($prefixes)];
                $claimCode = 'DCRP-' . $prefix . '-' . strtoupper(substr(md5(uniqid(rand(), true)), 0, 4));
                
                // Insert claim
                $pdo->prepare("INSERT INTO `referral_claims` (`customer_id`, `amount`, `redeem_code`, `status`) VALUES (?, ?, ?, 'pending')")
                    ->execute([$customerId, $amountToRedeem, $claimCode]);

                // Auto-generate active coupon in coupons table
                $expiryDate = date('Y-m-d', strtotime('+1 year'));
                $pdo->prepare("INSERT INTO `coupons` (`title`, `code`, `discount_type`, `discount_value`, `expiry_date`, `is_active`) VALUES (?, ?, 'flat', ?, ?, 1)")
                    ->execute([
                        'Referral Reward: ' . ($customer['name'] ?? 'User'),
                        $claimCode,
                        $amountToRedeem,
                        $expiryDate
                    ]);
                    
                $pdo->commit();
                
                // Reload customer data to show correct balance
                if (!empty($_SESSION['customer_phone'])) {
                    $stmt = $pdo->prepare("SELECT * FROM `customers` WHERE `phone` = ? LIMIT 1");
                    $stmt->execute([$_SESSION['customer_phone']]);
                } else {
                    $stmt = $pdo->prepare("SELECT * FROM `customers` WHERE `email` = ? LIMIT 1");
                    $stmt->execute([$_SESSION['customer_email']]);
                }
                $customer = $stmt->fetch(PDO::FETCH_ASSOC) ?: $customer;
                
                // Re-fetch claims
                $stmt = $pdo->prepare("SELECT * FROM `referral_claims` WHERE `customer_id` = ? ORDER BY `created_at` DESC");
                $stmt->execute([$customerId]);
                $claims = $stmt->fetchAll(PDO::FETCH_ASSOC);
                
                $redeemMsg = "Successfully redeemed rewards! Your Redeem Code is: <strong>$claimCode</strong>. Use this code when booking or present it to support to claim your cash/benefits!";
                $redeemType = 'success';
            } catch (Throwable $ex) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                $redeemMsg = 'Failed to process redemption. Please try again.';
                $redeemType = 'error';
            }
        }
    }
}

// Stats
$totalBookings   = count($bookings);
$completedCount  = count(array_filter($bookings, function($b) { return ($b['status'] ?? '') === 'completed'; }));
$completedFares  = array_filter($bookings, function($b) { return ($b['status'] ?? '') === 'completed'; });
$totalSpent      = array_sum(array_column($completedFares, 'final_fare'));
$upcomingCount   = count(array_filter($bookings, function($b) { return in_array($b['status'] ?? '', ['confirmed', 'pending']); }));

$displayName  = $customer['name']  ?? 'Valued Customer';
$displayEmail = $customer['email'] ?? '';
$displayPhone = $customer['phone'] ?? '';
$initials     = strtoupper(substr(trim($displayName), 0, 1) ?: 'U');

// Detect the real active theme (subdomain / ?theme=) instead of always
// defaulting to Drop Cars branding — matches customer-login.php / track-booking.php.
require_once __DIR__ . '/../includes/paths.php';
require_once __DIR__ . '/../engine/theme-engine.php';
require_once __DIR__ . '/../engine/theme-seo.php';
$themeEngineForDashboard = new ThemeEngine();
$activeTheme = dropcars_merge_theme_seo($themeEngineForDashboard->detectTheme());
$themesListForDashboard = $themeEngineForDashboard->getAllThemes();
$shell = new UIShell($activeTheme, $themesListForDashboard);

// Advance payment config
$_advCfgPath = __DIR__ . '/../data/config.json';
$_advCfg     = is_file($_advCfgPath) ? (json_decode(file_get_contents($_advCfgPath), true)['advancePayment'] ?? []) : [];
$_advEnabled  = !empty($_advCfg['enabled']);
$_advUpiId    = $_advCfg['upiId']    ?? '7200217986-1@okbizaxis';
$_advQrPath   = $_advCfg['qrPath']   ?? 'assets/img/qr-code.jpg';
$_advPercent  = (int)($_advCfg['percent']   ?? 20);
$_advMin      = (int)($_advCfg['minAmount'] ?? 300);
$_advNote     = $_advCfg['note']     ?? '';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Dashboard | <?php echo htmlspecialchars($brandName ?? (($activeTheme['slug'] ?? '') === 'airport-taxi' ? 'Airport Taxi' : 'Drop Cars'), ENT_QUOTES, 'UTF-8'); ?></title>
    <meta name="description" content="Manage your Drop Cars bookings, track rides and view your travel history.">
<?php dropcars_render_favicons(); ?>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@500;600;700;800;900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/assets/css/base.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/base.css'); ?>">
    <link rel="stylesheet" href="/assets/css/layout.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/layout.css'); ?>">
    <link rel="stylesheet" href="/assets/css/navbar.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/navbar.css'); ?>">
    <link rel="stylesheet" href="/assets/css/footer.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/footer.css'); ?>">
    <link rel="stylesheet" href="/assets/css/whatsapp.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/whatsapp.css'); ?>">
    <link rel="stylesheet" href="/assets/css/responsive.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/responsive.css'); ?>">
    <link rel="stylesheet" href="/assets/css/dark-mode.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/dark-mode.css'); ?>">
    <link rel="stylesheet" href="/assets/css/light-theme.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/light-theme.css'); ?>">
    <?php if (($activeTheme['slug'] ?? '') === 'airport-taxi'): ?>
    <link rel="stylesheet" href="/assets/css/theme-airporttaxi.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/theme-airporttaxi.css'); ?>">
    <?php endif; ?>
    <script src="/assets/js/dark-mode.js?v=<?php echo @filemtime(__DIR__ . '/../assets/js/dark-mode.js'); ?>"></script>
    <style>
        :root {
            --dash-bg:      #f0f4fa;
            --card-bg:      #ffffff;
            --card-border:  rgba(148,163,184,0.13);
            --blue:         #2563eb;
            --blue-dk:      #1e40af;
            --gold:         #f59e0b;
            --green:        #10b981;
            --red:          #ef4444;
            --muted:        #64748b;
            --text:         #0f172a;
            --radius:       20px;
            --shadow:       0 4px 24px rgba(15,23,42,0.06);
        }

        /* AirportTaxi.International — elite black & champagne-gold override.
           Reuses this page's existing CSS-variable system so most var(--blue)
           usages repaint automatically; the few hardcoded gradients below are
           overridden explicitly. */
        body.theme-airporttaxi {
            --dash-bg: #fbf9f4;
            --blue: #a67c2e;
            --blue-dk: #171612;
            --gold: #a67c2e;
        }
        body.theme-airporttaxi .dash-hero { background: linear-gradient(135deg, #171612 0%, #3a2f1a 55%, #a67c2e 100%); }
        body.theme-airporttaxi .active-tab-underline,
        body.theme-airporttaxi .bk-btn-gold { background: rgba(166,124,46,0.12); color: #7a5a1f; }

        *, *::before, *::after { box-sizing: border-box; }
        body { background: var(--dash-bg); font-family: 'Inter', sans-serif; color: var(--text); margin: 0; }
        .outfit { font-family: 'Outfit', sans-serif; }

        /* ─── HERO BANNER ─────────────────────────────────────── */
        .dash-hero {
            background: linear-gradient(135deg, #0b1f3a 0%, #1e3a8a 55%, #2563eb 100%);
            padding: 3rem 1.5rem 5rem;
            position: relative;
            overflow: hidden;
        }
        .dash-hero::before {
            content: '';
            position: absolute; inset: 0;
            background: radial-gradient(ellipse at 80% 50%, rgba(96,165,250,0.18) 0%, transparent 65%),
                        radial-gradient(ellipse at 10% 80%, rgba(245,158,11,0.10) 0%, transparent 55%);
        }
        .dash-hero-inner {
            max-width: 1100px; margin: 0 auto;
            display: flex; flex-direction: column; gap: 1.5rem;
            position: relative; z-index: 1;
        }
        .dash-hero-profile {
            display: flex; align-items: center; gap: 1.5rem; width: 100%;
        }
        .dash-avatar {
            width: 72px; height: 72px; border-radius: 50%;
            background: linear-gradient(135deg, #f59e0b, #fbbf24);
            color: #0b1f3a; font-size: 2rem; font-weight: 900;
            display: flex; align-items: center; justify-content: center;
            font-family: 'Outfit', sans-serif;
            box-shadow: 0 0 0 4px rgba(255,255,255,0.15), 0 8px 24px rgba(0,0,0,0.25);
            flex-shrink: 0;
            animation: avatarPop 0.6s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        @keyframes avatarPop {
            from { transform: scale(0.5); opacity: 0; }
            to   { transform: scale(1);   opacity: 1; }
        }
        .dash-hero-text { flex: 1; min-width: 0; }
        .dash-hero-text .greeting {
            font-size: 0.78rem; font-weight: 700; letter-spacing: 0.12em;
            text-transform: uppercase; color: rgba(255,255,255,0.55); margin-bottom: 0.2rem;
        }
        .dash-hero-text h1 {
            font-size: clamp(1.4rem, 3vw, 2.1rem); font-weight: 900;
            color: #fff; margin: 0 0 0.3rem; font-family: 'Outfit', sans-serif;
            line-height: 1.15;
        }
        .dash-hero-text .sub {
            font-size: 0.85rem; color: rgba(255,255,255,0.6); font-weight: 500;
        }
        .dash-hero-actions {
            display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 1.25rem;
        }
        .hero-btn {
            display: inline-flex; align-items: center; gap: 0.4rem;
            padding: 0.55rem 1.1rem; border-radius: 10px;
            font-size: 0.82rem; font-weight: 700; text-decoration: none;
            font-family: 'Outfit', sans-serif; transition: all 0.2s;
        }
        .hero-btn-primary {
            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
            color: #0b1f3a;
            border: none;
            box-shadow: 0 4px 14px rgba(245,158,11,0.25);
        }
        .hero-btn-primary:hover {
            background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
            box-shadow: 0 6px 18px rgba(245,158,11,0.4);
            transform: translateY(-2px);
        }
        .hero-btn-outline {
            background: rgba(255,255,255,0.06);
            color: #fff;
            border: 1px solid rgba(255,255,255,0.18);
            backdrop-filter: blur(5px);
        }
        .hero-btn-outline:hover {
            background: rgba(255,255,255,0.14);
            border-color: rgba(255,255,255,0.35);
            transform: translateY(-2px);
        }
        .hero-btn-invite {
            background: rgba(245,158,11,0.08);
            color: #fbbf24;
            border: 1px solid rgba(245,158,11,0.3);
            backdrop-filter: blur(5px);
        }
        .hero-btn-invite:hover {
            background: rgba(245,158,11,0.18);
            border-color: #fbbf24;
            box-shadow: 0 4px 12px rgba(245,158,11,0.15);
            transform: translateY(-2px);
        }
        .hero-top-logout-btn:hover {
            background: rgba(239, 68, 68, 0.2) !important;
            border-color: rgba(239, 68, 68, 0.45) !important;
            color: #f87171 !important;
        }

        /* ─── STAT CHIPS (overlap hero) ──────────────────────── */
        .dash-stats-wrap {
            max-width: 1100px; margin: -2.5rem auto 0;
            padding: 0 1.5rem; position: relative; z-index: 10;
        }
        .dash-stats {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 1rem;
        }
        .stat-chip {
            background: var(--card-bg); border-radius: 16px;
            padding: 1.1rem 1.25rem;
            box-shadow: 0 8px 30px rgba(15,23,42,0.09);
            display: flex; align-items: center; gap: 0.85rem;
            animation: slideUp 0.5s ease both;
        }
        .stat-chip:nth-child(1) { animation-delay: 0.05s; }
        .stat-chip:nth-child(2) { animation-delay: 0.10s; }
        .stat-chip:nth-child(3) { animation-delay: 0.15s; }
        .stat-chip:nth-child(4) { animation-delay: 0.20s; }
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(16px); }
            to   { opacity: 1; transform: translateY(0); }
        }
        .stat-icon {
            width: 42px; height: 42px; border-radius: 12px;
            display: flex; align-items: center; justify-content: center;
            font-size: 1.2rem; flex-shrink: 0;
        }
        .ic-blue   { background: rgba(37,99,235,0.10); }
        .ic-green  { background: rgba(16,185,129,0.10); }
        .ic-gold   { background: rgba(245,158,11,0.10); }
        .ic-purple { background: rgba(139,92,246,0.10); }
        .stat-val { font-size: 1.4rem; font-weight: 900; color: var(--text); font-family: 'Outfit', sans-serif; line-height: 1; }
        .stat-lbl { font-size: 0.7rem; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 0.15rem; }

        /* ─── MAIN LAYOUT ──────────────────────────────────────── */
        .dash-body {
            max-width: 1100px; margin: 2.5rem auto 4rem;
            padding: 0 1.5rem;
            display: grid;
            grid-template-columns: 280px 1fr;
            gap: 1.5rem;
            align-items: start;
        }

        /* ─── SIDEBAR ──────────────────────────────────────────── */
        .dash-sidebar {
            background: var(--card-bg); border-radius: var(--radius);
            box-shadow: var(--shadow); overflow: hidden;
            position: sticky; top: 90px;
        }
        .sidebar-profile {
            padding: 1.5rem; border-bottom: 1px solid var(--card-border);
            text-align: center;
        }
        .sidebar-avatar-wrap { position: relative; display: inline-block; margin-bottom: 0.75rem; }
        .sidebar-avatar {
            width: 60px; height: 60px; border-radius: 50%;
            background: linear-gradient(135deg, #2563eb, #7c3aed);
            color: #fff; font-size: 1.5rem; font-weight: 900;
            display: flex; align-items: center; justify-content: center;
            font-family: 'Outfit', sans-serif;
        }
        .sidebar-online {
            position: absolute; bottom: 2px; right: 2px;
            width: 12px; height: 12px; background: #10b981;
            border-radius: 50%; border: 2px solid #fff;
        }
        .sidebar-name { font-size: 0.95rem; font-weight: 800; color: var(--text); margin-bottom: 0.2rem; }
        .sidebar-meta { font-size: 0.75rem; color: var(--muted); line-height: 1.5; }

        .sidebar-nav { padding: 0.75rem; }
        .sidebar-nav a {
            display: flex; align-items: center; gap: 0.65rem;
            padding: 0.7rem 0.85rem; border-radius: 12px;
            text-decoration: none; color: var(--muted);
            font-weight: 600; font-size: 0.88rem;
            transition: all 0.2s; margin-bottom: 0.2rem;
        }
        .sidebar-nav a .nav-icon {
            width: 32px; height: 32px; border-radius: 8px;
            display: flex; align-items: center; justify-content: center;
            font-size: 0.95rem; transition: all 0.2s;
            background: transparent;
        }
        .sidebar-nav a:hover, .sidebar-nav a.active {
            background: #eff6ff; color: var(--blue);
        }
        .sidebar-nav a:hover .nav-icon, .sidebar-nav a.active .nav-icon {
            background: rgba(37,99,235,0.12);
        }
        .sidebar-nav a.danger { color: #ef4444; }
        .sidebar-nav a.danger:hover { background: #fef2f2; color: #dc2626; }
        .sidebar-nav a.danger:hover .nav-icon { background: rgba(239,68,68,0.1); }

        .sidebar-help {
            margin: 0.75rem; border-radius: 14px;
            background: linear-gradient(135deg, #eff6ff, #f0fdf4);
            border: 1px solid rgba(37,99,235,0.12);
            padding: 1rem;
        }
        .sidebar-help strong { display: block; font-size: 0.82rem; font-weight: 800; color: var(--text); margin-bottom: 0.25rem; }
        .sidebar-help p { font-size: 0.75rem; color: var(--muted); margin: 0 0 0.6rem; line-height: 1.5; }
        .sidebar-help a { display: flex; align-items: center; gap: 0.35rem; color: var(--blue); font-weight: 700; font-size: 0.8rem; text-decoration: none; }
        .sidebar-help a:hover { text-decoration: underline; }

        /* ─── CONTENT AREA ─────────────────────────────────────── */
        .dash-content { display: flex; flex-direction: column; gap: 1.5rem; }

        .content-card {
            background: var(--card-bg); border-radius: var(--radius);
            box-shadow: var(--shadow); overflow: hidden;
        }
        .card-header {
            padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--card-border);
            display: flex; align-items: center; justify-content: space-between;
        }
        .card-title {
            font-size: 1rem; font-weight: 800; color: var(--text);
            display: flex; align-items: center; gap: 0.5rem;
            font-family: 'Outfit', sans-serif;
        }
        .card-title-icon {
            width: 32px; height: 32px; border-radius: 9px;
            display: flex; align-items: center; justify-content: center;
            font-size: 1rem;
        }
        .card-body { padding: 1.25rem 1.5rem; }

        /* badge pill */
        .pill {
            display: inline-flex; align-items: center; gap: 0.3rem;
            padding: 0.25rem 0.65rem; border-radius: 20px;
            font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
        }
        .pill-confirmed { background: #dcfce7; color: #166534; }
        .pill-pending   { background: #fef9c3; color: #854d0e; }
        .pill-completed { background: #e0f2fe; color: #075985; }
        .pill-cancelled { background: #fee2e2; color: #991b1b; }

        /* ─── BOOKING CARDS ───────────────────────────────────── */
        .booking-card {
            border: 1px solid var(--card-border); border-radius: 16px;
            padding: 1.1rem 1.25rem; margin-bottom: 0.85rem;
            display: grid; grid-template-columns: 1fr auto;
            gap: 0.75rem 1rem; align-items: start;
            transition: border-color 0.2s, box-shadow 0.2s;
            position: relative; overflow: hidden;
        }
        .booking-card::before {
            content: ''; position: absolute;
            left: 0; top: 0; bottom: 0; width: 4px;
            background: var(--blue); border-radius: 4px 0 0 4px;
        }
        .booking-card.status-completed::before { background: var(--green); }
        .booking-card.status-cancelled::before { background: var(--red); }
        .booking-card:hover { border-color: rgba(37,99,235,0.2); box-shadow: 0 4px 20px rgba(37,99,235,0.07); }
        .booking-card:last-child { margin-bottom: 0; }

        .booking-route { font-size: 0.97rem; font-weight: 800; color: var(--text); font-family: 'Outfit', sans-serif; margin-bottom: 0.35rem; }
        .booking-route .arrow { color: var(--gold); margin: 0 0.4rem; }
        .booking-meta { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; }
        .booking-meta span { font-size: 0.75rem; color: var(--muted); display: flex; align-items: center; gap: 0.3rem; font-weight: 500; }
        .booking-meta svg { flex-shrink: 0; }

        .booking-right { text-align: right; }
        .booking-fare { font-size: 1.25rem; font-weight: 900; color: var(--text); font-family: 'Outfit', sans-serif; }
        .booking-actions { display: flex; gap: 0.5rem; margin-top: 0.6rem; justify-content: flex-end; flex-wrap: wrap; }
        .bk-btn {
            display: inline-flex; align-items: center; gap: 0.3rem;
            padding: 0.35rem 0.75rem; border-radius: 8px;
            font-size: 0.72rem; font-weight: 700; text-decoration: none;
            font-family: 'Outfit', sans-serif; transition: all 0.2s;
        }
        .bk-btn-blue  { background: rgba(37,99,235,0.09); color: var(--blue); }
        .bk-btn-blue:hover  { background: var(--blue); color: #fff; }
        .bk-btn-gold  { background: rgba(245,158,11,0.10); color: #b45309; }
        .bk-btn-gold:hover  { background: var(--gold); color: #000; }

        /* empty state */
        .empty-state {
            text-align: center; padding: 3rem 1rem; color: var(--muted);
        }
        .empty-icon {
            width: 64px; height: 64px; border-radius: 50%;
            background: #f1f5f9;
            display: flex; align-items: center; justify-content: center;
            font-size: 1.75rem; margin: 0 auto 1rem;
        }
        .empty-state p { font-size: 0.9rem; margin: 0 0 1.25rem; }
        .empty-cta {
            display: inline-flex; align-items: center; gap: 0.4rem;
            background: var(--blue); color: #fff;
            padding: 0.6rem 1.25rem; border-radius: 12px;
            font-weight: 700; font-size: 0.85rem; text-decoration: none;
            font-family: 'Outfit', sans-serif; transition: all 0.2s;
        }
        .empty-cta:hover { background: var(--blue-dk); transform: translateY(-1px); }

        /* ─── REVIEW FORM ─────────────────────────────────────── */
        .review-form-wrap { background: linear-gradient(135deg, #eff6ff, #f0fdf4); border-radius: 14px; padding: 1.25rem; margin-bottom: 1.25rem; border: 1px solid rgba(37,99,235,0.12); }
        .star-row { display: flex; gap: 6px; margin: 0.6rem 0; }
        .star-btn {
            background: none; border: none; cursor: pointer; font-size: 1.8rem;
            color: #cbd5e1; padding: 0; line-height: 1;
            transition: color 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .star-btn:hover, .star-btn.lit { color: #f59e0b; }
        .star-btn:hover { transform: scale(1.35) rotate(8deg); }
        .star-btn:active { transform: scale(0.9) rotate(-3deg); }
        #star-rating-hidden { display: none; }
        .review-textarea {
            width: 100%; border: 1px solid var(--card-border); border-radius: 12px;
            padding: 0.75rem 1rem; font-size: 0.9rem; font-family: 'Inter', sans-serif;
            resize: vertical; min-height: 90px; outline: none; color: var(--text);
            background: #fff; transition: border-color 0.2s;
        }
        .review-textarea:focus { border-color: var(--blue); }
        .review-submit {
            margin-top: 0.75rem; background: var(--blue); color: #fff;
            border: none; border-radius: 10px; padding: 0.65rem 1.4rem;
            font-weight: 700; font-size: 0.85rem; font-family: 'Outfit', sans-serif;
            cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 0.4rem;
        }
        .review-submit:hover { background: var(--blue-dk); transform: translateY(-1px); }

        /* Review card */
        .review-card {
            border-left: 4px solid var(--blue); border-radius: 0 14px 14px 0;
            background: #fafbff; padding: 0.9rem 1.1rem; margin-bottom: 0.85rem;
        }
        .review-stars { color: var(--gold); font-size: 1rem; letter-spacing: 1px; }
        .review-card p { font-style: italic; color: #334155; font-size: 0.88rem; line-height: 1.6; margin: 0.35rem 0 0.5rem; }
        .review-card-meta { font-size: 0.72rem; color: var(--muted); }

        /* ─── REFERRAL / LOYALTY CARD ─────────────────────────── */
        .referral-card {
            background: linear-gradient(135deg, #1e3a8a, #2563eb, #3b82f6);
            border-radius: var(--radius); color: #fff; overflow: hidden; position: relative;
        }
        .referral-card::after {
            content: ''; position: absolute; right: -40px; top: -40px;
            width: 180px; height: 180px; border-radius: 50%;
            background: rgba(255,255,255,0.06);
        }
        .referral-inner { padding: 1.5rem; position: relative; z-index: 1; }
        .referral-code-row {
            display: flex; align-items: center; justify-content: space-between;
            background: rgba(255,255,255,0.08); border: 1px dashed rgba(255,255,255,0.25);
            border-radius: 12px; padding: 0.75rem 1rem; margin: 1rem 0;
        }
        .referral-code { font-size: 1.5rem; font-weight: 900; letter-spacing: 3px; color: var(--gold); font-family: 'Outfit', sans-serif; }
        .copy-code-btn {
            background: var(--gold); color: #0b1f3a; border: none;
            padding: 0.4rem 0.85rem; border-radius: 8px;
            font-weight: 800; font-size: 0.75rem; font-family: 'Outfit', sans-serif;
            cursor: pointer; transition: all 0.2s;
        }
        .copy-code-btn:hover { transform: scale(1.05); }
        #copy-msg { font-size: 0.75rem; color: #6ee7b7; margin: 0; display: none; }

        /* ─── MOBILE TAB BAR ─────────────────────────────────── */
        .mobile-tabs {
            display: none;
            background: var(--card-bg);
            border-radius: 14px;
            padding: 0.35rem;
            gap: 0.25rem;
            box-shadow: var(--shadow);
            margin-bottom: 1rem;
        }
        .mob-tab {
            flex: 1; border: none; background: transparent; cursor: pointer;
            padding: 0.6rem 0.5rem; border-radius: 10px;
            font-size: 0.75rem; font-weight: 700; color: var(--muted);
            font-family: 'Outfit', sans-serif; transition: all 0.2s;
            display: flex; align-items: center; justify-content: center; gap: 0.3rem;
            white-space: nowrap;
        }
        .mob-tab.active { background: var(--blue); color: #fff; }
        .mob-tab:not(.active):hover { background: #eff6ff; color: var(--blue); }

        /* ─── RESPONSIVE ─────────────────────────────────────── */
        @media (max-width: 900px) {
            .dash-stats { grid-template-columns: repeat(2, 1fr); }
            .dash-body  { grid-template-columns: 1fr; }
            .dash-sidebar { display: none; }
            .mobile-tabs { display: flex; }
        }
        @media (max-width: 520px) {
            /* ── Stats — all 3 in one row ── */
            .dash-stats { grid-template-columns: repeat(3, 1fr); gap: 0.45rem; }
            .dash-stats-wrap { padding: 0 0.9rem; margin-top: -1.75rem; }
            .stat-chip { padding: 0.65rem 0.5rem; gap: 0; flex-direction: column; align-items: center; text-align: center; border-radius: 12px; }
            .stat-icon { width: 28px; height: 28px; font-size: 0.8rem; border-radius: 8px; margin-bottom: 0.3rem; }
            .stat-val  { font-size: 1rem; }
            .stat-lbl  { font-size: 0.55rem; margin-top: 0.1rem; letter-spacing: 0.03em; }

            /* ── Hero ── */
            .dash-hero { padding: 1.5rem 1rem 3rem; }
            .dash-hero-inner { gap: 1.25rem; }
            .dash-hero-profile { flex-direction: column; align-items: center; text-align: center; gap: 1rem !important; }

            /* Avatar */
            .dash-avatar { width: 60px; height: 60px; font-size: 1.5rem; margin: 0 auto 0.25rem; }

            /* Text block: centered stack */
            .dash-hero-text { width: 100%; min-width: 0; }
            .dash-hero-text .greeting { font-size: 0.68rem; margin-bottom: 0.1rem; letter-spacing: 0.1em; }
            .dash-hero-text h1 {
                font-size: 1.25rem !important;
                margin-bottom: 0.2rem;
                white-space: normal !important;
                overflow: visible !important;
                text-overflow: clip !important;
            }
            .dash-hero-text .sub {
                font-size: 0.75rem !important;
                white-space: normal !important;
                overflow: visible !important;
                text-overflow: clip !important;
                line-height: 1.4;
            }

            /* Buttons: Smart structured grid for prime mobile footprint */
            .dash-hero-actions {
                display: flex;
                flex-flow: row wrap;
                gap: 0.5rem;
                width: 100%;
                margin-top: 1rem;
            }
            .dash-hero-actions a.hero-btn-primary {
                width: 100%;
                justify-content: center;
                padding: 0.72rem 1rem;
                font-size: 0.88rem;
            }
            .dash-hero-actions a.hero-btn-outline,
            .dash-hero-actions button.hero-btn-invite {
                width: calc(50% - 0.25rem);
                justify-content: center;
                padding: 0.65rem 0.5rem;
                font-size: 0.78rem;
                white-space: nowrap;
            }

            /* Body */
            .dash-body { padding: 0 0.9rem; margin-top: 1.75rem; }
            .booking-card { grid-template-columns: 1fr; }
            .booking-right { text-align: left; }
            .booking-actions { justify-content: flex-start; }
        }
        @media (min-width: 901px) {
            .mobile-tabs { display: none !important; }
        }

        @media (max-width: 360px) {
            .dash-stats { gap: 0.3rem; }
            .stat-chip { padding: 0.5rem 0.25rem; }
            .stat-val { font-size: 0.9rem; }
            .stat-lbl { font-size: 0.5rem; }
            .mob-tab { font-size: 0.68rem; padding: 0.5rem 0.35rem; gap: 0.15rem; }
        }

        /* ─── TAB SWITCH ANIMATION ─── */
        .tab-panel {
            animation: tabFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes tabFadeIn {
            from { opacity: 0; transform: translateY(12px); }
            to   { opacity: 1; transform: translateY(0); }
        }

        /* ─── BOOKING STEPPER TRACKER ─── */
        .booking-tracker-wrap {
            grid-column: 1 / -1;
            margin-top: 0.85rem;
            border-top: 1px solid var(--card-border);
            padding-top: 0.85rem;
        }
        .booking-tracker {
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: relative;
            max-width: 480px;
            margin: 0 auto;
        }
        .tracker-step {
            display: flex;
            flex-direction: column;
            align-items: center;
            position: relative;
            z-index: 2;
            gap: 0.25rem;
        }
        .step-dot {
            width: 22px;
            height: 22px;
            border-radius: 50%;
            background: #f1f5f9;
            color: var(--muted);
            font-size: 0.65rem;
            font-weight: 800;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid #e2e8f0;
            transition: all 0.3s ease;
        }
        .step-label {
            font-size: 0.65rem;
            font-weight: 700;
            color: var(--muted);
            text-transform: uppercase;
            letter-spacing: 0.02em;
            font-family: 'Outfit', sans-serif;
            transition: all 0.3s ease;
        }
        .tracker-line {
            flex: 1;
            height: 3px;
            background: #e2e8f0;
            margin: 0 0.25rem;
            position: relative;
            top: -7px;
            border-radius: 2px;
            z-index: 1;
            overflow: hidden;
        }
        .tracker-line::after {
            content: '';
            position: absolute;
            left: 0; top: 0; bottom: 0; width: 0;
            background: var(--blue);
            transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .tracker-step.active .step-dot {
            background: var(--blue);
            color: #fff;
            border-color: var(--blue);
            box-shadow: 0 0 0 4px rgba(37,99,235,0.15);
        }
        .tracker-step.active .step-label { color: var(--blue); }
        .tracker-line.active::after { width: 100%; }

        /* Stepper Completed Overrides */
        .booking-card.status-completed .tracker-step.active .step-dot {
            background: var(--green); border-color: var(--green);
            box-shadow: 0 0 0 4px rgba(16,185,129,0.15);
        }
        .booking-card.status-completed .tracker-step.active .step-label { color: var(--green); }
        .booking-card.status-completed .tracker-line.active::after { background: var(--green); }

        /* ─── DIGITAL VOUCHER POSTER ─── */
        .digital-voucher {
            background: linear-gradient(135deg, #0b1f3a 0%, #1a365d 50%, #1e3a8a 100%);
            border-radius: 16px;
            padding: 1.5rem;
            position: relative;
            overflow: hidden;
            border: 2px dashed rgba(245,158,11,0.4);
            box-shadow: 0 10px 30px rgba(11,31,58,0.15);
            color: #fff;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .digital-voucher:hover {
            transform: translateY(-2px);
            box-shadow: 0 15px 35px rgba(245,158,11,0.12);
        }
        .digital-voucher-circle {
            position: absolute;
            width: 20px;
            height: 20px;
            background: var(--dash-bg);
            border-radius: 50%;
            top: 50%;
            transform: translateY(-50%);
            z-index: 5;
        }
        .digital-voucher-circle-left { left: -10px; }
        .digital-voucher-circle-right { right: -10px; }
    </style>
<?php include __DIR__ . '/../includes/google-tag.php'; ?>
</head>
<body class="<?php echo ($activeTheme['slug'] ?? '') === 'airport-taxi' ? ('theme-airporttaxi ' . (function_exists('dropcars_is_native_airporttaxi_host') && dropcars_is_native_airporttaxi_host() ? 'ati-native' : 'ati-embedded')) : ''; ?>">
<?php echo $shell->renderHeader(); ?>

<!-- ══════════════════════ HERO ══════════════════════ -->
<div class="dash-hero">
    <div class="dash-hero-inner">
        <!-- Top bar: Logout and Wallet -->
        <div class="dash-hero-top-row" style="display:flex; align-items:center; justify-content:space-between; width:100%; z-index:10; position:relative;">
            <a href="/pages/logout.php" class="hero-top-logout-btn" title="Logout" style="color:#fee2e2; background:rgba(239,68,68,0.18); border:1px solid rgba(239,68,68,0.35); border-radius:10px; padding:6px 14px; display:inline-flex; align-items:center; gap:6px; font-size:0.82rem; font-weight:700; text-decoration:none; transition:all 0.2s;">
                <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="transform: scaleX(-1);"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                <span>Log Out</span>
            </a>
            <div class="hero-top-wallet" style="display:inline-flex; align-items:center; gap:6px; background:linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%); border:1px solid rgba(255,255,255,0.18); border-radius:10px; padding:6px 12px; color:#fff; font-size:0.82rem; font-weight:700; font-family:'Outfit'; backdrop-filter:blur(10px);">
                <span>👛</span> Wallet: <span style="color:#fbbf24; font-weight:800;">₹<?php echo number_format((float)($customer['referral_balance'] ?? 0.00), 2); ?></span>
            </div>
        </div>
        
        <!-- Profile block (Avatar + Text) -->
        <div class="dash-hero-profile">
            <div class="dash-avatar"><?php echo $initials; ?></div>
            <div class="dash-hero-text">
                <div class="greeting">Welcome back</div>
                <h1 class="outfit"><?php echo htmlspecialchars($displayName); ?> 👋</h1>
                <div class="sub">
                    <?php if ($displayEmail): ?><?php echo htmlspecialchars($displayEmail); ?><?php endif; ?>
                    <?php if ($displayEmail && $displayPhone): ?> &nbsp;·&nbsp; <?php endif; ?>
                    <?php if ($displayPhone): ?><?php echo htmlspecialchars($displayPhone); ?><?php endif; ?>
                </div>
                <div class="dash-hero-actions">
                    <a href="/" class="hero-btn hero-btn-primary">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12l7-7 7 7"/></svg>
                        Book a Ride
                    </a>
                    <a href="/pages/track-booking.php" class="hero-btn hero-btn-outline">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
                        Track Booking
                    </a>
                    <button onclick="switchTab('referral'); shareInvite('native');" class="hero-btn hero-btn-invite" style="cursor:pointer;">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                        🎁 Invite &amp; Earn
                    </button>
                    <a href="/pages/logout.php" class="hero-btn hero-btn-outline" style="border-color:rgba(239,68,68,0.4); color:#fca5a5;">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="transform: scaleX(-1);"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                        Log Out
                    </a>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- ══════════════════════ STAT CHIPS ══════════════════════ -->
<div class="dash-stats-wrap">
    <div class="dash-stats">
        <div class="stat-chip" onclick="filterBookings('all')" style="cursor:pointer; transition:transform 0.15s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
            <div class="stat-icon ic-blue">🚗</div>
            <div>
                <div class="stat-val outfit"><?php echo $totalBookings; ?></div>
                <div class="stat-lbl">Total Trips</div>
            </div>
        </div>
        <div class="stat-chip" onclick="filterBookings('upcoming')" style="cursor:pointer; transition:transform 0.15s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
            <div class="stat-icon ic-gold">📅</div>
            <div>
                <div class="stat-val outfit"><?php echo $upcomingCount; ?></div>
                <div class="stat-lbl">Upcoming</div>
            </div>
        </div>
        <div class="stat-chip" onclick="filterBookings('history')" style="cursor:pointer; transition:transform 0.15s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
            <div class="stat-icon ic-green">✅</div>
            <div>
                <div class="stat-val outfit"><?php echo $completedCount; ?></div>
                <div class="stat-lbl">History</div>
            </div>
        </div>
    </div>
</div>

<!-- ══════════════════════ BODY ══════════════════════ -->
<div class="dash-body">
    <!-- Mobile-only tab strip (replaces sidebar on small screens) -->
    <div class="mobile-tabs" id="mobile-tab-bar" style="grid-column:1/-1;">
        <button class="mob-tab active" onclick="switchTab('bookings',this)">📋 Bookings</button>
        <button class="mob-tab" onclick="switchTab('referral',this)">🎁 Invite &amp; Earn</button>
        <button class="mob-tab" onclick="switchTab('reviews',this)">⭐ Reviews</button>
    </div>

    <!-- ── SIDEBAR ── -->
    <aside class="dash-sidebar">
        <div class="sidebar-profile">
            <div class="sidebar-avatar-wrap">
                <div class="sidebar-avatar"><?php echo $initials; ?></div>
                <div class="sidebar-online"></div>
            </div>
            <div class="sidebar-name"><?php echo htmlspecialchars($displayName); ?></div>
            <div class="sidebar-meta">
                <?php if ($displayEmail): ?><?php echo htmlspecialchars($displayEmail); ?><br><?php endif; ?>
                <?php if ($displayPhone): ?><?php echo htmlspecialchars($displayPhone); ?><?php endif; ?>
            </div>
        </div>

        <nav class="sidebar-nav">
            <a href="#bookings" class="active" onclick="switchTab('bookings', this)">
                <span class="nav-icon">📋</span> My Bookings
                <?php if ($totalBookings): ?>
                <span style="margin-left:auto; background:#2563eb; color:#fff; font-size:0.65rem; font-weight:800; padding:1px 7px; border-radius:20px;"><?php echo $totalBookings; ?></span>
                <?php endif; ?>
            </a>
            <a href="#referral" onclick="switchTab('referral', this)">
                <span class="nav-icon">🎁</span> Invite &amp; Earn
            </a>
            <a href="#reviews" onclick="switchTab('reviews', this)">
                <span class="nav-icon">⭐</span> My Reviews
                <?php if (count($reviews)): ?>
                <span style="margin-left:auto; background:#f59e0b; color:#000; font-size:0.65rem; font-weight:800; padding:1px 7px; border-radius:20px;"><?php echo count($reviews); ?></span>
                <?php endif; ?>
            </a>
        </nav>

        <div class="sidebar-help">
            <strong>Need Help?</strong>
            <p>Our team is available 24/7 for any booking queries.</p>
            <div style="display:flex; flex-direction:column; gap:0.45rem;">
                <a href="tel:<?php echo htmlspecialchars($phoneHref); ?>" style="display:inline-flex; align-items:center; gap:0.35rem; color:var(--blue); font-weight:700; font-size:0.8rem; text-decoration:none;">
                    <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M22 16.92v4a1 1 0 0 1-1.09 1A19.91 19.91 0 0 1 2.08 3.09 1 1 0 0 1 3 2h4a1 1 0 0 1 1 .75 12.35 12.35 0 0 0 .7 2.22 1 1 0 0 1-.23 1L7.21 7.91a16 16 0 0 0 8.88 8.88l1.94-1.21a1 1 0 0 1 1-.06 12.35 12.35 0 0 0 2.22.7 1 1 0 0 1 .75 1.1z"/></svg>
                    <?php echo htmlspecialchars($phoneDisplay); ?>
                </a>
                <a href="<?php echo htmlspecialchars($waHref); ?>" target="_blank" style="display:inline-flex; align-items:center; gap:0.35rem; color:#16a34a; font-weight:700; font-size:0.8rem; text-decoration:none;">
                    <svg width="13" height="13" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.999 0C5.373 0 0 5.373 0 12c0 2.118.554 4.107 1.523 5.83L.057 23.98l6.306-1.434A11.95 11.95 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 11.999 0zm.001 21.818a9.818 9.818 0 0 1-5.001-1.373l-.36-.214-3.722.847.86-3.636-.235-.374A9.817 9.817 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182c5.431 0 9.818 4.388 9.818 9.818 0 5.431-4.388 9.818-9.818 9.818z"/></svg>
                    WhatsApp Support
                </a>
            </div>
        </div>
    </aside>

    <!-- ── CONTENT ── -->
    <div class="dash-content">

        <!-- ════ BOOKINGS TAB ════ -->
        <div id="tab-bookings" class="tab-panel">
            <div class="content-card">
                <div class="card-header">
                    <div class="card-title">
                        <div class="card-title-icon" style="background:rgba(37,99,235,0.1);">📋</div>
                        Booking History
                    </div>
                    <a href="/" style="font-size:0.8rem; font-weight:700; color:var(--blue); text-decoration:none;">+ New Booking</a>
                </div>
                <div class="card-body">
                <?php if (empty($bookings)): ?>
                    <div class="empty-state">
                        <div class="empty-icon">🚗</div>
                        <p>No bookings yet. Ready for your first trip?</p>
                        <div style="display:flex; justify-content:center; gap:0.75rem; flex-wrap:wrap;">
                            <a href="/" class="empty-cta">
                                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                                Book a Ride Now
                            </a>
                            <a href="<?php echo htmlspecialchars($waHref); ?>" target="_blank" class="empty-cta" style="background:#16a34a; box-shadow:0 4px 14px rgba(22,163,74,0.2);">
                                <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="margin-right:2px;"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.999 0C5.373 0 0 5.373 0 12c0 2.118.554 4.107 1.523 5.83L.057 23.98l6.306-1.434A11.95 11.95 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 11.999 0zm.001 21.818a9.818 9.818 0 0 1-5.001-1.373l-.36-.214-3.722.847.86-3.636-.235-.374A9.817 9.817 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182c5.431 0 9.818 4.388 9.818 9.818 0 5.431-4.388 9.818-9.818 9.818z"/></svg>
                                WhatsApp Support
                            </a>
                        </div>
                    </div>
                <?php else: ?>
                    <?php foreach ($bookings as $b):
                        $status    = $b['status'] ?? 'pending';
                        $statusCls = 'status-' . $status;
                        $pillCls   = 'pill-' . $status;
                        $pillText  = ucfirst($status);
                        $bId       = $b['booking_id'] ?: 'DC-'.$b['id'];
                        $phone     = $b['customer_phone'] ?? $displayPhone;
                        $trackUrl  = '/pages/track-booking.php?booking_id='.urlencode($bId).'&phone='.urlencode($phone);
                        $tyUrl     = '/pages/thank-you.php?booking_id='.urlencode($bId).'&view=details';
                        $dateStr   = '';
                        if (!empty($b['pickup_date'])) {
                            $d = DateTime::createFromFormat('Y-m-d', $b['pickup_date']);
                            $dateStr = $d ? $d->format('d M Y') : $b['pickup_date'];
                        }
                    ?>
                        <div class="booking-card <?php echo $statusCls; ?>">
                            <div>
                                <div class="booking-route">
                                <?php echo htmlspecialchars($b['pickup_location'] ?? 'Pickup'); ?>
                                <span class="arrow">→</span>
                                <?php echo htmlspecialchars($b['drop_location'] ?? 'Drop'); ?>
                            </div>
                            <div class="booking-meta">
                                <?php if ($dateStr): ?>
                                <span>
                                    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                    <?php echo $dateStr; ?><?php if (!empty($b['pickup_time'])): ?>, <?php echo htmlspecialchars($b['pickup_time']); ?><?php endif; ?>
                                </span>
                                <?php endif; ?>
                                <span>
                                    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                                    <?php echo htmlspecialchars($bId); ?>
                                </span>
                                <?php if (!empty($b['car_name'])): ?>
                                <span>🚖 <?php echo htmlspecialchars(strtoupper($b['car_name'])); ?></span>
                                <?php endif; ?>
                            </div>
                        </div>
                        <div class="booking-right">
                            <span class="pill <?php echo $pillCls; ?>"><?php echo $pillText; ?></span>
                            <div class="booking-fare">₹<?php echo number_format($b['final_fare'] ?: 0); ?></div>
                            <div class="booking-actions">
                                <a href="<?php echo htmlspecialchars($trackUrl); ?>" class="bk-btn bk-btn-blue">
                                    <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
                                    Track
                                </a>
                                <a href="<?php echo htmlspecialchars($tyUrl); ?>" class="bk-btn bk-btn-gold">
                                    <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                    Details
                                </a>
                                <a href="<?php echo htmlspecialchars($tyUrl); ?>&print=1" target="_blank" class="bk-btn" style="background:rgba(2,132,199,0.12); color:#0284c7;">
                                    📄 Receipt
                                </a>
                                <?php $isGstPaid = !empty($b['is_gst']) || !empty($b['gst_amount']); ?>
                                <?php if ($isGstPaid): ?>
                                    <a href="/pages/invoice-gst.php?booking_id=<?php echo urlencode($bId); ?>" target="_blank" class="bk-btn" style="background:rgba(16,185,129,0.12); color:#059669;">
                                        🧾 GST Invoice
                                    </a>
                                <?php else: ?>
                                    <button onclick="openGstModal('<?php echo htmlspecialchars($bId, ENT_QUOTES); ?>', <?php echo (float)($b['final_fare'] ?: 0); ?>)" class="bk-btn" style="background:rgba(245,158,11,0.12); color:#b45309; border:none; cursor:pointer;" title="Pay 5% GST to generate Tax Invoice">
                                        🧾 GST Invoice
                                    </button>
                                <?php endif; ?>
                                <?php if ($_advEnabled && in_array($status, ['pending','confirmed'])): ?>
                                <?php
                                    $bFare      = (float)($b['final_fare'] ?? 0);
                                    $bCalcAdv   = (int)ceil($bFare * $_advPercent / 100);
                                    $bAdvAmt    = max($_advMin, $bCalcAdv);
                                    $bUpiLink   = 'upi://pay?pa='.urlencode($_advUpiId).'&pn=Drop%20Cars&cu=INR&am='.$bAdvAmt.'&tn=Advance%20'.urlencode($bId);
                                ?>
                                <button onclick="openAdvanceModal('<?php echo htmlspecialchars($bId,ENT_QUOTES); ?>','<?php echo $bAdvAmt; ?>','<?php echo htmlspecialchars($bUpiLink,ENT_QUOTES); ?>')" class="bk-btn" style="background:rgba(245,158,11,0.12);color:#b45309;border:none;cursor:pointer;">
                                    <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                                    Pay Advance
                                </button>
                                <?php endif; ?>
                            </div>
                        </div>
                        
                        <!-- Stepper Tracker (Span full width) -->
                        <?php if ($status !== 'cancelled'): ?>
                        <div class="booking-tracker-wrap">
                            <div class="booking-tracker">
                                <div class="tracker-step <?php echo in_array($status, ['pending', 'confirmed', 'completed']) ? 'active' : ''; ?>">
                                    <div class="step-dot">✓</div>
                                    <div class="step-label">Requested</div>
                                </div>
                                <div class="tracker-line <?php echo in_array($status, ['confirmed', 'completed']) ? 'active' : ''; ?>"></div>
                                <div class="tracker-step <?php echo in_array($status, ['confirmed', 'completed']) ? 'active' : ''; ?>">
                                    <div class="step-dot"><?php echo in_array($status, ['confirmed', 'completed']) ? '✓' : '2'; ?></div>
                                    <div class="step-label">Confirmed</div>
                                </div>
                                <div class="tracker-line <?php echo ($status === 'completed') ? 'active' : ''; ?>"></div>
                                <div class="tracker-step <?php echo ($status === 'completed') ? 'active' : ''; ?>">
                                    <div class="step-dot"><?php echo ($status === 'completed') ? '✓' : '3'; ?></div>
                                    <div class="step-label">Completed</div>
                                </div>
                            </div>
                        </div>
                        <?php endif; ?>

                    </div>
                    <?php endforeach; ?>
                <?php endif; ?>
                </div>
            </div>
        </div>

        <!-- ════ REVIEWS TAB ════ -->
        <div id="tab-reviews" class="tab-panel" style="display:none;">
            <div class="content-card">
                <div class="card-header">
                    <div class="card-title">
                        <div class="card-title-icon" style="background:rgba(245,158,11,0.12);">⭐</div>
                        Your Reviews
                    </div>
                </div>
                <div class="card-body">
                    <!-- Submit review form -->
                    <div class="review-form-wrap">
                        <div style="font-size:0.9rem; font-weight:800; color:var(--text); font-family:'Outfit',sans-serif; margin-bottom:0.15rem;">Rate Your Experience</div>
                        <div style="font-size:0.75rem; color:var(--muted); margin-bottom:0.5rem;">Help others by sharing feedback on your trip.</div>
                        <form id="review-form" method="POST" action="/api/submit-review.php">
                            <input type="hidden" name="customer_phone" value="<?php echo htmlspecialchars($displayPhone); ?>">
                            <input type="hidden" id="star-rating-hidden" name="rating" value="0">
                            <div style="font-size:0.75rem; font-weight:600; color:var(--muted);">Tap to rate:</div>
                            <div class="star-row" id="star-row">
                                <?php for ($s = 1; $s <= 5; $s++): ?>
                                <button type="button" class="star-btn" data-star="<?php echo $s; ?>" aria-label="<?php echo $s; ?> star">★</button>
                                <?php endfor; ?>
                            </div>
                            <textarea class="review-textarea" name="comment" id="review-comment" placeholder="Share your experience..."></textarea>
                            <div id="review-msg" style="font-size:0.8rem; margin-top:0.4rem; display:none;"></div>
                            <button type="submit" class="review-submit">
                                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                                Submit Review
                            </button>
                        </form>
                    </div>

                    <?php if (empty($reviews)): ?>
                        <div class="empty-state" style="padding:1.5rem 1rem;">
                            <div class="empty-icon">💬</div>
                            <p>You haven't shared any reviews yet. Your feedback helps us improve!</p>
                        </div>
                    <?php else: ?>
                        <?php foreach ($reviews as $r): ?>
                        <div class="review-card">
                            <div class="review-stars"><?php echo str_repeat('★', (int)$r['rating']); ?><?php echo str_repeat('☆', 5-(int)$r['rating']); ?></div>
                            <p>"<?php echo htmlspecialchars($r['comment'] ?? ''); ?>"</p>
                            <div class="review-card-meta">
                                <?php if (!empty($r['trip_route'])): ?><?php echo htmlspecialchars($r['trip_route']); ?> &nbsp;·&nbsp; <?php endif; ?>
                                <?php echo !empty($r['created_at']) ? date('d M Y', strtotime($r['created_at'])) : ''; ?>
                            </div>
                        </div>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </div>
            </div>
        </div>

        <!-- ════ REFERRAL TAB ════ -->
        <div id="tab-referral" class="tab-panel" style="display:none;">
            <?php 
            $userRefCode = htmlspecialchars($customer['referral_code'] ?? 'DCFT100'); 
            ?>
            <div class="referral-card">
                <div class="referral-inner">
                    <div style="font-size:0.72rem; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:rgba(255,255,255,0.55); margin-bottom:0.3rem;">Your Exclusive Code</div>
                    <div style="font-size:1.3rem; font-weight:900; font-family:'Outfit',sans-serif; color:#fff; margin-bottom:0.3rem;">Loyalty &amp; Referral Rewards 🎁</div>
                    <p style="font-size:0.82rem; color:rgba(255,255,255,0.7); margin:0; line-height:1.55;">Share your code with friends! They get <strong style="color:var(--gold);">₹100 off</strong> their first trip — and you earn exclusive booking rewards.</p>
                    <div class="referral-code-row">
                        <span class="referral-code" id="referral-code-display"><?php echo $userRefCode; ?></span>
                        <button class="copy-code-btn" onclick="copyCode('<?php echo $userRefCode; ?>')">COPY</button>
                    </div>
                    <p id="copy-msg">✅ Copied to clipboard!</p>
                    <div style="display:flex; flex-wrap:wrap; gap:0.75rem;">
                        <div style="background:rgba(255,255,255,0.1); border-radius:12px; padding:0.75rem 1rem; flex:1; min-width:110px;">
                            <div style="font-size:1.4rem; font-weight:900; font-family:'Outfit',sans-serif; color:#fbbf24;"><?php echo $completedCount; ?></div>
                            <div style="font-size:0.7rem; color:rgba(255,255,255,0.85); font-weight:600; text-transform:uppercase; letter-spacing:0.05em;">Trips Completed</div>
                        </div>
                        <div style="background:rgba(255,255,255,0.1); border-radius:12px; padding:0.75rem 1rem; flex:1; min-width:110px;">
                            <div style="font-size:1.4rem; font-weight:900; font-family:'Outfit',sans-serif; color:#6ee7b7;">₹<?php echo $totalSpent >= 1000 ? number_format($totalSpent/1000,1).'K' : number_format($totalSpent); ?></div>
                            <div style="font-size:0.7rem; color:rgba(255,255,255,0.85); font-weight:600; text-transform:uppercase; letter-spacing:0.05em;">Total Saved / Spent</div>
                        </div>
                        <div style="background:rgba(255,255,255,0.12); border-radius:12px; padding:0.75rem 1rem; flex:1; min-width:150px; display:flex; flex-direction:column; justify-content:space-between; border:1px solid rgba(255,255,255,0.3);">
                            <div>
                                <div style="font-size:1.4rem; font-weight:900; font-family:'Outfit',sans-serif; color:#ffffff; text-shadow: 0 2px 8px rgba(0,0,0,0.2);">₹<?php echo number_format((float)($customer['referral_balance'] ?? 0.00), 2); ?></div>
                                <div style="font-size:0.7rem; color:rgba(255,255,255,0.9); font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom: 0.25rem;">Claimable Balance</div>
                            </div>
                            <?php if ((float)($customer['referral_balance'] ?? 0) > 0): ?>
                                <form method="POST" action="" style="margin-top:0.4rem;">
                                    <input type="hidden" name="action" value="redeem_rewards">
                                    <button type="submit" style="background:var(--gold); color:#000; border:none; width:100%; padding:0.4rem; border-radius:8px; font-weight:800; font-size:0.68rem; font-family:'Outfit'; cursor:pointer; transition:transform 0.1s;" onclick="return confirm('Do you want to redeem your reward balance of ₹<?php echo number_format((float)($customer['referral_balance'] ?? 0), 0); ?> now?')">REDEEM NOW ➔</button>
                                </form>
                            <?php else: ?>
                                <div style="font-size:0.6rem; color:rgba(255,255,255,0.4); font-style:italic; margin-top:0.4rem; text-align:center;">Share code to earn balance!</div>
                            <?php endif; ?>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ─── ATTRACTIVE VOUCHER POSTER ─── -->
            <div class="content-card" style="margin-top:1.5rem;">
                <div class="card-header">
                    <div class="card-title">
                        <div class="card-title-icon" style="background:rgba(245, 158, 11, 0.12);">🎟️</div>
                        Your Shareable Gift Voucher
                    </div>
                </div>
                <div class="card-body" style="padding: 1.25rem;">
                    <!-- Voucher ticket -->
                    <div class="digital-voucher">
                        <div class="digital-voucher-circle digital-voucher-circle-left"></div>
                        <div class="digital-voucher-circle digital-voucher-circle-right"></div>
                        
                        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.15); padding-bottom:0.75rem; margin-bottom:1rem; z-index:3; position:relative;">
                            <span style="font-family:'Outfit'; font-weight:900; font-size:1.2rem; color:#fff; letter-spacing:0.5px;">🚗 DROP CARS</span>
                            <span style="font-size:0.65rem; font-weight:800; background:var(--gold); color:#000; padding:4px 10px; border-radius:30px; font-family:'Outfit'; text-transform:uppercase; letter-spacing:0.5px;">Gift Voucher</span>
                        </div>
                        
                        <div style="text-align:center; margin:1.25rem 0; z-index:3; position:relative;">
                            <div style="font-size:0.75rem; font-weight:700; letter-spacing:0.12em; color:rgba(255,255,255,0.65); text-transform:uppercase;">EXCLUSIVE REFERRAL OFFER</div>
                            <div style="font-size:2.2rem; font-weight:900; font-family:'Outfit'; color:var(--gold); margin:0.2rem 0; line-height:1.1; text-shadow:0 4px 15px rgba(245,158,11,0.25);">₹100 DISCOUNT</div>
                            <div style="font-size:0.8rem; color:rgba(255,255,255,0.75); font-weight:500;">Valid on your friend's first premium trip!</div>
                        </div>
                        
                        <div style="background:rgba(255,255,255,0.06); border:1px dashed rgba(255,255,255,0.2); border-radius:12px; padding:0.85rem; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:0.25rem; z-index:3; position:relative;">
                            <span style="font-size:0.65rem; font-weight:600; color:rgba(255,255,255,0.5); text-transform:uppercase; letter-spacing:0.5px;">Voucher Code</span>
                            <strong style="font-size:1.5rem; font-weight:900; color:#fff; letter-spacing:3px; font-family:'Outfit'; text-shadow:0 2px 5px rgba(0,0,0,0.3);"><?php echo $userRefCode; ?></strong>
                        </div>
                        
                        <div style="text-align:center; margin-top:1.1rem; font-size:0.65rem; color:rgba(255,255,255,0.45); font-weight:500; z-index:3; position:relative;">
                            ⚡ Auto-applies ₹100 discount when they click your invite link!
                        </div>
                    </div>
                    
                    <!-- Share invite actions -->
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem;">
                        <button onclick="shareInvite('whatsapp')" style="display:flex; align-items:center; justify-content:center; gap:0.45rem; background:#16a34a; color:#fff; border:none; border-radius:12px; padding:0.85rem 0.5rem; font-weight:800; font-family:'Outfit'; cursor:pointer; font-size:0.82rem; box-shadow:0 4px 14px rgba(22,163,74,0.22); transition:transform 0.15s, background 0.15s;" onmouseover="this.style.transform='translateY(-1px)'" onmouseout="this.style.transform='none'">
                            <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24" style="margin-top:-1px;"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.999 0C5.373 0 0 5.373 0 12c0 2.118.554 4.107 1.523 5.83L.057 23.98l6.306-1.434A11.95 11.95 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 11.999 0zm.001 21.818a9.818 9.818 0 0 1-5.001-1.373l-.36-.214-3.722.847.86-3.636-.235-.374A9.817 9.817 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182c5.431 0 9.818 4.388 9.818 9.818 0 5.431-4.388 9.818-9.818 9.818z"/></svg>
                            WhatsApp Share
                        </button>
                        <button onclick="shareInvite('native')" style="display:flex; align-items:center; justify-content:center; gap:0.45rem; background:var(--blue); color:#fff; border:none; border-radius:12px; padding:0.85rem 0.5rem; font-weight:800; font-family:'Outfit'; cursor:pointer; font-size:0.82rem; box-shadow:0 4px 14px rgba(37,99,235,0.22); transition:transform 0.15s, background 0.15s;" onmouseover="this.style.transform='translateY(-1px)'" onmouseout="this.style.transform='none'">
                            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="margin-top:-1px;"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                            Share Invite
                        </button>
                    </div>
                </div>
            </div>

            <!-- ─── LOYALTY MILESTONES ─── -->
            <div class="content-card" style="margin-top:1.5rem;">
                <div class="card-header">
                    <div class="card-title">
                        <div class="card-title-icon" style="background:rgba(245, 158, 11, 0.12);">🏆</div>
                        Loyalty &amp; Milestones
                    </div>
                </div>
                <div class="card-body">
                    <?php
                    $tripsNeededForNext = 5;
                    $currentLevel = 'Silver Rider';
                    $nextLevel = 'Gold Rider';
                    $rewardDiscount = '₹200 Coupon';
                    
                    if ($completedCount >= 10) {
                        $currentLevel = 'Elite Member';
                        $nextLevel = 'Legend Rider';
                        $tripsNeededForNext = 25;
                        $rewardDiscount = '₹500 Coupon';
                    } elseif ($completedCount >= 5) {
                        $currentLevel = 'Gold Rider';
                        $nextLevel = 'Elite Member';
                        $tripsNeededForNext = 10;
                        $rewardDiscount = '₹350 Coupon';
                    }
                    
                    $tripsProgress = $completedCount;
                    $targetTrips = $tripsNeededForNext;
                    $percentProgress = min(100, round(($tripsProgress / $targetTrips) * 100));
                    ?>
                    <div style="margin-bottom:1rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem; flex-wrap:wrap; gap:0.5rem;">
                            <div style="font-size:0.85rem; font-weight:800; color:var(--text);">Current Level: <span style="color:var(--gold); font-family:'Outfit';"><?php echo $currentLevel; ?></span></div>
                            <div style="font-size:0.72rem; color:var(--muted); font-weight:700;">Next Level: <?php echo $nextLevel; ?></div>
                        </div>
                        
                        <!-- Progress Bar -->
                        <div style="width:100%; height:10px; background:#e2e8f0; border-radius:10px; overflow:hidden; position:relative; margin:0.6rem 0;">
                            <div style="width:<?php echo $percentProgress; ?>%; height:100%; background:linear-gradient(90deg, var(--blue) 0%, #3b82f6 100%); border-radius:10px; transition:width 0.8s ease;"></div>
                        </div>
                        
                        <div style="display:flex; justify-content:space-between; font-size:0.7rem; font-weight:600; color:var(--muted);">
                            <span><?php echo $tripsProgress; ?> / <?php echo $targetTrips; ?> Trips Completed</span>
                            <span><?php echo $percentProgress; ?>% to Next Level</span>
                        </div>
                    </div>
                    
                    <div style="background:rgba(37,99,235,0.05); border:1px solid rgba(37,99,235,0.12); border-radius:12px; padding:0.85rem; display:flex; gap:0.75rem; align-items:center;">
                        <div style="font-size:1.4rem; flex-shrink:0;">🎉</div>
                        <div style="font-size:0.78rem; line-height:1.45; color:var(--text);">
                            Complete <strong><?php echo max(1, $targetTrips - $tripsProgress); ?> more trips</strong> to unlock the <strong><?php echo $nextLevel; ?></strong> badge and receive a <strong><?php echo $rewardDiscount; ?></strong> on your next ride!
                        </div>
                    </div>
                </div>
            </div>

            <?php if (!empty($redeemMsg)): ?>
                <div style="background:<?php echo $redeemType === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'; ?>; border:1px solid <?php echo $redeemType === 'success' ? '#10b981' : '#ef4444'; ?>; border-radius:14px; padding:1rem; margin-top:1rem; color:var(--text); font-size:0.85rem; font-weight:600;">
                    <?php echo $redeemMsg; ?>
                </div>
            <?php endif; ?>

            <?php if (!empty($claims)): ?>
            <div class="content-card" style="margin-top:1.5rem;">
                <div class="card-header">
                    <div class="card-title">
                        <div class="card-title-icon" style="background:rgba(245,158,11,0.1);">🎟</div>
                        Your Claimed Redeem Codes
                    </div>
                </div>
                <div class="card-body" style="padding: 1rem;">
                    <div style="display:flex; flex-direction:column; gap:0.75rem;">
                        <?php foreach ($claims as $c): ?>
                            <div style="background:rgba(15,23,42,0.02); border:1px solid rgba(148,163,184,0.1); border-radius:12px; padding:0.75rem 1rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
                                <div>
                                    <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.15rem;">
                                        <span style="font-family:'Outfit',monospace; font-size:0.95rem; font-weight:800; color:var(--text); letter-spacing:0.5px;"><?php echo htmlspecialchars($c['redeem_code']); ?></span>
                                        <button onclick="navigator.clipboard.writeText('<?php echo htmlspecialchars($c['redeem_code']); ?>'); alert('Claim code copied!');" style="background:none; border:none; color:var(--muted); cursor:pointer; font-size:0.8rem; padding:2px;" title="Copy Code">📋</button>
                                    </div>
                                    <div style="font-size:0.7rem; color:var(--muted); font-weight:500;">Created on <?php echo date('d M Y, h:i A', strtotime($c['created_at'])); ?></div>
                                </div>
                                <div style="text-align:right;">
                                    <div style="font-size:1.05rem; font-weight:800; color:#10b981; font-family:'Outfit';">₹<?php echo number_format($c['amount'], 2); ?></div>
                                    <span style="display:inline-block; font-size:0.6rem; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; padding:2px 6px; border-radius:4px; <?php echo $c['status'] === 'claimed' ? 'background:#d1e7dd; color:#0f5132;' : 'background:#fff3cd; color:#664d03;'; ?>">
                                        <?php echo $c['status'] === 'claimed' ? 'Claimed' : 'Pending Verification'; ?>
                                    </span>
                                    <?php if ($c['status'] === 'pending'): ?>
                                    <br>
                                    <a href="/?coupon=<?php echo urlencode($c['redeem_code']); ?>" style="display:inline-block; text-decoration:none; background:var(--blue); color:#fff; font-size:0.6rem; font-weight:800; padding:4px 8px; border-radius:6px; margin-top:0.35rem; font-family:'Outfit'; text-transform:uppercase; transition:all 0.2s;" onmouseover="this.style.background='var(--blue-dk)'" onmouseout="this.style.background='var(--blue)'">Use Coupon ➔</a>
                                    <?php endif; ?>
                                </div>
                            </div>
                        <?php endforeach; ?>
                    </div>
                </div>
            </div>
            <?php endif; ?>

            <div class="content-card" style="margin-top:1.5rem;">
                <div class="card-header">
                    <div class="card-title">
                        <div class="card-title-icon" style="background:rgba(139,92,246,0.1);">📦</div>
                        How Rewards Work
                    </div>
                </div>
                <div class="card-body">
                    <div style="display:flex; flex-direction:column; gap:1rem;">
                        <?php foreach ([
                            ['🎯','Share Your Code','Give your referral code ' . $userRefCode . ' to friends who haven\'t used Drop Cars yet.'],
                            ['🎉','They Get ₹100','Your friend receives ₹100 in their rewards wallet when they register using your code.'],
                            ['💎','You Earn Rewards','For every successful referral, you also earn ₹100 rewards added to your dashboard balance.'],
                        ] as [$ic,$title,$desc]): ?>
                        <div style="display:flex; gap:0.85rem; align-items:flex-start;">
                            <div style="width:40px;height:40px;border-radius:12px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;"><?php echo $ic; ?></div>
                            <div>
                                <strong style="display:block;font-size:0.9rem;font-family:'Outfit',sans-serif;color:var(--text);margin-bottom:0.15rem;"><?php echo $title; ?></strong>
                                <p style="margin:0;font-size:0.8rem;color:var(--muted);line-height:1.5;"><?php echo $desc; ?></p>
                            </div>
                        </div>
                        <?php endforeach; ?>
                    </div>
                </div>
            </div>
        </div>

    </div><!-- /.dash-content -->
</div><!-- /.dash-body -->

<?php echo $shell->renderFooter(); ?>
<?php echo $shell->renderScripts(); ?>

<?php if ($_advEnabled): ?>
<!-- ═══ ADVANCE PAYMENT MODAL (Dashboard) ═══════════════════════════ -->
<div id="dash-adv-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:9999;align-items:center;justify-content:center;padding:1rem;" onclick="closeDashAdv(event)">
    <div class="dash-adv-modal" style="background:#fff;border-radius:22px;padding:1.25rem 1.1rem 1.1rem;max-width:380px;width:100%;max-height:92vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.25);position:relative;" onclick="event.stopPropagation()">

        <div id="dadv-s1">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.6rem;">
                <div style="display:flex;align-items:center;gap:0.5rem;">
                    <div style="width:30px;height:30px;background:linear-gradient(135deg,#f59e0b,#fbbf24);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:0.9rem;box-shadow:0 3px 10px rgba(245,158,11,0.3);">💳</div>
                    <div>
                        <div style="font-family:'Outfit';font-size:0.95rem;font-weight:900;color:#0f172a;">Pay Advance</div>
                        <div style="font-size:0.65rem;color:#64748b;">Secure your booking slot</div>
                    </div>
                </div>
                <button onclick="closeDashAdvModal()" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:1rem;line-height:1;">&times;</button>
            </div>
            <div id="dadv-amount-chip" style="background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:14px;padding:0.6rem 0.85rem;margin-bottom:0.6rem;text-align:center;">
                <div style="font-size:0.55rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgba(0,0,0,0.55);margin-bottom:0.15rem;">Advance Amount</div>
                <div id="dadv-amount-display" style="font-size:1.85rem;font-weight:900;color:#000;font-family:'Outfit';line-height:1;">₹—</div>
            </div>
            <div style="text-align:center;background:#f8fafc;border-radius:12px;padding:0.6rem;margin-bottom:0.6rem;border:1px solid #e2e8f0;">
                <div style="font-size:0.58rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#64748b;margin-bottom:0.4rem;">📱 Scan with any UPI App</div>
                <div id="dadv-qr-canvas" style="display:inline-block;background:#fff;padding:4px;border-radius:6px;border:1.5px solid #e2e8f0;"></div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;background:#f8fafc;padding:0.45rem 0.65rem;border-radius:8px;border:1px dashed #e2e8f0;margin-bottom:0.6rem;">
                <div>
                    <div style="font-size:0.55rem;color:#64748b;font-weight:700;text-transform:uppercase;">UPI ID</div>
                    <div style="font-family:monospace;font-weight:700;color:#0f172a;font-size:0.76rem;"><?php echo htmlspecialchars($_advUpiId); ?></div>
                </div>
                <button onclick="copyDashUpi('<?php echo htmlspecialchars($_advUpiId,ENT_QUOTES); ?>')" id="dash-copy-upi" style="background:rgba(37,99,235,0.08);border:none;cursor:pointer;color:#2563eb;padding:0.25rem 0.5rem;border-radius:6px;font-size:0.65rem;font-weight:700;">Copy</button>
            </div>
            <?php if ($_advNote): ?>
            <div style="font-size:0.65rem;color:#64748b;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.18);border-radius:8px;padding:0.4rem 0.65rem;margin-bottom:0.6rem;line-height:1.35;">ℹ️ <?php echo htmlspecialchars($_advNote); ?></div>
            <?php endif; ?>
            <a id="dadv-upi-link" href="#" onclick="onDashUpiOpen()" style="display:flex;align-items:center;justify-content:center;gap:0.5rem;margin-bottom:0.4rem;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;padding:0.65rem;border-radius:10px;font-weight:800;text-decoration:none;font-family:'Outfit';box-shadow:0 4px 18px rgba(37,99,235,0.3);font-size:0.85rem;">
                <svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                Open UPI Payment App
            </a>
            <div style="font-size:0.62rem;color:#94a3b8;text-align:center;margin-bottom:0.2rem;">We'll auto-detect payment when you return ✦</div>
        </div>

        <!-- Step 2: Waiting -->
        <div id="dadv-s2" style="display:none;text-align:center;padding:0.25rem 0;">
            <div style="position:relative;width:64px;height:64px;margin:0 auto 1rem;">
                <div style="width:64px;height:64px;border:3px solid rgba(37,99,235,0.12);border-top-color:#2563eb;border-radius:50%;animation:spin 1s linear infinite;position:absolute;inset:0;"></div>
                <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:1.6rem;">🔒</div>
            </div>
            <div style="font-size:0.95rem;font-weight:900;font-family:'Outfit';color:#0f172a;margin-bottom:0.25rem;">Waiting for Payment…</div>
            <div style="font-size:0.75rem;color:#64748b;line-height:1.45;margin-bottom:0.85rem;">Complete payment in your UPI app.<br>We'll auto-detect when you're done.</div>
            <div style="display:flex;align-items:center;justify-content:center;gap:5px;margin-bottom:0.85rem;">
                <div style="width:8px;height:8px;background:#2563eb;border-radius:50%;animation:dotPulse 1.2s ease-in-out infinite;"></div>
                <div style="width:8px;height:8px;background:#2563eb;border-radius:50%;animation:dotPulse 1.2s ease-in-out 0.2s infinite;"></div>
                <div style="width:8px;height:8px;background:#2563eb;border-radius:50%;animation:dotPulse 1.2s ease-in-out 0.4s infinite;"></div>
            </div>
            <button onclick="onDashPaid()" style="width:100%;padding:0.65rem;background:rgba(16,185,129,0.1);color:#059669;border:1.5px solid rgba(16,185,129,0.3);border-radius:12px;font-weight:700;font-size:0.78rem;font-family:'Outfit';cursor:pointer;">✅ I've Paid — Notify Team</button>
            <button onclick="showDadvStep(1)" style="background:none;border:none;color:#94a3b8;font-size:0.7rem;cursor:pointer;margin-top:0.4rem;text-decoration:underline;">← Go Back</button>
        </div>

        <!-- Step 3: Verifying -->
        <div id="dadv-s3" style="display:none;text-align:center;padding:1rem 0;">
            <div style="width:70px;height:70px;margin:0 auto 1.2rem;position:relative;">
                <svg viewBox="0 0 72 72" width="70" height="70" style="position:absolute;inset:0;animation:spin 2s linear infinite;">
                    <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(37,99,235,0.12)" stroke-width="5"/>
                    <circle cx="36" cy="36" r="30" fill="none" stroke="#2563eb" stroke-width="5" stroke-dasharray="60 130" stroke-linecap="round"/>
                </svg>
                <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:1.5rem;">🔍</div>
            </div>
            <div style="font-size:1.05rem;font-weight:900;font-family:'Outfit';color:#0f172a;margin-bottom:0.3rem;">Verifying Payment…</div>
            <div style="font-size:0.78rem;color:#64748b;">Notifying our team. Just a second.</div>
        </div>

        <!-- Step 4: Success -->
        <div id="dadv-s4" style="display:none;text-align:center;padding:0.5rem 0;">
            <div style="width:74px;height:74px;background:linear-gradient(135deg,#10b981,#059669);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 1.2rem;box-shadow:0 8px 28px rgba(5,150,105,0.3);animation:successPop 0.55s cubic-bezier(0.34,1.56,0.64,1) both;">
                <svg width="34" height="34" fill="none" stroke="#fff" stroke-width="3.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style="font-size:1.3rem;font-weight:900;font-family:'Outfit';color:#0f172a;margin-bottom:0.4rem;">Payment Notified! ⏳</div>
            <div style="font-size:0.82rem;color:#64748b;line-height:1.65;margin-bottom:1.2rem;">Our team has been notified of your payment. We will verify the transaction on our end and confirm your booking via WhatsApp shortly.</div>
            <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:12px;padding:0.9rem;margin-bottom:1.1rem;text-align:left;font-size:0.8rem;">
                <div style="font-weight:700;color:#059669;margin-bottom:0.5rem;">📋 Summary</div>
                <div style="display:flex;justify-content:space-between;margin-bottom:0.35rem;"><span style="color:#64748b;">Booking ID</span><strong id="dadv-success-id" style="font-family:monospace;">—</strong></div>
                <div style="display:flex;justify-content:space-between;"><span style="color:#64748b;">Advance Claimed</span><strong id="dadv-success-amount" style="color:#059669;">—</strong></div>
            </div>
            <button onclick="closeDashAdvModal()" style="width:100%;padding:0.9rem;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;border:none;border-radius:14px;font-weight:800;font-size:0.9rem;font-family:'Outfit';cursor:pointer;">Done ✓</button>
        </div>

        <!-- Step 5: Error -->
        <div id="dadv-s5" style="display:none;text-align:center;padding:1rem 0;">
            <div style="font-size:2.5rem;margin-bottom:1rem;">⚠️</div>
            <div style="font-size:1rem;font-weight:800;font-family:'Outfit';color:#0f172a;margin-bottom:0.5rem;">Connection Issue</div>
            <div style="font-size:0.8rem;color:#64748b;margin-bottom:1.2rem;line-height:1.6;">Your UPI payment was sent but we couldn't reach our server.<br>Please WhatsApp us your UPI reference.</div>
            <a href="https://wa.me/<?php echo preg_replace('/\D/','',($config['company']['whatsapp']??'917200217986')); ?>" target="_blank" style="display:flex;align-items:center;justify-content:center;gap:0.5rem;padding:0.85rem;background:#25d366;color:#fff;border-radius:12px;font-weight:700;text-decoration:none;font-family:'Outfit';margin-bottom:0.65rem;">
                <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.999 0C5.373 0 0 5.373 0 12c0 2.118.554 4.107 1.523 5.83L.057 23.98l6.306-1.434A11.95 11.95 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 11.999 0zm.001 21.818a9.818 9.818 0 0 1-5.001-1.373l-.36-.214-3.722.847.86-3.636-.235-.374A9.817 9.817 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182c5.431 0 9.818 4.388 9.818 9.818 0 5.431-4.388 9.818-9.818 9.818z"/></svg>
                WhatsApp Us
            </a>
            <button onclick="showDadvStep(1)" style="background:none;border:1px solid #e2e8f0;border-radius:10px;padding:0.6rem 1.2rem;color:#64748b;font-size:0.8rem;cursor:pointer;">← Try Again</button>
        </div>

    </div>
</div>

<style>
@keyframes spin       { to { transform:rotate(360deg); } }
@keyframes successPop { from{transform:scale(0.3);opacity:0} to{transform:scale(1);opacity:1} }
@keyframes dotPulse   { 0%,100%{opacity:.3;transform:scale(0.8)} 50%{opacity:1;transform:scale(1.2)} }
.dash-adv-modal {
    scrollbar-width: none; /* Hide scrollbar for Firefox */
    -ms-overflow-style: none; /* Hide scrollbar for IE/Edge */
}
.dash-adv-modal::-webkit-scrollbar {
    display: none; /* Hide scrollbar for Chrome, Safari, and Opera */
}
</style>

<script>
(function() {
    let _dBid='', _dAmt=0, _dUpiLink='', _dLaunched=false, _dHandled=false, _dTimer=null;
    const custName  = <?php echo json_encode($displayName); ?>;
    const custPhone = <?php echo json_encode($displayPhone); ?>;

    function showDadvStep(n) {
        [1,2,3,4,5].forEach(i => {
            const el = document.getElementById('dadv-s'+i);
            if(el) el.style.display = (i===n)?'':'none';
        });
    }

    function _genDadvQR(upiLink) {
        const canvas = document.getElementById('dadv-qr-canvas');
        if (!canvas) return;
        canvas.innerHTML = '<div style="width:140px;height:140px;display:flex;align-items:center;justify-content:center;"><div style="width:24px;height:24px;border:3px solid #e2e8f0;border-top-color:#2563eb;border-radius:50%;animation:spin 0.8s linear infinite;"></div></div>';
        const img = document.createElement('img');
        img.alt = 'UPI QR'; img.style.cssText = 'width:140px;height:140px;display:block;border-radius:4px;';
        img.onload  = function() { canvas.innerHTML = ''; canvas.appendChild(img); };
        img.onerror = function() { canvas.innerHTML = '<div style="width:140px;padding:0.5rem;font-size:0.7rem;color:#64748b;text-align:center;">QR unavailable<br>Use UPI ID below</div>'; };
        img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=140x140&ecc=M&data=' + encodeURIComponent(upiLink);
    }

    window.openAdvanceModal = function(bid, amt, link) {
        _dBid = bid; _dAmt = parseInt(amt,10); _dUpiLink = link;
        _dLaunched = false; _dHandled = false;
        document.getElementById('dadv-amount-display').textContent = '₹' + _dAmt.toLocaleString('en-IN');
        document.getElementById('dadv-upi-link').href = link;
        showDadvStep(1);
        _genDadvQR(link);
        const o = document.getElementById('dash-adv-overlay');
        o.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    };

    window.closeDashAdv = function(e) {
        if (e && e.target !== document.getElementById('dash-adv-overlay')) return;
        // Only close from backdrop if on step 1
        if (document.getElementById('dadv-s1').style.display !== 'none') closeDashAdvModal();
    };

    window.closeDashAdvModal = function() {
        document.getElementById('dash-adv-overlay').style.display = 'none';
        document.body.style.overflow = '';
        _cleanup();
    };

    window.showDadvStep = showDadvStep;

    function _cleanup() {
        document.removeEventListener('visibilitychange', _onVis);
        window.removeEventListener('pageshow', _onPS);
        if (_dTimer) { clearTimeout(_dTimer); _dTimer = null; }
    }

    function _onVis() {
        if (document.visibilityState==='visible' && _dLaunched && !_dHandled)
            setTimeout(_verify, 600);
    }
    function _onPS(e) {
        if (e.persisted && _dLaunched && !_dHandled) setTimeout(_verify, 600);
    }

    window.onDashUpiOpen = function() {
        _dLaunched = true;
        setTimeout(() => {
            const o = document.getElementById('dash-adv-overlay');
            if (o && o.style.display !== 'none') showDadvStep(2);
        }, 500);
        document.addEventListener('visibilitychange', _onVis);
        window.addEventListener('pageshow', _onPS);
        _dTimer = setTimeout(() => {
            if (!_dHandled) {
                const btn = document.querySelector('#dadv-s2 button');
                if (btn) { btn.style.background='rgba(16,185,129,0.2)'; btn.style.borderColor='#059669'; }
            }
        }, 90000);
        return true; // allow href to fire
    };

    function _verify() {
        if (_dHandled) return;
        _dHandled = true; _cleanup();
        showDadvStep(3);
        const fd = new FormData();
        fd.append('booking_id',    _dBid);
        fd.append('customer_name', custName);
        fd.append('customer_phone',custPhone);
        fd.append('amount',        _dAmt);
        fd.append('note',          'Dashboard advance payment — auto-detected on app return');
        const t0 = Date.now();
        fetch('/api/record-advance.php', {method:'POST', body:fd})
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(() => {
                const el = document.getElementById('dadv-success-id');
                const ea = document.getElementById('dadv-success-amount');
                if(el) el.textContent = _dBid;
                if(ea) ea.textContent = '₹' + _dAmt.toLocaleString('en-IN');
                setTimeout(() => showDadvStep(4), Math.max(0, 2000-(Date.now()-t0)));
            })
            .catch(() => setTimeout(() => showDadvStep(5), Math.max(0, 1500-(Date.now()-t0))));
    }

    window.onDashPaid = _verify;

    window.copyDashUpi = function(id) {
        const btn = document.getElementById('dash-copy-upi');
        if(navigator.clipboard) navigator.clipboard.writeText(id).then(()=>{
            if(btn){btn.textContent='Copied!';btn.style.color='#10b981';}
            setTimeout(()=>{if(btn){btn.textContent='Copy';btn.style.color='';}},2000);
        });
    };
})();
</script>
<?php endif; ?>

<script>
// ── Tab switching (syncs sidebar nav + mobile tab bar)
function switchTab(tab, el) {
    ['bookings','reviews','referral'].forEach(t => {
        const panel = document.getElementById('tab-' + t);
        if (panel) panel.style.display = t === tab ? 'block' : 'none';
    });
    // Sync sidebar (desktop)
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    const sideLink = document.querySelector('.sidebar-nav a[href="#' + tab + '"]');
    if (sideLink) sideLink.classList.add('active');
    // Sync mobile tab bar
    document.querySelectorAll('.mob-tab').forEach(b => b.classList.remove('active'));
    if (el && el.classList.contains('mob-tab')) {
        el.classList.add('active');
    } else {
        // Called from sidebar — find matching mob-tab by onclick text
        document.querySelectorAll('.mob-tab').forEach(b => {
            if (b.getAttribute('onclick')?.includes("'" + tab + "'")) b.classList.add('active');
        });
    }
    history.replaceState(null,'', '#' + tab);
}

// Read hash on load
(function() {
    const hash = location.hash.replace('#','');
    const valid = ['bookings','reviews','referral'];
    if (valid.includes(hash)) {
        switchTab(hash, document.querySelector('.sidebar-nav a[href="#'+hash+'"]'));
    }
})();

// ── Star rating
const stars   = document.querySelectorAll('.star-btn');
const ratingHidden = document.getElementById('star-rating-hidden');
let currentRating = 0;

stars.forEach(btn => {
    btn.addEventListener('mouseenter', () => {
        const v = +btn.dataset.star;
        stars.forEach(s => s.classList.toggle('lit', +s.dataset.star <= v));
    });
    btn.addEventListener('mouseleave', () => {
        stars.forEach(s => s.classList.toggle('lit', +s.dataset.star <= currentRating));
    });
    btn.addEventListener('click', () => {
        currentRating = +btn.dataset.star;
        if (ratingHidden) ratingHidden.value = currentRating;
        stars.forEach(s => s.classList.toggle('lit', +s.dataset.star <= currentRating));
    });
});

// ── Review form AJAX
const reviewForm = document.getElementById('review-form');
if (reviewForm) {
    reviewForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const msg = document.getElementById('review-msg');
        const btn = reviewForm.querySelector('.review-submit');
        if (+ratingHidden.value < 1) { 
            msg.style.display='block'; msg.style.color='#ef4444'; msg.textContent='Please select a star rating.'; return; 
        }
        btn.disabled = true; btn.textContent = 'Submitting…';
        fetch('/api/submit-review.php', { method:'POST', body: new FormData(reviewForm) })
          .then(r => r.json())
          .then(d => {
            if (d.success) {
                msg.style.display='block'; msg.style.color='#10b981';
                msg.textContent = '✅ Thank you for your review!';
                document.getElementById('review-comment').value = '';
                currentRating = 0; if (ratingHidden) ratingHidden.value = 0;
                stars.forEach(s => s.classList.remove('lit'));
            } else {
                msg.style.display='block'; msg.style.color='#ef4444';
                msg.textContent = d.message || 'Could not submit. Please try again.';
            }
          })
          .catch(() => { msg.style.display='block'; msg.style.color='#ef4444'; msg.textContent='Network error.'; })
          .finally(() => { btn.disabled=false; btn.innerHTML='<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Submit Review'; });
    });
}

// ── Copy referral code
function copyCode(code) {
    navigator.clipboard.writeText(code).then(() => {
        const m = document.getElementById('copy-msg');
        if (m) { m.style.display='block'; setTimeout(() => m.style.display='none', 2500); }
    });
}

// ── Share referral/gift invitation
window.shareInvite = function(method) {
    const userRefCode = <?php echo json_encode($userRefCode ?? 'DCFT100'); ?>;
    const inviteLink = window.location.origin + '/?coupon=' + encodeURIComponent(userRefCode);
    
    // Highly attractive and persuasive invitation, carefully formatted without emojis for perfect SMS/Email compatibility
    const textMsg = `EXPERIENCE PREMIUM TRAVEL WITH DROP CARS!\n\nYou have been specially invited to enjoy a safer, more comfortable ride.\n\nClaim your exclusive ₹100 welcome reward on your first booking! Whether it is an outstation journey or a local trip, ride with verified drivers, clean AC cabs, and zero hidden charges.\n\nYour Unique Gift Code: ${userRefCode}\n\nClick the link below to log in, claim your reward, and book your ride (the discount will be automatically applied at checkout):\n${inviteLink}\n\nExperience the Drop Cars difference today!`;
    
    if (method === 'whatsapp') {
        const url = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(textMsg);
        window.open(url, '_blank');
    } else {
        if (navigator.share) {
            // Attempt to fetch an attractive promotional image to attach to the share
            fetch('/assets/img/hero-premium-bg.png')
                .then(res => res.blob())
                .then(blob => {
                    const file = new File([blob], 'dropcars-invite.png', { type: 'image/png' });
                    const shareData = {
                        title: 'Drop Cars Invitation',
                        text: textMsg
                    };
                    
                    // Attach the image if the device supports sharing files
                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        shareData.files = [file];
                    }
                    
                    navigator.share(shareData).catch(() => {
                        navigator.clipboard.writeText(textMsg).then(() => alert('📋 Invitation message copied to clipboard! Share it with your friends.'));
                    });
                })
                .catch(() => {
                    // Fallback if image fetch fails
                    navigator.share({
                        title: 'Drop Cars Invitation',
                        text: textMsg
                    }).catch(() => {
                        navigator.clipboard.writeText(textMsg).then(() => alert('📋 Invitation message copied to clipboard! Share it with your friends.'));
                    });
                });
        } else {
            navigator.clipboard.writeText(textMsg).then(() => {
                alert('📋 Invitation message copied to clipboard! Share it with your friends.');
            });
        }
    }
};

// ── Filter Bookings from Stat Chips
window.filterBookings = function(type) {
    // 1. Switch to bookings tab if not already there
    const bookTabBtn = document.querySelector('a[href="#bookings"]') || document.querySelector('.mob-tab');
    if (bookTabBtn) {
        switchTab('bookings', bookTabBtn);
    }
    
    // 2. Scroll smoothly to the bookings section
    document.getElementById('tab-bookings').scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    // 3. Filter the cards
    const cards = document.querySelectorAll('.booking-card');
    cards.forEach(c => {
        if (type === 'all') {
            c.style.display = ''; // reset to default (flex/block)
        } else if (type === 'upcoming') {
            if (c.classList.contains('status-pending') || c.classList.contains('status-confirmed')) {
                c.style.display = '';
            } else {
                c.style.display = 'none';
            }
        } else if (type === 'history') {
            if (c.classList.contains('status-completed') || c.classList.contains('status-cancelled')) {
                c.style.display = '';
            } else {
                c.style.display = 'none';
            }
        }
    });
};

<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
/* ── GST Invoice Upgrade Modal Handler ── */
var _gstQuoteData = null;

window.openGstModal = function(bookingId, fareAmount) {
    var modal = document.getElementById('gst-invoice-modal');
    if (!modal) return;

    document.getElementById('gst-modal-booking-id').textContent = bookingId;
    document.getElementById('gst-hidden-booking-id').value = bookingId;
    document.getElementById('gst-modal-base-fare').textContent = 'Loading...';
    document.getElementById('gst-modal-tax-amount').textContent = 'Calculating...';
    document.getElementById('gst-modal-gateway-charge').textContent = 'Calculating...';
    document.getElementById('gst-modal-total-amount').textContent = 'Calculating...';
    
    var btn = document.getElementById('gst-modal-pay-btn');
    btn.disabled = true;
    btn.textContent = 'Calculating pure KM GST...';

    modal.style.display = 'flex';

    fetch('/api/pay-gst-invoice.php?action=quote&booking_id=' + encodeURIComponent(bookingId))
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                _gstQuoteData = data;
                document.getElementById('gst-modal-base-fare').textContent = '₹' + Number(data.km_fare).toLocaleString('en-IN');
                document.getElementById('gst-modal-tax-amount').textContent = '+₹' + Number(data.gst_amount).toLocaleString('en-IN') + ' (CGST 2.5% + SGST 2.5%)';
                document.getElementById('gst-modal-gateway-charge').textContent = '+₹' + Number(data.gateway_charge).toLocaleString('en-IN');
                document.getElementById('gst-modal-total-amount').textContent = '₹' + Number(data.total_upgrade_amount).toLocaleString('en-IN');
                btn.disabled = false;
                btn.textContent = 'Pay ₹' + data.total_upgrade_amount + ' & Unlock Tax Invoice';
            } else {
                alert(data.message || 'Could not calculate GST upgrade.');
                closeGstModal();
            }
        })
        .catch(function() {
            var fallbackTax = (fareAmount * 0.05).toFixed(2);
            document.getElementById('gst-modal-base-fare').textContent = '₹' + fareAmount.toLocaleString('en-IN');
            document.getElementById('gst-modal-tax-amount').textContent = '₹' + fallbackTax;
            document.getElementById('gst-modal-total-amount').textContent = '₹' + fallbackTax;
            btn.disabled = false;
            btn.textContent = 'Pay GST (₹' + fallbackTax + ') & Unlock Tax Invoice';
        });
};

window.closeGstModal = function() {
    var modal = document.getElementById('gst-invoice-modal');
    if (modal) modal.style.display = 'none';
};

window.submitGstUpgrade = function(e) {
    e.preventDefault();
    var btn = document.getElementById('gst-modal-pay-btn');
    var bId = document.getElementById('gst-hidden-booking-id').value;
    var company = document.getElementById('gst-company-name').value;
    var gstin = document.getElementById('gst-number').value;

    if (!_gstQuoteData || !_gstQuoteData.razorpay_order_id) {
        // Direct verify fallback
        btn.disabled = true;
        btn.textContent = 'Processing Payment...';
        fetch('/api/pay-gst-invoice.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'verify', booking_id: bId, company_name: company, gstin: gstin })
        })
        .then(r => r.json())
        .then(data => {
            if (data.success && data.redirect) {
                window.open(data.redirect, '_blank');
                closeGstModal();
                window.location.reload();
            } else {
                alert(data.message || 'Failed to process GST upgrade.');
                btn.disabled = false;
            }
        })
        .catch(() => { alert('Network error.'); btn.disabled = false; });
        return;
    }

    if (typeof Razorpay === 'undefined') {
        alert('Payment gateway script is loading. Please try again in a moment.');
        return;
    }

    var rzp = new Razorpay({
        key: _gstQuoteData.key_id || 'rzp_live_RuMG3DMZFdeT3Y',
        amount: _gstQuoteData.amount_paise,
        currency: 'INR',
        name: 'Drop Cars',
        description: 'GST Tax Invoice Upgrade (SAC 9964)',
        order_id: _gstQuoteData.razorpay_order_id,
        handler: function(response) {
            btn.disabled = true;
            btn.textContent = 'Verifying Payment & Issuing Invoice...';
            fetch('/api/pay-gst-invoice.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'verify',
                    booking_id: bId,
                    company_name: company,
                    gstin: gstin,
                    rp_order_id: response.razorpay_order_id || _gstQuoteData.razorpay_order_id,
                    rp_payment_id: response.razorpay_payment_id,
                    rp_signature: response.razorpay_signature
                })
            })
            .then(r => r.json())
            .then(data => {
                if (data.success && data.redirect) {
                    alert('GST Tax Invoice Unlocked! Opening official invoice...');
                    window.open(data.redirect, '_blank');
                    closeGstModal();
                    window.location.reload();
                } else {
                    alert(data.message || 'Payment received but verification failed. Please contact support.');
                    btn.disabled = false;
                }
            })
            .catch(() => {
                alert('Network error during verification.');
                btn.disabled = false;
            });
        },
        prefill: {
            contact: custPhone,
            name: custName
        },
        theme: { color: '#0284C7' }
    });

    rzp.open();
};
</script>

<!-- GST Invoice Upgrade Modal Sheet -->
<div id="gst-invoice-modal" style="display:none; position:fixed; inset:0; z-index:99999; background:rgba(15,23,42,0.7); backdrop-filter:blur(4px); align-items:center; justify-content:center; padding:1rem;">
    <div style="background:#ffffff; border-radius:20px; max-width:480px; width:100%; padding:1.75rem; box-shadow:0 25px 50px rgba(0,0,0,0.3); border:1px solid #cbd5e1; position:relative;">
        <button onclick="closeGstModal()" style="position:absolute; right:1.25rem; top:1.25rem; background:none; border:none; font-size:1.4rem; cursor:pointer; color:#64748b;">&times;</button>
        <div style="display:inline-block; background:rgba(16,185,129,0.12); color:#059669; font-size:0.75rem; font-weight:800; padding:0.25rem 0.75rem; border-radius:100px; text-transform:uppercase; margin-bottom:0.5rem;">🧾 Official GST Tax Invoice</div>
        <h3 style="font-size:1.3rem; font-weight:900; color:#0f172a; margin-bottom:0.25rem; font-family:'Outfit',sans-serif;">Add GST Invoice (+5%)</h3>
        <p style="font-size:0.82rem; color:#64748b; margin-bottom:1.25rem;">Unlock official tax invoice with GSTIN &amp; SAC 996412 breakdown for tax claims.</p>
        
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:0.85rem 1rem; margin-bottom:1.25rem; gap:6px; display:flex; flex-direction:column;">
            <div style="display:flex; justify-content:space-between; font-size:0.82rem; color:#64748b;">
                <span>Booking ID:</span>
                <strong id="gst-modal-booking-id" style="color:#0f172a;">-</strong>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.82rem; color:#64748b;">
                <span>Base KM Fare:</span>
                <strong id="gst-modal-base-fare" style="color:#0f172a;">-</strong>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.82rem; color:#0284c7; font-weight:600;">
                <span>GST Tax (5% on KM Fare):</span>
                <strong id="gst-modal-tax-amount">-</strong>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.78rem; color:#94a3b8;">
                <span>Driver Bata &amp; Tolls:</span>
                <span>₹0 (0% Non-Taxable)</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.82rem; color:#64748b;">
                <span>Gateway Convenience Fee (~2.4%):</span>
                <strong id="gst-modal-gateway-charge" style="color:#0f172a;">-</strong>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.95rem; color:#059669; font-weight:800; border-top:1px dashed #cbd5e1; padding-top:0.5rem; margin-top:2px;">
                <span>Total Amount to Pay:</span>
                <strong id="gst-modal-total-amount">-</strong>
            </div>
        </div>

        <form onsubmit="submitGstUpgrade(event)">
            <input type="hidden" id="gst-hidden-booking-id" value="">
            <div style="margin-bottom:0.85rem;">
                <label style="display:block; font-size:0.78rem; font-weight:700; color:#0f172a; margin-bottom:0.25rem;">Business / Company Name (Optional)</label>
                <input type="text" id="gst-company-name" placeholder="e.g. Acme Technologies Pvt Ltd" style="width:100%; padding:0.65rem 0.85rem; border:1px solid #cbd5e1; border-radius:10px; font-size:0.85rem; font-family:inherit; outline:none;">
            </div>
            <div style="margin-bottom:1.25rem;">
                <label style="display:block; font-size:0.78rem; font-weight:700; color:#0f172a; margin-bottom:0.25rem;">GSTIN Number (Optional for Tax Credit)</label>
                <input type="text" id="gst-number" placeholder="e.g. 33AAAAA0000A1Z5" style="width:100%; padding:0.65rem 0.85rem; border:1px solid #cbd5e1; border-radius:10px; font-size:0.85rem; font-family:inherit; text-transform:uppercase; outline:none;">
            </div>
            <button type="submit" id="gst-modal-pay-btn" style="width:100%; background:linear-gradient(135deg, #0284c7, #0369a1); color:#ffffff; border:none; padding:0.85rem; border-radius:12px; font-size:0.9rem; font-weight:800; font-family:'Outfit',sans-serif; cursor:pointer; box-shadow:0 4px 15px rgba(2,132,199,0.3);">
                Pay &amp; Unlock Tax Invoice
            </button>
        </form>
    </div>
</div>
</body>
</html>
