const { OAuth2Client } = require('google-auth-library');
const prisma = require('../config/db');
const env = require('../config/env');
const logger = require('../config/logger');
const { sendCoupleWelcomeEmail } = require('./email.service');
const { HttpError } = require('../middleware/error');

const oneTapClient = new OAuth2Client(env.GOOGLE.clientId);

/**
 * Verify Google One Tap Identity Token using Google OAuth2Client
 */
async function verifyIdToken(idToken) {
  try {
    const ticket = await oneTapClient.verifyIdToken({
      idToken,
      audience: env.GOOGLE.clientId,
    });
    const payload = ticket.getPayload();
    return {
      email: payload.email,
      name: payload.name,
      googleId: payload.sub,
      imageUrl: payload.picture,
      verified: payload.email_verified,
    };
  } catch (err) {
    logger.error({ err }, 'Google ID Token verification failed');
    throw err;
  }
}

const ROLE_ALIASES = { user: 'couple', business: 'vendor', couple: 'couple', vendor: 'vendor', admin: 'admin' };
const ROLE_LABELS = { couple: 'Couple', vendor: 'Vendor', admin: 'Admin' };

/**
 * Normalise the account type a Google sign-in was started for.
 * 'any' means the caller didn't say — it may sign in an existing couple or
 * vendor account, but never an admin, and never creates anything.
 */
function normalizeRole(role) {
  return ROLE_ALIASES[String(role || '').toLowerCase()] || 'any';
}

function normalizeIntent(intent) {
  return intent === 'signup' ? 'signup' : 'login';
}

/**
 * OAuth `state` carries the account type and intent through Google's redirect.
 * Legacy states were a bare base64 role string; those still decode as login.
 */
function encodeOAuthState({ role, intent, from }) {
  const state = { r: normalizeRole(role), i: normalizeIntent(intent) };
  if (from === 'vendor-login') state.f = from; // where to send errors back to
  return Buffer.from(JSON.stringify(state)).toString('base64');
}

function decodeOAuthState(state) {
  if (!state) return { role: 'any', intent: 'login' };
  try {
    const raw = Buffer.from(String(state), 'base64').toString('utf8');
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw);
      return { role: normalizeRole(parsed.r), intent: normalizeIntent(parsed.i), from: parsed.f === 'vendor-login' ? parsed.f : null };
    }
    return { role: normalizeRole(raw), intent: 'login' };
  } catch (_) {
    return { role: 'any', intent: 'login' };
  }
}

function googleError(status, message, code, extra) {
  const err = new HttpError(status, message, code);
  Object.assign(err, extra);
  return err;
}

/**
 * Google sign-in: authenticate, then find the EXISTING account for the
 * requested account type and sign it in. Google never registers vendors or
 * admins — only a couple, and only when the user explicitly chose
 * "Sign up with Google" (intent === 'signup').
 */
async function handleGoogleUser({ email, name, googleId, imageUrl, requestedRole, intent, verifiedEmail }) {
  const role = normalizeRole(requestedRole);
  const mode = normalizeIntent(intent);
  const normalizedEmail = String(email || '').toLowerCase().trim();
  if (!normalizedEmail) {
    throw googleError(400, 'Your Google account did not share an email address.', 'ERR_GOOGLE_NO_EMAIL', { requestedRole: role });
  }
  if (verifiedEmail !== true) {
    throw googleError(403, 'This Google account\'s email address is not verified. Please sign in with your password instead.', 'ERR_GOOGLE_EMAIL_UNVERIFIED', { requestedRole: role });
  }

  // Prefer the Google account already linked to a user, then fall back to email.
  let user = null;
  if (googleId) {
    user = await prisma.user.findUnique({ where: { googleId }, include: { vendor: true, couple: true } });
  }
  if (!user) {
    user = await prisma.user.findUnique({ where: { email: normalizedEmail }, include: { vendor: true, couple: true } });
    if (user && user.googleId && googleId && user.googleId !== googleId) {
      throw googleError(409, 'This email is linked to a different Google account. Please sign in with that Google account or your password.', 'ERR_GOOGLE_ACCOUNT_MISMATCH', { requestedRole: role });
    }
  }

  if (user) {
    if (user.suspendedAt) {
      throw googleError(403, 'Your account has been suspended. Contact support for assistance.', 'ERR_ACCOUNT_SUSPENDED', { requestedRole: role });
    }
    // The account type must match the sign-in the user chose, so a vendor
    // can't land in the couple dashboard (or vice versa), and admin access
    // is only ever granted through the admin sign-in.
    const typeMismatch = role === 'any' ? user.role === 'admin' : user.role !== role;
    if (typeMismatch) {
      throw googleError(
        403,
        role === 'any'
          ? 'Please use the admin sign-in for this account.'
          : `This Google account is registered as a ${ROLE_LABELS[user.role] || user.role} account, not a ${ROLE_LABELS[role]} account. Please use the ${ROLE_LABELS[user.role] || user.role} sign-in.`,
        'ERR_ROLE_MISMATCH',
        { requestedRole: role, accountRole: user.role }
      );
    }

    const updateData = { lastLogin: new Date(), authProvider: 'google' };
    if (imageUrl) updateData.imageUrl = imageUrl;
    if (googleId && !user.googleId) updateData.googleId = googleId;
    if (!user.verifiedAt) updateData.verifiedAt = new Date();
    // An account still on an admin-issued / claim temp password is locked
    // (middleware/auth.js) until that password is replaced. Signing in with the
    // Google account for this same email proves ownership, so finish setup:
    // clear the flag and retire the temp password (which an admin or the claim
    // email knew). The owner can set their own via "Forgot password" later.
    if (user.mustChangePassword) {
      updateData.mustChangePassword = false;
      updateData.passwordHash = null;
      logger.info({ userId: user.id }, 'Google sign-in completed account setup; temporary password retired');
    }
    user = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
      include: { vendor: true, couple: true },
    });

    if (user.role === 'couple' && !user.couple) {
      try {
        await prisma.couple.create({ data: { userId: user.id } });
        user = await prisma.user.findUnique({ where: { id: user.id }, include: { vendor: true, couple: true } });
      } catch (cErr) { logger.warn({ err: cErr.message }, 'Defensive couple profile creation failed'); }
    }

    logger.info({ userId: user.id, role: user.role }, 'Signed in existing user with Google');
    return user;
  }

  // No account for this Google email.
  if (mode !== 'signup' || role !== 'couple') {
    const label = role === 'any' ? '' : `${ROLE_LABELS[role]} `;
    throw googleError(
      404,
      role === 'vendor'
        ? 'No vendor account is registered with this Google email. Please register or claim your business first, or sign in with the email you registered with.'
        : `No ${label}account is registered with this Google email. Please sign up first.`,
      'ERR_NO_ACCOUNT',
      { requestedRole: role }
    );
  }

  // Explicit couple sign-up with Google.
  const displayName = name || 'Wedding User';
  user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        email: normalizedEmail,
        role: 'couple',
        name: displayName,
        googleId: googleId || null,
        authProvider: 'google',
        imageUrl: imageUrl || null,
        verifiedAt: new Date(),
        lastLogin: new Date(),
      },
    });
    await tx.couple.create({ data: { userId: newUser.id } });
    return tx.user.findUnique({ where: { id: newUser.id }, include: { vendor: true, couple: true } });
  });

  // Same welcome as couples who verify by email OTP: dashboard link, escaped
  // name, and the admin panel's couple-welcome on/off toggle all apply.
  sendCoupleWelcomeEmail(normalizedEmail, displayName).catch((err) => {
    logger.error({ err, email: normalizedEmail }, 'Failed to send welcome email');
  });
  logger.info({ userId: user.id }, 'Created couple account via Google sign-up');
  return user;
}

module.exports = {
  verifyIdToken,
  handleGoogleUser,
  normalizeRole,
  encodeOAuthState,
  decodeOAuthState,
};
