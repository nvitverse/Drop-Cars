<?php
// Set CORS headers
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method Not Allowed']);
    exit;
}

/**
 * Returns a human-friendly short description of what a technical error means.
 */
function dropcars_get_error_description($type, $message, $url, $details) {
    $msgLower = strtolower($message);
    $typeLower = strtolower($type);

    if (strpos($msgLower, 'localstorage') !== false || strpos($msgLower, 'securityerror') !== false) {
        return "The visitor is browsing in Private/Incognito mode or has blocked cookies. The browser blocked access to localStorage. This is standard client-side behavior and does not affect the website's functionality.";
    }
    if (strpos($typeLower, 'resource_load_failure') !== false) {
        if (strpos($msgLower, 'maps.googleapis.com') !== false || strpos($msgLower, 'google.com/maps') !== false) {
            return "Google Maps script failed to load. This is usually caused by visitor ad-blockers (like uBlock Origin/AdBlock), network connectivity drops, or Google Maps API key restrictions.";
        }
        if (preg_match('/\.(png|jpg|jpeg|svg|webp|gif)/i', $msgLower)) {
            return "An image file failed to load. This is typically a temporary client-side network drop on the user's device, or the image asset might be missing on the server.";
        }
        if (strpos($msgLower, '.js') !== false) {
            return "A JavaScript file failed to load. This happens when the user's internet connection drops mid-load, or if an ad-blocker blocks a script.";
        }
        if (strpos($msgLower, '.css') !== false) {
            return "A CSS stylesheet failed to load. This is usually caused by temporary network loss on the visitor's side while downloading style assets.";
        }
        return "A page resource failed to load on the client's side (due to network loss, ad-blockers, or a missing file).";
    }
    if ($typeLower === 'js_runtime_error') {
        return "A runtime JavaScript error occurred on the user's device. This is a client-side execution hiccup and typically does not break the site for other users.";
    }
    
    return "A client-side alert was reported by the browser monitoring system.";
}

// Read raw body
$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data || empty($data['message'])) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid payload']);
    exit;
}

$type = isset($data['type']) ? trim((string)$data['type']) : 'client_error';
$message = trim((string)$data['message']);
$url = isset($data['url']) ? trim((string)$data['url']) : '';
$userAgent = isset($data['user_agent']) ? trim((string)$data['user_agent']) : '';
$details = isset($data['details']) ? $data['details'] : [];

// Basic sanitization
$type = htmlspecialchars($type, ENT_QUOTES, 'UTF-8');
$url = htmlspecialchars($url, ENT_QUOTES, 'UTF-8');

// Comprehensive check to suppress client-side adblocker/browser extension noise
$msgLower = strtolower($message);
$typeLower = strtolower($type);

// 1. Known adblocker & tracker keywords
$adblockKeywords = [
    'googletagmanager', 'googleadservices', 'googleads', 'doubleclick', 'google-analytics', 
    'analytics', 'facebook', 'fbevents', 'ublock', 'adblock', 'brave', 'adguard',
    'productlogos/translate', 'translate.svg', 'maps.googleapis.com', 'google.com/maps',
    'chrome-extension', 'moz-extension', 'safari-extension', 'localstorage', 'securityerror',
    'font', 'fontawesome', 'cdnjs', 'jsdelivr'
];

$isAdblockOrClientNoise = false;

// Check if message or URL contains adblocker / tracker / extension references
foreach ($adblockKeywords as $keyword) {
    if (strpos($msgLower, $keyword) !== false || strpos(strtolower($url), $keyword) !== false) {
        $isAdblockOrClientNoise = true;
        break;
    }
}

// 2. Resource load failures and generic JS runtime errors on client browser sessions
if ($typeLower === 'resource_load_failure' || $typeLower === 'js_runtime_error' || $typeLower === 'unhandled_promise_rejection') {
    // Only escalate if it's explicitly a critical API key or functional server error
    $isCriticalApiKey = (strpos($msgLower, 'invalidkey') !== false || strpos($msgLower, 'request_denied') !== false || strpos($msgLower, 'apinotactivated') !== false || strpos($msgLower, 'over_query_limit') !== false);
    
    if (!$isCriticalApiKey) {
        $isAdblockOrClientNoise = true;
    }
}

if ($isAdblockOrClientNoise) {
    // Quietly record to telemetry log without sending email/Telegram spam
    $root = dirname(__DIR__);
    $telemetryFile = $root . '/tmp/telemetry-log.json';
    $logData = [
        'timestamp'   => time(),
        'type'        => $type . ' (client_suppressed)',
        'message'     => $message,
        'file'        => 'client_browser',
        'line'        => 0,
        'url'         => $url,
        'user_agent'  => $userAgent,
        'stack_trace' => is_array($details) ? json_encode($details) : (string)$details
    ];
    $logs = is_file($telemetryFile) ? (json_decode(@file_get_contents($telemetryFile), true) ?: []) : [];
    array_unshift($logs, $logData);
    $logs = array_slice($logs, 0, 100);
    @file_put_contents($telemetryFile, json_encode($logs, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

    echo json_encode([
        'ok' => true,
        'status' => 'suppressed_client_adblock_noise'
    ]);
    exit;
}


// Check if the user agent is a bot/crawler to avoid notification spam
$isBot = false;
$botKeywords = [
    'googlebot', 'bingbot', 'yandexbot', 'applebot', 'baidu', 'duckduckbot', 'slurp', 'sogou', 
    'exabot', 'facebookexternalhit', 'ia_archiver', 'bot', 'crawler', 'spider', 'scraper',
    'googleother', 'google-other', 'google', 'lighthouse', 'mediapartners', 'adsbot', 'preview',
    'http', 'curl', 'wget', 'python', 'node', 'axios', 'postman'
];
$uaLower = strtolower($userAgent);
foreach ($botKeywords as $keyword) {
    if (strpos($uaLower, $keyword) !== false) {
        $isBot = true;
        break;
    }
}

// Load configurations
$root = dirname(__DIR__);
$configPath = $root . '/api/config.php';
$config = is_file($configPath) ? require $configPath : [];

// Cooldown logic to prevent spam
$cooldownFile = $root . '/tmp/error-cooldown.json';
if (!is_dir(dirname($cooldownFile))) {
    @mkdir(dirname($cooldownFile), 0777, true);
}

$now = time();
$cooldownDuration = 300; // 5 minutes
$errorSignature = md5($type . ':' . substr($message, 0, 100));

$cooldownData = [];
if (is_file($cooldownFile)) {
    $cooldownData = json_decode(@file_get_contents($cooldownFile), true) ?: [];
}

// Clean up old cooldown entries
foreach ($cooldownData as $sig => $timestamp) {
    if ($now - $timestamp > $cooldownDuration) {
        unset($cooldownData[$sig]);
    }
}

if (isset($cooldownData[$errorSignature]) && ($now - $cooldownData[$errorSignature] < $cooldownDuration)) {
    // Throttled, exit successfully
    echo json_encode(['ok' => true, 'status' => 'throttled']);
    exit;
}

// Save the new alert timestamp
$cooldownData[$errorSignature] = $now;
@file_put_contents($cooldownFile, json_encode($cooldownData));

// Prepare notification message
$detailsStr = '';
if (!empty($details)) {
    $detailsStr = json_encode($details, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
}
$errorDescription = dropcars_get_error_description($type, $message, $url, $details);

// Send Telegram Message first (very fast and reliable if token is configured)
$telegramSent = false;
$telegramEnabled = $config['enableTelegramNotifications_Admin'] ?? true;
if ($telegramEnabled && !$isBot) {
    $telegramHelper = $root . '/helpers/telegram.php';
    if (is_file($telegramHelper)) {
        require_once $telegramHelper;
        if (function_exists('sendTelegramMessage')) {
            $tgMessage = "<b>⚠️ Drop Cars Website Error</b>\n\n";
            $tgMessage .= "<b>Explanation:</b> " . htmlspecialchars($errorDescription, ENT_QUOTES, 'UTF-8') . "\n\n";
            $tgMessage .= "<b>Type:</b> {$type}\n";
            $tgMessage .= "<b>Message:</b> " . htmlspecialchars($message, ENT_QUOTES, 'UTF-8') . "\n";
            $tgMessage .= "<b>URL:</b> {$url}\n";
            $tgMessage .= "<b>User Agent:</b> " . htmlspecialchars($userAgent, ENT_QUOTES, 'UTF-8') . "\n";
            if ($detailsStr !== '') {
                $tgMessage .= "\n<b>Details:</b>\n<pre>" . htmlspecialchars(substr($detailsStr, 0, 500), ENT_QUOTES, 'UTF-8') . "</pre>";
            }
            sendTelegramMessage($tgMessage);
            $telegramSent = true;
        }
    }
}

// Always save to centralized telemetry log for Admin App System Health Viewer
$telemetryFile = $root . '/tmp/telemetry-log.json';
$logData = [
    'timestamp'   => time(),
    'type'        => $type,
    'message'     => $message,
    'file'        => 'client_reported',
    'line'        => 0,
    'url'         => $url,
    'user_agent'  => $userAgent,
    'details'     => $details
];
$logs = is_file($telemetryFile) ? (json_decode(@file_get_contents($telemetryFile), true) ?: []) : [];
array_unshift($logs, $logData);
$logs = array_slice($logs, 0, 200);
@file_put_contents($telemetryFile, json_encode($logs, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

// Send Email Notification ONLY if explicitly enabled (default false to save SMTP daily quota)
$emailSent = false;
$enableEmailAlerts = !empty($config['enableEmailErrorAlerts']);
$smtpHelper = $root . '/api/smtp-settings.php';
if ($enableEmailAlerts && is_file($smtpHelper) && !$isBot) {
    require_once $smtpHelper;
    if (function_exists('dropcars_resolve_smtp') && function_exists('dropcars_send_mail_with_fallback')) {
        $smtp = dropcars_resolve_smtp($config);
        
        $mailTo = $config['mailTo'] ?? 'dropcarsbookings@gmail.com';
        
        $subject = "[Website Error] {$type} - Drop Cars";
        
        // Construct HTML email body
        $htmlBody = "
        <div style='font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.6;'>
            <h2 style='color: #b42318; border-bottom: 2px solid #b42318; padding-bottom: 8px;'>⚠️ Drop Cars Website Error Detected</h2>
            <p>A website issue was reported by a user's browser session.</p>
            
            <div style='background: #fff8f8; border-left: 4px solid #d93f3f; padding: 12px; margin: 15px 0; border-radius: 4px;'>
                <strong style='color: #b42318; font-size: 1.05em;'>What's Wrong:</strong><br>
                <span style='color: #2d3748; font-weight: 500;'>{$errorDescription}</span>
            </div>

            <table style='width: 100%; border-collapse: collapse; margin-top: 15px;'>
                <tr style='background: #f9fafb;'>
                    <th style='text-align: left; padding: 8px; border: 1px solid #ddd; width: 120px;'>Error Type</th>
                    <td style='padding: 8px; border: 1px solid #ddd;'><strong>{$type}</strong></td>
                </tr>
                <tr>
                    <th style='text-align: left; padding: 8px; border: 1px solid #ddd;'>Message</th>
                    <td style='padding: 8px; border: 1px solid #ddd; color: #b42318;'><strong>" . nl2br(htmlspecialchars($message, ENT_QUOTES, 'UTF-8')) . "</strong></td>
                </tr>
                <tr style='background: #f9fafb;'>
                    <th style='text-align: left; padding: 8px; border: 1px solid #ddd;'>Page URL</th>
                    <td style='padding: 8px; border: 1px solid #ddd;'><a href='" . htmlspecialchars($url, ENT_QUOTES, 'UTF-8') . "' target='_blank'>" . htmlspecialchars($url, ENT_QUOTES, 'UTF-8') . "</a></td>
                </tr>
                <tr>
                    <th style='text-align: left; padding: 8px; border: 1px solid #ddd;'>User Agent</th>
                    <td style='padding: 8px; border: 1px solid #ddd; font-size: 0.9em;'>" . htmlspecialchars($userAgent, ENT_QUOTES, 'UTF-8') . "</td>
                </tr>
                <tr style='background: #f9fafb;'>
                    <th style='text-align: left; padding: 8px; border: 1px solid #ddd;'>Timestamp</th>
                    <td style='padding: 8px; border: 1px solid #ddd;'>" . date('Y-m-d H:i:s') . " (Server Time)</td>
                </tr>
            </table>";
            
        if ($detailsStr !== '') {
            $htmlBody .= "
            <h3 style='margin-top: 20px; color: #475467;'>Error Details / Stack Trace</h3>
            <pre style='background: #f4f5f6; padding: 12px; border-radius: 4px; border: 1px solid #e4e7ec; overflow-x: auto; font-family: Courier, monospace; font-size: 0.85em; max-height: 400px;'>" . htmlspecialchars($detailsStr, ENT_QUOTES, 'UTF-8') . "</pre>";
        }
        
        $htmlBody .= "
            <br>
            <hr style='border: 0; border-top: 1px solid #eaecf0;'>
            <p style='font-size: 0.8em; color: #667085;'>This is an automated alert system by Drop Cars monitoring engine.</p>
        </div>";
        
        // Construct Plain Text alternate body
        $plainBody = "⚠️ Drop Cars Website Error Detected\n\n";
        $plainBody .= "What's Wrong: {$errorDescription}\n\n";
        $plainBody .= "Error Type: {$type}\n";
        $plainBody .= "Message: {$message}\n";
        $plainBody .= "Page URL: {$url}\n";
        $plainBody .= "User Agent: {$userAgent}\n";
        $plainBody .= "Timestamp: " . date('Y-m-d H:i:s') . "\n";
        if ($detailsStr !== '') {
            $plainBody .= "\nDetails:\n{$detailsStr}\n";
        }
        
        $phpmailerDir = __DIR__ . '/phpmailer/src';
        $mailResult = dropcars_send_mail_with_fallback($smtp, $phpmailerDir, $mailTo, $subject, $htmlBody, $plainBody, [], $config);
        
        if ($mailResult['ok']) {
            $emailSent = true;
        } else {
            error_log("Failed to send error report email: " . $mailResult['error']);
        }
    }
}

echo json_encode([
    'ok' => true,
    'email_sent' => $emailSent,
    'telegram_sent' => $telegramSent,
    'status' => $isBot ? 'ignored_bot' : 'processed'
]);
