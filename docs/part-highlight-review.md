# Component highlighting review — 8 September 2026

## Behavior and boundaries

Deepshika's reference is Cabin 6.1: selecting a part must shade the physical
component, not only its numbered marker. The existing viewer already implements
that treatment through `Callout.maskPath`; the added marker proposals did not
contain component geometry. This change supplies manually traced outline
proposals through the same renderer, selection, wheel zoom and fullscreen.

This is **read-only review functionality, not customer publication**. New
outlines appear at `/review/figures/<figureId>` and in the explicitly enabled
development preview. Ordinary production catalogue responses, seed, imported
descriptions/prices and existing masks remain unchanged. An outline is an
approximate visible exterior region, not an engineering contour. Some cover
only the directly leader-indicated instance or visible portion. Missing outlines
must not be presented as completed work.

## Source and identity controls

- `tools/callouts/review/part-highlights.json` and
  `part-highlights-chassis.json` hold proposals against existing PNGs.
- `tools/callouts/review/source-corrections.json` contains two versioned drawing
  replacements, original/replacement hashes, source PDF hash, physical page,
  render dimensions and crop rectangle.
- Each annotation records occurrence ID, figure-part ID, printed reference,
  part number, marker position, polygon point arrays and observed evidence.
- The loader validates the unapproved envelope, catalogue hash, original PNG
  identity/hash/dimensions, occurrence-to-row relationship and bounded,
  non-degenerate polygons. Duplicate occurrence annotations fail validation.
- Corrected artwork invalidates previous preview geometry on that figure.
  A replacement cannot overwrite existing positioned or masked seed callouts.
- Required artwork failures show an unavailable notice; absent optional
  manifests do not break unrelated figures. Failed primary marker-source
  validation prevents supplemental outlines from being applied.
- Existing masks/coordinates and legitimate occurrence IDs remain intact.
  All traced occurrences shade when their shared part is selected.

SVG paths are generated from numeric polygons, not arbitrary markup. There is
no automatic approval, inferred association by resemblance, seed rewrite or
customer-release change. Customer reads must ultimately resolve one approved
immutable release; Xero remains deferred.

## Corrected artwork

Manufacturer source: `96-00073 - Parts_catalog_FT3-REV.2.pdf`, SHA-256
`00698197a467c6ae4a1a809a108c8f225854f25897ea3ff4372f209948273bca`.
Physical page numbers below are one-based; contents-page offsets are unreliable.

| Figure | Correction | Remaining warning |
|---|---|---|
| 2.1 Bumper and hitch receiver | Physical page 6 supplies the correct drawing and refs 1–7. The PNG incorrectly duplicated the winch plate. | Ref. 2 has the same part number but PDF description M10 versus imported M4. Imported data is preserved; resolution/sign-off is required before ordering or publication. |
| 3.1 Hydraulic motor assembly | Physical page 8 explicitly prints refs 1–4; 1/4 were blank in the supplied PNG. | Motor shading covers the main housing, not the crowded front flange. Additional unlabelled hardware instances remain untraced. |

New crops are under `public/drawings/ft3w/review-source-20260908/`; original
PNGs are not overwritten. Poppler rendered both pages at 150 DPI (1275 × 1650);
exact crop rectangles are recorded in the manifest. The PDF supports these
review proposals, not overwriting spreadsheet parts when sources disagree.

## Coverage and remaining work

This checkpoint adds **272 reference-linked silhouette proposals across 40
figures** (144 in the main manifest, 117 in chassis/electrical, 11 in corrected
source figures). Windows and Filters are unchanged. This is coverage across
figures, **not full per-part parity**: numerous individual references still have
marker-only selection. The exact missing-reference lists are retained in the
manifests; do not describe all parts as finished.

The manifests are the exact delivered coverage. Non-empty `polygons` means a
proposed component highlight; an empty array means marker-only. A missing
annotation is **not traced**, not necessarily ambiguous. See each figure's
`notes` and `tools/callouts/review/part-highlights-notes.md` for specific withheld
references and partial contours. Some small hardware is obscured by its leader
dot; no highlight is fabricated around that dot.

Cabin 6.13 still has conflicting repeated 2/3 labels in the manufacturer PDF
and remains withheld. Accessories 12.1 has no printed marker references;
Safety/tools 6.15 has no supplied plate. These differ from clear markers whose
outlines simply remain to be traced. PDF notes explicitly identify several
absent parts (Wheel 5.2 refs 8–10, Cowling 7.1 ref 34, Lower panels 7.2 ref 6);
this evidence does not silently reclassify imported callouts or relax publishing.

## How Deepshika can test after deployment

1. Open `/review/figures/fig-hydraulic-4-4`. Select **Charge pump / 50-00026**
   in the table. The detached pump casing, marker 1 and row should highlight.
   Move the pointer away to distinguish selection from hover.
2. Click marker 1 again and move away: shading and persistent selection clear.
   Select fitting 2 or 3 to check a different component.
3. Scroll the wheel up/down over the artwork and a marker. Drawing, markers and
   shading grow/shrink together. Scroll the parts list: drawing zoom stays put.
   Check zoom buttons separately.
4. Open **Illustration full screen**, zoom, and select/deselect a marker.
   The source-review warning must remain visible.
5. Open `/review/figures/fig-frame-assy-2-1`. Select **Receiver hitch bumper /
   70-02270**, then **Pintle hook / 82-00127**. Each component should shade in
   the corrected drawing. The M10/M4 warning must remain visible.
6. Compare `/figures/fig-cabin-6-1`, the unchanged original reference. New
   outlines use its red-fill styling. Untraced components elsewhere still
   highlight only their number; do not accept those as full parity.

Ordering/exports are disabled in review. An ordinary figure link is not a
review link. A commit/push is not evidence that Vercel deployed it: verify the
deployment commit and repeat these checks on the hosted URL before saying live.

## Verification

Run `npm run test:callout-preview -- --maxWorkers=1`, `npm run lint`,
`npx tsc --noEmit` and `npm run build`. Tests exercise real manifests through
runtime validation, wrong/stale identities, invalid regions, replacement
geometry invalidation, missing-artwork reporting, preservation, production
gating and repeated-occurrence rendering.

Local browser checks cover pump row-to-component shading, deselection, equal
image/overlay rectangles at 1.5× in normal/fullscreen views, and corrected bumper
shading with native wheel zoom in/out, including over a marker. Warnings stay
visible. Screenshots under `output/highlights-20260908/` are local evidence,
not hosted deployment or human approval.

Checkpoint checks: 78 frontend tests, 104 API tests and 41 contract tests passed;
lint, TypeScript and the production build passed. The review route's runtime
trace contains all three new manifests and both corrected PNGs, with no `.env`
files. A 22-second H.264 clip at
`output/highlights-20260908/component-highlights-demo.mp4` combines genuine local
UI captures of pump selection, wheel zoom, fullscreen and bumper selection.
It is a **step-by-step image sequence, not a continuous screen recording**.
