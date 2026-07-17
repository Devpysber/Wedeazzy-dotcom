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

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { ok: false, code: 'ERR_RATE', message: 'Too many inquiries. Try again in a minute.' },
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
    sanitizeFields(req.body, ['name', 'notes', 'message', 'phone', 'eventType'], 1000);

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

module.exports = { postPublic, postAsCouple, listForVendor, patchStatus, publicLimiter };
