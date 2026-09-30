<?php
/**
 * Temporary Admin Tool - Creates the initial admin account
 * Use this only if you cannot log in. DELETE THIS FILE after use!
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/auth.php';

$email = 'admin@dropcars.in';
$username = 'admin';
$pass = 'admin@dc';
$name = 'Admin';

// 1. Ensure all tables exist (based on hostinger-schema.sql)
$pdo->exec("SET FOREIGN_KEY_CHECKS = 0;");

$tables = [
    "admins" => "CREATE TABLE IF NOT EXISTS `admins` (
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      `name` VARCHAR(255) NOT NULL DEFAULT 'Admin',
      `username` VARCHAR(255) NULL DEFAULT 'admin',
      `email` VARCHAR(255) NOT NULL,
      `password` VARCHAR(255) NOT NULL,
      `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      UNIQUE KEY `email` (`email`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

    "customers" => "CREATE TABLE IF NOT EXISTS `customers` (
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      `name` VARCHAR(255) NOT NULL DEFAULT 'Guest',
      `phone` VARCHAR(64) NOT NULL,
      `is_verified` TINYINT(1) NOT NULL DEFAULT 0,
      `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      UNIQUE KEY `uq_phone` (`phone`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

    "bookings" => "CREATE TABLE IF NOT EXISTS `bookings` (
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
      `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      UNIQUE KEY `uq_booking_id` (`booking_id`),
      KEY `idx_customer` (`customer_id`),
      KEY `idx_status` (`status`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

    "enquiries" => "CREATE TABLE IF NOT EXISTS `enquiries` (
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      `booking_id` VARCHAR(64) NULL DEFAULT NULL,
      `name` VARCHAR(255) NOT NULL,
      `phone` VARCHAR(50) NOT NULL,
      `pickup` VARCHAR(500) NOT NULL,
      `drop_location` VARCHAR(500) NOT NULL,
      `travel_date` DATE NULL,
      `ip_address` VARCHAR(45) NULL,
      `status` ENUM('confirmed','not_confirmed','fake') NOT NULL DEFAULT 'not_confirmed',
      `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      UNIQUE KEY `uq_enquiries_booking_id` (`booking_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",
    
    "coupon_usages" => "CREATE TABLE IF NOT EXISTS `coupon_usages` (
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      `coupon_id` INT UNSIGNED NOT NULL,
      `customer_id` INT UNSIGNED NOT NULL,
      `booking_id` INT UNSIGNED NOT NULL,
      `discount_amount` DECIMAL(10,2) NOT NULL,
      `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

    "password_resets" => "CREATE TABLE IF NOT EXISTS `password_resets` (
      `email` VARCHAR(255) NOT NULL,
      `token` VARCHAR(255) NOT NULL,
      `expires_at` DATETIME NOT NULL,
      PRIMARY KEY (`email`),
      KEY `idx_token` (`token`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;"
];

foreach ($tables as $tableName => $sql) {
    $pdo->exec($sql);
}
$pdo->exec("SET FOREIGN_KEY_CHECKS = 1;");

// 2. Idempotent admin bootstrap — runs ONCE per fresh install.
//
// SECURITY: This page used to reset the admin password to a known value
// every time it was loaded, which is why the old README told you to
// delete the file after use. We now refuse to touch an existing admin
// account, so the file is safe to leave on the server forever:
//
//   • If the admins table is empty             → create the seed account
//   • If an admin (any admin) already exists   → do NOTHING destructive,
//                                                 just show a friendly
//                                                 "already initialized"
//                                                 message and link to login.
//
// To re-bootstrap from scratch (you've forgotten the password and want
// to reset everything), DELETE the row in the `admins` table from
// phpMyAdmin / MySQL CLI, then reload this page.

$adminExistsCount = (int) $pdo->query("SELECT COUNT(*) FROM `admins`")->fetchColumn();

if ($adminExistsCount > 0) {
    // Already initialized — refuse to overwrite. Don't leak whether THIS
    // particular email exists; just say "already set up".
    $alreadyInitialized = true;
    $msg = 'An admin account already exists. This page will not modify or reset existing accounts. '
         . '<br><br>If you forgot your password, use <a href="forgot-password" style="color:#1e40af;font-weight:800;">Forgot Password</a> '
         . 'or reset directly in the database.';
    // Audit: log every attempt to re-run the bootstrap so abuse leaves a trail
    if (function_exists('error_log')) {
        $ip = $_SERVER['REMOTE_ADDR'] ?? '?';
        $ua = $_SERVER['HTTP_USER_AGENT'] ?? '?';
        error_log("[tct] init-admin attempted re-run by IP={$ip} UA=" . substr($ua, 0, 120));
    }
} else {
    // Fresh install — safe to seed the first admin
    $alreadyInitialized = false;
    $hash = password_hash($pass, PASSWORD_DEFAULT);
    $pdo->prepare("INSERT INTO admins (name, username, email, password) VALUES (?, ?, ?, ?)")->execute([$name, $username, $email, $hash]);
    $msg = 'All tables verified and the first admin account was created successfully.'
         . '<br><br>Username: <strong>' . htmlspecialchars($username) . '</strong>'
         . '<br>Email: <strong>' . htmlspecialchars($email) . '</strong>'
         . '<br>Password: <strong>' . htmlspecialchars($pass) . '</strong>'
         . '<br><br><span style="color:#b91c1c;">Please change this password immediately after your first login.</span>';
}

?>
<!--
    init-admin.php only outputs the CONTENT here; layout-auth.php wraps it
    with the standard admin auth shell (TCT header, no sidebar). Earlier
    versions of this file emitted their own full <html> document, which
    double-nested inside the admin layout and broke the page on mobile.
-->
<?php
    // UI varies slightly depending on whether this is the first-ever
    // bootstrap or a re-visit after the admin already exists.
    $iconColor      = $alreadyInitialized ? '#3b82f6' : '#27ae60';
    $iconBg         = $alreadyInitialized ? 'rgba(59,130,246,0.10)' : 'rgba(39,174,96,0.12)';
    $iconClass      = $alreadyInitialized ? 'fa-circle-info'        : 'fa-circle-check';
    $cardHeading    = $alreadyInitialized ? 'Already Initialized'   : 'Admin Initialized!';
    $headingColor   = $alreadyInitialized ? '#1e40af'               : '#27ae60';
?>
<div class="init-admin-card" style="max-width: 480px; margin: 0 auto; padding: 2rem 1.5rem; text-align: center;">
    <div style="width: 56px; height: 56px; margin: 0 auto 1.25rem; background: <?php echo $iconBg; ?>; color: <?php echo $iconColor; ?>; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">
        <i class="fa-solid <?php echo $iconClass; ?>"></i>
    </div>
    <h1 style="color: <?php echo $headingColor; ?>; margin: 0 0 1rem; font-size: 1.4rem; font-weight: 800;"><?php echo htmlspecialchars($cardHeading); ?></h1>
    <p style="font-size: 0.92rem; color: #475569; line-height: 1.55; margin: 0 0 1.5rem;"><?php echo $msg; ?></p>
    <a href="login" class="btn btn-primary" style="display: inline-block; background: #f7b733; color: #2c3e50; padding: 0.65rem 1.6rem; border-radius: 10px; text-decoration: none; font-weight: 800; font-size: 0.95rem;">Proceed to Login</a>
    <?php if (!$alreadyInitialized): ?>
        <p style="color: #475569; margin: 1.5rem 0 0; font-size: 0.78rem; line-height: 1.4;">
            <i class="fa-solid fa-shield-halved" style="color:#16a34a;"></i>
            This page is <strong>safe to keep on the server</strong> — it will refuse to modify your admin account from now on.
        </p>
    <?php endif; ?>
</div>
