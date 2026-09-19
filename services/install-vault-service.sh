#!/usr/bin/env bash
# Install (or refresh) this deployment's vault logging.
#
# Writes a systemd user service + timer that runs services/vault-log-run.sh
# every 15 seconds: the Activity Log, the full conversation notes, and the
# graph all refresh together. Idempotent — the publisher runs it on every
# update, so a change to the units or the scripts takes effect then.
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$HERE/deployment.json"
[ -f "$CONFIG" ] || { echo "no deployment.json in $HERE"; exit 0; }

SLUG="$(python3 - "$CONFIG" <<'PY'
import json, sys
print(json.load(open(sys.argv[1]))["slug"])
PY
)"

UNIT_DIR="$HOME/.config/systemd/user"
mkdir -p "$UNIT_DIR"

cat > "$UNIT_DIR/vault-$SLUG.service" <<EOF
[Unit]
Description=Log this deployment's activity and conversations into its Obsidian vault

[Service]
Type=oneshot
ExecStart=$HERE/services/vault-log-run.sh
EOF

cat > "$UNIT_DIR/vault-$SLUG.timer" <<EOF
[Unit]
Description=Refresh this deployment's vault every 15 seconds

[Timer]
OnBootSec=1min
OnUnitActiveSec=15s
AccuracySec=1s
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now "vault-$SLUG.timer" >/dev/null 2>&1
echo "vault-$SLUG.timer installed (every 15s)"
