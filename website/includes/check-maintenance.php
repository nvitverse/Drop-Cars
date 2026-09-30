<?php
/**
 * Maintenance Mode Gatekeeper
 * 
 * Safeguards the public site during updates while ensuring 
 * administrative access remains uninterrupted.
 */

$configPath = __DIR__ . '/../api/config.php';
$config = is_file($configPath) ? (include $configPath) : [];

if (!empty($config['maintenanceMode'])) {
    $requestUri = $_SERVER['REQUEST_URI'] ?? '';
    
    // CRITICAL: We EXCLUDE the admin panel and static assets from maintenance mode.
    // This allows you to log in at /admin to disable maintenance mode.
    $allowedPaths = ['/admin', '/assets', '/api/receive-enquiry.php'];
    $isAllowed = false;
    
    foreach ($allowedPaths as $path) {
        if (stripos($requestUri, $path) !== false) {
            $isAllowed = true;
            break;
        }
    }
    
    if (!$isAllowed) {
        http_response_code(503); // Service Unavailable
        header('Retry-After: 3600');
        require_once __DIR__ . '/maintenance-page.php';
        exit;
    }
}
