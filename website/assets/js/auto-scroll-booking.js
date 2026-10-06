/**
 * Drop Cars – Auto-scroll to booking form on page load.
 * Fires on any page that contains id="booking-form" or id="booking" or id="airport-booking-form".
 * Respects the sticky header height offset so the booking form lands perfectly at top of viewport.
 * Does NOT fire if the URL already has a hash pointing elsewhere (e.g. #faq).
 */
(function () {
  'use strict';

  function getHeaderHeight() {
    var header = document.querySelector('.site-header, header');
    if (!header) return 0;
    return header.offsetHeight || 70;
  }

  function scrollToForm(smooth) {
    // Find the booking form or its nearest visible container
    var form = document.getElementById('airport-booking-form') ||
               document.getElementById('booking-form') ||
               document.getElementById('booking');

    if (!form) return;

    // Prefer the containing booking card or section if form is nested
    var anchor = form.closest('.booking-card, .booking-card--home, .airport-hero__booking-card, .airport-booking-section, #airport-booking-form, #booking') || form;

    if (!anchor) return;

    var isSmooth = (smooth !== false);
    var headerH = getHeaderHeight();
    var extraOffset = 12; // Breathing room below header

    var currentScroll = window.pageYOffset || document.documentElement.scrollTop || 0;
    var rect = anchor.getBoundingClientRect();
    var targetScrollTop = Math.max(0, currentScroll + rect.top - headerH - extraOffset);

    // Only scroll if not already positioned accurately (within 5px)
    if (Math.abs(currentScroll - targetScrollTop) < 5) {
      return;
    }

    try {
      window.scrollTo({
        top: targetScrollTop,
        behavior: isSmooth ? 'smooth' : 'auto'
      });
    } catch (e) {
      window.scrollTo(0, targetScrollTop);
    }
  }

  // Expose global helper function for explicit scroll triggers (e.g. airport chip clicks)
  window.DropCarsScrollToBookingForm = function (smooth) {
    scrollToForm(smooth);
  };

  // Only auto-scroll on load if explicitly requested via hash or query param
  var hash = window.location.hash || '';
  var hasExplicitHash = (hash === '#booking-form' || hash === '#booking' || hash === '#airport-booking-form');
  var hasScrollParam = false;
  try {
    var params = new URLSearchParams(window.location.search);
    hasScrollParam = params.get('scroll') === 'booking' || params.get('focus') === 'booking';
  } catch (e) {}

  if (hasExplicitHash || hasScrollParam) {
    function initAutoScroll() {
      setTimeout(function () {
        scrollToForm(true);
      }, 150);
    }

    if (document.readyState === 'complete') {
      initAutoScroll();
    } else {
      window.addEventListener('load', initAutoScroll);
    }
  }
})();
