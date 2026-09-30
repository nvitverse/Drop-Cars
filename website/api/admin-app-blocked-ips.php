<?php
/**
 * Admin App (React Native) mirror of the website's Blocked IPs admin page
 * (admin/pages/blocked-ips.php). Same `blocked_ips` MySQL table, JSON
 * in/out with the same static Admin App key used by the other mirrors.
 *
 * Auth: header `X-Admin-App-Key` must match ADMIN_APP_API_KEY
 * (config/env.php).
 *
 * GET  -> { success, total_count, blocked_ips: [...] }
 * POST { action: 'block' | 'unblock', ...params }
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
require_once __DIR__ . '/../admin/includes/blocked-ips-schema.php';

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

dropcars_ensure_blocked_ips_schema($pdo);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $stmt = $pdo->query('SELECT * FROM `blocked_ips` ORDER BY COALESCE(`blocked_at`, `created_at`) DESC');
        $rows = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
        echo json_encode([
            'success' => true,
            'total_count' => count($rows),
            'blocked_ips' => array_map(static function (array $r): array {
                return [
                    'id' => (int) $r['id'],
                    'ip_address' => $r['ip_address'] ?? '',
                    'reason' => $r['reason'] ?? '',
                    'blocked_at' => $r['blocked_at'] ?? ($r['created_at'] ?? null),
                ];
            }, $rows),
        ]);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to load blocked IPs: ' . $e->getMessage()]);
    }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $action = trim((string) ($input['action'] ?? ''));

    try {
        if ($action === 'unblock') {
            $id = (int) ($input['id'] ?? 0);
            if ($id <= 0) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Missing id']);
                exit;
            }
            $pdo->prepare('DELETE FROM `blocked_ips` WHERE `id` = ?')->execute([$id]);
            echo json_encode(['success' => true]);
        } elseif ($action === 'block') {
            $ip = trim((string) ($input['ip_address'] ?? ''));
            $reason = trim((string) ($input['reason'] ?? 'Blocked from Admin App'));
            if (!filter_var($ip, FILTER_VALIDATE_IP)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Enter a valid IP address']);
                exit;
            }
            $pdo->prepare('INSERT IGNORE INTO `blocked_ips` (`ip_address`, `reason`) VALUES (?, ?)')->execute([$ip, $reason]);
            echo json_encode(['success' => true]);
        } else {
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
