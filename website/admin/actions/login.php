<?php
/**
 * DEPRECATED / DISABLED admin login handler.
 *
 * This legacy endpoint predates the hardened login flow in
 * admin/pages/login.php (rate limiting, session_token binding, forced
 * password-change checks). It is kept only because deleting files is
 * avoided in this workflow; it no longer authenticates anyone and simply
 * forwards all requests to the real, hardened login handler so this path
 * can't be used to bypass those protections.
 */

header('Content-Type: application/json');
http_response_code(410);
echo json_encode([
    'success' => false,
    'message' => 'This login endpoint has been retired. Please use the main admin login.',
    'redirect' => '../pages/login.php',
]);
exit;
