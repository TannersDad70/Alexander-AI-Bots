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

A deployment.json may carry a "redactions" list: those strings are removed from
the notes as they are written, so a redacted address or name never reaches the
vault even if it appears again in a transcript.

Conversations also get topic notes: when a transcript is (re)written, the
deployment's own model lists the distinct topics, and each becomes a note under
Topics/ linked to the conversation, the Activity Log and the other topics, so
the graph shows what a conversation was about.
"""
import argparse
import json
import os
import re
import subprocess
import urllib.request
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


def redact(text: str, redactions) -> str:
    """Remove configured strings (for example a private address) from a note."""
    for needle in redactions:
        if needle:
            text = text.replace(needle, "[redacted]")
    return text


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
        state.setdefault("topics", {})
        state.setdefault("labels", {})
        return state
    except (OSError, json.JSONDecodeError):
        return {"channels": {}, "notes": {}, "topics": {}, "labels": {}}


def save_state(vault: str, state: dict) -> None:
    with open(os.path.join(vault, STATE_FILE), "w", encoding="utf-8") as fh:
        json.dump(state, fh, indent=1)


# ---- topics -----------------------------------------------------------------
#
# One note per topic under Topics/, written from the same transcript, with
# wikilinks back to the conversation note and to each other, so the graph
# shows what a conversation was actually about. The topics come from the
# deployment's own model, through the deployment's own key.

TOPIC_PROMPT = """You maintain an Obsidian vault for an AI bot deployment. Read the conversation below and list the distinct topics it covers.

Rules:
- One topic per separate subject the person asked about or the bot worked on.
- Return 1 to 6 topics; keep closely related work in one topic.
- "title": 3 to 8 words naming the concrete subject (sites, brands, files, tasks). Plain text, no markdown, no trailing period.
- "summary": 2 to 4 sentences of plain Markdown saying what was asked and what was found or done.
- "related": titles from this same list that the topic connects to (empty list if none).
- Reuse an existing title when the topic continues; never rename the same subject.
- Reply with JSON only, exactly this shape:
{{"topics": [{{"title": "...", "summary": "...", "related": ["..."]}}]}}

Existing topic titles: {previous}

Conversation ({label}):
{body}
"""


def read_env(path: str) -> dict:
    """The deployment's own .env, as a dict. Nothing is printed or kept."""
    env = {}
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                env[key.strip()] = value.strip()
    except OSError:
        pass
    return env


def call_model(prompt: str, env: dict, timeout: int = 120) -> str:
    key = env.get("OPENAI_API_KEY", "")
    if not key:
        raise RuntimeError("no OPENAI_API_KEY in the deployment's .env")
    base = (env.get("OPENAI_BASE_URL") or "https://openrouter.ai/api/v1").rstrip("/")
    model = env.get("BOT_MODEL") or "openrouter/free"
    payload = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
        "max_tokens": 2000,
        # Reasoning models otherwise spend the whole budget thinking and
        # answer with nothing; the topic list does not need the thoughts.
        "reasoning": {"enabled": False},
    }).encode()
    request = urllib.request.Request(
        f"{base}/chat/completions",
        data=payload,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        data = json.loads(response.read().decode())
    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError("model returned no choices")
    return (choices[0].get("message") or {}).get("content") or ""


def extract_topics(body: str, label: str, env: dict, previous=(), attempts: int = 3):
    """Ask the deployment's model for the conversation's distinct topics.

    The free model behind openrouter/free is a router: an occasional call
    answers without JSON, so a miss is retried before giving up.
    """
    prompt = TOPIC_PROMPT.format(
        previous=", ".join(previous) if previous else "(none yet)",
        label=label,
        body=body[:14000],
    )
    last_error = None
    for _ in range(attempts):
        try:
            text = call_model(prompt, env)
            start = text.find("{")
            if start < 0:
                raise RuntimeError("no JSON in the model's reply")
            data, _ = json.JSONDecoder().raw_decode(text[start:])
            topics = []
            for topic in data.get("topics", []):
                title = str(topic.get("title", "")).strip().rstrip(".")
                summary = str(topic.get("summary", "")).strip()
                if not title or not summary:
                    continue
                related = [str(r).strip() for r in topic.get("related", []) if str(r).strip()]
                topics.append({"title": title[:80], "summary": summary, "related": related})
            if topics:
                return topics[:6]
            last_error = RuntimeError("model listed no topics")
        except Exception as error:  # noqa: BLE001 - retry the free router
            last_error = error
    if last_error:
        raise last_error
    return []


def write_topics(vault: str, cid: str, conversation_label: str, updated: str,
                 topics, state: dict, redactions=()) -> list:
    """Write one note per topic; link the conversation, the log and each other."""
    topics_dir = os.path.join(vault, "Topics")
    os.makedirs(topics_dir, exist_ok=True)

    claimed = set()
    for other, files in state.get("topics", {}).items():
        if other != cid:
            claimed.update(files)

    names = {}
    for i, topic in enumerate(topics):
        filename = safe_name(topic["title"]) + ".md"
        if filename in claimed or filename in set(names.values()):
            filename = safe_name(f"{topic['title']} ({conversation_label})") + ".md"
        names[i] = filename

    written = []
    for i, topic in enumerate(topics):
        lines = [
            f"# {topic['title']}",
            "",
            f"_From [[{conversation_label}]] · updated {updated}_",
            "",
            topic["summary"],
            "",
            "## Related",
        ]
        for other_i, other in enumerate(topics):
            if other_i == i:
                continue
            if (other["title"] in topic.get("related", [])
                    or topic["title"] in other.get("related", [])):
                lines.append(f"- [[{names[other_i][:-3]}]]")
        lines.append(f"- [[{conversation_label}]]")
        lines.append("- [[Activity Log]]")
        lines.append("")
        with open(os.path.join(topics_dir, names[i]), "w", encoding="utf-8") as fh:
            fh.write(redact("\n".join(lines), redactions))
        written.append(names[i])

    for stale in set(state.get("topics", {}).get(cid, [])) - set(written):
        try:
            os.remove(os.path.join(topics_dir, stale))
        except OSError:
            pass
    state.setdefault("topics", {})[cid] = written
    state.setdefault("labels", {})[cid] = conversation_label
    return written


def write_topics_index(vault: str, state: dict) -> None:
    lines = [
        "# Topics",
        "",
        "_One note per topic, under `Topics/`, mined from the conversations._",
        "_Rewritten automatically._",
        "",
    ]
    found = False
    for cid, files in state.get("topics", {}).items():
        if not files:
            continue
        found = True
        lines.append(f"## {state.get('labels', {}).get(cid, cid)}")
        lines.extend(f"- [[{filename[:-3]}]]" for filename in files)
        lines.append("")
    if not found:
        lines.append("No topics yet.")
    with open(os.path.join(vault, "Topics.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


def write_actions(vault: str, title: str, rows, redactions=()) -> int:
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
        fh.write(redact("\n".join(lines) + "\n", redactions))
    return len(rows)


def write_conversations(vault: str, title: str, channels, container: str,
                        redactions=(), env=None):
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

        # Fetch when the channel moved on, or when a note we wrote has gone
        # missing. A channel whose transcript is genuinely empty is left alone
        # instead of being fetched again on every pass.
        known_note = state["notes"].get(cid)
        if ch.get("thread_id") and (state["channels"].get(cid) != at
                                    or (known_note and not os.path.exists(note_path))):
            try:
                messages = thread_messages(container, ch["thread_id"], ch.get("user_id"))
                body = redact(transcript(messages, name), redactions)
                if body:
                    topic_files = []
                    if env is not None:
                        try:
                            previous = [f[:-3] for f in state.get("topics", {}).get(cid, [])]
                            topics = extract_topics(body, label, env, previous)
                            if topics:
                                topic_files = write_topics(vault, cid, label, at, topics,
                                                           state, redactions)
                        except Exception as error:  # noqa: BLE001 - topics are best effort
                            print(f"{container}: {name}: topics failed: {error}")
                    topic_lines = ""
                    if topic_files:
                        topic_lines = "\n## Topics\n" + "\n".join(
                            f"- [[{t[:-3]}]]" for t in topic_files) + "\n"
                    with open(note_path, "w", encoding="utf-8") as fh:
                        fh.write(f"# {label}\n\n_Channel: {name} · Updated {at}_\n\n"
                                 f"{body}\n{topic_lines}")
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

        latest = redact((ch.get("message") or "").strip().replace("\n", " "), redactions)
        preview = (latest[:160] + "…") if len(latest) > 160 else latest
        index.append(f"## {name}" + (f" — {summary}" if summary else ""))
        index.append(f"_{at}_")
        index.append("")
        if os.path.exists(note_path):
            index.append(f"[[{label}]]" + (f" · latest: {preview}" if preview else ""))
        else:
            index.append("_No messages yet._")
        index.append("")

    write_topics_index(vault, state)
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
        redactions = [r for r in cfg.get("redactions", []) if isinstance(r, str) and r]
        env = read_env(cfg.get("env", "")) if cfg.get("env") else {}
        if not env.get("OPENAI_API_KEY"):
            env = None
    else:
        deployments = INSTANCES
        redactions = []
        env = None

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
        n_actions = write_actions(vault, title, actions, redactions)
        n_channels, n_fetched = write_conversations(vault, title, channels, container,
                                                    redactions, env)
        print(f"{container}: {n_actions} actions, {n_channels} channels "
              f"({n_fetched} transcripts) -> {vault}")


if __name__ == "__main__":
    main()
