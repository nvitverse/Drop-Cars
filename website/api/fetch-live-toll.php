<?php
/**
 * API to fetch real-time toll data from Google Routes API (V2)
 */
ob_start();
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/env.php';

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

$origin = $data['origin'] ?? '';
$destination = $data['destination'] ?? '';

if (!$origin || !$destination) {
    ob_end_clean();
    echo json_encode(['success' => false, 'message' => 'Origin/Destination missing']);
    exit;
}

// 1. Check server memory (data/routes_cache.json) for $0 API cost repeat lookups
function dropcars_slugify_str_toll($str) {
    $str = strtolower(trim($str));
    $str = preg_replace('/[^\w\s-]/', '', $str);
    $str = preg_replace('/[\s_-]+/', '-', $str);
    return trim($str, '-');
}

$pSlug = dropcars_slugify_str_toll($origin);
$dSlug = dropcars_slugify_str_toll($destination);
$cKey  = $pSlug . '_' . $dSlug;
$rKey  = $dSlug . '_' . $pSlug;

$cacheFile = __DIR__ . '/../data/routes_cache.json';
if (file_exists($cacheFile)) {
    $cacheContent = @file_get_contents($cacheFile);
    if ($cacheContent) {
        $cMap = json_decode($cacheContent, true) ?: [];
        $found = $cMap[$cKey] ?? $cMap[$rKey] ?? null;
        if ($found && !empty($found['distance_km'])) {
            ob_end_clean();
            echo json_encode([
                'success' => true,
                'source' => 'server_memory',
                'amount' => (int)($found['toll_amount'] ?? 0),
                'currency' => 'INR',
                'duration' => $found['duration_text'] ?? '',
                'distance' => floatval($found['distance_km'])
            ]);
            exit;
        }
    }
}

$apiKey = defined('GOOGLE_MAPS_API_KEY') ? GOOGLE_MAPS_API_KEY : '';
if (!$apiKey) {
    ob_end_clean();
    echo json_encode(['success' => false, 'message' => 'API Key not configured']);
    exit;
}

$url = 'https://routes.googleapis.com/directions/v2:computeRoutes';

$payload = [
    'origin' => ['address' => $origin],
    'destination' => ['address' => $destination],
    'travelMode' => 'DRIVE',
    'extraComputations' => ['TOLLS'],
    'routeModifiers' => ['tollPasses' => []]
];

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'X-Goog-Api-Key: ' . $apiKey,
    'X-Goog-FieldMask: routes.duration,routes.distanceMeters,routes.travelAdvisory.tollFare'
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode !== 200) {
    ob_end_clean();
    echo json_encode(['success' => false, 'message' => 'Routes API error (' . $httpCode . '): ' . $response]);
    exit;
}

$resData = json_decode($response, true);
$tollData = $resData['routes'][0]['travelAdvisory']['tollFare'] ?? null;
$durationVal = $resData['routes'][0]['duration'] ?? null;
$distanceMeters = $resData['routes'][0]['distanceMeters'] ?? null;

$durationText = '';
if ($durationVal) {
    $seconds = (int)rtrim($durationVal, 's');
    $hours = floor($seconds / 3600);
    $minutes = floor(($seconds % 3600) / 60);
    if ($hours > 0) {
        $durationText .= $hours . ' hr' . ($hours == 1 ? '' : 's');
    }
    if ($minutes > 0) {
        if ($durationText !== '') $durationText .= ' ';
        $durationText .= $minutes . ' min' . ($minutes == 1 ? '' : 's');
    }
    if ($durationText === '') {
        $durationText = '0 mins';
    }
}

$distanceKm = 0;
if ($distanceMeters) {
    $distanceKm = round($distanceMeters / 1000, 1);
}

ob_end_clean();
if (!empty($resData['routes'][0])) {
    if ($distanceKm > 0 && file_exists($cacheFile)) {
        $cLock = @fopen($cacheFile, 'c+');
        if ($cLock) {
            @flock($cLock, LOCK_EX);
            $cSize = @filesize($cacheFile);
            $cContent = $cSize > 0 ? @fread($cLock, $cSize) : '{}';
            $cMap = json_decode($cContent, true) ?: [];
            
            $cMap[$cKey] = [
                'distance_km' => $distanceKm,
                'duration_text' => $durationText,
                'toll_amount' => (int)($tollData['units'] ?? 0),
                'pickup' => $origin,
                'drop' => $destination,
                'updated_at' => date('Y-m-d H:i:s')
            ];
            
            @ftruncate($cLock, 0);
            @rewind($cLock);
            @fwrite($cLock, json_encode($cMap, JSON_PRETTY_PRINT));
            @flock($cLock, LOCK_UN);
            @fclose($cLock);
        }
    }

    echo json_encode([
        'success' => true,
        'amount' => (int)($tollData['units'] ?? 0),
        'currency' => $tollData['currencyCode'] ?? 'INR',
        'duration' => $durationText,
        'distance' => $distanceKm
    ]);
} else {
    echo json_encode(['success' => false, 'message' => 'No route details returned for this route.']);
}
