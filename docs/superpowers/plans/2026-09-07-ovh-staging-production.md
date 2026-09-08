# RufDiamond OVH Staging and Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the portal reproducibly and deploy the same verified release to separate OVH staging and production instances with independent data, secrets and tested recovery.

**Architecture:** One Canadian OVH Public Cloud instance per environment runs HTTPS/static web, Fastify, an outbox worker and its own PostgreSQL on a persistent volume. Private versioned object storage holds drawings; independent Canadian-region storage holds encrypted backups. CI builds once and promotes digest-pinned images through staging and production gates.

**Tech Stack:** Node/TypeScript compiled images, Vite static assets, PostgreSQL 17, Docker Compose, Ubuntu LTS, Nginx, ACME certificates, OVH/OpenStack CLI, S3 API, pgBackRest, GitHub Actions and a private OCI registry.

**Spec:** `docs/superpowers/specs/2026-09-07-integration-and-ovh-design.md`, `docs/backend-specification.md`, `docs/backup-and-recovery-plan.md`; application dependency `docs/superpowers/plans/2026-09-07-backend-frontend-integration.md`.

## Global Constraints

- Exactly two normal application instances: one staging, one production. Separate projects, networks, volumes, databases, buckets, service identities and credentials; staging is not a production standby.
- Both use `NODE_ENV=production`. `APP_ENV` differentiates environments; no production image includes seed data, preview proposals, private drawings or secrets.
- Canadian primary and normal backups; no warm standby. Do not claim high availability or an achieved RPO/RTO without measured evidence.
- Seven-day continuous WAL/PITR; encrypted nightly backup at 02:00 America/Toronto; 30 daily, 12 monthly and seven annual copies. Weekly/post-bulk drawing archives retained 12 months; quarterly independent offline export.
- Monthly isolated restores, quarterly human rehearsals, annual offline-only rehearsal. Restore verification is a launch gate, not a future operational enhancement.
- Build once; promote exact web/API digests. No `latest` deployment tags, `git pull` builds on servers, force-pushes, destructive database rollback or shared environment credentials.
- Xero remains deferred; staging notifications are captured and cannot reach customers.
- Tasks 1–5 are local/CI preparation. Task 6 makes paid external resources and requires actual authorized account/project/budget/DNS inputs. Do not invent them or provision during plan writing.
- Never expose PostgreSQL, API/internal health metrics, Docker socket or worker ports to the public internet. Never run a persistent privileged CI runner on either application host.
- Supabase is temporary staging PostgreSQL only. Keep first-party authentication and ordinary SQL/migrations; do not introduce Supabase Auth, browser Data API access or provider-specific business logic. The final two OVH environments each own their database.
- A successful Git push or Vercel frontend build is not end-to-end deployment evidence. Deepshika receives staging-only portal access and deployment/testing instructions after the required services and tests pass; never send database or production credentials.

---

## Provider findings and selected defaults

### Temporary Vercel/Supabase testing path

The user confirmed that Supabase will be replaced by OVH and requested a
runnable Vercel deployment plus a practical handoff for Deepshika. Use Vercel
for the temporary frontend, with same-origin `/api/v1` proxying to the portable
Fastify service on the authorized OVH staging host. Keep the existing durable
worker on that host, not inside a request invocation. Until that host and its
private drawing store exist, a frontend-only Vercel deployment is a UI preview,
not the connected live portal.

Vercel supports both [external rewrites](https://vercel.com/docs/routing/rewrites)
and [Fastify Functions](https://vercel.com/docs/frameworks/backend/fastify).
The selected design retains the already approved persistent API/worker model;
it does not add a second serverless deployment model and duplicate worker
delivery behavior merely for temporary hosting.

| Phase | Frontend | API / worker | Database | Gate |
| --- | --- | --- | --- | --- |
| Temporary tester environment | Vercel, explicit staging origin | OVH staging host | Existing Supabase staging project | Connected smoke tests and named test accounts |
| OVH staging rehearsal | OVH staging, same tested web build | Same staging services | Isolated OVH staging PostgreSQL | Portable restore and object-version remapping verified |
| OVH production | Separate OVH production host | Production services | Separate production PostgreSQL | Approved catalogue, recovery evidence and owner promotion |

Private drawings remain behind the API and use a version-aware object-store
adapter. Their storage is not the Vercel public assets directory. Never assume
provider object-version identifiers survive copying: migration exports record
source key/version/hash, and a verified mapping resolves each immutable pin to
the destination object/version without editing sealed snapshot content.

Move temporary staging data through encrypted PostgreSQL export/restore and
checksum-verified drawing transfer. Quiesce staging writers and workers for the
final export; restore to a new isolated target, replay no notifications, revoke
restored sessions, verify schema/active-release checksums/tenant scopes/RFQ
history, then switch server-side connection settings. Keep the source intact
for a controlled rollback; never dual-write or automatically delete Supabase.
Test accounts and synthetic RFQs are not promoted into production.

The handoff guide is `docs/deployment-and-testing-guide.md`. It must distinguish
verified commands and actual URLs from planned steps; no shared password is
placed in Git or in the completion email. Provision named tester access through
an expiring, single-use invitation after the identity/account flow is ready.

Use BHS/Beauharnois for compute and live drawings. Toronto is a candidate
Canadian off-site object-storage region, not a second compute failover location:
the current [OVH regional matrix](https://www.ovhcloud.com/en/public-cloud/regions-availability/)
lists S3 storage there but not compute or PostgreSQL. Recheck actual region
codes, quotas and stock before ordering; `BHS` marketing labels are not an
assumed OpenStack region ID.

Use separate private networks, a gateway and Floating IP for each environment.
Those are additional billed resources, not extra application instances. A
single-node load balancer is unnecessary for this pilot. See
[OVH networking concepts](https://docs.ovhcloud.com/en/guides/public-cloud/network-services/concepts).
Start with roughly 2 vCPU/4 GiB staging and at least 4 vCPU/8 GiB production,
subject to currently available general-purpose flavors and load-test results;
production must not rely on a shared-resource development flavor. Budget also
includes persistent volumes, version accumulation, long-term backups, IPv4,
gateway, registry, monitoring, support and tax; obtain the actual account quote.

Select self-managed PostgreSQL for the two-instance pilot and own the restore/
patch responsibilities explicitly. Managed PostgreSQL remains an optional
separate architecture/cost decision, not an unnoticed extra service. Its default
BHS off-site backup destination is France, so it cannot be assumed Canada-only.
[OVH database backup locations](https://docs.ovhcloud.com/en/guides/public-cloud/databases/backups).

Private S3 means authenticated objects, not necessarily a private network
endpoint. OVH documents public S3 endpoints; use TLS and scoped credentials.
[Object storage locations](https://docs.ovhcloud.com/en/guides/storage-and-backup/object-storage/s3-location).
Enable Object Lock when creating archive buckets and enable versioning;
governance retention must not be bypassable by application/backup writers.
Validate the selected regional product with a disposable bucket first.
[OVH Object Lock](https://docs.ovhcloud.com/en/guides/storage-and-backup/object-storage/s3-managing-object-lock).

## Files and ownership

```
apps/api/Dockerfile                     compiled API/worker/migration image
apps/api/tsconfig.build.json            production ESM output
apps/web/Dockerfile                     static bundle served by unprivileged Nginx
packages/contracts/tsconfig.build.json  compiled shared contract exports
infra/deploy/compose.yaml               production-equivalent service graph
infra/deploy/nginx.conf.template        HTTPS, API routing, SPA fallback, headers
infra/deploy/release.schema.json        digest/schema compatibility manifest
infra/deploy/validate-release.mjs        reject invalid or mutable image references
infra/deploy/deploy.sh                  locked migration/start/probe/rollback procedure
infra/ovh/environments.schema.json      non-secret target inventory contract
infra/ovh/validate-environments.mjs     isolation/preflight checks
infra/ovh/cloud-init.yaml               OS hardening, no embedded secrets
infra/ovh/provision.sh                  explicit target-aware OpenStack provisioning
infra/backup/pgbackrest.conf.template   encrypted continuous archive/base backups
infra/backup/{nightly,archive-drawings,restore-verify,export-portable}.sh
infra/backup/{ruf-backup.service,ruf-backup.timer}
infra/runbooks/{provision,release,restore,incidents}.md
infra/vercel/write-config.mjs           validated temporary same-origin proxy configuration
infra/test/vercel.test.mjs              API routing, SPA and environment-isolation checks
docs/deployment-and-testing-guide.md    Deepshika's operator/tester handoff
infra/test/{environment,release,backup-policy}.test.mjs
apps/api/src/ops/{readiness,metrics,portable-export,restore-check}.ts
.github/workflows/{ci,release,deploy-staging,promote-production,restore-drill}.yml
```

Keep `infra/compose.yaml` as the existing local-development service. Do not
overwrite it with live secrets or change the running local preview port.

Deployment input types, validated at runtime and stored outside Git when they
contain actual operational identifiers:

```ts
type EnvironmentName = "staging" | "production";
interface EnvironmentTarget {
  name: EnvironmentName; projectId: string; region: string;
  serverName: string; flavorId: string; imageId: string;
  subnetCidr: string; managementCidrs: string[]; hostname: string;
  dataVolumeId: string | null; liveBucket: string; backupBucket: string;
  archiveBucket: string; backupRegion: string; sshKeyName: string;
}
interface ReleaseManifest {
  formatVersion: 1; gitSha: string; apiImage: string; webImage: string;
  schemaVersion: number; minimumCompatibleSchema: number;
  createdAt: string; ciRunUrl: string;
}
```

Image fields must match a registry reference ending `@sha256:` plus 64 hex
digits. Secrets are injected via root-owned 0600 files/Compose secrets, never
build arguments: DB app/migrator/backup credentials, session/HMAC and MFA keys,
S3 live/backup keys, archive encryption key, notification credentials and
registry pull credentials. Each environment has independent values. Only
relative `/api/v1` and non-sensitive display settings reach the web bundle.

### Task 1: Build real production artifacts and runtime probes

**Files:** Create the API/web Dockerfiles and TypeScript build configs above; modify workspace package exports/scripts, root `.dockerignore`, `apps/api/src/{app,config,server}.ts`, `apps/api/src/plugins/error-handler.ts`; create `apps/api/src/ops/{readiness,metrics}.ts`; tests `apps/api/test/contract/{readiness,production-config}.test.ts`.

**Interfaces:** `GET /health/live` means process alive; internal `GET /health/ready` returns `{status:"ready"}` only when DB/schema/object-store dependencies are usable; otherwise safe 503. `GET /metrics` is internal. Production start is `node dist/server.js`, worker `node dist/worker/main.js`, migrations `node dist/db/migrate.js`; no runtime `tsx` dependency.

- [ ] Add tests for unavailable DB, old schema, bad S3 credentials, missing production secrets, forbidden wildcard origin and stale worker heartbeat. Run focused API tests to observe failures.
- [ ] Compile contracts to `dist/` with ESM `.js` imports, export their built JS/types; build contracts before API. Preserve migration directory placement relative to compiled `dist/db/migrate.js` and test migration discovery inside the final image. Multi-stage Docker build runs `npm ci`, builds workspaces, copies only runtime dependencies/output and migrations into a non-root runtime. Pin Node/PostgreSQL/container image digests at implementation time after security scan.
  ```json
  { "scripts": { "build": "tsc -p tsconfig.build.json", "start": "node dist/server.js", "start:worker": "node dist/worker/main.js" } }
  ```
  Build the web image from `apps/web/dist` and approved branding only; do not `COPY public/` from the old root. Preserve the web workspace's own static asset allowlist.
- [ ] Enable redacted structured logging with request IDs, route/status/duration and environment. Redact cookies, Authorization, passwords, tokens, signed URLs and request bodies. Correct error titles for 401/403/404, replace the existing `.example` problem URI with a stable configured public origin. Handle body limits and dependency failures with safe RFC 9457 responses.
- [ ] Bound readiness checks to two seconds, pool acquisition to five seconds, and graceful shutdown to 30 seconds. Trust only the local reverse proxy, not arbitrary forwarded headers. Export DB pool pressure, latency, worker age, import/publish outcomes and process resource metrics without customer names or IDs as labels.
- [ ] Build/run images against synthetic local dependencies, execute compiled migrations twice, smoke the health endpoints and scan final files/layers for seeds, drawings and secrets. Require production startup without devDependencies.
- [ ] Commit as `build: add production portal artifacts and health checks`.

### Task 2: Production-equivalent Compose and HTTPS behavior

**Files:** Create `infra/deploy/{compose.yaml,nginx.conf.template,release.schema.json,validate-release.mjs}`; tests `infra/test/release.test.mjs`; create `infra/runbooks/release.md`.

Also create `infra/vercel/write-config.mjs` and `infra/test/vercel.test.mjs` for
the temporary frontend. Its `buildVercelConfig(input:{framework:"next"|"vite";apiOrigin:string}):object`
rejects a non-HTTPS origin, embedded credentials, query/fragment and loopback
upstream. `PORTAL_ORIGIN` is a separately configured exact frontend origin;
do not allow wildcard preview origins or share production cookies/secrets.

**Interfaces:** `validateRelease(value:unknown):ReleaseManifest` and service names `proxy`, `web`, `api`, `worker`, `db`; one-shot `migrate` profile uses API image and separate migration DB identity. `API_IMAGE`/`WEB_IMAGE` contain digests, not tags.

- [ ] Write node:test assertions that mutable tags and mismatched schema compatibility reject, and `docker compose config --format json` contains no public DB/API port or plaintext secrets. Run `node --test infra/test/release.test.mjs` to RED.
- [ ] Add the service kernel and explicit external data volume:
  ```yaml
  services:
    api:
      image: ${API_IMAGE:?API image digest required}
      restart: unless-stopped
      expose: ["4000"]
      read_only: true
      tmpfs: ["/tmp:size=64m"]
      cap_drop: [ALL]
      security_opt: ["no-new-privileges:true"]
      stop_grace_period: 30s
    worker:
      image: ${API_IMAGE:?API image digest required}
      command: ["node", "dist/worker/main.js"]
      restart: unless-stopped
    web:
      image: ${WEB_IMAGE:?Web image digest required}
      expose: ["8080"]
  ```
  Complete service-specific secrets, network restrictions, resource limits and healthchecks in this file. PostgreSQL runs under its own image user on a mounted encrypted data volume and has no host-published ports; the app role cannot alter schema or disable immutability triggers. Proxy alone publishes 80/443. Worker gets only required API/storage/delivery credentials, never migration/admin credentials.
- [ ] Route `/api/` without SPA fallback, `/health/` and `/metrics` deny externally, and unknown non-API routes return `index.html` for React Router. Set explicit upload/body/time limits, CSP, nosniff, frame restrictions and HTTPS redirect. HTML is no-cache, fingerprinted public assets immutable; authenticated API/drawings are private no-store. Stage HSTS without `includeSubDomains` until DNS ownership is confirmed.
- [ ] Automate ACME renewal with a timer and proxy reload only after configuration validation; use ACME staging service in tests. Test direct deep-link refresh, API 404 as problem JSON, signed-in content not cached publicly, cookies on correct host and streaming images/fullscreen under CSP.
- [ ] Write failing `node:test` assertions for Vercel configuration: `assert.throws(() => buildVercelConfig({framework:"vite",apiOrigin:"http://localhost:4000"}))`; a valid HTTPS upstream yields `/api/:path*` forwarding before the Vite SPA fallback, and Next mode leaves routing to Next without that fallback. Run `node --test infra/test/vercel.test.mjs`, implement the generator and rerun. Use the repository root for monorepo installs; final Vite output is `apps/web/dist`, never the old public drawing directory. Configure the exact temporary hostname only after provider readback; no automatic deployment in this local task.
- [ ] Test the deployed temporary proxy with actual HTTPS cookie issuance, `/me`, CSRF mutations, drawing streaming, JSON API 404 and deep-link refresh. Confirm `__Host-ruf-session` remains host-only and authenticated responses are not cached. Validate trusted proxy handling and rate limits without trusting arbitrary forwarded headers. Until all checks pass, the temporary deployment is not reported runnable end-to-end.
- [ ] Commit as `ops: add isolated runtime and reverse proxy configuration`.

### Task 3: Reproducible environment inventory and host provisioning

**Files:** Create `infra/ovh/{environments.schema.json,validate-environments.mjs,cloud-init.yaml,provision.sh}`; tests `infra/test/environment.test.mjs`; runbook `infra/runbooks/provision.md`.

**Interfaces:** `validateEnvironments(targets:EnvironmentTarget[]):EnvironmentTarget[]` rejects any shared project, server, hostname, live/backup/archive bucket or overlapping subnet. `provision.sh --environment staging|production --inventory PATH --dry-run|--apply` defaults to dry-run; apply requires explicit authorized cost/account inputs from the runbook.

- [ ] Write fixtures with shared DB bucket/project, public SSH `0.0.0.0/0`, malformed CIDR, production email sink disabled in staging, and accidental environment-name mismatch. Assert `expect` using node:assert:
  ```js
  assert.throws(() => validateEnvironments([staging, {...production, projectId:staging.projectId}]));
  assert.equal(validateEnvironments([staging, production]).length, 2);
  ```
  Define test-local complete target fixtures and run `node --test infra/test/environment.test.mjs` to RED.
- [ ] Implement JSON Schema validation plus cross-target checks; require confirmed region/flavor/image IDs, distinct subnet ranges (recommended production `10.20.0.0/24`, staging `10.30.0.0/24`), management allowlists and externally stored credentials. Cloud-init creates a key-only non-root operator, disables root/password SSH, installs pinned supported Docker/Compose, enables security updates and log rotation, and writes no credentials to instance metadata.
- [ ] Implement target-scoped OpenStack operations with exact resolved IDs. Command kernel after validated inputs:
  ```bash
  openstack server create --image "$target_image_id" --flavor "$target_flavor_id" \
    --network "$target_network_id" --key-name "$target_ssh_key" \
    --security-group "$target_security_group_id" --user-data infra/ovh/cloud-init.yaml \
    "$target_server_name"
  ```
  `target_*` variables come only from validated inventory/provider readback. Resolve existing tagged resources before creating, reject conflicts rather than replace. Create separate project/private network/subnet/gateway/Floating IP/security group and block volume per target; record IDs in a root-owned inventory outside Git. Support safe retry after partial creation, no deletion path. Data volumes have deletion protection/operator confirmation and LUKS encryption with independently escrowed keys; never auto-format an existing volume.
- [ ] Test dry-run with a fake OpenStack command recording arguments; assert production inputs never appear in staging actions, no commands destroy/format an existing resource, and all inbound rules are 80/443 plus allowlisted 22. Run shellcheck and cloud-init schema validation.
- [ ] Commit as `ops: define reproducible isolated OVH environments`.

### Task 4: Backups, portable export and measured restore

**Files:** Create `infra/backup/` files from the map, `apps/api/src/ops/{portable-export,restore-check}.ts`, `infra/test/backup-policy.test.mjs`, `apps/api/test/integration/portable-export.test.ts`, `infra/runbooks/restore.md`.

**Interfaces:** `PortableExportManifest {formatVersion:1;createdAt:string;schemaVersion:number;releaseIds:string[];files:{path:string;sha256:string;bytes:number}[]}`; `restore-verify.sh --environment ENV --backup-id ID --target-url URL --report PATH` refuses a target matching either live DB identity. `RestoreReport {backupId:string;targetTime:string;restoredThrough:string;rpoSeconds:number;rtoSeconds:number;checks:Record<string,boolean>}`.

- [ ] Add tests for retention selection (daily/monthly/annual), DST schedule, rejected live restore target, missing WAL segment, checksum mismatch, missing drawing version and portable export without vendor-specific dependencies. Run focused tests to RED.
- [ ] Configure PostgreSQL `wal_level=replica`, `archive_mode=on`, `archive_timeout=60s` and a PostgreSQL-aware archive command:
  ```conf
  archive_command = 'pgbackrest --stanza=ruf archive-push %p'
  ```
  Use encrypted pgBackRest base backups plus continuous WAL to separate BHS and Toronto repositories. Retain an unbroken base+WAL chain covering at least seven days, not merely seven backup files. Make off-site archive lag measurable; async queuing cannot hide lost remote coverage. Nightly encrypted full backups retain 30 daily copies; independently retained monthly/annual full restore sets include everything needed to restore, with 12 monthly/seven annual retention. Keep separate bucket/prefix policies from the live drawing bucket.
- [ ] Schedule nightly work in the specified timezone and catch missed runs:
  ```ini
  [Timer]
  OnCalendar=*-*-* 02:00:00 America/Toronto
  Persistent=true
  ```
  Alert if the daily backup age exceeds 26 hours or WAL archive age exceeds 180 seconds. Version live drawings and archive all release-referenced originals/derivatives weekly and after bulk uploads; keep archive manifests/hashes for 12 months. Object Lock governance retention prevents application/backup credentials from deleting protected versions; lifecycle policies must not invalidate referenced releases or retained restore chains.
- [ ] Export quarterly and before major migrations: working/released catalogue CSV/JSON, stable ID mappings, company/access configuration, orders, audit and schema manifests, exact drawings and checksums, portable DB dump and restore instructions. Encrypt identity/session/reset information; offline copies are confidential and keys are escrowed separately with RufDiamond. No raw secrets in normal JSON manifests. Retain provider-neutral outbox records; replay is disabled until reviewed to avoid duplicate customer mail.
- [ ] Restore into a fresh isolated volume/cluster, replay to a chosen timestamp, verify migration ledger/FKs/counts/release checksums/complete callouts/object versions, then run scoped customer API reads. Disable outbound mail and reset/revoke restored sessions before any test login; do not overwrite normal staging with unmasked production data. Destroy temporary recovery infrastructure only through a separate approved teardown after preserving reports, not through broad shell cleanup.
- [ ] Rehearse the Supabase-to-OVH staging cutover with the same portable export and restore checks. Compare application schema/data and capability grants rather than copying provider-owned roles/extensions blindly. Recreate least-privilege OVH roles from reviewed policy, map exact drawing object versions, switch API/worker together, and verify no outbox event is delivered twice. Record the source and destination identity plus rollback boundary; source deletion is a separate authorized operation.
- [ ] Measure DB-loss RPO under five minutes/RTO under four hours; document actual region-loss limit and phone/email fallback. Monthly isolated automated test, quarterly human test and annual offline-only exercise are scheduled artifacts. Missing base/WAL/object/key makes the drill fail, never a warning-only green. Commit as `ops: add verified backup and portable recovery workflow`.

### Task 5: CI, safe push and immutable promotion

**Files:** Create `.github/workflows/{ci,release,deploy-staging,promote-production,restore-drill}.yml`, `infra/deploy/deploy.sh`, `infra/runbooks/{release,incidents}.md`; extend `infra/test/release.test.mjs`.

**Interfaces:** Release workflow emits `ReleaseManifest` plus signed digest provenance/SBOM. `deploy.sh --environment ENV --manifest PATH --inventory PATH` acquires an environment lock, validates identity/digests/schema compatibility, records the previous manifest, runs one migration job and probes the new release. It never runs `docker compose down -v`.

- [ ] Test mismatched image digest, untrusted CI source, unsigned/unapproved manifest, schema newer than rollback compatibility, two concurrent deployments and failed readiness. Run local release tests to RED.
- [ ] On PRs run `npm ci`, lint/typecheck, contracts/API/UI tests, PostgreSQL empty/upgrade migration tests, production builds, browser tests, dependency/container scans and secret scan. Never expose deployment credentials to fork PRs. Pin third-party Actions to verified commit SHAs at implementation time; permissions default to `contents:read`.
- [ ] On reviewed main commits build images once, publish to RufDiamond-controlled private GHCR packages, record digests and attestations; API and worker use the same image. Environment jobs use concurrency locks:
  ```yaml
  concurrency:
    group: deploy-production
    cancel-in-progress: false
  permissions:
    contents: read
  environment: production
  ```
  Production is `workflow_dispatch` with a previously passing staging manifest, never arbitrary image text. Require a protected environment approval by a RufDiamond owner. Confirm the repository's GitHub plan supports required reviewers; if not, preserve manual owner-operated promotion instead of silently dropping approval.
- [ ] Use short-lived management access or an approved deployment gateway/VPN; do not open SSH to the entire internet for hosted CI runners. Pin host keys from trusted provisioning readback. Separate per-environment registry pull-only and deployment credentials; never give application hosts GitHub write tokens.
- [ ] Deploy expand-only migrations with a migration advisory lock and timeout; stop if preflight backup is stale or checksum/schema mismatch occurs. Switch app/worker after migration success, smoke test, then store accepted manifest. Roll back image digests only if the schema remains compatible; data corruption uses a new restored DB and explicit controlled switchover, not a down migration. Keep previous artifacts available.
- [ ] Add restore-drill scheduler (monthly) and reminders/runbooks for quarterly/annual checks. Operational alerts cover backup age, restore failure, disk at 80% warning/90% critical, DB/pool saturation, elevated API 5xx, outbox lag/dead letters, TLS expiry under 14 days and external uptime. Test alert delivery to the configured non-customer owner destination.
- [ ] Push the reviewed feature branch, require CI/spec/code reviews, then merge main for staging. Commit workflow work as `ci: add tested staging and protected production promotion`.

### Task 6: Provision the two authorized environments

**Files:** Record sanitized IDs and verification in `docs/verification/ovh-environments.md`; actual inventory/secrets remain outside Git. Execute `infra/ovh/provision.sh` only after prerequisites below.

**Interfaces:** Inputs are real RufDiamond-owned project access, budget approval, DNS ownership, management CIDRs, registry access and production delivery/alert destinations. Outputs are two independently reachable hosts and proven resource isolation; no customer launch yet.

- [ ] Confirm two RufDiamond account administrators with MFA; record authorized monthly spend and quote including all ancillary resources. Confirm BHS compute IDs and Toronto bucket product, versioning/Object Lock support, retention costs and sufficient quota. Without these, finish local tasks and report provisioning blocked; do not guess credentials or spend.
- [ ] Run `--dry-run` for both environments and review the exact target plan; then run `--apply` separately for staging and production. Read back resource IDs/policies. Create empty, private, versioned live buckets and separate locked archive buckets before writing data.
- [ ] Install independent secrets and certificates, firewall/SSH restrictions and encrypted DB volumes; start empty databases, apply migrations through the migrator role, and run read-only health probes. DNS changes target only the confirmed names; unready production serves maintenance, not prototype data.
- [ ] Test staging key cannot list/read/write any production object, connect to its DB or use its session cookie; repeat production-to-staging denial. Test public scans expose only intended ports. Test protected archive version deletion fails under app/backup credentials. Treat policy failure as a launch blocker.
- [ ] Record exact resource inventory, costs, software/image versions and checked security controls; commit sanitized evidence as `docs: record OVH environment isolation evidence`.

### Task 7: Staging acceptance, recovery rehearsal and production launch

**Files:** Create `docs/verification/staging-acceptance.md`, `docs/verification/production-release.md`; retain CI/video/restore reports as protected artifacts, not secrets in Git.

**Interfaces:** Consumes integrated application completion, signed release manifest, complete approved real catalogue, real scoped accounts, functioning backups and operator launch authority. Produces verified production URL and exact deployed digest/schema/release IDs.

- [ ] Deploy a synthetic complete catalogue to staging and run sign-in/reset/MFA, tenant tampering, price visibility, search/figures/drawing authorization, all viewer interactions, RFQ submit/retry/history, import review, publish/rollback, outbox capture and RFC 9457 tests. Staging staff preview can show unapproved proposals with warnings; customer routes cannot.
- [ ] Create Deepshika's named staging tester account for `dghale@rufdiamond.com` through the reviewed invitation flow. Give it the Purchaser capability bundle and only the synthetic Fat Truck test company/fleet. Provide separate named technician and second-tenant test identities through the same secure process to verify hidden pricing, submission denial and catalogue isolation; never share one password across identities. Named publisher/admin test access is separate, staging-only and MFA-protected. No database/Supabase/production role is granted by a portal invitation.
- [ ] Complete `docs/deployment-and-testing-guide.md` with the actual staging URL, tested release SHA/digests, migration version, deployment owner, verified deploy/rollback commands, invitation expiry and pass/fail evidence. Demonstrate the steps to Deepshika with the functionality video. Send the user-authorized completion email only after the claimed scope is verified; include guide/video links and account activation instructions, not passwords or secret environment values. Explicitly state any production/source-approval gate still outstanding.
- [ ] Run browser checks at desktop/tablet/mobile sizes and record a new functionality video showing mouse-wheel zoom, toolbar zoom, pan, fullscreen, repeated-marker linking and RFQ confirmation. Check loading/error/focus/keyboard states, density/readability and print layouts.
- [ ] Run an authenticated staging security scan and a synthetic load check: 25 concurrent browsing sessions for 15 minutes, separate five concurrent RFQ submissions with unique idempotency keys; require zero duplicated orders/cross-scope responses, no unhandled errors and p95 catalogue JSON latency under 500 ms excluding image transfer. These are pilot acceptance thresholds, not a capacity guarantee; resize/retest if missed.
- [ ] Rehearse restore and application rollback on isolated resources; record measured RPO/RTO and image/schema compatibility. Restore complete active-release/customer/drawing flow, not only `SELECT 1`. A temporary restore VM is a drill resource, not a third permanent environment; any paid drill resource requires the recorded budget authorization.
- [ ] Import actual source into production draft through reviewed tools. Resolve all blockers and obtain named-publisher approval; never use local proposal coordinates as implicit approval. If source remains incomplete, report software ready but customer catalogue launch blocked, and keep maintenance enabled.
- [ ] Owner approves promotion of the exact staging-tested manifest; migrate, activate approved catalogue, verify privileged MFA/customer scopes, backup freshness and production notification destination, then enable public traffic. Send no real test RFQs without an explicitly designated internal account/recipient.
- [ ] Observe rollout for 30 minutes, verify external HTTPS/customer smoke and worker/backup health. Hand over URLs, operator access, exact commit/digests, monitoring, monthly/quarterly duties and restore evidence. Commit sanitized launch record as `docs: record verified production launch`.

## Self-review and handoff

This plan separates code push, staging deployment and production promotion;
none implies the others happened. It preserves the approved Canadian recovery
strategy and the two-instance requirement without claiming HA. Toronto backup
availability does not create Canadian compute failover. All destructive restore/
resource actions have explicit targets and safety gates; production data never
becomes ordinary staging data. Every environment needs independently tested
credentials and retention, not merely different `.env` filenames.

Execute through the previously authorized task-by-task subagent workflow with
spec/code review and verification after each task. Local packaging and backup
tests can proceed without an OVH account; paid provisioning and launch wait only
for their genuine external prerequisites. Inline checkpointed execution is the
fallback, not a reason to ask the user the same execution-choice question again.
