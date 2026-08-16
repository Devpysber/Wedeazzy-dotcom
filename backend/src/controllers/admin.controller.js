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
 * Get aggregated administrative dashboard metrics
 */
async function getAnalytics(req, res, next) {
  try {
    const [
      pendingBookings,
      confirmedBookings,
      cancelledBookings,
      venuesCount,
      vendorsCount,
      usersCount,
      businessClaims,
      categoryGroups,
      cityGroups
    ] = await Promise.all([
      prisma.booking.count({ where: { status: 'pending' } }),
      prisma.booking.count({ where: { status: 'confirmed' } }),
      prisma.booking.count({ where: { status: 'cancelled' } }),
      prisma.vendor.count({ where: { category: 'Banquet Halls' } }),
      prisma.vendor.count(),
      prisma.user.count(),
      prisma.vendor.count({ where: { isVerified: false, isActive: true } }),
      prisma.vendor.groupBy({ by: ['categorySlug'], where: { isActive: true } }),
      prisma.vendor.groupBy({ by: ['citySlug'], where: { isActive: true } })
    ]);

    // Format metrics matching frontend's DEFAULT_MOCK_DATA structure
    res.json({
      ok: true,
      stats: {
        pendingBookings,
        inProgressBookings: pendingBookings,
        confirmedBookings,
        cancelledBookings,
        venuesCount,
        vendorsCount,
        servicesCount: categoryGroups.length,
        usersCount,
        businessClaims,
        regionsCount: cityGroups.length,
        citiesCount: cityGroups.length
      }
    });
  } catch (e) { next(e); }
}

/**
 * Fetch all registered vendors
 */
async function getVendors(req, res, next) {
  try {
    const totalCount = await prisma.vendor.count();
    const list = await prisma.vendor.findMany({
      include: {
        user: { select: { name: true, email: true, phone: true, lastLogin: true } },
        _count: { select: { photos: true } }
      },
      orderBy: { createdAt: 'desc' },
      // Raised from a 1000-row cap that silently hid the majority of a
      // 13,000+ vendor/venue table from the admin panel. Still bounded
      // (not unbounded findMany) to protect against pathological growth.
      take: 20000
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
      // hasOwner distinguishes a truly-unclaimed seeded listing (no signup
      // at all yet) from one where a vendor has signed up and is merely
      // awaiting admin KYC verification — `claims` above conflates both
      // into "Claim Requested", but the Invitations page needs the former.
      hasOwner: !!v.userId,
      invitedAt: v.invitedAt ? v.invitedAt.toISOString() : null,
      invitedChannel: v.invitedChannel || null,
      address: `${v.city || ''}, ${v.area || ''}`,
      // Discrete city/area alongside the pre-joined `address` string: the
      // Approve Businesses filters and the CRM dashboard charts group by city,
      // and splitting the joined string back apart client-side breaks on any
      // city or area that itself contains a comma.
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
      // Always the authenticated download route, never the raw stored value
      // — kycDocumentUrl in the DB is now just a filename (or, for records
      // created before this fix, a legacy public /api/uploads URL); either
      // way the frontend must never see a directly-fetchable path to a
      // private KYC document. downloadVendorDocument resolves the actual
      // file server-side after checking admin auth.
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
        .sendWa({ to: phone, body: message, template: 'claim_invitation' })
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
          .sendWa({ to: phone, body: message, template: 'claim_invitation' })
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
    const { plans } = req.body;
    if (!plans) {
      throw new HttpError(400, 'Plans data is required', 'ERR_BAD_REQUEST');
    }
    require('fs').writeFileSync(
      require('path').join(__dirname, '../config/plans.json'),
      JSON.stringify(plans, null, 2),
      'utf8'
    );
    try {
      require('../config/plansConfig').clearPlansCache();
    } catch (_) {}
    res.json({ ok: true, message: 'Plans updated successfully' });
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
    const { pricing } = req.body || {};
    if (!pricing || typeof pricing !== 'object') {
      throw new HttpError(400, 'Pricing data is required', 'ERR_BAD_REQUEST');
    }

    const current = getGrowCampaignsPricing();
    const updated = {};
    for (const key of Object.keys(current)) {
      const incomingPlans = pricing[key] && Array.isArray(pricing[key].plans) ? pricing[key].plans : null;
      updated[key] = {
        plans: current[key].plans.map((tier, idx) => {
          const incoming = incomingPlans && incomingPlans[idx];
          const price = incoming && incoming.price !== '' && Number.isFinite(Number(incoming.price))
            ? Math.max(0, Math.round(Number(incoming.price)))
            : tier.price;
          // original (strikethrough price) is optional per tier — leave untouched unless a valid new value was sent.
          const original = incoming && incoming.original !== '' && incoming.original != null && Number.isFinite(Number(incoming.original))
            ? Math.max(0, Math.round(Number(incoming.original)))
            : tier.original;
          const merged = { ...tier, price };
          if (original) merged.original = original; else delete merged.original;
          return merged;
        }),
      };
    }

    saveGrowCampaignsPricing(updated);
    res.json({ ok: true, pricing: updated, message: 'Grow Campaigns pricing updated successfully' });
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

/**
 * Sends one campaign's emails in the background, spaced out to respect
 * Hostinger SMTP's hourly send cap. Runs after the HTTP response has already
 * gone out, so failures here only update the campaign row, not the request.
 */
async function runEmailBroadcast(campaignId, recipients, subject, body) {
  const html = `<div style="font-family: sans-serif; white-space: pre-wrap;">${escapeHtml(body)}</div>`;
  let sentCount = 0;
  let failedCount = 0;

  for (const to of recipients) {
    try {
      const result = await sendMail({ to, subject, html, text: body });
      // `fallback: true` means SMTP isn't configured and nothing was actually
      // delivered (see email.service.js) — don't count that as a real send.
      if (result.ok && !result.fallback) sentCount += 1;
      else failedCount += 1;
    } catch (err) {
      failedCount += 1;
      logger.error({ err, to, campaignId }, 'Broadcast email failed to send');
    }
    await new Promise((resolve) => setTimeout(resolve, EMAIL_BROADCAST_DELAY_MS));
  }

  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: {
      sentCount,
      failedCount,
      status: failedCount === 0 ? 'completed' : (sentCount === 0 ? 'failed' : 'partial'),
    },
  }).catch((err) => logger.error({ err, campaignId }, 'Failed to update email campaign status'));
}

/**
 * Admin: create and dispatch a bulk email broadcast to a segmented audience.
 * Responds immediately with the created campaign; actual sending happens in
 * the background since a few hundred recipients can take minutes at a
 * rate-limit-safe pace.
 */
async function createEmailCampaign(req, res, next) {
  try {
    const { name, segment, subject, body } = req.body || {};

    if (!name || !subject || !body) {
      throw new HttpError(400, 'Campaign name, subject, and body are required', 'ERR_INPUT');
    }
    // "vendor_category:<slug>" targets vendors in one specific service category.
    const isVendorCategorySegment = typeof segment === 'string' && segment.startsWith('vendor_category:');
    if (!VALID_EMAIL_SEGMENTS.includes(segment) && !isVendorCategorySegment) {
      throw new HttpError(400, `Segment must be one of: ${VALID_EMAIL_SEGMENTS.join(', ')}, or vendor_category:<slug>`, 'ERR_INPUT');
    }

    const where = { email: { not: null } };
    if (isVendorCategorySegment) {
      const categorySlug = segment.slice('vendor_category:'.length);
      if (!categorySlug) {
        throw new HttpError(400, 'A vendor category must be selected', 'ERR_INPUT');
      }
      where.role = 'vendor';
      where.vendor = { some: { categorySlug } };
    } else if (segment === 'vendors') where.role = 'vendor';
    else if (segment === 'couples') where.role = 'couple';
    else where.role = { not: 'admin' }; // "all" = every marketing-eligible account, not internal admins

    const recipients = await prisma.user.findMany({ where, select: { email: true } });
    const emails = recipients.map((r) => r.email).filter(Boolean);

    const campaign = await prisma.emailCampaign.create({
      data: {
        name,
        segment,
        subject,
        body,
        totalRecipients: emails.length,
        status: 'sending',
      },
    });

    res.status(201).json({ ok: true, campaign });

    // Fire-and-forget: don't make the admin's request wait on the full send.
    runEmailBroadcast(campaign.id, emails, subject, body).catch((err) =>
      logger.error({ err, campaignId: campaign.id }, 'Email broadcast run crashed')
    );
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: list recent bulk email campaigns for the history panel.
 */
async function listEmailCampaigns(req, res, next) {
  try {
    const campaigns = await prisma.emailCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ ok: true, campaigns });
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
async function getAudienceCount(req, res, next) {
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

module.exports = {
  getAnalytics,
  getVendors,
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
  refundTransaction,
  cancelVendorSubscription,
  deleteVendor,
  updateVendorSubscription,
  updatePlans,
  createEmailCampaign,
  listEmailCampaigns,
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
  getAudienceCount,
  inviteVendorToClaim,
  bulkInviteVendors,
  updateGrowCampaignsPricing,
  getNotifications,
  adminListBlogs,
  createBlog,
  updateBlog,
};
