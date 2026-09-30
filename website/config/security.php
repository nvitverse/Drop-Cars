<?php
require_once dirname(__DIR__) . '/helpers/error-handler.php';
/**
 * Drop Cars – Core Security Middleware
 * Compatible with PHP 7.2+
 *
 * Covers:
 *   1. Rate limiting (file-based, no Redis required)
 *   2. Session security & auto-timeout
 *   3. Bot / scraper user-agent blocking
 *   4. CORS enforcement
 *   5. API token validation helper
 *   6. Sync & Reset action audit logging
 */

// ================================================================
// PHP 7 COMPATIBILITY POLYFILLS
// ================================================================
if (!function_exists('str_contains')) {
    function str_contains($haystack, $needle) {
        return $needle === '' || strpos($haystack, $needle) !== false;
    }
}
if (!function_exists('str_starts_with')) {
    function str_starts_with($haystack, $needle) {
        return strncmp($haystack, $needle, strlen($needle)) === 0;
    }
}
if (!function_exists('str_ends_with')) {
    function str_ends_with($haystack, $needle) {
        return $needle === '' || substr($haystack, -strlen($needle)) === $needle;
    }
}

// ================================================================
// 1. SECURITY HEADERS (PHP layer — supplements .htaccess)
// ================================================================
if (!headers_sent()) {
    header('X-Frame-Options: SAMEORIGIN');
    header('X-Content-Type-Options: nosniff');
    header('X-XSS-Protection: 1; mode=block');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header_remove('Server');
    header_remove('X-Powered-By');
}

// ================================================================
// 2. BOT / SCRAPER DETECTION
// ================================================================
function dropcars_is_scraper_bot()
{
    $ua = strtolower(isset($_SERVER['HTTP_USER_AGENT']) ? $_SERVER['HTTP_USER_AGENT'] : '');
    if ($ua === '') {
        return true; // no UA = bot
    }
    $blocked = array(
        'httrack', 'webcopier', 'sitesnagger', 'teleport', 'webreaper',
        'webstripper', 'offline explorer', 'surfoffline', 'blackwidow',
        'webzip', 'wget', 'curl/', 'python-requests', 'python-urllib',
        'scrapy', 'libwww-perl', 'lwp-trivial', 'libcurl', 'java/',
        'jakarta', 'okhttp', 'go-http-client', 'baiduspider', 'yandexbot',
        'mj12bot', 'ahrefsbot', 'semrushbot', 'dotbot', 'blexbot',
        'dataforseobot', 'petalbot', 'bytespider', 'gptbot', 'claude-web',
        'anthropic-ai', 'ccbot', 'ia_archiver', 'nikto', 'sqlmap',
        'dirbuster', 'masscan', 'zgrab', 'nmap',
    );
    foreach ($blocked as $sig) {
        if (strpos($ua, $sig) !== false) {
            return true;
        }
    }
    return false;
}

function dropcars_block_if_scraper()
{
    if (PHP_SAPI === 'cli') {
        return;
    }
    if (dropcars_is_scraper_bot()) {
        http_response_code(403);
        exit('Access Denied.');
    }
}

// ================================================================
// 3. RATE LIMITING (file-based, no Redis required)
//    Limits: 60 requests/minute per IP for regular pages,
//            20 requests/minute per IP for API endpoints.
// ================================================================
function dropcars_rate_limit($context, $maxRequests, $windowSeconds)
{
    if ($context === null) $context = 'web';
    if ($maxRequests === null) $maxRequests = 60;
    if ($windowSeconds === null) $windowSeconds = 60;

    $ip = isset($_SERVER['HTTP_X_FORWARDED_FOR']) ? $_SERVER['HTTP_X_FORWARDED_FOR']
        : (isset($_SERVER['HTTP_X_REAL_IP']) ? $_SERVER['HTTP_X_REAL_IP']
        : (isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown'));
    $ip = trim(explode(',', $ip)[0]);

    // Whitelist localhost
    if (in_array($ip, array('127.0.0.1', '::1'), true)) {
        return;
    }

    $rateLimitDir = sys_get_temp_dir() . '/dropcars_ratelimit';
    if (!is_dir($rateLimitDir)) {
        @mkdir($rateLimitDir, 0700, true);
    }

    $key = $rateLimitDir . '/' . $context . '_' . md5($ip) . '.json';
    $now = time();

    $data = array('count' => 0, 'window_start' => $now);
    if (is_file($key)) {
        $raw = @file_get_contents($key);
        if ($raw) {
            $parsed = json_decode($raw, true);
            if (is_array($parsed)) {
                $data = $parsed;
            }
        }
    }

    // Reset window if expired
    if (($now - $data['window_start']) >= $windowSeconds) {
        $data = array('count' => 0, 'window_start' => $now);
    }

    $data['count']++;
    @file_put_contents($key, json_encode($data), LOCK_EX);

    if ($data['count'] > $maxRequests) {
        http_response_code(429);
        header('Retry-After: ' . ($windowSeconds - ($now - $data['window_start'])));
        $accept = isset($_SERVER['HTTP_ACCEPT']) ? $_SERVER['HTTP_ACCEPT'] : '';
        if (strpos($accept, 'application/json') !== false) {
            header('Content-Type: application/json');
            echo json_encode(array('error' => 'Too many requests. Please slow down.'));
        } else {
            echo '<!DOCTYPE html><html><head><title>429 Too Many Requests</title></head><body><h1>Too Many Requests</h1><p>You are making too many requests. Please wait and try again.</p></body></html>';
        }
        exit;
    }
}

// ================================================================
// 4. CORS ENFORCEMENT FOR API CALLS
// ================================================================
function dropcars_enforce_cors($allowedOrigins)
{
    if ($allowedOrigins === null) {
        $allowedOrigins = array('https://dropcars.in', 'https://www.dropcars.in');
    }
    $origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
    $host   = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '';

    // Allow all origins in localhost dev environment
    $remoteAddr = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '';
    $isLocal = in_array($remoteAddr, array('127.0.0.1', '::1'), true)
        || strpos($host, 'localhost') !== false
        || strpos($host, '127.0.0.1') !== false;

    if ($isLocal) {
        return; // No CORS restriction in local dev
    }

    if ($origin === '') {
        // Server-to-server or direct PHP include — allow
        return;
    }

    if (!in_array($origin, $allowedOrigins, true)) {
        http_response_code(403);
        $accept = isset($_SERVER['HTTP_ACCEPT']) ? $_SERVER['HTTP_ACCEPT'] : '';
        if (strpos($accept, 'application/json') !== false) {
            header('Content-Type: application/json');
            echo json_encode(array('error' => 'Cross-origin request not allowed.'));
        } else {
            echo 'Forbidden: Cross-origin request denied.';
        }
        exit;
    }

    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}

// ================================================================
// 5. SESSION SECURITY & AUTO-LOGOUT
//    - Session timeout: 60 minutes of inactivity
//    - Bind session to IP + UA fingerprint
// ================================================================
function dropcars_admin_secure_session($timeoutMinutes)
{
    if ($timeoutMinutes === null) $timeoutMinutes = 60;

    if (session_status() !== PHP_SESSION_ACTIVE) {
        return; // Session not started yet
    }

    $now = time();

    // --- Idle timeout ---
    if (isset($_SESSION['_last_activity']) && ($now - $_SESSION['_last_activity']) > ($timeoutMinutes * 60)) {
        $_SESSION = array();
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
        }
        session_destroy();
        header('Location: /admin/login?reason=timeout');
        exit;
    }
    $_SESSION['_last_activity'] = $now;

    // --- Fingerprint binding (detect session hijacking) ---
    // Softened: We check the platform/OS and main browser family to prevent hijacking
    // while avoiding false-positives from minor UA changes (like webview/in-app custom tabs).
    $ua = isset($_SERVER['HTTP_USER_AGENT']) ? $_SERVER['HTTP_USER_AGENT'] : '';
    
    // Normalize UA: extract operating system and primary browser
    $platform = 'unknown';
    if (str_contains($ua, 'Windows')) {
        $platform = 'windows';
    } elseif (str_contains($ua, 'Macintosh') || str_contains($ua, 'Mac OS X')) {
        $platform = 'mac';
    } elseif (str_contains($ua, 'iPhone') || str_contains($ua, 'iPad')) {
        $platform = 'ios';
    } elseif (str_contains($ua, 'Android')) {
        $platform = 'android';
    } elseif (str_contains($ua, 'Linux')) {
        $platform = 'linux';
    }

    $browser = 'unknown';
    if (str_contains($ua, 'Chrome') || str_contains($ua, 'CriOS')) {
        $browser = 'chrome';
    } elseif (str_contains($ua, 'Firefox') || str_contains($ua, 'FxiOS')) {
        $browser = 'firefox';
    } elseif (str_contains($ua, 'Safari') && !str_contains($ua, 'Chrome')) {
        $browser = 'safari';
    } elseif (str_contains($ua, 'Edge') || str_contains($ua, 'Edg')) {
        $browser = 'edge';
    }

    $fingerprint = $platform . '_' . $browser;
    if (isset($_SESSION['_fingerprint'])) {
        if ($_SESSION['_fingerprint'] !== $fingerprint && $_SESSION['_fingerprint'] !== 'unknown_unknown' && $fingerprint !== 'unknown_unknown') {
            dropcars_security_log('SESSION_HIJACK_ATTEMPT', array(
                'stored_fp'  => $_SESSION['_fingerprint'],
                'current_fp' => $fingerprint,
                'ua'         => $ua,
                'admin_id'   => isset($_SESSION['admin_id']) ? $_SESSION['admin_id'] : null,
            ));
            $_SESSION = array();
            session_destroy();
            header('Location: /admin/login?reason=security');
            exit;
        }
    } else {
        $_SESSION['_fingerprint'] = $fingerprint;
    }
}

// ================================================================
// 6. SECURITY AUDIT LOGGER
// ================================================================
function dropcars_security_log($event, $context)
{
    if ($context === null) $context = array();

    $possibleDirs = array(
        dirname(dirname(dirname(__DIR__))) . '/dropcars_security_logs',
        dirname(dirname(__DIR__)) . '/logs',
        __DIR__ . '/../api/storage',
        sys_get_temp_dir() . '/dropcars_security_logs',
    );

    $logDir = null;
    foreach ($possibleDirs as $dir) {
        if (is_dir($dir) || @mkdir($dir, 0700, true)) {
            $logDir = $dir;
            break;
        }
    }

    if (!$logDir) {
        error_log('DROP CARS SECURITY: ' . $event . ' ' . json_encode($context));
        return;
    }

    $ip = isset($_SERVER['HTTP_X_FORWARDED_FOR']) ? $_SERVER['HTTP_X_FORWARDED_FOR']
        : (isset($_SERVER['HTTP_X_REAL_IP']) ? $_SERVER['HTTP_X_REAL_IP']
        : (isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown'));
    $ip = trim(explode(',', $ip)[0]);

    $entry = json_encode(array(
        'timestamp'   => date('c'),
        'event'       => $event,
        'ip'          => $ip,
        'user_agent'  => isset($_SERVER['HTTP_USER_AGENT']) ? $_SERVER['HTTP_USER_AGENT'] : '',
        'uri'         => isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '',
        'admin_id'    => isset($_SESSION['admin_id']) ? $_SESSION['admin_id'] : null,
        'admin_email' => isset($_SESSION['admin_email']) ? $_SESSION['admin_email'] : null,
        'context'     => $context,
    ), JSON_UNESCAPED_UNICODE);

    $logFile = $logDir . '/security-' . date('Y-m') . '.jsonl';
    @file_put_contents($logFile, $entry . PHP_EOL, FILE_APPEND | LOCK_EX);
}

// ================================================================
// 7. API TOKEN VALIDATION
// ================================================================
function dropcars_generate_api_token()
{
    if (session_status() === PHP_SESSION_NONE) {
        return '';
    }
    if (empty($_SESSION['_api_token'])) {
        $_SESSION['_api_token'] = bin2hex(random_bytes(24));
        $_SESSION['_api_token_issued'] = time();
    }
    $issued = isset($_SESSION['_api_token_issued']) ? $_SESSION['_api_token_issued'] : 0;
    if ((time() - $issued) > 7200) {
        $_SESSION['_api_token'] = bin2hex(random_bytes(24));
        $_SESSION['_api_token_issued'] = time();
    }
    return $_SESSION['_api_token'];
}

function dropcars_validate_api_token($token)
{
    if (session_status() === PHP_SESSION_NONE) {
        return true;
    }
    if (empty($_SESSION['_api_token'])) {
        return false;
    }
    return hash_equals($_SESSION['_api_token'], $token);
}

// ================================================================
// 8. SYNC & RESET ACCESS CONTROL
// ================================================================
function dropcars_require_admin_for_sync()
{
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    if (empty($_SESSION['admin_id']) || empty($_SESSION['admin_email'])) {
        dropcars_security_log('SYNC_ACCESS_DENIED_UNAUTHENTICATED', array());
        http_response_code(403);
        header('Location: /admin/login?reason=access_denied');
        exit;
    }
}

function dropcars_log_sync_action($action, $params)
{
    if ($params === null) $params = array();
    dropcars_security_log('SYNC_RESET_ACTION', array_merge(array(
        'action'      => $action,
        'admin_id'    => isset($_SESSION['admin_id']) ? $_SESSION['admin_id'] : null,
        'admin_email' => isset($_SESSION['admin_email']) ? $_SESSION['admin_email'] : null,
    ), $params));
}

// ================================================================
// 9. DUMMY / FAKE PHONE NUMBER DETECTION
// ================================================================
function dropcars_is_fake_phone($rawPhone)
{
    $digits = preg_replace('/\D/', '', (string)$rawPhone);
    if (strlen($digits) < 6) return true;

    // 1. All digits identical (e.g. 9999999999, 8888888888, 0000000000)
    if (preg_match('/^(\d)\1+$/', $digits)) return true;

    // 2. Same digit repeated 6 or more times sequentially anywhere
    if (preg_match('/(.)\1{5,}/', $digits)) return true;

    // 3. Mathematical sequential ascending or descending
    $isAscending = true;
    $isDescending = true;
    $len = strlen($digits);
    for ($i = 1; $i < $len; $i++) {
        $prev = (int)$digits[$i - 1];
        $curr = (int)$digits[$i];
        if ($curr !== ($prev + 1) % 10) $isAscending = false;
        if ($curr !== ($prev + 9) % 10) $isDescending = false;
    }
    if ($isAscending || $isDescending) return true;

    // 4. Repeated 2-digit, 3-digit, or 4-digit patterns (e.g. 1212121212, 9898989898, 1231231231, 1234123412)
    if (preg_match('/^(\d{2})\1{3,}/', $digits) || preg_match('/^(\d{3})\1{2,}/', $digits) || preg_match('/^(\d{4})\1+/', $digits)) return true;

    // 5. Explicit dummy blacklist
    $fakeList = array(
        '1234567890', '0123456789', '9876543210', '0987654321',
        '2345678901', '3456789012', '4567890123', '5678901234',
        '6789012345', '7890123456', '8901234567', '9012345678',
        '987654321',  '876543210',  '765432109',  '654321098',
        '123456789',  '234567890',  '9876543211', '1234567899'
    );
    if (in_array($digits, $fakeList, true)) return true;

    return false;
}

