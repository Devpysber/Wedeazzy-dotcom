const express = require('express');
const ctrl = require('../controllers/reports.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Apply auth middleware to ALL report endpoints
router.use(requireAuth);

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

router.post('/import/vendors',  requireRole('admin'), ctrl.importVendors);
router.post('/import/users',    requireRole('admin'), ctrl.importUsers);
router.post('/import/bookings', requireRole('admin'), ctrl.importBookings);

module.exports = router;
