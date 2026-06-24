const router = require('express').Router();
const ctrl = require('../controllers/pricingController');
const { authenticate, requireRole } = require('../middleware/auth');

router.get('/', ctrl.getPricing);
router.put('/:vehicleType', authenticate, requireRole('admin'), ctrl.updatePricing);

module.exports = router;
