/** Unauthenticated public endpoints: vendor search/listing, homepage filter metadata, analytics beacon. */

const prisma = require('../config/db');
const { HttpError } = require('../middleware/error');
const { askChatbot } = require('../services/chatbot.service');
const { getGrowCampaignsPricing: getGrowCampaignsPricingConfig, getSupportedGrowCountries, COUNTRY_METADATA } = require('../config/growCampaignsPricingConfig');

// Categories/cities barely change and this endpoint is hit on every homepage
// load (filter dropdowns) — cache the computed result briefly instead of
// running two groupBy aggregations per request. Keyed by scope (see
// getMetadata) since a category page needs city counts scoped to that
// category, and a city page needs category counts scoped to that city -
// otherwise a city's checkbox shows its total across every category, while
// the actual filtered results are scoped to just the category being browsed.
const METADATA_CACHE_TTL_MS = 5 * 60 * 1000;
const metadataCache = new Map(); // key -> { data, expiresAt }

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
    price_min: v.priceMin || null,
    price_max: v.priceMax || null,
    capacity: v.capacity || null,
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

    const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
    // Capped at 50 — unbounded before this meant a single unauthenticated
    // request (?limit=20000) could dump the entire vendor table (13,000+
    // rows plus joined photos) in one response: a full-DB scrape and a
    // resource-exhaustion vector, both bypassing rate limiting entirely
    // since it only takes one request.
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10) || 20));

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
 * Get cities and categories metadata with active vendor counts.
 *
 * Optional ?category=<slug> scopes the returned city counts to that category
 * (used by category.html, where the city filter's counts must match "how
 * many vendors of *this* category are in that city", not the city's total
 * across every category). Optional ?city=<slug> scopes the returned category
 * counts to that city (used by city.html), the same way in reverse.
 */
async function getMetadata(req, res, next) {
  try {
    const categoryScope = (req.query.category || '').trim();
    const cityScope = (req.query.city || '').trim();
    const cacheKey = 'category:' + categoryScope + '|city:' + cityScope;

    const cached = metadataCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(cached.data);
    }

    const cityWhere = { isActive: true };
    if (categoryScope) cityWhere.categorySlug = categoryScope;
    const categoryWhere = { isActive: true };
    if (cityScope) categoryWhere.citySlug = cityScope;

    const [cities, categories] = await Promise.all([
      prisma.vendor.groupBy({
        by: ['city', 'citySlug'],
        where: cityWhere,
        _count: { id: true },
        orderBy: { city: 'asc' },
      }),
      prisma.vendor.groupBy({
        by: ['category', 'categorySlug'],
        where: categoryWhere,
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

    metadataCache.set(cacheKey, { data: payload, expiresAt: Date.now() + METADATA_CACHE_TTL_MS });
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
    const plansConfig = require('../config/plansConfig');
    const countryCode = req.query.countryCode || req.query.country;
    if (req.query.all === 'true' || countryCode === 'all') {
      const plans = plansConfig.loadFullConfig();
      return res.json({ ok: true, plans });
    }
    const plans = plansConfig.getPlansConfig(countryCode);
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

/**
 * Public: free-text fallback for the FAQ chatbot widget when the message
 * doesn't match a canned topic client-side. Proxies to NVIDIA NIM using the
 * server-side API key — the browser never sees it.
 */
async function postChatbotMessage(req, res, next) {
  try {
    const { message } = req.body || {};
    if (!message || !message.trim()) {
      throw new HttpError(400, 'Message is required', 'ERR_INPUT');
    }
    if (message.length > 500) {
      throw new HttpError(400, 'Message is too long', 'ERR_INPUT');
    }

    const result = await askChatbot(message.trim());
    if (!result.ok) {
      throw new HttpError(503, result.error || 'Chat assistant is temporarily unavailable.', 'ERR_CHATBOT_UNAVAILABLE');
    }

    res.json({ ok: true, reply: result.reply });
  } catch (e) {
    next(e);
  }
}

/**
 * Public: current Grow Business campaign pricing (WhatsApp Enquiries, More
 * Leads, Website Sales packages), consumed by the vendor dashboard's Grow
 * Business tab. Admin-editable via PUT /api/admin/grow-campaigns-pricing.
 */
function getGrowCampaignsPricing(req, res) {
  const { countryCode } = req.query || {};
  const code = (countryCode && countryCode !== 'all') ? countryCode.toUpperCase() : 'IN';
  const meta = COUNTRY_METADATA[code] || { name: code, code, currency: 'INR', symbol: '₹', flag: '🌐' };
  res.json({
    ok: true,
    countryCode: code,
    countryMeta: meta,
    currencySymbol: meta.symbol,
    supportedCountries: getSupportedGrowCountries(),
    pricing: getGrowCampaignsPricingConfig(code)
  });
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
  postChatbotMessage,
  getGrowCampaignsPricing,
};
