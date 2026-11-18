# FT3 checkout integration

The hosted FT3 catalogue previously came from the bundled supplier file, while checkout required a database publication identity. A positive displayed price therefore could not be ordered. There were no published releases or part rows to resolve that identity.

Migration 0017 adds a separate server ordering catalogue and links order lines to its UUID and source revision. It preserves existing identity, quote, order and publication data. Importing supplier prices does not approve drawing mappings or manufacture publication releases. The existing three company scopes and application capabilities continue to restrict access.

## Operator setup

1. Run the normal API migration runner with `DATABASE_URL` supplied from the owner's migration secret store.
2. With `MIGRATION_DATABASE_URL` supplied privately, run from the repository root:

   ```sh
   node node_modules/vite-node/vite-node.mjs --config vitest.callouts.config.mts tools/import-ft3-ordering-catalogue.ts
   ```

3. Grant only `SELECT` on `ordering_catalogue_part` to the existing non-owner API runtime role. Browser `anon`, `authenticated` and `PUBLIC` retain no table privileges.
4. Deploy the API before the web application. Both use authenticated API mode. Keep `QUOTE_EMAIL_SENDING` unset/disabled.

The import is transactional, takes an advisory lock and upserts by the original part ID. It does not delete source records or enable previously disabled entries. The revision is the SHA-256 of `src/data/ft3-wagon.ts`. Re-running an unchanged source leaves versions unchanged.

On 2026-11-18 the existing Supabase database was upgraded from 16 to 17 migrations. The import produced 536 records: 273 positive-priced and 263 without an available positive price. All 48 existing users were retained. The runtime can read the new table; browser roles cannot.

## Behavior

- Positive-priced items carry database identities to checkout. Requests submit identity, revision and quantity; the API calculates prices and discounts from current database records.
- Zero/missing prices require a quote. Mixed carts retain those items while submitting only orderable lines.
- Orders keep immutable source, list-price and discount snapshots. Stale revisions, unavailable prices, currency mismatch, client-supplied prices, missing CSRF and unauthorized roles are rejected.
- `/orders` provides a basic saved-order view for the current company, subject to `orders.own.view`, with prices omitted when the account cannot view them. The final RUF Order Status design remains separate work.
- Drawing review notices remain visible. Users must check VIN and drawing references before fulfillment; unresolved mappings are not silently approved.

## Verification

The disposable-database regression suite covers server pricing, immutable receipts, duplicate submission, company isolation, role restrictions and invalid requests. Frontend coverage includes ordering identity, unavailable-price handling and private drawing routes. Hosted tests are opt-in and create a clearly marked `E2E-FT3-*` order with instructions not to fulfill it; no email is requested.

```sh
npm test -w @rufdiamond/api -- --maxWorkers=2 --testTimeout=20000
RUF_REPOSITORY_MODE=fixture RUF_DEPLOYMENT_ENV=local npm run test:callout-preview -- --maxWorkers=2 --testTimeout=20000
npm run typecheck
npm run typecheck -w @rufdiamond/api
# Supply the existing purchaser password in the process environment, never in this file.
RUF_E2E_BASE_URL=https://rufdiamond-parts.onrender.com RUF_E2E_CHECKOUT=1 \
  npx playwright test --config playwright.hosted-checkout.config.ts ft3-live-checkout
```

## Recorded result

- API and portal release `c645f9421f5783c5a3b83bfb3f86e050080f111a` were both observed Live in Render.
- All 452 frontend tests passed. The full 325-test API suite passed before the decimal helper extraction; the 15 affected API tests passed afterward, including the new multi-line rounding regression. API/web typechecks, changed-file lint and the API-mode production build passed. Independent review found the rounding mismatch, which was fixed and reviewed again without further material findings.
- All three existing role accounts completed browser sign-in, loaded the 536-item authenticated catalogue and signed out with subsequent `/me` returning 401. Staff directory access was 200 for Catalog Admin and 403 for purchaser/technician. Technician had no `orders.submit` capability.
- The opt-in purchaser browser checkout passed. Order `RD-00005` (`cfb4e0ea-452d-470e-bf7b-f4fe5c9feb5b`) contains one `82-00127` at CAD 645.86. It remained visible after signing out and signing in again. A direct owner read confirmed the immutable price, discount and source-revision snapshots.
- `RD-00004` and `RD-00005` are clearly marked E2E test orders with `TEST-DO-NOT-FULFIL` VIN and explicit instructions not to fulfill. The first run completed ordering but its test checked logout before the async redirect finished; the corrected complete run passed. Both records were retained. Their email events have zero attempts and no completion, and mail sending remains disabled.
- The responsive staff-header/mixed-cart browser test passed at desktop, tablet and phone widths. Only the zero-price nut is flagged for quotation, and priced lines reach real checkout after cart revalidation. Browser tests wait for revalidation and the logout redirect.
- A catalogue request briefly returned 502 around rollout; subsequent direct API, proxy and all-role catalogue checks returned 200. No test order was submitted during that initial request failure.

Browser evidence is in `output/hosted-checkout/` for purchaser checkout and `/tmp/ruf-ft3-cart-check/` for the mixed cart/header run. Traces, automatic screenshots and videos remain disabled around authentication; explicit screenshots show post-login pages only. Passwords are not stored in these artifacts.
