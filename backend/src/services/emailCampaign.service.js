/**
 * WedEazzy Email Campaign BI Engine & Audience Resolution Service
 */

const prisma = require('../config/db');
const logger = require('../config/logger');
const { sendMail } = require('./email.service');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_BROADCAST_DELAY_MS = 150;

/**
 * Builds Prisma `where` clause for recipient user queries based on audience rules.
 */
function buildUserWhereClause(rules = {}) {
  const where = {
    email: { not: null },
    role: { not: 'admin' }
  };

  const { audienceType, countryCode, country, categories, cities, claimStatus, verificationStatus, status, tier, hasPhone, hasPhotos, registrationDateFrom, registrationDateTo } = rules;

  if (audienceType === 'couples') {
    where.role = 'couple';
  } else if (audienceType === 'vendors' || audienceType === 'claimed' || audienceType === 'unclaimed' || audienceType === 'verified' || audienceType === 'unverified' || audienceType === 'active' || audienceType === 'inactive') {
    where.role = 'vendor';
  }

  // Vendor relation filters
  const vendorWhere = {};

  if (countryCode && countryCode.toLowerCase() !== 'all') {
    vendorWhere.countryCode = countryCode.toUpperCase();
  } else if (country && country.toLowerCase() !== 'all') {
    vendorWhere.country = country;
  }

  if (audienceType === 'claimed' || claimStatus === 'claimed') {
    vendorWhere.userId = { not: null };
  } else if (audienceType === 'unclaimed' || claimStatus === 'unclaimed') {
    vendorWhere.userId = null;
  }

  if (audienceType === 'verified' || verificationStatus === 'verified') {
    vendorWhere.isVerified = true;
  } else if (audienceType === 'unverified' || verificationStatus === 'unverified') {
    vendorWhere.isVerified = false;
  }

  if (audienceType === 'active' || status === 'active') {
    vendorWhere.isActive = true;
  } else if (audienceType === 'inactive' || status === 'inactive') {
    vendorWhere.isActive = false;
  }

  if (tier) {
    vendorWhere.tier = tier;
  }

  if (Array.isArray(categories) && categories.length > 0) {
    vendorWhere.categorySlug = { in: categories };
  } else if (typeof categories === 'string' && categories.trim()) {
    vendorWhere.categorySlug = categories.trim();
  }

  if (Array.isArray(cities) && cities.length > 0) {
    vendorWhere.citySlug = { in: cities };
  } else if (typeof cities === 'string' && cities.trim()) {
    vendorWhere.citySlug = cities.trim();
  }

  if (hasPhone) {
    where.phone = { not: null };
  }

  if (registrationDateFrom || registrationDateTo) {
    where.createdAt = {};
    if (registrationDateFrom) where.createdAt.gte = new Date(registrationDateFrom);
    if (registrationDateTo) where.createdAt.lte = new Date(registrationDateTo);
  }

  if (Object.keys(vendorWhere).length > 0) {
    where.vendor = { some: vendorWhere };
  }

  return where;
}

/**
 * Resolves full recipient list from database matching audience rules plus any custom emails.
 */
async function resolveRecipients(rules = {}, customEmailsRaw = '') {
  const where = buildUserWhereClause(rules);

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      vendor: {
        select: {
          businessName: true,
          city: true,
          category: true,
          isVerified: true,
          isActive: true
        },
        take: 1
      }
    }
  });

  const recipientMap = new Map();

  // Process database users
  users.forEach(u => {
    if (!u.email || !EMAIL_REGEX.test(u.email.trim())) return;
    const cleanEmail = u.email.trim().toLowerCase();
    const vendorObj = u.vendor && u.vendor.length > 0 ? u.vendor[0] : null;

    recipientMap.set(cleanEmail, {
      id: u.id,
      email: cleanEmail,
      name: u.name || 'Valued Member',
      role: u.role,
      businessName: vendorObj ? vendorObj.businessName : '',
      city: vendorObj ? vendorObj.city : '',
      category: vendorObj ? vendorObj.category : '',
      status: vendorObj ? (vendorObj.isActive ? 'Active' : 'Inactive') : 'Active'
    });
  });

  // Process manual/custom emails
  if (customEmailsRaw) {
    let emails = [];
    if (typeof customEmailsRaw === 'string') {
      emails = customEmailsRaw.split(/[\n,;]+/).map(e => e.trim()).filter(Boolean);
    } else if (Array.isArray(customEmailsRaw)) {
      emails = customEmailsRaw.map(e => String(e).trim()).filter(Boolean);
    }

    emails.forEach(raw => {
      let name = 'Subscriber';
      let emailStr = raw;
      if (raw.includes('<') && raw.includes('>')) {
        const parts = raw.split('<');
        name = parts[0].trim() || 'Subscriber';
        emailStr = parts[1].replace('>', '').trim();
      }

      if (EMAIL_REGEX.test(emailStr)) {
        const cleanEmail = emailStr.toLowerCase();
        if (!recipientMap.has(cleanEmail)) {
          recipientMap.set(cleanEmail, {
            id: null,
            email: cleanEmail,
            name,
            role: 'custom',
            businessName: '',
            city: '',
            category: '',
            status: 'Custom'
          });
        }
      }
    });
  }

  return Array.from(recipientMap.values());
}

/**
 * Calculates audience breakdown counts for UI before sending.
 */
async function getAudienceCount(rules = {}, customEmailsRaw = '') {
  const recipients = await resolveRecipients(rules, customEmailsRaw);

  const totalUsersInDb = await prisma.user.count({ where: { role: { not: 'admin' } } });
  const usersWithEmail = await prisma.user.count({ where: { role: { not: 'admin' }, email: { not: null } } });
  const missingEmailCount = Math.max(0, totalUsersInDb - usersWithEmail);

  return {
    ok: true,
    totalRecipients: recipients.length,
    validCount: recipients.length,
    missingEmailCount,
    unsubscribedCount: 0,
    failedCount: 0
  };
}

/**
 * Returns paginated recipient preview.
 */
async function getAudiencePreview(rules = {}, customEmailsRaw = '', page = 1, limit = 20) {
  const recipients = await resolveRecipients(rules, customEmailsRaw);
  const total = recipients.length;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));

  const start = (pageNum - 1) * limitNum;
  const pageRecipients = recipients.slice(start, start + limitNum);

  return {
    ok: true,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum) || 1,
    recipients: pageRecipients
  };
}

/**
 * Replaces personalization variables in email text/HTML content.
 */
function replacePersonalization(content = '', recipient = {}) {
  if (!content) return '';
  return content
    .replace(/\{\{\s*name\s*\}\}/gi, recipient.name || 'there')
    .replace(/\{\{\s*businessName\s*\}\}/gi, recipient.businessName || recipient.name || 'Valued Partner')
    .replace(/\{\{\s*city\s*\}\}/gi, recipient.city || 'your area')
    .replace(/\{\{\s*category\s*\}\}/gi, recipient.category || 'wedding vendor')
    .replace(/\{\{\s*vendorLoginUrl\s*\}\}/gi, 'https://wedeazzy.com/pages/vendor-login.html')
    .replace(/\{\{\s*claimUrl\s*\}\}/gi, 'https://wedeazzy.com/pages/claim.html');
}

/**
 * Computes top statistics for Email Campaign Center header cards using genuine database records.
 */
async function getEmailCampaignStats() {
  const totalRecipients = await prisma.user.count({ where: { role: { not: 'admin' }, email: { not: null } } });
  const totalCampaigns = await prisma.emailCampaign.count();

  const aggregate = await prisma.emailCampaign.aggregate({
    _sum: { sentCount: true, failedCount: true }
  });

  const totalSent = aggregate._sum.sentCount || 0;
  const totalFailed = aggregate._sum.failedCount || 0;
  const totalAttempted = totalSent + totalFailed;

  const deliveryRate = totalAttempted > 0 ? Number(((totalSent / totalAttempted) * 100).toFixed(1)) : 100.0;
  const failureRate = totalAttempted > 0 ? Number(((totalFailed / totalAttempted) * 100).toFixed(1)) : 0.0;

  // Sent this month calculation
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const monthAggregate = await prisma.emailCampaign.aggregate({
    where: { createdAt: { gte: startOfMonth } },
    _sum: { sentCount: true }
  });
  const sentThisMonth = monthAggregate._sum.sentCount || 0;

  const activeCampaigns = await prisma.emailCampaign.count({
    where: { status: { in: ['queued', 'sending'] } }
  });

  return {
    ok: true,
    stats: {
      totalRecipients,
      totalCampaigns,
      deliveryRate,
      failureRate,
      totalSent,
      totalFailed,
      sentThisMonth,
      activeCampaigns
    }
  };
}

/**
 * Executes background dispatch loop for a campaign.
 */
async function dispatchCampaign(campaignId) {
  const campaign = await prisma.emailCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error('Campaign not found');

  if (campaign.status === 'sending') {
    logger.warn({ campaignId }, 'Campaign is already actively sending. Aborting duplicate dispatch.');
    return;
  }

  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: { status: 'sending' }
  });

  let rules = {};
  try {
    rules = campaign.audienceRules ? JSON.parse(campaign.audienceRules) : {};
  } catch (e) {
    rules = {};
  }

  const recipients = await resolveRecipients(rules, campaign.customEmails);

  let sentCount = 0;
  let failedCount = 0;
  const failedRecipientsList = [];

  for (const recipient of recipients) {
    const personalizedSubject = replacePersonalization(campaign.subject, recipient);
    const personalizedBody = replacePersonalization(campaign.body, recipient);

    try {
      const result = await sendMail({
        to: recipient.email,
        subject: personalizedSubject,
        html: personalizedBody,
        text: personalizedBody.replace(/<[^>]*>?/gm, '')
      });

      if (result.ok && !result.fallback) {
        sentCount += 1;
      } else {
        failedCount += 1;
        failedRecipientsList.push(recipient);
      }
    } catch (err) {
      failedCount += 1;
      failedRecipientsList.push(recipient);
      logger.error({ err, email: recipient.email, campaignId }, 'Campaign email dispatch failed');
    }

    await new Promise(r => setTimeout(r, EMAIL_BROADCAST_DELAY_MS));
  }

  const finalStatus = failedCount === 0 ? 'completed' : (sentCount === 0 ? 'failed' : 'partially_failed');

  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: {
      sentCount,
      failedCount,
      deliveredCount: sentCount,
      totalRecipients: recipients.length,
      failedRecipients: JSON.stringify(failedRecipientsList),
      status: finalStatus
    }
  });

  logger.info({ campaignId, sentCount, failedCount, finalStatus }, 'Campaign broadcast completed');
}

/**
 * Retries dispatch ONLY for failed recipients of a past campaign.
 */
async function retryFailedCampaign(campaignId) {
  const campaign = await prisma.emailCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error('Campaign not found');

  let failedList = [];
  try {
    failedList = campaign.failedRecipients ? JSON.parse(campaign.failedRecipients) : [];
  } catch (e) {
    failedList = [];
  }

  if (failedList.length === 0) {
    throw new Error('No failed recipients record available to retry');
  }

  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: { status: 'sending' }
  });

  let newSent = campaign.sentCount;
  let newFailed = 0;
  const remainingFailed = [];

  for (const recipient of failedList) {
    const personalizedSubject = replacePersonalization(campaign.subject, recipient);
    const personalizedBody = replacePersonalization(campaign.body, recipient);

    try {
      const result = await sendMail({
        to: recipient.email,
        subject: personalizedSubject,
        html: personalizedBody,
        text: personalizedBody.replace(/<[^>]*>?/gm, '')
      });

      if (result.ok && !result.fallback) {
        newSent += 1;
      } else {
        newFailed += 1;
        remainingFailed.push(recipient);
      }
    } catch (err) {
      newFailed += 1;
      remainingFailed.push(recipient);
    }

    await new Promise(r => setTimeout(r, EMAIL_BROADCAST_DELAY_MS));
  }

  const finalStatus = remainingFailed.length === 0 ? 'completed' : 'partially_failed';

  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: {
      sentCount: newSent,
      failedCount: remainingFailed.length,
      deliveredCount: newSent,
      failedRecipients: JSON.stringify(remainingFailed),
      status: finalStatus
    }
  });

  return { ok: true, sentCount: newSent, remainingFailedCount: remainingFailed.length };
}

/**
 * Automatically checks for scheduled campaigns whose dispatch time has arrived.
 */
async function processScheduledCampaigns() {
  try {
    const dueCampaigns = await prisma.emailCampaign.findMany({
      where: {
        status: 'scheduled',
        scheduledAt: { lte: new Date() }
      }
    });

    for (const campaign of dueCampaigns) {
      logger.info({ campaignId: campaign.id, name: campaign.name }, 'Triggering scheduled email campaign broadcast');
      dispatchCampaign(campaign.id).catch(err => {
        logger.error({ err, campaignId: campaign.id }, 'Error during scheduled campaign dispatch');
      });
    }
  } catch (err) {
    logger.error({ err }, 'Error checking scheduled email campaigns');
  }
}

// Start periodic scheduler interval (runs every 60 seconds)
setInterval(processScheduledCampaigns, 60000);

module.exports = {
  buildUserWhereClause,
  resolveRecipients,
  getAudienceCount,
  getAudiencePreview,
  replacePersonalization,
  getEmailCampaignStats,
  dispatchCampaign,
  retryFailedCampaign,
  processScheduledCampaigns
};
