# RUFDiamond Vite + Fastify Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Next.js/in-memory prototype safely with a Vite React client and a production Fastify/PostgreSQL backend whose customer reads use immutable releases.

**Architecture:** Build an npm-workspace modular monolith beside the existing prototype: shared transport contracts in `packages/contracts`, a Fastify API and worker in `apps/api`, and finally a Vite client in `apps/web`. PostgreSQL holds mutable working data and immutable release snapshots; customer repositories query only one authorized active release, while private object storage, audit, and an outbox protect drawing and workflow boundaries.

**Tech Stack:** Node.js 22 LTS, npm workspaces, TypeScript strict mode, React 19, Vite, React Router, Fastify 5, TypeBox, Drizzle ORM and migrations, PostgreSQL 16+, Argon2id, AWS SDK v3 S3 client, SheetJS, decimal.js, Vitest, Testcontainers, Fastify inject, React Testing Library, MSW, and Playwright.

**Spec:** `docs/backend-specification.md`

## Global Constraints

- Read `AGENTS.md` and `docs/backend-specification.md` before every task; do not infer current Next.js APIs from prior knowledge.
- Preserve the existing UI behavior and repository method semantics during migration; do not delete `src/` or remove Next.js until Task 13 parity passes.
- Customer catalog queries must resolve exactly one authorized active immutable release and must never join mutable working rows.
- A callout is one physical marker. Do not add uniqueness on `(figure_id, number)` or `figure_part_id`; return every occurrence for highlighting.
- Coordinates are paired nullable percentages in the inclusive range 0–100. Never fabricate coordinates during import.
- Publishing is serializable and blocked by missing drawings, unplaced/partless callouts, invalid hierarchy, unresolved parts, unreviewed parsed requirements, or invalid price/currency.
- Authorization checks concrete capabilities, never role names; unknown keys deny. Brand, account, fleet, environment, and price scopes are applied in SQL.
- Pilot defaults are RFQ orders, per-company technician pricing, named publishers, dealer behalf-of limited to explicitly authorized dealer accounts, private versioned drawings, Canadian primary/backups, and no warm standby while phone/email fallback remains acceptable.
- Every mutation writes audit and any required outbox event in the same transaction.
- Use RFC 9457 problem responses, optimistic versions for normal edits, and idempotency records for import apply, publish, and order submit.
- Xero remains deferred: no Xero dependency, credential, identifier, status, or schema. Only provider-neutral accounting/outbox payloads are permitted.
- Use test-driven development: add one focused failing test, run it and observe the expected failure, add minimal implementation, rerun the focused test, then run the task suite.
- Each task ends in the stated independently testable outcome and its own commit. Do not combine task commits.

---

## File structure locked by this plan

```
apps/
  api/
    src/
      app.ts                 Fastify composition only
      server.ts              process startup/shutdown
      config.ts              validated environment
      db/{client,schema,index}.ts
      plugins/{auth,csrf,error-handler,request-context}.ts
      modules/
        identity/
        authorization/
        catalog/
        drawings/
        imports/
        publication/
        orders/
        accounts/
        audit/
        outbox/
      worker/{main,outbox-worker}.ts
    test/{helpers,fixtures,integration,contract}/
    drizzle/
  web/
    src/{app,components,data,lib,state,types}/
    e2e/
packages/
  contracts/src/{common,auth,catalog,admin,orders,index}.ts
infra/
  compose.yaml
  backup/{backup-db,restore-verify,export-portable}.sh
  runbooks/{restore.md,release.md}
```

Files inside each module follow `routes.ts` (HTTP), `service.ts`
(transactions/policy), `repository.ts` (scoped SQL), `schemas.ts`
(transport validation), and focused domain files. Do not create a generic
`utils.ts` or cross-module repository.

### Task 1: Workspace and executable contract boundary

**Files:**
- Modify: `package.json`
- Create: `tsconfig.base.json`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/common.ts`
- Create: `packages/contracts/src/catalog.ts`
- Create: `packages/contracts/src/admin.ts`
- Create: `packages/contracts/src/auth.ts`
- Create: `packages/contracts/src/orders.ts`
- Create: `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/contracts.test.ts`

**Interfaces:**
- Consumes: the exact public shapes in `src/types/catalog.ts` and `src/types/admin.ts`.
- Produces: `ProblemDetails`, `SessionUser`, catalog/admin read models, `SubmitOrderInput`, and `OrderDetail` exported from `@rufdiamond/contracts`.

- [ ] **Step 1: Add a failing contract test**

```ts
import { Value } from "@sinclair/typebox/value";
import { CalloutSchema, ProblemDetailsSchema } from "./index.js";

it("accepts duplicate-number callouts and rejects a half coordinate", () => {
  const a = { id: crypto.randomUUID(), figureId: "f", figurePartId: "fp", number: 7, x: 10, y: 20 };
  const b = { ...a, id: crypto.randomUUID(), x: 40 };
  expect(Value.Check(CalloutSchema, a)).toBe(true);
  expect(Value.Check(CalloutSchema, b)).toBe(true);
  expect(Value.Check(CalloutSchema, { ...a, y: null })).toBe(false);
  expect(Value.Check(ProblemDetailsSchema, {
    type: "https://parts.rufdiamond.com/problems/validation",
    title: "Validation failed", status: 422, code: "VALIDATION_FAILED",
    requestId: "req-1"
  })).toBe(true);
});
```

- [ ] **Step 2: Run `npm test -w @rufdiamond/contracts -- contracts.test.ts`**

Expected: FAIL because the workspace and schemas do not exist.

- [ ] **Step 3: Add npm workspaces without changing the existing root Next scripts**

Set `workspaces` to `["apps/*", "packages/*"]`; add additive scripts
`test:contracts`, `test:api`, and `test:web`. Keep `dev`, `build`,
`start`, and existing dependencies unchanged until Task 13.

- [ ] **Step 4: Define shared schemas and inferred types**

```ts
export const CalloutSchema = Type.Object({
  id: Type.String(), figureId: Type.String(),
  figurePartId: Type.Union([Type.String(), Type.Null()]),
  number: Type.Integer(),
  x: Type.Union([Type.Number({ minimum: 0, maximum: 100 }), Type.Null()]),
  y: Type.Union([Type.Number({ minimum: 0, maximum: 100 }), Type.Null()])
}, { $id: "Callout" });
export type Callout = Static<typeof CalloutSchema>;
export interface SubmitOrderInput {
  variantId: string;
  customerReference: string;
  behalfOfCompanyId?: string;
  lines: Array<{ releasePartId: string; qty: number }>;
}
```

Add a custom paired-coordinate schema check used by API/domain validation.
Copy current read-model property names exactly; add `SessionUser` with
`id`, `companyId`, `capabilities: string[]`, and safe scope summaries.

- [ ] **Step 5: Run contract tests and typecheck**

Run: `npm test -w @rufdiamond/contracts && npm run typecheck -w @rufdiamond/contracts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json packages/contracts
git commit -m "build: add shared API contracts"
```

**Checkpoint:** Existing Next build still passes; contracts encode current UI
shapes without importing React, Fastify, or database types.

### Task 2: Fastify shell, configuration, and RFC 9457 failures

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/vitest.config.ts`
- Create: `apps/api/src/config.ts`, `apps/api/src/app.ts`, `apps/api/src/server.ts`
- Create: `apps/api/src/plugins/request-context.ts`
- Create: `apps/api/src/plugins/error-handler.ts`
- Test: `apps/api/test/contract/health.test.ts`
- Test: `apps/api/test/contract/problems.test.ts`

**Interfaces:**
- Consumes: `ProblemDetails` from Task 1.
- Produces: `buildApp(options: { config: AppConfig; dependencies?: Partial<AppDependencies> }): Promise<FastifyInstance>`, `AppError`, and request IDs.

- [ ] Write failing Fastify-inject tests proving `GET /health/live` returns
`{status:"ok"}`, an unknown route returns RFC 9457 JSON, invalid input never
returns a stack, and response header `x-request-id` matches `requestId`.
- [ ] Run `npm test -w @rufdiamond/api -- health.test.ts problems.test.ts`;
expect module-not-found failure.
- [ ] Create validated `AppConfig` for `NODE_ENV`, `PORT`,
`DATABASE_URL`, `SESSION_SECRET`, `WEB_ORIGIN`, and S3 settings. Tests
inject config; importing modules must not read environment variables.
- [ ] Implement `AppError(code, status, detail, issues?)` and one error
handler mapping schema errors to 400, domain validation to 422, conflicts to
409, rate limits to 429, dependencies to 503, and unexpected errors to generic
500 problems.
- [ ] Implement app composition and graceful SIGTERM shutdown in `server.ts`.
Keep business routes absent.
- [ ] Run API tests, API typecheck, and `npm run build`; expect PASS.
- [ ] Commit with `git commit -m "feat: add Fastify API shell"`.

**Checkpoint:** The API starts without the front end, validates configuration,
and has one safe failure envelope.

### Task 3: PostgreSQL migrations and database test harness

**Files:**
- Create: `infra/compose.yaml`
- Create: `apps/api/drizzle/0001_core.sql`
- Create: `apps/api/drizzle/0002_release_snapshots.sql`
- Create: `apps/api/drizzle/0003_identity_orders_operations.sql`
- Create: `apps/api/src/db/schema/*.ts`, `client.ts`, `index.ts`
- Create: `apps/api/test/helpers/postgres.ts`
- Test: `apps/api/test/integration/schema.test.ts`

**Interfaces:**
- Produces: `Database`, `withTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>`, and typed tables used by every later repository.

- [ ] Write failing Testcontainers tests for empty migration, FK rejection,
one-active-release partial uniqueness, paired-null/range constraints, no
uniqueness on repeated callouts, directional requirement self-check, and
positive quantities.
- [ ] Run the focused test; expect missing migrations.
- [ ] Implement normalized working tables, all release tables, company/access,
session/reset, order/line, import/staging/issue, audit, outbox, and
`idempotency_record(actor_id, operation, key, request_hash, status, response)`.
- [ ] Add a composite candidate key `figure_part(id, figure_id)` and composite
FK `callout(figure_part_id, figure_id)` so cross-figure mapping is impossible
while nullable mappings remain legal.
- [ ] Give every working mutable aggregate `version integer not null default
1`; use numeric money/rates, UTC timestamps, immutable object keys, checksums,
and partial unique active-release index.
- [ ] Run migrations twice against an empty test database, schema tests, and
Drizzle typecheck; expect PASS.
- [ ] Commit `feat: add PostgreSQL domain schema`.

**Checkpoint:** Database constraints independently preserve the load-bearing
callout, snapshot, and money structure.

### Task 4: Audit, idempotency, and transactional outbox primitives

**Files:**
- Create: `apps/api/src/modules/audit/audit-repository.ts`
- Create: `apps/api/src/modules/outbox/outbox-repository.ts`
- Create: `apps/api/src/modules/outbox/idempotency-repository.ts`
- Create: `apps/api/src/modules/outbox/outbox-worker.ts`
- Create: `apps/api/src/worker/main.ts`
- Test: `apps/api/test/integration/transaction-primitives.test.ts`

**Interfaces:**
- Produces:
```ts
interface MutationContext { actorUserId: string; companyId: string; capability: string; requestId: string; correlationId?: string }
interface AuditWriter { append(tx: Transaction, event: AuditEvent): Promise<void> }
interface OutboxWriter { enqueue(tx: Transaction, event: { type: string; aggregateId: string; payloadVersion: 1; payload: unknown }): Promise<void> }
interface IdempotencyStore {
  begin(tx: Transaction, input: { actorId: string; operation: string; key: string; requestHash: string }): Promise<"started" | StoredResponse>;
  complete(tx: Transaction, response: StoredResponse): Promise<void>;
}
```

- [ ] Write failing tests proving domain rollback removes audit/outbox rows,
commit retains all three, key replay returns stored response, changed request
hash returns `IDEMPOTENCY_KEY_REUSED`, and two workers cannot claim one event.
- [ ] Run focused tests and observe missing-module failure.
- [ ] Implement append-only writers and a worker claim query using
`FOR UPDATE SKIP LOCKED`; use exponential retry metadata and a terminal
failed state without deleting payloads.
- [ ] Run focused integration tests and typecheck; expect PASS.
- [ ] Commit `feat: add transactional audit and outbox`.

### Task 5: Identity, sessions, CSRF, and capability scopes

**Files:**
- Create: `apps/api/src/modules/identity/{schemas,repository,service,routes}.ts`
- Create: `apps/api/src/modules/authorization/{capabilities,types,policy,scope-sql}.ts`
- Create: `apps/api/src/plugins/{auth,csrf}.ts`
- Create: `apps/api/src/db/seeds/capabilities.ts`
- Test: `apps/api/test/integration/auth.test.ts`
- Test: `apps/api/test/integration/authorization.test.ts`

**Interfaces:**
- Produces:
```ts
type Capability = /* literal union of every key in capability-and-role-spec.md */;
interface AuthorizationContext {
  userId: string; companyId: string; capabilities: ReadonlySet<Capability>;
  brandIds: "all" | readonly string[]; accountIds: "all" | readonly string[];
  fleet: "all" | readonly string[]; environment: "published" | "draft";
  priceTier: string; canViewPrices: boolean;
}
function requireCapability(ctx: AuthorizationContext, key: Capability): void;
function catalogScope(ctx: AuthorizationContext): CatalogSqlScope;
```

- [ ] Write failing tests for Argon2id sign-in, hashed session storage, cookie
flags, rotation, expiry/revocation, reset non-enumeration, CSRF rejection, full
pilot capability bundles, unknown-key denial, named-publisher assignment, and
per-company technician pricing.
- [ ] Add query-scope tests proving a Fat Truck customer cannot fetch
IronHorse, another company, non-fleet variants, draft rows, price fields when
disabled, or dealer behalf-of accounts not explicitly assigned.
- [ ] Implement `POST /api/v1/auth/sign-in`, sign-out, reset request/complete,
and `GET /api/v1/me`. Never return password/session/reset hashes.
- [ ] Seed the full capability register and only Catalog Admin, Purchaser, and
Technician pilot bundles. Assign `publish.execute` to named users through
role data, never an email/name conditional.
- [ ] Run auth and authorization suites; expect PASS.
- [ ] Commit `feat: enforce session and capability authorization`.

### Task 6: Active-release customer catalog API

**Files:**
- Create: `apps/api/src/modules/catalog/{schemas,release-repository,service,routes}.ts`
- Create: `apps/api/test/fixtures/released-catalog.ts`
- Test: `apps/api/test/integration/customer-catalog.test.ts`
- Test: `apps/api/test/contract/catalog-contract.test.ts`

**Interfaces:**
- Produces:
```ts
interface ReleaseCatalogRepository {
  resolveActiveRelease(tx: DbLike, ctx: AuthorizationContext, modelId: string): Promise<string | null>;
  getFigureDetail(ctx: AuthorizationContext, figureId: string): Promise<FigureDetail | null>;
  searchParts(ctx: AuthorizationContext, query: string, cursor?: string): Promise<Page<Part>>;
}
```
- Routes are exactly the customer catalog routes in the specification.

- [ ] Write failing seeded-database tests for every route and current
`repository.ts` composite shape.
- [ ] Add the critical leakage test: publish release A, modify working part,
price, callout, and drawing, then assert every customer endpoint still returns
A while draft preview returns the changes.
- [ ] Add multi-occurrence data with two callout rows pointing to one
`figure_part`; assert `FigureDetail.callouts` contains both and
`calloutNumbers` is ascending/de-duplicated only for display.
- [ ] Implement release-only SQL. Start each request by resolving the authorized
active release; pass `releaseId` through all subsequent queries. Never import
working schema in `release-repository.ts`.
- [ ] Return 404 for absent/out-of-scope IDs and omit price values when the
effective company setting denies price visibility.
- [ ] Run catalog integration, contract, and scope tests; expect PASS.
- [ ] Commit `feat: serve immutable released catalog`.

**Checkpoint:** A customer can browse realistic catalog data and cannot observe
working edits by URL, search, count, error, or response.

### Task 7: Working catalog admin and optimistic callout mapping

**Files:**
- Create: `apps/api/src/modules/catalog/{working-repository,admin-service,admin-routes,publish-validation}.ts`
- Test: `apps/api/test/integration/admin-catalog.test.ts`
- Test: `apps/api/test/unit/publish-validation.test.ts`

**Interfaces:**
- Produces:
```ts
interface UpdateCalloutInput { figurePartId: string | null; x: number | null; y: number | null; version: number }
interface PublishBlocker { code: "DRAWING_MISSING" | "CALLOUT_UNPLACED" | "CALLOUT_PARTLESS" | "CALLOUT_CROSS_FIGURE" | "PART_UNRESOLVED" | "REQUIREMENT_UNREVIEWED" | "HIERARCHY_INVALID" | "PRICE_INVALID"; modelId: string; variantId?: string; figureId?: string; count: number }
function derivePublishBlockers(graph: WorkingCatalogGraph): PublishBlocker[];
```

- [ ] Write failing tests for admin summary/read models, concrete capability
checks, 0/100 coordinates, paired nulls, cross-figure rejection, version
conflict, mapping/moving capability separation, and audit rollback.
- [ ] Write table-driven unit tests containing one graph for each blocker and
a complete graph returning `[]`.
- [ ] Implement scoped admin reads and `PATCH /api/v1/admin/callouts/:id`.
Use `UPDATE ... WHERE id = ? AND version = ?`, increment version, and return
409 when zero rows match.
- [ ] Implement the remaining model/variant/system/figure/part relationship
CRUD needed by existing screens, each with explicit capability, version, audit,
and no customer-table effect.
- [ ] Run focused and API suites; expect PASS.
- [ ] Commit `feat: add audited working catalog administration`.

### Task 8: Staged idempotent spreadsheet import

**Files:**
- Create: `apps/api/src/modules/imports/{schemas,parser,normalizer,remarks-parser,repository,service,routes}.ts`
- Create: `apps/api/test/fixtures/imports/{ft3-minimal,duplicates,invalid,rerun}.xlsx`
- Test: `apps/api/test/unit/import-parser.test.ts`
- Test: `apps/api/test/integration/import-workflow.test.ts`

**Interfaces:**
- Produces:
```ts
interface NormalizedImportRow { sourceRow: number; sourceKey: string; partNumber: string; description: string; model: string; variant: string; system: string; groupNo: string; figureName: string; effectiveFrom: string | null; effectiveTo: string | null; qty: number; pnc: number | null; listPrice: string; currency: "CAD"; manufacturer: string | null; serviceable: boolean; remarks: string | null }
interface RequirementProposal { requiredPartNumber: string; qty: number; sourceText: string; reviewState: "pending" | "approved" | "rejected" }
```

- [ ] Write parser tests mapping every documented column and rejecting malformed
price/date/quantity while preserving raw row context.
- [ ] Write workflow tests for upload → parse → validate/diff → relationship
review → apply, exact checksum replay, changed rerun, conflicting duplicate,
unresolved requirement, audit/outbox atomicity, and no automatic publication.
- [ ] Assert imported callouts have linked figure parts when resolvable and
`x/y = null`; reruns retain coordinates only on unambiguous stable keys.
- [ ] Implement the endpoints from Task 2's route contract with
`parts.import`, private source-file metadata, SHA-256, staging transactions,
stable keys, and idempotent upserts.
- [ ] Apply only when blocking issues are resolved and all parsed requirements
are approved/rejected. Revalidate inside the apply transaction.
- [ ] Run import unit/integration tests twice; expect identical counts and PASS.
- [ ] Commit `feat: add staged idempotent catalog import`.

### Task 9: Private versioned drawing storage

**Files:**
- Create: `apps/api/src/modules/drawings/{types,object-store,validation,service,routes}.ts`
- Create: `apps/api/test/helpers/fake-object-store.ts`
- Test: `apps/api/test/integration/drawings.test.ts`

**Interfaces:**
- Produces:
```ts
interface ObjectStore {
  createUpload(key: string, contentType: string, maxBytes: number): Promise<{ url: string; expiresAt: string }>;
  head(key: string): Promise<{ bytes: number; checksum: string; contentType: string } | null>;
  createDownload(key: string, expiresSeconds: number): Promise<{ url: string; expiresAt: string }>;
}
interface FinalizeDrawingInput { figureId: string; uploadId: string; sha256: string; version: number }
```

- [ ] Write failing tests for opaque immutable keys, unauthorized upload,
oversize/signature/checksum mismatch, SVG active-content rejection, successful
version attachment/audit, expired download, object-ID substitution, and live
release continuing to use its pinned old drawing after replacement.
- [ ] Implement intent and finalize routes with MIME signature validation,
malware adapter result, dimension/page metadata, safe derivative metadata, and
`catalog.drawing.upload`.
- [ ] Implement authorized release-aware download issuance with a five-minute
default expiry. Never expose bucket/key in customer DTOs.
- [ ] Run drawing and catalog leakage suites; expect PASS.
- [ ] Commit `feat: add private versioned drawing storage`.

### Task 10: Atomic publication and rollback

**Files:**
- Create: `apps/api/src/modules/publication/{schemas,repository,service,routes,checksum}.ts`
- Test: `apps/api/test/integration/publication.test.ts`

**Interfaces:**
- Produces:
```ts
interface PublishInput { modelId: string; expectedWorkingVersion: number; revision: string; summary: string }
interface PublicationService {
  queue(ctx: AuthorizationContext): Promise<PublishQueue>;
  publish(ctx: MutationContext, input: PublishInput, idempotencyKey: string): Promise<{ releaseId: string; revision: string }>;
  rollback(ctx: MutationContext, releaseId: string, idempotencyKey: string): Promise<{ activeReleaseId: string }>;
}
```

- [ ] Write failing tests that each Task 7 blocker prevents publication and
returns grouped RFC 9457 issues without changing the active release.
- [ ] Test successful deep snapshot, deterministic checksum, exact drawing
version, active partial uniqueness, audit/outbox, idempotent replay, expected
version conflict, transaction failure, rollback, and two concurrent publishers.
- [ ] Implement queue from derived blockers and publish using PostgreSQL
`SERIALIZABLE`, a model advisory/row lock, complete snapshot inserts, checksum,
and atomic active switch.
- [ ] Implement rollback as an atomic active-pointer switch to an immutable
prior release. Never mutate snapshot rows.
- [ ] Run publication, customer leakage, and concurrency suites; expect PASS.
- [ ] Commit `feat: publish immutable catalog releases`.

**Checkpoint:** Working edits/imports remain invisible until an authorized,
complete, atomic release; rollback restores the exact prior customer graph.

### Task 11: RFQ orders, narrow dealer behalf-of, and outbox delivery

**Files:**
- Create: `apps/api/src/modules/orders/{schemas,money,repository,service,routes,events}.ts`
- Create: `apps/api/src/modules/outbox/handlers/order-confirmation.ts`
- Test: `apps/api/test/unit/money.test.ts`
- Test: `apps/api/test/integration/orders.test.ts`

**Interfaces:**
- Consumes: `SubmitOrderInput` from Task 1 and active-release repository.
- Produces `submitOrder(ctx, input, idempotencyKey): Promise<OrderDetail>` and
`OrderSubmittedV1`, a provider-neutral event with snapshotted order fields.

- [ ] Write decimal tests proving each line and discount rounds to cents and
line sums equal stored totals.
- [ ] Write integration tests for purchaser success, technician denial,
non-serviceable/unreleased/wrong-variant rejection, hidden-price policy,
snapshot immutability, idempotent retry, audit/outbox atomicity, and RFQ
`new` status.
- [ ] Test `orders.behalf` requires both capability and an explicit target
company in the dealer's account scope; all other target IDs return 404.
- [ ] Implement submission in one transaction, recalculating price and fitment
from the active release rather than trusting browser snapshots.
- [ ] Implement idempotent confirmation handler. Keep payload versioned and
provider-neutral; add no Xero package or field.
- [ ] Run money, order, authorization, and outbox tests; expect PASS.
- [ ] Commit `feat: submit auditable RFQ orders`.

### Task 12: Replace the in-memory seam with an HTTP client

**Files:**
- Create: `src/data/api-client.ts`
- Create: `src/data/http-repository.ts`
- Modify: `src/data/repository.ts`
- Modify: `src/state/AppProviders.tsx`
- Modify: `src/state/RequestContext.tsx`
- Test: `src/data/http-repository.test.ts`
- Test: `src/state/RequestContext.test.tsx`

**Interfaces:**
- Produces the same named async methods currently exported from
`src/data/repository.ts`: `getProductLines`, `getModels`, `getVariants`,
`getSystems`, `getFigures`, `getFigureDetail`, `searchParts`,
`getCatalogSummary`, `getModelDetail`, `getFiguresForModel`,
`getAllParts`, `getOrders`, and `getPublishQueue`.

- [ ] Write MSW contract tests for each method's path, credentials, DTO, null/
404 behavior, problem parsing, and returned-object independence.
- [ ] Add a failing provider test proving `GET /me` replaces
`PLACEHOLDER_COMPANY` and server order confirmation replaces locally
generated references/totals.
- [ ] Implement one typed `request<T>()` with `credentials:"include"`,
CSRF header for mutations, request ID capture, and `ApiProblem`.
- [ ] Switch repository methods to HTTP while preserving signatures. Keep
`seed.ts` available behind a test-only adapter until Vite parity completes;
production code must not import it.
- [ ] Change order submission to send only variant, customer reference, target
company when authorized, release-part IDs, and quantities; render server
snapshots from the response.
- [ ] Run focused tests and the unchanged Next lint/build; expect PASS.
- [ ] Commit `feat: connect frontend repository to API`.

### Task 13: Parallel Vite migration and parity cutover

**Files:**
- Create: `apps/web/package.json`, `vite.config.ts`, `tsconfig*.json`, `index.html`
- Create: `apps/web/src/main.tsx`, `app/router.tsx`, `app/App.tsx`
- Move/adapt: current `src/components`, `src/lib`, `src/state`, `src/types`, styles, and route screens into `apps/web/src`
- Create: `apps/web/e2e/parity.spec.ts`
- Modify after parity: root `package.json`
- Retain temporarily: current root `src/app` and Next configuration until the final step

**Interfaces:**
- Consumes: Task 12 repository and existing route URLs.
- Produces: a Vite SPA with the same URLs and browser behaviors.

- [ ] Read the installed Next migration-relevant docs under
`node_modules/next/dist/docs/` before adapting any Next-specific component,
as required by `AGENTS.md`.
- [ ] Write Playwright parity tests for sign-in, machine select, search,
systems, figures, multi-marker selection, request/RFQ confirmation, admin
catalog, hotspot mapping, parts, orders, and publishing.
- [ ] Create Vite alongside Next. Use React Router route objects preserving
`/signin`, portal paths, dynamic figure/system/model IDs, and admin paths.
- [ ] Replace `next/link`, `next/navigation`, layouts, server pages,
`notFound`, metadata, and `next/font` with React Router, route loaders/
components, document metadata, and locally/self-hosted font CSS. Preserve CSS
module class names and state storage keys.
- [ ] Point Vite dev proxy `/api` at Fastify; use same-origin production
deployment so secure session/CSRF policy is simple.
- [ ] Run both applications against the same API and execute parity tests.
Expected: all routes and headline workflows pass in Vite before cutover.
- [ ] Only after parity, make root `dev`, `build`, `start`, `lint`,
`typecheck`, and `test` orchestrate workspaces. Remove Next dependencies,
config, and legacy `src/app`; retain domain contracts and git history.
- [ ] Run clean install, all tests, lint, typecheck, production builds, and
Playwright. Confirm `rg 'from "next|next/' apps/web/src` returns no matches.
- [ ] Commit `feat: migrate portal frontend to Vite`.

**Checkpoint:** Cutover occurs only after Vite parity; at every earlier commit,
the original Next application remains recoverable and testable.

### Task 14: Deployment, backup, restore, and security launch gate

**Files:**
- Modify: `infra/compose.yaml`
- Create: `apps/api/Dockerfile`, `apps/web/Dockerfile`
- Create: `infra/backup/backup-db.sh`
- Create: `infra/backup/restore-verify.sh`
- Create: `infra/backup/export-portable.sh`
- Create: `infra/runbooks/restore.md`, `infra/runbooks/release.md`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/backup-verify.yml`
- Test: `apps/api/test/integration/portable-export.test.ts`
- Test: `apps/web/e2e/security.spec.ts`

**Interfaces:**
- Backup commands accept explicit database URLs and bucket prefixes; they
refuse empty values and never infer broad filesystem targets.
- Portable manifest schema:
```ts
interface PortableExportManifest {
  formatVersion: 1; createdAt: string; releaseIds: string[];
  files: Array<{ path: string; sha256: string; bytes: number }>;
}
```

- [ ] Write failing export test proving catalog CSV/JSON, stable mapping IDs,
release/audit manifests, drawings, checksums, and restore instructions are
included and Xero artifacts are absent.
- [ ] Implement multi-stage non-root images, health checks, graceful shutdown,
immutable image tags, and local production-equivalent Compose services.
- [ ] Implement PITR configuration/runbook, nightly snapshot schedule and
retention (30 daily/12 monthly/7 annual), weekly and post-bulk drawing archive,
quarterly portable export, Canadian primary/normal backup requirement, and
independent archive failure domain.
- [ ] Implement isolated monthly restore verification checking migrations,
foreign keys, counts, active-release checksums, callout completeness, drawing
checksums, and a sample customer request. Document quarterly human and annual
offline-only rehearsals with recorded duration.
- [ ] Add CI for clean install, migrations, unit/integration/contract tests,
lint, typecheck, builds, Playwright, dependency/container scan, and ZAP against
staging. Never print secrets or signed URLs.
- [ ] Execute the full launch command sequence:
```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
docker compose -f infra/compose.yaml build
./infra/backup/restore-verify.sh
```
Expected: every command exits 0; restore report records achieved RPO/RTO and
the sample customer read uses one active release.
- [ ] Perform the role/URL-tampering checklist and OWASP ZAP staging scan.
Record results in the release runbook; unresolved high-severity findings block
launch.
- [ ] Commit `ops: add verified deployment and recovery workflow`.

**Final acceptance:** Confirm every criterion in
`docs/backend-specification.md#16-design-acceptance`, record evidence beside
the CI/restore artifact, and do not launch until the restore rehearsal passes.

## Execution sequence

Tasks 1–6 establish contracts, safety primitives, and a demonstrable
read-only released catalog. Tasks 7–11 add working administration and
transactional workflows without exposing draft state. Task 12 changes only the
existing repository seam. Task 13 performs the Vite migration alongside the
still-working Next application and cuts over after parity. Task 14 is the
production launch gate.

Use **superpowers:subagent-driven-development** for execution: dispatch one
fresh worker per task, require specification review and code-quality review
before advancing, and keep each task's commit independently revertible. Use
**superpowers:executing-plans** only if the work must remain in one session;
execute in checkpointed batches and stop after Tasks 3, 6, 10, 13, and 14 for
review.
