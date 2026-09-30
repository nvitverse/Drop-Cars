<?php
/**
 * Admin App (React Native) mirror of the website's Coupons/Promotions
 * admin page (admin/pages/coupons.php). Same `coupons` MySQL table, same
 * actions, JSON in/out with the same static Admin App key used by the
 * enquiry mirror.
 *
 * Auth: header `X-Admin-App-Key` must match ADMIN_APP_API_KEY
 * (config/env.php).
 *
 * GET  ?page=1
 *      -> { success, total_count, page, total_pages, coupons: [...] }
 * POST { action, ...params }
 *      actions: add_or_update, toggle, delete
 *      -> { success, message }
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
require_once __DIR__ . '/../admin/config/database.php'; // $pdo / $GLOBALS['db']

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

function admin_app_coupon_row_out(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'title' => $row['title'] ?? '',
        'code' => $row['code'] ?? '',
        'discount_type' => $row['discount_type'] ?? 'flat',
        'discount_value' => (float) ($row['discount_value'] ?? 0),
        'expiry_date' => $row['expiry_date'] ?? null,
        'apply_to_trip_type' => $row['apply_to_trip_type'] ?? 'all',
        'min_booking_amount' => (float) ($row['min_booking_amount'] ?? 0),
        'is_active' => !empty($row['is_active']),
        'created_at' => $row['created_at'] ?? null,
    ];
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $page = max(1, (int) ($_GET['page'] ?? 1));
        $limit = 50;
        $offset = ($page - 1) * $limit;

        $total = (int) $pdo->query("SELECT COUNT(*) FROM `coupons`")->fetchColumn();
        $totalPages = max(1, (int) ceil($total / $limit));
        $page = min($page, $totalPages);
        $offset = ($page - 1) * $limit;

        $stmt = $pdo->prepare("SELECT * FROM `coupons` ORDER BY `created_at` DESC LIMIT $limit OFFSET $offset");
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'success' => true,
            'total_count' => $total,
            'page' => $page,
            'total_pages' => $totalPages,
            'coupons' => array_map('admin_app_coupon_row_out', $rows),
        ]);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to load coupons: ' . $e->getMessage()]);
    }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $action = trim((string) ($input['action'] ?? ''));

    try {
        switch ($action) {
            case 'add_or_update':
                $id = $input['id'] ?? null;
                $title = trim((string) ($input['title'] ?? ''));
                $code = strtoupper(trim((string) ($input['code'] ?? '')));
                $type = (string) ($input['discount_type'] ?? 'flat');
                $value = (float) ($input['discount_value'] ?? 0);
                $expiry = $input['expiry_date'] ?? null;
                $applyTo = (string) ($input['apply_to_trip_type'] ?? 'all');
                $minAmount = (float) ($input['min_booking_amount'] ?? 0);
                $isActive = !empty($input['is_active']) ? 1 : 0;

                if (!$title || !$code) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'Title and code are required']);
                    break;
                }

                if ($id) {
                    $stmt = $pdo->prepare("UPDATE `coupons` SET
                        `title` = ?, `code` = ?, `discount_type` = ?, `discount_value` = ?, `expiry_date` = ?, `apply_to_trip_type` = ?, `min_booking_amount` = ?, `is_active` = ?
                        WHERE `id` = ?");
                    $stmt->execute([$title, $code, $type, $value, $expiry, $applyTo, $minAmount, $isActive, $id]);
                    echo json_encode(['success' => true, 'message' => "Promotion '{$code}' updated."]);
                } else {
                    $stmt = $pdo->prepare("INSERT INTO `coupons` (`title`, `code`, `discount_type`, `discount_value`, `expiry_date`, `apply_to_trip_type`, `min_booking_amount`, `is_active`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                    $stmt->execute([$title, $code, $type, $value, $expiry, $applyTo, $minAmount, $isActive]);
                    echo json_encode(['success' => true, 'message' => "Promotion '{$code}' created.", 'id' => (int) $pdo->lastInsertId()]);
                }
                break;

            case 'toggle':
                $id = (int) ($input['id'] ?? 0);
                $status = !empty($input['is_active']) ? 1 : 0;
                if ($id <= 0) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'Missing id']);
                    break;
                }
                $pdo->prepare("UPDATE `coupons` SET `is_active` = ? WHERE `id` = ?")->execute([$status, $id]);
                echo json_encode(['success' => true]);
                break;

            case 'delete':
                $id = (int) ($input['id'] ?? 0);
                if ($id <= 0) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'Missing id']);
                    break;
                }
                $pdo->prepare("DELETE FROM `coupons` WHERE `id` = ?")->execute([$id]);
                echo json_encode(['success' => true]);
                break;

            default:
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Unknown action']);
        }
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Action failed: ' . $e->getMessage()]);
    }
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Method not allowed']);
