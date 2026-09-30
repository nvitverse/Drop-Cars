<?php
require_once __DIR__ . '/../includes/paths.php';
require_once __DIR__ . '/../engine/theme-engine.php';
require_once __DIR__ . '/../engine/shell.php';

$themeEngine = new ThemeEngine();
$activeTheme = $themeEngine->detectTheme();
$allThemes = $themeEngine->getAllThemes();

$shell = new UIShell($activeTheme, $allThemes);

$pageTitle = 'Vendor Partnership | Grow Your Travel Agency with Drop Cars';
$pageDesc = 'Partner with Drop Cars as a travel vendor. Increase your reach, access a wide network of intercity bookings, and grow your business with our professional support framework.';
$canonical = function_exists('dropcars_canonical_request_url') ? dropcars_canonical_request_url() : "https://dropcars.in/pages/vendor-partner.php";
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
                            <span class="breadcrumb__current">Vendor Partner</span>
                        </nav>
                        <p class="eyebrow">Strategic Alliance</p>
                        <h1>Partner With Drop Cars</h1>
                        <p>Drive more value for your travel agency by partnering with Drop Cars. Leverage our premium network of one-way and outstation taxi services to offer reliable solutions to your customers.</p>
                    </div>
                    <div class="partner-hero-img-wrap" style="flex: 0 0 auto;">
                        <img src="/assets/images/contact-hero.png" alt="Vendor Agency Partnership with Drop Cars" width="240" height="240" style="max-width: 240px; height: auto; border-radius: 16px;" loading="eager" />
                    </div>
                </div>

                <div class="benefit-list">
                    <div class="benefit-item">
                        <div class="benefit-icon">📈</div>
                        <div class="benefit-content">
                            <h4>Expand Your Reach</h4>
                            <p>Access our multi-city network with thousands of regular intercity travelers.</p>
                        </div>
                    </div>
                    <div class="benefit-item">
                        <div class="benefit-icon">💰</div>
                        <div class="benefit-content">
                            <h4>Attractive Commissions</h4>
                            <p>Competitive partnership rates with transparent settlement cycles.</p>
                        </div>
                    </div>
                    <div class="benefit-item">
                        <div class="benefit-icon">🏢</div>
                        <div class="benefit-content">
                            <h4>Expert Support</h4>
                            <p>Priority support for vendor partners to ensure smooth trip execution.</p>
                        </div>
                    </div>
                    <div class="benefit-item">
                        <div class="benefit-icon">🌟</div>
                        <div class="benefit-content">
                            <h4>Verified Ecosystem</h4>
                            <p>High quality standard for vehicles and drivers to protect your reputation.</p>
                        </div>
                    </div>
                </div>

                <div class="download-app-card" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);">
                    <h3>Download Vendor App</h3>
                    <p>Post bookings to our driver network, manage your bookings, view earnings, and access exclusive vendor tools.</p>
                    <div class="download-buttons">
                        <a href="/assets/apk/DropCars-Vendor-App.apk" class="btn-apk-download" style="background:rgba(255,255,255,0.15)" download>Download APK Directly</a>
                    </div>
                </div>
            </div>

            <div class="partner-form-card">
                <h3>Vendor Application</h3>
                <p style="color:#64748b; font-size:0.9rem; margin-bottom:1.5rem;">Join our vendor network to scale your travel business.</p>
                
                <form id="partner-form" class="partner-form">
                    <input type="hidden" name="partnerType" value="Vendor">
                    
                    <div class="form-row">
                        <div class="form-field">
                            <label>Full Name *</label>
                            <input type="text" name="fullName" placeholder="John Doe" required>
                        </div>
                        <div class="form-field">
                            <label>Phone Number *</label>
                            <input type="tel" name="phone" placeholder="9876543210" required>
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-field">
                            <label>Email Address</label>
                            <input type="email" name="email" placeholder="john@travelagency.com">
                        </div>
                        <div class="form-field">
                            <label>City *</label>
                            <input type="text" name="city" placeholder="e.g. Coimbatore" required>
                        </div>
                    </div>

                    <div class="form-field" style="margin-bottom: 1rem;">
                        <label>Agency Name *</label>
                        <input type="text" name="companyName" placeholder="Elite Travels" required>
                    </div>

                    <div class="form-field">
                        <label>Business Description / Message</label>
                        <textarea name="message" rows="3" placeholder="Briefly describe your agency..."></textarea>
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
