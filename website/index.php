<!-- SEO-Optimized-v2.0 -->
<?php
require_once __DIR__ . '/includes/paths.php';
$subdomainCity  = dropcars_get_subdomain_city_slug();
$subdomainTheme = function_exists('dropcars_get_subdomain_theme_slug') ? dropcars_get_subdomain_theme_slug() : null;

$city = $_GET['city'] ?? $subdomainCity;
if ($city !== null) {
    $_GET['city'] = $city;
}
if ($subdomainTheme !== null && empty($_GET['theme'])) {
    $_GET['theme'] = $subdomainTheme;
}

$reqPath = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '/';
$reqPath = urldecode($reqPath);
$reqPath = trim($reqPath, '/');

// City subdomains (chennai.dropcars.in, etc.) serve the exact same content as
// dropcars.in/{city} - duplicate content across two URLs. Canonicalize: ANY
// request on a city subdomain permanently redirects to the root-domain city
// hub page, regardless of subpath (these subdomains never had distinct
// per-path content of their own - it's always been the same city page under
// a different host). Absolute URL + explicit host so this actually leaves
// the subdomain, not a same-host relative redirect that silently stays on it.
if ($subdomainCity !== null) {
    $q = $_SERVER['QUERY_STRING'] ?? '';
    header('Location: https://dropcars.in/' . $subdomainCity . ($q ? '?' . $q : ''), true, 301);
    exit;
}

// If landing on droptaxi.dropcars.in/drop-taxi or droptaxi.dropcars.in/drop-taxi/booknow, strip redundant theme prefix
if ($subdomainTheme !== null && $reqPath !== '') {
    $rawSub = strtolower(explode('.', $_SERVER['HTTP_HOST'] ?? '')[0]);
    $themePrefixes = array_unique([$subdomainTheme, str_replace('-', '', $subdomainTheme), $rawSub]);
    foreach ($themePrefixes as $tp) {
        if ($reqPath === $tp || $reqPath === $tp . '/index.php') {
            $q = $_SERVER['QUERY_STRING'] ?? '';
            header('Location: /' . ($q ? '?' . $q : ''), true, 301);
            exit;
        }
        if (strpos($reqPath, $tp . '/') === 0) {
            $cleanPath = substr($reqPath, strlen($tp) + 1);
            $q = $_SERVER['QUERY_STRING'] ?? '';
            header('Location: /' . ltrim($cleanPath, '/') . ($q ? '?' . $q : ''), true, 301);
            exit;
        }
    }
}

// Normalize URL path if loaded via the subdirectory stub folders
if (stripos($reqPath, 'City - Website/') === 0 || stripos($reqPath, 'City-Website/') === 0) {
    $parts = explode('/', $reqPath);
    if (count($parts) >= 2) {
        array_shift($parts); // remove 'City - Website'
        array_shift($parts); // remove the city folder (e.g., 'Chennai')
    }
    $reqPath = implode('/', $parts);
}

// 1. Physical file check (primarily for subdomains, but harmless for main domain)
if ($reqPath !== '' && $reqPath !== 'index.php') {
    $physicalFile = __DIR__ . '/' . $reqPath;
    if (is_file($physicalFile)) {
        $ext = strtolower(pathinfo($physicalFile, PATHINFO_EXTENSION));
        if ($ext === 'php') {
            require $physicalFile;
            exit;
        }
        
        $mimeTypes = [
            'css'   => 'text/css',
            'js'    => 'application/javascript',
            'png'   => 'image/png',
            'jpg'   => 'image/jpeg',
            'jpeg'  => 'image/jpeg',
            'gif'   => 'image/gif',
            'svg'   => 'image/svg+xml',
            'webp'  => 'image/webp',
            'ico'   => 'image/x-icon',
            'woff'  => 'font/woff',
            'woff2' => 'font/woff2',
            'ttf'   => 'font/ttf',
            'otf'   => 'font/otf',
            'xml'   => 'application/xml',
            'json'  => 'application/json',
            'txt'   => 'text/plain',
            'html'  => 'text/html',
        ];
        $mime = $mimeTypes[$ext] ?? 'application/octet-stream';
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . filesize($physicalFile));
        header('Cache-Control: public, max-age=86400');
        readfile($physicalFile);
        exit;
    }
}

// 2. Handle admin routes
if ($reqPath === 'admin' || strpos($reqPath, 'admin/') === 0) {
    $adminParts = explode('/', $reqPath);
    array_shift($adminParts); // remove 'admin'
    $_GET['page'] = implode('/', $adminParts) ?: 'dashboard';
    require __DIR__ . '/admin/index.php';
    exit;
}

// 3. Handle track booking / thank you page
if (preg_match('/^track-booking\/([a-zA-Z0-9]+)$/', $reqPath, $matches)) {
    $_GET['booking_id'] = $matches[1];
    require __DIR__ . '/pages/track-booking.php';
    exit;
}
if (preg_match('/^thank-you\/([a-zA-Z0-9]+)$/', $reqPath, $matches)) {
    $_GET['booking_id'] = $matches[1];
    require __DIR__ . '/pages/thank-you.php';
    exit;
}

// 4. Handle redirecting legacy routes
if (preg_match('/^routes\/([a-zA-Z0-9-]+)-to-([a-zA-Z0-9-]+)-taxi\.html$/', $reqPath, $matches)) {
    $pickup = $matches[1];
    $drop = $matches[2];
    header('Location: ' . dropcars_url('drop-cars/' . $pickup . '-' . $drop), true, 301);
    exit;
}
if (preg_match('/^([a-zA-Z0-9-]+)-to-([a-zA-Z0-9-]+)-taxi$/', $reqPath, $matches)) {
    $pickup = $matches[1];
    $drop = $matches[2];
    header('Location: ' . dropcars_url('drop-cars/' . $pickup . '-' . $drop), true, 301);
    exit;
}

// 5. Handle other root-level pretty URLs (special routes)
$specialRoutes = [
    'tariff'                     => 'engine/tariff.php',
    'sitemap.xml'                => 'engine/sitemap.php',
    'dashboard'                  => 'pages/customer-dashboard.php',
    'customer-login'             => 'pages/customer-login.php',
    'developer'                  => 'pages/developer.php',
    'reviews'                    => 'pages/reviews.php',
    'review-login'               => 'pages/review-login.php',
    'logout'                     => 'pages/logout.php',
    'contact'                    => 'pages/contact.php',
    'contact.php'                => 'pages/contact.php',
    'pages/contact.php'          => 'pages/contact.php',
    'pages/contact.html'         => 'pages/contact.php',
    'privacy'                    => 'pages/privacy.php',
    'privacy.php'                => 'pages/privacy.php',
    'pages/privacy.php'          => 'pages/privacy.php',
    'pages/privacy.html'         => 'pages/privacy.php',
    'terms'                      => 'pages/terms.php',
    'terms.php'                  => 'pages/terms.php',
    'pages/terms.php'            => 'pages/terms.php',
    'pages/terms.html'           => 'pages/terms.php',
    'payment-policy'             => 'pages/payment-policy.php',
    'payment-policy.php'         => 'pages/payment-policy.php',
    'pages/payment-policy.php'   => 'pages/payment-policy.php',
    'pages/payment-policy.html'  => 'pages/payment-policy.php',
    'refund-policy'              => 'pages/refund-policy.php',
    'refund-policy.php'          => 'pages/refund-policy.php',
    'pages/refund-policy.php'    => 'pages/refund-policy.php',
    'pages/refund-policy.html'   => 'pages/refund-policy.php',
    'about'                      => 'pages/about-us.php',
    'about-us'                   => 'pages/about-us.php',
    'about-us.php'               => 'pages/about-us.php',
    'pages/about-us.php'         => 'pages/about-us.php',
    'pages/about-us.html'        => 'pages/about-us.php',
    'services'                   => 'pages/services.php',
    'our-services'               => 'pages/services.php',
    'services.php'               => 'pages/services.php',
    'pages/services.php'         => 'pages/services.php',
    'pages/services.html'        => 'pages/services.php',
    'airport-transfer'           => 'pages/airport-transfer.php',
    'airport-taxi'               => 'pages/airport-transfer.php',
    'airport-cab'                => 'pages/airport-transfer.php',
    'pages/airport-transfer.php' => 'pages/airport-transfer.php',
    'driver-partner'             => 'pages/driver-partner.php',
    'driver-partner.php'         => 'pages/driver-partner.php',
    'driver-partner.html'        => 'pages/driver-partner.php',
    'pages/driver-partner.php'   => 'pages/driver-partner.php',
    'pages/driver-partner.html'  => 'pages/driver-partner.php',
    'vendor-partner'             => 'pages/vendor-partner.php',
    'vendor-partner.php'         => 'pages/vendor-partner.php',
    'vendor-partner.html'        => 'pages/vendor-partner.php',
    'pages/vendor-partner.php'   => 'pages/vendor-partner.php',
    'pages/vendor-partner.html'  => 'pages/vendor-partner.php',
    'fleet-partner'              => 'pages/fleet-partner.php',
    'fleet-partner.php'          => 'pages/fleet-partner.php',
    'fleet-partner.html'         => 'pages/fleet-partner.php',
    'pages/fleet-partner.php'    => 'pages/fleet-partner.php',
    'pages/fleet-partner.html'   => 'pages/fleet-partner.php',
    'driver-agreement'           => 'pages/driver-agreement.php',
    'driver-agreement.php'       => 'pages/driver-agreement.php',
    'driver-agreement.html'      => 'pages/driver-agreement.php',
    'pages/driver-agreement.php' => 'pages/driver-agreement.php',
    'pages/driver-agreement.html'=> 'pages/driver-agreement.php',
    'vendor-agreement'           => 'pages/vendor-agreement.php',
    'vendor-agreement.php'       => 'pages/vendor-agreement.php',
    'vendor-agreement.html'      => 'pages/vendor-agreement.php',
    'pages/vendor-agreement.php' => 'pages/vendor-agreement.php',
    'pages/vendor-agreement.html'=> 'pages/vendor-agreement.php',
    'trust-safety'               => 'pages/trust-safety.php',
    'trust-safety.php'           => 'pages/trust-safety.php',
    'pages/trust-safety.php'    => 'pages/trust-safety.php',
    'driver-trip'                => 'pages/driver-trip.php',
    'driver-trip.php'            => 'pages/driver-trip.php',
    'pages/driver-trip.php'      => 'pages/driver-trip.php',
    'cities'                     => 'engine/cities.php',
    'routes'                     => 'engine/cities.php',
    'all-routes'                 => 'engine/cities.php',
];
if (isset($specialRoutes[$reqPath])) {
    require __DIR__ . '/' . $specialRoutes[$reqPath];
    exit;
}

// 6. Dynamic City / Route / Theme Routing (Common to Subdomain and Main Domain)
$section = '';
$theme = '';
$pathParts = $reqPath !== '' ? explode('/', $reqPath) : [];

if (count($pathParts) > 0 && $pathParts[0] !== '') {
    $lastPart = end($pathParts);
    require_once __DIR__ . '/engine/theme-seo.php';
    if (dropcars_city_section_is_valid_slug($lastPart)) {
        $section = $lastPart;
    }
    
    $firstPart = $pathParts[0];
    $themesPath = __DIR__ . '/data/themes.json';
    $themesData = is_file($themesPath) ? json_decode(file_get_contents($themesPath), true) : [];
    $themes = ['drop-cars', 'drop-taxi', 'one-way-taxi', 'outstation-taxi', 'intercity-taxi', 'intercity-cabs', 'one-way-cab', 'drop-taxi-service', 'drop-car-service', 'one-drop-taxi', 'one-drop-cab', 'city-to-city-taxi', 'city-to-city-cabs', 'intercity-drop-taxi', 'outstation-cab', 'outstation-cabs', 'outstation-drop-taxi'];
    if (is_array($themesData)) {
        foreach ($themesData as $t) {
            if (isset($t['slug'])) $themes[] = $t['slug'];
            if (isset($t['id'])) $themes[] = $t['id'];
        }
    }
    $themes = array_unique($themes);
    if (in_array($firstPart, $themes, true)) {
        $theme = $firstPart;
        // Bare theme homepage (/drop-taxi) and theme+keyword-section pages
        // (/drop-taxi/booknow etc, routed here by .htaccess without a query
        // string) fall through every branch below with no other exit and
        // land on the default homepage render at the bottom of this file -
        // setting $_GET['theme'] here lets ThemeEngine::detectTheme()'s
        // query-based branch pick up the right theme for that fallthrough
        // render instead of silently defaulting to "drop-cars".
        $_GET['theme'] = $theme;
    }

    // Check for cities page routing: [theme]/cities
    if ($theme !== '' && end($pathParts) === 'cities') {
        $_GET['theme'] = $theme;
        require __DIR__ . '/engine/cities.php';
        exit;
    }

    // Load cities for verification
    $dcCitiesPath = __DIR__ . '/data/cities.json';
    $dcCitySlugs = [];
    if (is_file($dcCitiesPath)) {
        $dcCitiesData = json_decode(file_get_contents($dcCitiesPath), true);
        if (is_array($dcCitiesData)) {
            foreach ($dcCitiesData as $c) {
                if (isset($c['slug']) && $c['slug'] !== '') $dcCitySlugs[] = $c['slug'];
            }
        }
    }

    // Drop Cars native theme: /city1/city2[/section] — root-level route page
    // Cities not yet in cities.json still render (SEOCore synthesizes the
    // display name and computes distance dynamically), as long as the slug
    // isn't a reserved path segment (admin, assets, faq, etc.).
    if ($theme === '' && count($pathParts) >= 2) {
        $seg0 = $pathParts[0];
        $seg1 = $pathParts[1];
        $seg0IsCity = dropcars_is_routable_city_slug($seg0, $dcCitySlugs);
        $seg1IsCity = dropcars_is_routable_city_slug($seg1, $dcCitySlugs);
        if ($seg0IsCity && $seg1IsCity) {
            $_GET['theme']  = 'drop-cars';
            $_GET['pickup'] = $seg0;
            $_GET['drop']   = $seg1;
            if (count($pathParts) === 3) {
                $_GET['section'] = $pathParts[2];
            }
            require __DIR__ . '/engine/route.php';
            exit;
        }
        // /city[/section] — root-level city hub for drop-cars
        if ($seg0IsCity && !$seg1IsCity) {
            require_once __DIR__ . '/engine/theme-seo.php';
            if (dropcars_city_section_is_valid_slug($seg1)) {
                $_GET['theme']   = 'drop-cars';
                $_GET['city']    = $seg0;
                $_GET['section'] = $seg1;
                require __DIR__ . '/engine/city.php';
                exit;
            }
        }
    }

    // Check if the path is a route page for other themes (e.g., [theme]/pickup-to-drop)
    if ($theme !== '' && (count($pathParts) === 2 || count($pathParts) === 3)) {
        require_once __DIR__ . '/includes/theme-path-resolve.php';
        $secondPart = $pathParts[1];
        $resolved = dropcars_resolve_theme_second_segment($theme, $secondPart, $themes, $dcCitySlugs);
        // /{theme}/{city} (e.g. /drop-taxi/chennai) was previously unhandled
        // here - only the 'route' branch below existed, so a city match fell
        // through every remaining guard (all gated on $theme === '') and
        // rendered the default drop-cars homepage instead of the theme's
        // city page. Mirrors the 'city' handling engine/theme-path.php
        // already does for the same second-segment resolution.
        if ($resolved !== null && $resolved['type'] === 'city') {
            $_GET['theme'] = $theme;
            $_GET['city'] = $resolved['city'];
            if (count($pathParts) === 3 && dropcars_city_section_is_valid_slug($pathParts[2])) {
                $_GET['section'] = $pathParts[2];
            }
            require_once __DIR__ . '/engine/city.php';
            exit;
        }
        if ($resolved !== null && $resolved['type'] === 'route') {
            $_GET['theme'] = $theme;
            $_GET['pickup'] = $resolved['pickup'];
            $_GET['drop'] = $resolved['drop'];
            if (count($pathParts) === 3) {
                $_GET['section'] = $pathParts[2];
            }
            require_once __DIR__ . '/engine/route.php';
            exit;
        }
    }

    // Single-segment /city root-level city hub for drop-cars on main domain (e.g., /chennai)
    if ($theme === '' && count($pathParts) === 1 && in_array($pathParts[0], $dcCitySlugs, true)) {
        $_GET['theme'] = 'drop-cars';
        $_GET['city']  = $pathParts[0];
        require __DIR__ . '/engine/city.php';
        exit;
    }

    // Single-segment hyphenated route page for drop-cars on main domain (e.g. /chennai-chittoor or /chennai-to-chittoor)
    if ($theme === '' && count($pathParts) === 1 && !in_array(strtolower($pathParts[0]), dropcars_indian_state_ut_slugs(), true)) {
        $candidateSlug = $pathParts[0];
        $cleanSlug = str_replace('-to-', '-', $candidateSlug);
        $slugSegments = explode('-', $cleanSlug);
        if (count($slugSegments) >= 2) {
            for ($i = count($slugSegments) - 1; $i >= 1; $i--) {
                $candPickup = implode('-', array_slice($slugSegments, 0, $i));
                $candDrop   = implode('-', array_slice($slugSegments, $i));
                if ($candPickup !== '' && $candDrop !== '' && $candPickup !== $candDrop) {
                    if (dropcars_is_routable_city_slug($candPickup, $dcCitySlugs) && dropcars_is_routable_city_slug($candDrop, $dcCitySlugs)) {
                        $_GET['theme']  = 'drop-cars';
                        $_GET['pickup'] = $candPickup;
                        $_GET['drop']   = $candDrop;
                        require __DIR__ . '/engine/route.php';
                        exit;
                    }
                }
            }
        }
    }
}

// 7. Subdomain routing fallback
if ($city !== null) {
    if ($theme !== '') {
        $_GET['theme'] = $theme;
    }
    if ($section !== '') {
        $_GET['section'] = $section;
    }
    require_once __DIR__ . '/engine/city.php';
    exit;
}

if (!defined('DROP_CARS_DB_OPTIONAL')) {
    define('DROP_CARS_DB_OPTIONAL', true);
}
require_once __DIR__ . '/admin/config/database.php';
if ((!isset($pdo) || !$pdo instanceof PDO) && !empty($GLOBALS['db']) && $GLOBALS['db'] instanceof PDO) {
    $pdo = $GLOBALS['db'];
}
$activeBanner = null;
$loggedInCustomer = null;
if (isset($pdo) && $pdo instanceof PDO) {
    try {
        $bannerStmt = $pdo->query("SELECT * FROM `banners` WHERE `is_active` = 1 ORDER BY `created_at` DESC LIMIT 1");
        if ($bannerStmt) {
            $activeBanner = $bannerStmt->fetch(PDO::FETCH_ASSOC) ?: null;
        }
    } catch (Throwable $e) {}
    
    // Look up by phone session first, fall back to email session (covers OTP + Google login)
    if (!empty($_SESSION['customer_phone'])) {
        try {
            $stmt = $pdo->prepare("SELECT * FROM `customers` WHERE `phone` = ? LIMIT 1");
            $stmt->execute([$_SESSION['customer_phone']]);
            $loggedInCustomer = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
        } catch (Throwable $e) {}
    }
    if (!$loggedInCustomer && !empty($_SESSION['customer_email'])) {
        try {
            $stmt = $pdo->prepare("SELECT * FROM `customers` WHERE `email` = ? LIMIT 1");
            $stmt->execute([$_SESSION['customer_email']]);
            $loggedInCustomer = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
        } catch (Throwable $e) {}
    }
}

// Enforce login for invite/referral links
if (!$loggedInCustomer && !empty($_GET['coupon'])) {
    $_SESSION['pending_referral'] = strtoupper(trim($_GET['coupon']));
    header("Location: " . dropcars_url('pages/customer-login.php?promo=1'));
    exit;
}

$custNationalPhone = '';
$custCountryCode = '+91';
if ($loggedInCustomer && !empty($loggedInCustomer['phone'])) {
    $phoneParts = explode(' ', trim($loggedInCustomer['phone']));
    if (count($phoneParts) >= 2) {
        $custCountryCode = $phoneParts[0];
        $custNationalPhone = implode('', array_slice($phoneParts, 1));
    } else {
        $custNationalPhone = $loggedInCustomer['phone'];
    }
}

require_once __DIR__ . '/includes/paths.php';
require_once __DIR__ . '/includes/check-blocked-main.php';
require_once __DIR__ . '/includes/reviews.php';
require_once __DIR__ . '/engine/theme-engine.php';
require_once __DIR__ . '/engine/shell.php';
require_once __DIR__ . '/engine/content-blocks.php';
require_once __DIR__ . '/engine/theme-seo.php';

$themeEngine = new ThemeEngine();
$activeTheme = dropcars_merge_theme_seo($themeEngine->detectTheme());

$allThemes = $themeEngine->getAllThemes();
$homeSectionSlug = $themeEngine->getHomeSectionSlug();
$homeScrollToId = ($homeSectionSlug !== null && $homeSectionSlug !== '') ? dropcars_home_section_element_id($homeSectionSlug) : null;

$shell = new UIShell($activeTheme, $allThemes);

// AirportTaxi.International runs a genuinely different trip-type set (Airport
// Transfer Local/Outstation + Rental Package) and tariff model from every
// other theme above, which all share this file's one-way/round-trip/hourly
// booking form. Hand off to its own controller instead of rendering the
// generic Drop Cars homepage. Guarded by theme id, so this can never fire
// for any existing theme/domain — see data/themes.json ("airporttaxi") and
// full-functional-parity-plan.md in the "Airport Taxi - Website" folder.
// $shell/$allThemes are constructed above so airporttaxi-home.php can reuse
// the same header/footer chrome as every other theme.
if (($activeTheme['id'] ?? '') === 'airporttaxi') {
    require __DIR__ . '/engine/airporttaxi-home.php';
    return;
}
$contentBlocks = new ContentBlocks($activeTheme);
$cities = JSON_decode(file_get_contents(__DIR__ . '/data/cities.json'), true);
usort($cities, function ($a, $b) {
    return strcmp(($a['city'] ?? ''), ($b['city'] ?? ''));
});
$importantSlugs = ['chennai', 'tiruvannamalai', 'vellore', 'bangalore', 'pondicherry', 'trichy', 'madurai', 'tirupati', 'coimbatore', 'salem', 'ooty', 'trivandrum', 'kochi', 'mysore'];
$cityBySlug = [];

$configPath = __DIR__ . '/data/config.json';
$configData = is_file($configPath) ? json_decode(file_get_contents($configPath), true) : [];
$fares = $configData['fares'] ?? [];

// Dynamic support phone logic
$companyRawPhone = $configData['company']['phone'] ?? '7200217986';
$companyPhoneDigits = preg_replace('/\D/', '', $companyRawPhone);
if (strlen($companyPhoneDigits) === 10) {
    $companyPhoneDisplay = '+91 ' . $companyPhoneDigits;
    $companyPhoneTel = '+91' . $companyPhoneDigits;
} else {
    $companyPhoneDisplay = '+' . $companyPhoneDigits;
    $companyPhoneTel = '+' . $companyPhoneDigits;
}
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
foreach ($cities as $c) {
    $cityBySlug[$c['slug'] ?? ''] = $c;
}
$importantCities = [];
foreach ($importantSlugs as $slug) {
    if (isset($cityBySlug[$slug])) {
        $importantCities[] = $cityBySlug[$slug];
    }
}

// Metadata — driven by the active theme for per-page SEO uniqueness
$siteTitle      = 'Drop Cars';
$pageMetaTitle  = $themeEngine->getWording('metaTitle', 'One-Way Drop Taxi & Outstation Cab Service');
$pageMetaDesc   = $themeEngine->getWording('metaDesc',  'Book a One-Way Drop Taxi or Outstation Cab Service with Fixed Per-KM Rates and Zero Return Fares. Verified drivers & instant 24/7 booking confirmation across Tamil Nadu & Karnataka.');
$pageH1         = $themeEngine->getWording('heroTitle',  'Trusted Drop Taxi & Outstation Cab Service');
$pageHeroSub    = $themeEngine->getWording('heroSub',    'Professional intercity cab service for one-way drops & outstation travel across Tamil Nadu, Pondicherry, Karnataka & Andhra Pradesh.');
$path           = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$canonical      = 'https://dropcars.in' . ($path !== '/' ? rtrim($path, '/') : '');

?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="<?php echo htmlspecialchars($pageMetaDesc); ?>">
    <link rel="canonical" href="<?php echo $canonical; ?>">
    <title><?php echo htmlspecialchars($pageMetaTitle); ?></title>

    <!-- Open Graph -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="<?php echo $canonical; ?>">
    <meta property="og:title" content="<?php echo htmlspecialchars($pageMetaTitle); ?>">
    <meta property="og:description" content="<?php echo htmlspecialchars($pageMetaDesc); ?>">
    <meta property="og:image" content="https://dropcars.in/assets/img/og-cover.jpg">
    <meta property="og:site_name" content="Drop Cars">
    <meta property="og:locale" content="en_IN">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="<?php echo htmlspecialchars($pageMetaTitle); ?>">
    <meta name="twitter:description" content="<?php echo htmlspecialchars($pageMetaDesc); ?>">
    <meta name="twitter:image" content="https://dropcars.in/assets/img/og-cover.jpg">

    <!-- Extra SEO signals -->
    <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
    <meta name="geo.region" content="IN-TN">
    <meta name="geo.placename" content="Tamil Nadu, South India">
    <meta name="author" content="Drop Cars">
    <meta name="theme-color" content="#0b2d6e">
    
<?php dropcars_render_favicons($activeTheme['slug'] ?? null); ?>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    
    <link rel="stylesheet" href="/assets/css/base.css?v=<?php echo @filemtime(__DIR__.'/assets/css/base.css'); ?>">
    <link rel="stylesheet" href="/assets/css/layout.css?v=<?php echo @filemtime(__DIR__.'/assets/css/layout.css'); ?>">
    <link rel="stylesheet" href="/assets/css/seo-content.css?v=<?php echo @filemtime(__DIR__.'/assets/css/seo-content.css'); ?>">
    <link rel="stylesheet" href="/assets/css/navbar.css?v=<?php echo @filemtime(__DIR__.'/assets/css/navbar.css'); ?>">
    <link rel="stylesheet" href="/assets/css/hero.css?v=<?php echo @filemtime(__DIR__.'/assets/css/hero.css'); ?>">
    <link rel="stylesheet" href="/assets/css/booking-form.css?v=<?php echo @filemtime(__DIR__.'/assets/css/booking-form.css'); ?>">
    <link rel="stylesheet" href="/assets/css/city-routes.css?v=<?php echo @filemtime(__DIR__.'/assets/css/city-routes.css'); ?>">
    <link rel="stylesheet" href="/assets/css/premium-sections.css?v=<?php echo @filemtime(__DIR__.'/assets/css/premium-sections.css'); ?>">
    <link rel="stylesheet" href="/assets/css/vehicle-section.css?v=<?php echo @filemtime(__DIR__.'/assets/css/vehicle-section.css'); ?>">
    <link rel="stylesheet" href="/assets/css/theme-switcher.css?v=<?php echo @filemtime(__DIR__.'/assets/css/theme-switcher.css'); ?>">
    <link rel="stylesheet" href="/assets/css/faq.css?v=<?php echo @filemtime(__DIR__.'/assets/css/faq.css'); ?>">
    <link rel="stylesheet" href="/assets/css/footer.css?v=<?php echo @filemtime(__DIR__.'/assets/css/footer.css'); ?>">
    <link rel="stylesheet" href="/assets/css/about-us.css?v=<?php echo @filemtime(__DIR__.'/assets/css/about-us.css'); ?>">
    <link rel="stylesheet" href="/assets/css/trust.css?v=<?php echo @filemtime(__DIR__.'/assets/css/trust.css'); ?>">
    <link rel="stylesheet" href="/assets/css/responsive.css?v=<?php echo @filemtime(__DIR__.'/assets/css/responsive.css'); ?>">
    <link rel="stylesheet" href="/assets/css/whatsapp.css?v=<?php echo @filemtime(__DIR__.'/assets/css/whatsapp.css'); ?>">
    <link rel="stylesheet" href="/assets/css/ai-assistant.css?v=<?php echo @filemtime(__DIR__.'/assets/css/ai-assistant.css'); ?>">
<script>window.activeThemeName = "<?php echo htmlspecialchars($themeEngine->getWording('name', 'Drop Cars')); ?>";</script>
<script>window.DROP_CARS_BASE_PATH = <?php echo json_encode(dropcars_base_path(), JSON_HEX_TAG | JSON_HEX_AMP); ?>;</script>
<?php
$sectionMap = dropcars_home_section_map();
$idToSlug = array_flip($sectionMap);
?>
<script>
window.DROP_CARS_THEME_SLUG = <?php echo json_encode($activeTheme['slug'] ?? 'drop-cars', JSON_HEX_TAG | JSON_HEX_AMP); ?>;
window.DROP_CARS_HOME_SECTION_ID_TO_SLUG = <?php echo json_encode($idToSlug, JSON_UNESCAPED_UNICODE); ?>;
window.DROP_CARS_HOME_SECTION_SLUG_TO_ID = <?php echo json_encode($sectionMap, JSON_UNESCAPED_UNICODE); ?>;
</script>

    <!-- JSON-LD LocalBusiness structured data -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "TaxiService",
      "name": "Drop Cars",
      "url": "https://dropcars.in",
      "logo": "https://dropcars.in/assets/img/logo.png",
      "image": "https://dropcars.in/assets/img/og-cover.jpg",
      "description": "Trusted One-Way Drop Taxi and Outstation Cab Service with fixed per-km rates and zero return fares. Professional chauffeurs and premium cabs for intercity travel across Tamil Nadu, Pondicherry, Andhra Pradesh, Karnataka and Kerala.",
      "telephone": "<?php echo htmlspecialchars($companyPhoneTel); ?>",
      "email": "support@dropcars.in",
      "areaServed": [
        {"@type": "State", "name": "Tamil Nadu"},
        {"@type": "State", "name": "Pondicherry"},
        {"@type": "State", "name": "Andhra Pradesh"},
        {"@type": "State", "name": "Karnataka"},
        {"@type": "State", "name": "Kerala"}
      ],
      "serviceType": ["One-Way Drop Taxi", "Outstation Cab", "Airport Transfer", "Round Trip"],
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "4.9",
        "reviewCount": "2800",
        "bestRating": "5"
      },
      "openingHoursSpecification": {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],
        "opens": "00:00",
        "closes": "23:59"
      },
      "priceRange": "₹₹"
    }
    </script>
    <!-- JSON-LD FAQPage structured data -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How is the one-way drop taxi fare calculated?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "You only pay for the one-way distance traveled with fixed per-km rates and zero return charges."
          }
        },
        {
          "@type": "Question",
          "name": "Are driver bata, tolls, and state permits included?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Driver bata is clearly specified during booking. Tolls and state permits are charged transparently based on actual route usage."
          }
        },
        {
          "@type": "Question",
          "name": "Can I book an outstation or airport taxi 24x7?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes, Drop Cars operates 24x7 guaranteed pickup and drop services for all major cities and airports across South India."
          }
        }
      ]
    }
    </script>
<?php include __DIR__ . '/includes/google-tag.php'; ?>
<link rel="stylesheet" href="/assets/css/dark-mode.css?v=2.0">
<link rel="stylesheet" href="/assets/css/light-theme.css?v=<?php echo @filemtime(__DIR__.'/assets/css/light-theme.css'); ?>">
<link rel="stylesheet" href="/assets/css/stats-strip.css">
<link rel="stylesheet" href="/assets/css/animations.css">
<script src="/assets/js/dark-mode.js?v=2.0"></script>
</head>
<body class="main-page" data-active-theme-id="<?php echo htmlspecialchars($activeTheme['id'] ?? 'drop-taxi'); ?>" data-home-scroll-to="<?php echo htmlspecialchars($homeScrollToId ?? '', ENT_QUOTES, 'UTF-8'); ?>">

<?php echo $shell->renderHeader(); ?>
<?php echo $contentBlocks->renderMarketingAssets(); ?>

<main>
    <!-- Hero & Booking Section -->
    <!-- Hero & Booking Section -->
    <section class="hero hero--main" id="booking">
        <!-- Background Image Slideshow -->
        <div class="hero-slider">
            <div class="hero-slide active">
                <div class="hero-slide__bg" style="background-image: url('/assets/img/hero-slide-1.webp');"></div>
            </div>
            <div class="hero-slide">
                <div class="hero-slide__bg" style="background-image: url('/assets/img/hero-slide-2.webp');"></div>
            </div>
            <div class="hero-slide">
                <div class="hero-slide__bg" style="background-image: url('/assets/img/hero-slide-3.webp');"></div>
            </div>
            <div class="hero-slide">
                <div class="hero-slide__bg" style="background-image: url('/assets/img/hero-slide-4.webp');"></div>
            </div>
            <div class="hero-slide">
                <div class="hero-slide__bg" style="background-image: url('/assets/img/hero-slide-5.webp');"></div>
            </div>
        </div><!-- /.hero-slider -->

        <div class="container hero__layout">
            <div class="hero__copy">
                <!-- Unified Text Slideshow -->
                <div class="hero-slider-text">
                    <div class="hero-text-slide active">
                        <div class="hero__eyebrow">✦ <?php echo htmlspecialchars($siteTitle); ?> Official Booking</div>
                        <h1><?php echo htmlspecialchars($pageMetaTitle); ?></h1>
                        <p class="hero__sub"><?php echo htmlspecialchars($pageMetaDesc); ?></p>
                    </div>
                    <div class="hero-text-slide">
                        <div class="hero__eyebrow">✦ #1 Rated Outstation Cab Service</div>
                        <h2 class="hero__slide-title"><?php echo htmlspecialchars($pageH1); ?></h2>
                        <p class="hero__sub"><?php echo htmlspecialchars($pageHeroSub); ?></p>
                    </div>
                    <div class="hero-text-slide">
                        <div class="hero__eyebrow">✦ Save 50% On One-Way Fares</div>
                        <h2 class="hero__slide-title">One-Way Drop Taxi &amp; Outstation Cab Service</h2>
                        <p class="hero__sub">Pay only for the distance traveled with Zero Return Fares. Book verified AC sedans and SUVs with Fixed Per-KM Rates for Chennai to Bangalore cabs, Coimbatore outstation taxi and more.</p>
                    </div>
                    <div class="hero-text-slide">
                        <div class="hero__eyebrow">✦ 24/7 Punctual Airport Cabs</div>
                        <h2 class="hero__slide-title">Punctual Airport Drop Taxi &amp; Local Cabs</h2>
                        <p class="hero__sub">Guaranteed on-time airport pickup and drop transfers. 24x7 service for Chennai, Bangalore, Coimbatore &amp; Trichy airports with fixed rates.</p>
                    </div>
                    <div class="hero-text-slide">
                        <div class="hero__eyebrow">✦ Fixed Rates &amp; Clear GST Bills</div>
                        <h2 class="hero__slide-title">Transparent Outstation Taxi Fares &amp; Bills</h2>
                        <p class="hero__sub">Complete fare transparency with clear breakdown for driver bata, tolls, and state border permits. Instant digital GST bills on every trip.</p>
                    </div>
                    <div class="hero-text-slide">
                        <div class="hero__eyebrow">✦ 120+ Intercity Route Network</div>
                        <h2 class="hero__slide-title">City-to-City Outstation Taxi &amp; Drops</h2>
                        <p class="hero__sub">Connecting Chennai, Bangalore, Coimbatore, Madurai, Trichy, Salem &amp; 120+ cities with verified highway chauffeurs and sanitized cabs.</p>
                    </div>
                </div>

                <!-- ✦ Stats Counter Strip ✦ -->
                <div class="d1t-stats-strip d1t-stats-strip--single hero__stats-strip">
                    <div class="d1t-stats-strip__grid">
                        <div class="d1t-stat-block anim-reveal">
                            <div class="d1t-stat-block__num" data-count="3000" data-suffix="+">0</div>
                            <div class="d1t-stat-block__label">Verified Cabs</div>
                        </div>
                        <div class="d1t-stat-block anim-reveal">
                            <div class="d1t-stat-block__num" data-count="200" data-suffix="+">0</div>
                            <div class="d1t-stat-block__label">Cities Covered</div>
                        </div>
                        <div class="d1t-stat-block anim-reveal">
                            <div class="d1t-stat-block__num" data-count="4.9" data-suffix="★" data-decimal="1">0</div>
                            <div class="d1t-stat-block__label">Customer Rating</div>
                        </div>
                        <div class="d1t-stat-block anim-reveal">
                            <div class="d1t-stat-block__num" data-count="24" data-suffix="/7">0</div>
                            <div class="d1t-stat-block__label">Customer Support</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="hero__booking-col">
                <div style="margin-bottom: 0.5rem; display: flex; justify-content: center; align-items: center; width: 100%;">
                    <span id="booking-form-dynamic-title" class="airport-top-badge" style="display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: #ffffff; padding: 6px 14px; border-radius: 20px; font-size: 0.82rem; font-weight: 700; box-shadow: none; text-shadow: none; cursor: pointer; transition: all 0.3s ease;" onclick="if(window.DropCarsScrollToBookingForm){window.DropCarsScrollToBookingForm(true);}else{document.getElementById('booking-form').scrollIntoView({behavior:'smooth'});}">
                        🚖 Book Drop Taxi
                    </span>
                </div>

                <div class="booking-card booking-card--home" aria-label="<?php echo htmlspecialchars($themeEngine->getWording('name', 'Drop Taxi')); ?> booking form">
                <form id="booking-form" class="booking-form" method="post" action="javascript:void(0);" novalidate>
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
                                <input type="text" name="pickup" id="pickup" placeholder="Pick Up Location" required style="padding-right: 35px;" />
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
                            <input type="text" name="drop" id="drop" placeholder="Drop Location" required />
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
                            <input type="text" name="customerName" placeholder="Your Name" value="<?php echo htmlspecialchars($loggedInCustomer['name'] ?? ''); ?>" required />
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
                                    <input type="hidden" name="countryCode" id="country-code-hidden" value="<?php echo htmlspecialchars($custCountryCode); ?>" />
                                    <button type="button" class="country-code-trigger" id="country-code-trigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="country-code-popover" title="Country code"><?php echo htmlspecialchars($custCountryCode); ?></button>
                                    <div id="country-code-popover" class="country-code-popover is-hidden" role="dialog" aria-label="Choose or type country code">
                                        <button type="button" class="country-code-option" data-code="+91">+91</button>
                                        <input type="text" class="country-code-manual-inline" id="country-code-manual-input" inputmode="tel" autocomplete="off" maxlength="12" placeholder="" aria-label="Type country code e.g. +65" />
                                    </div>
                                </div>
                                <input type="tel" name="contactPhone" placeholder="9876543210" id="contact-phone" class="phone-national-input" inputmode="numeric" pattern="[0-9]*" maxlength="10" autocomplete="tel" value="<?php echo htmlspecialchars($custNationalPhone); ?>" required />
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
                            <input type="email" name="contactEmail" placeholder="name@email.com" id="contact-email" value="<?php echo htmlspecialchars($loggedInCustomer['email'] ?? ''); ?>" />
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
                            <button type="submit" class="btn-primary btn-primary--confirm" id="confirm-booking-btn">Book <?php echo htmlspecialchars($themeEngine->getWording('name', 'Drop Taxi')); ?> Now</button>

                        </div>
                    </div>

                    <p id="form-response" class="form-response" role="status"></p>
                </form>

                </div>
            </div>
        </div>
    </section>
 
    <!-- ✦ Master Brand Trust & Assurance Strip ✦ -->
    <section class="brand-trust-section" aria-label="Why Drop Cars is Trusted">
        <div class="container">
            <div class="brand-trust-grid">
                <div class="brand-trust-card anim-reveal">
                    <div class="brand-trust-card__icon">🛡️</div>
                    <div class="brand-trust-card__info">
                        <h3>Verified Drivers</h3>
                        <p>Experienced & courteous highway chauffeurs for 100% safe journeys</p>
                    </div>
                </div>
                <div class="brand-trust-card anim-reveal">
                    <div class="brand-trust-card__icon">🧼</div>
                    <div class="brand-trust-card__info">
                        <h3>Clean & Sanitized AC Cabs</h3>
                        <p>100% Chilled AC guaranteed & clean sanitized interiors inspected</p>
                    </div>
                </div>
                <div class="brand-trust-card anim-reveal">
                    <div class="brand-trust-card__icon">🔒</div>
                    <div class="brand-trust-card__info">
                        <h3>100% Dedicated Private Cab</h3>
                        <p>Exclusive cab for you & family — zero sharing or co-passengers</p>
                    </div>
                </div>
                <div class="brand-trust-card anim-reveal">
                    <div class="brand-trust-card__icon">🔄</div>
                    <div class="brand-trust-card__info">
                        <h3>24/7 Highway Backup Support</h3>
                        <p>Instant breakdown assistance & backup cab support across South India</p>
                    </div>
                </div>
            </div>

            <!-- In-Car Amenities & Corporate Pill Badges -->
            <div class="brand-pills-row anim-reveal">
                <span class="brand-pill"><span class="pill-icon">❄️</span> 100% Chilled AC Guarantee</span>
                <span class="brand-pill"><span class="pill-icon">🧳</span> Dedicated Luggage Boot Space</span>
                <span class="brand-pill"><span class="pill-icon">🏠</span> 100% Doorstep Pickup & Direct Drop</span>
                <span class="brand-pill"><span class="pill-icon">🧾</span> GST Invoices for Corporate Travel</span>
                <span class="brand-pill"><span class="pill-icon">📞</span> 24/7 Customer Support On Call</span>
            </div>
        </div>
    </section>

    <?php echo $contentBlocks->renderServices('home-services'); ?>

    <!-- Master Tabbed Routes & Cities Hub -->
    <?php
    $cityCardThemeName = $themeEngine->getWording('name', 'Drop Taxi');
    if ($cityCardThemeName === 'Drop Cars') {
        $cityCardThemeName = 'Drop Taxi';
    }
    ?>
    <section class="routes-section city-routes-section" id="routes">
        <div class="container">
            <div class="section-header text-center" style="margin-bottom: 2rem;">
                <p class="eyebrow" id="route-eyebrow">Explore Destinations & Fares</p>
                <h2 id="route-title">Popular <?php echo htmlspecialchars($cityCardThemeName); ?> Routes & Cities</h2>
            </div>

            <!-- Master Tab Navigation -->
            <div class="master-tabs-container">
                <div class="master-tabs" role="tablist">
                    <button class="master-tab active" data-target="#tab-popular-routes" role="tab" aria-selected="true">
                        <span class="tab-icon">🛣️</span>
                        <span>Popular Routes</span>
                    </button>
                    <button class="master-tab" data-target="#tab-city-hubs" role="tab" aria-selected="false">
                        <span class="tab-icon">🌆</span>
                        <span>Major Hub Cities</span>
                    </button>
                    <button class="master-tab" data-target="#tab-airport-transfers" role="tab" aria-selected="false">
                        <span class="tab-icon">✈️</span>
                        <span>Airport Transfers</span>
                    </button>
                </div>
            </div>

            <!-- Master Tab Contents -->
            <div class="master-tab-contents">
                <!-- Tab 1: Popular Routes -->
                <div class="master-tab-pane active" id="tab-popular-routes" role="tabpanel">
                    <!-- City Selector Grid -->
                    <div class="city-selector">
                        <div class="city-tabs" id="city-tabs">
                            <button class="city-tab active" data-city="Chennai">Chennai</button>
                            <button class="city-tab" data-city="Tiruvannamalai">Tiruvannamalai</button>
                            <button class="city-tab" data-city="Coimbatore">Coimbatore</button>
                            <button class="city-tab" data-city="Madurai">Madurai</button>
                            <button class="city-tab" data-city="Trichy">Trichy</button>
                            <button class="city-tab" data-city="Bangalore">Bangalore</button>
                            <button class="city-tab" data-city="Trivandrum">Trivandrum</button>
                            <button class="city-tab" data-city="Rameshwaram">Rameshwaram</button>
                            <button class="city-tab" data-city="Kanyakumari">Kanyakumari</button>
                            <button class="city-tab" data-city="Pondicherry">Pondicherry</button>
                            <button class="city-tab" data-city="Vellore">Vellore</button>
                            <button class="city-tab" data-city="Tirupati">Tirupati</button>
                            <button class="city-tab" data-city="Salem">Salem</button>
                            <button class="city-tab" data-city="Kochi">Kochi</button>
                        </div>
                    </div>

                    <!-- Routes Grid -->
                    <div class="routes-grid" id="popular-routes-grid">
                        <!-- Dynamically filled by JS -->
                    </div>

                    <div class="view-more-container" id="view-more-container">
                        <button id="view-more-routes" class="btn-outline">View More Routes</button>
                    </div>
                </div>

                <!-- Tab 2: Major Hub Cities -->
                <div class="master-tab-pane" id="tab-city-hubs" role="tabpanel" style="display: none;">
                    <div id="cities"></div>
                    <div class="city-grid city-grid--important" id="city-grid-important">
                        <?php foreach ($importantCities as $city): ?>
                            <a href="<?php echo dropcars_url(($activeTheme['slug'] ?? 'drop-cars') . '/' . $city['slug']); ?>" class="city-card highway-signboard route-card--highway" data-city-name="<?php echo htmlspecialchars($city['city']); ?>">
                                <div class="highway-signboard-shine"></div>
                                <div class="highway-signboard__header">
                                    <span class="highway-badge">OUTSTATION TAXI</span>
                                </div>
                                <div class="highway-signboard__route">
                                    <span><?php echo htmlspecialchars($cityCardThemeName . ' in ' . $city['city']); ?></span>
                                </div>
                                <div class="highway-signboard__metrics">
                                    <div class="highway-metric highway-metric--kms">
                                        <span class="highway-metric__icon">📍</span>
                                        <span>One-Way Taxi</span>
                                    </div>
                                    <div class="highway-metric highway-metric--timing">
                                        <span class="highway-metric__icon">🚗</span>
                                        <span>24x7 Cabs</span>
                                    </div>
                                </div>
                                <div class="highway-signboard__cta">
                                    <span>View Fares</span>
                                    <span class="cta-arrow">➔</span>
                                </div>
                            </a>
                        <?php endforeach; ?>
                    </div>

                    <button class="city-toggle-btn" id="city-toggle-btn" data-theme-name="<?php echo htmlspecialchars($cityCardThemeName); ?>" data-exclude-slugs="<?php echo htmlspecialchars(implode(',', $importantSlugs)); ?>">
                        <span class="btn-text">View All <?php echo htmlspecialchars($cityCardThemeName); ?> Cities</span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
                    </button>

                    <div class="city-collapse" id="city-collapse">
                        <div class="city-grid" id="city-grid" data-lazy-source="<?php echo htmlspecialchars(dropcars_url('data/cities.json')); ?>"></div>
                    </div>
                </div>

                <!-- Tab 3: Airport Transfers -->
                <div class="master-tab-pane" id="tab-airport-transfers" role="tabpanel" style="display: none;">
                    <div class="airport-hub-grid">
                        <a href="<?php echo dropcars_url(($activeTheme['slug'] ?? 'drop-cars') . '/chennai'); ?>" class="airport-card">
                            <div class="airport-card__badge">24x7 AIRPORT CABS</div>
                            <div class="airport-card__title">✈️ Chennai International Airport (MAA)</div>
                            <p class="airport-card__desc">Pickup & drop from MAA to Pondicherry, Vellore, Tirupati, Trichy, Salem & all TN districts. Flat fares, zero return fare.</p>
                            <span class="airport-card__cta">Book Airport Taxi ➔</span>
                        </a>
                        <a href="<?php echo dropcars_url(($activeTheme['slug'] ?? 'drop-cars') . '/bangalore'); ?>" class="airport-card">
                            <div class="airport-card__badge">24x7 AIRPORT CABS</div>
                            <div class="airport-card__title">✈️ Kempegowda Intl Airport Bengaluru (BLR)</div>
                            <p class="airport-card__desc">Reliable airport transfer from BLR to Hosur, Krishnagiri, Salem, Coimbatore, Chennai & Mysuru.</p>
                            <span class="airport-card__cta">Book Airport Taxi ➔</span>
                        </a>
                        <a href="<?php echo dropcars_url(($activeTheme['slug'] ?? 'drop-cars') . '/coimbatore'); ?>" class="airport-card">
                            <div class="airport-card__badge">24x7 AIRPORT CABS</div>
                            <div class="airport-card__title">✈️ Coimbatore Intl Airport (CJB)</div>
                            <p class="airport-card__desc">Direct one-way cab services from CJB to Ooty, Coonoor, Pollachi, Tiruppur, Erode & Kerala border.</p>
                            <span class="airport-card__cta">Book Airport Taxi ➔</span>
                        </a>
                        <a href="<?php echo dropcars_url(($activeTheme['slug'] ?? 'drop-cars') . '/madurai'); ?>" class="airport-card">
                            <div class="airport-card__badge">24x7 AIRPORT CABS</div>
                            <div class="airport-card__title">✈️ Madurai Airport (IXM)</div>
                            <p class="airport-card__desc">Seamless outstation taxi connecting IXM to Rameshwaram, Kanyakumari, Tirunelveli & Kodaikanal.</p>
                            <span class="airport-card__cta">Book Airport Taxi ➔</span>
                        </a>
                        <a href="<?php echo dropcars_url(($activeTheme['slug'] ?? 'drop-cars') . '/trichy'); ?>" class="airport-card">
                            <div class="airport-card__badge">24x7 AIRPORT CABS</div>
                            <div class="airport-card__title">✈️ Tiruchirappalli Intl Airport (TRZ)</div>
                            <p class="airport-card__desc">Instant drop taxi service from TRZ to Thanjavur, Kumbakonam, Karur, Nagapattinam & Pudukkottai.</p>
                            <span class="airport-card__cta">Book Airport Taxi ➔</span>
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </section>


    <?php echo $contentBlocks->renderSeoBlog('home-guides'); ?>

    <!-- Explore Our Options Section -->
    <?php echo $contentBlocks->renderFleetShowcase('services', ['eyebrow' => 'FLEET & PRICING', 'title' => 'Choose a vehicle for your Drop Cars trip']); ?>






    <!-- Quote Modal -->
    <div class="quote-modal" id="quote-modal" aria-hidden="true">
        <div class="quote-modal__card" role="dialog" aria-modal="true">
            <button class="quote-modal__close" id="quote-close" aria-label="Close">✕</button>
            <p class="eyebrow">Curated Ride Options</p>
            <h3 id="quote-summary">Choose the right cab</h3>
            <div class="quote-modal__meta"><span id="quote-route"></span><span id="quote-fare"></span></div>
            <div class="vehicle-grid" id="vehicle-grid"></div>
            <p class="quote-modal__cta">Call <a href="tel:<?php echo htmlspecialchars($companyPhoneTel); ?>"><?php echo htmlspecialchars($companyPhoneDisplay); ?></a> to confirm.</p>
            <div class="quote-modal__actions">
                <button type="button" class="btn-outline" id="quote-back">Back</button>
                <button type="button" class="btn-primary" id="quote-continue">Continue</button>
            </div>
        </div>
    </div>


    <!-- About Section -->
    <section class="about-section" id="about">
        <div class="container">
            <div class="about-grid">
                <div class="about-content">
                    <p class="eyebrow">Professional intercity travel</p>
                    <h2>About <?php echo htmlspecialchars($themeEngine->getWording('name', 'Drop Cars')); ?></h2>
                    <p><?php echo htmlspecialchars($themeEngine->getWording('name', 'Drop Cars')); ?> is your trusted partner for affordable and reliable intercity taxi services. We ensure safe travel, timely pickups, professional drivers, clean vehicles, and transparent pricing, delivering comfortable journeys for commuters, families, tourists, and long-distance travelers across South India.</p>
                    <p>Our mission is to make intercity travel affordable, safe, and convenient by providing reliable taxi services with transparent pricing, professional drivers, clean vehicles, and customer-focused support.</p>
                    <div class="about-section__action">
                        <a href="#contact" class="btn-primary">
                            <span class="btn-icon">📞</span>
                            For More Details
                        </a>
                    </div>
                </div>
                <div class="about-stats-card">
                    <div class="stat-badge">
                        <span class="stat-number">3,000+</span>
                        <span class="stat-label">Verified Cabs</span>
                    </div>
                    <div class="stat-badge">
                        <span class="stat-number">200+</span>
                        <span class="stat-label">Cities Covered</span>
                    </div>
                    <div class="stat-badge">
                        <span class="stat-number">4.9 ★</span>
                        <span class="stat-label">Customer Rating</span>
                    </div>
                    <div class="stat-badge">
                        <span class="stat-number">24/7</span>
                        <span class="stat-label">Support &amp; Drops</span>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- Why Choose Us Grid -->
    <section class="features-grid-section">
        <div class="container">
            <div class="section-title-center">
                <p class="eyebrow">The Drop Cars Difference</p>
                <h2>Why Choose <?php echo htmlspecialchars($themeEngine->getWording('name', 'Drop Cars')); ?>?</h2>
                <p class="section-sub">Experience the difference with our professional service, transparent pricing, and customer-first approach</p>
            </div>

            <div class="premium-features-row">
                <div class="feature-card">
                    <span class="feature-card__number">01</span>
                    <div class="feature-card__icon-wrapper">👨‍✈️</div>
                    <div class="feature-card__content">
                        <h3>Professional Drivers</h3>
                        <p>Experienced, licensed, and courteous drivers with extensive knowledge of Tamil Nadu, Karnataka & Kerala highway routes.</p>
                    </div>
                </div>
                <div class="feature-card">
                    <span class="feature-card__number">02</span>
                    <div class="feature-card__icon-wrapper">💰</div>
                    <div class="feature-card__content">
                        <h3>Transparent Pricing</h3>
                        <p>No hidden charges. Pay exactly what we quote with detailed fare breakdowns.</p>
                    </div>
                </div>
                <div class="feature-card">
                    <span class="feature-card__number">03</span>
                    <div class="feature-card__icon-wrapper">🕒</div>
                    <div class="feature-card__content">
                        <h3>24/7 Support</h3>
                        <p>Round the clock customer service for bookings, queries, and emergency assistance.</p>
                    </div>
                </div>
                <div class="feature-card">
                    <span class="feature-card__number">04</span>
                    <div class="feature-card__icon-wrapper">🚗</div>
                    <div class="feature-card__content">
                        <h3>Well-Maintained Fleet</h3>
                        <p>Clean, comfortable, and regularly serviced vehicles with AC and safety features.</p>
                    </div>
                </div>
                <div class="feature-card">
                    <span class="feature-card__number">05</span>
                    <div class="feature-card__icon-wrapper">✅</div>
                    <div class="feature-card__content">
                        <h3>Instant Confirmation</h3>
                        <p>Immediate booking confirmation via WhatsApp and SMS with driver details.</p>
                    </div>
                </div>
                <div class="feature-card">
                    <span class="feature-card__number">06</span>
                    <div class="feature-card__icon-wrapper">🛡️</div>
                    <div class="feature-card__content">
                        <h3>Safe &amp; Reliable</h3>
                        <p>GPS tracking, insurance coverage, and verified drivers for your safety.</p>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- Testimonials Section -->
    <section class="testimonials-section" id="reviews">
        <div class="container">
            <div class="section-title-center">
                <p class="eyebrow">Customer Reviews</p>
                <h2>What Our Customers Say</h2>
                <p class="section-sub">Read genuine reviews from our satisfied customers who have experienced our excellent service</p>
            </div>

            <div class="testimonials-grid" id="testimonials-grid">
                <?php
                $reviews = dropcars_get_reviews();
                foreach ($reviews as $r):
                    $stars = str_repeat('⭐', (int)($r['rating'] ?? 5));
                    $trip = $r['trip_route'] ?? 'Intercity Trip';
                ?>
                <div class="testimonial-card" data-review-id="<?= (int)($r['id'] ?? 0) ?>">
                    <div class="testimonial-rating"><?= $stars ?></div>
                    <p class="testimonial-text">"<?= htmlspecialchars($r['comment'] ?? '') ?>"</p>
                    <div class="testimonial-meta">
                        <div class="testimonial-user">
                            <strong><?= htmlspecialchars($r['customer_name'] ?? '') ?></strong>
                            <small><?= !empty($r['is_verified']) ? 'Verified Customer' : 'Customer' ?></small>
                        </div>
                        <span class="testimonial-trip">Trip: <?= htmlspecialchars($trip) ?></span>
                    </div>
                </div>
                <?php endforeach; ?>
            </div>

            <div class="testimonials-view-more">
                <a href="/pages/reviews.php" class="btn-view-more">View more reviews</a>
            </div>

            <!-- Rate Us Box -->
            <div class="rate-us-box" id="rate-us-box">
                <h3>Rate Us</h3>
                <p class="rate-us-sub">Share your experience with Drop Cars</p>
                <form id="rate-us-form" class="rate-us-form">
                    <div class="rate-us-stars" id="rate-us-stars" role="group" aria-label="Rating">
                        <button type="button" class="star-btn" data-rating="1" aria-label="1 star">☆</button>
                        <button type="button" class="star-btn" data-rating="2" aria-label="2 stars">☆</button>
                        <button type="button" class="star-btn" data-rating="3" aria-label="3 stars">☆</button>
                        <button type="button" class="star-btn" data-rating="4" aria-label="4 stars">☆</button>
                        <button type="button" class="star-btn" data-rating="5" aria-label="5 stars">☆</button>
                    </div>
                    <input type="hidden" name="rating" id="rate-us-rating" value="5">
                    <div class="field">
                        <label for="rate-us-comment">Your Review</label>
                        <textarea id="rate-us-comment" name="comment" rows="4" placeholder="Tell us about your trip..." required></textarea>
                    </div>
                    <div class="field">
                        <label for="rate-us-trip">Trip Route (optional)</label>
                        <input type="text" id="rate-us-trip" name="trip_route" placeholder="e.g. Chennai to Bangalore">
                    </div>
                    <button type="submit" class="btn-primary" id="rate-us-submit">Submit Review</button>
                    <p id="rate-us-message" class="rate-us-message" style="display:none;"></p>
                </form>
            </div>

        </div>
    </section>

    <!-- FAQ Section -->
    <section class="faq" id="faq">
        <div class="container faq__layout">
            <div class="faq__intro">
                <p class="eyebrow">FAQs</p>
                <h2>Common Questions about our <?php echo htmlspecialchars($themeEngine->getWording('name', 'Drop Taxi')); ?></h2>
                <p style="margin-top: 0.75rem; color: var(--gray-600); font-size: 0.98rem; line-height: 1.6;">Everything you need to know about our One-Way Drop Taxi service, Outstation Cab Service, pricing transparency, and trip safety for Chennai to Bangalore cabs and other intercity routes.</p>
            </div>
            <div class="faq__accordion">
                <details class="faq__item" open>
                    <summary class="faq__summary">How do I book a <?php echo htmlspecialchars($themeEngine->getWording('name', 'one way taxi')); ?>?</summary>
                    <p>You can use the booking form above to get an instant fare estimate and book online in seconds. Alternatively, you can call or WhatsApp us at <?php echo htmlspecialchars($companyPhoneDisplay); ?> for instant 24/7 confirmation.</p>
                </details>

                <details class="faq__item">
                    <summary class="faq__summary">Are there any hidden charges or return fare fees?</summary>
                    <p>No, we maintain 100% transparency. For one-way trips, you pay strictly for the distance traveled with zero return fare charges. Base fares include driver bata. Highway toll fees, parking charges, and state permits are extra as per actual receipts.</p>
                </details>

                <details class="faq__item">
                    <summary class="faq__summary">Is it safe for late night and early morning travel?</summary>
                    <p>Absolutely. All our chauffeurs are background-verified, highly experienced in long-distance intercity driving, and knowledgeable of major South Indian routes. Every trip is tracked in real-time via GPS for your safety.</p>
                </details>

                <details class="faq__item">
                    <summary class="faq__summary">What types of vehicles can I choose from?</summary>
                    <p>We provide a comprehensive fleet of clean, well-maintained, AC vehicles: Sedan cabs (Swift Dzire, Etios), Executive SUVs (Ertiga, Xylo), Premium SUVs (Innova, Innova Crysta), and Tempo Travellers for larger group travel.</p>
                </details>

                <details class="faq__item">
                    <summary class="faq__summary">How are interstate permits and toll charges billed?</summary>
                    <p>Toll fees are paid at physical highway plazas or via FASTag as per actual receipts. For inter-state travel (e.g., Tamil Nadu to Pondicherry, Karnataka, Kerala, or Andhra Pradesh), state border permits are collected based on official RTO rates.</p>
                </details>

                <details class="faq__item">
                    <summary class="faq__summary">Can I book an airport pickup or drop in advance?</summary>
                    <p>Yes, we operate 24/7 airport transfer services for all major airports across South India (Chennai MAA, Bengaluru BLR, Coimbatore CJB, Trichy TRZ, Madurai IXM, Salem SXV). Pre-booking guarantees on-time driver arrival.</p>
                </details>

                <details class="faq__item">
                    <summary class="faq__summary">What is your cancellation and refund policy?</summary>
                    <p>We offer hassle-free flexible bookings with free cancellations allowed up to 2 hours prior to your scheduled pickup time. Any advance deposit is immediately credited back to your original payment method.</p>
                </details>

                <details class="faq__item">
                    <summary class="faq__summary">What payment methods do you accept?</summary>
                    <p>We accept all digital payment options including UPI (Google Pay, PhonePe, Paytm), Credit &amp; Debit Cards, Netbanking, as well as direct cash to the driver. GST-compliant digital tax invoices are sent automatically via SMS/Email.</p>
                </details>

                <details class="faq__item">
                    <summary class="faq__summary">Are luggage charges included in the fare?</summary>
                    <p>Yes, standard luggage fitting the boot space capacity for your selected vehicle class (e.g., 2-3 bags for Sedans, 4-5 bags for SUVs) is included without additional surcharges.</p>
                </details>
            </div>
        </div>
    </section>
</main>

<?php echo $shell->renderFooter(); ?>
<?php echo $shell->renderScripts(); ?>
<script defer src="<?php echo htmlspecialchars(dropcars_url('assets/js/home-section-url.js'), ENT_QUOTES, 'UTF-8'); ?>"></script>

<script>
(function() {
  var stars = document.getElementById('rate-us-stars');
  var ratingInput = document.getElementById('rate-us-rating');
  var form = document.getElementById('rate-us-form');
  var msgEl = document.getElementById('rate-us-message');
  if (!stars || !form) return;

  var currentRating = 5;
  var hoverRating = 0;

  function renderStars() {
    var r = hoverRating || currentRating;
    var btns = stars.querySelectorAll('.star-btn');
    btns.forEach(function(btn, i) {
      btn.textContent = i < r ? '★' : '☆';
      btn.style.color = i < r ? '#f59e0b' : '#d1d5db';
    });
  }

  stars.querySelectorAll('.star-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      currentRating = parseInt(btn.dataset.rating, 10);
      ratingInput.value = currentRating;
      renderStars();
    });
    btn.addEventListener('mouseenter', function() {
      hoverRating = parseInt(btn.dataset.rating, 10);
      renderStars();
    });
  });
  stars.addEventListener('mouseleave', function() {
    hoverRating = 0;
    renderStars();
  });
  renderStars();

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var comment = document.getElementById('rate-us-comment').value.trim();
    var trip = document.getElementById('rate-us-trip').value.trim();
    if (!comment) {
      msgEl.textContent = 'Please enter your review.';
      msgEl.style.display = 'block';
      msgEl.style.color = '#dc2626';
      return;
    }
    msgEl.style.display = 'none';

    fetch('/api/reviews.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rating: parseInt(ratingInput.value, 10) || 5,
        comment: comment,
        trip_route: trip || ''
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.redirect && data.login_required) {
        window.location.href = data.redirect;
        return;
      }
      if (data.success) {
        msgEl.textContent = data.message || 'Thank you! Your review has been posted.';
        msgEl.style.color = 'var(--accent)';
        msgEl.style.display = 'block';
        form.reset();
        ratingInput.value = 5;
        renderStars();
        setTimeout(function() { location.reload(); }, 1500);
      } else {
        msgEl.textContent = data.error || 'Something went wrong. Please try again.';
        msgEl.style.color = '#dc2626';
        msgEl.style.display = 'block';
      }
    })
    .catch(function() {
      msgEl.textContent = 'Network error. Please try again.';
      msgEl.style.color = '#dc2626';
      msgEl.style.display = 'block';
    });
  });

  var viewMoreLink = document.querySelector('.testimonials-view-more .btn-view-more');
  if (viewMoreLink) {
    viewMoreLink.addEventListener('click', function(e) {
      window.location.href = this.getAttribute('href') || '/pages/reviews.php';
      e.preventDefault();
    });
  }

  if (new URLSearchParams(window.location.search).get('complete_review') === '1') {
    fetch('/api/reviews.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ complete_pending: true })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) {
        window.history.replaceState({}, '', window.location.pathname + '#reviews');
        location.reload();
      }
    });
  }
})();
</script>
<?php if ($activeBanner): ?>
<style>
.promo-flash-overlay {
    position: fixed;
    z-index: 99999;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%) translateY(120px);
    width: 92%;
    max-width: 580px;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.6);
    box-shadow: 0 20px 50px rgba(15, 23, 42, 0.18);
    border-radius: 24px;
    padding: 12px;
    display: flex;
    align-items: center;
    gap: 16px;
    cursor: pointer;
    transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.6s ease;
    opacity: 0;
}
.promo-flash-overlay.show {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
}
.promo-flash-img {
    width: 110px;
    height: 72px;
    border-radius: 14px;
    object-fit: cover;
    flex-shrink: 0;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    border: 1px solid rgba(0,0,0,0.05);
}
.promo-flash-info {
    flex: 1;
    min-width: 0;
    font-family: 'Inter', sans-serif;
}
.promo-flash-title {
    font-size: 0.85rem;
    font-weight: 800;
    color: #0f172a;
    margin: 0 0 3px;
    display: flex;
    align-items: center;
    gap: 6px;
    letter-spacing: -0.01em;
}
.promo-flash-desc {
    font-size: 0.75rem;
    color: #475569;
    font-weight: 550;
    line-height: 1.3;
    margin: 0;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
}
.promo-flash-cta {
    font-size: 0.68rem;
    font-weight: 800;
    color: #fff;
    background: linear-gradient(135deg, #1e4b7f 0%, #153960 100%);
    padding: 5px 12px;
    border-radius: 8px;
    display: inline-block;
    margin-top: 6px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    box-shadow: 0 4px 10px rgba(30,75,127,0.25);
}
.promo-flash-close {
    background: rgba(15, 23, 42, 0.05);
    border: none;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 16px;
    color: #475569;
    transition: all 0.2s ease;
    flex-shrink: 0;
}
.promo-flash-close:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
}

/* Popup Modal styling */
.promo-popup-modal {
    position: fixed;
    inset: 0;
    z-index: 999999;
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.4s ease;
}
.promo-popup-modal.show {
    opacity: 1;
    pointer-events: auto;
}
.promo-popup-card {
    background: #fff;
    width: 90%;
    max-width: 440px;
    border-radius: 28px;
    overflow: hidden;
    box-shadow: 0 30px 60px rgba(0,0,0,0.25);
    transform: scale(0.9) translateY(20px);
    transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    border: 1px solid rgba(255,255,255,0.8);
    position: relative;
}
.promo-popup-modal.show .promo-popup-card {
    transform: scale(1) translateY(0);
}
.promo-popup-img {
    width: 100%;
    aspect-ratio: 16/9;
    object-fit: cover;
    border-bottom: 1px solid #f1f5f9;
}
.promo-popup-body {
    padding: 24px;
    text-align: center;
    font-family: 'Inter', sans-serif;
}
.promo-popup-close-btn {
    position: absolute;
    top: 16px;
    right: 16px;
    background: rgba(255,255,255,0.9);
    border: none;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 18px;
    color: #475569;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 10px rgba(0,0,0,0.12);
    z-index: 10;
    transition: all 0.2s ease;
}
.promo-popup-close-btn:hover {
    color: #ef4444;
    transform: scale(1.05);
}
</style>

<?php if ($activeBanner['is_popup'] == 1): ?>
    <div id="promo-popup" class="promo-popup-modal">
        <div class="promo-popup-card" onclick="window.location.href='<?php echo htmlspecialchars(dropcars_url('pages/customer-login.php?promo=1'), ENT_QUOTES, 'UTF-8'); ?>'">
            <button class="promo-popup-close-btn" onclick="dismissPromo(event)" aria-label="Close">&times;</button>
            <img src="<?php echo htmlspecialchars($activeBanner['content']); ?>" class="promo-popup-img" alt="Exclusive Promo" loading="lazy">
            <div class="promo-popup-body">
                <h3 style="margin: 0 0 8px; font-weight: 800; font-size: 1.3rem; color: #0f172a; letter-spacing: -0.02em;">🔥 Exclusive Discount Unlocked!</h3>
                <p style="margin: 0 0 20px; font-size: 0.9rem; color: #475569; font-weight: 550; line-height: 1.4;">Claim this offer by verifying your profile. Registered users get instant price drops on bookings!</p>
                <button style="border: none; width: 100%; padding: 14px; border-radius: 12px; font-weight: 800; font-size: 0.95rem; background: linear-gradient(135deg, #1e4b7f 0%, #153960 100%); color: #fff; cursor: pointer; box-shadow: 0 4px 15px rgba(30,75,127,0.2);">
                    🔑 Log in via Email & Apply Offer
                </button>
            </div>
        </div>
    </div>
<?php else: ?>
    <div id="promo-banner" class="promo-flash-overlay" onclick="window.location.href='<?php echo htmlspecialchars(dropcars_url('pages/customer-login.php?promo=1'), ENT_QUOTES, 'UTF-8'); ?>'">
        <img src="<?php echo htmlspecialchars($activeBanner['content']); ?>" class="promo-flash-img" alt="Promo" loading="lazy">
        <div class="promo-flash-info">
            <div class="promo-flash-title">🎉 Special Promo is Live!</div>
            <p class="promo-flash-desc">Apply coupon <strong><?php echo htmlspecialchars($activeBanner['coupon_code'] ?: 'DISCOUNT'); ?></strong> on checkout.</p>
            <span class="promo-flash-cta">Log In & Apply Offer</span>
        </div>
        <button class="promo-flash-close" onclick="dismissPromo(event)" aria-label="Close">&times;</button>
    </div>
<?php endif; ?>

<script>
document.addEventListener('DOMContentLoaded', () => {
    let dismissed = '0';
    try { dismissed = sessionStorage.getItem('promo_dismissed'); } catch (_) {}
    if (dismissed === '1') return;
    
    setTimeout(() => {
        const promo = document.getElementById('promo-popup') || document.getElementById('promo-banner');
        if (promo) promo.classList.add('show');
    }, 1800);
});

function dismissPromo(e) {
    e.stopPropagation();
    const promo = document.getElementById('promo-popup') || document.getElementById('promo-banner');
    if (promo) promo.classList.remove('show');
    try { sessionStorage.setItem('promo_dismissed', '1'); } catch (_) {}
}
</script>
<?php endif; ?>
<script defer src="/assets/js/animations.js"></script>
<script defer src="/assets/js/ai-assistant.js?v=<?php echo @filemtime(__DIR__.'/assets/js/ai-assistant.js'); ?>"></script>
<script>
(function(){
  /* Ensure stats strip eyebrow and count-up always work */
  function initStats(){
    var ey=document.querySelector('.hero__eyebrow');
    if(ey && ey.textContent.indexOf('Premier')!==-1) ey.textContent='✦ Leading Outstation Cab Service';
    document.querySelectorAll('#dc-stats-strip [data-count]').forEach(function(el){
      var t=parseFloat(el.dataset.count),d=parseInt(el.dataset.decimal||0),s=el.dataset.suffix||'',ts=null,dur=1400;
      if(isNaN(t))return;
      el.textContent=(d?t.toFixed(d):t)+s;
      requestAnimationFrame(function tick(now){if(!ts)ts=now;var p=Math.min((now-ts)/dur,1),e=1-Math.pow(1-p,3);el.textContent=(d?(t*e).toFixed(d):Math.floor(t*e))+s;if(p<1)requestAnimationFrame(tick);});
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initStats);
  else initStats();
})();
</script>
<script defer src="/assets/js/contact-step-reveal.js?v=<?php echo @filemtime(__DIR__.'/assets/js/contact-step-reveal.js'); ?>"></script>
<script>
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('a[href^="tel:"]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var phone = this.getAttribute('href').replace('tel:', '');
            fetch('http://localhost:8000/api/crm/lead', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Website-Secret-Key': 'dropcars_crm_secret_2026'
                },
                body: JSON.stringify({
                    phone: phone || 'Call Button Tap',
                    source: 'Website Call Click',
                    notes: 'Customer tapped Call Button on Drop Cars Website page: ' + window.location.href
                })
            }).catch(function(){});
        });
    });
});
</script>
<script>
document.addEventListener('DOMContentLoaded', function() {
    var masterTabs = document.querySelectorAll('.master-tab');
    var masterPanes = document.querySelectorAll('.master-tab-pane');

    function activateTab(targetId) {
        masterTabs.forEach(function(tab) {
            var isTarget = tab.getAttribute('data-target') === targetId;
            tab.classList.toggle('active', isTarget);
            tab.setAttribute('aria-selected', isTarget ? 'true' : 'false');
        });
        masterPanes.forEach(function(pane) {
            if ('#' + pane.id === targetId) {
                pane.style.display = 'block';
                pane.classList.add('active');
            } else {
                pane.style.display = 'none';
                pane.classList.remove('active');
            }
        });
    }

    masterTabs.forEach(function(tab) {
        tab.addEventListener('click', function(e) {
            e.preventDefault();
            var targetId = this.getAttribute('data-target');
            activateTab(targetId);
        });
    });

    if (window.location.hash === '#cities') {
        activateTab('#tab-city-hubs');
    } else if (window.location.hash === '#airport' || window.location.hash === '#airports') {
        activateTab('#tab-airport-transfers');
    }
});
</script>
</body>
</html>

