-- Drop Cars - Production Schema
-- Run this on Hostinger MySQL (phpMyAdmin or CLI)

CREATE DATABASE IF NOT EXISTS dropcars_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE dropcars_db;

-- Routes table (DB-driven, no static JSON)
CREATE TABLE IF NOT EXISTS routes (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    from_slug VARCHAR(64) NOT NULL,
    to_slug VARCHAR(64) NOT NULL,
    from_city VARCHAR(128) NOT NULL,
    to_city VARCHAR(128) NOT NULL,
    distance_km INT UNSIGNED NOT NULL DEFAULT 0,
    travel_time VARCHAR(32) DEFAULT NULL,
    highway VARCHAR(64) DEFAULT NULL,
    status ENUM('active','disabled') NOT NULL DEFAULT 'active',
    is_primary TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_from_to (from_slug, to_slug),
    KEY idx_status (status),
    KEY idx_from_slug (from_slug),
    KEY idx_to_slug (to_slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cities table (optional, for validation)
CREATE TABLE IF NOT EXISTS cities (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(64) NOT NULL UNIQUE,
    city VARCHAR(128) NOT NULL,
    status ENUM('active','disabled') NOT NULL DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Admin users (for control panel)
CREATE TABLE IF NOT EXISTS admin_users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sample routes (migrate from existing routes.json)
INSERT INTO routes (from_slug, to_slug, from_city, to_city, distance_km, travel_time, highway, is_primary, sort_order) VALUES
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
