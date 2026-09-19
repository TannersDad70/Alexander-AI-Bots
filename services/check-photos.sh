#!/usr/bin/env bash
# Check Google Photos for new items every few minutes via the OpenBot computer
# browser (which holds the linked WhatsApp session for the photos-assistant
# bot), and pop a desktop notification when the chat list changes.
#
# Runs as a systemd user oneshot; the .timer companion fires it on an interval.
set -u

BOT="google-assistant"
STATE_FILE="$HOME/.local/state/openbot-photos-state"
LOG_FILE="$HOME/.local/state/openbot-photos-check.log"

mkdir -p "$(dirname "$STATE_FILE")"

# Docker access without a fresh login: the user is a member of the docker group,
# and `newgrp` re-reads membership at each invocation.
dockerx() { echo "$*" | newgrp docker; }

# Quietly skip if the OpenBot container is not running.
if ! dockerx 'docker ps -q -f name=^alexander-computer-google-assistant$' | grep -q .; then
  exit 0
fi

TOKEN="$(dockerx 'docker exec alexander-computer-google-assistant sh -c "echo $COMPUTER_TOKEN"' | tr -d '\r\n')"
[ -n "$TOKEN" ] || exit 0

# First run (or a cleared state) establishes the baseline without announcing.
FIRST_RUN=1
if [ -f "$STATE_FILE" ] && [ -s "$STATE_FILE" ]; then
  FIRST_RUN=0
fi

# Inside the container: reload WhatsApp Web, then read the page text (the chat
# list does not surface in the AI snapshot, but does in the readable text).
REMOTE="$(mktemp)"
trap 'rm -f "$REMOTE"' EXIT
cat >"$REMOTE" <<'EOF'
H1="x-openbot-computer-token: $CHECK_TOKEN"
H2="x-openbot-bot-id: photos-assistant"
CT="Content-Type: application/json"
curl -s -m 90 -X POST -H "$H1" -H "$H2" -H "$CT" \
  -d '{"url":"https://photos.google.com"}' \
  http://127.0.0.1:4100/navigate >/dev/null
sleep 4
curl -s -m 90 -H "$H1" -H "$H2" http://127.0.0.1:4100/read
EOF
dockerx "docker cp $REMOTE alexander-computer-google-assistant:/tmp/openbot-photos-check.sh" >/dev/null
TEXT="$(dockerx "docker exec -e CHECK_TOKEN=$TOKEN alexander-computer-google-assistant sh /tmp/openbot-photos-check.sh")"
dockerx 'docker exec alexander-computer-google-assistant rm -f /tmp/openbot-photos-check.sh' >/dev/null

# Parse the page text. WhatsApp's innerText glues elements together with no
# reliable line breaks, so instead of parsing chats we build a dense signature
# (whitespace and digits removed): badge counts and unread numbers vanish, and
# only real content changes (new previews, moved chats) alter it.
RESULT="$(WA_TEXT="$TEXT" python3 - "$STATE_FILE" <<'PYEOF'
import json, os, re, sys

state_file = sys.argv[1]
raw = os.environ.get("WA_TEXT", "")
try:
    data = json.loads(raw)
    text = data.get("text", "")
    title = data.get("title", "")
except Exception:
    text = raw
    title = ""

sig = re.sub(r"[\s\d\u00a0]+", "", text)

prev = ""
try:
    with open(state_file) as f:
        prev = f.read()
except Exception:
    prev = ""
changed = sig != prev

with open(state_file, "w") as f:
    f.write(sig)

# Readable snippet for the notification: first lines that are not page chrome.
chrome = {
    "All", "Unread", "Favorites", "Groups", "New list", "Status", "Chats",
    "Channels", "Communities", "Tools", "Advertise", "Media", "Settings",
    "Profile", "Menu", "New chat", "Close", "Send document", "Add contact",
    "Get started", "Turn on", "Reach new customers", "WhatsApp",
    "Advertise your business on Facebook & Instagram.",
    "Message notifications are off.",
    "Your personal messages are end-to-end encrypted",
    "Updates in Status", "End-to-end encrypted",
}
lines = []
for line in text.splitlines():
    l = line.strip()
    if l and l not in chrome and not re.fullmatch(r"[\d\s]+", l):
        lines.append(l)

print(json.dumps({
    "changed": changed,
    "snippet": "\n".join(lines[:4]),
    "title": title,
}))
PYEOF
)"

CHANGED="$(RESULT_JSON="$RESULT" python3 - <<'PYEOF'
import json, os
print(json.dumps(json.loads(os.environ["RESULT_JSON"])["changed"]))
PYEOF
)"

# Baseline run: record state, say nothing.
if [ "$FIRST_RUN" = "1" ] || [ "$CHANGED" = "False" ]; then
  exit 0
fi

TITLE="$(RESULT_JSON="$RESULT" python3 - <<'PYEOF'
import json, os
print(json.loads(os.environ["RESULT_JSON"])["title"])
PYEOF
)"
SUMMARY="$(RESULT_JSON="$RESULT" python3 - <<'PYEOF'
import json, os
d = json.loads(os.environ["RESULT_JSON"])
snippet = d["snippet"] or "chat list changed"
print(d["title"] or "WhatsApp")
print(snippet[:400])
PYEOF
)"

TS="$(date '+%Y-%m-%d %H:%M:%S')"
echo "[$TS]" >>"$LOG_FILE"
echo "$SUMMARY" >>"$LOG_FILE"

if command -v notify-send >/dev/null 2>&1; then
  notify-send -a "Photos check" "New Google Photos activity" "$SUMMARY" 2>/dev/null || true
fi

exit 0