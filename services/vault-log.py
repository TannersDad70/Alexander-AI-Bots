#!/usr/bin/env python3
"""Write a deployment's bot activity and conversations into its Obsidian vault.

Actions come from the deployment's audit trail — every permitted, refused and
failed action, with the bot, the action, and the page or file it touched.

Conversations are the full transcripts of every channel. They live in
CopilotKit Intelligence, not in the local database, so they are read back
through the deployment's own container, which holds the Intelligence client.
One note per channel is written under Conversations/ and linked from
Conversations.md, so the graph draws them.

Run with --config <path to deployment.json>. Without it, the built-in list of
the original four deployments is logged (backward compatible).
"""
import argparse
import json
import os
import re
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
  SELECT c.id            AS channel_id,
         c.name          AS name,
         c.summary       AS summary,
         m.thread_id     AS thread_id,
         m.user_id       AS user_id,
         to_char(c.last_message_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS at,
         c.last_message  AS message
  FROM channels c
  LEFT JOIN intelligence_channel_mappings m ON m.channel_id = c.id
  WHERE c.deleted_at IS NULL
  ORDER BY c.last_message_at DESC NULLS LAST
) x;
"""

THREAD_JS = r"""
import { CopilotKitIntelligence } from "@copilotkit/runtime/v2";
const client = new CopilotKitIntelligence({
  apiUrl: process.env.INTELLIGENCE_API_URL,
  wsUrl: process.env.INTELLIGENCE_GATEWAY_WS_URL,
  apiKey: process.env.INTELLIGENCE_API_KEY,
});
let messages = [];
try {
  const data = await client.getThreadMessages({
    threadId: process.env.OB_THREAD,
    userId: process.env.OB_USER,
  });
  messages = Array.isArray(data) ? data : (data && data.messages) || [];
} catch (error) {
  process.exitCode = 3;
}
process.stdout.write(JSON.stringify(messages));
"""

STATE_FILE = ".vault-log-state.json"


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


def thread_messages(container: str, thread_id: str, user_id: str):
    """Read one channel's full transcript through the deployment's container."""
    proc = subprocess.run(
        ["docker", "exec", "-i",
         "-e", f"OB_THREAD={thread_id}",
         "-e", f"OB_USER={user_id or 'dev-local-user'}",
         container, "sh", "-c", "cd /app/server && node --input-type=module"],
        input=THREAD_JS, capture_output=True, text=True, timeout=180,
    )
    if not proc.stdout.strip():
        detail = proc.stderr.strip().splitlines()[-1] if proc.stderr.strip() else "no output"
        raise RuntimeError(detail)
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError:
        return []


def text_of(content) -> str:
    """AG-UI content is a string or a list of parts; keep the text parts."""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, dict) and isinstance(part.get("text"), str):
                parts.append(part["text"])
            elif isinstance(part, str):
                parts.append(part)
        return "\n".join(parts).strip()
    return ""


def transcript(messages, bot_name: str) -> str:
    """The conversation only: what was said, and which tools were used."""
    lines = []
    for message in messages:
        role = message.get("role")
        if role == "user":
            text = text_of(message.get("content"))
            if text:
                lines.append(f"**You:** {text}")
        elif role == "assistant":
            text = text_of(message.get("content"))
            calls = message.get("toolCalls") or []
            names = sorted({
                call.get("name") for call in calls
                if isinstance(call, dict) and call.get("name")
            })
            if text:
                lines.append(f"**{bot_name}:** {text}")
            if names:
                lines.append("_used: " + ", ".join(names) + "_")
    return "\n\n".join(lines).strip()


def safe_name(label: str) -> str:
    label = re.sub(r'[\\/:*?"<>|#^\[\]]', "-", label)
    label = re.sub(r"\s+", " ", label).strip().strip(".")
    return label[:120] or "Channel"


def load_state(vault: str) -> dict:
    try:
        with open(os.path.join(vault, STATE_FILE), encoding="utf-8") as fh:
            state = json.load(fh)
        state.setdefault("channels", {})
        state.setdefault("notes", {})
        return state
    except (OSError, json.JSONDecodeError):
        return {"channels": {}, "notes": {}}


def save_state(vault: str, state: dict) -> None:
    with open(os.path.join(vault, STATE_FILE), "w", encoding="utf-8") as fh:
        json.dump(state, fh, indent=1)


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
            bits = [b for b in (action, target) if b]
            lines.append(f"- `{when}` **{bot}** — {' · '.join(bits)}")
    with open(f"{vault}/Activity Log.md", "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    return len(rows)


def write_conversations(vault: str, title: str, channels, container: str):
    state = load_state(vault)
    notes_dir = os.path.join(vault, "Conversations")
    os.makedirs(notes_dir, exist_ok=True)
    fetched = 0
    used_names = set()

    index = [
        f"# {title} — Conversations",
        "",
        "_Full transcripts, one note per channel, under `Conversations/`._",
        "_Rewritten automatically._",
        "",
        f"_Updated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}_",
        "",
    ]
    if not channels:
        index.append("No channel activity yet.")

    for ch in channels:
        cid = ch.get("channel_id") or ""
        name = (ch.get("name") or "Channel").strip()
        summary = (ch.get("summary") or "").strip()
        at = ch.get("at") or "never"

        label = safe_name(f"{name} — {summary}" if summary else name)
        filename = label + ".md"
        taken = {v for k, v in state["notes"].items() if k != cid} | used_names
        if filename in taken:
            label = safe_name(f"{name} ({cid[-8:]})" + (f" — {summary}" if summary else ""))
            filename = label + ".md"
        used_names.add(filename)
        note_path = os.path.join(notes_dir, filename)

        if ch.get("thread_id") and (state["channels"].get(cid) != at or not os.path.exists(note_path)):
            try:
                messages = thread_messages(container, ch["thread_id"], ch.get("user_id"))
                body = transcript(messages, name)
                if body:
                    with open(note_path, "w", encoding="utf-8") as fh:
                        fh.write(f"# {label}\n\n_Channel: {name} · Updated {at}_\n\n{body}\n")
                    old = state["notes"].get(cid)
                    if old and old != filename:
                        try:
                            os.remove(os.path.join(notes_dir, old))
                        except OSError:
                            pass
                    state["notes"][cid] = filename
                else:
                    old = state["notes"].pop(cid, None)
                    if old:
                        try:
                            os.remove(os.path.join(notes_dir, old))
                        except OSError:
                            pass
                state["channels"][cid] = at
                fetched += 1
            except Exception as error:  # noqa: BLE001 - log and carry on
                print(f"{container}: {name}: transcript failed: {error}")

        latest = (ch.get("message") or "").strip().replace("\n", " ")
        preview = (latest[:160] + "…") if len(latest) > 160 else latest
        index.append(f"## {name}" + (f" — {summary}" if summary else ""))
        index.append(f"_{at}_")
        index.append("")
        if os.path.exists(note_path):
            index.append(f"[[{label}]]" + (f" · latest: {preview}" if preview else ""))
        else:
            index.append("_No messages yet._")
        index.append("")

    with open(f"{vault}/Conversations.md", "w", encoding="utf-8") as fh:
        fh.write("\n".join(index) + "\n")
    save_state(vault, state)
    return len(channels), fetched


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", help="path to this deployment's deployment.json")
    args = parser.parse_args()

    if args.config:
        with open(args.config, encoding="utf-8") as fh:
            cfg = json.load(fh)
        deployments = [(cfg["container"], cfg["title"], cfg["vault"])]
    else:
        deployments = INSTANCES

    for container, title, vault in deployments:
        os.makedirs(vault, exist_ok=True)
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
        n_channels, n_fetched = write_conversations(vault, title, channels, container)
        print(f"{container}: {n_actions} actions, {n_channels} channels "
              f"({n_fetched} transcripts) -> {vault}")


if __name__ == "__main__":
    main()
