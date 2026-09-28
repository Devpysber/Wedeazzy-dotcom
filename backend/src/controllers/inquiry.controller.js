/**
 * Inquiry endpoints: public/anonymous submission, couple-authenticated
 * submission, and vendor/admin inbox management.
 */

const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const service = require('../services/inquiry.service');
const env = require('../config/env');
const prisma = require('../config/db');
const logger = require('../config/logger');
const { sanitizeFields } = require('../utils/sanitize');
const { rateLimitHandler } = require('../utils/rateLimitLogger');

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { ok: false, code: 'ERR_RATE', message: 'Too many inquiries. Try again in a minute.' },
  handler: rateLimitHandler({ ok: false, code: 'ERR_RATE', message: 'Too many inquiries. Try again in a minute.' }),
});

/**
 * Public inquiry form submission (no auth required). If the request happens
 * to carry a valid, non-revoked couple JWT, the inquiry is linked to that
 * couple's account — otherwise it's recorded as a fully anonymous lead.
 */
async function postPublic(req, res, next) {
  try {
    let coupleUser = null;
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) {
      try {
        const denylisted = await prisma.jwtDenylist.findUnique({ where: { token } });
        if (!denylisted) {
          const payload = jwt.verify(token, env.JWT_SECRET);
          const user = await prisma.user.findUnique({
            where: { id: payload.sub },
            include: { couple: true }
          });
          if (user && user.role === 'couple') {
            coupleUser = user;
          }
        }
      } catch (err) {
        logger.warn({ msg: err.message }, 'Optional auth parsing failed for public inquiry');
      }
    }

    // Sanitize user-supplied text fields to prevent XSS
    sanitizeFields(req.body, ['name', 'notes', 'message', 'phone', 'eventType', 'email'], 1000);

    const inq = await service.create({
      ...req.body,
      coupleUser,
      source: coupleUser ? 'couple_dashboard' : 'public_site'
    });
    res.json({ ok: true, inquiry: { id: inq.id, status: inq.status } });
  } catch (e) { next(e); }
}

async function postAsCouple(req, res, next) {
  try {
    // Sanitize user-supplied text fields to prevent XSS (same as postPublic)
    sanitizeFields(req.body, ['name', 'notes', 'message', 'phone', 'eventType', 'email'], 1000);

    const couplePhone = req.body.phone || req.user.phone;

    // If user has no phone set yet (e.g. Google OAuth login), auto-update user account
    if (req.user && !req.user.phone && req.body.phone) {
      const { normalisePhone } = require('../utils/phone');
      const normalised = normalisePhone(req.body.phone);
      if (normalised) {
        await prisma.user.update({
          where: { id: req.user.id },
          data: { phone: normalised }
        }).catch(err => logger.error({ err }, 'Failed to auto-update couple phone number on inquiry'));
      }
    }

    const inq = await service.create({
      ...req.body,
      coupleUser: req.user,
      name: req.user.name || req.body.name,
      phone: couplePhone,
      source: req.body.fromShortlist ? 'shortlist' : 'couple_dashboard',
    });
    res.json({ ok: true, inquiry: inq });
  } catch (e) { next(e); }
}

async function listForVendor(req, res, next) {
  try {
    const list = await service.listForVendor(req.user.id, req.query, req.user.role === 'admin');
    res.json({ ok: true, inquiries: list });
  } catch (e) { next(e); }
}

async function patchStatus(req, res, next) {
  try {
    const updated = await service.setStatus(req.user.id, req.params.id, req.body.status, req.user.role === 'admin');
    res.json({ ok: true, inquiry: updated });
  } catch (e) { next(e); }
}

/**
 * Home-page enquiry (not tied to a vendor) from a signed-in couple. Sent to
 * the enquiry WhatsApp number. sendWa() stores the message in WaMessage before sending, so
 * if WhatsApp is disconnected it stays queued and retries, and is also emailed
 * to the admin as a fallback. The enquiry is therefore never silently dropped.
 */
async function postHomeEnquiry(req, res, next) {
  try {
    const body = req.body || {};
    sanitizeFields(body, ['service', 'city', 'country', 'name', 'phone', 'email', 'date', 'budget', 'notes'], 500);
    const str = (v, max) => String(v || '').trim().slice(0, max);
    const d = {
      service: str(body.service, 80), city: str(body.city, 80), country: str(body.country, 40),
      // Contact details default to the signed-in account's.
      name: str(body.name || req.user.name, 80), phone: str(body.phone || req.user.phone, 30), email: str(body.email || req.user.email, 120).toLowerCase(),
      date: str(body.date, 20), budget: str(body.budget, 40), notes: str(body.notes, 500),
    };

    const phoneDigits = d.phone.replace(/\D/g, '');
    if (!d.service || !d.city || d.name.length < 2) {
      return res.status(400).json({ ok: false, code: 'ERR_INPUT', message: 'Please fill in the service, city and your name.' });
    }
    if (phoneDigits.length < 8 || phoneDigits.length > 15) {
      return res.status(400).json({ ok: false, code: 'ERR_BAD_PHONE', message: 'Please enter a valid phone / WhatsApp number.' });
    }
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) {
      return res.status(400).json({ ok: false, code: 'ERR_INPUT', message: 'Please enter a valid email address.' });
    }

    const text = [
      '*New wedding enquiry — WedEazzy home page*',
      `*Service:* ${d.service}`,
      `*City:* ${d.city}${d.country ? ', ' + d.country : ''}`,
      `*Name:* ${d.name}`,
      `*Phone/WhatsApp:* ${d.phone}`,
      d.email ? `*Email:* ${d.email}` : null,
      `*Account:* ${req.user.email || req.user.id} (signed in)`,
      d.date ? `*Wedding date:* ${d.date}` : null,
      d.budget ? `*Budget:* ${d.budget}` : null,
      d.notes ? `*Notes:* ${d.notes}` : null,
    ].filter(Boolean).join('\n');

    const { sendWa } = require('../services/whatsapp.service');
    const result = await sendWa({
      to: env.ENQUIRY_WHATSAPP,
      body: text,
      template: 'home_enquiry',
      fallbackEmail: env.ADMIN_EMAIL || null,
      subjectHint: `Wedding enquiry: ${d.service} in ${d.city}`,
    });

    // Delivered, or safely queued in WaMessage for automatic retry.
    if (result && (result.ok || result.id)) {
      logger.info({ id: result.id, delivered: !!result.ok, service: d.service, city: d.city }, 'Home enquiry received');
      return res.json({ ok: true, delivered: !!result.ok });
    }
    logger.error({ result }, 'Home enquiry could not be recorded');
    return res.status(502).json({ ok: false, code: 'ERR_DELIVERY_FAILED', message: 'We could not send your enquiry right now. Please try again in a few minutes.' });
  } catch (e) { next(e); }
}

module.exports = { postPublic, postAsCouple, postHomeEnquiry, listForVendor, patchStatus, publicLimiter };
