import { DeleteObjectsCommand, GetBucketAclCommand, GetBucketPolicyCommand, GetBucketVersioningCommand, GetObjectCommand, HeadObjectCommand, ListObjectVersionsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "node:stream";
import type { AppConfig } from "../../config.js";
import { isPinnedVersion, MAX_DRAWING_BYTES, type DrawingStorage } from "./storage.js";

/** Provider credentials never leave the API. Bucket configuration is verified, never silently changed. */
export function createS3DrawingStorage(config: AppConfig["s3"]): DrawingStorage & { close(): void } {
  const client = new S3Client({ endpoint: config.endpoint, region: config.region, forcePathStyle: true, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }, maxAttempts: 2, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });
  const Bucket = config.bucket;
  const timeout = () => ({ abortSignal: AbortSignal.timeout(15_000) });
  function key(value: string) { if (!/^quarantine\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.png$/.test(value)) throw new Error("Invalid quarantine target"); return value; }
  function privateKey(value: string) { if (!value || value.startsWith("/")) throw new Error("Invalid private object target"); return value; }
  function pinned(value: string | undefined): string { if (!isPinnedVersion(value)) throw new Error("Immutable object version required"); return value; }
  function expiry(value: number, maximum: number) { if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error("Invalid signed URL lifetime"); return value; }
  async function privateVersionedBucket() {
    const versioning = await client.send(new GetBucketVersioningCommand({ Bucket }), timeout());
    if (versioning.Status !== "Enabled") throw new Error("Bucket versioning is required");
    const acl = await client.send(new GetBucketAclCommand({ Bucket }), timeout());
    // MinIO does not implement ACLs: its documented private canned response has no owner ID.
    // Accept that exact response only for an explicitly configured MinIO provider.
    const minioPrivate = config.provider === "minio" && acl.Owner?.ID === "" && acl.Grants?.length === 1 && acl.Grants[0].Grantee?.Type === "CanonicalUser" && !acl.Grants[0].Grantee.ID && !acl.Grants[0].Grantee.URI && acl.Grants[0].Permission === "FULL_CONTROL";
    const ownerPrivate = !!acl.Owner?.ID && !!acl.Grants?.length && acl.Grants.every(grant => grant.Grantee?.Type === "CanonicalUser" && !grant.Grantee.URI && grant.Grantee.ID === acl.Owner!.ID && grant.Permission === "FULL_CONTROL");
    if (!minioPrivate && !ownerPrivate) throw new Error("A private bucket ACL is required");
    try {
      const policy = await client.send(new GetBucketPolicyCommand({ Bucket }), timeout());
      const parsed: unknown = JSON.parse(policy.Policy ?? "{}");
      // Only deny-only policies are accepted. More complex access policies require an explicitly reviewed adapter.
      if (!parsed || typeof parsed !== "object" || !("Statement" in parsed) || !Array.isArray(parsed.Statement) || parsed.Statement.some(s => !s || s.Effect !== "Deny")) throw new Error("Private bucket policy could not be established");
    } catch (error) { if (!(error instanceof Error) || error.name !== "NoSuchBucketPolicy") throw error; }
  }
  return {
    async createUpload(objectKey, seconds) {
      const signingDate = new Date();
      await privateVersionedBucket();
      const url = await getSignedUrl(client, new PutObjectCommand({ Bucket, Key: key(objectKey), ContentType: "image/png" }), { signingDate, expiresIn: expiry(seconds, 900), signableHeaders: new Set(["content-type"]) });
      return { url, headers: { "Content-Type": "image/png" } };
    },
    async inspect(objectKey, versionId) {
      const response = await client.send(new HeadObjectCommand({ Bucket, Key: key(objectKey), ...(versionId ? { VersionId: pinned(versionId) } : {}) }), timeout());
      if (response.ContentLength === undefined || response.ContentLength < 1) throw new Error("Missing object length");
      const version = pinned(response.VersionId);
      if (versionId && version !== versionId) throw new Error("Wrong immutable version");
      return { bytes: response.ContentLength, versionId: version, contentType: response.ContentType };
    },
    async *read(objectKey, versionId) {
      const target = privateKey(objectKey), version = pinned(versionId);
      // Delivery also supports legacy keys selected from authorized immutable metadata.
      // Intent creation, inspection and cleanup retain quarantine-only targets.
      await privateVersionedBucket();
      const response = await client.send(new GetObjectCommand({ Bucket, Key: target, VersionId: version }), { abortSignal: AbortSignal.timeout(30_000) });
      const body = response.Body as Readable | undefined;
      if (!body) throw new Error("Missing object body");
      try {
        if (response.VersionId !== versionId || response.ContentLength === undefined || response.ContentLength > MAX_DRAWING_BYTES) throw new Error("Invalid object metadata");
        let size = 0;
        for await (const chunk of body) { size += chunk.length; if (size > MAX_DRAWING_BYTES) throw new Error("Object stream exceeds limit"); yield chunk as Buffer; }
      } finally { body.destroy(); }
    },
    async createDownload(objectKey, versionId, seconds) {
      await privateVersionedBucket();
      // Legacy private objects may have other keys, but callers only pass keys loaded from scoped immutable metadata.
      return getSignedUrl(client, new GetObjectCommand({ Bucket, Key: privateKey(objectKey), VersionId: pinned(versionId), ResponseContentType: "image/png", ResponseCacheControl: "private, no-store", ResponseContentDisposition: "inline" }), { expiresIn: expiry(seconds, 300) });
    },
    async deleteQuarantine(objectKey) {
      const target = key(objectKey);
      // Prefix alone is never a deletion target. Each version must match this exact intent-owned key.
      for (let batch = 0; batch < 100; batch++) {
        const response = await client.send(new ListObjectVersionsCommand({ Bucket, Prefix: target, MaxKeys: 1000 }), timeout());
        const versions = [...response.Versions ?? [], ...response.DeleteMarkers ?? []].filter(v => v.Key === target).map(v => ({ Key: target, VersionId: pinned(v.VersionId) }));
        if (!versions.length) return;
        const deleted = await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: versions, Quiet: true } }), timeout());
        if (deleted.Errors?.length) throw new Error("Quarantine removal failed");
      }
      throw new Error("Quarantine removal requires another bounded pass");
    },
    close() { client.destroy(); },
  };
}
