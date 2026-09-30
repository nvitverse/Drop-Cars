<?php
/**
 * Drop Cars – FastAPI backend bridge (curl wrapper).
 *
 * Lets the website talk to the same backend that powers the Driver/Vendor/
 * Admin apps (dropcars-review/backend), so a website booking can be posted
 * into the driver-app marketplace via the admin-approval endpoints under
 * /api/website/*. Auth is a shared secret header, not a customer/admin JWT -
 * see WEBSITE_INTEGRATION_KEY on the backend.
 *
 * Credential resolution order (same idiom as api/smtp-settings.php):
 *   DROPCARS_API_BASE_URL / DROPCARS_API_WEBSITE_KEY env → config.php
 */

if (!function_exists('dropcars_backend_config')) {
    function dropcars_backend_config(array $config): array
    {
        $baseUrl = trim((string) (getenv('DROPCARS_API_BASE_URL') ?: ($config['dropcarsApiBaseUrl'] ?? '')));
        $key     = trim((string) (getenv('DROPCARS_API_WEBSITE_KEY') ?: ($config['dropcarsApiWebsiteKey'] ?? '')));
        return ['baseUrl' => rtrim($baseUrl, '/'), 'key' => $key];
    }
}

if (!function_exists('dropcars_backend_request')) {
    /**
     * @param string     $method  'GET' | 'POST'
     * @param string     $path    e.g. '/api/website/bookings' (leading slash required)
     * @param array|null $payload JSON body for POST; ignored for GET
     * @return array{ok: bool, status: int, data: mixed, error: string}
     */
    function dropcars_backend_request(string $method, string $path, ?array $payload = null): array
    {
        $configPath = __DIR__ . '/../config.php';
        if (!is_file($configPath)) {
            $configPath = __DIR__ . '/../config.example.php';
        }
        $config = is_file($configPath) ? (include $configPath) : [];
        $backend = dropcars_backend_config($config);

        if ($backend['baseUrl'] === '' || $backend['key'] === '') {
            return ['ok' => false, 'status' => 0, 'data' => null, 'error' => 'Backend not configured (dropcarsApiBaseUrl / dropcarsApiWebsiteKey missing)'];
        }

        $normalizedPath = (strpos($path, '/api/') === 0 || $path === '/api') ? $path : ('/api' . (strpos($path, '/') === 0 ? '' : '/') . $path);
        $url = $backend['baseUrl'] . $normalizedPath;
        $ch = curl_init($url);
        $headers = [
            'Content-Type: application/json',
            'X-DropCars-Website-Key: ' . $backend['key'],
        ];

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST  => strtoupper($method),
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_CONNECTTIMEOUT => 5,
        ]);
        if ($payload !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_UNESCAPED_UNICODE));
        }

        $raw = curl_exec($ch);
        $curlError = curl_error($ch);
        $httpStatus = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($raw === false) {
            error_log('Drop Cars backend request failed: ' . $method . ' ' . $path . ' -> ' . $curlError);
            return ['ok' => false, 'status' => 0, 'data' => null, 'error' => $curlError];
        }

        $data = json_decode($raw, true);
        $ok = $httpStatus >= 200 && $httpStatus < 300;
        if (!$ok) {
            error_log('Drop Cars backend request non-2xx: ' . $method . ' ' . $path . ' -> HTTP ' . $httpStatus . ' ' . $raw);
        }
        return ['ok' => $ok, 'status' => $httpStatus, 'data' => $data, 'error' => $ok ? '' : (is_array($data) ? ($data['detail'] ?? $raw) : $raw)];
    }
}
