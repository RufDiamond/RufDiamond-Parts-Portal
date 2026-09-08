"""Read the callout facts out of the seed, so tests check against real data."""

import re
from pathlib import Path

SEED = Path(__file__).resolve().parents[2] / "src/data/ft3-wagon.ts"

_CALLOUT = re.compile(
    r'figureId: "(?P<fig>fig-[^"]+)",\s*\n'
    r"\s*figurePartId: [^\n]*\n"
    r"\s*number: (?P<n>\d+),\s*\n"
    r"\s*x: (?P<x>[^,\n]+),\s*\n"
    r"\s*y: (?P<y>[^,\n]+),"
)


def callouts():
    """Every callout as (figureId, number, x, y) with x/y None when unplaced."""
    text = SEED.read_text()
    for m in _CALLOUT.finditer(text):
        x = m.group("x").strip()
        y = m.group("y").strip()
        yield (
            m.group("fig"),
            int(m.group("n")),
            None if x == "null" else float(x),
            None if y == "null" else float(y),
        )


def placed(figure_id):
    """The (number, x, y) already positioned on a figure."""
    return sorted(
        (n, x, y) for f, n, x, y in callouts() if f == figure_id and x is not None
    )


def expected_numbers(figure_id):
    """Every callout number a figure carries, placed or not."""
    return sorted({n for f, n, _, _ in callouts() if f == figure_id})


def drawing_for(figure_id):
    """The plate a figure is drawn on."""
    root = Path(__file__).resolve().parents[2]
    text = (root / "src/data/ft3-wagon.ts").read_text()
    # Figures name their drawing by id; resolve through the figure record.
    fm = re.search(
        r'id: "%s",.*?drawingFileId: "([^"]+)"' % re.escape(figure_id),
        text,
        re.S,
    )
    if not fm:
        return None
    dm = re.search(
        r'id: "%s",\s*\n\s*filename: "[^"]*",\s*\n\s*format: "[^"]*",\s*\n\s*storagePath: "([^"]+)"'
        % re.escape(fm.group(1)),
        text,
    )
    # storagePath is a web path; the file lives under public/.
    return root / "public" / dm.group(1).lstrip("/") if dm else None
