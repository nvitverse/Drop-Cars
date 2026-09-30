<?php
require_once __DIR__ . '/../includes/paths.php';
require_once __DIR__ . '/../engine/theme-engine.php';
require_once __DIR__ . '/../engine/shell.php';

$themeEngine = new ThemeEngine();
$activeTheme = $themeEngine->detectTheme();
$allThemes = $themeEngine->getAllThemes();
$shell = new UIShell($activeTheme, $allThemes);

$pageTitle = 'Payment Policy | Drop Cars';
$pageDesc = 'Learn about billing, payment options, and advance deposits for intercity rides and outstation drop cabs with Drop Cars.';
$canonical = function_exists('dropcars_canonical_request_url') ? dropcars_canonical_request_url() : "https://dropcars.in/pages/payment-policy.html";
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="<?php echo htmlspecialchars($pageDesc); ?>">
    <link rel="canonical" href="<?php echo $canonical; ?>">
    <title><?php echo $pageTitle; ?></title>
<?php dropcars_render_favicons($activeTheme['slug'] ?? null); ?>
    
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    
    <link rel="stylesheet" href="/assets/css/base.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/base.css'); ?>">
    <link rel="stylesheet" href="/assets/css/layout.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/layout.css'); ?>">
    <link rel="stylesheet" href="/assets/css/navbar.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/navbar.css'); ?>">
    <link rel="stylesheet" href="/assets/css/legal-pages.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/legal-pages.css'); ?>">
    <link rel="stylesheet" href="/assets/css/footer.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/footer.css'); ?>">
    <link rel="stylesheet" href="/assets/css/whatsapp.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/whatsapp.css'); ?>">
    <link rel="stylesheet" href="/assets/css/responsive.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/responsive.css'); ?>">
    <link rel="stylesheet" href="/assets/css/dark-mode.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/dark-mode.css'); ?>">
    <link rel="stylesheet" href="/assets/css/light-theme.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/light-theme.css'); ?>">
    <?php if (($activeTheme['slug'] ?? '') === 'airport-taxi'): ?>
    <link rel="stylesheet" href="/assets/css/theme-airporttaxi.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/theme-airporttaxi.css'); ?>">
    <?php endif; ?>
    <script src="/assets/js/dark-mode.js?v=<?php echo @filemtime(__DIR__ . '/../assets/js/dark-mode.js'); ?>"></script>
<?php include __DIR__ . '/../includes/google-tag.php'; ?>
</head>
<body class="<?php echo ($activeTheme['slug'] ?? '') === 'airport-taxi' ? ('theme-airporttaxi ' . (function_exists('dropcars_is_native_airporttaxi_host') && dropcars_is_native_airporttaxi_host() ? 'ati-native' : 'ati-embedded')) : ''; ?>">
    <?php echo $shell->renderHeader(); ?>

    <main class="legal-page">
        <div class="container">
            <div class="legal-hero">
                <span class="policy-badge">Billing Center</span>
                <h1>Payment Policy</h1>
                <p>Last updated: June 2026</p>
            </div>

            <div class="legal-card">
                <div class="legal-section">
                    <h2>1. Payment Methods</h2>
                    <p>We offer flexible and secure payment methods to make your intercity taxi travel smooth and hassle-free:</p>
                    <ul>
                        <li>Cash payment directly to the driver at the end of the trip.</li>
                        <li>Digital payments via UPI, Google Pay, PhonePe, or QR Code.</li>
                        <li>Online bank transfers for corporate bookings and advance bookings.</li>
                    </ul>
                </div>

                <div class="legal-section">
                    <h2>2. Advance Payments</h2>
                    <p>For specific high-demand routes, peak seasons, or multi-day customized round trips, a nominal advance payment may be required to guarantee and secure your vehicle block. Any required advance will be explicitly stated during booking, and a confirmation receipt will be shared via WhatsApp.</p>
                </div>

                <div class="legal-section">
                    <h2>3. Invoice and GST</h2>
                    <p>A digital itemized invoice detailing base fare, tolls (if inclusive), state border permits, and any extra mileage charges will be generated automatically and sent to your registered email and dashboard upon trip completion. Taxes (GST) are charged extra as per government regulations.</p>
                </div>
            </div>
        </div>
    </main>

    <?php echo $shell->renderFooter(); ?>
    <?php echo $shell->renderScripts(); ?>
</body>
</html>
