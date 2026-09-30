<?php
require_once __DIR__ . '/../includes/paths.php';
require_once __DIR__ . '/../engine/theme-engine.php';
require_once __DIR__ . '/../engine/shell.php';

$themeEngine = new ThemeEngine();
$activeTheme = $themeEngine->detectTheme();
$allThemes = $themeEngine->getAllThemes();
$shell = new UIShell($activeTheme, $allThemes);

$pageTitle = 'Privacy Policy | Drop Cars';
$pageDesc = 'Learn how Drop Cars collects, uses, and protects your personal information when you book our premium outstation taxi services.';
$canonical = function_exists('dropcars_canonical_request_url') ? dropcars_canonical_request_url() : "https://dropcars.in/pages/privacy.html";
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
                <span class="policy-badge">Policy Center</span>
                <h1>Privacy Policy</h1>
                <p>Last updated: June 2026</p>
            </div>

            <div class="legal-card">
                <div class="legal-section">
                    <h2>1. Information We Collect</h2>
                    <p>At Drop Cars, we are committed to protecting your privacy. When you book our outstation taxi services or intercity tourist cabs, we collect information that is necessary to facilitate your ride:</p>
                    <ul>
                        <li>Personal identification info: Name, email address, phone number.</li>
                        <li>Travel details: Pickup location, drop location, intermediate stops, date, and time.</li>
                        <li>Device and network information: IP address, browser type, and referrer logs for fraud prevention.</li>
                    </ul>
                </div>

                <div class="legal-section">
                    <h2>2. How We Use Your Information</h2>
                    <p>We use the collected information to deliver a safe, punctual, and reliable travel experience:</p>
                    <ul>
                        <li>Processing your booking request and providing instant confirmation via WhatsApp or email.</li>
                        <li>Dispatching driver and cab details (contact numbers, vehicle numbers) prior to pickup.</li>
                        <li>Providing customer support and real-time updates regarding your journey.</li>
                        <li>Optimizing our route allocations and fare estimates.</li>
                    </ul>
                </div>

                <div class="legal-section">
                    <h2>3. Data Protection and Security</h2>
                    <p>We implement robust security measures to prevent unauthorized access, alteration, disclosure, or destruction of your personal data. We do not sell or trade your personal information to third parties. We share details only with our verified driver partners assigned to fulfill your booking.</p>
                </div>
            </div>
        </div>
    </main>

    <?php echo $shell->renderFooter(); ?>
    <?php echo $shell->renderScripts(); ?>
</body>
</html>
