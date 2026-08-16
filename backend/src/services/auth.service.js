/**
 * Authentication service — every login/signup/verification flow the platform
 * supports lives here. Three independent auth styles coexist by design:
 *
 *   1. Legacy WhatsApp OTP        (startOtp / verifyOtp)            — phone-based
 *   2. Email/password + email OTP (signup / login / verifyEmailOtp) — vendor & business users
 *   3. Passwordless email OTP     (checkUser / registerAndSendOtp / verifyOtpLogin) — couples
 *
 * Plus a unified password flow shared by all roles (loginWithPassword) and a
 * cryptographic single-use-token password reset (forgotPasswordSecure /
 * resetPasswordSecure) used by the password-based login screens.
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../config/db');
const env = require('../config/env');
const logger = require('../config/logger');
const { normalisePhone, isValidPhone } = require('../utils/phone');
const { generateOtp, hashOtp, compareOtp } = require('../utils/otp');
const { signToken } = require('../middleware/auth');
const { sendOtp } = require('./whatsapp.service');
const { sendOtpEmail, sendBusinessLoginOtpEmail } = require('./email.service');
const { HttpError } = require('../middleware/error');
const { slugify, uniqueSlug } = require('../utils/slug');

const ROLES = new Set(['vendor', 'couple', 'admin']);

/**
 * Enforce the password strength policy on any newly set/changed password.
 * Only runs when a password is created or reset — existing users are never
 * re-validated and can keep logging in with their current password.
 * Requires: >= 8 chars, one uppercase, one lowercase, one number, one special.
 */
function assertStrongPassword(pw) {
  const password = String(pw || '');
  const ok =
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password);
  if (!ok) {
    throw new HttpError(
      400,
      'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character (e.g. !@#$%).',
      'ERR_WEAK_PASSWORD'
    );
  }
}

/** Throws ERR_OTP_RATE if this phone/email has requested too many OTPs in the last hour. */
async function rateLimitCheck(phoneOrEmail) {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const count = await prisma.otpCode.count({
    where: { phone: phoneOrEmail, createdAt: { gte: since } }
  });
  if (count >= env.OTP_MAX_PER_HOUR) {
    throw new HttpError(429, `Too many OTP requests. Try again in an hour.`, 'ERR_OTP_RATE');
  }
}

/**
 * Same per-hour cap as rateLimitCheck, but for the passwordless couple-login
 * flow (checkUser/registerAndSendOtp), which writes to UserOtp rather than
 * OtpCode. Without this, those two endpoints had no application-level rate
 * limit at all — only the shared IP-keyed route limiter — making OTP-request
 * spam/email-bombing against any address effectively unbounded per account.
 */
async function rateLimitCheckUserOtp(email) {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const count = await prisma.userOtp.count({
    where: { email, createdAt: { gte: since } }
  });
  if (count >= env.OTP_MAX_PER_HOUR) {
    throw new HttpError(429, 'Too many OTP requests. Try again in an hour.', 'ERR_OTP_RATE');
  }
}

/**
 * In-memory brute-force guard for passwordless OTP verification
 * (verifyOtpLogin). UserOtp has no `attempts` column to persist a per-code
 * counter (unlike OtpCode, which already locks after 5 wrong tries), and
 * this app always runs as a single PM2 instance in fork mode — never
 * clustered — because the Baileys WhatsApp socket can't be shared across
 * workers (see ecosystem.config.js), so a per-process Map is safe here and
 * survives across the whole process lifetime.
 */
const otpLoginAttempts = new Map(); // normalizedEmail -> { count, lockedUntil }
const OTP_LOGIN_MAX_ATTEMPTS = 5;
const OTP_LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

function assertOtpLoginNotLocked(email) {
  const rec = otpLoginAttempts.get(email);
  if (rec && rec.lockedUntil && rec.lockedUntil > Date.now()) {
    throw new HttpError(429, 'Too many wrong attempts. Try again in 15 minutes.', 'ERR_OTP_LOCKED');
  }
}

function recordOtpLoginFailure(email) {
  const rec = otpLoginAttempts.get(email) || { count: 0, lockedUntil: null };
  rec.count += 1;
  if (rec.count >= OTP_LOGIN_MAX_ATTEMPTS) {
    rec.lockedUntil = Date.now() + OTP_LOGIN_LOCKOUT_MS;
    rec.count = 0;
  }
  otpLoginAttempts.set(email, rec);
}

function clearOtpLoginAttempts(email) {
  otpLoginAttempts.delete(email);
}

/**
 * Sends a WhatsApp OTP code
 */
async function startOtp({ phone, purpose = 'login' }) {
  const p = normalisePhone(phone);
  if (!isValidPhone(p)) throw new HttpError(400, 'Enter a valid Indian mobile number', 'ERR_BAD_PHONE');

  await rateLimitCheck(p);

  // Invalidate any unused OTPs for this phone
  await prisma.otpCode.updateMany({
    where: { phone: p, consumedAt: null, expiresAt: { gte: new Date() } },
    data: { consumedAt: new Date() },
  });

  const code = generateOtp();
  const codeHash = await hashOtp(code);
  const expiresAt = new Date(Date.now() + env.OTP_TTL_MIN * 60 * 1000);

  await prisma.otpCode.create({ data: { phone: p, codeHash, purpose, expiresAt } });

  const r = await sendOtp(p, code);
  if (env.OTP_DEBUG_LOG) logger.warn({ phone: p, code, waOk: r.ok }, '[DEV] WhatsApp OTP generated');

  return {
    ok: true,
    phone: p,
    devCode: env.OTP_DEBUG_LOG ? code : undefined,
    waDelivered: !!r.ok,
    expiresIn: env.OTP_TTL_MIN * 60,
  };
}

/**
 * Verifies a WhatsApp OTP
 */
async function verifyOtp({ phone, code, role, name }) {
  const p = normalisePhone(phone);
  if (!isValidPhone(p)) throw new HttpError(400, 'Enter a valid Indian mobile number', 'ERR_BAD_PHONE');
  if (!/^[0-9]{4,8}$/.test(String(code || ''))) throw new HttpError(400, 'Enter the OTP', 'ERR_BAD_CODE');

  const row = await prisma.otpCode.findFirst({
    where: { phone: p, consumedAt: null, expiresAt: { gte: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) throw new HttpError(400, 'OTP expired - request a new one', 'ERR_OTP_EXPIRED');
  if (row.attempts >= 5) throw new HttpError(429, 'Too many wrong attempts', 'ERR_OTP_LOCKED');

  const ok = await compareOtp(String(code), row.codeHash);
  if (!ok) {
    await prisma.otpCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    throw new HttpError(400, 'Wrong OTP - try again', 'ERR_OTP_WRONG');
  }
  await prisma.otpCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });

  // Look up or create the user
  let user = await prisma.user.findUnique({ where: { phone: p } });

  if (user && user.suspendedAt) {
    throw new HttpError(403, 'Your account has been suspended. Contact support for assistance.', 'ERR_ACCOUNT_SUSPENDED');
  }

  const isAdminPhone = env.ADMIN_PHONES.includes(p);
  if (!user) {
    const chosenRole = isAdminPhone ? 'admin' : (ROLES.has(role) ? role : 'couple');
    user = await prisma.user.create({
      data: {
        phone: p,
        role: chosenRole,
        name: name || null,
        verifiedAt: new Date(),
      },
    });
  } else if (!user.verifiedAt) {
    user = await prisma.user.update({ where: { id: user.id }, data: { verifiedAt: new Date() } });
  }

  // Promote to admin if env says so
  if (isAdminPhone && user.role !== 'admin') {
    user = await prisma.user.update({ where: { id: user.id }, data: { role: 'admin' } });
  }

  const token = signToken(user);
  const sessionId = crypto.randomUUID();
  await prisma.session.create({
    data: { userId: user.id, token: sessionId, expiresAt: new Date(Date.now() + 30 * 86400 * 1000) },
  });

  return {
    ok: true,
    token,
    user: { id: user.id, phone: user.phone, role: user.role, name: user.name },
  };
}

/**
 * Standard Email/Password Signup
 */
async function signup(payload) {
  const { role, name, email, phone, password, businessName, category, city, area, address, pincode } = payload;

  if (!role || !name || !email || !phone || !password) {
    throw new HttpError(400, 'All fields are required', 'ERR_BAD_INPUT');
  }

  assertStrongPassword(password);

  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedPhone = normalisePhone(phone);

  if (!isValidPhone(normalizedPhone)) {
    throw new HttpError(400, 'Enter a valid Indian mobile number', 'ERR_BAD_PHONE');
  }

  // Check if user already exists
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email: normalizedEmail },
        { phone: normalizedPhone }
      ]
    }
  });

  if (existingUser) {
    throw new HttpError(400, 'An account with this email or mobile number already exists', 'ERR_USER_EXISTS');
  }

  // Hash password
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const chosenRole = env.ADMIN_PHONES.includes(normalizedPhone) ? 'admin' : (ROLES.has(role) ? role : 'couple');

  // Transactionally create User and Vendor/Couple profiles
  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        email: normalizedEmail,
        phone: normalizedPhone,
        role: chosenRole,
        name,
        passwordHash,
        verifiedAt: null, // must verify email OTP first
      }
    });

    if (chosenRole === 'couple') {
      await tx.couple.create({
        data: {
          userId: newUser.id,
          city: city || null,
          citySlug: city ? slugify(city) : null,
        }
      });
    } else if (chosenRole === 'vendor') {
      const bName = businessName || `${name}'s Wedding Company`;
      const slug = await uniqueSlug(tx, 'vendor', bName + '-' + (city || 'Mumbai'));

      await tx.vendor.create({
        data: {
          userId: newUser.id,
          businessName: bName,
          slug,
          category: category || 'Wedding Planners',
          categorySlug: slugify(category || 'Wedding Planners'),
          city: city || 'Mumbai',
          citySlug: slugify(city || 'Mumbai'),
          area: area || null,
          address: address || null,
          pincode: pincode || null,
          whatsappNumber: normalizedPhone,
          // Not publicly listed until the owner verifies their email (flipped
          // to true in verifyEmailOtp below). The schema default is `true`,
          // which meant anyone could flood the public directory with fake
          // listings via unlimited signups — no verification, no admin
          // review, nothing — since the listing went live at account
          // creation regardless of whether verification ever happened.
          isActive: false,
        }
      });
    }

    return newUser;
  });

  // Automatically trigger email OTP send
  let emailSent = true;
  try {
    await startEmailOtp(normalizedEmail);
  } catch (err) {
    logger.error({ err, email: normalizedEmail }, 'Failed to automatically send verification OTP email on signup');
    emailSent = false;
  }

  return {
    ok: true,
    message: emailSent 
      ? 'Registration successful! Verification OTP sent to email.' 
      : 'Registration successful! However, the verification code email could not be delivered. Please try to log in to request a code.',
    email: normalizedEmail,
    emailSent
  };
}

/**
 * Standard Email/Password and Admin Unified Login
 */
async function login({ emailOrPhone, password }) {
  if (!emailOrPhone || !password) {
    throw new HttpError(400, 'Email/Phone and password are required', 'ERR_BAD_INPUT');
  }

  const identity = String(emailOrPhone).trim().toLowerCase();
  
  // Find user by email or phone (optimized to use findUnique unique index queries)
  let user = null;
  if (identity.includes('@')) {
    user = await prisma.user.findUnique({
      where: { email: identity },
      include: { vendor: true, couple: true }
    });
  } else {
    user = await prisma.user.findUnique({
      where: { phone: identity },
      include: { vendor: true, couple: true }
    });
  }

  if (!user || !user.passwordHash) {
    throw new HttpError(401, 'Invalid email/phone or password', 'ERR_INVALID_CREDENTIALS');
  }

  if (user.suspendedAt) {
    throw new HttpError(403, 'Your account has been suspended. Contact support for assistance.', 'ERR_ACCOUNT_SUSPENDED');
  }

  if (user.role === 'admin') {
    throw new HttpError(403, 'Admins must log in through the Admin Portal', 'ERR_ADMIN_ONLY');
  }

  // Check password hash
  const isMatch = await bcrypt.compare(String(password), user.passwordHash);
  if (!isMatch) {
    throw new HttpError(401, 'Invalid email/phone or password', 'ERR_INVALID_CREDENTIALS');
  }

  // Unverified accounts do NOT get a session — dispatch a fresh verification
  // OTP and stop here instead. Previously a valid token+session was issued
  // unconditionally right after this block regardless of verifiedAt; the
  // frontend chose not to store that token when `!user.verified` (see
  // index.html's screenVerifyEmailOtp handling), but that was only ever a
  // client-side courtesy — anyone calling this API directly (curl/Postman)
  // got a fully working session for an unverified account. Completion still
  // goes through the existing verify-email-otp screen/endpoint, which mints
  // the real token once the OTP is confirmed.
  if (!user.verifiedAt && user.email) {
    const code = generateOtp();
    const codeHash = await hashOtp(code);
    const expiresAt = new Date(Date.now() + env.OTP_TTL_MIN * 60 * 1000);

    // Invalidate previous OTPs
    await prisma.otpCode.updateMany({
      where: { phone: user.email, purpose: 'email_verification', consumedAt: null, expiresAt: { gte: new Date() } },
      data: { consumedAt: new Date() }
    });

    // Save code
    await prisma.otpCode.create({
      data: {
        phone: user.email,
        codeHash,
        purpose: 'email_verification',
        expiresAt
      }
    });

    // Send custom email. sendMail() never rejects, so .catch() alone can't
    // detect a real delivery failure — check the resolved result too.
    const bizName = (user.vendor && user.vendor[0]?.businessName) || user.name || 'your business';
    sendBusinessLoginOtpEmail(user.email, code, bizName).then((result) => {
      if (!result || !result.ok || result.fallback) {
        logger.error({ to: user.email, result }, 'Login verification OTP email was not delivered — SMTP not configured or send failed');
      }
    }).catch(e => {
      logger.error({ err: e, to: user.email }, 'Failed to dispatch login OTP email');
    });

    if (env.OTP_DEBUG_LOG) {
      logger.warn({ email: user.email, code }, '[DEV] Auto-login Email verification OTP generated');
    }

    return {
      ok: true,
      requireVerification: true,
      user: { email: user.email, verified: false },
    };
  }

  // Create JWT session
  const token = signToken(user);
  const sessionId = crypto.randomUUID();
  await prisma.session.create({
    data: {
      userId: user.id,
      token: sessionId,
      expiresAt: new Date(Date.now() + 30 * 86400 * 1000)
    },
  });

  return {
    ok: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      name: user.name,
      verified: !!user.verifiedAt,
      mustChangePassword: !!user.mustChangePassword,
      vendor: (user.vendor && user.vendor.length > 0) ? { id: user.vendor[0].id, businessName: user.vendor[0].businessName } : null,
      couple: user.couple ? { id: user.couple.id } : null,
    },
  };
}

/**
 * Starts email OTP verification
 */
async function startEmailOtp(email) {
  const normalizedEmail = String(email).trim().toLowerCase();
  await rateLimitCheck(normalizedEmail);

  // Invalidate previous OTPs
  await prisma.otpCode.updateMany({
    where: { phone: normalizedEmail, consumedAt: null, expiresAt: { gte: new Date() } },
    data: { consumedAt: new Date() }
  });

  const code = generateOtp();
  const codeHash = await hashOtp(code);
  const expiresAt = new Date(Date.now() + env.OTP_TTL_MIN * 60 * 1000);

  await prisma.otpCode.create({
    data: {
      phone: normalizedEmail, // store email in phone column for OTP unification
      codeHash,
      purpose: 'email_verification',
      expiresAt
    }
  });

  // sendMail() never rejects (it catches SMTP errors internally and always
  // resolves with { ok, fallback? }), so a try/catch here never actually
  // fires on a real delivery failure — emailSent was always true regardless
  // of whether SMTP was configured or the send succeeded. Check the
  // resolved result instead.
  let emailSent = true;
  try {
    const result = await sendOtpEmail(normalizedEmail, code);
    if (!result || !result.ok || result.fallback) {
      logger.error({ email: normalizedEmail, result }, 'OTP verification email was not delivered — SMTP not configured or send failed');
      emailSent = false;
    }
  } catch (err) {
    logger.error({ err, email: normalizedEmail }, 'Failed to send OTP verification email');
    emailSent = false;
  }

  if (env.OTP_DEBUG_LOG) {
    logger.warn({ email: normalizedEmail, code }, '[DEV] Email verification OTP generated');
  }

  return {
    ok: true,
    email: normalizedEmail,
    emailSent,
    devCode: env.OTP_DEBUG_LOG ? code : undefined,
    expiresIn: env.OTP_TTL_MIN * 60,
  };
}

/**
 * Verifies email OTP and marks user verified
 */
async function verifyEmailOtp({ email, code }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  if (!/^[0-9]{4,8}$/.test(String(code || ''))) {
    throw new HttpError(400, 'Enter valid OTP code', 'ERR_BAD_CODE');
  }

  // purpose is scoped to 'email_verification' ONLY — without this, this
  // endpoint (public, unauthenticated: POST /api/auth/email/verify-otp)
  // would happily consume an 'admin_2fa' code too. Since anyone can trigger
  // a fresh 'email_verification' code for ANY email via the equally-public
  // POST /api/auth/email/send-otp, mixing purposes here meant that reading a
  // single OTP email (inbox compromise, etc.) was enough to log in as that
  // account WITHOUT ever knowing the password — the "2FA" step was really
  // an OR, not an AND. See verifyAdmin2Fa for the admin_2fa-scoped sibling.
  const row = await prisma.otpCode.findFirst({
    where: { phone: normalizedEmail, purpose: 'email_verification', consumedAt: null, expiresAt: { gte: new Date() } },
    orderBy: { createdAt: 'desc' },
  });

  if (!row) throw new HttpError(400, 'OTP expired - request a new one', 'ERR_OTP_EXPIRED');
  if (row.attempts >= 5) throw new HttpError(429, 'Too many wrong attempts', 'ERR_OTP_LOCKED');

  const ok = await compareOtp(String(code), row.codeHash);
  if (!ok) {
    await prisma.otpCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    throw new HttpError(400, 'Wrong OTP - try again', 'ERR_OTP_WRONG');
  }

  await prisma.otpCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });

  // Update user's verifiedAt status
  let user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: { vendor: true, couple: true }
  });

  if (!user) throw new HttpError(404, 'User profile not found', 'ERR_NO_USER');

  const wasAlreadyVerified = !!user.verifiedAt;

  user = await prisma.user.update({
    where: { id: user.id },
    data: { verifiedAt: new Date() },
    include: { vendor: true, couple: true }
  });

  if (user.role === 'vendor' && !wasAlreadyVerified) {
    // Publish any listing(s) created unverified (isActive: false) at signup
    // — see signup() above. Uses updateMany rather than assuming a single
    // vendor row since a user can own more than one listing.
    await prisma.vendor.updateMany({
      where: { userId: user.id, isActive: false },
      data: { isActive: true },
    });
    const { sendVendorRegistrationNotification } = require('./email.service');
    sendVendorRegistrationNotification(normalizedEmail, (user.vendor && user.vendor[0]?.businessName) || user.name || 'your business').catch(e => {
      logger.error({ err: e, to: normalizedEmail }, 'Failed to send vendor registration notification email');
    });
  }

  const token = signToken(user);
  const sessionId = crypto.randomUUID();
  await prisma.session.create({
    data: {
      userId: user.id,
      token: sessionId,
      expiresAt: new Date(Date.now() + 30 * 86400 * 1000)
    },
  });

  return {
    ok: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      name: user.name,
      verified: true,
      vendor: (user.vendor && user.vendor.length > 0) ? { id: user.vendor[0].id, businessName: user.vendor[0].businessName } : null,
      couple: user.couple ? { id: user.couple.id } : null,
    }
  };
}

/**
 * Completes admin 2FA: the second step of loginWithPassword's admin branch.
 * Deliberately a SEPARATE function/endpoint from verifyEmailOtp, scoped to
 * purpose: 'admin_2fa' only — that purpose value is only ever written to
 * OtpCode after loginWithPassword's bcrypt.compare has already succeeded
 * (see loginWithPassword above), so completing this step genuinely proves
 * both factors (password AND email OTP), unlike the old shared endpoint.
 */
async function verifyAdmin2Fa({ email, code }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  if (!/^[0-9]{4,8}$/.test(String(code || ''))) {
    throw new HttpError(400, 'Enter valid OTP code', 'ERR_BAD_CODE');
  }

  const row = await prisma.otpCode.findFirst({
    where: { phone: normalizedEmail, purpose: 'admin_2fa', consumedAt: null, expiresAt: { gte: new Date() } },
    orderBy: { createdAt: 'desc' },
  });

  if (!row) throw new HttpError(400, 'OTP expired - request a new one', 'ERR_OTP_EXPIRED');
  if (row.attempts >= 5) throw new HttpError(429, 'Too many wrong attempts', 'ERR_OTP_LOCKED');

  const ok = await compareOtp(String(code), row.codeHash);
  if (!ok) {
    await prisma.otpCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    throw new HttpError(400, 'Wrong OTP - try again', 'ERR_OTP_WRONG');
  }

  await prisma.otpCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user || user.role !== 'admin') {
    throw new HttpError(404, 'Admin account not found', 'ERR_NO_USER');
  }
  if (user.suspendedAt) {
    throw new HttpError(403, 'Your account has been suspended. Contact support for assistance.', 'ERR_ACCOUNT_SUSPENDED');
  }

  const jwt = require('jsonwebtoken');
  const token = jwt.sign(
    { sub: user.id, role: user.role, phone: user.phone, email: user.email },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );

  const sessionId = crypto.randomUUID();
  await prisma.session.create({
    data: {
      userId: user.id,
      token: sessionId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  return {
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
      mustChangePassword: !!user.mustChangePassword,
    },
  };
}

/**
 * Passwordless OTP: STEP 1 — Check Existing User
 */
async function checkUser(email) {
  if (!email) throw new HttpError(400, 'Email is required', 'ERR_BAD_INPUT');
  const normalizedEmail = String(email).trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail }
  });

  if (!user) {
    return { userExists: false };
  }

  await rateLimitCheckUserOtp(normalizedEmail);

  // Generate 6-digit OTP and hash it before storage
  const otp = generateOtp();
  const otpHash = await hashOtp(otp);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins expiry
  
  // Store hashed OTP inside user_otps (never store plaintext)
  await prisma.userOtp.create({
    data: {
      email: normalizedEmail,
      otp: otpHash,
      expiresAt
    }
  });
  
  // Send HTML Email OTP. sendMail() never rejects — see startEmailOtp above
  // for why the try/catch alone can't detect a real delivery failure.
  const { sendPasswordlessOtpEmail } = require('./email.service');
  let emailSent = true;
  try {
    const result = await sendPasswordlessOtpEmail(normalizedEmail, otp);
    if (!result || !result.ok || result.fallback) {
      logger.error({ email: normalizedEmail, result }, 'Passwordless login OTP email was not delivered — SMTP not configured or send failed');
      emailSent = false;
    }
  } catch (err) {
    logger.error({ err, email: normalizedEmail }, 'Failed to send passwordless login OTP email');
    emailSent = false;
  }

  if (env.OTP_DEBUG_LOG) {
    logger.warn({ email: normalizedEmail, otp }, '[DEV] Passwordless Login OTP generated');
  }
  
  return { 
    userExists: true, 
    emailSent,
    devCode: env.OTP_DEBUG_LOG ? otp : undefined 
  };
}

/**
 * Passwordless OTP: STEP 2 — Register New User
 */
async function registerAndSendOtp({ email, name, mobile }) {
  if (!email || !name) {
    throw new HttpError(400, 'Email and Name are required', 'ERR_BAD_INPUT');
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const phone = mobile ? normalisePhone(mobile) : null;
  
  if (phone && !isValidPhone(phone)) {
    throw new HttpError(400, 'Enter a valid Indian mobile number', 'ERR_BAD_PHONE');
  }
  
  // Check if email or phone already exists
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email: normalizedEmail },
        ...(phone ? [{ phone }] : [])
      ]
    }
  });
  
  if (existingUser) {
    throw new HttpError(400, 'An account with this email or mobile number already exists', 'ERR_USER_EXISTS');
  }

  await rateLimitCheckUserOtp(normalizedEmail);

  // Create user with default role = 'couple' and auth_provider = 'local'
  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        email: normalizedEmail,
        phone,
        role: 'couple',
        name,
        authProvider: 'local',
        verifiedAt: null
      }
    });
    
    await tx.couple.create({
      data: {
        userId: newUser.id
      }
    });
    
    return newUser;
  });
  
  // Generate 6-digit OTP and hash it before storage
  const otp = generateOtp();
  const otpHash = await hashOtp(otp);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins expiry
  
  await prisma.userOtp.create({
    data: {
      email: normalizedEmail,
      otp: otpHash,
      expiresAt
    }
  });
  
  const { sendPasswordlessOtpEmail } = require('./email.service');
  let emailSent = true;
  try {
    const result = await sendPasswordlessOtpEmail(normalizedEmail, otp);
    if (!result || !result.ok || result.fallback) {
      logger.error({ email: normalizedEmail, result }, 'Passwordless signup OTP email was not delivered — SMTP not configured or send failed');
      emailSent = false;
    }
  } catch (err) {
    logger.error({ err, email: normalizedEmail }, 'Failed to send passwordless signup OTP email');
    emailSent = false;
  }
  
  if (env.OTP_DEBUG_LOG) {
    logger.warn({ email: normalizedEmail, otp }, '[DEV] Passwordless Signup OTP generated');
  }
  
  return {
    ok: true,
    message: emailSent 
      ? 'Registration successful! Verification OTP sent to email.' 
      : 'Registration successful! However, the OTP verification email could not be delivered.',
    email: normalizedEmail,
    emailSent,
    devCode: env.OTP_DEBUG_LOG ? otp : undefined
  };
}

/**
 * Passwordless OTP: STEP 3 — Verify OTP Login
 */
async function verifyOtpLogin({ email, otp }) {
  if (!email || !otp) {
    throw new HttpError(400, 'Email and OTP are required', 'ERR_BAD_INPUT');
  }
  const normalizedEmail = String(email).trim().toLowerCase();

  assertOtpLoginNotLocked(normalizedEmail);

  // Find the most recent non-expired OTP for this email
  const otpRecord = await prisma.userOtp.findFirst({
    where: {
      email: normalizedEmail,
      expiresAt: { gte: new Date() }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Verify OTP using bcrypt comparison (OTP is stored hashed)
  let otpValid = false;
  if (otpRecord) {
    otpValid = await compareOtp(String(otp).trim(), otpRecord.otp);
  }

  if (!otpValid) {
    recordOtpLoginFailure(normalizedEmail);
    throw new HttpError(400, 'Invalid or expired OTP', 'ERR_OTP_WRONG');
  }

  clearOtpLoginAttempts(normalizedEmail);

  // Delete OTP on successful verification
  if (otpRecord) {
    await prisma.userOtp.delete({
      where: { id: otpRecord.id }
    });
  }
  
  // Fetch user
  let user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: { vendor: true, couple: true }
  });
  
  if (!user) throw new HttpError(404, 'User profile not found', 'ERR_NO_USER');

  if (user.suspendedAt) {
    throw new HttpError(403, 'Your account has been suspended. Contact support for assistance.', 'ERR_ACCOUNT_SUSPENDED');
  }
  
  // Update verification status and last login
  user = await prisma.user.update({
    where: { id: user.id },
    data: {
      verifiedAt: user.verifiedAt || new Date(),
      lastLogin: new Date()
    },
    include: { vendor: true, couple: true }
  });
  
  const token = signToken(user);
  
  // Store db session
  const sessionId = crypto.randomUUID();
  await prisma.session.create({
    data: {
      userId: user.id,
      token: sessionId,
      expiresAt: new Date(Date.now() + 30 * 86400 * 1000)
    }
  });
  
  return {
    token,
    userData: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      name: user.name,
      imageUrl: user.imageUrl,
      verified: true,
      vendor: (user.vendor && user.vendor.length > 0) ? { id: user.vendor[0].id, businessName: user.vendor[0].businessName } : null,
      couple: user.couple ? { id: user.couple.id } : null
    }
  };
}

/**
 * PASSWORD AUTHENTICATION SYSTEM (ONLY for Admins, Vendors, Venue users, Business dashboard users)
 */
async function loginWithPassword({ email, role, password }) {
  if (!email || !role || !password) {
    throw new HttpError(400, 'Email, role and password are required', 'ERR_BAD_INPUT');
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: { vendor: true, couple: true }
  });
  
  if (!user || user.role !== role || !user.passwordHash) {
    throw new HttpError(401, 'Invalid email or password', 'ERR_INVALID_CREDENTIALS');
  }

  if (user.suspendedAt) {
    throw new HttpError(403, 'Your account has been suspended. Contact support for assistance.', 'ERR_ACCOUNT_SUSPENDED');
  }
  
  const isMatch = await bcrypt.compare(String(password), user.passwordHash);
  if (!isMatch) {
    throw new HttpError(401, 'Invalid email or password', 'ERR_INVALID_CREDENTIALS');
  }
  
  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() }
  });

  // If user role is 'admin', generate and dispatch 2FA OTP
  if (user.role === 'admin') {
    const code = generateOtp();
    const codeHash = await hashOtp(code);
    const expiresAt = new Date(Date.now() + env.OTP_TTL_MIN * 60 * 1000);

    // Invalidate previous OTPs for this admin email
    await prisma.otpCode.updateMany({
      where: { phone: normalizedEmail, consumedAt: null, expiresAt: { gte: new Date() } },
      data: { consumedAt: new Date() }
    });

    // Create the OTP code entry in the database (email mapped to phone column for OTP unification)
    await prisma.otpCode.create({
      data: {
        phone: normalizedEmail,
        codeHash,
        purpose: 'admin_2fa',
        expiresAt
      }
    });

    // Send the OTP via email. sendMail() (underneath sendOtpEmail) never
    // rejects — it catches SMTP errors internally and always resolves with
    // { ok, fallback? }, logging server-side only. The old code discarded
    // this return value entirely, so an admin whose SMTP was misconfigured
    // (or simply not set in .env) would sail through to "check your email"
    // with an OTP that was never actually sent and no way to tell why —
    // this is the "OTP not being sent to my email" report. Check it here so
    // it's at least loud in the logs, since the client-facing response
    // can't safely reveal SMTP configuration state without help an
    // attacker probing this endpoint doesn't need.
    const emailResult = await sendOtpEmail(normalizedEmail, code);
    const emailError = emailResult && (emailResult.error || emailResult.smtpError || null);
    let fallbackCode = null;

    if (!emailResult || !emailResult.ok || emailResult.fallback) {
      if (env.OTP_FALLBACK_ENABLED) {
        fallbackCode = code;
        logger.warn(
          { email: normalizedEmail, emailError, fallbackCode },
          'Admin 2FA OTP email delivery failed; returning fallback code because OTP_FALLBACK_ENABLED is on.'
        );
      } else {
        logger.error(
          { email: normalizedEmail, emailResult, emailError },
          'Admin 2FA OTP email was NOT delivered — SMTP is not configured or the send failed. The admin will be stuck on the OTP screen with no code to enter.'
        );
      }
    }

    if (env.OTP_DEBUG_LOG) {
      logger.warn({ email: normalizedEmail, code }, '[DEV] Admin 2FA Email verification OTP generated');
    }

    return {
      require2fa: true,
      email: normalizedEmail,
      emailDelivered: !!(emailResult && emailResult.ok && !emailResult.fallback),
      emailError: emailError || undefined,
      devCode: fallbackCode || (env.OTP_DEBUG_LOG ? code : undefined),
    };
  }
  
  const jwt = require('jsonwebtoken');
  // Use the same JWT lifetime as every other login flow (signToken uses
  // env.JWT_EXPIRES_IN) so session duration is consistent across all roles.
  const token = jwt.sign(
    { sub: user.id, role: user.role, phone: user.phone, email: user.email },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );
  
  // Store db session
  const sessionId = crypto.randomUUID();
  await prisma.session.create({
    data: {
      userId: user.id,
      token: sessionId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }
  });
  
  return {
    token,
    userData: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      name: user.name,
      imageUrl: user.imageUrl,
      verified: !!user.verifiedAt,
      mustChangePassword: !!user.mustChangePassword,
      vendor: (user.vendor && user.vendor.length > 0) ? { id: user.vendor[0].id, businessName: user.vendor[0].businessName } : null,
      couple: user.couple ? { id: user.couple.id } : null
    }
  };
}

/**
 * Forgot Password (Secure Cryptographic Token System)
 */
async function forgotPasswordSecure({ email }) {
  if (!email) throw new HttpError(400, 'Email is required', 'ERR_BAD_INPUT');
  const normalizedEmail = String(email).trim().toLowerCase();
  
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail }
  });
  
  if (!user) {
    return { ok: true, message: 'If registered, reset link is dispatched.' };
  }
  
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiry
  
  // Save token inside password_reset_tokens
  await prisma.passwordResetToken.create({
    data: {
      email: normalizedEmail,
      token,
      expiresAt
    }
  });
  
  // Send reset token email
  const { sendPasswordResetTokenEmail } = require('./email.service');
  await sendPasswordResetTokenEmail(normalizedEmail, token, user.role);
  
  return {
    ok: true,
    message: 'If registered, reset link is dispatched.',
    devToken: env.OTP_DEBUG_LOG ? token : undefined
  };
}

/**
 * Reset Password (Strict Single-Use Password Reset Security)
 */
async function resetPasswordSecure({ token, newPassword }) {
  if (!token || !newPassword) {
    throw new HttpError(400, 'Token and new password are required', 'ERR_BAD_INPUT');
  }
  assertStrongPassword(newPassword);
  
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token }
  });
  
  if (!resetToken || resetToken.used === 1 || resetToken.expiresAt < new Date()) {
    throw new HttpError(400, 'Password reset token is invalid, used, or expired', 'ERR_RESET_EXPIRED');
  }
  
  const user = await prisma.user.findUnique({
    where: { email: resetToken.email }
  });
  
  if (!user) throw new HttpError(404, 'User profile not found', 'ERR_NO_USER');
  
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(newPassword, salt);
  
  await prisma.$transaction([
    // Mark token used = 1
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { used: 1 }
    }),
    // Update user password and set revokedBefore to NOW()
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        revokedBefore: new Date(),
        verifiedAt: user.verifiedAt || new Date()
      }
    }),
    // Instantly revoke all active sessions
    prisma.session.deleteMany({
      where: { userId: user.id }
    })
  ]);
  
  return {
    ok: true,
    message: 'Password reset successful! You can now log in.'
  };
}

/**
 * Authenticated self-service password change - used both for a normal
 * "change my password" action and for the forced first-login flow when an
 * admin has issued login credentials directly (mustChangePassword=true).
 * Requires the current password, unlike the token-based reset flow above.
 */
async function changeOwnPassword({ userId, currentPassword, newPassword }) {
  if (!userId || !currentPassword || !newPassword) {
    throw new HttpError(400, 'Current password and new password are required', 'ERR_BAD_INPUT');
  }
  assertStrongPassword(newPassword);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.passwordHash) {
    throw new HttpError(401, 'Invalid current password', 'ERR_INVALID_CREDENTIALS');
  }

  const isMatch = await bcrypt.compare(String(currentPassword), user.passwordHash);
  if (!isMatch) {
    throw new HttpError(401, 'Invalid current password', 'ERR_INVALID_CREDENTIALS');
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(newPassword, salt);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: false },
  });

  return { ok: true, message: 'Password updated successfully.' };
}

module.exports = {
  startOtp,
  verifyOtp,
  signup,
  login,
  startEmailOtp,
  verifyEmailOtp,
  verifyAdmin2Fa,

  // Unified Secure Authentication System additions
  checkUser,
  registerAndSendOtp,
  verifyOtpLogin,
  loginWithPassword,
  forgotPasswordSecure,
  resetPasswordSecure,
  changeOwnPassword,
  assertStrongPassword,
};
