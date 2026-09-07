# Backend integration and isolated OVH environments

Date: 2026-09-07. Status: recommended execution design; infrastructure has not
been provisioned. This extends the approved [backend specification](../../backend-specification.md)
and implements the user's requirement for separate staging and production
instances. It does not declare either environment live.

## Current state and scope

At `b8a0926`, the customer UI is Next.js with an asynchronous in-memory
repository. Sign-in redirects without authentication; RFQ confirmation and
company details are local demonstration state. Fastify has `/health/live`,
TypeBox contracts, PostgreSQL/Drizzle schemas and five migrations, but no
business endpoints. There is no Vite workspace, deployment workflow, or
production Compose configuration. Existing local Compose is not deployable
infrastructure.

The target remains the approved Vite/React client, Fastify/TypeScript modular
monolith and worker, PostgreSQL, and private versioned drawing storage. Xero
remains deferred. Preserve RFQ, not payment or binding purchase-order behavior.
Keep the current UI available until the replacement passes parity checks.

## Recommended approach and alternatives

1. **Recommended:** complete the API behind a typed repository adapter, migrate
   screens incrementally into Vite alongside Next, then deploy immutable
   container artifacts to two isolated OVH Public Cloud instances. This keeps
   the approved stack and allows independent functional checkpoints.
2. Keep Next permanently and connect it to Fastify: fewer immediate routing
   changes, but departs from the approved Vite architecture. Not selected.
3. Managed database plus multiple application nodes: stronger availability,
   more resources and operational cost. Not selected for the pilot; the
   application boundary allows it later without rewriting the frontend.

No Kubernetes, shared staging/production database, or staging-as-production-
failover arrangement. Two environments are isolation, not high availability.

## Environment boundaries

| Resource | Staging | Production |
| --- | --- | --- |
| Compute | Dedicated OVH instance | Different dedicated OVH instance |
| Suggested initial capacity | 2 vCPU / 4 GiB RAM | 4 vCPU / 8 GiB RAM |
| Public origin, subject to DNS ownership | `staging.parts.rufdiamond.com` | `parts.rufdiamond.com` |
| Services | HTTPS proxy/static web, API, worker, PostgreSQL | Same service/image layout |
| Database and volumes | Staging only | Production only |
| Object storage and backups | Separate buckets and credentials | Separate buckets and credentials |
| Data | Synthetic or explicitly anonymized fixtures | Approved customer/catalogue data |
| Notifications | Captured, no customer delivery | Verified RufDiamond delivery configuration |
| Deployment | Successful main-branch candidate | Explicit promotion of tested digest |

These sizes are planning estimates, not purchased SKUs or a verified capacity
guarantee. Select currently available general-purpose Canadian-region flavors
at provisioning and load-test them. RufDiamond owns the account; use separate
Public Cloud projects per environment, service identities and SSH credentials.
Infrastructure state, registries and observability must not expose secrets.

Each host runs Docker Compose. Only HTTPS/HTTP and source-restricted management
access enter the host. PostgreSQL and API container ports are not published
publicly. Serve the Vite bundle and `/api/v1` from the same origin through
Nginx. Both deployed environments use `NODE_ENV=production`; a separate
`APP_ENV=staging|production` controls safe operational defaults. Session
cookies are host-only, Secure, HttpOnly and SameSite; do not share a parent-
domain cookie across environments.

## Read and identity contracts

Every model-scoped customer request resolves one authorized active immutable
release once. All figure rows, callouts, relationships, prices and drawing
versions in that response come from that release. Navigation/search spanning
models captures one active release per allowed model in one repeatable-read
transaction; never mix two releases for the same model. Cursors bind the
query, principal scope and release set; a changed release returns a restart
conflict rather than mixing pages.

Public navigation IDs remain stable working IDs resolved through snapshot
`working_id`; release-local IDs are separate. DTOs carry `releaseId` and
`releasePartId` explicitly. Do not assume release IDs equal working IDs.
The RFQ submission rejects a stale release and preserves the user's draft
until they review refreshed prices/availability.

Revise shared TypeBox contracts before wiring clients: drawing metadata and
authenticated content URL, nullable optional metadata, string callout labels,
optional masks, server-generated RFQ references, notes/shipping snapshots and
decimal-string money. Hidden-price responses omit monetary fields; the UI
must not turn missing prices into zero or expose them in print/export views.
Database numeric precision stays authoritative. Use one canonical contract,
not separate conflicting frontend/backend definitions.

First-party sessions replace the demonstration login and placeholder company.
Preserve username-style login with a unique canonical login ID plus email for
recovery; do not reuse credentials from the legacy supplier system. Capabilities
and SQL scope intersections remain the authority. Named publisher grants,
per-company technician pricing, and explicitly paired dealer/customer access
are defaults. Never enable `publish.block.override`.

## Drawings, publication and frontend experience

Do not ship `public/drawings`, seed catalogue data, or preview proposals in a
production web image. Serve validated raster derivatives through a scoped
same-origin authenticated endpoint backed by a pinned object version. Keep
originals private; optional short-lived download links are also scoped.

The 529 local preview placements are proposals, not approved customer data.
They must not become published placements during a migration or seed operation.
The currently unresolved mappings still block their affected model release.
An authorized staff-only draft preview may run in staging, but normal customer
routes remain release-only. A synthetic complete catalogue can validate the
backend while real source issues are being resolved.

Carry over both working reference drawings and other verified sections. Preserve
mouse-wheel zoom over the image/markers, toolbar zoom, pan, fullscreen, fit,
marker-to-row and row-to-all-occurrences selection, and optional shape masks.
Wheel events outside the image retain normal page/list scrolling. Add loading,
retry, empty, denied, stale-release and session-expired states. Dense markers
need usable focus/selection without moving their source coordinates. Verify
keyboard, touch and desktop behavior; provide a clearly labelled demo video.

## Delivery and recovery

Push reviewed task commits to a feature branch; never force-push or deploy
directly from a developer machine. CI builds immutable web/API images once,
records their digests and schema version, deploys staging, and promotes the
same artifact pair to production after gates. A database expand migration
precedes traffic; destructive contraction is a separate later release.
Application rollback does not roll the database backward.

Use the approved [backup plan](../../backup-and-recovery-plan.md): continuous
WAL/PITR for seven days; encrypted nightly 02:00 America/Toronto backups;
30 daily, 12 monthly and seven annual copies; versioned drawings with weekly
and post-bulk archives retained 12 months; quarterly RufDiamond-held portable
exports; monthly isolated restore tests, quarterly manual and annual offline
rehearsals. Backup identities cannot administer the production application.

Canadian primary and normal backup placement are defaults. Same-region backups
cannot support a region-loss RPO claim. A measured sub-five-minute regional
RPO requires independently reachable, continuously copied Canadian-region WAL
and matching base backups; otherwise record the limitation and block that
launch claim. There is no warm standby; instance failure requires restore or
replacement, with phone/email fallback. Backups, VM snapshots and a staging
server are not substitutes for a tested PostgreSQL restore.

## Execution and external prerequisites

Execute the [integration plan](../plans/2026-09-07-backend-frontend-integration.md)
before application cutover; the [OVH plan](../plans/2026-09-07-ovh-staging-production.md)
can independently validate packaging with synthetic data. Use task-by-task
delegated development, specification review, code review and test gates.

No further product choices are needed to start local implementation. Before
paid provisioning or public launch, the operator must supply the actual
RufDiamond-owned OVH project access, authorized spending limit, confirmed DNS
zones, allowed management source addresses, and verified production email/
alert destinations. These are deployment inputs, not reasons to stop local
integration work. Do not infer them from a catalogue login or send test RFQs
to real customers. Public launch also requires approved complete source data,
security checks and a successful measured restore.
