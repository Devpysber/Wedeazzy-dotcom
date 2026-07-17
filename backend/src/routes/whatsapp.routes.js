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

const router = express.Router();

// Dedicated limiter for WhatsApp routes. The global limiter skips /api/whatsapp/*
// (for SSE + dashboard polling), so this restores per-IP abuse protection.
// Streaming/poll endpoints are skipped so the live dashboard is never throttled.
const whatsappLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const p = req.originalUrl || req.path;
    return p.includes('/events') || p.includes('/qr-data') || p.includes('/status') || p.includes('/qr');
  },
  message: { success: false, error: 'Too many WhatsApp requests. Please try again shortly.' }
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
 * Body: { name, template (message text), recipientCount }
 * Sends the message to couples (customers) who have a phone number, bounded by
 * recipientCount (hard-capped at 500). Every send is logged to WaMessage and,
 * when WhatsApp is offline, safely queued for retry — no fake success.
 */
router.post('/campaign', adminOnly, async (req, res, next) => {
  try {
    const { name, template, recipientCount } = req.body;
    if (!template || !String(template).trim()) {
      return res.status(400).json({ ok: false, code: 'ERR_INPUT', message: 'template message text is required' });
    }
    const cap = Math.max(1, Math.min(parseInt(recipientCount, 10) || 0, 500));

    const prisma = require('../config/db');
    const recipients = await prisma.user.findMany({
      where: { role: 'couple', phone: { not: null } },
      select: { id: true, phone: true },
      take: cap,
      orderBy: { createdAt: 'desc' },
    });

    const svc = require('../services/whatsapp.service');
    let queued = 0;
    for (const u of recipients) {
      const r = await svc.sendWa({ to: u.phone, body: String(template), template: 'admin_campaign', userId: u.id });
      if (r && r.id) queued++; // a WaMessage row was created (sent or queued for retry)
    }

    res.json({ ok: true, campaign: name || 'Campaign', requested: cap, recipients: recipients.length, queued });
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

