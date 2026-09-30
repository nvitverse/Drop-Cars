<?php
/**
 * Global PHP Error & Exception Handler - Drop Cars
 * Catches fatal errors, uncaught exceptions, syntax typos, and sends alerts to admin.
 */

if (!function_exists('dropcars_global_exception_handler')) {

    function dropcars_global_exception_handler($exception) {
        dropcars_report_php_error(
            'uncaught_exception',
            $exception->getMessage(),
            $exception->getFile(),
            $exception->getLine(),
            $exception->getTraceAsString()
        );
    }

    function dropcars_global_error_handler($errno, $errstr, $errfile, $errline) {
        // Ignore suppressed errors (with @ operator)
        if (!(error_reporting() & $errno)) {
            return false;
        }

        // Only report critical PHP warnings/errors
        $criticalErrors = [
            E_ERROR             => 'PHP Fatal Error',
            E_PARSE             => 'PHP Parse Error (Syntax typo)',
            E_CORE_ERROR        => 'PHP Core Error',
            E_COMPILE_ERROR     => 'PHP Compile Error',
            E_USER_ERROR        => 'PHP User Error',
            E_RECOVERABLE_ERROR => 'PHP Catchable Fatal Error',
            E_WARNING           => 'PHP Warning',
            E_COMPILE_WARNING   => 'PHP Compile Warning'
        ];

        if (array_key_exists($errno, $criticalErrors)) {
            dropcars_report_php_error(
                'php_runtime_error',
                $criticalErrors[$errno] . ': ' . $errstr,
                $errfile,
                $errline
            );
        }

        return false; // let normal error handler run
    }

    function dropcars_global_shutdown_handler() {
        $error = error_get_last();
        if ($error !== null) {
            $fatalTypes = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR];
            if (in_array($error['type'], $fatalTypes, true)) {
                dropcars_report_php_error(
                    'php_fatal_shutdown',
                    'Fatal Error: ' . $error['message'],
                    $error['file'],
                    $error['line']
                );
            }
        }
    }

    function dropcars_get_php_error_description($type, $message, $file, $line) {
        $msgLower = strtolower($message);
        $typeLower = strtolower($type);

        if ($typeLower === 'ssl_expiry_warning') {
            return "The website's SSL security certificate is expiring soon. A renewal is required immediately to prevent browsers from showing security block screens to visitors.";
        }

        if (strpos($msgLower, 'undefined variable') !== false) {
            return "The website tried to read a variable that has not been initialized or defined yet. This is a minor programming warning and usually doesn't stop the website from working, but should be fixed to keep the code clean.";
        }
        
        if (strpos($msgLower, 'undefined array key') !== false || strpos($msgLower, 'undefined index') !== false) {
            return "The code tried to read an item from a list or settings configuration that doesn't exist. This usually means a settings configuration is missing or misspelled in your admin panel.";
        }

        if (strpos($msgLower, 'sqlstate') !== false || strpos($msgLower, 'pdoexception') !== false || strpos($msgLower, 'connection failed') !== false || strpos($msgLower, 'gone away') !== false) {
            return "The website failed to talk to your database server. This happens if the MySQL database is offline/restarting, or if the database username/password settings in your database.local.php file are incorrect.";
        }

        if (strpos($msgLower, 'parse error') !== false || strpos($msgLower, 'syntax error') !== false) {
            return "There is a syntax typo in the PHP code (like a missing semicolon, quote, or bracket). The server cannot run the code, causing that page to crash. You must revert the last code edit to fix this.";
        }

        if (strpos($msgLower, 'division by zero') !== false) {
            return "The code attempted to divide a number by zero. This usually happens in pricing or distance calculations if a route or city distance is incorrectly set to zero.";
        }

        if (strpos($msgLower, 'maximum execution time') !== false) {
            return "The script took too long to run (usually over 30 seconds) and was cut off by the server. This happens during slow operations, like syncing with Google Sheets when their server is slow to respond.";
        }

        if (strpos($msgLower, 'permission denied') !== false || strpos($msgLower, 'failed to open stream') !== false) {
            return "The website was blocked from reading or writing a file. This is a hosting permissions issue. Make sure your server's folder permissions allow writing to directories like 'tmp' and 'logs'.";
        }

        if (strpos($msgLower, 'call to undefined function') !== false || strpos($msgLower, 'call to undefined method') !== false) {
            return "The code tried to use a function or library that doesn't exist or hasn't been loaded. This happens if a file is missing or if files were not fully uploaded during deployment.";
        }

        return "A server-side PHP warning or error was encountered during execution. While the site may remain online, this issue should be investigated.";
    }

    function dropcars_report_php_error($type, $message, $file, $line, $stack = '') {
        $root = dirname(__DIR__);
        $configPath = $root . '/api/config.php';
        $config = is_file($configPath) ? require $configPath : [];

        // Cooldown logic to prevent email/Telegram flood (5 min cooldown)
        $cooldownFile = $root . '/tmp/error-cooldown.json';
        if (!is_dir(dirname($cooldownFile))) {
            @mkdir(dirname($cooldownFile), 0777, true);
        }

        $now = time();
        $cooldownDuration = 300;
        // signature of the error (file + line + error message type)
        $errorSignature = md5($type . ':' . $file . ':' . $line);

        $cooldownData = [];
        if (is_file($cooldownFile)) {
            $cooldownData = json_decode(@file_get_contents($cooldownFile), true) ?: [];
        }

        // Clean up expired
        foreach ($cooldownData as $sig => $timestamp) {
            if ($now - $timestamp > $cooldownDuration) {
                unset($cooldownData[$sig]);
            }
        }

        if (isset($cooldownData[$errorSignature]) && ($now - $cooldownData[$errorSignature] < $cooldownDuration)) {
            return; // throttled
        }

        $cooldownData[$errorSignature] = $now;
        @file_put_contents($cooldownFile, json_encode($cooldownData));

        // Format error details
        $requestedUrl = isset($_SERVER['HTTP_HOST']) ? ($_SERVER['HTTP_HOST'] . $_SERVER['REQUEST_URI']) : 'CLI / Cron';
        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown';
        
        // Check if the agent is a known bot/crawler to avoid notification spam
        $isBot = false;
        $botKeywords = [
            'googlebot', 'bingbot', 'yandexbot', 'applebot', 'baidu', 'duckduckbot', 'slurp', 'sogou', 
            'exabot', 'facebookexternalhit', 'ia_archiver', 'bot', 'crawler', 'spider', 'scraper',
            'googleother', 'google-other', 'google', 'lighthouse', 'mediapartners', 'adsbot', 'preview',
            'http', 'curl', 'wget', 'python', 'node', 'axios', 'postman'
        ];
        $uaLower = strtolower($userAgent);
        foreach ($botKeywords as $keyword) {
            if (strpos($uaLower, $keyword) !== false) {
                $isBot = true;
                break;
            }
        }
        
        $details = [
            'file' => $file,
            'line' => $line,
            'url' => $requestedUrl,
            'user_agent' => $userAgent,
            'stack_trace' => $stack
        ];
        $detailsStr = json_encode($details, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

        // Save to local telemetry log (limit to latest 100 items)
        $telemetryFile = $root . '/tmp/telemetry-log.json';
        $logData = [
            'timestamp'   => $now,
            'type'        => $type,
            'message'     => $message,
            'file'        => basename($file),
            'full_file'   => $file,
            'line'        => $line,
            'url'         => $requestedUrl,
            'user_agent'  => $userAgent,
            'stack_trace' => $stack
        ];
        $logs = [];
        if (is_file($telemetryFile)) {
            $logs = json_decode(@file_get_contents($telemetryFile), true) ?: [];
        }
        array_unshift($logs, $logData);
        $logs = array_slice($logs, 0, 100);
        @file_put_contents($telemetryFile, json_encode($logs, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

        $explanation = dropcars_get_php_error_description($type, $message, $file, $line);

        // Determine if this PHP issue is critical enough to warrant an email/Telegram alert
        $typeLower = strtolower($type);
        $msgLower  = strtolower($message);
        
        $isCriticalAlert = (
            $typeLower === 'uncaught_exception' ||
            $typeLower === 'php_fatal_shutdown' ||
            $typeLower === 'ssl_expiry_warning' ||
            strpos($msgLower, 'fatal error') !== false ||
            strpos($msgLower, 'parse error') !== false ||
            strpos($msgLower, 'syntax error') !== false ||
            strpos($msgLower, 'sqlstate') !== false ||
            strpos($msgLower, 'pdoexception') !== false ||
            strpos($msgLower, 'connection failed') !== false
        );

        if (!$isCriticalAlert) {
            return; // Quietly recorded in telemetry log without emailing operator
        }

        // 1. Send Telegram Alert
        $telegramEnabled = $config['enableTelegramNotifications_Admin'] ?? true;
        if ($telegramEnabled && !$isBot) {
            $telegramHelper = $root . '/helpers/telegram.php';
            if (is_file($telegramHelper)) {
                require_once $telegramHelper;
                if (function_exists('sendTelegramMessage')) {
                    $tgMessage = "<b>⚠️ Drop Cars PHP Error Alert</b>\n\n";
                    $tgMessage .= "<b>Explanation:</b> " . htmlspecialchars($explanation, ENT_QUOTES, 'UTF-8') . "\n\n";
                    $tgMessage .= "<b>Type:</b> " . htmlspecialchars($type, ENT_QUOTES, 'UTF-8') . "\n";
                    $tgMessage .= "<b>Message:</b> " . htmlspecialchars($message, ENT_QUOTES, 'UTF-8') . "\n";
                    $tgMessage .= "<b>File:</b> " . htmlspecialchars($file, ENT_QUOTES, 'UTF-8') . "\n";
                    $tgMessage .= "<b>Line:</b> {$line}\n";
                    $tgMessage .= "<b>URL:</b> " . htmlspecialchars($requestedUrl, ENT_QUOTES, 'UTF-8') . "\n";
                    sendTelegramMessage($tgMessage);
                }
            }
        }

        // 2. Send Email Alert (SMTP)
        $smtpHelper = $root . '/api/smtp-settings.php';
        if (is_file($smtpHelper) && !$isBot) {
            require_once $smtpHelper;
            if (function_exists('dropcars_resolve_smtp') && function_exists('dropcars_send_mail_with_fallback')) {
                $smtp = dropcars_resolve_smtp($config);
                $mailTo = 'dropcarsbookings@gmail.com';
                $subject = "[PHP Critical Error] {$type} in " . basename($file);


                $htmlBody = "
                <div style='font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.6;'>
                    <h2 style='color: #b42318; border-bottom: 2px solid #b42318; padding-bottom: 8px;'>⚠️ Drop Cars PHP Error Alert</h2>
                    <p>A server-side PHP error was encountered.</p>
                    
                    <div style='background: #fff8f8; border-left: 4px solid #d93f3f; padding: 12px; margin: 15px 0; border-radius: 4px;'>
                        <strong style='color: #b42318; font-size: 1.05em;'>What's Wrong:</strong><br>
                        <span style='color: #2d3748; font-weight: 500;'>{$explanation}</span>
                    </div>

                    <table style='width: 100%; border-collapse: collapse; margin-top: 15px;'>
                        <tr style='background: #f9fafb;'><th style='text-align: left; padding: 8px; border: 1px solid #ddd; width: 120px;'>Type</th><td style='padding: 8px; border: 1px solid #ddd;'><strong>{$type}</strong></td></tr>
                        <tr><th style='text-align: left; padding: 8px; border: 1px solid #ddd;'>Message</th><td style='padding: 8px; border: 1px solid #ddd; color: #b42318;'><strong>" . htmlspecialchars($message, ENT_QUOTES, 'UTF-8') . "</strong></td></tr>
                        <tr style='background: #f9fafb;'><th style='text-align: left; padding: 8px; border: 1px solid #ddd;'>File</th><td style='padding: 8px; border: 1px solid #ddd;'><code>" . htmlspecialchars($file, ENT_QUOTES, 'UTF-8') . "</code></td></tr>
                        <tr><th style='text-align: left; padding: 8px; border: 1px solid #ddd;'>Line</th><td style='padding: 8px; border: 1px solid #ddd;'><strong>{$line}</strong></td></tr>
                        <tr style='background: #f9fafb;'><th style='text-align: left; padding: 8px; border: 1px solid #ddd;'>Request URL</th><td style='padding: 8px; border: 1px solid #ddd;'>" . htmlspecialchars($requestedUrl, ENT_QUOTES, 'UTF-8') . "</td></tr>
                        <tr><th style='text-align: left; padding: 8px; border: 1px solid #ddd;'>User Agent</th><td style='padding: 8px; border: 1px solid #ddd; font-size: 0.9em;'>" . htmlspecialchars($userAgent, ENT_QUOTES, 'UTF-8') . "</td></tr>
                    </table>";

                if ($stack !== '') {
                    $htmlBody .= "<h3>Stack Trace</h3><pre style='background: #f4f5f6; padding: 12px; border-radius: 4px; border: 1px solid #e4e7ec; overflow-x: auto; font-family: Courier, monospace; font-size: 0.85em;'>" . htmlspecialchars($stack, ENT_QUOTES, 'UTF-8') . "</pre>";
                }

                $htmlBody .= "</div>";
                
                $plainBody = "PHP Error Alert\nWhat's Wrong: {$explanation}\n\nType: {$type}\nMessage: {$message}\nFile: {$file}\nLine: {$line}\nURL: {$requestedUrl}\n";

                $phpmailerDir = $root . '/api/phpmailer/src';
                dropcars_send_mail_with_fallback($smtp, $phpmailerDir, $mailTo, $subject, $htmlBody, $plainBody);
            }
        }
    }

    // SSL Warning Check
    function dropcars_daily_ssl_warning_check() {
        $root = dirname(__DIR__);
        $checkFile = $root . '/tmp/ssl-last-check.json';
        $now = time();
        
        $lastCheck = 0;
        if (is_file($checkFile)) {
            $data = json_decode(@file_get_contents($checkFile), true);
            $lastCheck = (int)($data['last_check'] ?? 0);
        }
        
        // Only run once every 24 hours
        if ($now - $lastCheck < 86400) {
            return;
        }
        
        // Save current timestamp
        @file_put_contents($checkFile, json_encode(['last_check' => $now]));
        
        // Determine host to verify
        $host = $_SERVER['HTTP_HOST'] ?? '';
        if ($host === '' || in_array(strtolower($host), ['localhost', '127.0.0.1', '::1'], true) || strpos($host, '.localhost') !== false) {
            return; // skip on local dev environment
        }
        
        // Strip port if present
        $parts = explode(':', $host);
        $domain = $parts[0];
        
        // Run SSL expiry check
        $expiryTime = dropcars_verify_ssl_expiry($domain);
        if ($expiryTime !== false) {
            $daysLeft = (int)ceil(($expiryTime - $now) / 86400);
            if ($daysLeft <= 7) {
                dropcars_report_php_error(
                    'ssl_expiry_warning',
                    "Warning: The SSL certificate for {$domain} is expiring in {$daysLeft} days! (Expires on " . date('Y-m-d H:i:s', $expiryTime) . ")",
                    __FILE__,
                    __LINE__
                );
            }
        }
    }

    function dropcars_verify_ssl_expiry($domain) {
        try {
            $g = stream_context_create([
                "ssl" => [
                    "capture_peer_cert" => true,
                    "verify_peer" => false,
                    "verify_peer_name" => false
                ]
            ]);
            $r = @stream_socket_client("ssl://{$domain}:443", $errno, $errstr, 10, STREAM_CLIENT_CONNECT, $g);
            if ($r) {
                $cont = stream_context_get_params($r);
                if (isset($cont["options"]["ssl"]["peer_certificate"])) {
                    $cert = openssl_x509_parse($cont["options"]["ssl"]["peer_certificate"]);
                    return (int)($cert['validTo_time_t'] ?? 0);
                }
            }
        } catch (Throwable $t) {
            // Ignore socket errors in passive daily checks
        }
        return false;
    }

    // Register handlers globally
    set_exception_handler('dropcars_global_exception_handler');
    set_error_handler('dropcars_global_error_handler');
    register_shutdown_function('dropcars_global_shutdown_handler');
    
    // Run the SSL check passively
    dropcars_daily_ssl_warning_check();
}
