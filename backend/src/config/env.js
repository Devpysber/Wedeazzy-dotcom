const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: (() => {
    const p = process.env.PORT || '4000';
    return /^\d+$/.test(p) ? parseInt(p, 10) : p;
  })(),
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || 'http://localhost:4000',
  FRONTEND_ORIGIN: (process.env.FRONTEND_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean),

  DATABASE_URL: process.env.DATABASE_URL,

  JWT_SECRET: process.env.JWT_SECRET || 'dev-only-change-me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '30d',

  OTP_TTL_MIN: parseInt(process.env.OTP_TTL_MIN || '5', 10),
  OTP_MAX_PER_HOUR: parseInt(process.env.OTP_MAX_PER_HOUR || '5', 10),
  OTP_LENGTH: parseInt(process.env.OTP_LENGTH || '6', 10),
  OTP_DEBUG_LOG: String(process.env.OTP_DEBUG_LOG || 'false').toLowerCase() === 'true',

  BAILEYS_AUTH_DIR: process.env.BAILEYS_AUTH_DIR || './baileys-auth',
  WA_MAX_RECONNECT_ATTEMPTS: parseInt(process.env.WA_MAX_RECONNECT_ATTEMPTS || '10', 10),
  WA_RECONNECT_BASE_MS: parseInt(process.env.WA_RECONNECT_BASE_MS || '3000', 10),
  WA_RETRY_MAX_ATTEMPTS: parseInt(process.env.WA_RETRY_MAX_ATTEMPTS || '3', 10),
  WA_RETRY_BACKOFF_MS: parseInt(process.env.WA_RETRY_BACKOFF_MS || '300000', 10), // 5 min default

  ADMIN_PHONES: (process.env.ADMIN_PHONES || '').split(',').map(s => s.trim()).filter(Boolean),

  // Notification recipients — configurable, never hardcoded in senders.
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || '',
  SUPPORT_EMAIL: process.env.SUPPORT_EMAIL || '',

  UPLOAD_DIR: process.env.UPLOAD_DIR || './uploads',
  MAX_UPLOAD_MB: parseInt(process.env.MAX_UPLOAD_MB || '5', 10),

  // --- SMTP Email ---
  SMTP: {
    host: process.env.SMTP_HOST || 'smtp.hostinger.com',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE.toLowerCase() === 'true' : (parseInt(process.env.SMTP_PORT || '465', 10) === 465),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'WedEazzy <info@wedeazzy.com>',
  },

  // --- Google Sheet CSV Source ---
  GOOGLE_SHEET_CSV_URL: process.env.GOOGLE_SHEET_CSV_URL || 'https://docs.google.com/spreadsheets/d/1CwsdKKUYXZQBcVTHnbCsN72MiM9lIUSxl9mP9PTnVlA/export?format=csv&gid=0',

  // --- Google OAuth ---
  GOOGLE: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:4000/google/callback',
  },

  RAZORPAY: {
    keyId:         process.env.RAZORPAY_KEY_ID     || '',
    keySecret:     process.env.RAZORPAY_KEY_SECRET  || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },
};

// Lazy-load logger to avoid circular dependency during env initialization
function getLogger() {
  try { return require('./logger'); } catch { return console; }
}

if (!env.DATABASE_URL && env.NODE_ENV !== 'test') {
  getLogger().warn('[env] DATABASE_URL is not set — database connections will fail');
}
if (env.JWT_SECRET === 'dev-only-change-me' && env.NODE_ENV === 'production') {
  throw new Error('Refusing to boot in production with the default JWT_SECRET. Set a strong JWT_SECRET in .env.');
}
if (env.JWT_SECRET.includes('please_change_this') && env.NODE_ENV === 'production') {
  throw new Error('Refusing to boot in production with a placeholder JWT_SECRET. Generate a secure secret.');
}
if (env.OTP_DEBUG_LOG && env.NODE_ENV === 'production') {
  throw new Error('[SECURITY] Refusing to boot in production with OTP_DEBUG_LOG=true — this logs generated OTPs to the console and returns them in API responses, leaking one-time codes. Set OTP_DEBUG_LOG=false.');
}
if (!env.SMTP.user && env.NODE_ENV === 'production') {
  getLogger().warn('[env] SMTP_USER is not set — email OTP and notification flows will use console fallback.');
}
if (env.ADMIN_PHONES.length === 0) {
  getLogger().warn('[env] ADMIN_PHONES is empty — no admin WhatsApp notifications will be sent for new inquiries.');
}

module.exports = env;
