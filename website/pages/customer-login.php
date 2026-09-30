<?php
require_once __DIR__ . '/../config/session.php';
session_start();
require_once __DIR__ . '/../engine/shell.php';
// Detect the real active theme (subdomain / ?theme=) instead of always
// defaulting to Drop Cars — a customer creating an account right after an
// AirportTaxi.International booking should see that branding here too.
require_once __DIR__ . '/../includes/paths.php';
require_once __DIR__ . '/../engine/theme-engine.php';
require_once __DIR__ . '/../engine/theme-seo.php';
$themeEngineForLogin = new ThemeEngine();
$activeTheme = dropcars_merge_theme_seo($themeEngineForLogin->detectTheme());
$themesListForLogin = $themeEngineForLogin->getAllThemes();
$shell = new UIShell($activeTheme, $themesListForLogin);
$brandName = ($activeTheme['slug'] ?? '') === 'airport-taxi' ? 'Airport Taxi' : 'Drop Cars';

// Load config for Google Client ID
$configPath = __DIR__ . '/../api/config.php';
$siteConfig = is_file($configPath) ? (include $configPath) : [];
$googleClientId = trim((string)($siteConfig['googleClientId'] ?? ''));
$googleEnabled = $googleClientId !== '';

// Handle logout query parameter
$logoutNotice = '';
if (isset($_GET['logout'])) {
    unset(
        $_SESSION['customer_id'],
        $_SESSION['customer_phone'],
        $_SESSION['customer_email'],
        $_SESSION['customer_name'],
        $_SESSION['customer_token']
    );
    $logoutNotice = 'You have been logged out successfully.';
}

$isLoggedIn = !empty($_SESSION['customer_phone']) || !empty($_SESSION['customer_email']);
$loggedInIdentifier = $_SESSION['customer_name'] ?? $_SESSION['customer_phone'] ?? $_SESSION['customer_email'] ?? 'Member';

// If already logged in and explicit continue requested or no switch requested:
if ($isLoggedIn && isset($_GET['continue'])) {
    header('Location: /dashboard');
    exit;
}

$isPromo = isset($_GET['promo']) ? 1 : 0;
$redirect = $isPromo ? '/?promo_applied=1' : '/dashboard';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Customer Login &amp; Registration | <?php echo htmlspecialchars($brandName, ENT_QUOTES, 'UTF-8'); ?></title>
    <meta name="robots" content="noindex, nofollow">
<?php dropcars_render_favicons(); ?>
    <link rel="stylesheet" href="/assets/css/base.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/base.css'); ?>">
    <link rel="stylesheet" href="/assets/css/navbar.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/navbar.css'); ?>">
    <link rel="stylesheet" href="/assets/css/footer.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/footer.css'); ?>">
    <link rel="stylesheet" href="/assets/css/layout.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/layout.css'); ?>">
    <link rel="stylesheet" href="/assets/css/booking-form.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/booking-form.css'); ?>">
    <link rel="stylesheet" href="/assets/css/responsive.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/responsive.css'); ?>">
    <link rel="stylesheet" href="/assets/css/dark-mode.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/dark-mode.css'); ?>">
    <link rel="stylesheet" href="/assets/css/light-theme.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/light-theme.css'); ?>">
    <?php if (($activeTheme['slug'] ?? '') === 'airport-taxi'): ?>
    <link rel="stylesheet" href="/assets/css/theme-airporttaxi.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/theme-airporttaxi.css'); ?>">
    <?php endif; ?>
    <script src="/assets/js/dark-mode.js?v=<?php echo @filemtime(__DIR__ . '/../assets/js/dark-mode.js'); ?>"></script>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">

    <?php if ($googleEnabled): ?>
    <script src="https://accounts.google.com/gsi/client" async defer></script>
    <?php endif; ?>

    <style>
        body { font-family: 'Inter', sans-serif; background: linear-gradient(135deg, #f0f4f8 0%, #e8f0fe 100%); min-height: 100vh; }

        .login-section { padding: 60px 0 80px; min-height: 80vh; display: flex; align-items: center; }

        .login-card {
            max-width: 480px;
            margin: 0 auto;
            background: white;
            padding: 2.5rem;
            border-radius: 28px;
            box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08), 0 8px 24px rgba(15, 23, 42, 0.04);
            border: 1px solid rgba(226, 232, 240, 0.8);
        }
        .login-card h1 {
            font-size: 1.8rem; font-weight: 800; color: #0f172a;
            margin-bottom: 0.4rem; text-align: center; letter-spacing: -0.03em;
        }
        .login-card .subtitle {
            color: #64748b; margin-bottom: 1.75rem; text-align: center;
            font-size: 0.9rem; font-weight: 500; line-height: 1.5;
        }

        /* ── Google Button ── */
        .google-signin-btn {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            padding: 13px 20px;
            border: 1.5px solid #dadde1;
            border-radius: 14px;
            background: white;
            cursor: pointer;
            font-size: 0.95rem;
            font-weight: 700;
            color: #1e293b;
            transition: all 0.2s ease;
            box-shadow: 0 1px 4px rgba(0,0,0,0.06);
            margin-bottom: 1.25rem;
        }
        .google-signin-btn:hover { border-color: #4285f4; box-shadow: 0 4px 14px rgba(66,133,244,0.15); transform: translateY(-1px); }
        .google-signin-btn img { width: 22px; height: 22px; }

        /* ── Divider ── */
        .or-divider {
            display: flex; align-items: center; gap: 12px;
            margin-bottom: 1.5rem; color: #94a3b8; font-size: 0.8rem; font-weight: 600;
        }
        .or-divider::before, .or-divider::after { content: ''; flex: 1; height: 1px; background: #e2e8f0; }

        /* ── Tabs ── */
        .login-tabs {
            display: flex; background: #f1f5f9; padding: 4px;
            border-radius: 14px; margin-bottom: 1.75rem; border: 1px solid #e2e8f0;
        }
        .login-tab-btn {
            flex: 1; padding: 10px; border-radius: 10px; font-size: 0.82rem;
            font-weight: 700; border: none; cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            color: #64748b; background: transparent;
            display: flex; align-items: center; justify-content: center; gap: 6px;
        }
        .login-tab-btn.active { background: white; color: #0f172a; box-shadow: 0 4px 12px rgba(15,23,42,0.06); }

        .tab-panel { display: none; }
        .tab-panel.active { display: block; }

        .field { margin-bottom: 1.1rem; }
        .field span { display: block; margin-bottom: 0.45rem; font-weight: 700; color: #334155; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.4px; }
        .field input {
            width: 100%; padding: 12px 16px; border: 1.5px solid #cbd5e1;
            border-radius: 12px; font-size: 0.95rem; font-weight: 500;
            transition: all 0.2s ease; box-shadow: 0 1px 2px rgba(0,0,0,0.02);
        }
        .field input:focus { border-color: #1e4b7f; outline: none; box-shadow: 0 0 0 3px rgba(30,75,127,0.1); }

        .btn-primary {
            width: 100%; padding: 14px; border-radius: 12px; font-weight: 800;
            background: linear-gradient(135deg, #1e4b7f 0%, #153960 100%);
            color: white; border: none; cursor: pointer;
            transition: all 0.25s ease;
            box-shadow: 0 4px 14px rgba(30,75,127,0.2); font-size: 0.95rem;
            letter-spacing: 0.3px;
        }
        .btn-primary:hover { transform: translateY(-1.5px); box-shadow: 0 6px 20px rgba(30,75,127,0.28); }
        .btn-primary:active { transform: translateY(0); }

        .wa-verify {
            text-align: center; margin-top: 1.25rem; padding: 1rem;
            background: #f0fdf4; border-radius: 14px; border: 1px solid #dcfce7;
        }
        .wa-verify p { margin: 0 0 8px; font-size: 0.85rem; color: #166534; font-weight: 600; }
        .wa-verify a { color: #22c55e; font-weight: 800; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; font-size: 0.9rem; }

        .error-msg {
            color: #ef4444; margin-top: 1rem; text-align: center; font-size: 0.85rem;
            font-weight: 600; background: #fef2f2; padding: 10px 14px;
            border-radius: 10px; border: 1px solid #fee2e2; display: none;
        }

        .badge-promo {
            background: linear-gradient(135deg, #ff7a00 0%, #ff5f00 100%);
            color: white; font-size: 0.6rem; font-weight: 900; padding: 2px 6px;
            border-radius: 6px; text-transform: uppercase;
        }

        /* Google loading state */
        .google-signin-btn.loading { opacity: 0.7; pointer-events: none; }
        .google-signin-btn.loading::after { content: ''; width: 14px; height: 14px; border: 2px solid #dadde1; border-top-color: #4285f4; border-radius: 50%; animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Google success flash */
        .google-success-toast {
            position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
            background: #1e293b; color: white; padding: 12px 24px; border-radius: 16px;
            font-weight: 700; font-size: 0.9rem; display: none; align-items: center;
            gap: 10px; z-index: 9999; box-shadow: 0 8px 30px rgba(0,0,0,0.2);
            animation: slideUp 0.35s ease;
        }
        .google-success-toast.show { display: flex; }
        @keyframes slideUp { from { opacity: 0; transform: translateX(-50%) translateY(20px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

        /* ── Multi-step auth views ── */
        .auth-view { display: none; animation: authFade 0.3s ease; }
        .auth-view.active { display: block; }
        @keyframes authFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

        .auth-switch { text-align: center; margin: 1.25rem 0 0; font-size: 0.85rem; color: #64748b; font-weight: 500; }
        .auth-switch a { color: #1e4b7f; font-weight: 800; text-decoration: none; }
        .auth-switch a:hover { text-decoration: underline; }

        .auth-steps { display: flex; justify-content: center; gap: 8px; margin-bottom: 0.75rem; }
        .auth-steps .dot { width: 9px; height: 9px; border-radius: 50%; background: #e2e8f0; transition: all 0.3s ease; }
        .auth-steps .dot.active { background: #1e4b7f; transform: scale(1.25); }
        .auth-steps .dot.done { background: #22c55e; }
        .step-label { text-align: center; font-size: 0.82rem; color: #64748b; font-weight: 600; margin: 0 0 1.4rem; line-height: 1.4; }
        .step-label strong { color: #1e293b; }

        .auth-check { display: flex; align-items: flex-start; gap: 10px; margin: 0 0 1rem; font-size: 0.83rem; color: #475569; font-weight: 500; cursor: pointer; line-height: 1.45; }
        .auth-check input { width: 18px; height: 18px; margin-top: 1px; flex-shrink: 0; accent-color: #1e4b7f; cursor: pointer; }
        .auth-check--confirm { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 14px; font-weight: 600; }
        .auth-check strong { color: #1e293b; }

        /* ── AirportTaxi.International — elite black & champagne-gold override ── */
        body.theme-airporttaxi { background: radial-gradient(1200px 600px at 85% -10%, rgba(217,180,106,0.10), transparent 60%), linear-gradient(180deg,#07070a 0%,#0c0c10 60%,#111116 100%); }
        body.theme-airporttaxi .login-card { background:#fdfcf8; border:1px solid rgba(217,180,106,0.35); box-shadow:0 30px 70px -18px rgba(0,0,0,0.55); position:relative; overflow:hidden; }
        body.theme-airporttaxi .login-card::before { content:''; position:absolute; top:0; left:0; right:0; height:4px; background:linear-gradient(90deg,#a67c2e,#f0d9a3 50%,#a67c2e); }
        body.theme-airporttaxi .login-card h1 { color:#171612; font-family:'Playfair Display',serif; }
        body.theme-airporttaxi .field input:focus { border-color:#c9a24b; box-shadow:0 0 0 3px rgba(201,162,75,0.16); }
        body.theme-airporttaxi .login-tab-btn.active { background:#171612; color:#f0d9a3; }
        body.theme-airporttaxi .btn-primary { background:linear-gradient(135deg,#f0d9a3 0%,#d9b46a 45%,#a67c2e 100%); color:#171200; box-shadow:0 10px 24px -6px rgba(166,124,46,0.5); }
        body.theme-airporttaxi .btn-primary:hover { box-shadow:0 14px 30px -6px rgba(166,124,46,0.6); }
        body.theme-airporttaxi .auth-switch a { color:#a67c2e; }
        body.theme-airporttaxi .auth-steps .dot.active { background:#a67c2e; }
        body.theme-airporttaxi .step-label strong { color:#171612; }
        body.theme-airporttaxi .auth-check input { accent-color:#a67c2e; }
    </style>
<?php include __DIR__ . '/../includes/google-tag.php'; ?>
</head>
<body class="<?php echo ($activeTheme['slug'] ?? '') === 'airport-taxi' ? ('theme-airporttaxi ' . (function_exists('dropcars_is_native_airporttaxi_host') && dropcars_is_native_airporttaxi_host() ? 'ati-native' : 'ati-embedded')) : ''; ?>">
<?php echo $shell->renderHeader(); ?>

<div id="google-success-toast" class="google-success-toast">
    <span>✅</span> <span id="google-toast-msg">Signed in successfully!</span>
</div>

<main class="login-section">
    <div class="container">
        <div class="login-card">
            <h1>Welcome to <?php echo htmlspecialchars($brandName, ENT_QUOTES, 'UTF-8'); ?></h1>
            <p class="subtitle">Access your booking portal, live tracking &amp; unlock exclusive member offers.</p>

            <?php if (!empty($logoutNotice)): ?>
            <div style="background:#eff6ff; border:1.5px solid #93c5fd; border-radius:12px; padding:12px 16px; margin-bottom:1.25rem; color:#1e40af; font-size:0.88rem; font-weight:700; display:flex; align-items:center; gap:8px;">
                <span>ℹ️</span> <?php echo htmlspecialchars($logoutNotice); ?>
            </div>
            <?php endif; ?>

            <?php if ($isLoggedIn): ?>
            <div style="background:#f0fdf4; border:1.5px solid #86efac; border-radius:14px; padding:18px; margin-bottom:1.5rem; text-align:center;">
                <div style="font-size:1.5rem; margin-bottom:6px;">👤</div>
                <div style="font-weight:800; font-size:1.05rem; color:#14532d;">Currently Signed In</div>
                <div style="font-size:0.88rem; color:#166534; margin:4px 0 14px;">Logged in as <b><?php echo htmlspecialchars($loggedInIdentifier); ?></b></div>
                <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
                    <a href="/dashboard" class="btn-primary" style="text-decoration:none; padding:10px 20px; width:auto; display:inline-block;">Go to Dashboard</a>
                    <a href="/pages/logout.php" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; font-weight:700; border-radius:12px; padding:10px 18px; text-decoration:none; display:inline-flex; align-items:center; gap:6px;">🚪 Log Out</a>
                </div>
            </div>
            <?php endif; ?>

            <?php if ($googleEnabled): ?>
            <!-- ── Google One-Tap Sign-In ── -->
            <button type="button" class="google-signin-btn" id="google-btn" onclick="handleGoogleSignIn()">
                <img src="https://lh3.googleusercontent.com/COxitqgJr1sJnIDe8-jiKhxDx1FrYbtRHKJ9z_hELisAlapwE9LCoRNGMps4Czc0" alt="Google">
                Continue with Google
            </button>
            <div class="or-divider">or sign in with email / mobile</div>
            <?php endif; ?>

            <!-- ════════ LOGIN (email + password) ════════ -->
            <div id="view-login" class="auth-view active">
                <form id="login-form">
                    <div class="field">
                        <span>Email Address</span>
                        <input type="email" id="login-email" placeholder="you@example.com" autocomplete="username" required>
                    </div>
                    <div class="field">
                        <span>Password</span>
                        <input type="password" id="login-password" placeholder="Your password" autocomplete="current-password" required>
                    </div>
                    <button type="submit" class="btn-primary">Log In</button>
                    <div id="login-error" class="error-msg"></div>
                </form>
                <p class="auth-switch">New to <?php echo htmlspecialchars($brandName, ENT_QUOTES, 'UTF-8'); ?>? <a href="#" onclick="showAuthView('reg-email');return false;">Create an account</a></p>
            </div>

            <!-- ════════ REGISTER · Step 1: Email ════════ -->
            <div id="view-reg-email" class="auth-view">
                <div class="auth-steps"><span class="dot active"></span><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
                <p class="step-label">Step 1 of 4 · Verify your email</p>
                <form id="reg-email-form">
                    <div class="field">
                        <span>Email Address</span>
                        <input type="email" id="reg-email" placeholder="you@example.com" autocomplete="email" required>
                    </div>
                    <button type="submit" class="btn-primary">Send Verification Code</button>
                    <div id="reg-email-error" class="error-msg"></div>
                </form>
                <p class="auth-switch">Already have an account? <a href="#" onclick="showAuthView('login');return false;">Log in</a></p>
            </div>

            <!-- ════════ REGISTER · Step 2: OTP ════════ -->
            <div id="view-reg-otp" class="auth-view">
                <div class="auth-steps"><span class="dot done"></span><span class="dot active"></span><span class="dot"></span><span class="dot"></span></div>
                <p class="step-label">Step 2 of 4 · Enter the code sent to <strong id="reg-otp-email"></strong></p>
                <form id="reg-otp-form">
                    <div class="field">
                        <span>6-Digit Code</span>
                        <input type="text" id="reg-otp" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" placeholder="------" autocomplete="one-time-code" required style="text-align:center;letter-spacing:10px;font-size:1.4rem;font-weight:800;">
                    </div>
                    <button type="submit" class="btn-primary">Verify Code</button>
                    <div id="reg-otp-error" class="error-msg"></div>
                </form>
                <p class="auth-switch"><a href="#" onclick="resendRegOtp();return false;">Resend code</a> &nbsp;·&nbsp; <a href="#" onclick="showAuthView('reg-email');return false;">Change email</a></p>
            </div>

            <!-- ════════ REGISTER · Step 3: Password ════════ -->
            <div id="view-reg-pwd" class="auth-view">
                <div class="auth-steps"><span class="dot done"></span><span class="dot done"></span><span class="dot active"></span><span class="dot"></span></div>
                <p class="step-label">Step 3 of 4 · Create a password</p>
                <form id="reg-pwd-form">
                    <div class="field">
                        <span>Create Password</span>
                        <input type="password" id="reg-pwd" minlength="6" placeholder="At least 6 characters" autocomplete="new-password" required>
                    </div>
                    <div class="field">
                        <span>Confirm Password</span>
                        <input type="password" id="reg-pwd2" minlength="6" placeholder="Re-enter password" autocomplete="new-password" required>
                    </div>
                    <button type="submit" class="btn-primary">Continue</button>
                    <div id="reg-pwd-error" class="error-msg"></div>
                </form>
            </div>

            <!-- ════════ REGISTER · Step 4: Profile ════════ -->
            <div id="view-reg-profile" class="auth-view">
                <div class="auth-steps"><span class="dot done"></span><span class="dot done"></span><span class="dot done"></span><span class="dot active"></span></div>
                <p class="step-label">Step 4 of 4 · Your details</p>
                <form id="reg-profile-form">
                    <div class="field">
                        <span>Full Name</span>
                        <input type="text" id="reg-name" placeholder="John Doe" autocomplete="name" required>
                    </div>
                    <div class="field">
                        <span>Mobile Number</span>
                        <div class="phone-input-wrapper phone-input-wrapper--country">
                            <div class="country-code-field" data-cc-default="+91">
                                <input type="hidden" id="country-code-reg" value="+91" />
                                <button type="button" class="country-code-trigger" id="cc-reg-trigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="cc-reg-popover" title="Country code">+91</button>
                                <div id="cc-reg-popover" class="country-code-popover is-hidden" role="dialog" aria-label="Choose or type country code">
                                    <button type="button" class="country-code-option" data-code="+91">+91</button>
                                    <input type="text" class="country-code-manual-inline" id="cc-reg-manual" inputmode="tel" autocomplete="off" maxlength="12" placeholder="" />
                                </div>
                            </div>
                            <input type="tel" id="reg-phone" placeholder="98765 43210" class="phone-national-input" maxlength="10" minlength="10" pattern="[0-9]{10}" inputmode="numeric" required>
                        </div>
                    </div>
                    <div class="field">
                        <span>Referral / Promo Code (Optional)</span>
                        <input type="text" id="reg-referral" placeholder="e.g. DCFT100" autocomplete="off" style="text-transform: uppercase;" value="<?php echo htmlspecialchars($_SESSION['pending_referral'] ?? ''); ?>">
                    </div>
                    <label class="auth-check">
                        <input type="checkbox" id="reg-wa" checked>
                        <span>Use this number for <strong>WhatsApp</strong> updates &amp; trip confirmations</span>
                    </label>
                    <label class="auth-check auth-check--confirm">
                        <input type="checkbox" id="reg-confirm" required>
                        <span>I confirm all the details above are correct</span>
                    </label>
                    <button type="submit" class="btn-primary">Create My Account</button>
                    <div id="reg-profile-error" class="error-msg"></div>
                </form>
            </div>
        </div>
    </div>
</main>

<?php echo $shell->renderFooter(); ?>
<?php echo $shell->renderScripts(); ?>

<script>
const isPromoRedirect = <?php echo $isPromo; ?>;
const redirectTarget = <?php echo json_encode($redirect); ?>;
const googleClientId = <?php echo json_encode($googleClientId); ?>;

// ── Multi-step view switcher ──
function showAuthView(name) {
    document.querySelectorAll('.auth-view').forEach(v => v.classList.remove('active'));
    var el = document.getElementById('view-' + name);
    if (el) el.classList.add('active');
}
// Password is created on step 3 but held client-side until the final submit.
var regPasswordPending = '';

// ── Country Code Popover ──
function setupCountryCodes(triggerId, popoverId, hiddenInputId, manualInputId) {
    const trigger = document.getElementById(triggerId);
    const popover = document.getElementById(popoverId);
    const hidden  = document.getElementById(hiddenInputId);
    const manual  = document.getElementById(manualInputId);
    if (!trigger || !popover) return;

    trigger.addEventListener('click', e => { e.stopPropagation(); popover.classList.toggle('is-hidden'); });

    popover.querySelectorAll('.country-code-option').forEach(opt => {
        opt.addEventListener('click', () => {
            const val = opt.getAttribute('data-code');
            trigger.textContent = val;
            hidden.value = val;
            popover.classList.add('is-hidden');
        });
    });

    manual.addEventListener('input', () => {
        let val = manual.value.trim();
        if (val !== '' && !val.startsWith('+')) val = '+' + val;
        if (val !== '') { trigger.textContent = val; hidden.value = val; }
    });

    document.addEventListener('click', e => {
        if (!popover.contains(e.target) && !trigger.contains(e.target)) {
            popover.classList.add('is-hidden');
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    setupCountryCodes('cc-reg-trigger', 'cc-reg-popover', 'country-code-reg', 'cc-reg-manual');
});

// ── Toast Helper ──
function showToast(msg, duration = 2800) {
    const toast = document.getElementById('google-success-toast');
    document.getElementById('google-toast-msg').textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
}

// ── Google Sign-In ──
function handleGoogleSignIn() {
    if (!googleClientId) return;
    const btn = document.getElementById('google-btn');
    btn.classList.add('loading');
    btn.textContent = '';

    google.accounts.id.initialize({
        client_id: googleClientId,
        callback: function(response) {
            fetch('/api/customer_auth.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'method=google&credential=' + encodeURIComponent(response.credential)
            })
            .then(r => r.json())
            .then(data => {
                if (data.status === 'verified') {
                    showToast('✅ Signed in as ' + (data.name || 'Customer') + '!');
                    setTimeout(() => window.location.href = redirectTarget, 1200);
                } else {
                    btn.classList.remove('loading');
                    btn.innerHTML = '<img src="https://lh3.googleusercontent.com/COxitqgJr1sJnIDe8-jiKhxDx1FrYbtRHKJ9z_hELisAlapwE9LCoRNGMps4Czc0" alt="Google" style="width:22px;height:22px;"> Continue with Google';
                    alert(data.message || 'Google sign-in failed. Please try email or mobile.');
                }
            })
            .catch(() => {
                btn.classList.remove('loading');
                btn.innerHTML = '<img src="https://lh3.googleusercontent.com/COxitqgJr1sJnIDe8-jiKhxDx1FrYbtRHKJ9z_hELisAlapwE9LCoRNGMps4Czc0" alt="Google" style="width:22px;height:22px;"> Continue with Google';
                alert('Connection error. Please try again.');
            });
        },
        auto_select: false,
        cancel_on_tap_outside: true,
    });

    google.accounts.id.prompt();
}

// ── LOGIN: email + password ──
document.getElementById('login-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    const btn = this.querySelector('button[type=submit]');
    errorEl.style.display = 'none';
    btn.disabled = true; btn.textContent = 'Logging in...';
    fetch('/api/customer_auth.php', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'method=login&email=' + encodeURIComponent(email) + '&password=' + encodeURIComponent(password)
    })
    .then(r => r.json())
    .then(data => {
        if (data.status === 'verified') {
            showToast('✅ Welcome back, ' + (data.name || 'Customer') + '!');
            setTimeout(() => window.location.href = redirectTarget, 1000);
        } else {
            errorEl.textContent = data.message || 'Login failed.';
            errorEl.style.display = 'block';
            btn.disabled = false; btn.textContent = 'Log In';
        }
    })
    .catch(() => { errorEl.textContent = 'Connection error. Please try again.'; errorEl.style.display = 'block'; btn.disabled = false; btn.textContent = 'Log In'; });
});

// ── REGISTER Step 1: send email OTP ──
function sendRegOtp(emailVal, errorEl, btn, btnLabel) {
    errorEl.style.display = 'none';
    btn.disabled = true; btn.textContent = 'Sending...';
    return fetch('/api/customer_auth.php', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'method=register_otp&email=' + encodeURIComponent(emailVal)
    })
    .then(r => r.json())
    .then(data => {
        btn.disabled = false; btn.textContent = btnLabel;
        if (data.status === 'sent') {
            document.getElementById('reg-otp-email').textContent = emailVal;
            showAuthView('reg-otp');
            showToast('📧 Code sent to your email');
        } else if (data.status === 'exists') {
            errorEl.innerHTML = data.message + ' <a href="#" onclick="showAuthView(\'login\');return false;" style="color:#1e4b7f;font-weight:800;">Log in</a>';
            errorEl.style.display = 'block';
        } else {
            errorEl.textContent = data.message || 'Could not send code.';
            errorEl.style.display = 'block';
        }
    })
    .catch(() => { btn.disabled = false; btn.textContent = btnLabel; errorEl.textContent = 'Connection error.'; errorEl.style.display = 'block'; });
}
document.getElementById('reg-email-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const emailVal = document.getElementById('reg-email').value.trim();
    sendRegOtp(emailVal, document.getElementById('reg-email-error'), this.querySelector('button[type=submit]'), 'Send Verification Code');
});
function resendRegOtp() {
    const emailVal = document.getElementById('reg-email').value.trim();
    sendRegOtp(emailVal, document.getElementById('reg-otp-error'), document.querySelector('#reg-otp-form button[type=submit]'), 'Verify Code');
}

// ── REGISTER Step 2: verify OTP ──
document.getElementById('reg-otp-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const otp = document.getElementById('reg-otp').value.trim();
    const errorEl = document.getElementById('reg-otp-error');
    const btn = this.querySelector('button[type=submit]');
    errorEl.style.display = 'none';
    btn.disabled = true; btn.textContent = 'Verifying...';
    fetch('/api/customer_auth.php', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'method=register_verify&otp=' + encodeURIComponent(otp)
    })
    .then(r => r.json())
    .then(data => {
        btn.disabled = false; btn.textContent = 'Verify Code';
        if (data.status === 'verified') { showAuthView('reg-pwd'); }
        else { errorEl.textContent = data.message || 'Verification failed.'; errorEl.style.display = 'block'; }
    })
    .catch(() => { btn.disabled = false; btn.textContent = 'Verify Code'; errorEl.textContent = 'Connection error.'; errorEl.style.display = 'block'; });
});

// ── REGISTER Step 3: create password (held client-side until final step) ──
document.getElementById('reg-pwd-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const p1 = document.getElementById('reg-pwd').value;
    const p2 = document.getElementById('reg-pwd2').value;
    const errorEl = document.getElementById('reg-pwd-error');
    errorEl.style.display = 'none';
    if (p1.length < 6) { errorEl.textContent = 'Password must be at least 6 characters.'; errorEl.style.display = 'block'; return; }
    if (p1 !== p2) { errorEl.textContent = 'Passwords do not match.'; errorEl.style.display = 'block'; return; }
    regPasswordPending = p1;
    showAuthView('reg-profile');
});

// ── REGISTER Step 4: profile → create account ──
document.getElementById('reg-profile-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const cc = document.getElementById('country-code-reg').value || '+91';
    const wa = document.getElementById('reg-wa').checked ? '1' : '0';
    const confirmed = document.getElementById('reg-confirm').checked;
    const referral = document.getElementById('reg-referral').value.trim();
    const errorEl = document.getElementById('reg-profile-error');
    const btn = this.querySelector('button[type=submit]');
    errorEl.style.display = 'none';
    if (!confirmed) { errorEl.textContent = 'Please tick the box to confirm your details are correct.'; errorEl.style.display = 'block'; return; }
    if (!regPasswordPending) { errorEl.textContent = 'Your session expired. Please restart registration.'; errorEl.style.display = 'block'; showAuthView('reg-email'); return; }
    btn.disabled = true; btn.textContent = 'Creating account...';
    fetch('/api/customer_auth.php', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'method=register_complete&password=' + encodeURIComponent(regPasswordPending) +
              '&name=' + encodeURIComponent(name) + '&phone=' + encodeURIComponent(phone) +
              '&countryCode=' + encodeURIComponent(cc) + '&whatsapp=' + wa +
              '&referral_code=' + encodeURIComponent(referral)
    })
    .then(r => r.json())
    .then(data => {
        if (data.status === 'verified') {
            regPasswordPending = '';
            showToast('🎉 Account created! Welcome, ' + (data.name || 'Customer') + '!');
            setTimeout(() => window.location.href = redirectTarget, 1200);
        } else {
            errorEl.textContent = data.message || 'Could not create account.';
            errorEl.style.display = 'block';
            btn.disabled = false; btn.textContent = 'Create My Account';
        }
    })
    .catch(() => { errorEl.textContent = 'Connection error.'; errorEl.style.display = 'block'; btn.disabled = false; btn.textContent = 'Create My Account'; });
});
</script>
</body>
</html>
