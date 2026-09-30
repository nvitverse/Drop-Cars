<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../admin/config/database.php';
require_once __DIR__ . '/../admin/includes/enquiries-schema.php';

$pdo = dropcars_get_db();
if (!$pdo) {
    echo json_encode(['error' => 'No PDO connection']);
    exit;
}

// 1. Ensure all columns
dropcars_ensure_enquiries_columns($pdo);

// 2. Describe table
$cols = $pdo->query("SHOW COLUMNS FROM `enquiries`")->fetchAll(PDO::FETCH_ASSOC);

// 3. Test Insert
$testId = dropcars_next_enquiry_booking_id($pdo, 'E');
$insertError = null;
$insertSuccess = false;

try {
    $sqlInsert = "INSERT INTO `enquiries`
        (`name`, `phone`, `pickup`, `drop_location`, `trip_type`, `vehicle_type`, `travel_date`, `travel_time`, `vehicle_estimates`, `fare_estimate`, `fare_type`, `distance_km`, `duration`, `ip_address`, `source`, `utm_source`, `utm_medium`, `utm_campaign`, `gclid`, `source_page`, `status`, `booking_id`, `fare_breakdown`, `website`)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    $stmt = $pdo->prepare($sqlInsert);
    $stmt->execute([
        'Diag Test Customer',
        '9841234500',
        'Chennai',
        'Pondicherry',
        'one_way',
        'SEDAN',
        date('Y-m-d'),
        '10:00 AM',
        '{}',
        2400,
        'base',
        150,
        '3 hrs',
        '127.0.0.1',
        'test',
        '',
        '',
        '',
        '',
        'https://dropcars.in/',
        'not_confirmed',
        $testId,
        '{}',
        'dropcars.in'
    ]);
    $insertSuccess = true;
} catch (Throwable $e) {
    $insertError = $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine();
}

$nextIdAfter = dropcars_next_enquiry_booking_id($pdo, 'E');

echo json_encode([
    'insert_success' => $insertSuccess,
    'insert_error' => $insertError,
    'tested_id' => $testId,
    'next_id_after' => $nextIdAfter,
    'columns' => array_column($cols, 'Field')
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
