<?php
/**
 * Telegram Helper for Drop Cars
 * Handles sending formatted notifications to production chat.
 */

if (!defined('TELEGRAM_BOT_TOKEN')) {
    require_once __DIR__ . '/../config/env.php';
}

function sendTelegramMessage($message) {
    $token = TELEGRAM_BOT_TOKEN;
    $chat_id = TELEGRAM_CHAT_ID;

    $url = "https://api.telegram.org/bot{$token}/sendMessage";

    $data = [
        'chat_id' => $chat_id,
        'text' => $message,
        'parse_mode' => 'HTML'
    ];

    $options = [
        'http' => [
            'method' => 'POST',
            'header' => 'Content-Type: application/x-www-form-urlencoded',
            'content' => http_build_query($data),
            'timeout' => 10
        ]
    ];

    $context = stream_context_create($options);
    return @file_get_contents($url, false, $context);
}
