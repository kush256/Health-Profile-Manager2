"""Slice the character reference sheet into transparent sprite layers.

Usage:  python3 slice_sheet.py <reference_sheet.jpg> <out_dir>

Each pose / expression on the sheet is cropped to its own PNG. The flat
beige paper colour is keyed out by flood-filling from the crop border
(plus large enclosed paper areas, e.g. the gap between arm and torso).
Edge pixels are un-mixed from the paper colour so no beige halo remains
when the sprite is drawn over a dark background.
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

# name: (left, top, right, bottom) in sheet pixels
BOXES = {
    "front":     (60, 40, 420, 1040),
    "side":      (480, 50, 680, 1030),
    "back":      (750, 50, 1075, 1030),
    "head_calm":      (35, 1085, 335, 1485),
    "head_angry":     (345, 1085, 645, 1485),
    "head_surprised": (35, 1510, 342, 1905),
    "head_grin":      (348, 1510, 645, 1905),
    "action":    (645, 1080, 1100, 1998),
}

T0, T1 = 26.0, 70.0          # colour distance: fully paper -> fully ink
ENCLOSED_MIN_AREA = 350      # enclosed paper pockets bigger than this are removed


def paper_regions(near: np.ndarray) -> np.ndarray:
    """Connected paper-coloured regions that touch the border or are large."""
    h, w = near.shape
    flat = near.ravel().tolist()
    seen = bytearray(h * w)
    bg = np.zeros(h * w, bool)
    for start in range(h * w):
        if not flat[start] or seen[start]:
            continue
        seen[start] = 1
        stack, comp, touches = [start], [], False
        while stack:
            p = stack.pop()
            comp.append(p)
            y, x = divmod(p, w)
            if x == 0 or y == 0 or x == w - 1 or y == h - 1:
                touches = True
            for q in (p - 1 if x else -1, p + 1 if x < w - 1 else -1,
                      p - w if y else -1, p + w if y < h - 1 else -1):
                if q >= 0 and flat[q] and not seen[q]:
                    seen[q] = 1
                    stack.append(q)
        if touches or len(comp) > ENCLOSED_MIN_AREA:
            bg[comp] = True
    return bg.reshape(h, w)


def key_out(crop: Image.Image) -> Image.Image:
    rgb = np.asarray(crop, dtype=np.float32)
    h, w, _ = rgb.shape
    # paper colour = median of the crop border
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    paper = np.median(border, axis=0)
    dist = np.sqrt(((rgb - paper) ** 2).sum(axis=2))

    near = dist < T0 + 8
    bg = paper_regions(near)

    # soft alpha only in a thin band around the background region
    band = np.asarray(
        Image.fromarray(bg.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(5))
    ) > 0
    soft = np.clip((dist - T0) / (T1 - T0), 0, 1)
    alpha = np.ones((h, w), np.float32)
    alpha[band] = soft[band]
    alpha[bg] = 0

    # un-premultiply the paper colour out of edge pixels
    a = alpha[..., None]
    safe = np.maximum(a, 1e-3)
    col = np.clip((rgb - (1 - a) * paper) / safe, 0, 255)
    out = np.dstack([col, alpha * 255]).astype(np.uint8)
    img = Image.fromarray(out, "RGBA")
    return img.crop(img.getbbox())


def main():
    src, out_dir = sys.argv[1], sys.argv[2]
    sheet = Image.open(src).convert("RGB")
    for name, box in BOXES.items():
        sprite = key_out(sheet.crop(box))
        sprite.save(f"{out_dir}/{name}.png", optimize=True)
        print(name, sprite.size)


if __name__ == "__main__":
    main()
