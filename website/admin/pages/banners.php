<?php
/**
 * Admin Banner System Management Page - Premium UX
 */

$alertMsg = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    if ($action == 'add_or_update') {
        $id = $_POST['id'] ?? null;
        $type = $_POST['type'] ?? 'image';
        $content = $_POST['content'] ?? '';
        $linkUrl = $_POST['link_url'] ?? '';
        $couponCode = strtoupper($_POST['coupon_code'] ?? '');
        $isPopup = isset($_POST['is_popup']) ? 1 : 0;
        $isActive = isset($_POST['is_active']) ? 1 : 0;

        if ($id) {
            $stmt = $pdo->prepare("UPDATE `banners` SET `type` = ?, `content` = ?, `link_url` = ?, `coupon_code` = ?, `is_popup` = ?, `is_active` = ? WHERE `id` = ?");
            $stmt->execute([$type, $content, $linkUrl, $couponCode, $isPopup, $isActive, $id]);
            $alertMsg = "Visual asset '{$type}' updated successfully.";
        } else {
            $stmt = $pdo->prepare("INSERT INTO `banners` (`type`, `content`, `link_url`, `coupon_code`, `is_popup`, `is_active`) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->execute([$type, $content, $linkUrl, $couponCode, $isPopup, $isActive]);
            $alertMsg = "New marketing banner is now live on the storefront.";
        }
    } elseif ($action == 'delete') {
        $id = (int)($_POST['id'] ?? 0);
        $pdo->prepare("DELETE FROM `banners` WHERE `id` = ?")->execute([$id]);
        $alertMsg = "Marketing asset purged from system.";
    }
}

$banners = $pdo->query("SELECT * FROM `banners` ORDER BY `created_at` DESC")->fetchAll();
$settingsFile = __DIR__ . '/../config/settings.json';
$siteSettings = file_exists($settingsFile) ? json_decode(file_get_contents($settingsFile), true) : ['show_offers_section' => true];

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'toggle_offers') {
    $siteSettings['show_offers_section'] = (int)($_POST['show_offers_section'] ?? 0) === 1;
    file_put_contents($settingsFile, json_encode($siteSettings, JSON_PRETTY_PRINT));
    $alertMsg = "Offers Section visibility updated.";
}
?>

<div class="page-header" style="margin-bottom: 1rem; background: #fff; padding: 0.75rem 1rem; border-radius: 14px; border: 1px solid #f1f5f9; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem;">
        <div style="display: flex; align-items: center; gap: 0.65rem;">
            <div style="width: 36px; height: 36px; flex-shrink: 0; background: #fff7ed; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #ea580c;">
                <i class="fa-solid fa-rectangle-ad" style="font-size: 1rem;"></i>
            </div>
            <div>
                <h1 style="font-size: 1.2rem; font-weight: 800; color: #1e293b; margin: 0;">Offer Banner System</h1>
                <p style="margin: 0; font-size: 0.75rem; color: #94a3b8;">Manage site-wide promotional visuals and announcement bars</p>
            </div>
        </div>
        <button type="button" class="btn btn-primary" onclick="openBannerModal()" style="height: 34px; padding: 0 0.85rem; font-size: 0.82rem; display: flex; align-items: center; gap: 0.4rem;"><i class="fa fa-plus"></i> New Banner</button>
    </div>
</div>

<!-- Global Feature Toggles -->
<form method="POST" class="card" style="margin-bottom: 2rem; padding: 1.5rem; border: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; border-left: 4px solid var(--primary-color);">
    <input type="hidden" name="action" value="toggle_offers">
    <div>
        <h2 style="margin: 0; font-size: 1.1rem; font-weight: 700;">Global Feature: Homepage Offers Section</h2>
        <p style="margin: 0.25rem 0 0; color: #666; font-size: 0.85rem;">Instantly display or hide the massive "Exclusive Referral & Offers" block on your public landing page.</p>
    </div>
    <div style="display: flex; align-items: center; gap: 0.5rem;">
        <select name="show_offers_section" class="form-control" style="width: auto; font-weight: 600;" onchange="this.form.submit()">
             <option value="1" <?php echo !empty($siteSettings['show_offers_section']) ? 'selected' : ''; ?>>🟢 Enabled (Visible)</option>
             <option value="0" <?php echo empty($siteSettings['show_offers_section']) ? 'selected' : ''; ?>>🔴 Disabled (Hidden)</option>
        </select>
    </div>
</form>

<?php if ($alertMsg): ?>
    <div class="alert alert-success" style="margin-bottom: 2rem; border-radius: 12px;">
        <i class="fa-solid fa-image"></i> <?php echo $alertMsg; ?>
    </div>
<?php endif; ?>

<div class="card" style="padding: 0; border: 1px solid #eee;">
    <div class="table-responsive">
        <table class="custom-table">
            <thead>
                <tr>
                    <th style="padding-left: 1.5rem;">Visual Content / Message</th>
                    <th>Asset Type</th>
                    <th>Engagement Status</th>
                    <th>Deployment Date</th>
                    <th style="text-align: right; padding-right: 1.5rem;">Actions</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($banners as $banner): ?>
                    <tr>
                        <td style="padding-left: 1.5rem;">
                            <?php if ($banner['type'] == 'image'): ?>
                                <div style="display: flex; align-items: center; gap: 1rem;">
                                    <div style="width: 120px; height: 64px; background: #f0f2f5; border-radius: 8px; overflow: hidden; border: 1px solid #ddd;">
                                        <img src="<?php echo $banner['content']; ?>" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='https://placehold.co/600x400?text=Invalid+Path'">
                                    </div>
                                    <div style="font-size: 0.7rem; color: #888; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                        URL: <?php echo $banner['content']; ?>
                                    </div>
                                </div>
                            <?php else: ?>
                                <div style="background: #2c3e50; color: white; padding: 1.5rem; border-radius: 12px; font-size: 0.9rem; font-weight: 500; box-shadow: inset 0 2px 10px rgba(0,0,0,0.1);">
                                    <i class="fa-solid fa-bullhorn" style="margin-right: 0.75rem; color: var(--primary-color);"></i>
                                    <?php echo htmlspecialchars($banner['content']); ?>
                                </div>
                            <?php endif; ?>
                        </td>
                        <td data-label="Type">
                             <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <div style="width: 24px; height: 24px; background: #eef2ff; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #4338ca; font-size: 0.75rem;">
                                    <?php echo $banner['type'] == 'image' ? '<i class="fa-solid fa-image"></i>' : '<i class="fa-solid fa-font"></i>'; ?>
                                </div>
                                <span style="font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: #666;"><?php echo $banner['type']; ?></span>
                             </div>
                             <?php if ($banner['is_popup']): ?>
                                <span style="display: block; font-size: 0.6rem; color: #db2777; font-weight: 900; margin-top: 4px; text-transform: uppercase;"><i class="fa-solid fa-bolt"></i> Home Popup</span>
                             <?php endif; ?>
                             <?php if (!empty($banner['coupon_code'])): ?>
                                <span style="display: block; font-size: 0.6rem; color: #16a34a; font-weight: 900; margin-top: 4px; text-transform: uppercase;"><i class="fa-solid fa-ticket"></i> <?php echo $banner['coupon_code']; ?></span>
                             <?php endif; ?>
                        </td>
                        <td data-label="Status">
                            <?php if ($banner['is_active']): ?>
                                <span class="badge bg-success" style="font-size: 0.65rem; padding: 4px 10px;">ACTIVE ON SITE</span>
                            <?php else: ?>
                                <span class="badge bg-secondary" style="font-size: 0.65rem; padding: 4px 10px;">STAGED / INACTIVE</span>
                            <?php endif; ?>
                        </td>
                        <td data-label="Date">
                            <span style="font-size: 0.85rem; color: #666;"><?php echo date('d M Y', strtotime($banner['created_at'])); ?></span>
                        </td>
                        <td data-label="Actions" style="text-align: right; padding-right: 1.5rem;">
                             <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                                <button class="btn-action" onclick='editBanner(<?php echo json_encode($banner); ?>)' style="width: 32px; height: 32px; padding: 0;">
                                    <i class="fa fa-pen-to-square" style="font-size: 0.85rem; color: #444;"></i>
                                </button>
                                <form action="banners" method="POST" onsubmit="return confirm('Purge this asset from the front-end?')">
                                    <input type="hidden" name="action" value="delete">
                                    <input type="hidden" name="id" value="<?php echo $banner['id']; ?>">
                                    <button type="submit" class="btn-action" style="width: 32px; height: 32px; padding: 0; background: #fff5f5;">
                                        <i class="fa fa-trash-alt" style="font-size: 0.85rem; color: #dc3545;"></i>
                                    </button>
                                </form>
                            </div>
                        </td>
                    </tr>
                <?php endforeach; ?>
                <?php if (empty($banners)): ?>
                    <tr>
                        <td colspan="5" style="text-align: center; padding: 6rem 2rem;">
                            <i class="fa-solid fa-panorama" style="font-size: 4rem; color: #eee; margin-bottom: 1.5rem; display: block;"></i>
                            <span style="color: #999; font-weight: 600;">Merchandising area is clear. No active banners.</span>
                        </td>
                    </tr>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>

<!-- Banner Modal -->
<div id="bannerModal" class="modal" style="display: none; position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.4); z-index:2000; align-items:center; justify-content:center; backdrop-filter: blur(4px);">
    <div class="card" style="width: 100%; max-width: 480px; box-shadow: 0 20px 40px rgba(0,0,0,0.15);">
       <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
            <h3 id="b_modalTitle" style="margin: 0; font-weight: 800; font-size: 1.25rem;">Deploy Marketing Asset</h3>
            <button type="button" onclick="closeBannerModal()" style="background: none; border: none; font-size: 1.25rem; color: #999; cursor: pointer;">&times;</button>
        </div>
        <form action="banners" method="POST">
            <input type="hidden" name="action" value="add_or_update">
            <input type="hidden" name="id" id="b_id">
            <div class="form-group">
                <label class="form-label" style="font-size: 0.85rem;">Display Logic Type</label>
                <select name="type" id="b_type" class="form-control" onchange="toggleContentLabel()">
                    <option value="text">Announcement Strip (Text Based)</option>
                    <option value="image">Hero / Side Banner (Image Point)</option>
                </select>
            </div>
            <div class="form-group">
                <label id="contentLabel" class="form-label" style="font-size: 0.85rem;">Banner Component Payload</label>
                <textarea name="content" id="b_content" class="form-control" style="height: 80px;" placeholder="Message string or absolute image URL..." required></textarea>
            </div>
            <div class="form-group">
                <label class="form-label" style="font-size: 0.85rem;">Target Link URL (Optional)</label>
                <input type="text" name="link_url" id="b_link" class="form-control" placeholder="https://www.dropcars.in/...">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="form-group">
                    <label class="form-label" style="font-size: 0.85rem;">Auto-Apply Coupon</label>
                    <input type="text" name="coupon_code" id="b_coupon" class="form-control" placeholder="CODE20">
                </div>
                <div class="form-group" style="display: flex; align-items: flex-end; padding-bottom: 0.5rem;">
                    <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.85rem; font-weight: 600;">
                        <input type="checkbox" name="is_popup" id="b_popup" style="width: 16px; height: 16px;">
                        Set as Home Popup
                    </label>
                </div>
            </div>
            <div class="form-group" style="margin-top: 1rem; display: flex; align-items: center; gap: 0.5rem; background: #f8f9fa; padding: 0.75rem; border-radius: 8px;">
                <input type="checkbox" name="is_active" id="b_active" checked style="width: 18px; height: 18px;">
                <label for="b_active" style="font-size: 0.9rem; font-weight: 600; cursor: pointer;">Enable and publish to storefront</label>
            </div>
            <div style="margin-top: 2rem; display: flex; gap: 1rem;">
                <button type="submit" class="btn btn-primary" id="b_modalBtn" style="flex: 1;">Save Visual Asset</button>
                <button type="button" class="btn btn-secondary" onclick="closeBannerModal()">Discard</button>
            </div>
        </form>
    </div>
</div>

<script>
function toggleContentLabel() {
    const type = document.getElementById('b_type').value;
    document.getElementById('contentLabel').innerText = (type === 'image') ? 'Absolute Image URL (HTTPS)' : 'Banner Message Content';
}
function openBannerModal() {
    document.getElementById('bannerModal').style.display = 'flex';
    document.getElementById('b_modalTitle').innerText = 'Stage Marketing Asset';
    document.getElementById('b_id').value = '';
    document.getElementById('b_type').value = 'text';
    document.getElementById('b_content').value = '';
    document.getElementById('b_link').value = '';
    document.getElementById('b_coupon').value = '';
    document.getElementById('b_popup').checked = false;
    document.getElementById('b_active').checked = true;
    toggleContentLabel();
    document.getElementById('b_modalBtn').innerText = 'Add Banner';
}
function closeBannerModal() {
    document.getElementById('bannerModal').style.display = 'none';
}
function editBanner(data) {
    openBannerModal();
    document.getElementById('b_modalTitle').innerText = 'Modify Visual Asset';
    document.getElementById('b_id').value = data.id;
    document.getElementById('b_type').value = data.type;
    document.getElementById('b_content').value = data.content;
    document.getElementById('b_link').value = data.link_url || '';
    document.getElementById('b_coupon').value = data.coupon_code || '';
    document.getElementById('b_popup').checked = data.is_popup == 1;
    document.getElementById('b_active').checked = data.is_active == 1;
    toggleContentLabel();
    document.getElementById('b_modalBtn').innerText = 'Save Asset Changes';
}
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeBannerModal(); });
</script>
