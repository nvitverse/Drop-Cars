<?php
/**
 * SEO Core Engine for Drop Cars
 * Loads city and route data, provides slug matching and distance lookup.
 */

require_once __DIR__ . '/../config/env.php';

if (!function_exists('dropcars_format_duration_dynamic')) {
    function dropcars_format_duration_dynamic($distanceKm, $avgSpeed = 55) {
        $dist = (float)$distanceKm;
        if ($dist <= 0) return '0 mins';
        $rawHrs = $dist / $avgSpeed;
        $hrs = floor($rawHrs);
        $mins = (int)round(($rawHrs - $hrs) * 60);
        if ($mins === 60) {
            $hrs++;
            $mins = 0;
        }
        $out = '';
        if ($hrs > 0) {
            $out .= $hrs . ' hr' . ($hrs == 1 ? '' : 's');
        }
        if ($mins > 0) {
            if ($out !== '') $out .= ' ';
            $out .= $mins . ' min' . ($mins == 1 ? '' : 's');
        }
        return $out ?: '0 mins';
    }
}

class SEOCore {
    public $cities = [];
    public $routes = [];
    public $distanceMap = [];
    public $cachePath;
    public $cacheData = [];
    public $config = [];

    public function __construct() {
        $this->cachePath = __DIR__ . '/../data/distance_cache.json';
        $configPath = __DIR__ . '/../data/config.json';
        if (file_exists($configPath)) {
            $this->config = json_decode(file_get_contents($configPath), true);
        }
        $citiesPath = __DIR__ . '/../data/cities.json';
        $routesPath = __DIR__ . '/../data/routes.json';

        if (file_exists($citiesPath)) {
            $this->cities = json_decode(file_get_contents($citiesPath), true);
            $this->cities = array_values(array_filter($this->cities, function ($city) {
                return $this->isCityServiceable($city);
            }));
        }
        if (file_exists($routesPath)) {
            $data = json_decode(file_get_contents($routesPath), true);
            $this->routes = $data['routes'] ?? [];
            $this->distanceMap = $data['distanceMap'] ?? [];
        }
        if (file_exists($this->cachePath)) {
            $this->cacheData = json_decode(file_get_contents($this->cachePath), true);
        }
    }

    private function isCityServiceable($city) {
        $region = strtoupper((string)($city['region'] ?? ''));
        $slug = strtolower((string)($city['slug'] ?? ''));
        $allowedRegions = ['TN', 'KA', 'KL', 'AP', 'PY', 'TS', 'MH', 'GA'];
        if (!in_array($region, $allowedRegions, true)) {
            return false;
        }
        // Boundary coverage request: allow up to Hyderabad / Pune / Goa (if present in data).
        if ($region === 'TS' && $slug !== 'hyderabad') {
            return false;
        }
        return true;
    }

    private function isRouteOptionAllowed($fromSlug, $toSlug) {
        if (!$fromSlug || !$toSlug || $fromSlug === $toSlug) {
            return false;
        }
        $from = strtolower((string)$fromSlug);
        $to = strtolower((string)$toSlug);
        $isAirportException = (strpos($from, 'airport') !== false) || (strpos($to, 'airport') !== false);

        // Avoid very short route options like Bangalore <-> Hosur, unless airport-based.
        if ((($from === 'bangalore' && $to === 'hosur') || ($from === 'hosur' && $to === 'bangalore')) && !$isAirportException) {
            return false;
        }

        $routeInfo = $this->getRouteInfo($fromSlug, $toSlug, false);
        $distance = (float)($routeInfo['distanceKm'] ?? 0);
        if ($distance < 60 && !$isAirportException) {
            return false;
        }
        return true;
    }

    public function getCityBySlug($slug, $fallback = false) {
        foreach ($this->cities as $city) {
            if ($city['slug'] === $slug) return $city;
        }
        // Defense in depth: a state/UT slug (e.g. "tamil-nadu") should never
        // reach here as an unrecognised "new city" to synthesize - the
        // callers in index.php/theme-path-resolve.php already guard against
        // this, but this stops it cold regardless of caller.
        if (function_exists('dropcars_indian_state_ut_slugs') && in_array(strtolower((string) $slug), dropcars_indian_state_ut_slugs(), true)) {
            return null;
        }
        if ($fallback) {
            $words = explode('-', $slug);
            $capitalizedWords = [];
            $acronyms = ['PHC', 'SASTRA', 'IIIT', 'NIT', 'IIT', 'VIT', 'AIIMS', 'GMC', 'PSG'];
            foreach ($words as $word) {
                $upper = strtoupper($word);
                if (in_array($upper, $acronyms, true)) {
                    $capitalizedWords[] = $upper;
                } else {
                    $capitalizedWords[] = ucfirst($word);
                }
            }
            $cityName = implode(' ', $capitalizedWords);
            return [
                'city' => $cityName,
                'slug' => $slug,
                'state' => 'Tamil Nadu',
                'region' => 'TN',
                'isHub' => false,
                'airport' => (stripos($slug, 'airport') !== false),
                'status' => 'active'
            ];
        }
        return null;
    }

    public function normalizeCitySlug($slug) {
        $raw = strtolower(trim((string)$slug));
        if ($raw === '') return '';

        // Known Airport & IATA alias mapping
        if (preg_match('/\b(chennai|maa|meenambakkam)\b/i', $raw)) return 'chennai';
        if (preg_match('/\b(coimbatore|cjb|peelamedu)\b/i', $raw)) return 'coimbatore';
        if (preg_match('/\b(madurai|ixm)\b/i', $raw)) return 'madurai';
        if (preg_match('/\b(trichy|tiruchirappalli|trz)\b/i', $raw)) return 'trichy';
        if (preg_match('/\b(salem|sxv)\b/i', $raw)) return 'salem';
        if (preg_match('/\b(bangalore|bengaluru|kempegowda|blr)\b/i', $raw)) return 'bangalore';
        if (preg_match('/\b(tirupati|renigunta|tir)\b/i', $raw)) return 'tirupati';
        if (preg_match('/\b(kochi|cochin|nedumbassery|cok)\b/i', $raw)) return 'kochi';
        if (preg_match('/\b(tiruvannamalai|tvm)\b/i', $raw)) return 'tiruvannamalai';
        if (preg_match('/\b(vellore)\b/i', $raw)) return 'vellore';
        if (preg_match('/\b(pondicherry|puducherry)\b/i', $raw)) return 'pondicherry';
        if (preg_match('/\b(kanchipuram|kancheepuram)\b/i', $raw)) return 'kanchipuram';
        if (preg_match('/\b(erode)\b/i', $raw)) return 'erode';
        if (preg_match('/\b(thanjavur|tanjore)\b/i', $raw)) return 'thanjavur';

        // Strip location noise
        $cleaned = preg_replace('/-?(tamil-nadu|karnataka|kerala|andhra-pradesh|telangana|puducherry|pondicherry|india)$/i', '', $raw);
        $cleaned = preg_replace('/-?(international|domestic)?-?(airport|railway-station|bus-stand|junction)$/i', '', $cleaned);
        $cleaned = trim($cleaned, '-');

        // Check if cleaned slug matches any known city
        if ($cleaned !== '') {
            foreach ($this->cities as $city) {
                if ($city['slug'] === $cleaned) return $cleaned;
            }
        }

        return $raw;
    }

    public function getRouteInfo($fromSlug, $toSlug, $allowNetwork = true) {
        $normFrom = $this->normalizeCitySlug($fromSlug);
        $normTo   = $this->normalizeCitySlug($toSlug);

        $from = $this->getCityBySlug($normFrom, true);
        $to = $this->getCityBySlug($normTo, true);
        
        // Check predefined routes in routes.json
        foreach ($this->routes as $route) {
            $rFrom = strtolower($route['from'] ?? '');
            $rTo   = strtolower($route['to'] ?? '');
            if (($rFrom === strtolower($normFrom) || $rFrom === strtolower($fromSlug)) && 
                ($rTo === strtolower($normTo) || $rTo === strtolower($toSlug))) {
                $route['fareEstimate'] = $this->getFareEstimate($route['distanceKm'], 'SEDAN', $from, $to);
                $route['travelTime'] = dropcars_format_duration_dynamic($route['distanceKm']);
                return $route;
            }
        }

        // Check primary distance map
        $key = "{$normFrom},{$normTo}";
        $dist = $this->distanceMap[$key] ?? $this->cacheData[$key] ?? null;

        if (!$dist) {
            $keyRev = "{$normTo},{$normFrom}";
            $dist = $this->distanceMap[$keyRev] ?? $this->cacheData[$keyRev] ?? null;
        }

        $isFallback = false;

        // Try free OSRM lookup first if not found in cache/predefined map
        if (!$dist && $allowNetwork) {
            $dist = $this->fetchFreeOsrmDistance($from, $to);
        }

        // Try Google Maps Distance Matrix API as a last resort fallback if OSRM fails
        if (!$dist && $allowNetwork) {
            $dist = $this->fetchGoogleDistance($from, $to);
        }

        // Try local Haversine distance calculation as a fast non-blocking fallback
        if (!$dist) {
            $dist = $this->estimateDistanceHaversine($from, $to);
            if ($dist) {
                $this->cacheData[$key] = $dist;
                $this->saveCache();
            }
        }

        // Cache valid non-zero lookup result
        if ($dist > 0 && !isset($this->cacheData[$key])) {
            $this->cacheData[$key] = $dist;
            $this->saveCache();
        }

        return [
            'from' => $from['city'] ?? ucfirst($fromSlug),
            'to' => $to['city'] ?? ucfirst($toSlug),
            'distanceKm' => $dist,
            'travelTime' => dropcars_format_duration_dynamic($dist),
            'highway' => 'Major Highway Corridor',
            'fareEstimate' => $this->getFareEstimate($dist, 'SEDAN', $from, $to)
        ];
    }

    private function fetchGoogleDistance($from, $to) {
        $apiKey = defined('GOOGLE_MAPS_API_KEY') ? GOOGLE_MAPS_API_KEY : '';
        if (!$apiKey) {
            return null;
        }

        $fromCity = $from['city'] ?? '';
        $fromState = $from['state'] ?? '';
        $toCity = $to['city'] ?? '';
        $toState = $to['state'] ?? '';

        $origin = rawurlencode(implode(', ', array_filter([$fromCity, $fromState, 'India'])));
        $destination = rawurlencode(implode(', ', array_filter([$toCity, $toState, 'India'])));

        $url = "https://maps.googleapis.com/maps/api/distancematrix/json?origins={$origin}&destinations={$destination}&key={$apiKey}";

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 5);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode === 200 && $response) {
            $resData = json_decode($response, true);
            if (($resData['status'] ?? '') === 'OK') {
                $element = $resData['rows'][0]['elements'][0] ?? null;
                if ($element && ($element['status'] ?? '') === 'OK') {
                    $distanceMeters = $element['distance']['value'] ?? null;
                    if ($distanceMeters) {
                        return round($distanceMeters / 1000, 1);
                    }
                }
            }
        }
        return null;
    }

    private function fetchFreeOsrmDistance($from, $to) {
        $fromLat = $from['lat'] ?? null;
        $fromLng = $from['lng'] ?? null;
        $toLat = $to['lat'] ?? null;
        $toLng = $to['lng'] ?? null;

        // If coordinates are missing (dynamic fallback city), geocode them using Nominatim first!
        if (!$fromLat || !$fromLng) {
            $fromCoords = $this->geocodeCityFree($from['city'] ?? $from['slug'] ?? '');
            if ($fromCoords) {
                $fromLat = $fromCoords['lat'];
                $fromLng = $fromCoords['lng'];
            }
        }

        if (!$toLat || !$toLng) {
            $toCoords = $this->geocodeCityFree($to['city'] ?? $to['slug'] ?? '');
            if ($toCoords) {
                $toLat = $toCoords['lat'];
                $toLng = $toCoords['lng'];
            }
        }

        if (!$fromLat || !$fromLng || !$toLat || !$toLng) {
            return null;
        }

        // Call OSRM
        $url = "http://router.project-osrm.org/route/v1/driving/{$fromLng},{$fromLat};{$toLng},{$toLat}?overview=false";

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_USERAGENT, 'TataCallTaxi-Client/1.0 (tatacalltaxi.in@gmail.com)');
        curl_setopt($ch, CURLOPT_TIMEOUT, 6);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode === 200 && $response) {
            $resData = json_decode($response, true);
            if (($resData['code'] ?? '') === 'Ok' && !empty($resData['routes'])) {
                $meters = $resData['routes'][0]['distance'] ?? 0;
                if ($meters > 0) {
                    return round($meters / 1000, 1);
                }
            }
        }
        return null;
    }

    private function geocodeCityFree($cityName) {
        if (!$cityName) return null;
        $url = "https://nominatim.openstreetmap.org/search?format=json&q=" . urlencode($cityName . ", India") . "&limit=1";
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_USERAGENT, 'TataCallTaxi-Client/1.0 (tatacalltaxi.in@gmail.com)');
        curl_setopt($ch, CURLOPT_TIMEOUT, 6);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode === 200 && $response) {
            $data = json_decode($response, true);
            if (!empty($data)) {
                return [
                    'lat' => floatval($data[0]['lat']),
                    'lng' => floatval($data[0]['lon'])
                ];
            }
        }
        return null;
    }

    private function estimateDistanceHaversine($from, $to) {
        $lat1 = $from['lat'] ?? null;
        $lon1 = $from['lng'] ?? null;
        $lat2 = $to['lat'] ?? null;
        $lon2 = $to['lng'] ?? null;

        if (!$lat1 || !$lon1) {
            $fromCoords = $this->geocodeCityFree($from['city'] ?? $from['slug'] ?? '');
            if ($fromCoords) {
                $lat1 = $fromCoords['lat'];
                $lon1 = $fromCoords['lng'];
            }
        }

        if (!$lat2 || !$lon2) {
            $toCoords = $this->geocodeCityFree($to['city'] ?? $to['slug'] ?? '');
            if ($toCoords) {
                $lat2 = $toCoords['lat'];
                $lon2 = $toCoords['lng'];
            }
        }

        if ($lat1 === null || $lon1 === null || $lat2 === null || $lon2 === null) {
            return null;
        }
        $lat1 = (float)$lat1;
        $lon1 = (float)$lon1;
        $lat2 = (float)$lat2;
        $lon2 = (float)$lon2;
        
        $earthRadius = 6371; // km
        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lon2 - $lon1);
        $a = sin($dLat/2) * sin($dLat/2) +
             cos(deg2rad($lat1)) * cos(deg2rad($lat2)) *
             sin($dLon/2) * sin($dLon/2);
        $c = 2 * atan2(sqrt($a), sqrt(1-$a));
        $straight = $earthRadius * $c;
        return round($straight * 1.25, 1); // 25% circuitry factor for driving distance
    }

    private function saveCache() {
        @file_put_contents($this->cachePath, json_encode($this->cacheData, JSON_PRETTY_PRINT));
    }

    public function getFareEstimate($distance, $vehicle = 'SEDAN', $from = null, $to = null) {
        $fares = $this->config['fares'] ?? [];
        $pricingRules = $this->config['pricingRules'] ?? [];
        $rate = $fares['baseFareOneWay'][$vehicle] ?? 14;

        // Apply state-specific regional per-KM surcharges
        $fromRegion = strtoupper((string)($from['region'] ?? ''));
        $toRegion = strtoupper((string)($to['region'] ?? ''));
        $stateSurcharge = 0;
        if ($fromRegion === 'KA' || $toRegion === 'KA') {
            $stateSurcharge = max($stateSurcharge, (float)($pricingRules['stateSurcharge_KA'] ?? 0));
        }
        if ($fromRegion === 'KL' || $toRegion === 'KL') {
            $stateSurcharge = max($stateSurcharge, (float)($pricingRules['stateSurcharge_KL'] ?? 0));
        }
        if ($fromRegion === 'AP' || $toRegion === 'AP') {
            $stateSurcharge = max($stateSurcharge, (float)($pricingRules['stateSurcharge_AP'] ?? 0));
        }
        $rate += $stateSurcharge;

        $bata = $fares['driverBata'] ?? 400;
        $minDist = $fares['minDistanceOneWay'] ?? 130;
        $effDist = max((float)$distance, (float)$minDist);
        $baseFare = ($effDist * (float)$rate) + (float)$bata;

        // Apply flat interstate crossing fee if crossing state lines
        if ($fromRegion !== '' && $toRegion !== '' && $fromRegion !== $toRegion) {
            $baseFare += (float)($pricingRules['interstateSurcharge'] ?? 0);
        }

        // Apply dynamic peak hour surcharge if active and within peak hours
        if (!empty($pricingRules['peakHourSurchargeEnabled'])) {
            $currentHour = (int)date('H');
            $startHour = (int)($pricingRules['peakHourStartHour'] ?? 16);
            $endHour = (int)($pricingRules['peakHourEndHour'] ?? 20);
            
            $isPeak = false;
            if ($startHour <= $endHour) {
                $isPeak = ($currentHour >= $startHour && $currentHour < $endHour);
            } else {
                $isPeak = ($currentHour >= $startHour || $currentHour < $endHour);
            }
            
            if ($isPeak) {
                $percent = (float)($pricingRules['peakHourSurchargePercent'] ?? 0);
                $baseFare *= (1 + ($percent / 100));
            }
        }

        return round($baseFare);
    }

    public function getPopularRoutesFrom($citySlug, $limit = 6) {
        $city = $this->getCityBySlug($citySlug);
        $popular = [];
        
        if ($city && !empty($city['popularRoutes'])) {
            foreach ($city['popularRoutes'] as $targetSlug) {
                $target = $this->getCityBySlug($targetSlug);
                if ($target && $this->isRouteOptionAllowed($citySlug, $target['slug'])) {
                    $popular[] = $target;
                }
            }
        }

        // Fill up to limit with other hub cities first
        if (count($popular) < $limit) {
            foreach ($this->cities as $c) {
                if (
                    $c['slug'] !== $citySlug &&
                    !in_array($c, $popular) &&
                    ($c['isHub'] ?? false) &&
                    $this->isRouteOptionAllowed($citySlug, $c['slug'])
                ) {
                    $popular[] = $c;
                    if (count($popular) >= $limit) break;
                }
            }
        }

        // If still short, fill with remaining cities to reliably reach requested limit (e.g., 30)
        if (count($popular) < $limit) {
            foreach ($this->cities as $c) {
                if ($c['slug'] === $citySlug || in_array($c, $popular)) {
                    continue;
                }
                if (!$this->isRouteOptionAllowed($citySlug, $c['slug'])) {
                    continue;
                }
                $popular[] = $c;
                if (count($popular) >= $limit) break;
            }
        }

        return array_slice($popular, 0, $limit);
    }
}
