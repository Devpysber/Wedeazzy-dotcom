const express = require('express');
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/auth.controller');
const googleOAuth = require('../controllers/googleOAuth.controller');
const { requireAuth } = require('../middleware/auth');
const env = require('../config/env');
const { rateLimitHandler } = require('../utils/rateLimitLogger');

const router = express.Router();

// Rate limiter for general outbound OTP & forgot password triggers
const otpMessage = { success: false, error: "Too many attempts. Please try again after 15 minutes." };
const otpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler(otpMessage),
  message: otpMessage
});

// Rate limiter for login credentials verification
const loginMessage = { success: false, error: "Too many requests. Please try again after 15 minutes." };
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler(loginMessage),
  message: loginMessage
});

// ---------- LEGACY MOBILE WHATSAPP OTP ROUTES ----------
router.post('/otp/send', otpRateLimiter, ctrl.sendOtp);
router.post('/otp/verify', otpRateLimiter, ctrl.verifyOtp);

// ---------- UNIFIED AUTHENTICATION ENDPOINTS ----------

// 1. Passwordless OTP Authentication (Couple/Customer)
router.post('/check-user', otpRateLimiter, ctrl.checkUser);
router.post('/register-and-send-otp', otpRateLimiter, ctrl.registerAndSendOtp);
router.post('/verify-otp-login', otpRateLimiter, ctrl.verifyOtpLogin);

// 2. Traditional Password Login (Vendors, Admins, Venues, Business users)
router.post('/login', loginRateLimiter, ctrl.login);

// 3. Password Reset System (Single-Use Secure Token System)
router.post('/forgot-password', otpRateLimiter, ctrl.forgotPassword);
router.post('/reset-password', otpRateLimiter, ctrl.resetPassword);
router.post('/password-reset/send-otp', otpRateLimiter, ctrl.sendPasswordResetOtp);
router.post('/password-reset/verify', otpRateLimiter, ctrl.resetPasswordWithOtp);
router.post('/change-password', requireAuth, otpRateLimiter, ctrl.changeOwnPassword);

// 4. Session Verification & JWT Denylist Logouts
router.get('/user', requireAuth, ctrl.getSessionUser);
router.get('/logout', ctrl.logout);
router.post('/logout', ctrl.logout);  // POST alias for fetch() clients that default to POST
router.get('/me', requireAuth, ctrl.me);


// One-time OAuth token retrieval (consumes token from server-side session cookie)
router.get('/consume-oauth-token', (req, res) => {
  if (!req.session || !req.session.oauthToken) {
    return res.status(404).json({ ok: false, error: 'No pending OAuth token', code: 'ERR_NO_TOKEN' });
  }
  const token = req.session.oauthToken;
  const role = req.session.oauthRole || 'couple';
  // Consume (destroy) the token from session immediately
  delete req.session.oauthToken;
  delete req.session.oauthRole;
  res.json({ ok: true, token, role });
});

// 5. Google OAuth via /api/auth/google?role=vendor|couple|admin[&intent=signup]
// Mounted before server.js's root-level aliases, so these are the live handlers.
router.get('/google', googleOAuth.start);
router.get('/google/callback', googleOAuth.callback);

// 6. Google One Tap Authentication Popup Identity Token verification
router.post('/google/onetap', ctrl.googleOneTap);
router.get('/google/client-id', (req, res) => {
  res.json({ clientId: env.GOOGLE.clientId });
});

// ---------- BACKWARD COMPATIBLE & ADMIN ROUTES ----------
router.post('/signup', otpRateLimiter, ctrl.signup);
router.post('/email/send-otp', otpRateLimiter, ctrl.startEmailOtp);
router.post('/email/verify-otp', otpRateLimiter, ctrl.verifyEmailOtp);
router.post('/admin/login', loginRateLimiter, ctrl.adminLogin);
router.post('/admin/verify-2fa', otpRateLimiter, ctrl.verifyAdmin2Fa);

module.exports = router;
