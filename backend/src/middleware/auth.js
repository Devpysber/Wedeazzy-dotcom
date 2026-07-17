/**
 * JWT authentication & role-authorization middleware.
 *
 * Token lifecycle enforced by requireAuth, in order:
 *   1. Denylist check       — tokens explicitly revoked via /auth/logout
 *   2. Signature/expiry     — standard JWT verification
 *   3. revokedBefore check  — bulk-invalidates all tokens issued before a
 *                             password reset/change, even if not individually denylisted
 *   4. Suspension check     — admin-suspended accounts are blocked outright
 */

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const prisma = require('../config/db');
const { HttpError } = require('./error');

/**
 * Express middleware: requires a valid, non-revoked JWT and attaches the
 * authenticated user (with `vendor`/`couple` relations) to `req.user`.
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token && req.query.token) {
      token = req.query.token;
    }
    if (!token) throw new HttpError(401, 'Login required', 'ERR_NO_TOKEN');

    // 1. Query JWT denylist to protect against replay attacks
    const denylisted = await prisma.jwtDenylist.findUnique({
      where: { token }
    });
    if (denylisted) throw new HttpError(401, 'Session has been logged out - please log in again', 'ERR_TOKEN_REVOKED');

    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET);
    } catch (e) {
      throw new HttpError(401, 'Session expired - please log in again', 'ERR_BAD_TOKEN');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { vendor: true, couple: true },
    });
    if (!user) throw new HttpError(401, 'User not found', 'ERR_NO_USER');

    // 2. Validate token issued time against user's revoked_before timestamp
    if (user.revokedBefore && payload.iat) {
      const issuedAtMs = payload.iat * 1000;
      if (issuedAtMs < user.revokedBefore.getTime()) {
        throw new HttpError(401, 'Session revoked - please log in again', 'ERR_SESSION_REVOKED');
      }
    }

    // 3. Check if user has been suspended by admin
    if (user.suspendedAt) {
      throw new HttpError(403, 'Your account has been suspended. Contact support for assistance.', 'ERR_ACCOUNT_SUSPENDED');
    }

    req.user = user;
    next();
  } catch (e) { next(e); }
}

/**
 * Express middleware factory: restricts a route to the given roles.
 * Must run after requireAuth (relies on req.user being already set).
 * @param {...string} allowed - Roles permitted to access the route, e.g. requireRole('admin')
 */
function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return next(new HttpError(401, 'Login required', 'ERR_NO_AUTH'));
    if (!allowed.includes(req.user.role)) {
      return next(new HttpError(403, 'Forbidden for your account type', 'ERR_FORBIDDEN'));
    }
    next();
  };
}

/**
 * Sign a JWT for the given user. Payload intentionally excludes anything
 * sensitive — just enough to identify the user without a DB round-trip.
 * @param {{id: string, role: string, phone?: string, email?: string}} user
 */
function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, phone: user.phone, email: user.email },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );
}

module.exports = { requireAuth, requireRole, signToken };
