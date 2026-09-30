-- Multi-Website Migration Script

-- 1. Create registered_sites table
CREATE TABLE IF NOT EXISTS `registered_sites` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `slug` VARCHAR(50) NOT NULL UNIQUE,
    `domain_name` VARCHAR(255) NOT NULL,
    `display_name` VARCHAR(255) NOT NULL,
    `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Seed registered_sites table with listed websites
INSERT INTO `registered_sites` (`slug`, `domain_name`, `display_name`, `status`) VALUES
('dropcars', 'dropcars.in', 'Drop Cars', 'active'),
('tatacalltaxi', 'tatacalltaxi.in', 'Tata Call Taxi', 'active'),
('droptaxi247', '247droptaxi.com', '247 Drop Taxi', 'active'),
('onetheway', 'onetheway.in', 'One The Way', 'active'),
('yellowboard', 'yellowboard.in', 'Yellow Board', 'active'),
('arunachalatravels_com', 'arunachalatravels.com', 'Arunachala Travels COM', 'active'),
('arunachalatravels_in', 'arunachalatravels.in', 'Arunachala Travels IN', 'active'),
('arunchalamtravels_in', 'arunchalamtravels.in', 'Arunchalam Travels IN', 'active')
ON DUPLICATE KEY UPDATE `domain_name`=VALUES(`domain_name`), `display_name`=VALUES(`display_name`);

-- 3. Create site_configs table to hold JSON-based settings per site
CREATE TABLE IF NOT EXISTS `site_configs` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `website` VARCHAR(50) NOT NULL UNIQUE,
    `config_json` LONGTEXT NOT NULL,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_site_configs_website` FOREIGN KEY (`website`) REFERENCES `registered_sites` (`slug`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Alter enquiries table to add website column if it doesn't exist
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

-- 5. Alter bookings table to add website column if it doesn't exist
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
