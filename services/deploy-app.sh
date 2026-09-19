#!/usr/bin/env bash
# Publish the companion app to every deployment.
#
# The app lives in one place (/home/aais/Projects/alexander-apps/web) and all
# four deployments serve it at /app/, so this is what "update the app" means:
# bump the asset version so browsers fetch fresh files, stamp a new build id
# into config.js, and write version.json. Installed copies then see the new
# build in Settings -> App updates and can update themselves.
set -euo pipefail

WEB="/home/aais/Projects/alexander-apps/web"
[ -d "$WEB" ] || { echo "app directory not found: $WEB" >&2; exit 1; }

BUILD="$(date +%Y-%m-%d.%H%M)"
export WEB BUILD

python3 - <<'PYEOF'
import json
import os
import pathlib
import re

web = pathlib.Path(os.environ["WEB"])
build = os.environ["BUILD"]

# 1. Bump ?v=N on every asset reference in index.html so nothing is served
#    from a browser or edge cache.
index = web / "index.html"
html = index.read_text()
match = re.search(r"\?v=(\d+)", html)
version = int(match.group(1)) + 1 if match else 2
html = re.sub(r"\?v=\d+", f"?v={version}", html)
index.write_text(html)

# 2. Stamp the build id the running app reports.
config = web / "config.js"
text = config.read_text()
if re.search(r'build:\s*"[^"]*"', text):
    text = re.sub(r'build:\s*"[^"]*"', f'build: "{build}"', text)
else:
    text = text.replace('appVersion: "', f'build: "{build}",\n  appVersion: "', 1)
config.write_text(text)

# 3. Publish what the newest build is, for Settings -> App updates.
(web / "version.json").write_text(
    json.dumps({"build": build, "version": "1.0.0", "updated": build.split(".")[0]}, indent=2) + "\n"
)

print(f"deployed build {build} (assets ?v={version})")
PYEOF

echo "App published. Every deployment serves it at /app/ immediately."
