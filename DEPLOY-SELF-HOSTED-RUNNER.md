# Deploying without inbound SSH — self-hosted runner on the VPS

## Why

`.github/workflows/deploy.yml` deploys by connecting **into** the VPS over SSH from a
GitHub-hosted runner. That inbound connection keeps failing:

```
Cannot open a TCP connection to the VPS on port 22 after 8 attempts over ~2 minutes.
```

Port 22 answers from a normal machine, so sshd is running and the site is up — the
packets from GitHub's runner IPs are being dropped, by the Hostinger hPanel firewall,
by `ufw`, or by fail2ban. GitHub's runners use a large rotating IP range, so an
allowlist can never cover them.

A **self-hosted runner** removes the problem: the runner lives on the VPS and dials
**out** to GitHub over HTTPS (443). Nothing has to be reachable from the internet, and
no deploy key is needed.

`.github/workflows/deploy-vps-runner.yml` is that deploy. It runs the same steps as the
SSH workflow — `git reset --hard origin/main`, `docker compose up -d --build app`,
then the loopback and public health checks — only locally on the box.

## One-time setup (about 5 minutes, on the VPS)

Run as `root`, or as the user that owns `/opt/wedeazzy-com` and can use Docker.

### 1. Get a registration token

In GitHub: **Settings → Actions → Runners → New self-hosted runner → Linux x64**.
Copy the `./config.sh ... --token ABC...` line; the token is valid for one hour.

### 2. Install the runner

```bash
sudo mkdir -p /opt/actions-runner && cd /opt/actions-runner
curl -o actions-runner-linux-x64.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.328.0/actions-runner-linux-x64-2.328.0.tar.gz
tar xzf actions-runner-linux-x64.tar.gz
```

Check the release page for the current version if that URL 404s.

### 3. Register it with the label the workflow expects

The runner refuses to run as root, so create a user for it:

```bash
sudo useradd -m -s /bin/bash gha && sudo usermod -aG docker gha
sudo chown -R gha:gha /opt/actions-runner
sudo chown -R gha:gha /opt/wedeazzy-com          # the runner must be able to git pull here
sudo -u gha /opt/actions-runner/config.sh \
  --url https://github.com/Devpysber/Wedeazzy-dotcom \
  --token <TOKEN FROM STEP 1> \
  --name wedeazzy-vps \
  --labels wedeazzy-vps \
  --work _work --unattended --replace
```

`--labels wedeazzy-vps` matters: the workflow targets `[self-hosted, wedeazzy-vps]`.

### 4. Run it as a service so it survives reboots

```bash
cd /opt/actions-runner
sudo ./svc.sh install gha
sudo ./svc.sh start
sudo ./svc.sh status
```

The runner should now show as **Idle** under Settings → Actions → Runners.

### 5. Deploy

Push to `main`, or run **Actions → Deploy to VPS (self-hosted runner) → Run workflow**.

## Notes

- **Both workflows trigger on push.** Once the runner works, stop the old one from
  running automatically: edit `.github/workflows/deploy.yml` and delete its
  `push:` trigger, leaving `workflow_dispatch:`. They share a concurrency group, so
  they will never rebuild at the same time even if both run.
- **Secrets stay on the server.** Production values live in
  `/opt/wedeazzy-com/backend.env` and are never in the repo. The runner does not need
  `VPS_SSH_KEY` or `VPS_HOST`.
- **A self-hosted runner runs whatever the workflow says.** Keep the repository's
  workflow files under review, and do not enable runs from forked pull requests.
- **If the deploy fails on "Check the runner can drive the deployment":** the runner
  user cannot see `/opt/wedeazzy-com/.git` or cannot use Docker. Fix with the
  `usermod -aG docker gha` and `chown` lines above, then `sudo ./svc.sh restart`.
- **Removing the runner:** `sudo ./svc.sh stop && sudo ./svc.sh uninstall && sudo -u gha ./config.sh remove --token <NEW TOKEN>`.
