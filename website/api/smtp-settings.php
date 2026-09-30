<?php
/**
 * Drop Cars – Multi-Account Segmented SMTP resolution + multi-attempt pool failover.
 *
 * Resolution order for credentials:
 *   1. Specific segment (leads, customer, driver) from config['smtp_pool']['segments']
 *   2. GMAIL_SMTP_USER env / GMAIL_USER env → config mailFrom → fallbackSmtpUser
 *   3. GMAIL_APP_PASSWORD env → GMAIL_APP_PASSWORD const → config → fallbackAppPassword
 *
 * Send attempts (dropcars_send_mail_with_fallback):
 *   1. Primary/Segment SMTP port 587 TLS
 *   2. Primary/Segment SMTP port 465 SSL
 *   3. Fallback pool accounts from config['smtp_pool']['fallback_pool'] (TLS/SSL)
 *   4. Hostinger SMTP port 465 SSL (if hostingerSmtpUser + hostingerSmtpPass set)
 */

if (!function_exists('dropcars_resolve_smtp')) {
    /**
     * Resolve SMTP credentials from env/config, optionally for a specific segment.
     *
     * @return array{mailFrom:string, mailTo:string, mailFromName:string, appPassword:string,
     *               smtpUser:string, hostingerSmtpUser:string, hostingerSmtpPass:string}
     */
    function dropcars_resolve_smtp(array $config, bool $isExampleConfig = false, string $segment = 'general'): array
    {
        $fallbackSmtpUser    = trim((string) ($config['fallbackSmtpUser']    ?? 'dropcars.in@gmail.com'));
        $fallbackAppPassword = trim((string) ($config['fallbackAppPassword'] ?? ''));

        // Check if a dedicated segment exists
        if ($segment !== 'general' && !empty($config['smtp_pool']['segments'][$segment])) {
            $seg = $config['smtp_pool']['segments'][$segment];
            $smtpUser = trim((string)($seg['smtpUser'] ?? ''));
            $appPassword = trim((string)($seg['appPassword'] ?? ''));
            if ($smtpUser !== '' && $appPassword !== '') {
                return [
                    'mailFrom'          => trim((string)($seg['mailFrom'] ?? 'support@dropcars.in')),
                    'mailTo'            => $config['mailTo'] ?? 'dropcarsbookings@gmail.com',
                    'mailFromName'      => trim((string)($seg['mailFromName'] ?? 'Drop Cars')),
                    'appPassword'       => str_replace(' ', '', $appPassword),
                    'smtpUser'          => $smtpUser,
                    'hostingerSmtpUser' => trim((string) ($config['hostingerSmtpUser'] ?? '')),
                    'hostingerSmtpPass' => trim((string) ($config['hostingerSmtpPass'] ?? '')),
                ];
            }
        }

        $configuredMailFrom = $isExampleConfig ? '' : trim((string) ($config['mailFrom'] ?? ''));
        $envMailFrom        = trim((string) (getenv('GMAIL_SMTP_USER') ?: getenv('GMAIL_USER') ?: ''));

        $mailFrom     = $envMailFrom !== '' ? $envMailFrom : ($configuredMailFrom !== '' ? $configuredMailFrom : $fallbackSmtpUser);
        $mailTo       = $config['mailTo']       ?? 'dropcarsbookings@gmail.com';
        $mailFromName = $config['mailFromName'] ?? 'Drop Cars';

        // App password resolution
        $configuredAppPassword = $isExampleConfig ? '' : trim((string) ($config['gmailAppPassword'] ?? ''));
        $appPassword = trim((string) (getenv('GMAIL_APP_PASSWORD') ?: ''));
        if ($appPassword === '' && defined('GMAIL_APP_PASSWORD') && (string) GMAIL_APP_PASSWORD !== '') {
            $appPassword = trim((string) GMAIL_APP_PASSWORD);
        }
        if ($appPassword === '' && $configuredAppPassword !== '') {
            $appPassword = $configuredAppPassword;
        }
        // Strip spaces (App Passwords are sometimes pasted with spaces)
        if ($appPassword !== '' && strpos($appPassword, ' ') !== false) {
            $appPassword = str_replace(' ', '', $appPassword);
        }
        if ($appPassword === '' && fallbackAppPassword !== '') {
            $appPassword = str_replace(' ', '', $fallbackAppPassword);
            if ($envMailFrom === '' && $configuredMailFrom === '') {
                $mailFrom = $fallbackSmtpUser;
            }
        }

        $smtpUser = trim((string) ($config['smtpUsername'] ?? getenv('SMTP_USERNAME') ?: ''));
        if ($smtpUser === '') {
            $smtpUser = $mailFrom;
        }

        // Optional Hostinger SMTP credentials (fallback when Gmail SMTP ports are blocked)
        $hostingerSmtpUser = trim((string) ($config['hostingerSmtpUser'] ?? getenv('HOSTINGER_SMTP_USER') ?: ''));
        $hostingerSmtpPass = trim((string) ($config['hostingerSmtpPass'] ?? getenv('HOSTINGER_SMTP_PASS') ?: ''));

        return [
            'mailFrom'          => $mailFrom,
            'mailTo'            => $mailTo,
            'mailFromName'      => $mailFromName,
            'appPassword'       => $appPassword,
            'smtpUser'          => $smtpUser,
            'hostingerSmtpUser' => $hostingerSmtpUser,
            'hostingerSmtpPass' => $hostingerSmtpPass,
        ];
    }
}

if (!function_exists('dropcars_phpmailer_apply_smtp')) {
    /**
     * Apply From/credentials to an already-configured PHPMailer instance.
     *
     * @param object $mail  A PHPMailer\PHPMailer\PHPMailer instance
     * @param array  $smtp  Output of dropcars_resolve_smtp()
     */
    function dropcars_phpmailer_apply_smtp($mail, array $smtp): void
    {
        $mail->Username = $smtp['smtpUser'];
        $mail->Password = $smtp['appPassword'];
        if (strcasecmp($smtp['smtpUser'], $smtp['mailFrom']) !== 0) {
            $mail->setFrom($smtp['smtpUser'], $smtp['mailFromName']);
            $mail->addReplyTo($smtp['mailFrom'], $smtp['mailFromName']);
        } else {
            $mail->setFrom($smtp['mailFrom'], $smtp['mailFromName']);
        }
        $mail->SMTPOptions = [
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false,
                'allow_self_signed' => true
            ]
        ];
    }
}

if (!function_exists('dropcars_send_mail_with_fallback')) {
    /**
     * Send one email, trying Primary/Segment SMTP (587→465), then Fallback Pool accounts, then Hostinger SMTP.
     *
     * @param array  $smtp           Output of dropcars_resolve_smtp()
     * @param string $phpmailerDir   Absolute path to directory containing PHPMailer.php
     * @param string $toAddress      Recipient email address
     * @param string $subject        Email subject
     * @param string $htmlBody       HTML body
     * @param string $plainBody      Plain-text alternative body
     * @param array  $extraHeaders   Associative array of custom headers to add
     * @param array  $config         Optional full configuration array to access smtp_pool
     * @return array{ok: bool, error: string, account_used?: string}
     */
    function dropcars_send_mail_with_fallback(
        array  $smtp,
        string $phpmailerDir,
        string $toAddress,
        string $subject,
        string $htmlBody,
        string $plainBody,
        array  $extraHeaders = [],
        array  $config = []
    ): array {
        if (!is_file($phpmailerDir . '/PHPMailer.php')) {
            return ['ok' => false, 'error' => 'PHPMailer not found at: ' . $phpmailerDir];
        }
        require_once $phpmailerDir . '/Exception.php';
        require_once $phpmailerDir . '/PHPMailer.php';
        require_once $phpmailerDir . '/SMTP.php';

        $errors = [];

        /** @param \PHPMailer\PHPMailer\PHPMailer $m */
        $applyCommon = function ($m) use ($toAddress, $subject, $htmlBody, $plainBody, $extraHeaders): void {
            $m->addAddress($toAddress);
            $m->CharSet  = 'UTF-8';
            $m->Subject  = $subject;
            $m->Body     = $htmlBody;
            $m->AltBody  = $plainBody;
            $m->isHTML(true);
            foreach ($extraHeaders as $hName => $hVal) {
                if (strcasecmp((string)$hName, 'Message-ID') === 0) {
                    $m->MessageID = (string)$hVal;
                } else {
                    $m->addCustomHeader((string) $hName, (string) $hVal);
                }
            }
        };

        // ── Attempt 1 & 2: Primary / Resolved Segment Account (587 TLS → 465 SSL) ──
        if (!empty($smtp['appPassword']) && !empty($smtp['smtpUser'])) {
            try {
                $m = new \PHPMailer\PHPMailer\PHPMailer(true);
                $m->isSMTP();
                $m->Host       = 'smtp.gmail.com';
                $m->SMTPAuth   = true;
                $m->SMTPSecure = 'tls';
                $m->Port       = 587;
                $m->Timeout    = 8;
                dropcars_phpmailer_apply_smtp($m, $smtp);
                $applyCommon($m);
                $m->send();
                return ['ok' => true, 'error' => '', 'account_used' => $smtp['smtpUser'] . ' (587 TLS)'];
            } catch (\Exception $e) {
                $errors[] = 'Primary:587 (' . $smtp['smtpUser'] . '): ' . $e->getMessage();
            }

            try {
                $m2 = new \PHPMailer\PHPMailer\PHPMailer(true);
                $m2->isSMTP();
                $m2->Host       = 'smtp.gmail.com';
                $m2->SMTPAuth   = true;
                $m2->SMTPSecure = 'ssl';
                $m2->Port       = 465;
                $m2->Timeout    = 8;
                dropcars_phpmailer_apply_smtp($m2, $smtp);
                $applyCommon($m2);
                $m2->send();
                return ['ok' => true, 'error' => '', 'account_used' => $smtp['smtpUser'] . ' (465 SSL)'];
            } catch (\Exception $e2) {
                $errors[] = 'Primary:465 (' . $smtp['smtpUser'] . '): ' . $e2->getMessage();
            }
        }

        // ── Attempt 3: Iterate through Fallback Pool Accounts ─────────────────────
        if (!empty($config['smtp_pool']['fallback_pool']) && is_array($config['smtp_pool']['fallback_pool'])) {
            foreach ($config['smtp_pool']['fallback_pool'] as $idx => $fallbackAcc) {
                $fbUser = trim((string)($fallbackAcc['smtpUser'] ?? ''));
                $fbPass = str_replace(' ', '', trim((string)($fallbackAcc['appPassword'] ?? '')));
                if ($fbUser === '' || $fbPass === '' || $fbUser === $smtp['smtpUser']) {
                    continue; // Skip invalid or already attempted identical primary
                }

                $fbHost   = $fallbackAcc['host'] ?? 'smtp.gmail.com';
                $fbPort   = (int)($fallbackAcc['port'] ?? 587);
                $fbSecure = $fallbackAcc['secure'] ?? 'tls';
                $fbFrom   = $fallbackAcc['mailFrom'] ?? $smtp['mailFrom'];
                $fbName   = $fallbackAcc['mailFromName'] ?? $smtp['mailFromName'];

                try {
                    $mPool = new \PHPMailer\PHPMailer\PHPMailer(true);
                    $mPool->isSMTP();
                    $mPool->Host       = $fbHost;
                    $mPool->SMTPAuth   = true;
                    $mPool->SMTPSecure = $fbSecure;
                    $mPool->Port       = $fbPort;
                    $mPool->Timeout    = 8;
                    $mPool->Username   = $fbUser;
                    $mPool->Password   = $fbPass;
                    $mPool->setFrom($fbUser, $fbName);
                    $mPool->addReplyTo($fbFrom, $fbName);
                    $mPool->SMTPOptions = [
                        'ssl' => ['verify_peer' => false, 'verify_peer_name' => false, 'allow_self_signed' => true]
                    ];
                    $applyCommon($mPool);
                    $mPool->send();
                    return ['ok' => true, 'error' => '', 'account_used' => "Pool[{$idx}]: {$fbUser} ({$fbPort})"];
                } catch (\Exception $ePool) {
                    $errors[] = "Pool[{$idx}]: {$fbUser} - " . $ePool->getMessage();
                }
            }
        }

        // ── Attempt 4: Hostinger SMTP (if configured) ─────────────────────────────
        if (!empty($smtp['hostingerSmtpUser']) && !empty($smtp['hostingerSmtpPass'])) {
            try {
                $m3 = new \PHPMailer\PHPMailer\PHPMailer(true);
                $m3->isSMTP();
                $m3->Host       = 'smtp.hostinger.com';
                $m3->SMTPAuth   = true;
                $m3->SMTPSecure = 'ssl';
                $m3->Port       = 465;
                $m3->Timeout    = 10;
                $m3->Username   = $smtp['hostingerSmtpUser'];
                $m3->Password   = $smtp['hostingerSmtpPass'];
                $m3->setFrom($smtp['hostingerSmtpUser'], $smtp['mailFromName']);
                $m3->addReplyTo($smtp['mailFrom'], $smtp['mailFromName']);
                $m3->SMTPOptions = [
                    'ssl' => ['verify_peer' => false, 'verify_peer_name' => false, 'allow_self_signed' => true]
                ];
                $applyCommon($m3);
                $m3->send();
                return ['ok' => true, 'error' => '', 'account_used' => 'Hostinger: ' . $smtp['hostingerSmtpUser']];
            } catch (\Exception $e3) {
                $errors[] = 'Hostinger:465: ' . $e3->getMessage();
            }
        }

        $combinedError = implode(' | ', $errors);
        error_log('Drop Cars SMTP all pool attempts failed — ' . $combinedError);

        // Notify via Telegram that all email accounts failed
        $tgHelper = dirname(__DIR__) . '/helpers/telegram.php';
        if (is_file($tgHelper)) {
            require_once $tgHelper;
            if (function_exists('sendTelegramMessage')) {
                $tgWarning = "<b>⚠️ Email Delivery System Failure!</b>\n\n";
                $tgWarning .= "<b>SMTP Error:</b> " . htmlspecialchars($combinedError, ENT_QUOTES, 'UTF-8') . "\n";
                $tgWarning .= "<b>Subject:</b> " . htmlspecialchars($subject, ENT_QUOTES, 'UTF-8') . "\n";
                $tgWarning .= "<b>To:</b> " . htmlspecialchars($toAddress, ENT_QUOTES, 'UTF-8') . "\n";
                sendTelegramMessage($tgWarning);
            }
        }

        return ['ok' => false, 'error' => $combinedError];
    }
}
