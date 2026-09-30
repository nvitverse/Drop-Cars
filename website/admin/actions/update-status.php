<?php
/**
 * Update enquiry status (confirmed / fake)
 * On fake: block IP and send to Google Sheets
 */

require_once __DIR__ . '/../includes/session.php';
require_once __DIR__ . '/../config/database.php';
$config = is_file(__DIR__ . '/../config/config.php') ? (include __DIR__ . '/../config/config.php') : [];

header('Content-Type: application/json');

if (empty($_SESSION['admin_id'])) {
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true) ?: $_POST;
$id = (int)($input['id'] ?? 0);
$status = strtolower(trim((string)($input['status'] ?? '')));

if (!in_array($status, ['confirmed', 'fake'], true) || $id < 1) {
    echo json_encode(['success' => false, 'message' => 'Invalid request']);
    exit;
}

$stmt = $pdo->prepare("SELECT id, name, phone, pickup, drop_location, travel_date, ip_address FROM enquiries WHERE id = ?");
$stmt->execute([$id]);
$row = $stmt->fetch();

if (!$row) {
    echo json_encode(['success' => false, 'message' => 'Enquiry not found']);
    exit;
}

$pdo->beginTransaction();
try {
    $stmt = $pdo->prepare("UPDATE enquiries SET status = ?, responded_by = ? WHERE id = ?");
    $stmt->execute([$status, $_SESSION['admin_name'] ?? 'Admin', $id]);

    if ($status === 'fake') {

        $webhook = $config['googleSheetsFakeWebhook'] ?? getenv('GOOGLE_SHEETS_FAKE_WEBHOOK') ?: '';
        if ($webhook) {
            $payload = json_encode([
                'ip' => $row['ip_address'] ?? '',
                'name' => $row['name'] ?? '',
                'phone' => $row['phone'] ?? '',
                'date' => $row['travel_date'] ?? date('Y-m-d'),
            ], JSON_UNESCAPED_UNICODE);
            $ctx = stream_context_create([
                'http' => [
                    'method' => 'POST',
                    'header' => "Content-Type: application/json\r\n",
                    'content' => $payload,
                    'timeout' => 5,
                    'ignore_errors' => true,
                ],
            ]);
            @file_get_contents($webhook, false, $ctx);
        }
    }
    $pdo->commit();
} catch (Exception $e) {
    $pdo->rollBack();
    echo json_encode(['success' => false, 'message' => 'Update failed']);
    exit;
}

echo json_encode(['success' => true, 'status' => $status]);
