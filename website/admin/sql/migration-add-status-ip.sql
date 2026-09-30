-- Migration: Add status and ip_address to enquiries
-- Run this if you have an existing enquiries table without these columns.
-- If columns already exist, you may get "Duplicate column" errors - safe to ignore.

ALTER TABLE enquiries 
ADD COLUMN status ENUM('not_confirmed','confirmed','fake') DEFAULT 'not_confirmed',
ADD COLUMN ip_address VARCHAR(45);

-- Create blocked_ips if not exists
CREATE TABLE IF NOT EXISTS blocked_ips (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ip_address VARCHAR(45),
    reason VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
