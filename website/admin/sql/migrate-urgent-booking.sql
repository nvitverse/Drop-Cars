-- Urgent booking — website `bookings` table migration
--
-- Adds `is_urgent` so pages/thank-you.php (and anything else reading the
-- website's own `bookings` table) can tell whether a given booking used the
-- "Urgent - need taxi immediately" Razorpay advance-payment flow (Phase 3 of
-- the urgent-booking feature: assets/js/booking-form.js's
-- startUrgentAdvancePayment() + api/confirm_booking.php's is_urgent/
-- rp_order_id/rp_payment_id/rp_signature forwarding to the FastAPI backend's
-- /api/website/bookings). thank-you.php uses this to pick the correct
-- live-countdown window - urgent_approve_seconds vs auto_approve_seconds,
-- both from the backend's GET /api/website/bookings/settings.
--
-- NOT auto-run anywhere in this codebase, unlike most of this website's
-- other `bookings` column migrations, which self-heal on every request via
-- admin/includes/enquiries-schema.php's dropcars_ensure_bookings_columns().
-- This one is intentionally a standalone, human-run script instead - mirrors
-- the backend's `dropcars-review/backend/Testing code/
-- run_urgent_booking_migration.py` precedent (never auto-run, always
-- human-executed). Run this manually against the target MySQL database
-- (local dev DB first, then production only when this feature actually
-- ships) before relying on is_urgent being persisted.
--
-- Until this has been run, api/booking-persist.php detects the column's
-- absence at runtime (a cached SHOW COLUMNS check) and simply skips
-- persisting the flag - booking creation itself is unaffected either way,
-- and pages/thank-you.php just falls back to the normal (non-urgent)
-- auto_approve_seconds countdown window for every booking.

SET @dbname = DATABASE();
SET @tablename = 'bookings';
SET @columnname = 'is_urgent';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE table_schema = @dbname AND table_name = @tablename AND column_name = @columnname) > 0,
  'SELECT "Column is_urgent already exists in bookings."',
  'ALTER TABLE `bookings` ADD COLUMN `is_urgent` TINYINT(1) NOT NULL DEFAULT 0 AFTER `posting_status`, ADD INDEX `idx_bookings_is_urgent` (`is_urgent`)'
));
PREPARE stmt FROM @preparedStatement;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
