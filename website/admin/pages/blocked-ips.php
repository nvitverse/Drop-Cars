<?php
/**
 * Blocked IPs — spam/fake automation & Google Ads exclusion management
 */

require_once __DIR__ . '/../includes/blocked-ips-schema.php';
dropcars_ensure_blocked_ips_schema($pdo);

// Handle Unblock
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['unblock_id'])) {
    $uid = (int) $_POST['unblock_id'];
    if ($uid > 0) {
        $pdo->prepare('DELETE FROM `blocked_ips` WHERE `id` = ?')->execute([$uid]);
        header('Location: ' . admin_url('blocked-ips', ['msg' => 'unblocked']));
        exit;
    }
}

// Handle Manual / Confirmed Block
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['block_ip_submit'])) {
    $ipToBlock = trim((string)($_POST['ip_address'] ?? ''));
    $reason = trim((string)($_POST['reason'] ?? 'Admin manual block'));
    $srcType = trim((string)($_POST['source_type'] ?? 'admin'));
    $srcId = (int)($_POST['source_id'] ?? 0);

    if (filter_var($ipToBlock, FILTER_VALIDATE_IP)) {
        $stmt = $pdo->prepare("INSERT INTO `blocked_ips` (`ip_address`, `reason`, `source_type`, `source_id`, `blocked_at`, `created_at`) 
            VALUES (?, ?, ?, ?, NOW(), NOW()) 
            ON DUPLICATE KEY UPDATE `reason` = VALUES(`reason`), `blocked_at` = NOW()");
        $stmt->execute([$ipToBlock, $reason, $srcType, $srcId]);
        header('Location: ' . admin_url('blocked-ips', ['msg' => 'blocked']));
        exit;
    }
}

// Google Ads TXT Export
if (isset($_GET['export']) && (string) $_GET['export'] === 'google-ads') {
    $stmt = $pdo->query('SELECT `ip_address` FROM `blocked_ips` ORDER BY COALESCE(`blocked_at`, `created_at`) DESC');
    $ips = $stmt ? $stmt->fetchAll(PDO::FETCH_COLUMN) : [];
    header('Content-Type: text/plain; charset=utf-8');
    header('Content-Disposition: attachment; filename="dropcars-blocked-ips-google-ads.txt"');
    foreach ($ips as $ip) {
        echo (string) $ip . "\n";
    }
    exit;
}

$listStmt = $pdo->query('SELECT * FROM `blocked_ips` ORDER BY COALESCE(`blocked_at`, `created_at`) DESC');
$rows = $listStmt ? $listStmt->fetchAll(PDO::FETCH_ASSOC) : [];
$total = count($rows);

$pageMsg = $_GET['msg'] ?? '';
$pendingBlockIp = trim((string)($_GET['block_ip'] ?? ''));
$pendingReason = trim((string)($_GET['reason'] ?? 'Spam enquiry from email'));
$pendingSourceType = trim((string)($_GET['source_type'] ?? 'enquiry'));
$pendingSourceId = (int)($_GET['source_id'] ?? 0);
?>

<div class="page-header" style="margin-bottom: 1rem; background: #fff; padding: 0.75rem 1rem; border-radius: 14px; border: 1px solid #f1f5f9; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem;">
        <div style="display: flex; align-items: center; gap: 0.65rem;">
            <div style="width: 36px; height: 36px; flex-shrink: 0; background: #fff1f2; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #ef4444;">
                <i class="fa-solid fa-ban" style="font-size: 1rem;"></i>
            </div>
            <div>
                <h1 style="font-size: 1.2rem; font-weight: 800; color: #1e293b; margin: 0;">Blocked IPs &amp; Spam Shield</h1>
                <p style="margin: 0; font-size: 0.75rem; color: #94a3b8;">Spam/fake IPs — silently ignored on public forms &amp; ready for Google Ads exclusion</p>
            </div>
        </div>
        <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;">
            <span style="font-size: 0.8rem; padding: 0.3rem 0.65rem; background: #f1f5f9; color: #334155; border-radius: 8px; font-weight: 600;">
                <strong><?php echo (int) $total; ?></strong> blocked
            </span>
            <a href="<?php echo htmlspecialchars(admin_url('blocked-ips', ['export' => 'google-ads']), ENT_QUOTES, 'UTF-8'); ?>" class="btn btn-secondary" style="height: 34px; padding: 0 0.85rem; font-size: 0.82rem; display: flex; align-items: center; gap: 0.4rem;" download>
                <i class="fa-solid fa-file-export"></i> Export for Google Ads
            </a>
        </div>
    </div>
</div>

<?php if ($pendingBlockIp && filter_var($pendingBlockIp, FILTER_VALIDATE_IP)): ?>
    <div class="card" style="margin-bottom: 1.25rem; padding: 1.25rem; border: 2px solid #ef4444; border-radius: 14px; background: #fff1f2;">
        <div style="display: flex; align-items: flex-start; gap: 1rem; flex-wrap: wrap;">
            <div style="font-size: 2rem; color: #dc2626;">⚠️</div>
            <div style="flex: 1; min-width: 260px;">
                <h3 style="margin: 0 0 0.4rem 0; color: #991b1b; font-size: 1.1rem; font-weight: 800;">Confirm Block for IP: <?php echo htmlspecialchars($pendingBlockIp, ENT_QUOTES, 'UTF-8'); ?></h3>
                <p style="margin: 0 0 0.85rem 0; font-size: 0.88rem; color: #7f1d1d; line-height: 1.45;">
                    Are you sure you want to block this IP address? Once blocked, all automated or fake enquiry submissions from this IP will be suppressed silently without alerting the user.
                </p>
                <form method="post" action="<?php echo htmlspecialchars(admin_url('blocked-ips'), ENT_QUOTES, 'UTF-8'); ?>" style="display: flex; gap: 0.65rem; align-items: center; flex-wrap: wrap;">
                    <input type="hidden" name="block_ip_submit" value="1">
                    <input type="hidden" name="ip_address" value="<?php echo htmlspecialchars($pendingBlockIp, ENT_QUOTES, 'UTF-8'); ?>">
                    <input type="hidden" name="reason" value="<?php echo htmlspecialchars($pendingReason, ENT_QUOTES, 'UTF-8'); ?>">
                    <input type="hidden" name="source_type" value="<?php echo htmlspecialchars($pendingSourceType, ENT_QUOTES, 'UTF-8'); ?>">
                    <input type="hidden" name="source_id" value="<?php echo (int)$pendingSourceId; ?>">
                    <button type="submit" class="btn btn-primary" style="background: #dc2626; border-color: #dc2626; color: #fff; font-weight: 700; padding: 0.45rem 1.15rem; font-size: 0.85rem;">
                        <i class="fa-solid fa-ban"></i> Yes, Block This IP
                    </button>
                    <a href="<?php echo htmlspecialchars(admin_url('blocked-ips'), ENT_QUOTES, 'UTF-8'); ?>" class="btn btn-secondary" style="padding: 0.45rem 1rem; font-size: 0.85rem;">Cancel</a>
                </form>
            </div>
        </div>
    </div>
<?php endif; ?>

<?php if ($pageMsg === 'blocked'): ?>
    <div class="alert alert-success" style="margin-bottom: 1.25rem; border-radius: 10px; background: #ecfdf5; border: 1px solid #10b981; color: #065f46; padding: 0.75rem 1rem;">
        <i class="fa-solid fa-check-circle"></i> IP address has been blocked successfully and added to the spam exclusion list.
    </div>
<?php elseif ($pageMsg === 'unblocked'): ?>
    <div class="alert alert-success" style="margin-bottom: 1.25rem; border-radius: 10px; background: #ecfdf5; border: 1px solid #10b981; color: #065f46; padding: 0.75rem 1rem;">
        <i class="fa-solid fa-check-circle"></i> IP removed from the block list.
    </div>
<?php endif; ?>

<div class="card" style="margin-bottom: 1.25rem; padding: 1rem 1.25rem; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
    <div style="display: flex; gap: 1rem; align-items: center; justify-content: space-between; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 240px; position: relative;">
            <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 0.85rem;"></i>
            <input type="text" id="blocked-ips-search" placeholder="Search IP address, reason, or date..." style="width: 100%; padding: 8px 12px 8px 34px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.85rem; box-sizing: border-box;" oninput="filterBlockedIps(this.value)">
        </div>
        <form method="post" action="<?php echo htmlspecialchars(admin_url('blocked-ips'), ENT_QUOTES, 'UTF-8'); ?>" style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
            <input type="hidden" name="block_ip_submit" value="1">
            <input type="text" name="ip_address" placeholder="Add IP (e.g. 157.49.x.x)" required style="padding: 7px 10px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.82rem; width: 170px;">
            <input type="text" name="reason" placeholder="Reason (e.g. Manual block)" style="padding: 7px 10px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 0.82rem; width: 170px;">
            <button type="submit" class="btn btn-primary" style="height: 36px; padding: 0 0.85rem; font-size: 0.82rem; font-weight: 700; white-space: nowrap;">
                <i class="fa-solid fa-plus"></i> Block IP
            </button>
        </form>
    </div>
</div>

<div class="card" style="padding: 0; border: 1px solid #eee; border-radius: 12px; overflow: hidden; background: #fff;">
    <div class="table-responsive">
        <table class="custom-table" id="blocked-ips-table">
            <thead>
                <tr>
                    <th>IP address</th>
                    <th>Reason</th>
                    <th>Source</th>
                    <th>Blocked Date</th>
                    <th style="text-align: right; padding-right: 1.5rem;">Actions</th>
                </tr>
            </thead>
            <tbody>
                <?php if ($rows === []): ?>
                    <tr id="no-rows-msg">
                        <td colspan="5" style="padding: 2.5rem; text-align: center; color: #94a3b8;">
                            <i class="fa-solid fa-shield-halved" style="font-size: 2rem; color: #cbd5e1; margin-bottom: 0.5rem; display: block;"></i>
                            No blocked IPs yet. Clean traffic.
                        </td>
                    </tr>
                <?php else: ?>
                    <?php foreach ($rows as $r): ?>
                        <tr class="blocked-ip-row">
                            <td data-label="IP"><code style="font-size: 0.88rem; font-weight: 700; color: #dc2626; background: #fef2f2; padding: 3px 8px; border-radius: 6px;"><?php echo htmlspecialchars((string) ($r['ip_address'] ?? ''), ENT_QUOTES, 'UTF-8'); ?></code></td>
                            <td data-label="Reason" style="font-size: 0.85rem; color: #334155; font-weight: 500;"><?php echo htmlspecialchars((string) ($r['reason'] ?? 'Manual block'), ENT_QUOTES, 'UTF-8'); ?></td>
                            <td data-label="Source">
                                <?php
                                $st = (string) ($r['source_type'] ?? '');
                                $sid = (int) ($r['source_id'] ?? 0);
                                echo $st !== '' ? ('<span style="background: #f1f5f9; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">' . htmlspecialchars(strtoupper($st), ENT_QUOTES, 'UTF-8') . ($sid > 0 ? ' #' . $sid : '') . '</span>') : '—';
                                ?>
                            </td>
                            <td data-label="Blocked Date" style="font-size: 0.82rem; color: #64748b;">
                                <?php
                                $ba = $r['blocked_at'] ?? $r['created_at'] ?? '';
                                echo $ba ? htmlspecialchars(date('d M Y, h:i A', strtotime((string) $ba)), ENT_QUOTES, 'UTF-8') : '—';
                                ?>
                            </td>
                            <td data-label="Actions" style="text-align: right; padding-right: 1.5rem;">
                                <form method="post" action="<?php echo htmlspecialchars(admin_url('blocked-ips'), ENT_QUOTES, 'UTF-8'); ?>" style="display: inline;" onsubmit="return confirm('Unblock IP <?php echo htmlspecialchars((string) ($r['ip_address'] ?? ''), ENT_QUOTES, 'UTF-8'); ?>?');">
                                    <input type="hidden" name="unblock_id" value="<?php echo (int) ($r['id'] ?? 0); ?>">
                                    <button type="submit" class="btn btn-outline btn-sm" style="font-size: 0.75rem; color: #16a34a; border-color: #86efac;">
                                        <i class="fa-solid fa-unlock"></i> Unblock
                                    </button>
                                </form>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>

<script>
function filterBlockedIps(query) {
    var q = (query || "").toLowerCase().trim();
    var rows = document.querySelectorAll('.blocked-ip-row');
    var visibleCount = 0;
    rows.forEach(function(row) {
        var text = (row.textContent || "").toLowerCase();
        if (!q || text.indexOf(q) !== -1) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });
}
</script>

