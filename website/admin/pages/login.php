<?php
/**
 * Admin Login Page
 */

if (isLoggedIn()) {
    header('Location: ' . admin_url('dashboard'));
    exit;
}

$error = '';
$devNoAdminHint = '';
$devAdminEmailsHint = '';
$isDev = strtolower((string) (getenv('APP_ENV') ?? '')) === 'development';
$showDevLoginHints = $isDev;

if ($showDevLoginHints && isset($pdo)) {
    try {
        $adminCount = (int) $pdo->query('SELECT COUNT(*) FROM `admins`')->fetchColumn();
        if ($adminCount === 0) {
            $devNoAdminHint = 'No admin account exists yet. Import <code>config/seed-local-admin.sql</code> in phpMyAdmin, or open <a href="' . htmlspecialchars(admin_url('init-admin')) . '">init-admin</a> once.';
        } else {
            $devAdminEmailsHint = '<strong>Login Info:</strong> <code>admin@dropcars.in</code> / <code>admin@dc</code> '
                . '(set by <code>config/seed-local-admin.sql</code> or <a href="' . htmlspecialchars(admin_url('init-admin')) . '">init-admin</a>).';
        }
    } catch (Throwable $e) {
        // ignore
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($pdo) && function_exists('dropcars_admin_ensure_password_policy_columns')) {
        dropcars_admin_ensure_password_policy_columns($pdo);
    }
    $identity = isset($_POST['identity']) ? trim((string) $_POST['identity']) : '';
    if ($identity === '') {
        $error = 'Please enter your username or email address.';
    } else {
        $password = (string) ($_POST['password'] ?? '');

        $stmt = $pdo->prepare('SELECT * FROM `admins` WHERE `email` = ? OR `username` = ?');
        $stmt->execute([$identity, $identity]);
        $admin = $stmt->fetch();

        if ($admin) {
            if (verifyPassword($password, $admin['password'])) {
                login($admin['id'], $admin['name'], $admin['email'], $admin['username'], $admin['role'] ?? 'staff');
                // Bind this session to the admin's current session token (for "log out all devices").
                $sessionToken = (string) ($admin['session_token'] ?? '');
                if ($sessionToken === '') {
                    $sessionToken = bin2hex(random_bytes(16));
                    try {
                        $pdo->prepare('UPDATE `admins` SET `session_token` = ? WHERE `id` = ?')
                            ->execute([$sessionToken, $admin['id']]);
                    } catch (Throwable $e) {
                        // Non-fatal; token enforcement simply stays inactive for this admin.
                    }
                }
                $_SESSION['session_token'] = $sessionToken;
                $mustChange = !empty($admin['password_must_change']);
                dropcars_admin_require_password_change($mustChange);
                // Issue a persistent 365-day cookie so session survives GC on shared hosting
                if (isset($pdo) && function_exists('dropcars_set_remember_token')) {
                    dropcars_set_remember_token($pdo, (int) $admin['id']);
                }
                header('Location: ' . admin_url($mustChange ? 'change-password' : 'dashboard'));
                exit;
            }
            $error = $showDevLoginHints
                ? 'Wrong password. Use <code>admin@dc</code> for <code>admin@dropcars.in</code> (import <code>config/seed-local-admin.sql</code> if needed).'
                : 'Invalid username/email or password.';
        } else {
            $error = $showDevLoginHints
                ? 'No admin with that username/email. Use <code>admin</code> or <code>admin@dropcars.in</code>.'
                : 'Invalid username/email or password.';
        }
    }
}
?>

<h2 class="auth-title">Admin Access Login</h2>

<?php if ($devNoAdminHint !== ''): ?>
    <div class="alert alert-warning" style="text-align:left;font-size:0.9rem;"><?php echo $devNoAdminHint; ?></div>
<?php endif; ?>

<?php if ($devAdminEmailsHint !== ''): ?>
    <div class="alert alert-info" style="text-align:left;font-size:0.85rem;"><?php echo $devAdminEmailsHint; ?></div>
<?php endif; ?>

<?php if ($error): ?>
    <div class="alert alert-danger"><?php echo $error; ?></div>
<?php endif; ?>

<form action="<?php echo htmlspecialchars(admin_url('login')); ?>" method="POST">
    <div class="form-group">
        <label for="identity" class="form-label">Username or Email</label>
        <input type="text" name="identity" id="identity" class="form-control" placeholder="e.g. admin" required autocomplete="username">
    </div>
    <div class="form-group">
        <label for="password" class="form-label">Password</label>
        <input type="password" name="password" id="password" class="form-control" placeholder="••••••••" required>
    </div>
    <button type="submit" class="btn btn-primary" id="login-btn" style="width: 100%;">Sign In</button>
</form>

<script>
document.querySelector('form').addEventListener('submit', function(e) {
    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Authenticating...';
});
</script>

<div style="text-align: center; margin-top: 1.5rem;">
    <a href="forgot-password" style="font-size: 0.95rem; color: #1e3a8a; text-decoration: none; font-weight: 600;">Forgot Password?</a>
</div>
