const express = require('express');
const ctrl = require('../controllers/inquiry.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Anonymous public-site inquiry (form on vendor.html). Rate-limited.
router.post('/public', ctrl.publicLimiter, ctrl.postPublic);

// Home-page enquiry (not tied to a vendor). The couple signs in / creates an
// account first; the enquiry is sent to the enquiry WhatsApp number.
router.post('/home', ctrl.publicLimiter, requireAuth, requireRole('couple', 'admin'), ctrl.postHomeEnquiry);

// Logged-in couple dashboard inquiry.
router.post('/', requireAuth, requireRole('couple', 'admin'), ctrl.postAsCouple);

// Vendor sees their own list; admin sees any.
router.get('/vendor', requireAuth, requireRole('vendor', 'admin'), ctrl.listForVendor);

// Update inquiry status (vendor on own, admin on any).
router.patch('/:id/status', requireAuth, requireRole('vendor', 'admin'), ctrl.patchStatus);

module.exports = router;
