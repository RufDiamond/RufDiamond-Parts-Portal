# Fat Truck mapping coverage

Measured 9 September 2026 after Task 10c geometry batch22 (152 new component proposals from the 272-proposal baseline, plus existing-material corrections). This is a read-only legacy/proposal inventory, not a canonical database import, named source approval or release-readiness claim. Remaining clear tracing is implementation work, not a source blocker.

## Reproduce and inspect

- JSON: `npx tsx tools/callouts/mapping-coverage.ts`.
- Per-part Markdown checklist: `npx tsx tools/callouts/mapping-coverage.ts --markdown`.
- Local current artifacts: `output/task10c-coverage-batch22/coverage.json` and `output/task10c-coverage-batch22/checklist.md`. The earlier 329-proposal checkpoint remains separate. Generated artifacts are not committed; regenerate from checked-in sources.
- Source-bound classifications: `tools/callouts/review/coverage-classification.json`. Each exact row records its inspected source category, evidence, unresolved details and independently declared region/hole requirements. `null` requirements mean unknown; requirements must never be derived from available polygons. Source-only observations retain their own PNG/PDF domain and hash.

The exporter freshly verifies the legacy catalogue, proposal PNG hashes/dimensions and classification identity/hash bindings. It reports all 635 rows, all 572 existing occurrences, exact part/row/occurrence IDs, label origin, numeric topology, regions/holes, missing declared regions and source-only observations. Audited private workbook/PDF hashes are explicitly recorded audit provenance, not freshly rehashed or imported by this command.

## Exact current measurements

45 figures; 635 rows; 572 existing callouts; 536 parts; 44 original drawing records. Baseline: 15 positioned labels and 7 Windows legacy masks. Current: **424 valid numeric component proposals, 453 regions and 192 holes**. All 635 rows have source classifications; no uninspected fallback rows are silently treated as complete.

There are **64 clear untraced targets**, 50 untraced resolution-limited targets, 316 existing partial-geometry occurrences and 26 source-question occurrences. These are workflow subsets, not mutually exclusive totals of the entire catalogue. Other inspected clipped/limited contours and existing clear contours still awaiting independent requirements remain visible in the full checklist.

Only 12 visible shapes have independently satisfied declared requirements: Filters 1.1 refs 1–6, Engine 8.1 belts 1/2, Cabin 6.12 seals 8/9/11/12. This is shape measurement, not source approval. No entire figure is asserted approved or customer-ready. 17 source-only observations are outside the existing-row marker denominator.

| Figure | Numeric proposals | Clear untraced refs | Limited untraced refs |
| --- | ---: | --- | --- |
| 1.1 (fig-filters-1-1) | 6 | — | — |
| 2.1 (fig-frame-assy-2-1) | 7 | — | — |
| 2.2 (fig-frame-assy-2-2) | 12 | — | — |
| 3.1 (fig-drive-system-3-1) | 4 | — | — |
| 4.1 (fig-hydraulic-4-1) | 26 | — | — |
| 4.2 (fig-hydraulic-4-2) | 25 | — | 18, 19, 29, 30, 31, 32, 33 |
| 4.3 (fig-hydraulic-4-3) | 10 | — | — |
| 4.4 (fig-hydraulic-4-4) | 3 | — | — |
| 5.1 (fig-tire-wheel-5-1) | 7 | — | — |
| 5.2 (fig-tire-wheel-5-2) | 4 | 3 | 5 |
| 6.1 (fig-cabin-6-1) | 0 | 1, 3 | — |
| 6.2 (fig-cabin-6-2) | 12 | — | 2, 3, 4, 5, 6, 7, 9, 10, 13, 14, 15, 17, 18, 25 |
| 6.3 (fig-cabin-6-3) | 4 | — | — |
| 6.4 (fig-cabin-6-4) | 10 | — | — |
| 6.5 (fig-cabin-6-5) | 10 | — | — |
| 6.6 (fig-cabin-6-6) | 6 | 8, 9, 12, 13, 15, 20, 21, 22 | 10, 11, 16, 17, 18, 19 |
| 6.7 (fig-cabin-6-7) | 18 | — | — |
| 6.8 (fig-cabin-6-8) | 17 | — | — |
| 6.9 (fig-cabin-6-9) | 17 | — | 15 |
| 6.10 (fig-cabin-6-10) | 9 | — | — |
| 6.11 (fig-cabin-6-11) | 10 | — | — |
| 6.12 (fig-cabin-6-12) | 9 | — | — |
| 6.13 (fig-cabin-6-13) | 0 | 1, 5, 6, 7, 8 | — |
| 6.14 (fig-cabin-6-14) | 11 | — | — |
| 6.15 (fig-cabin-6-15) | 0 | — | — |
| 6.16 (fig-cabin-6-16) | 5 | — | — |
| 6.17 (fig-cabin-6-17) | 17 | — | — |
| 6.18 (fig-cabin-6-18) | 8 | — | 9, 10, 11, 12, 13, 14, 15 |
| 7.1 (fig-cowling-fender-7-1) | 17 | 1, 2, 3, 4, 5, 7, 8, 9, 10, 20, 21, 22, 25, 26, 27, 28 | — |
| 7.2 (fig-cowling-fender-7-2) | 3 | — | 4, 5 |
| 8.1 (fig-engine-8-1) | 11 | — | — |
| 8.2 (fig-engine-8-2) | 7 | — | — |
| 8.3 (fig-engine-8-3) | 7 | — | — |
| 8.4 (fig-engine-8-4) | 8 | 7, 15, 16 | 10, 11, 12, 13 |
| 8.5 (fig-engine-8-5) | 7 | 1, 2, 3, 4, 5, 8, 15, 16, 17, 18 | — |
| 8.6 (fig-engine-8-6) | 6 | 2, 5, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23 | 21, 24 |
| 9.1 (fig-fuel-system-9-1) | 19 | — | 15, 20, 21 |
| 10.1 (fig-tire-inflation-10-1) | 14 | — | — |
| 10.2 (fig-tire-inflation-10-2) | 8 | — | — |
| 11.1 (fig-electric-11-1) | 9 | — | — |
| 11.2 (fig-electric-11-2) | 7 | — | — |
| 11.3 (fig-electric-11-3) | 14 | 13, 14, 16 | — |
| 11.4 (fig-electric-11-4) | 10 | — | 3, 4, 8 |
| 11.5 (fig-electric-11-5) | 10 | — | — |
| 12.1 (fig-accessories-12-1) | 0 | — | — |

Source-row categories (not approvals): clear-tracing: 132; not-depicted-awaiting-review: 61; partial: 316; source-conflicted: 11; unknown-no-label: 11; clipped: 7; image-resolution-limited: 90; assembly-awaiting-review: 3; unknown: 4.

Windows 6.1 has seven legacy path masks; the actual missing component references are **1 and 3**. References 7/9 are not current source-association blockers. Filters now have six physical proposals. Safety 6.15 has nine inspected table-only/nondepicted rows and no drawing/callouts; that is not vacuous physical completeness. Marker UI counts now explicitly refer to existing-row marker positions, not every printed reference or complete contours.

Source-edge correction: Cabin 6.7 support7 has empty rows0/1 before its visible loop; pane1 closes at y717 with clear rows718/719 in the inspected window. Cabin 6.8 gate1 closes before the image bottom. Broad source-search windows did not establish clipping. Their concrete hole/occlusion debt remains partial; no crop blocker is inferred from a window boundary.

Engine8.3 ref3 also closes at y702 with rows703–719 clear in x665–704; the earlier cropped-mount assertion was withdrawn. New apertures preserve same-component rear bands/plate seen through front holes. Fuel9.1 tank6 no longer fills foreground cover3, but residual support/loop and fine wall/occlusion details remain explicitly partial.

Observed browser limitations: embedded-fit Cabin6.2 label2 intercepted label1, and Fuel9.1 label18 intercepted label9. Useful fullscreen native label/physical clicks and keyboard equivalents pass, but do not establish that crowded embedded-fit labels are separately mouse-clickable. Same-SVG component overlap is tested with an actual native click and exact-ref chooser, not forced clicks or generic background acceptance. These existing usability limitations remain Task11/final-review carry.

Cabin6.9 ref7 currently traces only two outer rail bands; the perforated front-face and brace material remains explicit tracing work. Ref9 has17 manually inspected aperture-interior subregions across two adjoining front-sheet regions, but tiny complete aperture boundaries and uncertain top-lip interiors remain partial. Neither a nonempty proposal nor the now-empty clear-untraced list for this figure means complete material coverage.

Electrical11.2 ref4's source-version question is directly verified: original PNG shows a display-style unit; manufacturer PDF physical49/footer45 shows a two-knob dial-panel photo, and row10 explicitly describes conversion of the old digital controller into dial. No replacement identity or ref10 geometry reuse is inferred.

Cabin6.11 support3 top slots/side bore and plate5 apertures remain actual material work. Cabin6.17 plenums15/17 currently trace only established near walls: remaining faces, joins and pale interior/bottom ownership remain partial work. Its embedded-fit label8 also intercepted label7; separate fullscreen/keyboard diagnostics are not a fit-view mouse fix.

## Separate source domains and persistence gates

- Original workbook: `Database FT3 Wagon - 14-JUL-2026.xlsx`, 70,881 bytes, SHA256 `3a6a66571058ac238f707fed4421755f9a678e4baff708b452382f439d876599`. Read-only parser audit: 635 retained rows, 633 valid normalized rows, 45 figure identities, 536 parts. Literal quantity-zero assembly rows222/241 remain gated. The 44 distinct GROUPNO values include two different figures named11.3; no source rename is inferred.
- Extracted legacy TypeScript: `src/data/ft3-wagon.ts`, SHA256 `df26ac87cbba1b0a88800d78459c225e93ce37a09e1d693196b1f92a507887c2`. Review manifests bind to these bytes, not XLSX bytes.
- Manufacturer PDF audit SHA256: `00698197a467c6ae4a1a809a108c8f225854f25897ea3ff4372f209948273bca`. Source-version/table-only observations remain separate from PNG identity.
- Current database `catalogueBindingSha256` binds exact UUID/model/variant/figure/row/part/occurrence versions plus PNG. No file hash above is presented as that canonical binding.

**Task10c actual real-workbook applies: 0; persisted revisions created: 0; named source approvals created: 0. No target database was inspected by the legacy inventory.** Original source decisions, supported quantity-zero interpretation, duplicate group reconciliation and actual target persistence remain gates. Existing releases remain immutable.

Concrete source questions include Bumper2.1 M4/M10, corrected/original Drive3.1 provenance, Cabin6.12 refs6/7/10, Cabin6.13 repeated2/3 and absent4/9, Cabin6.17 ref16 grille/air-conditioner duplicate PN, Electrical11.3 ref18 wrong source-version depiction, and unlabelled Accessories. Camera11.5 ref6 and seat6.14 refs1/4 shared-PN semantics are review questions, not proven swapped-part corrections. Inflation10.2 ref2 is applied RTV sealant, not a discrete gasket. The per-part checklist records exact distinctions; no manufacturer approval is inferred.

`buildMappingCoverage(figures, callouts, revisions)` retains the canonical source-bound workflow. Qualified `CoverageFigure.sourceReviews` may establish `approvedTableOnly`, never complete physical tracing. Missing declared regions, unknown requirements, stale hashes, missing drawings, zero occurrences and unresolved rows cannot pass from polygon presence. See [source review](catalog-source-review.md#task-10c-coverage-seam). Synthetic PostgreSQL/HTTP fixtures prove software behavior only, never real catalogue persistence or approval.

Operator transport is documented in [catalog import](catalog-import.md). Actual-backend headed tab-return acceptance and remote deployment remain outside this checkpoint and are not claimed complete.
