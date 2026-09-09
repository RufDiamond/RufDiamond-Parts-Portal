# Fat Truck mapping coverage

Measured 9 September 2026. This is the exact legacy/proposal inventory, not a canonical database import or source approval. Reproduce with `npx tsx tools/callouts/mapping-coverage.ts` from the repository root. The command verifies the full legacy source hash and each manifest drawing hash/dimensions and emits every missing occurrence ID/reference.

The source domains are deliberately separate:

- Original workbook: `Database FT3 Wagon - 14-JUL-2026.xlsx`, 70,881 bytes, SHA-256 `3a6a66571058ac238f707fed4421755f9a678e4baff708b452382f439d876599`. Read-only parser dry run: 635 retained rows, 633 valid normalized rows, 45 figure identities, 536 parts; two literal quantity-zero rows remain invalid. It has 44 distinct GROUPNO values: `FT3 WAGON FIG-11.3` names both OVERHEAD CONTROLS and FUSE BOX & FIREWALL. No source rename is inferred.
- Extracted legacy TypeScript: `src/data/ft3-wagon.ts`, SHA-256 `df26ac87cbba1b0a88800d78459c225e93ce37a09e1d693196b1f92a507887c2`. The three review manifests bind to these bytes, not the XLSX hash.
- Current database mapping binding: `catalogueBindingSha256` binds UUIDs and exact model/variant/figure/row/part/occurrence versions plus the PNG. It is neither file hash above.

Totals: 45 figures, 572 legacy callout occurrences, 635 legacy rows, 536 parts, 44 original drawing records. Baseline: 15 positioned labels and 7 Windows legacy masks. The three manifests contain 272 component-linked callout proposals across 40 figures. A proposal may cover only one visible region of a multipart assembly. These counts establish neither full physical coverage nor identity/source approval.

| Figure | Rows | Callouts | Baseline labels | Legacy masks | Component proposals | Missing component references |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1.1 (fig-filters-1-1) | 6 | 6 | 6 | 0 | 0 | 1, 2, 3, 4, 5, 6 |
| 2.1 (fig-frame-assy-2-1) | 9 | 7 | 0 | 0 | 7 | none by presence only |
| 2.2 (fig-frame-assy-2-2) | 17 | 13 | 0 | 0 | 12 | 17 |
| 3.1 (fig-drive-system-3-1) | 7 | 4 | 0 | 0 | 4 | none by presence only |
| 4.1 (fig-hydraulic-4-1) | 26 | 26 | 0 | 0 | 7 | 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26 |
| 4.2 (fig-hydraulic-4-2) | 33 | 33 | 0 | 0 | 7 | 1, 2, 3, 4, 10, 11, 12, 13, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33 |
| 4.3 (fig-hydraulic-4-3) | 10 | 10 | 0 | 0 | 9 | 2 |
| 4.4 (fig-hydraulic-4-4) | 5 | 3 | 0 | 0 | 3 | none by presence only |
| 5.1 (fig-tire-wheel-5-1) | 12 | 7 | 0 | 0 | 7 | none by presence only |
| 5.2 (fig-tire-wheel-5-2) | 10 | 10 | 0 | 0 | 4 | 1, 3, 5, 8, 9, 10 |
| 6.1 (fig-cabin-6-1) | 9 | 9 | 9 | 7 | 0 | 1, 3 |
| 6.2 (fig-cabin-6-2) | 28 | 26 | 0 | 0 | 5 | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14, 15, 16, 17, 18, 20, 21, 24, 25, 26 |
| 6.3 (fig-cabin-6-3) | 4 | 4 | 0 | 0 | 4 | none by presence only |
| 6.4 (fig-cabin-6-4) | 10 | 10 | 0 | 0 | 9 | 7 |
| 6.5 (fig-cabin-6-5) | 10 | 10 | 0 | 0 | 9 | 7 |
| 6.6 (fig-cabin-6-6) | 24 | 22 | 0 | 0 | 5 | 1, 3, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22 |
| 6.7 (fig-cabin-6-7) | 19 | 18 | 0 | 0 | 3 | 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 14, 15, 16, 17, 18 |
| 6.8 (fig-cabin-6-8) | 18 | 17 | 0 | 0 | 5 | 2, 3, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16 |
| 6.9 (fig-cabin-6-9) | 28 | 18 | 0 | 0 | 6 | 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16 |
| 6.10 (fig-cabin-6-10) | 9 | 9 | 0 | 0 | 5 | 5, 6, 7, 9 |
| 6.11 (fig-cabin-6-11) | 13 | 10 | 0 | 0 | 3 | 2, 4, 6, 7, 8, 9, 10 |
| 6.12 (fig-cabin-6-12) | 12 | 12 | 0 | 0 | 5 | 6, 7, 8, 9, 10, 11, 12 |
| 6.13 (fig-cabin-6-13) | 11 | 9 | 0 | 0 | 0 | 1, 2, 3, 4, 5, 6, 7, 8, 9 |
| 6.14 (fig-cabin-6-14) | 12 | 11 | 0 | 0 | 5 | 6, 7, 8, 9, 10, 11 |
| 6.15 (fig-cabin-6-15) | 9 | 0 | 0 | 0 | 0 | NO DRAWING / NO OCCURRENCES |
| 6.16 (fig-cabin-6-16) | 6 | 5 | 0 | 0 | 5 | none by presence only |
| 6.17 (fig-cabin-6-17) | 19 | 18 | 0 | 0 | 8 | 1, 7, 8, 9, 10, 11, 12, 15, 16, 17 |
| 6.18 (fig-cabin-6-18) | 15 | 15 | 0 | 0 | 4 | 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 |
| 7.1 (fig-cowling-fender-7-1) | 34 | 34 | 0 | 0 | 8 | 1, 2, 3, 4, 5, 7, 8, 9, 10, 14, 15, 16, 18, 19, 20, 21, 22, 25, 26, 27, 28, 29, 31, 32, 33, 34 |
| 7.2 (fig-cowling-fender-7-2) | 6 | 6 | 0 | 0 | 3 | 4, 5, 6 |
| 8.1 (fig-engine-8-1) | 14 | 11 | 0 | 0 | 9 | 1, 2 |
| 8.2 (fig-engine-8-2) | 7 | 7 | 0 | 0 | 7 | none by presence only |
| 8.3 (fig-engine-8-3) | 7 | 7 | 0 | 0 | 7 | none by presence only |
| 8.4 (fig-engine-8-4) | 16 | 16 | 0 | 0 | 8 | 1, 7, 10, 11, 12, 13, 15, 16 |
| 8.5 (fig-engine-8-5) | 19 | 18 | 0 | 0 | 7 | 1, 2, 3, 4, 5, 8, 14, 15, 16, 17, 18 |
| 8.6 (fig-engine-8-6) | 25 | 24 | 0 | 0 | 6 | 2, 5, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24 |
| 9.1 (fig-fuel-system-9-1) | 23 | 22 | 0 | 0 | 5 | 3, 4, 5, 7, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22 |
| 10.1 (fig-tire-inflation-10-1) | 14 | 14 | 0 | 0 | 14 | none by presence only |
| 10.2 (fig-tire-inflation-10-2) | 9 | 9 | 0 | 0 | 8 | 2 |
| 11.1 (fig-electric-11-1) | 10 | 9 | 0 | 0 | 9 | none by presence only |
| 11.2 (fig-electric-11-2) | 11 | 8 | 0 | 0 | 7 | 10 |
| 11.3 (fig-electric-11-3) | 18 | 18 | 0 | 0 | 13 | 12, 13, 14, 16, 18 |
| 11.4 (fig-electric-11-4) | 14 | 13 | 0 | 0 | 10 | 3, 4, 8 |
| 11.5 (fig-electric-11-5) | 14 | 11 | 0 | 0 | 10 | 6 |
| 12.1 (fig-accessories-12-1) | 3 | 3 | 0 | 0 | 0 | 1, 2, 4 |

`buildMappingCoverage(figures, callouts, revisions)` uses explicit canonical identities, source hashes, current revision bindings, per-occurrence expected region IDs and unresolved rows. Unknown expected regions remain unknown. A missing region, source conflict, missing drawing, zero-occurrence figure or unresolved table row cannot become complete from a nonempty polygon array. Mapping approval is separate from source approval. Task 10b now accepts explicitly qualified canonical `CoverageFigure.sourceReviews`; its `approvedTableOnly` category is never counted as complete physical tracing. The real legacy inventory still supplies no approvals and reports zero source-approved figures. See [source review](catalog-source-review.md#task-10c-coverage-seam) for exact integration inputs and authority limits.

Safety 6.15 is not vacuous success. Filters 1.1 has labels but no physical masks. Windows 6.1 retains seven existing masks with references 7/9 still unresolved. Existing invalid rings and arbitrary legacy mask paths remain immutable source fallback with explicit import issues; hole conversion and tracing are Task 10c. Task 10b implements attributable table-only/nondepiction/assembly-row interpretation, but does not perform real manufacturer signoff.

No real canonical import or real persisted mapping revision is claimed here. The disposable PostgreSQL test imports a one-row synthetic CSV and proves exactly one unapproved mapping revision after two identical apply requests. The real HTTP/MinIO/clamd test uses another synthetic source and creates null-coordinate draft callouts. These fixtures prove software behavior, never catalogue readiness or customer publication. Original workbook source approval, supported reviewed quantity-zero assembly interpretations, group-number reconciliation, complete physical tracing and actual target catalogue persistence remain gates.

Operator transport and reproducible commands are documented in [catalog import](catalog-import.md). Existing customer releases remain immutable. The actual-backend headed tab-return acceptance and remote deployment gates from Task 9c remain open.
