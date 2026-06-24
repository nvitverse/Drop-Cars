const mongoose = require('mongoose');

const promoSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    discountType: { type: String, enum: ['flat', 'percent'], required: true },
    discountValue: { type: Number, required: true },
    maxDiscount: Number,
    minimumFare: { type: Number, default: 0 },
    usageLimit: { type: Number, default: 100 },
    usageCount: { type: Number, default: 0 },
    perUserLimit: { type: Number, default: 1 },
    expiresAt: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    applicableVehicles: {
      type: [String],
      enum: ['hatchback', 'sedan', 'suv', 'luxury'],
      default: ['hatchback', 'sedan', 'suv', 'luxury'],
    },
    usedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Promo', promoSchema);
