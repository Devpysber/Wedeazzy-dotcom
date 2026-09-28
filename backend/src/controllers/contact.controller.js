const emailService = require('../services/email.service');
const env = require('../config/env');
const logger = require('../config/logger');
const { HttpError } = require('../middleware/error');
const { sanitizeFields } = require('../utils/sanitize');

/**
 * Handle contact form submission
 */
async function postContactForm(req, res, next) {
  try {
    req.body = req.body || {};

    // Sanitize user-supplied text fields to prevent XSS. Must run BEFORE
    // destructuring below — sanitizeFields mutates req.body in place, so
    // reading the fields out first would silently use the unsanitized values.
    sanitizeFields(req.body, ['name', 'subject', 'message', 'email'], 2000);

    const { name, email, subject, message } = req.body;

    if (!name || !name.trim()) {
      throw new HttpError(400, 'Name is required', 'ERR_INPUT');
    }
    if (!email || !email.trim() || !email.includes('@')) {
      throw new HttpError(400, 'A valid email address is required', 'ERR_INPUT');
    }
    if (!message || !message.trim()) {
      throw new HttpError(400, 'Message is required', 'ERR_INPUT');
    }

    const adminEmail = env.ADMIN_EMAIL || env.SMTP.user;
    if (!adminEmail) {
      throw new HttpError(500, 'Contact form is temporarily unavailable. Please try again later.', 'ERR_NO_RECIPIENT');
    }

    // sendMail() never throws — it resolves { ok: false } on SMTP failure and
    // { fallback: true } when SMTP isn't configured. Either way the message was
    // NOT delivered, and email is its only destination, so report the failure
    // instead of telling the visitor it was sent.
    const result = await emailService.sendContactFormEmail(adminEmail, {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      subject: (subject || '').trim(),
      message: message.trim()
    });
    if (!result || !result.ok || result.fallback) {
      logger.error({ email: email.trim().toLowerCase(), subject, result }, 'Contact form message could not be delivered');
      const deliveryErr = new HttpError(502, 'We could not send your message right now. Please try again in a few minutes.', 'ERR_DELIVERY_FAILED');
      deliveryErr.expose = true; // user-facing wording, safe to return despite the 5xx status
      throw deliveryErr;
    }

    res.json({
      ok: true,
      message: 'Your message has been sent successfully. Our support team will get in touch with you shortly.'
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  postContactForm
};
