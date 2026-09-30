<?php
/**
 * includes/customer-prefill.php
 *
 * Returns prefill data for the booking form based on the logged-in customer session.
 * Works for all login methods: Phone, Email OTP, and Google Sign-In.
 *
 * Usage:
 *   require_once __DIR__ . '/../includes/customer-prefill.php';
 *   [$pfName, $pfEmail, $pfPhone, $pfNational, $pfCC] = dropcars_customer_prefill($pdo ?? null);
 */

function dropcars_customer_prefill(?PDO $pdo): array
{
    if ($pdo === null) {
        return ['', '', '', '', '+91'];
    }

    if (session_status() === PHP_SESSION_NONE) {
        @session_start();
    }

    $customer = null;

    // 1. Look up by phone session
    if (!empty($_SESSION['customer_phone'])) {
        try {
            $stmt = $pdo->prepare("SELECT `name`, `email`, `phone` FROM `customers` WHERE `phone` = ? LIMIT 1");
            $stmt->execute([$_SESSION['customer_phone']]);
            $customer = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
        } catch (Throwable $e) {}
    }

    // 2. Fall back to email session (OTP / Google login)
    if (!$customer && !empty($_SESSION['customer_email'])) {
        try {
            $stmt = $pdo->prepare("SELECT `name`, `email`, `phone` FROM `customers` WHERE `email` = ? LIMIT 1");
            $stmt->execute([$_SESSION['customer_email']]);
            $customer = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
        } catch (Throwable $e) {}
    }

    if (!$customer) {
        return ['', '', '', '', '+91'];
    }

    $pfName  = (string)($customer['name']  ?? '');
    $pfEmail = (string)($customer['email'] ?? '');
    $pfPhone = (string)($customer['phone'] ?? '');

    // Split "+91 9876543210" → country code + national number
    $pfCC       = '+91';
    $pfNational = '';
    if ($pfPhone !== '') {
        $parts = explode(' ', trim($pfPhone), 2);
        if (count($parts) === 2 && strpos($parts[0], '+') === 0) {
            $pfCC       = $parts[0];
            $pfNational = $parts[1];
        } else {
            $pfNational = $pfPhone; // fallback: store as-is
        }
    }

    return [$pfName, $pfEmail, $pfNational, $pfPhone, $pfCC];
}
