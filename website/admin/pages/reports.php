<?php
/**
 * Admin Reports Page - Analytical insights
 * Revenue: 10% of km-only fare (distance × rate), excluding driver bata — see includes/revenue.php
 */

require_once __DIR__ . '/../includes/revenue.php';

$cfg = dropcars_admin_fare_config();

// 1. Monthly Performance (Last 6 Months) — revenue = company share of km fare
$bookingRows6m = $pdo->query("
    SELECT `created_at`, `status`, `distance_km`, `trip_type`, `car_name`, `base_fare`, `estimated_fare`, `final_fare`
    FROM `bookings`
    WHERE `created_at` >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
")->fetchAll(PDO::FETCH_ASSOC);

$monthly = [];
foreach ($bookingRows6m as $b) {
    $ts = strtotime((string) ($b['created_at'] ?? ''));
    if ($ts === false) {
        continue;
    }
    $key = date('Y-m', $ts);
    $label = date('M Y', $ts);
    if (!isset($monthly[$key])) {
        $monthly[$key] = [
            'month_label' => $label,
            'total_bookings' => 0,
            'revenue' => 0.0,
            'cancellations' => 0,
        ];
    }
    $monthly[$key]['total_bookings']++;
    if (($b['status'] ?? '') === 'cancelled') {
        $monthly[$key]['cancellations']++;
    }
    if (($b['status'] ?? '') === 'completed') {
        $monthly[$key]['revenue'] += dropcars_admin_company_revenue_from_booking_row($b, $cfg);
    }
}
ksort($monthly);
$monthlyReports = array_values($monthly);

// 2. Top Routes (by booking count, revenue = company share)
$completedRoutes = $pdo->query("
    SELECT `pickup_location`, `drop_location`, `distance_km`, `trip_type`, `car_name`, `base_fare`, `estimated_fare`, `final_fare`
    FROM `bookings`
    WHERE `status` = 'completed'
")->fetchAll(PDO::FETCH_ASSOC);

$routeMap = [];
foreach ($completedRoutes as $b) {
    $pk = (string) ($b['pickup_location'] ?? '');
    $dr = (string) ($b['drop_location'] ?? '');
    $k = $pk . "\0" . $dr;
    if (!isset($routeMap[$k])) {
        $routeMap[$k] = [
            'pickup_location' => $pk,
            'drop_location' => $dr,
            'booking_count' => 0,
            'total_revenue' => 0.0,
        ];
    }
    $routeMap[$k]['booking_count']++;
    $routeMap[$k]['total_revenue'] += dropcars_admin_company_revenue_from_booking_row($b, $cfg);
}
usort($routeMap, static function ($a, $b) {
    return (int) $b['booking_count'] <=> (int) $a['booking_count'];
});
$topRoutes = array_slice($routeMap, 0, 10);

// 3. Vehicle / car assignment popularity (schema uses car_name, not vehicle_type)
$vehiclePopularity = $pdo->query("
    SELECT 
        COALESCE(NULLIF(TRIM(`car_name`), ''), 'Not assigned') AS vehicle_type,
        COUNT(*) AS `count`
    FROM `bookings`
    GROUP BY COALESCE(NULLIF(TRIM(`car_name`), ''), 'Not assigned')
    ORDER BY `count` DESC
")->fetchAll();

// 4. Coupon Performance
$couponPerformance = $pdo->query("
    SELECT 
        c.code, 
        COUNT(cu.id) as use_count,
        SUM(cu.discount_amount) as total_discount
    FROM `coupons` c
    LEFT JOIN `coupon_usages` cu ON c.id = cu.coupon_id
    GROUP BY c.id
    ORDER BY use_count DESC
    LIMIT 5
")->fetchAll();

?>

<div class="page-header" style="margin-bottom: 1rem; background: #fff; padding: 0.75rem 1rem; border-radius: 14px; border: 1px solid #f1f5f9; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem;">
        <div style="display: flex; align-items: center; gap: 0.65rem;">
            <div style="width: 36px; height: 36px; flex-shrink: 0; background: #f0fdf4; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #16a34a;">
                <i class="fa-solid fa-chart-line" style="font-size: 1rem;"></i>
            </div>
            <div>
                <h1 style="font-size: 1.2rem; font-weight: 800; color: #1e293b; margin: 0;">Business Reports</h1>
                <p style="margin: 0; font-size: 0.75rem; color: #94a3b8;">Fleet performance &amp; revenue (10% of km fare, excl. driver allowance)</p>
            </div>
        </div>
        <div class="report-controls">
            <button type="button" onclick="window.print()" class="btn btn-secondary" style="height: 34px; padding: 0 0.85rem; font-size: 0.82rem; display: flex; align-items: center; gap: 0.4rem; background: var(--secondary-color); color: #fff; border-color: var(--slate-700);">
                <i class="fa-solid fa-print"></i> Print
            </button>
        </div>
    </div>
</div>

<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 2rem;">
    <!-- Monthly Growth -->
    <div class="card" style="padding: 1.75rem; background: white; border-radius: 20px; box-shadow: var(--shadow-md);">
        <h3 style="margin: 0 0 1.5rem; font-size: 1.1rem; display: flex; align-items: center; gap: 10px;">
            <i class="fa-solid fa-chart-line" style="color: var(--primary-color);"></i>
            Monthly Growth (Last 6 Months)
        </h3>
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="text-align: left; border-bottom: 1px solid #f1f5f9; color: #94a3b8; font-size: 0.8rem; text-transform: uppercase;">
                    <th style="padding: 10px 0;">Month</th>
                    <th style="padding: 10px 0;">Bookings</th>
                    <th style="padding: 10px 0;">Revenue</th>
                    <th style="padding: 10px 0;">Cancel %</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($monthlyReports as $row): ?>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 15px 0; font-weight: 600;"><?php echo $row['month_label']; ?></td>
                    <td style="padding: 15px 0;"><?php echo $row['total_bookings']; ?></td>
                    <td style="padding: 15px 0; font-weight: 700; color: #10b981;"><?php echo formatCurrency($row['revenue']); ?></td>
                    <td style="padding: 15px 0;">
                        <?php 
                            $rate = $row['total_bookings'] > 0 ? ($row['cancellations'] / $row['total_bookings'] * 100) : 0;
                            echo round($rate, 1) . '%';
                        ?>
                    </td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>

    <!-- Vehicle Distribution -->
    <div class="card" style="padding: 1.75rem; background: white; border-radius: 20px; box-shadow: var(--shadow-md);">
        <h3 style="margin: 0 0 1.5rem; font-size: 1.1rem; display: flex; align-items: center; gap: 10px;">
            <i class="fa-solid fa-taxi" style="color: var(--primary-color);"></i>
            Vehicle Type Popularity
        </h3>
        <div style="display: flex; flex-direction: column; gap: 1.25rem;">
            <?php 
                $maxCount = !empty($vehiclePopularity) ? $vehiclePopularity[0]['count'] : 1;
                foreach ($vehiclePopularity as $v): 
                    $width = ($v['count'] / $maxCount) * 100;
            ?>
            <div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.9rem; font-weight: 600;">
                    <span><?php echo htmlspecialchars($v['vehicle_type']); ?></span>
                    <span><?php echo $v['count']; ?> trips</span>
                </div>
                <div style="height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden;">
                    <div style="height: 100%; width: <?php echo $width; ?>%; background: var(--primary-color); border-radius: 4px;"></div>
                </div>
            </div>
            <?php endforeach; ?>
        </div>
    </div>
</div>

<div class="card" style="margin-top: 2rem; padding: 1.75rem; background: white; border-radius: 20px; box-shadow: var(--shadow-md);">
    <h3 style="margin: 0 0 1.5rem; font-size: 1.1rem; display: flex; align-items: center; gap: 10px;">
        <i class="fa-solid fa-route" style="color: var(--primary-color);"></i>
        Top 10 High-Revenue Routes
    </h3>
    <table style="width: 100%; border-collapse: collapse;">
        <thead>
            <tr style="text-align: left; border-bottom: 1px solid #f1f5f9; color: #94a3b8; font-size: 0.8rem; text-transform: uppercase;">
                <th style="padding: 10px 0;">Route</th>
                <th style="padding: 10px 0; text-align: center;">Bookings</th>
                <th style="padding: 10px 0; text-align: right;">Total Revenue</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($topRoutes as $route): ?>
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 15px 0;">
                    <span style="font-weight: 700; color: var(--secondary-color);"><?php echo htmlspecialchars($route['pickup_location']); ?></span>
                    <i class="fa-solid fa-arrow-right-long" style="margin: 0 10px; color: #cbd5e1; font-size: 0.8rem;"></i>
                    <span style="font-weight: 700; color: var(--secondary-color);"><?php echo htmlspecialchars($route['drop_location']); ?></span>
                </td>
                <td style="padding: 15px 0; text-align: center; color: #64748b;"><?php echo $route['booking_count']; ?></td>
                <td style="padding: 15px 0; text-align: right; font-weight: 700; color: #10b981;"><?php echo formatCurrency($route['total_revenue']); ?></td>
            </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
</div>

<div class="card" style="margin-top: 2rem; padding: 1.75rem; background: white; border-radius: 20px; box-shadow: var(--shadow-md);">
    <h3 style="margin: 0 0 1.5rem; font-size: 1.1rem; display: flex; align-items: center; gap: 10px;">
        <i class="fa-solid fa-percent" style="color: var(--primary-color);"></i>
        Top Performing Coupons
    </h3>
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem;">
        <?php foreach ($couponPerformance as $cp): ?>
        <div style="padding: 1.25rem; background: #f8fafc; border-radius: 16px; border: 1px solid #e2e8f0; text-align: center;">
            <div style="display: inline-block; padding: 4px 12px; background: white; border: 1px solid #e2e8f0; border-radius: 8px; font-weight: 800; color: var(--primary-color); margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 1px;"><?php echo $cp['code'] ?: 'N/A'; ?></div>
            <div style="font-size: 1.5rem; font-weight: 800; color: var(--secondary-color);"><?php echo $cp['use_count']; ?></div>
            <div style="font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; font-weight: 700;">Times Redeemed</div>
            <div style="margin-top: 0.5rem; font-size: 0.8rem; font-weight: 700; color: #ef4444;">- <?php echo formatCurrency($cp['total_discount'] ?: 0); ?> Dispatched</div>
        </div>
        <?php endforeach; ?>
    </div>
</div>
