const User = require('../models/User');
const Driver = require('../models/Driver');
const Booking = require('../models/Booking');
const Promo = require('../models/Promo');

// GET /api/admin/dashboard
exports.dashboard = async (req, res, next) => {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [totalUsers, totalDrivers, totalBookings, activeDrivers, todayBookings, revenue] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      Driver.countDocuments({ isApproved: true }),
      Booking.countDocuments(),
      Driver.countDocuments({ isOnline: true }),
      Booking.countDocuments({ createdAt: { $gte: today } }),
      Booking.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, total: { $sum: '$fare.total' } } }]),
    ]);
    const totalRevenue = revenue[0]?.total || 0;

    const last30 = new Date(); last30.setDate(last30.getDate() - 30);
    const bookingsByDay = await Booking.aggregate([
      { $match: { createdAt: { $gte: last30 } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    const vehicleDist = await Booking.aggregate([
      { $group: { _id: '$vehicleType', count: { $sum: 1 } } },
    ]);

    res.json({ totalUsers, totalDrivers, totalBookings, activeDrivers, todayBookings, totalRevenue, bookingsByDay, vehicleDist });
  } catch (err) { next(err); }
};

// GET /api/admin/customers
exports.customers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const filter = { role: 'user' };
    if (search) filter.$or = [{ name: new RegExp(search, 'i') }, { phone: new RegExp(search, 'i') }];
    const [users, total] = await Promise.all([
      User.find(filter).select('-passwordHash').sort('-createdAt').skip((page - 1) * limit).limit(Number(limit)),
      User.countDocuments(filter),
    ]);
    res.json({ users, total, page: Number(page) });
  } catch (err) { next(err); }
};

// PATCH /api/admin/customers/:id/block
exports.blockCustomer = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isBlocked: req.body.isBlocked }, { new: true });
    res.json(user);
  } catch (err) { next(err); }
};

// GET /api/admin/drivers
exports.drivers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const filter = {};
    if (status === 'pending') filter.isApproved = false;
    if (status === 'approved') filter.isApproved = true;
    const [drivers, total] = await Promise.all([
      Driver.find(filter).populate('userId', 'name phone email profilePhoto').sort('-createdAt')
        .skip((page - 1) * limit).limit(Number(limit)),
      Driver.countDocuments(filter),
    ]);
    res.json({ drivers, total, page: Number(page) });
  } catch (err) { next(err); }
};

// PATCH /api/admin/drivers/:id/approve
exports.approveDriver = async (req, res, next) => {
  try {
    const driver = await Driver.findByIdAndUpdate(req.params.id, { isApproved: req.body.isApproved }, { new: true });
    res.json(driver);
  } catch (err) { next(err); }
};

// PATCH /api/admin/drivers/:id/block
exports.blockDriver = async (req, res, next) => {
  try {
    const driver = await Driver.findByIdAndUpdate(req.params.id, { isBlocked: req.body.isBlocked }, { new: true });
    res.json(driver);
  } catch (err) { next(err); }
};

// GET /api/admin/bookings
exports.bookings = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, vehicleType, from, to } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (vehicleType) filter.vehicleType = vehicleType;
    if (from || to) filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .populate('userId', 'name phone')
        .populate('driverId', 'vehicleName plateNumber')
        .sort('-createdAt').skip((page - 1) * limit).limit(Number(limit)),
      Booking.countDocuments(filter),
    ]);
    res.json({ bookings, total, page: Number(page) });
  } catch (err) { next(err); }
};

// PATCH /api/admin/bookings/:id/cancel
exports.cancelBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status: 'cancelled', cancelledBy: 'admin', cancelReason: req.body.reason || 'Cancelled by admin' },
      { new: true }
    );
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json(booking);
  } catch (err) { next(err); }
};

// POST /api/admin/promos
exports.createPromo = async (req, res, next) => {
  try {
    const promo = await Promo.create(req.body);
    res.status(201).json(promo);
  } catch (err) { next(err); }
};

// GET /api/admin/promos
exports.promos = async (req, res, next) => {
  try {
    const promos = await Promo.find().sort('-createdAt');
    res.json(promos);
  } catch (err) { next(err); }
};

// GET /api/admin/reports/revenue
exports.revenueReport = async (req, res, next) => {
  try {
    const { period = 'day' } = req.query;
    const format = period === 'month' ? '%Y-%m' : period === 'week' ? '%Y-%U' : '%Y-%m-%d';
    const data = await Booking.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: { $dateToString: { format, date: '$createdAt' } }, revenue: { $sum: '$fare.total' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    res.json(data);
  } catch (err) { next(err); }
};
