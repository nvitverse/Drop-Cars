<?php
/**
 * check-payment-status.php
 * Polled by the thank-you page every 4 seconds after the customer
 * taps "I've Paid".  Returns the latest status of the advance payment
 * so the UI can move from "Verifying" → "Confirmed" as soon as admin
 * marks it verified in the admin panel.
 *
 * GET: booking_id
 * Returns: { ok, status }  where status ∈ pending | verified | rejected
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

if (!defined('DROP_CARS_DB_OPTIONAL')) define('DROP_CARS_DB_OPTIONAL', true);
require_once __DIR__ . '/../admin/config/database.php';

$bookingId = preg_replace('/[^A-Za-z0-9\-]/', '', (string)($_GET['booking_id'] ?? ''));

if ($bookingId === '') {
    echo json_encode(['ok' => false, 'status' => 'unknown']);
    exit;
}

$status = 'pending';

if (isset($pdo) && $pdo instanceof PDO) {
    try {
        $tableCheck = $pdo->query("SHOW TABLES LIKE 'advance_payments'")->fetchColumn();
        if ($tableCheck) {
            $stmt = $pdo->prepare(
                "SELECT status FROM `advance_payments`
                 WHERE booking_id = ?
                 ORDER BY id DESC LIMIT 1"
            );
            $stmt->execute([$bookingId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row) $status = $row['status'];
        }
    } catch (Throwable $e) {
        // DB error — return pending so frontend keeps polling
        error_log('check-payment-status error: ' . $e->getMessage());
    }
}

echo json_encode(['ok' => true, 'status' => $status]);
