<?php
/**
 * Admin Customers List Page - Premium CRM
 */

// Dynamic schema check for customers table
try {
    $cols = $pdo->query("SHOW COLUMNS FROM `customers`")->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array('is_blocked', $cols, true)) {
        $pdo->exec("ALTER TABLE `customers` ADD COLUMN `is_blocked` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_verified`");
    }
    if (!in_array('is_spam', $cols, true)) {
        $pdo->exec("ALTER TABLE `customers` ADD COLUMN `is_spam` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_blocked`");
    }
} catch (Throwable $e) {
    // Ignore migration failures if columns already exist
}

$searchPhone = $_GET['phone'] ?? '';
$activeTab   = $_GET['tab'] ?? 'registered';
if (!in_array($activeTab, ['registered', 'unregistered'], true)) {
    $activeTab = 'registered';
}

// Sync Actions
// Block/Spam cascade into inserting every IP the customer has ever used
// into blocked_ips (below) - a real consequence, previously guarded only
// by a client-side confirm() that a forged cross-site GET never runs. They
// now require confirmed=1, reachable only via the confirmation page's own
// button. Verify/unverify/unblock/unspam stay one-click - fully reversible
// toggles, and gating those too would just slow staff down for no safety
// benefit.
if (isset($_GET['action']) && isset($_GET['id']) && in_array($_GET['action'], ['block', 'spam'], true) && !isset($_GET['confirmed'])) {
    $actionConfirm = $_GET['action'];
    $idConfirm = (int) $_GET['id'];
    $labelConfirm = $actionConfirm === 'block' ? 'Block' : 'Mark as Spam';
    $confirmUrl = admin_url('customers', ['action' => $actionConfirm, 'id' => $idConfirm, 'confirmed' => 1]);
    $cancelUrl = admin_url('customers');
    echo '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Confirm ' . htmlspecialchars($labelConfirm) . '</title></head><body style="font-family:sans-serif;max-width:480px;margin:60px auto;text-align:center;padding:0 20px;">'
        . '<h2 style="color:#b91c1c;">' . htmlspecialchars($labelConfirm) . ' this customer?</h2>'
        . '<p style="color:#334155;font-size:15px;">This will also block every IP address this customer has used for bookings/enquiries. Only do this if you are sure.</p>'
        . '<a href="' . htmlspecialchars($confirmUrl) . '" style="display:inline-block;background:#ef4444;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin:8px;">Yes, ' . htmlspecialchars($labelConfirm) . '</a>'
        . '<a href="' . htmlspecialchars($cancelUrl) . '" style="display:inline-block;background:#e2e8f0;color:#1e293b;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin:8px;">Cancel</a>'
        . '</body></html>';
    exit;
}

if (isset($_GET['action']) && isset($_GET['id'])) {
    $action = $_GET['action'];
    $id = (int)$_GET['id'];
    if ($action == 'verify') {
        $pdo->prepare("UPDATE `customers` SET `is_verified` = 1 WHERE `id` = ?")->execute([$id]);
    } elseif ($action == 'unverify') {
        $pdo->prepare("UPDATE `customers` SET `is_verified` = 0 WHERE `id` = ?")->execute([$id]);
    } elseif ($action == 'block') {
        $pdo->prepare("UPDATE `customers` SET `is_blocked` = 1 WHERE `id` = ?")->execute([$id]);
        $cStmt = $pdo->prepare("SELECT `phone` FROM `customers` WHERE `id` = ?");
        $cStmt->execute([$id]);
        $phone = $cStmt->fetchColumn();
        if ($phone) {
            // Block all associated booking IPs
            $ipStmt = $pdo->prepare("SELECT DISTINCT `ip_address` FROM `bookings` WHERE `customer_id` = ? AND `ip_address` IS NOT NULL AND `ip_address` != ''");
            $ipStmt->execute([$id]);
            $ips = $ipStmt->fetchAll(PDO::FETCH_COLUMN);
            
            // Block all associated enquiry IPs
            $enqStmt = $pdo->prepare("SELECT DISTINCT `ip_address` FROM `enquiries` WHERE `phone` = ? AND `ip_address` IS NOT NULL AND `ip_address` != ''");
            $enqStmt->execute([$phone]);
            $enqIps = $enqStmt->fetchAll(PDO::FETCH_COLUMN);
            
            $allIps = array_unique(array_merge($ips, $enqIps));
            foreach ($allIps as $ip) {
                if (filter_var($ip, FILTER_VALIDATE_IP)) {
                    $pdo->prepare("INSERT IGNORE INTO `blocked_ips` (`ip_address`, `reason`) VALUES (?, ?)")->execute([$ip, "Blocked customer ($phone)"]);
                }
            }
        }
    } elseif ($action == 'unblock') {
        $pdo->prepare("UPDATE `customers` SET `is_blocked` = 0 WHERE `id` = ?")->execute([$id]);
        $cStmt = $pdo->prepare("SELECT `phone` FROM `customers` WHERE `id` = ?");
        $cStmt->execute([$id]);
        $phone = $cStmt->fetchColumn();
        if ($phone) {
            $ipStmt = $pdo->prepare("SELECT DISTINCT `ip_address` FROM `bookings` WHERE `customer_id` = ? AND `ip_address` IS NOT NULL AND `ip_address` != ''");
            $ipStmt->execute([$id]);
            $ips = $ipStmt->fetchAll(PDO::FETCH_COLUMN);
            
            $enqStmt = $pdo->prepare("SELECT DISTINCT `ip_address` FROM `enquiries` WHERE `phone` = ? AND `ip_address` IS NOT NULL AND `ip_address` != ''");
            $enqStmt->execute([$phone]);
            $enqIps = $enqStmt->fetchAll(PDO::FETCH_COLUMN);
            
            $allIps = array_unique(array_merge($ips, $enqIps));
            foreach ($allIps as $ip) {
                $pdo->prepare("DELETE FROM `blocked_ips` WHERE `ip_address` = ? AND `reason` LIKE ?")->execute([$ip, "%$phone%"]);
            }
        }
    } elseif ($action == 'spam') {
        $pdo->prepare("UPDATE `customers` SET `is_spam` = 1 WHERE `id` = ?")->execute([$id]);
        $cStmt = $pdo->prepare("SELECT `phone` FROM `customers` WHERE `id` = ?");
        $cStmt->execute([$id]);
        $phone = $cStmt->fetchColumn();
        if ($phone) {
            $ipStmt = $pdo->prepare("SELECT DISTINCT `ip_address` FROM `bookings` WHERE `customer_id` = ? AND `ip_address` IS NOT NULL AND `ip_address` != ''");
            $ipStmt->execute([$id]);
            $ips = $ipStmt->fetchAll(PDO::FETCH_COLUMN);
            
            $enqStmt = $pdo->prepare("SELECT DISTINCT `ip_address` FROM `enquiries` WHERE `phone` = ? AND `ip_address` IS NOT NULL AND `ip_address` != ''");
            $enqStmt->execute([$phone]);
            $enqIps = $enqStmt->fetchAll(PDO::FETCH_COLUMN);
            
            $allIps = array_unique(array_merge($ips, $enqIps));
            foreach ($allIps as $ip) {
                if (filter_var($ip, FILTER_VALIDATE_IP)) {
                    $pdo->prepare("INSERT IGNORE INTO `blocked_ips` (`ip_address`, `reason`) VALUES (?, ?)")->execute([$ip, "Spam customer ($phone)"]);
                }
            }
        }
    } elseif ($action == 'unspam') {
        $pdo->prepare("UPDATE `customers` SET `is_spam` = 0 WHERE `id` = ?")->execute([$id]);
        $cStmt = $pdo->prepare("SELECT `phone` FROM `customers` WHERE `id` = ?");
        $cStmt->execute([$id]);
        $phone = $cStmt->fetchColumn();
        if ($phone) {
            $ipStmt = $pdo->prepare("SELECT DISTINCT `ip_address` FROM `bookings` WHERE `customer_id` = ? AND `ip_address` IS NOT NULL AND `ip_address` != ''");
            $ipStmt->execute([$id]);
            $ips = $ipStmt->fetchAll(PDO::FETCH_COLUMN);
            
            $enqStmt = $pdo->prepare("SELECT DISTINCT `ip_address` FROM `enquiries` WHERE `phone` = ? AND `ip_address` IS NOT NULL AND `ip_address` != ''");
            $enqStmt->execute([$phone]);
            $enqIps = $enqStmt->fetchAll(PDO::FETCH_COLUMN);
            
            $allIps = array_unique(array_merge($ips, $enqIps));
            foreach ($allIps as $ip) {
                $pdo->prepare("DELETE FROM `blocked_ips` WHERE `ip_address` = ? AND `reason` LIKE ?")->execute([$ip, "%$phone%"]);
            }
        }
    }
    header('Location: ' . admin_url('customers', ['tab' => $activeTab, 'msg' => 'updated']));
    exit;
}

// Bulk Actions
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'delete_selected' && !empty($_POST['selected_ids'])) {
    $ids = array_map('intval', $_POST['selected_ids']);
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $pdo->prepare("DELETE FROM `customers` WHERE `id` IN ($placeholders)")->execute($ids);
    header('Location: ' . admin_url('customers', ['tab' => $activeTab, 'msg' => 'deleted']));
    exit;
}

// Counts for Tab Badges
$regCountStmt = $pdo->query("SELECT COUNT(*) FROM `customers` WHERE `is_verified` = 1 OR (`password` IS NOT NULL AND `password` != '')");
$regCount = (int)($regCountStmt ? $regCountStmt->fetchColumn() : 0);

$unregCountStmt = $pdo->query("SELECT COUNT(*) FROM `customers` WHERE (`is_verified` = 0 OR `is_verified` IS NULL) AND (`password` IS NULL OR `password` = '')");
$unregCount = (int)($unregCountStmt ? $unregCountStmt->fetchColumn() : 0);

// Filtering logic based on division tab
$whereTab = ($activeTab === 'registered')
    ? "(c.is_verified = 1 OR (c.password IS NOT NULL AND c.password != ''))"
    : "((c.is_verified = 0 OR c.is_verified IS NULL) AND (c.password IS NULL OR c.password = ''))";

$sql = "SELECT c.*, 
        (SELECT COUNT(*) FROM `bookings` WHERE customer_id = c.id) as total_bookings,
        (SELECT SUM(final_fare) FROM `bookings` WHERE customer_id = c.id) as lifetime_value,
        (SELECT AVG(final_fare) FROM `bookings` WHERE customer_id = c.id) as avg_fare,
        (SELECT source FROM `bookings` WHERE customer_id = c.id ORDER BY created_at ASC LIMIT 1) as acquisition_source,
        (SELECT MAX(created_at) FROM `bookings` WHERE customer_id = c.id) as last_booking_date
        FROM `customers` c WHERE $whereTab";
$params = [];

if ($searchPhone) {
    $sql .= " AND (c.phone LIKE ? OR c.email LIKE ? OR c.name LIKE ? OR c.id LIKE ?)";
    $params[] = "%$searchPhone%";
    $params[] = "%$searchPhone%";
    $params[] = "%$searchPhone%";
    $params[] = "%$searchPhone%";
}

// Total count for pagination, same filters as the main query - previously
// this page fetched every matching customer unbounded (plus 4 correlated
// subqueries per row), which gets slower as the customer list grows.
$countSql = "SELECT COUNT(*) FROM `customers` c WHERE $whereTab" . ($searchPhone ? " AND (c.phone LIKE ? OR c.email LIKE ? OR c.name LIKE ? OR c.id LIKE ?)" : "");
$countStmt = $pdo->prepare($countSql);
$countStmt->execute($params);
$totalCount = (int) $countStmt->fetchColumn();

$limit = 50;
$page = isset($_GET['page']) ? max(1, (int) $_GET['page']) : 1;
$totalPages = max(1, (int) ceil($totalCount / $limit));
$page = min($page, $totalPages);
$offset = ($page - 1) * $limit;

$sql .= " ORDER BY c.created_at DESC LIMIT $limit OFFSET $offset";
$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$customers = $stmt->fetchAll();

$pageMsg = $_GET['msg'] ?? '';
?>

<div class="page-header customers-page-header" style="margin-bottom: 1rem; background: #fff; padding: 0.75rem 1rem; border-radius: 14px; border: 1px solid #f1f5f9; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
    <div class="customers-header-row" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: nowrap; gap: 0.75rem;">
        <div style="display: flex; align-items: center; gap: 0.65rem; min-width: 0;">
            <div style="width: 36px; height: 36px; flex-shrink: 0; background: #f0f7ff; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #3b82f6;">
                <i class="fa-solid fa-users" style="font-size: 1rem;"></i>
            </div>
            <h1 style="font-size: 1.2rem; font-weight: 800; color: #1e293b; margin: 0; letter-spacing: -0.02em; white-space: nowrap;">Passenger Directory</h1>
        </div>
        <div class="customers-search-form" style="display: flex; gap: 0.4rem; background: #f8fafc; padding: 3px; border-radius: 10px; border: 1px solid #e2e8f0; max-width: 320px; width: 100%;">
            <form action="customers" method="GET" style="display: contents;">
                <input type="hidden" name="tab" value="<?php echo htmlspecialchars($activeTab); ?>">
                <div style="position: relative; flex: 1;">
                    <i class="fa fa-search" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 0.8rem;"></i>
                    <input type="text" name="phone" class="form-control" placeholder="Search by Mobile, Email, Name or ID..." value="<?php echo htmlspecialchars($searchPhone); ?>" style="border: none; padding-left: 2rem; font-size: 0.82rem; height: 34px; box-shadow: none; background: transparent; width: 100%;">
                </div>
                <button type="submit" class="btn btn-primary" style="height: 34px; width: 34px; padding: 0; border-radius: 8px; background: #f7b733; color: #1e293b; border: none; display: flex; align-items: center; justify-content: center; flex-shrink: 0;" title="Search"><i class="fa fa-search" style="font-size: 0.85rem;"></i></button>
                <?php if ($searchPhone): ?>
                    <a href="customers?tab=<?php echo urlencode($activeTab); ?>" class="btn btn-secondary" style="height: 34px; width: 34px; display: flex; align-items: center; justify-content: center; border-radius: 8px; background: #fff; border: 1px solid #e2e8f0; color: #64748b;" title="Reset"><i class="fa fa-times" style="font-size: 0.8rem;"></i></a>
                <?php endif; ?>
            </form>
        </div>
    </div>
</div>
<style>
@media (max-width: 640px) {
    .customers-header-row { flex-wrap: wrap !important; }
    .customers-search-form { max-width: 100% !important; width: 100% !important; order: 3; flex-basis: 100%; }
}
</style>

<!-- Division Tabs (Registered Customers vs Unregistered Users) -->
<div class="customers-nav-tabs" style="display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap;">
    <a href="<?php echo admin_url('customers', ['tab' => 'registered', 'phone' => $searchPhone]); ?>" 
       style="display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 1.1rem; border-radius: 12px; font-size: 0.85rem; font-weight: 700; text-decoration: none; transition: all 0.2s; <?php echo $activeTab === 'registered' ? 'background: #3b82f6; color: #fff; box-shadow: 0 4px 14px rgba(59,130,246,0.28);' : 'background: #fff; color: #64748b; border: 1px solid #e2e8f0;'; ?>">
        <i class="fa-solid fa-user-shield" style="font-size: 0.9rem;"></i>
        <span>Registered Customers</span>
        <span style="font-size: 0.75rem; padding: 2px 8px; border-radius: 99px; font-weight: 800; <?php echo $activeTab === 'registered' ? 'background: rgba(255,255,255,0.25); color: #fff;' : 'background: #f1f5f9; color: #475569;'; ?>">
            <?php echo $regCount; ?>
        </span>
    </a>
    <a href="<?php echo admin_url('customers', ['tab' => 'unregistered', 'phone' => $searchPhone]); ?>" 
       style="display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 1.1rem; border-radius: 12px; font-size: 0.85rem; font-weight: 700; text-decoration: none; transition: all 0.2s; <?php echo $activeTab === 'unregistered' ? 'background: #3b82f6; color: #fff; box-shadow: 0 4px 14px rgba(59,130,246,0.28);' : 'background: #fff; color: #64748b; border: 1px solid #e2e8f0;'; ?>">
        <i class="fa-solid fa-user-clock" style="font-size: 0.9rem;"></i>
        <span>Unregistered / Guest Users</span>
        <span style="font-size: 0.75rem; padding: 2px 8px; border-radius: 99px; font-weight: 800; <?php echo $activeTab === 'unregistered' ? 'background: rgba(255,255,255,0.25); color: #fff;' : 'background: #f1f5f9; color: #475569;'; ?>">
            <?php echo $unregCount; ?>
        </span>
    </a>
</div>

<div id="bulk-actions-bar" style="display:none; align-items:center; justify-space-between; margin-bottom:1rem; background:#fff; padding:10px 16px; border-radius:14px; border:1px solid #e2e8f0; box-shadow:0 2px 8px rgba(15,23,42,0.05); animation: fadeSlideDown 0.18s ease;">
    <div style="display:flex; align-items:center; gap:0.75rem;">
        <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; user-select:none;">
            <input type="checkbox" id="select-all-bar" style="width:17px; height:17px; accent-color:#6366f1; cursor:pointer; border-radius:4px;">
            <span style="font-size:0.88rem; font-weight:800; color:#1e293b;">Select all</span>
        </label>
        <span style="width:1px; height:18px; background:#e2e8f0; display:inline-block;"></span>
        <span style="font-size:0.82rem; font-weight:700; color:#6366f1;"><span id="selected-count">0</span> selected</span>
    </div>
    <button type="submit" form="bulk-delete-form" class="btn btn-danger" style="height:36px; padding:0 1.25rem; border-radius:10px; font-size:0.82rem; font-weight:800; background:#ef4444; border:none; box-shadow:0 3px 8px rgba(239,68,68,0.18); transition:all 0.2s; display:flex; align-items:center; gap:6px;">
        <i class="fa-solid fa-trash-can" style="font-size:0.75rem;"></i> Batch Archive
    </button>
</div>
<style>
@keyframes fadeSlideDown {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
}
</style>

<?php if ($pageMsg): ?>
    <div class="alert alert-success" style="margin-bottom: 1.5rem; border-radius: 10px; border: none; background: #ecfdf5; color: #065f46; font-weight: 600; font-size: 0.85rem; padding: 0.6rem 1rem; border-left: 3px solid #10b981;">
        <i class="fa-solid fa-circle-check" style="margin-right: 5px;"></i> <?php echo $pageMsg === 'deleted' ? 'Selected records archived.' : 'Updated successfully.'; ?>
    </div>
<?php endif; ?>

<form id="bulk-delete-form" method="POST" onsubmit="return confirm('Permanently archive selected passenger records?')">
    <input type="hidden" name="action" value="delete_selected">
    <div class="card" style="padding: 0; border: 1px solid #eee; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.03);">
        <div class="table-responsive">
            <table class="custom-table">
                <thead>
                    <tr>
                        <th style="width: 60px; padding-left: 2rem; vertical-align: middle;"><input type="checkbox" id="select-all" style="accent-color: #ef4444; cursor: pointer;"></th>
                        <th style="width: 35%; vertical-align: middle;">Passenger Details & Contact</th>
                        <th style="width: 35%; vertical-align: middle;">Performance & Lifetime Activity</th>
                        <th style="width: 25%; vertical-align: middle;">Account Status & Source</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($customers as $customer): 
                        $isVIP = $customer['total_bookings'] >= 3;
                        $historyUrl = "customer-history?id=" . (int)$customer['id'];
                        $isRegistered = ($customer['is_verified'] == 1 || !empty($customer['password']));
                    ?>
                        <tr style="transition: background 0.2s;">
                            <td data-label="Select" style="vertical-align: middle; padding-left: 2rem;">
                                <input type="checkbox" name="selected_ids[]" value="<?php echo $customer['id']; ?>" class="customer-checkbox" style="accent-color: #ef4444; cursor: pointer;">
                            </td>
                            <td onclick="if(!event.target.closest('a, button, input')) window.location.href='<?php echo $historyUrl; ?>';" style="cursor: pointer; vertical-align: middle; padding: 1.25rem 0.75rem;">
                                <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem;">
                                    <div style="display: flex; align-items: center; gap: 0.8rem;">
                                        <div style="width: 38px; height: 38px; background: <?php echo $isRegistered ? '#e0f2fe' : '#f8fafc'; ?>; border: 1px solid <?php echo $isRegistered ? '#bae6fd' : '#e2e8f0'; ?>; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: <?php echo $isRegistered ? '#0284c7' : '#64748b'; ?>; font-weight: 800; font-size: 0.9rem; flex-shrink: 0;">
                                            <?php echo strtoupper(substr($customer['name'] ?? 'P', 0, 1)); ?>
                                        </div>
                                        <div style="display: flex; flex-direction: column;">
                                            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                                                <strong style="font-size: 0.95rem; color: #1e293b;"><?php echo htmlspecialchars($customer['name']); ?></strong>
                                                <?php if ($isVIP): ?>
                                                    <i class="fa fa-star" style="color: #f59e0b; font-size: 0.75rem;" title="VIP Customer"></i>
                                                <?php endif; ?>
                                            </div>
                                            <?php if (!empty($customer['email'])): ?>
                                                <span style="font-size: 0.75rem; color: #475569; font-weight: 600; display: flex; align-items: center; gap: 4px; margin-top: 2px;">
                                                    <i class="fa-regular fa-envelope" style="font-size: 0.7rem; color: #0284c7;"></i> <?php echo htmlspecialchars($customer['email']); ?>
                                                </span>
                                            <?php endif; ?>
                                            <span style="font-size: 0.65rem; color: #94a3b8; font-weight: 600; margin-top: 2px;">#<?php echo date('ymd', strtotime($customer['created_at'])) . str_pad($customer['id'] % 100, 2, '0', STR_PAD_LEFT); ?> • Joined <?php echo date('d M Y', strtotime($customer['created_at'])); ?></span>
                                        </div>
                                    </div>
                                    <div style="display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; flex-shrink: 0;">
                                        <a href="https://wa.me/<?php echo preg_replace('/\D/', '', $customer['phone']); ?>" target="_blank" class="btn-action btn-sq" style="color: #22c55e; font-size: 1rem;" title="WhatsApp Direct Message" aria-label="WhatsApp Direct Message">
                                            <i class="fa-brands fa-whatsapp"></i>
                                        </a>
                                        <a href="customer-history?id=<?php echo (int)$customer['id']; ?>" class="btn-action btn-sq" style="color: #64748b; font-size: 0.95rem;" title="Full Travel Itinerary & History" aria-label="Full Travel Itinerary & History">
                                            <i class="fa-solid fa-chart-line"></i>
                                        </a>
                                        <a href="customers?action=<?php echo $customer['is_verified'] ? 'unverify' : 'verify'; ?>&id=<?php echo (int)$customer['id']; ?>&tab=<?php echo urlencode($activeTab); ?>" class="btn-action btn-sq" style="color: <?php echo $customer['is_verified'] ? '#ef4444' : '#3b82f6'; ?>; font-size: 0.95rem;" title="<?php echo $customer['is_verified'] ? 'Revoke Verification' : 'Verify Account'; ?>" aria-label="<?php echo $customer['is_verified'] ? 'Revoke Verification' : 'Verify Account'; ?>">
                                            <i class="fa-solid <?php echo $customer['is_verified'] ? 'fa-user-slash' : 'fa-user-check'; ?>"></i>
                                        </a>
                                        <a href="customers?action=<?php echo $customer['is_blocked'] ? 'unblock' : 'block'; ?>&id=<?php echo (int)$customer['id']; ?>&tab=<?php echo urlencode($activeTab); ?>" class="btn-action btn-sq" style="color: <?php echo $customer['is_blocked'] ? '#10b981' : '#ef4444'; ?>; font-size: 0.95rem;" title="<?php echo $customer['is_blocked'] ? 'Unblock Passenger' : 'Block Passenger'; ?>" aria-label="<?php echo $customer['is_blocked'] ? 'Unblock Passenger' : 'Block Passenger'; ?>" onclick="return confirm('Are you sure you want to <?php echo $customer['is_blocked'] ? 'unblock' : 'block'; ?> this customer?');">
                                            <i class="fa-solid <?php echo $customer['is_blocked'] ? 'fa-circle-check' : 'fa-ban'; ?>"></i>
                                        </a>
                                        <a href="customers?action=<?php echo $customer['is_spam'] ? 'unspam' : 'spam'; ?>&id=<?php echo (int)$customer['id']; ?>&tab=<?php echo urlencode($activeTab); ?>" class="btn-action btn-sq" style="color: <?php echo $customer['is_spam'] ? '#10b981' : '#f59e0b'; ?>; font-size: 0.95rem;" title="<?php echo $customer['is_spam'] ? 'Mark as Not Spam' : 'Mark as Spam'; ?>" aria-label="<?php echo $customer['is_spam'] ? 'Mark as Not Spam' : 'Mark as Spam'; ?>" onclick="return confirm('Are you sure you want to <?php echo $customer['is_spam'] ? 'mark as not spam' : 'mark as spam'; ?> this customer?');">
                                            <i class="fa-solid <?php echo $customer['is_spam'] ? 'fa-circle-check' : 'fa-triangle-exclamation'; ?>"></i>
                                        </a>
                                    </div>
                                </div>
                            </td>
                            <td style="vertical-align: middle; padding: 1.25rem 0.75rem;">
                                <div style="display: flex; align-items: center; gap: 1rem; min-width: 320px;">
                                    <div style="white-space: nowrap; display: flex; align-items: baseline; gap: 4px;">
                                        <span style="font-size: 0.85rem; color: #1e293b; font-weight: 800;"><?php echo $customer['total_bookings']; ?> Trips</span>
                                        <span style="font-size: 0.62rem; color: #94a3b8; font-weight: 900; text-transform: uppercase;">
                                            <?php 
                                            if ($customer['total_bookings'] >= 3) echo '(Elite)';
                                            elseif ($customer['total_bookings'] > 0) echo '(Active)';
                                            else echo '(New Register)';
                                            ?>
                                        </span>
                                    </div>
                                    <div style="height: 16px; width: 1px; background: #e2e8f0; flex-shrink: 0;"></div>
                                    <div style="white-space: nowrap; display: flex; align-items: baseline; gap: 4px;">
                                        <span style="font-size: 0.85rem; color: #16a34a; font-weight: 800;">₹<?php echo number_format((float)($customer['lifetime_value'] ?? 0), 0); ?></span>
                                        <span style="font-size: 0.62rem; color: #94a3b8; font-weight: 900; text-transform: uppercase;">LTV</span>
                                    </div>
                                    <div style="height: 16px; width: 1px; background: #e2e8f0; flex-shrink: 0;"></div>
                                    <div style="display: flex; align-items: baseline; gap: 6px;">
                                        <a href="tel:<?php echo preg_replace('/\D/', '', $customer['phone']); ?>" style="text-decoration: none; font-size: 0.85rem; font-weight: 800; color: #3b82f6; letter-spacing: -0.01em; white-space: nowrap;">
                                            <?php echo htmlspecialchars($customer['phone']); ?>
                                        </a>
                                    </div>
                                </div>
                            </td>
                            <td style="vertical-align: middle; padding: 1.25rem 0.75rem;">
                                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                    <?php if ($isRegistered): ?>
                                        <span style="font-size: 0.65rem; color: #065f46; font-weight: 900; background: #dcfce7; border: 1px solid #bbf7d0; padding: 3px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px;">
                                            <i class="fa-solid fa-circle-check" style="font-size: 0.6rem;"></i> REGISTERED
                                        </span>
                                    <?php else: ?>
                                        <span style="font-size: 0.65rem; color: #475569; font-weight: 900; background: #f1f5f9; border: 1px solid #e2e8f0; padding: 3px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px;">
                                            <i class="fa-solid fa-user-clock" style="font-size: 0.6rem;"></i> GUEST
                                        </span>
                                    <?php endif; ?>
                                    <?php if (!empty($customer['is_blocked'])): ?>
                                        <span style="font-size: 0.65rem; color: #991b1b; font-weight: 900; background: #fee2e2; border: 1px solid #fecaca; padding: 3px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px;">
                                            <i class="fa-solid fa-ban" style="font-size: 0.6rem;"></i> BLOCKED
                                        </span>
                                    <?php endif; ?>
                                    <?php if (!empty($customer['is_spam'])): ?>
                                        <span style="font-size: 0.65rem; color: #92400e; font-weight: 900; background: #fef3c7; border: 1px solid #fde68a; padding: 3px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px;">
                                            <i class="fa-solid fa-triangle-exclamation" style="font-size: 0.6rem;"></i> SPAM
                                        </span>
                                    <?php endif; ?>
                                    <span style="font-size: 0.7rem; color: #64748b; font-weight: 700; white-space: nowrap;">
                                        Seen: <?php echo $customer['last_booking_date'] ? date('d M Y', strtotime($customer['last_booking_date'])) : 'No trips yet'; ?>
                                    </span>
                                    <?php if (!empty($customer['acquisition_source'])): ?>
                                        <div style="font-size: 0.625rem; color: #94a3b8; font-weight: 900; text-transform: uppercase; background: #f8fafc; padding: 2px 6px; border-radius: 4px; border: 1px solid #f1f5f9; display: flex; align-items: center; gap: 4px;">
                                            <i class="fa fa-bullhorn" style="font-size: 0.55rem;"></i> <?php echo str_replace('_', ' ', $customer['acquisition_source']); ?>
                                        </div>
                                    <?php endif; ?>
                                </div>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                    <?php if (empty($customers)): ?>
                        <tr>
                            <td colspan="4" style="text-align: center; padding: 5rem 2rem;">
                                <div style="width: 50px; height: 50px; background: #f1f5f9; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem; color: #94a3b8;">
                                    <i class="fa-solid fa-users-slash" style="font-size: 1.2rem;"></i>
                                </div>
                                <h3 style="color: #475569; font-weight: 800; font-size: 1rem; margin: 0 0 0.25rem;">No <?php echo $activeTab === 'registered' ? 'registered customers' : 'unregistered guest users'; ?> found</h3>
                                <p style="color: #94a3b8; font-weight: 500; font-size: 0.82rem; margin: 0;">
                                    <?php echo $activeTab === 'registered' 
                                        ? 'Customers who register or verify through customer login will appear here, even before their first booking.' 
                                        : 'Guest users who submit quick booking forms without registering will be listed here.'; ?>
                                </p>
                            </td>
                        </tr>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>

        <?php if ($totalPages > 1):
            $pagerParams = ['tab' => $activeTab, 'phone' => $searchPhone ?: null];
        ?>
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.5rem; border-top: 1px solid #f1f5f9; background: #fff; flex-wrap: wrap; gap: 0.6rem;">
                <div style="font-size: 0.8rem; color: #64748b; font-weight: 600;">
                    Showing <?php echo $offset + 1; ?> to <?php echo min($offset + $limit, $totalCount); ?> of <?php echo $totalCount; ?> entries
                </div>
                <div style="display: flex; gap: 0.35rem;">
                    <?php if ($page > 1): ?>
                        <a href="<?php echo admin_url('customers', array_filter($pagerParams + ['page' => $page - 1])); ?>"
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
                        <a href="<?php echo admin_url('customers', array_filter($pagerParams + ['page' => $i])); ?>"
                           style="display: inline-flex; align-items: center; justify-content: center; min-width: 32px; height: 32px; padding: 0 6px; border-radius: 8px; border: 1px solid <?php echo $active ? '#6366f1' : '#cbd5e1'; ?>; background: <?php echo $active ? '#6366f1' : '#fff'; ?>; color: <?php echo $active ? '#fff' : '#475569'; ?>; font-weight: 800; text-decoration: none; font-size: 0.82rem;">
                            <?php echo $i; ?>
                        </a>
                    <?php endfor; ?>
                    <?php if ($page < $totalPages): ?>
                        <a href="<?php echo admin_url('customers', array_filter($pagerParams + ['page' => $page + 1])); ?>"
                           style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: #475569; font-weight: 700; text-decoration: none; font-size: 0.85rem;">
                            <i class="fa fa-chevron-right" style="font-size: 0.7rem;"></i>
                        </a>
                    <?php endif; ?>
                </div>
            </div>
        <?php endif; ?>
    </div>
</form>

<script>
document.addEventListener('DOMContentLoaded', function() {
    const selectAll = document.getElementById('select-all');
    const selectAllBar = document.getElementById('select-all-bar');
    const bulkBar = document.getElementById('bulk-actions-bar');
    const countDisplay = document.getElementById('selected-count');

    function updateBulkBar() {
        const currentCheckboxes = document.querySelectorAll('.customer-checkbox');
        const checkedCount = document.querySelectorAll('.customer-checkbox:checked').length;
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
            document.querySelectorAll('.customer-checkbox').forEach(cb => cb.checked = selectAll.checked);
            updateBulkBar();
        });
    }

    if (selectAllBar) {
        selectAllBar.addEventListener('change', function() {
            document.querySelectorAll('.customer-checkbox').forEach(cb => cb.checked = selectAllBar.checked);
            updateBulkBar();
        });
    }

    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('customer-checkbox')) {
            updateBulkBar();
        }
    });
});
</script>
