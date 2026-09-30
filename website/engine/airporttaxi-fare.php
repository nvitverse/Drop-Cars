<?php
/**
 * AirportTaxi.International — server-side fare engine.
 *
 * This is the authoritative, PHP-side port of assets/js/fare-calculator.js
 * from the standalone prototype (see "Airport Taxi - Website" folder on the
 * Desktop). It is deliberately self-contained (no session/DB dependency) so
 * it can be called both by engine/airporttaxi-home.php (for the on-page
 * live preview via api/airporttaxi-quote.php) and by
 * api/airporttaxi-confirm-booking.php (to compute the authoritative fare at
 * booking time — never trust a fare number sent by the client).
 *
 * Tariff numbers are read from data/airporttaxi-tariffs.json, which is what
 * admin/pages/airporttaxi-tariffs.php edits.
 */

if (!function_exists('dropcars_airporttaxi_config')) {
    function dropcars_airporttaxi_config(): array
    {
        static $cfg = null;
        if ($cfg !== null) {
            return $cfg;
        }
        $path = __DIR__ . '/../data/airporttaxi-tariffs.json';
        $cfg = is_file($path) ? (json_decode(file_get_contents($path), true) ?: []) : [];
        return $cfg;
    }
}

if (!function_exists('dropcars_airporttaxi_vehicles')) {
    function dropcars_airporttaxi_vehicles(): array
    {
        $cfg = dropcars_airporttaxi_config();
        return array_keys($cfg['vehicles'] ?? ['SEDAN' => [], 'SUV' => [], 'INNOVA' => [], 'CRYSTA' => [], 'HYCROSS' => []]);
    }
}

/**
 * Local (same-city) airport transfer.
 * price = minPrice (covers includedKm) + max(0, distance-includedKm) * extraKmRate
 * total = price + GST%
 */
if (!function_exists('dropcars_airporttaxi_calc_local')) {
    function dropcars_airporttaxi_calc_local(float $distanceKm, string $vehicle): array
    {
        $cfg = dropcars_airporttaxi_config();
        $c = $cfg['local'];
        $gst = (float) ($cfg['gstPercent'] ?? 5);
        $v = strtoupper($vehicle ?: 'SEDAN');
        $dist = max($distanceKm, 0);
        $included = (float) $c['includedKm'];
        $extraKm = max(0, $dist - $included);
        $minPrice = (float) ($c['minPrice'][$v] ?? $c['minPrice']['SEDAN']);
        $extraRate = (float) ($c['extraKmRate'][$v] ?? $c['extraKmRate']['SEDAN']);
        $extraCharge = (int) round($extraKm * $extraRate);
        $subtotal = $minPrice + $extraCharge;
        $gstAmount = (int) round($subtotal * ($gst / 100));
        $total = (int) ($subtotal + $gstAmount);

        return [
            'tripType' => 'Airport Transfer · Local',
            'vehicle' => $v,
            'distanceKm' => round($dist, 1),
            'includedKm' => $included,
            'extraKm' => round($extraKm, 1),
            'extraRate' => $extraRate,
            'extraCharge' => $extraCharge,
            'minPrice' => (int) $minPrice,
            'subtotal' => (int) $subtotal,
            'gstPercent' => $gst,
            'gstAmount' => $gstAmount,
            'total' => $total,
        ];
    }
}

/**
 * Outstation airport transfer.
 * effDist = max(distance, minKm)
 * total = effDist*rate + driverAllowance + toll(tollPerKm*effDist) + borderFee*borders
 * final = total + GST%
 */
if (!function_exists('dropcars_airporttaxi_calc_outstation')) {
    function dropcars_airporttaxi_calc_outstation(float $distanceKm, string $vehicle, int $borders): array
    {
        $cfg = dropcars_airporttaxi_config();
        $c = $cfg['outstation'];
        $gst = (float) ($cfg['gstPercent'] ?? 5);
        $v = strtoupper($vehicle ?: 'SEDAN');
        $dist = max($distanceKm, 0);
        $minKm = (float) $c['minKm'];
        $effDist = max($dist, $minKm);
        $rate = (float) ($c['perKmRate'][$v] ?? $c['perKmRate']['SEDAN']);
        $allowance = (float) ($c['driverAllowance'][$v] ?? $c['driverAllowance']['SEDAN']);
        $kmCharge = (int) round($effDist * $rate);
        $toll = (int) round($effDist * (float) $c['tollPerKm']);
        $borderCount = max(0, $borders);
        $borderFee = $borderCount * (float) $c['borderFeePerState'];
        $subtotal = $kmCharge + $allowance + $toll + $borderFee;
        $gstAmount = (int) round($subtotal * ($gst / 100));
        $total = (int) ($subtotal + $gstAmount);

        return [
            'tripType' => 'Airport Transfer · Outstation',
            'vehicle' => $v,
            'actualKm' => round($dist, 1),
            'minKm' => $minKm,
            'billedKm' => round($effDist, 1),
            'perKmRate' => $rate,
            'kmCharge' => $kmCharge,
            'driverAllowance' => (int) $allowance,
            'tollPerKm' => (float) $c['tollPerKm'],
            'toll' => $toll,
            'borderCount' => $borderCount,
            'borderFeeEach' => (int) $c['borderFeePerState'],
            'borderFee' => (int) $borderFee,
            'subtotal' => (int) $subtotal,
            'gstPercent' => $gst,
            'gstAmount' => $gstAmount,
            'total' => $total,
        ];
    }
}

/**
 * Rental package.
 * total = hourlyRate*hours + extraKm*extraRate (if distance exceeds package includedKm)
 * final = total + GST%
 */
if (!function_exists('dropcars_airporttaxi_calc_rental')) {
    function dropcars_airporttaxi_calc_rental(int $hours, string $vehicle, float $distanceKm): array
    {
        $cfg = dropcars_airporttaxi_config();
        $c = $cfg['rental'];
        $gst = (float) ($cfg['gstPercent'] ?? 5);
        $v = strtoupper($vehicle ?: 'SEDAN');
        $h = $hours ?: 5;
        $pkg = null;
        foreach ($c['packages'] as $p) {
            if ((int) $p['hours'] === $h) {
                $pkg = $p;
                break;
            }
        }
        if ($pkg === null) {
            $pkg = $c['packages'][0];
        }
        $rate = (float) ($c['hourlyRate'][$v] ?? $c['hourlyRate']['SEDAN']);
        $packageTotal = (int) round($rate * $h);
        $dist = max($distanceKm, 0);
        $extraKm = max(0, $dist - (float) $pkg['includedKm']);
        $extraRate = (float) ($c['extraKmRate'][$v] ?? $c['extraKmRate']['SEDAN']);
        $extraCharge = (int) round($extraKm * $extraRate);
        $subtotal = $packageTotal + $extraCharge;
        $gstAmount = (int) round($subtotal * ($gst / 100));
        $total = (int) ($subtotal + $gstAmount);

        return [
            'tripType' => 'Rental Package (' . $h . ' hrs)',
            'vehicle' => $v,
            'hours' => $h,
            'includedKm' => (int) $pkg['includedKm'],
            'hourlyRate' => $rate,
            'packageTotal' => $packageTotal,
            'extraKm' => round($extraKm, 1),
            'extraRate' => $extraRate,
            'extraCharge' => $extraCharge,
            'subtotal' => (int) $subtotal,
            'gstPercent' => $gst,
            'gstAmount' => $gstAmount,
            'total' => $total,
        ];
    }
}

/**
 * Compute one fare given a normalized params array (mirrors the JS calcAll shape).
 * params: ['mode' => 'local'|'outstation'|'rental', 'distanceKm', 'borders', 'hours', 'vehicle']
 */
if (!function_exists('dropcars_airporttaxi_quote')) {
    function dropcars_airporttaxi_quote(array $params): array
    {
        $vehicle = strtoupper((string) ($params['vehicle'] ?? 'SEDAN'));
        $mode = (string) ($params['mode'] ?? 'local');
        $distance = (float) ($params['distanceKm'] ?? 0);

        if ($mode === 'outstation') {
            return dropcars_airporttaxi_calc_outstation($distance, $vehicle, (int) ($params['borders'] ?? 0));
        }
        if ($mode === 'rental') {
            return dropcars_airporttaxi_calc_rental((int) ($params['hours'] ?? 5), $vehicle, $distance);
        }

        return dropcars_airporttaxi_calc_local($distance, $vehicle);
    }
}

/** Quote every vehicle at once — used for the "compare all vehicles" quote modal. */
if (!function_exists('dropcars_airporttaxi_quote_all')) {
    function dropcars_airporttaxi_quote_all(array $params): array
    {
        $out = [];
        foreach (dropcars_airporttaxi_vehicles() as $v) {
            $p = $params;
            $p['vehicle'] = $v;
            $out[$v] = dropcars_airporttaxi_quote($p);
        }
        return $out;
    }
}
