<?php
/**
 * Regenerates sitemap.xml from the live cities.json / routes.json / themes.json data.
 * Run via CLI: php engine/generate-sitemap.php
 *
 * The old sitemap.xml was a one-off static export (last built manually) that never
 * tracked new cities/routes added since. This walks the same data files the site
 * itself uses to render pages, so the sitemap always matches what actually exists.
 */

$root = dirname(__DIR__);
$base = 'https://dropcars.in';

function loadJson(string $path) {
    if (!is_file($path)) {
        return [];
    }
    $data = json_decode((string) file_get_contents($path), true);
    return is_array($data) ? $data : [];
}

$cities = loadJson($root . '/data/cities.json');
$routesData = loadJson($root . '/data/routes.json');
$routes = $routesData['routes'] ?? [];
$themes = loadJson($root . '/data/themes.json');

$allowedRegions = ['TN', 'KA', 'KL', 'AP', 'PY', 'TS', 'MH', 'GA'];
$citySlugs = [];
foreach ($cities as $c) {
    $region = strtoupper((string) ($c['region'] ?? ''));
    $slug = strtolower((string) ($c['slug'] ?? ''));
    if ($slug === '' || !in_array($region, $allowedRegions, true)) {
        continue;
    }
    if ($region === 'TS' && $slug !== 'hyderabad') {
        continue;
    }
    $citySlugs[] = $slug;
}
$citySlugs = array_values(array_unique($citySlugs));

$themeSlugs = [];
foreach ($themes as $t) {
    $slug = (string) ($t['slug'] ?? $t['id'] ?? '');
    if ($slug !== '' && $slug !== 'drop-cars') {
        $themeSlugs[] = $slug;
    }
}
$themeSlugs = array_values(array_unique($themeSlugs));

$urls = [];
$add = function (string $path, string $freq = 'weekly') use (&$urls, $base) {
    $urls[] = $base . $path . '|' . $freq;
};

// Homepage + static marketing pages
$add('/', 'weekly');
foreach ([
    'pages/contact.html',
    'pages/driver-partner.php',
    'pages/vendor-partner.php',
    'pages/fleet-partner.php',
    'pages/payment-policy.html',
    'pages/refund-policy.html',
    'pages/privacy.html',
    'pages/terms.html',
] as $page) {
    $add('/' . $page, 'monthly');
}

// Drop-cars native (root-level) city + route pages
foreach ($citySlugs as $slug) {
    $add('/' . $slug, 'weekly');
}

// Route pages: engine/route.php serves a valid, indexable page for ANY two
// city slugs (distance/fare resolved dynamically via the route-distance
// cache/API if not predefined - see api/route-distance.php), not just the
// pairs hand-listed in data/routes.json. Previously only those ~274 curated
// pairs made it into the sitemap, leaving the other real, crawlable
// city-pair pages undiscoverable. Generate every ordered pair from the
// city list (A->B and B->A are different pages/content) and merge in any
// custom routes.json pairs that reference a city outside that list.
$emittedRoutePairs = [];
foreach ($citySlugs as $fromSlug) {
    foreach ($citySlugs as $toSlug) {
        if ($fromSlug === $toSlug) {
            continue;
        }
        $add('/' . $fromSlug . '/' . $toSlug, 'weekly');
        $emittedRoutePairs[$fromSlug . '|' . $toSlug] = true;
    }
}
foreach ($routes as $r) {
    $from = strtolower((string) ($r['from'] ?? ''));
    $to = strtolower((string) ($r['to'] ?? ''));
    if ($from === '' || $to === '' || isset($emittedRoutePairs[$from . '|' . $to])) {
        continue;
    }
    $add('/' . $from . '/' . $to, 'weekly');
}

// Per-theme city + route pages
foreach ($themeSlugs as $theme) {
    $add('/' . $theme . '/', 'weekly');
    foreach ($citySlugs as $slug) {
        $add('/' . $theme . '/' . $slug, 'weekly');
    }
    foreach ($routes as $r) {
        $from = strtolower((string) ($r['from'] ?? ''));
        $to = strtolower((string) ($r['to'] ?? ''));
        if ($from === '' || $to === '') {
            continue;
        }
        $add('/' . $theme . '/' . $from . '-' . $to, 'weekly');
    }
}

$urls = array_values(array_unique($urls));

$xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
$xml .= '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
foreach ($urls as $entry) {
    [$loc, $freq] = explode('|', $entry);
    $xml .= '  <url><loc>' . htmlspecialchars($loc, ENT_QUOTES, 'UTF-8') . '</loc><changefreq>' . $freq . '</changefreq></url>' . "\n";
}
$xml .= '</urlset>' . "\n";

file_put_contents($root . '/sitemap.xml', $xml);

echo 'Wrote ' . count($urls) . " URLs to sitemap.xml\n";
echo '  ' . count($citySlugs) . " cities, " . count($routes) . " routes, " . count($themeSlugs) . " extra themes\n";
