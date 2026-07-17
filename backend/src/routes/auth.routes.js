const express = require('express');
const rateLimit = require('express-rate-limit');
const passport = require('passport');
const ctrl = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth');
const env = require('../config/env');

const router = express.Router();

// Rate limiter for general outbound OTP & forgot password triggers
const otpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many attempts. Please try again after 15 minutes."
  }
});

// Rate limiter for login credentials verification
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many requests. Please try again after 15 minutes."
  }
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

// 5. Google OAuth via /api/auth/google — same logic as root /google route
// The server.js root-level /api/auth/google handler is the primary entry point.
// These routes in auth.router also work as a fallback for API consumers.
router.get('/google', (req, res, next) => {
  const { role } = req.query || {};
  const validRoles = ['couple', 'vendor', 'admin', 'user', 'business'];
  const safeRole = validRoles.includes(role) ? role : 'couple';
  const state = Buffer.from(safeRole).toString('base64');
  passport.authenticate('google', { scope: ['profile', 'email'], state })(req, res, next);
});

// Google OAuth Callback — called by Google after user grants permission
router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/pages/admin-login.html?error=google_auth_failed', failureMessage: true }),
  async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.redirect('/pages/admin-login.html?error=google_auth_failed');

      const { signToken } = require('../middleware/auth');
      const token = signToken(user);
      const finalRole = user.role;

      if (req.session) {
        req.session.oauthToken = token;
        req.session.oauthRole = finalRole;
        req.session.loginAt = Date.now();
      }

      // Token is intentionally NOT included in the redirect URL — it would leak via
      // browser history, server access logs, and Referer headers. The frontend
      // retrieves it via the one-time /api/auth/consume-oauth-token session exchange.
      res.redirect(`/pages/admin-login.html?auth=success&provider=google&role=${finalRole}`);
    } catch (err) { next(err); }
  }
);

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

module.exports = router;
