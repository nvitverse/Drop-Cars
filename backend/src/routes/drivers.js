const router = require('express').Router();
const ctrl = require('../controllers/driverController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.post('/register', ctrl.registerDriver);
router.get('/me', ctrl.getMyProfile);
router.get('/nearby', ctrl.nearbyDrivers);
router.patch('/status', ctrl.setOnlineStatus);
router.patch('/location', ctrl.updateLocation);
router.patch('/booking/:bookingId/accept', ctrl.acceptBooking);
router.patch('/booking/:bookingId/start', ctrl.startRide);
router.patch('/booking/:bookingId/complete', ctrl.completeRide);

module.exports = router;
