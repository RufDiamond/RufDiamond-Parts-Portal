# Place the callout markers so every figure behaves like 6 Cabin > Windows

A brief for whoever takes on the callout placement. Written September 2026, off
the back of a failed automated attempt — the findings below are the useful part.

A figure screen shows an exploded drawing beside its parts list. Clicking a
Ref. no. in the list should light the matching numbered marker on the plate,
and clicking a marker should select the row.

This works on exactly two figures today. The job is to make it work on all 44.

## Where things are

- Drawings: `public/drawings/ft3w/*.png` (44 plates, 1280x720)
- Catalogue seed: `src/data/ft3-wagon.ts` — parts, figures, figureParts, callouts
- Marker building: `src/lib/drawing.ts` (`buildDrawingMarkers`)
- Rendering: `src/components/DrawingViewer.tsx` and `CalloutMarker.tsx`
- Deck, the design source of truth:
  `design-reference/source/Screens New RD Parts Portal - V2 - 30-SEP-2026.pdf`,
  slide 14

## The data model

A `callout` row is `{ id, figureId, figurePartId, number, x, y, maskPath }`.

- `x` / `y` are **percentages of the drawing, 0–100** — never pixels. The plate
  can be re-exported at another resolution without detaching the markers.
- A marker renders only if it has **both** coordinates **and** a
  `figurePartId`. Either gap silently drops it — see `buildDrawingMarkers`.
- `maskPath` is optional: an SVG path in the same 0–100 space that fills the
  part in red when it is selected. Only 7 callouts have one. Not required.

## Current state

**572 callouts. 15 placed, 557 with `x: null, y: null`.**

| Figure | Placed | Notes |
|---|---|---|
| `fig-cabin-6-1` (6.1 Windows) | 9 | 7 also carry a `maskPath` |
| `fig-filters-1-1` (1.1 Filters) | 6 | markers only, no masks |
| every other figure | 0 | nothing on the plate |

The tool that places them — the admin figure/hotspot editor — was removed on
client instruction. It survives at commit `1fe7668`; see
`docs/admin-features.md` and `clients.md` §1.0, which calls rebuilding it the
highest-priority admin item.

## What was already tried

Scaffolding lives in `tools/callouts/` — a ground-truth reader, a geometric
detector and a small test runner. Read it before starting. These findings are
measured, not guessed:

1. **Callouts are findable geometrically.** A callout is a digit inside a thin
   ellipse. The ellipse encloses a pocket of white that the sheet's outer
   background cannot reach. Label the background, discard anything touching the
   border, and every remaining pocket of the right size is a candidate.
2. **The size differs per plate.** The sheets were exported at different
   scales — 36x31 px on cabin 6.1, 34x38 on filters 1.1, 24x30 on cabin 6.2.
   Any absolute size filter fails. Find the most-repeated pocket size per plate.
3. **Bolt holes are the enemy.** Exploded views are full of small circles.
   Requiring ink — a digit — inside the ellipse helps a great deal but is not
   sufficient: on cabin 6.1 the "largest same-size family" heuristic still locks
   onto a cluster of bolt holes and misses all nine real callouts. **That
   specific failure is the thing to fix first.**
4. **Reading the number is the unsolved half.** No OCR is available locally —
   no tesseract, no cv2, no pytesseract. PIL, numpy and scipy are present. A
   workable approach: crop each ellipse's digits, cluster the glyphs across all
   44 plates (the CAD font is consistent), then label the clusters using the
   constraint that each figure's detected numbers must equal its known callout
   set. Digit `0` only ever appears inside two-digit numbers.

## The verification oracle — use this, do not eyeball

Two independent checks already exist in the repo.

**Positions.** `fig-cabin-6-1` and `fig-filters-1-1` were placed by hand, so a
correct detector rediscovers those 15 markers within about 2% of the sheet in
each axis. Score at the time of writing:

| Figure | Known | Recovered | False positives |
|---|---|---|---|
| `fig-filters-1-1` | 6 | 6 | 0 |
| `fig-cabin-6-1` | 9 | 0 | 11 |

**Numbers.** Every figure's callout number set is already in the seed, so
detected numbers can be compared against it figure by figure.

One caveat: the export's callout list is incomplete on some figures —
`hydraulic-4-4` lists 3 callouts but the plate carries roughly 33 — so a count
mismatch is not automatically a detection failure. Treat the two hand-placed
figures as the only hard ground truth.

## Acceptance criteria

- Both oracle figures recovered at 15/15, with no false positives.
- For every other figure, a proposed marker set with a confidence signal.
- **A human review sheet before anything is written to `ft3-wagon.ts`**: each
  plate rendered with its proposed markers drawn on, for someone at RUF Diamond
  to sign off. A marker carrying the wrong number points a customer at the wrong
  part, and it looks entirely normal on screen. Do not silently commit guesses.
- Existing behaviour unchanged: `npx tsc --noEmit` and `npm run lint` clean.

## A word on which route to take

Work test-first; the oracle above gives a failing test on day one.

If detection cannot be made reliable, say so plainly and stop. The honest
fallback is rebuilding the hotspot editor and having a person click the 557
markers — perhaps a day of clicking against an unbounded amount of computer
vision, and the result is owned by someone who can be asked why a marker sits
where it does.

**This is a question for RUF Diamond, not a technical toss-up.** If the goal is
"working across the catalogue, reliably", the editor is the cheaper path. If the
goal is "working without human effort", the detector is worth another attempt —
but the review sheet stays either way.
