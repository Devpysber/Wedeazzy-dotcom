const prisma = require('../config/db');
const env = require('../config/env');
const { HttpError } = require('../middleware/error');
const { normalisePhone, isValidPhone } = require('../utils/phone');
const { sendTemplate, sendWa } = require('./whatsapp.service');

const STATUSES = ['new', 'contacted', 'quoted', 'booked', 'closed', 'lost'];

async function create(payload) {
  const vendorRef = String(payload.vendorId || '');
  if (!vendorRef) throw new HttpError(400, 'vendorId required', 'ERR_INPUT');
  
  const vendor =
       (await prisma.vendor.findUnique({ where: { id: vendorRef } }))
    || (await prisma.vendor.findUnique({ where: { legacyId: vendorRef } }))
    || (await prisma.vendor.findUnique({ where: { slug: vendorRef } }));
  if (!vendor) throw new HttpError(404, 'Vendor not found - seed the public dataset first', 'ERR_NO_VENDOR');
  const vendorId = vendor.id;

  const phone = normalisePhone(payload.phone || (payload.coupleUser && payload.coupleUser.phone));
  if (!isValidPhone(phone)) throw new HttpError(400, 'A valid couple phone is required', 'ERR_BAD_PHONE');

  const name = String(payload.name || (payload.coupleUser && payload.coupleUser.name) || 'Couple').trim().slice(0, 80);
  const data = {
    vendorId,
    coupleUserId: payload.coupleUser ? payload.coupleUser.id : null,
    name,
    phone,
    email: payload.email || null,
    eventDate: payload.eventDate ? new Date(payload.eventDate) : null,
    guests: payload.guests != null ? String(payload.guests) : null,
    budget: payload.budget != null ? String(payload.budget) : null,
    callDiscussion: payload.callDiscussion || null,
    notes: payload.notes || null,
    source: payload.source || 'public_site',
  };

  const inq = await prisma.inquiry.create({ data });

  // Record profile_visit and lead_gen analytics events to ensure real-time dashboard updates
  await prisma.analyticsEvent.createMany({
    data: [
      { vendorId, eventType: 'profile_visit' },
      { vendorId, eventType: 'lead_gen' }
    ]
  }).catch(err => logger.error({ err }, 'Failed to record inquiry analytics events'));

  // Sales-pitch flow: admin is the gatekeeper. Forward to admin first.
  const adminSummary = [
    `*Vendor:* ${vendor.businessName}`,
    `*Category:* ${vendor.category}  ·  *City:* ${vendor.city}${vendor.area ? ' / ' + vendor.area : ''}`,
    `*Couple:* ${name}`,
    `*Phone:* ${phone}`,
    data.eventDate ? `*Event:* ${data.eventDate.toISOString().slice(0,10)}` : null,
    data.guests ? `*Guests:* ${data.guests}` : null,
    data.budget ? `*Budget:* ${data.budget}` : null,
    data.callDiscussion ? `*Call Consultation:* ${data.callDiscussion}` : null,
    data.notes ? `*Notes:* ${data.notes}` : null,
    `Inquiry ID: ${inq.id}`,
  ].filter(Boolean).join('\n');

  // Send to each admin phone (env-configured). Fire-and-forget but log failures.
  for (const adminPhone of env.ADMIN_PHONES) {
    // Skip non-numeric identifiers (e.g., Google OAuth IDs stored in ADMIN_PHONES)
    if (!/^\d{10,15}$/.test(adminPhone)) continue;
    sendTemplate(adminPhone, 'admin_new_lead', {
      summary: adminSummary,
      couplePhone: phone,
      vendorName: vendor.businessName,
      vendorPhone: vendor.whatsappNumber || '-',
    }).catch((e) => {
      const logger = require('../config/logger');
      logger.error({ err: e, adminPhone, inquiryId: inq.id }, 'WA admin inquiry notification failed');
    });
  }

  // (Optional) light vendor ping with NO couple PII — admin still gatekeeps.
  if (vendor.whatsappNumber && /^\d{10,15}$/.test(vendor.whatsappNumber)) {
    sendWa({
      to: vendor.whatsappNumber,
      body: `*WedEazzy:* a new couple inquiry just landed for *${vendor.businessName}*. Our team is verifying and will forward the couple's details to you on WhatsApp shortly.`,
      template: 'vendor_new_inquiry_blind',
      userId: vendor.userId,
    }).catch((e) => {
      const logger = require('../config/logger');
      logger.error({ err: e, vendorId: vendor.id, inquiryId: inq.id }, 'WA vendor inquiry blind-ping failed');
    });
  }

  // Trigger email notifications (fire-and-forget)
  const emailService = require('./email.service');
  const logger = require('../config/logger');

  // 1. Notify Admin via Email
  const adminEmail = env.ADMIN_EMAIL || env.SMTP.user;
  if (adminEmail) {
    emailService.sendInquiryNotification(adminEmail, inq, vendor.businessName, 'admin').catch(e => {
      logger.error({ err: e, to: adminEmail }, 'Failed to send admin inquiry notification email');
    });
  } else {
    logger.warn('Admin inquiry notification not sent — ADMIN_EMAIL/SMTP_USER not configured.');
  }

  // 2. Notify Vendor via Email (if the vendor has an email)
  if (vendor.userId) {
    prisma.user.findUnique({
      where: { id: vendor.userId },
      select: { email: true }
    }).then(u => {
      if (u && u.email) {
        emailService.sendInquiryNotification(u.email, inq, vendor.businessName, 'vendor').catch(e => {
          logger.error({ err: e, to: u.email }, 'Failed to send vendor inquiry notification email');
        });
      }
    }).catch(err => {
      logger.error({ err }, 'Failed to query vendor user email for inquiry notification');
    });
  }

  return inq;
}

async function listForVendor(vendorUserId, { status, limit = 50 } = {}, isAdmin = false) {
  if (isAdmin) {
    // Admins see every inquiry across all vendors, not just their own (admins
    // have no Vendor profile, so the userId-scoped lookup below would always
    // return an empty list for them).
    return prisma.inquiry.findMany({
      where: status ? { status } : {},
      include: { vendor: { select: { businessName: true, category: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
    });
  }

  const vendor = await prisma.vendor.findUnique({ where: { userId: vendorUserId } });
  if (!vendor) return [];
  return prisma.inquiry.findMany({
    where: { vendorId: vendor.id, ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
  });
}

async function setStatus(vendorUserId, inquiryId, status, isAdmin = false) {
  if (!STATUSES.includes(status)) throw new HttpError(400, 'Bad status', 'ERR_INPUT');
  const inq = await prisma.inquiry.findUnique({ where: { id: inquiryId } });
  if (!inq) throw new HttpError(404, 'Inquiry not found', 'ERR_NO_INQ');
  if (!isAdmin) {
    const vendor = await prisma.vendor.findUnique({ where: { userId: vendorUserId } });
    if (!vendor || vendor.id !== inq.vendorId) throw new HttpError(403, 'Not your inquiry', 'ERR_FORBIDDEN');
  }
  return prisma.inquiry.update({ where: { id: inquiryId }, data: { status } });
}

module.exports = { create, listForVendor, setStatus };
