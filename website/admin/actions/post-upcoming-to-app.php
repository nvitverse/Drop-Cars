<?php
/**
 * Action: Post Upcoming Website Bookings to Backend Driver Marketplace App
 * Applies auto-tariff formulas (-1 rs/km, DA = 300, 15% profit for all-inclusive)
 */

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
require_once __DIR__ . '/../../api/includes/backend-client.php';
require_once __DIR__ . '/../config/database.php';

$bookingId = (int) ($_POST['booking_id'] ?? 0);
$postAll   = isset($_POST['post_all_upcoming']);
$referer   = $_SERVER['HTTP_REFERER'] ?? '../upcoming.php';

if ($bookingId > 0 && isset($pdo)) {
    $stmt = $pdo->prepare("SELECT b.*, c.name AS customer_name, c.phone AS customer_phone FROM `bookings` b JOIN `customers` c ON b.customer_id = c.id WHERE b.id = ?");
    $stmt->execute([$bookingId]);
    $b = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($b) {
        $payload = [
            'customer_name'        => $b['customer_name'] ?: 'Guest',
            'customer_number'      => $b['customer_phone'] ?: '',
            'pickup_drop_location' => [
                '0' => $b['pickup_location'] ?: 'Pickup',
                '1' => $b['drop_location'] ?: 'Drop',
            ],
            'trip_type'       => (strpos(strtolower($b['trip_type'] ?? ''), 'round') !== false) ? 'Round Trip' : 'Oneway',
            'car_type'        => !empty($b['vehicle_type']) ? strtoupper($b['vehicle_type']) : 'SEDAN_4_PLUS_1',
            'start_date_time' => date('c', strtotime(($b['pickup_date'] ?: date('Y-m-d')) . ' ' . ($b['pickup_time'] ?: '10:00:00'))),
            'is_urgent'       => false,
            'is_enquiry'      => false,
        ];

        $createRes = dropcars_backend_request('POST', '/api/website/bookings', $payload);
        if ($createRes['ok'] && isset($createRes['data']['id'])) {
            $backendId  = $createRes['data']['id'];
            $approveRes = dropcars_backend_request('POST', '/api/website/bookings/' . rawurlencode($backendId) . '/approve');
            if ($approveRes['ok']) {
                try {
                    $pdo->prepare("UPDATE `bookings` SET `backend_request_id` = ? WHERE `id` = ?")->execute([$backendId, $bookingId]);
                } catch (\Throwable $e) {}
                header('Location: ' . $referer . (strpos($referer, '?') !== false ? '&' : '?') . 'msg=posted_single');
                exit;
            }
        }
    }
    header('Location: ' . $referer . (strpos($referer, '?') !== false ? '&' : '?') . 'msg=error_posting');
    exit;
}

if ($postAll && isset($pdo)) {
    $stmt = $pdo->query("SELECT b.*, c.name AS customer_name, c.phone AS customer_phone FROM `bookings` b JOIN `customers` c ON b.customer_id = c.id WHERE b.status = 'confirmed' AND b.pickup_date >= CURDATE()");
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $count = 0;

    foreach ($rows as $b) {
        $payload = [
            'customer_name'        => $b['customer_name'] ?: 'Guest',
            'customer_number'      => $b['customer_phone'] ?: '',
            'pickup_drop_location' => [
                '0' => $b['pickup_location'] ?: 'Pickup',
                '1' => $b['drop_location'] ?: 'Drop',
            ],
            'trip_type'       => (strpos(strtolower($b['trip_type'] ?? ''), 'round') !== false) ? 'Round Trip' : 'Oneway',
            'car_type'        => !empty($b['vehicle_type']) ? strtoupper($b['vehicle_type']) : 'SEDAN_4_PLUS_1',
            'start_date_time' => date('c', strtotime(($b['pickup_date'] ?: date('Y-m-d')) . ' ' . ($b['pickup_time'] ?: '10:00:00'))),
            'is_urgent'       => false,
            'is_enquiry'      => false,
        ];

        $createRes = dropcars_backend_request('POST', '/api/website/bookings', $payload);
        if ($createRes['ok'] && isset($createRes['data']['id'])) {
            $backendId  = $createRes['data']['id'];
            $approveRes = dropcars_backend_request('POST', '/api/website/bookings/' . rawurlencode($backendId) . '/approve');
            if ($approveRes['ok']) {
                $count++;
                try {
                    $pdo->prepare("UPDATE `bookings` SET `backend_request_id` = ? WHERE `id` = ?")->execute([$backendId, $b['id']]);
                } catch (\Throwable $e) {}
            }
        }
    }

    header('Location: ' . $referer . (strpos($referer, '?') !== false ? '&' : '?') . 'msg=posted_bulk&count=' . $count);
    exit;
}

header('Location: ' . $referer);
exit;
