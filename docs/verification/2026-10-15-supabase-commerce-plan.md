# Plan: put quote/order persistence on Supabase staging

Date: 2026-10-15. Project: `ufvenudjvicjhwzdvxie` (Canada Central). Temporary
staging Postgres only — not production, not OVH.

**25 October readback:** the project has been restored and all 14 migrations
through `0014_commerce_price_snapshot` match the remote ledger. Migration
credentials are present locally; the runtime role remains NOLOGIN and live
API/mail deployment is incomplete. See the [current readiness record](2026-10-25-commerce-readiness.md).
The inventory and credential blocker below describe the original 15 October state.

## Current gap

| Layer | Status |
| --- | --- |
| Code on `feature/frontend-setup` | Quote/commerce API + UI wiring landed (`0013_quote_commerce`) |
| Supabase schema (last verified Sep 7) | Migrations **0001–0006** only |
| Repo migrations | Through **0013** (0007–0013 never applied remotely in that record) |
| `apps/api/.env.local` | **Missing locally** — migrate credentials not present on this machine |
| Runtime role | `rufdiamond_runtime` prepared NOLOGIN; not yet a live API identity |
| Fastify + outbox worker | Must run against Supabase with a least-privilege `DATABASE_URL` |
| Vercel frontend | Needs `RUF_REPOSITORY_MODE=api` + `RUF_API_UPSTREAM_URL` pointing at that API |

Supabase is **Postgres hosting**. Persistence is Fastify writing to that DB —
there is no Supabase Auth / Data API path for quotes.

## Put sequence (do in order)

### 1. Restore migration credentials (operator)

Create ignored `apps/api/.env.local` (mode `0600`) with:

```bash
MIGRATION_DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-ca-central-1.pooler.supabase.com:5432/postgres?sslmode=verify-full
# optional CA path if verify-full needs the dashboard CA file
```

Never commit this file. Prefer session pooler + TLS as in the Sep 7 foundation note.

### 2. Read current remote ledger

```bash
psql "$MIGRATION_DATABASE_URL" -c "select id, hash, created_at from drizzle.__drizzle_migrations order by created_at;"
```

Expect 0001–0006 (or more if someone applied later). Do **not** hand-run SQL
out of order.

### 3. Apply 0007→0013 with Drizzle migrator

From repo root, with the migration URL (owner / schema role, not runtime):

```bash
cd apps/api
DATABASE_URL="$MIGRATION_DATABASE_URL" npm run db:migrate
```

Idempotent replay should no-op already-applied files. Confirm:

```sql
select to_regclass('public.quote_line'),
       to_regclass('public.quote_notice'),
       to_regclass('public.commerce_order'),
       to_regclass('public.commerce_order_line');
select last_value from quote_reference_seq;
select last_value from commerce_order_reference_seq;
```

### 4. Re-check least-privilege grants

After migrate, `0013` grants DML on commerce tables (and company discount columns)
to `rufdiamond_runtime` / `ruf_app` when those roles exist.

Also verify `anon` / `authenticated` / `service_role` still have **no** grants on
new tables (backend-only DB).

### 5. Enable a runtime `DATABASE_URL` (separate secret)

- Unlock or replace `rufdiamond_runtime` with a LOGIN role + password **only**
  after grant review (foundation note still had it NOLOGIN).
- Point Fastify `DATABASE_URL` at that role via session pooler.
- Deploy API + `npm run outbox:worker` on the staging host with the same release
  as the frontend allowlist.

### 6. Point Vercel at the API

Frontend env (server-only, not `NEXT_PUBLIC_*`):

- `RUF_REPOSITORY_MODE=api`
- `RUF_DEPLOYMENT_ENV=staging`
- `RUF_API_UPSTREAM_URL=https://<api-host>`
- `RUF_WEB_ORIGIN=https://<vercel-or-staging-web-origin>`

API `WEB_ORIGIN` must equal `RUF_WEB_ORIGIN`.

### 7. Smoke (signed-in accounts)

1. Customer submits quote → row in `quote_line`, outbox `quote.submitted.email`.
2. Admin with `orders.quote` patches + Notify → `quote_notice` + customer email event.
3. Customer checkout → `commerce_order` / lines with `RD-#####`.
4. Confirm localStorage is not the source of truth in API mode.

## Out of this put

- Production / OVH cutover
- Xero, Order Status UI, IronHorse/Agilis catalogue loads
- Real SMTP (worker may log until a delivery port is configured)
- Seeding customer accounts (still requires identity provisioning)

## Blocker on this workstation

`apps/api/.env.local` with `MIGRATION_DATABASE_URL` is absent. Steps 2–3 cannot
run until the operator places that secret (or pastes a one-shot migrate URL into
the shell without writing it to chat/logs).
