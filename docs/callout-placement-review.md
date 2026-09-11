# Exploded drawing placement review

**8 September update:** [Component highlighting review](part-highlight-review.md)
adds source-bound part silhouettes and correct PDF-derived Bumper 2.1/Motor 3.1
drawings on the read-only review surface. Historical blocker/coverage statements
below describe the earlier marker-only pass; no customer approval is implied.

Date: 7 September 2026. Status: **hosted read-only review prepared; no new customer mappings approved**.

## Hosted marker review rollout

The owner has requested a merge-deployed review, replacing the local-only
visibility limitation. After this change is merged into the Vercel deployment
branch, each ordinary figure offers **Open marker review**, linking to
`/review/figures/<figureId>`. For example:
`/review/figures/fig-cabin-6-2`. No new environment variable is required.

This is a public, read-only review of the existing demo catalogue assets, not
the authenticated backend's draft-preview API and not customer publication.
The ordinary `/figures/<figureId>` response retains its original positions;
the local opt-in described below retains its development-only gate. The new
route explicitly requests the review overlay and disables cart additions,
quotes, parts-list email, print and crop exports. Selection, filtering, zoom,
pan and fullscreen remain available. The sheet pager stays in review mode.
Warnings remain visible in fullscreen; returning to the ordinary catalogue
discards review selection. Search engines are instructed not to index review
pages; this is not an authentication control.

The server still validates catalogue/artwork hashes, dimensions and mapping
identity on every load. Required source files are explicitly traced into the
Next deployment bundle. Missing or stale files show an unavailable notice,
never invented positions. Frame 2.1 and Cabin 6.13 stay withheld. No seed,
approval record, backend entitlement or release is changed. Before connecting
this prototype to private working data, replace or remove this public review
route; backend draft preview still requires `publish.draft.view` and scope.

Merge acceptance: open Cabin 6.2 in marker review (26 applied), Hydraulic 4.4
(3 applied), Cowling 7.2 (5 applied, 1 unresolved), and Frame 2.1 (withheld).
Check wheel zoom, button zoom, fullscreen notice, marker/table selection and
disabled ordering; ordinary pages must still use the original positions.
A pushed commit is not proof of a successful Vercel deployment: verify the
deployment SHA and these URLs after the merge.

Local production-build verification for this rollout: 55 focused tests passed,
lint and `next build` passed, and all 44 review URLs returned 200 with validated
review notices. The emitted server trace contains proposal JSON, catalogue
source and artwork and no `.env` files. Cabin 6.2 was exercised in Chrome:
native wheel over the artwork enlarged 1x to 1.5x, wheel over a marker returned
to 1x, reference 2 selected both references 2 and 18 and their rows, fullscreen
wheel enlarged to 1.5x with its warning visible, and Next sheet retained the
review route while clearing selection. Add-to-cart remained disabled after
selection. Ordinary Cabin 6.2 and Hydraulic 4.4 still returned zero new markers.
This is local production-mode evidence, not a claim of Vercel deployment or
interactive testing of all 44 drawings.

The broader API suite also passed (104 tests) and contracts passed (41 tests).
The pre-existing `test:web` script points to an absent `@rufdiamond/web`
workspace, so it cannot run yet; this rollout tests the current Next frontend
with `test:callout-preview` and does not scaffold the deferred Vite migration.

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
the required attributable RUF Diamond sign-off. The notice points readers of
crowded plates to the existing Zoom in and full-illustration controls, and the
full-illustration header keeps the preview status visible outside the artwork.

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
The interface now explicitly recommends Zoom in or full illustration for
crowded labels and retains the unapproved/not-for-ordering status in the full
view's header. Those existing enlargement paths improve separation, with the
recorded full-screen 1.5x state clearly readable, but fit-view density remains
an unresolved UX limitation: marker targets were not shrunk, source positions
were not moved, and no collision-avoidance behavior was invented. Most new
plates have no silhouette masks, so the Windows fill treatment is not implied
elsewhere. The unresolved source-conflict cases and RUF Diamond approval gate
above remain unchanged, and customer publication is still blocked.

After this guidance/status correction, controller browser verification on
Engine 8.2 confirmed the workspace guidance, a readable fullscreen status with
unapproved/not-for-ordering language and counts, persistent warning after Zoom
in, and working close behavior at a 1,251-pixel viewport. The inspected local
capture is `tmp/remaining-callouts-video/final-fullscreen-preview-warning.png`;
it remains untracked review evidence, not a release artifact.
