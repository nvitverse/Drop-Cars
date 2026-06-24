const mongoose = require('mongoose');

const pricingSchema = new mongoose.Schema(
  {
    vehicleType: {
      type: String,
      enum: ['hatchback', 'sedan', 'suv', 'luxury'],
      required: true,
      unique: true,
    },
    vehicleLabel: { type: String, required: true },
    vehicleExamples: String,
    capacity: { type: Number, default: 4 },
    baseFare: { type: Number, required: true },
    perKm: { type: Number, required: true },
    perMin: { type: Number, required: true },
    minimumFare: { type: Number, required: true },
    surgeFactor: { type: Number, default: 1.0 },
    airportSurcharge: { type: Number, default: 0 },
    outstationPerDayFare: { type: Number, default: 0 },
    outstationPerKm: { type: Number, default: 0 },
    roundTripMultiplier: { type: Number, default: 1.8 },
    hourlyPackages: [
      {
        hours: Number,
        km: Number,
        price: Number,
        _id: false,
      },
    ],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Pricing', pricingSchema);
