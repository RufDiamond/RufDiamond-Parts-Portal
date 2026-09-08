# Temporary Supabase staging database

Date: 2026-09-07. Status: database foundation verified; application integration
and production deployment are not complete.

This records the user's approved temporary PostgreSQL hosting choice. It does
not replace the [backend specification](../backend-specification.md) or the
[isolated OVH environment design](../superpowers/specs/2026-09-07-integration-and-ovh-design.md).

## Environment and security

| Setting | Verified value |
| --- | --- |
| Provider | Supabase, user-created project |
| Project reference | `ufvenudjvicjhwzdvxie` |
| Organization | `rufdiamond` |
| Region | Canada Central (`ca-central-1`) |
| Database | PostgreSQL 17.6 |
| Purpose | Temporary staging PostgreSQL, not production |
| Connection | Session pooler, port 5432, TLS `verify-full` |
| Incoming SSL enforcement | Enabled |
| Data API | Disabled |
| Automatic new-table exposure | Disabled |

The application continues to use Fastify and Drizzle with first-party
authentication. No Supabase Auth migration or direct browser database access
was introduced. Customer reads must still resolve authorized immutable active
releases through the backend.

Migration credentials are stored only in the ignored local
`apps/api/.env.local`, with owner-only read/write permissions (0600). The
dashboard-linked Supabase CA is trusted for this connection, not installed as
system-wide trust. No password, credential-bearing URL, session key or service
key belongs in Git, this record, screenshots or email.

`MIGRATION_DATABASE_URL` is an administrative connection. A backend runtime
`DATABASE_URL` has deliberately not been configured with those owner
credentials; a separate least-privilege runtime role is required.

The dedicated `rufdiamond_runtime` role has now been created with **NOLOGIN**
and no password. It is not a superuser, cannot create roles/databases/schema
objects, bypass RLS, truncate tables or read the migration ledger. Permissions
are explicit: required application DML, read-only capabilities, append-only
audit/drawing/release-child/order-line access, and RFQ sequence usage. Future
migrations require a separate grant review rather than unrestricted default
privileges. No runtime connection or customer account has been enabled.

A disposable local PostgreSQL test found that a non-owner role with temporary
table access could shadow an unqualified parent lookup in a snapshot trigger.
Additive migration0007 and regression tests are assigned to integration Task5.
Keep the runtime role NOLOGIN until that hardening is independently reviewed,
applied and verified. No live snapshot data was changed by the diagnostic.

## Migration evidence

Only reviewed committed migrations were exported into an isolated directory
and applied under the `rufdiamond-schema-migrations` PostgreSQL advisory lock.
An immediate replay verified that already-applied migrations were not repeated.

| Reviewed source | Migration set | Result |
| --- | --- | --- |
| `85dac4ad17eddce0e1f9e46c7670474face8039a` | 0001–0005 | Applied and replayed successfully |
| `b2575a16400e90537fb9b3e598fcdd1c25d59c94` | 0006 integration fields | Applied and replayed successfully |

Before applying 0006 remotely, independent schema review found no issues. The
implementer ran all 41 API tests and both API/contracts typechecks, and Drizzle
reported no schema changes. A fresh controller run of `integration-schema.test.ts`
and `schema.test.ts` passed all 28 tests immediately before remote application.
Those tests cover empty creation, pre-0006 upgrade, replay, historical record
preservation, immutable snapshots, canonical login IDs and duplicate-reference
rollback. Original migrations 0001–0005 were unchanged.

Verified final database readback:

| Item | Count |
| --- | ---: |
| Applied migrations | 6 |
| Public application tables | 45 |
| Registered capabilities | 45 |
| Pilot roles | 3 |
| Users | 0 |
| Models | 0 |
| Public/application-ledger table grants to browser/service API roles | 0 |
| Public sequence usage grants to browser/service API roles | 0 |

The dashboard independently displayed all 45 tables. No catalogue import,
mapping approval, customer account, RFQ or live notification was created.

Residual application table/sequence privileges were revoked from `anon`,
`authenticated` and `service_role`, including access to the Drizzle migration
ledger. PostgreSQL-owner default privileges for future public tables and
sequences were also restricted. This is a backend-only application database;
future migrations must verify that those restrictions remain in place.

## Remaining gates

- Complete API identity, capability/scope enforcement, immutable catalogue
  reads, controlled imports/publication, RFQ workflows and frontend integration.
- Complete/review/apply snapshot-trigger hardening, verify explicit runtime
  grants, then enable the prepared runtime role with separate runtime secrets.
- Configure source network allowlists when the backend host is selected. TLS
  does not make the database network-private; network restriction is not yet
  claimed.
- Configure and verify the [approved backup and recovery strategy](../backup-and-recovery-plan.md),
  including measured isolated restores. Provider defaults are not evidence of
  the required retention or RPO, and no backup add-on was purchased here.
- Preserve separate OVH staging/production instances, databases, credentials,
  drawing stores and promotion gates for eventual deployment. This temporary
  staging project must not become a shared staging/production database.
- Keep real customer data and unapproved callout proposals out of this staging
  project until the relevant import, review and publication controls are ready.

Xero remains deferred. This database milestone is not an end-to-end readiness
or production launch claim.
