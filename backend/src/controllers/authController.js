const User = require('../models/User');
const { signToken } = require('../utils/jwt');

// POST /api/auth/register
exports.register = async (req, res, next) => {
  try {
    const { name, phone, email, firebaseUid } = req.body;
    let user = await User.findOne({ phone });
    if (user) {
      // update firebase uid if missing
      if (firebaseUid && !user.firebaseUid) { user.firebaseUid = firebaseUid; await user.save(); }
      const token = signToken({ id: user._id, role: user.role });
      return res.json({ token, user });
    }
    user = await User.create({ name, phone, email, firebaseUid });
    const token = signToken({ id: user._id, role: user.role });
    res.status(201).json({ token, user });
  } catch (err) { next(err); }
};

// POST /api/auth/login  (phone + firebaseUid after OTP verified on client)
exports.login = async (req, res, next) => {
  try {
    const { phone, firebaseUid } = req.body;
    const user = await User.findOne({ phone }).select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'User not found. Please register.' });
    if (user.isBlocked) return res.status(403).json({ message: 'Account blocked' });
    if (firebaseUid && !user.firebaseUid) { user.firebaseUid = firebaseUid; await user.save(); }
    const token = signToken({ id: user._id, role: user.role });
    res.json({ token, user });
  } catch (err) { next(err); }
};

// GET /api/auth/me
exports.me = async (req, res) => {
  res.json(req.user);
};

// PATCH /api/auth/fcm-token
exports.updateFcmToken = async (req, res, next) => {
  try {
    const { fcmToken } = req.body;
    await User.findByIdAndUpdate(req.user._id, { fcmToken });
    res.json({ message: 'FCM token updated' });
  } catch (err) { next(err); }
};

// PATCH /api/auth/profile
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, email } = req.body;
    const user = await User.findByIdAndUpdate(req.user._id, { name, email }, { new: true }).select('-passwordHash');
    res.json(user);
  } catch (err) { next(err); }
};
