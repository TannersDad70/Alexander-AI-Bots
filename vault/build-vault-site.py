#!/usr/bin/env python3
"""Render the OpenBot Obsidian vaults as small static sites, plus a graph.

For each vault this writes:
  index.html  - notes rendered with an explanation of what the vault is
  graph.json  - nodes and links mined from the notes
  graph.html  - an interactive Obsidian-style graph (drag, zoom, click to open)
"""
import html
import json
import os
import re

import markdown

VAULTS = [
    ("alexander", "Alexander AI Bot", "Alexander AI Bot Vault", "/home/aais/Documents/AlexanderVault",
     "https://alexander-bot.jays-web.org/"),
    ("randy", "Randy AI Bot", "Randy AI Bot Vault", "/home/aais/Documents/RandyVault",
     "https://randy-assistant.jays-web.org/"),
    ("state", "State Electric", "State Electric Vault", "/home/aais/Documents/StateVault",
     "https://state-e-john.jays-web.org/"),
    ("davis", "Davis Carpet", "Davis Carpet Vault", "/home/aais/Documents/DavisVault",
     "https://davis-assistant.jays-web.org/"),
]
OUT_ROOT = "/home/aais/var/vault-site"
GRAPH_TEMPLATE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vault-graph.tpl")

PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
  :root {{ color-scheme: dark; }}
  body {{
    margin: 0; background: #041027; color: #eaf2ff;
    font: 17px/1.65 system-ui, -apple-system, "Segoe UI", sans-serif;
  }}
  main {{ max-width: 900px; margin: 0 auto; padding: 32px 22px 80px; }}
  h1 {{ font-size: 28px; margin: 0 0 6px; }}
  .sub {{ color: #9fb6d9; margin-bottom: 22px; }}
  .back {{
    display: inline-block; margin-bottom: 18px; padding: 9px 16px;
    border: 1px solid #2b5390; border-radius: 10px; background: #0b1f42cc;
    color: #cfe6ff; text-decoration: none; font-weight: 600; font-size: 15px;
  }}
  .back:hover {{ background: #12305e; border-color: #3f74c4; }}
  .explain {{
    border: 1px solid #1d3a6b; border-radius: 14px; padding: 16px 20px;
    background: #081831cc; margin-bottom: 22px;
  }}
  .explain h2 {{ margin: 0 0 8px; font-size: 19px; color: #ffd479; }}
  .explain p {{ margin: 8px 0; color: #dfeaff; }}
  .list {{ border: 1px solid #1d3a6b; border-radius: 14px; padding: 14px 18px; background: #081831cc; }}
  .list h2 {{ font-size: 15px; text-transform: uppercase; letter-spacing: .08em; color: #9fb6d9; margin: 4px 0 10px; }}
  .list a {{ color: #7fd1ff; text-decoration: none; }}
  .list a:hover {{ text-decoration: underline; }}
  .list li {{ margin: 4px 0; }}
  .note {{
    margin-top: 26px; border: 1px solid #1d3a6b; border-radius: 14px;
    padding: 18px 22px; background: #081831cc;
  }}
  .note h2 {{ margin-top: 0; font-size: 22px; color: #ffd479; }}
  .note img {{ max-width: 100%; }}
  .note code {{ background: #0e2143; padding: 1px 5px; border-radius: 5px; }}
  .note pre {{ background: #0e2143; padding: 12px; border-radius: 10px; overflow: auto; }}
  .note a {{ color: #7fd1ff; }}
  .empty {{ color: #9fb6d9; }}
  /* phones: never let a long line or a wide block push the page sideways */
  .note p, .note li, .note h2, .note td, .note th {{ overflow-wrap: break-word; word-break: normal; }}
  .note pre {{ max-width: 100%; overflow-x: auto; }}
  .note table {{ display: block; max-width: 100%; overflow-x: auto; }}
  .note img {{ max-width: 100%; height: auto; }}
  .list li {{ overflow-wrap: break-word; }}
  footer {{ margin-top: 40px; color: #6f87ab; font-size: 13px; }}
  @media (max-width: 760px) {{
    .hero {{ padding: 30px 16px 24px; }}
    h1 {{ font-size: 26px; }}
    main {{ padding: 4px 16px 70px; }}
    h2 {{ font-size: 21px; margin-top: 30px; }}
    body {{ font-size: 16px; }}
    .step {{ padding-left: 34px; }}
    form {{ flex-direction: column; }}
    input[type=text] {{ flex: 1 1 auto; width: 100%; }}
    button {{ width: 100%; }}
  }}

</style>
</head>
<body>
<main>
  <a class="back" href="{back_url}">&#8592; Back to {app_name}</a>
  <h1>{title}</h1>
  <div class="sub">Markdown notes shared with the bot. Updated automatically.</div>

  <div class="explain">
    <h2>What this vault is</h2>
    <p>
      This is your bot's <b>permanent storage</b> &mdash; the long-term memory where everything it
      works with is kept: notes it writes, files it creates, research it gathers, and the records
      of what it has done. Nothing here is temporary: it lives on your own machine and survives
      restarts, updates and new conversations.
    </p>
    <p>
      The bot reads this vault before answering anything about your past work, and it writes new
      notes here as it learns. Because the notes are plain Markdown files, you can open the same
      folder in Obsidian on your computer and read, edit or add to everything the bot keeps.
    </p>
    <p>
      Two records are written for you automatically: <b>Activity Log</b> (every action taken, with
      the decision behind it) and <b>Conversations</b> (every channel's full transcript).
    </p>
  </div>

  <div class="list">
    <h2>Notes ({count})</h2>
    {toc}
  </div>
  {notes}
  <footer>Files in the vault folder appear here within a couple of minutes.</footer>
</main>
</body>
</html>
"""

LINK_WIKI = re.compile(r"!?\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]")
LINK_MD = re.compile(r"\[[^\]]*\]\(([^)#\s]+\.md)(?:#[^)]*)?\)")

PALETTE = ["#7fd1ff", "#ffd479", "#8ef0b8", "#c9a7ff", "#ff9fb0", "#7fe3d0", "#f2a86b", "#9fc0ff"]


def collect(vault: str):
    notes = []
    for root, dirs, files in os.walk(vault):
        dirs[:] = sorted(d for d in dirs if not d.startswith("."))
        for name in sorted(files):
            if name.lower().endswith(".md"):
                full = os.path.join(root, name)
                rel = os.path.relpath(full, vault)
                if rel == "README.md":
                    continue
                notes.append((rel, full))
    notes.sort()
    return notes


def slug(rel: str) -> str:
    return "note-" + "".join(ch if ch.isalnum() else "-" for ch in rel.lower())


def color_for(rel: str, by_id: dict) -> str:
    if rel == "Activity Log.md":
        return "#ff9f68"
    if rel == "Conversations.md":
        return "#7fd1ff"
    folder = os.path.dirname(rel)
    if not folder:
        return "#9fc0ff"
    idx = sum(ord(c) for c in folder) % len(PALETTE)
    return PALETTE[idx]


def build_graph(vault: str, notes) -> dict:
    by_name = {}
    for rel, _ in notes:
        base = os.path.basename(rel)[:-3]
        by_name.setdefault(base.lower(), rel)
    by_rel = {rel.lower(): rel for rel, _ in notes}
    full_by_rel = {rel.lower(): full for rel, full in notes}

    nodes = []
    for rel, full in notes:
        try:
            text = open(full, encoding="utf-8", errors="replace").read()
        except OSError:
            text = ""
        links = set()
        # 1. explicit Obsidian wikilinks and markdown links
        for m in LINK_WIKI.finditer(text):
            target = by_name.get(m.group(1).strip().lower())
            if target and target != rel:
                links.add(target)
        for m in LINK_MD.finditer(text):
            raw = m.group(1).strip()
            target = by_rel.get(raw.lower())
            if target and target != rel:
                links.add(target)
        # 2. mentions: a note that names another note is connected to it.
        #    The Activity Log names the files the bots worked on, so this is
        #    what draws the real relationships between notes.
        low = text.lower()
        for base_low, target in by_name.items():
            if target == rel or len(base_low) < 4:
                continue
            if base_low in low:
                links.add(target)
        nodes.append({
            "id": rel,
            "label": os.path.basename(rel)[:-3],
            "color": color_for(rel, by_name),
            "anchor": "#" + slug(rel),
            "_links": sorted(links),
        })

    # Channels named in the Conversations log become their own dots, each
    # connected to that log - they are real channels the bot holds.
    conversations = next((n for n in nodes if n["id"] == "Conversations.md"), None)
    if conversations:
        try:
            path = full_by_rel.get("conversations.md", "")
            text = open(path, encoding="utf-8", errors="replace").read() if path else ""
        except OSError:
            text = ""
        for m in re.finditer(r"^##\s+(.+?)\s*$", text, re.M):
            name = m.group(1).strip()
            if not name or name.lower() == "conversations":
                continue
            node_id = "channel:" + name
            if any(n["id"] == node_id for n in nodes):
                continue
            nodes.append({
                "id": node_id,
                "label": name,
                "color": "#7fe3d0",
                "anchor": conversations["anchor"],
                "_links": [],
            })
            conversations["_links"].append(node_id)

    links = []
    for n in nodes:
        for target in n.get("_links", []):
            links.append({"source": n["id"], "target": target})
        n.pop("_links", None)
    return {"nodes": nodes, "links": links}


def build(slug_name: str, app_name: str, title: str, vault: str, app_url: str,
          out_dir: str | None = None) -> None:
    out_dir = out_dir or os.path.join(OUT_ROOT, slug_name)
    os.makedirs(out_dir, exist_ok=True)
    notes = collect(vault)

    toc_items, bodies = [], []
    for rel, full in notes:
        try:
            with open(full, encoding="utf-8", errors="replace") as fh:
                text = fh.read()
        except OSError:
            continue
        anchor = slug(rel)
        toc_items.append(f'<li><a href="#{anchor}">{html.escape(rel)}</a></li>')
        rendered = markdown.markdown(
            text, extensions=["extra", "sane_lists", "tables", "fenced_code"]
        )
        bodies.append(
            f'<section class="note" id="{anchor}"><h2>{html.escape(rel)}</h2>{rendered}</section>'
        )

    toc = "<ul>" + "".join(toc_items) + "</ul>" if toc_items else '<p class="empty">No notes yet.</p>'
    page = PAGE.format(
        title=html.escape(title),
        app_name=html.escape(app_name),
        back_url=app_url,
        count=len(notes),
        toc=toc,
        notes="".join(bodies) or '<p class="empty">The bot has not written any notes yet.</p>',
    )
    with open(os.path.join(out_dir, "index.html"), "w", encoding="utf-8") as fh:
        fh.write(page)

    graph = build_graph(vault, notes)
    with open(os.path.join(out_dir, "graph.json"), "w", encoding="utf-8") as fh:
        json.dump(graph, fh)

    try:
        with open(GRAPH_TEMPLATE, encoding="utf-8") as fh:
            tpl = fh.read()
    except OSError:
        return
    graph_page = (tpl
                  .replace("__TITLE__", html.escape(title))
                  .replace("__NAME__", html.escape(app_name))
                  .replace("__APP_URL__", app_url)
                  .replace("__VAULT_URL__", "./")
                  .replace("__GRAPH_JSON__", json.dumps(graph)))
    with open(os.path.join(out_dir, "graph.html"), "w", encoding="utf-8") as fh:
        fh.write(graph_page)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--config", help="path to this deployment's deployment.json")
    args = parser.parse_args()

    if args.config:
        with open(args.config, encoding="utf-8") as fh:
            cfg = json.load(fh)
        if os.path.isdir(cfg["vault"]):
            build(cfg["slug"], cfg["app_name"], cfg["title"], cfg["vault"],
                  cfg["app_url"], cfg["vault_site"])
        print(f"{cfg['slug']}: vault site + graph rebuilt")
    else:
        os.makedirs(OUT_ROOT, exist_ok=True)
        for slug_name, app_name, title, vault, app_url in VAULTS:
            if os.path.isdir(vault):
                build(slug_name, app_name, title, vault, app_url)
        print("vault site + graph rebuilt")
