/**
 * Fires Google Ads conversion events for the two signals that actually happen
 * on this site — someone tapping a phone number, or completing the booking
 * form — so Smart Bidding has real conversion data instead of none.
 * Config (conversion ID + labels) comes from data/config.json via google-tag.php.
 */
(function () {
  "use strict";

  function fire(label, value) {
    var cfg = window.DropCarsGoogleAdsConversions;
    if (!cfg || !cfg.conversionId || !label || typeof gtag !== "function") {
      return;
    }
    var params = { send_to: cfg.conversionId + "/" + label };
    // Include the actual booking value so Google Ads/Smart Bidding can
    // optimize for ROI, not just conversion count. Only attached when a
    // real positive number is supplied - never send a fabricated value.
    if (typeof value === "number" && isFinite(value) && value > 0) {
      params.value = value;
      params.currency = "INR";
    }
    gtag("event", "conversion", params);
  }

  // Site-wide: any tap on a tel: link counts as a call conversion, no matter
  // which template/page it's on (header, hero CTA, footer, etc.).
  document.addEventListener(
    "click",
    function (e) {
      var cfg = window.DropCarsGoogleAdsConversions;
      if (!cfg || !cfg.callLabel) {
        return;
      }
      var link = e.target && e.target.closest ? e.target.closest('a[href^="tel:"]') : null;
      if (link) {
        fire(cfg.callLabel);
      }
    },
    true
  );

  // Called explicitly by booking-form.js on a genuine customer booking success
  // (not admin-created bookings, which shouldn't count as ad conversions).
  // bookingValue (the confirmed fare in rupees) is optional - omit it and
  // the conversion still fires, just without a value signal.
  window.DropCarsFireFormConversion = function (bookingValue) {
    var cfg = window.DropCarsGoogleAdsConversions;
    if (cfg) {
      fire(cfg.formLabel, bookingValue);
    }
  };
})();
