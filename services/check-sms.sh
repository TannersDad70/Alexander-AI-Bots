#!/usr/bin/env bash
# Check Google Messages for new texts every few minutes via the OpenBot computer
# browser (which holds the signed-in Google session for the sms-assistant bot),
# and pop a desktop notification when a conversation changes.
#
# Runs as a systemd user oneshot; the .timer companion fires it on an interval.
set -u

BOT="sms-assistant"
STATE_FILE="$HOME/.local/state/openbot-sms-state"
LOG_FILE="$HOME/.local/state/openbot-sms-check.log"

mkdir -p "$(dirname "$STATE_FILE")"

# Docker access without a fresh login: the user is a member of the docker group,
# and `newgrp` re-reads membership at each invocation.
dockerx() { echo "$*" | newgrp docker; }

# Quietly skip if the OpenBot container is not running.
if ! dockerx 'docker ps -q -f name=^alexander-computer-sms-assistant$' | grep -q .; then
  exit 0
fi

TOKEN="$(dockerx 'docker exec alexander-computer-sms-assistant sh -c "echo $COMPUTER_TOKEN"' | tr -d '\r\n')"
[ -n "$TOKEN" ] || exit 0

# First run (or a cleared state) establishes the baseline without announcing.
FIRST_RUN=1
if [ -f "$STATE_FILE" ] && [ -s "$STATE_FILE" ]; then
  FIRST_RUN=0
fi

# Inside the container: reload the conversation list, then take a snapshot.
REMOTE="$(mktemp)"
trap 'rm -f "$REMOTE"' EXIT
cat >"$REMOTE" <<'EOF'
H1="x-openbot-computer-token: $CHECK_TOKEN"
H2="x-openbot-bot-id: sms-assistant"
CT="Content-Type: application/json"
curl -s -m 60 -X POST -H "$H1" -H "$H2" -H "$CT" \
  -d '{"url":"https://messages.google.com/web/conversations"}' \
  http://127.0.0.1:4100/navigate >/dev/null
sleep 3
curl -s -m 60 -X POST -H "$H1" -H "$H2" http://127.0.0.1:4100/snapshot
EOF
dockerx "docker cp $REMOTE alexander-computer-sms-assistant:/tmp/openbot-sms-check.sh" >/dev/null
SNAP="$(dockerx "docker exec -e CHECK_TOKEN=$TOKEN alexander-computer-sms-assistant sh /tmp/openbot-sms-check.sh")"
dockerx 'docker exec alexander-computer-sms-assistant rm -f /tmp/openbot-sms-check.sh' >/dev/null

# Parse the snapshot, normalise conversation names (drop the trailing time-ago),
# and compare against the previous run. Emits JSON with new/changed entries.
RESULT="$(SNAP_JSON="$SNAP" python3 - "$STATE_FILE" <<'PYEOF'
import json, os, re, sys

state_file = sys.argv[1]
raw = os.environ["SNAP_JSON"]
try:
    data = json.loads(raw)
    elements = data.get("elements", [])
except Exception:
    elements = []

# Conversations appear as listbox options: "Sender preview 2 min ago"
timeago = re.compile(
    r"\s+(?:just now|\d+\s*(?:sec|secs|min|mins|minute|minutes|hr|hrs|hour|hours)\s*ago"
    r"|yesterday|today|(?:mon|tue|wed|thu|fri|sat|sun)(?:day|nesday|rsday|urday)?"
    r"|\d{1,2}/\d{1,2}(?:/\d{2,4})?)$",
    re.IGNORECASE,
)
convs = {}
for el in elements:
    if el.get("role") != "option":
        continue
    name = el.get("name", "").strip()
    norm = timeago.sub("", name).strip()
    if norm:
        convs[norm] = norm  # value is the time-ago-stripped form too

prev = {}
try:
    with open(state_file) as f:
        prev = json.load(f)
except Exception:
    prev = {}

new = {k: v for k, v in convs.items() if k not in prev}
changed = {k: v for k, v in convs.items() if k in prev and prev.get(k) != v}

with open(state_file, "w") as f:
    json.dump(convs, f, indent=0, sort_keys=True)

print(json.dumps({"new": new, "changed": changed, "count": len(convs)}))
PYEOF
)"

NEW_COUNT="$(RESULT_JSON="$RESULT" python3 - <<'PYEOF'
import json, os, sys
print(len(json.loads(os.environ["RESULT_JSON"])["new"]))
PYEOF
)"
CHANGED_COUNT="$(RESULT_JSON="$RESULT" python3 - <<'PYEOF'
import json, os, sys
print(len(json.loads(os.environ["RESULT_JSON"])["changed"]))
PYEOF
)"

# Baseline run: record state, say nothing.
if [ "$FIRST_RUN" = "1" ] || [ "$NEW_COUNT$CHANGED_COUNT" = "00" ]; then
  exit 0
fi

# Build a human summary of what changed.
SUMMARY="$(RESULT_JSON="$RESULT" python3 - <<'PYEOF'
import json, os
data = json.loads(os.environ["RESULT_JSON"])
lines = []
for k in list(data["new"].keys())[:5]:
    lines.append("New: %s" % data["new"][k])
for k in list(data["changed"].keys())[:5]:
    lines.append("Updated: %s" % data["changed"][k])
print("\n".join(lines))
PYEOF
)"

TS="$(date '+%Y-%m-%d %H:%M:%S')"
echo "[$TS]" >>"$LOG_FILE"
echo "$SUMMARY" >>"$LOG_FILE"

# Desktop notification (requires a notification daemon such as mako).
if command -v notify-send >/dev/null 2>&1; then
  COUNT=$((NEW_COUNT + CHANGED_COUNT))
  notify-send -a "SMS check" "New texts ($COUNT)" "$SUMMARY" 2>/dev/null || true
fi

exit 0