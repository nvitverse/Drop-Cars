-- Drop Cars — Hostinger Complete Production Database Schema
-- 1. Create a MySQL database and user in your new Hostinger hPanel.
-- 2. Open phpMyAdmin for the new database.
-- 3. Click the "SQL" tab or "Import" tab at the top.
-- 4. Copy and paste this ENTIRE file into the SQL box and click "Go" (or upload this file).

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- 1. Core Routing & Cities Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `cities` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `slug` VARCHAR(64) NOT NULL UNIQUE,
  `city` VARCHAR(128) NOT NULL,
  `status` ENUM('active','disabled') NOT NULL DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `routes` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `from_slug` VARCHAR(64) NOT NULL,
  `to_slug` VARCHAR(64) NOT NULL,
  `from_city` VARCHAR(128) NOT NULL,
  `to_city` VARCHAR(128) NOT NULL,
  `distance_km` INT UNSIGNED NOT NULL DEFAULT 0,
  `travel_time` VARCHAR(32) DEFAULT NULL,
  `highway` VARCHAR(64) DEFAULT NULL,
  `status` ENUM('active','disabled') NOT NULL DEFAULT 'active',
  `is_primary` TINYINT(1) NOT NULL DEFAULT 1,
  `sort_order` INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_from_to` (`from_slug`, `to_slug`),
  KEY `idx_status` (`status`),
  KEY `idx_from_slug` (`from_slug`),
  KEY `idx_to_slug` (`to_slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 2. Admins & Authentication
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `admins` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL DEFAULT 'Admin',
  `username` VARCHAR(64) NULL DEFAULT NULL,
  `email` VARCHAR(191) NULL DEFAULT NULL,
  `password` VARCHAR(255) NOT NULL,
  `role` VARCHAR(32) NOT NULL DEFAULT 'admin',
  `password_must_change` TINYINT(1) NOT NULL DEFAULT 0,
  `temporary_password_set_at` DATETIME NULL DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
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
-- 3. Customers & Bookings
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
  `responded_by` VARCHAR(255) NULL,
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
-- 4. Enquiries (Leads Pipeline)
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
  `responded_by` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_enquiries_booking_id` (`booking_id`),
  KEY `idx_status` (`status`),
  KEY `idx_created` (`created_at`),
  KEY `idx_phone` (`phone`),
  KEY `idx_ip` (`ip_address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 5. Blocked IPs Firewall
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
-- 6. Referrals, Coupons, Banners, Reviews
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

-- ---------------------------------------------------------------------------
-- 7. Seed Core Data (Routes & Default Admin Account)
-- ---------------------------------------------------------------------------

-- Seed default admin account (Email: admin@dropcars.in | Username: admin | Password: admin@dc)
INSERT INTO `admins` (`name`, `username`, `email`, `password`, `role`)
VALUES (
  'Admin',
  'admin',
  'admin@dropcars.in',
  '$2y$10$sQIDgmTW9xhEg/Mru/t87.Pt5zTOlgPgpdydK7A65lYFIBIC56ksC',
  'admin'
) ON DUPLICATE KEY UPDATE `password` = VALUES(`password`);

-- Seed standard routes
INSERT INTO `routes` (from_slug, to_slug, from_city, to_city, distance_km, travel_time, highway, is_primary, sort_order) VALUES
('chennai', 'bangalore', 'Chennai', 'Bangalore', 350, '6-7 hours', 'NH 48', 1, 1),
('chennai', 'tiruvannamalai', 'Chennai', 'Tiruvannamalai', 220, '4-5 hours', 'NH 32', 1, 2),
('chennai', 'madurai', 'Chennai', 'Madurai', 460, '8-9 hours', 'NH 44', 1, 3),
('chennai', 'trichy', 'Chennai', 'Trichy', 340, '6-7 hours', 'NH 32', 1, 4),
('chennai', 'pondicherry', 'Chennai', 'Pondicherry', 165, '3-4 hours', 'ECR', 1, 5),
('chennai', 'vellore', 'Chennai', 'Vellore', 145, '2.5-3.5 hours', 'NH 48', 1, 6),
('chennai', 'tirupati', 'Chennai', 'Tirupati', 135, '2.5-3.5 hours', 'NH 48', 1, 7),
('bangalore', 'chennai', 'Bangalore', 'Chennai', 350, '6-7 hours', 'NH 48', 1, 10),
('bangalore', 'tiruvannamalai', 'Bangalore', 'Tiruvannamalai', 200, '4-5 hours', NULL, 1, 11),
('trichy', 'chennai', 'Trichy', 'Chennai', 340, '6-7 hours', 'NH 32', 1, 20),
('trichy', 'tiruvannamalai', 'Trichy', 'Tiruvannamalai', 180, '3-4 hours', NULL, 1, 21)
ON DUPLICATE KEY UPDATE distance_km=VALUES(distance_km), travel_time=VALUES(travel_time);

SET FOREIGN_KEY_CHECKS = 1;
