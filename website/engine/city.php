<?php
/**
 * Enhanced Dynamic City Hub Generator for Drop Cars
 */
require_once __DIR__ . '/../includes/check-blocked-main.php';
require_once __DIR__ . '/../includes/paths.php';
require_once __DIR__ . '/seo-core.php';
require_once __DIR__ . '/shell.php';
require_once __DIR__ . '/content-blocks.php';
require_once __DIR__ . '/theme-seo.php';
if (!defined('DROP_CARS_DB_OPTIONAL')) define('DROP_CARS_DB_OPTIONAL', true);
require_once __DIR__ . '/../admin/config/database.php';
require_once __DIR__ . '/../includes/customer-prefill.php';
$_pfPdo = (isset($pdo) && $pdo instanceof PDO) ? $pdo : (isset($GLOBALS['db']) && $GLOBALS['db'] instanceof PDO ? $GLOBALS['db'] : null);
[$_pfName, $_pfEmail, $_pfNational, , $_pfCC] = dropcars_customer_prefill($_pfPdo);

// Real aggregateRating for the LocalBusiness schema below, computed from
// actual approved reviews - see pages/airport-transfer.php for the same
// pattern. Omitted entirely (not faked) when there are 0 approved reviews.
$aggregateRating = null;
if ($_pfPdo) {
    try {
        $stmt = $_pfPdo->query("SELECT COUNT(*) AS cnt, AVG(rating) AS avg_rating FROM reviews WHERE is_approved = 1");
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row && (int) $row['cnt'] > 0) {
            $aggregateRating = [
                'ratingValue' => round((float) $row['avg_rating'], 1),
                'reviewCount' => (int) $row['cnt'],
            ];
        }
    } catch (Throwable $e) {
        error_log('city.php aggregateRating lookup failed: ' . $e->getMessage());
    }
}

$seo = new SEOCore();

$citySlug = $_GET['city'] ?? '';
$cityData = $seo->getCityBySlug($citySlug);

if (!$cityData) {
    // Typo-tolerance: before giving up with a hard 404, see if this is a
    // near-miss on a real, known city (e.g. /kotkupm instead of
    // /kottakuppam) and 301-redirect to the correct page instead of
    // showing the visitor a dead end.
    $knownCitySlugs = [];
    if (is_array($seo->cities)) {
        foreach ($seo->cities as $c) {
            if (isset($c['slug']) && $c['slug'] !== '') {
                $knownCitySlugs[] = (string) $c['slug'];
            }
        }
    }
    $correctedCitySlug = function_exists('dropcars_find_closest_slug')
        ? dropcars_find_closest_slug((string) $citySlug, $knownCitySlugs)
        : null;

    if ($correctedCitySlug !== null && $correctedCitySlug !== $citySlug) {
        $redirectThemeSlug = trim((string) ($_GET['theme'] ?? 'drop-cars')) ?: 'drop-cars';
        $redirectDest = dropcars_theme_page_url($redirectThemeSlug, $correctedCitySlug);
        parse_str($_SERVER['QUERY_STRING'] ?? '', $redirectQueryParams);
        unset($redirectQueryParams['city'], $redirectQueryParams['theme']);
        $redirectNewQuery = http_build_query($redirectQueryParams);
        header('Location: ' . $redirectDest . ($redirectNewQuery ? '?' . $redirectNewQuery : ''), true, 301);
        exit;
    }

    header("HTTP/1.0 404 Not Found");
    echo "<h1>404 Not Found</h1><p>City not found.</p>";
    exit;
}

$subdomainCity = dropcars_get_subdomain_city_slug();
$isStateHub = ($cityData['state'] === 'Tamil Nadu');
$heroBg = ($subdomainCity === 'chennai') ? '/assets/img/chennai-hero-bg.png' : '/assets/img/hero-bg.jpg';

if (function_exists('dropcars_redirect_to_subdomain_if_needed')) {
    dropcars_redirect_to_subdomain_if_needed($citySlug, $_GET['section'] ?? null);
}

$themeSlug = trim((string) ($_GET['theme'] ?? 'drop-cars'));
$themesPath = __DIR__ . '/../data/themes.json';
$allThemes = is_file($themesPath) ? json_decode(file_get_contents($themesPath), true) : [];
$activeTheme = null;
foreach ($allThemes as $theme) {
    if (($theme['slug'] ?? '') === $themeSlug || ($theme['id'] ?? '') === $themeSlug) {
        $activeTheme = $theme;
        break;
    }
}
if (!$activeTheme) {
    $activeTheme = ['id' => 'drop-cars', 'name' => 'Drop Cars', 'slug' => 'drop-cars'];
}

$activeTheme = dropcars_merge_theme_seo($activeTheme);
$contentBlocks = new ContentBlocks($activeTheme);

$themeName = $activeTheme['name'];
$shell = new UIShell($activeTheme, $allThemes);

$configPath = __DIR__ . '/../data/config.json';
$configData = is_file($configPath) ? json_decode(file_get_contents($configPath), true) : [];
$fares = $configData['fares'] ?? [];
if (!function_exists('get_home_rate')) {
    function get_home_rate($vehicle, $tripType = 'oneway') {
        global $fares;
        $key = ($tripType === 'oneway') ? 'baseFareOneWay' : 'baseFareRoundTrip';
        if (isset($fares[$key][$vehicle])) {
            return (int) $fares[$key][$vehicle];
        }
        $fallbacks = [
            'oneway' => [
                'SEDAN' => 14,
                'COMFORT_SEDAN' => 15,
                'ELITE_SEDAN' => 16,
                'SUV' => 19,
                'INNOVA' => 20,
                'CRYSTA' => 23
            ],
            'round' => [
                'SEDAN' => 13,
                'COMFORT_SEDAN' => 14,
                'ELITE_SEDAN' => 15,
                'SUV' => 18,
                'INNOVA' => 18,
                'CRYSTA' => 21
            ]
        ];
        return $fallbacks[$tripType === 'oneway' ? 'oneway' : 'round'][$vehicle] ?? 0;
    }
}

$cityCtx = ['city' => $cityData['city']];
$title = dropcars_theme_expand($activeTheme, dropcars_theme_get($activeTheme, 'cityMetaTitleTpl', '{{themeName}} in {{city}} | One-Way Drop Taxi & Outstation Cab Booking'), $cityCtx);
$description = dropcars_theme_expand($activeTheme, dropcars_theme_get($activeTheme, 'cityMetaDescTpl', 'Book premium {{themeName}} in {{city}}. Enjoy fixed flat-rate pricing, professional verified drivers, and instant booking confirmation via WhatsApp.'), $cityCtx);

$routes = $seo->getPopularRoutesFrom($citySlug, 60);
$linkThemeSlug = $activeTheme['slug'] ?? $themeSlug;

$citySectionSlug = isset($_GET['section']) ? trim((string) $_GET['section']) : '';
if ($citySectionSlug !== '' && !dropcars_city_section_is_valid_slug($citySectionSlug)) {
    header('HTTP/1.0 404 Not Found');
    echo '<h1>404 Not Found</h1>';
    exit;
}
$pageScrollToId = ($citySectionSlug !== '') ? dropcars_city_section_element_id($citySectionSlug) : null;

// ── Compute city SEO description early so it can appear in the hero section ──
$_heroSeoCity  = $cityData['city'];
$_heroSeoState = $cityData['state'];
$_heroSeoDesc  = "As a key hub for {$_heroSeoState} tourism, {$_heroSeoCity} is the perfect starting point to embark on historical sightseeing journeys, temple tours, and scenic hill station getaways. At Drop Cars, we provide premium outstation taxi services and intercity tourist cabs designed for a safe, comfortable, and seamless travel experience.";
$_heroCLow = strtolower($citySlug);
if ($_heroCLow === 'chennai') {
    $_heroSeoDesc = "As Tamil Nadu's primary gateway for tourism, Chennai is the perfect starting point to embark on historical sightseeing journeys, temple tours, and scenic hill station getaways. At Drop Cars, we provide a premium Outstation Cab Service and Intercity Taxi designed for a safe, comfortable, and seamless travel experience. Book a Fixed Per-KM Rate One-Way Drop Taxi or a customized round-trip cab package with Zero Return Fares.";
} elseif ($_heroCLow === 'madurai') {
    $_heroSeoDesc = "Known as the cultural heart of Tamil Nadu, Madurai is famous for the towering Meenakshi Amman Temple. It serves as a vital transit hub for pilgrims and travelers headed to Rameshwaram, Kanyakumari, and the hill stations of Kodaikanal and Munnar. Drop Cars provides reliable, professional outstation taxi services from Madurai with transparent pricing.";
} elseif ($_heroCLow === 'coimbatore') {
    $_heroSeoDesc = "As the industrial and textile capital of Tamil Nadu, Coimbatore is the gateway to some of the region's most pristine hill stations, including Ooty, Coonoor, Valparai, and the pristine landscapes of Munnar and Wayanad. Drop Cars offers a Coimbatore Outstation Taxi service and One-Way Drop Taxi bookings from Coimbatore.";
} elseif ($_heroCLow === 'trichy') {
    $_heroSeoDesc = "Tiruchirappalli, the ancient city of the Rock Fort Temple, sits at the heart of Tamil Nadu and is one of the most strategically located transit hubs for pilgrims and outstation travelers. Drop Cars provides a reliable Intercity Taxi service and Fixed Per-KM Rate one-way drops from Trichy to destinations across Tamil Nadu and Karnataka.";
} elseif ($_heroCLow === 'salem') {
    $_heroSeoDesc = "Salem, the 'Mango City' of Tamil Nadu, serves as a key crossroads between Chennai, Coimbatore, and Bengaluru. Drop Cars offers an Outstation Cab Service and Fixed Per-KM Rate one-way drop taxis from Salem to major cities across Tamil Nadu and Karnataka.";
} elseif ($_heroCLow === 'tirunelveli') {
    $_heroSeoDesc = "Tirunelveli, the city of the iconic Halwa and the ancient Nellaiappar Temple, is a major hub for outstation travel in southern Tamil Nadu. Drop Cars offers reliable intercity taxi services and one-way drop cabs from Tirunelveli to destinations across Tamil Nadu.";
} elseif ($_heroCLow === 'vellore') {
    $_heroSeoDesc = "Vellore, home to the magnificent Vellore Fort and CMC Hospital, is a key medical and historical destination in Tamil Nadu. Drop Cars offers premium outstation taxi services and one-way drops from Vellore to Chennai, Bangalore, and beyond.";
} elseif ($_heroCLow === 'bangalore') {
    $_heroSeoDesc = "Bengaluru, the Silicon Valley of India, is a major gateway for Outstation Cab Service across Karnataka and Tamil Nadu. Drop Cars offers a reliable Intercity Taxi, One-Way Drop Taxi, and outstation cabs from Bengaluru to Chennai, Mysore, Coimbatore, and beyond.";
} elseif ($_heroCLow === 'pondicherry' || $_heroCLow === 'puducherry') {
    $_heroSeoDesc = "With its unique blend of French colonial heritage, quiet beaches, and spiritual retreats like Auroville, Pondicherry is one of India's favorite tourist destinations. Drop Cars provides premium outstation taxi services and reliable one-way drop cabs for travelers going to Chennai, Bangalore, Chidambaram, or Cuddalore.";
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="<?php echo htmlspecialchars($description, ENT_QUOTES, 'UTF-8'); ?>" />
    <meta name="keywords" content="<?php echo htmlspecialchars(dropcars_theme_get($activeTheme, 'seoKeywords', 'one way taxi, outstation cab, intercity taxi, Tamil Nadu'), ENT_QUOTES, 'UTF-8'); ?>" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <link rel="canonical" href="<?php echo htmlspecialchars(dropcars_canonical_request_url(), ENT_QUOTES, 'UTF-8'); ?>" />
    <title><?php echo htmlspecialchars($title, ENT_QUOTES, 'UTF-8'); ?></title>

    <!-- Open Graph Meta Tags -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="<?php echo htmlspecialchars(dropcars_canonical_request_url(), ENT_QUOTES, 'UTF-8'); ?>" />
    <meta property="og:title" content="<?php echo htmlspecialchars($title, ENT_QUOTES, 'UTF-8'); ?>" />
    <meta property="og:description" content="<?php echo htmlspecialchars($description, ENT_QUOTES, 'UTF-8'); ?>" />
    <meta property="og:image" content="https://dropcars.in/assets/img/og-cover.jpg" />
    <meta property="og:site_name" content="Drop Cars" />
    <meta property="og:locale" content="en_IN" />

    <!-- Twitter Card Meta Tags -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="<?php echo htmlspecialchars($title, ENT_QUOTES, 'UTF-8'); ?>" />
    <meta name="twitter:description" content="<?php echo htmlspecialchars($description, ENT_QUOTES, 'UTF-8'); ?>" />
    <meta name="twitter:image" content="https://dropcars.in/assets/img/og-cover.jpg" />

    <!-- Schema Structured Data -->
    <?php
    $_cityLocalBusiness = [
        '@type' => 'LocalBusiness',
        'name' => 'Drop Cars',
        'telephone' => '+917598899579',
        'priceRange' => '₹₹',
    ];
    // Only attach aggregateRating when there's real, approved review data
    // behind it (computed above) - never a placeholder rating.
    if ($aggregateRating !== null) {
        $_cityLocalBusiness['aggregateRating'] = [
            '@type' => 'AggregateRating',
            'ratingValue' => $aggregateRating['ratingValue'],
            'reviewCount' => $aggregateRating['reviewCount'],
        ];
    }
    $_cityTaxiServiceSchema = [
        '@context' => 'https://schema.org',
        '@type' => 'TaxiService',
        'name' => $themeName . ' in ' . $cityData['city'],
        'description' => $description,
        'url' => dropcars_canonical_request_url(),
        'provider' => $_cityLocalBusiness,
        'areaServed' => ['@type' => 'AdministrativeArea', 'name' => $cityData['city']],
    ];
    ?>
    <script type="application/ld+json"><?php echo json_encode($_cityTaxiServiceSchema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); ?></script>
    <?php
    $_cityBreadcrumb = [
        '@context' => 'https://schema.org',
        '@type' => 'BreadcrumbList',
        'itemListElement' => [
            ['@type' => 'ListItem', 'position' => 1, 'name' => 'Home', 'item' => 'https://dropcars.in'],
            ['@type' => 'ListItem', 'position' => 2, 'name' => $cityData['city'], 'item' => dropcars_canonical_request_url()],
        ],
    ];
    ?>
    <script type="application/ld+json"><?php echo json_encode($_cityBreadcrumb, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); ?></script>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Do you offer one-way drops from <?php echo htmlspecialchars($cityData['city'], ENT_QUOTES, 'UTF-8'); ?>?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes, we specialize in one-way drop taxis. You only pay for the one-way distance to your destination, with no return fare charges. This saves you up to 50% on long distance travel."
          }
        },
        {
          "@type": "Question",
          "name": "How can I book a cab from <?php echo htmlspecialchars($cityData['city'], ENT_QUOTES, 'UTF-8'); ?>?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "You can book through our website form for an instant quote, or call our 24/7 helpline at +91 7200217986 for immediate assistance. We offer instant confirmation via WhatsApp."
          }
        },
        {
          "@type": "Question",
          "name": "What vehicle options are available?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "We provide a wide range of vehicles including premium Sedans (Dzire/Etios), SUVs (Ertiga/Marazzo), and premium carriers like Innova Crysta. All cars are GPS-tracked and sanitized."
          }
        },
        {
          "@type": "Question",
          "name": "Are there any hidden night charges?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No, we maintain transparent pricing with no extra night surcharge or driver bata surprises. Toll, parking, and state permit taxes are extra as per actuals."
          }
        },
        {
          "@type": "Question",
          "name": "Are tolls and state permits included in city hub outstation fares?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Base per-km rates cover the vehicle and driver. Tolls, parking, and state entry permit taxes are charged extra at actuals unless an all-inclusive package is selected."
          }
        },
        {
          "@type": "Question",
          "name": "What is the cancellation policy for bookings from <?php echo htmlspecialchars($cityData['city'], ENT_QUOTES, 'UTF-8'); ?>?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "We offer flexible cancellation with zero penalty when canceled prior to driver dispatch. 24/7 support is available for instant adjustments."
          }
        }
      ]
    }
    </script>

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    
    <?php $bp = function_exists('dropcars_base_path') ? rtrim(dropcars_base_path(), '/') : ''; ?>
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/base.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/base.css'); ?>" />
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/layout.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/layout.css'); ?>" />
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/navbar.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/navbar.css'); ?>" />
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/hero.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/hero.css'); ?>" />
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/booking-form.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/booking-form.css'); ?>" />
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/vehicle-section.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/vehicle-section.css'); ?>" />
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/city-routes.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/city-routes.css'); ?>" />
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/footer.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/footer.css'); ?>" />
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/responsive.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/responsive.css'); ?>" />
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/whatsapp.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/whatsapp.css'); ?>" />
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/ai-assistant.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/ai-assistant.css'); ?>" />
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/faq.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/faq.css'); ?>" />
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/seo-content.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/seo-content.css'); ?>" />
    <script>window.DROP_CARS_BASE_PATH = <?php echo json_encode(dropcars_base_path(), JSON_HEX_TAG | JSON_HEX_AMP); ?>;</script>
    <script>
    window.DROP_CARS_THEME_SLUG = <?php echo json_encode($linkThemeSlug, JSON_HEX_TAG | JSON_HEX_AMP); ?>;
    window.DROP_CARS_PAGE_SECTION_BASE = <?php echo json_encode(dropcars_theme_page_url($linkThemeSlug, $citySlug), JSON_HEX_TAG | JSON_HEX_AMP); ?>;
    window.DROP_CARS_PAGE_SECTION_ID_TO_SLUG = <?php echo json_encode(array_flip(dropcars_city_section_map()), JSON_UNESCAPED_UNICODE); ?>;
    </script>

    <style>
        .city-hero {
            background: url('<?php echo htmlspecialchars(dropcars_url('assets/img/hero-light-bg-v4.png'), ENT_QUOTES, 'UTF-8'); ?>') center center / cover no-repeat;
            padding: 1rem 0;
            position: relative;
            overflow: clip; /* clip contains bg slides; unlike 'hidden' it doesn't clip overflow:visible children */
            color: #0f172a;
            transition: background 0.3s;
        }
        .city-hero::before {
            content: "";
            position: absolute;
            inset: 0;
            background: linear-gradient(
                110deg,
                rgba(14, 165, 233, 0.32) 0%,
                rgba(99, 102, 241, 0.26) 38%,
                rgba(168, 85, 247, 0.22) 70%,
                rgba(186, 230, 253, 0.85) 100%
            );
            z-index: 1;
            pointer-events: none;
        }

        .city-hero__content {
            position: relative;
            z-index: 3;
        }
        .breadcrumbs {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            margin-bottom: 1rem;
            font-size: 0.9rem;
        }
        @media (min-width: 992px) {
            .breadcrumbs { justify-content: flex-start; }
            .hero__copy { text-align: left !important; }
        }
        .breadcrumbs a { color: #0369a1; text-decoration: none; }
        .breadcrumbs span { color: #94a3b8; }

        .city-hero h1 {
            color: #ffffff !important;
            font-size: clamp(2.2rem, 5vw, 3rem);
            margin-bottom: 0.75rem;
            font-weight: 800;
            letter-spacing: -0.03em;
            text-shadow: none;
        }
        .hero__layout {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1.5rem !important;
            text-align: center;
        }
        .city-hero .container {
            max-width: 1280px;
            width: 94%;
        }



        /* Recent route page color corrections applied to city page */
        /* Recent route page color corrections applied to city page */
        html.dark-mode body.city-page .quote-modal__card {
            background: #0f1c2e;
            border: 1px solid rgba(255, 255, 255, 0.16);
            color: #fff;
        }
        html.dark-mode body.city-page .quote-modal__close {
            background: rgba(255, 255, 255, 0.14);
            color: #fff;
        }
        html.dark-mode body.city-page .quote-modal--estimate-mode .quote-modal__meta {
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.2);
        }
        html.dark-mode body.city-page .fare-list-header {
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.2);
        }
        html.dark-mode body.city-page .fare-list-header__title,
        html.dark-mode body.city-page .fare-list-header__route,
        html.dark-mode body.city-page .fare-list-header__time,
        html.dark-mode body.city-page .quote-fare-type-title,
        html.dark-mode body.city-page .quote-modal__meta,
        html.dark-mode body.city-page #quote-route,
        html.dark-mode body.city-page #quote-fare {
            color: #fff;
        }
        html.dark-mode body.city-page .quote-fare-type-toggle {
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(255, 255, 255, 0.2);
            color: #fff;
        }
        html.dark-mode body.city-page .quote-fare-type-toggle__option {
            color: rgba(255, 255, 255, 0.8);
        }
        html.dark-mode body.city-page .vehicle-card--fare-option {
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.22);
        }
        html.dark-mode body.city-page .vehicle-card--fare-option.active {
            background: linear-gradient(180deg, #143761 0%, #0c2a4f 100%);
            border-color: #2bc4ff;
            box-shadow: 0 8px 16px rgba(4, 18, 37, 0.46);
        }
        html.dark-mode body.city-page .vehicle-card__title-line,
        html.dark-mode body.city-page .vehicle-card__title-line small,
        html.dark-mode body.city-page .vehicle-card__meta,
        html.dark-mode body.city-page .vehicle-card__distance,
        html.dark-mode body.city-page .vehicle-card__price {
            color: #fff;
        }
        html.dark-mode body.city-page .selected-fare-card {
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.2);
        }
        html.dark-mode body.city-page .selected-fare-card__fare-title,
        html.dark-mode body.city-page .selected-fare-card__details h4,
        html.dark-mode body.city-page .selected-fare-card__details h4 small,
        html.dark-mode body.city-page .selected-fare-card__meta,
        html.dark-mode body.city-page .selected-fare-card__distance,
        html.dark-mode body.city-page .selected-fare-card__amount {
            color: #fff;
        }
        html.dark-mode body.city-page .selected-fare-card__toggle {
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(255, 255, 255, 0.2);
            color: #fff;
        }
        html.dark-mode body.city-page .selected-fare-card__toggle input:checked + .selected-fare-card__option--base + .selected-fare-card__switch {
            background: #2bc4ff;
        }
        html.dark-mode body.city-page .selected-fare-card__toggle input:not(:checked) + .selected-fare-card__option--base {
            color: #fff;
            opacity: 1;
        }
        html.dark-mode body.city-page .selected-fare-card__toggle input:checked ~ .selected-fare-card__option--inclusive {
            color: #fff;
            opacity: 1;
        }
        html.dark-mode body.city-page .selected-fare-card__option {
            color: rgba(255, 255, 255, 0.85);
        }
        html.dark-mode body.city-page .quote-modal__actions .btn-outline {
            background: transparent !important;
            color: #fff !important;
            border: 2px solid rgba(255, 255, 255, 0.6) !important;
        }
        html.dark-mode body.city-page .quote-modal__actions .btn-outline:hover {
            border-color: #fff !important;
            background: rgba(255, 255, 255, 0.08) !important;
            color: #fff !important;
        }
        html.dark-mode body.city-page .quote-modal__actions .btn-primary,
        html.dark-mode body.city-page .quote-modal .quote-btn--confirm {
            background: linear-gradient(120deg, #0f1c2e, #152a45) !important;
            color: #fff !important;
            border: 2px solid #2eb5ff !important;
            box-shadow: 0 4px 16px rgba(46, 181, 255, 0.25) !important;
        }
        html.dark-mode body.city-page .quote-modal__actions .btn-primary:hover,
        html.dark-mode body.city-page .quote-modal .quote-btn--confirm:hover {
            border-color: #5cc5ff;
            box-shadow: 0 6px 20px rgba(46, 181, 255, 0.35);
        }
        body.city-page .city-hero__seo-intro {
            font-size: 0.88rem;
            color: #475569;
            line-height: 1.6;
            max-width: 520px;
            margin: 0 auto 1.25rem;
            background: rgba(255, 255, 255, 0.7);
            border-radius: 12px;
            padding: 0.85rem 1.1rem;
            border-left: 3px solid #0ea5e9;
            border-top: 1px solid rgba(14, 165, 233, 0.1);
            border-right: 1px solid rgba(14, 165, 233, 0.1);
            border-bottom: 1px solid rgba(14, 165, 233, 0.1);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
            display: block;
        }
        @media (min-width: 992px) {
            body.city-page .city-hero__seo-intro {
                font-size: 0.92rem;
                padding: 0.95rem 1.2rem;
            }
        }
        html.dark-mode body.city-page .city-hero__seo-intro {
            color: #cbd5e1;
            background: rgba(15, 28, 46, 0.6);
            border-color: rgba(43, 196, 255, 0.2);
            border-left-color: #2bc4ff;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
        }
    </style>
    <script>
        window.activeThemeName = <?php echo json_encode($themeName, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE); ?>;
        window.activeThemeId = <?php echo json_encode($activeTheme['id'] ?? $themeSlug, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE); ?>;
    </script>
    <link rel="stylesheet" href="/assets/css/stats-strip.css">
    <link rel="stylesheet" href="/assets/css/animations.css">
    <link rel="stylesheet" href="/assets/css/dark-mode.css?v=2.0">
    <link rel="stylesheet" href="/assets/css/light-theme.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/light-theme.css'); ?>">
    <?php if (($activeTheme['slug'] ?? '') === 'airport-taxi'): ?>
    <link rel="stylesheet" href="/assets/css/theme-airporttaxi.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/theme-airporttaxi.css'); ?>">
    <?php endif; ?>
    <script src="/assets/js/dark-mode.js?v=2.0"></script>
<?php include __DIR__ . '/../includes/google-tag.php'; ?>
</head>
<body class="city-page <?php echo ($activeTheme['slug'] ?? '') === 'airport-taxi' ? ('theme-airporttaxi ' . (function_exists('dropcars_is_native_airporttaxi_host') && dropcars_is_native_airporttaxi_host() ? 'ati-native' : 'ati-embedded')) : ''; ?>" data-active-theme-id="<?php echo htmlspecialchars($activeTheme['id'] ?? $themeSlug, ENT_QUOTES, 'UTF-8'); ?>" data-page-scroll-to="<?php echo htmlspecialchars($pageScrollToId ?? '', ENT_QUOTES, 'UTF-8'); ?>">
    <?php echo $shell->renderHeader(); ?>

    <main>
        <section class="city-hero hero" id="booking">
            <!-- Background Image Slideshow -->
            <div class="hero-slider">
                <div class="hero-slide active">
                    <div class="hero-slide__bg" style="background-image: url('/assets/img/hero-slide-1.png');"></div>
                </div>
                <div class="hero-slide">
                    <div class="hero-slide__bg" style="background-image: url('/assets/img/hero-slide-2.png');"></div>
                </div>
                <div class="hero-slide">
                    <div class="hero-slide__bg" style="background-image: url('/assets/img/hero-slide-3.png');"></div>
                </div>
                <div class="hero-slide">
                    <div class="hero-slide__bg" style="background-image: url('/assets/img/hero-slide-5.png');"></div>
                </div>
                <div class="hero-slide">
                    <div class="hero-slide__bg" style="background-image: url('/assets/img/hero-slide-4.png');"></div>
                </div>
            </div>

            <div class="container hero__layout">
                <div class="hero__copy">
                    <nav class="breadcrumb" aria-label="Breadcrumb" style="margin-bottom:0.6rem;">
                        <a href="/" style="color:rgba(255,255,255,0.7);">Home</a>
                        <span class="breadcrumb__sep" style="color:rgba(255,255,255,0.4);">›</span>
                        <a href="/services" style="color:rgba(255,255,255,0.7);">Services</a>
                        <span class="breadcrumb__sep" style="color:rgba(255,255,255,0.4);">›</span>
                        <span class="breadcrumb__current" style="color:#ffffff;"><?php echo htmlspecialchars($cityData['city']); ?> Taxi</span>
                    </nav>
                    <!-- Text Slideshow -->
                    <div class="hero-slider-text">
                        <div class="hero-text-slide active">
                            <div class="hero__eyebrow">✦ Official Booking in <?php echo htmlspecialchars($cityData['city']); ?></div>
                            <h1><?php echo htmlspecialchars($title); ?></h1>
                            <p class="hero__sub"><?php echo htmlspecialchars($description); ?></p>
                        </div>
                        <div class="hero-text-slide">
                            <div class="hero__eyebrow">✦ #1 Taxi Service in <?php echo htmlspecialchars($cityData['city']); ?></div>
                            <h1><?php echo htmlspecialchars($themeName); ?> in <?php echo htmlspecialchars($cityData['city']); ?></h1>
                            <p class="hero__sub"><?php echo htmlspecialchars(dropcars_theme_expand($activeTheme, dropcars_theme_get($activeTheme, 'cityHeroIntro', 'Book ' . $themeName . ' from ' . $cityData['city'] . ' for one-way drops and outstation travel with clear fares and verified drivers.'), $cityCtx), ENT_QUOTES, 'UTF-8'); ?></p>
                        </div>
                        <div class="hero-text-slide">
                            <div class="hero__eyebrow">✦ Pay One-Way Only</div>
                            <h1>One-Way Drop Taxi from <?php echo htmlspecialchars($cityData['city']); ?></h1>
                            <p class="hero__sub">Book a One-Way Drop Taxi from <?php echo htmlspecialchars($cityData['city']); ?> to major cities across Tamil Nadu, Karnataka &amp; Andhra Pradesh with Zero Return Fares and transparent per-km billing.</p>
                        </div>
                        <div class="hero-text-slide">
                            <div class="hero__eyebrow">✦ Outstation &amp; Round Trips</div>
                            <h1>Affordable Outstation Taxi in <?php echo htmlspecialchars($cityData['city']); ?></h1>
                            <p class="hero__sub">Plan smooth round trips and long distance outstation travel from <?php echo htmlspecialchars($cityData['city']); ?> with verified chauffeurs and zero hidden fees.</p>
                        </div>
                        <div class="hero-text-slide">
                            <div class="hero__eyebrow">✦ 24/7 Airport Transfers</div>
                            <h1>Punctual Airport Taxi in <?php echo htmlspecialchars($cityData['city']); ?></h1>
                            <p class="hero__sub">Reliable airport transfers connecting <?php echo htmlspecialchars($cityData['city']); ?> to nearest airports with guaranteed on-time pickups and fixed fares.</p>
                        </div>
                        <div class="hero-text-slide">
                            <div class="hero__eyebrow">✦ Fixed Fare Guarantee</div>
                            <h1>Lowest Outstation Fares from <?php echo htmlspecialchars($cityData['city']); ?></h1>
                            <p class="hero__sub">Pay only for the distance traveled. Clear fare calculations with toll, driver bata, and state permits itemized with instant confirmations.</p>
                        </div>
                    </div>


                </div>
                


                <script>window.DROP_CARS_PAGE_TITLE = "<?php echo addslashes($cityName); ?> Drop Taxi";</script>
                <div class="hero__booking-col">
                    <div style="margin-bottom: 0.5rem; display: flex; justify-content: center; align-items: center; width: 100%;">
                        <span id="booking-form-dynamic-title" class="airport-top-badge" style="display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: #ffffff; padding: 6px 14px; border-radius: 20px; font-size: 0.82rem; font-weight: 700; box-shadow: none; text-shadow: none; cursor: pointer; transition: all 0.3s ease;" onclick="if(window.DropCarsScrollToBookingForm){window.DropCarsScrollToBookingForm(true);}else{document.getElementById('booking-form').scrollIntoView({behavior:'smooth'});}">
                            🚖 Book <?php echo htmlspecialchars($cityName); ?> Drop Taxi
                        </span>
                    </div>

                    <div class="booking-card booking-card--home" aria-label="<?php echo htmlspecialchars($themeName); ?> booking form">
                    <form id="booking-form" class="booking-form">
                        <div class="trip-type-block">
                            <label class="field trip-type-field">
                                <select name="serviceType" id="service-type" class="visually-hidden" tabindex="-1" aria-hidden="true" required>
                                    <option value="one_way">Drop Taxi</option>
                                    <option value="multi_city">Multi City</option>
                                    <option value="airport_transfer">Airport Transfer</option>
                                    <option value="round_trip">Round Trip</option>
                                    <option value="hourly_rental">Local Rental</option>
                                </select>
                                <div class="trip-type-options fare-toggle__switch" role="group" aria-label="Trip type">
                                    <button type="button" class="trip-type-option trip-type-option--active" data-type="one_way">One-Way</button>
                                    <button type="button" class="trip-type-option" data-type="round_trip">Round Trip</button>
                                    <button type="button" class="trip-type-option" data-type="hourly_rental">Local</button>
                                </div>
                            </label>
                            <div class="oneway-subtypes fare-toggle__switch">
                                <input type="radio" name="oneway_subtype" id="subtype-oneway" value="one_way" checked />
                                <label for="subtype-oneway">Outstation</label>
                                <input type="radio" name="oneway_subtype" id="subtype-airport" value="airport_transfer" />
                                <label for="subtype-airport">Airport</label>
                                <input type="radio" name="oneway_subtype" id="subtype-multicity" value="multi_city" />
                                <label for="subtype-multicity">Multi City</label>
                            </div>
                        </div>

                        <!-- Layout: Locations and Date/Time First (Matching live site) -->
                        <div id="locations-wrapper" style="position: relative; width: 100%; display: flex; flex-direction: column; gap: 0.5rem;">
                            <label class="field" id="pickup-field-container">
                                <span id="pickup-label-text">Pick Up Location *</span>
                                <div style="position: relative; width: 100%;">
                                    <input type="text" name="pickup" id="pickup" value="<?php echo htmlspecialchars($cityData['city'], ENT_QUOTES, 'UTF-8'); ?>" placeholder="Pick Up Location" required autocomplete="off" style="padding-right: 35px;" />
                                    <button type="button" class="detect-location-btn" title="Use current location" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #0284c7; display: flex; align-items: center; justify-content: center; padding: 0; z-index: 10;">
                                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>
                                    </button>
                                </div>
                            </label>

                            <div id="swap-btn-container" class="hidden" style="display: none; justify-content: center; z-index: 10; position: relative;">
                                <button type="button" id="airport-swap-btn" style="background: linear-gradient(135deg, var(--blue-light) 0%, var(--blue) 100%); border: 3px solid var(--white); border-radius: 50%; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 10px rgba(14, 165, 233, 0.35); transition: transform 0.3s ease, box-shadow 0.3s ease;" onmouseover="this.style.transform='scale(1.08) rotate(180deg)';" onmouseout="this.style.transform='scale(1) rotate(0deg)';" aria-label="Swap Locations">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v10"/><path d="M11 16l-4 4-4-4"/><path d="M17 14V4"/><path d="M21 8l-4-4-4 4"/></svg>
                                </button>
                            </div>

                            <div class="stops-control hidden" id="stops-control">
                                <div class="stops-control__header">
                                    <p id="stops-note" style="margin: 0; font-weight: 600; font-size: 0.8rem;">Add optional stops between pickup and drop.</p>
                                    <button type="button" id="add-stop" class="btn-chips">+ Add Stop</button>
                                </div>
                                <div class="stops-list" id="stops-list"></div>
                                <p class="stops-limit" style="margin: 0; font-size: 0.75rem; color: var(--gray-400);">Up to 10 stops • reorder with the ▲/▼ buttons</p>
                            </div>

                            <label class="field" id="drop-field">
                                <span id="drop-label-text">Drop Location *</span>
                                <input type="text" name="drop" id="drop" placeholder="Drop Location" required autocomplete="off" />
                            </label>
                        </div>

                        <div class="field-pair">
                            <label class="field">
                                <span>Start Date *</span>
                                <input type="date" name="date" required value="<?php echo date('Y-m-d'); ?>" />
                            </label>
                            <label class="field">
                                <span>Pick-up Time *</span>
                                <input type="time" name="time" required />
                            </label>
                        </div>

                        <!-- Layout: Contact Info Second -->
                        <div class="field-pair field-pair--contact-primary contact-step-hidden">
                            <label class="field">
                                <span>Name *</span>
                                <input type="text" name="customerName" placeholder="Your Name" value="<?php echo htmlspecialchars($_pfName, ENT_QUOTES, 'UTF-8'); ?>" required />
                            </label>
                            <div class="field">
                                <div class="field__label-row">
                                    <span>Phone *</span>
                                    <label class="wa-check-label" style="display: flex; align-items: center; gap: 0.35rem; margin: 0; font-size: 0.8125rem; font-weight: 600; color: var(--blue-dark); cursor: pointer;">
                                        <span class="wa-label-icon" aria-hidden="true"><svg viewBox="0 0 32 32" width="18" height="18" fill="#25D366"><path d="M16 3C9.4 3 4 8.4 4 15c0 2.4.7 4.7 1.9 6.7L4 29l7.5-1.9A13 13 0 0 0 16 27c6.6 0 12-5.4 12-12S22.6 3 16 3Zm0 22.5c-2 0-4-.6-5.6-1.7l-.4-.2-4.4 1.1 1.2-4.3-.3-.4A10 10 0 1 1 26 15c0 5.5-4.5 10-10 10Zm6-7.4c-.3-.2-1.7-.8-2-.9s-.5-.2-.7.2c-.2.3-.8 1-1 1.2-.2.3-.4.2-.7.1-2-.8-3.2-2.6-3.4-3-.2-.3 0-.4.2-.6l.5-.6c.2-.2.2-.3.3-.5s0-.4 0-.6c0-.2-.7-1.8-1-2.5-.2-.6-.5-.6-.7-.6h-.6c-.2 0-.5.1-.7.3-.2.3-1 1-1 2.4s1 2.8 1.2 3.1c.1.2 2 3.3 5 4.6.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.1-1.4s-.3-.2-.6-.4Z"/></svg></span>
                                        <input type="checkbox" id="use-whatsapp-check" checked style="margin: 0; width: 14px; height: 14px; accent-color: var(--blue);" aria-label="Use WhatsApp for contact" />
                                    </label>
                                </div>
                                <div class="phone-input-wrapper phone-input-wrapper--country">
                                    <div class="country-code-field" data-cc-default="+91">
                                        <input type="hidden" name="countryCode" id="country-code-hidden" value="<?php echo htmlspecialchars($_pfCC, ENT_QUOTES, 'UTF-8'); ?>" />
                                        <button type="button" class="country-code-trigger" id="country-code-trigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="country-code-popover" title="Country code"><?php echo htmlspecialchars($_pfCC, ENT_QUOTES, 'UTF-8'); ?></button>
                                        <div id="country-code-popover" class="country-code-popover is-hidden" role="dialog" aria-label="Choose or type country code">
                                            <button type="button" class="country-code-option" data-code="+91">+91</button>
                                            <input type="text" class="country-code-manual-inline" id="country-code-manual-input" inputmode="tel" autocomplete="off" maxlength="12" placeholder="" aria-label="Type country code e.g. +65" />
                                        </div>
                                    </div>
                                    <input type="tel" name="contactPhone" placeholder="9876543210" id="contact-phone" class="phone-national-input" inputmode="numeric" pattern="[0-9]*" maxlength="10" autocomplete="tel" value="<?php echo htmlspecialchars($_pfNational, ENT_QUOTES, 'UTF-8'); ?>" required />
                                </div>
                            </div>
                        </div>

                        <div class="field-pair field-pair--contact-second contact-step-hidden" id="whatsapp-extra-row">
                            <div class="field hidden" id="whatsapp-field">
                                <span>WhatsApp Number *</span>
                                <div class="phone-input-wrapper phone-input-wrapper--country">
                                    <div class="country-code-field" data-cc-default="+91">
                                        <input type="hidden" name="waCountryCode" id="wa-country-code-hidden" value="+91" />
                                        <button type="button" class="country-code-trigger" id="wa-country-code-trigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="wa-country-code-popover" title="Country code">+91</button>
                                        <div id="wa-country-code-popover" class="country-code-popover is-hidden" role="dialog" aria-label="Choose or type country code">
                                            <button type="button" class="country-code-option" data-code="+91">+91</button>
                                            <input type="text" class="country-code-manual-inline" id="wa-country-code-manual-input" inputmode="tel" autocomplete="off" maxlength="12" placeholder="" aria-label="Type country code e.g. +65" />
                                        </div>
                                    </div>
                                    <input type="tel" name="whatsappPhone" placeholder="9876543210" id="whatsapp-phone" class="phone-national-input" inputmode="numeric" pattern="[0-9]*" maxlength="15" autocomplete="tel" />
                                </div>
                            </div>
                            <label class="field email-field" id="email-field">
                                <span>Email *</span>
                                <input type="email" name="contactEmail" placeholder="name@email.com" id="contact-email" value="<?php echo htmlspecialchars($_pfEmail, ENT_QUOTES, 'UTF-8'); ?>" />
                                <span class="field-hint" style="font-size: 0.72rem; color: #cbd5e1; margin-top: 4px; display: block;">Required — we'll send driver & trip updates here</span>
                            </label>
                            <div id="phone-spacer" style="display: none;"></div>
                        </div>

                        <input type="hidden" name="contactMode" value="phone" id="contact-mode-input" />

                        <div class="field-pair hidden" id="end-date-drop-time-control">
                            <label class="field">
                                <span>End Date *</span>
                                <input type="date" name="endDate" id="end-date-input" placeholder="mm/dd/yyyy" />
                            </label>
                            <label class="field">
                                <span>Drop Time *</span>
                                <input type="time" name="dropTime" id="drop-time-input" value="21:30" />
                            </label>
                        </div>

                        <label class="field hidden" id="hourly-pickup-field">
                            <span>Hourly Rental Pickup Location</span>
                            <input type="text" name="hourlyPickup" placeholder="e.g., Chennai Central" />
                        </label>
                        <div class="hourly-control hidden" id="hourly-control">
                            <span>Rental Duration</span>
                            <div class="hourly-options" role="group" aria-label="Hourly rental duration">
                                <button type="button" class="hourly-option hourly-option--active" data-hours="5_hours">5 Hours</button>
                                <button type="button" class="hourly-option" data-hours="8_hours">8 Hours</button>
                                <button type="button" class="hourly-option" data-hours="10_hours">10 Hours</button>
                                <button type="button" class="hourly-option" data-hours="12_hours">12 Hours</button>
                            </div>
                            <input type="hidden" name="hourlyPackage" id="hourly-package" value="5_hours" />
                        </div>

                        <div class="field" id="vehicle-selector-field">
                            <input type="hidden" name="vehicleType" id="vehicle-type-input" value="" />
                            <div class="vehicle-selector-grid" role="group" aria-label="Vehicle type">
                                <button type="button" class="vehicle-selector-card" data-vehicle="SEDAN">
                                    <img src="/assets/img/vehicles/Dzire.png" alt="Sedan Taxi" loading="lazy" onerror="this.style.display='none'" style="transform: scale(0.85); object-fit: contain;" />
                                    <span class="vehicle-selector-card__name">Sedan</span>
                                    <span class="vehicle-selector-card__price">₹<?php echo get_home_rate('SEDAN', 'oneway'); ?>/km</span>
                                </button>
                                <button type="button" class="vehicle-selector-card" data-vehicle="SUV">
                                    <img src="/assets/img/vehicles/Suv.png" alt="SUV" loading="lazy" onerror="this.style.display='none'" />
                                    <span class="vehicle-selector-card__name">SUV</span>
                                    <span class="vehicle-selector-card__price">₹<?php echo get_home_rate('SUV', 'oneway'); ?>/km</span>
                                </button>
                                <button type="button" class="vehicle-selector-card" data-vehicle="INNOVA">
                                    <img src="/assets/img/vehicles/Innova.png" alt="Innova" loading="lazy" onerror="this.style.display='none'" />
                                    <span class="vehicle-selector-card__name">Innova</span>
                                    <span class="vehicle-selector-card__price">₹<?php echo get_home_rate('INNOVA', 'oneway'); ?>/km</span>
                                </button>
                                <button type="button" class="vehicle-selector-card" data-vehicle="CRYSTA">
                                    <img src="/assets/img/vehicles/innova-crysta.png" alt="Crysta" loading="lazy" onerror="this.style.display='none'" />
                                    <span class="vehicle-selector-card__name">Crysta</span>
                                    <span class="vehicle-selector-card__price">₹<?php echo get_home_rate('CRYSTA', 'oneway'); ?>/km</span>
                                </button>
                            </div>
                        </div>

                        <div class="fare-toggle-wrap">
                            <div class="fare-toggle__switch" role="group" aria-label="Fare type">
                                <input type="radio" name="fareType" id="fare-base" value="base" checked />
                                <label for="fare-base">Excl. Tolls &amp; Taxes</label>
                                <input type="radio" name="fareType" id="fare-inclusive" value="inclusive" />
                                <label for="fare-inclusive">Incl. Tolls, Taxes &amp; GST</label>
                            </div>
                            <button type="button" class="fare-info-btn" id="fare-inclusions-info-btn" aria-label="What is included in toll and tax?" title="Click to view inclusions breakdown">
                                <span class="info-icon">ℹ️</span>
                            </button>
                            <div class="fare-info-popover is-hidden" id="fare-inclusions-popover" role="tooltip">
                                <div class="fare-info-popover__header">
                                    <strong>🧾 Fare Inclusions &amp; Tax Info</strong>
                                    <button type="button" class="fare-info-popover__close" id="fare-inclusions-close" aria-label="Close info">✕</button>
                                </div>
                                <div class="fare-info-popover__body">
                                    <ul class="fare-info-list">
                                        <li><strong>✅ Highway Tolls:</strong> Estimated route toll charges included when selected.</li>
                                        <li><strong>✅ 5% GST:</strong> Official CGST 2.5% + SGST 2.5% included for tax invoice.</li>
                                        <li><strong>✅ Driver Bata:</strong> Full chauffeur allowance &amp; fuel included.</li>
                                        <li><strong>ℹ️ State Border Tax:</strong> Calculated automatically by our smart engine. In rare cases where border entry taxes apply, it is applicable if crossing state borders only.</li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <!-- Promo Code Field -->
                        <div class="promo-row" id="promo-field" style="margin-top: 0.75rem; margin-bottom: 0.5rem;">
                            <span class="promo-row__text" style="color: var(--text);">Promo Code (Optional)</span>
                            <input type="text" name="promoCode" id="promo-code" placeholder="Enter Code" autocomplete="off" aria-label="Promo code" />
                            <button type="button" class="btn-promo-apply" id="promo-apply-btn">Apply</button>
                        </div>
                        <div class="submit-wrapper">
                            <button type="button" class="btn-primary" id="calculate-fare-btn">Check Fare Now</button>
                            <div id="fare-card" class="fare-card" style="display: none;">
                                <p class="fare-card__label">Estimated Fare</p>
                                <p id="fare-amount" class="fare-card__amount">₹0</p>
                                <p id="fare-distance" class="fare-card__meta" style="display: none;"></p>
                                <p class="fare-card__disclaimer">Toll, parking & state taxes extra.</p>
                                <button type="submit" class="btn-primary btn-primary--confirm" id="confirm-booking-btn">Book <?php echo htmlspecialchars($themeName); ?> Now</button>

                            </div>
                        </div>

                        <p id="form-response" class="form-response" role="status"></p>
                    </form>

                </div>
                </div>
            </div>
        </section>

        <!-- Dynamic City Subdomain Rich SEO Content Section -->
        <?php
        $seoCity = $cityData['city'];
        $seoState = $cityData['state'];
        
        $seoEyebrow = "{$seoCity} Outstation Taxi & Sightseeing Hub";
        $seoHeading = "Book a Fixed Per-KM Rate Outstation Taxi & Intercity Cab from {$seoCity}";
        
        $seoDesc1 = "As a key hub for {$seoState} tourism, {$seoCity} is the perfect starting point to embark on historical sightseeing journeys, temple tours, and scenic hill station getaways. At Drop Cars, we provide premium outstation taxi services and intercity tourist cabs designed for a safe, comfortable, and seamless travel experience. Book a flat-rate one-way drop taxi or a customized round-trip cab package and pay only for the distance you travel.";
        
        $seoDesc2 = "Whether you are planning a sacred pilgrimage to ancient temple cities, exploring historical heritage monuments, or booking an outstation taxi to misty hill stations, our professional tourist drivers ensure a highly reliable and scenic road trip. We offer 24/7 doorstep pickups and drop-offs across all of {$seoCity} and surrounding locations.";
        
        $seoDesc3 = "Travel in comfort with our modern fleet of air-conditioned tourist vehicles, including elegant sedans for couples, spacious SUVs (Ertiga) for family sightseeing, and premium Innova Crysta cabs for group travel. Enjoy completely transparent tourist taxi rates with zero hidden charges, no night driver surcharges, and no return-fare requests.";
        
        $seoImg = "/assets/img/seo/seo_generic_city.png";
        
        // Custom overrides for major hubs and subdomains
        $cLow = strtolower($citySlug);
        if ($cLow === 'chennai') {
            $seoEyebrow = "Chennai Outstation Taxi & Sightseeing Hub";
            $seoHeading = "Chennai to Bangalore Cabs & Premium Outstation Taxis from Chennai";
            $seoDesc1 = "As Tamil Nadu's primary gateway for tourism, Chennai is the perfect starting point to embark on historical sightseeing journeys, temple tours, and scenic hill station getaways. At Drop Cars, we provide a premium Outstation Cab Service and Intercity Taxi designed for a safe, comfortable, and seamless travel experience. Book a Fixed Per-KM Rate One-Way Drop Taxi or a customized round-trip cab package with Zero Return Fares.";
            $seoDesc2 = "Whether you are planning a sacred pilgrimage to the temples of Madurai and Tiruvannamalai, exploring the ancient UNESCO heritage shore temples of Mahabalipuram, or booking an outstation taxi to the misty hill stations of Ooty, Yercaud, and Kodaikanal, our professional tourist drivers ensure a highly reliable and scenic road trip. We offer 24/7 doorstep pickups and drop-offs across all of Chennai, including Adyar, Anna Nagar, Tambaram, Porur, and Chennai International Airport (MAA).";
            $seoImg = "/assets/img/seo/chennai_guide.png";
        } elseif ($cLow === 'madurai') {
            $seoEyebrow = "Madurai Outstation Taxi & Pilgrim Hub";
            $seoHeading = "Premium Temple Tours and Outstation Cabs from Madurai";
            $seoDesc1 = "Known as the cultural heart of Tamil Nadu, Madurai is famous for the towering Meenakshi Amman Temple. It serves as a vital transit hub for pilgrims and travelers headed to Rameshwaram, Kanyakumari, and the hill stations of Kodaikanal and Munnar. Drop Cars provides reliable, professional outstation taxi services from Madurai with transparent pricing.";
            $seoDesc2 = "Whether you are planning a temple tour to Palani, Srivilliputhur, and Tiruchendur, or heading to the southernmost tip at Kanyakumari, our local tourist drivers ensure a safe and memorable journey. We offer doorstep pickups across all of Madurai, including Madurai Junction, Mattuthavani, and Madurai Airport (IXM).";
            $seoImg = "/assets/img/seo/seo_madurai_guide.png";
        } elseif ($cLow === 'coimbatore') {
            $seoEyebrow = "Coimbatore Outstation Taxi & Travel Hub";
            $seoHeading = "Explore the Western Ghats with Premium Outstation Cabs from Coimbatore";
            $seoDesc1 = "As the industrial and textile capital of Tamil Nadu, Coimbatore is the gateway to some of the region's most pristine hill stations, including Ooty, Coonoor, Valparai, and the pristine landscapes of Munnar and Wayanad. Drop Cars offers a Coimbatore Outstation Taxi service and One-Way Drop Taxi bookings from Coimbatore.";
            $seoDesc2 = "Whether you are planning a trip to the Adiyogi Shiva Statue at the Isha Yoga Center, visiting the temples of Marudhamalai, or taking a scenic road trip up the hairpin bends of the Nilgiris, our experienced hill drivers guarantee a safe and comfortable ride. Pickups are available 24/7 across Coimbatore and Coimbatore International Airport (CJB).";
            $seoImg = "/assets/img/seo/coimbatore_guide.png";
        } elseif ($cLow === 'pondicherry' || $cLow === 'puducherry') {
            $seoEyebrow = "Pondicherry French Riviera Taxi Hub";
            $seoHeading = "Premium Coastal Cruises and Outstation Cabs from Pondicherry";
            $seoDesc1 = "With its unique blend of French colonial heritage, quiet beaches, and spiritual retreats like Auroville, Pondicherry is one of India's favorite tourist destinations. Drop Cars provides premium outstation taxi services and reliable one-way drop cabs for travelers going to Chennai, Bangalore, Chidambaram, or Cuddalore.";
            $seoDesc2 = "Plan your weekend getaways or return airport transfers easily. Enjoy completely transparent tourist taxi rates with zero hidden charges and no return-fare demands when booking one-way cabs.";
            $seoImg = "/assets/img/seo/seo_pondicherry_guide.png";
        } elseif ($cLow === 'tiruvannamalai') {
            $seoEyebrow = "Tiruvannamalai Spiritual Outstation Hub";
            $seoHeading = "Sacred Pilgrimages and Outstation Taxis from Tiruvannamalai";
            $seoDesc1 = "Tiruvannamalai, home to the sacred Arunachala Hill and the historic Annamalaiyar Temple, draws millions of spiritual seekers and pilgrims year-round. Drop Cars offers reliable intercity outstation cabs and flat-rate one-way drop taxis connecting Tiruvannamalai to Chennai, Bangalore, Trichy, and Vellore.";
            $seoDesc2 = "Travel in absolute comfort for your monthly Girivalam pilgrimages. Our professional drivers are well-acquainted with routes from Chennai Airport or Bangalore directly to the ashrams and temples of Tiruvannamalai.";
            $seoImg = "/assets/img/seo/seo_chennai_tiruvannamalai_guide.png";
        } elseif ($cLow === 'kumbakonam') {
            $seoEyebrow = "Kumbakonam Temple Town Taxi Hub";
            $seoHeading = "Explore Ancient Temples with Outstation Cabs from Kumbakonam";
            $seoDesc1 = "Famous as a town of temples, Kumbakonam is the perfect base to explore the grand Dravidian architectures of Tanjore, Darasuram, and Swamimalai. Drop Cars offers premium outstation cabs and flat-rate one-way drop taxis to make your temple tour comfortable and affordable.";
            $seoDesc2 = "Book a custom tour package or one-way drop taxi to Chennai, Trichy, or Madurai. Our experienced drivers ensure you reach your destination safely and on schedule.";
            $seoImg = "/assets/img/seo/seo_generic_city.png";
        } elseif ($cLow === 'yelagiri') {
            $seoEyebrow = "Yelagiri Hill Station Outstation Cabs";
            $seoHeading = "Scenic Hill Station Getaways from Yelagiri Hills";
            $seoDesc1 = "Yelagiri is a peaceful hill station ideal for quick weekend treks and natural sightseeing. Drop Cars offers reliable outstation drop taxis and round-trip rentals from Yelagiri to Bangalore, Chennai, and Vellore.";
            $seoDesc2 = "Plan your return travel from the hills in comfort. Our verified local drivers are fully experienced in handling winding mountain roads safely.";
            $seoImg = "/assets/img/seo/seo_tamil_nadu_travel_timing.png";
        } elseif ($cLow === 'bangalore') {
            $seoEyebrow = "Bangalore Silicon Valley Outstation Hub";
            $seoHeading = "Premium Intercity Outstation Taxis from Bangalore";
            $seoDesc1 = "Bengaluru, the Silicon Valley of India, is a major gateway for Outstation Cab Service across Karnataka and Tamil Nadu. Drop Cars offers a reliable Intercity Taxi, One-Way Drop Taxi, and outstation cabs from Bengaluru to Chennai, Mysore, Coimbatore, and beyond.";
            $seoDesc2 = "Whether you are traveling for a weekend getaway to Ooty or Coorg, or taking a business trip to Chennai, our professional and verified drivers guarantee a reliable, safe road trip.";
            $seoImg = "/assets/img/seo/seo_bangalore_guide.png";
        } elseif ($cLow === 'tirupati') {
            $seoEyebrow = "Tirupati Pilgrimage Outstation Cabs";
            $seoHeading = "Comfortable Temple Visits and Outstation Taxis from Tirupati";
            $seoDesc1 = "Premium pilgrimage cab service from Tirupati to Chennai, Bangalore, Vellore and more. Dedicated taxi for Tirumala darshan with experienced drivers who know the hill roads well.";
            $seoDesc2 = "We provide hassle-free pickup from Tirupati Railway Station or Airport directly to your destination with completely transparent flat pricing.";
            $seoImg = "/assets/img/seo/seo_tirupati_guide.png";
        } elseif ($cLow === 'trichy') {
            $seoEyebrow = "Trichy Golden Rock City Outstation Cabs";
            $seoHeading = "Reliable Outstation Taxi & Drops from Trichy";
            $seoDesc1 = "Tiruchirappalli, the ancient city of the Rock Fort Temple, sits at the heart of Tamil Nadu and is one of the most strategically located transit hubs. Drop Cars provides reliable intercity taxi services and flat-rate one-way drops from Trichy to all major destinations.";
            $seoDesc2 = "Plan your temple tours or business travel. Our experienced, vetted drivers guarantee a safe and smooth journey across all state highway corridors.";
            $seoImg = "/assets/img/seo/seo_trichy_guide.png";
        } elseif ($cLow === 'salem') {
            $seoEyebrow = "Salem Mango City Outstation Taxi Hub";
            $seoHeading = "Book Premium One-Way Drop Cabs from Salem";
            $seoDesc1 = "Salem, the crossroads of Tamil Nadu, connects Chennai, Bangalore, and Coimbatore. Drop Cars offers an Outstation Cab Service and Fixed Per-KM Rate one-way drop taxis from Salem to major cities across Tamil Nadu and Karnataka.";
            $seoDesc2 = "Experience comfortable intercity road trips with professional drivers, clean well-maintained AC cars, and zero hidden charges.";
            $seoImg = "/assets/img/seo/seo_salem_guide.png";
        } elseif ($cLow === 'vellore') {
            $seoEyebrow = "Vellore Fort City Outstation Taxi Services";
            $seoHeading = "Safe Medical & Student Intercity Cabs from Vellore";
            $seoDesc1 = "Vellore, home to the magnificent Vellore Fort and CMC Hospital, is a key medical and historical destination. Drop Cars offers premium outstation taxi services and one-way drops from Vellore to Chennai, Bangalore, and beyond.";
            $seoDesc2 = "Whether you need a reliable ride for medical visits or student drop-offs, our 24/7 dedicated support team ensures a smooth journey.";
            $seoImg = "/assets/img/seo/seo_vellore_guide.png";
        } elseif ($cLow === 'tirunelveli') {
            $seoEyebrow = "Tirunelveli Nellaiappar Outstation Taxi Hub";
            $seoHeading = "Verified Outstation Cabs & Drops from Tirunelveli";
            $seoDesc1 = "Tirunelveli, the city of the Nellaiappar Temple, is a major hub for outstation travel in southern Tamil Nadu. Drop Cars offers reliable intercity taxi services and one-way drop cabs from Tirunelveli to destinations across Tamil Nadu.";
            $seoDesc2 = "Travel comfortably with flat transparent fares, professional chauffeurs, and instant confirmation for your ride.";
            $seoImg = "/assets/img/seo/seo_tirunelveli_guide.png";
        } elseif ($cLow === 'thanjavur') {
            $seoEyebrow = "Thanjavur Brihadeeswara Temple Outstation Cabs";
            $seoHeading = "Book Heritage Tour Cabs from Thanjavur";
            $seoDesc1 = "Explore the grand Dravidian architecture of Tanjore and surrounding temple towns with Drop Cars. We offer premium outstation cabs and flat-rate one-way drop taxis to make your trip comfortable.";
            $seoDesc2 = "Enjoy flat per-km rates with zero hidden charges, clean AC cars, and professional tourist drivers.";
            $seoImg = "/assets/img/seo/seo_thanjavur_guide.png";
        } elseif ($cLow === 'kanchipuram') {
            $seoEyebrow = "Kanchipuram Silk City Pilgrimage Cabs";
            $seoHeading = "Reliable Temple Tours and Outstation Cabs from Kanchipuram";
            $seoDesc1 = "Travel from Kanchipuram to Chennai, Vellore, Pondicherry & Tirupati. Book clean, punctual cabs with verified professional drivers at flat per-km rates.";
            $seoDesc2 = "Our chauffeurs are highly familiar with temple circuits, ashrams, and local silk shopping districts to guide your trip.";
            $seoImg = "/assets/img/seo/seo_kanchipuram_guide.png";
        } elseif ($cLow === 'mysore') {
            $seoEyebrow = "Mysore Heritage Palace Outstation Taxis";
            $seoHeading = "Explore Karnataka Tourism with Outstation Taxis from Mysore";
            $seoDesc1 = " Mysore is the perfect gateway to explore the rich culture of Karnataka. Drop Cars provides premium outstation cabs and one-way drop taxis to Bangalore, Ooty, Coorg & Coimbatore.";
            $seoDesc2 = "Relax and enjoy the scenic highways with our vetted drivers, clean AC cars, and transparent flat pricing.";
            $seoImg = "/assets/img/seo/seo_mysore_guide.png";
        } elseif ($cLow === 'kochi') {
            $seoEyebrow = "Kochi Queen of Arabian Sea Outstation Cabs";
            $seoHeading = "Premium Intercity Taxis from Kochi & Ernakulam";
            $seoDesc1 = "Travel from Kochi to Coimbatore, Bangalore, Munnar, or Trivandrum. Drop Cars offers reliable outstation drop taxis and round-trip rentals with professional hill drivers.";
            $seoDesc2 = "Book your coastal getaways or return airport transfers with completely transparent per-km flat pricing.";
            $seoImg = "/assets/img/seo/seo_kochi_guide.png";
        } elseif ($cLow === 'hyderabad') {
            $seoEyebrow = "Hyderabad Charminar Outstation Cabs";
            $seoHeading = "Book Premium Outstation Cabs from Hyderabad";
            $seoDesc1 = "Book outstation cabs from Hyderabad to Bangalore, Chennai, Tirupati & Vijayawada. Clean cars, verified chauffeurs, and instant trip confirmation.";
            $seoDesc2 = "Enjoy flat rate pricing, professional support, and door-to-door pickups across the Hyderabad metro region.";
            $seoImg = "/assets/img/seo/seo_hyderabad_guide.png";
        }
        ?>
        <section class="city-about-section">
            <div class="container">
                <div class="city-seo-grid">
                    <div>
                        <p class="eyebrow city-seo-eyebrow"><?php echo htmlspecialchars($seoEyebrow, ENT_QUOTES, 'UTF-8'); ?></p>
                        <h2 class="city-seo-heading"><?php echo htmlspecialchars($seoHeading, ENT_QUOTES, 'UTF-8'); ?></h2>
                        <div class="city-seo-text">
                            <p><?php echo htmlspecialchars($seoDesc1, ENT_QUOTES, 'UTF-8'); ?></p>
                            
                            <div id="city-seo-expand" style="display: none; opacity: 0; transition: opacity 0.4s ease;">
                                <p><?php echo htmlspecialchars($seoDesc2, ENT_QUOTES, 'UTF-8'); ?></p>
                                <p><?php echo htmlspecialchars($seoDesc3, ENT_QUOTES, 'UTF-8'); ?></p>
                            </div>
                        </div>
                        
                        <button id="city-seo-toggle-btn" class="city-seo-btn">Read More</button>
                    </div>
                    <div class="city-seo-image-wrapper">
                        <img src="<?php echo htmlspecialchars($seoImg, ENT_QUOTES, 'UTF-8'); ?>" alt="<?php echo htmlspecialchars($seoCity, ENT_QUOTES, 'UTF-8'); ?> Outstation Taxi" class="city-seo-image">
                    </div>
                </div>
            </div>
            <script>
            (function() {
                const btn = document.getElementById('city-seo-toggle-btn');
                const expandDiv = document.getElementById('city-seo-expand');
                if (!btn || !expandDiv) return;
                
                btn.addEventListener('click', function() {
                    const isExpanding = btn.textContent.trim() === 'Read More';
                    if (isExpanding) {
                        expandDiv.style.display = 'block';
                        requestAnimationFrame(() => {
                            expandDiv.style.opacity = '1';
                        });
                        btn.textContent = 'Read Less';
                    } else {
                        expandDiv.style.opacity = '0';
                        setTimeout(() => {
                            expandDiv.style.display = 'none';
                        }, 300);
                        btn.textContent = 'Read More';
                    }
                });
            })();
            </script>
        </section>

        <?php if ($isStateHub): ?>
        <section class="discovery-section" style="padding: 4rem 0; background: var(--white);">
            <div class="container">
                <div class="seo-section__header" style="text-align: center; margin-bottom: 3.5rem;">
                    <p class="eyebrow">Explore Tamil Nadu</p>
                    <h2 style="font-size: clamp(1.8rem, 5vw, 2.8rem); font-weight: 800; color: var(--blue-dark);">Discover the Heart of South India</h2>
                    <p style="max-width: 45rem; margin: 1rem auto; line-height: 1.7; color: var(--gray-600);">From towering Dravidian temples and misty hill stations to sun-drenched coastlines, Tamil Nadu offers a timeless journey through culture and nature.</p>
                <div class="tour-grid" style="display: grid; gap: 1rem;">
                    <div class="tour-card" style="position: relative; border-radius: 24px; overflow: hidden; height: 250px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); cursor: pointer; transition: 0.4s;">
                        <img src="/assets/img/seo/chennai_guide.png" alt="Chennai" style="width: 100%; height: 100%; object-fit: cover; transition: 0.6s;" loading="lazy">
                        <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%); padding: 2rem; display: flex; flex-direction: column; justify-content: flex-end; color: white;">
                            <h3 style="margin: 0; font-size: 1.5rem; font-weight: 700;">Chennai</h3>
                            <p style="margin: 0.5rem 0 0; font-size: 0.9rem; opacity: 0.9;">Gateway to the South – A vibrant metropolis blending historic temples, sandy beaches, and bustling IT corridors.</p>
                        </div>
                    </div>
                    <div class="tour-card" style="position: relative; border-radius: 24px; overflow: hidden; height: 250px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); cursor: pointer; transition: 0.4s;">
                        <img src="/assets/img/seo/seo_madurai_guide.png" alt="Madurai" style="width: 100%; height: 100%; object-fit: cover; transition: 0.6s;" loading="lazy">
                        <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%); padding: 2rem; display: flex; flex-direction: column; justify-content: flex-end; color: white;">
                            <h3 style="margin: 0; font-size: 1.5rem; font-weight: 700;">Madurai</h3>
                            <p style="margin: 0.5rem 0 0; font-size: 0.9rem; opacity: 0.9;">The Temple City – Home to the majestic Meenakshi Amman Temple and celebrated for its rich cultural legacy.</p>
                        </div>
                    </div>
                    <div class="tour-card" style="position: relative; border-radius: 24px; overflow: hidden; height: 250px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); cursor: pointer; transition: 0.4s;">
                        <img src="/assets/img/seo/coimbatore_guide.png" alt="Coimbatore" style="width: 100%; height: 100%; object-fit: cover; transition: 0.6s;" loading="lazy">
                        <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%); padding: 2rem; display: flex; flex-direction: column; justify-content: flex-end; color: white;">
                            <h3 style="margin: 0; font-size: 1.5rem; font-weight: 700;">Coimbatore</h3>
                            <p style="margin: 0.5rem 0 0; font-size: 0.9rem; opacity: 0.9;">Manchester of South India – Set in the Western Ghats' foothills, famous for textiles and the Adiyogi Shiva Statue.</p>
                        </div>
                    </div>
                    <div class="tour-card" style="position: relative; border-radius: 24px; overflow: hidden; height: 250px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); cursor: pointer; transition: 0.4s;">
                        <img src="/assets/img/seo/seo_tamil_nadu_travel_timing.png" alt="Ooty" style="width: 100%; height: 100%; object-fit: cover; transition: 0.6s;" loading="lazy">
                        <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%); padding: 2rem; display: flex; flex-direction: column; justify-content: flex-end; color: white;">
                            <h3 style="margin: 0; font-size: 1.5rem; font-weight: 700;">Ooty & Nilgiris</h3>
                            <p style="margin: 0.5rem 0 0; font-size: 0.9rem; opacity: 0.9;">Queen of Hill Stations – Misty valleys, lush emerald tea plantations, and the iconic heritage Toy Train.</p>
                        </div>
                    </div>
                    <div class="tour-card" style="position: relative; border-radius: 24px; overflow: hidden; height: 250px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); cursor: pointer; transition: 0.4s;">
                        <img src="/assets/img/seo/chennai_places.png" alt="Mahabalipuram" style="width: 100%; height: 100%; object-fit: cover; transition: 0.6s;" loading="lazy">
                        <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%); padding: 2rem; display: flex; flex-direction: column; justify-content: flex-end; color: white;">
                            <h3 style="margin: 0; font-size: 1.5rem; font-weight: 700;">Mahabalipuram</h3>
                            <p style="margin: 0.5rem 0 0; font-size: 0.9rem; opacity: 0.9;">Coastal Heritage Wonders – Famous for monolithic rock-cut shrines, ancient relief carvings, and the Shore Temple.</p>
                        </div>
                    </div>
                    <div class="tour-card" style="position: relative; border-radius: 24px; overflow: hidden; height: 250px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); cursor: pointer; transition: 0.4s;">
                        <img src="/assets/img/seo/seo_kodaikanal_guide.png" alt="Kodaikanal" style="width: 100%; height: 100%; object-fit: cover; transition: 0.6s;" loading="lazy">
                        <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%); padding: 2rem; display: flex; flex-direction: column; justify-content: flex-end; color: white;">
                            <h3 style="margin: 0; font-size: 1.5rem; font-weight: 700;">Kodaikanal</h3>
                            <p style="margin: 0.5rem 0 0; font-size: 0.9rem; opacity: 0.9;">Princess of Hill Stations – Serene lakes, towering pine forests, cool mists, and breathtaking valley view points.</p>
                        </div>
                    </div>
 
                    <div class="tour-card tour-card--hidden" style="display: none; opacity: 0; transform: translateY(20px); transition: opacity 0.4s ease, transform 0.4s ease; position: relative; border-radius: 24px; overflow: hidden; height: 250px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); cursor: pointer;">
                        <img src="/assets/img/seo/seo_pondicherry_guide.png" alt="Pondicherry" style="width: 100%; height: 100%; object-fit: cover; transition: 0.6s;" loading="lazy">
                        <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%); padding: 2rem; display: flex; flex-direction: column; justify-content: flex-end; color: white;">
                            <h3 style="margin: 0; font-size: 1.5rem; font-weight: 700;">Pondicherry</h3>
                            <p style="margin: 0.5rem 0 0; font-size: 0.9rem; opacity: 0.9;">French Colonial Town – Charming yellow-colored heritage buildings, beautiful beaches, and spiritual ashrams.</p>
                        </div>
                    </div>
                    <div class="tour-card tour-card--hidden" style="display: none; opacity: 0; transform: translateY(20px); transition: opacity 0.4s ease, transform 0.4s ease; position: relative; border-radius: 24px; overflow: hidden; height: 250px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); cursor: pointer;">
                        <img src="/assets/img/seo/seo_thanjavur_guide.png" alt="Thanjavur" style="width: 100%; height: 100%; object-fit: cover; transition: 0.6s;" loading="lazy">
                        <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%); padding: 2rem; display: flex; flex-direction: column; justify-content: flex-end; color: white;">
                            <h3 style="margin: 0; font-size: 1.5rem; font-weight: 700;">Thanjavur</h3>
                            <p style="margin: 0.5rem 0 0; font-size: 0.9rem; opacity: 0.9;">Cradle of Tamil Art – Home of the Brihadisvara Temple, beautiful brass works, and classical Tanjore paintings.</p>
                        </div>
                    </div>
                    <div class="tour-card tour-card--hidden" style="display: none; opacity: 0; transform: translateY(20px); transition: opacity 0.4s ease, transform 0.4s ease; position: relative; border-radius: 24px; overflow: hidden; height: 250px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); cursor: pointer;">
                        <img src="/assets/img/seo/seo_kanyakumari_guide.png" alt="Kanyakumari" style="width: 100%; height: 100%; object-fit: cover; transition: 0.6s;" loading="lazy">
                        <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%); padding: 2rem; display: flex; flex-direction: column; justify-content: flex-end; color: white;">
                            <h3 style="margin: 0; font-size: 1.5rem; font-weight: 700;">Kanyakumari</h3>
                            <p style="margin: 0.5rem 0 0; font-size: 0.9rem; opacity: 0.9;">Land's End – The southern tip of India where three oceans merge, presenting spectacular sunsets and sunrises.</p>
                        </div>
                    </div>
                    <div class="tour-card tour-card--hidden" style="display: none; opacity: 0; transform: translateY(20px); transition: opacity 0.4s ease, transform 0.4s ease; position: relative; border-radius: 24px; overflow: hidden; height: 250px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); cursor: pointer;">
                        <img src="/assets/img/seo/seo_trichy_guide.png" alt="Tiruchirappalli" style="width: 100%; height: 100%; object-fit: cover; transition: 0.6s;" loading="lazy">
                        <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%); padding: 2rem; display: flex; flex-direction: column; justify-content: flex-end; color: white;">
                            <h3 style="margin: 0; font-size: 1.5rem; font-weight: 700;">Tiruchirappalli</h3>
                            <p style="margin: 0.5rem 0 0; font-size: 0.9rem; opacity: 0.9;">Historic Citadel – Celebrated for the dramatic Rockfort Temple perched high on an ancient rock outcrop.</p>
                        </div>
                    </div>
                    <div class="tour-card tour-card--hidden" style="display: none; opacity: 0; transform: translateY(20px); transition: opacity 0.4s ease, transform 0.4s ease; position: relative; border-radius: 24px; overflow: hidden; height: 250px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); cursor: pointer;">
                        <img src="/assets/img/seo/seo_rameswaram_guide.png" alt="Rameswaram" style="width: 100%; height: 100%; object-fit: cover; transition: 0.6s;" loading="lazy">
                        <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%); padding: 2rem; display: flex; flex-direction: column; justify-content: flex-end; color: white;">
                            <h3 style="margin: 0; font-size: 1.5rem; font-weight: 700;">Rameswaram</h3>
                            <p style="margin: 0.5rem 0 0; font-size: 0.9rem; opacity: 0.9;">The Holy Island – A spiritual sanctuary featuring the iconic Ramanathaswamy Temple and the Pamban Sea Bridge.</p>
                        </div>
                    </div>
                    <div class="tour-card tour-card--hidden" style="display: none; opacity: 0; transform: translateY(20px); transition: opacity 0.4s ease, transform 0.4s ease; position: relative; border-radius: 24px; overflow: hidden; height: 250px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); cursor: pointer;">
                        <img src="/assets/img/seo/seo_yercaud_guide.png" alt="Yercaud" style="width: 100%; height: 100%; object-fit: cover; transition: 0.6s;" loading="lazy">
                        <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%); padding: 2rem; display: flex; flex-direction: column; justify-content: flex-end; color: white;">
                            <h3 style="margin: 0; font-size: 1.5rem; font-weight: 700;">Yercaud</h3>
                            <p style="margin: 0.5rem 0 0; font-size: 0.9rem; opacity: 0.9;">The Jewel of the South – A peaceful, scenic hill station with orange orchards and rich coffee plantations.</p>
                        </div>
                    </div>
                </div>

                <div style="text-align: center; margin-top: 3.5rem;">
                    <button id="view-more-cities-btn" class="btn-primary" style="padding: 0.95rem 2.25rem; font-size: 1rem; border-radius: 999px; font-weight: 700; cursor: pointer; transition: all 0.3s ease; background: var(--accent); border: none; color: white; box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-transform: uppercase; letter-spacing: 0.05em;">View More Cities</button>
                </div>

                <style>
                    .tour-card:hover { transform: translateY(-10px); }
                    .tour-card:hover img { transform: scale(1.1); }
                    
                    /* Responsive Card Heights and Overlay Padding */
                    .tour-card div[style*="position: absolute"] {
                        padding: 1rem !important;
                    }
                    .tour-card h3 {
                        font-size: 1.15rem !important;
                        color: #ffffff !important;
                    }
                    .tour-card p {
                        color: rgba(255, 255, 255, 0.9) !important;
                        font-size: 0.75rem !important;
                        margin-top: 0.25rem !important;
                        line-height: 1.3 !important;
                        display: -webkit-box;
                        -webkit-line-clamp: 2;
                        -webkit-box-orient: vertical;
                        overflow: hidden;
                    }
                    
                    /* Default 2-column grid on mobile */
                    .tour-grid {
                        grid-template-columns: repeat(2, 1fr) !important;
                        gap: 1rem !important;
                    }
                    
                    @media (min-width: 992px) {
                        .tour-card {
                            height: 400px !important;
                        }
                        .tour-card div[style*="position: absolute"] {
                            padding: 2rem !important;
                        }
                        .tour-card h3 {
                            font-size: 1.5rem !important;
                        }
                        .tour-card p {
                            color: rgba(255, 255, 255, 0.9) !important;
                            font-size: 0.9rem !important;
                            display: block !important;
                            -webkit-line-clamp: unset !important;
                        }
                        .tour-grid {
                            grid-template-columns: repeat(3, 1fr) !important;
                            gap: 2rem !important;
                        }
                    }
                </style>
                <script>
                (function() {
                    const btn = document.getElementById('view-more-cities-btn');
                    if (!btn) return;
                    btn.addEventListener('click', function() {
                        const hiddenCards = document.querySelectorAll('.tour-card.tour-card--hidden');
                        const isExpanding = btn.textContent.trim() === 'VIEW MORE CITIES';
                        
                        hiddenCards.forEach(card => {
                            if (isExpanding) {
                                card.style.display = 'block';
                                requestAnimationFrame(() => {
                                    card.style.opacity = '1';
                                    card.style.transform = 'translateY(0)';
                                });
                            } else {
                                card.style.opacity = '0';
                                card.style.transform = 'translateY(20px)';
                                setTimeout(() => {
                                    card.style.display = 'none';
                                }, 300);
                            }
                        });
                        
                        btn.textContent = isExpanding ? 'VIEW LESS CITIES' : 'VIEW MORE CITIES';
                    });
                })();
                </script>

                <div class="seasons-box" style="margin-top: 5rem; background: var(--gray-50); border: 1px solid var(--gray-100); border-radius: 32px; padding: 3rem;">
                    <div style="text-align: center; margin-bottom: 2.5rem;">
                        <h3 style="font-size: 1.8rem; font-weight: 800; color: var(--blue-dark);">Best Time to Visit</h3>
                        <p style="color: var(--gray-600);">Plan your trip according to Tamil Nadu's diverse weather patterns.</p>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 2rem;">
                        <div style="text-align: center; padding: 1rem;">
                            <div style="font-size: 2.5rem; margin-bottom: 1rem;">❄️</div>
                            <h4 style="font-weight: 700; color: var(--blue-dark); margin-bottom: 0.5rem;">Winter (Dec - Feb)</h4>
                            <p style="font-size: 0.9rem; color: var(--gray-600); line-height: 1.6;">The best time for temple tours and coastal exploration. The weather is pleasant and cool across the state.</p>
                        </div>
                        <div style="text-align: center; padding: 1rem;">
                            <div style="font-size: 2.5rem; margin-bottom: 1rem;">☀️</div>
                            <h4 style="font-weight: 700; color: var(--blue-dark); margin-bottom: 0.5rem;">Summer (Mar - May)</h4>
                            <p style="font-size: 0.9rem; color: var(--gray-600); line-height: 1.6;">Ideal for escaping to the hill stations like Ooty and Kodaikanal. Coastal areas can be warm but vibrant.</p>
                        </div>
                        <div style="text-align: center; padding: 1rem;">
                            <div style="font-size: 2.5rem; margin-bottom: 1rem;">🌧️</div>
                            <h4 style="font-weight: 700; color: var(--blue-dark); margin-bottom: 0.5rem;">Monsoon (Jun - Sep)</h4>
                            <p style="font-size: 0.9rem; color: var(--gray-600); line-height: 1.6;">Experience the lush greenery of the Western Ghats. Perfect for nature lovers and refreshing road trips.</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
        <?php endif; ?>

        <?php echo $contentBlocks->renderServices('city-services'); ?>

        <?php if (!empty($routes)): ?>
        <section class="routes-section" id="city-popular-routes">
            <div class="container">
                <p class="eyebrow">Popular Routes From <?php echo htmlspecialchars($cityData['city'], ENT_QUOTES, 'UTF-8'); ?></p>
                <h2>One-Way <?php echo htmlspecialchars($themeName, ENT_QUOTES, 'UTF-8'); ?> From <?php echo htmlspecialchars($cityData['city'], ENT_QUOTES, 'UTF-8'); ?></h2>
                <div class="routes-grid">
                    <?php foreach ($routes as $target):
                        $targetSlug = $target['slug'] ?? '';
                        if ($targetSlug === '') {
                            continue;
                        }
                        $routeHref = dropcars_theme_page_url($linkThemeSlug, $citySlug, $targetSlug);
                        $ri = $seo->getRouteInfo($citySlug, $targetSlug, false);
                        $distKm = (float) ($ri['distanceKm'] ?? 0);
                        $timingStr = dropcars_calculate_highway_timing($distKm);
                        $destName = $target['city'] ?? $targetSlug;
                        ?>
                    <a href="<?php echo htmlspecialchars($routeHref, ENT_QUOTES, 'UTF-8'); ?>" class="highway-signboard route-card--highway">
                        <div class="highway-signboard-shine"></div>
                        <div class="highway-signboard__header">
                            <span class="highway-badge">ONE-WAY CAB</span>
                            <span class="highway-signboard__code">EXPRESS ROUTE</span>
                        </div>
                        <div class="highway-signboard__route">
                            <span><?php echo htmlspecialchars($cityData['city'], ENT_QUOTES, 'UTF-8'); ?></span>
                            <span class="highway-signboard__route-arrow">➔</span>
                            <span><?php echo htmlspecialchars(trim($destName . (stripos($destName, 'taxi') === false ? ' Taxi' : '')), ENT_QUOTES, 'UTF-8'); ?></span>
                        </div>
                        <div class="highway-signboard__metrics">
                            <div class="highway-metric highway-metric--kms">
                                <span class="highway-metric__icon">🛣️</span>
                                <span><?php echo (int) round($distKm); ?> KMS</span>
                            </div>
                            <div class="highway-metric highway-metric--timing">
                                <span class="highway-metric__icon">⏱️</span>
                                <span><?php echo htmlspecialchars($timingStr, ENT_QUOTES, 'UTF-8'); ?></span>
                            </div>
                        </div>
                        <div class="highway-signboard__cta">
                            <span>Book <?php echo htmlspecialchars(($themeName === 'Drop Cars' ? 'Drop Taxi' : $themeName), ENT_QUOTES, 'UTF-8'); ?></span>
                            <span class="cta-arrow">➔</span>
                        </div>
                    </a>
                    <?php endforeach; ?>
                </div>
            </div>
        </section>
        <?php endif; ?>

        <!-- Chennai Subdomain Rich SEO Content Section removed from legacy position -->

        <?php echo $contentBlocks->renderFleetShowcase('city-fleet', [
            'eyebrow' => dropcars_theme_get($activeTheme, 'seoFleetEyebrow', 'Our fleet'),
            'title' => dropcars_theme_expand($activeTheme, dropcars_theme_get($activeTheme, 'seoFleetTitle', 'Choose a vehicle for your ' . $themeName . ' trip'), $cityCtx),
        ]); ?>

        <?php if (!empty($_heroSeoDesc)): ?>
        <section class="container" style="max-width: 860px; margin: 0 auto; padding: 1.5rem 1.25rem 0;">
            <p style="line-height: 1.7; color: var(--gray-700, #374151); font-size: 0.98rem;"><?php echo htmlspecialchars($_heroSeoDesc, ENT_QUOTES, 'UTF-8'); ?></p>
        </section>
        <?php endif; ?>

        <?php echo $contentBlocks->renderSeoBlog('city-guides', $cityData); ?>

        <section class="trust-section">
            <div class="container">
                <p class="eyebrow" style="text-align: center;"><?php echo htmlspecialchars(dropcars_theme_expand($activeTheme, dropcars_theme_get($activeTheme, 'cityTrustEyebrow', 'Why ' . $themeName), $cityCtx), ENT_QUOTES, 'UTF-8'); ?></p>
                <h2 style="text-align: center;">Why book <?php echo htmlspecialchars($themeName); ?> in <?php echo htmlspecialchars($cityData['city']); ?>?</h2>
                
                <div class="trust-grid">
                    <div class="trust-card" style="background: var(--gray-50); border: 1px solid var(--gray-100); padding: 2.5rem; border-radius: 24px; transition: 0.3s; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);">
                        <div style="background: var(--white); width: 50px; height: 50px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin-bottom: 1.5rem; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="color: var(--accent);"><path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z"/></svg>
                        </div>
                        <h3 style="color: var(--blue-dark); font-size: 1.3rem; font-weight: 700; margin-bottom: 1rem;">Safe & Secure</h3>
                        <p style="color: var(--gray-600); line-height: 1.7; font-size: 0.95rem;">All our drivers undergo rigorous background checks and our vehicles are monitored in real-time via GPS during every intercity trip.</p>
                    </div>
                    <div class="trust-card" style="background: var(--gray-50); border: 1px solid var(--gray-100); padding: 2.5rem; border-radius: 24px; transition: 0.3s; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);">
                        <div style="background: var(--white); width: 50px; height: 50px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin-bottom: 1.5rem; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="color: var(--accent);"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
                        </div>
                        <h3 style="color: var(--blue-dark); font-size: 1.3rem; font-weight: 700; margin-bottom: 1rem;">On-Time Service</h3>
                        <p style="color: var(--gray-600); line-height: 1.7; font-size: 0.95rem;">Punctuality is our priority. Our drivers arrive at your doorstep 15 minutes before the scheduled time to ensure a stress-free departure.</p>
                    </div>
                    <div class="trust-card" style="background: var(--gray-50); border: 1px solid var(--gray-100); padding: 2.5rem; border-radius: 24px; transition: 0.3s; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);">
                        <div style="background: var(--white); width: 50px; height: 50px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin-bottom: 1.5rem; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="color: var(--accent);"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                        </div>
                        <h3 style="color: var(--blue-dark); font-size: 1.3rem; font-weight: 700; margin-bottom: 1rem;">Transparent Fares</h3>
                        <p style="color: var(--gray-600); line-height: 1.7; font-size: 0.95rem;">What you see is what you pay. Only pay for the distance you travel across Tamil Nadu. No hidden night charges or batta surprises.</p>
                    </div>
                </div>
            </div>
        </section>

        <section class="faq" id="faq" style="padding: 2.25rem 0; background: var(--gray-100);">
            <div class="container faq__layout">
                <div style="text-align: center; margin-bottom: 4rem;">
                    <p class="eyebrow">Assistance</p>
                    <h2 style="margin-bottom: 1.5rem;">Common Questions for <?php echo $cityData['city']; ?> Hub</h2>
                    <p style="max-width: 600px; margin: 0 auto; color: var(--gray-600);">Everything you need to know about booking and traveling with us from <?php echo $cityData['city']; ?>.</p>
                </div>
                <div class="faq__items" style="max-width: 900px; margin: 0 auto; display: grid; gap: 1.5rem;">
                    <article style="background: var(--white); padding: 2.2rem; border-radius: 24px; border: 1px solid var(--gray-200); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                        <h3 style="font-size: 1.25rem; color: var(--blue-dark); font-weight: 700;">Do you offer one-way drops from <?php echo $cityData['city']; ?>?</h3>
                        <p style="margin-top: 1.2rem; color: var(--gray-600); line-height: 1.7; font-size: 0.95rem;">Yes, we specialize in one-way drop taxis. You only pay for the one-way distance to your destination, with no return fare charges. This saves you up to 50% on long distance travel.</p>
                    </article>
                    <article style="background: var(--white); padding: 2.2rem; border-radius: 24px; border: 1px solid var(--gray-200); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                        <h3 style="font-size: 1.25rem; color: var(--blue-dark); font-weight: 700;">How can I book a cab from <?php echo $cityData['city']; ?>?</h3>
                        <p style="margin-top: 1.2rem; color: var(--gray-600); line-height: 1.7; font-size: 0.95rem;">You can book through our website form for an instant quote, or call our 24/7 helpline at <strong>+91 7200217986</strong> for immediate assistance. We offer instant confirmation via WhatsApp.</p>
                    </article>
                    <article style="background: var(--white); padding: 2.2rem; border-radius: 24px; border: 1px solid var(--gray-200); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                        <h3 style="font-size: 1.25rem; color: var(--blue-dark); font-weight: 700;">What vehicle options are available?</h3>
                        <p style="margin-top: 1.2rem; color: var(--gray-600); line-height: 1.7; font-size: 0.95rem;">We provide a wide range of vehicles including premium Sedans (Dzire/Etios), SUVs (Ertiga/Marazzo), and premium carriers like Innova Crysta. All cars are GPS-tracked and sanitized.</p>
                    </article>
                    <article style="background: var(--white); padding: 2.2rem; border-radius: 24px; border: 1px solid var(--gray-200); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                        <h3 style="font-size: 1.25rem; color: var(--blue-dark); font-weight: 700;">Are there any hidden night charges?</h3>
                        <p style="margin-top: 1.2rem; color: var(--gray-600); line-height: 1.7; font-size: 0.95rem;">No, we maintain transparent pricing with no extra night surcharge or driver bata surprises. Toll, parking, and state permit taxes are extra as per actuals.</p>
                    </article>
                    <article style="background: var(--white); padding: 2.2rem; border-radius: 24px; border: 1px solid var(--gray-200); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                        <h3 style="font-size: 1.25rem; color: var(--blue-dark); font-weight: 700;">Are tolls and state permits included in city hub outstation fares?</h3>
                        <p style="margin-top: 1.2rem; color: var(--gray-600); line-height: 1.7; font-size: 0.95rem;">Base per-km rates cover the vehicle and driver. Tolls, parking, and state entry permit taxes are charged extra at actuals unless an all-inclusive package is selected.</p>
                    </article>
                    <article style="background: var(--white); padding: 2.2rem; border-radius: 24px; border: 1px solid var(--gray-200); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                        <h3 style="font-size: 1.25rem; color: var(--blue-dark); font-weight: 700;">What is the cancellation policy for bookings from <?php echo htmlspecialchars($cityData['city']); ?>?</h3>
                        <p style="margin-top: 1.2rem; color: var(--gray-600); line-height: 1.7; font-size: 0.95rem;">We offer flexible cancellation with zero penalty when canceled prior to driver dispatch. 24/7 support is available for instant adjustments.</p>
                    </article>
                </div>
            </div>
        </section>
    </main>

    <div class="quote-modal" id="quote-modal" aria-hidden="true">
        <div class="quote-modal__card" role="dialog" aria-modal="true">
            <button class="quote-modal__close" id="quote-close" aria-label="Close">✕</button>
            <p class="eyebrow">Curated Ride Options</p>
            <h3 id="quote-summary">Choose the right cab</h3>
            <div class="quote-modal__meta"><span id="quote-route"></span><span id="quote-fare"></span></div>
            <div class="vehicle-grid" id="vehicle-grid"></div>
            <p class="quote-modal__cta">Call <a href="tel:+917200217986">+91 7200217986</a> to confirm.</p>
            <div class="quote-modal__actions">
                <button type="button" class="btn-outline" id="quote-back">Back</button>
                <button type="button" class="btn-primary" id="quote-continue">Continue</button>
            </div>
        </div>
    </div>

    <?php echo $shell->renderFooter(); ?>
    <?php echo $shell->renderScripts(); ?>
    <script defer src="<?php echo htmlspecialchars(dropcars_url('assets/js/page-section-url.js'), ENT_QUOTES, 'UTF-8'); ?>"></script>
<script defer src="/assets/js/animations.js"></script>
<script defer src="/assets/js/ai-assistant.js?v=<?php echo @filemtime(__DIR__.'/../assets/js/ai-assistant.js'); ?>"></script>
<script>
(function(){
  var strip=document.getElementById('dc-stats-strip');
  if(!strip)return;
  var ran=false;
  function run(){if(ran)return;ran=true;strip.querySelectorAll('[data-count]').forEach(function(el){var t=parseFloat(el.dataset.count),d=parseInt(el.dataset.decimal||0),s=el.dataset.suffix||'',st=null;requestAnimationFrame(function tick(ts){if(!st)st=ts;var p=Math.min((ts-st)/1400,1),e=1-Math.pow(1-p,3),v=t*e;el.textContent=(d?v.toFixed(d):Math.floor(v))+s;if(p<1)requestAnimationFrame(tick);});});strip.querySelectorAll('.d1t-reveal').forEach(function(el){el.classList.add('is-visible');});}
  new IntersectionObserver(function(e){if(e[0].isIntersecting)run();},{threshold:0.3}).observe(strip);
  setTimeout(run,1200);
})();
</script>
<script defer src="/assets/js/contact-step-reveal.js?v=<?php echo @filemtime(__DIR__.'/../assets/js/contact-step-reveal.js'); ?>"></script>
</body>
</html>

