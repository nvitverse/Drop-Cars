-- AirportTaxi.International — multi-site registration migration
--
-- Run this on the same production database Drop Cars already uses, AFTER
-- admin/sql/migrate-multi-site.sql has been applied at least once (this
-- script assumes `registered_sites`, `site_configs`, and the `website`
-- columns on `enquiries`/`bookings` already exist — it just adds the new
-- site's row; steps 4 & 5 are repeated here, idempotently, only in case
-- migrate-multi-site.sql was never run on this database).
--
-- This is what makes AirportTaxi.International appear in the admin
-- "Website Context" selector (admin/includes/sidebar-nav.php) alongside
-- Drop Cars and the other registered brands.

-- 1. Ensure the multi-site tables exist (safe no-op if already present)
CREATE TABLE IF NOT EXISTS `registered_sites` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `slug` VARCHAR(50) NOT NULL UNIQUE,
    `domain_name` VARCHAR(255) NOT NULL,
    `display_name` VARCHAR(255) NOT NULL,
    `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `site_configs` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `website` VARCHAR(50) NOT NULL UNIQUE,
    `config_json` LONGTEXT NOT NULL,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_site_configs_website_ati` FOREIGN KEY (`website`) REFERENCES `registered_sites` (`slug`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Register AirportTaxi.International as its own site
INSERT INTO `registered_sites` (`slug`, `domain_name`, `display_name`, `status`) VALUES
('airporttaxi', 'airporttaxi.international', 'AirportTaxi.International', 'active')
ON DUPLICATE KEY UPDATE `domain_name` = VALUES(`domain_name`), `display_name` = VALUES(`display_name`);

-- 3. Ensure `website` column exists on enquiries / bookings (idempotent —
--    matches admin/sql/migrate-multi-site.sql exactly, safe to re-run)
SET @dbname = DATABASE();

SET @tablename = 'enquiries';
SET @columnname = 'website';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE table_schema = @dbname AND table_name = @tablename AND column_name = @columnname) > 0,
  'SELECT "Column website already exists in enquiries."',
  'ALTER TABLE `enquiries` ADD COLUMN `website` VARCHAR(50) NOT NULL DEFAULT "dropcars" AFTER `id`, ADD INDEX `idx_enquiries_website` (`website`)'
));
PREPARE stmt FROM @preparedStatement;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tablename = 'bookings';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE table_schema = @dbname AND table_name = @tablename AND column_name = @columnname) > 0,
  'SELECT "Column website already exists in bookings."',
  'ALTER TABLE `bookings` ADD COLUMN `website` VARCHAR(50) NOT NULL DEFAULT "dropcars" AFTER `id`, ADD INDEX `idx_bookings_website` (`website`)'
));
PREPARE stmt FROM @preparedStatement;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- After this runs, api/airporttaxi-confirm-booking.php's
-- `UPDATE bookings SET website = 'airporttaxi' WHERE booking_id = ?`
-- (which it already attempts, non-fatally, even before this migration
-- exists) will start succeeding, and the admin site selector will show
-- AirportTaxi.International's bookings when that context is chosen.
