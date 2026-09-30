<?php
/**
 * Services Page — Drop Cars
 * SEO-rich, animation-filled services overview page
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
$whatsapp   = $config['company']['whatsapp'] ?? '917200217986';

$pageTitle = 'Our Services | Drop Cars – One-Way, Airport, Outstation, Corporate Cab';
$pageDesc  = 'Explore Drop Cars taxi services: one-way outstation drop, airport transfers, round trips, corporate packages, multi-city tours. Serving 120+ routes across South India.';
$canonical = function_exists('dropcars_canonical_request_url') ? dropcars_canonical_request_url() : 'https://dropcars.in/services';
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
    <meta property="og:image" content="https://dropcars.in/assets/images/services-hero.png">
    <meta name="twitter:card" content="summary_large_image">

    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Service",
      "name": "Drop Cars Outstation Taxi Services",
      "provider": {"@type": "Organization", "name": "Drop Cars", "url": "https://dropcars.in"},
      "areaServed": "South India",
      "hasOfferCatalog": {
        "@type": "OfferCatalog",
        "name": "Taxi Services",
        "itemListElement": [
          {"@type":"Offer","itemOffered":{"@type":"Service","name":"One-Way Drop Taxi"}},
          {"@type":"Offer","itemOffered":{"@type":"Service","name":"Airport Transfers"}},
          {"@type":"Offer","itemOffered":{"@type":"Service","name":"Outstation Round Trip"}},
          {"@type":"Offer","itemOffered":{"@type":"Service","name":"Corporate Cab Booking"}},
          {"@type":"Offer","itemOffered":{"@type":"Service","name":"Multi-City Tour Packages"}}
        ]
      },
      "breadcrumb": {
        "@type": "BreadcrumbList",
        "itemListElement": [
          {"@type":"ListItem","position":1,"name":"Home","item":"https://dropcars.in"},
          {"@type":"ListItem","position":2,"name":"Services","item":"<?php echo htmlspecialchars($canonical); ?>"}
        ]
      }
    }
    </script>

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
    .services-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
    }
    @media (max-width: 900px) { .services-grid { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 560px) { .services-grid { grid-template-columns: 1fr; } }

    .service-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 20px;
      padding: 2rem 1.5rem;
      transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease;
      position: relative;
      overflow: hidden;
    }
    [data-theme="dark"] .service-card,
    .dark-mode .service-card { background: #1e293b; border-color: #334155; }
    .service-card::after {
      content: '';
      position: absolute;
      bottom: 0; left: 0;
      width: 100%; height: 3px;
      background: linear-gradient(90deg, var(--card-color, #2563eb), transparent);
      transition: height 0.3s ease;
    }
    .service-card:hover {
      transform: translateY(-8px);
      box-shadow: 0 24px 48px rgba(0,0,0,0.1);
      border-color: var(--card-color, #2563eb);
    }
    .service-card:hover::after { height: 5px; }

    .service-card__icon {
      font-size: 2.5rem;
      margin-bottom: 1.25rem;
      display: block;
      transition: transform 0.3s ease;
    }
    .service-card:hover .service-card__icon { transform: scale(1.15) rotate(-5deg); }

    .service-card__tag {
      display: inline-block;
      background: var(--card-bg-light, #eff6ff);
      color: var(--card-color, #2563eb);
      border-radius: 100px;
      padding: 0.2rem 0.7rem;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 0.75rem;
    }
    .service-card__title { font-size: 1.2rem; font-weight: 700; color: #0f172a; margin-bottom: 0.6rem; }
    [data-theme="dark"] .service-card__title,
    .dark-mode .service-card__title { color: #f1f5f9; }
    .service-card__desc { font-size: 0.9rem; color: #64748b; line-height: 1.65; margin-bottom: 1.25rem; }
    .service-card__link {
      display: inline-flex; align-items: center; gap: 0.35rem;
      color: var(--card-color, #2563eb); font-weight: 600; font-size: 0.9rem;
      text-decoration: none; transition: gap 0.2s ease;
    }
    .service-card__link:hover { gap: 0.6rem; }

    .routes-showcase {
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem;
    }
    /* overflow-x:auto (not overflow:hidden) so the table scrolls
       horizontally on narrow phones instead of silently clipping the
       "Traditional Taxi" column - border-radius still clips corners fine
       on a scroll container. */
    .comparison-table-wrap {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    .comparison-table { width: 100%; min-width: 480px; border-collapse: collapse; }
    .comparison-table th {
      background: #1e3a8a;
      color: white;
      padding: 1rem 1.25rem;
      text-align: left;
      font-weight: 600;
      white-space: nowrap;
    }
    .comparison-table td {
      padding: 0.85rem 1.25rem;
      border-bottom: 1px solid #e2e8f0;
      font-size: 0.95rem;
      color: #334155;
    }
    .comparison-table tr:nth-child(even) td { background: #f8fafc; }
    .tick { color: #16a34a; font-weight: 700; }
    .cross { color: #ef4444; }

    @media (max-width: 600px) {
      .comparison-table { min-width: 420px; }
      .comparison-table th { padding: 0.75rem 0.9rem; font-size: 0.85rem; }
      .comparison-table td { padding: 0.65rem 0.9rem; font-size: 0.85rem; }
    }

    /* Dark Mode Enhancements */
    [data-theme="dark"] .service-card,
    .dark-mode .service-card {
      background: #0f172a !important;
      border-color: #1e293b !important;
    }
    [data-theme="dark"] .service-card__desc,
    .dark-mode .service-card__desc {
      color: #94a3b8 !important;
    }
    [data-theme="dark"] .comparison-table th,
    .dark-mode .comparison-table th {
      background: #0f172a !important;
      color: #f8fafc !important;
      border-bottom: 2px solid #1e293b !important;
    }
    [data-theme="dark"] .comparison-table td,
    .dark-mode .comparison-table td {
      border-color: #1e293b !important;
      color: #cbd5e1 !important;
    }
    [data-theme="dark"] .comparison-table tr:nth-child(even) td,
    .dark-mode .comparison-table tr:nth-child(even) td {
      background: #0f172a !important;
    }
    [data-theme="dark"] .comparison-table tr:nth-child(odd) td,
    .dark-mode .comparison-table tr:nth-child(odd) td {
      background: #0b1329 !important;
    }
    [data-theme="dark"] .route-pill,
    .dark-mode .route-pill {
      background: #0f172a !important;
      border-color: #1e293b !important;
      color: #e2e8f0 !important;
    }
    [data-theme="dark"] .route-pill:hover,
    .dark-mode .route-pill:hover {
      background: #1e293b !important;
      border-color: #38bdf8 !important;
      color: #38bdf8 !important;
    }
    [data-theme="dark"] .stats-bar,
    .dark-mode .stats-bar {
      background: #0f172a !important;
      border-color: #1e293b !important;
    }
    </style>
</head>
<body class="<?php echo ($activeTheme['slug'] ?? '') === 'airport-taxi' ? ('theme-airporttaxi ' . (function_exists('dropcars_is_native_airporttaxi_host') && dropcars_is_native_airporttaxi_host() ? 'ati-native' : 'ati-embedded')) : ''; ?>">
<?php echo $shell->renderHeader(); ?>

<!-- ── Hero ── -->
<section class="page-hero">
    <div class="page-hero__orb page-hero__orb--1"></div>
    <div class="page-hero__orb page-hero__orb--2"></div>
    <div class="container page-hero__layout">
        <div class="page-hero__content reveal">
            <nav class="breadcrumb">
                <a href="/">Home</a>
                <span class="breadcrumb__sep">›</span>
                <span class="breadcrumb__current">Our Services</span>
            </nav>
            <div class="page-hero__badge">🚀 120+ Routes Covered</div>
            <h1 class="page-hero__title">
                Complete Taxi Services for <span class="accent">Every Journey</span>
            </h1>
            <p class="page-hero__desc">
                Whether you're heading to an airport, planning an outstation trip, or need a multi-city tour — Drop Cars has a transparent, reliable solution for every travel need.
            </p>
            <div class="page-hero__ctas">
                <a href="/#booking" class="btn-hero-primary">🚕 Book Now</a>
                <a href="/airport-transfer" class="btn-hero-outline">✈️ Airport Cabs</a>
            </div>
        </div>
        <div class="page-hero__image reveal-right">
            <img src="/assets/images/services-hero.png"
                 alt="Drop Cars taxi services overview – airport, outstation, one-way"
                 width="500" loading="eager">
        </div>
    </div>
</section>

<!-- ── Stats ── -->
<div class="container">
    <div class="stats-bar reveal">
        <div class="stat-item">
            <div class="stat-item__number count-up" data-target="120">0</div>
            <div class="stat-item__label">Intercity Routes</div>
        </div>
        <div class="stat-item">
            <div class="stat-item__number" style="font-size: 2.2rem;">₹15</div>
            <div class="stat-item__label">Per KM (Sedan)</div>
        </div>
        <div class="stat-item">
            <div class="stat-item__number">24/7</div>
            <div class="stat-item__label">Airport Cabs</div>
        </div>
        <div class="stat-item">
            <div class="stat-item__number count-up" data-target="0">0</div>
            <div class="stat-item__label">Return Charges</div>
        </div>
    </div>
</div>

<!-- ── Our Services ── -->
<section class="page-section">
    <div class="container">
        <div class="text-center reveal" style="margin-bottom: 3rem;">
            <p class="section-eyebrow" style="justify-content: center;">What We Offer</p>
            <h2 class="section-title">Drop Cars Service Menu</h2>
            <p class="section-desc" style="margin: 0 auto;">All services come with police-verified drivers, GST invoice, real-time tracking and 24/7 WhatsApp support.</p>
        </div>
        <div class="services-grid">
            <?php
            $services = [
                [
                    'icon' => '🛣️',
                    'tag' => 'Most Popular',
                    'title' => 'One-Way Drop Taxi',
                    'desc' => 'Pay only for the outbound journey. No return fare, no wasted money. Perfect for Chennai–Coimbatore, Bangalore–Chennai or any intercity one-way trip.',
                    'link' => '/#booking',
                    'link_text' => 'Book One-Way →',
                    'color' => '#2563eb',
                    'bg' => '#eff6ff',
                ],
                [
                    'icon' => '✈️',
                    'tag' => '24/7 Service',
                    'title' => 'Airport Transfers',
                    'desc' => 'Punctual, GPS-tracked airport pickup and drop across Chennai, Coimbatore, Madurai, Trichy, Bangalore and Hyderabad airports.',
                    'link' => '/airport-transfer',
                    'link_text' => 'Book Airport Cab →',
                    'color' => '#0891b2',
                    'bg' => '#ecfeff',
                ],
                [
                    'icon' => '🔄',
                    'tag' => 'Round Trip',
                    'title' => 'Outstation Round Trip',
                    'desc' => 'Same driver, wait and return. Ideal for temple visits, business travel or weekend getaways where you need the cab throughout.',
                    'link' => '/#booking',
                    'link_text' => 'Book Round Trip →',
                    'color' => '#7c3aed',
                    'bg' => '#f5f3ff',
                ],
                [
                    'icon' => '🏢',
                    'tag' => 'Corporate',
                    'title' => 'Corporate Cab Service',
                    'desc' => 'Dedicated fleet for companies. GST invoices, monthly billing, employee transfers and conference travel with priority dispatch.',
                    'link' => '/pages/contact.html',
                    'link_text' => 'Get Corporate Quote →',
                    'color' => '#0f766e',
                    'bg' => '#f0fdfa',
                ],
                [
                    'icon' => '🗺️',
                    'tag' => 'Multi-City',
                    'title' => 'Multi-City Tour Package',
                    'desc' => 'Customized itineraries covering multiple cities in one trip. Ideal for temple circuits, family tours or business visits across South India.',
                    'link' => '/#booking',
                    'link_text' => 'Plan My Tour →',
                    'color' => '#b45309',
                    'bg' => '#fffbeb',
                ],
                [
                    'icon' => '🕐',
                    'tag' => 'Local',
                    'title' => 'Local Hourly Rental',
                    'desc' => '5, 8, 10 or 12-hour packages for local errands, shopping, hospital visits or city sightseeing. Driver waits as you go.',
                    'link' => '/#booking',
                    'link_text' => 'Book Hourly →',
                    'color' => '#9333ea',
                    'bg' => '#faf5ff',
                ],
            ];
            foreach ($services as $i => $s):
            ?>
            <div class="service-card reveal reveal-d<?php echo ($i % 3) + 1; ?>"
                 style="--card-color: <?php echo $s['color']; ?>; --card-bg-light: <?php echo $s['bg']; ?>;">
                <span class="service-card__icon"><?php echo $s['icon']; ?></span>
                <span class="service-card__tag"><?php echo $s['tag']; ?></span>
                <h2 class="service-card__title"><?php echo $s['title']; ?></h2>
                <p class="service-card__desc"><?php echo $s['desc']; ?></p>
                <a href="<?php echo $s['link']; ?>" class="service-card__link">
                    <?php echo $s['link_text']; ?>
                </a>
            </div>
            <?php endforeach; ?>
        </div>
    </div>
</section>

<!-- ── Comparison Table ── -->
<section class="page-section" style="background: var(--surface, #f8fafc);">
    <div class="container">
        <div class="text-center reveal" style="margin-bottom: 2.5rem;">
            <p class="section-eyebrow" style="justify-content: center;">Why Drop Cars?</p>
            <h2 class="section-title">Us vs. Traditional Taxis</h2>
        </div>
        <div class="comparison-table-wrap reveal" style="border-radius: 16px; box-shadow: 0 4px 30px rgba(0,0,0,0.08);">
            <table class="comparison-table">
                <thead>
                    <tr>
                        <th>Feature</th>
                        <th>Drop Cars ✅</th>
                        <th>Traditional Taxi ❌</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td>One-Way Pricing</td><td class="tick">✅ Yes – no return fare</td><td class="cross">❌ Charges full round trip</td></tr>
                    <tr><td>Upfront Fare Estimate</td><td class="tick">✅ Instant calculation</td><td class="cross">❌ Negotiated at pickup</td></tr>
                    <tr><td>Driver Verification</td><td class="tick">✅ Police background check</td><td class="cross">❌ Often unverified</td></tr>
                    <tr><td>WhatsApp Confirmation</td><td class="tick">✅ Instant with driver details</td><td class="cross">❌ Manual call-back only</td></tr>
                    <tr><td>Live GPS Tracking</td><td class="tick">✅ Real-time via link</td><td class="cross">❌ Not available</td></tr>
                    <tr><td>GST Invoice</td><td class="tick">✅ Digital invoice sent</td><td class="cross">❌ No formal invoice</td></tr>
                    <tr><td>24/7 Customer Support</td><td class="tick">✅ WhatsApp + Phone</td><td class="cross">❌ Business hours only</td></tr>
                </tbody>
            </table>
        </div>
    </div>
</section>

<!-- ── Popular Routes ── -->
<section class="page-section">
    <div class="container">
        <div class="text-center reveal" style="margin-bottom: 2.5rem;">
            <p class="section-eyebrow" style="justify-content: center;">Popular Routes</p>
            <h2 class="section-title">Most Booked Intercity Routes</h2>
        </div>
        <div class="routes-showcase reveal">
            <?php
            $routes = [
                'Chennai → Coimbatore','Chennai → Tiruvannamalai','Chennai → Madurai',
                'Chennai → Trichy','Chennai → Vellore','Chennai → Pondicherry',
                'Chennai → Bangalore','Coimbatore → Chennai','Madurai → Chennai',
                'Chennai → Salem','Chennai → Tirupati','Chennai → Thanjavur',
                'Bangalore → Chennai','Bangalore → Coimbatore','Chennai → Kochi',
                'Chennai → Hyderabad','Trichy → Chennai','Salem → Chennai',
                'Vellore → Chennai','Chennai → Tirunelveli',
            ];
            foreach ($routes as $route):
            ?>
            <a href="/#booking" class="route-pill" title="Book <?php echo htmlspecialchars($route); ?> taxi">
                🛣️ <?php echo htmlspecialchars($route); ?>
            </a>
            <?php endforeach; ?>
        </div>
    </div>
</section>

<!-- ── FAQ ── -->
<section class="page-section" style="background: var(--surface, #f8fafc);">
    <div class="container" style="max-width: 760px;">
        <div class="text-center reveal" style="margin-bottom: 2.5rem;">
            <p class="section-eyebrow" style="justify-content: center;">FAQ</p>
            <h2 class="section-title">Service Questions Answered</h2>
        </div>
        <?php
        $faqs = [
            ["What's the cheapest taxi from Chennai?", "Our Sedan one-way starts at ₹15/km with a driver bata. A Chennai–Coimbatore trip (490 km) comes to approximately ₹7,750 inclusive of bata — far cheaper than round-trip pricing."],
            ["Do you cover airport pickups at night?", "Yes, our airport transfer service runs 24/7 including early morning and late-night flights. Driver is tracked live and arrives 30 minutes before your pickup time."],
            ["How do I book a corporate account?", "Contact us via WhatsApp or email for corporate account setup. We offer monthly billing, fleet priority, GST invoices and a dedicated account manager."],
            ["Is there a minimum distance for one-way trips?", "Yes, one-way bookings require a minimum of 130 km. For local or shorter trips, our hourly rental package is more suitable."],
        ];
        foreach ($faqs as $i => $faq):
        ?>
        <div class="faq-item reveal" id="faq-svc-<?php echo $i; ?>">
            <button class="faq-question" onclick="toggleFaq(this)" aria-expanded="false">
                <?php echo htmlspecialchars($faq[0]); ?>
                <span class="faq-question__icon" aria-hidden="true">+</span>
            </button>
            <div class="faq-answer"><p><?php echo htmlspecialchars($faq[1]); ?></p></div>
        </div>
        <?php endforeach; ?>
    </div>
</section>

<!-- ── CTA ── -->
<section class="page-section--sm">
    <div class="container">
        <div class="cta-banner reveal">
            <h2 class="cta-banner__title">Book Your Drop Cars Cab Today</h2>
            <p class="cta-banner__desc">Transparent fares · Police-verified drivers · Zero return charges · All of South India</p>
            <div class="cta-banner__btns">
                <a href="/#booking" class="btn-cta-white">🚕 Book Now</a>
                <a href="tel:+91<?php echo preg_replace('/\D/', '', $phone); ?>" class="btn-cta-outline-white">📞 <?php echo $phone; ?></a>
            </div>
        </div>
    </div>
</section>

<?php echo $shell->renderFooter(); ?>
<script>
(function(){
    const obs = new IntersectionObserver(e => e.forEach(x => x.isIntersecting && x.target.classList.add('revealed')), {threshold:0.1, rootMargin:'0px 0px -60px 0px'});
    document.querySelectorAll('.reveal,.reveal-left,.reveal-right,.reveal-scale').forEach(el => obs.observe(el));
    function animateCount(el) {
        const t = parseInt(el.dataset.target,10), d = 2000; let s = null;
        const step = ts => { if(!s) s=ts; const p=Math.min((ts-s)/d,1), e=1-Math.pow(1-p,3); el.textContent = Math.floor(e*t).toLocaleString('en-IN'); if(p<1) requestAnimationFrame(step); else el.textContent = t.toLocaleString('en-IN'); };
        requestAnimationFrame(step);
    }
    const cobs = new IntersectionObserver(e => e.forEach(x => { if(x.isIntersecting && !x.target.dataset.counted){ x.target.dataset.counted='1'; animateCount(x.target); } }), {threshold:0.3});
    document.querySelectorAll('.count-up').forEach(el => cobs.observe(el));
    window.toggleFaq = function(btn) {
        const item = btn.closest('.faq-item'), open = item.classList.contains('open');
        document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
        if(!open) item.classList.add('open');
        btn.setAttribute('aria-expanded', (!open).toString());
    };
})();
</script>
<?php echo $shell->renderScripts(); ?>
</body>
</html>
