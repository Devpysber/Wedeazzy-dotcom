const express = require('express');
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/admin.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Dedicated limiter for admin routes. The global limiter skips /api/admin/* to
// avoid false 429s from the dashboard's frequent polling, so this generous
// per-IP cap restores abuse protection without blocking legitimate admin use.
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 2000,                // dashboard polls ~900/15min; headroom for real use
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many admin requests. Please try again shortly.' }
});
router.use(adminLimiter);

// All routes here are admin protected
router.use(requireAuth);
router.use(requireRole('admin'));

// Admin Management APIs
router.get('/analytics', ctrl.getAnalytics);
router.get('/vendors', ctrl.getVendors);
router.get('/users', ctrl.getUsers);
router.get('/bookings', ctrl.getBookings);

router.patch('/vendors/:id/verify', ctrl.verifyVendor);
router.patch('/vendors/:id/status', ctrl.toggleVendorStatus);
router.delete('/vendors/:id', ctrl.deleteVendor);
router.patch('/users/:id/status', ctrl.toggleUserStatus);
router.patch('/bookings/:id/status', ctrl.updateBookingStatus);
router.post('/transactions/:id/refund', ctrl.refundTransaction);
router.post('/vendors/:id/cancel-subscription', ctrl.cancelVendorSubscription);
router.patch('/vendors/:id/subscription', ctrl.updateVendorSubscription);

router.post('/vendors', ctrl.createVendor);
router.post('/venues', ctrl.createVenue);
router.post('/users', ctrl.createUser);
router.post('/bookings', ctrl.createBooking);
router.put('/plans', ctrl.updatePlans);

module.exports = router;
