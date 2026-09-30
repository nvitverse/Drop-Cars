<?php
/**
 * Admin App (React Native) endpoint to trigger Google Sheets sync on demand.
 * Auth: header `X-Admin-App-Key` must match ADMIN_APP_API_KEY.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Admin-App-Key');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../config/env.php';
require_once __DIR__ . '/../admin/config/database.php';
require_once __DIR__ . '/../includes/google-sheet-sync.php';

$pdo = $GLOBALS['db'] ?? null;
if (!$pdo) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database unavailable']);
    exit;
}

$providedKey = $_SERVER['HTTP_X_ADMIN_APP_KEY'] ?? '';
if (!defined('ADMIN_APP_API_KEY') || ADMIN_APP_API_KEY === '' || !hash_equals((string) ADMIN_APP_API_KEY, (string) $providedKey)) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Invalid or missing admin app key']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $stmt = $pdo->query("SELECT * FROM `enquiries` WHERE `status` IN ('new', 'contacted', 'confirmed') ORDER BY `id` DESC LIMIT 50");
        $enquiries = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
        $syncedCount = 0;

        foreach ($enquiries as $eq) {
            $payload = [
                'createdAt' => $eq['created_at'] ?? date('d-m-Y H:i:s'),
                'bookingId' => 'ENQ-' . ($eq['id'] ?? ''),
                'leadType' => 'Enquiry',
                'status' => $eq['status'] ?? 'New',
                'name' => $eq['name'] ?? 'Website Customer',
                'phone' => $eq['phone'] ?? '',
                'tripType' => $eq['trip_type'] ?? 'One Way',
                'pickup' => $eq['pickup_location'] ?? '',
                'drop' => $eq['drop_location'] ?? '',
                'vehicleType' => $eq['car_type'] ?? '',
                'pickupDate' => $eq['pickup_date'] ?? '',
                'pickupTime' => $eq['pickup_time'] ?? '',
            ];
            if (sendToGoogleSheet($payload)) {
                $syncedCount++;
            }
        }

        echo json_encode([
            'success' => true,
            'message' => "Google Sheets sync completed. Processed {$syncedCount} rows.",
            'synced_count' => $syncedCount,
        ]);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Sync failed: ' . $e->getMessage()]);
    }
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Method not allowed']);
