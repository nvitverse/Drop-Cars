<?php
/**
 * Customer Authentication API
 *  – method=google : Google One-Tap / OAuth ID-token sign-in
 *  – method=email  : Triggers OTP → use verify_email_otp.php to finalise
 *  – method=phone  : Registers customer, sends WhatsApp verification request to ADMIN
 *  – method=check_verified : Polling endpoint — has admin verified this phone yet?
 */

require_once __DIR__ . '/../config/session.php';
session_start();
header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
if (!defined('DROP_CARS_DB_OPTIONAL')) {
    define('DROP_CARS_DB_OPTIONAL', true);
}
require_once __DIR__ . '/../admin/config/database.php';

$method = trim((string)($_POST['method'] ?? ($_GET['method'] ?? 'phone')));

$configPath = __DIR__ . '/config.php';
$siteConfig = is_file($configPath) ? (include $configPath) : [];
$hmacKey    = trim((string)($siteConfig['verifyTokenSecret'] ?? 'dropcars-mobile-verify-2025'));
$adminWaNum = '917200217986'; // WhatsApp number that receives verification requests

if (!isset($pdo) || !($pdo instanceof PDO)) {
    echo json_encode(['status' => 'error', 'message' => 'Service temporarily unavailable.']);
    exit;
}

require_once __DIR__ . '/../admin/includes/enquiries-schema.php';
dropcars_ensure_customers_columns($pdo);

// ─────────────────────────────────────────────────────────────────────────────
// METHOD: login  — email + password
// ─────────────────────────────────────────────────────────────────────────────
if ($method === 'login') {
    $email    = strtolower(trim((string)($_POST['email'] ?? '')));
    $password = (string)($_POST['password'] ?? '');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $password === '') {
        echo json_encode(['status' => 'error', 'message' => 'Please enter your email and password.']);
        exit;
    }
    $stmt = $pdo->prepare("SELECT * FROM `customers` WHERE `email` = ? LIMIT 1");
    $stmt->execute([$email]);
    $c = $stmt->fetch();
    if (!$c || empty($c['password'])) {
        echo json_encode(['status' => 'error', 'message' => 'No account found with this email. Please create one.']);
        exit;
    }
    if (!password_verify($password, (string)$c['password'])) {
        echo json_encode(['status' => 'error', 'message' => 'Incorrect password. Please try again.']);
        exit;
    }
    $_SESSION['customer_email'] = $email;
    if (!empty($c['phone'])) {
        $_SESSION['customer_phone'] = $c['phone'];
    }
    echo json_encode(['status' => 'verified', 'name' => explode(' ', trim($c['name'] ?? 'Customer'))[0]]);
    exit;
}

// ─────────────────────────────────────────────────────────────────────────────
// METHOD: register_otp  — new user: validate email is free, email a 6-digit code
// ─────────────────────────────────────────────────────────────────────────────
if ($method === 'register_otp') {
    $email = strtolower(trim((string)($_POST['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        echo json_encode(['status' => 'error', 'message' => 'Please enter a valid email address.']);
        exit;
    }
    $stmt = $pdo->prepare("SELECT `password` FROM `customers` WHERE `email` = ? LIMIT 1");
    $stmt->execute([$email]);
    $existing = $stmt->fetch();
    if ($existing && !empty($existing['password'])) {
        echo json_encode(['status' => 'exists', 'message' => 'This email is already registered. Please log in instead.']);
        exit;
    }

    // Rate-limit: max 4 sends per email per 10 minutes
    $bucket = 'reg_rate_' . md5($email);
    $now = time();
    if (!isset($_SESSION[$bucket])) { $_SESSION[$bucket] = ['count' => 0, 'ws' => $now]; }
    $r = &$_SESSION[$bucket];
    if (($now - $r['ws']) > 600) { $r = ['count' => 0, 'ws' => $now]; }
    if ($r['count'] >= 4) {
        echo json_encode(['status' => 'error', 'message' => 'Too many code requests. Please wait a few minutes.']);
        exit;
    }
    $r['count']++;

    $otp = str_pad((string)random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
    $_SESSION['reg_otp'] = ['email' => $email, 'otp' => $otp, 'expires' => $now + 600, 'attempts' => 0];

    require_once __DIR__ . '/../admin/includes/mail.php';
    $subject = 'Your Drop Cars verification code: ' . $otp;
    $html = '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:28px;color:#0f172a;">'
        . '<h2 style="margin:0 0 6px;color:#1e4b7f;">Verify your email</h2>'
        . '<p style="color:#64748b;line-height:1.6;">Use this code to create your Drop Cars account. It expires in 10 minutes.</p>'
        . '<div style="font-size:34px;font-weight:900;letter-spacing:10px;background:#f1f5f9;border-radius:14px;padding:20px;text-align:center;margin:18px 0;color:#1e4b7f;">' . $otp . '</div>'
        . '<p style="color:#94a3b8;font-size:12px;">If you didn\'t request this, you can ignore this email.</p></div>';
    $plain = "Your Drop Cars verification code is {$otp}. It expires in 10 minutes.";
    $res = dropcars_admin_send_mail($email, $subject, $html, $plain);
    if (!$res['ok']) {
        error_log('[DropCars reg OTP] ' . $res['error']);
        echo json_encode(['status' => 'error', 'message' => 'Could not send the code right now. Please try again shortly.']);
        exit;
    }
    echo json_encode(['status' => 'sent', 'message' => 'Verification code sent to ' . $email . '. Check your inbox (and spam).']);
    exit;
}

// ─────────────────────────────────────────────────────────────────────────────
// METHOD: register_verify  — confirm the OTP (does NOT create the account yet)
// ─────────────────────────────────────────────────────────────────────────────
if ($method === 'register_verify') {
    $entered = preg_replace('/\D/', '', (string)($_POST['otp'] ?? ''));
    $p = $_SESSION['reg_otp'] ?? null;
    if (!$p) {
        echo json_encode(['status' => 'error', 'message' => 'No pending verification. Please request a new code.']);
        exit;
    }
    if (time() > ($p['expires'] ?? 0)) {
        unset($_SESSION['reg_otp']);
        echo json_encode(['status' => 'error', 'message' => 'This code has expired. Please request a new one.']);
        exit;
    }
    $_SESSION['reg_otp']['attempts'] = (int)($p['attempts'] ?? 0) + 1;
    if ($_SESSION['reg_otp']['attempts'] > 5) {
        unset($_SESSION['reg_otp']);
        echo json_encode(['status' => 'error', 'message' => 'Too many failed attempts. Please request a new code.']);
        exit;
    }
    if ($entered !== (string)$p['otp']) {
        $left = max(0, 5 - $_SESSION['reg_otp']['attempts']);
        echo json_encode(['status' => 'error', 'message' => "Incorrect code. {$left} attempt(s) remaining."]);
        exit;
    }
    $_SESSION['reg_verified'] = ['email' => $p['email'], 'ts' => time()];
    unset($_SESSION['reg_otp']);
    echo json_encode(['status' => 'verified', 'message' => 'Email verified.']);
    exit;
}

// ─────────────────────────────────────────────────────────────────────────────
// METHOD: register_complete  — password + name + mobile + WhatsApp → create account
// ─────────────────────────────────────────────────────────────────────────────
if ($method === 'register_complete') {
    $rv = $_SESSION['reg_verified'] ?? null;
    if (!$rv || (time() - (int)($rv['ts'] ?? 0)) > 1800) {
        echo json_encode(['status' => 'error', 'message' => 'Your verification expired. Please start registration again.']);
        exit;
    }
    $email    = strtolower(trim((string)$rv['email']));
    $password = (string)($_POST['password'] ?? '');
    $name     = trim((string)($_POST['name'] ?? ''));
    $phoneRaw = trim((string)($_POST['phone'] ?? ''));
    $cc       = trim((string)($_POST['countryCode'] ?? '+91'));
    $useWa    = !empty($_POST['whatsapp']) ? 1 : 0;
    
    $referral = trim((string)($_POST['referral_code'] ?? ''));
    if ($referral) {
        $_SESSION['pending_referral'] = strtoupper($referral);
    }

    if (strlen($password) < 6) {
        echo json_encode(['status' => 'error', 'message' => 'Password must be at least 6 characters.']);
        exit;
    }
    if ($name === '') {
        echo json_encode(['status' => 'error', 'message' => 'Please enter your full name.']);
        exit;
    }
    $digits = preg_replace('/\D/', '', $phoneRaw);
    if (strlen($digits) < 7) {
        echo json_encode(['status' => 'error', 'message' => 'Please enter a valid mobile number.']);
        exit;
    }
    $phone = (strpos($phoneRaw, '+') === 0) ? $phoneRaw : ($cc . ' ' . $phoneRaw);
    $hash  = password_hash($password, PASSWORD_DEFAULT);

    $stmt = $pdo->prepare("SELECT * FROM `customers` WHERE `email` = ? OR `phone` = ? LIMIT 1");
    $stmt->execute([$email, $phone]);
    $c = $stmt->fetch();
    try {
        if ($c) {
            $pdo->prepare("UPDATE `customers` SET `name` = ?, `email` = ?, `password` = ?, `phone` = ?, `use_whatsapp` = ?, `is_verified` = 1 WHERE `id` = ?")
                ->execute([$name, $email, $hash, $phone, $useWa, $c['id']]);
            $newCustId = $c['id'];
        } else {
            $pdo->prepare("INSERT INTO `customers` (`name`, `email`, `password`, `phone`, `use_whatsapp`, `is_verified`) VALUES (?, ?, ?, ?, ?, 1)")
                ->execute([$name, $email, $hash, $phone, $useWa]);
            $newCustId = $pdo->lastInsertId();
        }
        
        // Apply referral credit for new email user registration
        if (function_exists('dropcars_credit_signup_referral')) {
            dropcars_credit_signup_referral($pdo, $newCustId);
        }
    } catch (Throwable $e) {
        echo json_encode(['status' => 'error', 'message' => 'Could not create your account. The email or mobile may already be in use.']);
        exit;
    }

    $_SESSION['customer_email'] = $email;
    $_SESSION['customer_phone'] = $phone;
    unset($_SESSION['reg_verified']);
    echo json_encode(['status' => 'verified', 'name' => explode(' ', $name)[0]]);
    exit;
}

// ─────────────────────────────────────────────────────────────────────────────
// METHOD: google
// ─────────────────────────────────────────────────────────────────────────────
if ($method === 'google') {
    $credential = trim((string)($_POST['credential'] ?? ''));
    if (!$credential) {
        echo json_encode(['status' => 'error', 'message' => 'Missing Google credential.']);
        exit;
    }

    $googleClientId = trim((string)($siteConfig['googleClientId'] ?? ''));
    if (!$googleClientId) {
        echo json_encode(['status' => 'error', 'message' => 'Google Sign-In is not configured on this site.']);
        exit;
    }

    $parts = explode('.', $credential);
    if (count($parts) !== 3) {
        echo json_encode(['status' => 'error', 'message' => 'Invalid Google credential format.']);
        exit;
    }
    $payload = json_decode(base64_decode(str_pad(strtr($parts[1], '-_', '+/'), strlen($parts[1]) % 4, '=', STR_PAD_RIGHT)), true);
    if (!$payload) {
        echo json_encode(['status' => 'error', 'message' => 'Failed to parse Google credential.']);
        exit;
    }
    if (($payload['aud'] ?? '') !== $googleClientId) {
        echo json_encode(['status' => 'error', 'message' => 'Google credential audience mismatch.']);
        exit;
    }
    if (!in_array($payload['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true)) {
        echo json_encode(['status' => 'error', 'message' => 'Invalid Google credential issuer.']);
        exit;
    }
    if (($payload['exp'] ?? 0) < time()) {
        echo json_encode(['status' => 'error', 'message' => 'Google credential has expired. Please try again.']);
        exit;
    }

    $googleEmail = filter_var($payload['email'] ?? '', FILTER_VALIDATE_EMAIL);
    $googleName  = trim((string)($payload['name'] ?? ''));

    if (!$googleEmail) {
        echo json_encode(['status' => 'error', 'message' => 'No email found in Google account.']);
        exit;
    }

    require_once __DIR__ . '/../admin/includes/enquiries-schema.php';
    dropcars_ensure_customers_columns($pdo);

    $stmt = $pdo->prepare("SELECT * FROM `customers` WHERE `email` = ? LIMIT 1");
    $stmt->execute([$googleEmail]);
    $customer = $stmt->fetch();

    if ($customer) {
        $pdo->prepare("UPDATE `customers` SET `name` = COALESCE(NULLIF(`name`,''), ?), `is_verified` = 1 WHERE `id` = ?")
            ->execute([$googleName, $customer['id']]);
        $savedName = $googleName ?: ($customer['name'] ?: 'Customer');
    } else {
        $pdo->prepare("INSERT INTO `customers` (`name`, `email`, `phone`, `is_verified`) VALUES (?, ?, '', 1)")
            ->execute([$googleName ?: 'Google User', $googleEmail]);
        $savedName = $googleName ?: 'Google User';
        $newCustId = $pdo->lastInsertId();
        
        // Apply referral credit for new email user registration (Google OAuth)
        if (function_exists('dropcars_credit_signup_referral')) {
            dropcars_credit_signup_referral($pdo, $newCustId);
        }
    }

    $_SESSION['customer_email'] = $googleEmail;
    if (!empty($customer['phone'])) {
        $_SESSION['customer_phone'] = $customer['phone'];
    }

    echo json_encode(['status' => 'verified', 'name' => $savedName]);
    exit;
}

// ─────────────────────────────────────────────────────────────────────────────
// METHOD: email  — just validate fields & trigger OTP send
// (actual OTP generation happens in api/send_email_otp.php)
// This method here is the legacy direct-login path — redirect client to send OTP
// ─────────────────────────────────────────────────────────────────────────────
if ($method === 'email') {
    // This method is no longer used for direct login.
    // The frontend calls api/send_email_otp.php directly.
    echo json_encode(['status' => 'error', 'message' => 'Please use the OTP verification flow.']);
    exit;
}

// ─────────────────────────────────────────────────────────────────────────────
// METHOD: phone  — register + send WhatsApp verification request to ADMIN
// ─────────────────────────────────────────────────────────────────────────────
if ($method === 'phone') {
    $phone = trim((string)($_POST['phone'] ?? ''));
    $name  = trim((string)($_POST['name']  ?? ''));
    $cc    = trim((string)($_POST['countryCode'] ?? '+91'));

    if (!$phone) {
        echo json_encode(['status' => 'error', 'message' => 'Phone number is required.']);
        exit;
    }

    // Normalise number
    $digits = preg_replace('/\D/', '', $phone);
    if (strpos($phone, '+') !== 0) {
        $phone = $cc . ' ' . $phone;
    }

    require_once __DIR__ . '/../admin/includes/enquiries-schema.php';
    dropcars_ensure_customers_columns($pdo);

    $stmt = $pdo->prepare("SELECT * FROM `customers` WHERE `phone` = ? LIMIT 1");
    $stmt->execute([$phone]);
    $customer = $stmt->fetch();

    // If already verified → log them in immediately
    if ($customer && $customer['is_verified']) {
        $_SESSION['customer_phone'] = $phone;
        if (!empty($customer['email'])) {
            $_SESSION['customer_email'] = $customer['email'];
        }
        echo json_encode(['status' => 'verified', 'name' => explode(' ', $customer['name'] ?? 'Customer')[0]]);
        exit;
    }

    // Register if new
    if (!$customer) {
        $pdo->prepare("INSERT INTO `customers` (`name`, `phone`, `is_verified`) VALUES (?, ?, 0)")
            ->execute([$name ?: 'New Customer', $phone]);
    }

    // Build secure verify link for admin
    $token      = hash_hmac('sha256', $phone, $hmacKey);
    $siteBase   = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http')
                  . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
    $verifyLink = $siteBase . '/api/verify_mobile.php?phone=' . urlencode($phone) . '&token=' . $token;

    $customerDisplay = $name ?: $phone;
    $waMsg = "🌟 *DROP CARS* 🌟\n"
           . "_Secure Mobile Verification_\n\n"
           . "Dear Admin,\n\n"
           . "A customer is requesting mobile access to their dashboard:\n\n"
           . "━━━━━━━━━━━━━━━━━━━\n"
           . "👤 *CUSTOMER INFO*\n"
           . "━━━━━━━━━━━━━━━━━━━\n"
           . "👤 *Name/ID:* {$customerDisplay}\n"
           . "📱 *Phone:* {$phone}\n\n"
           . "━━━━━━━━━━━━━━━━━━━\n"
           . "🔐 *ACTION REQUIRED*\n"
           . "━━━━━━━━━━━━━━━━━━━\n"
           . "Tap the verification link below to approve this login request:\n"
           . "👉 " . $verifyLink;

    $waUrl = "https://wa.me/{$adminWaNum}?text=" . rawurlencode($waMsg);

    echo json_encode([
        'status'  => 'pending_admin',
        'wa_url'  => $waUrl,
        'phone'   => $phone,
        'message' => 'A WhatsApp message has been prepared for the admin to verify your number. Please send it and wait for approval.',
    ]);
    exit;
}

// ─────────────────────────────────────────────────────────────────────────────
// METHOD: check_verified  — frontend polls this while waiting for admin approval
// ─────────────────────────────────────────────────────────────────────────────
if ($method === 'check_verified') {
    $phone = trim((string)($_POST['phone'] ?? ''));
    if (!$phone) {
        echo json_encode(['status' => 'error', 'message' => 'Phone required.']);
        exit;
    }

    $stmt = $pdo->prepare("SELECT `is_verified`, `name`, `email` FROM `customers` WHERE `phone` = ? LIMIT 1");
    $stmt->execute([$phone]);
    $row = $stmt->fetch();

    if ($row && $row['is_verified']) {
        $_SESSION['customer_phone'] = $phone;
        if (!empty($row['email'])) {
            $_SESSION['customer_email'] = $row['email'];
        }
        echo json_encode(['status' => 'verified', 'name' => explode(' ', $row['name'] ?? 'Customer')[0]]);
    } else {
        echo json_encode(['status' => 'pending']);
    }
    exit;
}

echo json_encode(['status' => 'error', 'message' => 'Unknown method.']);
