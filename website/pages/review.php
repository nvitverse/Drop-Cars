<?php
/**
 * pages/review.php - the page the trip QR opens: /review/{token}
 * Standalone, mobile-first (customers open it straight from a scan on their phone). Talks to api/trip-review.php.
 */
$token = trim((string) ($_GET['token'] ?? ''));
if (!preg_match('/^[A-Za-z0-9_-]{16,80}$/', $token)) {
    http_response_code(404);
    $token = '';
}
header('X-Robots-Tag: noindex, nofollow');
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Rate your trip | Drop Cars</title>
<style>
  :root { --ink:#0f172a; --muted:#64748b; --line:#e2e8f0; --brand:#2563eb; --gold:#f59e0b; --bg:#f1f5f9; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; background:var(--bg); color:var(--ink); }
  .wrap { max-width:460px; margin:0 auto; padding:18px 16px 40px; }
  .brand { text-align:center; font-weight:800; font-size:20px; letter-spacing:.3px; margin:6px 0 16px; }
  .brand span { color:var(--brand); }
  .card { background:#fff; border-radius:20px; padding:20px; box-shadow:0 6px 24px rgba(15,23,42,.08); }
  h1 { font-size:20px; margin:0 0 4px; }
  .sub { color:var(--muted); font-size:14px; margin:0 0 16px; }
  .trip { background:#f8fafc; border:1px solid var(--line); border-radius:14px; padding:12px 14px; margin-bottom:16px; font-size:14px; }
  .trip b { display:block; font-size:15px; margin-bottom:2px; }
  .driver { display:flex; align-items:center; gap:12px; margin-bottom:16px; }
  .avatar { width:52px; height:52px; border-radius:50%; background:#dbeafe; color:var(--brand); display:flex; align-items:center; justify-content:center; font-weight:800; font-size:20px; overflow:hidden; }
  .avatar img { width:100%; height:100%; object-fit:cover; }
  .stars { display:flex; justify-content:space-between; margin:8px 4px 6px; }
  .stars button { background:none; border:0; font-size:44px; line-height:1; color:#cbd5e1; cursor:pointer; padding:2px; }
  .stars button.on { color:var(--gold); }
  .hint { text-align:center; color:var(--muted); font-size:13px; min-height:18px; margin-bottom:12px; }
  label { display:block; font-size:13px; font-weight:600; margin:12px 0 6px; }
  textarea, input { width:100%; font:inherit; padding:12px 14px; border:1.5px solid var(--line); border-radius:12px; background:#fff; }
  textarea { min-height:96px; resize:vertical; }
  textarea:focus, input:focus { outline:none; border-color:var(--brand); }
  .btn { width:100%; margin-top:16px; padding:15px; border:0; border-radius:14px; background:var(--brand); color:#fff; font-size:16px; font-weight:700; cursor:pointer; }
  .btn[disabled] { background:#94a3b8; cursor:not-allowed; }
  .msg { text-align:center; padding:26px 8px; }
  .msg .big { font-size:44px; }
  .err { background:#fef2f2; color:#b91c1c; border-radius:12px; padding:10px 12px; font-size:13.5px; margin-top:12px; display:none; }
  .foot { text-align:center; color:var(--muted); font-size:12px; margin-top:16px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="brand">Drop <span>Cars</span></div>
  <div class="card" id="root">
    <div class="msg"><div class="sub">Loading your trip...</div></div>
  </div>
  <div class="foot">Your feedback helps us keep every trip safe and pleasant.</div>
</div>

<script>
(function () {
  var TOKEN = <?php echo json_encode($token); ?>;
  var root = document.getElementById('root');
  var rating = 0;
  var labels = ['', 'Poor', 'Below average', 'Good', 'Very good', 'Excellent'];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function fmtDate(iso) { try { return new Date(iso).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }); } catch (e) { return ''; } }
  function done(title, text, emoji) { root.innerHTML = '<div class="msg"><div class="big">' + emoji + '</div><h1>' + esc(title) + '</h1><p class="sub">' + esc(text) + '</p></div>'; }

  if (!TOKEN) { done('Link not valid', 'This review link is not valid or has expired.', '⚠️'); return; }

  fetch('/api/trip-review.php?token=' + encodeURIComponent(TOKEN), { cache: 'no-store' })
    .then(function (r) { return r.json().catch(function () { return {}; }); })
    .then(function (res) {
      if (!res.success) { done('Link not valid', res.message || 'This review link is not valid or has expired.', '⚠️'); return; }
      var t = res.trip || {};
      if (t.already_reviewed) { done('Thank you!', 'You have already reviewed this trip.', '⭐'); return; }
      if (!t.completed) { done('Trip not finished yet', 'You can rate the trip once it is completed. Please scan again after the trip.', '🚕'); return; }
      render(t);
    })
    .catch(function () { done('Something went wrong', 'Please check your internet and try again.', '⚠️'); });

  function render(t) {
    var init = (t.driver_name || 'D').trim().charAt(0).toUpperCase();
    var avatar = t.driver_photo ? '<img src="' + esc(t.driver_photo) + '" alt="">' : esc(init);
    root.innerHTML =
      '<h1>How was your trip?</h1><p class="sub">Please rate your driver and tell us about the ride.</p>' +
      '<div class="trip"><b>' + esc(t.pickup || '') + (t.drop ? ' → ' + esc(t.drop) : '') + '</b>' +
        '<span style="color:var(--muted)">' + esc(t.trip_type || '') + (t.date ? ' · ' + fmtDate(t.date) : '') + (t.car ? ' · ' + esc(t.car) : '') + '</span></div>' +
      (t.driver_name ? '<div class="driver"><div class="avatar">' + avatar + '</div><div><b>' + esc(t.driver_name) + '</b><div class="sub" style="margin:0">Your driver</div></div></div>' : '') +
      '<div class="stars" id="stars"></div><div class="hint" id="hint">Tap a star</div>' +
      '<label for="fb">Your feedback (optional)</label><textarea id="fb" maxlength="1000" placeholder="Was the driver polite? Was the car clean? Anything we can improve?"></textarea>' +
      '<label for="nm">Your name (optional)</label><input id="nm" maxlength="80" placeholder="Shown as first name and initial">' +
      '<div class="err" id="err"></div>' +
      '<button class="btn" id="go" disabled>Submit review</button>';
    var stars = document.getElementById('stars');
    for (var i = 1; i <= 5; i++) {
      (function (n) {
        var b = document.createElement('button'); b.type = 'button'; b.textContent = '★'; b.setAttribute('aria-label', n + ' star');
        b.onclick = function () { rating = n; paint(); };
        stars.appendChild(b);
      })(i);
    }
    function paint() {
      var bs = stars.children;
      for (var i = 0; i < bs.length; i++) bs[i].className = i < rating ? 'on' : '';
      document.getElementById('hint').textContent = labels[rating] || 'Tap a star';
      document.getElementById('go').disabled = rating < 1;
    }
    document.getElementById('go').onclick = function () {
      var go = this, err = document.getElementById('err');
      err.style.display = 'none'; go.disabled = true; go.textContent = 'Sending...';
      fetch('/api/trip-review.php', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: TOKEN, rating: rating, feedback: document.getElementById('fb').value, name: document.getElementById('nm').value })
      })
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (res) {
          if (res.success) { done('Thank you!', 'Your review has been sent. Have a great day!', '🙏'); }
          else { err.textContent = res.message || 'We could not save your review. Please try again.'; err.style.display = 'block'; go.disabled = false; go.textContent = 'Submit review'; }
        })
        .catch(function () { err.textContent = 'No internet connection. Please try again.'; err.style.display = 'block'; go.disabled = false; go.textContent = 'Submit review'; });
    };
  }
})();
</script>
</body>
</html>
