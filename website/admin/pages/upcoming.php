<?php
/**
 * Admin Upcoming Bookings Page - Premium Priority Management
 */

// Handle Fleet Assignment POST (Centralized)
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

        try {
            require_once __DIR__ . '/../../includes/notification-engine.php';
            dropcars_dispatch_notifications($pdo, $id, 'driver_assigned');
        } catch (\Throwable $e) {
            error_log('Upcoming Assign Notification Error: ' . $e->getMessage());
        }

        // Sync to Google Sheets
        require_once __DIR__ . '/../includes/google-sheets-status-sync.php';
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

// Current Filter Category: default to 'unassigned'
$category = $_GET['cat'] ?? 'unassigned';

// Detect AJAX request
$isAjax = isset($_GET['ajax']) || (isset($_SERVER['HTTP_X_REQUESTED_WITH']) && $_SERVER['HTTP_X_REQUESTED_WITH'] === 'XMLHttpRequest' && !isset($_POST['action']));

// Categorized Counts for the Switcher
$counts = [
    'unassigned' => 0,
    'assigned'   => 0
];
if (isset($pdo)) {
    $counts['unassigned'] = (int) $pdo->query("SELECT COUNT(*) FROM `bookings` WHERE `status` = 'confirmed' AND `pickup_date` >= CURDATE() AND (`car_number` IS NULL OR `car_number` = '')")->fetchColumn();
    $counts['assigned']   = (int) $pdo->query("SELECT COUNT(*) FROM `bookings` WHERE `status` = 'confirmed' AND `pickup_date` >= CURDATE() AND (`car_number` IS NOT NULL AND `car_number` != '')")->fetchColumn();
}

// Fetch Categorized Bookings
if ($category === 'assigned') {
    $whereClause = "AND (b.car_number IS NOT NULL AND b.car_number != '')";
} else {
    $whereClause = "AND (b.car_number IS NULL OR b.car_number = '')";
}

// Capture New Filters
$dateFilter = $_GET['date'] ?? '';
$tripTypeFilter = $_GET['trip_type'] ?? '';

// Build Query
$sql = "SELECT b.*, c.name as customer_name, c.phone as customer_phone 
        FROM `bookings` b 
        JOIN `customers` c ON b.customer_id = c.id 
        WHERE b.status = 'confirmed' 
        AND b.pickup_date >= CURDATE()
        $whereClause";

$params = [];

if ($dateFilter) {
    $sql .= " AND b.pickup_date = ?";
    $params[] = $dateFilter;
}

if ($tripTypeFilter) {
    if ($tripTypeFilter === 'round') {
        $sql .= " AND (b.trip_type = 'round' OR b.trip_type = 'roundtrip')";
    } else {
        $sql .= " AND b.trip_type = ?";
        $params[] = $tripTypeFilter;
    }
}

// Next is First order
$sql .= " ORDER BY 
    CASE WHEN CONCAT(b.pickup_date, ' ', b.pickup_time) >= NOW() THEN 1 ELSE 2 END ASC,
    CASE WHEN CONCAT(b.pickup_date, ' ', b.pickup_time) >= NOW() THEN CONCAT(b.pickup_date, ' ', b.pickup_time) END ASC,
    CASE WHEN CONCAT(b.pickup_date, ' ', b.pickup_time) < NOW() THEN CONCAT(b.pickup_date, ' ', b.pickup_time) END DESC,
    b.created_at DESC";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$bookings = $stmt->fetchAll();
$upcomingCount = count($bookings);

// If AJAX, just render the rows and exit
if ($isAjax) {
    ob_start();
    ?>
    <div class="table-content-fade">
        <?php if (empty($bookings)): ?>
            <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 24px; text-align: center; padding: 4rem 2rem; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.02);">
                <i class="fa-solid fa-calendar-check" style="font-size: 4rem; color: #eeeeee; display: block; margin: 0 auto 1.5rem auto; text-align: center;"></i>
                <h3 style="color: #64748b; font-weight: 800; font-size: 1.25rem; margin-bottom: 0.5rem; font-family: 'Outfit', sans-serif;">All Clear!</h3>
                <p style="color: #94a3b8; font-weight: 500; font-size: 0.85rem; margin: 0;">No unassigned upcoming bookings. You are completely caught up!</p>
            </div>
        <?php else: ?>
            <div class="card" style="padding: 0; border: 1px solid #eee; overflow: hidden; border-radius: 16px;">
                <div class="table-responsive">
                    <table class="custom-table" style="table-layout: fixed; min-width: 1000px;">
                        <thead>
                            <tr>
                                <th style="width: 220px; vertical-align: middle; padding-left: 1.5rem;">Booking Info</th>
                                <th style="min-width: 320px; vertical-align: middle;">Route & Operations</th>
                                <th style="width: 280px; vertical-align: middle;">Schedule & Finance</th>
                                <th style="width: 160px; text-align: right; padding-right: 1.5rem; vertical-align: middle;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($bookings as $booking): 
                                $bookingRef = (string)($booking['booking_id'] ?? $booking['id']);
                                $hasDriver = !empty($booking['driver_name']) && !empty($booking['car_number']);
                                $phoneFormatted = preg_replace('/[^0-9]/', '', $booking['customer_phone']);
                                if (strlen($phoneFormatted) === 10) {
                                    $phoneFormatted = '91' . $phoneFormatted;
                                }
                            ?>
                                <tr style="<?php echo !$hasDriver ? 'background: #fffbef;' : ''; ?>">
                                    <td data-label="Booking Info" style="vertical-align: middle; padding-left: 1.5rem;">
                                        <div style="display: flex; align-items: center; gap: 0.6rem;">
                                            <div style="width: 32px; height: 32px; background: #f1f5f9; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #475569; font-weight: 800; font-size: 0.85rem;">
                                                <?php echo strtoupper(substr($booking['customer_name'] ?? 'G', 0, 1)); ?>
                                            </div>
                                            <div>
                                                <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
                                                    <strong style="font-size: 0.9rem; color: #1e293b; white-space: nowrap;"><?php echo htmlspecialchars($booking['customer_name']); ?></strong>
                                                    <span style="font-size: 0.65rem; font-weight: 800; background: #f1f5f9; padding: 2px 8px; border-radius: 6px; color: #475569; text-transform: uppercase; display: flex; align-items: center; gap: 4px;">
                                                        <?php 
                                                            $tt = strtolower($booking['trip_type'] ?? '');
                                                            if ($tt === 'round' || $tt === 'roundtrip') {
                                                                echo '<i class="fa fa-rotate-left" style="font-size: 0.6rem; color: #6366f1;"></i> ROUND TRIP';
                                                            } elseif ($tt === 'oneway') {
                                                                echo '<i class="fa fa-arrow-right-long" style="font-size: 0.6rem; color: #6366f1;"></i> ONE WAY';
                                                            } else {
                                                                echo strtoupper($tt);
                                                            }
                                                        ?>
                                                    </span>
                                                </div>
                                                <div style="display: flex; align-items: center; gap: 0.35rem; margin-top: 2px;">
                                                    <span style="font-size: 0.65rem; color: #94a3b8; font-family: monospace; font-weight: 700;"><?php echo $bookingRef; ?></span>
                                                    <span style="height: 10px; width: 1px; background: #e2e8f0;"></span>
                                                    <span style="font-size: 0.7rem; color: #64748b; font-weight: 600;"><?php echo htmlspecialchars($booking['customer_phone']); ?></span>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td data-label="Route & Operations" style="vertical-align: middle;">
                                        <div style="font-size: 0.85rem; color: #1e293b; line-height: 1.3;">
                                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                                <span style="color: #64748b; font-weight: 700; font-size: 0.7rem; text-transform: uppercase; width: 40px;">From:</span>
                                                <span style="font-weight: 600; color: #334155; opacity: 0.8;"><?php echo htmlspecialchars($booking['pickup_location']); ?></span>
                                            </div>
                                            <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 2px;">
                                                <span style="color: #64748b; font-weight: 700; font-size: 0.7rem; text-transform: uppercase; width: 40px;">To:</span>
                                                <span style="font-weight: 700; color: #1e293b;"><?php echo htmlspecialchars($booking['drop_location']); ?></span>
                                            </div>
                                            
                                            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-top: 6px; padding-top: 4px; border-top: 1px dashed #f1f5f9;">
                                                <?php if ($hasDriver): ?>
                                                    <div style="display: flex; align-items: center; gap: 0.75rem; background: #f0fdf4; padding: 3px 8px; border-radius: 6px; border: 1px solid #dcfce7; white-space: nowrap;">
                                                        <div style="display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0;">
                                                            <i class="fa fa-user" style="font-size: 0.7rem; color: #16a34a;"></i>
                                                            <span style="font-size: 0.8rem; font-weight: 800; color: #166534;"><?php echo htmlspecialchars($booking['driver_name']); ?></span>
                                                        </div>
                                                        <a href="tel:<?php echo preg_replace('/\D/', '', $booking['driver_phone']); ?>" style="text-decoration: none; font-size: 0.75rem; font-weight: 800; color: #16a34a; background: white; padding: 2px 8px; border-radius: 4px; border: 1px solid #dcfce7; display: flex; align-items: center; gap: 4px; flex-shrink: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                                                            <i class="fa fa-phone" style="font-size: 0.65rem;"></i> <?php echo htmlspecialchars($booking['driver_phone']); ?>
                                                        </a>
                                                        <span style="font-size: 0.75rem; font-weight: 700; color: #15803d; opacity: 0.8; flex-shrink: 0; padding-left: 2px;"><?php echo htmlspecialchars(strtoupper($booking['car_number'] ?? '')); ?></span>
                                                    </div>
                                                <?php else: ?>
                                                    <div style="font-size: 0.65rem; font-weight: 800; color: #b45309; background: #fef3c7; border: 1px solid #fde68a; padding: 1px 6px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.02em;">
                                                        <i class="fa-solid fa-triangle-exclamation" style="font-size: 0.6rem; margin-right: 3px;"></i> Assignment Pending
                                                    </div>
                                                <?php endif; ?>
                                            </div>
                                        </div>
                                    </td>
                                    <td data-label="Schedule & Finance" style="vertical-align: middle;">
                                        <div style="font-size: 0.75rem; display: flex; flex-direction: column; gap: 4px;">
                                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                                <div style="background: #eff6ff; color: #1d4ed8; padding: 2px 8px; border-radius: 6px; font-weight: 800; display: flex; align-items: center; gap: 5px;">
                                                    <i class="fa fa-calendar-check" style="font-size: 0.7rem;"></i> <?php echo date('d M Y', strtotime($booking['pickup_date'])); ?>
                                                </div>
                                                <span style="font-weight: 800; color: #1e293b; font-size: 0.85rem;"><i class="fa fa-clock" style="opacity: 0.5; font-size: 0.7rem;"></i> <?php echo $booking['pickup_time']; ?></span>
                                            </div>
                                            <div style="display: flex; align-items: center; gap: 0.5rem; font-weight: 600; color: #64748b;">
                                                <span style="color: #059669; font-weight: 900; font-size: 0.9rem;"><?php echo formatCurrency($booking['final_fare']); ?></span>
                                                <span style="height: 10px; width: 1px; background: #e2e8f0;"></span>
                                                <span style="font-size: 0.65rem; text-transform: uppercase;"><i class="fa <?php echo $booking['source'] === 'google_ads' ? 'fa-brands fa-google' : 'fa-globe'; ?>" style="margin-right: 2px;"></i> <?php echo str_replace('_', ' ', $booking['source']); ?></span>
                                            </div>
                                        </div>
                                    </td>
                                    <td data-label="Actions" style="text-align: right; padding-right: 1.5rem; vertical-align: middle;">
                                        <div class="booking-row-actions" style="display: flex; gap: 0.4rem; justify-content: flex-end; align-items: center;">
                                            <?php
                                            $waText = dropcars_get_whatsapp_template('confirm', $booking);
                                            ?>
                                            <a href="https://wa.me/<?php echo $phoneFormatted; ?>?text=<?php echo rawurlencode($waText); ?>" target="_blank" class="enquiry-pill enquiry-pill--whatsapp" title="WhatsApp Customer">
                                                <i class="fa-brands fa-whatsapp"></i>
                                            </a>

                                            <button type="button" class="enquiry-pill" style="background: #f5f3ff; color: #7c3aed; border: 1px solid #ddd6fe;" title="<?php echo $hasDriver ? 'Change Driver / Cab' : 'Assign Cab & Driver'; ?>" onclick="openAssignModal(<?php echo (int) $booking['id']; ?>, '<?php echo htmlspecialchars(addslashes($booking['driver_name'] ?? ''), ENT_QUOTES); ?>', '<?php echo htmlspecialchars(addslashes($booking['driver_phone'] ?? ''), ENT_QUOTES); ?>', '<?php echo htmlspecialchars(addslashes($booking['car_name'] ?? ''), ENT_QUOTES); ?>', '<?php echo htmlspecialchars(addslashes(strtoupper($booking['car_number'] ?? '')), ENT_QUOTES); ?>')">
                                                <i class="fa fa-car"></i>
                                            </button>

                                            <form method="POST" action="actions/post-upcoming-to-app.php" style="display:inline;" onsubmit="return confirm('Post this booking to Driver & Vendor Marketplace Apps with auto-tariff pricing?');">
                                                <input type="hidden" name="booking_id" value="<?php echo (int)$booking['id']; ?>">
                                                <button type="submit" class="enquiry-pill" style="background: #1d4ed8; color: #ffffff; border: 1px solid #1e40af;" title="⚡ Post to Driver App Marketplace">
                                                    <i class="fa fa-bolt"></i>
                                                </button>
                                            </form>

                                            <a href="customize-booking?id=<?php echo (int)$booking['id']; ?>&amp;source=booking" class="enquiry-pill enquiry-pill--manage" title="Full Management / Dispatch">
                                                <i class="fa fa-gear"></i>
                                            </a>
                                        </div>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            </div>
        <?php endif; ?>
    </div>
    <?php
    echo ob_get_clean();
    exit;
}
?>

<style>
    .table-content-fade {
        animation: fadeIn 0.3s ease-out;
    }
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .op-switcher {
        display: flex;
        align-items: center;
        background: #f1f5f9;
        padding: 4px;
        border-radius: 14px;
        gap: 4px;
        width: fit-content;
        max-width: 100%;
        margin: 0 auto;
        border: 1px solid #e2e8f0;
        flex-wrap: wrap;
    }
    .op-switcher-btn {
        text-decoration: none;
        padding: 0.75rem 1.5rem;
        border-radius: 11px;
        font-size: 0.85rem;
        font-weight: 800;
        display: flex;
        align-items: center;
        gap: 10px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        color: #64748b;
        white-space: nowrap;
    }
    @media (max-width: 600px) {
        .op-switcher { width: 100%; }
        .op-switcher-btn {
            flex: 1 1 auto;
            justify-content: center;
            padding: 0.6rem 0.85rem;
            font-size: 0.75rem;
            gap: 5px;
        }
    }
    .op-switcher-btn.active {
        background: white; 
        color: #1e293b; 
        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    }
    .op-switcher-btn:not(.active):hover {
        background: rgba(255,255,255,0.5);
        color: #475569;
    }
    
    /* Filter chips (matched to dashboard) */
    .dash-filter-chip {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        padding: 0 0.68rem;
        height: 34px;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
        flex-shrink: 0;
    }
    .dash-filter-chip:focus-within {
        border-color: #93c5fd;
        box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
    }
    .dash-filter-chip > i {
        font-size: 0.74rem;
        color: #94a3b8;
        flex: 0 0 auto;
    }
    .dash-filter-chip select {
        border: none;
        outline: none;
        font-size: 0.75rem;
        font-weight: 700;
        color: #0f172a;
        cursor: pointer;
        max-width: 100%;
        -webkit-appearance: none;
        -moz-appearance: none;
        appearance: none;
        padding: 0 1.15rem 0 0;
        background-color: transparent;
        background-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right center;
        background-size: 0.7rem;
    }
    .dash-filter-chip select option {
        color: #0f172a;
        background: #ffffff;
        font-weight: 600;
    }
    .dash-filter-chip input[type="date"] {
        border: none;
        outline: none;
        font-size: 0.75rem;
        font-weight: 700;
        color: #0f172a;
        cursor: pointer;
        background: transparent;
        padding: 0;
    }
    @media (max-width: 800px) {
        .upcoming-filter-form-wrap {
            width: 100% !important;
            margin-top: 0.5rem;
            display: flex !important;
            flex-direction: row !important;
            flex-wrap: nowrap !important;
            gap: 0.5rem !important;
        }
        .upcoming-filter-form-wrap .dash-filter-chip {
            flex: 1 !important;
            min-width: 0 !important;
            display: inline-flex !important;
            width: auto !important;
        }
        .upcoming-filter-form-wrap select,
        .upcoming-filter-form-wrap input[type="date"] {
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
        }
    }
</style>

<div class="page-header" style="margin-bottom: 1rem; background: #fff; padding: 0.75rem 1rem; border-radius: 14px; border: 1px solid #f1f5f9; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
    <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 0.75rem;">
        <div style="display: flex; align-items: center; gap: 0.65rem;">
            <div style="width: 36px; height: 36px; flex-shrink: 0; background: #fffbeb; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: var(--primary-color);">
                <i class="fa-solid fa-hourglass-start" style="font-size: 1rem;" aria-hidden="true"></i>
            </div>
            <div>
                <h1 style="font-size: 1.2rem; font-weight: 800; color: #1e293b; margin: 0;">Upcoming Assignments</h1>
                <p style="margin: 0; font-size: 0.75rem; color: #94a3b8;">Dynamic priority queue for confirmed loads and fleet allocation</p>
            </div>
        </div>

        <form action="upcoming" method="GET" id="upcoming-filter-form" class="upcoming-filter-form-wrap" style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 0; align-items: center;">
            <input type="hidden" name="cat" value="<?php echo htmlspecialchars($category); ?>">
            
            <div class="dash-filter-chip">
                <i class="fa-solid fa-calendar-day"></i>
                <input type="date" name="date" value="<?php echo htmlspecialchars($dateFilter); ?>" onchange="this.form.submit();">
            </div>

            <div class="dash-filter-chip">
                <i class="fa-solid fa-route"></i>
                <select name="trip_type" onchange="this.form.submit();">
                    <option value="">All Trip Types</option>
                    <option value="oneway" <?php echo $tripTypeFilter === 'oneway' ? 'selected' : ''; ?>>One Way</option>
                    <option value="round" <?php echo $tripTypeFilter === 'round' ? 'selected' : ''; ?>>Round Trip</option>
                    <option value="hourly" <?php echo $tripTypeFilter === 'hourly' ? 'selected' : ''; ?>>Hourly Rental</option>
                </select>
            </div>

            <?php if ($dateFilter || $tripTypeFilter): ?>
                <a href="upcoming?cat=<?php echo htmlspecialchars($category); ?>" style="display: inline-flex; align-items: center; justify-content: center; border: 1px solid #cbd5e1; border-radius: 10px; background: #fff; width: 34px; height: 34px; color: #ef4444; font-size: 0.75rem; font-weight: 800; text-decoration: none;"><i class="fa fa-xmark"></i></a>
            <?php endif; ?>
        </form>
    </div>
    
    <div class="op-switcher">
        <a href="upcoming?cat=unassigned" data-cat="unassigned" class="op-switcher-btn <?php echo $category == 'unassigned' ? 'active' : ''; ?>">
            <i class="fa fa-triangle-exclamation" style="<?php echo $category == 'unassigned' ? 'color: #f59e0b;' : ''; ?>"></i> 
            Unassigned 
            <span style="background: <?php echo $category == 'unassigned' ? '#fef3c7' : '#e2e8f0'; ?>; color: <?php echo $category == 'unassigned' ? '#b45309' : '#64748b'; ?>; padding: 2px 8px; border-radius: 6px; font-size: 0.75rem; transition: all 0.3s;"><?php echo $counts['unassigned']; ?></span>
        </a>
        <a href="upcoming?cat=assigned" data-cat="assigned" class="op-switcher-btn <?php echo $category == 'assigned' ? 'active' : ''; ?>">
            <i class="fa fa-circle-check" style="<?php echo $category == 'assigned' ? 'color: #10b981;' : ''; ?>"></i> 
            Assigned 
            <span style="background: <?php echo $category == 'assigned' ? '#dcfce7' : '#e2e8f0'; ?>; color: <?php echo $category == 'assigned' ? '#166534' : '#64748b'; ?>; padding: 2px 8px; border-radius: 6px; font-size: 0.75rem; transition: all 0.3s;"><?php echo $counts['assigned']; ?></span>
        </a>
    </div>
<form method="POST" action="actions/post-upcoming-to-app.php" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:16px;padding:1rem 1.25rem;margin-bottom:1.25rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
    <input type="hidden" name="post_all_upcoming" value="1">
    <div>
        <strong style="color:#1e40af;font-size:0.95rem;display:flex;align-items:center;gap:6px;">
            <i class="fa fa-bolt" style="color:#2563eb;"></i> Post All Upcoming Bookings to Driver & Vendor Apps
        </strong>
        <span style="color:#3b82f6;font-size:0.8rem;font-weight:600;">Automatically calculates -₹1/km base tariff, ₹300 Driver Allowance, or 15% All-Inclusive profit margin.</span>
    </div>
    <button type="submit" onclick="return confirm('Post all upcoming bookings to Driver & Vendor Marketplace Apps immediately with auto-tariff pricing?');" style="background:#1d4ed8;color:#ffffff;border:none;padding:0.65rem 1.25rem;border-radius:10px;font-weight:800;font-size:0.85rem;cursor:pointer;box-shadow:0 2px 4px rgba(29,78,216,0.25);display:flex;align-items:center;gap:8px;">
        <i class="fa fa-paper-plane"></i> Auto-Post All Upcoming Bookings
    </button>
</form>

<div id="table-container">
    <div class="table-content-fade">
        <?php if (empty($bookings)): ?>
            <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 24px; text-align: center; padding: 4rem 2rem; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.02);">
                <i class="fa-solid fa-calendar-check" style="font-size: 4rem; color: #eeeeee; display: block; margin: 0 auto 1.5rem auto; text-align: center;"></i>
                <h3 style="color: #64748b; font-weight: 800; font-size: 1.25rem; margin-bottom: 0.5rem; font-family: 'Outfit', sans-serif;">All Clear!</h3>
                <p style="color: #94a3b8; font-weight: 500; font-size: 0.85rem; margin: 0;">No unassigned upcoming bookings. You are completely caught up!</p>
            </div>
        <?php else: ?>
            <div class="card" style="padding: 0; border: 1px solid #eee; overflow: hidden; border-radius: 16px;">
                <div class="table-responsive">
                    <table class="custom-table" style="table-layout: fixed; min-width: 1000px;">
                        <thead>
                            <tr>
                                <th style="width: 220px; vertical-align: middle; padding-left: 1.5rem;">Booking Info</th>
                                <th style="min-width: 320px; vertical-align: middle;">Route & Operations</th>
                                <th style="width: 280px; vertical-align: middle;">Schedule & Finance</th>
                                <th style="width: 160px; text-align: right; padding-right: 1.5rem; vertical-align: middle;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($bookings as $booking): 
                                $bookingRef = (string)($booking['booking_id'] ?? $booking['id']);
                                $hasDriver = !empty($booking['driver_name']) && !empty($booking['car_number']);
                                $phoneFormatted = preg_replace('/[^0-9]/', '', $booking['customer_phone']);
                                if (strlen($phoneFormatted) === 10) {
                                    $phoneFormatted = '91' . $phoneFormatted;
                                }
                            ?>
                                <tr style="<?php echo !$hasDriver ? 'background: #fffbef;' : ''; ?>">
                                    <td data-label="Booking Info" style="vertical-align: middle; padding-left: 1.5rem;">
                                        <div style="display: flex; align-items: center; gap: 0.6rem;">
                                            <div style="width: 32px; height: 32px; background: #f1f5f9; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #475569; font-weight: 800; font-size: 0.85rem;">
                                                <?php echo strtoupper(substr($booking['customer_name'] ?? 'G', 0, 1)); ?>
                                            </div>
                                            <div>
                                                <strong style="display: block; font-size: 0.9rem; color: #1e293b; white-space: nowrap;"><?php echo htmlspecialchars($booking['customer_name']); ?></strong>
                                                <div style="display: flex; align-items: center; gap: 0.35rem; margin-top: 1px;">
                                                    <span style="font-size: 0.65rem; color: #94a3b8; font-family: monospace; font-weight: 700;"><?php echo $bookingRef; ?></span>
                                                    <span style="height: 10px; width: 1px; background: #e2e8f0;"></span>
                                                    <span style="font-size: 0.7rem; color: #64748b; font-weight: 600;"><?php echo htmlspecialchars($booking['customer_phone']); ?></span>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td data-label="Route & Operations" style="vertical-align: middle;">
                                        <div style="font-size: 0.85rem; color: #1e293b; line-height: 1.3;">
                                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                                <span style="color: #64748b; font-weight: 700; font-size: 0.7rem; text-transform: uppercase; width: 40px;">From:</span>
                                                <span style="font-weight: 600; color: #334155; opacity: 0.8;"><?php echo htmlspecialchars($booking['pickup_location']); ?></span>
                                            </div>
                                            <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 2px;">
                                                <span style="color: #64748b; font-weight: 700; font-size: 0.7rem; text-transform: uppercase; width: 40px;">To:</span>
                                                <span style="font-weight: 700; color: #1e293b;"><?php echo htmlspecialchars($booking['drop_location']); ?></span>
                                            </div>
                                            
                                            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-top: 6px; padding-top: 4px; border-top: 1px dashed #f1f5f9;">
                                                <?php if ($hasDriver): ?>
                                                    <div style="display: flex; align-items: center; gap: 0.75rem; background: #f0fdf4; padding: 3px 8px; border-radius: 6px; border: 1px solid #dcfce7; white-space: nowrap;">
                                                        <div style="display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0;">
                                                            <i class="fa fa-user" style="font-size: 0.7rem; color: #16a34a;"></i>
                                                            <span style="font-size: 0.8rem; font-weight: 800; color: #166534;"><?php echo htmlspecialchars($booking['driver_name']); ?></span>
                                                        </div>
                                                        <a href="tel:<?php echo preg_replace('/\D/', '', $booking['driver_phone']); ?>" style="text-decoration: none; font-size: 0.75rem; font-weight: 800; color: #16a34a; background: white; padding: 2px 8px; border-radius: 4px; border: 1px solid #dcfce7; display: flex; align-items: center; gap: 4px; flex-shrink: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                                                            <i class="fa fa-phone" style="font-size: 0.65rem;"></i> <?php echo htmlspecialchars($booking['driver_phone']); ?>
                                                        </a>
                                                        <span style="font-size: 0.75rem; font-weight: 700; color: #15803d; opacity: 0.8; flex-shrink: 0; padding-left: 2px;"><?php echo htmlspecialchars(strtoupper($booking['car_number'] ?? '')); ?></span>
                                                    </div>
                                                <?php else: ?>
                                                    <div style="font-size: 0.65rem; font-weight: 800; color: #b45309; background: #fef3c7; border: 1px solid #fde68a; padding: 1px 6px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.02em;">
                                                        <i class="fa-solid fa-triangle-exclamation" style="font-size: 0.6rem; margin-right: 3px;"></i> Assignment Pending
                                                    </div>
                                                <?php endif; ?>
                                                
                                                <span style="font-size: 0.65rem; font-weight: 700; background: #f1f5f9; padding: 1px 6px; border-radius: 4px; color: #64748b; text-transform: uppercase;"><?php echo strtoupper($booking['trip_type']); ?></span>
                                            </div>
                                        </div>
                                    </td>
                                    <td data-label="Schedule & Finance" style="vertical-align: middle;">
                                        <div style="font-size: 0.75rem; display: flex; flex-direction: column; gap: 4px;">
                                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                                <div style="background: #eff6ff; color: #1d4ed8; padding: 2px 8px; border-radius: 6px; font-weight: 800; display: flex; align-items: center; gap: 5px;">
                                                    <i class="fa fa-calendar-check" style="font-size: 0.7rem;"></i> <?php echo date('d M Y', strtotime($booking['pickup_date'])); ?>
                                                </div>
                                                <span style="font-weight: 800; color: #1e293b; font-size: 0.85rem;"><i class="fa fa-clock" style="opacity: 0.5; font-size: 0.7rem;"></i> <?php echo $booking['pickup_time']; ?></span>
                                            </div>
                                            <div style="display: flex; align-items: center; gap: 0.5rem; font-weight: 600; color: #64748b;">
                                                <span style="color: #059669; font-weight: 900; font-size: 0.9rem;"><?php echo formatCurrency($booking['final_fare']); ?></span>
                                                <span style="height: 10px; width: 1px; background: #e2e8f0;"></span>
                                                <span style="font-size: 0.65rem; text-transform: uppercase;"><i class="fa <?php echo $booking['source'] === 'google_ads' ? 'fa-brands fa-google' : 'fa-globe'; ?>" style="margin-right: 2px;"></i> <?php echo str_replace('_', ' ', $booking['source']); ?></span>
                                            </div>
                                        </div>
                                    </td>
                                    <td data-label="Actions" style="text-align: right; padding-right: 1.5rem; vertical-align: middle;">
                                        <div class="booking-row-actions" style="display: flex; gap: 0.4rem; justify-content: flex-end; align-items: center;">
                                            <?php
                                            $waText = dropcars_get_whatsapp_template('confirm', $booking);
                                            ?>
                                            <a href="https://wa.me/<?php echo $phoneFormatted; ?>?text=<?php echo rawurlencode($waText); ?>" target="_blank" class="enquiry-pill enquiry-pill--whatsapp" title="WhatsApp Customer">
                                                <i class="fa-brands fa-whatsapp"></i>
                                            </a>

                                           <button type="button" class="enquiry-pill" style="background: #f5f3ff; color: #7c3aed; border: 1px solid #ddd6fe;" title="<?php echo $hasDriver ? 'Change Driver / Cab' : 'Assign Cab & Driver'; ?>" onclick="openAssignModal(<?php echo (int) $booking['id']; ?>, '<?php echo htmlspecialchars(addslashes($booking['driver_name'] ?? ''), ENT_QUOTES); ?>', '<?php echo htmlspecialchars(addslashes($booking['driver_phone'] ?? ''), ENT_QUOTES); ?>', '<?php echo htmlspecialchars(addslashes($booking['car_name'] ?? ''), ENT_QUOTES); ?>', '<?php echo htmlspecialchars(addslashes(strtoupper($booking['car_number'] ?? '')), ENT_QUOTES); ?>')">
                                                <i class="fa fa-car"></i>
                                            </button>

                                             <a href="customize-booking?id=<?php echo (int)$booking['id']; ?>&amp;source=booking" class="enquiry-pill enquiry-pill--manage" title="Full Management / Dispatch">
                                                 <i class="fa fa-gear"></i>
                                             </a>
                                        </div>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            </div>
        <?php endif; ?>
    </div>
</div>

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
function openAssignModal(id, dName, dPhone, cName, cNumber) {
    var modal = document.getElementById('assign-modal');
    if (modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }
    document.getElementById('assign-booking-id').value = id;
    document.getElementById('assign-modal-booking-id').textContent = '#' + id;
    document.getElementById('assign-driver-name').value = dName || '';
    document.getElementById('assign-driver-phone').value = dPhone || '';
    document.getElementById('assign-car-name').value = cName || '';
    document.getElementById('assign-car-number').value = cNumber || '';
    var alertEl = document.getElementById('assign-modal-alert');
    if (alertEl) alertEl.style.display = 'none';
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

// Live Category Swapping Engine
document.querySelectorAll('.op-switcher-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
        e.preventDefault();
        const cat = this.getAttribute('data-cat');
        
        // Grab current filters
        const urlParams = new URLSearchParams(window.location.search);
        urlParams.set('cat', cat);
        const dateFilter = urlParams.get('date') || '';
        const tripTypeFilter = urlParams.get('trip_type') || '';
        
        let url = `upcoming?cat=${cat}&ajax=1`;
        if (dateFilter) url += `&date=${encodeURIComponent(dateFilter)}`;
        if (tripTypeFilter) url += `&trip_type=${encodeURIComponent(tripTypeFilter)}`;
        
        // Update UI Active State
        document.querySelectorAll('.op-switcher-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        
        // Update hidden field in filter form
        const formCatInput = document.querySelector('input[name="cat"]');
        if (formCatInput) formCatInput.value = cat;
        
        // Smoothly fetch and swap
        const container = document.getElementById('table-container');
        container.style.opacity = '0.5'; // Visual cue
        
        fetch(url, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(res => res.text())
        .then(html => {
            container.innerHTML = html;
            container.style.opacity = '1';
            // Update Browser URL without reload
            window.history.pushState({cat: cat}, '', 'upcoming?' + urlParams.toString());
        });
    });
});
</script>
