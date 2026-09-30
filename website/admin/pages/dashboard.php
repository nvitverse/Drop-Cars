<?php
/**
 * Admin Dashboard Page - High-Density Operations Hub
 * Optimized for maximum information throughput and speed.
 */

require_once __DIR__ . '/../includes/revenue.php';
require_once __DIR__ . '/../includes/google-sheets-status-sync.php';

// AJAX Action: Get WhatsApp Template
if (isset($_GET['action']) && $_GET['action'] === 'get_wa_template') {
    header('Content-Type: application/json');
    $id = (int)($_GET['id'] ?? 0);
    $type = trim($_GET['type'] ?? '');
    $recordType = trim($_GET['record_type'] ?? 'booking');
    try {
        if ($recordType === 'enquiry') {
            $stmt = $pdo->prepare("SELECT * FROM `enquiries` WHERE `id` = ? LIMIT 1");
            $stmt->execute([$id]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row) {
                // Mark enquiry as responded to (touched)
                $responder = $_SESSION['admin_name'] ?? 'Admin';
                $pdo->prepare("UPDATE `enquiries` SET `is_touched` = 1, `responded_by` = ? WHERE `id` = ?")
                    ->execute([$responder, $id]);

                // Map columns to match what functions.php expects
                $row['customer_name'] = $row['name'];
                $row['customer_phone'] = $row['phone'];
                require_once __DIR__ . '/../includes/functions.php';
                $tpl = dropcars_get_whatsapp_template($type, $row);
                echo json_encode(['success' => true, 'template' => $tpl, 'phone' => preg_replace('/\D/', '', $row['phone'])]);
            } else {
                echo json_encode(['success' => false, 'error' => 'Enquiry not found']);
            }
        } else {
            $stmt = $pdo->prepare("SELECT b.*, c.name as customer_name, c.phone as customer_phone
                FROM `bookings` b
                JOIN `customers` c ON b.customer_id = c.id
                WHERE b.id = ? LIMIT 1");
            $stmt->execute([$id]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row) {
                // Mark booking as responded to
                $responder = $_SESSION['admin_name'] ?? 'Admin';
                $pdo->prepare("UPDATE `bookings` SET `responded_by` = ? WHERE `id` = ?")
                    ->execute([$responder, $id]);

                require_once __DIR__ . '/../includes/functions.php';
                $tpl = dropcars_get_whatsapp_template($type, $row);
                echo json_encode(['success' => true, 'template' => $tpl, 'phone' => preg_replace('/\D/', '', $row['customer_phone'])]);
            } else {
                echo json_encode(['success' => false, 'error' => 'Booking not found']);
            }
        }
    } catch (Throwable $e) {
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
    exit;
}

// AJAX: render only the Live Mission Control leads fragment (no layout) for live filtering.
if (isset($_GET['ajax']) && $_GET['ajax'] === 'leads') {
    require __DIR__ . '/../includes/dashboard-leads-query.php';
    require __DIR__ . '/../includes/dashboard-leads-table.php';
    exit;
}

// Fetch Stats
$activeSite = dropcars_get_active_website();
if ($activeSite !== 'all') {
    $totalBookingsStmt = $pdo->prepare("SELECT COUNT(*) FROM `bookings` WHERE `website` = ?");
    $totalBookingsStmt->execute([$activeSite]);
    $totalBookings = $totalBookingsStmt->fetchColumn();

    $todayBookingsStmt = $pdo->prepare("SELECT COUNT(*) FROM `bookings` WHERE `website` = ? AND DATE(`created_at`) = CURDATE()");
    $todayBookingsStmt->execute([$activeSite]);
    $todayBookings = $todayBookingsStmt->fetchColumn();

    $revenueOverall = dropcars_admin_sum_company_revenue_completed($pdo, $activeSite);

    $confirmedBookingsStmt = $pdo->prepare("SELECT COUNT(*) FROM `bookings` WHERE `website` = ? AND `status` = 'confirmed'");
    $confirmedBookingsStmt->execute([$activeSite]);
    $confirmedBookings = $confirmedBookingsStmt->fetchColumn();

    $cancelledBookingsStmt = $pdo->prepare("SELECT COUNT(*) FROM `bookings` WHERE `website` = ? AND `status` = 'cancelled'");
    $cancelledBookingsStmt->execute([$activeSite]);
    $cancelledBookings = $cancelledBookingsStmt->fetchColumn();

    $completedBookingsStmt = $pdo->prepare("SELECT COUNT(*) FROM `bookings` WHERE `website` = ? AND `status` = 'completed'");
    $completedBookingsStmt->execute([$activeSite]);
    $completedBookings = $completedBookingsStmt->fetchColumn();

    $totalEnquiriesStmt = $pdo->prepare("SELECT COUNT(*) FROM `enquiries` WHERE `website` = ?");
    $totalEnquiriesStmt->execute([$activeSite]);
    $totalEnquiries = $totalEnquiriesStmt->fetchColumn();
} else {
    $totalBookings = $pdo->query("SELECT COUNT(*) FROM `bookings`")->fetchColumn();
    $todayBookings = $pdo->query("SELECT COUNT(*) FROM `bookings` WHERE DATE(`created_at`) = CURDATE()")->fetchColumn();
    $revenueOverall = dropcars_admin_sum_company_revenue_completed($pdo);
    $confirmedBookings = $pdo->query("SELECT COUNT(*) FROM `bookings` WHERE `status` = 'confirmed'")->fetchColumn();
    $cancelledBookings = $pdo->query("SELECT COUNT(*) FROM `bookings` WHERE `status` = 'cancelled'")->fetchColumn();
    $completedBookings = $pdo->query("SELECT COUNT(*) FROM `bookings` WHERE `status` = 'completed'")->fetchColumn();
    $totalEnquiries = $pdo->query("SELECT COUNT(*) FROM `enquiries`")->fetchColumn();
}

// Handle Actions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_POST['action']) && $_POST['action'] === 'assign_driver') {
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

            try {
                require_once __DIR__ . '/../../includes/notification-engine.php';
                dropcars_dispatch_notifications($pdo, $id, 'driver_assigned');
            } catch (\Throwable $e) {
                error_log('Dashboard Assign Notification Error: ' . $e->getMessage());
            }

            // Sync to Google Sheets
            $syncStmt = $pdo->prepare("SELECT b.*, c.name AS customer_name, c.phone AS customer_phone FROM `bookings` b JOIN `customers` c ON b.customer_id = c.id WHERE b.id = ?");
            $syncStmt->execute([$id]);
            $syncRow = $syncStmt->fetch(PDO::FETCH_ASSOC);
            if ($syncRow) {
                dropcars_admin_sync_booking_status_row($syncRow, $syncRow['status']);
            }

            if (isset($_SERVER['HTTP_X_REQUESTED_WITH']) && $_SERVER['HTTP_X_REQUESTED_WITH'] === 'XMLHttpRequest') {
                echo "success";
                exit;
            }
        }
    }

    $recordType = trim($_POST['record_type'] ?? 'booking');

    if (isset($_POST['mark_confirmed_id'])) {
        $cId = (int) $_POST['mark_confirmed_id'];
        if ($cId > 0 && isset($pdo)) {
            if ($recordType === 'enquiry') {
                $stmt = $pdo->prepare("SELECT * FROM `enquiries` WHERE `id` = ?");
                $stmt->execute([$cId]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($row) {
                    require_once __DIR__ . '/../includes/functions.php';
                    $newBid = dropcars_enquiry_confirmed_booking_id($row['booking_id'] ?? '', $pdo);
                    $pdo->prepare("DELETE FROM `enquiries` WHERE `id` = ?")->execute([$cId]);

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
                            'source_page'   => $row['source_page'] ?? '',
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
                        'confirmed',
                        '',
                        $_SESSION['admin_name'] ?? 'Admin'
                    );

                    try {
                        require_once __DIR__ . '/../../includes/notification-engine.php';
                        dropcars_dispatch_notifications($pdo, $newBid, 'confirmed');
                    } catch (\Throwable $e) {
                        error_log('Dashboard Confirm Notification Error: ' . $e->getMessage());
                    }

                    $syncStmt = $pdo->prepare("SELECT b.*, c.name AS customer_name, c.phone AS customer_phone FROM `bookings` b JOIN `customers` c ON b.customer_id = c.id WHERE b.booking_id = ?");
                    $syncStmt->execute([$newBid]);
                    $syncRow = $syncStmt->fetch(PDO::FETCH_ASSOC);
                    if ($syncRow) {
                        dropcars_admin_sync_booking_status_row($syncRow, 'confirmed');
                    }
                }
            } else {
                $pdo->prepare("UPDATE `bookings` SET `status` = 'confirmed' WHERE `id` = ?")->execute([$cId]);
                $bStmt = $pdo->prepare("SELECT * FROM `bookings` WHERE `id` = ?");
                $bStmt->execute([$cId]);
                $bRow = $bStmt->fetch(PDO::FETCH_ASSOC);
                if ($bRow) {
                    $pdo->prepare("DELETE FROM `enquiries` WHERE `booking_id` = ? OR (SUBSTRING(`booking_id`, 2) = SUBSTRING(?, 2))")
                        ->execute([$bRow['booking_id'], $bRow['booking_id']]);

                    try {
                        require_once __DIR__ . '/../../includes/notification-engine.php';
                        dropcars_dispatch_notifications($pdo, $cId, 'confirmed');
                    } catch (\Throwable $e) {
                        error_log('Dashboard Confirm Notification Error: ' . $e->getMessage());
                    }

                    $syncStmt = $pdo->prepare("SELECT b.*, c.name AS customer_name, c.phone AS customer_phone FROM `bookings` b JOIN `customers` c ON b.customer_id = c.id WHERE b.id = ?");
                    $syncStmt->execute([$cId]);
                    $syncRow = $syncStmt->fetch(PDO::FETCH_ASSOC);
                    if ($syncRow) {
                        dropcars_admin_sync_booking_status_row($syncRow, 'confirmed');
                    }
                }
            }
            header('Location: ' . admin_url('dashboard', ['msg' => 'confirmed']));
            exit;
        }
    }

    if (isset($_POST['mark_waiting_id'])) {
        $cId = (int) $_POST['mark_waiting_id'];
        if ($cId > 0 && isset($pdo)) {
            if ($recordType === 'enquiry') {
                $stmt = $pdo->prepare("SELECT * FROM `enquiries` WHERE `id` = ?");
                $stmt->execute([$cId]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($row) {
                    require_once __DIR__ . '/../includes/enquiries-schema.php';
                    $wbid = preg_replace('/[^A-Za-z0-9]/', '', (string) ($row['booking_id'] ?? ''));
                    if ($wbid === '') {
                        $wbid = dropcars_next_enquiry_booking_id($pdo, 'E');
                    } elseif (preg_match('/^(?:DE|E|DC|C)(.+)$/i', $wbid, $m)) {
                        $wbid = 'E' . $m[1];
                    } else {
                        $wbid = 'E' . $wbid;
                    }

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
                            'source_page'   => $row['source_page'] ?? '',
                        ],
                        (string) $wbid,
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
                        'pending',
                        '',
                        $_SESSION['admin_name'] ?? 'Admin'
                    );

                    $pdo->prepare("DELETE FROM `enquiries` WHERE `id` = ?")->execute([$cId]);

                    $syncStmt = $pdo->prepare("SELECT b.*, c.name AS customer_name, c.phone AS customer_phone FROM `bookings` b JOIN `customers` c ON b.customer_id = c.id WHERE b.booking_id = ?");
                    $syncStmt->execute([$wbid]);
                    $syncRow = $syncStmt->fetch(PDO::FETCH_ASSOC);
                    if ($syncRow) {
                        dropcars_admin_sync_booking_status_row($syncRow, 'pending');
                    }
                }
            } else {
                $pdo->prepare("UPDATE `bookings` SET `status` = 'pending', `responded_by` = ? WHERE `id` = ?")->execute([$_SESSION['admin_name'] ?? 'Admin', $cId]);
                $syncStmt = $pdo->prepare("SELECT b.*, c.name AS customer_name, c.phone AS customer_phone FROM `bookings` b JOIN `customers` c ON b.customer_id = c.id WHERE b.id = ?");
                $syncStmt->execute([$cId]);
                $syncRow = $syncStmt->fetch(PDO::FETCH_ASSOC);
                if ($syncRow) {
                    dropcars_admin_sync_booking_status_row($syncRow, 'pending');
                }
            }
            header('Location: ' . admin_url('dashboard', ['status' => 'waiting', 'msg' => 'marked_waiting']));
            exit;
        }
    }

    if (isset($_POST['mark_fake_id'])) {
        $fId = (int) $_POST['mark_fake_id'];
        if ($fId > 0 && isset($pdo)) {
            require_once __DIR__ . '/../includes/blocked-ips-schema.php';
            if ($recordType === 'enquiry') {
                $stmt = $pdo->prepare("SELECT `ip_address`, `booking_id` FROM `enquiries` WHERE `id` = ?");
                $stmt->execute([$fId]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($row) {
                    $pdo->prepare("UPDATE `enquiries` SET `status` = 'fake' WHERE `id` = ?")->execute([$fId]);
                    if (!empty($row['ip_address'])) {
                        dropcars_admin_block_spam_ip($pdo, (string) $row['ip_address'], 'Marked as spam from admin dashboard', 'enquiry', $fId);
                    }
                    if (!empty($row['booking_id'])) {
                        $pdo->prepare("UPDATE `bookings` SET `status` = 'cancelled' WHERE `booking_id` = ? OR (SUBSTRING(`booking_id`, 2) = SUBSTRING(?, 2))")->execute([$row['booking_id'], $row['booking_id']]);
                    }
                }
            } else {
                $stmt = $pdo->prepare("SELECT `ip_address`, `booking_id` FROM `bookings` WHERE `id` = ?");
                $stmt->execute([$fId]);
                $bRow = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($bRow) {
                    $pdo->prepare("UPDATE `bookings` SET `status` = 'cancelled' WHERE `id` = ?")->execute([$fId]);
                    if (!empty($bRow['ip_address'])) {
                        dropcars_admin_block_spam_ip($pdo, (string) $bRow['ip_address'], 'Marked as spam from admin dashboard', 'booking', $fId);
                    }
                    $pdo->prepare("UPDATE `enquiries` SET `status` = 'fake' WHERE `booking_id` = ? OR (SUBSTRING(`booking_id`, 2) = SUBSTRING(?, 2))")
                        ->execute([$bRow['booking_id'], $bRow['booking_id']]);

                    try {
                        require_once __DIR__ . '/../../includes/notification-engine.php';
                        dropcars_dispatch_notifications($pdo, $fId, 'cancelled');
                    } catch (\Throwable $e) {
                        error_log('Dashboard Cancel Notification Error: ' . $e->getMessage());
                    }
                }
            }
            header('Location: ' . admin_url('dashboard', ['msg' => 'marked_spam']));
            exit;
        }
    }

    // Bulk actions: confirm or cancel multiple bookings/enquiries at once
    if (isset($_POST['bulk_action']) && in_array($_POST['bulk_action'], ['confirm', 'cancel'], true)) {
        $items = $_POST['selected_ids'] ?? [];
        $enquiryIds = [];
        $bookingIds = [];
        foreach ($items as $item) {
            $parts = explode(':', $item);
            if (count($parts) === 2) {
                $type = $parts[0];
                $id = (int)$parts[1];
                if ($type === 'enquiry') {
                    $enquiryIds[] = $id;
                } else {
                    $bookingIds[] = $id;
                }
            } else {
                $bookingIds[] = (int)$item;
            }
        }

        if ($_POST['bulk_action'] === 'confirm') {
            // 1. Process Enquiries bulk confirm
            foreach ($enquiryIds as $cId) {
                $stmt = $pdo->prepare("SELECT * FROM `enquiries` WHERE `id` = ?");
                $stmt->execute([$cId]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($row) {
                    require_once __DIR__ . '/../includes/functions.php';
                    $newBid = dropcars_enquiry_confirmed_booking_id($row['booking_id'] ?? '', $pdo);
                    $pdo->prepare("UPDATE `enquiries` SET `status` = 'confirmed', `booking_id` = ?, `responded_by` = ? WHERE `id` = ?")
                        ->execute([$newBid, $_SESSION['admin_name'] ?? 'Admin', $cId]);

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
                            'source_page'   => $row['source_page'] ?? '',
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
                        'confirmed',
                        '',
                        $_SESSION['admin_name'] ?? 'Admin'
                    );

                    try {
                        require_once __DIR__ . '/../../includes/notification-engine.php';
                        dropcars_dispatch_notifications($pdo, $newBid, 'confirmed');
                    } catch (\Throwable $e) {}

                    $syncStmt = $pdo->prepare("SELECT b.*, c.name AS customer_name, c.phone AS customer_phone FROM `bookings` b JOIN `customers` c ON b.customer_id = c.id WHERE b.booking_id = ?");
                    $syncStmt->execute([$newBid]);
                    $syncRow = $syncStmt->fetch(PDO::FETCH_ASSOC);
                    if ($syncRow) {
                        dropcars_admin_sync_booking_status_row($syncRow, 'confirmed');
                    }
                }
            }
            // 2. Process Bookings bulk confirm
            if (!empty($bookingIds)) {
                $placeholders = implode(',', array_fill(0, count($bookingIds), '?'));
                $pdo->prepare("UPDATE `bookings` SET `status` = 'confirmed' WHERE `id` IN ($placeholders)")->execute($bookingIds);
                
                require_once __DIR__ . '/../../includes/notification-engine.php';
                foreach ($bookingIds as $bId) {
                    try {
                        dropcars_dispatch_notifications($pdo, $bId, 'confirmed');
                    } catch (\Throwable $e) {}
                    
                    $bStmt = $pdo->prepare("SELECT * FROM `bookings` WHERE `id` = ?");
                    $bStmt->execute([$bId]);
                    $bRow = $bStmt->fetch(PDO::FETCH_ASSOC);
                    if ($bRow) {
                        $pdo->prepare("UPDATE `enquiries` SET `status` = 'confirmed' WHERE `booking_id` = ? OR (SUBSTRING(`booking_id`, 2) = SUBSTRING(?, 2))")
                            ->execute([$bRow['booking_id'], $bRow['booking_id']]);
                    }
                }

                $syncStmt = $pdo->prepare("SELECT b.*, c.name AS customer_name, c.phone AS customer_phone FROM `bookings` b JOIN `customers` c ON b.customer_id = c.id WHERE b.id IN ($placeholders)");
                $syncStmt->execute($bookingIds);
                foreach ($syncStmt->fetchAll(PDO::FETCH_ASSOC) as $syncRow) {
                    dropcars_admin_sync_booking_status_row($syncRow, 'confirmed');
                }
            }
            $countTotal = count($enquiryIds) + count($bookingIds);
            header('Location: ' . admin_url('dashboard', ['msg' => 'bulk_confirmed', 'count' => $countTotal]));
            exit;
        }

        if ($_POST['bulk_action'] === 'cancel') {
            // 1. Process Enquiries bulk spam
            require_once __DIR__ . '/../includes/blocked-ips-schema.php';
            foreach ($enquiryIds as $fId) {
                $stmt = $pdo->prepare("SELECT `ip_address`, `booking_id` FROM `enquiries` WHERE `id` = ?");
                $stmt->execute([$fId]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($row) {
                    $pdo->prepare("UPDATE `enquiries` SET `status` = 'fake' WHERE `id` = ?")->execute([$fId]);
                    if (!empty($row['ip_address'])) {
                        dropcars_admin_block_spam_ip($pdo, (string) $row['ip_address'], 'Bulk spam from admin dashboard', 'enquiry', $fId);
                    }
                    if (!empty($row['booking_id'])) {
                        $pdo->prepare("UPDATE `bookings` SET `status` = 'cancelled' WHERE `booking_id` = ? OR (SUBSTRING(`booking_id`, 2) = SUBSTRING(?, 2))")->execute([$row['booking_id'], $row['booking_id']]);
                    }
                }
            }
            // 2. Process Bookings bulk spam
            foreach ($bookingIds as $fId) {
                $stmt = $pdo->prepare("SELECT `ip_address`, `booking_id` FROM `bookings` WHERE `id` = ?");
                $stmt->execute([$fId]);
                $bRow = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($bRow) {
                    $pdo->prepare("UPDATE `bookings` SET `status` = 'cancelled' WHERE `id` = ?")->execute([$fId]);
                    if (!empty($bRow['ip_address'])) {
                        dropcars_admin_block_spam_ip($pdo, (string) $bRow['ip_address'], 'Bulk spam from admin dashboard', 'booking', $fId);
                    }
                    $pdo->prepare("UPDATE `enquiries` SET `status` = 'fake' WHERE `booking_id` = ? OR (SUBSTRING(`booking_id`, 2) = SUBSTRING(?, 2))")
                        ->execute([$bRow['booking_id'], $bRow['booking_id']]);

                    try {
                        require_once __DIR__ . '/../../includes/notification-engine.php';
                        dropcars_dispatch_notifications($pdo, $fId, 'cancelled');
                    } catch (\Throwable $e) {}
                }
            }
            $countTotal = count($enquiryIds) + count($bookingIds);
            header('Location: ' . admin_url('dashboard', ['msg' => 'bulk_cleared', 'count' => $countTotal]));
            exit;
        }
    }
}

// Live Mission Control filter parsing + leads query (shared with ?ajax=leads).
require __DIR__ . '/../includes/dashboard-leads-query.php';
    
$adminName = $_SESSION['admin_name'] ?? 'Admin';
?>

<div class="dashboard-welcome-premium">
    <div class="welcome-inner-container">
        <div class="welcome-left-block">
            <div class="welcome-icon-pulse" style="width: 44px; height: 44px; background: linear-gradient(135deg, var(--primary-color), #fcd34d); color: var(--secondary-color); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; box-shadow: 0 8px 16px rgba(247, 183, 51, 0.2); position: relative; flex-shrink: 0;">
                <i class="fa-solid fa-user-shield"></i>
                <div style="position: absolute; inset: -2px; border: 1.5px solid var(--primary-color); border-radius: 12px; opacity: 0.2; animation: iconPulse 2s infinite;"></div>
            </div>
            <div>
                <h1 style="margin: 0; font-size: 1.8rem; font-weight: 850; letter-spacing: -0.04em; line-height: 1.1; background: linear-gradient(135deg, #1e293b 30%, #475569 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Welcome back, Admin!</h1>
            </div>
        </div>
        <div class="welcome-right-block">
            <div class="date-pill-premium">
                <span class="date-text-premium"><?php echo date('d M Y'); ?></span>
                <span class="date-divider-premium">•</span>
                <span class="day-text-premium"><?php echo date('l'); ?></span>
            </div>
        </div>
    </div>
</div>

<?php
$unrespondedCount = (int)$pdo->query("SELECT COUNT(*) FROM `enquiries` e LEFT JOIN `bookings` b ON (b.booking_id = e.booking_id OR (e.booking_id LIKE 'E%' AND b.booking_id = CONCAT('C', SUBSTRING(e.booking_id, 2))) OR (e.booking_id LIKE 'DE%' AND b.booking_id = CONCAT('DC', SUBSTRING(e.booking_id, 3))) OR (e.booking_id LIKE 'DE%' AND b.booking_id = CONCAT('C', SUBSTRING(e.booking_id, 3)))) WHERE e.status NOT IN ('confirmed', 'fake') AND (b.status IS NULL OR b.status NOT IN ('confirmed', 'completed', 'cancelled', 'fake')) AND e.is_touched = 0 AND (e.dispatcher_notes IS NULL OR e.dispatcher_notes = '') AND (e.assigned_dispatcher IS NULL OR e.assigned_dispatcher = '') AND e.followup_time IS NULL")->fetchColumn();
if ($unrespondedCount > 0):
?>
<div style="background: #fffbeb; border: 1px solid #fef3c7; border-left: 4px solid #f59e0b; padding: 0.85rem 1.25rem; border-radius: 12px; display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: 1rem; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.05);">
    <div style="display: flex; align-items: center; gap: 0.75rem;">
        <div style="width: 32px; height: 32px; background: #fef3c7; color: #d97706; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.95rem;">
            <i class="fa-solid fa-clock-rotate-left"></i>
        </div>
        <div style="text-align: left;">
            <div style="font-weight: 850; font-size: 0.88rem; color: #92400e;">Unresponded CRM Leads!</div>
            <div style="font-size: 0.78rem; color: #b45309; font-weight: 600; margin-top: 1px;">You have <?php echo $unrespondedCount; ?> unresponded leads waiting to be called back.</div>
        </div>
    </div>
    <a href="enquiries?status=not_responded" class="btn" style="background: #f59e0b; color: #fff; font-weight: 800; font-size: 0.75rem; padding: 6px 14px; border-radius: 8px; text-decoration: none; white-space: nowrap; box-shadow: 0 3px 6px rgba(245,158,11,0.2);">Call Now</a>
</div>
<?php endif; ?>

<!-- Quick Actions: Aggressive Density Grid -->
<div class="dashboard-actions-grid">
    <a href="bookings-new" class="btn-action"><i class="fa-solid fa-calendar-plus"></i><span>New Booking</span></a>
    <a href="enquiries" class="btn-action"><i class="fa-solid fa-message"></i><span>Enquiries</span></a>
    <a href="bookings" class="btn-action"><i class="fa-solid fa-calendar-check"></i><span>Bookings</span></a>
    <a href="promotions" class="btn-action"><i class="fa-solid fa-bolt"></i><span>Promotions</span></a>
    <a href="reports" class="btn-action"><i class="fa-solid fa-chart-line"></i><span>Reports</span></a>
    <a href="sync-and-reset" class="btn-action" style="background: #fff1f2; color: #e11d48; border-color: #fecaca;"><i class="fa-solid fa-cloud-arrow-up" style="color: #e11d48;"></i><span>Sync & Clear</span></a>
</div>

<div class="premium-stat-grid">
    <div class="card stat-card stat-card--primary" style="padding: 1.25rem; margin-bottom: 0; display: flex; flex-direction: column; justify-content: space-between;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem;">
            <div>
                <div class="stat-value" style="font-size: 2.2rem; line-height: 1; color: var(--primary-color); font-weight: 950;"><?php echo $todayBookings; ?> <span style="font-size: 0.8rem; color: #94a3b8; font-weight: 600;">Today</span></div>
                <div class="stat-label" style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 8px; font-weight: 800; color: #64748b;">Live Operations Velocity</div>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 1.1rem; font-weight: 900; color: #1e293b;"><?php echo $totalBookings; ?></div>
                <div style="font-size: 0.6rem; text-transform: uppercase; font-weight: 700; color: #94a3b8;">Gross Leads</div>
            </div>
        </div>
        <div class="reactive-stat-grid">
            <a href="enquiries" class="reactive-stat-item" style="text-decoration: none; text-align: center;">
                <div style="font-size: 1rem; font-weight: 950; color: #1e293b;"><?php echo $totalEnquiries; ?></div>
                <div style="font-size: 0.55rem; text-transform: uppercase; font-weight: 800; color: #94a3b8;">Queries</div>
            </a>
            <a href="bookings?status=confirmed" class="reactive-stat-item" style="text-decoration: none; text-align: center;">
                <div style="font-size: 1rem; font-weight: 950; color: #16a34a;"><?php echo $confirmedBookings; ?></div>
                <div style="font-size: 0.55rem; text-transform: uppercase; font-weight: 800; color: #94a3b8;">Active</div>
            </a>
            <a href="bookings?status=cancelled" class="reactive-stat-item" style="text-decoration: none; text-align: center;">
                <div style="font-size: 1rem; font-weight: 950; color: #ef4444;"><?php echo $cancelledBookings; ?></div>
                <div style="font-size: 0.55rem; text-transform: uppercase; font-weight: 800; color: #94a3b8;">Cancelled</div>
            </a>
            <a href="bookings?status=completed" class="reactive-stat-item" style="text-decoration: none; text-align: center;">
                <div style="font-size: 1rem; font-weight: 950; color: #3b82f6;"><?php echo $completedBookings; ?></div>
                <div style="font-size: 0.55rem; text-transform: uppercase; font-weight: 800; color: #94a3b8;">Completed</div>
            </a>
        </div>
    </div>
    
    <?php
    $configPath = __DIR__ . '/../../api/config.php';
    $configDocs = is_file($configPath) ? (include $configPath) : [];
    $targetRevenue = (float)($configDocs['revenueTarget'] ?? 3500);
    $revenuePercent = $targetRevenue > 0 ? min(100, round(($revenueOverall / $targetRevenue) * 100)) : 0;
    ?>
    <div style="display: flex; justify-content: center; align-items: center; width: 100%;">
        <div class="card stat-card" style="padding: 1.25rem; background: #fff; border: 1px solid #f1f5f9; width: 100%; max-width: 450px; margin-bottom: 0; display: flex; flex-direction: column; justify-content: center;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <div style="font-size: 0.65rem; text-transform: uppercase; font-weight: 900; color: #94a3b8; letter-spacing: 0.05em;">Target Pulse</div>
                <div style="font-size: 0.75rem; font-weight: 950; color: #16a34a; background: #f0fdf4; padding: 2px 8px; border-radius: 6px;"><?php echo $revenuePercent; ?>%</div>
            </div>
            <div style="margin-bottom: 1.25rem;">
                <div style="font-size: 1.8rem; font-weight: 950; color: #1e293b; line-height: 1;">₹<?php echo number_format($revenueOverall); ?></div>
                <div style="font-size: 0.65rem; font-weight: 600; color: #64748b; margin-top: 4px;">Commission Pipeline</div>
            </div>
            <div style="width: 100%; height: 6px; background: #f1f5f9; border-radius: 10px; overflow: hidden;">
                <div style="width: <?php echo $revenuePercent; ?>%; height: 100%; background: linear-gradient(90deg, #10b981, #059669); border-radius: 10px;"></div>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 8px; font-size: 0.6rem; font-weight: 800; color: #94a3b8;">
                <span>Current</span>
                <span>Goal: ₹<?php echo number_format($targetRevenue); ?></span>
            </div>
        </div>
    </div>
</div>

<style>
/* --- Premium Welcome Section Layout --- */
.dashboard-welcome-premium {
    position: relative;
    overflow: hidden;
    background: radial-gradient(circle at top right, rgba(247, 183, 51, 0.08), transparent 400px), radial-gradient(circle at bottom left, rgba(99, 102, 241, 0.05), transparent 400px);
    border: 1px solid #f1f5f9;
    box-shadow: 0 10px 40px rgba(0,0,0,0.04);
    padding: 1.5rem 2rem;
    border-radius: 16px;
    margin-bottom: 1.5rem;
}
.welcome-inner-container {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    position: relative;
    z-index: 1;
}
.welcome-left-block {
    display: flex;
    align-items: center;
    gap: 1rem;
}
.welcome-right-block {
    display: flex;
    align-items: center;
}
.date-pill-premium {
    background: rgba(255, 255, 255, 0.75);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    padding: 0.5rem 1.25rem;
    border-radius: 10px;
    border: 1px solid rgba(226, 232, 240, 0.6);
    display: flex;
    align-items: center;
    gap: 6px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.02);
    font-weight: 900;
    font-size: 0.9rem;
    color: #1e293b;
    font-family: 'Outfit', sans-serif;
    white-space: nowrap;
}
.date-divider-premium {
    color: #94a3b8;
}
.day-text-premium {
    color: #64748b;
}

@media (max-width: 768px) {
    .dashboard-welcome-premium {
        padding: 1.25rem 1.5rem;
    }
    .welcome-inner-container {
        flex-direction: column;
        text-align: center;
        gap: 1rem;
    }
    .welcome-left-block {
        flex-direction: column;
        gap: 0.5rem;
    }
    .welcome-right-block {
        justify-content: center;
        width: 100%;
    }
}

/* --- Premium Actions Grid --- */
.dashboard-actions-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 0.75rem;
    margin-top: 1rem;
    margin-bottom: 1.5rem;
}
.dashboard-actions-grid .btn-action {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 0.85rem 0.5rem;
    font-size: 0.78rem;
    font-weight: 800;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    color: #334155;
    text-decoration: none;
    transition: all 0.2s ease;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.02);
    gap: 0.5rem;
}
.dashboard-actions-grid .btn-action i {
    font-size: 1.15rem;
    color: var(--primary-color);
}
.dashboard-actions-grid .btn-action:hover {
    transform: translateY(-2px);
    border-color: var(--primary-color);
    box-shadow: 0 6px 15px rgba(247, 183, 51, 0.12);
    color: #0f172a;
}
@media (max-width: 991px) {
    .dashboard-actions-grid {
        grid-template-columns: repeat(3, 1fr);
    }
}
@media (max-width: 480px) {
    .dashboard-actions-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 0.5rem;
    }
}

/* --- Premium Stats Grid --- */
.premium-stat-grid {
    display: grid;
    grid-template-columns: 1.2fr 0.8fr;
    gap: 1.25rem;
    margin-top: 1.5rem;
    align-items: stretch;
}
.reactive-stat-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.75rem;
    border-top: 1px solid #f1f5f9;
    padding-top: 1.25rem;
    margin-top: 1.25rem;
}
@media (max-width: 991px) {
    .premium-stat-grid {
        grid-template-columns: 1fr;
    }
}
@media (max-width: 640px) {
    .reactive-stat-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 0.75rem;
    }
}

.dash-filter-bar { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.dash-filter-chip { display: inline-flex; align-items: center; gap: 7px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 0.42rem 0.68rem; transition: border-color 0.15s ease, box-shadow 0.15s ease; }
.dash-filter-chip:focus-within { border-color: #93c5fd; box-shadow: 0 0 0 3px rgba(59,130,246,0.12); }
.dash-filter-chip > i { font-size: 0.74rem; color: #94a3b8; flex: 0 0 auto; }
.dash-filter-chip > i.is-accent { color: #3b82f6; }
.dash-filter-chip select { border: none; outline: none; font-size: 0.75rem; font-weight: 700; color: #334155; cursor: pointer; max-width: 100%; -webkit-appearance: none; -moz-appearance: none; appearance: none; padding: 0 1.15rem 0 0; background-color: transparent; background-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 0.05rem center; background-size: 0.7rem; }
.dash-filter-chip span.df-label { font-size: 0.7rem; font-weight: 800; color: #64748b; text-transform: uppercase; }
.dash-filter-chip input[type="date"] { border: none; outline: none; font-size: 0.75rem; font-weight: 700; color: #334155; padding: 2px 0; background: transparent; }
.dash-logs-link { text-decoration: none; font-size: 0.65rem; font-weight: 900; color: #3b82f6; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; }
@media (max-width: 640px) {
    .dashboard-section-head { flex-direction: column; align-items: stretch !important; }
    .dashboard-section-head h2 { text-align: left; }
    .dash-filter-bar { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.5rem; width: 100%; }
    .dash-filter-chip { width: 100%; justify-content: flex-start; }
    .dash-filter-chip select { flex: 1 1 auto; width: 100%; }
    .dash-filter-chip[data-span="full"] { grid-column: 1 / -1; }
    .dash-logs-link { grid-column: 1 / -1; text-align: center; padding: 0.6rem; background: #eff6ff; border-radius: 10px; }
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
</style>
<div class="dashboard-section-head" style="margin-top: 2rem; display: flex; justify-content: space-between; align-items: center; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 1rem;">
    <h2 style="margin: 0; font-size: 1.1rem; font-weight: 900; color: #1e293b; letter-spacing: -0.02em;">Live Mission Control</h2>
    <div class="dash-filter-bar">
        <!-- Status -->
        <div class="dash-filter-chip" title="Status">
            <i class="fa-solid fa-circle-dot is-accent"></i>
            <select id="dashboard-status-filter" class="dashboard-filter-select" onchange="dashLoad(1)">
                <option value=""           <?php echo $dashStatusFilter === '' ? 'selected' : ''; ?>>Pending Response</option>
                <option value="waiting"    <?php echo $dashStatusFilter === 'waiting' ? 'selected' : ''; ?>>Waiting</option>
                <option value="confirmed"  <?php echo $dashStatusFilter === 'confirmed' ? 'selected' : ''; ?>>Confirmed</option>
                <option value="completed"  <?php echo $dashStatusFilter === 'completed' ? 'selected' : ''; ?>>Completed</option>
                <option value="cancelled"  <?php echo $dashStatusFilter === 'cancelled' ? 'selected' : ''; ?>>Cancelled</option>
                <option value="fake"       <?php echo $dashStatusFilter === 'fake' ? 'selected' : ''; ?>>Spam</option>
            </select>
        </div>
        <!-- Date -->
        <div class="dash-filter-chip" title="Date range">
            <i class="fa-solid fa-calendar-day"></i>
            <select id="dashboard-date-filter" class="dashboard-filter-select" onchange="dashOnDateChange(this)">
                <option value="all"        <?php echo $dashDateFilter === 'all' ? 'selected' : ''; ?>>All Time</option>
                <option value="today"      <?php echo $dashDateFilter === 'today' ? 'selected' : ''; ?>>Today</option>
                <option value="yesterday"  <?php echo $dashDateFilter === 'yesterday' ? 'selected' : ''; ?>>Yesterday</option>
                <option value="this_week"  <?php echo $dashDateFilter === 'this_week' ? 'selected' : ''; ?>>This Week</option>
                <option value="this_month" <?php echo $dashDateFilter === 'this_month' ? 'selected' : ''; ?>>This Month</option>
                <option value="custom"     <?php echo $dashDateFilter === 'custom' ? 'selected' : ''; ?>>Custom Range</option>
            </select>
        </div>
        <!-- Custom range (always in DOM, revealed when "Custom Range" is chosen; native date pickers open a calendar) -->
        <div id="dashboard-custom-range" class="dash-filter-chip" data-span="full" style="<?php echo $dashDateFilter === 'custom' ? '' : 'display:none;'; ?>">
            <i class="fa-solid fa-calendar-week"></i>
            <span class="df-label">From</span>
            <input type="date" id="dashboard-start-date" value="<?php echo htmlspecialchars($startDate); ?>"
                   onchange="dashOnCustomDates()">
            <span class="df-label">To</span>
            <input type="date" id="dashboard-end-date" value="<?php echo htmlspecialchars($endDate); ?>"
                   onchange="dashOnCustomDates()">
        </div>
        <!-- Sort -->
        <div class="dash-filter-chip" title="Sort by">
            <i class="fa-solid fa-arrow-down-wide-short"></i>
            <select id="dashboard-sort-filter" class="dashboard-filter-select" onchange="dashLoad(1)">
                <option value="newest"      <?php echo $dashSortFilter === 'newest' ? 'selected' : ''; ?>>Newest First</option>
                <option value="next_first"  <?php echo $dashSortFilter === 'next_first' ? 'selected' : ''; ?>>Operational Priority</option>
                <option value="travel_date" <?php echo $dashSortFilter === 'travel_date' ? 'selected' : ''; ?>>Travel Date</option>
                <option value="oldest"      <?php echo $dashSortFilter === 'oldest' ? 'selected' : ''; ?>>Oldest First</option>
            </select>
        </div>
        <a href="bookings" class="dash-logs-link">Operational Logs <i class="fa fa-arrow-right" style="margin-left: 4px;"></i></a>
    </div>
</div>

<!-- Bulk actions bar – Select all + Confirm/Clear (hidden by default, appears only when rows are selected) -->
<div id="dashboard-bulk-bar" style="display:none; align-items:center; justify-content:space-between; gap:0.75rem; flex-wrap:wrap; margin-bottom: 0.85rem; background:#ffffff; padding:10px 14px; border-radius:12px; border:1px solid #e2e8f0; box-shadow: 0 4px 14px rgba(15,23,42,0.05);">
    <div style="display:flex; align-items:center; gap:0.9rem;">
        <label style="display:inline-flex; align-items:center; gap:0.45rem; cursor:pointer; font-size:0.82rem; font-weight:800; color:#1e293b; user-select:none;">
            <input type="checkbox" id="dashboard-select-all" style="width:18px; height:18px; cursor:pointer; accent-color:#3b82f6;">
            Select all
        </label>
        <span style="display:inline-flex; align-items:center; gap:0.4rem; font-size:0.8rem; font-weight:700; color:#64748b;">
            <span id="dashboard-bulk-count" style="font-weight:800; color:#1e293b;">0</span> selected
        </span>
    </div>
    <div id="dashboard-bulk-actions" style="display:none; gap:0.5rem; flex-wrap:wrap;">
        <button type="submit" form="dashboard-bulk-form" name="bulk_action" value="confirm"
                style="padding:0.5rem 0.95rem; border:none; border-radius:8px; background:#16a34a; color:#fff; font-weight:800; font-size:0.78rem; cursor:pointer; box-shadow:0 3px 8px rgba(22,163,74,0.25);">
            <i class="fa fa-check" style="margin-right:5px;"></i>Confirm
        </button>
        <button type="submit" form="dashboard-bulk-form" name="bulk_action" value="cancel"
                onclick="return confirm('Cancel/clear the selected bookings?');"
                style="padding:0.5rem 0.95rem; border:none; border-radius:8px; background:#ef4444; color:#fff; font-weight:800; font-size:0.78rem; cursor:pointer; box-shadow:0 3px 8px rgba(239,68,68,0.25);">
            <i class="fa fa-ban" style="margin-right:5px;"></i>Clear
        </button>
    </div>
</div>

<!-- Action Forms (single-row quick actions) -->
<form id="action-form-confirmed" method="POST" action="dashboard" style="display:none;">
    <input type="hidden" name="mark_confirmed_id" id="action-confirmed-id">
    <input type="hidden" name="record_type" id="action-confirmed-type">
</form>
<form id="action-form-fake" method="POST" action="dashboard" style="display:none;">
    <input type="hidden" name="mark_fake_id" id="action-fake-id">
    <input type="hidden" name="record_type" id="action-fake-type">
</form>
<form id="action-form-waiting" method="POST" action="dashboard" style="display:none;">
    <input type="hidden" name="mark_waiting_id" id="action-waiting-id">
    <input type="hidden" name="record_type" id="action-waiting-type">
</form>

<form id="dashboard-bulk-form" method="POST" action="dashboard">
<div id="dashboard-leads-container">
<?php require __DIR__ . '/../includes/dashboard-leads-table.php'; ?>
</div>
</form>

<script>
// ---- Live Mission Control: AJAX filtering (no full page reload) ----
function dashCurrentFilters() {
    function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }
    return {
        status: val('dashboard-status-filter'),
        sort: val('dashboard-sort-filter'),
        date_filter: val('dashboard-date-filter'),
        start_date: val('dashboard-start-date'),
        end_date: val('dashboard-end-date')
    };
}

function dashBuildParams(f, page) {
    var p = new URLSearchParams();
    if (f.status) p.set('status', f.status);
    if (f.sort && f.sort !== 'newest') p.set('sort', f.sort);
    if (f.date_filter && f.date_filter !== 'all') p.set('date_filter', f.date_filter);
    if (f.date_filter === 'custom') {
        if (f.start_date) p.set('start_date', f.start_date);
        if (f.end_date) p.set('end_date', f.end_date);
    }
    if (page && page > 1) p.set('page', page);
    return p;
}

var dashLoadToken = 0;
function dashLoad(page) {
    var f = dashCurrentFilters();
    var p = dashBuildParams(f, page);
    // Keep the address bar in sync (bookmarkable / shareable), without the ajax flag.
    var pretty = p.toString();
    try { history.replaceState(null, '', 'dashboard' + (pretty ? '?' + pretty : '')); } catch (e) {}
    // Fetch just the leads fragment and swap it in.
    p.set('ajax', 'leads');
    var container = document.getElementById('dashboard-leads-container');
    if (!container) return;
    var token = ++dashLoadToken;
    container.style.transition = 'opacity 0.15s ease';
    container.style.opacity = '0.45';
    fetch('dashboard?' + p.toString(), { headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' })
        .then(function(r) { return r.text(); })
        .then(function(html) {
            if (token !== dashLoadToken) return; // a newer request superseded this one
            container.innerHTML = html;
            container.style.opacity = '1';
            dashInitBulk();
        })
        .catch(function() { container.style.opacity = '1'; });
}

// Date dropdown: "Custom Range" reveals the calendar inputs inline (no reload);
// every other option filters immediately.
function dashOnDateChange(sel) {
    var wrap = document.getElementById('dashboard-custom-range');
    if (sel.value === 'custom') {
        if (wrap) wrap.style.display = '';
        return; // reveal the date fields and wait for the user to pick dates
    }
    if (wrap) wrap.style.display = 'none';
    dashLoad(1);
}

// Fire the filter once the custom range has at least one bound chosen.
function dashOnCustomDates() {
    var s = document.getElementById('dashboard-start-date');
    var e = document.getElementById('dashboard-end-date');
    if ((s && s.value) || (e && e.value)) dashLoad(1);
}

// Back-compat shims for any older inline callers.
function updateDashboardFilters() { dashLoad(1); }
function updateDashboardCustomDates() { dashOnCustomDates(); }

function doDashboardAction(action, id, type, msg) {
    if (!confirm(msg)) return;
    if (action === 'confirmed') {
        document.getElementById('action-confirmed-id').value = id;
        document.getElementById('action-confirmed-type').value = type;
        document.getElementById('action-form-confirmed').submit();
    } else if (action === 'fake') {
        document.getElementById('action-fake-id').value = id;
        document.getElementById('action-fake-type').value = type;
        document.getElementById('action-form-fake').submit();
    } else if (action === 'waiting') {
        document.getElementById('action-waiting-id').value = id;
        document.getElementById('action-waiting-type').value = type;
        document.getElementById('action-form-waiting').submit();
    }
}

// Bulk-select: "Select all" master checkbox + per-row checkboxes.
// Re-bindable so it survives AJAX fragment swaps (no stale closures: the
// checkbox list is queried live on every refresh).
function dashBulkRefresh() {
    var checkboxes = document.querySelectorAll('.dashboard-bulk-cb');
    var bulkBar = document.getElementById('dashboard-bulk-bar');
    var actions = document.getElementById('dashboard-bulk-actions');
    var countEl = document.getElementById('dashboard-bulk-count');
    var selectAll = document.getElementById('dashboard-select-all');
    if (!countEl) return;
    var selected = 0;
    checkboxes.forEach(function(cb){ if (cb.checked) selected++; });
    countEl.textContent = selected;
    if (bulkBar) bulkBar.style.display = selected > 0 ? 'flex' : 'none';
    if (actions) actions.style.display = selected > 0 ? 'flex' : 'none';
    if (selectAll) {
        selectAll.checked = (selected === checkboxes.length && selected > 0);
        selectAll.indeterminate = (selected > 0 && selected < checkboxes.length);
    }
}

function dashInitBulk() {
    // Per-row checkboxes live inside the swapped container — bind freshly each time.
    document.querySelectorAll('.dashboard-bulk-cb').forEach(function(cb){
        if (cb.dataset.bound) return;
        cb.dataset.bound = '1';
        cb.addEventListener('change', dashBulkRefresh);
    });
    // The "select all" master lives in the bulk bar, which persists — bind once.
    var selectAll = document.getElementById('dashboard-select-all');
    if (selectAll && !selectAll.dataset.bound) {
        selectAll.dataset.bound = '1';
        selectAll.addEventListener('change', function(){
            document.querySelectorAll('.dashboard-bulk-cb').forEach(function(cb){ cb.checked = selectAll.checked; });
            dashBulkRefresh();
        });
    }
    dashBulkRefresh();
}

// Pagination: intercept "page" links inside the leads container and load via AJAX.
(function(){
    var container = document.getElementById('dashboard-leads-container');
    if (container && !container.dataset.pagerBound) {
        container.dataset.pagerBound = '1';
        container.addEventListener('click', function(ev){
            var a = ev.target.closest ? ev.target.closest('a[data-dash-page]') : null;
            if (!a) return;
            ev.preventDefault();
            var page = parseInt(a.getAttribute('data-dash-page'), 10);
            if (page > 0) dashLoad(page);
        });
    }
    dashInitBulk();
})();
</script>


<style>
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap');

@keyframes iconPulse { 0% { transform: scale(1); opacity: 0.2; } 50% { transform: scale(1.1); opacity: 0.4; } 100% { transform: scale(1.2); opacity: 0; } }
@keyframes modalSlideIn { from { opacity: 0; transform: scale(0.88) translateY(28px); } to { opacity: 1; transform: scale(1) translateY(0); } }
@keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
@keyframes routePulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.4); } 50% { box-shadow: 0 0 0 6px rgba(16,185,129,0); } }
@keyframes dropPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); } 50% { box-shadow: 0 0 0 6px rgba(239,68,68,0); } }

.action-btn-circle { width: 36px; height: 36px; border-radius: 10px; border: 1.5px solid rgba(0,0,0,0.05); display: flex; align-items: center; justify-content: center; font-size: 1rem; transition: 0.2s; cursor: pointer; text-decoration: none; }
.action-btn-circle:hover { transform: translateY(-3px); box-shadow: 0 6px 12px rgba(0,0,0,0.06); border-color: rgba(0,0,0,0.1); }
.action-btn-circle i { pointer-events: none; }

/* --- PREMIUM MODAL SYSTEM --- */
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

/* Badge styles */
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
.badge-record-type:empty { display: none; }

/* Card components inside modal */
.modal-card-container {
    background: #f8fafc;
    padding: 1.15rem 1.25rem;
    border-radius: 18px;
    border: 1px solid #eef2f7;
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.modal-card-container:hover {
    border-color: #e2e8f0;
    box-shadow: 0 2px 8px rgba(15,23,42,0.04);
}
.modal-card-label {
    font-size: 0.67rem;
    font-weight: 900;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    display: flex;
    align-items: center;
    gap: 5px;
}

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

/* Call/WA Buttons */
.action-btn-circle-enhanced {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.1rem;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
    text-decoration: none;
    border: 1.5px solid transparent;
    position: relative;
    overflow: hidden;
}
.action-btn-circle-enhanced::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    opacity: 0;
    transition: opacity 0.2s ease;
}
.action-btn-circle-enhanced:hover {
    transform: translateY(-4px) scale(1.08);
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
}
.action-btn-circle-enhanced:hover::before { opacity: 0.06; }
.action-btn-circle-enhanced.call-theme {
    background: #f1f5f9;
    color: #475569;
    border-color: #cbd5e1;
}
.action-btn-circle-enhanced.call-theme:hover {
    background: #e2e8f0;
    color: #1e293b;
    border-color: #94a3b8;
    box-shadow: 0 8px 20px rgba(71,85,105,0.15);
}
.action-btn-circle-enhanced.whatsapp-theme {
    background: linear-gradient(135deg, #f0fdf4, #dcfce7);
    color: #16a34a;
    border-color: #bbf7d0;
}
.action-btn-circle-enhanced.whatsapp-theme:hover {
    background: linear-gradient(135deg, #dcfce7, #bbf7d0);
    color: #14532d;
    border-color: #86efac;
    box-shadow: 0 8px 20px rgba(22,163,74,0.2);
}

/* Info Grid Cells */
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

/* Fleet Assignment styling */
.fleet-container {
    background: linear-gradient(145deg, #faf5ff, #f5f0ff);
    border: 1px solid #e9d5ff;
}
.fleet-cell-label {
    font-size: 0.63rem;
    color: #a855f7;
    font-weight: 800;
    display: block;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 3px;
}
.fleet-cell-value {
    font-size: 0.9rem;
    color: #4a1d96;
    font-weight: 800;
}
.license-plate-badge {
    background: linear-gradient(135deg, #fef9c3, #fef08a);
    color: #713f12;
    border: 2px solid #ca8a04;
    font-weight: 900;
    font-size: 0.78rem;
    padding: 3px 10px;
    border-radius: 6px;
    display: inline-block;
    letter-spacing: 0.06em;
    font-family: 'Courier New', monospace;
    box-shadow: 0 2px 6px rgba(202,138,4,0.2);
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
.btn-confirm-gradient {
    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
    color: #f7b733;
    border: none;
    box-shadow: 0 4px 12px rgba(15,23,42,0.25);
}
.btn-confirm-gradient:hover {
    background: linear-gradient(135deg, #334155 0%, #1e293b 100%);
    box-shadow: 0 8px 24px rgba(247, 183, 51, 0.25) !important;
    color: #ffd96a;
}
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
.btn-assign {
    background: linear-gradient(135deg, #f3e8ff, #ede9fe);
    color: #4c1d95;
    border-color: #c4b5fd;
}
.btn-assign:hover { background: linear-gradient(135deg, #ede9fe, #ddd6fe); box-shadow: 0 6px 16px rgba(107,33,168,0.18) !important; }
.btn-manage {
    background: #f1f5f9;
    color: #334155;
    border-color: #cbd5e1;
}
.btn-manage:hover { background: #e2e8f0; color: #0f172a; border-color: #94a3b8; }
.btn-spam {
    background: linear-gradient(135deg, #fef2f2, #fee2e2);
    color: #991b1b;
    border-color: #fca5a5;
}
.btn-spam:hover { background: linear-gradient(135deg, #fee2e2, #fecaca); box-shadow: 0 6px 16px rgba(185,28,28,0.18) !important; }

/* Form inputs */
.form-group-enhanced { display: flex; flex-direction: column; gap: 6px; }
.form-label-enhanced {
    font-size: 0.67rem;
    font-weight: 800;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    display: flex;
    align-items: center;
    gap: 4px;
}
.form-control-enhanced {
    padding: 0.7rem 0.9rem;
    border-radius: 12px;
    border: 1.5px solid #e2e8f0;
    font-size: 0.875rem;
    color: #1e293b;
    outline: none;
    transition: all 0.22s ease;
    background: #ffffff;
    font-family: 'Inter', sans-serif;
    box-shadow: 0 1px 3px rgba(15,23,42,0.04) inset;
}
.form-control-enhanced:hover { border-color: #94a3b8; }
.form-control-enhanced:focus {
    border-color: #818cf8;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.14), 0 1px 3px rgba(15,23,42,0.04) inset;
    background: #fafafe;
}
.license-plate-input {
    text-transform: uppercase;
    font-weight: 800;
    letter-spacing: 0.08em;
    font-family: 'Courier New', monospace;
}

/* Quick action icon strip inside details modal */
.dd-quick-btn {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    flex: 1;
    min-width: 44px;
    padding: 7px 4px 6px;
    border-radius: 12px;
    border: 1.5px solid transparent;
    cursor: pointer;
    font-size: 0.7rem;
    font-weight: 800;
    font-family: 'Outfit', 'Inter', sans-serif;
    letter-spacing: 0.01em;
    text-decoration: none;
    text-align: center;
    transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1);
    white-space: nowrap;
    background: #f1f5f9;
    color: #475569;
    line-height: 1;
}
.dd-quick-btn i { font-size: 0.95rem; pointer-events: none; }
.dd-quick-btn:hover { transform: translateY(-3px); box-shadow: 0 6px 14px rgba(15,23,42,0.1); }
.dd-quick-btn:active { transform: translateY(0); box-shadow: none; }
.dd-qb-confirm { background: linear-gradient(135deg,#dcfce7,#bbf7d0); color: #14532d; border-color: #86efac; }
.dd-qb-confirm:hover { background: linear-gradient(135deg,#bbf7d0,#86efac); box-shadow: 0 6px 14px rgba(22,163,74,0.2); }
.dd-qb-wait { background: linear-gradient(135deg,#e0f2fe,#bae6fd); color: #0c4a6e; border-color: #7dd3fc; }
.dd-qb-wait:hover { background: linear-gradient(135deg,#bae6fd,#7dd3fc); box-shadow: 0 6px 14px rgba(3,105,161,0.18); }
.dd-qb-customize { background: linear-gradient(135deg,#fffbeb,#fef3c7); color: #78350f; border-color: #fcd34d; }
.dd-qb-customize:hover { background: linear-gradient(135deg,#fef3c7,#fde68a); box-shadow: 0 6px 14px rgba(180,83,9,0.18); }
.dd-qb-assign { background: linear-gradient(135deg,#f3e8ff,#ede9fe); color: #4c1d95; border-color: #c4b5fd; }
.dd-qb-assign:hover { background: linear-gradient(135deg,#ede9fe,#ddd6fe); box-shadow: 0 6px 14px rgba(107,33,168,0.18); }
.dd-qb-manage { background: #f1f5f9; color: #334155; border-color: #cbd5e1; }
.dd-qb-manage:hover { background: #e2e8f0; color: #0f172a; border-color: #94a3b8; }
.dd-qb-spam { background: linear-gradient(135deg,#fef2f2,#fee2e2); color: #991b1b; border-color: #fca5a5; }
.dd-qb-spam:hover { background: linear-gradient(135deg,#fee2e2,#fecaca); box-shadow: 0 6px 14px rgba(185,28,28,0.18); }

/* WA Template buttons */
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
.booking-row--assigned { background: #f0fdf4 !important; transition: background 1s ease; }

/* Assign modal enhancements */
.assign-modal-input-group {
    background: #f8fafc;
    border: 1px solid #eef2f7;
    border-radius: 14px;
    padding: 1rem;
    transition: border-color 0.2s, box-shadow 0.2s;
}
.assign-modal-input-group:focus-within {
    border-color: #818cf8;
    box-shadow: 0 0 0 3px rgba(99,102,241,0.08);
    background: #fafafe;
}

@media (max-width: 500px) {
    #assign-modal-fields-grid { grid-template-columns: 1fr !important; gap: 0.75rem !important; }
    #assign-modal-actions { flex-direction: column-reverse; }
    #assign-modal-actions button, #assign-modal-actions a { width: 100%; padding: 0.8rem !important; }
    .admin-modal-window { border-radius: 20px !important; }
}
</style>

<!-- Premium WhatsApp Template Selection Modal -->
<div id="whatsapp-template-modal" class="admin-modal-backdrop">
    <div class="admin-modal-window" style="max-width:460px;" id="whatsapp-modal-content">
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
            <button onclick="closeWhatsAppModal()" class="admin-modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <!-- Customer chip -->
        <div style="padding:14px 26px 0;">
            <div style="display:inline-flex; align-items:center; gap:8px; background:#f0fdf4; border:1.5px solid #bbf7d0; border-radius:30px; padding:5px 14px 5px 8px;">
                <div style="width:26px;height:26px;background:linear-gradient(135deg,#16a34a,#14532d);border-radius:50%;display:flex;align-items:center;justify-content:center;">
                    <i class="fa-solid fa-user" style="font-size:0.7rem;color:#fff;"></i>
                </div>
                <span style="font-size:0.8rem; font-weight:700; color:#14532d;">For: <strong id="wa-modal-cust-name" style="color:#166534;"></strong></span>
            </div>
        </div>

        <!-- Body -->
        <div style="padding:16px 26px 24px; display:flex; flex-direction:column; gap:10px;" id="wa-options-container">
            <button type="button" onclick="sendWhatsAppTemplate('quote')" class="wa-template-opt-btn" style="animation-delay:0.05s">
                <span class="wa-opt-icon" style="background:linear-gradient(135deg,#dbeafe,#bfdbfe); color:#1d4ed8;"><i class="fa-solid fa-calculator"></i></span>
                <div>
                    <div class="wa-opt-title">Enquiry / Quote</div>
                    <div class="wa-opt-desc">Send estimated fare and travel metrics</div>
                </div>
                <i class="fa-solid fa-chevron-right" style="margin-left:auto;color:#cbd5e1;font-size:0.75rem;flex-shrink:0;"></i>
            </button>
            <button type="button" onclick="sendWhatsAppTemplate('confirm')" class="wa-template-opt-btn" style="animation-delay:0.1s">
                <span class="wa-opt-icon" style="background:linear-gradient(135deg,#dcfce7,#bbf7d0); color:#15803d;"><i class="fa-solid fa-circle-check"></i></span>
                <div>
                    <div class="wa-opt-title">Booking Confirmation</div>
                    <div class="wa-opt-desc">Send confirmed itinerary &amp; advance terms</div>
                </div>
                <i class="fa-solid fa-chevron-right" style="margin-left:auto;color:#cbd5e1;font-size:0.75rem;flex-shrink:0;"></i>
            </button>
            <button type="button" onclick="sendWhatsAppTemplate('driver')" class="wa-template-opt-btn" style="animation-delay:0.15s">
                <span class="wa-opt-icon" style="background:linear-gradient(135deg,#f3e8ff,#ede9fe); color:#7e22ce;"><i class="fa-solid fa-id-card"></i></span>
                <div>
                    <div class="wa-opt-title">Driver &amp; Cab Details</div>
                    <div class="wa-opt-desc">Send chauffeur contact &amp; plate number</div>
                </div>
                <i class="fa-solid fa-chevron-right" style="margin-left:auto;color:#cbd5e1;font-size:0.75rem;flex-shrink:0;"></i>
            </button>
            <button type="button" onclick="sendWhatsAppTemplate('followup')" class="wa-template-opt-btn" style="animation-delay:0.2s">
                <span class="wa-opt-icon" style="background:linear-gradient(135deg,#fffbeb,#fef3c7); color:#b45309;"><i class="fa-solid fa-clock-rotate-left"></i></span>
                <div>
                    <div class="wa-opt-title">Follow-up Alarm</div>
                    <div class="wa-opt-desc">Prompt customer to lock in their rate</div>
                </div>
                <i class="fa-solid fa-chevron-right" style="margin-left:auto;color:#cbd5e1;font-size:0.75rem;flex-shrink:0;"></i>
            </button>
            <button type="button" onclick="sendWhatsAppTemplate('cancelled')" class="wa-template-opt-btn" style="animation-delay:0.25s">
                <span class="wa-opt-icon" style="background:linear-gradient(135deg,#fef2f2,#fee2e2); color:#b91c1c;"><i class="fa-solid fa-ban"></i></span>
                <div>
                    <div class="wa-opt-title">Cancellation Notice</div>
                    <div class="wa-opt-desc">Confirm booking cancellation respectfully</div>
                </div>
                <i class="fa-solid fa-chevron-right" style="margin-left:auto;color:#cbd5e1;font-size:0.75rem;flex-shrink:0;"></i>
            </button>
        </div>

        <div id="wa-modal-loader" style="display:none; text-align:center; padding:32px 0 24px;">
            <div class="wa-modal-spinner"></div>
            <div style="font-size:0.78rem; color:#64748b; font-weight:700; margin-top:10px; font-family:'Outfit',sans-serif;">Generating template…</div>
        </div>
    </div>
</div>

<!-- Assign Cab & Driver Modal -->
<div id="assign-modal" class="admin-modal-backdrop">
    <div class="admin-modal-window" style="max-width:500px;">
        <!-- Header -->
        <div style="background:linear-gradient(135deg, #0f172a 0%, #1a2540 60%, #0d1b2e 100%); padding:22px 26px 20px; display:flex; align-items:center; justify-content:space-between; position:relative; overflow:hidden;">
            <!-- Decorative element -->
            <div style="position:absolute;top:-20px;right:20px;width:120px;height:120px;border-radius:50%;background:rgba(247,183,51,0.06);pointer-events:none;"></div>
            <div style="display:flex; align-items:center; gap:14px; position:relative;">
                <div style="width:48px;height:48px;background:linear-gradient(135deg,rgba(247,183,51,0.18),rgba(247,183,51,0.08));border:1px solid rgba(247,183,51,0.25);border-radius:14px;display:flex;align-items:center;justify-content:center;">
                    <i class="fa-solid fa-car-side" style="color:#f7b733;font-size:1.25rem;"></i>
                </div>
                <div>
                    <div style="color:#fff;font-weight:800;font-size:1.1rem;font-family:'Outfit',sans-serif;letter-spacing:-0.02em;">Assign Cab &amp; Driver</div>
                    <div style="color:#64748b;font-size:0.74rem;margin-top:2px;">Booking <span id="assign-modal-booking-id" style="color:#f7b733;font-weight:700;"></span></div>
                </div>
            </div>
            <button onclick="closeAssignModal()" class="admin-modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <!-- Body -->
        <div style="padding:22px 26px 26px;">
            <div id="assign-modal-alert" style="display:none;margin-bottom:1.25rem;padding:0.85rem 1.1rem;border-radius:12px;font-size:0.84rem;font-weight:700;"></div>
            <form id="assign-driver-form" onsubmit="submitAssignment(event)">
                <input type="hidden" id="assign-booking-id" name="id" value="">
                <input type="hidden" name="action" value="assign_driver">

                <!-- Section label -->
                <div style="font-size:0.67rem;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:14px;display:flex;align-items:center;gap:5px;">
                    <i class="fa-solid fa-user-tie"></i> Driver Details
                </div>
                <div id="assign-modal-fields-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px;">
                    <div class="form-group-enhanced">
                        <label class="form-label-enhanced"><i class="fa-solid fa-user-tag"></i> Driver Name</label>
                        <input type="text" id="assign-driver-name" name="driver_name" class="form-control-enhanced" placeholder="e.g. Rajan Kumar" autocomplete="off">
                    </div>
                    <div class="form-group-enhanced">
                        <label class="form-label-enhanced"><i class="fa-solid fa-phone"></i> Driver Phone</label>
                        <input type="tel" id="assign-driver-phone" name="driver_phone" class="form-control-enhanced" placeholder="9876543210" autocomplete="off">
                    </div>
                </div>

                <!-- Section label -->
                <div style="font-size:0.67rem;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:14px;display:flex;align-items:center;gap:5px;">
                    <i class="fa-solid fa-car"></i> Vehicle Details
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
                    <div class="form-group-enhanced">
                        <label class="form-label-enhanced"><i class="fa-solid fa-taxi"></i> Car Model</label>
                        <input type="text" id="assign-car-name" name="car_name" class="form-control-enhanced" placeholder="e.g. Toyota Innova" autocomplete="off">
                    </div>
                    <div class="form-group-enhanced">
                        <label class="form-label-enhanced"><i class="fa-solid fa-signature"></i> Plate Number</label>
                        <input type="text" id="assign-car-number" name="car_number" class="form-control-enhanced license-plate-input" placeholder="TN 00 XX 0000" autocomplete="off">
                    </div>
                </div>

                <!-- Divider -->
                <div style="height:1px;background:linear-gradient(to right,transparent,#e2e8f0,transparent);margin:22px 0;"></div>

                <div id="assign-modal-actions" style="display:flex;gap:10px;">
                    <button type="button" onclick="closeAssignModal()" class="action-btn-enhanced btn-manage" style="flex:1;padding:0.8rem;cursor:pointer;">
                        <i class="fa-solid fa-xmark"></i> Cancel
                    </button>
                    <button type="submit" id="assign-submit-btn" class="action-btn-enhanced btn-confirm-gradient" style="flex:2;padding:0.8rem;cursor:pointer;">
                        <i class="fa-solid fa-car"></i> Assign Fleet
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Live Mission Control: Lead/Booking Details Modal -->
<div id="dash-details-modal" class="admin-modal-backdrop">
    <div class="admin-modal-window" style="max-width: 560px;">

        <!-- Gradient Header Band -->
        <div style="background:linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #162032 100%); padding:14px 20px 14px; position:relative; overflow:hidden;">
            <!-- Decorative glows -->
            <div style="position:absolute;top:-30px;right:-20px;width:140px;height:140px;border-radius:50%;background:radial-gradient(circle,rgba(99,102,241,0.12),transparent 70%);pointer-events:none;"></div>
            <div style="position:absolute;bottom:-40px;left:10px;width:100px;height:100px;border-radius:50%;background:radial-gradient(circle,rgba(247,183,51,0.08),transparent 70%);pointer-events:none;"></div>

            <div style="display:flex;align-items:flex-start;justify-content:space-between;position:relative;">
                <div>
                    <span id="dd-record-type" class="badge-record-type">ENQUIRY</span>
                    <h3 id="dd-ref-id" style="margin:5px 0 5px;font-weight:900;font-size:1.15rem;color:#f8fafc;font-family:'Outfit',sans-serif;letter-spacing:-0.02em;line-height:1.1;">#E06190001</h3>
                    <div id="dd-badge-container" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;"></div>
                </div>
                <button onclick="closeDashDetailsModal()" class="admin-modal-close-btn" style="margin-top:2px;flex-shrink:0;"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>

        <!-- Body -->
        <div style="padding:22px 22px 26px; display:flex; flex-direction:column; gap:16px;">

            <!-- Customer Card -->
            <div class="modal-card-container" style="background:linear-gradient(145deg,#f8fafc,#f1f5f9);">
                <div class="modal-card-label"><i class="fa-solid fa-circle-user"></i> Customer Profile</div>
                <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <div style="width:42px;height:42px;background:linear-gradient(135deg,#6366f1,#4f46e5);border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 4px 12px rgba(99,102,241,0.25);">
                            <i class="fa-solid fa-user" style="color:#fff;font-size:1rem;"></i>
                        </div>
                        <div>
                            <strong id="dd-customer-name" style="font-size:1.05rem;color:#0f172a;display:block;font-weight:800;font-family:'Outfit',sans-serif;">John Doe</strong>
                            <span id="dd-customer-phone" style="font-size:0.82rem;color:#64748b;font-weight:700;font-family:monospace;">+91 9876543210</span>
                        </div>
                    </div>
                    <div style="display:flex; gap:8px;flex-shrink:0;">
                        <a id="dd-call-btn" href="tel:" class="action-btn-circle-enhanced call-theme" title="Call Customer">
                            <i class="fa-solid fa-phone"></i>
                        </a>
                        <button id="dd-wa-btn" type="button" class="action-btn-circle-enhanced whatsapp-theme" title="WhatsApp Customer">
                            <i class="fa-brands fa-whatsapp"></i>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Route Timeline -->
            <div class="modal-card-container timeline-container">
                <div class="modal-card-label"><i class="fa-solid fa-route"></i> Journey Route</div>
                <div id="dd-route-visualizer" class="route-visualizer" style="padding-left:4px;">
                    <!-- Rendered dynamically by JS -->
                </div>
            </div>

            <!-- Journey Parameters Grid -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <div class="modal-grid-cell">
                    <span class="grid-cell-label"><i class="fa-solid fa-calendar-days"></i> Travel Schedule</span>
                    <strong id="dd-schedule" class="grid-cell-value">-</strong>
                </div>
                <div class="modal-grid-cell">
                    <span class="grid-cell-label"><i class="fa-solid fa-taxi"></i> Service Type</span>
                    <strong id="dd-trip-vehicle" class="grid-cell-value">-</strong>
                </div>
                <div class="modal-grid-cell" style="background:linear-gradient(145deg,#f0fdf9,#ecfdf5);border-color:#d1fae5;">
                    <span class="grid-cell-label"><i class="fa-solid fa-indian-rupee-sign"></i> Fare Estimate</span>
                    <strong id="dd-fare-info" class="grid-cell-value fare-value-highlight">₹0</strong>
                </div>
                <div class="modal-grid-cell">
                    <span class="grid-cell-label"><i class="fa-solid fa-clock"></i> Received At</span>
                    <strong id="dd-recd-time" class="grid-cell-value">-</strong>
                </div>
            </div>

            <!-- Fleet Details (conditionally shown) -->
            <div id="dd-fleet-section" class="modal-card-container fleet-container" style="display:none;">
                <div class="modal-card-label" style="color:#7c3aed;"><i class="fa-solid fa-id-card-clip"></i> Assigned Fleet</div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div>
                        <span class="fleet-cell-label">Driver Name</span>
                        <strong id="dd-fleet-driver-name" class="fleet-cell-value">-</strong>
                    </div>
                    <div>
                        <span class="fleet-cell-label">Driver Phone</span>
                        <strong id="dd-fleet-driver-phone" class="fleet-cell-value">-</strong>
                    </div>
                    <div>
                        <span class="fleet-cell-label">Vehicle Model</span>
                        <strong id="dd-fleet-car-name" class="fleet-cell-value">-</strong>
                    </div>
                    <div>
                        <span class="fleet-cell-label">Registration</span>
                        <div class="license-plate-badge" id="dd-fleet-car-number">-</div>
                    </div>
                </div>
            </div>

            <!-- Operational Actions Block -->
            <div style="border-top:1px solid #f1f5f9; padding-top:18px; display:flex; flex-direction:column; gap:10px;">
                <div style="font-size:0.67rem;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:4px;">
                    <i class="fa-solid fa-gears"></i> Operational Actions
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <button id="dd-action-confirm" type="button" class="action-btn-enhanced btn-confirm">
                        <i class="fa-solid fa-circle-check"></i> Confirm Booking
                    </button>
                    <button id="dd-action-wait" type="button" class="action-btn-enhanced btn-wait">
                        <i class="fa-solid fa-hourglass-half"></i> Mark Waiting
                    </button>
                    <a id="dd-action-customize" href="#" class="action-btn-enhanced btn-customize">
                        <i class="fa-solid fa-sliders"></i> Customize Fare
                    </a>
                    <button id="dd-action-assign" type="button" class="action-btn-enhanced btn-assign">
                        <i class="fa-solid fa-car-side"></i> Assign Fleet
                    </button>
                    <button id="dd-action-spam" type="button" class="action-btn-enhanced btn-spam">
                        <i class="fa-solid fa-ban"></i> Mark Spam
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

        </div><!-- /body -->
    </div>
</div>

<script>
var activeWaBookingId = null;
var activeWaRecordType = null;

function openWhatsAppModal(bookingId, customerName, recordType) {
    activeWaBookingId = bookingId;
    activeWaRecordType = recordType || 'booking';
    document.getElementById('wa-modal-cust-name').textContent = customerName;
    
    // Reset view states
    document.getElementById('wa-options-container').style.display = 'flex';
    document.getElementById('wa-modal-loader').style.display = 'none';
    
    var modal = document.getElementById('whatsapp-template-modal');
    // Move to body to escape any stacking-context ancestors
    if (modal.parentElement !== document.body) {
        document.body.appendChild(modal);
        // Re-attach backdrop-click listener after reparenting
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeWhatsAppModal();
        });
    }
    modal.scrollTop = 0;
    modal.style.display = 'flex';
    modal.offsetHeight; // force reflow so CSS transition fires
    modal.classList.add('modal-visible');
    document.body.style.overflow = 'hidden';
}

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

window.sendWhatsAppTemplate = function(id, type, recordType) {
    fetch('/admin/dashboard?action=get_wa_template&id=' + id + '&type=' + type + '&record_type=' + recordType)
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success) {
                var url = 'https://wa.me/' + data.phone + '?text=' + encodeURIComponent(data.template);
                window.open(url, '_blank');
            } else {
                alert('Failed to get template: ' + data.error);
            }
        })
        .catch(function(err) {
            console.error(err);
            alert('Error loading WhatsApp template.');
        });
};

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
    var alertEl = document.getElementById('assign-modal-alert');
    if (alertEl) alertEl.style.display = 'none';
    
    modal.style.display = 'flex';
    modal.offsetHeight;
    modal.classList.add('modal-visible');
    document.body.style.overflow = 'hidden';
}

function closeAssignModal() {
    var modal = document.getElementById('assign-modal');
    modal.classList.remove('modal-visible');
    setTimeout(function() {
        modal.style.display = 'none';
    }, 250);
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
    }).then(function(res) {
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

function openDashLeadDetails(booking) {
    var ref = booking.booking_id;
    if (!ref) {
        var prefix = (booking.status === 'confirmed' || booking.status === 'completed') ? 'C' : 'E';
        var createdTime = booking.created_at ? new Date(booking.created_at).getTime() : new Date().getTime();
        var d = new Date(createdTime);
        var md = ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2);
        ref = prefix + md + String(booking.id).padStart(4, '0');
    }
    
    document.getElementById('dd-ref-id').textContent = '#' + ref;
    var typeEl = document.getElementById('dd-record-type');
    var statusText = '';
    var statusBg = '';
    var statusColor = '';
    var statusBorder = '';

    var bStatus = (booking.status || '').toLowerCase();
    var bResponded = (booking.responded_by || '').trim();

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
    } else if (bStatus === 'confirmed' || bStatus === 'completed') {
        statusText = 'Confirmed booking';
        statusBg = '#d1fae5';
        statusColor = '#047857';
        statusBorder = '1px solid #a7f3d0';
    } else if (bStatus === 'pending' && bResponded !== '') {
        statusText = 'Waiting for Confirmation';
        statusBg = '#fef3c7';
        statusColor = '#d97706';
        statusBorder = '1px solid #fde68a';
    } else if (booking.record_type === 'enquiry') {
        var tier = booking.customer_tier || 'new';
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
    } else {
        // Pending booking without responded_by
        statusText = 'Waiting for Confirmation';
        statusBg = '#fef3c7';
        statusColor = '#d97706';
        statusBorder = '1px solid #fde68a';
    }

    typeEl.textContent = statusText;
    typeEl.style.background = statusBg;
    typeEl.style.color = statusColor;
    typeEl.style.border = statusBorder;

    document.getElementById('dd-customer-name').textContent = booking.customer_name || 'Guest';
    document.getElementById('dd-customer-phone').textContent = booking.customer_phone || '-';
    document.getElementById('dd-call-btn').href = 'tel:' + booking.customer_phone;
    
    document.getElementById('dd-wa-btn').onclick = function() {
        var type = getWaTemplateType(booking.status, booking.record_type);
        sendWhatsAppTemplate(booking.id, type, booking.record_type);
    };

    var routeContainer = document.getElementById('dd-route-visualizer');
    if (routeContainer) {
        var html = '<div class="route-line-connector"></div>';
        
        // Pickup Node
        html += '<div class="route-node pickup-node">' +
                '    <div class="node-icon"><i class="fa-solid fa-circle-dot"></i></div>' +
                '    <div class="node-details">' +
                '        <span class="node-label">Pickup</span>' +
                '        <strong class="node-address">' + (booking.pickup_location || '-') + '</strong>' +
                '    </div>' +
                '</div>';
                
        // Stops Nodes (Intermediate)
        if (booking.stops && booking.stops.length > 0) {
            booking.stops.forEach(function(stop, idx) {
                html += '<div class="route-node stop-node">' +
                        '    <div class="node-icon" style="background: linear-gradient(135deg, #eff6ff, #dbeafe); color: #2563eb; border: 2px solid #bfdbfe; box-shadow: 0 2px 8px rgba(37,99,235,0.15); width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; flex-shrink: 0;"><i class="fa-solid fa-map-pin" style="font-size: 0.8rem;"></i></div>' +
                        '    <div class="node-details">' +
                        '        <span class="node-label">Stop ' + (idx + 1) + '</span>' +
                        '        <strong class="node-address" style="color: #475569; font-weight: 600;">' + stop + '</strong>' +
                        '    </div>' +
                        '</div>';
            });
        }
        
        // Drop Node
        html += '<div class="route-node drop-node">' +
                '    <div class="node-icon"><i class="fa-solid fa-location-dot"></i></div>' +
                '    <div class="node-details">' +
                '        <span class="node-label">Drop-off</span>' +
                '        <strong class="node-address">' + (booking.drop_location || '-') + '</strong>' +
                '    </div>' +
                '</div>';
                
        routeContainer.innerHTML = html;
    }
    
    var dateStr = booking.pickup_date || '';
    var timeStr = booking.pickup_time || '';
    document.getElementById('dd-schedule').textContent = dateStr + ' @ ' + timeStr;
    
    document.getElementById('dd-trip-vehicle').textContent = (booking.trip_type || '').toUpperCase().replace('_', ' ') + ' | ' + (booking.car_name || 'Vehicle not selected');
    
    document.getElementById('dd-fare-info').innerHTML = '₹' + Number(booking.final_fare).toLocaleString('en-IN') + ' <span style="font-size:0.7rem; color:#64748b; font-weight:600; text-transform:uppercase;">(' + (booking.fare_type || 'flat') + ')</span>';
    
    document.getElementById('dd-recd-time').textContent = booking.created_at || 'N/A';

    var badgeCont = document.getElementById('dd-badge-container');
    badgeCont.innerHTML = '';

    var fleetSection = document.getElementById('dd-fleet-section');
    if (booking.record_type === 'booking' && (booking.driver_name || booking.driver_phone || booking.car_number)) {
        fleetSection.style.display = 'block';
        document.getElementById('dd-fleet-driver-name').textContent = booking.driver_name || '-';
        document.getElementById('dd-fleet-driver-phone').textContent = booking.driver_phone || '-';
        document.getElementById('dd-fleet-car-name').textContent = booking.car_name || '-';
        document.getElementById('dd-fleet-car-number').textContent = booking.car_number || '-';
    } else {
        fleetSection.style.display = 'none';
    }

    // Actions
    var confirmBtn = document.getElementById('dd-action-confirm');
    if (booking.status !== 'confirmed') {
        confirmBtn.style.display = 'flex';
        confirmBtn.onclick = function() {
            closeDashDetailsModal();
            doDashboardAction('confirmed', booking.id, booking.record_type, 'Confirm booking?');
        };
    } else {
        confirmBtn.style.display = 'none';
    }

    var waitBtn = document.getElementById('dd-action-wait');
    if (booking.record_type === 'enquiry' || booking.status !== 'pending') {
        waitBtn.style.display = 'flex';
        waitBtn.onclick = function() {
            closeDashDetailsModal();
            doDashboardAction('waiting', booking.id, booking.record_type, 'Move to Waiting?');
        };
    } else {
        waitBtn.style.display = 'none';
    }

    var customizeLink = document.getElementById('dd-action-customize');
    customizeLink.href = 'customize-booking?id=' + booking.id + '&source=' + booking.record_type;

    var assignBtn = document.getElementById('dd-action-assign');
    if (booking.record_type === 'booking') {
        assignBtn.style.display = 'flex';
        assignBtn.onclick = function() {
            closeDashDetailsModal();
            openAssignModal(booking.id, booking.driver_name, booking.driver_phone, booking.car_name, booking.car_number);
        };
    } else {
        assignBtn.style.display = 'none';
    }

    var spamBtn = document.getElementById('dd-action-spam');
    spamBtn.onclick = function() {
        closeDashDetailsModal();
        doDashboardAction('fake', booking.id, booking.record_type, 'Mark as Spam?');
    };

    // WhatsApp Templates Trigger
    document.getElementById('modal-wa-quote').onclick = function(e) { e.preventDefault(); sendWhatsAppTemplate(booking.id, 'quote', booking.record_type); };
    document.getElementById('modal-wa-confirm').onclick = function(e) { e.preventDefault(); sendWhatsAppTemplate(booking.id, 'confirm', booking.record_type); };
    document.getElementById('modal-wa-advance').onclick = function(e) { e.preventDefault(); sendWhatsAppTemplate(booking.id, 'ask_advance', booking.record_type); };
    document.getElementById('modal-wa-followup').onclick = function(e) { e.preventDefault(); sendWhatsAppTemplate(booking.id, 'followup', booking.record_type); };
    document.getElementById('modal-wa-complete').onclick = function(e) { e.preventDefault(); sendWhatsAppTemplate(booking.id, 'complete', booking.record_type); };

    var modal = document.getElementById('dash-details-modal');
    // Move to body to escape any stacking-context ancestors (transforms, filters, etc.)
    if (modal.parentElement !== document.body) {
        document.body.appendChild(modal);
        // Re-attach backdrop-click and Escape listeners after reparenting
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeDashDetailsModal();
        });
    }
    modal.scrollTop = 0;
    modal.style.display = 'flex';
    // Trigger reflow so CSS transition fires correctly
    modal.offsetHeight;
    modal.classList.add('modal-visible');
    document.body.style.overflow = 'hidden';
}

function closeDashDetailsModal() {
    var modal = document.getElementById('dash-details-modal');
    modal.classList.remove('modal-visible');
    setTimeout(function() {
        modal.style.display = 'none';
    }, 250);
    document.body.style.overflow = '';
}

window.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeDashDetailsModal();
        closeAssignModal();
        closeWhatsAppModal();
    }
});

// Initial bind (before reparenting); re-bound inside openDashLeadDetails after reparenting
document.getElementById('dash-details-modal').addEventListener('click', function(e) {
    if (e.target === this) closeDashDetailsModal();
});

function copyBookingId(text, el) {
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
}
</script>
