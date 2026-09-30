<?php
/**
 * Router for PHP Built-in Server
 * Mimics .htaccess rules for local development.
 */

require_once __DIR__ . '/includes/paths.php';
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';
$uri = urldecode($uri);
$bp = dropcars_base_path();
if ($bp !== '' && $bp !== '/') {
    if ($uri === $bp || strpos($uri, $bp . '/') === 0) {
        $uri = substr($uri, strlen($bp)) ?: '/';
    }
}

$file = __DIR__ . $uri;

// Serve physical static files immediately if they exist on disk
if ($uri !== '/' && file_exists($file) && !is_dir($file)) {
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    if ($ext === 'apk') {
        header('Content-Type: application/vnd.android.package-archive');
        header('Content-Disposition: attachment; filename="' . basename($file) . '"');
        header('Content-Length: ' . filesize($file));
        readfile($file);
        exit;
    }
    return false;
}

$query = $_SERVER['QUERY_STRING'] ?? '';
parse_str($query, $queryParams);

$subdomainCity  = dropcars_get_subdomain_city_slug();
$subdomainTheme = function_exists('dropcars_get_subdomain_theme_slug') ? dropcars_get_subdomain_theme_slug() : null;

// Was ?theme= genuinely present in the request, or are we about to synthesize
// it purely from the Host header? Matters below: when a theme is implied by
// the domain itself (real subdomain, or a local preview server spoofing one —
// see router-airporttaxi.php), index.php's own logic already strips a
// redundant /theme-slug prefix back off the URL. If block 2 below also tried
// to *add* that same prefix to "/", the two redirects would bounce forever
// (this is exactly what happened locally once host-spoofing made a theme
// subdomain reachable for the first time).
$themeWasExplicitInQuery = isset($queryParams['theme']);

if ($subdomainTheme !== null && !isset($queryParams['theme'])) {
    $_GET['theme'] = $subdomainTheme;
    $queryParams['theme'] = $subdomainTheme;
}

if (isset($queryParams['theme']) && !isset($queryParams['no_redirect'])) {
    $rawTheme = (string)$queryParams['theme'];
    $themeSlug = rtrim($rawTheme, '-');
    $isDefault = ($themeSlug === 'drop-cars' || $themeSlug === '');

    // 1. If it's a theme slug with a typo (like trailing hyphen), or it's the default theme
    if ($themeWasExplicitInQuery && ($themeSlug !== $rawTheme || $isDefault)) {
        unset($queryParams['theme']);
        if (!$isDefault) {
            $queryParams['theme'] = $themeSlug;
        }
        $newQuery = http_build_query($queryParams);

        // Homepage redirect to clean path /slug
        if ($uri === '/' || $uri === '/index.php' || $uri === '') {
            $newUrl = ($isDefault ? '/' : '/' . $themeSlug) . ($newQuery ? '?' . $newQuery : '');
        } else {
            // Other pages: just remove/normalize the theme param
            $newUrl = $uri . ($newQuery ? '?' . $newQuery : '');
        }

        if ($newUrl !== $_SERVER['REQUEST_URI']) {
            header("Location: $newUrl", true, 301);
            exit;
        }
    }

    // 2. Homepage: redirect any valid ?theme=slug to clean /slug (if not handled above)
    if ($themeWasExplicitInQuery && ($uri === '/' || $uri === '/index.php' || $uri === '') && !$isDefault) {
        unset($queryParams['theme']);
        $newQuery = http_build_query($queryParams);
        $newUrl = '/' . $themeSlug . ($newQuery ? '?' . $newQuery : '');
        header("Location: $newUrl", true, 301);
        exit;
    }
}

$file = __DIR__ . $uri;

// Serve physical static files immediately if they exist on disk
if ($uri !== '/' && file_exists($file) && !is_dir($file)) {
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    if ($ext === 'apk') {
        header('Content-Type: application/vnd.android.package-archive');
        header('Content-Disposition: attachment; filename="' . basename($file) . '"');
        header('Content-Length: ' . filesize($file));
        readfile($file);
        exit;
    }
    return false;
}

// 0. Special Pages
if ($uri === '/sitemap.xml') {
    require 'engine/sitemap.php';
    exit;
}
if ($uri === '/sitemap-cities.xml') {
    require 'engine/sitemap-cities.php';
    exit;
}
if ($uri === '/sitemap-routes.xml') {
    require 'engine/sitemap-routes.php';
    exit;
}

if ($uri === '/tariff') {
    require 'engine/tariff.php';
    exit;
}

// Customer review page opened from the trip QR: /review/{token}
if (preg_match('#^/review/([A-Za-z0-9_-]{16,80})/?$#', $uri, $reviewMatch)) {
    $_GET['token'] = $reviewMatch[1];
    require 'pages/review.php';
    exit;
}

if (in_array($uri, ['/reviews', '/pages/reviews.php', '/pages/reviews'], true)) {
    require 'pages/reviews.php';
    exit;
}
if (in_array($uri, ['/review-login', '/pages/review-login.php', '/pages/review-login'], true)) {
    require 'pages/review-login.php';
    exit;
}
if (in_array($uri, ['/customer-login', '/pages/customer-login.php', '/pages/customer-login'], true)) {
    require 'pages/customer-login.php';
    exit;
}
if (in_array($uri, ['/dashboard', '/pages/customer-dashboard.php', '/pages/customer-dashboard'], true)) {
    require 'pages/customer-dashboard.php';
    exit;
}
if (in_array($uri, ['/logout', '/pages/logout.php', '/pages/logout'], true)) {
    require 'pages/logout.php';
    exit;
}

if (in_array($uri, ['/driver-partner', '/driver-partner.php', '/driver-partner.html', '/pages/driver-partner', '/pages/driver-partner.php', '/pages/driver-partner.html'], true)) {
    require 'pages/driver-partner.php';
    exit;
}
if (in_array($uri, ['/vendor-partner', '/vendor-partner.php', '/vendor-partner.html', '/pages/vendor-partner', '/pages/vendor-partner.php', '/pages/vendor-partner.html'], true)) {
    require 'pages/vendor-partner.php';
    exit;
}
if (in_array($uri, ['/fleet-partner', '/fleet-partner.php', '/fleet-partner.html', '/pages/fleet-partner', '/pages/fleet-partner.php', '/pages/fleet-partner.html'], true)) {
    require 'pages/fleet-partner.php';
    exit;
}

if (in_array($uri, ['/privacy', '/pages/privacy.html', '/pages/privacy.php', '/pages/privacy'], true)) {
    require 'pages/privacy.php';
    exit;
}
if (in_array($uri, ['/terms', '/pages/terms.html', '/pages/terms.php', '/pages/terms'], true)) {
    require 'pages/terms.php';
    exit;
}
if (in_array($uri, ['/payment-policy', '/pages/payment-policy.html', '/pages/payment-policy.php', '/pages/payment-policy'], true)) {
    require 'pages/payment-policy.php';
    exit;
}
if (in_array($uri, ['/refund-policy', '/pages/refund-policy.html', '/pages/refund-policy.php', '/pages/refund-policy'], true)) {
    require 'pages/refund-policy.php';
    exit;
}
if (in_array($uri, ['/driver-agreement', '/pages/driver-agreement.html', '/pages/driver-agreement.php', '/pages/driver-agreement'], true)) {
    require 'pages/driver-agreement.php';
    exit;
}
if (in_array($uri, ['/vendor-agreement', '/pages/vendor-agreement.html', '/pages/vendor-agreement.php', '/pages/vendor-agreement'], true)) {
    require 'pages/vendor-agreement.php';
    exit;
}
if (in_array($uri, ['/trust-safety', '/pages/trust-safety.html', '/pages/trust-safety.php', '/pages/trust-safety'], true)) {
    require 'pages/trust-safety.php';
    exit;
}
if (in_array($uri, ['/driver-trip', '/pages/driver-trip.html', '/pages/driver-trip.php', '/pages/driver-trip'], true)) {
    require 'pages/driver-trip.php';
    exit;
}

if (in_array($uri, ['/pages/contact.html', '/pages/contact.php', '/contact'], true)) {
    require 'pages/contact.php';
    exit;
}

// About Us page
if (in_array($uri, ['/about', '/about-us', '/pages/about-us.php', '/pages/about-us'], true)) {
    require 'pages/about-us.php';
    exit;
}

// Services page
if (in_array($uri, ['/services', '/our-services', '/pages/services.php', '/pages/services'], true)) {
    require 'pages/services.php';
    exit;
}

// Airport Transfer page
if (in_array($uri, ['/airport-transfer', '/airport-taxi', '/airport-cab', '/pages/airport-transfer.php', '/pages/airport-transfer'], true)) {
    require 'pages/airport-transfer.php';
    exit;
}

if (in_array($uri, ['/developer', '/pages/developer.php', '/pages/developer'], true)) {
    require 'pages/developer.php';
    exit;
}

if (preg_match('/^\/track-booking\/([a-zA-Z0-9]+)$/', $uri, $matches)) {
    $_GET['booking_id'] = $matches[1];
    require 'pages/track-booking.php';
    exit;
}

if (preg_match('/^\/thank-you\/([a-zA-Z0-9]+)$/', $uri, $matches)) {
    $_GET['booking_id'] = $matches[1];
    require 'pages/thank-you.php';
    exit;
}

// Blog: clean URL /blog/{slug}/ -> blog/post.php?slug={slug}
if (preg_match('#^/blog/([a-zA-Z0-9-]+)/?$#', $uri, $matches)) {
    $_GET['slug'] = $matches[1];
    require 'blog/post.php';
    exit;
}

// Admin (PHP built-in server ignores admin/.htaccess — use pretty /admin/page)
if ($uri === '/admin' || $uri === '/admin/') {
    header('Location: /admin/dashboard', true, 302);
    exit;
}
if (preg_match('#^/admin/([a-zA-Z0-9-]+)/+$#i', $uri, $adm)) {
    $queryString = $_SERVER['QUERY_STRING'] ?? '';
    header('Location: /admin/' . $adm[1] . ($queryString ? '?' . $queryString : ''), true, 301);
    exit;
}
if (preg_match('#^/admin/(?!assets/)([a-zA-Z0-9-]+)(\.php)?/?$#', $uri, $adm)) {
    $_GET['page'] = $adm[1];
    require __DIR__ . '/admin/index.php';
    exit;
}

// 1. Load theme slugs (exact path → keyword homepage)
$themesPath = __DIR__ . '/data/themes.json';
$themesData = file_exists($themesPath) ? json_decode(file_get_contents($themesPath), true) : [];
if (!is_array($themesData)) {
    $themesData = [];
}
$themes = [];
foreach ($themesData as $t) {
    if (isset($t['slug'])) {
        $themes[] = (string)$t['slug'];
    }
    if (isset($t['id'])) {
        $themes[] = (string)$t['id'];
    }
}
$themes = array_values(array_unique(array_merge($themes, ['intercity-drop-taxi', 'outstation-drop-taxi', 'city-to-city-cabs'])));

$path = trim($uri, '/');

// Load city slugs first
$citiesPath = __DIR__ . '/data/cities.json';
$citiesData = file_exists($citiesPath) ? json_decode(file_get_contents($citiesPath), true) : [];
$citySlugs = [];
if (is_array($citiesData)) {
    foreach ($citiesData as $c) {
        if (isset($c['slug']) && $c['slug'] !== '') {
            $citySlugs[] = (string)$c['slug'];
        }
    }
}

// 2. Dynamic URLs first (same priority as .htaccess rewrites — never shadowed by /drop-cars static or theme paths)
if (preg_match('/^routes\/([a-zA-Z0-9-]+)-to-([a-zA-Z0-9-]+)-taxi\.html$/', $path, $matches)) {
    $pickup = $matches[1];
    $drop = $matches[2];
    $isPredefined = in_array($pickup, $citySlugs, true) && in_array($drop, $citySlugs, true);
    $dest = $isPredefined
        ? dropcars_theme_page_url('drop-cars', $pickup, $drop)
        : dropcars_url('drop-cars/' . $pickup . '-to-' . $drop);
    header('Location: ' . $dest . ($query ? '?' . $query : ''), true, 301);
    exit;
}
if (preg_match('/^([a-zA-Z0-9-]+)-to-([a-zA-Z0-9-]+)-taxi$/', $path, $matches)) {
    $pickup = $matches[1];
    $drop = $matches[2];
    $isPredefined = in_array($pickup, $citySlugs, true) && in_array($drop, $citySlugs, true);
    $dest = $isPredefined
        ? dropcars_theme_page_url('drop-cars', $pickup, $drop)
        : dropcars_url('drop-cars/' . $pickup . '-to-' . $drop);
    header('Location: ' . $dest . ($query ? '?' . $query : ''), true, 301);
    exit;
}

// 2b. Redirect old /drop-cars/{city} → /{city}  and  /drop-cars/{city1}-{city2} → /{city1}/{city2}
if (preg_match('#^drop-cars/([a-zA-Z0-9-]+)(?:/([a-zA-Z0-9-]+))?$#', $path, $dcMatches)) {
    require_once __DIR__ . '/includes/theme-path-resolve.php';
    require_once __DIR__ . '/engine/theme-seo.php';
    $dcSecond = $dcMatches[1];
    $dcThird  = $dcMatches[2] ?? '';
    if ($dcThird === '') {
        // First check if it is a home section slug
        if (function_exists('dropcars_home_section_is_valid_slug') && dropcars_home_section_is_valid_slug($dcSecond)) {
            $newUrl = dropcars_url($dcSecond);
            $q = http_build_query(array_diff_key($queryParams, array_flip(['__theme','__path','theme'])));
            header('Location: ' . $newUrl . ($q ? '?' . $q : ''), true, 301);
            exit;
        }
        // Could be /drop-cars/city or /drop-cars/city1-city2 (hyphenated)
        $dcResolved = dropcars_resolve_theme_second_segment('drop-cars', $dcSecond, $themes, $citySlugs);
        if ($dcResolved !== null) {
            if ($dcResolved['type'] === 'city') {
                $newUrl = dropcars_theme_page_url('drop-cars', $dcResolved['city']);
            } else {
                $newUrl = dropcars_theme_page_url('drop-cars', $dcResolved['pickup'], $dcResolved['drop']);
            }
            $q = http_build_query(array_diff_key($queryParams, array_flip(['__theme','__path','theme'])));
            header('Location: ' . $newUrl . ($q ? '?' . $q : ''), true, 301);
            exit;
        }
    } else {
        // /drop-cars/pickup/drop — redirect to /pickup/drop
        if (in_array($dcSecond, $citySlugs, true) && in_array($dcThird, $citySlugs, true)) {
            $newUrl = dropcars_theme_page_url('drop-cars', $dcSecond, $dcThird);
            $q = http_build_query(array_diff_key($queryParams, array_flip(['__theme','__path','theme'])));
            header('Location: ' . $newUrl . ($q ? '?' . $q : ''), true, 301);
            exit;
        }
    }
}

// 1b. SEO Pretty URLs: /theme/city and /theme/pickup-drop
// Examples: /drop-taxi/chennai and /drop-taxi/chennai-tiruvannamalai
if ($path !== '') {
    $slashParts = array_values(array_filter(explode('/', $path), function ($p) {
        return $p !== '';
    }));

    if (count($slashParts) === 3) {
        require_once __DIR__ . '/engine/theme-seo.php';
        $themePart3 = $slashParts[0];
        $middlePart3 = $slashParts[1];
        $thirdPart = $slashParts[2];
        if (in_array($themePart3, $themes, true)) {
            require_once __DIR__ . '/includes/theme-path-resolve.php';
            $resolved3 = dropcars_resolve_theme_second_segment($themePart3, $middlePart3, $themes, $citySlugs);
            if ($resolved3 !== null) {
                if ($resolved3['type'] === 'city' && dropcars_city_section_is_valid_slug($thirdPart)) {
                    $_GET['theme'] = $themePart3;
                    $_GET['city'] = $resolved3['city'];
                    $_GET['section'] = $thirdPart;
                    require 'engine/city.php';
                    exit;
                }
                if ($resolved3['type'] === 'route' && dropcars_route_section_is_valid_slug($thirdPart)) {
                    $_GET['theme'] = $themePart3;
                    $_GET['pickup'] = $resolved3['pickup'];
                    $_GET['drop'] = $resolved3['drop'];
                    $_GET['section'] = $thirdPart;
                    require 'engine/route.php';
                    exit;
                }
            }
        }
        // Drop-cars native theme: /city1/city2/section
        if (!in_array($slashParts[0], $themes, true)
            && dropcars_is_routable_city_slug($slashParts[0], $citySlugs)
            && dropcars_is_routable_city_slug($slashParts[1], $citySlugs)) {
            require_once __DIR__ . '/engine/theme-seo.php';
            $sectionSlug3 = $slashParts[2];
            if (dropcars_route_section_is_valid_slug($sectionSlug3)) {
                $_GET['theme'] = 'drop-cars';
                $_GET['pickup'] = $slashParts[0];
                $_GET['drop'] = $slashParts[1];
                $_GET['section'] = $sectionSlug3;
                require 'engine/route.php';
                exit;
            }
            if (dropcars_city_section_is_valid_slug($sectionSlug3)) {
                $_GET['theme'] = 'drop-cars';
                $_GET['city'] = $slashParts[0];
                $_GET['section'] = $sectionSlug3;
                require 'engine/city.php';
                exit;
            }
        }
    }

    if (count($slashParts) === 2) {
        $themePart = $slashParts[0];
        $secondPart = $slashParts[1];

        // Drop-cars native theme: /pickup/drop -> 301 redirect to hyphenated /pickup-drop
        if (!in_array($themePart, $themes, true)
            && dropcars_is_routable_city_slug($themePart, $citySlugs)
            && dropcars_is_routable_city_slug($secondPart, $citySlugs)) {
            $dest = dropcars_theme_page_url('drop-cars', $themePart, $secondPart);
            $q = http_build_query(array_diff_key($queryParams, array_flip(['__theme','__path','theme'])));
            header('Location: ' . $dest . ($q ? '?' . $q : ''), true, 301);
            exit;
        }

        file_put_contents(__DIR__ . '/router_debug.log', "URI: $uri | theme: $themePart | path: $secondPart\n", FILE_APPEND);

        if (in_array($themePart, $themes, true) && $secondPart === 'cities') {
            $_GET['theme'] = $themePart;
            require __DIR__ . '/engine/cities.php';
            exit;
        }

        $homeSectionSlugs = ['booknow', 'cities', 'routes', 'guides', 'fleet', 'services', 'about', 'why-us', 'reviews', 'faq'];
        if (in_array($themePart, $themes, true) && in_array($secondPart, $homeSectionSlugs, true)) {
            require __DIR__ . '/index.php';
            exit;
        }

        require_once __DIR__ . '/includes/theme-path-resolve.php';
        $resolved = dropcars_resolve_theme_second_segment($themePart, $secondPart, $themes, $citySlugs);
        if ($resolved !== null) {
            if ($resolved['type'] === 'city') {
                $_GET['theme'] = $themePart;
                $_GET['city'] = $resolved['city'];
                require 'engine/city.php';
                exit;
            }
            if ($resolved['type'] === 'route') {
                $_GET['theme'] = $themePart;
                $_GET['pickup'] = $resolved['pickup'];
                $_GET['drop'] = $resolved['drop'];
                require 'engine/route.php';
                exit;
            }
        }
    }
}

// Try to match [theme]-[city] OR [pickup]-[drop]
$pathSegments = explode('-', $path);
$isCityHub = false;
$isNativeRoute = false;
$foundTheme = null;
$foundCity = null;
$foundPickup = null;
$foundDrop = null;

if (count($pathSegments) >= 2) {
    for ($i = count($pathSegments) - 1; $i >= 1; $i--) {
        $candidateTheme = implode('-', array_slice($pathSegments, 0, $i));
        $candidateCity = implode('-', array_slice($pathSegments, $i));
        
        if (in_array($candidateTheme, $themes, true) && in_array($candidateCity, $citySlugs, true)) {
            $isCityHub = true;
            $foundTheme = $candidateTheme;
            $foundCity = $candidateCity;
            break;
        }

        if (in_array($candidateTheme, $citySlugs, true) && in_array($candidateCity, $citySlugs, true) && $candidateTheme !== $candidateCity) {
            $isNativeRoute = true;
            $foundPickup = $candidateTheme;
            $foundDrop = $candidateCity;
            break;
        }
    }
}

if ($isNativeRoute) {
    $_GET['theme'] = 'drop-cars';
    $_GET['pickup'] = $foundPickup;
    $_GET['drop'] = $foundDrop;
    require 'engine/route.php';
    exit;
}

// Check for legacy /drop-taxi-city or /drop-taxi-from-city
if (!$isCityHub) {
    if (preg_match('/^(?:drop-taxi-from|drop-taxi|taxi-from)-([a-zA-Z0-9-]+)$/', $path, $matches)) {
        if (in_array($matches[1], $citySlugs, true)) {
            $isCityHub = true;
            $foundCity = $matches[1];
            $foundTheme = $queryParams['theme'] ?? 'drop-taxi';
        }
    }
}

// 2b. If it IS a city hub, ensure it uses the pretty /[theme]/[city] URL
if ($isCityHub) {
    $targetTheme = $queryParams['theme'] ?? $foundTheme;
    $prettyUrl = dropcars_url($targetTheme . '/' . $foundCity);
    $expectedPath = trim($prettyUrl, '/');
    
    // Check if redirect is needed (different theme or dirty path)
    if ($path !== $expectedPath || isset($queryParams['theme'])) {
        unset($queryParams['theme']);
        $q = http_build_query($queryParams);
        header('Location: ' . $prettyUrl . ($q ? '?' . $q : ''), true, 301);
        exit;
    }
    
    $_GET['theme'] = $foundTheme;
    $_GET['city'] = $foundCity;
    require 'engine/city.php';
    exit;
}
// Legacy static city URLs
if (preg_match('/^city\/([a-zA-Z0-9-]+)\.html$/', $path, $matches)) {
    $_GET['city'] = $matches[1];
    require 'engine/city.php';
    exit;
}

// 3. Keyword theme homepage (/drop-cars, /drop-taxi, …)
if ($path !== '' && in_array($path, $themes, true)) {
    require 'index.php';
    exit;
}

// 3b. Drop-cars native theme: single-segment root-level city hub
// e.g. /chennai → drop-cars city hub (only if not a theme slug)
if ($path !== '' && !in_array($path, $themes, true) && in_array($path, $citySlugs, true)) {
    $_GET['theme'] = 'drop-cars';
    $_GET['city'] = $path;
    require 'engine/city.php';
    exit;
}

if ($path === 'driver-live-location' || $path === 'driver-live-location.php') {
    require 'pages/driver-live-location.php';
    exit;
}

// Same as Apache DirectoryIndex: index.php wins over static index.html (avoid meta-refresh loop)
if ($path === 'index.html') {
    require 'index.php';
    exit;
}

// 4. If physical file or directory exists, serve it
if ($uri !== '/' && file_exists($file)) {
    if (is_dir($file)) {
        if (substr($uri, -1) !== '/') {
            header("Location: " . $uri . "/", true, 301);
            exit;
        }
        $indexFile = rtrim($file, '/') . '/index.php';
        if (file_exists($indexFile)) {
            require $indexFile;
            exit;
        }
    } else {
        $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        if ($ext === 'apk') {
            header('Content-Type: application/vnd.android.package-archive');
            header('Content-Disposition: attachment; filename="' . basename($file) . '"');
            header('Content-Length: ' . filesize($file));
            readfile($file);
            exit;
        }
    }
    return false;
}

// Default to index.php for all non-matched clean URLs (mirrors production Apache behavior)
require 'index.php';
exit;

