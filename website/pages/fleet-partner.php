<?php
require_once __DIR__ . '/../includes/paths.php';
require_once __DIR__ . '/../engine/theme-engine.php';
require_once __DIR__ . '/../engine/shell.php';

$themeEngine = new ThemeEngine();
$activeTheme = $themeEngine->detectTheme();
$allThemes = $themeEngine->getAllThemes();

$shell = new UIShell($activeTheme, $allThemes);

$pageTitle = 'Fleet Partnership | List Your Luxury Cabs on Drop Cars';
$pageDesc = 'Sign up as a fleet partner with Drop Cars. List your well-maintained SUV, Sedan, or Luxury vehicles for intercity trips and maximize your fleet utilization across South India.';
$canonical = function_exists('dropcars_canonical_request_url') ? dropcars_canonical_request_url() : "https://dropcars.in/pages/fleet-partner.php";
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
                            <span class="breadcrumb__current">Fleet Partner</span>
                        </nav>
                        <p class="eyebrow">Enterprise Fleet</p>
                        <h1>Partner With Drop Cars</h1>
                        <p>Maximize your asset utilization by listing your fleet with Drop Cars. We offer bulk booking options, priority dispatch, and comprehensive fleet management tools for our enterprise partners.</p>
                    </div>
                    <div class="partner-hero-img-wrap" style="flex: 0 0 auto;">
                        <img src="/assets/images/driver-partner-hero.png" alt="Fleet Partner with Drop Cars" width="240" height="240" style="max-width: 240px; height: auto; border-radius: 16px;" loading="eager" />
                    </div>
                </div>

                <div class="benefit-list">
                    <div class="benefit-item">
                        <div class="benefit-icon">🏢</div>
                        <div class="benefit-content">
                            <h4>Bulk Bookings</h4>
                            <p>Get bulk ride allocations for your entire fleet across several cities.</p>
                        </div>
                    </div>
                    <div class="benefit-item">
                        <div class="benefit-icon">📈</div>
                        <div class="benefit-content">
                            <h4>Maximize ROI</h4>
                            <p>Ensure your vehicles aren't sitting idle. Consistent flow of one-way and outstation trips.</p>
                        </div>
                    </div>
                    <div class="benefit-item">
                        <div class="benefit-icon">⛓️</div>
                        <div class="benefit-content">
                            <h4>Seamless Integration</h4>
                            <p>Easy API or dashboard-based booking management for fleet owners.</p>
                        </div>
                    </div>
                    <div class="benefit-item">
                        <div class="benefit-icon">💎</div>
                        <div class="benefit-content">
                            <h4>Luxury & SUV Focus</h4>
                            <p>Specialized segment for Crysta, Innova, and luxury SUV fleet owners.</p>
                        </div>
                    </div>
                </div>

                <div class="download-app-card" style="background: linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%);">
                    <h3>Fleet Manager App</h3>
                    <p>Track your vehicles in real-time, view detailed driver reports, and manage payroll - the same Drop Cars app your drivers use, just sign in with your fleet owner login.</p>
                    <div class="download-buttons">
                        <a href="/assets/apk/DropCars-Driver-App.apk" class="btn-apk-download" download>Download APK Directly</a>
                    </div>
                </div>
            </div>

            <div class="partner-form-card">
                <h3>Fleet Partnership Application</h3>
                <p style="color:#64748b; font-size:0.9rem; margin-bottom:1.5rem;">Grow your fleet business with our premium trip network.</p>
                
                <form id="partner-form" class="partner-form">
                    <input type="hidden" name="partnerType" value="Fleet">
                    
                    <div class="form-row">
                        <div class="form-field">
                            <label>Full Name *</label>
                            <input type="text" name="fullName" placeholder="Sarah Johnson" required>
                        </div>
                        <div class="form-field">
                            <label>Phone Number *</label>
                            <input type="tel" name="phone" placeholder="9876543210" required>
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-field">
                            <label>Email Address</label>
                            <input type="email" name="email" placeholder="sarah@fleetowner.com">
                        </div>
                        <div class="form-field">
                            <label>Primary Hub City *</label>
                            <input type="text" name="city" placeholder="e.g. Bangalore" required>
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-field">
                            <label>Company Name (Optional)</label>
                            <input type="text" name="companyName" placeholder="Royal Fleet Services">
                        </div>
                        <div class="form-field">
                            <label>Fleet Size *</label>
                            <input type="number" name="fleetSize" placeholder="Number of vehicles (e.g. 5)" required>
                        </div>
                    </div>

                    <div class="form-field">
                        <label>Vehicle Types Available</label>
                        <textarea name="message" rows="3" placeholder="e.g. 3 Sedans, 2 Innovas, 1 Crysta..."></textarea>
                    </div>

                    <div class="form-submit">
                        <button type="submit" class="btn-submit" id="submit-btn">Apply Now</button>
                    </div>

                    <div id="partner-response" class="partner-response"></div>
                </form>
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
