const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema(
  { address: { type: String, required: true }, lat: Number, lng: Number },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', default: null },
    pickup: { type: locationSchema, required: true },
    destination: { type: locationSchema, required: true },
    vehicleType: { type: String, enum: ['hatchback', 'sedan', 'suv', 'luxury'], required: true },
    tripType: {
      type: String,
      enum: ['one-way', 'round-trip', 'airport', 'outstation', 'hourly'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'driver-arriving', 'started', 'completed', 'cancelled'],
      default: 'pending',
    },
    pickupDate: { type: Date, required: true },
    returnDate: { type: Date },
    hoursBooked: { type: Number },
    distanceKm: { type: Number },
    durationMin: { type: Number },
    polyline: { type: String },
    fare: {
      base: Number,
      perKmCharge: Number,
      perMinCharge: Number,
      airportSurcharge: { type: Number, default: 0 },
      discount: { type: Number, default: 0 },
      total: Number,
    },
    promoCode: { type: String },
    paymentMethod: { type: String, enum: ['cash', 'razorpay'], default: 'cash' },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'refunded', 'failed'],
      default: 'pending',
    },
    razorpayOrderId: String,
    razorpayPaymentId: String,
    rating: { type: Number, min: 1, max: 5 },
    review: String,
    cancelledBy: { type: String, enum: ['user', 'driver', 'admin'] },
    cancelReason: String,
    otp: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Booking', bookingSchema);
