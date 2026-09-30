/**
 * In-panel alarm for website bookings awaiting approval (see
 * admin/pages/website-booking-approvals.php and
 * admin/actions/website-bookings-pending-count.php). Polls a lightweight
 * local endpoint - not the FastAPI backend directly - so a slow/unreachable
 * backend never blocks page loads, only this background poll.
 *
 * Uses a synthesized Web Audio beep instead of an audio file, since browsers
 * block autoplay audio until the user has interacted with the page at least
 * once; we listen for the first click/keydown anywhere to "unlock" it.
 */
(function () {
    var POLL_INTERVAL_MS = 25000;
    // Relative to the current /admin/{page} URL, same convention as
    // sidebar-nav.php's links and layout.php's asset tags.
    var COUNT_URL = 'actions/website-bookings-pending-count.php';
    var APPROVALS_URL = 'website-booking-approvals';

    var audioCtx = null;
    var audioUnlocked = false;
    var beepTimer = null;

    function unlockAudio() {
        if (audioUnlocked) return;
        audioUnlocked = true;
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            audioCtx = null;
        }
    }
    document.addEventListener('click', unlockAudio, { once: true });
    document.addEventListener('keydown', unlockAudio, { once: true });

    function beep() {
        if (!audioCtx) return;
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.35);
    }

    function ensureBanner() {
        var banner = document.getElementById('pending-approvals-siren-banner');
        if (banner) return banner;
        banner = document.createElement('a');
        banner.id = 'pending-approvals-siren-banner';
        banner.href = APPROVALS_URL;
        banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99998;display:none;' +
            'background:#ef4444;color:#fff;text-align:center;padding:10px 16px;font-weight:700;' +
            'font-size:0.85rem;text-decoration:none;box-shadow:0 2px 8px rgba(0,0,0,0.2);' +
            'animation:pending-approvals-flash 1.2s ease-in-out infinite;';
        banner.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> <span id="pending-approvals-siren-text"></span> - click to review';
        document.body.appendChild(banner);

        var style = document.createElement('style');
        style.textContent = '@keyframes pending-approvals-flash { 0%,100% { opacity:1; } 50% { opacity:0.75; } }';
        document.head.appendChild(style);
        return banner;
    }

    function setState(count) {
        var banner = ensureBanner();
        var navBadge = document.getElementById('pending-approvals-nav-badge');

        if (navBadge) {
            navBadge.style.display = count > 0 ? 'inline-block' : 'none';
            navBadge.textContent = count > 0 ? String(count) : '';
        }

        if (count > 0) {
            document.getElementById('pending-approvals-siren-text').textContent =
                count + ' website booking' + (count === 1 ? '' : 's') + ' awaiting approval';
            banner.style.display = 'block';
            if (!beepTimer) {
                beep();
                beepTimer = setInterval(beep, 8000);
            }
        } else {
            banner.style.display = 'none';
            if (beepTimer) {
                clearInterval(beepTimer);
                beepTimer = null;
            }
        }
    }

    function poll() {
        fetch(COUNT_URL, { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (data) { setState(data.count || 0); })
            .catch(function () { /* stay quiet on transient network errors */ });
    }

    poll();
    setInterval(poll, POLL_INTERVAL_MS);
})();
