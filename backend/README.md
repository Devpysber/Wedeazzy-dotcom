# WedEazzy Backend

Node + Express + Prisma + MySQL + Baileys (WhatsApp).

## Quick start (local dev)

```bash
# 1. Install
cd backend
cp .env.example .env
# Then (one-time): import the 13.6k static vendors into MySQL:
#   node src/scripts/seed-vendors.js
# (Public-site inquiries reference vendors by their slug-style legacyId.)
# Edit .env - at minimum set a JWT_SECRET. DATABASE_URL can point at the Docker
# Compose DB below.

# 2. Start MySQL via Docker
docker compose up -d db

# 3. Install deps and run migrations
npm install
npx prisma migrate dev --name init

# 4. Dev server (auto-reload)
npm run dev

# 5. Pair WhatsApp - open http://localhost:4000/api/whatsapp/qr and scan
#    with the dedicated WedEazzy WhatsApp SIM.
```

API now serves at `http://localhost:4000`.

The dashboard frontend (`../dashboard.html`) auto-targets `localhost:4000` when
opened on localhost; in production it targets the hostname configured at the
top of the SPA script.

## Project layout

```
backend/
├── prisma/schema.prisma       # MySQL schema (users, vendors, couples, ...)
├── src/
│   ├── server.js              # Express bootstrap
│   ├── config/                # env, db (Prisma), logger
│   ├── middleware/            # auth (JWT), error, rate-limit
│   ├── modules/
│   │   ├── auth/              # OTP send/verify, /me, /logout
│   │   ├── vendor/            # signup, profile CRUD, dashboard
│   │   ├── whatsapp/          # Baileys client + service + templates
│   │   └── upload/            # multer-backed image uploader
│   └── utils/                 # phone, otp, slug
├── docker-compose.yml         # local dev stack (mysql + app)
├── Dockerfile
└── DEPLOY.md                  # Hostinger VPS playbook
```

## Auth flow

1. `POST /api/auth/otp/send`  `{ phone }` → 6-digit OTP via WhatsApp (Baileys).
2. `POST /api/auth/otp/verify` `{ phone, code, role?, name? }` → returns JWT.
3. Use `Authorization: Bearer <token>` for all protected endpoints.
4. Phones listed in `ADMIN_PHONES=` are auto-promoted to `role=admin` on verify.

## Vendor module

| Method | Path | Notes |
|---|---|---|
| POST | `/api/vendor/signup` | Create the vendor row (after OTP login). |
| GET | `/api/vendor/me` | Dashboard payload: vendor + completion + recent inquiries. |
| PATCH | `/api/vendor/me` | Update any profile field; auto-recomputes completion. |
| POST | `/api/vendor/me/photos` | Attach a photo URL (call after `/api/upload/photo`). |
| DELETE | `/api/vendor/me/photos/:id` | Remove a photo. |

## Upload

`POST /api/upload/photo`  (multipart `file=`) → `{ url }`. Saves to `UPLOAD_DIR`,
served at `/uploads/<filename>`.

## WhatsApp

| Method | Path | Notes |
|---|---|---|
| GET | `/api/whatsapp/status` | Connection state. |
| GET | `/api/whatsapp/qr` | HTML page with QR for first-time pairing. |
| POST | `/api/whatsapp/test-send` | Admin-only outbound test. |

Templates live in `src/modules/whatsapp/templates.js` — body strings with
`{{var}}` placeholders. Call from anywhere via
`sendTemplate(toE164, templateKey, vars)`.

## Roadmap (after P1)

- **P2** — Couple signup + inquiry routing + shortlists.
- **P3** — PhonePe ₹5,000 featured upgrade + admin panel + pincode locks.
- **P4** — Wedding plan calendar + WA reminders + ads dashboard.
