<?php
/**
 * Admin change login email — verified with a 6-digit code sent to the CURRENT (old) email.
 *
 * Flow:
 *   Stage 1 (request): admin enters new email + current password.
 *                      -> a 6-digit code is emailed to the OLD email.
 *   Stage 2 (verify):  admin enters the code -> login email is updated.
 */

$error = '';
$success = '';
$adminId = (int) ($_SESSION['admin_id'] ?? 0);
$currentEmail = (string) ($_SESSION['admin_email'] ?? '');
$adminName = (string) ($_SESSION['admin_name'] ?? 'Admin');

if ($adminId <= 0) {
    header('Location: ' . admin_url('login'));
    exit;
}

require_once __DIR__ . '/../includes/mail.php';

// Pull any flash + the pending change state from the session.
$flash = $_SESSION['admin_change_email_flash'] ?? null;
if (is_array($flash)) {
    $error = (string) ($flash['error'] ?? '');
    $success = (string) ($flash['success'] ?? '');
}
unset($_SESSION['admin_change_email_flash']);

$pending = $_SESSION['email_change'] ?? null;
$pendingValid = is_array($pending)
    && !empty($pending['new_email'])
    && !empty($pending['code_hash'])
    && (int) ($pending['expires'] ?? 0) > time();

if (is_array($pending) && !$pendingValid) {
    // Expired or malformed — clear it.
    unset($_SESSION['email_change']);
    $pending = null;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $redirectTo = admin_url('change-email');

    // ── Cancel a pending change ─────────────────────────────────────
    if (isset($_POST['cancel_email_change'])) {
        unset($_SESSION['email_change']);
        $_SESSION['admin_change_email_flash'] = ['error' => '', 'success' => 'Email change cancelled.'];
        header('Location: ' . $redirectTo);
        exit;
    }

    // ── Stage 1: request a change (send code to OLD email) ──────────
    if (isset($_POST['request_email_change'])) {
        $newEmail = trim((string) ($_POST['new_email'] ?? ''));

        if (dropcars_is_recovery_email($currentEmail)) {
            $error = 'This is the protected main / recovery email and cannot be changed.';
        } elseif (dropcars_is_recovery_email($newEmail)) {
            $error = 'That address is reserved as the main / recovery email and cannot be used as a login email.';
        } elseif (!filter_var($newEmail, FILTER_VALIDATE_EMAIL)) {
            $error = 'Please enter a valid new email address.';
        } elseif (strcasecmp($newEmail, $currentEmail) === 0) {
            $error = 'The new email must be different from your current email.';
        } else {
            // Ensure the new email is not already used by another admin.
            try {
                $dupe = $pdo->prepare('SELECT `id` FROM `admins` WHERE `email` = ? AND `id` <> ? LIMIT 1');
                $dupe->execute([$newEmail, $adminId]);
                $exists = (bool) $dupe->fetchColumn();
            } catch (Throwable $e) {
                $exists = false;
            }

            if ($exists) {
                $error = 'That email is already in use by another admin account.';
            } else {
                // Generate + store the verification code (hashed) in the session.
                $code = (string) random_int(100000, 999999);
                $_SESSION['email_change'] = [
                    'new_email' => $newEmail,
                    'code_hash' => password_hash($code, PASSWORD_DEFAULT),
                    'expires'   => time() + 600, // 10 minutes
                    'attempts'  => 0,
                    'sent_to'   => $currentEmail,
                ];

                // Email the code to the OLD (current) email.
                $subject = 'Drop Cars Admin — Confirm your email change';
                $html = '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a;">'
                    . '<h2 style="margin:0 0 8px;">Confirm your email change</h2>'
                    . '<p style="color:#475569;line-height:1.6;">A request was made to change your Drop Cars admin login email to '
                    . '<strong>' . htmlspecialchars($newEmail, ENT_QUOTES, 'UTF-8') . '</strong>.</p>'
                    . '<p style="color:#475569;line-height:1.6;">Enter this verification code to confirm. It expires in 10 minutes.</p>'
                    . '<div style="font-size:32px;font-weight:800;letter-spacing:8px;background:#f1f5f9;border-radius:12px;'
                    . 'padding:18px;text-align:center;margin:18px 0;color:#0f172a;">' . htmlspecialchars($code, ENT_QUOTES, 'UTF-8') . '</div>'
                    . '<p style="color:#94a3b8;font-size:12px;line-height:1.5;">If you did not request this, ignore this email and your '
                    . 'login email will stay the same. For safety, consider changing your password.</p></div>';
                $plain = "Confirm your Drop Cars admin email change to {$newEmail}.\n\nVerification code: {$code}\n(Expires in 10 minutes.)\n\nIf you didn't request this, ignore this email.";

                $sent = dropcars_admin_send_mail($currentEmail, $subject, $html, $plain);
                if (!$sent['ok']) {
                    unset($_SESSION['email_change']);
                    $error = 'Could not send the verification email: ' . $sent['error'];
                } else {
                    // Always copy the code to the protected recovery email for safety.
                    $recoveryEmail = dropcars_recovery_email();
                    if (strcasecmp($recoveryEmail, $currentEmail) !== 0) {
                        $recHtml = '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a;">'
                            . '<h2 style="margin:0 0 8px;">Admin email-change requested</h2>'
                            . '<p style="color:#475569;line-height:1.6;">A request was made to change the Drop Cars admin login email from '
                            . '<strong>' . htmlspecialchars($currentEmail, ENT_QUOTES, 'UTF-8') . '</strong> to '
                            . '<strong>' . htmlspecialchars($newEmail, ENT_QUOTES, 'UTF-8') . '</strong>.</p>'
                            . '<p style="color:#475569;line-height:1.6;">Verification code (also sent to the current login email):</p>'
                            . '<div style="font-size:32px;font-weight:800;letter-spacing:8px;background:#f1f5f9;border-radius:12px;padding:18px;text-align:center;margin:18px 0;color:#0f172a;">' . htmlspecialchars($code, ENT_QUOTES, 'UTF-8') . '</div>'
                            . '<p style="color:#94a3b8;font-size:12px;line-height:1.5;">You are receiving this because this is the protected recovery email. If this change was not expected, do not share the code.</p></div>';
                        $recPlain = "Admin email-change requested: {$currentEmail} -> {$newEmail}\nVerification code: {$code} (expires in 10 minutes)\nYou received this as the protected recovery email.";
                        dropcars_admin_send_mail($recoveryEmail, 'Drop Cars Admin — email change requested (recovery copy)', $recHtml, $recPlain);
                    }
                    if (function_exists('dropcars_security_log')) {
                        dropcars_security_log('ADMIN_EMAIL_CHANGE_REQUESTED', ['to' => $newEmail]);
                    }
                    $_SESSION['admin_change_email_flash'] = [
                        'error'   => '',
                        'success' => 'We sent a 6-digit code to your current email (' . $currentEmail . '). Enter it below to confirm.',
                    ];
                    header('Location: ' . $redirectTo);
                    exit;
                }
            }
        }
        $_SESSION['admin_change_email_flash'] = ['error' => $error, 'success' => $success];
        header('Location: ' . $redirectTo);
        exit;
    }

    // ── Resend the code ─────────────────────────────────────────────
    if (isset($_POST['resend_email_change']) && $pendingValid) {
        $code = (string) random_int(100000, 999999);
        $_SESSION['email_change']['code_hash'] = password_hash($code, PASSWORD_DEFAULT);
        $_SESSION['email_change']['expires'] = time() + 600;
        $_SESSION['email_change']['attempts'] = 0;
        $newEmail = (string) $_SESSION['email_change']['new_email'];

        $subject = 'Drop Cars Admin — Confirm your email change';
        $html = '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a;">'
            . '<h2 style="margin:0 0 8px;">Confirm your email change</h2>'
            . '<p style="color:#475569;line-height:1.6;">New login email: <strong>' . htmlspecialchars($newEmail, ENT_QUOTES, 'UTF-8') . '</strong>.</p>'
            . '<div style="font-size:32px;font-weight:800;letter-spacing:8px;background:#f1f5f9;border-radius:12px;'
            . 'padding:18px;text-align:center;margin:18px 0;color:#0f172a;">' . htmlspecialchars($code, ENT_QUOTES, 'UTF-8') . '</div>'
            . '<p style="color:#94a3b8;font-size:12px;">Expires in 10 minutes.</p></div>';
        $plain = "Your new Drop Cars admin email verification code: {$code}\n(Expires in 10 minutes.)";

        $sent = dropcars_admin_send_mail((string) ($pending['sent_to'] ?? $currentEmail), $subject, $html, $plain);
        $_SESSION['admin_change_email_flash'] = $sent['ok']
            ? ['error' => '', 'success' => 'A new code was sent to your current email.']
            : ['error' => 'Could not resend the code: ' . $sent['error'], 'success' => ''];
        header('Location: ' . $redirectTo);
        exit;
    }

    // ── Stage 2: verify the code + apply the change ─────────────────
    if (isset($_POST['verify_email_change'])) {
        if (!$pendingValid) {
            $error = 'Your verification code has expired. Please start again.';
            unset($_SESSION['email_change']);
        } else {
            $entered = preg_replace('/\D/', '', (string) ($_POST['code'] ?? ''));
            $attempts = (int) ($_SESSION['email_change']['attempts'] ?? 0);

            if ($attempts >= 5) {
                unset($_SESSION['email_change']);
                $error = 'Too many incorrect attempts. Please start again.';
            } elseif ($entered === '' || !password_verify($entered, (string) $pending['code_hash'])) {
                $_SESSION['email_change']['attempts'] = $attempts + 1;
                $error = 'Incorrect code. ' . (4 - $attempts) . ' attempt(s) left.';
            } else {
                $newEmail = (string) $pending['new_email'];
                // Final uniqueness re-check before committing.
                try {
                    $dupe = $pdo->prepare('SELECT `id` FROM `admins` WHERE `email` = ? AND `id` <> ? LIMIT 1');
                    $dupe->execute([$newEmail, $adminId]);
                    $exists = (bool) $dupe->fetchColumn();
                } catch (Throwable $e) {
                    $exists = false;
                }

                if ($exists) {
                    unset($_SESSION['email_change']);
                    $error = 'That email is now in use by another account. Please try a different one.';
                } else {
                    $updated = false;
                    try {
                        $upd = $pdo->prepare('UPDATE `admins` SET `email` = ? WHERE `id` = ?');
                        $updated = (bool) $upd->execute([$newEmail, $adminId]);
                    } catch (Throwable $e) {
                        $updated = false;
                    }

                    if ($updated) {
                        $_SESSION['admin_email'] = $newEmail; // refresh session identity
                        unset($_SESSION['email_change']);
                        if (function_exists('dropcars_security_log')) {
                            dropcars_security_log('ADMIN_EMAIL_CHANGED', ['new_email' => $newEmail]);
                        }
                        $_SESSION['admin_change_email_flash'] = [
                            'error'   => '',
                            'success' => 'Your login email was updated to ' . $newEmail . '. Use it next time you sign in.',
                        ];
                    } else {
                        $error = 'Could not update your email right now. Please try again.';
                    }
                }
            }
        }
        $_SESSION['admin_change_email_flash'] = $_SESSION['admin_change_email_flash'] ?? ['error' => $error, 'success' => $success];
        header('Location: ' . $redirectTo);
        exit;
    }
}

// Re-read pending state after any redirects above.
$pending = $_SESSION['email_change'] ?? null;
$pendingValid = is_array($pending)
    && !empty($pending['new_email'])
    && (int) ($pending['expires'] ?? 0) > time();
$pendingNewEmail = $pendingValid ? (string) $pending['new_email'] : '';
?>

<style>
.ce-wrapper { display:flex; justify-content:center; align-items:flex-start; padding:2rem 1rem; font-family:'Inter',system-ui,sans-serif; min-height:calc(100vh - 100px); }
.ce-card { background:#fff; border-radius:24px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.05),0 8px 10px -6px rgba(0,0,0,0.01); padding:3rem; width:100%; max-width:480px; border:1px solid #f1f5f9; }
.ce-header { text-align:center; margin-bottom:2rem; }
.ce-header .icon-wrap { width:64px; height:64px; background:#fffbeb; border-radius:20px; display:flex; align-items:center; justify-content:center; margin:0 auto 1.25rem; color:#d97706; font-size:1.75rem; }
.ce-header h1 { font-size:1.6rem; font-weight:850; color:#0f172a; margin:0 0 0.5rem; letter-spacing:-0.02em; }
.ce-header p { color:#64748b; font-size:0.95rem; margin:0; line-height:1.5; }
.ce-current { background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:0.75rem 1rem; margin-bottom:1.75rem; font-size:0.85rem; color:#475569; text-align:center; }
.ce-current strong { color:#0f172a; }
.ce-group { margin-bottom:1.5rem; }
.ce-label { display:block; font-size:0.8rem; font-weight:700; color:#475569; margin-bottom:0.5rem; text-transform:uppercase; letter-spacing:0.05em; }
.ce-input-wrap { position:relative; }
.ce-input-wrap i.prefix { position:absolute; left:1.25rem; top:50%; transform:translateY(-50%); color:#94a3b8; font-size:1.1rem; }
.ce-input { width:100%; padding:1rem 1.25rem 1rem 3.25rem; border:2px solid #e2e8f0; border-radius:14px; font-size:1rem; font-weight:600; color:#0f172a; transition:all 0.2s; background:#f8fafc; }
.ce-input:focus { background:#fff; border-color:#f7b733; outline:none; box-shadow:0 0 0 4px rgba(247,183,51,0.15); }
.ce-input.code { text-align:center; letter-spacing:10px; font-size:1.6rem; font-weight:800; padding-left:1.25rem; }
.ce-toggle { position:absolute; right:1.25rem; top:50%; transform:translateY(-50%); background:none; border:none; color:#94a3b8; cursor:pointer; padding:0; font-size:1rem; }
.ce-toggle:hover { color:#d97706; }
.ce-alert { padding:1.1rem 1.25rem; border-radius:14px; font-size:0.9rem; font-weight:600; margin-bottom:1.75rem; display:flex; align-items:center; gap:0.75rem; }
.ce-alert-error { background:#fef2f2; color:#991b1b; border:1px solid #fecaca; }
.ce-alert-success { background:#f0fdf4; color:#166534; border:1px solid #bbf7d0; }
.ce-btn { width:100%; padding:1.05rem; background:#f7b733; color:#1e293b; border:none; border-radius:14px; font-size:1.05rem; font-weight:800; cursor:pointer; transition:all 0.2s; margin-top:0.5rem; display:flex; justify-content:center; align-items:center; gap:0.5rem; box-shadow:0 4px 6px -1px rgba(247,183,51,0.25); }
.ce-btn:hover { filter:brightness(1.03); transform:translateY(-2px); box-shadow:0 10px 15px -3px rgba(247,183,51,0.3); }
.ce-btn-secondary { width:100%; padding:0.85rem; background:#fff; color:#64748b; border:1px solid #e2e8f0; border-radius:12px; font-size:0.9rem; font-weight:700; cursor:pointer; margin-top:0.75rem; }
.ce-btn-secondary:hover { background:#f8fafc; color:#0f172a; }
.ce-inline-actions { display:flex; gap:0.75rem; margin-top:0.75rem; }
.ce-inline-actions form { flex:1; margin:0; }
.ce-steps { display:flex; gap:0.5rem; justify-content:center; margin-bottom:1.5rem; }
.ce-step { display:flex; align-items:center; gap:0.4rem; font-size:0.75rem; font-weight:700; color:#94a3b8; }
.ce-step.active { color:#d97706; }
.ce-step .dot { width:22px; height:22px; border-radius:50%; background:#e2e8f0; color:#fff; display:flex; align-items:center; justify-content:center; font-size:0.7rem; }
.ce-step.active .dot { background:#f7b733; color:#1e293b; }
@media(max-width:600px){ .ce-card{ padding:2rem 1.5rem; border-radius:20px; } .ce-header h1{ font-size:1.4rem; } }
</style>

<div class="ce-wrapper">
    <div class="ce-card">
        <div class="ce-header">
            <div class="icon-wrap"><i class="fa-solid fa-envelope-circle-check"></i></div>
            <h1>Change Login Email</h1>
            <p>Verify with a code sent to your current email, then switch to a new one.</p>
        </div>

        <div class="ce-steps">
            <div class="ce-step <?php echo $pendingValid ? '' : 'active'; ?>"><span class="dot">1</span> Request</div>
            <div class="ce-step <?php echo $pendingValid ? 'active' : ''; ?>"><span class="dot">2</span> Verify</div>
        </div>

        <?php if ($error): ?>
            <div class="ce-alert ce-alert-error"><i class="fa-solid fa-circle-exclamation"></i><div><?php echo htmlspecialchars($error, ENT_QUOTES, 'UTF-8'); ?></div></div>
        <?php endif; ?>
        <?php if ($success): ?>
            <div class="ce-alert ce-alert-success"><i class="fa-solid fa-circle-check"></i><div><?php echo htmlspecialchars($success, ENT_QUOTES, 'UTF-8'); ?></div></div>
        <?php endif; ?>

        <div class="ce-current">Current login email: <strong><?php echo htmlspecialchars($currentEmail, ENT_QUOTES, 'UTF-8'); ?></strong></div>
        <div class="ce-current" style="background:#fffbeb;border-color:#fde68a;color:#92400e;">
            <i class="fa-solid fa-shield-halved"></i> Recovery email (protected &amp; unchangeable): <strong><?php echo htmlspecialchars(dropcars_recovery_email(), ENT_QUOTES, 'UTF-8'); ?></strong>
        </div>

        <?php if (dropcars_is_recovery_email($currentEmail)): ?>
            <div class="ce-alert ce-alert-error" style="background:#fffbeb;color:#92400e;border-color:#fde68a;">
                <i class="fa-solid fa-lock"></i>
                <div>You are signed in as the protected <strong>main / recovery email</strong>. It cannot be changed — it's reserved for account recovery and important security notifications.</div>
            </div>
        <?php elseif (!$pendingValid): ?>
            <!-- Stage 1: request -->
            <form method="POST" action="<?php echo htmlspecialchars(admin_url('change-email'), ENT_QUOTES, 'UTF-8'); ?>">
                <input type="hidden" name="request_email_change" value="1">
                <div class="ce-group">
                    <label class="ce-label" for="new_email">New Login Email</label>
                    <div class="ce-input-wrap">
                        <i class="fa-solid fa-at prefix"></i>
                        <input class="ce-input" type="email" id="new_email" name="new_email" placeholder="new@email.com" autocomplete="off" required>
                    </div>
                </div>
                <button type="submit" class="ce-btn"><i class="fa-solid fa-paper-plane"></i> Send Verification Code</button>
            </form>
        <?php else: ?>
            <!-- Stage 2: verify -->
            <p style="text-align:center;color:#64748b;font-size:0.9rem;margin:-0.5rem 0 1.25rem;">
                Code sent to your current email. New email will be:<br>
                <strong style="color:#0f172a;"><?php echo htmlspecialchars($pendingNewEmail, ENT_QUOTES, 'UTF-8'); ?></strong>
            </p>
            <form method="POST" action="<?php echo htmlspecialchars(admin_url('change-email'), ENT_QUOTES, 'UTF-8'); ?>">
                <input type="hidden" name="verify_email_change" value="1">
                <div class="ce-group">
                    <label class="ce-label" for="code">Enter 6-Digit Code</label>
                    <div class="ce-input-wrap">
                        <input class="ce-input code" type="text" id="code" name="code" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="------" autocomplete="one-time-code" required>
                    </div>
                </div>
                <button type="submit" class="ce-btn"><i class="fa-solid fa-circle-check"></i> Confirm New Email</button>
            </form>
            <div class="ce-inline-actions">
                <form method="POST" action="<?php echo htmlspecialchars(admin_url('change-email'), ENT_QUOTES, 'UTF-8'); ?>">
                    <input type="hidden" name="resend_email_change" value="1">
                    <button type="submit" class="ce-btn-secondary"><i class="fa-solid fa-rotate-right"></i> Resend Code</button>
                </form>
                <form method="POST" action="<?php echo htmlspecialchars(admin_url('change-email'), ENT_QUOTES, 'UTF-8'); ?>">
                    <input type="hidden" name="cancel_email_change" value="1">
                    <button type="submit" class="ce-btn-secondary"><i class="fa-solid fa-xmark"></i> Cancel</button>
                </form>
            </div>
        <?php endif; ?>
    </div>
</div>

<script>
function ceToggle(id, btn) {
    var el = document.getElementById(id), ic = btn.querySelector('i');
    if (el.type === 'password') { el.type = 'text'; ic.classList.replace('fa-eye', 'fa-eye-slash'); }
    else { el.type = 'password'; ic.classList.replace('fa-eye-slash', 'fa-eye'); }
}
</script>
