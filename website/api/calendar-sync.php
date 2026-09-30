<?php
/**
 * Google Calendar via Apps Script web app (POST JSON, same pattern as sheets-sync).
 * Set googleCalendarWebhookUrl in api/config.php or env GOOGLE_CALENDAR_WEBHOOK_URL.
 */

if (!function_exists('dropcars_sync_to_google_calendar')) {
    function dropcars_sync_to_google_calendar(array $entry, array $config = []): bool
    {
        $url = getenv('GOOGLE_CALENDAR_WEBHOOK_URL')
            ?: (defined('GOOGLE_CALENDAR_WEBHOOK_URL') && GOOGLE_CALENDAR_WEBHOOK_URL !== ''
                ? GOOGLE_CALENDAR_WEBHOOK_URL
                : ($config['googleCalendarWebhookUrl'] ?? ''));

        if (!$url) {
            return false;
        }

        $token = getenv('GOOGLE_CALENDAR_WEBHOOK_TOKEN')
            ?: (defined('GOOGLE_CALENDAR_WEBHOOK_TOKEN') && GOOGLE_CALENDAR_WEBHOOK_TOKEN !== ''
                ? GOOGLE_CALENDAR_WEBHOOK_TOKEN
                : ($config['googleCalendarWebhookToken'] ?? ''));

        $headers = ['Content-Type: application/json'];
        if ($token) {
            $headers[] = 'X-Webhook-Token: ' . $token;
        }

        $payload = json_encode([
            'source' => 'dropcars-website',
            'timestamp' => date('c'),
            'entry' => $entry,
        ], JSON_UNESCAPED_UNICODE);

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);

        $result = curl_exec($ch);
        $curlError = curl_error($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($result === false || $curlError !== '') {
            error_log('Drop Cars Calendar cURL: ' . ($curlError ?: 'unknown'));
            return false;
        }
        if ($httpCode !== 200) {
            error_log('Drop Cars Calendar HTTP: ' . $httpCode);
            return false;
        }

        return true;
    }
}
