<?php
/**
 * Drop Cars - Route Distance & Memory Cache Engine
 * Checks server memory (data/routes_cache.json & DB) for route distances.
 * Serves repeat route searches with $0 Google Maps API cost.
 */
ob_start();
header('Content-Type: application/json; charset=utf-8');

try {
    $rawInput = json_decode(file_get_contents('php://input'), true);
    $inputData = is_array($rawInput) ? array_merge($_REQUEST, $rawInput) : $_REQUEST;

    $pickup = $inputData['pickup'] ?? $inputData['origin'] ?? '';
    if (is_array($pickup)) {
        $pickup = $pickup['address'] ?? $pickup['placeId'] ?? '';
    }
    $drop = $inputData['drop'] ?? $inputData['destination'] ?? '';
    if (is_array($drop)) {
        $drop = $drop['address'] ?? $drop['placeId'] ?? '';
    }

    $pickup = trim((string)$pickup);
    $drop   = trim((string)$drop);

    if ($pickup === '' || $drop === '') {
        ob_end_clean();
        echo json_encode(['success' => false, 'error' => 'Missing pickup or drop location']);
        exit;
    }

    function dropcars_slugify_str($str) {
        $str = strtolower(trim($str));
        $str = preg_replace('/[^\w\s-]/', '', $str);
        $str = preg_replace('/[\s_-]+/', '-', $str);
        return trim($str, '-');
    }

    $pickupSlug = dropcars_slugify_str($pickup);
    $dropSlug   = dropcars_slugify_str($drop);
    $cacheKey   = $pickupSlug . '_' . $dropSlug;
    $reverseKey = $dropSlug . '_' . $pickupSlug;

    $cacheFile = __DIR__ . '/../data/routes_cache.json';
    if (!file_exists(dirname($cacheFile))) {
        @mkdir(dirname($cacheFile), 0755, true);
    }
    if (!file_exists($cacheFile)) {
        @file_put_contents($cacheFile, '{}');
    }

    require_once __DIR__ . '/../engine/seo-core.php';
    $seoCore = new SEOCore();
    $normPickup = $seoCore->normalizeCitySlug($pickupSlug);
    $normDrop   = $seoCore->normalizeCitySlug($dropSlug);
    $rInfo = $seoCore->getRouteInfo($normPickup, $normDrop);
    if (!$rInfo || empty($rInfo['distanceKm'])) {
        $rInfo = $seoCore->getRouteInfo($pickupSlug, $dropSlug);
    }

    if ($rInfo && !empty($rInfo['distanceKm']) && $rInfo['distanceKm'] > 0) {
        $distKm = (float)$rInfo['distanceKm'];
        $durText = $rInfo['travelTime'] ?? dropcars_format_duration_dynamic($distKm);
        
        ob_end_clean();
        echo json_encode([
            'success' => true,
            'source' => 'seo_core_engine',
            'cached' => true,
            'distance_km' => $distKm,
            'distanceMeters' => round($distKm * 1000),
            'duration_text' => $durText,
            'duration' => $durText,
            'pickup' => $rInfo['from'] ?? $pickup,
            'drop' => $rInfo['to'] ?? $drop,
            'pickup_slug' => $pickupSlug,
            'drop_slug' => $dropSlug,
            'share_url' => '/' . $pickupSlug . '-' . $dropSlug
        ]);
        exit;
    }

    // 2. Not in memory: Geocode endpoints & calculate distance
    function dropcars_fetch_coords($query) {
        $clean = urlencode($query . ', India');
        $url = "https://nominatim.openstreetmap.org/search?format=json&q={$clean}&limit=1";
        
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_USERAGENT, 'DropCars-DistanceEngine/1.0 (support@dropcars.in)');
        curl_setopt($ch, CURLOPT_TIMEOUT, 5);
        $res = curl_exec($ch);
        $http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($http === 200 && $res) {
            $json = json_decode($res, true);
            if (is_array($json) && !empty($json[0])) {
                return [
                    'lat' => floatval($json[0]['lat']),
                    'lng' => floatval($json[0]['lon']),
                    'state' => strtolower($json[0]['address']['state'] ?? '')
                ];
            }
        }
        return null;
    }

    function dropcars_osrm_road_distance($lat1, $lon1, $lat2, $lon2) {
        $url = "https://router.project-osrm.org/route/v1/driving/{$lon1},{$lat1};{$lon2},{$lat2}?overview=false";
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_USERAGENT, 'DropCars-DistanceEngine/1.0 (support@dropcars.in)');
        curl_setopt($ch, CURLOPT_TIMEOUT, 6);
        $res = curl_exec($ch);
        $http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($http === 200 && $res) {
            $json = json_decode($res, true);
            if (isset($json['routes'][0]['distance']) && $json['routes'][0]['distance'] > 0) {
                $meters = (float)$json['routes'][0]['distance'];
                $seconds = (float)($json['routes'][0]['duration'] ?? 0);
                $hrs = floor($seconds / 3600);
                $mins = round(($seconds % 3600) / 60);
                $durText = ($hrs > 0 ? "{$hrs} hrs " : "") . "{$mins} mins";

                return [
                    'km' => round($meters / 1000),
                    'duration' => $durText
                ];
            }
        }
        return null;
    }

    function dropcars_haversine_km($lat1, $lon1, $lat2, $lon2) {
        $r = 6371; // Earth radius in KM
        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lon2 - $lon1);
        $a = sin($dLat / 2) * sin($dLat / 2) +
             cos(deg2rad($lat1)) * cos(deg2rad($lat2)) *
             sin($dLon / 2) * sin($dLon / 2);
        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));
        // Add 25% multiplier for actual road driving distance approximation vs straight line
        return round($r * $c * 1.25);
    }

    $pCoords = dropcars_fetch_coords($pickup);
    $dCoords = dropcars_fetch_coords($drop);

    if (!$pCoords || !$dCoords) {
        $invalidField = !$pCoords ? 'pickup' : 'drop';
        $invalidName = !$pCoords ? $pickup : $drop;

        ob_end_clean();
        echo json_encode([
            'success' => false,
            'error' => "Invalid " . ($invalidField === 'pickup' ? 'pickup' : 'drop') . " location '{$invalidName}'. Please select a valid location from suggestions.",
            'invalid_field' => $invalidField
        ]);
        exit;
    }

    $distKm = 0;
    $durText = '';
    $osrmRes = dropcars_osrm_road_distance($pCoords['lat'], $pCoords['lng'], $dCoords['lat'], $dCoords['lng']);
    if ($osrmRes && $osrmRes['km'] > 0) {
        $distKm = $osrmRes['km'];
        $durText = $osrmRes['duration'];
    } else {
        $distKm = dropcars_haversine_km($pCoords['lat'], $pCoords['lng'], $dCoords['lat'], $dCoords['lng']);
    }

    if ($distKm <= 0) {
        ob_end_clean();
        echo json_encode([
            'success' => false,
            'error' => "Could not calculate driving route between selected locations. Please select a valid pickup and drop location.",
            'invalid_field' => 'drop'
        ]);
        exit;
    }

    if (!$durText) {
        $hrs = floor($distKm / 50);
        $mins = round(($distKm % 50) * 1.2);
        $durText = ($hrs > 0 ? "{$hrs} hrs " : "") . "{$mins} mins";
    }

    $routePayload = [
        'pickup' => $pickup,
        'drop' => $drop,
        'pickup_slug' => $pickupSlug,
        'drop_slug' => $dropSlug,
        'distance_km' => $distKm,
        'duration_text' => $durText,
        'pickup_coords' => $pCoords,
        'drop_coords' => $dCoords,
        'created_at' => date('Y-m-d H:i:s')
    ];

    // 3. Save to server memory (routes_cache.json)
    $lock = @fopen($cacheFile, 'c+');
    if ($lock) {
        @flock($lock, LOCK_EX);
        $size = @filesize($cacheFile);
        $content = $size > 0 ? @fread($lock, $size) : '{}';
        $allCache = json_decode($content, true) ?: [];
        
        $allCache[$cacheKey] = $routePayload;
        
        @ftruncate($lock, 0);
        @rewind($lock);
        @fwrite($lock, json_encode($allCache, JSON_PRETTY_PRINT));
        @fflush($lock);
        @flock($lock, LOCK_UN);
        @fclose($lock);
    }

    // Also auto-append new cities to cities.json if not present
    $citiesFile = __DIR__ . '/../data/cities.json';
    if (file_exists($citiesFile)) {
        $cLock = @fopen($citiesFile, 'c+');
        if ($cLock) {
            @flock($cLock, LOCK_EX);
            $cSize = @filesize($citiesFile);
            $cContent = $cSize > 0 ? @fread($cLock, $cSize) : '[]';
            $citiesList = json_decode($cContent, true) ?: [];
            $existingSlugs = array_column($citiesList, 'slug');

            $updated = false;
            if (!in_array($pickupSlug, $existingSlugs, true)) {
                $citiesList[] = [
                    'city' => ucwords(str_replace('-', ' ', $pickupSlug)),
                    'slug' => $pickupSlug,
                    'state' => ucwords($pCoords['state'] ?? 'Tamil Nadu'),
                    'lat' => $pCoords['lat'] ?? 13.0827,
                    'lng' => $pCoords['lng'] ?? 80.2707,
                    'priority' => 50
                ];
                $updated = true;
            }
            if (!in_array($dropSlug, $existingSlugs, true)) {
                $citiesList[] = [
                    'city' => ucwords(str_replace('-', ' ', $dropSlug)),
                    'slug' => $dropSlug,
                    'state' => ucwords($dCoords['state'] ?? 'Tamil Nadu'),
                    'lat' => $dCoords['lat'] ?? 13.0827,
                    'lng' => $dCoords['lng'] ?? 80.2707,
                    'priority' => 50
                ];
                $updated = true;
            }

            if ($updated) {
                @ftruncate($cLock, 0);
                @rewind($cLock);
                @fwrite($cLock, json_encode($citiesList, JSON_PRETTY_PRINT));
                @fflush($cLock);
            }
            @flock($cLock, LOCK_UN);
            @fclose($cLock);
        }
    }

    ob_end_clean();
    echo json_encode([
        'success' => true,
        'source' => 'calculated_and_cached',
        'cached' => false,
        'distance_km' => $distKm,
        'distanceMeters' => round($distKm * 1000),
        'duration_text' => $durText,
        'duration' => $durText,
        'pickup' => $pickup,
        'drop' => $drop,
        'pickup_slug' => $pickupSlug,
        'drop_slug' => $dropSlug,
        'share_url' => '/drop-cars/' . $pickupSlug . '-to-' . $dropSlug
    ]);
    exit;

} catch (Throwable $e) {
    @ob_end_clean();
    echo json_encode([
        'success' => false,
        'error' => 'Route calculation note: ' . $e->getMessage()
    ]);
    exit;
}
