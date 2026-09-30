<?php
/**
 * AirportTaxi.International — instant fare quote endpoint.
 * POST JSON: { mode: 'local'|'outstation'|'rental', distanceKm, borders?, hours?, vehicle? }
 * If 'vehicle' is omitted, returns a quote for every vehicle (compare view).
 *
 * This mirrors the shape of the existing api/confirm_booking.php family
 * (JSON in, JSON out, permissive CORS since the booking form calls it
 * client-side) but only ever *reads* the tariff config — no DB writes here.
 */

header('Content-Type: application/json; charset=utf-8');
$__origin = $_SERVER['HTTP_ORIGIN'] ?? '';
header('Access-Control-Allow-Origin: ' . ($__origin !== '' ? $__origin : '*'));
header('Access-Control-Allow-Credentials: true');
header('Vary: Origin');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
    exit;
}

$blockedCheckPath = __DIR__ . '/../admin/includes/check-blocked.php';
if (is_file($blockedCheckPath)) {
    require_once $blockedCheckPath;
    if (function_exists('dropcars_check_blocked_ip')) {
        dropcars_check_blocked_ip();
    }
}

require_once __DIR__ . '/../engine/airporttaxi-fare.php';

$input = file_get_contents('php://input');
$data = json_decode($input, true);
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid or empty JSON.']);
    exit;
}

$mode = in_array(($data['mode'] ?? ''), ['local', 'outstation', 'rental'], true) ? $data['mode'] : 'local';
$params = [
    'mode' => $mode,
    'distanceKm' => (float) ($data['distanceKm'] ?? 0),
    'borders' => (int) ($data['borders'] ?? 0),
    'hours' => (int) ($data['hours'] ?? 5),
];

if (!empty($data['vehicle'])) {
    $params['vehicle'] = (string) $data['vehicle'];
    $quote = dropcars_airporttaxi_quote($params);
    echo json_encode(['success' => true, 'quote' => $quote]);
    exit;
}

$quotes = dropcars_airporttaxi_quote_all($params);
echo json_encode(['success' => true, 'quotes' => $quotes]);
