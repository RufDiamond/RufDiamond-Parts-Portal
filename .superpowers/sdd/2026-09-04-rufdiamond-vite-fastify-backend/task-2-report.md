# Task 2 Report — Fastify API shell

## Outcome

Added the `@rufdiamond/api` workspace without changing root Next.js scripts or
the existing frontend. The API exposes only `GET /health/live`, receives an
injected `AppConfig`, emits request IDs, and uses a safe RFC 9457 problem
envelope for route, validation, application, and unexpected failures.

## Delivered files

- `apps/api/package.json`, `tsconfig.json`, and `vitest.config.ts`
- `apps/api/src/config.ts`: explicit, validated configuration loader for
  `NODE_ENV`, `PORT`, `DATABASE_URL`, `SESSION_SECRET`, `WEB_ORIGIN`, and S3
  settings. No module reads `process.env` while it is imported.
- `apps/api/src/app.ts`: `buildApp({ config, dependencies? })` composition and
  the liveness endpoint.
- `apps/api/src/plugins/request-context.ts`: assigns and returns
  `x-request-id`.
- `apps/api/src/plugins/error-handler.ts`: exports `AppError` and produces
  safe `ProblemDetails` envelopes for 400, 404, 409, 422, 429, 503, and 500.
- `apps/api/src/server.ts`: environment loading only at startup and a
  one-time graceful SIGTERM close handler.
- Contract tests for health, RFC 9457 not-found responses, validation safety,
  request ID correlation, and HTTP-origin configuration validation.

## TDD evidence

### Red — shell contract absent

Command:

```sh
npm test -w @rufdiamond/api -- health.test.ts problems.test.ts
```

Output (exit 1):

```text
Failed Suites 2
Error: Cannot find module '../../src/app.js'
Test Files  2 failed (2)
Tests  no tests
```

The tests were present first; the expected missing application module caused
both suites to fail.

### Green — shell contract implemented

Command:

```sh
npm test -w @rufdiamond/api -- health.test.ts problems.test.ts
```

Output (exit 0):

```text
Test Files  2 passed (2)
Tests  3 passed (3)
```

### Red — stricter configuration boundary

Command:

```sh
npm test -w @rufdiamond/api -- health.test.ts problems.test.ts
```

Output (exit 1):

```text
configuration > rejects a non-HTTP web origin
AssertionError: expected [Function] to throw an error
Test Files  1 failed | 1 passed (2)
Tests  1 failed | 3 passed (4)
```

`loadConfig` initially accepted `ftp://` origins. The minimal change added
HTTP/HTTPS validation for portal and S3 URLs.

### Green — configuration boundary enforced

Command:

```sh
npm test -w @rufdiamond/api -- health.test.ts problems.test.ts
```

Output (exit 0):

```text
Test Files  2 passed (2)
Tests  4 passed (4)
```

## Final verification

```sh
npm test -w @rufdiamond/api
```

```text
Test Files  2 passed (2)
Tests  4 passed (4)
```

```sh
npm run typecheck -w @rufdiamond/api
```

```text
> @rufdiamond/api@0.1.0 typecheck
> tsc --noEmit
```

```sh
npm run build
```

```text
> rufdiamond-parts-portal@0.1.0 build
> next build
✓ Compiled successfully
✓ Generating static pages using 10 workers (13/13)
```

```sh
git diff --check
```

Output: exit 0, with no whitespace errors.

## Scope and concerns

- Business routes are intentionally absent; the liveness endpoint is the only
  registered API route.
- Application-specific 422/409/429/503 responses are represented through
  `AppError(code, status, detail, issues?)`; later modules supply their stable
  domain codes and issue arrays.
- `npm install` reported three pending native/tool install scripts under the
  repository's `allowScripts` policy (`esbuild`, `fsevents`, and
  `unrs-resolver`). Dependency installation and all tests/builds completed
  successfully; no approval was performed or needed for this task.
