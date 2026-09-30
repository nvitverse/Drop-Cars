<?php
/**
 * Admin Tariff Management Page - Premium React-Style Control Center (JSON-Based File Storage)
 */

$settingsFile = dirname(__DIR__, 2) . '/admin/config/settings.json';
$settings = file_exists($settingsFile) ? json_decode(file_get_contents($settingsFile), true) : [];

// Permit / state entry charges
$publicConfigPath = dirname(__DIR__, 2) . '/data/config.json';
$publicConfig = is_file($publicConfigPath) ? (json_decode(file_get_contents($publicConfigPath), true) ?: []) : [];
$permitDefaults = ['SEDAN' => 500, 'SUV' => 1000, 'INNOVA' => 1500, 'CRYSTA' => 1500, 'andhra_premium' => 2000];
$permitCharges = $permitDefaults;
if (isset($publicConfig['permitCharges']) && is_array($publicConfig['permitCharges'])) {
    $permitCharges = array_merge($permitDefaults, $publicConfig['permitCharges']);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'toggle_dynamic') {
    $settings['enable_dynamic_pricing'] = !empty($_POST['enabled']);
    file_put_contents($settingsFile, json_encode($settings, JSON_PRETTY_PRINT));
    sync_tariffs_to_config();
    header('Location: ' . admin_url('tariffs', ['msg' => 'pricing_mode_updated']));
    exit;
}

$tariffs = get_json_tariffs();
$msg = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    if ($action == 'add_or_update') {
        $id = (!empty($_POST['id'])) ? (int)$_POST['id'] : null;
        $vehicleType = strtoupper((string)($_POST['vehicle_type'] ?? ''));
        $perKmRate = (float)($_POST['per_km_rate'] ?? 0);
        $driverBeta = (float)($_POST['driver_beta'] ?? 0);
        $tripType = $_POST['trip_type'] ?? '';
        $passengers = (int)($_POST['passengers'] ?? 0);
        $luggage = (int)($_POST['luggage'] ?? 0);
        $isAc = isset($_POST['is_ac']) ? 1 : 0;
        $vehicleModel = $_POST['vehicle_model'] ?? '';
        $oldRate = (float)($_POST['old_per_km_rate'] ?? 0);
        $oldBata = (float)($_POST['old_driver_beta'] ?? 0);
        
        $isDynamic = isset($_POST['is_dynamic']) ? (int)$_POST['is_dynamic'] : 0;
        $reasoningNote = trim((string)($_POST['reasoning_note'] ?? ''));
        $strikeOn = isset($_POST['strike_on']) ? (int)$_POST['strike_on'] : 0;

        $rawFrom  = trim((string)($_POST['effective_from']  ?? ''));
        $rawUntil = trim((string)($_POST['effective_until'] ?? ''));
        $effFrom  = $rawFrom  !== '' ? date('Y-m-d H:i:s', strtotime(str_replace('T', ' ', $rawFrom)))  : null;
        $effUntil = $rawUntil !== '' ? date('Y-m-d H:i:s', strtotime(str_replace('T', ' ', $rawUntil))) : null;

        if ($id) {
            // Update existing tariff in array
            foreach ($tariffs as &$t) {
                if ((int)$t['id'] === $id) {
                    $t['vehicle_type'] = $vehicleType;
                    $t['per_km_rate'] = $perKmRate;
                    $t['driver_beta'] = $driverBeta;
                    $t['trip_type'] = $tripType;
                    $t['passengers'] = $passengers;
                    $t['luggage'] = $luggage;
                    $t['is_ac'] = $isAc;
                    $t['vehicle_model'] = $vehicleModel;
                    $t['old_per_km_rate'] = $oldRate;
                    $t['old_driver_beta'] = $oldBata;
                    $t['effective_from'] = $effFrom;
                    $t['effective_until'] = $effUntil;
                    $t['is_dynamic'] = $isDynamic;
                    $t['reasoning_note'] = $reasoningNote;
                    $t['strike_on'] = $strikeOn;
                    break;
                }
            }
            unset($t);
            $msg = "Tariff tier successfully updated and synchronized.";
        } else {
            // Insert or Update existing if (vehicle_type, trip_type, is_dynamic) already exists
            $existingIndex = null;
            foreach ($tariffs as $idx => $t) {
                if (strtoupper($t['vehicle_type']) === $vehicleType && strtolower($t['trip_type']) === $tripType && (int)$t['is_dynamic'] === $isDynamic) {
                    $existingIndex = $idx;
                    break;
                }
            }

            if ($existingIndex !== null) {
                $tariffs[$existingIndex]['per_km_rate'] = $perKmRate;
                $tariffs[$existingIndex]['driver_beta'] = $driverBeta;
                $tariffs[$existingIndex]['passengers'] = $passengers;
                $tariffs[$existingIndex]['luggage'] = $luggage;
                $tariffs[$existingIndex]['is_ac'] = $isAc;
                $tariffs[$existingIndex]['vehicle_model'] = $vehicleModel;
                $tariffs[$existingIndex]['old_per_km_rate'] = $oldRate;
                $tariffs[$existingIndex]['old_driver_beta'] = $oldBata;
                $tariffs[$existingIndex]['effective_from'] = $effFrom;
                $tariffs[$existingIndex]['effective_until'] = $effUntil;
                $tariffs[$existingIndex]['reasoning_note'] = $reasoningNote;
                $tariffs[$existingIndex]['strike_on'] = $strikeOn;
                $msg = "Existing tier matching this specifications updated.";
            } else {
                $maxId = 0;
                foreach ($tariffs as $t) {
                    if ((int)$t['id'] > $maxId) {
                        $maxId = (int)$t['id'];
                    }
                }
                $newTariff = [
                    'id' => $maxId + 1,
                    'vehicle_type' => $vehicleType,
                    'per_km_rate' => $perKmRate,
                    'driver_beta' => $driverBeta,
                    'trip_type' => $tripType,
                    'passengers' => $passengers,
                    'luggage' => $luggage,
                    'is_ac' => $isAc,
                    'vehicle_model' => $vehicleModel,
                    'old_per_km_rate' => $oldRate,
                    'old_driver_beta' => $oldBata,
                    'effective_from' => $effFrom,
                    'effective_until' => $effUntil,
                    'is_dynamic' => $isDynamic,
                    'reasoning_note' => $reasoningNote,
                    'strike_on' => $strikeOn,
                    'display_order' => 100
                ];
                $tariffs[] = $newTariff;
                $msg = "New tariff defined successfully.";
            }
        }
        save_json_tariffs($tariffs);
        sync_tariffs_to_config();
    } elseif ($action == 'delete') {
        $id = (int)($_POST['id'] ?? 0);
        $filtered = [];
        foreach ($tariffs as $t) {
            if ((int)$t['id'] !== $id) {
                $filtered[] = $t;
            }
        }
        $tariffs = $filtered;
        save_json_tariffs($tariffs);
        sync_tariffs_to_config();
        $msg = "Pricing tier removed successfully.";
    } elseif ($action == 'import_defaults') {
        $defaults = [
            'oneway' => [
                'SEDAN'  => ['rate' => 14, 'bata' => 400, 'pass' => 4, 'lug' => 3, 'model' => 'Swift Dzire / Etios'],
                'SUV'    => ['rate' => 19, 'bata' => 400, 'pass' => 6, 'lug' => 5, 'model' => 'Maruti Ertiga / Kia Carens'],
                'INNOVA' => ['rate' => 20, 'bata' => 500, 'pass' => 7, 'lug' => 6, 'model' => 'Toyota Innova'],
                'CRYSTA' => ['rate' => 23, 'bata' => 500, 'pass' => 7, 'lug' => 6, 'model' => 'Toyota Innova Crysta'],
            ],
            'round' => [
                'SEDAN'  => ['rate' => 13, 'bata' => 400, 'pass' => 4, 'lug' => 3, 'model' => 'Swift Dzire / Etios'],
                'SUV'    => ['rate' => 18, 'bata' => 400, 'pass' => 6, 'lug' => 5, 'model' => 'Maruti Ertiga / Kia Carens'],
                'INNOVA' => ['rate' => 19, 'bata' => 500, 'pass' => 7, 'lug' => 6, 'model' => 'Toyota Innova'],
                'CRYSTA' => ['rate' => 22, 'bata' => 600, 'pass' => 7, 'lug' => 6, 'model' => 'Toyota Innova Crysta'],
            ]
        ];

        // Filter out non-dynamic ones
        $filtered = [];
        foreach ($tariffs as $t) {
            if (!empty($t['is_dynamic'])) {
                $filtered[] = $t;
            }
        }
        $tariffs = $filtered;

        $maxId = 0;
        foreach ($tariffs as $t) {
            if ((int)$t['id'] > $maxId) {
                $maxId = (int)$t['id'];
            }
        }

        foreach ($defaults as $tripType => $vTypes) {
            foreach ($vTypes as $type => $d) {
                $maxId++;
                $tariffs[] = [
                    'id' => $maxId,
                    'vehicle_type' => $type,
                    'per_km_rate' => $d['rate'],
                    'driver_beta' => $d['bata'],
                    'trip_type' => $tripType,
                    'passengers' => $d['pass'],
                    'luggage' => $d['lug'],
                    'vehicle_model' => $d['model'],
                    'is_ac' => 1,
                    'is_dynamic' => 0,
                    'old_per_km_rate' => 0,
                    'old_driver_beta' => 0,
                    'effective_from' => null,
                    'effective_until' => null,
                    'reasoning_note' => '',
                    'strike_on' => 0,
                    'display_order' => 100
                ];
            }
        }
        save_json_tariffs($tariffs);
        sync_tariffs_to_config();
        $msg = "Default standard tariffs restored successfully.";
    } elseif ($action == 'save_permit_charges') {
        $newPermit = [
            'SEDAN'          => max(0, (int) ($_POST['permit_sedan']  ?? 0)),
            'SUV'            => max(0, (int) ($_POST['permit_suv']    ?? 0)),
            'INNOVA'         => max(0, (int) ($_POST['permit_innova'] ?? 0)),
            'CRYSTA'         => max(0, (int) ($_POST['permit_crysta'] ?? 0)),
            'andhra_premium' => max(0, (int) ($_POST['permit_andhra'] ?? 0)),
        ];
        if (is_file($publicConfigPath)) {
            $cfg = json_decode(file_get_contents($publicConfigPath), true) ?: [];
            $cfg['permitCharges'] = $newPermit;
            file_put_contents($publicConfigPath, json_encode($cfg, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        }
        $permitCharges = array_merge($permitDefaults, $newPermit);
        $msg = "Permit charges successfully updated.";
    }
}

// Reload from file
$tariffs = get_json_tariffs();
foreach ($tariffs as &$t) {
    $t['driver_allowance'] = $t['driver_beta'] ?? 0;
}
unset($t);

// Sort list of tariffs
usort($tariffs, function ($a, $b) {
    if ((int)$a['is_dynamic'] !== (int)$b['is_dynamic']) {
        return (int)$a['is_dynamic'] <=> (int)$b['is_dynamic'];
    }
    
    $vOrder = ['SEDAN' => 1, 'SUV' => 2, 'INNOVA' => 3, 'CRYSTA' => 4, 'COMFORT_SEDAN' => 5, 'ELITE_SEDAN' => 6];
    $vA = $vOrder[strtoupper($a['vehicle_type'])] ?? 99;
    $vB = $vOrder[strtoupper($b['vehicle_type'])] ?? 99;
    if ($vA !== $vB) {
        return $vA <=> $vB;
    }
    
    return strcmp(strtolower($a['trip_type']), strtolower($b['trip_type']));
});

function dropcars_tariff_status(array $row): array {
    $from  = !empty($row['effective_from'])  ? strtotime($row['effective_from'])  : null;
    $until = !empty($row['effective_until']) ? strtotime($row['effective_until']) : null;
    $now   = time();
    if ($from === null && $until === null) {
        return ['label' => 'Always Active', 'color' => '#10b981', 'bg' => '#ecfdf5', 'icon' => 'fa-infinity', 'hint' => 'Always effective'];
    }
    if ($from !== null && $from > $now) {
        return ['label' => 'Scheduled', 'color' => '#3b82f6', 'bg' => '#eff6ff', 'icon' => 'fa-clock', 'hint' => 'Starts ' . date('d M Y, h:i A', $from)];
    }
    if ($until !== null && $until < $now) {
        return ['label' => 'Expired', 'color' => '#ef4444', 'bg' => '#fef2f2', 'icon' => 'fa-circle-xmark', 'hint' => 'Expired ' . date('d M Y, h:i A', $until)];
    }
    return ['label' => 'Live Now', 'color' => '#10b981', 'bg' => '#ecfdf5', 'icon' => 'fa-bolt', 'hint' => 'Currently active'];
}

function dropcars_tariff_window_text(array $row): string {
    $from  = !empty($row['effective_from'])  ? date('d M h:i A', strtotime($row['effective_from']))  : '';
    $until = !empty($row['effective_until']) ? date('d M h:i A', strtotime($row['effective_until'])) : '';
    if ($from === '' && $until === '') return '<small style="color:#94a3b8;">No schedule restriction</small>';
    if ($from !== '' && $until !== '') return htmlspecialchars($from) . ' &rarr; ' . htmlspecialchars($until);
    if ($from !== '')                  return 'From ' . htmlspecialchars($from);
    return 'Until ' . htmlspecialchars($until);
}
?>

<!-- Custom Premium CSS Tokens & Elements -->
<style>
:root {
    --glass-bg: rgba(255, 255, 255, 0.7);
    --glass-border: 1px solid rgba(226, 232, 240, 0.8);
    --primary-blue: #1e3a8a;
    --accent-gold: #f59e0b;
    --card-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
    --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.t-container {
    display: grid;
    grid-template-columns: 1fr 340px;
    gap: 1.5rem;
    margin-top: 1rem;
}

.t-tabs {
    display: flex;
    gap: 0.5rem;
    background: #f1f5f9;
    padding: 0.25rem;
    border-radius: 12px;
    margin-bottom: 1.25rem;
    width: max-content;
}

.t-tab-btn {
    border: none;
    background: none;
    padding: 0.6rem 1.25rem;
    font-size: 0.85rem;
    font-weight: 700;
    color: #64748b;
    border-radius: 9px;
    cursor: pointer;
    transition: var(--transition);
}

.t-tab-btn.active {
    background: #ffffff;
    color: #1e293b;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
}

.t-card {
    background: #ffffff;
    border-radius: 16px;
    border: var(--glass-border);
    box-shadow: var(--card-shadow);
    padding: 1.25rem;
    margin-bottom: 1.25rem;
    transition: var(--transition);
}

.t-card:hover {
    box-shadow: 0 20px 25px -5px rgba(0,0,0,0.07);
}

/* Glassmorphism sidebar live preview */
.t-sidebar {
    position: sticky;
    top: 1rem;
    height: max-content;
}

.live-preview-box {
    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
    border-radius: 20px;
    padding: 1.5rem;
    color: #ffffff;
    box-shadow: 0 20px 25px -5px rgba(30,41,59,0.25);
    border: 1px solid rgba(255,255,255,0.05);
    position: relative;
    overflow: hidden;
}

.live-preview-box::before {
    content: '';
    position: absolute;
    top: -50px;
    right: -50px;
    width: 150px;
    height: 150px;
    background: radial-gradient(circle, rgba(245,158,11,0.15) 0%, rgba(245,158,11,0) 70%);
    pointer-events: none;
}

.lp-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 99px;
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
}

.lp-badge--dynamic {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.3);
}

.lp-badge--normal {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.3);
}

.lp-reason-banner {
    background: rgba(245, 158, 11, 0.1);
    border-left: 3px solid #f59e0b;
    padding: 8px 12px;
    border-radius: 0 8px 8px 0;
    font-size: 0.75rem;
    color: #fcd34d;
    margin-top: 10px;
    display: flex;
    align-items: center;
    gap: 6px;
}

.search-bar {
    padding: 0.6rem 1rem;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    font-size: 0.85rem;
    width: 260px;
    transition: var(--transition);
}

.search-bar:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59,130,246,0.1);
}

.filter-wrap {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
}

    @media (max-width: 1024px) {
        .t-container {
            grid-template-columns: 1fr;
        }
        .t-sidebar {
            position: static;
        }
    }
    @media (max-width: 600px) {
        .tariffs-header__actions {
            width: 100% !important;
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 0.5rem !important;
        }
        .tariffs-header__actions form,
        .tariffs-header__actions button,
        .tariffs-header__actions form button {
            width: 100% !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
        }
        .t-tabs {
            width: 100% !important;
            display: flex !important;
        }
        .t-tab-btn {
            flex: 1 !important;
            text-align: center !important;
            padding: 0.6rem 0.5rem !important;
            font-size: 0.78rem !important;
        }
        .filter-wrap {
            flex-direction: column !important;
            align-items: stretch !important;
        }
        .search-bar {
            width: 100% !important;
        }
    }
</style>

<!-- Header & Title controls -->
<div class="page-header tariffs-header" style="margin-bottom: 1rem; background: #fff; padding: 0.75rem 1rem; border-radius: 14px; border: 1px solid #f1f5f9; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem;">
        <div style="display: flex; align-items: center; gap: 0.65rem;">
            <div style="width: 36px; height: 36px; flex-shrink: 0; background: #fffbeb; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #d97706;">
                <i class="fa-solid fa-tags" style="font-size: 1rem;"></i>
            </div>
            <div>
                <h1 style="font-size: 1.2rem; font-weight: 800; color: #1e293b; margin: 0;">Tariffs Control Center</h1>
                <p style="margin: 0; font-size: 0.75rem; color: #94a3b8;">Set default standard rates &amp; dynamic peak hike schedules</p>
            </div>
        </div>
        <div class="tariffs-header__actions" style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
            <form action="tariffs" method="POST" style="margin: 0;">
                <input type="hidden" name="action" value="toggle_dynamic">
                <input type="hidden" name="enabled" value="<?php echo !empty($settings['enable_dynamic_pricing']) ? '0' : '1'; ?>">
                <button type="submit" class="btn <?php echo !empty($settings['enable_dynamic_pricing']) ? 'btn-success' : 'btn-secondary'; ?>" style="height: 34px; padding: 0 0.85rem; font-size: 0.82rem; font-weight: 700; white-space: nowrap; display: flex; align-items: center; gap: 0.4rem;">
                    <i class="fa <?php echo !empty($settings['enable_dynamic_pricing']) ? 'fa-toggle-on' : 'fa-toggle-off'; ?>"></i>
                    <span>Dynamic Pricing: <?php echo !empty($settings['enable_dynamic_pricing']) ? 'ENABLED' : 'DISABLED'; ?></span>
                </button>
            </form>
            <form action="tariffs" method="POST" onsubmit="return confirm('Reset all pricing to standard system defaults?')" style="margin: 0;">
                <input type="hidden" name="action" value="import_defaults">
                <button type="submit" class="btn btn-secondary" style="height: 34px; padding: 0 0.85rem; font-size: 0.82rem; white-space: nowrap; display: flex; align-items: center; gap: 0.4rem;"><i class="fa fa-refresh"></i> <span>Restore Defaults</span></button>
            </form>
            <button class="btn btn-primary" onclick="openAddModal()" style="height: 34px; padding: 0 0.85rem; font-size: 0.82rem; white-space: nowrap; display: flex; align-items: center; gap: 0.4rem;"><i class="fa fa-plus"></i> <span>Add Pricing Tier</span></button>
        </div>
    </div>
</div>

<?php if ($msg): ?>
    <div class="alert alert-success" style="margin-bottom: 1.25rem; border-radius: 12px; font-weight: 600;">
        <i class="fa-solid fa-circle-check"></i> <?php echo $msg; ?>
    </div>
<?php endif; ?>

<!-- Main Grid Layout -->
<div class="t-container">
    <!-- Left column: Tabs, tables, forms -->
    <div style="min-width: 0;">
        <div class="filter-wrap">
            <div class="t-tabs">
                <button type="button" class="t-tab-btn active" id="tab-btn-normal" onclick="switchMainTab('normal')">Standard / Default Fares</button>
                <button type="button" class="t-tab-btn" id="tab-btn-dynamic" onclick="switchMainTab('dynamic')">Dynamic / Peak Pricing</button>
            </div>
            <input type="text" id="t-search" class="search-bar" placeholder="Search by vehicle class..." oninput="handleSearch()">
        </div>

        <!-- Tariff Table / Card Grid -->
        <div class="card" style="padding: 0; border: 1px solid #eee; overflow: hidden;">
            <div class="table-responsive" style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
                <table class="custom-table" id="tariffs-table">
                    <thead>
                        <tr>
                            <th style="padding-left: 1.5rem;">Trip Category</th>
                            <th>Vehicle Class</th>
                            <th>Rate (₹ / km)</th>
                            <th>Driver Allowance</th>
                            <th>Reasoning / Schedule</th>
                            <th style="text-align: right; padding-right: 1.5rem;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php 
                        $normalCount = 0;
                        $dynamicCount = 0;
                        foreach ($tariffs as $t): 
                            $isDyn = !empty($t['is_dynamic']);
                            if ($isDyn) $dynamicCount++; else $normalCount++;
                        ?>
                            <tr class="tariff-row <?php echo $isDyn ? 'row-dynamic' : 'row-normal'; ?>" data-vehicle="<?php echo htmlspecialchars($t['vehicle_type']); ?>" style="<?php echo $isDyn ? 'display: none;' : ''; ?>">
                                <td style="padding-left: 1.5rem;">
                                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                                        <div style="width: 36px; height: 36px; background: <?php echo $t['trip_type'] === 'oneway' ? '#eef2ff' : '#fff7ed'; ?>; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: <?php echo $t['trip_type'] === 'oneway' ? '#4338ca' : '#c2410c'; ?>;">
                                            <?php if ($t['trip_type'] === 'oneway'): ?>
                                                <i class="fa-solid fa-arrow-right"></i>
                                            <?php else: ?>
                                                <i class="fa-solid fa-arrows-rotate"></i>
                                            <?php endif; ?>
                                        </div>
                                        <div>
                                            <strong style="font-size: 0.9rem; text-transform: capitalize; color: #1e293b;"><?php echo $t['trip_type'] === 'oneway' ? 'One Way' : 'Round Trip'; ?></strong>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <span class="badge bg-secondary" style="font-size: 0.75rem; padding: 4px 10px; font-weight: 700;"><?php echo $t['vehicle_type']; ?></span>
                                    <?php if ($t['vehicle_model']): ?>
                                        <div style="font-size: 0.7rem; color: #64748b; margin-top: 2px;"><?php echo htmlspecialchars($t['vehicle_model']); ?></div>
                                    <?php endif; ?>
                                </td>
                                <td>
                                    <?php if ($isDyn && !empty($t['strike_on'])): ?>
                                        <span style="text-decoration: line-through; color: #94a3b8; font-size: 0.8rem; margin-right: 5px;">₹[strike]</span>
                                    <?php elseif ($t['old_per_km_rate'] > 0): ?>
                                        <span style="text-decoration: line-through; color: #94a3b8; font-size: 0.8rem; margin-right: 5px;">₹<?php echo number_format($t['old_per_km_rate'], 1); ?></span>
                                    <?php endif; ?>
                                    <span style="font-weight: 800; color: #1e3a8a; font-size: 0.95rem;">₹<?php echo number_format($t['per_km_rate'], 2); ?></span>
                                </td>
                                <td>
                                    <?php if ($isDyn && !empty($t['strike_on'])): ?>
                                        <span style="text-decoration: line-through; color: #94a3b8; font-size: 0.8rem; margin-right: 5px;">₹[strike]</span>
                                    <?php elseif ($t['old_driver_beta'] > 0): ?>
                                        <span style="text-decoration: line-through; color: #94a3b8; font-size: 0.8rem; margin-right: 5px;">₹<?php echo number_format($t['old_driver_beta'], 0); ?></span>
                                    <?php endif; ?>
                                    <span style="font-weight: 600; color: #334155;">₹<?php echo number_format($t['driver_allowance'], 0); ?></span><small style="color: #64748b;"> / day</small>
                                </td>
                                <td>
                                    <?php if ($isDyn): ?>
                                        <?php $s = dropcars_tariff_status($t); ?>
                                        <div title="<?php echo htmlspecialchars($s['hint']); ?>" style="display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:999px;background:<?php echo $s['bg']; ?>;color:<?php echo $s['color']; ?>;font-size:0.7rem;font-weight:800;letter-spacing:0.02em;">
                                            <i class="fa-solid <?php echo $s['icon']; ?>"></i> <?php echo $s['label']; ?>
                                        </div>
                                        <?php if ($t['reasoning_note']): ?>
                                            <div style="font-size: 0.72rem; color: #b45309; font-weight: 700; margin-top: 4px;"><i class="fa-solid fa-triangle-exclamation"></i> <?php echo htmlspecialchars($t['reasoning_note']); ?></div>
                                        <?php endif; ?>
                                        <div style="margin-top:4px;font-size:0.68rem;color:#64748b;line-height:1.3;">
                                            <?php echo dropcars_tariff_window_text($t); ?>
                                        </div>
                                    <?php else: ?>
                                        <span style="color: #10b981; font-weight: 700; font-size: 0.75rem;"><i class="fa-solid fa-infinity"></i> Default Site Tariff</span>
                                    <?php endif; ?>
                                </td>
                                <td style="text-align: right; padding-right: 1.5rem;">
                                    <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                                        <button class="btn-action" onclick='editTariff(<?php echo json_encode($t); ?>)' style="width: 32px; height: 32px; padding: 0;" title="Edit pricing settings">
                                            <i class="fa fa-pen-to-square" style="font-size: 0.85rem; color: #475569;"></i>
                                        </button>
                                        <form action="tariffs" method="POST" onsubmit="return confirm('Permanently remove this pricing tier?')" style="margin: 0;">
                                            <input type="hidden" name="action" value="delete">
                                            <input type="hidden" name="id" value="<?php echo $t['id']; ?>">
                                            <button type="submit" class="btn-action" style="width: 32px; height: 32px; padding: 0; background: #fff5f5;" title="Delete tier">
                                                <i class="fa fa-trash-alt" style="font-size: 0.85rem; color: #ef4444;"></i>
                                            </button>
                                        </form>
                                    </div>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                        
                        <!-- Empty States -->
                        <tr class="normal-empty-row" style="<?php echo $normalCount > 0 ? 'display: none;' : ''; ?>">
                            <td colspan="6" style="text-align: center; padding: 4rem 2rem;">
                                <i class="fa-solid fa-tags" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 1rem; display: block;"></i>
                                <span style="color: #64748b; font-weight: 600;">No standard default tariffs configured. Click 'Restore Defaults' above.</span>
                            </td>
                        </tr>
                        <tr class="dynamic-empty-row" style="display: none;">
                            <td colspan="6" style="text-align: center; padding: 4rem 2rem;">
                                <i class="fa-solid fa-bolt" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 1rem; display: block;"></i>
                                <span style="color: #64748b; font-weight: 600;">No dynamic peak pricing surcharges defined. Set one up to manage hikes!</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Permit State Tax Section -->
        <div class="card" style="padding: 1.25rem 1.5rem; border: 1px solid #fde68a; border-left: 4px solid #f59e0b; border-radius: 14px; margin-top: 1.25rem;">
            <div style="display: flex; align-items: center; gap: 0.65rem; margin-bottom: 0.35rem;">
                <div style="width: 36px; height: 36px; flex-shrink: 0; background: #fffbeb; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #d97706;">
                    <i class="fa-solid fa-building-flag" style="font-size: 1rem;"></i>
                </div>
                <div>
                    <h3 style="font-size: 1.05rem; font-weight: 800; color: #1e293b; margin: 0;">Permit &amp; Inter-State Entry Charges</h3>
                    <p style="margin: 0; font-size: 0.75rem; color: #94a3b8;">Per-vehicle state permit tax used in inclusive fares</p>
                </div>
            </div>
            <form action="tariffs" method="POST" style="margin: 0.85rem 0 0;">
                <input type="hidden" name="action" value="save_permit_charges">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem;">
                    <?php
                    $permitFields = [
                        'permit_sedan'  => ['SEDAN', $permitCharges['SEDAN']],
                        'permit_suv'    => ['SUV', $permitCharges['SUV']],
                        'permit_innova' => ['INNOVA', $permitCharges['INNOVA']],
                        'permit_crysta' => ['CRYSTA', $permitCharges['CRYSTA']],
                    ];
                    foreach ($permitFields as $name => $f): ?>
                        <div class="form-group" style="margin: 0;">
                            <label class="form-label" style="font-size: 0.78rem; font-weight: 700; color: #475569;"><?php echo htmlspecialchars($f[0]); ?> Tax (₹)</label>
                            <div style="position: relative;">
                                <span style="position: absolute; left: 0.7rem; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 0.8rem;">₹</span>
                                <input type="number" min="0" name="<?php echo $name; ?>" class="form-control" style="padding-left: 1.5rem;" value="<?php echo (int) $f[1]; ?>" required>
                            </div>
                        </div>
                    <?php endforeach; ?>
                    <div class="form-group" style="margin: 0;">
                        <label class="form-label" style="font-size: 0.78rem; font-weight: 700; color: #475569;">Andhra Premium (₹)</label>
                        <div style="position: relative;">
                            <span style="position: absolute; left: 0.7rem; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 0.8rem;">₹</span>
                            <input type="number" min="0" name="permit_andhra" class="form-control" style="padding-left: 1.5rem;" value="<?php echo (int) $permitCharges['andhra_premium']; ?>" required>
                        </div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem; margin-top: 1rem;">
                    <p style="margin: 0; font-size: 0.72rem; color: #94a3b8; line-height: 1.45; max-width: 560px;">
                        <i class="fa-solid fa-circle-info"></i> Applied to inclusive booking estimates for cross-border trips. Special Andhra premium triggers for Innova/Crysta class crossings.
                    </p>
                    <button type="submit" class="btn btn-primary" style="height: 36px; padding: 0 1rem; font-size: 0.85rem; background: #f59e0b; color: #fff; border: none; font-weight: 700; display: flex; align-items: center; gap: 0.4rem; border-radius: 8px;">
                        <i class="fa-solid fa-save"></i> Save State Permit Fares
                    </button>
                </div>
            </form>
        </div>
    </div>

    <!-- Right Column: Live Premium Customer Preview Widget -->
    <div class="t-sidebar">
        <div class="live-preview-box">
            <h3 style="margin: 0 0 0.25rem; font-weight: 800; font-size: 1.05rem; display: flex; align-items: center; gap: 6px;">
                <i class="fa-solid fa-desktop" style="color: #fbbf24;"></i> Live Customer Card
            </h3>
            <p style="margin: 0 0 1rem; font-size: 0.72rem; color: #94a3b8;">Real-time rendering of what public users will see on your website</p>

            <div style="background: #1e293b; border-radius: 14px; border: 1px solid rgba(255,255,255,0.08); padding: 1.25rem; text-align: center;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                    <span class="lp-badge lp-badge--normal" id="lp-badge">Default Site</span>
                    <span style="font-size: 0.68rem; color: #94a3b8; font-weight: 700; text-transform: uppercase;" id="lp-trip-type">ONE WAY TRIP</span>
                </div>
                
                <h4 style="margin: 0; font-size: 1.15rem; font-weight: 800; color: #f8fafc;" id="lp-vehicle">SEDAN CLASS</h4>
                <p style="margin: 2px 0 0.75rem; font-size: 0.7rem; color: #64748b;" id="lp-model">Swift Dzire / Toyota Etios</p>
                
                <div style="margin: 1rem 0; display: flex; justify-content: center; align-items: baseline; gap: 6px;">
                    <span style="text-decoration: line-through; color: #64748b; font-size: 1.1rem; display: none;" id="lp-strike-price">₹16.00</span>
                    <span style="font-size: 2.1rem; font-weight: 800; color: #fbbf24; line-height: 1;" id="lp-price">₹14.00</span>
                    <span style="font-size: 0.78rem; color: #94a3b8;">/ km</span>
                </div>

                <div class="lp-reason-banner" id="lp-reason" style="display: none;">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <span id="lp-reason-text">Weekend peak surge</span>
                </div>

                <ul style="list-style: none; padding: 0.75rem 0; border-top: 1px solid rgba(255,255,255,0.06); border-bottom: 1px solid rgba(255,255,255,0.06); margin: 0.75rem 0 1rem; text-align: left; font-size: 0.78rem; color: #94a3b8; display: grid; gap: 6px;">
                    <li><i class="fa-solid fa-users" style="color: #fbbf24; margin-right: 6px; width: 14px;"></i> <span id="lp-seats">4+1</span> Seats Included</li>
                    <li><i class="fa-solid fa-suitcase" style="color: #fbbf24; margin-right: 6px; width: 14px;"></i> <span id="lp-bags">3</span> Luggage Bags</li>
                    <li><i class="fa-solid fa-snowflake" style="color: #fbbf24; margin-right: 6px; width: 14px;"></i> <span id="lp-ac">AC Cabin</span></li>
                    <li><i class="fa-solid fa-user-check" style="color: #fbbf24; margin-right: 6px; width: 14px;"></i> Driver Allowance: <strong style="color: #f8fafc;" id="lp-bata">₹400</strong>/day</li>
                </ul>

                <button type="button" class="btn btn-primary" style="width: 100%; border-radius: 8px; font-size: 0.8rem; font-weight: 800; background: #fbbf24; color: #0f172a; border: none; padding: 0.65rem 0;">Book Ride Now</button>
            </div>
        </div>
    </div>
</div>

<!-- Add / Edit Modal -->
<div id="tariffModal" class="modal" style="display: none; position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:2000; align-items:center; justify-content:center; backdrop-filter: blur(5px);">
    <div class="card" style="width: 100%; max-width: 500px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); border-radius: 20px; border: var(--glass-border); padding: 1.5rem; overflow-y: auto; max-height: 94vh;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; padding-bottom: 0.5rem; border-bottom: 1px solid #f1f5f9;">
            <h3 id="modalTitle" style="margin: 0; font-weight: 800; font-size: 1.2rem; color: #1e293b;">Add Pricing Tier</h3>
            <button type="button" onclick="closeModal()" style="background: none; border: none; font-size: 1.5rem; color: #94a3b8; cursor: pointer; line-height: 1;">&times;</button>
        </div>
        
        <form action="tariffs" method="POST" id="tariffForm">
            <input type="hidden" name="action" value="add_or_update">
            <input type="hidden" name="id" id="t_id">

            <!-- Pricing Mode selection -->
            <div class="form-group" style="background: #f8fafc; padding: 8px 12px; border-radius: 10px; border: 1px solid #e2e8f0; margin-bottom: 1rem;">
                <label class="form-label" style="font-size: 0.8rem; font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">Pricing Model Type</label>
                <div style="display: flex; gap: 1rem;">
                    <label style="font-size: 0.85rem; font-weight: 600; color: #1e293b; display: flex; align-items: center; gap: 4px; cursor: pointer;">
                        <input type="radio" name="is_dynamic" value="0" id="t_mode_normal" checked onchange="toggleFormMode(0)"> Default Standard Tariff
                    </label>
                    <label style="font-size: 0.85rem; font-weight: 600; color: #b45309; display: flex; align-items: center; gap: 4px; cursor: pointer;">
                        <input type="radio" name="is_dynamic" value="1" id="t_mode_dynamic" onchange="toggleFormMode(1)"> Dynamic (Peak/Promo) Hike
                    </label>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.75rem;">
                <div class="form-group" style="margin: 0;">
                    <label class="form-label" style="font-size: 0.8rem;">Vehicle Class</label>
                    <select name="vehicle_type" id="t_type" class="form-control" required onchange="triggerLpUpdate()">
                        <option value="SEDAN">SEDAN</option>
                        <option value="COMFORT_SEDAN">COMFORT SEDAN</option>
                        <option value="ELITE_SEDAN">ELITE SEDAN</option>
                        <option value="SUV">SUV</option>
                        <option value="INNOVA">INNOVA</option>
                        <option value="CRYSTA">CRYSTA</option>
                    </select>
                </div>
                <div class="form-group" style="margin: 0;">
                    <label class="form-label" style="font-size: 0.8rem;">Trip Category</label>
                    <select name="trip_type" id="t_trip" class="form-control" required onchange="triggerLpUpdate()">
                        <option value="oneway">One Way Drop</option>
                        <option value="round">Outstation Round Trip</option>
                    </select>
                </div>
            </div>
            
            <!-- Standard / Live Offer Fare -->
            <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:12px; padding:0.85rem; margin-bottom:0.75rem;">
                <div style="font-size:0.72rem; font-weight:800; color:#065f46; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.5rem; display: flex; align-items: center; gap: 4px;">
                    <i class="fa-solid fa-tag"></i> Active / Offer Price <small style="text-transform: none; font-weight: 500;">(Shown to customers)</small>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.60rem;">
                    <div class="form-group" style="margin: 0;">
                        <label class="form-label" style="font-size: 0.78rem; color: #047857;">Per KM Rate (₹)</label>
                        <div style="position: relative;">
                            <span style="position: absolute; left: 0.7rem; top: 50%; transform: translateY(-50%); color: #059669; font-size: 0.8rem;">₹</span>
                            <input type="number" step="0.01" name="per_km_rate" id="t_rate" class="form-control" style="padding-left: 1.5rem; border-color: #a7f3d0;" placeholder="0.00" required oninput="triggerLpUpdate()">
                        </div>
                    </div>
                    <div class="form-group" style="margin: 0;">
                        <label class="form-label" style="font-size: 0.78rem; color: #047857;">Driver Allowance (₹)</label>
                        <input type="number" name="driver_beta" id="t_beta" class="form-control" style="border-color: #a7f3d0;" placeholder="0" required oninput="triggerLpUpdate()">
                    </div>
                </div>
            </div>

            <!-- Dynamic Settings: Strike / Notes / Schedule (renders conditionally inside modal) -->
            <div id="dynamic-fields-block" style="display: none; background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 0.85rem; margin-bottom: 0.75rem;">
                <div style="font-size:0.72rem; font-weight:800; color:#b45309; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.6rem; display: flex; align-items: center; gap: 4px;">
                    <i class="fa-solid fa-bolt"></i> Peak Hike &amp; Strikethrough Logic
                </div>

                <div class="form-group" style="display: flex; align-items: center; gap: 8px; margin-bottom: 0.75rem;">
                    <input type="checkbox" name="strike_on" id="t_strike_on" style="width: 16px; height: 16px; cursor: pointer;" onchange="triggerLpUpdate()">
                    <label for="t_strike_on" style="font-size: 0.85rem; font-weight: 700; color: #78350f; cursor: pointer; margin: 0;">
                        Auto-Strike Default Rate &amp; Highlight Hike
                    </label>
                </div>

                <div class="form-group" style="margin-bottom: 0.75rem;">
                    <label class="form-label" style="font-size: 0.78rem; color: #78350f;">Reasoning Note <small style="color: #b45309;">(Told transparently to customers)</small></label>
                    <input type="text" name="reasoning_note" id="t_reasoning" class="form-control" style="border-color: #fcd34d;" placeholder="e.g. Festival Rush / Peak Hours" oninput="triggerLpUpdate()">
                </div>

                <div style="font-size:0.72rem; font-weight:800; color:#1e3a8a; text-transform:uppercase; letter-spacing:0.05em; margin: 0.85rem 0 0.4rem; display: flex; align-items: center; gap: 4px;">
                    <i class="fa-solid fa-calendar-alt"></i> Effective Schedule Window
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 0.6rem;">
                    <div class="form-group" style="margin: 0; flex: 1 1 190px; min-width: 0;">
                        <label class="form-label" style="font-size: 0.74rem;">From Date/Time</label>
                        <input type="datetime-local" name="effective_from" id="t_eff_from" class="form-control">
                    </div>
                    <div class="form-group" style="margin: 0; flex: 1 1 190px; min-width: 0;">
                        <label class="form-label" style="font-size: 0.74rem;">Until Date/Time</label>
                        <input type="datetime-local" name="effective_until" id="t_eff_until" class="form-control">
                    </div>
                </div>
                
                <div style="display: flex; gap: 0.35rem; margin-top: 0.55rem; flex-wrap: wrap;">
                    <button type="button" class="btn-chip" data-preset="clear" style="padding:3px 9px;border:1px solid #cbd5e1;background:#fff;border-radius:999px;font-size:0.7rem;font-weight:700;color:#475569;cursor:pointer;">Clear</button>
                    <button type="button" class="btn-chip" data-preset="weekend" style="padding:3px 9px;border:1px solid #cbd5e1;background:#fff;border-radius:999px;font-size:0.7rem;font-weight:700;color:#475569;cursor:pointer;">This weekend</button>
                    <button type="button" class="btn-chip" data-preset="month" style="padding:3px 9px;border:1px solid #cbd5e1;background:#fff;border-radius:999px;font-size:0.7rem;font-weight:700;color:#475569;cursor:pointer;">Next 30 days</button>
                </div>
            </div>

            <!-- Legacy Strike Fares (for manual override) -->
            <div id="manual-strike-block" style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:12px; padding:0.85rem; margin-bottom:0.75rem;">
                <div style="font-size:0.72rem; font-weight:800; color:#1e3a8a; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.5rem; display: flex; align-items: center; gap: 4px;">
                    <i class="fa-solid fa-strikethrough"></i> Strikethrough Price <small style="text-transform: none; font-weight: 500; color: #475569;">(Optional overrides)</small>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.60rem;">
                    <div class="form-group" style="margin: 0;">
                        <label class="form-label" style="font-size: 0.78rem; color: #1e40af;">Original KM Rate (₹)</label>
                        <input type="number" name="old_per_km_rate" id="t_old_rate" class="form-control" step="0.1" style="border-color: #bfdbfe;" placeholder="e.g. 16" oninput="triggerLpUpdate()">
                    </div>
                    <div class="form-group" style="margin: 0;">
                        <label class="form-label" style="font-size: 0.78rem; color: #1e40af;">Original Allowance (₹)</label>
                        <input type="number" name="old_driver_beta" id="t_old_beta" class="form-control" step="1" style="border-color: #bfdbfe;" placeholder="e.g. 500" oninput="triggerLpUpdate()">
                    </div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.75rem;">
                <div class="form-group" style="margin: 0;">
                    <label class="form-label" style="font-size: 0.8rem;">Passengers Capacity</label>
                    <input type="number" name="passengers" id="t_pass" class="form-control" value="4" required oninput="triggerLpUpdate()">
                </div>
                <div class="form-group" style="margin: 0;">
                    <label class="form-label" style="font-size: 0.8rem;">Luggage Capacity</label>
                    <input type="number" name="luggage" id="t_lug" class="form-control" value="3" required oninput="triggerLpUpdate()">
                </div>
            </div>

            <div class="form-group" style="margin-bottom: 0.75rem;">
                <label class="form-label" style="font-size: 0.8rem;">Vehicle Model / Assured Selection</label>
                <input type="text" name="vehicle_model" id="t_model" class="form-control" placeholder="e.g. Swift Dzire / Toyota Etios" oninput="triggerLpUpdate()">
            </div>

            <div class="form-group" style="display: flex; align-items: center; gap: 8px; margin-top: 0.75rem;">
                <input type="checkbox" name="is_ac" id="t_ac" checked style="width: 16px; height: 16px; cursor: pointer;" onchange="triggerLpUpdate()">
                <label for="t_ac" style="font-size: 0.85rem; font-weight: 700; color: #1e293b; cursor: pointer; margin: 0;">AC Cabin Enabled</label>
            </div>
            
            <div style="margin-top: 1.5rem; display: flex; gap: 0.75rem; border-top: 1px solid #f1f5f9; padding-top: 1rem;">
                <button type="submit" class="btn btn-primary" id="modalBtn" style="flex: 1; border-radius: 8px;">Save Pricing Sheet</button>
                <button type="button" class="btn btn-secondary" onclick="closeModal()" style="border-radius: 8px;">Dismiss</button>
            </div>
        </form>
    </div>
</div>

<script>
var activeMainTab = 'normal';

// Standard normal default rates helper (to calculate strikethroughs dynamically in preview)
var defaultRates = {
    'SEDAN::oneway': 14.00, 'SEDAN::round': 13.00,
    'SUV::oneway': 19.00, 'SUV::round': 18.00,
    'INNOVA::oneway': 20.00, 'INNOVA::round': 19.00,
    'CRYSTA::oneway': 23.00, 'CRYSTA::round': 22.00,
    'COMFORT_SEDAN::oneway': 15.00, 'COMFORT_SEDAN::round': 14.00,
    'ELITE_SEDAN::oneway': 16.00, 'ELITE_SEDAN::round': 15.00
};
var defaultBatas = {
    'SEDAN::oneway': 400, 'SEDAN::round': 400,
    'SUV::oneway': 400, 'SUV::round': 400,
    'INNOVA::oneway': 500, 'INNOVA::round': 500,
    'CRYSTA::oneway': 500, 'CRYSTA::round': 600,
    'COMFORT_SEDAN::oneway': 400, 'COMFORT_SEDAN::round': 400,
    'ELITE_SEDAN::oneway': 400, 'ELITE_SEDAN::round': 400
};

// Switch Tabs between Standard Fares & Dynamic Pricing
function switchMainTab(mode) {
    activeMainTab = mode;
    document.getElementById('tab-btn-normal').classList.toggle('active', mode === 'normal');
    document.getElementById('tab-btn-dynamic').classList.toggle('active', mode === 'dynamic');
    
    var rows = document.querySelectorAll('.tariff-row');
    var hasRows = false;
    
    rows.forEach(function(row) {
        var isDynamicRow = row.classList.contains('row-dynamic');
        var shouldShow = (mode === 'dynamic' && isDynamicRow) || (mode === 'normal' && !isDynamicRow);
        
        // Respect current search query
        var searchVal = document.getElementById('t-search').value.toLowerCase().trim();
        var vClass = row.getAttribute('data-vehicle').toLowerCase();
        if (searchVal && vClass.indexOf(searchVal) === -1) {
            shouldShow = false;
        }

        row.style.display = shouldShow ? '' : 'none';
        if (shouldShow) hasRows = true;
    });

    document.querySelector('.normal-empty-row').style.display = (mode === 'normal' && !hasRows) ? '' : 'none';
    document.querySelector('.dynamic-empty-row').style.display = (mode === 'dynamic' && !hasRows) ? '' : 'none';
    
    triggerLpUpdate();
}

function handleSearch() {
    switchMainTab(activeMainTab);
}

// Open modal for defining new pricing
function openAddModal() {
    document.getElementById('tariffModal').style.display = 'flex';
    document.getElementById('modalTitle').innerText = 'Add Pricing Tier';
    document.getElementById('t_id').value = '';
    document.getElementById('t_type').value = 'SEDAN';
    document.getElementById('t_trip').value = 'oneway';
    document.getElementById('t_rate').value = '';
    document.getElementById('t_beta').value = '';
    document.getElementById('t_old_rate').value = '';
    document.getElementById('t_old_beta').value = '';
    document.getElementById('t_pass').value = '4';
    document.getElementById('t_lug').value = '3';
    document.getElementById('t_model').value = '';
    document.getElementById('t_ac').checked = true;
    
    document.getElementById('t_mode_normal').checked = true;
    toggleFormMode(0);
    
    document.getElementById('t_strike_on').checked = false;
    document.getElementById('t_reasoning').value = '';
    document.getElementById('t_eff_from').value = '';
    document.getElementById('t_eff_until').value = '';
    
    document.getElementById('modalBtn').innerText = 'Add Pricing Tier';
    triggerLpUpdate();
}

function toggleFormMode(isDynamic) {
    document.getElementById('dynamic-fields-block').style.display = isDynamic ? 'block' : 'none';
    document.getElementById('manual-strike-block').style.display = isDynamic ? 'none' : 'block';
    triggerLpUpdate();
}

function closeModal() {
    document.getElementById('tariffModal').style.display = 'none';
}

function toLocalDt(s) {
    if (!s) return '';
    return String(s).slice(0, 16).replace(' ', 'T');
}

// Edit existing pricing
function editTariff(data) {
    document.getElementById('tariffModal').style.display = 'flex';
    document.getElementById('modalTitle').innerText = 'Modify Pricing Settings';
    document.getElementById('t_id').value = data.id;
    document.getElementById('t_type').value = data.vehicle_type;
    document.getElementById('t_trip').value = data.trip_type;
    document.getElementById('t_rate').value = data.per_km_rate;
    document.getElementById('t_beta').value = data.driver_beta;
    document.getElementById('t_old_rate').value = data.old_per_km_rate || '';
    document.getElementById('t_old_beta').value = data.old_driver_beta || '';
    document.getElementById('t_pass').value = data.passengers || 4;
    document.getElementById('t_lug').value = data.luggage || 3;
    document.getElementById('t_model').value = data.vehicle_model || '';
    document.getElementById('t_ac').checked = (parseInt(data.is_ac) === 1);
    
    var isDyn = parseInt(data.is_dynamic) === 1;
    if (isDyn) {
        document.getElementById('t_mode_dynamic').checked = true;
        toggleFormMode(1);
    } else {
        document.getElementById('t_mode_normal').checked = true;
        toggleFormMode(0);
    }

    document.getElementById('t_strike_on').checked = (parseInt(data.strike_on) === 1);
    document.getElementById('t_reasoning').value = data.reasoning_note || '';
    document.getElementById('t_eff_from').value = toLocalDt(data.effective_from);
    document.getElementById('t_eff_until').value = toLocalDt(data.effective_until);

    document.getElementById('modalBtn').innerText = 'Save Pricing Sheet';
    triggerLpUpdate();
}

// Reactive Customer Price Card live preview algorithm
function triggerLpUpdate() {
    var vClass = document.getElementById('t_type').value;
    var tType = document.getElementById('t_trip').value;
    var isDyn = document.getElementById('t_mode_dynamic').checked;
    
    var rateVal = parseFloat(document.getElementById('t_rate').value) || 0;
    var betaVal = parseInt(document.getElementById('t_beta').value) || 0;
    var oldRateVal = parseFloat(document.getElementById('t_old_rate').value) || 0;
    
    var passengers = document.getElementById('t_pass').value;
    var luggage = document.getElementById('t_lug').value;
    var model = document.getElementById('t_model').value || (vClass.charAt(0) + vClass.slice(1).toLowerCase());
    var isAc = document.getElementById('t_ac').checked;

    var badge = document.getElementById('lp-badge');
    var strikePrice = document.getElementById('lp-strike-price');
    var lpReason = document.getElementById('lp-reason');
    var lpReasonText = document.getElementById('lp-reason-text');

    // Update basic fields
    document.getElementById('lp-vehicle').textContent = vClass + ' CLASS';
    document.getElementById('lp-model').textContent = model;
    document.getElementById('lp-trip-type').textContent = tType === 'oneway' ? 'ONE WAY TRIP' : 'ROUND TRIP';
    document.getElementById('lp-price').textContent = '₹' + rateVal.toFixed(2);
    document.getElementById('lp-bata').textContent = '₹' + betaVal;
    document.getElementById('lp-seats').textContent = passengers + '+1';
    document.getElementById('lp-bags').textContent = luggage;
    document.getElementById('lp-ac').textContent = isAc ? 'AC Cabin' : 'Non-AC Cabin';

    if (isDyn) {
        badge.className = 'lp-badge lp-badge--dynamic';
        badge.textContent = '⚡ Peak Surcharge';
        
        var strikeOn = document.getElementById('t_strike_on').checked;
        var reason = document.getElementById('t_reasoning').value.trim();

        if (strikeOn) {
            var defaultKey = vClass + '::' + tType;
            var stdRate = defaultRates[defaultKey] || 14.00;
            strikePrice.style.display = 'inline';
            strikePrice.textContent = '₹' + stdRate.toFixed(2);
        } else {
            strikePrice.style.display = 'none';
        }

        if (reason) {
            lpReason.style.display = 'flex';
            lpReasonText.textContent = reason;
        } else {
            lpReason.style.display = 'none';
        }
    } else {
        badge.className = 'lp-badge lp-badge--normal';
        badge.textContent = 'Default Site';
        
        if (oldRateVal > 0) {
            strikePrice.style.display = 'inline';
            strikePrice.textContent = '₹' + oldRateVal.toFixed(2);
        } else {
            strikePrice.style.display = 'none';
        }
        
        lpReason.style.display = 'none';
    }
}

// Preset chips event listener
document.addEventListener('click', function (e) {
    var btn = e.target.closest('.btn-chip[data-preset]');
    if (!btn) return;
    var preset = btn.getAttribute('data-preset');
    var fromEl  = document.getElementById('t_eff_from');
    var untilEl = document.getElementById('t_eff_until');
    if (!fromEl || !untilEl) return;

    function pad(n) { return String(n).padStart(2, '0'); }
    function fmt(d) {
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
             + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    if (preset === 'clear') {
        fromEl.value = '';
        untilEl.value = '';
        return;
    }
    var now = new Date();
    if (preset === 'weekend') {
        var day = now.getDay();
        var daysToSat = (6 - day + 7) % 7;
        var sat = new Date(now); sat.setDate(now.getDate() + daysToSat); sat.setHours(0,0,0,0);
        var sun = new Date(sat); sun.setDate(sat.getDate() + 1); sun.setHours(23,59,0,0);
        fromEl.value  = fmt(sat);
        untilEl.value = fmt(sun);
        return;
    }
    if (preset === 'month') {
        var startOfDay = new Date(now); startOfDay.setHours(0,0,0,0);
        var in30 = new Date(startOfDay); in30.setDate(in30.getDate() + 30); in30.setHours(23,59,0,0);
        fromEl.value  = fmt(startOfDay);
        untilEl.value = fmt(in30);
        return;
    }
});

// Sync database row renderings to inject standard strikethrough preview labels
document.addEventListener('DOMContentLoaded', function() {
    var rows = document.querySelectorAll('.tariff-row.row-dynamic');
    rows.forEach(function(row) {
        var vClass = row.getAttribute('data-vehicle');
        var cellKM = row.querySelector('td:nth-child(3)');
        var cellBata = row.querySelector('td:nth-child(4)');
        
        var isOneway = row.querySelector('td:first-child').textContent.toLowerCase().indexOf('one way') !== -1;
        var tripKey = isOneway ? 'oneway' : 'round';
        var defaultKey = vClass + '::' + tripKey;
        
        var defaultRate = defaultRates[defaultKey] || 14.00;
        var defaultBata = defaultBatas[defaultKey] || 400;

        if (cellKM && cellKM.innerHTML.indexOf('[strike]') !== -1) {
            cellKM.innerHTML = cellKM.innerHTML.replace('[strike]', defaultRate.toFixed(1));
        }
        if (cellBata && cellBata.innerHTML.indexOf('[strike]') !== -1) {
            cellBata.innerHTML = cellBata.innerHTML.replace('[strike]', defaultBata);
        }
    });

    triggerLpUpdate();
});

// Close modal on escape
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});
</script>
