# Exploded drawing quality standard

## Source and approval

- Identify the model, variant and serial range, sheet, parts-list revision and hash, and original artwork version, dimensions and hash. A changed source reopens the affected mappings. Use the artwork rectangle for coordinates.
- Bind each physical occurrence ID to exactly one source parts-list row, printed reference and part number within that figure. A reference shared by several components does not identify any one of them. A contour may have multiple polygons and holes. Count the physical ID once. When a single printed reference points to several components, assign their polygons to distinct physical groups in the mapping editor and document each group in the source evidence.
- Record the listed quantity, locations observed in an independent source inspection, and traced component count separately. A label-only location is selectable by its label. A withheld occurrence gets no overlay or component target. Leave printed artwork and source references intact.
- Compare the report with the source on every changed figure. Investigate shortages, excess, occlusions, conflicting print and non-discrete quantities. Preview may show confirmed locations with an explanation. Canonical approval requires a reconciled count and a complete source-current mapping, or a named source decision through the applicable review workflow. A partial depiction with no supported exception stays unpublished until corrected source or an approved representation is available. Parts-list quantity is never padded with invented highlights.
- Use the authenticated mapping and source-review workflow for approval. Record the named reviewer, dated evidence and exact binding and revision checksum. Canonical customer data comes from an immutable release snapshot. Preserve prior releases for rollback. Render’s authenticated FT3 drawings retain their mapping review state. Direct orders use the separately imported supplier price list in `ordering_catalogue_part`, with server pricing and a source revision saved on each order line. Drawing review remains required before publishing a complete mapped catalogue release.

## Browser behavior

- Unselected figures show their ordinary reference labels. Activating a parts row, a label or an outlined component selects the exact same part. Every mapped component lights, one portal label per selected part number lights, and duplicate overlays for that selection are hidden. Clearing selection restores the ordinary labels. A reference-only selection identifies where no component outline is available.
- Verify native pointer, keyboard and touch input, actual mouse-wheel zoom over the image, buttons and limits, scrolling in the table, pan without accidental activation, and fullscreen open, selection and return. Check fit and enlarged views on desktop and phone. Display placement may shift to avoid overlap, with each leader still anchored to the source. Check both label collisions and whether a component can actually be clicked.
- Check the part number transferred into the cart or quote dialog. Use read-only or disposable checkout verification for review figures.

## Verification checklist

1. Run `npx vite-node --config vitest.callouts.config.mts tools/callouts/quantity-coverage.ts --report` for the read-only pilot inventory. It checks the source-bound loader, occurrence IDs and independently audited row, part number, reference and pointer counts. `--require-approval` exits unsuccessfully for this legacy dataset. Canonical release approval uses the API validation and publication workflow. See [mapping review](callout-placement-review.md).
2. Run `npm run test:callout-preview` and `npm run test:api`. Use `RUF_REPOSITORY_MODE=fixture RUF_DEPLOYMENT_ENV=local npm run build` followed by `npx playwright test --config playwright.overlap.config.ts exploded-view-quality.spec.ts`. Run the full overlap configuration before a catalogue release.
3. Deploy the candidate commit to both Render services. Confirm both live commit IDs in the dashboard. Run the sentinel spec against that URL with `RUF_E2E_BASE_URL`, `RUF_E2E_LOGIN` and `RUF_E2E_PASSWORD` set through the test credential store. Use an existing authorized purchaser. The automation captures selected figures after authentication. Record the commit, deploy IDs, browser and viewport, figures, expected and observed counts, selected row and evidence paths. Keep login material out of the report.
4. Block promotion for a wrong part, any missing verified component or extra highlighted label, a blocked input, or a broken fullscreen path. Record unresolved source plates individually and leave them outside catalogue publication. Retest the affected layer after correction. Promote the same tested commit.

| Sentinel | Expected outcome |
| --- | --- |
| Filters 1.1, ref. 3, `56-00007` | Two listed, one depicted and traced on this representative sheet. One badge. |
| Bumper 2.1, ref. 4, `12-210000-12` | Three listed, two depicted and traced. One badge. The preview source note records the absent middle occurrence. Canonical approval still requires a supported named decision. |
| Hydraulic 4.1, ref. 14, `54-00024` | Three listed and traced. One badge. |
| Wheel 5.1, ref. 4, `10-208040-121` | Sixteen listed and traced. One badge. Check that at least one actual bolt remains clickable when enlarged. |
| Cabin 6.15 | Table-only in preview. No image or overlays. |
| Cabin 6.13 | Conflicting printed references. Keep the source plate and withhold overlays pending RUF review. |
| Exhaust 8.4, ref. 15, `32-00035` | The DPF module has one reference label and no selectable component outline. |
