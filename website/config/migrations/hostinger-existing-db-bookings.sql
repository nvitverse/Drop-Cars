-- Run ONLY if you already have `bookings` from an older install without these columns.
-- Select your database in phpMyAdmin, then run. Adjust table prefix if different.

ALTER TABLE `bookings`
  ADD COLUMN `booking_id` VARCHAR(32) NULL AFTER `customer_id`,
  ADD COLUMN `pickup_date` DATE NULL AFTER `drop_location`,
  ADD COLUMN `pickup_time` VARCHAR(32) NULL AFTER `pickup_date`,
  ADD COLUMN `estimated_fare` INT NULL AFTER `base_fare`;

-- Backfill booking_id from id if empty (example); prefer setting real IDs from admin.
UPDATE `bookings` SET `booking_id` = CONCAT('ID', `id`) WHERE `booking_id` IS NULL OR `booking_id` = '';

ALTER TABLE `bookings` MODIFY `booking_id` VARCHAR(32) NOT NULL;
ALTER TABLE `bookings` ADD UNIQUE KEY `uq_booking_id` (`booking_id`);
