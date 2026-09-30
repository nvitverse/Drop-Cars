<?php
/**
 * record-advance.php
 * Called (AJAX POST) when a customer taps "I've Paid the Advance" after 
 * completing a UPI payment.  Fires a Telegram admin notification and
 * returns JSON so the front-end can show a confirmation state.
 *
 * POST fields: booking_id, customer_name, customer_phone, amount, note
 */

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

// ── Config & DB ────────────────────────────────────────────────────────────
$configPath = __DIR__ . '/config.php';
$apiConfig  = is_file($configPath) ? (include $configPath) : [];

if (!defined('DROP_CARS_DB_OPTIONAL')) define('DROP_CARS_DB_OPTIONAL', true);
require_once __DIR__ . '/../admin/config/database.php';
require_once __DIR__ . '/../api/telegram-notify.php';

// ── Input sanitization ──────────────────────────────────────────────────────
$bookingId    = preg_replace('/[^A-Za-z0-9\-]/', '', (string)($_POST['booking_id']    ?? ''));
$custName     = htmlspecialchars(strip_tags((string)($_POST['customer_name']  ?? 'Customer')), ENT_QUOTES, 'UTF-8');
$custPhone    = preg_replace('/[^0-9+]/', '', (string)($_POST['customer_phone'] ?? ''));
$amount       = max(0, (float)($_POST['amount'] ?? 0));
$note         = htmlspecialchars(strip_tags((string)($_POST['note'] ?? '')), ENT_QUOTES, 'UTF-8');
$utr          = preg_replace('/[^A-Za-z0-9]/', '', (string)($_POST['utr'] ?? ''));

if ($bookingId === '') {
    echo json_encode(['ok' => false, 'msg' => 'Booking ID is required.']);
    exit;
}

// ── Try to log advance notice in DB ────────────────────────────────────────
$dbLogged = false;
if (isset($pdo) && $pdo instanceof PDO) {
    try {
        // Check if advance_payments table exists; if not, skip silently
        $tableCheck = $pdo->query("SHOW TABLES LIKE 'advance_payments'")->fetchColumn();
        if ($tableCheck) {
            $noteWithUtr = $utr ? "[UTR:{$utr}] {$note}" : $note;
            $pdo->prepare(
                "INSERT INTO `advance_payments`
                 (`booking_id`, `customer_name`, `customer_phone`, `amount`, `note`, `status`, `created_at`)
                 VALUES (?, ?, ?, ?, ?, 'pending', NOW())"
            )->execute([$bookingId, $custName, $custPhone, $amount, $noteWithUtr]);
            $dbLogged = true;
        }
    } catch (Throwable $e) {
        error_log('record-advance DB error: ' . $e->getMessage());
    }
}

// ── Build Telegram message ─────────────────────────────────────────────────
$siteName  = $apiConfig['companyName']  ?? 'Drop Cars';
$siteUrl   = rtrim($apiConfig['websiteUrl'] ?? 'https://www.dropcars.in', '/');
$amountStr = $amount > 0 ? '₹' . number_format($amount, 0) : 'Amount not specified';
$timeStr   = date('d M Y, h:i A');

$adminPanel = $siteUrl . '/admin/customize-booking?id=' . urlencode($bookingId) . '&source=booking';

$msg  = "💰 <b>Advance Payment Claimed</b>\n";
$msg .= "━━━━━━━━━━━━━━━━━━━━\n";
$msg .= "🔖 <b>Booking ID:</b> <code>{$bookingId}</code>\n";
$msg .= "👤 <b>Customer:</b> {$custName}\n";
if ($custPhone !== '') {
    $msg .= "📱 <b>Phone:</b> {$custPhone}\n";
}
$msg .= "💵 <b>Advance Amount:</b> {$amountStr}\n";
if ($utr !== '') {
    $msg .= "🔢 <b>UPI Ref (UTR):</b> <code>{$utr}</code>\n";
}
if ($note !== '') {
    $msg .= "📝 <b>Note:</b> {$note}\n";
}
$msg .= "🕐 <b>Time:</b> {$timeStr}\n";
$msg .= "━━━━━━━━━━━━━━━━━━━━\n";
$msg .= "⚠️ <i>Please verify the UPI payment and confirm the booking if not already done.</i>\n";
$msg .= "🔗 <a href=\"{$adminPanel}\">View in Admin Panel</a>";

// ── Send Telegram ──────────────────────────────────────────────────────────
$telegramSent = false;
$botToken  = defined('TELEGRAM_BOT_TOKEN') ? TELEGRAM_BOT_TOKEN : (getenv('TELEGRAM_BOT_TOKEN') ?: ($apiConfig['telegramBotToken'] ?? ''));
$chatIds   = [];
if (defined('TELEGRAM_CHAT_ID') && trim(TELEGRAM_CHAT_ID) !== '') {
    $chatIds[] = trim(TELEGRAM_CHAT_ID);
} elseif (getenv('TELEGRAM_CHAT_ID') !== false && trim(getenv('TELEGRAM_CHAT_ID')) !== '') {
    $chatIds[] = trim(getenv('TELEGRAM_CHAT_ID'));
}
if (isset($apiConfig['telegramChatIds']) && is_array($apiConfig['telegramChatIds'])) {
    $chatIds = array_values(array_unique(array_merge($chatIds, $apiConfig['telegramChatIds'])));
}

if ($botToken !== '' && $chatIds !== []) {
    $telegramSent = dropcars_telegram_send_html($botToken, $chatIds, $msg);
} else {
    error_log('record-advance: Telegram not configured, skipping notification.');
}

// ── Respond ────────────────────────────────────────────────────────────────
echo json_encode([
    'ok'            => true,
    'msg'           => 'Thank you! We have been notified of your payment.',
    'telegram_sent' => $telegramSent,
    'db_logged'     => $dbLogged,
]);
