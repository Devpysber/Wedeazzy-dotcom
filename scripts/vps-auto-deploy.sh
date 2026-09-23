#!/usr/bin/env bash
#
# Pull-based deploy for the Hostinger VPS.
#
# GitHub-hosted runners cannot open an inbound SSH connection to this server
# (the hPanel firewall / fail2ban drop their rotating IPs), so instead of
# GitHub pushing a deploy in, the server pulls one out: this script checks
# origin/main every few minutes and rebuilds when the commit changed.
#
# Install (as root, once) - see DEPLOY-VPS-AUTO.md:
#   install -m 755 /opt/wedeazzy-com/scripts/vps-auto-deploy.sh /usr/local/bin/wedeazzy-auto-deploy
#   ( crontab -l 2>/dev/null; echo '*/3 * * * * /usr/local/bin/wedeazzy-auto-deploy >> /var/log/wedeazzy-deploy.log 2>&1' ) | crontab -
#
# Manual run (deploys immediately, whatever the commit):
#   wedeazzy-auto-deploy --force
#
# Exit codes: 0 nothing to do or deployed cleanly, 1 deploy failed.
set -uo pipefail

APP_DIR="${WEDEAZZY_APP_DIR:-/opt/wedeazzy-com}"
BRANCH="${WEDEAZZY_BRANCH:-main}"
COMPOSE_FILE="${WEDEAZZY_COMPOSE_FILE:-docker-compose.prod.yml}"
HEALTH_URL="${WEDEAZZY_HEALTH_URL:-http://127.0.0.1:4000/health}"
LOCK_FILE="/var/lock/wedeazzy-deploy.lock"
FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

# Never let cron start a second deploy while one is still building.
exec 9>"$LOCK_FILE" || { log "cannot open $LOCK_FILE"; exit 1; }
if ! flock -n 9; then
  log "another deploy is already running - skipping this tick"
  exit 0
fi

cd "$APP_DIR" 2>/dev/null || { log "ERROR: $APP_DIR is missing"; exit 1; }
[ -d .git ] || { log "ERROR: $APP_DIR is not a git working copy"; exit 1; }

if ! git fetch --prune --quiet origin "$BRANCH"; then
  log "ERROR: git fetch failed (network or credentials)"
  exit 1
fi

local_sha=$(git rev-parse HEAD)
remote_sha=$(git rev-parse "origin/${BRANCH}")

if [ "$local_sha" = "$remote_sha" ] && [ "$FORCE" -eq 0 ]; then
  exit 0   # up to date; stay quiet so the log only records real deploys
fi

log "deploying ${local_sha:0:7} -> ${remote_sha:0:7} ($(git log -1 --pretty=%s "origin/${BRANCH}"))"

# Hard reset: the server's working copy is a deploy target, not a place to edit.
if ! git reset --hard --quiet "origin/${BRANCH}"; then
  log "ERROR: git reset failed"
  exit 1
fi

if ! docker compose -f "$COMPOSE_FILE" up -d --build app; then
  log "ERROR: docker compose build/up failed"
  docker compose -f "$COMPOSE_FILE" logs --tail=100 --no-color app
  exit 1
fi

# Migrations run in the background after the port opens, so /health answers 503
# with "migrations":"pending" for a while. 90 x 5s covers a slow migration.
for i in $(seq 1 90); do
  body=$(curl -sS --max-time 10 "$HEALTH_URL" 2>/dev/null || true)
  case "$body" in
    *'"ok":true'*)
      log "deployed ${remote_sha:0:7} - app healthy after $((i * 5))s"
      exit 0
      ;;
  esac
  sleep 5
done

log "ERROR: app never became healthy at $HEALTH_URL after the rebuild"
docker compose -f "$COMPOSE_FILE" ps
docker inspect --format '{{.Name}} restarts={{.RestartCount}} state={{.State.Status}} exit={{.State.ExitCode}}' \
  $(docker compose -f "$COMPOSE_FILE" ps -q) 2>/dev/null || true
docker compose -f "$COMPOSE_FILE" logs --tail=150 --no-color app
exit 1
