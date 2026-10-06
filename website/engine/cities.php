<?php
/**
 * Dedicated Cities & Routes SEO Hub Page for Drop Cars
 * Optimized for Google Ads conversions and perfect search crawling link-graph.
 */
require_once __DIR__ . '/../includes/check-blocked-main.php';
require_once __DIR__ . '/../includes/paths.php';
require_once __DIR__ . '/seo-core.php';
require_once __DIR__ . '/shell.php';
require_once __DIR__ . '/content-blocks.php';
require_once __DIR__ . '/theme-seo.php';
if (!defined('DROP_CARS_DB_OPTIONAL')) define('DROP_CARS_DB_OPTIONAL', true);
require_once __DIR__ . '/../admin/config/database.php';
require_once __DIR__ . '/../includes/customer-prefill.php';
$_pfPdo = (isset($pdo) && $pdo instanceof PDO) ? $pdo : (isset($GLOBALS['db']) && $GLOBALS['db'] instanceof PDO ? $GLOBALS['db'] : null);
[$_pfName, $_pfEmail, $_pfNational, , $_pfCC] = dropcars_customer_prefill($_pfPdo);
$custCountryCode = $_pfCC;
$custNationalPhone = $_pfNational;

$seo = new SEOCore();

$themeSlug = trim((string) ($_GET['theme'] ?? 'drop-cars'));
$themesPath = __DIR__ . '/../data/themes.json';
$allThemes = is_file($themesPath) ? json_decode(file_get_contents($themesPath), true) : [];
$activeTheme = null;
foreach ($allThemes as $theme) {
    if (($theme['slug'] ?? '') === $themeSlug || ($theme['id'] ?? '') === $themeSlug) {
        $activeTheme = $theme;
        break;
    }
}
if (!$activeTheme) {
    $activeTheme = ['id' => 'drop-cars', 'name' => 'Drop Cars', 'slug' => 'drop-cars'];
}

$activeTheme = dropcars_merge_theme_seo($activeTheme);
$contentBlocks = new ContentBlocks($activeTheme);
$themeName = $activeTheme['name'];
$shell = new UIShell($activeTheme, $allThemes);

$configPath = __DIR__ . '/../data/config.json';
$configData = is_file($configPath) ? json_decode(file_get_contents($configPath), true) : [];
$fares = $configData['fares'] ?? [];
if (!function_exists('get_home_rate')) {
    function get_home_rate($vehicle, $tripType = 'oneway') {
        global $fares;
        $key = ($tripType === 'oneway') ? 'baseFareOneWay' : 'baseFareRoundTrip';
        if (isset($fares[$key][$vehicle])) {
            return (int) $fares[$key][$vehicle];
        }
        $fallbacks = [
            'oneway' => [
                'SEDAN' => 14,
                'COMFORT_SEDAN' => 15,
                'ELITE_SEDAN' => 16,
                'SUV' => 19,
                'INNOVA' => 20,
                'CRYSTA' => 23
            ],
            'round' => [
                'SEDAN' => 13,
                'COMFORT_SEDAN' => 14,
                'ELITE_SEDAN' => 15,
                'SUV' => 18,
                'INNOVA' => 18,
                'CRYSTA' => 21
            ]
        ];
        return $fallbacks[$tripType === 'oneway' ? 'oneway' : 'round'][$vehicle] ?? 0;
    }
}

$title = "Outstation Taxi & Drop Cab Cities | Drop Cars";
$description = "Explore 100+ cities served by Drop Cars in Tamil Nadu, Bangalore, Kerala & AP. Book affordable one-way cabs with transparent pricing.";

$linkThemeSlug = $activeTheme['slug'] ?? $themeSlug;
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="<?php echo htmlspecialchars($description, ENT_QUOTES, 'UTF-8'); ?>" />
    <meta name="keywords" content="cities, drop taxi cities, outstation cab routes, Tamil Nadu taxi" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="<?php echo htmlspecialchars(dropcars_canonical_request_url(), ENT_QUOTES, 'UTF-8'); ?>" />
    <title><?php echo htmlspecialchars($title, ENT_QUOTES, 'UTF-8'); ?></title>

    <!-- Schema Structured Data -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "TaxiService",
      "name": "<?php echo htmlspecialchars($themeName, ENT_QUOTES, 'UTF-8'); ?> Hubs",
      "description": "<?php echo htmlspecialchars($description, ENT_QUOTES, 'UTF-8'); ?>",
      "url": "<?php echo htmlspecialchars(dropcars_canonical_request_url(), ENT_QUOTES, 'UTF-8'); ?>",
      "provider": {
        "@type": "LocalBusiness",
        "name": "Drop Cars",
        "telephone": "+917598899579",
        "priceRange": "₹₹"
      },
      "areaServed": [
        {"@type": "State", "name": "Tamil Nadu"},
        {"@type": "State", "name": "Pondicherry"},
        {"@type": "State", "name": "Andhra Pradesh"},
        {"@type": "State", "name": "Karnataka"},
        {"@type": "State", "name": "Kerala"}
      ]
    }
    </script>

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    
    <link rel="stylesheet" href="/assets/css/base.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/base.css'); ?>" />
    <link rel="stylesheet" href="/assets/css/layout.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/layout.css'); ?>" />
    <link rel="stylesheet" href="/assets/css/navbar.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/navbar.css'); ?>" />
    <link rel="stylesheet" href="/assets/css/hero.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/hero.css'); ?>" />
    <link rel="stylesheet" href="/assets/css/booking-form.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/booking-form.css'); ?>" />
    <link rel="stylesheet" href="/assets/css/vehicle-section.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/vehicle-section.css'); ?>" />
    <link rel="stylesheet" href="/assets/css/city-routes.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/city-routes.css'); ?>" />
    <link rel="stylesheet" href="/assets/css/footer.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/footer.css'); ?>" />
    <link rel="stylesheet" href="/assets/css/responsive.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/responsive.css'); ?>" />
    <link rel="stylesheet" href="/assets/css/whatsapp.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/whatsapp.css'); ?>" />
    <link rel="stylesheet" href="/assets/css/dark-mode.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/dark-mode.css'); ?>" />
    <link rel="stylesheet" href="/assets/css/light-theme.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/light-theme.css'); ?>" />
    <?php if (($activeTheme['slug'] ?? '') === 'airport-taxi'): ?>
    <link rel="stylesheet" href="/assets/css/theme-airporttaxi.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/theme-airporttaxi.css'); ?>">
    <?php endif; ?>
    <link rel="stylesheet" href="/assets/css/stats-strip.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/stats-strip.css'); ?>">
    <script src="/assets/js/dark-mode.js?v=<?php echo @filemtime(__DIR__.'/../assets/js/dark-mode.js'); ?>"></script>
    <script>window.DROP_CARS_BASE_PATH = <?php echo json_encode(dropcars_base_path(), JSON_HEX_TAG | JSON_HEX_AMP); ?>;</script>
    <script>
    window.DROP_CARS_THEME_SLUG = <?php echo json_encode($linkThemeSlug, JSON_HEX_TAG | JSON_HEX_AMP); ?>;
    </script>

    <style>
        .cities-hero {
            background: url("/assets/img/hero-bg.jpg") center/cover no-repeat;
            padding: 1rem 0;
            position: relative;
            overflow: hidden;
            color: var(--white);
        }
        .cities-hero::before {
            content: "";
            position: absolute;
            inset: 0;
            background: rgba(11, 31, 58, 0.72);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            z-index: 1;
        }
        .cities-hero__content {
            position: relative;
            z-index: 3;
        }
        .breadcrumbs {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            margin-bottom: 1rem;
            font-size: 0.9rem;
            opacity: 0.8;
        }
        @media (min-width: 992px) {
            .breadcrumbs { justify-content: flex-start; }
            .hero__copy { text-align: left !important; }
        }
        .breadcrumbs a { color: var(--white); text-decoration: none; }
        .breadcrumbs span { color: rgba(255,255,255,0.5); }

        .cities-hero h1 {
            color: var(--white);
            font-size: clamp(2.2rem, 5vw, 3rem);
            margin-bottom: 0.75rem;
            font-weight: 800;
            letter-spacing: -0.03em;
        }
        .hero__layout {
            display: grid;
            grid-template-columns: 1fr;
            gap: 2.5rem;
            align-items: center;
            text-align: center;
        }
        @media (min-width: 992px) {
            .hero__layout { grid-template-columns: 1fr 1.1fr; gap: 4rem; text-align: left; }
        }

        /* Cities Hub Grid Styling */
        .cities-hub-section {
            padding: 5rem 0;
            background: #f8fafc;
        }
        .cities-hub-title {
            text-align: center;
            margin-bottom: 3.5rem;
        }
        .cities-hub-title h2 {
            font-size: clamp(1.8rem, 4vw, 2.5rem);
            font-weight: 800;
            color: #0f172a;
            letter-spacing: -0.02em;
        }
        .cities-hub-title p {
            color: #64748b;
            margin-top: 0.75rem;
            font-size: 1.1rem;
        }

        .cities-hub-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 1.75rem;
            max-width: 1100px;
            margin: 0 auto;
        }

        /* ── Enhanced City Card ── */
        .city-accordion-card {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 20px;
            overflow: hidden;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
            transition: all 0.3s ease;
        }
        .city-accordion-card:hover {
            box-shadow: 0 16px 30px -8px rgba(0, 0, 0, 0.1), 0 4px 8px -2px rgba(14, 165, 233, 0.08);
            border-color: rgba(14, 165, 233, 0.3);
            transform: translateY(-2px);
        }

        /* Header = two columns: city-info (left) + toggle (right) */
        .city-accordion-header {
            display: flex;
            align-items: stretch;
            cursor: pointer;
            background: #ffffff;
            user-select: none;
            transition: background-color 0.2s ease;
            gap: 0;
        }
        .city-accordion-header:hover {
            background: #f8fafc;
        }

        /* Left: city image thumbnail */
        .city-card-thumb {
            width: 130px;
            flex-shrink: 0;
            position: relative;
            overflow: hidden;
        }
        .city-card-thumb img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
            transition: transform 0.4s ease;
        }
        .city-accordion-card:hover .city-card-thumb img {
            transform: scale(1.06);
        }
        .city-card-thumb-overlay {
            position: absolute;
            inset: 0;
            background: linear-gradient(to right, transparent 55%, rgba(255,255,255,0.12));
        }

        /* Middle: city info block */
        .city-card-info {
            flex: 1;
            padding: 1.35rem 1.25rem;
            display: flex;
            flex-direction: column;
            justify-content: center;
            gap: 0.45rem;
            min-width: 0;
        }
        .city-card-meta {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 0.5rem;
        }
        .city-card-info h3 {
            font-size: 1.2rem;
            font-weight: 700;
            color: #0f172a;
            line-height: 1.2;
            margin: 0;
        }
        .city-card-info h3 a {
            color: inherit;
            text-decoration: none;
            transition: color 0.2s;
        }
        .city-card-info h3 a:hover {
            color: var(--blue);
        }
        .city-card-desc {
            font-size: 0.84rem;
            color: #64748b;
            line-height: 1.5;
            margin: 0;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        .city-state-tag {
            font-size: 0.7rem;
            font-weight: 600;
            background: #f1f5f9;
            color: #475569;
            padding: 2px 8px;
            border-radius: 999px;
            white-space: nowrap;
        }
        .city-airport-tag {
            font-size: 0.7rem;
            font-weight: 600;
            background: rgba(14, 165, 233, 0.08);
            color: var(--blue);
            padding: 2px 8px;
            border-radius: 999px;
            white-space: nowrap;
        }

        /* Right: toggle/chevron column */
        .city-card-toggle {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 0.45rem;
            padding: 1.25rem 1.1rem;
            border-left: 1px solid #f1f5f9;
            min-width: 72px;
            background: transparent;
        }
        .city-route-badge {
            font-size: 0.68rem;
            font-weight: 700;
            background: rgba(14, 165, 233, 0.1);
            color: var(--blue);
            padding: 3px 8px;
            border-radius: 999px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            white-space: nowrap;
            text-align: center;
        }
        .city-accordion-icon {
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            background: #f1f5f9;
            color: #64748b;
            transition: all 0.3s ease;
            flex-shrink: 0;
        }
        .city-accordion-card.active .city-accordion-icon {
            transform: rotate(180deg);
            background: var(--blue);
            color: #ffffff;
        }
        .city-accordion-card.active .city-card-toggle {
            border-left-color: rgba(14,165,233,0.15);
        }

        /* Routes content panel */
        .city-accordion-content {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.45s cubic-bezier(0.4, 0, 0.2, 1);
            background: #ffffff;
            border-top: 1px solid transparent;
        }
        .city-accordion-card.active .city-accordion-content {
            border-top: 1px solid #f1f5f9;
        }
        .city-routes-inner {
            padding: 1.25rem 1.5rem 1.5rem;
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
            gap: 0.75rem;
        }
        .city-route-link {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            color: #475569;
            font-size: 0.875rem;
            text-decoration: none;
            padding: 0.55rem 0.75rem;
            border-radius: 10px;
            background: #f8fafc;
            border: 1px solid #f1f5f9;
            transition: all 0.2s ease;
        }
        .city-route-link:hover {
            background: rgba(14, 165, 233, 0.05);
            border-color: rgba(14, 165, 233, 0.25);
            color: var(--blue);
            transform: translateX(3px);
        }
        .city-route-link svg {
            color: #94a3b8;
            flex-shrink: 0;
            transition: color 0.2s;
        }
        .city-route-link:hover svg {
            color: var(--blue);
        }

        /* Responsive: collapse image on very small screens */
        @media (max-width: 480px) {
            .city-card-thumb { width: 90px; }
            .city-card-info { padding: 1rem 0.9rem; }
            .city-card-desc { -webkit-line-clamp: 1; }
            .city-card-toggle { padding: 1rem 0.75rem; min-width: 58px; }
        }
    </style>
<?php include __DIR__ . '/../includes/google-tag.php'; ?>
</head>
<body class="cities-page city-page <?php echo ($activeTheme['slug'] ?? '') === 'airport-taxi' ? ('theme-airporttaxi ' . (function_exists('dropcars_is_native_airporttaxi_host') && dropcars_is_native_airporttaxi_host() ? 'ati-native' : 'ati-embedded')) : ''; ?>" data-active-theme-id="<?php echo htmlspecialchars($activeTheme['id'] ?? $themeSlug, ENT_QUOTES, 'UTF-8'); ?>">
    <?php echo $shell->renderHeader(); ?>

         <section class="cities-hero hero" id="booking">
            <!-- Background Image Slideshow -->
            <div class="hero-slider">
                <div class="hero-slide active">
                    <div class="hero-slide__bg" style="background-image: url('/assets/img/hero-slide-1.png');"></div>
                </div>
                <div class="hero-slide">
                    <div class="hero-slide__bg" style="background-image: url('/assets/img/hero-slide-2.png');"></div>
                </div>
                <div class="hero-slide">
                    <div class="hero-slide__bg" style="background-image: url('/assets/img/hero-slide-4.png');"></div>
                </div>
                <div class="hero-slide">
                    <div class="hero-slide__bg" style="background-image: url('/assets/img/hero-slide-3.png');"></div>
                </div>
                <div class="hero-slide">
                    <div class="hero-slide__bg" style="background-image: url('/assets/img/hero-slide-5.png');"></div>
                </div>
            </div>

            <div class="container hero__layout">
                <div class="hero__copy">
                    <!-- Text Slideshow -->
                    <div class="hero-slider-text">
                        <div class="hero-text-slide active">
                            <div class="hero__eyebrow">✦ <?php echo htmlspecialchars($themeName); ?> Directory</div>
                            <h1><?php echo htmlspecialchars($title); ?></h1>
                            <p class="hero__sub"><?php echo htmlspecialchars($description); ?></p>
                        </div>
                        <div class="hero-text-slide">
                            <div class="hero__eyebrow">✦ South India Taxi Network</div>
                            <h1>Book <?php echo htmlspecialchars($themeName); ?> Across 120+ Cities &amp; Routes</h1>
                            <p class="hero__sub">Explore active intercity routes across Tamil Nadu, Pondicherry, Karnataka &amp; Kerala. Calculate instant transparent fares for one-way drops and outstation cabs.</p>
                        </div>
                        <div class="hero-text-slide">
                            <div class="hero__eyebrow">✦ 24/7 Airport Transfers</div>
                            <h1>Airport Drop Taxi &amp; Hourly Local Cab Rental</h1>
                            <p class="hero__sub">Punctual airport transfers connecting Chennai, Bangalore, Coimbatore &amp; Trichy airports with fixed rates, zero waiting fees, and verified drivers.</p>
                        </div>
                        <div class="hero-text-slide">
                            <div class="hero__eyebrow">✦ Transparent Billing</div>
                            <h1>Lowest One-Way Drop Taxi Fares in South India</h1>
                            <p class="hero__sub">Pay only for the distance traveled. Clear fare calculations with toll, driver bata, and state permits transparently itemized with instant GST receipts.</p>
                        </div>
                    </div>


                </div>
                


                <div class="hero__booking-col">
                    <div style="margin-bottom: 0.5rem; display: flex; justify-content: center; align-items: center; width: 100%;">
                        <span id="booking-form-dynamic-title" class="airport-top-badge" style="display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: #ffffff; padding: 6px 14px; border-radius: 20px; font-size: 0.82rem; font-weight: 700; box-shadow: none; text-shadow: none; cursor: pointer; transition: all 0.3s ease;" onclick="if(window.DropCarsScrollToBookingForm){window.DropCarsScrollToBookingForm(true);}else{document.getElementById('booking-form').scrollIntoView({behavior:'smooth'});}">
                            🚖 Book Drop Taxi
                        </span>
                    </div>

                    <div class="booking-card booking-card--home" aria-label="<?php echo htmlspecialchars($themeName); ?> booking form">
                        <form id="booking-form" class="booking-form">
                            <div class="trip-type-block">
                                <label class="field trip-type-field">
                                    <select name="serviceType" id="service-type" class="visually-hidden" tabindex="-1" aria-hidden="true" required>
                                        <option value="one_way">Drop Taxi</option>
                                        <option value="multi_city">Multi City</option>
                                        <option value="airport_transfer">Airport Transfer</option>
                                        <option value="round_trip">Round Trip</option>
                                        <option value="hourly_rental">Local Rental</option>
                                    </select>
                                    <div class="trip-type-options fare-toggle__switch" role="group" aria-label="Trip type">
                                        <button type="button" class="trip-type-option trip-type-option--active" data-type="one_way">One-Way</button>
                                        <button type="button" class="trip-type-option" data-type="round_trip">Round Trip</button>
                                        <button type="button" class="trip-type-option" data-type="hourly_rental">Local</button>
                                    </div>
                                </label>
                                <div class="oneway-subtypes fare-toggle__switch">
                                    <input type="radio" name="oneway_subtype" id="subtype-oneway" value="one_way" checked />
                                    <label for="subtype-oneway">Outstation</label>
                                    <input type="radio" name="oneway_subtype" id="subtype-airport" value="airport_transfer" />
                                    <label for="subtype-airport">Airport</label>
                                    <input type="radio" name="oneway_subtype" id="subtype-multicity" value="multi_city" />
                                    <label for="subtype-multicity">Multi City</label>
                                </div>
                            </div>

                            <!-- Layout: Locations and Date/Time First (Matching live site) -->
                            <div id="locations-wrapper" style="position: relative; width: 100%; display: flex; flex-direction: column; gap: 0.5rem;">
                                <label class="field" id="pickup-field-container">
                                    <span id="pickup-label-text">Pick Up Location *</span>
                                    <div style="position: relative; width: 100%;">
                                        <input type="text" name="pickup" id="pickup" placeholder="Pick Up Location" required style="padding-right: 35px;" />
                                        <button type="button" class="detect-location-btn" title="Use current location" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #0284c7; display: flex; align-items: center; justify-content: center; padding: 0; z-index: 10;">
                                            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>
                                        </button>
                                    </div>
                                </label>

                                <div id="swap-btn-container" class="hidden" style="display: none; justify-content: center; z-index: 10; position: relative;">
                                    <button type="button" id="airport-swap-btn" style="background: linear-gradient(135deg, var(--blue-light) 0%, var(--blue) 100%); border: 3px solid var(--white); border-radius: 50%; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 10px rgba(14, 165, 233, 0.35); transition: transform 0.3s ease, box-shadow 0.3s ease;" onmouseover="this.style.transform='scale(1.08) rotate(180deg)';" onmouseout="this.style.transform='scale(1) rotate(0deg)';" aria-label="Swap Locations">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v10"/><path d="M11 16l-4 4-4-4"/><path d="M17 14V4"/><path d="M21 8l-4-4-4 4"/></svg>
                                    </button>
                                </div>

                                <div class="stops-control hidden" id="stops-control">
                                    <div class="stops-control__header">
                                        <p id="stops-note" style="margin: 0; font-weight: 600; font-size: 0.8rem;">Add optional stops between pickup and drop.</p>
                                        <button type="button" id="add-stop" class="btn-chips">+ Add Stop</button>
                                    </div>
                                    <div class="stops-list" id="stops-list"></div>
                                    <p class="stops-limit" style="margin: 0; font-size: 0.75rem; color: var(--gray-400);">Up to 10 stops • reorder with the ▲/▼ buttons</p>
                                </div>

                                <label class="field" id="drop-field">
                                    <span id="drop-label-text">Drop Location *</span>
                                    <input type="text" name="drop" id="drop" placeholder="Drop Location" required />
                                </label>
                            </div>

                            <div class="field-pair">
                                <label class="field">
                                    <span>Start Date *</span>
                                    <input type="date" name="date" required value="<?php echo date('Y-m-d'); ?>" />
                                </label>
                                <label class="field">
                                    <span>Pick-up Time *</span>
                                    <input type="time" name="time" required />
                                </label>
                            </div>

                            <!-- Layout: Contact Info Second -->
                            <div class="field-pair field-pair--contact-primary contact-step-hidden">
                                <label class="field">
                                    <span>Name *</span>
                                    <input type="text" name="customerName" placeholder="Your Name" value="<?php echo htmlspecialchars($_pfName, ENT_QUOTES, 'UTF-8'); ?>" required />
                                </label>
                                <div class="field">
                                    <div class="field__label-row">
                                        <span>Phone *</span>
                                        <label class="wa-check-label" style="display: flex; align-items: center; gap: 0.35rem; margin: 0; font-size: 0.8125rem; font-weight: 600; color: var(--blue-dark); cursor: pointer;">
                                            <span class="wa-label-icon" aria-hidden="true"><svg viewBox="0 0 32 32" width="18" height="18" fill="#25D366"><path d="M16 3C9.4 3 4 8.4 4 15c0 2.4.7 4.7 1.9 6.7L4 29l7.5-1.9A13 13 0 0 0 16 27c6.6 0 12-5.4 12-12S22.6 3 16 3Zm0 22.5c-2 0-4-.6-5.6-1.7l-.4-.2-4.4 1.1 1.2-4.3-.3-.4A10 10 0 1 1 26 15c0 5.5-4.5 10-10 10Zm6-7.4c-.3-.2-1.7-.8-2-.9s-.5-.2-.7.2c-.2.3-.8 1-1 1.2-.2.3-.4.2-.7.1-2-.8-3.2-2.6-3.4-3-.2-.3 0-.4.2-.6l.5-.6c.2-.2.2-.3.3-.5s0-.4 0-.6c0-.2-.7-1.8-1-2.5-.2-.6-.5-.6-.7-.6h-.6c-.2 0-.5.1-.7.3-.2.3-1 1-1 2.4s1 2.8 1.2 3.1c.1.2 2 3.3 5 4.6.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.1-1.4s-.3-.2-.6-.4Z"/></svg></span>
                                            <input type="checkbox" id="use-whatsapp-check" checked style="margin: 0; width: 14px; height: 14px; accent-color: var(--blue);" aria-label="Use WhatsApp for contact" />
                                        </label>
                                    </div>
                                    <div class="phone-input-wrapper phone-input-wrapper--country">
                                        <div class="country-code-field" data-cc-default="+91">
                                            <input type="hidden" name="countryCode" id="country-code-hidden" value="<?php echo htmlspecialchars($_pfCC, ENT_QUOTES, 'UTF-8'); ?>" />
                                            <button type="button" class="country-code-trigger" id="country-code-trigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="country-code-popover" title="Country code"><?php echo htmlspecialchars($_pfCC, ENT_QUOTES, 'UTF-8'); ?></button>
                                            <div id="country-code-popover" class="country-code-popover is-hidden" role="dialog" aria-label="Choose or type country code">
                                                <button type="button" class="country-code-option" data-code="+91">+91</button>
                                                <input type="text" class="country-code-manual-inline" id="country-code-manual-input" inputmode="tel" autocomplete="off" maxlength="12" placeholder="" aria-label="Type country code e.g. +65" />
                                            </div>
                                        </div>
                                        <input type="tel" name="contactPhone" placeholder="9876543210" id="contact-phone" class="phone-national-input" inputmode="numeric" pattern="[0-9]*" maxlength="10" autocomplete="tel" value="<?php echo htmlspecialchars($_pfNational, ENT_QUOTES, 'UTF-8'); ?>" required />
                                    </div>
                                </div>
                            </div>

                            <div class="field-pair field-pair--contact-second contact-step-hidden" id="whatsapp-extra-row">
                                <div class="field hidden" id="whatsapp-field">
                                    <span>WhatsApp Number *</span>
                                    <div class="phone-input-wrapper phone-input-wrapper--country">
                                        <div class="country-code-field" data-cc-default="+91">
                                            <input type="hidden" name="waCountryCode" id="wa-country-code-hidden" value="+91" />
                                            <button type="button" class="country-code-trigger" id="wa-country-code-trigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="wa-country-code-popover" title="Country code">+91</button>
                                            <div id="wa-country-code-popover" class="country-code-popover is-hidden" role="dialog" aria-label="Choose or type country code">
                                                <button type="button" class="country-code-option" data-code="+91">+91</button>
                                                <input type="text" class="country-code-manual-inline" id="wa-country-code-manual-input" inputmode="tel" autocomplete="off" maxlength="12" placeholder="" aria-label="Type country code e.g. +65" />
                                            </div>
                                        </div>
                                        <input type="tel" name="whatsappPhone" placeholder="9876543210" id="whatsapp-phone" class="phone-national-input" inputmode="numeric" pattern="[0-9]*" maxlength="15" autocomplete="tel" />
                                    </div>
                                </div>
                                <label class="field email-field" id="email-field">
                                    <span>Email *</span>
                                    <input type="email" name="contactEmail" placeholder="name@email.com" id="contact-email" value="<?php echo htmlspecialchars($loggedInCustomer['email'] ?? ''); ?>" />
                                    <span class="field-hint" style="font-size: 0.72rem; color: #cbd5e1; margin-top: 4px; display: block;">Required — we'll send driver & trip updates here</span>
                                </label>
                                <div id="phone-spacer" style="display: none;"></div>
                            </div>

                            <input type="hidden" name="contactMode" value="phone" id="contact-mode-input" />

                            <div class="field-pair hidden" id="end-date-drop-time-control">
                                <label class="field">
                                    <span>End Date *</span>
                                    <input type="date" name="endDate" id="end-date-input" placeholder="mm/dd/yyyy" />
                                </label>
                                <label class="field">
                                    <span>Drop Time *</span>
                                    <input type="time" name="dropTime" id="drop-time-input" value="21:30" />
                                </label>
                            </div>

                            <label class="field hidden" id="hourly-pickup-field">
                                <span>Hourly Rental Pickup Location</span>
                                <input type="text" name="hourlyPickup" placeholder="e.g., Chennai Central" />
                            </label>
                            <div class="hourly-control hidden" id="hourly-control">
                                <span>Rental Duration</span>
                                <div class="hourly-options" role="group" aria-label="Hourly rental duration">
                                    <button type="button" class="hourly-option hourly-option--active" data-hours="5_hours">5 Hours</button>
                                    <button type="button" class="hourly-option" data-hours="8_hours">8 Hours</button>
                                    <button type="button" class="hourly-option" data-hours="10_hours">10 Hours</button>
                                    <button type="button" class="hourly-option" data-hours="12_hours">12 Hours</button>
                                </div>
                                <input type="hidden" name="hourlyPackage" id="hourly-package" value="5_hours" />
                            </div>

                            <div class="field" id="vehicle-selector-field">
                                <input type="hidden" name="vehicleType" id="vehicle-type-input" value="" />
                                <div class="vehicle-selector-grid" role="group" aria-label="Vehicle type">
                                    <button type="button" class="vehicle-selector-card" data-vehicle="SEDAN">
                                        <img src="/assets/img/vehicles/Dzire.png" alt="Sedan Taxi" loading="lazy" onerror="this.style.display='none'" style="transform: scale(0.85); object-fit: contain;" />
                                        <span class="vehicle-selector-card__name">Sedan</span>
                                        <span class="vehicle-selector-card__price">₹<?php echo get_home_rate('SEDAN', 'oneway'); ?>/km</span>
                                    </button>
                                    <button type="button" class="vehicle-selector-card" data-vehicle="SUV">
                                        <img src="/assets/img/vehicles/Suv.png" alt="SUV" loading="lazy" onerror="this.style.display='none'" />
                                        <span class="vehicle-selector-card__name">SUV</span>
                                        <span class="vehicle-selector-card__price">₹<?php echo get_home_rate('SUV', 'oneway'); ?>/km</span>
                                    </button>
                                    <button type="button" class="vehicle-selector-card" data-vehicle="INNOVA">
                                        <img src="/assets/img/vehicles/Innova.png" alt="Innova" loading="lazy" onerror="this.style.display='none'" />
                                        <span class="vehicle-selector-card__name">Innova</span>
                                        <span class="vehicle-selector-card__price">₹<?php echo get_home_rate('INNOVA', 'oneway'); ?>/km</span>
                                    </button>
                                    <button type="button" class="vehicle-selector-card" data-vehicle="CRYSTA">
                                        <img src="/assets/img/vehicles/innova-crysta.png" alt="Crysta" loading="lazy" onerror="this.style.display='none'" />
                                        <span class="vehicle-selector-card__name">Crysta</span>
                                        <span class="vehicle-selector-card__price">₹<?php echo get_home_rate('CRYSTA', 'oneway'); ?>/km</span>
                                    </button>
                                </div>
                            </div>

                            <div class="fare-toggle-wrap">
                                <div class="fare-toggle__switch" role="group" aria-label="Fare type">
                                    <input type="radio" name="fareType" id="fare-base" value="base" checked />
                                    <label for="fare-base">Excl. Tolls &amp; Taxes</label>
                                    <input type="radio" name="fareType" id="fare-inclusive" value="inclusive" />
                                    <label for="fare-inclusive">Incl. Tolls, Taxes &amp; GST</label>
                                </div>
                                <button type="button" class="fare-info-btn" id="fare-inclusions-info-btn" aria-label="What is included in toll and tax?" title="Click to view inclusions breakdown">
                                    <span class="info-icon">ℹ️</span>
                                </button>
                                <div class="fare-info-popover is-hidden" id="fare-inclusions-popover" role="tooltip">
                                    <div class="fare-info-popover__header">
                                        <strong>🧾 Fare Inclusions &amp; Tax Info</strong>
                                        <button type="button" class="fare-info-popover__close" id="fare-inclusions-close" aria-label="Close info">✕</button>
                                    </div>
                                    <div class="fare-info-popover__body">
                                        <ul class="fare-info-list">
                                            <li><strong>✅ Highway Tolls:</strong> Estimated route toll charges included when selected.</li>
                                            <li><strong>✅ 5% GST:</strong> Official CGST 2.5% + SGST 2.5% included for tax invoice.</li>
                                            <li><strong>✅ Driver Bata:</strong> Full chauffeur allowance &amp; fuel included.</li>
                                            <li><strong>ℹ️ State Border Tax:</strong> Calculated automatically by our smart engine. In rare cases where border entry taxes apply, it is applicable if crossing state borders only.</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            <!-- Promo Code / Customer Login Flow -->
                            <?php 
                            $isCustomerAuth = function_exists('dropcars_customer_logged_in') ? dropcars_customer_logged_in() : (!empty($_SESSION['customer_phone']) || !empty($_SESSION['customer_email']) || !empty($_SESSION['customer_id']));
                            $loginTargetUrl = function_exists('dropcars_url') ? dropcars_url('pages/customer-login.php?promo=1') : '/pages/customer-login.php?promo=1';
                            ?>
                            <?php if ($isCustomerAuth): ?>
                            <div class="promo-row promo-row--logged-in" id="promo-field">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                    <span class="promo-row__text" style="color: var(--text); font-weight: 700; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.02em;">🎁 Promo Code (Optional)</span>
                                </div>
                                <div class="promo-row__input-group">
                                    <input type="text" name="promoCode" id="promo-code" placeholder="Enter Code" autocomplete="off" aria-label="Promo code" />
                                    <button type="button" class="btn-promo-apply" id="promo-apply-btn">Apply</button>
                                </div>
                                <div id="promo-msg" class="promo-inline-msg"></div>
                            </div>
                            <?php else: ?>
                            <div class="promo-row promo-row--login-cta" id="promo-login-cta">
                                <a href="<?php echo htmlspecialchars($loginTargetUrl, ENT_QUOTES, 'UTF-8'); ?>" class="promo-login-cta-link" title="Log in to access promo codes">
                                    <span class="promo-cta-icon">🎁</span>
                                    <span class="promo-cta-text">Log in with your email to access promo codes &amp; discounts</span>
                                    <span class="promo-cta-btn">Log In &rarr;</span>
                                </a>
                            </div>
                            <?php endif; ?>
                            <div class="submit-wrapper">
                                <button type="button" class="btn-primary" id="calculate-fare-btn">Check Fare Now</button>
                                <div id="fare-card" class="fare-card" style="display: none;">
                                    <p class="fare-card__label">Estimated Fare</p>
                                    <p id="fare-amount" class="fare-card__amount">₹0</p>
                                    <p id="fare-distance" class="fare-card__meta" style="display: none;"></p>
                                    <p class="fare-card__disclaimer">Toll, parking & state taxes extra.</p>
                                    <button type="submit" class="btn-primary btn-primary--confirm" id="confirm-booking-btn">Book <?php echo htmlspecialchars($themeName); ?> Now</button>

                                </div>
                            </div>

                            <p id="form-response" class="form-response" role="status"></p>
                        </form>
                    </div>
                </div>
        </section>

        <!-- Trust/Benefits Section for Google Ads landing pages -->
        <section class="trust-benefits-section" style="padding: 4rem 0 2rem; background: #ffffff;">
            <div class="container" style="max-width: 1100px; margin: 0 auto; padding: 0 1rem;">
                <div style="text-align: center; margin-bottom: 3rem;">
                    <h2 style="font-size: 2rem; font-weight: 800; color: #0f172a; letter-spacing: -0.02em;">Why Choose <?php echo htmlspecialchars($themeName); ?>?</h2>
                    <p style="color: #64748b; font-size: 1.05rem; margin-top: 0.5rem;">The preferred intercity cab service across South India, built on safety, reliability, and clear flat rates.</p>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 2rem;">
                    <!-- Benefit 1 -->
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 2rem; border-radius: 16px; transition: transform 0.2s ease, border-color 0.2s ease;">
                        <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(14, 165, 233, 0.1); color: var(--blue); display: flex; align-items: center; justify-content: center; margin-bottom: 1.25rem;">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                        </div>
                        <h3 style="font-size: 1.2rem; font-weight: 700; color: #0f172a; margin-bottom: 0.5rem;">Transparent Flat Pricing</h3>
                        <p style="color: #64748b; font-size: 0.95rem; line-height: 1.5; margin: 0;">Calculate the exact price before you book. Pay only for the one-way distance traveled, with zero hidden charges or night batas.</p>
                    </div>

                    <!-- Benefit 2 -->
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 2rem; border-radius: 16px; transition: transform 0.2s ease, border-color 0.2s ease;">
                        <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(14, 165, 233, 0.1); color: var(--blue); display: flex; align-items: center; justify-content: center; margin-bottom: 1.25rem;">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                        </div>
                        <h3 style="font-size: 1.2rem; font-weight: 700; color: #0f172a; margin-bottom: 0.5rem;">5.0★ Rated Safe Drivers</h3>
                        <p style="color: #64748b; font-size: 0.95rem; line-height: 1.5; margin: 0;">Travel with highly experienced, background-verified, and courteous professionals. Every trip is tracked for absolute safety.</p>
                    </div>

                    <!-- Benefit 3 -->
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 2rem; border-radius: 16px; transition: transform 0.2s ease, border-color 0.2s ease;">
                        <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(14, 165, 233, 0.1); color: var(--blue); display: flex; align-items: center; justify-content: center; margin-bottom: 1.25rem;">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        </div>
                        <h3 style="font-size: 1.2rem; font-weight: 700; color: #0f172a; margin-bottom: 0.5rem;">24/7 Priority Support</h3>
                        <p style="color: #64748b; font-size: 0.95rem; line-height: 1.5; margin: 0;">Our dedicated operational helpline is live 24 hours a day, 7 days a week to ensure seamless coordination and instant assistance.</p>
                    </div>
                </div>
            </div>
        </section>

        <!-- Master Tabbed Routes & Cities Hub -->
        <?php
        $cityCardThemeName = ($themeName === 'Drop Cars') ? 'Drop Taxi' : $themeName;
        $importantCities = array_filter($seo->cities, function($c) {
            return in_array($c['slug'], ['chennai', 'coimbatore', 'bangalore', 'madurai', 'trichy', 'salem', 'pondicherry', 'tiruvannamalai', 'tirupati', 'vellore']);
        });
        $importantSlugs = array_column($importantCities, 'slug');
        ?>
        <section class="routes-section city-routes-section" id="routes">
            <div class="container">
                <div class="section-header text-center" style="margin-bottom: 2rem;">
                    <p class="eyebrow" id="route-eyebrow">Explore Destinations & Fares</p>
                    <h2 id="route-title">Popular <?php echo htmlspecialchars($cityCardThemeName); ?> Routes & Cities</h2>
                </div>

                <!-- Master Tab Navigation -->
                <div class="master-tabs-container">
                    <div class="master-tabs" role="tablist">
                        <button class="master-tab active" data-target="#tab-popular-routes" role="tab" aria-selected="true">
                            <span class="tab-icon">🛣️</span>
                            <span>Popular Routes</span>
                        </button>
                        <button class="master-tab" data-target="#tab-city-hubs" role="tab" aria-selected="false">
                            <span class="tab-icon">🌆</span>
                            <span>Major Hub Cities</span>
                        </button>
                        <button class="master-tab" data-target="#tab-airport-transfers" role="tab" aria-selected="false">
                            <span class="tab-icon">✈️</span>
                            <span>Airport Transfers</span>
                        </button>
                    </div>
                </div>

                <!-- Master Tab Contents -->
                <div class="master-tab-contents">
                    <!-- Tab 1: Popular Routes -->
                    <div class="master-tab-pane active" id="tab-popular-routes" role="tabpanel">
                        <!-- City Selector Grid -->
                        <div class="city-selector">
                            <div class="city-tabs" id="city-tabs">
                                <button class="city-tab active" data-city="Chennai">Chennai</button>
                                <button class="city-tab" data-city="Tiruvannamalai">Tiruvannamalai</button>
                                <button class="city-tab" data-city="Coimbatore">Coimbatore</button>
                                <button class="city-tab" data-city="Madurai">Madurai</button>
                                <button class="city-tab" data-city="Trichy">Trichy</button>
                                <button class="city-tab" data-city="Bangalore">Bangalore</button>
                                <button class="city-tab" data-city="Trivandrum">Trivandrum</button>
                                <button class="city-tab" data-city="Rameshwaram">Rameshwaram</button>
                                <button class="city-tab" data-city="Kanyakumari">Kanyakumari</button>
                                <button class="city-tab" data-city="Pondicherry">Pondicherry</button>
                                <button class="city-tab" data-city="Vellore">Vellore</button>
                                <button class="city-tab" data-city="Tirupati">Tirupati</button>
                                <button class="city-tab" data-city="Salem">Salem</button>
                                <button class="city-tab" data-city="Kochi">Kochi</button>
                            </div>
                        </div>

                        <!-- Routes Grid -->
                        <div class="routes-grid" id="popular-routes-grid">
                            <!-- Dynamically filled by JS -->
                        </div>

                        <div class="view-more-container" id="view-more-container">
                            <button id="view-more-routes" class="btn-outline">View More Routes</button>
                        </div>
                    </div>

                    <!-- Tab 2: Major Hub Cities -->
                    <div class="master-tab-pane" id="tab-city-hubs" role="tabpanel" style="display: none;">
                        <div id="cities"></div>
                        <div class="city-grid city-grid--important" id="city-grid-important">
                            <?php foreach ($importantCities as $city): ?>
                                <a href="<?php echo dropcars_url(($activeTheme['slug'] ?? 'drop-cars') . '/' . $city['slug']); ?>" class="city-card highway-signboard route-card--highway" data-city-name="<?php echo htmlspecialchars($city['city']); ?>">
                                    <div class="highway-signboard-shine"></div>
                                    <div class="highway-signboard__header">
                                        <span class="highway-badge">OUTSTATION TAXI</span>
                                    </div>
                                    <div class="highway-signboard__route">
                                        <span><?php echo htmlspecialchars($cityCardThemeName . ' in ' . $city['city']); ?></span>
                                    </div>
                                    <div class="highway-signboard__metrics">
                                        <div class="highway-metric highway-metric--kms">
                                            <span class="highway-metric__icon">📍</span>
                                            <span>One-Way Taxi</span>
                                        </div>
                                        <div class="highway-metric highway-metric--timing">
                                            <span class="highway-metric__icon">🚗</span>
                                            <span>24x7 Cabs</span>
                                        </div>
                                    </div>
                                    <div class="highway-signboard__cta">
                                        <span>View Fares</span>
                                        <span class="cta-arrow">➔</span>
                                    </div>
                                </a>
                            <?php endforeach; ?>
                        </div>

                        <button class="city-toggle-btn" id="city-toggle-btn" data-theme-name="<?php echo htmlspecialchars($cityCardThemeName); ?>" data-exclude-slugs="<?php echo htmlspecialchars(implode(',', $importantSlugs)); ?>">
                            <span class="btn-text">View All <?php echo htmlspecialchars($cityCardThemeName); ?> Cities</span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
                        </button>

                        <div class="city-collapse" id="city-collapse">
                            <div class="city-grid" id="city-grid" data-lazy-source="<?php echo htmlspecialchars(dropcars_url('data/cities.json')); ?>"></div>
                        </div>
                    </div>

                    <!-- Tab 3: Airport Transfers -->
                    <div class="master-tab-pane" id="tab-airport-transfers" role="tabpanel" style="display: none;">
                        <div class="airport-hub-grid">
                            <a href="<?php echo dropcars_url(($activeTheme['slug'] ?? 'drop-cars') . '/chennai'); ?>" class="airport-card">
                                <div class="airport-card__badge">24x7 AIRPORT CABS</div>
                                <div class="airport-card__title">✈️ Chennai International Airport (MAA)</div>
                                <p class="airport-card__desc">Pickup & drop from MAA to Pondicherry, Vellore, Tirupati, Trichy, Salem & all TN districts. Flat fares, zero return fare.</p>
                                <span class="airport-card__cta">Book Airport Taxi ➔</span>
                            </a>
                            <a href="<?php echo dropcars_url(($activeTheme['slug'] ?? 'drop-cars') . '/bangalore'); ?>" class="airport-card">
                                <div class="airport-card__badge">24x7 AIRPORT CABS</div>
                                <div class="airport-card__title">✈️ Kempegowda Intl Airport Bengaluru (BLR)</div>
                                <p class="airport-card__desc">Reliable airport transfer from BLR to Hosur, Krishnagiri, Salem, Coimbatore, Chennai & Mysuru.</p>
                                <span class="airport-card__cta">Book Airport Taxi ➔</span>
                            </a>
                            <a href="<?php echo dropcars_url(($activeTheme['slug'] ?? 'drop-cars') . '/coimbatore'); ?>" class="airport-card">
                                <div class="airport-card__badge">24x7 AIRPORT CABS</div>
                                <div class="airport-card__title">✈️ Coimbatore Intl Airport (CJB)</div>
                                <p class="airport-card__desc">Direct one-way cab services from CJB to Ooty, Coonoor, Pollachi, Tiruppur, Erode & Kerala border.</p>
                                <span class="airport-card__cta">Book Airport Taxi ➔</span>
                            </a>
                            <a href="<?php echo dropcars_url(($activeTheme['slug'] ?? 'drop-cars') . '/madurai'); ?>" class="airport-card">
                                <div class="airport-card__badge">24x7 AIRPORT CABS</div>
                                <div class="airport-card__title">✈️ Madurai Airport (IXM)</div>
                                <p class="airport-card__desc">Seamless outstation taxi connecting IXM to Rameshwaram, Kanyakumari, Tirunelveli & Kodaikanal.</p>
                                <span class="airport-card__cta">Book Airport Taxi ➔</span>
                            </a>
                            <a href="<?php echo dropcars_url(($activeTheme['slug'] ?? 'drop-cars') . '/trichy'); ?>" class="airport-card">
                                <div class="airport-card__badge">24x7 AIRPORT CABS</div>
                                <div class="airport-card__title">✈️ Tiruchirappalli Intl Airport (TRZ)</div>
                                <p class="airport-card__desc">Instant drop taxi service from TRZ to Thanjavur, Kumbakonam, Karur, Nagapattinam & Pudukkottai.</p>
                                <span class="airport-card__cta">Book Airport Taxi ➔</span>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- Cities Directory with SEO Dropdown/Accordion of 50 Routes -->
        <?php
        /* ── City image + SEO description lookup map ── */
        $cityMeta = [
            'chennai'        => [
                'img'  => '/assets/img/seo/chennai_places.png',
                'alt'  => 'Chennai Marina Beach and city skyline',
                'desc' => 'Book one-way taxi and outstation cab services from Chennai — South India\'s largest metro. Transparent per-km fares for airport transfers, intercity drops, and corporate travel across Tamil Nadu.'
            ],
            'coimbatore'     => [
                'img'  => '/assets/img/seo/coimbatore_guide.png',
                'alt'  => 'Coimbatore city view — Manchester of South India',
                'desc' => 'Affordable outstation cab bookings from Coimbatore to Ooty, Kochi, Bangalore & beyond. Flat-rate pricing, AC cabs, and 24/7 confirmed pick-ups from the textile capital of Tamil Nadu.'
            ],
            'bangalore'      => [
                'img'  => '/assets/img/seo/bangalore_places.png',
                'alt'  => 'Bangalore city landmarks and tech hub',
                'desc' => 'Reliable intercity taxi from Bangalore to Chennai, Mysore, Tirupati & more. Best one-way drop taxi rates from India\'s Silicon Valley with professional, verified chauffeurs.'
            ],
            'tiruvannamalai' => [
                'img'  => '/assets/img/seo/seo_chennai_tiruvannamalai_guide.png',
                'alt'  => 'Arunachaleswarar Temple, Tiruvannamalai',
                'desc' => 'Sacred pilgrimage taxi from Tiruvannamalai to Arunachaleswarar Temple circuits, Pondicherry, Chennai & Vellore. Book clean, punctual cabs for spiritual and heritage travel.'
            ],
            'pondicherry'    => [
                'img'  => '/assets/img/seo/seo_pondicherry_guide.png',
                'alt'  => 'French Quarter promenade in Pondicherry',
                'desc' => 'Travel from Pondicherry to Chennai, Villupuram & Trichy in premium cabs. Explore the French Quarter, Auroville, and coastal beaches with verified drivers at flat per-km rates.'
            ],
            'madurai'        => [
                'img'  => '/assets/img/seo/seo_madurai_guide.png',
                'alt'  => 'Madurai Meenakshi Amman Temple',
                'desc' => 'Book outstation taxi from Madurai — the temple city of India — to Trichy, Rameshwaram, Kanyakumari & Coimbatore. Heritage routes with transparent fares and AC cabs.'
            ],
            'tirupati'       => [
                'img'  => '/assets/img/seo/seo_tirupati_guide.png',
                'alt'  => 'Tirupati Tirumala hills pilgrimage route',
                'desc' => 'Premium pilgrimage cab service from Tirupati to Chennai, Bangalore & Vellore. Dedicated taxi for Tirumala darshan with experienced drivers who know the hill roads well.'
            ],
            'trichy'         => [
                'img'  => '/assets/img/seo/seo_trichy_guide.png',
                'alt'  => 'Tiruchirappalli Rock Fort Temple view',
                'desc' => 'Reliable outstation drop taxi and round-trip rentals from Trichy to Chennai, Madurai, Coimbatore & Bangalore. Professional drivers and flat transparent fares.'
            ],
            'salem'          => [
                'img'  => '/assets/img/seo/seo_salem_guide.png',
                'alt'  => 'Scenic Yercaud hill roads near Salem',
                'desc' => 'Affordable outstation cab and one-way taxi services from Salem to Bangalore, Chennai, Erode & Coimbatore. Enjoy comfortable rides with our verified local drivers.'
            ],
            'vellore'        => [
                'img'  => '/assets/img/seo/seo_vellore_guide.png',
                'alt'  => 'Historic Vellore Fort stone walls',
                'desc' => 'Book premium outstation cabs and one-way drop taxis from Vellore. Reliable transportation for medical visits, college drop-offs, and intercity travel with 24/7 customer support.'
            ],
            'tirunelveli'    => [
                'img'  => '/assets/img/seo/seo_tirunelveli_guide.png',
                'alt'  => 'Nellaiappar Temple entrance Tirunelveli',
                'desc' => 'Get clean, sanitized AC cabs from Tirunelveli to Madurai, Tenkasi, Kanyakumari, Trivandrum & Chennai. Flat rates, experienced drivers, and instant booking.'
            ],
            'thanjavur'      => [
                'img'  => '/assets/img/seo/seo_thanjavur_guide.png',
                'alt'  => 'Tanjore Brihadeeswara Temple (Big Temple)',
                'desc' => 'Comfortable outstation cabs and tour packages from Tanjore/Thanjavur. Safe spiritual travel with drivers who know the temple routes and highway corridors perfectly.'
            ],
            'kanchipuram'    => [
                'img'  => '/assets/img/seo/seo_kanchipuram_guide.png',
                'alt'  => 'Ancient temple in Kanchipuram temple town',
                'desc' => 'Spiritual tours and outstation cabs from Kanchipuram to Chennai, Vellore, Pondicherry & Tirupati. Clean vehicles, background-verified drivers, and clear transparent per-km billing.'
            ],
            'mysore'         => [
                'img'  => '/assets/img/seo/seo_mysore_guide.png',
                'alt'  => 'Illuminated Mysore Palace landmark',
                'desc' => 'Outstation taxis and one-way cabs from Mysore to Bangalore, Ooty, Coorg & Coimbatore. Best rates, professional service, and on-time confirmed pickups.'
            ],
            'kochi'          => [
                'img'  => '/assets/img/seo/seo_kochi_guide.png',
                'alt'  => 'Fort Kochi Chinese Fishing Nets at sunset',
                'desc' => 'Travel from Kochi/Ernakulam to Coimbatore, Bangalore, Munnar & Trivandrum. Reliable airport transfers and one-way drop cabs with flat transparent pricing.'
            ],
            'hyderabad'      => [
                'img'  => '/assets/img/seo/seo_hyderabad_guide.png',
                'alt'  => 'Historic Charminar landmark in Hyderabad',
                'desc' => 'Book outstation cabs from Hyderabad to Bangalore, Chennai, Tirupati & Vijayawada. Clean cars, verified chauffeurs, and instant trip confirmation via WhatsApp.'
            ]
        ];
        /* Fallback for cities without a specific image */
        $cityMetaDefault = [
            'img'  => '/assets/img/seo/seo_generic_city.png',
            'alt'  => 'Outstation taxi service across Tamil Nadu',
            'desc' => 'Book affordable one-way drop taxi and outstation cab services with flat per-km pricing, AC vehicles, and 24/7 customer support — confirmed pickup guaranteed.'
        ];
        ?>
        <section class="cities-hub-section" style="border-top: 1px solid #f1f5f9;">
            <div class="container">
                <div class="cities-hub-title">
                    <h2>Outstation Taxi &amp; One-Way Cab Routes Directory</h2>
                    <p>Choose your departure city to explore up to 50 verified intercity taxi routes with live per-km pricing, AC cab options, and instant booking confirmation.</p>
                </div>

                <div class="cities-hub-grid">
                    <?php foreach ($seo->cities as $city): ?>
                        <?php 
                            $cityRoutes = $seo->getPopularRoutesFrom($city['slug'], 50); 
                            $totalRoutesCount = count($cityRoutes);
                            $slug = $city['slug'];
                            $meta = $cityMeta[$slug] ?? $cityMetaDefault;
                            /* Build a generic desc when city-specific one isn't provided */
                            if (!isset($cityMeta[$slug])) {
                                $meta['desc'] = 'Book verified one-way drop taxi and outstation cab from ' . htmlspecialchars($city['city']) . ' at flat per-km rates. Clean AC cars, professional drivers, and zero hidden charges across ' . count($cityRoutes) . ' popular routes.';
                            }
                            $hasAirport = !empty($city['airport']);
                            $stateLabel = htmlspecialchars($city['state'] ?? '');
                        ?>
                        <div class="city-accordion-card">
                            <div class="city-accordion-header" onclick="toggleAccordion(this)" role="button" aria-expanded="false" aria-label="Toggle routes for <?php echo htmlspecialchars($city['city']); ?>">

                                <!-- City Thumbnail -->
                                <div class="city-card-thumb">
                                    <img
                                        src="<?php echo htmlspecialchars($meta['img']); ?>"
                                        alt="<?php echo htmlspecialchars($meta['alt']); ?>"
                                        loading="lazy"
                                        width="130" height="110"
                                    />
                                    <div class="city-card-thumb-overlay"></div>
                                </div>

                                <!-- City Info -->
                                <div class="city-card-info">
                                    <div class="city-card-meta">
                                        <?php if ($stateLabel): ?>
                                            <span class="city-state-tag"><?php echo $stateLabel; ?></span>
                                        <?php endif; ?>
                                        <?php if ($hasAirport): ?>
                                            <span class="city-airport-tag">✈ Airport</span>
                                        <?php endif; ?>
                                    </div>
                                    <?php $displayThemeName = ($themeName === 'Drop Cars') ? 'Drop Taxi' : $themeName; ?>
                                    <h3>
                                        <a href="<?php echo dropcars_theme_page_url($linkThemeSlug, $slug); ?>" onclick="event.stopPropagation();" title="<?php echo htmlspecialchars($displayThemeName) . ' in ' . htmlspecialchars($city['city']); ?>">
                                            <?php echo htmlspecialchars($displayThemeName) . ' in ' . htmlspecialchars($city['city']); ?>
                                        </a>
                                    </h3>
                                    <p class="city-card-desc"><?php echo htmlspecialchars($meta['desc']); ?></p>
                                </div>

                                <!-- Toggle Column -->
                                <div class="city-card-toggle">
                                    <span class="city-route-badge"><?php echo $totalRoutesCount; ?> Routes</span>
                                    <div class="city-accordion-icon" aria-hidden="true">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
                                    </div>
                                </div>

                            </div><!-- /.city-accordion-header -->

                            <div class="city-accordion-content">
                                <div class="city-routes-inner">
                                    <?php foreach ($cityRoutes as $targetRoute): ?>
                                        <a href="<?php echo dropcars_theme_page_url($linkThemeSlug, $slug, $targetRoute['slug']); ?>" class="city-route-link" title="<?php echo htmlspecialchars($city['city']) . ' to ' . htmlspecialchars($targetRoute['city']) . ' Taxi | ' . htmlspecialchars($themeName); ?>">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                                            <span><?php echo htmlspecialchars($city['city']) . ' → ' . htmlspecialchars($targetRoute['city']) . ' Taxi'; ?></span>
                                        </a>
                                    <?php endforeach; ?>
                                </div>
                            </div>
                        </div><!-- /.city-accordion-card -->
                    <?php endforeach; ?>
                </div>
            </div>
        </section>
    </main>

    <?php echo $shell->renderFooter(); ?>
    <?php echo $shell->renderScripts(); ?>

    <script>
        function toggleAccordion(header) {
            const card = header.closest('.city-accordion-card');
            const content = card.querySelector('.city-accordion-content');
            const isActive = card.classList.contains('active');
            
            // Close all other accordions
            document.querySelectorAll('.city-accordion-card').forEach(otherCard => {
                if (otherCard !== card) {
                    otherCard.classList.remove('active');
                    otherCard.querySelector('.city-accordion-content').style.maxHeight = null;
                }
            });

            // Toggle current
            if (isActive) {
                card.classList.remove('active');
                content.style.maxHeight = null;
            } else {
                card.classList.add('active');
                content.style.maxHeight = content.scrollHeight + "px";
            }
        }
    </script>
<script defer src="/assets/js/route-explorer.js?v=<?php echo @filemtime(__DIR__.'/../assets/js/route-explorer.js'); ?>"></script>
<script defer src="/assets/js/city-toggle.js?v=<?php echo @filemtime(__DIR__.'/../assets/js/city-toggle.js'); ?>"></script>
<script defer src="/assets/js/contact-step-reveal.js?v=<?php echo @filemtime(__DIR__.'/../assets/js/contact-step-reveal.js'); ?>"></script>
<script>
document.addEventListener('DOMContentLoaded', function() {
    var masterTabs = document.querySelectorAll('.master-tab');
    var masterPanes = document.querySelectorAll('.master-tab-pane');

    function activateTab(targetId) {
        masterTabs.forEach(function(tab) {
            var isTarget = tab.getAttribute('data-target') === targetId;
            tab.classList.toggle('active', isTarget);
            tab.setAttribute('aria-selected', isTarget ? 'true' : 'false');
        });
        masterPanes.forEach(function(pane) {
            if ('#' + pane.id === targetId) {
                pane.style.display = 'block';
                pane.classList.add('active');
            } else {
                pane.style.display = 'none';
                pane.classList.remove('active');
            }
        });
    }

    masterTabs.forEach(function(tab) {
        tab.addEventListener('click', function(e) {
            e.preventDefault();
            var targetId = this.getAttribute('data-target');
            activateTab(targetId);
        });
    });

    if (window.location.hash === '#cities' || window.location.pathname.indexOf('/cities') !== -1) {
        activateTab('#tab-city-hubs');
    } else if (window.location.hash === '#airport' || window.location.hash === '#airports') {
        activateTab('#tab-airport-transfers');
    }
});
</script>
</body>
</html>
