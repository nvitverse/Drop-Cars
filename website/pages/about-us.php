<?php
/**
 * About Us Page — Drop Cars
 * SEO-rich, animation-filled, fully branded about us page
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

$pageTitle = 'About Drop Cars | South India\'s Trusted Taxi Network';
$pageDesc  = 'Learn about Drop Cars — South India\'s leading intercity taxi platform offering transparent, fixed-rate one-way drop taxis since 2020.';
$canonical   = function_exists('dropcars_canonical_request_url') ? dropcars_canonical_request_url() : 'https://dropcars.in/about';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($pageTitle); ?></title>
    <meta name="description" content="<?php echo htmlspecialchars($pageDesc); ?>">
    <link rel="canonical" href="<?php echo htmlspecialchars($canonical); ?>">

    <!-- Open Graph -->
    <meta property="og:title" content="<?php echo htmlspecialchars($pageTitle); ?>">
    <meta property="og:description" content="<?php echo htmlspecialchars($pageDesc); ?>">
    <meta property="og:url" content="<?php echo htmlspecialchars($canonical); ?>">
    <meta property="og:type" content="website">
    <meta property="og:image" content="https://dropcars.in/assets/images/about-hero.png">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="<?php echo htmlspecialchars($pageTitle); ?>">
    <meta name="twitter:description" content="<?php echo htmlspecialchars($pageDesc); ?>">

    <!-- Schema.org JSON-LD -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "AboutPage",
      "name": "About Drop Cars",
      "url": "<?php echo htmlspecialchars($canonical); ?>",
      "description": "<?php echo htmlspecialchars($pageDesc); ?>",
      "mainEntity": {
        "@type": "Organization",
        "name": "Drop Cars",
        "url": "https://dropcars.in",
        "logo": "https://dropcars.in/assets/img/logo.png",
        "description": "Trusted One-Way Drop Taxi and Outstation Cab Service since 2020.",
        "foundingDate": "2020",
        "areaServed": "South India",
        "contactPoint": {
          "@type": "ContactPoint",
          "telephone": "+91<?php echo preg_replace('/\D/', '', $phone); ?>",
          "contactType": "Customer Service",
          "availableLanguage": ["Tamil", "English"],
          "hoursAvailable": "Mo-Su 00:00-23:59"
        }
      },
      "breadcrumb": {
        "@type": "BreadcrumbList",
        "itemListElement": [
          {"@type":"ListItem","position":1,"name":"Home","item":"https://dropcars.in"},
          {"@type":"ListItem","position":2,"name":"About Us","item":"<?php echo htmlspecialchars($canonical); ?>"}
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
    /* ── About-page-specific overrides ── */
    .about-values-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
    }
    @media (max-width: 900px) { .about-values-grid { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 560px) { .about-values-grid { grid-template-columns: 1fr; } }

    .about-story {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4rem;
      align-items: center;
    }
    @media (max-width: 860px) {
      .about-story { grid-template-columns: 1fr; gap: 2rem; }
      .about-story__img { order: -1; }
    }

    .about-story__img img {
      width: 100%;
      border-radius: 20px;
      box-shadow: 0 25px 60px rgba(0,0,0,0.12);
    }

    .about-story__text p {
      color: #64748b;
      line-height: 1.8;
      margin-bottom: 1rem;
      font-size: 1.02rem;
    }

    .about-team-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1.5rem;
    }
    @media (max-width: 860px) { .about-team-grid { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 500px) { .about-team-grid { grid-template-columns: 1fr; } }

    .about-fleet-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1.5rem;
    }
    @media (max-width: 860px) { .about-fleet-grid { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 500px) { .about-fleet-grid { grid-template-columns: 1fr; } }

    .team-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 18px;
      padding: 1.75rem 1.25rem;
      text-align: center;
      transition: transform 0.3s ease, box-shadow 0.3s ease;
    }
    [data-theme="dark"] .team-card,
    .dark-mode .team-card { background: #1e293b; border-color: #334155; }
    .team-card:hover { transform: translateY(-6px); box-shadow: 0 20px 40px rgba(0,0,0,0.08); }
    .team-card__avatar {
      width: 70px; height: 70px;
      border-radius: 50%;
      background: linear-gradient(135deg, #dbeafe, #eff6ff);
      display: flex; align-items: center; justify-content: center;
      font-size: 2rem;
      margin: 0 auto 1rem;
    }
    .team-card__name { font-weight: 700; color: #0f172a; margin-bottom: 0.25rem; }
    [data-theme="dark"] .team-card__name,
    .dark-mode .team-card__name { color: #f1f5f9; }
    .team-card__role { font-size: 0.85rem; color: #64748b; }

    .trust-logos {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      align-items: center;
    }
    .trust-logo-item {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 0.6rem 1.1rem;
      font-size: 0.9rem;
      font-weight: 600;
      color: #1e293b;
    }
    [data-theme="dark"] .trust-logo-item,
    .dark-mode .trust-logo-item { background: #1e293b; border-color: #334155; color: #f1f5f9; }
    </style>
</head>
<body class="<?php echo ($activeTheme['slug'] ?? '') === 'airport-taxi' ? ('theme-airporttaxi ' . (function_exists('dropcars_is_native_airporttaxi_host') && dropcars_is_native_airporttaxi_host() ? 'ati-native' : 'ati-embedded')) : ''; ?>">
<?php echo $shell->renderHeader(); ?>

<!-- ── Page Hero ── -->
<section class="page-hero">
    <div class="page-hero__orb page-hero__orb--1"></div>
    <div class="page-hero__orb page-hero__orb--2"></div>
    <div class="container page-hero__layout">
        <div class="page-hero__content reveal">
            <nav class="breadcrumb" aria-label="Breadcrumb">
                <a href="/">Home</a>
                <span class="breadcrumb__sep">›</span>
                <span class="breadcrumb__current">About Us</span>
            </nav>
            <div class="page-hero__badge">🏆 Serving Since 2020</div>
            <h1 class="page-hero__title">
                Tamil Nadu's Most <span class="accent">Trusted Drop Taxi</span> Service
            </h1>
            <p class="page-hero__desc">
                From a single car to a 500+ vehicle network, Drop Cars has been making outstation travel safe, affordable and comfortable for thousands of families, professionals and tourists across Tamil Nadu, Karnataka, Kerala & Andhra Pradesh.
            </p>
            <div class="page-hero__ctas">
                <a href="/#booking" class="btn-hero-primary">🚕 Book a Cab Now</a>
                <a href="/pages/contact.html" class="btn-hero-outline">📞 Contact Us</a>
            </div>
        </div>
        <div class="page-hero__image reveal-right">
            <img src="/assets/images/about-hero.png"
                 alt="Drop Cars professional driver with passengers – Outstation Cab Service"
                 width="500" loading="eager">
        </div>
    </div>
</section>

<!-- ── Stats Bar ── -->
<div class="container">
    <div class="stats-bar reveal">
        <div class="stat-item">
            <div class="stat-item__number count-up" data-target="50000">0</div>
            <div class="stat-item__label">Happy Passengers</div>
        </div>
        <div class="stat-item">
            <div class="stat-item__number count-up" data-target="120">0</div>
            <div class="stat-item__label">Active Routes</div>
        </div>
        <div class="stat-item">
            <div class="stat-item__number count-up" data-target="500">0</div>
            <div class="stat-item__label">Verified Drivers</div>
        </div>
        <div class="stat-item">
            <div class="stat-item__number count-up" data-target="4">0</div>
            <div class="stat-item__label">States Covered</div>
        </div>
    </div>
</div>

<!-- ── Our Story ── -->
<section class="page-section">
    <div class="container">
        <div class="about-story">
            <div class="about-story__img reveal-left">
                <img src="/assets/images/about-hero.png"
                     alt="Drop Cars founders – reliable Intercity Taxi service"
                     width="560" loading="lazy">
            </div>
            <div class="about-story__text reveal-right">
                <p class="section-eyebrow">Our Story</p>
                <h2 class="section-title">Born From a Real Travel Problem</h2>
                <p>
                    In 2020, our founder was stuck paying for a full round-trip taxi from Chennai to Tiruvannamalai when he only needed a one-way ride. He couldn't find a reliable, affordable one-way cab service. So he built one.
                </p>
                <p>
                    Drop Cars started with a mission: <strong>charge passengers only for the kilometers they actually travel.</strong> No return fare. No inflated pricing. Just honest, per-km rates.
                </p>
                <p>
                    Today, we operate across Tamil Nadu, Karnataka, Andhra Pradesh, and Kerala — covering 120+ intercity routes with police-verified, trained, English-speaking chauffeurs.
                </p>
                <p>
                    Every booking gets an instant WhatsApp confirmation with the driver's name, vehicle number and contact — so you're never left waiting and wondering.
                </p>
                <div class="trust-logos" style="margin-top: 1.5rem;">
                    <div class="trust-logo-item">🛡️ Police Verified Drivers</div>
                    <div class="trust-logo-item">✅ ISO-Inspected Vehicles</div>
                    <div class="trust-logo-item">📱 Instant WhatsApp Confirm</div>
                </div>
            </div>
        </div>
    </div>
</section>

<!-- ── Our Values ── -->
<section class="page-section" style="background: var(--surface, #f8fafc);">
    <div class="container">
        <div class="text-center reveal" style="margin-bottom: 3rem;">
            <p class="section-eyebrow" style="justify-content: center;">Why We Exist</p>
            <h2 class="section-title">Our Core Values</h2>
            <p class="section-desc" style="margin: 0 auto;">Everything we do is guided by these principles that put passengers first.</p>
        </div>
        <div class="about-values-grid">
            <div class="feature-card reveal reveal-d1">
                <div class="feature-card__icon">🔍</div>
                <h3 class="feature-card__title">Radical Transparency</h3>
                <p class="feature-card__desc">No hidden charges. Our fare breaks down to base rate + driver bata + toll. You see every rupee before you book.</p>
            </div>
            <div class="feature-card reveal reveal-d2">
                <div class="feature-card__icon">🛡️</div>
                <h3 class="feature-card__title">Safety First</h3>
                <p class="feature-card__desc">Every driver goes through police verification, background checks and vehicle inspection before their first trip.</p>
            </div>
            <div class="feature-card reveal reveal-d3">
                <div class="feature-card__icon">⏱️</div>
                <h3 class="feature-card__title">On-Time Guarantee</h3>
                <p class="feature-card__desc">We dispatch drivers early. Punctuality isn't a promise — it's a standard we enforce with every booking.</p>
            </div>
            <div class="feature-card reveal reveal-d1">
                <div class="feature-card__icon">💰</div>
                <h3 class="feature-card__title">Save 40–50%</h3>
                <p class="feature-card__desc">One-way fares eliminate the return-trip cost. Travelers save hundreds of rupees on every outstation journey.</p>
            </div>
            <div class="feature-card reveal reveal-d2">
                <div class="feature-card__icon">🌏</div>
                <h3 class="feature-card__title">Wide Coverage</h3>
                <p class="feature-card__desc">120+ intercity routes across Tamil Nadu, Karnataka, Kerala and Andhra Pradesh with consistent fleet availability.</p>
            </div>
            <div class="feature-card reveal reveal-d3">
                <div class="feature-card__icon">📞</div>
                <h3 class="feature-card__title">24/7 Live Support</h3>
                <p class="feature-card__desc">Real humans answer your calls and WhatsApp messages round the clock. No bots, no IVR maze — just helpful agents.</p>
            </div>
        </div>
    </div>
</section>

<!-- ── Our Fleet ── -->
<section class="page-section">
    <div class="container">
        <div class="text-center reveal" style="margin-bottom: 3rem;">
            <p class="section-eyebrow" style="justify-content: center;">Our Fleet</p>
            <h2 class="section-title">Vehicles for Every Journey</h2>
            <p class="section-desc" style="margin: 0 auto;">From budget sedans to premium Innova Crysta, all vehicles are AC, clean, and GPS-monitored.</p>
        </div>
        <div class="about-fleet-grid">
            <?php
            $fleet = [
                ['name' => 'Sedan', 'img' => '/assets/images/vehicles/sedan.png', 'desc' => 'Toyota Etios / Swift Dzire', 'capacity' => '4 Passengers'],
                ['name' => 'SUV', 'img' => '/assets/images/vehicles/suv.png', 'desc' => 'Ertiga / Maruti Ertiga', 'capacity' => '6 Passengers'],
                ['name' => 'Innova', 'img' => '/assets/images/vehicles/innova.png', 'desc' => 'Toyota Innova', 'capacity' => '6 Passengers'],
                ['name' => 'Crysta', 'img' => '/assets/images/vehicles/crysta.png', 'desc' => 'Innova Crysta', 'capacity' => '6 Passengers'],
            ];
            foreach ($fleet as $i => $v):
            ?>
            <div class="feature-card reveal reveal-d<?php echo $i + 1; ?>" style="text-align: center; padding: 1.5rem 1rem;">
                <img src="<?php echo $v['img']; ?>" alt="<?php echo $v['name']; ?> taxi" style="width: 100%; height: 120px; object-fit: contain; margin-bottom: 1rem;" loading="lazy" onerror="this.style.display='none'">
                <h3 class="feature-card__title"><?php echo $v['name']; ?></h3>
                <p class="feature-card__desc"><?php echo $v['desc']; ?></p>
                <p style="font-size: 0.8rem; color: #2563eb; font-weight: 600; margin-top: 0.5rem;">👥 <?php echo $v['capacity']; ?></p>
            </div>
            <?php endforeach; ?>
        </div>
    </div>
</section>

<!-- ── How it Works ── -->
<section class="page-section" style="background: var(--surface, #f8fafc);">
    <div class="container">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4rem; align-items: center;">
            <div class="reveal-left">
                <p class="section-eyebrow">How It Works</p>
                <h2 class="section-title">Book Your Taxi in 3 Easy Steps</h2>
                <p class="section-desc" style="margin-bottom: 2.5rem;">Our streamlined process gets your cab confirmed in under 2 minutes.</p>
                <div class="timeline">
                    <div class="timeline-step reveal reveal-d1">
                        <div class="timeline-step__dot">1</div>
                        <h3 class="timeline-step__title">Enter Your Route</h3>
                        <p class="timeline-step__desc">Type your pickup and drop locations. Our system calculates distance and fare instantly.</p>
                    </div>
                    <div class="timeline-step reveal reveal-d2">
                        <div class="timeline-step__dot">2</div>
                        <h3 class="timeline-step__title">Choose Your Vehicle</h3>
                        <p class="timeline-step__desc">Pick from Sedan, SUV, Innova or Crysta based on your group size and comfort.</p>
                    </div>
                    <div class="timeline-step reveal reveal-d3">
                        <div class="timeline-step__dot">3</div>
                        <h3 class="timeline-step__title">Confirm & Relax</h3>
                        <p class="timeline-step__desc">Get instant WhatsApp confirmation with driver details. Track your ride live.</p>
                    </div>
                </div>
            </div>
            <div class="reveal-right" style="position: relative;">
                <div class="cta-banner">
                    <div class="floating-badge" style="margin-bottom: 1rem;">✦ Start Your Journey</div>
                    <h3 class="cta-banner__title">Ready for Your First Drop Cars Trip?</h3>
                    <p class="cta-banner__desc">Join 50,000+ happy passengers who trust Drop Cars for every outstation journey.</p>
                    <div class="cta-banner__btns">
                        <a href="/#booking" class="btn-cta-white">Book Now →</a>
                        <a href="tel:+91<?php echo preg_replace('/\D/', '', $phone); ?>" class="btn-cta-outline-white">📞 Call Us</a>
                    </div>
                </div>
            </div>
        </div>
    </div>
</section>

<!-- ── FAQ ── -->
<section class="page-section">
    <div class="container" style="max-width: 760px;">
        <div class="text-center reveal" style="margin-bottom: 3rem;">
            <p class="section-eyebrow" style="justify-content: center;">FAQ</p>
            <h2 class="section-title">Common Questions About Drop Cars</h2>
        </div>
        <?php
        $faqs = [
            ["What is a one-way drop taxi?", "A one-way drop taxi charges you only for the outbound distance. You don't pay for the driver returning to the base city — saving you 40–50% compared to traditional taxis."],
            ["Are your drivers police-verified?", "Yes. Every Drop Cars driver undergoes police verification, background check and vehicle inspection before being onboarded. You receive the driver's full details before pickup."],
            ["Do you serve all cities in Tamil Nadu?", "We cover 120+ routes across Tamil Nadu, including all major cities like Chennai, Coimbatore, Madurai, Trichy, Salem, Vellore, Tirunelveli and border towns in Karnataka, Andhra Pradesh and Kerala."],
            ["How do I get my booking confirmation?", "You receive an instant WhatsApp confirmation with driver name, vehicle number and contact within minutes of booking. You can also track your driver live on the map."],
            ["What is the cancellation policy?", "Free cancellation up to 4 hours before pickup. Contact our 24/7 support via WhatsApp or call for any changes."],
        ];
        foreach ($faqs as $i => $faq):
        ?>
        <div class="faq-item reveal" id="faq-about-<?php echo $i; ?>">
            <button class="faq-question" onclick="toggleFaq(this)" aria-expanded="false">
                <?php echo htmlspecialchars($faq[0]); ?>
                <span class="faq-question__icon" aria-hidden="true">+</span>
            </button>
            <div class="faq-answer">
                <p><?php echo htmlspecialchars($faq[1]); ?></p>
            </div>
        </div>
        <?php endforeach; ?>
    </div>
</section>

<!-- ── Final CTA ── -->
<section class="page-section--sm">
    <div class="container">
        <div class="cta-banner reveal">
            <h2 class="cta-banner__title">Drive With Drop Cars Across South India</h2>
            <p class="cta-banner__desc">Transparent fares · Police-verified drivers · Instant WhatsApp confirmation · 24/7 support</p>
            <div class="cta-banner__btns">
                <a href="/#booking" class="btn-cta-white">🚕 Book Your Cab</a>
                <a href="/pages/driver-partner.php" class="btn-cta-outline-white">Become a Driver Partner</a>
            </div>
        </div>
    </div>
</section>

<?php echo $shell->renderFooter(); ?>

<!-- Scroll Reveal + Counter + FAQ JS -->
<script>
(function() {
    // ── Scroll Reveal ──
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });
    document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale').forEach(el => observer.observe(el));

    // ── Counter Animation ──
    function animateCount(el) {
        const target = parseInt(el.dataset.target, 10);
        const suffix = el.dataset.suffix || '';
        const duration = 2000;
        let start = null;
        function step(ts) {
            if (!start) start = ts;
            const progress = Math.min((ts - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.floor(eased * target).toLocaleString('en-IN') + suffix;
            if (progress < 1) requestAnimationFrame(step);
            else el.textContent = target.toLocaleString('en-IN') + suffix;
        }
        requestAnimationFrame(step);
    }
    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !entry.target.dataset.counted) {
                entry.target.dataset.counted = '1';
                animateCount(entry.target);
            }
        });
    }, { threshold: 0.3 });
    document.querySelectorAll('.count-up').forEach(el => counterObserver.observe(el));

    // ── FAQ Toggle ──
    window.toggleFaq = function(btn) {
        const item = btn.closest('.faq-item');
        const isOpen = item.classList.contains('open');
        document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
        if (!isOpen) item.classList.add('open');
        btn.setAttribute('aria-expanded', (!isOpen).toString());
    };
})();
</script>
<?php echo $shell->renderScripts(); ?>
</body>
</html>
