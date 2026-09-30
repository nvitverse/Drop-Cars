<?php
/**
 * Drop Cars – Centralized Notification Engine
 * Evaluates the Customer Settings Matrix and dispatches automated Email/SMS/WhatsApp updates.
 */

defined('DROP_CARS_SAFE') || define('DROP_CARS_SAFE', true);

/**
 * Main dispatcher for all customer booking lifecycle events.
 *
 * @param PDO $pdo Database connection
 * @param int|string|array $bookingOrId Booking ID, reference code, or full row array
 * @param string $eventName One of: 'enquiry', 'confirmed', 'driver_assigned', 'completed', 'cancelled'
 * @param array $extraData Additional parameters (e.g. customized messages)
 * @return array{emailSent: bool, smsTriggered: bool, whatsappTriggered: bool}
 */
function dropcars_dispatch_notifications(PDO $pdo, $bookingOrId, string $eventName, array $extraData = []): array
{
    $results = ['emailSent' => false, 'smsTriggered' => false, 'whatsappTriggered' => false];
    
    // 1. Resolve Booking & Customer Row
    $booking = null;
    if (is_array($bookingOrId)) {
        $booking = $bookingOrId;
    } else {
        try {
            $stmt = $pdo->prepare("SELECT b.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email 
                                   FROM `bookings` b 
                                   JOIN `customers` c ON b.customer_id = c.id 
                                   WHERE b.id = ? OR b.booking_id = ? 
                                   LIMIT 1");
            $stmt->execute([$bookingOrId, $bookingOrId]);
            $booking = $stmt->fetch(PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            error_log('Notification Engine - booking fetch error: ' . $e->getMessage());
        }
    }
    
    if (!$booking) {
        // Fall back to enquiries table if not found in bookings (e.g., for early enquiry updates)
        try {
            $stmt = $pdo->prepare("SELECT * FROM `enquiries` WHERE `id` = ? OR `booking_id` = ? LIMIT 1");
            $stmt->execute([$bookingOrId, $bookingOrId]);
            $enquiry = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($enquiry) {
                $booking = [
                    'booking_id' => $enquiry['booking_id'],
                    'customer_name' => $enquiry['name'],
                    'customer_phone' => $enquiry['phone'],
                    'customer_email' => $enquiry['email'] ?? '',
                    'pickup_location' => $enquiry['pickup'],
                    'drop_location' => $enquiry['drop_location'],
                    'pickup_date' => $enquiry['travel_date'],
                    'pickup_time' => $enquiry['travel_time'],
                    'trip_type' => $enquiry['trip_type'],
                    'vehicle_type' => $enquiry['vehicle_type'],
                    'estimated_fare' => $enquiry['fare_estimate'],
                    'final_fare' => $enquiry['fare_estimate'],
                    'fare_type' => $enquiry['fare_type'],
                    'source' => $enquiry['source'],
                    'source_page' => $enquiry['source_page'] ?? '',
                ];
            }
        } catch (\Throwable $e) {
            error_log('Notification Engine - enquiry fallback error: ' . $e->getMessage());
        }
    }

    if (!$booking) {
        error_log("Notification Engine Error: Booking or Enquiry record not resolved for: " . print_r($bookingOrId, true));
        return $results;
    }

    // 2. Load Configuration Matrix Toggles
    $root = dirname(__DIR__);
    $configPath = $root . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'config.php';
    if (!is_file($configPath)) {
        $configPath = $root . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'config.example.php';
    }
    $config = is_file($configPath) ? (include $configPath) : [];
    
    $cEmail = trim((string) ($booking['customer_email'] ?? $booking['email'] ?? ''));
    $cPhone = preg_replace('/\s+/', '', trim((string) ($booking['customer_phone'] ?? $booking['phone'] ?? '')));

    // 3. Dispatch Email if Matrix Toggle is Enabled & Customer Email is present
    $emailToggle = (bool) ($config["notify_customer_email_{$eventName}"] ?? false);
    if ($emailToggle && $cEmail !== '' && strpos($cEmail, '@') !== false) {
        $mailHelperPath = $root . DIRECTORY_SEPARATOR . 'admin' . DIRECTORY_SEPARATOR . 'includes' . DIRECTORY_SEPARATOR . 'mail.php';
        if (is_file($mailHelperPath)) {
            require_once $mailHelperPath;
            if (function_exists('dropcars_admin_send_mail')) {
                $emailData = dropcars_build_customer_email($booking, $eventName, $config);
                $mailRes = dropcars_admin_send_mail($cEmail, $emailData['subject'], $emailData['html'], $emailData['plain'], $booking['source_page'] ?? '');
                if ($mailRes['ok']) {
                    $results['emailSent'] = true;
                } else {
                    error_log("Notification Engine - PHPMailer dispatch failed: " . $mailRes['error']);
                }
            }
        }
    }

    // 4. Dispatch SMS if Matrix Toggle is Enabled
    $smsToggle = (bool) ($config["notify_customer_sms_{$eventName}"] ?? false);
    if ($smsToggle && $cPhone !== '') {
        // SMS Gateway hook placeholder – can interface with twilio or custom gateway
        $results['smsTriggered'] = true;
        error_log("Notification Engine - SMS triggered for event {$eventName} to {$cPhone}");
    }

    // 5. Dispatch WhatsApp if Matrix Toggle is Enabled
    $waToggle = (bool) ($config["notify_customer_whatsapp_{$eventName}"] ?? false);
    if ($waToggle && $cPhone !== '') {
        // WhatsApp API Gateway trigger placeholder
        $results['whatsappTriggered'] = true;
        error_log("Notification Engine - WhatsApp triggered for event {$eventName} to {$cPhone}");
    }

    return $results;
}

/**
 * Generates beautiful customer-facing responsive HTML templates and subjects.
 *
 * @param array $booking Full booking details
 * @param string $eventName Event keyword
 * @param array $config Site configurations
 * @return array{subject: string, html: string, plain: string}
 */
function dropcars_build_customer_email(array $booking, string $eventName, array $config): array
{
    $bookingId = $booking['booking_id'] ?? $booking['id'] ?? 'N/A';
    $customerName = htmlspecialchars($booking['customer_name'] ?? 'Valued Customer');
    $pickup = htmlspecialchars($booking['pickup_location'] ?? 'N/A');
    $drop = htmlspecialchars($booking['drop_location'] ?? 'N/A');
    $date = htmlspecialchars($booking['pickup_date'] ?? 'N/A');
    $time = htmlspecialchars($booking['pickup_time'] ?? 'N/A');
    $fare = number_format((float) ($booking['final_fare'] ?: $booking['estimated_fare'] ?: 0), 0);
    $vehicle = htmlspecialchars($booking['car_name'] ?? $booking['vehicle_type'] ?? 'Sedan');
    
    $websiteUrl = rtrim($config['websiteUrl'] ?? 'https://dropcars.in', '/') . '/';
    $reviewLink = $config['reviewLink'] ?? '';
    
    // Core Layout Styling Wrapper
    $headerColor = '#0b2d6e'; // Sleek dark blue
    $accentColor = '#ff7a00'; // Vibrant brand orange
    
    $selectedVehicleType = $booking['vehicle_type'] ?? $booking['car_name'] ?? 'SEDAN';
    $tripType = strtolower($booking['trip_type'] ?? '');
    
    $extraKmRateStr = '?';
    $tariffsPath = __DIR__ . '/../data/tariffs.json';
    if (file_exists($tariffsPath)) {
        $tariffs = json_decode(file_get_contents($tariffsPath), true);
        if (is_array($tariffs)) {
            foreach ($tariffs as $t) {
                if (strtoupper($t['vehicle_type']) === strtoupper($selectedVehicleType) &&
                    ((strpos($tripType, 'round') !== false && $t['trip_type'] === 'round') || 
                     (strpos($tripType, 'round') === false && $t['trip_type'] === 'oneway'))) {
                    $extraKmRateStr = '₹' . $t['per_km_rate'];
                    break;
                }
            }
        }
    }
    $isHourlyCheck = strpos($tripType, 'hourly') !== false;
    $isRoundTripCheck = (strpos($tripType, 'round') !== false || $isHourlyCheck);
    $garageText = $isRoundTripCheck ? ' - calculated garage-to-garage/until return to pickup point' : '';

    // Rental waiting/extra time & km is billed at the hourly package tariff,
    // not the flat ₹150/stop/hour fee - matches assets/js/booking-form.js.
    $waitingChargeText = 'Waiting or additional stop charges (₹150 per stop/hour), if availed';
    if ($isHourlyCheck) {
        $dcFaresCfg = null;
        $dcCfgPath = __DIR__ . '/../data/config.json';
        if (file_exists($dcCfgPath)) {
            $dcCfgJson = json_decode(file_get_contents($dcCfgPath), true);
            $dcFaresCfg = $dcCfgJson['fares'] ?? null;
        }
        $hourlyRateNe = $dcFaresCfg ? (int) ($dcFaresCfg['hourlyRates'][strtoupper((string) $selectedVehicleType)] ?? 0) : 0;
        if ($hourlyRateNe > 0) {
            $waitingChargeText = "Extra hour beyond package at ₹{$hourlyRateNe}/hr, Extra km beyond package at ₹" . round($hourlyRateNe / 10) . "/km (as per hourly tariff)";
        }
    }
    
    $subject = "";
    $contentHtml = "";
    $plainText = "";

    switch ($eventName) {
        case 'pending':
            $base_val = (float)($booking['base_fare'] ?: ($booking['estimated_fare'] ?: 0));
            $disc_val = (float)($booking['discount_amount'] ?: 0);
            $gst_percent_val = (float)($booking['gst_percent'] ?: 5.00);
            $gst_amount_val = (float)($booking['gst_amount'] ?: 0.00);
            $include_gst_val = (int)($booking['include_gst'] ?? 0);

            $subject = "⏳ Booking Request Placed - Booking ID: {$bookingId}";
            $contentHtml = '
                <div class="premium-badge" style="background:#fffbeb; color:#b45309;">Request Placed</div>
                <h2 style="margin: 0 0 10px 0; color: #0b2d6e; font-size: 20px; font-weight: 800;">We Have Received Your Request</h2>
                <p>Dear ' . $customerName . ',</p>
                <p>Thank you for choosing Drop Cars! We have received your booking request and are currently processing it. A dispatcher will review your request and confirm it shortly.</p>
                
                <div class="trip-card">
                    <div class="trip-row"><span class="trip-label">Booking ID</span><span class="trip-value">#' . $bookingId . '</span></div>
                    <div class="trip-row"><span class="trip-label">Route</span><span class="trip-value">' . $pickup . ' ➔ ' . $drop . '</span></div>
                    <div class="trip-row"><span class="trip-label">Pickup Schedule</span><span class="trip-value">' . date('d M Y', strtotime($date)) . ' at ' . $time . '</span></div>
                    <div class="trip-row"><span class="trip-label">Car Category</span><span class="trip-value">' . $vehicle . '</span></div>
                    <div class="trip-row" style="border-top: 1px solid #cbd5e1; margin-top: 10px; padding-top: 8px;">
                        <span class="trip-label" style="font-weight: 800; color: #0f172a; display: block; margin-bottom: 8px;">Estimated Fare Details</span>
                        <div class="trip-value" style="display: block; width: 100%;">
                            <table style="width: 100%; font-size: 13.5px; border-collapse: collapse; border: none;">
                                <tr style="border: none;">
                                    <td style="color: #64748b; padding: 3px 0; border: none;">Base Fare Estimate:</td>
                                    <td style="text-align: right; color: #0f172a; font-weight: 700; padding: 3px 0; border: none;">₹' . number_format($base_val, 0) . '</td>
                                </tr>';
            if ($disc_val > 0) {
                $contentHtml .= '
                                <tr style="border: none;">
                                    <td style="color: #ef4444; padding: 3px 0; border: none;">Discount Coupon:</td>
                                    <td style="text-align: right; color: #ef4444; font-weight: 700; padding: 3px 0; border: none;">-₹' . number_format($disc_val, 0) . '</td>
                                </tr>';
            }
            if ($include_gst_val === 1 && $gst_amount_val > 0) {
                $contentHtml .= '
                                <tr style="border: none;">
                                    <td style="color: #64748b; padding: 3px 0; border: none;">GST (' . number_format($gst_percent_val, 2) . '%):</td>
                                    <td style="text-align: right; color: #0f172a; font-weight: 700; padding: 3px 0; border: none;">₹' . number_format($gst_amount_val, 0) . '</td>
                                </tr>';
            }
            $contentHtml .= '
                                <tr style="border-top: 1px solid #cbd5e1; border-left: none; border-right: none; border-bottom: none;">
                                    <td style="color: #0f172a; font-weight: 800; padding: 8px 0 0 0; border: none;">Total Estimated Fare:</td>
                                    <td style="text-align: right; color: #166534; font-size: 17px; font-weight: 800; padding: 8px 0 0 0; border: none;">₹' . $fare . '</td>
                                </tr>
                            </table>
                        </div>
                </div>

                ' . ($isRoundTripCheck ? '
                <div style="font-size: 11.5px; color: #78350f; margin-top: 12px; line-height: 1.4; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 10px; margin-bottom: 15px;">
                  <strong>ℹ️ Trip Rule:</strong> KM limits and round trip KMs are always calculated on a garage-to-garage basis until the vehicle returns back to the pickup point.
                </div>
                ' : '') . '

                <a href="' . $websiteUrl . 'track-booking/' . $bookingId . '" class="btn-cta">📱 Track Your Booking Live</a>
                <a href="tel:+917200217986" class="btn-call">📞 Call Support: +91 72002 17986</a>
            ';
            $plainText = "Booking Request Placed!\n\nDear {$customerName},\nYour booking request #{$bookingId} has been placed.\nRoute: {$pickup} -> {$drop}\nDate: {$date} | Time: {$time}\nVehicle: {$vehicle}\nEstimated Fare: ₹{$fare}\n" . ($isRoundTripCheck ? "\nℹ️ Trip Rule: KM limits and round trip KMs are always calculated garage-to-garage until return to pickup point.\n" : "") . "\nTrack booking live: {$websiteUrl}track-booking/{$bookingId}";
            break;

        case 'confirmed':
            $base_val = (float)($booking['base_fare'] ?: ($booking['estimated_fare'] ?: 0));
            $disc_val = (float)($booking['discount_amount'] ?: 0);
            $gst_percent_val = (float)($booking['gst_percent'] ?: 5.00);
            $gst_amount_val = (float)($booking['gst_amount'] ?: 0.00);
            $include_gst_val = (int)($booking['include_gst'] ?? 0);

            $subject = "\u{2705} Ride Confirmed! Booking ID: {$bookingId} - Drop Cars";
            $contentHtml = '
                <div class="premium-badge">Booking Confirmed</div>
                <h2 style="margin: 0 0 10px 0; color: #0b2d6e; font-size: 20px; font-weight: 800;">Your Ride is Locked In!</h2>
                <p>Dear ' . $customerName . ',</p>
                <p>We are delighted to let you know that your intercity taxi booking has been successfully confirmed. A clean, sanitized cab and a highly professional chauffeur will be assigned for your journey.</p>
                
                <div class="trip-card">
                    <div class="trip-row"><span class="trip-label">Booking ID</span><span class="trip-value">#' . $bookingId . '</span></div>
                    <div class="trip-row"><span class="trip-label">Route</span><span class="trip-value">' . $pickup . ' ➔ ' . $drop . '</span></div>
                    <div class="trip-row"><span class="trip-label">Pickup Schedule</span><span class="trip-value">' . date('d M Y', strtotime($date)) . ' at ' . $time . '</span></div>
                    <div class="trip-row"><span class="trip-label">Car Category</span><span class="trip-value">' . $vehicle . '</span></div>
                    <div class="trip-row" style="border-top: 1px solid #cbd5e1; margin-top: 10px; padding-top: 8px;">
                        <span class="trip-label" style="font-weight: 800; color: #0f172a; display: block; margin-bottom: 8px;">Fare Details</span>
                        <div class="trip-value" style="display: block; width: 100%;">
                            <table style="width: 100%; font-size: 13.5px; border-collapse: collapse; border: none;">
                                <tr style="border: none;">
                                    <td style="color: #64748b; padding: 3px 0; border: none;">Base Fare Estimate:</td>
                                    <td style="text-align: right; color: #0f172a; font-weight: 700; padding: 3px 0; border: none;">₹' . number_format($base_val, 0) . '</td>
                                </tr>';
            if ($disc_val > 0) {
                $contentHtml .= '
                                <tr style="border: none;">
                                    <td style="color: #ef4444; padding: 3px 0; border: none;">Discount Coupon:</td>
                                    <td style="text-align: right; color: #ef4444; font-weight: 700; padding: 3px 0; border: none;">-₹' . number_format($disc_val, 0) . '</td>
                                </tr>';
            }
            if ($include_gst_val === 1 && $gst_amount_val > 0) {
                $contentHtml .= '
                                <tr style="border: none;">
                                    <td style="color: #64748b; padding: 3px 0; border: none;">GST (' . number_format($gst_percent_val, 2) . '%):</td>
                                    <td style="text-align: right; color: #0f172a; font-weight: 700; padding: 3px 0; border: none;">₹' . number_format($gst_amount_val, 0) . '</td>
                                </tr>';
            }
            $contentHtml .= '
                                <tr style="border-top: 1px solid #cbd5e1; border-left: none; border-right: none; border-bottom: none;">
                                    <td style="color: #0f172a; font-weight: 800; padding: 8px 0 0 0; border: none;">Total Confirmed Fare:</td>
                                    <td style="text-align: right; color: #166534; font-size: 17px; font-weight: 800; padding: 8px 0 0 0; border: none;">₹' . $fare . '</td>
                                </tr>
                            </table>
                        </div>
                </div>

                ' . ($isRoundTripCheck ? '
                <div style="font-size: 11.5px; color: #78350f; margin-top: 12px; line-height: 1.4; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 10px; margin-bottom: 15px;">
                  <strong>ℹ️ Trip Rule:</strong> KM limits and round trip KMs are always calculated on a garage-to-garage basis until the vehicle returns back to the pickup point.
                </div>
                ' : '') . '

                <a href="' . $websiteUrl . 'track-booking/' . $bookingId . '" class="btn-cta">📱 Track Your Booking Live</a>
                <a href="tel:+917200217986" class="btn-call">📞 Call Support: +91 72002 17986</a>
            ';
            $plainText = "Ride Confirmed!\n\nDear {$customerName},\nYour booking #{$bookingId} is confirmed.\nRoute: {$pickup} -> {$drop}\nDate: {$date} | Time: {$time}\nVehicle: {$vehicle}\nConfirmed Fare: ₹{$fare}\n" . ($isRoundTripCheck ? "\nℹ️ Trip Rule: KM limits and round trip KMs are always calculated garage-to-garage until return to pickup point.\n" : "") . "\nTrack booking live: {$websiteUrl}track-booking/{$bookingId}";
            break;

        case 'driver_assigned':
            $driverName = htmlspecialchars($booking['driver_name'] ?? 'N/A');
            $driverPhone = htmlspecialchars($booking['driver_phone'] ?? 'N/A');
            $carNumber = htmlspecialchars($booking['car_number'] ?? 'N/A');
            $carModel = htmlspecialchars($booking['car_name'] ?? $booking['vehicle_type'] ?? 'N/A');

            if (!function_exists('dropcars_slugify_str')) {
                function dropcars_slugify_str($str) {
                    $str = strtolower(trim((string)$str));
                    $str = preg_replace('/[^\w\s-]/', '', $str);
                    $str = preg_replace('/[\s_-]+/', '-', $str);
                    return trim($str, '-') ?: 'route';
                }
            }

            $pickupSlug = dropcars_slugify_str($booking['pickup_location'] ?? 'pickup');
            $dropSlug   = dropcars_slugify_str($booking['drop_location'] ?? 'drop');
            $routeUrl   = $websiteUrl . 'drop-cars/' . $pickupSlug . '-to-' . $dropSlug;
            $trackUrl   = $websiteUrl . 'track-booking/' . $bookingId;

            $waShareText = "🚖 *Drop Cars - Driver & Route Details*\n"
                         . "📋 *Booking ID:* #" . $bookingId . "\n"
                         . "📍 *Route:* " . $pickup . " ➔ " . $drop . "\n"
                         . "👨‍✈️ *Chauffeur:* " . $driverName . " (" . $driverPhone . ")\n"
                         . "🚘 *Cab:* " . $carModel . " [" . $carNumber . "]\n"
                         . "🌐 *Route Page:* " . $routeUrl . "\n"
                         . "📱 *Track Live:* " . $trackUrl;

            $waShareUrl = "https://api.whatsapp.com/send?text=" . urlencode($waShareText);

            $subject = "🚖 Chauffeur & Cab Assigned: Booking ID: {$bookingId} - Drop Cars";
            $contentHtml = '
                <div class="premium-badge" style="background:#fffbeb; color:#b45309;">Chauffeur Assigned</div>
                <h2 style="margin: 0 0 10px 0; color: #0b2d6e; font-size: 20px; font-weight: 800;">Your Driver & Cab Details</h2>
                <p>Dear ' . $customerName . ',</p>
                <p>Great news! Chauffeur and vehicle resources have been locked in for your scheduled trip. Details below:</p>
                
                <div class="trip-card" style="background:#fdfdfd; border-left:4px solid #ff7a00;">
                    <div style="font-size: 13px; font-weight: 800; color: #ff7a00; text-transform: uppercase; margin-bottom: 8px;">🚖 Vehicle Details</div>
                    <div class="trip-row"><span class="trip-label">Cab Model</span><span class="trip-value">' . $carModel . '</span></div>
                    <div class="trip-row"><span class="trip-label">Plate Number</span><span class="trip-value" style="background:#f1f5f9; padding:2px 8px; border-radius:4px; font-weight:800; font-family:monospace;">' . $carNumber . '</span></div>
                    
                    <div style="font-size: 13px; font-weight: 800; color: #ff7a00; text-transform: uppercase; margin: 15px 0 8px 0;">👨‍✈️ Driver Details</div>
                    <div class="trip-row"><span class="trip-label">Chauffeur Name</span><span class="trip-value">' . $driverName . '</span></div>
                    <div class="trip-row"><span class="trip-label">Contact Phone</span><span class="trip-value" style="color:#007bff; font-weight:800;">' . $driverPhone . '</span></div>
                </div>

                <div style="text-align: center; margin-top: 20px; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px;">
                    <a href="tel:' . preg_replace('/\D/', '', $driverPhone) . '" class="btn-cta" style="display:inline-block; background:#10b981; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25); margin: 4px;">📞 Call Chauffeur</a>
                    <a href="' . $trackUrl . '" class="btn-cta" style="display:inline-block; background:#0b2d6e; box-shadow: 0 4px 12px rgba(11, 45, 110, 0.25); margin: 4px;">📱 Track Ride Live</a>
                    <a href="' . $waShareUrl . '" target="_blank" class="btn-cta" style="display:inline-block; background:#25D366; color:#ffffff !important; box-shadow: 0 4px 12px rgba(37, 211, 102, 0.3); margin: 4px; text-decoration: none;">📲 Share Driver & Route Details</a>
                </div>
            ';
            $plainText = "Chauffeur Assigned!\n\nDear {$customerName},\nYour driver and vehicle details for booking #{$bookingId} are:\nDriver Name: {$driverName}\nPhone: {$driverPhone}\nCar Model: {$carModel}\nPlate Number: {$carNumber}\nRoute Link: {$routeUrl}\nLive Track: {$trackUrl}\n\nShare Details via WhatsApp: {$waShareUrl}";
            break;

        case 'completed':
            $subject = "🏁 Trip Completed! Booking ID: {$bookingId} - Thank you for riding!";
            $contentHtml = '
                <div class="premium-badge" style="background:#eff6ff; color:#1d4ed8;">Trip Completed</div>
                <h2 style="margin: 0 0 10px 0; color: #0b2d6e; font-size: 20px; font-weight: 800;">We Hope You Had a Wonderful Journey!</h2>
                <p>Dear ' . $customerName . ',</p>
                <p>Thank you for choosing Drop Cars. Your trip associated with Booking ID <strong>#' . $bookingId . '</strong> has been completed. We hope your travel was comfortable and safe.</p>
                
                <div class="trip-card">
                    <div class="trip-row"><span class="trip-label">Route</span><span class="trip-value">' . $pickup . ' ➔ ' . $drop . '</span></div>
                    <div class="trip-row"><span class="trip-label">Final Fare Billed</span><span class="trip-value" style="font-size: 18px; color: #166534; font-weight: 800;">₹' . $fare . '</span></div>
                </div>

                <p>We work tirelessly to provide top-notch service. If you enjoyed the chauffeur, car cleanliness, and our transparent pricing, please take 10 seconds to share your experience with others!</p>
                
                <div style="text-align: center; margin-top: 15px;">
                    ' . ($reviewLink !== '' ? '<a href="' . $reviewLink . '" target="_blank" class="btn-cta" style="background:#f7b733; color:#1e293b !important; box-shadow:0 4px 12px rgba(247,183,51,0.25); font-weight:800;">⭐️ Review Us on Google</a>' : '') . '
                </div>
            ';
            $plainText = "Trip Completed!\n\nDear {$customerName},\nYour trip #{$bookingId} is completed. Thank you for riding with Drop Cars.\nFinal Fare: ₹{$fare}.\nReview us: {$reviewLink}";
            break;

        case 'cancelled':
            $subject = "❌ Booking Cancelled: Booking ID: {$bookingId} - Drop Cars";
            $contentHtml = '
                <div class="premium-badge" style="background:#fef2f2; color:#b91c1c;">Booking Cancelled</div>
                <h2 style="margin: 0 0 10px 0; color: #b91c1c; font-size: 20px; font-weight: 800;">Booking Cancellation Confirmed</h2>
                <p>Dear ' . $customerName . ',</p>
                <p>We are writing to confirm that your booking <strong>#' . $bookingId . '</strong> from ' . $pickup . ' to ' . $drop . ' has been successfully cancelled as per your request.</p>
                
                <div class="guarantee-box" style="background:#fef2f2; border-left-color:#ef4444; color:#991b1b;">
                    <strong>Zero Cancellation Fee Applied:</strong> We believe in transparent, client-first operations. No cancellation fee or penalty has been charged to your profile.
                </div>

                <p>We hope to serve you on your next journey. When you are ready to book a reliable outstation cab again, feel free to visit our website.</p>
                
                <a href="' . $websiteUrl . '" class="btn-cta" style="background:#475569; box-shadow:none;">🚕 Book a New Ride</a>
            ';
            $plainText = "Booking Cancelled!\n\nDear {$customerName},\nYour booking #{$bookingId} has been cancelled. Zero cancellation fee has been charged. We hope to serve you on your next trip!\nBook a new ride at: {$websiteUrl}";
            break;
            
        case 'enquiry':
        default:
            $subject = "\u{1F696} Enquiry Estimate Saved: Enquiry ID: {$bookingId} - Drop Cars";
            $contentHtml = '
                <div class="premium-badge">Estimate Captured</div>
                <h2 style="margin: 0 0 10px 0; color: #0b2d6e; font-size: 20px; font-weight: 800;">Your Outstation Fare Estimate</h2>
                <p>Dear ' . $customerName . ',</p>
                <p>Thank you for checking out Drop Cars! Your custom intercity fare quote has been saved. We offer professional chauffeurs and clean, sanitized AC commercial cabs.</p>
                
                <div class="trip-card">
                    <div class="trip-row"><span class="trip-label">Enquiry ID</span><span class="trip-value">#' . $bookingId . '</span></div>
                    <div class="trip-row"><span class="trip-label">Route</span><span class="trip-value">' . $pickup . ' ➔ ' . $drop . '</span></div>
                    <div class="trip-row"><span class="trip-label">Estimated Fare</span><span class="trip-value" style="font-size: 18px; color: #166534; font-weight: 800;">₹' . $fare . '</span></div>
                </div>

                ' . ($isRoundTripCheck ? '
                <div style="font-size: 11.5px; color: #78350f; margin-top: 12px; line-height: 1.4; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 10px; margin-bottom: 15px;">
                  <strong>ℹ️ Trip Rule:</strong> KM limits and round trip KMs are always calculated on a garage-to-garage basis until the vehicle returns back to the pickup point.
                </div>
                ' : '') . '

                <p style="margin-top: 15px;">Would you like to lock in this fare? Confirmed bookings feature guaranteed on-time pickups and zero surprise fees.</p>
                
                <a href="' . $websiteUrl . 'track-booking/' . $bookingId . '" class="btn-cta">⚡ Confirm Booking Now</a>
                <a href="tel:+917200217986" class="btn-call">📞 Call Support: +91 72002 17986</a>
            ';
            $plainText = "Enquiry Estimate Saved!\n\nDear {$customerName},\nWe have saved your fare estimate for Enquiry #{$bookingId}.\nRoute: {$pickup} -> {$drop}\nEstimate Fare: ₹{$fare}\n" . ($isRoundTripCheck ? "\nℹ️ Trip Rule: KM limits and round trip KMs are always calculated garage-to-garage until return to pickup point.\n" : "") . "\nConfirm booking here: {$websiteUrl}track-booking/{$bookingId}";
            break;
    }

    $emailIsInclusive = ($booking['fare_type'] ?? '') === 'inclusive';
    $includeTolls = $emailIsInclusive;
    $includeTaxes = $emailIsInclusive;
    if (!empty($booking['fare_breakdown'])) {
        $fb = json_decode($booking['fare_breakdown'], true);
        if (is_array($fb)) {
            if (isset($fb['includeTolls'])) {
                $includeTolls = (bool)$fb['includeTolls'];
            }
            if (isset($fb['includeTaxes'])) {
                $includeTaxes = (bool)$fb['includeTaxes'];
            }
        }
    }

    // Wrap the Content in a Beautiful Customer-facing Premium HTML layout
    $htmlBody = '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 18px; }
    .email-container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03); border: 1px solid #e2e8f0; }
    .email-header { background: linear-gradient(135deg, ' . $headerColor . ' 0%, #1e40af 100%); padding: 24px; text-align: center; color: white; }
    .email-header h1 { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.01em; color: #ffffff !important; }
    .email-header p { margin: 4px 0 0 0; color: #93c5fd; font-size: 12px; font-weight: bold; letter-spacing: 0.05em; text-transform: uppercase; }
    .email-content { padding: 30px; }
    .premium-badge { display: inline-block; background: #eff6ff; color: #1d4ed8; font-size: 10px; font-weight: 800; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.05em; }
    .trip-card { background: #f8fafc; border-radius: 12px; padding: 20px; margin: 20px 0; border: 1px solid #e2e8f0; }
    .trip-row { display: table; width: 100%; margin-bottom: 8px; font-size: 13.5px; }
    .trip-label { display: table-cell; width: 140px; color: #64748b; font-weight: 700; text-transform: uppercase; font-size: 11px; }
    .trip-value { display: table-cell; color: #0f172a; font-weight: 700; }
    .btn-cta { display: block; text-align: center; background: ' . $accentColor . '; color: #ffffff !important; font-weight: 700; text-decoration: none; padding: 12px 24px; border-radius: 8px; margin-top: 15px; box-shadow: 0 4px 12px rgba(255, 122, 0, 0.2); }
    .btn-call { display: block; text-align: center; background: #16a34a; color: #ffffff !important; font-weight: 700; text-decoration: none; padding: 12px 24px; border-radius: 8px; margin-top: 10px; box-shadow: 0 4px 12px rgba(22, 163, 74, 0.2); }
    .inclusions-exclusions { display: table; width: 100%; border-top: 1px solid #e2e8f0; margin-top: 25px; padding-top: 20px; }
    .in-col, .ex-col { display: table-cell; width: 50%; vertical-align: top; }
    .in-col { padding-right: 15px; }
    .ex-col { padding-left: 15px; border-left: 1px solid #e2e8f0; }
    .list-title { font-weight: 800; font-size: 11px; text-transform: uppercase; margin-bottom: 10px; }
    .list-items { list-style: none; padding: 0; margin: 0; font-size: 12.5px; }
    .list-items li { margin-bottom: 6px; }
    .guarantee-box { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; border-radius: 8px; margin-top: 25px; font-size: 13px; color: #1e3a8a; line-height: 1.5; }
    .referral-banner { background: #fef3c7; border: 1px dashed #f59e0b; padding: 15px; border-radius: 8px; margin-top: 20px; font-size: 12.5px; text-align: center; color: #b45309; line-height: 1.5; }
    .email-footer { background: #f8fafc; padding: 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      <h1>DROP CARS</h1>
      <p>Premium Outstation Cabs</p>
    </div>
    <div class="email-content">
      ' . $contentHtml . '
      
      <!-- Shared Brand Inclusions & Exclusions Column List -->
      <div class="inclusions-exclusions">
        <div class="in-col">
          <div class="list-title" style="color:#166534;">✓ What\'s Included</div>
          <ul class="list-items" style="color:#14532d;">
            <li>🟢 Air-conditioned vehicle with driver</li>
            <li>🟢 Base fare and fuel charges</li>
            <li>🟢 Driver allowance (bata)</li>
            <li>🟢 Complimentary meal break of up to 30 minutes</li>
            ' . ($includeTolls ? '<li style="font-weight:700;">🟢 Toll charges included</li>' : '') . '
            ' . ($includeTaxes ? '<li style="font-weight:700;">🟢 State border tax included (if crossing state border)</li>' : '') . '
            ' . ((isset($booking['include_gst']) && (int)$booking['include_gst'] === 1) ? '<li style="font-weight:700;">🟢 GST (' . number_format((float)($booking['gst_percent'] ?? 5.00), 2) . '%) Included' . (!empty($config['pricingRules']['gstNumber']) ? ' (GSTIN: ' . htmlspecialchars($config['pricingRules']['gstNumber']) . ')' : '') . '</li>' : '') . '
          </ul>
        </div>
        <div class="ex-col">
          <div class="list-title" style="color:#991b1b;">⚠️ What\'s Excluded</div>
          <ul class="list-items" style="color:#64748b;">
            <li>🔴 Parking and entry fees, (if any)</li>
            ' . ($includeTolls ? '' : '<li>🔴 Toll charges, as applicable</li>') . '
            ' . ($includeTaxes ? '' : '<li>🔴 State border tax (applicable only if crossing state border)</li>') . '
            ' . ((!isset($booking['include_gst']) || (int)$booking['include_gst'] !== 1) ? '<li>🔴 GST (' . number_format((float)($booking['gst_percent'] ?? 5.00), 2) . '%) extra</li>' : '') . '
            ' . (strpos(strtolower($booking['trip_type'] ?? ''), 'round') !== false
                ? '<li>🔴 Night allowance (after 10 PM), if applicable</li>'
                : '<li>🔴 ' . $waitingChargeText . '</li>'
            ) . '
            ' . ($isHourlyCheck ? '' : '<li>🔴 Extra ' . $extraKmRateStr . '/KM (if exceeded the KMs calculated' . $garageText . ')</li>') . '
          </ul>
        </div>
      </div>

      <!-- Guarantee Box -->
      <div class="guarantee-box">
        <strong>🛡️ The Drop Cars Guarantee:</strong> We guarantee a well-maintained, clean AC commercial vehicle driven by a professional, background-verified chauffeur. Zero hidden charges, 100% transparent pricing!
      </div>

    </div>
    <div class="email-footer">
      This is an automated operational notification. For queries, call +91 75988 99579.<br>
      © ' . date('Y') . ' Drop Cars. All Rights Reserved. business address: 136, Chengam Road, Tiruvannamalai, Tamil Nadu.
    </div>
  </div>
</body>
</html>';

    return ['subject' => $subject, 'html' => $htmlBody, 'plain' => $plainText];
}
