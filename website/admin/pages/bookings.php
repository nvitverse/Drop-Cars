<?php
/**
 * Admin Bookings List Page - Refined UI
 */

require_once __DIR__ . '/../includes/google-sheets-status-sync.php';
require_once __DIR__ . '/../includes/blocked-ips-schema.php';
require_once __DIR__ . '/../../api/includes/regular-customer.php';

// Handle inline actions
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['mark_completed_id'])) {
    $cId = (int) $_POST['mark_completed_id'];
    if ($cId > 0 && isset($pdo)) {
        $chk = $pdo->prepare('SELECT `driver_name`, `driver_phone`, `car_name`, `car_number` FROM `bookings` WHERE `id` = ? LIMIT 1');
        $chk->execute([$cId]);
        $row = $chk->fetch(PDO::FETCH_ASSOC);
        if ($row && dropcars_booking_assignment_complete($row)) {
            $responder = $_SESSION['admin_name'] ?? 'Admin';
            $pdo->prepare("UPDATE `bookings` SET `status` = 'completed', `responded_by` = ? WHERE `id` = ?")->execute([$responder, $cId]);
            require_once __DIR__ . '/../../includes/notification-engine.php';
            dropcars_dispatch_notifications($pdo, $cId, 'completed');
            require_once __DIR__ . '/../includes/enquiries-schema.php';
            dropcars_process_referral_credit($pdo, $cId, 'completed');
            $syncStmt = $pdo->prepare("SELECT b.*, c.name AS customer_name, c.phone AS customer_phone FROM `bookings` b JOIN `customers` c ON b.customer_id = c.id WHERE b.id = ?");
            $syncStmt->execute([$cId]);
            $syncRow = $syncStmt->fetch(PDO::FETCH_ASSOC);
            if ($syncRow) {
                dropcars_admin_sync_booking_status_row($syncRow, 'completed');
            }
            header('Location: ' . admin_url('bookings', ['status' => 'completed', 'msg' => 'marked_completed']));
        } else {
            header('Location: ' . admin_url('bookings', ['msg' => 'need_assignment', 'bid' => $cId]));
        }
    } else {
        header('Location: ' . admin_url('bookings'));
    }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['mark_cancelled_id'])) {
    $cId = (int) $_POST['mark_cancelled_id'];
    if ($cId > 0 && isset($pdo)) {
        $responder = $_SESSION['admin_name'] ?? 'Admin';
        $pdo->prepare("UPDATE `bookings` SET `status` = 'cancelled', `responded_by` = ? WHERE `id` = ?")->execute([$responder, $cId]);
        require_once __DIR__ . '/../../includes/notification-engine.php';
        dropcars_dispatch_notifications($pdo, $cId, 'cancelled');
        $syncStmt = $pdo->prepare("SELECT b.*, c.name AS customer_name, c.phone AS customer_phone FROM `bookings` b JOIN `customers` c ON b.customer_id = c.id WHERE b.id = ?");
        $syncStmt->execute([$cId]);
        $syncRow = $syncStmt->fetch(PDO::FETCH_ASSOC);
        if ($syncRow) {
            dropcars_admin_sync_booking_status_row($syncRow, 'cancelled');
        }
    }
    header('Location: ' . admin_url('bookings', ['status' => 'cancelled']));
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['mark_fake_id'])) {
    $cId = (int) $_POST['mark_fake_id'];
    if ($cId > 0 && isset($pdo)) {
        $stmt = $pdo->prepare("SELECT `ip_address` FROM `bookings` WHERE `id` = ?");
        $stmt->execute([$cId]);
        $ip = $stmt->fetchColumn();
        
        $responder = $_SESSION['admin_name'] ?? 'Admin';
        $pdo->prepare("UPDATE `bookings` SET `status` = 'fake', `responded_by` = ? WHERE `id` = ?")->execute([$responder, $cId]);
        if ($ip) {
            dropcars_admin_block_spam_ip($pdo, (string) $ip, 'Marked as spam from booking admin', 'booking', $cId);
        }
        $syncStmt = $pdo->prepare("SELECT b.*, c.name AS customer_name, c.phone AS customer_phone FROM `bookings` b JOIN `customers` c ON b.customer_id = c.id WHERE b.id = ?");
        $syncStmt->execute([$cId]);
        $syncRow = $syncStmt->fetch(PDO::FETCH_ASSOC);
        if ($syncRow) {
            dropcars_admin_sync_booking_status_row($syncRow, 'fake');
        }
    }
    header('Location: ' . admin_url('bookings', ['msg' => 'blocked']));
    exit;
}

if (!function_exists('dropcars_post_or_approve_booking_to_backend')) {
    function dropcars_post_or_approve_booking_to_backend(PDO $pdo, int $id): array
    {
        require_once __DIR__ . '/../../api/includes/backend-client.php';
        
        $stmt = $pdo->prepare("SELECT b.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email 
                               FROM `bookings` b 
                               LEFT JOIN `customers` c ON b.customer_id = c.id 
                               WHERE b.id = ?");
        $stmt->execute([$id]);
        $booking = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$booking) {
            return ['ok' => false, 'error' => 'Booking #' . $id . ' not found'];
        }

        // If booking already has a backend_request_id, try approving it
        if (!empty($booking['backend_request_id'])) {
            $approveResult = dropcars_backend_request('POST', '/api/website/bookings/' . rawurlencode((string)$booking['backend_request_id']) . '/approve');
            if ($approveResult['ok']) {
                $pdo->prepare("UPDATE `bookings` SET `posting_status` = 'APPROVED' WHERE `id` = ?")->execute([$id]);
                return ['ok' => true, 'id' => $booking['backend_request_id'], 'action' => 'approved'];
            }
            if (($approveResult['status'] ?? 0) === 400 && stripos($approveResult['error'] ?? '', 'Only pending') !== false) {
                $pdo->prepare("UPDATE `bookings` SET `posting_status` = 'APPROVED' WHERE `id` = ?")->execute([$id]);
                return ['ok' => true, 'id' => $booking['backend_request_id'], 'action' => 'already_approved'];
            }
        }

        // Create new backend booking request
        $tripTypeRaw = strtoupper((string)($booking['trip_type'] ?? 'ONE_WAY'));
        $backendTripType = (strpos($tripTypeRaw, 'ROUND') !== false) ? 'Round Trip' : ((strpos($tripTypeRaw, 'LOCAL') !== false || strpos($tripTypeRaw, 'HOUR') !== false) ? 'Hourly Rental' : 'Oneway');

        $vType = strtoupper(trim((string)($booking['vehicle_type'] ?? 'SEDAN')));
        $carTypeMap = [
            'SEDAN' => 'SEDAN_4_PLUS_1',
            'SUV' => 'SUV',
            'INNOVA' => 'INNOVA',
            'CRYSTA' => 'INNOVA_CRYSTA',
        ];
        $backendCarType = $carTypeMap[$vType] ?? 'SEDAN_4_PLUS_1';
        $mappedKey = $vType;
        if (!isset($carTypeMap[$mappedKey])) {
            if (stripos($vType, 'CRYSTA') !== false) $mappedKey = 'CRYSTA';
            elseif (stripos($vType, 'INNOVA') !== false) $mappedKey = 'INNOVA';
            elseif (stripos($vType, 'SUV') !== false || stripos($vType, 'ERTIGA') !== false) $mappedKey = 'SUV';
            else $mappedKey = 'SEDAN';
            $backendCarType = $carTypeMap[$mappedKey] ?? 'SEDAN_4_PLUS_1';
        }

        $travelDate = $booking['travel_date'] ?? date('Y-m-d');
        $travelTime = $booking['travel_time'] ?? '10:00:00';
        $ts = strtotime($travelDate . ' ' . $travelTime);
        $startDateTime = ($ts !== false) ? date('c', $ts) : date('c');

        $fb = [];
        if (!empty($booking['fare_breakdown'])) {
            $fb = json_decode($booking['fare_breakdown'], true) ?: [];
        }

        $defaultRates = [
            'SEDAN'  => ['cost_per_km' => ($backendTripType === 'Round Trip' ? 13 : 15), 'bata' => 400],
            'SUV'    => ['cost_per_km' => ($backendTripType === 'Round Trip' ? 18 : 20), 'bata' => 500],
            'INNOVA' => ['cost_per_km' => ($backendTripType === 'Round Trip' ? 19 : 20), 'bata' => 500],
            'CRYSTA' => ['cost_per_km' => ($backendTripType === 'Round Trip' ? 22 : 24), 'bata' => 500],
        ];
        $rates = $defaultRates[$mappedKey] ?? $defaultRates['SEDAN'];
        $perKmRate = (int)($rates['cost_per_km']);
        $driverBata = (int)($rates['bata']);
        $permitCharges = 0;
        $tollCharges = 0;
        $distanceKm = (float)($booking['total_km'] ?? $booking['distance'] ?? 0);
        $fareEstimate = (int)($booking['fare_estimate'] ?? $booking['final_fare'] ?? 0);

        if (!empty($fb['vehicles'][$mappedKey])) {
            $vFb = $fb['vehicles'][$mappedKey];
            if (!empty($vFb['perKmRate'])) $perKmRate = (int)$vFb['perKmRate'];
            if (!empty($vFb['driverBata'])) $driverBata = (int)$vFb['driverBata'];
            if (!empty($vFb['stateTax'])) $permitCharges += (int)$vFb['stateTax'];
            if (!empty($vFb['permitCharges'])) $permitCharges += (int)$vFb['permitCharges'];
            if (!empty($vFb['toll'])) $tollCharges = (int)$vFb['toll'];
            if (!empty($vFb['totalFare'])) $fareEstimate = (int)$vFb['totalFare'];
        }

        if ($permitCharges === 0 && !empty($booking['pickup']) && !empty($booking['drop_location'])) {
            require_once __DIR__ . '/../../api/fare-breakdown-format.php';
            if (function_exists('dropcars_detect_border_transitions')) {
                $transitions = dropcars_detect_border_transitions((string)$booking['pickup'], (string)$booking['drop_location']);
                if (!empty($transitions)) {
                    foreach ($transitions as $tr) {
                        $toState = strtoupper($tr['to'] ?? '');
                        if ($toState === 'PY' || $toState === 'PUDUCHERRY') {
                            $permitCharges += ($mappedKey === 'SEDAN' ? 400 : ($mappedKey === 'SUV' ? 700 : 800));
                        } else {
                            $permitCharges += ($mappedKey === 'SEDAN' ? 800 : 1200);
                        }
                    }
                }
            }
        }

        $phone = preg_replace('/[^\d]/', '', (string)($booking['customer_phone'] ?? ''));
        if (strlen($phone) > 10 && substr($phone, 0, 2) === '91') {
            $phone = substr($phone, 2);
        }

        $payload = [
            'customer_name'        => (string)($booking['customer_name'] ?: 'Guest'),
            'customer_number'      => (string)$phone,
            'customer_email'       => !empty($booking['customer_email']) ? (string)$booking['customer_email'] : null,
            'pickup_drop_location' => (object) [
                '0' => (string)($booking['pickup'] ?: 'Pickup'),
                '1' => (string)($booking['drop_location'] ?: 'Drop'),
            ],
            'trip_type'            => $backendTripType,
            'car_type'             => $backendCarType,
            'start_date_time'      => $startDateTime,
            'is_urgent'            => false,
            'is_enquiry'           => false,
            'quoted_total_amount'  => (int)$fareEstimate,
            'quoted_cost_per_km'   => (int)$perKmRate,
            'quoted_driver_allowance' => (int)$driverBata,
            'quoted_permit_charges'=> (int)$permitCharges,
            'quoted_toll_charges'  => (int)$tollCharges,
            'quoted_trip_distance' => (float)$distanceKm,
        ];

        $createRes = dropcars_backend_request('POST', '/api/website/bookings', $payload);
        if ($createRes['ok'] && isset($createRes['data']['id'])) {
            $newBackendId = (string)$createRes['data']['id'];
            $pdo->prepare("UPDATE `bookings` SET `backend_request_id` = ?, `posting_status` = 'PENDING' WHERE `id` = ?")
                ->execute([$newBackendId, $id]);

            $appr = dropcars_backend_request('POST', '/api/website/bookings/' . rawurlencode($newBackendId) . '/approve');
            if ($appr['ok']) {
                $pdo->prepare("UPDATE `bookings` SET `posting_status` = 'APPROVED' WHERE `id` = ?")
                    ->execute([$id]);
                return ['ok' => true, 'id' => $newBackendId, 'action' => 'created_and_approved'];
            }
            return ['ok' => true, 'id' => $newBackendId, 'action' => 'created_pending'];
        }

        return ['ok' => false, 'error' => $createRes['error'] ?? 'Backend creation failed'];
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['mark_confirmed_id'])) {
    $cId = (int) $_POST['mark_confirmed_id'];
    if ($cId > 0 && isset($pdo)) {
        $responder = $_SESSION['admin_name'] ?? 'Admin';
        require_once __DIR__ . '/../includes/functions.php';
        $curStmt = $pdo->prepare("SELECT `booking_id` FROM `bookings` WHERE `id` = ?");
        $curStmt->execute([$cId]);
        $curBid = (string) $curStmt->fetchColumn();
        $newBid = (string) dropcars_enquiry_confirmed_booking_id($curBid, $pdo);
        if ($newBid !== '' && strcasecmp($newBid, $curBid) !== 0) {
            $pdo->prepare("UPDATE `bookings` SET `status` = 'confirmed', `booking_id` = ?, `responded_by` = ? WHERE `id` = ?")->execute([$newBid, $responder, $cId]);
        } else {
            $pdo->prepare("UPDATE `bookings` SET `status` = 'confirmed', `responded_by` = ? WHERE `id` = ?")->execute([$responder, $cId]);
        }
        require_once __DIR__ . '/../../includes/notification-engine.php';
        dropcars_dispatch_notifications($pdo, $cId, 'confirmed');
        require_once __DIR__ . '/../includes/enquiries-schema.php';
        dropcars_process_referral_credit($pdo, $cId, 'confirmed');
        $syncStmt = $pdo->prepare("SELECT b.*, c.name AS customer_name, c.phone AS customer_phone FROM `bookings` b JOIN `customers` c ON b.customer_id = c.id WHERE b.id = ?");
        $syncStmt->execute([$cId]);
        $syncRow = $syncStmt->fetch(PDO::FETCH_ASSOC);
        if ($syncRow) {
            dropcars_admin_sync_booking_status_row($syncRow, 'confirmed');
        }
        // Auto-post to backend marketplace when confirmed
        dropcars_post_or_approve_booking_to_backend($pdo, $cId);
        header('Location: ' . admin_url('bookings', ['status' => 'confirmed', 'msg' => 'marked_confirmed']));
    }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'bulk_auto_post') {
    $ids = $_POST['selected_ids'] ?? [];
    if (!empty($ids)) {
        $postedCount = 0;
        $failedCount = 0;
        foreach ($ids as $bookingId) {
            $res = dropcars_post_or_approve_booking_to_backend($pdo, (int)$bookingId);
            if ($res['ok']) {
                $postedCount++;
            } else {
                $failedCount++;
            }
        }
        header('Location: ' . admin_url('bookings', [
            'status' => $_GET['status'] ?? 'confirmed',
            'msg' => 'bulk_posted',
            'count' => $postedCount,
            'failed' => $failedCount
        ]));
        exit;
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'single_auto_post') {
    $bId = (int)($_POST['booking_id'] ?? 0);
    if ($bId > 0 && isset($pdo)) {
        $res = dropcars_post_or_approve_booking_to_backend($pdo, $bId);
        header('Location: ' . admin_url('bookings', [
            'status' => $_GET['status'] ?? 'confirmed',
            'msg' => $res['ok'] ? 'single_posted' : 'post_error',
            'bid' => $bId,
            'reason' => $res['error'] ?? ''
        ]));
        exit;
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'delete_selected') {
    $ids = $_POST['selected_ids'] ?? [];
    if (!empty($ids)) {
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare("DELETE FROM `bookings` WHERE `id` IN ($placeholders)");
        $stmt->execute($ids);
        header('Location: ' . admin_url('bookings', ['msg' => 'deleted', 'count' => count($ids)]));
        exit;
    }
}

// A single-booking delete used to fire immediately off a plain GET link with
// no confirmation and no CSRF token - a forged cross-site GET (or even an
// email client's link-preview crawler) could permanently delete a booking.
// Now requires an explicit confirmed=1, only reachable via the confirmation
// page's own button below - matching the pattern already used for the
// "Spam? Block Client IP" email action.
if (isset($_GET['action']) && $_GET['action'] === 'delete' && isset($_GET['id']) && isset($_GET['confirmed'])) {
    $id = (int) $_GET['id'];
    if ($id > 0) {
        $pdo->prepare("DELETE FROM `bookings` WHERE `id` = ?")->execute([$id]);
        header('Location: ' . admin_url('bookings', ['msg' => 'deleted', 'count' => 1]));
        exit;
    }
} elseif (isset($_GET['action']) && $_GET['action'] === 'delete' && isset($_GET['id'])) {
    $idConfirm = (int) $_GET['id'];
    if ($idConfirm > 0) {
        $confirmUrl = admin_url('bookings', ['action' => 'delete', 'id' => $idConfirm, 'confirmed' => 1]);
        $cancelUrl = admin_url('bookings');
        echo '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Confirm Delete</title></head><body style="font-family:sans-serif;max-width:480px;margin:60px auto;text-align:center;padding:0 20px;">'
            . '<h2 style="color:#b91c1c;">Delete this booking?</h2>'
            . '<p style="color:#334155;font-size:15px;">This will permanently delete booking #' . $idConfirm . '. This cannot be undone.</p>'
            . '<a href="' . htmlspecialchars($confirmUrl) . '" style="display:inline-block;background:#ef4444;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin:8px;">Yes, Delete</a>'
            . '<a href="' . htmlspecialchars($cancelUrl) . '" style="display:inline-block;background:#e2e8f0;color:#1e293b;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin:8px;">Cancel</a>'
            . '</body></html>';
        exit;
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'assign_driver') {
    $id = (int)$_POST['id'];
    if ($id > 0 && isset($pdo)) {
        $dName = trim($_POST['driver_name'] ?? '');
        $dPhone = trim($_POST['driver_phone'] ?? '');
        $cName = trim($_POST['car_name'] ?? '');
        $cNumber = strtoupper(trim($_POST['car_number'] ?? ''));
        $responder = $_SESSION['admin_name'] ?? 'Admin';

        $stmt = $pdo->prepare("UPDATE `bookings` SET 
            `driver_name` = ?, 
            `driver_phone` = ?, 
            `car_name` = ?, 
            `car_number` = ?,
            `responded_by` = ?
            WHERE `id` = ?");
        $stmt->execute([$dName, $dPhone, $cName, $cNumber, $responder, $id]);
        
        require_once __DIR__ . '/../../includes/notification-engine.php';
        dropcars_dispatch_notifications($pdo, $id, 'driver_assigned');
        
        // Sync to Google Sheets
        $syncStmt = $pdo->prepare("SELECT b.*, c.name AS customer_name, c.phone AS customer_phone FROM `bookings` b JOIN `customers` c ON b.customer_id = c.id WHERE b.id = ?");
        $syncStmt->execute([$id]);
        $syncRow = $syncStmt->fetch(PDO::FETCH_ASSOC);
        if ($syncRow) {
            dropcars_admin_sync_booking_status_row($syncRow, $syncRow['status']);
        }
        
        // Return 200 for the AJAX call
        if (isset($_SERVER['HTTP_X_REQUESTED_WITH']) && $_SERVER['HTTP_X_REQUESTED_WITH'] === 'XMLHttpRequest') {
            echo "success";
            exit;
        }
    }
}

// Expired Helper
$todayDate = date('Y-m-d');

// Filters
$dateFilter = $_GET['date'] ?? '';
$statusFilter = $_GET['status'] ?? '';
$sourceFilter = $_GET['source'] ?? '';
$search = $_GET['search'] ?? '';
$sortFilter = $_GET['sort'] ?? 'next_first';
$dispatcherFilter = $_GET['dispatcher'] ?? '';

// Staff list (for the "Responded by" filter) - admins + staff.
$allAdminNames = [];
try {
    $allAdminNames = $pdo->query("SELECT DISTINCT name FROM admins ORDER BY id ASC")->fetchAll(PDO::FETCH_COLUMN);
} catch (Throwable $e) {}

$sql = "SELECT b.*, c.name as customer_name, c.phone as customer_phone 
        FROM `bookings` b 
        JOIN `customers` c ON b.customer_id = c.id WHERE 1=1";
$params = [];

$activeSite = dropcars_get_active_website();
if ($activeSite !== 'all') {
    $sql .= " AND b.`website` = ?";
    $params[] = $activeSite;
}

if ($search) {
    $sql .= " AND (c.name LIKE ? OR c.phone LIKE ? OR b.booking_id LIKE ?)";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
}
if ($dateFilter) {
    $sql .= " AND DATE(b.created_at) = ?";
    $params[] = $dateFilter;
}
if ($statusFilter) {
    if ($statusFilter === 'not_spam') {
        $sql .= " AND b.status != 'fake' AND b.status != 'cancelled'";
    } elseif ($statusFilter === 'expired') {
        $sql .= " AND b.pickup_date < ? AND b.status IN ('pending', 'confirmed')";
        $params[] = $todayDate;
    } elseif ($statusFilter === 'confirmed') {
        // Confirmed = actual confirmed + customer-submitted Pending Confirmation (pending + no responded_by)
        $sql .= " AND (b.status = 'confirmed' OR (b.status = 'pending' AND (b.responded_by IS NULL OR b.responded_by = '')))";
    } elseif ($statusFilter === 'pending') {
        // Waiting = admin-marked pending (pending + responded_by is set)
        $sql .= " AND b.status = 'pending' AND (b.responded_by IS NOT NULL AND b.responded_by != '')";
    } else {
        $sql .= " AND b.status = ?";
        $params[] = $statusFilter;
    }
}
if ($sourceFilter) {
    $sql .= " AND b.source = ?";
    $params[] = $sourceFilter;
}
if ($dispatcherFilter) {
    if ($dispatcherFilter === 'unassigned') {
        $sql .= " AND (b.responded_by IS NULL OR b.responded_by = '')";
    } else {
        $sql .= " AND b.responded_by = ?";
        $params[] = $dispatcherFilter;
    }
}

$orderBy = "b.created_at DESC";
if ($sortFilter === 'oldest') {
    $orderBy = "b.created_at ASC";
} elseif ($sortFilter === 'travel_date') {
    $orderBy = "b.pickup_date ASC, b.created_at DESC";
} elseif ($sortFilter === 'next_first') {
    $orderBy = "CASE WHEN CONCAT(b.pickup_date, ' ', b.pickup_time) >= NOW() THEN 1 ELSE 2 END ASC,
                CASE WHEN CONCAT(b.pickup_date, ' ', b.pickup_time) >= NOW() THEN CONCAT(b.pickup_date, ' ', b.pickup_time) END ASC,
                CASE WHEN CONCAT(b.pickup_date, ' ', b.pickup_time) < NOW() THEN CONCAT(b.pickup_date, ' ', b.pickup_time) END DESC,
                b.created_at DESC";
}

// Total count for pagination, using the same filters as the main query
// (built before ORDER BY/LIMIT is applied) - previously this page fetched
// every matching row unbounded, which gets slower as bookings grows.
$countSql = str_replace(
    "SELECT b.*, c.name as customer_name, c.phone as customer_phone",
    "SELECT COUNT(*)",
    $sql
);
$countStmt = $pdo->prepare($countSql);
$countStmt->execute($params);
$totalCount = (int) $countStmt->fetchColumn();

$limit = 50;
$page = isset($_GET['page']) ? max(1, (int) $_GET['page']) : 1;
$totalPages = max(1, (int) ceil($totalCount / $limit));
$page = min($page, $totalPages);
$offset = ($page - 1) * $limit;

$sql .= " ORDER BY " . $orderBy . " LIMIT $limit OFFSET $offset";
$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$bookings = $stmt->fetchAll();
foreach ($bookings as &$booking) {
    $booking['is_regular_customer'] = isset($pdo) ? dropcars_is_regular_customer($pdo, (string) ($booking['customer_phone'] ?? '')) : false;
}
unset($booking);

// ─── Live status counts (drives the badges on the filter tabs + KPI tiles) ───
$statusCounts = [
    'all'       => 0,
    'pending'   => 0,
    'confirmed' => 0,
    'completed' => 0,
    'cancelled' => 0,
    'expired'   => 0,
];
try {
    if ($activeSite !== 'all') {
        $cntRowsStmt = $pdo->prepare("SELECT status, COUNT(*) AS c FROM `bookings` WHERE `website` = ? GROUP BY status");
        $cntRowsStmt->execute([$activeSite]);
        $cntRows = $cntRowsStmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($cntRows as $row) {
            $key = strtolower(trim((string)$row['status']));
            if (isset($statusCounts[$key])) $statusCounts[$key] = (int)$row['c'];
            $statusCounts['all'] += (int)$row['c'];
        }
        $waitingCountStmt = $pdo->prepare("SELECT COUNT(*) FROM `bookings` WHERE `status` = 'pending' AND `responded_by` IS NOT NULL AND `responded_by` != '' AND `website` = ?");
        $waitingCountStmt->execute([$activeSite]);
        $waitingCount = (int)$waitingCountStmt->fetchColumn();

        $pendingConfirmStmt = $pdo->prepare("SELECT COUNT(*) FROM `bookings` WHERE `status` = 'pending' AND (`responded_by` IS NULL OR `responded_by` = '') AND `website` = ?");
        $pendingConfirmStmt->execute([$activeSite]);
        $pendingConfirm = (int)$pendingConfirmStmt->fetchColumn();

        $statusCounts['pending']   = $waitingCount;
        $statusCounts['confirmed'] += $pendingConfirm;

        $expStmt = $pdo->prepare("SELECT COUNT(*) FROM `bookings` WHERE `pickup_date` < ? AND `status` IN ('pending','confirmed') AND `website` = ?");
        $expStmt->execute([$todayDate, $activeSite]);
        $statusCounts['expired'] = (int)$expStmt->fetchColumn();

        $revenueStmt = $pdo->prepare("SELECT COALESCE(SUM(final_fare), 0) FROM `bookings` WHERE `status` = 'completed' AND `website` = ?");
        $revenueStmt->execute([$activeSite]);
        $totalRevenue = (float)$revenueStmt->fetchColumn();
    } else {
        $cntRows = $pdo->query("SELECT status, COUNT(*) AS c FROM `bookings` GROUP BY status")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($cntRows as $row) {
            $key = strtolower(trim((string)$row['status']));
            if (isset($statusCounts[$key])) $statusCounts[$key] = (int)$row['c'];
            $statusCounts['all'] += (int)$row['c'];
        }
        $waitingCount   = (int)$pdo->query("SELECT COUNT(*) FROM `bookings` WHERE `status` = 'pending' AND `responded_by` IS NOT NULL AND `responded_by` != ''")->fetchColumn();
        $pendingConfirm = (int)$pdo->query("SELECT COUNT(*) FROM `bookings` WHERE `status` = 'pending' AND (`responded_by` IS NULL OR `responded_by` = '')")->fetchColumn();
        $statusCounts['pending']   = $waitingCount;
        $statusCounts['confirmed'] += $pendingConfirm;
        $expStmt = $pdo->prepare("SELECT COUNT(*) FROM `bookings` WHERE `pickup_date` < ? AND `status` IN ('pending','confirmed')");
        $expStmt->execute([$todayDate]);
        $statusCounts['expired'] = (int)$expStmt->fetchColumn();
        $revenueStmt = $pdo->query("SELECT COALESCE(SUM(final_fare), 0) FROM `bookings` WHERE `status` = 'completed'");
        $totalRevenue = (float)$revenueStmt->fetchColumn();
    }
} catch (Throwable $e) {
    $totalRevenue = 0.0;
}

$createdMsg = '';
$createdMsgClass = 'alert-success';
if (isset($_GET['msg']) && (string) $_GET['msg'] === 'created') {
    $ref = isset($_GET['booking_id']) ? trim((string) $_GET['booking_id']) : '';
    $createdMsg = $ref !== ''
        ? 'Booking created successfully. Reference: ' . htmlspecialchars($ref, ENT_QUOTES, 'UTF-8') . '.'
        : 'Booking created successfully.';
} elseif (isset($_GET['msg']) && $_GET['msg'] === 'marked_completed') {
    $createdMsg = 'Booking marked as completed.';
} elseif (isset($_GET['msg']) && $_GET['msg'] === 'marked_confirmed') {
    $createdMsg = 'Booking successfully confirmed.';
} elseif (isset($_GET['msg']) && $_GET['msg'] === 'need_assignment') {
    $createdMsgClass = 'alert-warning';
    $createdMsg = 'This booking cannot be completed until you assign driver name, driver phone, vehicle model, and registration plate. Use <strong>Assign Cab &amp; Driver</strong> or <strong>Manage</strong>, then try again.';
} elseif (isset($_GET['msg']) && $_GET['msg'] === 'bulk_posted') {
    $count = (int) ($_GET['count'] ?? 0);
    $failed = (int) ($_GET['failed'] ?? 0);
    $createdMsg = "$count booking(s) posted to Driver/Vendor Marketplace." . ($failed > 0 ? " ($failed skipped/failed)" : "");
} elseif (isset($_GET['msg']) && $_GET['msg'] === 'single_posted') {
    $bId = (int) ($_GET['bid'] ?? 0);
    $createdMsg = "Booking #$bId posted & approved in Driver Marketplace.";
} elseif (isset($_GET['msg']) && $_GET['msg'] === 'post_error') {
    $createdMsgClass = 'alert-warning';
    $bId = (int) ($_GET['bid'] ?? 0);
    $reason = htmlspecialchars($_GET['reason'] ?? 'Unknown error', ENT_QUOTES, 'UTF-8');
    $createdMsg = "Could not post Booking #$bId: $reason";
} elseif (isset($_GET['msg']) && $_GET['msg'] === 'deleted') {
    $count = (int) ($_GET['count'] ?? 1);
    $createdMsg = $count > 1 ? "$count bookings deleted successfully." : "Booking deleted successfully.";
}
?>

<style>
    .bookings-page-header-premium {
        position: relative;
        overflow: hidden;
        background: radial-gradient(circle at top right, rgba(16, 185, 129, 0.05), transparent 400px), radial-gradient(circle at bottom left, rgba(99, 102, 241, 0.03), transparent 400px);
        border: 1px solid #f1f5f9;
        box-shadow: 0 10px 40px rgba(0,0,0,0.02);
        padding: 1.25rem 1.5rem;
        border-radius: 16px;
        margin-bottom: 1.25rem;
    }
    .bookings-header-row { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: nowrap; }
    .bookings-header-identity { display: flex; align-items: center; gap: 0.6rem; flex-shrink: 0; }
    .bookings-search-form { display: flex; align-items: center; gap: 0.35rem; background: #f8fafc; padding: 3px; border-radius: 10px; border: 1px solid #e2e8f0; flex: 1; max-width: 380px; min-width: 0; margin: 0; }
    .bookings-dispatcher-form, .bookings-sort-form { margin: 0; flex-shrink: 0; }
    @media (max-width: 1024px) {
        .bookings-header-row { flex-wrap: wrap; gap: 0.75rem; }
        .bookings-header-identity { order: 1; flex: 1 1 auto; }
        .bookings-new-cta { order: 2; flex: 0 0 auto; }
        .bookings-search-form { order: 3; flex: 1 1 100%; max-width: 100% !important; width: 100% !important; }
        .bookings-dispatcher-form { order: 4; flex: 1 1 calc(50% - 0.375rem); }
        .bookings-sort-form { order: 5; flex: 1 1 calc(50% - 0.375rem); }
        .bookings-dispatcher-form select, .bookings-sort-form select { width: 100%; }
        .bookings-dispatcher-form .dash-filter-chip, .bookings-sort-form .dash-filter-chip { width: 100%; box-sizing: border-box; }
    }
    @media (max-width: 640px) {
        .bookings-new-cta__text { display: none !important; }
        .bookings-new-cta { width: 34px !important; padding: 0 !important; justify-content: center; }
    }
    
    .dropdown-wa { position: relative; display: inline-block; }
    .wa-dropdown-menu {
        display: none;
        position: absolute;
        right: 0;
        bottom: 100%;
        margin-bottom: 6px;
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);
        z-index: 999999;
        min-width: 210px;
        padding: 6px 0;
        text-align: left;
    }
    .wa-dropdown-menu a {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        font-size: 0.75rem;
        font-weight: 700;
        color: #334155 !important;
        text-decoration: none !important;
        transition: background 0.15s;
    }
    .wa-dropdown-menu a:hover {
        background: #f1f5f9;
        color: #1e293b !important;
    }
    /* Filter chips (matched to dashboard) */
    .dash-filter-chip { display: inline-flex; align-items: center; gap: 7px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 0 0.68rem; height: 34px; transition: border-color 0.15s ease, box-shadow 0.15s ease; flex-shrink: 0; }
    .dash-filter-chip:focus-within { border-color: #93c5fd; box-shadow: 0 0 0 3px rgba(59,130,246,0.12); }
    .dash-filter-chip > i { font-size: 0.74rem; color: #94a3b8; flex: 0 0 auto; }
    .dash-filter-chip > i.is-accent { color: #3b82f6; }
    .dash-filter-chip select { border: none; outline: none; font-size: 0.75rem; font-weight: 700; color: #0f172a; cursor: pointer; max-width: 100%; -webkit-appearance: none; -moz-appearance: none; appearance: none; padding: 0 1.15rem 0 0; background-color: transparent; background-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 0.05rem center; background-size: 0.7rem; }
    .dash-filter-chip select option { color: #0f172a; background: #ffffff; font-weight: 600; }

    /* Booking Cards Layout Styling */
    .booking-cards-list {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
        max-width: 680px;
        margin: 1.5rem auto;
        font-family: 'Outfit', 'Inter', sans-serif;
    }
    .booking-card {
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
    .booking-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 20px rgba(15, 23, 42, 0.05);
        border-color: #cbd5e1;
    }
    .booking-ref-copy {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        text-decoration: none;
    }
    .status-badge-container .badge {
        font-size: 0.62rem !important;
        padding: 3px 6px !important;
        font-weight: 800 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.02em !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 4px !important;
        line-height: 1 !important;
    }
    .enquiry-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        border-radius: 10px;
        border: 1.5px solid rgba(0,0,0,0.04);
        font-size: 0.95rem;
        transition: 0.2s;
        cursor: pointer;
        text-decoration: none;
        background: #f8fafc;
        color: #475569;
    }
    .enquiry-pill:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0,0,0,0.05);
    }
    .enquiry-pill--whatsapp { background: #f0fdf4 !important; color: #16a34a !important; border-color: #bbf7d0 !important; }
    .enquiry-pill--confirm { background: #e0f2fe !important; color: #0369a1 !important; border-color: #bae6fd !important; }
    .enquiry-pill--waiting { background: #fef3c7 !important; color: #d97706 !important; border-color: #fde68a !important; }
    .enquiry-pill--delete { background: #fff1f2 !important; color: #e11d48 !important; border-color: #fecaca !important; }
    .enquiry-pill--manage { background: #e0e7ff !important; color: #4f46e5 !important; border-color: #c7d2fe !important; }

    /* Mobile responsive overrides for Booking Card */
    @media (max-width: 767px) {
        .booking-card-top-row {
            display: grid !important;
            grid-template-columns: 1.2fr 0.8fr !important;
            gap: 8px 12px !important;
            width: 100% !important;
        }
        .booking-card-top-left {
            display: flex !important;
            flex-direction: column !important;
            gap: 4px !important;
            flex: unset !important;
        }
        .booking-card-top-center {
            grid-column: 1 !important;
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            gap: 12px !important;
            text-align: left !important;
            flex: unset !important;
            margin-top: 2px !important;
        }
        .booking-card-top-center > span {
            margin-top: 0 !important;
        }
        .booking-card-top-right {
            grid-column: 2 !important;
            grid-row: 1 / span 2 !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: flex-end !important;
            text-align: right !important;
            flex: unset !important;
        }
        .booking-card-driver-row {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 6px !important;
        }
        .booking-card-driver-row > span {
            max-width: 100% !important;
            word-break: break-all !important;
        }
        .booking-card-fare-row {
            flex-wrap: wrap !important;
            gap: 8px !important;
        }
    }
</style>
<div class="page-header bookings-page-header-premium">
    <div class="bookings-header-row">
        <!-- Identity -->
        <div class="bookings-header-identity">
            <div style="width:36px; height:36px; background:#f0fdf4; border-radius:10px; display:inline-flex; align-items:center; justify-content:center; color:#16a34a; flex-shrink:0;">
                <i class="fa-solid fa-calendar-check" style="font-size:1.1rem;"></i>
            </div>
            <h1 class="bookings-title" style="font-size:1.2rem; font-weight:800; color:#1e293b; margin:0; line-height:1.2;">Booking Management</h1>
        </div>
        <!-- Search -->
        <form action="bookings" method="GET" class="bookings-search-form">
            <input type="hidden" name="status" value="<?php echo $statusFilter; ?>">
            <input type="hidden" name="sort" value="<?php echo htmlspecialchars($sortFilter); ?>">
            <input type="hidden" name="dispatcher" value="<?php echo htmlspecialchars($dispatcherFilter); ?>">
            <div style="position:relative; flex:1; min-width:0;">
                <i class="fa fa-search" style="position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; font-size:0.8rem; pointer-events:none;"></i>
                <input type="text" name="search" class="form-control" placeholder="Search phone, name, trip ID…" value="<?php echo htmlspecialchars($search); ?>" style="border:none; background:transparent; padding:0 0.75rem 0 2rem; font-size:0.82rem; height:34px; width:100%; box-shadow:none;">
            </div>
            <button type="submit" style="height:34px; width:34px; padding:0; border-radius:8px; background:#6366f1; border:none; color:#fff; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; cursor:pointer;" title="Search" aria-label="Search">
                <i class="fa fa-arrow-right" style="font-size:0.82rem;"></i>
            </button>
            <?php if ($search !== ''): ?>
                <a href="<?php echo htmlspecialchars(admin_url('bookings', array_filter(['status' => $statusFilter, 'sort' => $sortFilter !== 'newest' ? $sortFilter : null]))); ?>" style="height:34px; width:34px; border-radius:8px; background:#fff; border:1px solid #e2e8f0; color:#64748b; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;" title="Clear search">
                    <i class="fa fa-xmark"></i>
                </a>
            <?php else: ?>
                <button type="button" onclick="location.reload();" style="height:34px; width:34px; border-radius:8px; background:#fff; border:1px solid #e2e8f0; color:#64748b; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; cursor:pointer;" title="Refresh">
                    <i class="fa fa-refresh"></i>
                </button>
            <?php endif; ?>
        </form>
        <!-- Staff (Responded by) Control -->
        <form action="bookings" method="GET" class="bookings-dispatcher-form">
            <input type="hidden" name="status" value="<?php echo htmlspecialchars($statusFilter); ?>">
            <input type="hidden" name="search" value="<?php echo htmlspecialchars($search); ?>">
            <input type="hidden" name="sort" value="<?php echo htmlspecialchars($sortFilter); ?>">
            <div class="dash-filter-chip" title="Responded by">
                <i class="fa-solid fa-user-shield is-accent"></i>
                <select name="dispatcher" onchange="this.form.submit();">
                    <option value="">All Staff</option>
                    <option value="unassigned" <?php echo $dispatcherFilter === 'unassigned' ? 'selected' : ''; ?>>Unassigned Only</option>
                    <?php foreach ($allAdminNames as $name): ?>
                        <option value="<?php echo htmlspecialchars($name); ?>" <?php echo $dispatcherFilter === $name ? 'selected' : ''; ?>><?php echo htmlspecialchars($name); ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
        </form>
        <!-- Sort Control -->
        <form action="bookings" method="GET" class="bookings-sort-form">
            <input type="hidden" name="status" value="<?php echo htmlspecialchars($statusFilter); ?>">
            <input type="hidden" name="search" value="<?php echo htmlspecialchars($search); ?>">
            <input type="hidden" name="dispatcher" value="<?php echo htmlspecialchars($dispatcherFilter); ?>">
            <div class="dash-filter-chip" title="Sort by">
                <i class="fa-solid fa-arrow-down-wide-short"></i>
                <select name="sort" onchange="this.form.submit();">
                    <option value="newest" <?php echo $sortFilter === 'newest' ? 'selected' : ''; ?>>Newest First</option>
                    <option value="next_first" <?php echo $sortFilter === 'next_first' ? 'selected' : ''; ?>>Operational Priority</option>
                    <option value="oldest" <?php echo $sortFilter === 'oldest' ? 'selected' : ''; ?>>Oldest First</option>
                </select>
            </div>
        </form>

        <!-- New Booking CTA -->
        <a href="bookings-new" class="btn btn-primary bookings-new-cta" style="height:34px; padding:0 0.85rem; border-radius:8px; font-weight:800; font-size:0.78rem; display:inline-flex; align-items:center; gap:5px; background:#16a34a; border:none; white-space:nowrap; flex-shrink:0; box-shadow:0 3px 8px rgba(22,163,74,0.22);">
            <i class="fa fa-plus" style="font-size:0.75rem;"></i>
            <span class="bookings-new-cta__text">New Booking</span>
        </a>
    </div>

    <!-- Status Switches – now with live count badges + "All" tab -->
    <?php
        $tabs = [
            ['key' => '',          'label' => 'All',       'count' => $statusCounts['all'],       'activeBg' => '#1e293b', 'activeShadow' => 'rgba(30,41,59,0.25)'],
            ['key' => 'pending',   'label' => 'Waiting',   'count' => $statusCounts['pending'],   'activeBg' => '#f59e0b', 'activeShadow' => 'rgba(245,158,11,0.20)'],
            ['key' => 'confirmed', 'label' => 'Confirmed', 'count' => $statusCounts['confirmed'], 'activeBg' => '#3b82f6', 'activeShadow' => 'rgba(59,130,246,0.20)'],
            ['key' => 'completed', 'label' => 'Completed', 'count' => $statusCounts['completed'], 'activeBg' => '#10b981', 'activeShadow' => 'rgba(16,185,129,0.20)'],
            ['key' => 'cancelled', 'label' => 'Cancelled', 'count' => $statusCounts['cancelled'], 'activeBg' => '#ef4444', 'activeShadow' => 'rgba(239,68,68,0.20)'],
            ['key' => 'expired',   'label' => 'Expired',   'count' => $statusCounts['expired'],   'activeBg' => '#64748b', 'activeShadow' => 'rgba(100,116,139,0.20)'],
        ];
    ?>
    <!-- All 6 tabs in a flexible flex container -->
    <div class="booking-status-tabs" style="display: flex; flex-wrap: wrap; justify-content: center; gap: 0.5rem; margin: 1.25rem auto 0; max-width: 100%;">
        <?php foreach ($tabs as $tab):
            $isActive = ($statusFilter ?? '') === $tab['key'];
            $params = [];
            if ($tab['key'] !== '') $params['status'] = $tab['key'];
            if ($sortFilter !== 'newest') $params['sort'] = $sortFilter;
            if ($search !== '') $params['search'] = $search;
            $href = 'bookings' . (!empty($params) ? '?' . http_build_query($params) : '');
            $style = $isActive
                ? "background: {$tab['activeBg']}; color: #fff; box-shadow: 0 3px 8px {$tab['activeShadow']};"
                : "background: #f8fafc; color: #475569; border: 1px solid #e2e8f0;";
            $badgeStyle = $isActive
                ? "background: rgba(255,255,255,0.28); color: #ffffff;"
                : "background: #ffffff; color: {$tab['activeBg']}; border: 1px solid #e2e8f0;";
        ?>
            <a href="<?php echo $href; ?>" class="booking-status-tab" style="text-decoration: none; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; font-size: 0.7rem; padding: 8px 12px; border-radius: 10px; font-weight: 800; flex: 1 1 90px; min-width: 90px; max-width: 160px; text-align: center; overflow: hidden; <?php echo $style; ?>">
                <span class="booking-status-tab__count" style="font-size: 0.95rem; line-height: 1; font-weight: 900; <?php echo $isActive ? '' : 'color:' . $tab['activeBg'] . ';'; ?>"><?php echo (int)$tab['count']; ?></span>
                <span class="booking-status-tab__label" style="font-size: 0.62rem; line-height: 1.1; font-weight: 700; white-space: normal; word-break: break-word; opacity: <?php echo $isActive ? '0.95' : '0.75'; ?>;"><?php echo htmlspecialchars($tab['label']); ?></span>
            </a>
        <?php endforeach; ?>
    </div>
    <style>
        @media (max-width: 600px) {
            .booking-status-tabs {
                gap: 0.55rem !important;
            }
            .booking-status-tab { padding: 0.7rem 0.5rem !important; }
            .booking-status-tab__count { font-size: 1.1rem !important; }
            .booking-status-tab__label {
                font-size: 0.72rem !important;
                line-height: 1.15 !important;
            }
        }
    </style>
</div>

<!-- KPI tiles moved to a future dedicated overview page (planned: /admin/overview)
     so this page stays a focused operational list. Status counts are still
     visible inline on the tab badges above. -->


<?php if ($createdMsg !== ''): ?>
    <div class="alert <?php echo htmlspecialchars($createdMsgClass, ENT_QUOTES, 'UTF-8'); ?>" style="margin-bottom: 1rem; border-radius: 10px; border: none; font-size: 0.78rem; padding: 0.5rem 1rem; font-weight: 700; border-left: 3px solid #10b981;">
        <i class="fa-solid <?php echo $createdMsgClass === 'alert-warning' ? 'fa-triangle-exclamation' : 'fa-circle-check'; ?>" style="margin-right: 5px;"></i> <?php echo $createdMsg; ?>
    </div>
<?php endif; ?>

<div id="bulk-actions-bar" style="display:none; align-items:center; justify-content:space-between; margin-bottom:1rem; background:#fff; padding:10px 16px; border-radius:14px; border:1px solid #e2e8f0; box-shadow:0 2px 8px rgba(15,23,42,0.05); animation: fadeSlideDown 0.18s ease;">
    <div style="display:flex; align-items:center; gap:0.75rem;">
        <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; user-select:none;">
            <input type="checkbox" id="select-all-bar" style="width:17px; height:17px; accent-color:#6366f1; cursor:pointer; border-radius:4px;">
            <span style="font-size:0.88rem; font-weight:800; color:#1e293b;">Select all</span>
        </label>
        <span style="width:1px; height:18px; background:#e2e8f0; display:inline-block;"></span>
        <span style="font-size:0.82rem; font-weight:700; color:#6366f1;"><span id="selected-count">0</span> selected</span>
    </div>
    <div style="display:flex; align-items:center; gap:8px;">
        <button type="button" onclick="submitBulkBookingAction('bulk_auto_post')" class="btn" style="height:36px; padding:0 1.15rem; border-radius:10px; font-size:0.82rem; font-weight:800; background:#0ea5e9; color:#fff; border:none; box-shadow:0 3px 8px rgba(14,165,233,0.22); transition:all 0.2s; display:flex; align-items:center; gap:6px; cursor:pointer;">
            <i class="fa-solid fa-cloud-arrow-up" style="font-size:0.75rem;"></i> Auto Post / Add to Post List
        </button>
        <button type="button" onclick="submitBulkBookingAction('delete_selected')" class="btn btn-danger" style="height:36px; padding:0 1.15rem; border-radius:10px; font-size:0.82rem; font-weight:800; background:#ef4444; border:none; box-shadow:0 3px 8px rgba(239,68,68,0.18); transition:all 0.2s; display:flex; align-items:center; gap:6px; cursor:pointer;">
            <i class="fa-solid fa-trash-can" style="font-size:0.75rem;"></i> Batch Archive
        </button>
    </div>
</div>
<style>
@keyframes fadeSlideDown {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
}
</style>

<!-- Hidden one-off action forms (outside bulk-delete, so no nesting) -->
<form id="action-form-completed" method="POST" action="<?php echo htmlspecialchars(admin_url('bookings', ['status' => $statusFilter])); ?>" style="display:none;">
    <input type="hidden" name="mark_completed_id" id="action-completed-id" value="">
</form>
<form id="action-form-cancelled" method="POST" action="<?php echo htmlspecialchars(admin_url('bookings')); ?>" style="display:none;">
    <input type="hidden" name="mark_cancelled_id" id="action-cancelled-id" value="">
</form>
<form id="action-form-fake" method="POST" action="<?php echo htmlspecialchars(admin_url('bookings')); ?>" style="display:none;">
    <input type="hidden" name="mark_fake_id" id="action-fake-id" value="">
</form>
<form id="action-form-confirmed" method="POST" action="<?php echo htmlspecialchars(admin_url('bookings')); ?>" style="display:none;">
    <input type="hidden" name="mark_confirmed_id" id="action-confirmed-id" value="">
</form>

<form id="bulk-general-form" method="POST" style="display:none;">
    <input type="hidden" name="action" id="bulk-general-action" value="">
    <div id="bulk-general-inputs"></div>
</form>
<form id="single-post-form" method="POST" style="display:none;">
    <input type="hidden" name="action" value="single_auto_post">
    <input type="hidden" name="booking_id" id="single-post-booking-id" value="">
</form>

<form id="bulk-delete-form" method="POST" onsubmit="return confirm('Permanently delete selected bookings?')" style="display:none;">
    <input type="hidden" name="action" value="delete_selected">
</form>
    

    <style>
        @media (max-width: 640px) {
            .mobile-only-flex { display: flex !important; }
            .select-all-header { display: none !important; }
        }

        /* ── Mobile: stack 5-col booking rows as full-width vertical cards.
           The page's existing inline `table-layout: fixed` keeps forcing
           desktop column widths even when rows go block-level, so we
           override that on small screens. */
        @media (max-width: 800px) {
            .ajax-target-container table.custom-table,
            #ajax-table-container table.custom-table {
                table-layout: auto !important;
                width: 100% !important;
                min-width: 0 !important;
                display: block !important;
            }
            #ajax-table-container .custom-table thead { display: none !important; }
            #ajax-table-container .custom-table tbody { display: block !important; width: 100% !important; }
            #ajax-table-container .custom-table tbody tr {
                display: block !important;
                width: 100% !important;
                padding: 0.85rem 0.9rem !important;
                margin: 0 0 0.85rem 0 !important;
                background: #ffffff !important;
                border: 1px solid #e2e8f0 !important;
                border-radius: 14px !important;
                box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04) !important;
                position: relative !important;
            }
            #ajax-table-container .custom-table tbody td {
                display: block !important;
                width: 100% !important;
                padding: 0.55rem 0 !important;
                margin: 0 !important;
                border: none !important;
                background: transparent !important;
                border-radius: 0 !important;
                text-align: left !important;
                vertical-align: top !important;
                white-space: normal !important;
                overflow-wrap: anywhere !important;
            }
            /* Visual separator between sections within the card */
            #ajax-table-container .custom-table tbody td + td {
                border-top: 1px dashed #e2e8f0 !important;
                padding-top: 0.65rem !important;
            }
            /* Disable top dashed border for first content cell (Booking Info) */
            #ajax-table-container .custom-table tbody td[data-label="Booking Info"] {
                border-top: none !important;
                padding-top: 0.25rem !important;
            }
            @media (max-width: 800px) {
                .action-divider { display: none !important; }
            }
            /* Select cell: tuck the checkbox to top-right of the card */
            #ajax-table-container .custom-table tbody td[data-label="Select"] {
                position: absolute !important;
                top: 0.5rem !important;
                right: 0.6rem !important;
                width: auto !important;
                padding: 0 !important;
                border: none !important;
            }
            /* Action buttons: wrap onto multiple rows; never overflow right */
            #ajax-table-container .custom-table tbody td[data-label="Actions"] > div,
            #ajax-table-container .custom-table tbody td:last-child > div {
                flex-wrap: wrap !important;
                gap: 0.4rem !important;
                justify-content: flex-start !important;
            }
            /* Reserve top-right space for the checkbox on the first content cell */
            #ajax-table-container .custom-table tbody td[data-label="Booking Info"] {
                padding-right: 2.5rem !important;
            }
            /* Driver/phone/car pill: stop nowrap from clipping the car number */
            #ajax-table-container .custom-table tbody td[data-label="Route & Operations"] div[style*="white-space: nowrap"] {
                white-space: normal !important;
                flex-wrap: wrap !important;
                max-width: 100% !important;
            }
            #ajax-table-container .custom-table tbody td[data-label="Route & Operations"] div[style*="white-space: nowrap"] > * {
                white-space: nowrap;
            }
            /* Booking Info row badges (ONE WAY + CONFIRMED) wrap on tight viewports */
            #ajax-table-container .custom-table tbody td[data-label="Booking Info"] div[style*="display: flex"] {
                flex-wrap: wrap !important;
            }
        }

        /* ── Mobile fixes for the bookings page header ──────────────── */
        @media (max-width: 800px) {
            .page-header { padding: 0.85rem !important; }
            /* Row 1: heading + New Booking → keep on one line but shrink */
            .page-header > div:first-child {
                gap: 0.4rem !important;
            }
            .page-header > div:first-child h1 {
                font-size: 1rem !important;
                line-height: 1.2 !important;
            }
            .page-header > div:first-child > div:first-child > div:first-child {
                width: 34px !important;
                height: 34px !important;
            }
            .page-header > div:first-child > a.btn-primary {
                height: 36px !important;
                padding: 0 0.75rem !important;
                font-size: 0.7rem !important;
                white-space: nowrap !important;
                flex-shrink: 0 !important;
            }
            /* Row 2: search form keeps a single row on phones — input fills,
               buttons stay on the right. */
            .page-header form[action="bookings"] {
                min-width: 0 !important;
                width: 100% !important;
                flex-wrap: nowrap !important;
            }
            .page-header form[action="bookings"] > div {
                flex: 1 1 0% !important;
                min-width: 0 !important;
            }
            .page-header form[action="bookings"] input[type="text"] {
                font-size: 0.8rem !important;
            }
            .page-header form[action="bookings"] button.btn-primary {
                padding: 0 0.9rem !important;
                font-size: 0.75rem !important;
            }
            /* Tabs strip no longer scrolls horizontally — it wraps via flex-wrap.
               The old mask-image fade hint was removed because there's no
               longer any clipped content for it to point at. */
            .page-header > div:last-child a {
                font-size: 0.7rem !important;
                padding: 6px 12px !important;
            }
        }
    </style>

<!-- AJAX Target Container -->
<div id="ajax-table-container" style="transition: opacity 0.2s ease;">
    <div class="booking-cards-list">
        <?php foreach ($bookings as $booking): 
            $bookingRef = (string)($booking['booking_id'] ?? $booking['id']);
            $hasDriver = !empty($booking['driver_name']) && !empty($booking['driver_phone']);
            $detailsUrl = "customize-booking?id=" . (int)$booking['id'] . "&source=booking";
            $phoneFormatted = preg_replace('/\D/', '', $booking['customer_phone']);
            $assignmentComplete = dropcars_booking_assignment_complete($booking);
            $currentStatus = strtolower($booking['status'] ?? 'pending');
            $pTime = trim((string)$booking['pickup_time']);
            $displayTime = '';
            if ($pTime !== '') {
                $parsedTime = strtotime($pTime);
                $displayTime = ($parsedTime !== false && $parsedTime > 0) ? date('h:i A', $parsedTime) : $pTime;
            }
        ?>
            <div class="booking-card" onclick="if(!event.target.closest('a, button, input')) window.location.href='<?php echo $detailsUrl; ?>';" style="display: flex; flex-direction: row; gap: 12px; align-items: flex-start; padding: 1.15rem 1.25rem;">
                <!-- Checkbox corner pin -->
                <div style="flex-shrink: 0; display: flex; align-items: center; justify-content: center; padding-top: 1px; margin-left: -4px;" onclick="event.stopPropagation();">
                    <input type="checkbox" name="selected_ids[]" value="<?php echo $booking['id']; ?>" class="booking-checkbox" form="bulk-delete-form" style="width: 18px; height: 18px; cursor: pointer; accent-color: #3b82f6; margin: 0;">
                </div>

                <!-- Main Card Content wrapper -->
                <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.85rem;">
                    <!-- Top Row: Status, Reference & Customer -->
                    <div class="booking-card-top-row" style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
                    <!-- Left Side: Status & Reference -->
                    <div class="booking-card-top-left" style="flex: 1.1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start;">
                        <div class="status-badge-container" style="display: inline-flex; align-items: center; line-height: 1;">
                            <?php echo getBookingStatusBadge($booking['status'], $booking['responded_by'] ?? ''); ?>
                        </div>
                        <div class="booking-ref-copy" onclick="event.stopPropagation(); copyBookingId('<?php echo htmlspecialchars($bookingRef); ?>', this);" style="cursor: pointer; font-weight: 700; color: #4f46e5; font-size: 0.78rem; display: inline-flex; align-items: center; gap: 4px; margin-top: 4px; line-height: 1.3;" title="Click to copy ID">
                            #<?php echo htmlspecialchars($bookingRef); ?>
                            <i class="fa-regular fa-copy" style="font-size: 0.68rem; opacity: 0.6;"></i>
                            <?php if (!empty($booking['backend_request_id']) && ($booking['posting_status'] ?? '') === 'APPROVED'): ?>
                                <span style="font-size:0.6rem; font-weight:800; background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; padding:1px 5px; border-radius:4px; margin-left:2px;" title="Posted in Driver Marketplace">POSTED</span>
                            <?php endif; ?>
                        </div>
                    </div>

                    <!-- Center: Schedule -->
                    <div class="booking-card-top-center" style="flex: 0.8; min-width: 0; display: flex; flex-direction: column; align-items: center; text-align: center;">
                        <span style="font-size: 0.85rem; font-weight: 800; color: #0f172a; line-height: 1.3; white-space: nowrap; display: inline-flex; align-items: center; gap: 4px;">
                            <i class="fa-solid fa-calendar-day" style="font-size: 0.7rem; color: #4338ca;"></i> <?php echo date('d M', strtotime($booking['pickup_date'])); ?>
                        </span>
                        <?php if ($pTime !== ''): ?>
                        <span style="font-size: 0.78rem; color: #be185d; font-weight: 600; margin-top: 4px; line-height: 1.3; white-space: nowrap; display: inline-flex; align-items: center; gap: 4px;">
                            <i class="fa-regular fa-clock" style="font-size: 0.7rem;"></i> <?php echo htmlspecialchars($displayTime); ?>
                        </span>
                        <?php endif; ?>
                    </div>

                    <!-- Right Side: Customer -->
                    <div class="booking-card-top-right" style="flex: 1.3; min-width: 0; display: flex; flex-direction: column; align-items: flex-end; text-align: right;">
                        <div style="font-weight: 800; color: #0f172a; font-size: 0.85rem; line-height: 1.3; display: flex; align-items: center; justify-content: flex-end; gap: 6px; width: 100%; min-width: 0;">
                            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><?php echo htmlspecialchars($booking['customer_name']); ?></span>
                            <?php echo dropcars_get_lead_tier_badge($pdo, $booking['customer_phone'] ?? ''); ?>
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px; justify-content: flex-end;" onclick="event.stopPropagation();">
                            <a href="tel:<?php echo htmlspecialchars($phoneFormatted); ?>" style="font-size: 0.78rem; color: #64748b; font-weight: 600; text-decoration: none; display: inline-block; line-height: 1.3;" title="Click to call">
                                <?php echo htmlspecialchars($booking['customer_phone']); ?>
                            </a>
                        </div>
                    </div>
                </div>

                <!-- Route Cities Row (From / To, Trip Type & Vehicle) -->
                <div style="font-size: 0.8rem; color: #475569; display: flex; justify-content: space-between; align-items: center; font-weight: 600; border-top: 1px solid #f1f5f9; padding-top: 0.6rem; width: 100%; flex-wrap: nowrap !important;">
                    <!-- Locations stacked vertically -->
                    <div style="display: flex; flex-direction: column; gap: 4px; flex-grow: 1; min-width: 0; max-width: 70%;">
                        <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            <i class="fa-solid fa-circle-dot" style="color: #10b981; font-size: 0.7rem; flex-shrink: 0;"></i>
                            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.78rem; color: #334155; font-weight: 700;">
                                <?php 
                                    $pParts = explode(',', $booking['pickup_location']);
                                    echo htmlspecialchars(trim($pParts[0])); 
                                ?>
                            </span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            <i class="fa-solid fa-location-dot" style="color: #ef4444; font-size: 0.75rem; flex-shrink: 0;"></i>
                            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.78rem; color: #475569; font-weight: 700;">
                                <?php 
                                    $dParts = explode(',', $booking['drop_location']);
                                    echo htmlspecialchars(trim($dParts[0])); 
                                ?>
                            </span>
                        </div>
                    </div>
                    
                    <!-- Right Side badges (Trip Type & Vehicle Stacked) -->
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; margin-left: auto;">
                        <span style="font-size: 0.58rem; font-weight: 800; background: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; white-space: nowrap; letter-spacing: 0.02em;">
                            <?php 
                                $tType = strtolower(trim((string)($booking['trip_type'] ?? '')));
                                if ($tType === 'oneway' || $tType === 'one_way') {
                                    echo 'One Way';
                                } elseif ($tType === 'round' || $tType === 'round_trip' || $tType === 'roundtrip') {
                                    echo 'Round Trip';
                                } else {
                                    echo htmlspecialchars(str_replace('_', ' ', $tType));
                                }
                            ?>
                        </span>
                        <?php if (!empty($booking['vehicle_type'])): ?>
                        <span style="font-size: 0.58rem; font-weight: 800; background: #faf5ff; color: #6b21a8; border: 1px solid #e9d5ff; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; white-space: nowrap; letter-spacing: 0.02em;">
                            <?php echo htmlspecialchars($booking['vehicle_type']); ?>
                        </span>
                        <?php endif; ?>
                    </div>
                </div>

                <!-- Driver Assignment & Operations Area -->
                <div class="booking-card-driver-row" style="display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem; border-top: 1px dashed #f1f5f9; padding-top: 0.6rem; color: #64748b;">
                    <!-- Driver Info -->
                    <div style="display: flex; align-items: center; gap: 4px; min-width: 0; flex: 1;">
                        <?php if ($hasDriver): ?>
                            <div style="display: flex; align-items: center; gap: 0.4rem; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 3px 8px; border-radius: 8px; color: #166534; font-weight: 700; font-size: 0.75rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">
                                <i class="fa fa-user" style="font-size: 0.65rem; color: #16a34a; flex-shrink: 0;"></i>
                                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><?php echo htmlspecialchars($booking['driver_name']); ?></span>
                                <span style="font-family: monospace; font-size: 0.7rem; opacity: 0.85; margin-left: 2px; flex-shrink: 0;"><?php echo htmlspecialchars(strtoupper($booking['car_number'])); ?></span>
                            </div>
                            <a href="https://wa.me/<?php echo preg_replace('/\D/', '', $booking['driver_phone'] ?? ''); ?>?text=<?php echo urlencode("Hi " . $booking['driver_name'] . ", please tap this link to share live GPS location for Drop Cars Trip #" . $bookingRef . ": https://dropcars.in/pages/driver-live-location.php?booking_id=" . $bookingRef); ?>" target="_blank" onclick="event.stopPropagation();" style="font-size: 0.7rem; font-weight:700; padding: 3px 8px; border-radius: 6px; background:#128c7e; color:#fff; text-decoration:none; display:inline-flex; align-items:center; gap:4px;" title="Send Live Location link to driver on WhatsApp">
                                <i class="fa-brands fa-whatsapp"></i> Live Link
                            </a>
                        <?php else: ?>
                            <div style="font-size: 0.65rem; font-weight: 800; color: #b45309; background: #fef3c7; border: 1px solid #fde68a; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.02em; display: inline-flex; align-items: center; gap: 4px;">
                                <i class="fa-solid fa-triangle-exclamation" style="font-size: 0.6rem;"></i> Assignment Pending
                            </div>
                        <?php endif; ?>
                    </div>

                    <!-- Source Page / Lead Source (if any) -->
                    <?php if (!empty($booking['source_page'])): 
                        $bSrcPageLabel = ($booking['source_page'] === '/') ? 'Home' : ltrim($booking['source_page'], '/');
                    ?>
                        <span style="font-size: 0.65rem; color: #475569; font-weight: 700; display: inline-flex; align-items: center; gap: 3.5px; background: #f1f5f9; border: 1px solid #e2e8f0; padding: 2px 6px; border-radius: 6px;" title="<?php echo htmlspecialchars('Booking form page: ' . $booking['source_page']); ?>">
                            <i class="fa-solid fa-file-lines" style="font-size: 0.6rem; color: #64748b;"></i>
                            <span><?php echo htmlspecialchars($bSrcPageLabel); ?></span>
                        </span>
                    <?php endif; ?>
                </div>

                <!-- DateTime & Fare Row (Single Line) -->
                <div class="booking-card-fare-row" style="display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem; border-top: 1px dashed #f1f5f9; padding-top: 0.6rem; color: #64748b; font-weight: 600;">
                    <!-- Source and Date -->
                    <span style="color: #94a3b8; font-size: 0.7rem; font-weight: 500; letter-spacing: 0.01em;">
                        <?php echo htmlspecialchars(str_replace('_', ' ', $booking['source'] ?? '')); ?> | Received: <?php echo !empty($booking['created_at']) ? date('d M | H:i', strtotime($booking['created_at'])) : '--'; ?>
                    </span>
                    
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <strong style="color: #059669; font-size: 0.9rem; font-weight: 800;">₹<?php echo number_format((float)($booking['final_fare'] ?? 0)); ?></strong>
                        <span style="font-size: 0.65rem; color: #94a3b8; font-weight: 700; text-transform: uppercase;">
                            (<?php echo htmlspecialchars($booking['fare_type'] ?? 'flat'); ?>)
                        </span>
                    </div>
                </div>

                <!-- Action Buttons and WhatsApp Dropdown (Aligns on right) -->
                <div style="display: flex; justify-content: flex-end; align-items: center; gap: 8px; border-top: 1px solid #f1f5f9; padding-top: 0.6rem;" onclick="event.stopPropagation();">

                    <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                        <!-- WhatsApp Dropdown -->
                        <div class="dropdown-wa">
                            <button type="button" class="enquiry-pill enquiry-pill--whatsapp" title="WhatsApp Templates" onclick="toggleWaDropdown(event, this)" style="width: 28px; height: 28px; font-size: 0.8rem; border-radius: 8px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                                <i class="fa-brands fa-whatsapp"></i>
                            </button>
                            <div class="wa-dropdown-menu">
                                <a href="https://wa.me/<?php echo $phoneFormatted; ?>?text=<?php echo rawurlencode(dropcars_get_whatsapp_template('quote', $booking)); ?>" target="_blank">
                                    <i class="fa-solid fa-calculator" style="color: #6366f1; width: 14px;"></i> Send Fare Quote
                                </a>
                                <a href="https://wa.me/<?php echo $phoneFormatted; ?>?text=<?php echo rawurlencode(dropcars_get_whatsapp_template('confirm', $booking)); ?>" target="_blank">
                                    <i class="fa-solid fa-circle-check" style="color: #10b981; width: 14px;"></i> Send Confirmation
                                </a>
                                <?php if ($currentStatus === 'confirmed' || $currentStatus === 'pending'): ?>
                                    <a href="https://wa.me/<?php echo $phoneFormatted; ?>?text=<?php echo rawurlencode(dropcars_get_whatsapp_template('ask_advance', $booking)); ?>" target="_blank">
                                        <i class="fa-solid fa-indian-rupee-sign" style="color: #0284c7; width: 14px;"></i> Send Ask Advance
                                    </a>
                                <?php endif; ?>
                                <a href="https://wa.me/<?php echo $phoneFormatted; ?>?text=<?php echo rawurlencode(dropcars_get_whatsapp_template('followup', $booking)); ?>" target="_blank">
                                    <i class="fa-solid fa-reply" style="color: #f59e0b; width: 14px;"></i> Send Follow-up
                                </a>
                                <?php if ($hasDriver): ?>
                                    <a href="https://wa.me/<?php echo $phoneFormatted; ?>?text=<?php echo rawurlencode(dropcars_get_whatsapp_template('driver', $booking)); ?>" target="_blank">
                                        <i class="fa-solid fa-car" style="color: #0ea5e9; width: 14px;"></i> Send Driver Details
                                    </a>
                                <?php endif; ?>
                                <a href="https://wa.me/<?php echo $phoneFormatted; ?>?text=<?php echo rawurlencode(dropcars_get_whatsapp_template('complete', $booking)); ?>" target="_blank">
                                    <i class="fa-solid fa-flag-checkered" style="color: #64748b; width: 14px;"></i> Send Completion / Review
                                </a>
                            </div>
                        </div>

                        <?php if ($currentStatus === 'confirmed' || $currentStatus === 'pending'): ?>
                            <a href="https://wa.me/<?php echo $phoneFormatted; ?>?text=<?php echo rawurlencode(dropcars_get_whatsapp_template('ask_advance', $booking)); ?>" target="_blank" class="enquiry-pill" style="background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; width: 28px; height: 28px; font-size: 0.8rem; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; text-decoration: none;" title="Ask Advance (WhatsApp)">
                                <i class="fa-solid fa-indian-rupee-sign"></i>
                            </a>
                        <?php endif; ?>

                        <a href="customize-booking?id=<?php echo (int)$booking['id']; ?>&amp;source=booking" class="enquiry-pill" style="background: #fffbeb; color: #d97706; border: 1px solid #fde68a; width: 28px; height: 28px; font-size: 0.8rem; border-radius: 8px; display: flex; align-items: center; justify-content: center;" title="Customize Booking">
                            <i class="fa-solid fa-map-location-dot"></i>
                        </a>

                        <?php if ($currentStatus !== 'confirmed' && $currentStatus !== 'completed' && $currentStatus !== 'cancelled'): ?>
                        <button type="button" class="enquiry-pill" 
                                style="width: 28px; height: 28px; font-size: 0.8rem; display: flex; align-items: center; justify-content: center; border-radius: 8px; transition: all 0.15s; border: none; background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0;" 
                                title="Mark Confirmed" 
                                onclick="doBookingAction('confirmed', <?php echo (int)$booking['id']; ?>, 'Confirm booking?')">
                            <i class="fa fa-check-circle"></i>
                        </button>
                        <?php endif; ?>

                        <?php 
                        $isApprovedPost = (!empty($booking['backend_request_id']) && ($booking['posting_status'] ?? '') === 'APPROVED');
                        ?>
                        <?php if ($isApprovedPost): ?>
                            <button type="button" class="enquiry-pill" style="background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; width: 28px; height: 28px; font-size: 0.78rem; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center;" title="Posted in Driver Marketplace (#<?php echo htmlspecialchars((string)$booking['backend_request_id']); ?>) - Click to re-post" onclick="postSingleBooking(<?php echo (int)$booking['id']; ?>)">
                                <i class="fa-solid fa-cloud-arrow-up"></i>
                            </button>
                        <?php elseif ($currentStatus === 'confirmed' || $currentStatus === 'pending'): ?>
                            <button type="button" class="enquiry-pill" style="background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; width: 28px; height: 28px; font-size: 0.78rem; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center;" title="Auto Post to Driver Marketplace" onclick="postSingleBooking(<?php echo (int)$booking['id']; ?>)">
                                <i class="fa-solid fa-cloud-arrow-up"></i>
                            </button>
                        <?php endif; ?>

                        <button type="button" class="enquiry-pill" style="background: #f5f3ff; color: #7c3aed; border: 1px solid #ddd6fe; width: 28px; height: 28px; font-size: 0.8rem; border-radius: 8px;" title="Assign Driver" onclick="openAssignModal(<?php echo (int) $booking['id']; ?>, '<?php echo htmlspecialchars(addslashes($booking['driver_name'] ?? ''), ENT_QUOTES); ?>', '<?php echo htmlspecialchars(addslashes($booking['driver_phone'] ?? ''), ENT_QUOTES); ?>', '<?php echo htmlspecialchars(addslashes($booking['car_name'] ?? ''), ENT_QUOTES); ?>', '<?php echo htmlspecialchars(addslashes(strtoupper($booking['car_number'] ?? '')), ENT_QUOTES); ?>')">
                            <i class="fa fa-car"></i>
                        </button>
                        
                        <a href="customize-booking?id=<?php echo (int)$booking['id']; ?>&amp;source=booking" class="enquiry-pill enquiry-pill--manage" title="Manage" style="width: 28px; height: 28px; font-size: 0.8rem; border-radius: 8px;">
                            <i class="fa fa-gear"></i>
                        </a>

                        <form method="POST" style="display:inline;" onsubmit="return confirm('Spam this IP & mark as suspicious?');">
                           <input type="hidden" name="mark_spam" value="1">
                           <input type="hidden" name="booking_id" value="<?php echo (int)$booking['id']; ?>">
                           <input type="hidden" name="ip_address" value="<?php echo htmlspecialchars($booking['ip_address'] ?? ''); ?>">
                           <button type="submit" class="enquiry-pill" style="background: #fff1f2; color: #e11d48; border: 1px solid #fecdd3; width: 28px; height: 28px; font-size: 0.8rem; border-radius: 8px;" title="Mark as Spam IP">
                               <i class="fa-solid fa-shield-virus"></i>
                           </button>
                        </form>
                        
                        <?php if ($booking['status'] === 'completed'): ?>
                            <a href="booking-invoice?id=<?php echo (int)$booking['id']; ?>" target="_blank" class="enquiry-pill" style="background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; width: 28px; height: 28px; font-size: 0.8rem; border-radius: 8px;" title="Invoice">
                                <i class="fa fa-file-invoice"></i>
                            </a>
                        <?php endif; ?>

                        <!-- Visual Divider -->
                        <span class="action-divider" style="height: 18px; width: 1px; background: #e2e8f0; margin: 0 4px; display: inline-block; vertical-align: middle;"></span>

                        <!-- Status Switches -->
                        <button type="button" class="enquiry-pill" 
                                style="width: 28px; height: 28px; font-size: 0.8rem; display: flex; align-items: center; justify-content: center; border-radius: 8px; transition: all 0.15s; border: none; <?php echo $currentStatus === 'completed' ? 'background: #3b82f6; color: #fff; border: 1px solid #3b82f6;' : 'background: #eff6ff; color: #3b82f6; border: 1px solid #bfdbfe;'; ?>" 
                                title="Mark Completed" 
                                onclick="doBookingAction('completed', <?php echo (int)$booking['id']; ?>, 'Trip completed?', <?php echo $assignmentComplete ? 'true' : 'false'; ?>)">
                            <i class="fa fa-flag-checkered"></i>
                        </button>
                        <button type="button" class="enquiry-pill" 
                                style="width: 28px; height: 28px; font-size: 0.8rem; display: flex; align-items: center; justify-content: center; border-radius: 8px; transition: all 0.15s; border: none; <?php echo $currentStatus === 'cancelled' ? 'background: #ef4444; color: #fff; border: 1px solid #ef4444;' : 'background: #fef2f2; color: #ef4444; border: 1px solid #fecaca;'; ?>" 
                                title="Cancel" 
                                onclick="doBookingAction('cancelled', <?php echo (int) $booking['id']; ?>, 'Cancel?')">
                            <i class="fa fa-times-circle"></i>
                        </button>
                    </div>
                </div>
                </div> <!-- Closes Main Card Content wrapper -->
            </div>
        <?php endforeach; ?>

        <?php if (empty($bookings)): ?>
            <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 24px; text-align: center; padding: 6rem 2rem;">
                <i class="fa-solid fa-magnifying-glass" style="font-size: 4rem; color: #eeeeee; display: block; margin-bottom: 1rem;"></i>
                <div style="font-weight: 700; color: #94a3b8;">No bookings found matching your search.</div>
            </div>
        <?php endif; ?>

        <?php if ($totalPages > 1):
            $pagerParams = ['search' => $search ?: null, 'date' => $dateFilter ?: null, 'status' => $statusFilter ?: null, 'source' => $sourceFilter ?: null, 'sort' => $sortFilter !== 'next_first' ? $sortFilter : null, 'dispatcher' => $dispatcherFilter ?: null];
        ?>
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.5rem; margin-top: 1rem; border-radius: 16px; border: 1px solid #e2e8f0; background: #fff; flex-wrap: wrap; gap: 0.6rem;">
                <div style="font-size: 0.8rem; color: #64748b; font-weight: 600;">
                    Showing <?php echo $offset + 1; ?> to <?php echo min($offset + $limit, $totalCount); ?> of <?php echo $totalCount; ?> entries
                </div>
                <div style="display: flex; gap: 0.35rem;">
                    <?php if ($page > 1): ?>
                        <a href="<?php echo admin_url('bookings', array_filter($pagerParams + ['page' => $page - 1])); ?>"
                           style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: #475569; font-weight: 700; text-decoration: none; font-size: 0.85rem;">
                            <i class="fa fa-chevron-left" style="font-size: 0.7rem;"></i>
                        </a>
                    <?php endif; ?>
                    <?php
                    $startPage = max(1, $page - 2);
                    $endPage = min($totalPages, $page + 2);
                    for ($i = $startPage; $i <= $endPage; $i++):
                        $active = ($i === $page);
                    ?>
                        <a href="<?php echo admin_url('bookings', array_filter($pagerParams + ['page' => $i])); ?>"
                           style="display: inline-flex; align-items: center; justify-content: center; min-width: 32px; height: 32px; padding: 0 6px; border-radius: 8px; border: 1px solid <?php echo $active ? '#6366f1' : '#cbd5e1'; ?>; background: <?php echo $active ? '#6366f1' : '#fff'; ?>; color: <?php echo $active ? '#fff' : '#475569'; ?>; font-weight: 800; text-decoration: none; font-size: 0.82rem;">
                            <?php echo $i; ?>
                        </a>
                    <?php endfor; ?>
                    <?php if ($page < $totalPages): ?>
                        <a href="<?php echo admin_url('bookings', array_filter($pagerParams + ['page' => $page + 1])); ?>"
                           style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: #475569; font-weight: 700; text-decoration: none; font-size: 0.85rem;">
                            <i class="fa fa-chevron-right" style="font-size: 0.7rem;"></i>
                        </a>
                    <?php endif; ?>
                </div>
            </div>
        <?php endif; ?>
    </div>
</div>
                  <script>
(function() {
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
        
        // Dynamically lock dropdown width to match trigger button's width
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
})();

window.doBookingAction = function(action, id, message, assignmentOk) {
    if (action === 'completed' && assignmentOk === false) {
        alert('Assign driver and cab details before marking this booking as completed.\n\nUse "Assign Cab & Driver" or open Manage and fill driver name, phone, vehicle model, and plate number.');
        return;
    }
    if (!confirm(message)) return;
    var formMap = { confirmed: 'action-form-confirmed', completed: 'action-form-completed', cancelled: 'action-form-cancelled', fake: 'action-form-fake' };
    var idMap   = { confirmed: 'action-confirmed-id',  completed: 'action-completed-id',  cancelled: 'action-cancelled-id',  fake: 'action-fake-id'  };
    document.getElementById(idMap[action]).value = id;
    document.getElementById(formMap[action]).submit();
};

window.submitBulkBookingAction = function(action) {
    var checked = Array.from(document.querySelectorAll('.booking-checkbox:checked')).map(function(cb) { return cb.value; });
    if (!checked.length) {
        alert('Please select at least one booking.');
        return;
    }
    if (action === 'delete_selected') {
        if (!confirm('Permanently delete ' + checked.length + ' selected booking(s)?')) return;
    } else if (action === 'bulk_auto_post') {
        if (!confirm('Auto Post ' + checked.length + ' booking(s) to Driver Marketplace with calculated website tariffs?')) return;
    }
    var form = document.getElementById('bulk-general-form');
    document.getElementById('bulk-general-action').value = action;
    var inputsContainer = document.getElementById('bulk-general-inputs');
    inputsContainer.innerHTML = '';
    checked.forEach(function(id) {
        var inp = document.createElement('input');
        inp.type = 'hidden';
        inp.name = 'selected_ids[]';
        inp.value = id;
        inputsContainer.appendChild(inp);
    });
    form.submit();
};

window.postSingleBooking = function(id) {
    if (!confirm('Post booking #' + id + ' to Driver Marketplace?')) return;
    document.getElementById('single-post-booking-id').value = id;
    document.getElementById('single-post-form').submit();
};
 
document.addEventListener('DOMContentLoaded', function() {
    const selectAllBar = document.getElementById('select-all-bar');
    const selectAll = document.getElementById('select-all');
    const bulkBar = document.getElementById('bulk-actions-bar');
    const countDisplay = document.getElementById('selected-count');
 
    function updateBulkBar() {
        const currentCheckboxes = document.querySelectorAll('.booking-checkbox');
        const checkedCount = document.querySelectorAll('.booking-checkbox:checked').length;
        const allChecked = checkedCount === currentCheckboxes.length && currentCheckboxes.length > 0;
        const anyChecked = checkedCount > 0 && checkedCount < currentCheckboxes.length;

        if (checkedCount > 0) {
            bulkBar.style.display = 'flex';
            countDisplay.textContent = checkedCount;
        } else {
            bulkBar.style.display = 'none';
        }
        if (selectAll) {
            selectAll.checked = allChecked;
            selectAll.indeterminate = anyChecked;
        }
        if (selectAllBar) {
            selectAllBar.checked = allChecked;
            selectAllBar.indeterminate = anyChecked;
        }
    }
 
    if (selectAll) {
        selectAll.addEventListener('change', function() {
            document.querySelectorAll('.booking-checkbox').forEach(cb => cb.checked = selectAll.checked);
            updateBulkBar();
        });
    }
 
    if (selectAllBar) {
        selectAllBar.addEventListener('change', function() {
            document.querySelectorAll('.booking-checkbox').forEach(cb => cb.checked = selectAllBar.checked);
            updateBulkBar();
        });
    }
 
    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('booking-checkbox')) {
            updateBulkBar();
        }
    });

    // AJAX Filtering Logic
    const filterContainer = document.querySelector('.booking-status-tabs');
    if (filterContainer) {
        filterContainer.addEventListener('click', function(e) {
            const link = e.target.closest('a.booking-status-tab');
            if (!link) return;
            
            e.preventDefault();
            const url = link.href;
            const container = document.getElementById('ajax-table-container');
            
            container.style.opacity = '0.5';
            
            // Active State UI
            filterContainer.querySelectorAll('a').forEach(a => {
                a.style.background = '#f8fafc';
                a.style.color = '#475569';
                a.style.boxShadow = 'none';
                
                // restore count color logic
                const countSpan = a.querySelector('.booking-status-tab__count');
                if (countSpan) {
                    countSpan.style.color = '';
                }
            });
            
            link.style.background = '#6366f1';
            link.style.color = '#fff';
            const linkCount = link.querySelector('.booking-status-tab__count');
            if (linkCount) linkCount.style.color = '#fff';

            fetch(url)
                .then(response => response.text())
                .then(html => {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, 'text/html');
                    const newContent = doc.getElementById('ajax-table-container').innerHTML;
                    container.innerHTML = newContent;
                    container.style.opacity = '1';
                    
                    // Re-bind checkboxes
                    const newCheckboxes = container.querySelectorAll('.booking-checkbox');
                    newCheckboxes.forEach(cb => cb.addEventListener('change', updateBulkBar));
                    
                    history.pushState(null, '', url);
                    updateBulkBar();
                })
                .catch(err => {
                    console.error('AJAX Load Failed:', err);
                    window.location.href = url;
                });
        });
    }
});
</script>

<!-- Assign Cab & Driver Modal -->
<div id="assign-modal" style="display:none; position:fixed; inset:0; z-index:99999; background:rgba(15,23,42,0.55); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); overflow-y:auto; padding:2rem 1rem;">
    <div style="margin: auto; background:#fff; border-radius:20px; width:100%; max-width:480px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); overflow:hidden; animation: slideUp 0.3s ease; position:relative;">
        <!-- Header -->
        <div style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%); padding:1.5rem 1.75rem; display:flex; align-items:center; justify-content:space-between;">
            <div style="display:flex; align-items:center; gap:0.75rem;">
                <div style="width:40px;height:40px;background:rgba(247,183,51,0.15);border-radius:10px;display:flex;align-items:center;justify-content:center;">
                    <i class="fa-solid fa-car" style="color:#f7b733;font-size:1.1rem;"></i>
                </div>
                <div>
                    <div style="color:#fff;font-weight:800;font-size:1rem;font-family:'Outfit',sans-serif;">Assign Cab & Driver</div>
                    <div style="color:#94a3b8;font-size:0.75rem;margin-top:1px;">Booking <span id="assign-modal-booking-id" style="color:#f7b733;font-weight:700;"></span></div>
                </div>
            </div>
            <button onclick="closeAssignModal()" style="background:rgba(255,255,255,0.1);border:none;color:#fff;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center;">✕</button>
        </div>
        <!-- Body -->
        <div style="padding:1.75rem;">
            <div id="assign-modal-alert" style="display:none;margin-bottom:1rem;padding:0.75rem 1rem;border-radius:10px;font-size:0.85rem;font-weight:600;"></div>
            <form id="assign-driver-form" onsubmit="submitAssignment(event)">
                <input type="hidden" id="assign-booking-id" name="id" value="">
                <input type="hidden" name="action" value="assign_driver">
                <div id="assign-modal-fields-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div>
                        <label style="font-size:0.7rem;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:6px;">Driver Name</label>
                        <input type="text" id="assign-driver-name" name="driver_name" class="form-control" placeholder="e.g. Rajan Kumar" style="font-size:0.875rem;">
                    </div>
                    <div>
                        <label style="font-size:0.7rem;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:6px;">Driver Phone</label>
                        <input type="tel" id="assign-driver-phone" name="driver_phone" class="form-control" placeholder="9876543210" style="font-size:0.875rem;">
                    </div>
                    <div>
                        <label style="font-size:0.7rem;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:6px;">Car Model</label>
                        <input type="text" id="assign-car-name" name="car_name" class="form-control" placeholder="e.g. Toyota Innova" style="font-size:0.875rem;">
                    </div>
                    <div>
                        <label style="font-size:0.7rem;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:6px;">Plate Number</label>
                        <input type="text" id="assign-car-number" name="car_number" class="form-control" placeholder="TN 00 XX 0000" style="font-size:0.875rem;text-transform:uppercase;font-weight:700;">
                    </div>
                </div>
                <div id="assign-modal-actions" style="margin-top:1.5rem;display:flex;gap:0.75rem;">
                    <button type="button" onclick="closeAssignModal()" class="btn btn-secondary" style="flex:1;">Cancel</button>
                    <button type="submit" id="assign-submit-btn" class="btn btn-primary" style="flex:2;background:linear-gradient(135deg,#0f172a,#1e293b);color:#f7b733;border:none;">
                        <i class="fa-solid fa-car"></i> Assign Fleet
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>

<style>
@keyframes slideUp {
    from { transform: translateY(30px); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
}
/* Highlighted row after assignment */
.booking-row--assigned {
    background: #f0fdf4 !important;
    transition: background 1s ease;
}

@media (max-width: 500px) {
    #assign-modal-fields-grid {
        grid-template-columns: 1fr !important;
        gap: 0.75rem !important;
    }
    #assign-modal-actions {
        flex-direction: column-reverse;
    }
    #assign-modal-actions button {
        width: 100%;
        padding: 0.8rem !important;
    }
    #assign-modal div[style*="padding:1.75rem"] {
        padding: 1.25rem !important;
    }
}
</style>

<script>
function openAssignModal(id, driverName, driverPhone, carName, carNumber) {
    var modal = document.getElementById('assign-modal');
    if (modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }
    
    document.getElementById('assign-booking-id').value    = id;
    document.getElementById('assign-modal-booking-id').textContent = '#' + id;
    document.getElementById('assign-driver-name').value   = driverName  || '';
    document.getElementById('assign-driver-phone').value  = driverPhone || '';
    document.getElementById('assign-car-name').value      = carName     || '';
    document.getElementById('assign-car-number').value    = carNumber   || '';
    var alert = document.getElementById('assign-modal-alert');
    alert.style.display = 'none';
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}
function closeAssignModal() {
    document.getElementById('assign-modal').style.display = 'none';
    document.body.style.overflow = '';
}
document.getElementById('assign-modal').addEventListener('click', function(e) {
    if (e.target === this) closeAssignModal();
});
function submitAssignment(e) {
    e.preventDefault();
    var btn = document.getElementById('assign-submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Saving...';

    var form = document.getElementById('assign-driver-form');
    var data = new FormData(form);
    fetch(window.location.href, {
        method: 'POST',
        body: data,
        headers: {
            'X-Requested-With': 'XMLHttpRequest'
        }
    }).then(function(r) {
        return r.text();
    }).then(function() {
        var alertEl = document.getElementById('assign-modal-alert');
        alertEl.style.cssText = 'display:block;background:#d1fae5;color:#065f46;border:1px solid #a7f3d0;padding:0.75rem 1rem;border-radius:10px;font-size:0.85rem;font-weight:600;margin-bottom:1rem;';
        alertEl.innerHTML = '<i class="fa fa-check-circle"></i> Booking details assigned successfully!';
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-car"></i> Update Details';
        setTimeout(function() { 
            closeAssignModal(); 
            location.reload();
        }, 1200);
    }).catch(function() {
        var alertEl = document.getElementById('assign-modal-alert');
        alertEl.style.cssText = 'display:block;background:#fee2e2;color:#991b1b;border:1px solid #fecaca;padding:0.75rem 1rem;border-radius:10px;font-size:0.85rem;font-weight:600;margin-bottom:1rem;';
        alertEl.innerHTML = '<i class="fa fa-exclamation-circle"></i> Save failed. Please try again.';
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-car"></i> Update Details';
    });
}
</script>