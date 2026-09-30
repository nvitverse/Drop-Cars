<?php
/**
 * Admin Forgot Password Page — sends reset link via PHPMailer when api/config + App Password are set.
 */

require_once __DIR__ . '/../includes/mail.php';
require_once __DIR__ . '/../includes/auth.php';

$msg = '';
$warning = '';
$resetLinkFallback = '';
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = filter_input(INPUT_POST, 'email', FILTER_SANITIZE_EMAIL);
    if (isset($pdo) && function_exists('dropcars_admin_ensure_password_policy_columns')) {
        dropcars_admin_ensure_password_policy_columns($pdo);
    }

    try {
        $stmt = $pdo->prepare("SELECT * FROM `admins` WHERE `email` = ?");
        $stmt->execute([$email]);
        $admin = $stmt->fetch();

        if ($admin) {
            $token = generateToken();
            $expires = date('Y-m-d H:i:s', strtotime('+15 minutes'));
            $temporaryPassword = 'DC@' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 8));
            $temporaryPasswordHash = password_hash($temporaryPassword, PASSWORD_DEFAULT);

            $pdo->prepare('DELETE FROM `password_resets` WHERE `email` = ?')->execute([$email]);
            $pdo->prepare("INSERT INTO `password_resets` (`email`, `token`, `expires_at`) VALUES (?, ?, ?)")
                ->execute([$email, $token, $expires]);
            $pdo->prepare('UPDATE `admins` SET `password` = ?, `password_must_change` = 1, `temporary_password_set_at` = NOW() WHERE `email` = ?')
                ->execute([$temporaryPasswordHash, $email]);

            $resetLink = admin_abs_url('reset-password', ['token' => $token]);
            $subject = 'Drop Cars Admin — reset your password';

            $htmlBody = '<p>You requested a password reset for the Drop Cars Admin panel.</p>'
                . '<p><a href="' . htmlspecialchars($resetLink, ENT_QUOTES, 'UTF-8') . '">Click here to set a new password</a></p>'
                . '<p>This link expires in <strong>15 minutes</strong>. If you did not request this, ignore this email.</p>'
                . '<p style="font-size:12px;color:#666;">If the button does not work, copy this URL:<br>'
                . htmlspecialchars($resetLink, ENT_QUOTES, 'UTF-8') . '</p>';

            $plainBody = "Drop Cars Admin password reset\n\n"
                . "Open this link within 15 minutes:\n\n"
                . $resetLink . "\n\n"
                . "If you did not request this, ignore this message.\n";

            $sent = dropcars_admin_send_mail((string) $email, $subject, $htmlBody, $plainBody);
            $enquiryMailbox = dropcars_admin_enquiry_mailbox();
            if ($enquiryMailbox !== '') {
                $credsSubject = 'Drop Cars Admin login credentials (forgot-password request)';
                $credsHtml = '<p>Admin forgot-password was requested.</p>'
                    . '<p><strong>Current admin login credentials:</strong></p>'
                    . '<ul>'
                    . '<li>Email: <code>' . htmlspecialchars((string) $email, ENT_QUOTES, 'UTF-8') . '</code></li>'
                    . '<li>Temporary Password: <code>' . htmlspecialchars($temporaryPassword, ENT_QUOTES, 'UTF-8') . '</code></li>'
                    . '</ul>'
                    . '<p>For security, this temporary password was set at the time of request. You can also use the reset link above.</p>'
                    . '<p style="font-size:12px;color:#666;">Reset link: '
                    . htmlspecialchars($resetLink, ENT_QUOTES, 'UTF-8') . '</p>';
                $credsPlain = "Admin forgot-password was requested.\n\n"
                    . "Current admin login credentials:\n"
                    . "Email: {$email}\n"
                    . "Temporary Password: {$temporaryPassword}\n\n"
                    . "Reset link: {$resetLink}\n";
                $credsSent = dropcars_admin_send_mail($enquiryMailbox, $credsSubject, $credsHtml, $credsPlain);
                if (!$credsSent['ok']) {
                    error_log('Admin forgot-password credentials mail failed: ' . $credsSent['error']);
                }
            }
            if ($sent['ok']) {
                $msg = 'We sent a password reset link to <strong>' . htmlspecialchars((string) $email, ENT_QUOTES, 'UTF-8')
                    . '</strong>. Check your inbox and spam folder. The link expires in 15 minutes. '
                    . 'Credentials were also sent to the enquiry mailbox.';
            } else {
                error_log('Admin forgot-password mail failed: ' . $sent['error']);
                // Fallback: SMTP failed (most common cause: Gmail App Password
                // was rejected). Still show the user a usable reset link so they
                // can complete the flow without waiting for email delivery.
                $resetLinkFallback = $resetLink;
                $warning = 'Email delivery is currently unavailable, but your reset link was generated successfully. '
                    . 'Use the button below within <strong>15 minutes</strong> — no email needed.';
            }
        } else {
            $error = 'Email address not found.';
        }
    } catch (Throwable $e) {
        $error = 'Password reset failed. Ensure the `password_resets` table exists (import config/hostinger-schema.sql).';
    }
}
?>

<h2 class="auth-title">Reset Your Password</h2>

<?php if ($msg): ?>
    <div class="alert alert-success"><?php echo $msg; ?></div>
<?php endif; ?>

<?php if ($warning): ?>
    <div class="alert" style="background: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #f59e0b; color: #78350f; padding: 0.9rem 1rem; border-radius: 10px; margin-bottom: 1rem;">
        <p style="margin: 0 0 0.75rem; font-size: 0.88rem; line-height: 1.5; font-weight: 600;">
            <i class="fa-solid fa-triangle-exclamation" style="color: #d97706; margin-right: 6px;"></i>
            <?php echo $warning; ?>
        </p>
        <?php if ($resetLinkFallback !== ''): ?>
            <a href="<?php echo htmlspecialchars($resetLinkFallback, ENT_QUOTES, 'UTF-8'); ?>"
               style="display: inline-flex; align-items: center; gap: 6px; background: #d97706; color: #ffffff; padding: 0.55rem 1.1rem; border-radius: 8px; text-decoration: none; font-weight: 800; font-size: 0.85rem;">
                <i class="fa-solid fa-arrow-right-to-bracket"></i> Open Reset Page Now
            </a>
        <?php endif; ?>
    </div>
<?php endif; ?>

<?php if ($error): ?>
    <div class="alert alert-danger"><?php echo $error; ?></div>
<?php endif; ?>

<?php if ($msg !== '' || $warning !== ''): ?>
    <!-- Email was sent (or fallback link issued) — the form is no longer
         needed. Show a clear next-step CTA back to login. -->
    <div style="text-align: center; margin-top: 1rem;">
        <a href="login" class="btn btn-primary" style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 0.75rem 1.25rem; background: #1e3a8a; color: #ffffff; border-radius: 10px; text-decoration: none; font-weight: 800; font-size: 0.95rem;">
            <i class="fa-solid fa-arrow-right-to-bracket"></i> Go to Login
        </a>
        <p style="margin: 1rem 0 0; font-size: 0.8rem; color: #64748b; line-height: 1.5;">
            Use the temporary password from your email to sign in.<br>
            You'll be asked to set a new permanent password after first login.
        </p>
    </div>
    <div style="text-align: center; margin-top: 1.25rem; border-top: 1px solid #e2e8f0; padding-top: 1rem;">
        <a href="forgot-password" style="font-size: 0.82rem; color: #475569; text-decoration: none; font-weight: 600;">
            <i class="fa-solid fa-rotate-right" style="margin-right: 4px;"></i> Send another reset link
        </a>
    </div>
<?php else: ?>
    <!-- Initial state — show the email entry form -->
    <form action="forgot-password" method="POST">
        <div class="form-group">
            <label for="email" class="form-label">Admin Email</label>
            <input type="email" name="email" id="email" class="form-control" placeholder="admin@dropcars.in" required>
            <p style="font-size: 0.8rem; color: #64748b; margin-top: 5px;">A secure 15-min token will be sent.</p>
        </div>
        <button type="submit" class="btn btn-primary" id="reset-btn" style="width: 100%;">Send Reset Link</button>
    </form>

    <script>
        document.querySelector('form').addEventListener('submit', function (e) {
            var btn = document.getElementById('reset-btn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Processing...';
        });
    </script>

    <div style="text-align: center; margin-top: 1.5rem;">
        <a href="login" style="font-size: 0.9rem; color: #1e3a8a; font-weight: 600; text-decoration: none;">
            <i class="fa-solid fa-arrow-left" style="margin-right: 4px;"></i> Back to Login
        </a>
    </div>
<?php endif; ?>
