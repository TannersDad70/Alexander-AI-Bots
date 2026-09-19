# Brand Assets — Alexander Bots

Deep-navy `#041027` + glowing-gold `#ffd479` identity for the Alexander AI
Solutions bots platform.

## Files

| File | What it is | Used by |
|---|---|---|
| `logo.svg` | Master logo. Hand-drawn geometric "A" (paths, not text — renders everywhere) with layered SVG-filter glow on a navy rounded-square badge, thin gold ring near the edge, subtle radial vignette. | Source of truth for all artwork |
| `icon-192.png` / `icon-512.png` | Standard app icons (192² for PWA manifest, 512² for high-res) | PWA manifest, about pages |
| `maskable-512.png` | 512² icon on a full-bleed navy canvas with the badge inset ~10% so OS mask shapes (circles, squircles) never clip the artwork | PWA manifest `"purpose": "maskable"` |
| `apple-touch-icon.png` | 180² icon for iOS home-screen bookmarks | `<link rel="apple-touch-icon">` |
| `favicon-32.png` / `favicon.ico` | 32² PNG favicon + multi-size ICO (16/32/48) | Browser tab favicon |
| `build_icons.py` | Regenerates every PNG/ICO above from the `logo.svg` composition (drawn directly in PIL — cairosvg is not installed here). Run: `python3 build_icons.py` | Build tooling, not served |

`web/vendor/qrcode.min.js` (next to these assets, in `../vendor/`) is the
vendored MIT QR generator plus a `window.QRCode` compat shim — it powers the
download page's QR code fully offline.

## Replacing with your own artwork

1. Replace `logo.svg` (keep the 512×512 viewBox so proportions match).
2. Re-run `python3 build_icons.py` in this directory to regenerate all
   PNG/ICO files from the new artwork.
3. If your icon needs a different safe-zone or ring treatment, tweak the
   geometry constants at the top of `build_icons.py` (e.g. `BADGE_INSET`,
   `RING_INSET`) and re-run.

All icons were generated from `logo.svg` on 2026-09-18 via `build_icons.py`
(Python PIL 10.2.0).
