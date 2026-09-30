<?php
/**
 * Trust & Safety Page — Drop Cars
 * Verification standards, compliance, and partner assurance for B2B evaluation
 */
require_once __DIR__ . '/../includes/paths.php';
require_once __DIR__ . '/../engine/theme-engine.php';
require_once __DIR__ . '/../engine/shell.php';

$themeEngine = new ThemeEngine();
$activeTheme = $themeEngine->detectTheme();
$allThemes   = $themeEngine->getAllThemes();
$shell       = new UIShell($activeTheme, $allThemes);

$configPath = __DIR__ . '/../data/config.json';
$config     = is_file($configPath) ? json_decode(file_get_contents($configPath), true) : [];
$phone      = $config['company']['phone'] ?? '7200217986';

$pageTitle = 'Trust & Safety | Drop Cars Verification Standards';
$pageDesc  = 'How Drop Cars verifies every fleet owner, driver, and vehicle before they can accept a booking - documents, KYC, and ongoing compliance.';
$canonical = function_exists('dropcars_canonical_request_url') ? dropcars_canonical_request_url() : 'https://dropcars.in/pages/trust-safety.html';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($pageTitle); ?></title>
    <meta name="description" content="<?php echo htmlspecialchars($pageDesc); ?>">
    <link rel="canonical" href="<?php echo htmlspecialchars($canonical); ?>">

    <meta property="og:title" content="<?php echo htmlspecialchars($pageTitle); ?>">
    <meta property="og:description" content="<?php echo htmlspecialchars($pageDesc); ?>">
    <meta property="og:url" content="<?php echo htmlspecialchars($canonical); ?>">
    <meta property="og:type" content="website">

<?php dropcars_render_favicons($activeTheme['slug'] ?? null); ?>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">

    <link rel="stylesheet" href="/assets/css/base.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/base.css'); ?>">
    <link rel="stylesheet" href="/assets/css/layout.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/layout.css'); ?>">
    <link rel="stylesheet" href="/assets/css/navbar.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/navbar.css'); ?>">
    <link rel="stylesheet" href="/assets/css/footer.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/footer.css'); ?>">
    <link rel="stylesheet" href="/assets/css/whatsapp.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/whatsapp.css'); ?>">
    <link rel="stylesheet" href="/assets/css/page-animations.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/page-animations.css'); ?>">
    <link rel="stylesheet" href="/assets/css/dark-mode.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/dark-mode.css'); ?>">
    <link rel="stylesheet" href="/assets/css/light-theme.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/light-theme.css'); ?>">
    <?php if (($activeTheme['slug'] ?? '') === 'airport-taxi'): ?>
    <link rel="stylesheet" href="/assets/css/theme-airporttaxi.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/theme-airporttaxi.css'); ?>">
    <?php endif; ?>
    <script src="/assets/js/dark-mode.js?v=<?php echo @filemtime(__DIR__.'/../assets/js/dark-mode.js'); ?>"></script>
<?php include __DIR__ . '/../includes/google-tag.php'; ?>
    <style>
    .ts-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5rem; }
    @media (max-width: 900px) { .ts-grid { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 560px) { .ts-grid { grid-template-columns: 1fr; } }
    .ts-doc-row {
        display: flex; align-items: center; gap: 0.9rem;
        padding: 0.9rem 1.1rem; border: 1px solid #e2e8f0; border-radius: 12px;
        background: #ffffff; margin-bottom: 0.75rem;
    }
    [data-theme="dark"] .ts-doc-row, .dark-mode .ts-doc-row { background: #1e293b; border-color: #334155; }
    .ts-doc-row__check { color: #16a34a; font-size: 1.1rem; flex-shrink: 0; }
    .ts-doc-row__label { font-weight: 700; color: #0f172a; }
    [data-theme="dark"] .ts-doc-row__label, .dark-mode .ts-doc-row__label { color: #f1f5f9; }
    .ts-doc-row__desc { font-size: 0.85rem; color: #64748b; margin-top: 0.15rem; }
    .ts-cols { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 2rem; }
    @media (max-width: 860px) { .ts-cols { grid-template-columns: 1fr; } }
    </style>
</head>
<body class="<?php echo ($activeTheme['slug'] ?? '') === 'airport-taxi' ? ('theme-airporttaxi ' . (function_exists('dropcars_is_native_airporttaxi_host') && dropcars_is_native_airporttaxi_host() ? 'ati-native' : 'ati-embedded')) : ''; ?>">
<?php echo $shell->renderHeader(); ?>

<section class="page-hero">
    <div class="page-hero__orb page-hero__orb--1"></div>
    <div class="page-hero__orb page-hero__orb--2"></div>
    <div class="container page-hero__layout">
        <div class="page-hero__content reveal">
            <nav class="breadcrumb" aria-label="Breadcrumb">
                <a href="/">Home</a>
                <span class="breadcrumb__sep">›</span>
                <span class="breadcrumb__current">Trust &amp; Safety</span>
            </nav>
            <div class="page-hero__badge">🛡️ Verified Before Every Booking</div>
            <h1 class="page-hero__title">
                Every Vehicle. Every Driver. <span class="accent">Verified First.</span>
            </h1>
            <p class="page-hero__desc">
                No fleet owner, driver, or vehicle can accept a Drop Cars booking until their
                documents are checked and approved. This page explains exactly what we verify,
                how, and what happens if something isn't right - for riders, corporate partners,
                and anyone evaluating Drop Cars as a transport partner.
            </p>
            <div class="page-hero__ctas">
                <a href="/#booking" class="btn-hero-primary">🚕 Book a Cab Now</a>
                <a href="tel:+91<?php echo preg_replace('/\D/', '', $phone); ?>" class="btn-hero-outline">📞 Talk to Us</a>
            </div>
        </div>
    </div>
</section>

<section class="page-section">
    <div class="container">
        <div class="text-center reveal" style="margin-bottom: 3rem;">
            <p class="section-eyebrow" style="justify-content: center;">Before Anyone Drives</p>
            <h2 class="section-title">What We Verify</h2>
            <p class="section-desc" style="margin: 0 auto;">Three separate checks - fleet owner, vehicle, and driver - all have to pass before a listing goes live on the platform.</p>
        </div>
        <div class="ts-cols">
            <div class="reveal reveal-d1">
                <h3 class="feature-card__title" style="margin-bottom: 1rem;">👤 Fleet Owner KYC</h3>
                <div class="ts-doc-row"><span class="ts-doc-row__check">✓</span><div><div class="ts-doc-row__label">Aadhaar (front &amp; back)</div></div></div>
                <div class="ts-doc-row"><span class="ts-doc-row__check">✓</span><div><div class="ts-doc-row__label">PAN Card</div></div></div>
            </div>
            <div class="reveal reveal-d2">
                <h3 class="feature-card__title" style="margin-bottom: 1rem;">🚗 Every Vehicle</h3>
                <div class="ts-doc-row"><span class="ts-doc-row__check">✓</span><div><div class="ts-doc-row__label">Registration Certificate (RC)</div><div class="ts-doc-row__desc">Front &amp; back</div></div></div>
                <div class="ts-doc-row"><span class="ts-doc-row__check">✓</span><div><div class="ts-doc-row__label">Valid Insurance</div></div></div>
                <div class="ts-doc-row"><span class="ts-doc-row__check">✓</span><div><div class="ts-doc-row__label">Route Permit</div></div></div>
            </div>
            <div class="reveal reveal-d3">
                <h3 class="feature-card__title" style="margin-bottom: 1rem;">🪪 Every Driver</h3>
                <div class="ts-doc-row"><span class="ts-doc-row__check">✓</span><div><div class="ts-doc-row__label">Driving Licence (front &amp; back)</div></div></div>
            </div>
        </div>
        <p class="section-desc" style="margin-top: 2rem; max-width: 760px; margin-left: auto; margin-right: auto; text-align: center;">
            A vehicle or driver whose documents are pending, expired, or rejected simply cannot be
            assigned to a booking on the platform - this is enforced automatically, not just a
            policy on paper.
        </p>
    </div>
</section>

<section class="page-section" style="background: var(--surface, #f8fafc);">
    <div class="container">
        <div class="text-center reveal" style="margin-bottom: 3rem;">
            <p class="section-eyebrow" style="justify-content: center;">How It Works</p>
            <h2 class="section-title">From Signup to First Booking</h2>
        </div>
        <div class="timeline" style="max-width: 720px; margin: 0 auto;">
            <div class="timeline-step reveal reveal-d1">
                <div class="timeline-step__dot">1</div>
                <h3 class="timeline-step__title">Documents Submitted</h3>
                <p class="timeline-step__desc">The fleet owner uploads their own KYC, and every vehicle and driver's documents, through the Drop Cars app.</p>
            </div>
            <div class="timeline-step reveal reveal-d2">
                <div class="timeline-step__dot">2</div>
                <h3 class="timeline-step__title">Our Team Reviews</h3>
                <p class="timeline-step__desc">Each document is checked for authenticity and validity before being marked verified.</p>
            </div>
            <div class="timeline-step reveal reveal-d3">
                <div class="timeline-step__dot">3</div>
                <h3 class="timeline-step__title">Listing Goes Live</h3>
                <p class="timeline-step__desc">Only once all required documents pass can that owner, vehicle, or driver start receiving bookings.</p>
            </div>
            <div class="timeline-step reveal reveal-d1">
                <div class="timeline-step__dot">4</div>
                <h3 class="timeline-step__title">Ongoing Accountability</h3>
                <p class="timeline-step__desc">Our <a href="<?php echo function_exists('dropcars_url') ? dropcars_url('pages/vendor-agreement.html') : '/pages/vendor-agreement'; ?>">Vendor &amp; Fleet Owner Agreement</a> and <a href="<?php echo function_exists('dropcars_url') ? dropcars_url('pages/driver-agreement.html') : '/pages/driver-agreement'; ?>">Driver Agreement</a> hold every partner to these standards for as long as they're on the platform, not just at signup.</p>
            </div>
        </div>
    </div>
</section>

<section class="page-section">
    <div class="container">
        <div class="text-center reveal" style="margin-bottom: 3rem;">
            <p class="section-eyebrow" style="justify-content: center;">For Corporate &amp; B2B Partners</p>
            <h2 class="section-title">Why Partners Choose to Work With Us</h2>
        </div>
        <div class="ts-grid">
            <div class="feature-card reveal reveal-d1">
                <div class="feature-card__icon">🔒</div>
                <h3 class="feature-card__title">Enforced, Not Just Promised</h3>
                <p class="feature-card__desc">Verification status is checked by our systems at the moment a vehicle or driver is assigned - not a one-time signup formality.</p>
            </div>
            <div class="feature-card reveal reveal-d2">
                <div class="feature-card__icon">📋</div>
                <h3 class="feature-card__title">Written Standards</h3>
                <p class="feature-card__desc">Every fleet owner and driver accepts documented terms covering conduct, safety, and accountability before they can operate.</p>
            </div>
            <div class="feature-card reveal reveal-d3">
                <div class="feature-card__icon">📞</div>
                <h3 class="feature-card__title">Real Support, Always On</h3>
                <p class="feature-card__desc">A live team - not a bot - is reachable 24/7 for any safety or service concern.</p>
            </div>
            <div class="feature-card reveal reveal-d1">
                <div class="feature-card__icon">🌏</div>
                <h3 class="feature-card__title">South India Coverage</h3>
                <p class="feature-card__desc">120+ verified routes across Tamil Nadu, Karnataka, Kerala and Andhra Pradesh, with a growing local-city footprint.</p>
            </div>
        </div>
    </div>
</section>

<section class="page-section--sm">
    <div class="container">
        <div class="cta-banner reveal">
            <h2 class="cta-banner__title">Evaluating Drop Cars as a Transport Partner?</h2>
            <p class="cta-banner__desc">We're happy to walk you through our verification and compliance process in detail.</p>
            <div class="cta-banner__btns">
                <a href="tel:+91<?php echo preg_replace('/\D/', '', $phone); ?>" class="btn-cta-white">📞 Talk to Our Team</a>
                <a href="/#booking" class="btn-cta-outline-white">🚕 Book a Cab</a>
            </div>
        </div>
    </div>
</section>

<?php echo $shell->renderFooter(); ?>
<script>
(function() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('revealed'); });
    }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });
    document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale').forEach(el => observer.observe(el));
})();
</script>
<?php echo $shell->renderScripts(); ?>
</body>
</html>
