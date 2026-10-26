# Live login readiness, 26 October 2026

The user authorized enabling live logins and named the first RUF administrator.
The verified account implementation is commit `8f288e9`.

## Completed database preparation

- Applied `0016_account_invitations` to staging project
  `ufvenudjvicjhwzdvxie` using the existing migration configuration and
  certificate-verified TLS.
- All 15 previous migration hashes/timestamps matched the repository before
  migration. The resulting 16-entry ledger matches; historical entries are
  unchanged.
- Verified that `anon`, `authenticated` and `service_role` cannot read or insert
  invitation records.
- Added the reviewed account-management table/column grants to the existing
  nonprivileged `rufdiamond_runtime` role, without changing role attributes or
  creating/changing a database password. It remains `NOLOGIN`.
- Created the approved internal RUF company and first administrator in invited
  state. No password has been set and no mail sent. The one-use setup link is
  stored outside Git in a private mode-0600 file; its token is absent from this
  report and sanitized evidence.

The remote checks and account metadata are retained in ignored
`output/verification/2026-10-26-live-accounts/database.json`. The setup link was
issued at 20:52 UTC and expires 24 hours later. Do not test or consume it on the
administrator's behalf. The owner must choose their password after the actual
API connection is available.

## Remaining live boundary

Live authentication is not enabled. The available saved Vercel identity can
access its own account/team but cannot retrieve the live RUF project. The live
project's dashboard also returns Not Found for that identity. A Git-triggered
frontend deployment does not provide permission to change that project's
environment or create its API runtime.

No OVH/API host or runtime credentials were found in the repository's deployment
configuration. The approved design still requires a portable Fastify API,
private catalogue storage/data and a separate worker, rather than a process on
this workstation. Customer mail remains disabled.

To complete: obtain deployment/settings access to the existing RUF Vercel team,
connect the approved API host and independent runtime secrets, provision private
catalogue access, then enable the frontend's API connection and perform hosted
session/role checks. Do not enable API mode against an invented upstream or use
the migration identity as the web runtime.
