const prisma = require('../config/db');
const { HttpError } = require('../middleware/error');
const { slugify, uniqueSlug } = require('../utils/slug');

/**
 * Get all users and their details (Admins only)
 */
async function getUsersReport() {
  const users = await prisma.user.findMany({
    include: {
      couple: true,
      vendor: { select: { businessName: true, category: true, city: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  return users.map(u => ({
    id: u.id,
    phone: u.phone,
    role: u.role,
    name: u.name || '—',
    email: u.email || '—',
    createdAt: u.createdAt,
    partnerName: u.couple?.partnerName || '—',
    weddingDate: u.couple?.weddingDate ? u.couple.weddingDate.toISOString().slice(0, 10) : '—',
    city: u.couple?.city || u.vendor?.city || '—',
    budgetMin: u.couple?.budgetMin || '—',
    budgetMax: u.couple?.budgetMax || '—',
    guestCount: u.couple?.guestCount || '—',
    vibe: u.couple?.vibe || '—',
    associatedBusiness: u.vendor?.businessName || '—',
    verified: u.verifiedAt ? 'Yes' : 'No'
  }));
}

/**
 * Get all vendors and their details (Admins only)
 */
async function getVendorsReport() {
  const vendors = await prisma.vendor.findMany({
    include: {
      user: { select: { email: true, phone: true, verifiedAt: true } },
      _count: { select: { inquiries: true, bookings: true, photos: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  return vendors.map(v => ({
    id: v.id,
    businessName: v.businessName,
    slug: v.slug,
    category: v.category,
    city: v.city,
    area: v.area || '—',
    address: v.address || '—',
    pincode: v.pincode || '—',
    whatsappNumber: v.whatsappNumber || '—',
    ownerEmail: v.user?.email || '—',
    ownerPhone: v.user?.phone || '—',
    priceMin: v.priceMin || 0,
    priceMax: v.priceMax || 0,
    capacity: v.capacity || 0,
    rating: v.rating,
    ratingCount: v.ratingCount,
    tier: v.tier,
    isVerified: v.isVerified ? 'Yes' : 'No',
    isProfileComplete: v.isProfileComplete ? 'Yes' : 'No',
    photoCount: v._count.photos,
    inquiryCount: v._count.inquiries,
    bookingCount: v._count.bookings,
    createdAt: v.createdAt
  }));
}

/**
 * Get all booking records (Admins only)
 */
async function getBookingsReport() {
  const bookings = await prisma.booking.findMany({
    include: {
      couple: { include: { user: { select: { phone: true, name: true } } } },
      vendor: { select: { businessName: true, category: true, city: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  return bookings.map(b => ({
    id: b.id,
    coupleName: b.couple?.user?.name || '—',
    couplePhone: b.couple?.user?.phone || '—',
    vendorName: b.vendor?.businessName || '—',
    vendorCategory: b.vendor?.category || '—',
    vendorCity: b.vendor?.city || '—',
    eventDate: b.eventDate ? b.eventDate.toISOString().slice(0, 10) : '—',
    amount: b.amount ? b.amount : 0,
    status: b.status,
    notes: b.notes || '—',
    createdAt: b.createdAt
  }));
}

/**
 * Get all transactions/payments (Admins only)
 */
async function getPaymentsReport() {
  const txns = await prisma.transaction.findMany({
    include: {
      user: { select: { name: true, phone: true, email: true, role: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  return txns.map(t => ({
    id: t.id,
    userName: t.user?.name || '—',
    userPhone: t.user?.phone || '—',
    userEmail: t.user?.email || '—',
    userRole: t.user?.role || '—',
    amount: t.amount / 100, // convert paise to INR
    purpose: t.purpose,
    gateway: t.gateway,
    gatewayRef: t.gatewayRef || '—',
    status: t.status,
    createdAt: t.createdAt
  }));
}

/**
 * Get all leads and inquiries (Admins only)
 */
async function getLeadsReport() {
  const inquiries = await prisma.inquiry.findMany({
    include: {
      vendor: { select: { businessName: true, category: true, city: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  return inquiries.map(i => ({
    id: i.id,
    vendorName: i.vendor?.businessName || '—',
    vendorCategory: i.vendor?.category || '—',
    vendorCity: i.vendor?.city || '—',
    coupleName: i.name,
    couplePhone: i.phone,
    coupleEmail: i.email || '—',
    eventDate: i.eventDate ? i.eventDate.toISOString().slice(0, 10) : '—',
    guests: i.guests || '—',
    budget: i.budget || '—',
    notes: i.notes || '—',
    source: i.source || 'public_site',
    status: i.status,
    forwardedAt: i.forwardedAt ? i.forwardedAt.toISOString().slice(0, 19).replace('T', ' ') : '—',
    createdAt: i.createdAt
  }));
}

/**
 * Compile aggregate financial reports (Admins only)
 */
async function getRevenueReport() {
  const transactions = await prisma.transaction.findMany({
    where: { status: 'success' },
    select: { amount: true, purpose: true, createdAt: true }
  });

  // Calculate Aggregates
  let totalRevenue = 0;
  let featuredUpgradeRevenue = 0;
  let adCreditsRevenue = 0;
  let otherRevenue = 0;

  const monthlyBreakdown = {};
  const dailyBreakdown = {};

  for (const t of transactions) {
    const amt = t.amount / 100; // Paise to INR
    totalRevenue += amt;

    if (t.purpose === 'featured_upgrade') {
      featuredUpgradeRevenue += amt;
    } else if (t.purpose === 'ad_credits') {
      adCreditsRevenue += amt;
    } else {
      otherRevenue += amt;
    }

    // Monthly bucket: YYYY-MM
    const month = t.createdAt.toISOString().slice(0, 7);
    monthlyBreakdown[month] = (monthlyBreakdown[month] || 0) + amt;

    // Daily bucket: YYYY-MM-DD
    const day = t.createdAt.toISOString().slice(0, 10);
    dailyBreakdown[day] = (dailyBreakdown[day] || 0) + amt;
  }

  return {
    aggregates: {
      totalRevenue,
      featuredUpgradeRevenue,
      adCreditsRevenue,
      otherRevenue,
      totalTxnCount: transactions.length
    },
    monthly: Object.entries(monthlyBreakdown).map(([month, val]) => ({ month, revenue: val })),
    daily: Object.entries(dailyBreakdown).map(([day, val]) => ({ day, revenue: val }))
  };
}

/**
 * Get general platform growth and category analytics (Admins only)
 */
async function getPlatformAnalytics() {
  const [vendorsCount, couplesCount, totalInquiries, successfulTxnsCount] = await Promise.all([
    prisma.vendor.count(),
    prisma.couple.count(),
    prisma.inquiry.count(),
    prisma.transaction.count({ where: { status: 'success' } })
  ]);

  // Aggregate category demand based on Inquiries
  const categoryDemandData = await prisma.inquiry.findMany({
    include: { vendor: { select: { category: true } } }
  });

  const categoryCounts = {};
  let totalValidInquiries = 0;
  for (const i of categoryDemandData) {
    if (i.vendor?.category) {
      categoryCounts[i.vendor.category] = (categoryCounts[i.vendor.category] || 0) + 1;
      totalValidInquiries++;
    }
  }

  const categoryDemand = Object.entries(categoryCounts).map(([category, count]) => ({
    category,
    count,
    percentage: totalValidInquiries > 0 ? Math.round((count / totalValidInquiries) * 100) : 0
  }));

  // Aggregated Monthly Couple Signups
  const users = await prisma.user.findMany({
    where: { role: 'couple' },
    select: { createdAt: true }
  });

  const signupsByMonth = {};
  for (const u of users) {
    const month = u.createdAt.toISOString().slice(0, 7);
    signupsByMonth[month] = (signupsByMonth[month] || 0) + 1;
  }

  const userGrowth = Object.entries(signupsByMonth).map(([month, count]) => ({
    month,
    count
  })).sort((a, b) => a.month.localeCompare(b.month));

  return {
    counters: {
      vendorsCount,
      couplesCount,
      totalInquiries,
      successfulTxnsCount
    },
    categoryDemand,
    userGrowth
  };
}

/**
 * Get inquiries filtered for a specific vendor
 */
async function getVendorLeads(vendorUserId, vendorId = null) {
  let vendor;
  if (vendorId) {
    vendor = await prisma.vendor.findFirst({ where: { id: vendorId, userId: vendorUserId } });
  }
  if (!vendor) {
    vendor = await prisma.vendor.findFirst({ where: { userId: vendorUserId } });
  }
  if (!vendor) throw new HttpError(404, 'Vendor profile not found', 'ERR_NO_VENDOR');

  const inquiries = await prisma.inquiry.findMany({
    where: { vendorId: vendor.id },
    orderBy: { createdAt: 'desc' }
  });

  return inquiries.map(i => ({
    id: i.id,
    name: i.name,
    phone: i.phone,
    email: i.email || '—',
    eventDate: i.eventDate ? i.eventDate.toISOString().slice(0, 10) : '—',
    guests: i.guests || '—',
    budget: i.budget || '—',
    callDiscussion: i.callDiscussion || '—',
    notes: i.notes || '—',
    source: i.source || 'public_site',
    status: i.status,
    forwardedAt: i.forwardedAt ? i.forwardedAt.toISOString().slice(0, 19).replace('T', ' ') : '—',
    createdAt: i.createdAt
  }));
}

/**
 * Get bookings filtered for a specific vendor
 */
async function getVendorBookings(vendorUserId, vendorId = null) {
  let vendor;
  if (vendorId) {
    vendor = await prisma.vendor.findFirst({ where: { id: vendorId, userId: vendorUserId } });
  }
  if (!vendor) {
    vendor = await prisma.vendor.findFirst({ where: { userId: vendorUserId } });
  }
  if (!vendor) throw new HttpError(404, 'Vendor profile not found', 'ERR_NO_VENDOR');

  const bookings = await prisma.booking.findMany({
    where: { vendorId: vendor.id },
    include: { couple: { include: { user: { select: { phone: true, name: true } } } } },
    orderBy: { eventDate: 'desc' }
  });

  return bookings.map(b => ({
    id: b.id,
    customerName: b.couple?.user?.name || '—',
    customerPhone: b.couple?.user?.phone || '—',
    eventDate: b.eventDate ? b.eventDate.toISOString().slice(0, 10) : '—',
    amount: b.amount || 0,
    status: b.status,
    notes: b.notes || '—',
    createdAt: b.createdAt
  }));
}

/**
 * Bulk Import Vendors (Admins only)
 */
async function bulkImportVendors(vendors) {
  if (!Array.isArray(vendors) || !vendors.length) {
    throw new HttpError(400, 'Invalid vendors import dataset', 'ERR_INPUT');
  }

  const results = { created: 0, updated: 0, errors: [] };

  for (let idx = 0; idx < vendors.length; idx++) {
    const row = vendors[idx];
    const lineNum = idx + 2; // spreadsheet 1-indexed header

    try {
      const name = String(row.businessName || '').trim();
      const category = String(row.category || '').trim();
      const city = String(row.city || '').trim();
      const phone = String(row.whatsappNumber || '').replace(/[^0-9]/g, '');

      if (!name) throw new Error('Missing businessName');
      if (!category) throw new Error('Missing category');
      if (!city) throw new Error('Missing city');
      if (!phone || phone.length < 10) throw new Error('Invalid or missing WhatsApp number');

      const formattedPhone = phone.startsWith('91') && phone.length === 12 ? phone : `91${phone.slice(-10)}`;

      // 1. Check or create Vendor User account
      let user = await prisma.user.findFirst({
        where: { phone: formattedPhone }
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            phone: formattedPhone,
            role: 'vendor',
            name: name
          }
        });
      } else if (user.role !== 'vendor' && user.role !== 'admin') {
        // Upgrade role if they were only a basic user/couple
        user = await prisma.user.update({
          where: { id: user.id },
          data: { role: 'vendor' }
        });
      }

      // 2. Slugify the listing
      const categorySlug = slugify(category);
      const citySlug = slugify(city);

      // 3. Find if Vendor listing exists (either owned by user or matches slug)
      const testSlug = slugify(`${name}-${city}`);
      let existingVendor = await prisma.vendor.findFirst({
        where: {
          OR: [
            { userId: user.id },
            { slug: testSlug }
          ]
        }
      });

      const vendorData = {
        businessName: name,
        category,
        categorySlug,
        city,
        citySlug,
        area: row.area ? String(row.area).trim() : null,
        address: row.address ? String(row.address).trim() : null,
        pincode: row.pincode ? String(row.pincode).trim() : null,
        priceMin: row.priceMin ? parseInt(row.priceMin, 10) || null : null,
        priceMax: row.priceMax ? parseInt(row.priceMax, 10) || null : null,
        capacity: row.capacity ? parseInt(row.capacity, 10) || null : null,
        services: row.services ? String(row.services).split(',').map(s => s.trim()).filter(Boolean) : [],
        tier: row.tier === 'featured' ? 'featured' : 'basic',
        isVerified: row.isVerified === true || String(row.isVerified).toLowerCase() === 'true' || String(row.isVerified).toLowerCase() === 'yes',
        whatsappNumber: formattedPhone
      };

      if (existingVendor) {
        await prisma.vendor.update({
          where: { id: existingVendor.id },
          data: vendorData
        });
        results.updated++;
      } else {
        const finalSlug = await uniqueSlug(prisma, 'vendor', `${name}-${city}`);
        await prisma.vendor.create({
          data: {
            ...vendorData,
            slug: finalSlug,
            userId: user.id,
            rating: row.rating ? parseFloat(row.rating) || 4.5 : 4.5,
            ratingCount: row.ratingCount ? parseInt(row.ratingCount, 10) || 0 : 0
          }
        });
        results.created++;
      }
    } catch (err) {
      results.errors.push({ row: lineNum, message: err.message });
    }
  }

  return results;
}

/**
 * Bulk Import Users (Admins only)
 */
async function bulkImportUsers(users) {
  if (!Array.isArray(users) || !users.length) {
    throw new HttpError(400, 'Invalid users import dataset', 'ERR_INPUT');
  }

  const results = { created: 0, updated: 0, errors: [] };

  for (let idx = 0; idx < users.length; idx++) {
    const row = users[idx];
    const lineNum = idx + 2;

    try {
      const rawPhone = String(row.phone || '').replace(/[^0-9]/g, '');
      const role = String(row.role || 'couple').toLowerCase().trim();
      const name = row.name ? String(row.name).trim() : null;
      const email = row.email ? String(row.email).toLowerCase().trim() : null;

      if (!rawPhone || rawPhone.length < 10) throw new Error('Invalid or missing phone number');
      const formattedPhone = rawPhone.startsWith('91') && rawPhone.length === 12 ? rawPhone : `91${rawPhone.slice(-10)}`;

      const validRoles = ['admin', 'vendor', 'couple'];
      if (!validRoles.includes(role)) throw new Error(`Invalid role '${role}'. Must be admin, vendor, or couple`);

      // Find user
      let user = await prisma.user.findUnique({
        where: { phone: formattedPhone }
      });

      const userData = {
        name,
        email,
        role: role
      };

      if (user) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: userData
        });
        results.updated++;
      } else {
        user = await prisma.user.create({
          data: {
            phone: formattedPhone,
            ...userData
          }
        });
        results.created++;
      }

      // If role is couple, upsert the Couple record
      if (role === 'couple') {
        const weddingDate = row.weddingDate ? new Date(row.weddingDate) : null;
        if (weddingDate && isNaN(weddingDate.getTime())) {
          throw new Error('Invalid wedding date format. Use YYYY-MM-DD');
        }

        const coupleData = {
          partnerName: row.partnerName ? String(row.partnerName).trim() : null,
          weddingDate,
          city: row.city ? String(row.city).trim() : null,
          citySlug: row.city ? slugify(row.city) : null,
          budgetMin: row.budgetMin ? parseInt(row.budgetMin, 10) || null : null,
          budgetMax: row.budgetMax ? parseInt(row.budgetMax, 10) || null : null,
          guestCount: row.guestCount ? parseInt(row.guestCount, 10) || null : null,
          vibe: row.vibe ? String(row.vibe).trim() : null,
          notes: row.notes ? String(row.notes).trim() : null
        };

        const existingCouple = await prisma.couple.findUnique({ where: { userId: user.id } });
        if (existingCouple) {
          await prisma.couple.update({ where: { userId: user.id }, data: coupleData });
        } else {
          await prisma.couple.create({ data: { userId: user.id, ...coupleData } });
        }
      }
    } catch (err) {
      results.errors.push({ row: lineNum, message: err.message });
    }
  }

  return results;
}

/**
 * Bulk Import Bookings (Admins only)
 */
async function bulkImportBookings(bookings) {
  if (!Array.isArray(bookings) || !bookings.length) {
    throw new HttpError(400, 'Invalid bookings import dataset', 'ERR_INPUT');
  }

  const results = { created: 0, updated: 0, errors: [] };

  for (let idx = 0; idx < bookings.length; idx++) {
    const row = bookings[idx];
    const lineNum = idx + 2;

    try {
      const couplePhone = String(row.couplePhone || '').replace(/[^0-9]/g, '');
      const vendorSlug = String(row.vendorSlug || '').trim();
      const rawDate = row.eventDate;
      const amount = row.amount ? parseInt(row.amount, 10) || null : null;
      const status = String(row.status || 'pending').toLowerCase().trim();

      if (!couplePhone || couplePhone.length < 10) throw new Error('Invalid or missing couple phone');
      if (!vendorSlug) throw new Error('Missing vendorSlug');
      if (!rawDate) throw new Error('Missing eventDate');

      const formattedCouplePhone = couplePhone.startsWith('91') && couplePhone.length === 12 ? couplePhone : `91${couplePhone.slice(-10)}`;
      const eventDate = new Date(rawDate);
      if (isNaN(eventDate.getTime())) throw new Error('Invalid eventDate format. Use YYYY-MM-DD');

      const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed'];
      if (!validStatuses.includes(status)) throw new Error(`Invalid status '${status}'. Must be pending, confirmed, cancelled, or completed`);

      // 1. Find Couple User
      const coupleUser = await prisma.user.findFirst({
        where: { phone: formattedCouplePhone, role: 'couple' },
        include: { couple: true }
      });
      if (!coupleUser || !coupleUser.couple) {
        throw new Error(`No couple account associated with phone number ${formattedCouplePhone}`);
      }

      // 2. Find Vendor listing
      const vendor = await prisma.vendor.findUnique({
        where: { slug: vendorSlug }
      });
      if (!vendor) {
        throw new Error(`No vendor listing found with slug/ID '${vendorSlug}'`);
      }

      // 3. Check if exact booking already exists (same couple, vendor, date)
      const existingBooking = await prisma.booking.findFirst({
        where: {
          coupleId: coupleUser.couple.id,
          vendorId: vendor.id,
          eventDate
        }
      });

      const bookingData = {
        amount,
        status: status,
        notes: row.notes ? String(row.notes).trim() : null
      };

      if (existingBooking) {
        await prisma.booking.update({
          where: { id: existingBooking.id },
          data: bookingData
        });
        results.updated++;
      } else {
        await prisma.booking.create({
          data: {
            coupleId: coupleUser.couple.id,
            vendorId: vendor.id,
            eventDate,
            ...bookingData
          }
        });
        results.created++;
      }
    } catch (err) {
      results.errors.push({ row: lineNum, message: err.message });
    }
  }

  return results;
}

module.exports = {
  getUsersReport,
  getVendorsReport,
  getBookingsReport,
  getPaymentsReport,
  getLeadsReport,
  getRevenueReport,
  getPlatformAnalytics,
  getVendorLeads,
  getVendorBookings,
  bulkImportVendors,
  bulkImportUsers,
  bulkImportBookings
};
