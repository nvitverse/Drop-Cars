const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    role: { type: String, enum: ['user', 'driver', 'admin'], default: 'user' },
    fcmToken: { type: String },
    profilePhoto: { type: String },
    isBlocked: { type: Boolean, default: false },
    firebaseUid: { type: String, unique: true, sparse: true },
    passwordHash: { type: String },
    totalRides: { type: Number, default: 0 },
    walletBalance: { type: Number, default: 0 },
  },
  { timestamps: true }
);

userSchema.methods.setPassword = async function (password) {
  this.passwordHash = await bcrypt.hash(password, 10);
};

userSchema.methods.checkPassword = function (password) {
  return bcrypt.compare(password, this.passwordHash || '');
};

module.exports = mongoose.model('User', userSchema);
