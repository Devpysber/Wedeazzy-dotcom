# WedEazzy — Update Package

Everything below is **local only**. Nothing has been committed or pushed.

---

## 1. Run it locally

```bash
# from the project root
cd backend
npm install

cp .env.example .env      # then edit — see the block below
npx prisma generate
npx prisma migrate deploy

node src/scripts/seed-admin.js
npm run dev               # http://localhost:4000
```

Minimum `.env` for local work:

```env
NODE_ENV=development
PORT=4000
PUBLIC_BASE_URL=http://localhost:4000
FRONTEND_ORIGIN=http://localhost:4000,http://127.0.0.1:4000

DATABASE_URL="mysql://USER:PASS@127.0.0.1:3306/wedeazzy"

JWT_SECRET=<run: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
JWT_EXPIRES_IN=30d

OTP_DEBUG_LOG=true
ADMIN_EMAIL=admin@wedeazzy.local
ADMIN_PASSWORD=LocalAdmin@2026

UPLOAD_DIR=./uploads
MAX_UPLOAD_MB=5
```

Admin panel: `http://localhost:4000/admin`

**Hard-refresh once** (Ctrl/Cmd+Shift+R). The CSS and JS carry new `?v=3`
query strings, but the browser may still hold the old `?v=2` bundle.

---

## 2. What changed

### PDF items

| # | Request | Where |
|---|---------|-------|
| 1 | Dashboard needs more info + graphs in one view | Approve Businesses → Dashboard: 8 KPI cards, 3 Chart.js charts (listings added, invitations sent, claim funnel), plus Top Categories / Top Cities distribution bars |
| 2 | Invitation send needs WhatsApp number option + better UI | New invite composer modal: channel picker, editable +91 number, editable message, live WhatsApp-style preview |
| 3 | Invitation page should list only those invited | `renderInvitations` now filters on `invitedAt` instead of `!hasOwner`. Adds conversion stats and a channel filter |
| 4 | Claimed listing needs stat cards + only claimed | 4 stat cards; "claimed" now means a real signup is attached (`hasOwner`) |
| 5 | CSV import on its own page | New "Import Listings (CSV)" nav item — 3-step wizard |
| — | Theme → logo's "e" colour | Sampled from `logo.png`: **`#DC1F30`**. 225 hardcoded colours replaced across 26 files |
| — | Admin responsive, mobile first | Off-canvas drawer, tables become cards below 640px, 44px tap targets |

### Your additions

- **Tawk.to** — embedded site-wide via `public/js/wedeazzy-enhance.js`. Offset to
  `yOffset: 96` desktop / `84` mobile so it doesn't sit on top of the existing
  support widget, FAQ chatbot, and WhatsApp pill. Excluded from the admin login page.
- **CSV duplicate filtering** — three configurable rules (phone / name+city / email),
  checked both within the file and against the database.
- **All Businesses UI** — filter bar per your screenshot (search, category, city,
  approval status, subscription, date, reset) plus bulk-select and bulk invite.
- **Animations & polish** — scroll reveal, smooth anchors, header condense,
  card hover physics, ripple feedback, image fade-in, back-to-top, mobile nav drawer.
  All of it respects `prefers-reduced-motion`.

---

## 3. How the CSV import works

Two-phase, so nothing is written until you've seen the duplicate report.

1. **Upload** — drag/drop or browse. Columns auto-detect: `name` / `Business Name` /
   `title` all map to the same field. Only `name`, `category`, `city` are required.
   Pick your duplicate rules.
2. **Review** — counts for new / duplicate-in-file / already-in-database / invalid,
   plus a 200-row preview with a reason on every flagged row. Two opt-in
   checkboxes: import the in-file duplicates anyway, and fill blanks on
   existing listings.
3. **Commit** — creates listings as *unclaimed* (no owner), same as seeded ones,
   so the claim funnel stays accurate.

Duplicate rules:

- **Phone** (default on) — normalised first, so `9876543210`, `+91 98765-43210`
  and `919876543210` all collide.
- **Name + city** (default on) — case and punctuation insensitive. Catches the
  same shop listed twice under two numbers.
- **Email** (default **off**) — agencies and franchise groups legitimately share
  one inbox across many real listings.

The first occurrence of a business is always kept, so you never lose a listing entirely.

"Fill blanks on existing" only writes to fields that are currently empty. It will
never overwrite something you or a vendor has already set.

---

## 4. Testing done

| Suite | Result |
|-------|--------|
| CSV parse / dedup logic (Jest) | **21/21** |
| Admin views, headless DOM (jsdom) | **79/79** |
| Public enhancement layer (jsdom) | **46/46** |
| All 14 public pages boot | **14/14** |
| CSS parse + brace balance | **6/6** |
| JS syntax, every touched file | **11/11** |

Covers: filter combinations, empty and malformed data, XSS escaping (a
`<img onerror=...>` vendor name renders as inert text — 0 elements, 0 attributes
created), invite validation, mobile drawer open/close/Escape/scrim, double-script
inclusion, and Tawk offsets.

### Two bugs found and fixed along the way

**`config/env.js` — circular require crash.** `getLogger()` had a `try/catch`
guarding the circular dependency with `config/logger`, but a circular require
returns a *partial* `{}` rather than throwing, so `.warn` was undefined. Any
entry point that loaded `logger` before `env` died at require time with
`getLogger(...).warn is not a function`. `server.js` happens to require them in
the lucky order, which masked it. Now validates the shape before trusting it.

**`.gitignore`** — added `import-staging/`. Staged CSV imports contain real
business contact data (names, phones, emails) and must never be committed.

---

## 5. Things you should know before shipping

- **I could not run the server.** My sandbox blocks `binaries.prisma.sh`, so
  Prisma's engines never downloaded. Everything above is verified through unit
  tests, a headless DOM, and static analysis — but no request has actually hit a
  real database. The paths I'd exercise first: upload a CSV with known duplicates
  end-to-end, send one real invitation, and click through every Approve Businesses
  tab on a phone.

- **`tests/smoke.test.js` fails in my environment only** — it needs
  `prisma generate` to have run. It should pass on your machine.

- **`tests/email.service.test.js` is environment-dependent** (pre-existing, not
  from this change). It only passes when `SMTP_USER` and `SMTP_PASS` are set in
  `.env`; with them empty the service correctly falls back to console-logging and
  returns `ok: true`, which the test doesn't expect.

- **Content Security Policy is still disabled** in `server.js`. That predates this
  change and I haven't touched it, but the new code follows the same escaping
  discipline as the rest — all interpolation goes through `escHtml`/`escJsAttr`,
  and CSV text fields are run through the server-side tag stripper on the way in.

- **Rotate the credentials in the PDF.** Page 3 contains working logins for
  `dealsms.in` and `app.bhashsms.com`. They're scribbled over in the image, but
  the text layer underneath extracts cleanly. Please rotate them and don't
  circulate that file.

---

## 6. Still open

- The vendor and couple dashboards (`bdashboard.html`, `user-dashboard.html`) get
  the shared polish and Tawk, but their internal layouts weren't reworked.
- `charts.js` (the main dashboard's charts, not the CRM ones) picked up the new
  palette but keeps its original styling.
- Reject-claim is still a "not yet available" toast — it was already stubbed and
  needs a backend endpoint.
