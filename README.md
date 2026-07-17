# WedEazzy — Production Deployment Guide & Documentation

This repository contains the production-ready code for the **WedEazzy** wedding planning platform. This guide contains detailed steps for deploying to both **Hostinger Shared Node.js Hosting / Cloud Hosting** and **Hostinger VPS Hosting**, along with database setup instructions, Prisma commands, and troubleshooting guides.

---

## 1. Application Architecture

```
User Browser
   │
   ▼ (HTTPS: https://yourdomain.com)
Hostinger Edge (SSL Termination & Phusion Passenger)
   │
   ▼ (Spawns application via app.js redirection)
Node.js Application (Running on local port)
   ├── backend/src/server.js (API Core, WebSockets, Cron schedulers)
   ├── public/ (Static HTML/CSS/JS frontend files)
   └── MySQL Database (Local or Remote Managed Host)
```

The application is structured as a nested Node.js project. To support Hostinger Shared Node.js hosting, a root-level `app.js` acts as the entry point, resolving path mappings and redirecting traffic to the backend server.

---

## 2. Hostinger Shared / Cloud Node.js Hosting Setup

If you are using Hostinger Shared Web Hosting (Business/Premium) or Cloud Hosting (Startup/Professional) with Node.js support:

### Step 2.1 — Create MySQL Database
1. Log in to your **Hostinger hPanel**.
2. Navigate to **Databases** -> **MySQL Databases**.
3. Create a new database: e.g., `u123456789_wedeazzy`.
4. Create a new user with a strong password and grant them **ALL privileges** on the new database.
5. Note down the **MySQL Host**, **Database Name**, **Username**, and **Password**.

### Step 2.2 — Upload the Project Archive
1. Download `wedeazzy-production-ready.zip` from your local workspace.
2. Open **hPanel** -> **Files** -> **File Manager**.
3. Upload `wedeazzy-production-ready.zip` to the root folder (usually `/home/uXXXX/domains/yourdomain.com/public_html` or a custom subdirectory).
4. Extract the ZIP archive using the File Manager's **Extract** tool. Ensure files are directly in the domain's root folder.

### Step 2.3 — Configure Environment Variables
1. Rename `backend/.env.example` to `backend/.env`.
2. Edit `backend/.env` with your actual database credentials:
   ```env
   NODE_ENV=production
   PORT=4000
   PUBLIC_BASE_URL=https://your-domain.com
   FRONTEND_ORIGIN=https://your-domain.com
   DATABASE_URL="mysql://username:password@mysql_host:3306/database_name"
   JWT_SECRET=your-random-64-character-hex-string
   OTP_DEBUG_LOG=false
   ```
3. Update the SMTP mail server credentials:
   ```env
   SMTP_HOST=smtp.hostinger.com
   SMTP_PORT=465
   SMTP_USER=info@your-domain.com
   SMTP_PASS=your-email-password
   SMTP_FROM=WedEazzy <info@your-domain.com>
   SMTP_SECURE=true
   ```

### Step 2.4 — Install Dependencies
1. Go to **hPanel** -> **Websites** -> **Manage** -> **Node.js Dashboard**.
2. Click **Create Application** (if not already created).
3. Set the configuration:
   - **Node.js Version**: Select **20.x** (or highest available version).
   - **Application Directory**: Choose the folder where you uploaded the files (e.g. `public_html`).
   - **Application Startup File**: Set this to `app.js` (this will run the root redirection script).
4. Once configured, click **npm install** in the hPanel Node.js dashboard to install all dependencies.

### Step 2.5 — Run Database Migrations & Seeding
On Hostinger Shared Node.js hosting, there are three options to apply database migrations:

#### Option A: Connection via SSH (Recommended)
If your Hostinger plan includes SSH access (Cloud hosting or high-tier Shared hosting):
1. Connect to your VPS/Shared account via SSH using the credentials in **hPanel** -> **Advanced** -> **SSH Access**.
2. Navigate to your website folder:
   ```bash
   cd domains/yourdomain.com/public_html
   ```
3. Run the Prisma migrations and generate the client:
   ```bash
   # Generate Prisma Client
   npx prisma generate --schema=backend/prisma/schema.prisma

   # Deploy Migrations
   npx prisma migrate deploy --schema=backend/prisma/schema.prisma

   # Seed Admin User
   node backend/src/scripts/seed-admin.js
   ```

#### Option B: Remote MySQL Migration
If you do not have SSH access:
1. In **hPanel** -> **MySQL Databases**, allow **Remote MySQL** access for your local IP address.
2. In your local development machine, open your `.env` and temporarily set `DATABASE_URL` to point to the remote Hostinger MySQL host.
3. Run the migrations from your local machine:
   ```bash
   npx prisma migrate deploy --schema=backend/prisma/schema.prisma
   node backend/src/scripts/seed-admin.js
   ```
4. Once completed, disable Remote MySQL or delete your local IP from the whitelist for security.

### Step 2.6 — Start the Application
1. In the **hPanel Node.js Dashboard**, click **Start** or **Restart Application**.
2. Open your browser and navigate to `https://your-domain.com/health` to confirm the application responds.

---

## 3. Hostinger VPS (PM2) Deployment Setup

For full-control VPS deployments:

```bash
# 1. SSH into VPS
ssh root@your_vps_ip

# 2. Upload zip and extract
unzip wedeazzy-production-ready.zip -d /opt/wedeazzy/

# 3. Configure environment
cd /opt/wedeazzy/
cp backend/.env.example backend/.env
nano backend/.env

# 4. Install production dependencies and generate client
cd backend
npm install --omit=dev
npx prisma generate
npx prisma migrate deploy
node src/scripts/seed-admin.js

# 5. Start using PM2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

---

## 4. Prisma Cheat-Sheet

All Prisma commands are run with `--schema=backend/prisma/schema.prisma` if executed from the project root.

| Command | Purpose |
|---------|---------|
| `npx prisma generate` | Regenerates the Prisma Client JS files |
| `npx prisma migrate dev --name <description>` | Creates and applies a database migration (Local Dev only) |
| `npx prisma migrate deploy` | Applies all pending migrations to the database (Production) |
| `npx prisma db push` | Pushes the schema state directly to the DB without creating migration files |
| `npx prisma studio` | Opens a web UI to view and edit database rows |

---

## 5. Troubleshooting Guide

### 500 Internal Server Error / Database Connection Failures
* **Symptom**: Page loads but returns 500 on login/register or when loading dynamic content.
* **Solution**: 
  1. Confirm your `DATABASE_URL` in `.env` uses URL-encoded characters for special symbols in passwords (e.g. `@` as `%40`).
  2. Verify the database user has full grants on the target schema.
  3. Check the server logs (and `GET /health`) to confirm database connectivity status.

### Phusion Passenger "App Not Spawning" Errors
* **Symptom**: Browser shows a Hostinger default page or "Phusion Passenger Error".
* **Solution**:
  1. Verify `app.js` is present in the root folder and correctly contains `require('./backend/src/server.js')`.
  2. Check the hPanel Node.js dashboard to ensure the Application Startup File is set to `app.js`.
  3. Ensure your `package.json` at the root defines `"type": "commonjs"` or isn't using unsupported ES module imports directly in `app.js`.

### JWT Decryption Failures ("JWT_SECRET must be set")
* **Symptom**: The application crashes immediately on boot or fails to authenticate logins.
* **Solution**:
  1. Ensure `JWT_SECRET` is not set to default values like `dev-only-change-me` or `please_change_this`.
  2. Generate a secure 64-character secret using:
     `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

### WhatsApp OTP is not delivering
* **Symptom**: Users don't receive OTPs via WhatsApp.
* **Solution**:
  1. Log in to the Admin Dashboard (`https://your-domain.com/admin`).
  2. Go to **WhatsApp Status** and scan the QR code to pair the server-side Baileys client.
  3. Ensure the phone numbers are entered with country codes (e.g., `91xxxxxxxxxx`).
