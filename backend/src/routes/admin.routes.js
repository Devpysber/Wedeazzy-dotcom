const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/admin.controller');
const importCtrl = require('../controllers/import.controller');
const env = require('../config/env');
const { requireAuth, requireRole } = require('../middleware/auth');
const { rateLimitHandler } = require('../utils/rateLimitLogger');

const router = express.Router();

// Vendor KYC/proof documents — PDF or image, unlike the vendor's own JPG/PNG/WebP-only photo upload.
// Extension is derived ONLY from the validated mimetype, never from the
// client-supplied original filename — same fix as upload.routes.js. Trusting
// the filename let an admin-uploaded file named "x.svg"/"x.html" (with a
// forged image/* or application/pdf Content-Type) be stored and served as
// uuid.svg/uuid.html — same-origin stored XSS via /api/uploads.
//
// Stored in a SEPARATE directory from the public vendor-photo uploads dir
// (which is mounted recursively, publicly, with no auth at /api/uploads and
// /uploads in server.js) — these are private KYC documents (registration
// certs, GST, ID proofs), not public gallery photos. Anyone who obtained a
// kycDocumentUrl (browser history, a shared screenshot, referrer leakage)
// could otherwise fetch a vendor's ID documents with zero auth. Served only
// via the authenticated GET /vendors/:id/document route below.
const DOCS_UPLOAD_DIR = path.resolve(__dirname, '..', '..', 'kyc-private');
fs.mkdirSync(DOCS_UPLOAD_DIR, { recursive: true });
const DOCS_MIME_TO_EXT = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
const docsUpload = multer({
  storage: multer.diskStorage({
    destination: DOCS_UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = DOCS_MIME_TO_EXT[file.mimetype] || '.pdf';
      cb(null, `${uuid()}${ext}`);
    },
  }),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = Object.prototype.hasOwnProperty.call(DOCS_MIME_TO_EXT, file.mimetype);
    cb(ok ? null : new Error('Only PDF, JPG, PNG or WebP files allowed'), ok);
  },
});

// Bulk listing import (CSV). Held in memory rather than written to disk: the
// file is parsed once, immediately, and only the normalised result is staged —
// there is no reason to persist the raw upload. Capped well above MAX_UPLOAD_MB
// because a 13,000-row vendor export is legitimately several MB of plain text,
// but still bounded so a huge upload can't exhaust memory.
const CSV_MIME_TYPES = [
  'text/csv',
  'application/csv',
  'text/plain',
  'application/vnd.ms-excel',       // what Windows/Excel labels a .csv as
  'application/octet-stream',       // some browsers when the type is unknown
];
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // Trust the extension here rather than the mimetype alone: browsers are
    // wildly inconsistent about CSV types, and the file is never written to
    // disk or served back, so the stored-XSS concern that drives the strict
    // mimetype-only rule for images/KYC docs does not apply.
    const ok = CSV_MIME_TYPES.includes(file.mimetype) || /\.csv$/i.test(file.originalname || '');
    cb(ok ? null : new Error('Only .csv files can be imported'), ok);
  },
});

// Dedicated limiter for admin routes. The global limiter skips /api/admin/* to
// avoid false 429s from the dashboard's frequent polling, so this generous
// per-IP cap restores abuse protection without blocking legitimate admin use.
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 2000,                // dashboard polls ~900/15min; headroom for real use
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler({ success: false, error: 'Too many admin requests. Please try again shortly.' }),
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
router.post('/vendors/bulk-invite', ctrl.bulkInviteVendors);
router.post('/vendors/:id/invite', ctrl.inviteVendorToClaim);
router.post('/vendors/:id/document', docsUpload.single('file'), ctrl.uploadVendorDocument);
router.get('/vendors/:id/document', ctrl.downloadVendorDocument);
router.post('/vendors/:id/send-credentials', ctrl.sendVendorCredentials);
router.delete('/vendors/:id', ctrl.deleteVendor);
router.patch('/users/:id/status', ctrl.toggleUserStatus);
router.patch('/bookings/:id/status', ctrl.updateBookingStatus);
router.post('/transactions/:id/refund', ctrl.refundTransaction);
router.post('/vendors/:id/cancel-subscription', ctrl.cancelVendorSubscription);
router.patch('/vendors/:id/subscription', ctrl.updateVendorSubscription);

// --- Bulk listing import (Approve Businesses > Import Listings) ---
// preview parses + reports duplicates and writes nothing; commit persists.
router.get('/vendors/import/template', importCtrl.downloadImportTemplate);
router.post('/vendors/import/preview', csvUpload.single('file'), importCtrl.previewVendorImport);
router.post('/vendors/import/commit', importCtrl.commitVendorImport);

router.post('/vendors', ctrl.createVendor);
router.post('/venues', ctrl.createVenue);
router.post('/users', ctrl.createUser);
router.post('/bookings', ctrl.createBooking);
router.put('/plans', ctrl.updatePlans);
router.put('/grow-campaigns-pricing', ctrl.updateGrowCampaignsPricing);

router.get('/email-campaigns', ctrl.listEmailCampaigns);
router.post('/email-campaigns', ctrl.createEmailCampaign);
router.get('/email-campaigns/recipient-count', ctrl.getEmailRecipientCount);

router.get('/vendor-categories', ctrl.listVendorCategories);
router.post('/vendor-categories', ctrl.createVendorCategory);
router.delete('/vendor-categories/:slug', ctrl.deleteVendorCategory);

router.get('/cities', ctrl.listCities);
router.post('/cities', ctrl.createCity);
router.delete('/cities/:slug', ctrl.deleteCity);

router.get('/suburbs', ctrl.listSuburbs);
router.post('/suburbs', ctrl.createSuburb);
router.delete('/suburbs/:slug', ctrl.deleteSuburb);

router.get('/email-workflows', ctrl.listEmailWorkflows);
router.patch('/email-workflows/:id', ctrl.updateEmailWorkflow);
router.get('/smtp-config', ctrl.getSmtpConfig);
router.get('/audience-count', ctrl.getAudienceCount);

router.get('/notifications', ctrl.getNotifications);

router.get('/blogs', ctrl.adminListBlogs);
router.post('/blogs', ctrl.createBlog);
router.patch('/blogs/:id', ctrl.updateBlog);

module.exports = router;