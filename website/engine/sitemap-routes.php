<?php
header('Content-Type: application/xml; charset=utf-8');
require_once __DIR__ . '/../includes/paths.php';

$routesPath = __DIR__ . '/../data/routes.json';
$routesData = is_file($routesPath) ? json_decode(file_get_contents($routesPath), true) : [];
$routesList = $routesData['routes'] ?? [];

$citiesPath = __DIR__ . '/../data/cities.json';
$cities = is_file($citiesPath) ? json_decode(file_get_contents($citiesPath), true) : [];

$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || ((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? 'dropcars.in';
$baseUrl = $scheme . '://' . $host;

$xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
$xml .= '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";

$addedRoutes = [];

// 1. Predefined routes from routes.json
foreach ($routesList as $r) {
    $slug = $r['slug'] ?? '';
    if ($slug !== '' && !isset($addedRoutes[$slug])) {
        $addedRoutes[$slug] = true;
        $loc = $baseUrl . '/' . $slug;
        $xml .= "  <url>\n";
        $xml .= "    <loc>" . htmlspecialchars($loc, ENT_XML1, 'UTF-8') . "</loc>\n";
        $xml .= "    <changefreq>weekly</changefreq>\n";
        $xml .= "    <priority>0.8</priority>\n";
        $xml .= "  </url>\n";
    }
}

// 2. Hub city popular routes combinations
$hubCities = [];
foreach ($cities as $c) {
    if (!empty($c['isHub']) && isset($c['slug'])) {
        $hubCities[] = $c;
    }
}

foreach ($hubCities as $hub) {
    $fromSlug = $hub['slug'];
    $popularList = $hub['popularRoutes'] ?? [];
    foreach ($popularList as $toSlug) {
        $rSlug = $fromSlug . '-' . $toSlug;
        if (!isset($addedRoutes[$rSlug])) {
            $addedRoutes[$rSlug] = true;
            $loc = $baseUrl . '/' . $rSlug;
            $xml .= "  <url>\n";
            $xml .= "    <loc>" . htmlspecialchars($loc, ENT_XML1, 'UTF-8') . "</loc>\n";
            $xml .= "    <changefreq>weekly</changefreq>\n";
            $xml .= "    <priority>0.7</priority>\n";
            $xml .= "  </url>\n";
        }
    }
}

$xml .= '</urlset>';

echo trim($xml);
