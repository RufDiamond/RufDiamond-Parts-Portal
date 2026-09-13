# Fat Truck quantity mapping review

All 45 FT3 Wagon figures and all 635 parts-table rows were audited against the
supplied plate PNGs, catalogue PDF, imported part information and existing
reference evidence. The mapping remains an unapproved review update. Deploying
the viewer does not publish these proposals as an approved catalogue release.

## Current coverage

| Measure | Result |
| --- | ---: |
| Figures audited | 45 |
| Parts-table rows audited | 635 |
| Sum of table Quantity | 1,680 |
| Mapped pointers before this catalogue-wide pass | 568 |
| Additional mapped pointers | 389 |
| Mapped pointers now | 957 |
| Instances with numeric component contours | 901 |
| Instances retaining existing SVG masks | 7 |
| Remaining label-only pointers | 49 |
| Expected instances without a positioned pointer | 723 |
| Rows whose pointer count matches Quantity | 447 |
| Rows flagged Review | 200 |
| Count-matched rows still flagged for source review | 12 |

A count match is not source approval or proof of a complete silhouette. Existing
partial contours and legacy masks are retained. The [row-by-row CSV](../tools/callouts/review/quantity-coverage.csv)
separates numeric contours, retained masks and label-only pointers; it includes
expected/mapped counts, additions, review status and source evidence for every row.
The three adjacent `quantity-*-audit.json` files retain inspection evidence and
source probes. Seven alternative Cabin 6.1 contours are explicitly inactive
because the existing legacy masks are preserved; only Refs. 1 and 3 gain new
numeric contours there.

## What selection does

The table's `figurePart.qty` supplies the expected count. Every mapped instance
sharing the selected part is highlighted together in the embedded viewer and
fullscreen. Pointers keep the original Ref. No. Crowded selected labels spread
with connecting lines; their saved source coordinates and contours do not move.
Show selected includes both the contours and their labels.

Shortfalls, excesses, unmapped quantities and documented source identity conflicts
show **Review**. A source conflict remains Review even when its pointer count
matches Quantity. Zero Quantity with zero pointers is a valid count match.

The selection readout explicitly shows **Expected quantity**, **Instances found**
and **Status: Complete / Needs Review** in both viewer sizes. Multi-quantity rows
also show their status below the unchanged table Quantity. Clicking any mapped
copy toggles the whole selected part group, including when its occurrences are
associated with more than one source row; unrelated selected parts are retained.

`componentGeometry.instanceIds` identifies which physical component owns each
region. Equal IDs group disconnected faces into one physical instance. Without
these IDs, a callout's regions remain one occurrence. The renderer and count
validation use the same materialization, including finite coordinate validation.
No coordinates are generated simply to make a count match.

## Remaining source limitations

- Cabin 6.9 has NOT SHOWN fastener rows with quantities 80 and 76.
- Wheel 5.2 lists 104 ice studs without identifiable visible placements.
- Cowling 7.2 depicts fewer bolt/screw groups than the table requires. Leader dots
  obscure some individual contours; other installation groups are absent.
- Cabin 6.15 has a parts table but no drawing in the source PDF. Cabin 6.13 has
  conflicting repeated labels and remains withheld.
- Cabin 6.12, Cabin 6.17 and Electrical 11.3 include drawing/table identity
  conflicts. These are retained as explicit row-level review reasons.
- Some seal quantities describe length sold by foot, not separate objects. The
  requested Quantity validation flags these rather than inventing copies.
- Other unresolved copies are occluded, overlap adjacent components, or cannot
  be separated reliably at the supplied image resolution.

Finishing those rows requires corrected source art, clearer views or clarified
part/quantity identities. This pass does not add an unattended vision detector.

## Source correction and verification, 2026-09-13

Reinspection found three misplaced Ref. 4 contours in Frame 2.2 despite the
previous 4/4 pointer count. Both chassis manifests now place those contours on
the actual second upper-right stud and two lower-left studs. The original
leader-established first contour and all four instance identities are retained.
Independent source probes cover `(905,437)`, `(867,459)`, `(717,564)`, `(679,589)`
in the original 1280×720 PNG and reject the previous offset locations. A matching
count alone cannot verify the source locations.

- 361 frontend tests passed, including all 635 audited rows through the real
  review loader and 562 active source geometry probes.
- Real table/viewer interaction tests select every one of the 268 multi-quantity
  rows across 40 figures, compare visible pointer counts with the source audit,
  verify shared numbering, retain one table row, highlight every mapped contour,
  and clear the entire group when any selected pointer is clicked.
- Real-catalogue fullscreen selection cases cover 2, 3, 4, 8, 10 and 16 instances.
  Controlled 3-of-4 and 5-of-4 cases both show Needs Review without adding locations.
- All supplemental contours load without invalid-geometry fallbacks. Artwork
  hashes, dimensions and part associations are validated; negative tests verify
  that missing replacement evidence and earlier validation failures block additions.
- Source row reasons survive loading and retain Review when counts match.
- Browser: Drive 3.1 Ref. 2 selects ten screws together; Cabin 6.17 Ref. 18 selects
  eight louvers together in normal and fullscreen views.
- Browser recheck: Frame 2.2 Ref. 4 selects the four source-corrected studs together
  in normal/fullscreen views and reveals them after zoom. Hydraulic
  4.1 Ref. 14 selects three instances together, retaining alignment through wheel
  zoom. Clicking a selected pointer clears the whole matching selection.
- TypeScript, production build and ESLint checked locally with no errors.

Regenerate the coverage CSV and summary from the actual loader:

```sh
npx vite-node --config vitest.callouts.config.mts tools/callouts/quantity-coverage.ts
```
