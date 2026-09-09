# RufDiamond deployment and testing guide

Audience: Deepshika and the RufDiamond deployment operator.

**Current status:** the temporary Supabase staging database foundation exists.
Full API/frontend integration, a connected public staging URL, tester accounts
and OVH deployment have not yet been verified. This guide is the handoff
checklist, not a claim that those steps have already happened.

### PNG integration Task9a: dormant transport seam

Task9a adds the server-only authenticated transport and contract repository plus
the `/api/v1/*` Next route. It does **not** yet switch the fixture-backed customer
pages/providers to the API. Keep this release private/local until Task9b connects
the authenticated UI, identity-scoped state and private asset packaging, and Task9c
verifies admin/upload/publish and native browser acceptance. Merely setting API
mode on this intermediate release does not make its customer pages live.

The placeholder-only settings are in [frontend-api.env.example](frontend-api.env.example).
`RUF_REPOSITORY_MODE=fixture` (the current local default) makes the proxy return404,
never seed data. Explicit `api` mode requires `RUF_API_UPSTREAM_URL` and
`RUF_WEB_ORIGIN`, both exact origins without paths, queries, user information or
wildcards. HTTPS is required except explicit HTTP loopback for local work. The
API's `WEB_ORIGIN` must exactly equal the frontend `RUF_WEB_ORIGIN`. Set
`RUF_DEPLOYMENT_ENV=staging|production` for connected hosted environments; both
reject fixture mode and require HTTPS browser origins. No database/storage/session
secret belongs in these frontend settings or a `NEXT_PUBLIC_*` variable.

The proxy permits only implemented catalogue, identity, mapping, drawing-intent
and publication paths/methods. Request bodies are JSON with route-specific bounds;
PNG bytes go through the authorized storage intent. Every write checks the
incoming Origin and any Referer; protected writes require CSRF. Only the two
session cookie names and explicit API headers are forwarded. Set-Cookie values
remain separate. Responses are contract-validated and private/no-store. Only
release-pinned customer drawing delivery may redirect to HTTPS storage; the proxy
never follows redirects or fetches arbitrary caller URLs. Private drawing storage
URLs remain short-lived capabilities and must not be logged.

`getBackendApiRepository()` creates a request-local server repository with the
current cookie context. Its list/search methods consume up to100 pages of100 rows
and return shared `{items,nextCursor:null,releases}` envelopes. The contributing
release references are a union, **not** a per-part ownership mapping. In particular,
search results preserve `releasePartId`; clients must not guess a singular
`releaseId` from the first metadata entry. RFQ submission remains gated until its
real service and exact ownership validation exist. `getPartUsageIndex()` returns
`{items: Record<partId,summary>,releases}`. `getFigureDetail`/`getFigure` preserve the
complete shared release/mapping envelope and reject inconsistent figure/row/
callout/drawing identities. The unused `getDrawingFile(id)` seam explicitly throws
`DRAWING_LOOKUP_UNAVAILABLE`; use the figure's release-pinned content URL instead.

`CATALOG_CURSOR_STALE` restarts the entire aggregate at most once. Repeated
cursors, duplicated items, contradictory same-model releases and oversized
aggregates fail visibly; partial/stale data and fixture fallback are never returned.
Task9b must also keep separately requested page fragments mutually consistent and
adapt nullable/optional shared types without reconstructing prices or reference
labels. The Task9a unit tests exercise injected Request/Response boundaries; they
are not native authentication, storage, browser-upload or hosted-staging evidence.

Isolated tests must use explicitly created disposable PostgreSQL, private versioned
storage and scanner services. Never source `apps/api/.env.local`: its existing
Supabase migration credentials are unrelated to disposable integration testing.
Use a separate unused Next port and preserve the existing port3100 preview.

## What runs where

- **Temporary testing:** Vercel frontend → same-origin API proxy → Fastify and
  worker on the authorized staging host → temporary Supabase PostgreSQL.
- **Final hosting:** separate OVH staging and production instances, each with
  its own PostgreSQL, private drawings, secrets and backups.
- **Drawings:** private, versioned objects delivered through authorized API
  routes. They are never copied into a public frontend asset directory.

A Git push uploads code. A Vercel deployment builds the frontend. Neither
proves that the database, API, private images, accounts or notification worker
are connected. A live URL is accepted only after the tests below pass.

## Before deploying

The deployment operator must record these in the sanitized staging acceptance
report; secret values stay in the deployment secret store:

| Required item | What to verify |
| --- | --- |
| Release | Reviewed commit, passing CI and exact API/web artifact digests |
| Staging URL | Actual HTTPS hostname, with explicit staging labeling |
| API and worker | Running the same reviewed backend release |
| Database | Correct staging identity/schema, TLS verification and separate runtime/migration roles |
| Private drawings | Exact version pins work; unauthenticated and out-of-scope access fail |
| Authentication | Exact origin, secure host-only cookies, CSRF and working invitations |
| Notifications | Test sink only; no RFQ reaches a real customer |
| Recovery | Current encrypted backup and demonstrated isolated restore |

Do not put database passwords, session keys, delivery keys or object-store keys
in `VITE_*`, `NEXT_PUBLIC_*`, screenshots, email or Git. The browser uses relative
`/api/v1` URLs; server credentials remain server-side.

## Deployment procedure

1. Choose the reviewed release that passed CI and staging checks. Do not build
   from an unreviewed working directory or use a mutable `latest` image tag.
2. Verify the target is **staging**, the current backup is usable, and the new
   application is compatible with the migration version.
3. Apply reviewed additive migrations once through the migration job/identity,
   with the deployment and migration locks held. Do not run migrations from
   the Vercel frontend build or with the application's runtime account.
4. Start the API and worker from the same pinned backend image. Verify internal
   readiness, private storage and the captured-notification worker.
5. Deploy the matching frontend to Vercel and configure `/api/` to the verified
   staging API origin. Preserve API error responses; an API 404 must not return
   the React HTML page. Confirm secure cookies and CSRF through that proxy.
6. Run the checklist below using named test accounts and record results against
   the deployed commit. A green build is not a substitute for these checks.
7. If readiness or smoke checks fail, retain maintenance mode. Revert to the
   previous compatible image release; do not drop tables or run destructive
   down migrations. Corrupt data requires an isolated restore and controlled
   switchover by the operator.

The executable deployment scripts and final build commands are deliverables of
the [OVH deployment plan](superpowers/plans/2026-09-07-ovh-staging-production.md).
They must be verified before being presented as copy-and-run production steps.
The repository currently still builds Next.js at its root; do not change Vercel
to `apps/web/dist` until the planned Vite cutover has passed its review and tests.

## Test access

Deepshika's intended recipient is `dghale@rufdiamond.com`. Her main portal
account will be a **staging-only Purchaser** in the synthetic Fat Truck test
company. She will receive an expiring one-time invitation to set her own
password. No reusable password belongs in this guide or the completion email.

Additional named staging identities cover Technician and a separate company.
Privileged mapping/publishing tests use separate explicit grants with MFA, not
the Purchaser account. Test portal access does not grant access to the Supabase
dashboard, database connection or production environment. Accounts have not yet
been provisioned; activation details are sent only after the flow is verified.

## Deepshika's acceptance checklist

| Test | Expected result |
| --- | --- |
| Sign in, refresh and open a direct figure link | Session persists; the correct figure loads without a blank page |
| Sign out and use the old tab again | Protected requests require sign-in |
| Request/reset password, then retry the old link | One-time link works once; old sessions and reused link are rejected |
| Search part number and description | Only permitted active-release results appear |
| Open another company's catalogue using its URL | Access is denied without leaking its parts or counts |
| Open drawings beyond Windows and Filters | Each released drawing and all approved markers load |
| Wheel over image; use zoom buttons | Smooth zoom in/out; page scroll outside image stays normal |
| Pan, fullscreen, keyboard and narrow-screen view | Drawing stays usable; focus and selection remain clear |
| Click each repeated callout, then its list row | All occurrences map to the right part; marker alignment survives zoom |
| Technician with pricing disabled | No prices in page, API responses, print or export; RFQ submission is denied |
| Purchaser submits a synthetic RFQ twice/retries | One RFQ, same server reference, correct quantities/comments/address |
| Open RFQ history and quote details | Only permitted company history; immutable submitted values preserved |
| Staff edits draft while a customer is browsing | Customer continues to see the active immutable release |
| Staff tries to publish incomplete/unmapped data | Publication is blocked with useful issue details |
| Named publisher activates/rolls back a complete test release | Whole release changes together; old snapshots are unchanged |
| Notification worker retries a captured test event | RFQ remains submitted; retry state is visible; no customer mail is sent |

Use synthetic records for these tests. Local preview marker proposals are not
approved catalogue data, even if the preview looks correct. Missing source
labels and conflicting drawings remain publication blockers.

For a failure, record the staging URL, commit/release, account's test role,
figure/part reference, steps, expected/actual result, browser and request ID.
Attach a screenshot or short video with no password, token or private URL.

## Moving off Supabase

The operator exports staging PostgreSQL and versioned drawing manifests,
restores into isolated OVH staging, verifies checksums/access/RFQ history, then
switches API and worker connection settings together. Writes are paused for the
final transfer; restored sessions are revoked and old notifications are not
replayed. Keep the original source intact until the rollback window closes.

Production is a separate promotion with its own accounts, approved catalogue,
private storage and recovery evidence. Do not promote test users or synthetic
RFQs. Xero remains outside the current scope.
