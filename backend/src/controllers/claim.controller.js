/**
 * Claim Business Flow
 * ===================
 * Lets a real vendor prove they own a scraped/seeded listing and take control.
 *
 * Flow:
 *   1. search()        — vendor types business name + phone, we return matching listings
 *   2. sendOtp()       — vendor picks a listing, we email a 6-digit OTP to the listing's phone owner
 *                        (Since we can't send SMS/WhatsApp reliably in dev, we send email to
 *                        the listing's email OR prompt for their email.)
 *   3. verify()        — vendor submits OTP + password + email → creates User + links Vendor
 *   4. requestManual() — vendor can't access phone/email → files a manual review ticket
 *
 * Security:
 *   - Rate limit: max 5 OTP sends per vendor per hour, 10 per IP per hour
 *   - OTP expires in 10 minutes, bcrypt-hashed at rest
 *   - Attempts locked at 5 wrong guesses per OTP
 *   - Vendor is 'claimed' by first successful verification; second claimant gets "already claimed"
 *   - Every attempt (success or fail) logged to ClaimAttempt for audit + rate limiting
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const env = require('../config/env');
const logger = require('../config/logger');
const { HttpError } = require('../middleware/error');
const { generateOtp, hashOtp, compareOtp } = require('../utils/otp');
const { sendMail } = require('../services/email.service');

const OTP_TTL_MS = 10 * 60 * 1000;               // 10 minutes
const MAX_OTP_PER_VENDOR_PER_HOUR = 5;
const MAX_OTP_PER_IP_PER_HOUR = 10;
const MAX_OTP_ATTEMPTS = 5;

/* ============================================================
   HELPERS
   ============================================================ */

/** Mask a phone number for display: 919876543210 → 91987*****210 */
function maskPhone(phone) {
  if (!phone) return '';
  const s = String(phone);
  if (s.length <= 6) return s;
  const head = s.slice(0, 5);
  const tail = s.slice(-3);
  return `${head}${'*'.repeat(Math.max(3, s.length - 8))}${tail}`;
}

/** Mask an email: john.doe@example.com → j*******e@example.com */
function maskEmail(email) {
  if (!email || !email.includes('@')) return '';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local[0]}${'*'.repeat(Math.max(3, local.length - 2))}${local[local.length - 1]}@${domain}`;
}

/** Normalize a phone to digits only for comparison purposes. */
function digitsOnly(s) {
  return String(s || '').replace(/[^0-9]/g, '');
}

/** Get last 10 digits of a phone for loose matching. */
function last10(s) {
  const d = digitsOnly(s);
  return d.slice(-10);
}

/** Record an attempt for audit and rate limiting. Best-effort — never throws. */
async function recordAttempt(vendorId, phone, ip, ok, reason) {
  try {
    await prisma.claimAttempt.create({
      data: {
        vendorId: vendorId || 'unknown',
        phone: phone || '',
        ip: (ip || '').slice(0, 60),
        ok,
        reason: (reason || '').slice(0, 180),
      },
    });
  } catch (err) {
    logger.warn({ err, vendorId, ip }, 'Failed to record ClaimAttempt (non-fatal)');
  }
}

/** Check whether the vendor or the IP has been hammered in the last hour. */
async function checkRateLimit(vendorId, ip) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [byVendor, byIp] = await Promise.all([
    prisma.claimAttempt.count({
      where: { vendorId, createdAt: { gte: oneHourAgo }, reason: 'sent' },
    }),
    ip ? prisma.claimAttempt.count({
      where: { ip, createdAt: { gte: oneHourAgo }, reason: 'sent' },
    }) : Promise.resolve(0),
  ]);

  if (byVendor >= MAX_OTP_PER_VENDOR_PER_HOUR) {
    return { limited: true, reason: 'Too many OTP requests for this business. Try again in an hour or use manual verification.' };
  }
  if (byIp >= MAX_OTP_PER_IP_PER_HOUR) {
    return { limited: true, reason: 'Too many OTP requests from your network. Try again in an hour.' };
  }
  return { limited: false };
}

/* ============================================================
   1. SEARCH — find claimable listings
   ============================================================ */
async function search(req, res, next) {
  try {
    const { businessName, phone } = req.body || {};

    if (!businessName || String(businessName).trim().length < 2) {
      throw new HttpError(400, 'Enter your business name (at least 2 characters).', 'ERR_INPUT');
    }

    const term = String(businessName).trim().toLowerCase();
    const phoneDigits = phone ? last10(phone) : null;

    // Search: name contains the term (Prisma MySQL is case-insensitive by
    // default on utf8mb4_unicode_ci collation, so this catches "royal palace"
    // when the DB has "Royal Palace Banquet").
    const results = await prisma.vendor.findMany({
      where: {
        isActive: true,
        businessName: { contains: term },
      },
      select: {
        id: true,
        businessName: true,
        category: true,
        city: true,
        country: true,
        area: true,
        address: true,
        whatsappNumber: true,
        rating: true,
        userId: true,
      },
      take: 20,
      orderBy: { businessName: 'asc' },
    });

    // If a phone was provided, boost matches whose stored phone shares the last 10 digits
    let matches = results.map(v => {
      const shareDigits = phoneDigits && v.whatsappNumber &&
                          last10(v.whatsappNumber) === phoneDigits;
      return {
        id: v.id,
        businessName: v.businessName,
        category: v.category,
        city: v.city,
        country: v.country,
        area: v.area,
        address: v.address,
        rating: v.rating,
        phoneMasked: maskPhone(v.whatsappNumber),
        // Never send the raw phone/email to the client — they'd bypass OTP by
        // reading them out of the network response.
        hasContact: Boolean(v.whatsappNumber),
        alreadyClaimed: Boolean(v.userId),
        phoneMatch: shareDigits,
      };
    });

    // Phone-matching listings first, then everything else
    matches.sort((a, b) => (b.phoneMatch ? 1 : 0) - (a.phoneMatch ? 1 : 0));

    res.json({ ok: true, matches, total: matches.length });
  } catch (e) { next(e); }
}

/* ============================================================
   2. SEND OTP
   ============================================================ */
async function sendOtp(req, res, next) {
  try {
    const { vendorId, email: providedEmail } = req.body || {};
    const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();

    if (!vendorId) throw new HttpError(400, 'Please pick a listing to claim.', 'ERR_INPUT');

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      include: { user: { select: { id: true, email: true } } },
    });
    if (!vendor) throw new HttpError(404, 'That listing was not found.', 'ERR_NOT_FOUND');
    if (!vendor.isActive) throw new HttpError(400, 'That listing is not currently active.', 'ERR_INACTIVE');

    if (vendor.userId) {
      // Already claimed. Don't burn an OTP.
      await recordAttempt(vendorId, providedEmail || '', ip, false, 'already_claimed');
      throw new HttpError(409, 'This business has already been claimed. If this was you, log in. Otherwise, submit a manual verification request.', 'ERR_ALREADY_CLAIMED');
    }

    // Rate limit
    const rl = await checkRateLimit(vendorId, ip);
    if (rl.limited) {
      await recordAttempt(vendorId, providedEmail || '', ip, false, 'rate_limited');
      throw new HttpError(429, rl.reason, 'ERR_RATE_LIMITED');
    }

    // Pick the destination email. Precedence:
    //   1. Existing linked user's email (if any — shouldn't happen since userId is null, but safe)
    //   2. Vendor's own email column (if set — not in schema currently)
    //   3. What the claimant provided (this is the common path for scraped listings)
    const targetEmail = (vendor.user && vendor.user.email) || providedEmail;
    if (!targetEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(targetEmail).trim())) {
      throw new HttpError(400, 'Please provide the email address associated with this business.', 'ERR_EMAIL_REQUIRED');
    }
    const normalizedEmail = String(targetEmail).trim().toLowerCase();

    // Invalidate any previous unconsumed OTPs for this vendor+email
    await prisma.otpCode.updateMany({
      where: {
        phone: `claim:${vendorId}:${normalizedEmail}`,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });

    const code = generateOtp();
    const codeHash = await hashOtp(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await prisma.otpCode.create({
      data: {
        // Reuse OtpCode by namespacing the "phone" field. Not pretty but
        // avoids a schema migration for a small feature. The namespace also
        // means these OTPs can never collide with login OTPs.
        phone: `claim:${vendorId}:${normalizedEmail}`,
        codeHash,
        purpose: 'business_claim',
        expiresAt,
      },
    });

    // Send email (fire-and-forget-with-logging pattern)
    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
        <div style="text-align:center;margin-bottom:20px;">
          <h1 style="color:#DC1F30;margin:0;font-size:24px;">WedEazzy</h1>
        </div>
        <h2 style="color:#111;font-size:18px;margin-bottom:12px;">Claim your business listing</h2>
        <p style="color:#444;line-height:1.5;">
          Someone (hopefully you) is trying to claim ownership of
          <strong>${(vendor.businessName || '').replace(/[<>&"]/g, '')}</strong> on WedEazzy.
        </p>
        <p style="color:#444;line-height:1.5;">
          Enter this 6-digit code on the claim page to prove ownership:
        </p>
        <div style="background:#FCE7EB;color:#DC1F30;font-size:32px;font-weight:800;letter-spacing:6px;text-align:center;padding:16px;border-radius:12px;margin:16px 0;">
          ${code}
        </div>
        <p style="color:#666;font-size:13px;line-height:1.5;">
          This code expires in 10 minutes. If you didn't request this, you can ignore this email
          — no changes will be made to the listing.
        </p>
      </div>`;
    const text = `Your WedEazzy business claim code is ${code}. It expires in 10 minutes. If you didn't request this, ignore this email.`;

    try {
      const emailResult = await sendMail({
        to: normalizedEmail,
        subject: 'Your business claim code - WedEazzy',
        html,
        text,
      });
      if (!emailResult || !emailResult.ok || emailResult.fallback) {
        logger.error({ vendorId, email: normalizedEmail, emailResult },
          'Claim OTP email fell back to console — SMTP not configured');
      }
    } catch (err) {
      logger.error({ err, vendorId, email: normalizedEmail }, 'Claim OTP email send threw');
    }

    if (env.OTP_DEBUG_LOG) {
      logger.warn({ vendorId, email: normalizedEmail, code }, '[DEV] Business claim OTP');
    }

    await recordAttempt(vendorId, normalizedEmail, ip, true, 'sent');

    res.json({
      ok: true,
      emailMasked: maskEmail(normalizedEmail),
      expiresInMinutes: Math.round(OTP_TTL_MS / 60000),
    });
  } catch (e) { next(e); }
}

/* ============================================================
   3. VERIFY OTP + CREATE ACCOUNT
   ============================================================ */
async function verify(req, res, next) {
  try {
    const { vendorId, email, code, name, password } = req.body || {};
    const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();

    if (!vendorId || !email || !code) {
      throw new HttpError(400, 'Missing required fields.', 'ERR_INPUT');
    }
    if (!/^\d{4,8}$/.test(String(code))) {
      throw new HttpError(400, 'Enter the 6-digit code exactly as it appears in your email.', 'ERR_INPUT');
    }
    if (!name || String(name).trim().length < 2) {
      throw new HttpError(400, 'Enter your full name.', 'ERR_INPUT');
    }
    if (!password || String(password).length < 8) {
      throw new HttpError(400, 'Choose a password of at least 8 characters.', 'ERR_INPUT');
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
      throw new HttpError(400, 'Enter a valid email address.', 'ERR_INPUT');
    }

    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new HttpError(404, 'That listing was not found.', 'ERR_NOT_FOUND');
    if (vendor.userId) {
      await recordAttempt(vendorId, normalizedEmail, ip, false, 'already_claimed_at_verify');
      throw new HttpError(409, 'This business has already been claimed since you started this flow.', 'ERR_ALREADY_CLAIMED');
    }

    // Find the most recent unconsumed OTP for this vendor+email
    const otp = await prisma.otpCode.findFirst({
      where: {
        phone: `claim:${vendorId}:${normalizedEmail}`,
        consumedAt: null,
        purpose: 'business_claim',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      await recordAttempt(vendorId, normalizedEmail, ip, false, 'no_otp');
      throw new HttpError(400, 'No active code found. Request a new one.', 'ERR_NO_OTP');
    }
    if (otp.expiresAt < new Date()) {
      await recordAttempt(vendorId, normalizedEmail, ip, false, 'expired');
      throw new HttpError(400, 'That code has expired. Request a new one.', 'ERR_EXPIRED');
    }
    if (otp.attempts >= MAX_OTP_ATTEMPTS) {
      await recordAttempt(vendorId, normalizedEmail, ip, false, 'locked');
      throw new HttpError(400, 'Too many wrong attempts. Request a new code.', 'ERR_LOCKED');
    }

    const ok = await compareOtp(String(code), otp.codeHash);
    if (!ok) {
      await prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      await recordAttempt(vendorId, normalizedEmail, ip, false, 'wrong_otp');
      throw new HttpError(400, 'Wrong code. Please try again.', 'ERR_OTP_WRONG');
    }

    // OTP is correct — consume it
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });

    // Create or link user
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    const passwordHash = await bcrypt.hash(String(password), 10);

    let userId;
    if (existingUser) {
      // Email already in use — could be from a previous claim or the site itself.
      // If it's a couple/admin account we refuse; if it's an unlinked vendor account
      // we link this listing to it.
      if (existingUser.role !== 'VENDOR') {
        await recordAttempt(vendorId, normalizedEmail, ip, false, 'email_conflict');
        throw new HttpError(409,
          'This email is already used for another type of WedEazzy account. Sign up with a different email.',
          'ERR_EMAIL_CONFLICT');
      }
      userId = existingUser.id;
      // Update password + verified in one shot so returning claimants can log in
      await prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          verifiedAt: new Date(),
          name: String(name).trim(),
        },
      });
    } else {
      const created = await prisma.user.create({
        data: {
          email: normalizedEmail,
          name: String(name).trim(),
          role: 'VENDOR',
          passwordHash,
          verifiedAt: new Date(),
          authProvider: 'local',
        },
      });
      userId = created.id;
    }

    // Link the vendor listing to the user — use a conditional update to guard
    // against a race where another claimant beat us here.
    const linkResult = await prisma.vendor.updateMany({
      where: { id: vendorId, userId: null },
      data: { userId, isVerified: true },
    });

    if (linkResult.count === 0) {
      // Someone else linked in the milliseconds since our earlier check
      await recordAttempt(vendorId, normalizedEmail, ip, false, 'race_lost');
      throw new HttpError(409, 'This business was just claimed by another user.', 'ERR_ALREADY_CLAIMED');
    }

    await recordAttempt(vendorId, normalizedEmail, ip, true, 'verified');

    // Issue a JWT so the freshly-claimed vendor is logged in immediately
    const token = jwt.sign(
      { sub: userId, role: 'VENDOR', email: normalizedEmail },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN || '30d' }
    );

    logger.info({ vendorId, userId, email: normalizedEmail },
      'Business successfully claimed');

    res.json({
      ok: true,
      token,
      user: { id: userId, email: normalizedEmail, name: String(name).trim(), role: 'VENDOR' },
      vendor: {
        id: vendor.id,
        businessName: vendor.businessName,
        category: vendor.category,
        city: vendor.city,
      },
    });
  } catch (e) { next(e); }
}

/* ============================================================
   4. MANUAL REVIEW REQUEST
   ============================================================ */
async function requestManual(req, res, next) {
  try {
    const { vendorId, claimantName, claimantEmail, claimantPhone, proofUrl, proofNotes } = req.body || {};

    if (!vendorId) throw new HttpError(400, 'Missing vendor id.', 'ERR_INPUT');
    if (!claimantName || String(claimantName).trim().length < 2) {
      throw new HttpError(400, 'Enter your name.', 'ERR_INPUT');
    }
    if (!claimantEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(claimantEmail).trim())) {
      throw new HttpError(400, 'Enter a valid email.', 'ERR_INPUT');
    }
    if (!proofUrl && !proofNotes) {
      throw new HttpError(400,
        'Give us something to verify — a link to your business website, Google Maps listing, Instagram, or a note explaining your ownership.',
        'ERR_INPUT');
    }

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true, businessName: true, userId: true },
    });
    if (!vendor) throw new HttpError(404, 'That listing was not found.', 'ERR_NOT_FOUND');
    if (vendor.userId) {
      throw new HttpError(409, 'This business has already been claimed.', 'ERR_ALREADY_CLAIMED');
    }

    const request = await prisma.claimRequest.create({
      data: {
        vendorId,
        claimantName: String(claimantName).trim().slice(0, 180),
        claimantEmail: String(claimantEmail).trim().toLowerCase().slice(0, 180),
        claimantPhone: claimantPhone ? String(claimantPhone).slice(0, 32) : null,
        proofUrl: proofUrl ? String(proofUrl).slice(0, 500) : null,
        proofNotes: proofNotes ? String(proofNotes).slice(0, 2000) : null,
      },
    });

    // Notify admin (fire-and-forget)
    const adminEmail = env.ADMIN_EMAIL || 'admin@wedeazzy.local';
    sendMail({
      to: adminEmail,
      subject: `Manual claim request: ${vendor.businessName}`,
      html: `<p>A vendor has requested manual verification for a business listing.</p>
             <ul>
               <li><strong>Business:</strong> ${(vendor.businessName || '').replace(/[<>&"]/g, '')}</li>
               <li><strong>Claimant:</strong> ${(claimantName || '').replace(/[<>&"]/g, '')} (${claimantEmail})</li>
               <li><strong>Phone:</strong> ${claimantPhone || '—'}</li>
               <li><strong>Proof link:</strong> ${proofUrl ? `<a href="${proofUrl}">${proofUrl}</a>` : '—'}</li>
               <li><strong>Notes:</strong> ${(proofNotes || '').replace(/[<>&"]/g, '') || '—'}</li>
             </ul>
             <p>Review in the admin panel.</p>`,
      text: `Manual claim request for "${vendor.businessName}" by ${claimantName} (${claimantEmail}). Proof: ${proofUrl || 'none'}`,
    }).catch(err => logger.error({ err }, 'Failed to send admin notification for manual claim'));

    // Confirmation email to the claimant
    sendMail({
      to: claimantEmail,
      subject: 'We received your business claim request - WedEazzy',
      html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;">
              <h2 style="color:#DC1F30;">Thanks — we've got your request</h2>
              <p>Hi ${(claimantName || 'there').replace(/[<>&"]/g, '')},</p>
              <p>Your claim for <strong>${(vendor.businessName || '').replace(/[<>&"]/g, '')}</strong> is in our review queue.
              A member of our team will get back to you within 2 business days.</p>
              <p>Request ID: <code>${request.id.slice(-8)}</code></p>
             </div>`,
      text: `Your claim request for "${vendor.businessName}" has been received (ID: ${request.id.slice(-8)}). We'll respond within 2 business days.`,
    }).catch(err => logger.error({ err }, 'Failed to send claim confirmation email'));

    logger.info({ vendorId, requestId: request.id, claimantEmail }, 'Manual claim request filed');

    res.json({ ok: true, requestId: request.id.slice(-8) });
  } catch (e) { next(e); }
}

module.exports = {
  search,
  sendOtp,
  verify,
  requestManual,
  // exported for tests
  _maskPhone: maskPhone,
  _maskEmail: maskEmail,
  _last10: last10,
};