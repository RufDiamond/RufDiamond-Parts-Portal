# Task 4 implementation report: real sessions and safe sign-in

## Status

DONE

## Implemented

- Added a first-party identity repository/service with the required public `authenticate(loginId, password)` and `readSession(token)` interfaces.
- Passwords are hashed and verified with maintained `argon2` 0.45.1 using Argon2id. Production defaults remain explicit at 64 MiB memory, 3 iterations, parallelism 4, and a 32-byte hash. Tests inject lower-cost but valid Argon2id parameters without changing production defaults.
- Sign-in canonicalizes the Task 2 `loginId`, performs a real dummy Argon2 verification for missing accounts, denies inactive users/companies generically, and records anonymous denial audits without attributing them to the target account.
- Sessions use random 32-byte raw tokens, store only SHA-256 token hashes, have 12-hour absolute and 30-minute idle expiry, reject revoked/expired/suspended sessions, and revoke all sessions on privilege change or successful password reset.
- Session CSRF values are stable keyed HMACs over the raw session token; only their SHA-256 hashes are stored. Authenticated mutations require the exact configured Origin, any supplied Referer must have that same origin, and the CSRF header is compared in constant time.
- Added the exact HTTP routes: sign-in, `/me`, sign-out with protected `allSessions`, reset request, and reset complete. Credential/request schemas reject extra properties. RFC 9457 responses now have correct 401/403/404 titles.
- The deployed cookie is exactly host-only `__Host-ruf-session`, Secure, HttpOnly, SameSite=Lax, Path=/, Max-Age=43200, without Domain. A separate `ruf-session-dev` cookie is available only under explicit HTTP-loopback development configuration.
- Added a typed injected authorization resolver. The default is deny-all: no capabilities and empty brand/account/fleet IDs. `/me` selects reviewed strict priced/unpriced Company and scope response variants, so hidden pricing cannot be serialized accidentally.
- Added process-local 5/minute sign-in and 3/hour reset request limits keyed by canonical account plus Fastify's trustworthy client IP. `trustProxy` remains disabled, so untrusted `X-Forwarded-For` does not bypass the limits.
- Added R9 protected reset delivery: AES-256-GCM, fresh 12-byte nonce, explicit key ID, separate externally configured canonical 32-byte base64 keyring, authenticated purpose/target/reset-record/payload-version/expiry context, and expiry/key checks at delivery. The generic outbox contains only ciphertext/envelope metadata. Raw reset values reach only the post-claim injected delivery port.
- Reset requests are generic across active/suspended/missing accounts. Active reset records store only SHA-256 hashes, expire after 30 minutes, consume once under row lock, change the Argon2id password, and revoke all sessions transactionally. API tests use an in-memory fake delivery port only; no SMTP/Gmail/Supabase mutation or remote database is used.
- Owned database pools close with Fastify. Injected/shared pools are not closed by the app. SIGTERM/SIGINT hooks are removed on close/startup failure. The API does not start an outbox worker.
- Added strict delivery-key/origin configuration parsing and shared TypeBox `/me` transport contracts.

## TDD evidence

### RED 1: routes and strict transport absent

Command:

```text
npm test -w @rufdiamond/api -- auth.test.ts csrf.test.ts
```

Observed before route implementation:

```text
Test Files  1 failed (1)
Tests       4 failed (4)
expected 404 to be 200
expected 404 to be 401
```

The failures were expected because sign-in and `/me` did not exist.

The shared contract RED was:

```text
npm test -w @rufdiamond/contracts -- integration-contracts.test.ts
Test Files  1 failed (1)
Tests       3 failed | 36 passed (39)
Cannot read properties of undefined (reading '$id')
```

The strict priced/unpriced `/me` schemas were absent.

### RED 2: lifecycle, limiter, reset, and hardening behavior absent

The next focused run produced behavior-specific failures:

```text
expected 401 to be 429
expected 404 to be 202
expected 403 to be 401
expected error to be instance of ProtectedDeliveryError
```

These respectively demonstrated missing account+IP limiting, missing reset request route, wrong anonymous mutation error ordering, and unsafe malformed-envelope error normalization. A duration assertion also exposed that DB-default `created_at` made nominal 12-hour/30-minute lifetimes slightly short; explicit transaction timestamps fixed the actual boundary.

### GREEN

Exact required command, final fresh run:

```text
npm test -w @rufdiamond/api -- auth.test.ts csrf.test.ts
Test Files  2 passed (2)
Tests       23 passed (23)
```

## Final verification

```text
npm test -w @rufdiamond/api
Test Files  8 passed (8)
Tests       78 passed (78)

npm test -w @rufdiamond/contracts
Test Files  2 passed (2)
Tests       40 passed (40)

npm run typecheck -w @rufdiamond/api
exit 0

npm run typecheck -w @rufdiamond/contracts
exit 0

npm run lint -- apps/api/src apps/api/test packages/contracts/src
exit 0, no output

npm audit --omit=dev
found 0 vulnerabilities

git diff --check
exit 0
```

The complete dependency audit still reports the pre-existing four moderate development-only findings in the historical Drizzle Kit/esbuild chain. The production dependency graph, including the two additions, reports zero vulnerabilities. Official upstream documentation was checked for node-argon2 Argon2id/default options and @fastify/cookie's Fastify 5 compatibility/cookie flags. `@fastify/cookie` 10.0.1 was selected because the official compatibility table supports Fastify 5 while avoiding the latest release's Node-22-only transitive cookie package in this Node-20-targeted workspace.

## Files changed

- `apps/api/package.json`
- `package-lock.json`
- `apps/api/src/app.ts`
- `apps/api/src/config.ts`
- `apps/api/src/server.ts`
- `apps/api/src/plugins/auth.ts`
- `apps/api/src/plugins/csrf.ts`
- `apps/api/src/plugins/error-handler.ts`
- `apps/api/src/modules/audit/repository.ts`
- `apps/api/src/modules/identity/passwords.ts`
- `apps/api/src/modules/identity/protected-delivery.ts`
- `apps/api/src/modules/identity/repository.ts`
- `apps/api/src/modules/identity/routes.ts`
- `apps/api/src/modules/identity/schemas.ts`
- `apps/api/src/modules/identity/service.ts`
- `apps/api/test/contract/health.test.ts`
- `apps/api/test/contract/problems.test.ts`
- `apps/api/test/integration/auth.test.ts`
- `apps/api/test/integration/csrf.test.ts`
- `packages/contracts/src/auth.ts`
- `packages/contracts/src/integration-contracts.test.ts`
- `.superpowers/sdd/2026-09-07-backend-frontend-integration/task-4-report.md`

## Self-review

- Confirmed all new transport objects use strict TypeBox schemas and both priced/unpriced `/me` contracts reject cross-scope payloads.
- Confirmed no raw session/reset token, password, delivery key, credential hash, or reset link appears in JSON responses, audit metadata, generic outbox payload fields, or test output.
- Confirmed denied authentication audits have nullable actor/company and carry only a target ID when known plus a SHA-256 login fingerprint.
- Confirmed the delivery handler runs only after the Task 3 worker commits its claim and receives a provider idempotency key.
- Confirmed the controller-owned plan amendment and pre-existing untracked dependency/output directories remain unstaged and untouched.

## Concerns / deployment notes

- The rate limiter is deliberately process-local and resets on restart; it is appropriate only for the documented single-API pilot and is not cross-instance durable protection.
- A configured worker must retain previous delivery decryption keys until every pending envelope using them has expired. The API intentionally does not start that worker, and this task provides no real notification adapter.
- Task 5 must replace the typed deny-all authorization resolver with the real database-backed policy before protected customer catalogue routes are enabled.

## Review fix round 1

Base reviewed: `f6849fa67238a6c946d4f8353a824d915ad70892`.

### Fixes

- Session issuance and password reset now serialize on the same `app_user` row lock. Argon2 verification remains outside the transaction, then the locked account's active state and exact verified password hash are rechecked before insertion. Whichever operation acquires the lock first wins safely: a subsequent reset revokes the new session, while a preceding reset causes the stale sign-in to fail generically without inserting a session.
- Successful sign-in now passes the already authenticated cookie token into the identity service and revokes only that presented session in the same transaction that inserts and audits its replacement. Other device sessions remain valid.
- Current-session logout, logout-all, and direct privilege-change revocation now write safe audit records in the same transaction as revocation. Route logout carries its request ID; the direct security helper requires an explicit mutation/security audit context. Audit metadata contains only action, scope, and a safe `revokedCount`.

### RED

Exact command:

```text
npm test -w @rufdiamond/api -- auth.test.ts csrf.test.ts
```

Observed against the reviewed implementation after adding the four behavioral regressions:

```text
Test Files  2 failed (2)
Tests       4 failed | 22 passed (26)
```

The deterministic interleaving test showed stale sign-in resolved after reset instead of rejecting; the cookie-rotation test showed the presented old token still returned 200 instead of 401; current/all logout and direct privilege revocation had no matching audit rows.

An intermediate run after the behavioral fix was `2 failed | 24 passed`: both remaining assertions showed `revokedSessions` was replaced with `[REDACTED]` by the established sensitive-key audit filter. Renaming the non-sensitive numeric metadata field to `revokedCount` preserved the sanitizer and made the safe audit shape explicit.

### GREEN and scoped final verification

```text
npm test -w @rufdiamond/api -- auth.test.ts csrf.test.ts
Test Files  2 passed (2)
Tests       26 passed (26)

npm run typecheck -w @rufdiamond/api
exit 0

npm run lint -- apps/api/src/modules/identity/service.ts apps/api/src/modules/identity/repository.ts apps/api/src/modules/identity/routes.ts apps/api/test/integration/auth.test.ts apps/api/test/integration/csrf.test.ts
exit 0, no output

git diff --check
exit 0
```

No contract schema changed in this fix. Per the scoped re-review request, the already recorded whole-suite verification above was not unnecessarily repeated.

### Review-fix files changed

- `apps/api/src/modules/identity/repository.ts`
- `apps/api/src/modules/identity/routes.ts`
- `apps/api/src/modules/identity/service.ts`
- `apps/api/test/integration/auth.test.ts`
- `apps/api/test/integration/csrf.test.ts`
- `.superpowers/sdd/2026-09-07-backend-frontend-integration/task-4-report.md`

### Review-fix concerns

None within this fix scope. Future account/MFA mutation callers must supply their authenticated mutation/security audit context to `revokeForPrivilegeChange`; no future routes were added here.
