# Remaining Callout Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user exercise the remaining unambiguous exploded-drawing markers locally, with the same part selection as Windows and Filters, and provide an updated functionality video.

**Architecture:** Apply a non-mutating, development-only overlay at the figure server-page boundary. Read the existing version-bound proposals only when explicitly enabled; do not write them into the catalogue or change publication state. Reuse the existing drawing viewer and part-selection hook and clearly label all proposed positions as unapproved.

**Tech Stack:** Existing Next.js 16.3.0, React 19, TypeScript, Node crypto/filesystem, installed Vitest; browser skill and local ffmpeg for demo capture. No dependencies added.

**Spec:** `docs/callout-placement-review.md` plus the user's September 7 approval to implement the proposed local-demo approach and record the other drawings. This is not RUF Diamond catalogue sign-off.

## Global Constraints

- Do not edit `src/data/ft3-wagon.ts`, the source artwork, proposal coordinates, approval records, or publication state.
- Only enable the overlay when `NODE_ENV === "development"` AND `RUF_CALLOUT_PREVIEW === "1"`; use a loopback-bound dev server.
- Production and ordinary development return original figure details and no preview banner. Do not use a `NEXT_PUBLIC_` flag.
- Keep customer release publishing requirements intact: unapproved/unmapped/unplaced data must not reach customer releases; Xero stays deferred.
- Coordinates are percentages, 0–100, finite; masks are optional. Existing Windows and Filters coordinates and masks remain unchanged.
- Never invent part associations, missing numerals, or duplicate occurrences. Withhold ALL new markers on Frame 2.1 (wrong artwork) and Cabin 6.13 (conflicting source labels).
- On other figures, use a proposed number only when exactly one proposal and exactly one imported callout have that number and the callout resolves to a row in that same figure. Source-only numbers, missing labels and ambiguous duplicates remain unmapped.
- Validate the proposal catalogue hash and current drawing hash/path/dimensions before applying positions. A stale source fails closed with a visible explanation, not guessed placement.
- No installation, framework migration, backend changes, deployment, merge, or push in this scope.

---

### Task 1: Version-bound local preview and visible integration

**Files:**
- Create: `src/lib/callout-preview.ts` — pure association and coordinate checks.
- Create: `src/data/callout-preview.server.ts` — environment gate, source integrity, loading.
- Create: `tests/callout-preview.test.ts` — behavior tests using real repository data plus independent fixtures.
- Create: `vitest.callouts.config.mts` — root alias and this focused test only.
- Modify: `src/app/(portal)/figures/[figureId]/page.tsx` — call loader after repository fetch.
- Modify: `src/app/(portal)/figures/[figureId]/FigureWorkspace.tsx` — optional preview notice above toolbar, outside drawing.
- Modify: `src/app/(portal)/figures/[figureId]/figure.module.css` — readable compact notice without covering plate.
- Modify: `package.json` — add `test:callout-preview` using installed Vitest.
- Modify: `docs/callout-placement-review.md`, `tools/callouts/README.md` — explain opt-in local preview, unchanged seed and remaining approval gate.

**Interfaces:**
- Consumes: `getFigureDetail(figureId: string): Promise<FigureDetail | null>`; `FigureDetail.callouts: Callout[]`; `FigureDetail.rows: FigurePartRow[]`.
- Produces:

```ts
export interface PreviewMarker { number: number; x: number; y: number }
export interface PreviewFigure {
  figureId: string;
  drawingPath: string;
  sha256: string;
  width: number;
  height: number;
  markers: PreviewMarker[];
  notes: string;
}
export interface CalloutPreview {
  detail: FigureDetail;
  notice: string | null;
}
export function applyCalloutPreview(detail: FigureDetail, proposal: PreviewFigure): CalloutPreview;
export function loadCalloutPreview(detail: FigureDetail): Promise<CalloutPreview>;
```

- `applyCalloutPreview` never mutates arguments. It receives only a source-validated proposal from the loader; it independently checks figure identity, existing placement, count uniqueness, row association and coordinate bounds.
- `loadCalloutPreview` reads the real server environment; no UI-exposed argument can enable it. Return `{detail, notice: null}` before accessing review files if disabled. Handle absent proposal/drawing or source mismatch by preserving original detail and explaining why preview is unavailable. Handle unexpected file errors with a generic visible failure notice and a server diagnostic, without leaking filesystem details to the browser.

- [x] **Step 1: Establish clean baseline.** Run existing test runners (not pytest):

```sh
/Users/athifshaffy/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 tools/callouts/run_tests.py test_review
npx tsc --noEmit
npm run lint
```

- [ ] **Step 2: Write and run failing behavior tests.** Use the installed Vitest with the root alias:

```ts
// vitest.callouts.config.mts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['tests/callout-preview.test.ts'] },
});
```

Start with real Cabin 6.2, currently unplaced. The observable break is the absence of renderable markers:

```ts
const detail = await getFigureDetail('fig-cabin-6-2');
expect(detail).not.toBeNull();
const before = structuredClone(detail!);
const result = applyCalloutPreview(detail!, {
  figureId: 'fig-cabin-6-2', drawingPath: '', sha256: '',
  width: 1280, height: 720, notes: '',
  markers: [{ number: 1, x: 20, y: 30 }],
});
expect(buildDrawingMarkers(result.detail.rows, result.detail.callouts))
  .toEqual([expect.objectContaining({ number: 1, x: 20, y: 30 })]);
expect(detail).toEqual(before);
expect(result.notice).toContain('unapproved');
```

Use explicit fixtures and assertions for: production flag-on stays unchanged; development flag-off unchanged; development flag-on adds real proposal positions; oracle deep equality; missing and extra numbers excluded; duplicate proposals and duplicate imported numbers excluded; null/missing/cross-figure association excluded; NaN/infinity/out-of-range coordinates excluded; wrong proposal figure excluded; both blocked source-conflict figures unchanged; positioned occurrences never overwritten; source hash/dimensions/path mismatch unchanged with a notice. Isolate any environment mutation with `vi.stubEnv`/`vi.unstubAllEnvs`; never write source files in tests. Loader-integrity tests may use a narrow filesystem read spy to return altered source bytes, restoring it afterward.

Also exercise the actual `buildDrawingMarkers` with two legitimate callouts sharing one figurePartId and distinct occurrence IDs; assert both retain the same partId and separate positions. Do not conflate conflicting printed numbers with legitimate multi-occurrence data.

Run `node_modules/.bin/vitest run --config vitest.callouts.config.mts`. First establish the RED failure, then implement; record exact evidence in the task report.

Evidence caveat: the initial run failed during module collection with zero tests
collected, so it did not establish the planned failing behavioral assertion and
this checkbox remains open. The later Turbopack root-resolution regression and
the final-review fullscreen-notice correction each have genuine collected
RED/GREEN evidence; neither retroactively changes the initial result.

- [x] **Step 3: Implement filtering and integrity checks.** Pure adapter algorithm:

```ts
const blocked = new Set(['fig-frame-assy-2-1', 'fig-cabin-6-13']);
// Return unchanged with an explanatory preview notice if identity mismatches
// or blocked contains detail.figure.id.
// For each imported callout, preserve existing coordinates/mask verbatim.
// For unplaced callouts: count proposals and imported callouts for its number;
// require both counts === 1, finite 0..100 coordinates, and a same-figure row
// whose figurePart.id equals figurePartId and whose part.id equals partId.
// Copy only x/y into a new callout; no extra callout is manufactured.
// Return a new detail object and notice including applied/unresolved counts.
```

Server loader reads `tools/callouts/review/proposals.json` as server-only evidence. Check schemaVersion 1, global NOT_FOR_CUSTOMER_USE status, null reviewer, matching catalogue SHA-256, exact `public${detail.drawing.storagePath}` path, drawing dimensions and SHA-256. Resolve only the matched repository drawing path, never a browser-supplied arbitrary path. Read catalogue and artwork on each enabled load so replacing either cannot reuse stale validation. Parse and validate the selected proposal shape before use. The disabled path must not read or transmit proposals.

- [x] **Step 4: Connect server result to existing viewer.**

```tsx
// page.tsx after detail is fetched and checked
const preview = await loadCalloutPreview(detail);
// FigureWorkspace props:
detail={preview.detail}
previewNotice={preview.notice}
```

```tsx
// FigureWorkspaceProps: previewNotice?: string | null;
// Destructure with default null; directly after Trail, before toolbar:
{previewNotice ? <p role="status" className={styles.previewNotice}>{previewNotice}</p> : null}
```

Banner must say “Local preview — unapproved marker positions; not for ordering.” Show source conflict/unresolved explanations without covering the drawing. Reuse existing marker/table selection, hover, zoom, full illustration and cart semantics without changing handlers. No red silhouette promise: most plates have no masks.

- [x] **Step 5: Verify all plates and document counts.** Test all 44 proposals against the real repository through the enabled loader. Assert excluded figures have no new markers, oracles unchanged, every accepted occurrence resolves to a part and is in bounds, original callouts unchanged, and there are new positions in every other figure with usable proposals. Report exact eligible/partial/withheld counts, not “all fixed”. Run focused tests, TypeScript, lint and existing review tests. Document local enable command and production-off behavior.

```sh
RUF_CALLOUT_PREVIEW=1 npm run dev -- --port 3100 --hostname 127.0.0.1
node_modules/.bin/vitest run --config vitest.callouts.config.mts
npx tsc --noEmit
npm run lint
```

- [x] **Step 6: Commit only scoped source/tests/docs after self-review.** Stage the exact file list above; preserve existing untracked dependencies, media and temporary artifacts. Report commit, RED/GREEN evidence, counts and limitations for independent review. No push.

Final-review correction:

- [x] Preserve the optional preview status in the full-illustration header and
  omit it when preview is off, with a collected render-test RED/GREEN cycle.
- [x] Make the existing Zoom in/full-illustration enlargement path explicit
  without moving coordinates, shrinking targets, or inventing viewer behavior.
- [x] Clarify that proposals are runtime-read only by the gated local preview,
  while dense fit-view marker overlap remains an honest limitation.

### Task 2: Browser verification and updated video

**Files:**
- Create local artifact: `output/video/rufdiamond-remaining-callouts-demo-2026-09-07.mp4`.
- Modify: `docs/callout-placement-review.md` — append verified browser results and remaining source limitations.

**Interfaces:**
- Consumes Task 1's development-only preview and the existing browser controls. Output is a playable local MP4 and an evidence-backed summary, not a customer release.

- [x] **Step 1: Run preview.** Stop only this task's known loopback development session, restart using the enabled command above, verify HTTP 200 and visible preview banner. Never stop the unrelated SSH process on port 3000.
- [x] **Step 2: Exercise new figures.** Navigate Cabin 6.2, Hydraulic 4.4, Engine 8.2, and a larger Cowling drawing. On each click a visible numbered marker and confirm corresponding row selected; click its row/ref again to clear and select, confirm marker follows. Exercise zoom and full illustration. Verify Frame 2.1 and Cabin 6.13 show withheld warnings, not guessed markers. Recheck Windows/Filters regression. Use fresh browser accessibility evidence before actions.
- [x] **Step 3: Capture actual interactions.** Prefer continuous recording if the browser surface supports it; otherwise capture genuine before/after UI states and label the video “Step-by-step UI captures”. Include multiple newly mapped sections, marker-to-row, row-to-marker, zoom/full illustration and remaining withheld examples. Do not submit an order or imply this is production-ready.
- [x] **Step 4: Encode and inspect.** Preserve original UI screenshots; compose captions outside them. Use local ffmpeg to encode H.264/yuv420p MP4. Check duration/codec with ffprobe, decode the whole file with ffmpeg, and visually inspect beginning/middle/end. Keep video untracked and link it in the user-facing result.
- [ ] **Step 5: Review and handoff.** Record actual results in the review document, independently review the complete scoped change, commit documentation, and provide the video plus exact remaining limitations. Keep the local preview running. Do not merge, push or deploy.
