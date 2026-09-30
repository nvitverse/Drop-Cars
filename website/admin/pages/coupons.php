<?php
/**
 * Admin Offers & Coupons Management Page - Premium Marketing
 */

$alertMsg = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    if ($action == 'add_or_update') {
        $id = $_POST['id'] ?? null;
        $title = trim((string)($_POST['title'] ?? ''));
        $code = strtoupper(trim((string)($_POST['code'] ?? '')));
        $type = $_POST['discount_type'] ?? '';
        $value = $_POST['discount_value'] ?? 0;
        $expiry = $_POST['expiry_date'] ?? null;
        $applyTo = $_POST['apply_to_trip_type'] ?? 'all';
        $minAmount = !empty($_POST['min_booking_amount']) ? (float)$_POST['min_booking_amount'] : 0.00;
        $isActive = isset($_POST['is_active']) ? 1 : 0;

        if ($id) {
            $stmt = $pdo->prepare("UPDATE `coupons` SET 
                `title` = ?, `code` = ?, `discount_type` = ?, `discount_value` = ?, `expiry_date` = ?, `apply_to_trip_type` = ?, `min_booking_amount` = ?, `is_active` = ? 
                WHERE `id` = ?");
            $stmt->execute([$title, $code, $type, $value, $expiry, $applyTo, $minAmount, $isActive, $id]);
            $alertMsg = "Promotion '{$code}' updated successfully.";
        } else {
            $stmt = $pdo->prepare("INSERT INTO `coupons` (`title`, `code`, `discount_type`, `discount_value`, `expiry_date`, `apply_to_trip_type`, `min_booking_amount`, `is_active`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$title, $code, $type, $value, $expiry, $applyTo, $minAmount, $isActive]);
            $alertMsg = "New promotion '{$code}' is now live.";
        }
    } elseif ($action == 'toggle') {
        $id = (int)($_POST['id'] ?? 0);
        $status = $_POST['status'] ?? 0;
        $pdo->prepare("UPDATE `coupons` SET `is_active` = ? WHERE `id` = ?")->execute([$status, $id]);
        $alertMsg = "Promotion visibility toggled.";
    } elseif ($action == 'delete') {
        $id = (int)($_POST['id'] ?? 0);
        $pdo->prepare("DELETE FROM `coupons` WHERE `id` = ?")->execute([$id]);
        $alertMsg = "Promotion tier purged from system.";
    }
}

// Pagination - low-traffic table today, but unbounded SELECT * with no
// LIMIT gets slower as promo codes accumulate over time.
$couponsLimit = 50;
$couponsPage = isset($_GET['page']) ? max(1, (int) $_GET['page']) : 1;
$couponsTotal = (int) $pdo->query("SELECT COUNT(*) FROM `coupons`")->fetchColumn();
$couponsTotalPages = max(1, (int) ceil($couponsTotal / $couponsLimit));
$couponsPage = min($couponsPage, $couponsTotalPages);
$couponsOffset = ($couponsPage - 1) * $couponsLimit;

$couponsStmt = $pdo->prepare("SELECT * FROM `coupons` ORDER BY `created_at` DESC LIMIT $couponsLimit OFFSET $couponsOffset");
$couponsStmt->execute();
$coupons = $couponsStmt->fetchAll();
?>

<div class="page-header" style="margin-bottom: 1rem; background: #fff; padding: 0.75rem 1rem; border-radius: 14px; border: 1px solid #f1f5f9; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem;">
        <div style="display: flex; align-items: center; gap: 0.65rem;">
            <div style="width: 36px; height: 36px; flex-shrink: 0; background: #fdf4ff; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #9333ea;">
                <i class="fa-solid fa-ticket" style="font-size: 1rem;"></i>
            </div>
            <div>
                <h1 style="font-size: 1.2rem; font-weight: 800; color: #1e293b; margin: 0;">Promotions &amp; Coupons</h1>
                <p style="margin: 0; font-size: 0.75rem; color: #94a3b8;">Manage discount tiers and special event codes</p>
            </div>
        </div>
        <button type="button" class="btn btn-primary" onclick="openCouponModal()" style="height: 34px; padding: 0 0.85rem; font-size: 0.82rem; display: flex; align-items: center; gap: 0.4rem;"><i class="fa fa-plus"></i> New Coupon</button>
    </div>
</div>

<?php if ($alertMsg): ?>
    <div class="alert alert-success" style="margin-bottom: 2rem; border-radius: 12px; background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; padding: 1rem;">
        <i class="fa-solid fa-ticket"></i> <?php echo $alertMsg; ?>
    </div>
<?php endif; ?>

<script>
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('Promo Link copied to clipboard!');
    });
}

function shareOnWhatsApp(code, discountText) {
    const siteUrl = window.location.origin;
    const applyLink = siteUrl + '/?coupon=' + code;
    const message = `🌟 *DROP CARS* 🌟\n` +
                    `_Exclusive Travel Offer_\n\n` +
                    `Get *${discountText}* on your next ride with us!\n\n` +
                    `━━━━━━━━━━━━━━━━━━━\n` +
                    `🎁 *PROMO DETAILS*\n` +
                    `━━━━━━━━━━━━━━━━━━━\n` +
                    `🎟️ *Coupon Code:* *${code}*\n` +
                    `💰 *Benefit:* *${discountText} Discount*\n\n` +
                    `━━━━━━━━━━━━━━━━━━━\n` +
                    `🚀 *HOW TO REDEEM*\n` +
                    `━━━━━━━━━━━━━━━━━━━\n` +
                    `Tap the link below to automatically apply the coupon and estimate your fare:\n` +
                    `👉 ${applyLink}\n\n` +
                    `*Drop Cars* - Clean cars, professional chauffeurs, transparent pricing. Have a wonderful trip!`;
    const encodedMsg = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMsg}`, '_blank');
}
</script>

<div class="card" style="padding: 0; border: 1px solid #eee;">
    <div class="table-responsive">
        <table class="custom-table">
            <thead>
                <tr>
                    <th style="padding-left: 1.5rem;">Promotion & Identifier</th>
                    <th>Benefit Structure</th>
                    <th>Lifecycle</th>
                    <th>Redemption Volume</th>
                    <th>Status</th>
                    <th style="text-align: right; padding-right: 1.5rem;">Actions</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($coupons as $coupon): ?>
                    <?php 
                        $usage = $pdo->prepare("SELECT COUNT(*) FROM `coupon_usages` WHERE `coupon_id` = ?");
                        $usage->execute([$coupon['id']]);
                        $usageCount = $usage->fetchColumn();
                        $isExpired = strtotime($coupon['expiry_date']) < time();
                    ?>
                    <tr>
                        <td style="padding-left: 1.5rem;">
                            <div style="display: flex; align-items: center; gap: 0.75rem;">
                                <div style="width: 36px; height: 36px; background: #fff1f2; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #e11d48;">
                                    <i class="fa-solid fa-gift"></i>
                                </div>
                                <div>
                                    <strong style="display: block; font-size: 0.9rem;"><?php echo htmlspecialchars($coupon['title']); ?></strong>
                                    <code style="font-size: 0.75rem; background: #fefce8; border: 1px dashed #facc15; padding: 2px 6px; border-radius: 4px; font-weight: 800; color: #854d0e;"><?php echo $coupon['code']; ?></code>
                                    <div style="font-size: 0.7rem; color: #64748b; margin-top: 4px;">
                                        Trip: <span style="font-weight: 700; color: #475569;"><?php echo htmlspecialchars(ucwords(str_replace('_', ' ', $coupon['apply_to_trip_type'] ?? 'all'))); ?></span>
                                        <?php if (($coupon['min_booking_amount'] ?? 0) > 0): ?>
                                            • Min: <span style="font-weight: 700; color: #475569;">₹<?php echo (float)$coupon['min_booking_amount']; ?></span>
                                        <?php endif; ?>
                                    </div>
                                </div>
                            </div>
                        </td>
                        <td data-label="Benefit">
                            <?php if ($coupon['discount_type'] == 'flat'): ?>
                                <span style="font-weight: 700;">₹<?php echo $coupon['discount_value']; ?></span> <small style="color: #888;">FLAT OFF</small>
                            <?php else: ?>
                                <span style="font-weight: 700;"><?php echo $coupon['discount_value']; ?>%</span> <small style="color: #888;">PERCENT OFF</small>
                            <?php endif; ?>
                        </td>
                        <td data-label="Expiry">
                            <span style="font-size: 0.85rem; color: <?php echo $isExpired ? '#dc3545' : '#666'; ?>; font-weight: <?php echo $isExpired ? '700' : '400'; ?>;">
                                <i class="fa-solid fa-hourglass-end" style="font-size: 0.75rem;"></i> <?php echo date('d M Y', strtotime($coupon['expiry_date'])); ?>
                            </span>
                            <?php if ($isExpired): ?>
                                <div style="font-size: 0.65rem; color: #dc3545; font-weight: 800;">EXPIRED</div>
                            <?php endif; ?>
                        </td>
                         <td data-label="Usages">
                            <div style="font-size: 0.85rem; font-weight: 600; color: var(--secondary-color);">
                                <?php echo $usageCount; ?> <span style="font-weight: 400; color: #999;">redemptions</span>
                            </div>
                        </td>
                        <td data-label="Status">
                            <?php if ($coupon['is_active'] && !$isExpired): ?>
                                <span class="badge bg-success" style="font-size: 0.65rem; padding: 4px 10px;">ACTIVE</span>
                            <?php else: ?>
                                <span class="badge bg-secondary" style="font-size: 0.65rem; padding: 4px 10px;">INACTIVE</span>
                            <?php endif; ?>
                        </td>
                        <td data-label="Actions" style="text-align: right; padding-right: 1.5rem;">
                             <div style="display: flex; gap: 0.5rem; justify-content: flex-end; align-items: center;">
                                <?php 
                                    $discountDisplay = ($coupon['discount_type'] == 'flat' ? '₹' : '') . $coupon['discount_value'] . ($coupon['discount_type'] == 'percentage' ? '% OFF' : ' OFF');
                                ?>
                                <!-- WhatsApp Broadcast Button -->
                                <button type="button" class="btn-action" onclick="shareOnWhatsApp('<?php echo $coupon['code']; ?>', '<?php echo $discountDisplay; ?>')" style="width: 32px; height: 32px; padding: 0; background: #25D366; border: none; color: white;" title="WhatsApp Broadcast">
                                    <i class="fa-brands fa-whatsapp" style="font-size: 1rem;"></i>
                                </button>

                                <!-- Copy Link Button -->
                                <button type="button" class="btn-action" onclick="copyToClipboard(window.location.origin + '/?coupon=<?php echo $coupon['code']; ?>')" style="width: 32px; height: 32px; padding: 0; background: #f0fdf4; border: 1px solid #dcfce7; color: #16a34a;" title="Copy Auto-Apply Link">
                                    <i class="fa-solid fa-link" style="font-size: 0.85rem;"></i>
                                </button>

                                <button class="btn-action" onclick='editCoupon(<?php echo json_encode($coupon); ?>)' style="width: 32px; height: 32px; padding: 0;">
                                    <i class="fa fa-pen-to-square" style="font-size: 0.85rem; color: #444;"></i>
                                </button>
                                
                                <form action="coupons" method="POST">
                                    <input type="hidden" name="action" value="toggle">
                                    <input type="hidden" name="id" value="<?php echo $coupon['id']; ?>">
                                    <input type="hidden" name="status" value="<?php echo $coupon['is_active'] ? '0' : '1'; ?>">
                                    <button type="submit" class="btn-action" style="width: 32px; height: 32px; padding: 0; background: <?php echo $coupon['is_active'] ? '#f8f9fa' : '#e8f7ee'; ?>;" title="<?php echo $coupon['is_active'] ? 'Deactivate' : 'Activate'; ?>">
                                        <i class="fa-solid <?php echo $coupon['is_active'] ? 'fa-eye-slash' : 'fa-eye'; ?>" style="font-size: 0.85rem; color: <?php echo $coupon['is_active'] ? '#666' : '#25D366'; ?>;"></i>
                                    </button>
                                </form>

                                <form action="coupons" method="POST" onsubmit="return confirm('Purge this promotion?')">
                                    <input type="hidden" name="action" value="delete">
                                    <input type="hidden" name="id" value="<?php echo $coupon['id']; ?>">
                                    <button type="submit" class="btn-action" style="width: 32px; height: 32px; padding: 0; background: #fff5f5;">
                                        <i class="fa fa-trash-alt" style="font-size: 0.85rem; color: #dc3545;"></i>
                                    </button>
                                </form>
                            </div>
                        </td>
                    </tr>
                <?php endforeach; ?>
                <?php if (empty($coupons)): ?>
                    <tr>
                        <td colspan="6" style="text-align: center; padding: 6rem 2rem;">
                            <i class="fa-solid fa-calculator" style="font-size: 4rem; color: #eee; margin-bottom: 1.5rem; display: block;"></i>
                            <span style="color: #999; font-weight: 600;">No active promotions defined yet.</span>
                        </td>
                    </tr>
                <?php endif; ?>
            </tbody>
        </table>

        <?php if ($couponsTotalPages > 1): ?>
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.5rem; border-top: 1px solid #f1f5f9; flex-wrap: wrap; gap: 0.6rem;">
                <div style="font-size: 0.8rem; color: #64748b; font-weight: 600;">
                    Showing <?php echo $couponsOffset + 1; ?> to <?php echo min($couponsOffset + $couponsLimit, $couponsTotal); ?> of <?php echo $couponsTotal; ?> entries
                </div>
                <div style="display: flex; gap: 0.35rem;">
                    <?php if ($couponsPage > 1): ?>
                        <a href="<?php echo admin_url('coupons', ['page' => $couponsPage - 1]); ?>"
                           style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: #475569; font-weight: 700; text-decoration: none; font-size: 0.85rem;">
                            <i class="fa fa-chevron-left" style="font-size: 0.7rem;"></i>
                        </a>
                    <?php endif; ?>
                    <?php for ($i = max(1, $couponsPage - 2); $i <= min($couponsTotalPages, $couponsPage + 2); $i++): $active = ($i === $couponsPage); ?>
                        <a href="<?php echo admin_url('coupons', ['page' => $i]); ?>"
                           style="display: inline-flex; align-items: center; justify-content: center; min-width: 32px; height: 32px; padding: 0 6px; border-radius: 8px; border: 1px solid <?php echo $active ? '#6366f1' : '#cbd5e1'; ?>; background: <?php echo $active ? '#6366f1' : '#fff'; ?>; color: <?php echo $active ? '#fff' : '#475569'; ?>; font-weight: 800; text-decoration: none; font-size: 0.82rem;">
                            <?php echo $i; ?>
                        </a>
                    <?php endfor; ?>
                    <?php if ($couponsPage < $couponsTotalPages): ?>
                        <a href="<?php echo admin_url('coupons', ['page' => $couponsPage + 1]); ?>"
                           style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: #475569; font-weight: 700; text-decoration: none; font-size: 0.85rem;">
                            <i class="fa fa-chevron-right" style="font-size: 0.7rem;"></i>
                        </a>
                    <?php endif; ?>
                </div>
            </div>
        <?php endif; ?>
    </div>
</div>

<!-- Modal Logic -->
<div id="couponModal" class="modal" style="display: none; position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.4); z-index:2000; align-items:center; justify-content:center; backdrop-filter: blur(4px);">
    <div class="card" style="width: 100%; max-width: 480px; box-shadow: 0 20px 40px rgba(0,0,0,0.15);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
            <h3 id="c_modalTitle" style="margin: 0; font-weight: 800; font-size: 1.25rem;">Promotion Config</h3>
            <button type="button" onclick="closeCouponModal()" style="background: none; border: none; font-size: 1.25rem; color: #999; cursor: pointer;">&times;</button>
        </div>
        <form action="coupons" method="POST">
            <input type="hidden" name="action" value="add_or_update">
            <input type="hidden" name="id" id="c_id">
            <div class="form-group">
                <label class="form-label" style="font-size: 0.85rem;">Display Title</label>
                <input type="text" name="title" id="c_title" class="form-control" placeholder="Dashboard Display Name" required>
            </div>
            <div class="form-group">
                <label class="form-label" style="font-size: 0.85rem;">Coupon Identifier</label>
                <input type="text" name="code" id="c_code" class="form-control" style="font-weight: 800; text-transform: uppercase;" placeholder="UNIQUECODE2024" required>
            </div>
            <div style="display: grid; grid-template-columns: 3fr 2fr; gap: 1rem;">
                <div class="form-group">
                    <label class="form-label" style="font-size: 0.85rem;">Benefit Logic</label>
                    <select name="discount_type" id="c_type" class="form-control" required>
                        <option value="flat">Standard Float Deduct (₹)</option>
                        <option value="percentage">Dynamic Scale Offset (%)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label" style="font-size: 0.85rem;">Magnitude</label>
                    <input type="number" step="0.01" name="discount_value" id="c_value" class="form-control" required>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                <div class="form-group">
                    <label class="form-label" style="font-size: 0.85rem;">Applicable Trip Type</label>
                    <select name="apply_to_trip_type" id="c_apply_to_trip_type" class="form-control" style="height: 44px; border-radius: 12px; font-size: 0.85rem;">
                        <option value="all">All Trips</option>
                        <option value="one_way">One-Way Drop</option>
                        <option value="round_trip">Round Trip</option>
                        <option value="hourly_rental">Hourly Rental</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label" style="font-size: 0.85rem;">Min Booking Amount (₹)</label>
                    <input type="number" step="0.01" name="min_booking_amount" id="c_min_booking_amount" class="form-control" style="height: 44px; border-radius: 12px; font-size: 0.85rem;" placeholder="e.g. 0.00">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label" style="font-size: 0.85rem;">Lifecycle Termination (Expiry)</label>
                <input type="date" name="expiry_date" id="c_expiry" class="form-control" required>
            </div>
            <div class="form-group" style="margin-top: 1.5rem; display: flex; align-items: center; gap: 0.5rem; background: #f8f9fa; padding: 0.75rem; border-radius: 8px;">
                <input type="checkbox" name="is_active" id="c_active" checked style="width: 18px; height: 18px;">
                <label for="c_active" style="font-size: 0.9rem; font-weight: 600; cursor: pointer;">Publish and activate immediately</label>
            </div>
            <div style="margin-top: 2.5rem; display: flex; gap: 1rem;">
                <button type="submit" class="btn btn-primary" id="c_modalBtn" style="flex: 1;">Deploy Promotion</button>
                <button type="button" class="btn btn-secondary" onclick="closeCouponModal()">Discard</button>
            </div>
        </form>
    </div>
</div>

<script>
function openCouponModal() {
    document.getElementById('couponModal').style.display = 'flex';
    document.getElementById('c_modalTitle').innerText = 'Define Promotion';
    document.getElementById('c_id').value = '';
    document.getElementById('c_title').value = '';
    document.getElementById('c_code').value = '';
    document.getElementById('c_type').value = 'flat';
    document.getElementById('c_value').value = '';
    document.getElementById('c_apply_to_trip_type').value = 'all';
    document.getElementById('c_min_booking_amount').value = '';
    document.getElementById('c_expiry').value = '';
    document.getElementById('c_active').checked = true;
    document.getElementById('c_modalBtn').innerText = 'Create Coupon';
}
function closeCouponModal() {
    document.getElementById('couponModal').style.display = 'none';
}
function editCoupon(data) {
    openCouponModal();
    document.getElementById('c_modalTitle').innerText = 'Update Promotion';
    document.getElementById('c_id').value = data.id;
    document.getElementById('c_title').value = data.title;
    document.getElementById('c_code').value = data.code;
    document.getElementById('c_type').value = data.discount_type;
    document.getElementById('c_value').value = data.discount_value;
    document.getElementById('c_apply_to_trip_type').value = data.apply_to_trip_type || 'all';
    document.getElementById('c_min_booking_amount').value = data.min_booking_amount || '';
    document.getElementById('c_expiry').value = data.expiry_date;
    document.getElementById('c_active').checked = data.is_active == 1;
    document.getElementById('c_modalBtn').innerText = 'Save Changes';
}
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCouponModal(); });
</script>
