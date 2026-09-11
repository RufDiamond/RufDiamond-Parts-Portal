# Protected admin and local native integration

The Next frontend remains the application. Browser requests use same-origin
`/api/v1/*`; the Next route forwards only allowlisted requests to Fastify using
server-only `RUF_API_UPSTREAM_URL`. `WEB_ORIGIN` on Fastify must exactly match
`RUF_WEB_ORIGIN`. The frontend never receives database or S3 credentials.

Draft discovery filters capabilities, environment, brand and variant before
returning names or versions. A drawingless figure uses only safe figure metadata
until upload/finalize supplies a valid source. Replacement retains the existing
editor's explicit current-source reconciliation. Publisher controls use the
named publisher capability independently of mapping rights. Publishing checks
both working and publication versions and activates one immutable snapshot.

Admin byte URLs bind the authorized figure version and drawing-file UUID.
Customer byte requests bind the active release UUID. The API reads the exact
stored object version, bounds/checks its bytes and SHA-256, then reauthorizes
before returning private/no-store PNG content. This session-authorized path does
not issue a reusable unauthenticated capability. Existing signed upload/read
lifetimes remain fifteen/five minutes. Never fetch a mutable latest object to
recover from a conflict.

## Reproduce on an isolated desktop

Requires Docker with the pinned PostgreSQL17, MinIO and clamd images, Node/npm,
and installed Chrome with a desktop display. Linux CI needs an isolated display
session (for example Xvfb) and `CUSTOMER_CHROME_EXECUTABLE` pointing to Chrome.
The test opens its own profile using public Playwright `noDefaults`; it does not
attach to an existing browser. Ports3207/3307 must be unused. Preserve3100.

Run from the repository root, with no `.env.local` loading:

```sh
RUF_REPOSITORY_MODE=api RUF_DEPLOYMENT_ENV=local RUF_API_UPSTREAM_URL=http://127.0.0.1:3307 RUF_WEB_ORIGIN=http://127.0.0.1:3207 RUF_NEXT_DIST_DIR=tmp/next-admin-native npm run build
RUF_REPOSITORY_MODE=api RUF_NEXT_DIST_DIR=tmp/next-admin-native node tools/package-api-frontend.mjs /absolute/new/admin-frontend-artifact
HOSTNAME=127.0.0.1 PORT=3207 RUF_REPOSITORY_MODE=api RUF_DEPLOYMENT_ENV=local RUF_API_UPSTREAM_URL=http://127.0.0.1:3307 RUF_WEB_ORIGIN=http://127.0.0.1:3207 node /absolute/new/admin-frontend-artifact/server.js
```

In a second terminal:

```sh
npx playwright test --config playwright.admin.config.ts
```

When the user's desktop cannot remain undisturbed, the same owned-profile Chrome
harness has an explicit **operational-only** headless mode:

```sh
CUSTOMER_CHROME_OPERATIONAL_HEADLESS=true ADMIN_OUTPUT_DIR=output/admin-operational npx playwright test --config playwright.admin.config.ts
npm exec -w @rufdiamond/api -- vitest run test/native-runtime.test.ts
```

Headless runs the real API/storage/browser workflow, not mocked HTTP. It explicitly
skips the separate headed-only true-hidden/tab-return test; that skip is not a
passing native visibility result. The real-HTTP non-owner test is another distinct
layer, not browser evidence. Default headed behavior is unchanged. Earlier Task9b
headed visibility evidence remains separate from Task9c's actual-backend gate.
See the Task9c report for final counts and any remaining acceptance concerns.

The test itself creates and tears down an entirely disposable PostgreSQL cluster,
private versioned MinIO bucket and clamd process. Setup applies migrations and
creates synthetic accounts/source rows using owner authority. Fastify connects
through a separately generated NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION/
NOBYPASSRLS runtime role. `apps/api/src/db/local-runtime-grants.ts` gives explicit
table/column permissions for these services, never unrestricted defaults, DDL,
TRUNCATE, account-role changes or immutable-history UPDATE/DELETE. Some mutable
identity columns have UPDATE solely because PostgreSQL row locks require an
UPDATE privilege. Immutable drawing metadata uses no write lock or UPDATE grant.
Outbox/audit INSERT is available; notification worker delivery is not enabled.
The helper accepts only the fixture's disposable role naming pattern and does
not create roles, change role attributes, read environment files or touch the
historical remote NOLOGIN role.

Clamd uses a deterministic test signature database, proving real scanning and
transport only; it does not establish production signature freshness. Exact
MinIO origin configuration is verified by allowed and foreign preflights plus
actual native browser PUT. Synthetic source evidence and approval belong only
to the generated local fixture.

Passwords, cookies, CSRF tokens and signed URLs stay in memory. Actual-backend
Playwright traces/video and automatic screenshots are disabled. Explicit images
capture only post-sign-in synthetic screens. Failure probes omit headers,
bodies and URL queries; they record renderer/frame health and allowlisted
database permission errors before teardown. Never enable unsanitized network
traces against real sessions.

## Remote prerequisites

No remote staging acceptance is implied. An operator must supply approved OVH
staging/production hosts, DNS and HTTPS origins, private network routes, separate
databases/buckets and runtime credentials, maintained scanner signatures/health,
backups and cleanup scheduling. Apply reviewed migrations through separate
migration authority; provision an independently reviewed remote runtime role.
The dated Supabase foundation record covered0001–0006 and a NOLOGIN role only.
Do not assume current migrations or local grants are installed remotely.
Temporary Supabase remains PostgreSQL behind Fastify. Staging and production
must be separate. Real catalogue source import/approval and the RFQ backend
remain separate prerequisites; native synthetic publication supplies neither.
