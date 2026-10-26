# Role-based Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add admin-created pilot accounts, secure setup links and role-aware controls.

**Architecture:** Existing Fastify identity and capability/scope enforcement remain authoritative. Add an audited account service, invitation table and same-origin contracts, then connect protected Next pages. Keep email disabled and deployment claims separate.

**Tech Stack:** TypeScript, Fastify, Drizzle/PostgreSQL, Argon2, TypeBox, Next 16, React, Vitest and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-26-role-based-accounts-design.md`

## Global Constraints

- Preserve first-party identity and existing three pilot role bundles.
- Internal capability checks, company scopes, no self role/status changes, no upward delegation.
- No real accounts, credential changes or email delivery by the agent.
- Invitation tokens are hashed, single-use, expire after 24 hours and never enter logs/storage/audit patches.
- Preserve artwork and current demo; live authentication requires the real API.

## Review Focus

- Concurrent privilege revocation must prevent subsequent admin writes.
- Customer-issued requests cannot discover or mutate other companies/users.
- Invitation replay, expiry, reissue and disablement must fail closed.
- Public responses and audit data cannot contain password or invitation hashes.
- Direct technician submission and stale browser permissions must remain denied.

## Task 1: Account authority and invitation service

Files: `packages/contracts/src/accounts.ts`, `apps/api/src/modules/accounts/{service,routes}.ts`, invitation schema/migration, app registration, `apps/api/test/integration/accounts.test.ts`.

- [x] Write integration tests using disposable PostgreSQL and real sign-in: anonymous/customer denial, role assignment, company isolation, password setup/replay/expiry, session revocation, stale writes, self edits, upward grants and concurrency.
- [x] Run focused tests and observe missing routes failing before implementation.
- [x] Implement strict DTOs, serialized current authority, account CRUD/status, invitation issuance/completion and audit; reuse existing password service.
- [x] Run focused tests/typechecks, then commit the coherent API slice.

## Task 2: Protected account and activation UI

Files: Next `/admin/users`, `/activate`, proxy allowlist/response contracts, PortalShell, quote request/checkout controls and tests.

- [x] Add failing tests for page access, one-time link handling and technician submission controls.
- [x] Implement admin list/create/role/status/reissue, password setup, source-scoped session handling and capability-based submission controls.
- [x] Verify form validation, network errors, duplicate submissions, keyboard operation and browser route behavior without simulated production login.
- [x] Run frontend suite/build and commit.

## Task 3: Bootstrap, review and deployment evidence

Files: operator bootstrap and account runbook, verification report.

- [x] Test bootstrap refusal when an administrator exists, private file permissions, no secret stdout, and pending-invitation first-admin creation.
- [x] Add operator setup instructions and separate live-host blockers from locally completed behavior.
- [x] Run API/contracts/frontend tests, build, lint/typechecks and focused native browser checks; obtain independent whole-diff review.
- [x] Push reviewed code, preserve disabled email, and report exactly what is ready versus live.
