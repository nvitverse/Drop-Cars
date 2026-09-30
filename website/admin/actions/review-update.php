<?php
require_once __DIR__ . '/../includes/session.php';
require_once __DIR__ . '/../config/database.php';


if (empty($_SESSION['admin_id'])) {
    header('Location: ../index.php?login=required');
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: ../reviews.php');
    exit;
}

$id = (int)($_POST['id'] ?? 0);
$name = trim((string)($_POST['customer_name'] ?? ''));
$phone = trim((string)($_POST['customer_phone'] ?? ''));
$rating = (int)($_POST['rating'] ?? 5);
$comment = trim((string)($_POST['comment'] ?? ''));
$trip = trim((string)($_POST['trip_route'] ?? ''));
$approved = isset($_POST['is_approved']) ? 1 : 0;

if ($id < 1 || $name === '' || $phone === '' || $comment === '') {
    $_SESSION['reviews_flash'] = 'Invalid data. Please try again.';
    header('Location: ../reviews.php');
    exit;
}

$rating = max(1, min(5, $rating));

try {
    $stmt = $pdo->prepare("UPDATE reviews SET customer_name=?, customer_phone=?, rating=?, comment=?, trip_route=?, is_approved=? WHERE id=?");
    $stmt->execute([$name, $phone, $rating, $comment, $trip ?: null, $approved, $id]);
    $_SESSION['reviews_flash'] = 'Review updated successfully.';
} catch (PDOException $e) {
    $_SESSION['reviews_flash'] = 'Update failed.';
}

header('Location: ../reviews.php');
exit;
