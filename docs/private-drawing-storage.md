# Private PNG lifecycle

This is the local Task 7 prerequisite. No production bucket, deployment, scanner
signature feed, or authenticated Next entry is provisioned by it.

The API owns S3 credentials. `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`,
`S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` use the existing server settings.
`S3_PROVIDER` defaults to `s3`; `minio` explicitly accepts MinIO's documented
private canned ACL response with empty owner IDs. The default requires owner-only
canonical-user FULL_CONTROL grants. Group/foreign grants, unverifiable policies,
and suspended/missing versioning fail closed. Only absent or deny-only bucket
policies are accepted; another provider's policy model needs a reviewed adapter.
The service never changes bucket policy, grants, versioning, or CORS automatically.

Provision a private, versioning-enabled bucket and restrict the service identity
to its drawing bucket. Configure CORS for the exact authenticated web origin and
PUT/Content-Type if the browser uploads directly (an exact-origin rule with
AllowedMethods `["PUT"]`, AllowedHeaders `["content-type"]`; no wildcard origin).
Native image GET needs no JavaScript CORS read; add GET only if the deployment
explicitly reads image bytes in browser code. The local real-service test uses
Node fetch plus Fastify injection: it does **not** verify a browser preflight or
browser upload CORS. Task 9 must exercise that in its actual browser origin.
Production browser upload and
image URLs require HTTPS. The current canvas accepts HTTPS or same-origin paths;
plain HTTP MinIO is for isolated transport tests and must be terminated with TLS
or integrated through authorized same-origin delivery for a browser deployment.

Dependencies are pinned: `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`
3.1128.0; `sharp` 0.35.4; test-only `testcontainers` 12.1.0. Tests use
`minio/minio:RELEASE.2025-04-22T22-12-26Z`, `postgres:17-alpine`, and
`clamav/clamav:1.4.3_base` (explicit linux/amd64 for that official image).
The opt-in compose profile `drawing-storage-test` exposes ephemeral MinIO on
127.0.0.1:19000; it does not touch the existing PostgreSQL volume. Automated tests
use their own Testcontainers services and random ports, independently of compose.

## Scanner contract

Set `DRAWING_SCANNER_HOST`, `DRAWING_SCANNER_PORT`, and optionally
`DRAWING_SCANNER_TIMEOUT_MS` (default 30000; permitted 100–60000). Without a scanner,
finalization returns 503. The concrete adapter uses clamd TCP `zINSTREAM` with a NUL
terminator, 32-bit network-order chunk sizes, maximum 64 KiB chunks, then a zero
length. A NUL-terminated exact `stream: OK` means clean; `stream: … FOUND` means
infected. Error/malformed/oversized responses, socket failure, timeout, and missing
configuration mean unavailable. The entire operation has an absolute deadline,
bounded response size, and write backpressure.

Use a private scanner network. clamd TCP provides no application authentication or
TLS. Configure `StreamMaxLength` and `MaxFileSize` above 20 MiB, sufficient
`MaxScanSize`, and **`AlertExceedsMax yes`** so resource limits cannot become a clean
verdict. Maintain current production signatures and monitor engine/feed health.
The committed integration test uses a deterministic **test-only** `.ndb` signature
database to prove real engine/transport behavior without a live feed. It is not a
production malware signature database or evidence of production scanner readiness.

## API and editor integration

All routes require a fresh authenticated cookie session, current draft-view/figure-
view grants, draft environment, and the same brand/variant scope as mapping reads.
Writes additionally require drawing-upload + figure-edit grants and Origin/CSRF.
No client-selected object key, storage endpoint, or download version is accepted.

- `POST /api/v1/admin/figures/:figureId/drawing-uploads`: JSON
  `{filename,bytes,sha256}`, quoted figure version in `If-Match`; returns 201
  `{uploadId,figureId,figureVersion,url,headers,expiresAt}`. Lifetime 15 minutes.
- `POST /api/v1/admin/figures/:figureId/drawing-uploads/:uploadId/finalize`:
  empty JSON and the intent's original figure version in `If-Match`; returns
  `{figureId,figureVersion,drawingFileId,fileVersion,sha256,width,height,bytes,filename}`.
  The actor-owned upload ID is the replay key. A finalized replay returns the same
  immutable attachment metadata even when subsequent work exists; it does not
  reattach an old drawing. Expired pending intents return 409; stale figures 412.
- `GET /api/v1/admin/figures/:figureId/drawing`: returns that attachment envelope
  plus `{url,expiresAt}` for the exact **current** immutable object version, with a
  five-minute URL lifetime. All responses are no-store.

Contracts live in `packages/contracts/src/drawing-upload.ts`. `DrawingApiClient`
uses same-origin API requests with in-memory CSRF, bounded browser hashing, strict
response validation, and credential-free PUT to the returned storage URL. Storage
responses and URLs are never placed in generic audit/outbox payloads.

Pass `drawingApi` and `authority.canUploadDrawing` (the conjunction of the two
explicit write grants) to `MappingEditor`. This boolean grants no API authority.
The editor retains local work after upload, removes a stale overlay, permits
idempotent verification retry, and offers **Select current drawing version**.
Selecting refetches mapping plus drawing, checks exact source identity/dimensions,
and confirms replacement of unsaved work. Changed sources reset to a new draft;
approval is not inherited. Task 9 must supply authenticated session/source/drawing
props and preserve this guarded reconciliation flow without forcing a remount.
There is no historical-drawing reattachment or list endpoint.

## Attachment and maintenance

Before attachment, a bounded read verifies the actual byte count/hash, PNG
framing/CRC, side/pixel bounds, full image decode, and scanner verdict. Compressed
ancillary metadata is excluded from the decoder; the scanner receives the original
bytes. Two validations per API instance bound aggregate work. The inspected object
version is passed to the read and recorded unchanged; upload URL reuse cannot
alter attached bytes. No transaction spans download/decode/scan.

Finalization reauthorizes under serializable model → figure → variant/head →
source graph → upload-intent locks. It checks expiry and figure version again,
inserts append-only drawing metadata, increments figure version, and records audit
and outbox in the same transaction. Mapping source binding then becomes stale;
old mappings, approvals, drawings, and release snapshots remain untouched.

Run one bounded cleanup pass with `npm run drawings:cleanup -w @rufdiamond/api`
using the intended environment's server configuration. Schedule that command in
the deployment's maintenance system; no implicit timer or production schedule is
created here. A pass examines at most 100 intents whose uploads expired more than
24 hours ago, retaining even bytes uploaded near expiry for the full window.
It checks drawing, preview, release-snapshot, and import references,
claims the intent so it can no longer finalize, then deletes only versions of its
exact server-owned quarantine key. Storage failure leaves a retryable cleanup
claim. Finalized/referenced keys are never cleanup candidates. This does not sweep
the bucket or delete unused prior drawing revisions.

## Primary references

- [AWS presigned uploads and key reuse](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html)
- [Pinned MinIO private canned ACL implementation](https://github.com/minio/minio/blob/RELEASE.2025-04-22T22-12-26Z/cmd/acl-handlers.go)
- [Sharp input pixel bounds and failOn](https://sharp.pixelplumbing.com/api-constructor/)
- [ClamAV scanning and daemon usage](https://docs.clamav.net/manual/Usage/Scanning.html)
- [Official ClamAV Docker images](https://docs.clamav.net/manual/Installing/Docker.html)
