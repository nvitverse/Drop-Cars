<?php
// display_errors is OFF - this is a public page; a PHP error would otherwise
// dump file paths/stack traces straight into the rendered HTML. Errors are
// still captured via log_errors for debugging - check the PHP error log.
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);
/**
 * Airport Transfer Page — Drop Cars
 * Full SEO-rich page with dedicated airport booking form,
 * Tamil Nadu airports info, and extensive route coverage
 */
require_once __DIR__ . '/../config/session.php';
if (session_status() === PHP_SESSION_NONE) {
    @session_start();
}
require_once __DIR__ . '/../includes/paths.php';
require_once __DIR__ . '/../engine/theme-engine.php';
require_once __DIR__ . '/../engine/shell.php';

$themeEngine = new ThemeEngine();
$activeTheme = $themeEngine->detectTheme();
$allThemes   = $themeEngine->getAllThemes();
$shell       = new UIShell($activeTheme, $allThemes);

$configPath = __DIR__ . '/../data/config.json';
$config     = is_file($configPath) ? json_decode(file_get_contents($configPath), true) : [];
$phone      = $config['company']['phone'] ?? '7200217986';
$whatsapp   = $config['company']['whatsapp'] ?? '917200217986';
$phoneDigits = preg_replace('/\D/', '', $phone);
$waDigits    = preg_replace('/\D/', '', $whatsapp);

// Real aggregateRating for the LocalBusiness schema below, computed from
// actual approved reviews - never hardcode a rating/review count here.
// Google penalizes fabricated review schema, and with 0 approved reviews
// the aggregateRating field is omitted entirely (a rich-result rating
// requires genuine data - see the LocalBusiness block further down).
$aggregateRating = null;
try {
    if (!defined('DROP_CARS_DB_OPTIONAL')) {
        define('DROP_CARS_DB_OPTIONAL', true);
    }
    require_once __DIR__ . '/../admin/config/database.php';
    if ((!isset($pdo) || !$pdo instanceof PDO) && !empty($GLOBALS['db']) && $GLOBALS['db'] instanceof PDO) {
        $pdo = $GLOBALS['db'];
    }
    if (isset($pdo) && $pdo instanceof PDO) {
        $stmt = $pdo->query("SELECT COUNT(*) AS cnt, AVG(rating) AS avg_rating FROM reviews WHERE is_approved = 1");
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row && (int) $row['cnt'] > 0) {
            $aggregateRating = [
                'ratingValue' => round((float) $row['avg_rating'], 1),
                'reviewCount' => (int) $row['cnt'],
            ];
        }
    }
} catch (Throwable $e) {
    error_log('airport-transfer.php aggregateRating lookup failed: ' . $e->getMessage());
}

$istTz = new DateTimeZone('Asia/Kolkata');
$nowIst = new DateTime('now', $istTz);
$defaultPickupDate = $nowIst->format('Y-m-d');
$timePlus15 = (clone $nowIst)->modify('+15 minutes');
$defaultPickupTime = $timePlus15->format('H:i');

// Fare data
$fares = $config['fares'] ?? [];
if (!function_exists('get_airport_rate')) {
    function get_airport_rate($vehicle) {
        global $fares;
        return (int)($fares['baseFareOneWay'][$vehicle] ?? ['SEDAN'=>15,'SUV'=>20,'INNOVA'=>20,'CRYSTA'=>24][$vehicle] ?? 15);
    }
}

$pageTitle = 'Airport Taxi Service | 24x7 Airport Cabs | Drop Cars';
$pageDesc  = 'Reliable 24x7 airport cabs for Chennai, Bangalore, Coimbatore & Trichy airports. Flat rates, zero flight delay surge & instant booking.';
$canonical = function_exists('dropcars_canonical_request_url') ? dropcars_canonical_request_url() : 'https://dropcars.in/airport-transfer';

// Tamil Nadu + border airports data
$airports = [
    [
        'code' => 'MAA',
        'name' => 'Chennai International Airport',
        'city' => 'Chennai',
        'iata' => 'MAA',
        'desc' => 'South India\'s busiest international hub. Terminal 1 (domestic) and Terminal 2 (international). Handles 20M+ passengers annually.',
        'icon' => '🏛️',
        'routes' => ['Tiruvannamalai','Vellore','Pondicherry','Kanchipuram','Salem','Trichy','Madurai','Coimbatore'],
    ],
    [
        'code' => 'CJB',
        'name' => 'Coimbatore International Airport',
        'city' => 'Coimbatore',
        'iata' => 'CJB',
        'desc' => 'Gateway to Ooty, Munnar and Western Ghats. International flights to Singapore, Dubai and Colombo.',
        'icon' => '🌄',
        'routes' => ['Ooty','Gudalur','Tiruppur','Erode','Salem','Pollachi','Palakkad'],
    ],
    [
        'code' => 'IXM',
        'name' => 'Madurai International Airport',
        'city' => 'Madurai',
        'iata' => 'IXM',
        'desc' => 'Serving the temple city and surrounding districts. Flights to Chennai, Bangalore, Mumbai, Dubai and Singapore.',
        'icon' => '🛕',
        'routes' => ['Rameshwaram','Tirunelveli','Dindigul','Theni','Virudhunagar','Kanyakumari'],
    ],
    [
        'code' => 'TRZ',
        'name' => 'Trichy International Airport',
        'city' => 'Trichy (Tiruchirappalli)',
        'iata' => 'TRZ',
        'desc' => 'Key airport serving Central Tamil Nadu with international flights to Middle East. Close to Thanjavur, Kumbakonam.',
        'icon' => '🏰',
        'routes' => ['Thanjavur','Kumbakonam','Karur','Ariyalur','Pudukkottai','Perambalur'],
    ],
    [
        'code' => 'VGA',
        'name' => 'Salem Airport',
        'city' => 'Salem',
        'iata' => 'SXV',
        'desc' => 'Growing regional airport in the steel city. Convenient for travelers from Namakkal, Dharmapuri, and Krishnagiri.',
        'icon' => '🏗️',
        'routes' => ['Namakkal','Dharmapuri','Krishnagiri','Erode','Mettur','Yercaud'],
    ],
    [
        'code' => 'BLR',
        'name' => 'Kempegowda International Airport',
        'city' => 'Bangalore',
        'iata' => 'BLR',
        'desc' => 'Major hub for Tamil Nadu border travelers. Serves Hosur, Krishnagiri, Kolar, and Eastern Tamil Nadu commuters.',
        'icon' => '🌆',
        'routes' => ['Hosur','Krishnagiri','Kolar','Tumkur','Chikkaballapur','Vellore'],
    ],
    [
        'code' => 'HYD',
        'name' => 'Rajiv Gandhi International Airport',
        'city' => 'Hyderabad',
        'iata' => 'HYD',
        'desc' => 'Handles traffic from North Tamil Nadu border districts. Key gateway for business travelers.',
        'icon' => '🔷',
        'routes' => ['Tirupati','Nellore','Chittoor','Vellore','Chennai'],
    ],
    [
        'code' => 'TIR',
        'name' => 'Tirupati Airport',
        'city' => 'Tirupati',
        'iata' => 'TIR',
        'desc' => 'Serving pilgrims to Tirumala Venkateswara Temple. Key entry point from Tamil Nadu border.',
        'icon' => '🙏',
        'routes' => ['Tiruvannamalai','Vellore','Chennai','Chittoor','Nellore'],
    ],
    [
        'code' => 'COK',
        'name' => 'Cochin International Airport',
        'city' => 'Kochi',
        'iata' => 'COK',
        'desc' => 'World\'s first fully solar-powered airport. Serves travelers from Coimbatore, Palakkad and Tamil Nadu-Kerala border.',
        'icon' => '☀️',
        'routes' => ['Palakkad','Thrissur','Ernakulam','Coimbatore','Tiruppur'],
    ],
];

// Single source of truth for the visible FAQ accordion further down the page
// AND the FAQPage JSON-LD in <head> - previously the schema hardcoded only 4
// Q&As while the visible section had grown to 6, so the two had drifted out
// of sync (Google requires structured data to match visible content, or the
// page risks losing FAQ rich-result eligibility). Generating both from this
// one array makes that drift impossible going forward.
$airportFaqs = [
    ["How much does an airport cab cost from Chennai airport?",
     "A Sedan from Chennai airport costs ₹15/km + ₹400 driver bata. Chennai Airport → Tiruvannamalai (200 km) ≈ ₹3,400. Chennai → Coimbatore (506 km) ≈ ₹8,000. All fares are fixed — no surge pricing ever."],
    ["Is airport taxi available at 3 AM in Tamil Nadu?",
     "Yes. Drop Cars operates 24/7 including early morning and late night. We handle early morning 4 AM departures and arrivals past midnight. Book in advance and your driver will be there before you."],
    ["Do you wait if my flight is delayed?",
     "Yes. We track your flight status and adjust pickup time automatically for delays up to 2 hours at no extra charge. For longer delays, our 24/7 support will coordinate with you."],
    ["Can I book a return airport cab?",
     "Yes. Book as a round-trip and your driver will wait at the destination (or you can book two separate one-way trips). Contact our support to arrange multi-day or multi-trip packages."],
    ["Which vehicle is best for airport transfer with luggage?",
     "Sedan (Etios/Dzire) fits 2 bags. For 4+ large bags, choose Innova or Crysta. If traveling with a group of 6, Innova Crysta is ideal with a spacious boot."],
    ["How do I track my airport cab driver?",
     "Once your booking is confirmed, you receive a live GPS tracking link via WhatsApp. You can share this with your family so they can see when your driver arrives at the airport."],
];

// Same idea for the "How to Book" steps further down - feeds a HowTo schema
// block in <head> from the identical steps shown in the visible <ol>.
$airportHowToSteps = [
    ['Select your airport', 'Use the quick chips above the booking form to pick your airport (Chennai, Coimbatore, Madurai, Trichy, Salem, Bangalore, Tirupati or Kochi).'],
    ['Enter your destination', 'Type your home, hotel, or city as the drop location.'],
    ['Choose your travel date and time', 'Pick the pickup date and time for your flight.'],
    ['Select your vehicle type', 'Choose Sedan, SUV, Innova or Crysta based on your group size and luggage.'],
    ['Get instant fare estimate', 'Review the fixed fare shown and confirm your booking.'],
    ['Receive WhatsApp confirmation', 'Get driver and vehicle details on WhatsApp within minutes of booking.'],
];

// All airport pickup/drop routes across TN
$airportRoutes = [
    'From Chennai Airport' => [
        'Chennai Airport → Tiruvannamalai (185 km)',
        'Chennai Airport → Vellore (130 km)',
        'Chennai Airport → Pondicherry (150 km)',
        'Chennai Airport → Kanchipuram (65 km)',
        'Chennai Airport → Trichy (315 km)',
        'Chennai Airport → Madurai (450 km)',
        'Chennai Airport → Coimbatore (500 km)',
        'Chennai Airport → Salem (340 km)',
        'Chennai Airport → Chengalpet (55 km)',
        'Chennai Airport → Villupuram (160 km)',
        'Chennai Airport → Cuddalore (170 km)',
        'Chennai Airport → Tirupattur (180 km)',
        'Chennai Airport → Dharmapuri (330 km)',
        'Chennai Airport → Namakkal (360 km)',
        'Chennai Airport → Erode (410 km)',
    ],
    'From Coimbatore Airport' => [
        'Coimbatore Airport → Salem (165 km)',
        'Coimbatore Airport → Ooty (88 km)',
        'Coimbatore Airport → Tiruppur (45 km)',
        'Coimbatore Airport → Erode (95 km)',
        'Coimbatore Airport → Pollachi (45 km)',
        'Coimbatore Airport → Palakkad (55 km)',
        'Coimbatore Airport → Thrissur (80 km)',
        'Coimbatore Airport → Gudalur (95 km)',
        'Coimbatore Airport → Dharapuram (70 km)',
        'Coimbatore Airport → Udumalpet (80 km)',
    ],
    'From Madurai Airport' => [
        'Madurai Airport → Rameshwaram (175 km)',
        'Madurai Airport → Tirunelveli (155 km)',
        'Madurai Airport → Kanyakumari (245 km)',
        'Madurai Airport → Dindigul (70 km)',
        'Madurai Airport → Theni (80 km)',
        'Madurai Airport → Virudhunagar (65 km)',
        'Madurai Airport → Sivakasi (90 km)',
        'Madurai Airport → Thoothukudi (160 km)',
    ],
    'From Trichy Airport' => [
        'Trichy Airport → Thanjavur (60 km)',
        'Trichy Airport → Kumbakonam (95 km)',
        'Trichy Airport → Karur (80 km)',
        'Trichy Airport → Pudukkottai (55 km)',
        'Trichy Airport → Perambalur (55 km)',
        'Trichy Airport → Ariyalur (75 km)',
        'Trichy Airport → Chidambaram (105 km)',
        'Trichy Airport → Nagapattinam (120 km)',
    ],
    'From Bangalore Airport' => [
        'Bangalore Airport → Hosur (50 km)',
        'Bangalore Airport → Krishnagiri (95 km)',
        'Bangalore Airport → Vellore (210 km)',
        'Bangalore Airport → Kolar (70 km)',
        'Bangalore Airport → Dharmapuri (185 km)',
        'Bangalore Airport → Salem (240 km)',
        'Bangalore Airport → Tumkur (55 km)',
        'Bangalore Airport → Mysore (210 km)',
    ],
];
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($pageTitle); ?></title>
    <meta name="description" content="<?php echo htmlspecialchars($pageDesc); ?>">
    <link rel="canonical" href="<?php echo htmlspecialchars($canonical); ?>">
    <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
    <meta name="geo.region" content="IN-TN">
    <meta name="geo.placename" content="Tamil Nadu, South India">
    <meta name="author" content="Drop Cars">
    <meta name="keywords" content="Airport Taxi, Chennai Airport Cab, Coimbatore Airport Transfer, Madurai Airport Taxi, Trichy Airport Cab, Salem Airport Transfer, Bangalore Airport Taxi, Hyderabad Airport Cab, Tirupati Airport Transfer, Cochin Airport Taxi">
    <!-- Open Graph -->
    <meta property="og:title" content="<?php echo htmlspecialchars($pageTitle); ?>">
    <meta property="og:description" content="<?php echo htmlspecialchars($pageDesc); ?>">
    <meta property="og:url" content="<?php echo htmlspecialchars($canonical); ?>">
    <meta property="og:type" content="website">
    <meta property="og:image" content="https://dropcars.in/assets/images/airport-transfer-hero.png">
    <meta name="twitter:card" content="summary_large_image">

    <!-- Schema.org – Service + AirportShuttle -->
    <?php
    $localBusinessSchema = [
        '@type' => 'LocalBusiness',
        'name' => 'Drop Cars',
        'url' => 'https://dropcars.in',
        'telephone' => '+91' . $phoneDigits,
        'address' => ['@type' => 'PostalAddress', 'addressRegion' => 'Tamil Nadu', 'addressCountry' => 'IN'],
        'openingHours' => 'Mo-Su 00:00-23:59',
    ];
    // Only attach aggregateRating when there's real, approved review data
    // behind it (computed above) - never a placeholder rating.
    if ($aggregateRating !== null) {
        $localBusinessSchema['aggregateRating'] = [
            '@type' => 'AggregateRating',
            'ratingValue' => $aggregateRating['ratingValue'],
            'reviewCount' => $aggregateRating['reviewCount'],
        ];
    }
    $serviceSchema = [
        '@context' => 'https://schema.org',
        '@type' => 'Service',
        'serviceType' => 'Airport Shuttle',
        'name' => 'Airport Taxi Tamil Nadu – Drop Cars',
        'description' => $pageDesc,
        'url' => $canonical,
        'provider' => $localBusinessSchema,
        'areaServed' => ['Chennai', 'Coimbatore', 'Madurai', 'Trichy', 'Salem', 'Vellore', 'Pondicherry', 'Tiruvannamalai'],
        'availableChannel' => [
            '@type' => 'ServiceChannel',
            'serviceUrl' => $canonical,
            'servicePhone' => '+91' . $phoneDigits,
        ],
        'breadcrumb' => [
            '@type' => 'BreadcrumbList',
            'itemListElement' => [
                ['@type' => 'ListItem', 'position' => 1, 'name' => 'Home', 'item' => 'https://dropcars.in'],
                ['@type' => 'ListItem', 'position' => 2, 'name' => 'Services', 'item' => 'https://dropcars.in/services'],
                ['@type' => 'ListItem', 'position' => 3, 'name' => 'Airport Transfer', 'item' => $canonical],
            ],
        ],
    ];
    ?>
    <script type="application/ld+json"><?php echo json_encode($serviceSchema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); ?></script>

    <!-- FAQ Schema - generated from $airportFaqs, the same array that renders the visible FAQ accordion below -->
    <?php
    $faqSchema = [
        '@context' => 'https://schema.org',
        '@type' => 'FAQPage',
        'mainEntity' => array_map(function ($faq) {
            return [
                '@type' => 'Question',
                'name' => $faq[0],
                'acceptedAnswer' => ['@type' => 'Answer', 'text' => $faq[1]],
            ];
        }, $airportFaqs),
    ];
    ?>
    <script type="application/ld+json"><?php echo json_encode($faqSchema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); ?></script>

    <!-- HowTo Schema - generated from $airportHowToSteps, the same array that renders the visible "How to Book" list below -->
    <?php
    $howToSchema = [
        '@context' => 'https://schema.org',
        '@type' => 'HowTo',
        'name' => 'How to Book Airport Cab in Tamil Nadu',
        'step' => array_map(function ($step, $i) {
            return [
                '@type' => 'HowToStep',
                'position' => $i + 1,
                'name' => $step[0],
                'text' => $step[1],
            ];
        }, $airportHowToSteps, array_keys($airportHowToSteps)),
    ];
    ?>
    <script type="application/ld+json"><?php echo json_encode($howToSchema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); ?></script>

    <?php if (function_exists('dropcars_render_favicons')) { dropcars_render_favicons($activeTheme['slug'] ?? null); } ?>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">

    <link rel="stylesheet" href="/assets/css/base.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/base.css'); ?>">
    <link rel="stylesheet" href="/assets/css/layout.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/layout.css'); ?>">
    <link rel="stylesheet" href="/assets/css/navbar.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/navbar.css'); ?>">
    <link rel="stylesheet" href="/assets/css/booking-form.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/booking-form.css'); ?>">
    <link rel="stylesheet" href="/assets/css/footer.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/footer.css'); ?>">
    <link rel="stylesheet" href="/assets/css/whatsapp.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/whatsapp.css'); ?>">
    <link rel="stylesheet" href="/assets/css/page-animations.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/page-animations.css'); ?>">
    <link rel="stylesheet" href="/assets/css/dark-mode.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/dark-mode.css'); ?>">
    <link rel="stylesheet" href="/assets/css/light-theme.css?v=<?php echo @filemtime(__DIR__.'/../assets/css/light-theme.css'); ?>">
    <?php if (($activeTheme['slug'] ?? '') === 'airport-taxi'): ?>
    <link rel="stylesheet" href="/assets/css/theme-airporttaxi.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/theme-airporttaxi.css'); ?>">
    <?php endif; ?>
    <script src="/assets/js/dark-mode.js?v=<?php echo @filemtime(__DIR__.'/../assets/js/dark-mode.js'); ?>"></script>
<?php if (is_file(__DIR__ . '/../includes/google-tag.php')) { include __DIR__ . '/../includes/google-tag.php'; } ?>

    <style>
    /* ── Responsive & Horizontal Overflow Protection ── */
    html, body {
      overflow-x: hidden !important;
      width: 100% !important;
      max-width: 100vw !important;
      margin: 0;
      padding: 0;
    }

    *, *::before, *::after {
      box-sizing: border-box !important;
    }

    .airport-hero {
      background: linear-gradient(135deg, #0b1f3a 0%, #1e3a8a 50%, #0f172a 100%);
      color: #ffffff;
      padding: 1.25rem 0 1.75rem;
      position: relative;
      overflow: hidden !important;
      width: 100% !important;
      max-width: 100% !important;
    }

    @media (max-width: 900px) {
      .airport-hero { padding: 1rem 0 1.25rem; }
    }

    .container {
      width: min(1200px, 100% - 2rem) !important;
      margin-left: auto !important;
      margin-right: auto !important;
      box-sizing: border-box !important;
    }

    .airport-hero__layout {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2rem;
      align-items: start;
      width: 100% !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
    }

    .airport-hero__form-column,
    .airport-hero__content {
      width: 100% !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
    }

    .airport-hero__layout > *,
    .hero-features-grid > * {
      min-width: 0 !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
    }

    @media (max-width: 900px) {
      .airport-hero__layout {
        grid-template-columns: 1fr !important;
        gap: 1.5rem !important;
      }
    }

    .airport-hero__content {
      width: 100% !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
    }

    .hero-features-grid {
      display: grid !important;
      grid-template-columns: repeat(2, 1fr) !important;
      gap: 0.45rem !important;
      width: 100% !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
    }

    .hero-features-grid > div {
      min-width: 0 !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
      padding: 0.45rem 0.55rem !important;
      gap: 0.4rem !important;
    }

    .page-hero__title {
      font-size: clamp(1.25rem, 4.5vw, 2.4rem) !important;
      line-height: 1.25 !important;
      overflow-wrap: break-word !important;
      word-wrap: break-word !important;
      max-width: 100% !important;
    }

    .page-hero__desc {
      font-size: clamp(0.82rem, 3.2vw, 0.95rem) !important;
      line-height: 1.5 !important;
      overflow-wrap: break-word !important;
      word-wrap: break-word !important;
      max-width: 100% !important;
    }

    .page-hero__badge {
      max-width: 100% !important;
      white-space: normal !important;
      font-size: clamp(0.72rem, 2.8vw, 0.85rem) !important;
    }

    /* ── Airport Booking Form: Vehicle Selector Fix ── */
    #airport-booking-form #vehicle-selector-field {
      width: 100% !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
    }

    #airport-booking-form #vehicle-suggest-hint {
      font-size: 0.72rem !important;
      white-space: normal !important;
      flex-wrap: wrap !important;
      word-break: break-word !important;
      color: #38bdf8 !important;
    }

    #airport-booking-form .vehicle-selector-grid {
      display: grid !important;
      grid-template-columns: repeat(4, 1fr) !important;
      gap: 0.4rem !important;
      overflow-x: visible !important;
      flex-wrap: unset !important;
      width: 100% !important;
      max-width: 100% !important;
    }

    #airport-booking-form .vehicle-selector-card {
      min-width: 0 !important;
      flex: unset !important;
      width: 100% !important;
      padding: 0.4rem 0.15rem !important;
    }

    #airport-booking-form .vehicle-selector-card img {
      max-width: 80% !important;
      height: auto !important;
      object-fit: contain !important;
    }

    #airport-booking-form .vehicle-selector-card__name {
      font-size: 0.68rem !important;
      white-space: nowrap !important;
    }

    /* ── Airport Booking Form Sub-Tabs ── */
    .airport-subtabs {
      display: flex;
      gap: 0.35rem;
      margin-bottom: 0.85rem;
      background: rgba(2, 132, 199, 0.08);
      padding: 0.3rem;
      border-radius: 12px;
      border: 1px solid rgba(2, 132, 199, 0.18);
    }
    .airport-subtab {
      flex: 1;
      min-width: 0;
      padding: 0.45rem 0.4rem;
      font-size: 0.82rem;
      font-weight: 700;
      color: #475569;
      background: transparent;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.35rem;
      user-select: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    @media (max-width: 360px) {
      .airport-subtab { font-size: 0.74rem; padding: 0.45rem 0.2rem; }
    }
    .airport-subtab.active {
      background: linear-gradient(135deg, #0284c7, #1d4ed8);
      color: #ffffff;
      box-shadow: 0 3px 10px rgba(2, 132, 199, 0.3);
    }

    /* ── Progressive Expandable Form Steps ── */
    .form-step {
      border: none !important;
      border-radius: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      transition: opacity 0.25s ease;
    }
    .form-step.active {
      border: none !important;
      box-shadow: none !important;
    }
    .form-step-header {
      padding: 0.5rem 0;
      background: transparent;
      font-size: 0.84rem;
      font-weight: 700;
      color: #0f172a;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      user-select: none;
      transition: color 0.2s ease;
    }
    .form-step.active .form-step-header {
      background: transparent;
      color: #0284c7;
    }
    .form-step-body {
      padding: 0 !important;
      display: none;
    }
    .form-step.active .form-step-body {
      display: block;
    }
    .btn-step-next {
      width: 100%;
      padding: 0.6rem 0.85rem;
      background: linear-gradient(135deg, #0284c7, #1d4ed8);
      color: #ffffff;
      font-size: 0.84rem;
      font-weight: 700;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      margin-top: 0.6rem;
      transition: all 0.2s ease;
    }
    .btn-step-next:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);
    }

    /* Floating Plane Animation */
    .airport-hero__plane {
      position: absolute;
      top: 15%;
      right: 5%;
      font-size: 5rem;
      opacity: 0.12;
      animation: floatPlane 8s ease-in-out infinite;
      pointer-events: none;
    }
    @keyframes floatPlane {
      0%, 100% { transform: translateY(0) rotate(0deg); }
      50% { transform: translateY(-15px) rotate(3deg); }
    }

    /* Quick Airport Chip Bar */
    .airport-quick-select {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin-bottom: 1rem;
    }
    .airport-chip {
      background: rgba(255,255,255,0.12);
      color: #ffffff;
      border: 1px solid rgba(255,255,255,0.25);
      border-radius: 100px;
      padding: 0.35rem 0.85rem;
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      user-select: none;
    }
    .airport-chip:hover,
    .airport-chip.active {
      background: #2563eb;
      color: #ffffff;
      border-color: #2563eb;
      transform: translateY(-1px);
    }

    /* Stats Bar */
    .stats-bar {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
      background: #ffffff;
      border-radius: 16px;
      padding: 1.25rem 1.5rem;
      box-shadow: 0 10px 30px rgba(0,0,0,0.08);
      margin-top: -2rem;
      position: relative;
      z-index: 10;
      border: 1px solid #e2e8f0;
    }
    [data-theme="dark"] .stats-bar,
    .dark-mode .stats-bar {
      background: #1e293b;
      border-color: #334155;
    }
    @media (max-width: 640px) {
      .stats-bar { grid-template-columns: repeat(2, 1fr); gap: 0.85rem; padding: 1rem; }
    }
    .stat-item { text-align: center; }
    .stat-item__number {
      font-size: 1.5rem;
      font-weight: 800;
      color: #1e3a8a;
      line-height: 1;
    }
    [data-theme="dark"] .stat-item__number,
    .dark-mode .stat-item__number { color: #60a5fa; }
    .stat-item__label {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 0.25rem;
      font-weight: 600;
    }

    /* ── Airport Cards ── */
    .airport-cards-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
    }
    @media (max-width: 900px) { .airport-cards-grid { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 560px) { .airport-cards-grid { grid-template-columns: 1fr; } }

    .airport-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 1rem 1.15rem;
      transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    [data-theme="dark"] .airport-card,
    .dark-mode .airport-card { background: #1e293b; border-color: #334155; }
    .airport-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 10px 25px rgba(0,0,0,0.06);
      border-color: #bfdbfe;
    }
    .airport-card__header {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      margin-bottom: 0.35rem;
      flex-wrap: wrap;
    }
    .airport-card__iata {
      display: inline-block;
      background: linear-gradient(135deg, #1e3a8a, #2563eb);
      color: #fff;
      font-weight: 800;
      font-size: 0.7rem;
      letter-spacing: 0.06em;
      padding: 0.15rem 0.5rem;
      border-radius: 5px;
    }
    .airport-card__icon { font-size: 1.2rem; display: inline-block; line-height: 1; }
    .airport-card__name { font-size: 0.92rem; font-weight: 700; color: #0f172a; margin: 0; line-height: 1.3; }
    [data-theme="dark"] .airport-card__name,
    .dark-mode .airport-card__name { color: #f1f5f9; }
    /* ── Quick Select Airport Infinite Marquee Ribbon ── */
    .airport-marquee-wrapper {
      max-width: 480px;
      overflow: hidden;
      position: relative;
      margin-bottom: 1rem;
      mask-image: linear-gradient(to right, transparent 0%, #000 6%, #000 94%, transparent 100%);
      -webkit-mask-image: linear-gradient(to right, transparent 0%, #000 6%, #000 94%, transparent 100%);
    }

    .airport-quick-select {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      overflow-x: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
      padding: 0.2rem 0;
    }
    .airport-quick-select::-webkit-scrollbar { display: none; }

    .airport-quick-track {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      flex-shrink: 0;
      white-space: nowrap;
      animation: airportMarquee 24s linear infinite;
    }

    .airport-marquee-wrapper:hover .airport-quick-track {
      animation-play-state: paused;
    }

    @keyframes airportMarquee {
      0% { transform: translateX(0); }
      100% { transform: translateX(-50%); }
    }

    .airport-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.35rem 0.8rem;
      border-radius: 100px;
      background: rgba(255, 255, 255, 0.14);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.25);
      font-size: 0.78rem;
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;
      transition: all 0.2s ease;
      flex-shrink: 0;
    }
    .airport-chip:hover {
      background: #f59e0b;
      color: #0b1f3a;
      border-color: #f59e0b;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(245, 158, 11, 0.35);
    }

    .airport-card__city { font-size: 0.75rem; color: #64748b; margin-bottom: 0.35rem; font-weight: 500; }
    .airport-card__desc { font-size: 0.78rem; color: #64748b; line-height: 1.4; margin-bottom: 0.6rem; }
    .airport-card__routes {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      margin-bottom: 0.6rem;
    }
    .airport-card__route-tag {
      background: #f1f5f9;
      color: #475569;
      font-size: 0.7rem;
      padding: 0.1rem 0.45rem;
      border-radius: 100px;
      font-weight: 500;
    }
    [data-theme="dark"] .airport-card__route-tag,
    .dark-mode .airport-card__route-tag { background: #334155; color: #cbd5e1; }
    .airport-card__book-btn {
      display: block;
      margin-top: auto;
      background: linear-gradient(135deg, #1e3a8a, #2563eb);
      color: #fff;
      text-align: center;
      padding: 0.45rem 0.75rem;
      border-radius: 8px;
      font-size: 0.8rem;
      font-weight: 600;
      text-decoration: none;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }
    .airport-card__book-btn:hover { opacity: 0.9; transform: translateY(-1px); }

    /* ── Routes Table ── */
    .routes-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    .routes-table th {
      background: #1e3a8a;
      color: #ffffff;
      padding: 0.75rem 1rem;
      text-align: left;
      font-weight: 700;
    }
    .routes-table td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #e2e8f0;
      color: #334155;
    }
    [data-theme="dark"] .routes-table td,
    .dark-mode .routes-table td { border-color: #334155; color: #cbd5e1; }
    .routes-table tr:hover td { background: rgba(37,99,235,0.04); }

    .route-tabs {
      display: flex;
      gap: 0.5rem;
      overflow-x: auto;
      padding-bottom: 0.5rem;
      margin-bottom: 1.5rem;
    }
    .route-tab {
      background: #f1f5f9;
      color: #475569;
      border: none;
      padding: 0.5rem 1.2rem;
      border-radius: 100px;
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.2s ease;
    }
    [data-theme="dark"] .route-tab,
    .dark-mode .route-tab { background: #334155; color: #cbd5e1; }
    .route-tab.active,
    .route-tab:hover { background: #1e3a8a; color: #ffffff; }

    .route-table-panel { display: none; }
    .route-table-panel.active { display: block; }

    /* ── Why Choose Section (Compact & Sleek) ── */
    .airport-why-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.85rem;
    }
    @media (max-width: 900px) { .airport-why-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 500px) { .airport-why-grid { grid-template-columns: 1fr; } }

    .why-item {
      text-align: left;
      padding: 0.95rem 1rem;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      box-shadow: 0 2px 6px rgba(0,0,0,0.02);
    }
    [data-theme="dark"] .why-item,
    .dark-mode .why-item { background: #1e293b; border-color: #334155; }
    .why-item:hover { transform: translateY(-3px); box-shadow: 0 10px 24px rgba(0,0,0,0.06); border-color: #bfdbfe; }
    .why-item__icon-wrapper {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      background: #eff6ff;
      border-radius: 10px;
      font-size: 1.2rem;
      margin-bottom: 0.55rem;
    }
    [data-theme="dark"] .why-item__icon-wrapper,
    .dark-mode .why-item__icon-wrapper { background: rgba(37,99,235,0.2); }
    .why-item__title { font-weight: 700; color: #0f172a; font-size: 0.88rem; margin-bottom: 0.25rem; line-height: 1.3; }
    [data-theme="dark"] .why-item__title,
    .dark-mode .why-item__title { color: #f1f5f9; }
    .why-item__desc { font-size: 0.78rem; color: #64748b; line-height: 1.4; }
    [data-theme="dark"] .why-item__desc,
    .dark-mode .why-item__desc { color: #94a3b8; }

    /* ── All Airport Routes Tab Bar ── */
    .airport-filter-tabs {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.55rem;
      margin-bottom: 2rem;
    }
    .airport-filter-btn {
      background: #ffffff;
      color: #0f172a;
      border: 1px solid #cbd5e1;
      border-radius: 100px;
      padding: 0.5rem 1.25rem;
      font-size: 0.88rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 2px 6px rgba(0,0,0,0.04);
      user-select: none;
    }
    .airport-filter-btn:hover {
      background: #f1f5f9;
      border-color: #94a3b8;
      transform: translateY(-1px);
    }
    .airport-filter-btn.active {
      background: #0f172a;
      color: #ffffff;
      border-color: #0f172a;
      box-shadow: 0 4px 14px rgba(15,23,42,0.25);
    }
    [data-theme="dark"] .airport-filter-btn,
    .dark-mode .airport-filter-btn {
      background: #1e293b;
      color: #f1f5f9;
      border-color: #334155;
    }
    [data-theme="dark"] .airport-filter-btn.active,
    .dark-mode .airport-filter-btn.active {
      background: #2563eb;
      color: #ffffff;
      border-color: #2563eb;
      box-shadow: 0 4px 14px rgba(37,99,235,0.35);
    }
    .airport-route-panel {
      display: none;
      flex-wrap: wrap;
      gap: 0.65rem;
      justify-content: center;
    }
    .airport-route-panel.active {
      display: flex;
    }

    /* ── SEO Content section ── */
    .seo-content { line-height: 1.8; color: #475569; }
    .seo-content h2 { color: #0f172a; margin: 2rem 0 0.75rem; font-size: 1.4rem; }
    [data-theme="dark"] .seo-content h2,
    .dark-mode .seo-content h2 { color: #f1f5f9; }
    .seo-content h3 { color: #1e3a8a; margin: 1.5rem 0 0.5rem; font-size: 1.1rem; }
    [data-theme="dark"] .seo-content h3,
    .dark-mode .seo-content h3 { color: #60a5fa; }
    .seo-content ul { padding-left: 1.5rem; }
    .seo-content ul li { margin-bottom: 0.4rem; }

    /* ── Progressive Multi-Step Form Reveal (Seamless, No Outer Borders) ── */
    .form-step {
      display: none !important;
      opacity: 0;
      pointer-events: none;
      margin: 0;
      padding: 0;
      border: none !important;
      background: transparent !important;
      box-shadow: none !important;
      transition: opacity 0.3s ease;
    }

    .form-step.active,
    .form-step--1 {
      display: block !important;
      opacity: 1 !important;
      pointer-events: auto !important;
      overflow: visible !important;
      margin-top: 0.5rem;
    }

    .form-step--1 {
      margin-top: 0 !important;
    }

    .btn-step-next {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 0.35rem !important;
      width: 100% !important;
      padding: 0.5rem 0.85rem !important;
      margin-top: 0.65rem !important;
      background: #f1f5f9 !important;
      color: #0f172a !important;
      border: 1px solid #cbd5e1 !important;
      border-radius: 8px !important;
      font-size: 0.8rem !important;
      font-weight: 700 !important;
      cursor: pointer !important;
      transition: all 0.2s ease !important;
    }
    .btn-step-next:hover {
      background: #0284c7 !important;
      color: #ffffff !important;
      border-color: #0284c7 !important;
    }
    [data-theme="dark"] .btn-step-next,
    .dark-mode .btn-step-next {
      background: #1e293b !important;
      color: #f1f5f9 !important;
      border-color: #334155 !important;
    }
    [data-theme="dark"] .btn-step-next:hover,
    .dark-mode .btn-step-next:hover {
      background: #2563eb !important;
      color: #ffffff !important;
      border-color: #2563eb !important;
    }

    .step-header {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin: 0.6rem 0 0.35rem;
      padding-top: 0.4rem;
      border-top: 1px dashed #e2e8f0;
    }

    /* Luggage Popover & Counter Stepper Styling */
    .luggage-popover.is-hidden {
      display: none !important;
    }

    [data-theme="dark"] .luggage-popover,
    .dark-mode .luggage-popover {
      background: #1e293b !important;
      border-color: #334155 !important;
      color: #f8fafc !important;
    }

    [data-theme="dark"] .luggage-popover *,
    .dark-mode .luggage-popover * {
      color: #f8fafc !important;
    }

    [data-theme="dark"] .luggage-picker-trigger,
    .dark-mode .luggage-picker-trigger {
      background: #1e293b !important;
      border-color: #334155 !important;
      color: #f8fafc !important;
    }

    [data-theme="dark"] .stepper-btn,
    .dark-mode .stepper-btn {
      background: #334155 !important;
      border-color: #475569 !important;
      color: #f8fafc !important;
    }

    [data-theme="dark"] .step-header,
    .dark-mode .step-header {
      border-color: #334155;
    }

    .step-number {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      background: linear-gradient(135deg, #0284c7, #2563eb);
      color: #ffffff;
      font-size: 0.65rem;
      font-weight: 800;
      border-radius: 50%;
    }

    .step-title {
      font-size: 0.75rem;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: 0.02em;
    }

    [data-theme="dark"] .step-title,
    .dark-mode .step-title {
      color: #f1f5f9;
    }

    /* ── Fleet Tariff Cards (Light & Dark Theme) ── */
    .fleet-tariff-card {
      background: #ffffff;
      border-radius: 14px;
      border: 1px solid #e2e8f0;
      padding: 1.25rem;
      box-shadow: 0 4px 14px rgba(0,0,0,0.04);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
    }
    .fleet-tariff-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 28px rgba(0,0,0,0.1);
      border-color: #0284c7;
    }
    .fleet-tariff-card__header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }
    .fleet-tariff-card__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 44px;
    }
    .fleet-tariff-card__icon img {
      height: 40px;
      width: auto;
      max-width: 95px;
      object-fit: contain;
      filter: drop-shadow(0 2px 5px rgba(0,0,0,0.18));
    }
    .fleet-tariff-card__badge {
      background: rgba(37,99,235,0.1);
      color: #2563eb;
      font-weight: 700;
      font-size: 0.75rem;
      padding: 0.2rem 0.55rem;
      border-radius: 100px;
    }
    .fleet-tariff-card__badge--luxury {
      background: rgba(245,158,11,0.15);
      color: #d97706;
    }
    .fleet-tariff-card__title {
      font-size: 1.1rem;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 0.25rem;
    }
    .fleet-tariff-card__desc {
      font-size: 0.78rem;
      color: #64748b;
      margin-bottom: 0.75rem;
      line-height: 1.4;
    }
    .fleet-tariff-card__rates {
      background: #f8fafc;
      padding: 0.6rem 0.75rem;
      border-radius: 8px;
      font-size: 0.82rem;
      margin-bottom: 0.5rem;
      border: 1px solid #e2e8f0;
    }
    .fleet-tariff-card__rate-row {
      display: flex;
      justify-content: space-between;
      color: #475569;
      margin-top: 0.25rem;
    }
    .fleet-tariff-card__rate-row--bold {
      font-weight: 700;
      color: #0f172a;
      margin-top: 0;
    }
    .rate-label {
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
    }
    .tariff-info-trigger {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: rgba(2, 132, 199, 0.12);
      color: #0284c7;
      font-size: 0.7rem;
      font-weight: 800;
      font-family: inherit;
      cursor: pointer;
      margin-left: 4px;
      transition: all 0.2s ease;
      user-select: none;
    }
    .tariff-info-trigger:hover,
    .tariff-info-trigger:focus {
      background: #0284c7;
      color: #ffffff;
    }
    .tariff-tooltip-box {
      visibility: hidden;
      opacity: 0;
      width: 210px;
      background: #0f172a;
      color: #f8fafc;
      font-size: 0.72rem;
      font-weight: 400;
      line-height: 1.4;
      text-align: left;
      border-radius: 8px;
      padding: 8px 10px;
      position: absolute;
      z-index: 100;
      bottom: 125%;
      left: 50%;
      transform: translateX(-50%) translateY(4px);
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
      transition: all 0.2s ease;
      pointer-events: none;
      border: 1px solid rgba(255, 255, 255, 0.15);
    }
    .tariff-tooltip-box::after {
      content: "";
      position: absolute;
      top: 100%;
      left: 50%;
      margin-left: -5px;
      border-width: 5px;
      border-style: solid;
      border-color: #0f172a transparent transparent transparent;
    }
    .tariff-info-trigger:hover .tariff-tooltip-box,
    .tariff-info-trigger:focus .tariff-tooltip-box {
      visibility: visible;
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    .fleet-tariff-card__bata-note {
      font-size: 0.7rem;
      color: #64748b;
      margin-top: 0.4rem;
      padding-top: 0.35rem;
      border-top: 1px dashed #e2e8f0;
      font-weight: 500;
      line-height: 1.3;
    }
    [data-theme="dark"] .fleet-tariff-card__bata-note,
    .dark-mode .fleet-tariff-card__bata-note {
      color: #94a3b8 !important;
      border-top-color: #334155 !important;
    }
    [data-theme="dark"] .tariff-info-trigger,
    .dark-mode .tariff-info-trigger {
      background: rgba(56, 189, 248, 0.2) !important;
      color: #38bdf8 !important;
    }
    [data-theme="dark"] .tariff-info-trigger:hover,
    .dark-mode .tariff-info-trigger:hover {
      background: #38bdf8 !important;
      color: #0b1727 !important;
    }
    .fleet-tariff-card__btn {
      display: block;
      text-align: center;
      background: linear-gradient(135deg, #0284c7, #1d4ed8);
      color: #ffffff !important;
      font-weight: 700;
      font-size: 0.82rem;
      padding: 0.55rem;
      border-radius: 8px;
      text-decoration: none;
      margin-top: 0.5rem;
      box-shadow: 0 3px 10px rgba(2, 132, 199, 0.25);
    }
    .fleet-tariff-card__btn:hover {
      background: linear-gradient(135deg, #0369a1, #1e40af);
    }

    /* ── Dark Mode Overrides for Entire Airport Page Sections & Cards ── */
    [data-theme="dark"] .fleet-tariffs-section,
    .dark-mode .fleet-tariffs-section {
      background: #060d1e !important;
    }
    [data-theme="dark"] .fleet-tariff-card,
    .dark-mode .fleet-tariff-card {
      background: #0f172a !important;
      border-color: #1e293b !important;
      box-shadow: 0 6px 24px rgba(0,0,0,0.4) !important;
    }
    [data-theme="dark"] .fleet-tariff-card:hover,
    .dark-mode .fleet-tariff-card:hover {
      border-color: #38bdf8 !important;
      box-shadow: 0 12px 32px rgba(0,0,0,0.5), 0 0 12px rgba(56,189,248,0.2) !important;
    }
    [data-theme="dark"] .fleet-tariff-card__title,
    .dark-mode .fleet-tariff-card__title {
      color: #f8fafc !important;
    }
    [data-theme="dark"] .fleet-tariff-card__desc,
    .dark-mode .fleet-tariff-card__desc {
      color: #cbd5e1 !important;
    }
    [data-theme="dark"] .fleet-tariff-card__rates,
    .dark-mode .fleet-tariff-card__rates {
      background: #1e293b !important;
      border-color: #334155 !important;
    }
    [data-theme="dark"] .fleet-tariff-card__rate-row,
    .dark-mode .fleet-tariff-card__rate-row {
      color: #cbd5e1 !important;
    }
    [data-theme="dark"] .fleet-tariff-card__rate-row--bold,
    .dark-mode .fleet-tariff-card__rate-row--bold {
      color: #f8fafc !important;
    }
    [data-theme="dark"] .fleet-tariff-card__badge,
    .dark-mode .fleet-tariff-card__badge {
      background: rgba(56,189,248,0.15) !important;
      color: #38bdf8 !important;
    }
    [data-theme="dark"] .fleet-tariff-card__badge--luxury,
    .dark-mode .fleet-tariff-card__badge--luxury {
      background: rgba(250,204,21,0.18) !important;
      color: #facc15 !important;
    }
    [data-theme="dark"] .section-title,
    .dark-mode .section-title {
      color: #f8fafc !important;
    }
    [data-theme="dark"] .section-subtitle,
    [data-theme="dark"] .section-desc,
    .dark-mode .section-subtitle,
    .dark-mode .section-desc {
      color: #cbd5e1 !important;
    }
    [data-theme="dark"] .section-eyebrow,
    .dark-mode .section-eyebrow {
      color: #38bdf8 !important;
    }

    /* ── Surface Section & Tab Scrollbar Hiding ── */
    .page-section--surface {
      background: #f8fafc;
      color: #0f172a;
    }

    [data-theme="dark"] .page-section--surface,
    .dark-mode .page-section--surface,
    [data-theme="dark"] .page-section,
    .dark-mode .page-section {
      background: #060d1e !important;
      color: #f8fafc !important;
    }

    /* Clean Tab Scrollbars (No default OS grey bar) */
    .route-tabs,
    .airport-filter-tabs {
      scrollbar-width: none !important;
      -ms-overflow-style: none !important;
    }
    .route-tabs::-webkit-scrollbar,
    .airport-filter-tabs::-webkit-scrollbar {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
    }

    /* Airport Cards Grid in Dark Mode */
    [data-theme="dark"] .airport-card,
    .dark-mode .airport-card {
      background: #0f172a !important;
      border-color: #1e293b !important;
      color: #f8fafc !important;
    }
    [data-theme="dark"] .airport-card__name,
    .dark-mode .airport-card__name {
      color: #f8fafc !important;
    }
    [data-theme="dark"] .airport-card__city,
    [data-theme="dark"] .airport-card__desc,
    .dark-mode .airport-card__city,
    .dark-mode .airport-card__desc {
      color: #cbd5e1 !important;
    }
    [data-theme="dark"] .airport-card__route-tag,
    .dark-mode .airport-card__route-tag {
      background: #1e293b !important;
      border-color: #334155 !important;
      color: #38bdf8 !important;
    }

    /* Routes Table & Tabs in Dark Mode */
    [data-theme="dark"] .route-tab,
    [data-theme="dark"] .airport-filter-btn,
    .dark-mode .route-tab,
    .dark-mode .airport-filter-btn {
      background: #0f172a !important;
      border-color: #1e293b !important;
      color: #cbd5e1 !important;
    }
    [data-theme="dark"] .route-tab.active,
    [data-theme="dark"] .airport-filter-btn.active,
    .dark-mode .route-tab.active,
    .dark-mode .airport-filter-btn.active {
      background: #0284c7 !important;
      border-color: #0284c7 !important;
      color: #ffffff !important;
    }
    [data-theme="dark"] .routes-table th,
    .dark-mode .routes-table th {
      background: #0f172a !important;
      color: #f8fafc !important;
      border-bottom: 2px solid #1e293b !important;
    }
    [data-theme="dark"] .routes-table td,
    .dark-mode .routes-table td {
      background: #0b1329 !important;
      border-color: #1e293b !important;
      color: #cbd5e1 !important;
    }
    [data-theme="dark"] .routes-table tr:nth-child(even) td,
    .dark-mode .routes-table tr:nth-child(even) td {
      background: #0f172a !important;
    }

    /* Route Pills in Dark Mode */
    [data-theme="dark"] .route-pill,
    .dark-mode .route-pill {
      background: #0f172a !important;
      border-color: #1e293b !important;
      color: #e2e8f0 !important;
    }
    [data-theme="dark"] .route-pill:hover,
    .dark-mode .route-pill:hover {
      background: #1e293b !important;
      border-color: #38bdf8 !important;
      color: #38bdf8 !important;
    }

    /* SEO Content & FAQ in Dark Mode */
    [data-theme="dark"] .seo-content,
    .dark-mode .seo-content {
      background: #0f172a !important;
      border-color: #1e293b !important;
      color: #cbd5e1 !important;
    }
    [data-theme="dark"] .seo-content h2,
    [data-theme="dark"] .seo-content h3,
    .dark-mode .seo-content h2,
    .dark-mode .seo-content h3 {
      color: #f8fafc !important;
    }
    [data-theme="dark"] .faq-item,
    .dark-mode .faq-item {
      background: #0f172a !important;
      border-color: #1e293b !important;
    }
    [data-theme="dark"] .faq-question,
    .dark-mode .faq-question {
      color: #f8fafc !important;
    }
    [data-theme="dark"] .faq-answer p,
    .dark-mode .faq-answer p {
      color: #cbd5e1 !important;
    }

    /* ── Airport Booking Card — Single Outer Container ── */
    .booking-card--home#airport-booking-form,
    .airport-hero__booking-card {
      background: #ffffff !important;
      border-radius: 16px !important;
      padding: 1.15rem !important;
      box-shadow: 0 20px 45px rgba(0, 0, 0, 0.22) !important;
      border: 1px solid rgba(226, 232, 240, 0.8) !important;
      overflow: visible !important;
      box-sizing: border-box !important;
    }

    /* Inner Form Wrappers — Single Padding & Full Wide Span */
    .booking-form,
    .form-step,
    .form-step-body,
    .step-content {
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      border-radius: 0 !important;
      padding: 0 !important;
      margin: 0 !important;
      width: 100% !important;
      max-width: 100% !important;
      overflow: visible !important;
    }

    .luggage-popover {
      position: absolute !important;
      top: calc(100% + 6px) !important;
      bottom: auto !important;
      right: 0 !important;
      left: auto !important;
      width: 260px !important;
      background: #ffffff !important;
      border: 1px solid #cbd5e1 !important;
      border-radius: 12px !important;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.22) !important;
      padding: 0.85rem !important;
      z-index: 99999 !important;
    }

    .booking-card,
    .booking-form,
    .form-step,
    #locations-wrapper,
    .field {
      overflow: visible !important;
    }

    .local-autocomplete-dropdown,
    .location-picker-dropdown,
    .pac-container,
    .location-suggestions {
      position: absolute !important;
      left: 0 !important;
      right: 0 !important;
      top: 100% !important;
      background: #ffffff !important;
      border: 1px solid #cbd5e1 !important;
      border-radius: 10px !important;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25) !important;
      max-height: 240px !important;
      overflow-y: auto !important;
      z-index: 999999 !important;
      margin-top: 4px !important;
      padding: 4px 0 !important;
      box-sizing: border-box !important;
      scrollbar-width: none !important;
      -ms-overflow-style: none !important;
    }

    .local-autocomplete-dropdown::-webkit-scrollbar,
    .location-picker-dropdown::-webkit-scrollbar,
    .pac-container::-webkit-scrollbar,
    .location-suggestions::-webkit-scrollbar {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
      background: transparent !important;
    }

    .local-autocomplete-item {
      padding: 10px 14px !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      font-size: 0.875rem !important;
      color: #0f172a !important;
      border-bottom: 1px solid #f1f5f9 !important;
    }

    .local-autocomplete-item:hover,
    .local-autocomplete-item.active {
      background: #f1f5f9 !important;
    }

    [data-theme="dark"] .local-autocomplete-dropdown,
    .dark-mode .local-autocomplete-dropdown {
      background: #1e293b !important;
      border-color: #334155 !important;
    }

    [data-theme="dark"] .local-autocomplete-item,
    .dark-mode .local-autocomplete-item {
      color: #f8fafc !important;
      border-bottom-color: #334155 !important;
    }

    [data-theme="dark"] .local-autocomplete-item:hover,
    [data-theme="dark"] .local-autocomplete-item.active,
    .dark-mode .local-autocomplete-item:hover,
    .dark-mode .local-autocomplete-item.active {
      background: #334155 !important;
    }

    .booking-form #form-response {
      margin-top: 0.6rem !important;
      padding: 0.55rem 0.85rem !important;
      border-radius: 8px !important;
      font-size: 0.85rem !important;
      font-weight: 600 !important;
      line-height: 1.4 !important;
      box-sizing: border-box !important;
      transition: all 0.2s ease !important;
    }

    .booking-form #form-response:empty {
      display: none !important;
    }

    .booking-form #form-response:not(:empty) {
      display: block !important;
      background: #fef2f2 !important;
      color: #991b1b !important;
      border: 1px solid #fecaca !important;
      box-shadow: 0 2px 8px rgba(185, 28, 28, 0.1) !important;
    }

    [data-theme="dark"] .booking-form #form-response:not(:empty),
    .dark-mode .booking-form #form-response:not(:empty) {
      background: rgba(153, 27, 27, 0.25) !important;
      color: #fca5a5 !important;
      border-color: rgba(239, 68, 68, 0.4) !important;
    }

    [data-theme="dark"] .booking-card--home#airport-booking-form,
    [data-theme="dark"] .airport-hero__booking-card,
    .dark-mode .booking-card--home#airport-booking-form,
    .dark-mode .airport-hero__booking-card {
      background: #0f172a !important;
      border-color: #334155 !important;
      box-shadow: 0 20px 45px rgba(0, 0, 0, 0.5) !important;
    }

    [data-theme="dark"] .booking-form,
    [data-theme="dark"] .form-step,
    [data-theme="dark"] .form-step-body,
    .dark-mode .booking-form,
    .dark-mode .form-step,
    .dark-mode .form-step-body {
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      padding: 0 !important;
      margin: 0 !important;
    }

    .airport-booking-title {
      font-size: 1.1rem !important;
      font-weight: 800 !important;
      color: #0f172a !important;
      margin: 0 0 0.5rem !important;
      line-height: 1.3 !important;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    [data-theme="dark"] .airport-booking-title,
    .dark-mode .airport-booking-title {
      color: #f8fafc !important;
    }

    .booking-card--home#airport-booking-form .booking-form,
    .airport-hero__booking-card .booking-form {
      display: flex !important;
      flex-direction: column !important;
      gap: 0.45rem !important;
    }

    /* Clean, sleek label & field rules — No uppercase, no label overlap */
    .booking-form *,
    .booking-form label,
    .booking-form span,
    .booking-form .field,
    .booking-form label.field {
      text-transform: none !important;
    }

    .booking-form .field,
    .booking-form label.field,
    .booking-form div.field {
      display: flex !important;
      flex-direction: column !important;
      justify-content: flex-start !important;
      align-items: flex-start !important;
      margin: 0 !important;
      height: auto !important;
      gap: 0.2rem !important;
      position: relative !important;
    }

    .booking-form span,
    .booking-form .field span,
    .booking-form label.field span,
    .booking-form .field__label-row {
      display: flex !important;
      align-items: center !important;
      position: static !important;
      margin-top: 0 !important;
      margin-bottom: 0.2rem !important;
      text-transform: none !important;
      font-size: 0.74rem !important;
      font-weight: 600 !important;
      color: #475569 !important;
      line-height: 1.2 !important;
    }

    /* Phone field label row: stretch full width, keep checkbox right-aligned */
    .booking-form .field__label-row {
      display: flex !important;
      width: 100% !important;
      justify-content: space-between !important;
      align-items: center !important;
      margin-bottom: 0.2rem !important;
    }

    /* Ensure phone field .field matches label.field height so the grid row aligns */
    .booking-form .field-pair--contact-primary .field,
    .booking-form .field-pair--contact-primary label.field {
      width: 100% !important;
      min-width: 0 !important;
    }

    /* Phone wrapper must match the 42px height of all other inputs */
    .booking-form .field-pair--contact-primary .phone-input-wrapper {
      height: 42px !important;
      min-height: 42px !important;
      max-height: 42px !important;
    }

    [data-theme="dark"] .booking-form span,
    [data-theme="dark"] .booking-form .field span,
    [data-theme="dark"] .booking-form label.field span,
    .dark-mode .booking-form span,
    .dark-mode .booking-form .field span,
    .dark-mode .booking-form label.field span {
      color: #cbd5e1 !important;
    }

    .booking-form input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not(.phone-national-input),
    .booking-form select,
    .booking-form .luggage-picker-trigger {
      margin-top: 0 !important;
      width: 100% !important;
      height: 42px !important;
      min-height: 42px !important;
      max-height: 42px !important;
      font-size: 0.875rem !important;
      line-height: normal !important;
      box-sizing: border-box !important;
      border: 1px solid #cbd5e1 !important;
      border-radius: 8px !important;
      background: #ffffff !important;
      color: #0f172a !important;
    }

    .booking-form input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not(.phone-national-input) {
      padding: 0 0.75rem !important;
    }

    /* Phone Input Wrapper — No double borders, seamless right alignment */
    .booking-form .phone-input-wrapper {
      display: flex !important;
      flex-direction: row !important;
      align-items: center !important;
      width: 100% !important;
      height: 42px !important;
      min-height: 42px !important;
      max-height: 42px !important;
      padding: 0 !important;
      border: 1px solid #cbd5e1 !important;
      border-radius: 8px !important;
      background: #ffffff !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
      margin-top: 0 !important;
    }

    .booking-form .phone-input-wrapper .country-code-field {
      height: 100% !important;
      display: flex !important;
      align-items: center !important;
      flex-shrink: 0 !important;
    }

    .booking-form .phone-input-wrapper .country-code-trigger {
      height: 100% !important;
      border: none !important;
      border-right: 1px solid #cbd5e1 !important;
      border-radius: 0 !important;
      background: transparent !important;
      color: #0f172a !important;
      font-size: 0.875rem !important;
      font-weight: 600 !important;
      padding: 0 0.65rem !important;
      margin: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }

    .booking-form .phone-input-wrapper input.phone-national-input {
      border: none !important;
      outline: none !important;
      box-shadow: none !important;
      background: transparent !important;
      height: 100% !important;
      flex: 1 !important;
      width: 100% !important;
      padding: 0 0.75rem !important;
      margin: 0 !important;
      font-size: 0.875rem !important;
      color: #0f172a !important;
      line-height: normal !important;
    }

    .booking-form .field.hidden {
      display: none !important;
    }

    .booking-form select,
    .booking-form .luggage-picker-trigger,
    .booking-form #luggage-display-text {
      font-family: inherit !important;
      font-size: 0.875rem !important;
      font-weight: 500 !important;
      color: #0f172a !important;
      letter-spacing: normal !important;
      text-transform: none !important;
    }

    .booking-form select {
      display: block !important;
      width: 100% !important;
      height: 42px !important;
      min-height: 42px !important;
      max-height: 42px !important;
      box-sizing: border-box !important;
      padding: 0.65rem 2rem 0.65rem 0.75rem !important;
      line-height: 1.2 !important;
      cursor: pointer !important;
      appearance: none !important;
      -webkit-appearance: none !important;
      -moz-appearance: none !important;
      background-color: #ffffff !important;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23334155' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E") !important;
      background-repeat: no-repeat !important;
      background-position: right 0.75rem center !important;
      background-size: 14px 14px !important;
    }

    .booking-form select option {
      background: #ffffff !important;
      color: #0f172a !important;
      font-size: 0.875rem !important;
      padding: 0.4rem !important;
    }

    .booking-form .luggage-picker-trigger {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      position: relative !important;
      padding: 0 2rem 0 0.75rem !important;
      cursor: pointer !important;
      text-align: left !important;
    }

    .booking-form .luggage-picker-trigger .luggage-arrow-icon {
      position: absolute !important;
      right: 0.75rem !important;
      top: 50% !important;
      transform: translateY(-50%) !important;
      pointer-events: none !important;
      flex-shrink: 0 !important;
    }

    /* Dark Mode Form Controls & Select Inputs */
    [data-theme="dark"] .booking-form select,
    .dark-mode .booking-form select {
      background-color: #1e293b !important;
      border-color: #334155 !important;
      color: #f8fafc !important;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23f8fafc' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E") !important;
    }

    [data-theme="dark"] .booking-form select option,
    .dark-mode .booking-form select option {
      background: #1e293b !important;
      color: #f8fafc !important;
    }

    [data-theme="dark"] .booking-form .luggage-picker-trigger,
    .dark-mode .booking-form .luggage-picker-trigger {
      background: #1e293b !important;
      border-color: #334155 !important;
      color: #f8fafc !important;
    }

    [data-theme="dark"] .booking-form #luggage-display-text,
    .dark-mode .booking-form #luggage-display-text {
      color: #f8fafc !important;
    }

    [data-theme="dark"] .luggage-popover,
    .dark-mode .luggage-popover {
      background: #1e293b !important;
      border-color: #334155 !important;
      color: #f8fafc !important;
      box-shadow: 0 12px 30px rgba(0,0,0,0.5) !important;
    }

    [data-theme="dark"] .booking-form .phone-input-wrapper,
    .dark-mode .booking-form .phone-input-wrapper {
      background: #1e293b !important;
      border-color: #334155 !important;
    }
    [data-theme="dark"] .booking-form .phone-input-wrapper .country-code-trigger,
    .dark-mode .booking-form .phone-input-wrapper .country-code-trigger {
      background: transparent !important;
      border-right: 1px solid #334155 !important;
      color: #f8fafc !important;
    }
    [data-theme="dark"] .booking-form .phone-input-wrapper input.phone-national-input,
    .dark-mode .booking-form .phone-input-wrapper input.phone-national-input {
      color: #f8fafc !important;
    }

    /* ── Country Code Popover & Option Styles ── */
    .country-code-popover {
      position: absolute !important;
      top: calc(100% + 4px) !important;
      left: 0 !important;
      z-index: 999999 !important;
      box-sizing: border-box !important;
      width: 110px !important;
      min-width: 110px !important;
      max-width: 110px !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 4px !important;
      align-items: stretch !important;
      padding: 6px !important;
      background: #ffffff !important;
      border: 1px solid #cbd5e1 !important;
      border-radius: 8px !important;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.22) !important;
    }

    .country-code-popover.is-hidden {
      display: none !important;
    }

    .country-code-option {
      box-sizing: border-box !important;
      width: 100% !important;
      min-height: 28px !important;
      margin: 0 !important;
      padding: 4px 6px !important;
      border: 1px solid #e2e8f0 !important;
      border-radius: 5px !important;
      background: #f8fafc !important;
      color: #0f172a !important;
      font-family: inherit !important;
      font-weight: 600 !important;
      font-size: 0.78rem !important;
      line-height: 1.2 !important;
      cursor: pointer !important;
      text-align: center !important;
      transition: background 0.15s ease, border-color 0.15s ease !important;
    }

    .country-code-option:hover {
      background: #e2e8f0 !important;
      border-color: #0284c7 !important;
      color: #0284c7 !important;
    }

    .country-code-manual-inline {
      box-sizing: border-box !important;
      width: 100% !important;
      height: 28px !important;
      min-height: 28px !important;
      margin-top: 2px !important;
      padding: 3px 6px !important;
      border: 1.5px dashed #0284c7 !important;
      border-radius: 5px !important;
      background: #ffffff !important;
      color: #0f172a !important;
      font-family: inherit !important;
      font-weight: 600 !important;
      font-size: 0.78rem !important;
      text-align: center !important;
      outline: none !important;
    }

    /* Dark Mode Country Code Popover */
    [data-theme="dark"] .country-code-popover,
    .dark-mode .country-code-popover {
      background: #0f172a !important;
      border-color: #334155 !important;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5) !important;
    }

    [data-theme="dark"] .country-code-option,
    .dark-mode .country-code-option {
      background: #1e293b !important;
      border-color: #334155 !important;
      color: #f8fafc !important;
    }

    [data-theme="dark"] .country-code-option:hover,
    .dark-mode .country-code-option:hover {
      background: #334155 !important;
      border-color: #38bdf8 !important;
      color: #38bdf8 !important;
    }

    [data-theme="dark"] .country-code-manual-inline,
    .dark-mode .country-code-manual-inline {
      background: #1e293b !important;
      border-color: #38bdf8 !important;
      color: #f8fafc !important;
    }

    /* Native Date & Time Picker Controls & Color Scheme */
    input[type="date"],
    input[type="time"] {
      color-scheme: light;
    }

    [data-theme="dark"] input[type="date"],
    [data-theme="dark"] input[type="time"],
    .dark-mode input[type="date"],
    .dark-mode input[type="time"] {
      color-scheme: dark !important;
      color: #f8fafc !important;
    }

    [data-theme="dark"] input[type="date"]::-webkit-calendar-picker-indicator,
    [data-theme="dark"] input[type="time"]::-webkit-calendar-picker-indicator,
    .dark-mode input[type="date"]::-webkit-calendar-picker-indicator,
    .dark-mode input[type="time"]::-webkit-calendar-picker-indicator {
      filter: invert(1) brightness(1.8) !important;
      opacity: 0.9 !important;
      cursor: pointer !important;
    }

    [data-theme="dark"] input[type="date"]::-webkit-datetime-edit,
    [data-theme="dark"] input[type="time"]::-webkit-datetime-edit,
    [data-theme="dark"] input[type="date"]::-webkit-datetime-edit-fields-wrapper,
    [data-theme="dark"] input[type="time"]::-webkit-datetime-edit-fields-wrapper,
    [data-theme="dark"] input[type="date"]::-webkit-datetime-edit-text,
    [data-theme="dark"] input[type="time"]::-webkit-datetime-edit-text,
    [data-theme="dark"] input[type="date"]::-webkit-datetime-edit-month-field,
    [data-theme="dark"] input[type="time"]::-webkit-datetime-edit-hour-field,
    [data-theme="dark"] input[type="date"]::-webkit-datetime-edit-day-field,
    [data-theme="dark"] input[type="time"]::-webkit-datetime-edit-minute-field,
    [data-theme="dark"] input[type="date"]::-webkit-datetime-edit-year-field,
    [data-theme="dark"] input[type="time"]::-webkit-datetime-edit-ampm-field,
    .dark-mode input[type="date"]::-webkit-datetime-edit,
    .dark-mode input[type="time"]::-webkit-datetime-edit,
    .dark-mode input[type="date"]::-webkit-datetime-edit-fields-wrapper,
    .dark-mode input[type="time"]::-webkit-datetime-edit-fields-wrapper,
    .dark-mode input[type="date"]::-webkit-datetime-edit-text,
    .dark-mode input[type="time"]::-webkit-datetime-edit-text,
    .dark-mode input[type="date"]::-webkit-datetime-edit-month-field,
    .dark-mode input[type="time"]::-webkit-datetime-edit-hour-field,
    .dark-mode input[type="date"]::-webkit-datetime-edit-day-field,
    .dark-mode input[type="time"]::-webkit-datetime-edit-minute-field,
    .dark-mode input[type="date"]::-webkit-datetime-edit-year-field,
    .dark-mode input[type="time"]::-webkit-datetime-edit-ampm-field {
      color: #f8fafc !important;
    }

    /* Unified Passengers Select & Luggage Bags Trigger */
    .booking-form select,
    .booking-form .luggage-picker-trigger {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      width: 100% !important;
      height: 42px !important;
      min-height: 42px !important;
      max-height: 42px !important;
      box-sizing: border-box !important;
      font-family: inherit !important;
      font-size: 0.875rem !important;
      font-weight: 500 !important;
      line-height: 1.2 !important;
      letter-spacing: normal !important;
      text-transform: none !important;
      border-radius: 8px !important;
      margin: 0 !important;
    }

    .booking-form #luggage-display-text {
      font-family: inherit !important;
      font-size: 0.875rem !important;
      font-weight: 500 !important;
      line-height: 1.2 !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
    }

    .booking-form .luggage-picker-trigger .luggage-arrow-icon {
      position: absolute !important;
      right: 0.75rem !important;
      top: 50% !important;
      transform: translateY(-50%) !important;
      pointer-events: none !important;
      width: 14px !important;
      height: 14px !important;
    }

    [data-theme="dark"] .booking-form input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]),
    .dark-mode .booking-form input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]),
    [data-theme="dark"] .booking-form select,
    .dark-mode .booking-form select,
    [data-theme="dark"] .booking-form .luggage-picker-trigger,
    .dark-mode .booking-form .luggage-picker-trigger {
      background: #1e293b !important;
      border: 1px solid #334155 !important;
      color: #f8fafc !important;
    }

    .booking-form select {
      appearance: none !important;
      -webkit-appearance: none !important;
      -moz-appearance: none !important;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") !important;
      background-repeat: no-repeat !important;
      background-position: right 0.75rem center !important;
      padding-right: 2rem !important;
    }

    /* Force Passengers select (and any other <select>) to exactly match the
       Date/Time <input> fields' font-size and border color — several other
       stylesheets each style input/select "together" but a later select-only
       rule always wins for <select> specifically, leaving it visibly off
       (bigger font, darker border) in both themes. #airport-booking-form ID
       specificity guarantees this wins over all of those. */
    #airport-booking-form .field input,
    #airport-booking-form .field select {
      font-size: 14px !important;
    }
    html:not(.dark-mode):not([data-theme="dark"]) #airport-booking-form .field input,
    html:not(.dark-mode):not([data-theme="dark"]) #airport-booking-form .field select {
      border: 1px solid #cbd5e1 !important;
    }
    html.dark-mode #airport-booking-form .field input,
    [data-theme="dark"] #airport-booking-form .field input,
    html.dark-mode #airport-booking-form .field select,
    [data-theme="dark"] #airport-booking-form .field select {
      border: 1px solid rgba(255, 255, 255, 0.15) !important;
    }

    .airport-hero__booking-card .booking-form .field-pair {
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 0.5rem !important;
    }

    .airport-hero__booking-card .booking-form .field-pair--contact-primary {
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 0.5rem !important;
    }

    .airport-hero__booking-card .booking-form .field-pair--contact-second {
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 0.5rem !important;
    }

    .airport-hero__booking-card .booking-form .vehicle-selector-grid {
      display: grid !important;
      grid-template-columns: repeat(4, 1fr) !important;
      gap: 0.45rem !important;
      width: 100% !important;
      box-sizing: border-box !important;
    }

    .airport-hero__booking-card .booking-form .vehicle-selector-card {
      padding: 0.45rem 0.25rem !important;
      height: 64px !important;
      min-height: 64px !important;
      max-height: 64px !important;
      box-sizing: border-box !important;
      border-radius: 8px !important;
      border: 1px solid #cbd5e1 !important;
      background: #f8fafc !important;
      transition: all 0.2s ease !important;
      cursor: pointer !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 0.15rem !important;
      overflow: hidden !important;
    }

    [data-theme="dark"] .airport-hero__booking-card .booking-form .vehicle-selector-card,
    .dark-mode .airport-hero__booking-card .booking-form .vehicle-selector-card,
    [data-theme="dark"] .booking-form .vehicle-selector-card,
    .dark-mode .booking-form .vehicle-selector-card {
      background: #1e293b !important;
      border-color: #334155 !important;
    }

    .airport-hero__booking-card .booking-form .vehicle-selector-card:hover {
      border-color: #0284c7 !important;
      background: #f0f9ff !important;
      transform: translateY(-1px) !important;
    }

    [data-theme="dark"] .airport-hero__booking-card .booking-form .vehicle-selector-card:hover,
    .dark-mode .airport-hero__booking-card .booking-form .vehicle-selector-card:hover {
      background: #334155 !important;
      border-color: #38bdf8 !important;
    }

    .airport-hero__booking-card .booking-form .vehicle-selector-card.active,
    .airport-hero__booking-card .booking-form .vehicle-selector-card.vehicle-selector-card--active {
      border: 1.5px solid #0284c7 !important;
      background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%) !important;
      box-shadow: 0 4px 12px rgba(2, 132, 199, 0.25) !important;
    }

    [data-theme="dark"] .airport-hero__booking-card .booking-form .vehicle-selector-card.active,
    [data-theme="dark"] .airport-hero__booking-card .booking-form .vehicle-selector-card.vehicle-selector-card--active,
    .dark-mode .airport-hero__booking-card .booking-form .vehicle-selector-card.active,
    .dark-mode .airport-hero__booking-card .booking-form .vehicle-selector-card.vehicle-selector-card--active {
      border: 1.5px solid #38bdf8 !important;
      background: rgba(56, 189, 248, 0.15) !important;
      box-shadow: 0 0 12px rgba(56, 189, 248, 0.25) !important;
    }

    .airport-hero__booking-card .booking-form .vehicle-selector-card img {
      height: 28px !important;
      max-height: 28px !important;
      width: auto !important;
      object-fit: contain !important;
      margin: 0 auto !important;
    }

    .airport-hero__booking-card .booking-form .vehicle-selector-card__name {
      font-size: 0.72rem !important;
      font-weight: 700 !important;
      color: #0f172a !important;
      line-height: 1 !important;
      margin: 0 !important;
      text-align: center !important;
    }

    [data-theme="dark"] .airport-hero__booking-card .booking-form .vehicle-selector-card__name,
    .dark-mode .airport-hero__booking-card .booking-form .vehicle-selector-card__name {
      color: #f8fafc !important;
    }

    .airport-hero__booking-card .booking-form .vehicle-selector-card.active .vehicle-selector-card__name,
    .airport-hero__booking-card .booking-form .vehicle-selector-card.vehicle-selector-card--active .vehicle-selector-card__name {
      color: #0369a1 !important;
    }

    [data-theme="dark"] .airport-hero__booking-card .booking-form .vehicle-selector-card.active .vehicle-selector-card__name,
    [data-theme="dark"] .airport-hero__booking-card .booking-form .vehicle-selector-card.vehicle-selector-card--active .vehicle-selector-card__name,
    .dark-mode .airport-hero__booking-card .booking-form .vehicle-selector-card.active .vehicle-selector-card__name,
    .dark-mode .airport-hero__booking-card .booking-form .vehicle-selector-card.vehicle-selector-card--active .vehicle-selector-card__name {
      color: #38bdf8 !important;
    }

    .airport-hero__booking-card .booking-form .vehicle-selector-card__price {
      font-size: 0.65rem !important;
      font-weight: 600 !important;
      color: #0284c7 !important;
    }

    .airport-hero__booking-card .booking-form .submit-wrapper {
      margin-top: 0.35rem !important;
    }

    .airport-hero__booking-card .booking-form .btn-primary {
      width: 100% !important;
      padding: 0.7rem !important;
      font-size: 0.9rem !important;
      font-weight: 700 !important;
      border-radius: 10px !important;
    }

    /* ── Mobile Floating Buttons (Pure Floating Pills, No Dock Background) ── */
    .mob-float-cta { display: none; }

    @media (max-width: 900px) {
      body { padding-bottom: 64px !important; }
      
      .mob-float-cta {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 0.6rem !important;
        position: fixed !important;
        bottom: 0.85rem !important; 
        left: 0 !important; 
        right: 0 !important;
        z-index: 9990 !important;
        background: transparent !important;
        padding: 0 1rem !important;
        border: none !important;
        box-shadow: none !important;
        pointer-events: none !important;
      }
      .mob-float-cta__btn {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 0.4rem !important;
        padding: 0.6rem 1.25rem !important;
        border-radius: 100px !important;
        font-size: 0.82rem !important;
        font-weight: 700 !important;
        text-decoration: none !important;
        transition: transform 0.15s, opacity 0.15s, box-shadow 0.15s !important;
        white-space: nowrap !important;
        pointer-events: auto !important;
      }
      .mob-float-cta__btn:active { transform: scale(0.96); opacity: 0.85; }
      .mob-float-cta__btn--call {
        background: linear-gradient(135deg, #2563eb, #1d4ed8) !important;
        color: #ffffff !important;
        box-shadow: 0 4px 16px rgba(37,99,235,0.45) !important;
      }
      .mob-float-cta__btn--book {
        background: linear-gradient(135deg, #f59e0b, #d97706) !important;
        color: #0b1f3a !important;
        box-shadow: 0 4px 16px rgba(245,158,11,0.45) !important;
      }
    }
    .fleet-tariff-card__icon img,
    .fleet-tariff-card img {
      transform: scaleX(-1);
      display: block;
    }
    </style>
</head>
<body data-active-theme-id="<?php echo htmlspecialchars($activeTheme['id'] ?? 'drop-taxi'); ?>">

<!-- ── Floating bottom CTA bar (mobile only) ── -->
<div class="mob-float-cta" role="navigation" aria-label="Quick actions">
    <a href="tel:+91<?php echo $phoneDigits; ?>" class="mob-float-cta__btn mob-float-cta__btn--call">
        📞 Call Now
    </a>
    <a href="#airport-booking-form" class="mob-float-cta__btn mob-float-cta__btn--book" onclick="if(window.DropCarsScrollToBookingForm){window.DropCarsScrollToBookingForm(true);}else{document.getElementById('airport-booking-form').scrollIntoView({behavior:'smooth',block:'start'});}return false;">
        🚕 Book Online
    </a>
</div>

<?php echo $shell->renderHeader(); ?>

<!-- ── Airport Hero (title left + booking form right, like homepage) ── -->
<section class="airport-hero" id="airport-hero">
    <span class="airport-hero__plane">✈️</span>
    <div class="container">
        <div class="airport-hero__layout">

            <!-- LEFT: Hero copy -->
            <div class="airport-hero__content reveal">
                <nav class="breadcrumb" aria-label="Breadcrumb" style="margin-bottom:0.6rem;">
                    <a href="/" style="color:rgba(255,255,255,0.7);">Home</a>
                    <span class="breadcrumb__sep" style="color:rgba(255,255,255,0.4);">›</span>
                    <a href="/services" style="color:rgba(255,255,255,0.7);">Services</a>
                    <span class="breadcrumb__sep" style="color:rgba(255,255,255,0.4);">›</span>
                    <span class="breadcrumb__current" style="color:#ffffff;">Airport Transfer</span>
                </nav>

                <div class="page-hero__badge" style="margin-bottom:0.75rem; margin-left:auto; margin-right:auto; display:flex; justify-content:center; align-self:center; text-align:center; width:fit-content; max-width:100%; background:rgba(255,255,255,0.14); color:#ffffff; border-color:rgba(255,255,255,0.3); font-weight:700;">✈️ 24/7 Airport Taxi &amp; Transfer Service</div>

                <h1 class="page-hero__title" style="color:#ffffff; margin-bottom:0.75rem;">
                    Airport Taxi Tamil Nadu — <span style="color:#f59e0b;">On-Time. Every Time.</span>
                </h1>
                <p class="page-hero__desc" style="color:rgba(255,255,255,0.85); margin-bottom:1rem;">
                    Book reliable, GPS-tracked airport cabs to &amp; from Chennai, Coimbatore, Madurai, Trichy and 5 more airports across Tamil Nadu &amp; border cities. Fixed transparent fares with zero surge charges.
                </p>

                <!-- Urgent Direct Call Banner -->
                <div class="urgent-call-box" style="background: rgba(245,158,11,0.18); border: 1px solid rgba(245,158,11,0.5); padding: 0.65rem 0.85rem; border-radius: 12px; margin-bottom: 1.25rem; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                    <div style="font-size: 0.84rem; color: #ffffff; font-weight: 700;">
                        ⚡ Need Urgent Airport Pickup?
                        <span style="display: block; font-size: 0.76rem; color: rgba(255,255,255,0.85); font-weight: 400;">Call directly for instant driver dispatch</span>
                    </div>
                    <a href="tel:+91<?php echo $phoneDigits; ?>" style="background: #f59e0b; color: #0b1f3a; font-weight: 800; font-size: 0.82rem; padding: 0.45rem 0.85rem; border-radius: 8px; text-decoration: none; white-space: nowrap; box-shadow: 0 2px 8px rgba(245,158,11,0.4);">📞 Call Now</a>
                </div>

                <!-- Hero Features Grid -->
                <div class="hero-features-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; margin-bottom: 1.25rem; max-width: 500px;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; background: rgba(255,255,255,0.08); padding: 0.55rem 0.75rem; border-radius: 10px; border: 1px solid rgba(255,255,255,0.15);">
                        <span style="font-size: 1.2rem;">⚡</span>
                        <div>
                            <div style="font-size: 0.8rem; font-weight: 700; color: #ffffff;">Instant Booking</div>
                            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.7);">Instant WhatsApp alert</div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem; background: rgba(255,255,255,0.08); padding: 0.55rem 0.75rem; border-radius: 10px; border: 1px solid rgba(255,255,255,0.15);">
                        <span style="font-size: 1.2rem;">💰</span>
                        <div>
                            <div style="font-size: 0.8rem; font-weight: 700; color: #ffffff;">Fixed Fares</div>
                            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.7);">No night or surge fee</div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem; background: rgba(255,255,255,0.08); padding: 0.55rem 0.75rem; border-radius: 10px; border: 1px solid rgba(255,255,255,0.15);">
                        <span style="font-size: 1.2rem;">🛬</span>
                        <div>
                            <div style="font-size: 0.8rem; font-weight: 700; color: #ffffff;">Flight Tracking</div>
                            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.7);">Free wait for flight delays</div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem; background: rgba(255,255,255,0.08); padding: 0.55rem 0.75rem; border-radius: 10px; border: 1px solid rgba(255,255,255,0.15);">
                        <span style="font-size: 1.2rem;">🛡️</span>
                        <div>
                            <div style="font-size: 0.8rem; font-weight: 700; color: #ffffff;">Verified Cabs</div>
                            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.7);">Clean AC cars &amp; drivers</div>
                        </div>
                    </div>
                </div>

                <!-- Quick Airport chips (horizontal infinite scroll ribbon) -->
                <div>
                    <div style="font-size:0.75rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:rgba(255,255,255,0.6);margin-bottom:0.4rem;">Quick Select Airport</div>
                    <div class="airport-marquee-wrapper">
                        <div class="airport-quick-select" id="hero-airport-chips">
                            <div class="airport-quick-track">
                                <button type="button" class="airport-chip" onclick="pickAirport(this,'Chennai International Airport (MAA)')">✈️ Chennai (MAA)</button>
                                <button type="button" class="airport-chip" onclick="pickAirport(this,'Coimbatore International Airport (CJB)')">✈️ Coimbatore (CJB)</button>
                                <button type="button" class="airport-chip" onclick="pickAirport(this,'Madurai International Airport (IXM)')">✈️ Madurai (IXM)</button>
                                <button type="button" class="airport-chip" onclick="pickAirport(this,'Trichy International Airport (TRZ)')">✈️ Trichy (TRZ)</button>
                                <button type="button" class="airport-chip" onclick="pickAirport(this,'Salem Airport (SXV)')">✈️ Salem</button>
                                <button type="button" class="airport-chip" onclick="pickAirport(this,'Bangalore Kempegowda International Airport (BLR)')">✈️ Bangalore (BLR)</button>
                                <button type="button" class="airport-chip" onclick="pickAirport(this,'Tirupati Airport (TIR)')">✈️ Tirupati</button>
                                <button type="button" class="airport-chip" onclick="pickAirport(this,'Cochin International Airport (COK)')">✈️ Kochi (COK)</button>

                                <!-- Seamless duplicate track for infinite 360 loop -->
                                <button type="button" class="airport-chip" onclick="pickAirport(this,'Chennai International Airport (MAA)')">✈️ Chennai (MAA)</button>
                                <button type="button" class="airport-chip" onclick="pickAirport(this,'Coimbatore International Airport (CJB)')">✈️ Coimbatore (CJB)</button>
                                <button type="button" class="airport-chip" onclick="pickAirport(this,'Madurai International Airport (IXM)')">✈️ Madurai (IXM)</button>
                                <button type="button" class="airport-chip" onclick="pickAirport(this,'Trichy International Airport (TRZ)')">✈️ Trichy (TRZ)</button>
                                <button type="button" class="airport-chip" onclick="pickAirport(this,'Salem Airport (SXV)')">✈️ Salem</button>
                                <button type="button" class="airport-chip" onclick="pickAirport(this,'Bangalore Kempegowda International Airport (BLR)')">✈️ Bangalore (BLR)</button>
                                <button type="button" class="airport-chip" onclick="pickAirport(this,'Tirupati Airport (TIR)')">✈️ Tirupati</button>
                                <button type="button" class="airport-chip" onclick="pickAirport(this,'Cochin International Airport (COK)')">✈️ Kochi (COK)</button>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            <!-- RIGHT: Airport Dedicated Booking Form Card -->
            <div class="airport-hero__form-column">
                <div class="airport-form-top-title-wrap" style="margin-bottom: 0.6rem; display: flex; justify-content: center; align-items: center; width: 100%; text-align: center;">
                    <h2 id="booking-form-dynamic-title" class="airport-booking-title" style="margin: 0; font-size: 1.35rem; font-weight: 800; color: #ffffff; text-shadow: none; box-shadow: none; justify-content: center; text-align: center;">✈️ Book Airport Taxi</h2>
                </div>
                <div class="booking-card booking-card--home" id="airport-booking-form" aria-label="Airport Taxi booking form">



                <form id="booking-form" class="booking-form" method="post" action="javascript:void(0);" novalidate>
                    <!-- Hidden service & trip type for Airport Transfer -->
                    <input type="hidden" name="serviceType" id="service-type" value="airport_transfer">
                    <input type="hidden" name="oneway_subtype" value="airport_transfer">
                    <input type="hidden" name="airportSubtype" id="airport-subtype-input" value="outstation">

                    <!-- STEP 1: Locations, Travel Details & Vehicle Selection (Always visible on load) -->
                    <div class="form-step form-step--1 active" id="form-step-1">
                        <!-- Outstation / Local / Hourly Rental sub-tabs. Outstation vs Local
                             is auto-suggested from the real pickup→drop distance once it's
                             known (<50km = Local) but a manual tap always wins after that. -->
                        <div class="airport-subtabs" id="airport-subtabs" role="group" aria-label="Trip type">
                            <button type="button" class="airport-subtab active" data-subtype="outstation">Outstation</button>
                            <button type="button" class="airport-subtab" data-subtype="local">Local</button>
                            <button type="button" class="airport-subtab" data-subtype="hourly">Rental</button>
                        </div>

                        <!-- Locations Row -->
                        <div id="locations-wrapper" class="airport-mode" style="position: relative; width: 100%; display: flex; flex-direction: column; gap: 0.35rem;">
                            <label class="field" id="pickup-field-container">
                                <span id="pickup-label-text">Airport / Pickup Location *</span>
                                <div style="position: relative; width: 100%;">
                                    <input type="text" name="pickup" id="pickup" placeholder="Type airport name or select above" required style="padding-right: 35px;" />
                                    <button type="button" class="detect-location-btn" title="Use current location" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #0284c7; display: flex; align-items: center; justify-content: center; padding: 0; z-index: 10;">
                                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>
                                    </button>
                                </div>
                            </label>

                            <div id="swap-btn-container">
                                <button type="button" id="airport-swap-btn" style="background: linear-gradient(135deg, var(--blue-light,#0ea5e9) 0%, var(--blue,#1d4ed8) 100%); border: 2.5px solid var(--white,#fff); border-radius: 50%; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 10px rgba(14, 165, 233, 0.35); transition: transform 0.3s ease;" onmouseover="this.style.transform='scale(1.08) rotate(180deg)';" onmouseout="this.style.transform='scale(1) rotate(0deg)';" aria-label="Swap Locations">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v10"/><path d="M11 16l-4 4-4-4"/><path d="M17 14V4"/><path d="M21 8l-4-4-4 4"/></svg>
                                </button>
                            </div>

                            <label class="field" id="drop-field">
                                <span id="drop-label-text">Destination / Drop Location *</span>
                                <input type="text" name="drop" id="drop" placeholder="City, Area or Hotel name" required />
                            </label>
                        </div>

                        <!-- Date & Time Row -->
                        <div class="field-pair" id="pickup-date-time-row" style="margin-top: 0.35rem;">
                            <label class="field" id="pickup-date-field">
                                <span>Pickup Date *</span>
                                <input type="date" name="pickupDate" id="pickup-date" required value="<?php echo $defaultPickupDate; ?>" />
                            </label>
                            <label class="field" id="pickup-time-field">
                                <span>Pickup Time *</span>
                                <input type="time" name="pickupTime" id="pickup-time" required value="<?php echo $defaultPickupTime; ?>" />
                            </label>
                        </div>

                        <!-- Passengers & Luggage Counts (Side-by-side row with clean grid alignment) -->
                        <div class="field-pair" style="margin-top: 0.35rem; display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 0.5rem !important; align-items: start !important;">
                            <label class="field">
                                <span>Passengers *</span>
                                <select name="passengerCount" id="passenger-count">
                                    <option value="1">1 Passenger</option>
                                    <option value="2">2 Passengers</option>
                                    <option value="3" selected>3 Passengers</option>
                                    <option value="4">4 Passengers</option>
                                    <option value="5">5 Passengers</option>
                                    <option value="6">6+ Passengers</option>
                                </select>
                            </label>

                            <div class="field" style="position: relative;">
                                <span>Luggage Bags *</span>
                                <button type="button" id="luggage-picker-trigger" class="luggage-picker-trigger" onclick="toggleLuggagePopover(event);">
                                    <span id="luggage-display-text" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">2 Small + 1 Med</span>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="luggage-arrow-icon" style="position: absolute; right: 0.75rem; top: 50%; transform: translateY(-50%); flex-shrink: 0; pointer-events: none;"><path d="M6 9l6 6 6-6"/></svg>
                                </button>

                                <!-- Hidden Inputs for Luggage Breakdown & Total -->
                                <input type="hidden" name="luggageSmall" id="luggage-small-input" value="2" />
                                <input type="hidden" name="luggageMedium" id="luggage-medium-input" value="1" />
                                <input type="hidden" name="luggageLarge" id="luggage-large-input" value="0" />
                                <input type="hidden" name="luggageCount" id="luggage-count" value="3" />
                                <input type="hidden" name="luggageSummary" id="luggage-summary-input" value="2+1+0" />

                                <!-- Luggage Stepper Popover Card -->
                                <div id="luggage-popover" class="luggage-popover is-hidden">
                                    <div style="font-size: 0.78rem; font-weight: 700; color: #0f172a; margin-bottom: 0.6rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.35rem; display: flex; align-items: center; justify-content: space-between;">
                                        <span>🧳 Select Luggage Bags</span>
                                        <button type="button" id="luggage-popover-close" style="background: none; border: none; font-weight: 700; font-size: 1rem; color: #64748b; cursor: pointer;">&times;</button>
                                    </div>

                                    <!-- Small Bags Counter Row -->
                                    <div class="luggage-counter-row" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.55rem;">
                                        <div>
                                            <div style="font-size: 0.8rem; font-weight: 700; color: #0f172a;">Small Bag</div>
                                            <div style="font-size: 0.68rem; color: #64748b;">Cabin / Handbag</div>
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 0.4rem;">
                                            <button type="button" class="stepper-btn" onclick="changeLuggageCount('small', -1)" style="width: 26px; height: 26px; border-radius: 6px; border: 1px solid #cbd5e1; background: #f8fafc; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center;">-</button>
                                            <span id="small-count-val" style="font-size: 0.85rem; font-weight: 700; min-width: 18px; text-align: center;">2</span>
                                            <button type="button" class="stepper-btn" onclick="changeLuggageCount('small', 1)" style="width: 26px; height: 26px; border-radius: 6px; border: 1px solid #cbd5e1; background: #f8fafc; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center;">+</button>
                                        </div>
                                    </div>

                                    <!-- Medium Bags Counter Row -->
                                    <div class="luggage-counter-row" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.55rem;">
                                        <div>
                                            <div style="font-size: 0.8rem; font-weight: 700; color: #0f172a;">Medium Bag</div>
                                            <div style="font-size: 0.68rem; color: #64748b;">24" Check-in</div>
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 0.4rem;">
                                            <button type="button" class="stepper-btn" onclick="changeLuggageCount('medium', -1)" style="width: 26px; height: 26px; border-radius: 6px; border: 1px solid #cbd5e1; background: #f8fafc; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center;">-</button>
                                            <span id="medium-count-val" style="font-size: 0.85rem; font-weight: 700; min-width: 18px; text-align: center;">1</span>
                                            <button type="button" class="stepper-btn" onclick="changeLuggageCount('medium', 1)" style="width: 26px; height: 26px; border-radius: 6px; border: 1px solid #cbd5e1; background: #f8fafc; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center;">+</button>
                                        </div>
                                    </div>

                                    <!-- Large Bags Counter Row -->
                                    <div class="luggage-counter-row" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.65rem;">
                                        <div>
                                            <div style="font-size: 0.8rem; font-weight: 700; color: #0f172a;">Large Bag</div>
                                            <div style="font-size: 0.68rem; color: #64748b;">28"+ Heavy Suitcase</div>
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 0.4rem;">
                                            <button type="button" class="stepper-btn" onclick="changeLuggageCount('large', -1)" style="width: 26px; height: 26px; border-radius: 6px; border: 1px solid #cbd5e1; background: #f8fafc; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center;">-</button>
                                            <span id="large-count-val" style="font-size: 0.85rem; font-weight: 700; min-width: 18px; text-align: center;">0</span>
                                            <button type="button" class="stepper-btn" onclick="changeLuggageCount('large', 1)" style="width: 26px; height: 26px; border-radius: 6px; border: 1px solid #cbd5e1; background: #f8fafc; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center;">+</button>
                                        </div>
                                    </div>

                                    <button type="button" id="luggage-done-btn" style="width: 100%; padding: 0.4rem; background: linear-gradient(135deg, #0284c7, #2563eb); color: #ffffff; border: none; border-radius: 6px; font-size: 0.78rem; font-weight: 700; cursor: pointer;">Done</button>
                                </div>
                            </div>
                        </div>

                        <!-- Vehicle Selector Cards (NO PRICE PER KM) -->
                        <div class="field" id="vehicle-selector-field" style="margin-top:0.45rem;">
                            <span id="vehicle-suggest-hint" style="display:none;"></span>
                            <input type="hidden" name="vehicleType" id="vehicle-type-input" value="SEDAN" />
                            <div class="vehicle-selector-grid" role="group" aria-label="Vehicle type">
                                <button type="button" class="vehicle-selector-card active vehicle-selector-card--active" data-vehicle="SEDAN">
                                    <img src="/assets/img/vehicles/Dzire.png" alt="Sedan Taxi" loading="lazy" onerror="this.style.display='none'" style="transform: scale(0.85); object-fit: contain;" />
                                    <span class="vehicle-selector-card__name">Sedan</span>
                                </button>
                                <button type="button" class="vehicle-selector-card" data-vehicle="SUV">
                                    <img src="/assets/img/vehicles/Suv.png" alt="SUV" loading="lazy" onerror="this.style.display='none'" />
                                    <span class="vehicle-selector-card__name">SUV</span>
                                </button>
                                <button type="button" class="vehicle-selector-card" data-vehicle="INNOVA">
                                    <img src="/assets/img/vehicles/Innova.png" alt="Innova" loading="lazy" onerror="this.style.display='none'" />
                                    <span class="vehicle-selector-card__name">Innova</span>
                                </button>
                                <button type="button" class="vehicle-selector-card" data-vehicle="CRYSTA">
                                    <img src="/assets/img/vehicles/innova-crysta.png" alt="Crysta" loading="lazy" onerror="this.style.display='none'" />
                                    <span class="vehicle-selector-card__name">Crysta</span>
                                </button>
                            </div>
                        </div>

                        <!-- Hourly Rental duration - only shown when the Hourly Rental
                             sub-tab is selected (existing ui-controls.js already toggles
                             #hourly-control's visibility off serviceType, reused as-is here
                             so this uses the exact same tariff as the main booking form). -->
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

                        <input type="hidden" name="fareType" id="fare-type-hidden" value="inclusive" />
                    </div>

                    <!-- STEP 2: Passenger Details (Revealed automatically after entering pickup & drop) -->
                    <div class="form-step form-step--2" id="form-step-2">
                        <div class="field-pair field-pair--contact-primary" style="display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 0.5rem !important; align-items: end !important; margin-top: 0.35rem !important;">
                            <label class="field">
                                <span>Passenger Name *</span>
                                <input type="text" name="customerName" placeholder="Full Name" id="contact-name" autocomplete="name" required />
                            </label>
                            <div class="field">
                                <div class="field__label-row" style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                                    <span>Phone *</span>
                                    <label class="wa-check-label" style="display: flex; align-items: center; gap: 0.3rem; margin: 0; font-size: 0.74rem; font-weight: 600; cursor: pointer;">
                                        <span class="wa-label-icon" aria-hidden="true" style="display: flex; align-items: center;"><svg viewBox="0 0 32 32" width="16" height="16" fill="#25D366"><path d="M16 3C9.4 3 4 8.4 4 15c0 2.4.7 4.7 1.9 6.7L4 29l7.5-1.9A13 13 0 0 0 16 27c6.6 0 12-5.4 12-12S22.6 3 16 3Zm0 22.5c-2 0-4-.6-5.6-1.7l-.4-.2-4.4 1.1 1.2-4.3-.3-.4A10 10 0 1 1 26 15c0 5.5-4.5 10-10 10Zm6-7.4c-.3-.2-1.7-.8-2-.9s-.5-.2-.7.2c-.2.3-.8 1-1 1.2-.2.3-.4.2-.7.1-2-.8-3.2-2.6-3.4-3-.2-.3 0-.4.2-.6l.5-.6c.2-.2.2-.3.3-.5s0-.4 0-.6c0-.2-.7-1.8-1-2.5-.2-.6-.5-.6-.7-.6h-.6c-.2 0-.5.1-.7.3-.2.3-1 1-1 2.4s1 2.8 1.2 3.1c.1.2 2 3.3 5 4.6.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.1-1.4s-.3-.2-.6-.4Z"/></svg></span>
                                        <input type="checkbox" id="use-whatsapp-check" checked style="margin: 0; width: 14px; height: 14px; accent-color: var(--blue,#0ea5e9);" aria-label="Use WhatsApp for contact" />
                                    </label>
                                </div>
                                <div class="phone-input-wrapper phone-input-wrapper--country">
                                    <div class="country-code-field" data-cc-default="+91">
                                        <input type="hidden" name="countryCode" id="country-code-hidden" value="+91" />
                                        <button type="button" class="country-code-trigger" id="country-code-trigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="country-code-popover" title="Choose or type country code">+91</button>
                                        <div id="country-code-popover" class="country-code-popover is-hidden" role="dialog" aria-label="Choose or type country code">
                                            <button type="button" class="country-code-option" data-code="+91">+91 (IN)</button>
                                            <button type="button" class="country-code-option" data-code="+1">+1 (US)</button>
                                            <button type="button" class="country-code-option" data-code="+44">+44 (UK)</button>
                                            <button type="button" class="country-code-option" data-code="+65">+65 (SG)</button>
                                            <button type="button" class="country-code-option" data-code="+60">+60 (MY)</button>
                                            <button type="button" class="country-code-option" data-code="+971">+971 (UAE)</button>
                                            <input type="text" class="country-code-manual-inline" id="country-code-manual-input" inputmode="tel" autocomplete="off" maxlength="12" placeholder="+ Code..." aria-label="Type country code e.g. +65" />
                                        </div>
                                    </div>
                                    <input type="tel" name="contactPhone" placeholder="9876543210" id="contact-phone" class="phone-national-input" inputmode="numeric" pattern="[0-9]*" maxlength="10" autocomplete="tel" required />
                                </div>
                            </div>
                        </div>

                        <!-- Row 2: Email (50%) | Promo Code (50%) -->
                        <div class="field-pair field-pair--contact-second" id="whatsapp-extra-row" style="display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 0.5rem !important; margin-top: 0.35rem !important; align-items: start !important;">
                            <label class="field email-field" id="email-field">
                                <span>Email *</span>
                                <input type="email" name="contactEmail" placeholder="name@email.com" id="contact-email" />
                            </label>

                            <div class="field promo-field" id="promo-field">
                                <span>Promo Code (Optional)</span>
                                <div style="display: flex; gap: 0.35rem; width: 100%;">
                                    <input type="text" name="promoCode" id="promo-code" placeholder="Enter Code" autocomplete="off" aria-label="Promo code" style="flex: 1; min-width: 0;" />
                                    <button type="button" class="btn-promo-apply" id="promo-apply-btn" style="flex-shrink: 0; padding: 0 0.75rem; height: 42px; font-size: 0.8rem; font-weight: 700; border-radius: 8px; background: linear-gradient(135deg, #0284c7, #1d4ed8); color: #ffffff; border: none; cursor: pointer;">Apply</button>
                                </div>
                            </div>

                            <div class="field hidden" id="whatsapp-field" style="grid-column: span 2;">
                                <span>WhatsApp Number *</span>
                                <div class="phone-input-wrapper phone-input-wrapper--country">
                                    <div class="country-code-field" data-cc-default="+91">
                                        <input type="hidden" name="waCountryCode" id="wa-country-code-hidden" value="+91" />
                                        <button type="button" class="country-code-trigger" id="wa-country-code-trigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="wa-country-code-popover" title="Choose or type country code">+91</button>
                                        <div id="wa-country-code-popover" class="country-code-popover is-hidden" role="dialog" aria-label="Choose or type country code">
                                            <button type="button" class="country-code-option" data-code="+91">+91 (IN)</button>
                                            <button type="button" class="country-code-option" data-code="+1">+1 (US)</button>
                                            <button type="button" class="country-code-option" data-code="+44">+44 (UK)</button>
                                            <button type="button" class="country-code-option" data-code="+65">+65 (SG)</button>
                                            <button type="button" class="country-code-option" data-code="+60">+60 (MY)</button>
                                            <button type="button" class="country-code-option" data-code="+971">+971 (UAE)</button>
                                            <input type="text" class="country-code-manual-inline" id="wa-country-code-manual-input" inputmode="tel" autocomplete="off" maxlength="12" placeholder="+ Code..." aria-label="Type country code e.g. +65" />
                                        </div>
                                    </div>
                                    <input type="tel" name="whatsappPhone" placeholder="9876543210" id="whatsapp-phone" class="phone-national-input" inputmode="numeric" pattern="[0-9]*" maxlength="15" autocomplete="tel" />
                                </div>
                            </div>
                        </div>

                        <input type="hidden" name="contactMode" value="phone" id="contact-mode-input" />

                        <div class="submit-wrapper" style="margin-top:0.65rem;">
                            <button type="button" class="btn-primary" id="calculate-fare-btn">Check Fare Now</button>
                            <div id="fare-card" class="fare-card" style="display: none;">
                                <p class="fare-card__label">Estimated Airport Fare (All Inclusive)</p>
                                <p id="fare-amount" class="fare-card__amount">₹0</p>
                                <p id="fare-distance" class="fare-card__meta" style="display: none;"></p>
                                <p class="fare-card__disclaimer">Includes toll, state taxes &amp; driver bata.</p>
                                <button type="submit" class="btn-primary btn-primary--confirm" id="confirm-booking-btn">Book Airport Cab Now</button>
                            </div>
                        </div>
                    </div>

                    <p id="form-response" class="form-response" role="status"></p>
                </form>
            </div><!-- /.booking-card -->
            </div><!-- /.airport-hero__form-column -->

        </div><!-- /.airport-hero__layout -->
    </div><!-- /.container -->
</section>

<!-- ── Stats Bar ── -->
<div class="container" style="position: relative; z-index: 10;">
    <div class="stats-bar reveal">
        <div class="stat-item">
            <div class="stat-item__number">9</div>
            <div class="stat-item__label">Major Airports</div>
        </div>
        <div class="stat-item">
            <div class="stat-item__number">24/7</div>
            <div class="stat-item__label">Available Round Clock</div>
        </div>
        <div class="stat-item">
            <div class="stat-item__number count-up" data-target="30">0</div>
            <div class="stat-item__label">Min Early Arrival</div>
        </div>
        <div class="stat-item">
            <div class="stat-item__number">₹0</div>
            <div class="stat-item__label">Hidden Charges</div>
        </div>
    </div>
</div>

<!-- ── Airport Fleet Rate Comparison Cards ── -->
<section class="page-section fleet-tariffs-section" style="padding: 2.5rem 0 1.5rem;">
    <div class="container">
        <div class="text-center reveal" style="margin-bottom: 1.5rem;">
            <p class="section-eyebrow" style="justify-content: center; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700;">FLEET &amp; TARIFFS</p>
            <h2 class="section-title" style="font-size: clamp(1.3rem, 2.5vw, 1.7rem); margin-top: 0.35rem; font-weight: 800;">Airport Taxi Rates &amp; Fleet Options</h2>
            <p class="section-subtitle" style="font-size: 0.85rem; max-width: 560px; margin: 0.35rem auto 0;">All-inclusive pricing. Same-city local transfers include 20 KM; outstation trips bill at minimum 130 KM.</p>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.25rem;">
            <div class="reveal reveal-d1 fleet-tariff-card">
                <div>
                    <div class="fleet-tariff-card__header">
                        <span class="fleet-tariff-card__icon"><img src="/assets/img/vehicles/Dzire.png" alt="Sedan Taxi" loading="lazy" /></span>
                        <span class="fleet-tariff-card__badge">4 Seats</span>
                    </div>
                    <h3 class="fleet-tariff-card__title">Sedan (Dzire / Etios)</h3>
                    <p class="fleet-tariff-card__desc">Ideal for up to 3 passengers with 2 medium bags.</p>
                    <div class="fleet-tariff-card__rates">
                        <div class="fleet-tariff-card__rate-row fleet-tariff-card__rate-row--bold">
                            <span class="rate-label">
                                Local Drop
                                <span class="tariff-info-trigger" tabindex="0" role="button" aria-label="Local Drop info">
                                    i
                                    <span class="tariff-tooltip-box">
                                        <strong>Local Drop Details:</strong><br>
                                        • Minimum 20 KM billing limit.<br>
                                        • All-inclusive fare (Base + Toll + Tax + GST).
                                    </span>
                                </span>
                            </span>
                            <span>₹750 <small style="font-size: 0.72rem; font-weight: 600; color: #64748b;">(All-Inc)</small></span>
                        </div>
                        <div class="fleet-tariff-card__rate-row fleet-tariff-card__rate-row--bold" style="margin-top: 0.35rem;">
                            <span class="rate-label">
                                Outstation Drop
                                <span class="tariff-info-trigger" tabindex="0" role="button" aria-label="Outstation info">
                                    i
                                    <span class="tariff-tooltip-box">
                                        <strong>Outstation Details:</strong><br>
                                        • Minimum 130 KM billing limit.<br>
                                        • All-inclusive fare (Base + Toll + Tax + Driver Bata + GST).
                                    </span>
                                </span>
                            </span>
                            <span>₹2,468 <small style="font-size: 0.72rem; font-weight: 600; color: #64748b;">(All-Inc)</small></span>
                        </div>
                    </div>
                </div>
                <a href="#airport-booking-form" class="fleet-tariff-card__btn">Book Sedan →</a>
            </div>

            <div class="reveal reveal-d2 fleet-tariff-card">
                <div>
                    <div class="fleet-tariff-card__header">
                        <span class="fleet-tariff-card__icon"><img src="/assets/img/vehicles/Suv.png" alt="SUV Taxi" loading="lazy" /></span>
                        <span class="fleet-tariff-card__badge">6 Seats</span>
                    </div>
                    <h3 class="fleet-tariff-card__title">SUV (Ertiga / Triber)</h3>
                    <p class="fleet-tariff-card__desc">Spacious SUV for families with extra luggage space.</p>
                    <div class="fleet-tariff-card__rates">
                        <div class="fleet-tariff-card__rate-row fleet-tariff-card__rate-row--bold">
                            <span class="rate-label">
                                Local Drop
                                <span class="tariff-info-trigger" tabindex="0" role="button" aria-label="Local Drop info">
                                    i
                                    <span class="tariff-tooltip-box">
                                        <strong>Local Drop Details:</strong><br>
                                        • Minimum 20 KM billing limit.<br>
                                        • All-inclusive fare (Base + Toll + Tax + GST).
                                    </span>
                                </span>
                            </span>
                            <span>₹950 <small style="font-size: 0.72rem; font-weight: 600; color: #64748b;">(All-Inc)</small></span>
                        </div>
                        <div class="fleet-tariff-card__rate-row fleet-tariff-card__rate-row--bold" style="margin-top: 0.35rem;">
                            <span class="rate-label">
                                Outstation Drop
                                <span class="tariff-info-trigger" tabindex="0" role="button" aria-label="Outstation info">
                                    i
                                    <span class="tariff-tooltip-box">
                                        <strong>Outstation Details:</strong><br>
                                        • Minimum 130 KM billing limit.<br>
                                        • All-inclusive fare (Base + Toll + Tax + Driver Bata + GST).
                                    </span>
                                </span>
                            </span>
                            <span>₹3,255 <small style="font-size: 0.72rem; font-weight: 600; color: #64748b;">(All-Inc)</small></span>
                        </div>
                    </div>
                </div>
                <a href="#airport-booking-form" class="fleet-tariff-card__btn">Book SUV →</a>
            </div>

            <div class="reveal reveal-d3 fleet-tariff-card">
                <div>
                    <div class="fleet-tariff-card__header">
                        <span class="fleet-tariff-card__icon"><img src="/assets/img/vehicles/Innova.png" alt="Innova Taxi" loading="lazy" /></span>
                        <span class="fleet-tariff-card__badge">7 Seats</span>
                    </div>
                    <h3 class="fleet-tariff-card__title">Innova (Standard)</h3>
                    <p class="fleet-tariff-card__desc">Premium highway comfort for group airport travel.</p>
                    <div class="fleet-tariff-card__rates">
                        <div class="fleet-tariff-card__rate-row fleet-tariff-card__rate-row--bold">
                            <span class="rate-label">
                                Local Drop
                                <span class="tariff-info-trigger" tabindex="0" role="button" aria-label="Local Drop info">
                                    i
                                    <span class="tariff-tooltip-box">
                                        <strong>Local Drop Details:</strong><br>
                                        • Minimum 20 KM billing limit.<br>
                                        • All-inclusive fare (Base + Toll + Tax + GST).
                                    </span>
                                </span>
                            </span>
                            <span>₹1,100 <small style="font-size: 0.72rem; font-weight: 600; color: #64748b;">(All-Inc)</small></span>
                        </div>
                        <div class="fleet-tariff-card__rate-row fleet-tariff-card__rate-row--bold" style="margin-top: 0.35rem;">
                            <span class="rate-label">
                                Outstation Drop
                                <span class="tariff-info-trigger" tabindex="0" role="button" aria-label="Outstation info">
                                    i
                                    <span class="tariff-tooltip-box">
                                        <strong>Outstation Details:</strong><br>
                                        • Minimum 130 KM billing limit.<br>
                                        • All-inclusive fare (Base + Toll + Tax + Driver Bata + GST).
                                    </span>
                                </span>
                            </span>
                            <span>₹3,255 <small style="font-size: 0.72rem; font-weight: 600; color: #64748b;">(All-Inc)</small></span>
                        </div>
                    </div>
                </div>
                <a href="#airport-booking-form" class="fleet-tariff-card__btn">Book Innova →</a>
            </div>

            <div class="reveal reveal-d4 fleet-tariff-card">
                <div>
                    <div class="fleet-tariff-card__header">
                        <span class="fleet-tariff-card__icon"><img src="/assets/img/vehicles/innova-crysta.png" alt="Crysta Taxi" loading="lazy" /></span>
                        <span class="fleet-tariff-card__badge fleet-tariff-card__badge--luxury">Luxury MUV</span>
                    </div>
                    <h3 class="fleet-tariff-card__title">Innova Crysta</h3>
                    <p class="fleet-tariff-card__desc">Executive luxury MUV for VIP airport transfers.</p>
                    <div class="fleet-tariff-card__rates">
                        <div class="fleet-tariff-card__rate-row fleet-tariff-card__rate-row--bold">
                            <span class="rate-label">
                                Local Drop
                                <span class="tariff-info-trigger" tabindex="0" role="button" aria-label="Local Drop info">
                                    i
                                    <span class="tariff-tooltip-box">
                                        <strong>Local Drop Details:</strong><br>
                                        • Minimum 20 KM billing limit.<br>
                                        • All-inclusive fare (Base + Toll + Tax + GST).
                                    </span>
                                </span>
                            </span>
                            <span>₹1,600 <small style="font-size: 0.72rem; font-weight: 600; color: #64748b;">(All-Inc)</small></span>
                        </div>
                        <div class="fleet-tariff-card__rate-row fleet-tariff-card__rate-row--bold" style="margin-top: 0.35rem;">
                            <span class="rate-label">
                                Outstation Drop
                                <span class="tariff-info-trigger" tabindex="0" role="button" aria-label="Outstation info">
                                    i
                                    <span class="tariff-tooltip-box">
                                        <strong>Outstation Details:</strong><br>
                                        • Minimum 130 KM billing limit.<br>
                                        • All-inclusive fare (Base + Toll + Tax + Driver Bata + GST).
                                    </span>
                                </span>
                            </span>
                            <span>₹3,801 <small style="font-size: 0.72rem; font-weight: 600; color: #64748b;">(All-Inc)</small></span>
                        </div>
                    </div>
                </div>
                <a href="#airport-booking-form" class="fleet-tariff-card__btn">Book Crysta →</a>
            </div>
        </div>
    </div>
</section>

<!-- ── Why Choose Airport Cab (Compact & Sleek) ── -->
<section class="page-section" style="padding: 2.5rem 0;">
    <div class="container">
        <div class="text-center reveal" style="margin-bottom: 1.5rem;">
            <p class="section-eyebrow" style="justify-content: center; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--blue, #2563eb); font-weight: 700;">WHY DROP CARS</p>
            <h2 class="section-title" style="font-size: clamp(1.3rem, 2.5vw, 1.7rem); margin-top: 0.35rem; font-weight: 800;">The Smarter Airport Cab Choice</h2>
        </div>
        <div class="airport-why-grid">
            <div class="why-item reveal reveal-d1">
                <div class="why-item__icon-wrapper">⏰</div>
                <h3 class="why-item__title">30-Min Early Dispatch</h3>
                <p class="why-item__desc">Driver reaches 30 minutes before your scheduled pickup to handle delays.</p>
            </div>
            <div class="why-item reveal reveal-d2">
                <div class="why-item__icon-wrapper">📍</div>
                <h3 class="why-item__title">Live GPS Tracking</h3>
                <p class="why-item__desc">Track your driver in real time via WhatsApp link from departure.</p>
            </div>
            <div class="why-item reveal reveal-d3">
                <div class="why-item__icon-wrapper">🛡️</div>
                <h3 class="why-item__title">Verified Drivers</h3>
                <p class="why-item__desc">Every driver is police-verified with background &amp; vehicle checks.</p>
            </div>
            <div class="why-item reveal reveal-d4">
                <div class="why-item__icon-wrapper">💰</div>
                <h3 class="why-item__title">Fixed Airport Fares</h3>
                <p class="why-item__desc">No surge pricing or meter tampering. Know exact fare upfront.</p>
            </div>
            <div class="why-item reveal reveal-d1">
                <div class="why-item__icon-wrapper">🧳</div>
                <h3 class="why-item__title">Luggage Assistance</h3>
                <p class="why-item__desc">Drivers assist with luggage. SUVs &amp; Crysta for large baggage.</p>
            </div>
            <div class="why-item reveal reveal-d2">
                <div class="why-item__icon-wrapper">📱</div>
                <h3 class="why-item__title">Instant Confirmation</h3>
                <p class="why-item__desc">Booking confirmation on WhatsApp with driver &amp; vehicle info.</p>
            </div>
            <div class="why-item reveal reveal-d3">
                <div class="why-item__icon-wrapper">🌙</div>
                <h3 class="why-item__title">24/7 Night Service</h3>
                <p class="why-item__desc">Early 4 AM departures &amp; late 2 AM arrivals — all covered.</p>
            </div>
            <div class="why-item reveal reveal-d4">
                <div class="why-item__icon-wrapper">🧾</div>
                <h3 class="why-item__title">GST Invoice</h3>
                <p class="why-item__desc">Digital GST bill sent to email after trip for reimbursement.</p>
            </div>
        </div>
    </div>
</section>

<!-- ── Tamil Nadu Airports Guide (Compact & Sleek) ── -->
<section class="page-section page-section--surface" style="padding: 3rem 0;">
    <div class="container">
        <div class="text-center reveal" style="margin-bottom: 1.5rem;">
            <p class="section-eyebrow" style="justify-content: center; font-size: 0.75rem; margin-bottom: 0.25rem;">Airport Guide</p>
            <h2 class="section-title" style="font-size: clamp(1.25rem, 2.2vw, 1.65rem); margin-bottom: 0.35rem;">Airports We Cover Across Tamil Nadu &amp; Border States</h2>
            <p class="section-desc" style="margin: 0 auto; font-size: 0.82rem; max-width: 580px;">From the bustling Chennai International to Tirupati pilgrim airport — our cab network covers all major hubs.</p>
        </div>
        <div class="airport-cards-grid">
            <?php foreach ($airports as $i => $airport): ?>
            <div class="airport-card reveal reveal-d<?php echo ($i % 3) + 1; ?>">
                <div>
                    <div class="airport-card__header">
                        <span class="airport-card__icon"><?php echo $airport['icon']; ?></span>
                        <span class="airport-card__iata"><?php echo $airport['iata']; ?></span>
                        <h3 class="airport-card__name"><?php echo htmlspecialchars($airport['name']); ?></h3>
                    </div>
                    <p class="airport-card__city">📍 <?php echo htmlspecialchars($airport['city']); ?> Airport Taxi</p>
                    <p class="airport-card__desc"><?php echo htmlspecialchars($airport['desc']); ?></p>
                    <div class="airport-card__routes">
                        <?php foreach (array_slice($airport['routes'], 0, 4) as $route): ?>
                        <span class="airport-card__route-tag"><?php echo htmlspecialchars($route); ?></span>
                        <?php endforeach; ?>
                        <?php if (count($airport['routes']) > 4): ?>
                        <span class="airport-card__route-tag">+<?php echo count($airport['routes']) - 4; ?> more</span>
                        <?php endif; ?>
                    </div>
                </div>
                <a href="#airport-booking-form"
                   class="airport-card__book-btn"
                   onclick="pickAirport(null, '<?php echo htmlspecialchars($airport['name']); ?> (<?php echo $airport['iata']; ?>)')">
                    Book Cab from <?php echo $airport['iata']; ?> →
                </a>
            </div>
            <?php endforeach; ?>
        </div>
    </div>
</section>

<!-- ── Airport Route Tables ── -->
<section class="page-section">
    <div class="container">
        <div class="text-center reveal" style="margin-bottom: 2.5rem;">
            <p class="section-eyebrow" style="justify-content: center;">Route Fares</p>
            <h2 class="section-title">Airport Taxi Fare Chart — Tamil Nadu Routes</h2>
            <p class="section-desc" style="margin: 0 auto;">All listed rates are <strong>All-Inclusive</strong> (Base Fare, Driver Bata, Tolls, State Taxes &amp; 5% GST included).</p>
        </div>

        <!-- Tabs -->
        <div class="route-tabs reveal" id="airport-route-tabs">
            <?php $ti = 0; foreach ($airportRoutes as $from => $routes): ?>
            <button type="button" class="route-tab<?php echo $ti === 0 ? ' active' : ''; ?>"
                    onclick="switchRouteTab(this, 'tab-<?php echo $ti; ?>')"><?php echo htmlspecialchars($from); ?></button>
            <?php $ti++; endforeach; ?>
        </div>

        <?php $ti = 0; foreach ($airportRoutes as $from => $routes): ?>
        <div class="route-table-panel reveal<?php echo $ti === 0 ? ' active' : ''; ?>" id="tab-<?php echo $ti; ?>">
            <div style="border-radius: 14px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
                <table class="routes-table">
                    <thead>
                        <tr>
                            <th>Route</th>
                            <th>Distance (Approx)</th>
                            <th>Sedan Fare (All-Inc)</th>
                            <th>Innova Fare (All-Inc)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($routes as $route):
                            preg_match('/\((\d+)\s*km\)/', $route, $m);
                            $dist = isset($m[1]) ? (int)$m[1] : 0;
                            
                            $billedDist = max($dist, 130);
                            $sedanRaw = ($billedDist * 15) + 400;
                            $sedanAllInc = round($sedanRaw * 1.05);

                            $innovaRaw = ($billedDist * 20) + 500;
                            $innovaAllInc = round($innovaRaw * 1.05);

                            $sedanFare = $dist > 0 ? '₹' . number_format($sedanAllInc) : '—';
                            $innovaFare = $dist > 0 ? '₹' . number_format($innovaAllInc) : '—';
                            $routeClean = preg_replace('/\s*\(\d+\s*km\)/', '', $route);
                        ?>
                        <tr>
                            <td><?php echo htmlspecialchars($routeClean); ?></td>
                            <td><?php echo $dist > 0 ? $dist . ' km' : '—'; ?></td>
                            <td><strong style="color: #0f172a;"><?php echo $sedanFare; ?></strong></td>
                            <td><strong style="color: #0f172a;"><?php echo $innovaFare; ?></strong></td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
            <p style="font-size: 0.82rem; color: #64748b; margin-top: 0.75rem; text-align: center;">✓ All listed fares are <strong>All-Inclusive</strong> (Base + Driver Bata + Tolls + Taxes + 5% GST). Final fare is calculated on exact route distance during booking.</p>
        </div>
        <?php $ti++; endforeach; ?>
    </div>
</section>

<!-- ── All Routes Pills (Airport Filter Tabs) ── -->
<section class="page-section page-section--surface">
    <div class="container">
        <?php
        $themeSuffix = $themeEngine->getWording('name', 'Drop Taxi');
        if (empty($themeSuffix) || $themeSuffix === 'Drop Cars' || $themeSuffix === 'Airport Taxi' || $themeSuffix === 'AirportTaxi.International') {
            $themeSuffix = 'Drop Taxi';
        }

        $pillsByAirport = [
            'Chennai' => [
                'Chennai Airport → Tiruvannamalai',
                'Chennai Airport → Vellore',
                'Chennai Airport → Pondicherry',
                'Chennai Airport → Kanchipuram',
                'Chennai Airport → Mahabalipuram',
                'Chennai Airport → Chengalpattu',
                'Chennai Airport → Villupuram',
                'Chennai Airport → Cuddalore',
                'Chennai Airport → Chidambaram',
                'Chennai Airport → Tirupattur',
                'Chennai Airport → Trichy',
                'Chennai Airport → Madurai',
                'Chennai Airport → Coimbatore',
                'Chennai Airport → Salem',
                'Chennai Airport → Erode',
                'Chennai Airport → Tirupati',
                'Chennai Airport → Bangalore',
                'Chennai Airport → Hosur',
                'Chennai Airport → Krishnagiri',
                'Chennai Airport → Nellore',
            ],
            'Coimbatore' => [
                'Coimbatore Airport → Ooty',
                'Coimbatore Airport → Coonoor',
                'Coimbatore Airport → Kodaikanal',
                'Coimbatore Airport → Tiruppur',
                'Coimbatore Airport → Erode',
                'Coimbatore Airport → Salem',
                'Coimbatore Airport → Pollachi',
                'Coimbatore Airport → Valparai',
                'Coimbatore Airport → Palakkad',
                'Coimbatore Airport → Thrissur',
                'Coimbatore Airport → Wayanad',
                'Coimbatore Airport → Gudalur',
                'Coimbatore Airport → Mettupalayam',
                'Coimbatore Airport → Dharapuram',
            ],
            'Madurai' => [
                'Madurai Airport → Rameshwaram',
                'Madurai Airport → Kanyakumari',
                'Madurai Airport → Tirunelveli',
                'Madurai Airport → Tuticorin',
                'Madurai Airport → Dindigul',
                'Madurai Airport → Theni',
                'Madurai Airport → Bodinayakkanur',
                'Madurai Airport → Virudhunagar',
                'Madurai Airport → Sivakasi',
                'Madurai Airport → Rajapalayam',
                'Madurai Airport → Tenkasi',
                'Madurai Airport → Courtallam',
                'Madurai Airport → Nagercoil',
            ],
            'Trichy' => [
                'Trichy Airport → Thanjavur',
                'Trichy Airport → Kumbakonam',
                'Trichy Airport → Karur',
                'Trichy Airport → Pudukkottai',
                'Trichy Airport → Perambalur',
                'Trichy Airport → Ariyalur',
                'Trichy Airport → Chidambaram',
                'Trichy Airport → Nagapattinam',
                'Trichy Airport → Velankanni',
                'Trichy Airport → Mayiladuthurai',
                'Trichy Airport → Tiruvarur',
                'Trichy Airport → Namakkal',
            ],
            'Salem' => [
                'Salem Airport → Yercaud',
                'Salem Airport → Namakkal',
                'Salem Airport → Dharmapuri',
                'Salem Airport → Krishnagiri',
                'Salem Airport → Erode',
                'Salem Airport → Mettur',
                'Salem Airport → Attur',
            ],
            'Bangalore' => [
                'Bangalore Airport → Hosur',
                'Bangalore Airport → Krishnagiri',
                'Bangalore Airport → Dharmapuri',
                'Bangalore Airport → Salem',
                'Bangalore Airport → Vellore',
                'Bangalore Airport → Tirupattur',
                'Bangalore Airport → Ambur',
                'Bangalore Airport → Kolar',
                'Bangalore Airport → Mysore',
            ],
            'Tirupati' => [
                'Tirupati Airport → Chennai',
                'Tirupati Airport → Vellore',
                'Tirupati Airport → Tiruvannamalai',
                'Tirupati Airport → Chittoor',
                'Tirupati Airport → Kanchipuram',
                'Tirupati Airport → Nellore',
            ],
            'Kochi' => [
                'Kochi Airport → Coimbatore',
                'Kochi Airport → Palakkad',
                'Kochi Airport → Thrissur',
                'Kochi Airport → Munnar',
                'Kochi Airport → Tiruppur',
            ],
            'Tuticorin' => [
                'Tuticorin Airport → Tirunelveli',
                'Tuticorin Airport → Kanyakumari',
                'Tuticorin Airport → Nagercoil',
                'Tuticorin Airport → Kovilpatti',
                'Tuticorin Airport → Tenkasi',
            ],
            'Pondicherry' => [
                'Pondicherry Airport → Chennai',
                'Pondicherry Airport → Cuddalore',
                'Pondicherry Airport → Tiruvannamalai',
                'Pondicherry Airport → Chidambaram',
            ],
            'Hyderabad' => [
                'Hyderabad Airport → Tirupati',
                'Hyderabad Airport → Kurnool',
                'Hyderabad Airport → Chennai',
            ],
        ];
        ?>
        <div class="text-center reveal" style="margin-bottom: 2rem;">
            <p class="section-eyebrow" style="justify-content: center; text-transform: uppercase; letter-spacing: 0.08em; color: var(--blue, #2563eb); font-weight: 700;">AIRPORT CAB FARES &amp; LIVE ROUTES</p>
            <h2 class="section-title" style="margin-top: 0.4rem; position: relative; display: inline-block;">
                Popular <?php echo htmlspecialchars($themeSuffix); ?> Airport Routes
                <span style="display: block; height: 3px; background: linear-gradient(90deg, #0ea5e9, #2563eb); width: 80%; margin: 0.35rem auto 0; border-radius: 2px;"></span>
            </h2>
        </div>

        <!-- Airport Tabs Bar -->
        <div class="airport-filter-tabs reveal">
            <?php $ak = 0; foreach ($pillsByAirport as $airportName => $pills): ?>
            <button type="button"
                    class="airport-filter-btn<?php echo $ak === 0 ? ' active' : ''; ?>"
                    onclick="switchAirportFilter(this, 'airport-panel-<?php echo $ak; ?>')">
                <?php echo htmlspecialchars($airportName); ?>
            </button>
            <?php $ak++; endforeach; ?>
        </div>

        <!-- Route Panels per Airport -->
        <div class="routes-showcase reveal">
            <?php $ak = 0; foreach ($pillsByAirport as $airportName => $pills): ?>
            <div class="airport-route-panel<?php echo $ak === 0 ? ' active' : ''; ?>" id="airport-panel-<?php echo $ak; ?>">
                <?php foreach ($pills as $pill):
                    $parts = explode(' → ', $pill);
                    $pickup = $parts[0] ?? '';
                    $drop = $parts[1] ?? '';
                    $fullRouteText = $pill . ' ' . $themeSuffix;
                ?>
                <a href="#airport-booking-form" class="route-pill"
                   onclick="setRoutePill('<?php echo htmlspecialchars($pickup, ENT_QUOTES); ?>', '<?php echo htmlspecialchars($drop, ENT_QUOTES); ?>'); return false;"
                   title="Book <?php echo htmlspecialchars($fullRouteText, ENT_QUOTES); ?>">
                    ✈️ <?php echo htmlspecialchars($fullRouteText); ?>
                </a>
                <?php endforeach; ?>
            </div>
            <?php $ak++; endforeach; ?>
        </div>
    </div>
</section>

<!-- ── SEO Content ── -->
<section class="page-section">
    <div class="container">
        <div class="seo-content reveal" style="max-width: 860px; margin: 0 auto;">
            <h2>Airport Taxi Service in Tamil Nadu — Complete Guide</h2>
            <p>
                Tamil Nadu is home to five major commercial airports and is served by several border city airports that handle millions of passengers annually. Getting a reliable, affordable cab to or from these airports has historically been a challenge — with unpredictable meters, lack of transparency, and no driver verification. Drop Cars was built to solve exactly this problem.
            </p>

            <h3>Chennai International Airport (MAA) Taxi Service</h3>
            <p>
                Chennai International Airport is one of South India's busiest international terminals, handling over 20 million passengers per year. It serves as the primary gateway for travelers from Tamil Nadu, Pondicherry, and parts of Andhra Pradesh. Our airport taxi from MAA covers all major destinations including Tiruvannamalai, Vellore, Madurai, Coimbatore, Trichy, Salem, Pondicherry and beyond — all at transparent per-km rates.
            </p>
            <ul>
                <li>Terminal 1 (Domestic): Air India, IndiGo, SpiceJet domestic flights</li>
                <li>Terminal 2 (International): Direct flights to Singapore, Dubai, Kuala Lumpur, London</li>
                <li>24/7 taxi service with drivers stationed 30 minutes before pickup</li>
                <li>Free-wait policy up to 45 minutes for delayed flights</li>
            </ul>

            <h3>Coimbatore International Airport (CJB) Taxi Service</h3>
            <p>
                Coimbatore airport is the gateway to the Western Ghats tourism circuit including Ooty, Munnar and Kodaikanal. Our cabs from CJB serve Tiruppur, Erode, Salem, Palakkad, Thrissur and all surrounding towns. Whether you're heading to a textile business in Tiruppur or a resort in Valparai, Drop Cars has you covered.
            </p>

            <h3>Madurai Airport (IXM) Taxi Service</h3>
            <p>
                Madurai airport serves the temple city and surrounding pilgrim destinations like Rameshwaram, Kanyakumari, and Tirunelveli. With flights from Singapore, Dubai, Chennai and Bangalore, it's a key hub for both domestic and NRI pilgrims. Drop Cars provides fixed-rate airport cabs from IXM to all southern Tamil Nadu destinations.
            </p>

            <h3>Trichy International Airport (TRZ) Taxi Service</h3>
            <p>
                Trichy airport is a major hub for Middle East-bound workers and serves Central Tamil Nadu including Thanjavur (UNESCO World Heritage Site), Kumbakonam temple town, Karur, and Pudukkottai. Our fleet covers all routes from TRZ with clean AC vehicles.
            </p>

            <h3>Border Airport Taxi Service (Bangalore, Tirupati, Kochi)</h3>
            <p>
                Many Tamil Nadu travelers fly via Bangalore (BLR), Tirupati (TIR), or Kochi (COK). Drop Cars connects these airports to all Tamil Nadu cities including Vellore, Krishnagiri, Hosur (from BLR), Tiruvannamalai, Vellore (from TIR), and Coimbatore, Palakkad (from COK).
            </p>

            <h2>How to Book Airport Cab in Tamil Nadu</h2>
            <ol>
                <?php foreach ($airportHowToSteps as $step): ?>
                <li><strong><?php echo htmlspecialchars($step[0]); ?></strong> — <?php echo htmlspecialchars($step[1]); ?></li>
                <?php endforeach; ?>
            </ol>
        </div>
    </div>
</section>

<!-- ── FAQ ── -->
<section class="page-section page-section--surface">
    <div class="container" style="max-width: 760px;">
        <div class="text-center reveal" style="margin-bottom: 2.5rem;">
            <p class="section-eyebrow" style="justify-content: center;">FAQ</p>
            <h2 class="section-title">Airport Taxi Questions</h2>
        </div>
        <?php foreach ($airportFaqs as $i => $faq): ?>
        <div class="faq-item reveal" id="faq-airport-<?php echo $i; ?>">
            <button class="faq-question" onclick="toggleFaq(this)" aria-expanded="false">
                <?php echo htmlspecialchars($faq[0]); ?>
                <span class="faq-question__icon" aria-hidden="true">+</span>
            </button>
            <div class="faq-answer"><p><?php echo htmlspecialchars($faq[1]); ?></p></div>
        </div>
        <?php endforeach; ?>
    </div>
</section>

<!-- ── Final CTA ── -->
<section class="page-section--sm">
    <div class="container">
        <div class="cta-banner reveal">
            <h2 class="cta-banner__title">✈️ Book Your Airport Cab Now</h2>
            <p class="cta-banner__desc">Fixed fares · 24/7 service · Police-verified drivers · All Tamil Nadu airports</p>
            <div class="cta-banner__btns">
                <a href="#airport-booking-form" class="btn-cta-white">🚕 Book Airport Cab</a>
                <a href="tel:+91<?php echo $phoneDigits; ?>" class="btn-cta-outline-white">📞 +91 <?php echo $phone; ?></a>
                <a href="https://wa.me/<?php echo $waDigits; ?>?text=I+need+an+airport+cab+booking" target="_blank" rel="noopener" class="btn-cta-outline-white">💬 WhatsApp</a>
            </div>
        </div>
    </div>
</section>

<?php echo $shell->renderFooter(); ?>

<!-- Scripts: Full booking form JS + page animations -->
<script>
// ── Progressive Expandable Form Step Navigation ──
function gotoFormStep(stepNum) {
    document.querySelectorAll('.form-step').forEach((step, idx) => {
        if (idx + 1 === stepNum) {
            step.classList.add('active');
            const badge = document.getElementById('step' + stepNum + '-badge');
            if (badge) { badge.textContent = 'Active'; badge.style.color = '#0284c7'; }
        } else {
            step.classList.remove('active');
            const badge = document.getElementById('step' + (idx + 1) + '-badge');
            if (badge) {
                if (idx + 1 < stepNum) {
                    badge.textContent = '✓ Done';
                    badge.style.color = '#16a34a';
                } else {
                    badge.textContent = 'Pending';
                    badge.style.color = '#94a3b8';
                }
            }
        }
    });
}

function validateStep1AndNext() {
    const pickup = document.getElementById('pickup');
    const drop = document.getElementById('drop');
    const pDate = document.getElementById('pickup-date');
    const pTime = document.getElementById('pickup-time');
    if (pickup && !pickup.value.trim()) {
        pickup.focus();
        if (pickup.reportValidity) pickup.reportValidity();
        return;
    }
    if (drop && !drop.value.trim()) {
        drop.focus();
        if (drop.reportValidity) drop.reportValidity();
        return;
    }
    if (pDate && !pDate.value) { pDate.focus(); return; }
    if (pTime && !pTime.value) { pTime.focus(); return; }
    gotoFormStep(2);
    const step2El = document.getElementById('form-step-2');
    if (step2El) step2El.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Airport Sub-Tabs Switcher (Outstation vs Local Same-City) ──
function switchAirportSubtab(mode) {
    const outBtn = document.getElementById('subtab-outstation');
    const locBtn = document.getElementById('subtab-local');
    const subtypeInput = document.getElementById('airport-subtype-input');
    const pickupInput = document.getElementById('pickup');
    const dropInput = document.getElementById('drop');

    if (mode === 'local') {
        if (outBtn) outBtn.classList.remove('active');
        if (locBtn) locBtn.classList.add('active');
        if (subtypeInput) subtypeInput.value = 'local';
        if (pickupInput && !pickupInput.value) pickupInput.placeholder = 'e.g. Chennai Airport (MAA)';
        if (dropInput && !dropInput.value) dropInput.placeholder = 'e.g. T. Nagar, Chennai';
    } else {
        if (locBtn) locBtn.classList.remove('active');
        if (outBtn) outBtn.classList.add('active');
        if (subtypeInput) subtypeInput.value = 'outstation';
        if (pickupInput && !pickupInput.value) pickupInput.placeholder = 'Type airport name or select above';
        if (dropInput && !dropInput.value) dropInput.placeholder = 'City, Area or Hotel name';
    }
    if (window.updateDynamicTopTitle) window.updateDynamicTopTitle();
}

// ── WhatsApp Field Toggle Listener ──
document.addEventListener('change', function(e) {
    if (e.target && e.target.id === 'use-whatsapp-check') {
        const isChecked = e.target.checked;
        const waField = document.getElementById('whatsapp-field');
        if (waField) {
            waField.classList.toggle('hidden', isChecked);
            const waInput = document.getElementById('whatsapp-phone');
            if (waInput) {
                waInput.required = !isChecked;
                if (!isChecked) {
                    setTimeout(function() { waInput.focus(); }, 100);
                } else {
                    waInput.value = '';
                }
            }
        }
    }
});

// ── Luggage Counter Stepper Logic & Single-Model Focus ──
window.luggageCounts = { small: 2, medium: 1, large: 0 };

window.toggleLuggagePopover = function(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    // Blur any active inputs or select dropdowns so only one model is open at a time
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
    }
    const pop = document.getElementById('luggage-popover');
    if (pop) {
        pop.classList.toggle('is-hidden');
    }
};

// Single-Model behavior: Close luggage popover when clicking outside or focusing another field
document.addEventListener('click', function(e) {
    const pop = document.getElementById('luggage-popover');
    const trigger = document.getElementById('luggage-picker-trigger');
    const closeBtn = document.getElementById('luggage-popover-close');
    const doneBtn = document.getElementById('luggage-done-btn');

    if (pop && !pop.classList.contains('is-hidden')) {
        if (doneBtn && doneBtn.contains(e.target)) {
            pop.classList.add('is-hidden');
            return;
        }
        if (closeBtn && closeBtn.contains(e.target)) {
            pop.classList.add('is-hidden');
            return;
        }
        if (trigger && !trigger.contains(e.target) && !pop.contains(e.target)) {
            pop.classList.add('is-hidden');
        }
    }
});

document.addEventListener('focusin', function(e) {
    const pop = document.getElementById('luggage-popover');
    const trigger = document.getElementById('luggage-picker-trigger');
    if (pop && !pop.classList.contains('is-hidden')) {
        if (e.target && !pop.contains(e.target) && !trigger.contains(e.target)) {
            pop.classList.add('is-hidden');
        }
    }
});

function changeLuggageCount(type, delta) {
    if (!window.luggageCounts) window.luggageCounts = { small: 0, medium: 0, large: 0 };
    let current = window.luggageCounts[type] || 0;
    let next = current + delta;
    if (next < 0) next = 0;
    if (next > 10) next = 10;
    window.luggageCounts[type] = next;

    // Update UI Counter numbers
    const countElem = document.getElementById(type + '-count-val');
    if (countElem) countElem.textContent = next;

    // Update Hidden Inputs
    const sInput = document.getElementById('luggage-small-input');
    const mInput = document.getElementById('luggage-medium-input');
    const lInput = document.getElementById('luggage-large-input');
    const countInput = document.getElementById('luggage-count');
    const summaryInput = document.getElementById('luggage-summary-input');
    const displaySpan = document.getElementById('luggage-display-text');

    if (sInput) sInput.value = window.luggageCounts.small;
    if (mInput) mInput.value = window.luggageCounts.medium;
    if (lInput) lInput.value = window.luggageCounts.large;

    const total = window.luggageCounts.small + window.luggageCounts.medium + window.luggageCounts.large;
    if (countInput) countInput.value = total;

    // Format display string e.g. 2 Small + 1 Med
    let breakdownParts = [];
    if (window.luggageCounts.small > 0) breakdownParts.push(`${window.luggageCounts.small} Small`);
    if (window.luggageCounts.medium > 0) breakdownParts.push(`${window.luggageCounts.medium} Med`);
    if (window.luggageCounts.large > 0) breakdownParts.push(`${window.luggageCounts.large} Large`);

    let displayStr = breakdownParts.length > 0 ? breakdownParts.join(' + ') : '0 Bags';
    let codeStr = `${window.luggageCounts.small}+${window.luggageCounts.medium}+${window.luggageCounts.large}`;

    if (displaySpan) displaySpan.textContent = displayStr;
    if (summaryInput) summaryInput.value = codeStr;

    autoSuggestVehicle();
}

// ── Auto-suggest Vehicle based on Passenger & Luggage Counts ──
// Shares one "did the rider manually pick a vehicle?" flag with ui-controls.js
// (window.DropCarsUI.isVehicleUserPicked) so this no longer stomps a manual
// card tap the moment the rider adjusts luggage counts afterwards — the two
// auto-suggest sources used to disagree (this one suggested CRYSTA at 6+
// passengers, ui-controls.js's passenger-only rule suggests INNOVA) and race
// on every luggage +/- tap, which is what made vehicle selection feel broken.
function autoSuggestVehicle() {
    if (window.DropCarsUI && window.DropCarsUI.isVehicleUserPicked && window.DropCarsUI.isVehicleUserPicked()) {
        return;
    }

    const pElem = document.getElementById('passenger-count');
    const pCount = pElem ? (parseInt(pElem.value, 10) || 1) : 1;

    const small = window.luggageCounts ? (window.luggageCounts.small || 0) : 0;
    const medium = window.luggageCounts ? (window.luggageCounts.medium || 0) : 0;
    const large = window.luggageCounts ? (window.luggageCounts.large || 0) : 0;

    const lugScore = (small * 0.75) + (medium * 1.0) + (large * 1.5);

    const order = ['SEDAN', 'SUV', 'INNOVA', 'CRYSTA'];
    // Base suggestion matches ui-controls.js's passenger-only rule (6+ → Innova)
    // so the two systems agree when luggage is light; heavy luggage can still
    // bump the pick up (never down) to a roomier vehicle.
    let suggestedVehicle = pCount >= 6 ? 'INNOVA' : (pCount > 4 ? 'SUV' : 'SEDAN');

    if (lugScore >= 5.0 || large >= 3) {
        suggestedVehicle = 'CRYSTA';
    } else if (lugScore >= 3.0 || large >= 2) {
        if (order.indexOf('SUV') > order.indexOf(suggestedVehicle)) {
            suggestedVehicle = 'SUV';
        }
    }

    const vInput = document.getElementById('vehicle-type-input');
    if (vInput) vInput.value = suggestedVehicle;

    if (window.DropCarsUI && window.DropCarsUI.setVehicleType) {
        window.DropCarsUI.setVehicleType(suggestedVehicle);
    } else {
        document.querySelectorAll('.vehicle-selector-card').forEach(btn => {
            if (btn.getAttribute('data-vehicle') === suggestedVehicle) {
                btn.classList.add('active', 'vehicle-selector-card--active');
            } else {
                btn.classList.remove('active', 'vehicle-selector-card--active');
            }
        });
    }

    // Hint element kept hidden — suggestion label removed per design
}

// ── Progressive Sequential Automatic Step Extraction ──
function checkAndAutoExpandSteps() {
    const pickupInput = document.getElementById('pickup');
    const dropInput = document.getElementById('drop');
    const step2 = document.getElementById('form-step-2');
    const svcTypeEl = document.getElementById('service-type');

    const pVal = pickupInput ? pickupInput.value.trim() : '';
    const dVal = dropInput ? dropInput.value.trim() : '';
    // Rental has no drop field (updateTripUI() clears & hides it) — only
    // pickup gates step 2 there. Outstation/Local still need both.
    const isRental = svcTypeEl && svcTypeEl.value === 'hourly_rental';
    const ready = isRental ? (pVal !== '') : (pVal !== '' && dVal !== '');

    if (ready) {
        if (step2 && !step2.classList.contains('active')) {
            step2.classList.add('active');
        }
    } else {
        if (step2) {
            step2.classList.remove('active');
        }
    }
}

// ── Airport Quick Select ──
function pickAirport(btn, airportName) {
    const pickupInput = document.getElementById('pickup');
    const dropInput = document.getElementById('drop');
    if (pickupInput) {
        pickupInput.value = airportName;
        pickupInput.dispatchEvent(new Event('input', {bubbles: true}));
    }
    document.querySelectorAll('.airport-chip').forEach(c => c.classList.remove('active'));
    if (btn) btn.classList.add('active');

    checkAndAutoExpandSteps();

    if (dropInput && !dropInput.value.trim()) {
        setTimeout(() => dropInput.focus(), 150);
    }

    if (window.DropCarsScrollToBookingForm) {
        window.DropCarsScrollToBookingForm(true);
    } else {
        const formEl = document.getElementById('airport-booking-form');
        if (formEl) formEl.scrollIntoView({behavior: 'smooth', block: 'start'});
    }
}

function setAirport(name) {
    const pickupInput = document.getElementById('pickup');
    const dropInput = document.getElementById('drop');
    if (pickupInput) {
        pickupInput.value = name;
        pickupInput.dispatchEvent(new Event('input', {bubbles: true}));
        checkAndAutoExpandSteps();
        if (dropInput && !dropInput.value.trim()) {
            setTimeout(() => dropInput.focus(), 150);
        }
        if (window.DropCarsScrollToBookingForm) {
            window.DropCarsScrollToBookingForm(true);
        } else {
            document.getElementById('airport-booking-form').scrollIntoView({behavior:'smooth'});
        }
    }
}

function setRoutePill(pickupLoc, dropLoc) {
    const pickupInput = document.getElementById('pickup');
    const dropInput = document.getElementById('drop');
    if (pickupInput) {
        pickupInput.value = pickupLoc;
        pickupInput.dispatchEvent(new Event('input', {bubbles: true}));
    }
    if (dropInput && dropLoc) {
        dropInput.value = dropLoc;
        dropInput.dispatchEvent(new Event('input', {bubbles: true}));
    }
    checkAndAutoExpandSteps();
    if (window.DropCarsScrollToBookingForm) {
        window.DropCarsScrollToBookingForm(true);
    } else {
        const formEl = document.getElementById('airport-booking-form');
        if (formEl) {
            formEl.scrollIntoView({behavior: 'smooth', block: 'start'});
        }
    }
}

function switchAirportFilter(btn, panelId) {
    document.querySelectorAll('.airport-filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.airport-route-panel').forEach(p => p.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const target = document.getElementById(panelId);
    if (target) {
        target.classList.add('active');
    }
}

// ── Route Tab Switch ──
function switchRouteTab(btn, panelId) {
    document.querySelectorAll('.route-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.route-table-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const panel = document.getElementById(panelId);
    if (panel) panel.classList.add('active');
}

// ── Scroll Reveal ──
(function(){
    const obs = new IntersectionObserver(entries => {
        entries.forEach(e => { if(e.isIntersecting) e.target.classList.add('revealed'); });
    }, {threshold: 0.08, rootMargin: '0px 0px -50px 0px'});
    document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale').forEach(el => obs.observe(el));

    // Counter
    function animateCount(el) {
        const t = parseInt(el.dataset.target, 10), d = 1800;
        let s = null;
        const step = ts => {
            if (!s) s = ts;
            const p = Math.min((ts - s) / d, 1), ev = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.floor(ev * t).toLocaleString('en-IN');
            if (p < 1) requestAnimationFrame(step);
            else el.textContent = t.toLocaleString('en-IN');
        };
        requestAnimationFrame(step);
    }
    const cobs = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting && !e.target.dataset.counted) {
                e.target.dataset.counted = '1';
                animateCount(e.target);
            }
        });
    }, {threshold: 0.3});
    document.querySelectorAll('.count-up').forEach(el => cobs.observe(el));

    // FAQ
    window.toggleFaq = function(btn) {
        const item = btn.closest('.faq-item'), open = item.classList.contains('open');
        document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
        if (!open) item.classList.add('open');
        btn.setAttribute('aria-expanded', (!open).toString());
    };
})();

// Ensure Pickup Date & Time are always prefilled + auto expand step on location change
document.addEventListener('DOMContentLoaded', function() {
    var pDate = document.getElementById('pickup-date');
    var pTime = document.getElementById('pickup-time');
    var now = new Date();
    var ist = new Date(now.getTime() + (330 * 60000));
    if (pDate && !pDate.value) {
        pDate.value = ist.toISOString().split('T')[0];
    }
    if (pTime && !pTime.value) {
        var hours = String(ist.getUTCHours()).padStart(2, '0');
        var mins = String(ist.getUTCMinutes()).padStart(2, '0');
        pTime.value = hours + ':' + mins;
    }

    ['pickup', 'drop'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) {
            ['input', 'change', 'keyup', 'blur', 'dropcars:location_selected'].forEach(function(evt) {
                el.addEventListener(evt, checkAndAutoExpandSteps);
            });
        }
    });
    checkAndAutoExpandSteps();

    // Note: #calculate-fare-btn click is handled by booking-form.js (full interactive fare flow)
    // The full booking flow (route calculation, vehicle selection drawer, confirmation) is
    // managed by booking-form.js which is loaded below via deferred script.
});
</script>

<!-- Quote/Fare Selection Modal – required by booking-form.js for the interactive fare flow -->
<div class="quote-modal" id="quote-modal" aria-hidden="true">
    <div class="quote-modal__card" role="dialog" aria-modal="true">
        <button class="quote-modal__close" id="quote-close" aria-label="Close">✕</button>
        <p class="eyebrow">Curated Ride Options</p>
        <h3 id="quote-summary">Choose your airport cab</h3>
        <div class="quote-modal__meta"><span id="quote-route"></span><span id="quote-fare"></span></div>
        <div class="vehicle-grid" id="vehicle-grid"></div>
        <p class="quote-modal__cta">Call <a href="tel:+91<?php echo htmlspecialchars($phoneDigits); ?>">+91 <?php echo htmlspecialchars($phone); ?></a> to confirm.</p>
        <div class="quote-modal__actions">
            <button type="button" class="btn-outline" id="quote-back">Back</button>
            <button type="button" class="btn-primary" id="quote-continue">Continue</button>
        </div>
    </div>
</div>

<!-- Form response element used by booking-form.js -->
<p id="form-response" class="form-response" aria-live="polite"></p>

<!-- Inject global config for frontend fare calculation -->
<script>window.DROP_CARS_CONFIG = <?php echo json_encode($config, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?>;</script>
<script defer src="/assets/js/config.js?v=<?php echo @filemtime(__DIR__.'/../assets/js/config.js'); ?>"></script>
<script defer src="/assets/js/fare-calculator.js?v=<?php echo @filemtime(__DIR__.'/../assets/js/fare-calculator.js'); ?>"></script>
<script defer src="/assets/js/location-picker.js?v=<?php echo @filemtime(__DIR__.'/../assets/js/location-picker.js'); ?>"></script>
<script defer src="/assets/js/maps-integration.js?v=<?php echo @filemtime(__DIR__.'/../assets/js/maps-integration.js'); ?>"></script>
<script defer src="/assets/js/ui-controls.js?v=<?php echo @filemtime(__DIR__.'/../assets/js/ui-controls.js'); ?>"></script>
<script defer src="/assets/js/booking-form.js?v=<?php echo @filemtime(__DIR__.'/../assets/js/booking-form.js'); ?>"></script>
<script defer src="/assets/js/main.js?v=<?php echo @filemtime(__DIR__.'/../assets/js/main.js'); ?>"></script>
<script defer src="/assets/js/theme-switcher.js?v=<?php echo @filemtime(__DIR__.'/../assets/js/theme-switcher.js'); ?>"></script>
<script defer src="/assets/js/phone-country.js?v=<?php echo @filemtime(__DIR__.'/../assets/js/phone-country.js'); ?>"></script>
<script defer src="/assets/js/whatsapp.js?v=<?php echo @filemtime(__DIR__.'/../assets/js/whatsapp.js'); ?>"></script>
<script defer src="/assets/js/auto-scroll-booking.js?v=<?php echo @filemtime(__DIR__.'/../assets/js/auto-scroll-booking.js'); ?>"></script>
</body>
</html>
