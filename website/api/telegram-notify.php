<?php
/**
 * Telegram notification delivery system — highly robust version for Hostinger / Shared Hosting.
 * Uses cURL (primary) with file_get_contents (fallback), both configured to bypass SSL CA mismatches.
 */

/**
 * Execute a POST request to the Telegram API in a host-agnostic way.
 *
 * @return string|false
 */
function dropcars_telegram_post(string $url, string $payload, string $contentType)
{
    // Method 1: cURL (Most robust, handles firewalls, redirects, and SSL bypasses perfectly)
    if (function_exists('curl_init')) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: ' . $contentType
        ]);
        curl_setopt($ch, CURLOPT_TIMEOUT, 12);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 6);
        
        // Hostinger / SSL certificate authority fallback
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        
        $res = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($res !== false && $httpCode >= 200 && $httpCode < 300) {
            return $res;
        }
    }
    
    // Method 2: stream context / file_get_contents (Fallback)
    $ctx = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => 'Content-Type: ' . $contentType,
            'content' => $payload,
            'timeout' => 12,
        ],
        'ssl' => [
            'verify_peer' => false,
            'verify_peer_name' => false,
        ]
    ]);
    
    return @file_get_contents($url, false, $ctx);
}

/**
 * Send HTML formatted message to Telegram with optional inline keyboard buttons.
 */
function dropcars_telegram_send_html(string $token, array $chatIds, string $html, ?array $replyMarkup = null): bool
{
    $token = trim($token);
    if ($token === '' || $chatIds === []) {
        return false;
    }
    $ok = false;
    foreach ($chatIds as $chatId) {
        if ($chatId === '' || $chatId === null) {
            continue;
        }
        $url = 'https://api.telegram.org/bot' . $token . '/sendMessage';
        $payloadData = [
            'chat_id' => $chatId,
            'text' => $html,
            'parse_mode' => 'HTML',
            'disable_web_page_preview' => true,
        ];
        if (!empty($replyMarkup)) {
            $payloadData['reply_markup'] = $replyMarkup;
        }
        $payload = json_encode($payloadData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        
        $res = dropcars_telegram_post($url, $payload, 'application/json; charset=utf-8');
        if ($res !== false && strpos($res, '"ok":true') !== false) {
            $ok = true;
        } else {
            error_log("Drop Cars Telegram Send HTML Error for Chat ID $chatId: " . ($res ?: 'No response'));
        }
    }

    return $ok;
}

/**
 * Send Markdown formatted message to Telegram (Kept for legacy support).
 */
function dropcars_telegram_send_markdown(string $token, array $chatIds, string $text): bool
{
    $token = trim($token);
    if ($token === '' || $chatIds === []) {
        return false;
    }
    $text = str_replace(['*'], ['\*'], $text);
    $ok = false;
    foreach ($chatIds as $chatId) {
        if ($chatId === '' || $chatId === null) {
            continue;
        }
        $url = 'https://api.telegram.org/bot' . $token . '/sendMessage';
        $payload = [
            'chat_id' => $chatId,
            'text' => $text,
            'parse_mode' => 'Markdown',
        ];
        
        $res = dropcars_telegram_post($url, http_build_query($payload), 'application/x-www-form-urlencoded');
        if ($res !== false && strpos($res, '"ok":true') !== false) {
            $ok = true;
        } else {
            error_log("Drop Cars Telegram Send Markdown Error for Chat ID $chatId: " . ($res ?: 'No response'));
        }
    }

    return $ok;
}
