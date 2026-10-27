#!/usr/bin/env python3
"""Generate maskable PWA icons for Yijeeb (v5 — final).

- base: deep crop (20% inset) of the source = pure brand gradient, full-bleed
- logo: generous crop around bubble+tail+glow, composited with a smooth radial
  feather (opaque core, fading edges) so the cut happens in plain teal that
  matches the base gradient — no visible seams, bubble intact.
"""
from PIL import Image
import numpy as np
import os

SRC = "/home/z/my-project/yijeeb/app/icons/icon-512.png"
OUT_DIR = "/home/z/my-project/yijeeb/app/icons"

img = Image.open(SRC).convert("RGBA")
w, h = img.size  # 512x512

def inset_crop(frac):
    c = int(w * frac)
    return img.crop((c, c, w - c, h - c))

base_src = inset_crop(0.20)

# Generous fixed crop around the bubble (bubble spans ~(133,133)-(378,378) incl. tail)
bubble = img.crop((118, 118, 394, 394))  # 276x276

def radial_feather(arr, core=0.60, edge=1.0):
    """Alpha: 255 inside `core` of half-size radius, linear fade to 0 at `edge`."""
    hh, ww = arr.shape[:2]
    yy, xx = np.mgrid[0:hh, 0:ww]
    cy, cx = (hh - 1) / 2, (ww - 1) / 2
    d = np.sqrt((yy - cy) ** 2 + (xx - cx) ** 2) / (max(hh, ww) / 2)
    a = np.clip((edge - d) / (edge - core), 0, 1)
    return (a * 255).astype(np.uint8)

def make_maskable(size: int) -> Image.Image:
    canvas = base_src.resize((size, size), Image.LANCZOS)
    target = int(size * 0.62)  # crop dimension on canvas
    scale = target / bubble.size[0]
    nw, nh = round(bubble.size[0] * scale), round(bubble.size[1] * scale)
    logo = np.array(bubble.resize((nw, nh), Image.LANCZOS))
    # core=0.88: full opacity covers the whole bubble+tail (max extent ~0.86),
    # fade happens only in plain teal near the crop edge -> no washed-out border
    alpha = radial_feather(logo, core=0.88, edge=1.0)
    logo[..., 3] = np.minimum(logo[..., 3], alpha)
    out = Image.fromarray(logo)
    canvas.alpha_composite(out, ((size - nw) // 2, (size - nh) // 2))
    return canvas

for s in (192, 512):
    out = os.path.join(OUT_DIR, f"icon-{s}-maskable.png")
    make_maskable(s).save(out, optimize=True)
    print("wrote", out)
