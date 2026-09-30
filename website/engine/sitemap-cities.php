<?php
header('Content-Type: application/xml; charset=utf-8');
require_once __DIR__ . '/../includes/paths.php';

$citiesPath = __DIR__ . '/../data/cities.json';
$cities = is_file($citiesPath) ? json_decode(file_get_contents($citiesPath), true) : [];

$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || ((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? 'dropcars.in';
$baseUrl = $scheme . '://' . $host;

$xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
$xml .= '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";

// Static Pages
$staticPages = [
    '/',
    '/about',
    '/services',
    '/airport-transfer',
    '/contact',
    '/pages/privacy.html',
    '/pages/terms.html',
    '/pages/payment-policy.html',
    '/pages/refund-policy.html',
];

foreach ($staticPages as $p) {
    $loc = $baseUrl . $p;
    $xml .= "  <url>\n";
    $xml .= "    <loc>" . htmlspecialchars($loc, ENT_XML1, 'UTF-8') . "</loc>\n";
    $xml .= "    <changefreq>monthly</changefreq>\n";
    $xml .= "    <priority>0.8</priority>\n";
    $xml .= "  </url>\n";
}

// City Hubs
if (is_array($cities)) {
    foreach ($cities as $c) {
        $slug = $c['slug'] ?? '';
        if ($slug !== '') {
            $loc = $baseUrl . '/' . $slug;
            $xml .= "  <url>\n";
            $xml .= "    <loc>" . htmlspecialchars($loc, ENT_XML1, 'UTF-8') . "</loc>\n";
            $xml .= "    <changefreq>weekly</changefreq>\n";
            $xml .= "    <priority>0.9</priority>\n";
            $xml .= "  </url>\n";
        }
    }
}

$xml .= '</urlset>';

echo trim($xml);
