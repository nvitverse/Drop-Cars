<?php
/**
 * pages/driver-trip.php
 *
 * Driver-facing trip-start + live-location page, reached via a shareable
 * link (no Driver App login required) - the token in the URL IS the auth.
 * See backend app/api/routes/website_bookings.py's /website/trip-link/*
 * endpoints (token generated alongside start_trip_otp/end_trip_otp in
 * api/routes/order_assignments.py, surfaced to staff as trip_link_url on
 * the order-detail screens until it's wired into the Driver App itself).
 *
 * Everything after this point is plain HTML/JS talking directly to the
 * FastAPI backend (CORS is wildcard-open there) - no PHP/MySQL involved on
 * this page beyond reading the backend's public base URL from config.
 */

$configPath = __DIR__ . '/../api/config.php';
if (!is_file($configPath)) {
    $configPath = __DIR__ . '/../api/config.example.php';
}
$config = is_file($configPath) ? (include $configPath) : [];
$apiBaseUrl = rtrim((string) ($config['dropcarsApiBaseUrl'] ?? ''), '/');

$token = trim((string) ($_GET['token'] ?? ''));
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Trip Link - Drop Cars</title>
<style>
    :root {
        --brand-blue: #1450d6;
        --dark-blue: #0b2f7a;
        --success: #16a34a;
        --danger: #dc2626;
        --muted: #6b7280;
        --border: #e5e7eb;
        --bg: #f7f8fb;
    }
    * { box-sizing: border-box; }
    body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        background: var(--bg);
        color: #111827;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 1.25rem 1rem 3rem;
    }
    .card {
        width: 100%;
        max-width: 440px;
        background: #fff;
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 1.5rem;
        margin-top: 1rem;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .brand { font-weight: 800; font-size: 1.1rem; color: var(--dark-blue); letter-spacing: -0.02em; }
    h1 { font-size: 1.25rem; margin: 0.75rem 0 0.25rem; }
    p.sub { color: var(--muted); font-size: 0.9rem; margin: 0 0 1rem; line-height: 1.4; }
    label { display: block; font-size: 0.85rem; font-weight: 600; margin: 1rem 0 0.35rem; color: #374151; }
    input[type=text], input[type=number], input[type=tel] {
        width: 100%; padding: 0.75rem 0.9rem; font-size: 1rem;
        border: 1.5px solid var(--border); border-radius: 10px; background: #fff;
    }
    input[type=file] {
        width: 100%; padding: 0.6rem; font-size: 0.9rem;
        border: 1.5px dashed var(--border); border-radius: 10px; background: #fafafa;
    }
    button {
        width: 100%; padding: 0.9rem; font-size: 1rem; font-weight: 700;
        border: none; border-radius: 12px; margin-top: 1.25rem; cursor: pointer;
        background: var(--brand-blue); color: #fff;
    }
    button:disabled { opacity: 0.55; cursor: not-allowed; }
    button:active:not(:disabled) { transform: scale(0.98); }
    .status-pill {
        display: inline-flex; align-items: center; gap: 0.4rem;
        font-size: 0.8rem; font-weight: 700; padding: 0.3rem 0.7rem;
        border-radius: 999px; background: #eef2ff; color: var(--brand-blue);
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--brand-blue); }
    .dot.live { background: var(--success); animation: pulse 1.4s infinite; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
    .error-box {
        background: #fef2f2; border: 1px solid #fecaca; color: var(--danger);
        border-radius: 10px; padding: 0.75rem 0.9rem; font-size: 0.85rem; margin-top: 1rem; display: none;
    }
    .info-row { display: flex; justify-content: space-between; font-size: 0.9rem; padding: 0.4rem 0; border-bottom: 1px solid #f3f4f6; }
    .info-row span:first-child { color: var(--muted); }
    .info-row span:last-child { font-weight: 600; text-align: right; }
    .center { text-align: center; }
    .hidden { display: none !important; }
    .loc-fix { font-size: 0.78rem; color: var(--muted); margin-top: 0.5rem; }
    .big-icon { font-size: 2.75rem; margin: 0.25rem 0; }
    .keep-open-banner {
        background: #fffbeb; border: 1px solid #fde68a; color: #92400e;
        border-radius: 10px; padding: 0.7rem 0.85rem; font-size: 0.82rem;
        font-weight: 600; margin-top: 0.9rem; line-height: 1.4;
    }
</style>
</head>
<body>

<div class="brand">🚕 Drop Cars</div>

<div class="card" id="loading-card">
    <p class="sub">Loading trip details…</p>
</div>

<div class="card hidden" id="invalid-card">
    <div class="big-icon center">⚠️</div>
    <h1 class="center">Link not valid</h1>
    <p class="sub center">This trip link has expired or is incorrect. Please contact your fleet owner or Drop Cars support for a new link.</p>
</div>

<div class="card hidden" id="cancelled-card">
    <div class="big-icon center">✕</div>
    <h1 class="center">Trip Cancelled</h1>
    <p class="sub center">This booking has been cancelled. No action is needed.</p>
</div>

<div class="card hidden" id="start-card">
    <span class="status-pill"><span class="dot"></span> Ready to start</span>
    <h1 id="start-customer">Trip for —</h1>
    <p class="sub" id="start-route">—</p>

    <div id="start-error" class="error-box"></div>

    <form id="start-form">
        <label for="start_km">Starting Odometer (KM)</label>
        <input type="number" id="start_km" inputmode="numeric" placeholder="e.g. 45210" required>

        <label for="otp">Trip Start Code (from customer)</label>
        <input type="text" id="otp" inputmode="numeric" maxlength="4" placeholder="4-digit code" required>

        <label for="speedometer_img">Speedometer Photo</label>
        <input type="file" id="speedometer_img" accept="image/*" capture="environment" required>

        <button type="submit" id="start-submit-btn">Start Trip &amp; Share Location</button>
    </form>
</div>

<div class="card hidden" id="live-card">
    <span class="status-pill"><span class="dot live"></span> Live</span>
    <h1>Trip in progress</h1>
    <p class="sub">Your location is being shared automatically while this page stays open. You can keep driving - no further action needed here.</p>
    <div class="keep-open-banner">⚠️ Please keep this tab open until the trip ends. Closing it or switching apps stops your location sharing with the customer.</div>
    <div class="loc-fix" id="loc-fix-text">Waiting for GPS fix…</div>
    <div class="error-box" id="live-error"></div>
</div>

<script>
(function () {
    var API_BASE = <?php echo json_encode($apiBaseUrl); ?>;
    var TOKEN = <?php echo json_encode($token); ?>;

    var loadingCard = document.getElementById('loading-card');
    var invalidCard = document.getElementById('invalid-card');
    var cancelledCard = document.getElementById('cancelled-card');
    var startCard = document.getElementById('start-card');
    var liveCard = document.getElementById('live-card');

    function show(card) {
        [loadingCard, invalidCard, cancelledCard, startCard, liveCard].forEach(function (c) {
            c.classList.add('hidden');
        });
        card.classList.remove('hidden');
    }

    function routeLabel(loc) {
        if (!loc || typeof loc !== 'object') return 'Route details unavailable';
        var pickup = loc.pickup || loc.pickup_address || loc.from || '';
        var drop = loc.drop || loc.drop_address || loc.to || '';
        if (pickup && drop) return pickup + ' → ' + drop;
        return pickup || drop || 'Route details unavailable';
    }

    function sendLeftBeacon() {
        // navigator.sendBeacon fires-and-forgets reliably even as the page is
        // unloading/backgrounding, unlike fetch (which the browser can abort
        // mid-flight on navigation). This is detection/reporting only - a web
        // page has no way to actually force the tab to stay open or block
        // the phone's home button/app-switch.
        if (!TOKEN || !('sendBeacon' in navigator)) return;
        navigator.sendBeacon(API_BASE + '/api/website/trip-link/' + encodeURIComponent(TOKEN) + '/left');
    }

    function startLocationSharing() {
        show(liveCard);
        if (!('geolocation' in navigator)) {
            document.getElementById('live-error').style.display = 'block';
            document.getElementById('live-error').textContent = 'This browser does not support location sharing. Please open this link in Chrome or Safari.';
            return;
        }

        // Best-effort: nudge the driver not to close the tab (native "Leave
        // site?" prompt), and tell the backend the instant the page is
        // backgrounded or torn down, so the customer's map can honestly show
        // "paused" instead of freezing on a stale pin.
        window.addEventListener('beforeunload', function (e) {
            sendLeftBeacon();
            e.preventDefault();
            e.returnValue = '';
            return '';
        });
        window.addEventListener('pagehide', sendLeftBeacon);
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) sendLeftBeacon();
        });

        var lastSentAt = 0;
        var MIN_INTERVAL_MS = 10000;

        navigator.geolocation.watchPosition(
            function (pos) {
                var now = Date.now();
                document.getElementById('loc-fix-text').textContent =
                    'Last fix: ' + pos.coords.latitude.toFixed(5) + ', ' + pos.coords.longitude.toFixed(5);
                if (now - lastSentAt < MIN_INTERVAL_MS) return;
                lastSentAt = now;
                fetch(API_BASE + '/api/website/trip-link/' + encodeURIComponent(TOKEN) + '/location', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                }).catch(function () { /* silent - next fix will retry */ });
            },
            function (err) {
                var box = document.getElementById('live-error');
                box.style.display = 'block';
                box.textContent = 'Location permission is needed to share your live location with the customer. Please allow location access in your browser settings and reload this page.';
            },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
        );
    }

    function loadTripInfo() {
        if (!TOKEN) { show(invalidCard); return; }
        fetch(API_BASE + '/api/website/trip-link/' + encodeURIComponent(TOKEN))
            .then(function (res) {
                if (!res.ok) throw new Error('not found');
                return res.json();
            })
            .then(function (data) {
                if (data.trip_cancelled) { show(cancelledCard); return; }
                if (data.trip_started) { startLocationSharing(); return; }
                document.getElementById('start-customer').textContent = 'Trip for ' + (data.customer_name || 'Customer');
                document.getElementById('start-route').textContent = routeLabel(data.pickup_drop_location);
                show(startCard);
            })
            .catch(function () { show(invalidCard); });
    }

    document.getElementById('start-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = document.getElementById('start-submit-btn');
        var errBox = document.getElementById('start-error');
        errBox.style.display = 'none';

        var fileInput = document.getElementById('speedometer_img');
        if (!fileInput.files || !fileInput.files[0]) {
            errBox.textContent = 'Please take a photo of the speedometer.';
            errBox.style.display = 'block';
            return;
        }

        var fd = new FormData();
        fd.append('start_km', document.getElementById('start_km').value);
        fd.append('otp', document.getElementById('otp').value);
        fd.append('speedometer_img', fileInput.files[0]);

        btn.disabled = true;
        btn.textContent = 'Starting trip…';

        fetch(API_BASE + '/api/website/trip-link/' + encodeURIComponent(TOKEN) + '/start', {
            method: 'POST',
            body: fd,
        })
            .then(function (res) {
                return res.json().then(function (data) { return { ok: res.ok, data: data }; });
            })
            .then(function (result) {
                if (!result.ok) {
                    throw new Error(result.data && result.data.detail ? result.data.detail : 'Failed to start trip');
                }
                startLocationSharing();
            })
            .catch(function (err) {
                btn.disabled = false;
                btn.textContent = 'Start Trip & Share Location';
                errBox.textContent = err.message || 'Something went wrong. Please try again.';
                errBox.style.display = 'block';
            });
    });

    loadTripInfo();
})();
</script>

</body>
</html>
