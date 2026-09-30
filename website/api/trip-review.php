<?php
/**
 * api/trip-review.php
 *
 * Bridge for the customer review page (pages/review.php, reached by scanning the QR the driver shows after a trip):
 *
 *   GET  ?token=...                      -> trip + driver details (from the backend, public)
 *   POST {token, rating, feedback, name} -> stores the review in the backend (driver rating + bonus) AND, on success,
 *                                           adds it to this site's own `reviews` table so it shows in the website's
 *                                           Customer Reviews section straight away:
 *                                             4-5 stars with a comment -> published immediately (verified trip)
 *                                             1-3 stars / no comment   -> saved but NOT published (admin can approve in
 *                                             Admin > Reviews) - a private complaint is never posted publicly by itself.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/includes/backend-client.php';

function tr_out(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

function tr_valid_token(string $t): bool
{
    return (bool) preg_match('/^[A-Za-z0-9_-]{16,80}$/', $t);
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $token = trim((string) ($_GET['token'] ?? ''));
    if (!tr_valid_token($token)) {
        tr_out(400, ['success' => false, 'message' => 'This review link is not valid.']);
    }
    $r = dropcars_backend_request('GET', '/api/trip-review/' . rawurlencode($token));
    if (!$r['ok']) {
        tr_out($r['status'] ?: 502, ['success' => false, 'message' => is_string($r['error']) && $r['error'] !== '' ? $r['error'] : 'This review link is not valid.']);
    }
    tr_out(200, ['success' => true, 'trip' => $r['data']]);
}

if ($method !== 'POST') {
    tr_out(405, ['success' => false, 'message' => 'Method Not Allowed']);
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    tr_out(400, ['success' => false, 'message' => 'Invalid request.']);
}
$token    = trim((string) ($input['token'] ?? ''));
$rating   = (int) ($input['rating'] ?? 0);
$feedback = trim((string) ($input['feedback'] ?? ''));
$name     = trim((string) ($input['name'] ?? ''));

if (!tr_valid_token($token)) {
    tr_out(400, ['success' => false, 'message' => 'This review link is not valid.']);
}
if ($rating < 1 || $rating > 5) {
    tr_out(400, ['success' => false, 'message' => 'Please choose 1 to 5 stars.']);
}
$feedback = mb_substr($feedback, 0, 1000);
$name = mb_substr($name, 0, 80);

// Trip details first (also proves the token, and gives us the route for the website review card)
$trip = dropcars_backend_request('GET', '/api/trip-review/' . rawurlencode($token));
if (!$trip['ok']) {
    tr_out($trip['status'] ?: 502, ['success' => false, 'message' => 'This review link is not valid.']);
}
$tripData = is_array($trip['data']) ? $trip['data'] : [];
if (!empty($tripData['already_reviewed'])) {
    tr_out(409, ['success' => false, 'message' => 'This trip has already been reviewed. Thank you!']);
}

$post = dropcars_backend_request('POST', '/api/trip-review/' . rawurlencode($token), [
    'rating' => $rating,
    'feedback' => $feedback !== '' ? $feedback : null,
    'reviewer_name' => $name !== '' ? $name : null,
]);
if (!$post['ok']) {
    $msg = is_string($post['error']) && $post['error'] !== '' ? $post['error'] : 'We could not save your review. Please try again.';
    tr_out($post['status'] ?: 502, ['success' => false, 'message' => $msg]);
}

// ---- live sync into the website's Customer Reviews (best effort - the review is already safe in the backend)
try {
    if (!defined('DROP_CARS_DB_OPTIONAL')) {
        define('DROP_CARS_DB_OPTIONAL', true);
    }
    require_once __DIR__ . '/../admin/config/database.php';
    $pdo = $GLOBALS['db'] ?? ($pdo ?? null);
    if ($pdo instanceof PDO) {
        $route = trim((string) ($tripData['pickup'] ?? '')) !== '' && trim((string) ($tripData['drop'] ?? '')) !== ''
            ? trim($tripData['pickup']) . ' to ' . trim($tripData['drop'])
            : null;
        // Show first name + initial only (e.g. "Ranjith K.") - never the full name of a private customer
        $display = 'Verified Customer';
        if ($name !== '') {
            $parts = preg_split('/\s+/', $name);
            $display = $parts[0] . (count($parts) > 1 ? ' ' . mb_substr(end($parts), 0, 1) . '.' : '');
        }
        $publish = ($rating >= 4 && $feedback !== '') ? 1 : 0;
        $stmt = $pdo->prepare(
            "INSERT INTO reviews (customer_name, customer_phone, rating, comment, trip_route, is_verified, is_approved)
             VALUES (:n, '', :r, :c, :route, 1, :ap)"
        );
        $stmt->execute([
            ':n' => $display,
            ':r' => $rating,
            ':c' => $feedback !== '' ? $feedback : '(no comment)',
            ':route' => $route,
            ':ap' => $publish,
        ]);
    }
} catch (Throwable $e) {
    error_log('trip-review website sync failed: ' . $e->getMessage());
}

tr_out(200, ['success' => true]);
