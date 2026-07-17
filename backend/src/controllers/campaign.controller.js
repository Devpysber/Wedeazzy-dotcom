const prisma = require('../config/db');
const { HttpError } = require('../middleware/error');

/**
 * Helper to check if vendor exists for current user
 */
async function getVendorOrThrow(req) {
  const vendorId = req.headers['x-vendor-id'] || req.query.vendorId || null;
  let vendor;
  if (vendorId) {
    vendor = await prisma.vendor.findFirst({ where: { id: vendorId, userId: req.user.id } });
  }
  if (!vendor) {
    vendor = await prisma.vendor.findFirst({ where: { userId: req.user.id } });
  }
  if (!vendor) {
    throw new HttpError(404, 'Vendor profile not found. Please complete onboarding first.', 'ERR_NO_VENDOR');
  }
  return vendor;
}

/**
 * Fetch a campaign and verify it belongs to the given vendor, or throw 404.
 * Shared by every vendor-side campaign endpoint that operates on a single
 * campaign by id (read/update/status/delete).
 */
async function getOwnedCampaignOrThrow(vendorId, campaignId) {
  const campaign = await prisma.adCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.vendorId !== vendorId) {
    throw new HttpError(404, 'Ad campaign not found', 'ERR_NOT_FOUND');
  }
  return campaign;
}

/**
 * Create a new marketing campaign (Grow Business flow)
 */
async function createCampaign(req, res, next) {
  try {
    const vendor = await getVendorOrThrow(req);
    const {
      platform, dailyBudget, durationDays, goal, targetCity, targetAudience, creativeCopy,
      // Grow Business fields
      packageType, planDays, totalAmount, gstAmount, baseAmount,
      gender, targetAreas, ageMin, ageMax, timeSchedule, startTime, endTime,
      paymentMethod
    } = req.body;

    // Input validations
    if (!platform || !dailyBudget || !durationDays || !goal) {
      throw new HttpError(400, 'Required fields: platform, dailyBudget, durationDays, goal', 'ERR_INPUT');
    }

    const budget = parseInt(dailyBudget, 10);
    const duration = parseInt(durationDays, 10);

    if (isNaN(budget) || budget <= 0) {
      throw new HttpError(400, 'Daily budget must be a positive number', 'ERR_INPUT');
    }
    if (isNaN(duration) || duration <= 0) {
      throw new HttpError(400, 'Duration days must be a positive number', 'ERR_INPUT');
    }

    // Default status for new campaigns is pending_review
    const status = 'pending_review';

    const campaign = await prisma.adCampaign.create({
      data: {
        vendorId: vendor.id,
        platform,
        dailyBudget: budget,
        durationDays: duration,
        goal,
        targetCity: targetCity || null,
        targetAudience: targetAudience || null,
        creativeCopy: creativeCopy || null,
        status,
        // Grow Business fields
        packageType: packageType || null,
        planDays: planDays ? parseInt(planDays, 10) : null,
        totalAmount: totalAmount ? parseInt(totalAmount, 10) : null,
        gstAmount: gstAmount ? parseInt(gstAmount, 10) : null,
        baseAmount: baseAmount ? parseInt(baseAmount, 10) : null,
        gender: gender || 'all',
        targetAreas: targetAreas || null,
        ageMin: ageMin ? parseInt(ageMin, 10) : 18,
        ageMax: ageMax ? parseInt(ageMax, 10) : 65,
        timeSchedule: timeSchedule || 'whole_day',
        startTime: startTime || null,
        endTime: endTime || null,
        paymentMethod: paymentMethod || null,
        paymentStatus: 'pending',
        adminStatus: 'pending',
      }
    });

    res.status(201).json({ ok: true, campaign });
  } catch (e) {
    next(e);
  }
}

/**
 * List campaigns for the authenticated vendor
 */
async function getCampaigns(req, res, next) {
  try {
    const vendor = await getVendorOrThrow(req);
    const campaigns = await prisma.adCampaign.findMany({
      where: { vendorId: vendor.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json({ ok: true, campaigns });
  } catch (e) {
    next(e);
  }
}

/**
 * Get details of a single campaign
 */
async function getCampaignById(req, res, next) {
  try {
    const vendor = await getVendorOrThrow(req);
    const { id } = req.params;
    const campaign = await getOwnedCampaignOrThrow(vendor.id, id);

    res.json({ ok: true, campaign });
  } catch (e) {
    next(e);
  }
}

/**
 * Update campaign settings
 */
async function updateCampaign(req, res, next) {
  try {
    const vendor = await getVendorOrThrow(req);
    const { id } = req.params;
    const { dailyBudget, durationDays, goal, targetCity, targetAudience, creativeCopy } = req.body;

    const campaign = await getOwnedCampaignOrThrow(vendor.id, id);

    if (campaign.adminStatus === 'completed') {
      throw new HttpError(400, 'Completed campaigns cannot be modified', 'ERR_COMPLETED');
    }

    const data = {};
    if (dailyBudget !== undefined) {
      const budget = parseInt(dailyBudget, 10);
      if (isNaN(budget) || budget <= 0) throw new HttpError(400, 'Invalid budget', 'ERR_INPUT');
      data.dailyBudget = budget;
    }
    if (durationDays !== undefined) {
      const duration = parseInt(durationDays, 10);
      if (isNaN(duration) || duration <= 0) throw new HttpError(400, 'Invalid duration', 'ERR_INPUT');
      data.durationDays = duration;
    }
    if (goal !== undefined) data.goal = goal;
    if (targetCity !== undefined) data.targetCity = targetCity || null;
    if (targetAudience !== undefined) data.targetAudience = targetAudience || null;
    if (creativeCopy !== undefined) data.creativeCopy = creativeCopy || null;

    const updated = await prisma.adCampaign.update({
      where: { id },
      data
    });

    res.json({ ok: true, campaign: updated });
  } catch (e) {
    next(e);
  }
}

/**
 * Pause or resume a campaign (vendor-side)
 */
async function updateCampaignStatus(req, res, next) {
  try {
    const vendor = await getVendorOrThrow(req);
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'paused'].includes(status)) {
      throw new HttpError(400, 'Status must be active or paused', 'ERR_INPUT');
    }

    const campaign = await getOwnedCampaignOrThrow(vendor.id, id);

    if (campaign.adminStatus === 'completed') {
      throw new HttpError(400, 'Completed campaigns cannot be modified', 'ERR_COMPLETED');
    }

    const updated = await prisma.adCampaign.update({
      where: { id },
      data: { status }
    });

    res.json({ ok: true, campaign: updated });
  } catch (e) {
    next(e);
  }
}

/**
 * Delete a campaign
 */
async function deleteCampaign(req, res, next) {
  try {
    const vendor = await getVendorOrThrow(req);
    const { id } = req.params;
    await getOwnedCampaignOrThrow(vendor.id, id);

    await prisma.adCampaign.delete({
      where: { id }
    });

    res.json({ ok: true, message: 'Campaign deleted successfully' });
  } catch (e) {
    next(e);
  }
}

/**
 * Get aggregate Grow Business analytics for the vendor
 */
async function getAnalyticsOverview(req, res, next) {
  try {
    const vendor = await getVendorOrThrow(req);
    if (vendor.subscriptionPlan === 'Free') {
      throw new HttpError(403, 'Reports and analytics dashboard access is locked under the Free plan. Please upgrade to Premium or Featured.', 'ERR_FORBIDDEN');
    }

    // Fetch campaigns
    const campaigns = await prisma.adCampaign.findMany({
      where: { vendorId: vendor.id },
      orderBy: { createdAt: 'desc' }
    });

    if (campaigns.length === 0) {
      return res.json({
        ok: true,
        hasCampaigns: false,
        summary: {
          totalReach: 0, leadsGenerated: 0, whatsappClicks: 0,
          websiteVisits: 0, bookingEnquiries: 0, conversionRate: 0,
          roi: 0, totalSpend: 0,
          analyticsReach: 0, analyticsImpressions: 0,
          analyticsClicks: 0, analyticsLeads: 0, analyticsWhatsapp: 0
        },
        charts: { reachClicksTimeline: [], leadSourceBreakdown: [] },
        campaigns: []
      });
    }

    // Aggregate admin-entered analytics from campaigns
    const analyticsReach = campaigns.reduce((sum, c) => sum + (c.analyticsReach || 0), 0);
    const analyticsImpressions = campaigns.reduce((sum, c) => sum + (c.analyticsImpressions || 0), 0);
    const analyticsClicks = campaigns.reduce((sum, c) => sum + (c.analyticsClicks || 0), 0);
    const analyticsLeads = campaigns.reduce((sum, c) => sum + (c.analyticsLeads || 0), 0);
    const analyticsWhatsapp = campaigns.reduce((sum, c) => sum + (c.analyticsWhatsapp || 0), 0);
    const totalSpend = campaigns.reduce((sum, c) => sum + (c.totalAmount || 0), 0);

    // Fetch real events logged (capped to prevent full-table scans on high-volume vendors)
    const [events, inquiries, bookings] = await Promise.all([
      prisma.analyticsEvent.findMany({ where: { vendorId: vendor.id }, orderBy: { createdAt: 'desc' }, take: 1000 }),
      prisma.inquiry.findMany({ where: { vendorId: vendor.id }, orderBy: { createdAt: 'desc' }, take: 500 }),
      prisma.booking.findMany({ where: { vendorId: vendor.id }, orderBy: { createdAt: 'desc' }, take: 500 }),
    ]);

    const websiteVisits = events.filter(e => e.eventType === 'profile_visit').length;
    const whatsappClicks = analyticsWhatsapp || events.filter(e => e.eventType === 'whatsapp_click').length;
    const leadsGenerated = analyticsLeads || inquiries.length;

    const firstCampaignCreated = new Date(Math.min(...campaigns.map(c => new Date(c.createdAt))));
    const bookingEnquiries = bookings.filter(b => new Date(b.createdAt) >= firstCampaignCreated).length;

    const totalReach = analyticsReach || 0;
    const totalBookings = bookings.filter(b => b.status === 'confirmed' || b.status === 'completed').length;
    const conversionRate = leadsGenerated > 0 ? parseFloat(((totalBookings / leadsGenerated) * 100).toFixed(1)) : 0;
    const bookingVal = vendor.priceMin || 1500;
    const totalRevenue = totalBookings * bookingVal;
    const roi = totalSpend > 0 ? parseFloat((totalRevenue / totalSpend).toFixed(2)) : 0;

    // 30-Day Timeline Chart – use analytics data if available, otherwise simulate
    const reachClicksTimeline = [];
    const campaignSpendMultiplier = 25;
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      const dateStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
      const dateEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
      const dayEvents = events.filter(e => e.createdAt >= dateStart && e.createdAt <= dateEnd);
      const dayClicks = dayEvents.filter(e => e.eventType === 'whatsapp_click').length;
      const dayVisits = dayEvents.filter(e => e.eventType === 'profile_visit').length;
      const dayActiveCampaigns = campaigns.filter(c => {
        const cCreated = new Date(c.createdAt);
        const cExpiry = new Date(c.createdAt);
        cExpiry.setDate(cExpiry.getDate() + (c.durationDays || 30));
        return dateStart >= cCreated && dateStart <= cExpiry && c.adminStatus === 'running';
      });
      const daySpend = dayActiveCampaigns.reduce((sum, c) => sum + (c.dailyBudget || 0), 0);
      const dayReach = (daySpend * campaignSpendMultiplier) + (dayVisits * 5);
      reachClicksTimeline.push({
        date: label,
        reach: dayReach,
        clicks: dayClicks + Math.floor(daySpend * 0.08)
      });
    }

    const leadSourceBreakdown = [
      { source: 'WhatsApp Campaigns', count: analyticsWhatsapp },
      { source: 'Lead Generation', count: analyticsLeads },
      { source: 'Profile Traffic', count: websiteVisits },
      { source: 'Featured Placement', count: vendor.tier === 'featured' ? Math.floor(websiteVisits * 0.4) : 0 }
    ];

    res.json({
      ok: true,
      hasCampaigns: true,
      summary: {
        totalReach, leadsGenerated, whatsappClicks, websiteVisits,
        bookingEnquiries, conversionRate, roi, totalSpend,
        analyticsReach, analyticsImpressions, analyticsClicks,
        analyticsLeads, analyticsWhatsapp
      },
      charts: { reachClicksTimeline, leadSourceBreakdown },
      campaigns: campaigns.map(c => ({
        id: c.id,
        packageType: c.packageType,
        planDays: c.planDays,
        totalAmount: c.totalAmount,
        status: c.status,
        adminStatus: c.adminStatus,
        paymentStatus: c.paymentStatus,
        createdAt: c.createdAt,
        analyticsReach: c.analyticsReach,
        analyticsImpressions: c.analyticsImpressions,
        analyticsClicks: c.analyticsClicks,
        analyticsLeads: c.analyticsLeads,
        analyticsWhatsapp: c.analyticsWhatsapp,
        targetAreas: c.targetAreas,
        gender: c.gender,
        ageMin: c.ageMin,
        ageMax: c.ageMax,
      }))
    });
  } catch (e) {
    next(e);
  }
}

/* ============================================================
 * ADMIN-ONLY ROUTES
 * ============================================================ */

/**
 * Admin: List all campaigns with vendor details
 */
async function adminListCampaigns(req, res, next) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const where = status && status !== 'all' ? { adminStatus: status } : {};

    const [campaigns, total] = await Promise.all([
      prisma.adCampaign.findMany({
        where,
        include: {
          vendor: {
            select: {
              id: true,
              businessName: true,
              city: true,
              category: true,
              whatsappNumber: true,
              user: { select: { email: true, phone: true, name: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page, 10) - 1) * parseInt(limit, 10),
        take: parseInt(limit, 10)
      }),
      prisma.adCampaign.count({ where })
    ]);

    res.json({ ok: true, campaigns, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (e) {
    next(e);
  }
}

/**
 * Admin: Update campaign status, notes, and analytics
 */
async function adminUpdateCampaign(req, res, next) {
  try {
    const { id } = req.params;
    const {
      adminStatus, adminNotes, paymentStatus,
      analyticsReach, analyticsImpressions, analyticsClicks,
      analyticsLeads, analyticsWhatsapp
    } = req.body;

    const campaign = await prisma.adCampaign.findUnique({ where: { id } });
    if (!campaign) throw new HttpError(404, 'Campaign not found', 'ERR_NOT_FOUND');

    const validAdminStatuses = ['pending', 'approved', 'running', 'completed', 'rejected'];
    if (adminStatus && !validAdminStatuses.includes(adminStatus)) {
      throw new HttpError(400, `Invalid adminStatus. Must be one of: ${validAdminStatuses.join(', ')}`, 'ERR_INPUT');
    }

    const data = {};
    if (adminStatus !== undefined) data.adminStatus = adminStatus;
    if (adminNotes !== undefined) data.adminNotes = adminNotes;
    if (paymentStatus !== undefined) data.paymentStatus = paymentStatus;
    if (analyticsReach !== undefined) data.analyticsReach = parseInt(analyticsReach, 10) || 0;
    if (analyticsImpressions !== undefined) data.analyticsImpressions = parseInt(analyticsImpressions, 10) || 0;
    if (analyticsClicks !== undefined) data.analyticsClicks = parseInt(analyticsClicks, 10) || 0;
    if (analyticsLeads !== undefined) data.analyticsLeads = parseInt(analyticsLeads, 10) || 0;
    if (analyticsWhatsapp !== undefined) data.analyticsWhatsapp = parseInt(analyticsWhatsapp, 10) || 0;

    // Sync adCampaign.status with adminStatus for backward compat
    if (adminStatus === 'running') data.status = 'active';
    else if (adminStatus === 'completed') data.status = 'completed';
    else if (adminStatus === 'rejected' || adminStatus === 'pending') data.status = 'draft';
    else if (adminStatus === 'approved') data.status = 'pending_review';

    const updated = await prisma.adCampaign.update({ where: { id }, data });
    res.json({ ok: true, campaign: updated });
  } catch (e) {
    next(e);
  }
}

module.exports = {
  createCampaign,
  getCampaigns,
  getCampaignById,
  updateCampaign,
  updateCampaignStatus,
  deleteCampaign,
  getAnalyticsOverview,
  adminListCampaigns,
  adminUpdateCampaign,
};
