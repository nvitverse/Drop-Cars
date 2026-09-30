/**
 * Fare calculator – estimates and vehicle options
 * Drop Cars – Premium intercity taxi
 */

(function () {
  "use strict";

  /** Format date for display (e.g. "Fri, 20 Dec") */
  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    return date.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }

  /** Estimate fare from distance hint and passenger band (legacy) */
  function estimateFare(distanceHint, passengerBand) {
    const base = distanceHint > 350 ? 5999 : 4999;
    const vehicleFactor =
      passengerBand === "4-6" ? 1.35 : passengerBand === "7+" ? 1.7 : 1;
    return Math.round(base * vehicleFactor);
  }

  /** Suba-style fare: (distance × rate) + driver bata. vehicleType: SEDAN|SUV|INNOVA|CRYSTA */
  function calculateFareOneWay(distanceKm, vehicleType, discount, minDistOverride) {
    var cfg = window.DROP_CARS_CONFIG;
    if (!cfg || !cfg.fares) return estimateFare(distanceKm || 130, "1-3");
    var v = (vehicleType || "SEDAN").toUpperCase();
    var rate = cfg.fares.baseFareOneWay[v] || cfg.fares.baseFareOneWay.SEDAN || 14;
    var bata = (cfg.fares.bataOneWay && cfg.fares.bataOneWay[v]) || cfg.fares.driverBata || 400;
    var minDist = (minDistOverride != null ? minDistOverride : cfg.fares.minDistanceOneWay) || 130;
    var effDist = Math.max(distanceKm || minDist, minDist);
    
    var finalRate = rate;
    var flatDeduct = 0;
    if (discount && discount.value > 0) {
      if (discount.type === 'percentage') {
        finalRate = rate * (1 - (discount.value / 100));
      } else {
        flatDeduct = discount.value;
      }
    }
    
    return Math.round(effDist * finalRate + bata - flatDeduct);
  }

  /** Round trip: (distance × rate) + (bata × tripDays). tripDays defaults to 1. */
  function calculateFareRoundTrip(distanceKm, vehicleType, tripDays, discount, minDistOverride) {
    var cfg = window.DROP_CARS_CONFIG;
    if (!cfg || !cfg.fares) return Math.round(calculateFareOneWay(distanceKm, vehicleType, discount) * 1.8);
    var v = (vehicleType || "SEDAN").toUpperCase();
    var rate = cfg.fares.baseFareRoundTrip[v] || cfg.fares.baseFareRoundTrip.SEDAN || 13;
    var bata = (cfg.fares.bataRoundTrip && cfg.fares.bataRoundTrip[v]) || cfg.fares.driverBata || 400;
    var days = tripDays || 1;
    var minDist = minDistOverride != null ? minDistOverride : days * (cfg.fares.minDistanceRoundTripPerDay || 250);
    var effDist = Math.max(distanceKm || minDist, minDist);

    var finalRate = rate;
    var flatDeduct = 0;
    if (discount && discount.value > 0) {
      if (discount.type === 'percentage') {
        finalRate = rate * (1 - (discount.value / 100));
      } else {
        flatDeduct = discount.value;
      }
    }
    
    return Math.round(effDist * finalRate + bata * days - flatDeduct);
  }

  /** Calculate old fare (strikethrough) for one-way */
  function calculateOldFareOneWay(distanceKm, vehicleType, minDistOverride) {
    var cfg = window.DROP_CARS_CONFIG;
    if (!cfg || !cfg.fares || !cfg.fares.oldFareOneWay) return 0;
    var v = (vehicleType || "SEDAN").toUpperCase();
    var rate = cfg.fares.oldFareOneWay[v] || 0;
    var bata = cfg.fares.oldBataOneWay[v] || 0;
    if (rate <= 0) return 0;
    var minDist = (minDistOverride != null ? minDistOverride : cfg.fares.minDistanceOneWay) || 130;
    var effDist = Math.max(distanceKm || minDist, minDist);
    return Math.round(effDist * rate + bata);
  }

  /** Calculate old fare (strikethrough) for round trip */
  function calculateOldFareRoundTrip(distanceKm, vehicleType, tripDays, minDistOverride) {
    var cfg = window.DROP_CARS_CONFIG;
    if (!cfg || !cfg.fares || !cfg.fares.oldFareRoundTrip) return 0;
    var v = (vehicleType || "SEDAN").toUpperCase();
    var rate = cfg.fares.oldFareRoundTrip[v] || 0;
    var bata = cfg.fares.oldBataRoundTrip[v] || 0;
    if (rate <= 0) return 0;
    var days = tripDays || 1;
    var minDist = minDistOverride != null ? minDistOverride : days * (cfg.fares.minDistanceRoundTripPerDay || 250);
    var effDist = Math.max(distanceKm || minDist, minDist);
    return Math.round(effDist * rate + bata * days);
  }

  /** Hourly: rate × hours. hours from package (5, 8, 10, 12). */
  function calculateFareHourly(vehicleType, hours) {
    var cfg = window.DropCarsConfig;
    if (!cfg || !cfg.fares) return 2500;
    var rate = cfg.fares.hourlyRates[vehicleType] || cfg.fares.hourlyRates.SEDAN;
    var h = parseInt(hours, 10) || 5;
    return Math.round(rate * h);
  }

  /** Map passenger count to band (1-3, 4-6, 7+) */
  function passengerBandFromCount(count) {
    if (count === 0 || count <= 4) return "1-3";
    if (count <= 6) return "4-6";
    return "7+";
  }

  /** Vehicle options for quote modal */
  function getRatePerKm(vehicleType) {
    var cfg = window.DROP_CARS_CONFIG;
    var v = (vehicleType || "SEDAN").toUpperCase();
    if (cfg && cfg.fares && cfg.fares.baseFareOneWay && cfg.fares.baseFareOneWay[v]) {
      return cfg.fares.baseFareOneWay[v];
    }
    var fallback = {
      SEDAN: 14,
      SUV: 19,
      INNOVA: 20,
      CRYSTA: 24,
    };
    return fallback[v] || fallback.SEDAN;
  }

  /** Detailed breakdown for emails / Telegram (must match calculateFareOneWay math). */
  function getOneWayFareBreakdown(distanceKm, vehicleType, discount, minDistOverride) {
    var cfg = window.DROP_CARS_CONFIG;
    if (!cfg || !cfg.fares) return null;
    var v = (vehicleType || "SEDAN").toUpperCase();
    var rate = cfg.fares.baseFareOneWay[v] || cfg.fares.baseFareOneWay.SEDAN || 14;
    var bata = (cfg.fares.bataOneWay && cfg.fares.bataOneWay[v]) || cfg.fares.driverBata || 400;
    var minDist = (minDistOverride != null ? minDistOverride : cfg.fares.minDistanceOneWay) || 130;
    var actual = Number(distanceKm) || 0;
    var effDist = Math.max(actual, minDist);

    var finalRate = rate;
    var flatDeduct = 0;
    if (discount && discount.value > 0) {
      if (discount.type === 'percentage') {
        finalRate = rate * (1 - (discount.value / 100));
      } else {
        flatDeduct = discount.value;
      }
    }

    var kmCharge = Math.round(effDist * finalRate);
    var totalFare = Math.round(effDist * finalRate + bata - flatDeduct);
    return {
      actualRouteKm: Math.round(actual * 10) / 10,
      minimumBillableKm: minDist,
      effectiveBillableKm: Math.round(effDist * 10) / 10,
      perKmRate: rate,
      discountedRate: finalRate !== rate ? finalRate : null,
      kmCharge: kmCharge,
      driverBata: bata,
      flatDiscount: flatDeduct > 0 ? flatDeduct : 0,
      extraKmBelowMinimum: actual < minDist ? Math.round((minDist - actual) * 10) / 10 : 0,
      extraKmAboveMinimum: actual > minDist ? Math.round((actual - minDist) * 10) / 10 : 0,
      totalFare: totalFare,
    };
  }

  /** Detailed breakdown for round trip (must match calculateFareRoundTrip math). */
  function getRoundTripFareBreakdown(totalDistanceKm, vehicleType, tripDays, discount, minDistOverride) {
    var cfg = window.DROP_CARS_CONFIG;
    if (!cfg || !cfg.fares) return null;
    var v = (vehicleType || "SEDAN").toUpperCase();
    var rate = cfg.fares.baseFareRoundTrip[v] || cfg.fares.baseFareRoundTrip.SEDAN || 13;
    var bataPerDay = (cfg.fares.bataRoundTrip && cfg.fares.bataRoundTrip[v]) || cfg.fares.driverBata || 400;
    var days = tripDays || 1;
    var minDist = minDistOverride != null ? minDistOverride : days * (cfg.fares.minDistanceRoundTripPerDay || 250);
    var actual = Number(totalDistanceKm) || 0;
    var effDist = Math.max(actual, minDist);

    var finalRate = rate;
    var flatDeduct = 0;
    if (discount && discount.value > 0) {
      if (discount.type === 'percentage') {
        finalRate = rate * (1 - (discount.value / 100));
      } else {
        flatDeduct = discount.value;
      }
    }

    var kmCharge = Math.round(effDist * finalRate);
    var bataTotal = bataPerDay * days;
    var totalFare = Math.round(effDist * finalRate + bataTotal - flatDeduct);
    return {
      actualRouteKmTotal: Math.round(actual * 10) / 10,
      minimumBillableKm: minDist,
      effectiveBillableKm: Math.round(effDist * 10) / 10,
      perKmRate: rate,
      discountedRate: finalRate !== rate ? finalRate : null,
      tripDays: days,
      kmCharge: kmCharge,
      driverBataPerDay: bataPerDay,
      driverBataTotal: bataTotal,
      flatDiscount: flatDeduct > 0 ? flatDeduct : 0,
      extraKmBelowMinimum: actual < minDist ? Math.round((minDist - actual) * 10) / 10 : 0,
      extraKmAboveMinimum: actual > minDist ? Math.round((actual - minDist) * 10) / 10 : 0,
      totalFare: totalFare,
    };
  }

  /** Hourly package breakdown for emails / Telegram. */
  function getHourlyFareBreakdown(vehicleType, hours) {
    var cfg = window.DropCarsConfig || window.DROP_CARS_CONFIG;
    if (!cfg || !cfg.fares || !cfg.fares.hourlyRates) return null;
    var v = (vehicleType || "SEDAN").toUpperCase();
    var rate = cfg.fares.hourlyRates[v] || cfg.fares.hourlyRates.SEDAN || 300;
    var h = parseInt(hours, 10) || 5;
    return {
      hourlyRate: rate,
      hours: h,
      packageTotal: Math.round(rate * h),
    };
  }

  const VEHICLE_OPTIONS = [
    {
      id: "sedan",
      name: "Sedan",
      capacity: "4 seats",
      comfort: "A/C",
      rate: "₹" + getRatePerKm("SEDAN") + "/km",
      priceLabel: "Popular",
      image: "/assets/images/vehicles/sedan.png",
    },
    {
      id: "suv",
      name: "SUV",
      capacity: "6 seats",
      comfort: "A/C",
      rate: "₹" + getRatePerKm("SUV") + "/km",
      priceLabel: "Compact SUV",
      image: "/assets/images/vehicles/suv.png",
    },
    {
      id: "innova",
      name: "Innova",
      capacity: "6/7 seats",
      comfort: "A/C",
      rate: "₹" + getRatePerKm("INNOVA") + "/km",
      priceLabel: "Premium",
      image: "/assets/images/vehicles/innova.png",
    },
    {
      id: "crysta",
      name: "Innova Crysta",
      capacity: "6/7 seats",
      comfort: "A/C",
      rate: "₹" + getRatePerKm("CRYSTA") + "/km",
      priceLabel: "Executive",
      image: "/assets/images/vehicles/crysta.png",
    },
  ];

  window.DropCarsFare = {
    formatDate,
    estimateFare,
    passengerBandFromCount,
    calculateFareOneWay,
    calculateFareRoundTrip,
    calculateOldFareOneWay,
    calculateOldFareRoundTrip,
    calculateFareHourly,
    getOneWayFareBreakdown,
    getRoundTripFareBreakdown,
    getHourlyFareBreakdown,
    VEHICLE_OPTIONS,
  };
})();
