<?php
/**
 * Copy to env.php on the server (env.php is gitignored).
 * Maps key is injected site-wide via engine/shell.php → renderScripts().
 * In Google Cloud, enable Maps JavaScript API (booking autocomplete), Distance Matrix (optional),
 * and Maps Embed API (route page iframe directions preview).
 *
 * Optional: set environment variables instead (they override empty defines if you load them yourself).
 * Recommended on shared hosting: paste real values only in env.php on the server.
 */

if (!defined('GOOGLE_MAPS_API_KEY')) {
    define('GOOGLE_MAPS_API_KEY', (string) (getenv('GOOGLE_MAPS_API_KEY') ?: ''));
}
if (!defined('TELEGRAM_BOT_TOKEN')) {
    define('TELEGRAM_BOT_TOKEN', (string) (getenv('TELEGRAM_BOT_TOKEN') ?: ''));
}
if (!defined('TELEGRAM_CHAT_ID')) {
    define('TELEGRAM_CHAT_ID', (string) (getenv('TELEGRAM_CHAT_ID') ?: ''));
}
if (!defined('GMAIL_APP_PASSWORD')) {
    define('GMAIL_APP_PASSWORD', (string) (getenv('GMAIL_APP_PASSWORD') ?: ''));
}
