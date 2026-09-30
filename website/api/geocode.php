<?php
/**
 * Drop Cars - Location Geocoding & Suggestions API
 * Proxies OpenStreetMap Nominatim and Google Geocoding with local caching and fail-safe error boundaries.
 */
ob_start();
header('Content-Type: application/json; charset=utf-8');

try {
    $envPath = __DIR__ . '/../config/env.php';
    if (is_file($envPath)) {
        require_once $envPath;
    }
    $configPath = __DIR__ . '/config.php';
    $config = is_file($configPath) ? (include $configPath) : [];

    $poolPath = __DIR__ . '/api-keys-pool.php';
    if (is_file($poolPath)) {
        require_once $poolPath;
    }

    // Check if OSM proxy is enabled in configuration (default: true)
    $osmEnabled = isset($config['enableOsmGeocodingProxy']) ? (bool)$config['enableOsmGeocodingProxy'] : true;

    function dropcars_clean_osm_display_name($place) {
        $addr = $place['address'] ?? [];
        $specific = $place['name'] ?? '';

        // If specific place name contains hyphens or road descriptors, extract clean place name (e.g. Neepathurai)
        if (preg_match('/\b([A-Z][a-z]+thurai|[A-Z][a-z]+patti|[A-Z][a-z]+galam|[A-Z][a-z]+puram|[A-Z][a-z]+bakkam|[A-Z][a-z]+kattai|[A-Z][a-z]+pett?ai)\b/i', $specific, $m)) {
            $specific = ucwords(strtolower($m[1]));
        } elseif (strpos($specific, ' - ') !== false) {
            $parts = explode(' - ', $specific);
            $specific = ucwords(strtolower(trim($parts[0])));
        }
        
        if (empty($addr)) {
            return ucwords(strtolower($specific));
        }

        $cityVal = '';
        if (!empty($addr['city']) && strcasecmp($addr['city'], $specific) !== 0) {
            $cityVal = $addr['city'];
        } elseif (!empty($addr['town']) && strcasecmp($addr['town'], $specific) !== 0) {
            $cityVal = $addr['town'];
        } elseif (!empty($addr['state_district']) && strcasecmp($addr['state_district'], $specific) !== 0) {
            $cityVal = $addr['state_district'];
        } elseif (!empty($addr['county']) && strcasecmp($addr['county'], $specific) !== 0) {
            $cityVal = $addr['county'];
        } elseif (!empty($addr['municipality']) && strcasecmp($addr['municipality'], $specific) !== 0) {
            $cityVal = $addr['municipality'];
        }

        $stateVal = $addr['state'] ?? '';

        $parts = [];
        if ($specific !== '') $parts[] = ucwords(strtolower($specific));
        if ($cityVal !== '') $parts[] = ucwords(strtolower($cityVal));
        if ($stateVal !== '') $parts[] = ucwords(strtolower($stateVal));

        $parts = array_map('trim', $parts);
        $parts = array_filter($parts);
        $parts = array_values(array_unique($parts));

        if (empty($parts)) {
            $raw = preg_replace('/,\s*India$/i', '', $place['display_name'] ?? '');
            return ucwords(strtolower($raw));
        }

        return implode(', ', $parts);
    }

    $lat = trim($_GET['lat'] ?? '');
    $lng = trim($_GET['lng'] ?? '');

    // Case 1: Reverse Geocode Coordinates (GPS Snapping)
    if ($lat !== '' && $lng !== '') {
        $results = [];
        
        // 1. Try Nominatim reverse geocode if enabled
        if ($osmEnabled) {
            $osmUrl = "https://nominatim.openstreetmap.org/reverse?format=json&lat=" . urlencode($lat) . "&lon=" . urlencode($lng) . "&addressdetails=1";
            
            $ch = curl_init($osmUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            curl_setopt($ch, CURLOPT_TIMEOUT, 5);
            
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            
            if ($httpCode === 200 && $response) {
                $place = json_decode($response, true);
                if ($place && !empty($place['display_name'])) {
                    $displayName = dropcars_clean_osm_display_name($place);
                    $state = $place['address']['state'] ?? $place['address']['region'] ?? '';
                    
                    $results = [
                        'display_name' => $displayName,
                        'lat' => floatval($place['lat']),
                        'lng' => floatval($place['lon']),
                        'state' => strtolower($state),
                        'source' => 'osm'
                    ];
                }
            }
        }
        
        // 2. Fallback: Google Reverse Geocoding
        if (empty($results)) {
            $apiKey = function_exists('get_active_google_api_key') ? get_active_google_api_key() : ($config['googleMapsApiKey'] ?? getenv('GOOGLE_MAPS_API_KEY') ?: '');
            if ($apiKey) {
                $googleUrl = "https://maps.googleapis.com/maps/api/geocode/json?latlng=" . urlencode($lat . "," . $lng) . "&key=" . $apiKey;
                $ch = curl_init($googleUrl);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_TIMEOUT, 5);
                $refHost = $_SERVER['HTTP_HOST'] ?? 'dropcars.in';
                curl_setopt($ch, CURLOPT_REFERER, 'https://' . $refHost . '/');
                
                $response = curl_exec($ch);
                $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_close($ch);
                
                if ($httpCode === 200 && $response) {
                    $googleData = json_decode($response, true);
                    $statusStr = $googleData['status'] ?? '';
                    if (function_exists('record_key_usage')) {
                        record_key_usage($apiKey, $statusStr !== 'OVER_QUERY_LIMIT' && $statusOk = ($httpCode === 200));
                    }
                    if (($googleData['status'] ?? '') === 'OK' && !empty($googleData['results'])) {
                        $place = $googleData['results'][0];
                        $displayName = $place['formatted_address'] ?? '';
                        $displayName = preg_replace('/,\s*India$/i', '', $displayName);
                        
                        $state = '';
                        if (!empty($place['address_components'])) {
                            foreach ($place['address_components'] as $comp) {
                                if (in_array('administrative_area_level_1', $comp['types'] ?? [], true)) {
                                    $state = $comp['long_name'];
                                    break;
                                }
                            }
                        }
                        
                        $results = [
                            'display_name' => $displayName,
                            'lat' => floatval($place['geometry']['location']['lat'] ?? 0),
                            'lng' => floatval($place['geometry']['location']['lng'] ?? 0),
                            'state' => strtolower($state),
                            'source' => 'google'
                        ];
                    }
                }
            }
        }
        
        ob_end_clean();
        echo json_encode($results);
        exit;
    }

    $query = trim($_GET['q'] ?? $_GET['query'] ?? '');

    if ($query === '') {
        ob_end_clean();
        echo json_encode([]);
        exit;
    }

    $queryLower = strtolower($query);
    $cacheFile = __DIR__ . '/../data/geocode_cache.json';

    if (!file_exists(dirname($cacheFile))) {
        @mkdir(dirname($cacheFile), 0755, true);
    }
    if (!file_exists($cacheFile)) {
        @file_put_contents($cacheFile, '{}');
    }

    // 1. Check local geocode cache
    $cachedResult = null;
    if (file_exists($cacheFile)) {
        $lock = @fopen($cacheFile, 'c+');
        if ($lock) {
            @flock($lock, LOCK_SH);
            $size = @filesize($cacheFile);
            $content = $size > 0 ? @fread($lock, $size) : '{}';
            $cacheData = json_decode($content, true) ?: [];
            if (isset($cacheData[$queryLower])) {
                $cachedResult = $cacheData[$queryLower];
            }
            @flock($lock, LOCK_UN);
            @fclose($lock);
        }
    }

    if ($cachedResult !== null) {
        ob_end_clean();
        echo json_encode($cachedResult);
        exit;
    }

    $results = [];

    // Helper for executing Nominatim cURL requests
    function dropcars_fetch_nominatim($qStr) {
        $osmUrl = "https://nominatim.openstreetmap.org/search?format=json&q=" . urlencode($qStr) . "&countrycodes=in&addressdetails=1&limit=5";
        $ch = curl_init($osmUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_USERAGENT, 'DropCarsTaxiApp/1.0 (support@dropcars.in)');
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Accept: application/json',
            'Accept-Language: en-US,en;q=0.9'
        ]);
        curl_setopt($ch, CURLOPT_TIMEOUT, 5);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode === 200 && $response) {
            $osmData = json_decode($response, true);
            if (is_array($osmData) && count($osmData) > 0) {
                $res = [];
                foreach ($osmData as $place) {
                    $displayName = dropcars_clean_osm_display_name($place);
                    $state = $place['address']['state'] ?? $place['address']['region'] ?? '';
                    $res[] = [
                        'display_name' => $displayName,
                        'lat' => floatval($place['lat']),
                        'lng' => floatval($place['lon']),
                        'state' => strtolower($state),
                        'source' => 'osm'
                    ];
                }
                return $res;
            }
        }
        return [];
    }

    // 2. Query Google Maps Geocoding API first if API key is present (for instant 100% accurate results)
    $apiKey = $config['googleMapsApiKey'] ?? getenv('GOOGLE_MAPS_API_KEY') ?: '';
    if (defined('GOOGLE_MAPS_API_KEY') && (string)GOOGLE_MAPS_API_KEY !== '') {
        $apiKey = (string)GOOGLE_MAPS_API_KEY;
    }

    if ($apiKey !== '') {
        $queriesToTry = [
            $query . ", Tamil Nadu, India",
            $query . ", India"
        ];
        foreach ($queriesToTry as $gQ) {
            $googleUrl = "https://maps.googleapis.com/maps/api/geocode/json?address=" . urlencode($gQ) . "&components=country:IN&region=in&key=" . $apiKey;
            $ch = curl_init($googleUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 4);
            $refHost = $_SERVER['HTTP_HOST'] ?? 'dropcars.in';
            curl_setopt($ch, CURLOPT_REFERER, 'https://' . $refHost . '/');
            
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            
            if ($httpCode === 200 && $response) {
                $googleData = json_decode($response, true);
                if (($googleData['status'] ?? '') === 'OK' && !empty($googleData['results'])) {
                    foreach ($googleData['results'] as $place) {
                        $displayName = $place['formatted_address'] ?? '';
                        $displayName = preg_replace('/,\s*India$/i', '', $displayName);
                        
                        $state = '';
                        if (!empty($place['address_components'])) {
                            foreach ($place['address_components'] as $comp) {
                                if (in_array('administrative_area_level_1', $comp['types'] ?? [], true)) {
                                    $state = $comp['long_name'];
                                    break;
                                }
                            }
                        }
                        
                        $results[] = [
                            'display_name' => $displayName,
                            'lat' => floatval($place['geometry']['location']['lat'] ?? 0),
                            'lng' => floatval($place['geometry']['location']['lng'] ?? 0),
                            'state' => strtolower($state),
                            'source' => 'google'
                        ];
                    }
                    if (count($results) > 0) break;
                }
            }
        }
    }

    // 3. Fallback to OpenStreetMap Nominatim if Google Maps API key is missing or returns 0 results
    if (count($results) === 0 && $osmEnabled) {
        $results = dropcars_fetch_nominatim($query);
        if (count($results) === 0) {
            $results = dropcars_fetch_nominatim($query . ", Tamil Nadu, India");
        }
        if (count($results) === 0) {
            $altQ = '';
            if (preg_match('/^neep/i', $query)) {
                $altQ = 'Neepathurai';
            } elseif (preg_match('/^naid/i', $query)) {
                $altQ = 'Naidumangalam';
            } elseif (preg_match('/^cheng/i', $query) || preg_match('/^cgm/i', $query)) {
                $altQ = 'Chengam';
            } elseif (preg_match('/varm$/i', $query) || preg_match('/varm\b/i', $query)) {
                $altQ = preg_replace('/varm\b/i', 'varam', $query);
            } elseif (preg_match('/purm$/i', $query)) {
                $altQ = preg_replace('/purm$/i', 'puram', $query);
            } elseif (preg_match('/bkm$/i', $query)) {
                $altQ = preg_replace('/bkm$/i', 'bakkam', $query);
            }
            if ($altQ !== '') {
                $results = dropcars_fetch_nominatim($altQ);
            }
        }
    }

    // Filter out unworthy/unrelated results that do not match the query
    if (count($results) > 0 && $query !== '') {
        $qLower = strtolower($query);
        $qClean = preg_replace('/[^a-z0-9]/', '', $qLower);
        
        $results = array_values(array_filter($results, function($item) use ($qLower, $qClean, $altQ) {
            $nameLower = strtolower($item['display_name'] ?? '');
            $nameClean = preg_replace('/[^a-z0-9]/', '', $nameLower);
            
            if ($altQ !== '' && strpos($nameLower, strtolower($altQ)) !== false) return true;
            if (strpos($nameLower, $qLower) !== false) return true;
            if (strlen($qClean) >= 4 && strpos($nameClean, substr($qClean, 0, 4)) !== false) return true;
            
            $qWords = array_filter(explode(' ', preg_replace('/[^a-z0-9\s]/', ' ', $qLower)));
            $nameWords = array_filter(explode(' ', preg_replace('/[^a-z0-9\s]/', ' ', $nameLower)));
            
            foreach ($qWords as $qw) {
                if (strlen($qw) < 3) continue;
                foreach ($nameWords as $nw) {
                    if (strpos($nw, $qw) === 0 || strpos($qw, $nw) === 0) return true;
                    if (strlen($qw) >= 4 && strlen($nw) >= 4 && levenshtein($qw, $nw) <= 2) return true;
                }
            }
            return false;
        }));
    }

    // Priority state & relevance sorting for Drop Cars (Tamil Nadu & Puducherry Top Priority)
    if (count($results) > 1) {
        usort($results, function($a, $b) use ($query) {
            $aState = strtolower($a['state'] ?? '');
            $bState = strtolower($b['state'] ?? '');

            $getStateRank = function($s) {
                if (strpos($s, 'tamil nadu') !== false || strpos($s, 'puducherry') !== false || strpos($s, 'pondicherry') !== false) return 1;
                if (in_array($s, ['karnataka', 'kerala', 'andhra pradesh', 'telangana'])) return 2;
                return 3;
            };

            $rA = $getStateRank($aState);
            $rB = $getStateRank($bState);
            if ($rA !== $rB) return $rA - $rB;

            $qLower = strtolower($query);
            $aPrefix = strpos(strtolower($a['display_name']), $qLower) === 0;
            $bPrefix = strpos(strtolower($b['display_name']), $qLower) === 0;
            if ($aPrefix && !$bPrefix) return -1;
            if (!$aPrefix && $bPrefix) return 1;

            return 0;
        });
    }

    // 4. Save results to local JSON cache
    if (count($results) > 0 && file_exists($cacheFile)) {
        $lock = @fopen($cacheFile, 'c+');
        if ($lock) {
            @flock($lock, LOCK_EX);
            $size = @filesize($cacheFile);
            $content = $size > 0 ? @fread($lock, $size) : '{}';
            $cacheData = json_decode($content, true) ?: [];
            
            $cacheData[$queryLower] = $results;
            
            @ftruncate($lock, 0);
            @rewind($lock);
            @fwrite($lock, json_encode($cacheData, JSON_PRETTY_PRINT));
            @fflush($lock);
            @flock($lock, LOCK_UN);
            @fclose($lock);
        }
    }

    ob_end_clean();
    echo json_encode($results);
    exit;

} catch (Throwable $e) {
    @ob_end_clean();
    // Silent fail-safe: return empty array instead of 500 error
    echo json_encode([]);
    exit;
}
