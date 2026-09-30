<?php
/**
 * Admin Enquiries List Page - Premium Lead Management
 */

if (isset($pdo)) {
    require_once __DIR__ . '/../includes/enquiries-schema.php';
    dropcars_ensure_enquiries_columns($pdo);
}
require_once __DIR__ . '/../includes/google-sheets-status-sync.php';
require_once __DIR__ . '/../includes/blocked-ips-schema.php';
require_once __DIR__ . '/../../api/includes/regular-customer.php';
require_once __DIR__ . '/../includes/functions.php';

// Action: AJAX & Form Posts
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    $id = (int)($_POST['id'] ?? 0);
    $isAjax = (!empty($_SERVER['HTTP_X_REQUESTED_WITH']) && strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) === 'xmlhttprequest') 
              || in_array($action, ['mark_touched', 'save_lead_note', 'save_lead_followup', 'save_lead_stage', 'save_lead_dispatcher']);

    try {
        if ($action === 'mark_touched') {
            $pdo->prepare("UPDATE `enquiries` SET `is_touched` = 1 WHERE `id` = ?")->execute([$id]);
            if ($isAjax) { echo json_encode(['success' => true]); exit; }
        }
        elseif ($action === 'save_lead_note') {
            $notes = $_POST['dispatcher_notes'] ?? '';
            $pdo->prepare("UPDATE `enquiries` SET `dispatcher_notes` = ?, `is_touched` = 1 WHERE `id` = ?")->execute([$notes, $id]);
            if ($isAjax) { echo json_encode(['success' => true]); exit; }
        }
        elseif ($action === 'save_lead_followup') {
            $time = $_POST['followup_time'] ?? null;
            if (empty($time)) $time = null;
            $pdo->prepare("UPDATE `enquiries` SET `followup_time` = ?, `is_touched` = 1 WHERE `id` = ?")->execute([$time, $id]);
            if ($isAjax) { echo json_encode(['success' => true]); exit; }
        }
        elseif ($action === 'save_lead_stage') {
            $stage = $_POST['lead_stage'] ?? 'new';
            $pdo->prepare("UPDATE `enquiries` SET `lead_stage` = ?, `is_touched` = 1 WHERE `id` = ?")->execute([$stage, $id]);
            if ($isAjax) { echo json_encode(['success' => true]); exit; }
        }
        elseif ($action === 'save_lead_dispatcher') {
            $dispatcher = $_POST['assigned_dispatcher'] ?? null;
            if (empty($dispatcher)) $dispatcher = null;
            $pdo->prepare("UPDATE `enquiries` SET `assigned_dispatcher` = ?, `is_touched` = 1 WHERE `id` = ?")->execute([$dispatcher, $id]);
            if ($isAjax) { echo json_encode(['success' => true]); exit; }
        }
        elseif ($action === 'delete_selected') {
            $ids = $_POST['selected_ids'] ?? [];
            if (!empty($ids)) {
                $placeholders = implode(',', array_fill(0, count($ids), '?'));
                $stmt = $pdo->prepare("DELETE FROM `enquiries` WHERE `id` IN ($placeholders)");
                $stmt->execute($ids);
            }
            if ($isAjax) { echo json_encode(['success' => true]); exit; }
        }
        elseif (isset($_POST['bulk_action'])) {
            $bulkAction = $_POST['bulk_action'];
            $ids = $_POST['selected_ids'] ?? [];
            if (!empty($ids)) {
                if ($bulkAction === 'confirm') {
                    require_once __DIR__ . '/../../api/booking-persist.php';
                    require_once __DIR__ . '/../../api/includes/backend-client.php';
                    foreach ($ids as $cid) {
                        $stmt = $pdo->prepare("SELECT * FROM `enquiries` WHERE `id` = ?");
                        $stmt->execute([$cid]);
                        $row = $stmt->fetch(PDO::FETCH_ASSOC);
                        if ($row && $row['status'] !== 'confirmed') {
                            $newBid = dropcars_enquiry_confirmed_booking_id($row['booking_id'] ?? '', $pdo);
                            $pdo->prepare("UPDATE `enquiries` SET `status` = 'confirmed', `booking_id` = ?, `is_touched` = 1 WHERE `id` = ?")
                                ->execute([$newBid, $cid]);

                            dropcars_persist_confirmation_booking(
                                $pdo,
                                [
                                    'customerPhone' => $row['phone'] ?? '',
                                    'customerEmail' => '',
                                    'source'        => $row['source'] ?? 'organic',
                                    'utmSource'     => $row['utm_source'] ?? '',
                                    'utmMedium'     => $row['utm_medium'] ?? '',
                                    'utmCampaign'   => $row['utm_campaign'] ?? '',
                                    'gclid'         => $row['gclid'] ?? '',
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

                            // Propagate website column to the booking
                            $pdo->prepare("UPDATE `bookings` SET `website` = ? WHERE `booking_id` = ?")
                                ->execute([$row['website'] ?? 'dropcars', $newBid]);

                            // Approve or create+approve the linked backend request so it posts to
                            // drivers immediately.
                            if (!empty($row['backend_request_id'])) {
                                $approveResult = dropcars_backend_request('POST', '/api/website/bookings/' . rawurlencode($row['backend_request_id']) . '/approve');
                                if (!$approveResult['ok']) {
                                    error_log('Drop Cars enquiries bulk confirm: backend approve failed for request ' . $row['backend_request_id'] . ': ' . ($approveResult['error'] ?? json_encode($approveResult['data'] ?? null)));
                                }
                            } else {
                                $payload = [
                                    'customer_name'        => $row['name'] ?: 'Guest',
                                    'customer_number'      => $row['phone'] ?: '',
                                    'pickup_drop_location' => [
                                        '0' => $row['pickup'] ?: 'Pickup',
                                        '1' => $row['drop_location'] ?: 'Drop',
                                    ],
                                    'trip_type'       => (strpos(strtolower($row['trip_type'] ?? ''), 'round') !== false) ? 'Round Trip' : 'Oneway',
                                    'car_type'        => !empty($row['vehicle_type']) ? strtoupper($row['vehicle_type']) : 'SEDAN_4_PLUS_1',
                                    'start_date_time' => date('c', strtotime(($row['travel_date'] ?: date('Y-m-d')) . ' ' . ($row['travel_time'] ?: '10:00:00'))),
                                    'is_urgent'       => false,
                                    'is_enquiry'      => false,
                                ];
                                $createRes = dropcars_backend_request('POST', '/api/website/bookings', $payload);
                                if ($createRes['ok'] && isset($createRes['data']['id'])) {
                                    $newBackendId = $createRes['data']['id'];
                                    $pdo->prepare("UPDATE `enquiries` SET `backend_request_id` = ? WHERE `id` = ?")->execute([$newBackendId, $cid]);
                                    $pdo->prepare("UPDATE `bookings` SET `backend_request_id` = ? WHERE `booking_id` = ?")->execute([$newBackendId, $newBid]);
                                    dropcars_backend_request('POST', '/api/website/bookings/' . rawurlencode($newBackendId) . '/approve');
                                }
                            }

                            $full = $pdo->prepare("SELECT * FROM `enquiries` WHERE `id` = ?");
                            $full->execute([$cid]);
                            $rowOut = $full->fetch(PDO::FETCH_ASSOC);
                            if ($rowOut) {
                                dropcars_admin_sync_enquiry_status_row($rowOut, 'confirmed');
                            }
                        }
                    }
                } elseif ($bulkAction === 'cancel') {
                    foreach ($ids as $cid) {
                        $stmt = $pdo->prepare("SELECT `ip_address` FROM `enquiries` WHERE `id` = ?");
                        $stmt->execute([$cid]);
                        $enquiry = $stmt->fetch(PDO::FETCH_ASSOC);
                        if ($enquiry) {
                            $pdo->prepare("UPDATE `enquiries` SET `status` = 'fake', `is_touched` = 1 WHERE `id` = ?")->execute([$cid]);
                            $full = $pdo->prepare("SELECT * FROM `enquiries` WHERE `id` = ?");
                            $full->execute([$cid]);
                            $rowOut = $full->fetch(PDO::FETCH_ASSOC);
                            if ($rowOut) {
                                dropcars_admin_sync_enquiry_status_row($rowOut, 'fake');
                            }
                        }
                    }
                }
            }
            if ($isAjax) { echo json_encode(['success' => true]); exit; }
        }
    } catch (Throwable $e) {
        if ($isAjax) {
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
            exit;
        }
    }

    if (!$isAjax) {
        header('Location: ' . admin_url('enquiries'));
        exit;
    }
}

// Single Action GET Handlers
if (isset($_GET['action']) && isset($_GET['id'])) {
    $id = (int)$_GET['id'];
    $action = $_GET['action'];
    // Delete is destructive and irreversible, so - unlike the other single-
    // action GET handlers below (fake/waiting/etc, which just change status
    // and are easy to undo) - it requires an explicit confirmed=1, only
    // reachable via the confirmation page's own button. A client-side-only
    // confirm() dialog (the old behaviour) doesn't stop a forged cross-site
    // GET request, since that never runs the page's JS at all.
    if ($action === 'delete' && isset($_GET['confirmed'])) {
        $pdo->prepare("DELETE FROM `enquiries` WHERE `id` = ?")->execute([$id]);
        header('Location: ' . admin_url('enquiries', ['msg' => 'deleted']));
        exit;
    } elseif ($action === 'delete') {
        $confirmUrl = admin_url('enquiries', ['action' => 'delete', 'id' => $id, 'confirmed' => 1]);
        $cancelUrl = admin_url('enquiries');
        echo '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Confirm Delete</title></head><body style="font-family:sans-serif;max-width:480px;margin:60px auto;text-align:center;padding:0 20px;">'
            . '<h2 style="color:#b91c1c;">Delete this enquiry?</h2>'
            . '<p style="color:#334155;font-size:15px;">This will permanently delete enquiry #' . $id . '. This cannot be undone.</p>'
            . '<a href="' . htmlspecialchars($confirmUrl) . '" style="display:inline-block;background:#ef4444;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin:8px;">Yes, Delete</a>'
            . '<a href="' . htmlspecialchars($cancelUrl) . '" style="display:inline-block;background:#e2e8f0;color:#1e293b;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin:8px;">Cancel</a>'
            . '</body></html>';
        exit;
    } elseif ($action === 'fake') {
        $stmt = $pdo->prepare("SELECT `ip_address` FROM `enquiries` WHERE `id` = ?");
        $stmt->execute([$id]);
        $enquiry = $stmt->fetch();
        if ($enquiry) {
            $pdo->prepare("UPDATE `enquiries` SET `status` = 'fake', `is_touched` = 1 WHERE `id` = ?")->execute([$id]);
            $full = $pdo->prepare("SELECT * FROM `enquiries` WHERE `id` = ?");
            $full->execute([$id]);
            $rowOut = $full->fetch(PDO::FETCH_ASSOC);
            if ($rowOut) {
                dropcars_admin_sync_enquiry_status_row($rowOut, 'fake');
            }
        }
        header('Location: ' . admin_url('enquiries', ['msg' => 'updated']));
        exit;
    } elseif ($action === 'waiting') {
        $stmt = $pdo->prepare("SELECT * FROM `enquiries` WHERE `id` = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if ($row) {
            $pdo->prepare("UPDATE `enquiries` SET `status` = 'pending', `is_touched` = 1 WHERE `id` = ?")->execute([$id]);
            require_once __DIR__ . '/../../api/booking-persist.php';
            dropcars_persist_confirmation_booking(
                $pdo,
                [
                    'customerPhone' => $row['phone'] ?? '',
                    'customerEmail' => '',
                    'source'        => $row['source'] ?? 'organic',
                    'utmSource'     => $row['utm_source'] ?? '',
                    'utmMedium'     => $row['utm_medium'] ?? '',
                    'utmCampaign'   => $row['utm_campaign'] ?? '',
                    'gclid'         => $row['gclid'] ?? '',
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

            // Propagate website column to the booking
            $pdo->prepare("UPDATE `bookings` SET `website` = ? WHERE `booking_id` = ?")
                ->execute([$row['website'] ?? 'dropcars', $row['booking_id']]);

            $full = $pdo->prepare("SELECT * FROM `enquiries` WHERE `id` = ?");
            $full->execute([$id]);
            $rowOut = $full->fetch(PDO::FETCH_ASSOC);
            if ($rowOut) {
                dropcars_admin_sync_enquiry_status_row($rowOut, 'pending');
            }
        }
        header('Location: ' . admin_url('bookings', ['status' => 'pending', 'msg' => 'marked_waiting']));
        exit;
    } elseif ($action === 'confirm') {
        if ($id <= 0 && !empty($_GET['booking_id'])) {
            $bReq = trim($_GET['booking_id']);
            $stmtBid = $pdo->prepare("SELECT `id` FROM `enquiries` WHERE `booking_id` = ? LIMIT 1");
            $stmtBid->execute([$bReq]);
            $id = (int)$stmtBid->fetchColumn();
        }
        $stmt = $pdo->prepare("SELECT * FROM `enquiries` WHERE `id` = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        if ($row) {
            $newBid = dropcars_enquiry_confirmed_booking_id($row['booking_id'] ?? '', $pdo);
            $pdo->prepare("UPDATE `enquiries` SET `status` = 'confirmed', `booking_id` = ?, `is_touched` = 1 WHERE `id` = ?")->execute([$newBid, $id]);
            require_once __DIR__ . '/../../api/booking-persist.php';
            dropcars_persist_confirmation_booking(
                $pdo,
                [
                    'customerPhone' => $row['phone'] ?? '',
                    'customerEmail' => '',
                    'source'        => $row['source'] ?? 'organic',
                    'utmSource'     => $row['utm_source'] ?? '',
                    'utmMedium'     => $row['utm_medium'] ?? '',
                    'utmCampaign'   => $row['utm_campaign'] ?? '',
                    'gclid'         => $row['gclid'] ?? '',
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

            // Propagate website column to the booking
            $pdo->prepare("UPDATE `bookings` SET `website` = ? WHERE `booking_id` = ?")
                ->execute([$row['website'] ?? 'dropcars', $newBid]);

            // Staff confirming an enquiry here only updated the website's own
            // local `bookings`/`enquiries` tables - it never actually reached
            // the backend, so nothing was posted to drivers. The enquiry's
            // linked CustomerBookingRequest (created with requires_manual_confirm
            // = true at send-enquiry.php time, see backend_request_id) is
            // sitting PENDING in the backend precisely waiting for this
            // explicit confirm - approve it now so it posts to drivers
            // immediately, the same way a normal confirmed booking does.
            $confirmMsg = 'marked_confirmed';
            require_once __DIR__ . '/../../api/includes/backend-client.php';
            if (!empty($row['backend_request_id'])) {
                $approveResult = dropcars_backend_request('POST', '/api/website/bookings/' . rawurlencode($row['backend_request_id']) . '/approve');
                if (!$approveResult['ok']) {
                    error_log('Drop Cars enquiries confirm: backend approve failed for request ' . $row['backend_request_id'] . ': ' . ($approveResult['error'] ?? json_encode($approveResult['data'] ?? null)));
                    $confirmMsg = 'marked_confirmed_backend_failed';
                }
            } else {
                $payload = [
                    'customer_name'        => $row['name'] ?: 'Guest',
                    'customer_number'      => $row['phone'] ?: '',
                    'pickup_drop_location' => [
                        '0' => $row['pickup'] ?: 'Pickup',
                        '1' => $row['drop_location'] ?: 'Drop',
                    ],
                    'trip_type'       => (strpos(strtolower($row['trip_type'] ?? ''), 'round') !== false) ? 'Round Trip' : 'Oneway',
                    'car_type'        => !empty($row['vehicle_type']) ? strtoupper($row['vehicle_type']) : 'SEDAN_4_PLUS_1',
                    'start_date_time' => date('c', strtotime(($row['travel_date'] ?: date('Y-m-d')) . ' ' . ($row['travel_time'] ?: '10:00:00'))),
                    'is_urgent'       => false,
                    'is_enquiry'      => false,
                ];
                $createRes = dropcars_backend_request('POST', '/api/website/bookings', $payload);
                if ($createRes['ok'] && isset($createRes['data']['id'])) {
                    $newBackendId = $createRes['data']['id'];
                    $pdo->prepare("UPDATE `enquiries` SET `backend_request_id` = ? WHERE `id` = ?")->execute([$newBackendId, $id]);
                    $pdo->prepare("UPDATE `bookings` SET `backend_request_id` = ? WHERE `booking_id` = ?")->execute([$newBackendId, $newBid]);
                    dropcars_backend_request('POST', '/api/website/bookings/' . rawurlencode($newBackendId) . '/approve');
                }
            }

            $full = $pdo->prepare("SELECT * FROM `enquiries` WHERE `id` = ?");
            $full->execute([$id]);
            $rowOut = $full->fetch(PDO::FETCH_ASSOC);
            if ($rowOut) {
                dropcars_admin_sync_enquiry_status_row($rowOut, 'confirmed');
            }
        }
        header('Location: ' . admin_url('bookings', ['status' => 'confirmed', 'msg' => $confirmMsg ?? 'marked_confirmed']));
        exit;
    }
}

// Request Filter Handling
$statusFilter       = $_GET['status'] ?? 'not_responded';
$dateFilter         = $_GET['date_filter'] ?? 'all';
$startDate          = $_GET['start_date'] ?? '';
$endDate            = $_GET['end_date'] ?? '';
$dispatcherFilter   = $_GET['dispatcher'] ?? '';
$sortFilter         = $_GET['sort'] ?? 'newest';
$search             = $_GET['search'] ?? '';

if (!in_array($statusFilter, ['not_responded', 'responded'])) {
    $statusFilter = 'not_responded';
}

$allAdminNames = [];
try {
    $allAdminNames = $pdo->query("SELECT DISTINCT name FROM admins ORDER BY id ASC")->fetchAll(PDO::FETCH_COLUMN);
} catch (Throwable $e) {}

// Conditions Builders
$dateCond = '1=1';
if ($dateFilter === 'today') {
    $dateCond = "DATE(e.`created_at`) = CURDATE()";
} elseif ($dateFilter === 'yesterday') {
    $dateCond = "DATE(e.`created_at`) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)";
} elseif ($dateFilter === 'this_week') {
    $dateCond = "YEARWEEK(e.`created_at`, 1) = YEARWEEK(CURDATE(), 1)";
} elseif ($dateFilter === 'this_month') {
    $dateCond = "MONTH(e.`created_at`) = MONTH(CURDATE()) AND YEAR(e.`created_at`) = YEAR(CURDATE())";
} elseif ($dateFilter === 'custom') {
    $cConds = [];
    if ($startDate !== '') { $cConds[] = "DATE(e.`created_at`) >= " . $pdo->quote($startDate); }
    if ($endDate !== '') { $cConds[] = "DATE(e.`created_at`) <= " . $pdo->quote($endDate); }
    if ($cConds) { $dateCond = implode(' AND ', $cConds); }
}

// Multi-Site Context Filter
// Same "confirm the column exists before referencing it" guard as
// api/admin-app-enquiries.php - this file was unconditionally referencing
// e.`website`, which throws "Column not found: 1054" (SQLSTATE[42S22]) on
// any environment where that column hasn't been added to `enquiries` yet.
$activeSite = dropcars_get_active_website();
if ($activeSite !== 'all') {
    $hasWebsiteCol = false;
    try {
        $enqCols = $pdo->query("SHOW COLUMNS FROM `enquiries`")->fetchAll(PDO::FETCH_COLUMN);
        if (in_array('website', $enqCols)) {
            $hasWebsiteCol = true;
        } else {
            try {
                $pdo->exec("ALTER TABLE `enquiries` ADD COLUMN `website` VARCHAR(64) NULL DEFAULT 'dropcars.in'");
            } catch (Throwable $alterEx) {}
            $enqCols2 = $pdo->query("SHOW COLUMNS FROM `enquiries`")->fetchAll(PDO::FETCH_COLUMN);
            $hasWebsiteCol = in_array('website', $enqCols2);
        }
    } catch (Throwable $e) {
        $hasWebsiteCol = false;
    }

    if ($hasWebsiteCol) {
        if ($activeSite === 'dropcars.in' || $activeSite === 'dropcars') {
            $dateCond .= " AND (e.`website` = 'dropcars.in' OR e.`website` = 'dropcars' OR e.`website` IS NULL OR e.`website` = '')";
        } else {
            $cleanSite = preg_replace('/^www\./i', '', strtolower($activeSite));
            $slugSite = str_replace(['.in', '.com', '-'], '', $cleanSite);
            $qRaw = $pdo->quote($activeSite);
            $qClean = $pdo->quote($cleanSite);
            $qSlug = $pdo->quote($slugSite);
            $dateCond .= " AND (e.`website` = $qRaw OR e.`website` = $qClean OR e.`website` = $qSlug OR e.`website` LIKE " . $pdo->quote('%' . $cleanSite . '%') . ")";
        }
    }
}

$staffCond = '1=1';
if ($dispatcherFilter === 'unassigned') {
    $staffCond = "(e.assigned_dispatcher IS NULL OR e.assigned_dispatcher = '')";
} elseif ($dispatcherFilter !== '') {
    $staffCond = "e.assigned_dispatcher = " . $pdo->quote($dispatcherFilter);
}

$searchCond = '1=1';
$searchParams = [];
if ($search !== '') {
    $searchCond = "(e.name LIKE ? OR e.phone LIKE ? OR e.pickup LIKE ? OR e.drop_location LIKE ? OR e.booking_id LIKE ?)";
    $searchParams = ["%$search%", "%$search%", "%$search%", "%$search%", "%$search%"];
}

$unrespondedWhere = "e.status NOT IN ('confirmed', 'fake')
  AND (b.status IS NULL OR b.status NOT IN ('confirmed', 'completed', 'cancelled', 'fake'))
  AND e.is_touched = 0
  AND (e.dispatcher_notes IS NULL OR e.dispatcher_notes = '')
  AND (e.assigned_dispatcher IS NULL OR e.assigned_dispatcher = '')
  AND e.followup_time IS NULL
  AND $dateCond AND $staffCond AND $searchCond";

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
  AND $dateCond AND $staffCond AND $searchCond";

// Execute Tab Count Queries (filtered by search and date)
$unrespondedStmt = $pdo->prepare("SELECT COUNT(*) FROM `enquiries` e LEFT JOIN `bookings` b ON e.booking_id = b.booking_id WHERE $unrespondedWhere");
$unrespondedStmt->execute($searchParams);
$unrespondedCount = (int)$unrespondedStmt->fetchColumn();

$respondedStmt = $pdo->prepare("SELECT COUNT(*) FROM `enquiries` e LEFT JOIN `bookings` b ON e.booking_id = b.booking_id WHERE $respondedWhere");
$respondedStmt->execute($searchParams);
$respondedCount = (int)$respondedStmt->fetchColumn();

// Limits & Pagination
$limit = 30;
$page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
$offset = ($page - 1) * $limit;

$currentWhere = ($statusFilter === 'responded') ? $respondedWhere : $unrespondedWhere;
$totalCount = ($statusFilter === 'responded') ? $respondedCount : $unrespondedCount;
$totalPages = max(1, (int)ceil($totalCount / $limit));

$orderBy = "e.created_at DESC";
if ($sortFilter === 'oldest') {
    $orderBy = "e.created_at ASC";
} elseif ($sortFilter === 'next_first') {
    $orderBy = "CASE WHEN e.followup_time IS NOT NULL AND e.followup_time >= NOW() THEN 1 
                     WHEN e.followup_time IS NOT NULL AND e.followup_time < NOW() THEN 2 
                     ELSE 3 END ASC, 
                e.followup_time ASC, 
                e.created_at DESC";
}

$sqlList = "SELECT e.*, b.status AS booking_status
FROM `enquiries` e
LEFT JOIN `bookings` b ON e.booking_id = b.booking_id
WHERE $currentWhere
ORDER BY $orderBy
LIMIT $limit OFFSET $offset";

$stmt = $pdo->prepare($sqlList);
$stmt->execute($searchParams);
$enquiries = $stmt->fetchAll(PDO::FETCH_ASSOC);

// Autocomplete suggestions mapping
$suggestionsList = [];
try {
    if ($activeSite !== 'all') {
        $stmtAll = $pdo->prepare("SELECT id, name, phone, pickup, drop_location, status FROM `enquiries` WHERE `website` = ? ORDER BY id DESC LIMIT 200");
        $stmtAll->execute([$activeSite]);
    } else {
        $stmtAll = $pdo->prepare("SELECT id, name, phone, pickup, drop_location, status FROM `enquiries` ORDER BY id DESC LIMIT 200");
        $stmtAll->execute();
    }
    $suggestionsList = $stmtAll->fetchAll(PDO::FETCH_ASSOC);
} catch (Throwable $e) {}

$pageMsg = $_GET['msg'] ?? '';
?>

<style>
.leads-header-premium {
    position: relative;
    overflow: hidden;
    background: radial-gradient(circle at top right, rgba(59, 130, 246, 0.05), transparent 400px), radial-gradient(circle at bottom left, rgba(99, 102, 241, 0.03), transparent 400px);
    border: 1px solid #f1f5f9;
    box-shadow: 0 10px 40px rgba(0,0,0,0.02);
    padding: 1.25rem 1.5rem;
    border-radius: 16px;
    margin-bottom: 1.25rem;
}
.leads-header-row { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
.leads-search-form { display: flex; align-items: center; gap: 0.35rem; background: #f8fafc; padding: 3px; border-radius: 10px; border: 1px solid #e2e8f0; flex: 1; max-width: 400px; }
@media (max-width: 640px) {
    .leads-header-premium { padding: 1rem 1.25rem; }
    .leads-header-row { flex-direction: column; align-items: stretch; gap: 0.6rem; }
    .leads-search-form { max-width: 100%; }
}
.lead-tabbar { display:flex; justify-content:center; gap:0.4rem; overflow-x:auto; padding:0.4rem; margin-bottom:1rem; background:#fff; border:1px solid #f1f5f9; border-radius:14px; box-shadow:0 2px 8px rgba(0,0,0,0.04); scrollbar-width:thin; -webkit-overflow-scrolling:touch; }
.lead-tabbar::-webkit-scrollbar { height:6px; }
.lead-tabbar::-webkit-scrollbar-thumb { background:#e2e8f0; border-radius:3px; }
.lead-tab { display:inline-flex; align-items:center; gap:0.4rem; white-space:nowrap; flex:0 0 auto; padding:7px 14px; border-radius:10px; font-size:0.78rem; font-weight:800; color:#64748b; text-decoration:none; border:1px solid transparent; transition:all 0.15s; }
.lead-tab:hover { background:#f8fafc; color:#1e293b; }
.lead-tab i { font-size:0.75rem; opacity:0.85; }
.lead-tab-count { font-size:0.68rem; font-weight:900; padding:1px 7px; border-radius:9px; background:#f1f5f9; color:#475569; }
.lead-tab--active { background:#eff6ff; color:#2563eb; border-color:#bfdbfe; }
.lead-tab--active .lead-tab-count { background:#2563eb; color:#fff; }

.dash-filter-bar { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; width: 100%; margin: 0; }
.dash-filter-chip { display: inline-flex; align-items: center; gap: 7px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 0.42rem 0.68rem; transition: border-color 0.15s ease, box-shadow 0.15s ease; }
.dash-filter-chip:focus-within { border-color: #93c5fd; box-shadow: 0 0 0 3px rgba(59,130,246,0.12); }
.dash-filter-chip > i { font-size: 0.74rem; color: #94a3b8; flex: 0 0 auto; }
.dash-filter-chip select { border: none; outline: none; font-size: 0.75rem; font-weight: 700; color: #0f172a; cursor: pointer; max-width: 100%; -webkit-appearance: none; -moz-appearance: none; appearance: none; padding: 0 1.15rem 0 0; background-color: transparent; background-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 0.05rem center; background-size: 0.7rem; }
.dash-filter-chip select option { color: #0f172a; background: #ffffff; font-weight: 600; }
.dash-filter-chip span.df-label { font-size: 0.7rem; font-weight: 800; color: #64748b; text-transform: uppercase; }
.dash-filter-chip input[type="date"] { border: none; outline: none; font-size: 0.75rem; font-weight: 700; color: #334155; padding: 2px 0; background: transparent; }
.dash-filter-reset { font-size: 0.72rem; font-weight: 800; color: #ef4444; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; margin-left: auto; white-space: nowrap; }

.enquiry-pill { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 10px; border: 1.5px solid rgba(0,0,0,0.04); font-size: 1rem; transition: 0.2s; cursor: pointer; text-decoration: none; background: #f8fafc; color: #475569; }
.enquiry-pill:hover { transform: translateY(-2px); box-shadow: 0 4px 8px rgba(0,0,0,0.05); }
.enquiry-pill--whatsapp { background: #f0fdf4; color: #16a34a; border-color: #bbf7d0; }
.enquiry-pill--confirm { background: #e0f2fe; color: #0369a1; border-color: #bae6fd; }
.enquiry-pill--waiting { background: #fef3c7; color: #d97706; border-color: #fde68a; }
.enquiry-pill--delete { background: #fff1f2; color: #e11d48; border-color: #fecaca; }

@media (max-width: 640px) {
    .dash-filter-bar { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.5rem; }
    .dash-filter-chip { width: 100%; justify-content: flex-start; }
    .dash-filter-chip select { flex: 1 1 auto; width: 100%; }
    .dash-filter-chip[data-span="full"] { grid-column: 1 / -1; }
    .dash-filter-reset { grid-column: 1 / -1; margin-left: 0; justify-content: center; }
}

.ops-actions-container { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; width: 100%; }
.ops-row-inputs { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; width: 100%; }
.ops-note-container { display: flex; align-items: center; gap: 4px; width: 100%; justify-content: flex-end; }
.ops-note-input { width: 100%; max-width: 330px; }
.enquiry-row-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }

@media (max-width: 800px) {
    .ops-actions-container { align-items: stretch !important; }
    .ops-row-inputs { justify-content: flex-start !important; }
    .ops-note-container { justify-content: flex-start !important; }
    .ops-note-input { max-width: 100% !important; }
    .enquiry-row-actions { justify-content: flex-start !important; width: 100% !important; }
}

@media (max-width: 800px) {
    #ajax-table-container table.custom-table { table-layout: auto !important; width: 100% !important; min-width: 0 !important; display: block !important; }
    #ajax-table-container .custom-table thead { display: none !important; }
    #ajax-table-container .custom-table tbody { display: block !important; width: 100% !important; }
    #ajax-table-container .custom-table tbody tr { display: block !important; width: 100% !important; padding: 0.85rem 0.9rem !important; margin: 0 0 0.85rem 0 !important; background: #ffffff !important; border: 1px solid #e2e8f0 !important; border-radius: 14px !important; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04) !important; position: relative !important; }
    #ajax-table-container .custom-table tbody td { display: block !important; width: 100% !important; padding: 0.55rem 0 !important; margin: 0 !important; border: none !important; background: transparent !important; border-radius: 0 !important; text-align: left !important; vertical-align: top !important; white-space: normal !important; overflow-wrap: anywhere !important; }
    #ajax-table-container .custom-table tbody td + td { border-top: 1px dashed #e2e8f0 !important; padding-top: 0.65rem !important; }
    #ajax-table-container .custom-table tbody td[data-label="Select"] { position: absolute !important; top: 0.5rem !important; right: 0.6rem !important; width: auto !important; padding: 0 !important; border: none !important; z-index: 10; }
    #ajax-table-container .custom-table tbody td[data-label="Operations & Actions"] > div { flex-wrap: wrap !important; gap: 0.4rem !important; justify-content: flex-start !important; }
    #ajax-table-container .custom-table tbody td[data-label="Lead Info"] { padding-right: 2.5rem !important; }
}

/* Custom Accordion Chevron Rotation */
details[open] .accordion-chevron {
    transform: rotate(180deg);
}
details summary::-webkit-details-marker {
    display: none !important;
}
details summary {
    list-style: none !important;
}

/* Premium Modal Layout matching dashboard */
.admin-modal-backdrop {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 99999;
    background: rgba(8, 14, 31, 0);
    backdrop-filter: blur(0px) saturate(100%);
    -webkit-backdrop-filter: blur(0px) saturate(100%);
    overflow-y: auto;
    padding: 2rem 1rem;
    align-items: flex-start;
    justify-content: center;
    transition: background-color 0.3s ease, backdrop-filter 0.3s ease;
}
.admin-modal-backdrop.modal-visible {
    background: rgba(8, 14, 31, 0.72);
    backdrop-filter: blur(14px) saturate(180%);
    -webkit-backdrop-filter: blur(14px) saturate(180%);
}
.admin-modal-window {
    background: #ffffff;
    border-radius: 28px;
    width: 100%;
    box-shadow:
        0 0 0 1px rgba(226, 232, 240, 0.6),
        0 8px 16px -4px rgba(15, 23, 42, 0.08),
        0 32px 64px -16px rgba(15, 23, 42, 0.28),
        0 64px 96px -24px rgba(15, 23, 42, 0.12);
    border: 1px solid rgba(255,255,255,0.9);
    overflow: hidden;
    position: relative;
    transform: scale(0.88) translateY(32px);
    opacity: 0;
    transition:
        transform 0.38s cubic-bezier(0.34, 1.56, 0.64, 1),
        opacity 0.28s ease;
    margin: 2rem auto;
}
.admin-modal-backdrop.modal-visible .admin-modal-window {
    transform: scale(1) translateY(0);
    opacity: 1;
}
@keyframes modalFadeIn {
    from { opacity: 0; transform: scale(0.95) translateY(10px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
}
.admin-modal-close-btn {
    position: absolute;
    top: 1.1rem;
    right: 1.1rem;
    background: rgba(255,255,255,0.18);
    border: 1px solid rgba(255,255,255,0.25);
    color: #ffffff;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 1.1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 500;
    transition: all 0.2s ease;
    z-index: 10;
    backdrop-filter: blur(4px);
}
.admin-modal-close-btn:hover {
    background: rgba(255,255,255,0.32);
    color: #ffffff;
    transform: rotate(90deg) scale(1.1);
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
.badge-record-type {
    font-size: 0.62rem;
    font-weight: 800;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 12px;
    letter-spacing: 0.06em;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}
/* Enhanced Action Buttons */
.action-btn-enhanced {
    padding: 0.7rem 1rem;
    border-radius: 13px;
    font-size: 0.78rem;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
    transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1);
    border: 1.5px solid transparent;
    text-decoration: none;
    text-align: center;
    letter-spacing: 0.01em;
    font-family: 'Outfit', 'Inter', sans-serif;
}
.action-btn-enhanced:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(15, 23, 42, 0.1);
}
.action-btn-enhanced:active { transform: translateY(0); box-shadow: none; }
.btn-confirm {
    background: linear-gradient(135deg, #dcfce7, #bbf7d0);
    color: #14532d;
    border-color: #86efac;
}
.btn-confirm:hover { background: linear-gradient(135deg, #bbf7d0, #86efac); box-shadow: 0 6px 16px rgba(22,163,74,0.18) !important; }
.btn-wait {
    background: linear-gradient(135deg, #e0f2fe, #bae6fd);
    color: #0c4a6e;
    border-color: #7dd3fc;
}
.btn-wait:hover { background: linear-gradient(135deg, #bae6fd, #7dd3fc); box-shadow: 0 6px 16px rgba(3,105,161,0.18) !important; }
.btn-customize {
    background: linear-gradient(135deg, #fffbeb, #fef3c7);
    color: #78350f;
    border-color: #fcd34d;
}
.btn-customize:hover { background: linear-gradient(135deg, #fef3c7, #fde68a); box-shadow: 0 6px 16px rgba(180,83,9,0.18) !important; }
.btn-spam {
    background: linear-gradient(135deg, #fef2f2, #fee2e2);
    color: #991b1b;
    border-color: #fca5a5;
}
.btn-spam:hover { background: linear-gradient(135deg, #fee2e2, #fecaca); box-shadow: 0 6px 16px rgba(185,28,28,0.18) !important; }

/* Route Timeline Visualizer */
.timeline-container {
    background: linear-gradient(145deg, #fafbff 0%, #f8fafc 100%);
    border: 1px solid #e8edf4;
}
.route-visualizer {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 1.35rem;
    padding-left: 0.5rem;
    margin-top: 8px;
}
.route-line-connector {
    position: absolute;
    top: 20px;
    left: 18px;
    bottom: 20px;
    width: 2px;
    background: linear-gradient(to bottom,
        #10b981 0%,
        #a7f3d0 30%,
        #fca5a5 70%,
        #ef4444 100%
    );
    opacity: 0.5;
}
.route-node {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    position: relative;
    z-index: 2;
}
.route-node .node-icon {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.9rem;
    flex-shrink: 0;
}
.pickup-node .node-icon {
    background: linear-gradient(135deg, #ecfdf5, #d1fae5);
    color: #059669;
    border: 2px solid #a7f3d0;
    box-shadow: 0 2px 8px rgba(16,185,129,0.2);
    animation: routePulse 2.5s ease-in-out infinite;
}
.drop-node .node-icon {
    background: linear-gradient(135deg, #fef2f2, #fee2e2);
    color: #dc2626;
    border: 2px solid #fca5a5;
    box-shadow: 0 2px 8px rgba(239,68,68,0.2);
    animation: dropPulse 2.5s ease-in-out 1.25s infinite;
}
.route-node .node-details {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-top: 4px;
}
.route-node .node-label {
    font-size: 0.64rem;
    font-weight: 800;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}
.route-node .node-address {
    font-size: 0.9rem;
    color: #1e293b;
    font-weight: 700;
    line-height: 1.4;
}
@keyframes routePulse {
    0% { box-shadow: 0 0 0 0 rgba(16,185,129,0.4); }
    70% { box-shadow: 0 0 0 6px rgba(16,185,129,0); }
    100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
}
@keyframes dropPulse {
    0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
    70% { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
    100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
}
/* Card component inside modal */
.modal-card-container {
    background: #f8fafc;
    padding: 1.15rem 1.25rem;
    border-radius: 18px;
    border: 1px solid #e2e8f0;
}
.modal-card-label {
    font-size: 0.64rem;
    font-weight: 800;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 5px;
}
.action-btn-circle-enhanced {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.05rem;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    border: 1px solid transparent;
    text-decoration: none;
}
.action-btn-circle-enhanced:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}
.call-theme { background: #f1f5f9; color: #475569; border-color: #e2e8f0; }
.call-theme:hover { background: #e2e8f0; color: #0f172a; }
.whatsapp-theme { background: #f0fdf4; color: #16a34a; border-color: #bbf7d0; }
.whatsapp-theme:hover { background: #dcfce7; color: #15803d; }

.grid-cell-label {
    font-size: 0.63rem;
    font-weight: 800;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    display: flex;
    align-items: center;
    gap: 4px;
}
.grid-cell-value {
    font-size: 0.88rem;
    color: #1e293b;
    font-weight: 700;
    line-height: 1.3;
}
.fare-value-highlight {
    font-size: 1.3rem;
    background: linear-gradient(135deg, #059669, #047857);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    font-weight: 900;
    font-family: 'Outfit', sans-serif;
}
</style>

<div class="leads-header-premium">
    <div class="leads-header-row">
        <!-- Identity -->
        <div style="display:flex; align-items:center; gap:0.6rem; flex-shrink:0;">
            <div style="width:36px; height:36px; background:#f0f7ff; border-radius:10px; display:flex; align-items:center; justify-content:center; color:#3b82f6;">
                <i class="fa-solid fa-satellite-dish" style="font-size:1.1rem;"></i>
            </div>
            <h1 style="font-size:1.2rem; font-weight:800; color:#1e293b; margin:0;">Leads Center</h1>
        </div>
        <!-- Search + Actions -->
        <form action="enquiries" method="GET" id="enquiry-search-form" class="leads-search-form">
            <input type="hidden" name="status" value="<?php echo htmlspecialchars($statusFilter); ?>">
            <input type="hidden" name="date_filter" value="<?php echo htmlspecialchars($dateFilter); ?>">
            <input type="hidden" name="start_date" value="<?php echo htmlspecialchars($startDate); ?>">
            <input type="hidden" name="end_date" value="<?php echo htmlspecialchars($endDate); ?>">
            <input type="hidden" name="dispatcher" value="<?php echo htmlspecialchars($dispatcherFilter); ?>">
            <input type="hidden" name="sort" value="<?php echo htmlspecialchars($sortFilter); ?>">
            <div style="position:relative; flex:1;">
                <i class="fa fa-search" style="position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; font-size:0.8rem; z-index:1;"></i>
                <input type="text" name="search" id="enquiry-search-input" autocomplete="off" class="form-control" placeholder="Search phone, name, route..." value="<?php echo htmlspecialchars($search); ?>" style="border:none; padding-left:2rem; font-size:0.82rem; height:34px; box-shadow:none; background:transparent; width:100%;">
                <div id="search-suggestions" style="display:none; position:absolute; top:100%; left:0; right:0; background:#fff; border:1px solid #e2e8f0; border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,0.10); z-index:999; margin-top:4px; max-height:300px; overflow-y:auto;"></div>
            </div>
            <button type="submit" style="height:34px; width:34px; padding:0; border-radius:8px; background:#f7b733; color:#1e293b; border:none; display:flex; align-items:center; justify-content:center; flex-shrink:0; cursor:pointer;" title="Search"><i class="fa fa-search" style="font-size:0.85rem;"></i></button>
            <button type="button" onclick="location.reload();" style="height:34px; width:34px; border-radius:8px; background:#fff; border:1px solid #e2e8f0; color:#64748b; display:flex; align-items:center; justify-content:center; flex-shrink:0; cursor:pointer;" title="Refresh"><i class="fa fa-refresh"></i></button>
        </form>
    </div>
</div>

<div class="lead-tabbar" role="tablist" aria-label="Lead status filters">
    <a href="<?php echo admin_url('enquiries', array_filter(['status' => 'not_responded', 'date_filter' => $dateFilter, 'start_date' => $startDate, 'end_date' => $endDate, 'dispatcher' => $dispatcherFilter, 'sort' => $sortFilter, 'search' => $search])); ?>" class="lead-tab <?php echo $statusFilter === 'not_responded' ? 'lead-tab--active' : ''; ?>" role="tab">
        <i class="fa-solid fa-bell" aria-hidden="true"></i>
        <span>Unresponded</span>
        <span class="lead-tab-count"><?php echo $unrespondedCount; ?></span>
    </a>
    <a href="<?php echo admin_url('enquiries', array_filter(['status' => 'responded', 'date_filter' => $dateFilter, 'start_date' => $startDate, 'end_date' => $endDate, 'dispatcher' => $dispatcherFilter, 'sort' => $sortFilter, 'search' => $search])); ?>" class="lead-tab <?php echo $statusFilter === 'responded' ? 'lead-tab--active' : ''; ?>" role="tab">
        <i class="fa-solid fa-reply" aria-hidden="true"></i>
        <span>Responded</span>
        <span class="lead-tab-count"><?php echo $respondedCount; ?></span>
    </a>
</div>

<div class="crm-filter-panel" style="background: #fff; padding: 0.75rem 1rem; border-radius: 14px; border: 1px solid #f1f5f9; display: flex; flex-wrap: wrap; margin-bottom: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
    <form class="crm-filter-form dash-filter-bar" action="enquiries" method="GET" onsubmit="event.preventDefault(); triggerFilterSubmit();">
        <input type="hidden" name="status" value="<?php echo htmlspecialchars($statusFilter); ?>">

        <!-- Date Filter -->
        <div class="dash-filter-chip" title="Date range">
            <i class="fa-solid fa-calendar-day"></i>
            <select name="date_filter" onchange="handleDateFilterChange(this);">
                <option value="all" <?php echo $dateFilter === 'all' ? 'selected' : ''; ?>>All Time</option>
                <option value="today" <?php echo $dateFilter === 'today' ? 'selected' : ''; ?>>Today</option>
                <option value="yesterday" <?php echo $dateFilter === 'yesterday' ? 'selected' : ''; ?>>Yesterday</option>
                <option value="this_week" <?php echo $dateFilter === 'this_week' ? 'selected' : ''; ?>>This Week</option>
                <option value="this_month" <?php echo $dateFilter === 'this_month' ? 'selected' : ''; ?>>This Month</option>
                <option value="custom" <?php echo $dateFilter === 'custom' ? 'selected' : ''; ?>>Custom Range</option>
            </select>
        </div>

        <!-- Custom Date Range -->
        <div id="enquiries-custom-range" class="dash-filter-chip" data-span="full" style="display: <?php echo $dateFilter === 'custom' ? 'flex' : 'none'; ?>;">
            <i class="fa-solid fa-calendar-week"></i>
            <span class="df-label">From</span>
            <input type="date" name="start_date" id="enquiries-start-date" value="<?php echo htmlspecialchars($startDate); ?>" onchange="triggerFilterSubmit();">
            <span class="df-label">To</span>
            <input type="date" name="end_date" id="enquiries-end-date" value="<?php echo htmlspecialchars($endDate); ?>" onchange="triggerFilterSubmit();">
        </div>

        <!-- Staff Filter (Only shown if Status is Responded) -->
        <?php if ($statusFilter === 'responded'): ?>
        <div class="dash-filter-chip" title="Dispatcher">
            <i class="fa-solid fa-user-tie"></i>
            <select name="dispatcher" onchange="triggerFilterSubmit();">
                <option value="" <?php echo $dispatcherFilter === '' ? 'selected' : ''; ?>>All Staff</option>
                <option value="unassigned" <?php echo $dispatcherFilter === 'unassigned' ? 'selected' : ''; ?>>Unassigned</option>
                <?php foreach ($allAdminNames as $name): ?>
                    <option value="<?php echo htmlspecialchars($name); ?>" <?php echo $dispatcherFilter === $name ? 'selected' : ''; ?>><?php echo htmlspecialchars($name); ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <?php endif; ?>

        <!-- Sort Filter -->
        <div class="dash-filter-chip" title="Sort by">
            <i class="fa-solid fa-arrow-down-wide-short"></i>
            <select name="sort" onchange="triggerFilterSubmit();">
                <option value="newest" <?php echo $sortFilter === 'newest' ? 'selected' : ''; ?>>Newest First</option>
                <option value="next_first" <?php echo $sortFilter === 'next_first' ? 'selected' : ''; ?>>Operational Priority</option>
                <option value="oldest" <?php echo $sortFilter === 'oldest' ? 'selected' : ''; ?>>Oldest First</option>
            </select>
        </div>
        
        <a href="#" onclick="event.preventDefault(); resetEnquiriesFilters();" class="dash-filter-reset"><i class="fa-solid fa-rotate-left"></i> Reset Filters</a>
    </form>
</div>

<?php if ($pageMsg): ?>
    <div class="alert alert-success" style="margin-bottom: 1rem; border-radius: 10px; border: none; background: #f0fdf4; color: #166534; font-weight: 700; font-size: 0.8rem; padding: 0.5rem 1rem; border-left: 3px solid #22c55e;">
        <?php 
            if ($pageMsg === 'deleted') echo "Lead archived.";
            elseif ($pageMsg === 'updated') echo "Status updated.";
        ?>
    </div>
<?php endif; ?>

<div id="bulk-actions-bar" style="display:none; align-items:center; justify-content:space-between; gap:0.75rem; flex-wrap:wrap; margin-bottom: 0.85rem; background:#ffffff; padding:10px 14px; border-radius:12px; border:1px solid #e2e8f0; box-shadow: 0 4px 14px rgba(15,23,42,0.05); animation: fadeSlideDown 0.18s ease;">
    <div style="display:flex; align-items:center; gap:0.9rem;">
        <label style="display:inline-flex; align-items:center; gap:0.45rem; cursor:pointer; font-size:0.82rem; font-weight:800; color:#1e293b; user-select:none;">
            <input type="checkbox" id="select-all-bar" style="width:18px; height:18px; cursor:pointer; accent-color:#3b82f6;">
            Select all
        </label>
        <span style="display:inline-flex; align-items:center; gap:0.4rem; font-size:0.8rem; font-weight:700; color:#64748b;">
            <span id="selected-count" style="font-weight:800; color:#1e293b;">0</span> selected
        </span>
    </div>
    <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
        <button type="button" onclick="submitBulkEnquiryAction('confirm')"
                style="padding:0.5rem 0.95rem; border:none; border-radius:8px; background:#16a34a; color:#fff; font-weight:800; font-size:0.78rem; cursor:pointer; box-shadow:0 3px 8px rgba(22,163,74,0.25); display:inline-flex; align-items:center; gap:4px;">
            <i class="fa fa-check"></i> Confirm
        </button>
        <button type="button" onclick="if(confirm('Mark selected leads as fake/spam and block their IPs?')) submitBulkEnquiryAction('cancel')"
                style="padding:0.5rem 0.95rem; border:none; border-radius:8px; background:#ef4444; color:#fff; font-weight:800; font-size:0.78rem; cursor:pointer; box-shadow:0 3px 8px rgba(239,68,68,0.25); display:inline-flex; align-items:center; gap:4px;">
            <i class="fa fa-ban"></i> Clear
        </button>
    </div>
</div>

<form id="enquiries-bulk-form" method="POST" action="enquiries" style="margin: 0;">
    <input type="hidden" name="bulk_action" id="bulk-action-hidden-val" value="">

    <!-- Card Layout Styling -->
    <style>
    .enquiry-cards-list {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
        max-width: 680px;
        margin: 1.5rem auto;
        font-family: 'Outfit', 'Inter', sans-serif;
    }
    .enquiry-card {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 24px;
        padding: 1.15rem 1.25rem 1.15rem 0.85rem;
        box-shadow: 0 4px 12px rgba(15, 23, 42, 0.02);
        cursor: pointer;
        transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
    }
    .enquiry-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 20px rgba(15, 23, 42, 0.05);
        border-color: #cbd5e1;
    }
    .ref-badge {
        background: #eff6ff;
        border: 1px solid #bfdbfe;
        color: #2563eb;
        font-weight: 800;
        font-size: 0.8rem;
        padding: 4px 10px;
        border-radius: 8px;
        font-family: monospace;
        display: inline-block;
        text-decoration: none;
    }
    .phone-pill {
        color: #6366f1;
        font-weight: 700;
        text-decoration: none;
        font-size: 0.78rem;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: #f5f3ff;
        border: 1px solid #ddd6fe;
        padding: 4px 12px;
        border-radius: 8px;
        transition: all 0.2s;
    }
    .phone-pill:hover {
        background: #ece9ff;
    }
    .wa-icon-btn {
        background: #f0fdf4;
        border: 1px solid #bbf7d0;
        color: #16a34a;
        width: 28px;
        height: 28px;
        border-radius: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        text-decoration: none;
        transition: all 0.2s;
    }
    .wa-icon-btn:hover {
        background: #e0fde9;
    }
    .action-btn-circle {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.1rem;
        transition: all 0.2s;
        cursor: pointer;
        text-decoration: none;
    }
    .action-btn-circle:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0,0,0,0.06);
    }
    </style>

    <!-- AJAX Target Container -->
    <div id="ajax-table-container" style="transition: opacity 0.2s ease;">
        <div class="enquiry-cards-list">
            <?php foreach ($enquiries as $e): ?>
                <?php
                $eid = (int)$e['id'];
                $storedBid = trim((string)($e['booking_id'] ?? ''));
                $fareUrl = "fare-view?id=" . $eid . "&source=enquiry";
                
                if ($storedBid !== '') {
                    $bookingRef = $storedBid;
                } else {
                    $isConfirmedLead = ($e['status'] === 'confirmed');
                    $md = date('md', strtotime($e['created_at'] ?? 'now'));
                    $bookingRef = ($isConfirmedLead ? 'C' : 'E') . $md . str_pad((string)$eid, 4, '0', STR_PAD_LEFT);
                }
                
                $cTier = isset($pdo) ? dropcars_get_lead_tier($pdo, (string)($e['phone'] ?? '')) : 'new';
                $isRegular = ($cTier === 'regular');
                $isRepeated = ($cTier === 'repeated');
                $e['lead_tier'] = $cTier;

                // Determine display status and color
                $displayStatus = 'Enquiry';
                $displayStatusColor = '#2563eb'; // Default Royal Blue
                if ($e['status'] === 'confirmed') {
                    $displayStatus = 'Confirmed';
                    $displayStatusColor = '#16a34a'; // Green
                } elseif ($e['status'] === 'fake') {
                    $displayStatus = 'Spam';
                    $displayStatusColor = '#ef4444'; // Red
                } elseif ($e['status'] === 'pending') {
                    $displayStatus = 'Waiting';
                    $displayStatusColor = '#d97706'; // Amber/Orange
                } else {
                    if ($cTier === 'repeated' || $cTier === 'regular') {
                        $displayStatus = 'Repeated';
                        $displayStatusColor = '#d97706'; // Amber/Orange
                    }
                }
                ?>
                <div class="enquiry-card" onclick="if(!event.target.closest('a, button, input')) openEnquiryDetails(<?php echo htmlspecialchars(json_encode($e, JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_TAG | JSON_HEX_AMP)); ?>)" style="display: flex; flex-direction: row; gap: 12px; align-items: flex-start; padding: 1.15rem 1.25rem;">
                    <!-- Checkbox corner pin -->
                    <div style="flex-shrink: 0; display: flex; align-items: center; justify-content: center; padding-top: 1px; margin-left: -4px;" onclick="event.stopPropagation();">
                        <input type="checkbox" name="selected_ids[]" value="<?php echo $eid; ?>" class="enquiry-checkbox" style="width: 18px; height: 18px; cursor: pointer; accent-color: #3b82f6; margin: 0;">
                    </div>

                    <!-- Main Card Content -->
                    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.7rem;">
                        <!-- Top Row: Status & ID on Left, Pickup Schedule in Center, Customer on Right -->
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
                            <!-- Left Side: Status & ID -->
                            <div style="flex: 1.1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start;">
                                <div style="font-size: 0.68rem; color: <?php echo $displayStatusColor; ?>; text-transform: uppercase; font-weight: 800; line-height: 1.3; letter-spacing: 0.03em;">
                                    <?php echo htmlspecialchars($displayStatus); ?>
                                </div>
                                <div class="booking-ref-copy" onclick="event.stopPropagation(); copyBookingId('<?php echo htmlspecialchars($bookingRef); ?>', this);" style="cursor: pointer; font-weight: 700; color: #4f46e5; font-size: 0.78rem; display: inline-flex; align-items: center; gap: 4px; margin-top: 4px; line-height: 1.3;" title="Click to copy ID">
                                    #<?php echo htmlspecialchars($bookingRef); ?>
                                    <i class="fa-regular fa-copy" style="font-size: 0.68rem; opacity: 0.6;"></i>
                                </div>
                            </div>

                            <!-- Center: Pickup Schedule (Date & Time) -->
                            <div style="flex: 0.8; min-width: 0; display: flex; flex-direction: column; align-items: center; text-align: center;">
                                <span style="font-size: 0.85rem; font-weight: 800; color: #0f172a; line-height: 1.3; display: inline-flex; align-items: center; gap: 4px; justify-content: center;">
                                    <?php echo !empty($e['travel_date']) ? date('d M', strtotime($e['travel_date'])) : '--'; ?>
                                </span>
                                <span style="font-size: 0.78rem; color: #64748b; font-weight: 600; margin-top: 4px; line-height: 1.3; display: inline-flex; align-items: center; gap: 4px; justify-content: center;">
                                    <?php echo !empty($e['travel_time']) ? htmlspecialchars($e['travel_time']) : '--'; ?>
                                </span>
                            </div>

                            <!-- Right Side: Customer Details -->
                            <div style="flex: 1.3; min-width: 0; display: flex; flex-direction: column; align-items: flex-end; text-align: right;">
                                <div style="font-weight: 800; color: #0f172a; font-size: 0.85rem; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%;">
                                    <?php echo htmlspecialchars($e['name'] ?: 'Guest'); ?>
                                </div>
                                <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px; justify-content: flex-end;" onclick="event.stopPropagation();">
                                    <a href="tel:<?php echo htmlspecialchars(preg_replace('/\D/', '', $e['phone'])); ?>" style="font-size: 0.78rem; color: #64748b; font-weight: 600; text-decoration: none; display: inline-block; line-height: 1.3;" title="Click to call">
                                        <?php echo htmlspecialchars($e['phone']); ?>
                                    </a>
                                    <a href="<?php echo dropcars_get_whatsapp_link($e); ?>" target="_blank" rel="noopener" class="wa-icon-btn" style="width: 20px; height: 20px; border-radius: 5px; font-size: 0.75rem;" title="WhatsApp">
                                        <i class="fa-brands fa-whatsapp"></i>
                                    </a>
                                </div>
                            </div>
                        </div>

                        <!-- Journey Cities Row (One by One Locations, Right Badges Stacked) -->
                        <div style="font-size: 0.8rem; color: #475569; display: flex; justify-content: space-between; align-items: center; font-weight: 600; border-top: 1px solid #f1f5f9; padding-top: 0.6rem; width: 100%; flex-wrap: nowrap !important;">
                            <!-- Locations stacked vertically -->
                            <div style="display: flex; flex-direction: column; gap: 4px; flex-grow: 1; min-width: 0; max-width: 70%;">
                                <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                    <i class="fa-solid fa-circle-dot" style="color: #10b981; font-size: 0.7rem; flex-shrink: 0;"></i>
                                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.78rem; color: #334155; font-weight: 700;">
                                        <?php 
                                            $pParts = explode(',', $e['pickup']);
                                            echo htmlspecialchars(trim($pParts[0])); 
                                        ?>
                                    </span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                    <i class="fa-solid fa-location-dot" style="color: #ef4444; font-size: 0.75rem; flex-shrink: 0;"></i>
                                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.78rem; color: #475569; font-weight: 700;">
                                        <?php 
                                            $dParts = explode(',', $e['drop_location']);
                                            echo htmlspecialchars(trim($dParts[0])); 
                                        ?>
                                    </span>
                                </div>
                            </div>
                            
                            <!-- Right Side badges (Trip Type & Vehicle Stacked) -->
                            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; margin-left: auto;">
                                <!-- Trip Type Badge -->
                                <span style="font-size: 0.58rem; font-weight: 800; background: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; white-space: nowrap; letter-spacing: 0.02em;">
                                    <?php 
                                        $tType = strtolower(trim((string)($e['trip_type'] ?? '')));
                                        if ($tType === 'oneway' || $tType === 'one_way') {
                                            echo 'One Way';
                                        } elseif ($tType === 'round' || $tType === 'round_trip' || $tType === 'roundtrip') {
                                            echo 'Round Trip';
                                        } else {
                                            echo htmlspecialchars(str_replace('_', ' ', $tType));
                                        }
                                    ?>
                                </span>
                                <!-- Vehicle Badge -->
                                <span style="font-size: 0.58rem; font-weight: 800; background: #faf5ff; color: #6b21a8; border: 1px solid #e9d5ff; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; white-space: nowrap; letter-spacing: 0.02em;">
                                    <?php echo htmlspecialchars($e['vehicle_type'] ?: 'Not Prefered'); ?>
                                </span>
                            </div>
                        </div>

                        <!-- DateTime & Fare Row (Single Line) -->
                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem; border-top: 1px dashed #f1f5f9; padding-top: 0.6rem; color: #64748b; font-weight: 600;">
                            <!-- Enquiry Received Date & Time (Small and Dull) -->
                            <span style="color: #94a3b8; font-size: 0.7rem; font-weight: 500; letter-spacing: 0.01em;">
                                Received: <?php echo !empty($e['created_at']) ? date('d M | H:i', strtotime($e['created_at'])) : '--'; ?>
                            </span>
                            
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <strong style="color: #059669; font-size: 0.9rem; font-weight: 800;">₹<?php echo number_format((float)($e['fare_estimate'] ?? 0)); ?></strong>
                                <span style="font-size: 0.65rem; color: #94a3b8; font-weight: 700; text-transform: uppercase;">
                                    (<?php echo htmlspecialchars($e['fare_type'] ?? 'exclusive'); ?>)
                                </span>
                            </div>
                        </div>
                    </div>
                </div>  </div>
            <?php endforeach; ?>
            
            <?php if (empty($enquiries)): ?>
                <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 24px; text-align: center; padding: 6rem 2rem;">
                    <i class="fa-solid fa-inbox" style="font-size: 4rem; color: #eee; margin-bottom: 1.5rem; display: block;"></i>
                    <span style="font-size: 1.1rem; color: #999; font-weight: 600;">No leads were found in this selection.</span>
                    <p style="margin-top: 0.5rem; color: #bbb;">Try adjusting your filters or search terms.</p>
                </div>
            <?php endif; ?>
        </div>

        <!-- Tab Pagination -->
        <?php if ($totalPages > 1): ?>
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.5rem; border-top: 1px solid #f1f5f9; background: #fff; flex-wrap: wrap; gap: 0.6rem;">
                <div style="font-size: 0.8rem; color: #64748b; font-weight: 600;">
                    Showing <?php echo $offset + 1; ?> to <?php echo min($offset + $limit, $totalCount); ?> of <?php echo $totalCount; ?> entries
                </div>
                <div style="display: flex; gap: 0.35rem;">
                    <?php if ($page > 1): ?>
                        <a href="<?php echo admin_url('enquiries', array_filter(['status' => $statusFilter, 'date_filter' => $dateFilter !== 'all' ? $dateFilter : null, 'start_date' => $dateFilter === 'custom' && $startDate !== '' ? $startDate : null, 'end_date' => $dateFilter === 'custom' && $endDate !== '' ? $endDate : null, 'dispatcher' => $dispatcherFilter ?: null, 'sort' => $sortFilter !== 'newest' ? $sortFilter : null, 'search' => $search ?: null, 'page' => $page - 1])); ?>"
                           class="pagination-link"
                           style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: #475569; font-weight: 700; text-decoration: none; font-size: 0.85rem; transition: all 0.2s;"
                           onmouseover="this.style.background='#f8fafc';" onmouseout="this.style.background='#fff';">
                             <i class="fa fa-chevron-left" style="font-size: 0.7rem;"></i>
                        </a>
                    <?php endif; ?>

                    <?php
                    $startPage = max(1, $page - 2);
                    $endPage = min($totalPages, $page + 2);
                    for ($i = $startPage; $i <= $endPage; $i++):
                        $active = ($i === $page);
                    ?>
                        <a href="<?php echo admin_url('enquiries', array_filter(['status' => $statusFilter, 'date_filter' => $dateFilter !== 'all' ? $dateFilter : null, 'start_date' => $dateFilter === 'custom' && $startDate !== '' ? $startDate : null, 'end_date' => $dateFilter === 'custom' && $endDate !== '' ? $endDate : null, 'dispatcher' => $dispatcherFilter ?: null, 'sort' => $sortFilter !== 'newest' ? $sortFilter : null, 'search' => $search ?: null, 'page' => $i])); ?>"
                           class="pagination-link"
                           style="display: inline-flex; align-items: center; justify-content: center; min-width: 32px; height: 32px; padding: 0 6px; border-radius: 8px; border: 1px solid <?php echo $active ? '#6366f1' : '#cbd5e1'; ?>; background: <?php echo $active ? '#6366f1' : '#fff'; ?>; color: <?php echo $active ? '#fff' : '#475569'; ?>; font-weight: 800; text-decoration: none; font-size: 0.82rem; transition: all 0.2s;"
                           <?php if (!$active): ?>onmouseover="this.style.background='#f8fafc';" onmouseout="this.style.background='#fff';"<?php endif; ?>>
                            <?php echo $i; ?>
                        </a>
                    <?php endfor; ?>

                    <?php if ($page < $totalPages): ?>
                        <a href="<?php echo admin_url('enquiries', array_filter(['status' => $statusFilter, 'date_filter' => $dateFilter !== 'all' ? $dateFilter : null, 'start_date' => $dateFilter === 'custom' && $startDate !== '' ? $startDate : null, 'end_date' => $dateFilter === 'custom' && $endDate !== '' ? $endDate : null, 'dispatcher' => $dispatcherFilter ?: null, 'sort' => $sortFilter !== 'newest' ? $sortFilter : null, 'search' => $search ?: null, 'page' => $page + 1])); ?>"
                           class="pagination-link"
                           style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: #475569; font-weight: 700; text-decoration: none; font-size: 0.85rem; transition: all 0.2s;"
                           onmouseover="this.style.background='#f8fafc';" onmouseout="this.style.background='#fff';">
                            <i class="fa fa-chevron-right" style="font-size: 0.7rem;"></i>
                        </a>
                    <?php endif; ?>
                </div>
            </div>
        <?php endif; ?>
    </div>
</form>

<!-- DETAILS MODAL HTML & CSS -->
<style>
/* Custom modal styling removed - using dashboard admin-modal backdrop and window classes */
@keyframes modalScaleIn {
    from { opacity: 0; transform: scale(0.96); }
    to { opacity: 1; transform: scale(1); }
}
.action-btn-circle {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #e2e8f0;
    text-decoration: none;
    transition: all 0.15s;
    cursor: pointer;
}
.action-btn-circle:hover {
    transform: scale(1.05);
}
/* Info Grid Cells matching dashboard */
.modal-grid-cell {
    background: #f8fafc;
    border: 1px solid #eef2f7;
    padding: 0.9rem 1rem;
    border-radius: 16px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    transition: all 0.2s ease;
}
.modal-grid-cell:hover {
    background: #f1f5f9;
    border-color: #dde3eb;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(15,23,42,0.05);
}
@media (max-width: 640px) {
    .modal-grid {
        grid-template-columns: 1fr !important;
        gap: 1rem !important;
    }
}
.dropdown-wa { position: relative; display: inline-block; }
.wa-dropdown-menu {
    display: none;
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 8px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
    z-index: 999999;
    min-width: 220px;
    overflow: hidden;
}
.wa-dropdown-menu a {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    color: #334155;
    text-decoration: none;
    font-size: 0.8rem;
    font-weight: 600;
    transition: background 0.15s;
    text-align: left;
}
.wa-dropdown-menu a:hover {
    background: #f8fafc;
    color: #0f172a;
}
.crm-details-accordion summary::-webkit-details-marker,
.meta-details-accordion summary::-webkit-details-marker {
    display: none;
}
.crm-details-accordion summary,
.meta-details-accordion summary {
    list-style: none;
}
.crm-details-accordion[open] summary i.fa-chevron-down,
.meta-details-accordion[open] summary i.fa-chevron-down {
    transform: rotate(180deg);
}

/* WA Template buttons (WhatsApp modal) */
@keyframes waFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.wa-template-opt-btn {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 13px 16px;
    background: #ffffff;
    border: 1.5px solid #e8edf4;
    border-radius: 14px;
    cursor: pointer;
    transition: all 0.22s ease;
    outline: none;
    text-align: left;
    box-shadow: 0 1px 4px rgba(15,23,42,0.04);
    animation: waFadeIn 0.3s ease both;
}
.wa-template-opt-btn:hover {
    background: linear-gradient(135deg, #f8fafc, #f1f5f9);
    border-color: #c7d2db;
    transform: translateY(-2px);
    box-shadow: 0 6px 18px rgba(15,23,42,0.08);
}
.wa-opt-icon {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.15rem;
    flex-shrink: 0;
    box-shadow: 0 2px 6px rgba(15,23,42,0.06);
}
.wa-opt-title { font-weight: 800; font-size: 0.9rem; color: #1e293b; font-family: 'Outfit', sans-serif; }
.wa-opt-desc { font-size: 0.72rem; color: #64748b; font-weight: 500; margin-top: 2px; line-height: 1.4; }
.wa-modal-spinner {
    width: 32px; height: 32px;
    border: 3px solid #e2e8f0;
    border-top: 3px solid #16a34a;
    border-radius: 50%;
    margin: 0 auto;
    animation: waSpin 0.75s linear infinite;
}
@keyframes waSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
</style>
<div id="lead-details-modal" class="admin-modal-backdrop">
    <div class="admin-modal-window" style="max-width: 560px;">
        <!-- Gradient Header Band -->
        <div style="background:linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #162032 100%); padding:14px 20px 14px; position:relative; overflow:hidden; border-top-left-radius: 16px; border-top-right-radius: 16px; flex-shrink: 0;">
            <!-- Decorative glows -->
            <div style="position:absolute;top:-30px;right:-20px;width:140px;height:140px;border-radius:50%;background:radial-gradient(circle,rgba(99,102,241,0.12),transparent 70%);pointer-events:none;"></div>
            <div style="position:absolute;bottom:-40px;left:10px;width:100px;height:100px;border-radius:50%;background:radial-gradient(circle,rgba(247,183,51,0.08),transparent 70%);pointer-events:none;"></div>

            <div style="display:flex;align-items:flex-start;justify-content:space-between;position:relative;">
                <div>
                    <!-- Single status badge/text here -->
                    <span id="modal-lead-status-badge" class="badge-record-type">NEW ENQUIRY</span>
                    <h3 id="modal-lead-ref" style="margin:5px 0 0;font-weight:900;font-size:1.15rem;color:#f8fafc;font-family:'Outfit',sans-serif;letter-spacing:-0.02em;line-height:1.1;">#E0000</h3>
                </div>
                <button type="button" onclick="closeLeadDetailsModal()" class="admin-modal-close-btn" style="margin-top:2px;flex-shrink:0;"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>
        <!-- Modal Body (Scrollable) -->
        <div style="padding:22px 22px 26px; overflow-y: auto; flex: 1; display:flex; flex-direction:column; gap:16px;">
            <!-- Customer Profile Card -->
            <div class="modal-card-container" style="background:linear-gradient(145deg,#f8fafc,#f1f5f9);">
                <div class="modal-card-label"><i class="fa-solid fa-circle-user"></i> Customer Profile</div>
                <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <div style="width:42px;height:42px;background:linear-gradient(135deg,#6366f1,#4f46e5);border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 4px 12px rgba(99,102,241,0.25);">
                            <i class="fa-solid fa-user" style="color:#fff;font-size:1rem;"></i>
                        </div>
                        <div>
                            <strong id="modal-cust-name" style="font-size:1.05rem;color:#0f172a;display:block;font-weight:800;font-family:'Outfit',sans-serif;">Guest</strong>
                            <span id="modal-cust-phone" style="font-size:0.82rem;color:#64748b;font-weight:700;font-family:monospace;">-</span>
                        </div>
                    </div>
                    <div style="display:flex; gap:8px;flex-shrink:0;">
                        <a id="modal-call-link" href="" class="action-btn-circle-enhanced call-theme" title="Call Customer">
                            <i class="fa-solid fa-phone"></i>
                        </a>
                        <button id="modal-wa-link" type="button" class="action-btn-circle-enhanced whatsapp-theme" title="WhatsApp Templates" onclick="">
                            <i class="fa-brands fa-whatsapp"></i>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Route Timeline -->
            <div class="modal-card-container timeline-container">
                <div class="modal-card-label"><i class="fa-solid fa-route"></i> Journey Route</div>
                <div class="route-visualizer" id="modal-route-visualizer" style="padding-left:4px;">
                    <!-- Dynamic rendering in JS -->
                </div>
            </div>

            <!-- Journey Parameters Grid -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <div class="modal-grid-cell">
                    <span class="grid-cell-label"><i class="fa-solid fa-calendar-days"></i> Travel Schedule</span>
                    <strong id="modal-pickup-schedule" class="grid-cell-value">-</strong>
                </div>
                <div class="modal-grid-cell">
                    <span class="grid-cell-label"><i class="fa-solid fa-taxi"></i> Service Type</span>
                    <strong id="modal-trip-vehicle" class="grid-cell-value">-</strong>
                </div>
                <div class="modal-grid-cell" style="background:linear-gradient(145deg,#f0fdf9,#ecfdf5);border-color:#d1fae5;">
                    <span class="grid-cell-label"><i class="fa-solid fa-indian-rupee-sign"></i> Fare Estimate</span>
                    <strong id="modal-fare-info" class="grid-cell-value fare-value-highlight">₹0</strong>
                </div>
                <div class="modal-grid-cell">
                    <span class="grid-cell-label"><i class="fa-solid fa-clock"></i> Received At</span>
                    <strong id="modal-recd-time" class="grid-cell-value">-</strong>
                </div>
            </div>
            <div id="modal-extra-details" style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: -6px;"></div>

            <!-- CRM Inputs Collapsible -->
            <details class="details-accordion-purple" style="border: 1px solid #f3e8ff; border-radius: 10px; background: #faf5ff; overflow: hidden;">
                <summary style="font-size: 0.8rem; font-weight: 800; color: #6d28d9; padding: 10px 12px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; user-select: none; outline: none; list-style: none;">
                    <span style="display: flex; align-items: center; gap: 6px;"><i class="fa-solid fa-notes-medical"></i> CRM & Dispatcher Settings</span>
                    <i class="fa-solid fa-chevron-down accordion-chevron" style="font-size: 0.7rem; transition: transform 0.2s ease;"></i>
                </summary>
                <div style="display: flex; flex-direction: column; gap: 0.75rem; padding: 0 12px 12px;">
                    <div>
                        <span style="font-size: 0.7rem; color: #6d28d9; font-weight: 800; text-transform: uppercase; display: flex; align-items: center; gap: 4px;"><i class="fa-solid fa-note-sticky"></i> Dispatcher Notes</span>
                        <textarea id="modal-notes-input" class="form-control" rows="2" style="font-size: 0.8rem; margin-top: 3px; resize: none; border-color: #e9d5ff;" placeholder="Enter CRM notes here..."></textarea>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem;">
                        <div>
                            <span style="font-size: 0.7rem; color: #6d28d9; font-weight: 800; text-transform: uppercase;">Lead Stage</span>
                            <select id="modal-stage-select" class="form-control" style="font-size: 0.75rem; font-weight: 700; padding: 4px 6px; height: 32px; border-color: #e9d5ff; margin-top: 3px;">
                                <option value="new">New</option>
                                <option value="contacted">Contacted</option>
                                <option value="followup">Follow-up</option>
                                <option value="won">Booking Confirmed</option>
                                <option value="lost">Cancelled</option>
                                <option value="expired">Missed / Expired</option>
                                <option value="fake">Spam/Fake</option>
                            </select>
                        </div>
                        <div>
                            <span style="font-size: 0.7rem; color: #6d28d9; font-weight: 800; text-transform: uppercase;">Staff Assigned</span>
                            <select id="modal-dispatcher-select" class="form-control" style="font-size: 0.75rem; font-weight: 700; padding: 4px 6px; height: 32px; border-color: #e9d5ff; margin-top: 3px;">
                                <option value="">Unassigned</option>
                                <?php foreach ($allAdminNames as $name): ?>
                                    <option value="<?php echo htmlspecialchars($name); ?>"><?php echo htmlspecialchars($name); ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                    </div>
                    <div>
                        <span style="font-size: 0.7rem; color: #6d28d9; font-weight: 800; text-transform: uppercase; display: flex; align-items: center; gap: 4px;"><i class="fa-regular fa-bell"></i> Follow-up Alarm</span>
                        <div style="display: flex; gap: 4px; align-items: center; margin-top: 3px;">
                            <input type="datetime-local" id="modal-followup-input" class="form-control" style="font-size: 0.75rem; font-weight: 700; padding: 4px 6px; height: 32px; border-color: #e9d5ff;">
                            <button type="button" id="modal-save-followup-btn" class="btn" style="background: #a855f7; color: #fff; height: 32px; padding: 0 10px; font-size: 0.75rem; font-weight: 800; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-floppy-disk"></i> Save</button>
                        </div>
                    </div>
                    <div style="text-align: right; margin-top: 2px;">
                        <button type="button" id="modal-save-crm-btn" class="btn" style="background: #7c3aed; color: #fff; padding: 6px 14px; font-size: 0.78rem; font-weight: 800; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-circle-check"></i> Save CRM Settings</button>
                    </div>
                </div>
            </details>

            <!-- Metadata / Campaigns Collapsible -->
            <details class="details-accordion-slate" style="border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; overflow: hidden;">
                <summary style="font-size: 0.8rem; font-weight: 800; color: #475569; padding: 10px 12px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; user-select: none; outline: none; list-style: none;">
                    <span style="display: flex; align-items: center; gap: 6px;"><i class="fa-solid fa-circle-info"></i> Campaign & System Metadata</span>
                    <i class="fa-solid fa-chevron-down accordion-chevron" style="font-size: 0.7rem; transition: transform 0.2s ease;"></i>
                </summary>
                <div id="modal-metadata-section" style="padding: 0 12px 12px; font-size: 0.75rem; color: #64748b; display: flex; flex-direction: column; gap: 6px;"></div>
            </details>
            <!-- Operational Actions Block -->
            <div style="border-top:1px solid #f1f5f9; padding-top:18px; display:flex; flex-direction:column; gap:10px;">
                <div style="font-size:0.67rem;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:4px;">
                    <i class="fa-solid fa-gears"></i> Operational Actions
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <button id="modal-btn-confirm" type="button" class="action-btn-enhanced btn-confirm">
                        <i class="fa-solid fa-circle-check"></i> Confirm Booking
                    </button>
                    <button id="modal-btn-waiting" type="button" class="action-btn-enhanced btn-wait">
                        <i class="fa-solid fa-hourglass-half"></i> Mark Waiting
                    </button>
                    <a id="modal-btn-customize" href="" class="action-btn-enhanced btn-customize" style="text-decoration:none;">
                        <i class="fa-solid fa-sliders"></i> Customize Fare
                    </a>
                    <button id="modal-btn-delete" type="button" class="action-btn-enhanced btn-spam">
                        <i class="fa-solid fa-ban"></i> Mark Spam / Fake
                    </button>
                    <!-- WA Templates dropdown trigger in modal -->
                    <div class="dropdown-wa" style="grid-column: span 2;">
                        <button type="button" class="action-btn-enhanced btn-manage" onclick="toggleWaDropdown(event, this)" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 4px;"><i class="fa-brands fa-whatsapp" style="color: #25D366;"></i> WhatsApp Templates <i class="fa-solid fa-chevron-down" style="font-size: 0.65rem;"></i></button>
                        <div class="wa-dropdown-menu" style="bottom: auto; top: 100%; margin-top: 6px; margin-bottom: 0; left: 0; right: auto; min-width: 220px;">
                            <a id="modal-wa-quote" href="" target="_blank"><i class="fa-solid fa-calculator" style="color:#6366f1; width:14px;"></i> Send Fare Quote</a>
                            <a id="modal-wa-confirm" href="" target="_blank"><i class="fa-solid fa-circle-check" style="color:#10b981; width:14px;"></i> Send Confirmation</a>
                            <a id="modal-wa-advance" href="" target="_blank"><i class="fa-solid fa-indian-rupee-sign" style="color:#0284c7; width:14px;"></i> Send Ask Advance</a>
                            <a id="modal-wa-followup" href="" target="_blank"><i class="fa-solid fa-reply" style="color:#f59e0b; width:14px;"></i> Send Follow-up</a>
                            <a id="modal-wa-complete" href="" target="_blank"><i class="fa-solid fa-flag-checkered" style="color:#64748b; width:14px;"></i> Send Completion / Review</a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- WhatsApp Template Modal (Enquiries Page) -->
<div id="enq-whatsapp-template-modal" class="admin-modal-backdrop">
    <div class="admin-modal-window" style="max-width:460px;" id="enq-whatsapp-modal-content">
        <!-- Header -->
        <div style="background:linear-gradient(135deg, #15803d 0%, #14532d 60%, #052e16 100%); padding:22px 26px 20px; color:#ffffff; display:flex; justify-content:space-between; align-items:center; position:relative; overflow:hidden;">
            <!-- Decorative circles -->
            <div style="position:absolute;top:-20px;right:30px;width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.06);pointer-events:none;"></div>
            <div style="position:absolute;bottom:-30px;right:-10px;width:100px;height:100px;border-radius:50%;background:rgba(255,255,255,0.04);pointer-events:none;"></div>
            <div style="display:flex; align-items:center; gap:12px; position:relative;">
                <div style="width:44px;height:44px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.2);border-radius:12px;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);">
                    <i class="fa-brands fa-whatsapp" style="font-size:1.5rem; color:#4ade80;"></i>
                </div>
                <div>
                    <div style="font-weight:800; font-size:1.1rem; font-family:'Outfit',sans-serif; letter-spacing:-0.02em; line-height:1.2;">Send WhatsApp</div>
                    <div style="font-size:0.72rem; color:rgba(255,255,255,0.65); font-weight:500; margin-top:2px;">Choose a message template below</div>
                </div>
            </div>
            <button onclick="enqCloseWhatsAppModal()" class="admin-modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <!-- Customer chip -->
        <div style="padding:14px 26px 0;">
            <div style="display:inline-flex; align-items:center; gap:8px; background:#f0fdf4; border:1.5px solid #bbf7d0; border-radius:30px; padding:5px 14px 5px 8px;">
                <div style="width:26px;height:26px;background:linear-gradient(135deg,#16a34a,#14532d);border-radius:50%;display:flex;align-items:center;justify-content:center;">
                    <i class="fa-solid fa-user" style="font-size:0.7rem;color:#fff;"></i>
                </div>
                <span style="font-size:0.8rem; font-weight:700; color:#14532d;">For: <strong id="enq-wa-modal-cust-name" style="color:#166534;"></strong></span>
            </div>
        </div>

        <!-- Body -->
        <div style="padding:16px 26px 24px; display:flex; flex-direction:column; gap:10px;" id="enq-wa-options-container">
            <button type="button" onclick="enqSendWhatsAppTemplate('quote')" class="wa-template-opt-btn" style="animation-delay:0.05s">
                <span class="wa-opt-icon" style="background:linear-gradient(135deg,#dbeafe,#bfdbfe); color:#1d4ed8;"><i class="fa-solid fa-calculator"></i></span>
                <div>
                    <div class="wa-opt-title">Enquiry / Quote</div>
                    <div class="wa-opt-desc">Send estimated fare and travel metrics</div>
                </div>
                <i class="fa-solid fa-chevron-right" style="margin-left:auto;color:#cbd5e1;font-size:0.75rem;flex-shrink:0;"></i>
            </button>
            <button type="button" onclick="enqSendWhatsAppTemplate('confirm')" class="wa-template-opt-btn" style="animation-delay:0.1s">
                <span class="wa-opt-icon" style="background:linear-gradient(135deg,#dcfce7,#bbf7d0); color:#15803d;"><i class="fa-solid fa-circle-check"></i></span>
                <div>
                    <div class="wa-opt-title">Booking Confirmation</div>
                    <div class="wa-opt-desc">Send confirmed itinerary &amp; advance terms</div>
                </div>
                <i class="fa-solid fa-chevron-right" style="margin-left:auto;color:#cbd5e1;font-size:0.75rem;flex-shrink:0;"></i>
            </button>
            <button type="button" onclick="enqSendWhatsAppTemplate('driver')" class="wa-template-opt-btn" style="animation-delay:0.15s">
                <span class="wa-opt-icon" style="background:linear-gradient(135deg,#f3e8ff,#ede9fe); color:#7e22ce;"><i class="fa-solid fa-id-card"></i></span>
                <div>
                    <div class="wa-opt-title">Driver &amp; Cab Details</div>
                    <div class="wa-opt-desc">Send chauffeur contact &amp; plate number</div>
                </div>
                <i class="fa-solid fa-chevron-right" style="margin-left:auto;color:#cbd5e1;font-size:0.75rem;flex-shrink:0;"></i>
            </button>
            <button type="button" onclick="enqSendWhatsAppTemplate('followup')" class="wa-template-opt-btn" style="animation-delay:0.2s">
                <span class="wa-opt-icon" style="background:linear-gradient(135deg,#fffbeb,#fef3c7); color:#b45309;"><i class="fa-solid fa-clock-rotate-left"></i></span>
                <div>
                    <div class="wa-opt-title">Follow-up Alarm</div>
                    <div class="wa-opt-desc">Prompt customer to lock in their rate</div>
                </div>
                <i class="fa-solid fa-chevron-right" style="margin-left:auto;color:#cbd5e1;font-size:0.75rem;flex-shrink:0;"></i>
            </button>
            <button type="button" onclick="enqSendWhatsAppTemplate('cancelled')" class="wa-template-opt-btn" style="animation-delay:0.25s">
                <span class="wa-opt-icon" style="background:linear-gradient(135deg,#fef2f2,#fee2e2); color:#b91c1c;"><i class="fa-solid fa-ban"></i></span>
                <div>
                    <div class="wa-opt-title">Cancellation Notice</div>
                    <div class="wa-opt-desc">Confirm booking cancellation respectfully</div>
                </div>
                <i class="fa-solid fa-chevron-right" style="margin-left:auto;color:#cbd5e1;font-size:0.75rem;flex-shrink:0;"></i>
            </button>
        </div>

        <div id="enq-wa-modal-loader" style="display:none; text-align:center; padding:32px 0 24px;">
            <div class="wa-modal-spinner"></div>
            <div style="font-size:0.78rem; color:#64748b; font-weight:700; margin-top:10px; font-family:'Outfit',sans-serif;">Generating template…</div>
        </div>
    </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
    window.markLeadTouched = function(id) {
        const formData = new FormData();
        formData.append('action', 'mark_touched');
        formData.append('id', id);
        fetch('enquiries', { method: 'POST', body: formData }).catch(console.error);
    };

    window.saveDispatcherNote = function(input) {
        const id = input.getAttribute('data-id');
        const val = input.value;
        const formData = new FormData();
        formData.append('action', 'save_lead_note');
        formData.append('id', id);
        formData.append('dispatcher_notes', val);
        
        input.style.borderColor = '#a855f7';
        
        fetch('enquiries', {
            method: 'POST',
            body: formData,
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                input.style.borderColor = '#22c55e';
                setTimeout(() => { input.style.borderColor = '#cbd5e1'; }, 1000);
            } else {
                input.style.borderColor = '#ef4444';
                alert('Failed to save note: ' + data.error);
            }
        })
        .catch(err => {
            console.error('Notes Save Error:', err);
            input.style.borderColor = '#ef4444';
        });
    };

    window.saveDispatcherFollowup = function(input) {
        const id = input.getAttribute('data-id');
        const val = input.value;
        const formData = new FormData();
        formData.append('action', 'save_lead_followup');
        formData.append('id', id);
        formData.append('followup_time', val);
        
        input.style.borderColor = '#a855f7';
        
        fetch('enquiries', {
            method: 'POST',
            body: formData,
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                input.style.borderColor = '#22c55e';
                setTimeout(() => { input.style.borderColor = '#cbd5e1'; }, 1000);
            } else {
                input.style.borderColor = '#ef4444';
                alert('Failed to save follow-up time: ' + data.error);
            }
        })
        .catch(err => {
            console.error('Follow-up Save Error:', err);
            input.style.borderColor = '#ef4444';
        });
    };

    window.saveLeadStage = function(select) {
        const id = select.getAttribute('data-id');
        const val = select.value;
        const formData = new FormData();
        formData.append('action', 'save_lead_stage');
        formData.append('id', id);
        formData.append('lead_stage', val);
        
        select.style.borderColor = '#a855f7';
        
        fetch('enquiries', {
            method: 'POST',
            body: formData,
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                select.style.borderColor = '#22c55e';
                setTimeout(() => { select.style.borderColor = '#cbd5e1'; }, 1000);
            } else {
                select.style.borderColor = '#ef4444';
                alert('Failed to save stage: ' + data.error);
            }
        })
        .catch(err => {
            console.error('Stage Save Error:', err);
            select.style.borderColor = '#ef4444';
        });
    };

    window.saveLeadDispatcher = function(select) {
        const id = select.getAttribute('data-id');
        const val = select.value;
        const formData = new FormData();
        formData.append('action', 'save_lead_dispatcher');
        formData.append('id', id);
        formData.append('assigned_dispatcher', val);
        
        select.style.borderColor = '#a855f7';
        
        fetch('enquiries', {
            method: 'POST',
            body: formData,
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                select.style.borderColor = '#22c55e';
                setTimeout(() => { select.style.borderColor = '#cbd5e1'; }, 1000);
            } else {
                select.style.borderColor = '#ef4444';
                alert('Failed to save dispatcher: ' + data.error);
            }
        })
        .catch(err => {
            console.error('Dispatcher Save Error:', err);
            select.style.borderColor = '#ef4444';
        });
    };

    // Unified AJAX Filtering Logic
    window.loadEnquiriesDynamic = function(url) {
        const container = document.getElementById('ajax-table-container');
        if (!container) return;
        
        container.style.opacity = '0.5';
        
        fetch(url)
            .then(response => response.text())
            .then(html => {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                
                const newTable = doc.getElementById('ajax-table-container');
                if (newTable) {
                    container.innerHTML = newTable.innerHTML;
                }
                
                const oldTabbar = document.querySelector('.lead-tabbar');
                const newTabbar = doc.querySelector('.lead-tabbar');
                if (oldTabbar && newTabbar) {
                    oldTabbar.innerHTML = newTabbar.innerHTML;
                }
                
                const oldFilterPanel = document.querySelector('.crm-filter-panel');
                const newFilterPanel = doc.querySelector('.crm-filter-panel');
                if (oldFilterPanel && newFilterPanel) {
                    oldFilterPanel.innerHTML = newFilterPanel.innerHTML;
                }
                
                container.style.opacity = '1';
                history.pushState(null, '', url);
                initDynamicListeners();
            })
            .catch(err => {
                console.error('AJAX Load Failed:', err);
                window.location.href = url;
            });
    };

    window.triggerFilterSubmit = function() {
        const form = document.querySelector('.crm-filter-form');
        if (!form) return;
        
        const searchInput = document.getElementById('enquiry-search-input');
        const searchVal = searchInput ? searchInput.value : '';
        
        const formData = new FormData(form);
        const params = new URLSearchParams();
        
        for (const [key, val] of formData.entries()) {
            if (val !== '') {
                params.set(key, val);
            }
        }
        
        if (searchVal !== '') {
            params.set('search', searchVal);
        }
        
        loadEnquiriesDynamic('enquiries?' + params.toString());
    };

    window.handleDateFilterChange = function(selectEl) {
        const customRange = document.getElementById('enquiries-custom-range');
        if (selectEl.value === 'custom') {
            if (customRange) customRange.style.display = 'flex';
        } else {
            if (customRange) customRange.style.display = 'none';
            triggerFilterSubmit();
        }
    };

    window.resetEnquiriesFilters = function() {
        const form = document.querySelector('.crm-filter-form');
        if (!form) return;
        
        const dateSel = form.querySelector('select[name="date_filter"]');
        if (dateSel) dateSel.value = 'all';
        
        const startInput = document.getElementById('enquiries-start-date');
        if (startInput) startInput.value = '';
        
        const endInput = document.getElementById('enquiries-end-date');
        if (endInput) endInput.value = '';
        
        const staffSel = form.querySelector('select[name="dispatcher"]');
        if (staffSel) staffSel.value = '';
        
        const sortSel = form.querySelector('select[name="sort"]');
        if (sortSel) sortSel.value = 'newest';
        
        const searchInput = document.getElementById('enquiry-search-input');
        if (searchInput) searchInput.value = '';
        
        triggerFilterSubmit();
    };

    window.submitBulkEnquiryAction = function(actionType) {
        const checkBoxes = document.querySelectorAll('.enquiry-checkbox:checked');
        if (checkBoxes.length === 0) return;
        
        const ids = Array.from(checkBoxes).map(cb => cb.value);
        const formData = new FormData();
        formData.append('bulk_action', actionType);
        ids.forEach(id => formData.append('selected_ids[]', id));
        
        document.getElementById('ajax-table-container').style.opacity = '0.5';
        
        fetch('enquiries', {
            method: 'POST',
            body: formData,
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                loadEnquiriesDynamic(window.location.href);
            } else {
                alert('Bulk action failed: ' + data.error);
                document.getElementById('ajax-table-container').style.opacity = '1';
            }
        })
        .catch(err => {
            console.error('Bulk Action error:', err);
            document.getElementById('ajax-table-container').style.opacity = '1';
        });
    };

    function initDynamicListeners() {
        document.querySelectorAll('.lead-tabbar .lead-tab').forEach(tab => {
            tab.addEventListener('click', function(e) {
                e.preventDefault();
                loadEnquiriesDynamic(this.href);
            });
        });
        
        document.querySelectorAll('.pagination-link').forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                loadEnquiriesDynamic(this.href);
            });
        });
        
        const searchForm = document.getElementById('enquiry-search-form');
        if (searchForm) {
            const hiddenStatus = searchForm.querySelector('input[name="status"]');
            if (hiddenStatus) hiddenStatus.remove();
            
            searchForm.addEventListener('submit', function(e) {
                e.preventDefault();
                triggerFilterSubmit();
            });
        }
        
        const selectAllBar = document.getElementById('select-all-bar');
        if (selectAllBar && !selectAllBar.dataset.bound) {
            selectAllBar.dataset.bound = '1';
            selectAllBar.addEventListener('change', function() {
                document.querySelectorAll('.enquiry-checkbox').forEach(cb => cb.checked = selectAllBar.checked);
                updateBulkBar();
            });
        }
        
        document.querySelectorAll('.enquiry-checkbox').forEach(cb => {
            if (cb.dataset.bound) return;
            cb.dataset.bound = '1';
            cb.addEventListener('change', updateBulkBar);
        });
        
        updateBulkBar();
    }

    const bulkBar = document.getElementById('bulk-actions-bar');
    const countDisplay = document.getElementById('selected-count');

    function updateBulkBar() {
        const currentCheckboxes = document.querySelectorAll('.enquiry-checkbox');
        const checkedCount = document.querySelectorAll('.enquiry-checkbox:checked').length;
        const allChecked = checkedCount === currentCheckboxes.length && currentCheckboxes.length > 0;
        const anyChecked = checkedCount > 0 && checkedCount < currentCheckboxes.length;

        if (bulkBar) {
            if (checkedCount > 0) {
                bulkBar.style.display = 'flex';
                countDisplay.textContent = checkedCount;
            } else {
                bulkBar.style.display = 'none';
            }
        }
        
        const selectAllBar = document.getElementById('select-all-bar');
        if (selectAllBar) {
            selectAllBar.checked = allChecked;
            selectAllBar.indeterminate = anyChecked;
        }
    }

    // Modal Operations JS
    window.closeLeadDetailsModal = function() {
        const modal = document.getElementById('lead-details-modal');
        modal.classList.remove('modal-visible');
        setTimeout(function() {
            modal.style.display = 'none';
        }, 250);
        document.body.style.overflow = '';
    };
    window.closeEnquiryDetailsModal = window.closeLeadDetailsModal;

    window.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeLeadDetailsModal();
        }
    });

    // Format date only (without time) helper
    function formatDateStrOnly(dateStr) {
        if (!dateStr) return '--';
        const d = new Date(dateStr.replace(/-/g, "/"));
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    window.copyBookingId = function(text, el) {
        var copyText = function() {
            if (navigator.clipboard) {
                return navigator.clipboard.writeText(text);
            } else {
                var temp = document.createElement('textarea');
                temp.value = text;
                document.body.appendChild(temp);
                temp.select();
                document.execCommand('copy');
                document.body.removeChild(temp);
                return Promise.resolve();
            }
        };
        copyText().then(function() {
            var originalHTML = el.innerHTML;
            el.innerHTML = 'Copied! <i class="fa-solid fa-check" style="color:#10b981;"></i>';
            el.style.color = '#10b981';
            setTimeout(function() {
                el.innerHTML = originalHTML;
                el.style.color = '#4f46e5';
            }, 1000);
        });
    };

    function doLeadAction(action, id, msg) {
        if (!confirm(msg)) return;
        closeLeadDetailsModal();
        window.location.href = `enquiries?action=${action}&id=${id}`;
    }

    window.openEnquiryDetails = function(lead) {
        if (!lead) return;
        const modal = document.getElementById('lead-details-modal');

        let bookingRef = lead.booking_id || '';
        if (bookingRef === '') {
            const isConfirmed = lead.status === 'confirmed';
            const createdDate = new Date(lead.created_at ? lead.created_at.replace(/-/g, "/") : Date.now());
            const m = String(createdDate.getMonth() + 1).padStart(2, '0');
            const d = String(createdDate.getDate()).padStart(2, '0');
            const prefix = isConfirmed ? 'C' : 'E';
            bookingRef = prefix + m + d + String(lead.id).padStart(4, '0');
        }
        document.getElementById('modal-lead-ref').innerText = '#' + bookingRef;

        // Unified Status Badge Mapping
        var bStatus = (lead.status || '').toLowerCase().trim();
        var tier = lead.lead_tier || lead.customer_tier || 'new';

        var statusText = '';
        var statusBg = '';
        var statusColor = '';
        var statusBorder = '';

        if (bStatus === 'fake') {
            statusText = 'Spam';
            statusBg = '#fee2e2';
            statusColor = '#b91c1c';
            statusBorder = '1px solid #fca5a5';
        } else if (bStatus === 'cancelled') {
            statusText = 'Cancelled booking';
            statusBg = '#f1f5f9';
            statusColor = '#475569';
            statusBorder = '1px solid #cbd5e1';
        } else if (bStatus === 'confirmed') {
            statusText = 'Confirmed booking';
            statusBg = '#d1fae5';
            statusColor = '#047857';
            statusBorder = '1px solid #a7f3d0';
        } else if (bStatus === 'pending') {
            statusText = 'Waiting for Confirmation';
            statusBg = '#fef3c7';
            statusColor = '#d97706';
            statusBorder = '1px solid #fde68a';
        } else {
            // Enquiry status
            if (tier === 'repeated' || tier === 'regular') {
                statusText = 'Repeated Enquiry';
                statusBg = '#eff6ff';
                statusColor = '#1d4ed8';
                statusBorder = '1px solid #bfdbfe';
            } else {
                statusText = 'New Enquiry';
                statusBg = '#e0e7ff';
                statusColor = '#4f46e5';
                statusBorder = '1px solid #c7d2fe';
            }
        }

        var badgeEl = document.getElementById('modal-lead-status-badge');
        badgeEl.innerText = statusText.toUpperCase();
        badgeEl.style.background = statusBg;
        badgeEl.style.color = statusColor;
        badgeEl.style.border = statusBorder;

        // Route Timeline Visualizer with Intermediate Stops
        var stops = [];
        try {
            var fb = JSON.parse(lead.fare_breakdown || '{}');
            if (fb && Array.isArray(fb.stops)) {
                stops = fb.stops.filter(function(s) { return s && s.trim() !== ''; });
            }
        } catch (e) {
            console.error('Failed to parse fare_breakdown for stops:', e);
        }

        var routeContainer = document.getElementById('modal-route-visualizer');
        if (routeContainer) {
            var rHtml = '<div class="route-line-connector"></div>';
            
            // Pickup Node
            rHtml += '<div class="route-node pickup-node">' +
                     '    <div class="node-icon"><i class="fa-solid fa-circle-dot"></i></div>' +
                     '    <div class="node-details">' +
                     '        <span class="node-label">Pickup</span>' +
                     '        <strong class="node-address">' + (lead.pickup || '-') + '</strong>' +
                     '    </div>' +
                     '</div>';
            
            // Stops Nodes (Intermediate)
            if (stops.length > 0) {
                stops.forEach(function(stop, idx) {
                    rHtml += '<div class="route-node stop-node">' +
                             '    <div class="node-icon" style="background: linear-gradient(135deg, #eff6ff, #dbeafe); color: #2563eb; border: 2px solid #bfdbfe; box-shadow: 0 2px 8px rgba(37,99,235,0.15); width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; flex-shrink: 0;"><i class="fa-solid fa-map-pin" style="font-size: 0.8rem;"></i></div>' +
                             '    <div class="node-details">' +
                             '        <span class="node-label">Stop ' + (idx + 1) + '</span>' +
                             '        <strong class="node-address" style="color: #475569; font-weight: 600;">' + stop + '</strong>' +
                             '    </div>' +
                             '</div>';
                });
            }
            
            // Drop Node
            rHtml += '<div class="route-node drop-node">' +
                     '    <div class="node-icon"><i class="fa-solid fa-location-dot"></i></div>' +
                     '    <div class="node-details">' +
                     '        <span class="node-label">Drop-off</span>' +
                     '        <strong class="node-address">' + (lead.drop_location || '-') + '</strong>' +
                     '    </div>' +
                     '</div>';
            
            routeContainer.innerHTML = rHtml;
        }

        // Journey Parameters
        var dateStr = lead.travel_date ? formatDateStrOnly(lead.travel_date) : '--';
        var timeStr = lead.travel_time ? formatTimeStr(lead.travel_time) : '--';
        document.getElementById('modal-pickup-schedule').innerText = dateStr + ' @ ' + timeStr;

        var tripTypeDisplay = (lead.trip_type || '').toUpperCase().replace('_', ' ');
        if (tripTypeDisplay === 'ONE_WAY' || tripTypeDisplay === 'ONEWAY') {
            tripTypeDisplay = 'One Way';
        } else if (tripTypeDisplay === 'ROUND_TRIP' || tripTypeDisplay === 'ROUND' || tripTypeDisplay === 'ROUNDTRIP') {
            tripTypeDisplay = 'Round Trip';
        }
        var vehicleDisplay = lead.vehicle_type ? (lead.vehicle_type.charAt(0).toUpperCase() + lead.vehicle_type.slice(1).toLowerCase()) : 'Not Prefered';
        document.getElementById('modal-trip-vehicle').innerText = tripTypeDisplay + ' | ' + vehicleDisplay;

        document.getElementById('modal-recd-time').innerText = lead.created_at ? formatDateStr(lead.created_at) : 'N/A';

        document.getElementById('modal-fare-info').innerHTML = '₹' + Number(lead.fare_estimate || 0).toLocaleString('en-IN') + ' <span style="font-size:0.7rem; color:#64748b; font-weight:600; text-transform:uppercase;">(' + (lead.fare_type || 'exclusive') + ')</span>';

        // Extras
        let extrasHtml = '';
        if (Number(lead.include_gst) === 1) {
            const gstPct = parseFloat(lead.gst_percent || 0);
            extrasHtml += `<span style="display:inline-flex; align-items:center; gap:4px; font-size:0.7rem; font-weight:800; color:#92400e; background:#fffbeb; border:1px solid #fde68a; padding:2px 8px; border-radius:6px;">+GST ${gstPct}%</span>`;
        }
        if (lead.used_referral_code) {
            extrasHtml += `<span style="display:inline-flex; align-items:center; gap:4px; font-size:0.7rem; font-weight:800; color:#9333ea; background:#faf5ff; border:1px solid #e9d5ff; padding:2px 8px; border-radius:6px;"><i class="fa-solid fa-gift"></i> ${lead.used_referral_code}</span>`;
        }
        document.getElementById('modal-extra-details').innerHTML = extrasHtml;

        // Customer Profile
        document.getElementById('modal-cust-name').innerText = lead.name || 'Guest';
        document.getElementById('modal-cust-phone').innerText = lead.phone || 'N/A';
        document.getElementById('modal-call-link').href = 'tel:' + (lead.phone || '');
        document.getElementById('modal-call-link').onclick = function() {
            markLeadTouched(lead.id);
        };
        // WA profile button sends enquiry/template directly based on lead status
        document.getElementById('modal-wa-link').onclick = function() {
            var type = getWaTemplateType(lead.status, 'enquiry');
            sendWhatsAppTemplate(lead.id, type, 'enquiry');
        };

        // WhatsApp Templates Trigger (dropdown links still work too)
        document.getElementById('modal-wa-quote').onclick = function(e) { e.preventDefault(); sendWhatsAppTemplate(lead.id, 'quote', 'enquiry'); };
        document.getElementById('modal-wa-confirm').onclick = function(e) { e.preventDefault(); sendWhatsAppTemplate(lead.id, 'confirm', 'enquiry'); };
        document.getElementById('modal-wa-advance').onclick = function(e) { e.preventDefault(); sendWhatsAppTemplate(lead.id, 'ask_advance', 'enquiry'); };
        document.getElementById('modal-wa-followup').onclick = function(e) { e.preventDefault(); sendWhatsAppTemplate(lead.id, 'followup', 'enquiry'); };
        document.getElementById('modal-wa-complete').onclick = function(e) { e.preventDefault(); sendWhatsAppTemplate(lead.id, 'complete', 'enquiry'); };

        // CRM settings
        document.getElementById('modal-notes-input').value = lead.dispatcher_notes || '';
        document.getElementById('modal-notes-input').setAttribute('data-id', lead.id);

        document.getElementById('modal-stage-select').value = lead.lead_stage || 'new';
        document.getElementById('modal-stage-select').setAttribute('data-id', lead.id);

        document.getElementById('modal-dispatcher-select').value = lead.assigned_dispatcher || '';
        document.getElementById('modal-dispatcher-select').setAttribute('data-id', lead.id);

        let followupVal = '';
        if (lead.followup_time) {
            followupVal = lead.followup_time.replace(' ', 'T').slice(0, 16);
        }
        document.getElementById('modal-followup-input').value = followupVal;
        document.getElementById('modal-followup-input').setAttribute('data-id', lead.id);

        // Metadata
        let metaHtml = '';
        metaHtml += `<div style="display:flex; justify-content:space-between; margin-bottom:4px;"><strong>Lead Source:</strong> <span>${getLeadSourceLabel(lead)}</span></div>`;
        metaHtml += `<div style="display:flex; justify-content:space-between; margin-bottom:4px;"><strong>IP Address:</strong> <span>${lead.ip_address || '-'}</span></div>`;
        metaHtml += `<div style="display:flex; justify-content:space-between; margin-bottom:4px;"><strong>Source Page:</strong> <span>${lead.source_page || '-'}</span></div>`;
        metaHtml += `<div style="display:flex; justify-content:space-between;"><strong>Created At:</strong> <span>${lead.created_at ? formatDateStr(lead.created_at) : '-'}</span></div>`;
        document.getElementById('modal-metadata-section').innerHTML = metaHtml;

        // Button URLs & Actions
        document.getElementById('modal-btn-customize').href = `customize-booking?id=${lead.id}&source=enquiry`;
        
        document.getElementById('modal-btn-confirm').onclick = function() {
            doLeadAction('confirm', lead.id, 'Confirm booking?');
        };
        document.getElementById('modal-btn-waiting').onclick = function() {
            doLeadAction('waiting', lead.id, 'Move to Waiting?');
        };
        document.getElementById('modal-btn-delete').onclick = function() {
            doLeadAction('fake', lead.id, 'Mark this lead as Spam/Fake?');
        };

        const isConfirmed = lead.status === 'confirmed';
        if (isConfirmed) {
            document.getElementById('modal-btn-confirm').style.display = 'none';
            document.getElementById('modal-btn-waiting').style.display = 'none';
        } else {
            document.getElementById('modal-btn-confirm').style.display = 'flex';
            document.getElementById('modal-btn-waiting').style.display = 'flex';
        }

        // Move to body to escape any stacking-context ancestors
        if (modal.parentElement !== document.body) {
            document.body.appendChild(modal);
            modal.onclick = function(e) {
                if (e.target === modal) closeLeadDetailsModal();
            };
        }

        modal.style.display = 'flex';
        modal.offsetHeight; // force reflow
        modal.classList.add('modal-visible');
        document.body.style.overflow = 'hidden';
        markLeadTouched(lead.id);
    };

    // Save CRM actions
    document.getElementById('modal-save-crm-btn').onclick = function() {
        const notesInput = document.getElementById('modal-notes-input');
        const stageSelect = document.getElementById('modal-stage-select');
        const dispatcherSelect = document.getElementById('modal-dispatcher-select');
        
        saveDispatcherNote(notesInput);
        saveLeadStage(stageSelect);
        saveLeadDispatcher(dispatcherSelect);
        
        setTimeout(() => { triggerFilterSubmit(); }, 500);
    };

    document.getElementById('modal-save-followup-btn').onclick = function() {
        const followupInput = document.getElementById('modal-followup-input');
        saveDispatcherFollowup(followupInput);
        setTimeout(() => { triggerFilterSubmit(); }, 500);
    };

    // ---- Enquiries-page WhatsApp Template Modal ----
    var enqActiveWaId = null;
    var enqActiveWaName = null;
    var enqActiveWaRecordType = null;

    window.enqOpenWhatsAppModal = function(id, name, recordType) {
        enqActiveWaId = id;
        enqActiveWaName = name;
        enqActiveWaRecordType = recordType || 'enquiry';
        document.getElementById('enq-wa-modal-cust-name').textContent = name;
        document.getElementById('enq-wa-options-container').style.display = 'flex';
        document.getElementById('enq-wa-modal-loader').style.display = 'none';

        var modal = document.getElementById('enq-whatsapp-template-modal');
        if (modal.parentElement !== document.body) {
            document.body.appendChild(modal);
            modal.addEventListener('click', function(e) {
                if (e.target === modal) enqCloseWhatsAppModal();
            });
        }
        modal.scrollTop = 0;
        modal.style.display = 'flex';
        modal.offsetHeight;
        modal.classList.add('modal-visible');
        document.body.style.overflow = 'hidden';
    };

    window.enqCloseWhatsAppModal = function() {
        var modal = document.getElementById('enq-whatsapp-template-modal');
        modal.classList.remove('modal-visible');
        setTimeout(function() { modal.style.display = 'none'; }, 250);
        document.body.style.overflow = '';
    };

    function getWaTemplateType(status, recordType) {
        var stat = (status || '').toLowerCase().trim();
        if (stat === 'confirmed' || stat === 'completed') {
            return 'confirm';
        } else if (stat === 'cancelled') {
            return 'cancelled';
        } else if (stat === 'pending') {
            return 'followup';
        } else if (recordType === 'enquiry') {
            return 'quote';
        } else {
            return 'quote';
        }
    }

    window.enqSendWhatsAppTemplate = function(type) {
        if (!enqActiveWaId) return;
        document.getElementById('enq-wa-options-container').style.display = 'none';
        document.getElementById('enq-wa-modal-loader').style.display = 'block';

        fetch('/admin/dashboard?action=get_wa_template&type=' + type + '&id=' + enqActiveWaId + '&record_type=' + enqActiveWaRecordType)
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.success) {
                    var url = 'https://wa.me/' + data.phone + '?text=' + encodeURIComponent(data.template);
                    window.open(url, '_blank');
                    enqCloseWhatsAppModal();
                    markLeadTouched(enqActiveWaId);
                    setTimeout(function() { triggerFilterSubmit(); }, 500);
                } else {
                    alert('Error generating template: ' + (data.error || 'Unknown error'));
                    document.getElementById('enq-wa-options-container').style.display = 'flex';
                    document.getElementById('enq-wa-modal-loader').style.display = 'none';
                }
            })
            .catch(function(err) {
                console.error(err);
                alert('Failed to connect to template generator.');
                document.getElementById('enq-wa-options-container').style.display = 'flex';
                document.getElementById('enq-wa-modal-loader').style.display = 'none';
            });
    };

    // Dynamic WA Fetch (for dropdown links inside modal actions)
    window.sendWhatsAppTemplate = function(id, type, recordType) {
        fetch(`/admin/dashboard?action=get_wa_template&id=${id}&type=${type}&record_type=${recordType}`)
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    const url = `https://wa.me/${data.phone}?text=${encodeURIComponent(data.template)}`;
                    window.open(url, '_blank');
                    if (recordType === 'enquiry') {
                        markLeadTouched(id);
                        setTimeout(() => { triggerFilterSubmit(); }, 500);
                    }
                } else {
                    alert('Failed to get template: ' + data.error);
                }
            })
            .catch(err => {
                console.error(err);
                alert('Error loading WhatsApp template.');
            });
    };

    // Helpers
    function getStatusBadgeHtml(status, respondedBy) {
        status = (status || '').toLowerCase().trim();
        respondedBy = (respondedBy || '').trim();
        
        let badgeClass = 'bg-secondary';
        let icon = 'fa-question-circle';
        let label = status.charAt(0).toUpperCase() + status.slice(1);
        
        if (status === 'enquiry') {
            badgeClass = 'bg-warning';
            icon = 'fa-inbox';
            label = 'New Lead';
        } else if (status === 'pending') {
            if (respondedBy !== '') {
                badgeClass = 'bg-warning';
                icon = 'fa-hourglass-half';
                label = 'Waiting';
            } else {
                badgeClass = 'bg-primary';
                icon = 'fa-circle-check';
                label = 'Pending Confirmation';
            }
        } else if (status === 'confirmed') {
            badgeClass = 'bg-primary';
            icon = 'fa-circle-check';
        } else if (status === 'fake') {
            badgeClass = 'bg-danger';
            icon = 'fa-user-slash';
            label = 'Spam';
        } else if (status === 'completed') {
            badgeClass = 'bg-success';
            icon = 'fa-check-double';
        } else if (status === 'cancelled') {
            badgeClass = 'bg-danger';
            icon = 'fa-xmark';
        }
        
        return `<span class="badge ${badgeClass}"><i class="fa-solid ${icon}" style="font-size: 0.65rem; opacity: 0.8;"></i> ${label}</span>`;
    }

    function getLeadTierBadgeHtml(tier) {
        const styles = {
            'new':      { bg: '#fffbeb', color: '#d97706', border: '#fde68a', icon: 'fa-inbox',             text: 'New' },
            'repeated': { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe', icon: 'fa-clock-rotate-left', text: 'Repeated' },
            'regular':  { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0', icon: 'fa-star',              text: 'Regular' }
        };
        const s = styles[tier] || styles['new'];
        return `<span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 5px; background-color: ${s.bg}; color: ${s.color}; border: 1px solid ${s.border}; font-size: 0.7rem; font-weight: 850; line-height: 1; vertical-align: middle; white-space: nowrap; flex-shrink: 0;" title="${s.text} Customer"><i class="fa-solid ${s.icon}" style="font-size: 0.65rem; opacity: 0.95;"></i> ${s.text}</span>`;
    }

    function getLeadSourceLabel(lead) {
        const source = (lead.source || '').toLowerCase().trim();
        const utmSrc = (lead.utm_source || '').toLowerCase().trim();
        const utmMed = (lead.utm_medium || '').toLowerCase().trim();
        const gclid = (lead.gclid || '').trim();
        const refCode = (lead.used_referral_code || '').trim();
        
        if (gclid !== '' || source === 'google_ads' || (utmSrc === 'google' && ['cpc','ppc','paid'].includes(utmMed))) {
            return 'Google Ads';
        }
        if (utmSrc === 'google' || (source === 'organic' && utmSrc === '')) {
            return 'Google SEO';
        }
        if (['facebook', 'fb'].includes(utmSrc) && ['cpc','ppc','paid'].includes(utmMed)) {
            return 'Facebook Ads';
        }
        if (['facebook', 'fb'].includes(utmSrc)) {
            return 'Facebook';
        }
        if (utmSrc === 'instagram' || source === 'instagram') {
            return 'Instagram';
        }
        if (source === 'whatsapp' || utmSrc === 'whatsapp') {
            return 'WhatsApp';
        }
        if (refCode !== '' || utmMed === 'referral' || source === 'referral') {
            return 'Referral';
        }
        if (utmMed === 'email' || utmSrc === 'email' || source === 'email') {
            return 'Email';
        }
        if (utmSrc !== '') {
            return utmSrc.charAt(0).toUpperCase() + utmSrc.slice(1);
        }
        return 'Direct';
    }

    function formatDateStr(dateStr) {
        if (!dateStr) return 'N/A';
        const d = new Date(dateStr.replace(/-/g, "/"));
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    }

    function formatTimeStr(timeStr) {
        if (!timeStr) return 'N/A';
        const parts = timeStr.split(':');
        if (parts.length >= 2) {
            let h = parseInt(parts[0], 10);
            const m = parts[1];
            const ampm = h >= 12 ? 'PM' : 'AM';
            h = h % 12;
            h = h ? h : 12;
            return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
        }
        return timeStr;
    }

    // Backdrop click close
    const leadDetailsModal = document.getElementById('lead-details-modal');
    if (leadDetailsModal) {
        leadDetailsModal.onclick = function(e) {
            if (e.target === leadDetailsModal) closeLeadDetailsModal();
        };
    }

    window.toggleWaDropdown = function(e, btn) {
        e.stopPropagation();
        
        let menu = btn._waMenu;
        if (!menu) {
            menu = btn.nextElementSibling;
            if (menu && menu.classList.contains('wa-dropdown-menu')) {
                btn._waMenu = menu;
                menu._triggerButton = btn;
            }
        }
        
        if (!menu) return;
        
        const isVisible = menu.style.display === 'block';
        
        closeAllWaDropdowns();
        
        if (!isVisible) {
            menu._originalParent = menu.parentNode;
            menu._originalNextSibling = menu.nextSibling;
            document.body.appendChild(menu);
            
            menu.style.display = 'block';
            positionWaDropdown(btn, menu);
        }
    };

    function positionWaDropdown(btn, menu) {
        const btnRect = btn.getBoundingClientRect();
        
        // Dynamically lock dropdown width to matches trigger button's width
        menu.style.width = btnRect.width + 'px';
        
        const menuWidth = menu.offsetWidth || btnRect.width;
        const menuHeight = menu.offsetHeight || 200;
        
        let top = btnRect.bottom + window.scrollY + 6;
        if (window.innerHeight - btnRect.bottom < menuHeight + 10 && btnRect.top > menuHeight + 10) {
            top = btnRect.top + window.scrollY - menuHeight - 6;
        }
        
        let left = btnRect.right + window.scrollX - menuWidth;
        if (left < 10) {
            left = btnRect.left + window.scrollX;
        }
        
        if (left + menuWidth > window.innerWidth - 10) {
            left = Math.max(10, window.innerWidth - menuWidth - 10);
        }
        
        menu.style.position = 'absolute';
        menu.style.top = top + 'px';
        menu.style.left = left + 'px';
        menu.style.right = 'auto';
        menu.style.bottom = 'auto';
        menu.style.margin = '0';
        menu.style.transform = 'none';
    }

    function closeAllWaDropdowns() {
        document.querySelectorAll('.wa-dropdown-menu').forEach(menu => {
            menu.style.display = 'none';
            menu.style.transform = '';
            menu.style.width = '';
            if (menu._originalParent && menu.parentNode === document.body) {
                menu._originalParent.insertBefore(menu, menu._originalNextSibling);
            }
        });
    }

    document.addEventListener('click', closeAllWaDropdowns);
    window.addEventListener('resize', closeAllWaDropdowns);
    window.addEventListener('scroll', closeAllWaDropdowns, { capture: true });

    initDynamicListeners();
});
</script>

<script>
(function () {
    var input = document.getElementById('enquiry-search-input');
    var box   = document.getElementById('search-suggestions');
    var form  = document.getElementById('enquiry-search-form');
    if (!input || !box) return;

    var allLeads = <?php echo json_encode($suggestionsList, JSON_HEX_TAG | JSON_HEX_AMP); ?>;

    input.addEventListener('input', function () {
        var val = this.value.trim().toLowerCase();
        if (!val) {
            box.style.display = 'none';
            return;
        }
        var matches = allLeads.filter(function (l) {
            return (l.name || '').toLowerCase().includes(val) ||
                   (l.phone || '').toLowerCase().includes(val) ||
                   (l.pickup || '').toLowerCase().includes(val) ||
                   (l.drop_location || '').toLowerCase().includes(val);
        }).slice(0, 10);

        if (!matches.length) {
            box.style.display = 'none';
            return;
        }

        box.innerHTML = '';
        matches.forEach(function (l) {
            var d = document.createElement('div');
            d.style.cssText = 'padding:10px 14px; border-bottom:1px solid #f1f5f9; cursor:pointer; font-size:0.82rem; font-weight:600; color:#334155;';
            d.innerHTML = '<span style="color:#6366f1;">' + (l.name || 'Guest') + '</span> (' + l.phone + ') <span style="color:#94a3b8; font-size:0.75rem;">➔ ' + (l.drop_location || 'N/A') + '</span>';
            d.addEventListener('click', function () {
                input.value = l.phone;
                box.style.display = 'none';
                if (form) form.submit();
            });
            box.appendChild(d);
        });
        box.style.display = 'block';
    });

    document.addEventListener('click', function (e) {
        if (!e.target.closest('#enquiry-search-form')) {
            box.style.display = 'none';
        }
    });
})();
</script>
