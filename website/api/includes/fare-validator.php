<?php
/**
 * Drop Cars — server-side fare sanity check.
 *
 * confirm_booking.php previously trusted the client-submitted estimatedFare/
 * final_fare with zero recomputation, so a direct POST could set any price.
 * This mirrors the core km × rate + driver-bata formula already used by
 * assets/js/fare-calculator.js (calculateFareOneWay/calculateFareRoundTrip)
 * against data/config.json, then checks the submitted fare falls within a
 * generous band around it - wide enough to allow for legitimate coupons/
 * referral credits and toll/tax/night-charge additions, but tight enough to
 * catch a tampered/zeroed-out fare. This is a sanity clamp, not a full
 * reimplementation of every discount/coupon rule - see dropcars_validate_
 * submitted_fare()'s docblock for the exact bounds and why.
 */

if (!function_exists('dropcars_compute_base_fare')) {
    /**
     * Core fare (no discounts/coupons/toll/tax) for one-way/round-trip/
     * multi-city trips, matching assets/js/fare-calculator.js exactly.
     * Returns null if inputs are unusable (unknown vehicle, non-positive
     * distance) - caller should skip validation in that case rather than
     * guess, since we'd otherwise risk rejecting a legitimate booking.
     */
    function dropcars_compute_base_fare(float $distanceKm, string $vehicleType, string $bookingType, int $tripDays = 1, ?float $minDistOverride = null, int $hours = 0): ?float
    {
        $configPath = __DIR__ . '/../../data/config.json';
        if (!is_file($configPath)) {
            return null;
        }
        $config = json_decode(file_get_contents($configPath), true);
        $fares = $config['fares'] ?? null;
        if (!$fares) {
            return null;
        }

        $v = strtoupper(trim($vehicleType));
        $bookingType = strtoupper(trim($bookingType));

        // Hourly package: rate × hours, no distance involved - check this
        // before the distance<=0 guard below, which doesn't apply here.
        if ($bookingType === 'LOCAL_PACKAGE') {
            $rate = $fares['hourlyRates'][$v] ?? null;
            if ($rate === null || $hours <= 0) {
                return null;
            }
            return round($rate * $hours);
        }

        if ($distanceKm <= 0) {
            return null;
        }

        if ($bookingType === 'ROUND_TRIP') {
            $rate = $fares['baseFareRoundTrip'][$v] ?? null;
            $bataPerDay = $fares['bataRoundTrip'][$v] ?? ($fares['driverBata'] ?? 400);
            if ($rate === null) {
                return null;
            }
            $days = max(1, $tripDays);
            $minDist = $minDistOverride !== null ? $minDistOverride : $days * (float) ($fares['minDistanceRoundTripPerDay'] ?? 250);
            $effDist = max($distanceKm, $minDist);
            return round($effDist * $rate + $bataPerDay * $days);
        }

        // ONE_WAY and MULTI_CITY both use the one-way formula on this site -
        // there is no separate multi-city calculator in fare-calculator.js.
        $rate = $fares['baseFareOneWay'][$v] ?? null;
        $bata = $fares['bataOneWay'][$v] ?? ($fares['driverBata'] ?? 400);
        if ($rate === null) {
            return null;
        }
        $minDist = $minDistOverride !== null ? $minDistOverride : (float) ($fares['minDistanceOneWay'] ?? 130);
        $effDist = max($distanceKm, $minDist);
        return round($effDist * $rate + $bata);
    }
}

if (!function_exists('dropcars_validate_submitted_fare')) {
    /**
     * @return array{ok: bool, base_fare: ?float, reason: string}
     *
     * Band: submitted fare must be >= 70% of the computed base fare (covers
     * any realistic coupon/referral discount - referralRewardAmount in
     * config.php is a flat ~₹100, nowhere near half the fare; tightened from
     * an original 50% floor that let a direct POST claim a ~45% "discount"
     * with no real coupon behind it) and <= 170% of it (covers toll + state
     * tax + night charges stacked together). LOCAL_PACKAGE (hourly) is now
     * validated too, using hours × hourly rate as its base fare.
     */
    function dropcars_validate_submitted_fare(float $distanceKm, string $vehicleType, string $bookingType, int $tripDays, float $submittedFare, ?float $minDistOverride = null, int $hours = 0): array
    {
        $bookingType = strtoupper(trim($bookingType));

        $base = dropcars_compute_base_fare($distanceKm, $vehicleType, $bookingType, $tripDays, $minDistOverride, $hours);
        if ($base === null || $base <= 0) {
            // Missing/unrecognized inputs (e.g. distance not yet resolved) -
            // don't block the booking on an inconclusive check.
            return ['ok' => true, 'base_fare' => null, 'reason' => 'insufficient data to validate'];
        }

        $minAllowed = $base * 0.7;
        $maxAllowed = $base * 1.7;

        if ($submittedFare < $minAllowed || $submittedFare > $maxAllowed) {
            return [
                'ok' => false,
                'base_fare' => $base,
                'reason' => "submitted fare {$submittedFare} outside allowed range [{$minAllowed}, {$maxAllowed}] for base fare {$base}",
            ];
        }

        return ['ok' => true, 'base_fare' => $base, 'reason' => 'within range'];
    }
}
