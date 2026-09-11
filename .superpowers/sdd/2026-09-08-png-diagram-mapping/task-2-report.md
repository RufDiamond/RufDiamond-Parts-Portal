# Task 2 report — focused selection and PNG component activation

Status: implemented and locally verified; ready for controller review.

Base: `dd6473d`. Intended commit: `feat: synchronize diagram component and table selection`.

## Delivered behavior

- `useDiagramSelection` stores one exact figure/figure-part focus and derives the selected part ID through the current row. Printed references are not identity. Unknown/foreign rows resolve to null; changing figure or the workspace source/revision key resets focus. Repeated activation retains focus; Clear selection clears it.
- Number labels, numeric components, table rows/references and fullscreen feed the same row-based callback. Established same-part occurrences and rows highlight together. Checkbox quote collection is independent, including select-all handling of shared parts; cart additions retain the existing quantities/workflow and remain disabled in review.
- `DiagramRegions` renders unselected transparent hit paths and selected fill/outline with even-odd holes, non-scaling strokes, keyboard Enter/Space and accessible pressed state. Different parts overlapping at a pointer require explicit candidate choice by reference and part number. Labels remain above component paths.
- Pan activation waits until movement exceeds 5 CSS pixels. Pointer-up displacement is checked even without a move event; cancellation never activates. A new pointer gesture clears a prior uncaptured gesture. Wheel events still reach the existing shared handler. Source replacement closes stale candidate choosers.
- `CalloutMarker.pressed` separates persistent selection semantics from temporary visual hover; backward-compatible fallback remains for legacy callers.
- The review loader validates converted numeric polygons per occurrence using the reviewed contract implementation, preserves source proposals/legacy masks and passes a source-pinned numeric projection to the renderer. Invalid numeric occurrences stay legacy display-only with a visible warning; valid sibling occurrences remain active. Existing supplied masks are not parsed, replaced or promoted to editable geometry.
- The renderer projection deliberately is not a persistence/approval document. Geometry keeps actual drawing path/hash/dimensions. The geometry validator receives genuine artwork metadata and a server-computed hash of the verified catalogue/figure/drawing/associations, not placeholder hashes.
- Added a narrow `@rufdiamond/contracts/diagram-geometry` export. The prior runtime barrel imports TypeScript sibling modules via `.js`, which Turbopack did not resolve; the narrow export avoids importing unrelated contracts and leaves reviewed geometry logic unchanged.

## Ownership and boundaries

Changed the task-brief files plus controller-approved `src/types/catalog.ts`, `src/data/part-highlight-review.server.ts`, `FullIllustration.tsx`, `CalloutMarker.tsx`, `packages/contracts/package.json`, focused loader tests and test dependencies. No source catalogue or review proposal asset changes; no approval, publication, route gate, API, database or storage change.

Test-only dependencies: `jsdom@30.0.1`, `@testing-library/react@16.3.3`, `@testing-library/user-event@14.6.7`. All are dev dependencies. Lockfile changes are additive dependency entries; existing entries were not upgraded. jsdom 30 requires a compatible modern Node runtime (its package declares Node 22.13+ / 24+).

## TDD evidence

1. Initial `npm run test:callout-preview -- --maxWorkers=1`: existing 78 tests passed, new region tests failed because the numeric layer did not exist, and the new selection suite could not resolve the not-yet-created selection module. This established missing interfaces/functionality before implementation.
2. Numeric loader tests failed with `expected undefined to match object` for converted source coordinates and missing valid-sibling numeric regions. Implemented numeric conversion/validation while preserving the original paths and production review gate; both then passed.
3. Mounted hover regression failed `expected 'true' to be 'false'` before the separate pressed prop. Pointer-up-without-move regression activated a row before the displacement check. Both passed after their fixes.
4. Duplicate-fill regression failed `expected ... to have a length of 1 but got 2`; numeric occurrences now replace their own compatibility paint layer at render time, without deleting legacy data.
5. Uncaptured-gesture regression failed to activate the subsequent label; resetting the prior gesture at pointer-down capture fixed it.
6. Source replacement regression retained the old overlap chooser before source-document reset; the chooser now closes on document handoff.

The mounted suites use the real FigureWorkspace, MachineProvider, RequestProvider, PartsTable and DrawingViewer. Only Next navigation is mocked at its framework boundary. Pointer tests dispatch coordinate-carrying DOM events because jsdom does not implement native PointerEvent capture/layout; they do not establish browser-native behavior by themselves. Keyboard tests also use user-event on real mounted controls.

## Final verification

```text
npm run test:callout-preview -- --maxWorkers=1
Test Files  9 passed (9)
Tests       92 passed (92)
exit 0

npm run test:contracts -- --maxWorkers=1
Test Files  4 passed (4)
Tests       73 passed (73)
exit 0
```

The contracts root script did not forward `--maxWorkers` to its nested npm test (npm warned about that CLI option); the actual full contracts suite still ran and passed.

`npm run lint`, `npx tsc --noEmit`, `npm run build` and `git diff --check` passed. Production build compiled with Next 16.3.0/Turbopack and included both ordinary and review figure routes. The original runtime failure was caught by the controller's existing browser after HMR; the subsequent narrow-export production build and existing local `http://127.0.0.1:3100/review/figures/fig-hydraulic-4-4` HTTP 200 check passed. No servers were restarted.

## Controller-verified native browser evidence

These checks were performed by the controller on the existing local port 3100 browser, not by the mounted DOM suite and not on a deployment:

- Hydraulic 4.4: physical Component 1 click shaded the pump and focused row 1. Native wheel up/down enlarged/restored the image with aligned overlay. Table row 2 description click replaced focus with fitting 2 and removed pump shading.
- Hydraulic 4.4 fullscreen component click and wheel interaction passed, retaining review context.
- Windows 6.1: reference 2 table click painted the existing pink side-window mask and focused row 2. Reference 1 and 3 have null baseline masks; reference 1's white windshield is an existing content gap, not a regression. Existing masks are refs 2, 4, 5, 6, 7, 8 and 9. Mounted legacy tests explicitly activate a mask-bearing Windows occurrence and also verify Filters.

## Self-review and remaining scope

Reviewed identity derivation, independent quote state, numeric/legacy coexistence, source replacement, pan/cancel boundaries, keyboard and native runtime imports. Added regressions for defects found during this review. The only remaining native geometry/gesture breadth is the larger browser coverage plan; this slice does not claim every mapped figure, polygon hole or overlap chooser was exercised in a real browser.

The `SelectionOrigin` callback argument is accepted but intentionally not persisted by this task's hook. Task 3 can expose origin/sequence for exact-row scroll and diagram reveal without adding a second selection state. Row scroll/pinning and viewport reveal are not implemented in this task.

Mapping coverage remains partial. Controller preflight identified five invalid old numeric contours across four figures; this task withholds their component hit targets and preserves their display-only paths for later source review. It does not retrace contours, approve sources, finish untraced components, publish a release, push a branch, deploy staging/production, or establish database persistence.
