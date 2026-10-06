<?php
/**
 * Website Booking Approvals
 *
 * Bookings confirmed on the website are posted into the FastAPI backend
 * (dropcars-review/backend) as a PENDING CustomerBookingRequest, which the
 * backend auto-approves after a configurable delay (default 10 min) if no
 * admin acts first - see api/confirm_booking.php and
 * dropcars-review/backend/app/api/routes/website_bookings.php. This page
 * lets an admin approve/reject early, either from here or from the backend's
 * Admin app (same underlying request either way).
 */

require_once __DIR__ . '/../../api/includes/backend-client.php';

$actionMessage = null;
$actionError = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['approve_all'])) {
    $result = dropcars_backend_request('POST', '/admin/website-bookings/approve-all');
    if ($result['ok']) {
        $count = (int) ($result['data']['approved_count'] ?? 0);
        header('Location: ' . admin_url('website-booking-approvals', ['msg' => 'approved_all', 'count' => $count]));
    } else {
        header('Location: ' . admin_url('website-booking-approvals', ['msg' => 'error']));
    }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['approve_id'])) {
    $result = dropcars_backend_request('POST', '/api/website/bookings/' . urlencode($_POST['approve_id']) . '/approve');
    header('Location: ' . admin_url('website-booking-approvals', $result['ok'] ? ['msg' => 'approved'] : ['msg' => 'error']));
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['reject_id'])) {
    $reason = trim((string) ($_POST['reason'] ?? 'Rejected by admin'));
    $result = dropcars_backend_request('POST', '/api/website/bookings/' . urlencode($_POST['reject_id']) . '/reject', ['reason' => $reason]);
    header('Location: ' . admin_url('website-booking-approvals', $result['ok'] ? ['msg' => 'rejected'] : ['msg' => 'error']));
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['auto_approve_minutes'])) {
    $minutes = max(1, (int) $_POST['auto_approve_minutes']);
    $result = dropcars_backend_request('PUT', '/api/website/bookings/settings', ['auto_approve_seconds' => $minutes * 60]);
    header('Location: ' . admin_url('website-booking-approvals', $result['ok'] ? ['msg' => 'timer_saved'] : ['msg' => 'error']));
    exit;
}

if (isset($_GET['msg'])) {
    if ($_GET['msg'] === 'approved') $actionMessage = 'Booking approved and posted to the driver/vendor marketplace.';
    elseif ($_GET['msg'] === 'approved_all') $actionMessage = 'Successfully posted ' . (int)($_GET['count'] ?? 0) . ' confirmed bookings to all apps!';
    elseif ($_GET['msg'] === 'rejected') $actionMessage = 'Booking rejected.';
    elseif ($_GET['msg'] === 'timer_saved') $actionMessage = 'Auto-approve timer updated.';
    elseif ($_GET['msg'] === 'error') $actionError = 'Could not reach the backend. Check dropcarsApiBaseUrl / dropcarsApiWebsiteKey in api/config.php and try again.';
}

$settingsResult = dropcars_backend_request('GET', '/api/website/bookings/settings');
$autoApproveSeconds = ($settingsResult['ok'] && is_array($settingsResult['data'])) ? (int) $settingsResult['data']['auto_approve_seconds'] : 600;
$autoApproveMinutes = max(1, (int) round($autoApproveSeconds / 60));

if (!function_exists('dropcars_format_car_type')) {
    // Backend sends raw enum values like "SEDAN_4_PLUS_1" - show "Sedan 4+1"
    function dropcars_format_car_type(?string $raw): string
    {
        if (!$raw) return '';
        $acronyms = ['SUV', 'MUV', 'XUV', 'AC', 'EV'];
        $withPlus = preg_replace('/_PLUS_/i', '+', $raw);
        $words = array_map(function ($word) use ($acronyms) {
            $upper = strtoupper($word);
            if (in_array($upper, $acronyms, true)) return $upper;
            if (preg_match('/^\d/', $word) || strpos($word, '+') !== false) return $word;
            return ucfirst(strtolower($word));
        }, explode('_', $withPlus));
        return preg_replace('/(\d)\s*\+\s*(\d)/', '$1+$2', implode(' ', $words));
    }
}

$pendingResult = dropcars_backend_request('GET', '/api/website/bookings/pending');
$pending = $pendingResult['ok'] && is_array($pendingResult['data']) ? $pendingResult['data'] : [];
$backendUnreachable = !$pendingResult['ok'];
?>

<div style="max-width:900px;margin:0 auto;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem;">
        <div>
            <h1 style="font-size:1.4rem;font-weight:800;margin:0;">Booking Approvals</h1>
            <p style="color:#64748b;font-size:0.85rem;margin:4px 0 0;">Website bookings awaiting a decision before they're posted to the driver/vendor apps. Left untouched, each auto-posts when its timer runs out.</p>
        </div>
        <span id="approvals-pending-count" style="background:#fef3c7;color:#92400e;font-weight:800;font-size:0.85rem;padding:6px 14px;border-radius:999px;"><?php echo count($pending); ?> pending</span>
    </div>

    <?php if ($actionMessage): ?>
        <div style="background:#d1fae5;color:#065f46;border:1px solid #a7f3d0;padding:0.75rem 1rem;border-radius:10px;font-size:0.85rem;font-weight:600;margin-bottom:1rem;"><?php echo htmlspecialchars($actionMessage); ?></div>
    <?php endif; ?>
    <?php if ($actionError): ?>
        <div style="background:#fee2e2;color:#991b1b;border:1px solid #fecaca;padding:0.75rem 1rem;border-radius:10px;font-size:0.85rem;font-weight:600;margin-bottom:1rem;"><?php echo htmlspecialchars($actionError); ?></div>
    <?php endif; ?>

    <form method="POST" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:0.9rem 1.1rem;margin-bottom:1.25rem;display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
        <label style="font-size:0.82rem;font-weight:700;color:#334155;">Auto-approve after</label>
        <input type="number" name="auto_approve_minutes" min="1" value="<?php echo (int) $autoApproveMinutes; ?>" style="width:70px;padding:0.4rem 0.6rem;border:1px solid #cbd5e1;border-radius:8px;font-weight:700;text-align:center;">
        <span style="font-size:0.82rem;color:#64748b;">minutes if nobody approves</span>
        <button type="submit" class="btn btn-secondary" style="padding:0.4rem 0.9rem;border-radius:8px;font-weight:700;font-size:0.8rem;">Save</button>
    </form>

    <?php if (!empty($pending)): ?>
        <form method="POST" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:1rem 1.25rem;margin-bottom:1.25rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
            <div>
                <strong style="color:#1e40af;font-size:0.95rem;display:block;">⚡ Post All Confirmed Bookings to All Apps</strong>
                <span style="color:#3b82f6;font-size:0.8rem;font-weight:600;">Applies standard base tariff, ₹300 Driver Allowance, or 15% All-Inclusive profit margin.</span>
            </div>
            <button type="submit" name="approve_all" value="1" onclick="return confirm('Post all confirmed bookings to all apps immediately with auto-tariff pricing?');" style="background:#1d4ed8;color:#ffffff;border:none;padding:0.6rem 1.2rem;border-radius:8px;font-weight:800;font-size:0.85rem;cursor:pointer;box-shadow:0 2px 4px rgba(29,78,216,0.3);">
                Post All (<?php echo count($pending); ?>) Now
            </button>
        </form>
    <?php endif; ?>

    <?php if ($backendUnreachable): ?>
        <div style="background:#fee2e2;color:#991b1b;border:1px solid #fecaca;padding:0.75rem 1rem;border-radius:10px;font-size:0.85rem;font-weight:600;margin-bottom:1rem;">
            Could not reach the backend (<?php echo htmlspecialchars($pendingResult['error'] ?: 'unknown error'); ?>). Check <code>dropcarsApiBaseUrl</code> / <code>dropcarsApiWebsiteKey</code> in <code>api/config.php</code>.
        </div>
    <?php elseif (empty($pending)): ?>
        <div style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px;padding:2.5rem;text-align:center;color:#64748b;">
            <i class="fa-solid fa-circle-check" style="font-size:1.5rem;color:#22c55e;margin-bottom:0.5rem;display:block;"></i>
            Nothing waiting on approval right now.
        </div>
    <?php else: ?>
        <?php foreach ($pending as $b): ?>
            <?php
            $locations = is_array($b['pickup_drop_location']) ? array_values($b['pickup_drop_location']) : [];
            $pickup = htmlspecialchars($locations[0] ?? '-');
            $drop = htmlspecialchars(end($locations) ?: '-');
            ?>
            <div class="pending-approval-card" data-auto-post-at="<?php echo htmlspecialchars($b['auto_post_at']); ?>" style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:1.1rem 1.25rem;margin-bottom:0.9rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;">
                <div style="flex:1;min-width:220px;">
                    <div style="font-weight:800;font-size:0.95rem;"><?php echo htmlspecialchars($b['customer_name']); ?> <span style="color:#94a3b8;font-weight:600;">· <?php echo htmlspecialchars($b['customer_number']); ?></span></div>
                    <div style="color:#475569;font-size:0.85rem;margin-top:2px;"><?php echo $pickup; ?> → <?php echo $drop; ?></div>
                    <div style="color:#94a3b8;font-size:0.78rem;margin-top:2px;"><?php echo htmlspecialchars($b['trip_type']); ?> · <?php echo htmlspecialchars(dropcars_format_car_type($b['car_type'])); ?> · ₹<?php echo number_format((float) $b['quoted_total_amount']); ?></div>
                </div>
                <div style="text-align:center;min-width:110px;">
                    <div style="font-size:0.7rem;color:#94a3b8;font-weight:700;text-transform:uppercase;">Auto-posts in</div>
                    <div class="approval-countdown" style="font-size:1.05rem;font-weight:800;color:#d97706;">--:--</div>
                </div>
                <div style="display:flex;gap:0.5rem;">
                    <form method="POST" style="display:inline;">
                        <input type="hidden" name="approve_id" value="<?php echo htmlspecialchars($b['id']); ?>">
                        <button type="submit" class="btn btn-primary" style="background:#16a34a;border:none;color:#fff;padding:0.55rem 1rem;border-radius:8px;font-weight:700;font-size:0.82rem;">
                            <i class="fa-solid fa-check"></i> Approve
                        </button>
                    </form>
                    <form method="POST" style="display:inline;" onsubmit="return confirm('Reject this booking? It will not be posted to the marketplace.');">
                        <input type="hidden" name="reject_id" value="<?php echo htmlspecialchars($b['id']); ?>">
                        <input type="hidden" name="reason" value="Rejected by admin">
                        <button type="submit" class="btn btn-secondary" style="background:#fff;border:1px solid #fecaca;color:#dc2626;padding:0.55rem 1rem;border-radius:8px;font-weight:700;font-size:0.82rem;">
                            <i class="fa-solid fa-xmark"></i> Reject
                        </button>
                    </form>
                </div>
            </div>
        <?php endforeach; ?>
    <?php endif; ?>
</div>

<script>
(function () {
    function tick() {
        document.querySelectorAll('.pending-approval-card').forEach(function (card) {
            var autoPostAt = new Date(card.dataset.autoPostAt).getTime();
            var remainingMs = autoPostAt - Date.now();
            var el = card.querySelector('.approval-countdown');
            if (remainingMs <= 0) {
                el.textContent = 'any moment';
                return;
            }
            var totalSeconds = Math.floor(remainingMs / 1000);
            var m = Math.floor(totalSeconds / 60);
            var s = totalSeconds % 60;
            el.textContent = m + ':' + String(s).padStart(2, '0');
        });
    }
    tick();
    setInterval(tick, 1000);
    // Refresh the list periodically so items approved/rejected from the
    // Admin app (or auto-posted by the backend) disappear without a manual reload.
    setInterval(function () { window.location.reload(); }, 30000);
})();
</script>
