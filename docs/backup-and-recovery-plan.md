# Backup and recovery

RUFDiamond parts portal · response to point 4 · July 2026

---

## What has to be protected

The portal holds four kinds of data, and they fail differently. Treating them
as one thing is how recovery plans go wrong.

| Data | Volume | Changes | Loss impact |
|---|---|---|---|
| Parts database | ~6,000 records at full scope | Daily during build, weekly after | Rebuildable from source exports, slowly |
| Drawing files | ~400 figures, image or vector | Rarely once loaded | **Not rebuildable without the originals** |
| Callout mappings | ~15,000 coordinate records | Daily during build | **Not rebuildable — this is the irreplaceable asset** |
| Orders and accounts | Growing continuously | Continuously | Commercially and legally significant |

The callout mappings deserve attention. They are the output of the manual work
this project exists to bring in-house. Losing the parts data costs a re-import.
Losing the mappings costs the labour of remapping every figure by hand.

---

## Backup layers

Four independent layers. Each covers a failure the others don't.

### 1. Continuous — point-in-time recovery

The database records every change as it happens, so the system can be restored
to any chosen second within the retention window rather than only to the last
snapshot.

- **Window:** 7 days
- **Recovers from:** a bad bulk edit, an accidental deletion, a faulty import
- **Restores to:** any moment, e.g. "09:14, two minutes before the import ran"
- **Provided by:** the managed database service, on by default

This is the layer that matters most in practice. The realistic disaster is not
a datacentre fire — it is someone importing the wrong spreadsheet on a Tuesday
afternoon.

### 2. Nightly — full snapshot

A complete copy of the database taken each night, held in a separate storage
service from the database itself.

- **Schedule:** 02:00 Eastern, daily
- **Retention:** 30 daily, 12 monthly, 7 annual
- **Storage:** object storage in a Canadian region, encrypted at rest
- **Recovers from:** corruption discovered after the 7-day window closes

### 3. Weekly — drawing and file archive

The drawing files change rarely but are the hardest to replace. They are backed
up separately from the database so a database restore never touches them.

- **Schedule:** weekly, plus immediately after any bulk upload
- **Retention:** 12 months, versioned
- **Storage:** separate provider or separate region from the database backups

### 4. Quarterly — offline export

A human-readable export of the whole catalog — parts as CSV, drawings as files,
mappings as a structured file — downloaded and stored by RUFDiamond on hardware
you control.

- **Schedule:** quarterly, plus before any major migration
- **Held by:** RUFDiamond, not the hosting provider
- **Recovers from:** provider failure, account lockout, billing dispute,
  supplier relationship breaking down

Layer 4 is the one most projects skip and the one this client should insist on.
It is the reason they are leaving their current provider: their data is on
someone else's system and getting it out depends on that relationship holding.
A quarterly export means the portal could disappear entirely and RUFDiamond
would still own everything in it.

---

## Recovery procedures

### Someone deleted or broke something

1. Identify roughly when. The audit log gives actor, object, and timestamp.
2. Restore a copy of the database to a moment just before it.
3. Verify the affected records on the copy.
4. Either promote the copy, or copy the specific records back into production.

**Target: under 1 hour.** No data loss beyond the mistake itself. Most incidents
land here.

### The database fails

1. Provision a replacement from the most recent snapshot.
2. Replay the transaction log forward to the moment of failure.
3. Repoint the application.

**Target: under 4 hours to restore, under 5 minutes of data loss.**

### The hosting provider has an outage

Nothing to do but wait, unless a standby is running in a second region. That is
a cost decision, not a technical one — see the note below.

### The hosting provider is lost entirely

1. Provision infrastructure with an alternative provider.
2. Restore from the quarterly offline export plus the most recent off-provider
   backup.
3. Redeploy the application from source control.

**Target: 2–3 days.** Rare, and the reason layer 4 exists.

---

## Targets, stated plainly

| Scenario | Maximum data loss | Time to running again |
|---|---|---|
| Human error | The mistake only | < 1 hour |
| Database failure | < 5 minutes | < 4 hours |
| Region outage | < 5 minutes | Provider-dependent |
| Provider loss | < 1 quarter | 2–3 days |

These are the standard targets for a system of this kind. Tighter numbers are
achievable and cost more; the question below is whether they are worth it here.

---

## Verification

An untested backup is a belief, not a plan.

- **Monthly:** automated restore of the previous night's snapshot to a scratch
  environment, with a record count and integrity check. Fails loudly if it
  fails.
- **Quarterly:** a person performs a restore manually, start to finish, and
  writes down how long it took.
- **Annually:** a full recovery rehearsal from the offline export alone, as
  though the provider no longer existed.

The quarterly manual test matters more than it sounds. It is what proves
RUFDiamond can recover without the developer, which is the stated goal of the
whole project.

---

## What RUFDiamond does, and what is automatic

**Automatic, no human involvement:** continuous point-in-time recording,
nightly snapshots, weekly file archives, monthly restore verification, failure
alerts by email.

**Requires a person, quarterly:** download the offline export, store it, and
perform one manual restore test. Roughly two hours, four times a year.

**Requires a person, when something goes wrong:** decide what to restore and to
when. The restore itself is a small number of clicks; deciding is the judgement
call.

---

## Two decisions for RUFDiamond

**1. How long can the portal be unavailable before it costs real money?**

If a customer with a machine down can phone or email instead, a four-hour
recovery is fine and the plan above is complete. If the portal becomes the only
ordering channel, a warm standby in a second region cuts recovery to minutes —
at roughly double the hosting cost. Worth deciding deliberately rather than
discovering during an outage.

**2. Is Canadian data residency required?**

Mining, utility, and defence customers sometimes carry contractual requirements
about where data is stored. If any do, it constrains provider choice and should
be settled before infrastructure is selected rather than after. Worth checking
existing customer agreements.

---

## The point worth making at the meeting

Ask the current provider three questions:

1. How often is our data backed up, and where is it stored?
2. When was a restore last tested?
3. If we ended the contract tomorrow, what would we receive, in what format,
   and how long would it take?

The answers are the honest comparison. RUFDiamond currently has a catalog they
cannot fully account for on infrastructure they cannot inspect, reachable only
through a relationship they are about to end. Everything above exists so that
never happens again.
