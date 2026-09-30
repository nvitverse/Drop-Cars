<?php
/**
 * Admin App (React Native) mirror of the website's Enquiry Management
 * admin page (admin/pages/enquiries.php). Same data, same actions, same
 * underlying SQL/helper functions - just JSON in/out with a static API
 * key instead of a PHP session, so the separate mobile Admin App can call
 * it directly.
 *
 * Auth: header `X-Admin-App-Key` must match ADMIN_APP_API_KEY
 * (config/env.php). This is a trusted first-party client, not a public
 * endpoint - never expose this key outside the Admin App's own config.
 *
 * GET  ?tab=not_responded|responded&website=<slug|all>&search=&page=1
 *      -> { success, tab, counts, total_count, page, total_pages, enquiries: [...] }
 * POST { action, id, ...params }
 *      actions: mark_touched, save_note, save_followup, save_stage,
 *               save_dispatcher, customize_booking, confirm, fake, waiting,
 *               delete (needs confirmed:true)
 *      -> { success, message }
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Admin-App-Key');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../config/env.php';
require_once __DIR__ . '/../admin/config/database.php'; // $pdo / $GLOBALS['db']
require_once __DIR__ . '/../admin/includes/enquiries-schema.php';
require_once __DIR__ . '/../admin/includes/google-sheets-status-sync.php';
require_once __DIR__ . '/../admin/includes/functions.php';
require_once __DIR__ . '/booking-persist.php';
require_once __DIR__ . '/includes/backend-client.php';
require_once __DIR__ . '/../admin/includes/push-notify.php';

$pdo = $GLOBALS['db'] ?? null;
if (!$pdo) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database unavailable']);
    exit;
}

$providedKey = $_SERVER['HTTP_X_ADMIN_APP_KEY'] ?? '';
if (!defined('ADMIN_APP_API_KEY') || ADMIN_APP_API_KEY === '' || !hash_equals((string) ADMIN_APP_API_KEY, (string) $providedKey)) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Invalid or missing admin app key']);
    exit;
}

dropcars_ensure_enquiries_columns($pdo);

function admin_app_enquiry_row_out(array $row): array
{
    // Trim to what the mobile UI actually needs - avoids shipping every
    // internal column (fare_breakdown JSON blobs, ip_address, etc.) over
    // the wire for a list view.
    return [
        'id' => (int) $row['id'],
        'booking_id' => $row['booking_id'] ?? null,
        'name' => $row['name'] ?? null,
        'phone' => $row['phone'] ?? null,
        'pickup' => $row['pickup'] ?? null,
        'drop_location' => $row['drop_location'] ?? null,
        'trip_type' => $row['trip_type'] ?? null,
        'vehicle_type' => $row['vehicle_type'] ?? null,
        'travel_date' => $row['travel_date'] ?? null,
        'travel_time' => $row['travel_time'] ?? null,
        'fare_estimate' => isset($row['fare_estimate']) ? (int) $row['fare_estimate'] : null,
        'extra_charges' => isset($row['extra_charges']) ? (int) $row['extra_charges'] : null,
        'cost_per_km' => isset($row['cost_per_km']) ? (int) $row['cost_per_km'] : null,
        'extra_cost_per_km' => isset($row['extra_cost_per_km']) ? (int) $row['extra_cost_per_km'] : null,
        'status' => $row['status'] ?? null,
        'booking_status' => $row['booking_status'] ?? null,
        'website' => $row['website'] ?? null,
        'source' => $row['source'] ?? null,
        'dispatcher_notes' => $row['dispatcher_notes'] ?? null,
        'assigned_dispatcher' => $row['assigned_dispatcher'] ?? null,
        'followup_time' => $row['followup_time'] ?? null,
        'lead_stage' => $row['lead_stage'] ?? null,
        'is_touched' => !empty($row['is_touched']),
        'include_gst' => !empty($row['include_gst']),
        'gst_percent' => isset($row['gst_percent']) ? (float) $row['gst_percent'] : 5.0,
        'gst_amount' => isset($row['gst_amount']) ? (float) $row['gst_amount'] : 0.0,
        'created_at' => $row['created_at'] ?? null,
    ];
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $tab = ($_GET['tab'] ?? 'not_responded') === 'responded' ? 'responded' : 'not_responded';
        $website = trim((string) ($_GET['website'] ?? 'all'));
        $search = trim((string) ($_GET['search'] ?? ''));
        // Only meaningful on the Responded tab (lead_stage is set by the
        // 'save_stage' action, which also sets is_touched=1) - narrows
        // WHICH responded leads are shown, e.g. "still awaiting customer
        // confirmation" vs "confirmed shortly". Doesn't affect the
        // not_responded/responded badge counts below, only the filtered
        // list + its own total_count/total_pages.
        $stage = trim((string) ($_GET['stage'] ?? ''));
        $page = max(1, (int) ($_GET['page'] ?? 1));
        $limit = 30;
        $offset = ($page - 1) * $limit;

        // Verify if website column exists before adding e.website to WHERE clause.
        // IMPORTANT: do NOT set $hasWebsiteCol = true until we *confirm* the column
        // actually exists - a failed ALTER TABLE (caught silently) must not leave us
        // building a WHERE that references a non-existent column.
        $hasWebsiteCol = false;
        try {
            $enqCols = $pdo->query("SHOW COLUMNS FROM `enquiries`")->fetchAll(PDO::FETCH_COLUMN);
            if (in_array('website', $enqCols)) {
                $hasWebsiteCol = true;
            } else {
                // Try to add the column; re-check afterwards to confirm success
                try {
                    $pdo->exec("ALTER TABLE `enquiries` ADD COLUMN `website` VARCHAR(64) NULL DEFAULT 'dropcars.in'");
                } catch (Throwable $alterEx) {}
                // Re-verify: only mark as existing if it's actually there now
                $enqCols2 = $pdo->query("SHOW COLUMNS FROM `enquiries`")->fetchAll(PDO::FETCH_COLUMN);
                $hasWebsiteCol = in_array('website', $enqCols2);
            }
        } catch (Throwable $e) {
            $hasWebsiteCol = false;
        }

        $siteCond = '1=1';
        if ($hasWebsiteCol && $website !== '' && $website !== 'all') {
            if ($website === 'dropcars.in' || $website === 'dropcars') {
                $siteCond = "(e.`website` = 'dropcars.in' OR e.`website` = 'dropcars' OR e.`website` IS NULL OR e.`website` = '')";
            } else {
                $cleanSite = preg_replace('/^www\./i', '', strtolower($website));
                $slugSite = str_replace(['.in', '.com', '-'], '', $cleanSite);
                $qRaw = $pdo->quote($website);
                $qClean = $pdo->quote($cleanSite);
                $qSlug = $pdo->quote($slugSite);
                $siteCond = "(e.`website` = $qRaw OR e.`website` = $qClean OR e.`website` = $qSlug OR e.`website` LIKE " . $pdo->quote('%' . $cleanSite . '%') . ")";
            }
        }

        $searchCond = '1=1';
        $searchParams = [];
        if ($search !== '') {
            $searchCond = "(e.name LIKE ? OR e.phone LIKE ? OR e.pickup LIKE ? OR e.drop_location LIKE ? OR e.booking_id LIKE ?)";
            $searchParams = ["%$search%", "%$search%", "%$search%", "%$search%", "%$search%"];
        }

        // Same tab predicates as admin/pages/enquiries.php - kept in sync
        // deliberately so "not responded" / "responded" mean the same
        // thing in both places.
        $unrespondedWhere = "e.status NOT IN ('confirmed', 'fake')
          AND (b.status IS NULL OR b.status NOT IN ('confirmed', 'completed', 'cancelled', 'fake'))
          AND e.is_touched = 0
          AND (e.dispatcher_notes IS NULL OR e.dispatcher_notes = '')
          AND (e.assigned_dispatcher IS NULL OR e.assigned_dispatcher = '')
          AND e.followup_time IS NULL
          AND $siteCond AND $searchCond";

        $respondedWhere = "e.status != 'fake'
          AND (b.status IS NULL OR b.status != 'fake')
          AND (
            e.is_touched = 1
            OR (e.dispatcher_notes IS NOT NULL AND e.dispatcher_notes != '')
            OR (e.assigned_dispatcher IS NOT NULL AND e.assigned_dispatcher != '')
            OR e.followup_time IS NOT NULL
            OR e.status = 'confirmed'
            OR b.status = 'confirmed'
          )
          AND $siteCond AND $searchCond";

        $unrespondedStmt = $pdo->prepare("SELECT COUNT(*) FROM `enquiries` e LEFT JOIN `bookings` b ON e.booking_id = b.booking_id WHERE $unrespondedWhere");
        $unrespondedStmt->execute($searchParams);
        $unrespondedCount = (int) $unrespondedStmt->fetchColumn();

        $respondedStmt = $pdo->prepare("SELECT COUNT(*) FROM `enquiries` e LEFT JOIN `bookings` b ON e.booking_id = b.booking_id WHERE $respondedWhere");
        $respondedStmt->execute($searchParams);
        $respondedCount = (int) $respondedStmt->fetchColumn();

        $currentWhere = ($tab === 'responded') ? $respondedWhere : $unrespondedWhere;
        $listParams = $searchParams;
        if ($stage !== '') {
            $currentWhere .= " AND e.lead_stage = ?";
            $listParams[] = $stage;
        }

        // Badge counts (top-level `counts`) stay unfiltered by stage - only
        // the list + its own pagination narrow down. Recompute total_count
        // for THIS list's WHERE (not just reuse unrespondedCount/
        // respondedCount) since a stage filter makes it a different,
        // smaller set.
        if ($stage !== '') {
            $filteredCountStmt = $pdo->prepare("SELECT COUNT(*) FROM `enquiries` e LEFT JOIN `bookings` b ON e.booking_id = b.booking_id WHERE $currentWhere");
            $filteredCountStmt->execute($listParams);
            $totalCount = (int) $filteredCountStmt->fetchColumn();
        } else {
            $totalCount = ($tab === 'responded') ? $respondedCount : $unrespondedCount;
        }
        $totalPages = max(1, (int) ceil($totalCount / $limit));

        $sqlList = "SELECT e.*, b.status AS booking_status
        FROM `enquiries` e
        LEFT JOIN `bookings` b ON e.booking_id = b.booking_id
        WHERE $currentWhere
        ORDER BY e.created_at DESC
        LIMIT $limit OFFSET $offset";

        $stmt = $pdo->prepare($sqlList);
        $stmt->execute($listParams);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'success' => true,
            'tab' => $tab,
            'counts' => ['not_responded' => $unrespondedCount, 'responded' => $respondedCount],
            'total_count' => $totalCount,
            'page' => $page,
            'total_pages' => $totalPages,
            'enquiries' => array_map('admin_app_enquiry_row_out', $rows),
        ]);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to load enquiries: ' . $e->getMessage()]);
    }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $action = trim((string) ($input['action'] ?? ''));
    $id = (int) ($input['id'] ?? 0);

    if ($id <= 0 && $action !== '' && $action !== 'register_push_token' && $action !== 'bulk_mark_old_responded') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Missing id']);
        exit;
    }

    try {
        switch ($action) {
            // One-time cleanup (2026-09-04): the Admin App's connection to
            // this endpoint was broken in production until today, so a
            // real backlog of historical leads sat as "not responded"
            // the whole time - not because staff ignored them, but
            // because the app could never see them. Bulk-clears exactly
            // that backlog (same is_touched=1 the single mark_touched
            // action uses) so it stops cluttering the Not Responded tab
            // and the new alert popup (which now only fires for leads
            // created after each device's own install-time cutoff - see
            // EnquiryAlarmHost.tsx). Scoped by `before` (ISO 8601) so it
            // can never touch a lead that arrives after this cleanup.
            case 'bulk_mark_old_responded':
                $beforeRaw = trim((string) ($input['before'] ?? ''));
                if ($beforeRaw === '') {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'Missing before']);
                    break;
                }
                $beforeTs = strtotime($beforeRaw);
                if ($beforeTs === false) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'Invalid before timestamp']);
                    break;
                }
                $beforeMysql = date('Y-m-d H:i:s', $beforeTs);
                $stmt = $pdo->prepare(
                    "UPDATE `enquiries` SET `is_touched` = 1
                     WHERE `is_touched` = 0
                       AND `status` NOT IN ('confirmed', 'fake')
                       AND (`dispatcher_notes` IS NULL OR `dispatcher_notes` = '')
                       AND (`assigned_dispatcher` IS NULL OR `assigned_dispatcher` = '')
                       AND `followup_time` IS NULL
                       AND `created_at` < ?"
                );
                $stmt->execute([$beforeMysql]);
                echo json_encode(['success' => true, 'updated' => $stmt->rowCount(), 'before' => $beforeMysql]);
                break;

            case 'register_push_token':
                $token = trim((string) ($input['token'] ?? ''));
                $deviceLabel = trim((string) ($input['device_label'] ?? ''));
                if ($token === '') {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'Missing token']);
                    break;
                }
                dropcars_register_admin_push_token($pdo, $token, $deviceLabel);
                echo json_encode(['success' => true]);
                break;

            case 'mark_touched':
                $pdo->prepare("UPDATE `enquiries` SET `is_touched` = 1 WHERE `id` = ?")->execute([$id]);
                echo json_encode(['success' => true]);
                break;

            case 'save_note':
                $notes = (string) ($input['notes'] ?? '');
                $pdo->prepare("UPDATE `enquiries` SET `dispatcher_notes` = ?, `is_touched` = 1 WHERE `id` = ?")->execute([$notes, $id]);
                echo json_encode(['success' => true]);
                break;

            case 'save_followup':
                $time = $input['followup_time'] ?? null;
                if (empty($time)) { $time = null; }
                $pdo->prepare("UPDATE `enquiries` SET `followup_time` = ?, `is_touched` = 1 WHERE `id` = ?")->execute([$time, $id]);
                echo json_encode(['success' => true]);
                break;

            case 'save_stage':
                $stage = (string) ($input['stage'] ?? 'new');
                $pdo->prepare("UPDATE `enquiries` SET `lead_stage` = ?, `is_touched` = 1 WHERE `id` = ?")->execute([$stage, $id]);
                echo json_encode(['success' => true]);
                break;

            case 'save_dispatcher':
                $dispatcher = $input['dispatcher'] ?? null;
                if (empty($dispatcher)) { $dispatcher = null; }
                $pdo->prepare("UPDATE `enquiries` SET `assigned_dispatcher` = ?, `is_touched` = 1 WHERE `id` = ?")->execute([$dispatcher, $id]);
                echo json_encode(['success' => true]);
                break;

            // Editable trip particulars for a lead, INCLUDING the
            // driver-facing per-km rate (cost_per_km/extra_cost_per_km) -
            // distinct from fare_estimate/extra_charges, which are the
            // CUSTOMER's price. Was silently 400ing before 2026-09-04 (this
            // action was never implemented despite the Admin App calling
            // it) and had no driver-price concept at all.
            case 'customize_booking':
                $fieldMap = [
                    'pickup' => 'pickup', 'drop_location' => 'drop_location',
                    'trip_type' => 'trip_type', 'vehicle_type' => 'vehicle_type',
                    'travel_date' => 'travel_date', 'travel_time' => 'travel_time',
                    'fare_estimate' => 'fare_estimate', 'extra_charges' => 'extra_charges',
                    'cost_per_km' => 'cost_per_km', 'extra_cost_per_km' => 'extra_cost_per_km',
                    'include_gst' => 'include_gst', 'gst_percent' => 'gst_percent', 'gst_amount' => 'gst_amount',
                ];
                $sets = [];
                $params = [];
                foreach ($fieldMap as $inputKey => $col) {
                    if (array_key_exists($inputKey, $input)) {
                        $sets[] = "`$col` = ?";
                        $params[] = $input[$inputKey];
                    }
                }
                if (array_key_exists('notes', $input)) {
                    $sets[] = "`dispatcher_notes` = ?";
                    $params[] = $input['notes'];
                }
                if (empty($sets)) {
                    echo json_encode(['success' => true, 'message' => 'Nothing to update']);
                    break;
                }
                $sets[] = "`is_touched` = 1";
                $params[] = $id;
                $pdo->prepare("UPDATE `enquiries` SET " . implode(', ', $sets) . " WHERE `id` = ?")->execute($params);

                // Push the driver-price and GST through to the linked
                // CustomerBookingRequest on the FastAPI backend too - if
                // this lead already has one (see send-enquiry.php) it's
                // sitting PENDING there right now, and it's THAT record's
                // admin_cost_per_km/admin_extra_cost_per_km/gst_included that
                // actually reaches the driver and issues the sequential tax
                // invoice once confirmed.
                if (array_key_exists('cost_per_km', $input) || array_key_exists('extra_cost_per_km', $input) || array_key_exists('include_gst', $input) || array_key_exists('gst_amount', $input)) {
                    $rowStmt = $pdo->prepare("SELECT `backend_request_id` FROM `enquiries` WHERE `id` = ?");
                    $rowStmt->execute([$id]);
                    $backendRequestId = $rowStmt->fetchColumn();
                    if ($backendRequestId) {
                        $ratePayload = [];
                        if (array_key_exists('cost_per_km', $input)) $ratePayload['cost_per_km'] = $input['cost_per_km'];
                        if (array_key_exists('extra_cost_per_km', $input)) $ratePayload['extra_cost_per_km'] = $input['extra_cost_per_km'];
                        if (array_key_exists('include_gst', $input)) $ratePayload['gst_included'] = !empty($input['include_gst']);
                        if (array_key_exists('gst_amount', $input)) $ratePayload['gst_amount'] = (float)$input['gst_amount'];

                        $ratesResult = dropcars_backend_request('PATCH', '/website/bookings/' . rawurlencode($backendRequestId) . '/rates', $ratePayload);
                        if (!$ratesResult['ok']) {
                            error_log('Drop Cars admin-app-enquiries customize_booking: backend rate update failed for request ' . $backendRequestId . ': ' . ($ratesResult['error'] ?? json_encode($ratesResult['data'] ?? null)));
                        }
                    }
                }

                echo json_encode(['success' => true]);
                break;

            case 'fake':
                $stmt = $pdo->prepare("SELECT * FROM `enquiries` WHERE `id` = ?");
                $stmt->execute([$id]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$row) {
                    http_response_code(404);
                    echo json_encode(['success' => false, 'message' => 'Enquiry not found']);
                    break;
                }
                $pdo->prepare("UPDATE `enquiries` SET `status` = 'fake', `is_touched` = 1 WHERE `id` = ?")->execute([$id]);
                $full = $pdo->prepare("SELECT * FROM `enquiries` WHERE `id` = ?");
                $full->execute([$id]);
                $rowOut = $full->fetch(PDO::FETCH_ASSOC);
                if ($rowOut) { dropcars_admin_sync_enquiry_status_row($rowOut, 'fake'); }
                echo json_encode(['success' => true]);
                break;

            case 'waiting':
                $stmt = $pdo->prepare("SELECT * FROM `enquiries` WHERE `id` = ?");
                $stmt->execute([$id]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$row) {
                    http_response_code(404);
                    echo json_encode(['success' => false, 'message' => 'Enquiry not found']);
                    break;
                }
                $pdo->prepare("UPDATE `enquiries` SET `status` = 'pending', `is_touched` = 1 WHERE `id` = ?")->execute([$id]);
                dropcars_persist_confirmation_booking(
                    $pdo,
                    [
                        'customerPhone' => $row['phone'] ?? '',
                        'customerEmail' => '',
                        'source' => $row['source'] ?? 'organic',
                        'utmSource' => $row['utm_source'] ?? '',
                        'utmMedium' => $row['utm_medium'] ?? '',
                        'utmCampaign' => $row['utm_campaign'] ?? '',
                        'gclid' => $row['gclid'] ?? '',
                    ],
                    (string) ($row['booking_id'] ?? ''),
                    (string) ($row['name'] ?? 'Guest'),
                    (string) ($row['pickup'] ?? ''),
                    (string) ($row['drop_location'] ?? ''),
                    strtoupper((string) ($row['trip_type'] ?? 'ONE_WAY')),
                    (string) ($row['vehicle_type'] ?? ''),
                    (int) ($row['fare_estimate'] ?? 0),
                    (string) ($row['travel_date'] ?? ''),
                    (string) ($row['travel_time'] ?? ''),
                    (float) ($row['distance_km'] ?? 0),
                    0,
                    null,
                    (string) ($row['duration'] ?? ''),
                    (string) ($row['fare_type'] ?? 'exclusive'),
                    'pending'
                );
                $pdo->prepare("UPDATE `bookings` SET `website` = ? WHERE `booking_id` = ?")->execute([$row['website'] ?? 'dropcars', $row['booking_id']]);
                $full = $pdo->prepare("SELECT * FROM `enquiries` WHERE `id` = ?");
                $full->execute([$id]);
                $rowOut = $full->fetch(PDO::FETCH_ASSOC);
                if ($rowOut) { dropcars_admin_sync_enquiry_status_row($rowOut, 'pending'); }
                echo json_encode(['success' => true]);
                break;

            case 'confirm':
                $stmt = $pdo->prepare("SELECT * FROM `enquiries` WHERE `id` = ?");
                $stmt->execute([$id]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$row) {
                    http_response_code(404);
                    echo json_encode(['success' => false, 'message' => 'Enquiry not found']);
                    break;
                }
                $newBid = dropcars_enquiry_confirmed_booking_id($row['booking_id'] ?? '', $pdo);
                $pdo->prepare("UPDATE `enquiries` SET `status` = 'confirmed', `booking_id` = ?, `is_touched` = 1 WHERE `id` = ?")->execute([$newBid, $id]);
                dropcars_persist_confirmation_booking(
                    $pdo,
                    [
                        'customerPhone' => $row['phone'] ?? '',
                        'customerEmail' => '',
                        'source' => $row['source'] ?? 'organic',
                        'utmSource' => $row['utm_source'] ?? '',
                        'utmMedium' => $row['utm_medium'] ?? '',
                        'utmCampaign' => $row['utm_campaign'] ?? '',
                        'gclid' => $row['gclid'] ?? '',
                    ],
                    (string) $newBid,
                    (string) ($row['name'] ?? 'Guest'),
                    (string) ($row['pickup'] ?? ''),
                    (string) ($row['drop_location'] ?? ''),
                    strtoupper((string) ($row['trip_type'] ?? 'ONE_WAY')),
                    (string) ($row['vehicle_type'] ?? ''),
                    (int) ($row['fare_estimate'] ?? 0),
                    (string) ($row['travel_date'] ?? ''),
                    (string) ($row['travel_time'] ?? ''),
                    (float) ($row['distance_km'] ?? 0),
                    0,
                    null,
                    (string) ($row['duration'] ?? ''),
                    (string) ($row['fare_type'] ?? 'exclusive'),
                    'confirmed'
                );
                $pdo->prepare("UPDATE `bookings` SET `website` = ? WHERE `booking_id` = ?")->execute([$row['website'] ?? 'dropcars', $newBid]);

                // Same fix as admin/pages/enquiries.php's confirm handler:
                // approve the linked backend request so it actually posts to
                // drivers - without this the local MySQL update alone never
                // reaches the driver marketplace.
                if (!empty($row['backend_request_id'])) {
                    $approveResult = dropcars_backend_request('POST', '/website/bookings/' . rawurlencode($row['backend_request_id']) . '/approve');
                    if (!$approveResult['ok']) {
                        error_log('Drop Cars admin-app-enquiries confirm: backend approve failed for request ' . $row['backend_request_id'] . ': ' . ($approveResult['error'] ?? json_encode($approveResult['data'] ?? null)));
                    }
                }

                $full = $pdo->prepare("SELECT * FROM `enquiries` WHERE `id` = ?");
                $full->execute([$id]);
                $rowOut = $full->fetch(PDO::FETCH_ASSOC);
                if ($rowOut) { dropcars_admin_sync_enquiry_status_row($rowOut, 'confirmed'); }
                echo json_encode(['success' => true, 'booking_id' => $newBid]);
                break;

            case 'delete':
                if (empty($input['confirmed'])) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'Deletion requires confirmed:true - this is permanent.']);
                    break;
                }
                $pdo->prepare("DELETE FROM `enquiries` WHERE `id` = ?")->execute([$id]);
                echo json_encode(['success' => true]);
                break;

            default:
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Unknown action']);
        }
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Action failed: ' . $e->getMessage()]);
    }
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'message' => 'Method not allowed']);
