<?php
$config = require __DIR__ . '/config/config.php';
require_once __DIR__ . '/config/database.php';

if (session_status() === PHP_SESSION_NONE) {
    session_name($config['sessionName'] ?? 'dropcars_admin_session');
    session_start();
}

if (empty($_SESSION['admin_id'])) {
    header('Location: index.php?login=required');
    exit;
}

$baseUrl = rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? ''), '/') . '/';
if ($baseUrl === '//') $baseUrl = '/admin/';

$pageTitle = 'Customer Reviews';
$currentPage = 'reviews';

// Ensure reviews table exists
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS reviews (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        customer_name VARCHAR(255) NOT NULL,
        customer_phone VARCHAR(50) NOT NULL,
        rating TINYINT UNSIGNED NOT NULL DEFAULT 5,
        comment TEXT NOT NULL,
        trip_route VARCHAR(255) DEFAULT NULL,
        is_verified TINYINT(1) DEFAULT 1,
        is_approved TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_approved (is_approved),
        INDEX idx_created (created_at)
    )");
} catch (PDOException $e) {
    // Table may already exist
}

$flash = $_SESSION['reviews_flash'] ?? '';
unset($_SESSION['reviews_flash']);

$perPage = 25;
$page = max(1, (int)($_GET['page'] ?? 1));
$offset = ($page - 1) * $perPage;

$total = (int)$pdo->query("SELECT COUNT(*) FROM reviews")->fetchColumn();
$totalPages = max(1, (int)ceil($total / $perPage));

$stmt = $pdo->query("SELECT id, customer_name, customer_phone, rating, comment, trip_route, is_verified, is_approved, created_at FROM reviews ORDER BY created_at DESC LIMIT {$perPage} OFFSET {$offset}");
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

require __DIR__ . '/includes/header.php';
?>

<?php if ($flash): ?>
<p class="flash flash-success"><?= htmlspecialchars($flash) ?></p>
<?php endif; ?>

<section class="section">
    <p class="section-desc">Manage customer reviews. Edit or remove reviews from the website.</p>
    <?php if (empty($rows)): ?>
    <p class="no-data">No reviews yet.</p>
    <?php else: ?>
    <div class="table-wrap">
        <table class="data-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Rating</th>
                    <th>Comment</th>
                    <th>Trip</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($rows as $r): ?>
                <tr data-id="<?= (int)$r['id'] ?>">
                    <td><?= (int)$r['id'] ?></td>
                    <td><?= htmlspecialchars($r['customer_name'] ?? '') ?></td>
                    <td><?= htmlspecialchars($r['customer_phone'] ?? '') ?></td>
                    <td><?= htmlspecialchars($r['rating'] ?? 5) ?> ★</td>
                    <td class="comment-cell"><?= htmlspecialchars(mb_substr($r['comment'] ?? '', 0, 80)) ?><?= mb_strlen($r['comment'] ?? '') > 80 ? '…' : '' ?></td>
                    <td><?= htmlspecialchars($r['trip_route'] ?? '-') ?></td>
                    <td>
                        <span class="status status-<?= !empty($r['is_approved']) ? 'approved' : 'hidden' ?>">
                            <?= !empty($r['is_approved']) ? '✓ Visible' : 'Hidden' ?>
                        </span>
                    </td>
                    <td><?= htmlspecialchars(date('M j, H:i', strtotime($r['created_at'] ?? ''))) ?></td>
                    <td class="actions">
                        <button type="button" class="btn-sm btn-edit" data-id="<?= (int)$r['id'] ?>" data-name="<?= htmlspecialchars($r['customer_name'] ?? '', ENT_QUOTES, 'UTF-8') ?>" data-phone="<?= htmlspecialchars($r['customer_phone'] ?? '', ENT_QUOTES, 'UTF-8') ?>" data-rating="<?= (int)($r['rating'] ?? 5) ?>" data-comment="<?= htmlspecialchars($r['comment'] ?? '', ENT_QUOTES, 'UTF-8') ?>" data-trip="<?= htmlspecialchars($r['trip_route'] ?? '', ENT_QUOTES, 'UTF-8') ?>" data-approved="<?= (int)($r['is_approved'] ?? 1) ?>">Edit</button>
                        <button type="button" class="btn-sm btn-red btn-delete" data-id="<?= (int)$r['id'] ?>">Remove</button>
                    </td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>

    <?php if ($totalPages > 1): ?>
    <nav class="pagination">
        <?php if ($page > 1): ?>
        <a href="?<?= http_build_query(array_merge($_GET, ['page' => $page - 1])) ?>">&larr; Prev</a>
        <?php endif; ?>
        <span>Page <?= $page ?> of <?= $totalPages ?></span>
        <?php if ($page < $totalPages): ?>
        <a href="?<?= http_build_query(array_merge($_GET, ['page' => $page + 1])) ?>">Next &rarr;</a>
        <?php endif; ?>
    </nav>
    <?php endif; ?>
    <?php endif; ?>
</section>

<!-- Edit Modal -->
<div id="edit-modal" class="modal" style="display:none;">
    <div class="modal-content">
        <h3>Edit Review</h3>
        <form id="edit-review-form" method="post" action="actions/review-update.php">
            <input type="hidden" name="id" id="edit-id">
            <label>
                <span>Name</span>
                <input type="text" name="customer_name" id="edit-name" required>
            </label>
            <label>
                <span>Phone</span>
                <input type="text" name="customer_phone" id="edit-phone" required>
            </label>
            <label>
                <span>Rating (1-5)</span>
                <input type="number" name="rating" id="edit-rating" min="1" max="5" required>
            </label>
            <label>
                <span>Comment</span>
                <textarea name="comment" id="edit-comment" rows="4" required></textarea>
            </label>
            <label>
                <span>Trip Route</span>
                <input type="text" name="trip_route" id="edit-trip" placeholder="e.g. Chennai to Bangalore">
            </label>
            <label>
                <input type="checkbox" name="is_approved" id="edit-approved" value="1">
                <span>Visible on website</span>
            </label>
            <div class="modal-actions">
                <button type="button" class="btn-outline" id="edit-cancel">Cancel</button>
                <button type="submit" class="btn-primary">Save Changes</button>
            </div>
        </form>
    </div>
</div>

<script>
(function() {
  var modal = document.getElementById('edit-modal');
  var form = document.getElementById('edit-review-form');
  var cancelBtn = document.getElementById('edit-cancel');

  document.querySelectorAll('.btn-edit').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.getElementById('edit-id').value = btn.dataset.id;
      document.getElementById('edit-name').value = btn.dataset.name || '';
      document.getElementById('edit-phone').value = btn.dataset.phone || '';
      document.getElementById('edit-rating').value = btn.dataset.rating || '5';
      document.getElementById('edit-comment').value = btn.dataset.comment || '';
      document.getElementById('edit-trip').value = btn.dataset.trip || '';
      document.getElementById('edit-approved').checked = btn.dataset.approved === '1';
      modal.style.display = 'flex';
    });
  });

  document.querySelectorAll('.btn-delete').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (!confirm('Remove this review?')) return;
      var id = btn.dataset.id;
      fetch('actions/review-delete.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: parseInt(id, 10) })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.success) location.reload();
        else alert(data.message || 'Failed to remove');
      });
    });
  });

  if (cancelBtn) cancelBtn.addEventListener('click', function() {
    modal.style.display = 'none';
  });
  if (modal) modal.addEventListener('click', function(e) {
    if (e.target === modal) modal.style.display = 'none';
  });
})();
</script>

<?php require __DIR__ . '/includes/footer.php'; ?>
