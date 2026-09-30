<?php
require_once __DIR__ . '/../includes/paths.php';
require_once __DIR__ . '/../engine/theme-engine.php';
require_once __DIR__ . '/../engine/shell.php';

$themeEngine = new ThemeEngine();
$activeTheme = $themeEngine->detectTheme();
$allThemes = $themeEngine->getAllThemes();

$shell = new UIShell($activeTheme, $allThemes);

$pageTitle = 'Driver Partner Hub | Join Drop Cars - Professional Taxi Network';
$pageDesc = 'Sign up as a driver partner with Drop Cars. Benefit from consistent bookings, transparent payments, and a professional supporting network across South India.';
$canonical = function_exists('dropcars_canonical_request_url') ? dropcars_canonical_request_url() : "https://dropcars.in/pages/driver-partner.php";
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
    <link rel="stylesheet" href="/assets/css/partner-pages.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/partner-pages.css'); ?>">
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

<main class="partner-page">
    <div class="container">
        <div class="partner-grid">
            <div class="partner-info-sidebar">
                <div class="partner-hero" style="display: flex; align-items: center; gap: 1.5rem; justify-content: space-between; flex-wrap: wrap;">
                    <div style="flex: 1; min-width: 280px;">
                        <nav class="breadcrumb" aria-label="Breadcrumb" style="margin-bottom: 0.8rem;">
                            <a href="/">Home</a>
                            <span class="breadcrumb__sep">›</span>
                            <span class="breadcrumb__current">Driver Partner</span>
                        </nav>
                        <p class="eyebrow">Drive With Us</p>
                        <h1>Partner With Drop Cars</h1>
                        <p>Unlock steady bookings and grow your income with Tamil Nadu's most professional taxi network. We value our partners and ensure prompt payments and 24/7 support.</p>
                    </div>
                    <div class="partner-hero-img-wrap" style="flex: 0 0 auto;">
                        <img src="/assets/images/driver-partner-hero.png" alt="Driver Partner with Drop Cars" width="240" height="240" style="max-width: 240px; height: auto; border-radius: 16px;" loading="eager" />
                    </div>
                </div>

                <div class="benefit-list">
                    <div class="benefit-item">
                        <div class="benefit-icon">📈</div>
                        <div class="benefit-content">
                            <h4>High Consistency</h4>
                            <p>Get regular long-distance and one-way trip bookings year-round.</p>
                        </div>
                    </div>
                    <div class="benefit-item">
                        <div class="benefit-icon">💳</div>
                        <div class="benefit-content">
                            <h4>Fast Payments</h4>
                            <p>Transparent settlement process with zero hidden commissions.</p>
                        </div>
                    </div>
                    <div class="benefit-item">
                        <div class="benefit-icon">🛠️</div>
                        <div class="benefit-content">
                            <h4>Driver App & Support</h4>
                            <p>Easy-to-use partner app and dedicated support team at your service.</p>
                        </div>
                    </div>
                    <div class="benefit-item">
                        <div class="benefit-icon">⚓</div>
                        <div class="benefit-content">
                            <h4>Professional Network</h4>
                            <p>Be part of a premium brand that customers trust and respect.</p>
                        </div>
                    </div>
                </div>

                <div class="download-app-card">
                    <h3>Download Partner App</h3>
                    <p>Manage your rides, track earnings, and get navigation help in one place. Works for both duty drivers and fleet owners - just pick your login type inside the app.</p>
                    <div class="download-buttons">
                        <a href="/assets/apk/DropCars-Driver-App.apk" class="btn-apk-download" download>Download APK Directly</a>
                    </div>
                </div>
            </div>

            <div class="partner-form-card" style="background: linear-gradient(135deg, #0f172a, #1e293b); color: #ffffff; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 2rem; box-shadow: 0 10px 30px rgba(0,0,0,0.15);">
                <div style="display:inline-block; background:rgba(37,99,235,0.2); color:#60a5fa; border:1px solid rgba(96,165,250,0.3); font-size:0.75rem; font-weight:800; padding:0.3rem 0.75rem; border-radius:100px; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.85rem;">⚡ Instant Partner Onboarding</div>
                <h3 style="font-size:1.5rem; font-weight:800; color:#ffffff; margin-bottom:0.5rem; font-family:'Outfit', sans-serif;">Download Drop Cars Driver App</h3>
                <p style="color:#cbd5e1; font-size:0.9rem; margin-bottom:1.5rem; line-height:1.5;">No lengthy registration forms or attachment uploads required. Download the app directly to start accepting outstation and one-way trip duties instantly.</p>
                
                <div style="display:flex; flex-direction:column; gap:0.85rem; margin-bottom:1.5rem;">
                    <a href="/assets/apk/DropCars-Driver-App.apk" class="btn-apk-download" download style="display:flex; align-items:center; justify-content:center; gap:0.6rem; background:linear-gradient(135deg, #2563eb, #1d4ed8); color:#ffffff; text-decoration:none; padding:0.9rem 1.25rem; border-radius:12px; font-weight:800; font-size:0.95rem; font-family:'Outfit', sans-serif; box-shadow:0 4px 15px rgba(37,99,235,0.35); transition:all 0.2s ease;">
                        <span style="font-size:1.2rem;">🚀</span> Download Driver App (APK)
                    </a>
                    <a href="https://wa.me/917200217986?text=<?php echo urlencode('Hi Drop Cars, I want to join as a Driver Partner. Please help me with onboarding.'); ?>" target="_blank" style="display:flex; align-items:center; justify-content:center; gap:0.6rem; background:linear-gradient(135deg, #16a34a, #15803d); color:#ffffff; text-decoration:none; padding:0.85rem 1.25rem; border-radius:12px; font-weight:800; font-size:0.9rem; font-family:'Outfit', sans-serif; box-shadow:0 4px 15px rgba(22,163,74,0.3); transition:all 0.2s ease;">
                        <span style="font-size:1.2rem;">💬</span> Instant Onboarding via WhatsApp
                    </a>
                </div>

                <div style="background:rgba(255,255,255,0.05); border:1px dashed rgba(255,255,255,0.15); border-radius:12px; padding:1rem; margin-top:1rem;">
                    <div style="font-size:0.82rem; font-weight:700; color:#f59e0b; margin-bottom:0.4rem;">🔑 Why Drivers Choose Drop Cars App:</div>
                    <ul style="margin:0; padding-left:1.2rem; color:#94a3b8; font-size:0.8rem; line-height:1.6;">
                        <li>Daily instant payout directly to your bank account / UPI</li>
                        <li>High volume of one-way outstation trip requests</li>
                        <li>Transparent fare breakdown with 0% extra deductions</li>
                        <li>24/7 dedicated Driver Partner Support hotline</li>
                    </ul>
                </div>
            </div>
        </div>
    </div>
</main>

<?php echo $shell->renderFooter(); ?>
<?php echo $shell->renderScripts(); ?>

<script>
document.getElementById('partner-form').addEventListener('submit', function(e) {
    e.preventDefault();
    var form = this;
    var btn = document.getElementById('submit-btn');
    var responseDiv = document.getElementById('partner-response');
    
    var formData = {};
    new FormData(form).forEach((value, key) => { formData[key] = value });

    btn.disabled = true;
    btn.textContent = 'Sending...';
    responseDiv.style.display = 'none';

    fetch('/api/partner-request.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
    })
    .then(r => r.json())
    .then(data => {
        btn.disabled = false;
        btn.textContent = 'Apply Now';
        responseDiv.style.display = 'block';
        if (data.success) {
            responseDiv.className = 'partner-response partner-response--success';
            responseDiv.textContent = data.message || 'Request sent successfully! We will contact you soon.';
            form.reset();
        } else {
            responseDiv.className = 'partner-response partner-response--error';
            responseDiv.textContent = data.message || 'Failed to send request. Please try again or call us.';
        }
    })
    .catch(() => {
        btn.disabled = false;
        btn.textContent = 'Apply Now';
        responseDiv.style.display = 'block';
        responseDiv.className = 'partner-response partner-response--error';
        responseDiv.textContent = 'Network error. Please try again later.';
    });
});
</script>

</body>
</html>
