# Role-based accounts verification

State: implemented and verified locally. Prepared for deployment; not live
authentication on the public demo. No real account was created, no credentials
were changed remotely and no mail was sent. Migration 0016 is prepared and
tested locally, not applied remotely by this work.

The existing pilot bundles now have account-management and initial password
setup flows: internal RUF admin, Purchaser and Technician. Internal staff need
`users.all.manage` to read accounts and `roles.manage` as well to change them.
Company scope, effective delegated capabilities, account/brand/fleet scope and
draft/price visibility are checked server-side inside each transaction. Scope
escalation through creating an unrestricted same-company administrator was
reproduced as a failing regression, then blocked. Effective access is also
bounded for role/status changes and reissued credentials, including named grants.

Setup uses a separate hashed, single-use, 24-hour invitation and user-chosen
password. Private links are shown once for manual sharing, never sent by mail.
Browser roles cannot read or write invitation records, even with inherited
default table grants. The operator bootstrap refuses existing administrators,
reserves a new mode-0600 file and rolls back account creation if private delivery
fails. Normal authentication remains active-only; the non-active-account
authorization projection is exclusively for authorized management inspection.

Verification:

- 311 API tests passed in 27 files, including actual disposable PostgreSQL,
  non-owner runtime, private versioned storage and scanner workflows.
- 428 frontend tests passed in 41 files; 83 contract tests passed in six files.
- API/contracts/frontend typechecks, changed-file lint with zero warnings,
  production Next build and whitespace checks passed.
- Two native Chrome scenarios passed against a real disposable non-owner API
  and a production Next server. They cover admin sign-in, account creation,
  password setup, same-tab replay denial, technician restrictions, own-company
  scope, denied account/Factory Price API access, role change, immediate session
  revocation, disable/re-enable, zero identity mail events and mobile overflow.
- Independent whole-diff review identified the scope escalation above; the
  corrected guard was re-reviewed with no remaining actionable finding.

Chrome exposed a company-selector label association issue, stale activation
state when opening another fragment link in the same tab, and a missing PATCH
export on the Next API route. These are corrected. The existing API-mode
checkout placeholder remains; this account feature does not enable commerce
runtime deployment. Unit checks also cover technician restrictions in the
checkout component for when its connected page is enabled.

Two existing API tests needed precise fixture/contract updates: the resolver
test now explicitly removes the migration-seeded read grant before checking
that app construction does not restore it; the outbox concurrency test accepts
legitimate SKIP LOCKED interleavings while checking bounded, disjoint batches
with all 25 events. No outbox production behavior changed.

Evidence is retained in ignored `output/accounts-browser/results.json`, desktop
and mobile screenshots in the same directory, and
`output/verification/2026-10-26-role-based-accounts/`. The deployment/operator
runbook is [Account access](../account-access.md).

Deployment prerequisites: approved API/worker host, independent runtime
credentials and account-management SQL grants, private storage/catalogue,
migration 0016, and the approved named first RUF administrator. Keep the public
frontend in its existing demo mode until these are provisioned and connected.
