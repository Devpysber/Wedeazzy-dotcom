/**
 * WedEazzy API entry point — Express app setup, security middleware
 * (helmet/CORS/CSRF/rate-limiting), route mounting, Google OAuth, and
 * process lifecycle (Baileys WhatsApp client, cron jobs, graceful shutdown).
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

// Ensure logs directory exists (required by PM2 log config)
const logsDir = path.resolve(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const env = require('./config/env');
const logger = require('./config/logger');
const passport = require('passport');
require('./config/passport');
const { notFound, errorHandler } = require('./middleware/error');

const authRoutes = require('./routes/auth.routes');
const vendorRoutes = require('./routes/vendor.routes');
const coupleRoutes = require('./routes/couple.routes');
const inquiryRoutes = require('./routes/inquiry.routes');
const whatsappRoutes = require('./routes/whatsapp.routes');
const uploadRoutes = require('./routes/upload.routes');
const reportsRoutes = require('./routes/reports.routes');
const adminRoutes = require('./routes/admin.routes');
const contactRoutes = require('./routes/contact.routes');
const paymentRoutes = require('./routes/payment.routes');
const publicRoutes = require('./routes/public.routes');
const campaignRoutes = require('./routes/campaign.routes');
const claimRoutes = require('./routes/claim.routes');


const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

// HTTPS was previously assumed to happen entirely at the hosting layer
// (Hostinger/Passenger or Nginx) with nothing enforced in-app — if that
// front door is ever misconfigured to also allow/proxy plain HTTP, requests
// were accepted over cleartext with no server-side rejection. trust proxy
// (above) makes req.secure reflect the original client scheme via
// X-Forwarded-Proto even behind a reverse proxy, so this is safe to enforce.
if (env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.secure) return next();
    const host = req.headers.host || '';
    if (/^localhost|^127\.0\.0\.1/i.test(host)) return next();
    return res.redirect(308, `https://${host}${req.originalUrl}`);
  });
}

// helmet's defaults include Strict-Transport-Security (HSTS); only
// contentSecurityPolicy and crossOriginResourcePolicy are overridden below.
//
// This is a multi-page static HTML site built on inline <script>/onclick
// handlers throughout (public/, public/admin-panel/), so script-src has to
// keep 'unsafe-inline' until those are externalized — a default CSP would
// break the app outright. What the policy below still buys, and what having
// no CSP at all gave up, is the source allowlist: injected <script src> to an
// attacker-controlled host is blocked, as are plugins (object-src), <base>
// rewriting (base-uri), form exfiltration to third parties (form-action), and
// framing by other origins (frame-ancestors). The escaping/sanitization/
// upload-whitelisting fixes elsewhere in this codebase remain the primary
// XSS defenses; this is the defense-in-depth layer under them.
//
// Allowlisted third parties are the ones the pages actually load: jsDelivr and
// cdnjs (libraries, icon CSS), Google Fonts, Razorpay Checkout, Tawk.to chat,
// and remote images (Unsplash covers, the GitHub-hosted logo fallback).
const scriptHosts = ['https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com', 'https://checkout.razorpay.com', 'https://embed.tawk.to', 'https://*.tawk.to', 'https://www.google.com'];
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      'default-src': ["'self'"],
      // 'unsafe-eval' is required by the SheetJS/Chart.js bundles the
      // dashboards load; drop it once those are upgraded off eval.
      'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'", ...scriptHosts],
      'script-src-attr': ["'unsafe-inline'"], // inline onclick= handlers
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'],
      'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
      'img-src': ["'self'", 'data:', 'blob:', 'https:'],
      'media-src': ["'self'", 'data:', 'blob:', 'https:'],
      'connect-src': ["'self'", 'https://checkout.razorpay.com', 'https://api.razorpay.com', 'https://*.tawk.to', 'wss://*.tawk.to'],
      'frame-src': ["'self'", 'https://checkout.razorpay.com', 'https://api.razorpay.com', 'https://www.google.com', 'https://*.tawk.to'],
      'worker-src': ["'self'", 'blob:'],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'frame-ancestors': ["'self'"],
      'upgrade-insecure-requests': [],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
}));
app.use(compression());
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => { req.rawBody = buf.toString(); }
}));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// --- CORS Configuration ---
const allowedOrigins = [
  'http://localhost:4000',
  'http://127.0.0.1:4000',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  ...env.FRONTEND_ORIGIN.filter(Boolean),
  env.PUBLIC_BASE_URL,
].map(origin => origin ? origin.replace(/\/$/, '') : ''); // normalize by stripping trailing slashes

app.use(cors({
  origin(origin, cb) {
    // Allow non-browser requests (Postman, curl, server-to-server), null origin (redirects), and listed origins
    if (!origin || origin === 'null' || allowedOrigins.includes(origin)) return cb(null, true);
    logger.warn(`CORS blocked: ${origin}`);
    cb(new Error(`CORS policy does not allow origin: ${origin}`));
  },
  credentials: true,
}));

// --- CSRF Protection Middleware ---
const csrfProtection = (req, res, next) => {
  // Safe methods do not require CSRF protection
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Exempt payment webhooks & redirect endpoints
  const path = req.originalUrl || req.path;
  if (path.includes('/payment/webhook')) {
    return next();
  }

  // If Authorization header starting with Bearer is present, allow it (JWT is immune to standard CSRF)
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return next();
  }

  // If X-Requested-With header is present and matches XMLHttpRequest, allow it
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
    return next();
  }

  // Otherwise, verify the Origin or Referer header
  const origin = req.headers['origin'];
  const referer = req.headers['referer'];
  let requestOrigin = null;

  if (origin && origin !== 'null') {
    requestOrigin = origin;
  } else if (referer) {
    try {
      requestOrigin = new URL(referer).origin;
    } catch (_) {}
  }

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return next();
  }

  logger.warn(`CSRF blocked request: Method=${req.method} Path=${req.path} Origin=${origin} Referer=${referer}`);
  return res.status(403).json({
    success: false,
    error: 'Cross-Site Request Forgery protection blocked this request. Missing or invalid request origin/headers.',
    code: 'ERR_CSRF_BLOCKED'
  });
};

// Initialize Cookie Session
const cookieSession = require('cookie-session');
app.use((req, res, next) => {
  const host = req.headers.host || '';
  const isLocalHost = /^localhost|^127\.0\.0\.1/i.test(host);
  cookieSession({
    name: 'wedeazzy_session',
    keys: [env.JWT_SECRET],
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    secure: env.NODE_ENV === 'production' && !isLocalHost && req.secure,
    sameSite: 'lax',
  })(req, res, next);
});

// Workaround for Passport.js session regeneration compatibility with cookie-session
app.use((req, res, next) => {
  if (req.session && !req.session.regenerate) {
    req.session.regenerate = (cb) => { cb(); };
  }
  if (req.session && !req.session.save) {
    req.session.save = (cb) => { cb(); };
  }
  next();
});

// Initialize Passport.js
app.use(passport.initialize());
app.use(passport.session()); // Required for OAuth state to survive the callback redirect

// Static-serve uploads (vendor photos)
const UPLOAD_DIR_RESOLVED = path.isAbsolute(env.UPLOAD_DIR) ? env.UPLOAD_DIR : path.resolve(__dirname, '..', env.UPLOAD_DIR);
app.use('/api/uploads', express.static(UPLOAD_DIR_RESOLVED, { maxAge: '7d' }));
app.use('/uploads', express.static(UPLOAD_DIR_RESOLVED, { maxAge: '7d' }));

// Static-serve the public site (index.html, dashboards, etc.)
// Path resolution works for both structures:
//   - Flat (Hostinger):  __dirname=.../src  → ../public
//   - Nested (dev):      check both paths
const STATIC_ROOT = (() => {
  const flat = path.resolve(__dirname, '..', 'public');      // src/../public  (Hostinger flat)
  const nested = path.resolve(__dirname, '..', '..', 'public'); // src/../../public (local nested)
  const fs = require('fs');
  if (fs.existsSync(flat)) return flat;
  if (fs.existsSync(nested)) return nested;
  return flat; // fallback
})();

app.use(express.static(STATIC_ROOT, {
  index: 'index.html',
  extensions: ['html'],
  setHeaders(res, filepath) {
    if (/\.(html|js|css)$/.test(filepath)) {
      // App HTML/JS/CSS are unversioned (no content hash), so always revalidate
      // — updates ship immediately. This is the cache-busting mechanism.
      res.setHeader('Cache-Control', 'no-cache');
    } else if (env.NODE_ENV === 'production' && /\.(png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot)$/i.test(filepath)) {
      // Stable media/fonts — long cache in production only (dev behaviour unchanged).
      res.setHeader('Cache-Control', 'public, max-age=2592000'); // 30 days
    }
  },
}));

// --- Health ---
// Boot-time database state, filled in by startServer() below. `/health`
// reports it so a broken schema is visible from a single curl instead of
// only from a 500 on some unrelated endpoint.
const dbStatus = {
  migrations: env.NODE_ENV === 'production' ? 'pending' : 'skipped',
  adminSeed: env.NODE_ENV === 'production' ? 'pending' : 'skipped',
  detail: null,
};

app.get('/health', async (req, res) => {
  // Actually touch the database. A process that boots fine while every query
  // fails is the exact failure this endpoint exists to catch, and the old
  // unconditional `{ ok: true }` reported healthy right through it.
  let database = 'ok';
  let databaseError = null;
  try {
    const prismaInstance = require('./config/db');
    await prismaInstance.$queryRaw`SELECT 1`;
  } catch (err) {
    database = 'unreachable';
    // Prisma puts the P-code on `code` for request errors but on `errorCode`
    // for initialization errors (P1001 "Can't reach database server" is the
    // latter), so checking only one of them loses the most useful case.
    databaseError = err.code || err.errorCode || 'connection failed';
  }

  const schemaOk = dbStatus.migrations !== 'failed';
  const ok = database === 'ok' && schemaOk;

  res.status(ok ? 200 : 503).json({
    ok,
    ts: Date.now(),
    env: env.NODE_ENV,
    database,
    databaseError: databaseError || undefined,
    schema: schemaOk ? 'ok' : 'broken',
    migrations: dbStatus.migrations,
    adminSeed: dbStatus.adminSeed,
    detail: dbStatus.detail || undefined,
    // Actionable, because the fix is a single command and the operator
    // reading this is usually staring at a 500 with no other clue.
    fix: ok ? undefined : 'From the backend folder run: node src/scripts/db-repair.js',
  });
});

// --- Page Navigation Routes ---
app.get('/admin', (req, res) => res.redirect('/admin-panel/login.html'));
app.get('/admin/dashboard', (req, res) => res.redirect('/admin-panel/dashboard.html'));
app.get('/vendor-dashboard', (req, res) => res.redirect('/pages/bdashboard.html'));
app.get('/user-dashboard', (req, res) => res.redirect('/pages/user-dashboard.html'));

// --- Rate Limiting ---
const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  // Admin panel polls 5 endpoints every 5 s = ~900 req/15 min per session.
  // The old cap of 300 was exceeded after ~5 minutes of active admin use,
  // causing 429 on the WhatsApp logs and other admin endpoints.
  max: 1500,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const p = req.originalUrl || req.path;
    // Always skip SSE + lightweight status probes (already whitelisted)
    if (
      p.includes('/whatsapp/events') ||
      p.includes('/whatsapp/qr-data') ||
      p.includes('/whatsapp/status')
    ) return true;
    // Skip rate-limiting for admin-only routes — they are already protected by
    // requireAuth + requireRole('admin'). Rate-limiting them causes false 429s
    // when the admin panel polls multiple endpoints simultaneously.
    if (p.startsWith('/api/admin/') || p.startsWith('/api/whatsapp/')) return true;
    return false;
  },
  handler: require('./utils/rateLimitLogger').rateLimitHandler({
    success: false,
    error: "Too many requests from this IP. Please try again after 15 minutes."
  }),
  message: {
    success: false,
    error: "Too many requests from this IP. Please try again after 15 minutes."
  }
});

// --- API Routes ---
// API and auth responses must never be cached by browsers/proxies.
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/api', globalApiLimiter);
app.use('/api', csrfProtection);
app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/vendor', vendorRoutes);
app.use('/api/couple', coupleRoutes);
app.use('/api/inquiry', inquiryRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/claim', claimRoutes);

// --- Google OAuth routes ---
// IMPORTANT: do NOT add session:false here – Passport needs the session to
// store/verify the OAuth 'state' parameter between the two redirect legs.
// The JWT we issue at the end is stateless; the cookie session only lives
// during the handshake (seconds).

/** Initiate Google OAuth — supports optional ?role=couple|vendor|admin */
function googleInit(req, res, next) {
  const { role } = req.query || {};
  const validRoles = ['couple', 'vendor', 'admin', 'user', 'business'];
  const safeRole = validRoles.includes(role) ? role : 'couple';
  const state = Buffer.from(safeRole).toString('base64');
  passport.authenticate('google', { scope: ['profile', 'email'], state })(req, res, next);
}

/** Handle Google OAuth callback and redirect with JWT */
async function googleCallback(req, res, next) {
  try {
    const user = req.user;
    if (!user) {
      return res.redirect('/pages/admin-login.html?error=google_auth_failed');
    }

    const { signToken } = require('./middleware/auth');
    const token = signToken(user);
    const finalRole = user.role;

    // Store token in server-side session for one-time retrieval via
    // /api/auth/consume-oauth-token — the token is intentionally NOT placed
    // in the redirect URL, where it would leak via browser history, server
    // access logs, and Referer headers.
    if (req.session) {
      req.session.oauthToken = token;
      req.session.oauthRole = finalRole;
      req.session.loginAt = Date.now();
    }

    res.redirect(`/pages/admin-login.html?auth=success&provider=google&role=${finalRole}`);
  } catch (err) { next(err); }
}

// Root-level routes matching GOOGLE_CALLBACK_URL=http://localhost:4000/google/callback
app.get('/google', googleInit);
app.get('/google/callback', (req, res, next) => {
  // Guard: passport's OAuth2 strategy treats a callback carrying neither `code`
  // nor `error` as a fresh authorization request and redirects back to Google,
  // which immediately returns here � an infinite bounce the browser reports as
  // ERR_TOO_MANY_REDIRECTS. Fail it as an auth error instead.
  if (!req.query.code && !req.query.error) {
    logger.warn({ query: req.query }, 'Google OAuth callback hit without a code � refusing to re-initiate');
    return res.redirect('/pages/admin-login.html?error=google_auth_failed&reason=missing_code');
  }
  passport.authenticate('google', (err, user, info) => {
    if (err || !user) {
      const errMsg = err ? (err.message || err.code || 'auth_failed') : (info ? (info.message || 'user_not_found') : 'auth_failed');
      logger.error({ err: err ? err.message : null, info, msg: errMsg }, 'Google OAuth Strategy callback failed');
      return res.redirect('/pages/admin-login.html?error=google_auth_failed&reason=' + encodeURIComponent(errMsg));
    }
    req.user = user;
    return googleCallback(req, res, next);
  })(req, res, next);
});

// /api/auth/google mirrors the root-level route so the frontend button
// (onclick="...API_BASE + '/api/auth/google'") also works.
// The callback ALWAYS goes to GOOGLE_CALLBACK_URL (/google/callback).
app.get('/api/auth/google', googleInit);
app.get('/api/auth/google/callback', (req, res, next) => {
  res.redirect('/google/callback?' + new URLSearchParams(req.query).toString());
});

// Alias: /auth/google/callback → /google/callback (keeps backward compat)
app.get('/auth/google/callback', (req, res) =>
  res.redirect('/google/callback?' + new URLSearchParams(req.query).toString())
);


// Serve the styled 404 page for unmatched browser page requests (not API/XHR
// calls, which should keep getting the plain JSON shape from `notFound` below).
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/') && req.accepts(['html', 'json']) === 'html') {
    return res.status(404).sendFile(path.join(STATIC_ROOT, 'pages', '404.html'));
  }
  next();
});

// 404 + error handler
app.use(notFound);
app.use(errorHandler);

async function startServer() {
  // Database setup in production
  if (env.NODE_ENV === 'production') {
    try {
      const { execSync } = require('child_process');
      const execCwd = path.resolve(__dirname, '..');
      const prismaCliPath = path.resolve(execCwd, 'node_modules/prisma/build/index.js');
      
      // Use process.execPath — bare `node` is not on the shell PATH under
      // Hostinger's Passenger environment (`/bin/sh: node: command not found`).
      const nodeBin = process.execPath;

      // Hostinger's npm install can strip the execute bit from Prisma's engine
      // binaries, making `migrate deploy` fail with EACCES. Restore it.
      try {
        const enginesDir = path.resolve(execCwd, 'node_modules', '@prisma', 'engines');
        for (const f of require('fs').readdirSync(enginesDir)) {
          require('fs').chmodSync(path.join(enginesDir, f), 0o755);
        }
      } catch (_) { /* engines dir missing */ }
      // Migration and seeding are deliberately handled as two independent
      // steps. They used to share one try block, so a migrate failure skipped
      // the admin seed entirely — the operator got a database with no usable
      // login on top of whatever the migration problem already was.
      try {
        if (require('fs').existsSync(prismaCliPath)) {
          logger.info('Ensuring Prisma migrations are deployed via local CLI...');
          execSync(`"${nodeBin}" "${prismaCliPath}" migrate deploy --schema=prisma/schema.prisma`, { stdio: 'inherit', cwd: execCwd });
        } else {
          logger.warn('Local Prisma CLI not found in node_modules, falling back to npx...');
          execSync('npx prisma migrate deploy --schema=prisma/schema.prisma', { stdio: 'inherit', cwd: execCwd });
        }
        dbStatus.migrations = 'ok';
      } catch (err) {
        // A failed `migrate deploy` is not a transient hiccup — the schema the
        // Prisma Client was generated against does not match the live
        // database, so essentially every query 500s while the process itself
        // looks perfectly healthy. Previously this was logged as one generic
        // line and the server carried on serving a broken API with no signal
        // anywhere that the schema was the cause.
        const detail = `${err.stdout || ''}${err.stderr || ''}${err.message || ''}`;
        dbStatus.migrations = 'failed';
        dbStatus.detail = /P3009/.test(detail)
          ? 'P3009: a previous migration is recorded as failed, so no further migrations will be applied.'
          : 'migrate deploy failed — the live schema does not match prisma/schema.prisma.';

        logger.error(
          { err },
          `DATABASE SCHEMA IS NOT USABLE — ${dbStatus.detail} ` +
          'The API will return 500s on database-backed routes until this is fixed. ' +
          'Repair it without losing data by running, from the backend folder: ' +
          'node src/scripts/db-repair.js  (see /health for current status)'
        );
      }

      // Seeding runs even when migrations failed: if the schema happens to be
      // usable it gets the admin account in place, and if it is not, the error
      // it logs is a second independent confirmation of the schema problem.
      try {
        logger.info('Seeding admin credentials...');
        execSync(`"${nodeBin}" src/scripts/seed-admin.js`, { stdio: 'inherit', cwd: execCwd });
        dbStatus.adminSeed = 'ok';
      } catch (err) {
        dbStatus.adminSeed = 'failed';
        logger.error({ err }, 'Admin seeding failed — no admin account may exist yet. Check ADMIN_EMAIL/ADMIN_PASSWORD in .env.');
      }

      try {
        logger.info('Seeding countries & cities structure...');
        execSync(`"${nodeBin}" src/scripts/seed-countries.js`, { stdio: 'inherit', cwd: execCwd });
      } catch (err) {
        logger.warn({ err }, 'Country/city seeding encountered warnings during boot.');
      }

      try {
        logger.info('Seeding email marketing templates...');
        execSync(`"${nodeBin}" src/scripts/seed-templates.js`, { stdio: 'inherit', cwd: execCwd });
      } catch (err) {
        logger.warn({ err }, 'Email template seeding encountered warnings during boot.');
      }

      // NOTE: Demo/sample data is NEVER auto-seeded on startup (production or
      // otherwise). It ships fake vendors/couples/bookings and must never land
      // in a real database. Seed it manually only when needed for local dev:
      //   ALLOW_DEMO_SEED=true node src/scripts/seed-demo.js
    } catch (err) {
      dbStatus.migrations = 'failed';
      dbStatus.detail = 'Could not run the Prisma CLI at all.';
      logger.error({ err }, 'Failed to complete production database setup');
    }
  }

  // Boot Baileys lazily so the server still starts if WA fails
  const { initBaileys } = require('./services/baileys.client');
  initBaileys().catch((e) => logger.error({ err: e }, 'Baileys init failed (server keeps running)'));

  // Boot background cron scheduler
  const { initCron } = require('./config/cron');
  try {
    initCron();
  } catch (e) {
    logger.error({ err: e }, 'Cron initialization failed');
  }

  const server = app.listen(env.PORT, '0.0.0.0', () => {
    logger.info(`WedEazzy API listening on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
  });

  // Graceful shutdown
  const { gracefulShutdown: baileysShutdown } = require('./services/baileys.client');
  const prismaInstance = require('./config/db');
  ['SIGINT', 'SIGTERM'].forEach((sig) => {
    process.on(sig, async () => {
      logger.info(`Received ${sig}, shutting down…`);
      await baileysShutdown().catch(() => {});
      await prismaInstance.$disconnect().catch(() => {});
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 8000).unref();
    });
  });
}

// Start the server unless we are running in the test environment (e.g. Jest)
if (process.env.NODE_ENV !== 'test') {
  startServer().catch((fatalErr) => {
    // Top-level catch: log fatal startup error and exit cleanly
    // so process monitors (PM2, systemd) can restart the app
    console.error('[FATAL] WedEazzy server failed to start:', fatalErr);
    process.exit(1);
  });
}

module.exports = app;