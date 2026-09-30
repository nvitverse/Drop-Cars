<?php
/**
 * SMS and WhatsApp Gateway Dispatcher - Premium Edition
 * Dynamically handles third-party API integrations for SMS and WhatsApp confirmations.
 */

if (!function_exists('dropcars_send_gateway_sms')) {
    /**
     * Send SMS to customer using configured gateway.
     */
    function dropcars_send_gateway_sms(array $config, array $booking): bool
    {
        $gateway = $config['smsGateway'] ?? 'none';
        if ($gateway === 'none') {
            return false;
        }

        $phone = preg_replace('/\D/', '', (string) ($booking['customer_phone'] ?? $booking['phone'] ?? ''));
        if ($phone === '') {
            return false;
        }
        // Ensure 12-digit number with 91 prefix for India if 10 digits
        if (strlen($phone) === 10) {
            $phone = '91' . $phone;
        }

        // Prepare message content
        $template = $config['smsTemplateBooking'] ?? '';
        if ($template === '') {
            $template = "Dear {name}, your Drop Cars booking {bookingId} is confirmed! Pickup: {pickup}, Drop: {drop}. Fare: ₹{fare}. Thank you!";
        }

        $placeholders = [
            '{name}' => $booking['customer_name'] ?? $booking['name'] ?? 'Customer',
            '{bookingId}' => $booking['booking_id'] ?? $booking['id'] ?? '',
            '{pickup}' => $booking['pickup_location'] ?? $booking['pickup'] ?? '',
            '{drop}' => $booking['drop_location'] ?? $booking['drop'] ?? '',
            '{fare}' => number_format((float) ($booking['final_fare'] ?? $booking['estimated_fare'] ?? 0)),
            '{date}' => $booking['pickup_date'] ?? $booking['travel_date'] ?? '',
            '{vehicle}' => $booking['car_name'] ?? $booking['vehicle_type'] ?? 'SEDAN'
        ];

        $message = str_replace(array_keys($placeholders), array_values($placeholders), $template);

        if ($gateway === 'twilio') {
            $sid = trim($config['smsTwilioSid'] ?? '');
            $token = trim($config['smsApiKey'] ?? '');
            $sender = trim($config['smsSenderId'] ?? '');

            if ($sid === '' || $token === '') {
                error_log("Twilio SMS failed: Account SID or Token missing.");
                if (function_exists('dropcars_report_php_error')) {
                    dropcars_report_php_error('sms_gateway_config_error', 'Twilio SMS failed: Account SID or Token missing in config.', __FILE__, __LINE__);
                }
                return false;
            }

            // Twilio expects phone to be prefixed with '+' (e.g. +919876543210)
            $toPhone = '+' . $phone;
            $url = "https://api.twilio.com/2010-04-01/Accounts/{$sid}/Messages.json";
            
            $postData = [
                'To' => $toPhone,
                'From' => $sender,
                'Body' => $message
            ];

            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_USERPWD, "{$sid}:{$token}");
            curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($postData));
            $response = curl_exec($ch);
            $err = curl_error($ch);
            curl_close($ch);

            if ($err) {
                error_log("Twilio curl error: " . $err);
                if (function_exists('dropcars_report_php_error')) {
                    dropcars_report_php_error('sms_gateway_failure', 'Twilio SMS curl error: ' . $err, __FILE__, __LINE__);
                }
                return false;
            }
            return true;
        }

        if ($gateway === 'generic') {
            $genericUrl = trim($config['smsGenericUrl'] ?? '');
            if ($genericUrl === '') {
                error_log("Generic SMS failed: Endpoint URL missing.");
                if (function_exists('dropcars_report_php_error')) {
                    dropcars_report_php_error('sms_gateway_config_error', 'Generic SMS failed: Endpoint URL missing in config.', __FILE__, __LINE__);
                }
                return false;
            }

            $apiKey = trim($config['smsApiKey'] ?? '');
            $sender = trim($config['smsSenderId'] ?? '');

            // Replacements in URL
            $urlReplacements = [
                '{apikey}' => urlencode($apiKey),
                '{phone}' => urlencode($phone),
                '{message}' => urlencode($message),
                '{sender}' => urlencode($sender)
            ];
            
            $targetUrl = str_replace(array_keys($urlReplacements), array_values($urlReplacements), $genericUrl);

            $ch = curl_init($targetUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 15);
            $response = curl_exec($ch);
            $err = curl_error($ch);
            curl_close($ch);

            if ($err) {
                error_log("Generic SMS HTTP error: " . $err);
                if (function_exists('dropcars_report_php_error')) {
                    dropcars_report_php_error('sms_gateway_failure', 'Generic SMS HTTP error: ' . $err, __FILE__, __LINE__);
                }
                return false;
            }
            return true;
        }

        return false;
    }
}

if (!function_exists('dropcars_send_gateway_whatsapp')) {
    /**
     * Send WhatsApp notification to customer using configured gateway.
     */
    function dropcars_send_gateway_whatsapp(array $config, array $booking): bool
    {
        $gateway = $config['whatsappGateway'] ?? 'none';
        if ($gateway === 'none') {
            return false;
        }

        $phone = preg_replace('/\D/', '', (string) ($booking['customer_phone'] ?? $booking['phone'] ?? ''));
        if ($phone === '') {
            return false;
        }
        if (strlen($phone) === 10) {
            $phone = '91' . $phone;
        }

        // Prepare message content
        $template = $config['whatsappTemplateConfirmation'] ?? '';
        if ($template === '') {
            $template = "🌟 *DROP CARS* 🌟\n" .
                        "_Booking Confirmed!_\n\n" .
                        "Dear *{name}*,\n\n" .
                        "We are pleased to inform you that your booking *#{bookingId}* has been successfully *CONFIRMED*!\n\n" .
                        "━━━━━━━━━━━━━━━━━━━\n" .
                        "🚖 *TRIP INFORMATION*\n" .
                        "━━━━━━━━━━━━━━━━━━━\n" .
                        "📍 *Route:* {pickup} ➔ {drop}\n" .
                        "📅 *Travel Date:* {date}\n" .
                        "🚗 *Vehicle:* {vehicle}\n\n" .
                        "━━━━━━━━━━━━━━━━━━━\n" .
                        "💵 *FARE SUMMARY*\n" .
                        "━━━━━━━━━━━━━━━━━━━\n" .
                        "💰 *Total Fare:* *₹{fare}* _(Excl. toll/state tax)_\n" .
                        "💳 *Advance Paid:* *₹0* _(No payment received yet)_\n" .
                        "💵 *Balance Due:* *₹{fare}* _(payable to driver)_\n\n" .
                        "━━━━━━━━━━━━━━━━━━━\n" .
                        "📱 *REAL-TIME TRACKING*\n" .
                        "━━━━━━━━━━━━━━━━━━━\n" .
                        "Track your driver and trip status in real-time:\n" .
                        "👉 https://dropcars.in/track-booking/{bookingId}\n\n" .
                        "_We will notify you once your driver and cab are assigned._\n\n" .
                        "━━━━━━━━━━━━━━━━━━━\n" .
                        "*Website:* https://dropcars.in\n" .
                        "*Email:* support@dropcars.in\n" .
                        "*Support:* " . ($config['supportPhone'] ?? '+91 7200217986');
        }

        $placeholders = [
            '{name}' => $booking['customer_name'] ?? $booking['name'] ?? 'Customer',
            '{bookingId}' => $booking['booking_id'] ?? $booking['id'] ?? '',
            '{pickup}' => $booking['pickup_location'] ?? $booking['pickup'] ?? '',
            '{drop}' => $booking['drop_location'] ?? $booking['drop'] ?? '',
            '{fare}' => number_format((float) ($booking['final_fare'] ?? $booking['estimated_fare'] ?? 0)),
            '{date}' => $booking['pickup_date'] ?? $booking['travel_date'] ?? '',
            '{vehicle}' => $booking['car_name'] ?? $booking['vehicle_type'] ?? 'SEDAN'
        ];

        $message = str_replace(array_keys($placeholders), array_values($placeholders), $template);

        if ($gateway === 'generic') {
            $genericUrl = trim($config['whatsappGenericUrl'] ?? '');
            if ($genericUrl === '') {
                error_log("Generic WhatsApp failed: Endpoint URL missing.");
                if (function_exists('dropcars_report_php_error')) {
                    dropcars_report_php_error('whatsapp_gateway_config_error', 'Generic WhatsApp failed: Endpoint URL missing in config.', __FILE__, __LINE__);
                }
                return false;
            }

            $apiKey = trim($config['whatsappApiKey'] ?? '');

            // Replacements in URL
            $urlReplacements = [
                '{apikey}' => urlencode($apiKey),
                '{phone}' => urlencode($phone),
                '{message}' => urlencode($message)
            ];
            
            $targetUrl = str_replace(array_keys($urlReplacements), array_values($urlReplacements), $genericUrl);

            $ch = curl_init($targetUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 15);
            $response = curl_exec($ch);
            $err = curl_error($ch);
            curl_close($ch);

            if ($err) {
                error_log("Generic WhatsApp HTTP error: " . $err);
                if (function_exists('dropcars_report_php_error')) {
                    dropcars_report_php_error('whatsapp_gateway_failure', 'Generic WhatsApp HTTP error: ' . $err, __FILE__, __LINE__);
                }
                return false;
            }
            return true;
        }

        return false;
    }
}

if (!function_exists('dropcars_dispatch_all_confirmation_notifications')) {
    /**
     * Dispatch all notifications (Email, SMS, WhatsApp) for a confirmed booking.
     */
    function dropcars_dispatch_all_confirmation_notifications(PDO $pdo, array $booking): void
    {
        $configPath = __DIR__ . '/../config.php';
        if (!is_file($configPath)) {
            $configPath = __DIR__ . '/../config.example.php';
        }
        $config = is_file($configPath) ? (include $configPath) : [];
        $isExampleConfig = basename($configPath) === 'config.example.php';

        // 1. Send SMS and WhatsApp via configured gateways
        dropcars_send_gateway_sms($config, $booking);
        dropcars_send_gateway_whatsapp($config, $booking);

        // 2. Send Customer confirmation email if email notifications are enabled
        $enableCustomerEmail = $config['enableEmailNotifications_Customer'] ?? true;
        if (!$enableCustomerEmail) {
            return;
        }

        // Fetch customer email if missing in the array
        $customerEmail = trim((string) ($booking['customer_email'] ?? $booking['email'] ?? ''));
        if ($customerEmail === '' && !empty($booking['customer_id'])) {
            try {
                $st = $pdo->prepare('SELECT `email` FROM `customers` WHERE `id` = ? LIMIT 1');
                $st->execute([$booking['customer_id']]);
                $customerEmail = (string) $st->fetchColumn();
            } catch (Throwable $e) {
                error_log("Failed to fetch customer email for notification: " . $e->getMessage());
            }
        }

        if ($customerEmail === '' || !filter_var($customerEmail, FILTER_VALIDATE_EMAIL)) {
            return;
        }

        // SMTP settings
        require_once __DIR__ . '/../smtp-settings.php';
        $smtp = dropcars_resolve_smtp($config, $isExampleConfig);
        $appPassword = $smtp['appPassword'];
        if (!$appPassword) {
            return;
        }

        // Prepare email body - utilizing standard formatting structure
        $bookingId = $booking['booking_id'] ?? $booking['id'] ?? '';
        $customerName = $booking['customer_name'] ?? $booking['name'] ?? 'Customer';
        $pickup = $booking['pickup_location'] ?? $booking['pickup'] ?? '';
        $drop = $booking['drop_location'] ?? $booking['drop'] ?? '';
        $travelDate = $booking['pickup_date'] ?? $booking['travel_date'] ?? '';
        $travelTime = $booking['pickup_time'] ?? $booking['travel_time'] ?? '';
        $vehicleType = $booking['car_name'] ?? $booking['vehicle_type'] ?? 'SEDAN';
        $finalFare = $booking['final_fare'] ?? $booking['estimated_fare'] ?? 0;
        $fareType = $booking['fare_type'] ?? 'exclusive';

        $subject = "✅ Drop Cars Booking Confirmed – {$bookingId}";

        // Threading keys
        $threadContactRaw = strtolower(trim(strip_tags((string) ($booking['customer_phone'] ?? $booking['phone'] ?? ''))));
        $pickupClean = strtolower(preg_replace('/[^a-z0-9]/', '', (string)$pickup));
        $dropClean = strtolower(preg_replace('/[^a-z0-9]/', '', (string)$drop));
        $threadKeySource = preg_replace('/\s+/', '', $threadContactRaw) . '||' . $pickupClean . '||' . $dropClean;
        $threadHash = substr(sha1($threadKeySource), 0, 24);
        $threadRootMessageId = '<trip-thread-' . $threadHash . '@gmail.com>';

        // Minimalist premium HTML template matching the website's confirmation mail
        $bodyHtml = '
        <div style="font-family: \'Inter\', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff; color: #0f172a;">
            <div style="text-align: center; margin-bottom: 24px;">
                <h2 style="font-family: \'Outfit\', sans-serif; color: #2563eb; margin: 0;">Booking Received!</h2>
                <p style="color: #64748b; margin-top: 4px; font-weight: 500;">Booking Reference: #' . htmlspecialchars($bookingId) . '</p>
            </div>
            <div style="background: #f8fafc; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
                <strong style="display: block; font-size: 16px; margin-bottom: 12px; color: #1e293b;">Itinerary Details</strong>
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                    <tr><td style="padding: 6px 0; color: #64748b; width: 35%;">Customer Name</td><td style="padding: 6px 0; font-weight: 600;">' . htmlspecialchars($customerName) . '</td></tr>
                    <tr><td style="padding: 6px 0; color: #64748b;">Pickup Address</td><td style="padding: 6px 0; font-weight: 600;">' . htmlspecialchars($pickup) . '</td></tr>
                    <tr><td style="padding: 6px 0; color: #64748b;">Drop Address</td><td style="padding: 6px 0; font-weight: 600;">' . htmlspecialchars($drop) . '</td></tr>
                    <tr><td style="padding: 6px 0; color: #64748b;">Scheduled Date</td><td style="padding: 6px 0; font-weight: 600;">' . htmlspecialchars(date('D, d M Y', strtotime($travelDate))) . ' at ' . htmlspecialchars($travelTime) . '</td></tr>
                    <tr><td style="padding: 6px 0; color: #64748b;">Vehicle Category</td><td style="padding: 6px 0; font-weight: 600;">' . htmlspecialchars($vehicleType) . '</td></tr>
                    <tr style="border-top: 1px solid #e2e8f0;"><td style="padding: 10px 0; color: #2563eb; font-weight: 700; font-size: 16px;">Estimated Fare</td><td style="padding: 10px 0; font-weight: 700; font-size: 18px; color: #2563eb;">₹' . number_format((float)$finalFare) . ' <span style="font-size:11px; font-weight:500; color:#64748b;">(' . ($fareType === 'inclusive' ? 'Inclusive' : 'Exclusive') . ')</span></td></tr>
                </table>
            </div>
            <div style="text-align: center; margin-top: 24px;">
                <a href="https://dropcars.in/track-booking/' . urlencode($bookingId) . '" target="_blank" style="display: inline-block; background: #2563eb; color: #ffffff !important; padding: 12px 24px; border-radius: 10px; font-weight: bold; text-decoration: none; font-size: 14px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2); margin-bottom: 10px;">
                    📍 Track Booking Status
                </a>
                <a href="tel:+917200217986" style="display: inline-block; background: #16a34a; color: #ffffff !important; padding: 12px 24px; border-radius: 10px; font-weight: bold; text-decoration: none; font-size: 14px; box-shadow: 0 4px 12px rgba(22, 163, 74, 0.2); margin-left: 8px; margin-bottom: 10px;">
                    📞 Call Support
                </a>
            </div>
            <div style="margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: center; font-size: 12px; color: #94a3b8;">
                Thank you for traveling with Drop Cars! For 24/7 support, call +91 72002 17986.
            </div>
        </div>';

        $bodyPlain = "Hi {$customerName},\n\nYour Drop Cars booking reference #{$bookingId} has been confirmed!\n\nPickup: {$pickup}\nDrop: {$drop}\nDate: " . date('d M Y', strtotime($travelDate)) . " at {$travelTime}\nFare: ₹" . number_format((float)$finalFare) . " ({$fareType})\n\nTrack booking: https://dropcars.in/track-booking/{$bookingId}\n\nThank you for choosing us!";

        $phpmailerPath = __DIR__ . '/../phpmailer/src/PHPMailer.php';
        if (is_file($phpmailerPath)) {
            require_once __DIR__ . '/../phpmailer/src/Exception.php';
            require_once __DIR__ . '/../phpmailer/src/PHPMailer.php';
            require_once __DIR__ . '/../phpmailer/src/SMTP.php';
            
            try {
                $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
                $mail->isSMTP();
                $mail->Host = 'smtp.gmail.com';
                $mail->SMTPAuth = true;
                $mail->SMTPSecure = 'tls';
                $mail->Port = 587;
                dropcars_phpmailer_apply_smtp($mail, $smtp);
                $mail->addAddress($customerEmail);
                $mail->CharSet = 'UTF-8';
                $mail->MessageID = '<confirm-' . preg_replace('/[^A-Za-z0-9]/', '', (string)$bookingId) . '-' . uniqid('', true) . '@gmail.com>';
                $mail->addCustomHeader('In-Reply-To', $threadRootMessageId);
                $mail->addCustomHeader('References', $threadRootMessageId);
                $mail->addCustomHeader('X-DropCars-Thread-Key', $threadHash);
                $mail->Subject = $subject;
                $mail->Body = $bodyHtml;
                $mail->AltBody = $bodyPlain;
                $mail->isHTML(true);
                $mail->send();
            } catch (Exception $e) {
                // Fallback Port 465 SSL
                try {
                    $mail2 = new \PHPMailer\PHPMailer\PHPMailer(true);
                    $mail2->isSMTP();
                    $mail2->Host = 'smtp.gmail.com';
                    $mail2->SMTPAuth = true;
                    $mail2->SMTPSecure = 'ssl';
                    $mail2->Port = 465;
                    dropcars_phpmailer_apply_smtp($mail2, $smtp);
                    $mail2->addAddress($customerEmail);
                    $mail2->CharSet = 'UTF-8';
                    $mail2->MessageID = '<confirm-' . preg_replace('/[^A-Za-z0-9]/', '', (string)$bookingId) . '-' . uniqid('', true) . '@gmail.com>';
                    $mail2->addCustomHeader('In-Reply-To', $threadRootMessageId);
                    $mail2->addCustomHeader('References', $threadRootMessageId);
                    $mail2->addCustomHeader('X-DropCars-Thread-Key', $threadHash);
                    $mail2->Subject = $subject;
                    $mail2->Body = $bodyHtml;
                    $mail2->AltBody = $bodyPlain;
                    $mail2->isHTML(true);
                    $mail2->send();
                } catch (Exception $e2) {
                    error_log("Fallback confirmation email from sync failed: " . $e2->getMessage());
                }
            }
        }
    }
}
