#!/usr/bin/env bash
# Refresh the copies in this repository from the live machine.
#
# The app and the services run from fixed places on the box; this pulls them
# in so a commit captures exactly what is deployed.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
APP_LIVE="/home/aais/Projects/alexander-apps/web"
BIN="/home/aais/bin"

if [ -d "$APP_LIVE" ]; then
  rsync -a --delete --exclude '*.bak-*' --exclude '*.tar' "$APP_LIVE/" "$REPO/app/"
fi

for f in vault-log.py check-sms.sh check-whatsapp.sh check-messenger.sh \
         check-photos.sh check-computers-idle.sh deploy-app.sh; do
  if [ -f "$BIN/$f" ]; then
    cp "$BIN/$f" "$REPO/services/"
  fi
done

echo "Synced app/ and services/ from the live machine."
git -C "$REPO" status --short
