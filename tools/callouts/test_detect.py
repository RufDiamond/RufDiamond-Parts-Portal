"""
The detector has to find the numbered circles printed on a plate.

`fig-cabin-6-1` is the oracle: nine of its callouts were positioned by hand, so
a detector that works must rediscover those nine numbers in those nine places.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import ground_truth as gt
from detect import detect_callouts

# A marker is a small square on a large plate; within 2% of the sheet in each
# axis is the same callout, not a different one.
TOLERANCE = 2.0


def test_finds_every_known_callout_on_cabin_6_1():
    known = gt.placed("fig-cabin-6-1")
    found = {n: (x, y) for n, x, y in detect_callouts(gt.drawing_for("fig-cabin-6-1"))}

    missing = [n for n, _, _ in known if n not in found]
    assert not missing, f"did not find callouts {missing}; found {sorted(found)}"

    off = [
        (n, (x, y), found[n])
        for n, x, y in known
        if abs(found[n][0] - x) > TOLERANCE or abs(found[n][1] - y) > TOLERANCE
    ]
    assert not off, f"placed in the wrong spot: {off}"


def test_finds_no_callout_the_figure_does_not_have():
    expected = set(gt.expected_numbers("fig-cabin-6-1"))
    found = {n for n, _, _ in detect_callouts(gt.drawing_for("fig-cabin-6-1"))}
    assert not (found - expected), f"invented callouts {sorted(found - expected)}"
