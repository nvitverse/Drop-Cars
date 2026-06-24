const router = require('express').Router();
const ctrl = require('../controllers/bookingController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.post('/estimate', ctrl.estimate);
router.post('/', ctrl.createBooking);
router.get('/', ctrl.myBookings);
router.get('/:id', ctrl.getBooking);
router.patch('/:id/cancel', ctrl.cancelBooking);
router.patch('/:id/rate', ctrl.rateBooking);

module.exports = router;
