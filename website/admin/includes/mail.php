<?php
/**
 * Admin SMTP mail — reuses api/phpmailer + api/smtp-settings.php (same as send-enquiry / confirm_booking).
 *
 * Setup: api/config.php (or env GMAIL_APP_PASSWORD) + Gmail App Password.
 */
defined('DROP_CARS_SAFE') || define('DROP_CARS_SAFE', true);

/**
 * @return array{0: array, 1: array, 2: string} smtp resolved, raw config, api directory
 */
function dropcars_admin_mail_bootstrap(): array
{
    $root = dirname(__DIR__, 2);
    $apiDir = $root . DIRECTORY_SEPARATOR . 'api';
    $configPath = $apiDir . DIRECTORY_SEPARATOR . 'config.php';
    if (!is_file($configPath)) {
        $configPath = $apiDir . DIRECTORY_SEPARATOR . 'config.example.php';
    }
    $config = is_file($configPath) ? (include $configPath) : [];
    $isExample = basename($configPath) === 'config.example.php';
    $envPath = $root . DIRECTORY_SEPARATOR . 'config' . DIRECTORY_SEPARATOR . 'env.php';
    if (is_file($envPath)) {
        require_once $envPath;
    }
    require_once $apiDir . DIRECTORY_SEPARATOR . 'smtp-settings.php';
    $smtp = dropcars_resolve_smtp($config, $isExample);
    return [$smtp, $config, $apiDir];
}

/**
 * Send one HTML email via Gmail SMTP.
 *
 * @return array{ok: bool, error: string}
 */
function dropcars_admin_send_mail(string $to, string $subject, string $htmlBody, string $plainBody, string $sourcePage = ''): array
{
    [$smtp, $config, $apiDir] = dropcars_admin_mail_bootstrap();
    
    // Extract subdomain
    $subdomainSlug = '';
    if ($sourcePage !== '') {
        $parsed = parse_url($sourcePage);
        $host = $parsed['host'] ?? $parsed['path'] ?? $sourcePage;
        $parts = explode('.', $host);
        if (count($parts) >= 2) {
            $firstPart = strtolower($parts[0]);
            if (!in_array($firstPart, ['www', 'localhost', 'admin', 'api', 'dev', 'staging', 'mail'], true)) {
                $subdomainSlug = $firstPart;
            }
        }
    }
    
    // Apply subdomain overrides to SMTP settings if present and enabled
    if ($subdomainSlug !== '' && isset($config['subdomainConfig'][$subdomainSlug])) {
        $subConfig = $config['subdomainConfig'][$subdomainSlug];
        if (!empty($subConfig['enabled'])) {
            if (!empty($subConfig['displayName'])) {
                $smtp['mailFromName'] = trim($subConfig['displayName']);
            }
        }
    }

    // Sanitize and auto-correct email typos before dispatching
    $sanitizerPath = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'helpers' . DIRECTORY_SEPARATOR . 'email-sanitizer.php';
    if (is_file($sanitizerPath)) {
        require_once $sanitizerPath;
        if (function_exists('dropcars_sanitize_and_fix_email')) {
            $sanitized = dropcars_sanitize_and_fix_email($to, true);
            if (!$sanitized['valid']) {
                return ['ok' => false, 'error' => $sanitized['error']];
            }
            $to = $sanitized['email'];
        }
    }

    if ($smtp['appPassword'] === '' && $smtp['hostingerSmtpPass'] === '') {
        return ['ok' => false, 'error' => 'SMTP not configured (set Gmail App Password in api/config.php or config/env.php).'];
    }
    $phpmailerDir = $apiDir . DIRECTORY_SEPARATOR . 'phpmailer' . DIRECTORY_SEPARATOR . 'src';
    return dropcars_send_mail_with_fallback($smtp, $phpmailerDir, $to, $subject, $htmlBody, $plainBody);
}

/**
 * Get enquiry notification mailbox configured in api/smtp-settings.php.
 */
function dropcars_admin_enquiry_mailbox(): string
{
    [$smtp] = dropcars_admin_mail_bootstrap();
    $mailTo = trim((string) ($smtp['mailTo'] ?? ''));
    if ($mailTo !== '') {
        return $mailTo;
    }
    return trim((string) ($smtp['mailFrom'] ?? ''));
}
