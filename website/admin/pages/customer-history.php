<?php
/**
 * Admin Customer Booking History Page - Premium Itinerary Timeline
 */

$customerId = (int)($_GET['id'] ?? 0);
$phoneParam = trim($_GET['phone'] ?? '');

$customer = null;

if ($customerId > 0) {
    $stmt = $pdo->prepare("SELECT * FROM `customers` WHERE `id` = ?");
    $stmt->execute([$customerId]);
    $customer = $stmt->fetch();
}

if (!$customer && $phoneParam !== '') {
    $digits = preg_replace('/\D/', '', $phoneParam);
    $last10 = (strlen($digits) >= 10) ? substr($digits, -10) : $digits;
    $stmt = $pdo->prepare("SELECT * FROM `customers` WHERE `phone` LIKE ? OR `phone` LIKE ? LIMIT 1");
    $stmt->execute(['%' . $phoneParam . '%', '%' . $last10]);
    $customer = $stmt->fetch();

    if ($customer) {
        $customerId = (int)$customer['id'];
    }
}

if (!$customer) {
    // If customer record doesn't exist yet, create a virtual/guest record from enquiries/bookings
    $name = 'Guest Customer';
    $searchP = $phoneParam !== '' ? $phoneParam : $customerId;
    $eStmt = $pdo->prepare("SELECT `name` FROM `enquiries` WHERE `phone` LIKE ? AND `name` IS NOT NULL AND `name` != '' ORDER BY `created_at` DESC LIMIT 1");
    $eStmt->execute(['%' . substr(preg_replace('/\D/', '', $searchP), -10)]);
    $foundName = $eStmt->fetchColumn();
    if ($foundName) {
        $name = $foundName;
    } else {
        $bStmt = $pdo->prepare("SELECT `customer_name` FROM `bookings` WHERE `customer_phone` LIKE ? AND `customer_name` IS NOT NULL AND `customer_name` != '' ORDER BY `created_at` DESC LIMIT 1");
        $bStmt->execute(['%' . substr(preg_replace('/\D/', '', $searchP), -10)]);
        $foundBName = $bStmt->fetchColumn();
        if ($foundBName) { $name = $foundBName; }
    }

    $customer = [
        'id' => $customerId ?: 0,
        'name' => $name,
        'phone' => $phoneParam ?: 'N/A',
        'email' => '',
        'created_at' => date('Y-m-d H:i:s'),
        'is_verified' => 0,
        'password' => ''
    ];
}

// Fetch Bookings for this customer
if ($customerId > 0) {
    $stmt = $pdo->prepare("SELECT b.* FROM `bookings` b WHERE b.customer_id = ? ORDER BY b.created_at DESC");
    $stmt->execute([$customerId]);
    $bookings = $stmt->fetchAll();
} else {
    $last10 = substr(preg_replace('/\D/', '', $customer['phone']), -10);
    $stmt = $pdo->prepare("SELECT b.* FROM `bookings` b WHERE b.customer_phone LIKE ? ORDER BY b.created_at DESC");
    $stmt->execute(['%' . $last10]);
    $bookings = $stmt->fetchAll();
}

?>

<div class="page-header" style="margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: space-between; gap: 2rem; flex-wrap: wrap;">
    <div style="display: flex; align-items: center; gap: 1rem;">
        <a href="customers" class="page-header-back" style="width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; color: #64748b; transition: all 0.2s;">
            <i class="fa fa-arrow-left"></i>
        </a>
        <div>
            <h1 style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0;">
                <span style="font-size: 1.25rem;">History: <?php echo htmlspecialchars($customer['name']); ?></span>
            </h1>
            <p style="font-size: 0.75rem; color: #94a3b8; margin: 0; font-weight: 600;">Full travel itinerary and interaction audit.</p>
        </div>
    </div>

    <div style="display: flex; gap: 0.5rem; align-items: center;">
        <div style="background: #fff; border: 1px solid #e2e8f0; padding: 6px 12px; border-radius: 10px; display: flex; align-items: center; gap: 12px;">
            <div style="display: flex; flex-direction: column;">
                <span style="font-size: 0.6rem; color: #94a3b8; font-weight: 800; text-transform: uppercase;">ID Sequence</span>
                <span style="font-size: 0.8rem; font-weight: 800; color: #1e293b;">#<?php echo date('ymd', strtotime($customer['created_at'])) . str_pad($customer['id'] % 100, 2, '0', STR_PAD_LEFT); ?></span>
            </div>
            <div style="height: 20px; width: 1px; background: #f1f5f9;"></div>
            <div style="display: flex; flex-direction: column;">
                <span style="font-size: 0.6rem; color: #94a3b8; font-weight: 800; text-transform: uppercase;">Trust Level</span>
                <span style="font-size: 0.7rem; font-weight: 900; color: <?php echo $customer['is_verified'] ? '#16a34a' : '#f59e0b'; ?>;"><?php echo $customer['is_verified'] ? 'VERIFIED' : 'GUEST'; ?></span>
            </div>
        </div>
        <a href="https://wa.me/<?php echo preg_replace('/\D/', '', $customer['phone']); ?>" target="_blank" class="btn btn-secondary" style="height: 44px; display: flex; align-items: center; justify-content: center; background: #f0fdf4; border: 1px solid #dcfce7; color: #16a34a; border-radius: 10px;"><i class="fa-brands fa-whatsapp" style="font-size: 1.1rem;"></i></a>
    </div>
</div>

<?php
$isRegisteredAcc = ($customer['is_verified'] == 1 || !empty($customer['password']));
?>
<div class="card" style="margin-bottom: 2rem; border: 1px solid #eee; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.02); background: #fff;">
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1.5rem; padding: 0.5rem;">
        <div>
            <span style="display: block; font-size: 0.65rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">Account Identity</span>
            <strong style="font-size: 1rem; color: #1e293b; display: flex; align-items: center; gap: 6px;">
                <?php echo htmlspecialchars($customer['phone']); ?>
                <?php if ($isRegisteredAcc): ?>
                    <span style="font-size: 0.6rem; color: #065f46; background: #dcfce7; padding: 2px 6px; border-radius: 4px; font-weight: 900;">REGISTERED</span>
                <?php else: ?>
                    <span style="font-size: 0.6rem; color: #475569; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-weight: 900;">GUEST</span>
                <?php endif; ?>
            </strong>
            <?php if (!empty($customer['email'])): ?>
                <span style="font-size: 0.78rem; color: #64748b; font-weight: 600; display: flex; align-items: center; gap: 4px; margin-top: 4px;">
                    <i class="fa-regular fa-envelope" style="color: #0284c7;"></i> <?php echo htmlspecialchars($customer['email']); ?>
                </span>
            <?php endif; ?>
        </div>
        <div>
            <span style="display: block; font-size: 0.65rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">Engagement Activity</span>
            <strong style="font-size: 1rem; color: #1e293b;"><?php echo count($bookings); ?> <span style="font-weight: 500; color: #94a3b8;">Trips Booked</span></strong>
            <span style="display: block; font-size: 0.75rem; color: #64748b; margin-top: 4px;">
                WhatsApp Opt-in: <strong><?php echo !empty($customer['use_whatsapp']) ? 'Yes' : 'No'; ?></strong>
            </span>
        </div>
        <div>
            <span style="display: block; font-size: 0.65rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">Life-Cycle Rank</span>
            <span style="font-weight: 800; font-size: 0.9rem; color: #4338ca; background: #eef2ff; padding: 2px 10px; border-radius: 6px; border: 1px solid #e0e7ff; display: inline-block;">
                <?php echo count($bookings) >= 3 ? 'Elite Tier' : (count($bookings) > 0 ? 'Active Tier' : 'New Member'); ?>
            </span>
            <?php if (!empty($customer['referral_code'])): ?>
                <span style="display: block; font-size: 0.75rem; color: #64748b; margin-top: 4px;">
                    Code: <strong><?php echo htmlspecialchars($customer['referral_code']); ?></strong> (Bal: ₹<?php echo number_format((float)($customer['referral_balance'] ?? 0), 0); ?>)
                </span>
            <?php endif; ?>
        </div>
        <div>
            <span style="display: block; font-size: 0.65rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">Registration Date</span>
            <strong style="font-size: 1rem; color: #1e293b;"><?php echo date('d M Y', strtotime($customer['created_at'])); ?></strong>
            <span style="display: block; font-size: 0.75rem; color: #94a3b8; margin-top: 4px;"><?php echo date('h:i A', strtotime($customer['created_at'])); ?></span>
        </div>
    </div>
</div>

<div class="card" style="padding: 0; border: 1px solid #eee; border-radius: 16px; overflow: hidden;">
    <div class="table-responsive">
        <table class="custom-table" style="table-layout: fixed;">
            <thead>
                <tr>
                    <th style="width: 220px; vertical-align: middle; padding-left: 1.5rem;">Trip Logic</th>
                    <th style="min-width: 300px; vertical-align: middle;">Route Detail</th>
                    <th style="width: 180px; vertical-align: middle;">Performance</th>
                    <th style="width: 150px; text-align: right; padding-right: 1.5rem; vertical-align: middle;">Manage</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($bookings as $b): 
                    $bookingRef = (string)($b['booking_id'] ?? 'DC-'.$b['id']);
                ?>
                    <tr>
                        <td style="vertical-align: middle; padding-left: 1.5rem;">
                             <div style="display: flex; flex-direction: column; gap: 2px;">
                                <strong style="font-size: 0.9rem; color: #4338ca;"><?php echo $bookingRef; ?></strong>
                                <span style="font-size: 0.65rem; color: #94a3b8; font-weight: 700;"><?php echo date('d M Y', strtotime($b['created_at'])); ?></span>
                            </div>
                        </td>
                        <td style="vertical-align: middle;">
                            <div style="display: flex; flex-direction: column; gap: 4px;">
                                <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem;">
                                    <span style="color: #94a3b8; font-weight: 700; font-size: 0.65rem; text-transform: uppercase; width: 35px;">From:</span>
                                    <span style="font-weight: 600; color: #334155; opacity: 0.8;"><?php echo htmlspecialchars($b['pickup_location']); ?></span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem;">
                                    <span style="color: #94a3b8; font-weight: 700; font-size: 0.65rem; text-transform: uppercase; width: 35px;">To:</span>
                                    <span style="font-weight: 700; color: #1e293b;"><?php echo htmlspecialchars($b['drop_location']); ?></span>
                                </div>
                                <div style="margin-top: 2px;">
                                    <span style="font-size: 0.6rem; font-weight: 800; background: #f1f5f9; padding: 2px 8px; border-radius: 4px; color: #475569; text-transform: uppercase;"><?php echo strtoupper($b['trip_type']); ?></span>
                                </div>
                            </div>
                        </td>
                        <td style="vertical-align: middle;">
                            <div style="display: flex; flex-direction: column; gap: 4px;">
                                <div style="display: flex; align-items: center; gap: 0.5rem;">
                                    <span style="font-weight: 800; color: #16a34a; font-size: 0.9rem;"><?php echo formatCurrency($b['final_fare']); ?></span>
                                    <span style="color: #cbd5e1;">|</span>
                                    <span style="font-weight: 700; font-size: 0.8rem; color: #64748b;"><?php echo $b['distance_km']; ?> <small>KM</small></span>
                                </div>
                                <div><?php echo getBookingStatusBadge($b['status'], $b['responded_by'] ?? ''); ?></div>
                            </div>
                        </td>
                        <td style="text-align: right; padding-right: 1.5rem; vertical-align: middle;">
                             <a href="customize-booking?id=<?php echo (int)$b['id']; ?>&source=booking" class="enquiry-pill" style="width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: #f8fafc; border: 1px solid #e2e8f0; color: #64748b;" title="View Itinerary Details">
                                <i class="fa-solid fa-arrow-right"></i>
                            </a>
                        </td>
                    </tr>
                <?php endforeach; ?>
                <?php if (empty($bookings)): ?>
                    <tr>
                        <td colspan="4" style="text-align: center; padding: 8rem 2rem;">
                            <div style="font-size: 4rem; color: #f1f5f9; margin-bottom: 2rem;"><i class="fa-solid fa-clock-rotate-left"></i></div>
                            <h3 style="color: #64748b; font-weight: 800; font-size: 1.25rem;">Clean Slate</h3>
                            <p style="color: #94a3b8; font-weight: 500;">No historic travel entries found for this passenger.</p>
                        </td>
                    </tr>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>
