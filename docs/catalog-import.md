# Canonical draft catalogue import

Task 10a provides a Fastify API and authenticated operator CLI. It does **not** add an import page or extend the existing Next JSON-only proxy. Catalogue creation, ordinary part editing, account management, source approval and publication remain separate workflows. Select real existing model/variant UUIDs from authorized catalogue data; no seed fallback or inference from workbook names is supported.

## API and operator transport

All routes are under `/api/v1/admin/imports`. They require a current authenticated session with `parts.import`, draft visibility and target model/variant scope before revealing source metadata, counts or issues. Writes require the existing allowed Origin and fresh CSRF token. Actor identity comes only from the session. Responses are private/no-store.

| Request | Body | Preconditions |
| --- | --- | --- |
| `POST /` | Raw CSV or XLSX stream | Quoted target-model `If-Match`; `Idempotency-Key`; strict query metadata below |
| `GET /:id` | None | Current target scope |
| `POST /:id/validate` | `{}` | Quoted job version; idempotency key |
| `PATCH /:id/issues/:issueId` | `{ "decision": "acknowledged" or "source-correction-required", "evidence": "at least ten characters" }` | Quoted issue version; idempotency key |
| `POST /:id/apply` | `{}` | Quoted job version; idempotency key; validated with no blocking issues |

Upload query fields are exactly `modelId`, `variantId`, `filename`, `format`, `sourceKind`, `lineageKey`, `sha256`. Format is `csv` or `xlsx`; content type must be exactly `text/csv` or `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, respectively. HTTP content encoding is rejected. Source kind is declared provenance (`workbook`, `legacy-draft`, `synthetic`), **not** proof of authenticity or approval. Lineage is an explicit stable source-family identifier, not an object key. Names cannot contain paths/control characters. No arbitrary storage-key reader exists.

Use `tools/callouts/import-mapping-drafts.ts` against an explicitly approved HTTPS Fastify API origin (HTTP loopback is permitted for isolated local testing), not the Next proxy. The tool reads an absolute, current-user-owned private 0600 cookie file containing one existing Cookie header value. It never asks for a password or accepts one in arguments. It reads fresh `/api/v1/me`, checks the explicit operator UUID, obtains CSRF in memory, refuses redirects and does not log credentials. Provision the cookie file through your approved local session-handling process; do not commit it or place it in shell history. The tool does not create accounts or sessions.

Every invocation defaults to dry run. Choose exactly one plan type; add `--apply` only for the explicitly reviewed write. Example (replace all example paths, origins and UUIDs with authorized values):

```sh
npx tsx tools/callouts/import-mapping-drafts.ts \
  --stage-plan /absolute/stage-plan.json --source-file /absolute/source.xlsx \
  --api-origin https://approved-api.example --web-origin https://approved-web.example \
  --cookie-file /absolute/private-session-cookie --operator OPERATOR_UUID
```

Stage-plan JSON is `{ "operatorId": "UUID", "expectedVersion": 1, "idempotencyKey": "unique-operation-key", "metadata": { "modelId": "UUID", "variantId": "UUID", "filename": "source.xlsx", "format": "xlsx", "sourceKind": "workbook", "lineageKey": "reviewed-source-family", "sha256": "FULL_64_CHARACTER_SOURCE_SHA256" } }`. The version is the target model's current version, not a guessed default. Without `--apply`, parsing/normalization is local and nothing is staged; with it, the file is streamed to the API.

For validation or draft application, substitute `--job-plan /absolute/job-plan.json`, omit source-file, and use `{ "operatorId": "UUID", "expectedVersion": CURRENT_JOB_VERSION, "idempotencyKey": "unique-operation-key", "jobId": "UUID", "operation": "validate" }` (or `"apply"`). Dry run reads the scoped job only. Add `--apply` to perform the selected operation. Refresh returned versions before the next operation; do not retry changed content under an old key. Error responses intentionally avoid raw source, money and storage credentials/keys.

## Source retention and atomic draft application

The service hashes while consuming at most 25 MiB, then parses, malware-scans and stores an exact private immutable object version outside the model lock. XLSX expansion is bounded to 100 MiB, 2,000 ZIP entries, 100,000 data rows and 32,767-character cells; one worksheet and exactly sixteen ordered source headers are required. Encrypted archives, macros, embedded binaries, external content and formulas are rejected. CSV is strict UTF-8 with quoted-field handling; spreadsheet formula-like cells are not evaluated. Deployment must enforce request timeouts/rate limits and provision clamd's `StreamMaxLength` for 25 MiB; an unavailable/infected scanner fails closed. The PNG path retains its separate 20 MiB guard.

SheetJS CE 0.20.3 is pinned to the [official supported distribution](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/), not the stale npm package. It exceeds the patches documented for [CVE-2023-30533](https://cdn.sheetjs.com/advisories/CVE-2023-30533) and [CVE-2024-22363](https://cdn.sheetjs.com/advisories/CVE-2024-22363). Archive inspection occurs before SheetJS and no formula/macro evaluator is invoked.

All sixteen literal columns and raw row coordinates are retained. `No.` is evidence, not entity identity. Money remains fixed-decimal text/null; an actual zero is distinct from missing. Semantic row identity binds system/group/figure name, normalized global part number and PNC. Repeated identities are separate staged observations plus blockers, never last-row-wins. Changed or missing unmatchable keys block apply rather than silently deleting history.

`ImportDetail.rowCount` counts all retained raw rows; `validRowCount` counts only successfully normalized rows. `normalized_fields` is always a JSON object: valid rows have `normalizationState: "valid"` and typed `fields`; invalid rows have `normalizationState: "invalid"` and `fields: null`. A raw quantity zero stays zero in raw evidence, with no manufactured positive quantity or NaN. Canonical normalization and raw provenance are immutable. Legacy jobs retain their preexisting normalized-edit contract, but canonical source-kind/lineage cannot be changed to downgrade this protection.

Issue reviews record server actor/time, evidence, optimistic issue versions, incremented job versions and append-only history. Acknowledging a warning does not approve the source. Errors accept only source-correction-required and remain blocking. Existing global part descriptions/prices/manufacturers/currency and existing relationship changes cannot be overridden by this model-scoped import. Serviceability belongs to the figure row. Narrow `Requires PART-NO (QTY N)` hints retain literal remarks; only newly created source parts can receive pending exact-resolved required-part edges. Unresolved targets block. `Includes parts 1-18` is not converted into a global requires relationship.

Before staging and applying, authorization is refreshed under the existing model/variant/job coordination. Draft graph, mapping heads, source aliases, job state, audit/outbox and idempotency commit together. New callouts have null coordinates and no approval. Reimports preserve UUIDs and coordinates only for unchanged unambiguous identity; changed row content increments bindings and makes prior mapping approval stale. An exact source rerun additionally must agree on filename, format, source kind and lineage. Customer reads continue to use the old immutable active release.

On a failed stage, cleanup checks that only this attempt's newly created exact key/version is unreferenced before deleting it. It never deletes a previously recorded job source. Cleanup uncertainty/failure emits a safe warning, without secrets or claiming deletion. A process crash between external PUT and committed job record can still leave an orphan: durable automatic reconciliation is **not implemented**. An authorized operator must reconcile inventory against exact referenced key/version pairs after a retention window; do not run a broad prefix delete. Provider privacy/versioning, IAM denial, backup/restore and crash-orphan reconciliation remain deployment gates.

## Mapping draft bridge and coverage

Use `--manifest /absolute/mapping-manifest.json --source-file /absolute/source.xlsx --legacy-source-file /absolute/ft3-wagon.ts` with the same explicit origins/cookie/operator flags. `MappingDraftManifestSchema` in `packages/contracts/src/admin.ts` is the strict contract: schemaVersion 1, status `NOT_FOR_CUSTOMER_USE`, operator/job/model/variant/figure UUIDs, legacyFigureId, original source checksum, independent legacy-source checksum, current catalogue binding, exact drawing SHA-256 and dimensions, expected mapping version, idempotency key and proposals. Each proposal carries canonical sourceRowKey, legacy callout/row IDs, refNo, labelRegion, component regions, legacyMaskPath and evidence.

The bridge validates immutable applied-job aliases, full file hashes, exact row/part/ref associations, figure names, current drawing and catalogue binding. Legacy TypeScript is read through literal AST extraction, never executed. Percentages are converted to original-image pixels with existing geometry validation. Unknown or ambiguous aliases/names are withheld, not guessed; the real 11.3/legacy11.2 collision needs reviewed evidence before migration. Existing invalid rings and mask paths remain immutable fallback and explicit issues; arbitrary SVG parsing, hole conversion and retracing are not performed. No manifest hash is rewritten to pretend it matches another source domain.

Default dry run reports issues without saving. Explicit apply uses the existing authenticated mapping PUT and creates an **unapproved** draft revision. Repeating the identical operation uses the same mapping version/idempotency context and produces one revision; changed context fails. The tool never invokes approval or publication.

Run `npx tsx tools/callouts/mapping-coverage.ts` for the complete measured legacy inventory. [Coverage report](fat-truck-mapping-coverage.md) separates 45 legacy figures/572 occurrences, proposals, disposable persisted synthetic proof and actual source approval. Unknown required physical regions, missing drawing, unresolved source conflict and table-only rows are not completeness.

## Remaining source and release gates

The original local workbook was read-only parsed, not uploaded/applied: SHA-256 `3a6a66571058ac238f707fed4421755f9a678e4baff708b452382f439d876599`, 635 rows/536 parts/45 figure identities but 44 GROUPNO values, 633 valid normalized rows. Quantity-zero assembly rows are Sheet1 row222/No221 (`61-00143`, Fig6.7) and row241/No240 (`62-00807`, Fig6.8). The `FT3 WAGON FIG-11.3` source collision is OVERHEAD CONTROLS (rows577–587) versus FUSE BOX & FIREWALL (588–605). No source renaming or quantity inference is authorized here.

Task 10b must add attributable append-only reviewed interpretations for assembly quantities/nondepiction/source issues without editing raw rows or original normalization envelopes, and provide an explicit safe apply/release integration for those interpretations. Task 10c handles missing/multipart regions, valid holes, tracing and final actual persisted coverage. Current drawing/source conflicts, Safety6.15, original source approval, actual-backend headed acceptance and remote publication remain gated. Existing Next dependency security advisories are separately assigned to Task 11; this backend slice neither upgrades Next nor claims a deployable security pass.
