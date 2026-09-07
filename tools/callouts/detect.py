"""
Find the numbered callout circles printed on a drawing.

A callout is a digit or two inside a thin ellipse, with a leader line running
out to the part. The ellipse encloses a pocket of white that the rest of the
sheet cannot reach, which is what makes them findable without OCR machinery:
label the background, and every enclosed pocket of the right size is a callout.
"""

import numpy as np
from PIL import Image
from scipy import ndimage

# Ink is anything clearly darker than the paper.
INK = 160
# An enclosed pocket smaller than this is a gap in the linework, not a callout.
MIN_POCKET = 60
MAX_POCKET = 4000


def _ink(path):
    grey = np.asarray(Image.open(path).convert("L"))
    return grey < INK


def pockets(path):
    """Enclosed white regions: one per callout circle, plus a little noise."""
    ink = _ink(path)
    labels, count = ndimage.label(~ink)
    if count == 0:
        return []

    # Whatever touches the border is the open sheet, not a pocket.
    border = set(labels[0]) | set(labels[-1]) | set(labels[:, 0]) | set(labels[:, -1])

    found = []
    objects = ndimage.find_objects(labels)
    for i, sl in enumerate(objects, start=1):
        if i in border or sl is None:
            continue
        area = int((labels[sl] == i).sum())
        if not (MIN_POCKET <= area <= MAX_POCKET):
            continue
        found.append((i, sl, area))
    return found


# A callout ellipse is small, but HOW small differs from plate to plate: the
# sheets were exported at different scales, so 36x31 on one is 24x30 on
# another. What holds everywhere is that the callouts are the most repeated
# enclosed shape on the sheet — nothing else in the linework recurs at one
# exact size a dozen times.
MIN_SIDE, MAX_SIDE = 12, 72
SIZE_TOLERANCE = 2
MIN_FILL, MAX_FILL = 0.45, 0.99


def _enclosed(path):
    """Every pocket of white the sheet's edge cannot reach."""
    ink = _ink(path)
    labels, count = ndimage.label(~ink)
    if count == 0:
        return []

    border = set(labels[0]) | set(labels[-1]) | set(labels[:, 0]) | set(labels[:, -1])

    out = []
    for i, sl in enumerate(ndimage.find_objects(labels), start=1):
        if i in border or sl is None:
            continue
        y0, y1 = sl[0].start, sl[0].stop
        x0, x1 = sl[1].start, sl[1].stop
        w, h = x1 - x0, y1 - y0
        if not (MIN_SIDE <= w <= MAX_SIDE and MIN_SIDE <= h <= MAX_SIDE):
            continue
        fill = int((labels[sl] == i).sum()) / (w * h)
        if not (MIN_FILL <= fill <= MAX_FILL):
            continue
        out.append((x0, y0, x1, y1, w, h))
    return out


# The share of an ellipse's inside that its digits cover. Below the floor the
# ring is empty — a bolt hole, not a callout — and these drawings are full of
# them; above the ceiling it is a filled blob.
MIN_DIGIT_INK, MAX_DIGIT_INK = 0.04, 0.55


def _digit_ink(ink, box):
    """How much of the ellipse's inside is taken up by strokes."""
    x0, y0, x1, y1 = box
    dx, dy = max(1, round((x1 - x0) * 0.18)), max(1, round((y1 - y0) * 0.18))
    inner = ink[y0 + dy : y1 - dy, x0 + dx : x1 - dx]
    return inner.mean() if inner.size else 0.0


def callout_boxes(path):
    """Bounding boxes of the numbered ellipses, in pixels."""
    ink = _ink(path)
    pockets = [
        p
        for p in _enclosed(path)
        if MIN_DIGIT_INK <= _digit_ink(ink, p[:4]) <= MAX_DIGIT_INK
    ]
    if not pockets:
        return []

    # The biggest family of same-sized pockets is the callouts. Two-digit
    # numbers sit in a wider ellipse, so widths are matched loosely and the
    # height — which does not change with the digit count — strictly.
    best = []
    for anchor in pockets:
        _, _, _, _, aw, ah = anchor
        family = [
            p
            for p in pockets
            if abs(p[5] - ah) <= SIZE_TOLERANCE
            and p[4] >= aw - SIZE_TOLERANCE
            and p[4] <= aw * 1.8 + SIZE_TOLERANCE
        ]
        if len(family) > len(best):
            best = family

    return sorted((x0, y0, x1, y1) for x0, y0, x1, y1, _, _ in best)
