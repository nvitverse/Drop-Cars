<?php
/**
 * Refund Requests
 *
 * Customer-initiated refund requests (see api/website-cancel-booking.php
 * and dropcars-review/backend's /api/website/bookings/{id}/request-refund).
 * Deliberately NOT auto-processed via Razorpay - the customer requests it
 * and sees a "1-5 working days" promise immediately, but an admin here
 * decides whether/how much to actually refund (manual UPI or a Razorpay
 * refund done outside this page for now) and marks it Processed or Denied.
 */

require_once __DIR__ . '/../../api/includes/backend-client.php';

$actionMessage = null;
$actionError = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['process_id'])) {
    $approve = ($_POST['decision'] ?? '') === 'approve';
    $body = ['approve' => $approve];
    if ($approve) {
        $amount = trim((string) ($_POST['refund_amount'] ?? ''));
        if ($amount !== '') {
            $body['refund_amount'] = (int) $amount;
        }
        // Unchecked = record as done manually without calling Razorpay again
        // (e.g. already refunded via UPI or outside the system).
        $body['via_razorpay'] = isset($_POST['via_razorpay']);
    }
    $notes = trim((string) ($_POST['notes'] ?? ''));
    if ($notes !== '') {
        $body['notes'] = $notes;
    }
    $result = dropcars_backend_request('POST', '/api/website/bookings/' . urlencode($_POST['process_id']) . '/process-refund', $body);
    header('Location: ' . admin_url('refund-requests', $result['ok'] ? ['msg' => $approve ? 'processed' : 'denied'] : ['msg' => 'error']));
    exit;
}

if (isset($_GET['msg'])) {
    if ($_GET['msg'] === 'processed') $actionMessage = 'Refund marked as processed and the customer has been emailed.';
    elseif ($_GET['msg'] === 'denied') $actionMessage = 'Refund request denied and the customer has been emailed.';
    elseif ($_GET['msg'] === 'error') $actionError = 'Could not reach the backend. Check dropcarsApiBaseUrl / dropcarsApiWebsiteKey in api/config.php and try again.';
}

$pendingResult = dropcars_backend_request('GET', '/api/website/bookings/refund-requests');
$pending = $pendingResult['ok'] && is_array($pendingResult['data']) ? $pendingResult['data'] : [];
$backendUnreachable = !$pendingResult['ok'];
?>

<div style="max-width:900px;margin:0 auto;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem;">
        <div>
            <h1 style="font-size:1.4rem;font-weight:800;margin:0;">Refund Requests</h1>
            <p style="color:#64748b;font-size:0.85rem;margin:4px 0 0;">Customers see "1-5 working days" the moment they request - review and process each one below.</p>
        </div>
        <span style="background:#fef3c7;color:#92400e;font-weight:800;font-size:0.85rem;padding:6px 14px;border-radius:999px;"><?php echo count($pending); ?> pending</span>
    </div>

    <?php if ($actionMessage): ?>
        <div style="background:#d1fae5;color:#065f46;border:1px solid #a7f3d0;padding:0.75rem 1rem;border-radius:10px;font-size:0.85rem;font-weight:600;margin-bottom:1rem;"><?php echo htmlspecialchars($actionMessage); ?></div>
    <?php endif; ?>
    <?php if ($actionError): ?>
        <div style="background:#fee2e2;color:#991b1b;border:1px solid #fecaca;padding:0.75rem 1rem;border-radius:10px;font-size:0.85rem;font-weight:600;margin-bottom:1rem;"><?php echo htmlspecialchars($actionError); ?></div>
    <?php endif; ?>

    <?php if ($backendUnreachable): ?>
        <div style="background:#fee2e2;color:#991b1b;border:1px solid #fecaca;padding:0.75rem 1rem;border-radius:10px;font-size:0.85rem;font-weight:600;margin-bottom:1rem;">
            Could not reach the backend (<?php echo htmlspecialchars($pendingResult['error'] ?: 'unknown error'); ?>). Check <code>dropcarsApiBaseUrl</code> / <code>dropcarsApiWebsiteKey</code> in <code>api/config.php</code>.
        </div>
    <?php elseif (empty($pending)): ?>
        <div style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px;padding:2.5rem;text-align:center;color:#64748b;">
            <i class="fa-solid fa-circle-check" style="font-size:1.5rem;color:#22c55e;margin-bottom:0.5rem;display:block;"></i>
            No refund requests waiting right now.
        </div>
    <?php else: ?>
        <?php foreach ($pending as $r): ?>
            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:1.1rem 1.25rem;margin-bottom:0.9rem;">
                <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:1rem;margin-bottom:0.75rem;">
                    <div>
                        <div style="font-weight:800;font-size:0.95rem;"><?php echo htmlspecialchars($r['customer_name']); ?> <span style="color:#94a3b8;font-weight:600;">· <?php echo htmlspecialchars($r['customer_number']); ?></span></div>
                        <?php if (!empty($r['customer_email'])): ?>
                            <div style="color:#64748b;font-size:0.8rem;margin-top:2px;"><?php echo htmlspecialchars($r['customer_email']); ?></div>
                        <?php endif; ?>
                        <div style="color:#94a3b8;font-size:0.78rem;margin-top:2px;">Order #<?php echo htmlspecialchars((string) ($r['linked_order_id'] ?? '-')); ?> · Quoted ₹<?php echo number_format((float) ($r['quoted_total_amount'] ?? 0)); ?></div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:0.7rem;color:#94a3b8;font-weight:700;text-transform:uppercase;">Requested</div>
                        <div style="font-size:0.85rem;font-weight:700;color:#334155;"><?php echo htmlspecialchars($r['refund_requested_at'] ?? '-'); ?></div>
                    </div>
                </div>
                <?php $hasRp = !empty($r['has_razorpay_payment']); ?>
                <div style="margin-bottom:0.6rem;">
                    <?php if ($hasRp): ?>
                        <span style="background:#dbeafe;color:#1d4ed8;font-weight:700;font-size:0.72rem;padding:3px 10px;border-radius:999px;">Razorpay advance on file</span>
                    <?php else: ?>
                        <span style="background:#f1f5f9;color:#64748b;font-weight:700;font-size:0.72rem;padding:3px 10px;border-radius:999px;">No Razorpay payment on file (manual refund only)</span>
                    <?php endif; ?>
                </div>
                <form method="POST" style="display:flex;gap:0.6rem;flex-wrap:wrap;align-items:center;">
                    <input type="hidden" name="process_id" value="<?php echo htmlspecialchars($r['id']); ?>">
                    <input type="number" name="refund_amount" placeholder="Amount refunded (₹)" style="width:160px;padding:0.5rem 0.7rem;border:1px solid #cbd5e1;border-radius:8px;font-weight:600;">
                    <input type="text" name="notes" placeholder="Notes (shown to customer if denied)" style="flex:1;min-width:200px;padding:0.5rem 0.7rem;border:1px solid #cbd5e1;border-radius:8px;">
                    <?php if ($hasRp): ?>
                        <label style="display:flex;align-items:center;gap:5px;font-size:0.8rem;font-weight:600;color:#334155;white-space:nowrap;">
                            <input type="checkbox" name="via_razorpay" value="1" checked>
                            Refund via Razorpay
                        </label>
                    <?php endif; ?>
                    <button type="submit" name="decision" value="approve" class="btn btn-primary" style="background:#16a34a;border:none;color:#fff;padding:0.55rem 1rem;border-radius:8px;font-weight:700;font-size:0.82rem;">
                        <i class="fa-solid fa-check"></i> Mark Processed
                    </button>
                    <button type="submit" name="decision" value="deny" class="btn btn-secondary" style="background:#fff;border:1px solid #fecaca;color:#dc2626;padding:0.55rem 1rem;border-radius:8px;font-weight:700;font-size:0.82rem;" onclick="return confirm('Deny this refund request?');">
                        <i class="fa-solid fa-xmark"></i> Deny
                    </button>
                </form>
            </div>
        <?php endforeach; ?>
    <?php endif; ?>
</div>
