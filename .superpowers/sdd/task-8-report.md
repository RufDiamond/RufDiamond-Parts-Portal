# Task 8 Report: Prove cursor-centred wheel zoom on a real figure

## Changes

- Pointed the existing wheel-anchor browser test at `/figures/fig-filters-1-1` through `DIAGRAM_BASE_URL`.
- Updated `DrawingViewer.tsx` to calculate the wheel anchor from the rendered image rectangle before and after layout.
- Preserved the vertical anchor when the enlarged image is still shorter than the viewport and therefore cannot consume the correction through scrolling.
- Did not change marker coordinates or callout positions.

## Verification

Exact command:

```bash
DIAGRAM_BASE_URL=http://localhost:3217 npm run test:diagram-browser -- --grep "wheel zoom preserves"
```

Initial output before the production fix:

```text
✘  1 tests/browser/diagram.spec.ts:479:5 › wheel zoom preserves the artwork point under the cursor (7.0s)
Expected: < 2
Received:   91.45703125000011
1 failed
```

Output after the fix:

```text
Running 1 test using 1 worker

  ✓  1 tests/browser/diagram.spec.ts:479:5 › wheel zoom preserves the artwork point under the cursor (907ms)

  1 passed (2.7s)
```

## Commit

Message: `Prove wheel zoom stays under the cursor on the Filters figure.`

SHA: `e8f64bb`

Files: `tests/browser/diagram.spec.ts`, `src/components/DrawingViewer.tsx`.

## Concerns

None. Unrelated pre-existing untracked files were left untouched.

## Review follow-up — 18 September 2026

### Changes

- Reduced only the IronHorse rail icon scale from `1.35` to `1.15`; quote and technical remain `1.35`, and Fat Truck remains `1.08`.
- Clamped the wheel-anchor `marginTop` to the available vertical letterbox space and reclamped both offsets on resize.
- Passed `previewNotice` to the full illustration only for `reviewOnly` workspaces.

### Verification

Command:

```bash
DIAGRAM_BASE_URL=http://localhost:3217 npm run test:diagram-browser -- --grep "wheel zoom preserves|Windows:|Filters:"
```

Result: **2 passed, 1 failed**. The Windows and Filters native geometry cases passed. The cursor-centred wheel test failed with `91.45703125000011px` vertical drift because preserving that point requires the negative top margin this review explicitly removes.

Command:

```bash
npm run test:callout-preview -- tests/diagram-selection.test.tsx tests/hosted-marker-review.test.tsx
```

Result: **2 test files passed; 19 tests passed**.
