# Role-based accounts

The user requested implementation of the proposed RUF admin, Purchaser and
Technician roles. Build on the existing first-party identity, capability and
company/fleet scope system. Supabase remains PostgreSQL, not a second identity
provider. This preserves the approved portable Fastify/OVH architecture.

Implementation defaults: RUF administrators create accounts against existing
companies, assign one of the three existing pilot roles, and disable/reactivate
accounts. No public registration. Only internal staff with `users.all.manage`
can view accounts; mutations also require `roles.manage`. Account scopes still
apply. Nobody can modify their own role/status or delegate grants they lack.
Internal administrator roles cannot be assigned to customer companies.

New accounts start invited. A random, hashed, single-use invitation expires
after 24 hours. An authenticated admin can copy its setup link once and share
it through their chosen channel. The recipient chooses their own password.
The token is carried in the URL fragment, removed from the address bar, never
stored in browser storage, logs or audit patches. Invitation completion uses
exact-origin checks and revokes all previous sessions. Reissuing an invitation
invalidates its predecessor. Email delivery remains disabled.

Use a separate invitation table, not password-reset tokens. This prevents
account activation from weakening the existing active-user password-reset
contract. Administrator mutations serialize and reload current authority;
role/status changes revoke sessions and outstanding invitations atomically.
Every mutation is audited without secrets. Public DTOs never expose hashes.

The account screen is server-gated and hidden from unauthorized navigation.
Technicians retain request building but do not receive submission controls;
the existing server `orders.submit` check remains authoritative. Factory Price
and customer company/fleet filtering retain existing enforcement.

Provide an operator-only first-admin bootstrap that refuses when an admin
already exists and writes the invitation to a new private file. Do not create
real identities or passwords automatically. No real email is sent.

Live activation still requires the approved API host, runtime credentials,
private storage and named accounts. A frontend deployment alone is not live
authentication. Keep the current public demo usable until that connection is
ready; never simulate an authenticated staff session in fixture mode.
