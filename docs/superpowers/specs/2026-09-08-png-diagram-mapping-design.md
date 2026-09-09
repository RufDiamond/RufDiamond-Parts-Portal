# Fat Truck PNG diagram mapping design

Date: 8 September 2026

Status: design approved in conversation; written specification awaiting review.

Scope: Fat Truck catalogue, shared customer viewer and authenticated mapping editor.

## 1. Outcome and authority

The user approved extending the current viewer with clickable component polygons,
synchronized reference/row selection, automatic row visibility, a database-backed
mapping editor, and controlled publication. A flat PNG remains unchanged. Stored
HTML/SVG overlay geometry supplies all interactivity; customers perform no OCR or
image analysis. Multiple established occurrences highlight together.

This specification supplements `docs/backend-specification.md`. Its immutable
release, entitlement, capability, audit, concurrency and recovery requirements
continue to apply. `docs/catalog-data-structure.md` explains the source model;
where its historical simplifications differ, the backend specification governs.
In particular, figure-part rows have stable source-row identities, and changing
artwork invalidates mappings even when dimensions happen to remain equal.

The pasted user brief is the feature contract. Its illustrative `selectedRef = 13`
is not a globally unique database key. Repeated printed references can be ambiguous;
same-part occurrences are grouped only through established catalogue associations.

## 2. Verified baseline and explicit exclusions

Baseline commit: `19ed76b` on `codex/latest-frontend-integration`.

- The frontend is Next.js 16.3.0 / React 19.2.8. Keep this framework for this work;
  do not combine the feature with the separately approved future Vite migration.
- `DrawingViewer.tsx` renders percentage-based `maskPath` fills for selected parts.
  Those paths are not component hit targets. Numeric markers already activate.
- `useSelection.ts` currently stores a set of selected part IDs shared by table
  and image. `FigureWorkspace.tsx` also uses that selection to collect quote items.
- `PartsTable.tsx` supports filters but has no selected-row scrolling contract.
- Source-bound review manifests provide 272 silhouette proposals on 40 figures,
  not complete individual-part coverage. These counts describe this baseline only.
- Fastify has database, authentication, authorization, audit/outbox foundations.
  `apps/api/src/app.ts` registers identity routes and liveness, not catalogue,
  mapping, drawing upload or publishing routes. A schema is not a working API.
- The public `/review/figures/*` demo is not a secure admin surface. Never attach
  private working catalogue data or edit endpoints to it.

Exclude Xero, automated component recognition, new payment/order behavior and
rewriting original drawings. OCR assistance is optional future admin-only work,
not a prerequisite or part of this delivery. Existing source corrections remain
separate, versioned assets; this editor does not recreate or overwrite them.

## 3. Architecture and delivery boundaries

Extend the existing renderer, introduce portable numeric geometry contracts, and
add a focused Fastify diagram-mapping module. PostgreSQL is authoritative; private
object storage contains immutable source PNG versions. Keep infrastructure
provider-neutral: temporary Supabase PostgreSQL must not require browser database
access, Supabase Auth or proprietary geometry storage to move later to OVH.

Deliver in independently verifiable stages:

1. Shared viewer interactions using validated existing review geometry, without
   changing publication or promising full catalogue coverage.
2. Mapping contracts, versioned persistence, authenticated APIs and editor.
3. Authorized private drawing upload/delivery, approved release integration and
   customer API wiring. This includes the missing backend prerequisites, not
   merely declaring dependencies satisfied.
4. Explicitly import and review remaining Fat Truck mappings, then validate each
   figure and deploy through staging before production.

A working editor does not automatically finish tracing hundreds of components.
Feature completion and catalogue-content completion are separate acceptance gates.
No stage may silently fall back to local storage after a backend save failure.

## 4. Identity and selection

Use one canonical diagram selection:

```ts
type DiagramSelection = {
  figureId: string;
  figurePartId: string;
} | null;

type SelectionOrigin = 'label' | 'component' | 'table';
type SelectDiagramPart = (
  figurePartId: string,
  origin: SelectionOrigin,
) => void;
```

`figurePartId` must resolve in the displayed figure. Derive the selected part ID,
printed labels, linked occurrences and highlighted rows from that selection and
the loaded catalogue. Do not maintain independently mutable image/table selection
states. An occurrence supplies its exact row ID when activated; a table row does
the same. Resolve all same-part occurrences in this figure through existing row
relationships, not ref-number or part-number string matching. The exact activated
row is the scroll target; legitimate other same-part rows can receive linked
highlight styling without changing the focal row.

Selecting another part replaces the focused selection. Clicking the same target
keeps it selected; an explicit Clear selection action clears it. Reset on figure
or release change. Hover is temporary presentation state, never persisted selection.

Keep `quotePartIds` as a separate checkbox collection, not a second diagram
selection. Checkbox actions must not trigger row activation. Add to cart/quote
uses only the checked eligible parts and stays disabled in review. Preserve
existing quantities, pricing permissions and deliberate submission behavior.

After image activation, reveal the exact selected row in the table's scroll
container using nearest-edge scrolling, not whole-page jumps. When filters hide
that row, retain filter values but pin the selected row above filtered results
with the message “Selected part is outside these filters”; avoid duplicate rows.
Removing selection removes this exception. Respect reduced-motion preferences.

After table activation, pan only if mapped regions are outside the drawing
viewport. Keep the current zoom when possible; fit the union of selected regions
only when it cannot be shown at that zoom. Do not move the viewport on hover.
Provide an explicit “Show selected part” action, including for fullscreen.

## 5. Geometry contract and rendering

Canonical geometry uses original image coordinates, with the natural PNG width
and height as the SVG viewBox. Conversion of existing percentage proposals is
`x * width / 100`, `y * height / 100`; preserve original numeric proposals and
provenance in the migration record. Do not derive persisted coordinates from
browser dimensions. The image and SVG share one image-sized transformed wrapper;
letterboxing belongs outside that wrapper.

```ts
type ImagePoint = readonly [number, number];
type ComponentRegion = {
  id: string;
  outer: ImagePoint[];
  holes: ImagePoint[][];
};
type LabelRegion = { x: number; y: number; width: number; height: number };
type OccurrenceMapping = {
  calloutId: string;
  figurePartId: string | null;
  refNo: string;
  labelRegion: LabelRegion | null;
  regions: ComponentRegion[];
  evidence: string;
};
type DiagramMappingDocument = {
  schemaVersion: 1;
  figureId: string;
  drawingFileId: string;
  drawingSha256: string;
  imageWidth: number;
  imageHeight: number;
  catalogueBindingSha256: string;
  occurrences: OccurrenceMapping[];
};
```

`catalogueBindingSha256` is a server-computed canonical hash of figure/drawing
identity and the sorted callout-to-figure-part-to-part associations with their
versions. It is not a client assertion. Text/pricing versions can invalidate a
review conservatively; an edit never silently carries old approval forward.

Allow separate polygons for every established instance. Holes avoid coloring
empty openings in shrouds or frames; use SVG even-odd fill/hit testing. Every
polygon needs at least three distinct finite vertices, nonzero area, no crossing
edges and image-bounded coordinates. Holes must be wholly within their outer
polygon and nonintersecting. Reject invalid shape edits with a specific message.
Drafts may omit labels, regions or row associations but cannot be approved.

Limits: 1 MiB mapping request, 1,000 occurrences per figure, 32 regions per
occurrence, 512 vertices per ring, 16 holes per region, 20,000 vertices total per
document. Enforce limits before expensive geometry checks. All object schemas
reject unknown properties. Server reconstructs SVG commands from numbers; never
accept markup, event attributes, URLs or arbitrary `maskPath` strings on new APIs.

All mapped component regions exist as transparent hit targets even when not
selected. A selected part adds translucent fill and a visible contrast outline;
use non-scaling strokes. Label targets remain separately visible/clickable.
Regions use keyboard-operable labeled controls with Enter/Space activation and
focus indication; a table reference provides an equivalent accessible action.

Click priority is label before component before canvas. If regions for different
parts overlap at the pointer, show a small candidate chooser labeled with reference
and part number rather than choosing whichever path renders last. Drag movement
over a 5 CSS-pixel threshold pans instead of selecting; pointer cancellation
cleans up capture. A click below the threshold activates the mapped component.
Wheel events over components still reach the common wheel handler. Keep existing
wheel limits, zoom buttons, fullscreen warnings and outside-image scrolling.

## 6. Persistence and revision lifecycle

Add focused tables, without overwriting current `callout.mask_path` or rewriting
existing releases:

| Table | Purpose and constraints |
| --- | --- |
| `diagram_mapping` | One head per figure; UUID PK, unique figure FK, positive version, nullable current revision ID. Mutable coordination row only. |
| `diagram_mapping_revision` | Append-only full document JSONB, head FK, positive revision number unique within head, drawing FK/hash/dimensions, catalogue binding hash, canonical document checksum, actor FK, creation time. Composite head/revision identity prevents cross-head pointers. |
| `diagram_mapping_approval` | Unique revision FK, reviewer FK, review timestamp and reviewed document checksum. Written only by authorized review action; never copied to a new revision. |
| `release_diagram_mapping` | Release/figure composite key and FK, release drawing FK, copied geometry, source revision/checksum and reviewer/time snapshot. IDs in geometry remapped to corresponding release callout/figure-part IDs. No live draft joins. |

Numeric geometry stays JSONB; callout and row identities remain canonical in
existing catalogue tables. The service checks every JSON identity and source
binding transactionally. Database writes use only the backend application role;
no public database grants. Release composite FKs enforce same-release figure and
drawing associations. Existing immutable snapshot protection must include the new
release table. Append-only revisions cannot be edited or deleted through the API.

Each save inserts a new revision, compare-and-swaps the head version and writes
audit/outbox entries in one transaction. Deleting/redrawing a polygon creates a
new revision; earlier revisions remain recoverable. Approval binds one revision
and exact sources. Subsequent saves yield unapproved current revisions. Preserve
audit before/after revision IDs and checksums; do not copy credentials or signed
drawing URLs into logs or events.

Concurrent saves require `If-Match` with the head version. Reject stale writes
with 412; a missing precondition is 428. Repeated requests with the same scoped
idempotency key and identical body replay the result; a changed body with the
same key is 409. Source changes between load and save/review also return 409,
leave edits on screen and require reload/reconciliation, not forced overwrite.

## 7. API, access and drawing handling

All paths below use `/api/v1`. Check authenticated identity, current capabilities
and model scope server-side before reading metadata, issuing URLs or mutating.

| Method and route | Contract |
| --- | --- |
| `GET /admin/figures/:figureId/diagram-mapping` | Draft figure rows, safe drawing metadata and current document/head version; requires `publish.draft.view` and `catalog.figure.view`. |
| `PUT /admin/figures/:figureId/diagram-mapping` | Full replacement draft document, `If-Match`, idempotency key; requires `catalog.callout.manage`, plus `catalog.callout.map` for changed associations. Returns revision ID/version/checksum. |
| `POST /admin/figures/:figureId/diagram-mapping/approve` | Exact revision ID/checksum and head precondition; requires mapping capabilities and named `publish.execute`. Validates completeness and source currency, records reviewer. Does not activate a release. |
| `POST /admin/figures/:figureId/drawing-uploads` | Upload intent for PNG name, declared size/hash; requires `catalog.drawing.upload` and `catalog.figure.edit`. Server chooses private object key. |
| `POST /admin/figures/:figureId/drawing-uploads/:uploadId/finalize` | Verifies object and attaches a new immutable drawing under figure-version precondition; marks existing mapping stale. |
| `GET /admin/figures/:figureId/drawing` | Authorized short-lived URL for exact working drawing version; no arbitrary storage-key input. |
| `GET /catalog/figures/:figureId` | Entitlement-filtered single-release composite response including rows, occurrences, approved mapping and version-pinned drawing delivery. |

Approve is a review operation using the existing named publisher capability; no
new broad administrator bypass. An editor may also review only if explicitly
granted that capability. Disabled/revoked users cannot save or fetch new URLs.
The editor is `/admin/figures/:figureId/mapping`, protected through authenticated
backend requests, never the public demo route. Follow existing cookie/CSRF
conventions and same-origin frontend-to-Fastify routing; do not put tokens or
database passwords in browser code.

PNG upload limits: 20 MiB, positive dimensions, at most 40 million decoded pixels,
and maximum 16,384 pixels per side. Validate signature, actual size/hash, decode
and malware result before accepting; reject unsupported formats. Upload intents
expire in 15 minutes; drawing-read URLs expire in 5 minutes. Source files are
private, immutable and version-pinned. Abandoned quarantine objects are removed
only after a 24-hour retention window and reference check. A failed finalization
must not detach the existing figure drawing or invalidate its published release.

Responses use existing RFC 9457 handling: 400 malformed contract; 401 no session;
403 insufficient capability; 404 absent/out-of-scope resource; 409 source or
idempotency conflict; 412 stale version; 413 size limit; 422 invalid geometry or
incomplete approval; 428 missing precondition; 503 temporary database/storage
failure. Include safe machine-readable issue codes and request ID, not SQL,
stack traces or private paths. Map 422 issues to occurrence/region fields.

## 8. Editor workflow and UX

Load draft source and associated table, select an exact occurrence/row, draw its
label rectangle, then create one or more component polygons. Clicking adds a
vertex; Enter or clicking the first vertex closes a ring; Escape cancels the
unfinished ring. Select/drag a vertex to edit; Delete removes a selected vertex
only when at least three remain. Explicit controls add another region, add a
hole, remove a region and redraw. Undo/redo is local until Save; saved revisions
can be loaded as a new draft without altering history.

Provide Select, Label, Polygon, Hole and Pan tools with clear active state,
keyboard shortcuts and instructions. Switching tools cancels no data silently.
Save reports Saving/Saved/Unsaved/Conflict distinctly; network failures retain
local in-memory edits. Warn before leaving with unsaved edits. Do not persist
private drawings/mappings in localStorage. An image-load or authentication error
disables editing until the authoritative document is available.

Show per-occurrence states: unmapped row, missing label, missing component shape,
source conflict, ready for review, approved revision. Existing ambiguous labels
remain unresolved; the editor never assigns identity by elimination. A parts row
explicitly not depicted may remain table-only only after a source-backed domain
resolution through the catalogue workflow. It must not become an automatic
exception that bypasses current publication blockers.

## 9. Publication, migration and coverage

Publication resolves the current approved mapping for each included figure and
checks drawing/hash/dimensions, catalogue binding and complete applicable labels
and component regions. It snapshots geometry together with rows, callouts and
drawing versions inside the backend specification's serialized publishing
transaction. Every customer response resolves a single active release once.
Price permission filtering still applies to its rows. Saving, approving or
replacing a drawing cannot modify the active release.

Existing releases without new geometry remain readable with their original
behavior. New full-interactivity releases require approved complete geometry;
do not grandfather empty masks as completed outlines. Rollback reactivates an
existing coherent snapshot, never reconstructs one from current drafts.

Import baseline review JSON through an explicit dry-run report and transactional
draft import keyed by source hash and stable source identities. Map local string
IDs to database IDs through catalogue source keys, not by generating unrelated
UUIDs per run. Reject unmatched/ambiguous associations. Convert normalized
polygons into original coordinates and compare rendered geometry. Import does
not create approvals. Existing legacy SVG paths stay read-only unless a bounded
numeric path parser can preserve them exactly; otherwise retain the original
renderer until their editor geometry has been explicitly traced and reviewed.

Audit every Fat Truck figure and every imported callout, not just diagrams with
some polygons. Publish a coverage report with totals for fully traced, partial,
untraced, source-conflicted and absent-artwork figures, plus exact missing refs.
Cabin 6.13, Accessories 12.1 and Safety/tools 6.15 retain their documented source
limitations until evidence resolves them. Missing drawings cannot be manufactured
by this feature. Windows/Filters remain regression references, not evidence of
full-catalogue completion.

## 10. Tests, rollout and completion evidence

- Contracts/geometry: bounded points, invalid rings/holes, request limits,
  deterministic checksums, percentage conversion and no arbitrary SVG input.
- Selection: number/component/row converge on identical state; duplicate ref
  strings on unrelated rows do not conflate; established multiple occurrences
  all highlight; quote checkboxes remain independent; figure changes clear focus.
- DOM/browser: hidden-row pinning, nearest table scroll, component keyboard input,
  overlap chooser, drag cancellation, automatic reveal and reduced motion.
- Native browser input: wheel over image/marker/component, outside-image scroll,
  zoom limits, fullscreen, resize and wide/tall PNGs; image and overlay bounds
  must agree within one CSS pixel. Verify Windows/Filters and several newly
  mapped diagrams. Inspect actual fill contours, not merely selected attributes.
- PostgreSQL integration: two writers with one version yield one commit and one
  412; idempotent replay; forbidden/out-of-scope access; stale drawing invalidation;
  atomic approval/audit/outbox; invalid mappings never enter release snapshots.
- Storage: forged MIME/hash/dimensions, oversize/decompression limits, denied
  access, expired intent/URL and finalize failure preserving previous drawing.
- Release: draft changes invisible to customers, denied price fields absent,
  consistent snapshot IDs under concurrent publication, exact rollback geometry.
- Recovery: restore mapping revisions/approvals/release rows and pinned private
  objects into an isolated database/bucket, verify hashes and render a restored
  release. Apply the approved backup-and-recovery plan; never test restore over
  staging or production data.

Use current `test:callout-preview`, `test:contracts`, `test:api`, lint, TypeScript
and build scripts as the baseline; add focused tests and a reproducible browser
suite. `test:web` currently points at an absent web workspace and is not evidence.
No test skip or mock storage/database alone establishes integration completion.

Roll out additive migrations first, keep editor routes disabled until auth/API
checks pass, then enable staging with explicit source-approved test data. Deploy
the frontend and separately running Fastify API with private PostgreSQL/storage;
a Vercel frontend push alone does not deploy this backend. Confirm the exact
deployed commits, exercise save/reload/review/publish on staging and record actual
browser video. Production activation remains a named publishing action after
source review; no script auto-approves the current proposals.

Completion reports must separately state: implemented behavior, tested browser
surfaces, per-part mapping coverage, backend persistence, source approval, pushed
commit, staging deployment and production release. Do not email “all done” while
one of these required outcomes remains incomplete.

## 11. Written specification review

The approved approach is preserved without framework changes or automatic source
approval. The implementation plan must give the missing API/storage/publication
prerequisites their own testable tasks and define shared geometry contracts before
parallel work. Review this written specification before creating that plan and
executing application changes.
