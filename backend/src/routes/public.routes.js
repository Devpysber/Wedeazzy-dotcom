const express = require('express');
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/public.controller');
const { rateLimitHandler } = require('../utils/rateLimitLogger');

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
router.get('/grow-campaigns-pricing', ctrl.getGrowCampaignsPricing);

// Dedicated, tighter limiter: this endpoint calls a paid external API per
// request, unlike the rest of this router.
const chatbotMessage = { ok: false, error: 'Too many chat messages. Please try again in a few minutes.' };
const chatbotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler(chatbotMessage),
  message: chatbotMessage,
});
router.post('/chatbot', chatbotLimiter, ctrl.postChatbotMessage);

// NOTE: The former GET /diagnose-db endpoint was removed. It could run
// migrations and admin seeding over HTTP and was reachable without admin auth
// outside production. Database migrations and admin seeding already run at
// server startup (see server.js) — no web-triggerable diagnostics endpoint is
// needed.

module.exports = router;
