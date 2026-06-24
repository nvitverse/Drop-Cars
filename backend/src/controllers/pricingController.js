const Pricing = require('../models/Pricing');

const DEFAULT_PRICING = [
  {
    vehicleType: 'hatchback', vehicleLabel: 'Hatchback', vehicleExamples: 'Swift, WagonR', capacity: 4,
    baseFare: 50, perKm: 10, perMin: 1, minimumFare: 80, surgeFactor: 1.0, airportSurcharge: 100,
    outstationPerDayFare: 1500, outstationPerKm: 11, roundTripMultiplier: 1.8,
    hourlyPackages: [{ hours: 4, km: 40, price: 500 }, { hours: 8, km: 80, price: 900 }],
  },
  {
    vehicleType: 'sedan', vehicleLabel: 'Sedan', vehicleExamples: 'Dzire, Honda Amaze', capacity: 4,
    baseFare: 70, perKm: 13, perMin: 1.5, minimumFare: 100, surgeFactor: 1.0, airportSurcharge: 150,
    outstationPerDayFare: 2000, outstationPerKm: 14, roundTripMultiplier: 1.8,
    hourlyPackages: [{ hours: 4, km: 40, price: 700 }, { hours: 8, km: 80, price: 1200 }],
  },
  {
    vehicleType: 'suv', vehicleLabel: 'SUV', vehicleExamples: 'Ertiga, Marazzo', capacity: 6,
    baseFare: 100, perKm: 16, perMin: 2, minimumFare: 150, surgeFactor: 1.0, airportSurcharge: 200,
    outstationPerDayFare: 2500, outstationPerKm: 17, roundTripMultiplier: 1.8,
    hourlyPackages: [{ hours: 4, km: 40, price: 950 }, { hours: 8, km: 80, price: 1600 }],
  },
  {
    vehicleType: 'luxury', vehicleLabel: 'Luxury', vehicleExamples: 'Innova Crysta, Fortuner', capacity: 6,
    baseFare: 150, perKm: 20, perMin: 2.5, minimumFare: 250, surgeFactor: 1.0, airportSurcharge: 300,
    outstationPerDayFare: 3500, outstationPerKm: 22, roundTripMultiplier: 1.8,
    hourlyPackages: [{ hours: 4, km: 40, price: 1400 }, { hours: 8, km: 80, price: 2500 }],
  },
];

// GET /api/pricing
exports.getPricing = async (req, res, next) => {
  try {
    let pricing = await Pricing.find({ isActive: true });
    if (!pricing.length) {
      await Pricing.insertMany(DEFAULT_PRICING);
      pricing = await Pricing.find({ isActive: true });
    }
    res.json(pricing);
  } catch (err) { next(err); }
};

// PUT /api/pricing/:vehicleType  (admin)
exports.updatePricing = async (req, res, next) => {
  try {
    const pricing = await Pricing.findOneAndUpdate(
      { vehicleType: req.params.vehicleType },
      req.body,
      { new: true, upsert: true }
    );
    res.json(pricing);
  } catch (err) { next(err); }
};
