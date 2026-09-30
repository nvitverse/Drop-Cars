<?php
require_once __DIR__ . '/../includes/paths.php';
require_once __DIR__ . '/../engine/theme-engine.php';
require_once __DIR__ . '/../engine/shell.php';

$themeEngine = new ThemeEngine();
$activeTheme = $themeEngine->detectTheme();
$allThemes = $themeEngine->getAllThemes();
$shell = new UIShell($activeTheme, $allThemes);

$pageTitle = 'Cancellation & Refund Policy | Drop Cars';
$pageDesc = 'Understand our cancellation rules, refund timelines, and zero-fee policies for intercity outstation cabs and one-way drops.';
$canonical = function_exists('dropcars_canonical_request_url') ? dropcars_canonical_request_url() : "https://dropcars.in/pages/refund-policy.html";
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
                <span class="policy-badge">Refund Center</span>
                <h1>Cancellation & Refund Policy</h1>
                <p>Last updated: June 2026</p>
            </div>

            <div class="legal-card">
                <div class="legal-section">
                    <h2>1. Cancellation Policy</h2>
                    <p>We understand that travel plans can change. We offer a highly flexible cancellation policy:</p>
                    <ul>
                        <li>Cancellation is completely free of charge if requested at least 24 hours prior to the scheduled pickup time.</li>
                        <li>Cancellations made within 24 hours of the pickup time may attract a nominal cancellation fee to compensate our driver partner.</li>
                    </ul>
                </div>

                <div class="legal-section">
                    <h2>2. Refunds</h2>
                    <p>If you paid an advance deposit to secure your booking and cancelled in compliance with our policy:</p>
                    <ul>
                        <li>A full 100% refund of the advance amount will be initiated.</li>
                        <li>Refunds are processed back to the original payment source (UPI or Bank account) within 3 to 5 business days.</li>
                    </ul>
                </div>

                <div class="legal-section">
                    <h2>3. Ride Modifications</h2>
                    <p>You can modify your pickup time or travel date free of charge up to 12 hours before pickup, subject to vehicle availability. Contact our support team directly via WhatsApp to request modifications.</p>
                </div>
            </div>
        </div>
    </main>

    <?php echo $shell->renderFooter(); ?>
    <?php echo $shell->renderScripts(); ?>
</body>
</html>
