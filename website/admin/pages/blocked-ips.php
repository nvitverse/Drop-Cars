<?php
/**
 * Blocked IPs — spam/fake automation
 */

require_once __DIR__ . '/../includes/blocked-ips-schema.php';
dropcars_ensure_blocked_ips_schema($pdo);

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['unblock_id'])) {
    $uid = (int) $_POST['unblock_id'];
    if ($uid > 0) {
        $pdo->prepare('DELETE FROM `blocked_ips` WHERE `id` = ?')->execute([$uid]);
        header('Location: ' . admin_url('blocked-ips', ['msg' => 'unblocked']));
        exit;
    }
}

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
?>

<div class="page-header" style="margin-bottom: 1rem; background: #fff; padding: 0.75rem 1rem; border-radius: 14px; border: 1px solid #f1f5f9; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem;">
        <div style="display: flex; align-items: center; gap: 0.65rem;">
            <div style="width: 36px; height: 36px; flex-shrink: 0; background: #fff1f2; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #ef4444;">
                <i class="fa-solid fa-ban" style="font-size: 1rem;"></i>
            </div>
            <div>
                <h1 style="font-size: 1.2rem; font-weight: 800; color: #1e293b; margin: 0;">Blocked IPs</h1>
                <p style="margin: 0; font-size: 0.75rem; color: #94a3b8;">Spam/fake IPs — silently ignored on public forms</p>
            </div>
        </div>
        <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;">
            <span style="font-size: 0.8rem; padding: 0.3rem 0.65rem; background: #f1f5f9; color: #334155; border-radius: 8px; font-weight: 600;">
                <strong><?php echo (int) $total; ?></strong> blocked
            </span>
            <a href="<?php echo htmlspecialchars(admin_url('blocked-ips', ['export' => 'google-ads']), ENT_QUOTES, 'UTF-8'); ?>" class="btn btn-secondary" style="height: 34px; padding: 0 0.85rem; font-size: 0.82rem; display: flex; align-items: center; gap: 0.4rem;" download>
                <i class="fa-solid fa-file-export"></i> Export
            </a>
        </div>
    </div>
</div>

<?php if ($pageMsg === 'unblocked'): ?>
    <div class="alert alert-success" style="margin-bottom: 1.25rem; border-radius: 10px;">
        <i class="fa-solid fa-check-circle"></i> IP removed from the block list.
    </div>
<?php endif; ?>

<div class="card" style="margin-bottom: 1.25rem; padding: 1rem 1.25rem; border: 1px solid #e2e8f0; border-radius: 12px; background: #fafbfc;">
    <p style="margin: 0; font-size: 0.9rem; color: #475569; line-height: 1.5;">
        <strong>Google Ads IP exclusions:</strong> Upload the exported <code>.txt</code> file to
        Google Ads → Tools → Shared library → IP exclusions (or campaign-level exclusions) to reduce spend from known spam IPs.
    </p>
</div>

<div class="card" style="padding: 0; border: 1px solid #eee; border-radius: 12px; overflow: hidden;">
    <div class="table-responsive">
        <table class="custom-table">
            <thead>
                <tr>
                    <th>IP address</th>
                    <th>Reason</th>
                    <th>Source</th>
                    <th>Blocked</th>
                    <th style="text-align: right; padding-right: 1.5rem;">Actions</th>
                </tr>
            </thead>
            <tbody>
                <?php if ($rows === []): ?>
                    <tr>
                        <td colspan="5" style="padding: 2rem; text-align: center; color: #888;">No blocked IPs yet.</td>
                    </tr>
                <?php else: ?>
                    <?php foreach ($rows as $r): ?>
                        <tr>
                            <td data-label="IP"><code style="font-size: 0.85rem;"><?php echo htmlspecialchars((string) ($r['ip_address'] ?? ''), ENT_QUOTES, 'UTF-8'); ?></code></td>
                            <td data-label="Reason"><?php echo htmlspecialchars((string) ($r['reason'] ?? ''), ENT_QUOTES, 'UTF-8'); ?></td>
                            <td data-label="Source">
                                <?php
                                $st = (string) ($r['source_type'] ?? '');
                                $sid = (int) ($r['source_id'] ?? 0);
                                echo $st !== '' ? htmlspecialchars(strtoupper($st), ENT_QUOTES, 'UTF-8') . ' #' . $sid : '—';
                                ?>
                            </td>
                            <td data-label="Blocked">
                                <?php
                                $ba = $r['blocked_at'] ?? $r['created_at'] ?? '';
                                echo $ba ? htmlspecialchars(date('d M Y, h:i A', strtotime((string) $ba)), ENT_QUOTES, 'UTF-8') : '—';
                                ?>
                            </td>
                            <td data-label="Actions" style="text-align: right; padding-right: 1.5rem;">
                                <form method="post" action="<?php echo htmlspecialchars(admin_url('blocked-ips'), ENT_QUOTES, 'UTF-8'); ?>" style="display: inline;" onsubmit="return confirm('Unblock this IP?');">
                                    <input type="hidden" name="unblock_id" value="<?php echo (int) ($r['id'] ?? 0); ?>">
                                    <button type="submit" class="btn btn-outline btn-sm" style="font-size: 0.75rem;">Unblock</button>
                                </form>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>
