# Alexander AI Solutions — Bots Platform

**AI coworkers you can hand real work to.** Each bot gets its own virtual computer — a real
browser with its own logins, its own files, and only the tools you grant it. You talk to a bot
like a person; it opens websites, clicks, types, reads, saves files, and remembers what it did.

This repository is the **branding and deployment kit** for our platform: the files we use to
stand up a private, white-labelled bot workspace on your own hardware, plus the scripts that
keep its vault, help pages and graph in sync.

> **Free to use, free to give away.** Everything here is MIT licensed. Take it, run it, brand it.

---

## Where this comes from

This platform is built on **[OpenBot](https://github.com/CopilotKit/OpenBot)** by
[CopilotKit](https://github.com/CopilotKit), which is released under the **MIT License**.
OpenBot is the engine: the agent platform, the per-bot computer, the gateway that decides and
records every action, the skills, routines and policy engine.

What we add is the **branding and the deployment layer**: the look (artwork, glowing type,
dark theme), the side-panel links, the per-app login gate, the Obsidian vault pages, the
interactive Obsidian graph, the Help pages, and the OpenRouter key form.

**We are grateful to the OpenBot authors.** If you find this useful, star their repository and
read their documentation — most of what makes this work is theirs.

- Upstream: <https://github.com/CopilotKit/OpenBot>
- Upstream licence: MIT
- This fork: MIT (see [`LICENSE`](LICENSE))

## How updates work

**Alexander AI Bots follows OpenBot, one week behind.**

When OpenBot publishes an update, we wait **one week**, test it against this branding layer on
a live deployment, fix anything the update moves, and then publish our own release. That gives
us time to catch the breakages that a fresh upstream change can bring — and gives you a fork
that has already been run, not just compiled.

| Upstream | Alexander AI Bots |
|---|---|
| OpenBot releases an update | We begin testing it the same day |
| — | One week of testing on a live deployment |
| — | We publish our release with any branding fixes |

If you want to follow upstream immediately, you can — see
[`docs/updating-from-openbot.md`](docs/updating-from-openbot.md) for exactly which files to
re-apply after pulling a new OpenBot image.

## We can brand this for anyone

This software is white-label. We can build the same platform for your business, under your
name, your colours and your domain — with your own bots, your own logins and your own
OpenRouter account. Nothing here is tied to us: the branding layer is a small set of files
(a page shell, a few scripted edits to the app bundle, and the artwork).

See [`docs/branding-for-customers.md`](docs/branding-for-customers.md) for what changes and
what stays the same.

## What it does

- **As many bots as you want** — one per job. Each keeps its own conversations, files and logins.
- **A virtual computer per bot** — a real browser on a real machine, with its own screen and profile.
- **Take the wheel, then hand it back** — when a bot meets a login, you take control of its screen,
  sign in yourself, and hand control back. Passwords go into the page, never to the bot.
- **Channels that remember** — conversations survive restarts; pick them up days later.
- **An Obsidian vault per bot** — permanent storage and long-term memory: plain Markdown notes the
  bot reads and writes, with automatic Activity Log and Conversations records.
- **An interactive Obsidian graph** — every note as a dot, click to open it, drag, zoom, filter.
- **Skills** — your own playbooks, saved as instructions and invoked with `/`.
- **Governed actions and an audit trail** — every action decided before it happens and recorded after.
- **Routines** — scheduled work that runs without being asked again.
- **Your choice of model through OpenRouter** — pay only for what you use.

## Repository layout

```
app/               The companion app: chat, bots, computers, activity, vault and graph
branding/          The look: page shell, bundle patch script, assets
deploy/            Deployment kit: env template, container run, tunnel, login gate
tenant-package/    The bots, channels, brand and model for a deployment
help/              Generates the in-app Help pages (including the OpenRouter key form)
vault/             Generates the Obsidian vault pages and the graph
pwa/               Makes a deployment installable as a phone app
services/          The small services: key saving, vault logging, the checks, app deploys
tools/             Housekeeping: sync the live files back into this repository
docs/              How it works, branding for customers, updating from OpenBot
```

## The companion app

`app/` is the phone-first app served by every deployment at `/app/`. It is plain
HTML/CSS/JS — no build step — and it talks to the deployment it is served from:

- **Chat** with any bot on the deployment, streamed live
- **Bots** — every bot, straight into its own computer
- **Computer** — watch the bot work, take control, hand it back
- **Activity** — the audit trail, newest first
- **Vault and Graph** — the bot's notes and their graph
- **Settings** — OpenRouter key, model, theme, and **App updates**: it checks the
  deployment for a newer build and updates itself in place

It is served from one directory for all deployments, so `services/deploy-app.sh`
is what publishes a change: it bumps the asset version, stamps a build id, and
writes `version.json` for the update button.

## How a change reaches the deployment

**This repository is the source of truth.** The workflow:

1. **Change the repository** — here on GitHub, or by asking the assistant.
2. **On the deployment, open the signed-in menu and choose "Update the app."**
   The host pulls this repository and publishes it: the app gets a new build
   (`services/deploy-app.sh`: new build id, fresh `version.json`), and the page
   shell and artwork are refreshed. If nothing changed, it says
   **"Everything is up to date."**

There is no background timer: publishing happens only when the button is
pressed. Changes to `docs/`, `services/`, the branding kit or the deployment
templates do not touch the running app — they take effect when they are
applied.

`tools/sync-from-live.sh` still exists for the reverse direction (capturing a
hotfix made on the machine into a commit), but the normal direction is
**repository → deployment**.

## Mobile

The platform is already phone-ready, and the plan for a native client is written up:

- [`docs/mobile-architecture.md`](docs/mobile-architecture.md) — what runs today, read from the live deployment
- [`docs/mobile-api-map.md`](docs/mobile-api-map.md) — every endpoint a mobile client needs, with the streaming contracts
- [`docs/mobile-reuse-vs-rewrite.md`](docs/mobile-reuse-vs-rewrite.md) — what to reuse, adapt and rewrite, and the three routes to an app
- [`docs/mobile-auth-findings.md`](docs/mobile-auth-findings.md) — why a gated deployment re-prompts on a phone, and the smallest safe fix
- [`docs/mobile-capability-gap.md`](docs/mobile-capability-gap.md) — what the installed PWA can already do, measured, and what truly needs native

## Install it on a phone

The platform is installable as an app (home-screen icon, full-screen, no browser chrome) with no
container rebuild and no database change — see [`pwa/`](pwa/README.md).

## Requirements

- Docker (the platform runs as containers)
- A domain on Cloudflare (for public access — or run it on your own network only)
- An [OpenRouter](https://openrouter.ai) account with a little credit, for the models
- A CopilotKit Intelligence key (free plan is available) for durable threads and memory

## Quick start

1. **Pull the engine**
   ```bash
   docker pull ghcr.io/copilotkit/openbot:latest
   ```

2. **Make a deployment folder** and copy the templates
   ```bash
   mkdir -p ~/my-bots && cd ~/my-bots
   cp /path/to/this/repo/deploy/.env.example .env
   cp -r /path/to/this/repo/tenant-package tenant
   cp /path/to/this/repo/deploy/migrate.sh .
   ```

3. **Fill in `.env`** — the two keys that matter are `OPENAI_API_KEY` (your OpenRouter key)
   and `INTELLIGENCE_API_KEY`. Generate the encryption key with `openssl rand -base64 32`.

4. **Run it**
   ```bash
   bash /path/to/this/repo/deploy/docker-run.example.sh my-bots 3001
   ```

5. **Open it** at <http://localhost:3001>, and put it on your domain with the tunnel and login
   gate in `deploy/` when you are ready.

Full details, including the vault pages, the graph and the Help page, are in
[`docs/how-it-works.md`](docs/how-it-works.md).

## Licence

MIT. This platform is built on OpenBot, also MIT — see [`LICENSE`](LICENSE) for the full text
and the attribution.
