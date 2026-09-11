# Customer API boundary (Task9b)

Task9b's reviewed native customer gate passes with a private Chrome profile and actual hidden/visible tab preconditions. Historical packaged hard-navigation timeouts remain unexplained; the evidence did not establish a renderer freeze. Retain the failing traces and capture bounded probes in the failing process if it recurs. The API owns authentication, entitlement filtering, publication, immutable drawing delivery and price omission. Local verification is separate from remote rollout and source approval; no remote API environment file is needed for isolated verification.

## Runtime and interfaces

- Use the server-only settings in `frontend-api.env.example`. Never use `NEXT_PUBLIC_` for upstream configuration. Fixture mode remains a local demonstration; API failures never select it.
- `src/data/repository.ts` is server-only. Client grids receive authorized server props. Machine selection passes `variantId` in navigation links; the server checks it against the current scoped model/variant responses, not a stored machine object.
- `composeCustomerRead` verifies identity before/after an aggregate. `composeApiRead` collects contributing releases and restarts the complete callback once on same-model release drift. `readFigureWorkspace` keeps detail, siblings and usage inside that boundary. Different models may contribute different release sets.
- Auth uses the same-origin `/api/v1/auth/sign-in`, `/api/v1/auth/sign-out` and `/api/v1/me` proxy. Sign-out obtains current CSRF authority. Login/logout/scope changes clear portal storage and perform a full document navigation. The client gate rechecks on navigation, focus, visibility changes, restored pages, cross-tab signals and a 30-second interval; server/API authorization remains authoritative. Same-authority checks preserve mounted work while making it hidden and inert. Confirmed authority changes discard the prior subtree. The reviewed Task9b native visibility gate passed; that does not explain the older navigation timeouts.
- API requests persist only scope-keyed part/release-part IDs and quantities. They revalidate against authorized current usage responses before hydrating or adding. Old full-line requests, machine state, recently viewed records and fake confirmations are not used. API RFQ submission is visibly unavailable and cannot fabricate a confirmation. A real RFQ service is separate work.
- Shared decimal price strings and arbitrary reference strings stay intact. Missing/denied money is blank, not zero. Authorized source `0.00` gets the manufacturer-information/quote notice. Literal remarks are not interpreted.
- Figure props retain release identity, `releasePartId`, and every mapping checksum domain. API drawings use the exact release-pinned endpoint and fetched blob for ordinary/fullscreen/crop views; 409 triggers at most one full-page data refresh. Task9c adds same-origin byte delivery: the proxy requests `Accept: image/png`, and Fastify verifies bounded original bytes plus fresh scope before and after storage I/O. Legacy callers can still receive the five-minute TLS storage redirect. Native PUT uses exact-origin storage CORS; no browser credentials are sent to storage.
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

The Task9c admin workflow uses `/admin`, `/admin/figures/UUID/mapping` and `/admin/publish`, scoped backend metadata and the same session boundary. A truly drawingless figure offers upload only using its real figure version. Mapping/replacement uses the existing editor. The publisher UI requires named `publish.execute`, explicit confirmation, both source/coordination versions and an idempotency key retained through uncertain retries. The existing read-only queue API remains available to authorized draft viewers; that does not grant publication. See [admin-native-integration.md](admin-native-integration.md) for actual-backend reproduction and its separate remote gates. No account CRUD, import workflow or RFQ backend was added here.
