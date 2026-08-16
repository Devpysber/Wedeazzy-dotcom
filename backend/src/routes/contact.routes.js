const express = require('express');
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/contact.controller');
const { rateLimitHandler } = require('../utils/rateLimitLogger');

const router = express.Router();

// Rate limiter for contact submissions: max 5 requests per 15 minutes per IP
const contactMessage = { ok: false, code: 'ERR_RATE', message: 'Too many contact requests. Please try again after 15 minutes.' };
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 5,
  handler: rateLimitHandler(contactMessage),
  message: contactMessage
});

// Submit contact form
router.post('/', contactLimiter, ctrl.postContactForm);

module.exports = router;
