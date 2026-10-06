<?php
/**
 * Format fareBreakdown JSON (from booking-form.js) for email and plain text.
 *
 * @param array<string, mixed> $fb
 */

if (!function_exists('dropcars_infer_state_from_location')) {
    function dropcars_infer_state_from_location(string $locationText): string {
        $text = strtolower(trim($locationText));
        if ($text === '') return '';

        // Puducherry / Pondicherry / Karaikal are Union Territory enclaves inside Tamil Nadu.
        // Google Maps frequently appends ", Tamil Nadu" to Pondicherry addresses.
        // Check Puducherry FIRST before Tamil Nadu so it is never misclassified.
        if (
            strpos($text, 'puducherry') !== false ||
            strpos($text, 'pondicherry') !== false ||
            strpos($text, 'karaikal') !== false ||
            strpos($text, 'karaikkal') !== false ||
            strpos($text, 'mahe') !== false ||
            strpos($text, 'yanam') !== false
        ) {
            return 'puducherry';
        }

        $knownStates = [
            'karnataka',
            'kerala',
            'andhra pradesh',
            'telangana',
            'tamil nadu',
            'maharashtra',
            'goa',
            'gujarat'
        ];
        foreach ($knownStates as $st) {
            if (strpos($text, $st) !== false) {
                return $st;
            }
        }

        $cityToState = [
            // Tamil Nadu
            'chennai' => 'tamil nadu', 'coimbatore' => 'tamil nadu', 'madurai' => 'tamil nadu', 'trichy' => 'tamil nadu',
            'tiruchirappalli' => 'tamil nadu', 'vellore' => 'tamil nadu', 'salem' => 'tamil nadu', 'erode' => 'tamil nadu',
            'tirunelveli' => 'tamil nadu', 'thanjavur' => 'tamil nadu', 'dindigul' => 'tamil nadu', 'karur' => 'tamil nadu',
            'namakkal' => 'tamil nadu', 'krishnagiri' => 'tamil nadu', 'dharmapuri' => 'tamil nadu', 'cuddalore' => 'tamil nadu',
            'villupuram' => 'tamil nadu', 'kanchipuram' => 'tamil nadu', 'chengalpattu' => 'tamil nadu', 'thiruvallur' => 'tamil nadu',
            'nagapattinam' => 'tamil nadu', 'thiruvarur' => 'tamil nadu', 'ramanathapuram' => 'tamil nadu', 'sivagangai' => 'tamil nadu',
            'virudhunagar' => 'tamil nadu', 'thoothukudi' => 'tamil nadu', 'tenkasi' => 'tamil nadu', 'nilgiris' => 'tamil nadu',
            'ooty' => 'tamil nadu', 'kodaikanal' => 'tamil nadu', 'tiruppur' => 'tamil nadu', 'ariyalur' => 'tamil nadu',
            'pudukkottai' => 'tamil nadu', 'theni' => 'tamil nadu', 'kallakurichi' => 'tamil nadu', 'tirupattur' => 'tamil nadu',
            'ranipet' => 'tamil nadu', 'tiruvannamalai' => 'tamil nadu', 'kanyakumari' => 'tamil nadu', 'rameshwaram' => 'tamil nadu',
            'hosur' => 'tamil nadu', 'bhavani' => 'tamil nadu', 'chidambaram' => 'tamil nadu', 'perambalur' => 'tamil nadu',
            'velankanni' => 'tamil nadu', 'mahabalipuram' => 'tamil nadu', 'katpadi' => 'tamil nadu', 'ambur' => 'tamil nadu',
            // Karnataka
            'bangalore' => 'karnataka', 'bengaluru' => 'karnataka', 'mysore' => 'karnataka', 'mangalore' => 'karnataka',
            // Kerala
            'kochi' => 'kerala', 'cochin' => 'kerala', 'trivandrum' => 'kerala', 'thiruvananthapuram' => 'kerala', 'palakkad' => 'kerala', 'calicut' => 'kerala',
            // Andhra Pradesh
            'tirupati' => 'andhra pradesh', 'chittoor' => 'andhra pradesh', 'nellore' => 'andhra pradesh',
            // Telangana
            'hyderabad' => 'telangana', 'secunderabad' => 'telangana',
            // Puducherry
            'pondicherry' => 'puducherry', 'puducherry' => 'puducherry', 'karaikal' => 'puducherry', 'karaikkal' => 'puducherry'
        ];
        foreach ($cityToState as $city => $state) {
            if (strpos($text, $city) !== false) {
                return $state;
            }
        }
        return '';
    }
}

if (!function_exists('dropcars_detect_border_transitions')) {
    function dropcars_detect_border_transitions(string $pickup, string $drop, array $stops = []): array {
        $points = [];
        if (trim($pickup) !== '') $points[] = trim($pickup);
        foreach ($stops as $s) {
            $sv = is_string($s) ? trim($s) : (is_array($s) && isset($s['value']) ? trim((string)$s['value']) : '');
            if ($sv !== '') $points[] = $sv;
        }
        if (trim($drop) !== '') $points[] = trim($drop);

        if (count($points) < 2) return [];

        $neighbors = [
            'tamil nadu' => ['kerala', 'karnataka', 'andhra pradesh', 'puducherry'],
            'kerala' => ['tamil nadu', 'karnataka'],
            'karnataka' => ['tamil nadu', 'kerala', 'andhra pradesh', 'telangana'],
            'andhra pradesh' => ['tamil nadu', 'karnataka', 'telangana'],
            'telangana' => ['andhra pradesh', 'karnataka'],
            'puducherry' => ['tamil nadu'],
        ];

        $transitions = [];
        for ($i = 0; $i < count($points) - 1; $i++) {
            $fromState = dropcars_infer_state_from_location($points[$i]);
            $toState = dropcars_infer_state_from_location($points[$i + 1]);
            if ($fromState === '' || $toState === '' || $fromState === $toState) continue;

            $queue = [[$fromState]];
            $visited = [$fromState => true];
            $foundPath = null;
            while (!empty($queue)) {
                $path = array_shift($queue);
                $last = end($path);
                if ($last === $toState) {
                    $foundPath = $path;
                    break;
                }
                foreach (($neighbors[$last] ?? []) as $next) {
                    if (isset($visited[$next])) continue;
                    $visited[$next] = true;
                    $newPath = $path;
                    $newPath[] = $next;
                    $queue[] = $newPath;
                }
            }

            if ($foundPath !== null && count($foundPath) > 1) {
                for ($k = 0; $k < count($foundPath) - 1; $k++) {
                    $f = $foundPath[$k];
                    $t = $foundPath[$k + 1];
                    $transitions[] = [
                        'from' => $f,
                        'to' => $t,
                        'andhraBorder' => ($f === 'andhra pradesh' || $t === 'andhra pradesh')
                    ];
                }
            } else {
                $transitions[] = [
                    'from' => $fromState,
                    'to' => $toState,
                    'andhraBorder' => ($fromState === 'andhra pradesh' || $toState === 'andhra pradesh')
                ];
            }
        }

        $unique = [];
        $seen = [];
        foreach ($transitions as $tr) {
            $f = strtolower(trim((string)$tr['from']));
            $t = strtolower(trim((string)$tr['to']));
            if ($f === '' || $t === '' || $f === $t) continue;
            $key = ($f < $t) ? ($f . '::' . $t) : ($t . '::' . $f);
            if (isset($seen[$key])) continue;
            $seen[$key] = true;
            $unique[] = $tr;
        }
        return $unique;
    }
}

/**
 * Normalize breakdown so we never show "~0 km" as the route when vehicle rows bill a positive distance.
 * Safe to call on any payload; fixes legacy sessions and third-party JSON.
 *
 * @param array<string, mixed> $fb
 * @return array<string, mixed>
 */
function dropcars_fare_breakdown_sanitize(array $fb): array
{
    if ($fb === []) {
        return $fb;
    }
    if (empty($fb['borderTransitions']) && !empty($fb['pickup']) && !empty($fb['drop'])) {
        $fb['borderTransitions'] = dropcars_detect_border_transitions((string)$fb['pickup'], (string)$fb['drop'], (array)($fb['stops'] ?? []));
    }
    $mode = (string) ($fb['tripMode'] ?? '');

    if ($mode === 'hourly_rental') {
        return $fb;
    }

    if ($mode === 'round_trip') {
        $ow = isset($fb['actualRouteKmOneWay']) ? (float) $fb['actualRouteKmOneWay'] : 0.0;
        $tot = isset($fb['totalRoundTripKmUsed']) ? (float) $fb['totalRoundTripKmUsed'] : 0.0;
        $days = max(1, (int) ($fb['tripDays'] ?? 1));
        if ($ow <= 0 && $tot > 0 && $days === 1) {
            $fb['actualRouteKmOneWay'] = round(($tot / 2) * 10) / 10;
            $fb['distancePending'] = true;
            if (!array_key_exists('routeKmMeasured', $fb)) {
                $fb['routeKmMeasured'] = 0.0;
            }
        }
        return $fb;
    }

    $bill = 0.0;
    if (!empty($fb['vehicles']) && is_array($fb['vehicles'])) {
        foreach (['SEDAN', 'SUV', 'INNOVA', 'CRYSTA'] as $vk) {
            if (!empty($fb['vehicles'][$vk]['effectiveBillableKm'])) {
                $bill = (float) $fb['vehicles'][$vk]['effectiveBillableKm'];
                break;
            }
        }
    }
    $top = isset($fb['actualRouteKm']) ? (float) $fb['actualRouteKm'] : 0.0;
    if ($bill > 0 && $top <= 0) {
        $fb['actualRouteKm'] = round($bill * 10) / 10;
        $fb['distancePending'] = true;
        if (!array_key_exists('routeKmMeasured', $fb)) {
            $fb['routeKmMeasured'] = 0.0;
        }
    }

    return $fb;
}

function dropcars_fare_breakdown_html(array $fb, string $selectedVehicleKey = ''): string
{
    if ($fb === []) {
        return '';
    }
    $fb = dropcars_fare_breakdown_sanitize($fb);
    $mode = (string) ($fb['tripMode'] ?? '');
    $esc = static function ($s): string {
        return htmlspecialchars((string) $s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    };

    $fareType = (string)($fb['fareType'] ?? 'base');
    $includeTolls = isset($fb['includeTolls']) ? (bool)$fb['includeTolls'] : ($fareType === 'inclusive');
    $includeTaxes = isset($fb['includeTaxes']) ? (bool)$fb['includeTaxes'] : ($fareType === 'inclusive');

    if ($includeTolls && $includeTaxes) {
        $fareTypeLabel = 'Inclusive (Toll & State Entry Tax Included)';
    } elseif ($includeTolls) {
        $fareTypeLabel = 'Inclusive (Toll Included, State Entry Tax Extra)';
    } elseif ($includeTaxes) {
        $fareTypeLabel = 'Inclusive (State Entry Tax Included, Toll Extra)';
    } else {
        $fareTypeLabel = 'Exclusive (Toll & State Entry Tax Extra)';
    }
    $rows = '<tbody class="fv-veh-group fv-veh-all"><tr><td class="k">Fare Plan</td><td class="v"><strong>' . $esc($fareTypeLabel) . '</strong></td></tr>';
    
    $selectedVehicleKey = strtoupper(trim($selectedVehicleKey));
    $vehicleOrder = ['SEDAN', 'SUV', 'INNOVA', 'CRYSTA'];
    if ($selectedVehicleKey !== '' && in_array($selectedVehicleKey, $vehicleOrder, true)) {
        $vehicleOrder = [$selectedVehicleKey];
    }
    
    if ($mode === 'hourly_rental') {
        $hours = isset($fb['hours']) ? (float) $fb['hours'] : 0;
        $rows .= '<tr><td class="k">Package</td><td class="v">Hourly rental · ' . $esc($hours) . ' hour(s)</td></tr>';
        $rows .= '</tbody>';
        $vehicles = isset($fb['vehicles']) && is_array($fb['vehicles']) ? $fb['vehicles'] : [];
        foreach ($vehicleOrder as $vk) {
            if (!isset($vehicles[$vk]) || !is_array($vehicles[$vk])) {
                continue;
            }
            $v = $vehicles[$vk];
            $rate = isset($v['hourlyRate']) ? (int) $v['hourlyRate'] : 0;
            $total = isset($v['packageTotal']) ? (int) $v['packageTotal'] : 0;
            $rows .= '<tbody class="fv-veh-group fv-veh-' . strtolower($vk) . '">';
            $rows .= '<tr><td class="k">' . $esc($vk) . '</td><td class="v">₹' . $esc((string) $rate) . '/hr × ' . $esc((string) $hours)
                . ' hr = <strong>₹' . number_format($total, 0) . '</strong></td></tr>';
            $rows .= '</tbody>';
        }
    } elseif ($mode === 'round_trip') {
        $ow = isset($fb['actualRouteKmOneWay']) ? $fb['actualRouteKmOneWay'] : '';
        $tot = isset($fb['totalRoundTripKmUsed']) ? $fb['totalRoundTripKmUsed'] : '';
        $days = isset($fb['tripDays']) ? (int) $fb['tripDays'] : 1;
        $rows .= '<tr><td class="k">Route (one-way)</td><td class="v">~' . $esc($ow) . ' km</td></tr>';
        $rows .= '<tr><td class="k">Calculated trip km</td><td class="v">~' . $esc($tot) . ' km (round trip total used for fare)</td></tr>';
        $rows .= '<tr><td class="k">Trip days</td><td class="v">' . $esc((string) $days) . '</td></tr>';
        $rows .= '</tbody>';
        $vehicles = isset($fb['vehicles']) && is_array($fb['vehicles']) ? $fb['vehicles'] : [];
        foreach ($vehicleOrder as $vk) {
            if (!isset($vehicles[$vk]) || !is_array($vehicles[$vk])) {
                continue;
            }
            $vData = $vehicles[$vk];
            $vData['actualRouteKm'] = $fb['actualRouteKmOneWay'] ?? ($fb['actualRouteKm'] ?? 0);
            $vData['fareType'] = $fareType;
            $vData['borderTransitions'] = $fb['borderTransitions'] ?? [];
            $vData['includeTolls'] = $includeTolls;
            $vData['includeTaxes'] = $includeTaxes;
            if (isset($fb['overrideTollAmount'])) $vData['liveToll'] = $fb['overrideTollAmount'];
            if (isset($fb['overrideTaxAmount']))  $vData['overrideTaxAmount'] = $fb['overrideTaxAmount'];
            if (isset($fb['overrideTaxCount']))   $vData['overrideTaxCount'] = $fb['overrideTaxCount'];
            $rows .= dropcars_fare_breakdown_vehicle_row_html($esc, $vk, $vData, true);
        }
    } else {
        $act = isset($fb['actualRouteKm']) ? $fb['actualRouteKm'] : '';
        $pending = !empty($fb['distancePending']);
        $measured = isset($fb['routeKmMeasured']) ? (float) $fb['routeKmMeasured'] : -1.0;
        if ($pending && $measured <= 0) {
            $rows .= '<tr><td class="k">GPS / Matrix route</td><td class="v">Not confirmed — this quote uses <strong>~' . $esc((string) $act) . ' km</strong> (cache estimate or minimum billable rules). Open the map for the real road distance.</td></tr>';
        } else {
            $rows .= '<tr><td class="k">Actual route km</td><td class="v">~' . $esc($act) . ' km (one-way)</td></tr>';
        }
        if ($mode === 'multi_city' && isset($fb['multiCityExtras']) && is_array($fb['multiCityExtras'])) {
            $ex = $fb['multiCityExtras'];
            $sc = isset($ex['stopCharge']) ? (int) $ex['stopCharge'] : 0;
            $na = isset($ex['nightAllowance']) ? (int) $ex['nightAllowance'] : 0;
            $rows .= '<tr><td class="k">Multi-city extras</td><td class="v">Stops: ₹' . number_format($sc, 0)
                . ' · Night: ₹' . number_format($na, 0) . '</td></tr>';
        }
        $rows .= '</tbody>';
        $vehicles = isset($fb['vehicles']) && is_array($fb['vehicles']) ? $fb['vehicles'] : [];
        foreach ($vehicleOrder as $vk) {
            if (!isset($vehicles[$vk]) || !is_array($vehicles[$vk])) {
                continue;
            }
            $vData = $vehicles[$vk];
            $vData['actualRouteKm'] = $fb['actualRouteKm'] ?? ($fb['actualRouteKmOneWay'] ?? 0);
            $vData['fareType'] = $fareType;
            $vData['borderTransitions'] = $fb['borderTransitions'] ?? [];
            $vData['includeTolls'] = $includeTolls;
            $vData['includeTaxes'] = $includeTaxes;
            if (isset($fb['overrideTollAmount'])) $vData['liveToll'] = $fb['overrideTollAmount'];
            if (isset($fb['overrideTaxAmount']))  $vData['overrideTaxAmount'] = $fb['overrideTaxAmount'];
            if (isset($fb['overrideTaxCount']))   $vData['overrideTaxCount'] = $fb['overrideTaxCount'];
            $rows .= dropcars_fare_breakdown_vehicle_row_html($esc, $vk, $vData, false);
        }
    }

    if ($rows === '') {
        return '';
    }

    return '<div class="block"><div class="block-title">Distance &amp; fare calculation</div><div class="block-body"><table class="kv">'
        . $rows . '</table></div></div>';
}

/**
 * @param callable(string): string $esc
 * @param array<string, mixed> $v
 */
function dropcars_fare_breakdown_vehicle_row_html(callable $esc, string $vk, array $v, bool $isRoundTrip): string
{
    $min = isset($v['minimumBillableKm']) ? $v['minimumBillableKm'] : '';
    $eff = isset($v['effectiveBillableKm']) ? $v['effectiveBillableKm'] : '';
    $rate = isset($v['perKmRate']) ? $v['perKmRate'] : '';
    $kmCh = isset($v['kmCharge']) ? (int) $v['kmCharge'] : 0;
    $bata = isset($v['driverBata']) ? (int) $v['driverBata'] : 0;
    $tot = isset($v['totalFare']) ? (int) $v['totalFare'] : 0;
    $below = isset($v['extraKmBelowMinimum']) ? (float) $v['extraKmBelowMinimum'] : 0;
    $above = isset($v['extraKmAboveMinimum']) ? (float) $v['extraKmAboveMinimum'] : 0;

    $metaMap = [
        'SEDAN' => ['name' => 'Sedan (Dzire/Aura or Equivalent)', 'capacity' => '4 seats', 'ac' => 'A/C'],
        'SUV' => ['name' => 'SUV (Ertiga or Equivalent)', 'capacity' => '6 seats', 'ac' => 'A/C'],
        'INNOVA' => ['name' => 'Innova', 'capacity' => '6/7 seats', 'ac' => 'A/C'],
        'CRYSTA' => ['name' => 'Innova Crysta', 'capacity' => '6/7 seats', 'ac' => 'A/C'],
    ];
    $meta = $metaMap[strtoupper($vk)] ?? ['name' => $vk, 'capacity' => '', 'ac' => 'A/C'];

    $html = '<tbody class="fv-veh-group fv-veh-' . strtolower($vk) . '">';
    $html .= '<tr><td class="k" colspan="2" style="background:#eef2ff; font-weight:800; padding:10px 12px; border-top:1px solid #cbd5e1; border-bottom:1px solid #cbd5e1;">'
        . '<div style="font-size:14px; color:#1e40af; display:inline-block; font-weight:800;">' . $esc($meta['name']) . '</div>'
        . ($meta['capacity'] !== '' ? '<div style="font-size:11px; color:#64748b; font-weight:600; margin-top:2px;">👥 ' . $esc($meta['capacity']) . ' • ❄︎ ' . $esc($meta['ac']) . '</div>' : '')
        . '</td></tr>';
    if ($isRoundTrip) {
        $actTot = isset($v['actualRouteKmTotal']) ? $v['actualRouteKmTotal'] : '';
        $bpd = isset($v['driverBataPerDay']) ? (int) $v['driverBataPerDay'] : 0;
        $bt = isset($v['driverBataTotal']) ? (int) $v['driverBataTotal'] : 0;
        $td = isset($v['tripDays']) ? (int) $v['tripDays'] : 1;
        $html .= '<tr><td class="k">Billable km (eff.)</td><td class="v">' . $esc((string) $eff) . ' km (min ' . $esc((string) $min) . ' km for ' . $esc((string) $td) . ' day(s))</td></tr>';
        $html .= '<tr><td class="k">Route km (actual)</td><td class="v">~' . $esc((string) $actTot) . ' km total</td></tr>';
        $html .= '<tr><td class="k">Rate / km</td><td class="v">₹' . $esc((string) $rate) . '</td></tr>';
        $html .= '<tr><td class="k">Km charge</td><td class="v">₹' . number_format($kmCh, 0) . '</td></tr>';
        $html .= '<tr><td class="k">Driver bata</td><td class="v">₹' . number_format($bpd, 0) . '/day × ' . $esc((string) $td) . ' = ₹' . number_format($bt, 0) . '</td></tr>';
        if ($below > 0) {
            $html .= '<tr><td class="k">Minimum Coverage Rule</td><td class="v">Applied for Round Trip as ' . $esc((string) $min) . ' KMs coverage (+' . $esc((string) $below) . ' km billed)</td></tr>';
        }
    } else {
        $html .= '<tr><td class="k">Billable km (eff.)</td><td class="v">' . $esc((string) $eff) . ' km (min ' . $esc((string) $min) . ' km)</td></tr>';
        $html .= '<tr><td class="k">Rate / km</td><td class="v">₹' . $esc((string) $rate) . '</td></tr>';
        $html .= '<tr><td class="k">Km charge</td><td class="v">₹' . number_format($kmCh, 0) . '</td></tr>';
        $html .= '<tr><td class="k">Driver bata</td><td class="v">₹' . number_format($bata, 0) . '</td></tr>';
        if ($below > 0) {
            $html .= '<tr><td class="k">Minimum Coverage Rule</td><td class="v">Applied for One-Way as ' . $esc((string) $min) . ' KMs coverage (+' . $esc((string) $below) . ' km billed)</td></tr>';
        }
        if (isset($v['multiCityStopCharge']) && (int) $v['multiCityStopCharge'] > 0) {
            $html .= '<tr><td class="k">Multi-city stop charge</td><td class="v">₹' . number_format((int) $v['multiCityStopCharge'], 0) . '</td></tr>';
        }
        if (isset($v['multiCityNightAllowance']) && (int)$v['multiCityNightAllowance'] > 0 && !isset($v['driverNightAllowance'])) {
            $html .= '<tr><td class="k">Night allowance</td><td class="v">₹' . number_format((int) $v['multiCityNightAllowance'], 0) . '</td></tr>';
        }
    }

    $nightAllowance = isset($v['driverNightAllowance']) ? (int)$v['driverNightAllowance'] : 0;
    if ($nightAllowance > 0) {
        $html .= '<tr><td class="k">Driver Night Allowance</td><td class="v">₹' . number_format($nightAllowance, 0) . '</td></tr>';
    }
    $parking = isset($v['parkingCharges']) ? (int)$v['parkingCharges'] : (isset($v['parking']) ? (int)$v['parking'] : 0);
    if ($parking > 0) {
        $html .= '<tr><td class="k">Parking Charges</td><td class="v">₹' . number_format($parking, 0) . '</td></tr>';
    }
    $waiting = isset($v['waitingCharges']) ? (int)$v['waitingCharges'] : (isset($v['waiting']) ? (int)$v['waiting'] : 0);
    if ($waiting > 0) {
        $waitingLabel = 'Waiting Charges';
        if (isset($v['waitingHours']) && (float)$v['waitingHours'] > 0 && isset($v['waitingRate']) && (float)$v['waitingRate'] > 0) {
            $hrs = (float)$v['waitingHours'];
            $rate = (float)$v['waitingRate'];
            $waitingLabel .= ' (' . $hrs . ' ' . ($hrs == 1 ? 'hr' : 'hrs') . ' @ ₹' . number_format($rate, 0) . '/hr)';
        }
        $html .= '<tr><td class="k">' . htmlspecialchars($waitingLabel) . '</td><td class="v">₹' . number_format($waiting, 0) . '</td></tr>';
    }

    $includeTolls = isset($v['includeTolls']) ? (bool)$v['includeTolls'] : (isset($v['fareType']) && $v['fareType'] === 'inclusive');
    $includeTaxes = isset($v['includeTaxes']) ? (bool)$v['includeTaxes'] : (isset($v['fareType']) && $v['fareType'] === 'inclusive');

    $dist = (float)($v['actualRouteKm'] ?? $v['actualRouteKmTotal'] ?? $fb['actualRouteKm'] ?? $fb['actualRouteKmOneWay'] ?? 0);
    
    // Toll calculations
    $estToll = round($dist * 2.0);
    if (isset($v['liveToll']) && $v['liveToll'] !== '' && is_numeric($v['liveToll'])) {
        $estToll = max(0, (int)$v['liveToll']);
    }
    
    if ($includeTolls) {
        $html .= '<tr><td class="k" style="color:#d97706;">Highway Tolls (Incl.)</td><td class="v" style="color:#d97706;">₹' . number_format($estToll, 0) . '</td></tr>';
        $tot += $estToll;
    } else {
        $html .= '<tr><td class="k" style="color:#64748b;">Highway Tolls</td><td class="v" style="color:#64748b;">₹' . number_format($estToll, 0) . ' (Extra)</td></tr>';
    }

    // State Entry Tax calculations
    $taxRate = 500;
    if ($vk === 'SUV') $taxRate = 1000;
    if ($vk === 'INNOVA' || $vk === 'CRYSTA') $taxRate = 1500;
    if (isset($v['overrideTaxAmount'])) {
        $taxRate = (int)$v['overrideTaxAmount'];
    }

    $totalTax = 0;
    if (isset($v['overrideTaxCount'])) {
        $totalTax = (int)$v['overrideTaxCount'] * $taxRate;
        $nBorders = (int)$v['overrideTaxCount'];
    } else {
        $borders = isset($v['borderTransitions']) && is_array($v['borderTransitions']) ? $v['borderTransitions'] : [];
        $seenBorders = [];
        foreach ($borders as $b) {
            $from = strtolower(trim((string)($b['from'] ?? '')));
            $to = strtolower(trim((string)($b['to'] ?? '')));
            if ($from === '' || $to === '' || $from === $to) continue;
            $key = ($from < $to) ? ($from . '::' . $to) : ($to . '::' . $from);
            if (isset($seenBorders[$key])) continue;
            $seenBorders[$key] = true;

            // Specialized Andhra border logic
            if (($vk === 'INNOVA' || $vk === 'CRYSTA') && (isset($b['andhraBorder']) && $b['andhraBorder']) && !isset($v['overrideTaxAmount'])) {
                $totalTax += 2000;
            } else {
                $totalTax += $taxRate;
            }
        }
        $nBorders = count($seenBorders);
    }

    if ($includeTaxes) {
        if ($totalTax > 0) {
            $multiplierData = $nBorders > 1 ? " ({$nBorders}x)" : "";
            $html .= '<tr><td class="k" style="color:#d97706;">State Entry Tax (Incl.)' . $multiplierData . '</td><td class="v" style="color:#d97706;">₹' . number_format($totalTax, 0) . '</td></tr>';
            $tot += $totalTax;
        } else {
            $html .= '<tr><td class="k" style="color:#64748b;">State Entry Tax (if applicable)</td><td class="v" style="color:#64748b;">Extra at actuals</td></tr>';
        }
    } else {
        if ($totalTax > 0) {
            $multiplierData = $nBorders > 1 ? " ({$nBorders}x)" : "";
            $html .= '<tr><td class="k" style="color:#64748b;">State Entry Tax' . $multiplierData . '</td><td class="v" style="color:#64748b;">₹' . number_format($totalTax, 0) . ' (Extra)</td></tr>';
        } else {
            $html .= '<tr><td class="k" style="color:#64748b;">State Entry Tax (if applicable)</td><td class="v" style="color:#64748b;">Extra at actuals</td></tr>';
        }
    }

    $html .= '<tr style="background: #f8fafc;"><td class="k" style="border-top: 1.5px solid #cbd5e1; padding: 10px 12px; font-weight: 800; color: #0f172a;">TOTAL ESTIMATE</td><td class="v" style="border-top: 1.5px solid #cbd5e1; padding: 10px 12px; font-size: 1.15rem; color: #166534; font-weight: 800;">₹' . number_format($tot, 0) . '</td></tr>';
    $html .= '</tbody>';

    return $html;
}

/**
 * @param array<string, mixed> $fb
 */
function dropcars_fare_breakdown_plain(array $fb, string $selectedVehicleKey = ''): string
{
    if ($fb === []) {
        return '';
    }
    $fb = dropcars_fare_breakdown_sanitize($fb);
    $mode = (string) ($fb['tripMode'] ?? '');
    $fareType = (string)($fb['fareType'] ?? 'base');
    $fareTypeLabel = ($fareType === 'inclusive') ? 'Inclusive (Toll/Tax Included)' : 'Exclusive (Toll/Tax Extra)';
    $lines = ["Distance & fare calculation", str_repeat('-', 28), "Fare Type: " . $fareTypeLabel];

    if ($mode === 'hourly_rental') {
        $hours = isset($fb['hours']) ? (float) $fb['hours'] : 0;
        $lines[] = 'Package: Hourly rental, ' . $hours . ' hour(s)';
        $vehicles = isset($fb['vehicles']) && is_array($fb['vehicles']) ? $fb['vehicles'] : [];
        foreach (['SEDAN', 'SUV', 'INNOVA', 'CRYSTA'] as $vk) {
            if (!isset($vehicles[$vk]) || !is_array($vehicles[$vk])) {
                continue;
            }
            $v = $vehicles[$vk];
            $rate = isset($v['hourlyRate']) ? (int) $v['hourlyRate'] : 0;
            $total = isset($v['packageTotal']) ? (int) $v['packageTotal'] : 0;
            $lines[] = $vk . ': ₹' . $rate . '/hr × ' . $hours . ' hr = ₹' . number_format($total, 0);
        }
        return implode("\n", $lines) . "\n";
    }

    if ($mode === 'round_trip') {
        $lines[] = 'Route (one-way): ~' . ($fb['actualRouteKmOneWay'] ?? '') . ' km';
        $lines[] = 'Calculated trip km: ~' . ($fb['totalRoundTripKmUsed'] ?? '') . ' km (round trip total)';
        $lines[] = 'Trip days: ' . (int) ($fb['tripDays'] ?? 1);
    } else {
        if (!empty($fb['distancePending'])) {
            $lines[] = 'GPS distance: not confirmed; quote basis ~' . ($fb['actualRouteKm'] ?? '') . ' km (cache / minimum rules)';
        } else {
            $lines[] = 'Actual route km (one-way): ~' . ($fb['actualRouteKm'] ?? '') . ' km';
        }
        if ($mode === 'multi_city' && isset($fb['multiCityExtras']) && is_array($fb['multiCityExtras'])) {
            $ex = $fb['multiCityExtras'];
            $lines[] = 'Multi-city extras: Stops ₹' . (int) ($ex['stopCharge'] ?? 0)
                . ', Night ₹' . (int) ($ex['nightAllowance'] ?? 0);
        }
    }

    $vehicles = isset($fb['vehicles']) && is_array($fb['vehicles']) ? $fb['vehicles'] : [];
    $selectedVehicleKey = strtoupper(trim($selectedVehicleKey));
    $vehicleOrder = ['SEDAN', 'SUV', 'INNOVA', 'CRYSTA'];
    if ($selectedVehicleKey !== '' && in_array($selectedVehicleKey, $vehicleOrder, true)) {
        $vehicleOrder = [$selectedVehicleKey];
    }
    foreach ($vehicleOrder as $vk) {
        if (!isset($vehicles[$vk]) || !is_array($vehicles[$vk])) {
            continue;
        }
        $v = $vehicles[$vk];
        $metaMap = [
            'SEDAN' => ['name' => 'Sedan (Dzire/Aura or Equivalent)', 'capacity' => '4 seats', 'ac' => 'A/C'],
            'SUV' => ['name' => 'SUV (Ertiga or Equivalent)', 'capacity' => '6 seats', 'ac' => 'A/C'],
            'INNOVA' => ['name' => 'Innova', 'capacity' => '6/7 seats', 'ac' => 'A/C'],
            'CRYSTA' => ['name' => 'Innova Crysta', 'capacity' => '6/7 seats', 'ac' => 'A/C'],
        ];
        $meta = $metaMap[strtoupper($vk)] ?? ['name' => $vk, 'capacity' => '', 'ac' => 'A/C'];

        $lines[] = '';
        $lines[] = $meta['name'] . ($meta['capacity'] !== '' ? ' (' . $meta['capacity'] . ' • ' . $meta['ac'] . ')' : '') . ':';
        if ($mode === 'round_trip') {
            $lines[] = '  Billable km: ' . ($v['effectiveBillableKm'] ?? '') . ' (min ' . ($v['minimumBillableKm'] ?? '') . ' km)';
            $lines[] = '  Route km actual: ~' . ($v['actualRouteKmTotal'] ?? '') . ' km total';
            $lines[] = '  Rate/km: ₹' . ($v['perKmRate'] ?? '') . ' | Km charge: ₹' . number_format((int) ($v['kmCharge'] ?? 0), 0);
            $lines[] = '  Driver bata: ₹' . number_format((int) ($v['driverBataTotal'] ?? 0), 0);
            $belowRt = (float) ($v['extraKmBelowMinimum'] ?? 0);
            if ($belowRt > 0) {
                $lines[] = '  Minimum Coverage Rule: Applied for Round Trip as ' . ($v['minimumBillableKm'] ?? '') . ' KMs coverage (+' . $belowRt . ' km billed)';
            }
        } else {
            $lines[] = '  Billable km: ' . ($v['effectiveBillableKm'] ?? '') . ' (min ' . ($v['minimumBillableKm'] ?? '') . ' km)';
            $lines[] = '  Rate/km: ₹' . ($v['perKmRate'] ?? '') . ' | Km charge: ₹' . number_format((int) ($v['kmCharge'] ?? 0), 0);
            $lines[] = '  Driver bata: ₹' . number_format((int) ($v['driverBata'] ?? 0), 0);
            $below = (float) ($v['extraKmBelowMinimum'] ?? 0);
            if ($below > 0) {
                $lines[] = '  Minimum Coverage Rule: Applied for One-Way as ' . ($v['minimumBillableKm'] ?? '') . ' KMs coverage (+' . $below . ' km billed)';
            }
            if (!empty($v['multiCityStopCharge'])) {
                $lines[] = '  Multi-city stop charge: ₹' . number_format((int) $v['multiCityStopCharge'], 0);
            }
            if (!empty($v['multiCityNightAllowance']) && empty($v['driverNightAllowance'])) {
                $lines[] = '  Night allowance: ₹' . number_format((int) $v['multiCityNightAllowance'], 0);
            }
        }

        $nightAllowance = isset($v['driverNightAllowance']) ? (int)$v['driverNightAllowance'] : 0;
        if ($nightAllowance > 0) {
            $lines[] = '  Driver Night Allowance: ₹' . number_format($nightAllowance, 0);
        }
        $parking = isset($v['parkingCharges']) ? (int)$v['parkingCharges'] : (isset($v['parking']) ? (int)$v['parking'] : 0);
        if ($parking > 0) {
            $lines[] = '  Parking Charges: ₹' . number_format($parking, 0);
        }
        $waiting = isset($v['waitingCharges']) ? (int)$v['waitingCharges'] : (isset($v['waiting']) ? (int)$v['waiting'] : 0);
        if ($waiting > 0) {
            $waitingLabel = 'Waiting Charges';
            if (isset($v['waitingHours']) && (float)$v['waitingHours'] > 0 && isset($v['waitingRate']) && (float)$v['waitingRate'] > 0) {
                $hrs = (float)$v['waitingHours'];
                $rate = (float)$v['waitingRate'];
                $waitingLabel .= ' (' . $hrs . ' ' . ($hrs == 1 ? 'hr' : 'hrs') . ' @ ₹' . number_format($rate, 0) . '/hr)';
            }
            $lines[] = '  ' . $waitingLabel . ': ₹' . number_format($waiting, 0);
        }

        $vtotal = (int) ($v['totalFare'] ?? 0);
        $includeTolls = isset($fb['includeTolls']) ? (bool)$fb['includeTolls'] : ($fareType === 'inclusive');
        $includeTaxes = isset($fb['includeTaxes']) ? (bool)$fb['includeTaxes'] : ($fareType === 'inclusive');

        $dist = (float)($v['actualRouteKm'] ?? $v['actualRouteKmTotal'] ?? $fb['actualRouteKm'] ?? $fb['actualRouteKmOneWay'] ?? 0);
        $estToll = round($dist * 2.0);
        if (isset($v['liveToll']) && $v['liveToll'] !== '' && is_numeric($v['liveToll'])) {
            $estToll = max(0, (int) $v['liveToll']);
        }
        
        if ($includeTolls) {
            $lines[] = '  Highway Tolls (Incl.): ₹' . number_format($estToll, 0);
            $vtotal += $estToll;
        } else {
            $lines[] = '  Highway Tolls: ₹' . number_format($estToll, 0) . ' (Extra)';
        }

        $taxRate = 500;
        if ($vk === 'SUV') $taxRate = 1000;
        if ($vk === 'INNOVA' || $vk === 'CRYSTA') $taxRate = 1500;
        if (isset($fb['overrideTaxAmount'])) {
            $taxRate = (int)$fb['overrideTaxAmount'];
        }

        $totalTax = 0;
        if (isset($fb['overrideTaxCount'])) {
            $totalTax = (int)$fb['overrideTaxCount'] * $taxRate;
            $nBorders = (int)$fb['overrideTaxCount'];
        } else {
            $borders = isset($fb['borderTransitions']) && is_array($fb['borderTransitions']) ? $fb['borderTransitions'] : [];
            $seenBorders = [];
            foreach ($borders as $b) {
                $from = strtolower(trim((string)($b['from'] ?? '')));
                $to = strtolower(trim((string)($b['to'] ?? '')));
                if ($from === '' || $to === '' || $from === $to) continue;
                $key = ($from < $to) ? ($from . '::' . $to) : ($to . '::' . $from);
                if (isset($seenBorders[$key])) continue;
                $seenBorders[$key] = true;
                if (($vk === 'INNOVA' || $vk === 'CRYSTA') && (isset($b['andhraBorder']) && $b['andhraBorder']) && !isset($fb['overrideTaxAmount'])) {
                    $totalTax += 2000;
                } else {
                    $totalTax += $taxRate;
                }
            }
            $nBorders = count($seenBorders);
        }

        if ($includeTaxes) {
            if ($totalTax > 0) {
                $multiplierData = $nBorders > 1 ? " ({$nBorders}x)" : "";
                $lines[] = '  State Entry Tax (Incl.)' . $multiplierData . ': ₹' . number_format($totalTax, 0);
                $vtotal += $totalTax;
            } else {
                $lines[] = '  State Entry Tax: Extra at actuals';
            }
        } else {
            if ($totalTax > 0) {
                $multiplierData = $nBorders > 1 ? " ({$nBorders}x)" : "";
                $lines[] = '  State Entry Tax' . $multiplierData . ': ₹' . number_format($totalTax, 0) . ' (Extra)';
            } else {
                $lines[] = '  State Entry Tax: Extra at actuals';
            }
        }

        $lines[] = '  TOTAL ESTIMATE: ₹' . number_format($vtotal, 0);
    }

    return implode("\n", $lines) . "\n";
}

/**
 * Compact block for Telegram HTML (parse_mode HTML).
 *
 * @param array<string, mixed> $fb
 */
function dropcars_fare_breakdown_telegram_html(array $fb, string $selectedVehicleKey = ''): string
{
    if ($fb === []) {
        return '';
    }
    $plain = trim(dropcars_fare_breakdown_plain($fb, $selectedVehicleKey));
    if ($plain === '') {
        return '';
    }
    $pre = htmlspecialchars($plain, ENT_QUOTES | ENT_HTML5, 'UTF-8');

    return "\n<b>📏 Distance &amp; fare detail</b>\n<pre>" . $pre . '</pre>';
}

/**
 * The toll and the state entry tax (= the customer's PERMIT) the website adds to an INCLUSIVE fare, as plain numbers for the backend
 * (confirm_booking.php -> quoted_fare). Same rules as the breakdown rows above: tolls = live / override amount, else 2 per km; state entry tax =
 * per distinct border crossed (Sedan 500, SUV 1000, Innova / Crysta 1500, 2000 for Innova / Crysta over the Andhra border), or the override.
 * Returns zeros for whatever the fare does not include.
 *
 * @param array<string, mixed> $fb  whole fareBreakdown JSON (top-level overrides)
 * @param array<string, mixed> $v   the selected vehicle's row
 * @return array{toll:int, permit:int}
 */
function dropcars_fare_breakdown_included_extras(array $fb, array $v, string $vk, bool $includeTolls, bool $includeTaxes): array
{
    $vk = strtoupper($vk);
    foreach (['overrideTaxAmount', 'overrideTaxCount', 'borderTransitions', 'actualRouteKm', 'actualRouteKmTotal'] as $k) {
        if (!isset($v[$k]) && isset($fb[$k])) {
            $v[$k] = $fb[$k];
        }
    }
    if (!isset($v['liveToll']) && isset($fb['overrideTollAmount'])) {
        $v['liveToll'] = $fb['overrideTollAmount'];
    }

    $toll = 0;
    if ($includeTolls) {
        $dist = isset($v['actualRouteKm']) || isset($v['actualRouteKmTotal']) ? (float) (isset($v['actualRouteKm']) ? $v['actualRouteKm'] : $v['actualRouteKmTotal']) : 0;
        $toll = (int) round($dist * 2.0);
        if (isset($v['liveToll']) && $v['liveToll'] !== '' && is_numeric($v['liveToll'])) {
            $toll = max(0, (int) $v['liveToll']);
        }
    }

    $permit = 0;
    if ($includeTaxes) {
        $taxRate = 500;
        if ($vk === 'SUV') $taxRate = 1000;
        if ($vk === 'INNOVA' || $vk === 'CRYSTA') $taxRate = 1500;
        if (isset($v['overrideTaxAmount'])) {
            $taxRate = (int) $v['overrideTaxAmount'];
        }
        if (isset($v['overrideTaxCount'])) {
            $permit = (int) $v['overrideTaxCount'] * $taxRate;
        } else {
            $borders = isset($v['borderTransitions']) && is_array($v['borderTransitions']) ? $v['borderTransitions'] : [];
            $seen = [];
            foreach ($borders as $b) {
                $from = strtolower(trim((string) (isset($b['from']) ? $b['from'] : '')));
                $to = strtolower(trim((string) (isset($b['to']) ? $b['to'] : '')));
                if ($from === '' || $to === '' || $from === $to) continue;
                $key = ($from < $to) ? ($from . '::' . $to) : ($to . '::' . $from);
                if (isset($seen[$key])) continue;
                $seen[$key] = true;
                if (($vk === 'INNOVA' || $vk === 'CRYSTA') && !empty($b['andhraBorder']) && !isset($v['overrideTaxAmount'])) {
                    $permit += 2000;
                } else {
                    $permit += $taxRate;
                }
            }
        }
    }
    return ['toll' => $toll, 'permit' => $permit];
}

