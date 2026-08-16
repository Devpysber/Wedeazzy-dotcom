/**
 * WhatsApp Baileys — Admin API Routes
 *
 * Public:
 *   GET  /api/whatsapp/status        connection status (for health checks)
 *
 * Admin-only:
 *   GET  /api/whatsapp/qr            QR HTML page (scan with dedicated phone)
 *   GET  /api/whatsapp/qr-data       JSON {qrDataUrl, status, hasQr, lastError} for dashboard poll
 *   POST /api/whatsapp/pairing-code  { phone } → request 8-char pairing code
 *   POST /api/whatsapp/connect       (re)start the Baileys session and generate a fresh QR
 *   POST /api/whatsapp/disconnect    logout and clear auth state
 *   GET  /api/whatsapp/events        SSE stream of connection state changes
 *   GET  /api/whatsapp/logs          paginated WaMessage log from DB
 *   POST /api/whatsapp/send          { to, body } direct send
 *   POST /api/whatsapp/test-send     (alias of /send, kept for back-compat)
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const baileys = require('../services/baileys.client');
const logger = require('../config/logger');
const { requireAuth, requireRole } = require('../middleware/auth');
const { rateLimitHandler } = require('../utils/rateLimitLogger');

const router = express.Router();

// Dedicated limiter for WhatsApp routes. The global limiter skips /api/whatsapp/*
// (for SSE + dashboard polling), so this restores per-IP abuse protection.
// Streaming/poll endpoints are skipped so the live dashboard is never throttled.
const whatsappMessage = { success: false, error: 'Too many WhatsApp requests. Please try again shortly.' };
const whatsappLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const p = req.originalUrl || req.path;
    return p.includes('/events') || p.includes('/qr-data') || p.includes('/status') || p.includes('/qr');
  },
  handler: rateLimitHandler(whatsappMessage),
  message: whatsappMessage
});
router.use(whatsappLimiter);

// ── Public ────────────────────────────────────────────────────────────────────

/** Quick health status — no auth required so monitoring tools can probe it */
router.get('/status', (req, res) => {
  res.json({ ok: true, ...baileys.getStatus() });
});

/**
 * QR HTML page — for first-time pairing via browser.
 * Admin-only: anyone who can scan this QR can link a new device to the
 * business WhatsApp account (used for OTP delivery + customer notifications),
 * effectively hijacking that channel. Open from the admin dashboard with
 * ?token=<adminJWT> if not viewing it in an already-authenticated session.
 */
router.get('/qr', requireAuth, requireRole('admin'), (req, res) => {
  const dataUrl = baileys.getQrPng();
  const { status, lastError } = baileys.getStatus();
  res.set('Content-Type', 'text/html; charset=utf-8');

  if (!dataUrl) {
    return res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="refresh" content="5">
        <title>WedEazzy WhatsApp</title>
        <style>
          body { font-family: system-ui, sans-serif; padding: 40px; text-align: center; background: #FBF7F2; }
          .status { display: inline-block; padding: 6px 18px; border-radius: 20px; font-weight: 700; font-size: 0.9rem;
                    background: ${status === 'online' ? '#d1fae5' : '#fee2e2'}; color: ${status === 'online' ? '#065f46' : '#991b1b'}; }
        </style>
      </head>
      <body>
        <h2>WedEazzy WhatsApp — no QR right now</h2>
        <p>Status: <span class="status">${status}</span>${lastError ? ' (' + lastError + ')' : ''}</p>
        <p>${status === 'online' ? '✅ Already paired!' : 'Refresh in a few seconds…'}</p>
        <p><a href="/api/whatsapp/qr">↺ Refresh</a></p>
      </body>
      </html>`);
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Pair WedEazzy WhatsApp</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 32px; text-align: center; background: #FBF7F2; }
        img { width: 300px; height: 300px; border-radius: 14px; box-shadow: 0 8px 24px rgba(0,0,0,.12); margin: 16px 0; }
        p { color: #79706A; font-size: 0.88rem; }
      </style>
    </head>
    <body>
      <h2>Pair WedEazzy WhatsApp</h2>
      <p>Open WhatsApp → <strong>Linked Devices</strong> → <strong>Link a Device</strong>, then scan:</p>
      <img src="${dataUrl}" alt="QR Code" />
      <p>QR refreshes every 8 s. This page auto-reloads.</p>
      <script>setTimeout(() => location.reload(), 8000);</script>
    </body>
    </html>`);
});

// ── Admin-only ────────────────────────────────────────────────────────────────

const adminOnly = [requireAuth, requireRole('admin')];

/**
 * JSON QR data for dashboard polling.
 * Returns: { status, hasQr, qrDataUrl, hasPairingCode, pairingCode, lastError }
 */
router.get('/qr-data', adminOnly, (req, res) => {
  const snap = baileys.getStatus();
  res.json({
    ok: true,
    status: snap.status,
    lastError: snap.lastError,
    hasQr: snap.hasQr,
    qrDataUrl: baileys.getQrPng() || null,
    hasPairingCode: snap.hasPairingCode,
    pairingCode: baileys.getPairingCode() || null,
  });
});

/**
 * Request a pairing code.
 * Body: { phone: "919876543210" }
 * Returns: { ok: true, code: "ABCD-1234" }
 */
router.post('/pairing-code', adminOnly, async (req, res, next) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ ok: false, code: 'ERR_INPUT', message: 'phone is required (E.164 without +)' });
    }
    const code = await baileys.requestPairingCode(phone);
    res.json({ ok: true, code });
  } catch (e) {
    next(e);
  }
});

/**
 * (Re)start the Baileys session — the only way to get a fresh QR after a
 * manual disconnect or after reconnect attempts are exhausted, since neither
 * of those states auto-restarts on their own.
 */
router.post('/connect', adminOnly, async (req, res, next) => {
  try {
    const snap = baileys.getStatus();
    if (snap.status === 'online') {
      return res.json({ ok: true, message: 'Already connected.', status: snap.status });
    }
    if (snap.status === 'connecting' || snap.status === 'qr') {
      return res.json({ ok: true, message: 'Session already starting — waiting for QR scan.', status: snap.status });
    }
    // Fire-and-forget: initBaileys() resolves once the socket is created, well
    // before pairing completes — the frontend follows progress via SSE/polling.
    baileys.initBaileys().catch((e) => logger.error({ err: e }, 'Baileys connect failed'));
    res.json({ ok: true, message: 'Starting WhatsApp session…' });
  } catch (e) {
    next(e);
  }
});

/**
 * Disconnect from WhatsApp and clear credentials.
 */
router.post('/disconnect', adminOnly, async (req, res, next) => {
  try {
    await baileys.disconnect();
    res.json({ ok: true, message: 'Disconnected and auth state cleared. Restart Baileys to reconnect.' });
  } catch (e) {
    next(e);
  }
});

/**
 * SSE stream — emits state change events.
 * Client receives: data: {"status":"online","hasQr":false,...}\n\n
 */
router.get('/events', adminOnly, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable Nginx buffering
  });
  res.flushHeaders();

  // Send current state immediately on connect
  const snap = baileys.getStatus();
  res.write(`data: ${JSON.stringify(snap)}\n\n`);

  const handler = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  baileys.getEmitter().on('state', handler);

  // Heartbeat every 25 s to keep connection alive through proxies
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    baileys.getEmitter().off('state', handler);
  });
});

/**
 * Paginated WaMessage log from DB.
 * Query: ?page=1&limit=20&status=sent|failed|queued
 */
router.get('/logs', adminOnly, async (req, res, next) => {
  try {
    const prisma = require('../config/db');
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, parseInt(req.query.limit || '20', 10));
    const statusFilter = req.query.status;

    const where = statusFilter ? { status: statusFilter } : {};

    const [messages, total] = await Promise.all([
      prisma.waMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { name: true, phone: true, email: true } } },
      }),
      prisma.waMessage.count({ where }),
    ]);

    res.json({ ok: true, data: messages, total, page, pages: Math.ceil(total / limit) });
  } catch (e) {
    next(e);
  }
});

/**
 * Send a direct WhatsApp message.
 * Body: { to: "919876543210", body: "Hello!" }
 */
router.post('/send', adminOnly, async (req, res, next) => {
  try {
    const { to, body } = req.body;
    if (!to || !body) {
      return res.status(400).json({ ok: false, code: 'ERR_INPUT', message: 'to and body are required' });
    }
    const r = await require('../services/whatsapp.service').sendWa({ to, body, userId: req.user.id });
    res.json(r);
  } catch (e) {
    next(e);
  }
});

/** Backwards-compatible alias for test sends */
router.post('/test-send', adminOnly, async (req, res, next) => {
  try {
    const { to, body } = req.body;
    if (!to || !body) {
      return res.status(400).json({ ok: false, code: 'ERR_INPUT', message: 'to and body required' });
    }
    const r = await require('../services/whatsapp.service').sendWa({ to, body, userId: req.user.id });
    res.json(r);
  } catch (e) {
    next(e);
  }
});

/**
 * Send a WhatsApp broadcast/campaign to real recipients.
 * Body: { name, template (custom message text), segment, delaySeconds, mediaUrl? }
 * Sends the message to every user matching `segment` who has a phone number.
 * When mediaUrl is set (from POST /api/upload/photo), sends an image message
 * with `template` as the caption instead of a plain text message. Responds
 * immediately with the recipient count — actual sending happens in the
 * background, spaced out by delaySeconds (default 60s, min 5s, max 300s) to
 * avoid tripping WhatsApp's anti-spam limits.
 * Every send is logged to WaMessage tagged with campaignName, so GET /campaigns
 * can show real sent/failed stats per broadcast — no fake success.
 */
const VALID_WA_SEGMENTS = ['all', 'vendors', 'couples'];

// Starting a broadcast spawns a long-running background send loop (see below
// — a few hundred recipients at 60s apart can run for hours). The shared
// whatsappLimiter (2000/15min) is sized for dashboard polling, not for this;
// a compromised/careless admin session could otherwise fire this repeatedly
// and spawn many overlapping broadcast loops, causing duplicate sends and
// real risk of the WhatsApp number getting banned for spam-like behavior.
const campaignStartMessage = { ok: false, code: 'ERR_RATE', message: 'Too many campaigns started. Please wait before starting another.' };
const campaignStartLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler(campaignStartMessage),
  message: campaignStartMessage,
});

router.post('/campaign', campaignStartLimiter, adminOnly, async (req, res, next) => {
  try {
    const { name, template, segment, delaySeconds, mediaUrl } = req.body;
    if (!template || !String(template).trim()) {
      return res.status(400).json({ ok: false, code: 'ERR_INPUT', message: 'template message text is required' });
    }
    // Segment resolution mirrors createEmailCampaign in admin.controller.js —
    // same audience model, same "vendor_category:<slug>" convention.
    const isVendorCategorySegment = typeof segment === 'string' && segment.startsWith('vendor_category:');
    if (!VALID_WA_SEGMENTS.includes(segment) && !isVendorCategorySegment) {
      return res.status(400).json({ ok: false, code: 'ERR_INPUT', message: `Segment must be one of: ${VALID_WA_SEGMENTS.join(', ')}, or vendor_category:<slug>` });
    }
    const delayMs = Math.max(5, Math.min(parseInt(delaySeconds, 10) || 60, 300)) * 1000;
    const campaignName = (name && String(name).trim()) || `Campaign ${new Date().toISOString()}`;

    const prisma = require('../config/db');
    const where = { phone: { not: null } };
    if (isVendorCategorySegment) {
      const categorySlug = segment.slice('vendor_category:'.length);
      if (!categorySlug) {
        return res.status(400).json({ ok: false, code: 'ERR_INPUT', message: 'A vendor category must be selected' });
      }
      where.role = 'vendor';
      where.vendor = { some: { categorySlug } };
    } else if (segment === 'vendors') where.role = 'vendor';
    else if (segment === 'couples') where.role = 'couple';
    else where.role = { not: 'admin' }; // "all" = every marketing-eligible account, not internal admins

    // Unbounded (mirrors createEmailCampaign) — an earlier fixed-cap version of
    // this query (first 500, then 20000) silently dropped recipients once the
    // combined vendor+couple table grew past the cap. A WhatsApp campaign must
    // reach the whole matching segment, however large it grows.
    const recipients = await prisma.user.findMany({
      where,
      select: { id: true, phone: true },
      orderBy: { createdAt: 'desc' },
    });

    const estMinutes = Math.round((recipients.length * delayMs) / 60000);
    res.json({
      ok: true,
      campaign: campaignName,
      segment,
      recipients: recipients.length,
      message: recipients.length === 0
        ? `Campaign "${campaignName}" found no recipients matching that segment — nothing was sent.`
        : `Campaign "${campaignName}" started — sending to ${recipients.length} recipient(s), ${Math.round(delayMs / 1000)}s apart (about ${estMinutes} min total).`,
    });

    // Fire-and-forget: the admin's request already returned. A few hundred
    // recipients at 60s apart can take hours, far past any HTTP timeout.
    const svc = require('../services/whatsapp.service');
    (async () => {
      for (const u of recipients) {
        try {
          await svc.sendWa({ to: u.phone, body: String(template), template: 'admin_campaign', campaignName, userId: u.id, mediaUrl: mediaUrl || null });
        } catch (err) {
          logger.error({ err, to: u.phone, campaignName }, 'WhatsApp campaign send failed');
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    })().catch((err) => logger.error({ err, campaignName }, 'WhatsApp campaign run crashed'));
  } catch (e) {
    next(e);
  }
});

/**
 * List real broadcast campaigns with aggregate stats, grouped by campaignName.
 * Powers the "Sent Broadcast Campaigns" panel in the admin WhatsApp section.
 */
router.get('/campaigns', adminOnly, async (req, res, next) => {
  try {
    const prisma = require('../config/db');
    const rows = await prisma.waMessage.findMany({
      where: { campaignName: { not: null } },
      select: { campaignName: true, status: true, body: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    const byName = new Map();
    for (const r of rows) {
      if (!byName.has(r.campaignName)) {
        byName.set(r.campaignName, {
          name: r.campaignName,
          template: r.body,
          createdAt: r.createdAt,
          sentCount: 0,
          failedCount: 0,
          queuedCount: 0,
          total: 0,
        });
      }
      const c = byName.get(r.campaignName);
      c.total += 1;
      if (r.status === 'sent') c.sentCount += 1;
      else if (r.status === 'failed') c.failedCount += 1;
      else c.queuedCount += 1;
    }

    const campaigns = Array.from(byName.values()).map((c) => ({
      ...c,
      status: c.queuedCount > 0 ? 'sending' : (c.failedCount > 0 && c.sentCount === 0 ? 'failed' : 'completed'),
    }));

    res.json({ ok: true, campaigns });
  } catch (e) {
    next(e);
  }
});

/**
 * Send a named template message.
 * Body: { to: "919876543210", template: "vendor_approved", vars: { name: "Raj", businessName: "Raj Caterers", ... } }
 */
router.post('/send-template', adminOnly, async (req, res, next) => {
  try {
    const { to, template, vars = {} } = req.body;
    if (!to || !template) {
      return res.status(400).json({ ok: false, code: 'ERR_INPUT', message: 'to and template are required' });
    }
    const r = await require('../services/whatsapp.service').sendTemplate(to, template, vars);
    res.json(r);
  } catch (e) {
    next(e);
  }
});

/**
 * Admin-triggered retry sweep — retries all queued/failed messages that are due.
 * Returns: { ok, retried, succeeded, failed } or { ok, skipped, reason } when WA offline.
 */
router.post('/retry-failed', adminOnly, async (req, res, next) => {
  try {
    const result = await require('../services/whatsapp.service').retryFailedMessages();
    res.json({ ok: true, ...result });
  } catch (e) {
    next(e);
  }
});

/**
 * List available WA templates (for admin UI template selector).
 */
router.get('/templates', adminOnly, (req, res) => {
  const templates = require('../config/whatsapp-templates');
  res.json({ ok: true, templates: Object.keys(templates) });
});

/**
 * WaMessage aggregate stats.
 */
router.get('/stats', adminOnly, async (req, res, next) => {
  try {
    const stats = await baileys.getWaStats();
    res.json({ ok: true, ...stats });
  } catch (e) {
    next(e);
  }
});

module.exports = router;

