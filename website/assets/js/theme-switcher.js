/**
 * Theme Switcher Logic
 */

(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", function () {
        var switcherBtns = document.querySelectorAll(".theme-switcher__btn");
        
        switcherBtns.forEach(function (btn) {
            btn.addEventListener("click", function (e) {
                // If it's a link, let it navigate. 
                // We'll also store the preference.
                var theme = btn.dataset.theme;
                if (theme) {
                    try { localStorage.setItem('dropcars_preferred_theme', theme); } catch (_) {}
                }
            });
        });

        // Auto-apply theme preference if on root and not already themed?
        // Actually, user wants "optional" so we just let the URLs do the work.
    });

})();
