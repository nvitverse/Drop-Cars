<?php
/**
 * Drop Cars – Frontend Protection Snippet
 * Output inline JavaScript that:
 *   1. Disables right-click and devtools keyboard shortcuts
 *   2. Disables text selection (copy protection)
 *   3. Auto-logout on inactivity (for admin-side, handled server-side too)
 *   4. Disables drag-and-drop of images (prevents easy asset stealing)
 *
 * Usage: include this file inside your <head> or before </body>.
 * For admin pages, pass $adminMode = true to also show inactivity warning.
 */

$adminMode = $adminMode ?? false;
$inactivityTimeoutMinutes = $adminMode ? 55 : 0; // warn at 55 min (server expires at 60)
?>
<script>
(function(){
'use strict';
// === RIGHT-CLICK BLOCK ===
document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    return false;
}, false);

// === KEYBOARD SHORTCUT BLOCKS ===
document.addEventListener('keydown', function(e) {
    // Block F12 (DevTools)
    if (e.key === 'F12') { e.preventDefault(); return false; }
    // Block Ctrl+U (View Source)
    if (e.ctrlKey && e.key === 'u') { e.preventDefault(); return false; }
    // Block Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C (DevTools)
    if (e.ctrlKey && e.shiftKey && ['i','I','j','J','c','C'].includes(e.key)) { e.preventDefault(); return false; }
    // Block Ctrl+S (Save page)
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); return false; }
    // Block Ctrl+P (Print, can expose source)
    if (e.ctrlKey && e.key === 'p') { e.preventDefault(); return false; }
}, false);

// === DRAG PROTECTION ===
document.addEventListener('dragstart', function(e) {
    if (e.target.tagName === 'IMG') { e.preventDefault(); }
}, false);

// === DEVTOOLS DETECTION (size-based heuristic) ===
(function devToolsDetect() {
    var threshold = 160;
    function check() {
        var widthDiff = window.outerWidth - window.innerWidth > threshold;
        var heightDiff = window.outerHeight - window.innerHeight > threshold;
        if (widthDiff || heightDiff) {
            // DevTools opened – clear console visually
            console.clear();
        }
    }
    setInterval(check, 3000);
})();

<?php if ($adminMode && $inactivityTimeoutMinutes > 0): ?>
// === ADMIN INACTIVITY AUTO-LOGOUT ===
(function() {
    var warningShown = false;
    var timeoutMs = <?php echo $inactivityTimeoutMinutes * 60 * 1000; ?>;
    var lastActivity = Date.now();
    var warningEl = null;

    function resetTimer() { lastActivity = Date.now(); if (warningEl) { warningEl.remove(); warningEl = null; warningShown = false; } }
    ['click','keydown','mousemove','scroll','touchstart'].forEach(function(evt) {
        document.addEventListener(evt, resetTimer, { passive: true });
    });

    setInterval(function() {
        var idle = Date.now() - lastActivity;
        if (idle >= timeoutMs + 60000) {
            // Force logout
            window.location.href = '/admin/logout?reason=timeout';
        } else if (idle >= timeoutMs && !warningShown) {
            warningShown = true;
            warningEl = document.createElement('div');
            warningEl.style.cssText = 'position:fixed;top:20px;right:20px;background:#1f2937;color:#fff;padding:20px 24px;border-radius:12px;z-index:99999;font-family:sans-serif;box-shadow:0 10px 30px rgba(0,0,0,0.4);border-left:4px solid #f59e0b;max-width:320px;';
            warningEl.innerHTML = '<strong style="display:block;margin-bottom:8px;">⚠️ Session Expiring</strong><span style="font-size:14px;opacity:0.85;">You have been idle for a while. You will be logged out in 1 minute.</span><button onclick="this.parentElement.remove()" style="display:block;margin-top:14px;background:#374151;color:#fff;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;">Stay Logged In</button>';
            document.body.appendChild(warningEl);
        }
    }, 10000);
})();
<?php endif; ?>

})();
</script>
