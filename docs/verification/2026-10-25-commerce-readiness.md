# Commerce staging readiness, 25 October 2026

## Verified database state

Project `ufvenudjvicjhwzdvxie` was paused when checked and has been restored.
At `2026-10-25T17:51:01Z`, the session pooler connection used verified TLS 1.3.
The Drizzle ledger contains all 14 committed migrations through
`0014_commerce_price_snapshot`; every hash and timestamp matches the repository.
Replaying the migrator made no changes. This readback found no pending migrations.

`quote_line`, `quote_notice`, `commerce_order`, and `commerce_order_line` exist.
All six order price snapshot columns from migration 0014 exist.
`rufdiamond_runtime` remains `NOLOGIN`, without superuser, create-role,
create-database, or bypass-RLS privileges. Counts are zero for users, companies,
models, quote lines, and commerce orders. Schema readiness does not establish a
working customer commerce flow.

Sanitized machine-readable readback is saved locally, outside Git, at
`output/verification/2026-10-25-commerce-migrations.json`.

## Configuration discovery

The repository and local environment files do not provide a deployable runtime
configuration:

| Setting | Evidence |
| --- | --- |
| Migration connection | Present in ignored, mode-0600 `apps/api/.env.local`; value was not printed |
| Root database connection | `.env.local` points to localhost port 5433, not the staging runtime |
| Runtime database connection | Not present in the API local environment; prepared role cannot log in |
| Staging API hostname/server | No actual host found; frontend example uses `api-staging.example.invalid` and the commerce plan uses `<api-host>` |
| Mail provider, SMTP credentials, From address | Not configured in repository environment files |
| Quote factory and RUF delivery inboxes | Not configured; code requires `QUOTE_FACTORY_EMAIL` and `QUOTE_RUF_EMAIL` |
| Customer notification policy | Still unresolved; notification events do not populate the `authorizedRecipients` expected by the delivery handler |
| Object storage and session/encryption secrets | Backend example contains placeholders; an actual private versioned bucket and deployment secrets are needed |

`clients.md` section 4.3 explicitly leaves server email delivery unresolved.
Public contact links and the named tester address do not establish approved
transactional email destinations or a verified sender.

A read-only Vercel project inventory using the existing saved login returned
HTTP 403. Deployment environment values could not be verified through that
credential. No Vercel configuration was changed.

## Implementation and acceptance gaps

The current outbox entrypoint uses a logging email port. Enabling
`QUOTE_EMAIL_SENDING` alone would not make that port deliver email. A real
delivery adapter and an authoritative customer-recipient resolver are required
before enabling outbound delivery. Logging must not be treated as delivery
acceptance evidence.

Cursor's local authorization patch removes anonymous fixture access to
`/quotes/admin`, requires a verified session with `orders.quote`, and sends an
empty seed to the staff component. Its three new page authorization tests pass;
the two customer privacy tests pass. This change has not been deployed.

Four existing `tests/admin-quote-status.test.tsx` tests fail when run independently:

- Factory Price column position relative to Qty.
- Incomplete-line notification selection.
- Fill, notify, and customer visibility.
- Adding a factory-only line.

The latter three use selectors that the current component does not expose.
The independent run passed five component tests and failed four. Its local JSON
report is `output/verification/2026-10-25-admin-component-tests.json`.

## Remaining inputs for a live staging deployment

Obtain the actual RufDiamond-owned API/worker host, separate runtime credentials,
private versioned object storage configuration, session and protected-delivery
secrets, and approved mail provider/sender/recipient policy. Provision named
staging identities and synthetic catalogue data through the existing backend
workflow. Deploy the same API/worker release, then configure Vercel API mode and
run signed-in quote, staff notification, order, and cross-company privacy checks.

Do not use the migration owner as the runtime identity, switch the public
frontend to an unavailable API, or enable customer mail using guessed addresses.
