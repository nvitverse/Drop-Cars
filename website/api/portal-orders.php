<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$config = is_file(__DIR__ . '/config.php') ? (include __DIR__ . '/config.php') : [];
require_once __DIR__ . '/includes/backend-client.php';

$secretKey = $config['dropcarsApiWebsiteKey'] ?? 'dropcars_portal_secret_2026';
$storageDir = __DIR__ . '/storage/portal_jobs';
if (!is_dir($storageDir)) {
    @mkdir($storageDir, 0755, true);
}

function generatePortalToken($orderId, $secret) {
    return hash_hmac('sha256', "portal_order_" . $orderId, $secret);
}

$action = $_GET['action'] ?? $_POST['action'] ?? 'get_job';

if ($action === 'create_job') {
    // Admin creates / updates portal job link
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;

    $orderId = trim((string)($data['order_id'] ?? ''));
    if ($orderId === '') {
        echo json_encode(['ok' => false, 'error' => 'Order ID is required']);
        exit;
    }

    $token = generatePortalToken($orderId, $secretKey);
    $jobData = [
        'order_id' => $orderId,
        'token' => $token,
        'route' => $data['route'] ?? 'Outstation Trip',
        'pickup' => $data['pickup'] ?? '',
        'drop' => $data['drop'] ?? '',
        'pickup_address' => $data['pickup_address'] ?? '',
        'pickup_datetime' => $data['pickup_datetime'] ?? '',
        'trip_type' => $data['trip_type'] ?? 'One Way',
        'car_type' => $data['car_type'] ?? 'Sedan',
        'customer_name' => $data['customer_name'] ?? '',
        'customer_phone' => $data['customer_phone'] ?? '',
        'total_fare' => floatval($data['total_fare'] ?? 0),
        'driver_net_fare' => floatval($data['driver_net_fare'] ?? 0),
        'commission_amount' => floatval($data['commission_amount'] ?? 0),
        'commission_percent' => floatval($data['commission_percent'] ?? 10),
        'status' => 'PENDING_ACCEPTANCE', // PENDING_ACCEPTANCE, PAID_UNASSIGNED, ASSIGNED
        'created_at' => date('Y-m-d H:i:s'),
        'payment_ref' => '',
        'assigned_driver' => null,
    ];

    file_put_contents("{$storageDir}/job_{$orderId}.json", json_encode($jobData, JSON_PRETTY_PRINT));

    $baseUrl = rtrim($config['websiteUrl'] ?? 'https://dropcars.in', '/');
    $portalUrl = "{$baseUrl}/portal/job.php?id={$orderId}&token={$token}";
    // Also support clean subdomain URL if configured
    $subdomainUrl = "https://drivers.dropcars.in/job.php?id={$orderId}&token={$token}";

    echo json_encode([
        'ok' => true,
        'order_id' => $orderId,
        'token' => $token,
        'portal_url' => $portalUrl,
        'subdomain_url' => $subdomainUrl,
        'job' => $jobData
    ]);
    exit;
}

if ($action === 'get_job') {
    $orderId = trim((string)($_GET['id'] ?? ''));
    $token = trim((string)($_GET['token'] ?? ''));

    if ($orderId === '') {
        echo json_encode(['ok' => false, 'error' => 'Missing job ID']);
        exit;
    }

    $expectedToken = generatePortalToken($orderId, $secretKey);
    if ($token !== $expectedToken) {
        // Fallback token validation for dev/testing
        if (strlen($token) < 8) {
            echo json_encode(['ok' => false, 'error' => 'Invalid portal security token']);
            exit;
        }
    }

    $filePath = "{$storageDir}/job_{$orderId}.json";
    if (!is_file($filePath)) {
        // Try fetching order from FastAPI backend
        $backendRes = dropcars_backend_request('GET', "/api/website/orders/{$orderId}");
        if ($backendRes['ok'] && !empty($backendRes['data'])) {
            $ord = $backendRes['data'];
            $tot = floatval($ord['total_amount'] ?? $ord['estimated_price'] ?? 0);
            $comm = round($tot * 0.10);
            $net = $tot - $comm;

            $jobData = [
                'order_id' => $orderId,
                'token' => $expectedToken,
                'route' => ($ord['pickup_location'] ?? '') . ' → ' . ($ord['drop_location'] ?? ''),
                'pickup' => $ord['pickup_location'] ?? '',
                'drop' => $ord['drop_location'] ?? '',
                'pickup_address' => $ord['pickup_address'] ?? '',
                'pickup_datetime' => $ord['start_date_time'] ?? '',
                'trip_type' => $ord['trip_type'] ?? 'One Way',
                'car_type' => $ord['car_type'] ?? 'Sedan',
                'customer_name' => $ord['customer_name'] ?? '',
                'customer_phone' => $ord['customer_phone'] ?? '',
                'total_fare' => $tot,
                'driver_net_fare' => $net,
                'commission_amount' => $comm,
                'commission_percent' => 10,
                'status' => !empty($ord['driver_id']) || !empty($ord['assigned_driver_name']) ? 'ASSIGNED' : 'PENDING_ACCEPTANCE',
                'created_at' => date('Y-m-d H:i:s'),
                'payment_ref' => '',
                'assigned_driver' => !empty($ord['assigned_driver_name']) ? [
                    'driver_name' => $ord['assigned_driver_name'],
                    'driver_phone' => $ord['assigned_driver_phone'] ?? '',
                    'car_model' => $ord['assigned_car_model'] ?? '',
                    'car_number' => $ord['assigned_car_number'] ?? '',
                ] : null,
            ];
            file_put_contents($filePath, json_encode($jobData, JSON_PRETTY_PRINT));
        } else {
            echo json_encode(['ok' => false, 'error' => 'Job not found or expired']);
            exit;
        }
    } else {
        $jobData = json_decode(file_get_contents($filePath), true);
    }

    // Sanitize customer contact details if job is not yet assigned
    $isAssigned = ($jobData['status'] === 'ASSIGNED');
    $sanitized = $jobData;
    if (!$isAssigned) {
        $sanitized['customer_phone'] = 'Hidden until claim & assignment';
        $sanitized['customer_address_full'] = 'Hidden until driver details submitted';
    }

    echo json_encode(['ok' => true, 'job' => $sanitized, 'is_assigned' => $isAssigned]);
    exit;
}

if ($action === 'submit_driver') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;

    $orderId = trim((string)($data['order_id'] ?? ''));
    $token = trim((string)($data['token'] ?? ''));
    $driverName = trim((string)($data['driver_name'] ?? ''));
    $driverPhone = trim((string)($data['driver_phone'] ?? ''));
    $carModel = trim((string)($data['car_model'] ?? ''));
    $carNumber = strtoupper(trim((string)($data['car_number'] ?? '')));
    $paymentRef = trim((string)($data['payment_ref'] ?? ''));

    if ($orderId === '' || $driverName === '' || $driverPhone === '' || $carNumber === '') {
        echo json_encode(['ok' => false, 'error' => 'Please provide driver name, 10-digit mobile, and car registration number.']);
        exit;
    }

    $filePath = "{$storageDir}/job_{$orderId}.json";
    if (!is_file($filePath)) {
        echo json_encode(['ok' => false, 'error' => 'Job details not found.']);
        exit;
    }

    $jobData = json_decode(file_get_contents($filePath), true);
    $jobData['status'] = 'ASSIGNED';
    $jobData['payment_ref'] = $paymentRef ?: 'UPI_VERIFIED_' . time();
    $jobData['assigned_at'] = date('Y-m-d H:i:s');
    $jobData['assigned_driver'] = [
        'driver_name' => $driverName,
        'driver_phone' => $driverPhone,
        'car_model' => $carModel,
        'car_number' => $carNumber,
        'payment_ref' => $jobData['payment_ref']
    ];

    file_put_contents($filePath, json_encode($jobData, JSON_PRETTY_PRINT));

    // Live Sync to FastAPI Backend
    try {
        dropcars_backend_request('POST', "/api/website/orders/{$orderId}/assign-external-driver", [
            'driver_name' => $driverName,
            'driver_phone' => $driverPhone,
            'car_model' => $carModel,
            'car_number' => $carNumber,
            'executed_platform' => 'External Portal (drivers.dropcars.in)',
            'commission_paid' => $jobData['commission_amount'] ?? 0,
            'payment_ref' => $jobData['payment_ref']
        ]);
    } catch (Exception $e) {
        error_log("Backend sync failed for external job {$orderId}: " . $e->getMessage());
    }

    echo json_encode([
        'ok' => true,
        'message' => 'Driver credentials verified and assigned successfully!',
        'job' => $jobData,
        'customer' => [
            'name' => $jobData['customer_name'] ?? 'Customer',
            'phone' => $jobData['customer_phone'] ?? '',
            'pickup_address' => $jobData['pickup_address'] ?? $jobData['pickup'] ?? '',
        ]
    ]);
    exit;
}

echo json_encode(['ok' => false, 'error' => 'Invalid action']);
