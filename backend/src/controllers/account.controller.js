/** Couple Profile page: account details, email change and password change. */
const service = require('../services/account.service');

const wrap = (fn) => async (req, res, next) => {
  try { res.json(await fn(req)); } catch (e) { next(e); }
};

module.exports = {
  get: wrap(async (req) => ({ ok: true, user: service.publicUser(req.user) })),
  updateProfile: wrap(async (req) => ({ ok: true, user: await service.updateProfile(req.user, req.body || {}) })),
  sendEmailCode: wrap((req) => service.sendEmailChangeCode(req.user)),
  confirmEmail: wrap((req) => service.confirmEmailChange(req.user, (req.body || {}).newEmail, (req.body || {}).code)),
  sendPasswordCode: wrap((req) => service.sendPasswordCode(req.user)),
  confirmPassword: wrap((req) => service.confirmPasswordChange(req.user, (req.body || {}).code, (req.body || {}).newPassword)),
  sendCredentialsCode: wrap((req) => service.sendCredentialsCode(req.user)),
  confirmCredentials: wrap((req) => service.confirmCredentialsChange(req.user, req.body || {})),
};
