#!/usr/bin/env python3
"""Generate the Help pages for each bot app.

Each page explains how the app works, its features, the Obsidian vault and
memory, Skills, and how to set up OpenRouter - including a form that saves a
new OpenRouter API key into that app's own .env file.
"""
import html
import json
import os
import shutil

SITES = [
    {
        "slug": "alexander",
        "name": "Alexander AI Bot",
        "url": "https://alexander-bot.jays-web.org/",
        "env": "/home/aais/openbot/.env",
        "container": "openbot",
    },
    {
        "slug": "randy",
        "name": "Randy AI Bot",
        "url": "https://randy-assistant.jays-web.org/",
        "env": "/home/aais/openbot-randy/.env",
        "container": "openbot-randy",
    },
    {
        "slug": "davis",
        "name": "Davis Carpet",
        "url": "https://davis-assistant.jays-web.org/",
        "env": "/home/aais/openbot-davis/.env",
        "container": "openbot-davis",
    },
    {
        "slug": "state",
        "name": "State Electric",
        "url": "https://state-e-john.jays-web.org/",
        "env": "/home/aais/openbot-state/.env",
        "container": "openbot-state",
    },
]

PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{name} - Help</title>
<link rel="icon" type="image/png" href="/favicon.ico">
<style>
  :root {{ color-scheme: dark; }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0; background: #041027; color: #eaf2ff;
    font: 17px/1.7 system-ui, -apple-system, "Segoe UI", sans-serif;
  }}
  .hero {{
    background:
      linear-gradient(rgba(4, 14, 34, .55), rgba(4, 14, 34, .82)),
      url("/help/hero.png") center/cover no-repeat;
    padding: 46px 22px 38px;
    border-bottom: 1px solid #173464;
  }}
  .wrap {{ max-width: 900px; margin: 0 auto; }}
  .back {{
    display: inline-block; margin-bottom: 22px; padding: 10px 18px;
    border: 1px solid #2b5390; border-radius: 11px; background: #0b1f42cc;
    color: #cfe6ff; text-decoration: none; font-weight: 700; font-size: 15px;
  }}
  .back:hover {{ background: #12305e; border-color: #3f74c4; }}
  h1 {{ font-size: 34px; margin: 0 0 8px; text-shadow: 0 0 12px rgba(90,170,255,.45); }}
  .tag {{ color: #9fb6d9; font-size: 17px; }}
  main {{ max-width: 900px; margin: 0 auto; padding: 8px 22px 90px; }}
  h2 {{
    font-size: 24px; margin: 40px 0 10px; color: #ffd479;
    text-shadow: 0 0 10px rgba(255,150,40,.35);
  }}
  h3 {{ font-size: 19px; margin: 24px 0 6px; }}
  p, li {{ color: #e4edfb; }}
  ul {{ padding-left: 22px; }}
  li {{ margin: 7px 0; }}
  .card {{
    border: 1px solid #1d3a6b; border-radius: 15px; padding: 18px 22px;
    background: #081831cc; margin-top: 16px;
  }}
  code {{ background: #0e2143; padding: 2px 6px; border-radius: 6px; font-size: 15px; }}
  .step {{ margin: 14px 0; padding-left: 40px; position: relative; }}
  .step b.num {{
    position: absolute; left: 0; top: 1px; width: 27px; height: 27px;
    border-radius: 50%; background: rgb(40,150,255); color: #041027;
    display: flex; align-items: center; justify-content: center;
    font-size: 15px; font-weight: 800;
  }}
  form {{ margin-top: 18px; display: flex; flex-wrap: wrap; gap: 10px; }}
  input[type=text] {{
    flex: 1 1 380px; padding: 13px 15px; border-radius: 11px;
    border: 1px solid #2b5390; background: #081c3c; color: #eaf2ff; font-size: 16px;
  }}
  button {{
    padding: 13px 22px; border-radius: 11px; border: 0; cursor: pointer;
    background: rgb(40,150,255); color: #041027; font-weight: 800; font-size: 16px;
  }}
  button:hover {{ background: #59b0ff; }}
  #result {{ margin-top: 14px; font-weight: 600; min-height: 24px; }}
  .ok {{ color: #7fffb0; }}
  .bad {{ color: #ff9b9b; }}
  footer {{ margin-top: 50px; color: #6f87ab; font-size: 14px; }}
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
<div class="hero">
  <div class="wrap">
    <a class="back" href="{url}">&#8592; Back to {name}</a>
    <h1>{name} &mdash; Help</h1>
    <div class="tag">Everything this app can do, and how to set it up.</div>
  </div>
</div>
<main>

  <h2>What this is</h2>
  <p>
    {name} is a private workspace of AI coworkers. You talk to a bot the way you would
    message a person; the bot then does real work on a real computer &mdash; opening websites,
    clicking, typing, filling forms, reading pages and saving files. It is not just chat:
    the bot has hands.
  </p>
  <p>
    The benefits, plainly: work happens while you do something else; nothing has to be
    re-explained because each bot remembers; and anything the bot is allowed to touch is
    decided and recorded before it happens, so you can always see what was done and why.
  </p>

  <h2>The features</h2>
  <ul>
    <li><b>As many bots as you want.</b> Create one per job &mdash; a Gmail assistant, a
        WhatsApp assistant, an invoicing helper, a researcher. Each keeps its own
        conversations, files and logins.</li>
    <li><b>A virtual computer per bot.</b> Every bot gets a real browser on a real machine
        (its own screen, its own profile, its own files). It uses it like a person would.</li>
    <li><b>Take the wheel, then hand it back.</b> When a bot reaches something only you can
        do &mdash; a login, a code, a payment &mdash; take control of its screen, sign in yourself,
        and hand control back. The bot continues from exactly where you left it. Your
        passwords are typed into the site, never given to the bot.</li>
    <li><b>Channels.</b> Each bot has its own channel; conversations survive restarts, so
        you can pick up days later.</li>
    <li><b>A vault it can read and write.</b> Every bot has an Obsidian vault &mdash; plain
        Markdown notes shared between you and it (see below).</li>
    <li><b>Memory.</b> Each bot keeps its conversation history and its notes, so it answers
        about past work from what actually happened.</li>
    <li><b>Skills.</b> Saved instructions you invoke with <code>/</code> &mdash; your own
        playbooks for how the bot should do recurring work (see below).</li>
    <li><b>Governed actions and an audit trail.</b> Every action is decided before it happens
        and recorded after; every refusal names the rule that caused it.</li>
    <li><b>Your choice of model.</b> Powered through OpenRouter, so you can run any model
        you like and pay only for what you use (see below).</li>
    <li><b>Routines.</b> Ask a bot to do something on a schedule and it does, without being
        asked again.</li>
  </ul>

  <h2>The virtual computer: logging in yourself</h2>
  <p>
    A bot cannot ask a website for your password, and it should not. So when it needs a
    login, it asks you for help. A hand-over panel appears beside its screen: you take the
    wheel, type your login straight into the page (the bot never sees it), and release the
    wheel. The bot keeps that signed-in browser afterwards, so it only ever has to be done
    once per site.
  </p>

  <h2>The Obsidian vault and memory</h2>
  <p>
    Each bot has an Obsidian vault: a folder of plain Markdown notes that both you and the
    bot can read and write. Open it in Obsidian on your own computer and you will see the
    notes the bot writes appear as they are made. Anything you write there, the bot can read.
  </p>
  <p>
    Its memory works on two levels: the conversation in each channel is kept, so a bot
    remembers what you discussed; and the vault is its long-term notebook, where it records
    decisions, summaries and anything worth keeping. Two extra logs are written for you
    automatically: an <b>Activity Log</b> of every action taken, and a <b>Conversations</b>
    page with each channel's latest message.
  </p>

  <h2>Skills: your playbooks</h2>
  <p>
    A skill is a saved instruction &mdash; a short written procedure the bot follows when you
    invoke it by typing <code>/</code> in the composer. Skills are how you teach a bot
    <i>your</i> way of doing a recurring job ("how we quote a job", "how we reply to a
    supplier"), so it does not have to be re-explained each time.
  </p>
  <ul>
    <li>Create one by describing the job to the bot &mdash; it can write the skill down with
        you and save it when you press the button on the card.</li>
    <li>Then invoke it any time with <code>/</code> and pick it from the list.</li>
    <li>Skills hold no extra powers: the bot still may only do what it has been granted, and
        every action is still recorded.</li>
  </ul>

  <h2>OpenRouter: the model behind your bots</h2>
  <p>
    The bot's "thinking" comes from a model, and this app uses <b>OpenRouter</b> to reach
    one &mdash; a single account that can run almost any model. You pay OpenRouter for what
    you use, and nothing is marked up here.
  </p>

  <h3>Create an account and add credit</h3>
  <div class="step"><b class="num">1</b> Go to <b>openrouter.ai</b> and create an account
    (signing in with Google or GitHub is fine).</div>
  <div class="step"><b class="num">2</b> Open <b>Credits</b> in your account and add money.
    Even <b>$5</b> is plenty to start; you can top it up whenever you like.</div>
  <div class="step"><b class="num">3</b> Open <b>Keys</b> (openrouter.ai/keys) and press
    <b>Create Key</b>. Name it after this app, then copy the key &mdash; it starts with
    <code>sk-or-v1-</code> and is only shown once.</div>

  <h3>Put the key into this app</h3>
  <p>
    This key is what makes your bots think. Every time a bot answers you, reads a page it is
    working on, or decides what to do next, it asks a model for help &mdash; and that model is
    paid for through this key. Think of it as the fuel line between your bots and the
    intelligence they run on: without it they cannot reason or reply, and the bill for every
    thought lands on the OpenRouter account that made it.
  </p>
  <p>
    That is exactly why it deserves care. <b>A key can spend your balance.</b> Treat it the way
    you would a card number: paste it here, keep it out of chats, emails and screenshots, and
    if you ever think it has been seen, make a new one at openrouter.ai/keys and save it here
    (you can delete the old key there too).
  </p>
  <p>
    What you will notice once it is saved: bots answer, browse and work. If one goes quiet and
    stops replying, it is almost always the key or the balance &mdash; paste a fresh key below
    and they will start again. The app restarts itself, so the change takes effect within
    about half a minute.
  </p>
  <form id="keyform">
    <input type="text" id="key" name="key" placeholder="sk-or-v1-..." autocomplete="off" spellcheck="false">
    <button type="submit">Save key &amp; restart</button>
  </form>
  <div id="result"></div>

  <div class="card">
    <div><b>Your agents are running on:</b> <code id="model">checking&hellip;</code></div>
    <div style="margin-top:6px;color:#9fb6d9">OpenRouter key: <span id="keystate">checking&hellip;</span></div>
  </div>

  <h2>Giving your bots the live web (TinyFish)</h2>
  <p>
    Your bots can already drive their own browser. <b>TinyFish</b> adds a faster, cleaner way to
    reach the web: a <b>Search</b> API that returns fresh results and a <b>Fetch</b> API that turns
    any page into clean text &mdash; both <b>free</b> at any balance &mdash; plus a web agent and a
    stealth browser for the hard pages. It is a separate account from this app, and one key covers
    all of it.
  </p>

  <h3>Set it up (about five minutes)</h3>
  <div class="step"><b class="num">1</b> Create a free account at <b>agent.tinyfish.ai</b>. New
    accounts start with $8 of credit, and Search and Fetch never draw from it.</div>
  <div class="step"><b class="num">2</b> Copy your API key from the TinyFish dashboard.</div>
  <div class="step"><b class="num">3</b> Here in this app, open <b>Admin &rarr; Credentials</b> and
    add a credential: kind <code>mcp</code>, provider <code>tinyfish</code>, key id
    <code>tinyfish-api-key</code>, and paste the key as the secret. It is stored encrypted and is
    never shown again.</div>
  <div class="step"><b class="num">4</b> Open <b>Admin &rarr; Plugins</b> and add a custom server:
    id <code>tinyfish</code>, title <code>TinyFish</code>, URL
    <code>https://agent.tinyfish.ai/mcp</code> &mdash; and pick the credential you just made.</div>
  <div class="step"><b class="num">5</b> Grant its tools (<code>search</code>, <code>fetch</code>,
    and any others you want) to the bots that should have them.</div>

  <p>
    Nothing changes about how your bots are governed: a bot may only use the tools you granted,
    every call is decided before it happens, and every one is recorded in the Activity Log and the
    audit trail.
  </p>

  <h2>Good to know</h2>
  <ul>
    <li>If the bots stop answering, it is almost always the OpenRouter key or its credit
        balance &mdash; paste a fresh key above and they will start again.</li>
    <li>Give a bot access only to what its job needs; you can review and refuse anything in
        the audit trail.</li>
    <li>Anything a bot does is on the record. When in doubt, check its channel's log.</li>
  </ul>

  <footer>{name} &mdash; private, self-hosted, and yours.</footer>
</main>
<script>
  async function refreshInfo() {{
    const model = document.getElementById('model');
    const state = document.getElementById('keystate');
    try {{
      const r = await fetch('/info');
      const d = await r.json();
      if (r.ok) {{
        model.textContent = d.model || 'unknown';
        state.textContent = d.key || 'unknown';
      }} else {{
        model.textContent = 'unavailable';
        state.textContent = 'unavailable';
      }}
    }} catch (e) {{
      model.textContent = 'unavailable';
      state.textContent = 'unavailable';
    }}
  }}
  refreshInfo();

  const form = document.getElementById('keyform');
  const result = document.getElementById('result');
  form.addEventListener('submit', async (e) => {{
    e.preventDefault();
    const key = document.getElementById('key').value.trim();
    result.className = '';
    result.textContent = 'Saving...';
    try {{
      const r = await fetch('/save-key', {{
        method: 'POST',
        headers: {{ 'Content-Type': 'application/json' }},
        body: JSON.stringify({{ key }}),
      }});
      const data = await r.json().catch(() => ({{}}));
      if (r.ok && data.ok) {{
        result.className = 'ok';
        result.textContent = data.message || 'Saved. The app is restarting with the new key.';
        setTimeout(refreshInfo, 3000);
      }} else {{
        result.className = 'bad';
        result.textContent = data.error || ('Could not save the key (' + r.status + ').');
      }}
    }} catch (err) {{
      result.className = 'bad';
      result.textContent = 'Could not reach the server. Try again.';
    }}
  }});
</script>
</body>
</html>
"""


def write_site(out_dir: str, site: dict, hero: str | None = None) -> None:
    os.makedirs(out_dir, exist_ok=True)
    page = PAGE.format(
        name=html.escape(site["name"]),
        url=site["url"],
        env=html.escape(site["env"]),
    )
    with open(os.path.join(out_dir, "index.html"), "w", encoding="utf-8") as fh:
        fh.write(page)
    if hero and os.path.exists(hero):
        shutil.copy2(hero, os.path.join(out_dir, "hero.png"))
    print("wrote", os.path.join(out_dir, "index.html"))


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--config", help="path to this deployment's deployment.json")
    parser.add_argument("--out", help="output directory for the help site")
    parser.add_argument("--hero", help="hero image to copy beside the page")
    args = parser.parse_args()

    if args.config:
        with open(args.config, encoding="utf-8") as fh:
            cfg = json.load(fh)
        site = {
            "slug": cfg["slug"],
            "name": cfg["app_name"],
            "url": cfg["app_url"],
            "env": cfg["env"],
        }
        write_site(args.out or os.path.join("/home/aais/help-site", cfg["slug"]), site, args.hero)
        return

    root = "/home/aais/help-site"
    for site in SITES:
        write_site(os.path.join(root, site["slug"]), site)


if __name__ == "__main__":
    main()