const Driver = require('../models/Driver');
const User = require('../models/User');
const Booking = require('../models/Booking');
const { sendPush } = require('../services/fcmService');
const { getIO } = require('../socket');

// POST /api/drivers/register
exports.registerDriver = async (req, res, next) => {
  try {
    const { vehicleType, vehicleName, plateNumber, licenseNumber, vehicleColor } = req.body;
    const existing = await Driver.findOne({ userId: req.user._id });
    if (existing) return res.status(400).json({ message: 'Driver profile already exists' });
    const driver = await Driver.create({
      userId: req.user._id, vehicleType, vehicleName, plateNumber, licenseNumber, vehicleColor,
    });
    await User.findByIdAndUpdate(req.user._id, { role: 'driver' });
    res.status(201).json(driver);
  } catch (err) { next(err); }
};

// GET /api/drivers/me
exports.getMyProfile = async (req, res, next) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id });
    if (!driver) return res.status(404).json({ message: 'Driver profile not found' });
    res.json(driver);
  } catch (err) { next(err); }
};

// PATCH /api/drivers/status
exports.setOnlineStatus = async (req, res, next) => {
  try {
    const { isOnline } = req.body;
    const driver = await Driver.findOneAndUpdate({ userId: req.user._id }, { isOnline }, { new: true });
    if (!driver) return res.status(404).json({ message: 'Driver profile not found' });
    getIO().to('admin').emit('driver:status', { driverId: driver._id, isOnline });
    res.json(driver);
  } catch (err) { next(err); }
};

// PATCH /api/drivers/location
exports.updateLocation = async (req, res, next) => {
  try {
    const { lat, lng } = req.body;
    const driver = await Driver.findOneAndUpdate(
      { userId: req.user._id },
      { location: { type: 'Point', coordinates: [lng, lat] } },
      { new: true }
    );
    if (!driver) return res.status(404).json({ message: 'Driver profile not found' });
    if (driver.currentBookingId) {
      const booking = await Booking.findById(driver.currentBookingId);
      if (booking) {
        getIO().to(`user:${booking.userId}`).emit('driver:location', { lat, lng });
      }
    }
    res.json({ lat, lng });
  } catch (err) { next(err); }
};

// GET /api/drivers/nearby
exports.nearbyDrivers = async (req, res, next) => {
  try {
    const { lat, lng, vehicleType, maxKm = 10 } = req.query;
    const filter = {
      isOnline: true, isApproved: true, isBlocked: false, currentBookingId: null,
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
          $maxDistance: Number(maxKm) * 1000,
        },
      },
    };
    if (vehicleType) filter.vehicleType = vehicleType;
    const drivers = await Driver.find(filter).populate('userId', 'name phone profilePhoto').limit(10);
    res.json(drivers);
  } catch (err) { next(err); }
};

// PATCH /api/drivers/booking/:bookingId/accept
exports.acceptBooking = async (req, res, next) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id, isApproved: true });
    if (!driver) return res.status(403).json({ message: 'Not an approved driver' });
    if (driver.currentBookingId) return res.status(400).json({ message: 'Already on a ride' });

    const booking = await Booking.findOneAndUpdate(
      { _id: req.params.bookingId, status: 'pending' },
      { status: 'accepted', driverId: driver._id },
      { new: true }
    ).populate('userId');
    if (!booking) return res.status(404).json({ message: 'Booking not available' });

    await Driver.findByIdAndUpdate(driver._id, { currentBookingId: booking._id });

    if (booking.userId?.fcmToken) {
      await sendPush(booking.userId.fcmToken, {
        title: 'Driver Found!',
        body: `${req.user.name} is on the way in a ${driver.vehicleName} (${driver.plateNumber})`,
        data: { bookingId: String(booking._id) },
      });
    }
    getIO().to(`user:${booking.userId._id}`).emit('booking:accepted', { booking, driver });
    getIO().to(`booking:${booking._id}`).emit('booking:accepted', { booking, driver });
    res.json(booking);
  } catch (err) { next(err); }
};

// PATCH /api/drivers/booking/:bookingId/start
exports.startRide = async (req, res, next) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id });
    const booking = await Booking.findOneAndUpdate(
      { _id: req.params.bookingId, driverId: driver._id, status: 'accepted' },
      { status: 'started' },
      { new: true }
    ).populate('userId');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking.userId?.fcmToken) {
      await sendPush(booking.userId.fcmToken, { title: 'Ride Started', body: 'Your ride has begun. Have a safe journey!' });
    }
    getIO().to(`booking:${booking._id}`).emit('booking:started', { bookingId: booking._id });
    res.json(booking);
  } catch (err) { next(err); }
};

// PATCH /api/drivers/booking/:bookingId/complete
exports.completeRide = async (req, res, next) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id });
    const booking = await Booking.findOneAndUpdate(
      { _id: req.params.bookingId, driverId: driver._id, status: 'started' },
      { status: 'completed', paymentStatus: 'paid' },
      { new: true }
    ).populate('userId');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    await Driver.findByIdAndUpdate(driver._id, {
      currentBookingId: null,
      $inc: { totalRides: 1, totalEarnings: booking.fare.total },
    });
    await User.findByIdAndUpdate(booking.userId._id, { $inc: { totalRides: 1 } });

    if (booking.userId?.fcmToken) {
      await sendPush(booking.userId.fcmToken, {
        title: 'Ride Completed',
        body: `Your ride is complete. Total: ₹${booking.fare.total}. Please rate your experience!`,
      });
    }
    getIO().to(`booking:${booking._id}`).emit('booking:completed', { bookingId: booking._id });
    res.json(booking);
  } catch (err) { next(err); }
};
