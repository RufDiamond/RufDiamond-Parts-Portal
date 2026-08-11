# Build plan

RUF Diamond parts portal · FT3 Wagon pilot · July 2026

Eleven stages. Each ends with something demonstrable. Do not start a stage
before the one above it works.

---

## Before anything

Three things belong to RUF Diamond, not to you, and creating them under your own
account means moving them later.

- [ ] GitHub organisation under a `@rufdiamond.com` address, private repository
- [ ] OVHcloud account under a `@rufdiamond.com` address
- [ ] Two RUF Diamond people hold admin on both

You are added as a collaborator. This is Section 12 of the project definition
and it costs nothing to do correctly now.

**Also chase:** the FT3 Wagon drawing files. Nothing in stages 7 onward can
finish without them, and they are the one input you cannot produce yourself.

---

## Stage 1 — Project skeleton

*Half a day*

```bash
npx create-next-app@latest rufdiamond-portal --typescript --app --no-tailwind
cd rufdiamond-portal
git init && git remote add origin <the RUF Diamond repo>
```

- [ ] Drop `tokens.css` in, holding the five colours, type scale, spacing
- [ ] Load Plus Jakarta Sans and IBM Plex Mono via `next/font`
- [ ] Build one screen from the prototype, hard-coded, to prove the styling works
- [ ] Commit and push

**Done when:** `npm run dev` shows one correctly styled screen.

---

## Stage 2 — Database

*One to two days*

Postgres locally via Docker. Prisma or Drizzle as the query layer.

Build the schema from `catalog-data-structure.md`. Order matters, because of
foreign keys:

1. `product_line`, `system`
2. `model`, `variant`, `model_system`
3. `figure`, `drawing_file`
4. `part`, `part_requires`
5. `figure_part`, `callout`
6. `company`, `company_product_line`, `company_machine`, `user`
7. `order`, `order_line`, `audit_log`
8. `capability`, `role`, `role_capability`

- [ ] Migration runs clean from empty
- [ ] Seed script inserts the twelve systems and three product lines

**Done when:** the schema exists and you can query an empty database.

**Watch for:** `callout` must be its own table with `figure_part_id`, and `x`/`y`
stored as percentages. Getting this wrong breaks the client's headline request
and is painful to change later.

---

## Stage 3 — The import

*Two to three days*

This is the first thing worth showing the client.

- [ ] Read the FT3 Wagon `.xlsx` with SheetJS
- [ ] Map all sixteen columns per Section 4.3
- [ ] Deduplicate: 635 rows contain 536 unique parts
- [ ] Create figures from `GROUPNO` + `ASSEMBLY NAME - PAGE`
- [ ] Create `figure_part` rows, one per source row
- [ ] Create `callout` rows from `PNC`, coordinates left null
- [ ] Parse `REMARKS` into `part_requires`, flagged for review
- [ ] Print a summary: rows read, parts created, figures created, rejected

**Done when:** running it against the real file produces 536 parts across 44
figures, and running it twice does not duplicate anything.

**Make it idempotent.** You will run this many times. It must update rather than
insert on the second run.

---

## Stage 4 — Read-only catalog

*Three to five days*

Screens with real data, no auth, no interaction.

- [ ] Machine select, systems, figures, part detail
- [ ] Parts table with the real columns
- [ ] Title block on every screen
- [ ] Breadcrumbs

**Done when:** you can navigate from machine to a parts list drawn from the
database.

**Show the client here.** Real part numbers, real prices, their own data.

---

## Stage 5 — Auth and capabilities

*Three to four days*

Do this before the interactive features, not after. Retrofitting permissions is
how security holes happen.

- [ ] Auth.js with credentials, sessions, password reset
- [ ] Seed the capability register from `capability-and-role-spec.md`
- [ ] Three roles for the pilot: Catalog admin, Purchaser, Technician
- [ ] A `can(capability)` helper checked server-side on every route
- [ ] Product-line scoping applied **in the query**, not in the UI

**Done when:** a Fat Truck user's response contains no IronHorse data at all,
even when the URL is edited by hand.

**Never write `if (user.role === 'admin')`.** Check capabilities only. This is
what makes adding roles later a config change.

---

## Stage 6 — Request list and orders

*Three to four days*

- [ ] Add parts to a request, quantities, persistence across sessions
- [ ] Dealer discount applied at display time from `company.discount_rate`
- [ ] Submit creates an order with snapshotted part numbers and prices
- [ ] Technicians can build but not submit
- [ ] Confirmation email

**Done when:** a purchaser submits an order and a technician cannot.

---

## Stage 7 — Drawings and the hotspot editor

*Five to eight days · the hard part*

Everything before this was ordinary web work. This is the piece RUF Diamond is
actually buying, and it is where the schedule is most likely to move.

- [ ] Upload a drawing to object storage
- [ ] Display it with zoom and pan
- [ ] Admin clicks a point on the drawing to set a callout's coordinates
- [ ] Coordinates stored as percentages of image dimensions
- [ ] Progress counter, and a figure cannot be marked complete while callouts
      are unmapped
- [ ] Customer side: selecting a table row highlights **every** callout for
      that part

**Done when:** one figure is fully mapped and a part appearing twice lights up
in both places.

**Check first:** if the drawings arrive as SVG with the callout numerals as text
elements, coordinates can be extracted automatically and this stage shrinks
dramatically. Test one file before assuming manual placement.

---

## Stage 8 — Admin console

*Five to seven days*

- [ ] Catalog, model editor, parts table
- [ ] CSV price import: upload, validate, preview, approve, log, rollback
- [ ] Order inbox with quoting and status
- [ ] Company and user management
- [ ] Audit log
- [ ] Draft and publish, with publishing blocked on unmapped callouts

**Done when:** a RUF Diamond person can update prices and publish without you.

That is the whole point of the project. Test it by having someone else do it
while you watch and say nothing.

---

## Stage 9 — Server and deployment

*Two to three days*

- [ ] Provision the OVHcloud VPS-3, Ubuntu LTS
- [ ] Firewall: 80, 443, and SSH by key only
- [ ] Docker: app, Postgres, Nginx
- [ ] `parts.rufdiamond.com` DNS, Let's Encrypt certificate
- [ ] Staging alongside production on the same server
- [ ] Deploy from GitHub, never edit on the server
- [ ] Premium backup enabled
- [ ] **Nightly database dump to object storage** — the OVHcloud backup covers
      the system disk only, per Section 10.1
- [ ] Uptime Kuma, disk and certificate alerts

**Done when:** a restore from backup has been performed successfully. Your own
document makes this a launch gate.

---

## Stage 10 — Load the machine

*Two to three weeks, parallel with 8 and 9*

- [ ] Import the export
- [ ] Upload 44 drawings
- [ ] Map every callout
- [ ] Verify against the current portal, figure by figure
- [ ] **Record how long the mapping took** — that number makes the remaining
      eight models predictable and is the most valuable output of the pilot

---

## Stage 11 — Test and launch

*One to two weeks*

- [ ] Every role tested against the capability matrix
- [ ] URL tampering: can a Fat Truck user reach IronHorse data?
- [ ] Import a deliberately broken CSV
- [ ] OWASP ZAP against staging
- [ ] Restore rehearsal
- [ ] Train RUF Diamond staff on the admin side
- [ ] Release to selected customers, existing portal still running

---

## Order of risk

If the timeline compresses, protect these in order:

1. **Stage 7** — the hotspot editor. Nothing else matters if this does not work.
2. **Stage 5** — capabilities. A permissions bug leaks a competitor's pricing.
3. **Stage 3** — the import. Everything downstream depends on clean data.

Stages 4, 6, and 8 are ordinary CRUD. They will take the time they take and
carry little risk.

---

## Two habits worth keeping

**Commit at every checkbox.** Small commits with real messages. When something
breaks at stage 8 you want to bisect, not guess.

**Show the client at stages 4, 7, and 10.** Not more often. Each is a real
milestone; anything between is you asking for reassurance rather than feedback.
