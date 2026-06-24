const router = require('express').Router();
const ctrl = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/register', ctrl.register);
router.post('/login', ctrl.login);
router.get('/me', authenticate, ctrl.me);
router.patch('/fcm-token', authenticate, ctrl.updateFcmToken);
router.patch('/profile', authenticate, ctrl.updateProfile);

module.exports = router;
