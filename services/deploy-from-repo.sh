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

# A local commit is a publish too, not only a pulled one: --publish-app
# forces the app step after committing here on the machine.
force_app=0
[ "${1:-}" = "--publish-app" ] && force_app=1

before="$(git rev-parse HEAD)"
if ! git fetch --quiet origin main || ! git merge --quiet --ff-only FETCH_HEAD; then
  log "pull failed (offline or diverged) — nothing deployed"
  exit 0
fi
after="$(git rev-parse HEAD)"

changed() { ! git diff --quiet "$before" "$after" -- "$@"; }
did_something=0

# --- the app ---------------------------------------------------------------
# Publishing stamps two values into the live copy (the asset version in
# index.html, the build id in config.js) and writes version.json, so those
# are compared with the stamped parts normalised away — otherwise every run
# would look like a change and redeploy forever.
norm() { sed 's/?v=[0-9]*/?v=X/g; s/build: "[^"]*"/build: "X"/' "$1"; }
app_changed=0
if ! diff -rq --exclude=version.json --exclude=index.html --exclude=config.js \
        --exclude='*.bak-*' --exclude='*.tar' "$REPO/app" "$LIVE" >/dev/null 2>&1; then
  app_changed=1
fi
diff -q <(norm "$REPO/app/index.html") <(norm "$LIVE/index.html") >/dev/null 2>&1 || app_changed=1
diff -q <(norm "$REPO/app/config.js") <(norm "$LIVE/config.js") >/dev/null 2>&1 || app_changed=1

if [ "$force_app" = "1" ] || [ "$app_changed" = "1" ] || changed app/; then
  rsync -a --delete --exclude '*.bak-*' --exclude '*.tar' "$REPO/app/" "$LIVE/"
  if /home/aais/bin/deploy-app.sh >>"$LOG" 2>&1; then
    log "deployed app (${after:0:7})"
    did_something=1
  else
    log "deploy-app.sh failed (${after:0:7})"
  fi
fi

# --- the page shells and the artwork ---------------------------------------
# Compared against the live files, not against the pull: shells and artwork
# carry no machine-stamped values, so a straight comparison is always right.
if true; then
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
