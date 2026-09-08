# RufDiamond Backend–Frontend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace demonstration authentication, catalogue reads and RFQs with tested Fastify/PostgreSQL services, then move the existing customer experience safely to Vite.

**Architecture:** Keep the modular monolith and composite repository seam. Complete backend use cases before switching each frontend workflow; keep Next operational beside Vite until parity. Customer data comes only from immutable active release snapshots; staff editing is a separate scoped API.

**Tech Stack:** Existing TypeScript, TypeBox, Fastify 5, Drizzle, PostgreSQL 17, React 19; Vite/React Router, Argon2id, decimal.js, AWS S3 SDK, Vitest, Testcontainers, Testing Library, MSW and Playwright. Pin compatible versions in the lockfile during implementation; no dependency installation is part of writing this plan.

**Spec:** `docs/backend-specification.md`, `docs/superpowers/specs/2026-09-07-integration-and-ovh-design.md`; companion deployment plan `docs/superpowers/plans/2026-09-07-ovh-staging-production.md`.

## Global Constraints

- Read `AGENTS.md`; read installed Next guides before modifying Next-specific code.
- This plan supersedes unimplemented Tasks 4–14 of the September 4 plan. Preserve the existing five migrations and foundation; do not recreate them.
- Customer reads resolve exactly one active immutable release per model per request; never join draft catalogue values. Scope lists, counts, search, exports and drawing access in SQL.
- One callout is one physical occurrence. Repeated numbers and multiple callouts for one figure-part are valid. Paired coordinates are nullable or finite inclusive 0–100; `(0,0)` is valid.
- Unmapped, unplaced, incomplete or unreviewed catalogue data cannot publish. Local preview proposals are not approvals. Never grant `publish.block.override`.
- Capabilities plus brand/account/fleet/environment/price scope decide access, never role-name conditionals. Defaults: RFQ pilot, per-company technician pricing, named publishers, narrow explicit dealer/customer pairing.
- Mutations use optimistic versions, transactional audit/outbox, and idempotency for RFQ/import apply/publication. Errors use RFC 9457.
- No Xero code, credentials, fields or dependencies; provider-neutral export/outbox only.
- No paid infrastructure, real customer notifications, production imports or production launch within local implementation tasks.
- Keep unrelated worktree artifacts untouched. Stage exact task files, not `git add .`; a task ends with tests, spec review, code review and a focused commit.

---

## Inventory and file boundaries

Existing: `apps/api/src/app.ts` exposes only `/health/live`; schemas live in
`apps/api/src/db/schema/{catalog,releases,identity,operations}.ts`; five SQL
migrations exist. Shared contracts export raw TypeScript. The root Next app
uses `src/data/repository.ts`, `src/state/{AppProviders,MachineContext,RequestContext}.tsx`
and `src/state/useAsync.ts`. Sign-in only redirects; RFQs are local state.

Create focused modules under `apps/api/src/modules/`: `audit`, `outbox`,
`identity`, `authorization`, `catalog`, `drawings`, `imports`, `publication`,
`orders`, `accounts`. Within a module, `routes.ts` handles transport,
`service.ts` transactions/policy, `repository.ts` scoped persistence and
`schemas.ts` runtime boundaries; named domain files hold pure rules. Do not
hide policy in generic repository utilities.

Add the HTTP adapter in existing `src/data/` first. Create `apps/web` only at
Task 12. Keep frontend shared state, drawing geometry and components intact
unless a contract change requires a targeted adjustment. Production assets
are an allowlist of public branding/fonts, not a copy of root `public/`.

## Contract decisions used by all tasks

Shared types below are exported from `packages/contracts/src/`; their TypeBox
schemas must encode the same shape with `additionalProperties:false`.
Keep existing composite fields unless a change is explicitly listed here.

```ts
export type Money = string; // runtime: ^(0|[1-9][0-9]{0,11})\.[0-9]{2}$
export type Currency = "CAD" | "USD";
export type OrderStatus = "submitted" | "quoted" | "confirmed" | "fulfilled" | "cancelled";
export interface ReleaseRef { modelId: string; releaseId: string; revision: number }
export interface Page<T> { items: T[]; nextCursor: string | null; releases: ReleaseRef[] }
export interface DrawingAsset {
  id: string; contentUrl: string; filename: string;
  format: "png" | "jpg"; width: number; height: number; version: number;
}
export interface RfqDetails {
  generalComment: string;
  shipping: { address: string; method: "standard" | "expedited" | null } | null;
}
export interface SubmitOrderInput {
  variantId: string; releaseId: string; customerReference: string;
  behalfOfCompanyId?: string; details: RfqDetails;
  lines: { releasePartId: string; qty: number; comment: string }[];
}
export interface SubmitOrderResult { id: string; reference: string; status: "submitted" }
export interface CalloutPatch {
  version: number; figurePartId?: string | null;
  x?: number | null; y?: number | null; maskPath?: string | null;
}
export interface PublishInput { modelId: string; expectedWorkingVersion: number; summary: string }
export interface PublishResult extends ReleaseRef { checksum: string }
```

`Part.id`, navigation IDs and composite FK fields exposed to the UI are stable
working IDs. `Part.releasePartId` is a separate required release-local UUID
in customer DTOs. `FigureDetail` adds `release: ReleaseRef` and
`drawing: DrawingAsset`; customer drawings cannot be null. Staff draft detail
has a separate schema allowing missing drawings/mappings/coordinates.
`Part.listPrice?: Money`, order monetary totals/line prices and company rates
are omitted when hidden, never sent as zero. Company rates are decimal strings
with six fractional digits. Authorized nullable list prices remain `null` in
staff DTOs; customer publication requires all orderable prices.

`Callout.number` becomes a nonempty string, `maskPath:string|null` is optional
artwork, not a placement requirement. `calloutNumbers` becomes string arrays
with natural numeric ordering and display deduplication only. Metadata
`manufacturer`, `country`, `groupNo`, `catalogRevision` may be null and render
an em dash, not invented text. `Company.type` includes `internal`; add
`defaultShippingAddress:string|null`. Canonical order status is the existing
DB enum above; do not create a second `new/shipped` enum for admin transport.
Use `discountApplied` consistently in API/UI; map DB `discount_applied`
explicitly, replacing the old contract's `discountTotal`. Customer figure
status is derived as `published`; customer model catalogue state is `live`.
Staff catalogue state derives from active release/draft/import presence, not a
new model lifecycle column. All release revisions in admin contracts are
integers, distinct from the nullable source `catalogRevision` label.

All lists default to 50/max 100 rows. Query cursors are authenticated opaque
tokens binding query, scope version, sort position and release references.
`409 RELEASE_CHANGED` restarts navigation/price review, never silently remaps
a draft cart. Search takes a selected `modelId` when available; global search
captures the allowed model/release set once and never returns draft-only parts.

## Endpoint and frontend mapping

Every path below is prefixed `/api/v1`; UUID path parameters are validated.
Use TypeBox request and response schemas to emit OpenAPI.

| Existing consumer / operation | Endpoint | Response / authority |
| --- | --- | --- |
| Sign-in, session, logout | `POST /auth/sign-in`, `GET /me`, `POST /auth/sign-out` | session cookie; `/me` includes safe user/company/scopes/capabilities/CSRF token |
| Recovery | `POST /auth/password-reset/request`, `POST /auth/password-reset/complete` | generic accepted response; single-use token |
| `getProductLines`, `getModels` | `GET /product-lines`, `GET /models?productLineId=` | scoped `Page<ProductLine>` / `Page<Model>` |
| `getVariants`, `getSystems`, `getFigures` | `GET /models/:id/variants`, `/variants/:id/systems`, `/variants/:id/systems/:systemId/figures` | released hierarchy pages |
| `getFigureDetail` | `GET /figures/:id` | composite `FigureDetail` from one release |
| `getDrawingFile` / viewer | `GET /drawings/:id?figureId=&releaseId=` and `/drawings/:id/content?figureId=&releaseId=` | authorized metadata / streamed derivative; pinned active release |
| `searchParts`, `searchPartUsages` | `GET /parts/search?q=&mode=part|description|any&modelId=&cursor=` | `Page<PartUsageRow>`; one row per released usage |
| `getPartUsageIndex` | `POST /parts/usages/query` | `{partIds:string[],modelId:string}` to scoped usage rows; 100 IDs maximum |
| Request submit/history/confirmation | `POST /orders`, `GET /orders`, `GET /orders/:id` | immutable server RFQ; `Idempotency-Key` on submit |
| Staff working composites | `GET /admin/catalog/summary`, `/admin/models/:id`, `/admin/models/:id/figures`, `/admin/parts`, `/admin/publication-queue` | corresponding shared admin schemas; explicit view capabilities and draft scope |
| Staff mutations | `/admin/models`, `/admin/variants`, `/admin/systems`, `/admin/figures`, `/admin/parts`, `/admin/callouts` | POST/PATCH/DELETE as specified in Task 7, capability per operation |
| Imports | `POST /admin/imports`, `GET /admin/imports/:id`, `POST /admin/imports/:id/validate`, `PATCH /admin/imports/:id/issues/:issueId`, `POST /admin/imports/:id/apply` | `parts.import`; apply requires idempotency/version |
| Drawing upload | `POST /admin/drawings/uploads`, `POST /admin/drawings/uploads/:id/finalize` | private intent / validated draft attachment |
| Publish / rollback | `POST /admin/models/:id/releases`, `POST /admin/releases/:id/activate` | named `publish.execute` / `publish.rollback`; idempotency/version |
| Administration | `/admin/companies`, `/admin/users`, `/admin/roles`, `/admin/audit`, `/admin/orders` | Task 8 capability-scoped operations; no public self-escalation |

### Task 1: Close transport gaps without connecting the UI

**Files:** Modify `packages/contracts/src/{common,auth,catalog,orders,admin,index}.ts`; create `packages/contracts/src/integration-contracts.test.ts`; create `src/data/catalog-adapter.ts` and `tests/catalog-adapter.test.ts`. Keep current UI types/data untouched until Task 11 connects them.

**Interfaces:** Consumes existing TypeBox models. Produces all contract decisions above and `toPreviewCallout(c: LegacyCallout): Callout` where `LegacyCallout` is the current numeric-label seed shape retained in the adapter only. No database types enter client contracts.

- [ ] Add runtime tests for decimal strings, absent hidden prices, repeated string labels, explicit distinct release-part IDs, nullable metadata, positive integer quantities 1–9999, 1–250 lines, notes up to 2000 characters and addresses up to 4000 characters. Add a concrete coordinate regression:
  ```ts
  expect(Value.Check(CalloutSchema, { id:"c", figureId:"f", figurePartId:"fp", number:"7", x:0, y:100, maskPath:null })).toBe(true);
  expect(Value.Check(CalloutSchema, { id:"c", figureId:"f", figurePartId:"fp", number:"7", x:0, y:null, maskPath:null })).toBe(false);
  ```
- [ ] Run `npm test -w @rufdiamond/contracts -- integration-contracts.test.ts`; observe the specific schema failure before changing contracts.
- [ ] Encode money and labels without binary floating-point coercion:
  ```ts
  export const MoneySchema = Type.String({ pattern: "^(0|[1-9][0-9]{0,11})\\.[0-9]{2}$" });
  export const CalloutNumberSchema = Type.String({ minLength: 1, maxLength: 32 });
  export const QuantitySchema = Type.Integer({ minimum: 1, maximum: 9999 });
  ```
  Use explicit priced/unpriced response schemas; adapt seed prices to fixed decimal strings only at the preview adapter. The adapter imports the current seed type as `LegacyCallout`; it converts `number` using `String(c.number)` without modifying source data. Copy `PartUsageRow` and `PartUsageSummary` fields from `src/types/catalog.ts` into shared schemas, replacing their nested part with the released contract. Task 11 updates numeric sorting and frontend arithmetic when it consumes these contracts.
- [ ] Run contract tests, both workspace typechecks, root `npm run lint`, `npm run build`, `npm run test:callout-preview`; require no viewer regression.
- [ ] Commit exact listed files and dependency lock changes as `refactor: align integration transport contracts`.

### Task 2: Add missing persisted UI and provenance fields

**Files:** Modify `apps/api/src/db/schema/{catalog,releases,identity,operations}.ts`; create `apps/api/drizzle/0006_integration_fields.sql` and generated metadata; create `apps/api/test/integration/integration-schema.test.ts`.

**Interfaces:** Existing table exports remain stable. Add `callout.maskPath`, `releaseCallout.maskPath`; drawing original/derivative object version IDs and derivative hash/bytes/dimensions; unique canonical `appUser.loginId`; company default shipping address; order `customerReference`, immutable `detailsSnapshot` and `contextSnapshot`; line `commentSnapshot`; import `objectVersionId`. `contextSnapshot` validates `{companyName:string,companyAddress:string|null,productLineName:string,modelName:string,serialLabel:string}`. Existing order `reference` becomes server-generated unique human reference for new RFQs, not the customer's reference; add `rfq_reference_seq` and a partial unique reference index for non-null references.

- [ ] Add a migration test creating a pre-0006 fixture, migrating, replaying, and asserting existing releases/orders remain sealed and new nullable fields do not erase history. New-object fixtures must use different working/local IDs.
- [ ] Run `npm test -w @rufdiamond/api -- integration-schema.test.ts` and observe missing-column failure.
- [ ] Add expand-only columns; example schema kernel:
  ```sql
  ALTER TABLE callout ADD COLUMN mask_path text;
  ALTER TABLE release_callout ADD COLUMN mask_path text;
  ALTER TABLE company ADD COLUMN default_shipping_address text;
  ALTER TABLE "order" ADD COLUMN customer_reference text;
  ALTER TABLE "order" ADD COLUMN details_snapshot jsonb;
  ALTER TABLE "order" ADD COLUMN context_snapshot jsonb;
  ALTER TABLE order_line ADD COLUMN comment_snapshot text;
  ```
  Extend existing immutability triggers to protect new order snapshot fields. Backfill canonical login IDs from email for existing accounts, unique lower-trim constraint; do not import legacy passwords. Pin derivative object versions before new publications; historical null versions require an explicit verified backfill, not an assumed latest version.
- [ ] Run schema suites, migration replay and Drizzle drift check; require no modification of 0001–0005.
- [ ] Commit as `feat: persist integration metadata and RFQ details`.

### Task 3: Transaction, audit, idempotency and worker foundation

**Files:** Create `apps/api/src/modules/audit/repository.ts`, `apps/api/src/modules/outbox/{repository,idempotency,worker}.ts`, `apps/api/src/worker/main.ts`; reuse `apps/api/src/db/client.ts`; test `apps/api/test/integration/transaction-primitives.test.ts`.

**Interfaces:** Reuse `Transaction` and injected connection transaction helpers from `db/client.ts`; define `MutationContext {actorUserId:string;companyId:string;capability:string;requestId:string}` and `StoredResponse {status:number;body:unknown}` in `modules/audit/repository.ts` and `modules/outbox/idempotency.ts`, respectively. `withIdempotency(tx:Transaction, ctx:MutationContext, operation:string, key:string, requestHash:string, execute:()=>Promise<StoredResponse>):Promise<StoredResponse>`. Audit/outbox writers receive the same transaction, never open their own.

- [ ] Write rollback, matching replay, changed payload and simultaneous-key tests; assert `expect(second.body).toEqual(first.body)` and `expect((await pool.query('SELECT count(*)::int AS n FROM "order"')).rows[0].n).toBe(1)` using the test fixture's PostgreSQL pool.
- [ ] Run `npm test -w @rufdiamond/api -- transaction-primitives.test.ts`; observe missing behavior.
- [ ] Claim work with this SQL kernel, commit the lease before remote delivery, then mark completion in a second transaction:
  ```sql
  SELECT id FROM outbox_event
  WHERE completed_at IS NULL AND attempts < 12 AND available_at <= now()
    AND (locked_at IS NULL OR locked_at < now() - interval '5 minutes')
  ORDER BY available_at, id FOR UPDATE SKIP LOCKED LIMIT 20;
  ```
  Canonicalize request JSON before SHA-256. Scope keys by actor+operation, store status/body transactionally; retain successful RFQ keys with order history. Backoff 5 seconds exponentially to 1 hour, stop automatic delivery after 12 failures and alert; explicit audited retry remains possible. Provider idempotency/delivery IDs prevent duplicate business effects; SMTP alone cannot promise exactly-once email.
- [ ] Test worker crash/reclaim, two workers, domain rollback and audit redaction; run API typecheck.
- [ ] Commit as `feat: add transactional mutation and worker primitives`.

### Task 4: Real sessions and safe sign-in

**Files:** Create `apps/api/src/modules/identity/{schemas,repository,service,routes,passwords}.ts`, `apps/api/src/plugins/{auth,csrf}.ts`; modify `apps/api/src/{app,config,server}.ts`; tests `apps/api/test/integration/{auth,csrf}.test.ts`.

**Interfaces:** `authenticate(loginId:string,password:string):Promise<{sessionToken:string;csrfToken:string}>`; `readSession(token:string):Promise<SessionUser|null>`; `/me` returns safe company and display name plus capabilities/scopes and CSRF token. No credential hashes leave the identity module.

- [ ] Write real password-hash tests and inject sign-in/logout/reset routes; assert `expect(response.headers["set-cookie"]).toContain("HttpOnly")`, no token in JSON, suspended accounts denied and expired sessions rejected.
- [ ] Run `npm test -w @rufdiamond/api -- auth.test.ts csrf.test.ts`; observe route failures.
- [ ] Implement Argon2id, random 32-byte session tokens, SHA-256 stored hashes, 12-hour absolute/30-minute idle expiry; rotate on sign-in and privilege change. Cookie contract:
  ```ts
  reply.setCookie("__Host-ruf-session", token, {
    path: "/", secure: true, httpOnly: true, sameSite: "lax", maxAge: 43200
  });
  ```
  Use a separately named insecure cookie only for explicit loopback development. Derive a stable session CSRF token using keyed HMAC over the raw session token; store/check its hash and return it only to the same-origin session endpoint. Require exact Origin/Referer plus CSRF for mutations, exact Origin for sign-in. Password resets are hashed, single-use, 30 minutes; successful reset revokes sessions. Rate-limit sign-in to 5/minute per account+IP, reset requests to 3/hour; generic responses prevent account enumeration.
- [ ] Test concurrent tabs keep valid CSRF, forged origin, replayed reset, logout-all, redacted logs and safe 429/401 responses. Register graceful pool/worker shutdown.
- [ ] Commit as `feat: add first-party portal authentication`.

### Task 5: Capability and scope enforcement

**Files:** Create `apps/api/src/modules/authorization/{capabilities,types,policy,scope-sql}.ts`, `apps/api/src/db/seeds/pilot-roles.ts`, `apps/api/drizzle/0007_snapshot_trigger_hardening.sql` and generated metadata; tests `apps/api/test/integration/{authorization,trigger-security}.test.ts`, `apps/api/test/unit/capabilities.test.ts`. Update existing migration-count assertions without weakening them.

**Interfaces:** `AuthorizationContext {userId:string;companyId:string;capabilities:ReadonlySet<string>;brandIds:"all"|readonly string[];accountIds:"all"|readonly string[];variantIds:"all"|readonly string[];canViewDraft:boolean;canViewPrices:boolean;scopeVersion:string;priceTierId:string|null;discountRate:string}`; `requireCapability(ctx:AuthorizationContext,key:string):void`; `loadAuthorization(tx:Transaction,userId:string):Promise<AuthorizationContext>`, importing `Transaction` from `db/client.ts`.

- [ ] Test every capability key against the 45-key committed register, missing scope denies, Fat Truck cannot fetch IronHorse, and `publish.block.override` denies even if erroneously assigned.
- [ ] Run `npm test -w @rufdiamond/api -- authorization.test.ts capabilities.test.ts` and observe failures.
- [ ] Use explicit deny guards and intersections:
  ```ts
  export function requireCapability(ctx: AuthorizationContext, key: string): void {
    if (key === "publish.block.override" || !ctx.capabilities.has(key))
      throw new AppError("FORBIDDEN", 403, "This action is not permitted.");
  }
  ```
  Import `AppError` from the existing error plugin. Company product-line/fleet grants intersect user subsets; a subset cannot expand company access. Internal `all` is explicit. `orders.behalf` additionally requires `dealer_customer_scope` and target account/brand/fleet intersections; never treat arbitrary company ID as authority. Calculate prices from capability plus company technician-pricing setting and effective tier.
  Resolve explicitly assigned user tier, then company tier, otherwise company discount; apply that one effective discount exactly once, never tier plus company discount. For behalf-of RFQs use the authorized target company's pricing policy, not the dealer's own price. Keep internal `discountRate` out of hidden-price session responses.
- [ ] Test price omission in all JSON/CSV/print DTOs; unknown keys, own-user role escalation, scope updates invalidating existing sessions/cursors. Do not grant named publishing to the whole admin role.
- [ ] Harden snapshot triggers before enabling a runtime database login. A disposable PostgreSQL probe confirmed that a least-privilege role with temporary-table access could shadow unqualified `publication_release` and insert into a sealed public release. Write regression tests with a non-owner role and conflicting `pg_temp.publication_release`/`pg_temp."order"`: inserts into sealed public snapshots/submitted order lines must fail with `23514`, while legitimate building-release/unsubmitted-order inserts still work. Migration 0007 fully qualifies parent-table references in `protect_release_snapshot` and `protect_order_line` and pins the security-trigger functions' search path to `pg_catalog, public, pg_temp`; preserve invoker security and all existing lock/immutability behavior. Do not alter migrations 0001–0006 or substitute a provider-only permissions workaround. Verify empty/upgrade/replay and Drizzle no drift. This discovered hardening prerequisite shifts later MFA/quote migrations to 0008/0009.
- [ ] Commit as `feat: enforce capability and tenant boundaries`.

### Task 6: Released catalogue reads and private drawing delivery

**Files:** Create `apps/api/src/modules/catalog/{release-repository,service,routes,schemas}.ts`, `apps/api/src/modules/drawings/{object-store,read-service,routes}.ts`; fixtures `apps/api/test/fixtures/released-catalog.ts`; tests `apps/api/test/integration/{customer-catalog,private-drawings}.test.ts`.

**Interfaces:** `getFigureDetail(ctx:AuthorizationContext,figureId:string):Promise<FigureDetail|null>`; `searchPartUsages(ctx,query:{q:string;mode:"part"|"description"|"any";modelId?:string;cursor?:string}):Promise<Page<PartUsageRow>>`; `ObjectStore.get(input:{key:string;versionId:string}):Promise<{body:Readable;contentType:string;bytes:number}>`, with `Readable` imported from `node:stream`. Snapshot SQL alone produces catalogue values.

- [ ] Seed active A/inactive B and conflicting draft rows. Exercise every catalogue route, a repeated callout and a scoped object URL; assert customer data remains A while draft edits change. Run focused suites and observe 404s before implementation.
- [ ] Resolve allowed active releases in a read-only repeatable-read transaction, passing explicit release IDs to every query. Kernel:
  ```sql
  SELECT f.* FROM release_figure f
  JOIN publication_release r ON r.id = f.release_id
  WHERE r.id = $1 AND r.status = 'active' AND f.working_id = $2;
  ```
  `$1` comes only from the scoped resolver. Resolve figure/model association from snapshots, not draft joins. Return complete composite rows and all callout occurrences; sort/de-duplicate only the displayed labels. Source product-line/model/system metadata from snapshots. Do not include unattached draft parts in global search.
- [ ] Stream only validated pinned raster derivatives; set `Cache-Control: private, no-store`, `X-Content-Type-Options:nosniff`, safe Content-Type and disposition. Reauthorize each request; a retired release URL yields `409 RELEASE_CHANGED` for an otherwise permitted figure, an out-of-scope ID yields 404. The UI refetches the whole figure once; no mixing old markers/new image. Original downloads, when allowed, use attachment disposition and five-minute scoped links.
- [ ] Test publish-between-queries consistency, publish-between-pages conflict, stale drawing URLs, expired session, revoked scope, range/size limits, no bucket keys in DTOs, and original/derivative version pinning. Run contracts and API suites.
- [ ] Commit as `feat: serve scoped immutable catalogue and drawings`.

### Task 7: Working catalogue, mapping and publication

**Files:** Create `apps/api/src/modules/catalog/{working-repository,admin-service,admin-routes,publish-validation}.ts`, `apps/api/src/modules/publication/{service,routes,checksum}.ts`; tests `apps/api/test/integration/{admin-catalog,publication}.test.ts`, `apps/api/test/unit/publish-validation.test.ts`.

**Interfaces:** `patchCallout(ctx,input:CalloutPatch,id:string):Promise<Callout>`; `publish(ctx,input:PublishInput,key:string):Promise<PublishResult>`; `activateRelease(ctx,releaseId:string,expectedActiveReleaseId:string,key:string):Promise<ReleaseRef>`; `PublishBlocker {code:string;modelId:string;figureId?:string;entityId?:string;message:string}`.

- [ ] Add table-driven blockers for missing/unvalidated drawing, missing mapping, paired-null/range, cross-figure mapping, invalid hierarchy, unresolved part, unreviewed requirement, absent/invalid price and currency. Add optimistic conflicts and concurrency tests; run focused suites to RED.
- [ ] Implement POST/PATCH/DELETE for models, variants, figures, parts and callouts; PATCH model-system enablement, supersession and required-part relationships. Use exact capability keys from the register, reject referenced-record deletion, preserve source remarks. Geometry changes require `catalog.callout.manage`; remapping requires `catalog.callout.map`; a combined request requires both. Empty/partial invalid coordinate pairs yield 422. `If-Match` and body version must agree.
  ```sql
  UPDATE callout SET x=$1,y=$2,version=version+1
  WHERE id=$3 AND version=$4 RETURNING *;
  ```
  Audit and bump every affected model's working version, including models sharing a changed global part/system. Lock affected models in UUID order; publish and all draft writers use the same protocol.
- [ ] Publish in SERIALIZABLE transaction: scoped model lock, expected version check, complete blocker recheck, release row in `building`, all snapshot inserts with fresh release-local IDs and mapping dictionaries, canonical sorted checksum, active pointer switch, audit/outbox. Server assigns integer revision `max+1` under lock. Retry serialization at most three times; stale expected version remains 409. Never allow an override.
- [ ] Test two publishers produce one success/one conflict; idempotent replay same response; rollback activates exact prior sealed release with expected-current comparison. No snapshot rewrites. Draft-only changes cannot affect customer reads or RFQ history.
- [ ] Commit as `feat: add audited catalogue editing and atomic publishing`.

### Task 8: Account operations and privileged-access protection

**Files:** Create `apps/api/src/modules/accounts/{schemas,repository,service,routes}.ts`, `apps/api/src/modules/identity/mfa.ts`, `apps/api/src/db/schema/mfa.ts`, `apps/api/drizzle/0008_privileged_mfa.sql`; modify schema index; tests `apps/api/test/integration/{accounts,mfa}.test.ts`.

**Interfaces:** Versioned POST/PATCH company/fleet, users and role bundles; `POST /admin/users/:id/capabilities` grants named publisher rights only to authorized role managers; `GET /admin/audit` and `/admin/audit/export`; MFA enrollment/confirmation/challenge on `/auth/mfa/*`. `MfaChallenge {challengeId:string;expiresAt:string}` grants no catalogue session until completed.

- [ ] Write own-company admin versus global-user manager tests, explicit-role grant tests, self-escalation rejection, full audit CSV redaction, expired/replayed MFA challenge and single-use recovery-code tests. Run focused tests to RED.
- [ ] Persist encrypted TOTP enrollment secret with key ID, hashed recovery codes, last accepted TOTP time-step and challenge hash/expiry; pending enrollment cannot enable a session. Lock/reject reused time-step; use a maintained TOTP library, not a homemade OTP algorithm. Production requires MFA for `publish.execute`, `publish.rollback`, `roles.manage`, `users.all.manage` and `accounts.company.manage` before granting a session.
  ```ts
  export const privilegedCapabilities = new Set([
    "publish.execute", "publish.rollback", "roles.manage",
    "users.all.manage", "accounts.company.manage"
  ]);
  ```
  Store the encryption key outside DB/images; audit enrollment/reset, revoke sessions on reset. Rate limit challenges to five attempts; 5-minute expiry. Bootstrap accounts through a local operator command with a one-time invitation, never a checked-in password.
- [ ] Implement scoped account CRUD and role management with optimistic versions; changes immediately invalidate authorization caches/sessions. CSV exports escape spreadsheet formula prefixes, omit secret fields and enforce export capability.
- [ ] Run account/auth/MFA/publication suites; commit as `feat: add scoped account administration and staff MFA`.

### Task 9: Staged imports and validated drawing uploads

**Files:** Create `apps/api/src/modules/imports/{parser,normalizer,remarks-parser,repository,service,routes}.ts`, `apps/api/src/modules/drawings/{validation,upload-service}.ts`; tests `apps/api/test/unit/import-parser.test.ts`, `apps/api/test/integration/{imports,drawing-uploads}.test.ts`; synthetic fixtures `apps/api/test/fixtures/imports/{valid,conflict,rerun}.csv`.

**Interfaces:** `NormalizedImportRow {sourceRowKey:string;rowNumber:number;fields:NormalizedImportFields}`; define the following in `modules/imports/normalizer.ts` and encode its runtime schema in `packages/contracts/src/admin.ts`. `ImportResult {id:string;state:"uploaded"|"staged"|"validated"|"applying"|"applied"|"failed";blockingIssueCount:number}`. `UploadIntent {id:string;url:string;expiresAt:string}`; finalize accepts `{figureId:string;expectedVersion:number;sha256:string}` and returns staff drawing metadata.

```ts
interface NormalizedImportFields {
  partNumber:string; description:string; model:string; variant:string;
  system:string; groupNo:string|null; figureName:string;
  effectiveFrom:string|null; effectiveTo:string|null; qty:number;
  pnc:string|null; listPrice:string|null; currency:"CAD";
  manufacturer:string|null; serviceable:boolean; remarks:string|null;
}
```

`No.` is retained only in immutable raw provenance, not entity identity; the
other 15 source columns map exactly as `docs/catalog-data-structure.md` states.

- [ ] Create parser fixtures with every column, repeated part/PNC rows, required-part remarks, unknown labels, malformed money/quantity, exact rerun and changed rerun. Assert no source row collapse and `expect(importedCallout.x).toBeNull()`; run focused tests to RED.
- [ ] Stream CSV/XLSX uploads with 25 MiB compressed/100 MiB expanded limits, signature checks, private versioned storage and hash. Choose a supported patched XLSX parser after dependency audit; never silently evaluate formulas/macros. Retain immutable raw source plus normalized review state. Stable row keys derive from source identity, not just part number or row order. Ambiguous changed keys become review issues.
  ```ts
  export function canApplyImport(state: ImportResult): boolean {
    return state.state === "validated" && state.blockingIssueCount === 0;
  }
  ```
  Apply under target-model lock, revalidate issue state/working version and idempotency, write draft graph/audit/outbox atomically. Preserve manual coordinates only for an unchanged unambiguous association and drawing identity. Never auto-publish or approve preview proposals. Full real-data dry run reports 635 source rows/536 unique parts/45 figures against 44 drawings and explains duplicates; it does not force those counts onto unrelated fixtures.
- [ ] Implement private upload intents and finalize validation: checksum, byte count, MIME signature, dimensions/pages, malware scan, SVG active/external content rejection and safe raster derivative. Store exact original/derivative version IDs and hashes; the uploader cannot overwrite a known key. Failed validation prevents attachment/publication. New uploads do not change existing release images.
- [ ] Run reruns twice and test crash/retry, issue review conflict, changed drawing invalidating proposals, scanner outage fail-closed and source-object access denial. Commit as `feat: add reviewed imports and versioned drawing ingestion`.

### Task 10: Server-owned RFQ workflow

**Files:** Create `apps/api/src/modules/orders/{schemas,money,repository,service,routes,events}.ts`, `apps/api/src/modules/outbox/handlers/rfq-confirmation.ts`, `apps/api/drizzle/0009_order_quote_snapshots.sql`; modify `apps/api/src/db/schema/operations.ts` and generated metadata; tests `apps/api/test/unit/money.test.ts`, `apps/api/test/integration/orders.test.ts`.

**Interfaces:** `submitOrder(ctx,input:SubmitOrderInput,key:string):Promise<SubmitOrderResult>`; `getOrder(ctx,id:string):Promise<OrderDetail|null>`; extend `OrderDetail` with reference/customerReference/details/line comments and optional decimal money snapshots. `NotificationPort.deliver(input:{eventId:string;orderId:string;recipient:string}):Promise<{deliveryId:string}>` is provider-neutral.

Staff quote input at `POST /admin/orders/:id/quotes` is
`{version:number;currency:Currency;note:string;lines:{orderLineId:string;unitPrice:Money;leadTimeDays:number|null}[]}`.
Store append-only `order_quote(id,order_id,revision,currency,note,created_by,created_at)`
and `order_quote_line(quote_id,order_line_id,unit_price,lead_time_days)` with a
same-order composite FK, positive revision, nonnegative decimal price and
nonnegative nullable lead time; never update submitted RFQ prices. Require
`orders.quote`, account scope and optimistic order version; snapshot revisions
are unique per order. Expose the latest scoped quote in order detail, omitting
monetary fields for hidden-price users.

- [ ] Add decimal and submit tests: 3 × 0.10 totals exactly 0.30; repeated idempotency key returns same ID; stale release, technician submit, wrong variant/nonserviceable part, unauthorized behalf-of and manipulated browser price all fail. Run to RED.
- [ ] Calculate only from active released parts and effective authorized company; enforce required parts/quantities and reject missing requirements with row-level issues. Coalesce duplicate release-part input lines deterministically, preserving comments, before hashing/storing. Never trust browser totals, names, discounts or brand labels.
  ```ts
  const listTotal = lines.reduce((sum, line) => sum.plus(
    new Decimal(line.unitPriceSnapshot).times(line.qty)
  ), new Decimal(0)).toDecimalPlaces(2);
  const discountApplied = listTotal.times(discountRate).toDecimalPlaces(2);
  const netTotal = listTotal.minus(discountApplied).toFixed(2);
  ```
  Set Decimal rounding to ROUND_HALF_UP. Assign `RFQ-YYYY-` plus the Task 2 `rfq_reference_seq` value (not random UI reference); insert order, lines, details, context snapshots, audit, outbox and idempotency response in one transaction. Use the Task 2 `contextSnapshot` for historical company/address/brand/serial labels, not current account/catalogue joins.
- [ ] Keep staging notifications captured; production delivery only to configured verified destinations. Mark RFQ submitted independently of email delivery and surface retries to staff. Status/quote changes require `orders.status.edit`/`orders.quote`, optimistic versions and audit; initial quote pricing is a separate audited record, never rewriting submitted line snapshots.
- [ ] Test cross-account history/print/export, totals omission, complete comments/shipping round-trip, rollback on outbox failure and provider retry. Commit as `feat: persist scoped RFQs and confirmations`.

### Task 11: Connect the current frontend through the repository seam

**Files:** Create `src/data/{api-client,http-repository}.ts`, `src/state/AuthContext.tsx`; modify `src/data/repository.ts`, `src/types/{catalog,admin}.ts`, `src/lib/format.ts`, `src/state/{AppProviders,RequestContext,MachineContext}.tsx`, `src/state/{useAsync,useRecentlyViewed}.ts`, `src/app/(auth)/signin/SignInForm.tsx`, `src/app/(portal)/request/{QuoteRequest.tsx,confirmed/Confirmed.tsx,confirmed/QuoteDocument.tsx}`; tests `tests/{http-repository,auth-provider,request-api}.test.tsx`.

**Interfaces:** All current named repository methods remain available; HTTP pages are consumed explicitly, not silently truncated. `request<T>(path:string,options:RequestInit,decode:(value:unknown)=>T):Promise<T>` validates DTOs. `RequestContext.submit(details:RequestDetails):Promise<SubmitOrderResult>` replaces synchronous local confirmation; `RequestDetails` is the existing UI form converted to `RfqDetails` plus per-line comments.

- [ ] Add MSW tests for every row in the endpoint mapping, abort/stale-response handling, problem envelopes and no seed fallback on failure. Add a submit test with a delayed response; double click must yield one request ID and keep the draft until success. Run focused tests to RED.
- [ ] Use one client kernel:
  ```ts
  const response = await fetch(path, { ...options, credentials:"include", headers });
  const value: unknown = await response.json();
  if (!response.ok) throw ApiProblem.from(value, response.status);
  return decode(value);
  ```
  Define `ApiProblem` in `api-client.ts` with validated ProblemDetails and safe unknown-response fallback. Add CSRF on mutations, stable per-submit idempotency key and `AbortSignal`. Do not auto-retry arbitrary writes. Use same-origin Next rewrite for `/api/v1` in the temporary bridge; read installed Next rewrite/client/server guides before implementing it.
- [ ] Replace frontend domain types with shared contract imports and explicit view models; retain legacy seed types in a test-only module so source fixture values do not change. Convert the prototype's numeric sorting to string natural ordering and arithmetic to decimal.js; omit price/discount elements when fields are absent. The production repository must not import the seed adapter.
- [ ] Replace placeholder company with `/me`. Route guards wait for session resolution; protected links require capabilities but server checks remain decisive. Key cached machine/cart/recently-viewed state by user+company+schema version; clear on logout/account switch, revalidate against current releases after sign-in. Never display stale previous-user state during fetch. Preserve cart and show review-required on 409; confirmation reload fetches `/orders/:id` instead of trusting sessionStorage.
- [ ] Implement visible loading, retry, not found, no permitted machines, hidden price, expired session and pending submission states; keyboard focus returns to actionable feedback. Keep existing URLs and RFQ print layout. Run contract/UI suites, existing 37 viewer tests, Next lint/build and API integration smoke.
- [ ] Commit as `feat: connect portal workflows to Fastify`.

### Task 12: Parallel Vite migration and browser parity

**Files:** Create `apps/web/{package.json,index.html,vite.config.ts,tsconfig.json}`, `apps/web/src/{main.tsx,app/router.tsx,app/App.tsx}`; copy/adapt `src/{components,state,lib,data,types}` and CSS modules into matching `apps/web/src/` paths; map route screens into `apps/web/src/pages/`; create `apps/web/e2e/{portal,viewer,security}.spec.ts`, `apps/web/playwright.config.ts`; modify root scripts only after parity.

**Interfaces:** Preserve `/signin`, `/`, `/machine`, `/systems`, `/systems/:systemId`, `/figures/:figureId`, `/parts/:brand`, `/search`, `/request`, `/request/confirmed`, `/quotes`, `/orders`. Confirmation adds an order ID query parameter while old missing-ID links show a safe empty state. Do not resurrect removed admin screens as a migration side effect; admin APIs remain independently tested.

- [ ] Add browser tests against the connected Next baseline before copying screens: authenticate, choose machine, search by part/description, browse each system, select every occurrence, submit RFQ, reload confirmation and sign out. Record screenshots at 1440×900, 1024×768 and 390×844.
- [ ] Build Vite alongside Next with the same HTTP adapter and relative API origin:
  ```ts
  export default defineConfig({
    plugins: [react()],
    server: { host:"127.0.0.1", port:5173,
      proxy:{"/api":{target:"http://127.0.0.1:4000",changeOrigin:false}} }
  });
  ```
  Import `defineConfig` from `vite` and `react` from `@vitejs/plugin-react`. Preserve routes with React Router; replace Next Image/Link/navigation/layout/metadata/font behavior explicitly. API `WEB_ORIGIN` matches the chosen local client; tests do not weaken CSRF by allowing arbitrary origins.
- [ ] Port geometry and event behavior unchanged first. Browser assertions include this native wheel check with test-local `viewer` locator and `page`:
  ```ts
  await viewer.hover();
  await page.mouse.wheel(0, -120);
  await expect(page.getByRole("button", {name:"Zoom out"})).toBeEnabled();
  ```
  Also assert the actual scale increases/decreases, an anchor under the cursor remains aligned, zero/horizontal deltas and scrolling outside the image do not zoom, limits stop at 1×/4×, fullscreen Escape/focus works, dragging cannot steal marker clicks, and selecting a row highlights all occurrences. Test Windows/Filters plus Hydraulic, Cabin, Frame and a partial staff preview; do not equate preview coverage with publication approval.
- [ ] Resolve dense marker usability with zoom-to-selection/focus styling while preserving source coordinates; verify list labels remain readable, touch pan/zoom does not trap page scrolling, keyboard selection works and stale image loads cannot overlay the wrong markers. Capture a labelled functionality video, not just a success screenshot.
- [ ] Run both clients against the same seeded test API and compare flows. After parity, switch workspace dev/build/start/typecheck/test scripts to Vite/API, remove production Next dependency/config with an explicit isolated commit, and retain the preceding known-good commit for rollback. Check `rg 'next/|data/seed|ft3-wagon|callout-preview.server' apps/web/src` has no production imports; web output contains no catalogue drawings/proposals/secrets.
- [ ] Commit migration as `feat: migrate connected portal to Vite`; record parity evidence in `docs/verification/2026-09-07-integration.md` (use execution date if later).

## Final verification and execution handoff

- [ ] Fresh checkout: `npm ci`, contract/API/web tests, lint, typechecks, API and web production builds, migrations on empty and upgraded PostgreSQL, and browser E2E all exit zero. Docker/Testcontainers unavailable is a reported gate failure, not a skipped pass.
- [ ] Verify backend-specification acceptance: release isolation, complete publication, repeated occurrences, capability scopes, staged replay, drawing versions, audit/outbox, RFQ, RFC 9457 failures, concurrent publish/edit/submit and no Xero coupling. Error tests include 400/401/403/404/409/422/429/503 and generic redacted 500.
- [ ] Record exact commit, commands/results, unresolved source-data blockers and video path. Readiness and recovery/deployment evidence are delivered by the companion OVH plan; local green tests do not mean production is live.
- [ ] Push the reviewed feature branch without force; merge to main only through passing review/CI. Do not copy a local preview fixture into production while merging code.

Recommended execution is the previously authorized task-by-task subagent workflow:
one implementer, then specification and code-quality reviews, with checkpoints
after Tasks 6, 10, 11 and 12. Inline `executing-plans` with those same gates is
the alternative when delegation is unavailable. No additional product choice
is needed for local execution; infrastructure access is a separate prerequisite.

## Plan self-review record

Coverage checked against the five authoritative domain/backup documents and the
current repository seam. Explicit corrections include all three previously
omitted repository methods, distinct release/working IDs, string labels,
optional price visibility, persisted RFQ details, production-private assets,
MFA and scope revocation, and preservation of wheel/pan/fullscreen behavior.
Operational implementation is deliberately in the companion plan, not omitted.
