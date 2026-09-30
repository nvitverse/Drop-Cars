<?php
/**
 * Public API to fetch settings for a specific registered site
 */

header('Content-Type: application/json; charset=utf-8');

// Allow cross-origin requests from other domains (since websites are on different domains)
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../admin/includes/functions.php';

$siteSlug = isset($_GET['site']) ? preg_replace('/[^a-z0-9_]/', '', strtolower(trim((string)$_GET['site']))) : '';

if ($siteSlug === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing site parameter']);
    exit;
}

try {
    // Check if the site is registered and active
    $stmt = $pdo->prepare("SELECT `slug`, `display_name`, `domain_name`, `status` FROM `registered_sites` WHERE `slug` = ? LIMIT 1");
    $stmt->execute([$siteSlug]);
    $site = $stmt->fetch();

    if (!$site) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Website not registered']);
        exit;
    }

    if ($site['status'] !== 'active') {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Website is suspended/inactive']);
        exit;
    }

    // Load configurations from site_configs (merged with global default config)
    $config = dropcars_get_site_config_json($pdo, $siteSlug);

    // Strip sensitive local DB configs or system paths
    unset(
        $config['dbHost'],
        $config['dbName'],
        $config['dbUser'],
        $config['dbPass'],
        $config['adminSessionSavePath']
    );

    echo json_encode([
        'success' => true,
        'site' => [
            'slug' => $site['slug'],
            'display_name' => $site['display_name'],
            'domain_name' => $site['domain_name'],
        ],
        'settings' => $config
    ]);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Internal server error: ' . $e->getMessage()]);
}
