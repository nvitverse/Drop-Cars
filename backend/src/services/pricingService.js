const Pricing = require('../models/Pricing');
const Promo = require('../models/Promo');

async function calculateFare({ vehicleType, tripType, distanceKm, durationMin, hoursBooked, promoCode, userId }) {
  const pricing = await Pricing.findOne({ vehicleType, isActive: true });
  if (!pricing) throw Object.assign(new Error('Pricing not configured for this vehicle'), { status: 422 });

  let total = 0;
  let base = 0;
  let perKmCharge = 0;
  let perMinCharge = 0;
  let airportSurcharge = 0;

  if (tripType === 'hourly') {
    const pkg = pricing.hourlyPackages.find((p) => p.hours === hoursBooked);
    if (!pkg) throw Object.assign(new Error('Invalid hourly package'), { status: 422 });
    total = pkg.price;
    base = pkg.price;
  } else if (tripType === 'outstation') {
    const days = Math.ceil((hoursBooked || 8) / 8);
    total = pricing.outstationPerDayFare * days + pricing.outstationPerKm * distanceKm;
    base = pricing.outstationPerDayFare * days;
    perKmCharge = pricing.outstationPerKm * distanceKm;
  } else {
    base = pricing.baseFare;
    perKmCharge = pricing.perKm * distanceKm;
    perMinCharge = pricing.perMin * durationMin;
    total = base + perKmCharge + perMinCharge;

    if (tripType === 'round-trip') total *= pricing.roundTripMultiplier;
    if (tripType === 'airport') {
      airportSurcharge = pricing.airportSurcharge;
      total += airportSurcharge;
    }
  }

  total = Math.max(total, pricing.minimumFare);
  total *= pricing.surgeFactor;

  let discount = 0;
  if (promoCode) {
    const promo = await Promo.findOne({
      code: promoCode.toUpperCase(),
      isActive: true,
      expiresAt: { $gt: new Date() },
      $expr: { $lt: ['$usageCount', '$usageLimit'] },
      applicableVehicles: vehicleType,
    });
    if (promo) {
      if (userId && promo.perUserLimit > 0) {
        const used = promo.usedBy.filter((id) => String(id) === String(userId)).length;
        if (used >= promo.perUserLimit) throw Object.assign(new Error('Promo already used'), { status: 422 });
      }
      if (total >= promo.minimumFare) {
        discount =
          promo.discountType === 'flat'
            ? promo.discountValue
            : Math.min((total * promo.discountValue) / 100, promo.maxDiscount || Infinity);
        total -= discount;
      }
    }
  }

  return {
    base: Math.round(base),
    perKmCharge: Math.round(perKmCharge),
    perMinCharge: Math.round(perMinCharge),
    airportSurcharge: Math.round(airportSurcharge),
    discount: Math.round(discount),
    total: Math.round(Math.max(total, 0)),
    surgeFactor: pricing.surgeFactor,
  };
}

module.exports = { calculateFare };
