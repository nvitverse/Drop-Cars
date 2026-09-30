<?php
/**
 * api/send_email_otp.php
 * Generates a 6-digit OTP, stores it in $_SESSION, and emails it to the customer.
 *
 * POST params:
 *   email  – recipient email address
 *   name   – customer name (optional, for personalising the email)
 *   phone  – mobile number (stored with the pending OTP)
 */
require_once __DIR__ . '/../config/session.php';
session_start();
header('Content-Type: application/json');

// Prevent browser caching
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$email = trim((string)($_POST['email'] ?? ''));
$name  = trim((string)($_POST['name']  ?? ''));
$phone = trim((string)($_POST['phone'] ?? ''));

if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['status' => 'error', 'message' => 'A valid email address is required.']);
    exit;
}

// ── Rate-limit: max 3 sends per email per 10 minutes ──────────────────────────
$rateBucket = 'otp_rate_' . md5($email);
$now        = time();
if (!isset($_SESSION[$rateBucket])) {
    $_SESSION[$rateBucket] = ['count' => 0, 'window_start' => $now];
}
$rate = &$_SESSION[$rateBucket];
if (($now - $rate['window_start']) > 600) {          // reset after 10 min
    $rate = ['count' => 0, 'window_start' => $now];
}
if ($rate['count'] >= 3) {
    echo json_encode(['status' => 'error', 'message' => 'Too many code requests. Please wait a few minutes.']);
    exit;
}
$rate['count']++;

// ── Generate OTP & store in session ──────────────────────────────────────────
$otp     = str_pad((string)random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
$expires = $now + 600; // 10 minutes

$_SESSION['email_otp'] = [
    'otp'     => $otp,
    'email'   => $email,
    'name'    => $name,
    'phone'   => $phone,
    'expires' => $expires,
];

// ── Build email ───────────────────────────────────────────────────────────────
$displayName = $name ?: 'Customer';
$subject     = 'Your Drop Cars Login Code: ' . $otp;

$htmlBody = <<<HTML
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Inter',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 20px;">
  <tr><td>
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.08);">
      <tr>
        <td style="background:linear-gradient(135deg,#1e4b7f 0%,#153960 100%);padding:32px 36px;text-align:center;">
          <p style="margin:0;color:rgba(255,255,255,0.7);font-size:0.82rem;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;">Drop Cars</p>
          <h1 style="margin:8px 0 0;color:#ffffff;font-size:1.6rem;font-weight:800;letter-spacing:-0.5px;">Your Login Code</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:36px;">
          <p style="margin:0 0 20px;color:#334155;font-size:1rem;font-weight:500;">Hi <strong>{$displayName}</strong>,</p>
          <p style="margin:0 0 28px;color:#64748b;font-size:0.95rem;line-height:1.6;">Use the code below to sign in to your Drop Cars account. It expires in <strong>10 minutes</strong>.</p>

          <div style="background:#f8fafc;border:2px dashed #cbd5e1;border-radius:16px;padding:28px;text-align:center;margin-bottom:28px;">
            <p style="margin:0 0 6px;font-size:0.75rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Verification Code</p>
            <p style="margin:0;font-size:3rem;font-weight:900;color:#1e4b7f;letter-spacing:10px;line-height:1.2;">{$otp}</p>
          </div>

          <p style="margin:0 0 24px;color:#94a3b8;font-size:0.82rem;text-align:center;line-height:1.5;">If you didn't request this code, you can safely ignore this email.<br>Someone may have entered your address by mistake.</p>

          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
          <p style="margin:0;color:#94a3b8;font-size:0.78rem;text-align:center;">© Drop Cars · Trusted Cab Booking Platform</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>
HTML;

$plainBody = "Hi {$displayName},\n\nYour Drop Cars login code is: {$otp}\n\nThis code expires in 10 minutes.\n\nIf you did not request this, please ignore this email.\n\n— Drop Cars Team";

// ── Send via project mailer ───────────────────────────────────────────────────
require_once __DIR__ . '/../admin/includes/mail.php';
$result = dropcars_admin_send_mail($email, $subject, $htmlBody, $plainBody);

if (!$result['ok']) {
    // Don't expose full SMTP error to the client
    error_log('[DropCars OTP] Failed to send OTP email: ' . $result['error']);
    echo json_encode(['status' => 'error', 'message' => 'Failed to send verification code. Please try again or use Quick Mobile login.']);
    exit;
}

echo json_encode([
    'status'  => 'sent',
    'message' => 'Verification code sent to ' . $email . '. Check your inbox (and spam folder).',
    'expires' => $expires,
]);
