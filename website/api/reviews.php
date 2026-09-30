<?php
/**
 * Reviews API - List and submit customer reviews
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../admin/config/database.php';
$pdo = $GLOBALS['db'];
if (!$pdo instanceof PDO) {
    http_response_code(500);
    echo json_encode(['error' => 'Database unavailable', 'reviews' => []]);
    exit;
}

// Ensure reviews table exists
$pdo->exec("CREATE TABLE IF NOT EXISTS reviews (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    rating TINYINT UNSIGNED NOT NULL DEFAULT 5,
    comment TEXT NOT NULL,
    trip_route VARCHAR(255) DEFAULT NULL,
    is_verified TINYINT(1) DEFAULT 1,
    is_approved TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_approved (is_approved),
    INDEX idx_created (created_at)
)");

// GET - List approved reviews
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $pdo->query("SELECT id, customer_name, rating, comment, trip_route, is_verified, created_at FROM reviews WHERE is_approved = 1 ORDER BY created_at DESC LIMIT 50");
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $reviews = [];
    foreach ($rows as $r) {
        $reviews[] = [
            'id' => (int)$r['id'],
            'name' => $r['customer_name'],
            'rating' => (int)$r['rating'],
            'comment' => $r['comment'],
            'trip' => $r['trip_route'] ?: 'Intercity Trip',
            'verified' => (bool)($r['is_verified'] ?? 1),
            'created' => $r['created_at'],
        ];
    }
    echo json_encode(['reviews' => $reviews]);
    exit;
}

// POST - Submit review (requires customer session)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    session_start();
    $input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

    $completePending = !empty($input['complete_pending']);

    if ($completePending) {
        $name = trim((string)($_SESSION['review_customer_name'] ?? $_SESSION['customer_name'] ?? 'Customer'));
        $phone = trim((string)($_SESSION['review_customer_phone'] ?? $_SESSION['customer_phone'] ?? ''));
        $comment = trim((string)($_SESSION['pending_review_comment'] ?? ''));
        $rating = (int)($_SESSION['pending_review_rating'] ?? 5);

        if ($phone === '' || $comment === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Session expired. Please try again.']);
            exit;
        }
        unset($_SESSION['pending_review_rating'], $_SESSION['pending_review_comment']);
    } else {
        $rating = (int)($input['rating'] ?? 5);
        $comment = trim((string)($input['comment'] ?? ''));
        $phone = trim((string)($_SESSION['customer_phone'] ?? $_SESSION['review_customer_phone'] ?? $input['phone'] ?? ''));
        $name = trim((string)($_SESSION['customer_name'] ?? $_SESSION['review_customer_name'] ?? $input['name'] ?? 'Customer'));

        if ($comment === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Please enter your review.']);
            exit;
        }
        if ($rating < 1 || $rating > 5) {
            $rating = 5;
        }

        if ($name === '' || $phone === '') {
            $_SESSION['pending_review_rating'] = $rating;
            $_SESSION['pending_review_comment'] = $comment;
            echo json_encode([
                'redirect' => '/pages/review-login.php?return=' . urlencode($_GET['return'] ?? '/'),
                'login_required' => true,
            ]);
            exit;
        }
    }

    $tripRoute = trim((string)($input['trip_route'] ?? ''));

    $stmt = $pdo->prepare("INSERT INTO reviews (customer_name, customer_phone, rating, comment, trip_route, is_verified, is_approved) VALUES (?, ?, ?, ?, ?, 1, 1)");
    $stmt->execute([$name, $phone, $rating, $comment, $tripRoute ?: null]);

    $id = (int)$pdo->lastInsertId();
    echo json_encode([
        'success' => true,
        'id' => $id,
        'message' => 'Thank you! Your review has been posted.',
    ]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
