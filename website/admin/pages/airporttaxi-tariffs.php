<?php
/**
 * Admin: AirportTaxi.International tariff editor.
 *
 * Reads/writes data/airporttaxi-tariffs.json — the single source of truth
 * consumed by engine/airporttaxi-fare.php (server-side quotes + booking
 * confirmation) and engine/airporttaxi-home.php (public site display).
 *
 * Reuses the exact same admin auth/session/layout as every other page under
 * admin/pages/ — no separate login system. Dispatched automatically by
 * admin/index.php (any file dropped in admin/pages/ becomes /admin/{name}).
 */

$tariffPath = dirname(__DIR__, 2) . '/data/airporttaxi-tariffs.json';
$tariffs = is_file($tariffPath) ? (json_decode(file_get_contents($tariffPath), true) ?: []) : [];
$vehicles = array_keys($tariffs['vehicles'] ?? ['SEDAN' => [], 'SUV' => [], 'INNOVA' => [], 'CRYSTA' => [], 'HYCROSS' => []]);
$msg = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'save_airporttaxi_tariffs') {
    $tariffs['gstPercent'] = (float) ($_POST['gstPercent'] ?? $tariffs['gstPercent'] ?? 5);
    $tariffs['local']['includedKm'] = (float) ($_POST['local_includedKm'] ?? 20);
    $tariffs['outstation']['minKm'] = (float) ($_POST['outstation_minKm'] ?? 130);
    $tariffs['outstation']['tollPerKm'] = (float) ($_POST['outstation_tollPerKm'] ?? 2);
    $tariffs['outstation']['borderFeePerState'] = (float) ($_POST['outstation_borderFee'] ?? 500);

    foreach ($vehicles as $v) {
        $tariffs['local']['minPrice'][$v] = (float) ($_POST['local_min_' . $v] ?? $tariffs['local']['minPrice'][$v] ?? 0);
        $tariffs['local']['extraKmRate'][$v] = (float) ($_POST['local_extra_' . $v] ?? $tariffs['local']['extraKmRate'][$v] ?? 0);
        $tariffs['outstation']['perKmRate'][$v] = (float) ($_POST['outstation_rate_' . $v] ?? $tariffs['outstation']['perKmRate'][$v] ?? 0);
        $tariffs['outstation']['driverAllowance'][$v] = (float) ($_POST['outstation_allowance_' . $v] ?? $tariffs['outstation']['driverAllowance'][$v] ?? 0);
        $tariffs['rental']['hourlyRate'][$v] = (float) ($_POST['rental_hourly_' . $v] ?? $tariffs['rental']['hourlyRate'][$v] ?? 0);
        $tariffs['rental']['extraKmRate'][$v] = (float) ($_POST['rental_extra_' . $v] ?? $tariffs['rental']['extraKmRate'][$v] ?? 0);
    }

    $tariffs['updatedAt'] = date('Y-m-d');
    file_put_contents($tariffPath, json_encode($tariffs, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    $msg = 'AirportTaxi.International tariffs saved — the live site and every new quote will use these rates immediately.';
}
?>
<div style="max-width:1000px;">
    <h1 style="margin-bottom:0.25rem;">AirportTaxi.International — Tariffs</h1>
    <p style="color:#64748b;margin-top:0;">Edits here take effect immediately on airporttaxi.international (via <code>engine/airporttaxi-fare.php</code>) and on the next booking confirmation.</p>

    <?php if ($msg): ?>
        <div style="background:#e8f7ee;color:#16794a;padding:0.75rem 1rem;border-radius:8px;margin-bottom:1rem;font-weight:600;"><?php echo htmlspecialchars($msg); ?></div>
    <?php endif; ?>

    <form method="post">
        <input type="hidden" name="action" value="save_airporttaxi_tariffs" />

        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:1.25rem;margin-bottom:1.25rem;">
            <h3>Global</h3>
            <label style="display:block;max-width:180px;font-weight:700;font-size:0.85rem;">GST / Tax %
                <input type="number" step="0.5" name="gstPercent" value="<?php echo htmlspecialchars($tariffs['gstPercent'] ?? 5); ?>" style="width:100%;padding:0.5rem;margin-top:0.3rem;border:1px solid #e2e8f0;border-radius:6px;" />
            </label>
        </div>

        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:1.25rem;margin-bottom:1.25rem;">
            <h3>Local Airport Transfer <span style="font-weight:400;font-size:0.8rem;color:#64748b;">— base fare covers Included KM; beyond that, Extra KM rate applies; both + GST = all-inclusive</span></h3>
            <label style="display:block;max-width:180px;font-weight:700;font-size:0.85rem;margin-bottom:1rem;">Included KM
                <input type="number" name="local_includedKm" value="<?php echo htmlspecialchars($tariffs['local']['includedKm'] ?? 20); ?>" style="width:100%;padding:0.5rem;margin-top:0.3rem;border:1px solid #e2e8f0;border-radius:6px;" />
            </label>
            <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:0.75rem;">
                <?php foreach ($vehicles as $v): ?>
                <div>
                    <div style="font-weight:700;font-size:0.85rem;margin-bottom:0.3rem;"><?php echo htmlspecialchars($tariffs['vehicles'][$v]['label'] ?? $v); ?></div>
                    <label style="font-size:0.75rem;color:#64748b;">Base fare
                        <input type="number" name="local_min_<?php echo $v; ?>" value="<?php echo htmlspecialchars($tariffs['local']['minPrice'][$v] ?? 0); ?>" style="width:100%;padding:0.45rem;margin-top:0.2rem;border:1px solid #e2e8f0;border-radius:6px;" />
                    </label>
                    <label style="font-size:0.75rem;color:#64748b;">Extra KM
                        <input type="number" name="local_extra_<?php echo $v; ?>" value="<?php echo htmlspecialchars($tariffs['local']['extraKmRate'][$v] ?? 0); ?>" style="width:100%;padding:0.45rem;margin-top:0.2rem;border:1px solid #e2e8f0;border-radius:6px;" />
                    </label>
                </div>
                <?php endforeach; ?>
            </div>
        </div>

        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:1.25rem;margin-bottom:1.25rem;">
            <h3>Outstation Airport Transfer <span style="font-weight:400;font-size:0.8rem;color:#64748b;">— (rate/km × min KM) + driver allowance + toll(₹/km × billed KM) + border fee × borders crossed, then + GST</span></h3>
            <div style="display:flex;gap:1rem;max-width:640px;margin-bottom:1rem;">
                <label style="flex:1;font-weight:700;font-size:0.85rem;">Min KM Coverage
                    <input type="number" name="outstation_minKm" value="<?php echo htmlspecialchars($tariffs['outstation']['minKm'] ?? 130); ?>" style="width:100%;padding:0.5rem;margin-top:0.3rem;border:1px solid #e2e8f0;border-radius:6px;" />
                </label>
                <label style="flex:1;font-weight:700;font-size:0.85rem;">Toll ₹/KM
                    <input type="number" name="outstation_tollPerKm" value="<?php echo htmlspecialchars($tariffs['outstation']['tollPerKm'] ?? 2); ?>" style="width:100%;padding:0.5rem;margin-top:0.3rem;border:1px solid #e2e8f0;border-radius:6px;" />
                </label>
                <label style="flex:1;font-weight:700;font-size:0.85rem;">Border Fee (₹/state)
                    <input type="number" name="outstation_borderFee" value="<?php echo htmlspecialchars($tariffs['outstation']['borderFeePerState'] ?? 500); ?>" style="width:100%;padding:0.5rem;margin-top:0.3rem;border:1px solid #e2e8f0;border-radius:6px;" />
                </label>
            </div>
            <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:0.75rem;">
                <?php foreach ($vehicles as $v): ?>
                <div>
                    <div style="font-weight:700;font-size:0.85rem;margin-bottom:0.3rem;"><?php echo htmlspecialchars($tariffs['vehicles'][$v]['label'] ?? $v); ?></div>
                    <label style="font-size:0.75rem;color:#64748b;">Rate/KM
                        <input type="number" name="outstation_rate_<?php echo $v; ?>" value="<?php echo htmlspecialchars($tariffs['outstation']['perKmRate'][$v] ?? 0); ?>" style="width:100%;padding:0.45rem;margin-top:0.2rem;border:1px solid #e2e8f0;border-radius:6px;" />
                    </label>
                    <label style="font-size:0.75rem;color:#64748b;">Driver Allowance
                        <input type="number" name="outstation_allowance_<?php echo $v; ?>" value="<?php echo htmlspecialchars($tariffs['outstation']['driverAllowance'][$v] ?? 0); ?>" style="width:100%;padding:0.45rem;margin-top:0.2rem;border:1px solid #e2e8f0;border-radius:6px;" />
                    </label>
                </div>
                <?php endforeach; ?>
            </div>
        </div>

        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:1.25rem;margin-bottom:1.25rem;">
            <h3>Rental Package <span style="font-weight:400;font-size:0.8rem;color:#64748b;">— hourly rate × hours, plus extra KM beyond each package's included KM, then + GST</span></h3>
            <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:0.75rem;">
                <?php foreach ($vehicles as $v): ?>
                <div>
                    <div style="font-weight:700;font-size:0.85rem;margin-bottom:0.3rem;"><?php echo htmlspecialchars($tariffs['vehicles'][$v]['label'] ?? $v); ?></div>
                    <label style="font-size:0.75rem;color:#64748b;">Hourly rate
                        <input type="number" name="rental_hourly_<?php echo $v; ?>" value="<?php echo htmlspecialchars($tariffs['rental']['hourlyRate'][$v] ?? 0); ?>" style="width:100%;padding:0.45rem;margin-top:0.2rem;border:1px solid #e2e8f0;border-radius:6px;" />
                    </label>
                    <label style="font-size:0.75rem;color:#64748b;">Extra KM rate
                        <input type="number" name="rental_extra_<?php echo $v; ?>" value="<?php echo htmlspecialchars($tariffs['rental']['extraKmRate'][$v] ?? 0); ?>" style="width:100%;padding:0.45rem;margin-top:0.2rem;border:1px solid #e2e8f0;border-radius:6px;" />
                    </label>
                </div>
                <?php endforeach; ?>
            </div>
        </div>

        <button type="submit" style="background:linear-gradient(135deg,#f0cf7c,#c9a24b);border:none;padding:0.85rem 2rem;border-radius:8px;font-weight:800;cursor:pointer;">Save Changes</button>
    </form>
</div>
