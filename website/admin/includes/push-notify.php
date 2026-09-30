<?php
/**
 * Admin App push notifications - a new enquiry landing on the website
 * should alert staff on their phone, same as the existing email/Telegram
 * alerts. Tokens are Expo push tokens registered by the Admin App itself
 * (see api/admin-app-enquiries.php's register_push_token action) and sent
 * via Expo's push API directly - no Firebase/OneSignal account needed,
 * consistent with this codebase's free/cheap-channel-first mandate.
 */

if (!function_exists('dropcars_ensure_admin_push_tokens_table')) {
    function dropcars_ensure_admin_push_tokens_table(PDO $pdo): void
    {
        static $ensured = false;
        if ($ensured) {
            return;
        }
        $pdo->exec("CREATE TABLE IF NOT EXISTS `admin_push_tokens` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `token` VARCHAR(255) NOT NULL UNIQUE,
            `device_label` VARCHAR(120) NULL,
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `last_seen_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $ensured = true;
    }
}

if (!function_exists('dropcars_register_admin_push_token')) {
    function dropcars_register_admin_push_token(PDO $pdo, string $token, string $deviceLabel = ''): void
    {
        if ($token === '') {
            return;
        }
        dropcars_ensure_admin_push_tokens_table($pdo);
        $pdo->prepare("INSERT INTO `admin_push_tokens` (`token`, `device_label`) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE `device_label` = VALUES(`device_label`), `last_seen_at` = CURRENT_TIMESTAMP")
            ->execute([$token, $deviceLabel]);
    }
}

if (!function_exists('dropcars_send_admin_push_notification')) {
    /**
     * Fire-and-forget push to every registered Admin App device. Best-effort
     * - a failed/expired token is silently dropped (Expo's receipt API would
     * be needed to prune dead tokens proactively; not worth the extra round
     * trip for a low-volume internal alert like this one).
     */
    function dropcars_send_admin_push_notification(PDO $pdo, string $title, string $body, array $data = []): void
    {
        try {
            dropcars_ensure_admin_push_tokens_table($pdo);
            $tokens = $pdo->query("SELECT `token` FROM `admin_push_tokens`")->fetchAll(PDO::FETCH_COLUMN);
            if (empty($tokens)) {
                return;
            }

            $messages = array_map(static function ($token) use ($title, $body, $data) {
                return [
                    'to' => $token,
                    'title' => $title,
                    'body' => $body,
                    'sound' => 'default',
                    'data' => $data,
                ];
            }, $tokens);

            $ch = curl_init('https://exp.host/--/api/v2/push/send');
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 8,
                CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
                CURLOPT_POSTFIELDS => json_encode($messages),
            ]);
            curl_exec($ch);
            curl_close($ch);
        } catch (Throwable $e) {
            error_log('Drop Cars admin push notification failed (non-fatal): ' . $e->getMessage());
        }
    }
}
