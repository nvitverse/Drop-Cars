<?php
/**
 * Daily summary email for Drop Cars admin.
 *
 * Hostinger cron (hPanel → Advanced → Cron Jobs):
 *   Run PHP CLI on this file once per day at 8 PM India time (IST).
 *   Example schedule expression often shown as: 0 20 * * *
 *   Command (adjust path to your account):
 *   /usr/bin/php /home/USERNAME/domains/YOURDOMAIN/public_html/api/cron/daily-summary.php
 *
 * Or if document root is project root:
 *   /usr/bin/php /home/USERNAME/path/to/Drop Cars - Website/api/cron/daily-summary.php
 *
 * Notes:
 * - Requires api/config.php (SMTP) and admin/config/database.php credentials on the server.
 * - Uses the same mail stack as enquiry emails (PHPMailer + smtp-settings.php).
 */

declare(strict_types=1);

$root = dirname(__DIR__, 2);
if (!is_file($root . '/admin/config/database.php')) {
    fwrite(STDERR, "Missing admin config.\n");
    exit(1);
}

define('DROP_CARS_DB_OPTIONAL', false);
require_once $root . '/admin/config/database.php';
if (!isset($pdo) || !$pdo instanceof PDO) {
    fwrite(STDERR, "Database unavailable.\n");
    exit(1);
}

$configPath = $root . '/api/config.php';
if (!is_file($configPath)) {
    $configPath = $root . '/api/config.example.php';
}
$config = is_file($configPath) ? (include $configPath) : [];
require_once $root . '/config/env.php';
require_once $root . '/api/smtp-settings.php';

$isExample = basename($configPath) === 'config.example.php';
$smtp = dropcars_resolve_smtp($config, $isExample);
$mailTo = $smtp['mailTo'];
$appPassword = $smtp['appPassword'];

$todayStart = date('Y-m-d 00:00:00');
$todayEnd = date('Y-m-d 23:59:59');

$bookingsToday = (int) $pdo->query("SELECT COUNT(*) FROM `bookings` WHERE `created_at` >= '$todayStart' AND `created_at` <= '$todayEnd'")->fetchColumn();
$enquiriesToday = (int) $pdo->query("SELECT COUNT(*) FROM `enquiries` WHERE `created_at` >= '$todayStart' AND `created_at` <= '$todayEnd'")->fetchColumn();
$completedToday = (int) $pdo->query("SELECT COUNT(*) FROM `bookings` WHERE `status` = 'completed' AND `updated_at` >= '$todayStart'")->fetchColumn();
$cancelledToday = (int) $pdo->query("SELECT COUNT(*) FROM `bookings` WHERE `status` = 'cancelled' AND `updated_at` >= '$todayStart'")->fetchColumn();
$fakeBookings = (int) $pdo->query("SELECT COUNT(*) FROM `bookings` WHERE `status` = 'fake' AND `updated_at` >= '$todayStart'")->fetchColumn();
$fakeEnquiries = (int) $pdo->query("SELECT COUNT(*) FROM `enquiries` WHERE `status` = 'fake' AND `updated_at` >= '$todayStart'")->fetchColumn();

$revenueStmt = $pdo->query("SELECT COALESCE(SUM(`final_fare`), 0) FROM `bookings` WHERE `status` = 'completed' AND DATE(`updated_at`) = CURDATE()");
$revenueToday = (float) ($revenueStmt ? $revenueStmt->fetchColumn() : 0);

$subject = 'Drop Cars — Daily summary ' . date('Y-m-d');
$bodyHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#222;">';
$bodyHtml .= '<h2 style="margin:0 0 12px;">Daily summary — ' . htmlspecialchars(date('l, j M Y')) . '</h2>';
$bodyHtml .= '<table cellpadding="8" cellspacing="0" border="1" style="border-collapse:collapse;border-color:#ddd;">';
$bodyHtml .= '<tr><td>New bookings (created today)</td><td><strong>' . (int) $bookingsToday . '</strong></td></tr>';
$bodyHtml .= '<tr><td>New enquiries (created today)</td><td><strong>' . (int) $enquiriesToday . '</strong></td></tr>';
$bodyHtml .= '<tr><td>Marked completed (today)</td><td><strong>' . (int) $completedToday . '</strong></td></tr>';
$bodyHtml .= '<tr><td>Cancelled (today)</td><td><strong>' . (int) $cancelledToday . '</strong></td></tr>';
$bodyHtml .= '<tr><td>Spam/fake — bookings</td><td><strong>' . (int) $fakeBookings . '</strong></td></tr>';
$bodyHtml .= '<tr><td>Spam/fake — enquiries</td><td><strong>' . (int) $fakeEnquiries . '</strong></td></tr>';
$bodyHtml .= '<tr><td>Revenue today (completed, sum final_fare)</td><td><strong>₹' . number_format($revenueToday, 2) . '</strong></td></tr>';
$bodyHtml .= '</table>';
$bodyHtml .= '<p style="font-size:12px;color:#666;margin-top:16px;">Automated message from Drop Cars <code>api/cron/daily-summary.php</code></p>';
$bodyHtml .= '</body></html>';

$plain = strip_tags(str_replace(['</tr>', '</td>', '<br>', '<br/>', '<br />'], ["\n", "\t", "\n", "\n", "\n"], $bodyHtml));

if (!$appPassword || !filter_var($mailTo, FILTER_VALIDATE_EMAIL)) {
    fwrite(STDERR, "Mail not configured (gmailAppPassword / mailTo).\n");
    exit(1);
}

$phpmailerPath = $root . '/api/phpmailer/src/PHPMailer.php';
if (!is_file($phpmailerPath)) {
    fwrite(STDERR, "PHPMailer not found.\n");
    exit(1);
}

require_once $root . '/api/phpmailer/src/Exception.php';
require_once $root . '/api/phpmailer/src/PHPMailer.php';
require_once $root . '/api/phpmailer/src/SMTP.php';

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
    $mail->Subject = $subject;
    $mail->Body = $bodyHtml;
    $mail->AltBody = $plain;
    $mail->isHTML(true);
    $mail->send();
    echo "OK: sent to {$mailTo}\n";
} catch (Throwable $e) {
    fwrite(STDERR, 'Mail error: ' . $e->getMessage() . "\n");
    exit(1);
}
