<?php
/**
 * Core Helper Functions - Drop Cars
 * SECURE: Loaded only from backend. No business logic exposed to frontend.
 */

defined('DROP_CARS_SAFE') || die('Direct access not permitted');

/**
 * Sanitize city slug for URL/DB use
 */
function dc_sanitize_slug(string $input): string {
    $slug = strtolower(trim($input));
    $slug = preg_replace('/[^a-z0-9\-]/', '', $slug);
    return $slug ?: '';
}

/**
 * Validate route params (from, to)
 */
function dc_validate_route_params(string $from, string $to): bool {
    $from = dc_sanitize_slug($from);
    $to = dc_sanitize_slug($to);
    return strlen($from) >= 2 && strlen($to) >= 2 && $from !== $to;
}

/**
 * Escape output for HTML
 */
function dc_esc(string $s): string {
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
}

/**
 * JSON response helper
 */
function dc_json_response(array $data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: private, max-age=60');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
}
