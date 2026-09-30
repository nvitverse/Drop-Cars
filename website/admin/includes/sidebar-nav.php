<?php
/**
 * Shared admin sidebar / mobile dropdown navigation list.
 * Expects $page (string) and optional $upcomingNavBadgeCount (int), set by layout.php.
 */
if (!isset($upcomingNavBadgeCount)) {
    $upcomingNavBadgeCount = 0;
}
$upcomingNavBadgeCount = (int) $upcomingNavBadgeCount;

$registeredSitesForNav = [];
if (isset($pdo) && $pdo instanceof PDO) {
    if (function_exists('dropcars_get_registered_sites')) {
        $registeredSitesForNav = dropcars_get_registered_sites($pdo);
    }
}
$activeWebsiteForNav = function_exists('dropcars_get_active_website') ? dropcars_get_active_website() : 'all';
?>

<!-- Website Context Selector -->
<div class="site-selector-container" style="padding: 0.5rem 1rem 1.25rem 1rem; border-bottom: 1px solid rgba(226, 232, 240, 0.08); margin-bottom: 1rem;">
    <label for="admin-site-select" style="display: block; font-size: 0.7rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 0.4rem; letter-spacing: 0.05em;">Website Context</label>
    <div style="position: relative;">
        <select id="admin-site-select" onchange="window.location.href='actions/switch-website.php?website=' + this.value" style="width: 100%; padding: 0.55rem 2.2rem 0.55rem 0.75rem; font-size: 0.8rem; font-weight: 600; color: #f1f5f9; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(148, 163, 184, 0.15); border-radius: 6px; appearance: none; cursor: pointer; transition: all 0.3s ease; outline: none;">
            <option value="all" <?php echo $activeWebsiteForNav === 'all' ? 'selected' : ''; ?>>🌐 All Websites</option>
            <?php foreach ($registeredSitesForNav as $site): ?>
                <option value="<?php echo htmlspecialchars($site['slug']); ?>" <?php echo $activeWebsiteForNav === $site['slug'] ? 'selected' : ''; ?>>
                    🚗 <?php echo htmlspecialchars($site['display_name']); ?>
                </option>
            <?php endforeach; ?>
        </select>
        <i class="fa-solid fa-chevron-down" style="position: absolute; right: 0.75rem; top: 50%; transform: translateY(-50%); font-size: 0.7rem; color: #64748b; pointer-events: none;"></i>
    </div>
    <?php
    if ($activeWebsiteForNav !== 'all') {
        $activeSiteObj = null;
        foreach ($registeredSitesForNav as $s) {
            if (($s['slug'] ?? '') === $activeWebsiteForNav) {
                $activeSiteObj = $s;
                break;
            }
        }
        if ($activeSiteObj) {
            echo '<div style="margin-top: 0.4rem; font-size: 0.72rem; color: #38bdf8; font-weight: 600; display: flex; align-items: center; gap: 4px;">';
            echo '<i class="fa-solid fa-link" style="font-size: 0.65rem;"></i> ' . htmlspecialchars($activeSiteObj['domain_name']);
            echo '</div>';
        }
    }
    ?>
</div>

<ul class="sidebar-nav">
    <li class="<?php echo $page == 'dashboard' ? 'active' : ''; ?>">
        <a href="dashboard">
            <i class="fa-solid fa-gauge"></i>
            <span>Dashboard</span>
        </a>
    </li>
    <li class="<?php echo $page == 'enquiries' ? 'active' : ''; ?>">
        <a href="enquiries">
            <i class="fa-solid fa-clipboard-list"></i>
            <span>Enquiries</span>
        </a>
    </li>
    <li class="<?php echo $page == 'bookings' ? 'active' : ''; ?>">
        <a href="bookings">
            <i class="fa-solid fa-calendar-check"></i>
            <span>Bookings</span>
        </a>
    </li>
    <li class="<?php echo $page == 'website-booking-approvals' ? 'active' : ''; ?>">
        <a href="website-booking-approvals">
            <i class="fa-solid fa-bell"></i>
            <span>Booking Approvals</span>
            <span id="pending-approvals-nav-badge" style="display:none;background:#ef4444;color:#fff;border-radius:999px;font-size:0.7rem;font-weight:800;padding:1px 7px;margin-left:6px;"></span>
        </a>
    </li>
    <li class="<?php echo $page == 'refund-requests' ? 'active' : ''; ?>">
        <a href="refund-requests">
            <i class="fa-solid fa-hand-holding-dollar"></i>
            <span>Refund Requests</span>
        </a>
    </li>
    <li class="<?php echo $page == 'upcoming' ? 'active' : ''; ?>">
        <a href="upcoming">
            <i class="fa-solid fa-hourglass-start"></i>
            <span>Upcoming Booking</span>
            <?php if ($upcomingNavBadgeCount > 0): ?>
                <span class="badge" style="margin-left: auto; font-size: 0.65rem; padding: 2px 8px; background: rgba(255,193,7,0.1); color: #ffc107; border: 1px solid rgba(255,193,7,0.2);"><?php echo $upcomingNavBadgeCount; ?></span>
            <?php endif; ?>
        </a>
    </li>
    <li class="<?php echo $page == 'customers' ? 'active' : ''; ?>">
        <a href="customers">
            <i class="fa-solid fa-users"></i>
            <span>Customers</span>
        </a>
    </li>
    <li class="<?php echo $page == 'blocked-ips' ? 'active' : ''; ?>">
        <a href="blocked-ips">
            <i class="fa-solid fa-shield-halved"></i>
            <span>Blocked IPs</span>
        </a>
    </li>
    <li class="<?php echo $page == 'tariffs' ? 'active' : ''; ?>">
        <a href="tariffs">
            <i class="fa-solid fa-tags"></i>
            <span>Tariffs</span>
        </a>
    </li>
    <li class="<?php echo $page == 'airporttaxi-tariffs' ? 'active' : ''; ?>">
        <a href="airporttaxi-tariffs">
            <i class="fa-solid fa-plane"></i>
            <span>AirportTaxi Tariffs</span>
        </a>
    </li>
    <li class="<?php echo ($page == 'promotions' || $page == 'coupons' || $page == 'banners') ? 'active' : ''; ?>">
        <a href="promotions">
            <i class="fa-solid fa-bullhorn"></i>
            <span>Promotions & Marketing</span>
        </a>
    </li>
    <li class="<?php echo $page == 'reports' ? 'active' : ''; ?>">
        <a href="reports">
            <i class="fa-solid fa-chart-line"></i>
            <span>Reports</span>
        </a>
    </li>
    <?php
        $navSettingsCats = [
            'company'       => ['Company',           'fa-building'],
            'booking'       => ['Booking & Pricing', 'fa-route'],
            'notifications' => ['Notifications',      'fa-bell'],
            'integrations'  => ['Integrations',       'fa-plug'],
            'operations'    => ['Operations',         'fa-shield-halved'],
            'account'       => ['Account & Security', 'fa-user-shield'],
            'staff'         => ['Staff Management',  'fa-users-gear'],
        ];
        $navCurCat = isset($_GET['cat']) ? preg_replace('/[^a-z_]/', '', (string) $_GET['cat']) : '';
        $isSettingsActive = ($page === 'settings' || $page === 'change-password' || $page === 'change-email');
        $isSettingsPage = ($page === 'settings');
    ?>
    <?php if (($_SESSION['admin_role'] ?? 'staff') === 'admin'): ?>
    <li class="settings-dropdown<?php echo $isSettingsActive ? ' active' : ''; ?><?php echo ($page === 'change-password' || $page === 'change-email') ? ' is-open' : ''; ?>">
        <div class="settings-dropdown-header">
            <a href="settings" class="settings-main-link">
                <i class="fa-solid fa-cog"></i>
                <span>Settings</span>
            </a>
            <span class="settings-dropdown-toggle" role="button" aria-expanded="<?php echo $isSettingsActive ? 'true' : 'false'; ?>">
                <i class="fa-solid fa-chevron-down settings-dropdown-caret" aria-hidden="true"></i>
            </span>
        </div>
        <ul class="settings-dropdown-menu">
            <?php foreach ($navSettingsCats as $ck => $cv): ?>
                <li class="<?php echo ($isSettingsPage && $navCurCat === $ck) ? 'active' : ''; ?>">
                    <a href="settings?cat=<?php echo $ck; ?>">
                        <i class="fa-solid <?php echo $cv[1]; ?>"></i>
                        <span><?php echo htmlspecialchars($cv[0]); ?></span>
                    </a>
                </li>
            <?php endforeach; ?>
            <li class="<?php echo ($page === 'change-password') ? 'active' : ''; ?>">
                <a href="change-password">
                    <i class="fa-solid fa-key"></i>
                    <span>Change Password</span>
                </a>
            </li>
            <?php if (($_SESSION['admin_role'] ?? 'staff') === 'admin'): ?>
            <li class="<?php echo ($page === 'change-email') ? 'active' : ''; ?>">
                <a href="change-email">
                    <i class="fa-solid fa-envelope-circle-check"></i>
                    <span>Change Login Email</span>
                </a>
            </li>
            <?php endif; ?>
        </ul>
    </li>
    <?php else: ?>
    <li class="<?php echo $page == 'change-password' ? 'active' : ''; ?>">
        <a href="change-password">
            <i class="fa-solid fa-key"></i>
            <span>Change Password</span>
        </a>
    </li>
    <?php endif; ?>
    <li>
        <a href="logout" onclick="return confirm('Are you sure you want to logout?')">
            <i class="fa-solid fa-sign-out-alt"></i>
            <span>Logout</span>
        </a>
    </li>
</ul>

<?php if (!defined('DROPCARS_SETTINGS_DROPDOWN_ASSETS')): define('DROPCARS_SETTINGS_DROPDOWN_ASSETS', true); ?>
<style>
    .settings-dropdown-header {
        display: flex;
        align-items: center;
        width: 100%;
        color: var(--slate-400);
        border-radius: var(--border-radius-sm);
        transition: var(--transition-base);
    }
    .settings-dropdown-header:hover {
        color: white;
        background: rgba(255, 255, 255, 0.05);
    }
    .settings-dropdown.active .settings-dropdown-header {
        color: var(--secondary-color);
        background: var(--primary-color);
        font-weight: 700;
        box-shadow: 0 4px 12px rgba(247, 183, 51, 0.3);
    }
    .settings-dropdown-header a.settings-main-link {
        background: transparent !important;
        box-shadow: none !important;
        color: inherit !important;
        font-weight: inherit !important;
        padding: 0.4rem 0.85rem;
        flex: 1;
        display: flex;
        align-items: center;
        text-decoration: none;
    }
    .settings-dropdown-header a.settings-main-link i {
        width: 20px;
        margin-right: 10px;
        font-size: 0.95rem;
        color: inherit !important;
    }
    .settings-dropdown-header .settings-dropdown-toggle {
        padding: 0.4rem 0.85rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: inherit;
        transition: opacity 0.2s;
    }
    .settings-dropdown-header .settings-dropdown-toggle:hover {
        background: rgba(255, 255, 255, 0.1);
        border-top-right-radius: var(--border-radius-sm);
        border-bottom-right-radius: var(--border-radius-sm);
    }
    .settings-dropdown.active .settings-dropdown-header .settings-dropdown-toggle:hover {
        background: rgba(0, 0, 0, 0.1);
    }
    .settings-dropdown-caret {
        font-size: 0.7rem;
        transition: transform 0.25s ease;
        opacity: 0.7;
    }
    .settings-dropdown.is-open .settings-dropdown-caret { transform: rotate(180deg); }
    /* Collapsible submenu */
    .settings-dropdown-menu {
        list-style: none;
        margin: 0;
        padding: 0;
        max-height: 0;
        overflow: hidden;
        transition: max-height 0.3s ease;
    }
    .settings-dropdown.is-open .settings-dropdown-menu { max-height: 420px; }
    
    /* Reset active state styles inherited from parent .settings-dropdown.active */
    .settings-dropdown.active .settings-dropdown-menu li a {
        color: var(--slate-400) !important;
        background: transparent !important;
        font-weight: 500 !important;
        box-shadow: none !important;
    }
    .settings-dropdown.active .settings-dropdown-menu li a i {
        color: var(--slate-400) !important;
    }
    
    /* Apply styles for hover and active state of the specific sub-links */
    .settings-dropdown .settings-dropdown-menu li a:hover,
    .settings-dropdown .settings-dropdown-menu li.active a {
        color: white !important;
        background: rgba(255, 255, 255, 0.08) !important;
        font-weight: 700 !important;
    }
    .settings-dropdown .settings-dropdown-menu li.active a i {
        color: white !important;
    }
    
    .settings-dropdown-menu > li > a {
        padding-left: 2.6rem !important;
        font-size: 0.82rem;
    }
    .settings-dropdown-menu > li > a i { font-size: 0.8rem; }

    /* Mobile navigation dropdown overrides */
    .mobile-nav-dropdown .settings-dropdown-header {
        border-radius: 0;
        color: rgba(255, 255, 255, 0.7);
    }
    .mobile-nav-dropdown .settings-dropdown.active .settings-dropdown-header {
        color: var(--secondary-color) !important;
        background: var(--primary-color) !important;
    }
    .mobile-nav-dropdown .settings-dropdown-header a.settings-main-link {
        padding: 1.15rem 1.75rem;
        font-weight: 600;
        font-size: 0.95rem;
    }
    .mobile-nav-dropdown .settings-dropdown-header .settings-dropdown-toggle {
        padding: 1.15rem 1.75rem;
    }
</style>
<script>
(function () {
    if (window.__dropcarsSettingsDropdownBound) return;
    window.__dropcarsSettingsDropdownBound = true;
    document.addEventListener('click', function (e) {
        var toggle = e.target.closest('.settings-dropdown-toggle');
        if (!toggle) return;
        // Toggle the dropdown instead of navigating.
        e.preventDefault();
        var dd = toggle.closest('.settings-dropdown');
        if (!dd) return;
        var open = dd.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
})();
</script>
<?php endif; ?>
