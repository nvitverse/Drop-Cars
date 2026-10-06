<?php
header('Content-Type: application/json');
require_once __DIR__ . '/../admin/config/database.php';
require_once __DIR__ . '/../admin/includes/enquiries-schema.php';

$pdo = dropcars_get_db();
$ymd = date('ymd');

$maxSeq = dropcars_max_daily_booking_sequence($pdo, $ymd);
$nextE = dropcars_next_enquiry_booking_id($pdo, 'E');
$nextC = dropcars_next_enquiry_booking_id($pdo, 'C');

$stmtE = $pdo->prepare("SELECT id, booking_id, name, phone, created_at FROM enquiries WHERE booking_id LIKE ? ORDER BY id DESC LIMIT 10");
$stmtE->execute(['%' . $ymd . '%']);
$recentEnq = $stmtE->fetchAll(PDO::FETCH_ASSOC);

$stmtB = $pdo->prepare("SELECT id, booking_id, created_at FROM bookings WHERE booking_id LIKE ? ORDER BY id DESC LIMIT 10");
$stmtB->execute(['%' . $ymd . '%']);
$recentBk = $stmtB->fetchAll(PDO::FETCH_ASSOC);

echo json_encode([
    'server_time' => date('Y-m-d H:i:s'),
    'ymd' => $ymd,
    'maxSeq' => $maxSeq,
    'nextE' => $nextE,
    'nextC' => $nextC,
    'recentEnquiries' => $recentEnq,
    'recentBookings' => $recentBk
], JSON_PRETTY_PRINT);
