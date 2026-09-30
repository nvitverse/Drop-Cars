/**
 * UI controls â€“ trip type, contact switch, stops, hourly, admin, offers
 * Drop Cars â€“ Premium intercity taxi
 */

(function () {
  "use strict";

  var tripTypeSelect = document.getElementById("service-type");
  var bookingForm = document.getElementById("booking-form");
  var tripTypeButtons = document.querySelectorAll(".trip-type-option");
  var subtypeRadios = document.querySelectorAll(".oneway-subtypes input[type=\"radio\"]");
  var subtypeLabels = document.querySelectorAll(".oneway-subtypes label");
  var stopsControl = document.getElementById("stops-control");
  var stopsListEl = document.getElementById("stops-list");
  var addStopBtn = document.getElementById("add-stop");
  var stopsNoteEl = document.getElementById("stops-note");
  var dropFieldWrapper = document.getElementById("drop-field");
  var dropInput = document.querySelector('input[name="drop"]');
  var hourlyControl = document.getElementById("hourly-control");
  var hourlyPickupField = document.getElementById("hourly-pickup-field");
  var hourlyOptionButtons = document.querySelectorAll(".hourly-option");
  var hourlyPackageInput = document.getElementById("hourly-package");
  var vehicleTypeInput = document.getElementById("vehicle-type-input");
  var vehicleTypeButtons = document.querySelectorAll(".vehicle-type-option");
  var contactSwitchButtons = document.querySelectorAll(".contact-switch__btn");
  var contactPhoneInput = document.getElementById("contact-phone");
  var contactEmailInput = document.getElementById("contact-email");
  var contactModeInput = document.getElementById("contact-mode-input");
  var contactLabelEl = document.getElementById("contact-label");
  var pickupLabelText = document.getElementById("pickup-label-text");
  var dropLabelText = document.getElementById("drop-label-text");
  var airportSwapBtn = document.getElementById("airport-swap-btn");
  var swapBtnContainer = document.getElementById("swap-btn-container");
  var locationsWrapper = document.getElementById("locations-wrapper");
  var pickupInput = document.getElementById("pickup");

  var airportDirection = "from_airport"; // 'from_airport' or 'to_airport'
  var offerTitleEl = document.getElementById("offer-title");
  var offerDescriptionEl = document.getElementById("offer-description");
  var offerPriceEl = document.getElementById("offer-price");
  var offerValidFromEl = document.getElementById("offer-valid-from");
  var offerValidTillEl = document.getElementById("offer-valid-till");
  var adminLoginForm = document.getElementById("admin-login");
  var adminLoginResponse = document.getElementById("admin-login-response");
  var offerForm = document.getElementById("offer-form");
  var offerFormResponse = document.getElementById("offer-form-response");
  var adminLogoutBtn = document.getElementById("admin-logout");
  var adminMenuLinks = document.getElementById("menu-admin-links");

  var ADMIN_EMAIL = "ops@dropcars.in";
  var ADMIN_PASSWORD = "DropCars@2025";
  var OFFER_STORAGE_KEY = "dropcars-current-offer";
  var adminAuthenticated = false;
  var stopsData = [];

  var Fare = window.DropCarsFare;
  var formatDate = Fare ? Fare.formatDate : function (v) { return v || ""; };


  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function getTodayDateValue() {
    var now = new Date();
    return (
      now.getFullYear() +
      "-" +
      pad2(now.getMonth() + 1) +
      "-" +
      pad2(now.getDate())
    );
  }

  function getCurrentTimeValue() {
    var now = new Date();
    // Get absolute UTC milliseconds
    var utc = now.getTime();
    // Add 330 minutes (5.5 hours) to get IST time
    var istDate = new Date(utc + (330 * 60000));
    
    var h = istDate.getUTCHours();
    var m = istDate.getUTCMinutes();

    return pad2(h) + ":" + pad2(m);
  }

  function initDefaultDateTime() {
    var dateInput = document.querySelector('input[name="date"]');
    var timeInput = document.querySelector('input[name="time"]');

    if (dateInput && !dateInput.value) dateInput.value = getTodayDateValue();
    if (timeInput && !timeInput.value) timeInput.value = getCurrentTimeValue();
  }

  function renderStops() {
    if (!stopsListEl) return;
    stopsListEl.innerHTML = "";
    stopsData.forEach(function (stop, index) {
      var item = document.createElement("div");
      item.className = "stop-item";
      item.draggable = true;

      var dragHandle = document.createElement("div");
      dragHandle.className = "stop-item__drag";
      dragHandle.textContent = "\u22ee\u22ee"; // ⋮⋮

      var input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Stop " + (index + 1);
      input.value = stop.value;
      input.addEventListener("input", function (event) {
        stopsData[index].value = event.target.value;
      });

      var actions = document.createElement("div");
      actions.className = "stop-item__actions";

      var upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.innerHTML = "\u25b2"; // ▲
      upBtn.disabled = index === 0;
      upBtn.title = "Move Up";
      upBtn.addEventListener("click", function () {
        if (index === 0) return;
        var moved = stopsData.splice(index, 1)[0];
        stopsData.splice(index - 1, 0, moved);
        renderStops();
      });

      var downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.innerHTML = "\u25bc"; // ▼
      downBtn.disabled = index === stopsData.length - 1;
      downBtn.title = "Move Down";
      downBtn.addEventListener("click", function () {
        if (index === stopsData.length - 1) return;
        var moved = stopsData.splice(index, 1)[0];
        stopsData.splice(index + 1, 0, moved);
        renderStops();
      });

      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.innerHTML = "\u2715"; // ✕
      removeBtn.title = "Remove";
      removeBtn.addEventListener("click", function () {
        stopsData.splice(index, 1);
        renderStops();
      });

      actions.append(upBtn, downBtn, removeBtn);
      item.append(dragHandle, input, actions);

      item.addEventListener("dragstart", function (e) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", index);
        setTimeout(function () { item.classList.add("dragging"); }, 0);
      });
      item.addEventListener("dragend", function () {
        item.classList.remove("dragging");
      });
      item.addEventListener("dragover", function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      });
      item.addEventListener("drop", function (e) {
        e.preventDefault();
        var fromIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
        var toIndex = index;
        if (fromIndex === toIndex || isNaN(fromIndex)) return;
        var moved = stopsData.splice(fromIndex, 1)[0];
        stopsData.splice(toIndex, 0, moved);
        renderStops();
      });

      stopsListEl.appendChild(item);
    });

    if (stopsListEl.parentElement) {
      stopsListEl.parentElement.classList.toggle("hidden", stopsData.length === 0 && (!tripTypeSelect || (tripTypeSelect.value !== "round_trip" && tripTypeSelect.value !== "multi_city")));
    }
    if (addStopBtn) addStopBtn.disabled = stopsData.length >= 10;

    if (window.DropCarsMaps && typeof window.DropCarsMaps.initStopAutocompletes === "function") {
      window.DropCarsMaps.initStopAutocompletes();
    }
    stopsListEl.dispatchEvent(new Event("change", { bubbles: true }));
  }

  if (addStopBtn) {
    addStopBtn.addEventListener("click", function () {
      if (stopsData.length >= 10) return;
      stopsData.push({ value: "" });
      renderStops();
    });
  }

  function setHourlyPackage(value) {
    if (!hourlyPackageInput) return;
    hourlyPackageInput.value = value;
    if (hourlyOptionButtons) {
      hourlyOptionButtons.forEach(function (btn) {
        btn.classList.toggle(
          "hourly-option--active",
          btn.dataset.hours === value
        );
      });
    }
    var dc = window.DropCarsBooking;
    if (dc && dc.resetFare) dc.resetFare();
  }

  if (hourlyOptionButtons) {
    hourlyOptionButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        setHourlyPackage(btn.dataset.hours || "5_hours");
      });
    });
  }
  if (hourlyPackageInput) setHourlyPackage(hourlyPackageInput.value || "5_hours");

  function updateTripUI() {
    if (!tripTypeSelect) return;
    var type = tripTypeSelect.value;
    var airportSubtypeEl = document.getElementById("airport-subtype-input");
    var isAirportLocalNow = type === "airport_transfer" && airportSubtypeEl && airportSubtypeEl.value === "local";
    // Local is billed round-trip style (pickup → drop → back to pickup), so
    // it gets the same optional-stops UI as Round Trip.
    var showStops = type === "round_trip" || type === "multi_city" || isAirportLocalNow;

    var isOneway = type === "one_way" || type === "multi_city" || type === "airport_transfer";
    var subContainers = document.querySelectorAll(".oneway-subtypes");
    subContainers.forEach(function (sc) {
      sc.style.display = isOneway ? "grid" : "none";
    });
    if (stopsControl) {
      stopsControl.classList.toggle("hidden", !showStops);
      if (stopsNoteEl) {
        stopsNoteEl.textContent = "Add optional stops between pickup and drop.";
      }
    }
    if (dropFieldWrapper && dropInput) {
      var hideDrop = type === "hourly_rental";
      dropFieldWrapper.classList.toggle("hidden", hideDrop);
      dropInput.required = !hideDrop;
      if (hideDrop) dropInput.value = "";

      var isRoundTrip = type === "round_trip";
      var dropSpan = dropLabelText || dropFieldWrapper.querySelector("span");
      if (dropSpan) {
        dropSpan.textContent = isRoundTrip ? "Destination" : "Drop Location";
      }
      dropInput.placeholder = isRoundTrip ? "Destination" : "Drop Location";
      
      if (pickupLabelText) {
         pickupLabelText.textContent = "Pick Up Location *";
      }
      if (pickupInput) {
         pickupInput.placeholder = "Pick Up Location";
      }
      
      if (swapBtnContainer) swapBtnContainer.classList.add("hidden");
      if (locationsWrapper) locationsWrapper.classList.remove("airport-mode");
      
      // Override for Airport Transfer and One-Way Outstation
      if (type === "airport_transfer" || type === "one_way") {
        if (swapBtnContainer) swapBtnContainer.classList.remove("hidden");
        if (locationsWrapper) locationsWrapper.classList.add("airport-mode");
        if (type === "airport_transfer") {
          if (airportDirection === "from_airport") {
            if (pickupLabelText) pickupLabelText.textContent = "From Airport *";
            if (pickupInput) pickupInput.placeholder = "From Airport";
            if (dropSpan) dropSpan.textContent = "Drop Location *";
            if (dropInput) dropInput.placeholder = "Drop Location";
          } else {
            if (pickupLabelText) pickupLabelText.textContent = "Pick Up Location *";
            if (pickupInput) pickupInput.placeholder = "Pick Up Location";
            if (dropSpan) dropSpan.textContent = "To Airport *";
            if (dropInput) dropInput.placeholder = "To Airport";
          }
        } else {
          if (pickupLabelText) pickupLabelText.textContent = "Pick Up Location *";
          if (pickupInput) pickupInput.placeholder = "Pick Up Location";
          if (dropSpan) dropSpan.textContent = "Drop Location *";
          if (dropInput) dropInput.placeholder = "Drop Location";
        }
      }
    }
    if (hourlyControl) {
      var showHourly = type === "hourly_rental";
      hourlyControl.classList.toggle("hidden", !showHourly);
      /* hourlyPickupField is always hidden — standard pickup field covers hourly trips */
      if (hourlyPickupField) hourlyPickupField.classList.add("hidden");
    }
    /* One Way = no End Date/Drop Time; Round Trip = End Date + Drop Time; Multi City = Drop Time only */
    var endDateDropTimeControl = document.getElementById("end-date-drop-time-control");
    var endDateInput = document.getElementById("end-date-input");
    var dropTimeInput = document.getElementById("drop-time-input");
    var endDateField = endDateInput && endDateInput.closest ? endDateInput.closest(".field") : null;
    var dropTimeField = dropTimeInput && dropTimeInput.closest ? dropTimeInput.closest(".field") : null;
    var startDateInput = document.querySelector('input[name="date"]');
    if (type === "round_trip") {
      if (endDateDropTimeControl) endDateDropTimeControl.classList.remove("hidden");
      if (endDateField) endDateField.classList.remove("hidden");
      if (dropTimeField) dropTimeField.classList.remove("hidden");
      if (endDateInput) {
        endDateInput.setAttribute("required", "required");
        if (startDateInput && startDateInput.value) {
          endDateInput.min = startDateInput.value;
          if (!endDateInput.value) endDateInput.value = startDateInput.value;
        }
      }
      if (dropTimeInput) {
        dropTimeInput.setAttribute("required", "required");
        if (!dropTimeInput.value) dropTimeInput.value = "21:30";
      }
    } else if (type === "multi_city") {
      if (endDateDropTimeControl) endDateDropTimeControl.classList.remove("hidden");
      if (endDateField) endDateField.classList.remove("hidden");
      if (dropTimeField) dropTimeField.classList.remove("hidden");
      if (endDateInput) {
        endDateInput.setAttribute("required", "required");
        if (startDateInput && startDateInput.value) {
          endDateInput.min = startDateInput.value;
          if (!endDateInput.value) endDateInput.value = startDateInput.value;
        }
      }
      if (dropTimeInput) {
        dropTimeInput.setAttribute("required", "required");
        if (!dropTimeInput.value) dropTimeInput.value = "21:30";
      }
    } else {
      if (endDateDropTimeControl) endDateDropTimeControl.classList.add("hidden");
      if (endDateField) endDateField.classList.remove("hidden");
      if (dropTimeField) dropTimeField.classList.remove("hidden");
      if (endDateInput) {
        endDateInput.removeAttribute("required");
        endDateInput.value = "";
      }
      if (dropTimeInput) {
        dropTimeInput.removeAttribute("required");
        dropTimeInput.value = "";
      }
    }
    updateDynamicTopTitle();
    document.dispatchEvent(new CustomEvent("dropcars:trip_type_changed", { detail: { type: type, direction: airportDirection } }));
  }

  function updateDynamicTopTitle() {
    var titleEl = document.getElementById("booking-form-dynamic-title") ||
                  document.querySelector(".booking-top-badge") ||
                  document.querySelector(".airport-top-badge") ||
                  document.querySelector(".airport-booking-title");
    if (!titleEl) return;

    var type = tripTypeSelect ? tripTypeSelect.value : "one_way";
    var pageTitle = (window.DROP_CARS_PAGE_TITLE || "").toString().trim();

    var icon = "🚖";
    var text = "Book Drop Taxi";

    if (type === "airport_transfer") {
      icon = "✈️";
      var subInput = document.getElementById("airport-subtype-input");
      var sub = subInput ? subInput.value : "";
      if (sub === "local") {
        text = "Book Local Airport Taxi";
      } else {
        text = "Book Airport Taxi";
      }
    } else if (type === "round_trip") {
      icon = "🔄";
      text = pageTitle ? "Book Round Trip — " + pageTitle : "Book Round Trip Taxi";
    } else if (type === "hourly_rental") {
      icon = "🏙️";
      text = pageTitle ? "Book Local Rental — " + pageTitle : "Book Local Rental Taxi";
    } else if (type === "multi_city") {
      icon = "🛣️";
      text = "Book Multi City Taxi";
    } else {
      icon = "🚖";
      if (pageTitle) {
        text = "Book " + pageTitle;
      } else {
        text = "Book Outstation Drop Taxi";
      }
    }

    titleEl.innerHTML = icon + " " + text;
    titleEl.style.color = "#ffffff";
  }
  window.updateDynamicTopTitle = updateDynamicTopTitle;

  if (airportSwapBtn) {
    airportSwapBtn.addEventListener("click", function () {
      airportDirection = airportDirection === "from_airport" ? "to_airport" : "from_airport";
      
      // Swap the input values
      if (pickupInput && dropInput) {
         var temp = pickupInput.value;
         pickupInput.value = dropInput.value;
         dropInput.value = temp;
      }
      
      updateTripUI();
      document.dispatchEvent(new CustomEvent("dropcars:trip_type_changed", { detail: { type: tripTypeSelect ? tripTypeSelect.value : "airport_transfer", direction: airportDirection } }));
      
      // Trigger calculation
      if (pickupInput) pickupInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function setTripType(type) {
    if (!tripTypeSelect) return;
    tripTypeSelect.value = type;
    var isOnewayGroup = type === "one_way" || type === "multi_city" || type === "airport_transfer";

    if (tripTypeButtons) {
      // Ensure ONLY one active button in the primary trip type group.
      tripTypeButtons.forEach(function (button) {
        button.classList.remove("trip-type-option--active", "active");
      });
      var primaryActiveType = isOnewayGroup ? "one_way" : type;
      tripTypeButtons.forEach(function (button) {
        if ((button.dataset.type || "") === primaryActiveType) {
          button.classList.add("trip-type-option--active", "active");
        }
      });
    }
    updateTripUI();
    if (type === "one_way" || type === "airport_transfer" || type === "multi_city") {
      setOneWaySubtype(type);
    }
    // Hourly Rental never includes tolls/state tax, on any page — force the
    // fare-type toggle to "base" so a stale "All-Inclusive" pick from a
    // previous trip type doesn't silently carry over into a rental fare.
    if (type === "hourly_rental") {
      var fareTypeRadios = document.querySelectorAll('input[name="fareType"]');
      fareTypeRadios.forEach(function (radio) {
        radio.checked = radio.value === "base";
      });
      var fareTypeHiddenEl = document.getElementById("fare-type-hidden");
      if (fareTypeHiddenEl) fareTypeHiddenEl.value = "base";
    }
    var dc = window.DropCarsBooking;
    if (dc && dc.resetFare) dc.resetFare();
  }

  if (tripTypeSelect) {
    tripTypeSelect.addEventListener("change", function () {
      setTripType(tripTypeSelect.value);
    });
  }
  if (tripTypeButtons) {
    tripTypeButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        if (button.dataset.type === "one_way") {
          var onewaySubtypes = document.querySelectorAll(".oneway-subtypes input[type=\"radio\"]");
          var checkedValue = "one_way";
          for (var i = 0; i < onewaySubtypes.length; i++) {
            if (onewaySubtypes[i].checked) {
              checkedValue = onewaySubtypes[i].value;
              break;
            }
          }
          setTripType(checkedValue);
        } else {
          setTripType(button.dataset.type);
        }
      });
    });
  }

  function setOneWaySubtype(value) {
    if (subtypeRadios) {
      subtypeRadios.forEach(function (radio) {
        radio.checked = radio.value === value;
      });
    }
    if (subtypeLabels) {
      subtypeLabels.forEach(function (label) {
        var forId = label.getAttribute("for");
        var radio = forId ? document.getElementById(forId) : null;
        var isActive = !!(radio && radio.checked);
        label.classList.toggle("active", isActive);
      });
    }
  }

  function getTripTypeFromUrl() {
    try {
      var params = new URLSearchParams(window.location.search || "");
      var requested = (params.get("trip_type") || params.get("tripType") || "").toString().trim();
      var allowed = {
        one_way: true,
        round_trip: true,
        hourly_rental: true,
        airport_transfer: true,
        multi_city: true,
      };
      return allowed[requested] ? requested : "";
    } catch (e) {
      return "";
    }
  }

  if (subtypeRadios) {
    subtypeRadios.forEach(function (radio) {
      radio.addEventListener("change", function () {
        if (this.checked) {
          setOneWaySubtype(this.value);
          setTripType(this.value);
        }
      });
    });
  }

  if (tripTypeSelect) {
    var tripFromUrl = getTripTypeFromUrl();
    setTripType(tripFromUrl || tripTypeSelect.value || "one_way");
  }
  renderStops();

  // Airport Transfer page: Outstation / Local / Hourly Rental sub-tabs.
  // Outstation & Local both keep serviceType="airport_transfer" (same
  // real-distance one-way fare formula, just a different label/category
  // via #airport-subtype-input) - Hourly Rental switches serviceType so it
  // reuses the exact same hourly-package UI and tariff already built for
  // the main site's Local/hourly_rental flow, instead of a new formula.
  var airportSubtabs = document.querySelectorAll(".airport-subtab");
  var airportSubtypeInput = document.getElementById("airport-subtype-input");
  var airportSubtypeUserSet = false;
  function setAirportSubtab(subtype, userInitiated) {
    if (!airportSubtabs.length) return;
    if (userInitiated) airportSubtypeUserSet = true;
    airportSubtabs.forEach(function (btn) {
      btn.classList.toggle("active", (btn.dataset.subtype || "") === subtype);
    });
    var fareTypeHidden = document.getElementById("fare-type-hidden");
    if (subtype === "hourly") {
      // Rental: tolls/state tax are never included — only GST is forced on
      // (handled in booking-form.js's trip_type_changed listener).
      if (fareTypeHidden) fareTypeHidden.value = "base";
      setTripType("hourly_rental");
      // Rental has no drop field, so step 2 should already be able to open
      // off pickup alone — re-check immediately instead of waiting for the
      // next pickup edit.
      if (window.checkAndAutoExpandSteps) window.checkAndAutoExpandSteps();
      return;
    }
    if (tripTypeSelect && tripTypeSelect.value !== "airport_transfer") {
      setTripType("airport_transfer");
    }
    if (airportSubtypeInput) airportSubtypeInput.value = subtype;
    // Outstation & Local: toll, state tax & GST are all-inclusive.
    if (fareTypeHidden) fareTypeHidden.value = "inclusive";
    // setTripType() (above) already calls updateTripUI() when it actually
    // runs, but toggling Local <-> Outstation alone doesn't go through it —
    // re-run it directly so stops-control visibility (Local shows stops,
    // billed round-trip style) reacts immediately.
    updateTripUI();
    updateDynamicTopTitle();
    if (window.checkAndAutoExpandSteps) window.checkAndAutoExpandSteps();
    var dc = window.DropCarsBooking;
    if (dc && dc.resetFare) dc.resetFare();
  }
  if (airportSubtabs.length) {
    airportSubtabs.forEach(function (btn) {
      btn.addEventListener("click", function () {
        setAirportSubtab(btn.dataset.subtype || "outstation", true);
      });
    });
    setAirportSubtab(airportSubtypeInput ? airportSubtypeInput.value || "outstation" : "outstation", false);
  }
  // Called from booking-form.js's fare computation once real distance is
  // known, so Outstation/Local reflects the actual pickup→drop km - never
  // overrides a choice the rider already made themselves.
  window.DropCarsAirportSuggestSubtype = function (distanceKm) {
    if (airportSubtypeUserSet || !airportSubtabs.length) return;
    setAirportSubtab(distanceKm < 50 ? "local" : "outstation", false);
  };

  /* Sync End Date min when Start Date changes (Round Trip) */
  var startDateEl = document.querySelector('input[name="date"]');
  if (startDateEl) {
    startDateEl.addEventListener("change", function () {
      if (tripTypeSelect && tripTypeSelect.value === "round_trip") {
        var endDateInput = document.getElementById("end-date-input");
        if (endDateInput && this.value) {
          endDateInput.min = this.value;
          if (!endDateInput.value) endDateInput.value = this.value;
        }
      }
    });
  }

  function setContactMode(mode, skipFocus) {
    if (!contactModeInput || !contactLabelEl) return;
    contactModeInput.value = mode;
    if (contactSwitchButtons) {
      contactSwitchButtons.forEach(function (btn) {
        btn.classList.toggle(
          "contact-switch__btn--active",
          btn.dataset.mode === mode
        );
      });
    }
    if (mode === "email") {
      contactLabelEl.textContent = "Contact";
      if (contactPhoneInput) {
        contactPhoneInput.setAttribute("disabled", "disabled");
        contactPhoneInput.classList.add("hidden");
        contactPhoneInput.removeAttribute("required");
      }
      if (contactEmailInput) {
        contactEmailInput.classList.remove("hidden");
        contactEmailInput.removeAttribute("disabled");
        contactEmailInput.setAttribute("required", "required");
        if (!skipFocus) contactEmailInput.focus();
      }
    } else {
      contactLabelEl.textContent = "Contact";
      if (contactEmailInput) {
        contactEmailInput.setAttribute("disabled", "disabled");
        contactEmailInput.classList.add("hidden");
        contactEmailInput.removeAttribute("required");
      }
      if (contactPhoneInput) {
        contactPhoneInput.classList.remove("hidden");
        contactPhoneInput.removeAttribute("disabled");
        contactPhoneInput.setAttribute("required", "required");
        if (!skipFocus) contactPhoneInput.focus();
      }
    }
  }

  if (contactSwitchButtons) {
    contactSwitchButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        setContactMode(btn.dataset.mode || "phone");
      });
    });
  }
  if (contactModeInput) setContactMode(contactModeInput.value || "phone", true);

  function setVehicleType(value) {
    if (!vehicleTypeInput) return;
    var selected = (value || "").toString().trim().toUpperCase();
    vehicleTypeInput.value = selected;
    vehicleTypeInput.setAttribute("value", selected);
    var cards = document.querySelectorAll(".vehicle-selector-card");
    if (!cards.length) {
      if (vehicleTypeButtons) {
        vehicleTypeButtons.forEach(function (btn) {
          btn.classList.remove("vehicle-type-option--active", "active");
        });
        vehicleTypeButtons.forEach(function (btn) {
          if (selected && ((btn.dataset.vehicle || "").toUpperCase()) === selected) {
            btn.classList.add("vehicle-type-option--active", "active");
          }
        });
      }
      return;
    }
    // Ensure ONLY one active card in the vehicle group.
    cards.forEach(function (card) {
      card.classList.remove("vehicle-selector-card--active", "active");
    });
    cards.forEach(function (card) {
      if (selected && ((card.dataset.vehicle || "").toUpperCase()) === selected) {
        card.classList.add("vehicle-selector-card--active", "active");
      }
    });
  }
  function clearVehicleSelection() {
    setVehicleType("");
    var dc = window.DropCarsBooking;
    if (dc && dc.clearVehicleSelectionUI) dc.clearVehicleSelectionUI();
    if (dc && dc.resetFare) dc.resetFare();
  }
  // Once the rider picks a vehicle themselves, stop auto-picking on their
  // behalf when passenger count changes - manual choice always wins.
  var userPickedVehicle = false;
  function handleVehicleCardSelect(card) {
    if (!card) return;
    userPickedVehicle = true;
    setVehicleType(card.dataset.vehicle || "SEDAN");
    var dc = window.DropCarsBooking;
    if (dc) {
      if (dc.isFareCalculated && dc.isFareCalculated()) {
        dc.recalculateSilent();
      } else if (dc.resetFare) {
        dc.resetFare();
      }
    }
  }
  document.addEventListener("click", function (e) {
    var card = e.target && e.target.closest(".vehicle-selector-card");
    if (card) {
      e.preventDefault();
      handleVehicleCardSelect(card);
    }
  });
  document.addEventListener("keydown", function (e) {
    var card = e.target && e.target.closest(".vehicle-selector-card");
    if (card && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      handleVehicleCardSelect(card);
    }
  });
  if (vehicleTypeButtons) {
    vehicleTypeButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        userPickedVehicle = true;
        setVehicleType(btn.dataset.vehicle || "SEDAN");
      });
    });
  }
  if (vehicleTypeInput) setVehicleType(vehicleTypeInput.value || vehicleTypeInput.getAttribute("value") || "");

  // Passenger-count-driven vehicle suggestion. Only applies until the rider
  // manually taps a vehicle card - after that their choice is never
  // overridden, but they can still freely change it themselves.
  var passengerCountSelect = document.getElementById("passenger-count");
  function vehicleForPassengerCount(count) {
    var n = parseInt(count, 10) || 0;
    if (n >= 6) return "INNOVA"; // "6" in the dropdown means "6+ Passengers"
    if (n > 4) return "SUV";
    return "SEDAN";
  }
  if (passengerCountSelect) {
    passengerCountSelect.addEventListener("change", function () {
      if (userPickedVehicle) return;
      setVehicleType(vehicleForPassengerCount(passengerCountSelect.value));
    });
  }

  /* Removed: auto-clear vehicle on outside click â€“ was clearing user selection when clicking elsewhere */

  var defaultOffer = {
    title: "Flat \u20b94,999 Chennai \u21c4 Bangalore Sedans", // Flat ₹4,999 Chennai ⇄ Bangalore Sedans
    description:
      "All-inclusive one-way drop with zero night charges, free upgrades for early bookings, and complimentary wait time at pickup.",
    price: "\u20b94,999", // ₹4,999
    validFrom: "2025-12-01",
    validTill: "2025-12-15",
  };

  function setOfferDisplay(offer) {
    if (!offerTitleEl) return;
    offerTitleEl.textContent = offer.title;
    if (offerDescriptionEl) offerDescriptionEl.textContent = offer.description;
    if (offerPriceEl) offerPriceEl.textContent = offer.price;
    if (offerValidFromEl) offerValidFromEl.textContent = formatDate(offer.validFrom) || offer.validFrom;
    if (offerValidTillEl) offerValidTillEl.textContent = formatDate(offer.validTill) || offer.validTill;
  }

  function loadOffer() {
    var stored = null;
    try { stored = window.localStorage.getItem(OFFER_STORAGE_KEY); } catch (_) {}
    var offer;
    try {
      offer = stored ? JSON.parse(stored) : defaultOffer;
    } catch (e) {
      offer = defaultOffer;
      try { window.localStorage.removeItem(OFFER_STORAGE_KEY); } catch (_) {}
    }
    setOfferDisplay(offer);
    if (offerForm) {
      offerForm.offerTitle.value = offer.title;
      offerForm.offerDescription.value = offer.description;
      offerForm.offerPrice.value = offer.price;
      offerForm.offerValidFrom.value = offer.validFrom;
      offerForm.offerValidTill.value = offer.validTill;
    }
  }

  if (adminLoginForm) {
    adminLoginForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var formData = new FormData(adminLoginForm);
      var email = (formData.get("adminEmail") || "").toString().trim();
      var password = formData.get("adminPassword") || "";

      if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
        adminAuthenticated = true;
        adminLoginResponse.textContent =
          "Login successful. You can now update offers.";
        adminLoginResponse.style.color = "#0f8a5f";
        adminLoginForm.classList.add("admin-form--hidden");
        if (offerForm) offerForm.classList.remove("admin-form--hidden");
        if (adminMenuLinks) adminMenuLinks.classList.remove("admin-form--hidden");
      } else {
        adminAuthenticated = false;
        adminLoginResponse.textContent = "Invalid credentials. Please try again.";
        adminLoginResponse.style.color = "#b42318";
      }
    });
  }

  if (offerForm) {
    offerForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!adminAuthenticated) {
        offerFormResponse.textContent = "Please login to publish offers.";
        offerFormResponse.style.color = "#b42318";
        return;
      }
      var formData = new FormData(offerForm);
      var offer = {
        title: (formData.get("offerTitle") || "").toString().trim(),
        description: (formData.get("offerDescription") || "").toString().trim(),
        price: (formData.get("offerPrice") || "").toString().trim(),
        validFrom: (formData.get("offerValidFrom") || "").toString(),
        validTill: (formData.get("offerValidTill") || "").toString(),
      };
      setOfferDisplay(offer);
      try { window.localStorage.setItem(OFFER_STORAGE_KEY, JSON.stringify(offer)); } catch (_) {}
      offerFormResponse.textContent = "Offer published successfully.";
      offerFormResponse.style.color = "#0f8a5f";
    });
  }

  if (adminLogoutBtn) {
    adminLogoutBtn.addEventListener("click", function () {
      adminAuthenticated = false;
      if (offerForm) offerForm.classList.add("admin-form--hidden");
      if (adminLoginForm) {
        adminLoginForm.classList.remove("admin-form--hidden");
        adminLoginForm.reset();
      }
      if (adminMenuLinks) adminMenuLinks.classList.add("admin-form--hidden");
      if (adminLoginResponse) {
        adminLoginResponse.textContent = "You have been logged out.";
        adminLoginResponse.style.color = "#08142a";
      }
    });
  }

  loadOffer();

  // WhatsApp Toggle Logic
  document.addEventListener("change", function (e) {
    if (e.target && e.target.id === "use-whatsapp-check") {
      var isChecked = e.target.checked;
      var waField = document.getElementById("whatsapp-field");
      var phoneSpacer = document.getElementById("phone-spacer");

      if (waField) {
        waField.classList.toggle("hidden", isChecked);
        var waInput = document.getElementById("whatsapp-phone");
        if (waInput) {
          waInput.required = !isChecked;
          if (!isChecked) {
            setTimeout(function () { waInput.focus(); }, 100);
          } else {
            waInput.value = "";
          }
        }
      }
      if (phoneSpacer) {
        phoneSpacer.style.display = isChecked ? "block" : "none";
      }
    }
  });

  function getStopsData() {
    return stopsData.map(function (s) {
      return { value: s.value };
    });
  }

  window.DropCarsUI = {
    getStopsData: getStopsData,
    setVehicleType: setVehicleType,
    clearVehicleSelection: clearVehicleSelection,
    // Lets other independent auto-suggest scripts (e.g. airport-transfer.php's
    // luggage-aware autoSuggestVehicle()) check whether the rider already made
    // a manual choice, so they don't silently overwrite it on the next change.
    isVehicleUserPicked: function () { return userPickedVehicle; },
  };

  // Sticky Bottom Action Button Logic
  var stickyBtn = document.getElementById("sticky-calculate-btn");
  var mainBtn = document.getElementById("calculate-fare-btn");
  if (stickyBtn && mainBtn) {
    stickyBtn.addEventListener("click", function () {
      mainBtn.click();
    });

    // Observer to sync text changes (e.g., from 'Check Fare' to 'Proceed')
    var observer = new MutationObserver(function () {
      stickyBtn.textContent = mainBtn.textContent;
    });
    observer.observe(mainBtn, { childList: true, characterData: true, subtree: true });

    // Initial sync
    stickyBtn.textContent = mainBtn.textContent;
  }
  function prefillFromUrl() {
    try {
      var params = new URLSearchParams(window.location.search);
      var pickup = params.get("pickup");
      var drop = params.get("drop");
      var tripType = params.get("trip_type") || params.get("tripType");

      if (pickup) {
        var pickupInput = document.querySelector('input[name="pickup"]');
        if (pickupInput) pickupInput.value = pickup;
        var hourlyPickupInput = document.querySelector('input[name="hourlyPickup"]');
        if (hourlyPickupInput) hourlyPickupInput.value = pickup;
      }
      if (drop) {
        var dropInput = document.querySelector('input[name="drop"]');
        if (dropInput) dropInput.value = drop;
      }
      if (tripType) {
        setTripType(tripType);
      }
    } catch (e) {
      console.warn("Url prefill error:", e);
    }
  }



  initDefaultDateTime();
  prefillFromUrl();

  // Reliable fallback: re-apply time after page fully loads in case async scripts
  // (e.g. Maps API callback) caused a repaint that cleared the programmatic value.
  window.addEventListener("load", function () {
    requestAnimationFrame(function () {
      var timeInput = document.querySelector('input[name="time"]');
      if (timeInput && !timeInput.value) {
        timeInput.value = getCurrentTimeValue();
      }
    });
  });
})();

/* In-place swap: booking form slides out left, fare details slide in from right
   (within the same booking card). Reuses the fare content rendered into #quote-modal
   by relocating its .quote-modal__card into a panel inside the booking card. */
(function () {
  "use strict";
  var modal = document.getElementById("quote-modal");
  var form = document.getElementById("booking-form");
  if (!modal || !form) return;
  var host = form.closest(".booking-card");
  if (!host) return;
  host.classList.add("swap-host");

  var SWAP_MS = 560;
  var SWAP_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
  var panel = null, swapped = false, returnTimer = null;
  var modalHome = modal.parentNode;          // remember where the modal lives
  function ensurePanel() {
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "booking-card__fare-panel";
      host.appendChild(panel);
    }
    return panel;
  }
  function openSwap() {
    if (returnTimer) { clearTimeout(returnTimer); returnTimer = null; }
    if (document.activeElement && typeof document.activeElement.blur === "function") {
      document.activeElement.blur();
    }
    // Cancel any stuck drag gesture (e.g. a captured pointer with no pointerup)
    // so it can't override the open transform.
    active = false;
    activePointerId = null;
    axis = null;
    if (!swapped) {
      if (!modal.querySelector(".quote-modal__card")) return;
      var scrollYBefore = window.scrollY || window.pageYOffset || 0;
      
      // Capture the current height of the host (booking card) to prevent layout collapse
      var currentHeight = host.offsetHeight;
      if (currentHeight > 0) {
        host.style.height = currentHeight + "px";
        host.style.transition = "height " + SWAP_MS + "ms " + SWAP_EASE;
      }

      ensurePanel().appendChild(modal);      // move WHOLE modal (keeps its classes/styles)
      modal.classList.add("is-swapped");
      swapped = true;
      window.scrollTo(0, scrollYBefore);

      // Measure target height of the new panel
      var targetHeight = panel ? panel.offsetHeight : 0;
      if (targetHeight > 0) {
        // Animate host height to target height smoothly!
        setTimeout(function() {
          host.style.height = targetHeight + "px";
        }, 10);
      }
    }
    if (!panel) ensurePanel();

    // Clear any stray inline transform left by an in-progress drag, then
    // lock absolute layout during the slide-in.
    clearInline();
    panel.style.position = "absolute";
    panel.style.inset = "0";

    // Use setTimeout (not requestAnimationFrame) â€” rAF is paused when the tab
    // isn't actively painting, which left the panel stuck closed.
    setTimeout(function () {
      host.classList.add("is-fare-open");
    }, 20);
    setTimeout(function () {
      if (swapped && panel && !active) {
        panel.style.position = "";
        panel.style.inset = "";
        // Clear locked height to let the card flow naturally again
        host.style.height = "";
        host.style.transition = "";
      }
    }, SWAP_MS + 40);

    // Smart Scroll: ONLY scroll if the card is partially out of view or cut off
    setTimeout(function () {
      var headerOffset = window.innerWidth <= 800 ? 85 : 20;
      var rect = host.getBoundingClientRect();
      var cardTop = rect.top;
      var cardBottom = rect.bottom;
      
      if (cardTop < headerOffset || cardBottom > window.innerHeight) {
        var offsetPosition = cardTop + (window.scrollY || window.pageYOffset || 0) - headerOffset;
        window.scrollTo({
          top: offsetPosition,
          behavior: "smooth"
        });
      }
    }, SWAP_MS + 60);
  }
  function closeSwap() {
    if (!swapped) return;

    // Capture the current height of the host (fare panel view)
    var currentHeight = host.offsetHeight;
    if (currentHeight > 0) {
      host.style.height = currentHeight + "px";
      host.style.transition = "height " + SWAP_MS + "ms " + SWAP_EASE;
    }
 
    // Switch to absolute positioning during closing transition
    if (panel) {
      panel.style.position = "absolute";
      panel.style.inset = "0";
    }

    // Measure target height of the form (which will be restored)
    form.style.position = "absolute";
    form.style.visibility = "hidden";
    form.style.display = "block";
    var targetHeight = form.offsetHeight;
    form.style.position = "";
    form.style.visibility = "";
    form.style.display = "";

    if (targetHeight > 0) {
      // Animate host height back to form height smoothly!
      setTimeout(function() {
        host.style.height = targetHeight + "px";
      }, 10);
    }

    host.classList.remove("is-fare-open");
    returnTimer = setTimeout(function () {
      modal.classList.remove("is-swapped");
      var scrollYBefore = window.scrollY || window.pageYOffset || 0;
      if (modalHome) modalHome.appendChild(modal);   // return modal to its home
      swapped = false;
      window.scrollTo(0, scrollYBefore);
      clearInline();
      host.style.height = "";
      host.style.transition = "";
    }, SWAP_MS + 40);
  }

  new MutationObserver(function () {
    if (modal.classList.contains("quote-modal--open")) openSwap();
    else closeSwap();
  }).observe(modal, { attributes: true, attributeFilter: ["class"] });
  if (modal.classList.contains("quote-modal--open")) openSwap();

  /* ---- Unified Pointer-Drag gesture controller: swipe/drag left to open, right to close ---- */
  var TR = "transform " + SWAP_MS + "ms " + SWAP_EASE;
  var startX = 0, startY = 0, lastDx = 0, axis = null, active = false, dragDirection = null;
  var activePointerId = null;

  function setTransition(on) {
    if (panel) {
      panel.style.transition = on ? (TR + ", opacity 0.34s ease, filter 0.34s ease") : "none";
    }
    form.style.transition = on ? (TR + ", opacity 0.34s ease, filter 0.34s ease") : "none";
  }

  function clearInline() {
    if (panel) {
      panel.style.transform = "";
      panel.style.opacity = "";
      panel.style.filter = "";
      panel.style.transition = "";
      panel.style.position = "";
      panel.style.inset = "";
    }
    form.style.transform = "";
    form.style.opacity = "";
    form.style.filter = "";
    form.style.transition = "";
    form.style.position = "";
    form.style.inset = "";
    form.style.zIndex = "";
    host.style.minHeight = "";
  }

  function onStart(e) {
    // If we're already dragging, ignore subsequent fingers/pointers (touchscreen protection)
    if (active) return;

    // Only accept left mouse click (button 0) or touch
    if (e.pointerType === "mouse" && e.button !== 0) return;
    
    // Ignore interactive elements so users can interact with form controls normally
    var target = e.target;
    var tag = (target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "select" || tag === "button" || tag === "textarea" || tag === "a" || 
        tag === "summary" || tag === "details" || target.closest(".drawer-acc") ||
        target.closest(".drawer-vehicle-tabs") || target.closest(".drawer-vehicle-tab") ||
        target.closest("button") || target.closest("a") || target.closest(".drawer-switch-control") || 
        target.closest(".wa-check-label") || target.closest(".stop-item__actions") || 
        target.closest(".vehicle-selector-card") || target.closest(".trip-type-option") || 
        target.closest(".contact-switch__btn") || target.closest(".hourly-option") ||
        target.closest(".oneway-subtypes")) {
      return;
    }

    if (!panel) return;

    // Only allow dragging when the fare panel is FULLY open (swipe-to-close).
    // Opening is handled by the "Check Fare" button â€” starting an "open" drag
    // during the open animation caused the panel to stick mid-slide.
    var isFareOpen = host.classList.contains("is-fare-open");
    if (!isFareOpen) return;
    // The touch must begin inside the fare panel itself.
    if (!target.closest(".booking-card__fare-panel")) return;

    active = true;
    activePointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    lastDx = 0;
    axis = null;
    dragDirection = "close";
    
    // Capture the pointer so that movement is tracked even outside the host element
    if (host.setPointerCapture) {
      host.setPointerCapture(e.pointerId);
    }
  }

  function onMove(e) {
    if (!active || e.pointerId !== activePointerId || !panel) return;
    var dx = e.clientX - startX;
    var dy = e.clientY - startY;

    if (axis === null) {
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 6) {
        axis = "x";
        setTransition(false);
      } else if (Math.abs(dy) > 6) {
        axis = "y";
        active = false;
        activePointerId = null;
        return;
      } else {
        return;
      }
    }

    if (axis !== "x") return;
    
    // Prevent default scroll behaviors
    if (e.cancelable) e.preventDefault();

    var w = panel.offsetWidth || host.offsetWidth || 360;

    if (dragDirection === "close") {
      // Swipe Right (close): dx > 0
      var d = Math.max(0, dx);
      var progress = Math.min(1, d / w);
      lastDx = d;
      panel.style.transform = "translateX(" + d + "px)";
      form.style.transform = "translateX(" + (-w + d) + "px)";
      form.style.opacity = progress;
      form.style.filter = "blur(" + (4 * (1 - progress)).toFixed(2) + "px)";
    } else if (dragDirection === "open") {
      // Swipe Left (open): dx < 0
      var d = Math.min(0, dx);
      lastDx = d;
      
      // Keep form absolute and overlayed next to panel during active drag
      form.style.position = "absolute";
      form.style.inset = "0";
      form.style.zIndex = "1";
      
      var progress = Math.max(0, 1 + d / w);
      panel.style.transform = "translateX(" + (w + d) + "px)";
      panel.style.opacity = progress;
      panel.style.filter = "blur(" + (8 * (1 - progress)).toFixed(2) + "px)";
      form.style.transform = "translateX(" + d + "px)";
      form.style.opacity = progress;
      form.style.filter = "blur(" + (4 * (1 - progress)).toFixed(2) + "px)";
    }
  }

  function onEnd(e) {
    if (!active || e.pointerId !== activePointerId) return;
    active = false;
    activePointerId = null;
    
    if (host.releasePointerCapture) {
      host.releasePointerCapture(e.pointerId);
    }

    var w = panel.offsetWidth || host.offsetWidth || 360;
    setTransition(true);

    if (dragDirection === "close") {
      if (lastDx > w * 0.25) {
        // Dragged right past threshold â†’ close
        clearInline();
        if (window.DropCarsBooking && window.DropCarsBooking.closeQuoteModal) {
          window.DropCarsBooking.closeQuoteModal();
        } else {
          host.classList.remove("is-fare-open");
          modal.classList.remove("quote-modal--open");
        }
      } else {
        // Snap back open
        panel.style.transform = "translateX(0)";
        form.style.transform = "translateX(-14%) scale(0.985)";
        form.style.opacity = "0";
        form.style.filter = "blur(4px)";
        setTimeout(clearInline, SWAP_MS);
      }
    } else if (dragDirection === "open") {
      if (lastDx < -w * 0.25) {
        // Dragged left past threshold â†’ open
        clearInline();
        openSwap();
        // Sync open state in booking-form.js state model if available
        if (window.DropCarsBooking && typeof window.DropCarsBooking.openFareSelectionModal === "function") {
          window.DropCarsBooking.openFareSelectionModal();
        } else {
          modal.classList.add("quote-modal--open");
        }
      } else {
        // Snap back closed
        panel.style.transform = "translateX(" + w + "px)";
        panel.style.opacity = "0";
        panel.style.filter = "blur(8px)";
        form.style.transform = "translateX(0)";
        form.style.opacity = "1";
        form.style.filter = "blur(0)";
        setTimeout(clearInline, SWAP_MS);
      }
    }
  }

  // Bind to Pointer Events for perfect mouse (PC) + touch (mobile) unified support
  host.addEventListener("pointerdown", onStart);
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerup", onEnd);
  host.addEventListener("pointercancel", onEnd);

  /* ---- Touchpad Horizontal Two-Finger Swiping Gestures (wheel listener) ---- */
  var touchpadSwipeActive = false;
  var touchpadAccumulatorX = 0;
  var touchpadTimer = null;

  host.addEventListener("wheel", function (e) {
    if (!panel) return;
    var target = e.target;
    if (target && (target.closest(".drawer-vehicle-tabs") || target.closest(".drawer-vehicle-tab") || target.closest(".vehicle-selector-grid"))) {
      return;
    }
    var isFareOpen = host.classList.contains("is-fare-open");
    if (!isFareOpen && !swapped) return;

    var w = panel.offsetWidth || host.offsetWidth || 360;

    // Detect horizontal touchpad wheel swiping
    if (!touchpadSwipeActive) {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 2) {
        touchpadSwipeActive = true;
        touchpadAccumulatorX = 0; // start relative to rest state
        setTransition(false);
        if (!isFareOpen) {
          form.style.position = "absolute";
          form.style.inset = "0";
          form.style.zIndex = "1";
        }
      }
    }

    if (touchpadSwipeActive) {
      if (e.cancelable) e.preventDefault();
      touchpadAccumulatorX += e.deltaX;

      // Bound delta relative to scroll directions
      if (isFareOpen) {
        // swipe right to close
        var dx = Math.max(0, -touchpadAccumulatorX);
        var progress = Math.min(1, dx / w);
        panel.style.transform = "translateX(" + dx + "px)";
        form.style.transform = "translateX(" + (-w + dx) + "px)";
        form.style.opacity = progress;
        form.style.filter = "blur(" + (4 * (1 - progress)).toFixed(2) + "px)";
      } else {
        // swipe left to open
        var dx = Math.min(0, -touchpadAccumulatorX);
        var progress = Math.max(0, 1 + dx / w);
        panel.style.transform = "translateX(" + (w + dx) + "px)";
        panel.style.opacity = progress;
        panel.style.filter = "blur(" + (8 * (1 - progress)).toFixed(2) + "px)";
        form.style.transform = "translateX(" + dx + "px)";
        form.style.opacity = progress;
        form.style.filter = "blur(" + (4 * (1 - progress)).toFixed(2) + "px)";
      }

      if (touchpadTimer) clearTimeout(touchpadTimer);
      touchpadTimer = setTimeout(function () {
        touchpadSwipeActive = false;
        setTransition(true);

        if (isFareOpen) {
          if (touchpadAccumulatorX < -w * 0.25) {
            // Snap closed
            clearInline();
            if (window.DropCarsBooking && window.DropCarsBooking.closeQuoteModal) {
              window.DropCarsBooking.closeQuoteModal();
            } else {
              host.classList.remove("is-fare-open");
              modal.classList.remove("quote-modal--open");
            }
          } else {
            // Snap back open
            panel.style.transform = "translateX(0)";
            form.style.transform = "translateX(-14%) scale(0.985)";
            form.style.opacity = "0";
            form.style.filter = "blur(4px)";
            setTimeout(clearInline, SWAP_MS);
          }
        } else {
          if (touchpadAccumulatorX > w * 0.25) {
            // Snap open
            clearInline();
            openSwap();
            if (window.DropCarsBooking && typeof window.DropCarsBooking.openFareSelectionModal === "function") {
              window.DropCarsBooking.openFareSelectionModal();
            } else {
              modal.classList.add("quote-modal--open");
            }
          } else {
            // Snap back closed
            panel.style.transform = "translateX(" + w + "px)";
            panel.style.opacity = "0";
            panel.style.filter = "blur(8px)";
            form.style.transform = "translateX(0)";
            form.style.opacity = "1";
            form.style.filter = "blur(0)";
            setTimeout(clearInline, SWAP_MS);
          }
        }
        touchpadAccumulatorX = 0;
      }, 150);
    }
  }, { passive: false });

  /* ===== Mouse Drag-to-Scroll Helper for Horizontal Scroll Grids (PC) ===== */
  window.makeDragScrollable = function (container) {
    if (!container) return;
    var isDown = false;
    var startX;
    var scrollLeft;
    var moved = false;
    var downX = 0;

    container.addEventListener("mousedown", function (e) {
      isDown = true;
      moved = false;
      downX = e.clientX;
      startX = e.pageX - container.offsetLeft;
      scrollLeft = container.scrollLeft;
      container.style.cursor = "grabbing";
      container.style.userSelect = "none";
    });

    container.addEventListener("mouseleave", function () {
      if (isDown) {
        isDown = false;
        container.style.cursor = "grab";
        container.style.userSelect = "";
      }
    });

    container.addEventListener("mouseup", function () {
      if (isDown) {
        isDown = false;
        container.style.cursor = "grab";
        container.style.userSelect = "";
      }
    });

    container.addEventListener("mousemove", function (e) {
      if (!isDown) return;
      var dx = e.clientX - downX;
      if (Math.abs(dx) > 5) {
        moved = true;
      }
      e.preventDefault();
      var x = e.pageX - container.offsetLeft;
      var walk = (x - startX) * 1.5;
      container.scrollLeft = scrollLeft - walk;
    });

    container.addEventListener("click", function (e) {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    container.style.cursor = "grab";
  };

  // Initialize drag scroll for all static vehicle selection grids on load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      document.querySelectorAll(".vehicle-selector-grid").forEach(function (grid) {
        window.makeDragScrollable(grid);
      });
    });
  } else {
    document.querySelectorAll(".vehicle-selector-grid").forEach(function (grid) {
      window.makeDragScrollable(grid);
    });
  }

  function syncSelectorPrices() {
    var tripTypeSelect = document.getElementById("service-type");
    var type = tripTypeSelect ? tripTypeSelect.value : "one_way";
    var onewaySubtypes = document.querySelectorAll(".oneway-subtypes input[type=\"radio\"]");
    for (var i = 0; i < onewaySubtypes.length; i++) {
      if (onewaySubtypes[i].checked && onewaySubtypes[i].offsetParent !== null) {
        type = onewaySubtypes[i].value;
        break;
      }
    }
    
    var isRoundTrip = (type === "round_trip");
    var isHourly = (type === "hourly_rental");
    var config = window.DROP_CARS_CONFIG;
    if (!config || !config.fares) return;
    
    var rates;
    var suffix = "/km";
    if (isHourly) {
        rates = config.fares.hourlyRates;
        suffix = "/hr";
    } else if (isRoundTrip) {
        rates = config.fares.baseFareRoundTrip;
    } else {
        rates = config.fares.baseFareOneWay;
    }
    
    if (!rates) return;

    var cards = document.querySelectorAll(".vehicle-selector-grid .vehicle-selector-card");
    cards.forEach(function (card) {
        var vehicle = card.dataset.vehicle;
        if (rates[vehicle]) {
            var priceSpan = card.querySelector(".vehicle-selector-card__price");
            if (priceSpan) {
                priceSpan.textContent = "\u20b9" + rates[vehicle] + suffix; // ₹
            }
        }
    });
  }

  document.addEventListener("dropcars:trip_type_changed", function (e) {
    syncSelectorPrices();
  });

  // Run initial sync
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncSelectorPrices);
  } else {
    syncSelectorPrices();
  }
})();



/* Hero slideshow controller for all pages */
document.addEventListener('DOMContentLoaded', function() {
  "use strict";
  var activeIndex = 0;
  var bgSlides = document.querySelectorAll('.hero-slide');
  var textSlides = document.querySelectorAll('.hero-text-slide');
  var subSlides = document.querySelectorAll('.hero-sub-slide');
  var totalSlides = Math.max(bgSlides.length, textSlides.length, subSlides.length);
  if (totalSlides < 2) return;

  var sliderTextContainer = document.querySelector('.hero-slider-text');

  /* ── Slide Dots Indicator ── */
  var dotsContainer = document.querySelector('.hero-slider-dots');
  if (!dotsContainer && sliderTextContainer) {
    dotsContainer = document.createElement('div');
    dotsContainer.className = 'hero-slider-dots';
    sliderTextContainer.parentElement.appendChild(dotsContainer);
  }

  function renderDots() {
    if (!dotsContainer) return;
    dotsContainer.innerHTML = '';
    for (var i = 0; i < totalSlides; i++) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'hero-slider-dot' + (i === activeIndex ? ' active' : '');
      dot.setAttribute('aria-label', 'Go to slide ' + (i + 1));
      (function(idx) {
        dot.addEventListener('click', function(e) {
          e.preventDefault();
          goToSlide(idx);
          resetInterval();
        });
      })(i);
      dotsContainer.appendChild(dot);
    }
  }
  renderDots();

  function syncSliderTextHeight() {
    if (!sliderTextContainer || !textSlides.length) return;
    var maxH = 0;
    textSlides.forEach(function(slide) {
      var oldCss = slide.style.cssText;
      slide.style.cssText = 'position:relative!important;opacity:0!important;visibility:hidden!important;display:flex!important;flex-direction:column!important;width:100%!important;height:auto!important;max-height:none!important;';
      var h = Math.max(slide.offsetHeight, slide.scrollHeight);
      if (h > maxH) maxH = h;
      slide.style.cssText = oldCss;
    });
    if (maxH > 0) {
      sliderTextContainer.style.setProperty('min-height', (maxH + 16) + 'px', 'important');
      sliderTextContainer.style.setProperty('height', (maxH + 16) + 'px', 'important');
    }
  }
  syncSliderTextHeight();
  // rAF-throttled: a drag-resize fires dozens of resize events per second,
  // and this function forces a scrollHeight layout read per slide on every
  // call - coalescing to once per frame avoids visible jank while resizing.
  var syncSliderTextHeightRaf = null;
  window.addEventListener('resize', function () {
    if (syncSliderTextHeightRaf !== null) return;
    syncSliderTextHeightRaf = requestAnimationFrame(function () {
      syncSliderTextHeightRaf = null;
      syncSliderTextHeight();
    });
  });
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
    document.fonts.ready.then(syncSliderTextHeight);
  }
  /* ─────────────────────────────────────────────────────────────── */

  var intervalId = setInterval(function() {
    goToSlide((activeIndex + 1) % totalSlides, 'next');
  }, 6000);

  function resetInterval() {
    clearInterval(intervalId);
    intervalId = setInterval(function() {
      goToSlide((activeIndex + 1) % totalSlides, 'next');
    }, 6000);
  }

  function goToSlide(nextIndex, direction) {
    if (nextIndex === activeIndex) {
      bgSlides.forEach(function(s, idx) {
        s.classList.remove('exit', 'exit-right', 'from-left');
        if (idx === (activeIndex % bgSlides.length)) s.classList.add('active');
        else s.classList.remove('active');
      });
      textSlides.forEach(function(s, idx) {
        s.classList.remove('exit', 'exit-right', 'from-left');
        if (idx === activeIndex) s.classList.add('active');
        else s.classList.remove('active');
      });
      subSlides.forEach(function(s, idx) {
        s.classList.remove('exit', 'exit-right', 'from-left');
        if (idx === activeIndex) s.classList.add('active');
        else s.classList.remove('active');
      });
      renderDots();
      return;
    }
    if (!direction) {
      direction = (nextIndex > activeIndex) ? 'next' : 'prev';
    }

    var prevIndex = activeIndex;
    activeIndex = nextIndex;

    // Reset exits and ensure any non-active slide is cleaned up
    bgSlides.forEach(function(s, idx) {
      s.classList.remove('exit', 'exit-right', 'from-left');
      if (idx !== (prevIndex % bgSlides.length) && idx !== (activeIndex % bgSlides.length)) {
        s.classList.remove('active');
      }
    });
    textSlides.forEach(function(s, idx) {
      s.classList.remove('exit', 'exit-right', 'from-left');
      if (idx !== prevIndex && idx !== activeIndex) {
        s.classList.remove('active');
      }
    });
    subSlides.forEach(function(s, idx) {
      s.classList.remove('exit', 'exit-right', 'from-left');
      if (idx !== prevIndex && idx !== activeIndex) {
        s.classList.remove('active');
      }
    });

    var oldBg = bgSlides.length ? bgSlides[prevIndex % bgSlides.length] : null;
    var newBg = bgSlides.length ? bgSlides[activeIndex % bgSlides.length] : null;
    var oldText = textSlides[prevIndex];
    var newText = textSlides[activeIndex];
    var oldSub = subSlides[prevIndex];
    var newSub = subSlides[activeIndex];

    if (direction === 'next') {
      if (oldBg) { oldBg.classList.remove('active'); oldBg.classList.add('exit'); }
      if (oldText) { oldText.classList.remove('active'); oldText.classList.add('exit'); }
      if (oldSub) { oldSub.classList.remove('active'); oldSub.classList.add('exit'); }

      if (newBg) newBg.classList.add('active');
      if (newText) newText.classList.add('active');
      if (newSub) newSub.classList.add('active');
    } else {
      if (newBg) newBg.classList.add('from-left');
      if (newText) newText.classList.add('from-left');
      if (newSub) newSub.classList.add('from-left');

      if (newBg) void newBg.offsetWidth;
      if (newText) void newText.offsetWidth;
      if (newSub) void newSub.offsetWidth;

      if (oldBg) { oldBg.classList.remove('active'); oldBg.classList.add('exit-right'); }
      if (oldText) { oldText.classList.remove('active'); oldText.classList.add('exit-right'); }
      if (oldSub) { oldSub.classList.remove('active'); oldSub.classList.add('exit-right'); }

      if (newBg) { newBg.classList.remove('from-left'); newBg.classList.add('active'); }
      if (newText) { newText.classList.remove('from-left'); newText.classList.add('active'); }
      if (newSub) { newSub.classList.remove('from-left'); newSub.classList.add('active'); }
    }
    renderDots();
  }

  // Interactive holdable/draggable slider implementation
  var startX = 0;
  var startY = 0;
  var currentX = 0;
  var isDragging = false;
  var dragThreshold = 40;
  var heroContainer = document.querySelector('.hero');
  var heroSlider = document.querySelector('.hero-slider');

  function setTranslateX(el, val) {
    if (el) el.style.transform = val;
  }

  function clearTransforms() {
    bgSlides.forEach(function(s, idx) {
      s.style.transform = '';
      if (idx !== (activeIndex % bgSlides.length)) s.classList.remove('active');
    });
    textSlides.forEach(function(s, idx) {
      s.style.transform = '';
      if (idx !== activeIndex) s.classList.remove('active');
    });
    subSlides.forEach(function(s, idx) {
      s.style.transform = '';
      if (idx !== activeIndex) s.classList.remove('active');
    });
  }

  function handleStart(clientX, clientY) {
    startX = clientX;
    startY = clientY;
    currentX = clientX;
    isDragging = true;
    if (heroSlider) heroSlider.classList.add('is-dragging');
    
    bgSlides.forEach(function(s) { s.classList.remove('exit', 'exit-right', 'from-left'); });
    textSlides.forEach(function(s) { s.classList.remove('exit', 'exit-right', 'from-left'); });
  }

  function handleMove(clientX, clientY, isTouch, e) {
    if (!isDragging) return;
    currentX = clientX;
    var deltaX = currentX - startX;
    
    if (isTouch) {
      var deltaY = clientY - startY;
      if (Math.abs(deltaX) < Math.abs(deltaY)) {
        isDragging = false;
        if (heroSlider) heroSlider.classList.remove('is-dragging');
        clearTransforms();
        return;
      }
      if (e.cancelable) {
        e.preventDefault();
      }
    }

    var sliderWidth = heroContainer.offsetWidth;

    if (bgSlides.length) setTranslateX(bgSlides[activeIndex % bgSlides.length], 'translateX(' + deltaX + 'px)');
    if (textSlides[activeIndex]) setTranslateX(textSlides[activeIndex], 'translateX(' + deltaX + 'px)');

    var nextIdx = (activeIndex + 1) % totalSlides;
    var prevIdx = (activeIndex - 1 + totalSlides) % totalSlides;

    if (deltaX < 0) {
      var nextBg = bgSlides.length ? bgSlides[nextIdx % bgSlides.length] : null;
      var nextText = textSlides[nextIdx];
      
      if (nextBg) nextBg.classList.add('active');
      if (nextText) nextText.classList.add('active');
      
      var nextOffset = sliderWidth + deltaX;
      if (nextBg) setTranslateX(nextBg, 'translateX(' + nextOffset + 'px)');
      if (nextText) setTranslateX(nextText, 'translateX(' + nextOffset + 'px)');
    } else if (deltaX > 0) {
      var prevBg = bgSlides.length ? bgSlides[prevIdx % bgSlides.length] : null;
      var prevText = textSlides[prevIdx];
      
      if (prevBg) prevBg.classList.add('active');
      if (prevText) prevText.classList.add('active');
      
      var prevOffset = -sliderWidth + deltaX;
      if (prevBg) setTranslateX(prevBg, 'translateX(' + prevOffset + 'px)');
      if (prevText) setTranslateX(prevText, 'translateX(' + prevOffset + 'px)');
    }
  }

  function handleEnd() {
    if (!isDragging) return;
    isDragging = false;
    if (heroSlider) heroSlider.classList.remove('is-dragging');

    var deltaX = currentX - startX;

    bgSlides.forEach(function(s) { s.style.display = ''; });
    clearTransforms();

    if (Math.abs(deltaX) > dragThreshold) {
      if (deltaX < 0) {
        goToSlide((activeIndex + 1) % totalSlides, 'next');
      } else {
        goToSlide((activeIndex - 1 + totalSlides) % totalSlides, 'prev');
      }
    } else {
      goToSlide(activeIndex);
    }
    resetInterval();
  }

  if (heroContainer) {
    heroContainer.addEventListener('touchstart', function(e) {
      if (e.target.closest('input, select, button, .booking-card, a')) {
        return;
      }
      var t = e.touches[0];
      handleStart(t.clientX, t.clientY);
    }, { passive: true });

    heroContainer.addEventListener('touchmove', function(e) {
      if (!isDragging) return;
      var t = e.touches[0];
      handleMove(t.clientX, t.clientY, true, e);
    }, { passive: false });

    heroContainer.addEventListener('touchend', function(e) {
      handleEnd();
    }, { passive: true });

    heroContainer.addEventListener('mousedown', function(e) {
      if (e.target.closest('input, select, button, .booking-card, a')) {
        return;
      }
      handleStart(e.clientX, e.clientY);
      e.preventDefault();
    });

    window.addEventListener('mousemove', function(e) {
      handleMove(e.clientX, e.clientY, false, e);
    });

    window.addEventListener('mouseup', function(e) {
      handleEnd();
    });

    window.addEventListener('mouseleave', function(e) {
      handleEnd();
    });
  }
});