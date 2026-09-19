#!/usr/bin/env bash
# Publish whatever is in the business repository to the live deployments.
#
# This is the second half of the workflow: changes are made in
# github.com/TannersDad70/Alexander-AI-Bots, and this brings them to the
# deployments in the field. It runs from a systemd timer.
#
#   * app/                 -> the live app directory, then a new build
#                             (services/deploy-app.sh stamps build id +
#                             version.json, and the popup's "Update the app"
#                             hands it to each device)
#   * deployments/<slug>/  -> that deployment's page shell
#     branded/index.html
#   * branding/assets/     -> the artwork beside every shell (hero, cards,
#                             favicons)
#
# Anything else in the repository (docs, services, templates) takes effect
# when it is applied, and never touches a running deployment.
set -euo pipefail

REPO="/home/aais/alexander-ai-bots"
LIVE="/home/aais/Projects/alexander-apps/web"
LOG="$HOME/.local/state/openbot-app-deploy.log"

mkdir -p "$(dirname "$LOG")"
log() { echo "$(date -Is) $*" >> "$LOG"; }

deployment_dir() {
  case "$1" in
    alexander) echo "/home/aais/openbot" ;;
    randy)     echo "/home/aais/openbot-randy" ;;
    state)     echo "/home/aais/openbot-state" ;;
    davis)     echo "/home/aais/openbot-davis" ;;
  esac
}

cd "$REPO" || { log "repository missing"; exit 0; }

before="$(git rev-parse HEAD)"
if ! git pull --quiet --ff-only origin main; then
  log "pull failed (offline or diverged) — nothing deployed"
  exit 0
fi
after="$(git rev-parse HEAD)"
[ "$before" = "$after" ] && exit 0

changed() { ! git diff --quiet "$before" "$after" -- "$@"; }
did_something=0

# --- the app ---------------------------------------------------------------
if changed app/; then
  rsync -a --delete --exclude '*.bak-*' --exclude '*.tar' "$REPO/app/" "$LIVE/"
  if /home/aais/bin/deploy-app.sh >>"$LOG" 2>&1; then
    log "deployed app from ${after:0:7}"
    did_something=1
  else
    log "deploy-app.sh failed for ${after:0:7}"
  fi
fi

# --- the page shells and the artwork ---------------------------------------
if changed deployments/ branding/assets/; then
  for slug in alexander randy state davis; do
    dir="$(deployment_dir "$slug")"
    [ -d "$dir/branded" ] || continue

    shell="$REPO/deployments/$slug/branded/index.html"
    if [ -f "$shell" ] && ! cmp -s "$shell" "$dir/branded/index.html"; then
      cp "$dir/branded/index.html" "$dir/branded/index.html.bak-$(date +%Y%m%d%H%M)" 2>/dev/null || true
      cp "$shell" "$dir/branded/index.html"
      log "$slug: page shell updated"
      did_something=1
    fi

    for asset in "$REPO"/branding/assets/*; do
      name="$(basename "$asset")"
      [ "$name" = "README.md" ] && continue
      [ -f "$asset" ] || continue
      if ! cmp -s "$asset" "$dir/branded/$name"; then
        cp "$asset" "$dir/branded/$name"
        log "$slug: artwork updated — $name"
        did_something=1
      fi
    done
  done
fi

[ "$did_something" = "1" ] || log "pulled ${after:0:7} — nothing to publish"
