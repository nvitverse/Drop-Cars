<?php
/**
 * Dynamic Route Page Generator
 */
require_once __DIR__ . '/../includes/check-blocked-main.php';
require_once __DIR__ . '/seo-core.php';
require_once __DIR__ . '/theme-engine.php';
require_once __DIR__ . '/shell.php';
require_once __DIR__ . '/content-blocks.php';
require_once __DIR__ . '/../includes/paths.php';
require_once __DIR__ . '/theme-seo.php';
if (!defined('DROP_CARS_DB_OPTIONAL')) define('DROP_CARS_DB_OPTIONAL', true);
require_once __DIR__ . '/../admin/config/database.php';
require_once __DIR__ . '/../includes/customer-prefill.php';
$_pfPdo = (isset($pdo) && $pdo instanceof PDO) ? $pdo : (isset($GLOBALS['db']) && $GLOBALS['db'] instanceof PDO ? $GLOBALS['db'] : null);
[$_pfName, $_pfEmail, $_pfNational, , $_pfCC] = dropcars_customer_prefill($_pfPdo);

$seo = new SEOCore();
$themeEngine = new ThemeEngine();
$allThemes = $themeEngine->getAllThemes();
$themeSlug = trim((string) ($_GET['theme'] ?? ''));
$activeTheme = dropcars_merge_theme_seo(dropcars_theme_resolve($allThemes, $themeSlug !== '' ? $themeSlug : null, $themeEngine->detectTheme()));
$themeName = $activeTheme['name'] ?? 'Drop Cars';
$contentBlocks = new ContentBlocks($activeTheme);
$shell = new UIShell($activeTheme, $allThemes);

$pickupSlug = $_GET['pickup'] ?? '';
$dropSlug = $_GET['drop'] ?? '';

$citiesPath = __DIR__ . '/../data/cities.json';
$citiesData = is_file($citiesPath) ? json_decode(file_get_contents($citiesPath), true) : [];
$citySlugs = [];
if (is_array($citiesData)) {
    foreach ($citiesData as $c) {
        if (isset($c['slug']) && $c['slug'] !== '') {
            $citySlugs[] = (string)$c['slug'];
        }
    }
}

// Typo-tolerance: getCityBySlug(..., true) below always synthesizes SOME
// city object for any non-empty slug (never null), so a misspelled URL like
// /kotkupm-to-chennai would previously render a fake, generic "Kotkupm"
// page instead of the real Kottakuppam one. Catch that here and 301 to the
// corrected URL when a confident match exists.
if (function_exists('dropcars_find_closest_slug') && $pickupSlug !== '' && $dropSlug !== '') {
    $correctedPickupSlug = in_array($pickupSlug, $citySlugs, true) ? $pickupSlug : dropcars_find_closest_slug($pickupSlug, $citySlugs);
    $correctedDropSlug = in_array($dropSlug, $citySlugs, true) ? $dropSlug : dropcars_find_closest_slug($dropSlug, $citySlugs);
    if ($correctedPickupSlug !== null && $correctedDropSlug !== null
        && ($correctedPickupSlug !== $pickupSlug || $correctedDropSlug !== $dropSlug)) {
        $redirectThemeSlug = $activeTheme['slug'] ?? 'drop-cars';
        $redirectDest = dropcars_theme_page_url($redirectThemeSlug, $correctedPickupSlug, $correctedDropSlug);
        parse_str($_SERVER['QUERY_STRING'] ?? '', $redirectQueryParams);
        unset($redirectQueryParams['pickup'], $redirectQueryParams['drop']);
        $redirectNewQuery = http_build_query($redirectQueryParams);
        header('Location: ' . $redirectDest . ($redirectNewQuery ? '?' . $redirectNewQuery : ''), true, 301);
        exit;
    }
}

$pickupCity = $seo->getCityBySlug($pickupSlug, true);
$dropCity = $seo->getCityBySlug($dropSlug, true);

$isPredefinedRoute = in_array($pickupSlug, $citySlugs, true) && in_array($dropSlug, $citySlugs, true);
$routeUrlPath = $pickupSlug . ($isPredefinedRoute ? '-' : '-to-') . $dropSlug;

if ($pickupCity && function_exists('dropcars_redirect_to_subdomain_if_needed')) {
    $routeThemeSlug = $activeTheme['slug'] ?? $themeSlug;
    if ($routeThemeSlug === '') {
        $routeThemeSlug = 'drop-cars';
    }
    $pathSegment = $routeThemeSlug . '/' . $routeUrlPath;
    if (isset($_GET['section']) && $_GET['section'] !== '') {
        $pathSegment .= '/' . $_GET['section'];
    }
    dropcars_redirect_to_subdomain_if_needed($pickupSlug, $pathSegment);
}

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

if (!$pickupCity || !$dropCity) {
    header("HTTP/1.0 404 Not Found");
    echo "<h1>404 Not Found</h1><p>Route not found.</p>";
    exit;
}

$routeSectionSlug = isset($_GET['section']) ? trim((string) $_GET['section']) : '';
if ($routeSectionSlug !== '' && !dropcars_route_section_is_valid_slug($routeSectionSlug)) {
    header('HTTP/1.0 404 Not Found');
    echo '<h1>404 Not Found</h1>';
    exit;
}
$pageScrollToId = ($routeSectionSlug !== '') ? dropcars_route_section_element_id($routeSectionSlug) : null;

$routeThemeSlug = $activeTheme['slug'] ?? 'drop-cars';
$routeCanonicalUrl = rtrim(dropcars_public_origin(), '/') . dropcars_theme_page_url($routeThemeSlug, $pickupSlug, $dropSlug);

$route = $seo->getRouteInfo($pickupSlug, $dropSlug);
$distance = $route['distanceKm'] ?? 0;
$time = $route['travelTime'] ?? ($distance > 0 ? dropcars_format_duration_dynamic($distance) : '0 mins');

// Base fare calculation
$baseFare = $route['fareEstimate'];
$tollEst = round($distance * 2);
$borderFee = 0;
$pickupRegion = $pickupCity['region'] ?? '';
$dropRegion = $dropCity['region'] ?? '';
if ($pickupRegion && $dropRegion && $pickupRegion !== $dropRegion) {
    $borderFee = 500;
}
$inclusiveFare = $baseFare + $tollEst + $borderFee;

// Load custom route SEO content if available
$customSeoFile = __DIR__ . '/../data/route_seo_content.json';
$customSeoData = is_file($customSeoFile) ? json_decode(file_get_contents($customSeoFile), true) : [];
$routeKey = $pickupSlug . '-to-' . $dropSlug;
$customRouteSeo = $customSeoData[$routeKey] ?? $customSeoData[$dropSlug . '-to-' . $pickupSlug] ?? null;

if (!$customRouteSeo) {
    foreach ($customSeoData as $key => $val) {
        $cleanKey = str_replace('-to-', '-', $key);
        if ($cleanKey === ($pickupSlug . '-' . $dropSlug) || $cleanKey === ($dropSlug . '-' . $pickupSlug)) {
            $customRouteSeo = $val;
            break;
        }
    }
}

$hasCustomOverview = !empty($customRouteSeo['overview']);
$hasCustomHighlights = !empty($customRouteSeo['highlights']);
$hasCustomFaqs = !empty($customRouteSeo['faqs']);

$routeSeoCtx = [
    'pickup' => $pickupCity['city'],
    'drop' => $dropCity['city'],
    'distanceKm' => round((float) $distance, 1),
    'fareEstimate' => number_format((int) $baseFare),
];
$title = dropcars_theme_expand($activeTheme, dropcars_theme_get($activeTheme, 'routeMetaTitleTpl', '{{pickup}} to {{drop}} One-Way Drop Taxi | Starts from ₹{{fareEstimate}} | {{themeName}}'), $routeSeoCtx);
$description = $hasCustomOverview 
    ? htmlspecialchars($customRouteSeo['overview'], ENT_QUOTES, 'UTF-8')
    : dropcars_theme_expand($activeTheme, dropcars_theme_get($activeTheme, 'routeMetaDescTpl', 'Book {{pickup}} to {{drop}} {{themeName}} (~{{distanceKm}} km) with Fixed Per-KM Rates and Zero Return Fares. Estimated sedan fare starts from ₹{{fareEstimate}}, with transparent bills & verified drivers.'), $routeSeoCtx);

$popularFrom = [];
foreach ($seo->getPopularRoutesFrom($pickupSlug, 80) as $t) {
    if (($t['slug'] ?? '') === $dropSlug) {
        continue;
    }
    $popularFrom[] = $t;
    if (count($popularFrom) >= 50) {
        break;
    }
}

// Route map: classic maps?q=&output=embed is often blank in iframes; use Embed API (directions) with same key as booking form.
$envFile = __DIR__ . '/../config/env.php';
if (is_file($envFile) && !defined('GOOGLE_MAPS_API_KEY')) {
    require_once $envFile;
}
$routeMapsKey = (defined('GOOGLE_MAPS_API_KEY') && (string) GOOGLE_MAPS_API_KEY !== '')
    ? trim((string) GOOGLE_MAPS_API_KEY)
    : '';
$routeMapOrigin = implode(', ', array_filter([
    (string) ($pickupCity['city'] ?? ''),
    (string) ($pickupCity['state'] ?? ''),
    'India',
], function ($p) {
    return $p !== '';
}));
$routeMapDestination = implode(', ', array_filter([
    (string) ($dropCity['city'] ?? ''),
    (string) ($dropCity['state'] ?? ''),
    'India',
], function ($p) {
    return $p !== '';
}));
$routeMapOpenUrl = 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin='
    . rawurlencode($routeMapOrigin)
    . '&destination=' . rawurlencode($routeMapDestination);

$routeMapIframeSrc = 'https://maps.google.com/maps?saddr='
    . rawurlencode($routeMapOrigin)
    . '&daddr=' . rawurlencode($routeMapDestination)
    . '&hl=en&t=m&output=embed';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="<?php echo htmlspecialchars($description, ENT_QUOTES, 'UTF-8'); ?>" />
    <meta name="keywords" content="<?php echo htmlspecialchars(dropcars_theme_get($activeTheme, 'seoKeywords', 'one way taxi, outstation cab, intercity route taxi, Tamil Nadu'), ENT_QUOTES, 'UTF-8'); ?>" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <link rel="canonical" href="<?php echo htmlspecialchars($routeCanonicalUrl, ENT_QUOTES, 'UTF-8'); ?>" />
    <title><?php echo htmlspecialchars($title, ENT_QUOTES, 'UTF-8'); ?></title>

    <!-- Open Graph Meta Tags -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="<?php echo htmlspecialchars($routeCanonicalUrl, ENT_QUOTES, 'UTF-8'); ?>" />
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
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "TaxiService",
      "name": "<?php echo htmlspecialchars($themeName, ENT_QUOTES, 'UTF-8'); ?>",
      "description": "<?php echo htmlspecialchars($description, ENT_QUOTES, 'UTF-8'); ?>",
      "url": "<?php echo htmlspecialchars($routeCanonicalUrl, ENT_QUOTES, 'UTF-8'); ?>",
      "provider": {
        "@type": "LocalBusiness",
        "name": "Drop Cars",
        "telephone": "+917598899579",
        "priceRange": "₹₹"
      },
      "areaServed": [
        {
          "@type": "City",
          "name": "<?php echo htmlspecialchars($pickupCity['city'], ENT_QUOTES, 'UTF-8'); ?>"
        },
        {
          "@type": "City",
          "name": "<?php echo htmlspecialchars($dropCity['city'], ENT_QUOTES, 'UTF-8'); ?>"
        }
      ],
      "offers": {
        "@type": "Offer",
        "priceCurrency": "INR",
        "price": "<?php echo (int)$route['fareEstimate']; ?>",
        "priceSpecification": {
          "@type": "UnitPriceSpecification",
          "priceType": "http://purl.org/goodrelations/v1#EstimatedPrice",
          "price": "<?php echo (int)$route['fareEstimate']; ?>",
          "priceCurrency": "INR"
        }
      }
    }
    </script>
    <?php
    $_routeBreadcrumb = [
        '@context' => 'https://schema.org',
        '@type' => 'BreadcrumbList',
        'itemListElement' => [
            ['@type' => 'ListItem', 'position' => 1, 'name' => 'Home', 'item' => 'https://dropcars.in'],
            ['@type' => 'ListItem', 'position' => 2, 'name' => $pickupCity['city'] . ' to ' . $dropCity['city'], 'item' => $routeCanonicalUrl],
        ],
    ];
    ?>
    <script type="application/ld+json"><?php echo json_encode($_routeBreadcrumb, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); ?></script>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How much is the taxi fare from <?php echo htmlspecialchars($pickupCity['city'], ENT_QUOTES, 'UTF-8'); ?> to <?php echo htmlspecialchars($dropCity['city'], ENT_QUOTES, 'UTF-8'); ?>?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The estimated fare starts from INR <?php echo number_format($route['fareEstimate']); ?> for a one-way Sedan booking. This is calculated based on a distance of ~<?php echo $distance; ?> km at ₹14 per km. SUV fares start higher."
          }
        },
        {
          "@type": "Question",
          "name": "What is the distance between <?php echo htmlspecialchars($pickupCity['city'], ENT_QUOTES, 'UTF-8'); ?> and <?php echo htmlspecialchars($dropCity['city'], ENT_QUOTES, 'UTF-8'); ?>?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The road distance is approximately <?php echo $distance; ?> km via the main highways. The travel time is typically around <?php echo $time; ?>."
          }
        },
        {
          "@type": "Question",
          "name": "How long does it take by taxi?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The journey usually takes about <?php echo $time; ?>, though this can vary depending on traffic conditions and road work on the national highway."
          }
        },
        {
          "@type": "Question",
          "name": "Is one way taxi available to <?php echo htmlspecialchars($dropCity['city'], ENT_QUOTES, 'UTF-8'); ?>?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes, Drop Cars specializes in one-way intercity drops. You only pay for your journey from <?php echo htmlspecialchars($pickupCity['city'], ENT_QUOTES, 'UTF-8'); ?> to <?php echo htmlspecialchars($dropCity['city'], ENT_QUOTES, 'UTF-8'); ?>, not for the return trip."
          }
        },
        {
          "@type": "Question",
          "name": "Are tolls, driver bata, and state permits included in the fare?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Base per-km fares exclude tolls and state permits, which are charged at actuals. You can also toggle the Toll Included option on our fare estimator to see a flat all-inclusive estimate with zero surprise charges."
          }
        },
        {
          "@type": "Question",
          "name": "What vehicle options can I book for <?php echo htmlspecialchars($pickupCity['city'], ENT_QUOTES, 'UTF-8'); ?> to <?php echo htmlspecialchars($dropCity['city'], ENT_QUOTES, 'UTF-8'); ?>?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "We provide clean, sanitized AC Sedans (Dzire/Etios for up to 4 passengers), AC SUVs (Ertiga for up to 6 passengers), and premium carriers like Innova Crysta. All vehicles are GPS-monitored with verified chauffeurs."
          }
        }
      ]
    }
    </script>

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    
    <?php $bp = function_exists('dropcars_base_path') ? rtrim(dropcars_base_path(), '/') : ''; ?>
    <!-- Critical Render-Blocking CSS (Synchronous) -->
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/base.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/base.css'); ?>" />
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/layout.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/layout.css'); ?>" />
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/navbar.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/navbar.css'); ?>" />
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/hero.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/hero.css'); ?>" />
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/booking-form.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/booking-form.css'); ?>" />

    <!-- Non-Critical UI CSS (Deferred/Asynchronous) -->
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/vehicle-section.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/vehicle-section.css'); ?>" />
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/city-routes.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/city-routes.css'); ?>" />
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/faq.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/faq.css'); ?>" />
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/footer.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/footer.css'); ?>" />
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/responsive.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/responsive.css'); ?>" />
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/whatsapp.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/whatsapp.css'); ?>" />
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/seo-content.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/seo-content.css'); ?>" />
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/dark-mode.css?v=2.0">
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/light-theme.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/light-theme.css'); ?>">
    <?php if (($activeTheme['slug'] ?? '') === 'airport-taxi'): ?>
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/theme-airporttaxi.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/theme-airporttaxi.css'); ?>">
    <?php endif; ?>
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/stats-strip.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/stats-strip.css'); ?>">
    <link rel="stylesheet" href="<?php echo $bp; ?>/assets/css/animations.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/animations.css'); ?>">
    <script src="<?php echo $bp; ?>/assets/js/dark-mode.js?v=2.0"></script>
    <script>window.DROP_CARS_BASE_PATH = <?php echo json_encode(dropcars_base_path(), JSON_HEX_TAG | JSON_HEX_AMP); ?>;</script>
    <script>
    window.DROP_CARS_THEME_SLUG = <?php echo json_encode($routeThemeSlug, JSON_HEX_TAG | JSON_HEX_AMP); ?>;
    window.DROP_CARS_PAGE_SECTION_BASE = <?php echo json_encode(dropcars_theme_page_url($routeThemeSlug, $pickupSlug, $dropSlug), JSON_HEX_TAG | JSON_HEX_AMP); ?>;
    window.DROP_CARS_PAGE_SECTION_ID_TO_SLUG = <?php echo json_encode(array_flip(dropcars_route_section_map()), JSON_UNESCAPED_UNICODE); ?>;
    // Precise addresses for Distance Matrix geocoding — prevents bare city names resolving to wrong countries
    window.DROP_ROUTE_PICKUP_ADDR = <?php echo json_encode(
        implode(', ', array_filter([
            $pickupCity['city'] ?? '',
            $pickupCity['state'] ?? '',
            'India'
        ], function($p) { return $p !== ''; })),
        JSON_HEX_TAG | JSON_HEX_AMP
    ); ?>;
    window.DROP_ROUTE_DROP_ADDR = <?php echo json_encode(
        implode(', ', array_filter([
            $dropCity['city'] ?? '',
            $dropCity['state'] ?? '',
            'India'
        ], function($p) { return $p !== ''; })),
        JSON_HEX_TAG | JSON_HEX_AMP
    ); ?>;
    </script>

    <style>
        .route-hero {
            background: url('<?php echo htmlspecialchars(dropcars_url('assets/img/hero-light-bg-v4.png'), ENT_QUOTES, 'UTF-8'); ?>') center center / cover no-repeat;
            padding: 1rem 0;
            position: relative;
            overflow: hidden;
            color: #0f172a;
            transition: background 0.3s;
        }
        html:not(.dark-mode) .trust-card {
            background: rgba(255, 255, 255, 0.05) !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
        }
        .route-hero::before {
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

        .route-hero__content {
            position: relative;
            z-index: 3;
        }
        .breadcrumbs {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 0.75rem;
            font-size: 0.9rem;
        }
        .breadcrumbs a { color: #0369a1; text-decoration: none; }
        .breadcrumbs span { color: #94a3b8; }

        .route-hero h1 {
            color: #ffffff !important;
            font-size: clamp(2rem, 4.5vw, 2.6rem);
            margin-bottom: 0.5rem;
            font-weight: 800;
            text-shadow: none;
        }
        .hero__layout {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1.5rem !important;
            text-align: center;
        }
        .route-hero .container {
            width: min(1280px, 94vw);
        }
        .trust-line {
            display: flex;
            gap: 1rem;
            font-size: 0.9rem;
            color: #475569;
            margin-top: 0.5rem;
        }
        .trust-line span { display: flex; align-items: center; gap: 0.5rem; }
        
        .route-map-section {
            padding: 2rem 0;
            background: var(--white);
            border-bottom: 1px solid var(--gray-100);
        }
        .route-map-section .route-map-container {
            min-height: 420px;
            background: var(--white);
            border-radius: 24px;
            overflow: hidden;
            box-shadow: var(--shadow);
            border: 1px solid var(--gray-200);
        }
        .route-map-section .route-map-container iframe {
            width: 100%;
            min-height: 420px;
            height: 480px;
            display: block;
            border: 0;
        }
        .route-map-footer {
            margin: 0;
            padding: 0.75rem 1rem;
            font-size: 0.88rem;
            text-align: center;
            background: var(--gray-50);
            border-top: 1px solid var(--gray-200);
        }
        .route-map-link {
            color: var(--blue-dark, #0f172a);
            font-weight: 700;
            text-decoration: none;
            transition: color 0.2s ease;
        }
        .route-map-link:hover {
            color: var(--blue, #0284c7);
            text-decoration: underline;
        }

        /* Dark Mode overrides for Route Map Section */
        html.dark-mode .route-map-section {
            background: #060d1e !important;
            border-bottom-color: rgba(255, 255, 255, 0.08) !important;
        }
        html.dark-mode .route-map-container {
            background: #0f1c2e !important;
            border-color: rgba(255, 255, 255, 0.14) !important;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5) !important;
        }
        html.dark-mode .route-map-footer {
            background: #13233a !important;
            border-top-color: rgba(255, 255, 255, 0.12) !important;
        }
        html.dark-mode .route-map-link {
            color: #38bdf8 !important;
            font-weight: 700 !important;
        }
        html.dark-mode .route-map-link:hover {
            color: #7dd3fc !important;
            text-decoration: underline !important;
        }
        @media (max-width: 768px) {
            .route-map-section .route-map-container iframe {
                height: 360px;
                min-height: 360px;
            }
        }
        
        .fare-summary-toggle-wrapper {
            margin-bottom: 1.5rem;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .fare-summary-toggle-wrapper .toggle-label {
            font-size: 0.9rem;
            color: rgba(255,255,255,0.7);
            font-weight: 500;
        }
        .fare-summary-switch {
            position: relative;
            display: inline-block;
            width: 44px;
            height: 24px;
        }
        .fare-summary-switch input {
            opacity: 0; width: 0; height: 0;
        }
        .fare-summary-slider {
            position: absolute;
            cursor: pointer;
            inset: 0;
            background-color: rgba(255,255,255,0.15);
            transition: .4s;
            border-radius: 34px;
            border: 1px solid rgba(255,255,255,0.3);
        }
        .fare-summary-slider:before {
            position: absolute;
            content: "";
            height: 16px;
            width: 16px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .fare-summary-switch input:checked + .fare-summary-slider {
            background-color: var(--accent);
            border-color: var(--accent);
        }
        .fare-summary-switch input:checked + .fare-summary-slider:before {
            transform: translateX(20px);
        }
        html.dark-mode body.route-page .quote-modal__card {
            background: #0f1c2e;
            border: 1px solid rgba(255, 255, 255, 0.16);
            color: #fff;
        }
        html.dark-mode body.route-page .quote-modal__close {
            background: rgba(255, 255, 255, 0.14);
            color: #fff;
        }
        html.dark-mode body.route-page .quote-modal--estimate-mode .quote-modal__meta {
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.2);
        }
        html.dark-mode body.route-page .fare-list-header {
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.2);
        }
        html.dark-mode body.route-page .fare-list-header__title,
        html.dark-mode body.route-page .fare-list-header__route,
        html.dark-mode body.route-page .fare-list-header__time,
        html.dark-mode body.route-page .quote-fare-type-title,
        html.dark-mode body.route-page .quote-modal__meta,
        html.dark-mode body.route-page #quote-route,
        html.dark-mode body.route-page #quote-fare {
            color: #fff;
        }
        html.dark-mode body.route-page .quote-fare-type-toggle {
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(255, 255, 255, 0.2);
            color: #fff;
        }
        html.dark-mode body.route-page .quote-fare-type-toggle__option {
            color: rgba(255, 255, 255, 0.8);
        }
        html.dark-mode body.route-page .vehicle-card--fare-option {
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.22);
        }
        html.dark-mode body.route-page .vehicle-card--fare-option.active {
            background: linear-gradient(180deg, #143761 0%, #0c2a4f 100%);
            border-color: #2bc4ff;
            box-shadow: 0 8px 16px rgba(4, 18, 37, 0.46);
        }
        html.dark-mode body.route-page .vehicle-card__title-line,
        html.dark-mode body.route-page .vehicle-card__title-line small,
        html.dark-mode body.route-page .vehicle-card__meta,
        html.dark-mode body.route-page .vehicle-card__distance,
        html.dark-mode body.route-page .vehicle-card__price {
            color: #fff;
        }
        html.dark-mode body.route-page .selected-fare-card {
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.2);
        }
        html.dark-mode body.route-page .selected-fare-card__fare-title,
        html.dark-mode body.route-page .selected-fare-card__details h4,
        html.dark-mode body.route-page .selected-fare-card__details h4 small,
        html.dark-mode body.route-page .selected-fare-card__meta,
        html.dark-mode body.route-page .selected-fare-card__distance,
        html.dark-mode body.route-page .selected-fare-card__amount {
            color: #fff;
        }
        html.dark-mode body.route-page .selected-fare-card__toggle {
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(255, 255, 255, 0.2);
            color: #fff;
        }
        html.dark-mode body.route-page .selected-fare-card__toggle input:checked + .selected-fare-card__option--base + .selected-fare-card__switch {
            background: #2bc4ff;
        }
        html.dark-mode body.route-page .selected-fare-card__toggle input:not(:checked) + .selected-fare-card__option--base {
            color: #fff;
            opacity: 1;
        }
        html.dark-mode body.route-page .selected-fare-card__toggle input:checked ~ .selected-fare-card__option--inclusive {
            color: #fff;
            opacity: 1;
        }
        html.dark-mode body.route-page .selected-fare-card__option {
            color: rgba(255, 255, 255, 0.85);
        }
        html.dark-mode body.route-page .quote-modal__actions .btn-outline {
            background: transparent !important;
            color: #fff !important;
            border: 2px solid rgba(255, 255, 255, 0.6) !important;
        }
        html.dark-mode body.route-page .quote-modal__actions .btn-outline:hover {
            border-color: #fff !important;
            background: rgba(255, 255, 255, 0.08) !important;
            color: #fff !important;
        }
        html.dark-mode body.route-page .quote-modal__actions .btn-primary,
        html.dark-mode body.route-page .quote-modal .quote-btn--confirm {
            background: linear-gradient(120deg, #0f1c2e, #152a45) !important;
            color: #fff !important;
            border: 2px solid #2eb5ff !important;
            box-shadow: 0 4px 16px rgba(46, 181, 255, 0.25) !important;
        }
        html.dark-mode body.route-page .quote-modal__actions .btn-primary:hover,
        html.dark-mode body.route-page .quote-modal .quote-btn--confirm:hover {
            border-color: #5cc5ff;
            box-shadow: 0 6px 20px rgba(46, 181, 255, 0.35);
        }
    </style>

    <?php
    require_once __DIR__ . '/../includes/reviews.php';
    $routeReviews = dropcars_get_route_reviews($pickupCity['city'], $dropCity['city'], 3);

    // Extract ratings for schema if reviews exist. Never fabricate a rating:
    // if there are 0 real reviews for this route, aggregateRating is simply
    // omitted from the schema below rather than defaulted to a made-up
    // number - fake review/rating markup is against Google's structured
    // data guidelines and can trigger a manual action.
    $ratingCount = count($routeReviews);
    $ratingSum = 0;
    foreach ($routeReviews as $rv) {
        $ratingSum += $rv['rating'] ?? 5;
    }
    $avgRating = $ratingCount > 0 ? round($ratingSum / $ratingCount, 1) : null;

    $_routeTaxiServiceSchema = [
        '@context' => 'https://schema.org',
        '@type' => 'TaxiService',
        'name' => $pickupCity['city'] . ' to ' . $dropCity['city'] . ' Taxi',
        'description' => $description,
        'provider' => [
            '@type' => 'LocalBusiness',
            'name' => 'Drop Cars',
            'telephone' => '+91-7200217986',
            'email' => 'support@dropcars.in',
            'url' => 'https://dropcars.in',
        ],
        'areaServed' => ['@type' => 'State', 'name' => 'Tamil Nadu'],
        'serviceType' => 'City to City Taxi',
        'offers' => [
            '@type' => 'Offer',
            'priceCurrency' => 'INR',
            'price' => (string) $route['fareEstimate'],
            'description' => 'Starting fare for Sedan one way',
        ],
    ];
    if ($avgRating !== null) {
        $_routeTaxiServiceSchema['aggregateRating'] = [
            '@type' => 'AggregateRating',
            'ratingValue' => (string) $avgRating,
            'reviewCount' => (string) $ratingCount,
            'bestRating' => '5',
        ];
    }
    ?>
    <script type="application/ld+json"><?php echo json_encode($_routeTaxiServiceSchema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); ?></script>
    <?php
    $_routeBreadcrumb2 = [
        '@context' => 'https://schema.org',
        '@type' => 'BreadcrumbList',
        'itemListElement' => [
            ['@type' => 'ListItem', 'position' => 1, 'name' => 'Home', 'item' => 'https://dropcars.in'],
            ['@type' => 'ListItem', 'position' => 2, 'name' => $pickupCity['city'] . ' to ' . $dropCity['city'], 'item' => $routeCanonicalUrl],
        ],
    ];
    ?>
    <script type="application/ld+json"><?php echo json_encode($_routeBreadcrumb2, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); ?></script>
    <?php
    // Build FAQ Schema dynamically based on route details
    $faqSchema = [
        "@context" => "https://schema.org",
        "@type" => "FAQPage",
        "mainEntity" => []
    ];

    $faqList = [
        [
            "q" => "How much is the taxi fare from " . $pickupCity['city'] . " to " . $dropCity['city'] . "?",
            "a" => "The estimated fare starts from ₹" . number_format($route['fareEstimate']) . " for a one-way Sedan booking. This is calculated based on a distance of ~" . $distance . " km at ₹14 per km. SUV fares start higher."
        ],
        [
            "q" => "What is the distance between " . $pickupCity['city'] . " and " . $dropCity['city'] . "?",
            "a" => "The road distance is approximately " . $distance . " km via the main highways. The travel time is typically around " . $time . "."
        ],
        [
            "q" => "How long does it take by taxi?",
            "a" => "The journey usually takes about " . $time . ", though this can vary depending on traffic conditions and road work on the national highway."
        ],
        [
            "q" => "Is one way taxi available to " . $dropCity['city'] . "?",
            "a" => "Yes, Drop Cars specializes in one-way intercity drops. You only pay for your journey from " . $pickupCity['city'] . " to " . $dropCity['city'] . ", not for the return trip."
        ]
    ];

    if ($hasCustomFaqs) {
        foreach ($customRouteSeo['faqs'] as $customFaq) {
            array_unshift($faqList, [
                "q" => $customFaq['question'],
                "a" => $customFaq['answer']
            ]);
        }
    }

    foreach ($faqList as $f) {
        $faqSchema['mainEntity'][] = [
            "@type" => "Question",
            "name" => $f['q'],
            "acceptedAnswer" => [
              "@type" => "Answer",
              "text" => $f['a']
            ]
        ];
    }
    ?>
    <script type="application/ld+json">
    <?php echo json_encode($faqSchema, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP); ?>
    </script>
<?php include __DIR__ . '/../includes/google-tag.php'; ?>
</head>
<body class="route-page <?php echo ($activeTheme['slug'] ?? '') === 'airport-taxi' ? ('theme-airporttaxi ' . (function_exists('dropcars_is_native_airporttaxi_host') && dropcars_is_native_airporttaxi_host() ? 'ati-native' : 'ati-embedded')) : ''; ?>" data-active-theme-id="<?php echo htmlspecialchars($activeTheme['id'] ?? 'drop-cars', ENT_QUOTES, 'UTF-8'); ?>" data-page-scroll-to="<?php echo htmlspecialchars($pageScrollToId ?? '', ENT_QUOTES, 'UTF-8'); ?>">
    <?php echo $shell->renderHeader(); ?>

    <main>
        <section class="route-hero hero" id="bookTaxi">
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
                    <div class="hero-slide__bg" style="background-image: url('/assets/img/hero-slide-4.png');"></div>
                </div>
                <div class="hero-slide">
                    <div class="hero-slide__bg" style="background-image: url('/assets/img/hero-slide-5.png');"></div>
                </div>
            </div>

            <div class="container hero__layout">
                <div class="hero__copy">
                    <nav class="breadcrumb" aria-label="Breadcrumb" style="margin-bottom:0.6rem;">
                        <a href="/" style="color:rgba(255,255,255,0.7);">Home</a>
                        <span class="breadcrumb__sep" style="color:rgba(255,255,255,0.4);">›</span>
                        <a href="/services" style="color:rgba(255,255,255,0.7);">Routes</a>
                        <span class="breadcrumb__sep" style="color:rgba(255,255,255,0.4);">›</span>
                        <span class="breadcrumb__current" style="color:#ffffff;"><?php echo htmlspecialchars($pickupCity['city']); ?> to <?php echo htmlspecialchars($dropCity['city']); ?></span>
                    </nav>
                    <!-- Text Slideshow -->
                    <div class="hero-slider-text">
                        <div class="hero-text-slide active">
                            <div class="hero__eyebrow">✦ Official Route Booking</div>
                            <h1><?php echo htmlspecialchars($title); ?></h1>
                            <p class="hero__sub"><?php echo htmlspecialchars($description); ?></p>
                        </div>
                        <div class="hero-text-slide">
                            <div class="hero__eyebrow">✦ Top Intercity Route</div>
                            <h1><?php echo htmlspecialchars(dropcars_theme_expand($activeTheme, dropcars_theme_get($activeTheme, 'routeH1Template', '{{pickup}} to {{drop}} | {{themeName}} one-way (~{{distanceKm}} km)'), $routeSeoCtx), ENT_QUOTES, 'UTF-8'); ?></h1>
                            <p class="hero__sub"><?php echo htmlspecialchars(dropcars_theme_expand($activeTheme, dropcars_theme_get($activeTheme, 'routeHeroIntro', 'Book a ' . $pickupCity['city'] . ' to ' . $dropCity['city'] . ' One-Way Drop Taxi with Fixed Per-KM Rates, Zero Return Fares and verified drivers.'), $routeSeoCtx), ENT_QUOTES, 'UTF-8'); ?></p>
                        </div>
                        <div class="hero-text-slide">
                            <div class="hero__eyebrow">✦ One-Way Drop Taxi</div>
                            <h1>One-Way Taxi: <?php echo htmlspecialchars($pickupCity['city']); ?> → <?php echo htmlspecialchars($dropCity['city']); ?></h1>
                            <p class="hero__sub">Book a dedicated One-Way Drop Taxi from <?php echo htmlspecialchars($pickupCity['city']); ?> to <?php echo htmlspecialchars($dropCity['city']); ?> with Zero Return Fares and verified highway chauffeurs.</p>
                        </div>
                        <div class="hero-text-slide">
                            <div class="hero__eyebrow">✦ Doorstep Pickup &amp; Drop</div>
                            <h1>Outstation Cab: <?php echo htmlspecialchars($pickupCity['city']); ?> → <?php echo htmlspecialchars($dropCity['city']); ?></h1>
                            <p class="hero__sub">Doorstep pickup from <?php echo htmlspecialchars($pickupCity['city']); ?> with direct drop at <?php echo htmlspecialchars($dropCity['city']); ?>. Sanitized AC sedans and SUVs with Fixed Per-KM Rates and transparent billing.</p>
                        </div>
                        <div class="hero-text-slide">
                            <div class="hero__eyebrow">✦ Fixed Fare Guarantee</div>
                            <h1>Lowest Fare: <?php echo htmlspecialchars($pickupCity['city']); ?> → <?php echo htmlspecialchars($dropCity['city']); ?></h1>
                            <p class="hero__sub">Clear fare calculations including driver bata, per-km rates, and optional toll/state tax inclusions. Available 24/7 with instant booking confirmation.</p>
                        </div>
                    </div>
                </div>
                


                <script>window.DROP_CARS_PAGE_TITLE = "<?php echo addslashes($originCity); ?> to <?php echo addslashes($destCity); ?> Drop Taxi";</script>
                <div class="hero__booking-col">
                    <div style="margin-bottom: 0.5rem; display: flex; justify-content: center; align-items: center; width: 100%;">
                        <span id="booking-form-dynamic-title" class="airport-top-badge" style="display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: #ffffff; padding: 6px 14px; border-radius: 20px; font-size: 0.82rem; font-weight: 700; box-shadow: none; text-shadow: none; cursor: pointer; transition: all 0.3s ease;" onclick="if(window.DropCarsScrollToBookingForm){window.DropCarsScrollToBookingForm(true);}else{document.getElementById('booking-form').scrollIntoView({behavior:'smooth'});}">
                            🚖 Book <?php echo htmlspecialchars($originCity); ?> to <?php echo htmlspecialchars($destCity); ?> Drop Taxi
                        </span>
                    </div>

                    <div class="booking-card booking-card--home" aria-label="<?php echo htmlspecialchars($themeName); ?> booking form" style="margin-top: 0 !important;">
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
                                        <input type="text" name="pickup" id="pickup" value="<?php echo htmlspecialchars($pickupCity['city'], ENT_QUOTES, 'UTF-8'); ?>" placeholder="Pick Up Location" required autocomplete="off" style="padding-right: 35px;" />
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
                                    <input type="text" name="drop" id="drop" value="<?php echo htmlspecialchars($dropCity['city'], ENT_QUOTES, 'UTF-8'); ?>" placeholder="Drop Location" required autocomplete="off" />
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

        <!-- Route map directly under booking form -->
        <section class="trust route-map-section route-map-section--first" id="route-map" aria-label="Route map">
            <div class="container">
                <div class="route-map-container">
                    <?php if ($routeMapIframeSrc !== ''): ?>
                    <iframe
                        width="100%"
                        height="480"
                        style="border:0"
                        loading="lazy"
                        allowfullscreen
                        referrerpolicy="no-referrer-when-downgrade"
                        title="<?php echo htmlspecialchars('Driving route: ' . $pickupCity['city'] . ' to ' . $dropCity['city'], ENT_QUOTES, 'UTF-8'); ?>"
                        src="<?php echo htmlspecialchars($routeMapIframeSrc, ENT_QUOTES, 'UTF-8'); ?>"></iframe>
                    <p class="route-map-footer">
                        <a href="<?php echo htmlspecialchars($routeMapOpenUrl, ENT_QUOTES, 'UTF-8'); ?>" target="_blank" rel="noopener" class="route-map-link">Open full route in Google Maps ➔</a>
                    </p>
                    <?php else: ?>
                    <div style="min-height:420px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;padding:2rem;background:var(--gray-100,#f3f4f6);text-align:center;">
                        <p style="margin:0;color:var(--gray-600);max-width:28rem;font-size:0.95rem;line-height:1.6;">Set <code style="font-size:0.85em;">GOOGLE_MAPS_API_KEY</code> in <code style="font-size:0.85em;">config/env.php</code> and turn on <strong>Maps Embed API</strong> in Google Cloud to show the route map.</p>
                        <a class="btn-primary" style="display:inline-block;padding:0.65rem 1.25rem;border-radius:10px;text-decoration:none;font-weight:700;" href="<?php echo htmlspecialchars($routeMapOpenUrl, ENT_QUOTES, 'UTF-8'); ?>" target="_blank" rel="noopener">Open route in Google Maps</a>
                    </div>
                    <?php endif; ?>
                </div>
            </div>
        </section>

        <!-- Route Stats Section -->
        <section class="trust route-stats-section" style="padding: 1.5rem 0; background: var(--white); border-bottom: 1px solid var(--gray-100);">
            <div class="container">
                <div class="trust__grid route-stats-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; align-items: stretch;">
                    <div class="trust-card route-stat-card" style="text-align: center; padding: 1.25rem 0.6rem; border-radius: 16px; border: 1px solid var(--gray-100); transition: 0.3s; background: var(--gray-50); display: flex; flex-direction: column; align-items: center; justify-content: center;">
                        <div style="font-size: clamp(1.8rem, 3.5vw, 2.5rem); margin-bottom: 0.35rem;">📍</div>
                        <h3 style="font-size: clamp(0.7rem, 1.4vw, 0.88rem); color: var(--gray-400); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.35rem; font-weight: 700;">Distance</h3>
                        <p style="font-size: clamp(1.1rem, 2.4vw, 1.75rem); font-weight: 800; color: var(--blue-dark); margin: 0; white-space: nowrap;">~<?php echo $distance; ?> km</p>
                    </div>
                    <div class="trust-card route-stat-card" style="text-align: center; padding: 1.25rem 0.6rem; border-radius: 16px; border: 1px solid var(--gray-100); transition: 0.3s; background: var(--gray-50); display: flex; flex-direction: column; align-items: center; justify-content: center;">
                        <div style="font-size: clamp(1.8rem, 3.5vw, 2.5rem); margin-bottom: 0.35rem;">⏱️</div>
                        <h3 style="font-size: clamp(0.7rem, 1.4vw, 0.88rem); color: var(--gray-400); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.35rem; font-weight: 700;">Est. Time</h3>
                        <p style="font-size: clamp(0.95rem, 2vw, 1.55rem); font-weight: 800; color: var(--blue-dark); margin: 0; white-space: nowrap;">~<?php echo $time; ?></p>
                    </div>
                    <div class="trust-card route-stat-card" style="text-align: center; padding: 1.25rem 0.6rem; border-radius: 16px; border: 1px solid var(--accent); background: rgba(43, 196, 255, 0.05); box-shadow: 0 4px 15px rgba(43, 196, 255, 0.12); display: flex; flex-direction: column; align-items: center; justify-content: center;">
                        <div style="font-size: clamp(1.8rem, 3.5vw, 2.5rem); margin-bottom: 0.35rem;">💰</div>
                        <h3 style="font-size: clamp(0.7rem, 1.4vw, 0.88rem); color: var(--accent); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.35rem; font-weight: 700;">Starting Fare (Sedan)</h3>
                        <p style="font-size: clamp(1.1rem, 2.4vw, 1.75rem); font-weight: 800; color: var(--blue-dark); margin: 0; white-space: nowrap;">Starts from ₹<?php echo number_format($route['fareEstimate']); ?>*</p>
                    </div>
                </div>
            </div>
        </section>

        <!-- Trip overview & fare (map is above, after booking) -->
        <section class="trust route-overview-section" id="route-overview" style="padding: 4rem 0;">
            <div class="container" style="max-width: 900px;">
                <div class="route-details">
                    <p class="eyebrow">Trip Information</p>
                    <h2 style="font-size: 2.2rem;"><?php echo $pickupCity['city']; ?> to <?php echo $dropCity['city']; ?> Overview</h2>
                    <p style="margin-bottom: 1.35rem; font-size: 1.05rem; line-height: 1.7;"><?php
                    if ($hasCustomOverview) {
                        echo htmlspecialchars($customRouteSeo['overview'], ENT_QUOTES, 'UTF-8');
                    } else {
                        $routeOverviewDefault = 'Book {{themeName}} from {{pickup}} to {{drop}} (~{{distanceKm}} km one-way). {{seoFocusPhrase}} with Drop Cars: AC sedans &amp; SUVs, highway-experienced drivers, and tolls or permits charged at actuals.';
                        echo htmlspecialchars(dropcars_theme_expand($activeTheme, dropcars_theme_get($activeTheme, 'routeOverviewBody', $routeOverviewDefault), $routeSeoCtx), ENT_QUOTES, 'UTF-8');
                    }
                    ?></p>
                    
                    <h3 style="margin-top: 2.5rem; font-size: 1.5rem; font-weight: 800; color: var(--blue-dark);"><?php echo $pickupCity['city']; ?> to <?php echo $dropCity['city']; ?> Road Distance & Timing</h3>
                    <p style="font-size: 1.05rem; line-height: 1.6;">The journey from <?php echo $pickupCity['city']; ?> to <?php echo $dropCity['city']; ?> covers a road distance of approximately <strong><?php echo $distance; ?> km</strong>. On average, it takes about <strong><?php echo $time; ?></strong> to complete the trip via the most efficient highway routes.</p>
                    
                    <?php if ($hasCustomHighlights): ?>
                    <h3 style="margin-top: 2.5rem; font-size: 1.5rem; font-weight: 800; color: var(--blue-dark);">Route Highlights &amp; Travel Tips</h3>
                    <ul style="list-style: none; padding: 0; display: grid; gap: 1rem; margin-top: 1.25rem;">
                        <?php foreach ($customRouteSeo['highlights'] as $highlight): ?>
                        <li style="display: flex; gap: 0.8rem; line-height: 1.6; font-size: 1.05rem; align-items: flex-start;">
                            <span style="color: var(--blue); font-size: 1.25rem; font-weight: bold; line-height: 1;">✓</span>
                            <span style="color: var(--text);"><?php echo htmlspecialchars($highlight, ENT_QUOTES, 'UTF-8'); ?></span>
                        </li>
                        <?php endforeach; ?>
                    </ul>
                    <?php endif; ?>
                </div>
            </div>
        </section>

        <!-- Internal Links Section (Popular Routes from Pickup City) -->
        <?php if (!empty($popularFrom)): ?>
        <section class="routes-section" id="popular-routes" style="padding: 2.5rem 0; background: var(--white);">
            <div class="container">
                <div style="text-align: center; margin-bottom: 4rem;">
                    <p class="eyebrow">Connectivity</p>
                    <h2 style="font-size: 2.2rem; margin-bottom: 1rem;">Popular Routes from <?php echo htmlspecialchars($pickupCity['city'], ENT_QUOTES, 'UTF-8'); ?></h2>
                    <p style="color: var(--gray-400);">Explore other popular intercity destinations from <?php echo htmlspecialchars($pickupCity['city'], ENT_QUOTES, 'UTF-8'); ?></p>
                </div>
                <div class="routes-grid">
                    <?php foreach ($popularFrom as $target):
                        $sugSlug = $target['slug'] ?? '';
                        if ($sugSlug === '') {
                            continue;
                        }
                        $sugRi = $seo->getRouteInfo($pickupSlug, $sugSlug, false);
                        $sugDistKm = (float) ($sugRi['distanceKm'] ?? 0);
                        $sugTimingStr = dropcars_calculate_highway_timing($sugDistKm);
                        $sugDest = $target['city'] ?? $sugSlug;
                        ?>
                    <a href="<?php echo htmlspecialchars(dropcars_theme_page_url($routeThemeSlug, $pickupSlug, $sugSlug), ENT_QUOTES, 'UTF-8'); ?>" class="highway-signboard route-card--highway">
                        <div class="highway-signboard-shine"></div>
                        <div class="highway-signboard__header">
                            <span class="highway-badge">ONE-WAY CAB</span>
                            <span class="highway-signboard__code">EXPRESS ROUTE</span>
                        </div>
                        <div class="highway-signboard__route">
                            <span><?php echo htmlspecialchars($pickupCity['city'], ENT_QUOTES, 'UTF-8'); ?></span>
                            <span class="highway-signboard__route-arrow">➔</span>
                            <span><?php echo htmlspecialchars(trim($sugDest . (stripos($sugDest, 'taxi') === false ? ' Taxi' : '')), ENT_QUOTES, 'UTF-8'); ?></span>
                        </div>
                        <div class="highway-signboard__metrics">
                            <div class="highway-metric highway-metric--kms">
                                <span class="highway-metric__icon">🛣️</span>
                                <span><?php echo (int) round($sugDistKm); ?> KMS</span>
                            </div>
                            <div class="highway-metric highway-metric--timing">
                                <span class="highway-metric__icon">⏱️</span>
                                <span><?php echo htmlspecialchars($sugTimingStr, ENT_QUOTES, 'UTF-8'); ?></span>
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

        <?php echo $contentBlocks->renderServices('route-services'); ?>

        <?php echo $contentBlocks->renderFleetShowcase('route-fleet', [
            'eyebrow' => dropcars_theme_get($activeTheme, 'seoFleetEyebrow', 'Our fleet'),
            'title' => dropcars_theme_expand($activeTheme, dropcars_theme_get($activeTheme, 'seoFleetTitle', 'Choose a vehicle for your trip'), $routeSeoCtx),
        ]); ?>

        <!-- Safety and Service Checklist -->
        <section class="trust" style="padding: 2.25rem 0; background: var(--gray-50);">
            <div class="container" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 2.5rem; align-items: center;">
                <div>
                    <p class="eyebrow">Safety First</p>
                    <h2 style="font-size: 2rem; margin-bottom: 1.5rem;">Your Secure Journey from <?php echo $pickupCity['city']; ?></h2>
                    <p style="color: var(--gray-400); margin-bottom: 2rem; line-height: 1.7;">We implement strict safety protocols for every intercity ride to ensure you have a peaceful travel experience.</p>
                    <ul style="list-style: none; padding: 0; display: grid; gap: 1rem;">
                        <li style="display: flex; align-items: center; gap: 0.8rem; font-weight: 500;"><span style="color: var(--accent); font-size: 1.2rem;">✓</span> Real-time GPS Tracking</li>
                        <li style="display: flex; align-items: center; gap: 0.8rem; font-weight: 500;"><span style="color: var(--accent); font-size: 1.2rem;">✓</span> Verified Background-Checked Drivers</li>
                        <li style="display: flex; align-items: center; gap: 0.8rem; font-weight: 500;"><span style="color: var(--accent); font-size: 1.2rem;">✓</span> 24/7 Emergency Support</li>
                        <li style="display: flex; align-items: center; gap: 0.8rem; font-weight: 500;"><span style="color: var(--accent); font-size: 1.2rem;">✓</span> Sanitized and Serviced Vehicles</li>
                    </ul>
                </div>
                <div style="background: var(--white); padding: 1.75rem; border-radius: 24px; box-shadow: var(--shadow); border: 1px solid var(--gray-200);">
                    <h3 style="font-size: 1.3rem; margin-bottom: 1.5rem; color: var(--blue-dark);">Vehicle Standards</h3>
                    <div style="display: grid; gap: 1.5rem;">
                        <div style="display: flex; gap: 1rem;">
                            <div style="font-size: 1.8rem;">❄️</div>
                            <div>
                                <h4 style="font-size: 1rem; font-weight: 700; margin-bottom: 0.2rem;">Premium Air Conditioning</h4>
                                <p style="font-size: 0.85rem; color: var(--gray-400);">All vehicles are high-performance AC units for maximum comfort.</p>
                            </div>
                        </div>
                        <div style="display: flex; gap: 1rem;">
                            <div style="font-size: 1.8rem;">🧹</div>
                            <div>
                                <h4 style="font-size: 1rem; font-weight: 700; margin-bottom: 0.2rem;">Spotless Cleanliness</h4>
                                <p style="font-size: 0.85rem; color: var(--gray-400);">Vehicles are thoroughly cleaned and disinfected before every trip.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <?php echo $contentBlocks->renderSeoBlog('route-guides', $dropCity); ?>

        <!-- Why Choose Section -->
        <section class="trust" id="route-why-us" style="padding: 2.75rem 0; background: var(--blue-dark); color: var(--white); position: relative; overflow: hidden;">
            <div class="container" style="position: relative; z-index: 2;">
                <div style="text-align: center; max-width: 800px; margin: 0 auto 2rem;">
                    <p class="eyebrow" style="color: var(--accent);">Why Choose Us</p>
                    <h2 style="color: var(--white); font-size: 2.5rem;">Premium Taxi Service from <?php echo $pickupCity['city']; ?></h2>
                </div>
                
                <div class="trust__grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 2rem;">
                    <div class="trust-card" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 1.65rem; border-radius: 20px; text-align: left; transition: 0.3s;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                        <div style="font-size: 2.8rem; margin-bottom: 1rem;">💎</div>
                        <h3 style="color: var(--white); font-size: 1.4rem; font-weight: 700;">No Return Fare</h3>
                        <p style="color: rgba(255,255,255,0.7); line-height: 1.6; font-size: 0.95rem;">Our one-way drop taxi service means you only pay for the distance you travel. Save up to 50% compared to local vendors who charge for return trips.</p>
                    </div>
                    <div class="trust-card" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 1.65rem; border-radius: 20px; text-align: left; transition: 0.3s;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                        <div style="font-size: 2.8rem; margin-bottom: 1rem;">👨‍✈️</div>
                        <h3 style="color: var(--white); font-size: 1.4rem; font-weight: 700;">Verified Drivers</h3>
                        <p style="color: rgba(255,255,255,0.7); line-height: 1.6; font-size: 0.95rem;">Every driver undergoes background checks and is trained specifically for long-distance highway travel and night driving safety.</p>
                    </div>
                    <div class="trust-card" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 1.65rem; border-radius: 20px; text-align: left; transition: 0.3s;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                        <div style="font-size: 2.8rem; margin-bottom: 1rem;">⚡</div>
                        <h3 style="color: var(--white); font-size: 1.4rem; font-weight: 700;">Instant Confirmation</h3>
                        <p style="color: rgba(255,255,255,0.7); line-height: 1.6; font-size: 0.95rem;">Don't wait for hours. Get your booking confirmed instantly via WhatsApp with driver details and vehicle information dispatched promptly.</p>
                    </div>
                </div>
            </div>
            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: radial-gradient(circle at top right, rgba(43, 196, 255, 0.05) 0%, transparent 40%);"></div>
        </section>

        <!-- Internal Links Section -->
        <?php if (!empty($popularFrom)): ?>
        <section class="routes-section" id="popular-routes" style="padding: 2.5rem 0; background: var(--white);">
            <div class="container">
                <div style="text-align: center; margin-bottom: 4rem;">
                    <p class="eyebrow">Connectivity</p>
                    <h2 style="font-size: 2.2rem; margin-bottom: 1rem;">Popular Routes from <?php echo htmlspecialchars($pickupCity['city'], ENT_QUOTES, 'UTF-8'); ?></h2>
                    <p style="color: var(--gray-400);">Explore other popular intercity destinations from <?php echo htmlspecialchars($pickupCity['city'], ENT_QUOTES, 'UTF-8'); ?></p>
                </div>
                <div class="routes-grid">
                    <?php foreach ($popularFrom as $target):
                        $sugSlug = $target['slug'] ?? '';
                        if ($sugSlug === '') {
                            continue;
                        }
                        $sugRi = $seo->getRouteInfo($pickupSlug, $sugSlug, false);
                        $sugDistKm = (float) ($sugRi['distanceKm'] ?? 0);
                        $sugTimingStr = dropcars_calculate_highway_timing($sugDistKm);
                        $sugDest = $target['city'] ?? $sugSlug;
                        ?>
                    <a href="<?php echo htmlspecialchars(dropcars_theme_page_url($routeThemeSlug, $pickupSlug, $sugSlug), ENT_QUOTES, 'UTF-8'); ?>" class="highway-signboard route-card--highway">
                        <div class="highway-signboard-shine"></div>
                        <div class="highway-signboard__header">
                            <span class="highway-badge">ONE-WAY CAB</span>
                            <span class="highway-signboard__code">EXPRESS ROUTE</span>
                        </div>
                        <div class="highway-signboard__route">
                            <span><?php echo htmlspecialchars($pickupCity['city'], ENT_QUOTES, 'UTF-8'); ?></span>
                            <span class="highway-signboard__route-arrow">➔</span>
                            <span><?php echo htmlspecialchars($sugDest, ENT_QUOTES, 'UTF-8'); ?></span>
                        </div>
                        <div class="highway-signboard__metrics">
                            <div class="highway-metric highway-metric--kms">
                                <span class="highway-metric__icon">🛣️</span>
                                <span><?php echo (int) round($sugDistKm); ?> KMS</span>
                            </div>
                            <div class="highway-metric highway-metric--timing">
                                <span class="highway-metric__icon">⏱️</span>
                                <span><?php echo htmlspecialchars($sugTimingStr, ENT_QUOTES, 'UTF-8'); ?></span>
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

        <!-- Route Reviews Testimonials Section -->
        <?php if (!empty($routeReviews)): ?>
        <section class="testimonials-section testimonials-section--route" id="reviews" style="padding: 4rem 0; background: var(--white); border-top: 1px solid var(--gray-100); border-bottom: 1px solid var(--gray-100);">
            <div class="container">
                <div style="text-align: center; margin-bottom: 3rem;">
                    <p class="eyebrow" style="color: var(--blue); font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; font-size: 0.85rem; margin-bottom: 0.5rem;">Passenger Feedback</p>
                    <h2 style="font-size: clamp(1.8rem, 4vw, 2.3rem); font-weight: 800; margin-bottom: 0.5rem; color: var(--blue-dark);">Reviews for <?php echo htmlspecialchars($pickupCity['city']); ?> to <?php echo htmlspecialchars($dropCity['city']); ?></h2>
                    <p style="color: var(--gray-400); font-size: 1rem; max-width: 32rem; margin: 0 auto; line-height: 1.5;">Hear from our passengers who recently traveled this route with Drop Cars.</p>
                </div>

                <div class="testimonials-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 2rem;">
                    <?php
                    foreach ($routeReviews as $r):
                        $stars = str_repeat('⭐', (int)($r['rating'] ?? 5));
                        $trip = $r['trip_route'] ?? ($pickupCity['city'] . ' to ' . $dropCity['city']);
                    ?>
                    <div class="testimonial-card" style="background: var(--gray-50); padding: 1.75rem; border-radius: 20px; border: 1px solid var(--gray-200); display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.02); transition: transform 0.3s ease, box-shadow 0.3s ease;" onmouseover="this.style.transform='translateY(-4px)';this.style.boxShadow='0 12px 20px rgba(0,0,0,0.06)';" onmouseout="this.style.transform='none';this.style.boxShadow='0 4px 6px rgba(0,0,0,0.02)';">
                        <div>
                            <div class="testimonial-rating" style="margin-bottom: 0.85rem; font-size: 0.9rem;"><?= $stars ?></div>
                            <p class="testimonial-text" style="font-style: italic; line-height: 1.6; color: var(--text); font-size: 0.95rem; margin-bottom: 1.5rem; opacity: 0.95;">"<?= htmlspecialchars($r['comment'] ?? '') ?>"</p>
                        </div>
                        <div class="testimonial-meta" style="border-top: 1px solid var(--gray-200); padding-top: 1rem; margin-top: auto; display: flex; flex-direction: column; gap: 0.5rem; align-items: flex-start;">
                            <div class="testimonial-user">
                                <strong style="display: block; font-size: 0.95rem; color: var(--blue-dark); font-weight: 700;"><?= htmlspecialchars($r['customer_name'] ?? '') ?></strong>
                                <small style="font-size: 0.75rem; color: var(--gray-400); font-weight: 500;"><?= !empty($r['is_verified']) ? 'Verified Customer' : 'Customer' ?></small>
                            </div>
                            <span class="testimonial-trip" style="display: inline-flex; align-items: center; font-size: 0.75rem; font-weight: 700; color: var(--blue); background: #e0f2fe; padding: 0.25rem 0.7rem; border-radius: 99px; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis;"><?= htmlspecialchars($trip) ?></span>
                        </div>
                    </div>
                    <?php endforeach; ?>
                </div>
            </div>
        </section>
        <?php endif; ?>

        <!-- FAQ Section -->
        <section class="faq" id="faq" style="background: var(--gray-100); padding: 2.25rem 0;">
            <div class="container">
                <center>
                    <p class="eyebrow">Expert Help</p>
                    <h2 style="margin-bottom: 3rem;">Travel FAQs: <?php echo $pickupCity['city']; ?> to <?php echo $dropCity['city']; ?></h2>
                </center>
                <div class="faq__items" style="max-width: 900px; margin: 0 auto; display: grid; gap: 1rem;">
                    <?php
                    // Display custom FAQs if available
                    if ($hasCustomFaqs) {
                        foreach ($customRouteSeo['faqs'] as $customFaq):
                    ?>
                    <details class="faq__item">
                        <summary class="faq__summary"><?php echo htmlspecialchars($customFaq['question'], ENT_QUOTES, 'UTF-8'); ?></summary>
                        <p><?php echo htmlspecialchars($customFaq['answer'], ENT_QUOTES, 'UTF-8'); ?></p>
                    </details>
                    <?php
                        endforeach;
                    }
                    ?>
                    <details class="faq__item" open>
                        <summary class="faq__summary">How much is the taxi fare from <?php echo $pickupCity['city']; ?> to <?php echo $dropCity['city']; ?>?</summary>
                        <p>The estimated fare starts from <strong>₹<?php echo number_format($route['fareEstimate']); ?></strong> for a one-way Sedan booking. This is calculated based on a distance of ~<?php echo $distance; ?> km at ₹14 per km. SUV fares start higher.</p>
                    </details>
                    <details class="faq__item">
                        <summary class="faq__summary">What is the distance between <?php echo $pickupCity['city']; ?> and <?php echo $dropCity['city']; ?>?</summary>
                        <p>The road distance is approximately <strong><?php echo $distance; ?> km</strong> via the main highways. The travel time is typically around <strong><?php echo $time; ?></strong>.</p>
                    </details>
                    <details class="faq__item">
                        <summary class="faq__summary">How long does it take by taxi?</summary>
                        <p>The journey usually takes about <strong><?php echo $time; ?></strong>, though this can vary depending on traffic conditions and road work on the national highway.</p>
                    </details>
                    <details class="faq__item">
                        <summary class="faq__summary">Is one way taxi available to <?php echo $dropCity['city']; ?>?</summary>
                        <p>Yes, Drop Cars specializes in one-way intercity drops. You only pay for your journey from <?php echo $pickupCity['city']; ?> to <?php echo $dropCity['city']; ?>, not for the return trip.</p>
                    </details>
                    <details class="faq__item">
                        <summary class="faq__summary">Are tolls, driver bata, and state permits included in the fare?</summary>
                        <p>Base per-km fares exclude tolls and state permits, which are charged at actuals. You can also toggle the 'Toll Included' option on our fare estimator to see a flat all-inclusive estimate with zero surprise charges.</p>
                    </details>
                    <details class="faq__item">
                        <summary class="faq__summary">What vehicle options can I book for <?php echo $pickupCity['city']; ?> to <?php echo $dropCity['city']; ?>?</summary>
                        <p>We provide clean, sanitized AC Sedans (Dzire/Etios for up to 4 passengers), AC SUVs (Ertiga for up to 6 passengers), and premium carriers like Innova Crysta. All vehicles are GPS-monitored with verified chauffeurs.</p>
                    </details>
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
    <script>window.DROP_ROUTE_DISTANCE_KM=<?php echo json_encode(round((float)$distance, 1)); ?>;</script>
    <?php echo $shell->renderScripts(); ?>
    <script defer src="<?php echo htmlspecialchars(dropcars_url('assets/js/page-section-url.js'), ENT_QUOTES, 'UTF-8'); ?>"></script>
    <script>
    document.addEventListener('DOMContentLoaded', function() {
        const toggle = document.getElementById('fare-summary-toggle');
        const amountEl = document.getElementById('route-summary-amount');
        const disclaimerEl = document.getElementById('route-summary-disclaimer');
        const breakdownEl = document.getElementById('fare-breakdown');
        
        const baseFare = <?php echo $baseFare; ?>;
        const inclusiveFare = <?php echo $inclusiveFare; ?>;
        
        function updateDisplay() {
            const promoInp = document.getElementById('promo-code-est') || document.getElementById('promo-code');
            const discount = (promoInp && promoInp.value.trim().toUpperCase() === 'DCFT100') ? 100 : 0;
            const currentBase = baseFare - discount;
            const currentInclusive = inclusiveFare - discount;
            
            if (toggle && toggle.checked) {
                amountEl.innerHTML = (discount > 0 ? '<span style="text-decoration: line-through; opacity: 0.6; font-size: 0.6em; margin-right: 12px;">₹' + inclusiveFare.toLocaleString('en-IN') + '</span>' : '') + '₹' + currentInclusive.toLocaleString('en-IN') + '*';
                disclaimerEl.innerHTML = '*Estimated fare for Sedan one-way trip. <strong style="color: var(--accent);">Tolls and Taxes are Included</strong>.';
                disclaimerEl.style.color = '#fff';
                if (breakdownEl) breakdownEl.style.display = 'block';
            } else {
                amountEl.innerHTML = (discount > 0 ? '<span style="text-decoration: line-through; opacity: 0.6; font-size: 0.6em; margin-right: 12px;">₹' + baseFare.toLocaleString('en-IN') + '</span>' : '') + '₹' + currentBase.toLocaleString('en-IN') + '*';
                disclaimerEl.textContent = '*Estimated fare for Sedan one-way trip. Tolls, parking, and state permit taxes are extra as per actuals.';
                disclaimerEl.style.color = 'rgba(255,255,255,0.6)';
                if (breakdownEl) breakdownEl.style.display = 'none';
            }
        }

        if (toggle && amountEl && disclaimerEl) {
            toggle.addEventListener('change', updateDisplay);
            const promoInp = document.getElementById('promo-code-est');
            if (promoInp) promoInp.addEventListener('input', updateDisplay);
            const promoHeroInp = document.getElementById('promo-code');
            if (promoHeroInp) promoHeroInp.addEventListener('input', updateDisplay);
            const promoApplyEst = document.getElementById('promo-apply-btn-est');
            if (promoApplyEst) promoApplyEst.addEventListener('click', updateDisplay);
        }
    });
    </script>
<script defer src="/assets/js/contact-step-reveal.js?v=<?php echo @filemtime(__DIR__.'/../assets/js/contact-step-reveal.js'); ?>"></script>
</body>
</html>

