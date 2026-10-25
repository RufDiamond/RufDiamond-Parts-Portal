# Discount precision release, 25 October 2026

## Scope

The user requested that the prepared mail code and migration 0015 be saved on
GitHub, with email left out of the deployment for now. The reviewed mail changes
are retained on `codex/commerce-mail-staging` at `66104a7`. That branch passed
314 API tests, 419 frontend tests, both TypeScript checks, changed-file ESLint,
and a production build after integration with the latest drawing fixes.

The separate `codex/commerce-discount-deploy` release includes only migration
0015, its journal entry, the six-decimal regression test, and corrections to
four outdated migration-count assertions. Its frontend, package manifests,
lockfile, API runtime code, worker, and email example settings match the existing
production branch. No mail implementation, credentials, sender addresses, or
recipient configuration are added to the deployment.

## Supabase verification

At 19:26 UTC on 25 October 2026, migration
`0015_commerce_discount_precision` was applied to the existing RUF staging
project `ufvenudjvicjhwzdvxie`, using the ignored owner-only migration
configuration and certificate-verified TLS. All 14 existing migration hashes
matched the repository before applying the change. The deployment operation
held an advisory migration lock, with bounded SQL lock and statement timeouts.

The ledger now contains 15 matching migrations. The original 14 ledger entries
are unchanged. `commerce_order.discount_rate` is now `numeric(7,6)`, previously
`numeric(8,4)`. Running the standard migrator again did not add another ledger
entry. Quote-line and commerce-order counts were both zero before and after.
No business rows were created for the remote verification.

The applied SQL SHA-256 is
`ebc18cc2f34cf4a66ae367094b862bf541806d12a1e72ce67a6f39673665b8d6`.
Sanitized machine-readable evidence is retained in ignored local
`output/verification/2026-10-25-commerce-discount-deploy/database-migration.json`.

## Remaining runtime boundary

Applying the migration and deploying the frontend does not connect customer
quotes or orders to a running API. The configured runtime database URL is still
absent, and the database's `rufdiamond_runtime` role remains `NOLOGIN`. An
approved API/worker host, runtime identity, private versioned storage, session
configuration, named staging accounts, and catalogue data are still needed.
The public portal must remain in its existing demo/browser mode until that
runtime is available and tested. No mail setup or real portal email delivery
is part of this release.

## Release checks

The migration-only tree passed 294 API tests in 24 files, including the
six-decimal database regression, historical upgrades, empty-database migration,
replay, and real disposable database/storage/scanner workflows. Its API
TypeScript check, ESLint on changed test files, production Next.js build, and
whitespace checks also passed. The frontend is identical to the integrated
tree whose 419 frontend tests passed above.

The production-branch push triggers Vercel's existing Git integration. Hosted
deployment success and public smoke tests must be checked against that resulting
commit; local checks alone do not establish a successful hosted deployment.
