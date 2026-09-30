<?php
/**
 * Unified promotions & marketing management page.
 * Re-architected for "Poster settings", "Coupon settings", and "Festival Mode" tabs.
 */

$configPath = __DIR__ . '/../../api/config.php';
$config = is_file($configPath) ? (include $configPath) : [];

$alertMsg = '';
$alertType = 'success';

$uploadDir = __DIR__ . '/../../assets/img/offers/';
if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    // --- FESTIVAL MODE ACTIONS ---
    if ($action === 'save_festival') {
        $newConfig = $config;
        $newConfig['festivalEnabled']     = isset($_POST['festivalEnabled']);
        $newConfig['festivalName']        = trim((string)($_POST['festivalName']        ?? ''));
        $newConfig['festivalMessage']     = trim((string)($_POST['festivalMessage']     ?? ''));
        $newConfig['festivalDiscountPct'] = (int)($_POST['festivalDiscountPct'] ?? 0);
        $newConfig['festivalStartsAt']    = trim((string)($_POST['festivalStartsAt']    ?? ''));
        $newConfig['festivalEndsAt']      = trim((string)($_POST['festivalEndsAt']      ?? ''));
        $newConfig['festivalPromoCode']   = strtoupper(trim((string)($_POST['festivalPromoCode']   ?? '')));
        if (file_put_contents($configPath, "<?php\nreturn " . var_export($newConfig, true) . ";\n")) {
            $config = $newConfig;
            if (function_exists('sync_settings_to_public_config')) {
                sync_settings_to_public_config();
            }
            $alertMsg = "Festival/promo settings saved.";
        } else {
            $alertMsg = "Error: Could not save festival settings.";
            $alertType = "error";
        }
    }

    // --- COUPON ACTIONS ---
    if ($action == 'add_or_update_coupon') {
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
            $stmt = $pdo->prepare("UPDATE `coupons` SET `title` = ?, `code` = ?, `discount_type` = ?, `discount_value` = ?, `expiry_date` = ?, `apply_to_trip_type` = ?, `min_booking_amount` = ?, `is_active` = ? WHERE `id` = ?");
            $stmt->execute([$title, $code, $type, $value, $expiry, $applyTo, $minAmount, $isActive, $id]);
            $alertMsg = "Coupon '{$code}' updated.";
        } else {
            $stmt = $pdo->prepare("INSERT INTO `coupons` (`title`, `code`, `discount_type`, `discount_value`, `expiry_date`, `apply_to_trip_type`, `min_booking_amount`, `is_active`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$title, $code, $type, $value, $expiry, $applyTo, $minAmount, $isActive]);
            $alertMsg = "Coupon '{$code}' successfully deployed.";
        }
    } 
    // --- BANNER / POSTER ACTIONS ---
    elseif ($action == 'add_or_update_banner') {
        $id = $_POST['id'] ?? null;
        $type = 'image';
        $content = $_POST['content'] ?? '';
        $linkUrl = $_POST['link_url'] ?? '';
        $couponCode = strtoupper($_POST['coupon_code'] ?? '');
        $isPopup = isset($_POST['is_popup']) ? 1 : 0;
        $isActive = isset($_POST['is_active']) ? 1 : 0;

        if (isset($_FILES['poster_file']) && $_FILES['poster_file']['error'] === UPLOAD_ERR_OK) {
            $fileName = $_FILES['poster_file']['name'];
            $fileExtension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
            if (in_array($fileExtension, ['jpg', 'png', 'jpeg', 'webp'])) {
                $newFileName = md5(time() . $fileName) . '.' . $fileExtension;
                if(move_uploaded_file($_FILES['poster_file']['tmp_name'], $uploadDir . $newFileName)) {
                    $content = 'assets/img/offers/' . $newFileName;
                }
            }
        }

        if ($id) {
            $stmt = $pdo->prepare("UPDATE `banners` SET `type` = ?, `content` = ?, `link_url` = ?, `coupon_code` = ?, `is_popup` = ?, `is_active` = ? WHERE `id` = ?");
            $stmt->execute([$type, $content, $linkUrl, $couponCode, $isPopup, $isActive, $id]);
        } else {
            $stmt = $pdo->prepare("INSERT INTO `banners` (`type`, `content`, `link_url`, `coupon_code`, `is_popup`, `is_active`) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->execute([$type, $content, $linkUrl, $couponCode, $isPopup, $isActive]);
        }
        $alertMsg = "Marketing asset sync complete.";
    } 
    elseif ($action == 'delete_banner') {
        $pdo->prepare("DELETE FROM `banners` WHERE `id` = ?")->execute([(int)($_POST['id'] ?? 0)]);
        $alertMsg = "Asset purged.";
    }
    elseif ($action == 'delete_coupon') {
        $pdo->prepare("DELETE FROM `coupons` WHERE `id` = ?")->execute([(int)($_POST['id'] ?? 0)]);
        $alertMsg = "Coupon purged.";
    }
    elseif ($action == 'toggle_visibility') {
        $table = ($_POST['table'] ?? '') === 'coupons' ? 'coupons' : 'banners';
        $pdo->prepare("UPDATE `$table` SET `is_active` = ? WHERE `id` = ?")->execute([$_POST['status'] ?? 0, (int)($_POST['id'] ?? 0)]);
        $alertMsg = "State sync completed.";
    }
}

$coupons = $pdo->query("SELECT * FROM `coupons` ORDER BY `created_at` DESC")->fetchAll();
$banners = $pdo->query("SELECT * FROM `banners` ORDER BY `created_at` DESC")->fetchAll();
?>

<style>
    .promo-nav { display: flex; gap: 1rem; justify-content: center; margin-bottom: 2rem; flex-wrap: wrap; }
    .nav-btn { padding: 1rem 2.5rem; border-radius: 16px; font-weight: 850; font-size: 1rem; border: none; cursor: pointer; transition: 0.3s; display: flex; align-items: center; gap: 12px; background: #f1f5f9; color: #64748b; white-space: nowrap; }
    .nav-btn.active { background: #1e293b; color: white; box-shadow: 0 10px 25px rgba(30,41,59,0.2); }
    .nav-btn.active.coupons { background: #f7b733; color: #1e293b; box-shadow: 0 10px 25px rgba(247,183,51,0.25); }
    .nav-btn.active.festival { background: #db2777; color: white; box-shadow: 0 10px 25px rgba(219,39,119,0.25); }

    .switch { position: relative; display: inline-block; width: 44px; height: 22px; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; border-radius: 34px; }
    .slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
    input:checked + .slider { background-color: #db2777; }
    input:checked + .slider:before { transform: translateX(22px); }

    .tab-content { display: none; transition: 0.3s opacity; }
    .tab-content.active { display: block; }
    
    .poster-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem; }
    .poster-card { background: white; border-radius: 20px; border: 1px solid #f1f5f9; overflow: hidden; position: relative; box-shadow: 0 4px 15px rgba(0,0,0,0.02); }
    .poster-img-box { width: 100%; aspect-ratio: 21/9; background: #f8fafc; position: relative; overflow: hidden; }
    .poster-img-box img { width: 100%; height: 100%; object-fit: cover; }
    
    .status-badge { position: absolute; top: 1rem; left: 1rem; padding: 4px 12px; border-radius: 20px; font-size: 0.65rem; font-weight: 900; text-transform: uppercase; z-index: 5; backdrop-filter: blur(8px); color: white; border: 1px solid rgba(255,255,255,0.2); }
    .action-btns { position: absolute; top: 1rem; right: 1rem; display: flex; gap: 0.5rem; opacity: 0; transform: translateY(-5px); transition: 0.3s; z-index: 10; }
    .poster-card:hover .action-btns { opacity: 1; transform: translateY(0); }
    
    .circle-btn { width: 34px; height: 34px; border-radius: 10px; background: white; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #1e293b; box-shadow: 0 4px 8px rgba(0,0,0,0.1); transition: 0.2s; }
    
    .coupon-table { width: 100%; border-collapse: separate; border-spacing: 0; }
    .coupon-table th { background: #f8fafc; padding: 1rem; text-align: left; font-size: 0.65rem; text-transform: uppercase; font-weight: 950; color: #94a3b8; border-bottom: 1px solid #f1f5f9; }
    .coupon-table td { padding: 1rem; border-bottom: 1px solid #f8fafc; vertical-align: middle; }
    
    .upload-zone { background: #f8fafc; border: 2px dashed #cbd5e1; padding: 2rem; border-radius: 16px; text-align: center; cursor: pointer; transition: 0.3s; }
    .upload-zone:hover { border-color: #1e293b; background: #f1f5f9; }

    /* Responsive / Mobile CSS Improvements */
    .coupon-table-wrapper { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .tab-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; gap: 1rem; }
    .festival-card { max-width: 600px; margin: 0 auto; background: white; border: 1px solid #f1f5f9; border-radius: 20px; padding: 2.25rem; box-shadow: 0 10px 30px rgba(0,0,0,0.02); }
    .grid-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
    .grid-festival-name { display: grid; grid-template-columns: 2fr 1fr; gap: 1rem; margin-bottom: 1.25rem; }

    @media (max-width: 1024px) {
        .action-btns { opacity: 1; transform: translateY(0); }
    }

    @media (max-width: 768px) {
        .promo-nav { gap: 0.5rem; }
        .nav-btn { padding: 0.75rem 1.25rem; font-size: 0.85rem; border-radius: 12px; gap: 8px; }
        .coupon-table { min-width: 0 !important; }
        
        /* Table responsive stacking */
        .coupon-table, .coupon-table thead, .coupon-table tbody, .coupon-table tr, .coupon-table td {
            display: block !important;
            width: 100% !important;
        }
        .coupon-table thead {
            display: none !important;
        }
        .coupon-table tr {
            background: white !important;
            border: 1px solid #f1f5f9 !important;
            border-radius: 16px !important;
            margin-bottom: 1rem !important;
            padding: 1.25rem !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.02) !important;
        }
        .coupon-table td {
            border: none !important;
            padding: 0.6rem 0 !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            text-align: right !important;
            border-bottom: 1px dashed #f1f5f9 !important;
        }
        .coupon-table td:last-child {
            border-bottom: none !important;
            justify-content: flex-end !important;
            padding-top: 0.75rem !important;
            margin-top: 0.5rem !important;
        }
        .coupon-table td::before {
            content: attr(data-label);
            font-weight: 800;
            color: #94a3b8;
            font-size: 0.7rem;
            text-transform: uppercase;
            text-align: left;
            margin-right: 1rem;
            flex-shrink: 0;
        }
        .coupon-table td > div {
            justify-content: flex-end !important;
        }
    }

    @media (max-width: 600px) {
        .promo-nav {
            display: grid !important;
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 0.5rem !important;
        }
        .nav-btn {
            padding: 0.75rem 0.25rem !important;
            font-size: 0.75rem !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            text-align: center !important;
            border-radius: 12px !important;
            gap: 4px !important;
            white-space: normal !important;
        }
        .nav-btn i {
            font-size: 1.1rem !important;
            margin: 0 !important;
        }
    }

    @media (max-width: 480px) {
        .page-header h1 { font-size: 1.4rem !important; }
        .page-header p { font-size: 0.8rem !important; }
        .tab-header { flex-direction: column; align-items: stretch; text-align: center; }
        .tab-header h2 { text-align: left; }
        .tab-header button { width: 100%; padding: 0.8rem !important; }
        .festival-card { padding: 1.25rem; border-radius: 16px; }
        .grid-2col { grid-template-columns: 1fr; gap: 0.75rem; }
        .grid-2col > div.flex-align-bottom { padding-top: 0 !important; }
        .grid-festival-name { grid-template-columns: 1fr; gap: 0.75rem; }
        .modal { padding: 1rem 0.5rem !important; }
        .modal .card { padding: 1.25rem !important; margin: 1rem auto !important; border-radius: 16px !important; }
        .modal h3 { font-size: 1.25rem !important; margin-bottom: 1rem !important; }
    }
</style>

<div class="page-header" style="margin-bottom: 2rem;">
    <h1 style="font-size: 1.75rem; font-weight: 950; letter-spacing: -0.04em; margin-bottom: 4px; color: #1e293b;">Promotions &amp; Marketing</h1>
    <p style="font-weight: 700; color: #94a3b8; font-size: 0.9rem;">Manage promotional banners, coupon codes, and seasonal festival modes.</p>
</div>

<div class="promo-nav">
    <button class="nav-btn active banners" data-tab="banners" onclick="switchMainTab('banners', this)">
        <i class="fa-solid fa-rectangle-ad"></i> Promo Posters
    </button>
    <button class="nav-btn coupons" data-tab="coupons" onclick="switchMainTab('coupons', this)">
        <i class="fa-solid fa-ticket"></i> Discount Coupons
    </button>
    <button class="nav-btn festival" data-tab="festival" onclick="switchMainTab('festival', this)">
        <i class="fa-solid fa-gift"></i> Festival Mode
    </button>
</div>

<?php if ($alertMsg): ?>
    <div style="background: #f0fdf4; color: #16a34a; padding: 1rem; border-radius: 12px; margin-bottom: 1.5rem; font-weight: 800; border: 1px solid #dcfce7;">
        <i class="fa-solid fa-bolt"></i> <?php echo $alertMsg; ?>
    </div>
<?php endif; ?>

<!-- BANNERS VIEW -->
<div id="tab-banners" class="tab-content active">
    <div class="tab-header">
        <h2 style="margin: 0; font-size: 1.25rem; font-weight: 950; color: #1e293b;">Promotional Banners</h2>
        <button class="btn btn-primary" onclick="openBannerModal()" style="background: #1e293b; color: white; border: none; padding: 0.6rem 1.25rem; border-radius: 10px; font-weight: 800; font-size: 0.8rem;">+ Add Poster</button>
    </div>
    
    <div class="poster-grid">
        <?php foreach ($banners as $b): ?>
            <?php $src = (strpos($b['content'], 'assets/') === 0 ? '../../' : '') . $b['content']; ?>
            <div class="poster-card">
                <div class="poster-img-box">
                    <div class="status-badge" style="background: <?php echo $b['is_active'] ? '#22c55e' : '#64748b'; ?>;">
                        <?php echo $b['is_active'] ? 'Live' : 'Staged'; ?>
                    </div>
                    <div class="action-btns">
                        <button class="circle-btn" onclick='editBanner(<?php echo json_encode($b); ?>)'><i class="fa fa-pen"></i></button>
                        <form action="" method="POST" onsubmit="return confirm('Purge asset?')" style="margin: 0;">
                            <input type="hidden" name="action" value="delete_banner"><input type="hidden" name="id" value="<?php echo $b['id']; ?>">
                            <button class="circle-btn" style="color: #ef4444;"><i class="fa fa-trash"></i></button>
                        </form>
                    </div>
                    <img src="<?php echo $src; ?>" onerror="this.src='https://placehold.co/800x400?text=InvalidPath'">
                </div>
                <div style="padding: 1.25rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <div>
                            <span style="font-size: 0.6rem; text-transform: uppercase; font-weight: 950; color: #94a3b8; display: block;">Destination</span>
                            <strong style="font-size: 0.85rem; color: #1e293b;"><?php echo !empty($b['link_url']) ? $b['link_url'] : 'Home Storefront'; ?></strong>
                        </div>
                        <?php if ($b['is_popup']): ?>
                            <div style="background: #fff1f2; color: #e11d48; padding: 4px 8px; border-radius: 6px; font-size: 0.6rem; font-weight: 900;">POPUP</div>
                        <?php endif; ?>
                    </div>
                    <form action="" method="POST">
                        <input type="hidden" name="action" value="toggle_visibility"><input type="hidden" name="table" value="banners"><input type="hidden" name="id" value="<?php echo $b['id']; ?>"><input type="hidden" name="status" value="<?php echo $b['is_active'] ? '0' : '1'; ?>">
                        <button type="submit" class="btn" style="width: 100%; padding: 0.6rem; border-radius: 10px; font-weight: 900; font-size: 0.75rem; border: none; <?php echo $b['is_active'] ? 'background:#f1f5f9; color:#64748b;' : 'background:#f7b733; color:#1e293b;'; ?>">
                            <?php echo $b['is_active'] ? 'Disable Asset' : 'Deploy Live'; ?>
                        </button>
                    </form>
                </div>
            </div>
        <?php endforeach; ?>
    </div>
</div>

<!-- COUPONS VIEW -->
<div id="tab-coupons" class="tab-content">
    <div class="tab-header">
        <h2 style="margin: 0; font-size: 1.25rem; font-weight: 950; color: #1e293b;">Discount Coupons</h2>
        <button class="btn btn-primary" onclick="openCouponModal()" style="background: #f7b733; color: #1e293b; border: none; padding: 0.6rem 1.25rem; border-radius: 10px; font-weight: 800; font-size: 0.8rem;">+ Add Coupon</button>
    </div>

    <div class="card" style="padding: 0; border: 1px solid #f1f5f9; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.02);">
        <div class="coupon-table-wrapper">
            <table class="coupon-table" style="width: 100%; table-layout: fixed;">
            <thead>
                <tr>
                    <th style="padding: 0.75rem 1rem; width: 32%; font-size: 0.65rem;">Coupon Info</th>
                    <th style="padding: 0.75rem 1rem; width: 22%; font-size: 0.65rem;">Discount Value</th>
                    <th style="padding: 0.75rem 1rem; width: 16%; font-size: 0.65rem;">Expiry / Status</th>
                    <th style="padding: 0.75rem 1rem; width: 30%; text-align: right; font-size: 0.65rem;">Actions</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($coupons as $c): ?>
                    <?php 
                        $daysLeft = round((strtotime($c['expiry_date']) - time()) / 86400);
                        $col = $daysLeft < 3 ? '#ef4444' : '#10b981';
                    ?>
                    <tr style="transition: 0.2s;" onmouseover="this.style.background='#fcfdfe'" onmouseout="this.style.background='transparent'">
                        <td data-label="Coupon Info" style="padding: 0.4rem 1rem; overflow: hidden;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <div style="width: 24px; height: 24px; background: #f1f5f9; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #64748b; flex-shrink: 0;"><i class="fa fa-ticket" style="font-size: 0.6rem;"></i></div>
                                <div style="overflow: hidden; line-height: 1.1; text-align: left;">
                                    <strong style="display: block; font-size: 0.75rem; color: #1e293b; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;"><?php echo htmlspecialchars($c['title']); ?></strong>
                                    <span style="font-size: 0.6rem; font-weight: 850; color: #6366f1; text-transform: uppercase;"><?php echo $c['code']; ?></span>
                                    <div style="font-size: 0.55rem; color: #64748b; margin-top: 2px;">
                                        Trip: <span style="font-weight: 700; color: #475569;"><?php echo htmlspecialchars(ucwords(str_replace('_', ' ', $c['apply_to_trip_type'] ?? 'all'))); ?></span>
                                        <?php if (($c['min_booking_amount'] ?? 0) > 0): ?>
                                            • Min: <span style="font-weight: 700; color: #475569;">₹<?php echo (float)$c['min_booking_amount']; ?></span>
                                        <?php endif; ?>
                                    </div>
                                </div>
                            </div>
                        </td>
                        <td data-label="Discount Value" style="padding: 0.4rem 1rem;">
                            <?php if ($c['discount_type'] === 'percentage'): ?>
                                <span style="background: #eff6ff; color: #3b82f6; padding: 2px 6px; border-radius: 6px; font-size: 0.65rem; font-weight: 950;">-<?php echo (float)$c['discount_value']; ?>%</span>
                            <?php else: ?>
                                <span style="background: #f0fdf4; color: #16a34a; padding: 2px 6px; border-radius: 6px; font-size: 0.65rem; font-weight: 950;">-₹<?php echo (float)$c['discount_value']; ?></span>
                            <?php endif; ?>
                        </td>
                        <td data-label="Expiry / Status" style="padding: 0.4rem 1rem;">
                            <div style="display: flex; align-items: center; gap: 4px;"><div style="width: 5px; height: 5px; border-radius: 50%; background: <?php echo $col; ?>;"></div> <span style="font-weight: 850; font-size: 0.65rem; color: <?php echo $col; ?>;"><?php echo $daysLeft < 0 ? 'Expired' : $daysLeft . 'd left'; ?></span></div>
                        </td>
                        <td data-label="Actions" style="padding: 0.4rem 1rem; text-align: right;">
                            <div style="display: flex; gap: 0.35rem; justify-content: flex-end; align-items: center;">
                                <button class="btn" onclick="shareOnWhatsApp('<?php echo $c['code']; ?>', '<?php echo ($c['discount_type'] == 'flat' ? '₹' : '') . (float)$c['discount_value'] . ($c['discount_type'] == 'percentage' ? '%' : ''); ?>')" style="padding: 4px 8px; border-radius: 6px; background: #22c55e; color: white; font-size: 0.6rem; border:none; font-weight: 900; white-space: nowrap;">
                                    <i class="fa-brands fa-whatsapp"></i> Broadcast
                                </button>
                                <form action="" method="POST" style="margin: 0;">
                                    <input type="hidden" name="action" value="toggle_visibility"><input type="hidden" name="table" value="coupons"><input type="hidden" name="id" value="<?php echo $c['id']; ?>"><input type="hidden" name="status" value="<?php echo $c['is_active'] ? '0' : '1'; ?>">
                                    <button type="submit" style="background: <?php echo $c['is_active'] ? '#f8fafc' : '#fef08a'; ?>; border: 1px solid #f1f5f9; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #475569;" title="Toggle"><i class="fa-solid <?php echo $c['is_active'] ? 'fa-eye' : 'fa-eye-slash'; ?>" style="font-size: 0.9rem;"></i></button>
                                </form>
                                <button onclick='editCoupon(<?php echo json_encode($c); ?>)' style="background: #f8fafc; border: 1px solid #f1f5f9; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #475569;" title="Edit"><i class="fa fa-pen" style="font-size: 0.85rem;"></i></button>
                                <form action="" method="POST" onsubmit="return confirm('Purge this coupon?')" style="margin: 0;">
                                    <input type="hidden" name="action" value="delete_coupon"><input type="hidden" name="id" value="<?php echo $c['id']; ?>">
                                    <button type="submit" style="background: #fff1f2; border: 1px solid #fecaca; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #e11d48;" title="Purge"><i class="fa fa-trash" style="font-size: 0.8rem;"></i></button>
                                </form>
                            </div>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
        </div>
    </div>
</div>

<!-- FESTIVAL VIEW -->
<div id="tab-festival" class="tab-content">
    <div class="festival-card">
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.5rem;padding-bottom:1rem;border-bottom:1px solid #f1f5f9;">
            <div style="width:40px;height:40px;background:rgba(236,72,153,.12);color:#db2777;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;"><i class="fa-solid fa-gift"></i></div>
            <div>
                <h3 style="margin:0; font-size:1.1rem; font-weight:900; color:#1e293b;">Festival &amp; Promo Mode</h3>
                <span style="font-size:.75rem;color:#888;">Time-bound discount campaign (Diwali, Pongal, etc.)</span>
            </div>
        </div>
        
        <form method="POST">
            <input type="hidden" name="action" value="save_festival">
            
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1.5rem; padding: 1rem; background: #fdf2f8; border-radius: 14px; border: 1px solid #fbcfe8;">
                <div>
                    <strong style="display:block; font-size:.85rem; color:#db2777;">Festival Mode Active</strong>
                    <span style="font-size:.72rem; color:#64748b; margin-top:2px; display:block;">Apply discount + show promo banner globally on site</span>
                </div>
                <label class="switch" style="margin:0;">
                    <input type="checkbox" name="festivalEnabled" <?php echo !empty($config['festivalEnabled']) ? 'checked' : ''; ?>>
                    <span class="slider"></span>
                </label>
            </div>
            
            <div class="grid-festival-name">
                <div class="form-group" style="margin-bottom:0;">
                    <label class="form-label" style="font-size:0.65rem; font-weight:950; color:#94a3b8; text-transform:uppercase; display:block; margin-bottom:0.4rem;">Festival Name</label>
                    <input type="text" name="festivalName" class="form-control" value="<?php echo htmlspecialchars($config['festivalName'] ?? ''); ?>" placeholder="e.g. Diwali Special" style="height: 44px; border-radius: 12px; font-size: 0.85rem;">
                </div>
                <div class="form-group" style="margin-bottom:0;">
                    <label class="form-label" style="font-size:0.65rem; font-weight:950; color:#94a3b8; text-transform:uppercase; display:block; margin-bottom:0.4rem;">Discount %</label>
                    <input type="number" name="festivalDiscountPct" class="form-control" value="<?php echo (int)($config['festivalDiscountPct'] ?? 0); ?>" min="0" max="100" placeholder="15" style="height: 44px; border-radius: 12px; font-size: 0.85rem;">
                </div>
            </div>
            
            <div class="form-group" style="margin-bottom:1.25rem;">
                <label class="form-label" style="font-size:0.65rem; font-weight:950; color:#94a3b8; text-transform:uppercase; display:block; margin-bottom:0.4rem;">Banner Message</label>
                <input type="text" name="festivalMessage" class="form-control" value="<?php echo htmlspecialchars($config['festivalMessage'] ?? ''); ?>" placeholder="Light up your trip &mdash; 15% off all bookings this Diwali week!" maxlength="200" style="height: 44px; border-radius: 12px; font-size: 0.85rem;">
            </div>
            
            <div class="grid-2col" style="margin-bottom: 1.25rem;">
                <div class="form-group" style="margin-bottom:0;">
                    <label class="form-label" style="font-size:0.65rem; font-weight:950; color:#94a3b8; text-transform:uppercase; display:block; margin-bottom:0.4rem;">Starts On</label>
                    <input type="date" name="festivalStartsAt" class="form-control" value="<?php echo htmlspecialchars($config['festivalStartsAt'] ?? ''); ?>" style="height: 44px; border-radius: 12px; font-size: 0.85rem;">
                </div>
                <div class="form-group" style="margin-bottom:0;">
                    <label class="form-label" style="font-size:0.65rem; font-weight:950; color:#94a3b8; text-transform:uppercase; display:block; margin-bottom:0.4rem;">Ends On</label>
                    <input type="date" name="festivalEndsAt" class="form-control" value="<?php echo htmlspecialchars($config['festivalEndsAt'] ?? ''); ?>" style="height: 44px; border-radius: 12px; font-size: 0.85rem;">
                </div>
            </div>
            
            <div class="form-group" style="margin-bottom:1.5rem;">
                <label class="form-label" style="font-size:0.65rem; font-weight:950; color:#94a3b8; text-transform:uppercase; display:block; margin-bottom:0.4rem;">Promo Code</label>
                <input type="text" name="festivalPromoCode" class="form-control" value="<?php echo htmlspecialchars($config['festivalPromoCode'] ?? ''); ?>" placeholder="FESTIVE15" maxlength="20" style="text-transform:uppercase; height: 44px; border-radius: 12px; font-size: 0.85rem;">
                <small style="font-size:.7rem;color:#888; display:block; margin-top:4px;">Customers enter this code on the booking form to claim the discount.</small>
            </div>
            
            <button type="submit" class="btn btn-primary" style="width: 100%; border: none; background: #db2777; color: white; padding: 1rem; border-radius: 14px; font-weight: 900; font-size: 0.9rem; box-shadow: 0 4px 12px rgba(219,39,119,0.25);">
                <i class="fa-solid fa-save"></i> Save Festival Settings
            </button>
        </form>
    </div>
</div>

<!-- STEP 1 MODAL: POSTER CONFIG -->
<div id="bannerModal" class="modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.65); z-index: 10000; align-items: flex-start; justify-content: center; overflow-y: auto; padding: 2rem 1rem; backdrop-filter: blur(8px);">
    <div class="card" style="width: 95%; max-width: 460px; border-radius: 24px; padding: 2rem; position: relative; box-shadow: 0 50px 100px -20px rgba(0,0,0,0.3); margin: 2rem auto;">
        <button onclick="closeBannerModal()" style="position: absolute; top: 1.5rem; right: 1.5rem; background: #f1f5f9; border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer;">&times;</button>
        <h3 id="b_modalTitle" style="margin-top: 0; margin-bottom: 1.5rem; font-weight: 950; font-size: 1.5rem;">Add Promotional Poster</h3>
        
        <form action="" method="POST" enctype="multipart/form-data">
            <input type="hidden" name="action" value="add_or_update_banner"><input type="hidden" name="id" id="b_id">
            
            <div class="upload-zone" onclick="document.getElementById('b_upload').click()">
                <input type="file" name="poster_file" id="b_upload" hidden onchange="previewUpload(this)">
                <div id="b_upload_text">
                    <i class="fa-solid fa-cloud-arrow-up" style="font-size: 1.5rem; margin-bottom: 0.75rem; color: #94a3b8;"></i><br>
                    <strong style="color: #64748b; font-size: 0.8rem;">Pick Image from Local</strong>
                </div>
            </div>
 
            <div style="margin: 1rem 0;">
                <input type="text" name="content" id="b_content" class="form-control" placeholder="...or enter external image URL" style="height: 44px; border-radius: 12px; font-size: 0.85rem;" oninput="updateAssetPreview(this.value)">
            </div>
 
            <div id="b_preview" style="width: 100%; aspect-ratio: 21/9; background: #f8fafc; border-radius: 14px; overflow: hidden; margin-bottom: 1.25rem; border: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: center; color: #cbd5e1; font-weight: 800; font-size: 0.7rem;">
                PREVIEW
            </div>
 
            <div style="margin-bottom: 1rem;">
                <label style="font-size: 0.65rem; font-weight: 950; color: #94a3b8; text-transform: uppercase;">Destination Link (Optional)</label>
                <input type="text" name="link_url" id="b_link" class="form-control" placeholder="e.g. /chennai" style="height: 44px; border-radius: 12px; font-size: 0.85rem;">
            </div>
 
            <div class="grid-2col" style="margin-bottom: 1.5rem;">
                <div>
                    <label style="font-size: 0.65rem; font-weight: 950; color: #94a3b8; text-transform: uppercase;">Auto-Apply Code</label>
                    <input type="text" name="coupon_code" id="b_coupon" class="form-control" style="text-transform: uppercase; font-weight: 950; height: 44px; border-radius: 12px; font-size: 0.85rem;" placeholder="SAVE10">
                </div>
                <div class="flex-align-bottom" style="display: flex; align-items: center; gap: 8px; padding-top: 1rem;">
                    <input type="checkbox" name="is_popup" id="b_popup" style="width: 18px; height: 18px; accent-color: #ef4444;">
                    <label for="b_popup" style="font-size: 0.75rem; font-weight: 850; color: #ef4444;">POPUP MODE</label>
                </div>
            </div>
 
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 1.5rem; padding: 1rem; background: #f8fafc; border-radius: 14px;">
                <input type="checkbox" name="is_active" id="b_active" checked style="width: 18px; height: 18px;">
                <label for="b_active" style="font-size: 0.85rem; font-weight: 850; color: #1e293b;">SET AS PROMOTED (LIVE)</label>
            </div>
 
            <button type="submit" class="btn btn-primary" id="b_btn" style="width: 100%; border: none; background: #1e293b; color: white; padding: 1rem; border-radius: 14px; font-weight: 900; font-size: 0.9rem;">Save Poster</button>
        </form>
    </div>
</div>

<!-- STEP 2 MODAL: COUPON CONFIG -->
<div id="couponModal" class="modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.65); z-index: 10000; align-items: flex-start; justify-content: center; overflow-y: auto; padding: 2rem 1rem; backdrop-filter: blur(8px);">
    <div class="card" style="width: 95%; max-width: 420px; border-radius: 24px; padding: 2rem; position: relative; margin: 2rem auto;">
        <button onclick="closeCouponModal()" style="position: absolute; top: 1.5rem; right: 1.5rem; background: #f1f5f9; border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer;">&times;</button>
        <h3 id="c_modalTitle" style="margin-top: 0; margin-bottom: 1.5rem; font-weight: 950; font-size: 1.5rem;">Add Discount Coupon</h3>

        <form action="" method="POST">
            <input type="hidden" name="action" value="add_or_update_coupon"><input type="hidden" name="id" id="c_id">
            
            <div style="margin-bottom: 1rem;">
                <label style="font-size: 0.65rem; font-weight: 950; color: #94a3b8; text-transform: uppercase;">Campaign Title</label>
                <input type="text" name="title" id="c_title" class="form-control" required style="height: 44px; border-radius: 12px; font-size: 0.85rem;" placeholder="e.g. Summer Special">
            </div>

            <div style="margin-bottom: 1rem;">
                <label style="font-size: 0.65rem; font-weight: 950; color: #94a3b8; text-transform: uppercase;">Discount Code</label>
                <input type="text" name="code" id="c_code" class="form-control" required style="text-transform: uppercase; font-weight: 950; height: 44px; border-radius: 12px; font-size: 0.85rem;" placeholder="SAVE20">
            </div>

            <div class="grid-2col">
                <div>
                    <label style="font-size: 0.65rem; font-weight: 950; color: #94a3b8; text-transform: uppercase;">Discount Type</label>
                    <select name="discount_type" id="c_type" class="form-control" style="height: 44px; border-radius: 12px; font-size: 0.85rem;">
                        <option value="percentage">Percentage (%) [Per KM]</option>
                        <option value="flat">Fixed (₹) [Total Fare]</option>
                    </select>
                </div>
                <div>
                    <label style="font-size: 0.65rem; font-weight: 950; color: #94a3b8; text-transform: uppercase;">Discount Value</label>
                    <input type="number" step="0.01" name="discount_value" id="c_value" required class="form-control" style="height: 44px; border-radius: 12px; font-size: 0.85rem;" placeholder="10">
                </div>
            </div>

            <div class="grid-2col">
                <div>
                    <label style="font-size: 0.65rem; font-weight: 950; color: #94a3b8; text-transform: uppercase;">Applicable Service</label>
                    <select name="apply_to_trip_type" id="c_apply_to_trip_type" class="form-control" style="height: 44px; border-radius: 12px; font-size: 0.85rem;">
                        <option value="all">All Trips</option>
                        <option value="one_way">One-Way Drop</option>
                        <option value="round_trip">Round Trip</option>
                        <option value="hourly_rental">Hourly Rental</option>
                    </select>
                </div>
                <div>
                    <label style="font-size: 0.65rem; font-weight: 950; color: #94a3b8; text-transform: uppercase;">Min Booking Value (₹)</label>
                    <input type="number" step="0.01" name="min_booking_amount" id="c_min_booking_amount" class="form-control" style="height: 44px; border-radius: 12px; font-size: 0.85rem;" placeholder="e.g. 0.00">
                </div>
            </div>

            <div style="margin-bottom: 1.5rem;">
                <label style="font-size: 0.65rem; font-weight: 950; color: #94a3b8; text-transform: uppercase;">Expiry Date</label>
                <input type="date" name="expiry_date" id="c_expiry" class="form-control" required style="height: 44px; border-radius: 12px; font-size: 0.85rem;">
            </div>

            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 1.5rem; padding: 1rem; background: #f8fafc; border-radius: 14px;">
                <input type="checkbox" name="is_active" id="c_active" checked style="width: 18px; height: 18px;">
                <label for="c_active" style="font-size: 0.85rem; font-weight: 850; color: #1e293b;">Active Coupon</label>
            </div>

            <button type="submit" class="btn btn-primary" id="c_btn" style="width: 100%; border: none; background: #f7b733; color: #1e293b; padding: 1rem; border-radius: 14px; font-weight: 900; font-size: 0.9rem;">Save Coupon</button>
        </form>
    </div>
</div>

<script>
function switchMainTab(tabId, btn) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + tabId).classList.add('active');
    btn.classList.add('active');
    try { localStorage.setItem('dropcars_promo_tab', tabId); } catch (_) {}
}
window.addEventListener('load', () => {
    let last = 'banners';
    try { last = localStorage.getItem('dropcars_promo_tab') || 'banners'; } catch (_) {}
    if (window.location.hash === '#festival' || window.location.search.includes('tab=festival')) {
        last = 'festival';
    }
    const btn = document.querySelector(`.nav-btn[data-tab="${last}"]`) || document.querySelector(`.nav-btn.${last}`) || document.querySelector(`.nav-btn`);
    if (btn) btn.click();
});
function updateAssetPreview(u) {
    const box = document.getElementById('b_preview');
    if (u.length < 5) { box.innerHTML = 'PREVIEW'; return; }
    const f = u.startsWith('assets/') ? '../../' + u : u;
    box.innerHTML = `<img src="${f}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='INVALID PATH'">`;
}
function previewUpload(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = e => {
            document.getElementById('b_preview').innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;">`;
            document.getElementById('b_upload_text').innerHTML = `<span style="color:#22c55e;font-size:0.75rem;"><i class="fa fa-check"></i> ${input.files[0].name}</span>`;
        };
        reader.readAsDataURL(input.files[0]);
    }
}
function openBannerModal() {
    document.getElementById('bannerModal').style.display = 'flex';
    document.getElementById('b_modalTitle').innerText = 'Add Promotional Poster';
    document.getElementById('b_id').value = '';
    document.getElementById('b_content').value = '';
    document.getElementById('b_link').value = '';
    document.getElementById('b_coupon').value = '';
    document.getElementById('b_popup').checked = false;
    document.getElementById('b_active').checked = true;
    document.getElementById('b_preview').innerHTML = 'PREVIEW';
    document.getElementById('b_btn').innerText = 'Save Poster';
}
function closeBannerModal() { document.getElementById('bannerModal').style.display = 'none'; }
function shareOnWhatsApp(c, d) {
    const origin = window.location.origin;
    const m = `🌟 *DROP CARS* 🌟\n` +
              `_Exclusive Travel Offer_\n\n` +
              `Get *${d} OFF* on your next premium intercity ride with Drop Cars!\n\n` +
              `━━━━━━━━━━━━━━━━━━━\n` +
              `🎁 *PROMO DETAILS*\n` +
              `━━━━━━━━━━━━━━━━━━━\n` +
              `🎟️ *Coupon Code:* *${c}*\n` +
              `💰 *Benefit:* *${d} Discount*\n\n` +
              `━━━━━━━━━━━━━━━━━━━\n` +
              `🚀 *HOW TO REDEEM*\n` +
              `━━━━━━━━━━━━━━━━━━━\n` +
              `Tap the link below to automatically apply the coupon and estimate your fare:\n` +
              `👉 ${origin}/?coupon=${c}\n\n` +
              `*Drop Cars* - Clean cars, professional chauffeurs, transparent pricing. Have a wonderful trip!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(m)}`, '_blank');
}
function openCouponModal() {
    document.getElementById('couponModal').style.display = 'flex';
    document.getElementById('c_modalTitle').innerText = 'Add Discount Coupon';
    document.getElementById('c_id').value = '';
    document.getElementById('c_title').value = '';
    document.getElementById('c_code').value = '';
    document.getElementById('c_value').value = '';
    document.getElementById('c_apply_to_trip_type').value = 'all';
    document.getElementById('c_min_booking_amount').value = '';
    document.getElementById('c_expiry').value = '';
    document.getElementById('c_active').checked = true;
    document.getElementById('c_btn').innerText = 'Save Coupon';
}
function closeCouponModal() { document.getElementById('couponModal').style.display = 'none'; }
function editBanner(d) {
    openBannerModal();
    document.getElementById('b_modalTitle').innerText = 'Edit Promotional Poster';
    document.getElementById('b_id').value = d.id;
    document.getElementById('b_content').value = d.content;
    document.getElementById('b_link').value = d.link_url || '';
    document.getElementById('b_coupon').value = d.coupon_code || '';
    document.getElementById('b_popup').checked = d.is_popup == 1;
    document.getElementById('b_active').checked = d.is_active == 1;
    updateAssetPreview(d.content);
    document.getElementById('b_btn').innerText = 'Save Changes';
}
function editCoupon(d) {
    openCouponModal();
    document.getElementById('c_modalTitle').innerText = 'Edit Discount Coupon';
    document.getElementById('c_id').value = d.id;
    document.getElementById('c_title').value = d.title;
    document.getElementById('c_code').value = d.code;
    document.getElementById('c_type').value = d.discount_type;
    document.getElementById('c_value').value = d.discount_value;
    document.getElementById('c_apply_to_trip_type').value = d.apply_to_trip_type || 'all';
    document.getElementById('c_min_booking_amount').value = d.min_booking_amount || '';
    document.getElementById('c_expiry').value = d.expiry_date;
    document.getElementById('c_active').checked = d.is_active == 1;
    document.getElementById('c_btn').innerText = 'Save Changes';
}
window.addEventListener('keydown', e => { if (e.key === 'Escape') { closeBannerModal(); closeCouponModal(); } });
</script>
