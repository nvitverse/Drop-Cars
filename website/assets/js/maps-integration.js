/**
 * Google Maps Integration
 * Handles Autocomplete and Distance Matrix calculations.
 *
 * Dynamically switches flow based on fallback configuration settings:
 * - Toggle ON (fallback): Loads instant prefix matching suggestions, geocode search API, and local suggestions.
 * - Toggle OFF (no-fallback): Uses Google's current (non-legacy) Places + Routes APIs.
 *
 * FLOW 1 note: this project's Google Maps key was created after March 2025 —
 * Google permanently blocks legacy google.maps.places.Autocomplete and
 * google.maps.DistanceMatrixService for any project created after that date
 * (LegacyApiNotActivatedMapError, regardless of billing/API-enablement state).
 * Flow 1 therefore uses AutocompleteSuggestion (new Places JS library, works
 * through the existing authenticated script tag) for suggestions, and a
 * server-side Routes API proxy (api/route-distance.php) for distance, since
 * the Routes REST endpoint needs the key in a header and the key is
 * deliberately kept server-side only.
 */
(function () {
  "use strict";

  var isFallbackOn = !(window.DROP_CARS_UX && window.DROP_CARS_UX.enableLocalLocationFallback === false);

  if (!isFallbackOn) {
    // =========================================================================
    // FLOW 1: TOGGLE OFF (current Places + Routes APIs — no legacy calls)
    // =========================================================================
    var MAX_REASONABLE_ROAD_KM_INDIA = 4500;
    var distanceDebounceTimer = null;

    var getBookingPickupDropEls = function () {
      var form = document.getElementById("booking-form");
      var pickupEl = document.getElementById("pickup");
      var dropEl = document.getElementById("drop");
      if (!pickupEl && form) {
        pickupEl = form.querySelector('input[name="pickup"]');
      }
      if (!dropEl && form) {
        dropEl = form.querySelector('input[name="drop"]');
      }
      return { pickupEl: pickupEl, dropEl: dropEl };
    };

    /**
     * True once the booking form's location inputs exist in the DOM.
     * Google's SDK can finish loading before the booking form has rendered
     * (e.g. inserted by other page JS slightly after DOMContentLoaded).
     * Without this check, init() would see Google ready, find no pickup/drop
     * elements to attach to, and never retry.
     */
    var bookingFormFieldsExist = function () {
      var els = getBookingPickupDropEls();
      return !!(els.pickupEl || els.dropEl || document.querySelector('input[name="hourlyPickup"]'));
    };

    function formatDurationFromSeconds(secondsStr) {
      var sec = parseInt(String(secondsStr).replace("s", ""), 10);
      if (isNaN(sec) || sec <= 0) return "";
      var minsTotal = Math.round(sec / 60);
      var hrs = Math.floor(minsTotal / 60);
      var mins = minsTotal % 60;
      var out = "";
      if (hrs > 0) out += hrs + " hr" + (hrs === 1 ? "" : "s");
      if (mins > 0) {
        if (out !== "") out += " ";
        out += mins + " min" + (mins === 1 ? "" : "s");
      }
      return out || "0 mins";
    }

    // ---- Suggestion dropdown UI (renders AutocompleteSuggestion results) ----

    var style = document.createElement("style");
    style.innerHTML =
      ".local-autocomplete-container { position: relative; width: 100%; }" +
      ".local-autocomplete-dropdown { position: absolute; left: 0; right: 0; top: 100%; background: #1a120d; border: 1px solid rgba(245, 184, 0, 0.25); border-radius: 10px; box-shadow: 0 12px 24px -4px rgba(0, 0, 0, 0.45), 0 4px 8px -2px rgba(0, 0, 0, 0.3); max-height: 220px; overflow-y: auto; z-index: 99999; margin-top: 4px; padding: 4px 0; box-sizing: border-box; }" +
      ".local-autocomplete-item { padding: 10px 14px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-family: inherit; font-size: 0.9rem; color: #f5f0ea; text-transform: none !important; border-bottom: 1px solid rgba(255, 255, 255, 0.08); transition: background 0.15s ease; text-align: left; }" +
      ".local-autocomplete-item:last-child { border-bottom: none; }" +
      ".local-autocomplete-item:hover, .local-autocomplete-item.active { background: rgba(245, 184, 0, 0.14); }" +
      ".local-autocomplete-icon { font-size: 0.95rem; color: #f5b800; flex-shrink: 0; }" +
      ".local-autocomplete-city { font-weight: 600; color: #ffffff; }" +
      ".local-autocomplete-state { font-size: 0.85em; color: #b8ada2; }" +
      ".local-autocomplete-attribution { display: flex; align-items: center; justify-content: flex-end; gap: 5px; padding: 6px 12px; font-size: 0.68rem; color: #b8ada2; border-top: 1px solid rgba(255, 255, 255, 0.08); background: rgba(0, 0, 0, 0.2); }";
    document.head.appendChild(style);

    var activeDropdown = null;
    var activeInput = null;
    var selectedIndex = -1;
    var isSelecting = false;
    var suggestDebounce = null;
    var placesLib = null;
    var sessionToken = null;

    function closeDropdown() {
      if (activeDropdown) {
        try { activeDropdown.parentNode.removeChild(activeDropdown); } catch (e) {}
        activeDropdown = null;
      }
      activeInput = null;
      selectedIndex = -1;
    }

    function createDropdown(input, suggestions) {
      closeDropdown();
      // If location-picker.js is active (Master Location Engine), do not create duplicate UI dropdown
      if (typeof window !== "undefined" && window.locationPickerBound) return;
      if (!suggestions.length) return;

      activeInput = input;
      var dropdown = document.createElement("div");
      dropdown.className = "local-autocomplete-dropdown";

      suggestions.forEach(function (s, idx) {
        var pred = s.placePrediction;
        if (!pred) return;
        var mainText = (pred.mainText && pred.mainText.text) || (pred.text && pred.text.text) || "";
        var secondaryText = (pred.secondaryText && pred.secondaryText.text) || "";

        var item = document.createElement("div");
        item.className = "local-autocomplete-item";
        item.dataset.index = idx;
        item.innerHTML =
          "<span class='local-autocomplete-icon'>📍</span>" +
          "<div>" +
            "<span class='local-autocomplete-city'>" + mainText + "</span>" +
            "<span class='local-autocomplete-state'>" + (secondaryText ? ", " + secondaryText : "") + "</span>" +
          "</div>";

        item.addEventListener("mousedown", function (e) {
          e.preventDefault();
          selectSuggestion(input, pred, mainText, secondaryText);
        });

        dropdown.appendChild(item);
      });

      if (!dropdown.childNodes.length) return;

      // Required attribution: these suggestions come from Google's Places API,
      // rendered in our own dropdown instead of Google's native widget — Google's
      // terms require this "Powered by Google" mark whenever that's the case.
      var attribution = document.createElement("div");
      attribution.className = "local-autocomplete-attribution";
      attribution.innerHTML =
        "powered by <svg width='45' height='16' viewBox='0 0 272 92' xmlns='http://www.w3.org/2000/svg'>" +
        "<path fill='#4285F4' d='M115.75 47.18c0 12.77-9.99 22.18-22.25 22.18s-22.25-9.41-22.25-22.18c0-12.86 9.99-22.18 22.25-22.18s22.25 9.32 22.25 22.18zm-9.74 0c0-7.98-5.79-13.44-12.51-13.44S80.99 39.2 80.99 47.18c0 7.9 5.79 13.44 12.51 13.44s12.51-5.55 12.51-13.44z'/>" +
        "<path fill='#EA4335' d='M163.75 47.18c0 12.77-9.99 22.18-22.25 22.18s-22.25-9.41-22.25-22.18c0-12.85 9.99-22.18 22.25-22.18s22.25 9.32 22.25 22.18zm-9.74 0c0-7.98-5.79-13.44-12.51-13.44s-12.51 5.46-12.51 13.44c0 7.9 5.79 13.44 12.51 13.44s12.51-5.55 12.51-13.44z'/>" +
        "<path fill='#4285F4' d='M209.75 26.34v39.82c0 16.38-9.66 23.07-21.08 23.07-10.75 0-17.22-7.19-19.66-13.07l8.48-3.53c1.51 3.61 5.21 7.87 11.17 7.87 7.31 0 11.84-4.51 11.84-13v-3.19h-.34c-2.18 2.69-6.38 5.04-11.68 5.04-11.09 0-21.25-9.66-21.25-22.09 0-12.52 10.16-22.26 21.25-22.26 5.29 0 9.49 2.35 11.68 4.96h.34v-3.61h9.25zm-8.56 20.92c0-7.81-5.21-13.52-11.84-13.52-6.72 0-12.35 5.71-12.35 13.52 0 7.73 5.63 13.36 12.35 13.36 6.63 0 11.84-5.63 11.84-13.36z'/>" +
        "<path fill='#34A853' d='M225 3v65h-9.5V3h9.5z'/>" +
        "<path fill='#EA4335' d='M262.02 54.48l7.56 5.04c-2.44 3.61-8.32 9.83-18.48 9.83-12.6 0-22.01-9.74-22.01-22.18 0-13.19 9.49-22.18 20.92-22.18 11.51 0 17.14 9.16 18.98 14.11l1.01 2.52-29.65 12.28c2.27 4.45 5.8 6.72 10.75 6.72 4.96 0 8.4-2.44 10.92-6.14zm-23.28-7.98l19.82-8.23c-1.09-2.77-4.37-4.7-8.23-4.7-4.95 0-11.84 4.37-11.59 12.93z'/>" +
        "<path fill='#4285F4' d='M35.29 41.41V32H67c.31 1.64.47 3.58.47 5.68 0 7.06-1.93 15.79-8.15 22.01-6.05 6.3-13.78 9.66-24.02 9.66C16.32 69.35.36 53.89.36 34.91.36 15.93 16.32.47 35.3.47c10.5 0 17.98 4.12 23.6 9.49l-6.64 6.64c-4.03-3.78-9.49-6.72-16.97-6.72-13.86 0-24.7 11.17-24.7 25.03 0 13.86 10.84 25.03 24.7 25.03 8.99 0 14.11-3.61 17.39-6.89 2.66-2.66 4.41-6.46 5.1-11.65l-22.49.01z'/>" +
        "</svg>";
      dropdown.appendChild(attribution);

      var parent = input.parentNode;
      if (parent) {
        if (!parent.classList.contains("local-autocomplete-container")) {
          parent.classList.add("local-autocomplete-container");
        }
        parent.appendChild(dropdown);
        activeDropdown = dropdown;
      }
    }

    function selectSuggestion(input, prediction, mainText, secondaryText) {
      isSelecting = true;
      input.value = mainText + (secondaryText ? ", " + secondaryText : "");
      delete input.dataset.lat;
      delete input.dataset.lng;
      closeDropdown();

      var finish = function () {
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        isSelecting = false;
      };

      try {
        var place = prediction.toPlace();
        place.fetchFields({ fields: ["location"] }).then(function () {
          if (place.location) {
            input.dataset.lat = String(place.location.lat());
            input.dataset.lng = String(place.location.lng());
          }
          finish();
        }).catch(finish);
      } catch (e) {
        finish();
      }
    }

    function handleInput(e) {
      if (typeof window !== "undefined" && window.locationPickerBound) {
        closeDropdown();
        return;
      }
      if (isSelecting) return;
      var input = e.target;
      var query = (input.value || "").trim();
      delete input.dataset.lat;
      delete input.dataset.lng;

      if (suggestDebounce) clearTimeout(suggestDebounce);
      if (query.length < 3 || !placesLib) {
        closeDropdown();
        return;
      }

      suggestDebounce = setTimeout(function () {
        if ((input.value || "").trim() !== query) return;
        if (!sessionToken) sessionToken = new placesLib.AutocompleteSessionToken();
        placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          includedRegionCodes: ["in"],
          sessionToken: sessionToken,
        }).then(function (res) {
          if ((input.value || "").trim() !== query) return;
          createDropdown(input, (res && res.suggestions) || []);
        }).catch(function (err) {
          console.warn("Places autocomplete failed:", err);
        });
      }, 200);
    }

    function handleKeydown(e) {
      if (!activeDropdown) return;
      var items = activeDropdown.querySelectorAll(".local-autocomplete-item");
      if (!items.length) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectedIndex++;
        if (selectedIndex >= items.length) selectedIndex = 0;
        updateHighlight(items);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        selectedIndex--;
        if (selectedIndex < 0) selectedIndex = items.length - 1;
        updateHighlight(items);
      } else if (e.key === "Enter") {
        if (selectedIndex >= 0 && selectedIndex < items.length) {
          e.preventDefault();
          items[selectedIndex].dispatchEvent(new Event("mousedown"));
        }
      } else if (e.key === "Escape") {
        closeDropdown();
      }
    }

    function updateHighlight(items) {
      for (var i = 0; i < items.length; i++) {
        if (i === selectedIndex) {
          items[i].classList.add("active");
          items[i].scrollIntoView({ block: "nearest" });
        } else {
          items[i].classList.remove("active");
        }
      }
    }

    function attachSuggestFields() {
      // Yield UI dropdown handling exclusively to location-picker.js (Master Location Engine)
      closeDropdown();
      return;
      var sel = "#pickup, #drop, input[name='hourlyPickup'], #stops-list input[type='text']";
      var els = document.querySelectorAll(sel);
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.dataset.newPlacesBound) continue;
        el.dataset.newPlacesBound = "true";
        el.setAttribute("autocomplete", "off");
        el.addEventListener("input", handleInput);
        el.addEventListener("keydown", handleKeydown);
        el.addEventListener("blur", function () {
          setTimeout(closeDropdown, 250);
        });
      }
    }

    document.addEventListener("click", function (e) {
      if (activeDropdown && !activeDropdown.contains(e.target) && e.target !== activeInput) {
        closeDropdown();
      }
    });

    // ---- Distance (server-side Routes API proxy) ----

    window.DropCarsMaps = {
      pickupAutocomplete: null,
      dropAutocomplete: null,
      hourlyAutocomplete: null,
      calculatedDistance: 0,
      isCalculating: false,

      init: function () {
        var self = this;
        var googleReady = typeof google !== "undefined" && google.maps && typeof google.maps.importLibrary === "function";
        if (!googleReady || !bookingFormFieldsExist()) {
          this._mapsInitAttempts = (this._mapsInitAttempts || 0) + 1;
          if (this._mapsInitAttempts > 40) {
            console.warn("Google Maps API did not load; autocomplete and live distance are disabled.");
            return;
          }
          setTimeout(this.init.bind(this), 500);
          return;
        }

        google.maps.importLibrary("places").then(function (lib) {
          placesLib = lib;
          attachSuggestFields();
          var stopsList = document.getElementById("stops-list");
          if (stopsList && typeof MutationObserver !== "undefined") {
            new MutationObserver(attachSuggestFields).observe(stopsList, { childList: true, subtree: true });
          }
          self.bindDistanceTriggers();
        }).catch(function (e) {
          console.warn("Failed to load the Places library:", e);
        });
      },

      bindDistanceTriggers: function () {
        var self = this;
        var scheduleMatrix = function () {
          var e = getBookingPickupDropEls();
          var p = e.pickupEl && e.pickupEl.value ? String(e.pickupEl.value).trim() : "";
          var d = e.dropEl && e.dropEl.value ? String(e.dropEl.value).trim() : "";
          if (p.length >= 3 && d.length >= 3) {
            if (distanceDebounceTimer) clearTimeout(distanceDebounceTimer);
            distanceDebounceTimer = setTimeout(function () {
              var pAddr = (typeof window.DROP_ROUTE_PICKUP_ADDR === "string" && window.DROP_ROUTE_PICKUP_ADDR) ? window.DROP_ROUTE_PICKUP_ADDR : p;
              var dAddr = (typeof window.DROP_ROUTE_DROP_ADDR === "string" && window.DROP_ROUTE_DROP_ADDR) ? window.DROP_ROUTE_DROP_ADDR : d;
              self.getDistancePrecise(p, d, pAddr, dAddr);
            }, 500);
          }
        };

        var els = getBookingPickupDropEls();
        if (els.pickupEl) {
          els.pickupEl.addEventListener("change", scheduleMatrix);
          els.pickupEl.addEventListener("blur", scheduleMatrix);
        }
        if (els.dropEl) {
          els.dropEl.addEventListener("change", scheduleMatrix);
          els.dropEl.addEventListener("blur", scheduleMatrix);
        }
        scheduleMatrix();
      },

      /** Builds a {lat,lng} payload from a field's selected place, if any. */
      _waypointFor: function (el, fallbackAddress) {
        if (el && el.dataset.lat && el.dataset.lng) {
          var lat = parseFloat(el.dataset.lat);
          var lng = parseFloat(el.dataset.lng);
          if (!isNaN(lat) && !isNaN(lng)) return { lat: lat, lng: lng };
        }
        return { address: String(fallbackAddress) };
      },

      getDistance: function (origin, destination) {
        this.getDistancePrecise(origin, destination, origin, destination);
      },

      getDistancePrecise: function (labelOrigin, labelDestination, geoOrigin, geoDestination) {
        var self = this;
        var els = getBookingPickupDropEls();
        var originPayload = this._waypointFor(els.pickupEl && els.pickupEl.value.trim() === String(labelOrigin).trim() ? els.pickupEl : null, geoOrigin || labelOrigin);
        var destPayload = this._waypointFor(els.dropEl && els.dropEl.value.trim() === String(labelDestination).trim() ? els.dropEl : null, geoDestination || labelDestination);

        self.isCalculating = true;
        fetch("/api/route-distance.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ origin: originPayload, destination: destPayload }),
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            self.isCalculating = false;
            var detail = { success: false, distance: 0, duration: "", origin: labelOrigin, destination: labelDestination, error: "" };

            if (data && data.success) {
              var km = (data.distanceMeters || 0) / 1000;
              self.calculatedDistance = km;
              if (km > MAX_REASONABLE_ROAD_KM_INDIA) {
                detail.error = "distance_implausible";
                detail.distance = km;
              } else {
                detail.success = true;
                detail.distance = km;
                detail.duration = formatDurationFromSeconds(data.duration || "");
              }
            } else {
              detail.error = (data && data.error) || "routes_api_failed";
            }

            document.dispatchEvent(new CustomEvent("dropcars:distance_updated", { detail: detail }));
          })
          .catch(function () {
            self.isCalculating = false;
            document.dispatchEvent(new CustomEvent("dropcars:distance_updated", {
              detail: { success: false, distance: 0, duration: "", origin: labelOrigin, destination: labelDestination, error: "routes_api_failed" },
            }));
          });
      },
    };

    if (document.readyState === "complete" || document.readyState === "interactive") {
      window.DropCarsMaps.init();
    } else {
      document.addEventListener("DOMContentLoaded", function () {
        window.DropCarsMaps.init();
      });
    }

    return; // Exit cleanly so fallback code never runs
  }

  // =========================================================================
  // FLOW 2: TOGGLE ON (Geocoding API Fallback / Local Matching Active)
  // =========================================================================
  var MAX_REASONABLE_ROAD_KM_INDIA = 4500;

  var distanceDebounceTimer = null;
  var lastCalculatedPickup = "";
  var lastCalculatedDrop = "";

  var apiKey = "";
  var useNewRestApis = false;

  if (typeof window !== "undefined" && typeof window.GOOGLE_MAPS_API_KEY === "string") {
    apiKey = window.GOOGLE_MAPS_API_KEY.trim();
  }

  function getBookingPickupDropEls() {
    var form = document.getElementById("booking-form");
    var pickupEl = document.getElementById("pickup");
    var dropEl = document.getElementById("drop");
    if (!pickupEl && form) {
      pickupEl = form.querySelector('input[name="pickup"]');
    }
    if (!dropEl && form) {
      dropEl = form.querySelector('input[name="drop"]');
    }
    return { pickupEl: pickupEl, dropEl: dropEl };
  }

  function canAttachAutocomplete(el) {
    if (!el) return false;
    if (el.type === "hidden") return false;
    if (typeof window !== "undefined" && window.locationPickerBound) return false;
    var tag = (el.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea";
  }

  function hasLatLng(place) {
    return !!(place && place.geometry && place.geometry.location);
  }

  function recoverMapsInput(el) {
    if (!el) return;
    el.disabled = false;
    el.readOnly = false;
    el.classList.remove("gm-err-autocomplete");
    if (/went wrong/i.test(el.placeholder || "")) {
      var orig = el.dataset.origPlaceholder;
      if (orig === undefined || orig === null) orig = el.getAttribute("placeholder") || "";
      el.placeholder = orig;
    }
  }

  function recoverAllMapsInputs() {
    var sel = "input.pac-target-input, #pickup, #drop, input[name='pickup'], input[name='drop'], input[name='hourlyPickup'], #stops-list input[type='text']";
    var els = document.querySelectorAll(sel);
    for (var i = 0; i < els.length; i++) recoverMapsInput(els[i]);
  }

  function guardMapsInput(el) {
    if (!el || el.dataset.gmGuarded) return;
    el.dataset.gmGuarded = "true";
    if (!el.dataset.origPlaceholder) el.dataset.origPlaceholder = el.placeholder || "";
    if (typeof MutationObserver === "undefined") return;
    new MutationObserver(function () {
      if (el.disabled || el.classList.contains("gm-err-autocomplete")) {
        recoverMapsInput(el);
      }
    }).observe(el, { attributes: true, attributeFilter: ["disabled", "class", "placeholder"] });
  }

  var localFallbackDone = false;
  function cleanStateName(secondaryText) {
    if (!secondaryText) return "";
    var parts = secondaryText.split(",");
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim().toLowerCase();
      if (p !== "india" && p !== "") {
        return p;
      }
    }
    return "";
  }

  function formatDurationFromSeconds(secondsStr) {
    var sec = parseInt(String(secondsStr).replace("s", ""), 10);
    if (isNaN(sec) || sec <= 0) return "";
    var minsTotal = Math.round(sec / 60);
    var hrs = Math.floor(minsTotal / 60);
    var mins = minsTotal % 60;
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

  var restAutocompleteDone = false;
  var DEFAULT_CITIES = [
    { city: "Chennai International Airport (MAA)", state: "Tamil Nadu" },
    { city: "Coimbatore International Airport (CJB)", state: "Tamil Nadu" },
    { city: "Madurai International Airport (IXM)", state: "Tamil Nadu" },
    { city: "Trichy International Airport (TRZ)", state: "Tamil Nadu" },
    { city: "Salem Airport (SXV)", state: "Tamil Nadu" },
    { city: "Bangalore Kempegowda International Airport (BLR)", state: "Karnataka" },
    { city: "Tirupati Airport (TIR)", state: "Andhra Pradesh" },
    { city: "Cochin International Airport (COK)", state: "Kerala" },
    { city: "Trivandrum International Airport (TRV)", state: "Kerala" },
    { city: "Calicut International Airport (CCJ)", state: "Kerala" },
    { city: "Chennai", state: "Tamil Nadu" },
    { city: "Coimbatore", state: "Tamil Nadu" },
    { city: "Madurai", state: "Tamil Nadu" },
    { city: "Trichy (Tiruchirappalli)", state: "Tamil Nadu" },
    { city: "Salem", state: "Tamil Nadu" },
    { city: "Bangalore (Bengaluru)", state: "Karnataka" },
    { city: "Hosur", state: "Tamil Nadu" },
    { city: "Krishnagiri", state: "Tamil Nadu" },
    { city: "Vellore", state: "Tamil Nadu" },
    { city: "Pondicherry (Puducherry)", state: "Tamil Nadu" },
    { city: "Tirupati", state: "Andhra Pradesh" },
    { city: "Kumbakonam", state: "Tamil Nadu" },
    { city: "Thanjavur", state: "Tamil Nadu" },
    { city: "Pollachi", state: "Tamil Nadu" },
    { city: "Tiruppur", state: "Tamil Nadu" },
    { city: "Erode", state: "Tamil Nadu" },
    { city: "Karur", state: "Tamil Nadu" },
    { city: "Dindigul", state: "Tamil Nadu" },
    { city: "Theni", state: "Tamil Nadu" },
    { city: "Tirunelveli", state: "Tamil Nadu" },
    { city: "Tuticorin (Thoothukudi)", state: "Tamil Nadu" },
    { city: "Nagercoil", state: "Tamil Nadu" },
    { city: "Kanyakumari", state: "Tamil Nadu" },
    { city: "Rameshwaram", state: "Tamil Nadu" },
    { city: "Tiruvannamalai", state: "Tamil Nadu" },
    { city: "Kanchipuram", state: "Tamil Nadu" },
    { city: "Ooty (Udhagamandalam)", state: "Tamil Nadu" },
    { city: "Kodaikanal", state: "Tamil Nadu" },
    { city: "Yercaud", state: "Tamil Nadu" },
    { city: "Palakkad", state: "Kerala" },
    { city: "Thrissur", state: "Kerala" },
    { city: "Kochi (Cochin)", state: "Kerala" },
    { city: "Munnar", state: "Kerala" },
    { city: "Wayanad", state: "Kerala" },
    { city: "Mysore (Mysuru)", state: "Karnataka" }
  ];
  var citiesCache = DEFAULT_CITIES.slice();

  function enableRestAutocomplete() {
    if (typeof window !== "undefined" && window.locationPickerBound) return;
    if (restAutocompleteDone) return;
    restAutocompleteDone = true;

    fetch("/data/cities.json")
      .then(function (r) { return r.json(); })
      .then(function (cities) {
        if (Array.isArray(cities) && cities.length > 0) {
          citiesCache = cities;
        }
      })
      .catch(function () {});

    var style = document.createElement("style");
    style.innerHTML =
      ".local-autocomplete-container { position: relative; width: 100%; }" +
      ".local-autocomplete-dropdown { position: absolute; left: 0; right: 0; top: 100%; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); max-height: 200px; overflow-y: auto; z-index: 99999; margin-top: 4px; padding: 4px 0; box-sizing: border-box; }" +
      ".local-autocomplete-item { padding: 10px 14px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-family: inherit; font-size: 0.9rem; color: #1e293b; text-transform: none !important; border-bottom: 1px solid #f1f5f9; transition: background 0.15s ease; text-align: left; }" +
      ".local-autocomplete-item:last-child { border-bottom: none; }" +
      ".local-autocomplete-item:hover, .local-autocomplete-item.active { background: #f1f5f9; }" +
      ".local-autocomplete-icon { font-size: 0.95rem; color: #64748b; flex-shrink: 0; }" +
      ".local-autocomplete-city { font-weight: 600; color: #0f172a; }" +
      ".local-autocomplete-state { font-size: 0.85em; color: #64748b; }";
    document.head.appendChild(style);

    var activeDropdown = null;
    var activeInput = null;
    var selectedIndex = -1;
    var isSelecting = false;
    var geocodeTimeout = null;

    window.DropCarsPlaceStates = window.DropCarsPlaceStates || {};

    function closeDropdown() {
      if (activeDropdown) {
        try { activeDropdown.parentNode.removeChild(activeDropdown); } catch (e) {}
        activeDropdown = null;
      }
      activeInput = null;
      selectedIndex = -1;
    }

    var ALL_AIRPORTS = [
      { name: "Chennai International Airport (MAA)", code: "MAA", city: "Chennai", state: "Tamil Nadu", aliases: ["chennai", "madras", "maa"] },
      { name: "Coimbatore International Airport (CJB)", code: "CJB", city: "Coimbatore", state: "Tamil Nadu", aliases: ["coimbatore", "kovai", "cjb"] },
      { name: "Madurai International Airport (IXM)", code: "IXM", city: "Madurai", state: "Tamil Nadu", aliases: ["madurai", "ixm"] },
      { name: "Tiruchirappalli International Airport (TRZ)", code: "TRZ", city: "Trichy", state: "Tamil Nadu", aliases: ["trichy", "tiruchirappalli", "trz"] },
      { name: "Salem Airport (SXV)", code: "SXV", city: "Salem", state: "Tamil Nadu", aliases: ["salem", "sxv"] },
      { name: "Kempegowda International Airport Bengaluru (BLR)", code: "BLR", city: "Bangalore", state: "Karnataka", aliases: ["bangalore", "bengaluru", "blr"] },
      { name: "Tirupati Airport (TIR)", code: "TIR", city: "Tirupati", state: "Andhra Pradesh", aliases: ["tirupati", "tirumala", "tir"] },
      { name: "Cochin International Airport (COK)", code: "COK", city: "Kochi", state: "Kerala", aliases: ["cochin", "kochi", "ernakulam", "cok"] },
      { name: "Trivandrum International Airport (TRV)", code: "TRV", city: "Thiruvananthapuram", state: "Kerala", aliases: ["trivandrum", "thiruvananthapuram", "trv"] },
      { name: "Calicut International Airport (CCJ)", code: "CCJ", city: "Kozhikode", state: "Kerala", aliases: ["calicut", "kozhikode", "ccj"] },
      { name: "Kannur International Airport (CNN)", code: "CNN", city: "Kannur", state: "Kerala", aliases: ["kannur", "cnn"] },
      { name: "Vijayawada International Airport (VGA)", code: "VGA", city: "Vijayawada", state: "Andhra Pradesh", aliases: ["vijayawada", "vga"] },
      { name: "Visakhapatnam International Airport (VTZ)", code: "VTZ", city: "Visakhapatnam", state: "Andhra Pradesh", aliases: ["visakhapatnam", "vizag", "vtz"] },
      { name: "Rajahmundry Airport (RJA)", code: "RJA", city: "Rajahmundry", state: "Andhra Pradesh", aliases: ["rajahmundry", "rja"] },
      { name: "Kadapa Airport (CDP)", code: "CDP", city: "Kadapa", state: "Andhra Pradesh", aliases: ["kadapa", "cdp"] },
      { name: "Mangaluru International Airport (IXE)", code: "IXE", city: "Mangalore", state: "Karnataka", aliases: ["mangalore", "mangaluru", "ixe"] },
      { name: "Mysuru Airport (MYQ)", code: "MYQ", city: "Mysore", state: "Karnataka", aliases: ["mysore", "mysuru", "myq"] },
      { name: "Belagavi Airport (IXG)", code: "IXG", city: "Belgaum", state: "Karnataka", aliases: ["belgaum", "belagavi", "ixg"] },
      { name: "Hubballi Airport (HBX)", code: "HBX", city: "Hubli", state: "Karnataka", aliases: ["hubli", "hubballi", "hbx"] },
      { name: "Puducherry Airport (PNY)", code: "PNY", city: "Pondicherry", state: "Puducherry", aliases: ["pondicherry", "puducherry", "pny"] },
      { name: "Tuticorin Airport (TCR)", code: "TCR", city: "Thoothukudi", state: "Tamil Nadu", aliases: ["tuticorin", "thoothukudi", "tcr"] },
      { name: "Rajiv Gandhi International Airport Hyderabad (HYD)", code: "HYD", city: "Hyderabad", state: "Telangana", aliases: ["hyderabad", "hyd"] },
      { name: "Indira Gandhi International Airport Delhi (DEL)", code: "DEL", city: "New Delhi", state: "Delhi", aliases: ["delhi", "new delhi", "del"] },
      { name: "Chhatrapati Shivaji Maharaj International Airport Mumbai (BOM)", code: "BOM", city: "Mumbai", state: "Maharashtra", aliases: ["mumbai", "bombay", "bom"] },
      { name: "Goa Dabolim Airport (GOI)", code: "GOI", city: "Goa", state: "Goa", aliases: ["goa", "dabolim", "goi"] },
      { name: "Manohar International Airport Mopa (GOX)", code: "GOX", city: "Goa", state: "Goa", aliases: ["goa", "mopa", "gox"] }
    ];

    function createDropdown(input, matches) {
      closeDropdown();
      if (!matches.length) return;

      activeInput = input;
      var dropdown = document.createElement("div");
      dropdown.className = "local-autocomplete-dropdown";

      matches.forEach(function (m, idx) {
        var item = document.createElement("div");
        item.className = "local-autocomplete-item";
        item.dataset.index = idx;
        var iconStr = m.icon || (m.code ? "✈️" : "📍");
        var codeBadge = m.code ? " <span style='font-size:0.75rem;font-weight:700;background:#0284c7;color:#ffffff;padding:2px 6px;border-radius:4px;margin-left:4px;'>" + m.code + "</span>" : "";

        item.innerHTML =
          "<span class='local-autocomplete-icon'>" + iconStr + "</span>" +
          "<div>" +
            "<span class='local-autocomplete-city'>" + m.city + codeBadge + "</span>" +
            "<span class='local-autocomplete-state'>" + (m.state ? ", " + m.state : "") + "</span>" +
          "</div>";

        item.addEventListener("mousedown", function (e) {
          e.preventDefault();
          selectItem(m);
        });

        dropdown.appendChild(item);
      });

      var parent = input.parentNode;
      if (parent) {
        if (!parent.classList.contains("local-autocomplete-container")) {
          parent.classList.add("local-autocomplete-container");
        }
        parent.appendChild(dropdown);
        activeDropdown = dropdown;
      }
    }

    function selectItem(cityObj) {
      if (activeInput) {
        var val = cityObj.city + (cityObj.state && !cityObj.code ? ", " + cityObj.state : "");
        isSelecting = true;
        activeInput.value = val;
        if (cityObj.placeId) {
          activeInput.dataset.placeId = cityObj.placeId;
        } else {
          delete activeInput.dataset.placeId;
        }

        var fieldKey = activeInput.id || activeInput.name;
        if (fieldKey) {
          var cleanedState = cleanStateName(cityObj.state);
          if (cleanedState) {
            window.DropCarsPlaceStates[fieldKey] = cleanedState;
            document.dispatchEvent(new CustomEvent("dropcars:place_state_updated", {
              detail: { fieldKey: fieldKey, state: cleanedState }
            }));
          }
        }

        activeInput.dispatchEvent(new Event("input", { bubbles: true }));
        activeInput.dispatchEvent(new Event("change", { bubbles: true }));
        isSelecting = false;

        var pInp = document.getElementById("pickup");
        var dInp = document.getElementById("drop");
        if (pInp && dInp && pInp.value.trim() && dInp.value.trim()) {
          if (window.DropCarsMaps && typeof window.DropCarsMaps.getDistancePrecise === "function") {
            window.DropCarsMaps.getDistancePrecise(pInp.value.trim(), dInp.value.trim());
          }
        }
      }
      closeDropdown();
    }

    function handleAirportInput(input, query) {
      var q = query.toLowerCase().trim();
      if (!q) { closeDropdown(); return; }
      var matches = [];
      for (var i = 0; i < ALL_AIRPORTS.length; i++) {
        var a = ALL_AIRPORTS[i];
        var nameMatch = a.name.toLowerCase().indexOf(q) !== -1;
        var codeMatch = a.code.toLowerCase().indexOf(q) !== -1;
        var aliasMatch = a.aliases.some(function(al) { return al.indexOf(q) !== -1; });
        if (nameMatch || codeMatch || aliasMatch) {
          matches.push({
            city: a.name,
            state: a.state,
            code: a.code,
            icon: "✈️"
          });
          if (matches.length >= 10) break;
        }
      }
      createDropdown(input, matches);
    }

    function handleDropInput(input, query) {
      var q = query.toLowerCase().trim();
      if (!q) { closeDropdown(); return; }

      var list = (citiesCache && citiesCache.length) ? citiesCache : DEFAULT_CITIES;
      var matches = [];
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        var name = (c.city || c.name || "").toLowerCase();
        var state = (c.state || "").toLowerCase();
        if (name.indexOf(q) !== -1 || state.indexOf(q) !== -1) {
          matches.push({
            city: c.city || c.name,
            state: c.state || "",
            icon: "📍"
          });
          if (matches.length >= 8) break;
        }
      }

      if (q.length >= 2) {
        fetch("/api/geocode.php?q=" + encodeURIComponent(query))
          .then(function(r) { return r.json(); })
          .then(function(geoResults) {
            if (Array.isArray(geoResults)) {
              geoResults.forEach(function(item) {
                var disp = item.display_name || "";
                var commaIdx = disp.indexOf(",");
                var cityPart = commaIdx !== -1 ? disp.substring(0, commaIdx).trim() : disp;
                var statePart = commaIdx !== -1 ? disp.substring(commaIdx + 1).trim() : "";

                var exists = matches.some(function(m) {
                  return m.city.toLowerCase() === cityPart.toLowerCase();
                });
                if (!exists) {
                  matches.push({
                    city: cityPart,
                    state: statePart,
                    icon: "📍"
                  });
                }
              });
            }
            createDropdown(input, matches);
          })
          .catch(function() {
            createDropdown(input, matches);
          });
      } else {
        createDropdown(input, matches);
      }
    }

    function handleInput(e) {
      if (isSelecting) return;
      var input = e.target;
      var query = (input.value || "").trim();
      if (query.length < 1) {
        closeDropdown();
        return;
      }

      var inputId = (input.id || input.name || "").toLowerCase();
      if (inputId.indexOf("pickup") !== -1 || inputId === "pickup") {
        handleAirportInput(input, query);
      } else {
        handleDropInput(input, query);
      }
    }

    function handleKeydown(e) {
      if (!activeDropdown) return;
      var items = activeDropdown.querySelectorAll(".local-autocomplete-item");
      if (!items.length) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectedIndex++;
        if (selectedIndex >= items.length) selectedIndex = 0;
        updateHighlight(items);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        selectedIndex--;
        if (selectedIndex < 0) selectedIndex = items.length - 1;
        updateHighlight(items);
      } else if (e.key === "Enter") {
        if (selectedIndex >= 0 && selectedIndex < items.length) {
          e.preventDefault();
          items[selectedIndex].dispatchEvent(new Event("mousedown"));
        }
      } else if (e.key === "Escape") {
        closeDropdown();
      }
    }

    function updateHighlight(items) {
      for (var i = 0; i < items.length; i++) {
        if (i === selectedIndex) {
          items[i].classList.add("active");
          items[i].scrollIntoView({ block: "nearest" });
        } else {
          items[i].classList.remove("active");
        }
      }
    }

    // Yield UI dropdown rendering exclusively to location-picker.js

    function updateHighlight(items) {
      for (var i = 0; i < items.length; i++) {
        if (i === selectedIndex) {
          items[i].classList.add("active");
          items[i].scrollIntoView({ block: "nearest" });
        } else {
          items[i].classList.remove("active");
        }
      }
    }

    var attach = function () {
      var sel = "#pickup, #drop, input[name='hourlyPickup'], #stops-list input[type='text']";
      var els = document.querySelectorAll(sel);
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.dataset.restFallbackBound) continue;
        el.dataset.restFallbackBound = "true";
        el.setAttribute("autocomplete", "off");
        el.addEventListener("input", handleInput);
        el.addEventListener("focus", handleInput);
        el.addEventListener("keydown", handleKeydown);
        el.addEventListener("blur", function () {
          setTimeout(closeDropdown, 250);
        });
      }
    };

    attach();
    var stopsList = document.getElementById("stops-list");
    if (stopsList && typeof MutationObserver !== "undefined") {
      new MutationObserver(attach).observe(stopsList, { childList: true, subtree: true });
    }

    document.addEventListener("click", function (e) {
      if (activeDropdown && !activeDropdown.contains(e.target) && e.target !== activeInput) {
        closeDropdown();
      }
    });
  }

  var localFallbackDone = false;
  function enableLocalCityFallback() {
    if (window.DROP_CARS_UX && window.DROP_CARS_UX.enableLocalLocationFallback === false) return;
    if (localFallbackDone) return;
    localFallbackDone = true;
    fetch("/data/cities.json")
      .then(function (r) { return r.json(); })
      .then(function (cities) {
        if (!cities || !cities.length) return;

        var style = document.createElement("style");
        style.innerHTML =
          ".local-autocomplete-container { position: relative; width: 100%; }" +
          ".local-autocomplete-dropdown { position: absolute; left: 0; right: 0; top: 100%; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); max-height: 200px; overflow-y: auto; z-index: 99999; margin-top: 4px; padding: 4px 0; box-sizing: border-box; }" +
          ".local-autocomplete-item { padding: 10px 14px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-family: inherit; font-size: 0.9rem; color: #1e293b; text-transform: none !important; border-bottom: 1px solid #f1f5f9; transition: background 0.15s ease; text-align: left; }" +
          ".local-autocomplete-item:last-child { border-bottom: none; }" +
          ".local-autocomplete-item:hover, .local-autocomplete-item.active { background: #f1f5f9; }" +
          ".local-autocomplete-icon { font-size: 0.95rem; color: #64748b; flex-shrink: 0; }" +
          ".local-autocomplete-city { font-weight: 600; color: #0f172a; }" +
          ".local-autocomplete-state { font-size: 0.85em; color: #64748b; }";
        document.head.appendChild(style);

        var activeDropdown = null;
        var activeInput = null;
        var selectedIndex = -1;
        var isSelecting = false;
        var geocodeTimeout = null;

        function closeDropdown() {
          if (activeDropdown) {
            try { activeDropdown.parentNode.removeChild(activeDropdown); } catch (e) {}
            activeDropdown = null;
          }
          activeInput = null;
          selectedIndex = -1;
        }

        function createDropdown(input, matches) {
          closeDropdown();
          if (!matches.length) return;

          activeInput = input;
          var dropdown = document.createElement("div");
          dropdown.className = "local-autocomplete-dropdown";

          matches.forEach(function (m, idx) {
            var item = document.createElement("div");
            item.className = "local-autocomplete-item";
            item.dataset.index = idx;
            item.innerHTML =
              "<span class='local-autocomplete-icon'>📍</span>" +
              "<div>" +
                "<span class='local-autocomplete-city'>" + m.city + "</span>" +
                "<span class='local-autocomplete-state'>, " + m.state + "</span>" +
              "</div>";

            item.addEventListener("mousedown", function (e) {
              e.preventDefault();
              selectItem(m);
            });

            dropdown.appendChild(item);
          });

          var hint = document.createElement("div");
          hint.style.padding = "8px 14px";
          hint.style.fontSize = "0.75rem";
          hint.style.color = "#64748b";
          hint.style.background = "#f8fafc";
          hint.style.borderTop = "1px solid #e2e8f0";
          hint.style.textAlign = "center";
          hint.style.fontStyle = "italic";
          hint.innerHTML = "💡 Don't see your location? Try typing the full name and wait a moment.";
          dropdown.appendChild(hint);

          var parent = input.parentNode;
          if (parent) {
            if (!parent.classList.contains("local-autocomplete-container")) {
              parent.classList.add("local-autocomplete-container");
            }
            parent.appendChild(dropdown);
            activeDropdown = dropdown;
          }
        }

        function selectItem(cityObj) {
          if (activeInput) {
            var val = cityObj.city + ", " + cityObj.state;
            isSelecting = true;
            activeInput.value = val;
            activeInput.dispatchEvent(new Event("input", { bubbles: true }));
            activeInput.dispatchEvent(new Event("change", { bubbles: true }));
            isSelecting = false;
          }
          closeDropdown();
        }

        function handleInput(e) {
          if (isSelecting) return;
          var input = e.target;
          var query = (input.value || "").trim().toLowerCase();
          if (query.length < 1) {
            closeDropdown();
            return;
          }

          var matches = [];
          for (var i = 0; i < cities.length; i++) {
            var c = cities[i];
            var name = (c.city || c.name || "").toLowerCase();
            var words = name.split(/\s+/);
            var matchesPrefix = words.some(function(w) { return w.indexOf(query) === 0; });
            if (matchesPrefix) {
              matches.push({
                city: c.city || c.name,
                state: c.state || ""
              });
              if (matches.length >= 8) break;
            }
          }

          if (query.length >= 3 && matches.length < 5) {
            createDropdown(input, matches);
            if (geocodeTimeout) clearTimeout(geocodeTimeout);
            geocodeTimeout = setTimeout(function() {
              var currentInputVal = input.value;
              fetch("/api/geocode.php?q=" + encodeURIComponent(query))
                .then(function(r) { return r.json(); })
                .then(function(geoResults) {
                  if (input.value !== currentInputVal) return;
                  if (Array.isArray(geoResults)) {
                    geoResults.forEach(function(item) {
                      var disp = item.display_name || "";
                      var commaIdx = disp.indexOf(",");
                      var cityPart = commaIdx !== -1 ? disp.substring(0, commaIdx).trim() : disp;
                      var statePart = commaIdx !== -1 ? disp.substring(commaIdx + 1).trim() : "";

                      var exists = matches.some(function(m) {
                        return m.city.toLowerCase() === cityPart.toLowerCase();
                      });
                      if (!exists) {
                        matches.push({
                          city: cityPart,
                          state: statePart
                        });
                      }
                    });
                  }
                  createDropdown(input, matches);
                })
                .catch(function() {
                  createDropdown(input, matches);
                });
            }, 300);
          } else {
            if (geocodeTimeout) clearTimeout(geocodeTimeout);
            createDropdown(input, matches);
          }
        }

        function handleKeydown(e) {
          if (!activeDropdown) return;
          var items = activeDropdown.querySelectorAll(".local-autocomplete-item");
          if (!items.length) return;

          if (e.key === "ArrowDown") {
            e.preventDefault();
            selectedIndex++;
            if (selectedIndex >= items.length) selectedIndex = 0;
            updateHighlight(items);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            selectedIndex--;
            if (selectedIndex < 0) selectedIndex = items.length - 1;
            updateHighlight(items);
          } else if (e.key === "Enter") {
            if (selectedIndex >= 0 && selectedIndex < items.length) {
              e.preventDefault();
              items[selectedIndex].dispatchEvent(new Event("mousedown"));
            }
          } else if (e.key === "Escape") {
            closeDropdown();
          }
        }

        function updateHighlight(items) {
          for (var i = 0; i < items.length; i++) {
            if (i === selectedIndex) {
              items[i].classList.add("active");
              items[i].scrollIntoView({ block: "nearest" });
            } else {
              items[i].classList.remove("active");
            }
          }
        }

        var attach = function () {
          var sel = "#pickup, #drop, input[name='hourlyPickup'], #stops-list input[type='text']";
          var els = document.querySelectorAll(sel);
          for (var i = 0; i < els.length; i++) {
            var el = els[i];
            if (el.dataset.localFallbackBound) continue;
            el.dataset.localFallbackBound = "true";
            el.setAttribute("autocomplete", "off");
            el.addEventListener("input", handleInput);
            el.addEventListener("focus", handleInput);
            el.addEventListener("keydown", handleKeydown);
            el.addEventListener("blur", function () {
              setTimeout(closeDropdown, 250);
            });
          }
        };

        attach();
        var stopsList = document.getElementById("stops-list");
        if (stopsList && typeof MutationObserver !== "undefined") {
          new MutationObserver(attach).observe(stopsList, { childList: true, subtree: true });
        }

        document.addEventListener("click", function (e) {
          if (activeDropdown && !activeDropdown.contains(e.target) && e.target !== activeInput) {
            closeDropdown();
          }
        });
      })
      .catch(function () {});
  }

  function disableGoogleAutocomplete() {
    if (window.DropCarsMaps) {
      var self = window.DropCarsMaps;
      if (self.pickupAutocomplete) {
        try {
          self.pickupAutocomplete.unbindAll();
          if (typeof google !== "undefined" && google.maps && google.maps.event) {
            google.maps.event.clearInstanceListeners(self.pickupAutocomplete);
          }
        } catch (e) {}
        self.pickupAutocomplete = null;
      }
      if (self.dropAutocomplete) {
        try {
          self.dropAutocomplete.unbindAll();
          if (typeof google !== "undefined" && google.maps && google.maps.event) {
            google.maps.event.clearInstanceListeners(self.dropAutocomplete);
          }
        } catch (e) {}
        self.dropAutocomplete = null;
      }
      if (self.hourlyAutocomplete) {
        try {
          self.hourlyAutocomplete.unbindAll();
          if (typeof google !== "undefined" && google.maps && google.maps.event) {
            google.maps.event.clearInstanceListeners(self.hourlyAutocomplete);
          }
        } catch (e) {}
        self.hourlyAutocomplete = null;
      }
    }

    var sel = "#pickup, #drop, input[name='hourlyPickup'], #stops-list input[type='text']";
    var els = document.querySelectorAll(sel);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      try {
        if (typeof google !== "undefined" && google.maps && google.maps.event) {
          google.maps.event.clearInstanceListeners(el);
        }
      } catch (e) {}
      el.classList.remove("pac-target-input");
    }

    var containers = document.querySelectorAll(".pac-container");
    for (var j = 0; j < containers.length; j++) {
      try {
        containers[j].parentNode.removeChild(containers[j]);
      } catch (e) {}
    }
  }

  window.gm_authFailure = function () {
    console.warn("Google Maps auth failed; location fields re-enabled without autocomplete.");
    recoverAllMapsInputs();
    setTimeout(recoverAllMapsInputs, 300);
    setTimeout(recoverAllMapsInputs, 1000);
    setTimeout(recoverAllMapsInputs, 3000);
    disableGoogleAutocomplete();
    enableLocalCityFallback();
  };

  function placeStillMatchesInput(place, inputStr) {
    if (!hasLatLng(place)) return false;
    var ins = String(inputStr || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (!ins) return false;
    var fa = (place.formatted_address || "").toLowerCase();
    var nm = (place.name || "").toLowerCase();
    var insFirst = ins.split(",")[0].trim();
    if (ins === fa || ins === nm) return true;
    if (fa && (fa.indexOf(insFirst) !== -1 || ins.indexOf(fa.split(",")[0].trim()) !== -1)) return true;
    if (nm && (ins.indexOf(nm) !== -1 || nm.indexOf(insFirst) !== -1)) return true;
    return false;
  }

  window.DropCarsMaps = {
    pickupAutocomplete: null,
    dropAutocomplete: null,
    hourlyAutocomplete: null,
    calculatedDistance: 0,
    isCalculating: false,

    init: function () {
      try {
        enableRestAutocomplete();
        enableLocalCityFallback();
      } catch (e) {}

      if (
        typeof google !== "undefined" &&
        google.maps &&
        google.maps.places &&
        typeof google.maps.places.Autocomplete === "function"
      ) {
        try {
          this.initAutocomplete();
          return;
        } catch (e) {
          console.warn("Google SDK Autocomplete init failed, using REST/local fallback:", e);
        }
      }

      if (this.pickupAutocomplete || this.dropAutocomplete) return;
      if (
        typeof google === "undefined" ||
        !google.maps ||
        !google.maps.places ||
        typeof google.maps.places.Autocomplete !== "function"
      ) {
        this._mapsInitAttempts = (this._mapsInitAttempts || 0) + 1;
        if (this._mapsInitAttempts > 3) {
          enableRestAutocomplete();
          enableLocalCityFallback();
          return;
        }
        setTimeout(this.init.bind(this), 300);
        return;
      }

      try {
        this.initAutocomplete();
      } catch (e) {
        console.warn("Autocomplete init failed, retrying:", e);
        this._mapsInitAttempts = (this._mapsInitAttempts || 0) + 1;
        if (this._mapsInitAttempts <= 50) {
          setTimeout(this.init.bind(this), 500);
        } else {
          enableLocalCityFallback();
        }
      }
    },

    initAutocomplete: function () {
      if (isFallbackOn || (typeof window !== "undefined" && window.locationPickerBound)) {
        disableGoogleAutocomplete();
        return;
      }
      var options = {
        componentRestrictions: { country: "IN" },
        fields: ["address_components", "geometry", "name", "formatted_address", "place_id"],
      };

      var els = getBookingPickupDropEls();
      var pickupEl = els.pickupEl;
      var dropEl = els.dropEl;
      var hourlyEl = document.querySelector('input[name="hourlyPickup"]');

      if (pickupEl && canAttachAutocomplete(pickupEl)) {
        guardMapsInput(pickupEl);
        this.pickupAutocomplete = new google.maps.places.Autocomplete(pickupEl, options);
        this.pickupAutocomplete.addListener("place_changed", this.onPlaceChanged.bind(this, "pickup"));
      }

      if (dropEl && canAttachAutocomplete(dropEl)) {
        guardMapsInput(dropEl);
        this.dropAutocomplete = new google.maps.places.Autocomplete(dropEl, options);
        this.dropAutocomplete.addListener("place_changed", this.onPlaceChanged.bind(this, "drop"));
      }

      if (hourlyEl) {
        guardMapsInput(hourlyEl);
        this.hourlyAutocomplete = new google.maps.places.SearchBox(hourlyEl);
      }

      this.initStopAutocompletes();

      var scheduleMatrix = function () {
        var e = getBookingPickupDropEls();
        var p = e.pickupEl && e.pickupEl.value ? String(e.pickupEl.value).trim() : "";
        var d = e.dropEl && e.dropEl.value ? String(e.dropEl.value).trim() : "";
        if (p.length >= 3 && d.length >= 3) {
          if (p === lastCalculatedPickup && d === lastCalculatedDrop) {
            return;
          }
          if (distanceDebounceTimer) clearTimeout(distanceDebounceTimer);
          distanceDebounceTimer = setTimeout(function () {
            lastCalculatedPickup = p;
            lastCalculatedDrop = d;
            var pAddr = (typeof window.DROP_ROUTE_PICKUP_ADDR === "string" && window.DROP_ROUTE_PICKUP_ADDR) ? window.DROP_ROUTE_PICKUP_ADDR : p;
            var dAddr = (typeof window.DROP_ROUTE_DROP_ADDR === "string" && window.DROP_ROUTE_DROP_ADDR) ? window.DROP_ROUTE_DROP_ADDR : d;
            window.DropCarsMaps.getDistancePrecise(p, d, pAddr, dAddr);
          }, 500);
        }
      };

      if (pickupEl) {
        pickupEl.addEventListener("change", scheduleMatrix);
        pickupEl.addEventListener("blur", scheduleMatrix);
      }
      if (dropEl) {
        dropEl.addEventListener("change", scheduleMatrix);
        dropEl.addEventListener("blur", scheduleMatrix);
      }

      scheduleMatrix();

      var self = this;
      document.addEventListener("dropcars:trip_type_changed", function(e) {
         if (!self.pickupAutocomplete || !self.dropAutocomplete) return;

         var type = e.detail.type;
         var dir = e.detail.direction;

         if (type === "airport_transfer") {
            if (dir === "from_airport") {
               self.pickupAutocomplete.setOptions({ types: ["airport"], componentRestrictions: { country: "IN" } });
               self.dropAutocomplete.setOptions({ types: [], componentRestrictions: { country: "IN" } });
            } else {
               self.pickupAutocomplete.setOptions({ types: [], componentRestrictions: { country: "IN" } });
               self.dropAutocomplete.setOptions({ types: ["airport"], componentRestrictions: { country: "IN" } });
            }
         } else {
            self.pickupAutocomplete.setOptions({ types: [], componentRestrictions: { country: "IN" } });
            self.dropAutocomplete.setOptions({ types: [], componentRestrictions: { country: "IN" } });
         }
      });
    },

    initStopAutocompletes: function () {
      if (typeof google === "undefined" || !google.maps || !google.maps.places) return;
      var stopsContainer = document.getElementById("stops-list");
      if (!stopsContainer) return;
      var inputs = stopsContainer.querySelectorAll('input[type="text"]');
      var options = {
        componentRestrictions: { country: "IN" },
        fields: ["address_components", "geometry", "name", "formatted_address", "place_id"],
      };

      inputs.forEach(function (input) {
        if (input.dataset.autocompleteBound) return;
        guardMapsInput(input);
        var autocomplete = new google.maps.places.Autocomplete(input, options);
        autocomplete.addListener("place_changed", function () {
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          var eels = getBookingPickupDropEls();
          if (eels.pickupEl && eels.dropEl && eels.pickupEl.value && eels.dropEl.value) {
            window.DropCarsMaps.getDistance(
              String(eels.pickupEl.value).trim(),
              String(eels.dropEl.value).trim()
            );
          }
        });
        input.dataset.autocompleteBound = "true";
      });
    },

    resolveOriginDestination: function (pickupStr, dropStr) {
      var o = pickupStr;
      var d = dropStr;
      if (this.pickupAutocomplete && this.pickupAutocomplete.getPlace) {
        var gp = this.pickupAutocomplete.getPlace();
        if (placeStillMatchesInput(gp, pickupStr)) {
          o = gp.geometry.location;
        }
      }
      if (this.dropAutocomplete && this.dropAutocomplete.getPlace) {
        var gd = this.dropAutocomplete.getPlace();
        if (placeStillMatchesInput(gd, dropStr)) {
          d = gd.geometry.location;
        }
      }
      return { origin: o, destination: d };
    },

    onPlaceChanged: function () {
      var eels = getBookingPickupDropEls();
      var pickup = eels.pickupEl ? String(eels.pickupEl.value || "").trim() : "";
      var drop = eels.dropEl ? String(eels.dropEl.value || "").trim() : "";

      if (pickup && drop) {
        lastCalculatedPickup = pickup;
        lastCalculatedDrop = drop;
        if (distanceDebounceTimer) clearTimeout(distanceDebounceTimer);
        this.getDistance(pickup, drop);
      }
    },

    getDistance: function (origin, destination) {
      lastCalculatedPickup = String(origin).trim();
      lastCalculatedDrop = String(destination).trim();
      if (distanceDebounceTimer) clearTimeout(distanceDebounceTimer);
      var self = this;
      if (useNewRestApis) {
        var o = origin;
        var d = destination;

        var pickupEl = document.getElementById("pickup");
        var dropEl = document.getElementById("drop");
        if (pickupEl && pickupEl.value === origin && pickupEl.dataset.placeId) {
          o = { placeId: pickupEl.dataset.placeId };
        }
        if (dropEl && dropEl.value === destination && dropEl.dataset.placeId) {
          d = { placeId: dropEl.dataset.placeId };
        }

        self.getDistanceNew(o, d, origin, destination);
        return;
      }

      if (
        typeof google === "undefined" ||
        !google.maps ||
        !google.maps.DistanceMatrixService
      ) {
        self.isCalculating = false;
        document.dispatchEvent(
          new CustomEvent("dropcars:distance_updated", {
            detail: {
              success: false,
              distance: 0,
              duration: "",
              origin: origin,
              destination: destination,
              error: "maps_not_loaded",
            },
          })
        );
        return;
      }

      var resolved = self.resolveOriginDestination(origin, destination);
      self._runDistanceMatrix(origin, destination, resolved.origin, resolved.destination);
    },

    getDistancePrecise: function (labelOrigin, labelDestination, geoOrigin, geoDestination) {
      var self = this;
      if (useNewRestApis) {
        self.getDistanceNew(geoOrigin || labelOrigin, geoDestination || labelDestination, labelOrigin, labelDestination);
        return;
      }

      if (
        typeof google === "undefined" ||
        !google.maps ||
        !google.maps.DistanceMatrixService
      ) {
        self.isCalculating = false;
        document.dispatchEvent(
          new CustomEvent("dropcars:distance_updated", {
            detail: {
              success: false,
              distance: 0,
              duration: "",
              origin: labelOrigin,
              destination: labelDestination,
              error: "maps_not_loaded",
            },
          })
        );
        return;
      }

      self._runDistanceMatrix(labelOrigin, labelDestination, geoOrigin || labelOrigin, geoDestination || labelDestination);
    },

    getDistanceNew: function (origin, destination, labelOrigin, labelDestination) {
      var self = this;
      self.isCalculating = true;

      var originPayload = (origin && typeof origin === "object" && origin.placeId) ? { placeId: origin.placeId } : { address: (origin || labelOrigin) + (String(origin || labelOrigin).indexOf("India") === -1 ? ", India" : "") };
      var destPayload = (destination && typeof destination === "object" && destination.placeId) ? { placeId: destination.placeId } : { address: (destination || labelDestination) + (String(destination || labelDestination).indexOf("India") === -1 ? ", India" : "") };

      fetch("/api/route-distance.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: originPayload, destination: destPayload }),
      })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        self.isCalculating = false;
        var detail = {
          success: false,
          distance: 0,
          duration: "",
          origin: labelOrigin,
          destination: labelDestination,
          error: ""
        };

        if (data && data.success) {
          var meters = data.distanceMeters || 0;
          var km = meters / 1000;
          var durSec = data.duration || "";
          var durationText = formatDurationFromSeconds(durSec);
          self.calculatedDistance = km;

          if (km > MAX_REASONABLE_ROAD_KM_INDIA) {
            detail.error = "distance_implausible";
            detail.distance = km;
          } else {
            detail.success = true;
            detail.distance = km;
            detail.duration = durationText;
          }
        } else {
          detail.error = (data && data.error) || "routes_api_failed";
        }

        document.dispatchEvent(new CustomEvent("dropcars:distance_updated", { detail: detail }));
      })
      .catch(function (err) {
        self.isCalculating = false;
        console.error("Route distance API failed:", err);
        document.dispatchEvent(
          new CustomEvent("dropcars:distance_updated", {
            detail: {
              success: false,
              distance: 0,
              duration: "",
              origin: labelOrigin,
              destination: labelDestination,
              error: "routes_api_failed"
            }
          })
        );
      });
    },

    _runDistanceMatrix: function (labelOrigin, labelDestination, origin, destination) {
      var self = this;
      var service = new google.maps.DistanceMatrixService();
      this.isCalculating = true;

      var usedLatLng =
        origin &&
        destination &&
        typeof origin.lat === "function" &&
        typeof destination.lat === "function";

      service.getDistanceMatrix(
        {
          origins: [origin],
          destinations: [destination],
          travelMode: google.maps.TravelMode.DRIVING,
          unitSystem: google.maps.UnitSystem.METRIC,
        },
        function (response, status) {
          self.isCalculating = false;
          var detail = {
            success: false,
            distance: 0,
            duration: "",
            origin: labelOrigin,
            destination: labelDestination,
            matrixStatus: status,
            elementStatus: "",
            usedPreciseLocations: !!usedLatLng,
            error: "",
          };

          if (status === "OK" && response.rows && response.rows[0] && response.rows[0].elements && response.rows[0].elements[0]) {
            var el = response.rows[0].elements[0];
            detail.elementStatus = el.status || "";
            if (el.status === "OK" && el.distance) {
              var durationText = el.duration ? el.duration.text : "";
              var distanceValue = el.distance.value;
              var km = distanceValue / 1000;
              self.calculatedDistance = km;

              if (km > MAX_REASONABLE_ROAD_KM_INDIA) {
                detail.success = false;
                detail.distance = km;
                detail.duration = durationText;
                detail.error = "distance_implausible";
              } else {
                detail.success = true;
                detail.distance = km;
                detail.duration = durationText;
              }
            }
          }

          document.dispatchEvent(new CustomEvent("dropcars:distance_updated", { detail: detail }));
        }
      );
    },
  };

  if (document.readyState === "complete" || document.readyState === "interactive") {
    window.DropCarsMaps.init();
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      window.DropCarsMaps.init();
    });
  }

  function initViaImportLibrary() {
    try {
      if (typeof google !== "undefined" && google.maps && typeof google.maps.importLibrary === "function") {
        google.maps.importLibrary("places").then(function () {
          window.DropCarsMaps.init();
        }).catch(function () {});
        return true;
      }
    } catch (e) {}
    return false;
  }
  if (!initViaImportLibrary()) {
    window.addEventListener("load", initViaImportLibrary);
    var prevReady = window.dropcarsMapsReady;
    window.dropcarsMapsReady = function () {
      window.__dcMapsReady = true;
      if (typeof prevReady === "function") { try { prevReady(); } catch (e) {} }
      initViaImportLibrary();
    };
    if (window.__dcMapsReady) initViaImportLibrary();
  }

  // Geolocation (Current Location) Detector
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".detect-location-btn");
    if (!btn) return;
    var input = document.getElementById("pickup");
    if (!input && btn.parentNode) {
      input = btn.parentNode.querySelector("input[name='pickup']");
    }
    if (input && navigator.geolocation) {
      btn.style.opacity = "0.5";
      btn.style.pointerEvents = "none";
      navigator.geolocation.getCurrentPosition(
        function (position) {
          var lat = position.coords.latitude;
          var lng = position.coords.longitude;
          fetch("/api/geocode.php?lat=" + lat + "&lng=" + lng)
            .then(function (r) { return r.json(); })
            .then(function (res) {
              btn.style.opacity = "1";
              btn.style.pointerEvents = "auto";
              if (res && res.display_name) {
                input.value = res.display_name;
                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.dispatchEvent(new Event("change", { bubbles: true }));
              } else {
                alert("Could not detect location name.");
              }
            })
            .catch(function () {
              btn.style.opacity = "1";
              btn.style.pointerEvents = "auto";
              alert("Error resolving current location.");
            });
        },
        function (err) {
          btn.style.opacity = "1";
          btn.style.pointerEvents = "auto";
          console.warn("Geolocation error:", err);
          alert("Unable to retrieve location. Please check browser permissions.");
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      alert("Geolocation is not supported by this browser.");
    }
  });
})();
