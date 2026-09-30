<?php
/**
 * Drop Cars – SMTP Diagnostic Test
 * ⚠️  DELETE this file from the server after testing!
 *
 * SECURITY: this endpoint used to gate on a hardcoded token
 * ("dropcarstest2024") committed in source, which meant anyone who ever
 * saw this file (repo access, code review, leaked backup) could trigger
 * outbound test emails and read masked SMTP config in production. It now
 * fails CLOSED by default: it only runs if the server environment defines
 * SMTP_TEST_TOKEN, and the supplied ?token= must match it via a
 * timing-safe comparison. Set SMTP_TEST_TOKEN in the server/hosting
 * environment (not in source) only while actively debugging, then unset
 * it — or better, delete this file entirely once SMTP is confirmed
 * working.
 *
 * Access: https://dropcars.in/api/test-smtp.php?token=<SMTP_TEST_TOKEN value>
 */
$expectedToken = getenv('SMTP_TEST_TOKEN') ?: '';
$suppliedToken = $_GET['token'] ?? '';
if ($expectedToken === '' || !hash_equals($expectedToken, (string)$suppliedToken)) {
    http_response_code(403);
    die('Forbidden. This diagnostic is disabled unless SMTP_TEST_TOKEN is set in the server environment.');
}

header('Content-Type: text/plain; charset=utf-8');

echo "=== Drop Cars SMTP Diagnostic ===\n\n";
echo "PHP Version: " . PHP_VERSION . "\n";
echo "SAPI: " . php_sapi_name() . "\n\n";

// Load config
$configPath = __DIR__ . '/config.php';
if (!is_file($configPath)) {
    $configPath = __DIR__ . '/config.example.php';
}
$config = include $configPath;
echo "Config file: " . basename($configPath) . "\n";
echo "SMTP User: " . (isset($config['smtpUsername']) ? preg_replace('/^(.{2}).*(@.*)$/', '$1***$2', (string)$config['smtpUsername']) : 'NOT SET') . "\n";
echo "Mail From: " . (isset($config['mailFrom']) ? preg_replace('/^(.{2}).*(@.*)$/', '$1***$2', (string)$config['mailFrom']) : 'NOT SET') . "\n";
echo "Mail To:   " . (isset($config['mailTo']) ? preg_replace('/^(.{2}).*(@.*)$/', '$1***$2', (string)$config['mailTo']) : 'NOT SET') . "\n";

$pwd = $config['gmailAppPassword'] ?? '';
echo "App Password: " . ($pwd !== '' ? 'SET (' . strlen($pwd) . ' chars, hidden)' : 'NOT SET') . "\n\n";

// Check PHPMailer
$phpmailerPath = __DIR__ . '/phpmailer/src/PHPMailer.php';
if (!is_file($phpmailerPath)) {
    die("ERROR: PHPMailer not found at: {$phpmailerPath}\n");
}
echo "PHPMailer: Found ✓\n\n";

require_once __DIR__ . '/phpmailer/src/Exception.php';
require_once __DIR__ . '/phpmailer/src/PHPMailer.php';
require_once __DIR__ . '/phpmailer/src/SMTP.php';

require_once __DIR__ . '/../config/env.php';
require_once __DIR__ . '/smtp-settings.php';
$smtp = dropcars_resolve_smtp($config);

echo "Resolved SMTP User: " . $smtp['smtpUser'] . "\n";
echo "Resolved Mail From: " . $smtp['mailFrom'] . "\n";
echo "Resolved Mail To:   " . $smtp['mailTo'] . "\n\n";

if ($smtp['appPassword'] === '') {
    die("ERROR: App password is empty — check config.php.\n");
}

echo "Testing Port 587 (TLS)...\n";
$mail = new \PHPMailer\PHPMailer\PHPMailer(true);
try {
    $mail->isSMTP();
    $mail->Host       = 'smtp.gmail.com';
    $mail->SMTPAuth   = true;
    $mail->SMTPSecure = 'tls';
    $mail->Port       = 587;
    $mail->Username   = $smtp['smtpUser'];
    $mail->Password   = $smtp['appPassword'];
    $mail->setFrom($smtp['smtpUser'], 'Drop Cars Test');
    $mail->addAddress($smtp['mailTo']);
    $mail->Subject = '✅ Drop Cars SMTP Test — ' . date('d M Y H:i:s');
    $mail->Body    = '<h2>SMTP is working!</h2><p>Sent from test-smtp.php at ' . date('d M Y H:i:s T') . '</p>';
    $mail->AltBody = 'SMTP is working! Sent at ' . date('d M Y H:i:s T');
    $mail->isHTML(true);
    $mail->send();
    echo "SUCCESS ✓ — Email sent to " . $smtp['mailTo'] . " via Port 587\n";
} catch (\Exception $e) {
    echo "FAILED on 587: " . $e->getMessage() . "\n";
    echo "\nTrying Port 465 (SSL)...\n";
    try {
        $mail2 = new \PHPMailer\PHPMailer\PHPMailer(true);
        $mail2->isSMTP();
        $mail2->Host       = 'smtp.gmail.com';
        $mail2->SMTPAuth   = true;
        $mail2->SMTPSecure = 'ssl';
        $mail2->Port       = 465;
        $mail2->Username   = $smtp['smtpUser'];
        $mail2->Password   = $smtp['appPassword'];
        $mail2->setFrom($smtp['smtpUser'], 'Drop Cars Test');
        $mail2->addAddress($smtp['mailTo']);
        $mail2->Subject = '✅ Drop Cars SMTP Test (Port 465) — ' . date('d M Y H:i:s');
        $mail2->Body    = '<h2>SMTP is working via Port 465!</h2><p>Sent at ' . date('d M Y H:i:s T') . '</p>';
        $mail2->AltBody = 'SMTP working via Port 465. Sent at ' . date('d M Y H:i:s T');
        $mail2->isHTML(true);
        $mail2->send();
        echo "SUCCESS ✓ — Email sent to " . $smtp['mailTo'] . " via Port 465\n";
    } catch (\Exception $e2) {
        echo "FAILED on 465: " . $e2->getMessage() . "\n";
        echo "\nBoth ports failed. Likely causes:\n";
        echo "  1. Gmail App Password is incorrect or expired\n";
        echo "  2. 2-Step Verification is disabled on the Google account\n";
        echo "  3. Server is blocking outbound SMTP (ports 465/587) — contact Hostinger\n";
        echo "  4. The App Password was generated for a different Gmail account\n";
    }
}
