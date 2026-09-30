-- Create first admin user (run once after schema.sql)
-- 1. Generate hash: php -r "echo password_hash('YourSecurePassword', PASSWORD_DEFAULT);"
-- 2. Replace YOUR_HASH below with the output

INSERT INTO admin_users (username, password_hash) VALUES
('admin', 'YOUR_HASH')
ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash);
