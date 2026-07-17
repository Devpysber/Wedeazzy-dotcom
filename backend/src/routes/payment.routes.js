const express = require('express');
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/payment.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Rate limiter: 10 payment requests per 15 minutes per IP
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { ok: false, message: 'Too many payment requests from this device. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Create a Razorpay order and return orderId + keyId to the frontend
router.post('/initiate', paymentLimiter, requireAuth, requireRole('vendor'), ctrl.initiatePayment);

// Verify HMAC signature after Razorpay modal completes; activate subscription
router.post('/verify', paymentLimiter, requireAuth, requireRole('vendor'), ctrl.verifyPayment);

// Cancel active subscription
router.post('/cancel', paymentLimiter, requireAuth, requireRole('vendor'), ctrl.cancelMySubscription);

// Vendor's transaction history
router.get('/transactions', requireAuth, requireRole('vendor'), ctrl.getMyTransactions);

// Server-to-server webhook from Razorpay (public, signature-verified)
router.post('/webhook', ctrl.handleWebhook);

module.exports = router;
