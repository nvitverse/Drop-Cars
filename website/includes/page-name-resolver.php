<?php
/**
 * Drop Cars – Page Name and Source Normalizer Helper
 */

defined('DROP_CARS_SAFE') || define('DROP_CARS_SAFE', true);

/**
 * Standardize Traffic Source to "Google Ads" or "Organic" (or "Admin" for admin bookings).
 */
function dropcars_normalize_source(?string $source, ?string $gclid = null, ?string $utmSource = null, ?string $utmMedium = null): string
{
    $s = strtolower(trim((string) $source));
    $uSrc = strtolower(trim((string) $utmSource));
    $uMed = strtolower(trim((string) $utmMedium));
    $g = trim((string) $gclid);

    if ($s === 'admin') {
        return 'Admin';
    }

    $isGoogleAds = ($g !== '') ||
        (strpos($s, 'google') !== false && (strpos($s, 'ad') !== false || strpos($s, 'cpc') !== false || strpos($s, 'ppc') !== false)) ||
        (strpos($uSrc, 'google') !== false && ($uMed === 'cpc' || $uMed === 'ppc' || strpos($uMed, 'ad') !== false)) ||
        ($uSrc === 'gads' || $uSrc === 'google-ads' || $uSrc === 'google_ads') ||
        ($uMed === 'cpc' || $uMed === 'ppc');

    return $isGoogleAds ? 'Google Ads' : 'Organic';
}

/**
 * Resolve human-readable Page Name and airport detection from page URL/path.
 *
 * @return array{name: string, path: string, isAirport: bool}
 */
function dropcars_resolve_page_name(?string $sourcePage, ?string $pageUrl = '', ?string $serviceType = '', ?string $pageTitle = ''): array
{
    $raw = trim((string) ($sourcePage ?: $pageUrl));
    $path = '';

    if ($raw !== '') {
        $parsed = parse_url($raw);
        $path = $parsed['path'] ?? $raw;
    }

    $pathClean = preg_replace('#/booknow/?$#i', '', $path);
    if ($pathClean === '' || $pathClean === '/') {
        $pathClean = '/';
    }

    $sType = strtolower(trim((string) $serviceType));
    // Airport-type SELECTION (used below only for subject-tag/badge purposes
    // by callers) is a different thing from actually being ON the airport
    // landing page. These used to be the same flag, which mislabeled every
    // airport-type enquiry/booking submitted from the home page (or any
    // other page's own service dropdown) as if it came from the dedicated
    // Airport Transfer page - the source-page name must only reflect where
    // the customer actually was.
    $isAirportService = ($sType === 'airport_transfer');
    $isOnAirportPage = (stripos($pathClean, 'airport') !== false) ||
        (stripos((string) $pageTitle, 'airport') !== false);

    if ($isOnAirportPage) {
        $name = '✈️ Airport Taxi Transfer Page';
    } elseif ($pathClean === '/') {
        $name = '🏠 Home Page';
    } elseif (preg_match('#^/drop-cars/([a-z0-9-]+)-to-([a-z0-9-]+)$#i', $pathClean, $m)) {
        $pCity = ucwords(str_replace('-', ' ', $m[1]));
        $dCity = ucwords(str_replace('-', ' ', $m[2]));
        $name = "🚖 {$pCity} to {$dCity} Route Page";
    } elseif (preg_match('#^/drop-cars/([a-z0-9-]+)$#i', $pathClean, $m)) {
        $cCity = ucwords(str_replace('-', ' ', $m[1]));
        $name = "🏙️ {$cCity} Taxi Page";
    } elseif ($pageTitle !== '' && $pageTitle !== 'N/A') {
        $name = '📄 ' . strip_tags($pageTitle);
    } else {
        $name = '📄 ' . ($pathClean !== '/' ? ltrim($pathClean, '/') : 'Home Page');
    }

    return [
        'name' => $name,
        'path' => $pathClean,
        'isAirport' => $isAirportService,
    ];
}
