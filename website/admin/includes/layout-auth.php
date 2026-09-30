<?php
/**
 * Admin Auth Layout - UI Shell integration.
 * Used for login, forgot-password, reset-password.
 * BEFORE login: Shows the public shell.
 */
defined('DROP_CARS_SAFE') || define('DROP_CARS_SAFE', true);

// Branding / UI Shell Setup
$themeEngine = new ThemeEngine();
$activeTheme = $themeEngine->detectTheme();
$allThemes = $themeEngine->getAllThemes();
$shell = new UIShell($activeTheme, $allThemes);

// Metadata
$pageTitle = 'Admin Access | Drop Cars';
$pageDesc  = 'Authorized personnel access to the Drop Cars management platform.';
$path      = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$canonical = "https://www.dropcars.in" . ($path !== '/' ? rtrim($path, '/') : '');
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="<?php echo htmlspecialchars($pageDesc); ?>">
    <link rel="canonical" href="<?php echo $canonical; ?>">
    <title><?php echo htmlspecialchars($pageTitle); ?></title>
<?php if (function_exists('dropcars_render_favicons')) { dropcars_render_favicons($activeTheme['slug'] ?? null); } ?>
    
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    
    <link rel="stylesheet" href="/assets/css/base.css">
    <link rel="stylesheet" href="/assets/css/layout.css">
    <link rel="stylesheet" href="/assets/css/navbar.css">
    <link rel="stylesheet" href="/assets/css/footer.css">
    <link rel="stylesheet" href="/assets/css/responsive.css">
    <link rel="stylesheet" href="/assets/css/admin-auth.css">
    
    <style>
        /* Customer-only floating widgets must NOT appear on admin auth pages.
           The shell footer adds .floating-contact unconditionally when
           enableWhatsApp is on — hide it here for the auth layout. */
        .floating-contact,
        .wa-widget-container { display: none !important; }

        /* Contextual overrides for legacy admin auth pages */
        .auth-card {
            width: 100%;
            max-width: 420px;
            margin: 0 auto;
        }
        .auth-title {
            text-align: center;
            font-size: 1.75rem;
            font-weight: 800;
            color: var(--blue-dark);
            margin-bottom: 0.5rem;
            letter-spacing: -0.025em;
        }
        .form-group {
            margin-bottom: 1.25rem;
        }
        .form-label {
            display: block;
            font-size: 0.875rem;
            font-weight: 600;
            color: var(--blue-dark);
            margin-bottom: 0.5rem;
        }
        .form-control {
            width: 100%;
            padding: 0.75rem 1rem;
            background: var(--gray-50);
            border: 1px solid var(--gray-200);
            border-radius: 12px;
            font-size: 1rem;
            font-family: inherit;
            transition: all 0.2s ease;
            color: var(--blue-dark);
        }
        .form-control:focus {
            outline: none;
            border-color: var(--blue);
            background: var(--white);
            box-shadow: 0 0 0 4px rgba(15, 28, 46, 0.1);
        }
        .btn-primary {
            background: var(--blue-dark);
            color: var(--white);
            border: none;
            padding: 0.875rem;
            border-radius: 12px;
            font-size: 1rem;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            width: 100%;
        }
        .btn-primary:hover {
            background: var(--blue);
            transform: translateY(-1px);
        }
        .alert-danger {
            background: #fef2f2;
            border: 1px solid #fee2e2;
            color: #dc2626;
            padding: 0.75rem 1rem;
            border-radius: 10px;
            font-size: 0.875rem;
            font-weight: 500;
            margin-bottom: 1.5rem;
        }
        .alert-success {
            background: #ecfdf5;
            border: 1px solid #a7f3d0;
            color: #047857;
            padding: 0.75rem 1rem;
            border-radius: 10px;
            font-size: 0.875rem;
            font-weight: 500;
            margin-bottom: 1.5rem;
        }
        .alert-success a {
            color: #047857;
            font-weight: 700;
        }
    </style>
</head>
<body data-active-theme-id="<?php echo htmlspecialchars($activeTheme['id'] ?? 'drop-taxi'); ?>">

<?php echo $shell->renderHeader(); ?>

<main class="admin-login-page">
    <div class="login-card">
        <div class="login-header">
            <?php echo $content; ?>
        </div>
    </div>
</main>

<?php echo $shell->renderFooter(); ?>

<!--
    Intentionally NOT calling $shell->renderScripts() here — that loads the
    customer-facing booking JS bundle (booking-form, fare-calculator, maps,
    WhatsApp widget, theme switcher). None of it belongs on admin auth pages
    and the WhatsApp widget in particular was leaking onto the login screen
    unstyled (whatsapp.css is not loaded on this layout).
-->
<script>
    // Navigation toggle logic for public shell
    document.addEventListener('DOMContentLoaded', function() {
        const menuToggle = document.getElementById('menu-toggle');
        const menuPanel = document.getElementById('menu-panel');
        const menuClose = document.getElementById('menu-close');

        if (menuToggle && menuPanel) {
            menuToggle.addEventListener('click', () => {
                menuPanel.classList.add('menu-panel--open');
                menuToggle.setAttribute('aria-expanded', 'true');
            });
            if (menuClose) {
                menuClose.addEventListener('click', () => {
                    menuPanel.classList.remove('menu-panel--open');
                    menuToggle.setAttribute('aria-expanded', 'false');
                });
            }
        }
    });
</script>

</body>
</html>
