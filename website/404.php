<?php
require_once __DIR__ . '/includes/paths.php';

// Get the requested URL path
$path = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '/';
$ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));

// List of asset extensions to exclude from redirecting
$assetExtensions = ['css', 'js', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'woff', 'woff2', 'ttf', 'json', 'xml'];

if (in_array($ext, $assetExtensions, true)) {
    // Serve standard 404 for asset files so they don't load HTML instead of media/styles
    header("HTTP/1.0 404 Not Found");
    header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
    header("Pragma: no-cache");
    echo 'Asset not found.';
    exit;
}

// For page/URL mistakes, temporarily redirect (302 Found) to the homepage
// preserving all query params (gclid, UTM parameters, etc.) so we never lose a customer or tracking data
$query = $_SERVER['QUERY_STRING'] ?? '';
$redirectUrl = '/' . ($query !== '' ? '?' . $query : '');

header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");
header("Location: " . $redirectUrl, true, 302);
exit;
