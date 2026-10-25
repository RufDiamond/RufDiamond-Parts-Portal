# Commerce follow-through, 25 October 2026

This supersedes the implementation/test status in the earlier
[readiness report](2026-10-25-commerce-readiness.md). Credentials and unconfigured
deployment inputs remain outside Git.

## Public admin access verified

The current public `/quotes/admin` page shows the access-required message and a
sign-in link. The response contains no admin table, `Factory Price (CAD)` column,
or the fixture factory price `6900.00`. This was checked over HTTP and in Chrome.
The existing live deployment already contains the authorization fix, so a second
redeploy was unnecessary to close that exposure.

GitHub's `feature/frontend-setup` was at `31dcc2a`, including the administrator
table and test typing follow-ups. Eighteen focused authorization, admin table,
and customer privacy tests passed. The full frontend suite passed 410 tests in
39 files. The four previously recorded admin component test failures are fixed
in the newer commits.

## Mail implementation

The outbox worker now uses a configurable SMTP delivery port. Sending remains
disabled unless `QUOTE_EMAIL_SENDING=enabled` and all SMTP configuration is
present. Port 465 uses immediate TLS; other ports require STARTTLS. Certificate
verification remains enabled, and provider errors are replaced with safe codes.
All intended recipients must be accepted before the event is acknowledged.

`SMTP_FROM` and optional `SMTP_REPLY_TO` accept one bare mailbox each, with no
display-name/header syntax. Quote submission still requires approved factory
and RUF inboxes; order submission requires the approved RUF inbox. No default
business addresses are invented. See `docs/backend-api.env.example`.

The user selected `dghale@rufdiamond.com` as the temporary sender and staging
delivery inbox until RUF provides final settings. Those values are saved in the
main checkout's ignored mode-0600 API environment file, with sending disabled.
Both temporary factory/RUF routing settings point to Deepshika; the SMTP adapter
deduplicates identical recipients. They do not designate her as the real factory
mailbox or authorize messages to customers.

Current MX records and Microsoft's public OpenID configuration identify
Microsoft 365 for RUF. `SMTP_AUTH_MODE=microsoft-oauth2` supports a dedicated
application, cached short-lived SMTP resource tokens, and automatic renewal.
It binds token use to `smtp.office365.com:587` with matching SMTP user/sender.
No application, credential, mailbox grant, or live send was created. RUF's tenant
administrator must authorize the application and its access to the sender mailbox.
The implementation follows [Microsoft's SMTP OAuth application guidance](https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth).

For customer notifications, the optional policy
`QUOTE_NOTIFY_RECIPIENT_POLICY=original-requester` must be explicitly approved
and configured. The worker loads the persisted notice by its aggregate ID,
verifies its released lines, and resolves original requesters from that quote.
Recipients must still be active in the same active company and hold
`orders.own.view`. Another company member or the staff author of a factory-added
line is not automatically a recipient. Addresses and quote identity supplied
in an event payload cannot override the persisted notice.

Without that policy, customer mail fails visibly rather than guessing recipients.
Without a transport, delivery fails rather than being acknowledged by a log.
Password-reset delivery also fails explicitly until its delivery/landing-page
contract is implemented; it no longer prints a recipient and claims success.

SMTP delivery is at least once. A deterministic Message-ID is retained across
retries, but SMTP cannot guarantee deduplication or inbox delivery. A partial
provider acceptance remains a failure and retries can resend to an already
accepted mailbox. Review pending/dead-letter events before enabling an existing
queue, and test with approved non-customer capture inboxes first. These messages
do not add PDF attachments or a password-reset UI.

Tests cover default failure, MIME sender/recipient composition, stable IDs,
partial acceptance, malformed addresses, safe errors, and refusal of a real
loopback SMTP server without STARTTLS. Disposable PostgreSQL tests cover notice
identity, factory-added lines, payload overrides, inactive users/companies, and
revoked customer access. Independent code review found an address-parser
mismatch; a failing regression was added and the validator corrected before
completion. No external email was sent.

## Runtime and source inputs still needed

A fresh database check found 14 migrations, a NOLOGIN runtime role, and zero
users, companies, or models. A working runtime still needs the authorized
API/worker host, separate runtime credentials, private versioned storage,
session/encryption secrets, named staging identities, and catalogue data.
The Vercel account currently accessible in Chrome has no RUF project; this does
not prevent reading the public site, but does not provide deployment control.

The latest relevant RUF email found was the 23 October testing handoff, not new
Order Status designs or font delivery. The repository explicitly retains an
awaiting-design `/orders` page. Biome remains a CSS preference without a supplied
licensed webfont. Neither design nor licence can be inferred from the request to
finish engineering work.

The authenticated figure editor already has mapping save/history, source
version checks, review and approval paths. The existing quantity audit covers
45 figures and 635 rows; it records 957 mapped pointers, 723 expected instances
without positioned pointers, and 200 rows flagged Review. These are unapproved
source-review results, not a published complete catalogue. Corrected artwork,
clearer views, or RUF source decisions are still required for missing/conflicting
instances. Vector artwork can improve this evidence but is not a substitute for
review. See `docs/quantity-instance-highlighting.md`.

The production dependency audit also reports existing findings in Next, jsPDF,
DOMPurify, Sharp, fast-uri, Fastify, and source-map-js. Nodemailer is not listed.
Dependency upgrades need their own compatibility verification before a customer
launch; this mail change does not claim to resolve them.

## Verification and retained changes

The full API suite passed 314 tests in 29 files after correcting four stale
migration-count assertions and a real order discount schema mismatch. A new
regression first demonstrated `0.123456` being rounded to `0.1235` in the database.
Migration `0015_commerce_discount_precision` preserves existing constrained rates
and stores all six decimal places required by the shared schema. Empty-database,
historical-upgrade, replay, and column-contract checks pass. This new migration
is saved and tested locally; the remote staging database is still through 0014.
No existing applied migration was edited.

Both API and frontend TypeScript checks pass. Independent review covered SMTP,
Microsoft token renewal, recipient authorization, and migration 0015. The user
requested that prepared work be kept, with Order Status waiting for RUF's design.
After a clean dependency install in the isolated checkout, the default
Turbopack production build passed, as did lint on the changed mail code/tests.
Earlier build attempts using dependencies symlinked from the main checkout were
not valid build evidence; the final successful build used its own dependencies.
