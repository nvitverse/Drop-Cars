<?php
date_default_timezone_set('Asia/Kolkata');
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed. Use POST.']);
    exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid request body.']);
    exit;
}

$partnerType = trim((string)($data['partnerType'] ?? 'Partner'));
$fullName = trim((string)($data['fullName'] ?? ''));
$rawEmail = trim((string)($data['email'] ?? ''));
$email = '';
if ($rawEmail !== '') {
    require_once __DIR__ . '/../helpers/email-sanitizer.php';
    $sanitized = dropcars_sanitize_and_fix_email($rawEmail, false);
    $email = $sanitized['valid'] ? $sanitized['email'] : $rawEmail;
}
$city = trim((string)($data['city'] ?? ''));
$companyName = trim((string)($data['companyName'] ?? ''));
$fleetSize = trim((string)($data['fleetSize'] ?? ''));
$vehicleModel = trim((string)($data['vehicleModel'] ?? ''));
$vehicleNumber = trim((string)($data['vehicleNumber'] ?? ''));
$message = trim((string)($data['message'] ?? ''));

if ($fullName === '' || $phone === '' || $city === '') {
    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Please fill required fields.']);
    exit;
}

$configPath = __DIR__ . '/config.php';
if (!is_file($configPath)) {
    $configPath = __DIR__ . '/config.example.php';
}
$config = is_file($configPath) ? (include $configPath) : [];
$isExampleConfig = basename($configPath) === 'config.example.php';

require_once __DIR__ . '/smtp-settings.php';
$smtp = dropcars_resolve_smtp($config, $isExampleConfig);
$mailFrom = $smtp['mailFrom'];
$mailTo = 'dropcarsbookings@gmail.com';
$mailFromName = $smtp['mailFromName'];
$appPassword = $smtp['appPassword'];

$requestId = 'PR-' . date('YmdHis') . '-' . substr((string)microtime(true), -4);
$subject = "🤝 {$partnerType} Request {$requestId} - {$fullName}";

$safe = static function ($value) {
    return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
};

$bodyHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
body{font-family:Arial,sans-serif;color:#22324d;}
.wrap{max-width:650px;margin:0 auto;background:#f5f8ff;border:1px solid #dbe5f6;border-radius:14px;padding:18px;}
.head{background:linear-gradient(135deg,#0b4a8f 0%,#0e2f56 100%);padding:16px;border-radius:10px;color:#fff;}
.head h1{margin:0;font-size:22px;color:#fff;}
.head p{margin:6px 0 0;font-size:13px;color:#fff;}
.card{margin-top:14px;background:#fff;border:1px solid #dbe5f6;border-radius:10px;overflow:hidden;}
.title{background:#edf4ff;color:#0b4a8f;font-size:13px;font-weight:700;padding:9px 12px;border-bottom:1px solid #dbe5f6;text-transform:uppercase;}
.row{display:flex;gap:10px;padding:10px 12px;border-bottom:1px solid #edf2fb;font-size:14px;}
.row:last-child{border-bottom:none;}
.k{min-width:170px;color:#64748b;font-weight:700;}
.v{color:#0e2f56;font-weight:600;}
</style></head><body><div class="wrap">
<div class="head"><h1>Drop Cars Partner Request</h1><p>Request ID: ' . $safe($requestId) . '</p></div>
<div class="card"><div class="title">Partner Details</div>
<div class="row"><div class="k">Partner Type</div><div class="v">' . $safe($partnerType) . '</div></div>
<div class="row"><div class="k">Name</div><div class="v">' . $safe($fullName) . '</div></div>
<div class="row"><div class="k">Phone</div><div class="v">' . $safe($phone) . '</div></div>
<div class="row"><div class="k">Email</div><div class="v">' . $safe($email !== '' ? $email : 'N/A') . '</div></div>
<div class="row"><div class="k">City</div><div class="v">' . $safe($city) . '</div></div>
<div class="row"><div class="k">Company Name</div><div class="v">' . $safe($companyName !== '' ? $companyName : 'N/A') . '</div></div>
<div class="row"><div class="k">Fleet Size</div><div class="v">' . $safe($fleetSize !== '' ? $fleetSize : 'N/A') . '</div></div>
<div class="row"><div class="k">Vehicle Model</div><div class="v">' . $safe($vehicleModel !== '' ? $vehicleModel : 'N/A') . '</div></div>
<div class="row"><div class="k">Vehicle Number</div><div class="v">' . $safe($vehicleNumber !== '' ? $vehicleNumber : 'N/A') . '</div></div>
<div class="row"><div class="k">Message</div><div class="v">' . $safe($message !== '' ? $message : 'N/A') . '</div></div>
</div></div></body></html>';

$bodyPlain = "Drop Cars Partner Request\n";
$bodyPlain .= "Request ID: {$requestId}\n";
$bodyPlain .= "Partner Type: {$partnerType}\n";
$bodyPlain .= "Name: {$fullName}\n";
$bodyPlain .= "Phone: {$phone}\n";
$bodyPlain .= "Email: " . ($email !== '' ? $email : 'N/A') . "\n";
$bodyPlain .= "City: {$city}\n";
$bodyPlain .= "Company Name: " . ($companyName !== '' ? $companyName : 'N/A') . "\n";
$bodyPlain .= "Fleet Size: " . ($fleetSize !== '' ? $fleetSize : 'N/A') . "\n";
$bodyPlain .= "Vehicle Model: " . ($vehicleModel !== '' ? $vehicleModel : 'N/A') . "\n";
$bodyPlain .= "Vehicle Number: " . ($vehicleNumber !== '' ? $vehicleNumber : 'N/A') . "\n";
$bodyPlain .= "Message: " . ($message !== '' ? $message : 'N/A') . "\n";

$emailSent = false;
$enableEmail = $config['enableEmailNotifications'] ?? true;
$phpmailerPath = __DIR__ . '/phpmailer/src/PHPMailer.php';
if ($enableEmail && $appPassword !== '' && is_file($phpmailerPath)) {
    require_once __DIR__ . '/phpmailer/src/Exception.php';
    require_once __DIR__ . '/phpmailer/src/PHPMailer.php';
    require_once __DIR__ . '/phpmailer/src/SMTP.php';
    $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->Host = 'smtp.gmail.com';
        $mail->SMTPAuth = true;
        $mail->SMTPSecure = 'tls';
        $mail->Port = 587;
        dropcars_phpmailer_apply_smtp($mail, $smtp);
        $mail->addAddress($mailTo);
        $mail->CharSet = 'UTF-8';
        $mailDomain = 'dropcars.in';
        if (!empty($smtp['mailFrom']) && strpos($smtp['mailFrom'], '@') !== false) {
            $mailDomain = substr(strrchr($smtp['mailFrom'], '@'), 1);
        }
        $mail->MessageID = '<partner-' . uniqid('', true) . '@' . $mailDomain . '>';
        $mail->addCustomHeader('X-Entity-Ref-ID', 'partner-' . $requestId . '-' . uniqid());
        $mail->Subject = $subject;
        $mail->Body = $bodyHtml;
        $mail->AltBody = $bodyPlain;
        $mail->isHTML(true);
        $mail->send();
        $emailSent = true;
    } catch (Exception $e) {
        error_log('Drop Cars partner-request email error: ' . $e->getMessage());
    }
}

$storageDir = __DIR__ . '/storage';
if (!is_dir($storageDir)) {
    @mkdir($storageDir, 0775, true);
}
$logEntry = [
    'type' => 'PARTNER_REQUEST',
    'requestId' => $requestId,
    'partnerType' => $partnerType,
    'fullName' => $fullName,
    'phone' => $phone,
    'email' => $email,
    'city' => $city,
    'companyName' => $companyName,
    'fleetSize' => $fleetSize,
    'vehicleModel' => $vehicleModel,
    'vehicleNumber' => $vehicleNumber,
    'message' => $message,
    'emailSent' => $emailSent,
    'createdAt' => date('c')
];
@file_put_contents($storageDir . '/partner-requests.jsonl', json_encode($logEntry, JSON_UNESCAPED_UNICODE) . PHP_EOL, FILE_APPEND | LOCK_EX);

// Also persist into the `enquiries` table so this lead shows up in the
// Admin App CRM (api/admin-app-enquiries.php reads from `enquiries`) instead
// of only being reachable by staff checking email / the jsonl log.
try {
    if (!defined('DROP_CARS_DB_OPTIONAL')) {
        define('DROP_CARS_DB_OPTIONAL', true);
    }
    require_once __DIR__ . '/../admin/config/database.php';
    if ((!isset($pdo) || !$pdo instanceof PDO) && !empty($GLOBALS['db']) && $GLOBALS['db'] instanceof PDO) {
        $pdo = $GLOBALS['db'];
    }
    if (isset($pdo) && $pdo instanceof PDO) {
        require_once __DIR__ . '/../admin/includes/enquiries-schema.php';
        dropcars_ensure_enquiries_columns($pdo);

        $tripType = (strtolower($partnerType) === 'fleet') ? 'fleet_partner' : 'driver_partner';
        $enquiryBookingId = dropcars_next_enquiry_booking_id($pdo, 'E');
        $clientIp = trim(explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['HTTP_X_REAL_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? ''))[0] ?? '');
        $partnerNotes = "[Partner Request {$requestId}] Company: " . ($companyName !== '' ? $companyName : 'N/A')
            . ", Fleet Size: " . ($fleetSize !== '' ? $fleetSize : 'N/A')
            . ", Vehicle Number: " . ($vehicleNumber !== '' ? $vehicleNumber : 'N/A')
            . ($message !== '' ? ", Message: {$message}" : '');

        $sqlPartnerEnquiry = "INSERT INTO `enquiries`
            (`name`, `phone`, `pickup`, `drop_location`, `trip_type`, `vehicle_type`, `travel_date`, `fare_estimate`, `fare_type`, `ip_address`, `source`, `source_page`, `status`, `booking_id`, `website`, `dispatcher_notes`)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'base', ?, 'organic', ?, 'not_confirmed', ?, 'dropcars.in', ?)";
        $pdo->prepare($sqlPartnerEnquiry)->execute([
            $fullName,
            $phone,
            $city,
            $companyName !== '' ? $companyName : ($partnerType . ' Partner'),
            $tripType,
            $vehicleModel,
            date('Y-m-d'),
            $clientIp,
            $partnerType . ' Partner Request Page',
            $enquiryBookingId,
            $partnerNotes
        ]);
    }
} catch (Throwable $e) {
    error_log('Drop Cars partner-request enquiries insert error: ' . $e->getMessage());
}

if (!$emailSent) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Unable to send partner request email right now.']);
    exit;
}

echo json_encode(['success' => true, 'message' => 'Partner request sent successfully.', 'requestId' => $requestId]);

