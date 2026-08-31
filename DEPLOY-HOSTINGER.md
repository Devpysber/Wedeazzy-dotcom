# WedEazzy — Hostinger deployment guide

This zip is a **ready-to-upload build**. `node_modules` is not included (Hostinger
installs it for you) and no local secrets are included.

---

## Read this first: which Hostinger plan?

| Feature | Cloud / Web Hosting (shared, Passenger) | VPS (KVM) |
|---|---|---|
| Website + all pages | works | works |
| REST API, login, dashboards | works | works |
| MySQL + Prisma | works | works |
| Email OTP / SMTP | works | works |
| **WhatsApp OTP + notifications (Baileys)** | **unreliable** | works |
| **Cron jobs (`node-cron`)** | **unreliable** | works |

Passenger (used by shared Cloud Hosting) **stops the Node process when there is no
traffic** and restarts it on the next request. Baileys needs a permanently open
WhatsApp socket, and `node-cron` needs a process that never sleeps — both break under
that model. WhatsApp OTP will drop out and need re-pairing, and scheduled jobs will
fire only by accident.

Everything else runs fine. So:

* **Just getting the site live now** → Cloud Hosting, follow **Path A**. Email OTP
  covers login; WhatsApp features degrade gracefully (the server keeps running if
  Baileys fails — that is deliberate).
* **You need WhatsApp OTP and cron** → VPS, follow **Path B**.

---

## Path A — Hostinger Cloud / Web Hosting (Node.js app)

### 1. Create the MySQL database

hPanel → **Databases → Management**. Create a database + user, tick all privileges.
Note down: database name, username, password, host (usually `localhost`).

### 2. Upload and extract

hPanel → **Files → File Manager**.

Extract into a folder **outside** `public_html` if your plan allows it, e.g.
`/domains/wedeazzy.com/nodeapp`. Express serves the whole site itself, so nothing
needs to sit in `public_html`.

> **Why this matters:** if you extract into `public_html`, Apache can serve
> `backend/.env` as a plain text file and hand your database password to anyone who
> guesses the URL. This zip ships an `.htaccess` at the root that blocks `backend/`
> and any `.env` as a fallback — but keeping the app root out of `public_html` is
> still the real defence.

### 3. Fill in `backend/.env`

Open `backend/.env` in File Manager's editor. Only **two** values are `FILL_ME` —
everything else (SMTP, Google OAuth, Razorpay, admin email, Google Sheet URL) is
already filled in with your real working credentials.

```
DATABASE_URL="mysql://u123456_user:YourPassword@localhost:3306/u123456_wedeazzy"
ADMIN_PASSWORD=<a strong password you choose>
```

`PUBLIC_BASE_URL`, `FRONTEND_ORIGIN` and `GOOGLE_CALLBACK_URL` are pre-set to
`https://wedeazzy.com`. If you deploy to a different domain, change all three —
and register the new callback URL in Google Cloud Console, or Google login breaks.

Two gotchas that cause most failed deploys here:

* **URL-encode special characters in the DB password**: `@` becomes `%40`,
  `#` becomes `%23`, `/` becomes `%2F`. An un-encoded `@` silently breaks the
  connection string.
* Hostinger DB names/users are usually prefixed (`u123456_`). Use the exact strings
  hPanel shows you.

`JWT_SECRET` is already filled with a freshly generated 64-char secret — leave it
alone. (Changing it later logs out every user.)

### 4. Create the Node.js app

hPanel → **Advanced → Node.js** (may appear as "Setup Node.js App").

| Field | Value |
|---|---|
| Node.js version | **20** or higher |
| Application root | the folder you extracted into |
| Application URL | your domain |
| Application startup file | `app.js` |

Create it, then click **Run NPM Install** (or run `npm install` over SSH from the app
root). This pulls the backend dependencies and generates the Prisma client — it takes
several minutes and downloads roughly 500 MB.

> If NPM Install fails or times out in the browser UI, run it over SSH instead:
> `cd <app root> && npm install`. Shared plans sometimes kill the browser-triggered
> install on memory limits.

### 5. Start it

Click **Restart**. On first boot the server automatically:

1. runs `prisma migrate deploy` — creates all 30 tables,
2. seeds the admin account from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

Check it:

```
https://yourdomain.com/health
```

Expect `{ "ok": true, "env": "production", "database": "ok", "schema": "ok" }`.

`/health` runs a real query against the database, so it returns HTTP 503 — not a
cheerful `ok: true` — whenever the database is unreachable or the schema is
broken. The JSON names the problem and the command that fixes it.

Then visit `https://yourdomain.com/` for the site and `https://yourdomain.com/admin`
for the admin panel.

---

## Path B — Hostinger VPS (full functionality)

Use `backend/DEPLOY.md`, the existing Docker + Nginx + Certbot playbook for a KVM VPS.
Two adjustments for this build:

* Upload the **whole** extracted folder (not just `backend/`) so `public/` ships with
  it, and run from the root: `npm install && npm start`.
* Or with PM2: `pm2 start app.js --name wedeazzy` (an `ecosystem.config.js` is
  included in `backend/`).

Pair WhatsApp once via `/api/whatsapp/qr`; Baileys then persists its session in
`backend/baileys-auth/`.

---

## After it's live

**Log in as admin and change the password immediately.** `ADMIN_PASSWORD` sits in
plaintext in `.env` and is only meant to bootstrap the first login.

**Optional — import the vendor list.** `backend/src/scripts/vendors.csv` (4 MB) ships
with this build. Import it from the `backend` folder:

```bash
node src/scripts/seed-vendors.js src/scripts/vendors.csv
```

`npm run seed:vendors` from the backend folder now does the same thing — its
script pointed at `../public/js/vendors.csv`, a path that does not exist in this
project, and has been corrected.

**Do not run** `npm run seed:demo` on production — it inserts fake vendors, couples
and bookings into your live database.

---

## If the API returns 500 on every request

The usual cause is a schema mismatch: the database has tables, but not the ones
`schema.prisma` expects. It happens when a database that already had tables meets
a fresh migration history — the first `CREATE TABLE` hits an existing table, the
migration aborts half-applied, and Prisma locks the history with **P3009**.

The tell-tale log lines:

```
Error: P3009  migrate found failed migrations in the target database
The column `Vendor.state` does not exist in the current database
```

**Check the state:**

```bash
curl https://yourdomain.com/health
```

`"schema": "broken"` or `"database": "unreachable"` names the problem, and the
response carries the fix command.

**Repair it, without dropping data**, from the app root:

```bash
npm run db:repair
```

That clears the failed migration record, ALTERs the existing tables to add the
missing columns, and baselines the migration history so the boot-time
`migrate deploy` stops failing. It is idempotent — safe to run twice.

If it stops and reports that the sync would drop columns or tables, it changes
nothing and prints the list. Read the list. If everything on it is genuinely
disposable, re-run with `npm run db:repair:force`.

Then restart the Node app and re-check `/health`.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `/health` says `"schema": "broken"` | Failed/partial migration. Run `npm run db:repair` (see above). |
| `/health` says `"database": "unreachable"` | Wrong `DATABASE_URL`, or an un-encoded special character in the password. |
| Won't boot: "Refusing to boot in production with PUBLIC_BASE_URL still set to localhost" | `.env` still has placeholder values. This is the fail-safe working correctly. |
| Boot fails on `FRONTEND_ORIGIN` | Same — set it to your real domain(s), comma-separated. |
| Login blocked in the browser console (CORS) | `FRONTEND_ORIGIN` doesn't exactly match the origin the browser sends. Include both `https://domain.com` and `https://www.domain.com`, no trailing slash. |
| `P1001: Can't reach database server` | Wrong `DATABASE_URL`, or an un-encoded special character in the password. |
| Tables missing / every API call 500s | Failed or partial migration. From the app root: `npm run db:repair` |
| `EACCES` from Prisma engines | Hostinger stripped the execute bit. The server self-heals this on boot; if not: `chmod -R 755 backend/node_modules/@prisma/engines` |
| WhatsApp status never goes `online` | Expected on shared hosting (see the plan table above). Needs a VPS. |
| Uploaded images 404 | `backend/uploads/` lost write permission → `chmod 755 backend/uploads` |

Logs: the hPanel Node.js panel, or `backend/logs/`.

---

## What's in this zip

```
app.js                  Passenger entry point
.htaccess               blocks Apache from serving backend/ and .env as text
package.json            root scripts (install / build / start)
public/                 the full website (11 MB) — served by Express
backend/
  .env                  PRODUCTION config — live secrets, edit DATABASE_URL + ADMIN_PASSWORD
  .env.example          reference for every supported variable
  src/                  API source
  prisma/
    schema.prisma
    migrations/         initial migration (30 tables)
  uploads/              vendor photos (writable)
  logs/  baileys-auth/  kyc-private/  import-staging/    (empty, writable)
  DEPLOY.md             VPS playbook
```

**Excluded on purpose:** `node_modules` (installed on the server), the WhatsApp
session in `baileys-auth/` (device-bound, must be re-paired), `kyc-private/` and
`import-staging/` (customer PII), and `tests/`.

**`backend/.env` in this zip holds live credentials** (SMTP password, Google OAuth
secret, Razorpay secrets). Treat this zip like a password: do not email it, do not
put it in a public repo, and delete it from your local Downloads once deployed.

Rebuild this zip any time after further code changes with `npm run build:zip`.

**Added to the original project:** `backend/prisma/migrations/20250101000000_init/` —
the project shipped an empty migrations folder, so `prisma migrate deploy` would have
created **zero tables** on a fresh database and every API call would have failed. The
migration was generated directly from `schema.prisma`, so it matches your schema
exactly.
