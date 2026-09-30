<?php
/**
 * Admin change password page.
 */
$error = '';
$success = '';
$mustChange = function_exists('dropcars_admin_password_change_required') && dropcars_admin_password_change_required();
$adminId = (int) ($_SESSION['admin_id'] ?? 0);
$flash = $_SESSION['admin_change_password_flash'] ?? null;
if (is_array($flash)) {
    $error = (string) ($flash['error'] ?? '');
    $success = (string) ($flash['success'] ?? '');
}
unset($_SESSION['admin_change_password_flash']);

if ($adminId <= 0) {
    header('Location: ' . admin_url('login'));
    exit;
}

if (isset($pdo) && function_exists('dropcars_admin_ensure_password_policy_columns')) {
    dropcars_admin_ensure_password_policy_columns($pdo);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!isset($_POST['change_password_submit'])) {
        $_SESSION['admin_change_password_flash'] = ['error' => 'Invalid password update request. Please try again.', 'success' => ''];
        header('Location: ' . admin_url('change-password'));
        exit;
    }
    $currentPassword = (string) ($_POST['current_password'] ?? '');
    $newPassword = (string) ($_POST['new_password'] ?? '');
    $confirmPassword = (string) ($_POST['confirm_password'] ?? '');

    if (!$mustChange && $currentPassword === '') {
        $error = 'Current password is required.';
    } elseif (strlen($newPassword) < 8) {
        $error = 'New password must be at least 8 characters.';
    } elseif ($newPassword !== $confirmPassword) {
        $error = 'New password and confirm password do not match.';
    } else {
        try {
            $stmt = $pdo->prepare('SELECT `password` FROM `admins` WHERE `id` = ? LIMIT 1');
            $stmt->execute([$adminId]);
            $row = $stmt->fetch();
        } catch (Throwable $e) {
            $row = false;
            $error = 'Could not verify your current password. Please try again.';
        }
        if (!$row) {
            $error = $error !== '' ? $error : 'Admin account not found.';
        } elseif (!$mustChange && !verifyPassword($currentPassword, (string) $row['password'])) {
            $error = 'Current password is incorrect.';
        } elseif (verifyPassword($newPassword, (string) $row['password'])) {
            $error = 'New password must be different from current password.';
        } else {
            $hash = password_hash($newPassword, PASSWORD_DEFAULT);
            $updated = false;
            try {
                $stmtUpdate = $pdo->prepare('UPDATE `admins` SET `password` = ?, `password_must_change` = 0, `temporary_password_set_at` = NULL WHERE `id` = ?');
                $updated = (bool) $stmtUpdate->execute([$hash, $adminId]);
            } catch (Throwable $e) {
                $updated = false;
            }

            if (!$updated) {
                try {
                    // Fallback for older schemas where policy columns do not exist yet.
                    $stmtUpdateFallback = $pdo->prepare('UPDATE `admins` SET `password` = ? WHERE `id` = ?');
                    $updated = (bool) $stmtUpdateFallback->execute([$hash, $adminId]);
                } catch (Throwable $e) {
                    $updated = false;
                }
            }

            if ($updated) {
                dropcars_admin_require_password_change(false);
                $success = 'Password updated successfully.';
            } else {
                $error = 'Could not update password right now. Please try again.';
            }
        }
    }
    $_SESSION['admin_change_password_flash'] = ['error' => $error, 'success' => $success];
    header('Location: ' . admin_url($success !== '' && $mustChange ? 'dashboard' : 'change-password'));
    exit;
}
?>

<style>
/* Modern Admin Password Custom CSS */
.cp-wrapper {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 2rem 1rem;
    font-family: 'Inter', system-ui, sans-serif;
    min-height: calc(100vh - 100px);
}
.cp-card {
    background: #ffffff;
    border-radius: 24px;
    box-shadow: 0 20px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.01);
    padding: 3rem;
    width: 100%;
    max-width: 480px;
    border: 1px solid #f1f5f9;
}
.cp-header {
    text-align: center;
    margin-bottom: 2.5rem;
}
.cp-header .icon-wrap {
    width: 64px;
    height: 64px;
    background: #eff6ff;
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 1.25rem auto;
    color: #3b82f6;
    font-size: 1.75rem;
}
.cp-header.mandatory .icon-wrap {
    background: #fef2f2;
    color: #ef4444;
}
.cp-header h1 {
    font-size: 1.75rem;
    font-weight: 850;
    color: #0f172a;
    margin: 0 0 0.5rem 0;
    letter-spacing: -0.02em;
}
.cp-header p {
    color: #64748b;
    font-size: 0.95rem;
    margin: 0;
    line-height: 1.5;
}
.cp-group {
    margin-bottom: 1.75rem;
}
.cp-label {
    display: block;
    font-size: 0.8rem;
    font-weight: 700;
    color: #475569;
    margin-bottom: 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}
.cp-input-wrap {
    position: relative;
}
.cp-input-wrap i.prefix {
    position: absolute;
    left: 1.25rem;
    top: 50%;
    transform: translateY(-50%);
    color: #94a3b8;
    font-size: 1.1rem;
}
.cp-input {
    width: 100%;
    padding: 1rem 1.25rem 1rem 3.25rem;
    border: 2px solid #e2e8f0;
    border-radius: 14px;
    font-size: 1rem;
    font-weight: 600;
    color: #0f172a;
    transition: all 0.2s;
    background: #f8fafc;
}
.cp-input:focus {
    background: #fff;
    border-color: #3b82f6;
    outline: none;
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
}
.cp-toggle {
    position: absolute;
    right: 1.25rem;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    padding: 0;
    font-size: 1rem;
    transition: color 0.2s;
}
.cp-toggle:hover { color: #3b82f6; }

.cp-alert {
    padding: 1.25rem;
    border-radius: 14px;
    font-size: 0.95rem;
    font-weight: 600;
    margin-bottom: 2rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
}
.cp-alert-error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
.cp-alert-success { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }

.cp-btn {
    width: 100%;
    padding: 1.1rem;
    background: #2563eb;
    color: #fff;
    border: none;
    border-radius: 14px;
    font-size: 1.1rem;
    font-weight: 800;
    cursor: pointer;
    transition: all 0.2s;
    margin-top: 1.5rem;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
    box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);
}
.cp-btn:hover {
    background: #1d4ed8;
    transform: translateY(-2px);
    box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.3);
}
.cp-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none; }



/* Match visual indicator */
.match-hint { font-size: 0.8rem; font-weight: 700; display: block; margin-top: 0.5rem; text-align: right; }
.match-no { color: #ef4444; }
.match-yes { color: #10b981; }

@media(max-width: 600px) {
    .cp-card { padding: 2rem 1.5rem; border-radius: 20px; }
    .cp-header h1 { font-size: 1.5rem; }
}
</style>

<div class="cp-wrapper">
    <div class="cp-card">
        <div class="cp-header <?php echo $mustChange ? 'mandatory' : ''; ?>">
            <div class="icon-wrap">
                <i class="fa-solid <?php echo $mustChange ? 'fa-triangle-exclamation' : 'fa-shield-halved'; ?>"></i>
            </div>
            <h1>Secure Your Account</h1>
            <p><?php echo $mustChange ? 'Temporary password detected. Please set a new secure password to continue.' : 'Update your admin portal access password.'; ?></p>
        </div>

        <?php if ($error): ?>
            <div class="cp-alert cp-alert-error">
                <i class="fa-solid fa-circle-exclamation"></i>
                <div><?php echo htmlspecialchars($error, ENT_QUOTES, 'UTF-8'); ?></div>
            </div>
        <?php endif; ?>

        <?php if ($success): ?>
            <div class="cp-alert cp-alert-success">
                <i class="fa-solid fa-circle-check"></i>
                <div><?php echo htmlspecialchars($success, ENT_QUOTES, 'UTF-8'); ?></div>
            </div>
        <?php endif; ?>

        <form method="POST" action="<?php echo htmlspecialchars(admin_url('change-password'), ENT_QUOTES, 'UTF-8'); ?>" id="cp-form">
            <input type="hidden" name="change_password_submit" value="1">
            
            <?php if (!$mustChange): ?>
                <div class="cp-group">
                    <label class="cp-label" for="current_password">Current Password</label>
                    <div class="cp-input-wrap">
                        <i class="fa-solid fa-lock prefix"></i>
                        <input class="cp-input" type="password" id="current_password" name="current_password" placeholder="Enter current password" autocomplete="current-password" required>
                        <button type="button" class="cp-toggle" onclick="togglePassword('current_password', this)" tabindex="-1"><i class="fa-regular fa-eye"></i></button>
                    </div>
                </div>
            <?php endif; ?>

            <div class="cp-group">
                <label class="cp-label" for="new_password">New Password</label>
                <div class="cp-input-wrap">
                    <i class="fa-solid fa-key prefix"></i>
                    <input class="cp-input" type="password" id="new_password" name="new_password" placeholder="Create new password" autocomplete="new-password" required>
                    <button type="button" class="cp-toggle" onclick="togglePassword('new_password', this)" tabindex="-1"><i class="fa-regular fa-eye"></i></button>
                </div>
            </div>

            <div class="cp-group" style="margin-bottom: 0;">
                <label class="cp-label" for="confirm_password">Confirm Password</label>
                <div class="cp-input-wrap">
                    <i class="fa-solid fa-check-double prefix"></i>
                    <input class="cp-input" type="password" id="confirm_password" name="confirm_password" placeholder="Repeat new password" autocomplete="new-password" required>
                    <button type="button" class="cp-toggle" onclick="togglePassword('confirm_password', this)" tabindex="-1"><i class="fa-regular fa-eye"></i></button>
                </div>
                <div id="match-indicator" class="match-hint"></div>
            </div>



            <button type="submit" class="cp-btn" id="cp-submit-btn">
                <i class="fa-solid fa-lock"></i> Update Password
            </button>
        </form>
    </div>
</div>

<script>
function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const np = document.getElementById('new_password');
    const cp = document.getElementById('confirm_password');
    const mi = document.getElementById('match-indicator');
    
    function checkReqs() {
        const val = np.value;
        const conf = cp.value;
        
        if (conf.length > 0) {
            if (val === conf) {
                mi.textContent = 'Passwords match';
                mi.className = 'match-hint match-yes';
            } else {
                mi.textContent = 'Passwords do not match';
                mi.className = 'match-hint match-no';
            }
        } else {
            mi.textContent = '';
        }
    }

    np.addEventListener('input', checkReqs);
    cp.addEventListener('input', checkReqs);

    document.getElementById('cp-form').addEventListener('submit', function(e) {
        if (np.value !== cp.value) {
            e.preventDefault();
            alert('New passwords do not match. Please fix and try again.');
        } else if (np.value.length < 8) {
            e.preventDefault();
            alert('Password must be at least 8 characters long.');
        }
    });

    // Run once on load to catch autofill
    checkReqs();
});
</script>
