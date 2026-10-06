<?php
/**
 * Customer-shareable Telegram copy (HTML for Telegram parse_mode).
 */

function dropcars_tg_h(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
}

/**
 * Admin Telegram — compact enquiry alert.
 *
 * @param array<string, array{name: string, capacity: string, ac: string}> $vehicleMeta
 * @param array<string, int> $estimatesForEmail
 * @param list<string> $stops
 */
function dropcars_telegram_enquiry_admin_html(
    string $bookingId,
    string $customerName,
    string $contactValue,
    string $tripLabel,
    string $pickup,
    string $drop,
    string $travelDate,
    string $travelTime,
    string $vehicleTypeDisplay,
    array $stops,
    array $estimatesForEmail,
    array $vehicleMeta,
    bool $hasSingleVehicleEstimate,
    string $selectedEstimateVehicleKey,
    string $fareTypeRaw,
    string $telegramFareBreakdownBlock,
    bool $isRegularCustomer = false,
    string $managementLink = '',
    string $pageDisplayName = '',
    string $sourceType = '',
    string $customerEmail = ''
): string {
    $lines = [];
    $titleTag = '🚕 <b>New Enquiry</b>';
    if ($pageDisplayName !== '' && (mb_strpos($pageDisplayName, 'Airport') !== false || mb_strpos(mb_strtolower($pageDisplayName), 'airport') !== false)) {
        $titleTag = '✈️ <b>New Airport Taxi Enquiry</b>';
    }
    $lines[] = $titleTag . ' <code>' . dropcars_tg_h($bookingId) . '</code>';
    $lines[] = '';
    $lines[] = '👤 <b>Customer:</b> ' . dropcars_tg_h($customerName) . ($isRegularCustomer ? ' ⭐ <i>(Regular Customer)</i>' : '');

    require_once __DIR__ . '/../helpers/phone-sanitizer.php';
    $normPhone = dropcars_normalize_phone($contactValue);
    if ($normPhone['valid']) {
        $lines[] = '📞 <b>Phone:</b> <a href="tel:' . $normPhone['intlWithPlus'] . '">' . dropcars_tg_h($normPhone['formatted']) . '</a>';
    } else {
        $lines[] = '📞 <b>Phone:</b> ' . dropcars_tg_h($contactValue);
    }
    if ($customerEmail !== '' && strpos($customerEmail, '@') !== false) {
        $lines[] = '✉️ <b>Email:</b> <a href="mailto:' . dropcars_tg_h($customerEmail) . '">' . dropcars_tg_h($customerEmail) . '</a>';
    }

    $lines[] = '';
    if ($pageDisplayName !== '') {
        $lines[] = '🌐 <b>Page:</b> ' . dropcars_tg_h($pageDisplayName);
    }
    if ($sourceType !== '') {
        $lines[] = '📡 <b>Source:</b> ' . dropcars_tg_h($sourceType);
    }
    if ($pageDisplayName !== '' || $sourceType !== '') {
        $lines[] = '';
    }
    $lines[] = '📋 ' . dropcars_tg_h($tripLabel);
    $lines[] = '📍 ' . dropcars_tg_h($pickup) . ' → ' . dropcars_tg_h($drop);
    $stopList = array_values(array_filter(array_map('trim', array_map('strval', $stops))));
    if (!empty($stopList)) {
        $lines[] = '   via: ' . implode(' → ', array_map('dropcars_tg_h', $stopList));
    }
    $lines[] = '📅 ' . dropcars_tg_h($travelDate) . ' · ' . dropcars_tg_h($travelTime);
    $lines[] = '🚗 ' . dropcars_tg_h($vehicleTypeDisplay);
    $lines[] = '';
    if ($hasSingleVehicleEstimate && $selectedEstimateVehicleKey !== '') {
        $singleFare = (int) ($estimatesForEmail[$selectedEstimateVehicleKey] ?? 0);
        $lines[] = '💰 Fare: <b>₹' . number_format($singleFare, 0) . '</b>';
    } else {
        $parts = [];
        foreach ($estimatesForEmail as $vKey => $vFare) {
            $meta = $vehicleMeta[$vKey] ?? ['name' => $vKey];
            $parts[] = dropcars_tg_h($meta['name']) . ' ₹' . number_format((int) $vFare, 0);
        }
        if (!empty($parts)) {
            $lines[] = '💰 ' . implode(' · ', $parts);
        }
    }
    $fareNote = ($fareTypeRaw === 'inclusive')
        ? 'Inclusive · Parking charges extra'
        : 'Exclusive · Toll, parking &amp; state permit extra';
    $lines[] = '<i>' . $fareNote . '</i>';
    if ($telegramFareBreakdownBlock !== '') {
        $lines[] = '';
        $lines[] = $telegramFareBreakdownBlock;
    }
    if ($managementLink !== '') {
        $lines[] = '';
        $lines[] = '🔑 <a href="' . dropcars_tg_h($managementLink) . '">Manage Enquiry</a>';
    }

    return implode("\n", $lines);
}

/**
 * Admin Telegram — compact booking confirmation alert.
 */
function dropcars_telegram_confirm_admin_html(
    string $bookingId,
    string $customerName,
    string $contactValue,
    string $tripLabel,
    string $pickup,
    string $drop,
    string $travelDate,
    string $travelTime,
    string $vehicleType,
    float $distance,
    int $fareEstimate,
    int $discountAmount,
    int $finalFare,
    string $fareType,
    string $telegramFareBreakdownBlock,
    bool $isRegularCustomer = false,
    string $managementLink = '',
    string $pageDisplayName = '',
    string $sourceType = '',
    string $customerEmail = ''
): string {
    $lines = [];
    $titleTag = '🚨 <b>Confirmed Booking</b>';
    if ($pageDisplayName !== '' && (mb_strpos($pageDisplayName, 'Airport') !== false || mb_strpos(mb_strtolower($pageDisplayName), 'airport') !== false)) {
        $titleTag = '✈️ <b>Confirmed Airport Taxi Booking</b>';
    }
    $lines[] = $titleTag . ' <code>' . dropcars_tg_h($bookingId) . '</code>';
    $lines[] = '';
    $lines[] = '👤 <b>Customer:</b> ' . dropcars_tg_h($customerName) . ($isRegularCustomer ? ' ⭐ <i>(Regular Customer)</i>' : '');

    $cleanPhone = preg_replace('/[^\d]/', '', $contactValue);
    if (strlen($cleanPhone) >= 10) {
        $waPhone = (strlen($cleanPhone) === 10) ? '91' . $cleanPhone : $cleanPhone;
        $displayPhone = (strlen($cleanPhone) === 10) ? '+91 ' . substr($cleanPhone, 0, 5) . ' ' . substr($cleanPhone, 5) : '+' . $cleanPhone;
        $lines[] = '📞 <b>Phone:</b> <a href="tel:+' . $waPhone . '">' . dropcars_tg_h($displayPhone) . '</a>';
    } else {
        $lines[] = '📞 <b>Phone:</b> ' . dropcars_tg_h($contactValue);
    }
    if ($customerEmail !== '' && strpos($customerEmail, '@') !== false) {
        $lines[] = '✉️ <b>Email:</b> <a href="mailto:' . dropcars_tg_h($customerEmail) . '">' . dropcars_tg_h($customerEmail) . '</a>';
    }

    $lines[] = '';
    if ($pageDisplayName !== '') {
        $lines[] = '🌐 <b>Page:</b> ' . dropcars_tg_h($pageDisplayName);
    }
    if ($sourceType !== '') {
        $lines[] = '📡 <b>Source:</b> ' . dropcars_tg_h($sourceType);
    }
    if ($pageDisplayName !== '' || $sourceType !== '') {
        $lines[] = '';
    }
    $lines[] = '📋 ' . dropcars_tg_h($tripLabel);
    $lines[] = '📍 ' . dropcars_tg_h($pickup) . ' → ' . dropcars_tg_h($drop);
    $lines[] = '📅 ' . dropcars_tg_h($travelDate) . ' · ' . dropcars_tg_h($travelTime);
    $lines[] = '🚗 ' . dropcars_tg_h($vehicleType);
    if ($distance > 0) {
        $lines[] = '🛣 ~' . number_format($distance, 0) . ' km';
    }
    $lines[] = '';
    if ($discountAmount > 0) {
        $lines[] = '💰 Fare: <b>₹' . number_format($finalFare, 0) . '</b> <s>₹' . number_format($fareEstimate, 0) . '</s> (−₹' . number_format($discountAmount, 0) . ')';
    } else {
        $lines[] = '💰 Fare: <b>₹' . number_format($finalFare, 0) . '</b>';
    }
    $fareNote = ($fareType === 'inclusive')
        ? 'Inclusive · Parking charges extra'
        : 'Exclusive · Toll, parking &amp; state permit extra';
    $lines[] = '<i>' . $fareNote . '</i>';
    if ($telegramFareBreakdownBlock !== '') {
        $lines[] = '';
        $lines[] = $telegramFareBreakdownBlock;
    }
    if ($managementLink !== '') {
        $lines[] = '';
        $lines[] = '🔑 <a href="' . dropcars_tg_h($managementLink) . '">Manage Booking</a>';
    }

    return implode("\n", $lines);
}

/**
 * Helper to generate Telegram Inline Keyboard Buttons for Admin Enquiry Notifications.
 */
function dropcars_telegram_enquiry_admin_buttons(
    string $bookingId,
    string $contactValue,
    string $customerEmail = '',
    string $websiteUrl = 'https://dropcars.in'
): array {
    $baseUrl = rtrim($websiteUrl, '/');
    $cleanPhone = preg_replace('/[^\d]/', '', $contactValue);

    $row1 = [];
    if (strlen($cleanPhone) >= 10) {
        $waPhone = (strlen($cleanPhone) === 10) ? '91' . $cleanPhone : $cleanPhone;
        $row1[] = [
            'text' => '💬 WhatsApp',
            'url' => 'https://wa.me/' . $waPhone
        ];
    }
    $row1[] = [
        'text' => '🔍 Manage Enquiry',
        'url' => $baseUrl . '/admin/enquiries?search=' . urlencode($bookingId)
    ];

    $row2 = [
        [
            'text' => '⚡ Confirm Booking',
            'url' => $baseUrl . '/admin/enquiries?action=confirm&booking_id=' . urlencode($bookingId)
        ],
        [
            'text' => '📍 Track Trip',
            'url' => $baseUrl . '/track-booking/' . urlencode($bookingId)
        ]
    ];

    return [
        'inline_keyboard' => [$row1, $row2]
    ];
}

/**
 * Helper to generate Telegram Inline Keyboard Buttons for Admin Booking Confirmations.
 */
function dropcars_telegram_confirm_admin_buttons(
    string $bookingId,
    string $contactValue,
    int $bookingDbId = 0,
    string $websiteUrl = 'https://dropcars.in'
): array {
    $baseUrl = rtrim($websiteUrl, '/');
    $cleanPhone = preg_replace('/[^\d]/', '', $contactValue);

    $manageUrl = $bookingDbId > 0
        ? $baseUrl . '/admin/customize-booking?id=' . $bookingDbId . '&source=booking'
        : $baseUrl . '/admin/enquiries?search=' . urlencode($bookingId);

    $row1 = [];
    if (strlen($cleanPhone) >= 10) {
        $waPhone = (strlen($cleanPhone) === 10) ? '91' . $cleanPhone : $cleanPhone;
        $row1[] = [
            'text' => '💬 WhatsApp',
            'url' => 'https://wa.me/' . $waPhone
        ];
    }
    $row1[] = [
        'text' => '⚙️ Manage Booking',
        'url' => $manageUrl
    ];

    $row2 = [
        [
            'text' => '📍 Track Booking Live',
            'url' => $baseUrl . '/track-booking/' . urlencode($bookingId)
        ]
    ];

    return [
        'inline_keyboard' => [$row1, $row2]
    ];
}

/**
 * @param array<string, array{name: string, capacity: string, ac: string}> $vehicleMeta
 * @param array<string, int> $estimatesForEmail
 * @param list<string> $stops
 */
function dropcars_telegram_enquiry_customer_html(
    string $bookingId,
    string $customerName,
    string $contactValue,
    string $tripLabel,
    string $pickup,
    string $drop,
    string $travelDate,
    string $travelTime,
    array $stops,
    array $estimatesForEmail,
    array $vehicleMeta,
    string $trackingUrl,
    string $fareType = 'base',
    string $fareBreakdownHtml = ''
): string {
    $fareTypeLabel = $fareType === 'inclusive'
        ? 'Inclusive (toll/tax included where applicable)'
        : 'Exclusive (toll, parking &amp; state permit / border tax extra - applicable only if crossing state border)';
    $lines = [];
    $lines[] = '<b>Drop Cars</b> — your trip enquiry';
    $lines[] = '';
    $lines[] = 'Hi ' . dropcars_tg_h($customerName) . ',';
    $lines[] = 'Here is a summary you can forward to us or keep for your records.';
    $lines[] = '';
    $lines[] = '<b>Booking ID</b>: <code>' . dropcars_tg_h($bookingId) . '</code>';
    $lines[] = '<b>Contact</b>: ' . dropcars_tg_h($contactValue);
    $lines[] = '';
    $lines[] = '<b>Trip</b>';
    $lines[] = '📋 ' . dropcars_tg_h($tripLabel);
    $lines[] = '📍 From: ' . dropcars_tg_h($pickup);
    $lines[] = '📍 To: ' . dropcars_tg_h($drop);
    $lines[] = '📅 ' . dropcars_tg_h(trim($travelDate . ' · ' . $travelTime));
    if ($stops !== []) {
        $lines[] = '';
        $lines[] = '<b>Stops</b>';
        foreach ($stops as $s) {
            $t = trim((string) $s);
            if ($t !== '') {
                $lines[] = '• ' . dropcars_tg_h($t);
            }
        }
    }
    $lines[] = '';
    $lines[] = '<b>Estimated tariff by car</b> <i>(indicative)</i>';
    $lines[] = $fareTypeLabel . '.';
    foreach (['SEDAN', 'SUV', 'INNOVA', 'CRYSTA'] as $key) {
        if (!isset($estimatesForEmail[$key]) || (int) $estimatesForEmail[$key] <= 0) {
            continue;
        }
        $meta = $vehicleMeta[$key] ?? ['name' => $key, 'capacity' => '', 'ac' => 'A/C'];
        $amt = number_format((int) $estimatesForEmail[$key], 0, '.', ',');
        $cap = $meta['capacity'] !== '' ? ' · ' . $meta['capacity'] : '';
        $lines[] = '• <b>' . dropcars_tg_h($meta['name']) . '</b>' . dropcars_tg_h($cap) . ' · ' . dropcars_tg_h($meta['ac'])
            . "\n   ₹" . $amt;
    }
    $lines[] = '';
    $lines[] = '<b>Includes</b>: air-conditioned vehicle with driver, base fare, fuel charges, driver allowance (bata), 24/7 customer support' . ($fareType === 'inclusive' ? ', toll charges, state border tax (if crossing state border)' : '') . '.';
    $lines[] = '<b>Excludes</b>: ' . ($fareType === 'inclusive' ? 'state border tax (if crossing border & not explicitly shown above), ' : 'toll charges, state border tax (applicable only if crossing state border), ') . 'parking and entry fees, (if any), extra KMs (if exceeded), waiting or additional stop charges (if availed).';
    $lines[] = '';
    $lines[] = 'ℹ️ <b>Trip Rule</b>: KM limit and round trip KMs are always calculated garage-to-garage until the return back to the pickup point.';
    $lines[] = '';
    if ($fareBreakdownHtml !== '') {
        $lines[] = $fareBreakdownHtml;
        $lines[] = '';
    }
    $lines[] = '📞 <b>Need help?</b> Call <a href="tel:+917200217986">7200217986</a> (24×7) and quote your Booking ID.';
    $lines[] = '🔎 <b>Track</b>: <a href="' . dropcars_tg_h($trackingUrl) . '">' . dropcars_tg_h($trackingUrl) . '</a>';

    return implode("\n", $lines);
}

/**
 * @param array<string, array{name: string, capacity: string, ac: string}> $vehicleMeta
 * @param array<string, int> $estimatesForEmail
 * @param list<string> $stops
 */
function dropcars_telegram_confirm_customer_html(
    string $bookingId,
    string $customerName,
    string $contactValue,
    string $tripLabel,
    string $pickup,
    string $drop,
    string $travelDate,
    string $travelTime,
    array $stops,
    array $estimatesForEmail,
    array $vehicleMeta,
    string $selectedVehicleKey,
    int $confirmedFare,
    float $distanceKm,
    string $trackingUrl,
    string $fareType = 'base',
    ?string $endDate = null,
    ?string $returnTime = null,
    string $fareBreakdownHtml = ''
): string {
    $fareTypeLabel = $fareType === 'inclusive'
        ? 'Inclusive (toll/tax included where applicable)'
        : 'Exclusive (toll, parking &amp; state permit / border tax extra - applicable only if crossing state border)';
    $lines = [];
    $lines[] = '<b>Drop Cars</b> — booking received';
    $lines[] = '';
    $lines[] = 'Hi ' . dropcars_tg_h($customerName) . ',';
    $lines[] = 'Thank you! Your booking request is received. Share this message with family or our team if needed.';
    $lines[] = '';
    $lines[] = '<b>Booking ID</b>: <code>' . dropcars_tg_h($bookingId) . '</code>';
    $lines[] = '<b>Contact</b>: ' . dropcars_tg_h($contactValue);
    $lines[] = '';
    $lines[] = '<b>Trip</b>';
    $lines[] = '📋 ' . dropcars_tg_h($tripLabel);
    $lines[] = '📍 From: ' . dropcars_tg_h($pickup);
    $lines[] = '📍 To: ' . dropcars_tg_h($drop);
    $lines[] = '📅 Pickup: ' . dropcars_tg_h(trim($travelDate . ' · ' . $travelTime));
    if ($endDate !== null && $endDate !== '' && $returnTime !== null && $returnTime !== '') {
        $lines[] = '📅 Return: ' . dropcars_tg_h(trim($endDate . ' · ' . $returnTime));
    }
    if ($distanceKm > 0) {
        $lines[] = '🛣 ~' . dropcars_tg_h((string) (int) round($distanceKm)) . ' km (estimate)';
    }
    if ($stops !== []) {
        $lines[] = '';
        $lines[] = '<b>Stops</b>';
        foreach ($stops as $s) {
            $t = trim((string) $s);
            if ($t !== '') {
                $lines[] = '• ' . dropcars_tg_h($t);
            }
        }
    }
    $lines[] = '';
    $lines[] = '<b>Your selected car &amp; fare</b>';
    $vk = strtoupper(preg_replace('/[^A-Z]/', '', $selectedVehicleKey)) ?: 'SEDAN';
    $metaSel = $vehicleMeta[$vk] ?? ['name' => $vk, 'capacity' => '', 'ac' => 'A/C'];
    $lines[] = '🚗 ' . dropcars_tg_h($metaSel['name']);
    $lines[] = '💰 <b>₹' . number_format($confirmedFare, 0, '.', ',') . '</b> — ' . $fareTypeLabel . '.';
    $lines[] = '';
    $lines[] = '<b>All car options &amp; fares</b> <i>(same trip)</i>';
    foreach (['SEDAN', 'SUV', 'INNOVA', 'CRYSTA'] as $key) {
        if (!isset($estimatesForEmail[$key]) || (int) $estimatesForEmail[$key] <= 0) {
            continue;
        }
        $meta = $vehicleMeta[$key] ?? ['name' => $key, 'capacity' => '', 'ac' => 'A/C'];
        $amt = number_format((int) $estimatesForEmail[$key], 0, '.', ',');
        $mark = ($key === $vk) ? '✓ ' : '';
        $cap = $meta['capacity'] !== '' ? ' · ' . $meta['capacity'] : '';
        $lines[] = $mark . '<b>' . dropcars_tg_h($meta['name']) . '</b>' . dropcars_tg_h($cap) . ' — ₹' . $amt;
    }
    $lines[] = '';
    $lines[] = '<b>Includes</b>: air-conditioned vehicle with driver, base fare, fuel charges, driver allowance (bata), 24/7 customer support' . ($fareType === 'inclusive' ? ', toll charges, state border tax (if crossing state border)' : '') . '.';
    $lines[] = '<b>Excludes</b>: ' . ($fareType === 'inclusive' ? 'state border tax (if crossing border & not explicitly shown above), ' : 'toll charges, state border tax (applicable only if crossing state border), ') . 'parking and entry fees, (if any), extra KMs (if exceeded), waiting or additional stop charges (if availed).';
    $lines[] = '';
    $lines[] = 'ℹ️ <b>Trip Rule</b>: KM limit and round trip KMs are always calculated garage-to-garage until the return back to the pickup point.';
    $lines[] = '';
    if ($fareBreakdownHtml !== '') {
        $lines[] = $fareBreakdownHtml;
        $lines[] = '';
    }
    $lines[] = '📞 <b>Questions?</b> Call <a href="tel:+917200217986">7200217986</a> — quote your Booking ID.';
    $lines[] = '🔎 <b>Track</b>: <a href="' . dropcars_tg_h($trackingUrl) . '">' . dropcars_tg_h($trackingUrl) . '</a>';

    return implode("\n", $lines);
}
