<?php
/**
 * UI Shell for Drop Cars
 * Handles consistent header, footer, and theme injection.
 *
 * Buffer output so renderHeader() can switch admin/customer sessions after HTML has been
 * written to the buffer (city/route/index pages output <head> before calling renderHeader()).
 */
if (function_exists('ob_get_level') && ob_get_level() === 0) {
    ob_start();
}

if (!function_exists('dropcars_shell_admin_logged_in')) {
    /**
     * Admin uses a separate session name; read it without clobbering the public customer session.
     */
    function dropcars_shell_admin_logged_in() {
        $configFile = __DIR__ . '/../admin/config/config.php';
        if (!is_file($configFile)) {
            return false;
        }
        $cfg = require $configFile;
        $adminSessionName = $cfg['sessionName'] ?? 'dropcars_admin_session';
        if (headers_sent()) {
            return false;
        }
        $wasActive = session_status() === PHP_SESSION_ACTIVE;
        $prevName = session_name();
        if ($wasActive) {
            session_write_close();
        }
        session_name($adminSessionName);
        session_start();
        $ok = !empty($_SESSION['admin_id']) && !empty($_SESSION['admin_email']);
        session_write_close();
        session_name($prevName);
        if ($wasActive) {
            session_start();
        }
        return $ok;
    }
}

if (!function_exists('dropcars_customer_logged_in')) {
    function dropcars_customer_logged_in() {
        if (session_status() === PHP_SESSION_NONE) {
            $sessPath = __DIR__ . '/../config/session.php';
            if (is_file($sessPath)) {
                require_once $sessPath;
            }
            @session_start();
        }
        return !empty($_SESSION['customer_phone']) || !empty($_SESSION['customer_email']) || !empty($_SESSION['customer_id']);
    }
}

class UIShell {
    private $theme;
    private $themes;

    private $config;

    /** Ensures the WhatsApp widget's CSS + JS are injected exactly once per page,
     *  whether they come from renderFooter() or renderScripts(). */
    private static $waAssetsInjected = false;

    /**
     * Returns the WhatsApp widget stylesheet + script once. Subsequent calls
     * (e.g. renderScripts after renderFooter) return an empty string so the
     * assets never load twice. Guarantees the phone + WhatsApp icons render
     * consistently (styled) on every page that shows the footer.
     */
    private function whatsappWidgetAssets() {
        if (self::$waAssetsInjected) {
            return '';
        }
        self::$waAssetsInjected = true;
        $bp = function_exists('dropcars_base_path') ? rtrim(dropcars_base_path(), '/') : '';
        $cssDir = __DIR__ . '/../assets/css/';
        $jsDir = __DIR__ . '/../assets/js/';
        $cssV = @filemtime($cssDir . 'whatsapp.css') ?: 1;
        $jsV = @filemtime($jsDir . 'whatsapp.js') ?: 1;
        $aiCssV = @filemtime($cssDir . 'ai-assistant.css') ?: 1;
        $aiJsV = @filemtime($jsDir . 'ai-assistant.js') ?: 1;
        // Non-render-blocking load: neither widget's markup exists in the
        // initial HTML at all (both are injected by their own deferred JS
        // below), so there's zero risk of an unstyled-widget flash - unlike
        // theme/layout CSS, these two are safe to take off the critical
        // rendering path entirely. Standard preload-swap trick: browsers
        // fetch it at normal priority but don't block parsing on a
        // print-media link, then swap to `all` once loaded via onload.
        return "\n    <link rel='stylesheet' href='{$bp}/assets/css/whatsapp.css?v={$cssV}'>"
             . "\n    <link rel='stylesheet' href='{$bp}/assets/css/ai-assistant.css?v={$aiCssV}'>"
             . "\n    <script defer src='{$bp}/assets/js/whatsapp.js?v={$jsV}'></script>"
             . "\n    <script defer src='{$bp}/assets/js/ai-assistant.js?v={$aiJsV}'></script>";
    }

    public function getLogoMarkup() {
        // AirportTaxi.International is a genuinely distinct sub-brand (different trip
        // types, different tariff model) — it should never show "Drop Cars" branding
        // in its own header/footer, even though it shares Drop Cars' backend. Every
        // other theme keeps the existing shared Drop Cars logo unchanged.
        if (($this->theme['slug'] ?? '') === 'airport-taxi') {
            return "<div class='logo-wrapper' style='display:inline-flex; align-items:center; gap:6px;'>
          <span class='logo__brand' style='display:inline-flex; align-items:center; gap:4px;'><span aria-hidden='true'>✈</span>AIRPORT<span class='logo__accent'>TAXI</span></span>
        </div>";
        }

        $logoEmblemUrl = function_exists('dropcars_url') ? dropcars_url('assets/img/dropcars-emblem.png') : '/assets/img/dropcars-emblem.png';

        $logoMarkup = "<div class='logo-wrapper' style='display:inline-flex; align-items:center; gap:8px;'>
          <img src='{$logoEmblemUrl}' alt='Drop Cars' class='logo-emblem-img' style='height:34px; width:34px; object-fit:contain; display:block;' />
          <span class='logo-brand-pill'><span class='logo__mark'>Drop</span><span class='logo__text'>Cars</span></span>
        </div>";
        return $logoMarkup;
    }

    public function __construct($theme = null, $allThemes = []) {
        $this->theme = $theme;
        $this->themes = $allThemes;
        
        // Auto-load themes if not passed (e.g. on standalone pages like customer-login)
        if (empty($this->themes)) {
            try {
                $themeEngineFile = __DIR__ . '/theme-engine.php';
                if (is_file($themeEngineFile)) {
                    require_once $themeEngineFile;
                    $themeEngine = new ThemeEngine();
                    if (!$this->theme) {
                        $this->theme = $themeEngine->detectTheme();
                    }
                    $this->themes = $themeEngine->getAllThemes();
                }
            } catch (Throwable $e) {}
        }
        
        $configPath = __DIR__ . '/../api/config.php';
        if (!is_file($configPath)) {
            $configPath = __DIR__ . '/../api/config.example.php';
        }
        $this->config = is_file($configPath) ? (include $configPath) : [];

        // Capture referral codes globally from invite links
        if (!empty($_GET['coupon'])) {
            $_SESSION['pending_referral'] = strtoupper(trim($_GET['coupon']));
        }
    }

    public function renderHead() {
        if (function_exists('dropcars_render_favicons')) {
            dropcars_render_favicons($this->theme['slug'] ?? null);
        }
        return '';
    }

    public function renderHeader($hideNav = false) {
        $pathsFile = __DIR__ . '/../includes/paths.php';
        if (is_file($pathsFile)) {
            require_once $pathsFile;
        }
        $hideAdmin = false;
        $subdomainCity = null;
        if (function_exists('dropcars_get_subdomain_city_slug')) {
            $subdomainCity = dropcars_get_subdomain_city_slug();
        }
        if ($subdomainCity !== null) {
            $hideAdmin = true;
        }
        if (strpos($_SERVER['REQUEST_URI'] ?? '', '/City - Website/') !== false) {
            $hideAdmin = true;
        }
        $activeSlug = ($this->theme['slug'] ?? '') ?: 'drop-cars';
        $navBrandLabel = $activeSlug === 'airport-taxi' ? 'Airport Taxi' : 'Drop Cars';
        $u = static function (string $path): string {
            return function_exists('dropcars_url') ? dropcars_url($path) : '/' . ltrim($path, '/');
        };
        $logoLink = $activeSlug !== 'drop-cars' ? '/' . $activeSlug : '/';
        $homeLink = $activeSlug !== 'drop-cars' ? '/' . $activeSlug : '/';
        if ($subdomainCity !== null) {
            $mainHomeUrl = function_exists('dropcars_main_origin') ? dropcars_main_origin() : 'https://dropcars.in';
            $logoLink = $mainHomeUrl;
            $homeLink = $mainHomeUrl;
        }
        $bookNowUrl = ($activeSlug === 'drop-cars') ? $u('booknow') : $u($activeSlug . '/booknow');
        $bookOneWay = $bookNowUrl . '?trip_type=one_way';
        $bookRoundTrip = $bookNowUrl . '?trip_type=round_trip';
        $bookHourly = $bookNowUrl . '?trip_type=hourly_rental';
        $bookAirport = $u('airport-transfer');
        $secBooking = $bookNowUrl;
        $secServices = ($activeSlug === 'drop-cars') ? $u('services') : $u($activeSlug . '/services');
        $secRoutes = ($activeSlug === 'drop-cars') ? '/#routes' : $u($activeSlug . '/#routes');
        $secCities = ($activeSlug === 'drop-cars') ? '/#cities' : $u($activeSlug . '/#cities');
        $secFaq = ($activeSlug === 'drop-cars') ? $u('faq') : $u($activeSlug . '/faq');
        $privacyLink = $u('privacy');
        $termsLink = $u('terms');
        $paymentPolicyLink = $u('payment-policy');
        $refundPolicyLink = $u('refund-policy');
        $driverPartnerLink = $u('driver-partner');
        $vendorPartnerLink = $u('vendor-partner');
        $fleetPartnerLink = $u('fleet-partner');
        $tariffLink = $u('tariff');
        $contactLink = $u('contact');

        if (session_status() === PHP_SESSION_NONE) {
            require_once __DIR__ . '/../config/session.php';
            @session_start();
        }
        $customerLoggedIn = dropcars_customer_logged_in();
        $customerName = 'Customer';
        if ($customerLoggedIn) {
            $customerName = htmlspecialchars($_SESSION['customer_name'] ?? 'Member', ENT_QUOTES, 'UTF-8');
            try {
                require_once __DIR__ . '/../admin/config/database.php';
                $pdo = $GLOBALS['db'];
                if ($pdo instanceof PDO && !empty($_SESSION['customer_phone'])) {
                    $stmt = $pdo->prepare("SELECT `name` FROM `customers` WHERE `phone` = ? LIMIT 1");
                    $stmt->execute([$_SESSION['customer_phone']]);
                    $cName = $stmt->fetchColumn();
                    if ($cName) {
                        $customerName = htmlspecialchars($cName, ENT_QUOTES, 'UTF-8');
                    }
                }
            } catch (Throwable $e) {}
        }
        $customerLabel = $customerLoggedIn ? "👤 " . $customerName : 'Customer';

        $trackUrl = function_exists('dropcars_url') ? dropcars_url('pages/track-booking.php') : '/pages/track-booking.php';
        $customerAuthUrl = function_exists('dropcars_url')
            ? dropcars_url($customerLoggedIn ? 'pages/customer-dashboard.php' : 'pages/customer-login.php')
            : ($customerLoggedIn ? '/pages/customer-dashboard.php' : '/pages/customer-login.php');
        $customerAuthLabel = $customerLoggedIn ? 'My Dashboard' : 'Customer Login';
        $headerLoginLabel  = $customerLoggedIn ? 'My Account' : 'Login';
        $logoutUrl = function_exists('dropcars_url') ? dropcars_url('pages/logout.php') : '/pages/logout.php';
        $trackUrlEsc = htmlspecialchars($trackUrl, ENT_QUOTES, 'UTF-8');
        $customerAuthUrlEsc = htmlspecialchars($customerAuthUrl, ENT_QUOTES, 'UTF-8');
        $logoutUrlEsc = htmlspecialchars($logoutUrl, ENT_QUOTES, 'UTF-8');
        $logoutNavHtml = $customerLoggedIn
            ? "<a href='{$logoutUrlEsc}' role='menuitem' style='color:#ef4444; font-weight:700;'>🚪 Log out</a>"
            : '';
        $logoutMenuLink = $customerLoggedIn
            ? "<a href='{$logoutUrlEsc}' style='color:#ef4444; font-weight:700;'>🚪 Log out</a>"
            : '';

        $adminLoggedIn = dropcars_shell_admin_logged_in();
        if ($hideAdmin) {
            $adminLoggedIn = false;
        }
        $adminNavUrl = function_exists('dropcars_url')
            ? dropcars_url($adminLoggedIn ? 'admin/dashboard' : 'admin/login')
            : ($adminLoggedIn ? '/admin/dashboard' : '/admin/login');
        $adminNavLabel = $adminLoggedIn ? 'Admin Dashboard' : 'Admin Login';
        $adminNavUrlEsc = htmlspecialchars($adminNavUrl, ENT_QUOTES, 'UTF-8');
        $adminNavTitleEsc = htmlspecialchars(
            $adminLoggedIn ? 'Open admin panel' : 'Staff login',
            ENT_QUOTES,
            'UTF-8'
        );

        // Secure administrative link layout (hide from general customers completely)
        $adminLinkHtml = $adminLoggedIn
            ? "<a href='{$adminNavUrlEsc}' title='{$adminNavTitleEsc}' class='admin-nav-link' style='color:#ef4444; font-weight:800;'><span style='color:#f7b733;'>🔑</span> Admin Dashboard</a>"
            : "";

        $mobileAdminHtml = $adminLoggedIn
            ? "<div class='menu-panel__section'>
                <ul>
                  <li><a href='{$adminNavUrlEsc}' title='{$adminNavTitleEsc}' class='admin-nav-link' style='color:#ef4444; font-weight:800;'><span style='color:#f7b733;'>🔑</span> Admin Dashboard</a></li>
                </ul>
              </div>"
            : "";

        $navChevron = "<svg class='nav-dropdown__chev' width='9' height='9' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M6 9l6 6 6-6'/></svg>";

        // Theme-adaptive PNG logos (Light mode & Dark mode pic assets)
        $logoMarkup = $this->getLogoMarkup();

        if ($subdomainCity !== null) {
            $mainHomeUrl = function_exists('dropcars_main_origin') ? dropcars_main_origin() : 'https://dropcars.in';
            $logoLink = rtrim($mainHomeUrl, '/');
            $logoMarkupWithHome = "<div class='logo-container' style='display:inline-flex; align-items:center; gap:0.85rem;'>
              <a href='{$logoLink}'>{$logoMarkup}</a>
              <a href='{$mainHomeUrl}' class='home-nav-btn' style='display:inline-flex; align-items:center; justify-content:center; color:var(--blue-dark); text-decoration:none; transition:color 0.2s;' onmouseover=\"this.style.color='var(--blue)';\" onmouseout=\"this.style.color='var(--blue-dark)';\" aria-label='Home'>
                <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><path d='M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'/><polyline points='9 22 9 12 15 12 15 22'/></svg>
              </a>
            </div>";
        } else {
            $logoMarkupWithHome = "<a href='{$logoLink}'>{$logoMarkup}</a>";
        }

        $navHtml = "";
        $ctaHtml = "";

        if (!$hideNav) {
            if ($subdomainCity === null) {
                $navHtml = "
            <div class='nav-wrap'>
            <nav class='nav' aria-label='Primary navigation'>
              <a href='{$homeLink}'>Home</a>
              <div class='nav-dropdown'>
                <button type='button' class='nav-dropdown__btn' aria-expanded='false' aria-haspopup='true' id='nav-dd-book' aria-label='Book a taxi'>Book A Taxi {$navChevron}</button>
                <div class='nav-dropdown__content' role='menu' aria-labelledby='nav-dd-book'>
                  <a href='{$bookOneWay}' role='menuitem'>One Way</a>
                  <a href='{$bookRoundTrip}' role='menuitem'>Round Trip</a>
                  <a href='{$bookHourly}' role='menuitem'>Local Rental</a>
                  <a href='{$bookAirport}' role='menuitem'>Airport Transfer</a>
                </div>
              </div>
              <div class='nav-dropdown'>
                <button type='button' class='nav-dropdown__btn' aria-expanded='false' aria-haspopup='true' id='nav-dd-customer' aria-label='Customer Options'>{$customerLabel} {$navChevron}</button>
                <div class='nav-dropdown__content' role='menu' aria-labelledby='nav-dd-customer'>
                  <a href='{$customerAuthUrlEsc}' role='menuitem'>{$customerAuthLabel}</a>
                  <a href='{$trackUrlEsc}' role='menuitem'>Track Ride</a>
                  {$logoutNavHtml}
                </div>
              </div>
              <!-- Desktop: prominent Login/Account CTA -->
              <div class='nav-dropdown'>
                <button type='button' class='nav-dropdown__btn' aria-expanded='false' aria-haspopup='true' id='nav-dd-main' aria-label='Main Options'>{$navBrandLabel} {$navChevron}</button>
                <div class='nav-dropdown__content' role='menu' aria-labelledby='nav-dd-main'>
                  <a href='{$tariffLink}' role='menuitem'>Tariff</a>
                  <a href='{$secServices}' role='menuitem'>Services</a>
                  <a href='{$secRoutes}' role='menuitem'>Routes</a>
                  <a href='{$secCities}' role='menuitem'>Cities We Serve</a>
                  <a href='{$contactLink}' role='menuitem'>Contact</a>
                  <a href='{$secFaq}' role='menuitem'>FAQs</a>
                </div>
              </div>
              <div class='nav-dropdown'>
                <button type='button' class='nav-dropdown__btn' aria-expanded='false' aria-haspopup='true' id='nav-dd-policies'>Policies {$navChevron}</button>
                <div class='nav-dropdown__content' role='menu' aria-labelledby='nav-dd-policies'>
                  <a href='{$privacyLink}' role='menuitem'>Privacy Policy</a>
                  <a href='{$paymentPolicyLink}' role='menuitem'>Payment Policy</a>
                  <a href='{$refundPolicyLink}' role='menuitem'>Refund Policy</a>
                  <a href='{$termsLink}' role='menuitem'>Terms &amp; Conditions</a>
                </div>
              </div>
              <div class='nav-dropdown'>
                <button type='button' class='nav-dropdown__btn' aria-expanded='false' aria-haspopup='true' id='nav-dd-partners'>Partners {$navChevron}</button>
                <div class='nav-dropdown__content' role='menu' aria-labelledby='nav-dd-partners'>
                  <a href='{$driverPartnerLink}' role='menuitem'>Driver Partner</a>
                  <a href='{$vendorPartnerLink}' role='menuitem'>Vendor Partner</a>
                  <a href='{$fleetPartnerLink}' role='menuitem'>Fleet Partner</a>
                </div>
              </div>
              {$adminLinkHtml}
            </nav>
            </div>";
            }

            $ctaHtml = "
        <div class='header__cta'>
          <a href='{$customerAuthUrlEsc}' class='header-login-btn' id='header-login-cta' aria-label='{$headerLoginLabel}'>
            <svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'/><circle cx='12' cy='7' r='4'/></svg>
            <span>{$headerLoginLabel}</span>
          </a>
          <button class='theme-toggle' id='theme-toggle-btn' aria-label='Switch to dark mode' title='Toggle light / dark mode'>
            <!-- SUN icon (light mode) -->
            <svg class='icon-sun' viewBox='0 0 24 24' fill='none' stroke='#f5b800' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>
              <circle cx='12' cy='12' r='5' fill='rgba(245,184,0,0.15)'/>
              <line x1='12' y1='1'  x2='12' y2='3'/>
              <line x1='12' y1='21' x2='12' y2='23'/>
              <line x1='4.22' y1='4.22'  x2='5.64' y2='5.64'/>
              <line x1='18.36' y1='18.36' x2='19.78' y2='19.78'/>
              <line x1='1'  y1='12' x2='3'  y2='12'/>
              <line x1='21' y1='12' x2='23' y2='12'/>
              <line x1='4.22' y1='19.78' x2='5.64' y2='18.36'/>
              <line x1='18.36' y1='5.64' x2='19.78' y2='4.22'/>
            </svg>
            <!-- MOON icon (dark mode) -->
            <svg class='icon-moon' viewBox='0 0 24 24' fill='none' aria-hidden='true'>
              <path d='M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'
                    fill='rgba(148,163,255,0.18)'
                    stroke='#818cf8' stroke-width='2'
                    stroke-linecap='round' stroke-linejoin='round'/>
            </svg>
          </button>
          <button class='menu-button' id='menu-toggle' aria-expanded='false' aria-label='Toggle menu'><svg viewBox='0 0 24 24'><path d='M3 7h18M3 12h18M3 17h18'/></svg></button>
          <div class='menu-panel' id='menu-panel'>
            <div class='menu-panel__section'>
              <ul>
                <li><a href='{$homeLink}'>Home</a></li>
              </ul>
            </div>
            <!-- Mobile Menu Sections -->
            <div class='menu-panel__section menu-panel__section--accordion menu-panel__section--accordion-first'>
              <details class='menu-panel__dropdown'>
                <summary>Book A Taxi</summary>
                <div class='menu-panel__dropdown-links'>
                  <a href='{$bookOneWay}'>One Way</a>
                  <a href='{$bookRoundTrip}'>Round Trip</a>
                  <a href='{$bookHourly}'>Local Rental</a>
                  <a href='{$bookAirport}'>Airport Transfer</a>
                </div>
              </details>
            </div>

            <!-- Mobile: quick-action customer buttons -->
            <div class='menu-panel__section menu-panel__cta-group'>
              <a href='{$customerAuthUrlEsc}' class='menu-panel__cta-btn menu-panel__cta-btn--primary'>
                <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'/><circle cx='12' cy='7' r='4'/></svg>
                {$headerLoginLabel}
              </a>
              <a href='{$trackUrlEsc}' class='menu-panel__cta-btn menu-panel__cta-btn--secondary'>
                <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><circle cx='12' cy='12' r='10'/><polyline points='12 6 12 12 16 14'/></svg>
                Track Ride
              </a>
              {$logoutMenuLink}
            </div>

            <div class='menu-panel__section menu-panel__section--accordion'>
              <details class='menu-panel__dropdown'>
                <summary>{$navBrandLabel}</summary>
                <div class='menu-panel__dropdown-links'>
                  <a href='{$tariffLink}'>Tariff</a>
                  <a href='{$secServices}'>Services</a>
                  <a href='{$secRoutes}'>Routes</a>
                  <a href='{$secCities}'>Cities We Serve</a>
                  <a href='{$contactLink}'>Contact</a>
                  <a href='{$secFaq}'>FAQs</a>
                </div>
              </details>
            </div>
            
            <div class='menu-panel__section menu-panel__section--accordion'>
              <details class='menu-panel__dropdown'>
                <summary>Policies</summary>
                <div class='menu-panel__dropdown-links'>
                  <a href='{$privacyLink}'>Privacy Policy</a>
                  <a href='{$paymentPolicyLink}'>Payment Policy</a>
                  <a href='{$refundPolicyLink}'>Refund Policy</a>
                  <a href='{$termsLink}'>Terms &amp; Conditions</a>
                </div>
              </details>
              <details class='menu-panel__dropdown'>
                <summary>Partners</summary>
                <div class='menu-panel__dropdown-links'>
                  <a href='{$driverPartnerLink}'>Driver Partner</a>
                  <a href='{$vendorPartnerLink}'>Vendor Partner</a>
                  <a href='{$fleetPartnerLink}'>Fleet Partner</a>
                </div>
              </details>
            </div>

            <!-- Admin: visible button always in mobile panel -->
            {$mobileAdminHtml}
            " . (!$hideAdmin ? "
            <div class='menu-panel__admin-foot'>
              <a href='{$adminNavUrlEsc}' class='menu-panel__cta-btn menu-panel__cta-btn--admin' title='{$adminNavTitleEsc}'>
                <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><rect x='3' y='11' width='18' height='11' rx='2' ry='2'/><path d='M7 11V7a5 5 0 0 1 10 0v4'/></svg>
                {$adminNavLabel}
              </a>
            </div>" : "") . "
            <button class='menu-panel__close' id='menu-close'>Close</button>
          </div>
        </div>";
        } else {
            $displayPhone = $this->config['company']['phone'] ?? $this->config['supportPhone'] ?? '7598899579';
            $functionalPhone = $this->config['company']['functional_phone'] ?? $this->config['functionalPhone'] ?? '7200217986';
            $displayPhoneClean = preg_replace('/\D/', '', $displayPhone);
            if (strlen($displayPhoneClean) === 10) {
                $phoneDisplayVal = '+91 ' . $displayPhoneClean;
            } else {
                $phoneDisplayVal = '+' . $displayPhoneClean;
            }
            $functionalPhoneClean = preg_replace('/\D/', '', $functionalPhone);
            $phoneHrefVal = 'tel:+' . (strlen($functionalPhoneClean) === 10 ? '91' . $functionalPhoneClean : $functionalPhoneClean);

            $ctaHtml = "
        <div class='header__cta'>
          <a href='{$phoneHrefVal}' class='header-call-btn'>
            <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z'></path></svg>
            <span class='header-call-btn__text'>Call: {$phoneDisplayVal}</span>
          </a>
        </div>";
        }

        $header = "
    <header class='site-header'>
      <div class='container header__content'>
        <div class='logo'>{$logoMarkupWithHome}</div>
        {$navHtml}
        {$ctaHtml}
      </div>
    </header>";
        return $header;
    }

    public function renderFooter() {
        $year = date('Y');
        $pathsFile = __DIR__ . '/../includes/paths.php';
        if (is_file($pathsFile)) {
            require_once $pathsFile;
        }
        $activeSlug = ($this->theme['slug'] ?? '') ?: 'drop-cars';
        $u = static function (string $path): string {
            return function_exists('dropcars_url') ? dropcars_url($path) : '/' . ltrim($path, '/');
        };
        $navBrandLabel = $activeSlug === 'airport-taxi' ? 'Airport Taxi' : 'Drop Cars';
        $homeLink = $activeSlug !== 'drop-cars' ? '/' . $activeSlug : '/';
        $bookNowUrl = $activeSlug !== 'drop-cars' ? $u($activeSlug . '/booknow') : $u('booknow');
        $airportTransferUrl = $u('airport-transfer');
        $secServicesUrl = $activeSlug !== 'drop-cars' ? $u($activeSlug . '/services') : $u('services');
        $secAboutUrl = $activeSlug !== 'drop-cars' ? $u($activeSlug . '/about') : $u('about');
        $destChennai = $activeSlug !== 'drop-cars' ? $u($activeSlug . '/chennai') : $u('chennai');
        $destTrichy = $activeSlug !== 'drop-cars' ? $u($activeSlug . '/trichy') : $u('trichy');
        $destCoimbatore = $activeSlug !== 'drop-cars' ? $u($activeSlug . '/coimbatore') : $u('coimbatore');
        $destMadurai = $activeSlug !== 'drop-cars' ? $u($activeSlug . '/madurai') : $u('madurai');
        $destSalem = $activeSlug !== 'drop-cars' ? $u($activeSlug . '/salem') : $u('salem');
        $destTirunelveli = $activeSlug !== 'drop-cars' ? $u($activeSlug . '/tirunelveli') : $u('tirunelveli');
        $destErode = $activeSlug !== 'drop-cars' ? $u($activeSlug . '/erode') : $u('erode');
        $destTiruppur = $activeSlug !== 'drop-cars' ? $u($activeSlug . '/tiruppur') : $u('tiruppur');
        $destBangalore = $activeSlug !== 'drop-cars' ? $u($activeSlug . '/bangalore') : $u('bangalore');
        $destPondicherry = $activeSlug !== 'drop-cars' ? $u($activeSlug . '/pondicherry') : $u('pondicherry');
        // Theme links: compact dropdown under “Drop Cars” (small hit target — see footer CSS/JS).
        $themePanelLinks = '';
        foreach ($this->themes as $t) {
            $slug = $t['slug'] ?? ($t['id'] ?? 'drop-cars');
            $externalDomain = $t['externalDomain'] ?? null;
            $activeClass = ($this->theme && ($this->theme['id'] ?? '') === ($t['id'] ?? '')) ? 'active' : '';
            $name = htmlspecialchars((string)($t['name'] ?? ''), ENT_QUOTES, 'UTF-8');
            if ($externalDomain) {
                // Standalone sister brand with its own domain — link out, don't route
                // through a dropcars.in path (that path is intentionally not themed).
                $href = htmlspecialchars($externalDomain, ENT_QUOTES, 'UTF-8');
                $themePanelLinks .= "<a href='{$href}' class='footer__theme-link {$activeClass}' target='_blank' rel='noopener'>{$name}</a>";
                continue;
            }
            $href = (($t['id'] ?? '') === 'drop-cars') ? '/' : '/' . $slug;
            $themePanelLinks .= "<a href='{$href}' class='footer__theme-link {$activeClass}'>{$name}</a>";
        }
        $themeDisplayName = htmlspecialchars($this->theme['name'] ?? 'Drop Taxi', ENT_QUOTES, 'UTF-8');
        $destThemeQs = ($activeSlug !== 'drop-cars') ? ('?' . http_build_query(['theme' => $activeSlug])) : '';

        $displayPhone = $this->config['company']['phone'] ?? $this->config['supportPhone'] ?? '7598899579';
        $functionalPhone = $this->config['company']['functional_phone'] ?? $this->config['functionalPhone'] ?? '7200217986';
        $displayPhoneClean = preg_replace('/\D/', '', $displayPhone);
        $functionalPhoneClean = preg_replace('/\D/', '', $functionalPhone);

        if (strlen($displayPhoneClean) === 10) {
            $phoneDisplay = '+91 ' . $displayPhoneClean;
        } else {
            $phoneDisplay = ($displayPhoneClean ? '+' . $displayPhoneClean : '+91 7598899579');
        }
        $phoneHref = 'tel:+' . (strlen($functionalPhoneClean) === 10 ? '91' . $functionalPhoneClean : $functionalPhoneClean);

        $enableWhatsApp = $this->config['enableWhatsAppWidget'] ?? true;
        $logoMarkup = $this->getLogoMarkup();
        $footerHtml = "
    <footer class='site-footer' id='contact'>
      <div class='container footer__top'>
        <div class='footer__branding'>
          <a href='{$homeLink}' class='logo footer__logo' style='text-decoration:none;'>{$logoMarkup}</a>
          <p class='footer__description'>We provide comfortable taxi services focused on safety, punctuality, customer satisfaction, and smooth travel across cities and destinations.</p>
        </div>
        <div class='footer__engage'>
          <div class='footer__newsletter'>
            <p class='footer__engage-title'>Subscribe To Newsletter</p>
            <form class='newsletter-form' onsubmit='event.preventDefault(); alert(\"Thank you for subscribing!\");'>
              <input type='email' placeholder='Enter your email address' required>
              <button type='submit'>Subscribe</button>
            </form>
          </div>
            <div class='footer__social'>
            <p class='footer__engage-title'>Follow Us</p>
            <div class='social-links'>
              <a href='https://www.facebook.com/dropcars' target='_blank' rel='noopener' aria-label='Facebook' class='social-link'><svg viewBox='0 0 24 24' width='20' height='20' fill='currentColor'><path d='M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z'/></svg></a>
              <a href='https://twitter.com/dropcars' target='_blank' rel='noopener' aria-label='Twitter' class='social-link'><svg viewBox='0 0 24 24' width='20' height='20' fill='currentColor'><path d='M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z'/></svg></a>
              <a href='https://www.instagram.com/dropcars' target='_blank' rel='noopener' aria-label='Instagram' class='social-link'><svg viewBox='0 0 24 24' width='20' height='20' fill='currentColor'><path d='M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z'/></svg></a>
              <a href='https://www.youtube.com/dropcars' target='_blank' rel='noopener' aria-label='YouTube' class='social-link'><svg viewBox='0 0 24 24' width='20' height='20' fill='currentColor'><path d='M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z'/></svg></a>
            </div>
          </div>
        </div>
      </div>

      <div class='container'>
        <hr class='footer__divider'>
      </div>

      <div class='container footer__main-grid'>
        <!-- Contact Column -->
        <div class='footer__column'>
          <p class='footer__col-title'>Contact Us</p>
          <ul class='footer__contact-details'>
            <li><span class='icon'>📍</span><span>136, Chengam Road, Tiruvannamalai</span></li>
            <li><span class='icon'>📞</span> <a href='{$phoneHref}'>{$phoneDisplay}</a></li>
            <li><span class='icon'>✉️</span> <a href='mailto:support@dropcars.in'>support@dropcars.in</a></li>
            <li class='footer__coverage'>All Over South India</li>
          </ul>
        </div>
        
        <!-- Quick Menu -->
        <div class='footer__column'>
          <p class='footer__col-title'>Quick Menu</p>
          <ul class='footer__nav-links'>
            <li><a href='{$homeLink}'>Home</a></li>
            <li><a href='{$bookNowUrl}'>Book a Trip</a></li>
            <li><a href='{$secServicesUrl}'>Services</a></li>
            <li><a href='{$secAboutUrl}'>About Us</a></li>
            <li><a href='{$contactLink}'>Contact Us</a></li>
            <li><a href='/pages/track-booking.php'>Track Booking</a></li>
          </ul>
        </div>

        <!-- Services -->
        <div class='footer__column'>
          <p class='footer__col-title'>Services</p>
          <ul class='footer__nav-links'>
            <li><a href='{$bookNowUrl}?trip_type=one_way'>Oneway Trip</a></li>
            <li><a href='{$airportTransferUrl}'>Airport Transfers</a></li>
            <li><a href='{$bookNowUrl}?trip_type=hourly_rental'>Hourly Rental</a></li>
            <li><a href='{$bookNowUrl}?trip_type=round_trip'>Outstation Rental</a></li>
            <li><a href='{$bookNowUrl}?trip_type=multi_city'>Corporate Booking</a></li>
          </ul>
        </div>

        <!-- Popular Destinations -->
        <div class='footer__column footer__column--wide'>
          <p class='footer__col-title'>Popular Destinations</p>
          <div class='footer__destinations-grid'>
            <div class='footer__dest-col'>
              <a class='footer__dest-link' href='{$destChennai}'>↗ Chennai {$themeDisplayName}</a>
              <a class='footer__dest-link' href='{$destTrichy}'>↗ Trichy {$themeDisplayName}</a>
              <a class='footer__dest-link' href='{$destCoimbatore}'>↗ Coimbatore {$themeDisplayName}</a>
              <a class='footer__dest-link' href='{$destMadurai}'>↗ Madurai {$themeDisplayName}</a>
              <a class='footer__dest-link' href='{$destSalem}'>↗ Salem {$themeDisplayName}</a>
            </div>
            <div class='footer__dest-col'>
              <a class='footer__dest-link' href='{$destTirunelveli}'>↗ Tirunelveli {$themeDisplayName}</a>
              <a class='footer__dest-link' href='{$destErode}'>↗ Erode {$themeDisplayName}</a>
              <a class='footer__dest-link' href='{$destTiruppur}'>↗ Tiruppur {$themeDisplayName}</a>
              <a class='footer__dest-link' href='{$destBangalore}'>↗ Bengaluru {$themeDisplayName}</a>
              <a class='footer__dest-link' href='{$destPondicherry}'>↗ Puducherry {$themeDisplayName}</a>
            </div>
          </div>
        </div>
      </div>

      <div class='container'>
         <hr class='footer__divider'>
      </div>

      <div class='container footer__bottom-bar'>
        <p class='footer__copyright'>© {$year} <span class='footer__brand-text'>{$navBrandLabel}</span> All Rights Reserved.</p>
        <p class='footer__attribution'>Developed by <a href='/developer'>Naveen Rajendran</a></p>
      </div>
    </footer>";

        if ($enableWhatsApp) {
            $footerHtml .= $this->whatsappWidgetAssets();
        }

        return $footerHtml;
    }

    public function renderScripts() {
        $envFile = __DIR__ . '/../config/env.php';
        if (is_file($envFile) && !defined('GOOGLE_MAPS_API_KEY')) {
            require_once $envFile;
        }
        $mapsKey = '';
        if (defined('GOOGLE_MAPS_API_KEY') && (string)GOOGLE_MAPS_API_KEY !== '') {
            $mapsKey = (string) GOOGLE_MAPS_API_KEY;
        } else {
            $fromEnv = getenv('GOOGLE_MAPS_API_KEY');
            if ($fromEnv !== false && $fromEnv !== '') {
                $mapsKey = (string) $fromEnv;
            }
        }
        $mapsKeyJs = htmlspecialchars($mapsKey, ENT_QUOTES, 'UTF-8');
        $mapsKeyUrl = rawurlencode($mapsKey);
        $config = @file_get_contents(__DIR__ . '/../data/config.json') ?: '{}';
        
        $enableWhatsApp = $this->config['enableWhatsAppWidget'] ?? true;
        $enableFloatingEstimates = $this->config['enableFloatingEstimates'] ?? true;
        $enableSuccessConfetti = $this->config['enableSuccessConfetti'] ?? true;
        
        $enableGoogleMapsApi = $this->config['enableGoogleMapsApi'] ?? true;
        $enableSessionTokens = $this->config['enableSessionTokens'] ?? true;
        $enableLocalLocationFallback = $this->config['enableLocalLocationFallback'] ?? true;
        $enableAirportQuickSelector = $this->config['enableAirportQuickSelector'] ?? true;
        $enableOsmGeocodingProxy = $this->config['enableOsmGeocodingProxy'] ?? true;
        $enableRecentLocationsHistory = $this->config['enableRecentLocationsHistory'] ?? true;
        $recentLocationsLimit = (int)($this->config['recentLocationsLimit'] ?? 5);
        $enableGpsCurrentLocation = $this->config['enableGpsCurrentLocation'] ?? true;
        $enableStateBorderDetection = $this->config['enableStateBorderDetection'] ?? true;
        $enablePrefilledRouteGeocoding = $this->config['enablePrefilledRouteGeocoding'] ?? true;
        $enableShareRouteButton = $this->config['enableShareRouteButton'] ?? false;
        $distanceEngine = $this->config['distanceEngine'] ?? 'osrm';

        $mapsApiScript = ($enableGoogleMapsApi && $mapsKey !== '')
            ? "<script async defer src='https://maps.googleapis.com/maps/api/js?key={$mapsKeyUrl}&libraries=places&loading=async'></script>\n    "
            : '';
            
        $bp = function_exists('dropcars_base_path') ? dropcars_base_path() : '';
        $bp = rtrim($bp, '/');
        $jsDir = __DIR__ . '/../assets/js/';
        $vkV = @filemtime($jsDir . 'viewport-keyboard.js') ?: 1;
        $emV = @filemtime($jsDir . 'error-monitor.js') ?: 1;
        $uiV = @filemtime($jsDir . 'ui-controls.js') ?: 1;
        $bfV = @filemtime($jsDir . 'booking-form.js') ?: 1;
        $pcV = @filemtime($jsDir . 'phone-country.js') ?: 1;
        $miV = @filemtime($jsDir . 'maps-integration.js') ?: 1;
        $lpV = @filemtime($jsDir . 'location-picker.js') ?: 1;
        $asbV = @filemtime($jsDir . 'auto-scroll-booking.js') ?: 1;
        // Rate/fare-affecting scripts - versioned so an admin rate-formula
        // change (or the data/config.json values embedded via config.js)
        // reaches every visitor immediately instead of waiting out a stale
        // browser cache, same pattern already used for the scripts above.
        $cfgV = @filemtime($jsDir . 'config.js') ?: 1;
        $fcV = @filemtime($jsDir . 'fare-calculator.js') ?: 1;
        $configJsonV = @filemtime(__DIR__ . '/../data/config.json') ?: 1;
        // Bump config.js's own cache-bust key whenever the underlying rate
        // data changes too, even if config.js's code hasn't - the browser
        // needs a new URL to know to re-fetch either way.
        $cfgV = max($cfgV, $configJsonV);
        $scripts = "
    <script>
        window.DROP_CARS_DISTANCES = window.DROP_CARS_DISTANCES || {};
        window.DROP_CARS_CONFIG = {$config};
        window.DROP_CARS_UX = " . json_encode([
            'enableWhatsApp' => $enableWhatsApp,
            'enableFloatingEstimates' => $enableFloatingEstimates,
            'enableSuccessConfetti' => $enableSuccessConfetti,
            'enableGoogleMapsApi' => $enableGoogleMapsApi,
            'enableSessionTokens' => $enableSessionTokens,
            'enableLocalLocationFallback' => $enableLocalLocationFallback,
            'enableAirportQuickSelector' => $enableAirportQuickSelector,
            'enableOsmGeocodingProxy' => $enableOsmGeocodingProxy,
            'enableRecentLocationsHistory' => $enableRecentLocationsHistory,
            'recentLocationsLimit' => $recentLocationsLimit,
            'enableGpsCurrentLocation' => $enableGpsCurrentLocation,
            'enableStateBorderDetection' => $enableStateBorderDetection,
            'enablePrefilledRouteGeocoding' => $enablePrefilledRouteGeocoding,
            'enableShareRouteButton' => $enableShareRouteButton,
            'distanceEngine' => $distanceEngine
        ]) . ";
        // API key is server-side only — not exposed to browser window object
    </script>
    <script src='{$bp}/assets/js/error-monitor.js?v={$emV}'></script>
    <script defer src='{$bp}/assets/js/viewport-keyboard.js?v={$vkV}'></script>
    {$mapsApiScript}<script defer src='{$bp}/assets/js/config.js?v={$cfgV}'></script>
    <script defer src='{$bp}/assets/js/fare-calculator.js?v={$fcV}'></script>
    <script defer src='{$bp}/assets/js/location-picker.js?v={$lpV}'></script>
    <script defer src='{$bp}/assets/js/maps-integration.js?v={$miV}'></script>
    <script defer src='{$bp}/assets/js/route-loader.js'></script>
    <script defer src='{$bp}/assets/js/ui-controls.js?v={$uiV}'></script>
    <script defer src='{$bp}/assets/js/phone-country.js?v={$pcV}'></script>
    <script defer src='{$bp}/assets/js/booking-form.js?v={$bfV}'></script>
    <script defer src='{$bp}/assets/js/main.js'></script>
    <script defer src='{$bp}/assets/js/route-explorer.js'></script>
    <script defer src='{$bp}/assets/js/theme-switcher.js'></script>
    <script defer src='{$bp}/assets/js/auto-scroll-booking.js?v={$asbV}'></script>";

        if ($enableWhatsApp) {
            // Inject widget CSS + JS once (renderFooter may have already done so).
            $scripts .= $this->whatsappWidgetAssets();
        }
        
        if ($enableSuccessConfetti && basename($_SERVER['PHP_SELF']) === 'thank-you.php') {
            $scripts .= "\n    <script src='https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js'></script>";
        }

        // Security: disable right-click, DevTools shortcuts on all public pages
        $protectionFile = __DIR__ . '/../includes/frontend-protection.php';
        if (is_file($protectionFile)) {
            ob_start();
            $adminMode = false;
            require $protectionFile;
            $scripts .= ob_get_clean();
        }

        return $scripts;
    }
}

