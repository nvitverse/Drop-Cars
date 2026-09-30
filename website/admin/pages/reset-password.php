<?php
/**
 * Admin reset password (token from forgot-password).
 */

$error = '';
$success = '';

if (isset($pdo) && function_exists('dropcars_admin_ensure_password_policy_columns')) {
    dropcars_admin_ensure_password_policy_columns($pdo);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $token = preg_replace('/[^a-f0-9]/i', '', (string) ($_POST['token'] ?? ''));
} else {
    $token = preg_replace('/[^a-f0-9]/i', '', (string) ($_GET['token'] ?? ''));
}

$row = null;
if ($token !== '') {
    try {
        $stmt = $pdo->prepare('SELECT * FROM `password_resets` WHERE `token` = ? AND `expires_at` > NOW() LIMIT 1');
        $stmt->execute([$token]);
        $row = $stmt->fetch() ?: null;
    } catch (Throwable $e) {
        $error = 'Password reset is not available (missing DB table). Ensure `password_resets` exists — import config/hostinger-schema.sql.';
    }
}

if ($token === '') {
    $error = 'Invalid or missing reset link. Use Forgot Password to get a new one.';
} elseif ($error === '' && !$row) {
    $error = 'This reset link is invalid or has expired. Request a new one from Forgot Password.';
}

if ($error === '' && $row && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $p1 = (string) ($_POST['password'] ?? '');
    $p2 = (string) ($_POST['password_confirm'] ?? '');
    if (strlen($p1) < 8) {
        $error = 'Password must be at least 8 characters.';
    } elseif ($p1 !== $p2) {
        $error = 'Passwords do not match.';
    } else {
        $hash = password_hash($p1, PASSWORD_DEFAULT);
        $email = (string) $row['email'];
        $pdo->prepare('UPDATE `admins` SET `password` = ?, `password_must_change` = 0, `temporary_password_set_at` = NULL WHERE `email` = ?')
            ->execute([$hash, $email]);
        $pdo->prepare('DELETE FROM `password_resets` WHERE `email` = ? OR `token` = ?')->execute([$email, $token]);
        $success = 'Your password has been updated. You can sign in now.';
        $row = null;
    }
}

$showForm = ($success === '' && $error === '' && $row);
if ($success === '' && $row && $error !== '' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $showForm = true;
}

?>

<h2 class="auth-title">Set a new password</h2>

<?php if ($success): ?>
    <div class="alert alert-success"><?php echo htmlspecialchars($success, ENT_QUOTES, 'UTF-8'); ?></div>
    <div style="text-align: center; margin-top: 1rem;">
        <a href="login" style="display: inline-block; padding: 0.75rem 1.5rem; background: var(--blue-dark); color: #fff; border-radius: 12px; font-weight: 700; text-decoration: none;">Go to login</a>
    </div>
<?php elseif ($showForm): ?>
    <?php if ($error): ?>
        <div class="alert alert-danger"><?php echo htmlspecialchars($error, ENT_QUOTES, 'UTF-8'); ?></div>
    <?php endif; ?>
    <form action="reset-password" method="POST">
        <input type="hidden" name="token" value="<?php echo htmlspecialchars($token, ENT_QUOTES, 'UTF-8'); ?>">
        <div class="form-group">
            <label for="password" class="form-label">New password</label>
            <input type="password" name="password" id="password" class="form-control" minlength="8" autocomplete="new-password" required>
        </div>
        <div class="form-group">
            <label for="password_confirm" class="form-label">Confirm password</label>
            <input type="password" name="password_confirm" id="password_confirm" class="form-control" minlength="8" autocomplete="new-password" required>
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%;">Update password</button>
    </form>
<?php else: ?>
    <?php if ($error): ?>
        <div class="alert alert-danger" style="margin-bottom: 1rem;"><?php echo htmlspecialchars($error, ENT_QUOTES, 'UTF-8'); ?></div>
    <?php endif; ?>
    <!-- Token invalid/expired → give the user clear next steps, not a hidden text link. -->
    <div style="display: flex; flex-direction: column; gap: 0.6rem; margin-top: 0.5rem;">
        <a href="forgot-password" class="btn btn-primary" style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 0.75rem 1.25rem; background: #1e3a8a; color: #ffffff; border-radius: 10px; text-decoration: none; font-weight: 800; font-size: 0.95rem;">
            <i class="fa-solid fa-paper-plane"></i> Request a New Reset Link
        </a>
        <a href="login" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0.6rem 1rem; color: #475569; text-decoration: none; font-weight: 600; font-size: 0.88rem;">
            <i class="fa-solid fa-arrow-left"></i> Back to Login
        </a>
    </div>
<?php endif; ?>

<?php if ($success === '' && !$showForm): ?>
    <!-- Bottom link already provided in the column above; nothing else to render. -->
<?php else: ?>
    <div style="text-align: center; margin-top: 1.5rem;">
        <a href="login" style="font-size: 0.88rem; color: #1e3a8a; font-weight: 600; text-decoration: none;">
            <i class="fa-solid fa-arrow-left" style="margin-right: 4px;"></i> Back to Login
        </a>
    </div>
<?php endif; ?>
