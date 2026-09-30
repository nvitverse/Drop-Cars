/**
 * contact-step-reveal.js
 * Hides Name/Phone/Email field pairs (.contact-step-hidden class) initially.
 * Auto-reveals them smoothly when user enters valid Pickup and Drop locations.
 * Check Fare Now button remains fully visible and intact.
 */
(function () {
  "use strict";

  function init() {
    var form = document.getElementById("booking-form");
    if (!form) return;

    var contactPrimary = form.querySelector(".field-pair--contact-primary");
    var contactSecond  = form.querySelector(".field-pair--contact-second");
    if (!contactPrimary && !contactSecond) return;

    var pickupEl = form.querySelector("[name='pickup']");
    var dropEl   = form.querySelector("[name='drop']");
    var dateEl   = form.querySelector("[name='date']");
    var timeEl   = form.querySelector("[name='time']");

    function isUserEntered(el) {
      if (!el) return false;
      var val = (el.value || "").trim();
      if (val.length < 2) return false;
      var lower = val.toLowerCase();
      if (lower === "pick up location" || lower === "drop location") return false;
      return true;
    }

    function isStep1Complete() {
      var svc = ((form.querySelector("[name='serviceType']") || {}).value || "one_way");
      if (!isUserEntered(pickupEl)) return false;
      if (svc !== "hourly_rental" && !isUserEntered(dropEl)) return false;
      if (!isUserEntered(dateEl)) return false;
      if (!isUserEntered(timeEl)) return false;
      return true;
    }

    var isRevealed = false;

    function reveal() {
      if (isRevealed) return;
      isRevealed = true;
      requestAnimationFrame(function () {
        if (contactPrimary) contactPrimary.classList.remove("contact-step-hidden");
        if (contactSecond)  contactSecond.classList.remove("contact-step-hidden");
      });
    }

    function check() {
      if (isStep1Complete()) {
        reveal();
      }
    }

    // Attach listeners to pickup & drop inputs
    if (pickupEl) {
      pickupEl.addEventListener("input",  check);
      pickupEl.addEventListener("change", check);
      pickupEl.addEventListener("keyup",  check);
    }
    if (dropEl) {
      dropEl.addEventListener("input",  check);
      dropEl.addEventListener("change", check);
      dropEl.addEventListener("keyup",  check);
    }
    ["date", "time", "serviceType"].forEach(function (name) {
      var el = form.querySelector("[name='" + name + "']");
      if (el) {
        el.addEventListener("input",  check);
        el.addEventListener("change", check);
      }
    });

    // Check Fare button click should also reveal contact fields if user clicks it
    var calculateBtn = document.getElementById("calculate-fare-btn");
    if (calculateBtn) {
      calculateBtn.addEventListener("click", reveal);
    }
    var stickyBtn = document.getElementById("sticky-calculate-btn");
    if (stickyBtn) {
      stickyBtn.addEventListener("click", reveal);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
