const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    vehicleType: { type: String, enum: ['hatchback', 'sedan', 'suv', 'luxury'], required: true },
    vehicleName: { type: String, required: true },
    plateNumber: { type: String, required: true, unique: true },
    licenseNumber: { type: String, required: true },
    vehicleColor: { type: String },
    vehiclePhoto: { type: String },
    driverPhoto: { type: String },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
    isOnline: { type: Boolean, default: false },
    isApproved: { type: Boolean, default: false },
    isBlocked: { type: Boolean, default: false },
    rating: { type: Number, default: 5.0, min: 1, max: 5 },
    totalRides: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
    currentBookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
    documents: {
      aadhar: String,
      license: String,
      rcBook: String,
      insurance: String,
    },
  },
  { timestamps: true }
);

driverSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Driver', driverSchema);
