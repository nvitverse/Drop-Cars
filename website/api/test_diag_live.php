<?php
header('Content-Type: application/json; charset=utf-8');
ini_set('display_errors', '1');
error_reporting(E_ALL);

require_once __DIR__ . '/../admin/config/database.php';
require_once __DIR__ . '/../admin/includes/enquiries-schema.php';

$res = [
    'pdo_connected' => isset($pdo) && $pdo instanceof PDO,
    'globals_db' => !empty($GLOBALS['db']) && $GLOBALS['db'] instanceof PDO,
    'db_name' => '',
    'enquiries_count' => 0,
    'bookings_count' => 0,
    'latest_enquiries' => [],
    'latest_bookings' => [],
    'max_sequence_today' => 0,
    'next_id_E' => '',
    'next_id_C' => '',
    'server_time' => date('Y-m-d H:i:s'),
    'date_ymd' => date('ymd'),
    'file_mtime' => date('Y-m-d H:i:s', filemtime(__FILE__)),
    'send_enquiry_mtime' => is_file(__DIR__ . '/send-enquiry.php') ? date('Y-m-d H:i:s', filemtime(__DIR__ . '/send-enquiry.php')) : 'missing',
];

if (isset($pdo) && $pdo instanceof PDO) {
    try {
        $res['db_name'] = $pdo->query("SELECT DATABASE()")->fetchColumn();
        $res['enquiries_count'] = (int) $pdo->query("SELECT COUNT(*) FROM `enquiries`")->fetchColumn();
        $res['bookings_count'] = (int) $pdo->query("SELECT COUNT(*) FROM `bookings`")->fetchColumn();
        
        $ymd = date('ymd');
        $res['max_sequence_today'] = dropcars_max_daily_booking_sequence($pdo, $ymd);
        $res['next_id_E'] = dropcars_next_enquiry_booking_id($pdo, 'E');
        $res['next_id_C'] = dropcars_next_enquiry_booking_id($pdo, 'C');

        $stmt = $pdo->query("SELECT `id`, `booking_id`, `name`, `phone`, `created_at` FROM `enquiries` ORDER BY `id` DESC LIMIT 10");
        $res['latest_enquiries'] = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $stmt2 = $pdo->query("SELECT `id`, `booking_id`, `customer_name`, `customer_phone`, `created_at` FROM `bookings` ORDER BY `id` DESC LIMIT 10");
        $res['latest_bookings'] = $stmt2->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        $res['error'] = $e->getMessage();
    }
}

echo json_encode($res, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
