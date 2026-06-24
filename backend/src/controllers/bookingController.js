const Booking = require('../models/Booking');
const Driver = require('../models/Driver');
const User = require('../models/User');
const { getRouteInfo } = require('../services/mapsService');
const { calculateFare } = require('../services/pricingService');
const { sendPush } = require('../services/fcmService');
const { getIO } = require('../socket');
const crypto = require('crypto');

// POST /api/bookings/estimate
exports.estimate = async (req, res, next) => {
  try {
    const { pickupLat, pickupLng, destLat, destLng, vehicleType, tripType, hoursBooked, promoCode } = req.body;
    const route = await getRouteInfo(pickupLat, pickupLng, destLat, destLng);
    const fare = await calculateFare({
      vehicleType,
      tripType,
      distanceKm: route.distanceKm,
      durationMin: route.durationMin,
      hoursBooked,
      promoCode,
      userId: req.user._id,
    });
    res.json({ ...route, fare });
  } catch (err) { next(err); }
};

// POST /api/bookings
exports.createBooking = async (req, res, next) => {
  try {
    const {
      pickup, destination, vehicleType, tripType,
      pickupDate, returnDate, hoursBooked, promoCode, paymentMethod,
    } = req.body;

    const route = await getRouteInfo(pickup.lat, pickup.lng, destination.lat, destination.lng);
    const fare = await calculateFare({
      vehicleType, tripType,
      distanceKm: route.distanceKm,
      durationMin: route.durationMin,
      hoursBooked, promoCode,
      userId: req.user._id,
    });

    const otp = String(Math.floor(1000 + Math.random() * 9000));
    const booking = await Booking.create({
      userId: req.user._id,
      pickup, destination, vehicleType, tripType,
      pickupDate, returnDate, hoursBooked, promoCode, paymentMethod,
      distanceKm: route.distanceKm,
      durationMin: route.durationMin,
      polyline: route.polyline,
      fare, otp,
    });

    getIO().to('admin').emit('booking:new', booking);
    res.status(201).json(booking);
  } catch (err) { next(err); }
};

// GET /api/bookings
exports.myBookings = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const bookings = await Booking.find({ userId: req.user._id })
      .populate('driverId', 'vehicleName plateNumber rating')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await Booking.countDocuments({ userId: req.user._id });
    res.json({ bookings, total, page: Number(page) });
  } catch (err) { next(err); }
};

// GET /api/bookings/:id
exports.getBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, userId: req.user._id })
      .populate('driverId');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json(booking);
  } catch (err) { next(err); }
};

// PATCH /api/bookings/:id/cancel
exports.cancelBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, userId: req.user._id });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (['completed', 'cancelled'].includes(booking.status)) {
      return res.status(400).json({ message: 'Cannot cancel this booking' });
    }
    booking.status = 'cancelled';
    booking.cancelledBy = 'user';
    booking.cancelReason = req.body.reason || '';
    await booking.save();

    if (booking.driverId) {
      await Driver.findByIdAndUpdate(booking.driverId, { currentBookingId: null });
      const driver = await Driver.findById(booking.driverId).populate('userId', 'fcmToken');
      if (driver?.userId?.fcmToken) {
        await sendPush(driver.userId.fcmToken, { title: 'Booking Cancelled', body: 'The customer cancelled the ride.' });
      }
      getIO().to(`user:${booking.driverId}`).emit('booking:cancelled', { bookingId: booking._id });
    }
    res.json(booking);
  } catch (err) { next(err); }
};

// PATCH /api/bookings/:id/rate
exports.rateBooking = async (req, res, next) => {
  try {
    const { rating, review } = req.body;
    const booking = await Booking.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id, status: 'completed' },
      { rating, review },
      { new: true }
    );
    if (!booking) return res.status(404).json({ message: 'Booking not found or not completed' });

    if (booking.driverId) {
      const allRatings = await Booking.find({ driverId: booking.driverId, rating: { $exists: true } });
      const avg = allRatings.reduce((s, b) => s + b.rating, 0) / allRatings.length;
      await Driver.findByIdAndUpdate(booking.driverId, { rating: avg.toFixed(1) });
    }
    res.json(booking);
  } catch (err) { next(err); }
};
