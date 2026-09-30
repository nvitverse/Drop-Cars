<?php
declare(strict_types=1);

/**
 * Google Sheet Synchronization for Drop Cars
 * Optimized for the 19-Column "Force-Alignment" Script
 */

function dropcars_sheet_current_ist(): string {
    try {
        $tz = new DateTimeZone('Asia/Kolkata');
        $dt = new DateTime('now', $tz);
        return $dt->format('d-m-Y H:i:s');
    } catch (Throwable $e) {
        return date('d-m-Y H:i:s');
    }
}

function dropcars_sheet_trip_label($val, $default = 'One Way'): string {
    $v = strtolower(trim((string)($val ?? '')));
    if ($v === '' || $v === 'enquiry' || $v === 'booking') return $default;
    if (strpos($v, 'one') !== false) return 'One Way';
    if (strpos($v, 'round') !== false) return 'Round Trip';
    if (strpos($v, 'local') !== false) return 'Local';
    if (strpos($v, 'airport') !== false) return 'Airport';
    return ucfirst($v);
}

function sendToGoogleSheet(array $payload): bool {
    // Skip the blocking external HTTP call on the single-threaded php -S dev server.
    if (php_sapi_name() === 'cli-server') {
        return false;
    }
    // 1. Get current config for the Webhook URL
    $config = [];
    $configPath = __DIR__ . '/../api/config.php';
    if (is_file($configPath)) {
        $config = include $configPath;
    }
    
    $url = !empty($config['googleSheetsWebhookUrl']) 
        ? $config['googleSheetsWebhookUrl'] 
        : 'https://script.google.com/macros/s/AKfycbwqllsHWYyfFOLh58wsDKbwaYFHPMQ5UN9p4dRqrAdnCkwBfwHkL2b95y179LYJ4M0f6w/exec';

    // 2. Resolve values to the exact keys expected by the Fix Script
    $pickup = $payload['pickup'] ?? $payload['pickup_location'] ?? '';
    $drop   = $payload['drop'] ?? $payload['drop_location'] ?? '';
    
    $data = [
        'createdAt'    => $payload['createdAt'] ?? dropcars_sheet_current_ist(),
        'bookingId'    => (string)($payload['bookingId'] ?? $payload['booking_id'] ?? ''),
        'tripType'     => dropcars_sheet_trip_label($payload['tripType'] ?? $payload['trip_type'] ?? ''), // Col 3
        'status'       => $payload['status'] ?? 'Enquiry',
        'name'         => $payload['name'] ?? '',
        'phone'        => " " . ltrim((string)($payload['phone'] ?? ''), "+=-@"),
        'leadType'     => $payload['leadType'] ?? 'Enquiry', // Col 7
        'pickup'       => $pickup,
        'drop'         => $drop,
        'itinerary'    => $pickup . ($drop !== '' ? ' → ' . $drop : ''),
        'fareType'     => $payload['fareType'] ?? $payload['fare_type'] ?? '',
        'estFare'      => (string)($payload['estFare'] ?? $payload['estimated_fare'] ?? $payload['fare_estimate'] ?? ''),
        'finalFare'    => (string)($payload['finalFare'] ?? $payload['final_fare'] ?? ''),
        'driverName'   => $payload['driverName'] ?? $payload['driver_name'] ?? '',
        'driverPhone'  => $payload['driverPhone'] ?? $payload['driver_phone'] ?? '',
        'carNumber'    => $payload['carNumber'] ?? $payload['car_number'] ?? '',
        'source'       => $payload['source'] ?? 'Direct',
        'ip'           => " " . ltrim((string)($payload['ip'] ?? $payload['ip_address'] ?? ''), "+=-@"),
        'loyaltyStatus'=> $payload['loyaltyStatus'] ?? '',
    ];

    // 3. Post to Google — fire-and-forget (non-blocking)
    // Google Apps Script can take 5-30 s to respond; we must NOT block PHP.
    // Strategy: hand off the TCP connection then immediately close on our side.
    // CURLOPT_TIMEOUT of 1 s is intentional — we don't need the response body.
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);   // don't chase redirects; saves time
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);       // fail fast if unreachable
    curl_setopt($ch, CURLOPT_TIMEOUT, 1);              // 1 s — just enough to send, not wait
    curl_setopt($ch, CURLOPT_NOSIGNAL, 1);             // required for sub-second timeouts in multi-threaded PHP

    // Suppress the intentional CURLE_OPERATION_TIMEDOUT (28) we expect to see
    $result = curl_exec($ch);
    $errNo  = curl_errno($ch);
    $err    = curl_error($ch);
    curl_close($ch);

    // errno 28 = CURLE_OPERATION_TIMEDOUT — this is expected and OK for fire-and-forget
    $dispatched = ($result !== false || $errNo === 28);

    if (!$dispatched) {
        if (function_exists('dropcars_report_php_error')) {
            dropcars_report_php_error(
                'google_sheet_sync_failure',
                'Failed to dispatch booking to Google Sheets. curl error [' . $errNo . ']: ' . $err,
                __FILE__,
                __LINE__
            );
        }
    }

    return $dispatched;
}
