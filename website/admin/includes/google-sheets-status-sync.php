<?php
/**
 * Google Sheets STATUS_UPDATE payloads after admin status changes.
 * Non-blocking: failures are logged only.
 */

if (!function_exists('dropcars_admin_booking_row_with_customer')) {
    /**
     * Ensure customer name/phone are present when the row only has `customer_id`
     * or JOIN aliases (`customer_name` / `customer_phone`) are empty.
     *
     * @param array $row Booking row (bookings columns ± customer join fields)
     * @return array Row with `customer_name`, `customer_phone`, `name`, and `phone` filled when possible
     */
    function dropcars_admin_booking_row_with_customer(array $row): array
    {
        $name = trim((string) ($row['customer_name'] ?? $row['name'] ?? ''));
        $phone = trim((string) ($row['customer_phone'] ?? $row['phone'] ?? ''));
        if ($name !== '' && $phone !== '') {
            return $row;
        }

        $cid = isset($row['customer_id']) ? (int) $row['customer_id'] : 0;
        if ($cid <= 0) {
            return $row;
        }

        global $pdo;
        if (!$pdo instanceof PDO) {
            return $row;
        }

        try {
            $st = $pdo->prepare('SELECT `name`, `phone` FROM `customers` WHERE `id` = ? LIMIT 1');
            $st->execute([$cid]);
            $c = $st->fetch(PDO::FETCH_ASSOC);
            if (!$c) {
                return $row;
            }
            if ($name === '' && isset($c['name'])) {
                $row['customer_name'] = $c['name'];
                $row['name'] = $c['name'];
            }
            if ($phone === '' && isset($c['phone'])) {
                $row['customer_phone'] = $c['phone'];
                $row['phone'] = $c['phone'];
            }
        } catch (Throwable $e) {
            error_log('dropcars_admin_booking_row_with_customer: ' . $e->getMessage());
        }

        return $row;
    }
}

if (!function_exists('dropcars_admin_loyalty_status_for_sheet')) {
    /**
     * "Regular" when the phone has 3+ all-time enquiries/bookings (same rules as the rest of the site).
     */
    function dropcars_admin_loyalty_status_for_sheet(string $phone): string
    {
        global $pdo;
        $phone = trim($phone);
        if ($phone === '' || !($pdo instanceof PDO)) {
            return '';
        }
        $rc = __DIR__ . '/../../api/includes/regular-customer.php';
        if (!is_file($rc)) {
            return '';
        }
        require_once $rc;
        if (!function_exists('dropcars_is_regular_customer')) {
            return '';
        }

        return dropcars_is_regular_customer($pdo, $phone) ? 'Regular' : '';
    }
}

if (!function_exists('dropcars_admin_sync_booking_status_row')) {
    /**
     * @param array $row Booking row with customer_name / customer_phone from JOIN (or name/phone), or customer_id only
     */
    function dropcars_admin_sync_booking_status_row(array $row, string $newStatus): void
    {
        global $pdo;
        $row = dropcars_admin_booking_row_with_customer($row);
        $phoneForSheet = trim((string) ($row['customer_phone'] ?? $row['phone'] ?? ''));

        $configPath = __DIR__ . '/../../api/config.php';
        $config = is_file($configPath) ? (include $configPath) : [];
        require_once __DIR__ . '/../../includes/google-sheet-sync.php';

        $entry = [
            'bookingId' => $row['booking_id'] ?? '',
            'tripType' => $row['trip_type'] ?? 'One Way',
            'status' => $newStatus,
            'name' => $row['customer_name'] ?? $row['name'] ?? '',
            'phone' => $row['customer_phone'] ?? $row['phone'] ?? '',
            'leadType' => 'Booking',
            'pickup' => $row['pickup_location'] ?? '',
            'drop' => $row['drop_location'] ?? '',
            'fareType' => $row['fare_type'] ?? '',
            'estFare' => $row['estimated_fare'] ?? '',
            'finalFare' => $row['final_fare'] ?? '',
            'driverName' => $row['driver_name'] ?? '',
            'driverPhone' => $row['driver_phone'] ?? '',
            'carNumber' => $row['car_number'] ?? '',
            'source' => $row['source'] ?? '',
            'ip' => $row['ip_address'] ?? '',
            'loyaltyStatus' => dropcars_admin_loyalty_status_for_sheet($phoneForSheet),
        ];

        try {
            sendToGoogleSheet($entry);
        } catch (Throwable $e) {
            error_log('dropcars_admin_sync_booking_status_row: ' . $e->getMessage());
        }

        if ($newStatus === 'confirmed') {
            // Dispatch all customer alerts (Email, SMS, WhatsApp)
            require_once __DIR__ . '/../../api/includes/sms-whatsapp-gateway.php';
            if (function_exists('dropcars_dispatch_all_confirmation_notifications')) {
                dropcars_dispatch_all_confirmation_notifications($pdo, $row);
            }

            require_once __DIR__ . '/../../api/calendar-sync.php';
            $name = (string) ($row['customer_name'] ?? $row['name'] ?? '');
            $pick = (string) ($row['pickup_location'] ?? '');
            $drop = (string) ($row['drop_location'] ?? '');
            $bid = (string) ($row['booking_id'] ?? '');
            $phone = (string) ($row['customer_phone'] ?? $row['phone'] ?? '');
            $vehicle = ($row['car_name'] ?? '') !== '' && $row['car_name'] !== null ? (string) $row['car_name'] : 'N/A';
            $fareVal = $row['final_fare'] ?? null;
            $fareStr = $fareVal !== null && $fareVal !== '' ? (string) $fareVal : '0';
            $calEntry = [
                'title' => 'DropCars: ' . $name . ' | ' . $pick . ' → ' . $drop,
                'pickupDate' => $row['pickup_date'] ?? '',
                'pickupTime' => (string) ($row['pickup_time'] ?? '09:00'),
                'durationMinutes' => 60,
                'description' => "Customer: {$name}\nPhone: {$phone}\nVehicle: {$vehicle}\nFare: ₹{$fareStr}\nBooking ID: {$bid}",
                'bookingId' => $bid,
            ];
            try {
                dropcars_sync_to_google_calendar($calEntry, $config);
            } catch (Throwable $e) {
                error_log('dropcars_admin_sync_booking_status_row calendar: ' . $e->getMessage());
            }
        }
    }
}

if (!function_exists('dropcars_admin_sync_enquiry_status_row')) {
    /**
     * @param array $row Full enquiries row
     */
    function dropcars_admin_sync_enquiry_status_row(array $row, string $newStatus): void
    {
        $phoneForSheet = trim((string) ($row['phone'] ?? ''));
        $configPath = __DIR__ . '/../../api/config.php';
        $config = is_file($configPath) ? (include $configPath) : [];
        require_once __DIR__ . '/../../includes/google-sheet-sync.php';

        $entry = [
            'bookingId' => $row['booking_id'] ?? '',
            'tripType' => $row['trip_type'] ?? 'One Way',
            'status' => $newStatus,
            'name' => $row['name'] ?? '',
            'phone' => $row['phone'] ?? '',
            'leadType' => 'Enquiry',
            'pickup' => $row['pickup'] ?? '',
            'drop' => $row['drop_location'] ?? '',
            'fareType' => $row['fare_type'] ?? '',
            'estFare' => $row['fare_estimate'] ?? '',
            'source' => $row['source'] ?? '',
            'ip' => $row['ip_address'] ?? '',
            'loyaltyStatus' => dropcars_admin_loyalty_status_for_sheet($phoneForSheet),
        ];

        try {
            sendToGoogleSheet($entry);
        } catch (Throwable $e) {
            error_log('dropcars_admin_sync_enquiry_status_row: ' . $e->getMessage());
        }
    }
}
