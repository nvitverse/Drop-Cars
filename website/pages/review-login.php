<?php
require_once __DIR__ . '/../engine/shell.php';
$shell = new UIShell();

// Get return URL or default to homepage
$returnUrl = $_GET['return'] ?? '/';
if (empty($returnUrl)) $returnUrl = '/';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify Identity to Review | Drop Cars</title>
<?php dropcars_render_favicons(); ?>
    <link rel="stylesheet" href="/assets/css/base.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/base.css'); ?>">
    <link rel="stylesheet" href="/assets/css/navbar.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/navbar.css'); ?>">
    <link rel="stylesheet" href="/assets/css/footer.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/footer.css'); ?>">
    <link rel="stylesheet" href="/assets/css/layout.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/layout.css'); ?>">
    <link rel="stylesheet" href="/assets/css/booking-form.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/booking-form.css'); ?>">
    <link rel="stylesheet" href="/assets/css/responsive.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/responsive.css'); ?>">
    <link rel="stylesheet" href="/assets/css/dark-mode.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/dark-mode.css'); ?>">
    <link rel="stylesheet" href="/assets/css/light-theme.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/light-theme.css'); ?>">
    <script src="/assets/js/dark-mode.js?v=<?php echo @filemtime(__DIR__ . '/../assets/js/dark-mode.js'); ?>"></script>
    <style>
        .login-section { padding: 80px 0; min-height: 70vh; display: flex; align-items: center; background: #f8fafc; }
        .login-card { max-width: 450px; margin: 0 auto; background: white; padding: 3rem; border-radius: 24px; box-shadow: 0 15px 40px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0; }
        .login-card h1 { margin-bottom: 1rem; color: #1e3a8a; text-align: center; font-weight: 800; font-size: 1.8rem; }
        .login-card p { color: #64748b; margin-bottom: 2rem; text-align: center; font-size: 1rem; line-height: 1.6; }
        .field { margin-bottom: 1.5rem; }
        .field span { display: block; margin-bottom: 0.8rem; font-weight: 700; color: #1e3a8a; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px; }
        .btn-primary { width: 100%; padding: 16px; border-radius: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; background: #1e3a8a; color: white; border: none; cursor: pointer; transition: all 0.3s ease; }
        .btn-primary:hover { transform: translateY(-2px); background: #1e40af; box-shadow: 0 8px 20px rgba(30, 58, 138, 0.2); }
        .wa-verify { text-align: center; margin-top: 2rem; padding-top: 1.5rem; border-top: 1px dashed #cbd5e1; }
        .wa-verify p { margin-bottom: 1rem; font-weight: 600; color: #475569; }
        .wa-verify a { 
            color: #ffffff; 
            background: #25D366; 
            padding: 12px 24px; 
            border-radius: 12px; 
            font-weight: 800; 
            text-decoration: none; 
            display: inline-flex; 
            align-items: center; 
            gap: 10px;
            transition: all 0.3s ease;
        }
        .wa-verify a:hover {
            background: #128C7E;
            transform: translateY(-2px);
            box-shadow: 0 8px 15px rgba(37, 211, 102, 0.3);
        }
        .error-msg { 
            color: #ef4444; 
            background: #fef2f2; 
            border: 1px solid #fee2e2; 
            padding: 12px; 
            border-radius: 12px; 
            margin-bottom: 1.5rem; 
            text-align: center; 
            font-size: 0.9rem; 
            font-weight: 600; 
        }
        .rating-indicator {
            display: flex;
            justify-content: center;
            gap: 5px;
            margin-bottom: 1rem;
            font-size: 1.5rem;
            color: #f59e0b;
        }
    </style>
<?php include __DIR__ . '/../includes/google-tag.php'; ?>
</head>
<body>
<?php echo $shell->renderHeader(); ?>

<main class="login-section">
    <div class="container">
        <div class="login-card">
            <div class="rating-indicator">★★★★★</div>
            <h1>Verified Review</h1>
            <p>To keep our reviews genuine, please verify your mobile number. Your review will be posted automatically after verification.</p>
            
            <div id="login-error" class="error-msg" style="display:none;"></div>

            <form id="review-login-form">
                <input type="hidden" id="return-url" value="<?php echo htmlspecialchars($returnUrl); ?>">
                <div class="field">
                    <span>Mobile Number</span>
                    <div class="phone-input-wrapper phone-input-wrapper--country" style="width: 100%;">
                        <div class="country-code-field" data-cc-default="+91">
                            <input type="hidden" name="countryCode" id="country-code-hidden" value="+91" />
                            <button type="button" class="country-code-trigger" id="country-code-trigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="country-code-popover" title="Country code">+91</button>
                            <div id="country-code-popover" class="country-code-popover is-hidden" role="dialog" aria-label="Choose or type country code">
                                <button type="button" class="country-code-option" data-code="+91">+91</button>
                                <input type="text" class="country-code-manual-inline" id="country-code-manual-input" inputmode="tel" autocomplete="off" maxlength="12" placeholder="" aria-label="Type country code e.g. +65" />
                            </div>
                        </div>
                        <input type="tel" name="phone" id="customer-phone" placeholder="98765 43210" class="phone-national-input" required style="flex: 1;">
                    </div>
                </div>
                <button type="submit" class="btn-primary" id="continue-btn">Verify & Post Review</button>
            </form>

            <div id="wa-verify-group" class="wa-verify" style="display:none;">
                <p>Wait, we need to verify your number via WhatsApp.</p>
                <a href="#" id="wa-verify-link">
                    <svg style="width: 20px; height: 20px;" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72 1.025 3.655 1.564 5.62 1.564h.005c6.551 0 11.889-5.336 11.892-11.894a11.816 11.816 0 00-3.486-8.412z"/></svg>
                    Continue to WhatsApp
                </a>
            </div>
        </div>
    </div>
</main>

<?php echo $shell->renderFooter(); ?>

<script defer src="/assets/js/main.js?v=<?php echo @filemtime(__DIR__ . '/../assets/js/main.js'); ?>"></script>
<script defer src="/assets/js/phone-country.js"></script>
<script>
document.getElementById('review-login-form').addEventListener('submit', function(e) {
    e.preventDefault();
    var phone = document.getElementById('customer-phone').value;
    var errorEl = document.getElementById('login-error');
    var waGroup = document.getElementById('wa-verify-group');
    var waLink = document.getElementById('wa-verify-link');
    var returnUrl = document.getElementById('return-url').value;
    var continueBtn = document.getElementById('continue-btn');

    errorEl.style.display = 'none';
    waGroup.style.display = 'none';
    continueBtn.disabled = true;
    continueBtn.textContent = 'Verifying...';

    var cc = document.getElementById('country-code-hidden').value || '+91';
    var fullPhone = cc + ' ' + phone.trim();

    fetch('/api/customer_auth.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'phone=' + encodeURIComponent(fullPhone)
    })
    .then(r => r.json())
    .then(data => {
        if (data.status === 'verified') {
            // Now attempt to post the pending review
            fetch('/api/reviews.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ complete_pending: true })
            })
            .then(r => r.json())
            .then(res => {
                if (res.success) {
                    window.location.href = returnUrl + (returnUrl.indexOf('?') > -1 ? '&' : '?') + 'complete_review=1';
                } else {
                    errorEl.textContent = res.error || 'Identity verified, but failed to post review.';
                    errorEl.style.display = 'block';
                    continueBtn.disabled = false;
                    continueBtn.textContent = 'Verify & Post Review';
                }
            });
        } else if (data.status === 'verify_needed') {
            waGroup.style.display = 'block';
            waLink.href = data.wa_url;
            continueBtn.disabled = false;
            continueBtn.textContent = 'Verify & Post Review';
        } else {
            errorEl.textContent = data.message || 'An error occurred.';
            errorEl.style.display = 'block';
            continueBtn.disabled = false;
            continueBtn.textContent = 'Verify & Post Review';
        }
    })
    .catch(() => {
        errorEl.textContent = 'Connection error.';
        errorEl.style.display = 'block';
        continueBtn.disabled = false;
        continueBtn.textContent = 'Verify & Post Review';
    });
});
</script>
</body>
</html>
