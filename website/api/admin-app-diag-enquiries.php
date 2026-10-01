<?php
/**
 * READ-ONLY health check for the enquiry pipeline (why do new leads not show in the Admin App, why do emoji vanish).
 * Auth: header `X-Admin-App-Key` must match ADMIN_APP_API_KEY (same as admin-app-sync-sheets.php).
 * Changes nothing: only SELECT / SHOW. Returns no phone numbers, no names, no secrets.
 *
 *   curl -H "X-Admin-App-Key: <your key>" https://<site>/api/admin-app-diag-enquiries.php
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/../config/env.php';
require_once __DIR__ . '/../admin/config/database.php';

$providedKey = $_SERVER['HTTP_X_ADMIN_APP_KEY'] ?? '';
if (!defined('ADMIN_APP_API_KEY') || ADMIN_APP_API_KEY === '' || !hash_equals((string) ADMIN_APP_API_KEY, (string) $providedKey)) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Invalid or missing admin app key']);
    exit;
}

$pdo = function_exists('dropcars_get_db') ? dropcars_get_db() : ($GLOBALS['db'] ?? null);
if (!$pdo) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database unavailable']);
    exit;
}

$out = ['success' => true, 'php_version' => PHP_VERSION, 'server_time' => date('c'), 'timezone' => date_default_timezone_get()];
$try = function (string $key, callable $fn) use (&$out) {
    try { $out[$key] = $fn(); } catch (Throwable $e) { $out[$key] = ['error' => $e->getMessage()]; }
};

// 1. Are new enquiries being saved at all? Rows per day for the last 20 days + the newest row (no personal data).
$try('enquiries_per_day', function () use ($pdo) {
    return $pdo->query("SELECT DATE(`created_at`) AS day, COUNT(*) AS n FROM `enquiries` WHERE `created_at` >= (NOW() - INTERVAL 20 DAY) GROUP BY DATE(`created_at`) ORDER BY day DESC")->fetchAll(PDO::FETCH_ASSOC);
});
$try('newest_enquiry', function () use ($pdo) {
    return $pdo->query("SELECT `id`, `booking_id`, `status`, `source`, `created_at`, (`backend_request_id` IS NOT NULL AND `backend_request_id` <> '') AS has_backend_request FROM `enquiries` ORDER BY `id` DESC LIMIT 5")->fetchAll(PDO::FETCH_ASSOC);
});
$try('missing_columns_the_insert_needs', function () use ($pdo) {
    $need = ['name','phone','pickup','drop_location','trip_type','vehicle_type','travel_date','travel_time','vehicle_estimates','fare_estimate','fare_type','distance_km','duration','ip_address','source','utm_source','utm_medium','utm_campaign','utm_term','utm_content','device','matchtype','gclid','source_page','status','booking_id','fare_breakdown','website','backend_request_id'];
    $have = array_column($pdo->query("SHOW COLUMNS FROM `enquiries`")->fetchAll(PDO::FETCH_ASSOC), 'Field');
    return array_values(array_diff($need, $have));
});
$try('booking_id_unique_index', function () use ($pdo) {
    return $pdo->query("SHOW INDEX FROM `enquiries` WHERE Column_name = 'booking_id'")->fetchAll(PDO::FETCH_ASSOC);
});
// 2. Emoji: the table / text columns must be utf8mb4, otherwise an emoji in a name, note or message is cut or becomes '?'.
$try('table_collation', function () use ($pdo) {
    return $pdo->query("SELECT TABLE_NAME, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('enquiries','bookings')")->fetchAll(PDO::FETCH_ASSOC);
});
$try('non_utf8mb4_text_columns', function () use ($pdo) {
    return $pdo->query("SELECT TABLE_NAME, COLUMN_NAME, CHARACTER_SET_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('enquiries','bookings') AND CHARACTER_SET_NAME IS NOT NULL AND CHARACTER_SET_NAME <> 'utf8mb4'")->fetchAll(PDO::FETCH_ASSOC);
});
$try('connection_charset', function () use ($pdo) {
    return $pdo->query("SHOW VARIABLES WHERE Variable_name IN ('character_set_client','character_set_connection','character_set_results','character_set_database')")->fetchAll(PDO::FETCH_KEY_PAIR);
});
$try('emoji_roundtrip', function () use ($pdo) {   // does this connection keep a 4-byte emoji? (no table is touched)
    $v = $pdo->query("SELECT '" . "\u{1F696}" . "' AS e")->fetchColumn();
    return ['sent' => "\u{1F696}", 'received' => $v, 'ok' => $v === "\u{1F696}"];
});
// 3. Mail: only whether it is configured, never the values.
$out['mail'] = [
    'phpmailer_present' => is_file(__DIR__ . '/phpmailer/src/PHPMailer.php'),
    'mbstring' => extension_loaded('mbstring'),
    'smtp_settings_helper_present' => is_file(__DIR__ . '/smtp-settings.php'),
];
// 4. Booking id: what the next ids would be (read-only: no sequence file is written here).
$try('booking_id_today', function () use ($pdo) {
    $ymd = date('ymd');
    $rows = $pdo->prepare("SELECT `booking_id` FROM `enquiries` WHERE `booking_id` LIKE ? ORDER BY `id` DESC LIMIT 5");
    $rows->execute(['%' . $ymd . '%']);
    $seq = @file_get_contents(__DIR__ . '/storage/seq_' . $ymd . '.txt');
    return ['today_ymd' => $ymd, 'latest_ids_today' => $rows->fetchAll(PDO::FETCH_COLUMN), 'sequence_file_value' => $seq === false ? null : trim($seq)];
});

echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
