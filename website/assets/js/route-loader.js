/**
 * Route loader – distance hints for known city pairs
 * Drop Cars – Premium intercity taxi
 * (Can later load from data/routes.json)
 */

(function () {
  "use strict";

  var keyRouteDistances = window.DROP_CARS_DISTANCES || {};

  // Lazily hydrate distance cache in background without blocking initial page parse
  if (typeof window !== "undefined" && (!window.DROP_CARS_DISTANCES || Object.keys(window.DROP_CARS_DISTANCES).length === 0)) {
    if (typeof fetch === "function") {
      setTimeout(function () {
        fetch("/data/distance_cache.json")
          .then(function (res) { return res.json(); })
          .then(function (data) {
            if (data && typeof data === "object") {
              window.DROP_CARS_DISTANCES = data;
              keyRouteDistances = data;
            }
          })
          .catch(function () {});
      }, 1500); // 1.5s delay after page load ensures critical rendering is 100% complete
    }
  }

  function normalizePlace(value) {
    var raw = (value || "").toString().toLowerCase().trim();
    if (!raw) return "";
    // Prefer primary token before comma for inputs like "Chennai, Tamil Nadu, India"
    var primary = raw.split(",")[0].trim();
    // Remove common suffixes/noise words
    primary = primary
      .replace(/\b(city|district|state|india)\b/g, " ")
      .replace(/\b(tamil\s*nadu|karnataka|kerala|andhra\s*pradesh|puducherry)\b/g, " ")
      .replace(/[^a-z0-9\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return primary.replace(/\s+/g, "-");
  }

  function candidateKeys(value) {
    var raw = (value || "").toString().toLowerCase().trim();
    var norm = normalizePlace(value);
    var keys = [];
    if (raw) keys.push(raw);
    if (norm && keys.indexOf(norm) === -1) keys.push(norm);
    return keys;
  }

  /** Get distance in km for pickup–drop pair; default if unknown */
  function getDistanceHint(pickup, drop) {
    if (!pickup || !drop) return 0;
    var fromKeys = candidateKeys(pickup);
    var toKeys = candidateKeys(drop);

    for (var i = 0; i < fromKeys.length; i++) {
      for (var j = 0; j < toKeys.length; j++) {
        var direct = fromKeys[i] + "," + toKeys[j];
        if (Object.prototype.hasOwnProperty.call(keyRouteDistances, direct)) {
          return Number(keyRouteDistances[direct]) || 0;
        }
        var reverse = toKeys[j] + "," + fromKeys[i];
        if (Object.prototype.hasOwnProperty.call(keyRouteDistances, reverse)) {
          return Number(keyRouteDistances[reverse]) || 0;
        }
      }
    }
    return 0;
  }

  window.DropCarsRoute = {
    getDistanceHint: getDistanceHint,
  };
})();
