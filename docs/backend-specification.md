# Backend technical design

RUFDiamond Parts Portal · FT3 Wagon pilot · September 2026

Status: approved architecture, ready for implementation planning

This is the authoritative technical design for the portal backend. It replaces
the earlier provisional notes and incorporates the domain decisions made while
the existing front end was built. It is a design document only; it does not
authorize framework migration or implementation.

## 1. Purpose and approved scope

The portal gives RUFDiamond control of its parts catalog, drawing mappings,
pricing, customer access, and parts requests. The FT3 Wagon is the pilot, but
the design supports additional product lines, models, variants, and roles.

The approved production stack is:

- Vite and React for the browser application
- Node.js, Fastify, and TypeScript for the HTTP API
- PostgreSQL for transactional and catalog data
- private S3-compatible object storage for drawings, imports, and exports

The existing Next.js application remains a behavior reference until a separate
implementation plan authorizes migration. Its asynchronous repository module
(`src/data/repository.ts`) is the current data-access seam; the future client
should preserve its useful composite read models rather than joining
database-shaped responses in the browser.

Xero integration is explicitly deferred. The pilot creates provider-neutral
orders and accounting-export events only. It must not introduce Xero SDKs,
credentials, identifiers, statuses, or Xero-shaped database columns.

Supporting documents remain authoritative for specialist detail:

| Document | Subject |
|---|---|
| `catalog-data-structure.md` | Source columns, hierarchy, import order |
| `capability-and-role-spec.md` | Capabilities, role bundles, scopes |
| `build-plan.md` | Delivery sequence and risk order |
| `backup-and-recovery-plan.md` | Backup layers, recovery targets |

Where an older document selects Next.js, Auth.js, mutable publication flags, or
a managed database, this approved design takes precedence.

## 2. Architectural principles

1. **The API is authoritative.** The browser may hide controls, but the API
   validates identity, capability, scope, workflow, and invariants.
2. **Draft and live are separate.** Administrators edit a working catalog.
   Customers read one immutable active release.
3. **Visibility is query-level.** Brand, fleet, account, release, and price
   constraints apply while querying, before rows reach the browser.
4. **Publication is atomic.** Customers see the old complete release or the new
   complete release, never a mixture.
5. **Relationships are normalized.** A part is global, its use on a figure is a
   relationship, and each physical marker is its own callout.
6. **Irreplaceable work is durable.** Callout coordinates, drawings, accounts,
   and orders receive transactional audit and tested backups.
7. **Integrations are adapters.** Email, exports, and future Xero delivery
   consume committed outbox events and do not own domain state.
8. **Use a modular monolith.** One API and database keep the pilot simple while
   explicit modules preserve future separation.

## 3. System boundaries

### 3.1 Browser

The browser owns presentation, navigation, transient state, and conversion of
drawing clicks into percentage coordinates. It does not decide authorization,
calculate authoritative order totals, publish data, or construct storage keys.

### 3.2 Fastify API

The API has explicit modules:

| Module | Responsibility |
|---|---|
| Identity | Credentials, sessions, resets, current-user context |
| Authorization | Capability and scope evaluation; query constraints |
| Catalog | Working models, variants, systems, figures, parts, relationships |
| Drawings | Upload lifecycle, metadata, versions, authorized retrieval |
| Import | Staging, parsing, validation, diff, reviewed application |
| Publication | Blockers, immutable releases, activation, rollback |
| Orders | Submission, snapshots, totals, status workflow |
| Accounts | Companies, users, fleets, price/visibility settings |
| Audit | Append-only mutation record and authorized export |
| Outbox | Durable email, export, and other asynchronous work |

Route handlers validate transport input and call application services.
Application services own transactions and policy orchestration. Repositories
own SQL and accept authorization scope wherever records are restricted. Pure
domain functions own rules such as money rounding and publish validation.

### 3.3 Data and external services

PostgreSQL is the source of truth for identity, authorization, working state,
immutable releases, drawing metadata, imports, orders, audit, and outbox.
Object storage holds opaque immutable files; database rows give them meaning.
Buckets are private and callers never receive permanent public URLs.

A worker claims committed outbox rows with `FOR UPDATE SKIP LOCKED`, performs
external actions, and records attempts. Initial consumers are confirmation
email and portable exports. Future Xero delivery may be another consumer but
is not part of the pilot.

## 4. Catalog and publication model

### 4.1 Hierarchy and multi-occurrence callouts

```
Product line
  └─ Model
      └─ Variant
          └─ System (through model_system)
              └─ Figure
                  ├─ Figure part ── Part
                  └─ Callout ────── Figure part
```

Figures belong to variants, not models. A `figure_part` records one part's use
on one figure. A `callout` records one physical marker. Multiple callouts may
point to the same `figure_part`, including repeated visible numbers when the
drawing requires them. Selecting a part must return and highlight every
matching callout. Repeated occurrences are valid data, not duplicates.

No uniqueness constraint may be placed on `(figure_id, number)` or on
`callout.figure_part_id`. Imports use stable source-row identity rather than
incorrectly treating PNC as unique.

### 4.2 Working catalog

Imports and admin edits update normalized working tables. Working records carry
`created_at`, `updated_at`, and integer `version` for optimistic
concurrency. `model.status` describes the machine lifecycle: active, legacy,
or discontinued. A separate derived catalog state reports absent,
awaiting-import, draft, or active-release state.

Ordinary customer routes never query working tables. Preview requires
`publish.draft.view` and is visibly identified as draft.

### 4.3 Immutable releases

Publication creates a self-contained immutable snapshot for a model and its
variants. Recommended tables mirror the customer-visible graph:

- `publication_release`
- `release_model`, `release_variant`, and `release_system`
- `release_figure` and `release_drawing`
- `release_part` and `release_part_requires`
- `release_figure_part` and `release_callout`

Snapshot rows use release-local foreign keys plus stable working IDs for
traceability. Customer responses never join release rows back to mutable
working rows. Later price edits, drawing replacements, or imports cannot alter
an active release.

`publication_release` stores model ID, revision, status, summary, creator,
timestamps, and source checksum. A partial unique index permits at most one
active release per model.

Every customer catalog request resolves the permitted model and exactly one
active immutable release at the start of the query. All systems, figures,
parts, prices, callouts, counts, searches, and drawing versions in that response
come from that release. No endpoint may blend release and working rows.

### 4.4 Publishing transaction and blockers

`publish.execute` runs in a serializable transaction:

1. Lock the model publication state and verify both `expectedWorkingVersion`
   (the unchanged source `model.version`) and `expectedPublicationVersion`
   (the separate `model.publication_version` coordination counter).
2. Re-evaluate authorization and all blockers against current working data.
3. Copy the complete customer-visible graph into a new release.
4. Store a deterministic release checksum.
5. Atomically deactivate the previous release and activate the new one.
6. Increment only the publication coordination counter and append audit and
   outbox events. Publication and activation do not change source versions or
   mapping approval bindings.
7. Commit, after which the new release becomes visible.

The server never trusts a disabled UI control or previous validation result.
Concurrent attempts yield one success and one `409`. Failure leaves the
previous release active. Rollback requires `publish.rollback` and activates a
prior snapshot without rewriting history. `publish.block.override` is granted
to nobody in the pilot.

Publish input requires both version preconditions. Activate/rollback input
requires `expectedPublicationVersion` and `expectedActiveReleaseId`; each
successful action increments only the coordination counter. This separates
concurrent release operations from source edits: geometry-only saves can be
reviewed and published again without artificially invalidating all other
figure approvals. The scoped publication queue exposes both current versions.

Blockers are derived, never manually cleared. Publication fails for:

- missing or unvalidated drawing
- null callout coordinate or coordinate outside 0–100
- null or unresolvable `figure_part_id`
- callout and figure part belonging to different figures
- figure part with an unresolvable part
- unreviewed relationship extracted from remarks
- invalid or disabled hierarchy path
- inconsistent currency or price required for display

The API groups blockers by model, variant, and figure with stable codes. A
“figure complete” indicator is also derived; any later edit can make it
incomplete.

## 5. PostgreSQL schema

Identifiers are UUIDs and times are `timestamptz` in UTC. Currency uses ISO
4217 codes. Money uses `numeric(14,2)` and rates use bounded decimals, never
binary floating point. JSONB is for immutable source payloads, audit details,
and validation reports rather than ordinary relational structure.

### 5.1 Working catalog

| Table | Principal columns and constraints |
|---|---|
| `product_line` | name, manufacturer, country, distributed flag; normalized-name uniqueness |
| `model` | product-line FK, name, photo FK, order, lifecycle; unique name per line |
| `variant` | model FK, label, serial bounds, revision; unique label per model |
| `system` | name, sort order; unique normalized name |
| `model_system` | model/system FKs, enabled; composite PK |
| `figure` | variant/system FKs, name, group number, active drawing FK, order, stable source key |
| `drawing_file` | object key, filename, type, bytes, SHA-256, dimensions/pages, version, validation, uploader |
| `part` | normalized unique part number, display number, description, maker, list price, currency, replacement FK, status |
| `part_requires` | part/required-part FKs, quantity, review state, provenance; no self-reference |
| `figure_part` | figure/part FKs, source-row key, quantity, remarks, serviceable, effective dates |
| `callout` | figure FK, nullable figure-part FK, source key, number, nullable percentage coordinates |

`callout.figure_part_id` is nullable so incomplete imports are representable
in draft. A composite FK or transaction validation guarantees a non-null
figure part belongs to the same figure. Coordinates must both be null or both
non-null and, when set, between 0 and 100. `(0, 0)` is valid.

`part_requires` is directional and does not imply a reverse edge. Original
`figure_part.remarks` remains after approval. Supersession is directional:
the old part points to the replacement.

### 5.2 Identity and access

| Table | Purpose |
|---|---|
| `company` | Customer/dealer, status, discount, price tier, technician-pricing setting |
| `company_product_line` | Lines visible to the company |
| `company_machine` | Variants in the customer's fleet and unit reference |
| `app_user` | Company, name, canonical email, password hash, role, status |
| `role`, `capability`, `role_capability` | Configurable bundles of stable capabilities |
| scope tables | Brand, account, fleet, environment, and price restrictions |
| `session` | Hashed token, user, expiry, last use, revocation, security metadata |
| `password_reset_token` | Hashed single-use token, user, expiry, consumption |

Seed the complete capability register. Pilot bundles are Catalog Admin,
Purchaser, and Technician. Later separation is configuration, not code.

### 5.3 Orders and operations

`order` stores company, submitting user, variant, reference, status, currency,
list total, discount, net total, submission time, and version. `order_line`
stores the part reference plus snapshots of number, description, unit price,
quantity, and rounded line total. Submitted snapshots never change.

`import_job` stores source checksum, target, state, summary, actor, and
timestamps. `import_staging_row` stores normalized fields and stable source
identity. `import_issue` stores severity, code, row/field context, and
resolution.

`audit_log` is append-only and stores actor, effective company, capability,
object, before/after patch, request ID, correlation IDs, timestamp, and safe
network metadata. Secrets, password hashes, tokens, and signed URLs are
excluded.

`outbox_event` stores event type, aggregate, versioned provider-neutral
payload, occurrence/availability/completion times, attempts, and last error.
Delivery is at least once, so consumers are idempotent.

## 6. Authentication and authorization

Use first-party server sessions for the pilot:

- Argon2id password hashes with parameters reviewed at implementation
- high-entropy session tokens stored only as hashes
- Secure, HttpOnly, appropriately SameSite cookies
- rotation at sign-in and after password/privilege changes
- inactivity and absolute expiry, revocation, and logout-all
- rate limits and non-enumerating sign-in/reset responses
- hashed, expiring, single-use reset tokens
- Origin/Referer validation plus CSRF tokens for cookie mutations

Production CORS permits only configured portal origins. Admin authentication
events are audited. MFA is recommended for catalog administrators before broad
production rollout.

Each protected route declares one concrete capability. Application services
recheck sensitive operations. Unknown capabilities deny by default. Code never
compares role names.

Capabilities define *what* and scopes define *which records*. Effective access
is their intersection. SQL repositories constrain brand, account, fleet,
environment, and price visibility. Out-of-scope IDs return `404` where
`403` would disclose existence. Counts, search, exports, errors, drawing
metadata, and signed URLs use the same constraints as ordinary reads.

Technician pricing is a per-company setting and defaults to visible for the
pilot, preserving the current Technician bundle without hard-coding a global
policy.

## 7. API design

Routes live under `/api/v1`. JSON uses camelCase to match TypeScript models;
PostgreSQL uses snake_case. Times are ISO 8601 UTC. OpenAPI is generated from
the Fastify schemas used for runtime request and response validation.

### 7.1 Customer routes

| Method and path | Purpose |
|---|---|
| `POST /auth/sign-in`, `POST /auth/sign-out` | Session lifecycle |
| `POST /auth/password-reset/request`, `/complete` | Non-enumerating reset flow |
| `GET /me` | User, safe capabilities, scope/UI settings |
| `GET /catalog/product-lines` | Permitted released lines |
| `GET /catalog/models` | Fleet-scoped models with active releases |
| `GET /catalog/models/:id/variants` | Released variants |
| `GET /catalog/variants/:id/systems` | Enabled released systems |
| `GET /catalog/variants/:id/systems/:systemId/figures` | Figure summaries |
| `GET /catalog/figures/:id` | Composite detail, rows, all callouts |
| `GET /catalog/parts/search?q=` | Search active permitted releases only |
| `POST /orders` | Idempotent request-for-quote submission |
| `GET /orders`, `GET /orders/:id` | Account-scoped order history |

The API assembles composite shapes equivalent to those consumed by
`src/data/repository.ts`; the client does not perform sensitive joins.
Drawing content uses an authorized route that issues a short-lived signed URL
or streams the object after checking release and scope.

### 7.2 Admin routes

Admin routes cover catalog summary; model, variant, system, figure, part, and
callout mutation; drawings; imports; publication; orders; accounts; users;
roles; and audit. Important workflow routes include:

- `POST /admin/imports`, `GET /admin/imports/:id`
- `POST /admin/imports/:id/validate`, `POST /admin/imports/:id/apply`
- `POST /admin/drawings/uploads`, `POST /admin/drawings/uploads/:id/finalize`
- `PATCH /admin/callouts/:id`
- `GET /admin/publication/queue`
- `POST /admin/publication/releases`
- `POST /admin/publication/releases/:id/activate`
- `POST /admin/publication/releases/:id/rollback`
- `GET /admin/audit`

Mutations use `If-Match` or an explicit version. Import application, order
submission, and publication accept `Idempotency-Key`; stored request hashes
prevent reuse with different payloads. Lists use cursor pagination, bounded
page sizes, and stable ordering.

## 8. Import flow

Import is a reviewed two-phase process, never spreadsheet-to-live:

1. Authorize `parts.import`, upload privately, hash, and create an immutable
   job.
2. Parse all sixteen columns into staging without changing the catalog.
3. Normalize, validate, and produce counts, warnings, errors, and a diff.
4. Deduplicate global parts while retaining every figure occurrence.
5. Propose `part_requires` from remarks, retaining prose and requiring review.
6. Resolve blockers and approve parsed relationships.
7. Revalidate and apply accepted changes to working tables in one transaction,
   including audit and outbox events.

Stable keys include normalized part number, target model/variant, figure source
key, and source-row identity. The checksum detects exact reruns; uniqueness and
upserts make changed reruns idempotent. Conflicts are reported, never silently
chosen.

Import creates callouts from PNC with `figure_part_id` where resolvable and
coordinates null. It never fabricates a position. Existing manual coordinates
are retained only when stable identities match unambiguously.

Applying an import cannot activate a release. Customers keep seeing the old
active release until a separate authorized publish succeeds.

## 9. Drawings and object storage

Buckets deny public access. Keys use opaque UUIDs and immutable versions;
user filenames are metadata only.

Upload sequence:

1. Check `catalog.drawing.upload` and create an upload intent with limits.
2. Return a short-lived presigned upload or stream small files through the API.
3. Finalize by verifying existence, size, SHA-256, signature, allowed type, and
   malware result.
4. Extract dimensions/page count and create safe preview derivatives.
5. Create a new immutable `drawing_file` and attach it to the working figure
   in a transaction.

SVG is sanitized before rendering; active content and external references are
rejected. PDFs and rasters receive safe previews. The API never serves a
caller-provided storage key without resolving authorized metadata.

Coordinates are percentages of displayed dimensions. Moving requires
`catalog.callout.manage`; attaching a missing part requires
`catalog.callout.map`. The API checks paired coordinates and same-figure
membership, increments the version, and audits before/after state.

Published releases pin exact drawing and derivative versions. Replacing a
working drawing cannot change live content.

## 10. Orders and deferred integrations

Authoritative order creation verifies each part against the caller's active
release and selected variant, rejects non-serviceable items, resolves permitted
prices and company discount, calculates decimal totals, snapshots lines, and
inserts a confirmation outbox event in one transaction.

Discount belongs to company/order, not catalog lines. Line totals and discounts
round to cents at each documented step.

The pilot treats submission as a request for quote. Inventory reservation,
payment, tax determination, binding purchase orders, and automated accounting
posting are outside scope.

A neutral `accounting_export` or `order.submitted` event may contain the
versioned order snapshot. A future Xero adapter maps it to Xero. Adapter failure
must never roll back or mutate the order.

## 11. Audit, observability, and operations

Every mutation writes audit in the same transaction. Audit writing is
unconditional, not a capability. Corrections append events rather than editing
history. Reads require `audit.log.view` and exports require
`audit.log.export`.

Structured logs contain timestamp, version, environment, request ID, route
template, latency, status, safe actor IDs, and error code. They exclude
credentials, cookies, reset tokens, signed URLs, and sensitive payload values.

Metrics and alerts cover latency/errors, authentication failures,
publish/import outcomes, outbox age, database connections, storage failure,
backup age and restore tests, disk, certificates, and uptime. Health endpoints
separate liveness from dependency readiness and expose no business data.

Deployments use backward-compatible migrations before traffic switches.
Destructive cleanup waits until all running versions stop using the old shape.
Production is deployed from source control and not edited manually.

## 12. Backup and recovery

| Layer | Policy |
|---|---|
| PostgreSQL PITR | Continuous WAL, seven-day window |
| Database snapshots | Nightly, encrypted, separate storage; 30 daily, 12 monthly, 7 annual |
| Drawing archive | Versioned weekly plus after bulk upload; 12 months |
| Offline export | Quarterly and before migration, held independently by RUFDiamond |

The portable export includes documented CSV/JSON, mappings and stable IDs,
release/audit manifests, drawings with checksums, and restoration instructions.

| Scenario | Maximum loss | Recovery time |
|---|---|---|
| Human error | Erroneous operation only | Under 1 hour |
| Database failure | Under 5 minutes | Under 4 hours |
| Region outage | Under 5 minutes | Provider-dependent without standby |
| Provider loss | Up to one quarter | 2–3 days |

Monthly automation restores a snapshot in isolation and checks migrations,
foreign keys, row counts, release checksums, callout completeness, drawing
checksums, and a sample customer read. A person performs a quarterly restore;
RUFDiamond rehearses annual recovery from offline export alone. A proven
restore is a launch gate.

Default to Canadian primary and normal backup locations, with the independent
archive in another failure domain. Do not buy a warm standby for the pilot
while phone/email is an acceptable fallback.

## 13. Errors and concurrency

Errors use RFC 9457 `application/problem+json` with `type`, `title`,
`status`, safe `detail`, `instance`, stable `code`, and `requestId`.
Validation adds field/domain issues. Publication and import add grouped
blockers without exposing unauthorized records.

| Status | Meaning |
|---|---|
| `400` | Malformed syntax or unsupported query |
| `401` | Missing, expired, or invalid authentication |
| `403` | Caller lacks a non-enumerating action permission |
| `404` | Missing or out-of-scope resource |
| `409` | Version, duplicate, idempotency, or workflow conflict |
| `422` | Well-formed request violates domain rules |
| `429` | Rate limit |
| `503` | Required dependency unavailable |

Expected domain failures are not server exceptions. Unexpected failures return
a generic problem and log context under the request ID. SQL, object keys, and
stacks never reach clients.

Optimistic concurrency protects ordinary edits. Publication uses a serializable
transaction and model lock. Order, import, and publish combine idempotency
records with uniqueness so retries are safe.

## 14. Test strategy

### Unit

- capability/scope evaluation and unknown-key denial
- paired percentage coordinates and same-figure rules
- multi-occurrence grouping and highlighting data
- supersession and directional requirements
- catalog state and publish blockers
- decimal line, discount, and total rounding
- session/token lifecycle
- import normalization and remarks parsing

### PostgreSQL integration

- empty and upgrade migrations
- FKs, partial uniqueness, paired-null/range checks
- repository scope against brand, fleet, account, draft, and price leaks
- rollback of failed import, order, audit, outbox, and publish
- optimistic/serializable conflicts
- snapshot completeness and checksum stability

### API and security

- OpenAPI conformance
- cookies, CSRF/origin, expiry, rotation, and rate limits
- complete pilot-role capability matrix
- URL tampering across companies, fleets, releases, drawings, and orders
- no draft leakage through search, counts, errors, exports, or URLs
- signed URL expiry and object-substitution resistance
- idempotency replay and mismatched payloads

### Import and publication

Fixtures cover every source column, 635-row/536-part expectations, missing
values, conflicting duplicates, bad prices/dates, ambiguous remarks,
unresolved requirements, and reruns. A rerun adds no duplicate and does not
erase unambiguously matched manual coordinates.

Publication tests prove every blocker stops activation, failure preserves the
old release, success exposes one coherent graph, later working edits do not
change it, rollback restores the exact snapshot, and concurrent publishers
cannot split live state.

The headline acceptance test selects a part appearing at several positions on
one figure and highlights every callout. Customer responses contain no
incomplete callouts.

### End-to-end and operational

- Catalog Admin imports, reviews, maps, uploads, publishes, and rolls back
- Purchaser submits; Technician can build but not submit
- a Fat Truck customer cannot discover IronHorse data
- submitted lines survive later part and price edits unchanged
- outbox retries do not duplicate logical notifications
- OWASP ZAP and dependency/container scans against staging
- restore checks meet the recovery objectives

## 15. Defaults and confirmations

| Topic | Approved design default |
|---|---|
| Order meaning | Request for quote, not binding PO |
| Technician pricing | Per-company; visible by default |
| Publisher | Named staff receive configurable `publish.execute` |
| Dealer behalf-of | Deferred until workflow is confirmed |
| Data residency | Canadian primary and normal backups |
| Availability | No warm standby while phone/email fallback works |
| Authentication | First-party sessions; admin MFA before broad rollout |
| Accounting | Neutral export/outbox only; Xero deferred |

One operational input remains urgent but does not change the architecture:
RUFDiamond must confirm ownership and format of original drawings. SVG with
usable text may allow coordinate extraction; flattened raster/PDF requires
manual mapping. This changes schedule and cost, not the storage, publication,
or authorization design.

Before purchasing infrastructure, RUFDiamond should confirm Canadian residency
against customer contracts and accept the four-hour database recovery target.
Provider selection for PostgreSQL, storage, email, and monitoring belongs in
the implementation plan and must preserve this design.

## 16. Design acceptance

An implementation satisfies this design when:

- every customer read resolves exactly one active immutable release
- draft, incomplete, unmapped, and out-of-scope data never reaches customers
- one part can map to and highlight multiple callout occurrences
- every mutation is capability-checked, scoped, audited, and transactional
- import is staged, reviewed, idempotent, and cannot publish
- drawings remain private and releases pin immutable versions
- submitted order lines and totals are durable snapshots
- release activation and rollback are atomic
- tested backups restore catalog, mappings, releases, drawings, accounts, and orders
- external delivery failures cannot corrupt domain transactions
- Xero remains a deferred adapter, not a hidden domain dependency
