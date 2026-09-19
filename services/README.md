# The key service

`save-key-service.py` is the small endpoint behind the Help page's OpenRouter form:

- `POST /save-key` writes `OPENAI_API_KEY` into that deployment's `.env` and restarts it
- `GET /info` reports the model the agents run on and whether a key is set

It listens on `127.0.0.1:9090` only, and every request must carry the shared secret that Caddy
adds — so it is not reachable except through the login gate. The secret is generated on first
run at `~/.config/openbot-save-key.secret`; put the same value in the Caddyfile.

Add one entry per deployment to `INSTANCES`, then run it as a user service.

## The other services

| File | What it does |
|---|---|
| `vault-log.py` | Writes each bot's Activity Log and Conversations into its Obsidian vault, on a timer |
| `check-sms.sh` | Reads Google Messages in the bot's own computer and notifies on new conversations |
| `check-whatsapp.sh` | The same for WhatsApp Web |
| `check-messenger.sh` | The same for Messenger |
| `check-photos.sh` | The same for Google Photos |
| `check-computers-idle.sh` | Puts the branded "computer ready" page back on bots with no work to show |
| `deploy-app.sh` | Publishes the companion app: bumps the asset version, stamps a build id, writes `version.json` |

The checkers run as systemd user timers on the machine that hosts the deployment.
Each one drives the **bot's own computer** (never a shared browser), so what the
app's Computer screen shows is exactly what the check saw.
