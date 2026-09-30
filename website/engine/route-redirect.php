<?php
/**
 * Dynamic SEO route redirect script for production.
 *
 * Handles two call modes:
 *
 * 1. __dc_redirect={slug}  (from .htaccess: /drop-cars/{slug} → root-level)
 *    Resolves the slug to city or pickup-drop and redirects to the new format.
 *
 * 2. pickup={x}&drop={y}  (legacy call from old /pickup-to-drop-taxi redirects)
 *    Predefined routes → /pickup/drop,  non-predefined → /drop-cars/pickup-to-drop
 */
require_once __DIR__ . '/../includes/paths.php';
require_once __DIR__ . '/../includes/theme-path-resolve.php';

$citiesPath = __DIR__ . '/../data/cities.json';
$citiesData = file_exists($citiesPath) ? json_decode(file_get_contents($citiesPath), true) : [];
$citySlugs = [];
if (is_array($citiesData)) {
    foreach ($citiesData as $c) {
        if (isset($c['slug']) && $c['slug'] !== '') {
            $citySlugs[] = (string) $c['slug'];
        }
    }
}

// Mode 1: Apache sent /drop-cars/{slug} → resolve and 301 to new root-level URL
if (isset($_GET['__dc_redirect']) && $_GET['__dc_redirect'] !== '') {
    $rawSlug = trim((string) $_GET['__dc_redirect'], '/');

    // Build a minimal themes list for the resolver
    $themesPath = __DIR__ . '/../data/themes.json';
    $themesData = file_exists($themesPath) ? json_decode(file_get_contents($themesPath), true) : [];
    $themes = [];
    if (is_array($themesData)) {
        foreach ($themesData as $t) {
            if (isset($t['slug'])) $themes[] = (string)$t['slug'];
            if (isset($t['id']))   $themes[] = (string)$t['id'];
        }
    }
    $themes = array_values(array_unique(array_merge($themes, ['intercity-drop-taxi', 'outstation-drop-taxi', 'city-to-city-cabs'])));

    // Check if it is a slash-separated /pickup/drop already
    $slugParts = explode('/', $rawSlug, 2);
    if (count($slugParts) === 2 && in_array($slugParts[0], $citySlugs, true) && in_array($slugParts[1], $citySlugs, true)) {
        $dest = dropcars_theme_page_url('drop-cars', $slugParts[0], $slugParts[1]);
    } else {
        require_once __DIR__ . '/theme-seo.php';
        if (function_exists('dropcars_home_section_is_valid_slug') && dropcars_home_section_is_valid_slug($rawSlug)) {
            $dest = dropcars_url($rawSlug);
        } else {
            // Hyphen-separated: resolve to city or route
            $resolved = dropcars_resolve_theme_second_segment('drop-cars', $rawSlug, $themes, $citySlugs);
            if ($resolved === null) {
                // Special page slugs (cities, booknow, etc.) — redirect to drop-cars homepage
                $dest = dropcars_url('/');
            } elseif ($resolved['type'] === 'city') {
                $dest = dropcars_theme_page_url('drop-cars', $resolved['city']);
            } else {
                $dest = dropcars_theme_page_url('drop-cars', $resolved['pickup'], $resolved['drop']);
            }
        }
    }

    $query = $_SERVER['QUERY_STRING'] ?? '';
    parse_str($query, $queryParams);
    unset($queryParams['__dc_redirect'], $queryParams['pickup'], $queryParams['drop']);
    $newQuery = http_build_query($queryParams);
    header('Location: ' . $dest . ($newQuery ? '?' . $newQuery : ''), true, 301);
    exit;
}

// Mode 2: legacy pickup/drop params
$pickup = $_GET['pickup'] ?? '';
$drop = $_GET['drop'] ?? '';

if ($pickup === '' || $drop === '') {
    header('HTTP/1.0 404 Not Found');
    echo '<h1>404 Not Found</h1>';
    exit;
}

$isPredefined = in_array($pickup, $citySlugs, true) && in_array($drop, $citySlugs, true);

if ($isPredefined) {
    // For the native drop-cars theme, routes use /pickup/drop
    $dest = dropcars_theme_page_url('drop-cars', $pickup, $drop);
} else {
    // Non-predefined routes still use the legacy /drop-cars/pickup-to-drop format
    $dest = dropcars_url('drop-cars/' . $pickup . '-to-' . $drop);
}

// Preserve original query parameters except route variables
$query = $_SERVER['QUERY_STRING'] ?? '';
parse_str($query, $queryParams);
unset($queryParams['pickup'], $queryParams['drop']);
$newQuery = http_build_query($queryParams);

header('Location: ' . $dest . ($newQuery ? '?' . $newQuery : ''), true, 301);
exit;
