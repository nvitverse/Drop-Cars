<?php
header('Content-Type: application/xml; charset=utf-8');
require_once __DIR__ . '/../includes/paths.php';

$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || ((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? 'dropcars.in';
$baseUrl = $scheme . '://' . $host;

$xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
$xml .= '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
$xml .= "  <sitemap>\n";
$xml .= "    <loc>" . htmlspecialchars($baseUrl . '/sitemap-cities.xml', ENT_XML1, 'UTF-8') . "</loc>\n";
$xml .= "  </sitemap>\n";
$xml .= "  <sitemap>\n";
$xml .= "    <loc>" . htmlspecialchars($baseUrl . '/sitemap-routes.xml', ENT_XML1, 'UTF-8') . "</loc>\n";
$xml .= "  </sitemap>\n";
$xml .= '</sitemapindex>';

echo trim($xml);
