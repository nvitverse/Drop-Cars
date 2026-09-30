<?php
/**
 * Drop Cars – Driver details request notification (Telegram)
 * Called when a customer clicks "Request Driver Details Now" on the tracking page.
 */

header('Content-Type: application/json; charset=utf-8');

// CORS: Allow all origins for hassle-free API access from booking forms
$__origin = $_SERVER['HTTP_ORIGIN'] ?? '';
header('Access-Control-Allow-Origin: ' . ($__origin !== '' ? $__origin : '*'));
header('Access-Control-Allow-Credentials: true');
header('Vary: Origin');
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

$input = file_get_contents('php://input');
$data = json_decode($input, true);
$bookingIdRaw = preg_replace('/[^A-Za-z0-9]/', '', (string) ($data['bookingId'] ?? ''));
$bookingId = strtoupper($bookingIdRaw);

if ($bookingId === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid booking ID.']);
    exit;
}

// Connect to DB
if (!defined('DROP_CARS_DB_OPTIONAL')) {
    define('DROP_CARS_DB_OPTIONAL', true);
}
require_once __DIR__ . '/../admin/config/database.php';
if ((!isset($pdo) || !$pdo instanceof PDO) && !empty($GLOBALS['db']) && $GLOBALS['db'] instanceof PDO) {
    $pdo = $GLOBALS['db'];
}

if (!isset($pdo) || !$pdo instanceof PDO) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

// Fetch booking details
try {
    $stmt = $pdo->prepare("SELECT * FROM `bookings` WHERE `booking_id` = ? LIMIT 1");
    $stmt->execute([$bookingId]);
    $booking = $stmt->fetch(PDO::FETCH_ASSOC);
} catch (Throwable $e) {
    error_log("Driver request notify DB error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database query failed.']);
    exit;
}

if (!$booking) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'Booking not found.']);
    exit;
}

// Load config
$configPath = __DIR__ . '/config.php';
if (!is_file($configPath)) {
    $configPath = __DIR__ . '/config.example.php';
}
$config = is_file($configPath) ? (include $configPath) : [];

// Check if telegram configured
$telegramToken = defined('TELEGRAM_BOT_TOKEN') ? TELEGRAM_BOT_TOKEN : (getenv('TELEGRAM_BOT_TOKEN') ?: ($config['telegramBotToken'] ?? ''));
$telegramChatIds = [];
if (defined('TELEGRAM_CHAT_ID') && trim(TELEGRAM_CHAT_ID) !== '') {
    $telegramChatIds[] = trim(TELEGRAM_CHAT_ID);
} elseif (getenv('TELEGRAM_CHAT_ID') !== false && trim(getenv('TELEGRAM_CHAT_ID')) !== '') {
    $telegramChatIds[] = trim(getenv('TELEGRAM_CHAT_ID'));
}
if (isset($config['telegramChatIds']) && is_array($config['telegramChatIds'])) {
    $telegramChatIds = array_values(array_unique(array_merge($telegramChatIds, $config['telegramChatIds'])));
}

if ($telegramToken === '' || empty($telegramChatIds)) {
    echo json_encode(['success' => false, 'message' => 'Telegram not configured.']);
    exit;
}

require_once __DIR__ . '/telegram-notify.php';
require_once __DIR__ . '/telegram-customer-message.php'; // for dropcars_tg_h

// Build management link
$bookingDbId = (int) $booking['id'];
$managementLink = "https://dropcars.in/admin/customize-booking?id=" . $bookingDbId . "&source=booking";

// Format details safely
$tripType = dropcars_tg_h($booking['trip_type'] ?? 'one_way');
$pickup = dropcars_tg_h($booking['pickup_location'] ?? 'N/A');
$drop = dropcars_tg_h($booking['drop_location'] ?? 'N/A');
$travelDate = dropcars_tg_h($booking['travel_date'] ?? 'N/A');
$travelTime = dropcars_tg_h($booking['travel_time'] ?? 'N/A');
$vehicleType = dropcars_tg_h($booking['vehicle_type'] ?? 'N/A');

// Formulate message - IMPORTANT: NO customer personal data!
$lines = [];
$lines[] = '<b>⚠️ DRIVER DETAILS REQUESTED – Booking ' . dropcars_tg_h($bookingId) . '</b>';
$lines[] = '';
$lines[] = 'A customer is requesting driver/cab details on the tracking page.';
$lines[] = '';
$lines[] = '<b>Trip Details</b>';
$lines[] = 'Booking ID: <code>' . dropcars_tg_h($bookingId) . '</code>';
$lines[] = 'Trip Type: ' . $tripType;
$lines[] = 'From: ' . $pickup;
$lines[] = 'To: ' . $drop;
$lines[] = 'Pickup Date: ' . $travelDate;
$lines[] = 'Pickup Time: ' . $travelTime;
$lines[] = 'Vehicle: ' . $vehicleType;
$lines[] = '';
$lines[] = '🔑 <a href="' . dropcars_tg_h($managementLink) . '">Manage Booking (Assign Driver)</a>';
$lines[] = '';
$lines[] = '<i>Automated alert from Drop Cars.</i>';

$telegramHtml = implode("\n", $lines);

$telegramSent = dropcars_telegram_send_html($telegramToken, $telegramChatIds, $telegramHtml);

echo json_encode([
    'success' => $telegramSent,
    'message' => $telegramSent ? 'Notification sent successfully.' : 'Failed to send Telegram alert.'
]);
