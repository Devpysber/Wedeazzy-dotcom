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
    sanitizeFields(req.body, ['name', 'subject', 'message'], 2000);

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

    await emailService.sendContactFormEmail(adminEmail, {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      subject: (subject || '').trim(),
      message: message.trim()
    });

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
