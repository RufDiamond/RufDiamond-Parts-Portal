# Customer API boundary (Task9b)

This is a Task9b checkpoint, **not accepted for rollout**: packaged Chrome navigation intermittently freezes during same-page auth/navigation verification. See the Task9b report for retained failing traces. It is not a production rollout or the Task9c admin/upload acceptance. The API owns authentication, entitlement filtering, publication, immutable drawing delivery and price omission. No remote API environment file is needed for isolated verification.

## Runtime and interfaces

- Use the server-only settings in `frontend-api.env.example`. Never use `NEXT_PUBLIC_` for upstream configuration. Fixture mode remains a local demonstration; API failures never select it.
- `src/data/repository.ts` is server-only. Client grids receive authorized server props. Machine selection passes `variantId` in navigation links; the server checks it against the current scoped model/variant responses, not a stored machine object.
- `composeCustomerRead` verifies identity before/after an aggregate. `composeApiRead` collects contributing releases and restarts the complete callback once on same-model release drift. `readFigureWorkspace` keeps detail, siblings and usage inside that boundary. Different models may contribute different release sets.
- Auth uses the same-origin `/api/v1/auth/sign-in`, `/api/v1/auth/sign-out` and `/api/v1/me` proxy. Sign-out obtains current CSRF authority. Login/logout/scope changes clear portal storage and perform a full document navigation. The client gate rechecks on navigation, focus, visibility changes, restored pages, cross-tab signals and a 30-second interval; server/API authorization remains authoritative. The visibility-change addition has not completed its packaged browser gate because the earlier hard-navigation freeze recurred.
- API requests persist only scope-keyed part/release-part IDs and quantities. They revalidate against authorized current usage responses before hydrating or adding. Old full-line requests, machine state, recently viewed records and fake confirmations are not used. API RFQ submission is visibly unavailable and cannot fabricate a confirmation. A real RFQ service is separate work.
- Shared decimal price strings and arbitrary reference strings stay intact. Missing/denied money is blank, not zero. Authorized source `0.00` gets the manufacturer-information/quote notice. Literal remarks are not interpreted.
- Figure props retain release identity, `releasePartId`, and every mapping checksum domain. API drawings use the exact release-pinned endpoint and fetched blob for ordinary/fullscreen/crop views; 409 triggers at most one full-page data refresh. Storage must support the browser CORS policy for the signed delivery redirect; real storage byte delivery is Task9c acceptance, not proved by the synthetic fixture.
- Old fixture slugs have no guessed UUID alias. API review routes stop before filesystem loading. Customer pages do not merge local review proposals or expose the unapproved-review link.

## Build and private packaging

`npm run dev` and `npm run build` first transpile shared contract TypeScript to `tmp/frontend-contracts`. Next aliases reference those generated JavaScript modules, preserving the package's NodeNext `.js` imports without modifying shared source or migrating frameworks.

Build with API settings and, if desired, `RUF_NEXT_DIST_DIR=tmp/next-customer-build`. Then create a **new absolute artifact directory**:

```sh
RUF_REPOSITORY_MODE=api RUF_NEXT_DIST_DIR=tmp/next-customer-build node tools/package-api-frontend.mjs /absolute/new/customer-frontend-artifact
```

The packager copies standalone output and static chunks into the actual custom dist path, excludes environment files and review/catalogue tracing, and copies only public presentation folders (brand, home, nav, models, systems, toolbar). Original drawings, masks and review assets remain untouched in the checkout. Do not copy the whole `public` folder into an API artifact. The runtime proxy also rejects direct catalogue/review assets and disallowed optimizer paths, including double-encoded path characters.

Start the packaged `server.js` with the API settings, `HOSTNAME` and `PORT`; its embedded dist configuration must match the build. Verify CSS/chunk responses and protected/direct-private routes on the actual package, not just `next dev`.

## Isolated verification

`npx playwright test --config playwright.customer.config.ts` launches an isolated HTTP contract fixture on3299 and API-mode Next on3199, leaving the fixture preview on3100 alone. This is synthetic auth/catalogue data, not Fastify/Postgres/Supabase verification. The test checks same-browser account switching, navigation/back history, scope revocation, price omission, private routes and old slugs. Use `CUSTOMER_PACKAGED=1 CUSTOMER_BASE_URL=http://127.0.0.1:3198` against an already running packaged server and the isolated fixture. `CUSTOMER_OUTPUT_DIR` separates evidence.

The customer gate requires a desktop session and installed Google Chrome. It opens a dedicated visible browser with a temporary profile and connects with Playwright's supported `noDefaults` option; it never attaches to a user's existing browser. Default Playwright focus emulation keeps background pages visible and focused, so `bringToFront()` alone cannot prove tab-return revalidation. The test explicitly verifies hidden/visible states and waits for the resulting document reload before checking current prices. Set `CUSTOMER_CHROME_EXECUTABLE` if Chrome is outside its normal installation path (the Linux default is `google-chrome`). Successful and failed traces are retained; the owned browser process and temporary profile are cleaned up afterward.

Task9c must replace synthetic proof with the actual isolated Fastify/database/auth/release/drawing flow, add protected admin discovery/editor/first-upload navigation, and preserve these customer privacy and state boundaries. No account CRUD, import workflow or RFQ backend was added here.
