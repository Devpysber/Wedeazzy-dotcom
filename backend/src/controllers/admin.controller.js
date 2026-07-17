/**
 * Admin-only platform management: dashboard metrics, vendor/user/booking
 * moderation, and direct vendor/venue creation. All routes are gated behind
 * requireAuth + requireRole('admin') at the router level (admin.routes.js).
 */

const prisma = require('../config/db');
const { HttpError } = require('../middleware/error');
const { slugify, uniqueSlug } = require('../utils/slug');
const { sanitizeFields } = require('../utils/sanitize');
const paymentController = require('./payment.controller');
const refundTransaction = paymentController.refundTransaction;
const cancelVendorSubscription = paymentController.cancelVendorSubscription;

// Valid enum values for validation
const VALID_BOOKING_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed'];

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
  updatePlans
};
