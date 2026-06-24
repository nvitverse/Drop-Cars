const mongoose = require('mongoose');

const zoneSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    description: String,
    polygon: {
      type: { type: String, enum: ['Polygon'], required: true },
      coordinates: { type: [[[Number]]], required: true },
    },
    pricingOverride: {
      surgeFactor: Number,
      airportSurcharge: Number,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

zoneSchema.index({ polygon: '2dsphere' });

module.exports = mongoose.model('Zone', zoneSchema);
