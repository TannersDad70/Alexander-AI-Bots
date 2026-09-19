#!/usr/bin/env bash
# Log this deployment's activity and conversations into its vault, then
# rebuild the vault site and its graph.
#
# The logger needs docker-group access to read the deployment's database and
# its Intelligence threads. The systemd user manager may predate the account
# joining the docker group, so `newgrp` re-reads membership for that step.
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$HERE/deployment.json"

PY="/home/aais/.local/share/mise/installs/python/latest/bin/python3"
[ -x "$PY" ] || PY="$(command -v python3)"

echo "$PY $HERE/services/vault-log.py --config $CONFIG" | newgrp docker
"$PY" "$HERE/vault/build-vault-site.py" --config "$CONFIG"
