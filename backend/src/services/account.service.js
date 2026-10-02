/**
 * Self-service account settings for a signed-in couple (Profile page):
 * name and phone save directly; changing the email or the password needs a
 * 6-digit code sent by email.
 *
 *  - Email change: the code goes to the CURRENT address (proves the owner is
 *    asking), then any new address can be set; the old address also gets a
 *    notice once it has changed.
 *  - Password change: the code goes to the CURRENT account email, so a stolen
 *    session alone cannot lock the owner out. Works for accounts that never
 *    had a password (passwordless / Google sign-up) — that sets one.
 *
 * Codes live in OtpCode, keyed by `phone` = "<purpose>:<userId>" so a code can
 * only ever be redeemed by the account that requested it.
 */

const bcrypt = require('bcryptjs');
const prisma = require('../config/db');
const env = require('../config/env');
const logger = require('../config/logger');
const { generateOtp, hashOtp, compareOtp } = require('../utils/otp');
const { signToken } = require('../middleware/auth');
const { HttpError } = require('../middleware/error');
const auth = require('./auth.service');
const email = require('./email.service');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, hasPassword: !!u.passwordHash };
}

async function updateProfile(user, { name, phone } = {}) {
  const data = {};
  if (name !== undefined) {
    const n = String(name || '').trim().replace(/\s+/g, ' ');
    if (n.length < 2 || n.length > 80) throw new HttpError(400, 'Please enter your name (2–80 characters).', 'ERR_INPUT');
    data.name = n;
  }
  if (phone !== undefined) {
    const raw = String(phone || '').trim();
    if (!raw) {
      data.phone = null;
    } else {
      const normalised = auth.normaliseSignupPhone(raw);
      if (!normalised) throw new HttpError(400, 'Enter a valid mobile number. Outside India, include the country code (e.g. +44 7700 900123).', 'ERR_BAD_PHONE');
      const taken = await prisma.user.findFirst({ where: { phone: normalised, id: { not: user.id } }, select: { id: true } });
      if (taken) throw new HttpError(409, 'That mobile number is already used by another account.', 'ERR_PHONE_TAKEN');
      data.phone = normalised;
    }
  }
  if (!Object.keys(data).length) throw new HttpError(400, 'Nothing to update.', 'ERR_INPUT');
  const updated = await prisma.user.update({ where: { id: user.id }, data });
  return publicUser(updated);
}

/** Store a fresh code for this user+purpose, invalidating any older one. */
async function issueCode(key, purpose) {
  await auth.rateLimitCheck(key);
  await prisma.otpCode.updateMany({ where: { phone: key, purpose, consumedAt: null }, data: { consumedAt: new Date() } });
  const code = generateOtp();
  await prisma.otpCode.create({
    data: { phone: key, purpose, codeHash: await hashOtp(code), expiresAt: new Date(Date.now() + env.OTP_TTL_MIN * 60 * 1000) },
  });
  return code;
}

/** Check (and on success consume) the latest code. Five wrong tries locks it. */
async function redeemCode(key, purpose, code) {
  if (!/^[0-9]{6}$/.test(String(code || '').trim())) throw new HttpError(400, 'Enter the 6-digit code from your email.', 'ERR_BAD_CODE');
  const row = await prisma.otpCode.findFirst({
    where: { phone: key, purpose, consumedAt: null, expiresAt: { gte: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) throw new HttpError(400, 'This code has expired. Please request a new one.', 'ERR_OTP_EXPIRED');
  if (row.attempts >= 5) throw new HttpError(429, 'Too many wrong attempts. Please request a new code.', 'ERR_OTP_LOCKED');
  if (!(await compareOtp(String(code).trim(), row.codeHash))) {
    await prisma.otpCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    throw new HttpError(400, 'Wrong code — please check your email and try again.', 'ERR_OTP_WRONG');
  }
  await prisma.otpCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
}

function delivered(result) {
  return !!(result && result.ok && !result.fallback);
}

/**
 * Email change, step 1: the code goes to the CURRENT address, so only the
 * person who controls the existing inbox can move the account elsewhere — a
 * stolen session alone cannot take it over.
 */
async function sendEmailChangeCode(user) {
  if (!user.email) throw new HttpError(400, 'There is no email on this account to verify. Please contact support.', 'ERR_NO_EMAIL');
  const code = await issueCode(`email_change:${user.id}`, 'email_change');
  const result = await email.sendEmailChangeOtpEmail(user.email, code).catch((err) => ({ ok: false, error: err.message }));
  if (!delivered(result)) {
    logger.error({ userId: user.id, result }, 'Email-change code was not delivered');
    const devCode = auth.devCodeFor(code, false);
    if (!devCode) throw Object.assign(new HttpError(502, 'We could not send the code to your email right now. Please try again shortly.', 'ERR_DELIVERY_FAILED'), { expose: true });
    return { ok: true, sentTo: user.email, expiresIn: env.OTP_TTL_MIN * 60, devCode };
  }
  return { ok: true, sentTo: user.email, expiresIn: env.OTP_TTL_MIN * 60, devCode: auth.devCodeFor(code, true) };
}

/** Email change, step 2: code from the current inbox + the new address. */
async function confirmEmailChange(user, newEmailRaw, code) {
  const newEmail = String(newEmailRaw || '').trim().toLowerCase();
  if (!EMAIL_RE.test(newEmail)) throw new HttpError(400, 'Enter a valid new email address.', 'ERR_INPUT');
  if (newEmail === String(user.email || '').toLowerCase()) throw new HttpError(400, 'That is already your email address.', 'ERR_INPUT');
  // Check before spending the code, so a taken address doesn't burn it.
  const clash = await prisma.user.findUnique({ where: { email: newEmail }, select: { id: true } });
  if (clash) throw new HttpError(409, 'That email address is already used by another account.', 'ERR_EMAIL_TAKEN');

  await redeemCode(`email_change:${user.id}`, 'email_change', code);

  const taken = await prisma.user.findUnique({ where: { email: newEmail }, select: { id: true } });
  if (taken && taken.id !== user.id) throw new HttpError(409, 'That email address is already used by another account.', 'ERR_EMAIL_TAKEN');

  const oldEmail = user.email;
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { email: newEmail, verifiedAt: user.verifiedAt || new Date() },
  });
  logger.info({ userId: user.id }, 'Account email changed');
  if (oldEmail) {
    email.sendEmailChangedNoticeEmail(oldEmail, newEmail)
      .catch((err) => logger.error({ err, userId: user.id }, 'Email-changed notice failed'));
  }
  // The JWT carries the email; hand back one with the new address.
  return { ok: true, user: publicUser(updated), token: signToken(updated) };
}

async function sendPasswordCode(user) {
  if (!user.email) throw new HttpError(400, 'Add an email address to your account first.', 'ERR_NO_EMAIL');
  const code = await issueCode(`password_change:${user.id}`, 'password_change');
  const result = await email.sendPasswordChangeOtpEmail(user.email, code).catch((err) => ({ ok: false, error: err.message }));
  if (!delivered(result)) {
    logger.error({ userId: user.id, result }, 'Password-change code was not delivered');
    const devCode = auth.devCodeFor(code, false);
    if (!devCode) throw Object.assign(new HttpError(502, 'We could not send the code to your email right now. Please try again shortly.', 'ERR_DELIVERY_FAILED'), { expose: true });
    return { ok: true, sentTo: user.email, expiresIn: env.OTP_TTL_MIN * 60, devCode };
  }
  return { ok: true, sentTo: user.email, expiresIn: env.OTP_TTL_MIN * 60, devCode: auth.devCodeFor(code, true) };
}

async function confirmPasswordChange(user, code, newPassword) {
  auth.assertStrongPassword(newPassword);
  await redeemCode(`password_change:${user.id}`, 'password_change', code);
  const passwordHash = await bcrypt.hash(String(newPassword), await bcrypt.genSalt(10));
  // Sign out every other device: revokedBefore invalidates all older tokens,
  // then this device gets a fresh one below so it stays signed in.
  const now = new Date(Date.now() - 1000);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false, revokedBefore: now },
  });
  await prisma.session.deleteMany({ where: { userId: user.id } });
  logger.info({ userId: user.id }, 'Password changed via emailed code');
  return { ok: true, user: publicUser(updated), token: signToken(updated) };
}

/**
 * Admin Settings: one code, sent to the CURRENT account email, authorises a
 * new email, a new password, or both at once.
 */
async function sendCredentialsCode(user) {
  if (!user.email) throw new HttpError(400, 'There is no email on this account to verify. Please contact support.', 'ERR_NO_EMAIL');
  const code = await issueCode(`credentials_change:${user.id}`, 'credentials_change');
  const result = await email.sendCredentialsChangeOtpEmail(user.email, code).catch((err) => ({ ok: false, error: err.message }));
  if (!delivered(result)) {
    logger.error({ userId: user.id, result }, 'Credentials-change code was not delivered');
    const devCode = auth.devCodeFor(code, false);
    if (!devCode) throw Object.assign(new HttpError(502, 'We could not send the code to your email right now. Please try again shortly.', 'ERR_DELIVERY_FAILED'), { expose: true });
    return { ok: true, sentTo: user.email, expiresIn: env.OTP_TTL_MIN * 60, devCode };
  }
  return { ok: true, sentTo: user.email, expiresIn: env.OTP_TTL_MIN * 60, devCode: auth.devCodeFor(code, true) };
}

async function confirmCredentialsChange(user, { code, newEmail: newEmailRaw, newPassword } = {}) {
  const newEmail = String(newEmailRaw || '').trim().toLowerCase();
  const changeEmail = !!newEmail;
  const changePassword = !!newPassword;
  if (!changeEmail && !changePassword) throw new HttpError(400, 'Enter a new email, a new password, or both.', 'ERR_INPUT');

  // Validate everything before spending the code, so a typo doesn't burn it.
  if (changeEmail) {
    if (!EMAIL_RE.test(newEmail)) throw new HttpError(400, 'Enter a valid new email address.', 'ERR_INPUT');
    if (newEmail === String(user.email || '').toLowerCase()) throw new HttpError(400, 'That is already your email address.', 'ERR_INPUT');
    const clash = await prisma.user.findUnique({ where: { email: newEmail }, select: { id: true } });
    if (clash) throw new HttpError(409, 'That email address is already used by another account.', 'ERR_EMAIL_TAKEN');
  }
  if (changePassword) auth.assertStrongPassword(newPassword);

  await redeemCode(`credentials_change:${user.id}`, 'credentials_change', code);

  const data = {};
  if (changeEmail) {
    data.email = newEmail;
    data.verifiedAt = user.verifiedAt || new Date();
  }
  if (changePassword) {
    data.passwordHash = await bcrypt.hash(String(newPassword), await bcrypt.genSalt(10));
    data.mustChangePassword = false;
    // Sign out every other device; this one gets a fresh token below.
    data.revokedBefore = new Date(Date.now() - 1000);
  }
  const updated = await prisma.user.update({ where: { id: user.id }, data });
  if (changePassword) await prisma.session.deleteMany({ where: { userId: user.id } });
  logger.info({ userId: user.id, changeEmail, changePassword }, 'Login details changed via emailed code');

  if (changeEmail && user.email) {
    email.sendEmailChangedNoticeEmail(user.email, newEmail)
      .catch((err) => logger.error({ err, userId: user.id }, 'Email-changed notice failed'));
  }
  return { ok: true, user: publicUser(updated), token: signToken(updated), changed: { email: changeEmail, password: changePassword } };
}

module.exports = {
  publicUser,
  sendCredentialsCode,
  confirmCredentialsChange,
  updateProfile,
  sendEmailChangeCode,
  confirmEmailChange,
  sendPasswordCode,
  confirmPasswordChange,
};
