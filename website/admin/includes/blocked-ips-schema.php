<?php
/**
 * Ensures blocked_ips matches the automation schema (source_type, source_id, blocked_at).
 */

if (!function_exists('dropcars_ensure_blocked_ips_schema')) {
    function dropcars_ensure_blocked_ips_schema(PDO $pdo): void
    {
        static $done = false;
        if ($done) {
            return;
        }
        $done = true;

        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `blocked_ips` (
                  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
                  `ip_address` VARCHAR(45) NOT NULL,
                  `reason` VARCHAR(255) NULL DEFAULT 'spam',
                  `source_type` ENUM('booking','enquiry') NULL DEFAULT 'booking',
                  `source_id` INT UNSIGNED NOT NULL DEFAULT 0,
                  `blocked_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                  PRIMARY KEY (`id`),
                  UNIQUE KEY `uq_ip` (`ip_address`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
        } catch (Throwable $e) {
            // Table may already exist with different shape
        }

        $cols = $pdo->query("SHOW COLUMNS FROM `blocked_ips`")->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('source_type', $cols, true)) {
            try {
                $pdo->exec("ALTER TABLE `blocked_ips` ADD COLUMN `source_type` ENUM('booking','enquiry') NOT NULL DEFAULT 'booking' AFTER `reason`");
            } catch (Throwable $e) {
            }
        }
        if (!in_array('source_id', $cols, true)) {
            try {
                $pdo->exec("ALTER TABLE `blocked_ips` ADD COLUMN `source_id` INT UNSIGNED NOT NULL DEFAULT 0 AFTER `source_type`");
            } catch (Throwable $e) {
            }
        }
        if (!in_array('blocked_at', $cols, true)) {
            try {
                $pdo->exec("ALTER TABLE `blocked_ips` ADD COLUMN `blocked_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP AFTER `source_id`");
            } catch (Throwable $e) {
            }
        }
        $idx = $pdo->query("SHOW INDEX FROM `blocked_ips` WHERE `Key_name` = 'uq_ip'")->fetch();
        if (!$idx) {
            try {
                $pdo->exec('ALTER TABLE `blocked_ips` ADD UNIQUE KEY `uq_ip` (`ip_address`)');
            } catch (Throwable $e) {
            }
        }
    }
}

if (!function_exists('dropcars_admin_block_spam_ip')) {
    /**
     * Upsert blocked IP when marking booking/enquiry as fake/spam.
     */
    function dropcars_admin_block_spam_ip(PDO $pdo, string $ip, string $reason, string $sourceType, int $sourceId): void
    {
        $ip = trim($ip);
        if ($ip === '' || !filter_var($ip, FILTER_VALIDATE_IP)) {
            return;
        }
        dropcars_ensure_blocked_ips_schema($pdo);
        try {
            $stmt = $pdo->prepare("
                INSERT INTO `blocked_ips` (`ip_address`, `reason`, `source_type`, `source_id`, `blocked_at`)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON DUPLICATE KEY UPDATE
                    `reason` = VALUES(`reason`),
                    `source_type` = VALUES(`source_type`),
                    `source_id` = VALUES(`source_id`),
                    `blocked_at` = CURRENT_TIMESTAMP
            ");
            $stmt->execute([$ip, $reason, $sourceType, $sourceId]);
        } catch (Throwable $e) {
            error_log('dropcars_admin_block_spam_ip: ' . $e->getMessage());
        }
    }
}
