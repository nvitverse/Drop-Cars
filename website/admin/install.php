<?php
/**
 * One-time setup: Create default admin
 * Run once after importing schema.sql
 * Default: admin@dropcars.in / DropCars@2025
 */

require_once __DIR__ . '/config/database.php';

$email = 'admin@dropcars.in';
$password = 'DropCars@2025';
$hash = password_hash($password, PASSWORD_DEFAULT);

$stmt = $pdo->prepare("INSERT INTO admins (email, password) VALUES (?, ?) ON DUPLICATE KEY UPDATE password = VALUES(password)");
$stmt->execute([$email, $hash]);

echo "Default admin created/updated.\n";
echo "Email: {$email}\n";
echo "Password: {$password}\n";
echo "Change password after first login!\n";
