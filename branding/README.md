# Branding layer

This is everything that makes the platform *yours* rather than plain OpenBot. None of it
changes how the bots work — it changes what people see.

| File | What it does |
|---|---|
| `index.html` | The page shell: title, icons, and the styling that gives the app its look — the full-width artwork, the dark translucent panels, the white glowing type, the large readable sizes, the card treatment, and the sidebar link targets. |
| `patch-app-bundle.py` | Edits the compiled app bundle: sets the product name the app shows, and adds the sidebar links (Obsidian Graph, Obsidian Vault, OpenRouter, Help). Re-run after every OpenBot update. |
| `assets/` | Artwork: background hero, favicon set, and the Explore-agent card images. |

## Why a patch script

The app ships compiled, with the brand name and sidebar baked in as JavaScript. Rather than
maintaining a rebuilt front-end, we keep a small, readable patch that is applied to the
upstream bundle. It is a handful of string replacements, which makes it easy to verify after
each OpenBot release — and easy to see exactly what was changed.

## Applying it

```bash
# copy the shell and the bundle out of a running container
docker cp my-bots:/app/app/dist/index.html branding/index.html
docker cp my-bots:/app/app/dist/assets/index-CbN6XavV.js branding/app-bundle.js

# brand them
python3 branding/patch-app-bundle.py \
  --bundle branding/app-bundle.js \
  --html   branding/index.html \
  --brand  "Your Brand" \
  --vault  https://vault.example.com/mybots/ \
  --graph  https://vault.example.com/mybots/graph.html
```

Then mount `branding/index.html` and `branding/app-bundle.js` over the files inside the
container (see `deploy/docker-run.example.sh`).

## The signed-in user's menu

The popup on the signed-in user's email row carries the deployment's links —
Obsidian vault and graph, Skills, Agents, OpenRouter, Help — plus two actions:

- **Get the app** opens a QR card for that deployment's download page.
- **Update the app** clears the copy saved in the browser and reloads the
  newest build. This is how a deployment in the field picks up a change
  published with `services/deploy-app.sh`.

`set-up-user-menu.py` sets this up (and trims the sidebar to just the user row)
for every deployment listed at the top of the file. It also patches the app
bundle so the sidebar links are gone — the bundle is backed up as
`index-*.js.bak-nav` before it is touched.
