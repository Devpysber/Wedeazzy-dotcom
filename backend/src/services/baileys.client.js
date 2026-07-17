/**
 * Baileys singleton WhatsApp-Web client.
 *
 * Features:
 *  - QR-code login (scan with WhatsApp camera)
 *  - Pairing-code login (enter code on WhatsApp → Linked Devices)
 *  - Exponential-backoff auto-reconnect (max configurable retries)
 *  - Server-Sent Events (SSE) emitter for live dashboard updates
 *  - Graceful shutdown (logs out + closes socket)
 *  - WaMessage stats from DB via Prisma
 */

const path = require('path');
const fs = require('fs');
const QR = require('qrcode');
const { EventEmitter } = require('events');
const env = require('../config/env');
const logger = require('../config/logger');

// ── State ─────────────────────────────────────────────────────────────────────

/** @type {'starting'|'qr'|'pairing'|'connecting'|'online'|'offline'|'error'} */
let status = 'starting';
let lastError = null;
let lastQrPng = null;       // data:image/png;base64,...
let lastQrRaw = null;       // raw QR string for frontend rendering
let lastPairingCode = null; // 8-char code returned by requestPairingCode()
let sock = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let isShuttingDown = false;
/** Callback registered by whatsapp.service to receive delivery receipt updates */
let deliveryCallback = null;

// Guard against rapid restartRequired storm — WA sends 515 when it rejects our
// session (stale creds, duplicate device, version mismatch). Without this counter
// the code was calling initBaileys() in an infinite tight loop.
let _restartRequiredCount = 0;
let _restartRequiredWindowStart = 0;
const MAX_RAPID_RESTARTS = 3;       // max 3 immediate restarts within 60 s
const RAPID_RESTART_WINDOW_MS = 60_000;

// Cache the WA protocol version so we don't hit the version endpoint on every
// reconnect (especially problematic in rapid-restart scenarios).
let _cachedBaileysVersion = undefined;

// SSE event bus – route handlers subscribe to this
const sseEmitter = new EventEmitter();
sseEmitter.setMaxListeners(100); // many concurrent admin tabs OK

// ── Helpers ───────────────────────────────────────────────────────────────────

const MAX_RECONNECT_ATTEMPTS = env.WA_MAX_RECONNECT_ATTEMPTS || 5;
const RECONNECT_BASE_MS = env.WA_RECONNECT_BASE_MS || 3000;
const MAX_RECONNECT_MS = 60_000; // cap at 60 s

function backoffMs(attempt) {
  const base = RECONNECT_BASE_MS * Math.pow(2, attempt);
  const jitter = Math.random() * 1000;
  return Math.min(base + jitter, MAX_RECONNECT_MS);
}

function setStatus(next, err = null) {
  status = next;
  lastError = err;
  sseEmitter.emit('state', { status: next, lastError: err, hasQr: !!lastQrPng });
  logger.info({ status: next }, 'Baileys status changed');
}

// ── Core: init ────────────────────────────────────────────────────────────────

/**
 * Initialise (or re-initialise) the Baileys socket.
 * Safe to call multiple times – will tear down the old socket first.
 *
 * @param {boolean} [usePairingCode=false]  Skip QR and use phone-pairing flow
 * @param {string}  [pairingPhone]          E.164 number for the pairing flow
 */
async function initBaileys(usePairingCode = false, pairingPhone = null) {
  if (isShuttingDown) return;

  // Reset all counters on every explicit (re)start so the admin "Reconnect"
  // button always gets a full set of attempts regardless of prior failures.
  reconnectAttempt = 0;
  _restartRequiredCount = 0;
  _restartRequiredWindowStart = 0;

  // Tear down previous socket and timers cleanly
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (sock) {
    try { sock.ev.removeAllListeners(); } catch (_) {}
    try { sock.end(); } catch (_) {}
    sock = null;
  }

  const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
  } = require('@whiskeysockets/baileys');

  const authDir = path.resolve(env.BAILEYS_AUTH_DIR);
  
  // Verify directory is created and writable
  try {
    fs.mkdirSync(authDir, { recursive: true });
    // Write test file to ensure the directory is writable
    const tempFile = path.join(authDir, '.write-test-' + Date.now());
    fs.writeFileSync(tempFile, 'write-test');
    fs.unlinkSync(tempFile);
    logger.info({ authDir }, 'Baileys auth directory verified as writable');
  } catch (err) {
    logger.error({ err, authDir }, 'Baileys auth directory is not writable');
    setStatus('error', 'Auth directory not writable: ' + err.message);
    throw err;
  }

  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  // Fetch version once and cache it — avoids hammering the WA endpoint on
  // every reconnect cycle (especially critical in rapid-restart scenarios).
  let version;
  if (_cachedBaileysVersion) {
    version = _cachedBaileysVersion;
  } else {
    try {
      ({ version } = await fetchLatestBaileysVersion());
      _cachedBaileysVersion = version;
      logger.info({ version: version?.join('.') }, 'Baileys WA protocol version fetched and cached');
    } catch (_) {
      version = undefined;
      logger.warn('Failed to fetch latest Baileys version — using Baileys default');
    }
  }

  const socketOpts = {
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['WedEazzy', 'Chrome', '1.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    // Disable QR when pairing-code is requested
    ...(usePairingCode ? { qrTimeout: 0 } : {}),
  };

  sock = makeWASocket(socketOpts);
  setStatus('connecting');

  // ── Persist credentials ─────────────────────────────────────────────────────
  sock.ev.on('creds.update', saveCreds);

  // ── Pairing code request (must fire AFTER socket is created) ────────────────
  if (usePairingCode && pairingPhone) {
    const cleanPhone = String(pairingPhone).replace(/[^0-9]/g, '');
    try {
      // Small delay required by Baileys before requesting code
      await new Promise((r) => setTimeout(r, 2000));
      const code = await sock.requestPairingCode(cleanPhone);
      lastPairingCode = code;
      setStatus('pairing');
      logger.info({ code }, 'Baileys pairing code generated');
    } catch (e) {
      logger.error({ err: e }, 'Failed to request Baileys pairing code');
      setStatus('error', e.message);
    }
  }

  // ── Message delivery receipt tracking ───────────────────────────────────────
  // Baileys fires messages.update when a sent message is delivered/read/fails.
  // We forward those updates to whatsapp.service via the deliveryCallback.
  sock.ev.on('messages.update', (updates) => {
    for (const update of updates) {
      if (!update.key || !update.update) continue;
      const { status: msgStatus } = update.update;
      // Baileys message statuses: 0=error, 1=pending, 2=server_ack, 3=delivery_ack, 4=read, 5=played
      if (msgStatus !== undefined && deliveryCallback) {
        // Map Baileys status to our DB status
        let dbStatus = null;
        if (msgStatus === 0)  dbStatus = 'failed';
        if (msgStatus >= 2)   dbStatus = 'sent';     // server acknowledged
        if (msgStatus >= 3)   dbStatus = 'delivered';
        if (dbStatus) {
          deliveryCallback({ msgKey: update.key, status: dbStatus }).catch(() => {});
        }
      }
    }
  });

  // ── Connection state handler ────────────────────────────────────────────────
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // New QR event
    if (qr) {
      // Prevent QR code regeneration if the session has already been authenticated
      if (state.creds && state.creds.registered) {
        logger.warn('Received QR event but session is already registered. Ignoring QR to prevent session reset.');
        return;
      }
      lastQrRaw = qr;
      lastPairingCode = null; // clear pairing code if QR arrives
      try {
        lastQrPng = await QR.toDataURL(qr, { margin: 1, scale: 6 });
      } catch (_) {
        lastQrPng = null;
      }
      setStatus('qr');
      logger.warn(
        'Baileys QR ready — open GET /api/whatsapp/qr or use the admin dashboard WhatsApp Status tab.'
      );
    }

    if (connection === 'connecting') {
      setStatus('connecting');
    }

    if (connection === 'open') {
      reconnectAttempt = 0;       // reset backoff counter
      _restartRequiredCount = 0;  // reset rapid-restart storm counter
      _restartRequiredWindowStart = 0;
      lastQrPng = null;
      lastQrRaw = null;
      lastPairingCode = null;
      setStatus('online');
      logger.info('Baileys WhatsApp connected ✓');
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const err = lastDisconnect?.error?.message || 'disconnected';

      logger.warn({ code, err }, 'Baileys connection closed');

      if (isShuttingDown) {
        setStatus('offline', 'Server shutting down');
        return;
      }

      if (code === DisconnectReason.loggedOut) {
        logger.warn('Logged out from WhatsApp. Clearing auth state.');
        _clearAuthState();
        setStatus('offline', 'Logged out from WhatsApp');
        return;
      }

      if (code === DisconnectReason.badSession) {
        // A bad/corrupted session cannot be healed by reconnecting — doing so
        // just produces another badSession immediately, creating an infinite
        // loop that deletes and recreates the auth dir forever. Stop here and
        // require a manual "Connect" from the admin panel to get a fresh QR.
        logger.error('Bad session detected. Clearing auth state — admin must scan a new QR.');
        _clearAuthState();
        setStatus('error', 'Bad or corrupted session. Click "Connect" in the admin panel to scan a new QR code.');
        return; // do NOT auto-restart
      }

      if (code === DisconnectReason.restartRequired) {
        // WA sends restartRequired (515) when it rejects our session (stale
        // creds, duplicate device, version mismatch). A single restart is
        // normal; a storm of them means WA is refusing us — stop after 3.
        const now = Date.now();
        if (now - _restartRequiredWindowStart > RAPID_RESTART_WINDOW_MS) {
          // New window: reset counter
          _restartRequiredCount = 0;
          _restartRequiredWindowStart = now;
        }
        _restartRequiredCount++;

        if (_restartRequiredCount > MAX_RAPID_RESTARTS) {
          logger.warn(
            { count: _restartRequiredCount },
            'Too many restartRequired events in 60 s — WA is rejecting our session. Clearing auth and stopping.'
          );
          _clearAuthState();
          setStatus(
            'error',
            `WhatsApp rejected the session ${_restartRequiredCount} times in 60 s. Session cleared — click "Connect" to scan a new QR code.`
          );
          return; // do NOT auto-restart — admin must click "Connect"
        }

        logger.info({ attempt: _restartRequiredCount, max: MAX_RAPID_RESTARTS }, 'Restart required — reconnecting immediately…');
        initBaileys().catch((e) => logger.error({ err: e }, 'Baileys immediate reconnect after restartRequired failed'));
        return;
      }

      // Exponential backoff reconnect — stop after MAX_RECONNECT_ATTEMPTS
      if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
        setStatus('error', `Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Please scan QR or reconnect manually from the admin panel.`);
        logger.warn({ attempts: reconnectAttempt }, 'Baileys max reconnect attempts reached — giving up');
        return;
      }
      reconnectAttempt++;
      const delay = backoffMs(reconnectAttempt - 1);
      setStatus('connecting', `Connection lost (code ${code || 'unknown'}). Reconnecting...`);
      logger.info({ attempt: reconnectAttempt, maxAttempts: MAX_RECONNECT_ATTEMPTS, delayMs: Math.round(delay) }, 'Baileys scheduling reconnect');

      reconnectTimer = setTimeout(() => {
        initBaileys().catch((e) =>
          logger.error({ err: e }, 'Baileys reconnect failed')
        );
      }, delay);
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _clearAuthState() {
  const authDir = path.resolve(env.BAILEYS_AUTH_DIR);
  try {
    fs.rmSync(authDir, { recursive: true, force: true });
    fs.mkdirSync(authDir, { recursive: true });
    logger.info('Baileys auth state cleared');
  } catch (e) {
    logger.error({ err: e }, 'Failed to clear Baileys auth state');
  }
}

function jidFor(e164) {
  const clean = String(e164 || '').replace(/[^0-9]/g, '');
  if (!clean) throw new Error('Bad phone for WA jid');
  return clean + '@s.whatsapp.net';
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Send a text message.
 * Throws with `err.code === 'WA_OFFLINE'` when not connected.
 */
async function sendText(toE164, body) {
  if (!sock || status !== 'online') {
    const err = new Error(`WhatsApp not online (status=${status})`);
    err.code = 'WA_OFFLINE';
    throw err;
  }
  const jid = jidFor(toE164);
  await sock.sendMessage(jid, { text: body });
}

/**
 * Request a pairing code for the given phone number.
 * Restarts Baileys in pairing-code mode.
 * Returns the code (e.g. "ABCD-1234") or throws.
 */
async function requestPairingCode(phone) {
  lastPairingCode = null;
  // Re-init in pairing mode — this will set lastPairingCode when ready
  await initBaileys(true, phone);
  // Wait up to 15 s for the pairing code to arrive
  const start = Date.now();
  while (!lastPairingCode && Date.now() - start < 15_000) {
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!lastPairingCode) throw new Error('Pairing code not received within timeout');
  return lastPairingCode;
}

/**
 * Disconnect from WhatsApp and clear credentials.
 */
async function disconnect() {
  if (sock) {
    try {
      await sock.logout();
    } catch (_) {}
    try { sock.end(); } catch (_) {}
    sock = null;
  }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  _clearAuthState();
  // Clear the stale QR so the frontend doesn't keep showing (and offering to
  // scan) a code that's no longer valid once we're offline.
  lastQrPng = null;
  lastQrRaw = null;
  lastPairingCode = null;
  setStatus('offline', 'Manually disconnected');
}

/**
 * Graceful shutdown — called on SIGTERM/SIGINT.
 */
async function gracefulShutdown() {
  isShuttingDown = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (sock) {
    try { sock.end(); } catch (_) {}
    sock = null;
  }
  logger.info('Baileys graceful shutdown complete');
}

/** Full status snapshot for API responses */
function getStatus() {
  return {
    status,
    lastError,
    hasQr: !!lastQrPng,
    hasPairingCode: !!lastPairingCode,
    reconnectAttempt,
  };
}

/** PNG data-URL of the current QR code (or null) */
function getQrPng() { return lastQrPng; }

/** Raw QR string (or null) */
function getQrRaw() { return lastQrRaw; }

/** The pairing code (or null) */
function getPairingCode() { return lastPairingCode; }

/** SSE event emitter — subscribe to 'state' events */
function getEmitter() { return sseEmitter; }

/**
 * WaMessage stats from Prisma (today + alltime).
 * Returns zeros if DB is unavailable.
 */
async function getWaStats() {
  try {
    const prisma = require('../config/db');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalSent, totalFailed, todaySent, todayFailed] = await Promise.all([
      prisma.waMessage.count({ where: { status: 'sent' } }),
      prisma.waMessage.count({ where: { status: 'failed' } }),
      prisma.waMessage.count({ where: { status: 'sent', sentAt: { gte: today } } }),
      prisma.waMessage.count({ where: { status: 'failed', createdAt: { gte: today } } }),
    ]);

    const successRate = totalSent + totalFailed > 0
      ? Math.round((totalSent / (totalSent + totalFailed)) * 100)
      : 0;

    return { totalSent, totalFailed, todaySent, todayFailed, successRate };
  } catch (_) {
    return { totalSent: 0, totalFailed: 0, todaySent: 0, todayFailed: 0, successRate: 0 };
  }
}

/** Register a callback to receive delivery receipt updates from Baileys */
function setSentCallback(fn) { deliveryCallback = fn; }

module.exports = {
  initBaileys,
  sendText,
  requestPairingCode,
  disconnect,
  gracefulShutdown,
  getStatus,
  getQrPng,
  getQrRaw,
  getPairingCode,
  getEmitter,
  getWaStats,
  setSentCallback,
};
