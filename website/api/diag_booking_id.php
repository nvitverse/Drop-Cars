<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../config/env.php';
require_once __DIR__ . '/../admin/config/database.php';
require_once __DIR__ . '/../admin/includes/enquiries-schema.php';

$pdo = function_exists('dropcars_get_db') ? dropcars_get_db() : null;

$id1 = dropcars_next_enquiry_booking_id($pdo, 'E');
$id2 = dropcars_next_enquiry_booking_id($pdo, 'E');

$maxSeq = dropcars_max_daily_booking_sequence($pdo, date('ymd'), 'E');

$enquiryRowsToday = [];
if ($pdo instanceof PDO) {
    try {
        $stmt = $pdo->query("SELECT id, booking_id, name, phone, created_at FROM enquiries WHERE booking_id LIKE '%" . date('ymd') . "%' ORDER BY id DESC LIMIT 10");
        $enquiryRowsToday = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {
        $enquiryRowsToday = ['error' => $e->getMessage()];
    }
}

echo json_encode([
    'file_location' => __FILE__,
    'php_version' => PHP_VERSION,
    'today_ymd' => date('ymd'),
    'max_seq_in_db' => $maxSeq,
    'generated_id_1' => $id1,
    'generated_id_2' => $id2,
    'recent_enquiries_today' => $enquiryRowsToday,
    'storage_dir' => __DIR__ . '/storage',
    'seq_file_exists' => file_exists(__DIR__ . '/storage/seq_' . date('ymd') . '.txt'),
    'seq_file_val' => file_exists(__DIR__ . '/storage/seq_' . date('ymd') . '.txt') ? trim(file_get_contents(__DIR__ . '/storage/seq_' . date('ymd') . '.txt')) : null
], JSON_PRETTY_PRINT);
