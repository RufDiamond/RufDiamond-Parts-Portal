"""
Find the numbered callout circles printed on a drawing.

A callout is a digit or two inside a thin ellipse, with a leader line running
out to the part. The ellipse encloses a pocket of white that the rest of the
sheet cannot reach, which is what makes them findable without OCR machinery:
label the background, and every enclosed pocket of the right size is a callout.
"""

import os
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
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
    """Recognized label boxes, not the most common bolt-hole size family."""
    return [tuple(row["box"]) for row in propose_callouts(path)]


def _normalize(ink):
    ys, xs = np.where(ink)
    if not len(xs):
        return None
    cropped = ink[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return np.asarray(Image.fromarray(cropped).resize((24, 32)))


def _holes(ink):
    return ndimage.label(ndimage.binary_fill_holes(ink) & ~ink)[1]


@lru_cache(maxsize=1)
def _templates():
    # Fonts supply digit shapes, never oracle positions or catalogue numbers.
    # These are analysis-tool dependencies only. No OCR/network service runs.
    directory = Path(os.environ.get("CALLOUT_FONT_DIR", "/System/Library/Fonts/Supplemental"))
    paths = [directory / "Arial.ttf", directory / "Arial Bold.ttf"]
    if not all(path.is_file() for path in paths):
        raise RuntimeError("Set CALLOUT_FONT_DIR to licensed Arial.ttf and Arial Bold.ttf files; see tools/callouts/README.md")
    templates = []
    for size in (12, 14, 16, 18, 20, 24, 32, 48):
        for path in paths:
            font = ImageFont.truetype(str(path), size)
            for number in range(10):
                image = Image.new("L", (80, 80), 255)
                ImageDraw.Draw(image).text((10, 5), str(number), font=font, fill=0)
                glyph = _normalize(np.asarray(image) < INK)
                templates.append((number, glyph, _holes(glyph)))
    return templates


def _read_digit(ink):
    glyph = _normalize(ink)
    holes = _holes(glyph)
    scores = {}
    for number, template, template_holes in _templates():
        if holes != template_holes:
            continue
        score = float(np.logical_and(glyph, template).sum() / np.logical_or(glyph, template).sum())
        scores[number] = max(score, scores.get(number, 0))
    ranked = sorted(((score, number) for number, score in scores.items()), reverse=True)
    if len(ranked) < 2:
        return None
    score, number = ranked[0]
    margin = score - ranked[1][0]
    if score < 0.55 or margin < 0.025:
        return None
    return number, score, margin


def propose_callouts(path):
    """Unapproved (number, position, shape-score) hypotheses, NEVER live data.

    Score is glyph intersection-over-union, not a probability of correctness.
    Strict interior isolation rejects leader lines and bolt rims. Broken label
    outlines/ambiguous digits remain missing rather than being assigned numbers
    by the expected catalogue set. Keep occurrences; do not key by number.
    """
    ink = _ink(path)
    height, width = ink.shape
    proposals = []
    for x0, y0, x1, y1, w, h in _enclosed(path):
        if not 0.55 < w / h < 2.5:
            continue
        dx, dy = round(w * 0.20), round(h * 0.18)
        inner = ink[y0 + dy:y1 - dy, x0 + dx:x1 - dx]
        ys, xs = np.where(inner)
        if not len(xs) or ys.max() - ys.min() < h * 0.20:
            continue
        if inner[0].any() or inner[-1].any() or inner[:, 0].any() or inner[:, -1].any():
            continue
        # Separate adjacent digits at an empty column; zero is valid only as
        # part of a two-digit label. Never infer a digit from missing numbers.
        columns, count = ndimage.label(inner.any(axis=0))
        if not 1 <= count <= 2:
            continue
        readings = []
        for component in range(1, count + 1):
            selected = np.where(columns == component)[0]
            reading = _read_digit(inner[:, selected[0]:selected[-1] + 1])
            if reading is None:
                break
            readings.append(reading)
        if len(readings) != count or readings[0][0] == 0:
            continue
        number = int("".join(str(reading[0]) for reading in readings))
        proposals.append({
            "number": number, "x": (x0 + x1 - 1) / 2 / width * 100,
            "y": (y0 + y1 - 1) / 2 / height * 100,
            "box": [x0, y0, x1, y1],
            "shapeScore": min(reading[1] for reading in readings),
            "margin": min(reading[2] for reading in readings),
            "status": "proposed-needs-human-review",
        })
    return proposals


def detect_callouts(path):
    """Compatibility interface for the independent hand-positioned oracles."""
    return [(row["number"], row["x"], row["y"]) for row in propose_callouts(path)]
