#!/usr/bin/env bash
# Keep the two Bots without a checker from showing a blank white screen.
#
# A Bot computer's browser starts on about:blank, and nothing navigates it
# unless the Bot is given work. The checker-driven Bots (SMS, WhatsApp,
# Messenger, Photos) re-navigate themselves every three minutes; these two
# do not, so this puts their branded "computer ready" page back whenever
# the browser is sitting on about:blank (for example after a restart).
#
# Runs as a systemd user oneshot; the .timer companion fires it on an interval.
set -u

# Bot -> the page to put back on its screen.
BOTS="general-assistant knowledge"
home_of() {
  case "$1" in
    general-assistant) echo "https://vault.jays-web.org/idle/general-assistant/" ;;
    knowledge)         echo "https://vault.jays-web.org/idle/knowledge/" ;;
  esac
}

dockerx() { echo "$*" | newgrp docker; }

for bot in $BOTS; do
  container="alexander-computer-$bot"
  dockerx "docker ps -q -f name=^$container\$" | grep -q . || continue

  page="$(dockerx "docker exec $container sh -c 'curl -s -m 20 -H \"x-openbot-computer-token: \$COMPUTER_TOKEN\" http://127.0.0.1:4100/read'" 2>/dev/null)"
  case "$page" in
    *'"url":"about:blank"'*)
      url="$(home_of "$bot")"
      dockerx "docker exec $container sh -c 'curl -s -m 40 -X POST -H \"x-openbot-computer-token: \$COMPUTER_TOKEN\" -H \"Content-Type: application/json\" -d {\"url\":\"$url\"} http://127.0.0.1:4100/navigate'" >/dev/null 2>&1
      ;;
  esac
done
