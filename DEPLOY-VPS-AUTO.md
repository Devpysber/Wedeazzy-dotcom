# Automatic deploys without GitHub reaching the server

## Why

Deploying from GitHub Actions means a GitHub-hosted runner opening an **inbound**
SSH connection to the VPS. That keeps failing:

```
Cannot open a TCP connection to the VPS on port 22 after 8 attempts over ~2 minutes.
```

Port 22 answers from an ordinary machine, so sshd is fine — packets from GitHub's
runner IPs are being dropped by the hPanel firewall, `ufw` or fail2ban. GitHub's
runners use a large rotating range, so an allowlist cannot cover them.

So the server pulls instead of GitHub pushing: `scripts/vps-auto-deploy.sh` runs on a
schedule, checks `origin/main`, and rebuilds only when the commit changed. Nothing
has to be reachable from the internet, and no runner or deploy key is involved.

## Install (as root, once, on the VPS)

```bash
cd /opt/wedeazzy-com
git fetch origin && git reset --hard origin/main      # get the script itself
install -m 755 scripts/vps-auto-deploy.sh /usr/local/bin/wedeazzy-auto-deploy
```

Add the schedule — every 3 minutes, logging to one file:

```bash
( crontab -l 2>/dev/null; echo '*/3 * * * * /usr/local/bin/wedeazzy-auto-deploy >> /var/log/wedeazzy-deploy.log 2>&1' ) | crontab -
crontab -l
```

Deploy the current commit straight away, without waiting for the next tick:

```bash
wedeazzy-auto-deploy --force
```

## Watching it

```bash
tail -f /var/log/wedeazzy-deploy.log
```

The log stays silent when there is nothing to deploy. A deploy looks like:

```
2026-09-23 11:04:02 deploying 29c28bf -> f28957d (ci: deploy from a runner on the VPS ...)
2026-09-23 11:05:31 deployed f28957d - app healthy after 55s
```

## How it behaves

- **Only rebuilds on a new commit** on `main`. Otherwise it exits immediately.
- **One at a time.** A `flock` lock means a slow build is never overlapped by the next
  cron tick.
- **Hard reset.** The working copy on the server is a deploy target: local edits to
  tracked files are discarded on the next deploy. Production secrets live in
  `/opt/wedeazzy-com/backend.env`, which is untracked and left alone.
- **Health-checked.** After `docker compose up -d --build app` it polls
  `http://127.0.0.1:4000/health` for up to 7.5 minutes (migrations run after the port
  opens). On failure it logs container status, restart counts and the last 150 log
  lines.
- **Exit codes:** 0 nothing to do or deployed cleanly, 1 deploy failed.

Override the defaults with environment variables if paths ever change:
`WEDEAZZY_APP_DIR`, `WEDEAZZY_BRANCH`, `WEDEAZZY_COMPOSE_FILE`, `WEDEAZZY_HEALTH_URL`.

## GitHub Actions after this change

Both workflows are **manual only** now, so nothing queues or fails on a push:

- **Deploy to VPS** (`deploy.yml`) — the original SSH deploy, usable if the firewall
  block is ever cleared.
- **Deploy to VPS (self-hosted runner)** (`deploy-vps-runner.yml`) — needs a runner
  installed on the VPS (see `DEPLOY-SELF-HOSTED-RUNNER.md`); it waits forever if there
  isn't one.

The checks that do not need the server still run on every push and pull request:
merge-conflict markers, and `node --check` on every backend file.

## Removing it

```bash
crontab -l | grep -v wedeazzy-auto-deploy | crontab -
rm -f /usr/local/bin/wedeazzy-auto-deploy
```
