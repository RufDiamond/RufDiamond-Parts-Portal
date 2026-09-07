# Exploded drawing placement review

Date: 7 September 2026. Status: **review prepared; no new live mappings applied**.

## Root cause and current customer behavior

The 44 supplied PNGs load, but only Windows and Filters have positioned
callouts. Of 572 imported callouts, 15 are placed and 557 remain unplaced.
`buildDrawingMarkers` correctly excludes null coordinates and missing part
associations. The viewer and selection model already support table-to-marker,
marker-to-part, and multi-occurrence highlighting. Seven existing Windows SVG
masks add optional red silhouette fills; masks are not required for this task.
The removed hotspot editor is recorded in [admin-features.md](admin-features.md).
This work deliberately does not restore the old admin UI or modify customer data.

The user's placement brief requires a RUF Diamond review sheet before updating
`src/data/ft3-wagon.ts`. That approval gate supersedes automatic placement. The
existing publish blockers are not weakened and no draft status is changed.

## Evidence and delivered review material

- Independent position oracles: Windows 9/9, Filters 6/6, no extra or duplicate
  detections; tolerance 2 percentage points per axis. Four detector tests pass.
- Full automated run: 318 occurrences, 259 unmatched expected figure/number
  pairs and three unexpected pairs. The detector remains unsuitable for
  unattended placement. The false Engine 8.2 label `15` is not included in
  the visual review proposals. Stop further unbounded CV work; use an editor.
- Agent-prepared review: all 44 plates, 568 annotations. These include 15
  existing reference markers, 543 new proposed imported reference positions,
  two extra printed occurrences, and eight source-only labels. Fourteen
  expected references on eight plates remain unresolved. None is guessed.
- Six review-data tests validate plate coverage, exact artwork hashes,
  percentage bounds, explicit missing/extra sets, pending review status and
  preservation of conflicting repeated occurrences without guessed part IDs.
- Four exporter tests cover stale catalogue rejection, pending-review status,
  preservation of existing review files, and explicit version/overwrite choice.
- `npx tsc --noEmit` and `npm run lint` both exit 0. Application source is
  unchanged. These checks do not claim that the original frontend issue is fixed.

The review tool and durable data live in [tools/callouts](../tools/callouts/README.md).
Run `render_review.py` to recreate the **45-page PDF** and companion CSV under
`output/pdf/`. The generated PDF contains customer artwork and stays a local
review artifact, not a source-control binary. Each page shows the original
numeral plus a separate proposed-number badge, evidence styling, unresolved
references, source-version identity and reviewer fields. Exact coordinates,
full SHA-256, occurrence number and correction columns are in the CSV.

Confidence labels describe evidence only: existing hand-placed oracle,
agent-read digit with geometric center, or agent-read digit with estimated
center. The latter two are unapproved hypotheses, not human sign-off.
Automated shape scores are not probabilities. No data leaves the machine.

## Source issues requiring accountable review

| Figure | Missing imported labels | Printed without imported match | Repeated printed numbers |
|---|---|---|---|
| accessories-12-1 | 1, 2, 4 | — | — |
| cabin-6-13 | 4, 9 | — | 2, 3 |
| cowling-fender-7-1 | 34 | — | — |
| cowling-fender-7-2 | 6 | — | — |
| drive-system-3-1 | 1, 4 | — | — |
| electric-11-2 | 10 | — | — |
| frame-assy-2-1 | — | 8, 9, 10, 11, 12 | — |
| frame-assy-2-2 | 17 | — | — |
| hydraulic-4-1 | — | 27, 28, 29 | — |
| tire-wheel-5-2 | 8, 9, 10 | — | — |

Additional critical observations:

1. **Frame 2.1 is the same PNG as Frame 2.2**, SHA-256
   `dee6f9df2ee8e9c2c018a751e5e9480e849df3f28c36ea74cc07667ac5a023e5`.
   Their lists differ: for example, 2.1 reference 2 is a screw, whereas the
   shared drawing's reference 2 is the winch fairlead listed under 2.2. Number
   coverage would conceal a wrong-part association. Obtain the proper 2.1 plate.
2. Drive 3.1 has two blank leader circles. Neither missing 1 nor 4 has been
   assigned to a circle by elimination or by recognizing the apparent hardware.
3. Cabin 6.13 prints 2 and 3 twice; at least the second 2 points to a pin rather
   than the seat back in the parts list. These are conflicting source labels,
   not permission to map both to the same part. Missing 4 and 9 need correction.
4. Earlier notes claimed Cabin 6.4 label 5 appears twice. The current PNG shows
   one readable label 5. No second marker is invented; confirm the source.
5. The brief's example of roughly 33 labels on Hydraulic 4.4 is not supported
   by the current PNG, which shows 1, 2 and 3. Hydraulic 4.1 actually has extra
   labels 27, 28 and 29; preserve them as unmapped source information.
6. Cowling 7.2 is 3856x2459 and Engine 8.4 is 1893x889. The remaining plates
   are 1280x720. Review coordinates are tied to the full image, not a letterbox.
7. Accessories 12.1 has no printed reference labels. Safety/tools 6.15 has no
   supplied drawing and no imported callouts; it is intentionally not one of
   the 44 review plates. Do not fabricate drawings or silently mark items
   `NOT SHOWN` to make a publish check pass.

## Next action and release guardrails

RUF Diamond reviews/signs the PDF and CSV, supplies corrected artwork or an
explicit source resolution for conflicts, and identifies approved occurrences.
Bind approval to actor, date, exact drawing version/hash, number, position and
part identity. Re-run the review after any artwork change.

Recommended implementation after this review is a scoped hotspot editor with
capability checks, draft persistence, optimistic concurrency, audit records,
percentage click coordinates, and all occurrences preserved. Design against
current UI requirements using the historical behavior as reference. Do not
restore the entire removed admin console wholesale. Accept only approved
positions into draft data; retain unresolved references as publish blockers.
Customer reads must resolve one active immutable release, never these review
files or mutable draft joins. The approved backend/database and OVH work remains
subsequent to this frontend placement gate; Xero remains deferred.

This is a **review milestone**, not a completed exploded-view fix, backend
integration, deployment or production publishing event.

## Development-only viewer preview

The reviewed proposal file can be overlaid in the existing figure viewer on a
local development server without changing `src/data/ft3-wagon.ts`:

```sh
RUF_CALLOUT_PREVIEW=1 npm run dev -- --port 3100 --hostname 127.0.0.1
```

The server reads and validates the proposal, catalogue and exact drawing bytes
on every enabled figure load. Production ignores the flag, and an unset flag
does not read or send review data. A visible notice identifies every enabled
overlay as unapproved and not for ordering. Frame 2.1 and Cabin 6.13 remain
withheld because of their source conflicts; ambiguous, missing, duplicate,
unassociated and out-of-bounds occurrences remain unplaced. This preview does
not approve positions, change the seed, relax publication blockers or replace
the required attributable RUF Diamond sign-off.

## Browser verification and local demo evidence

The enabled loopback development preview was exercised in the actual portal on
7 September 2026. Bidirectional selection worked on Cabin 6.2 (26 proposed
markers), Hydraulic 4.4 (3), Engine 8.2 (7), and Cowling 7.2 (5 placed, with
reference 6 still unresolved): selecting a marker selected its table row, and
selecting the row/reference highlighted the corresponding marker. Cabin 6.2
also preserved a legitimate repeated-part relationship, with references 2 and
18 highlighting together. Zoom was checked from 1x to 1.5x and back to 1x, and
the full-illustration view retained the selected marker at 1.5x.

The safety boundaries remained visible. Frame 2.1 and Cabin 6.13 showed their
withheld warnings instead of guessed markers. Existing Windows roof-hatch mask
behavior and Filters reference 3 selection still worked. A production server
started with `RUF_CALLOUT_PREVIEW=1` still returned the original unplaced view
with no local-preview notice, confirming that the flag alone cannot enable the
overlay outside development.

The local demo video is
`output/video/rufdiamond-remaining-callouts-demo-2026-09-07.mp4`. It is a
67.958-second H.264/yuv420p sequence of 17 genuine UI captures with caption
footers, explicitly labelled **Step-by-step UI captures**; it is not a
continuous screen recording or a release artifact. Full-file decoding
completed without error, and beginning, middle, and ending frames were visually
inspected. The source-frame manifest is
`tmp/remaining-callouts-video/frames.json`. Both paths remain local and
untracked.

This evidence establishes interaction behavior, not finished UI polish. At a
1,251-pixel viewport, Cabin 6.2's 26 markers produced 21 overlapping
marker-bounding-box pairs at fit view and none at 4x zoom. The page itself had
no horizontal overflow (`documentWidth` equalled the 1,251-pixel viewport), but
the dense existing 28-pixel marker squares can obscure nearby drawing detail.
Zoom and the full-illustration view improve separation, with the recorded
full-screen 1.5x state clearly readable. Most new plates have no silhouette
masks, so the Windows fill treatment is not implied elsewhere. The unresolved
source-conflict cases and RUF Diamond approval gate above remain unchanged, and
customer publication is still blocked.
