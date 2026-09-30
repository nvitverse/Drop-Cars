<?php
date_default_timezone_set('Asia/Kolkata');
/**
 * Global helper functions for Admin Panel
 */

/** Absolute path for redirects and emails, e.g. /admin/bookings?status=pending (respects subdirectory install via dropcars_base_path). */
function admin_url($page, array $params = []) {
    $page = preg_replace('/[^a-z0-9-]/i', '', (string) $page);
    if ($page === '') {
        $page = 'dashboard';
    }
    $base = function_exists('dropcars_base_path') ? rtrim((string) dropcars_base_path(), '/') : '';
    $path = $base . '/admin/' . $page;
    if ($params !== []) {
        $path .= '?' . http_build_query($params);
    }
    return $path;
}

function admin_abs_url($page, array $params = []) {
    $path = admin_url($page, $params);
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $scheme = $https ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return $scheme . '://' . $host . $path;
}

function formatCurrency($amount) {
    return '₹' . number_format($amount, 2);
}

function formatDate($date) {
    if (!$date) return 'N/A';
    return date('d M Y, h:i A', strtotime($date));
}

/**
 * Convert enquiry booking id (DE-) to confirmed id (DC-) - same body as frontend deriveConfirmationBookingId.
 */
function dropcars_enquiry_confirmed_booking_id($bookingId, PDO $pdo = null) {
    $s = preg_replace('/[^A-Za-z0-9]/', '', (string) $bookingId);
    $candidate = '';

    if ($s === '') {
        if ($pdo) {
            require_once __DIR__ . '/enquiries-schema.php';
            return dropcars_next_enquiry_booking_id($pdo, 'C');
        }
        $candidate = 'C' . date('ymd') . str_pad((string) random_int(1, 99), 2, '0', STR_PAD_LEFT);
    } elseif (preg_match('/^(?:DE|E)(.+)$/i', $s, $m)) {
        $candidate = 'C' . $m[1];
    } elseif (preg_match('/^(?:DC|C)(.+)$/i', $s, $m)) {
        $candidate = 'C' . $m[1];
    } else {
        $candidate = 'C' . $s;
    }

    return $candidate;
}

function getBookingStatusBadge($status, $respondedBy = '') {
    $status = strtolower(trim((string)$status));
    $map = [
        'enquiry'   => ['class' => 'bg-warning', 'icon' => 'fa-inbox'],
        'pending'   => ['class' => 'bg-warning', 'icon' => 'fa-clock'],
        'confirmed' => ['class' => 'bg-primary', 'icon' => 'fa-circle-check'],
        'fake'      => ['class' => 'bg-danger',  'icon' => 'fa-user-slash'],
        'completed' => ['class' => 'bg-success', 'icon' => 'fa-check-double'],
        'cancelled' => ['class' => 'bg-danger',  'icon' => 'fa-xmark']
    ];
    $data = $map[$status] ?? ['class' => 'bg-secondary', 'icon' => 'fa-question-circle'];
    $displayText = ucfirst($status);
    if ($status === 'pending') {
        $respondedBy = trim((string)$respondedBy);
        if ($respondedBy !== '') {
            // Admin marked as waiting — keep warning/orange styling
            $displayText = 'Waiting';
            $data = ['class' => 'bg-warning', 'icon' => 'fa-hourglass-half'];
        } else {
            // Customer confirmed from booking form — show as confirmed/blue
            $displayText = 'Pending Confirmation';
            $data = ['class' => 'bg-primary', 'icon' => 'fa-circle-check'];
        }
    } elseif ($status === 'enquiry') {
        $displayText = 'New Lead';
    }
    return '<span class="badge ' . $data['class'] . '"><i class="fa-solid ' . $data['icon'] . '" style="font-size: 0.65rem; opacity: 0.8;"></i> ' . $displayText . '</span>';
}

/**
 * Classify a customer (by phone) into a lead tier:
 *   'regular'  - has 1 or more confirmed/completed bookings (a returning paying customer)
 *   'repeated' - no confirmed bookings yet, but 2+ enquiries on record (keeps coming back)
 *   'new'      - a single fresh enquiry, nothing else
 * Results are cached per-request so a 30-row table costs at most one query per phone.
 */
function dropcars_get_lead_tier(PDO $pdo, $phone) {
    static $cache = [];
    $phone = trim((string) $phone);
    if ($phone === '') return 'new';
    if (isset($cache[$phone])) return $cache[$phone];

    $tier = 'new';
    try {
        $stmt = $pdo->prepare(
            "SELECT
                (SELECT COUNT(*) FROM `bookings` b JOIN `customers` c ON b.customer_id = c.id
                    WHERE c.phone = ? AND b.status IN ('confirmed', 'completed')) AS confirmed_count,
                (SELECT COUNT(*) FROM `enquiries` WHERE phone = ?) AS enquiry_count"
        );
        $stmt->execute([$phone, $phone]);
        $r = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
        $confirmed = (int) ($r['confirmed_count'] ?? 0);
        $enquiries = (int) ($r['enquiry_count'] ?? 0);
        if ($confirmed >= 1) {
            $tier = 'regular';
        } elseif ($enquiries >= 2) {
            $tier = 'repeated';
        }
    } catch (Throwable $e) {
        $tier = 'new';
    }

    $cache[$phone] = $tier;
    return $tier;
}

/**
 * Render the lead-tier pill (New Lead / Repeated / Regular Customer) for a phone.
 * Reuses the existing .badge colour classes so no extra CSS is required.
 */
function dropcars_get_lead_tier_badge(PDO $pdo, $phone) {
    $tier = dropcars_get_lead_tier($pdo, $phone);
    $styles = [
        'new'      => ['bg' => '#fffbeb', 'color' => '#d97706', 'border' => '#fde68a', 'icon' => 'fa-inbox',             'text' => 'New'],
        'repeated' => ['bg' => '#eff6ff', 'color' => '#2563eb', 'border' => '#bfdbfe', 'icon' => 'fa-clock-rotate-left', 'text' => 'Repeated'],
        'regular'  => ['bg' => '#f0fdf4', 'color' => '#16a34a', 'border' => '#bbf7d0', 'icon' => 'fa-star',              'text' => 'Regular'],
    ];
    $s = $styles[$tier] ?? $styles['new'];
    return '<span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 5px; background-color: ' . $s['bg'] . '; color: ' . $s['color'] . '; border: 1px solid ' . $s['border'] . '; font-size: 0.7rem; font-weight: 850; line-height: 1; vertical-align: middle; white-space: nowrap; flex-shrink: 0;" title="' . htmlspecialchars($s['text'] . ' Customer', ENT_QUOTES, 'UTF-8') . '"><i class="fa-solid ' . $s['icon'] . '" style="font-size: 0.65rem; opacity: 0.95;"></i> ' . $s['text'] . '</span>';
}

/**
 * Whether driver + cab fields are all filled (required before marking a booking completed).
 *
 * @param array<string, mixed> $row
 */
function dropcars_booking_assignment_complete(array $row): bool {
    $name = trim((string) ($row['driver_name'] ?? ''));
    $phone = trim((string) ($row['driver_phone'] ?? ''));
    $car = trim((string) ($row['car_name'] ?? ''));
    $plate = trim((string) ($row['car_number'] ?? ''));
    return $name !== '' && $phone !== '' && $car !== '' && $plate !== '';
}

function sendNotification($message) {
    // Integrate Telegram notification logic if needed
    // define('TELEGRAM_BOT_TOKEN', '...');
    // define('TELEGRAM_CHAT_ID', '...');
}

/**
 * Read tariffs from local JSON cache (data/tariffs.json)
 */
function get_json_tariffs() {
    $filePath = dirname(__DIR__, 2) . '/data/tariffs.json';
    if (!is_file($filePath)) {
        // Seed default tariffs
        $defaults = [
            [
                'id' => 1,
                'vehicle_type' => 'SEDAN',
                'per_km_rate' => 14.0,
                'driver_beta' => 400.0,
                'trip_type' => 'oneway',
                'passengers' => 4,
                'luggage' => 3,
                'is_ac' => 1,
                'vehicle_model' => 'Swift Dzire / Etios',
                'display_order' => 10,
                'old_per_km_rate' => 0.0,
                'old_driver_beta' => 0.0,
                'effective_from' => null,
                'effective_until' => null,
                'is_dynamic' => 0,
                'reasoning_note' => '',
                'strike_on' => 0
            ],
            [
                'id' => 2,
                'vehicle_type' => 'SUV',
                'per_km_rate' => 19.0,
                'driver_beta' => 400.0,
                'trip_type' => 'oneway',
                'passengers' => 6,
                'luggage' => 5,
                'is_ac' => 1,
                'vehicle_model' => 'Maruti Ertiga / Kia Carens',
                'display_order' => 20,
                'old_per_km_rate' => 0.0,
                'old_driver_beta' => 0.0,
                'effective_from' => null,
                'effective_until' => null,
                'is_dynamic' => 0,
                'reasoning_note' => '',
                'strike_on' => 0
            ],
            [
                'id' => 3,
                'vehicle_type' => 'INNOVA',
                'per_km_rate' => 20.0,
                'driver_beta' => 500.0,
                'trip_type' => 'oneway',
                'passengers' => 7,
                'luggage' => 6,
                'is_ac' => 1,
                'vehicle_model' => 'Toyota Innova',
                'display_order' => 30,
                'old_per_km_rate' => 0.0,
                'old_driver_beta' => 0.0,
                'effective_from' => null,
                'effective_until' => null,
                'is_dynamic' => 0,
                'reasoning_note' => '',
                'strike_on' => 0
            ],
            [
                'id' => 4,
                'vehicle_type' => 'CRYSTA',
                'per_km_rate' => 23.0,
                'driver_beta' => 500.0,
                'trip_type' => 'oneway',
                'passengers' => 7,
                'luggage' => 6,
                'is_ac' => 1,
                'vehicle_model' => 'Toyota Innova Crysta',
                'display_order' => 40,
                'old_per_km_rate' => 0.0,
                'old_driver_beta' => 0.0,
                'effective_from' => null,
                'effective_until' => null,
                'is_dynamic' => 0,
                'reasoning_note' => '',
                'strike_on' => 0
            ],
            [
                'id' => 5,
                'vehicle_type' => 'SEDAN',
                'per_km_rate' => 13.0,
                'driver_beta' => 400.0,
                'trip_type' => 'round',
                'passengers' => 4,
                'luggage' => 3,
                'is_ac' => 1,
                'vehicle_model' => 'Swift Dzire / Etios',
                'display_order' => 50,
                'old_per_km_rate' => 0.0,
                'old_driver_beta' => 0.0,
                'effective_from' => null,
                'effective_until' => null,
                'is_dynamic' => 0,
                'reasoning_note' => '',
                'strike_on' => 0
            ],
            [
                'id' => 6,
                'vehicle_type' => 'SUV',
                'per_km_rate' => 18.0,
                'driver_beta' => 400.0,
                'trip_type' => 'round',
                'passengers' => 6,
                'luggage' => 5,
                'is_ac' => 1,
                'vehicle_model' => 'Maruti Ertiga / Kia Carens',
                'display_order' => 60,
                'old_per_km_rate' => 0.0,
                'old_driver_beta' => 0.0,
                'effective_from' => null,
                'effective_until' => null,
                'is_dynamic' => 0,
                'reasoning_note' => '',
                'strike_on' => 0
            ],
            [
                'id' => 7,
                'vehicle_type' => 'INNOVA',
                'per_km_rate' => 19.0,
                'driver_beta' => 500.0,
                'trip_type' => 'round',
                'passengers' => 7,
                'luggage' => 6,
                'is_ac' => 1,
                'vehicle_model' => 'Toyota Innova',
                'display_order' => 70,
                'old_per_km_rate' => 0.0,
                'old_driver_beta' => 0.0,
                'effective_from' => null,
                'effective_until' => null,
                'is_dynamic' => 0,
                'reasoning_note' => '',
                'strike_on' => 0
            ],
            [
                'id' => 8,
                'vehicle_type' => 'CRYSTA',
                'per_km_rate' => 22.0,
                'driver_beta' => 600.0,
                'trip_type' => 'round',
                'passengers' => 7,
                'luggage' => 6,
                'is_ac' => 1,
                'vehicle_model' => 'Toyota Innova Crysta',
                'display_order' => 80,
                'old_per_km_rate' => 0.0,
                'old_driver_beta' => 0.0,
                'effective_from' => null,
                'effective_until' => null,
                'is_dynamic' => 0,
                'reasoning_note' => '',
                'strike_on' => 0
            ]
        ];
        // Create directories if missing
        $dir = dirname($filePath);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        file_put_contents($filePath, json_encode($defaults, JSON_PRETTY_PRINT));
        return $defaults;
    }
    return json_decode(file_get_contents($filePath), true) ?: [];
}

/**
 * Save tariffs to local JSON cache (data/tariffs.json)
 */
function save_json_tariffs($tariffs) {
    $filePath = dirname(__DIR__, 2) . '/data/tariffs.json';
    $dir = dirname($filePath);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    return file_put_contents($filePath, json_encode(array_values($tariffs), JSON_PRETTY_PRINT));
}

/**
 * Sync Local JSON Tariffs to data/config.json for immediate frontend visibility
 */
function sync_tariffs_to_config($pdo = null) {
    $configPath = dirname(__DIR__, 2) . '/data/config.json';
    $settingsPath = dirname(__DIR__, 2) . '/admin/config/settings.json';
    if (!is_file($configPath)) return false;

    $config = json_decode(file_get_contents($configPath), true);
    if (!$config) return false;

    $settings = is_file($settingsPath) ? json_decode(file_get_contents($settingsPath), true) : [];
    $config['enable_dynamic_pricing'] = !empty($settings['enable_dynamic_pricing']);

    $allTariffs = get_json_tariffs();
    // Inject driver_allowance matching key dynamically for backward compatibility
    foreach ($allTariffs as &$t) {
        $t['driver_allowance'] = $t['driver_beta'] ?? 0;
    }
    unset($t);

    if (empty($allTariffs)) return false;

    // Separate normal and dynamic
    $normalMap = [];
    $dynamicList = [];
    foreach ($allTariffs as $t) {
        $key = strtoupper($t['vehicle_type']) . '::' . strtolower($t['trip_type']);
        if (empty($t['is_dynamic'])) {
            $normalMap[$key] = $t;
        } else {
            $dynamicList[] = $t;
        }
    }

    $nowTs = time();

    // Let's resolve the final price for each vehicle class & trip combination that exists in standard config
    $combinations = [
        ['SEDAN', 'oneway'], ['SEDAN', 'round'],
        ['SUV', 'oneway'], ['SUV', 'round'],
        ['INNOVA', 'oneway'], ['INNOVA', 'round'],
        ['CRYSTA', 'oneway'], ['CRYSTA', 'round'],
        ['COMFORT_SEDAN', 'oneway'], ['COMFORT_SEDAN', 'round'],
        ['ELITE_SEDAN', 'oneway'], ['ELITE_SEDAN', 'round']
    ];

    // Initialize/Reset Fare Objects (preserving structure)
    if (!isset($config['fares'])) $config['fares'] = [];
    $config['fares']['baseFareOneWay'] = [];
    $config['fares']['baseFareRoundTrip'] = [];
    $config['fares']['bataOneWay'] = [];
    $config['fares']['bataRoundTrip'] = [];
    $config['fares']['oldFareOneWay'] = [];
    $config['fares']['oldFareRoundTrip'] = [];
    $config['fares']['oldBataOneWay'] = [];
    $config['fares']['oldBataRoundTrip'] = [];
    $config['fares']['reasoningNotes'] = []; // New reasoning notes dictionary!

    $config['vehicles'] = [];
    $config['tariffSchedules'] = [];

    foreach ($combinations as $combo) {
        $vType = $combo[0];
        $tType = $combo[1];
        $key = $vType . '::' . $tType;

        $normalTariff = $normalMap[$key] ?? null;

        // Find active dynamic tariff if any
        $activeDynamic = null;
        foreach ($dynamicList as $dt) {
            if (strtoupper($dt['vehicle_type']) === $vType && strtolower($dt['trip_type']) === $tType) {
                $effFrom  = !empty($dt['effective_from'])  ? strtotime($dt['effective_from'])  : null;
                $effUntil = !empty($dt['effective_until']) ? strtotime($dt['effective_until']) : null;
                $isLive   = ($effFrom === null || $effFrom <= $nowTs)
                         && ($effUntil === null || $effUntil >= $nowTs);
                if ($isLive) {
                    $activeDynamic = $dt;
                }
            }
        }

        // Determine final values
        $rate = 0.0;
        $bata = 0.0;
        $oldRate = 0.0;
        $oldBata = 0.0;
        $reason = '';
        $passengers = 4;
        $luggage = 3;
        $isAc = 1;
        $model = '';

        if ($activeDynamic) {
            $rate = (float)$activeDynamic['per_km_rate'];
            $bata = (float)$activeDynamic['driver_allowance'];
            $reason = trim((string)($activeDynamic['reasoning_note'] ?? ''));
            
            $passengers = (int)($activeDynamic['passengers'] ?? 4);
            $luggage = (int)($activeDynamic['luggage'] ?? 3);
            $isAc = isset($activeDynamic['is_ac']) ? (int)$activeDynamic['is_ac'] : 1;
            $model = trim((string)($activeDynamic['vehicle_model'] ?? ''));

            if (!empty($activeDynamic['strike_on']) && $normalTariff) {
                $oldRate = (float)$normalTariff['per_km_rate'];
                $oldBata = (float)$normalTariff['driver_allowance'];
            } else {
                $oldRate = (float)($activeDynamic['old_per_km_rate'] ?? 0);
                $oldBata = (float)($activeDynamic['old_driver_beta'] ?? 0);
            }
        } elseif ($normalTariff) {
            $rate = (float)$normalTariff['per_km_rate'];
            $bata = (float)$normalTariff['driver_allowance'];
            $oldRate = (float)($normalTariff['old_per_km_rate'] ?? 0);
            $oldBata = (float)($normalTariff['old_driver_beta'] ?? 0);
            $reason = trim((string)($normalTariff['reasoning_note'] ?? ''));
            
            $passengers = (int)($normalTariff['passengers'] ?? 4);
            $luggage = (int)($normalTariff['luggage'] ?? 3);
            $isAc = isset($normalTariff['is_ac']) ? (int)$normalTariff['is_ac'] : 1;
            $model = trim((string)($normalTariff['vehicle_model'] ?? ''));
        } else {
            // No tariff defined for this combination
            continue;
        }

        // We will output this combination in the public JSON
        if ($tType === 'oneway') {
            $config['fares']['baseFareOneWay'][$vType] = $rate;
            $config['fares']['bataOneWay'][$vType] = $bata;
            $config['fares']['oldFareOneWay'][$vType] = $oldRate;
            $config['fares']['oldBataOneWay'][$vType] = $oldBata;

            $config['vehicles'][] = [
                'value' => $vType,
                'label' => $vType . ($model ? " (" . $model . ")" : ""),
                'rate' => $rate,
                'capacity' => $passengers . "+1",
                'luggage' => $luggage,
                'is_ac' => (bool)$isAc,
                'model' => $model,
                'old_rate' => $oldRate,
                'reasoning_note' => $reason
            ];
        } elseif ($tType === 'round') {
            $config['fares']['baseFareRoundTrip'][$vType] = $rate;
            $config['fares']['bataRoundTrip'][$vType] = $bata;
            $config['fares']['oldFareRoundTrip'][$vType] = $oldRate;
            $config['fares']['oldBataRoundTrip'][$vType] = $oldBata;
        }

        if ($reason !== '') {
            $config['fares']['reasoningNotes'][$vType] = $reason;
        }
    }

    // Expose all schedules for debugging
    foreach ($allTariffs as $t) {
        $effFrom  = !empty($t['effective_from'])  ? strtotime($t['effective_from'])  : null;
        $effUntil = !empty($t['effective_until']) ? strtotime($t['effective_until']) : null;
        $isLive   = ($effFrom === null || $effFrom <= $nowTs)
                 && ($effUntil === null || $effUntil >= $nowTs);

        $config['tariffSchedules'][] = [
            'id'             => $t['id'],
            'vehicle'        => strtoupper($t['vehicle_type']),
            'tripType'       => $t['trip_type'],
            'rate'           => (float)$t['per_km_rate'],
            'oldRate'        => (float)$t['old_per_km_rate'],
            'bata'           => (float)$t['driver_allowance'],
            'oldBata'        => (float)$t['old_driver_beta'],
            'isDynamic'      => !empty($t['is_dynamic']),
            'strikeOn'       => !empty($t['strike_on']),
            'reasoningNote'  => trim((string)($t['reasoning_note'] ?? '')),
            'effectiveFrom'  => $effFrom  !== null ? date('c', $effFrom)  : null,
            'effectiveUntil' => $effUntil !== null ? date('c', $effUntil) : null,
            'isLive'         => $isLive,
        ];
    }

    // Write back to config.json
    return file_put_contents($configPath, json_encode($config, JSON_PRETTY_PRINT)) !== false;
}

/**
 * Sync admin settings (api/config.php) → data/config.json so the frontend
 * JavaScript (window.DROP_CARS_CONFIG) always reflects the latest admin values.
 * Also patches GOOGLE_MAPS_API_KEY in all env.php files across the project.
 * Call this after every save in admin/pages/settings.php.
 */
function sync_settings_to_public_config() {
    $active = function_exists('dropcars_get_active_website') ? dropcars_get_active_website() : 'all';
    if ($active !== 'all' && $active !== 'dropcars') {
        return true;
    }
    $apiConfigPath  = dirname(__DIR__, 2) . '/api/config.php';
    $publicJsonPath = dirname(__DIR__, 2) . '/data/config.json';

    if (!is_file($apiConfigPath) || !is_file($publicJsonPath)) return false;

    $apiCfg    = include $apiConfigPath;
    $publicCfg = json_decode(file_get_contents($publicJsonPath), true);

    if (!is_array($apiCfg) || !is_array($publicCfg)) return false;

    // --- Company block ---
    if (!isset($publicCfg['company'])) $publicCfg['company'] = [];
    $publicCfg['company']['name']     = $apiCfg['companyName']  ?? $publicCfg['company']['name']     ?? 'Drop Cars';
    $publicCfg['company']['email']    = $apiCfg['supportEmail'] ?? $publicCfg['company']['email']    ?? '';
    $publicCfg['company']['website']  = $apiCfg['websiteUrl']   ?? $publicCfg['company']['website']  ?? '';
    $publicCfg['company']['functional_phone'] = $apiCfg['functionalPhone'] ?? $apiCfg['supportPhone'] ?? '7200217986';
    $publicCfg['company']['functional_whatsapp'] = $apiCfg['functionalWhatsApp'] ?? $apiCfg['whatsappNumber'] ?? '917200217986';
    $publicCfg['company']['facebook']  = $apiCfg['facebookUrl']  ?? '';
    $publicCfg['company']['instagram'] = $apiCfg['instagramUrl'] ?? '';
    $publicCfg['company']['twitter']   = $apiCfg['twitterUrl']   ?? '';
    $publicCfg['company']['youtube']   = $apiCfg['youtubeUrl']   ?? '';

    // Normalise phone - store digits-only with country code for WhatsApp links
    $rawPhone = $apiCfg['supportPhone'] ?? '';
    $digitsOnly = preg_replace('/\D/', '', $rawPhone);
    if ($digitsOnly !== '') {
        // Ensure the 91 country prefix for WhatsApp
        $wa = (strlen($digitsOnly) === 10) ? '91' . $digitsOnly : $digitsOnly;
        $publicCfg['company']['phone']    = $digitsOnly;
        $publicCfg['company']['whatsapp'] = $wa;
    }

    // Dedicated WhatsApp number overrides the support phone for WhatsApp links.
    $waNum = preg_replace('/\D/', '', (string) ($apiCfg['whatsappNumber'] ?? ''));
    if ($waNum !== '') {
        $publicCfg['company']['whatsapp'] = (strlen($waNum) === 10) ? '91' . $waNum : $waNum;
    }

    // Editable WhatsApp message templates (consumed by booking confirmation links).
    $publicCfg['company']['whatsappTemplates'] = [
        'confirmation' => (string) ($apiCfg['whatsappTemplateConfirmation'] ?? ''),
        'enquiry'      => (string) ($apiCfg['whatsappTemplateEnquiry'] ?? ''),
    ];

    // Logo + cancellation policy for the public site.
    if (isset($apiCfg['logoPath']) && $apiCfg['logoPath'] !== '') {
        $publicCfg['company']['logo'] = (string) $apiCfg['logoPath'];
    }
    $publicCfg['company']['cancellationPolicy'] = (string) ($apiCfg['cancellationPolicy'] ?? '');

    // --- UX / feature flags ---
    foreach (['enableWhatsAppWidget', 'enableFloatingEstimates', 'enableSuccessConfetti', 'enablePriceHighlighting'] as $flag) {
        if (array_key_exists($flag, $apiCfg)) {
            $publicCfg[$flag] = (bool) $apiCfg[$flag];
        }
    }

    // --- Pricing rules (used by JS fare calculator & breakdown display) ---
    $pricingFields = [
        'nightSurchargeEnabled', 'nightSurchargePercent', 'nightSurchargeStartHour',
        'nightSurchargeEndHour', 'tollEstimatePerKm', 'holidaySurchargeEnabled',
        'holidaySurchargePercent', 'minFareOneWay',
        'interstateSurcharge', 'stateSurcharge_KA', 'stateSurcharge_KL', 'stateSurcharge_AP',
        'luggageSurchargeEnabled', 'luggageSurchargeAmount',
        'petSurchargeEnabled', 'petSurchargeAmount',
        'peakHourSurchargeEnabled', 'peakHourSurchargePercent', 'peakHourStartHour', 'peakHourEndHour',
        'gstPercent', 'gstNumber',
    ];
    foreach ($pricingFields as $f) {
        if (array_key_exists($f, $apiCfg)) {
            $publicCfg['pricingRules'][$f] = $apiCfg[$f];
        }
    }

    // --- Booking defaults (pre-fills form on frontend) ---
    $defaultFields = ['defaultPickupCity', 'defaultVehicleType', 'defaultServiceType', 'bookingIdPrefix'];
    foreach ($defaultFields as $f) {
        if (array_key_exists($f, $apiCfg)) {
            $publicCfg['bookingDefaults'][$f] = $apiCfg[$f];
        }
    }

    // --- Business info (schema markup, footer, FAQ) ---
    $bizFields = [
        'businessAddress', 'businessCity', 'businessState', 'businessPincode',
        'businessHoursOpen', 'businessHoursClose', 'businessDays', 'is24x7', 'emergencyPhone',
    ];
    foreach ($bizFields as $f) {
        if (array_key_exists($f, $apiCfg)) {
            $publicCfg['business'][$f] = $apiCfg[$f];
        }
    }

    // --- Top Announcement Banner (rendered site-wide above the header) ---
    foreach (['announcementEnabled', 'announcementText', 'announcementLink', 'announcementLinkText', 'announcementVariant', 'announcementDismissable'] as $f) {
        if (array_key_exists($f, $apiCfg)) {
            $publicCfg['announcement'][$f] = $apiCfg[$f];
        }
    }

    // --- Hero content overrides (read by index.php hero section) ---
    foreach (['heroBadgeText', 'heroTitleOverride', 'heroSubOverride'] as $f) {
        if (array_key_exists($f, $apiCfg)) {
            $publicCfg['hero'][$f] = $apiCfg[$f];
        }
    }
    foreach (['heroStat1', 'heroStat2', 'heroStat3', 'heroStat4'] as $stat) {
        if (array_key_exists($stat . 'Value', $apiCfg)) {
            $publicCfg['hero'][$stat] = [
                'value' => $apiCfg[$stat . 'Value'] ?? '',
                'label' => $apiCfg[$stat . 'Label'] ?? '',
            ];
        }
    }

    // --- Section visibility toggles (each one show* boolean) ---
    foreach (['showHeroStats', 'showMarquee', 'showTrustFeatures', 'showTestimonials', 'showFAQ', 'showPartnersCTA', 'showAboutUs', 'showFleetShowcase'] as $f) {
        if (array_key_exists($f, $apiCfg)) {
            $publicCfg['sections'][$f] = (bool) $apiCfg[$f];
        }
    }

    // --- Festival / Promo banner (sitewide discount campaign) ---
    foreach (['festivalEnabled', 'festivalName', 'festivalMessage', 'festivalDiscountPct', 'festivalStartsAt', 'festivalEndsAt', 'festivalPromoCode'] as $f) {
        if (array_key_exists($f, $apiCfg)) {
            $publicCfg['festival'][$f] = $apiCfg[$f];
        }
    }

    // --- Live chat widget (third-party customer-support snippet) ---
    foreach (['liveChatProvider', 'liveChatId'] as $f) {
        if (array_key_exists($f, $apiCfg)) {
            $publicCfg['liveChat'][$f] = $apiCfg[$f];
        }
    }

    // --- SEO overrides (meta description, OG image, Twitter handle, verification codes) ---
    foreach (['seoMetaDescription', 'seoOgImage', 'seoTwitterHandle', 'seoKeywords', 'searchConsoleId', 'bingWebmasterId'] as $f) {
        if (array_key_exists($f, $apiCfg)) {
            $publicCfg['seo'][$f] = $apiCfg[$f];
        }
    }

    // --- Advance Payment / UPI settings (used by thank-you page & customer dashboard) ---
    $publicCfg['advancePayment'] = [
        'enabled'    => !empty($apiCfg['advanceEnabled']),
        'upiId'      => (string)($apiCfg['upiId']            ?? '7200217986-1@okbizaxis'),
        'qrPath'     => (string)($apiCfg['upiQrPath']        ?? 'assets/img/qr-code.jpg'),
        'percent'    => (int)($apiCfg['advancePercent']       ?? 20),
        'minAmount'  => (int)($apiCfg['advanceMinAmount']     ?? 300),
        'note'       => (string)($apiCfg['advanceNote']       ?? ''),
    ];

    $result = file_put_contents($publicJsonPath, json_encode($publicCfg, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) !== false;

    // ── Google Maps API Key ────────────────────────────────────────────────────
    // When a key is saved via Settings → Integrations → API Keys, replace the
    // hardcoded default in EVERY env.php across the project automatically.
    // This means the same key is active in local, public_html and deploy copies.
    $newMapsKey = trim((string) ($apiCfg['googleMapsApiKey'] ?? ''));
    if ($newMapsKey !== '') {
        $root = dirname(__DIR__, 2);
        $envFiles = [
            $root . '/config/env.php',                       // main workspace
            $root . '/public_html/config/env.php',           // public_html mirror
            $root . '/deploy/public_html/config/env.php',    // deploy folder
        ];
        // Matches:  define('GOOGLE_MAPS_API_KEY', getenv(...) ?: 'ANY_OLD_KEY')
        // and replaces only the fallback string value after ?:
        $pattern     = "/(define\s*\(\s*['\"]GOOGLE_MAPS_API_KEY['\"]\s*,\s*(?:\(string\)\s*)?\(\s*getenv\s*\(\s*['\"]GOOGLE_MAPS_API_KEY['\"]\s*\)\s*\?:\s*['\"])[^'\"]*(['\"]\s*\))/";
        $replacement = '${1}' . addcslashes($newMapsKey, "'\\") . '${2}';
        foreach ($envFiles as $envFile) {
            if (!is_file($envFile)) continue;
            $content = file_get_contents($envFile);
            $patched = preg_replace($pattern, $replacement, $content);
            if ($patched !== null && $patched !== $content) {
                file_put_contents($envFile, $patched);
            }
        }
    }

    // ── Telegram Bot Token ──────────────────────────────────────────────────────
    $newTgToken = trim((string) ($apiCfg['telegramBotToken'] ?? ''));
    if ($newTgToken !== '') {
        $root = dirname(__DIR__, 2);
        $envFiles = [
            $root . '/config/env.php',
            $root . '/public_html/config/env.php',
            $root . '/deploy/public_html/config/env.php',
        ];
        $pattern     = "/(define\s*\(\s*['\"]TELEGRAM_BOT_TOKEN['\"]\s*,\s*(?:\(string\)\s*)?\(\s*getenv\s*\(\s*['\"]TELEGRAM_BOT_TOKEN['\"]\s*\)\s*\?:\s*['\"])[^'\"]*(['\"]\s*\))/";
        $replacement = '${1}' . addcslashes($newTgToken, "'\\") . '${2}';
        foreach ($envFiles as $envFile) {
            if (!is_file($envFile)) continue;
            $content = file_get_contents($envFile);
            $patched = preg_replace($pattern, $replacement, $content);
            if ($patched !== null && $patched !== $content) {
                file_put_contents($envFile, $patched);
            }
        }
    }

    // ── Telegram Chat ID ────────────────────────────────────────────────────────
    $newTgChatIds = $apiCfg['telegramChatIds'] ?? [];
    $newTgChatId = is_array($newTgChatIds) ? ($newTgChatIds[0] ?? '') : (string)$newTgChatIds;
    $newTgChatId = trim($newTgChatId);
    if ($newTgChatId !== '') {
        $root = dirname(__DIR__, 2);
        $envFiles = [
            $root . '/config/env.php',
            $root . '/public_html/config/env.php',
            $root . '/deploy/public_html/config/env.php',
        ];
        $pattern     = "/(define\s*\(\s*['\"]TELEGRAM_CHAT_ID['\"]\s*,\s*(?:\(string\)\s*)?\(\s*getenv\s*\(\s*['\"]TELEGRAM_CHAT_ID['\"]\s*\)\s*\?:\s*['\"])[^'\"]*(['\"]\s*\))/";
        $replacement = '${1}' . addcslashes($newTgChatId, "'\\") . '${2}';
        foreach ($envFiles as $envFile) {
            if (!is_file($envFile)) continue;
            $content = file_get_contents($envFile);
            $patched = preg_replace($pattern, $replacement, $content);
            if ($patched !== null && $patched !== $content) {
                file_put_contents($envFile, $patched);
            }
        }
    }

    return $result;
}

/**
 * Returns consistent, professional blocks for WhatsApp messages.
 * Segmented to allow conditional inclusion of tracking or reviews.
 */
function dropcars_admin_wa_contact_block() {
    $configPath = __DIR__ . '/../../api/config.php';
    $config = is_file($configPath) ? (include $configPath) : [];

    $website = $config['websiteUrl'] ?? 'https://dropcars.in';
    $email   = $config['supportEmail'] ?? 'support@dropcars.in';
    $phone   = $config['supportPhone'] ?? '+91 7200217986';

    $block  = "\n\n━━━━━━━━━━━━━━━━━━━\n";
    $block .= "*Website:* " . $website . "\n";
    $block .= "*Email:* " . $email . "\n";
    $block .= "*Support:* " . $phone;
    return $block;
}

function dropcars_admin_wa_track_block($bookingId) {
    if (empty($bookingId)) return "";
    $configPath = __DIR__ . '/../../api/config.php';
    $config = is_file($configPath) ? (include $configPath) : [];
    $website = rtrim($config['websiteUrl'] ?? 'https://dropcars.in', '/');

    // Ensure we use the proper ID format
    $cleanId = preg_replace('/[^a-zA-Z0-9]/', '', (string)$bookingId);
    return "\n*Track Your Trip Live:* " . $website . "/track-booking/" . $cleanId;
}

/**
 * Generates a clean route-specific URL dynamically from pickup and drop locations.
 */
function dropcars_get_route_url($pickup, $drop) {
    if (empty($pickup) || empty($drop)) return '';
    $pParts = explode(',', $pickup);
    $dParts = explode(',', $drop);
    $pCity = trim($pParts[0]);
    $dCity = trim($dParts[0]);
    $slugP = strtolower(preg_replace('/[^a-zA-Z0-9\s]/', '', $pCity));
    $slugP = preg_replace('/\s+/', '-', trim($slugP));
    $slugD = strtolower(preg_replace('/[^a-zA-Z0-9\s]/', '', $dCity));
    $slugD = preg_replace('/\s+/', '-', trim($slugD));
    if (empty($slugP) || empty($slugD)) return '';
    return "https://dropcars.in/routes/{$slugP}-to-{$slugD}-taxi.html";
}

function dropcars_admin_wa_review_block() {
    $configPath = __DIR__ . '/../../api/config.php';
    $config = is_file($configPath) ? (include $configPath) : [];
    $link = $config['reviewLink'] ?? 'https://g.page/r/Ca8WJ8qywAxdEAE/review';

    return "\n*Rate Your Experience:* " . $link;
}

/**
 * Backward compatibility wrapper for the old footer function.
 */
function dropcars_admin_wa_footer() {
    return dropcars_admin_wa_contact_block() . dropcars_admin_wa_review_block();
}

/**
 * Unified WhatsApp message template generator.
 * Avoids duplicate text templates and guarantees consistency.
 */
function dropcars_get_whatsapp_template(string $type, array $row): string {
    $custName = trim((string)($row['name'] ?? $row['customer_name'] ?? 'Guest'));
    $phone = trim((string)($row['phone'] ?? $row['customer_phone'] ?? ''));
    $bookingId = trim((string)($row['booking_id'] ?? $row['id'] ?? ''));
    
    // Resolve prefix: convert E/DE/DC/C to C for confirmations and drivers
    if (in_array($type, ['confirm', 'driver', 'complete'], true)) {
        if (strpos($bookingId, 'DE') === 0) {
            $bookingId = 'C' . substr($bookingId, 2);
        } elseif (strpos($bookingId, 'E') === 0) {
            $bookingId = 'C' . substr($bookingId, 1);
        } elseif (strpos($bookingId, 'DC') === 0) {
            $bookingId = 'C' . substr($bookingId, 2);
        }
    }
    
    $pickup = trim((string)($row['pickup'] ?? $row['pickup_location'] ?? 'N/A'));
    $drop = trim((string)($row['drop_location'] ?? 'N/A'));
    $travelDate = !empty($row['travel_date']) ? $row['travel_date'] : ($row['pickup_date'] ?? '');
    $date = !empty($travelDate) ? date('d M Y', strtotime($travelDate)) : '';
    $time = trim((string)($row['travel_time'] ?? $row['pickup_time'] ?? ''));
    
    $tripType = strtolower(trim((string)($row['trip_type'] ?? 'one_way')));
    $tripTypeLabel = (in_array($tripType, ['oneway', 'one_way'])) ? 'One-Way Drop' : 'Round Trip';
    
    $fare = number_format((float)($row['final_fare'] ?? $row['fare_estimate'] ?? 0));
    $fareTypeRaw = strtolower(trim((string)($row['fare_type'] ?? 'exclusive')));
    $fareType = ($fareTypeRaw === 'inclusive') ? 'Inclusive of all taxes' : 'Excl. toll/state tax';
    $vehicleType = !empty($row['vehicle_type']) ? strtoupper($row['vehicle_type']) : 'AC Cab';
    
    $driverName = trim((string)($row['driver_name'] ?? ''));
    $driverPhone = trim((string)($row['driver_phone'] ?? ''));
    $carModel = trim((string)($row['car_name'] ?? ''));
    $carNumber = strtoupper(trim((string)($row['car_number'] ?? '')));
    
    $includeGst = isset($row['include_gst']) && (int)$row['include_gst'] === 1;
    $gstPercent = isset($row['gst_percent']) ? (float)$row['gst_percent'] : 5.00;

    $routeUrl = dropcars_get_route_url($pickup, $drop);

    switch ($type) {
        case 'quote':
            $tpl  = "🌟 *DROP CARS* 🌟\n";
            $tpl .= "_Premium Intercity Cab Services_\n\n";
            $tpl .= "Dear *{$custName}*,\n\n";
            $tpl .= "Thank you for choosing *Drop Cars*. We have received your travel request. Please find your custom trip quotation below:\n\n";
            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "🚖 *TRIP DETAILS*\n";
            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "📍 *Route:* {$pickup} ➔ {$drop}\n";
            $tpl .= "💼 *Trip Type:* {$tripTypeLabel}\n";
            if ($date) $tpl .= "📅 *Date:* {$date}\n";
            if ($time) $tpl .= "⏰ *Time:* {$time}\n";
            if ($routeUrl) $tpl .= "🔗 *Route Details:* {$routeUrl}\n";
            
            $fareVal = (float)($row['final_fare'] ?? $row['fare_estimate'] ?? 0);
            $tpl .= "\n━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "💰 *FARE SUMMARY*\n";
            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            if ($fareVal > 0) {
                $tpl .= "💵 *Estimated Fare:* *₹" . number_format($fareVal) . "*\n";
                $tpl .= "ℹ️ *Fare Type:* _{$fareType}_\n";
                $tpl .= "🚗 *Vehicle Class:* {$vehicleType}\n";
            } else {
                $tpl .= "Our team is currently verifying vehicle availability and will share the best fare details with you shortly.\n";
            }
            
            $tpl .= "\n━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "🎁 *CUSTOMER PRIVILEGES*\n";
            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "Log in to your customer dashboard to claim exclusive discounts and earn reward points on your booking:\n";
            $tpl .= "👉 https://dropcars.in/pages/customer-login.php\n\n";
            $tpl .= "📌 *Reference ID:* #{$bookingId}\n\n";
            $tpl .= "If you would like to proceed with this booking or need assistance, simply reply to this message.\n";
            $tpl .= "Regards,\n";
            $tpl .= "*Drop Cars Team*";
            return $tpl;
            
        case 'ask_advance':
            $configPath = dirname(__DIR__, 2) . '/data/config.json';
            $config = is_file($configPath) ? json_decode(file_get_contents($configPath), true) : [];
            $website = rtrim($config['company']['website'] ?? 'https://dropcars.in', '/');
            $cleanId = preg_replace('/[^a-zA-Z0-9]/', '', $bookingId);
            
            // Resolve total fare
            $totalFare = (float)($row['final_fare'] ?? $row['estimated_fare'] ?? $row['fare_estimate'] ?? 0);
            
            // Advance payment config
            $advCfg        = $config['advancePayment'] ?? [];
            $advPercent    = (int)($advCfg['percent']   ?? 20);
            $advMinAmount  = (int)($advCfg['minAmount'] ?? 300);
            $advUpiId      = (string)($advCfg['upiId']    ?? '7200217986-1@okbizaxis');
            
            $calcAdvance  = (int)ceil($totalFare * $advPercent / 100);
            $advAmount    = max($advMinAmount, $calcAdvance);
            
            $tpl  = "🌟 *DROP CARS* 🌟\n";
            $tpl .= "_Booking Confirmation Pending_\n\n";
            $tpl .= "Dear *{$custName}*,\n\n";
            $tpl .= "To secure and finalize your booking *#{$bookingId}* for your upcoming journey from *{$pickup}* to *{$drop}*, we kindly request an advance payment of *₹" . number_format($advAmount) . "* ({$advPercent}% of the total fare ₹" . number_format($totalFare) . ").\n\n";
            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "💸 *PAYMENT DETAILS*\n";
            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "🏦 *UPI ID:* *{$advUpiId}*\n";
            $tpl .= "💰 *Amount:* *₹" . number_format($advAmount) . "*\n";
            $tpl .= "📌 *Reference ID:* *#{$bookingId}*\n\n";
            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "📲 *UPLOAD PAY RECEIPT*\n";
            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "Please upload your transaction screenshot to instantly confirm your booking:\n";
            $tpl .= "👉 https://dropcars.in/thank-you/{$cleanId}\n\n";
            $tpl .= "_Your booking will be fully confirmed once we verify the advance payment. Thank you for choosing us!_\n";
            $tpl .= dropcars_admin_wa_contact_block();
            return $tpl;
            
        case 'confirm':
            $distKm   = (int)($row['distance_km'] ?? 0);
            $tripDays = (int)($row['trip_days'] ?? 0);
            $totalFare = (float)($row['final_fare'] ?? $row['estimated_fare'] ?? 0);
            $advancePaid = (float)($row['advance_paid'] ?? 0);
            $balanceDue  = max(0, $totalFare - $advancePaid);

            // Lookup per-km rate from tariffs JSON
            $perKmRate = '';
            try {
                $allTariffs = get_json_tariffs();
                $vTypeSearch = !empty($row['vehicle_type']) ? strtoupper($row['vehicle_type']) : (!empty($row['car_name']) ? strtoupper($row['car_name']) : 'SEDAN');
                $tTypeSearch = (in_array($tripType, ['oneway', 'one_way'])) ? 'oneway' : 'round';
                
                foreach ($allTariffs as $t) {
                    if (strtoupper($t['vehicle_type']) === $vTypeSearch && strtolower($t['trip_type']) === $tTypeSearch) {
                        $perKmRate = (float)$t['per_km_rate'];
                        break;
                    }
                }
                
                if ($perKmRate === '') {
                    foreach ($allTariffs as $t) {
                        if (strpos($vTypeSearch, strtoupper($t['vehicle_type'])) !== false && strtolower($t['trip_type']) === $tTypeSearch) {
                            $perKmRate = (float)$t['per_km_rate'];
                            break;
                        }
                    }
                }
            } catch (\Throwable $e) {
                error_log('Error resolving per_km_rate for WhatsApp: ' . $e->getMessage());
            }

            if ($perKmRate === '') {
                if (strpos(strtoupper($vehicleType), 'SUV') !== false) {
                    $perKmRate = (in_array($tripType, ['oneway', 'one_way'])) ? 19.0 : 18.0;
                } elseif (strpos(strtoupper($vehicleType), 'INNOVA') !== false) {
                    $perKmRate = (in_array($tripType, ['oneway', 'one_way'])) ? 20.0 : 19.0;
                } elseif (strpos(strtoupper($vehicleType), 'CRYSTA') !== false) {
                    $perKmRate = (in_array($tripType, ['oneway', 'one_way'])) ? 23.0 : 22.0;
                } else {
                    $perKmRate = (in_array($tripType, ['oneway', 'one_way'])) ? 14.0 : 13.0; // Sedan default
                }
            }

            // Look up latest advance payment status from database to show waiting for verification state
            $paymentStatus = 'unpaid';
            $claimedAmount = 0.00;
            try {
                if (isset($pdo) && $pdo instanceof PDO) {
                    $tableCheck = $pdo->query("SHOW TABLES LIKE 'advance_payments'")->fetchColumn();
                    if ($tableCheck) {
                        $stmtAp = $pdo->prepare("SELECT amount, status FROM `advance_payments` WHERE booking_id = ? ORDER BY id DESC LIMIT 1");
                        $stmtAp->execute([$bookingId]);
                        $apRow = $stmtAp->fetch(PDO::FETCH_ASSOC);
                        if ($apRow) {
                            $paymentStatus = strtolower(trim($apRow['status']));
                            $claimedAmount = (float)$apRow['amount'];
                        }
                    }
                }
            } catch (\Throwable $e) {}

            $tpl  = "🌟 *DROP CARS* 🌟\n";
            $tpl .= "_Booking Confirmed!_\n\n";
            $tpl .= "Dear *{$custName}*,\n\n";
            $tpl .= "We are pleased to inform you that your booking *#{$bookingId}* has been successfully *CONFIRMED*!\n\n";

            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "🚖 *TRIP INFORMATION*\n";
            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "📍 *Route:* {$pickup} ➔ {$drop}\n";
            $tpl .= "💼 *Service Type:* {$tripTypeLabel}\n";
            if ($date) $tpl .= "📅 *Travel Date:* {$date}\n";
            if ($time) $tpl .= "⏰ *Pickup Time:* {$time}\n";

            // Round trip return date if available
            if (!in_array($tripType, ['oneway','one_way'])) {
                $returnDate = !empty($row['return_date']) ? date('d M Y', strtotime($row['return_date'])) : '';
                $returnTime = trim((string)($row['return_time'] ?? ''));
                if ($returnDate) $tpl .= "📅 *Return Date:* {$returnDate}" . ($returnTime ? " at {$returnTime}" : '') . "\n";
                if ($tripDays > 0) $tpl .= "⏱️ *Trip Duration:* {$tripDays} day" . ($tripDays > 1 ? 's' : '') . "\n";
            }
            $tpl .= "\n";

            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "💵 *FARE & BILLING*\n";
            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "🚗 *Vehicle:* {$vehicleType}\n";
            $tpl .= "💰 *Total Fare:* *₹" . number_format($totalFare) . "* _({$fareType})_\n";
            if ($advancePaid > 0) {
                $tpl .= "💳 *Advance Paid:* *₹" . number_format($advancePaid) . "* _(Verified)_\n";
                $tpl .= "💵 *Balance Due:* *₹" . number_format($balanceDue) . "* _(payable to driver at trip end)_\n";
            } elseif ($paymentStatus === 'pending') {
                $tpl .= "💳 *Advance Paid:* *₹" . number_format($claimedAmount) . "* _(Waiting verification)_\n";
                $tpl .= "💵 *Balance Due:* *₹" . number_format($totalFare) . "* _(subject to verification)_\n";
            } else {
                $tpl .= "💳 *Advance Paid:* *₹0* _(No payment received yet)_\n";
                $tpl .= "💵 *Balance Due:* *₹" . number_format($totalFare) . "* _(payable to driver at pickup/trip end)_\n";
            }
            $tpl .= "\n";

            // KM allowance
            $isHourlyTripType = strpos($tripType, 'hourly') !== false;
            if ($distKm > 0) {
                $kmNote = ($tripType === 'round_trip' || !in_array($tripType, ['oneway','one_way']))
                    ? "🛣️ *KM Allowance:* {$distKm} km (both ways)\n"
                      . "🪙 *Extra KM Rate:* ₹{$perKmRate}/km beyond the limit\n"
                    : "🛣️ *KM Allowance:* {$distKm} km (one-way)\n"
                      . "🪙 *Extra KM Rate:* ₹{$perKmRate}/km beyond the limit\n";
                // Rental waiting/extra time is billed at the hourly package
                // tariff, not a flat ₹150/hour - matches assets/js/booking-form.js.
                if ($isHourlyTripType) {
                    $dcFaresCfg = null;
                    $dcCfgPath = __DIR__ . '/../../data/config.json';
                    if (file_exists($dcCfgPath)) {
                        $dcCfgJson = json_decode(file_get_contents($dcCfgPath), true);
                        $dcFaresCfg = $dcCfgJson['fares'] ?? null;
                    }
                    $hourlyRateAdmin = $dcFaresCfg ? (int) ($dcFaresCfg['hourlyRates'][strtoupper((string) $vehicleType)] ?? 0) : 0;
                    if ($hourlyRateAdmin > 0) {
                        $kmNote .= "⏱️ *Extra Hour:* ₹{$hourlyRateAdmin}/hr, *Extra KM:* ₹" . round($hourlyRateAdmin / 10) . "/km (as per hourly tariff)\n";
                    }
                } else {
                    $kmNote .= "⏱️ *Waiting Charges:* ₹150 per hour applies (after 45 mins grace period)\n";
                }
                $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
                $tpl .= "🛣️ *TRIP LIMITS & CHARGES*\n";
                $tpl .= "━━━━━━━━━━━━━━━━━━━\n" . $kmNote . "\n";
            }

            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "✅ *INCLUSIONS*\n";
            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "- Air-conditioned vehicle with professional driver\n";
            $tpl .= "- Base fare and fuel charges\n";
            $tpl .= "- Driver allowance (bata)\n";
            if ($fareTypeRaw === 'inclusive') {
                $tpl .= "- Highway toll charges\n";
                $tpl .= "- State border permit tax (if crossing state border)\n";
            }
            if ($includeGst) {
                $tpl .= "- GST (" . number_format($gstPercent, 2) . "%) Included\n";
            }
            $tpl .= "\n";

            $waExcl = ($fareTypeRaw === 'inclusive' ? "" : "Toll charges (as applicable), State border tax (if crossing state border), ") . (!$includeGst ? "GST (" . number_format($gstPercent, 2) . "%) extra, " : "") . "Parking charges" . ($isHourlyTripType ? "" : ", Extra KMs (if exceeded)");
            if (in_array($tripType, ['oneway', 'one_way'])) {
                $waExcl .= ", Waiting or additional stop charges (₹150 per stop/hour), if availed";
            } elseif ($isHourlyTripType) {
                $waExcl .= ($hourlyRateAdmin ?? 0) > 0
                    ? ", Extra hour beyond package at ₹{$hourlyRateAdmin}/hr, Extra km beyond package at ₹" . round(($hourlyRateAdmin ?? 0) / 10) . "/km"
                    : ", Waiting or additional stop charges (₹150 per stop/hour), if availed";
            } else {
                $waExcl .= ", Night allowance (after 10 PM), if applicable";
            }
            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "❌ *EXCLUSIONS*\n";
            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "- {$waExcl}\n\n";

            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "📱 *REAL-TIME TRACKING*\n";
            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "Track your driver and trip status in real-time:\n";
            $tpl .= "👉 https://dropcars.in/track-booking/{$bookingId}\n\n";

            $tpl .= "We will notify you once your driver and cab are assigned.";
            $tpl .= dropcars_admin_wa_contact_block();
            return $tpl;

        case 'followup':
            $tpl  = "🌟 *DROP CARS* 🌟\n";
            $tpl .= "_Travel Assistance & Follow-up_\n\n";
            $tpl .= "Dear *{$custName}*,\n\n";
            $tpl .= "We are following up regarding your planned journey from *{$pickup}* to *{$drop}*";
            if ($date) $tpl .= " on *{$date}*";
            $tpl .= ".\n\n";
            $tpl .= "We have verified professional drivers and clean, sanitized AC cabs ready in your area.\n\n";
            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "✨ *THE DROP CARS ADVANTAGE*\n";
            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "🛡️ *Guaranteed Safety:* 24/7 support & live trip tracking.\n";
            $tpl .= "💰 *Honest Pricing:* No hidden fees or surprise charges.\n";
            $tpl .= "🚕 *Premium Fleet:* Clean, sanitized, and fully certified vehicles.\n";
            $tpl .= "👨‍✈️ *Elite Chauffeurs:* Well-trained, polite, and punctual drivers.\n\n";
            if ($routeUrl) {
                $tpl .= "🔗 *Route & Tariff Details:* {$routeUrl}\n\n";
            }
            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "🎁 *EXCLUSIVE BENEFITS*\n";
            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "Access our client login for special rates and bonus points:\n";
            $tpl .= "👉 https://dropcars.in/pages/customer-login.php\n\n";
            $tpl .= "Would you like us to secure this booking and dispatch a driver? Simply reply to this chat or call us directly.";
            return $tpl;
            
        case 'driver':
            $tpl  = "🌟 *DROP CARS* 🌟\n";
            $tpl .= "_Chauffeur & Cab Dispatched_\n\n";
            $tpl .= "Dear *{$custName}*,\n\n";
            $tpl .= "Your chauffeur and cab details have been assigned for your upcoming trip *#{$bookingId}*:\n\n";
            
            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "👨‍✈️ *CHAUFFEUR DETAILS*\n";
            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "👤 *Name:* {$driverName}\n";
            $tpl .= "📞 *Contact:* {$driverPhone}\n\n";
            
            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "🚖 *CAB DETAILS*\n";
            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "🚗 *Model:* {$carModel}\n";
            $tpl .= "🔢 *Plate No:* *{$carNumber}*\n\n";
            
            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "📅 *TRIP SUMMARY*\n";
            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "📍 *Route:* {$pickup} ➔ {$drop}\n";
            if ($date) $tpl .= "📅 *Date:* {$date}\n";
            if ($time) $tpl .= "⏰ *Pickup Time:* {$time}\n\n";
            
            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "📱 *REAL-TIME TRACKING*\n";
            $tpl .= "━━━━━━━━━━━━━━━━━━━\n";
            $tpl .= "Track your driver's live position:\n";
            $tpl .= "👉 https://dropcars.in/track-booking/{$bookingId}\n\n";
            
            $tpl .= "_Your chauffeur will contact you 30 minutes prior to your scheduled pickup time. Have a safe and pleasant journey!_\n";
            $tpl .= dropcars_admin_wa_contact_block();
            return $tpl;
            
        case 'complete':
            $tpl  = "🌟 *DROP CARS* 🌟\n";
            $tpl .= "_Trip Successfully Completed_\n\n";
            $tpl .= "Dear *{$custName}*,\n\n";
            $tpl .= "Thank you for traveling with *Drop Cars*! We hope you enjoyed a smooth, safe, and comfortable ride from *{$pickup}* to *{$drop}*.\n\n";
            $tpl .= "To help us maintain our high standards, please take 30 seconds to rate your chauffeur and trip experience on Google:\n\n";
            
            $configPath = dirname(__DIR__, 2) . '/api/config.php';
            $config = is_file($configPath) ? (include $configPath) : [];
            $link = $config['reviewLink'] ?? 'https://g.page/r/Ca8WJ8qywAxdEAE/review';
            
            $tpl .= "👉 {$link}\n\n";
            $tpl .= "_We look forward to serving you on your next intercity journey. Thank you!_\n";
            $tpl .= dropcars_admin_wa_contact_block();
            return $tpl;

        case 'cancelled':
            $tpl  = "🌟 *DROP CARS* 🌟\n";
            $tpl .= "_Cancellation Confirmed_\n\n";
            $tpl .= "Dear *{$custName}*,\n\n";
            $tpl .= "As requested, your booking *#{$bookingId}* from *{$pickup}* to *{$drop}* has been *CANCELLED*.\n\n";
            $tpl .= "If any advance payment was made, refunds will be processed in accordance with our cancellation guidelines:\n";
            $tpl .= "👉 https://dropcars.in/pages/cancellation-policy.php\n\n";
            $tpl .= "We hope to have the opportunity to serve you better next time.\n";
            $tpl .= dropcars_admin_wa_contact_block();
            return $tpl;
    }
    return '';
}

/**
 * Dynamic WhatsApp Link Builder based on Lead type/status
 */
function dropcars_get_whatsapp_link(array $lead) {
    $status = strtolower(trim((string)($lead['status'] ?? '')));
    
    // Support keys for both booking row ($lead['customer_phone']) and enquiry row ($lead['phone'])
    $phone = preg_replace('/[^\d]/', '', $lead['phone'] ?? $lead['customer_phone'] ?? '');
    
    // Determine template type
    if ($status === 'confirmed') {
        $type = 'confirm';
    } elseif ($status === 'pending') {
        $type = 'followup';
    } else {
        $type = 'quote';
    }
    
    // Normalize keys to match what dropcars_get_whatsapp_template expects
    $row = $lead;
    if (!isset($row['name']) && isset($row['customer_name'])) {
        $row['name'] = $row['customer_name'];
    }
    if (!isset($row['phone']) && isset($row['customer_phone'])) {
        $row['phone'] = $row['customer_phone'];
    }
    if (!isset($row['pickup']) && isset($row['pickup_location'])) {
        $row['pickup'] = $row['pickup_location'];
    }
    if (!isset($row['drop']) && isset($row['drop_location'])) {
        $row['drop'] = $row['drop_location'];
    }
    if (!isset($row['travel_date']) && isset($row['pickup_date'])) {
        $row['travel_date'] = $row['pickup_date'];
    }
    if (!isset($row['travel_time']) && isset($row['pickup_time'])) {
        $row['travel_time'] = $row['pickup_time'];
    }
    if (!isset($row['fare_estimate']) && isset($row['final_fare'])) {
        $row['fare_estimate'] = $row['final_fare'];
    }
    
    $tplText = dropcars_get_whatsapp_template($type, $row);
    return "https://wa.me/" . $phone . "?text=" . rawurlencode($tplText);
}

/**
 * Safe recursive directory deletion helper.
 */
function dropcars_delete_dir_recursive($dir) {
    if (!is_dir($dir)) return false;
    $files = array_diff(scandir($dir), ['.', '..']);
    foreach ($files as $file) {
        $path = $dir . '/' . $file;
        if (is_dir($path)) {
            dropcars_delete_dir_recursive($path);
        } else {
            unlink($path);
        }
    }
    return rmdir($dir);
}

/**
 * Regenerates the hardcoded theme-slug lists inside the root .htaccess from themes.json.
 * Called automatically whenever a theme is added, edited, or deleted via the admin panel.
 * Without this, new themes added via admin would be 404'd because Apache .htaccess has
 * hardcoded alternation groups like (drop-taxi|one-way-taxi|...) that don't know about
 * dynamically-added slugs.
 */
function dropcars_sync_htaccess_theme_slugs() {
    $projectRoot  = dirname(__DIR__, 2);
    $themesPath   = $projectRoot . '/data/themes.json';
    $htaccessPath = $projectRoot . '/.htaccess';

    if (!is_file($themesPath) || !is_file($htaccessPath)) {
        return false;
    }

    $themes = json_decode(file_get_contents($themesPath), true);
    if (!is_array($themes)) {
        return false;
    }

    // Build the pipe-separated alternation of all theme slugs (escaped for regex)
    $slugs = [];
    foreach ($themes as $t) {
        $slug = trim((string)($t['slug'] ?? ''));
        if ($slug !== '' && $slug !== 'drop-cars') {
            $slugs[] = preg_quote($slug, '/');
        }
    }
    // Always include drop-cars itself and the core default slugs
    $allSlugs = array_unique(array_merge(
        ['drop-cars', 'drop-taxi', 'one-way-taxi', 'outstation-taxi', 'intercity-taxi',
         'intercity-cabs', 'one-way-cab', 'drop-taxi-service', 'drop-car-service',
         'one-drop-taxi', 'one-drop-cab', 'city-to-city-taxi', 'city-to-city-cabs',
         'intercity-drop-taxi', 'outstation-cab', 'outstation-cabs', 'outstation-drop-taxi'],
        array_map(function($t){ return trim((string)($t['slug'] ?? '')); }, $themes)
    ));
    $allSlugs = array_values(array_filter($allSlugs, function($s){ return $s !== ''; }));
    sort($allSlugs);

    $altGroup = implode('|', array_map('preg_quote', $allSlugs, array_fill(0, count($allSlugs), '/')));

    $htContent = file_get_contents($htaccessPath);

    // Pattern that matches any existing alternation group in our theme-specific rules.
    // We mark the sections with a comment so we can reliably find and replace them.
    // Replace all occurrences of the theme alternation group in the file.
    $oldPattern = '/\((?:drop-cars|drop-taxi|one-way-taxi|outstation-taxi|intercity-taxi|intercity-cabs|one-way-cab|drop-taxi-service|drop-car-service|one-drop-taxi|one-drop-cab|city-to-city-taxi|city-to-city-cabs|intercity-drop-taxi|outstation-cab|outstation-cabs|outstation-drop-taxi)(?:\|[a-z0-9-]+)*\)/';
    $newGroup   = '(' . implode('|', $allSlugs) . ')';

    $patched = preg_replace($oldPattern, $newGroup, $htContent);
    if ($patched === null || $patched === $htContent) {
        // Nothing changed or regex failed — not an error
        return true;
    }

    return file_put_contents($htaccessPath, $patched) !== false;
}

/**
 * Dynamic theme subdomain directory synchronization.
 * Synchronizes directories in Theme - Website/ to match data/themes.json.
 */
function dropcars_sync_theme_subdomain_directories() {

    $projectRoot = dirname(__DIR__, 2);
    $themesPath  = $projectRoot . '/data/themes.json';
    $baseDir     = $projectRoot . '/Theme - Website';

    if (!is_file($themesPath)) {
        return false;
    }

    $themes = json_decode(file_get_contents($themesPath), true);
    if (!is_array($themes)) {
        return false;
    }

    // Identify expected folders
    $expectedFolders = [];
    foreach ($themes as $t) {
        $slug = trim((string)($t['slug'] ?? ''));
        if ($slug === '' || $slug === 'drop-cars') {
            continue; // drop-cars theme is the root domain website and doesn't need its own subdomain folder
        }
        // Normalize folder name: lower-case, alphanumeric only (e.g. drop-taxi -> droptaxi)
        $folderName = preg_replace('/[^a-z0-9]/', '', strtolower($slug));
        if ($folderName !== '') {
            $expectedFolders[$folderName] = $slug;
        }
    }

    // 1. Ensure Theme - Website/ directory exists
    if (!is_dir($baseDir)) {
        mkdir($baseDir, 0755, true);
    }

    // 2. Create or update folders for active themes
    foreach ($expectedFolders as $folder => $slug) {
        $dir = $baseDir . '/' . $folder;
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        // Write/Overwrite .htaccess
        $ht = "RewriteEngine On\nRewriteBase /\n\n# Route all clean URLs to local index.php\nRewriteCond %{REQUEST_FILENAME} !-f\nRewriteCond %{REQUEST_FILENAME} !-d\nRewriteRule ^(.*)$ index.php?__path=\$1 [QSA,L]\n";
        file_put_contents($dir . '/.htaccess', $ht);

        // Write/Overwrite index.php
        $php = "<?php\n/**\n * Entry point for {$slug} theme subdomain website.\n * Subdomain: {$folder}.dropcars.in\n */\n\$_GET['theme'] = '{$slug}';\nrequire_once __DIR__ . '/../../index.php';\n";
        file_put_contents($dir . '/index.php', $php);
    }

    // 3. Clean up deleted/inactive theme folders
    if (is_dir($baseDir)) {
        $existingItems = scandir($baseDir);
        foreach ($existingItems as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            $path = $baseDir . '/' . $item;
            if (is_dir($path)) {
                if (!isset($expectedFolders[$item])) {
                    dropcars_delete_dir_recursive($path);
                }
            }
        }
    }

    // 4. Re-generate the .htaccess theme alternation groups so Apache routes new slugs
    dropcars_sync_htaccess_theme_slugs();

    return true;
}

/**
 * Multi-Site: Fetch all registered websites
 */
function dropcars_get_registered_sites($pdo) {
    try {
        $stmt = $pdo->query("SELECT * FROM `registered_sites` ORDER BY `display_name` ASC");
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (PDOException $e) {
        return [];
    }
}

/**
 * Multi-Site: Get current active website slug from session
 */
function dropcars_get_active_website() {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    return $_SESSION['active_website'] ?? 'all';
}

/**
 * Multi-Site: Fetch details of current active website
 */
function dropcars_get_active_website_details($pdo) {
    $active = dropcars_get_active_website();
    if ($active === 'all') {
        return null;
    }
    try {
        $stmt = $pdo->prepare("SELECT * FROM `registered_sites` WHERE `slug` = ? LIMIT 1");
        $stmt->execute([$active]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    } catch (PDOException $e) {
        return null;
    }
}

/**
 * Multi-Site: Get configuration array for a specific website (merged with global defaults)
 */
function dropcars_get_site_config_json($pdo, $websiteSlug) {
    $globalConfigPath = dirname(__DIR__, 2) . '/api/config.php';
    $config = is_file($globalConfigPath) ? (include $globalConfigPath) : [];
    
    if (!$websiteSlug || $websiteSlug === 'all') {
        return $config;
    }
    
    try {
        $stmt = $pdo->prepare("SELECT `config_json` FROM `site_configs` WHERE `website` = ? LIMIT 1");
        $stmt->execute([$websiteSlug]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row && !empty($row['config_json'])) {
            $siteConfig = json_decode($row['config_json'], true);
            if (is_array($siteConfig)) {
                // Merge site-specific config over global default config keys
                return array_merge($config, $siteConfig);
            }
        }
    } catch (PDOException $e) {
        // Fall back to global configuration on table error
    }
    
    return $config;
}

/**
 * Multi-Site: Save config array for a specific website
 */
function dropcars_save_site_config_json($pdo, $websiteSlug, array $configData) {
    if (!$websiteSlug || $websiteSlug === 'all') {
        return false;
    }
    try {
        $json = json_encode($configData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        $stmt = $pdo->prepare("INSERT INTO `site_configs` (`website`, `config_json`) VALUES (?, ?) 
            ON DUPLICATE KEY UPDATE `config_json` = VALUES(`config_json`)");
        return $stmt->execute([$websiteSlug, $json]);
    } catch (PDOException $e) {
        return false;
    }
}

/**
 * Multi-Site: Get effective configuration based on current active website
 */
function dropcars_get_effective_config($pdo) {
    $active = dropcars_get_active_website();
    return dropcars_get_site_config_json($pdo, $active);
}