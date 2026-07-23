/** Unauthenticated public endpoints: vendor search/listing, homepage filter metadata, analytics beacon. */

const prisma = require('../config/db');
const { HttpError } = require('../middleware/error');

// Categories/cities barely change and this endpoint is hit on every homepage
// load (filter dropdowns) — cache the computed result briefly instead of
// running two groupBy aggregations per request.
const METADATA_CACHE_TTL_MS = 5 * 60 * 1000;
let metadataCache = { data: null, expiresAt: 0 };

/**
 * Format database Vendor object to match legacy frontend keys for compatibility
 */
function formatVendor(v) {
  if (!v) return null;
  return {
    id: v.slug || v.id,
    name: v.businessName,
    category: v.category,
    category_slug: v.categorySlug,
    city: v.city,
    city_slug: v.citySlug,
    area: v.area || '',
    address: v.address || '',
    phone: v.whatsappNumber || '',
    website: v.website || '',
    pincode: v.pincode || '',
    rating: v.rating,
    rating_count: v.ratingCount || 0,
    google_cid: v.googleCid || '',
    active: v.isActive ? 'yes' : 'no',
    photos: v.photos || [],
    reviews: v.reviews || [],
    subscriptionPlan: v.subscriptionPlan || 'Free',
    alternateMobile: v.alternateMobile || '',
    instagram: v.instagram || '',
    facebook: v.facebook || '',
    youtube: v.youtube || '',
    googleBusiness: v.googleBusiness || '',
    businessTimings: v.businessTimings || '',
    yearsExperience: v.yearsExperience || 0,
    teamSize: v.teamSize || 0,
    serviceAreas: v.serviceAreas || '',
    languagesSpoken: v.languagesSpoken || '',
    acceptsDestination: v.acceptsDestination || false,
    services: v.services || [],
  };
}

/**
 * Paginated public vendor search and filtering
 */
async function getVendors(req, res, next) {
  try {
    const { category, city, rating, search, sortBy, pincode } = req.query;

    // Support Recently Joined Vendors
    if (req.query.recentlyJoined === 'true') {
      const vendors = await prisma.vendor.findMany({
        where: { isActive: true },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          photos: {
            orderBy: { position: 'asc' },
            take: 5,
          },
        },
      });
      return res.json({ ok: true, vendors: vendors.map(formatVendor) });
    }

    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '20', 10);

    const skip = (page - 1) * limit;
    const take = limit;

    // Build raw SQL query parts dynamically
    let sqlWhere = 'WHERE isActive = 1';
    const params = [];

    if (category) {
      const cats = category.split(',').map(s => s.trim()).filter(Boolean);
      if (cats.length > 0) {
        sqlWhere += ` AND categorySlug IN (${cats.map(() => '?').join(',')})`;
        params.push(...cats);
      }
    }

    if (city) {
      const citiesList = city.split(',').map(s => s.trim()).filter(Boolean);
      if (citiesList.length > 0) {
        sqlWhere += ` AND citySlug IN (${citiesList.map(() => '?').join(',')})`;
        params.push(...citiesList);
      }
    }

    if (pincode) {
      sqlWhere += ' AND pincode = ?';
      params.push(pincode);
    }

    if (rating) {
      const minRating = parseFloat(rating);
      if (!isNaN(minRating)) {
        sqlWhere += ' AND rating >= ?';
        params.push(minRating);
      }
    }

    if (search && search.trim()) {
      const searchPattern = `%${search.trim()}%`;
      sqlWhere += ' AND (businessName LIKE ? OR area LIKE ? OR address LIKE ? OR pincode LIKE ? OR category LIKE ? OR city LIKE ?)';
      params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    if (req.query.featured === 'true') {
      sqlWhere += " AND subscriptionPlan = 'Featured'";
    }

    // Execute count query
    const countSql = `SELECT COUNT(*) as count FROM \`Vendor\` ${sqlWhere}`;
    const countResult = await prisma.$queryRawUnsafe(countSql, ...params);
    const total = parseInt(countResult[0]?.count || '0', 10);

    // Build sorting SQL order clause
    let orderSql = `
      ORDER BY
        CASE subscriptionPlan
          WHEN 'Featured' THEN 3
          WHEN 'Premium' THEN 2
          ELSE 1
        END DESC
    `;
    if (sortBy === 'name') {
      orderSql += ', businessName ASC';
    } else {
      orderSql += ', rating DESC, ratingCount DESC, isProfileComplete DESC, createdAt DESC';
    }

    // Execute paginated ID select query
    const idsSql = `SELECT id FROM \`Vendor\` ${sqlWhere} ${orderSql} LIMIT ? OFFSET ?`;
    const idsResult = await prisma.$queryRawUnsafe(idsSql, ...params, take, skip);
    const ids = idsResult.map(r => r.id);

    let vendors = [];
    if (ids.length > 0) {
      vendors = await prisma.vendor.findMany({
        where: { id: { in: ids } },
        include: {
          photos: {
            orderBy: { position: 'asc' },
            take: 5,
          },
        },
      });

      // Preserve database CASE sort order in Node.js
      const idMap = {};
      ids.forEach((id, idx) => { idMap[id] = idx; });
      vendors.sort((a, b) => idMap[a.id] - idMap[b.id]);
    }

    const totalPages = Math.ceil(total / limit);

    res.json({
      ok: true,
      vendors: vendors.map(formatVendor),
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (e) {
    next(e);
  }
}

/**
 * Retrieve single vendor detail by ID, legacy ID, or Slug
 */
async function getVendorByIdOrSlug(req, res, next) {
  try {
    const { idOrSlug } = req.params;

    if (!idOrSlug) {
      throw new HttpError(400, 'Vendor identifier is required', 'ERR_INPUT');
    }

    const vendor = await prisma.vendor.findFirst({
      where: {
        OR: [
          { id: idOrSlug },
          { slug: idOrSlug },
          { legacyId: idOrSlug },
        ],
      },
      include: {
        photos: {
          orderBy: { position: 'asc' },
        },
        reviews: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!vendor) {
      throw new HttpError(404, 'Vendor profile not found', 'ERR_NOT_FOUND');
    }

    res.json({
      ok: true,
      vendor: formatVendor(vendor),
    });
  } catch (e) {
    next(e);
  }
}

/**
 * Get cities and categories metadata with active vendor counts
 */
async function getMetadata(req, res, next) {
  try {
    if (metadataCache.data && metadataCache.expiresAt > Date.now()) {
      return res.json(metadataCache.data);
    }

    const [cities, categories] = await Promise.all([
      prisma.vendor.groupBy({
        by: ['city', 'citySlug'],
        where: { isActive: true },
        _count: { id: true },
        orderBy: { city: 'asc' },
      }),
      prisma.vendor.groupBy({
        by: ['category', 'categorySlug'],
        where: { isActive: true },
        _count: { id: true },
        orderBy: { category: 'asc' },
      }),
    ]);

    const payload = {
      ok: true,
      cities: cities
        .map((c) => ({
          name: c.city,
          slug: c.citySlug,
          count: c._count.id,
        }))
        .filter((c) => c.count >= 3)
        .sort((a, b) => b.count - a.count),
      categories: categories.map((c) => ({
        name: c.category,
        slug: c.categorySlug,
        count: c._count.id,
      })),
    };

    metadataCache = { data: payload, expiresAt: Date.now() + METADATA_CACHE_TTL_MS };
    res.json(payload);
  } catch (e) {
    next(e);
  }
}

/**
 * Log public user engagement event for vendor analytics
 */
async function logAnalyticsEvent(req, res, next) {
  try {
    const { vendorIdOrSlug, eventType, campaignId } = req.body;

    if (!vendorIdOrSlug || !eventType) {
      throw new HttpError(400, 'vendorIdOrSlug and eventType are required', 'ERR_INPUT');
    }

    if (!['profile_visit', 'whatsapp_click', 'lead_gen'].includes(eventType)) {
      throw new HttpError(400, 'Invalid event type', 'ERR_INPUT');
    }

    // Look up vendor
    const vendor = await prisma.vendor.findFirst({
      where: {
        OR: [
          { id: vendorIdOrSlug },
          { slug: vendorIdOrSlug }
        ]
      }
    });

    if (!vendor) {
      throw new HttpError(404, 'Vendor not found', 'ERR_NOT_FOUND');
    }

    const event = await prisma.analyticsEvent.create({
      data: {
        vendorId: vendor.id,
        eventType,
        campaignId: campaignId || null
      }
    });

    res.json({ ok: true, event });
  } catch (e) {
    next(e);
  }
}

const fs = require('fs');
const path = require('path');

function getPlans(req, res, next) {
  try {
    const plans = require('../config/plansConfig').getPlansConfig();
    res.json({ ok: true, plans });
  } catch (err) {
    next(err);
  }
}

async function addVendorReview(req, res, next) {
  try {
    throw new HttpError(403, 'Reviews must be submitted from the Couple Dashboard under My Inquiries', 'ERR_FORBIDDEN');
  } catch (e) {
    next(e);
  }
}

/**
 * Public: list published SEO blog articles (newest first).
 */
async function getBlogs(req, res, next) {
  try {
    const blogs = await prisma.blog.findMany({
      where: { status: 'published' },
      orderBy: { publishedAt: 'desc' },
      select: { title: true, slug: true, metaDescription: true, publishedAt: true, views: true, likes: true },
      take: 100,
    });
    res.json({ ok: true, blogs });
  } catch (e) {
    next(e);
  }
}

/**
 * Public: single published blog article by slug. Increments the view
 * counter shown in the admin dashboard's "Organic Clicks" column.
 */
async function getBlogBySlug(req, res, next) {
  try {
    const { slug } = req.params;
    const blog = await prisma.blog.findUnique({ where: { slug } });
    if (!blog || blog.status !== 'published') {
      throw new HttpError(404, 'Blog article not found', 'ERR_NOT_FOUND');
    }

    await prisma.blog.update({ where: { slug }, data: { views: { increment: 1 } } }).catch(() => {});

    res.json({ ok: true, blog });
  } catch (e) {
    next(e);
  }
}

module.exports = {
  getVendors,
  getVendorByIdOrSlug,
  getMetadata,
  logAnalyticsEvent,
  getPlans,
  addVendorReview,
  getBlogs,
  getBlogBySlug,
};
