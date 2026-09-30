<?php
/**
 * Live System Diagnostics Engine - Premium Edition
 * Runs comprehensive self-tests and outputs logs for admin settings.
 */

require_once __DIR__ . '/../includes/session.php';
require_once __DIR__ . '/../config/database.php';
$config = is_file(__DIR__ . '/../../api/config.php') ? (include __DIR__ . '/../../api/config.php') : [];

header('Content-Type: application/json');

if (empty($_SESSION['admin_id'])) {
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

$action = $_GET['action'] ?? 'run';

if ($action === 'run') {
    $results = [];

    // --- 1. Database Check ---
    $dbLog = [];
    $dbStatus = 'success';
    $dbMsg = 'Connected';
    try {
        $dbLog[] = "Initializing PDO Database connection check...";
        if (isset($pdo) && $pdo instanceof PDO) {
            $stmt = $pdo->query("SELECT 1");
            if ($stmt) {
                $dbLog[] = "Database connectivity: OK. Successfully executed 'SELECT 1'.";
                // Get enquiry count as test query
                $countStmt = $pdo->query("SELECT COUNT(*) FROM enquiries");
                $enquiryCount = $countStmt ? $countStmt->fetchColumn() : 0;
                $dbLog[] = "Active database state: total enquiries recorded = {$enquiryCount}.";
            } else {
                throw new Exception("SQL execution failed.");
            }
        } else {
            throw new Exception("PDO instance not initialized.");
        }
    } catch (Throwable $e) {
        $dbStatus = 'error';
        $dbMsg = 'Failed: ' . $e->getMessage();
        $dbLog[] = "Database error encountered: " . $e->getMessage();
    }
    $results['db'] = [
        'status' => $dbStatus,
        'message' => $dbMsg,
        'log' => implode("\n", $dbLog)
    ];

    // --- 2. SMTP Check ---
    $smtpLog = [];
    $smtpStatus = 'success';
    $smtpMsg = 'Configured';
    $smtpLog[] = "Resolving SMTP configuration settings...";
    
    $smtpHelper = dirname(__DIR__, 2) . '/api/smtp-settings.php';
    if (is_file($smtpHelper)) {
        require_once $smtpHelper;
        if (function_exists('dropcars_resolve_smtp')) {
            $smtp = dropcars_resolve_smtp($config);
            $smtpLog[] = "Mail From: " . ($smtp['mailFrom'] ?: '(Empty)');
            $smtpLog[] = "Mail To: " . ($smtp['mailTo'] ?: '(Empty)');
            $smtpLog[] = "SMTP Username: " . ($smtp['smtpUser'] ?: '(Empty)');
            $smtpLog[] = "App Password: " . ($smtp['appPassword'] ? '******** (Set)' : '(Empty)');
            
            // Connect test
            $smtpLog[] = "Testing TCP Port connections to Gmail SMTP servers...";
            $gmailPort587 = @fsockopen('smtp.gmail.com', 587, $errno, $errstr, 3);
            if ($gmailPort587) {
                $smtpLog[] = "Connection to smtp.gmail.com:587 (TLS): SUCCESSFUL.";
                fclose($gmailPort587);
            } else {
                $smtpLog[] = "Connection to smtp.gmail.com:587 (TLS): BLOCKED. Error {$errno}: {$errstr}";
            }
            
            $gmailPort465 = @fsockopen('ssl://smtp.gmail.com', 465, $errno, $errstr, 3);
            if ($gmailPort465) {
                $smtpLog[] = "Connection to smtp.gmail.com:465 (SSL): SUCCESSFUL.";
                fclose($gmailPort465);
            } else {
                $smtpLog[] = "Connection to smtp.gmail.com:465 (SSL): BLOCKED. Error {$errno}: {$errstr}";
            }

            if ($smtp['hostingerSmtpUser'] !== '') {
                $smtpLog[] = "Hostinger Fallback configured. Testing Hostinger SMTP connection...";
                $hostingerPort = @fsockopen('ssl://smtp.hostinger.com', 465, $errno, $errstr, 3);
                if ($hostingerPort) {
                    $smtpLog[] = "Connection to smtp.hostinger.com:465 (SSL): SUCCESSFUL.";
                    fclose($hostingerPort);
                } else {
                    $smtpLog[] = "Connection to smtp.hostinger.com:465 (SSL): BLOCKED. Error {$errno}: {$errstr}";
                }
            } else {
                $smtpLog[] = "Hostinger Fallback SMTP is not configured.";
            }
        } else {
            $smtpStatus = 'warning';
            $smtpMsg = 'SMTP settings function not found';
            $smtpLog[] = "Error: dropcars_resolve_smtp() function not available.";
        }
    } else {
        $smtpStatus = 'error';
        $smtpMsg = 'smtp-settings.php missing';
        $smtpLog[] = "Error: File api/smtp-settings.php is missing from the server.";
    }
    $results['smtp'] = [
        'status' => $smtpStatus,
        'message' => $smtpMsg,
        'log' => implode("\n", $smtpLog)
    ];

    // --- 3. Telegram Check ---
    $tgLog = [];
    $tgStatus = 'success';
    $tgMsg = 'Not Configured';
    $botToken = trim($config['telegramBotToken'] ?? '');
    if ($botToken !== '') {
        $tgLog[] = "Telegram Bot token detected. Verifying Bot Token with Telegram API...";
        // Call Telegram getMe endpoint
        $url = "https://api.telegram.org/bot{$botToken}/getMe";
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 5);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($httpCode === 200) {
            $botData = json_decode($response, true);
            $botUser = $botData['result']['username'] ?? 'UnknownBot';
            $botName = $botData['result']['first_name'] ?? 'Bot';
            $tgLog[] = "Telegram API Handshake: SUCCESS.";
            $tgLog[] = "Bot details: Name = '{$botName}', Username = '@{$botUser}'.";
            $tgMsg = "Bot: @{$botUser}";
            
            $chatIds = (array)($config['telegramChatIds'] ?? []);
            if (!empty($chatIds)) {
                $tgLog[] = "Configured Chat IDs: " . implode(', ', $chatIds);
            } else {
                $tgStatus = 'warning';
                $tgLog[] = "Warning: No Chat IDs are configured in settings. Alerts will not be delivered.";
                $tgMsg = "No Chat IDs";
            }
        } else {
            $tgStatus = 'error';
            $tgMsg = "API Error (HTTP {$httpCode})";
            $tgLog[] = "Telegram API Handshake: FAILED. HTTP Status Code: {$httpCode}.";
            $tgLog[] = "Response details: " . substr($response, 0, 300);
        }
    } else {
        $tgLog[] = "Telegram notification token is not configured in settings.";
    }
    $results['telegram'] = [
        'status' => $tgStatus,
        'message' => $tgMsg,
        'log' => implode("\n", $tgLog)
    ];

    // --- 4. Google Sheets Check ---
    $sheetLog = [];
    $sheetStatus = 'success';
    $sheetMsg = 'Not Enabled';
    $syncEnabled = (bool)($config['enableGoogleSheetSync'] ?? false);
    if ($syncEnabled) {
        $sheetLog[] = "Google Sheets synchronization: ENABLED.";
        $webhook = trim($config['googleSheetsWebhookUrl'] ?? '');
        $token = trim($config['googleSheetsWebhookToken'] ?? '');
        if ($webhook !== '') {
            $sheetLog[] = "Webhook URL: " . $webhook;
            $sheetLog[] = "Auth Token: " . ($token ? '******** (Set)' : '(Empty)');
            $sheetMsg = 'Enabled & Configured';
        } else {
            $sheetStatus = 'warning';
            $sheetMsg = 'Webhook Missing';
            $sheetLog[] = "Warning: Webhook URL is missing in configurations.";
        }
    } else {
        $sheetLog[] = "Google Sheets synchronization: DISABLED.";
    }
    $results['sheets'] = [
        'status' => $sheetStatus,
        'message' => $sheetMsg,
        'log' => implode("\n", $sheetLog)
    ];

    // --- 5. Writable Directories Check ---
    $dirLog = [];
    $dirStatus = 'success';
    $dirMsg = 'Writable';
    $root = dirname(__DIR__, 2);
    $dirs = [
        'tmp' => $root . '/tmp',
        'data' => $root . '/data',
        'api' => $root . '/api',
        'admin/config' => __DIR__ . '/../config',
    ];
    foreach ($dirs as $name => $path) {
        $dirLog[] = "Checking directory: {$name}...";
        if (is_dir($path)) {
            $isWritable = is_writable($path);
            $dirLog[] = " - Exists: YES";
            $dirLog[] = " - Writable: " . ($isWritable ? 'YES' : 'NO');
            if (!$isWritable) {
                $dirStatus = 'error';
                $dirMsg = 'Permissions Blocked';
            }
        } else {
            $dirLog[] = " - Exists: NO (Warning: directory does not exist!)";
            $dirStatus = 'warning';
            $dirMsg = 'Missing Directories';
        }
    }
    $results['folders'] = [
        'status' => $dirStatus,
        'message' => $dirMsg,
        'log' => implode("\n", $dirLog)
    ];

    // --- 6. WhatsApp / SMS Gateways ---
    $gwLog = [];
    $gwStatus = 'success';
    $gwMsg = 'None';
    $smsGateway = $config['smsGateway'] ?? 'none';
    $waGateway = $config['whatsappGateway'] ?? 'none';
    
    $gwLog[] = "SMS Gateway: " . strtoupper($smsGateway);
    $gwLog[] = "WhatsApp Gateway: " . strtoupper($waGateway);

    if ($smsGateway !== 'none' || $waGateway !== 'none') {
        $gwMsg = 'Configured';
        // Verify Twilio
        if ($smsGateway === 'twilio' || $waGateway === 'twilio') {
            $sid = trim($config['smsTwilioSid'] ?? '');
            $token = trim($config['smsApiKey'] ?? '');
            if ($sid === '' || $token === '') {
                $gwStatus = 'error';
                $gwMsg = 'Twilio Credentials Missing';
                $gwLog[] = "Error: Twilio Sid or Token is missing in configuration.";
            } else {
                $gwLog[] = "Twilio credentials: Set.";
            }
        }
        // Verify generic WhatsApp
        if ($waGateway === 'generic') {
            $gwUrl = trim($config['whatsappGenericUrl'] ?? '');
            if ($gwUrl === '') {
                $gwStatus = 'error';
                $gwMsg = 'Generic URL Missing';
                $gwLog[] = "Error: Generic WhatsApp API endpoint URL is missing.";
            } else {
                $gwLog[] = "Generic WhatsApp endpoint: " . $gwUrl;
            }
        }
    } else {
        $gwLog[] = "WhatsApp and SMS booking alert confirmation gateways are disabled.";
    }
    $results['whatsapp'] = [
        'status' => $gwStatus,
        'message' => $gwMsg,
        'log' => implode("\n", $gwLog)
    ];

    // --- JSON Configurations Check ---
    $configFilesLog = [];
    $configFilesStatus = 'success';
    $configFilesMsg = 'Healthy';
    $jsonFiles = [
        'tariffs.json' => $root . '/data/tariffs.json',
        'cities.json' => $root . '/data/cities.json',
        'themes.json' => $root . '/data/themes.json',
    ];
    foreach ($jsonFiles as $name => $path) {
        $configFilesLog[] = "Verifying configuration database file: {$name}...";
        if (is_file($path)) {
            $content = @file_get_contents($path);
            if ($content !== false) {
                $decoded = json_decode($content, true);
                if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                    $configFilesLog[] = " - Exists: YES";
                    $configFilesLog[] = " - Parse JSON: SUCCESS (" . count($decoded) . " records found)";
                } else {
                    $configFilesStatus = 'error';
                    $configFilesMsg = 'Corrupted JSON';
                    $configFilesLog[] = " - Parse JSON: FAILED. Syntax error in {$name}!";
                }
            } else {
                $configFilesStatus = 'error';
                $configFilesMsg = 'Read Error';
                $configFilesLog[] = " - Read: FAILED. Could not read {$name}!";
            }
        } else {
            $configFilesStatus = 'warning';
            $configFilesMsg = 'Missing JSON Databases';
            $configFilesLog[] = " - Exists: NO (Warning: {$name} is missing. Optional component/page may fail)";
        }
    }
    $results['configs'] = [
        'status' => $configFilesStatus,
        'message' => $configFilesMsg,
        'log' => implode("\n", $configFilesLog)
    ];

    echo json_encode([
        'success' => true,
        'results' => $results
    ]);
    exit;
}

if ($action === 'test_email') {
    // Send a real test email
    $smtpHelper = dirname(__DIR__, 2) . '/api/smtp-settings.php';
    if (!is_file($smtpHelper)) {
        echo json_encode(['success' => false, 'message' => 'smtp-settings.php file missing']);
        exit;
    }
    require_once $smtpHelper;
    $smtp = dropcars_resolve_smtp($config);
    
    $mailTo = $smtp['mailTo'] ?: 'dropcarsbookings@gmail.com';
    $subject = "Drop Cars Admin SMTP Self-Test";
    
    $htmlBody = "
    <div style='font-family: Arial, sans-serif; padding: 20px; color: #333;'>
        <h2 style='color: #0ea5e9;'>✅ Drop Cars SMTP Diagnostic Test Successful</h2>
        <p>This email confirms that your web server's SMTP mail configurations are fully operational!</p>
        <hr style='border:0;border-top:1px solid #ddd;'>
        <p style='font-size:0.8rem;color:#777;'>Sender ID: {$smtp['smtpUser']}<br>Recipient: {$mailTo}<br>Timestamp: " . date('Y-m-d H:i:s') . "</p>
    </div>";
    
    $plainBody = "Drop Cars SMTP Test Successful!\n\nSender: {$smtp['smtpUser']}\nRecipient: {$mailTo}\nTimestamp: " . date('Y-m-d H:i:s');
    
    $phpmailerDir = dirname(__DIR__, 2) . '/api/phpmailer/src';
    $result = dropcars_send_mail_with_fallback($smtp, $phpmailerDir, $mailTo, $subject, $htmlBody, $plainBody);
    
    echo json_encode([
        'success' => $result['ok'],
        'message' => $result['ok'] ? "Test email sent successfully to {$mailTo}." : "Send failed: " . $result['error'],
        'error' => $result['error'] ?? null
    ]);
    exit;
}
