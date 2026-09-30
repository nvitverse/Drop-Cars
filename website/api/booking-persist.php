<?php
date_default_timezone_set('Asia/Kolkata');
/**
 * Save confirmed web booking to customers + bookings (thank-you / track / admin).
 */

/**
 * Stable contact key for customers.phone (matches track-booking lookup).
 */
function dropcars_booking_customer_phone_key(array $bookingData): string
{
    $p = trim((string) ($bookingData['customerPhone'] ?? ''));
    if ($p !== '') {
        return $p;
    }
    $e = trim((string) ($bookingData['customerEmail'] ?? $bookingData['contactEmail'] ?? ''));
    if ($e !== '') {
        return 'email:' . strtolower($e);
    }

    return '';
}

/**
 * @return bool true if a row was written
 */
function dropcars_persist_confirmation_booking(
    PDO $pdo,
    array $bookingData,
    string $bookingId,
    string $customerNamePlain,
    string $pickupPlain,
    string $dropPlain,
    string $bookingType,
    string $vehicleType,
    int $fareEstimate,
    string $travelDate,
    string $travelTime,
    float $distanceKm,
    int $discountAmount = 0,
    ?int $finalFare = null,
    string $duration = '',
    string $fareType = 'exclusive',
    string $status = 'confirmed',
    string $usedReferralCode = '',
    string $respondedBy = '',
    bool $isUrgent = false
): bool {
    $bookingId = trim($bookingId);
    if ($bookingId === '') {
        return false;
    }

    require_once __DIR__ . '/../admin/includes/enquiries-schema.php';
    dropcars_ensure_bookings_columns($pdo);

    $phoneKey = dropcars_booking_customer_phone_key($bookingData);
    if ($phoneKey === '') {
        $phoneKey = 'booking:' . preg_replace('/[^A-Za-z0-9]/', '', $bookingId);
    }

    $name = trim(preg_replace('/\s+/', ' ', $customerNamePlain));
    if ($name === '') {
        $name = 'Guest';
    }

    $tripMap = [
        'ROUND_TRIP'     => 'round',
        'ONE_WAY'        => 'oneway',
        'LOCAL_PACKAGE'  => 'oneway',
        'round_trip'     => 'round',
        'one_way'        => 'oneway',
        'oneway'         => 'oneway',
        'hourly_rental'  => 'oneway',
        'multi_city'     => 'oneway',
        'round'          => 'round',
    ];
    $tripType = $tripMap[$bookingType] ?? 'oneway';

    $pickupPlain = trim($pickupPlain);
    $dropPlain = trim($dropPlain);
    if ($pickupPlain === '') {
        $pickupPlain = '—';
    }
    if ($dropPlain === '') {
        $dropPlain = '—';
    }

    $pickupDate = null;
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $travelDate)) {
        $pickupDate = $travelDate;
    }

    $pickupTime = trim($travelTime) !== '' ? trim($travelTime) : null;
    $dist = $distanceKm > 0 ? round($distanceKm, 2) : null;
    $baseFare = $fareEstimate > 0 ? $fareEstimate : null;
    $carName = trim($vehicleType) !== '' ? trim($vehicleType) : null;
    $final = ($finalFare !== null) ? $finalFare : ($fareEstimate - $discountAmount);

    // Origin page (which website page the form/enquiry came from). Prefer an
    // explicit source_page (carried over from the enquiry record on admin
    // confirm), else derive the path from a full pageUrl in the payload.
    $sourcePage = trim((string) ($bookingData['source_page'] ?? ''));
    if ($sourcePage === '' && !empty($bookingData['pageUrl'])) {
        $parsedPath = parse_url((string) $bookingData['pageUrl'], PHP_URL_PATH);
        $sourcePage = $parsedPath !== false && $parsedPath !== null ? $parsedPath : (string) $bookingData['pageUrl'];
    }
    if ($sourcePage !== '') {
        $sourcePage = preg_replace('#/booknow/?$#i', '', $sourcePage);
        if ($sourcePage === '') {
            $sourcePage = '/';
        }
        $sourcePage = substr($sourcePage, 0, 255);
    } else {
        $sourcePage = null;
    }

    $viaLocations = is_array($bookingData['stops'] ?? null) ? implode(' | ', $bookingData['stops']) : ($bookingData['via_locations'] ?? null);
    $returnDate = !empty($bookingData['endDate']) ? $bookingData['endDate'] : null;
    $returnTime = !empty($bookingData['dropTime']) ? $bookingData['dropTime'] : null;
    $tripDays = isset($bookingData['tripDays']) ? (int)$bookingData['tripDays'] : null;
    $fareBreakdownJson = isset($bookingData['fareBreakdown']) && is_array($bookingData['fareBreakdown']) ? json_encode($bookingData['fareBreakdown']) : null;

    try {
        $pdo->beginTransaction();

        $cid = null;
        $emailVal = trim((string) ($bookingData['customerEmail'] ?? $bookingData['contactEmail'] ?? ''));
        if ($phoneKey !== '' && strpos($phoneKey, 'booking:') !== 0) {
            $stmt = $pdo->prepare('SELECT `id` FROM `customers` WHERE `phone` = ? LIMIT 1');
            $stmt->execute([$phoneKey]);
            $cid = $stmt->fetchColumn();
        }
        if (!$cid && $emailVal !== '') {
            $stmt = $pdo->prepare('SELECT `id` FROM `customers` WHERE `email` = ? LIMIT 1');
            $stmt->execute([$emailVal]);
            $cid = $stmt->fetchColumn();
        }

        if ($cid) {
            $customerId = (int) $cid;
            $updates = [];
            $vals = [];
            if ($name !== 'Guest' && $name !== 'N/A') {
                $updates[] = '`name` = ?';
                $vals[] = $name;
            }
            if ($emailVal !== '') {
                $updates[] = '`email` = ?';
                $vals[] = $emailVal;
            }
            if ($phoneKey !== '' && strpos($phoneKey, 'booking:') !== 0) {
                $updates[] = '`phone` = ?';
                $vals[] = $phoneKey;
            }
            if (!empty($updates)) {
                $vals[] = $customerId;
                $pdo->prepare('UPDATE `customers` SET ' . implode(', ', $updates) . ' WHERE `id` = ?')->execute($vals);
            }
        } else {
            $ins = $pdo->prepare('INSERT INTO `customers` (`name`, `phone`, `email`, `is_verified`) VALUES (?, ?, ?, 0)');
            $ins->execute([$name, $phoneKey, $emailVal !== '' ? $emailVal : null]);
            $customerId = (int) $pdo->lastInsertId();
        }

        $includeGst = isset($bookingData['gstApplied']) ? (int)$bookingData['gstApplied'] : 0;
        $gstPercent = isset($bookingData['gstPercent']) ? (float)$bookingData['gstPercent'] : 5.00;
        $gstAmount = isset($bookingData['gstAmount']) ? (float)$bookingData['gstAmount'] : 0.00;

        $sql = 'INSERT INTO `bookings` (
            `customer_id`, `booking_id`, `pickup_location`, `via_locations`, `drop_location`, `trip_type`,
            `pickup_date`, `pickup_time`, `return_date`, `return_time`, `trip_days`, `distance_km`, `duration`, `base_fare`, `estimated_fare`, `final_fare`, `discount_amount`, `fare_type`, `fare_breakdown`,
            `include_gst`, `gst_percent`, `gst_amount`,
            `status`, `car_name`, `ip_address`, `source`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `device`, `matchtype`, `gclid`, `source_page`, `used_referral_code`, `responded_by`, `dispatcher_notes`
        ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        ) ON DUPLICATE KEY UPDATE
            `customer_id` = VALUES(`customer_id`),
            `pickup_location` = VALUES(`pickup_location`),
            `via_locations` = VALUES(`via_locations`),
            `drop_location` = VALUES(`drop_location`),
            `trip_type` = VALUES(`trip_type`),
            `pickup_date` = VALUES(`pickup_date`),
            `pickup_time` = VALUES(`pickup_time`),
            `return_date` = VALUES(`return_date`),
            `return_time` = VALUES(`return_time`),
            `trip_days` = VALUES(`trip_days`),
            `distance_km` = VALUES(`distance_km`),
            `duration` = VALUES(`duration`),
            `base_fare` = VALUES(`base_fare`),
            `estimated_fare` = VALUES(`estimated_fare`),
            `final_fare` = VALUES(`final_fare`),
            `discount_amount` = VALUES(`discount_amount`),
            `fare_type` = VALUES(`fare_type`),
            `fare_breakdown` = VALUES(`fare_breakdown`),
            `include_gst` = VALUES(`include_gst`),
            `gst_percent` = VALUES(`gst_percent`),
            `gst_amount` = VALUES(`gst_amount`),
            `status` = VALUES(`status`),
            `car_name` = VALUES(`car_name`),
            `ip_address` = VALUES(`ip_address`),
            `source` = VALUES(`source`),
            `utm_source` = VALUES(`utm_source`),
            `utm_medium` = VALUES(`utm_medium`),
            `utm_campaign` = VALUES(`utm_campaign`),
            `utm_term` = VALUES(`utm_term`),
            `utm_content` = VALUES(`utm_content`),
            `device` = VALUES(`device`),
            `matchtype` = VALUES(`matchtype`),
            `gclid` = VALUES(`gclid`),
            `source_page` = VALUES(`source_page`),
            `used_referral_code` = VALUES(`used_referral_code`),
            `responded_by` = VALUES(`responded_by`),
            `dispatcher_notes` = VALUES(`dispatcher_notes`),
            `updated_at` = CURRENT_TIMESTAMP';

        $clientIp = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['HTTP_X_REAL_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '';
        $clientIp = trim(explode(',', $clientIp)[0] ?? '');

        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            $customerId,
            $bookingId,
            $pickupPlain,
            $viaLocations,
            $dropPlain,
            $tripType,
            $pickupDate,
            $pickupTime,
            $returnDate,
            $returnTime,
            $tripDays,
            $dist,
            $duration,
            $baseFare,
            $fareEstimate > 0 ? $fareEstimate : null,
            $final,
            $discountAmount,
            $fareType,
            $fareBreakdownJson,
            $includeGst,
            $gstPercent,
            $gstAmount,
            $status,
            $carName,
            $clientIp,
            $bookingData['source'] ?? 'organic',
            $bookingData['utmSource'] ?? '',
            $bookingData['utmMedium'] ?? '',
            $bookingData['utmCampaign'] ?? '',
            $bookingData['utmTerm'] ?? '',
            $bookingData['utmContent'] ?? '',
            $bookingData['device'] ?? '',
            $bookingData['matchtype'] ?? '',
            $bookingData['gclid'] ?? '',
            $sourcePage,
            $usedReferralCode ?: null,
            $respondedBy !== '' ? $respondedBy : null,
            !empty($bookingData['dispatcherNotes']) ? trim((string)$bookingData['dispatcherNotes']) : null
        ]);

        // Urgent-booking flag ("Urgent - need taxi immediately", Phase 3) -
        // mirrors the same flag already sent to the FastAPI backend's
        // /api/website/bookings (see api/confirm_booking.php), so
        // pages/thank-you.php can pick the right auto-approve countdown
        // window (urgent_approve_seconds vs auto_approve_seconds) without a
        // second backend round-trip. The `is_urgent` column is added by a
        // standalone, human-run migration (admin/sql/migrate-urgent-booking.sql)
        // rather than the self-healing dropcars_ensure_bookings_columns() -
        // detect its presence at runtime so this keeps working, silently
        // no-op, both before and after that migration is applied.
        static $hasIsUrgentCol = null;
        if ($hasIsUrgentCol === null) {
            try {
                $hasIsUrgentCol = in_array('is_urgent', $pdo->query("SHOW COLUMNS FROM `bookings`")->fetchAll(PDO::FETCH_COLUMN), true);
            } catch (Throwable $e) {
                $hasIsUrgentCol = false;
            }
        }
        if ($hasIsUrgentCol && $isUrgent) {
            try {
                $pdo->prepare("UPDATE `bookings` SET `is_urgent` = 1 WHERE `booking_id` = ?")->execute([$bookingId]);
            } catch (Throwable $e) {}
        }

        // Mark redeemed wallet coupon as claimed if confirmed/completed
        if (($status === 'confirmed' || $status === 'completed') && !empty($usedReferralCode) && strpos($usedReferralCode, 'DCRP-') === 0) {
            $stmtClaim = $pdo->prepare("UPDATE `referral_claims` SET `status` = 'claimed' WHERE `redeem_code` = ?");
            $stmtClaim->execute([$usedReferralCode]);
        }

        $pdo->commit();

        // Process referral credit ledger updates
        if ($status === 'confirmed' || $status === 'completed') {
            $stmtId = $pdo->prepare("SELECT `id` FROM `bookings` WHERE `booking_id` = ? LIMIT 1");
            $stmtId->execute([$bookingId]);
            $realPk = $stmtId->fetchColumn();
            if ($realPk) {
                dropcars_process_referral_credit($pdo, (int)$realPk, $status);
            }
        }

        return true;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('Drop Cars confirm_booking DB persist: ' . $e->getMessage());

        return false;
    }
}
