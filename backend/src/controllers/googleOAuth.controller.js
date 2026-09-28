/**
 * Google OAuth redirect flow, shared by the root-level /google routes in
 * server.js and the /api/auth/google routes in auth.routes.js.
 *
 *   GET /api/auth/google?role=vendor|couple|admin[&intent=signup]
 *
 * `role` says which kind of account the user is signing in to; `intent=signup`
 * is only honoured for couples. Google never creates vendor or admin accounts.
 */
const passport = require('passport');
const logger = require('../config/logger');
const { signToken } = require('../middleware/auth');
const { encodeOAuthState, decodeOAuthState } = require('../services/googleAuth');

function start(req, res, next) {
  const { role, intent, from } = req.query || {};
  const state = encodeOAuthState({ role, intent, from });
  passport.authenticate('google', { scope: ['profile', 'email'], state, prompt: 'select_account' })(req, res, next);
}

/**
 * Send a failed sign-in back to the login page for the account type the user
 * chose. Only an error code travels in the URL; each page maps it to its own
 * wording, so no free text from the query string is ever rendered.
 */
function failureRedirect(res, { role, from, code, accountRole }) {
  const qs = new URLSearchParams({ google_error: code || 'ERR_GOOGLE_AUTH' });
  if (accountRole) qs.set('account', accountRole);
  if (role === 'admin') {
    return res.redirect('/pages/admin-login.html?error=google_auth_failed&reason=' + encodeURIComponent(code || 'auth_failed'));
  }
  if (from === 'vendor-login') {
    return res.redirect('/pages/vendor-login.html?' + qs.toString());
  }
  // Everyone else returns to the home-page sign-in, preset to the same type.
  qs.set('auth', 'login');
  if (role === 'couple' || role === 'vendor') qs.set('as', role);
  return res.redirect('/?' + qs.toString());
}

function callback(req, res, next) {
  const { role, from } = decodeOAuthState((req.query || {}).state);

  // Guard: passport's OAuth2 strategy treats a callback carrying neither `code`
  // nor `error` as a fresh authorization request and redirects back to Google,
  // which immediately returns here — an infinite bounce the browser reports as
  // ERR_TOO_MANY_REDIRECTS. Fail it as an auth error instead.
  if (!req.query.code && !req.query.error) {
    logger.warn({ query: req.query }, 'Google OAuth callback hit without a code — refusing to re-initiate');
    return failureRedirect(res, { role, from, code: 'ERR_GOOGLE_AUTH' });
  }

  passport.authenticate('google', (err, user, info) => {
    if (err || !user) {
      logger.warn({ err: err ? err.message : null, code: err && err.code, info }, 'Google OAuth sign-in rejected');
      return failureRedirect(res, {
        role,
        from,
        code: (err && err.code) || (req.query.error === 'access_denied' ? 'ERR_GOOGLE_CANCELLED' : 'ERR_GOOGLE_AUTH'),
        accountRole: err && err.accountRole,
      });
    }

    // Store the token in the server-side session for one-time retrieval via
    // /api/auth/consume-oauth-token — it is intentionally NOT placed in the
    // redirect URL, where it would leak via history, access logs and Referer.
    const token = signToken(user);
    if (req.session) {
      req.session.oauthToken = token;
      req.session.oauthRole = user.role;
      req.session.loginAt = Date.now();
    }
    return res.redirect(`/pages/admin-login.html?auth=success&provider=google&role=${user.role}`);
  })(req, res, next);
}

module.exports = { start, callback };
