const express = require('express');
const ctrl = require('../controllers/public.controller');

const router = express.Router();

// Public routes for directory searches
router.get('/vendors', ctrl.getVendors);
router.get('/vendors/:idOrSlug', ctrl.getVendorByIdOrSlug);
router.post('/vendors/:idOrSlug/reviews', ctrl.addVendorReview);
router.get('/meta', ctrl.getMetadata);
router.post('/analytics/event', ctrl.logAnalyticsEvent);
router.get('/plans', ctrl.getPlans);
router.get('/blogs', ctrl.getBlogs);
router.get('/blogs/:slug', ctrl.getBlogBySlug);

// NOTE: The former GET /diagnose-db endpoint was removed. It could run
// migrations and admin seeding over HTTP and was reachable without admin auth
// outside production. Database migrations and admin seeding already run at
// server startup (see server.js) — no web-triggerable diagnostics endpoint is
// needed.

module.exports = router;
