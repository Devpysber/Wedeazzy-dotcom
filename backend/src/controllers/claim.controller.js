/**
 * Claim Business Flow & Vendor Acquisition
 * ========================================
 * Self-service vendor acquisition and listing claim experience.
 *
 * Simplified NO-OTP Architecture:
 *   1. search()           — Vendor searches listings by name/city/phone. Returns masked phone (+91 98•••••123).
 *   2. startSession()     — Creates a 15-min claim session (claimSessionId) for chosen unclaimed vendor.
 *   3. verifyPhone()      — Claimant enters full registered phone. Backend normalizes & checks exact match.
 *   4. completeClaim()    — Claimant enters email. Backend creates User, links Vendor atomically in prisma.$transaction,
 *                           sets mustChangePassword = true, generates & hashes random temp password, dispatches
 *                           sendVendorCredentialsEmail. Plaintext password is NEVER returned in JSON response.
 *   5. registerBusiness() — Path B registration for new listings. Performs duplicate check against existing DB listings
 *                           (by phone or businessName + city). If unique, creates Vendor + User and sends credentials email.
 *   6. requestManual()    — Submits manual proof review ticket (ClaimRequest) when phone is inaccessible.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const env = require('../config/env');
const logger = require('../config/logger');
const { HttpError } = require('../middleware/error');
const { generateOtp, hashOtp, compareOtp } = require('../utils/otp');
const { sendMail, sendVendorCredentialsEmail } = require('../services/email.service');

const OTP_TTL_MS = 15 * 60 * 1000;               // 15 minutes
const MAX_OTP_PER_VENDOR_PER_HOUR = 10;
const MAX_OTP_PER_IP_PER_HOUR = 20;
const MAX_OTP_ATTEMPTS = 5;

/* ============================================================
   CLAIM SESSION IN-MEMORY STORE (15-min TTL)
   ============================================================ */
const claimSessions = new Map();

// Periodic sweep to clean up expired sessions
setInterval(() => {
  const now = Date.now();
  for (const [id, sess] of claimSessions.entries()) {
    if (sess.expiresAt < now) {
      claimSessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

/* ============================================================
   HELPERS
   ============================================================ */

/** Mask a phone number for display: 919876543210 → +91 98•••••210 */
function maskPhone(phone) {
  if (!phone) return '';
  const s = String(phone).replace(/[^0-9]/g, '');
  if (s.length <= 6) return s;
  const head = s.slice(0, 4);
  const tail = s.slice(-3);
  return `+${head} ${'•'.repeat(Math.max(3, s.length - 7))}${tail}`;
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

/** Generate a secure random 10-character strong temporary password (Uppercase, Lowercase, Number, Special char). */
function generateTempPassword() {
  const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowers = 'abcdefghijkmnpqrstuvwxyz';
  const nums = '23456789';
  const specials = '!@#$%';
  const all = uppers + lowers + nums + specials;

  let pwd = [
    uppers[crypto.randomInt(uppers.length)],
    lowers[crypto.randomInt(lowers.length)],
    nums[crypto.randomInt(nums.length)],
    specials[crypto.randomInt(specials.length)]
  ];

  for (let i = 0; i < 6; i++) {
    pwd.push(all[crypto.randomInt(all.length)]);
  }

  for (let i = pwd.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
  }

  return pwd.join('');
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
      where: { vendorId, createdAt: { gte: oneHourAgo }, reason: 'phone_mismatch' },
    }),
    ip ? prisma.claimAttempt.count({
      where: { ip, createdAt: { gte: oneHourAgo }, reason: 'phone_mismatch' },
    }) : Promise.resolve(0),
  ]);

  if (byVendor >= MAX_OTP_PER_VENDOR_PER_HOUR) {
    return { limited: true, reason: 'Too many failed attempts for this business. Please try again in an hour or request manual verification.' };
  }
  if (byIp >= MAX_OTP_PER_IP_PER_HOUR) {
    return { limited: true, reason: 'Too many attempts from your network. Please try again in an hour.' };
  }
  return { limited: false };
}

/* ============================================================
   1. SEARCH — find claimable listings
   ============================================================ */
async function search(req, res, next) {
  try {
    const { businessName, city, phone } = req.body || {};

    const term = String(businessName || '').trim().toLowerCase();
    const cityTerm = String(city || '').trim().toLowerCase();
    const phoneDigits = phone ? last10(phone) : null;

    if (!term && !phoneDigits && !cityTerm) {
      throw new HttpError(400, 'Enter a business name, city, or phone number to search.', 'ERR_INPUT');
    }

    const whereClause = { isActive: true };
    if (term) whereClause.businessName = { contains: term };
    if (cityTerm) whereClause.city = { contains: cityTerm };

    const results = await prisma.vendor.findMany({
      where: whereClause,
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
        user: { select: { mustChangePassword: true } }
      },
      take: 30,
      orderBy: { businessName: 'asc' },
    });

    let matches = results.map(v => {
      const shareDigits = phoneDigits && v.whatsappNumber &&
                          last10(v.whatsappNumber) === phoneDigits;
      const isClaimedAndSet = Boolean(v.userId && (!v.user || v.user.mustChangePassword === false));
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
        hasContact: Boolean(v.whatsappNumber),
        alreadyClaimed: isClaimedAndSet,
        phoneMatch: shareDigits,
      };
    });

    matches.sort((a, b) => (b.phoneMatch ? 1 : 0) - (a.phoneMatch ? 1 : 0));

    res.json({ ok: true, matches, total: matches.length });
  } catch (e) { next(e); }
}

/* ============================================================
   2. START CLAIM SESSION
   ============================================================ */
async function startSession(req, res, next) {
  try {
    const { vendorId } = req.body || {};
    const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();

    if (!vendorId) throw new HttpError(400, 'Please select a listing to claim.', 'ERR_INPUT');

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      include: { user: true },
    });

    if (!vendor) throw new HttpError(404, 'That business listing was not found.', 'ERR_NOT_FOUND');
    if (!vendor.isActive) throw new HttpError(400, 'That listing is not currently active.', 'ERR_INACTIVE');
    if (vendor.userId && (!vendor.user || !vendor.user.mustChangePassword)) {
      await recordAttempt(vendorId, '', ip, false, 'already_claimed');
      throw new HttpError(409, 'This business has already been claimed. If this is your business, please log in.', 'ERR_ALREADY_CLAIMED');
    }

    const sessionId = 'cs_' + crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + OTP_TTL_MS;

    claimSessions.set(sessionId, {
      vendorId: vendor.id,
      phoneVerified: false,
      createdAt: Date.now(),
      expiresAt,
    });

    res.json({
      ok: true,
      claimSessionId: sessionId,
      vendor: {
        id: vendor.id,
        businessName: vendor.businessName,
        category: vendor.category,
        city: vendor.city,
        area: vendor.area,
        phoneMasked: maskPhone(vendor.whatsappNumber),
      },
    });
  } catch (e) { next(e); }
}

/* ============================================================
   3. VERIFY PHONE NUMBER (Server-Side Exact Phone Match)
   ============================================================ */
async function verifyPhone(req, res, next) {
  try {
    const { claimSessionId, phone } = req.body || {};
    const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();

    if (!claimSessionId || !phone) {
      throw new HttpError(400, 'Claim session and registered phone number are required.', 'ERR_INPUT');
    }

    const session = claimSessions.get(claimSessionId);
    if (!session || session.expiresAt < Date.now()) {
      throw new HttpError(400, 'Your claim session has expired. Please search and select your business again.', 'ERR_SESSION_EXPIRED');
    }

    const vendor = await prisma.vendor.findUnique({
      where: { id: session.vendorId },
      include: { user: true },
    });

    if (!vendor) throw new HttpError(404, 'Listing not found.', 'ERR_NOT_FOUND');
    if (vendor.userId && (!vendor.user || !vendor.user.mustChangePassword)) {
      claimSessions.delete(claimSessionId);
      throw new HttpError(409, 'This business has already been claimed.', 'ERR_ALREADY_CLAIMED');
    }

    // Check rate limit
    const rl = await checkRateLimit(vendor.id, ip);
    if (rl.limited) {
      await recordAttempt(vendor.id, phone, ip, false, 'rate_limited');
      throw new HttpError(429, rl.reason, 'ERR_RATE_LIMITED');
    }

    const storedDigits = last10(vendor.whatsappNumber);
    const submittedDigits = last10(phone);

    if (!storedDigits || !submittedDigits || storedDigits !== submittedDigits) {
      await recordAttempt(vendor.id, phone, ip, false, 'phone_mismatch');
      throw new HttpError(400, 'The phone number you entered does not match the registered contact number for this business listing. Please check the number and try again.', 'ERR_PHONE_MISMATCH');
    }

    // Phone verified successfully! Update session state.
    session.phoneVerified = true;
    session.verifiedPhone = digitsOnly(phone);
    claimSessions.set(claimSessionId, session);

    await recordAttempt(vendor.id, phone, ip, true, 'phone_matched');

    res.json({
      ok: true,
      message: 'Phone number verified successfully! Please provide your email address to receive your vendor login details.',
    });
  } catch (e) { next(e); }
}

/* ============================================================
   4. COMPLETE CLAIM — Attach Account & Send Email Credentials
   ============================================================ */
async function complete(req, res, next) {
  try {
    const { claimSessionId, email, name } = req.body || {};
    const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();

    if (!claimSessionId || !email) {
      throw new HttpError(400, 'Claim session ID and business email are required.', 'ERR_INPUT');
    }

    const session = claimSessions.get(claimSessionId);
    if (!session || session.expiresAt < Date.now()) {
      throw new HttpError(400, 'Your claim session has expired. Please start again.', 'ERR_SESSION_EXPIRED');
    }

    if (!session.phoneVerified) {
      throw new HttpError(400, 'You must verify your registered phone number before completing your claim.', 'ERR_PHONE_NOT_VERIFIED');
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
      throw new HttpError(400, 'Please enter a valid business email address.', 'ERR_INPUT');
    }

    const vendor = await prisma.vendor.findUnique({ where: { id: session.vendorId } });
    if (!vendor) throw new HttpError(404, 'Vendor listing not found.', 'ERR_NOT_FOUND');
    if (vendor.userId) {
      claimSessions.delete(claimSessionId);
      throw new HttpError(409, 'This business has already been claimed.', 'ERR_ALREADY_CLAIMED');
    }

    // Check existing User with this email
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { vendor: true },
    });
    if (existingUser) {
      if (existingUser.role === 'admin') {
        await recordAttempt(vendor.id, normalizedEmail, ip, false, 'admin_email_conflict');
        throw new HttpError(409, 'This email belongs to an administrator account. Please use a business email.', 'ERR_EMAIL_CONFLICT');
      }
      if (existingUser.vendor && existingUser.vendor.length > 0) {
        const otherVendor = existingUser.vendor.find(v => v.id !== vendor.id && v.isActive);
        if (otherVendor) {
          await recordAttempt(vendor.id, normalizedEmail, ip, false, 'active_vendor_email_conflict');
          throw new HttpError(409, 'This email is already associated with another active vendor listing. Log in with your vendor account or use a different email.', 'ERR_EMAIL_CONFLICT');
        }
      }
    }

    // Generate random 10-char temporary password & hash it
    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const ownerName = String(name || vendor.businessName).trim();

    let userId;

    // Atomic DB Transaction: Create/Link User & Attach Vendor
    await prisma.$transaction(async (tx) => {
      if (existingUser) {
        userId = existingUser.id;
        await tx.user.update({
          where: { id: userId },
          data: {
            role: 'vendor',
            passwordHash,
            mustChangePassword: true,
            verifiedAt: existingUser.verifiedAt || new Date(),
            name: ownerName,
          },
        });
      } else {
        const created = await tx.user.create({
          data: {
            email: normalizedEmail,
            name: ownerName,
            role: 'vendor',
            passwordHash,
            mustChangePassword: true,
            verifiedAt: new Date(),
            authProvider: 'local',
          },
        });
        userId = created.id;
      }

      const submittedCountryCode = String(req.body.countryCode || req.body.country || '').trim().toUpperCase();
      const COUNTRY_NAMES = { IN: 'India', US: 'USA', GB: 'UK', AE: 'UAE', CA: 'Canada', AU: 'Australia' };
      const vendorData = { userId, isVerified: true };
      if (submittedCountryCode && COUNTRY_NAMES[submittedCountryCode]) {
        vendorData.countryCode = submittedCountryCode;
        vendorData.country = COUNTRY_NAMES[submittedCountryCode];
      }

      // Atomic update on vendor listing: update if unclaimed (userId === null) OR if already linked to this same user
      const linkResult = await tx.vendor.updateMany({
        where: {
          id: vendor.id,
          OR: [
            { userId: null },
            { userId: userId }
          ]
        },
        data: vendorData,
      });

      if (linkResult.count === 0) {
        throw new HttpError(409, 'This business was claimed by another user.', 'ERR_ALREADY_CLAIMED');
      }
    });

    // Invalidate claim session after successful completion
    claimSessions.delete(claimSessionId);

    // Record audit success
    await recordAttempt(vendor.id, normalizedEmail, ip, true, 'claimed_successfully');

    // Send Temporary Credentials Email (Plaintext password is NEVER returned in JSON)
    try {
      await sendVendorCredentialsEmail(normalizedEmail, vendor.businessName, tempPassword, normalizedEmail);
    } catch (err) {
      logger.error({ err, vendorId: vendor.id, email: normalizedEmail }, 'Failed to send vendor credentials email');
    }

    logger.info({ vendorId: vendor.id, userId, email: normalizedEmail }, 'Business successfully claimed via simplified phone match');

    res.json({
      ok: true,
      emailMasked: maskEmail(normalizedEmail),
      vendor: {
        id: vendor.id,
        businessName: vendor.businessName,
        category: vendor.category,
        city: vendor.city,
      },
      message: 'Business successfully claimed! We have sent your temporary login credentials to your email.',
    });
  } catch (e) { next(e); }
}

/* ============================================================
   5. REGISTER NEW BUSINESS (Path B — Check Duplicates & Register)
   ============================================================ */
async function registerBusiness(req, res, next) {
  try {
    const {
      businessName, category, city, area, address, pincode,
      phone, email, name, website, instagram, description
    } = req.body || {};
    const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();

    if (!businessName || String(businessName).trim().length < 2) {
      throw new HttpError(400, 'Enter your business name.', 'ERR_INPUT');
    }
    if (!category) throw new HttpError(400, 'Select a business category.', 'ERR_INPUT');
    if (!city) throw new HttpError(400, 'Select or enter your city.', 'ERR_INPUT');
    if (!phone || String(phone).trim().length < 8) {
      throw new HttpError(400, 'Enter a valid phone number.', 'ERR_INPUT');
    }
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email).trim())) {
      throw new HttpError(400, 'Enter a valid business email address.', 'ERR_INPUT');
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const phoneDigits = last10(phone);
    const term = String(businessName).trim().toLowerCase();
    const cityTerm = String(city).trim().toLowerCase();

    // 1. Duplicate Detection Check against DB
    const existingMatches = await prisma.vendor.findMany({
      where: {
        isActive: true,
        OR: [
          { whatsappNumber: { contains: phoneDigits } },
          { AND: [{ businessName: { contains: term } }, { city: { contains: cityTerm } }] }
        ]
      },
      select: {
        id: true,
        businessName: true,
        category: true,
        city: true,
        area: true,
        whatsappNumber: true,
        userId: true,
      },
      take: 5
    });

    if (existingMatches.length > 0) {
      const match = existingMatches[0];
      return res.json({
        ok: false,
        isDuplicate: true,
        message: 'We found a business that may already be listed on WedEazzy.',
        existingVendor: {
          id: match.id,
          businessName: match.businessName,
          category: match.category,
          city: match.city,
          area: match.area,
          phoneMasked: maskPhone(match.whatsappNumber),
          alreadyClaimed: Boolean(match.userId)
        }
      });
    }

    // 2. No duplicate found — create User + Vendor in atomic transaction
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { vendor: true },
    });
    if (existingUser) {
      if (existingUser.role === 'admin') {
        throw new HttpError(409, 'This email belongs to an administrator account. Please use a business email.', 'ERR_EMAIL_CONFLICT');
      }
      if (existingUser.vendor && existingUser.vendor.length > 0) {
        const activeVendor = existingUser.vendor.find(v => v.isActive);
        if (activeVendor) {
          throw new HttpError(409, 'This email is already associated with an active vendor listing on WedEazzy.', 'ERR_EMAIL_CONFLICT');
        }
      }
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const ownerName = String(name || businessName).trim();

    let createdVendor;

    await prisma.$transaction(async (tx) => {
      let userId;
      if (existingUser) {
        userId = existingUser.id;
        await tx.user.update({
          where: { id: userId },
          data: {
            role: 'vendor',
            passwordHash,
            mustChangePassword: true,
            name: ownerName,
          }
        });
      } else {
        const created = await tx.user.create({
          data: {
            email: normalizedEmail,
            name: ownerName,
            role: 'vendor',
            passwordHash,
            mustChangePassword: true,
            verifiedAt: new Date(),
            authProvider: 'local',
          }
        });
        userId = created.id;
      }

      const slugBase = String(businessName).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const slug = `${slugBase}-${Date.now().toString(36)}`;
      const categorySlug = String(category).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const citySlug = String(city).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      const submittedCountryCode = String(req.body.countryCode || req.body.country || 'IN').trim().toUpperCase();
      const COUNTRY_NAMES = { IN: 'India', US: 'USA', GB: 'UK', AE: 'UAE', CA: 'Canada', AU: 'Australia' };
      const countryCode = COUNTRY_NAMES[submittedCountryCode] ? submittedCountryCode : 'IN';
      const country = COUNTRY_NAMES[countryCode] || 'India';

      createdVendor = await tx.vendor.create({
        data: {
          businessName: String(businessName).trim(),
          slug,
          category: String(category).trim(),
          categorySlug,
          city: String(city).trim(),
          citySlug,
          country,
          countryCode,
          area: area ? String(area).trim() : null,
          address: address ? String(address).trim() : null,
          pincode: pincode ? String(pincode).trim() : null,
          whatsappNumber: String(phone).trim(),
          userId,
          isVerified: true,
          isActive: true,
          tier: 'basic'
        }
      });
    });

    // Send credentials email
    try {
      await sendVendorCredentialsEmail(normalizedEmail, createdVendor.businessName, tempPassword, normalizedEmail);
    } catch (err) {
      logger.error({ err, email: normalizedEmail }, 'Failed to send new vendor credentials email');
    }

    res.json({
      ok: true,
      emailMasked: maskEmail(normalizedEmail),
      vendor: {
        id: createdVendor.id,
        businessName: createdVendor.businessName,
        category: createdVendor.category,
        city: createdVendor.city,
      },
      message: 'Business registered successfully! Your temporary login details have been emailed to you.'
    });
  } catch (e) { next(e); }
}

/* ============================================================
   6. MANUAL REVIEW REQUEST
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

    // Notify admin
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
             </ul>`,
      text: `Manual claim request for "${vendor.businessName}" by ${claimantName} (${claimantEmail}).`,
    }).catch(err => logger.error({ err }, 'Failed to send admin notification for manual claim'));

    // Acknowledge to the claimant — manual review takes days, and until now
    // the submit produced no confirmation of any kind on their side.
    const { sendClaimReceivedEmail } = require('../services/email.service');
    sendClaimReceivedEmail(request.claimantEmail, request.claimantName, vendor.businessName)
      .catch(err => logger.error({ err, to: request.claimantEmail }, 'Failed to send claim acknowledgement to claimant'));

    res.json({ ok: true, requestId: request.id.slice(-8) });
  } catch (e) { next(e); }
}

/* Backward-compatibility fallback stubs for legacy OTP endpoints */
async function sendOtp(req, res, next) {
  return res.status(400).json({ ok: false, error: 'OTP is deprecated. Please use phone number verification.', code: 'ERR_OTP_DEPRECATED' });
}

async function verify(req, res, next) {
  return res.status(400).json({ ok: false, error: 'OTP verification is deprecated. Please complete phone verification.', code: 'ERR_OTP_DEPRECATED' });
}

module.exports = {
  search,
  startSession,
  verifyPhone,
  complete,
  registerBusiness,
  requestManual,
  sendOtp,
  verify,
  _maskPhone: maskPhone,
  _maskEmail: maskEmail,
  _last10: last10,
};