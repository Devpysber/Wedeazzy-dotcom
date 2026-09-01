/**
 * Admin-only platform management: dashboard metrics, vendor/user/booking
 * moderation, and direct vendor/venue creation. All routes are gated behind
 * requireAuth + requireRole('admin') at the router level (admin.routes.js).
 */

const prisma = require('../config/db');
const bcrypt = require('bcryptjs');
const { HttpError } = require('../middleware/error');
const { slugify, uniqueSlug } = require('../utils/slug');
const { sanitizeFields } = require('../utils/sanitize');
const { sendMail, sendBookingConfirmedEmail, sendAccountSuspendedEmail } = require('../services/email.service');
const { getEmailWorkflows, saveEmailWorkflows } = require('../config/emailWorkflowsConfig');
const { assertStrongPassword } = require('../services/auth.service');
const logger = require('../config/logger');
const { getVendorCategories, saveVendorCategories } = require('../config/vendorCategoriesConfig');
const { getCities, saveCities } = require('../config/citiesConfig');
const { getSuburbs, saveSuburbs } = require('../config/suburbsConfig');
const { getGrowCampaignsPricing, saveGrowCampaignsPricing } = require('../config/growCampaignsPricingConfig');
const paymentController = require('./payment.controller');
const refundTransaction = paymentController.refundTransaction;
const cancelVendorSubscription = paymentController.cancelVendorSubscription;

// Valid enum values for validation
const VALID_BOOKING_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed'];
const VALID_EMAIL_SEGMENTS = ['all', 'vendors', 'couples'];
// Hostinger's shared SMTP enforces a low hourly send cap; this spacing keeps a
// campaign well under it even for a few hundred recipients.
const EMAIL_BROADCAST_DELAY_MS = 400;

/**
 * Lenient phone formatter shared by admin-created vendor/venue records: keeps
 * digits only, then ensures a 91-prefixed 12-digit number using the last 10
 * digits given. Intentionally more permissive than utils/phone.normalisePhone
 * (which rejects invalid numbers outright) since admin-entered contacts here
 * are taken at face value rather than user-verified via OTP.
 */
function formatAdminPhone(contact) {
  const cleanPhone = String(contact).replace(/[^0-9]/g, '');
  return cleanPhone.startsWith('91') && cleanPhone.length === 12 ? cleanPhone : `91${cleanPhone.slice(-10)}`;
}

/**
 * Get aggregated administrative dashboard metrics & Platform Overview BI analytics
 */
async function getAnalytics(req, res, next) {
  try {
    const adminAnalytics = require('../services/adminAnalytics.service');
    const { range, from, to, countryCode, country, countryId, citySlug, categorySlug, tier } = req.query || {};

    const overview = await adminAnalytics.getPlatformOverview({
      range: range || '30d',
      from,
      to,
      countryCode: countryCode || country,
      countryId,
      citySlug,
      categorySlug,
      tier
    });

    // Format legacy stats object to maintain full backward compatibility
    const stats = {
      pendingBookings: (overview.bookingsOverview && overview.bookingsOverview.pending) || 0,
      inProgressBookings: (overview.bookingsOverview && overview.bookingsOverview.pending) || 0,
      confirmedBookings: (overview.bookingsOverview && overview.bookingsOverview.confirmed) || 0,
      cancelledBookings: (overview.bookingsOverview && overview.bookingsOverview.cancelled) || 0,
      venuesCount: (overview.listingHealth && overview.listingHealth.totalListings) || (overview.kpis && overview.kpis.listings ? overview.kpis.listings.value : 0),
      vendorsCount: (overview.kpis && overview.kpis.vendors) ? overview.kpis.vendors.value : 0,
      servicesCount: (overview.kpis && overview.kpis.categories) ? overview.kpis.categories.value : 0,
      usersCount: (overview.kpis && overview.kpis.users) ? overview.kpis.users.value : 0,
      businessClaims: (overview.claimAnalytics && overview.claimAnalytics.pendingRequests) || (overview.kpis && overview.kpis.claimedListings ? overview.kpis.claimedListings.value : 0),
      regionsCount: (overview.kpis && overview.kpis.cities) ? overview.kpis.cities.value : 0,
      citiesCount: (overview.kpis && overview.kpis.cities) ? overview.kpis.cities.value : 0
    };

    res.json({
      ok: true,
      stats,
      overview
    });
  } catch (e) { next(e); }
}

/**
 * Fetch all registered vendors
 */
async function getVendors(req, res, next) {
  try {
    const { countryCode, countryId, limit } = req.query || {};
    const where = {};
    if (countryCode && countryCode.toLowerCase() !== 'all') {
      where.OR = [{ countryCode: countryCode.toUpperCase() }, { country: { code: countryCode.toUpperCase() } }];
    } else if (countryId) {
      where.countryId = countryId;
    }

    const totalCount = await prisma.vendor.count({ where });
    const take = limit ? Math.min(parseInt(limit, 10) || 500, 20000) : 20000;

    const list = await prisma.vendor.findMany({
      where,
      include: {
        user: { select: { name: true, email: true, phone: true, lastLogin: true } },
        _count: { select: { photos: true } }
      },
      orderBy: { createdAt: 'desc' },
      take
    });

    const vendors = list.map(v => ({
      id: v.id,
      name: v.businessName,
      vendorName: v.user?.name || '—',
      category: v.category,
      rating: v.rating,
      status: v.isActive ? 'approved' : 'cancelled',
      contact: v.whatsappNumber || v.user?.phone || '—',
      email: v.user?.email || '—',
      claims: v.isVerified ? 'Verified Owner' : 'Claim Requested',
      hasOwner: !!v.userId,
      invitedAt: v.invitedAt ? v.invitedAt.toISOString() : null,
      invitedChannel: v.invitedChannel || null,
      address: `${v.city || ''}, ${v.area || ''}`,
      city: v.city || null,
      area: v.area || null,
      country: v.country || 'India',
      countryCode: v.countryCode || 'IN',
      isVerified: v.isVerified,
      isActive: v.isActive,
      lastLogin: v.user?.lastLogin ? v.user.lastLogin.toISOString() : null,
      subscriptionPlan: v.subscriptionPlan,
      tier: v.tier,
      subscriptionExpiry: v.subscriptionExpiry,
      photoCount: v._count?.photos || 0,
      kycDocumentUrl: v.kycDocumentUrl ? `/api/admin/vendors/${v.id}/document` : null,
      createdAt: v.createdAt.toISOString()
    }));

    res.json({ ok: true, vendors, totalCount });
  } catch (e) { next(e); }
}

/**
 * Admin: send a claim-your-listing invitation to an unclaimed vendor
 * listing (Approve Businesses > Invitations). Unclaimed listings have no
 * linked User, so there's rarely an email on file — WhatsApp (the seeded
 * listing's own whatsappNumber) is the primary channel, email only when
 * the listing happens to already have a linked user with one.
 */
async function inviteVendorToClaim(req, res, next) {
  try {
    const { id } = req.params;
    const vendor = await prisma.vendor.findUnique({
      where: { id },
      include: { user: { select: { email: true } } },
    });
    if (!vendor) {
      throw new HttpError(404, 'Vendor listing not found', 'ERR_NOT_FOUND');
    }

    // The admin can now override where the invite goes and pick the channel(s),
    // instead of the endpoint silently using whatever number happened to be
    // scraped onto the listing. Body is entirely optional — an empty POST
    // reproduces the previous behaviour (send on every channel we have).
    const {
      whatsappNumber: overridePhone,
      email: overrideEmail,
      channels: requestedChannels,
      message: customMessage,
      saveNumber = true,
    } = req.body || {};

    const { normalisePhone } = require('../utils/phone');

    let phone = vendor.whatsappNumber;
    if (overridePhone) {
      const normalised = normalisePhone(overridePhone);
      if (!normalised) {
        throw new HttpError(
          400,
          'That WhatsApp number is not a valid Indian mobile number. Use a 10-digit number or a 91-prefixed one.',
          'ERR_INVALID_PHONE'
        );
      }
      phone = normalised;
    }

    const email = overrideEmail ? String(overrideEmail).trim() : vendor.user?.email || null;
    if (overrideEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new HttpError(400, 'That email address is not valid', 'ERR_INVALID_EMAIL');
    }

    // Default: whatever channel we actually have contact details for.
    const wanted = Array.isArray(requestedChannels) && requestedChannels.length
      ? requestedChannels
      : ['whatsapp', 'email'];

    const env = require('../config/env');
    // Links to the real vendor onboarding page — there's no dedicated
    // "claim this specific listing" flow yet, so this just gets them
    // started on a normal signup rather than a dead/unconsumed query param.
    const claimUrl = `${env.PUBLIC_BASE_URL || 'http://localhost:4000'}/pages/vendor.html`;
    const defaultMessage = `Hi! Your business "${vendor.businessName}" is listed on WedEazzy.com. Claim your free listing to manage your profile, photos, and leads: ${claimUrl}`;
    // A custom message is admin-authored but still ends up in an HTML email, so
    // it gets escaped on the HTML path (plain text/WhatsApp need no escaping).
    const message = customMessage ? String(customMessage).slice(0, 1000) : defaultMessage;

    const channels = [];
    if (wanted.includes('whatsapp') && phone) {
      require('../services/whatsapp.service')
        .sendWa({
          to: phone,
          body: message,
          template: 'claim_invitation',
          // Only when the admin did not already pick the email channel, so a
          // WhatsApp-only send still lands while WhatsApp is unauthenticated.
          fallbackEmail: wanted.includes('email') ? null : email,
          subjectHint: `Claim your WedEazzy listing - ${vendor.businessName}`,
        })
        .catch((err) => logger.error({ err, vendorId: vendor.id }, 'Failed to send claim-invitation WhatsApp'));
      channels.push('whatsapp');
    }
    if (wanted.includes('email') && email) {
      sendMail({
        to: email,
        subject: `Claim your WedEazzy listing - ${vendor.businessName}`,
        html: `<p>Hi,</p><p>${escapeHtml(message)}</p><p>Best regards,<br>WedEazzy Business Relations Team</p>`,
        text: message,
      }).catch((err) => logger.error({ err, vendorId: vendor.id }, 'Failed to send claim-invitation email'));
      channels.push('email');
    }

    if (channels.length === 0) {
      throw new HttpError(
        400,
        'No usable contact for the selected channel. Add a WhatsApp number or email address and try again.',
        'ERR_NO_CONTACT'
      );
    }

    const data = { invitedAt: new Date(), invitedChannel: channels.join('+') };
    // Persist a corrected number so the next invite (and the vendor's public
    // enquiry routing) benefits from the admin's fix.
    if (saveNumber && overridePhone && phone && phone !== vendor.whatsappNumber) {
      data.whatsappNumber = phone;
    }

    const updated = await prisma.vendor.update({ where: { id }, data });

    res.json({
      ok: true,
      invitedAt: updated.invitedAt,
      invitedChannel: updated.invitedChannel,
      sentTo: { whatsapp: channels.includes('whatsapp') ? phone : null, email: channels.includes('email') ? email : null },
    });
  } catch (e) { next(e); }
}

/**
 * Admin: invite several unclaimed listings in one action (Invitations page
 * bulk select). Each send is independent — one bad number must not abort the
 * rest of the batch — so this reports per-listing outcomes rather than failing
 * the whole request.
 */
async function bulkInviteVendors(req, res, next) {
  try {
    const { ids, channels: requestedChannels } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new HttpError(400, 'Select at least one listing to invite', 'ERR_INPUT');
    }
    if (ids.length > 500) {
      throw new HttpError(400, 'You can invite at most 500 listings at a time', 'ERR_TOO_MANY');
    }

    const wanted = Array.isArray(requestedChannels) && requestedChannels.length
      ? requestedChannels
      : ['whatsapp', 'email'];

    const env = require('../config/env');
    const claimUrl = `${env.PUBLIC_BASE_URL || 'http://localhost:4000'}/pages/vendor.html`;

    const vendors = await prisma.vendor.findMany({
      where: { id: { in: ids } },
      include: { user: { select: { email: true } } },
    });

    let sent = 0;
    const skipped = [];

    for (const vendor of vendors) {
      const phone = vendor.whatsappNumber;
      const email = vendor.user?.email || null;
      const message = `Hi! Your business "${vendor.businessName}" is listed on WedEazzy.com. Claim your free listing to manage your profile, photos, and leads: ${claimUrl}`;
      const channels = [];

      if (wanted.includes('whatsapp') && phone) {
        require('../services/whatsapp.service')
          .sendWa({
            to: phone,
            body: message,
            template: 'claim_invitation',
            fallbackEmail: wanted.includes('email') ? null : email,
            subjectHint: `Claim your WedEazzy listing - ${vendor.businessName}`,
          })
          .catch((err) => logger.error({ err, vendorId: vendor.id }, 'Bulk claim-invitation WhatsApp failed'));
        channels.push('whatsapp');
      }
      if (wanted.includes('email') && email) {
        sendMail({
          to: email,
          subject: `Claim your WedEazzy listing - ${vendor.businessName}`,
          html: `<p>Hi,</p><p>${escapeHtml(message)}</p><p>Best regards,<br>WedEazzy Business Relations Team</p>`,
          text: message,
        }).catch((err) => logger.error({ err, vendorId: vendor.id }, 'Bulk claim-invitation email failed'));
        channels.push('email');
      }

      if (channels.length === 0) {
        skipped.push({ id: vendor.id, name: vendor.businessName, reason: 'No contact details on file' });
        continue;
      }

      await prisma.vendor.update({
        where: { id: vendor.id },
        data: { invitedAt: new Date(), invitedChannel: channels.join('+') },
      });
      sent++;
    }

    res.json({ ok: true, sent, skipped, requested: ids.length });
  } catch (e) { next(e); }
}

/**
 * Fetch all registered platform users
 */
async function getUsers(req, res, next) {
  try {
    const totalCount = await prisma.user.count();
    const list = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20000 // see getVendors — raised from a 1000-row cap
    });

    const users = list.map(u => ({
      id: u.id,
      name: u.name || 'Anonymous User',
      email: u.email || u.phone || '—',
      role: u.role === 'couple' ? 'Customer' : u.role.toUpperCase(),
      status: u.suspendedAt ? 'inactive' : 'active',
      joinDate: u.createdAt.toISOString().split('T')[0]
    }));

    res.json({ ok: true, users, totalCount });
  } catch (e) { next(e); }
}

/**
 * Fetch all system bookings
 */
async function getBookings(req, res, next) {
  try {
    const totalCount = await prisma.booking.count();
    const list = await prisma.booking.findMany({
      include: {
        couple: { include: { user: { select: { name: true, phone: true } } } },
        vendor: { select: { businessName: true, category: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 20000 // see getVendors — raised from a 1000-row cap
    });

    const bookings = list.map(b => ({
      id: b.id,
      clientName: b.couple?.user?.name || 'Partner client',
      eventType: b.vendor?.category || 'Wedding Service',
      date: b.eventDate.toISOString().split('T')[0],
      venue: b.vendor?.businessName || 'Banquet Hall',
      budget: b.amount || 0,
      status: b.status,
      notes: b.notes || 'No extra guidelines provided.'
    }));

    res.json({ ok: true, bookings, totalCount });
  } catch (e) { next(e); }
}

/**
 * Fire-and-forget email + WhatsApp notification for an admin-driven vendor
 * status change. Mirrors the pattern already used by cancelVendorSubscription
 * and refundTransaction in payment.controller.js — without this, a vendor
 * approved, rejected, or blacklisted from the admin panel had no way to find
 * out except by noticing their listing changed.
 */
function notifyVendorStatusChange(vendor, subject, message) {
  const email = vendor.user?.email;
  const phone = vendor.user?.phone;
  if (email) {
    sendMail({
      to: email,
      subject: `${subject} - WedEazzy.com`,
      html: `<p>Dear ${vendor.businessName} Team,</p><p>${message}</p><p>Best regards,<br>WedEazzy Relations Team</p>`,
      text: message,
    }).catch((err) => logger.error({ err, vendorId: vendor.id }, 'Failed to send vendor status-change email'));
  }
  if (phone) {
    require('../services/whatsapp.service')
      .sendWa({ to: phone, body: `*${subject} - WedEazzy.com*\n\n${message}`, template: 'vendor_status_change' })
      .catch((err) => logger.error({ err, vendorId: vendor.id }, 'Failed to send vendor status-change WhatsApp'));
  }
}

/**
 * Verify a vendor listing status
 */
async function verifyVendor(req, res, next) {
  try {
    const { id } = req.params;
    const { isVerified } = req.body;

    const vendor = await prisma.vendor.update({
      where: { id },
      data: { isVerified: !!isVerified },
      include: { user: { select: { email: true, phone: true } } },
    });

    notifyVendorStatusChange(
      vendor,
      isVerified ? 'Listing Verified' : 'Verification Removed',
      isVerified
        ? 'Great news — your business listing has been reviewed and is now verified on WedEazzy.com.'
        : 'Your business listing\'s verified status has been removed by our team. Please contact support if you have questions.'
    );

    res.json({ ok: true, vendor });
  } catch (e) { next(e); }
}

/**
 * Enable/Disable a vendor
 */
async function toggleVendorStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const vendor = await prisma.vendor.update({
      where: { id },
      data: { isActive: !!isActive },
      include: { user: { select: { email: true, phone: true } } },
    });

    notifyVendorStatusChange(
      vendor,
      isActive ? 'Listing Approved & Active' : 'Listing Deactivated',
      isActive
        ? 'Your business listing is now live and visible to couples on WedEazzy.com.'
        : 'Your business listing has been deactivated by our team and is no longer visible on WedEazzy.com. Please contact support if you have questions.'
    );

    res.json({ ok: true, vendor });
  } catch (e) { next(e); }
}

/**
 * Admin: attach a proof-of-business document (registration certificate, GST,
 * ID proof, etc.) to a vendor for KYC verification. Accepts PDF or images —
 * unlike the vendor's own photo upload, which is JPG/PNG/WebP only.
 */
async function uploadVendorDocument(req, res, next) {
  try {
    const { id } = req.params;
    if (!req.file) {
      throw new HttpError(400, 'No file uploaded', 'ERR_NO_FILE');
    }

    // Store just the filename — this is a private document served only
    // through downloadVendorDocument below, never a directly-fetchable
    // public URL (see admin.routes.js for why the storage dir changed).
    const vendor = await prisma.vendor.update({
      where: { id },
      data: { kycDocumentUrl: req.file.filename },
    });

    res.json({ ok: true, url: `/api/admin/vendors/${id}/document`, vendor });
  } catch (e) { next(e); }
}

/**
 * Admin: stream a vendor's KYC document. Auth is enforced entirely by this
 * route's middleware (requireAuth + requireRole('admin'), applied to the
 * whole admin router) — the file itself lives outside any statically-mounted
 * directory, so this handler is the ONLY way to reach it.
 *
 * Handles two storage shapes for backward compatibility:
 *  - New records: kycDocumentUrl is a bare filename in kyc-private/.
 *  - Records created before this fix: kycDocumentUrl is a legacy full
 *    "<PUBLIC_BASE_URL>/api/uploads/<filename>" URL pointing at the old
 *    (still-public) uploads/ dir — the filename is extracted and served
 *    from there instead, so already-uploaded documents don't break.
 */
async function downloadVendorDocument(req, res, next) {
  try {
    const path = require('path');
    const fs = require('fs');
    const env = require('../config/env');
    const { id } = req.params;

    const vendor = await prisma.vendor.findUnique({ where: { id }, select: { kycDocumentUrl: true } });
    if (!vendor || !vendor.kycDocumentUrl) {
      throw new HttpError(404, 'No document on file for this vendor', 'ERR_NOT_FOUND');
    }

    const stored = vendor.kycDocumentUrl;
    const isLegacyUrl = /^https?:\/\//i.test(stored) || stored.includes('/api/uploads/');
    const filename = path.basename(stored); // strips any URL/path prefix, both shapes

    const KYC_DIR = path.resolve(__dirname, '..', '..', 'kyc-private');
    const LEGACY_DIR = path.isAbsolute(env.UPLOAD_DIR) ? env.UPLOAD_DIR : path.resolve(__dirname, '..', '..', env.UPLOAD_DIR);
    const filePath = isLegacyUrl ? path.join(LEGACY_DIR, filename) : path.join(KYC_DIR, filename);

    if (!fs.existsSync(filePath)) {
      throw new HttpError(404, 'Document file not found on disk', 'ERR_NOT_FOUND');
    }

    res.sendFile(filePath);
  } catch (e) { next(e); }
}

/**
 * Admin: issue (or reset) login credentials for a vendor directly, and email
 * them the email/password. Covers both unclaimed seeded listings (no linked
 * User yet) and vendors whose email wasn't captured at signup - the admin/
 * sales team can type in an email here rather than being blocked on it.
 * Sets mustChangePassword so the vendor is forced to set their own password
 * on first login (see POST /api/auth/change-password).
 */
async function sendVendorCredentials(req, res, next) {
  try {
    const { id } = req.params;
    const { email, password } = req.body || {};

    if (!email || !email.trim()) {
      throw new HttpError(400, 'Email address is required', 'ERR_INPUT');
    }
    if (!password) {
      throw new HttpError(400, 'Password is required', 'ERR_INPUT');
    }
    assertStrongPassword(password);

    const normalizedEmail = email.trim().toLowerCase();

    const vendor = await prisma.vendor.findUnique({ where: { id }, include: { user: true } });
    if (!vendor) {
      throw new HttpError(404, 'Vendor not found', 'ERR_NOT_FOUND');
    }

    // If this email belongs to a different existing account, refuse rather
    // than silently taking it over.
    const existingByEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingByEmail && (!vendor.userId || existingByEmail.id !== vendor.userId)) {
      throw new HttpError(400, 'This email is already used by a different account', 'ERR_DUPLICATE');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    let user;
    if (vendor.userId) {
      user = await prisma.user.update({
        where: { id: vendor.userId },
        data: { email: normalizedEmail, passwordHash, mustChangePassword: true, role: 'vendor', verifiedAt: new Date() },
      });
    } else {
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          mustChangePassword: true,
          role: 'vendor',
          name: vendor.businessName,
          verifiedAt: new Date(),
        },
      });
      await prisma.vendor.update({ where: { id: vendor.id }, data: { userId: user.id } });
    }

    const html = `
      <div style="font-family: sans-serif; max-width: 480px;">
        <h2 style="color:#0E1726;">Your WedEazzy Vendor Login</h2>
        <p>Hi ${escapeHtml(vendor.businessName)},</p>
        <p>An account has been set up for <strong>${escapeHtml(vendor.businessName)}</strong> on WedEazzy. Use these details to log in to your vendor dashboard:</p>
        <table style="margin:16px 0;">
          <tr><td style="padding:4px 12px 4px 0;color:#666;">Email</td><td><strong>${escapeHtml(normalizedEmail)}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#666;">Password</td><td><strong>${escapeHtml(password)}</strong></td></tr>
        </table>
        <p style="color:#DC2626;"><strong>For your security, you'll be asked to set a new password the first time you log in.</strong></p>
        <p>If you weren't expecting this email, please contact our support team.</p>
      </div>`;

    const mailResult = await sendMail({
      to: normalizedEmail,
      subject: 'Your WedEazzy Vendor Login Credentials',
      html,
      text: `Your WedEazzy vendor login — Email: ${normalizedEmail}, Password: ${password}. You'll be asked to set a new password on first login.`,
    });

    const emailActuallySent = !!(mailResult && mailResult.ok && !mailResult.fallback);
    res.json({
      ok: true,
      message: emailActuallySent
        ? 'Credentials created and emailed to the vendor.'
        : mailResult && mailResult.fallback
          ? 'Credentials were created, but the server email settings are not configured — no email was sent. Share the password with the vendor manually.'
          : 'Credentials were created, but the email could not be sent — share them manually.',
      emailSent: emailActuallySent,
    });
  } catch (e) { next(e); }
}

/**
 * Enable/Suspend a user's account access.
 * Uses a separate 'suspendedAt' field to avoid conflating admin suspension
 * with password-reset credential revocations (which use 'revokedBefore').
 */
async function toggleUserStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'active' or 'inactive'

    if (!status || !['active', 'inactive'].includes(status)) {
      throw new HttpError(400, "Status must be 'active' or 'inactive'", 'ERR_INPUT');
    }

    const isSuspending = status === 'inactive';

    if (isSuspending) {
      if (id === req.user.id) {
        throw new HttpError(400, 'You cannot suspend your own account.', 'ERR_SELF_LOCKOUT');
      }
      const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
      if (target?.role === 'admin') {
        const activeAdminCount = await prisma.user.count({ where: { role: 'admin', suspendedAt: null } });
        if (activeAdminCount <= 1) {
          throw new HttpError(400, 'Cannot suspend the last remaining active admin account.', 'ERR_LAST_ADMIN');
        }
      }
    }

    const updateData = {
      suspendedAt: isSuspending ? new Date() : null
    };

    // When suspending, also destroy all active sessions for immediate lockout
    if (isSuspending) {
      await prisma.session.deleteMany({ where: { userId: id } });
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData
    });

    res.json({ ok: true, user });

    if (isSuspending && user.email) {
      sendAccountSuspendedEmail(user.email, user.name).catch((e) =>
        logger.error({ err: e, userId: id }, 'Failed to send account-suspended email')
      );
    }
  } catch (e) { next(e); }
}

/**
 * Update system booking status
 */
async function updateBookingStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !VALID_BOOKING_STATUSES.includes(status)) {
      throw new HttpError(400, `Invalid booking status. Must be one of: ${VALID_BOOKING_STATUSES.join(', ')}`, 'ERR_INPUT');
    }

    const booking = await prisma.booking.update({
      where: { id },
      data: { status },
      include: {
        couple: { include: { user: { select: { email: true, name: true } } } },
        vendor: { select: { businessName: true } }
      }
    });

    res.json({ ok: true, booking });

    if (status === 'confirmed' && booking.couple?.user?.email) {
      sendBookingConfirmedEmail(booking.couple.user.email, booking, booking.vendor?.businessName || 'your vendor').catch((e) =>
        logger.error({ err: e, bookingId: id }, 'Failed to send booking-confirmed email')
      );
    }
  } catch (e) { next(e); }
}

/**
 * Admin direct vendor registration
 */
async function createVendor(req, res, next) {
  try {
    const { name, category, city, contact, email } = req.body;

    if (!name || !category || !city || !contact) {
      throw new HttpError(400, 'Name, category, city and phone contact are required', 'ERR_INPUT');
    }

    // Sanitize text inputs
    sanitizeFields(req.body, ['name', 'category', 'city']);

    const formattedPhone = formatAdminPhone(contact);

    let user = await prisma.user.findFirst({
      where: {
        OR: [
          ...(email ? [{ email }] : []),
          { phone: formattedPhone }
        ]
      },
      include: { vendor: true }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: email || null,
          phone: formattedPhone,
          role: 'vendor',
          name: name,
          verifiedAt: new Date()
        }
      });
    } else if (user.vendor) {
      // Prevent duplicate vendor creation for existing vendor users
      throw new HttpError(400, 'This user already has a vendor profile registered.', 'ERR_DUPLICATE_VENDOR');
    }

    const slug = await uniqueSlug(prisma, 'vendor', `${name}-${city}`);

    const vendor = await prisma.vendor.create({
      data: {
        userId: user.id,
        businessName: name,
        slug,
        category,
        categorySlug: slugify(category),
        city,
        citySlug: slugify(city),
        whatsappNumber: formattedPhone,
        isVerified: true
      }
    });

    res.json({ ok: true, vendor });
  } catch (e) { next(e); }
}

/**
 * Admin direct venue registration
 */
async function createVenue(req, res, next) {
  try {
    sanitizeFields(req.body, ['name', 'location']);
    const { name, location, capacity, price, contact, email } = req.body;

    if (!name || !location || !capacity || !price || !contact) {
      throw new HttpError(400, 'Name, location, capacity, price and contact are required', 'ERR_INPUT');
    }

    const formattedPhone = formatAdminPhone(contact);

    let user = await prisma.user.findFirst({
      where: {
        OR: [
          ...(email ? [{ email }] : []),
          { phone: formattedPhone }
        ]
      },
      include: { vendor: true }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: email || null,
          phone: formattedPhone,
          role: 'vendor',
          name: name,
          verifiedAt: new Date()
        }
      });
    } else if (user.vendor) {
      throw new HttpError(400, 'This user already has a vendor/venue profile registered.', 'ERR_DUPLICATE_VENDOR');
    }

    const slug = await uniqueSlug(prisma, 'vendor', `${name}-${location}`);

    const vendor = await prisma.vendor.create({
      data: {
        userId: user.id,
        businessName: name,
        slug,
        category: 'Banquet Halls',
        categorySlug: 'banquet-halls',
        city: 'Mumbai',
        citySlug: 'mumbai',
        area: location,
        whatsappNumber: formattedPhone,
        capacity: Math.max(0, parseInt(capacity, 10) || 0),
        priceMin: Math.max(0, parseInt(price, 10) || 0),
        isVerified: true
      }
    });

    res.json({ ok: true, vendor });
  } catch (e) { next(e); }
}

/**
 * Admin direct user creation.
 * Persists a real User row so the admin "Add User" action is no longer a
 * frontend-only mock. Role labels from the admin panel are mapped to internal
 * roles (Customer -> couple, Vendor -> vendor, Admin -> admin).
 */
async function createUser(req, res, next) {
  try {
    const { name, email, role } = req.body;

    if (!name || !email) {
      throw new HttpError(400, 'Name and email are required', 'ERR_INPUT');
    }

    sanitizeFields(req.body, ['name']);
    const cleanName = req.body.name;
    const normalizedEmail = String(email).trim().toLowerCase();

    const roleMap = { Customer: 'couple', Vendor: 'vendor', Admin: 'admin', couple: 'couple', vendor: 'vendor', admin: 'admin' };
    const chosenRole = roleMap[role] || 'couple';

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      throw new HttpError(400, 'A user with this email already exists', 'ERR_USER_EXISTS');
    }

    const user = await prisma.user.create({
      data: { email: normalizedEmail, name: cleanName, role: chosenRole, verifiedAt: new Date() }
    });

    res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e) { next(e); }
}

/**
 * Admin direct booking creation.
 * Persists a real Booking row so the admin "Add Booking" action is no longer a
 * frontend-only mock. The form supplies a free-text client name and venue name;
 * the venue is matched to an existing vendor, and a lightweight couple record is
 * created from the client name to satisfy the required booking relations
 * (this mirrors what the bookings list already displays).
 */
async function createBooking(req, res, next) {
  try {
    const { clientName, venue, eventType, date, budget, notes } = req.body;

    if (!clientName || !venue || !date) {
      throw new HttpError(400, 'Client name, venue and event date are required', 'ERR_INPUT');
    }

    sanitizeFields(req.body, ['clientName', 'venue', 'notes']);

    // Resolve the venue/vendor by business name (form supplies free text).
    const vendor = await prisma.vendor.findFirst({
      where: { businessName: { contains: String(req.body.venue).trim() } },
      orderBy: { createdAt: 'desc' }
    });
    if (!vendor) {
      throw new HttpError(404, 'No vendor/venue matches that name. Create the vendor first, then add the booking.', 'ERR_NO_VENDOR');
    }

    // Booking.coupleId is a required relation; anchor it to a lightweight couple
    // record built from the client name entered by the admin.
    const clientUser = await prisma.user.create({
      data: { role: 'couple', name: String(req.body.clientName).trim(), verifiedAt: new Date() }
    });
    const couple = await prisma.couple.create({ data: { userId: clientUser.id } });

    const booking = await prisma.booking.create({
      data: {
        coupleId: couple.id,
        vendorId: vendor.id,
        eventDate: new Date(date),
        amount: (budget !== undefined && budget !== null && budget !== '') ? Math.max(0, Math.round(Number(budget))) : null,
        notes: req.body.notes || (eventType ? `Event type: ${eventType}` : null),
        status: 'pending'
      }
    });

    res.json({ ok: true, booking });
  } catch (e) { next(e); }
}

async function deleteVendor(req, res, next) {
  try {
    const { id } = req.params;
    const vendor = await prisma.vendor.findUnique({ where: { id } });
    if (!vendor) {
      throw new HttpError(404, 'Vendor profile not found', 'ERR_NOT_FOUND');
    }
    // Delete associated photos
    await prisma.vendorPhoto.deleteMany({ where: { vendorId: id } });
    // Delete vendor record
    await prisma.vendor.delete({ where: { id } });
    res.json({ ok: true, message: 'Vendor profile and listings deleted successfully' });
  } catch (e) { next(e); }
}

async function updateVendorSubscription(req, res, next) {
  try {
    const { id } = req.params;
    const { planName, expiryDate, isActive } = req.body;

    const vendor = await prisma.vendor.findUnique({ where: { id } });
    if (!vendor) throw new HttpError(404, 'Vendor profile not found', 'ERR_NOT_FOUND');

    const updateData = {};

    if (planName !== undefined) {
      if (!['Free', 'Premium', 'Featured'].includes(planName)) {
        throw new HttpError(400, 'Invalid subscription plan name', 'ERR_INPUT');
      }
      updateData.subscriptionPlan = planName;
      updateData.tier = planName === 'Featured' ? 'featured' : 'basic';

      // Manage Featured Pincode Locks
      if (planName === 'Featured') {
        if (vendor.pincode && vendor.categorySlug) {
          // Clean expired locks
          await prisma.pincodeLock.deleteMany({
            where: { pincode: vendor.pincode, categorySlug: vendor.categorySlug, lockedUntil: { lt: new Date() } }
          });
          const activeLock = await prisma.pincodeLock.findFirst({
            where: { pincode: vendor.pincode, categorySlug: vendor.categorySlug, lockedUntil: { gte: new Date() }, vendorId: { not: vendor.id } }
          });
          if (activeLock) {
            throw new HttpError(400, `Pincode ${vendor.pincode} is already locked for category ${vendor.category} by Vendor #${activeLock.vendorId}`, 'ERR_PINCODE_LOCKED');
          }

          const lockExpiry = expiryDate ? new Date(expiryDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          await prisma.pincodeLock.upsert({
            where: { vendorId: vendor.id },
            update: { pincode: vendor.pincode, categorySlug: vendor.categorySlug, lockedUntil: lockExpiry },
            create: { vendorId: vendor.id, pincode: vendor.pincode, categorySlug: vendor.categorySlug, lockedUntil: lockExpiry }
          });
        }
      } else {
        // Upgrade/downgrade releases Featured pincode locks
        await prisma.pincodeLock.deleteMany({ where: { vendorId: vendor.id } });
      }
    }

    if (expiryDate !== undefined) {
      updateData.subscriptionExpiry = expiryDate ? new Date(expiryDate) : null;
      if (planName === 'Featured' || vendor.subscriptionPlan === 'Featured') {
        updateData.featuredUntil = expiryDate ? new Date(expiryDate) : null;
      }
    }

    if (isActive !== undefined) {
      updateData.isActive = !!isActive;
    }

    const updated = await prisma.vendor.update({
      where: { id },
      data: updateData
    });

    res.json({ ok: true, vendor: updated });
  } catch (e) {
    next(e);
  }
}

async function updatePlans(req, res, next) {
  try {
    const { plans, countryCode } = req.body;
    if (!plans) {
      throw new HttpError(400, 'Plans data is required', 'ERR_BAD_REQUEST');
    }

    const plansConfig = require('../config/plansConfig');
    const fullConfig = plansConfig.loadFullConfig();

    if (countryCode && countryCode !== 'all') {
      const cCode = String(countryCode).toUpperCase();
      fullConfig.countries = fullConfig.countries || {};
      fullConfig.countries[cCode] = {
        ...(fullConfig.countries[cCode] || {}),
        ...plans
      };
      // If updating IN, also sync root tiers for backward compatibility
      if (cCode === 'IN') {
        if (plans.Free) fullConfig.Free = plans.Free;
        if (plans.Premium) fullConfig.Premium = plans.Premium;
        if (plans.Featured) fullConfig.Featured = plans.Featured;
      }
    } else {
      if (plans.countries) fullConfig.countries = plans.countries;
      if (plans.Free) fullConfig.Free = plans.Free;
      if (plans.Premium) fullConfig.Premium = plans.Premium;
      if (plans.Featured) fullConfig.Featured = plans.Featured;
    }

    require('fs').writeFileSync(
      require('path').join(__dirname, '../config/plans.json'),
      JSON.stringify(fullConfig, null, 2),
      'utf8'
    );
    plansConfig.clearPlansCache();
    res.json({ ok: true, message: 'Plans updated successfully', plans: fullConfig });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: update Grow Business campaign package prices (WhatsApp Enquiries,
 * More Leads, Website Sales). Only price/original are accepted per tier —
 * days/label/recommended/custom stay structural and aren't editable here.
 */
async function updateGrowCampaignsPricing(req, res, next) {
  try {
    const { pricing, countryCode } = req.body || {};
    if (!pricing || typeof pricing !== 'object') {
      throw new HttpError(400, 'Pricing data is required', 'ERR_BAD_REQUEST');
    }

    const targetCode = (countryCode && countryCode !== 'all') ? countryCode.toUpperCase() : 'IN';
    const current = getGrowCampaignsPricing(targetCode);
    const updated = {};
    for (const key of Object.keys(current)) {
      if (key === 'countries') continue;
      const incomingPlans = pricing[key] && Array.isArray(pricing[key].plans) ? pricing[key].plans : null;
      updated[key] = {
        plans: current[key].plans.map((tier, idx) => {
          const incoming = incomingPlans && incomingPlans[idx];
          const price = incoming && incoming.price !== '' && Number.isFinite(Number(incoming.price))
            ? Math.max(0, Math.round(Number(incoming.price)))
            : tier.price;
          const original = incoming && incoming.original !== '' && incoming.original != null && Number.isFinite(Number(incoming.original))
            ? Math.max(0, Math.round(Number(incoming.original)))
            : tier.original;
          const merged = { ...tier, price };
          if (original) merged.original = original; else delete merged.original;
          return merged;
        }),
      };
    }

    saveGrowCampaignsPricing(updated, targetCode);
    res.json({ ok: true, pricing: updated, countryCode: targetCode, message: `Grow Campaigns pricing updated for ${targetCode} successfully` });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: Get Grow Business campaign stats (revenue, top country, top category, top city, top plan, breakdown).
 * Supports countryCode filtering ('all' or specific ISO country code like 'IN', 'AE', 'GB', 'US', etc.).
 */
async function getGrowCampaignsStats(req, res, next) {
  try {
    const { countryCode } = req.query || {};
    const selectedCountry = (countryCode && countryCode !== 'all') ? countryCode.toUpperCase() : 'all';

    // Fetch all campaigns with vendor relation
    const campaigns = await prisma.adCampaign.findMany({
      include: {
        vendor: {
          select: {
            id: true,
            businessName: true,
            category: true,
            city: true,
            country: true,
            countryCode: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Filter campaigns by selected country if not 'all'
    const filteredCampaigns = campaigns.filter(c => {
      const isPurchased = c.paymentStatus === 'paid' || ['approved', 'running', 'completed', 'active'].includes(c.adminStatus) || (c.totalAmount && c.totalAmount > 0);
      if (!isPurchased) return false;
      if (selectedCountry === 'all') return true;
      const vCountryCode = (c.vendor && (c.vendor.countryCode || c.vendor.country)) ? c.vendor.countryCode || c.vendor.country : 'IN';
      return vCountryCode.toUpperCase() === selectedCountry || (selectedCountry === 'IN' && (vCountryCode.toUpperCase() === 'IN' || vCountryCode.toLowerCase() === 'india'));
    });

    let totalRevenue = 0;
    const countryCountMap = {};
    const categoryCountMap = {};
    const cityCountMap = {};
    const planCountMap = {};

    const PACKAGE_LABELS = {
      whatsapp_leads: 'Get WhatsApp Enquiries',
      more_leads: 'Get More Leads',
      website_sales: 'Increase Website Sales'
    };

    const COUNTRY_NAMES_MAP = {
      IN: 'India',
      AE: 'UAE',
      GB: 'UK',
      US: 'USA',
      CA: 'Canada',
      AU: 'Australia'
    };

    filteredCampaigns.forEach(c => {
      const amount = c.totalAmount || (c.dailyBudget && c.durationDays ? c.dailyBudget * c.durationDays : 0);
      totalRevenue += amount;

      // Country stats
      const rawCountry = (c.vendor && (c.vendor.countryCode || c.vendor.country)) || 'IN';
      const codeKey = rawCountry.length === 2 ? rawCountry.toUpperCase() : (rawCountry.toLowerCase() === 'india' ? 'IN' : rawCountry);
      const countryKey = COUNTRY_NAMES_MAP[codeKey] || rawCountry;
      if (!countryCountMap[countryKey]) countryCountMap[countryKey] = { name: countryKey, code: codeKey, count: 0, revenue: 0 };
      countryCountMap[countryKey].count += 1;
      countryCountMap[countryKey].revenue += amount;

      // Category stats
      const catKey = (c.vendor && c.vendor.category) || 'General Vendor';
      if (!categoryCountMap[catKey]) categoryCountMap[catKey] = { name: catKey, count: 0, revenue: 0 };
      categoryCountMap[catKey].count += 1;
      categoryCountMap[catKey].revenue += amount;

      // City stats
      const cityKey = (c.vendor && c.vendor.city) || 'Other';
      if (!cityCountMap[cityKey]) cityCountMap[cityKey] = { name: cityKey, count: 0, revenue: 0 };
      cityCountMap[cityKey].count += 1;
      cityCountMap[cityKey].revenue += amount;

      // Plan stats
      const pkgName = PACKAGE_LABELS[c.packageType] || c.packageType || 'Custom Campaign';
      const daysLabel = c.planDays ? `${c.planDays} Days` : 'Custom';
      const planKey = `${pkgName} (${daysLabel})`;
      if (!planCountMap[planKey]) planCountMap[planKey] = { name: planKey, packageType: c.packageType, planDays: c.planDays, count: 0, revenue: 0 };
      planCountMap[planKey].count += 1;
      planCountMap[planKey].revenue += amount;
    });

    const getTop = (map) => {
      const entries = Object.values(map);
      if (entries.length === 0) return null;
      entries.sort((a, b) => b.count !== a.count ? b.count - a.count : b.revenue - a.revenue);
      return entries[0];
    };

    const topCountry = getTop(countryCountMap) || { name: 'No Orders Yet', count: 0, revenue: 0 };
    const topCategory = getTop(categoryCountMap) || { name: 'No Orders Yet', count: 0, revenue: 0 };
    const topCity = getTop(cityCountMap) || { name: 'No Orders Yet', count: 0, revenue: 0 };
    const topPlan = getTop(planCountMap) || { name: 'No Orders Yet', count: 0, revenue: 0 };

    const recentPurchases = filteredCampaigns.slice(0, 15).map(c => {
      const rawC = c.vendor ? (c.vendor.countryCode || c.vendor.country || 'IN') : 'IN';
      const cCodeStr = rawC.length === 2 ? rawC.toUpperCase() : (rawC.toLowerCase() === 'india' ? 'IN' : rawC);
      return {
        id: c.id,
        vendorName: c.vendor ? c.vendor.businessName : 'Unknown Vendor',
        category: c.vendor ? c.vendor.category : 'N/A',
        city: c.vendor ? c.vendor.city : 'N/A',
        country: COUNTRY_NAMES_MAP[cCodeStr] || rawC,
        countryCode: cCodeStr,
        packageType: c.packageType || 'custom',
        planDays: c.planDays || 0,
        totalAmount: c.totalAmount || 0,
        paymentStatus: c.paymentStatus || 'pending',
        adminStatus: c.adminStatus || 'pending',
        createdAt: c.createdAt
      };
    });

    const { getSupportedGrowCountries } = require('../config/growCampaignsPricingConfig');
    const availableCountries = getSupportedGrowCountries();

    res.json({
      ok: true,
      countryCode: selectedCountry,
      stats: {
        totalRevenue,
        totalPurchases: filteredCampaigns.length,
        topCountry,
        topCategory,
        topCity,
        topPlan,
      },
      breakdowns: {
        byCountry: Object.values(countryCountMap).sort((a, b) => b.revenue - a.revenue),
        byCategory: Object.values(categoryCountMap).sort((a, b) => b.count - a.count),
        byCity: Object.values(cityCountMap).sort((a, b) => b.count - a.count),
        byPlan: Object.values(planCountMap).sort((a, b) => b.count - a.count),
      },
      recentPurchases,
      availableCountries
    });
  } catch (e) {
    next(e);
  }
}

/**
 * Escapes HTML special characters so admin-authored broadcast text can't
 * break the surrounding email markup.
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const emailCampaignService = require('../services/emailCampaign.service');

/**
 * Admin: Get overall statistics for Email Campaign Center header cards.
 */
async function getEmailCampaignStats(req, res, next) {
  try {
    const result = await emailCampaignService.getEmailCampaignStats();
    res.json(result);
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: Calculate exact audience breakdown count for selected filters.
 */
async function getAudienceCount(req, res, next) {
  try {
    const { audienceRules, customEmails } = req.body || {};
    const result = await emailCampaignService.getAudienceCount(audienceRules, customEmails);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: Paginated recipient preview table.
 */
async function getAudiencePreview(req, res, next) {
  try {
    const { audienceRules, customEmails, page, limit } = req.body || {};
    const result = await emailCampaignService.getAudiencePreview(audienceRules, customEmails, page, limit);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: Send a test email ONLY to a single test address.
 */
async function sendTestEmail(req, res, next) {
  try {
    const { testEmail, subject, previewText, body } = req.body || {};
    if (!testEmail || !subject || !body) {
      throw new HttpError(400, 'Test email address, subject, and body are required', 'ERR_INPUT');
    }

    const { sendMail } = require('../services/email.service');
    const sampleRecipient = {
      name: 'Test Administrator',
      businessName: 'WedEazzy Demo Listing',
      city: 'Mumbai',
      category: 'Wedding Services'
    };

    const personalizedSubject = emailCampaignService.replacePersonalization(subject, sampleRecipient);
    const personalizedBody = emailCampaignService.replacePersonalization(body, sampleRecipient);

    const result = await sendMail({
      to: testEmail,
      subject: `[TEST] ${personalizedSubject}`,
      html: personalizedBody,
      text: personalizedBody.replace(/<[^>]*>?/gm, '')
    });

    if (result.fallback) {
      res.json({ ok: true, message: `Test email simulated (SMTP fallback mode) for ${testEmail}` });
    } else {
      res.json({ ok: true, message: `Test email successfully delivered to ${testEmail}` });
    }
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: List reusable email templates.
 */
/**
 * Admin: list email templates with optional category, status, and search filters.
 */
async function listEmailTemplates(req, res, next) {
  try {
    const { category, status, search } = req.query;
    const where = {};

    if (category && category !== 'all') {
      where.category = category;
    }
    if (status && status !== 'all') {
      where.status = status;
    }
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q } },
        { subject: { contains: q } },
        { category: { contains: q } }
      ];
    }

    const templates = await prisma.emailTemplate.findMany({
      where,
      orderBy: { updatedAt: 'desc' }
    });
    res.json({ ok: true, templates });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: get single email template details.
 */
async function getEmailTemplateById(req, res, next) {
  try {
    const { id } = req.params;
    const template = await prisma.emailTemplate.findUnique({ where: { id } });
    if (!template) throw new HttpError(404, 'Email template not found', 'ERR_NOT_FOUND');
    res.json({ ok: true, template });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: Create or update a reusable email template.
 */
async function createEmailTemplate(req, res, next) {
  try {
    const { id, name, subject, previewText, body, category, status } = req.body || {};
    if (!name || !name.trim()) throw new HttpError(400, 'Template name is required', 'ERR_INPUT');
    if (!subject || !subject.trim()) throw new HttpError(400, 'Subject line is required', 'ERR_INPUT');
    if (!body || !body.trim()) throw new HttpError(400, 'Email content body is required', 'ERR_INPUT');

    const cleanData = {
      name: name.trim(),
      subject: subject.trim(),
      previewText: (previewText || '').trim(),
      body: body.trim(),
      category: (category || 'General').trim(),
      status: status === 'inactive' ? 'inactive' : 'active'
    };

    let template;
    if (id || req.params.id) {
      const targetId = id || req.params.id;
      template = await prisma.emailTemplate.update({
        where: { id: targetId },
        data: cleanData
      });
    } else {
      template = await prisma.emailTemplate.create({
        data: cleanData
      });
    }

    res.status(id ? 200 : 201).json({ ok: true, template });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: Update partial fields or toggle template status.
 */
async function updateEmailTemplate(req, res, next) {
  try {
    const { id } = req.params;
    const { name, subject, previewText, body, category, status } = req.body || {};

    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (subject !== undefined) data.subject = subject.trim();
    if (previewText !== undefined) data.previewText = previewText.trim();
    if (body !== undefined) data.body = body.trim();
    if (category !== undefined) data.category = category.trim();
    if (status !== undefined) data.status = status === 'inactive' ? 'inactive' : 'active';

    const template = await prisma.emailTemplate.update({
      where: { id },
      data
    });

    res.json({ ok: true, template });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: Duplicate an email template into a new database record.
 */
async function duplicateEmailTemplate(req, res, next) {
  try {
    const { id } = req.params;
    const original = await prisma.emailTemplate.findUnique({ where: { id } });
    if (!original) throw new HttpError(404, 'Email template not found', 'ERR_NOT_FOUND');

    const duplicate = await prisma.emailTemplate.create({
      data: {
        name: `${original.name} — Copy`,
        category: original.category,
        subject: original.subject,
        previewText: original.previewText,
        body: original.body,
        status: 'active',
        isSystem: false
      }
    });

    res.status(201).json({ ok: true, template: duplicate, message: 'Template duplicated successfully' });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: Delete or archive an email template.
 */
async function deleteEmailTemplate(req, res, next) {
  try {
    const { id } = req.params;
    const existing = await prisma.emailTemplate.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, 'Email template not found', 'ERR_NOT_FOUND');

    // System templates are archived rather than permanently deleted to preserve platform integrity
    if (existing.isSystem) {
      await prisma.emailTemplate.update({
        where: { id },
        data: { status: 'inactive' }
      });
      return res.json({ ok: true, message: 'System template archived (marked inactive)' });
    }

    await prisma.emailTemplate.delete({ where: { id } });
    res.json({ ok: true, message: 'Template deleted successfully' });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: Send a real test email for a template using Nodemailer/SMTP.
 */
async function testEmailTemplate(req, res, next) {
  try {
    const { testEmail, subject, previewText, body, vendorId } = req.body || {};
    if (!testEmail || !testEmail.trim()) throw new HttpError(400, 'Test email address is required', 'ERR_INPUT');
    if (!subject || !body) throw new HttpError(400, 'Subject and email body content are required', 'ERR_INPUT');

    const { sendMail } = require('../services/email.service');
    const { replacePersonalization } = require('../services/emailCampaign.service');

    let recipientData = {
      name: 'Test Vendor Admin',
      businessName: 'Royal Palace Banquets',
      city: 'Mumbai',
      category: 'Wedding Venue',
      completionPercentage: 85,
      slug: 'royal-palace-banquets',
      subscriptionPlan: 'Featured Tier'
    };

    if (vendorId) {
      const vendor = await prisma.vendor.findUnique({
        where: { id: vendorId },
        include: { user: { select: { name: true, email: true } }, photos: true }
      });
      if (vendor) {
        recipientData = {
          name: vendor.user?.name || vendor.businessName,
          businessName: vendor.businessName,
          city: vendor.city || 'your area',
          category: vendor.category || 'Wedding Vendor',
          slug: vendor.slug,
          subscriptionPlan: vendor.tier || 'Free Tier'
        };
      }
    }

    const resolvedSubject = replacePersonalization(subject, recipientData);
    const resolvedBody = replacePersonalization(body, recipientData);
    const resolvedPreview = replacePersonalization(previewText || '', recipientData);

    const mailResult = await sendMail({
      to: testEmail.trim(),
      subject: resolvedSubject,
      html: resolvedBody,
      text: resolvedBody.replace(/<[^>]+>/g, '')
    });

    const emailSent = !!(mailResult && mailResult.ok && !mailResult.fallback);
    res.json({
      ok: true,
      emailSent,
      message: emailSent
        ? `Test email sent to ${testEmail.trim()} successfully!`
        : `Email dispatched, but SMTP fallback mode was active.`
    });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: Resolve dynamic template variables for live vendor preview.
 */
async function resolveTemplatePreview(req, res, next) {
  try {
    const { subject, previewText, body, vendorId } = req.body || {};
    const { replacePersonalization } = require('../services/emailCampaign.service');

    let recipientData = {
      name: 'Rahul Sharma',
      businessName: 'Royal Palace Banquets',
      city: 'Mumbai',
      category: 'Wedding Venue',
      completionPercentage: 75,
      slug: 'royal-palace-banquets',
      subscriptionPlan: 'Premium Pro'
    };

    if (vendorId) {
      const vendor = await prisma.vendor.findUnique({
        where: { id: vendorId },
        include: { user: { select: { name: true, email: true } }, photos: true }
      });
      if (vendor) {
        recipientData = {
          name: vendor.user?.name || vendor.businessName,
          businessName: vendor.businessName,
          city: vendor.city || 'Mumbai',
          category: vendor.category || 'Wedding Venue',
          slug: vendor.slug,
          subscriptionPlan: vendor.tier || 'Free Tier'
        };
      }
    }

    const resolvedSubject = replacePersonalization(subject || '', recipientData);
    const resolvedPreview = replacePersonalization(previewText || '', recipientData);
    const resolvedBody = replacePersonalization(body || '', recipientData);

    res.json({
      ok: true,
      resolved: {
        subject: resolvedSubject,
        previewText: resolvedPreview,
        body: resolvedBody
      },
      sampleVendor: recipientData
    });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: List recent email campaigns with status and delivery counts.
 */
async function listEmailCampaigns(req, res, next) {
  try {
    const campaigns = await prisma.emailCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json({ ok: true, campaigns });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: Create and optionally dispatch an email campaign.
 */
async function createEmailCampaign(req, res, next) {
  try {
    const {
      name, subject, previewText, body, audienceRules, customEmails, action, scheduledAt,
      scheduleType, scheduleTime, daysOfWeek, dayOfMonth
    } = req.body || {};

    if (!name || !subject || !body) {
      throw new HttpError(400, 'Campaign name, subject, and body are required', 'ERR_INPUT');
    }

    const rules = typeof audienceRules === 'object' ? audienceRules : (audienceRules ? JSON.parse(audienceRules) : {});
    const recipients = await emailCampaignService.resolveRecipients(rules, customEmails);

    if ((action === 'send' || action === 'schedule') && recipients.length === 0) {
      throw new HttpError(400, 'Cannot launch campaign: Selected audience contains 0 valid email addresses', 'ERR_NO_RECIPIENTS');
    }

    let status = 'draft';
    let parsedScheduledAt = null;
    const cleanType = (scheduleType || 'once').toLowerCase();
    const formattedDaysOfWeek = typeof daysOfWeek === 'object' ? JSON.stringify(daysOfWeek) : (daysOfWeek || null);
    const parsedDayOfMonth = dayOfMonth ? parseInt(dayOfMonth, 10) : null;

    if (action === 'send' && cleanType === 'once') {
      status = 'queued';
    } else if (action === 'schedule' || cleanType !== 'once') {
      if (cleanType === 'once') {
        if (!scheduledAt) {
          throw new HttpError(400, 'Please select a valid future date and time to schedule this campaign', 'ERR_INPUT');
        }
        parsedScheduledAt = new Date(scheduledAt);
        if (isNaN(parsedScheduledAt.getTime()) || parsedScheduledAt <= new Date()) {
          throw new HttpError(400, 'Scheduled date and time must be in the future', 'ERR_INPUT');
        }
      }
      status = 'scheduled';
    }

    const initialNextRun = emailCampaignService.calculateNextRunAt({
      scheduleType: cleanType,
      scheduleTime,
      daysOfWeek: formattedDaysOfWeek,
      dayOfMonth: parsedDayOfMonth,
      scheduledAt: parsedScheduledAt
    });

    const campaign = await prisma.emailCampaign.create({
      data: {
        name,
        segment: rules.audienceType || 'all',
        subject,
        previewText: previewText || '',
        body,
        audienceRules: JSON.stringify(rules),
        customEmails: typeof customEmails === 'string' ? customEmails : (Array.isArray(customEmails) ? customEmails.join(', ') : ''),
        totalRecipients: recipients.length,
        status,
        scheduledAt: parsedScheduledAt,
        scheduleType: cleanType,
        scheduleTime: scheduleTime || null,
        daysOfWeek: formattedDaysOfWeek,
        dayOfMonth: parsedDayOfMonth,
        nextRunAt: initialNextRun
      }
    });

    res.status(201).json({ ok: true, campaign });

    if (action === 'send' && cleanType === 'once') {
      // Fire-and-forget background queueing
      emailCampaignService.dispatchCampaign(campaign.id).catch(err => {
        logger.error({ err, campaignId: campaign.id }, 'Background campaign dispatch crashed');
      });
    }
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: Retry dispatching failed recipients only.
 */
async function retryFailedEmailCampaign(req, res, next) {
  try {
    const { id } = req.params;
    const campaign = await prisma.emailCampaign.findUnique({ where: { id } });
    if (!campaign) throw new HttpError(404, 'Campaign not found', 'ERR_NOT_FOUND');

    res.json({ ok: true, message: 'Retrying failed campaign recipients in background...' });

    emailCampaignService.retryFailedCampaign(id).catch(err => {
      logger.error({ err, campaignId: id }, 'Retry failed campaign crashed');
    });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: Duplicate an existing campaign into a new Draft.
 */
async function duplicateEmailCampaign(req, res, next) {
  try {
    const { id } = req.params;
    const original = await prisma.emailCampaign.findUnique({ where: { id } });
    if (!original) throw new HttpError(404, 'Original campaign not found', 'ERR_NOT_FOUND');

    const copy = await prisma.emailCampaign.create({
      data: {
        name: `Copy of ${original.name}`,
        segment: original.segment,
        subject: original.subject,
        previewText: original.previewText,
        body: original.body,
        audienceRules: original.audienceRules,
        customEmails: original.customEmails,
        totalRecipients: original.totalRecipients,
        status: 'draft'
      }
    });

    res.status(201).json({ ok: true, campaign: copy });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: Delete a draft or campaign log.
 */
async function deleteEmailCampaign(req, res, next) {
  try {
    const { id } = req.params;
    await prisma.emailCampaign.delete({ where: { id } });
    res.json({ ok: true, message: 'Campaign deleted successfully' });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: list vendor service categories, with live "active listing" counts
 * pulled from real Vendor records (the category list itself is a small,
 * rarely-changing curated taxonomy stored in a JSON config file, same
 * pattern as Manage Plans, rather than its own DB table).
 */
async function listVendorCategories(req, res, next) {
  try {
    const categories = getVendorCategories();
    const counts = await prisma.vendor.groupBy({
      by: ['categorySlug'],
      _count: { categorySlug: true },
    });
    const countBySlug = Object.fromEntries(counts.map((c) => [c.categorySlug, c._count.categorySlug]));

    res.json({
      ok: true,
      categories: categories.map((c) => ({ ...c, count: countBySlug[c.slug] || 0 })),
    });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: register a new vendor service category.
 */
async function createVendorCategory(req, res, next) {
  try {
    const { name } = req.body || {};
    if (!name || !name.trim()) {
      throw new HttpError(400, 'Category label is required', 'ERR_INPUT');
    }

    const categories = getVendorCategories();
    const slug = slugify(name.trim());
    if (categories.some((c) => c.slug === slug)) {
      throw new HttpError(400, 'A category with this name already exists', 'ERR_DUPLICATE');
    }

    categories.push({ name: name.trim(), slug });
    saveVendorCategories(categories);

    res.status(201).json({ ok: true, category: { name: name.trim(), slug, count: 0 } });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: remove a vendor service category. Refuses if vendors currently use
 * it, so deleting a category never silently orphans live listings.
 */
async function deleteVendorCategory(req, res, next) {
  try {
    const { slug } = req.params;
    const categories = getVendorCategories();
    const exists = categories.find((c) => c.slug === slug);
    if (!exists) {
      throw new HttpError(404, 'Category not found', 'ERR_NOT_FOUND');
    }

    const inUseCount = await prisma.vendor.count({ where: { categorySlug: slug } });
    if (inUseCount > 0) {
      throw new HttpError(400, `Cannot delete: ${inUseCount} vendor(s) are still listed under this category`, 'ERR_IN_USE');
    }

    saveVendorCategories(categories.filter((c) => c.slug !== slug));
    res.json({ ok: true, message: 'Category deleted successfully' });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: list operational marketplace cities, with live active-vendor counts
 * (same small-config-file pattern as vendor categories, rather than its own
 * DB table — this list rarely changes).
 */
async function listCities(req, res, next) {
  try {
    const cities = getCities();
    const counts = await prisma.vendor.groupBy({
      by: ['citySlug'],
      _count: { citySlug: true },
    });
    const countBySlug = Object.fromEntries(counts.map((c) => [c.citySlug, c._count.citySlug]));

    res.json({
      ok: true,
      cities: cities.map((c) => ({ ...c, count: countBySlug[c.slug] || 0 })),
    });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: register a new operational city.
 */
async function createCity(req, res, next) {
  try {
    const { name, state } = req.body || {};
    if (!name || !name.trim()) {
      throw new HttpError(400, 'City name is required', 'ERR_INPUT');
    }

    const cities = getCities();
    const slug = slugify(name.trim());
    if (cities.some((c) => c.slug === slug)) {
      throw new HttpError(400, 'A city with this name already exists', 'ERR_DUPLICATE');
    }

    const city = { name: name.trim(), slug, state: (state || '').trim() };
    cities.push(city);
    saveCities(cities);

    res.status(201).json({ ok: true, city: { ...city, count: 0 } });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: remove an operational city. Refuses if vendors currently list under
 * it, so deleting a city never silently orphans live listings.
 */
async function deleteCity(req, res, next) {
  try {
    const { slug } = req.params;
    const cities = getCities();
    const exists = cities.find((c) => c.slug === slug);
    if (!exists) {
      throw new HttpError(404, 'City not found', 'ERR_NOT_FOUND');
    }

    const inUseCount = await prisma.vendor.count({ where: { citySlug: slug } });
    if (inUseCount > 0) {
      throw new HttpError(400, `Cannot delete: ${inUseCount} vendor(s) are still listed in this city`, 'ERR_IN_USE');
    }

    saveCities(cities.filter((c) => c.slug !== slug));
    res.json({ ok: true, message: 'City deleted successfully' });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: list operational suburb areas, each scoped to a parent city (same
 * small-config-file pattern as cities/vendor categories — this list rarely
 * changes and has no dedicated vendor-facing filter yet).
 */
async function listSuburbs(req, res, next) {
  try {
    const suburbs = getSuburbs();
    const cities = getCities();
    const cityBySlug = Object.fromEntries(cities.map((c) => [c.slug, c]));

    res.json({
      ok: true,
      suburbs: suburbs.map((s) => ({ ...s, cityName: cityBySlug[s.parentCitySlug]?.name || s.parentCitySlug })),
    });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: register a new suburb area under an existing operational city.
 */
async function createSuburb(req, res, next) {
  try {
    const { name, parentCitySlug } = req.body || {};
    if (!name || !name.trim()) {
      throw new HttpError(400, 'Suburb name is required', 'ERR_INPUT');
    }
    if (!parentCitySlug) {
      throw new HttpError(400, 'A parent city is required', 'ERR_INPUT');
    }

    const cities = getCities();
    const parentCity = cities.find((c) => c.slug === parentCitySlug);
    if (!parentCity) {
      throw new HttpError(400, 'Selected parent city does not exist', 'ERR_INPUT');
    }

    const suburbs = getSuburbs();
    // Slug is unique across all suburbs (not just within the parent city) so
    // deleteSuburb can look up by slug alone without ambiguity.
    const base = slugify(name.trim());
    let slug = base;
    let i = 1;
    while (suburbs.some((s) => s.slug === slug)) {
      i += 1;
      slug = `${base}-${i}`;
    }

    const suburb = { name: name.trim(), slug, parentCitySlug };
    suburbs.push(suburb);
    saveSuburbs(suburbs);

    res.status(201).json({ ok: true, suburb: { ...suburb, cityName: parentCity.name } });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: remove a suburb area.
 */
async function deleteSuburb(req, res, next) {
  try {
    const { slug } = req.params;
    const suburbs = getSuburbs();
    const exists = suburbs.find((s) => s.slug === slug);
    if (!exists) {
      throw new HttpError(404, 'Suburb not found', 'ERR_NOT_FOUND');
    }

    saveSuburbs(suburbs.filter((s) => s.slug !== slug));
    res.json({ ok: true, message: 'Suburb deleted successfully' });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: list the 5 automated-email workflows with their live enabled/
 * customHtml state (config-file-backed, same pattern as cities/suburbs).
 */
async function listEmailWorkflows(req, res, next) {
  try {
    res.json({ ok: true, workflows: getEmailWorkflows() });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: toggle a workflow on/off and/or set a custom HTML body that
 * replaces its built-in template. Actually enforced inside email.service.js
 * at send time (see isWorkflowEnabled/getWorkflowCustomHtml there).
 */
async function updateEmailWorkflow(req, res, next) {
  try {
    const { id } = req.params;
    const { enabled, customHtml } = req.body || {};

    const workflows = getEmailWorkflows();
    if (!workflows[id]) {
      throw new HttpError(404, 'Email workflow not found', 'ERR_NOT_FOUND');
    }

    if (typeof enabled === 'boolean') workflows[id].enabled = enabled;
    if (customHtml !== undefined) workflows[id].customHtml = customHtml || null;

    saveEmailWorkflows(workflows);
    res.json({ ok: true, workflow: workflows[id] });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: read-only current SMTP configuration. Never returns the password —
 * changing SMTP credentials has to happen via the hosting environment
 * variables and a redeploy, not a live in-app edit, since this process would
 * need to persist and re-read its own .env to do that safely.
 */
async function getSmtpConfig(req, res, next) {
  try {
    const env = require('../config/env');
    res.json({
      ok: true,
      smtp: {
        host: env.SMTP.host,
        port: env.SMTP.port,
        secure: env.SMTP.secure,
        user: env.SMTP.user,
        from: env.SMTP.from,
        configured: !!(env.SMTP.user && env.SMTP.pass),
      },
    });
  } catch (e) {
    next(e);
  }
}

const VALID_AUDIENCE_SEGMENTS = ['all', 'vendors', 'couples'];

/**
 * Admin: live recipient count preview for a given broadcast segment, so the
 * WhatsApp/email campaign composer can show "this will reach N people"
 * before sending. Mirrors the same where-clause resolution used by the
 * actual campaign send routes (createEmailCampaign / POST /whatsapp/campaign).
 */
async function getLegacyAudienceCount(req, res, next) {
  try {
    const { segment, channel } = req.query;
    const isVendorCategorySegment = typeof segment === 'string' && segment.startsWith('vendor_category:');
    if (!VALID_AUDIENCE_SEGMENTS.includes(segment) && !isVendorCategorySegment) {
      throw new HttpError(400, `Segment must be one of: ${VALID_AUDIENCE_SEGMENTS.join(', ')}, or vendor_category:<slug>`, 'ERR_INPUT');
    }

    const where = channel === 'email' ? { email: { not: null } } : { phone: { not: null } };
    if (isVendorCategorySegment) {
      const categorySlug = segment.slice('vendor_category:'.length);
      if (!categorySlug) {
        throw new HttpError(400, 'A vendor category must be selected', 'ERR_INPUT');
      }
      where.role = 'vendor';
      where.vendor = { some: { categorySlug } };
    } else if (segment === 'vendors') where.role = 'vendor';
    else if (segment === 'couples') where.role = 'couple';
    else where.role = { not: 'admin' };

    const count = await prisma.user.count({ where });
    res.json({ ok: true, count });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: live notification feed assembled from existing tables (no separate
 * notifications table) - vendors awaiting approval, unactioned inquiries,
 * and unconfirmed bookings. Sorted newest-first, capped for the dropdown.
 */
async function getNotifications(req, res, next) {
  try {
    const [pendingVendors, newInquiries, pendingBookings] = await Promise.all([
      prisma.vendor.findMany({
        where: { isVerified: false },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, businessName: true, createdAt: true },
      }),
      prisma.inquiry.findMany({
        where: { status: 'new' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, name: true, createdAt: true, vendor: { select: { businessName: true } } },
      }),
      prisma.booking.findMany({
        where: { status: 'pending' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, eventDate: true, createdAt: true, vendor: { select: { businessName: true } } },
      }),
    ]);

    const items = [
      ...pendingVendors.map((v) => ({
        type: 'vendor_approval',
        title: 'New business awaiting approval',
        subtitle: v.businessName,
        createdAt: v.createdAt,
        tab: 'vendors',
      })),
      ...newInquiries.map((i) => ({
        type: 'inquiry',
        title: `New inquiry from ${i.name}`,
        subtitle: i.vendor ? `For ${i.vendor.businessName}` : '',
        createdAt: i.createdAt,
        tab: 'contact-inquiries',
      })),
      ...pendingBookings.map((b) => ({
        type: 'booking',
        title: 'New booking pending confirmation',
        subtitle: b.vendor ? b.vendor.businessName : '',
        createdAt: b.createdAt,
        tab: 'bookings',
      })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ ok: true, items: items.slice(0, 20), count: items.length });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: list all blog articles regardless of status (drafts included),
 * for the Blogs dashboard table.
 */
async function adminListBlogs(req, res, next) {
  try {
    const blogs = await prisma.blog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    res.json({ ok: true, blogs });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: draft (or publish immediately) a new SEO blog article.
 */
async function createBlog(req, res, next) {
  try {
    const { title, metaDescription, content, publish } = req.body || {};
    if (!title || !title.trim()) throw new HttpError(400, 'SEO article title is required', 'ERR_INPUT');
    if (!metaDescription || !metaDescription.trim()) throw new HttpError(400, 'SEO meta description is required', 'ERR_INPUT');
    if (!content || !content.trim()) throw new HttpError(400, 'Blog content is required', 'ERR_INPUT');

    const slug = await uniqueSlug(prisma, 'blog', title);
    const shouldPublish = !!publish;

    const blog = await prisma.blog.create({
      data: {
        title: title.trim(),
        slug,
        metaDescription: metaDescription.trim(),
        content: content.trim(),
        status: shouldPublish ? 'published' : 'draft',
        publishedAt: shouldPublish ? new Date() : null,
      },
    });

    res.status(201).json({ ok: true, blog });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: edit an existing blog article's fields, and/or toggle its
 * published state (setting publishedAt the first time it goes live).
 */
async function updateBlog(req, res, next) {
  try {
    const { id } = req.params;
    const { title, metaDescription, content, status } = req.body || {};

    const existing = await prisma.blog.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, 'Blog article not found', 'ERR_NOT_FOUND');

    const data = {};
    if (title !== undefined) data.title = title.trim();
    if (metaDescription !== undefined) data.metaDescription = metaDescription.trim();
    if (content !== undefined) data.content = content.trim();
    if (status !== undefined) {
      if (!['draft', 'published'].includes(status)) {
        throw new HttpError(400, 'Status must be draft or published', 'ERR_INPUT');
      }
      data.status = status;
      if (status === 'published' && !existing.publishedAt) data.publishedAt = new Date();
    }

    const blog = await prisma.blog.update({ where: { id }, data });
    res.json({ ok: true, blog });
  } catch (e) {
    next(e);
  }
}

// ---------- COUNTRY MANAGEMENT CONTROLLERS ----------
async function getCountries(req, res, next) {
  try {
    const adminAnalytics = require('../services/adminAnalytics.service');
    const performance = await adminAnalytics.getCountryPerformance();
    res.json({ ok: true, countries: performance });
  } catch (e) { next(e); }
}

async function createCountry(req, res, next) {
  try {
    const { name, code, isoAlpha3, currency, currencySymbol, phoneCode, flag, timezone, status, displayOrder } = req.body;

    if (!name || !name.trim()) throw new HttpError(400, 'Country name is required', 'ERR_INPUT');
    if (!code || !code.trim()) throw new HttpError(400, 'Country code (ISO-2) is required', 'ERR_INPUT');

    const cleanCode = code.trim().toUpperCase();
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const existing = await prisma.country.findFirst({
      where: { OR: [{ code: cleanCode }, { name: name.trim() }, { slug }] }
    });
    if (existing) throw new HttpError(400, 'Country with this name or code already exists', 'ERR_DUPLICATE');

    const country = await prisma.country.create({
      data: {
        name: name.trim(),
        slug,
        code: cleanCode,
        isoAlpha3: (isoAlpha3 || '').trim().toUpperCase() || undefined,
        currency: (currency || 'USD').trim().toUpperCase(),
        currencySymbol: (currencySymbol || '$').trim(),
        phoneCode: (phoneCode || '+1').trim(),
        flag: (flag || '🌐').trim(),
        timezone: (timezone || 'UTC').trim(),
        status: status === 'inactive' ? 'inactive' : 'active',
        displayOrder: parseInt(displayOrder || '0', 10) || 0
      }
    });

    res.json({ ok: true, country });
  } catch (e) { next(e); }
}

async function updateCountry(req, res, next) {
  try {
    const { id } = req.params;
    const { name, code, isoAlpha3, currency, currencySymbol, phoneCode, flag, timezone, status, displayOrder } = req.body;

    const data = {};
    if (name !== undefined) {
      data.name = name.trim();
      data.slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    }
    if (code !== undefined) data.code = code.trim().toUpperCase();
    if (isoAlpha3 !== undefined) data.isoAlpha3 = isoAlpha3.trim().toUpperCase();
    if (currency !== undefined) data.currency = currency.trim().toUpperCase();
    if (currencySymbol !== undefined) data.currencySymbol = currencySymbol.trim();
    if (phoneCode !== undefined) data.phoneCode = phoneCode.trim();
    if (flag !== undefined) data.flag = flag.trim();
    if (timezone !== undefined) data.timezone = timezone.trim();
    if (status !== undefined) data.status = status === 'inactive' ? 'inactive' : 'active';
    if (displayOrder !== undefined) data.displayOrder = parseInt(displayOrder, 10) || 0;

    const country = await prisma.country.update({
      where: { id },
      data
    });

    res.json({ ok: true, country });
  } catch (e) { next(e); }
}

async function getCountryById(req, res, next) {
  try {
    const { id } = req.params;
    const adminAnalytics = require('../services/adminAnalytics.service');
    const detail = await adminAnalytics.getCountryDetailData(id);
    if (!detail) throw new HttpError(404, 'Country record not found', 'ERR_NOT_FOUND');
    res.json({ ok: true, ...detail });
  } catch (e) { next(e); }
}

// ---------- CITY MANAGEMENT CONTROLLERS ----------
async function getAdminCities(req, res, next) {
  try {
    const { countryId, countryCode } = req.query;
    const cityWhere = {};

    if (countryId) cityWhere.countryId = countryId;
    else if (countryCode && countryCode.toLowerCase() !== 'all') {
      const country = await prisma.country.findUnique({ where: { code: countryCode.toUpperCase() } });
      if (country) cityWhere.countryId = country.id;
    }

    const cities = await prisma.city.findMany({
      where: cityWhere,
      orderBy: { displayOrder: 'asc' },
      include: {
        country: { select: { id: true, name: true, code: true, flag: true } },
        _count: { select: { vendors: true, regions: true } }
      }
    });

    const enriched = await Promise.all(cities.map(async (c) => {
      const [inquiriesCount, bookingsCount] = await Promise.all([
        prisma.inquiry.count({ where: { vendor: { citySlug: c.slug } } }),
        prisma.booking.count({ where: { vendor: { citySlug: c.slug } } })
      ]);
      return {
        ...c,
        vendorsCount: c._count.vendors,
        regionsCount: c._count.regions,
        inquiriesCount,
        bookingsCount
      };
    }));

    res.json({ ok: true, cities: enriched });
  } catch (e) { next(e); }
}

async function createAdminCity(req, res, next) {
  try {
    const { countryId, name, slug, state, timezone, lat, lng, image, description, status, displayOrder } = req.body;

    if (!name || !name.trim()) throw new HttpError(400, 'City name is required', 'ERR_INPUT');
    if (!countryId) throw new HttpError(400, 'Country selection is required', 'ERR_INPUT');

    const cleanSlug = (slug || name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const existing = await prisma.city.findUnique({ where: { slug: cleanSlug } });
    if (existing) throw new HttpError(400, 'City with this slug already exists', 'ERR_DUPLICATE');

    const city = await prisma.city.create({
      data: {
        countryId,
        name: name.trim(),
        slug: cleanSlug,
        state: (state || '').trim() || undefined,
        timezone: (timezone || '').trim() || undefined,
        lat: lat ? parseFloat(lat) : undefined,
        lng: lng ? parseFloat(lng) : undefined,
        image: (image || '').trim() || undefined,
        description: (description || '').trim() || undefined,
        status: status === 'inactive' ? 'inactive' : 'active',
        displayOrder: parseInt(displayOrder || '0', 10) || 0
      },
      include: { country: { select: { name: true, code: true, flag: true } } }
    });

    res.json({ ok: true, city });
  } catch (e) { next(e); }
}

async function updateAdminCity(req, res, next) {
  try {
    const { id } = req.params;
    const { name, state, timezone, lat, lng, image, description, status, displayOrder, countryId } = req.body;

    const data = {};
    if (name !== undefined) {
      data.name = name.trim();
      data.slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    }
    if (state !== undefined) data.state = state.trim();
    if (timezone !== undefined) data.timezone = timezone.trim();
    if (lat !== undefined) data.lat = parseFloat(lat);
    if (lng !== undefined) data.lng = parseFloat(lng);
    if (image !== undefined) data.image = image.trim();
    if (description !== undefined) data.description = description.trim();
    if (status !== undefined) data.status = status === 'inactive' ? 'inactive' : 'active';
    if (displayOrder !== undefined) data.displayOrder = parseInt(displayOrder, 10) || 0;
    if (countryId !== undefined) data.countryId = countryId;

    const city = await prisma.city.update({
      where: { id },
      data,
      include: { country: { select: { name: true, code: true, flag: true } } }
    });

    res.json({ ok: true, city });
  } catch (e) { next(e); }
}

// ---------- REGION MANAGEMENT CONTROLLERS ----------
async function getAdminRegions(req, res, next) {
  try {
    const { cityId } = req.query;
    const where = {};
    if (cityId) where.cityId = cityId;

    const regions = await prisma.region.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        city: { select: { id: true, name: true, slug: true, country: { select: { name: true, flag: true } } } },
        _count: { select: { vendors: true } }
      }
    });

    res.json({ ok: true, regions });
  } catch (e) { next(e); }
}

async function createAdminRegion(req, res, next) {
  try {
    const { cityId, name, status } = req.body;
    if (!name || !name.trim()) throw new HttpError(400, 'Region name is required', 'ERR_INPUT');
    if (!cityId) throw new HttpError(400, 'City selection is required', 'ERR_INPUT');

    const cleanSlug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const region = await prisma.region.create({
      data: {
        cityId,
        name: name.trim(),
        slug: cleanSlug,
        status: status === 'inactive' ? 'inactive' : 'active'
      },
      include: { city: { select: { name: true } } }
    });

    res.json({ ok: true, region });
  } catch (e) { next(e); }
}

async function updateAdminRegion(req, res, next) {
  try {
    const { id } = req.params;
    const { name, status } = req.body;

    const data = {};
    if (name !== undefined) {
      data.name = name.trim();
      data.slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    }
    if (status !== undefined) data.status = status === 'inactive' ? 'inactive' : 'active';

    const region = await prisma.region.update({
      where: { id },
      data
    });

    res.json({ ok: true, region });
  } catch (e) { next(e); }
}

// ---------- COUNTRY PERFORMANCE & TOP CITIES ANALYTICS ----------
async function getCountryPerformanceReport(req, res, next) {
  try {
    const adminAnalytics = require('../services/adminAnalytics.service');
    const countries = await adminAnalytics.getCountryPerformance();
    res.json({ ok: true, countries });
  } catch (e) { next(e); }
}

async function getTopCitiesReport(req, res, next) {
  try {
    const adminAnalytics = require('../services/adminAnalytics.service');
    const { countryCode, limit } = req.query;
    const cities = await adminAnalytics.getTopCitiesPerformance({
      countryCode,
      limit: parseInt(limit || '15', 10)
    });
    res.json({ ok: true, cities });
  } catch (e) { next(e); }
}

module.exports = {
  getAnalytics,
  getVendors,
  createVendor,
  createVenue,
  verifyVendor,
  toggleVendorStatus,
  deleteVendor,
  getUsers,
  createUser,
  toggleUserStatus,
  getBookings,
  createBooking,
  updateBookingStatus,
  refundTransaction,
  cancelVendorSubscription,
  updateVendorSubscription,
  listEmailCampaigns,
  createEmailCampaign,
  listEmailTemplates,
  inviteVendorToClaim,
  bulkInviteVendors,
  getUsers,
  getBookings,
  verifyVendor,
  toggleVendorStatus,
  uploadVendorDocument,
  downloadVendorDocument,
  sendVendorCredentials,
  toggleUserStatus,
  updateBookingStatus,
  createVendor,
  createVenue,
  createUser,
  createBooking,
  deleteVendor,
  updateVendorSubscription,
  updatePlans,
  updateGrowCampaignsPricing,
  getGrowCampaignsStats,
  getEmailCampaignStats,
  getAudienceCount,
  getAudiencePreview,
  sendTestEmail,
  listEmailTemplates,
  getEmailTemplateById,
  createEmailTemplate,
  updateEmailTemplate,
  duplicateEmailTemplate,
  deleteEmailTemplate,
  testEmailTemplate,
  resolveTemplatePreview,
  listEmailCampaigns,
  createEmailCampaign,
  retryFailedEmailCampaign,
  duplicateEmailCampaign,
  deleteEmailCampaign,
  listVendorCategories,
  createVendorCategory,
  deleteVendorCategory,
  listCities,
  createCity,
  deleteCity,
  listSuburbs,
  createSuburb,
  deleteSuburb,
  listEmailWorkflows,
  updateEmailWorkflow,
  getSmtpConfig,
  getLegacyAudienceCount,
  getNotifications,
  adminListBlogs,
  createBlog,
  updateBlog,
  // Location & Country Management Controllers
  getCountries,
  createCountry,
  updateCountry,
  getCountryById,
  getAdminCities,
  createAdminCity,
  updateAdminCity,
  getAdminRegions,
  createAdminRegion,
  updateAdminRegion,
  getCountryPerformanceReport,
  getTopCitiesReport,
};
