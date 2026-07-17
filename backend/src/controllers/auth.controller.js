/**
 * HTTP layer for every authentication flow the platform supports — see
 * auth.service.js for the underlying business logic. Three independent
 * login styles coexist: legacy WhatsApp OTP, email/password with email OTP
 * verification, and passwordless email OTP — plus Google OAuth and a
 * unified admin/vendor password login.
 */

const jwt = require('jsonwebtoken');
const service = require('../services/auth.service');
const env = require('../config/env');
const prisma = require('../config/db');
const { signToken } = require('../middleware/auth');
const googleAuth = require('../services/googleAuth');

/**
 * WhatsApp OTP Send (Legacy)
 */
async function sendOtp(req, res, next) {
  try {
    const { phone, purpose } = req.body || {};
    const r = await service.startOtp({ phone, purpose });
    res.json(r);
  } catch (e) { next(e); }
}

/**
 * WhatsApp OTP Verify (Legacy)
 */
async function verifyOtp(req, res, next) {
  try {
    const { phone, code, role, name } = req.body || {};
    const r = await service.verifyOtp({ phone, code, role, name });
    res.json(r);
  } catch (e) { next(e); }
}

/**
 * Traditional Email/Password Signup (Legacy)
 */
async function signup(req, res, next) {
  try {
    const r = await service.signup(req.body || {});
    res.json(r);
  } catch (e) { next(e); }
}

/**
 * Password-based Authenticated Login (Only Admins, Vendors, Venues, Business portal dashboard users)
 */
async function login(req, res, next) {
  try {
    const { emailOrPhone, email, password } = req.body || {};
    const r = await service.login({ emailOrPhone: emailOrPhone || email, password });
    
    // Save login timestamp inside cookie session
    if (req.session) {
      req.session.loginAt = Date.now();
    }
    
    res.json(r);
  } catch (e) { next(e); }
}

/**
 * Business Email OTP Send (Legacy)
 */
async function startEmailOtp(req, res, next) {
  try {
    const { email } = req.body || {};
    const r = await service.startEmailOtp(email);
    res.json(r);
  } catch (e) { next(e); }
}

/**
 * Business Email OTP Verify (Legacy)
 */
async function verifyEmailOtp(req, res, next) {
  try {
    const { email, code } = req.body || {};
    const r = await service.verifyEmailOtp({ email, code });
    res.json(r);
  } catch (e) { next(e); }
}

/**
 * Passwordless OTP: STEP 1 — Check Existing User
 */
async function checkUser(req, res, next) {
  try {
    const { email } = req.body || {};
    const r = await service.checkUser(email);
    res.json(r);
  } catch (e) { next(e); }
}

/**
 * Passwordless OTP: STEP 2 — Register and Send OTP
 */
async function registerAndSendOtp(req, res, next) {
  try {
    const { email, name, mobile } = req.body || {};
    const r = await service.registerAndSendOtp({ email, name, mobile });
    res.json(r);
  } catch (e) { next(e); }
}

/**
 * Passwordless OTP: STEP 3 — Verify OTP Login
 */
async function verifyOtpLogin(req, res, next) {
  try {
    const { email, otp } = req.body || {};
    const r = await service.verifyOtpLogin({ email, otp });
    
    // Save login timestamp inside cookie session
    if (req.session) {
      req.session.loginAt = Date.now();
    }
    
    res.json(r);
  } catch (e) { next(e); }
}

/**
 * Single-Use reset token trigger
 */
async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body || {};
    const r = await service.forgotPasswordSecure({ email });
    res.json(r);
  } catch (e) { next(e); }
}

/**
 * Single-Use token reset password execute
 */
async function resetPassword(req, res, next) {
  try {
    const { token, newPassword } = req.body || {};
    const r = await service.resetPasswordSecure({ token, newPassword });
    res.json(r);
  } catch (e) { next(e); }
}

/**
 * Google One Tap Popup Identity Token Authentication
 */
async function googleOneTap(req, res, next) {
  try {
    const { token, role } = req.body || {};

    const ticket = await googleAuth.verifyIdToken(token);
    const user = await googleAuth.handleGoogleUser({
      email: ticket.email,
      name: ticket.name,
      googleId: ticket.googleId,
      imageUrl: ticket.imageUrl,
      requestedRole: role || 'couple'
    });

    const jwtToken = signToken(user);
    
    // Save to cookie session
    if (req.session) {
      req.session.loginAt = Date.now();
    }
    
    res.json({
      ok: true,
      token: jwtToken,
      userData: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        role: user.role,
        name: user.name,
        imageUrl: user.imageUrl,
        verified: true,
        vendor: user.vendor ? { id: user.vendor.id, businessName: user.vendor.businessName } : null,
        couple: user.couple ? { id: user.couple.id } : null
      }
    });
  } catch (e) { next(e); }
}

/**
 * Session verification checking cookie session vs user database revocation state
 */
async function getSessionUser(req, res, next) {
  try {
    const loginAt = req.session ? req.session.loginAt : null;
    if (!loginAt) {
      return res.status(401).json({ ok: false, error: 'No active session found', code: 'ERR_NO_SESSION' });
    }
    
    const user = req.user;
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Unauthorized', code: 'ERR_NO_AUTH' });
    }
    
    // Compare loginAt with database revoked_before
    if (user.revokedBefore && loginAt < user.revokedBefore.getTime()) {
      // Instantly destroy session, force logout, and clear cookies
      if (req.session) {
        req.session = null;
      }
      return res.status(401).json({
        ok: false,
        error: 'Session revoked due to password change.',
        code: 'ERR_SESSION_REVOKED'
      });
    }
    
    const token = signToken(user);

    res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        role: user.role,
        name: user.name,
        imageUrl: user.imageUrl,
        verified: !!user.verifiedAt,
        vendor: user.vendor ? { id: user.vendor.id, businessName: user.vendor.businessName } : null,
        couple: user.couple ? { id: user.couple.id } : null
      }
    });
  } catch (e) { next(e); }
}

/**
 * Secure JWT Token Logout & Denylist Insertion
 */
async function logout(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (token) {
      let expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h fallback
      try {
        const decoded = jwt.verify(token, env.JWT_SECRET);
        if (decoded.exp) {
          expiresAt = new Date(decoded.exp * 1000);
        }
      } catch (_) {}

      // Save active JWT in denylist
      await prisma.jwtDenylist.upsert({
        where: { token },
        update: {},
        create: {
          token,
          expiresAt
        }
      });
    }
    
    // Clear session cookies
    if (req.session) {
      req.session = null;
    }
    
    res.json({ ok: true, message: 'Logged out successfully' });
  } catch (e) { next(e); }
}

/**
 * Fetch Current Profile details
 */
async function me(req, res) {
  const u = req.user;
  res.json({
    ok: true,
    user: {
      id: u.id,
      phone: u.phone,
      role: u.role,
      name: u.name,
      email: u.email,
      imageUrl: u.imageUrl,
      verified: !!u.verifiedAt,
      vendor: u.vendor ? { id: u.vendor.id, businessName: u.vendor.businessName, slug: u.vendor.slug, tier: u.vendor.tier, isProfileComplete: u.vendor.isProfileComplete } : null,
      couple: u.couple ? { id: u.couple.id, weddingDate: u.couple.weddingDate, city: u.couple.city } : null,
    },
  });
}

/**
 * Backward compatible administrator credentials validator
 */
async function adminLogin(req, res, next) {
  try {
    const { email, password } = req.body || {};
    const r = await service.loginWithPassword({ email, role: 'admin', password });
    
    if (req.session) {
      req.session.loginAt = Date.now();
    }
    
    res.json(r);
  } catch (e) { next(e); }
}

module.exports = {
  sendOtp,
  verifyOtp,
  signup,
  login,
  startEmailOtp,
  verifyEmailOtp,
  checkUser,
  registerAndSendOtp,
  verifyOtpLogin,
  forgotPassword,
  resetPassword,
  googleOneTap,
  getSessionUser,
  logout,
  me,
  adminLogin,
};
