<?php
require_once __DIR__ . '/../includes/paths.php';
require_once __DIR__ . '/../engine/theme-engine.php';
require_once __DIR__ . '/../engine/shell.php';

$themeEngine = new ThemeEngine();
$activeTheme = $themeEngine->detectTheme();
$allThemes = $themeEngine->getAllThemes();
$shell = new UIShell($activeTheme, $allThemes);

$pageTitle = 'Terms & Conditions | Drop Cars';
$pageDesc = 'Review the terms and conditions for booking one-way drop taxis and outstation round-trip cabs with Drop Cars.';
$canonical = function_exists('dropcars_canonical_request_url') ? dropcars_canonical_request_url() : "https://dropcars.in/pages/terms.html";
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
                <span class="policy-badge">User Agreement</span>
                <h1>Terms & Conditions</h1>
                <p>Last updated: June 2026</p>
            </div>

            <div class="legal-card">
                <div class="legal-section">
                    <h2>1. Booking and Services</h2>
                    <p>By using the Drop Cars website or booking services, you agree to these Terms and Conditions. Our outstation taxi services are subject to vehicle availability and driver assignments.</p>
                    <ul>
                        <li>Bookings are confirmed instantly via WhatsApp, SMS, or email.</li>
                        <li>Vehicle models shown are illustrative; equivalent models within the selected category (Sedan, SUV, Innova) may be dispatched.</li>
                        <li>The service is strictly for intercity tourist travel and outstation drops.</li>
                    </ul>
                </div>

                <div class="legal-section">
                    <h2>2. Pricing and Fares</h2>
                    <p>We maintain transparent pricing. Depending on your choice during booking, the fare option is classified as follows:</p>
                    <ul>
                        <li><strong>Excludes Toll & Tax (Base Fare)</strong>: Base rate per KM + driver bata. Highway tolls, parking fees, and state border permit taxes are paid by the customer at actuals.</li>
                        <li><strong>Includes Toll & Tax (Inclusive Fare)</strong>: Includes base fare, tolls, and state border permits. Parking and entrance fees remain extra.</li>
                        <li>Extra distance traveled beyond the initial booking itinerary will be charged at the per-KM rate specified.</li>
                    </ul>
                </div>

                <div class="legal-section">
                    <h2>3. Customer Conduct</h2>
                    <p>Passengers must treat the vehicle and driver with respect. Carriage of illegal substances, smoking inside the vehicle, and overloading beyond the vehicle's capacity are strictly prohibited. The driver reserves the right to terminate the journey in case of abusive behavior.</p>
                </div>

                <div class="legal-section">
                    <h2>4. Vehicles &amp; Drivers on the Platform</h2>
                    <p>Drop Cars is a technology platform connecting customers with independent
                    fleet owners and drivers ("Partners"). We verify each Partner's vehicle and
                    driver documents (registration, insurance, permit, and driving licence) before
                    they are listed. Drop Cars is not the owner or operator of any vehicle, and is
                    not the employer of any driver.</p>
                </div>

                <div class="legal-section">
                    <h2>5. Your Account &amp; Responsibilities</h2>
                    <ul>
                        <li>You are responsible for providing accurate booking details (pickup/drop
                        location, contact number, travel time) and for any loss caused by inaccurate
                        information you provide.</li>
                        <li>You are responsible for your own belongings during the trip. Please check
                        the vehicle before disembarking.</li>
                        <li>You are liable for any damage you cause to the vehicle beyond normal
                        wear, at the fleet owner's actual repair cost.</li>
                    </ul>
                </div>

                <div class="legal-section">
                    <h2>6. Cancellations, Refunds &amp; Payments</h2>
                    <p>Cancellation and refund terms are set out in our <a href="<?php echo function_exists('dropcars_url') ? dropcars_url('pages/refund-policy.html') : '/pages/refund-policy'; ?>">Refund
                    Policy</a>, and payment terms in our <a href="<?php echo function_exists('dropcars_url') ? dropcars_url('pages/payment-policy.html') : '/pages/payment-policy'; ?>">Payment Policy</a>,
                    both of which form part of these Terms.</p>
                </div>

                <div class="legal-section">
                    <h2>7. Account Suspension</h2>
                    <p>We may suspend or restrict your account if we reasonably suspect fraud, abuse
                    of the platform, repeated no-shows, harassment of drivers or staff, or any
                    violation of these Terms, with notice where practicable.</p>
                </div>

                <div class="legal-section">
                    <h2>8. Limitation of Liability</h2>
                    <p>Drop Cars works to verify every Partner before listing them and to ensure a
                    safe, reliable service, but we do not control the actual driving or conduct of
                    independent drivers on the road. To the extent permitted by Indian law, Drop
                    Cars' liability for any claim arising from a booking is limited to the value of
                    that booking, except where the loss results from Drop Cars' own gross negligence
                    or wilful default, or as otherwise required by the Consumer Protection Act, 2019
                    and applicable e-commerce rules. Nothing in this clause limits any right you have
                    as a consumer under Indian law.</p>
                </div>

                <div class="legal-section">
                    <h2>9. Force Majeure</h2>
                    <p>Drop Cars is not liable for delay or failure to provide a booking caused by an
                    event beyond its reasonable control, including natural disaster, strike, road
                    closure, government action, or internet/telecom failure. We will make reasonable
                    efforts to notify you and assist with rebooking or a refund where applicable
                    under our Refund Policy.</p>
                </div>

                <div class="legal-section">
                    <h2>10. Governing Law &amp; Grievance Redressal</h2>
                    <p>These Terms are governed by the laws of India. If you have a complaint, please
                    contact our support team first so we can resolve it directly. Subject to
                    applicable consumer protection law, any dispute not resolved through support
                    shall be subject to the exclusive jurisdiction of the courts at
                    <strong>[City, State]</strong>.</p>
                </div>

                <div class="legal-section">
                    <h2>11. Changes to These Terms</h2>
                    <p>We may update these Terms from time to time. Continued use of Drop Cars after
                    an update takes effect constitutes acceptance of the revised Terms. Material
                    changes will be highlighted on this page.</p>
                </div>
            </div>
        </div>
    </main>

    <?php echo $shell->renderFooter(); ?>
    <?php echo $shell->renderScripts(); ?>
</body>
</html>
