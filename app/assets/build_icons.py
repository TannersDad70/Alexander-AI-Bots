#!/usr/bin/env python3
"""
Alexander Bots — icon rasterizer.

Recreates the logo.svg composition directly in PIL (cairosvg is not
available in this environment): a deep-navy rounded-square badge with a
radial vignette, a thin gold ring near the edge, and the geometric gold
"A" drawn as polygons with layered Gaussian-blur glow beneath a crisp
gradient top layer.

Usage:  python3 build_icons.py
Outputs: icon-192.png, icon-512.png, maskable-512.png,
         apple-touch-icon.png, favicon-32.png, favicon.ico
"""
from __future__ import annotations

import os
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))

NAVY = (4, 16, 39)
NAVY_CENTER = (11, 33, 72)
NAVY_EDGE = (1, 6, 15)
GOLD = (255, 212, 121)
GOLD_TOP = (255, 230, 168)
GOLD_BOTTOM = (240, 178, 62)
HALO = (255, 158, 52)

# Logo geometry in the 512-space of logo.svg
OUTER_TRI = [(256, 108), (388, 404), (124, 404)]
INNER_TRI = [(256, 216), (326, 404), (186, 404)]
CROSSBAR = [(190, 302), (322, 302), (322, 338), (190, 338)]
BADGE_INSET = 8 / 512
BADGE_RADIUS = 112 / 512
RING_INSET = 30 / 512
RING_RADIUS = 98 / 512
RING_WIDTH = 3 / 512


def _scale_pts(pts, size):
    k = size / 512.0
    return [(x * k, y * k) for x, y in pts]


def _vignette(size):
    """Radial navy vignette image (RGBA)."""
    img = Image.new("RGB", (size, size))
    px = img.load()
    cx, cy = size * 0.5, size * 0.42
    rmax = size * 0.78
    for y in range(size):
        dy = y - cy
        for x in range(size):
            d = ((x - cx) ** 2 + dy ** 2) ** 0.5
            t = min(d / rmax, 1.0)
            if t < 0.55:
                u = t / 0.55
                r = NAVY_CENTER[0] + (NAVY[0] - NAVY_CENTER[0]) * u
                g = NAVY_CENTER[1] + (NAVY[1] - NAVY_CENTER[1]) * u
                b = NAVY_CENTER[2] + (NAVY[2] - NAVY_CENTER[2]) * u
            else:
                u = (t - 0.55) / 0.45
                r = NAVY[0] + (NAVY_EDGE[0] - NAVY[0]) * u
                g = NAVY[1] + (NAVY_EDGE[1] - NAVY[1]) * u
                b = NAVY[2] + (NAVY_EDGE[2] - NAVY[2]) * u
            px[x, y] = (int(r), int(g), int(b))
    return img.convert("RGBA")


def _a_mask(size):
    """L-mode mask of the geometric A (legs + crossbar)."""
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.polygon(_scale_pts(OUTER_TRI, size), fill=255)
    d.polygon(_scale_pts(INNER_TRI, size), fill=0)
    d.polygon(_scale_pts(CROSSBAR, size), fill=255)
    return m


def _gold_gradient(size, mask):
    """Vertical gold gradient clipped to the A mask."""
    grad = Image.new("RGB", (1, size))
    gpx = grad.load()
    for y in range(size):
        t = y / max(size - 1, 1)
        if t < 0.45:
            u = t / 0.45
            c = tuple(GOLD_TOP[i] + (GOLD[i] - GOLD_TOP[i]) * u for i in range(3))
        else:
            u = (t - 0.45) / 0.55
            c = tuple(GOLD[i] + (GOLD_BOTTOM[i] - GOLD[i]) * u for i in range(3))
        gpx[0, y] = tuple(int(v) for v in c)
    grad = grad.resize((size, size)).convert("RGBA")
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(grad, (0, 0), mask)
    return out


def _glow_layer(size, mask, color, radius, alpha):
    blur = mask.filter(ImageFilter.GaussianBlur(radius))
    layer = Image.new("RGBA", (size, size), color + (0,))
    layer.putalpha(blur.point(lambda v: int(v * alpha / 255)))
    return layer


def _rounded_rect_mask(size, inset, radius):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle(
        [inset, inset, size - inset, size - inset],
        radius=radius,
        fill=255,
    )
    return m


def build_badge(size):
    """Standard composition: navy badge fills the canvas."""
    canvas = Image.new("RGBA", (size, size), NAVY + (255,))
    vig = _vignette(size)
    badge_mask = _rounded_rect_mask(size, int(size * BADGE_INSET), int(size * BADGE_RADIUS))
    canvas = Image.composite(vig, canvas, badge_mask)

    # Thin gold ring near the badge edge
    ring = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(ring)
    inset = int(size * RING_INSET)
    w = max(1, int(size * RING_WIDTH))
    d.rounded_rectangle(
        [inset, inset, size - inset, size - inset],
        radius=int(size * RING_RADIUS),
        outline=GOLD + (255,),
        width=w,
    )
    ring.putalpha(ring.split()[3].point(lambda v: int(v * 0.38)))
    canvas = Image.alpha_composite(canvas, ring)

    # Glowing gold A
    mask = _a_mask(size)
    wide = _glow_layer(size, mask, HALO, max(1, size * 0.052), 190)
    tight = _glow_layer(size, mask, GOLD, max(1, size * 0.018), 235)
    canvas = Image.alpha_composite(canvas, wide)
    canvas = Image.alpha_composite(canvas, tight)
    canvas = Image.alpha_composite(canvas, _gold_gradient(size, mask))
    return canvas.convert("RGB")


def build_maskable(size):
    """Full-bleed navy canvas; the badge is inset ~10% so mask shapes
    never clip the artwork (meets the maskable safe-zone guidance)."""
    pad = int(size * 0.10)
    inner = size - 2 * pad
    canvas = _vignette(size).convert("RGB")
    badge = build_badge(inner)
    canvas.paste(badge, (pad, pad))
    return canvas


def main():
    jobs = [
        ("icon-192.png", lambda: build_badge(192)),
        ("icon-512.png", lambda: build_badge(512)),
        ("maskable-512.png", lambda: build_maskable(512)),
        ("apple-touch-icon.png", lambda: build_badge(180)),
        ("favicon-32.png", lambda: build_badge(32)),
    ]
    for name, make in jobs:
        img = make()
        path = os.path.join(HERE, name)
        img.save(path, "PNG")
        with Image.open(path) as check:
            print(f"{name}: mode={check.mode} size={check.size} OK")

    # Multi-size ICO (16 / 32 / 48)
    ico_src = build_badge(48)
    ico_path = os.path.join(HERE, "favicon.ico")
    ico_src.save(ico_path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    with Image.open(ico_path) as check:
        print(f"favicon.ico: format={check.format} sizes={check.info.get('sizes')} OK")


if __name__ == "__main__":
    main()
