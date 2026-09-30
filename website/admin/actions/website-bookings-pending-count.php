<?php
/**
 * Lightweight passthrough for the in-panel approvals siren (see
 * assets/js/pending-bookings-siren.js). Polled every ~25s from every admin
 * page - kept separate from the full pending-list call so a slow/unreachable
 * backend never blocks page loads, only this background poll.
 */
require_once __DIR__ . '/../includes/session.php';
require_once __DIR__ . '/../../api/includes/backend-client.php';

header('Content-Type: application/json');

if (empty($_SESSION['admin_id'])) {
    echo json_encode(['count' => 0]);
    exit;
}

$result = dropcars_backend_request('GET', '/api/website/bookings/pending');
$count = ($result['ok'] && is_array($result['data'])) ? count($result['data']) : 0;

echo json_encode(['count' => $count]);
