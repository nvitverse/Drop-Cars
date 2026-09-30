/**
 * Booking form – Suba-style estimation + confirmation flow
 * Step 1: Get Instant Fare → calculate, show fare card, send enquiry (email + Telegram)
 * Step 2: Book Drop Taxi Now → send confirmation, open WhatsApp, redirect to thank-you
 * Drop Cars – Premium intercity taxi
 */
(function () {
  "use strict";
  window.showErrorToast = function(msg, title) {
    if (!msg) return;
    var toastTitle = title || "Required Field Missing";
    var toast = document.getElementById("dropcars-error-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "dropcars-error-toast";
      toast.className = "dropcars-toast dropcars-toast--error";
      document.body.appendChild(toast);
    }
    toast.innerHTML =
      '<div style="display:flex;align-items:flex-start;gap:0.65rem;">' +
      '<span style="font-size:1.2rem;line-height:1;flex-shrink:0;">⚠️</span>' +
      '<div>' +
      '<div class="toast-title">' + toastTitle + '</div>' +
      '<div class="toast-message">' + msg + '</div>' +
      '</div>' +
      '</div>' +
      '<button type="button" class="toast-close" onclick="this.parentElement.style.opacity=\'0\';setTimeout(function(){this.parentElement.style.transform=\'translateX(-50%) translateY(-20px)\'},300);" aria-label="Close notification">&times;</button>';

    requestAnimationFrame(function() {
      toast.style.opacity = "1";
      toast.style.transform = "translateX(-50%) translateY(0)";
    });

    if (window.dropcarsToastTimer) clearTimeout(window.dropcarsToastTimer);
    window.dropcarsToastTimer = setTimeout(function() {
      if (toast) {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(-50%) translateY(-20px)";
      }
    }, 4500);
  };

  var bookingForm = document.getElementById("booking-form");
  var responseEl = document.getElementById("form-response");
  var calculateBtn = document.getElementById("calculate-fare-btn");
  var fareCard = document.getElementById("fare-card");
  var fareAmountEl = document.getElementById("fare-amount");
  var fareDistanceEl = document.getElementById("fare-distance");
  var fareDisclaimerEl = fareCard ? fareCard.querySelector(".fare-card__disclaimer") : null;
  var confirmBtn = document.getElementById("confirm-booking-btn");
  var quoteModal = document.getElementById("quote-modal");
  var quoteRouteEl = document.getElementById("quote-route");
  var quoteFareEl = document.getElementById("quote-fare");
  var quoteSummaryEl = document.getElementById("quote-summary");
  var vehicleGrid = document.getElementById("vehicle-grid");
  var quoteBackBtn = document.getElementById("quote-back");
  var quoteContinueBtn = document.getElementById("quote-continue");
  var quoteEyebrowEl = quoteModal ? quoteModal.querySelector(".eyebrow") : null;
  var quoteCtaEl = quoteModal ? quoteModal.querySelector(".quote-modal__cta") : null;
  var quoteErrorEl = document.getElementById("quote-error");

  /** Same as main.js – prefix API paths when the site is in a subdirectory. */
  function withDropCarsBase(absolutePath) {
    var b =
      typeof window.DROP_CARS_BASE_PATH === "string"
        ? window.DROP_CARS_BASE_PATH.trim()
        : "";
    if (!absolutePath || absolutePath.charAt(0) !== "/") return absolutePath;
    if (!b) return absolutePath;
    if (b.charAt(0) !== "/") b = "/" + b;
    b = b.replace(/\/$/, "");
    return b + absolutePath;
  }

  var CRM_ENDPOINT = "https://api.dropcars.in/leads";
  var ENQUIRY_API = window.location.origin + withDropCarsBase("/api/send-enquiry.php");
  var CONFIRM_API = window.location.origin + withDropCarsBase("/api/confirm_booking.php");
  var CREATE_PAYMENT_ORDER_API = window.location.origin + withDropCarsBase("/api/website-create-payment-order.php");
  var WHATSAPP = "917200217986";

  function normalizeDialCodeBooking(raw) {
    var s = (raw || "").trim();
    if (!s) return "";
    var digits = s.replace(/[^\d]/g, "");
    if (!digits) return "";
    return "+" + digits;
  }

  function isFakeOrDummyPhone(digits) {
    var d = (digits || "").replace(/\D/g, "");
    if (!d || d.length < 6) return true;

    // 1. All digits identical (e.g. 9999999999, 8888888888, 0000000000)
    if (/^(\d)\1+$/.test(d)) return true;

    // 2. Same digit repeated 6 or more times sequentially anywhere
    if (/(.)\1{5,}/.test(d)) return true;

    // 3. Mathematical sequential ascending or descending (e.g. 1234567890, 0987654321, 9876543210)
    var isAscending = true;
    var isDescending = true;
    for (var i = 1; i < d.length; i++) {
      var prev = parseInt(d.charAt(i - 1), 10);
      var curr = parseInt(d.charAt(i), 10);
      if (curr !== (prev + 1) % 10) isAscending = false;
      if (curr !== (prev + 9) % 10) isDescending = false;
    }
    if (isAscending || isDescending) return true;

    // 4. Repeated 2-digit, 3-digit, or 4-digit pattern (e.g. 1212121212, 9898989898, 1231231231, 1234123412)
    if (/^(\d{2})\1{3,}/.test(d) || /^(\d{3})\1{2,}/.test(d) || /^(\d{4})\1+/.test(d)) return true;

    // 5. Explicit dummy blacklist
    var fakeList = [
      "1234567890", "0123456789", "9876543210", "0987654321",
      "2345678901", "3456789012", "4567890123", "5678901234",
      "6789012345", "7890123456", "8901234567", "9012345678",
      "987654321",  "876543210",  "765432109",  "654321098",
      "123456789",  "234567890",  "9876543211", "1234567899"
    ];
    if (fakeList.indexOf(d) !== -1) return true;

    return false;
  }

  function nationalDigitsError(nationalStr, countryCode) {
    var digits = (nationalStr || "").replace(/\D/g, "");
    if (digits.length < 1) return "empty";
    var cc = normalizeDialCodeBooking(countryCode) || "+91";
    if (cc === "+91") {
      if (digits.length !== 10) return "india";
      if (!/^[6-9]/.test(digits)) return "invalid_prefix";
    } else if (digits.length < 6 || digits.length > 15) {
      return "intl";
    }
    if (isFakeOrDummyPhone(digits)) {
      return "fake";
    }
    return null;
  }

  /** First-seen label on #calculate-fare-btn (e.g. home "Check Fare Now" vs city "Check Route Fare"). */
  var calculateFareBtnDefaultLabel = "";
  var stickyCalculateBtn = document.getElementById("sticky-calculate-btn");

  function getCalculateFareBtnLabel() {
    if (calculateBtn && !calculateFareBtnDefaultLabel) {
      var t = (calculateBtn.textContent || "").trim();
      if (t && t !== "Calculating...") calculateFareBtnDefaultLabel = t;
    } else if (stickyCalculateBtn && !calculateFareBtnDefaultLabel) {
      var t2 = (stickyCalculateBtn.textContent || "").trim();
      if (t2 && t2 !== "Calculating...") calculateFareBtnDefaultLabel = t2;
    }
    return calculateFareBtnDefaultLabel || "Get Instant Fare";
  }

  var state = {
    autoScrollUserStopped: false,
    autoScrollListenersBound: false,
    autoScrollTimer: null,
    autoScrollRaf: null,
    isCalculating: false,
    isSubmitting: false,
    mapsDistance: 0,
    mapsDuration: "",
    mapsOrigin: "",
    mapsDestination: "",
    calculatedDistance: 0,
    estimatedFare: 0,
    discountAmount: 0,
    fareCalculated: false,
    fareOptions: {},
    appliedCoupon: null, // { code, type, value }
    lastEnquiryBookingId: "",
    pendingSelection: null,
    isGstApplied: (function() {
      // Auto-enable GST for airport_transfer, and everywhere on the
      // airport-transfer page (its Rental sub-tab flips serviceType to
      // hourly_rental, but GST still must always apply there too).
      var st = document.getElementById('service-type');
      var isAirportPg = !!document.getElementById('airport-subtype-input');
      return !!((st && st.value === 'airport_transfer') || isAirportPg);
    })(),
    termsAccepted: true,
    /** Latest border crossing list (pickup→drop, incl. stops); updated when both addresses are set. */
    borderTransitionsPreview: [],
    /** "Urgent - need taxi immediately" toggle (off by default) + the
     * Razorpay Checkout result once the 15% advance is paid. Cleared
     * whenever the toggle itself is touched so a stale payment can never be
     * replayed against a re-edited fare. */
    isUrgent: false,
    rpOrderId: "",
    rpPaymentId: "",
    rpSignature: "",
  };

  var borderSyncDebounceTimer = null;

  // GST is non-negotiable anywhere on the airport-transfer page (Outstation,
  // Local & Rental) — state.isGstApplied's initial value is computed once at
  // load, but the Rental sub-tab swaps serviceType to hourly_rental at
  // runtime, so re-force it true on every trip-type change on this page.
  document.addEventListener("dropcars:trip_type_changed", function (e) {
    if (document.getElementById("airport-subtype-input")) {
      state.isGstApplied = true;
    }
  });

  document.addEventListener("dropcars:distance_updated", function (e) {
    var d = e.detail || {};
    if (d.success === false) {
      state.mapsDistance = 0;
      state.mapsDuration = "";
      state.mapsOrigin = (d.origin || "").toString();
      state.mapsDestination = (d.destination || "").toString();
      syncBorderTransitionsFromForm();
      return;
    }
    state.mapsDistance = d.distance || 0;
    state.mapsDuration = d.duration || "";
    state.mapsOrigin = d.origin || "";
    state.mapsDestination = d.destination || "";
    syncBorderTransitionsFromForm();
    if (state.fareCalculated && !state.isCalculating) {
      handleCalculateFare(null, { silent: true, sendLead: false });
    }
  });

  function setFareLoadingUI(loading, silent) {
    if (silent) return;
    var btns = [calculateBtn, stickyCalculateBtn].filter(Boolean);
    var formCard = document.querySelector(".booking-card");
    var existingBadge = formCard ? formCard.querySelector(".inline-fare-loader-badge") : null;

    if (loading) {
      if (responseEl) {
        responseEl.textContent = "";
        responseEl.style.display = "none";
      }
      if (!existingBadge && formCard) {
        var badge = document.createElement("div");
        badge.className = "inline-fare-loader-badge";
        badge.style.cssText = "display: flex; align-items: center; justify-content: center; gap: 10px; margin: 10px 0; padding: 12px 16px; background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border: 1.5px solid #bfdbfe; border-radius: 12px; color: #0284c7; font-weight: 800; font-size: 0.85rem; box-shadow: 0 4px 12px rgba(14,165,233,0.12);";
        badge.innerHTML =
          '<span style="width: 16px; height: 16px; border: 2.5px solid #0284c7; border-top-color: transparent; border-radius: 50%; display: inline-block; animation: spin 0.8s linear infinite; flex-shrink: 0;"></span>' +
          '<span>Calculating exact route distance &amp; best fares...</span>';
        var submitWrap = formCard.querySelector(".submit-wrapper") || formCard.querySelector("form");
        if (submitWrap) {
          submitWrap.parentNode.insertBefore(badge, submitWrap);
        }
      }
      btns.forEach(function(btn) {
        btn.disabled = true;
        btn.innerHTML =
          '<span style="width: 14px; height: 14px; border: 2px solid #ffffff; border-top-color: transparent; border-radius: 50%; display: inline-block; margin-right: 8px; vertical-align: -2px; animation: spin 0.8s linear infinite;"></span>Calculating Best Fare...';
      });
    } else {
      if (existingBadge && existingBadge.parentNode) {
        existingBadge.parentNode.removeChild(existingBadge);
      }
      if (responseEl) {
        responseEl.textContent = "";
        responseEl.style.display = "";
      }
      btns.forEach(function(btn) {
        btn.innerHTML = "";
        btn.textContent = getCalculateFareBtnLabel();
        btn.disabled = false;
      });
    }
  }

  function ensureLiveDistance(pickup, drop, callback) {
    var Maps = window.DropCarsMaps;
    if (!Maps || typeof Maps.getDistance !== "function") {
      callback(new Error("Live route distance is unavailable."));
      return;
    }
    var timeoutMs = 28000;
    var tid = setTimeout(function () {
      cleanup();
      callback(new Error("Route distance timed out. Try again."));
    }, timeoutMs);
    function once(ev) {
      var detail = ev.detail || {};
      if (
        !addressesLooselyMatch(detail.origin, pickup) ||
        !addressesLooselyMatch(detail.destination, drop)
      ) {
        return;
      }
      cleanup();
      if (!detail.success) {
        callback(
          new Error(
            "Could not get live route distance. Check that pickup and drop are valid."
          )
        );
        return;
      }
      var km = Number(detail.distance) || 0;
      callback(null, km, detail.duration || "");
    }
    function cleanup() {
      clearTimeout(tid);
      document.removeEventListener("dropcars:distance_updated", once);
    }
    document.addEventListener("dropcars:distance_updated", once);
    Maps.getDistance(pickup, drop);
  }
  var submitUiCache = {
    confirmText: "",
    quoteContinueText: "",
  };

  function showFareCardConfirmingState() {
    if (!quoteModal) return;
    var card = quoteModal.querySelector('.quote-modal__card');
    if (!card) return;

    // Remove any stale overlay from a previous attempt
    var existing = card.querySelector('.fare-card-confirming');
    if (existing) existing.parentNode.removeChild(existing);

    // Overlay on top of existing fare content — fare card stays visible
    // behind a frosted-glass layer; no layout jump in swap mode.
    var overlay = document.createElement('div');
    overlay.className = 'fare-card-confirming';
    overlay.innerHTML =
      '<div class="fare-confirming-rings">' +
        '<div class="fare-confirming-ring"></div>' +
        '<div class="fare-confirming-inner"></div>' +
      '</div>' +
      '<h3 class="fare-confirming-title">Confirming your booking</h3>' +
      '<p class="fare-confirming-sub">Please hold on a moment</p>';
    card.appendChild(overlay);
  }

  function removeFareCardConfirmingState() {
    if (!quoteModal) return;
    var card = quoteModal.querySelector('.quote-modal__card');
    if (!card) return;
    var existing = card.querySelector('.fare-card-confirming');
    if (existing) existing.parentNode.removeChild(existing);
  }

  function setSubmittingUI(isSubmitting, directRedirect) {
    if (!isSubmitting) {
      removeFareCardConfirmingState();
    }
    var loadingMessage =
      '<span class="form-response__spinner" aria-hidden="true"></span> Confirming your booking, please wait...';
    if (confirmBtn) {
      if (isSubmitting) {
        submitUiCache.confirmText = submitUiCache.confirmText || confirmBtn.textContent || "Confirm Booking";
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Confirming...";
      } else {
        confirmBtn.disabled = false;
        confirmBtn.textContent = submitUiCache.confirmText || "Confirm Booking";
      }
    }
    if (quoteContinueBtn && quoteContinueBtn.getAttribute("data-action") === "confirm-fare") {
      if (isSubmitting) {
        submitUiCache.quoteContinueText = submitUiCache.quoteContinueText || quoteContinueBtn.textContent || "Confirm";
        quoteContinueBtn.disabled = true;
        quoteContinueBtn.textContent = "Confirming...";
      } else {
        quoteContinueBtn.disabled = false;
        quoteContinueBtn.textContent = submitUiCache.quoteContinueText || "Confirm";
      }
    }
    if (responseEl) {
      if (isSubmitting) {
        responseEl.classList.add("form-response--loading");
        responseEl.innerHTML = loadingMessage;
        responseEl.style.color = "#1e4b7f";
      } else if (responseEl.classList.contains("form-response--loading")) {
        responseEl.classList.remove("form-response--loading");
        if (directRedirect) responseEl.textContent = "";
      }
    }
  }

  function getSelectedFareType() {
    var checked = document.querySelector('input[name="fareType"]:checked');
    if (checked) return checked.value;
    // Fallback: check hidden input used on airport-transfer page
    var hiddenFareType = document.getElementById('fare-type-hidden');
    if (hiddenFareType && hiddenFareType.value) return hiddenFareType.value;
    return "base";
  }

  function getCurrentServiceType(fallback) {
    var allowed = {
      one_way: true,
      round_trip: true,
      multi_city: true,
      airport_transfer: true,
      hourly_rental: true,
    };
    var selected = document.getElementById("service-type");
    var value =
      (fallback || "").toString() ||
      (selected && selected.value ? selected.value.toString() : "") ||
      (bookingForm ? (new FormData(bookingForm).get("serviceType") || "").toString() : "");
    return allowed[value] ? value : "one_way";
  }

  function ensureQuoteErrorEl() {
    if (!quoteModal) return null;
    var card = quoteModal.querySelector(".quote-modal__card");
    if (!card) return null;

    var existing = card.querySelector("#quote-error");
    if (existing) {
      quoteErrorEl = existing;
      return quoteErrorEl;
    }

    quoteErrorEl = document.createElement("p");
    quoteErrorEl.id = "quote-error";
    quoteErrorEl.className = "quote-modal__error";
    quoteErrorEl.style.cssText =
      "display:none; color:#dc2626; background:#fef2f2; border:1.5px solid #fca5a5; padding:10px 14px; border-radius:10px; font-weight:700; font-size:0.86rem; margin:12px 18px 4px 18px; text-align:center; line-height:1.4;";

    var footer = card.querySelector(".drawer-footer") || card.querySelector(".quote-modal__actions");
    if (footer) {
      card.insertBefore(quoteErrorEl, footer);
    } else {
      card.appendChild(quoteErrorEl);
    }
    return quoteErrorEl;
  }

  function setQuoteError(message) {
    var msg = (message || "").toString().trim();
    var el = ensureQuoteErrorEl();
    if (!msg) {
      if (el) {
        el.textContent = "";
        el.style.display = "none";
      }
      return;
    }
    if (el) {
      el.textContent = msg;
      el.style.display = "block";
      try {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch (e) {}
    }
    if (window.showErrorToast) {
      window.showErrorToast(msg, "Required Info Needed");
    }
  }

  function stopVehicleListAutoScroll(markUser) {
    if (markUser) state.autoScrollUserStopped = true;
    if (state.autoScrollTimer) {
      clearTimeout(state.autoScrollTimer);
      state.autoScrollTimer = null;
    }
    if (state.autoScrollRaf) {
      cancelAnimationFrame(state.autoScrollRaf);
      state.autoScrollRaf = null;
    }
  }

  function startVehicleListAutoScroll() {
    if (!vehicleGrid || !quoteModal) return;
    stopVehicleListAutoScroll(false);
    state.autoScrollUserStopped = false;

    if (!quoteModal.classList.contains("quote-modal--fare-mode")) return;
    var maxScroll = Math.max(0, vehicleGrid.scrollHeight - vehicleGrid.clientHeight);
    if (maxScroll < 24) return;

    var pos = vehicleGrid.scrollTop || 0;
    var dir = 1;
    var pauseUntil = Date.now() + 1200;
    var speed = 0.35; // px/frame for smooth slow scroll

    var tick = function () {
      if (!quoteModal.classList.contains("quote-modal--open")) {
        stopVehicleListAutoScroll(false);
        return;
      }
      if (!quoteModal.classList.contains("quote-modal--fare-mode")) {
        stopVehicleListAutoScroll(false);
        return;
      }
      if (state.autoScrollUserStopped) {
        stopVehicleListAutoScroll(false);
        return;
      }
      var now = Date.now();
      if (now >= pauseUntil) {
        pos += dir * speed;
        if (pos >= maxScroll) {
          pos = maxScroll;
          dir = -1;
          pauseUntil = now + 1200;
        } else if (pos <= 0) {
          pos = 0;
          dir = 1;
          pauseUntil = now + 1200;
        }
        vehicleGrid.scrollTop = pos;
      }
      state.autoScrollRaf = requestAnimationFrame(tick);
    };

    state.autoScrollTimer = setTimeout(function () {
      state.autoScrollRaf = requestAnimationFrame(tick);
    }, 700);

    if (!state.autoScrollListenersBound) {
      var stopOnUserIntent = function () {
        stopVehicleListAutoScroll(true);
      };
      vehicleGrid.addEventListener("wheel", stopOnUserIntent, { passive: true });
      vehicleGrid.addEventListener("touchstart", stopOnUserIntent, { passive: true });
      vehicleGrid.addEventListener("pointerdown", stopOnUserIntent, { passive: true });
      state.autoScrollListenersBound = true;
    }
  }

  function setSelectedFareType(type) {
    var value = type === "inclusive" ? "inclusive" : "base";
    var radios = document.querySelectorAll('input[name="fareType"]');
    radios.forEach(function (radio) {
      radio.checked = radio.value === value;
    });
  }

  function updateFareExtrasText(fareType) {
    if (!fareDisclaimerEl) return;
    if (fareType === "inclusive") {
      fareDisclaimerEl.textContent = "Tolls, Taxes & 5% GST are Included";
      fareDisclaimerEl.style.color = "#0284c7";
      return;
    }
    fareDisclaimerEl.textContent = "Tolls, parking & State permit / border tax extra (applicable only if crossing state border).";
    fareDisclaimerEl.style.color = "#6c7f9a";
  }

  function formatTripTimeLabel(dateValue, timeValue) {
    if (!dateValue || !timeValue) return null;
    try {
      var dt = new Date(dateValue + "T" + timeValue);
      if (isNaN(dt.getTime())) return null;
      return {
        tripTime: dt.toLocaleString("en-IN", {
          weekday: "short",
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }),
        startDate: dt.toLocaleDateString("en-IN", {
          weekday: "short",
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
        time: dt.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }),
      };
    } catch (e) {
      return null;
    }
  }

  function normalizeDisplayText(text) {
    return (text || "").toString().replace(/\s+,/g, ",").replace(/\s+\|/g, " |").trim();
  }

  /** First comma-separated segment, lowercased — for matching Maps origins to typed addresses. */
  function addressPrimaryToken(addr) {
    return (addr || "")
      .toString()
      .toLowerCase()
      .split(",")[0]
      .trim()
      .replace(/\s+/g, " ");
  }

  function addressesLooselyMatch(a, b) {
    var pa = addressPrimaryToken(a);
    var pb = addressPrimaryToken(b);
    if (!pa || !pb) return false;
    if (pa === pb) return true;
    return pa.indexOf(pb) === 0 || pb.indexOf(pa) === 0;
  }

  /** When Maps duration is missing or stale, estimate from km (~55 km/h highway). */
  function formatDurationFromOneWayKm(oneWayKm) {
    var km = Math.max(0, Number(oneWayKm) || 0);
    if (km <= 0) return "";
    var rawHrs = km / 55;
    var hrs = Math.floor(rawHrs);
    var mins = Math.round((rawHrs - hrs) * 60);
    if (mins === 60) {
      hrs++;
      mins = 0;
    }
    var out = "";
    if (hrs > 0) {
      out += hrs + " hr" + (hrs === 1 ? "" : "s");
    }
    if (mins > 0) {
      if (out !== "") out += " ";
      out += mins + " min" + (mins === 1 ? "" : "s");
    }
    return out || "0 mins";
  }

  function inferStateFromLocation(locationText) {
    var text = (locationText || "").toString().toLowerCase();
    if (!text) return "";
    var knownStates = [
      "tamil nadu",
      "karnataka",
      "kerala",
      "andhra pradesh",
      "telangana",
      "puducherry",
      "pondicherry",
    ];
    for (var i = 0; i < knownStates.length; i += 1) {
      if (text.indexOf(knownStates[i]) !== -1) {
        return knownStates[i] === "pondicherry" ? "puducherry" : knownStates[i];
      }
    }
    var cityToState = {
      // Tamil Nadu
      chennai: "tamil nadu", coimbatore: "tamil nadu", madurai: "tamil nadu", trichy: "tamil nadu", 
      tiruchirappalli: "tamil nadu", vellore: "tamil nadu", salem: "tamil nadu", erode: "tamil nadu", 
      tirunelveli: "tamil nadu", thanjavur: "tamil nadu", dindigul: "tamil nadu", karur: "tamil nadu", 
      namakkal: "tamil nadu", krishnagiri: "tamil nadu", dharmapuri: "tamil nadu", cuddalore: "tamil nadu", 
      villupuram: "tamil nadu", kanchipuram: "tamil nadu", chengalpattu: "tamil nadu", thiruvallur: "tamil nadu", 
      nagapattinam: "tamil nadu", thiruvarur: "tamil nadu", ramanathapuram: "tamil nadu", sivagangai: "tamil nadu", 
      virudhunagar: "tamil nadu", thoothukudi: "tamil nadu", tenkasi: "tamil nadu", nilgiris: "tamil nadu", 
      ooty: "tamil nadu", kodaikanal: "tamil nadu", tiruppur: "tamil nadu", ariyalur: "tamil nadu", 
      pudukkottai: "tamil nadu", theni: "tamil nadu", kallakurichi: "tamil nadu", tirupattur: "tamil nadu", 
      ranipet: "tamil nadu", tiruvannamalai: "tamil nadu", kanyakumari: "tamil nadu", rameshwaram: "tamil nadu", 
      hosur: "tamil nadu", bhavani: "tamil nadu", chidambaram: "tamil nadu", perambalur: "tamil nadu", 
      velankanni: "tamil nadu", mahabalipuram: "tamil nadu",
      // Karnataka
      bangalore: "karnataka", bengaluru: "karnataka", mysore: "karnataka", mangalore: "karnataka",
      // Kerala
      kochi: "kerala", cochin: "kerala", trivandrum: "kerala", palakkad: "kerala", calicut: "kerala",
      // Andhra Pradesh
      tirupati: "andhra pradesh", chittoor: "andhra pradesh", nellore: "andhra pradesh", 
      guntur: "andhra pradesh", vijayawada: "andhra pradesh",
      // Telangana
      hyderabad: "telangana", secunderabad: "telangana",
      // Puducherry
      pondicherry: "puducherry", puducherry: "puducherry", karaikkal: "puducherry"
    };
    for (var city in cityToState) {
      if (Object.prototype.hasOwnProperty.call(cityToState, city) && text.indexOf(city) !== -1) {
        return cityToState[city];
      }
    }
    return "";
  }

  function detectBorderTransitions(pickup, drop, serviceType) {
    if (serviceType === "hourly_rental") return [];
    var points = [];
    var p = (pickup || "").toString().trim();
    var d = (drop || "").toString().trim();
    if (p) points.push(p);
    if (window.DropCarsUI && window.DropCarsUI.getStopsData) {
      var stops = window.DropCarsUI.getStopsData();
      if (Array.isArray(stops)) {
        stops.forEach(function (stop) {
          var val = (stop && stop.value ? stop.value : "").toString().trim();
          if (val) points.push(val);
        });
      }
    }
    if (d) points.push(d);

    function transitionPathBetweenStates(fromLoc, toLoc) {
      var fromState = inferStateFromLocation(fromLoc);
      var toState = inferStateFromLocation(toLoc);
      if (!fromState || !toState || fromState === toState) return [];

      var locStr = ((fromLoc || "") + "::" + (toLoc || "")).toLowerCase();
      if ((fromState === "tamil nadu" && toState === "karnataka") || (fromState === "karnataka" && toState === "tamil nadu")) {
        if (locStr.indexOf("vellore") !== -1 || locStr.indexOf("chennai") !== -1 || locStr.indexOf("kanchipuram") !== -1) {
          return [
            { from: fromState, to: "andhra pradesh", andhraBorder: true },
            { from: "andhra pradesh", to: toState, andhraBorder: true }
          ];
        }
      }

      var neighbors = {
        "tamil nadu": ["kerala", "karnataka", "andhra pradesh", "puducherry"],
        "kerala": ["tamil nadu", "karnataka"],
        "karnataka": ["tamil nadu", "kerala", "andhra pradesh", "telangana"],
        "andhra pradesh": ["tamil nadu", "karnataka", "telangana"],
        "telangana": ["andhra pradesh", "karnataka"],
        "puducherry": ["tamil nadu"],
      };
      var queue = [[fromState]];
      var visited = {};
      visited[fromState] = true;
      while (queue.length) {
        var path = queue.shift();
        var last = path[path.length - 1];
        if (last === toState) {
          var out = [];
          for (var idx = 0; idx < path.length - 1; idx += 1) {
            var from = path[idx];
            var to = path[idx + 1];
            out.push({
              from: from,
              to: to,
              andhraBorder: from === "andhra pradesh" || to === "andhra pradesh",
            });
          }
          return out;
        }
        var list = neighbors[last] || [];
        for (var j = 0; j < list.length; j += 1) {
          var next = list[j];
          if (visited[next]) continue;
          visited[next] = true;
          queue.push(path.concat(next));
        }
      }
      return [
        {
          from: fromState,
          to: toState,
          andhraBorder: fromState === "andhra pradesh" || toState === "andhra pradesh",
        },
      ];
    }

    var transitions = [];
    for (var i = 0; i < points.length - 1; i += 1) {
      transitions = transitions.concat(transitionPathBetweenStates(points[i], points[i + 1]));
    }

    if (!transitions.length) {
      if (p && d && p !== d) {
        transitions = transitions.concat(transitionPathBetweenStates(p, d));
      }
    }
    return transitions;
  }

  function uniqueBorderTransitions(borderTransitions) {
    var seen = {};
    var input = Array.isArray(borderTransitions) ? borderTransitions : [];
    var out = [];
    input.forEach(function (border) {
      var from = ((border && border.from) || "").toString().trim().toLowerCase();
      var to = ((border && border.to) || "").toString().trim().toLowerCase();
      if (!from || !to || from === to) return;
      var key = [from, to].sort().join("::");
      if (seen[key]) return;
      seen[key] = true;
      out.push({
        from: from,
        to: to,
        andhraBorder: !!(border && border.andhraBorder),
      });
    });
    return out;
  }

  /**
   * Recomputes state border crossings from the booking form as soon as pickup + drop are usable.
   * Dispatches document event `dropcars:borders_updated` with { borders, pickup, drop, serviceType }.
   */
  function syncBorderTransitionsFromForm() {
    if (!bookingForm) return;
    var fd = new FormData(bookingForm);
    var serviceType = (fd.get("serviceType") || "").toString() || "one_way";
    var pickup = (fd.get("pickup") || "").toString().trim();
    var drop = (fd.get("drop") || "").toString().trim();
    var detail = {
      borders: [],
      pickup: pickup,
      drop: drop,
      serviceType: serviceType,
    };

    if (serviceType === "hourly_rental" || pickup.length < 3 || drop.length < 3) {
      state.borderTransitionsPreview = [];
      document.dispatchEvent(new CustomEvent("dropcars:borders_updated", { detail: detail }));
      return;
    }

    detail.borders = uniqueBorderTransitions(
      detectBorderTransitions(pickup, drop, serviceType)
    );
    state.borderTransitionsPreview = detail.borders;
    document.dispatchEvent(new CustomEvent("dropcars:borders_updated", { detail: detail }));
  }

  function scheduleBorderSync() {
    if (borderSyncDebounceTimer) clearTimeout(borderSyncDebounceTimer);
    borderSyncDebounceTimer = setTimeout(function () {
      borderSyncDebounceTimer = null;
      syncBorderTransitionsFromForm();
    }, 400);
  }

  function getInclusiveAdjustment(vehicleType, distanceKm, borderTransitions, baseEstimate) {
    var km = Math.max(0, Number(distanceKm) || 0);
    var tollByDistance = Math.round(km * 2);
    var v = (vehicleType || "").toUpperCase();
    var borderBaseFees = {
      SEDAN: 500,
      SUV: 1000,
      INNOVA: 1500,
      CRYSTA: 1500,
    };
    var fee = borderBaseFees[v] || borderBaseFees.SEDAN;
    var borders = uniqueBorderTransitions(borderTransitions);
    var borderFee = borders.reduce(function (sum, border) {
      if ((v === "INNOVA" || v === "CRYSTA") && border.andhraBorder) {
        return sum + 2000;
      }
      return sum + fee;
    }, 0);
    var base = Number(baseEstimate) || 0;
    var gstAmount = Math.round(base * 0.05);
    return tollByDistance + borderFee + gstAmount;
  }

  function getAdjustedEstimate(vehicleType, baseEstimate, fareType) {
    var base = Number(baseEstimate) || 0;
    if (fareType !== "inclusive") return base;
    var distance =
      state.fareOptions && state.fareOptions.pricingDistanceHint
        ? state.fareOptions.pricingDistanceHint
        : state.fareOptions && state.fareOptions.distanceHint
          ? state.fareOptions.distanceHint
          : 0;
    var borders = (state.fareOptions && state.fareOptions.borderTransitions) || [];
    return Math.round(base + getInclusiveAdjustment(vehicleType, distance, borders, base));
  }

  // --- UTM & Google Ads Parameter Persistence via sessionStorage ---
  // Capture UTM/gclid/gad_campaignid/keyword/adgroup on first page load
  (function persistUTMOnLoad() {
    try {
      var params = new URLSearchParams(window.location.search);
      var keys = [
        "gclid", "gad_source", "gad_campaignid", "gbraid", "wbraid",
        "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
        "campaign", "campaignname", "_campaign", "_campaignname", "campaignid",
        "adgroup", "adgroupname", "_adgroup", "_adgroupname", "adgroupid",
        "keyword", "matchtype", "device", "network"
      ];
      var hasAny = false;
      keys.forEach(function(k) { if (params.get(k)) hasAny = true; });
      if (hasAny) {
        var stored = {};
        try {
          stored = JSON.parse(sessionStorage.getItem("dropcars_utm") || "{}");
        } catch(e) {}
        keys.forEach(function(k) {
          var v = params.get(k);
          if (v) stored[k] = v;
        });
        sessionStorage.setItem("dropcars_utm", JSON.stringify(stored));
      }
    } catch(e) {}
  })();

  function getUTMParams() {
    // 1. Try current URL first
    var params = new URLSearchParams(window.location.search);
    var stored = {};
    try {
      stored = JSON.parse(sessionStorage.getItem("dropcars_utm") || "{}");
    } catch (e) {}

    var gclid         = params.get("gclid")          || stored["gclid"]          || "";
    var gadSource     = params.get("gad_source")     || stored["gad_source"]     || "";
    var gadCampaignId = params.get("gad_campaignid") || stored["gad_campaignid"] || params.get("campaignid") || stored["campaignid"] || "";
    var gbraid        = params.get("gbraid")         || stored["gbraid"]         || "";
    var wbraid        = params.get("wbraid")         || stored["wbraid"]         || "";
    var utmSource     = params.get("utm_source")     || stored["utm_source"]     || "";
    var utmMedium     = params.get("utm_medium")     || stored["utm_medium"]     || "";

    // Campaign Name priority: explicit name parameter > utm_campaign > fallback to ID
    var rawCampaign = params.get("campaignname") || stored["campaignname"]
                   || params.get("_campaignname") || stored["_campaignname"]
                   || params.get("campaign") || stored["campaign"]
                   || params.get("_campaign") || stored["_campaign"]
                   || params.get("utm_campaign") || stored["utm_campaign"] || "";
    if (!rawCampaign || rawCampaign === "{_campaign}" || rawCampaign === "{_campaignname}" || rawCampaign.toLowerCase() === "none") {
      rawCampaign = gadCampaignId;
    }
    var utmCampaign = rawCampaign;

    // Ad Group Name priority: explicit name parameter > utm_content > fallback to ID
    var rawContent = params.get("adgroupname") || stored["adgroupname"]
                  || params.get("_adgroupname") || stored["_adgroupname"]
                  || params.get("adgroup") || stored["adgroup"]
                  || params.get("_adgroup") || stored["_adgroup"]
                  || params.get("utm_content") || stored["utm_content"] || "";
    if (!rawContent || rawContent === "{_adgroup}" || rawContent === "{_adgroupname}" || rawContent.toLowerCase() === "none") {
      rawContent = params.get("adgroupid") || stored["adgroupid"] || "";
    }
    var utmContent = rawContent;

    var utmTerm       = params.get("utm_term")       || stored["utm_term"]       || params.get("keyword") || stored["keyword"] || "";
    var matchtype     = params.get("matchtype")      || stored["matchtype"]      || "";
    var rawDevice     = params.get("device")         || stored["device"]         || "";
    var network       = params.get("network")        || stored["network"]        || "";

    var device = rawDevice;
    if (!device) {
      device = /Mobi/i.test(navigator.userAgent) ? "mobile" : "desktop";
    } else if (device === "m") {
      device = "mobile";
    } else if (device === "c") {
      device = "desktop";
    } else if (device === "t") {
      device = "tablet";
    }

    var source = "Organic";
    if (gclid || gadSource || gadCampaignId || gbraid || wbraid) {
      source = "Google Ads";
    } else if (utmSource === "google" && (utmMedium === "cpc" || utmMedium === "ppc" || utmMedium === "paid")) {
      source = "Google Ads";
    } else if (utmSource && (utmSource.indexOf("gads") !== -1 || utmSource.indexOf("google-ads") !== -1 || utmSource.indexOf("google_ads") !== -1)) {
      source = "Google Ads";
    } else if (utmMedium === "cpc" || utmMedium === "ppc") {
      source = "Google Ads";
    } else if (utmSource && (utmSource.indexOf("facebook") !== -1 || utmSource.indexOf("fb") !== -1)) {
      source = "Facebook Ads";
    } else if (utmSource && utmSource.indexOf("instagram") !== -1) {
      source = "Instagram";
    } else {
      source = "Organic";
    }

    return {
      source: source,
      utmSource: utmSource || (source === "Google Ads" ? "google_ads" : "organic"),
      utmMedium: utmMedium || (source === "Google Ads" ? "cpc" : "organic"),
      utmCampaign: utmCampaign,
      utmContent: utmContent,
      utmTerm: utmTerm,
      matchtype: matchtype,
      device: device,
      network: network,
      gclid: gclid,
      gadCampaignId: gadCampaignId
    };
  }

  function getDateCodeYYMMDD() {
    var now = new Date();
    var yy = String(now.getFullYear()).slice(-2);
    var mm = (now.getMonth() + 1).toString().padStart(2, "0");
    var dd = now.getDate().toString().padStart(2, "0");
    return yy + mm + dd;
  }

  function generateBookingId(prefix) {
    var kind = (prefix || "").toString().trim().toUpperCase();
    var normalized = kind === "C" ? "C" : "E";
    var dateCode = getDateCodeYYMMDD();
    var storageKey = "dropcars_booking_counter_" + normalized + "_" + dateCode;
    var count = 0;
    try {
      count = parseInt(window.localStorage.getItem(storageKey) || "0", 10) || 0;
      count += 1;
      window.localStorage.setItem(storageKey, String(count));
    } catch (e) {
      count = (Math.floor(Date.now() / 1000) % 98) + 1;
    }
    var countStr = String(count).padStart(2, "0");
    return normalized + dateCode + countStr;
  }

  function deriveConfirmationBookingId(enquiryBookingId) {
    var source = (enquiryBookingId || "").toString().trim();
    if (!source) return "";
    if (/^(?:DE|E)\d+$/i.test(source)) {
      var digits = source.replace(/^(?:DE|E)/i, "");
      return "C" + digits;
    }
    if (/^(?:DC|C)\d+$/i.test(source)) {
      var digits = source.replace(/^(?:DC|C)/i, "");
      return "C" + digits;
    }
    return "";
  }

  function updateFareDisplay(estimate, distanceKm, serviceType) {
    if (!fareCard || !fareAmountEl) return;
    fareCard.style.display = "block";
    
    var discount = state.appliedCoupon;
    var rawEstimate = state.estimatedFare; // This is the final highlighted fare
    
    // We need the original (undiscounted) fare to show the strikethrough
    var originalFare = calculateEstimateForVehicle(serviceType, state.fareOptions.pricingRouteKmOneWay, document.getElementById("vehicle-type-input").value, new FormData(bookingForm), null);
    
    if (discount && discount.value > 0) {
      fareAmountEl.innerHTML = '<span class="fare-card__old-price" style="text-decoration: line-through; opacity: 0.5; font-size: 0.8em; margin-right: 8px;">₹' + Math.round(originalFare).toLocaleString("en-IN") + '</span><span class="fare-card__highlight" style="color: #22c55e; font-weight: 950;">₹' + Math.round(rawEstimate).toLocaleString("en-IN") + '</span>';
    } else {
      fareAmountEl.textContent = "₹" + Math.round(rawEstimate || 0).toLocaleString("en-IN");
      fareAmountEl.style.color = "";
    }
    if (fareDistanceEl) {
      if (serviceType === "hourly_rental") {
        fareDistanceEl.style.display = "none";
      } else if (distanceKm > 0) {
        fareDistanceEl.textContent =
          (serviceType === "round_trip" || isAirportLocal(serviceType)
            ? "Total Round Trip: ~"
            : "Total KMs: ~") + Math.round(distanceKm) + " km";
        fareDistanceEl.style.display = "block";
      } else {
        fareDistanceEl.style.display = "none";
      }
    }
    if (confirmBtn) confirmBtn.style.display = "block";
    updateFareExtrasText(getSelectedFareType());
    updateUrgentToggleUI();
  }

  // ── "Urgent - need taxi immediately" toggle + Razorpay advance payment ──
  // Injects a single toggle row right before #confirm-booking-btn. Same DOM
  // shell everywhere the booking form appears (index.php, engine/route.php,
  // engine/city.php, pages/airport-transfer.php all share this JS file and
  // the #fare-card/#confirm-booking-btn ids), so this only needs to run once
  // per page rather than being duplicated per template.
  var urgentToggleCheckbox = null;
  var urgentToggleSubEl = null;

  function ensureUrgentToggleUI() {
    // Admin panel's manual booking flow (admin/pages/bookings-new.php) loads
    // this same script against the same #fare-card/#confirm-booking-btn ids,
    // but source=admin bookings are auto-confirmed server-side and never
    // reach confirm_booking.php's backend-posting/urgent block - showing a
    // customer-facing "pay via Razorpay" toggle there would be meaningless
    // at best and could block an admin's booking at worst.
    if (typeof window !== "undefined" && window.DROP_CARS_ADMIN_BOOKING) return;
    if (urgentToggleCheckbox || !fareCard || !confirmBtn) return;
    var row = document.createElement("div");
    row.className = "urgent-toggle-row";
    row.innerHTML =
      '<label class="urgent-toggle-label" for="urgent-toggle-checkbox">' +
      '<input type="checkbox" id="urgent-toggle-checkbox" />' +
      '<span class="urgent-toggle-switch" aria-hidden="true"></span>' +
      '<span class="urgent-toggle-text">' +
      "<strong>⚡ Need it urgently? Get it in minutes</strong>" +
      '<span class="urgent-toggle-sub" id="urgent-toggle-sub">Pay a small advance now and we’ll rush a driver to you.</span>' +
      "</span>" +
      "</label>";
    confirmBtn.parentNode.insertBefore(row, confirmBtn);
    urgentToggleCheckbox = document.getElementById("urgent-toggle-checkbox");
    urgentToggleSubEl = document.getElementById("urgent-toggle-sub");
    urgentToggleCheckbox.addEventListener("change", function () {
      state.isUrgent = urgentToggleCheckbox.checked;
      // A stale payment (if any) is void the moment the toggle is touched
      // again - never let an old rpPaymentId ride along with a re-toggle.
      state.rpOrderId = "";
      state.rpPaymentId = "";
      state.rpSignature = "";
      updateUrgentToggleUI();
    });
  }

  function urgentAdvanceAmount() {
    var fare = Math.max(0, (state.estimatedFare || 0) - (state.discountAmount || 0));
    return Math.ceil(fare * 0.15);
  }

  function updateUrgentToggleUI() {
    ensureUrgentToggleUI();
    if (!urgentToggleSubEl) return;
    var advance = urgentAdvanceAmount();
    urgentToggleSubEl.textContent =
      state.isUrgent && advance > 0
        ? "You’ll pay ₹" + advance.toLocaleString("en-IN") + " now (15% advance) via Razorpay to broadcast this as an urgent trip."
        : "Pay a small 15% advance now and we’ll rush a driver to you.";
  }

  function loadRazorpayCheckout(callback) {
    if (window.Razorpay) {
      callback();
      return;
    }
    var existing = document.getElementById("dropcars-razorpay-checkout-js");
    if (existing) {
      existing.addEventListener("load", function () { callback(); });
      existing.addEventListener("error", function () { callback(new Error("checkout-load-failed")); });
      return;
    }
    var script = document.createElement("script");
    script.id = "dropcars-razorpay-checkout-js";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = function () { callback(); };
    script.onerror = function () { callback(new Error("checkout-load-failed")); };
    document.head.appendChild(script);
  }

  /**
   * Kicks off the urgent-booking 15% advance: create-order → Razorpay
   * Checkout → stash rp_order_id/rp_payment_id/rp_signature on `state` →
   * onPaid(). Never blocks the normal (non-urgent) booking flow - on any
   * failure/cancel it just re-enables the form so the customer can retry or
   * uncheck "Urgent" and submit normally.
   */
  function startUrgentAdvancePayment(formData, advanceAmount, onPaid) {
    state.isSubmitting = true;
    setSubmittingUI(true, false);
    if (responseEl) {
      responseEl.classList.add("form-response--loading");
      responseEl.innerHTML = '<span class="form-response__spinner" aria-hidden="true"></span> Starting your urgent advance payment...';
      responseEl.style.color = "#1e4b7f";
    }

    function urgentPaymentAborted(msg) {
      state.isSubmitting = false;
      setSubmittingUI(false, false);
      if (responseEl) {
        responseEl.classList.remove("form-response--loading");
        responseEl.textContent = msg;
        responseEl.style.color = "#b42318";
      }
    }

    var pickup = (formData.get("pickup") || "").toString().trim();
    var drop = (formData.get("drop") || "").toString().trim();
    var pickupDate = (formData.get("date") || formData.get("pickupDate") || "").toString();

    fetch(CREATE_PAYMENT_ORDER_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount_rupees: advanceAmount,
        notes: { pickup: pickup, drop: drop, pickupDate: pickupDate },
      }),
    })
      .then(function (r) {
        return r.json ? r.json().catch(function () { return {}; }) : {};
      })
      .then(function (data) {
        if (!data || !data.success || !data.razorpay_order_id || !data.key_id) {
          throw new Error((data && data.message) || "Could not start the urgent advance payment.");
        }
        loadRazorpayCheckout(function (err) {
          if (err || !window.Razorpay) {
            urgentPaymentAborted("Could not load the secure payment gateway. Please try again, or uncheck ‘Urgent’ to book normally.");
            return;
          }
          var custName = (formData.get("customerName") || "").toString().trim();
          var custEmail = (formData.get("contactEmail") || "").toString().trim();
          var custPhone = (formData.get("contactPhone") || "").toString().trim();
          var rp = new window.Razorpay({
            key: data.key_id,
            order_id: data.razorpay_order_id,
            amount: data.amount_paise,
            currency: data.currency || "INR",
            name: "Drop Cars",
            description: "Urgent booking advance (15%)",
            prefill: { name: custName, email: custEmail, contact: custPhone },
            theme: { color: "#f59e0b" },
            handler: function (response) {
              state.rpOrderId = response.razorpay_order_id || "";
              state.rpPaymentId = response.razorpay_payment_id || "";
              state.rpSignature = response.razorpay_signature || "";
              state.advanceAmount = advanceAmount;
              state.isSubmitting = false;
              if (responseEl) {
                responseEl.innerHTML = '<span class="form-response__spinner" aria-hidden="true"></span> Advance received. Confirming your urgent booking...';
                responseEl.style.color = "#1e4b7f";
              }
              onPaid();
            },
            modal: {
              ondismiss: function () {
                urgentPaymentAborted("Payment cancelled. Uncheck ‘Urgent’ to book normally, or try the payment again.");
              },
            },
          });
          rp.on("payment.failed", function () {
            urgentPaymentAborted("Payment failed. Please try again, or uncheck ‘Urgent’ to book normally.");
          });
          rp.open();
        });
      })
      .catch(function (err) {
        urgentPaymentAborted((err && err.message) || "Could not start the urgent advance payment. Please try again.");
      });
  }

  function buildPayload(formData, fare, distanceHint, serviceType) {
    var contactMode = (formData.get("contactMode") || "phone").toString();
    var countryCode = (formData.get("countryCode") || "+91").toString().trim();
    var waCountryCode = (formData.get("waCountryCode") || "+91").toString().trim();
    var phoneNational = (formData.get("contactPhone") || "").toString().trim();
    var whatsappNational = (formData.get("whatsappPhone") || "").toString().trim();
    var contactValue =
      contactMode === "email"
        ? (formData.get("contactEmail") || "").toString().trim()
        : phoneNational
          ? countryCode + " " + phoneNational
          : "";
    var pickup = (formData.get("pickup") || formData.get("pickupLocation") || (document.getElementById("pickup") ? document.getElementById("pickup").value : "") || "").toString().trim();
    var drop =
      serviceType === "hourly_rental"
        ? "Local Rental"
        : (formData.get("drop") || formData.get("dropLocation") || (document.getElementById("drop") ? document.getElementById("drop").value : "") || "").toString().trim();
    var vehicleType =
      (document.getElementById("vehicle-type-input") &&
        document.getElementById("vehicle-type-input").value) ||
      "";

    var stopsList =
      window.DropCarsUI && window.DropCarsUI.getStopsData
        ? window.DropCarsUI
            .getStopsData()
            .map(function (s) {
              return (s && s.value ? s.value : "").toString().trim();
            })
            .filter(Boolean)
        : [];

    var payload = {
      bookingId: state.lastEnquiryBookingId || "",
      pickup: pickup,
      drop: drop,
      travelDate: formData.get("date") || formData.get("pickupDate") || (document.getElementById("pickup-date") ? document.getElementById("pickup-date").value : "") || (document.querySelector('input[type="date"]') ? document.querySelector('input[type="date"]').value : ""),
      travelTime: formData.get("time") || formData.get("pickupTime") || (document.getElementById("pickup-time") ? document.getElementById("pickup-time").value : "") || (document.querySelector('input[type="time"]') ? document.querySelector('input[type="time"]').value : ""),
      endDate:
        serviceType === "round_trip" || serviceType === "multi_city"
          ? formData.get("endDate") || null
          : null,
      dropTime:
        serviceType === "round_trip" || serviceType === "multi_city"
          ? formData.get("dropTime") || null
          : null,
      passengers: Number(formData.get("passengersTotal")) || 0,
      serviceType: serviceType,
      airportSubtype:
        serviceType === "airport_transfer"
          ? ((document.getElementById("airport-subtype-input") || {}).value || "outstation")
          : null,
      customerName: (formData.get("customerName") || "").toString().trim(),
      contactMode: contactMode,
      contactValue: contactValue,
      contactPhone: contactValue,
      countryCode: countryCode,
      waCountryCode: waCountryCode,
      whatsappPhone: whatsappNational
        ? waCountryCode + " " + whatsappNational
        : whatsappNational,
      contactEmail: formData.get("contactEmail") || "",
      stops: stopsList,
      hourlyPackage:
        serviceType === "hourly_rental"
          ? (document.getElementById("hourly-package") &&
              document.getElementById("hourly-package").value) ||
            null
          : null,
      hourlyPickup:
        serviceType === "hourly_rental"
          ? (formData.get("hourlyPickup") || pickup || "").toString().trim()
          : null,
      fareEstimate: fare,
      distanceHint: distanceHint,
      durationHint: state.mapsDuration || null,
      fareType: (formData.get("fareType") || "base").toString(),
      vehicleType: vehicleType,
      selectedVehicle: vehicleType || null,
      multiCityStopCharge:
        serviceType === "multi_city" ? Math.max(0, stopsList.length) * 100 : 0,
      nightAllowance: 0,
      pageUrl: window.location.href,
      pageTitle: document.title || "",
      sourcePage: window.location.pathname || "/",
      device: /Mobi/i.test(navigator.userAgent) ? "mobile" : "desktop",
    };

    var utm = getUTMParams();
    payload.source = utm.source;
    payload.utmSource = utm.utmSource;
    payload.utmMedium = utm.utmMedium;
    payload.utmCampaign = utm.utmCampaign;
    payload.utmContent = utm.utmContent;
    payload.utmTerm = utm.utmTerm;
    payload.matchtype = utm.matchtype;
    payload.device = utm.device || (/Mobi/i.test(navigator.userAgent) ? "mobile" : "desktop");
    payload.gclid = utm.gclid;
    payload.gadCampaignId = utm.gadCampaignId;

    var allEst = (state.fareOptions && state.fareOptions.estimates) || {};
    var listFareType = (formData.get("fareType") || "base").toString();
    payload.vehicleEstimates = {
      SEDAN: getAdjustedEstimate("SEDAN", allEst.SEDAN || 0, listFareType),
      SUV: getAdjustedEstimate("SUV", allEst.SUV || 0, listFareType),
      INNOVA: getAdjustedEstimate("INNOVA", allEst.INNOVA || 0, listFareType),
      CRYSTA: getAdjustedEstimate("CRYSTA", allEst.CRYSTA || 0, listFareType),
    };

    payload.fareBreakdown = buildFareBreakdownPayload(serviceType, formData);

    // Live GPS/selected coordinates for pickup, captured by
    // location-picker.js (window.DropCarsPreciseCoords) whenever a location
    // is chosen via search, GPS "Use current location", or an airport pick.
    // Lets the enquiry email include a Google Maps link to the exact pickup
    // spot instead of just the typed address text.
    var enquiryPreciseCoords = window.DropCarsPreciseCoords || {};
    if (enquiryPreciseCoords.pickup && enquiryPreciseCoords.pickup.lat && enquiryPreciseCoords.pickup.lng) {
      payload.pickupLat = enquiryPreciseCoords.pickup.lat;
      payload.pickupLng = enquiryPreciseCoords.pickup.lng;
    }

    return payload;
  }

  function buildConfirmPayload(formData, fare, distanceHint, serviceType) {
    var base = buildPayload(formData, fare, distanceHint, serviceType);
    var enquiryBookingId = state.lastEnquiryBookingId || "";
    var confirmBookingId = deriveConfirmationBookingId(enquiryBookingId);
    var data = {
      bookingId: confirmBookingId,
      enquiryBookingId: enquiryBookingId || null,
      bookingType:
        serviceType === "round_trip" || isAirportLocal(serviceType)
          ? "ROUND_TRIP"
          : serviceType === "hourly_rental"
            ? "LOCAL_PACKAGE"
            : "ONE_WAY",
      serviceType: serviceType,
      airportSubtype:
        serviceType === "airport_transfer"
          ? ((document.getElementById("airport-subtype-input") || {}).value || "outstation")
          : null,
      pickupLocation: base.pickup,
      dropLocation: base.drop,
      pickupDate: base.travelDate,
      pickupTime: base.travelTime,
      vehicleType: base.vehicleType,
      estimatedFare: base.fareEstimate,
      distance: distanceHint,
      customerName: base.customerName,
      customerPhone: base.contactMode === "phone" ? base.contactValue : "",
      customerEmail:
        (base.contactEmail || "").toString().trim() ||
        (base.contactMode === "email" ? base.contactValue : ""),
      contactMethod: base.contactMode,
      discount_amount: state.discountAmount || 0,
      final_fare: (state.estimatedFare || 0) - (state.discountAmount || 0),
      source: base.source,
      utmSource: base.utmSource,
      utmMedium: base.utmMedium,
      utmCampaign: base.utmCampaign,
      utmContent: base.utmContent,
      utmTerm: base.utmTerm,
      matchtype: base.matchtype,
      device: base.device,
      gclid: base.gclid,
      gadCampaignId: base.gadCampaignId,
      pageUrl: base.pageUrl,
      pageTitle: base.pageTitle || document.title || "",
      source_page: base.sourcePage || window.location.pathname || "/",
    };
    // Live GPS/selected coordinates for pickup & drop, captured by
    // location-picker.js (window.DropCarsPreciseCoords) whenever a location
    // is chosen via search, GPS "Use current location", or an airport pick.
    // Lets the confirmation email include a Google Maps link to the exact
    // pickup spot, which matters most for "Use current location" bookings
    // where the typed address alone may not pin the exact spot.
    var preciseCoords = window.DropCarsPreciseCoords || {};
    if (preciseCoords.pickup && preciseCoords.pickup.lat && preciseCoords.pickup.lng) {
      data.pickupLat = preciseCoords.pickup.lat;
      data.pickupLng = preciseCoords.pickup.lng;
    }
    if (preciseCoords.drop && preciseCoords.drop.lat && preciseCoords.drop.lng) {
      data.dropLat = preciseCoords.drop.lat;
      data.dropLng = preciseCoords.drop.lng;
    }
    if (serviceType === "round_trip") {
      data.endDate = base.endDate || null;
      data.dropTime = base.dropTime || null;
    }
    if (serviceType === "multi_city") {
      data.dropTime = base.dropTime || null;
      data.multiCityStopCharge = base.multiCityStopCharge || 0;
      data.nightAllowance = base.nightAllowance || 0;
    }
    var allEst =
      (state.fareOptions && state.fareOptions.estimates) || {};
    var listFareType = (formData.get("fareType") || "base").toString();
    data.vehicleEstimates = {
      SEDAN: getAdjustedEstimate("SEDAN", allEst.SEDAN || 0, listFareType),
      SUV: getAdjustedEstimate("SUV", allEst.SUV || 0, listFareType),
      INNOVA: getAdjustedEstimate("INNOVA", allEst.INNOVA || 0, listFareType),
      CRYSTA: getAdjustedEstimate("CRYSTA", allEst.CRYSTA || 0, listFareType),
    };
    data.stops = base.stops || [];
    data.fareType = (base.fareType || "base").toString();
    if (base.fareBreakdown) {
      data.fareBreakdown = base.fareBreakdown;
    }
    if (typeof window !== "undefined" && window.DROP_CARS_ADMIN_BOOKING) {
      data.source = "admin";
    }
    // "Urgent - need taxi immediately" (see startUrgentAdvancePayment above).
    // rp_order_id/rp_payment_id/rp_signature are only ever set together,
    // after a completed Razorpay Checkout - api/confirm_booking.php forwards
    // them to the backend, which re-verifies the signature server-side.
    data.isUrgent = !!state.isUrgent;
    if (state.isUrgent) {
      data.rpOrderId = state.rpOrderId || "";
      data.rpPaymentId = state.rpPaymentId || "";
      data.rpSignature = state.rpSignature || "";
      data.advanceAmount = state.advanceAmount || 0;
    }
    return { email_type: "confirmation", booking_data: data };
  }

  function validateForm(formData, serviceType) {
    var name = (formData.get("customerName") || "").toString().trim();
    var pickup = (formData.get("pickup") || "").toString().trim();
    var drop =
      serviceType !== "hourly_rental"
        ? (formData.get("drop") || "").toString().trim()
        : "";
    var contactMode = (formData.get("contactMode") || "phone").toString();
    var vehicleType =
      (document.getElementById("vehicle-type-input") &&
        document.getElementById("vehicle-type-input").value) ||
      "";

    var countryCode = (formData.get("countryCode") || "+91").toString().trim();
    var phoneNational = (formData.get("contactPhone") || "").toString().trim();
    var contactValue =
      contactMode === "email"
        ? (formData.get("contactEmail") || "").toString().trim()
        : phoneNational
          ? countryCode + " " + phoneNational
          : "";

    if (!name) return "Please enter your name.";
    if (!pickup) return "Please enter pickup location.";
    if (serviceType !== "hourly_rental" && !drop) return "Please enter drop location.";
    if (!contactValue)
      return "Please enter your " + (contactMode === "email" ? "email" : "number") + ".";
    if (contactMode === "email") {
      if (contactValue.indexOf("@") < 1) return "Please enter a valid email address.";
    }
    // Email is optional. If provided, validate format.
    var confirmEmail = (formData.get("contactEmail") || "").toString().trim();
    if (confirmEmail && confirmEmail.indexOf("@") < 1) {
      return "Please enter a valid email address.";
    }
    if (contactMode === "phone") {
      var ccDigits = countryCode.replace(/\D/g, "");
      var natDigits = phoneNational.replace(/\D/g, "");
      if (!ccDigits || countryCode.length < 2) {
        return "Please choose a country code or enter a valid code (e.g. +91).";
      }
      var phoneNatErr = nationalDigitsError(phoneNational, countryCode);
      if (phoneNatErr === "india") {
        return "Enter exactly 10 digits for Indian mobile (+91).";
      }
      if (phoneNatErr === "invalid_prefix") {
        return "Indian mobile numbers must start with 6, 7, 8, or 9.";
      }
      if (phoneNatErr === "fake") {
        return "Please enter a valid mobile number. Sequence/dummy numbers (e.g. 1234567890, 9999999999) are not allowed.";
      }
      if (phoneNatErr === "intl") {
        return "Please enter a valid phone number (6–15 digits).";
      }
      var useWaCheck = document.getElementById("use-whatsapp-check");
      if (useWaCheck && !useWaCheck.checked) {
        var waCc = (formData.get("waCountryCode") || "+91").toString().trim();
        var waNatErr = nationalDigitsError(
          (formData.get("whatsappPhone") || "").toString(),
          waCc
        );
        if (waNatErr === "empty") return "Please enter your WhatsApp number or mark the same number available also in WhatsApp.";
        if (waNatErr === "india") {
          return "Enter exactly 10 digits for WhatsApp number (+91) or mark the same number available also in WhatsApp.";
        }
        if (waNatErr === "invalid_prefix") {
          return "WhatsApp number must be a valid mobile number starting with 6, 7, 8, or 9.";
        }
        if (waNatErr === "fake") {
          return "Please enter a valid WhatsApp number. Sequence/dummy numbers are not allowed.";
        }
        if (waNatErr === "intl") {
          return "Please enter a valid WhatsApp number (6–15 digits) or mark the same number available also in WhatsApp.";
        }
      }
    }
    if (!vehicleType) return "Please select a vehicle type.";
    if (serviceType === "round_trip" || serviceType === "multi_city") {
      var endDate = (formData.get("endDate") || "").toString().trim();
      var dropTime = (formData.get("dropTime") || "").toString().trim();
      if (!endDate) return "Please enter end date for " + (serviceType === "multi_city" ? "multi city" : "round trip") + ".";
      if (!dropTime) return "Please enter drop time for " + (serviceType === "multi_city" ? "multi city" : "round trip") + ".";
    }
    return null;
  }

  function validateFareInputs(formData, serviceType) {
    var pickup = (formData.get("pickup") || formData.get("pickupLocation") || (document.getElementById("pickup") ? document.getElementById("pickup").value : "") || "").toString().trim();
    var drop =
      serviceType !== "hourly_rental"
        ? (formData.get("drop") || formData.get("dropLocation") || (document.getElementById("drop") ? document.getElementById("drop").value : "") || "").toString().trim()
        : "";
    var travelDate = (formData.get("date") || formData.get("pickupDate") || (document.getElementById("pickup-date") ? document.getElementById("pickup-date").value : "") || (document.querySelector('input[type="date"]') ? document.querySelector('input[type="date"]').value : "") || "").toString().trim();
    var travelTime = (formData.get("time") || formData.get("pickupTime") || (document.getElementById("pickup-time") ? document.getElementById("pickup-time").value : "") || (document.querySelector('input[type="time"]') ? document.querySelector('input[type="time"]').value : "") || "").toString().trim();
    var name = (formData.get("customerName") || (document.getElementById("contact-name") ? document.getElementById("contact-name").value : "") || "").toString().trim();
    var phone = (formData.get("contactPhone") || (document.getElementById("contact-phone") ? document.getElementById("contact-phone").value : "") || "").toString().trim();

    if (!pickup) return "Please enter pickup location.";
    if (serviceType !== "hourly_rental" && !drop) return "Please enter drop location.";
    if (!travelDate) return "Please select travel date.";
    if (!travelTime) return "Please select pickup time.";

    if (!name) {
      var nameEl = document.getElementById("contact-name");
      if (nameEl) {
        nameEl.focus();
        nameEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return "Please enter Passenger Name to check fare.";
    }

    if (!phone || phone.replace(/\D/g, "").length < 10) {
      var phoneEl = document.getElementById("contact-phone");
      if (phoneEl) {
        phoneEl.focus();
        phoneEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return "Please enter a valid 10-digit Phone Number to check fare.";
    }

    if (serviceType === "multi_city") {
      var multiCityDropTime = (formData.get("dropTime") || "").toString().trim();
      if (!multiCityDropTime) return "Please select return/drop time for Multi City.";
    }

    if (serviceType !== "hourly_rental") {
      if (!pickup || pickup.length < 3) return "Please select a valid pickup location.";
      if (!drop || drop.length < 3) return "Please select a valid drop location.";
    }

    return null;
  }

  function isNightTime(timeValue) {
    var t = (timeValue || "").toString().trim();
    if (!/^\d{1,2}:\d{2}$/.test(t)) return false;
    var hour = parseInt(t.split(":")[0], 10);
    if (isNaN(hour)) return false;
    return hour >= 22 || hour < 5;
  }

  /**
   * Keeps one-way / multi-city breakdown JSON self-consistent (avoids ~0 km vs billed km).
   */
  function enforceFareBreakdownInvariants(out, routeKmOneWay, kmForOneWayBreakdown) {
    if (!out || !out.tripMode) return out;
    if (out.tripMode === "hourly_rental" || out.tripMode === "round_trip") return out;
    var r = Number(routeKmOneWay);
    if (isNaN(r)) r = 0;
    var k = Number(kmForOneWayBreakdown);
    if (isNaN(k)) k = 0;
    if (k > 0 && (Number(out.actualRouteKm) || 0) <= 0) {
      out.actualRouteKm = Math.round(k * 10) / 10;
    }
    if (typeof out.routeKmMeasured !== "number") {
      out.routeKmMeasured = Math.round(r * 10) / 10;
    }
    if (r <= 0 && k > 0) {
      out.distancePending = true;
    }
    if (r > 0 && k > 0 && Math.abs(r - k) < 0.05) {
      out.distancePending = false;
    }
    return out;
  }

  function buildFareBreakdownPayload(serviceType, formData) {
    var Fare = window.DropCarsFare;
    var fo = state.fareOptions;
    if (!Fare || !fo) return null;

    var keys = ["SEDAN", "SUV", "INNOVA", "CRYSTA"];

    if (serviceType === "hourly_rental") {
      var pkg = document.getElementById("hourly-package");
      var hours = (pkg && pkg.value) || "5_hours";
      hours = parseInt(hours.replace(/_hours$/, ""), 10) || 5;
      var vehicles = {};
      keys.forEach(function (vk) {
        if (Fare.getHourlyFareBreakdown) {
          vehicles[vk] = Fare.getHourlyFareBreakdown(vk, hours);
        }
      });
      return { tripMode: "hourly_rental", hours: hours, vehicles: vehicles };
    }

    var routeKmOneWay = Number(fo.routeKmOneWay);
    if (isNaN(routeKmOneWay)) routeKmOneWay = 0;
    var pricingRouteKm = Number(fo.pricingRouteKmOneWay);
    if (isNaN(pricingRouteKm)) pricingRouteKm = 0;
    var kmForOneWayBreakdown = routeKmOneWay > 0 ? routeKmOneWay : pricingRouteKm;
    var tripKmForCalc = Number(fo.distanceHint) || 0;

    var isLocalBreakdown = isAirportLocal(serviceType);
    if (serviceType === "round_trip" || isLocalBreakdown) {
      var startDate = formData.get("date");
      var endDate = formData.get("endDate");
      var tripDays = 1;
      if (serviceType === "round_trip" && startDate && endDate) {
        var s = new Date(startDate);
        var e = new Date(endDate);
        tripDays = Math.max(1, Math.floor((e - s) / (1000 * 60 * 60 * 24)) + 1);
      }
      var rtMinOverride = isLocalBreakdown ? AIRPORT_LOCAL_MIN_KM : null;
      var vehiclesRt = {};
      keys.forEach(function (vk) {
        if (Fare.getRoundTripFareBreakdown) {
          vehiclesRt[vk] = Fare.getRoundTripFareBreakdown(tripKmForCalc, vk, tripDays, null, rtMinOverride);
        }
      });
      var rtOut = {
        tripMode: isLocalBreakdown ? "airport_local" : "round_trip",
        actualRouteKmOneWay: Math.round(routeKmOneWay * 10) / 10,
        totalRoundTripKmUsed: Math.round(tripKmForCalc * 10) / 10,
        tripDays: tripDays,
        vehicles: vehiclesRt,
        borderTransitions: uniqueBorderTransitions(fo.borderTransitions || []),
        fareType: getSelectedFareType(),
      };
      if (routeKmOneWay <= 0 && tripKmForCalc > 0 && tripDays === 1) {
        rtOut.actualRouteKmOneWay = Math.round((tripKmForCalc / 2) * 10) / 10;
        rtOut.distancePending = true;
        rtOut.routeKmMeasured = 0;
      }
      return rtOut;
    }

    var vehiclesOw = {};
    keys.forEach(function (vk) {
      if (Fare.getOneWayFareBreakdown) {
        var b = Fare.getOneWayFareBreakdown(kmForOneWayBreakdown, vk);
        if (serviceType === "multi_city" && b) {
          var extras = getMultiCityExtraCharges(formData);
          b.multiCityStopCharge = extras.stopCharge;
          b.multiCityNightAllowance = extras.nightAllowance;
          b.totalFare = Math.round((Number(b.totalFare) || 0) + extras.total);
        }
        vehiclesOw[vk] = b;
      }
    });
    var out = {
      tripMode: serviceType === "multi_city" ? "multi_city" : "one_way",
      // Raw Matrix/GPS km (0 = unknown) — do not use alone for display; see actualRouteKm below
      routeKmMeasured: Math.round(routeKmOneWay * 10) / 10,
      // Distance used for fare line (same as kmForOneWayBreakdown) so the summary row never shows ~0 when billing uses an estimate/min
      actualRouteKm: Math.round(kmForOneWayBreakdown * 10) / 10,
      distancePending:
        routeKmOneWay <= 0 && pricingRouteKm > 0 ? true : false,
      vehicles: vehiclesOw,
      borderTransitions: uniqueBorderTransitions(fo.borderTransitions || []),
      fareType: getSelectedFareType(),
    };
    if (serviceType === "multi_city") {
      out.multiCityExtras = getMultiCityExtraCharges(formData);
    }
    return enforceFareBreakdownInvariants(out, routeKmOneWay, kmForOneWayBreakdown);
  }
  function getMultiCityExtraCharges(formData) {
    var stopCharge = 0;
    var stopsData = (window.DropCarsUI && window.DropCarsUI.getStopsData) ? window.DropCarsUI.getStopsData() : [];
    if (stopsData.length > 0) {
      stopCharge = stopsData.length * 300;
    }
    var nightAllowance = 0;
    if (isNightTime(formData.get("time"))) {
      nightAllowance = 300;
    }
    return {
      stopCharge: stopCharge,
      nightAllowance: nightAllowance,
      total: stopCharge + nightAllowance,
    };
  }

  /** Airport-transfer "Local" trips are billed round-trip style (pickup →
   *  drop → back to pickup, like Round Trip) with a 20km floor instead of
   *  the Round Trip service's 250km/day minimum. */
  function isAirportLocal(serviceType) {
    if (serviceType !== "airport_transfer") return false;
    var el = document.getElementById("airport-subtype-input");
    return !!(el && el.value === "local");
  }
  var AIRPORT_LOCAL_MIN_KM = 20;

  function calculateEstimateForVehicle(serviceType, distanceHint, vehicleType, formData, discount) {
    var Fare = window.DropCarsFare;
    if (serviceType === "hourly_rental") {
      var pkg = document.getElementById("hourly-package");
      var hours = (pkg && pkg.value) || "5_hours";
      hours = parseInt(hours.replace(/_hours$/, ""), 10) || 5;
      return Fare && Fare.calculateFareHourly
        ? Fare.calculateFareHourly(vehicleType, hours, discount)
        : 2500;
    }
    if (serviceType === "round_trip" || isAirportLocal(serviceType)) {
      var startDate = formData.get("date");
      var endDate = formData.get("endDate");
      var tripDays = 1;
      if (serviceType === "round_trip" && startDate && endDate) {
        var s = new Date(startDate);
        var e = new Date(endDate);
        tripDays = Math.max(1, Math.floor((e - s) / (1000 * 60 * 60 * 24)) + 1);
      }
      var rtMinOverride = isAirportLocal(serviceType) ? AIRPORT_LOCAL_MIN_KM : null;
      return Fare && Fare.calculateFareRoundTrip
        ? Fare.calculateFareRoundTrip(distanceHint * 2, vehicleType, tripDays, discount, rtMinOverride)
        : 0;
    }
    var oneWayEstimate =
      Fare && Fare.calculateFareOneWay
      ? Fare.calculateFareOneWay(distanceHint, vehicleType, discount)
      : 0;
    if (serviceType === "multi_city") {
      var extras = getMultiCityExtraCharges(formData);
      return Math.round((Number(oneWayEstimate) || 0) + extras.total);
    }
    return oneWayEstimate;
  }

  function renderDrawerContent(activeVehicle, fareType, options) {
    if (!quoteModal) return;
    options = options || {};
    var serviceType = getCurrentServiceType(options.serviceType);
    options.serviceType = serviceType;
    
    var Fare = window.DropCarsFare;
    if (!Fare || !Fare.VEHICLE_OPTIONS) return;
    
    var currentVehicle = (activeVehicle || "SEDAN").toUpperCase();
    var isInclusive = fareType === "inclusive";
    
    var baseEstimate = Number(options.estimates[currentVehicle] || 0);
    var estimate = getAdjustedEstimate(currentVehicle, baseEstimate, fareType);
    var discount = (state.discountAmount || 0);
    
    // Load GST config
    var cfg = window.DROP_CARS_CONFIG;
    var pricingRules = (cfg && cfg.pricingRules) || {};
    var gstPercent = Number(pricingRules.gstPercent || 5.00);
    var gstNumber = pricingRules.gstNumber || "";
    
    // GST Calculation
    var gstAmount = 0;
    if (state.isGstApplied) {
      gstAmount = Math.round(baseEstimate * (gstPercent / 100));
    }
    
    var finalEst = Math.round(estimate + gstAmount - discount);
    
    var distanceText =
      options.distanceHint && Number(options.distanceHint) > 0
        ? Number(options.distanceHint).toFixed(1) + " KM"
        : "N/A";
        
    var tripDateLine = "";
    if (options.tripTime && options.tripTime.startDate && options.tripTime.time) {
      tripDateLine = options.tripTime.startDate + " | " + options.tripTime.time;
    } else {
      var dInput = document.querySelector('input[name="date"]');
      var tInput = document.querySelector('input[name="time"]');
      if (dInput && dInput.value && tInput && tInput.value) {
        tripDateLine = dInput.value + " | " + tInput.value;
      }
    }
    
    var isRoundTrip = serviceType === "round_trip";
    var isLocal = isAirportLocal(serviceType);
    var isRoundTripStyle = isRoundTrip || isLocal;
    var isAirportPage = !!document.getElementById("airport-subtype-input");
    var oldFare = isRoundTripStyle
      ? Fare.calculateOldFareRoundTrip(options.distanceHint, currentVehicle, options.tripDays, isLocal ? AIRPORT_LOCAL_MIN_KM : null)
      : Fare.calculateOldFareOneWay(options.distanceHint, currentVehicle);
      
    var displayPrice = "";
    if (discount > 0) {
      displayPrice = '<span class="strikethrough-fare">₹' + (estimate + gstAmount).toLocaleString("en-IN") + '</span>₹' + finalEst.toLocaleString("en-IN");
    } else if (oldFare > 0 && oldFare > (estimate + gstAmount)) {
      displayPrice = '<span class="strikethrough-fare">₹' + oldFare.toLocaleString("en-IN") + '</span>₹' + (estimate + gstAmount).toLocaleString("en-IN");
    } else {
      displayPrice = '₹' + (estimate + gstAmount).toLocaleString("en-IN");
    }
 
    var imageMap = {
      SEDAN: "/assets/img/vehicles/Dzire.png",
      SUV: "/assets/img/vehicles/Suv.png",
      INNOVA: "/assets/img/vehicles/Innova.png",
      CRYSTA: "/assets/img/vehicles/innova-crysta.png",
    };
 
    var tabsHtml = Fare.VEHICLE_OPTIONS.map(function (v) {
      var key = (v.id || "").toUpperCase();
      var activeClass = key === currentVehicle ? "active" : "";
      var baseEst = Number(options.estimates[key] || 0);
      var estForTab = getAdjustedEstimate(key, baseEst, fareType);
      var gstForTab = state.isGstApplied ? Math.round(baseEst * (gstPercent / 100)) : 0;
      var finalEstForTab = Math.round(estForTab + gstForTab - discount);
      
      return (
        '<div class="drawer-vehicle-tab ' + activeClass + '" data-vehicle="' + key + '" role="tab" aria-selected="' + (key === currentVehicle ? "true" : "false") + '">' +
        '<img src="' + (imageMap[key] || v.image) + '" alt="' + v.name + '" />' +
        '<span class="drawer-vehicle-tab__name">' + v.name + '</span>' +
        '<span class="drawer-vehicle-tab__price">₹' + finalEstForTab.toLocaleString("en-IN") + '</span>' +
        '</div>'
      );
    }).join("");
 
    // Get min distance & per-km rate for km limit info
    var cfg2 = window.DROP_CARS_CONFIG;
    var pRules = (cfg2 && cfg2.pricingRules) || {};
    var fares2 = (cfg2 && cfg2.fares) || {};
    var rateMap = { SEDAN: 15, SUV: 20, INNOVA: 20, CRYSTA: 24 };
    var bataMap  = { SEDAN: 400, SUV: 500, INNOVA: 500, CRYSTA: 500 };
    // Local is billed round-trip style (pickup → drop → back to pickup), so
    // its per-km rate/bata come from the round-trip rate card, not one-way.
    var rateSource = isLocal ? fares2.baseFareRoundTrip : fares2.baseFareOneWay;
    var bataSource = isLocal ? fares2.bataRoundTrip : fares2.bataOneWay;
    if (rateSource) {
      Object.keys(rateSource).forEach(function(k) { rateMap[k] = rateSource[k]; });
    }
    if (bataSource) {
      Object.keys(bataSource).forEach(function(k) { bataMap[k] = bataSource[k]; });
    }
    var minKmOneWay    = fares2.minDistanceOneWay || 130;
    var minKmPerDay    = fares2.minDistanceRoundTripPerDay || 250;
    var ratePerKm      = rateMap[currentVehicle] || 15;

    var actualOneWayKm = Math.round(options.routeKmOneWay || options.distanceHint || 0);
    var actualTripKm   = isRoundTripStyle ? actualOneWayKm * 2 : actualOneWayKm;

    var kmInclusionText = "";
    var extraKmLimit    = minKmOneWay;

    if (isRoundTripStyle) {
      var days = 1;
      if (isRoundTrip && options.startDate && options.endDate) {
        var d1 = new Date(options.startDate);
        var d2 = new Date(options.endDate);
        var diff = Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24));
        if (diff > 0) days = diff;
      }
      var minRoundKm = isLocal ? AIRPORT_LOCAL_MIN_KM : minKmPerDay * days;
      if (actualTripKm > minRoundKm) {
        kmInclusionText = actualTripKm + " km round-trip distance included";
        extraKmLimit = actualTripKm;
      } else {
        kmInclusionText = isLocal
          ? (minRoundKm + " km minimum (round-trip) distance included")
          : (minRoundKm + " km (" + minKmPerDay + " km/day) minimum distance included");
        extraKmLimit = minRoundKm;
      }
    } else if (serviceType !== "hourly_rental") {
      if (actualOneWayKm > minKmOneWay) {
        kmInclusionText = actualOneWayKm + " km distance included";
        extraKmLimit = actualOneWayKm;
      } else {
        kmInclusionText = minKmOneWay + " km minimum distance included";
        extraKmLimit = minKmOneWay;
      }
    }

    var inclusionsList = [];
    if (kmInclusionText) {
      inclusionsList.push(kmInclusionText);
    }
    inclusionsList.push("Air-conditioned vehicle with driver");
    inclusionsList.push("Base fare and fuel charges");
    inclusionsList.push("Driver allowance (bata)");
    if (serviceType === "multi_city") {
      inclusionsList.push("Intermediate stop charges included");
    }
    if (isInclusive) {
      inclusionsList.push("Toll charges included");
      inclusionsList.push("State border tax included (if crossing state border)");
    }
    if (state.isGstApplied) {
      inclusionsList.push(gstPercent + "% GST included" + (gstNumber ? " (GSTIN: " + gstNumber + ")" : ""));
    }
    inclusionsList.push("24/7 customer support");
 
    var inclusionsHtml = inclusionsList.map(function(item) {
      return '<li class="drawer-list-item drawer-list-item--inc"><span class="icon">✓</span>' + item + '</li>';
    }).join("");
 
    var exclusionsList = [];
    if (!isInclusive) {
      exclusionsList.push("Toll charges, as applicable");
      exclusionsList.push("State border tax (applicable only if crossing state border)");
    }

    // Always show extra km charge (Rental has its own extra-hour/km lines below)
    if (serviceType !== "hourly_rental") {
      exclusionsList.push("Extra km beyond " + extraKmLimit + " km charged at ₹" + ratePerKm + "/km");
    }

    // Dynamic Exclusions
    if (serviceType === "round_trip") {
      exclusionsList.push("Night allowance (after 10 PM), if applicable");
    } else if (serviceType === "hourly_rental") {
      // Rental waiting/extra time & km is billed at the same hourly package
      // tariff, not a flat fee — e.g. Sedan @ ₹300/hr → extra hour ₹300,
      // extra km ₹30 (hourly rate ÷ 10).
      var hourlyCfg = (cfg && cfg.fares && cfg.fares.hourlyRates) || {};
      var hourlyRateForVehicle = hourlyCfg[currentVehicle] || 0;
      if (hourlyRateForVehicle > 0) {
        exclusionsList.push("Extra hour beyond package charged at ₹" + hourlyRateForVehicle + "/hr");
        exclusionsList.push("Extra km beyond package charged at ₹" + Math.round(hourlyRateForVehicle / 10) + "/km (as per hourly tariff)");
      }
    } else if (isLocal) {
      // Local drop waiting charges = 10× the per-km rate (excl. GST), not the
      // flat outstation ₹150/stop/hour fee.
      exclusionsList.push("Waiting charges beyond 15 mins at ₹" + Math.round(ratePerKm * 10) + "/hour (10× per-km rate, excl. GST), if availed");
    } else {
      exclusionsList.push("Waiting or additional stop charges (₹150 per stop/hour), if availed");
    }
 
    var exclusionsHtml = exclusionsList.map(function(item) {
      return '<li class="drawer-list-item drawer-list-item--exc"><span class="icon">✕</span>' + item + '</li>';
    }).join("");
 
    var couponHtml = "";
    if (state.appliedCoupon) {
      couponHtml = 
        '<div class="drawer-coupon-applied">' +
        '<span style="font-size: 1.1rem; line-height: 1;">🎉</span>' +
        '<span>Coupon <strong>' + state.appliedCoupon.code + '</strong> applied! Saved ₹' + discount + ' discount.</span>' +
        '</div>';
    }
 
    var tripTypeLabels = {
      one_way: "One-Way Trip",
      round_trip: "Round Trip",
      multi_city: "Multi City Trip",
      airport_transfer: "Airport Transfer",
      hourly_rental: "Local Rental"
    };
    var tripTypeTitle = "Book Your " + (tripTypeLabels[serviceType] || "One-Way Trip");

    var cardHtml =
      '<style>' +
      '  .drawer-vehicle-tabs {' +
      '    touch-action: pan-x pan-y !important;' +
      '  }' +
      '  .drawer-footer-responsive {' +
      '    display: flex !important;' +
      '    flex-wrap: wrap !important;' +
      '    align-items: center !important;' +
      '    justify-content: space-between !important;' +
      '    gap: 8px !important;' +
      '    width: 100% !important;' +
      '    box-sizing: border-box !important;' +
      '    background: transparent !important;' +
      '    border-top: 1.5px solid #f1f5f9 !important;' +
      '    padding: 12px 18px 24px 18px !important;' +
      '    margin: 0 !important;' +
      '  }' +
      '  .booking-card__fare-panel .drawer-footer-responsive {' +
      '    background: transparent !important;' +
      '    margin: 16px 0 0 0 !important;' +
      '    padding: 16px 14px 24px 14px !important;' +
      '    border-bottom-left-radius: 0 !important;' +
      '    border-bottom-right-radius: 0 !important;' +
      '    width: 100% !important;' +
      '  }' +
      '  .drawer-footer-responsive .drawer-footer-price {' +
      '    display: flex !important;' +
      '    flex-direction: column !important;' +
      '    align-items: flex-start !important;' +
      '    justify-content: center !important;' +
      '    flex-shrink: 0 !important;' +
      '    width: auto !important;' +
      '    margin: 0 !important;' +
      '    padding: 0 !important;' +
      '    line-height: 1.2 !important;' +
      '  }' +
      '  .drawer-footer-responsive .price-label {' +
      '    font-size: 0.68rem !important;' +
      '    font-weight: 700 !important;' +
      '    color: #64748b !important;' +
      '    text-transform: uppercase !important;' +
      '    letter-spacing: 0.04em !important;' +
      '    line-height: 1.2 !important;' +
      '  }' +
      '  .drawer-footer-responsive .price-value {' +
      '    font-size: 1.4rem !important;' +
      '    font-weight: 850 !important;' +
      '    color: #1e3a8a !important;' +
      '    line-height: 1.1 !important;' +
      '    margin-top: 2px !important;' +
      '  }' +
      '  .drawer-footer-responsive .btn-outline {' +
      '    flex: 0 0 auto !important;' +
      '    width: 64px !important;' +
      '    min-width: 64px !important;' +
      '    max-width: 68px !important;' +
      '    padding: 8px 4px !important;' +
      '    font-size: 0.78rem !important;' +
      '    line-height: 1.2 !important;' +
      '  }' +
      '  .drawer-footer-responsive .btn-primary {' +
      '    flex: 1 1 90px !important;' +
      '    min-width: 90px !important;' +
      '    padding: 12px 8px !important;' +
      '    font-size: 0.82rem !important;' +
      '    line-height: 1.2 !important;' +
      '    text-align: center !important;' +
      '    white-space: normal !important;' +
      '    word-break: keep-all !important;' +
      '  }' +
      '  .drawer-login-offers {' +
      '    padding: 10px 18px 0 18px !important;' +
      '    text-align: center !important;' +
      '    background: transparent !important;' +
      '    border-top: 1px solid #eef2f7 !important;' +
      '  }' +
      '  .drawer-login-offers a {' +
      '    color: #0284c7 !important;' +
      '    font-weight: 800 !important;' +
      '    font-size: 0.88rem !important;' +
      '    text-decoration: underline !important;' +
      '    line-height: 1.3 !important;' +
      '  }' +
      '  @media (max-width: 350px) {' +
      '    .drawer-footer-responsive {' +
      '      flex-direction: column !important;' +
      '      align-items: stretch !important;' +
      '      gap: 10px !important;' +
      '      padding: 12px 16px 24px 16px !important;' +
      '    }' +
      '    .booking-card__fare-panel .drawer-footer-responsive {' +
      '      padding: 16px 14px 24px 14px !important;' +
      '      margin: 16px 0 0 0 !important;' +
      '    }' +
      '    .drawer-footer-responsive .drawer-footer-price {' +
      '      flex-direction: row !important;' +
      '      justify-content: space-between !important;' +
      '      align-items: center !important;' +
      '      width: 100% !important;' +
      '      margin-bottom: 4px !important;' +
      '      display: flex !important;' +
      '    }' +
      '    .drawer-footer-responsive .price-label {' +
      '      font-size: 0.75rem !important;' +
      '    }' +
      '    .drawer-footer-responsive .price-value {' +
      '      font-size: 1.5rem !important;' +
      '      margin-top: 0 !important;' +
      '    }' +
      '    .drawer-footer-responsive .btn-primary {' +
      '      order: 1 !important;' +
      '      width: 100% !important;' +
      '      max-width: none !important;' +
      '      min-width: 0 !important;' +
      '      flex: none !important;' +
      '    }' +
      '    .drawer-footer-responsive .btn-outline {' +
      '      order: 2 !important;' +
      '      width: 64px !important;' +
      '      min-width: 64px !important;' +
      '      max-width: 68px !important;' +
      '      padding: 8px 4px !important;' +
      '      font-size: 0.78rem !important;' +
      '      margin: 4px auto 0 !important;' +
      '      display: inline-block !important;' +
      '      text-align: center !important;' +
      '      line-height: 1.2 !important;' +
      '    }' +
      '  }' +
      '</style>' +
      '<div class="drawer-header">' +
      '<h3 class="drawer-header__title">' + tripTypeTitle + '</h3>' +
      '</div>' +
      
      '<div class="drawer-body">' +
      
      '<div class="drawer-vehicle-tabs" role="tablist">' +
      tabsHtml +
      '</div>' +
      
      // Airport-transfer page (any sub-tab): hide toggles, show a locked
      // badge instead — GST always applies here, and Outstation/Local also
      // always include toll & state tax (Rental never does, tolls are extra).
      // Hourly Rental on any OTHER page: tolls are still never includable
      // (no toggle for it), but GST stays user-optional there.
      (isAirportPage
        ? '<div class="drawer-toggles-container" style="justify-content:center;">' +
          '<div style="display:inline-flex;align-items:center;gap:8px;background:linear-gradient(90deg,#0ea5e9,#0284c7);color:#fff;font-weight:700;font-size:0.82rem;border-radius:20px;padding:7px 18px;letter-spacing:0.02em;">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0"><path d="M5 12l5 5L20 7"/></svg>' +
          (serviceType === 'hourly_rental'
            ? gstPercent + '% GST Included &bull; Tolls &amp; Parking Extra'
            : 'All-Inclusive: Toll, State Tax &amp; GST included') +
          '</div></div>'
        : serviceType === 'hourly_rental'
        ? '<div class="drawer-toggles-container" style="justify-content:center;">' +
          '<label class="drawer-switch-control">' +
          '<input type="checkbox" id="drawer-gst-toggle" ' + (state.isGstApplied ? "checked" : "") + ' />' +
          '<span class="drawer-switch-knob"></span>' +
          '<span class="drawer-switch-label">Add ' + gstPercent + '% GST</span>' +
          '</label>' +
          '<span style="font-size:0.76rem;color:#94a3b8;font-weight:600;">Tolls &amp; parking always extra</span>' +
          '</div>'
        : '<div class="drawer-toggles-container">' +
          '<label class="drawer-switch-control">' +
          '<input type="checkbox" id="drawer-fare-inclusive-toggle" ' + (isInclusive ? "checked" : "") + ' />' +
          '<span class="drawer-switch-knob"></span>' +
          '<span class="drawer-switch-label">Includes Toll &amp; Tax</span>' +
          '</label>' +
          '<label class="drawer-switch-control">' +
          '<input type="checkbox" id="drawer-gst-toggle" ' + (state.isGstApplied ? "checked" : "") + ' />' +
          '<span class="drawer-switch-knob"></span>' +
          '<span class="drawer-switch-label">Add ' + gstPercent + '% GST</span>' +
          '</label>' +
          '</div>'
      ) +
      
      '<div class="drawer-timeline">' +
      '<div class="drawer-timeline-step">' +
      '<span class="drawer-timeline-icon drawer-timeline-icon--pickup"></span>' +
      '<div class="drawer-timeline-details">' +
      '<span class="drawer-timeline-label">Pickup Location</span>' +
      '<span class="drawer-timeline-value">' + normalizeDisplayText(options.pickup) + '</span>' +
      '</div>' +
      '</div>' +
      (Array.isArray(options.stops) && options.stops.length > 0
        ? options.stops.map(function(stopVal, si) {
            return '<div class="drawer-timeline-step">' +
              '<span class="drawer-timeline-icon drawer-timeline-icon--stop"></span>' +
              '<div class="drawer-timeline-details">' +
              '<span class="drawer-timeline-label">Stop ' + (si + 1) + '</span>' +
              '<span class="drawer-timeline-value">' + normalizeDisplayText(stopVal) + '</span>' +
              '</div>' +
              '</div>';
          }).join('')
        : '') +
      '<div class="drawer-timeline-step">' +
      '<span class="drawer-timeline-icon drawer-timeline-icon--drop"></span>' +
      '<div class="drawer-timeline-details">' +
      '<span class="drawer-timeline-label">Drop Location</span>' +
      '<span class="drawer-timeline-value">' + normalizeDisplayText(options.drop) + '</span>' +
      '</div>' +
      '</div>' +
      '</div>' +
      
      couponHtml +
      
      '<div class="drawer-inc-exc-container">' +

      '<details class="drawer-acc">' +
      '<summary class="drawer-acc__head"><span class="drawer-acc__label" style="color:#16a34a;">Inclusions</span><span class="drawer-acc__chev" aria-hidden="true"></span></summary>' +
      '<ul class="drawer-list">' +
      inclusionsHtml +
      '</ul>' +
      '</details>' +

      '<details class="drawer-acc">' +
      '<summary class="drawer-acc__head"><span class="drawer-acc__label" style="color:#ea580c;">Exclusions</span><span class="drawer-acc__chev" aria-hidden="true"></span></summary>' +
      '<ul class="drawer-list">' +
      exclusionsHtml +
      '</ul>' +
      '</details>' +

      '</div>' +

      (function() {
        var reasoningHtml = "";
        var cfg = window.DROP_CARS_CONFIG;
        if (cfg && cfg.fares && cfg.fares.reasoningNotes) {
          var note = cfg.fares.reasoningNotes[currentVehicle];
          if (note) {
            reasoningHtml = '<div class="selected-fare-card__reasoning-note" style="display:inline-flex; align-items:center; gap:6px; font-size:0.78rem; font-weight:700; color:#c2410c; background:#fff7ed; border:1px solid #ffedd5; border-radius:10px; padding:6px 12px; margin-bottom:20px; line-height:1.35;"><i class="fa-solid fa-bolt" style="font-size:0.7rem;"></i> ' + note + '</div>';
          }
        }
        return reasoningHtml;
      })() +
      
      '</div>' +

      (function() {
        var currentEmail = "";
        if (bookingForm) {
          var emailEl = bookingForm.querySelector('input[name="contactEmail"]');
          if (emailEl && emailEl.value) {
            currentEmail = emailEl.value.trim();
          }
        }
        if (!currentEmail) {
          return '<div class="drawer-contact-fields" style="padding: 10px 18px 6px 18px; text-align: left;">' +
            '<label for="drawer-email-input" style="display:block; font-size:0.8rem; font-weight:700; color:#1e293b; margin-bottom:5px;">' +
            '📧 Email Address <span style="font-weight:500; color:#64748b;">(Optional — for trip &amp; driver updates)</span>' +
            '</label>' +
            '<input type="email" id="drawer-email-input" placeholder="e.g. name@example.com (Optional)" value="" style="width:100%; padding:10px 14px; border:1.5px solid #cbd5e1; border-radius:10px; font-size:0.9rem; box-sizing:border-box; background:#f8fafc;" />' +
            '</div>';
        }
        return '';
      })() +
      
      '<div class="drawer-policies">' +
      '<label class="drawer-terms-agreement">' +
      '<input type="checkbox" id="drawer-terms-checkbox" ' + (state.termsAccepted !== false ? "checked" : "") + ' />' +
      '<span>I accept the <a href="/pages/terms.html" target="_blank" rel="noopener">Terms &amp; Conditions</a> &amp; <a href="/pages/refund-policy.html" target="_blank" rel="noopener">Refund Policy</a></span>' +
      '</label>' +
      '</div>' +

      '<div class="drawer-login-offers">' +
      '<a href="/pages/customer-login.php">Login to access Coupon Codes &amp; Offers</a>' +
      '</div>' +
      
      '<div class="drawer-footer drawer-footer-responsive">' +
      '<button type="button" class="btn-outline" id="drawer-back-btn">Back</button>' +
      '<button type="button" class="btn-primary" id="drawer-confirm-btn" style="flex:1; display:inline-flex; align-items:center; justify-content:center; gap:8px;">Confirm Booking <span class="confirm-btn-price-badge" style="background:#ffffff; color:#1e3a8a; padding:3px 10px; border-radius:20px; font-weight:900; font-size:0.92rem; box-shadow: 0 2px 6px rgba(0,0,0,0.15); font-family:var(--font-heading, sans-serif);">' + displayPrice + '</span></button>' +
      '</div>';
 
    var cardContainer = quoteModal.querySelector(".quote-modal__card");
    if (cardContainer) {
      cardContainer.innerHTML = cardHtml;
      var drawerTabs = cardContainer.querySelector(".drawer-vehicle-tabs");
      if (drawerTabs && typeof window.makeDragScrollable === "function") {
        window.makeDragScrollable(drawerTabs);
      }
    }
 
    state.pendingSelection = {
      vehicleType: currentVehicle,
      baseEstimate: baseEstimate,
      estimate: estimate,
      discountAmount: discount,
      finalFare: finalEst,
      distanceHint: options.distanceHint || 0,
      serviceType: serviceType,
      gstApplied: state.isGstApplied ? 1 : 0,
      gstPercent: gstPercent,
      gstAmount: gstAmount
    };
 
    var closeTrigger = document.getElementById("drawer-close-trigger");
    if (closeTrigger) {
      closeTrigger.addEventListener("click", closeQuoteModal);
    }
    var backBtn = document.getElementById("drawer-back-btn");
    if (backBtn) {
      backBtn.addEventListener("click", closeQuoteModal);
    }
    
    var confirmBtn = document.getElementById("drawer-confirm-btn");
    if (confirmBtn) {
      confirmBtn.addEventListener("click", function (e) {
        e.preventDefault();
        
        var drawerEmailInput = document.getElementById("drawer-email-input");
        if (drawerEmailInput) {
          var val = drawerEmailInput.value.trim();
          if (val && val.indexOf("@") < 1) {
            setQuoteError("Please enter a valid email address or leave it blank.");
            drawerEmailInput.focus();
            drawerEmailInput.style.borderColor = "#ef4444";
            return;
          }
          drawerEmailInput.style.borderColor = "#cbd5e1";
          if (bookingForm) {
            var formEmailInput = bookingForm.querySelector('input[name="contactEmail"]');
            if (!formEmailInput) {
              formEmailInput = document.createElement("input");
              formEmailInput.type = "hidden";
              formEmailInput.name = "contactEmail";
              bookingForm.appendChild(formEmailInput);
            }
            formEmailInput.value = val;
          }
        }
        
        var termsBox = document.getElementById("drawer-terms-checkbox");
        if (termsBox && !termsBox.checked) {
          setQuoteError("Please accept the Terms & Conditions and Refund Policy to proceed.");
          return;
        }
        setQuoteError("");
        showFareCardConfirmingState();
        handleApplyEstimateContinue();
      });
    }
 
    var termsCheck = document.getElementById("drawer-terms-checkbox");
    if (termsCheck) {
      termsCheck.addEventListener("change", function(e) {
        state.termsAccepted = e.target.checked;
        if (e.target.checked) {
          setQuoteError("");
        }
      });
    }
 
    var incToggle = document.getElementById("drawer-fare-inclusive-toggle");
    if (incToggle) {
      incToggle.addEventListener("change", function(e) {
        var nextFareType = e.target.checked ? "inclusive" : "base";
        setSelectedFareType(nextFareType);
        
        var formFareTypeCheck = document.getElementById("fare-inclusive");
        var formFareTypeBase = document.getElementById("fare-base");
        if (nextFareType === "inclusive" && formFareTypeCheck) {
          formFareTypeCheck.checked = true;
        } else if (formFareTypeBase) {
          formFareTypeBase.checked = true;
        }
        
        renderDrawerContent(currentVehicle, nextFareType, options);
      });
    }
 
    var gstToggle = document.getElementById("drawer-gst-toggle");
    if (gstToggle) {
      gstToggle.addEventListener("change", function(e) {
        state.isGstApplied = e.target.checked;
        renderDrawerContent(currentVehicle, fareType, options);
      });
    }
 
    var tabs = cardContainer.querySelectorAll(".drawer-vehicle-tab");
    tabs.forEach(function (tab) {
      function selectTabVehicle(e) {
        if (e && e.preventDefault) e.preventDefault();
        var targetTab = (e && e.target) ? e.target.closest(".drawer-vehicle-tab") : tab;
        if (!targetTab) targetTab = tab;
        var selectedVehicleKey = targetTab.getAttribute("data-vehicle") || targetTab.dataset.vehicle;
        if (!selectedVehicleKey) return;
        
        var dcUI = window.DropCarsUI;
        if (dcUI && dcUI.setVehicleType) {
          dcUI.setVehicleType(selectedVehicleKey);
        }
        var vehicleInput = document.getElementById("vehicle-type-input");
        if (vehicleInput) vehicleInput.value = selectedVehicleKey;
        
        renderDrawerContent(selectedVehicleKey, fareType, options);
      }

      tab.addEventListener("click", selectTabVehicle);
    });
  }

  var _savedScrollY = 0;

  function lockBodyScroll() {
    if (document.querySelector(".booking-card.swap-host")) {
      return;
    }
    _savedScrollY = window.scrollY || window.pageYOffset || 0;
    var scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = scrollbarWidth + 'px';
    }
    document.body.style.top = '-' + _savedScrollY + 'px';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.overflowY = 'scroll';
  }

  function unlockBodyScroll() {
    if (document.querySelector(".booking-card.swap-host")) {
      return;
    }
    var sy = _savedScrollY;
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    document.body.style.paddingRight = '';
    document.body.style.overflowY = '';
    window.scrollTo(0, sy);
  }

  function openFareSelectionModal(options) {
    if (!quoteModal) return;
    
    var sel = (options.selectedVehicle || "SEDAN").toUpperCase();
    var activeFareType = options.fareType === "inclusive" ? "inclusive" : "base";
    
    renderDrawerContent(sel, activeFareType, options);
    lockBodyScroll();
    quoteModal.style.display = "flex";
    setTimeout(function() {
      quoteModal.classList.add("quote-modal--open");
      document.body.classList.add("quote-modal-open");
      quoteModal.setAttribute("aria-hidden", "false");
    }, 10);
  }

  function openSelectedFareDetailModal(options) {
    if (!quoteModal) return;
    
    var sel = (options.selectedVehicle || "SEDAN").toUpperCase();
    var activeFareType = options.fareType === "inclusive" ? "inclusive" : "base";
    
    renderDrawerContent(sel, activeFareType, options);
    lockBodyScroll();
    quoteModal.style.display = "flex";
    setTimeout(function() {
      quoteModal.classList.add("quote-modal--open");
      document.body.classList.add("quote-modal-open");
      quoteModal.setAttribute("aria-hidden", "false");
    }, 10);
  }

  function handleFareSelectionContinue() {
    var selected = quoteModal && quoteModal.querySelector('input[name="vehicleOption"]:checked');
    if (!selected) {
      setQuoteError("Please select a vehicle to confirm.");
      return;
    }
    setQuoteError("");
    var vehicleType = (selected.value || "").toUpperCase();
    var dcUI = window.DropCarsUI;
    if (dcUI && dcUI.setVehicleType) {
      dcUI.setVehicleType(vehicleType);
    } else {
      var vehicleInput = document.getElementById("vehicle-type-input");
      if (vehicleInput) vehicleInput.value = vehicleType;
    }
    var baseEstimate = (state.fareOptions && state.fareOptions.estimates && state.fareOptions.estimates[vehicleType]) || 0;
    var estimate = getAdjustedEstimate(vehicleType, baseEstimate, getSelectedFareType());
    if (estimate > 0) {
      state.estimatedFare = estimate;
      state.calculatedDistance = state.fareOptions.distanceHint || 0;
      state.fareCalculated = true;
      if (fareCard) fareCard.style.display = "none";
      var mainFormConfirmBtn = document.getElementById("confirm-booking-btn");
      if (mainFormConfirmBtn) mainFormConfirmBtn.style.display = "none";
    }
    showFareCardConfirmingState();
    handleConfirmBooking(null, { directRedirect: true });
  }

  function handleApplyEstimateContinue() {
    if (!state.pendingSelection) {
      closeQuoteModal();
      return;
    }
    var pending = state.pendingSelection;
    var dcUI = window.DropCarsUI;
    if (dcUI && dcUI.setVehicleType) {
      dcUI.setVehicleType(pending.vehicleType);
    } else {
      var vehicleInput = document.getElementById("vehicle-type-input");
      if (vehicleInput) vehicleInput.value = pending.vehicleType;
    }
    state.estimatedFare = pending.estimate || 0;
    state.calculatedDistance = pending.distanceHint || 0;
    state.fareCalculated = state.estimatedFare > 0;
    if (fareCard) fareCard.style.display = "none";
    var mainFormConfirmBtn = document.getElementById("confirm-booking-btn");
    if (mainFormConfirmBtn) mainFormConfirmBtn.style.display = "none";

    // Sync GST variables to hidden input fields in bookingForm
    if (bookingForm) {
      var gstAppliedInput = document.getElementById("include-gst-hidden");
      if (!gstAppliedInput) {
        gstAppliedInput = document.createElement("input");
        gstAppliedInput.type = "hidden";
        gstAppliedInput.name = "include_gst";
        gstAppliedInput.id = "include-gst-hidden";
        bookingForm.appendChild(gstAppliedInput);
      }
      gstAppliedInput.value = pending.gstApplied;

      var gstPercentInput = document.getElementById("gst-percent-hidden");
      if (!gstPercentInput) {
        gstPercentInput = document.createElement("input");
        gstPercentInput.type = "hidden";
        gstPercentInput.name = "gst_percent";
        gstPercentInput.id = "gst-percent-hidden";
        bookingForm.appendChild(gstPercentInput);
      }
      gstPercentInput.value = pending.gstPercent;

      var gstAmountInput = document.getElementById("gst-amount-hidden");
      if (!gstAmountInput) {
        gstAmountInput = document.createElement("input");
        gstAmountInput.type = "hidden";
        gstAmountInput.name = "gst_amount";
        gstAmountInput.id = "gst-amount-hidden";
        bookingForm.appendChild(gstAmountInput);
      }
      gstAmountInput.value = pending.gstAmount;
    }
    
    showFareCardConfirmingState();
    handleConfirmBooking(null, { directRedirect: true });
  }

  function handleCalculateFare(e, opts) {
    if (e && e.preventDefault) e.preventDefault();
    opts = opts || {};
    var silent = !!opts.silent;
    var sendLead = opts.sendLead !== false;

    if (!bookingForm || state.isCalculating) return;

    var formData = new FormData(bookingForm);
    var serviceType =
      (formData.get("serviceType") || "").toString() || "one_way";

    // Airport Transfer: force all-inclusive tariff (Base + Toll + Tax + GST always included)
    if (serviceType === "airport_transfer") {
      setSelectedFareType("inclusive");
      state.isGstApplied = true;
    }

    // --- PROMO CODE LOGIC ---
    state.discountAmount = 0;
    var promo = (formData.get("promoCode") || "").toString().trim().toUpperCase();
    // ------------------------

    var err = validateFareInputs(formData, serviceType);
    if (err) {
      if (responseEl) {
        responseEl.textContent = "";
        responseEl.style.display = "none";
      }
      if (!silent && window.showErrorToast) {
        window.showErrorToast(err);
      }
      return;
    }

    var pickup = (formData.get("pickup") || "").toString().trim();
    var drop = (formData.get("drop") || "").toString().trim();
    var travelDate = (formData.get("date") || "").toString().trim();
    var travelTime = (formData.get("time") || "").toString().trim();
    var tripTimeLabel = formatTripTimeLabel(travelDate, travelTime);
    var Maps = window.DropCarsMaps;

    function finishFareError(msg) {
      state.isCalculating = false;
      setFareLoadingUI(false, silent);
      var btns = [calculateBtn, stickyCalculateBtn].filter(Boolean);
      btns.forEach(function(btn) {
        btn.disabled = false;
        btn.innerHTML = "";
        btn.textContent = getCalculateFareBtnLabel();
      });
      if (responseEl) {
        responseEl.textContent = "";
        responseEl.style.display = "none";
      }
      if (!silent && window.showErrorToast) {
        window.showErrorToast(msg);
      }
    }

    function runFareComputation(distanceHint, mapsMatch, mapsDurationOverride) {
      // Airport Outstation/Local auto-suggestion: <50km real distance reads
      // as a local city trip, 50km+ as outstation. Self-contained DOM check
      // (not closure vars) so this works regardless of where this function
      // ends up being invoked from.
      var svcTypeEl = document.getElementById("service-type");
      if (svcTypeEl && svcTypeEl.value === "airport_transfer" && distanceHint > 0 && window.DropCarsAirportSuggestSubtype) {
        window.DropCarsAirportSuggestSubtype(distanceHint);
      }
      if (serviceType !== "hourly_rental" && (distanceHint <= 0 || isNaN(distanceHint))) {
        finishFareError("Invalid pickup or drop location. Please select a valid location from suggestions.");
        return;
      }

      var fareDistanceHint = distanceHint;
      if (serviceType === "hourly_rental") {
        fareDistanceHint = 0;
        distanceHint = 0;
      }

      var isDoubledTripDistance = serviceType === "round_trip" || isAirportLocal(serviceType);
      var calcDistance =
        isDoubledTripDistance ? distanceHint * 2 : distanceHint;
      var fareCalcDistance =
        isDoubledTripDistance ? fareDistanceHint * 2 : fareDistanceHint;
      var estimates = {
        SEDAN: calculateEstimateForVehicle(serviceType, fareDistanceHint, "SEDAN", formData),
        SUV: calculateEstimateForVehicle(serviceType, fareDistanceHint, "SUV", formData),
        INNOVA: calculateEstimateForVehicle(serviceType, fareDistanceHint, "INNOVA", formData),
        CRYSTA: calculateEstimateForVehicle(serviceType, fareDistanceHint, "CRYSTA", formData),
      };

      state.discountAmount = 0;

      state.fareOptions = {
        estimates: estimates,
        distanceHint: calcDistance,
        pricingDistanceHint: fareCalcDistance,
        routeKmOneWay: distanceHint,
        pricingRouteKmOneWay: fareDistanceHint,
        serviceType: serviceType,
        pickup: pickup,
        drop: serviceType === "hourly_rental" ? "Local Rental" : drop,
        tripTime: tripTimeLabel,
        stops: (window.DropCarsUI && window.DropCarsUI.getStopsData)
          ? window.DropCarsUI.getStopsData().map(function(s){ return (s && s.value ? s.value : "").toString().trim(); }).filter(Boolean)
          : [],
        borderTransitions: detectBorderTransitions(
          pickup,
          serviceType === "hourly_rental" ? "Local Rental" : drop,
          serviceType
        ),
      };

      // --- ASYNC COUPON VALIDATION ---
      var promoCode = (formData.get("promoCode") || "").toString().trim().toUpperCase();
      if (promoCode) {
        if (state.appliedCoupon && state.appliedCoupon.code === promoCode) {
          applyDiscountAndFinish();
        } else {
          var currentVehicleKey = (document.getElementById("vehicle-type-input") && document.getElementById("vehicle-type-input").value) || "SEDAN";
          var baseFare = estimates[currentVehicleKey] || 0;
          fetch("/api/validate-coupon.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              code: promoCode,
              trip_type: serviceType,
              base_fare: baseFare
            })
          })
          .then(r => r.json())
          .then(data => {
            if (data.success) {
              state.appliedCoupon = { code: promoCode, type: data.type, value: data.value };
              // Re-calculate with discount
              estimates = {
                SEDAN: calculateEstimateForVehicle(serviceType, fareDistanceHint, "SEDAN", formData, state.appliedCoupon),
                SUV: calculateEstimateForVehicle(serviceType, fareDistanceHint, "SUV", formData, state.appliedCoupon),
                INNOVA: calculateEstimateForVehicle(serviceType, fareDistanceHint, "INNOVA", formData, state.appliedCoupon),
                CRYSTA: calculateEstimateForVehicle(serviceType, fareDistanceHint, "CRYSTA", formData, state.appliedCoupon),
              };
              state.fareOptions.estimates = estimates;
            } else {
              state.appliedCoupon = null;
              if (data.require_login) {
                alert(data.message || 'Please log in to apply promo codes.');
                window.location.href = '/pages/customer-login.php?promo=1';
                return;
              } else if (data.message) {
                alert(data.message);
              }
            }
            applyDiscountAndFinish();
          })
          .catch(() => {
            state.appliedCoupon = null;
            applyDiscountAndFinish();
          });
        }
      } else {
        state.appliedCoupon = null;
        applyDiscountAndFinish();
      }

      function applyDiscountAndFinish() {
        if (silent) {
          var silentVehicle = (document.getElementById("vehicle-type-input") && document.getElementById("vehicle-type-input").value) || "";
          if (silentVehicle && estimates[silentVehicle]) {
            state.estimatedFare = getAdjustedEstimate(silentVehicle, estimates[silentVehicle], getSelectedFareType());
            state.calculatedDistance = calcDistance;
            state.fareCalculated = true;
            updateFareDisplay(state.estimatedFare, calcDistance, serviceType);
          }
          if (calculateBtn) {
            calculateBtn.disabled = false;
            calculateBtn.textContent = getCalculateFareBtnLabel();
          }
          state.isCalculating = false;
          return;
        }

        var currentVehicle = (document.getElementById("vehicle-type-input") && document.getElementById("vehicle-type-input").value) || "";
        state.fareCalculated = false;
        if (fareCard) fareCard.style.display = "none";
        if (confirmBtn) confirmBtn.style.display = "none";
        var listFareType = getSelectedFareType();

        var exportTripKm = calcDistance > 0 ? calcDistance : fareCalcDistance;
        var exportOneWayKm = serviceType === "round_trip" ? exportTripKm / 2 : exportTripKm;
        var durStr = (mapsDurationOverride || state.mapsDuration || "").toString().trim();
        var exportDurationHint = mapsMatch && distanceHint > 0 && durStr !== "" ? durStr : formatDurationFromOneWayKm(exportOneWayKm);

        if (typeof window !== "undefined" && window.DROP_CARS_ADMIN_BOOKING) {
          var leadEstimateAdmin = currentVehicle && estimates[currentVehicle] ? estimates[currentVehicle] : (estimates.SEDAN || 0);
          var adjustedLeadEstimateAdmin = getAdjustedEstimate(currentVehicle || "SEDAN", leadEstimateAdmin, listFareType);
          var adminPayload = buildPayload(formData, adjustedLeadEstimateAdmin, exportTripKm, serviceType);
          adminPayload.durationHint = exportDurationHint;
          var breakdown = buildFareBreakdownPayload(serviceType, formData);
          adminPayload.fareBreakdown = breakdown;

          var exportData = {
            pickup: pickup,
            drop: serviceType === "hourly_rental" ? "Local Rental" : drop,
            estimates: estimates,
            selectedVehicle: currentVehicle,
            distanceHint: exportTripKm,
            pricingDistanceHint: fareCalcDistance,
            routeKmOneWay: distanceHint,
            pricingRouteKmOneWay: fareDistanceHint,
            borderTransitions: (state.fareOptions && state.fareOptions.borderTransitions) || [],
            tripTime: tripTimeLabel,
            fareType: listFareType,
            serviceType: serviceType,
            payload: adminPayload
          };

          var form = document.createElement("form");
          form.method = "POST";
          form.action = "customize-booking";
          var input = document.createElement("input");
          input.type = "hidden";
          input.name = "fare_data";
          input.value = JSON.stringify(exportData);
          form.appendChild(input);
          document.body.appendChild(form);
          form.submit();
          if (calculateBtn) {
            calculateBtn.disabled = false;
            calculateBtn.textContent = getCalculateFareBtnLabel();
          }
          state.isCalculating = false;
          return;
        }

        if (currentVehicle && estimates[currentVehicle]) {
          openSelectedFareDetailModal({
            pickup: pickup,
            drop: serviceType === "hourly_rental" ? "Local Rental" : drop,
            estimates: estimates,
            selectedVehicle: currentVehicle,
            distanceHint: exportTripKm,
            tripTime: tripTimeLabel,
            fareType: listFareType,
            serviceType: serviceType,
          });
        } else {
          openFareSelectionModal({
            pickup: pickup,
            drop: serviceType === "hourly_rental" ? "Local Rental" : drop,
            estimates: estimates,
            selectedVehicle: "",
            distanceHint: exportTripKm,
            tripTime: tripTimeLabel,
            fareType: listFareType,
            serviceType: serviceType,
            stops: (window.DropCarsUI && window.DropCarsUI.getStopsData)
              ? window.DropCarsUI.getStopsData().map(function(s){ return (s && s.value ? s.value : "").toString().trim(); }).filter(Boolean)
              : [],
          });
        }

        if (calculateBtn) {
          calculateBtn.disabled = false;
          calculateBtn.textContent = getCalculateFareBtnLabel();
        }
        state.isCalculating = false;

        var leadEstimate = currentVehicle && estimates[currentVehicle] ? estimates[currentVehicle] : (estimates.SEDAN || 0);
        var adjustedLeadEstimate = getAdjustedEstimate(currentVehicle || "SEDAN", leadEstimate, listFareType);
        var payload = buildPayload(formData, adjustedLeadEstimate, exportTripKm, serviceType);
        if (state.lastEnquiryBookingId) {
          payload.bookingId = state.lastEnquiryBookingId;
        }
        payload.discount_amount = state.appliedCoupon ? (calculateEstimateForVehicle(serviceType, fareDistanceHint, currentVehicle || "SEDAN", formData, null) - estimates[currentVehicle || "SEDAN"]) : 0;
        
        state.lastEnquiryBookingId = payload.bookingId || "";
        if (sendLead && !(typeof window !== "undefined" && window.DROP_CARS_ADMIN_BOOKING)) {
          // send lead logic...
          try {
            fetch(ENQUIRY_API, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
            .then(function (res) { return res.json(); })
            .then(function (data) {
              if (data && data.bookingId) {
                state.lastEnquiryBookingId = data.bookingId;
              }
            })
            .catch(function () {});
          } catch(e){}
        }
      }
    }

    state.isCalculating = true;
    if (responseEl && !silent) responseEl.textContent = "";
    if (!silent) {
       var btns = [calculateBtn, stickyCalculateBtn].filter(Boolean);
       btns.forEach(function(btn) {
         btn.disabled = true;
         btn.innerHTML = "";
         btn.textContent = "Calculating...";
       });
    }

    if (serviceType === "hourly_rental") {
      runFareComputation(0, false, "");
      return;
    }

    // Airport Local vs Outstation is a label/category only (used by
    // updateDynamicTopTitle + auto-suggested from real distance in
    // runFareComputation below) - both still price off the real pickup→drop
    // distance via the normal one-way flow, never a hardcoded stand-in
    // distance like the old fixed "20km/45min" shortcut used to.
    var mapsMatch =
      state.mapsDistance > 0 &&
      addressesLooselyMatch(state.mapsOrigin, pickup) &&
      addressesLooselyMatch(state.mapsDestination, drop);

    if (mapsMatch && state.mapsDistance > 0) {
      runFareComputation(state.mapsDistance, true, state.mapsDuration);
      return;
    }

    function runServerFallbackDistance() {
      fetch("/api/route-distance.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: pickup, destination: drop, pickup: pickup, drop: drop })
      })
      .then(function(res){ return res.json(); })
      .then(function(data){
        if (!silent) setFareLoadingUI(false, silent);
        if (data && data.success && (data.distance_km || data.distanceMeters)) {
          var sKm = data.distance_km ? Number(data.distance_km) : Number(data.distanceMeters) / 1000;
          var sDur = data.duration_text || data.duration || "";
          state.mapsDistance = sKm;
          state.mapsDuration = sDur;
          state.mapsOrigin = pickup;
          state.mapsDestination = drop;
          runFareComputation(sKm, true, sDur);
        } else {
          var errMsg = (data && data.error) ? data.error : "Invalid pickup or drop location. Please select a valid location from suggestions.";
          finishFareError(errMsg);
          if (data && data.invalid_field) {
            var fieldEl = document.getElementById(data.invalid_field);
            if (fieldEl) {
              fieldEl.focus();
              fieldEl.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }
        }
      })
      .catch(function(){
        if (!silent) setFareLoadingUI(false, silent);
        finishFareError("Invalid pickup or drop location. Please select a valid location from suggestions.");
      });
    }

    if (!Maps || typeof google === "undefined" || !google.maps) {
      if (!silent) setFareLoadingUI(true);
      runServerFallbackDistance();
      return;
    }

    if (!silent) {
      setFareLoadingUI(true);
    }

    ensureLiveDistance(pickup, drop, function (err, liveKm, durationText) {
      if (!err && liveKm > 0) {
        setFareLoadingUI(false, silent);
        state.mapsDistance = liveKm;
        state.mapsDuration = durationText || "";
        state.mapsOrigin = pickup;
        state.mapsDestination = drop;
        runFareComputation(liveKm, true, durationText);
      } else {
        runServerFallbackDistance();
      }
    });
  }

  function handleConfirmBooking(e, opts) {
    opts = opts || {};
    var redirectScheduled = false;
    if (e && e.preventDefault) e.preventDefault();
    if (!bookingForm || state.isSubmitting) return;
    if (opts.directRedirect) {
      if (fareCard) fareCard.style.display = "none";
      if (confirmBtn) confirmBtn.style.display = "none";
    }

    if (!state.fareCalculated || state.estimatedFare <= 0) {
      removeFareCardConfirmingState();
      setSubmittingUI(false, !!opts.directRedirect);
      state.isSubmitting = false;
      var fareErrMsg = "Please calculate the fare first (Get Instant Fare).";
      if (responseEl) {
        responseEl.textContent = fareErrMsg;
        responseEl.style.color = "#b42318";
      }
      setQuoteError(fareErrMsg);
      return;
    }

    // Sync drawer email input if present
    var drawerEmailEl = document.getElementById("drawer-email-input");
    if (drawerEmailEl && drawerEmailEl.value) {
      var emailVal = drawerEmailEl.value.trim();
      var formEmailInput = bookingForm.querySelector('input[name="contactEmail"]');
      if (!formEmailInput) {
        formEmailInput = document.createElement("input");
        formEmailInput.type = "hidden";
        formEmailInput.name = "contactEmail";
        bookingForm.appendChild(formEmailInput);
      }
      formEmailInput.value = emailVal;
    }

    var formData = new FormData(bookingForm);
    var serviceType =
      (formData.get("serviceType") || "").toString() || "one_way";
    var validationError = validateForm(formData, serviceType);
    if (validationError) {
      removeFareCardConfirmingState();
      setSubmittingUI(false, !!opts.directRedirect);
      state.isSubmitting = false;
      if (responseEl) {
        responseEl.textContent = validationError;
        responseEl.style.color = "#b42318";
      }
      setQuoteError(validationError);
      return;
    }

    // "Urgent - need taxi immediately": require a completed Razorpay advance
    // payment before the actual confirm_booking.php submission. Runs once -
    // opts.urgentPaymentVerified is set on the resubmit that startUrgentAdvancePayment
    // triggers via its onPaid callback, so this block is skipped the second
    // time through and the normal submission path below proceeds.
    if (state.isUrgent && !(opts && opts.urgentPaymentVerified)) {
      var urgentAdvance = urgentAdvanceAmount();
      if (urgentAdvance > 0) {
        var directRedirectFlag = !!opts.directRedirect;
        startUrgentAdvancePayment(formData, urgentAdvance, function () {
          handleConfirmBooking(null, { directRedirect: directRedirectFlag, urgentPaymentVerified: true });
        });
        return;
      }
    }

    state.isSubmitting = true;
    setSubmittingUI(true, !!opts.directRedirect);

    var pickup = (formData.get("pickup") || "").toString().trim();
    var drop =
      serviceType === "hourly_rental"
        ? "Local Rental"
        : (formData.get("drop") || "").toString().trim();
    var date = formData.get("date");
    var time = formData.get("time");
    var contactMode = (formData.get("contactMode") || "phone").toString();
    var contactValue =
      contactMode === "email"
        ? (formData.get("contactEmail") || "").toString().trim()
        : (formData.get("contactPhone") || "").toString().trim();

    var cfg = window.DropCarsConfig;
    var whatsappNum = (cfg && cfg.company && cfg.company.functional_whatsapp) || (cfg && cfg.company && cfg.company.whatsapp) || WHATSAPP;

    var bookingTypeLabels = {
      one_way: "One-Way Drop",
      round_trip: "Round Trip",
      multi_city: "Multi City",
      hourly_rental: "Local Rental",
    };
    var vehicleLabels = {
      SEDAN: "Sedan (Dzire/Aura or Equivalent)",
      SUV: "SUV (Ertiga or Equivalent)",
      INNOVA: "Innova",
      CRYSTA: "Crysta",
    };
    var vehicleType =
      (document.getElementById("vehicle-type-input") &&
        document.getElementById("vehicle-type-input").value) ||
      (quoteModal && quoteModal.querySelector('input[name="vehicleOption"]:checked') &&
        (quoteModal.querySelector('input[name="vehicleOption"]:checked').value || "").toUpperCase()) ||
      (state.pendingSelection && state.pendingSelection.vehicleType) ||
      "SEDAN";
    vehicleType = (vehicleType || "").toString().trim().toUpperCase() || "SEDAN";
    var vehicleInputEl = document.getElementById("vehicle-type-input");
    if (vehicleInputEl) {
      vehicleInputEl.value = vehicleType;
      vehicleInputEl.setAttribute("value", vehicleType);
    }

    var formattedDate = "";
    if (date && time) {
      var d = new Date(date + "T" + time);
      formattedDate = d.toLocaleString("en-IN", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    var endDate = formData.get("endDate");
    var dropTime = formData.get("dropTime");
    var dateTimeLine = "Date & Time: " + formattedDate;
    if (serviceType === "round_trip" && endDate && dropTime) {
      var d2 = new Date(endDate + "T" + dropTime);
      var formattedDrop = d2.toLocaleString("en-IN", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      dateTimeLine = "Pickup: " + formattedDate + "\nReturn: " + formattedDrop;
    }
    var selectedFareType = getSelectedFareType();
    var fareTypeLine = selectedFareType === "inclusive" ? "Incl. Tolls, Taxes & 5% GST" : "Excl. Tolls & Taxes";
    var inclusionsLine = selectedFareType === "inclusive"
      ? "Inclusions: Air-conditioned vehicle with driver, fuel charges, driver bata, highway tolls & 5% GST."
      : "Inclusions: Air-conditioned vehicle with driver, base fare, fuel charges, and driver allowance (bata).";
    var exclusionsLine = selectedFareType === "inclusive"
      ? "Exclusions: Parking & airport entry fees (if any), state border tax (applicable only if crossing state border)."
      : "Exclusions: Toll charges, state border tax (if crossing state border), parking and entry fees (if any).";
    var provisionalConfirmId = deriveConfirmationBookingId(state.lastEnquiryBookingId || "");

    var buildWhatsAppUrl = function (bookingIdForMessage) {
      var finalFare = state.estimatedFare;
      var originalFare = calculateEstimateForVehicle(serviceType, state.fareOptions.pricingRouteKmOneWay, vehicleType, new FormData(bookingForm), null);
      var discTitle = state.appliedCoupon ? " (Promo: " + state.appliedCoupon.code + " applied)" : "";
      var cleanBookingId = (bookingIdForMessage || provisionalConfirmId || "").toString().trim();
      var cleanInc = inclusionsLine.replace(/^Inclusions:\s*/i, "• ");
      var cleanExc = exclusionsLine.replace(/^Exclusions:\s*/i, "• ").split(", ").join("\n• ");
      var passCount = (formData.get("passengerCount") || "1").toString().trim();
      var lugSummary = (formData.get("luggageSummary") || "2+1+0").toString().trim();

      var msg =
        "🌟 *DROP CARS — BOOKING REQUEST* 🌟\n" +
        "_Your Premium Intercity & Airport Taxi Partner_\n\n" +
        "Hello Drop Cars Team!\n" +
        "I would like to confirm my *" + (bookingTypeLabels[serviceType] || "Outstation") + "* cab booking. Details below:\n\n" +
        (cleanBookingId ? "📌 *Booking ID:* *#" + cleanBookingId + "*\n\n" : "") +
        "━━━━━━━━━━━━━━━━━━━\n" +
        "🗺️ *TRIP DETAILS*\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        "📍 *Pickup:* " + pickup + "\n" +
        "🏁 *Drop:* " + drop + "\n" +
        "📅 *Travel Info:* " + dateTimeLine + "\n" +
        "🚗 *Vehicle Choice:* " + (vehicleLabels[vehicleType] || vehicleType) + "\n" +
        "👥 *Passengers & Bags:* " + passCount + " Passengers | " + lugSummary + " Luggage\n\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        "💰 *FARE SUMMARY*\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        "💵 *Estimated Total Fare:* " + (state.appliedCoupon ? "₹" + Math.round(originalFare).toLocaleString("en-IN") + " → " : "") + "*₹" + Math.round(finalFare).toLocaleString("en-IN") + "*" + discTitle + "\n" +
        "ℹ️ *Tariff Type:* " + fareTypeLine + "\n" +
        "👨‍✈️ *Driver Bata:* Included in quote\n\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        "👤 *CUSTOMER DETAILS*\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        "👤 *Name:* " + (formData.get("customerName") || "").toString().trim() + "\n" +
        (contactMode === "phone" ? "📞 *Phone:* " : "📧 *Email:* ") + contactValue + "\n\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        "✅ *INCLUSIONS*\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        cleanInc + "\n\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        "❌ *EXCLUSIONS*\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        cleanExc + "\n\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        "🔗 *QUICK LINKS & TRACKING*\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        (cleanBookingId ? "📍 *Live Tracking:* https://dropcars.in/track-booking/" + cleanBookingId + "\n" : "") +
        "🌐 *Website:* https://dropcars.in\n" +
        "📞 *Direct Call:* +91 7200217986";
      return "https://wa.me/" + whatsappNum + "?text=" + encodeURIComponent(msg);
    };

    var buildCustomerWhatsAppUrl = function (bookingIdForMessage) {
      var waPhone = (formData.get("whatsappPhone") || "").toString().trim();
      var contactPhone = (formData.get("contactPhone") || "").toString().trim();
      var custPhoneRaw = "";
      if (waPhone) {
          custPhoneRaw = (formData.get("waCountryCode") || "+91").toString().trim() + waPhone;
      } else if (contactPhone) {
          custPhoneRaw = (formData.get("countryCode") || "+91").toString().trim() + contactPhone;
      }
      var custPhone = custPhoneRaw.replace(/\D/g, "");

      var cleanInc = inclusionsLine.replace(/^Inclusions:\s*/i, "• ");
      var cleanExc = exclusionsLine.replace(/^Exclusions:\s*/i, "• ").split(", ").join("\n• ");
      var cleanBookingId = (bookingIdForMessage || provisionalConfirmId || "").toString().trim();
      if (cleanBookingId) {
          if (cleanBookingId.startsWith("DE")) {
              cleanBookingId = "C" + cleanBookingId.substring(2);
          } else if (cleanBookingId.startsWith("E")) {
              cleanBookingId = "C" + cleanBookingId.substring(1);
          } else if (cleanBookingId.startsWith("DC")) {
              cleanBookingId = "C" + cleanBookingId.substring(2);
          }
      }
      var passCount = (formData.get("passengerCount") || "1").toString().trim();
      var lugSummary = (formData.get("luggageSummary") || "2+1+0").toString().trim();

      var msg =
        "🌟 *DROP CARS — BOOKING CONFIRMATION* 🌟\n" +
        "_Your Trusted Outstation & Airport Cab Partner_\n\n" +
        "Dear *" + (formData.get("customerName") || "").toString().trim() + "*,\n\n" +
        "Thank you for booking with *Drop Cars*! Your reservation " + (cleanBookingId ? "*#" + cleanBookingId + "*" : "") + " has been successfully *CONFIRMED*.\n\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        "🗺️ *TRIP DETAILS*\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        (cleanBookingId ? "📌 *Booking ID:* *#" + cleanBookingId + "*\n" : "") +
        "📍 *Pickup Location:* " + pickup + "\n" +
        "🏁 *Drop Location:* " + drop + "\n" +
        "📅 *Travel Info:* " + dateTimeLine + "\n" +
        "🚗 *Vehicle Choice:* " + (vehicleLabels[vehicleType] || vehicleType) + "\n" +
        "👥 *Passengers & Bags:* " + passCount + " Passengers | " + lugSummary + " Luggage\n\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        "💰 *FARE & BILLING SUMMARY*\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        "💵 *Total Estimated Fare:* *₹" + (state.estimatedFare - (state.discountAmount || 0)).toLocaleString("en-IN") + "* _(" + fareTypeLine + ")_\n" +
        "👨‍✈️ *Driver Allowance:* Included in quote\n" +
        "💳 *Advance Paid:* *₹0* _(No advance needed; pay driver directly)_\n" +
        "💵 *Balance Payable:* *₹" + (state.estimatedFare - (state.discountAmount || 0)).toLocaleString("en-IN") + "* _(via Cash / UPI at pickup or trip end)_\n\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        "✅ *INCLUSIONS*\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        cleanInc + "\n\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        "❌ *EXCLUSIONS*\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        cleanExc + "\n\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        "🔗 *LIVE TRACKING & LINKS*\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        (cleanBookingId ? "📍 *Live Driver & Trip Tracking:* https://dropcars.in/track-booking/" + cleanBookingId + "\n" : "") +
        "🔑 *Customer Dashboard:* https://dropcars.in/pages/customer-login.php\n" +
        "🌐 *Official Website:* https://dropcars.in\n\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        "🚨 *24x7 CUSTOMER ASSISTANCE*\n" +
        "━━━━━━━━━━━━━━━━━━━\n" +
        "Need help or trip updates?\n" +
        "📞 *Direct Phone:* +91 7200217986\n" +
        "💬 *WhatsApp Chat:* https://wa.me/917200217986\n\n" +
        "_We wish you a safe and pleasant journey!_\n" +
        "*— Drop Cars Team* 🙏";
      return "https://wa.me/" + custPhone + "?text=" + encodeURIComponent(msg);
    };

    var confirmPayload = buildConfirmPayload(
      formData,
      state.estimatedFare,
      state.calculatedDistance,
      serviceType
    );
    if (state.appliedCoupon) {
      var baseEstimate = calculateEstimateForVehicle(serviceType, state.fareOptions.pricingRouteKmOneWay, vehicleType, new FormData(bookingForm), null);
      confirmPayload.booking_data.discount_amount = Math.round(baseEstimate - state.estimatedFare);
      confirmPayload.booking_data.final_fare = state.estimatedFare;
      confirmPayload.booking_data.coupon_code = state.appliedCoupon.code;
    }

    fetch(CONFIRM_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(confirmPayload),
    })
      .then(function (r) {
        return Promise.resolve(r.json ? r.json().catch(function () { return {}; }) : {}).then(function (data) {
          return { ok: r.ok, data: data || {} };
        });
      })
      .then(function (result) {
        if (!result.ok || (result.data && result.data.status === "error") || (result.data && result.data.success === false)) {
          throw new Error(result.data && result.data.message || "Confirmation failed");
        }
        var confirmedBookingId =
          (result.data && result.data.bookingId) ||
          (confirmPayload &&
            confirmPayload.booking_data &&
            confirmPayload.booking_data.bookingId) ||
          generateBookingId("C");
        if (typeof window !== "undefined" && window.DROP_CARS_ADMIN_BOOKING) {
          var adminCustomerWaUrl = buildCustomerWhatsAppUrl(confirmedBookingId);
          if (responseEl) {
            responseEl.classList.remove("form-response--loading");
            responseEl.classList.add("form-response--success");
            responseEl.innerHTML =
              'Booking saved. Reference: <strong>' + (confirmedBookingId || "").toString() + '</strong><br>' +
              '<a href="' + adminCustomerWaUrl.replace(/"/g, "&quot;") + '" target="_blank" rel="noopener" style="display:inline-block;margin-top:0.75rem;margin-bottom:0.75rem;font-weight:700;color:#fff;background:#25D366;padding: 0.6rem 1.25rem; border-radius: 8px; text-decoration:none;">Notify Customer via WhatsApp</a><br>' +
              '<span style="font-size:0.85em;color:#666;display:block;">Redirecting to bookings list automatically...</span>';
            responseEl.style.color = "#1e4b7f";
          }
          redirectScheduled = true;
          var adminBase = (window.DROP_CARS_ADMIN_REDIRECT || "").toString().trim();
          window.setTimeout(function () {
            if (adminBase) {
              var sep = adminBase.indexOf("?") === -1 ? "?" : "&";
              window.location.href =
                adminBase + sep + "booking_id=" + encodeURIComponent((confirmedBookingId || "").toString());
            } else {
              window.location.href = getThankYouPath(confirmedBookingId);
            }
          }, 6000); // Wait 6s to allow admin to click WhatsApp
          return;
        }
        var confirmedWaUrl = buildWhatsAppUrl(confirmedBookingId);
        if (typeof window !== "undefined" && typeof window.DropCarsFireFormConversion === "function") {
          var confirmedFareValue =
            (confirmPayload && confirmPayload.booking_data && Number(confirmPayload.booking_data.final_fare)) ||
            Number(state.estimatedFare) ||
            0;
          window.DropCarsFireFormConversion(confirmedFareValue);
        }
        if (responseEl) {
          responseEl.classList.remove("form-response--loading");
          responseEl.classList.add("form-response--success");
          responseEl.innerHTML =
            '✓ Booking confirmed! ' +
            '<a href="' + confirmedWaUrl.replace(/"/g, "&quot;") + '" target="_blank" rel="noopener" class="form-response__wa-link" style="margin-left:0.3rem;font-weight:700;color:#25D366;text-decoration:underline;">Open WhatsApp</a> ' +
            'to share with our team. Redirecting...';
          responseEl.style.color = "#1e4b7f";
        }
        try {
          window.sessionStorage.setItem(
            "dropcars_pending_whatsapp",
            JSON.stringify({
              url: confirmedWaUrl,
              bookingId: confirmedBookingId,
              at: Date.now(),
            })
          );
          window.sessionStorage.setItem("dropcars_last_whatsapp_url", confirmedWaUrl);
        } catch (e) {}
        try {
          var waWin = window.open(confirmedWaUrl, "_blank", "noopener,noreferrer");
          if ((!waWin || waWin.closed) && responseEl) {
            var waLink = responseEl.querySelector(".form-response__wa-link");
            if (waLink) waLink.focus();
          }
        } catch (e) {}
        redirectScheduled = true;
        window.setTimeout(function () {
          window.location.href = getThankYouPath(confirmedBookingId);
        }, 1200);
      })
      .catch(function (err) {
        removeFareCardConfirmingState();
        setSubmittingUI(false, !!opts.directRedirect);
        state.isSubmitting = false;
        var supportPhone = (cfg && cfg.company && cfg.company.phone) ? String(cfg.company.phone) : "7200217986";
        var displayPhone = (supportPhone.length === 10) ? "+91 " + supportPhone : (supportPhone.startsWith("+") ? supportPhone : "+" + supportPhone);
        var failMsg = (err && err.message) || ("Booking submission failed. Please try again or call " + displayPhone + ".");
        setQuoteError(failMsg);
        if (responseEl) {
          responseEl.textContent = failMsg;
          responseEl.style.color = "#b42318";
        }
      })
      .finally(function () {
        state.isSubmitting = false;
        if (!redirectScheduled) {
          removeFareCardConfirmingState();
          setSubmittingUI(false, !!opts.directRedirect);
        }
      });
  }

  if (calculateBtn) {
    calculateBtn.addEventListener("click", handleCalculateFare);
  }
  if (stickyCalculateBtn) {
    stickyCalculateBtn.addEventListener("click", handleCalculateFare);
  }

  var promoApplyBtn = document.getElementById("promo-apply-btn");
  if (promoApplyBtn) {
    promoApplyBtn.addEventListener("click", function (e) {
      e.preventDefault();
      handleCalculateFare(null);
    });
  }
  var promoCodeInput = document.getElementById("promo-code");
  if (promoCodeInput) {
    promoCodeInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.keyCode === 13) {
        e.preventDefault();
        handleCalculateFare(null);
      }
    });
  }

  if (quoteContinueBtn) {
    quoteContinueBtn.addEventListener("click", function (e) {
      if (quoteContinueBtn.getAttribute("data-action") === "confirm-fare") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (state.pendingSelection && state.pendingSelection.vehicleType) {
          handleApplyEstimateContinue();
        } else {
          handleFareSelectionContinue();
        }
      }
    });
  }

  if (vehicleGrid) {
    vehicleGrid.addEventListener("change", function (e) {
      if (e.target && e.target.id === "quote-fare-inclusive-toggle") {
        var fareTypeTop = e.target.checked ? "inclusive" : "base";
        setSelectedFareType(fareTypeTop);
        if (state.fareOptions && state.fareOptions.pickup && state.fareOptions.drop) {
          openFareSelectionModal({
            pickup: state.fareOptions.pickup,
            drop: state.fareOptions.drop,
            estimates: state.fareOptions.estimates || {},
            selectedVehicle:
              (quoteModal &&
                quoteModal.querySelector('input[name="vehicleOption"]:checked') &&
                quoteModal.querySelector('input[name="vehicleOption"]:checked').value) ||
              "",
            distanceHint: state.fareOptions.distanceHint || 0,
            tripTime: state.fareOptions.tripTime || null,
            fareType: fareTypeTop,
            serviceType: state.fareOptions.serviceType || getCurrentServiceType(),
            stops: state.fareOptions.stops || [],
          });
        }
        return;
      }
      if (e.target && e.target.id === "fare-inclusive-toggle") {
        var inclusive = !!e.target.checked;
        var fareType = inclusive ? "inclusive" : "base";
        setSelectedFareType(fareType);
        updateFareExtrasText(fareType);
        if (state.pendingSelection && state.pendingSelection.vehicleType) {
          var updatedEstimate = getAdjustedEstimate(
            state.pendingSelection.vehicleType,
            state.pendingSelection.baseEstimate || 0,
            fareType
          );
          state.pendingSelection.estimate = updatedEstimate;
          var amountEl = vehicleGrid.querySelector(".selected-fare-card__amount");
          if (amountEl) {
            amountEl.textContent = "₹" + Number(updatedEstimate).toLocaleString("en-IN");
          }
        }
        var extrasEl = vehicleGrid.querySelector(".selected-fare-card__extras");
        if (extrasEl) {
          extrasEl.textContent = inclusive
            ? "Tolls, Taxes & 5% GST are Included"
            : "Toll, parking & State permit / border tax extra (applicable only if crossing state border).";
          extrasEl.classList.toggle("is-inclusive", inclusive);
          extrasEl.classList.toggle("is-exclusive", !inclusive);
        }
        return;
      }
      if (!(e.target && e.target.name === "vehicleOption")) return;
      setQuoteError("");
      var cards = vehicleGrid.querySelectorAll(".vehicle-card--fare-option");
      cards.forEach(function (card) {
        card.classList.remove("active");
      });
      var currentCard = e.target.closest(".vehicle-card--fare-option");
      if (currentCard) currentCard.classList.add("active");
    });
  }

  if (bookingForm) {
    bookingForm.addEventListener("submit", function (e) {
      e.preventDefault();
      handleConfirmBooking(e);
    });
  }

  if (bookingForm) {
    var resetFields = bookingForm.querySelectorAll(
      'input[name="pickup"], input[name="drop"], input[name="date"], input[name="time"], input[name="endDate"], input[name="dropTime"], #vehicle-type-input'
    );
    resetFields.forEach(function (el) {
      el.addEventListener("change", resetFare);
      el.addEventListener("input", resetFare);
    });
    var tripTypeSelect = document.getElementById("service-type");
    if (tripTypeSelect) {
      tripTypeSelect.addEventListener("change", resetFare);
    }
  }

  function getThankYouPath(bookingId) {
    var thankYouPath = "/pages/thank-you.php";
    if (!window.location.pathname || window.location.pathname === "/") {
      thankYouPath = "pages/thank-you.php";
    }
    var id = (bookingId || "").toString().trim();
    if (id) {
      var sep = thankYouPath.indexOf("?") === -1 ? "?" : "&";
      thankYouPath += sep + "booking_id=" + encodeURIComponent(id);
    }
    return thankYouPath;
  }

  function openConfirmationModal(details) {
    if (!quoteModal) return;
    if (quoteSummaryEl) quoteSummaryEl.textContent = "Booking Confirmed";
    if (quoteRouteEl) quoteRouteEl.textContent = details.pickup + " → " + details.drop;
    if (quoteFareEl) {
      quoteFareEl.textContent =
        "Fare ₹" +
        Number(details.fare || 0).toLocaleString("en-IN") +
        " | ID " +
        (details.bookingId || "-");
    }
    if (vehicleGrid) {
      vehicleGrid.classList.remove("vehicle-grid--fare-list");
      vehicleGrid.innerHTML =
        '<div class="booking-success-card">' +
        "<h4>Thank you! Your booking request is submitted.</h4>" +
        "<p>Admin alert: " +
        (details.adminEmailSent ? "sent" : "pending") +
        " | Customer email: " +
        (details.customerEmailSent ? "sent" : "pending") +
        "</p>" +
        '<div class="booking-success-card__actions">' +
        '<a class="btn-primary" href="tel:' + ((cfg && cfg.company && cfg.company.phone) ? (cfg.company.phone.toString().replace(/\D/g, '').length === 10 ? '+91' + cfg.company.phone.toString().replace(/\D/g, '') : '+' + cfg.company.phone.toString().replace(/\D/g, '')) : '+917200217986') + '">Call Now</a>' +
        '<a class="btn-outline" target="_blank" rel="noopener" href="' +
        details.whatsappUrl +
        '">WhatsApp</a>' +
        "</div>" +
        "</div>";
    }

    var quoteContinue = document.getElementById("quote-continue");
    var quoteBack = document.getElementById("quote-back");
    if (quoteContinue) {
      quoteContinue.textContent = "View Confirmation";
      quoteContinue.classList.remove("quote-btn--confirm");
      quoteContinue.setAttribute("data-href", getThankYouPath());
      quoteContinue.removeAttribute("data-action");
    }
    if (quoteBack) quoteBack.textContent = "Close";

    lockBodyScroll();
    quoteModal.style.display = "flex";
    quoteModal.classList.add("quote-modal--open");
    document.body.classList.add("quote-modal-open");
    quoteModal.setAttribute("aria-hidden", "false");
  }

  function debounce(fn, delay) {
    var timer = null;
    return function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        fn();
      }, delay);
    };
  }

  function resetFare() {
    state.fareCalculated = false;
    state.lastEnquiryBookingId = "";
    if (fareCard) fareCard.style.display = "none";
    if (confirmBtn) confirmBtn.style.display = "none";
    var btns = [calculateBtn, stickyCalculateBtn].filter(Boolean);
    btns.forEach(function(btn) {
      btn.disabled = false;
      btn.textContent = getCalculateFareBtnLabel();
    });
  }

  var autoRecalculate = debounce(function () {
    if (!state.fareCalculated) return;
    handleCalculateFare(null, { silent: true, sendLead: false });
  }, 250);

  if (bookingForm) {
    var autoFields = bookingForm.querySelectorAll(
      'input[name="pickup"], input[name="drop"], input[name="date"], input[name="time"], input[name="endDate"], input[name="dropTime"], #vehicle-type-input, #service-type, #hourly-package'
    );
    autoFields.forEach(function (el) {
      el.addEventListener("change", autoRecalculate);
      el.addEventListener("input", autoRecalculate);
    });

    ["input[name=\"pickup\"]", 'input[name="drop"]', "#service-type"].forEach(function (sel) {
      var el = bookingForm.querySelector(sel);
      if (!el) return;
      el.addEventListener("input", scheduleBorderSync);
      el.addEventListener("change", scheduleBorderSync);
      el.addEventListener("blur", scheduleBorderSync);
    });
    var stopsListForBorders = document.getElementById("stops-list");
    if (stopsListForBorders) {
      stopsListForBorders.addEventListener("input", function () {
        resetFare();
        scheduleBorderSync();
        autoRecalculate();
      });
      stopsListForBorders.addEventListener("change", function () {
        resetFare();
        scheduleBorderSync();
        autoRecalculate();
      });
    }
    scheduleBorderSync();
  }

  function openQuoteModal(options) {
    if (!quoteModal || !vehicleGrid) return;
    var Fare = window.DropCarsFare;
    if (!Fare || !Fare.VEHICLE_OPTIONS) return;

    var pickup = options.pickup || "";
    var drop = options.drop || "";
    var estimate = options.estimate || 0;
    var serviceLabel = options.serviceLabel || "Trip";
    var passengerCount = options.passengerCount || 0;

    if (quoteSummaryEl)
      quoteSummaryEl.textContent = serviceLabel + " vehicle recommendations";
    if (quoteRouteEl) quoteRouteEl.textContent = pickup + " → " + drop;
    if (quoteFareEl)
      quoteFareEl.textContent = "Est. fare ₹" + estimate.toLocaleString("en-IN");

    var preferredId =
      passengerCount > 6 ? "crysta" : passengerCount > 4 ? "suv" : "sedan";

    vehicleGrid.innerHTML = Fare.VEHICLE_OPTIONS.map(function (vehicle) {
      var recommended =
        vehicle.id === preferredId ? "vehicle-card--recommended" : "";
      return (
        '<label class="vehicle-card ' +
        recommended +
        '">' +
        '<div class="vehicle-card__media">' +
        '<img src="' +
        vehicle.image +
        '" alt="' +
        vehicle.name +
        '" loading="lazy" />' +
        "</div>" +
        '<div class="vehicle-card__info">' +
        "<h4>" +
        vehicle.name +
        "</h4>" +
        '<div class="vehicle-card__meta">' +
        "<span>👥 " +
        vehicle.capacity +
        "</span>" +
        "<span>❄︎ " +
        (vehicle.comfort || "A/C") +
        "</span>" +
        "<span>₹/km " +
        (vehicle.rate || "") +
        "</span>" +
        "</div>" +
        '<div class="vehicle-card__price">' +
        vehicle.priceLabel +
        "</div>" +
        "<small>Toll/Parking extra</small>" +
        "</div>" +
        '<div class="vehicle-card__radio">' +
        '<input type="radio" name="vehicleOption" value="' +
        vehicle.id +
        '" ' +
        (vehicle.id === preferredId ? "checked" : "") +
        " />" +
        "</div>" +
        "</label>"
      );
    }).join("");

    lockBodyScroll();
    quoteModal.style.display = "flex";
    quoteModal.classList.add("quote-modal--open");
    document.body.classList.add("quote-modal-open");
    quoteModal.setAttribute("aria-hidden", "false");
  }

  function closeQuoteModal() {
    removeFareCardConfirmingState();
    if (!quoteModal) return;
    if (vehicleGrid) vehicleGrid.classList.remove("vehicle-grid--fare-list");
    if (quoteModal) quoteModal.classList.remove("quote-modal--fare-mode");
    if (quoteModal) quoteModal.classList.remove("quote-modal--estimate-mode");
    if (quoteContinueBtn) quoteContinueBtn.classList.remove("quote-btn--confirm");
    state.pendingSelection = null;
    stopVehicleListAutoScroll(false);
    setQuoteError("");
    // Unlock scroll FIRST (restores position:fixed removal + scroll position)
    // then remove classes so DOM reorganization (closeSwap) happens at restored position
    unlockBodyScroll();
    quoteModal.classList.remove("quote-modal--open");
    document.body.classList.remove("quote-modal-open");
    quoteModal.setAttribute("aria-hidden", "true");
    setTimeout(function () {
      var host = document.querySelector(".booking-card.swap-host");
      if (host && quoteModal && !quoteModal.classList.contains("quote-modal--open")) {
        host.classList.remove("is-fare-open");
        host.style.height = "";
        host.style.transition = "";
      }
    }, 760);
    setTimeout(function() {
      if (quoteModal && !quoteModal.classList.contains("quote-modal--open")) {
        quoteModal.style.display = "none";
      }
    }, 400);
  }

  var fareTypeInputs = document.querySelectorAll('input[name="fareType"]');
  fareTypeInputs.forEach(function (input) {
    input.addEventListener("change", function () {
      var selectedFareType = getSelectedFareType();
      updateFareExtrasText(selectedFareType);
      var vehicleType =
        (document.getElementById("vehicle-type-input") &&
          document.getElementById("vehicle-type-input").value) ||
        "";
      if (
        state.fareCalculated &&
        vehicleType &&
        state.fareOptions &&
        state.fareOptions.estimates &&
        state.fareOptions.estimates[vehicleType]
      ) {
        state.estimatedFare = getAdjustedEstimate(
          vehicleType,
          state.fareOptions.estimates[vehicleType],
          selectedFareType
        );
        updateFareDisplay(
          state.estimatedFare,
          state.calculatedDistance,
          (state.fareOptions && state.fareOptions.serviceType) || "one_way"
        );
      }
    });
  });

  // Handle Fare Inclusions Info Popover
  document.addEventListener("click", function (e) {
    var infoBtn = e.target.closest("#fare-inclusions-info-btn");
    var closeBtn = e.target.closest("#fare-inclusions-close");
    var popover = document.getElementById("fare-inclusions-popover");

    if (infoBtn) {
      e.preventDefault();
      e.stopPropagation();
      if (popover) {
        popover.classList.toggle("is-hidden");
      }
      return;
    }

    if (closeBtn) {
      e.preventDefault();
      e.stopPropagation();
      if (popover) {
        popover.classList.add("is-hidden");
      }
      return;
    }

    if (popover && !popover.classList.contains("is-hidden") && !popover.contains(e.target)) {
      popover.classList.add("is-hidden");
    }
  });

  function clearVehicleSelectionUI() {
    if (vehicleGrid) {
      var cards = vehicleGrid.querySelectorAll(".vehicle-card--fare-option");
      cards.forEach(function (card) { card.classList.remove("active"); });
      var radios = vehicleGrid.querySelectorAll('input[name="vehicleOption"]');
      radios.forEach(function (radio) { radio.checked = false; });
    }
  }

  function recalculateSilent() {
    handleCalculateFare(null, { silent: true, sendLead: false });
  }
  function isFareCalculated() {
    return state.fareCalculated;
  }

  window.DropCarsBooking = {
    openQuoteModal: openQuoteModal,
    closeQuoteModal: closeQuoteModal,
    resetFare: resetFare,
    clearVehicleSelectionUI: clearVehicleSelectionUI,
    recalculateSilent: recalculateSilent,
    isFareCalculated: isFareCalculated,
  };
    // --- Marketing: Auto-apply Coupon Logic ---
    function autoApplyCoupon() {
        // 1. Check URL parameters
        var params = new URLSearchParams(window.location.search);
        var urlCoupon = params.get('coupon');
        
        // 2. Check Session Storage (for clicks from banners/popups)
        var sessionCoupon = null;
        try {
            sessionCoupon = sessionStorage.getItem('pending_coupon');
            if (sessionCoupon) sessionStorage.removeItem('pending_coupon');
        } catch(e) {}
        
        var targetCode = urlCoupon || sessionCoupon;
        if (targetCode) {
            var promoInput = document.getElementById('promo-code');
            var applyBtn = document.getElementById("promo-apply-btn");
            if (promoInput && applyBtn) {
                promoInput.value = targetCode.toUpperCase();
                // We delay slightly to ensure any other initializations are done
                setTimeout(function() {
                    applyBtn.style.background = '#25D366'; // Success flash
                    applyBtn.click();
                    // Scroll to form if needed
                    var form = document.getElementById('booking-form');
                    if (form && urlCoupon) {
                        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, 1000);
            }
        }
    }

    function prefillFromURL() {
        try {
            var params = new URLSearchParams(window.location.search);
            var pickupVal = params.get('pickup') || params.get('from') || params.get('p') || (window.DROP_ROUTE_PICKUP_ADDR ? window.DROP_ROUTE_PICKUP_ADDR.split(',')[0] : '');
            var dropVal = params.get('drop') || params.get('to') || params.get('d') || (window.DROP_ROUTE_DROP_ADDR ? window.DROP_ROUTE_DROP_ADDR.split(',')[0] : '');

            var pickupInput = document.getElementById('pickup') || document.querySelector('input[name="pickup"]');
            var dropInput = document.getElementById('drop') || document.querySelector('input[name="drop"]');

            if (pickupVal && pickupInput && !pickupInput.value) {
                pickupInput.value = pickupVal.trim();
            }
            if (dropVal && dropInput && !dropInput.value) {
                dropInput.value = dropVal.trim();
            }

            // Auto-trigger calculation when locations are present
            if (pickupInput && dropInput && pickupInput.value.trim() && dropInput.value.trim()) {
                setTimeout(function () {
                    if (!state.fareCalculated) {
                        recalculateSilent();
                    }
                }, 500);
            }
        } catch(e) {}
    }

    function initOnLoad() {
        prefillFromURL();
        autoApplyCoupon();
    }

    // Initialize on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initOnLoad);
    } else {
        initOnLoad();
    }
  })();
