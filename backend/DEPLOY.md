# WedEazzy Backend — Hostinger VPS Deploy Playbook

Production target: **Hostinger KVM VPS 2** (₹599/mo, 4 GB RAM, 50 GB SSD, Ubuntu 22.04).

Shared "Cloud Hosting" plans on Hostinger **will not work** — Baileys needs a long-running Node process and persistent WhatsApp socket.

---

## 0. Buy / provision the VPS

1. Hostinger → VPS → KVM 2 (or higher) → Ubuntu 22.04 LTS → create root password.
2. SSH in: `ssh root@<vps-ip>` (or use Hostinger's browser terminal).
3. Point `api.wedeazzy.com` (an A record) to the VPS IP in Hostinger DNS.

## 1. One-time server setup (~10 min, copy-paste)

```bash
# As root
apt-get update && apt-get -y upgrade
apt-get -y install ufw nginx certbot python3-certbot-nginx git curl unzip

# Firewall
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable

# Docker + compose plugin
curl -fsSL https://get.docker.com | sh
apt-get -y install docker-compose-plugin

# Non-root user (optional but recommended)
adduser --disabled-password --gecos "" wedeazzy
usermod -aG docker wedeazzy
mkdir -p /opt/wedeazzy && chown wedeazzy:wedeazzy /opt/wedeazzy
```

## 2. Push the backend to the VPS

From your laptop:

```bash
# Local
cd "Wedeazzy.com_new/backend"
rsync -avz --exclude node_modules --exclude .data --exclude baileys-auth . wedeazzy@<vps-ip>:/opt/wedeazzy/backend
```

(Or git clone, if you push this to a private repo.)

## 3. Configure environment

```bash
ssh wedeazzy@<vps-ip>
cd /opt/wedeazzy/backend
cp .env.example .env
nano .env
```

Set at minimum:

```
NODE_ENV=production
PORT=4000
PUBLIC_BASE_URL=https://api.wedeazzy.com
FRONTEND_ORIGIN=https://www.wedeazzy.com,https://wedeazzy.com

DATABASE_URL="mysql://wedeazzy:<STRONG-PASS>@db:3306/wedeazzy"
JWT_SECRET=<paste a 64-char random string>
JWT_EXPIRES_IN=30d

OTP_DEBUG_LOG=false
BAILEYS_AUTH_DIR=/app/baileys-auth
WA_FROM_NUMBER=+91XXXXXXXXXX           # dedicated SIM, NOT personal

ADMIN_PHONES=917498987620
UPLOAD_DIR=/app/uploads
```

Generate a strong JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Update `docker-compose.yml` MySQL passwords to match the `DATABASE_URL`.

## 4. Boot the stack

```bash
docker compose up -d --build
docker compose logs -f app
```

First run will:
1. Wait for MySQL.
2. Run `prisma migrate deploy` (creates all tables).
3. Start the Node API on `:4000`.
4. Baileys boots → waits for QR pairing.

## 5. Pair WhatsApp (one-time)

1. SSH-tunnel the QR page to your laptop:
   ```bash
   ssh -L 4000:127.0.0.1:4000 wedeazzy@<vps-ip>
   ```
2. Open `http://localhost:4000/api/whatsapp/qr` in your browser.
3. On the dedicated WhatsApp phone: **Settings → Linked Devices → Link a Device → scan**.
4. Status flips to `online`. The auth state is saved in `./baileys-auth` and survives restarts.

## 6. Nginx reverse proxy + SSL

`/etc/nginx/sites-available/api.wedeazzy.com`:

```nginx
server {
    listen 80;
    server_name api.wedeazzy.com;

    client_max_body_size 12m;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/api.wedeazzy.com /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d api.wedeazzy.com   # SSL via Let's Encrypt
```

## 7. Wire the public site to the API

In `dashboard.html`, change the dev-time `API_BASE` block:

```js
const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:4000'
  : 'https://api.wedeazzy.com';
```

Then re-upload `dashboard.html` to your cPanel `public_html/`.

## 8. Daily MySQL backup

```bash
# Add to wedeazzy user's crontab:  crontab -e
0 3 * * * docker exec wedeazzy-db-1 mysqldump -uroot -p<root-pass> wedeazzy | gzip > /opt/wedeazzy/backups/wedeazzy-$(date +\%F).sql.gz
0 4 * * * find /opt/wedeazzy/backups -name "wedeazzy-*.sql.gz" -mtime +14 -delete
```

```bash
mkdir -p /opt/wedeazzy/backups
```

## 9. Updating the code

```bash
ssh wedeazzy@<vps-ip>
cd /opt/wedeazzy/backend
# Replace files via rsync from your laptop, then:
docker compose build app
docker compose up -d app
docker compose logs -f app
```

## 10. Health checks

```bash
curl https://api.wedeazzy.com/health
curl https://api.wedeazzy.com/api/whatsapp/status
```

`/health` should return `{ ok: true, env: "production" }`.
`/api/whatsapp/status` should return `{ status: "online" }` once paired.

---

## Operator runbook (handoff to your team)

| Task | How |
|---|---|
| WA disconnected | Re-pair via QR (step 5) |
| Forgot JWT secret | Don't rotate unless leaked — it logs out every user |
| Add a new admin phone | Add to `ADMIN_PHONES=` in `.env` → `docker compose up -d app` |
| Restore DB from backup | `gunzip < backup.sql.gz \| docker exec -i wedeazzy-db-1 mysql -uroot -p<pass> wedeazzy` |
| Inspect WA log | Prisma Studio: `docker exec -it wedeazzy-app-1 npx prisma studio` (forward port 5555) |

## Cost summary

| Item | Monthly |
|---|---|
| Hostinger KVM VPS 2 | ~₹599 |
| WhatsApp SIM (BSNL/Jio recharge) | ~₹250 |
| PhonePe PG fees (~2% on ₹5K) | per txn |
| Domain (wedeazzy.com renewal) | ~₹100/mo eq. |
| **Total fixed** | **~₹950/mo** |
