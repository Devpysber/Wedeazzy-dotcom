/**
 * Admin-only platform management: dashboard metrics, vendor/user/booking
 * moderation, and direct vendor/venue creation. All routes are gated behind
 * requireAuth + requireRole('admin') at the router level (admin.routes.js).
 */

const prisma = require('../config/db');
const { HttpError } = require('../middleware/error');
const { slugify, uniqueSlug } = require('../utils/slug');
const { sanitizeFields } = require('../utils/sanitize');
const { sendMail } = require('../services/email.service');
const logger = require('../config/logger');
const { getVendorCategories, saveVendorCategories } = require('../config/vendorCategoriesConfig');
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
    const list = await prisma.vendor.findMany({
      include: {
        user: { select: { name: true, email: true, phone: true } },
        _count: { select: { photos: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 1000 // safety cap — unbounded findMany on an admin-facing list doesn't scale
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
      address: `${v.city || ''}, ${v.area || ''}`,
      subscriptionPlan: v.subscriptionPlan,
      tier: v.tier,
      subscriptionExpiry: v.subscriptionExpiry,
      photoCount: v._count?.photos || 0,
      createdAt: v.createdAt.toISOString()
    }));

    res.json({ ok: true, vendors });
  } catch (e) { next(e); }
}

/**
 * Fetch all registered platform users
 */
async function getUsers(req, res, next) {
  try {
    const list = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 1000 // safety cap — unbounded findMany on an admin-facing list doesn't scale
    });

    const users = list.map(u => ({
      id: u.id,
      name: u.name || 'Anonymous User',
      email: u.email || u.phone || '—',
      role: u.role === 'couple' ? 'Customer' : u.role.toUpperCase(),
      status: u.suspendedAt ? 'inactive' : 'active',
      joinDate: u.createdAt.toISOString().split('T')[0]
    }));

    res.json({ ok: true, users });
  } catch (e) { next(e); }
}

/**
 * Fetch all system bookings
 */
async function getBookings(req, res, next) {
  try {
    const list = await prisma.booking.findMany({
      include: {
        couple: { include: { user: { select: { name: true, phone: true } } } },
        vendor: { select: { businessName: true, category: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 1000 // safety cap — unbounded findMany on an admin-facing list doesn't scale
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

    res.json({ ok: true, bookings });
  } catch (e) { next(e); }
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
      data: { isVerified: !!isVerified }
    });

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
      data: { isActive: !!isActive }
    });

    res.json({ ok: true, vendor });
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
      data: { status }
    });

    res.json({ ok: true, booking });
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
    const { name, location, capacity, price, contact } = req.body;

    if (!name || !location || !capacity || !price || !contact) {
      throw new HttpError(400, 'Name, location, capacity, price and contact are required', 'ERR_INPUT');
    }

    const formattedPhone = formatAdminPhone(contact);

    let user = await prisma.user.findFirst({
      where: { phone: formattedPhone },
      include: { vendor: true }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
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
        capacity: parseInt(capacity, 10) || 0,
        priceMin: parseInt(price, 10) || 0,
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
        amount: (budget !== undefined && budget !== null && budget !== '') ? Math.round(Number(budget)) : null,
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
      if (result.ok) sentCount += 1;
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
    if (!VALID_EMAIL_SEGMENTS.includes(segment)) {
      throw new HttpError(400, `Segment must be one of: ${VALID_EMAIL_SEGMENTS.join(', ')}`, 'ERR_INPUT');
    }

    const where = { email: { not: null } };
    if (segment === 'vendors') where.role = 'vendor';
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
  getNotifications,
  adminListBlogs,
  createBlog,
  updateBlog,
};
