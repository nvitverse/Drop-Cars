/**
 * Mobile soft-keyboard collision guard.
 *
 * On iOS Safari / Android Chrome, opening the keyboard shrinks the visible
 * viewport but `position: fixed` elements (the floating WhatsApp/AI buttons,
 * the quote modal's action buttons) are laid out against the full layout
 * viewport, not the visible one - so they can end up covering the input
 * the user just tapped, or the submit button they're trying to reach.
 *
 * Uses the visualViewport API (supported in all current mobile browsers) to
 * detect when the keyboard is open and react via a body class + a CSS
 * custom property other stylesheets can use for exact available height.
 */
(function () {
  "use strict";

  if (!window.visualViewport) {
    return; // No API support - nothing to do, elements keep their normal fixed layout.
  }

  var KEYBOARD_HEIGHT_THRESHOLD = 120; // px - roughly the smallest real keyboard

  function updateViewportState() {
    var vv = window.visualViewport;
    var shrink = window.innerHeight - vv.height;
    var keyboardOpen = shrink > KEYBOARD_HEIGHT_THRESHOLD;

    document.documentElement.classList.toggle("dc-keyboard-open", keyboardOpen);
    document.documentElement.style.setProperty("--dc-visible-vh", vv.height + "px");
  }

  window.visualViewport.addEventListener("resize", updateViewportState);
  window.visualViewport.addEventListener("scroll", updateViewportState);
  updateViewportState();
})();
