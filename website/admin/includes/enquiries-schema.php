<?php
date_default_timezone_set('Asia/Kolkata');
/**
 * Ensures enquiries.booking_id exists and backfills legacy rows (DE… / DC… format).
 */

if (!function_exists('dropcars_ensure_enquiries_columns')) {
    function dropcars_ensure_enquiries_columns(PDO $pdo) {
        static $ensured = false;
        if ($ensured) return;
        $ensured = true;
        try {
            // Ensure booking_id (handled in older function too but putting it here for clarity)
            $cols = $pdo->query("SHOW COLUMNS FROM `enquiries`")->fetchAll(PDO::FETCH_COLUMN);
            $newCols = [
                'website' => "ADD COLUMN `website` VARCHAR(64) NULL DEFAULT 'dropcars.in'",
                'booking_id' => "ADD COLUMN `booking_id` VARCHAR(64) NULL DEFAULT NULL AFTER `id`",
                'trip_type' => "ADD COLUMN `trip_type` VARCHAR(64) NULL DEFAULT 'one_way' AFTER `drop_location` ",
                'vehicle_type' => "ADD COLUMN `vehicle_type` VARCHAR(64) NULL DEFAULT NULL AFTER `trip_type` ",
                'travel_time' => "ADD COLUMN `travel_time` VARCHAR(32) NULL AFTER `travel_date` ",
                'return_date' => "ADD COLUMN `return_date` DATE NULL AFTER `travel_time` ",
                'return_time' => "ADD COLUMN `return_time` VARCHAR(32) NULL AFTER `return_date` ",
                'vehicle_estimates' => "ADD COLUMN `vehicle_estimates` TEXT NULL AFTER `return_time` ",
                'fare_estimate' => "ADD COLUMN `fare_estimate` INT NULL DEFAULT 0 AFTER `vehicle_estimates` ",
                'fare_type' => "ADD COLUMN `fare_type` VARCHAR(32) NULL DEFAULT 'exclusive' AFTER `fare_estimate` ",
                'distance_km' => "ADD COLUMN `distance_km` INT NULL DEFAULT 0 AFTER `fare_estimate` ",
                'duration' => "ADD COLUMN `duration` VARCHAR(64) NULL AFTER `distance_km` ",
                'ip_address' => "ADD COLUMN `ip_address` VARCHAR(64) NULL AFTER `duration` ",
                'source' => "ADD COLUMN `source` VARCHAR(32) NULL DEFAULT 'organic' AFTER `ip_address` ",
                'utm_source' => "ADD COLUMN `utm_source` VARCHAR(64) NULL AFTER `source` ",
                'utm_medium' => "ADD COLUMN `utm_medium` VARCHAR(64) NULL AFTER `utm_source` ",
                'utm_campaign' => "ADD COLUMN `utm_campaign` VARCHAR(128) NULL AFTER `utm_medium` ",
                'utm_term' => "ADD COLUMN `utm_term` VARCHAR(255) NULL AFTER `utm_campaign` ",
                'utm_content' => "ADD COLUMN `utm_content` VARCHAR(255) NULL AFTER `utm_term` ",
                'device' => "ADD COLUMN `device` VARCHAR(32) NULL AFTER `utm_content` ",
                'matchtype' => "ADD COLUMN `matchtype` VARCHAR(32) NULL AFTER `device` ",
                'gclid' => "ADD COLUMN `gclid` VARCHAR(128) NULL AFTER `matchtype` ",
                'source_page' => "ADD COLUMN `source_page` VARCHAR(255) NULL AFTER `gclid` ",
                'dispatcher_notes' => "ADD COLUMN `dispatcher_notes` TEXT NULL AFTER `gclid` ",
                'followup_time' => "ADD COLUMN `followup_time` DATETIME NULL AFTER `dispatcher_notes` ",
                'lead_stage' => "ADD COLUMN `lead_stage` VARCHAR(32) NULL DEFAULT 'new' AFTER `followup_time` ",
                'assigned_dispatcher' => "ADD COLUMN `assigned_dispatcher` VARCHAR(64) NULL AFTER `lead_stage` ",
                'responded_by' => "ADD COLUMN `responded_by` VARCHAR(64) NULL AFTER `assigned_dispatcher` ",
                'used_referral_code' => "ADD COLUMN `used_referral_code` VARCHAR(50) NULL DEFAULT NULL AFTER `responded_by`",
                'fare_breakdown' => "ADD COLUMN `fare_breakdown` TEXT NULL AFTER `used_referral_code`",
                'include_gst' => "ADD COLUMN `include_gst` TINYINT(1) NOT NULL DEFAULT 0 AFTER `fare_breakdown`",
                'gst_percent' => "ADD COLUMN `gst_percent` DECIMAL(5,2) NOT NULL DEFAULT 5.00 AFTER `include_gst`",
                'gst_amount' => "ADD COLUMN `gst_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `gst_percent`",
                'is_touched' => "ADD COLUMN `is_touched` TINYINT(1) NOT NULL DEFAULT 0 AFTER `gst_amount`",
                // The CustomerBookingRequest.id on the FastAPI backend, once this
                // enquiry gets posted to the driver/vendor app marketplace -
                // mirrors the `bookings` table's own column of the same name.
                'backend_request_id' => "ADD COLUMN `backend_request_id` VARCHAR(64) NULL AFTER `is_touched`",
                // Driver-facing per-km rate (what a Driver/Vendor App shows,
                // e.g. "cost_per_km / extra_cost_per_km") - separate from
                // fare_estimate above, which is the CUSTOMER's total price.
                // Editable from the Customize modal (case 'customize_booking'
                // below); when set, also pushed to the linked
                // CustomerBookingRequest.admin_cost_per_km/admin_extra_cost_per_km
                // on the FastAPI backend (see dropcars_backend_request calls in
                // admin-app-enquiries.php) so it actually reaches the driver
                // once the enquiry is confirmed into a real booking - added
                // 2026-09-04, this table never had a driver-price concept at
                // all before.
                'cost_per_km' => "ADD COLUMN `cost_per_km` INT NULL AFTER `backend_request_id`",
                'extra_cost_per_km' => "ADD COLUMN `extra_cost_per_km` INT NULL AFTER `cost_per_km`",
                // Customer-side extra charges on top of fare_estimate - the
                // Customize modal already had a field for this, it just had
                // nowhere to save.
                'extra_charges' => "ADD COLUMN `extra_charges` INT NULL AFTER `extra_cost_per_km`",
            ];

            foreach ($newCols as $col => $sql) {
                if (!in_array($col, $cols)) {
                    try {
                        $pdo->exec("ALTER TABLE `enquiries` $sql");
                    } catch (Throwable $colEx) {
                        // Log but continue - one column failure must not block others
                        error_log('[dropcars] enquiries-schema: could not add column `' . $col . '`: ' . $colEx->getMessage());
                    }
                }
            }

            // Create index if it didn't exist
            try {
                $pdo->exec("ALTER TABLE `enquiries` ADD UNIQUE INDEX IF NOT EXISTS `uq_enquiries_booking_id` (`booking_id`)");
            } catch (Throwable $e) {}

            dropcars_backfill_enquiries_booking_ids($pdo);
        } catch (Throwable $e) {}
    }
}

if (!function_exists('dropcars_ensure_bookings_columns')) {
    function dropcars_ensure_bookings_columns(PDO $pdo) {
        try {
            $cols = $pdo->query("SHOW COLUMNS FROM `bookings`")->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('duration', $cols)) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `duration` VARCHAR(64) NULL AFTER `distance_km` ");
            }
            if (!in_array('fare_type', $cols)) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `fare_type` VARCHAR(32) NULL DEFAULT 'exclusive' AFTER `duration` ");
            }
            if (!in_array('ip_address', $cols)) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `ip_address` VARCHAR(64) NULL AFTER `fare_type` ");
            }
            if (!in_array('source', $cols)) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `source` VARCHAR(32) NULL DEFAULT 'organic' AFTER `ip_address` ");
            }
            if (!in_array('utm_source', $cols)) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `utm_source` VARCHAR(64) NULL AFTER `source` ");
            }
            if (!in_array('utm_medium', $cols)) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `utm_medium` VARCHAR(64) NULL AFTER `utm_source` ");
            }
            if (!in_array('utm_campaign', $cols)) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `utm_campaign` VARCHAR(128) NULL AFTER `utm_medium` ");
            }
            if (!in_array('utm_term', $cols)) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `utm_term` VARCHAR(255) NULL AFTER `utm_campaign` ");
            }
            if (!in_array('utm_content', $cols)) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `utm_content` VARCHAR(255) NULL AFTER `utm_term` ");
            }
            if (!in_array('device', $cols)) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `device` VARCHAR(32) NULL AFTER `utm_content` ");
            }
            if (!in_array('matchtype', $cols)) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `matchtype` VARCHAR(32) NULL AFTER `device` ");
            }
            if (!in_array('gclid', $cols)) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `gclid` VARCHAR(128) NULL AFTER `matchtype` ");
            }
            if (!in_array('dispatcher_notes', $cols)) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `dispatcher_notes` TEXT NULL AFTER `gclid` ");
            }
            if (!in_array('source_page', $cols)) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `source_page` VARCHAR(255) NULL AFTER `gclid` ");
            }
            if (!in_array('used_referral_code', $cols)) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `used_referral_code` VARCHAR(50) NULL DEFAULT NULL AFTER `gclid`");
            }
            if (!in_array('referral_credited', $cols)) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `referral_credited` TINYINT(1) NOT NULL DEFAULT 0 AFTER `used_referral_code`");
            }
            if (!in_array('via_locations', $cols)) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `via_locations` TEXT NULL AFTER `referral_credited`");
            }
            if (!in_array('return_date', $cols)) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `return_date` DATE NULL AFTER `via_locations`");
            }
            if (!in_array('return_time', $cols)) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `return_time` VARCHAR(32) NULL AFTER `return_date`");
            }
            if (!in_array('trip_days', $cols)) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `trip_days` INT UNSIGNED NULL AFTER `return_time`");
            }
            if (!in_array('fare_breakdown', $cols)) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `fare_breakdown` TEXT NULL AFTER `trip_days`");
            }
            if (!in_array('include_gst', $cols)) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `include_gst` TINYINT(1) NOT NULL DEFAULT 0 AFTER `fare_breakdown`");
            }
            if (!in_array('gst_percent', $cols)) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `gst_percent` DECIMAL(5,2) NOT NULL DEFAULT 5.00 AFTER `include_gst`");
            }
            if (!in_array('gst_amount', $cols)) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `gst_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `gst_percent`");
            }
            if (!in_array('advance_paid', $cols)) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `advance_paid` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `gst_amount`");
            }
            // Tracks the driver-app-marketplace posting bridge (see
            // api/includes/backend-client.php + api/confirm_booking.php).
            // backend_request_id = the CustomerBookingRequest.id on the FastAPI
            // backend; posting_status mirrors its PENDING/APPROVED/REJECTED
            // status (or 'not_configured'/'error' if the bridge call failed).
            if (!in_array('backend_request_id', $cols)) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `backend_request_id` VARCHAR(64) NULL AFTER `advance_paid`");
            }
            if (!in_array('posting_status', $cols)) {
                $pdo->exec("ALTER TABLE `bookings` ADD COLUMN `posting_status` VARCHAR(32) NULL AFTER `backend_request_id`");
            }
        } catch (Throwable $e) {}
    }
}

if (!function_exists('dropcars_ensure_customers_columns')) {
    function dropcars_ensure_customers_columns(PDO $pdo) {
        try {
            $cols = $pdo->query("SHOW COLUMNS FROM `customers`")->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('email', $cols)) {
                $pdo->exec("ALTER TABLE `customers` ADD COLUMN `email` VARCHAR(255) NULL DEFAULT NULL AFTER `name`");
            }
            if (!in_array('password', $cols)) {
                $pdo->exec("ALTER TABLE `customers` ADD COLUMN `password` VARCHAR(255) NULL DEFAULT NULL AFTER `email`");
            }
            if (!in_array('use_whatsapp', $cols)) {
                $pdo->exec("ALTER TABLE `customers` ADD COLUMN `use_whatsapp` TINYINT(1) NOT NULL DEFAULT 1 AFTER `phone`");
            }
            if (!in_array('referral_code', $cols)) {
                $pdo->exec("ALTER TABLE `customers` ADD COLUMN `referral_code` VARCHAR(50) NULL DEFAULT NULL AFTER `use_whatsapp`");
                try {
                    $pdo->exec("ALTER TABLE `customers` ADD UNIQUE INDEX `uq_referral_code` (`referral_code`)");
                } catch (Throwable $e) {}
            }
            if (!in_array('referral_balance', $cols)) {
                $pdo->exec("ALTER TABLE `customers` ADD COLUMN `referral_balance` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `referral_code`");
            }
            if (!in_array('referred_by_code', $cols)) {
                $pdo->exec("ALTER TABLE `customers` ADD COLUMN `referred_by_code` VARCHAR(50) NULL DEFAULT NULL AFTER `referral_balance`");
            }
            if (!in_array('referred_credited', $cols)) {
                $pdo->exec("ALTER TABLE `customers` ADD COLUMN `referred_credited` TINYINT(1) NOT NULL DEFAULT 0 AFTER `referred_by_code`");
            }
        } catch (Throwable $e) {}
    }
}

if (!function_exists('dropcars_ensure_spam_tables')) {
    function dropcars_ensure_spam_tables(PDO $pdo) {
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS `blocked_ips` (
                `id` INT AUTO_INCREMENT PRIMARY KEY,
                `ip_address` VARCHAR(64) NOT NULL UNIQUE,
                `reason` TEXT NULL,
                `source_id` VARCHAR(64) NULL,
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
        } catch (Throwable $e) {}
    }
}

if (!function_exists('dropcars_ensure_driver_locations_table')) {
    function dropcars_ensure_driver_locations_table(PDO $pdo) {
        static $ensured = false;
        if ($ensured) return;
        $ensured = true;
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS `driver_locations` (
                `id` INT AUTO_INCREMENT PRIMARY KEY,
                `booking_id` VARCHAR(64) NOT NULL,
                `driver_phone` VARCHAR(32) NULL,
                `lat` DECIMAL(10, 8) NOT NULL,
                `lng` DECIMAL(11, 8) NOT NULL,
                `heading` DECIMAL(5, 2) NULL DEFAULT 0.00,
                `speed` DECIMAL(5, 2) NULL DEFAULT 0.00,
                `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY `uq_driver_booking` (`booking_id`),
                KEY `idx_updated_at` (`updated_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
        } catch (Throwable $e) {}
    }
}

if (!function_exists('dropcars_ensure_reviews_table')) {
    function dropcars_ensure_reviews_table(PDO $pdo) {
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS `reviews` (
                `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                `customer_name` VARCHAR(255) NOT NULL,
                `customer_phone` VARCHAR(50) NOT NULL,
                `rating` TINYINT UNSIGNED NOT NULL DEFAULT 5,
                `comment` TEXT NOT NULL,
                `trip_route` VARCHAR(255) DEFAULT NULL,
                `is_verified` TINYINT(1) DEFAULT 1,
                `is_approved` TINYINT(1) DEFAULT 1,
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX `idx_approved` (`is_approved`),
                INDEX `idx_created` (`created_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
        } catch (Throwable $e) {}
    }
}

if (!function_exists('dropcars_ensure_referral_tables')) {
    function dropcars_ensure_referral_tables(PDO $pdo) {
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS `referral_claims` (
                `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                `customer_id` INT UNSIGNED NOT NULL,
                `amount` DECIMAL(10,2) NOT NULL,
                `redeem_code` VARCHAR(50) NOT NULL UNIQUE,
                `status` ENUM('pending', 'claimed') NOT NULL DEFAULT 'pending',
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                KEY `idx_customer_claim` (`customer_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;");
        } catch (Throwable $e) {}
    }
}

if (!function_exists('dropcars_backfill_customer_referral_codes')) {
    function dropcars_backfill_customer_referral_codes(PDO $pdo) {
        try {
            $stmt = $pdo->query("SELECT `id`, `name` FROM `customers` WHERE `referral_code` IS NULL OR `referral_code` = ''");
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            if (!empty($rows)) {
                $upd = $pdo->prepare("UPDATE `customers` SET `referral_code` = ? WHERE `id` = ?");
                foreach ($rows as $row) {
                    $cleanName = preg_replace('/[^A-Za-z]/', '', $row['name'] ?? '');
                    $firstName = strtoupper(substr($cleanName, 0, 5));
                    if (empty($firstName)) {
                        $firstName = 'USER';
                    }
                    $code = 'DC' . $firstName . $row['id'];
                    try {
                        $upd->execute([$code, $row['id']]);
                    } catch (Throwable $ex) {
                        $codeConflict = $code . rand(10, 99);
                        try {
                            $upd->execute([$codeConflict, $row['id']]);
                        } catch (Throwable $ex2) {}
                    }
                }
            }
        } catch (Throwable $e) {}
    }
}

if (!function_exists('dropcars_process_referral_credit')) {
    function dropcars_process_referral_credit(PDO $pdo, $bookingId, $status) {
        try {
            if (!in_array($status, ['confirmed', 'completed'])) {
                return false;
            }

            $stmt = $pdo->prepare("SELECT `id`, `used_referral_code`, `referral_credited`, `customer_id` FROM `bookings` WHERE `id` = ? LIMIT 1");
            $stmt->execute([$bookingId]);
            $b = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$b || empty($b['used_referral_code']) || $b['referral_credited']) {
                return false;
            }

            $refCode = strtoupper(trim($b['used_referral_code']));

            $stmt = $pdo->prepare("SELECT `id` FROM `customers` WHERE `referral_code` = ? LIMIT 1");
            $stmt->execute([$refCode]);
            $referrerId = $stmt->fetchColumn();

            if (!$referrerId || (int)$referrerId === (int)$b['customer_id']) {
                $pdo->prepare("UPDATE `bookings` SET `referral_credited` = 1 WHERE `id` = ?")->execute([$bookingId]);
                return false;
            }

            $configPath = dirname(__DIR__, 2) . '/api/config.php';
            $config = is_file($configPath) ? (include $configPath) : [];
            $rewardAmt = (float)($config['referralRewardAmount'] ?? 100.00);

            $pdo->beginTransaction();
            $pdo->prepare("UPDATE `customers` SET `referral_balance` = `referral_balance` + ? WHERE `id` = ?")->execute([$rewardAmt, $referrerId]);
            $pdo->prepare("UPDATE `bookings` SET `referral_credited` = 1 WHERE `id` = ?")->execute([$bookingId]);
            $pdo->commit();
            return true;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log("dropcars_process_referral_credit error: " . $e->getMessage());
            return false;
        }
    }
}

if (!function_exists('dropcars_ensure_enquiries_booking_id_column')) {
    function dropcars_ensure_enquiries_booking_id_column(PDO $pdo) {
        dropcars_ensure_enquiries_columns($pdo);
        dropcars_ensure_bookings_columns($pdo);
        dropcars_ensure_customers_columns($pdo);
        dropcars_ensure_spam_tables($pdo);
        dropcars_ensure_marketing_tables($pdo);
        dropcars_ensure_reviews_table($pdo);
        dropcars_ensure_referral_tables($pdo);
        dropcars_backfill_customer_referral_codes($pdo);
    }
}

if (!function_exists('dropcars_backfill_enquiries_booking_ids')) {
    function dropcars_backfill_enquiries_booking_ids(PDO $pdo) {
        static $bf = false;
        if ($bf) {
            return;
        }
        $bf = true;
        try {
            $nullRows = $pdo->query(
                "SELECT `id`, `created_at`, `status` FROM `enquiries` " .
                "WHERE `booking_id` IS NULL OR `booking_id` = ''"
            )->fetchAll(PDO::FETCH_ASSOC);

            if (empty($nullRows)) {
                return;
            }

            $upd = $pdo->prepare("UPDATE `enquiries` SET `booking_id` = ? WHERE `id` = ?");

            foreach ($nullRows as $row) {
                $eid = (int)$row['id'];
                $status = strtolower(trim((string)($row['status'] ?? '')));
                $prefix = ($status === 'confirmed' || $status === 'completed') ? 'C' : 'E';
                
                $created = !empty($row['created_at']) ? $row['created_at'] : date('Y-m-d H:i:s');
                $ymd = date('ymd', strtotime($created));
                
                $seq = 1;
                $stmtCheckEnq = $pdo->prepare("SELECT COUNT(*) FROM `enquiries` WHERE `booking_id` = ? AND `id` != ?");
                $stmtCheckBk = $pdo->prepare("SELECT COUNT(*) FROM `bookings` WHERE `booking_id` = ?");
                
                do {
                    $candidateId = $prefix . $ymd . str_pad((string)$seq, 2, '0', STR_PAD_LEFT);
                    
                    $stmtCheckEnq->execute([$candidateId, $eid]);
                    $existsEnq = (int)$stmtCheckEnq->fetchColumn() > 0;
                    
                    $stmtCheckBk->execute([$candidateId]);
                    $existsBk = (int)$stmtCheckBk->fetchColumn() > 0;
                    
                    if (!$existsEnq && !$existsBk) {
                        break;
                    }
                    $seq++;
                } while ($seq < 9999);
                
                $upd->execute([$candidateId, $eid]);
            }
        } catch (Throwable $e) {
            error_log("Enquiries backfill error: " . $e->getMessage());
        }
    }
}

if (!function_exists('dropcars_ensure_marketing_tables')) {
    function dropcars_ensure_marketing_tables(PDO $pdo) {
        try {
            // Ensure Coupons table
            $pdo->exec("CREATE TABLE IF NOT EXISTS `coupons` (
                `id` INT AUTO_INCREMENT PRIMARY KEY,
                `title` VARCHAR(255) NOT NULL,
                `code` VARCHAR(50) NOT NULL UNIQUE,
                `discount_type` ENUM('flat', 'percentage') DEFAULT 'flat',
                `discount_value` DECIMAL(10,2) NOT NULL,
                `expiry_date` DATE NOT NULL,
                `apply_to_trip_type` VARCHAR(32) DEFAULT 'all',
                `min_booking_amount` DECIMAL(10,2) DEFAULT 0.00,
                `is_active` TINYINT(1) DEFAULT 1,
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

            // Migration for coupons table
            $cols = $pdo->query("SHOW COLUMNS FROM `coupons`")->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('apply_to_trip_type', $cols)) {
                $pdo->exec("ALTER TABLE `coupons` ADD COLUMN `apply_to_trip_type` VARCHAR(32) DEFAULT 'all' AFTER `expiry_date`");
            }
            if (!in_array('min_booking_amount', $cols)) {
                $pdo->exec("ALTER TABLE `coupons` ADD COLUMN `min_booking_amount` DECIMAL(10,2) DEFAULT 0.00 AFTER `apply_to_trip_type`");
            }

            // Ensure Banners table
            $pdo->exec("CREATE TABLE IF NOT EXISTS `banners` (
                `id` INT AUTO_INCREMENT PRIMARY KEY,
                `type` ENUM('text', 'image') DEFAULT 'text',
                `content` TEXT NOT NULL,
                `link_url` TEXT NULL,
                `coupon_code` VARCHAR(50) NULL,
                `is_popup` TINYINT(1) DEFAULT 0,
                `is_active` TINYINT(1) DEFAULT 1,
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

            // Check for new columns in banners
            $cols = $pdo->query("SHOW COLUMNS FROM `banners`")->fetchAll(PDO::FETCH_COLUMN);
            if (!in_array('coupon_code', $cols)) {
                $pdo->exec("ALTER TABLE `banners` ADD COLUMN `coupon_code` VARCHAR(50) NULL AFTER `content` ");
            }
            if (!in_array('is_popup', $cols)) {
                $pdo->exec("ALTER TABLE `banners` ADD COLUMN `is_popup` TINYINT(1) DEFAULT 0 AFTER `coupon_code` ");
            }
            if (!in_array('link_url', $cols)) {
                $pdo->exec("ALTER TABLE `banners` ADD COLUMN `link_url` TEXT NULL AFTER `content` ");
            }

            // Ensure Coupon Usages table
            $pdo->exec("CREATE TABLE IF NOT EXISTS `coupon_usages` (
                `id` INT AUTO_INCREMENT PRIMARY KEY,
                `coupon_id` INT NOT NULL,
                `booking_id` INT NOT NULL,
                `customer_phone` VARCHAR(20) NULL,
                `discount_amount` DECIMAL(10,2) DEFAULT 0,
                `used_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

        } catch (Throwable $e) {}
    }
}

if (!function_exists('dropcars_max_daily_booking_sequence')) {
    /**
     * Max numeric suffix for date code (yymmdd) across both enquiries and bookings tables.
     */
    function dropcars_max_daily_booking_sequence(?PDO $pdo, string $ymd, string $prefix = '') {
        $max = 0;
        $pattern = '%' . $ymd . '%';
        $tables = ['enquiries', 'bookings'];
        
        if ($pdo instanceof PDO) {
            foreach ($tables as $table) {
                try {
                    $stmt = $pdo->prepare("SELECT `booking_id` FROM `{$table}` WHERE `booking_id` LIKE ?");
                    $stmt->execute([$pattern]);
                    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                        $bid = trim((string)($row['booking_id'] ?? ''));
                        if (preg_match('/^(?:E|C|DE|DC)?' . preg_quote($ymd, '/') . '(\d+)$/i', $bid, $m)) {
                            $max = max($max, (int)$m[1]);
                        }
                    }
                } catch (Throwable $e) {
                    error_log("Error getting max sequence for {$table}: " . $e->getMessage());
                }
            }
        }
        return $max;
    }
}

if (!function_exists('dropcars_next_enquiry_booking_id')) {
    /**
     * Next ID: E + YYMMDD + NN for enquiries, C + YYMMDD + NN for bookings.
     * Combines Database Max Check + Atomic File Counter to guarantee strict consecutive sequencing (01, 02, 03...)
     */
    function dropcars_next_enquiry_booking_id(?PDO $pdo = null, string $prefix = 'E') {
        $p = strtoupper(trim($prefix));
        $prefixOut = ($p === 'DC' || $p === 'C') ? 'C' : 'E';
        $ymd = date('ymd');
        
        // 1. Get current max from DB
        $dbMax = ($pdo instanceof PDO) ? dropcars_max_daily_booking_sequence($pdo, $ymd, $prefixOut) : 0;
        
        // 2. Atomic daily file sequence tracking to prevent duplicate ID collision even before DB commit
        $seqDir = __DIR__ . '/../../api/storage';
        if (!is_dir($seqDir)) {
            @mkdir($seqDir, 0775, true);
        }
        $seqFile = $seqDir . '/seq_' . $ymd . '.txt';
        $fileSeq = 0;
        
        $fp = @fopen($seqFile, 'c+');
        if ($fp) {
            if (flock($fp, LOCK_EX)) {
                $content = trim((string) stream_get_contents($fp));
                $fileSeq = (int) $content;
                
                $nextSeq = max($dbMax, $fileSeq) + 1;
                
                ftruncate($fp, 0);
                rewind($fp);
                fwrite($fp, (string) $nextSeq);
                fflush($fp);
                flock($fp, LOCK_UN);
                fclose($fp);
            } else {
                fclose($fp);
                $nextSeq = $dbMax + 1;
            }
        } else {
            $nextSeq = $dbMax + 1;
        }

        $candidateId = $prefixOut . $ymd . str_pad((string) $nextSeq, 2, '0', STR_PAD_LEFT);
        
        // 3. Double check DB uniqueness if PDO is connected
        if ($pdo instanceof PDO) {
            try {
                $stmtE = $pdo->prepare("SELECT COUNT(*) FROM `enquiries` WHERE `booking_id` = ? LIMIT 1");
                $stmtB = $pdo->prepare("SELECT COUNT(*) FROM `bookings` WHERE `booking_id` = ? LIMIT 1");
                $tries = 0;
                while ($tries < 100) {
                    $stmtE->execute([$candidateId]);
                    $stmtB->execute([$candidateId]);
                    if ((int)$stmtE->fetchColumn() === 0 && (int)$stmtB->fetchColumn() === 0) {
                        break;
                    }
                    $nextSeq++;
                    $candidateId = $prefixOut . $ymd . str_pad((string) $nextSeq, 2, '0', STR_PAD_LEFT);
                    $tries++;
                }
            } catch (Throwable $e) {
                error_log("dropcars_next_enquiry_booking_id collision check error: " . $e->getMessage());
            }
        }
        
        return $candidateId;
    }
}

if (!function_exists('dropcars_credit_signup_referral')) {
    /**
     * Credit referring customer and newly registered customer with ₹100 when invited user registers/logs in with email
     */
    function dropcars_credit_signup_referral(PDO $pdo, $customerId) {
        if (session_status() === PHP_SESSION_NONE) {
            @session_start();
        }
        $refCode = $_SESSION['pending_referral'] ?? '';
        if (empty($refCode)) {
            return false;
        }
        
        $refCode = strtoupper(trim($refCode));
        
        try {
            // Check if this customer was already credited or has a referrer recorded
            $stmt = $pdo->prepare("SELECT `referred_credited`, `referral_code` FROM `customers` WHERE `id` = ? LIMIT 1");
            $stmt->execute([$customerId]);
            $cust = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$cust || $cust['referred_credited']) {
                return false;
            }
            
            // A user cannot refer themselves
            if ($refCode === strtoupper(trim($cust['referral_code'] ?? ''))) {
                return false;
            }
            
            // Find referring customer
            $stmt = $pdo->prepare("SELECT `id` FROM `customers` WHERE `referral_code` = ? LIMIT 1");
            $stmt->execute([$refCode]);
            $referrerId = $stmt->fetchColumn();
            
            if (!$referrerId || (int)$referrerId === (int)$customerId) {
                return false;
            }
            
            $configPath = dirname(__DIR__, 2) . '/api/config.php';
            $config = is_file($configPath) ? (include $configPath) : [];
            $rewardAmt = (float)($config['referralRewardAmount'] ?? 100.00);

            // Credit reward to both referrer and referee
            $pdo->beginTransaction();
            // Credit referrer
            $pdo->prepare("UPDATE `customers` SET `referral_balance` = `referral_balance` + ? WHERE `id` = ?")
                ->execute([$rewardAmt, $referrerId]);
            // Credit newly registered customer (referee) and mark them as having used the referral
            $pdo->prepare("UPDATE `customers` SET `referral_balance` = `referral_balance` + ?, `referred_by_code` = ?, `referred_credited` = 1 WHERE `id` = ?")
                ->execute([$rewardAmt, $refCode, $customerId]);
            $pdo->commit();
            
            // Clear session code since it has been successfully applied
            unset($_SESSION['pending_referral']);
            return true;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log("dropcars_credit_signup_referral error: " . $e->getMessage());
            return false;
        }
    }
}
