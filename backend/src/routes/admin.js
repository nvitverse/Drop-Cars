const router = require('express').Router();
const ctrl = require('../controllers/adminController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate, requireRole('admin'));

router.get('/dashboard', ctrl.dashboard);
router.get('/customers', ctrl.customers);
router.patch('/customers/:id/block', ctrl.blockCustomer);
router.get('/drivers', ctrl.drivers);
router.patch('/drivers/:id/approve', ctrl.approveDriver);
router.patch('/drivers/:id/block', ctrl.blockDriver);
router.get('/bookings', ctrl.bookings);
router.patch('/bookings/:id/cancel', ctrl.cancelBooking);
router.post('/promos', ctrl.createPromo);
router.get('/promos', ctrl.promos);
router.get('/reports/revenue', ctrl.revenueReport);

module.exports = router;
