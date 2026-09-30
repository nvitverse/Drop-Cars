<?php
/**
 * Enhanced Tariff Page - Drop Cars
 * Modern UI, Transparent Pricing, and Dynamic Data.
 */

require_once __DIR__ . '/../includes/check-maintenance.php';
require_once __DIR__ . '/shell.php';
require_once __DIR__ . '/seo-core.php';
require_once __DIR__ . '/theme-engine.php';
require_once __DIR__ . '/../includes/paths.php';

$themeEngine = new ThemeEngine();
$activeTheme = $themeEngine->detectTheme();
$bookNowUrl = (($activeTheme['slug'] ?? 'drop-cars') === 'drop-cars') ? dropcars_url('booknow') : dropcars_url($activeTheme['slug'] . '/booknow');
$allThemes = $themeEngine->getAllThemes();
$shell = new UIShell($activeTheme, $allThemes);
$config = json_decode(file_get_contents(__DIR__ . '/../data/config.json'), true);
$fares = $config['fares'] ?? [];
$vehicles = $config['vehicles'] ?? [];

$title = 'Affordable Taxi Tariff | One Way Drop Taxi & Outstation Cab Prices';
$description = 'Transparent taxi tariff for one-way and round-trip rides across South India. Fixed KM rates, no hidden charges. Save up to 50% with our One Way Drop Taxi service.';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="<?php echo htmlspecialchars($description, ENT_QUOTES, 'UTF-8'); ?>" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="<?php echo htmlspecialchars(dropcars_canonical_request_url(), ENT_QUOTES, 'UTF-8'); ?>" />
    <title><?php echo htmlspecialchars($title, ENT_QUOTES, 'UTF-8'); ?></title>

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" />

    <link rel="stylesheet" href="/assets/css/base.css" />
    <link rel="stylesheet" href="/assets/css/layout.css" />
    <link rel="stylesheet" href="/assets/css/navbar.css" />
    <link rel="stylesheet" href="/assets/css/footer.css" />
    <link rel="stylesheet" href="/assets/css/responsive.css" />
    <link rel="stylesheet" href="/assets/css/whatsapp.css" />
    <link rel="stylesheet" href="/assets/css/dark-mode.css?v=2.0" />
    <link rel="stylesheet" href="/assets/css/light-theme.css">
    <?php if (($activeTheme['slug'] ?? '') === 'airport-taxi'): ?>
    <link rel="stylesheet" href="/assets/css/theme-airporttaxi.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/theme-airporttaxi.css'); ?>">
    <?php endif; ?>
    <script src="/assets/js/dark-mode.js?v=2.0"></script>
<?php include __DIR__ . '/../includes/google-tag.php'; ?>
</head>
<body class="<?php echo ($activeTheme['slug'] ?? '') === 'airport-taxi' ? ('theme-airporttaxi ' . (function_exists('dropcars_is_native_airporttaxi_host') && dropcars_is_native_airporttaxi_host() ? 'ati-native' : 'ati-embedded')) : ''; ?>">
<?php
echo $shell->renderHeader();
?>

<main class="tariff-v2">
    <!-- Hero Section -->
    <section class="tariff-hero">
        <div class="container">
            <nav class="breadcrumb">
                <a href="/">Home</a><span class="sep">/</span><span>Tariff</span>
            </nav>
            <h1 class="hero-title">Transparent <span>Pricing</span>, No Hidden Costs</h1>
            <p class="hero-subtitle">Affordable and competitive taxi fares for One-way and Round-trip Journeys across South India.</p>
        </div>
    </section>

    <!-- Pricing Tabs/Toggle -->
    <section class="pricing-tabs-section">
        <div class="container">
            <div class="tabs-container">
                <button class="tab-btn active" data-target="oneway">One-Way Drop</button>
                <button class="tab-btn" data-target="round">Outstation Round Trip</button>
            </div>

            <!-- ONE WAY CONTENT -->
            <div class="tab-content active" id="oneway">
                <div class="pricing-grid">
                    <?php 
                    $onewayIcons = [
                        'SEDAN' => 'fa-car-side',
                        'SUV' => 'fa-car-rear',
                        'MUV' => 'fa-shuttle-van',
                        'CRYSTA' => 'fa-star'
                    ];
                    $vehicleImages = [
                        'SEDAN' => '/assets/img/vehicles/Etios.png',
                        'SUV' => '/assets/img/vehicles/Suv.png',
                        'MUV' => '/assets/img/vehicles/Innova.png',
                        'CRYSTA' => '/assets/img/vehicles/innova-crysta.png'
                    ];
                    
                    // If we have dynamic vehicles from config, use them; otherwise fallback to fares
                    $displayVehicles = !empty($vehicles) ? $vehicles : array_map(function($k, $v) {
                        return ['value' => $k, 'rate' => $v];
                    }, array_keys($fares['baseFareOneWay'] ?? []), array_values($fares['baseFareOneWay'] ?? []));

                    foreach ($displayVehicles as $v): 
                        $type = $v['value'];
                        $rate = $v['rate'];
                        $icon = $onewayIcons[strtoupper($type)] ?? 'fa-car';
                        $image = $vehicleImages[strtoupper($type)] ?? '/assets/img/vehicles/Dzire.png';
                        $capacity = $v['capacity'] ?? '4+1';
                        $luggage = $v['luggage'] ?? '3';
                        $isAc = $v['is_ac'] ?? true;
                        $model = $v['model'] ?? ucfirst(strtolower($type));
                        
                        $oldRate = $v['old_rate'] ?? 0;
                        $reason = $v['reasoning_note'] ?? '';
                        $bata = $fares['bataOneWay'][$type] ?? 400;
                    ?>
                    <div class="pricing-card">
                        <div class="card-icon">
                            <img src="<?php echo $image; ?>" alt="<?php echo htmlspecialchars($model); ?>" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-block';" />
                            <i class="fa-solid <?php echo $icon; ?>" style="display:none;"></i>
                        </div>
                        <h3 class="vehicle-name"><?php echo htmlspecialchars($model); ?></h3>
                        
                        <?php if (!empty($reason)): ?>
                            <div class="promo-badge" style="display: inline-flex; align-items: center; gap: 4px; background: #fff7ed; border: 1px solid #ffedd5; border-radius: 99px; padding: 4px 10px; font-size: 0.72rem; font-weight: 700; color: #c2410c; margin: 0 auto 12px; width: max-content;">
                                <i class="fa-solid fa-bolt"></i> <?php echo htmlspecialchars($reason); ?>
                            </div>
                        <?php endif; ?>

                        <div class="price-box">
                            <?php if (!empty($oldRate) && $oldRate > $rate): ?>
                                <span class="old-rate">₹<?php echo $oldRate; ?></span>
                            <?php endif; ?>
                            <span class="currency">₹</span>
                            <span class="amount"><?php echo $rate; ?></span>
                            <span class="per">/ km</span>
                        </div>
                        <ul class="card-features">
                            <li><i class="fa-solid fa-users"></i> <?php echo $capacity; ?> Seats</li>
                            <li><i class="fa-solid fa-suitcase"></i> <?php echo $luggage; ?> Bags</li>
                            <li><i class="fa-solid <?php echo $isAc ? 'fa-snowflake' : 'fa-wind'; ?>"></i> <?php echo $isAc ? 'AC Included' : 'Non-AC'; ?></li>
                            <li><i class="fa-solid fa-user-tie"></i> Driver Bata: ₹<?php echo $bata; ?> / Day</li>
                            <li><i class="fa-solid fa-check"></i> One-Way Drop</li>
                            <li><i class="fa-solid fa-check"></i> Verified Driver</li>
                        </ul>
                        <a href="<?php echo htmlspecialchars($bookNowUrl, ENT_QUOTES, 'UTF-8'); ?>" class="btn-book">Book Now</a>
                    </div>
                    <?php endforeach; ?>
                </div>
            </div>

            <!-- ROUND TRIP CONTENT -->
            <div class="tab-content" id="round">
                <div class="pricing-grid">
                    <?php 
                    foreach ($fares['baseFareRoundTrip'] as $type => $rate): 
                        $icon = $onewayIcons[strtoupper($type)] ?? 'fa-car';
                        $image = $vehicleImages[strtoupper($type)] ?? '/assets/img/vehicles/Etios.png';
                        
                        $oldRate = $fares['oldFareRoundTrip'][$type] ?? 0;
                        $reason = $fares['reasoningNotes'][$type] ?? '';
                        $bata = $fares['bataRoundTrip'][$type] ?? 400;
                    ?>
                    <div class="pricing-card highlight">
                        <div class="card-icon">
                            <img src="<?php echo $image; ?>" alt="<?php echo ucfirst(strtolower($type)); ?>" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-block';" />
                            <i class="fa-solid <?php echo $icon; ?>" style="display:none;"></i>
                        </div>
                        <h3 class="vehicle-name"><?php echo ucfirst(strtolower($type)); ?></h3>

                        <?php if (!empty($reason)): ?>
                            <div class="promo-badge" style="display: inline-flex; align-items: center; gap: 4px; background: #fff7ed; border: 1px solid #ffedd5; border-radius: 99px; padding: 4px 10px; font-size: 0.72rem; font-weight: 700; color: #c2410c; margin: 0 auto 12px; width: max-content;">
                                <i class="fa-solid fa-bolt"></i> <?php echo htmlspecialchars($reason); ?>
                            </div>
                        <?php endif; ?>

                        <div class="price-box">
                            <?php if (!empty($oldRate) && $oldRate > $rate): ?>
                                <span class="old-rate">₹<?php echo $oldRate; ?></span>
                            <?php endif; ?>
                            <span class="currency">₹</span>
                            <span class="amount"><?php echo $rate; ?></span>
                            <span class="per">/ km</span>
                        </div>
                        <ul class="card-features">
                            <li><i class="fa-solid fa-users"></i> 4+1 Seats</li>
                            <li><i class="fa-solid fa-user-tie"></i> Driver Bata: ₹<?php echo $bata; ?> / Day</li>
                            <li><i class="fa-solid fa-shield-heart"></i> Doorstep Pickup</li>
                            <li><i class="fa-solid fa-clock"></i> Flexible Timings</li>
                        </ul>
                        <p class="min-dist">Min. <?php echo $fares['minDistanceRoundTripPerDay'] ?? 250; ?> KM/Day</p>
                        <a href="<?php echo htmlspecialchars($bookNowUrl, ENT_QUOTES, 'UTF-8'); ?>" class="btn-book">Book Now</a>
                    </div>
                    <?php endforeach; ?>
                </div>
            </div>
        </div>
    </section>

    <!-- Fare Calculator Section -->
    <section class="fare-calc-section" id="premium-calculator">
        <div class="container">
            <div class="calc-box-luxury">
                <div class="calc-header-elite">
                    <p class="calc-eyebrow">SMART ESTIMATOR</p>
                    <h2>Dynamic <span>Fare Calculator</span></h2>
                    <p>Enter your distance to get an instant pricing estimate for all vehicle types.</p>
                </div>
                
                <div class="calc-controls-grid">
                    <div class="input-field-elite">
                        <label>Distance (KM)</label>
                        <input type="number" id="calc-distance" placeholder="Enter distance e.g. 150" value="150" min="1">
                    </div>
                    <div class="input-field-elite">
                        <label>Trip Category</label>
                        <select id="calc-category">
                            <option value="oneway">One-Way Drop</option>
                            <option value="round">Round Trip (Per Day)</option>
                        </select>
                    </div>
                    <div class="input-field-elite">
                        <label>Driver Bata</label>
                        <input type="text" id="calc-driver-bata" value="₹<?php echo $fares['driverBata'] ?? 400; ?>" disabled>
                    </div>
                </div>

                <div class="calc-results-list" id="calc-results">
                    <!-- Javascript will populate this -->
                </div>

                <div class="calc-footer-note">
                    <p>* Estimates based on standard rates. Toll, Parking and State Taxes extra as per actuals.</p>
                </div>
            </div>
        </div>
    </section>

    <!-- Inclusions Grid -->
    <section class="inclusions-section">
        <div class="container">
            <h2 class="section-title">What's <span>Included?</span></h2>
            <div class="inclusions-grid">
                <div class="inc-item">
                    <i class="fa-solid fa-gas-pump"></i>
                    <h4>Fuel & AC</h4>
                    <p>All fuel charges and air conditioning are inclusive of the base fare.</p>
                </div>
                <div class="inc-item">
                    <i class="fa-solid fa-user-tie"></i>
                    <h4>Professional Driver</h4>
                    <p>Driver Beta of ₹<?php echo $fares['driverBata'] ?? 400; ?> covers driver's allowance per day.</p>
                </div>
                <div class="inc-item">
                    <i class="fa-solid fa-road"></i>
                    <h4>Distance (KM)</h4>
                    <p>You pay for what you travel, starting from the minimum km limit.</p>
                </div>
                <div class="inc-item excluded">
                    <i class="fa-solid fa-receipt"></i>
                    <h4>Toll & Parking</h4>
                    <p>Toll gate, parking fees, and inter-state permit charges as per actuals.</p>
                </div>
            </div>
        </div>
    </section>

    <!-- Inter-State Permit / Entry Charges -->
    <?php
    $permitDefaults = ['SEDAN' => 500, 'SUV' => 1000, 'INNOVA' => 1500, 'CRYSTA' => 1500, 'andhra_premium' => 2000];
    $permit = (isset($config['permitCharges']) && is_array($config['permitCharges']))
        ? array_merge($permitDefaults, $config['permitCharges'])
        : $permitDefaults;
    $permitVehicles = [
        'SEDAN'  => ['Sedan',  'fa-car-side',  '/assets/img/vehicles/Etios.png'],
        'SUV'    => ['SUV',    'fa-car-rear',  '/assets/img/vehicles/Suv.png'],
        'INNOVA' => ['Innova', 'fa-van-shuttle', '/assets/img/vehicles/Innova.png'],
        'CRYSTA' => ['Crysta', 'fa-star',      '/assets/img/vehicles/innova-crysta.png'],
    ];
    ?>
    <section class="permit-section">
        <div class="container">
            <h2 class="section-title">Inter-State <span>Permit Charges</span></h2>
            <p class="permit-desc">One-time state-entry tax applied per border crossed on inclusive trips. Charged transparently — no hidden mark-ups.</p>
            <div class="permit-grid">
                <?php foreach ($permitVehicles as $key => $v): ?>
                    <div class="permit-card">
                        <i class="fa-solid <?php echo $v[1]; ?> permit-card-icon"></i>
                        <h3 class="permit-card-title"><?php echo htmlspecialchars($v[0]); ?></h3>
                        <div class="permit-card-price">₹<?php echo number_format((int) $permit[$key]); ?></div>
                        <div class="permit-card-subtitle">per state border</div>
                    </div>
                <?php endforeach; ?>
            </div>
            <p class="permit-note">
                <i class="fa-solid fa-circle-info" style="color:var(--accent-gold);"></i>
                Innova &amp; Crysta crossing the Andhra Pradesh border: <strong>₹<?php echo number_format((int) $permit['andhra_premium']); ?></strong> per crossing. Tolls &amp; parking are separate, charged at actuals.
            </p>
        </div>
    </section>

    <!-- Calculation Model -->
    <section class="calc-section">
        <div class="container">
            <div class="calc-wrapper">
                <div class="calc-info">
                    <h2 class="calc-info-title">How We <span>Calculate?</span></h2>
                    <p class="calc-info-text">We follow a transparent calculation model based on the "Garage to Garage" basis or as per the specific trip route.</p>
                    <div class="formula-card">
                        <div class="formula">
                            <label class="formula-label">One-Way Formula</label>
                            <code class="formula-code">(Max Distance, <?php echo $fares['minDistanceOneWay'] ?? 130; ?>KM) × Rate + Driver Beta</code>
                        </div>
                        <div class="formula">
                            <label class="formula-label">Round-Trip Formula</label>
                            <code class="formula-code">(Distance × Rate) + (Driver Beta × Days)</code>
                        </div>
                    </div>
                </div>
                <div class="calc-cta">
                    <div class="cta-inner">
                        <h3 class="cta-title">Need an Exact Quote?</h3>
                        <p class="cta-text">Use our real-time calculator above or click below to start booking.</p>
                        <a href="<?php echo htmlspecialchars($bookNowUrl, ENT_QUOTES, 'UTF-8'); ?>" class="btn-primary-custom">Book Now</a>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- Cancellation Policy (admin-editable) -->
    <?php
    $cancellationPolicy = trim((string) ($config['company']['cancellationPolicy'] ?? ''));
    if ($cancellationPolicy !== ''):
        $policyLines = array_values(array_filter(array_map('trim', preg_split('/\r\n|\r|\n/', $cancellationPolicy))));
    ?>
    <section class="policy-section">
        <div class="container">
            <div class="policy-box">
                <h2 class="section-title"><i class="fa-solid fa-file-contract" style="color:var(--accent-gold);margin-right:8px;"></i>Cancellation <span>Policy</span></h2>
                <?php if (count($policyLines) > 1): ?>
                    <ul class="policy-list">
                        <?php foreach ($policyLines as $line): ?>
                            <li>
                                <i class="fa-solid fa-circle-check" style="color:var(--accent-gold);margin-top:4px;"></i>
                                <span><?php echo htmlspecialchars($line, ENT_QUOTES, 'UTF-8'); ?></span>
                            </li>
                        <?php endforeach; ?>
                    </ul>
                <?php else: ?>
                    <p class="policy-single"><?php echo htmlspecialchars($cancellationPolicy, ENT_QUOTES, 'UTF-8'); ?></p>
                <?php endif; ?>
            </div>
        </div>
    </section>
    <?php endif; ?>

    <!-- FAQ Section -->
    <section class="faq-section">
        <div class="container">
            <h2 class="section-title">Frequently <span>Asked Questions</span></h2>
            <div class="faq-grid">
                <div class="faq-card">
                    <h4>Is there any night charge?</h4>
                    <p>No, we don't charge extra for night journeys within standard trip durations. Only driver bata applies.</p>
                </div>
                <div class="faq-card">
                    <h4>How are tolls paid?</h4>
                    <p>Tolls are paid through FASTag or cash at the toll booth. The driver will pay via FASTag and present the toll receipts for payment, or you can pay directly in cash.</p>
                </div>
            </div>
        </div>
    </section>
</main>

<style>
:root {
    --primary-blue: #1a2b48;
    --accent-gold: #f7b733;
    --text-dark: #1f2937;
    --hero-text: #eaf1ff;
    --hero-muted: #c4d2ee;
    --text-muted: #666;
    --bg-light: #f8fafc;
    --white: #ffffff;
    --shadow: 0 10px 30px rgba(0,0,0,0.05);
}

/* AirportTaxi.International — swap this page's navy hero/button color for
   elite champagne-gold-on-black. Everything below already keys off
   var(--primary-blue) / var(--accent-gold), so this one override recolors
   the hero, "Book Now" buttons, and CTA buttons consistently. */
body.theme-airporttaxi { --primary-blue: #171612; --accent-gold: #a67c2e; }
body.theme-airporttaxi.theme-airporttaxi .tariff-hero { background: #171612 !important; }
body.theme-airporttaxi .tariff-hero .hero-title,
body.theme-airporttaxi .tariff-hero .hero-subtitle,
body.theme-airporttaxi .tariff-hero .breadcrumb,
body.theme-airporttaxi .tariff-hero .breadcrumb a { color: #f7f3ea !important; }
body.theme-airporttaxi .tariff-hero .hero-title span { color: #d9b46a !important; }
body.theme-airporttaxi .btn-book:hover,
body.theme-airporttaxi .btn-primary-custom:hover { background: #2a2620; }

.tariff-v2 { font-family: 'Inter', sans-serif; color: var(--text-dark); background: var(--bg-light); padding-top: 80px; }
.tariff-hero { background: var(--primary-blue); padding: 60px 0; color: var(--white); text-align: center; }
.breadcrumb { font-size: 0.9rem; margin-bottom: 20px; opacity: 0.8; }
.breadcrumb a { color: var(--hero-muted); text-decoration: none; }
.hero-title { font-size: clamp(2rem, 5vw, 2.8rem); font-weight: 800; margin-bottom: 15px; line-height: 1.2; }
.hero-title span { color: var(--accent-gold); }
.hero-subtitle { font-size: 1.1rem; color: var(--hero-muted); max-width: 600px; margin: 0 auto; line-height: 1.6; }

.section-title { text-align: center; font-size: 2.2rem; font-weight: 800; margin-bottom: 40px; color: var(--primary-blue); }
.section-title span { color: var(--accent-gold); }

/* Tabs */
.pricing-tabs-section { padding: 40px 0; margin-top: -50px; }
.tabs-container { display: flex; justify-content: center; gap: 10px; margin-bottom: 40px; }
.tab-btn { background: var(--white); border: none; padding: 15px 30px; border-radius: 50px; font-weight: 700; cursor: pointer; box-shadow: var(--shadow); transition: 0.3s; }
.tab-btn.active { background: var(--accent-gold); color: var(--primary-blue); }
.tab-content { display: none; }
.tab-content.active { display: block; animation: fadeIn 0.5s ease; }

/* Pricing Grid */
.pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 25px; }
.pricing-card { background: var(--white); padding: 35px 25px; border-radius: 24px; box-shadow: var(--shadow); text-align: center; transition: 0.3s; border: 1px solid #f1f5f9; }
.pricing-card:hover { transform: translateY(-10px); }
.promo-badge { display: inline-flex; align-items: center; gap: 4px; background: #fff7ed; border: 1px solid #ffedd5; border-radius: 99px; padding: 4px 10px; font-size: 0.72rem; font-weight: 700; color: #c2410c; margin: 0 auto 12px; width: max-content; }
.old-rate { text-decoration: line-through; color: #94a3b8; font-size: 1.4rem; margin-right: 6px; font-weight: 600; }
.price-box .amount { font-size: 3rem; font-weight: 800; color: var(--primary-blue); }
.card-features { list-style: none; padding: 20px 0; border-top: 1px solid #eee; border-bottom: 1px solid #eee; margin-bottom: 20px; text-align: left; }
.card-features li { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; font-size: 0.95rem; }
.card-features li i { color: var(--accent-gold); }
.btn-book { display: block; background: var(--primary-blue); color: var(--white); padding: 14px; border-radius: 12px; font-weight: 700; text-decoration: none; text-align: center; transition: all 0.2s ease; }
.btn-book:hover { background: #0b1d38; transform: translateY(-2px); }
.min-dist { font-size: 0.85rem; font-weight: 700; color: #c2410c; background: #fff7ed; border: 1px solid #ffedd5; padding: 6px 12px; border-radius: 8px; display: inline-block; margin-bottom: 15px; }

/* Calculator */
.fare-calc-section { padding: 80px 0; background: var(--white); }
.calc-box-luxury { background: var(--white); border-radius: 30px; padding: 3.5rem; box-shadow: 0 20px 60px rgba(0,0,0,0.08); border: 1px solid #f1f5f9; }
.calc-header-elite { text-align: center; margin-bottom: 3rem; }
.calc-controls-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2rem; margin-bottom: 3rem; }
.input-field-elite { display: flex; flex-direction: column; gap: 8px; }
.input-field-elite label { font-weight: 700; color: var(--primary-blue); font-size: 0.9rem; }
.input-field-elite input, .input-field-elite select { padding: 14px 20px; border-radius: 12px; border: 2px solid #f1f5f9; background: #f8fafc; font-size: 1rem; }
.calc-results-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; }
.calc-res-item { background: #f8fafc; border-radius: 20px; padding: 1.5rem; display: flex; align-items: center; gap: 20px; transition: 0.3s; }
.calc-res-item:hover { transform: translateY(-5px); box-shadow: 0 10px 25px rgba(0,0,0,0.05); border-color: var(--accent-gold); }
.calc-res-img { width: 80px; }
.calc-res-price { font-size: 1.4rem; font-weight: 800; color: var(--accent-gold); }

/* Inclusions Section */
.inclusions-section { padding: 80px 0; background: var(--white); }
.inclusions-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 30px; }
.inc-item { background: var(--bg-light); padding: 30px 25px; border-radius: 20px; text-align: center; border: 1px solid #f1f5f9; transition: all 0.3s ease; }
.inc-item:hover { transform: translateY(-5px); box-shadow: var(--shadow); border-color: rgba(247, 183, 51, 0.3); }
.inc-item i { font-size: 2.5rem; color: var(--accent-gold); margin-bottom: 20px; display: inline-block; }
.inc-item h4 { font-size: 1.2rem; font-weight: 800; color: var(--primary-blue); margin-bottom: 12px; }
.inc-item p { font-size: 0.95rem; color: var(--text-muted); line-height: 1.6; }
.inc-item.excluded { border-left: 4px solid #ef4444; }
.inc-item.excluded i { color: #ef4444; }

/* Permit Section */
.permit-desc { text-align:center;color:var(--text-muted);max-width:640px;margin:0 auto 36px;line-height:1.6; }
.permit-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }
.permit-card { background: #fff; border: 1px solid #f1f5f9; border-radius: 20px; padding: 24px; text-align: center; box-shadow: var(--shadow); transition: all 0.3s ease; }
.permit-card:hover { transform: translateY(-5px); border-color: rgba(247, 183, 51, 0.3); }
.permit-card-icon { font-size: 1.6rem; color: var(--accent-gold); margin-bottom: 10px; }
.permit-card-title { font-size: 1.05rem; font-weight: 800; color: var(--primary-blue); margin: 0 0 6px; }
.permit-card-price { font-size: 1.8rem; font-weight: 800; color: var(--text-dark); }
.permit-card-subtitle { font-size: 0.8rem; color: var(--text-muted); }
.permit-note { text-align:center;font-size:0.85rem;color:var(--text-muted);margin-top:24px; }

/* Calculation Model Section */
.calc-wrapper { background: var(--primary-blue); border-radius: 30px; overflow: hidden; display: grid; grid-template-columns: 1fr; color: white; }
@media (min-width: 992px) { .calc-wrapper { grid-template-columns: 1.5fr 1fr; } }
.calc-info { padding: 30px 20px; }
@media (min-width: 992px) { .calc-info { padding: 60px; } }
.calc-info-title { font-size: clamp(1.8rem, 4vw, 2.2rem); font-weight: 800; margin-bottom: 20px; }
.calc-info-title span { color: var(--accent-gold); }
.calc-info-text { opacity: 0.8; line-height: 1.6; font-size: 0.95rem; }
.formula-card { display: grid; grid-template-columns: 1fr; gap: 20px; margin-top: 30px; }
@media (min-width: 640px) { .formula-card { grid-template-columns: 1fr 1fr; } }
.formula-label { display: block; margin-bottom: 10px; color: var(--accent-gold); font-weight: 800; text-transform: uppercase; font-size: 0.8rem; }
.formula-code { display: block; background: rgba(255,255,255,0.1); padding: 15px; border-radius: 12px; font-size: 0.9rem; word-break: break-word; font-family: monospace; }
.calc-cta { background: var(--accent-gold); color: var(--primary-blue); display: flex; align-items: center; justify-content: center; text-align: center; padding: 40px 20px; }
@media (min-width: 992px) { .calc-cta { padding: 40px; } }
.cta-title { font-size: 1.5rem; font-weight: 800; margin-bottom: 10px; }
.cta-text { font-weight: 600; font-size: 0.95rem; }
.btn-primary-custom { display: inline-block; background: var(--primary-blue); color: white; padding: 15px 30px; border-radius: 12px; font-weight: 800; text-decoration: none; margin-top: 20px; transition: all 0.2s ease; }
.btn-primary-custom:hover { background: #0b1d38; transform: translateY(-2px); }

/* Cancellation Policy Box */
.policy-section { padding: 60px 0; }
.policy-box { max-width: 820px; margin: 0 auto; background: #fff; border: 1px solid #f1f5f9; border-radius: 20px; box-shadow: var(--shadow); padding: 20px; }
@media (min-width: 640px) { .policy-box { padding: 40px; } }
.policy-list { list-style:none;padding:0;margin:20px 0 0; }
.policy-list li { display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:0.95rem;color:var(--text-dark);line-height:1.6; }
.policy-list i { color:var(--accent-gold);margin-top:4px; }
.policy-single { text-align:center;color:var(--text-muted);line-height:1.7;margin:18px 0 0; }

/* FAQ Section */
.faq-section { padding: 80px 0; }
.faq-grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
@media (min-width: 768px) { .faq-grid { grid-template-columns: 1fr 1fr; gap: 30px; } }
.faq-card { background: white; padding: 25px; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.05); border: 1px solid #f1f5f9; }
.faq-card h4 { margin-bottom: 10px; color: var(--primary-blue); font-weight: 800; }
.faq-card p { font-size: 0.95rem; color: #666; line-height: 1.6; }

@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 768px) {
    .calc-controls-grid { grid-template-columns: 1fr; gap: 1rem; }
    .calc-box-luxury { padding: 2rem; }
}

/* ── Dark Mode Overrides ── */
html.dark-mode :root {
    --text-dark: #f8fafc;
    --text-muted: #cbd5e1;
    --bg-light: #060d1e;
    --white: #0f1c2e;
    --shadow: 0 10px 30px rgba(0,0,0,0.25);
}

html.dark-mode .tariff-v2 {
    background: var(--bg-light);
    color: var(--text-dark);
}

html.dark-mode .tariff-hero {
    background: linear-gradient(135deg, #020817 0%, #0a1628 35%, #0f172a 65%, #1a0f3c 100%);
}

html.dark-mode .pricing-card {
    border-color: rgba(255, 255, 255, 0.08);
}

html.dark-mode .pricing-card:hover {
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
    border-color: rgba(247, 183, 51, 0.4);
}

html.dark-mode .card-features {
    border-color: rgba(255, 255, 255, 0.08);
}

html.dark-mode .card-features li {
    color: #cbd5e1;
}

html.dark-mode .price-box .amount {
    color: #ffffff;
}

html.dark-mode .tab-btn {
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #ffffff;
}

html.dark-mode .tab-btn.active {
    background: var(--accent-gold);
    color: #020817;
    border-color: var(--accent-gold);
}

html.dark-mode .btn-book {
    background: linear-gradient(135deg, #0284c7 0%, #0ea5e9 100%);
}

html.dark-mode .btn-book:hover {
    background: linear-gradient(135deg, #38bdf8 0%, #0284c7 100%);
}

html.dark-mode .fare-calc-section {
    background: #060d1e;
}

html.dark-mode .calc-box-luxury {
    background: #0f1c2e;
    border-color: rgba(255, 255, 255, 0.08);
    box-shadow: 0 20px 60px rgba(0,0,0,0.25);
}

html.dark-mode .input-field-elite label {
    color: #ffffff;
}

html.dark-mode .input-field-elite input,
html.dark-mode .input-field-elite select {
    background: #060d1e;
    border-color: rgba(255, 255, 255, 0.08);
    color: #ffffff;
}

html.dark-mode .calc-res-item {
    background: #060d1e;
    border: 1px solid rgba(255, 255, 255, 0.06);
}

html.dark-mode .calc-res-item:hover {
    border-color: var(--accent-gold);
}

html.dark-mode .inclusions-section {
    background: #060d1e;
}

html.dark-mode .inc-item {
    background: #0f1c2e;
    border-color: rgba(255, 255, 255, 0.08);
}

html.dark-mode .inc-item h4 {
    color: #ffffff;
}

html.dark-mode .inc-item p {
    color: #cbd5e1;
}

html.dark-mode .permit-card {
    background: #0f1c2e;
    border-color: rgba(255, 255, 255, 0.08);
}

html.dark-mode .permit-card:hover {
    border-color: rgba(247, 183, 51, 0.4);
}

html.dark-mode .permit-card-price {
    color: #ffffff;
}

html.dark-mode .calc-wrapper {
    background: #0f1c2e;
    border: 1px solid rgba(255, 255, 255, 0.08);
}

html.dark-mode .formula-code {
    background: rgba(0, 0, 0, 0.25);
}

html.dark-mode .calc-cta {
    background: var(--accent-gold);
    color: #020817;
}

html.dark-mode .btn-primary-custom {
    background: #020817;
}

html.dark-mode .btn-primary-custom:hover {
    background: #0f1c2e;
}

html.dark-mode .policy-box {
    background: #0f1c2e;
    border-color: rgba(255, 255, 255, 0.08);
}

html.dark-mode .policy-list li {
    border-bottom-color: rgba(255, 255, 255, 0.06) !important;
    color: #cbd5e1 !important;
}

html.dark-mode .faq-card {
    background: #0f1c2e;
    border-color: rgba(255, 255, 255, 0.08);
}

html.dark-mode .faq-card h4 {
    color: #ffffff !important;
}

html.dark-mode .faq-card p {
    color: #cbd5e1 !important;
}
</style>

<script>
document.addEventListener('DOMContentLoaded', function() {
    const distInp = document.getElementById('calc-distance');
    const catSel = document.getElementById('calc-category');
    const results = document.getElementById('calc-results');
    
    // Core data from PHP (vehicle list only - the actual fare math is
    // delegated to window.DropCarsFare, the same shared calculator the
    // booking form uses, so this page can never diverge from it again).
    const fares = <?php echo json_encode($fares); ?>;
    const vImages = {
        'SEDAN': '/assets/img/vehicles/Etios.png',
        'SUV': '/assets/img/vehicles/Suv.png',
        'INNOVA': '/assets/img/vehicles/Innova.png',
        'CRYSTA': '/assets/img/vehicles/innova-crysta.png'
    };

    function updateCalc() {
        const d = parseFloat(distInp.value) || 0;
        const mode = catSel.value;

        results.innerHTML = '';
        const vehicleTypes = Object.keys(fares.baseFareOneWay || {});

        vehicleTypes.forEach((type) => {
            const total = (mode === 'oneway')
                ? window.DropCarsFare.calculateFareOneWay(d, type)
                : window.DropCarsFare.calculateFareRoundTrip(d, type, 1);
            const img = vImages[type] || vImages['SEDAN'];

            const card = document.createElement('div');
            card.className = 'calc-res-item';
            card.innerHTML = `
                <img src="${img}" class="calc-res-img" alt="${type}">
                <div class="calc-res-info">
                    <div style="font-size:0.75rem; color:#999; font-weight:700; text-transform:uppercase;">${type}</div>
                    <h4 style="margin:0; font-size:1.1rem; font-weight:800; color:var(--primary-blue);">Estimated Fare</h4>
                    <div class="calc-res-price">₹${Math.round(total).toLocaleString()} <span>(Total)</span></div>
                </div>
            `;
            results.appendChild(card);
        });
    }

    distInp.addEventListener('input', updateCalc);
    catSel.addEventListener('change', updateCalc);
    updateCalc();

    // Tab Logic
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.target).classList.add('active');
        });
    });
});
</script>
<?php echo $shell->renderFooter(); ?>
<?php echo $shell->renderScripts(); ?>
</body>
</html>
