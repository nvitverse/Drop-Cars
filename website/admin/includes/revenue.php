<?php
/**
 * Admin "company revenue" = 10% of km-only fare (distance × per-km rate), excluding driver bata/allowance.
 * Matches frontend fare-calculator.js logic (effDist × rate; bata is separate).
 */

if (!function_exists('dropcars_admin_fare_config')) {
    function dropcars_admin_fare_config(): array
    {
        static $cached = null;
        if ($cached !== null) {
            return $cached;
        }
        $root = dirname(__DIR__, 2);
        $path = $root . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'config.json';
        if (!is_file($path)) {
            $cached = [];
            return $cached;
        }
        $json = file_get_contents($path);
        $decoded = json_decode($json, true);
        $cached = is_array($decoded) ? $decoded : [];
        return $cached;
    }
}

if (!function_exists('dropcars_admin_vehicle_key_from_car_name')) {
    function dropcars_admin_vehicle_key_from_car_name(?string $carName): string
    {
        $s = strtoupper(trim((string) $carName));
        if ($s === '') {
            return 'SEDAN';
        }
        if (strpos($s, 'CRYSTA') !== false) {
            return 'CRYSTA';
        }
        if (strpos($s, 'INNOVA') !== false) {
            return 'INNOVA';
        }
        if (strpos($s, 'SUV') !== false) {
            return 'SUV';
        }
        return 'SEDAN';
    }
}

/**
 * Km-only amount for one booking (same structure as fare calculator before bata is added).
 *
 * @param array $row booking row: distance_km, trip_type, car_name
 */
if (!function_exists('dropcars_admin_km_fare_only')) {
    function dropcars_admin_km_fare_only(array $row, ?array $cfg = null): float
    {
        $cfg = $cfg ?? dropcars_admin_fare_config();
        $fares = $cfg['fares'] ?? [];
        $v = dropcars_admin_vehicle_key_from_car_name($row['car_name'] ?? null);
        $dist = (float) ($row['distance_km'] ?? 0);

        $trip = strtolower((string) ($row['trip_type'] ?? 'oneway'));
        $bata = ($trip === 'round')
            ? (float) ($fares['bataRoundTrip'][$v] ?? $fares['driverBata'] ?? 400)
            : (float) ($fares['bataOneWay'][$v] ?? $fares['driverBata'] ?? 400);

        if ($dist <= 0) {
            $total = (float) ($row['base_fare'] ?? $row['estimated_fare'] ?? $row['final_fare'] ?? 0);
            if ($total <= 0) {
                return 0.0;
            }
            return max(0.0, round($total - $bata));
        }

        if ($trip === 'round') {
            $rate = (float) ($fares['baseFareRoundTrip'][$v] ?? $fares['baseFareRoundTrip']['SEDAN'] ?? 13);
            $minPerDay = (float) ($fares['minDistanceRoundTripPerDay'] ?? 250);
            $days = 1;
            $minDist = $days * $minPerDay;
            $effDist = max($dist, $minDist);
        } else {
            $rate = (float) ($fares['baseFareOneWay'][$v] ?? $fares['baseFareOneWay']['SEDAN'] ?? 14);
            $minDist = (float) ($fares['minDistanceOneWay'] ?? 130);
            $effDist = max($dist, $minDist);
        }

        return max(0.0, round($effDist * $rate));
    }
}

/** Company share: 10% of km-only fare. */
if (!function_exists('dropcars_admin_company_revenue_from_booking_row')) {
    function dropcars_admin_company_revenue_from_booking_row(array $row, ?array $cfg = null): float
    {
        $km = dropcars_admin_km_fare_only($row, $cfg);
        $configPath = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'config.php';
        $config = is_file($configPath) ? (include $configPath) : [];
        $rate = ($config['commissionRate'] ?? 10) / 100;
        return round($km * $rate, 2);
    }
}

/** Sum company revenue for completed bookings (PDO query iterator). */
if (!function_exists('dropcars_admin_sum_company_revenue_completed')) {
    function dropcars_admin_sum_company_revenue_completed(PDO $pdo, ?string $website = null): float
    {
        $cfg = dropcars_admin_fare_config();
        $sql = "SELECT `distance_km`, `trip_type`, `car_name`, `base_fare`, `estimated_fare`, `final_fare` FROM `bookings` WHERE `status` = 'completed'";
        $params = [];
        if ($website && $website !== 'all') {
            $sql .= " AND `website` = ?";
            $params[] = $website;
        }
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $sum = 0.0;
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $sum += dropcars_admin_company_revenue_from_booking_row($row, $cfg);
        }
        return round($sum, 2);
    }
}
