# Fat Truck PNG Diagram Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make mapped Fat Truck components clickable and maintainable through a secure polygon editor, with database persistence and approved immutable customer releases.

**Architecture:** Extend the existing PNG/SVG viewer with portable numeric geometry and one focused row identity. Add an authenticated Fastify mapping module with append-only PostgreSQL revisions, then integrate private PNG delivery and release snapshots. Treat remaining catalogue tracing as separate measured work, never as automatic completion of the editor.

**Tech Stack:** Existing Next.js 16.3.0, React 19.2.8, TypeScript, TypeBox, Fastify 5, Drizzle, PostgreSQL, private S3-compatible object storage, Vitest and browser tests.

**Spec:** `docs/superpowers/specs/2026-09-08-png-diagram-mapping-design.md` (approved by user after commit `d987ead`).

## Global Constraints

- A flat PNG remains unchanged.
- Keep this framework for this work; do not combine the feature with the separately approved future Vite migration.
- Multiple established occurrences highlight together.
- No stage may silently fall back to local storage after a backend save failure.
- Keep `quotePartIds` as a separate checkbox collection, not a second diagram selection.
- Customer responses resolve a single active immutable release; editing is not publishing.
- No runtime OCR, automatic mapping approval, guessed associations or Xero integration.
- Mapping request limits: 1 MiB, 1,000 occurrences, 32 regions per occurrence, 512 vertices per ring, 16 holes per region, 20,000 vertices per document.
- PNG limits: 20 MiB, 40 million decoded pixels, 16,384 pixels per side; upload intents 15 minutes, read URLs 5 minutes, quarantine retention 24 hours.
- Preserve unrelated work, secrets, old masks and immutable releases. Never push `.env` files, local outputs or `node_modules`.

## Execution and dependencies

Already in linked worktree `645c`, branch `codex/latest-frontend-integration`; verify this before changes. Read `AGENTS.md` and installed Next server/client and route-handler guides before frontend edits. No application changes were made during planning. The user already chose task-by-task delegated execution: no repeat workflow-choice question is needed.

Each task follows red test → minimal implementation → green test → spec review → quality review → commit. Do not let a successful mocked service test stand in for PostgreSQL or browser verification. Only parallelize disjoint tasks after their shared interfaces are committed. A failed service prerequisite blocks its dependent stage, not unrelated viewer work.

Dependency order: 1 → 2 → 3; 1 → 4 → 5; 1+5 → 6; 4+5 → 7; 4+5+7 → 8; 6+7+8 → 9; 1+5 → 10; all → 11. Tasks 2–3 produce an independently testable review viewer while 4–9 build persistence and secure integration. Task 10 is the full-catalogue content workflow, not an assumption that all drawings can be inferred.

## File ownership and module contracts

- `packages/contracts/src/diagram-mapping.ts`: serializable TypeBox schemas/types from spec §5, plus envelopes below; export from `index.ts`.
- `packages/contracts/src/diagram-geometry.ts`: pure geometry validation/conversion/hit-testing; no Node, React, database or image processing dependencies.
- `src/state/useDiagramSelection.ts`: focused selection separate from quote checkboxes.
- `src/components/DiagramRegions.tsx`: component hit regions and highlight SVG; `src/lib/diagram-viewport.ts`: coordinate/reveal calculations.
- `src/features/diagram-mapping/`: editor reducer, canvas, inspector, authenticated API client; no catalogue seed mutations.
- `apps/api/src/modules/diagram-mapping/`: binding hash, repository, service, routes; no raw SVG acceptance.
- `apps/api/src/modules/drawings/`: validated private object lifecycle/delivery.
- `apps/api/src/modules/publication/` and `modules/catalog/`: missing snapshot publication/read prerequisites, not fictitious pre-existing endpoints.
- `apps/api/src/db/schema/diagram-mapping.ts`: working revision tables; release addition in `releases.ts`.

Shared envelopes (schema names are identical with `Schema` suffix; `Static` provides TS types):

```ts
type MappingIssue = { path: string; code: string; message: string };
type MappingRevision = {
  revisionId: string; version: number; checksum: string;
  document: DiagramMappingDocument;
  approval: { reviewerId: string; reviewedAt: string } | null;
};
type MappingSaveInput = { document: DiagramMappingDocument };
type MappingApproveInput = { revisionId: string; checksum: string };
type MappingWriteContext = {
  figureId: string; expectedVersion: number; idempotencyKey: string;
};
```

The first GET on a figure returns an empty draft document and version 1. Creating
the coordination head during GET is forbidden: create it with the working figure
or initialize existing heads in the additive migration. Null current revision is
represented by a distinct envelope `{ version: 1, revision: null, document }`;
subsequent GET is `{ version, revision: MappingRevision, document }`. Define
`MappingEditorDocument` as that consistent object with nullable `revision`.
`document` is always server-source-bound. PUT/approve return `MappingRevision`.

Backend service constructor receives existing `Database`, clock and audit/outbox
dependencies. Request authentication uses `identitySession`/`sessionUser`, never
an actor ID supplied by the browser. Routes translate current session authorization
to `AuthorizationContext`; use existing policy, scope SQL and CSRF conventions.

---

### Task 1: Portable mapping schemas and geometry

**Files:** Create `packages/contracts/src/diagram-mapping.ts`, `diagram-geometry.ts`, `diagram-mapping.test.ts`, `diagram-geometry.test.ts`; modify `packages/contracts/src/index.ts`.

**Interfaces:** Consumes spec §5 definitions. Produces all shared types above and:

```ts
validateMappingGeometry(document: DiagramMappingDocument): MappingIssue[];
percentagePoint(point: ImagePoint, width: number, height: number): ImagePoint;
regionPath(region: ComponentRegion): string;
pointInRegion(point: ImagePoint, region: ComponentRegion): boolean;
```

- [ ] Add failing conversion, hole-hit and malformed-document tests. Construct fixtures inline; string IDs are opaque here, route/database IDs are UUID-validated at the API boundary.

```ts
expect(percentagePoint([25, 50], 1200, 800)).toEqual([300, 400]);
const region: ComponentRegion = {
  id: 'region-1', outer: [[0,0],[100,0],[100,100],[0,100]],
  holes: [[[20,20],[40,20],[40,40],[20,40]]],
};
expect(pointInRegion([10,10], region)).toBe(true);
expect(pointInRegion([30,30], region)).toBe(false);
expect(regionPath(region)).not.toMatch(/[<>"']/);
```

- [ ] Run `npm run test:contracts -- diagram-geometry.test.ts diagram-mapping.test.ts`; verify missing exports fail before implementation.
- [ ] Implement strict TypeBox objects with `additionalProperties: false`. Implement finite/bounds/count checks before segment intersections. Use orientation/segment intersection and even-odd ray casting; reject self-intersections, touching/crossing holes, holes outside outer ring, repeated adjacent points, degenerate area and nonfinite coordinates. Treat polygon boundary as a hit, hole boundary as excluded. Reject negative/zero/noninteger image dimensions. Collect field-addressed issues, not exceptions for ordinary invalid geometry.

```ts
export function percentagePoint([x,y]: ImagePoint, w: number, h: number): ImagePoint {
  return [x * w / 100, y * h / 100];
}
// Serialization runs only on validated numeric rings.
const ringPath = (ring: ImagePoint[]) =>
  ring.map(([x,y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ') + ' Z';
export const regionPath = (r: ComponentRegion) =>
  [r.outer, ...r.holes].map(ringPath).join(' ');
```

- [ ] Add tests for bow-tie, collinear ring, nested/crossing holes, NaN, Infinity, out-of-image points, duplicate occurrence/region IDs, every size limit and repeatable path output. Schema rejects unknown properties and markup fields. Draft null associations/labels/empty regions remain valid; approval completeness is a later service rule.
- [ ] Run contracts suite and TypeScript; review exports usable without Node builtins in browser.
- [ ] Commit only these files: `feat: add portable diagram mapping geometry contracts`.

### Task 2: One focused selection and component activation

**Files:** Create `src/state/useDiagramSelection.ts`, `src/components/DiagramRegions.tsx`, `tests/diagram-selection.test.tsx`, `tests/diagram-regions.test.tsx`; modify `src/components/DrawingViewer.tsx`, `DrawingViewer.module.css`, `PartsTable.tsx`, `src/lib/drawing.ts`, `src/app/(portal)/figures/[figureId]/FigureWorkspace.tsx`, `vitest.callouts.config.mts`.

**Interfaces:** Consumes geometry contracts. Hook returns `selection: DiagramSelection`, `selectPart: SelectDiagramPart`, `clear(): void`, and derived `selectedPartIds: ReadonlySet<string>`. Viewer region targets carry `figurePartId`, `calloutId`, `partId` and numeric geometry; legacy masks remain a separate display-only compatibility path. `DiagramRegions` takes `document`, `selectedPartIds`, `onSelect(figurePartId)` and image dimensions.

- [ ] Write failing tests around pure `resolveDiagramSelection(figureId, figurePartId, rows)` exported by the hook module: same reference text on two unrelated row IDs does not conflate; same established part across two rows highlights both; unknown row yields null. Add mounted interaction tests using existing test tooling, adding a DOM test dependency only if necessary and recorded in this task.

```ts
expect(resolveDiagramSelection('f', 'row-a', rows)?.figurePartId).toBe('row-a');
// rows contains row-a/part-a and row-b/part-b, both printed ref 13.
expect(resolveDiagramSelection('f', 'missing', rows)).toBeNull();
```

- [ ] Run `npm run test:callout-preview -- --maxWorkers=1`; confirm new tests fail on missing selection/component functionality.
- [ ] Replace focused set toggling in FigureWorkspace with this hook; keep independent quote checkbox state and existing `addParts` workflow. Change label/row/component callbacks together, including fullscreen. Repeated activation keeps focus, Clear selection clears it. Preserve hover as temporary state and reset focus on figure/release changes.

```tsx
<path d={regionPath(region)} fillRule="evenodd" tabIndex={0}
  role="button" aria-label={label} aria-pressed={selected}
  onKeyDown={e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); onSelect(figurePartId);
    }
  }} />
```

- [ ] Render transparent hit paths for unselected mapped components; use fill plus non-scaling outline for selected regions. Add label-first layering and overlap chooser for distinct mapped parts; numerical mapping order is not a tie-break. Preserve hole exclusion. Separate pan initiation from activation with 5 CSS-pixel movement threshold; pointercancel never selects. Native wheel must still reach the shared handler.
- [ ] Tests cover all three input origins, quote persistence, repeated occurrences, keyboard, overlap chooser, pan vs click, hover-away persistence, and legacy Windows/Filters rendering. Run focused suite/lint/TypeScript, then commit `feat: synchronize diagram component and table selection`.

### Task 3: Row reveal, viewport reveal and browser regression gate

**Files:** Create `src/lib/diagram-viewport.ts`, `tests/diagram-viewport.test.ts`, `tests/diagram-table-reveal.test.tsx`; modify `PartsTable.tsx`, `PartsTable.module.css`, `DrawingViewer.tsx`, `FullIllustration.tsx`, `FigureWorkspace.tsx`, `vitest.callouts.config.mts`.

**Interfaces:** `revealDelta(target: {left:number;top:number;right:number;bottom:number}, viewport: same): {x:number;y:number}` gives minimum scroll delta. `selectedFigurePartId`/selection origin flow from Task 2, never a separate table selection.

- [ ] Write red tests for an already-visible target, each outside edge and union larger than viewport:

```ts
expect(revealDelta({left:20,top:150,right:40,bottom:170},
  {left:0,top:0,right:100,bottom:100})).toEqual({x:0,y:70});
```

- [ ] Run focused suite; confirm failure. Implement nearest-edge table scroll in its own container. Pin one selected row when hidden by filters, retaining filters and displaying the exact spec message. Do not duplicate an already visible selected row.
- [ ] Implement selected-region union reveal, preserving zoom when possible and fitting only when necessary. Add “Show selected part” to normal/fullscreen controls; respect reduced motion and never reveal on hover. Matrix conversion for pointer coordinates uses SVG `getScreenCTM().inverse()` on live elements, not persisted browser pixel offsets.
- [ ] Run tests and real browser input against Windows, Filters, corrected bumper, a tall plate and Hydraulic 4.4. Capture rectangle equality within one CSS pixel at fit/zoom/fullscreen/resize, both wheel directions over each target type, outside table scroll, clicking after drag cancellation and row reveal with active filter. Commit `feat: reveal selected diagram parts and table rows` only after browser evidence; no all-figure assertion.

### Task 4: Additive revision and snapshot schema

**Files:** Create `apps/api/src/db/schema/diagram-mapping.ts`, `apps/api/test/diagram-mapping-schema.test.ts`; modify schema `index.ts`, `releases.ts`; generate next migration and journal/snapshot metadata (inspect latest number before generating; baseline ends at `0007_snapshot_trigger_hardening.sql`).

**Interfaces:** Export `diagramMapping`, `diagramMappingRevision`, `diagramMappingApproval`, `releaseDiagramMapping` following spec table definitions. Repository uses existing `Database`/`Transaction` from `db/client.ts`.

- [ ] Add Testcontainers migration tests asserting tables and head/revision same-owner constraints. Use existing `apps/api/test` PostgreSQL harness; each test creates its own fixture transaction. Verify migration on empty database and database with existing releases.

```sql
SELECT count(*) FROM information_schema.tables
WHERE table_name IN ('diagram_mapping','diagram_mapping_revision',
 'diagram_mapping_approval','release_diagram_mapping');
-- Expect 4 after migration and 0 at the red stage.
```

- [ ] Run `npm run test:api -- diagram-mapping-schema.test.ts`, observe absent tables.
- [ ] Add Drizzle definitions: head UUID/figure unique/version/current revision; revision head/revision unique, document JSONB, hashes/dimensions/drawing and actor FKs; approval unique revision/checksum/reviewer/time; release table composite release/figure and release/drawing FKs. Add composite uniqueness needed to reject head pointing to another head's revision. Add enum/type/checksum/positive checks, append-only triggers and existing release immutability protection.
- [ ] Backfill only empty coordination heads for existing figures, not masks or approvals. Add head creation to working-figure creation in the later catalogue prerequisite. Do not alter old snapshot data.
- [ ] Run full migration tests including delete/update rejection for revisions, cross-release FK rejection and existing release readability. Review generated SQL before running anywhere except isolated test DB. Commit `feat: persist versioned diagram mapping revisions`.

### Task 5: Scoped mapping read/save/review API

**Files:** Create `apps/api/src/modules/diagram-mapping/binding.ts`, `repository.ts`, `service.ts`, `routes.ts`, `apps/api/test/diagram-mapping-api.test.ts`; modify `app.ts`, `plugins/error-handler.ts` and contracts envelopes from Task 1 as needed without changing names.

**Interfaces:** `createMappingService(database, now)` returns `read(ctx, figureId): Promise<MappingEditorDocument>`, `save(ctx, write: MappingWriteContext, input: MappingSaveInput): Promise<MappingRevision>`, `approve(ctx, write, input: MappingApproveInput): Promise<MappingRevision>`; `ctx` is existing `AuthorizationContext` plus request ID for audit. `catalogueBindingSha256` uses existing `canonicalJsonHash`, sorted source identities and versions under transaction.

- [ ] Register red Fastify injection tests for all three spec routes: anonymous 401, forbidden 403, out-of-scope 404, initial document, successful save, missing precondition 428, stale 412, bad geometry 422 and replay.

```ts
const response = await app.inject({method:'GET',
  url:`/api/v1/admin/figures/${figureId}/diagram-mapping`});
expect(response.statusCode).toBe(401);
expect(response.headers['content-type']).toContain('application/problem+json');
```

- [ ] Run API file red. Implement route schemas, CSRF and current authorization before scoped figure lookup. Require `publish.draft.view` and `catalog.figure.view` for read; geometry management capability for save; additional mapping capability on association changes; approval requires named publisher plus mapping capabilities. All IDs inside document must match the authoritative scoped figure graph.
- [ ] Implement head row lock/CAS, binding checks and strict numeric validation. In one transaction run scoped `withIdempotency`, insert revision, update head and write existing audit/outbox repositories. Include expected version and path/figure in idempotency hash; replay checks current authorization but returns original successful result before rejecting obsolete head version. Never allow client approval fields or hashes to substitute for computed values.

```sql
UPDATE diagram_mapping SET current_revision_id = $1, version = version + 1
WHERE id = $2 AND version = $3 RETURNING version;
-- Zero rows -> AppError('STALE_MAPPING', 412, safe message).
```

- [ ] Add specific 412/413/428 problem titles and correct Fastify body-too-large from 400 to 413 with regression tests; retain other malformed-body status behavior. Map issue paths to region/occurrence identifiers.
- [ ] Integration tests: two concurrent writers exactly one revision committed; rollback audit/outbox on failure; stale PNG/row binding; disabled user; map-vs-manage separation; current revision completeness required for approval; old approval never approves new save. Run API/contracts tests and commit `feat: expose secure diagram mapping revision API`.

### Task 6: Polygon editor and persistent save UX

**Files:** Create `src/features/diagram-mapping/editor-state.ts`, `MappingCanvas.tsx`, `MappingInspector.tsx`, `MappingEditor.tsx`, `api-client.ts`, `mapping-editor.module.css`, `src/app/admin/figures/[figureId]/mapping/page.tsx`, `tests/mapping-editor-state.test.ts`, `tests/mapping-editor.test.tsx`; modify test config and authenticated navigation only after access checks exist.

**Interfaces:** `MappingEditor` consumes `MappingEditorDocument`; API client exposes `loadMapping(figureId, signal)`, `saveMapping(figureId, version, document, key, signal)`, `approveMapping(figureId, version, revisionId, checksum, key, signal)` returning Task 1 envelopes. `editorReducer(state, action)` returns immutable state, with undo/redo of geometry operations only. State includes tool, selected occurrence/region, open ring, document, history/future, dirty, save status and field issues.

- [ ] Red reducer tests cover add/close/cancel ring, vertex move/removal, add hole/region, delete/redraw, undo/redo, save-success checkpoint, failed-save preservation and stale response exclusion. UI tests verify shape actions do not mutate source image URL or source document object.

```ts
const next = editorReducer(state, {type:'saveFailed', message:'Network unavailable'});
expect(next.document).toEqual(state.document);
expect(next.dirty).toBe(true);
expect(next.saveStatus).toBe('error');
```

- [ ] Run frontend suite red. Implement explicit tools and keyboard behavior from spec §8 using geometry validator before ring commit. Vertices use original-image coordinates. Warn on invalid shapes and preserve open-ring edits; never silently drop data on tool change.
- [ ] Build inspector selecting exact occurrence plus part identity, with label rectangle and multiple component polygons. Show unresolved source warnings and completeness; no “approve all” shortcut. Keep PNG selection separate from upload finalization (Task 7).
- [ ] Connect secure API with same-origin session cookies/CSRF and version/idempotency headers. Track pending save token so a slow successful save does not erase edits made after the request started. Keep document in memory on failure; explicit reload/reconcile on 409/412. Warn before leaving unsaved state. Do not use localStorage, client DB keys or public review route for editing.
- [ ] Test save/reload against actual Fastify/PostgreSQL, denied access, session expiration, conflict, undo after save, and keyboard controls. Keep route unavailable if authenticated API/config is absent. Commit `feat: add authenticated PNG polygon mapping editor`.

### Task 7: Private PNG upload, attachment and delivery prerequisite

**Files:** Create `apps/api/src/modules/drawings/storage.ts`, `s3-storage.ts`, `validation.ts`, `service.ts`, `routes.ts`, `apps/api/test/drawing-upload.test.ts`, `apps/api/src/db/schema/drawing-upload.ts`; modify schema index, `app.ts`, config, API package, lockfile, migrations, editor upload controls and `infra/compose.yaml` for isolated test storage only.

**Interfaces:** `DrawingStorage` provides `createUpload(key, expiresInSeconds)`, `inspect(key, versionId?)`, `read(key, versionId?)`, `createDownload(key, versionId, expiresInSeconds)`, `deleteQuarantine(key)`; return metadata includes immutable object version. Scanner `scan(bytes): Promise<'clean'|'infected'|'unavailable'>`; unavailable fails closed. Use S3-compatible SDK plus a bounded PNG decoder; add dependencies only during this task, with recorded versions. Use existing provider settings pattern, not browser credentials.

- [ ] Red API/storage tests for intent/finalize/delivery routes from spec. Create upload-intent table with actor, figure, key, expected hash/bytes, expiry, state, expected figure version and finalized drawing ID. No user-provided object keys.

```ts
expect((await app.inject({method:'POST',url:finalizeUrl,
  headers:editorHeaders,payload:{}})).statusCode).toBe(422);
// Fixture object has PNG signature but its declared hash differs from bytes.
expect(await currentDrawingId(figureId)).toBe(previousDrawingId);
```

- [ ] Run API tests red. Implement 20 MiB/40M pixel/16,384 side limits with stream/decode bounds, PNG signature/hash/dimensions verification and scanner; reject forged MIME and malformed/truncated data before attaching. Support known metadata from storage without trusting client content type. Private bucket, unique keys and version pinning are mandatory.
- [ ] Finalize under scoped figure/head/version locks: create immutable drawing metadata, attach working figure, invalidate mapping currency through source binding; retain all previous revisions and customer snapshots. Finalize replay returns same drawing; stale/expired intents cannot overwrite later work. Cleanup only unreferenced quarantine older than 24h.
- [ ] Test real S3-compatible local service, expired read/upload URLs, inaccessible foreign-company drawings, scanner unavailable/infected, racing finalization and database rollback. Update editor PNG upload and select-current-version controls. Commit `feat: add versioned private PNG storage workflow`.

### Task 8: Release publication and customer catalogue prerequisite

**Files:** Create `apps/api/src/modules/publication/validation.ts`, `service.ts`, `routes.ts`, `apps/api/src/modules/catalog/repository.ts`, `routes.ts`, `apps/api/test/diagram-publication.test.ts`, `apps/api/test/catalog-release-read.test.ts`; modify app registration, release schema as required, contracts catalogue detail and backend integration plan checkpoint references.

**Interfaces:** `publishModel(ctx, input: PublishInput, idempotencyKey): Promise<PublishResult>` uses existing contract. `readPublishedFigure(ctx, figureId): Promise<FigureDetail>` extends existing composite contract with numeric mapping and release identity. API `/api/v1/catalog/figures/:figureId`; publishing/rollback paths follow `docs/backend-specification.md` and must be registered explicitly.

- [ ] Red tests publish an isolated complete fixture model (one figure/two same-part occurrences), not the incomplete real Fat Truck model. Change a draft after publish and assert customer geometry/hash remains unchanged.

```ts
const before = await readPublishedFigure(customer, publishedFigureId);
await saveDraftGeometry();
const after = await readPublishedFigure(customer, publishedFigureId);
expect(after).toEqual(before);
```

- [ ] Run API tests red. Implement complete model publish prerequisites, including existing backend blockers for rows/callouts/drawings/relationships/prices, not only new geometry. Require named publisher, lock model, use serializable transaction and bounded retry, allocate snapshot IDs and map every working FK into one release. Snapshot drawing versions, approval checksums/reviewer and numeric geometry. Commit activation and audit/outbox atomically.
- [ ] Implement release read resolving active release once in consistent transaction. Scope through existing authorization SQL; filter denied price fields before serialization. No working-row joins for customer contents, search/count/detail paths. If catalogue list/search prerequisites are needed for navigation, implement them against the same release repository in this task and test entitlement parity.
- [ ] Implement rollback activation of intact previous snapshot with `publish.rollback`; never rewrite geometry. Test concurrent publish, source change during publish, incomplete mapping/approval blockers, all referenced same-release IDs, hidden prices, no draft leakage, old releases without new geometry and immutable DB trigger protection. Commit `feat: publish approved diagram mappings in immutable releases`.

### Task 9: Backend-connected frontend and staging routing

**Files:** Create `src/data/api-repository.server.ts`, `src/lib/backend-api.server.ts`, `tests/api-repository.test.ts`, same-origin proxy route `src/app/api/v1/[...path]/route.ts` if not already provided by deployment routing; modify `src/data/repository.ts`, `catalog-adapter.ts`, figure loaders, env example (placeholders only), deployment/testing guide, Next config as required.

**Interfaces:** Preserve existing repository call signatures while implementation mode is explicit (`fixture` for current demo, `api` for authenticated live data). Backend transport returns contract-validated responses and safe error states; no silent fixture fallback in API mode. Server forwards session/CSRF through allowlisted API paths and method/body limits, never an arbitrary URL proxy.

- [ ] Red tests assert a failed API fetch in API mode does not return seed parts, denied price fields are not reconstructed, mapping IDs agree with rows and release, and cookies/auth responses are forwarded safely.

```ts
await expect(apiRepository.getFigure('figure-id')).rejects.toThrow();
expect(fixtureLookup).not.toHaveBeenCalled();
```

- [ ] Run frontend tests red. Implement server-only upstream configuration and route allowlist/stream limits, preserving `Set-Cookie` semantics and origin checks. Never expose private upstream credentials. Connect sign-in/session paths and protect admin editor server entry plus API requests. Disable fixture mode for backend-connected staging/production.
- [ ] Deploy frontend and separately running Fastify API into staging, configure private database/storage and same-origin routing. Verify actual `/api/v1/me`, figure fetch, admin save/reload, upload, review, publish and customer read in browser; a Vercel-only build is insufficient. No production database mutation for this test. Commit `feat: connect diagram UI to authenticated catalogue API`.

### Task 10: Idempotent proposal import and all-Fat-Truck coverage

**Files:** Create `tools/callouts/import-mapping-drafts.ts`, `tools/callouts/mapping-coverage.ts`, `tests/mapping-coverage.test.ts`, `apps/api/test/mapping-import.test.ts`, `docs/fat-truck-mapping-coverage.md`; modify review manifests only for source-verified additions and exact coverage notes.

**Interfaces:** Import accepts explicit input manifest paths, source catalogue hash and target model ID; dry run is default, `--apply` writes drafts through mapping service. Resolve legacy IDs using preserved source keys. `buildMappingCoverage(figures, callouts, revisions)` emits per-figure/per-occurrence statuses and missing references, never guessed mappings.

- [ ] Red tests repeat identical import twice and assert no duplicate revisions; reject hash mismatch, ambiguous source keys, stale PNG and foreign figure row. Coverage classifies missing drawings separately from untraced and conflict, and cannot mark a figure complete with one of several shapes missing.

```ts
expect(report.figures.find(f => f.id === 'fig-frame-assy-2-1')?.complete)
  .toBe(false); // fixture retains one marker without a component region
```

- [ ] Run tests red. Implement validated draft import and percentage conversion, stable import idempotency including full source checksum, operator and target model. Preserve existing numeric proposals and source evidence; new file/hash never inherits approval. Legacy SVG masks remain immutable display fallback unless exact safe numeric conversion succeeds.
- [ ] Enumerate every Fat Truck figure and reference. Trace remaining clear components against source leaders with evidence and multiple disjoint regions/holes as needed. Keep ambiguous, absent-artwork and verified not-depicted cases explicitly separated. Do not commit invented geometry or claim that a software editor resolves source conflicts.
- [ ] Export per-part review checklist, obtain attributable authorized source review through the editor, and generate coverage from persisted revisions. Genuine unresolved source questions are a content-release blocker; continue all clear work. Run overlays and browser spot checks on each completed figure, regression on Windows/Filters, then commit source additions in bounded verified batches (`feat: extend verified Fat Truck mapping proposals`).

### Task 11: Full acceptance, recovery and handoff

**Files:** Create `tests/e2e/diagram-mapping.spec.ts`, browser test config and script entry if absent, `docs/diagram-mapping-acceptance.md`; update deployment and backup/restore guide with actual tested commands and evidence locations.

**Interfaces:** Exercise only actual frontend/API behavior. Test account secrets come from ignored environment or secure test fixtures, never committed credentials. Browser fixture creates isolated seeded test model via test setup, not production admin APIs.

- [ ] Write end-to-end assertions for label/component/row convergence, holes and overlaps, row filters, quote independence, wheel/fullscreen/pan, editor CRUD/undo, save conflict, role boundaries and immutable publication. Run red before wiring any missing endpoint/UI behavior discovered by these tests.

```ts
await page.getByRole('button', {name:'Ref 13 — test part'}).click();
await expect(page.locator('[data-figure-part-id="row-13"]')).toHaveAttribute('data-active','true');
await expect(page.locator('[data-region-id="region-13"]')).toHaveAttribute('aria-pressed','true');
```

- [ ] Run `npm run test:contracts`, `npm run test:api`, `npm run test:callout-preview -- --maxWorkers=1`, `npm run lint`, `npx tsc --noEmit`, API typecheck, build and browser suite. Record all failures; no skips count as passes. Check no signed URLs/secret files enter build traces or logs.
- [ ] Restore backups into a new isolated database/bucket according to approved recovery plan; verify revision/approval counts, release/object checksums, actor references, signed delivery and restored browser rendering. Record achieved recovery times against that plan, not invented guarantees.
- [ ] Run staging smoke checks with named publisher and customer/technician/dealer test roles, including per-company pricing and narrow behalf-of scope. Verify exact deployed commits. Record a real continuous browser video or label a capture sequence accurately.
- [ ] Publish completion report separating tested feature, persisted data, source approval, per-part coverage, pushed commit, staging and production states. Production promotion needs passing scope/source/recovery gates; never auto-approve drafts. Push only intended reviewed commits to mergeable branch; verify remote and deployment separately. Notify coordinator with exact outcome and only send a completion email when the stated scope is actually complete.

## Self-review checklist

- [x] Spec §1–3 boundaries and missing backend prerequisites map to Tasks 1–11.
- [x] Selection, quote separation, repeated occurrence identity and viewport behavior map to Tasks 2–3.
- [x] Geometry limits, holes, security and version contracts map to Tasks 1, 4–5.
- [x] Editor, private uploads, publication and authenticated frontend map to Tasks 6–9.
- [x] Full catalogue coverage, no inferred approval, recovery and deployment evidence map to Tasks 10–11.
- [x] Names and envelope nullability are consistent; implementation must preserve these exports across agents.
- [x] No runtime/source-completion claims are inferred from plan or previous review counts.

Execution recommendation: task-by-task delegated implementation with spec and
quality review after each task; the user has already selected this approach.
