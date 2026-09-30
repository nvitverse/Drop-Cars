-- Drop Cars — Hostinger / MySQL 5.7+ (MariaDB compatible)
-- 1. In hPanel → Databases → create database + user; assign ALL privileges.
-- 2. Open phpMyAdmin → select that database → Import → choose this file.
--    Do NOT run "CREATE DATABASE" here — Hostinger already created the empty DB.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- Admins (panel login + password reset)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `admins` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL DEFAULT 'Admin',
  `username` VARCHAR(255) NULL DEFAULT 'admin',
  `email` VARCHAR(255) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `password_must_change` TINYINT(1) NOT NULL DEFAULT 0,
  `temporary_password_set_at` DATETIME NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `password_resets` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(255) NOT NULL,
  `token` VARCHAR(255) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_email` (`email`),
  KEY `idx_token` (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Customers & Bookings (with advanced loyalty, referral, tracking, and marketing parameters)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `customers` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL DEFAULT 'Guest',
  `email` VARCHAR(255) NULL DEFAULT NULL,
  `password` VARCHAR(255) NULL DEFAULT NULL,
  `phone` VARCHAR(64) NOT NULL,
  `use_whatsapp` TINYINT(1) NOT NULL DEFAULT 1,
  `referral_code` VARCHAR(50) NULL DEFAULT NULL,
  `referral_balance` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `is_verified` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_phone` (`phone`),
  UNIQUE KEY `uq_referral_code` (`referral_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `bookings` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_id` INT UNSIGNED NOT NULL,
  `booking_id` VARCHAR(32) NOT NULL,
  `pickup_location` TEXT NOT NULL,
  `drop_location` TEXT NOT NULL,
  `trip_type` ENUM('oneway','round','multi') NOT NULL DEFAULT 'oneway',
  `pickup_date` DATE NULL,
  `pickup_time` VARCHAR(32) NULL,
  `distance_km` DECIMAL(10,2) NULL,
  `base_fare` DECIMAL(10,2) NULL,
  `estimated_fare` INT NULL,
  `discount_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `final_fare` DECIMAL(10,2) NULL,
  `status` ENUM('pending','confirmed','completed','cancelled') NOT NULL DEFAULT 'pending',
  `driver_name` VARCHAR(255) NULL,
  `driver_phone` VARCHAR(32) NULL,
  `car_name` VARCHAR(255) NULL,
  `car_number` VARCHAR(64) NULL,
  `duration` VARCHAR(64) NULL,
  `fare_type` VARCHAR(32) NULL DEFAULT 'exclusive',
  `ip_address` VARCHAR(64) NULL,
  `source` VARCHAR(32) NULL DEFAULT 'organic',
  `utm_source` VARCHAR(64) NULL,
  `utm_medium` VARCHAR(64) NULL,
  `utm_campaign` VARCHAR(128) NULL,
  `gclid` VARCHAR(128) NULL,
  `used_referral_code` VARCHAR(50) NULL DEFAULT NULL,
  `referral_credited` TINYINT(1) NOT NULL DEFAULT 0,
  `via_locations` TEXT NULL,
  `return_date` DATE NULL,
  `return_time` VARCHAR(32) NULL,
  `trip_days` INT UNSIGNED NULL,
  `fare_breakdown` TEXT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_booking_id` (`booking_id`),
  KEY `idx_customer` (`customer_id`),
  KEY `idx_status` (`status`),
  KEY `idx_created` (`created_at`),
  CONSTRAINT `fk_bookings_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Enquiries (from website send-enquiry API → dispatcher admin list)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `enquiries` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `booking_id` VARCHAR(64) NULL DEFAULT NULL,
  `name` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(50) NOT NULL,
  `pickup` VARCHAR(500) NOT NULL,
  `drop_location` VARCHAR(500) NOT NULL,
  `trip_type` VARCHAR(64) NULL DEFAULT 'one_way',
  `vehicle_type` VARCHAR(64) NULL DEFAULT NULL,
  `travel_date` DATE NULL,
  `travel_time` VARCHAR(32) NULL,
  `vehicle_estimates` TEXT NULL,
  `fare_estimate` INT NULL DEFAULT 0,
  `fare_type` VARCHAR(32) NULL DEFAULT 'exclusive',
  `distance_km` INT NULL DEFAULT 0,
  `duration` VARCHAR(64) NULL,
  `ip_address` VARCHAR(64) NULL,
  `source` VARCHAR(32) NULL DEFAULT 'organic',
  `utm_source` VARCHAR(64) NULL,
  `utm_medium` VARCHAR(64) NULL,
  `utm_campaign` VARCHAR(128) NULL,
  `gclid` VARCHAR(128) NULL,
  `dispatcher_notes` TEXT NULL,
  `followup_time` DATETIME NULL,
  `lead_stage` VARCHAR(32) NULL DEFAULT 'new',
  `assigned_dispatcher` VARCHAR(64) NULL,
  `used_referral_code` VARCHAR(50) NULL DEFAULT NULL,
  `status` ENUM('confirmed','not_confirmed','fake') NOT NULL DEFAULT 'not_confirmed',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_enquiries_booking_id` (`booking_id`),
  KEY `idx_status` (`status`),
  KEY `idx_created` (`created_at`),
  KEY `idx_phone` (`phone`),
  KEY `idx_ip` (`ip_address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Blocked IPs (Scraper & spam protection firewall)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `blocked_ips` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ip_address` VARCHAR(64) NOT NULL,
  `reason` TEXT NULL,
  `source_id` VARCHAR(64) NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ip` (`ip_address`),
  KEY `idx_ip` (`ip_address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Referral Ledger (Claims & payouts tracking)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `referral_claims` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_id` INT UNSIGNED NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `redeem_code` VARCHAR(50) NOT NULL,
  `status` ENUM('pending', 'claimed') NOT NULL DEFAULT 'pending',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_redeem_code` (`redeem_code`),
  KEY `idx_customer_claim` (`customer_id`),
  CONSTRAINT `fk_claims_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Reviews (Customer feedback showcase)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reviews` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_name` VARCHAR(255) NOT NULL,
  `customer_phone` VARCHAR(50) NOT NULL,
  `rating` TINYINT UNSIGNED NOT NULL DEFAULT 5,
  `comment` TEXT NOT NULL,
  `trip_route` VARCHAR(255) DEFAULT NULL,
  `is_verified` TINYINT(1) DEFAULT 1,
  `is_approved` TINYINT(1) DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_approved` (`is_approved`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Marketing (Banners & Popups)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `banners` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `type` ENUM('text', 'image') DEFAULT 'text',
  `content` TEXT NOT NULL,
  `link_url` TEXT NULL,
  `coupon_code` VARCHAR(50) NULL,
  `is_popup` TINYINT(1) DEFAULT 0,
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tariffs are stored and managed in data/tariffs.json (Serverless File Storage). No database table required!

-- ---------------------------------------------------------------------------
-- Coupons & Usages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `coupons` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(255) NOT NULL,
  `code` VARCHAR(50) NOT NULL,
  `discount_type` ENUM('flat','percentage') NOT NULL,
  `discount_value` DECIMAL(10,2) NOT NULL,
  `expiry_date` DATE NOT NULL,
  `apply_to_trip_type` VARCHAR(32) NULL DEFAULT 'all',
  `min_booking_amount` DECIMAL(10,2) NULL DEFAULT 0.00,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `coupon_usages` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `coupon_id` INT UNSIGNED NOT NULL,
  `booking_id` INT UNSIGNED NOT NULL,
  `customer_phone` VARCHAR(20) NULL,
  `discount_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `used_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_coupon` (`coupon_id`),
  KEY `idx_booking` (`booking_id`),
  CONSTRAINT `fk_cu_coupon` FOREIGN KEY (`coupon_id`) REFERENCES `coupons` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
