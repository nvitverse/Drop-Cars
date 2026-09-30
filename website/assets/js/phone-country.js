/**
 * Simple country code: button shows +91; click opens +91 quick pick + empty box for e.g. +65.
 */
(function () {
  "use strict";

  var syncers = [];

  function normalizeDialCode(raw) {
    var s = (raw || "").trim();
    if (!s) return "";
    var digits = s.replace(/[^\d]/g, "");
    if (!digits) return "";
    return "+" + digits;
  }

  /** +91 → 10 national digits; other codes → max 15 */
  function nationalMaxDigits(cc) {
    var n = normalizeDialCode(cc || "+91") || "+91";
    return n === "+91" ? 10 : 15;
  }

  function sanitizeNationalInput(nationalInput, ccHidden) {
    if (!nationalInput || !ccHidden) return;
    var max = nationalMaxDigits(ccHidden.value);
    nationalInput.setAttribute("maxlength", String(max));
    var digits = (nationalInput.value || "").replace(/\D/g, "");
    if (digits.length > max) digits = digits.slice(0, max);
    if (nationalInput.value !== digits) nationalInput.value = digits;
  }

  function initNationalDigits(phoneRow) {
    var national = phoneRow.querySelector(".phone-national-input");
    var hidden = phoneRow.querySelector('.country-code-field input[type="hidden"]');
    if (!national || !hidden) return;

    national.setAttribute("inputmode", "numeric");
    national.setAttribute("pattern", "[0-9]*");
    national.setAttribute("autocomplete", "tel");

    national.addEventListener("input", function () {
      sanitizeNationalInput(national, hidden);
    });

    sanitizeNationalInput(national, hidden);

    national.addEventListener("paste", function (e) {
      e.preventDefault();
      var paste = (e.clipboardData || window.clipboardData).getData("text") || "";
      var start = national.selectionStart || 0;
      var end = national.selectionEnd || 0;
      var cur = national.value;
      var merged = cur.slice(0, start) + paste + cur.slice(end);
      var digits = merged.replace(/\D/g, "");
      var max = nationalMaxDigits(hidden.value);
      if (digits.length > max) digits = digits.slice(0, max);
      national.value = digits;
      try {
        var pos = Math.min(start + paste.replace(/\D/g, "").length, national.value.length);
        national.setSelectionRange(pos, pos);
      } catch (err) {}
    });
  }

  function initField(wrapper) {
    var trigger = wrapper.querySelector(".country-code-trigger");
    var popover = wrapper.querySelector(".country-code-popover");
    var hidden = wrapper.querySelector('input[type="hidden"]');
    var manual = wrapper.querySelector(".country-code-manual-inline");
    if (!trigger || !popover || !hidden) return;

    function setCode(code) {
      var c = normalizeDialCode(code) || "+91";
      hidden.value = c;
      trigger.textContent = c;
      var row = wrapper.closest(".phone-input-wrapper--country");
      if (row) {
        var nat = row.querySelector(".phone-national-input");
        if (nat) sanitizeNationalInput(nat, hidden);
      }
    }

    function closePopover() {
      popover.classList.add("is-hidden");
      trigger.setAttribute("aria-expanded", "false");
    }

    function openPopover() {
      popover.classList.remove("is-hidden");
      trigger.setAttribute("aria-expanded", "true");
      if (manual) {
        manual.value = "";
        setTimeout(function () {
          manual.focus();
        }, 0);
      }
    }

    function togglePopover() {
      if (popover.classList.contains("is-hidden")) {
        openPopover();
      } else {
        closePopover();
      }
    }

    function syncHidden() {
      setCode(hidden.value);
    }

    syncers.push(function () {
      setCode(hidden.value);
    });

    trigger.addEventListener("click", function (e) {
      e.stopPropagation();
      togglePopover();
    });

    wrapper.querySelectorAll(".country-code-option[data-code]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        setCode(btn.getAttribute("data-code") || "+91");
        if (manual) manual.value = "";
        closePopover();
      });
    });

    if (manual) {
      manual.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          var v = normalizeDialCode(manual.value);
          if (v.length > 1) {
            setCode(v);
          }
          closePopover();
        }
      });
      manual.addEventListener("blur", function () {
        var v = normalizeDialCode(manual.value);
        if (v.length > 1) {
          setCode(v);
        }
        closePopover();
      });
    }

    document.addEventListener("click", function (e) {
      if (!wrapper.contains(e.target)) {
        closePopover();
      }
    });

    setCode(hidden.value || wrapper.getAttribute("data-cc-default") || "+91");
  }

  function run() {
    document.querySelectorAll(".country-code-field").forEach(initField);
    document.querySelectorAll(".phone-input-wrapper--country").forEach(initNationalDigits);

    var form = document.getElementById("booking-form");
    if (form) {
      form.addEventListener("submit", function () {
        syncers.forEach(function (fn) {
          fn();
        });
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
