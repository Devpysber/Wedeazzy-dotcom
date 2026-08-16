const express = require('express');
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/reports.controller');
const { requireAuth, requireRole } = require('../middleware/auth');
const { rateLimitHandler } = require('../utils/rateLimitLogger');

const router = express.Router();

// Apply auth middleware to ALL report endpoints
router.use(requireAuth);

// Bulk import writes up to 500 DB rows per request (see MAX_IMPORT_RECORDS in
// reports.controller.js) — heavier than typical admin actions, and previously
// relied only on the generous global 1500/15min cap shared with dashboard
// polling. A compromised admin session (or a mistaken script) could otherwise
// fire many large imports back-to-back with no dedicated throttle.
const importLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler({ ok: false, code: 'ERR_RATE', message: 'Too many bulk import requests. Please try again in an hour.' }),
  message: { ok: false, code: 'ERR_RATE', message: 'Too many bulk import requests. Please try again in an hour.' },
});

// --- VENDOR ENDPOINTS (Vendor and Admin roles) ---
router.get('/vendor/leads',    requireRole('vendor', 'admin'), ctrl.getVendorLeads);
router.get('/vendor/bookings', requireRole('vendor', 'admin'), ctrl.getVendorBookings);

// --- ADMIN ENDPOINTS (Admin only) ---
router.get('/export/users',     requireRole('admin'), ctrl.exportUsers);
router.get('/export/vendors',   requireRole('admin'), ctrl.exportVendors);
router.get('/export/bookings',  requireRole('admin'), ctrl.exportBookings);
router.get('/export/payments',  requireRole('admin'), ctrl.exportPayments);
router.get('/export/leads',     requireRole('admin'), ctrl.exportLeads);
router.get('/export/revenue',   requireRole('admin'), ctrl.exportRevenue);
router.get('/export/analytics', requireRole('admin'), ctrl.exportAnalytics);

router.post('/import/vendors',  importLimiter, requireRole('admin'), ctrl.importVendors);
router.post('/import/users',    importLimiter, requireRole('admin'), ctrl.importUsers);
router.post('/import/bookings', importLimiter, requireRole('admin'), ctrl.importBookings);

module.exports = router;
