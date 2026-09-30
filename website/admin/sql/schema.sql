-- Drop Cars Admin Panel - Database Schema
-- 1. Create database in Hostinger/phpMyAdmin (e.g. dropcars_admin)
-- 2. Select the database, then run the rest of this file

-- CREATE DATABASE IF NOT EXISTS dropcars_admin;
-- USE dropcars_admin;

-- Admins table
CREATE TABLE IF NOT EXISTS admins (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enquiries table
CREATE TABLE IF NOT EXISTS enquiries (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    pickup VARCHAR(500) NOT NULL,
    drop_location VARCHAR(500) NOT NULL,
    travel_date DATE,
    ip_address VARCHAR(45),
    status ENUM('confirmed', 'not_confirmed', 'fake') DEFAULT 'not_confirmed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_created (created_at),
    INDEX idx_phone (phone),
    INDEX idx_ip (ip_address)
);

-- Blocked IPs table
CREATE TABLE IF NOT EXISTS blocked_ips (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ip_address VARCHAR(45) NOT NULL UNIQUE,
    reason VARCHAR(255) DEFAULT 'Marked as fake',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ip (ip_address)
);

-- Run admin/install.php after schema to create default admin (admin@dropcars.in / DropCars@2025)
