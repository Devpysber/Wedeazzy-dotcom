/**
 * Vendor profile service — signup/attach, profile editing, photo management,
 * and the vendor dashboard read model. Profile completion percentage drives
 * `isProfileComplete`, which gates the Featured-plan upgrade elsewhere.
 */

const prisma = require('../config/db');
const { HttpError } = require('../middleware/error');
const { slugify, uniqueSlug } = require('../utils/slug');
const { sendTemplate } = require('./whatsapp.service');
const env = require('../config/env');

/** Weighted profile-completeness check used for `isProfileComplete` and dashboard progress bars. */
function computeCompletion(v) {
  const checks = [
    // 1. Personal Information (whatsapp, city, pincode)
    !!v.whatsappNumber && !!v.city && !!v.pincode,
    // 2. Business Information (businessName, address, description >= 40 chars)
    !!v.businessName && !!v.address && (!!v.description && v.description.length >= 40),
    // 3. Category
    !!v.category,
    // 4. Gallery (at least 3 photos)
    !!v.photos && v.photos.length >= 3,
    // 5. Pricing
    !!v.priceMin && v.priceMin > 0,
    // 6. Business Timings
    !!v.businessTimings && v.businessTimings.trim().length > 0,
    // 7. Social Links
    (!!v.website || !!v.instagram || !!v.facebook || !!v.youtube)
  ];
  const done = checks.filter(Boolean).length;
  return Math.round((done / checks.length) * 100);
}

async function signupOrAttach(user, payload) {
  // Count existing businesses
  const existingBusinesses = await prisma.vendor.findMany({
    where: { userId: user.id }
  });

  // Determine active plan tier (highest plan of existing listings, default to "Free")
  let activePlan = 'Free';
  for (const b of existingBusinesses) {
    if (b.subscriptionPlan === 'Featured') activePlan = 'Featured';
    else if (b.subscriptionPlan === 'Premium' && activePlan !== 'Featured') activePlan = 'Premium';
  }

  // Load plans configuration
  let planLimits = { Free: 1, Premium: 3, Featured: 7 };
  try {
    const config = require('../config/plansConfig').getPlansConfig();
    planLimits = {
      Free: config.Free?.maxBusinesses || 1,
      Premium: config.Premium?.maxBusinesses || 3,
      Featured: config.Featured?.maxBusinesses || 7
    };
  } catch (err) {}

  const limit = planLimits[activePlan] || 1;

  if (existingBusinesses.length >= limit) {
    const upgradeMsg = activePlan === 'Free'
      ? ' Upgrade to Premium to add more businesses.'
      : activePlan === 'Premium'
        ? ' Upgrade to Featured to add more businesses.'
        : '';
    throw new HttpError(403, `Your current plan allows a maximum of ${limit} business listing${limit > 1 ? 's' : ''}.${upgradeMsg}`, 'ERR_LIMIT_EXCEEDED');
  }

  const businessName = String(payload.businessName || '').trim();
  const category = String(payload.category || '').trim();
  const city = String(payload.city || '').trim();
  if (!businessName) throw new HttpError(400, 'Business name is required', 'ERR_INPUT');
  if (!category)     throw new HttpError(400, 'Pick a category',          'ERR_INPUT');
  if (!city)         throw new HttpError(400, 'Pick a city',              'ERR_INPUT');

  const slug = await uniqueSlug(prisma, 'vendor', businessName + '-' + city);

  const vendor = await prisma.vendor.create({
    data: {
      userId: user.id,
      businessName,
      slug,
      category,
      categorySlug: slugify(category),
      city,
      citySlug: slugify(city),
      subscriptionPlan: activePlan,
    },
  });

  // Skip if dummy Google phone placeholder
  if (user.phone && !user.phone.startsWith('google_')) {
    sendTemplate(user.phone, 'vendor_welcome', {
      name: user.name || 'there',
      businessName,
      city,
      loginUrl: `${env.PUBLIC_BASE_URL}/dashboard`,
    }).catch(() => {});
  }

  return vendor;
}

async function updateProfile(user, patch, vendorId = null) {
  const v = await prisma.vendor.findFirst({
    where: { id: vendorId || undefined, userId: user.id },
    include: { photos: true }
  }) || await prisma.vendor.findFirst({
    where: { userId: user.id },
    include: { photos: true }
  });
  if (!v) throw new HttpError(404, 'Create your vendor profile first', 'ERR_NO_VENDOR');

  // Synchronize Personal Information directly to the User table
  if (patch.name !== undefined || patch.email !== undefined) {
    const userData = {};
    if (patch.name !== undefined) userData.name = patch.name.trim();
    if (patch.email !== undefined) userData.email = patch.email.trim();

    await prisma.user.update({
      where: { id: user.id },
      data: userData,
    });
  }

  const allowed = [
    'businessName', 'category', 'city', 'area', 'address', 'pincode',
    'googleCid', 'description', 'priceMin', 'priceMax', 'capacity',
    'services', 'whatsappNumber',
    'alternateMobile', 'website', 'instagram', 'facebook', 'youtube', 'businessTimings',
    'yearsExperience', 'teamSize', 'serviceAreas', 'languagesSpoken', 'acceptsDestination', 'googleBusiness'
  ];
  const data = {};
  for (const k of allowed) if (patch[k] !== undefined) data[k] = patch[k];
  if (data.yearsExperience !== undefined) data.yearsExperience = data.yearsExperience === '' ? null : parseInt(data.yearsExperience, 10) || null;
  if (data.teamSize !== undefined) data.teamSize = data.teamSize === '' ? null : parseInt(data.teamSize, 10) || null;
  if (data.acceptsDestination !== undefined) data.acceptsDestination = data.acceptsDestination === true || data.acceptsDestination === 'true';

  if (data.category)     data.categorySlug = slugify(data.category);
  if (data.city)         data.citySlug = slugify(data.city);
  if (data.businessName) data.slug = await uniqueSlug(prisma, 'vendor', data.businessName + '-' + (data.city || v.city));

  const merged = { ...v, ...data };
  merged.photos = v.photos;
  const completion = computeCompletion(merged);
  data.isProfileComplete = completion >= 85;

  const updated = await prisma.vendor.update({
    where: { id: v.id }, data,
    include: { photos: { orderBy: { position: 'asc' } } },
  });
  return { vendor: updated, completion };
}

async function getMyDashboard(user, vendorId = null) {
  const v = await prisma.vendor.findFirst({
    where: { id: vendorId || undefined, userId: user.id },
    include: {
      photos: { orderBy: { position: 'asc' } },
      lock: true,
      reviews: { orderBy: { createdAt: 'desc' } },
      _count: { select: { inquiries: true, bookings: true } },
    },
  }) || await prisma.vendor.findFirst({
    where: { userId: user.id },
    include: {
      photos: { orderBy: { position: 'asc' } },
      lock: true,
      reviews: { orderBy: { createdAt: 'desc' } },
      _count: { select: { inquiries: true, bookings: true } },
    },
  });
  if (!v) return null;

  // Retrieve all businesses owned by this user
  const vendors = await prisma.vendor.findMany({
    where: { userId: user.id },
    include: { photos: { orderBy: { position: 'asc' } } }
  });

  const [recentInquiries, last30Inquiries, profileVisitsAllTime, profileVisits30Days] = await Promise.all([
    prisma.inquiry.findMany({
      where: { vendorId: v.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.inquiry.count({
      where: { vendorId: v.id, createdAt: { gte: new Date(Date.now() - 30 * 86400 * 1000) } },
    }),
    prisma.analyticsEvent.count({
      where: { vendorId: v.id, eventType: 'profile_visit' }
    }),
    prisma.analyticsEvent.count({
      where: { vendorId: v.id, eventType: 'profile_visit', createdAt: { gte: new Date(Date.now() - 30 * 86400 * 1000) } }
    })
  ]);

  return {
    vendor: v,
    completion: computeCompletion(v),
    counts: {
      inquiries: v._count.inquiries,
      bookings: v._count.bookings,
      last30Inquiries,
      profileVisitsAllTime: profileVisitsAllTime || 0,
      profileVisits30Days: profileVisits30Days || 0
    },
    recentInquiries,
  };
}

async function addPhoto(user, fileUrl, { isCover = false } = {}, vendorId = null) {
  const v = await prisma.vendor.findFirst({
    where: { id: vendorId || undefined, userId: user.id },
    include: { photos: true }
  }) || await prisma.vendor.findFirst({
    where: { userId: user.id },
    include: { photos: true }
  });
  if (!v) throw new HttpError(404, 'Create your vendor profile first', 'ERR_NO_VENDOR');

  // Enforce plan-based photo limits
  let planLimits = { Free: 4, Premium: 10, Featured: 15 };
  try {
    const config = require('../config/plansConfig').getPlansConfig();
    planLimits = {
      Free: config.Free?.maxPhotos || 4,
      Premium: config.Premium?.maxPhotos || 10,
      Featured: config.Featured?.maxPhotos || 15
    };
  } catch (err) {}
  const limit = planLimits[v.subscriptionPlan] || 4;
  if (v.photos.length >= limit) {
    throw new HttpError(400, `You have reached the maximum photo upload limit of ${limit} for your ${v.subscriptionPlan} plan. Please remove excess photos before uploading.`, 'ERR_LIMIT_EXCEEDED');
  }

  const position = v.photos.length > 0 ? Math.max(...v.photos.map(p => p.position)) + 1 : 0;
  if (isCover) {
    await prisma.vendorPhoto.updateMany({ where: { vendorId: v.id, isCover: true }, data: { isCover: false } });
  }
  const photo = await prisma.vendorPhoto.create({
    data: { vendorId: v.id, url: fileUrl, position, isCover: !!isCover },
  });

  // Recompute completion
  const refreshed = await prisma.vendor.findUnique({ where: { id: v.id }, include: { photos: true } });
  await prisma.vendor.update({
    where: { id: v.id },
    data: { isProfileComplete: computeCompletion(refreshed) >= 85 },
  });
  return photo;
}

async function removePhoto(user, photoId, vendorId = null) {
  const v = await prisma.vendor.findFirst({
    where: { id: vendorId || undefined, userId: user.id }
  }) || await prisma.vendor.findFirst({
    where: { userId: user.id }
  });
  if (!v) throw new HttpError(404, 'No vendor profile', 'ERR_NO_VENDOR');
  const p = await prisma.vendorPhoto.findUnique({ where: { id: photoId } });
  if (!p || p.vendorId !== v.id) throw new HttpError(404, 'Photo not found', 'ERR_NO_PHOTO');
  await prisma.vendorPhoto.delete({ where: { id: photoId } });
  return { ok: true };
}

async function deleteProfile(user, vendorId = null) {
  const v = await prisma.vendor.findFirst({
    where: { id: vendorId || undefined, userId: user.id }
  }) || await prisma.vendor.findFirst({
    where: { userId: user.id }
  });
  if (!v) throw new HttpError(404, 'No vendor profile found', 'ERR_NO_VENDOR');
  
  // Delete associated photos
  await prisma.vendorPhoto.deleteMany({ where: { vendorId: v.id } });
  
  // Delete the vendor profile
  await prisma.vendor.delete({ where: { id: v.id } });
  return { ok: true };
}

async function setCoverPhoto(user, photoId, vendorId = null) {
  const v = await prisma.vendor.findFirst({
    where: { id: vendorId || undefined, userId: user.id }
  }) || await prisma.vendor.findFirst({
    where: { userId: user.id }
  });
  if (!v) throw new HttpError(404, 'Create your vendor profile first', 'ERR_NO_VENDOR');
  
  // Set all other photos as non-cover
  await prisma.vendorPhoto.updateMany({ where: { vendorId: v.id, isCover: true }, data: { isCover: false } });
  
  // Set current photo as cover
  const photo = await prisma.vendorPhoto.update({
    where: { id: photoId },
    data: { isCover: true }
  });
  
  return photo;
}

module.exports = {
  signupOrAttach,
  updateProfile,
  getMyDashboard,
  addPhoto,
  removePhoto,
  computeCompletion,
  deleteProfile,
  setCoverPhoto,
};
