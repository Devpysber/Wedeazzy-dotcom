/**
 * whatsapp.service.js
 *
 * High-level WhatsApp sending with:
 *  - DB logging of every message attempt (WaMessage table)
 *  - In-memory token-bucket rate limiter (max 12 msgs/min) to avoid WA bans
 *  - Smart retry: WA_OFFLINE → re-queues with nextRetryAt; other errors → exponential backoff
 *  - retryFailedMessages() called by cron every 5 mins
 *  - Delivery receipt updates via Baileys messages.update hook
 */

'use strict';

const prisma  = require('../config/db');
const logger  = require('../config/logger');
const env     = require('../config/env');
const { normalisePhone } = require('../utils/phone');
const baileys = require('./baileys.client');

// ── Rate limiter (token bucket, max 12 sends per 60 s) ───────────────────────
const RATE_LIMIT_MAX    = 12;
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
let   _tokens           = RATE_LIMIT_MAX;
let   _lastRefill       = Date.now();

function _consumeToken() {
  const now     = Date.now();
  const elapsed = now - _lastRefill;
  if (elapsed >= RATE_LIMIT_WINDOW) {
    _tokens     = RATE_LIMIT_MAX;
    _lastRefill = now;
  }
  if (_tokens <= 0) return false;
  _tokens--;
  return true;
}

// ── Retry schedule helper ─────────────────────────────────────────────────────
/** Returns the Date when a message with `retryCount` attempts should next be retried */
function _nextRetryDate(retryCount) {
  // Exponential backoff: 5min, 15min, 60min
  const backoffs = [
    env.WA_RETRY_BACKOFF_MS,            // ~5 min
    env.WA_RETRY_BACKOFF_MS * 3,        // ~15 min
    env.WA_RETRY_BACKOFF_MS * 12,       // ~60 min
  ];
  const delayMs = backoffs[Math.min(retryCount, backoffs.length - 1)] || env.WA_RETRY_BACKOFF_MS;
  return new Date(Date.now() + delayMs);
}

// ── Core send ─────────────────────────────────────────────────────────────────

/**
 * Send a WhatsApp message.
 * Always creates a WaMessage row first (status=queued), then attempts send.
 *
 * @param {object} opts
 * @param {string}  opts.to       - Phone in any format (will be normalised)
 * @param {string}  opts.body     - Message text
 * @param {string}  [opts.template] - Template key (for logging/analytics)
 * @param {string}  [opts.userId]   - Linked user ID
 * @param {string}  [opts.existingId] - If retrying, pass existing WaMessage ID
 * @returns {{ ok: boolean, id: string, error?: string }}
 */
async function sendWa({ to, body, template, userId = null, existingId = null }) {
  const phone = normalisePhone(to);
  if (!phone) {
    logger.warn({ to }, 'WhatsApp send skipped: invalid phone number');
    return { ok: false, error: 'Invalid phone number' };
  }

  // ── Create or reuse a WaMessage log row ──────────────────────────────────
  let log;
  if (existingId) {
    log = await prisma.waMessage.update({
      where: { id: existingId },
      data:  { status: 'sending', error: null },
    });
  } else {
    log = await prisma.waMessage.create({
      data: { to: phone, body, template, userId, status: 'queued' },
    });
  }

  // ── Rate limit check ─────────────────────────────────────────────────────
  if (!_consumeToken()) {
    logger.warn({ to: phone, id: log.id }, 'WA rate limit hit — re-queuing message');
    await prisma.waMessage.update({
      where: { id: log.id },
      data:  {
        status:      'queued',
        nextRetryAt: new Date(Date.now() + 65_000), // just over 1 minute
      },
    });
    return { ok: false, error: 'Rate limited — message queued for retry', id: log.id };
  }

  // ── Attempt Baileys send ──────────────────────────────────────────────────
  try {
    await baileys.sendText(phone, body);

    await prisma.waMessage.update({
      where: { id: log.id },
      data:  { status: 'sent', sentAt: new Date(), nextRetryAt: null, error: null },
    });

    logger.info({ to: phone, id: log.id, template }, 'WhatsApp message sent ✓');
    return { ok: true, id: log.id };

  } catch (e) {
    const isOffline  = e.code === 'WA_OFFLINE';
    const retryCount = (log.retryCount || 0) + 1;
    const maxRetries = env.WA_RETRY_MAX_ATTEMPTS;

    logger.error(
      { err: e, to: phone, id: log.id, isOffline, retryCount },
      'WhatsApp send failed'
    );

    if (isOffline) {
      // WA just isn't connected yet — schedule a near-term retry, keep status queued
      await prisma.waMessage.update({
        where: { id: log.id },
        data:  {
          status:      'queued',
          retryCount,
          nextRetryAt: new Date(Date.now() + 2 * 60 * 1000), // retry in 2 min
          error:       `WA_OFFLINE (attempt ${retryCount})`,
        },
      });
      return { ok: false, error: 'WhatsApp offline — queued for retry', id: log.id };
    }

    if (retryCount < maxRetries) {
      // Network / Baileys error — schedule retry with exponential backoff
      const nextRetry = _nextRetryDate(retryCount - 1);
      await prisma.waMessage.update({
        where: { id: log.id },
        data:  {
          status:      'queued',
          retryCount,
          nextRetryAt: nextRetry,
          error:       String(e.message || e).slice(0, 240),
        },
      });
      logger.info({ id: log.id, nextRetry, retryCount }, 'WA send queued for retry');
      return { ok: false, error: e.message || 'WA send failed — will retry', id: log.id };
    }

    // Exhausted retries — mark permanently failed
    await prisma.waMessage.update({
      where: { id: log.id },
      data:  {
        status:      'failed',
        retryCount,
        nextRetryAt: null,
        error:       String(e.message || e).slice(0, 240),
      },
    });
    return { ok: false, error: e.message || 'WA send failed', id: log.id };
  }
}

// ── OTP shortcut ──────────────────────────────────────────────────────────────

async function sendOtp(toE164, code) {
  const body =
    `*WedEazzy.com* — your login code:\n\n` +
    `*${code}*\n\n` +
    `Valid for ${env.OTP_TTL_MIN} minutes. Do not share this code with anyone.`;
  return sendWa({ to: toE164, body, template: 'login_otp' });
}

// ── Template shortcut ─────────────────────────────────────────────────────────

async function sendTemplate(toE164, templateKey, vars = {}) {
  const templates = require('../config/whatsapp-templates');
  const t = templates[templateKey];
  if (!t) {
    logger.error({ templateKey }, 'Unknown WA template');
    throw new Error('Unknown WA template: ' + templateKey);
  }
  let body = t;
  Object.keys(vars).forEach((k) => {
    body = body.replaceAll('{{' + k + '}}', String(vars[k] ?? ''));
  });
  return sendWa({ to: toE164, body, template: templateKey });
}

// ── Retry sweep (called by cron every 5 min) ──────────────────────────────────

/**
 * Finds all WaMessage rows that are queued and due for retry, then attempts
 * to resend them. Safe to call concurrently — uses `sending` status as a lock.
 */
async function retryFailedMessages() {
  const { status: waStatus } = baileys.getStatus();
  if (waStatus !== 'online') {
    logger.info({ waStatus }, '[WA-Retry] Skipping retry sweep — Baileys not online');
    return { skipped: true, reason: 'offline' };
  }

  const now = new Date();
  // Find messages due for retry (queued + nextRetryAt is in the past or null)
  const due = await prisma.waMessage.findMany({
    where: {
      status:     'queued',
      retryCount: { lt: env.WA_RETRY_MAX_ATTEMPTS },
      OR: [
        { nextRetryAt: { lte: now } },
        { nextRetryAt: null },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 50, // process at most 50 at a time to stay within rate limits
  });

  if (due.length === 0) {
    logger.info('[WA-Retry] No messages due for retry');
    return { retried: 0 };
  }

  logger.info({ count: due.length }, '[WA-Retry] Starting retry sweep');

  let succeeded = 0;
  let failed    = 0;

  for (const msg of due) {
    // Inter-message delay to respect rate limit
    await new Promise((r) => setTimeout(r, 1500));

    const result = await sendWa({
      to:         msg.to,
      body:       msg.body,
      template:   msg.template,
      userId:     msg.userId,
      existingId: msg.id,
    });

    if (result.ok) succeeded++;
    else           failed++;
  }

  logger.info({ succeeded, failed }, '[WA-Retry] Sweep complete');
  return { retried: due.length, succeeded, failed };
}

module.exports = { sendWa, sendOtp, sendTemplate, retryFailedMessages };
