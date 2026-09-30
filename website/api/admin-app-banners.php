<?php
/**
 * Admin App (React Native) mirror of the website's Banners admin page
 * (admin/pages/banners.php). Same `banners` MySQL table, JSON in/out with
 * the same static Admin App key used by the other mirrors.
 *
 * Auth: header `X-Admin-App-Key` must match ADMIN_APP_API_KEY
 * (config/env.php).
 *
 * GET  -> { success, banners: [...] }
 * POST { action: 'add_or_update' | 'toggle' | 'delete', ...params }
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

function admin_app_banner_row_out(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'type' => $row['type'] ?? 'image',
        'content' => $row['content'] ?? '',
        'link_url' => $row['link_url'] ?? '',
        'coupon_code' => $row['coupon_code'] ?? '',
        'is_popup' => !empty($row['is_popup']),
        'is_active' => !empty($row['is_active']),
        'created_at' => $row['created_at'] ?? null,
    ];
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $reqType = $_GET['type'] ?? '';
    if ($reqType === 'festival') {
        $cfgPath = dirname(__DIR__) . '/api/config.php';
        $cfg = is_file($cfgPath) ? (include $cfgPath) : [];
        echo json_encode([
            'success' => true,
            'festival' => [
                'festivalEnabled' => !empty($cfg['festivalEnabled']),
                'festivalName' => (string) ($cfg['festivalName'] ?? ''),
                'festivalMessage' => (string) ($cfg['festivalMessage'] ?? ''),
                'festivalDiscountPct' => (int) ($cfg['festivalDiscountPct'] ?? 0),
                'festivalStartsAt' => (string) ($cfg['festivalStartsAt'] ?? ''),
                'festivalEndsAt' => (string) ($cfg['festivalEndsAt'] ?? ''),
                'festivalPromoCode' => (string) ($cfg['festivalPromoCode'] ?? ''),
            ],
        ]);
        exit;
    }

    try {
        $stmt = $pdo->query('SELECT * FROM `banners` ORDER BY `id` DESC');
        $rows = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
        echo json_encode([
            'success' => true,
            'banners' => array_map('admin_app_banner_row_out', $rows),
        ]);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to load banners: ' . $e->getMessage()]);
    }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $action = trim((string) ($input['action'] ?? ''));

    if ($action === 'save_festival') {
        try {
            $cfgPath = dirname(__DIR__) . '/api/config.php';
            $cfg = is_file($cfgPath) ? (include $cfgPath) : [];
            $fest = $input['festival'] ?? [];
            $cfg['festivalEnabled'] = !empty($fest['festivalEnabled']);
            $cfg['festivalName'] = trim((string) ($fest['festivalName'] ?? ''));
            $cfg['festivalMessage'] = trim((string) ($fest['festivalMessage'] ?? ''));
            $cfg['festivalDiscountPct'] = (int) ($fest['festivalDiscountPct'] ?? 0);
            $cfg['festivalStartsAt'] = trim((string) ($fest['festivalStartsAt'] ?? ''));
            $cfg['festivalEndsAt'] = trim((string) ($fest['festivalEndsAt'] ?? ''));
            $cfg['festivalPromoCode'] = strtoupper(trim((string) ($fest['festivalPromoCode'] ?? '')));

            file_put_contents($cfgPath, "<?php\nreturn " . var_export($cfg, true) . ";\n");
            echo json_encode(['success' => true, 'message' => 'Festival settings saved live to website.']);
        } catch (Throwable $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Failed to save festival: ' . $e->getMessage()]);
        }
        exit;
    }

    try {
        switch ($action) {
            case 'add_or_update':
                $id = $input['id'] ?? null;
                $type = (string) ($input['type'] ?? 'image');
                $content = trim((string) ($input['content'] ?? ''));
                $linkUrl = trim((string) ($input['link_url'] ?? ''));
                $couponCode = strtoupper(trim((string) ($input['coupon_code'] ?? '')));
                $isPopup = !empty($input['is_popup']) ? 1 : 0;
                $isActive = !empty($input['is_active']) ? 1 : 0;

                if (!$content) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'Content (message or image URL) is required']);
                    break;
                }

                if ($id) {
                    $stmt = $pdo->prepare("UPDATE `banners` SET
                        `type` = ?, `content` = ?, `link_url` = ?, `coupon_code` = ?, `is_popup` = ?, `is_active` = ?
                        WHERE `id` = ?");
                    $stmt->execute([$type, $content, $linkUrl, $couponCode, $isPopup, $isActive, $id]);
                    echo json_encode(['success' => true, 'message' => 'Banner updated.']);
                } else {
                    $stmt = $pdo->prepare("INSERT INTO `banners` (`type`, `content`, `link_url`, `coupon_code`, `is_popup`, `is_active`) VALUES (?, ?, ?, ?, ?, ?)");
                    $stmt->execute([$type, $content, $linkUrl, $couponCode, $isPopup, $isActive]);
                    echo json_encode(['success' => true, 'message' => 'Banner created.', 'id' => (int) $pdo->lastInsertId()]);
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
                $pdo->prepare("UPDATE `banners` SET `is_active` = ? WHERE `id` = ?")->execute([$status, $id]);
                echo json_encode(['success' => true]);
                break;

            case 'delete':
                $id = (int) ($input['id'] ?? 0);
                if ($id <= 0) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'Missing id']);
                    break;
                }
                $pdo->prepare("DELETE FROM `banners` WHERE `id` = ?")->execute([$id]);
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
