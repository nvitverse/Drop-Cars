<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <?php
    $siteNameSuffix = '';
    $activeSiteDetails = null;
    if (isset($pdo) && $pdo instanceof PDO && function_exists('dropcars_get_active_website_details')) {
        $activeSiteDetails = dropcars_get_active_website_details($pdo);
        if ($activeSiteDetails) {
            $siteNameSuffix = ' | ' . htmlspecialchars($activeSiteDetails['display_name']);
        }
    }
    ?>
    <title>Drop Cars Admin - <?php echo ucfirst($page); ?><?php echo $siteNameSuffix; ?></title>
<?php if (function_exists('dropcars_render_favicons')) { dropcars_render_favicons(); } ?>
    <!-- Inter Font -->
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <!-- FontAwesome (v6) -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <!-- Custom CSS -->
    <link rel="stylesheet" href="assets/css/style.css?v=2.6">
    <!-- Global mobile responsive fixes for every admin page -->
    <link rel="stylesheet" href="assets/css/admin-mobile-fixes.css?v=1.0">
    <?php
    if (isset($page) && $page === 'bookings-new' && function_exists('dropcars_url')) {
        echo '<link rel="stylesheet" href="' . htmlspecialchars(dropcars_url('assets/css/base.css'), ENT_QUOTES, 'UTF-8') . '">' . "\n    ";
        echo '<link rel="stylesheet" href="' . htmlspecialchars(dropcars_url('assets/css/booking-form.css'), ENT_QUOTES, 'UTF-8') . '">' . "\n";
    }
    ?>
</head>
<body>
<?php
$upcomingNavBadgeCount = 0;
if (isset($pdo) && $pdo instanceof PDO) {
    try {
        $upcomingNavBadgeCount = (int) $pdo->query("SELECT COUNT(*) FROM `bookings` WHERE `status` = 'confirmed' AND `pickup_date` >= CURDATE()")->fetchColumn();
    } catch (Throwable $e) {
        $upcomingNavBadgeCount = 0;
    }
}
$adminLogoPath = !empty($config['logoPath']) ? '/' . ltrim($config['logoPath'], '/') : '/assets/img/dropcars-emblem.png';
?>
    <header class="mobile-header">
        <div class="logo" style="display:flex;align-items:center;">
            <a href="/admin/" style="display:inline-flex;align-items:center;text-decoration:none;">
                <img src="<?php echo htmlspecialchars($adminLogoPath, ENT_QUOTES, 'UTF-8'); ?>" alt="Drop Cars Logo" style="height:32px; width:auto; max-width:160px; object-fit:contain;" />
            </a>
            <?php if ($activeSiteDetails): ?>
                <span style="font-size: 0.65rem; background: rgba(59, 130, 246, 0.15); color: #60a5fa; padding: 2px 6px; border-radius: 4px; font-weight: 700; margin-left: 8px; vertical-align: middle;">
                    <?php echo htmlspecialchars($activeSiteDetails['display_name']); ?>
                </span>
            <?php endif; ?>
        </div>
        <div class="mobile-menu-wrap">
            <button type="button" class="menu-toggle" id="menu-toggle" aria-expanded="false" aria-controls="mobile-nav-dropdown" aria-label="Open menu">
                <i class="fa-solid fa-bars" aria-hidden="true"></i>
            </button>
            <div id="mobile-nav-dropdown" class="mobile-nav-dropdown" role="navigation" aria-label="Main navigation" hidden>
                <nav>
                    <?php require __DIR__ . '/sidebar-nav.php'; ?>
                </nav>
            </div>
        </div>
    </header>

    <!-- Sidebar Section -->
    <aside class="sidebar">
        <div class="logo" style="padding-bottom: 0.5rem;">
            <a href="/admin/" style="display:inline-flex;align-items:center;text-decoration:none;">
                <img src="<?php echo htmlspecialchars($adminLogoPath, ENT_QUOTES, 'UTF-8'); ?>" alt="Drop Cars Logo" style="height:36px; width:auto; max-width:170px; object-fit:contain;" />
            </a>
            <?php if ($activeSiteDetails): ?>
                <div style="font-size: 0.7rem; font-weight: 700; color: #3b82f6; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px;">
                    <?php echo htmlspecialchars($activeSiteDetails['display_name']); ?>
                </div>
            <?php else: ?>
                <div style="font-size: 0.7rem; font-weight: 700; color: #10b981; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px;">
                    ALL WEBSITES
                </div>
            <?php endif; ?>
        </div>
        <nav>
            <?php require __DIR__ . '/sidebar-nav.php'; ?>
        </nav>
    </aside>

    <!-- Main Content Area -->
    <main class="main-content">
        <div class="admin-content">
            <?php echo $content; ?>

        </div>
    </main>

    <!-- Custom JS -->
    <script src="assets/js/admin.js"></script>
    <!-- Alarm for website bookings awaiting approval (see admin/pages/website-booking-approvals.php) -->
    <script src="assets/js/pending-bookings-siren.js"></script>
    <!-- Security: right-click, view-source, devtools, session timeout protection -->
    <?php $adminMode = true; require_once __DIR__ . '/../../includes/frontend-protection.php'; ?>
</body>
</html>
