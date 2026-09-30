/* Drop Cars – Light/Dark theme toggle. Light = default. */
(function () {
  'use strict';

  var KEY = 'dc-theme';
  var html = document.documentElement;

  /* Safe localStorage wrapper – silently fails in private/blocked contexts */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }

  function applyTheme(isDark) {
    if (isDark) {
      html.classList.add('dark-mode');
      html.setAttribute('data-theme', 'dark');
      if (document.body) {
        document.body.classList.add('dark-mode');
        document.body.setAttribute('data-theme', 'dark');
      }
    } else {
      html.classList.remove('dark-mode');
      html.removeAttribute('data-theme');
      if (document.body) {
        document.body.classList.remove('dark-mode');
        document.body.removeAttribute('data-theme');
      }
    }
  }

  /* Apply saved preference on load */
  var initialDark = lsGet(KEY) === 'dark';
  applyTheme(initialDark);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      applyTheme(lsGet(KEY) === 'dark');
    });
  }

  /* Wire toggle button using event delegation for maximum reliability */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.theme-toggle') || e.target.closest('#theme-toggle-btn');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    var currentlyDark = html.classList.contains('dark-mode');
    var nextDark = !currentlyDark;
    applyTheme(nextDark);
    lsSet(KEY, nextDark ? 'dark' : 'light');

    // Sync all toggles on the page
    document.querySelectorAll('.theme-toggle, #theme-toggle-btn').forEach(function (t) {
      t.setAttribute('aria-label', nextDark ? 'Switch to light mode' : 'Switch to dark mode');
    });
  });
})();
