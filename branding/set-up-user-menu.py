#!/usr/bin/env python3
"""Give every deployment's desktop the same signed-in menu and sidebar.

For each deployment:
  * the bundle's sidebar group is trimmed to just the signed-in user's row
  * the page shell gains the QR card and the popup links (vault, skills,
    agents, OpenRouter, help, get-the-app, update-the-app)
  * the asset version is bumped so browsers fetch the patched bundle

Superseded: the menu now lives in the deployment's live-only user-menu.css /
user-menu.js and publishing never overwrites it. Running this script would
inject the menu back into the page shell, so treat it as historical.
"""

import json
import pathlib
import re

DEPLOYMENTS = {
    "alexander": {"dir": "/home/aais/openbot", "host": "alexander-bot.jays-web.org"},
    "randy": {"dir": "/home/aais/openbot-randy", "host": "randy-assistant.jays-web.org"},
    "state": {"dir": "/home/aais/openbot-state", "host": "state-e-john.jays-web.org"},
    "davis": {"dir": "/home/aais/openbot-davis", "host": "davis-assistant.jays-web.org"},
}

# The QR codes are rendered offline with the vendored generator the app ships,
# so nothing is fetched at run time.
import subprocess
import tempfile

QR_LIB = "/home/aais/Projects/alexander-apps/web/vendor/qrcode.min.js"
GEN = """
globalThis.window = globalThis;
const fs = require("fs");
eval(fs.readFileSync(process.argv[2], "utf8"));
const out = {};
for (const [slug, url] of Object.entries(JSON.parse(process.argv[3]))) {
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  out[slug] = qr.createSvgTag({ cellSize: 5, margin: 0, scalable: true });
}
process.stdout.write(JSON.stringify(out));
"""
_hosts = {slug: "https://" + cfg["host"] + "/app/download/" for slug, cfg in DEPLOYMENTS.items()}
with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as fh:
    fh.write(GEN)
    gen_path = fh.name
QR = json.loads(subprocess.check_output(
    ["/home/aais/.local/share/mise/installs/node/26.7.0/bin/node", gen_path, QR_LIB, json.dumps(_hosts)]
).decode())

CSS = """
      /* ------------------------------------------------------------------
         The signed-in user's menu: the QR card it opens, and the links that
         used to sit in the sidebar. The card lives outside #root, so it
         carries its own colours instead of inheriting the app theme.
         ------------------------------------------------------------------ */
      dialog.ob-qr {
        position: fixed; inset: 0; margin: auto;
        width: min(430px, 92vw); max-height: 92vh; overflow: auto;
        border: 1px solid rgba(90, 160, 255, 0.55);
        border-radius: 18px;
        background: rgba(6, 16, 40, 0.97);
        color: #ffffff;
        padding: 26px 24px 22px;
        font-size: 17px;
        box-shadow: 0 0 44px rgba(60, 130, 255, 0.4);
      }
      dialog.ob-qr::backdrop { background: rgba(2, 8, 22, 0.72); }
      dialog.ob-qr h2 {
        margin: 0 0 8px; font-size: 23px; color: #ffffff;
        text-shadow: 0 0 7px rgba(255, 218, 120, 1), 0 0 18px rgba(255, 145, 0, 0.9),
                     0 0 36px rgba(255, 75, 0, 0.65);
      }
      dialog.ob-qr p { font-size: 15px; line-height: 1.5; color: rgba(255, 255, 255, 0.88); margin: 0 0 18px; }
      .ob-qr-box {
        width: 224px; height: 224px; margin: 0 auto 14px;
        background: #ffffff; border-radius: 12px; padding: 10px; box-sizing: border-box;
      }
      .ob-qr-box svg { width: 100%; height: 100%; display: block; }
      .ob-qr-url { font-size: 13px; word-break: break-all; text-align: center; color: rgba(255, 255, 255, 0.72); margin: 0 0 18px; }
      .ob-qr-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
      .ob-qr-btn {
        border: 0; border-radius: 10px; padding: 10px 16px;
        font: inherit; font-size: 16px; cursor: pointer; text-decoration: none;
      }
      .ob-qr-btn.primary { background: rgb(40, 150, 255); color: #ffffff; }
      .ob-qr-btn.ghost { background: transparent; border: 1px solid rgba(90, 160, 255, 0.55); color: #ffffff; }
      .ob-qr-close {
        position: absolute; top: 10px; right: 12px; background: transparent;
        border: 0; color: #ffffff; font-size: 19px; line-height: 1; cursor: pointer; padding: 6px;
      }
"""

SCRIPT = """
    <script>
      /* ------------------------------------------------------------------
         The signed-in user's menu (the popup on the email row):
           * the links that used to sit in the sidebar
           * Get the app  - the QR card for the download page
           * Update the app - drop the saved copy and reload the latest build
         The menu is rendered by the app, so the items are added when it opens.
         ------------------------------------------------------------------ */
      (function () {
        var QR_URL = location.origin + "/app/download/";
        var QR_SVG = '__QR_SVG__';

        function buildModal() {
          if (document.getElementById("ob-qr")) return;
          var dlg = document.createElement("dialog");
          dlg.id = "ob-qr";
          dlg.className = "ob-qr";
          dlg.setAttribute("aria-labelledby", "ob-qr-title");
          dlg.innerHTML =
            '<button class="ob-qr-close" type="button" aria-label="Close">&#x2715;</button>' +
            '<h2 id="ob-qr-title">Get the mobile app</h2>' +
            '<p>Scan the QR code with your phone camera, or copy the link to open the download page.</p>' +
            '<div class="ob-qr-box" role="img" aria-label="QR code for the download page">' + QR_SVG + '</div>' +
            '<p class="ob-qr-url">' + QR_URL + '</p>' +
            '<div class="ob-qr-actions">' +
              '<button class="ob-qr-btn primary" type="button" id="ob-qr-copy">Copy link</button>' +
              '<a class="ob-qr-btn ghost" href="' + QR_URL + '" target="_blank" rel="noopener">Open download page</a>' +
            '</div>';
          document.body.appendChild(dlg);
          dlg.querySelector(".ob-qr-close").addEventListener("click", function () { dlg.close(); });
          dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
          var copy = dlg.querySelector("#ob-qr-copy");
          copy.addEventListener("click", function () {
            var done = function () {
              copy.textContent = "Copied";
              setTimeout(function () { copy.textContent = "Copy link"; }, 1500);
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(QR_URL).then(done, done);
            } else {
              var t = document.createElement("textarea");
              t.value = QR_URL; t.style.position = "fixed"; t.style.opacity = "0";
              document.body.appendChild(t); t.select();
              try { document.execCommand("copy"); } catch (e) {}
              document.body.removeChild(t); done();
            }
          });
        }

        function openQR() {
          buildModal();
          var dlg = document.getElementById("ob-qr");
          if (!dlg) return;
          try {
            if (typeof dlg.showModal === "function") { if (!dlg.open) dlg.showModal(); }
            else dlg.setAttribute("open", "");
          } catch (e) { dlg.setAttribute("open", ""); }
        }

        function closeUserMenu() {
          var trigger = document.querySelector('#root .bg-sidebar [data-slot="dropdown-menu-trigger"]');
          if (trigger) trigger.click();
        }

        /* Drop the cached copy of this page and reload the newest build. */
        function updateApp() {
          var go = function () {
            location.replace(location.pathname + "?fresh=" + Date.now() + location.hash);
          };
          var jobs = [];
          try {
            if (window.caches && caches.keys) {
              jobs.push(caches.keys().then(function (keys) {
                return Promise.all(keys.map(function (k) { return caches.delete(k); }));
              }));
            }
          } catch (e) { /* no CacheStorage */ }
          try {
            if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
              jobs.push(navigator.serviceWorker.getRegistrations().then(function (regs) {
                return Promise.all(regs.map(function (r) { return r.unregister(); }));
              }));
            }
          } catch (e) { /* no service worker */ }
          Promise.all(jobs).then(go, go);
        }

        var USER_LINKS = [
          { label: "Obsidian Vault", href: "https://vault.jays-web.org/__SLUG__/" },
          { label: "Obsidian Graph", href: "https://vault.jays-web.org/__SLUG__/graph.html" },
          { label: "Skills", href: "/skills" },
          { label: "Agents", href: "/agents" },
          { label: "OpenRouter", href: "https://openrouter.ai/", blank: true },
          { label: "Help", href: "/help/" },
          { label: "Get the app", qr: true },
          { label: "Update the app", update: true }
        ];

        function extendUserMenu() {
          var content = document.querySelector('[data-slot="dropdown-menu-content"]');
          if (!content || content.getAttribute("data-ob-links")) return;
          var model = content.querySelector('a[data-slot="dropdown-menu-item"]');
          if (!model) return;
          content.setAttribute("data-ob-links", "1");
          var added = [];
          USER_LINKS.forEach(function (link) {
            var a = model.cloneNode(true);
            a.removeAttribute("id");
            a.textContent = "";
            var span = document.createElement("span");
            span.textContent = link.label;
            a.appendChild(span);
            if (link.qr) {
              a.setAttribute("href", "#");
              a.addEventListener("click", function (e) {
                e.preventDefault();
                openQR();
                closeUserMenu();
              });
            } else if (link.update) {
              a.setAttribute("href", "#");
              a.addEventListener("click", function (e) {
                e.preventDefault();
                updateApp();
              });
            } else {
              a.setAttribute("href", link.href);
              if (link.blank) {
                a.setAttribute("target", "_blank");
                a.setAttribute("rel", "noopener");
              }
            }
            added.push(a);
          });
          var sep = content.querySelector('[data-slot="dropdown-menu-separator"]');
          if (sep) {
            added.push(sep.cloneNode(true));
          } else {
            var divider = document.createElement("div");
            divider.setAttribute("data-slot", "dropdown-menu-separator");
            divider.style.cssText = "height:1px;margin:6px 4px;background:rgba(255,255,255,0.14);";
            added.push(divider);
          }
          var first = content.firstElementChild;
          added.forEach(function (el) { content.insertBefore(el, first); });
        }

        var mo = new MutationObserver(function () { extendUserMenu(); });
        mo.observe(document.documentElement, { childList: true, subtree: true });
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", function () { extendUserMenu(); });
        } else { extendUserMenu(); }
      })();
    </script>
"""


def patch_bundle(path: pathlib.Path) -> bool:
    """Trim the sidebar group to the signed-in user's row."""
    t = path.read_text()
    start = 'c.jsx(Gvt,{children:c.jsxs(Tf,{className:"gap-px",children:['
    end = 'c.jsx(oc,{children:c.jsxs(o$,'
    s = t.find(start)
    if s < 0:
        return False
    e = t.find(end, s)
    if e < 0:
        return False
    seg = t[s:e]
    if seg.count('c.jsx(oc,{children:c.jsxs(td,') != 6:
        return False
    path.write_text(t[:s] + start + t[e:])
    return True


# The current Alexander shell is the template: extract the two injected blocks
# so they can be removed from any shell that already carries them.
_template = pathlib.Path("/home/aais/openbot/branded/index.html").read_text()
_style_end = _template.index("    </style>")
_css_start = _template.rindex('      /* ------------------------------------------------------------------\n         "Get the app" button in the sidebar', 0, _style_end)
TEMPLATE_CSS = _template[_css_start:_style_end]
_script_matches = list(re.finditer(r"    <script>\n      /\* -+\n", _template))
_script_start = _script_matches[-1].start()
_script_end = _template.index("    </script>", _script_start) + len("    </script>")
TEMPLATE_SCRIPT = _template[_script_start:_script_end]
print("template blocks:", len(TEMPLATE_CSS), "css chars,", len(TEMPLATE_SCRIPT), "script chars")

for slug, cfg in DEPLOYMENTS.items():
    d = pathlib.Path(cfg["dir"]) / "branded"
    index = d / "index.html"
    html = index.read_text()

    # 1. Drop any previous copy of the CSS block and the script (taken from the
    #    current Alexander shell, which is the template), then add fresh ones.
    html = html.replace(TEMPLATE_CSS, "").replace(TEMPLATE_SCRIPT, "")
    html = html.replace("    </style>", CSS + "    </style>", 1)
    script = SCRIPT.replace("__QR_SVG__", QR[slug]).replace("__SLUG__", slug)
    html = html.replace("  </body>", script + "  </body>", 1)

    # 2. Bump the bundle's cache key.
    m = re.search(r"index-[A-Za-z0-9_-]+\.js\?v=(\d+)", html)
    if m:
        html = html.replace(m.group(0), m.group(0).replace("?v=" + m.group(1), "?v=" + str(int(m.group(1)) + 1)), 1)

    index.write_text(html)
    print(f"{slug}: shell updated (bundle v{m.group(1) if m else '?'} -> {int(m.group(1))+1 if m else '?'})")

    # 3. Trim the sidebar in the bundle.
    bundle = next(d.glob("index-*.js"), None)
    if bundle:
        bak = bundle.with_suffix(bundle.suffix + ".bak-nav")
        if not bak.exists():
            bak.write_text(bundle.read_text())
        ok = patch_bundle(bundle)
        print(f"{slug}: bundle {'patched' if ok else 'already trimmed'}")
