# Account access and pilot roles

The portal uses its existing first-party Fastify authentication and PostgreSQL
capability/scope model. It does not use Supabase Auth or browser-only role flags.

| Role | What it permits |
| --- | --- |
| RUF admin (`catalog_admin`) | Internal catalogue, account and quote administration according to the existing capability bundle |
| Purchaser (`purchaser`) | Browse assigned catalogue, build/submit requests and orders, view their company's quotes/orders |
| Technician (`technician`) | Browse assigned catalogue and build requests; cannot submit quotes or orders |

Customer company, fleet, draft and price scopes are enforced by the existing
server policy. Factory Price remains behind `orders.quote`. Technician price
visibility remains the company's setting. Publishing still needs an explicit
named grant; this change does not give everyone publication access.

## Administrator workflow

Open **User accounts** after signing in as an internal RUF account with
`users.all.manage`. Creating accounts or changing their role/status additionally
requires `roles.manage`. These permissions are reloaded inside each transaction.
Users outside the administrator's account scope cannot be managed. An admin
cannot change their own role/status or assign a role with grants they lack.

1. Create an account using an existing active company and one of the pilot roles.
2. Copy the private setup link and share it directly with that person. The page
   does not send mail. Dismiss the link after sharing it; it is not saved in
   browser storage and is not returned by the account directory.
3. The recipient opens the link and chooses a password of at least 12 characters.
   The invitation works once and expires after 24 hours. Its token travels in a
   URL fragment, not a query string, and is removed from the address bar.
4. Use **New setup link** to replace an unused/expired invitation. Prior links
   stop working. An unused disabled account can be restored through a new link;
   enabling an account never skips its initial password setup.
5. Role changes, disablement and reactivation revoke all previous sessions.
   Role changes reset the account to the role's standard scopes and remove
   named extra grants, including draft or publication grants. Reapply any
   separately approved exceptions through the existing controlled process.

An account which has already completed setup uses the existing password-reset
process, rather than an invitation. Mail delivery for that process remains
unconfigured/disabled, as requested; this release does not add a mail service.
Company creation, fleet provisioning and public account-request approvals are
outside this pilot account screen. Request lists remain user-specific drafts;
this release does not introduce collaborative technician/purchaser draft sharing.

## Operator deployment and first administrator

1. Apply migration `0016_account_invitations` using the migration identity through
   `npm run db:migrate -w @rufdiamond/api`. It adds a dedicated invitation table
   and the three read capabilities needed by the two customer pilot roles. It
   does not add customer write/admin permissions or modify existing accounts.
2. Extend the existing nonprivileged API runtime grants with
   `grantAccountRuntime` in `apps/api/src/db/account-runtime-grants.ts`, executed
   by the database operator against the approved runtime role. The helper does
   not create roles, modify credentials or allow privileged role attributes.
3. Supply the existing API runtime secrets through its secret store. Connect the
   frontend using the documented API mode/upstream/exact-origin configuration.
   Keep private drawings behind their scoped API. Do not point a connected
   portal at public demo assets or use migration credentials as runtime secrets.
4. Provision the approved internal RUF company record and named first account.
   The bootstrap takes an existing active internal company's UUID, not a guessed
   email-domain match. The operator, not an automated agent, chooses the identity.
5. With `DATABASE_URL` and `WEB_ORIGIN` in the operator's environment, run:

   ```sh
   npm run accounts:bootstrap -w @rufdiamond/api -- \
     --company-id APPROVED_INTERNAL_COMPANY_UUID \
     --name 'APPROVED PERSON' --login APPROVED_LOGIN \
     --email APPROVED_EMAIL --output /private/operator/path/ruf-first-admin.json
   ```

   The output path must not exist. It is created with mode 0600 and contains the
   one-use setup link. Standard output contains no password or token. Keep this
   file outside the repository, share the link privately with the owner, then
   remove the file. An existing active or invited internal administrator blocks
   bootstrap. No agent should execute this against a real identity without that
   person's approved account details.

The API host/runtime credentials/private storage and named accounts remain
deployment prerequisites. A successful frontend build or visible sign-in page
does not mean live logins are connected. Fixture mode never exposes the account
management form or simulates successful account activation.

## Verification

`npm test -w @rufdiamond/api`, `npm run test:contracts`,
`npm run test:callout-preview`, `npm run build`, then
`npx playwright test --config playwright.accounts.config.ts`.
The browser test starts its own disposable PostgreSQL, non-owner runtime API and
Next server. It uses synthetic local accounts only, sends no mail, and stops all
of its services afterward. Do not load real `.env.local` files into these tests.
