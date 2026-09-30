<?php
/**
 * Drop Cars - Google Maps API Key Pool & Usage Manager
 * Rotates multiple API keys with monthly request limits to maximize free tier usage ($0 cost).
 */

function get_api_keys_config_path() {
    return __DIR__ . '/storage/api_keys_config.json';
}

function load_api_keys_config() {
    $path = get_api_keys_config_path();
    $dir = dirname($path);
    if (!is_dir($dir)) {
        @mkdir($dir, 0777, true);
    }
    
    if (!is_file($path)) {
        $defaultConfig = [
            [
                'id' => 'key_default',
                'key' => getenv('GOOGLE_MAPS_API_KEY') ?: '',
                'label' => 'Default Account Key',
                'monthly_limit' => 5000,
                'used_this_month' => 0,
                'month_year' => date('Y-m'),
                'status' => 'ACTIVE'
            ]
        ];
        @file_put_contents($path, json_encode($defaultConfig, JSON_PRETTY_PRINT));
        return $defaultConfig;
    }
    
    $raw = @file_get_contents($path);
    $data = json_decode($raw, true);
    if (!is_array($data)) return [];

    $currentMonth = date('Y-m');
    $dirty = false;
    foreach ($data as &$keyObj) {
        if (($keyObj['month_year'] ?? '') !== $currentMonth) {
            $keyObj['month_year'] = $currentMonth;
            $keyObj['used_this_month'] = 0;
            if (($keyObj['status'] ?? '') === 'LIMIT_REACHED') {
                $keyObj['status'] = 'ACTIVE';
            }
            $dirty = true;
        }
    }
    if ($dirty) {
        @file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT));
    }
    return $data;
}

function save_api_keys_config($config) {
    $path = get_api_keys_config_path();
    return @file_put_contents($path, json_encode($config, JSON_PRETTY_PRINT)) !== false;
}

function get_active_google_api_key() {
    $config = load_api_keys_config();
    $currentMonth = date('Y-m');

    foreach ($config as $keyObj) {
        if (($keyObj['status'] ?? 'ACTIVE') === 'ACTIVE' && !empty($keyObj['key'])) {
            $limit = intval($keyObj['monthly_limit'] ?? 5000);
            $used = intval($keyObj['used_this_month'] ?? 0);
            if ($limit === 0 || $used < $limit) {
                return $keyObj['key'];
            }
        }
    }

    return getenv('GOOGLE_MAPS_API_KEY') ?: '';
}

function record_key_usage($usedKey, $statusOk = true) {
    if (empty($usedKey)) return;
    $config = load_api_keys_config();
    $dirty = false;

    foreach ($config as &$keyObj) {
        if (($keyObj['key'] ?? '') === $usedKey) {
            $keyObj['used_this_month'] = intval($keyObj['used_this_month'] ?? 0) + 1;
            $limit = intval($keyObj['monthly_limit'] ?? 5000);
            
            if (!$statusOk) {
                $keyObj['status'] = 'LIMIT_REACHED';
            } elseif ($limit > 0 && $keyObj['used_this_month'] >= $limit) {
                $keyObj['status'] = 'LIMIT_REACHED';
            }
            $dirty = true;
            break;
        }
    }

    if ($dirty) {
        save_api_keys_config($config);
    }
}
