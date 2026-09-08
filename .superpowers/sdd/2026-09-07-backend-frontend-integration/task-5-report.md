# Task 5 implementation report: capability and tenant boundaries

## Status

DONE

## Implemented

- Added the exact 45-key capability register and default-deny guards. Unknown keys and `publish.block.override` are denied even when malformed database grants exist.
- Added the server-only `AuthorizationContext`, parameterized Drizzle scope predicate, and PostgreSQL-backed authorization loader. Active user/company and a mandatory `user_scope` are required.
- Company product-line and machine entitlements bound external user scopes; subset rows can only narrow them. Literal `all` is emitted only for an internal company with an explicit all mode. Dealer account reach is restricted to active named `dealer_customer_scope` pairs and only applies to dealer companies.
- Added narrow target checks for behalf-of work across account, brand, and variant. The target company's tier/discount policy is resolved instead of the dealer's user/company policy.
- Applied pricing precedence exactly once: user tier, then company tier, then company discount. Technician policy is identified by `orders.list.build` without `orders.submit`, still requires `pricing.cost.view`, and respects the company switch. Non-technician/internal viewers with explicit price capability are not incorrectly hidden.
- Added an opaque SHA-256 scope version covering user/company/role/scope state, role and named grants, company and user brand/fleet/account rows, dealer pairs, and applicable pricing state. The real resolver reads a repeatable-read, read-only transaction on every session request.
- Extended strict safe session summaries with `scopeVersion`. Hidden-price summaries serialize neither an effective tier identifier nor the internal effective discount. Priced `/me` uses the effective policy discount.
- Composed the real database resolver in `buildApp` while retaining dependency injection and the identity service's isolated deny-all default. App construction does not run configuration seeds.
- Added a controlled idempotent pilot seed that inserts only `catalog.model.view`, `catalog.figure.view`, and `parts.record.view` for Purchaser and Technician. It neither restores unrelated customized grants nor grants publication capabilities.
- Added migration `0007_snapshot_trigger_hardening`: both parent lookups are schema-qualified, both function search paths are pinned to `pg_catalog, public, pg_temp`, parent row locking is preserved, and the functions remain security-invoker.
- Kept the expanded Testcontainers suite stable by running test files serially; dedicated concurrency behavior remains exercised within its integration suite.

## TDD evidence

### RED: authorization modules absent

Command:

```text
npm test -w @rufdiamond/api -- authorization.test.ts capabilities.test.ts
```

Observed:

```text
Test Files  2 failed (2)
Tests       no tests
Cannot find module '../../src/modules/authorization/capabilities.js'
Cannot find module '../../src/db/seeds/pilot-roles.js'
```

This was expected because the required policy, types, registry, SQL scope helper, and controlled seed did not exist.

### RED: demonstrated temporary-parent shadow bypass

Command:

```text
npm test -w @rufdiamond/api -- trigger-security.test.ts
```

Observed against migrations 0001-0006:

```text
Test Files  1 failed (1)
Tests       4 failed | 2 passed (6)
sealed release insert: promise resolved instead of rejecting
submitted order-line insert: promise resolved instead of rejecting
expected pinned SET search_path
expected migration count 7, received 6
```

The two valid building/unsubmitted inserts passed, isolating the defect to the shadowable sealed-parent checks.

### RED: non-dealer malformed pair

During self-review, a new regression showed that a malformed dealer pair attached to a customer company could expand account mode `all`:

```text
npm test -w @rufdiamond/api -- authorization.test.ts
Test Files  1 failed (1)
Tests       1 failed | 10 passed (11)
expected own company only, received own plus target
```

The loader now considers named dealer accounts only when the actor company is actually a dealer.

### GREEN: focused suites

```text
npm test -w @rufdiamond/api -- authorization.test.ts capabilities.test.ts
Test Files  2 passed (2)
Tests       14 passed (14)

npm test -w @rufdiamond/api -- trigger-security.test.ts
Test Files  1 passed (1)
Tests       6 passed (6)

npm test -w @rufdiamond/contracts -- integration-contracts.test.ts
Test Files  1 passed (1)
Tests       40 passed (40)
```

## Final verification

```text
npm test -w @rufdiamond/api
Test Files  11 passed (11)
Tests       101 passed (101)

npm test -w @rufdiamond/contracts
Test Files  2 passed (2)
Tests       41 passed (41)

npm run typecheck -w @rufdiamond/api
exit 0

npm run typecheck -w @rufdiamond/contracts
exit 0

npm run lint -- apps/api/src apps/api/test packages/contracts/src
exit 0, no output

git diff --check
exit 0

npm run db:generate -w @rufdiamond/api
No schema changes, nothing to migrate
```

The final full output was clean. Earlier full-run attempts established that parallel startup of all per-file PostgreSQL containers could starve migrations past Vitest's five-second test timeout and cause cascading teardown errors. Serial file execution fixed the root test-harness resource contention; no assertion or migration check was weakened.

## Files changed

- `apps/api/src/modules/authorization/capabilities.ts`
- `apps/api/src/modules/authorization/types.ts`
- `apps/api/src/modules/authorization/policy.ts`
- `apps/api/src/modules/authorization/scope-sql.ts`
- `apps/api/src/db/seeds/pilot-roles.ts`
- `apps/api/src/app.ts`
- `apps/api/src/modules/identity/service.ts`
- `apps/api/drizzle/0007_snapshot_trigger_hardening.sql`
- `apps/api/drizzle/meta/_journal.json`
- `apps/api/test/unit/capabilities.test.ts`
- `apps/api/test/integration/authorization.test.ts`
- `apps/api/test/integration/trigger-security.test.ts`
- `apps/api/test/integration/auth.test.ts`
- `apps/api/test/integration/csrf.test.ts`
- `apps/api/test/integration/schema.test.ts`
- `apps/api/test/integration/integration-schema.test.ts`
- `apps/api/vitest.config.ts`
- `packages/contracts/src/auth.ts`
- `packages/contracts/src/integration-contracts.test.ts`
- `.superpowers/sdd/2026-09-07-backend-frontend-integration/task-5-report.md`

## Self-review

- Re-read Task 5 brief, context, R10/R11/R12, global constraints, and the authoritative capability/role specification against the final diff.
- Verified no role-name conditional is used for authorization decisions; the only role keys in runtime code are the controlled configuration seed targets.
- Verified empty scopes produce SQL false, external `all` remains company/named-pair bounded, and a non-dealer cannot gain target authority from a malformed dealer pair.
- Verified target pricing never carries the dealer's user tier into a behalf-of context and no discount values are added or converted to floating-point arithmetic.
- Verified the safe session adapter selects fields explicitly and does not spread the internal policy context.
- Verified migration 0007 changes only the two vulnerable functions, preserves `FOR UPDATE`, and does not alter migrations 0001-0006.
- Verified app startup does not invoke the role seed and exact staging excludes unrelated `node_modules`, `output`, and `tmp` artifacts.

## Concerns

None within Task 5 scope. Future Task 8 bootstrap must invoke the controlled pilot-role seed during an approved operator/bootstrap action; it is intentionally not automatic at API startup.

## Review fix round 1

Fix base: `b33a116bec735ebfb60e52081db74c9f8adc4e53`

### Changes

- Required an explicit transactional `dealer_customer_scope` actor/target pair in `loadBehalfOfAuthorization`, independently of the actor's general account scope. Existing actor and target brand/fleet intersections remain enforced.
- Recomputed behalf-of price visibility from the actor's capabilities and the target company's `technician_pricing_visible` switch. Tests cover both actor-visible/target-hidden and actor-hidden/target-visible directions.
- Included paired-company price-tier rate/version and product-line/fleet entitlement identifiers and versions in dealer session scope-version inputs. Mutation tests cover each dependency.
- Extended additive migration 0007 search-path hardening to all eight security-trigger functions while preserving migrations 0001-0006 and the existing invoker/locking behavior.
- Added real-database `/me` resolver coverage for a priced user-tier override (`user-contract`, effective discount `0.400000`).

### RED

Command:

```text
npm test -w @rufdiamond/api -- authorization.test.ts trigger-security.test.ts
```

Observed before the fix:

```text
Test Files  2 failed (2)
Tests       4 failed | 16 passed (20)
internal all-scope actor resolved a behalf-of target without a named pair
target technician pricing expected false, received true
paired target tier/entitlement mutations left scopeVersion unchanged
security-trigger metadata found unpinned functions
```

### GREEN: focused regression suites

```text
npm test -w @rufdiamond/api -- authorization.test.ts trigger-security.test.ts
Test Files  2 passed (2)
Tests       20 passed (20)
```

### Final verification

Command:

```text
npm test -w @rufdiamond/api && npm test -w @rufdiamond/contracts && npm run typecheck -w @rufdiamond/api && npm run typecheck -w @rufdiamond/contracts && npm run lint -- apps/api/src apps/api/test packages/contracts/src && git diff --check
```

Output:

```text
@rufdiamond/api:       11 files passed, 104 tests passed
@rufdiamond/contracts: 2 files passed, 41 tests passed
API typecheck:          exit 0
contracts typecheck:    exit 0
lint:                   exit 0, no warnings
git diff --check:       exit 0
```

### Files changed in this fix

- `apps/api/src/modules/authorization/policy.ts`
- `apps/api/drizzle/0007_snapshot_trigger_hardening.sql`
- `apps/api/test/integration/authorization.test.ts`
- `apps/api/test/integration/trigger-security.test.ts`
- `.superpowers/sdd/2026-09-07-backend-frontend-integration/task-5-report.md`

### Self-review

- Verified named-pair authorization is resolved in the same transaction and cannot be substituted by internal `all` or explicit account scope.
- Verified behalf-of pricing retains the actor capability rule while using the target company's technician-pricing policy and never inherits the actor's user-tier override.
- Verified paired tier and entitlement aggregates are deterministic scope-version inputs.
- Verified metadata assertions enumerate all eight security-trigger functions and require invoker mode plus the pinned `pg_catalog, public, pg_temp` search path.
- Verified no contracts, frontend code, startup seeding, later routes, or migrations 0008/0009 were added.

### Concerns

None within this review-fix scope.
