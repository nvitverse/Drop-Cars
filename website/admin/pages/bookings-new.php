<?php
/**
 * Admin New Booking â€“ same client flow as the public site (instant fare â†’ confirm via /api/confirm_booking.php).
 */
require_once __DIR__ . '/../../includes/paths.php';

$envFile = __DIR__ . '/../../config/env.php';
if (is_file($envFile) && !defined('GOOGLE_MAPS_API_KEY')) {
    require_once $envFile;
}
$mapsKey = '';
if (defined('GOOGLE_MAPS_API_KEY') && (string) GOOGLE_MAPS_API_KEY !== '') {
    $mapsKey = (string) GOOGLE_MAPS_API_KEY;
} else {
    $fromEnv = getenv('GOOGLE_MAPS_API_KEY');
    if ($fromEnv !== false && $fromEnv !== '') {
        $mapsKey = (string) $fromEnv;
    }
}
$mapsKeyUrl = rawurlencode($mapsKey);

$distanceCacheFile = __DIR__ . '/../../data/distance_cache.json';
$distanceCache = is_file($distanceCacheFile) ? file_get_contents($distanceCacheFile) : '{}';

$configFile = __DIR__ . '/../../data/config.json';
$configData = is_file($configFile) ? file_get_contents($configFile) : '{}';

$adminRedirect = admin_url('bookings', ['msg' => 'created']);
$s = static function (string $path): string {
    return htmlspecialchars(dropcars_url($path), ENT_QUOTES, 'UTF-8');
};
?>

<div class="page-header page-header--subpage">
    <div>
        <a href="bookings" class="page-header-back" title="Back to bookings" aria-label="Back to bookings">
            <i class="fa fa-arrow-left" aria-hidden="true"></i>
        </a>
        <div>
            <h1>New Booking Entry</h1>
            <p>Phone and offline bookings &mdash; use the same fare and validation as the website.</p>
        </div>
    </div>
</div>

<?php if ($mapsKey === ''): ?>
    <div class="alert alert-warning" style="margin-bottom: 1.5rem; border-radius: 12px; max-width: 960px;">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <strong>Google Maps API key missing.</strong> Set <code>GOOGLE_MAPS_API_KEY</code> in <code>config/env.php</code> (or environment) so distances and fares match the live booking form.
    </div>
<?php endif; ?>

<div class="card admin-new-booking-card" style="max-width: 720px; margin: 0 auto; border: 1px solid #e2e8f0; background: #fff; padding: 1.25rem; border-radius: 16px; box-shadow: 0 4px 20px rgba(15,23,42,0.04);">
    <?php require __DIR__ . '/../../includes/admin-booking-form-markup.php'; ?>
</div>

<style>
  /* â”€â”€ Layout fixes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  .main-content { overflow: visible !important; }
  .card { overflow: visible !important; position: relative !important; }
  .main-content .admin-booking-flow .sticky-submit-wrapper { display: none !important; }
  html, body { height: auto !important; overflow: visible !important; min-height: 100vh; }

  /* Google Maps autocomplete dropdown */
  .pac-container {
    z-index: 99999 !important; background-color: #fff !important;
    border-radius: 12px !important; border: 1px solid #e2e8f0 !important;
    box-shadow: 0 10px 15px -3px rgba(0,0,0,.1) !important;
    margin-top: 4px !important; font-family: inherit !important;
  }
  .pac-item { padding: 8px 12px !important; font-size: 14px !important; cursor: pointer !important; }
  .pac-item:hover { background-color: #f8fafc !important; }

  /* â”€â”€ Admin Palette Token Override â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  /* Map admin gold/navy onto the CSS variables the booking-form CSS uses */
  .admin-booking-flow {
    --blue:        #0f172a;    /* admin --secondary-color */
    --blue-dark:   #0f172a;
    --blue-light:  #1e293b;
    --accent:      #f7b733;    /* admin primary gold */
    --accent-glow: rgba(247,183,51,0.35);
    --accent-gradient: linear-gradient(135deg, #f7b733 0%, #f59e0b 100%);
    --gray-100:    #f1f5f9;
    --gray-200:    #e2e8f0;
    --gray-300:    #cbd5e1;
    --gray-400:    #94a3b8;
  }

  /* â”€â”€ Booking card wrapper â€“ matches the public booking-card layout
        but with an amber left-accent to differentiate the admin context â”€â”€ */
  .admin-booking-flow.booking-card {
    background: #ffffff;
    border: 1px solid #fde68a;
    border-left: 4px solid #f7b733;       /* amber accent rail */
    border-radius: 18px;
    padding: 1.25rem;
    box-shadow: 0 8px 24px rgba(247, 183, 51, 0.08), 0 2px 6px rgba(15, 23, 42, 0.04);
    overflow: hidden;
    position: relative;
  }
  .admin-booking-flow .booking-card__header h2 {
    font-size: 1.05rem;
    color: #0f172a;
    font-weight: 800;
    margin: 0;
    line-height: 1.25;
  }
  /* Shrink the "+91" country-code prefix and the input padding so the
     full 10-digit phone number is visible on narrow phones. */
  .admin-booking-flow .country-code-field {
    width: 36px !important;
    min-width: 36px !important;
    max-width: 36px !important;
  }
  .admin-booking-flow .country-code-trigger {
    font-size: 10.5px !important;
    padding: 0 2px !important;
    font-weight: 600 !important;
  }
  .admin-booking-flow .phone-national-input {
    flex: 1 1 0% !important;
    min-width: 0 !important;
    padding: 0 0.4rem !important;
    font-size: 0.82rem !important;
    letter-spacing: 0 !important;
  }
  .admin-booking-flow .phone-input-wrapper {
    overflow: hidden !important;
  }

  /* Stop the WhatsApp icon+checkbox from overlapping the "Phone Number *"
     label on narrow viewports â€” but keep them BESIDE the label on the same
     row. Trick: let the label text itself word-wrap to 2 lines while the
     WA cluster stays right-anchored and never shrinks.
        Wide:    "Phone Number *"        [WA â˜‘]
        Narrow:  "Phone Number *"        [WA â˜‘]   (or wrap)
        Tiniest: "Phone\nNumber *"       [WA â˜‘] */
  .admin-booking-flow .field__label-row {
    flex-wrap: nowrap !important;
    align-items: center !important;
    column-gap: 0.4rem !important;
  }
  .admin-booking-flow .field__label-row > span:first-child {
    flex: 1 1 0% !important;
    min-width: 0 !important;
    overflow-wrap: break-word !important;
    word-break: keep-all !important;
    white-space: normal !important;
    line-height: 1.15 !important;
  }
  .admin-booking-flow .field__label-row .wa-check-label {
    flex-shrink: 0 !important;
  }
  @media (max-width: 380px) {
    /* On the tiniest phones, drop only the decorative WhatsApp SVG so the
       checkbox alone stays beside the wrapped label and nothing overlaps. */
    .admin-booking-flow .field__label-row .wa-label-icon { display: none !important; }
  }

  /* Phone: shrink everything proportionally â€” mirror the public form's density */
  @media (max-width: 800px) {
    .admin-new-booking-card {
      padding: 0.55rem !important;
      border-radius: 14px !important;
    }
    .admin-booking-flow.booking-card {
      padding: 0.85rem !important;
      border-radius: 14px !important;
    }
    .admin-booking-flow .booking-card__header { margin-bottom: 0.6rem !important; }
    .admin-booking-flow .booking-card__header h2 { font-size: 0.95rem !important; }
    .admin-booking-flow .field { margin-bottom: 0.55rem !important; }
    .admin-booking-flow .field input,
    .admin-booking-flow .field select { padding: 0.55rem 0.7rem !important; font-size: 0.88rem !important; }
    .admin-booking-flow .field > span { font-size: 0.75rem !important; }
    .admin-booking-flow .trip-type-options { padding: 3px !important; }
    .admin-booking-flow .trip-type-option { font-size: 0.72rem !important; padding: 6px 8px !important; }
    .admin-booking-flow .field-pair { gap: 0.55rem !important; }
  }

  /* â”€â”€ Input fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  .admin-booking-flow .field input:focus,
  .admin-booking-flow .field select:focus {
    border-color: #f7b733;
    box-shadow: 0 0 0 3px rgba(247, 183, 51, 0.2);
  }

  /* â”€â”€ Trip-type pills â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  .admin-booking-flow .trip-type-options {
    background: #f1f5f9;
    border: 1px solid #e2e8f0;
    backdrop-filter: none;
  }
  .admin-booking-flow .trip-type-options .trip-type-option.trip-type-option--active,
  .admin-booking-flow .trip-type-options .trip-type-option.active {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    border-color: #0f172a;
    color: #f7b733;
    box-shadow: 0 4px 10px rgba(15,23,42,.18);
  }
  .admin-booking-flow .oneway-subtypes { background: #f8fafc; border: 1px solid #e2e8f0; }
  .admin-booking-flow .oneway-subtypes input:checked + label,
  .admin-booking-flow .oneway-subtypes label.active {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    color: #f7b733;
    border-color: #0f172a;
  }

  /* â”€â”€ Fare-type toggle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  .admin-booking-flow .fare-toggle__switch input:checked + label {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    color: #f7b733;
    box-shadow: 0 3px 8px rgba(15,23,42,.18);
  }

  /* â”€â”€ Vehicle selector cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  .admin-booking-flow .vehicle-selector-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.75rem;
    width: 100%;
  }
  @media (max-width: 640px) {
    .admin-booking-flow .vehicle-selector-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  .admin-booking-flow .vehicle-selector-card {
    border: 2px solid #e2e8f0;
    border-radius: 14px;
    padding: 1rem 0.5rem 0.75rem;
    background: #fff;
    cursor: pointer;
    transition: all 0.22s ease;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    text-align: center;
    box-shadow: 0 1px 3px rgba(0,0,0,.05);
    position: relative;
    overflow: hidden;
  }
  .admin-booking-flow .vehicle-selector-card::before {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(247,183,51,0);
    transition: background 0.2s ease;
    border-radius: 12px;
  }
  .admin-booking-flow .vehicle-selector-card:hover {
    border-color: #f7b733;
    box-shadow: 0 4px 12px rgba(247,183,51,.2);
    transform: translateY(-2px);
  }
  .admin-booking-flow .vehicle-selector-card:hover::before {
    background: rgba(247,183,51,.04);
  }
  /* Active / selected state */
  .admin-booking-flow .vehicle-selector-card.vehicle-selector-card--active,
  .admin-booking-flow .vehicle-selector-card.active {
    border: 2.5px solid #f7b733 !important;
    background: linear-gradient(160deg, #fffbeb 0%, #fef3c7 100%) !important;
    box-shadow: 0 6px 18px rgba(247,183,51,.25) !important;
    transform: translateY(-3px) !important;
  }
  .admin-booking-flow .vehicle-selector-card.vehicle-selector-card--active::before,
  .admin-booking-flow .vehicle-selector-card.active::before {
    background: rgba(247,183,51,.06);
  }
  .admin-booking-flow .vehicle-selector-card img {
    max-height: 56px;
    object-fit: contain;
    width: 100%;
  }
  .admin-booking-flow .vehicle-selector-card__name {
    font-size: 0.82rem;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: 0.01em;
  }
  .admin-booking-flow .vehicle-selector-card.active .vehicle-selector-card__name,
  .admin-booking-flow .vehicle-selector-card.vehicle-selector-card--active .vehicle-selector-card__name {
    color: #92400e;
  }
  .admin-booking-flow .vehicle-selector-card__price {
    font-size: 0.75rem;
    font-weight: 700;
    color: #f59e0b;
    background: #fffbeb;
    border-radius: 99px;
    padding: 2px 8px;
    border: 1px solid #fde68a;
  }

  /* â”€â”€ Get Instant Fare button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  .admin-booking-flow #calculate-fare-btn {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    color: #f7b733;
    border-color: #0f172a;
    letter-spacing: 0.04em;
    width: 100%;
    border-radius: 10px;
  }
  .admin-booking-flow #calculate-fare-btn:hover {
    background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
    box-shadow: 0 8px 20px rgba(15,23,42,.25);
  }
  /* Promo Apply button â€” override public blue with admin gold/navy */
  .admin-booking-flow .btn-promo-apply {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    border-color: #0f172a;
    color: #f7b733;
  }
  .admin-booking-flow .btn-promo-apply:hover {
    background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
    box-shadow: 0 4px 14px rgba(15,23,42,0.3);
    filter: none;
  }

  /* Confirm button */
  .admin-booking-flow #confirm-booking-btn {
    background: linear-gradient(135deg, #f7b733 0%, #f59e0b 100%);
    color: #0f172a;
    border: none;
    width: 100%;
    border-radius: 10px;
    font-weight: 800;
  }
  .admin-booking-flow #confirm-booking-btn:hover {
    box-shadow: 0 8px 20px rgba(247,183,51,.4);
    filter: brightness(1.05);
  }

  /* â”€â”€ Fare card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  .admin-booking-flow .fare-card {
    border: 2px solid #f7b733;
    border-radius: 14px;
    background: linear-gradient(160deg, #fffbeb 0%, #fff 100%);
  }
  .admin-booking-flow .fare-card__amount { color: #92400e; }

  /* â”€â”€ Vehicle selected indicator checkmark â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  .admin-booking-flow .vehicle-selector-card.active::after,
  .admin-booking-flow .vehicle-selector-card.vehicle-selector-card--active::after {
    content: '\2713';
    position: absolute;
    top: 6px;
    right: 8px;
    font-size: 0.7rem;
    font-weight: 900;
    color: #92400e;
    background: #fde68a;
    border-radius: 50%;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
</style>


<script>
window.DROP_CARS_BASE_PATH = <?php echo json_encode(dropcars_base_path(), JSON_HEX_TAG | JSON_HEX_AMP); ?>;
window.DROP_CARS_ADMIN_BOOKING = true;
window.DROP_CARS_ADMIN_REDIRECT = <?php echo json_encode($adminRedirect, JSON_HEX_TAG | JSON_HEX_AMP); ?>;
window.DROP_CARS_DISTANCES = <?php echo $distanceCache; ?>;
window.DROP_CARS_CONFIG = <?php echo $configData; ?>;
window.GOOGLE_MAPS_API_KEY = <?php echo json_encode($mapsKey, JSON_HEX_TAG | JSON_HEX_AMP); ?>;
</script>
<?php if ($mapsKey !== ''): ?>
<script async defer src="https://maps.googleapis.com/maps/api/js?key=<?php echo $mapsKeyUrl; ?>&amp;libraries=places&amp;loading=async"></script>
<?php endif; ?>
<script defer src="<?php echo $s('assets/js/config.js'); ?>"></script>
<script defer src="<?php echo $s('assets/js/fare-calculator.js'); ?>"></script>
<script defer src="<?php echo $s('assets/js/maps-integration.js'); ?>"></script>
<script defer src="<?php echo $s('assets/js/route-loader.js'); ?>"></script>
<script defer src="<?php echo $s('assets/js/ui-controls.js'); ?>"></script>
<script defer src="<?php echo $s('assets/js/booking-form.js'); ?>"></script>
<script defer src="<?php echo $s('assets/js/phone-country.js'); ?>"></script>
<script>
// Admin vehicle card selection guarantee
// Runs after all deferred scripts; adds a secondary direct click handler
// that forces the correct active class in case the main flow is blocked.
document.addEventListener('DOMContentLoaded', function() {
    var container = document.querySelector('.admin-booking-flow .vehicle-selector-grid');
    if (!container) return;

    container.addEventListener('click', function(e) {
        var card = e.target.closest('.vehicle-selector-card');
        if (!card) return;

        // Visual state
        container.querySelectorAll('.vehicle-selector-card').forEach(function(c) {
            c.classList.remove('vehicle-selector-card--active', 'active');
        });
        card.classList.add('vehicle-selector-card--active', 'active');

        // Hidden input
        var input = document.getElementById('vehicle-type-input');
        var val = (card.dataset.vehicle || 'SEDAN').toUpperCase();
        if (input) { input.value = val; }

        // Call main UI library if available
        if (window.DropCarsUI && window.DropCarsUI.setVehicleType) {
            window.DropCarsUI.setVehicleType(val);
        }
    });
});

// Temporary autofill for faster admin QA testing.
document.addEventListener('DOMContentLoaded', function () {
    var form = document.getElementById('booking-form');
    if (!form) return;

    function setIfEmpty(selector, value) {
        var el = form.querySelector(selector);
        if (!el) return;
        if ((el.value || '').trim() !== '') return;
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    var now = new Date();
    var travelDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    var hh = String((now.getHours() + 1) % 24).padStart(2, '0');
    var mm = String(Math.floor(now.getMinutes() / 5) * 5).padStart(2, '0');
    var dateStr = travelDate.toISOString().slice(0, 10);

    setIfEmpty('input[name="customerName"]', 'Test Customer');
    setIfEmpty('#contact-phone', '9876543210');
    setIfEmpty('#contact-email', 'test@dropcars.in');
    setIfEmpty('#pickup', 'Chennai Central');
    setIfEmpty('#drop', 'Bangalore Airport');
    setIfEmpty('input[name="date"]', dateStr);
    setIfEmpty('input[name="time"]', hh + ':' + mm);
});
</script>

