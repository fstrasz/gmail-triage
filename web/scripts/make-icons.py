#!/usr/bin/env python3
"""Generate the PWA icon PNGs: a dark rounded-square field with a blue
envelope-plus-check glyph. Run from anywhere; writes into web/public/.
"""
from pathlib import Path
from PIL import Image, ImageDraw

FIELD = (14, 23, 38)   # #0E1726
GLYPH = (44, 77, 156)  # #2C4D9C
OUT_DIR = Path(__file__).resolve().parent.parent / "public"


def draw_envelope_check(draw: ImageDraw.ImageDraw, box, color):
    """Draw an envelope outline with a checkmark inside, fit to box (l, t, r, b)."""
    l, t, r, b = box
    w, h = r - l, b - t
    stroke = max(2, round(w * 0.06))

    # Envelope body.
    draw.rounded_rectangle(box, radius=round(w * 0.08), outline=color, width=stroke)

    # Envelope flap (two lines from top corners to a point at mid-height).
    apex = (l + w / 2, t + h * 0.42)
    draw.line([(l, t), apex], fill=color, width=stroke)
    draw.line([(r, t), apex], fill=color, width=stroke)

    # Checkmark, lower-right portion of the envelope.
    cx, cy = l + w * 0.60, t + h * 0.62
    cw, ch = w * 0.30, h * 0.24
    draw.line(
        [
            (cx - cw * 0.5, cy),
            (cx - cw * 0.1, cy + ch * 0.5),
            (cx + cw * 0.5, cy - ch * 0.5),
        ],
        fill=color,
        width=stroke,
    )


def make_icon(size: int, maskable: bool) -> Image.Image:
    img = Image.new("RGB", (size, size), FIELD)
    draw = ImageDraw.Draw(img)

    if maskable:
        # Field bleeds edge-to-edge; glyph confined to the inner 60% safe zone.
        # Extra margin accounts for the glyph's stroke width bleeding past the box.
        margin = size * 0.235
    else:
        # Field itself is a rounded square with a small margin.
        margin = size * 0.06
        draw.rounded_rectangle(
            (margin * 0.3, margin * 0.3, size - margin * 0.3, size - margin * 0.3),
            radius=round(size * 0.18),
            fill=FIELD,
        )
        margin = size * 0.20

    box = (margin, margin, size - margin, size - margin)
    draw_envelope_check(draw, box, GLYPH)
    return img


def main():
    make_icon(192, maskable=False).save(OUT_DIR / "pwa-192.png")
    make_icon(512, maskable=False).save(OUT_DIR / "pwa-512.png")
    make_icon(512, maskable=True).save(OUT_DIR / "pwa-maskable-512.png")
    print("wrote pwa-192.png, pwa-512.png, pwa-maskable-512.png")


if __name__ == "__main__":
    main()
