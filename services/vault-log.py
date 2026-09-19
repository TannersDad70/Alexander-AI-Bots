#!/usr/bin/env python3
"""Write each deployment's bot activity into its Obsidian vault.

Actions come from the deployment's audit trail (every permitted, refused and
failed action, with the bot, the action, and the page or file it touched).
Communications show each channel's latest message.

Full message transcripts live in CopilotKit Intelligence, not in the local
database, so what is written here is every action plus each channel's most
recent message.
"""
import json
import subprocess
from datetime import datetime, timezone

INSTANCES = [
    ("openbot", "Alexander AI Bot", "/home/aais/Documents/AlexanderVault"),
    ("openbot-randy", "Randy AI Bot", "/home/aais/Documents/RandyVault"),
    ("openbot-state", "State Electric", "/home/aais/Documents/StateVault"),
    ("openbot-davis", "Davis Carpet", "/home/aais/Documents/DavisVault"),
]

AUDIT_SQL = """
SELECT json_agg(x)::text FROM (
  SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS at,
         event_type,
         payload->>'bot'      AS bot,
         payload->>'action'   AS action,
         payload->>'page'     AS page,
         payload->>'file'     AS file,
         payload->>'command'  AS command,
         payload->>'decision' AS decision
  FROM audit_events
  ORDER BY created_at DESC
  LIMIT 400
) x;
"""

CHANNELS_SQL = """
SELECT json_agg(x)::text FROM (
  SELECT name,
         to_char(last_message_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS at,
         last_message AS message
  FROM channels
  ORDER BY last_message_at DESC NULLS LAST
) x;
"""


def psql(container: str, sql: str):
    """Run a query inside a container and return the JSON it produced."""
    password = subprocess.run(
        ["docker", "exec", container, "cat", "/var/lib/postgresql/pgpassword"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    result = subprocess.run(
        ["docker", "exec", "-e", f"PGPASSWORD={password}", container,
         "psql", "-h", "127.0.0.1", "-U", "openbot", "-d", "openbot", "-tAc", sql],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    if not result or result == "null":
        return []
    try:
        return json.loads(result)
    except json.JSONDecodeError:
        return []


def write_actions(vault: str, title: str, rows) -> int:
    lines = [
        f"# {title} — Activity Log",
        "",
        "_Every action the bots take, straight from the deployment's audit trail._",
        "_Rewritten automatically; newest first._",
        "",
    ]
    if not rows:
        lines.append("No actions recorded yet.")
    else:
        for r in rows:
            when = r.get("at") or ""
            bot = r.get("bot") or r.get("event_type") or "deployment"
            action = r.get("action") or r.get("event_type") or ""
            target = r.get("page") or r.get("file") or r.get("command") or ""
            decision = r.get("decision") or ""
            bits = [b for b in (action, target, decision) if b]
            lines.append(f"- `{when}` **{bot}** — {' · '.join(bits)}")
    with open(f"{vault}/Activity Log.md", "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    return len(rows)


def write_messages(vault: str, title: str, rows) -> int:
    lines = [
        f"# {title} — Conversations",
        "",
        "_Each channel's most recent message. Full transcripts live in the app's channels._",
        "_Rewritten automatically._",
        "",
        f"_Updated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}_",
        "",
    ]
    if not rows:
        lines.append("No channel activity yet.")
    for r in rows:
        name = r.get("name") or "Channel"
        when = r.get("at") or "never"
        message = (r.get("message") or "").strip()
        lines.append(f"## {name}")
        lines.append(f"_{when}_")
        lines.append("")
        lines.append(message if message else "_No messages yet._")
        lines.append("")
    with open(f"{vault}/Conversations.md", "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    return len(rows)


def main() -> None:
    for container, title, vault in INSTANCES:
        try:
            actions = psql(container, AUDIT_SQL)
        except Exception as error:  # noqa: BLE001 - log and carry on
            print(f"{container}: actions failed: {error}")
            actions = []
        try:
            channels = psql(container, CHANNELS_SQL)
        except Exception as error:  # noqa: BLE001 - log and carry on
            print(f"{container}: channels failed: {error}")
            channels = []
        n_actions = write_actions(vault, title, actions)
        n_channels = write_messages(vault, title, channels)
        print(f"{container}: {n_actions} actions, {n_channels} channels -> {vault}")


if __name__ == "__main__":
    main()
