# Callout placement: review tooling, not a production importer

The customer viewer already supports part/marker selection. The catalogue has
572 imported callouts but only 15 positioned markers. New proposals in `review/`
are deliberately outside `src/`; they are **not used in ordinary catalogue
responses**. The opt-in local preview and explicit hosted read-only review
read them at runtime after source validation. Do not write them into
the seed or publish them without RUF Diamond sign-off.

## Hosted read-only review

Each figure links to `/review/figures/<figureId>`. This owner-requested demo
route works in a production Next build without environment configuration and
is explicitly separate from customer publication. Review source and drawing
files are included in that route's server bundle for runtime hash validation.
Cart, quote, email, print and crop exports are disabled; zoom, fullscreen,
filtering and selection remain interactive. The public demo route is not an
authenticated backend draft preview and must not be connected to private
working data. See `docs/callout-placement-review.md` for rollout acceptance.

## Optional local viewer preview

To inspect unambiguous proposals in the existing customer-style viewer during
development, start the local app with the server-only opt-in:

```sh
RUF_CALLOUT_PREVIEW=1 npm run dev -- --port 3100 --hostname 127.0.0.1
```

The local overlay is disabled unless both development mode and the exact flag value
`1` are present, and it is always disabled in production. Enabled loads check
the proposal schema and review status, null reviewer, catalogue hash, drawing
path, dimensions and artwork hash before copying eligible x/y values into the
detached response. The seed and review files are not modified. The viewer shows
an unapproved/not-for-ordering notice, preserves existing coordinates and
masks, excludes ambiguous or unassociated occurrences, and withholds Frame 2.1
and Cabin 6.13 until their source conflicts are resolved. RUF Diamond approval
and the existing catalogue publication gate remain required. On crowded plates,
use the existing **Zoom in** control or open the full illustration; the preview
notice remains visible in that full view. Fit view can still contain overlapping
marker targets, so this guidance is not a claim that dense-layout UX is finished.

## Run the checks

These analysis tools require Python, numpy, scipy and Pillow. The renderer also
requires reportlab. No frontend or API dependency is added. With `uv` available:

```sh
uv run --with numpy --with scipy --with pillow python tools/callouts/run_tests.py test_detect
uv run --with numpy --with scipy --with pillow python tools/callouts/run_tests.py test_review
uv run --with reportlab python tools/callouts/run_tests.py test_render
uv run --with reportlab python tools/callouts/render_review.py
npx tsc --noEmit
npm run lint
```

The glyph detector needs locally licensed `Arial.ttf` and `Arial Bold.ttf`.
macOS's `/System/Library/Fonts/Supplemental` is the default. On another host set
`CALLOUT_FONT_DIR` to a directory containing those two fonts. Fonts are not
distributed here. If they are unavailable the detector fails with instructions;
it does not substitute a different font and silently change the measurement.
No cloud OCR, credentials or catalogue upload is involved.

`render_review.py` needs no fonts or CV dependencies beyond reportlab and its
image support. It validates drawing SHA-256 hashes before rendering the saved
proposal set. Outputs: `output/pdf/rufdiamond-callout-review-2026-09-07.pdf`
and the companion CSV. The PDF has a cover plus one page per supplied plate.
The CSV includes rows for unresolved references as well as proposed occurrences.

Existing outputs are protected: the renderer refuses to overwrite either file.
Use `--output-dir output/pdf/revision-2` for a new revision. `--overwrite` is an
explicit replacement of both files; preserve reviewer corrections elsewhere
first. Export also refuses changed catalogue hashes, changed artwork, or an
already reviewed/approved input. The generated PDF/CSV directory is Git-ignored.

## Evidence and limits

- `test_detect.py` checks Windows (9) and Filters (6), within 2 percentage
  points on each axis and with no extra/duplicate detections. It does not supply
  their positions or number sets to the detector. The tests passed **15/15**.
- The old largest-size-family heuristic picked bolt holes on Windows. The new
  experiment requires an isolated interior glyph, compares rendered digit
  shapes and hole topology, and rejects ambiguous matches. Both ellipses and
  the rectangular Filter labels work. Expected catalogue numbers are never used
  to manufacture a missing detection.
- `review/automated-results.json` records the actual full-catalogue attempt:
  **318 occurrences, 259 unmatched expected figure/number pairs, three
  unexpected pairs**. Two unexpected pairs are real labels 8 and 9 on Frame
  2.1; one is a false `15` on Engine 8.2. Many two-digit/broken-outline labels
  are missed. This is **not reliable unattended placement**, despite passing
  the two oracle plates. Stop here on computer-vision development.
- `shapeScore` is binary glyph intersection-over-union; `margin` is the gap
  to the next digit candidate. Neither is a calibrated probability. Saved
  automated results are diagnostic evidence, not the review annotations.
- `review/proposals.json` adds agent-read label numbers and manual centers where
  the experiment fails. Each marker declares evidence and qualitative confidence:
  existing hand-placed oracle; agent-read digit / geometric center; or agent-read
  digit / estimated center. Every new point is **unapproved**. These are proposals
  for a person to check, not a claim of human/domain review.
- There are **568 annotations**: 15 existing reference positions, 543 newly
  proposed imported reference positions, two additional repeated printed
  occurrences, and eight source-only numbers. Fourteen expected references
  across eight plates remain unresolved. Matching a number set proves coverage,
  not that the drawing or part association is correct.
- Each drawing is bound to an exact source hash and dimensions. Most are
  1280x720; two are larger. Coordinates are always percentages. Duplicate
  printed occurrences remain separate records, with no guessed `figurePartId`.

## Required approval workflow

1. Review each page against the corresponding parts list: numeral, leader,
   actual part, part number, description, and every occurrence. The small
   colored badge is the **proposed number**; the original numeral remains inside
   the ring so disagreements are visible.
2. Fill in reviewer/date and accepted or corrected coordinates in the companion
   CSV. Record a deliberate resolution for every missing/extra/conflicting label.
   Number-set equality alone is not approval. Do not approve source-only labels
   as an invented part. An absent marker is not automatically `NOT SHOWN`.
3. Resolve the source conflicts listed in `docs/callout-placement-review.md`.
4. Only after attributable RUF Diamond approval, apply positions to **draft**
   data with stable occurrence IDs and the approved drawing version. Preserve
   existing masks and coordinates, multi-occurrence association, capability
   checks and audit. A stale drawing hash invalidates the approval.
5. Leave unpublished/unmapped/unplaced data blocked from customer releases.
   Customer reads must continue to resolve one active immutable release.

Recommended next implementation is the capability-controlled hotspot editor,
recorded in `docs/admin-features.md` (previous code at commit `1fe7668`). It gives
the person responsible for the catalogue a bounded, auditable correction tool.
Its removal was intentional; rebuild it against current design requirements,
not by restoring the entire old admin UI. Red SVG silhouette fills are optional
and outside this marker-placement review.
