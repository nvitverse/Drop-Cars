const Razorpay = require('razorpay');
const crypto = require('crypto');
const Booking = require('../models/Booking');

const getRazorpay = () =>
  new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });

// POST /api/payments/create-order
exports.createOrder = async (req, res, next) => {
  try {
    const { bookingId } = req.body;
    const booking = await Booking.findOne({ _id: bookingId, userId: req.user._id });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const razorpay = getRazorpay();
    const order = await razorpay.orders.create({
      amount: booking.fare.total * 100,
      currency: 'INR',
      receipt: `booking_${bookingId}`,
    });

    booking.razorpayOrderId = order.id;
    await booking.save();
    res.json({ orderId: order.id, amount: order.amount, currency: order.currency, key: process.env.RAZORPAY_KEY_ID });
  } catch (err) { next(err); }
};

// POST /api/payments/verify
exports.verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, bookingId } = req.body;
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSig !== razorpay_signature) {
      return res.status(400).json({ message: 'Payment verification failed' });
    }

    const booking = await Booking.findOneAndUpdate(
      { _id: bookingId, userId: req.user._id },
      { razorpayPaymentId: razorpay_payment_id, paymentStatus: 'paid' },
      { new: true }
    );
    res.json({ success: true, booking });
  } catch (err) { next(err); }
};

// POST /api/payments/webhook  (Razorpay webhook)
exports.webhook = async (req, res) => {
  try {
    const sig = req.headers['x-razorpay-signature'];
    const body = JSON.stringify(req.body);
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(body).digest('hex');
    if (sig !== expected) return res.status(400).send('Invalid signature');

    const { event, payload } = req.body;
    if (event === 'payment.captured') {
      const orderId = payload.payment.entity.order_id;
      await Booking.findOneAndUpdate({ razorpayOrderId: orderId }, { paymentStatus: 'paid' });
    }
    res.json({ received: true });
  } catch {
    res.status(500).send('Webhook error');
  }
};
