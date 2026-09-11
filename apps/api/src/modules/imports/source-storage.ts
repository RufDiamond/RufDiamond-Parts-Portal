import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import type { AppConfig } from "../../config.js";
import { requirePrivateVersionedBucket } from "../drawings/s3-storage.js";
import { isPinnedVersion } from "../drawings/storage.js";
import { MAX_IMPORT_BYTES } from "./parser.js";
export interface ImportSourceStorage {
  put(
    key: string,
    bytes: Buffer,
    format: "csv" | "xlsx",
  ): Promise<{ versionId: string }>;
  read(key: string, versionId: string): Promise<Buffer>;
  /** Only this attempt's exact new unreferenced version, never an existing job. */
  remove(key: string, versionId: string): Promise<void>;
}
export const importContentType = (format: "csv" | "xlsx") =>
  format === "csv"
    ? "text/csv"
    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export function createS3ImportStorage(
  config: AppConfig["s3"],
): ImportSourceStorage & { close(): void } {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    maxAttempts: 2,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const key = (value: string) => {
    if (!/^imports\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(csv|xlsx)$/.test(value))
      throw new Error("Invalid import object key");
    return value;
  };
  const pinned = (value: string) => {
    if (!isPinnedVersion(value))
      throw new Error("Immutable source version required");
    return value;
  };
  const options = () => ({ abortSignal: AbortSignal.timeout(30_000) });
  return {
    async put(objectKey, bytes, format) {
      const Key = key(objectKey);
      if (
        !Key.endsWith(`.${format}`) ||
        !bytes.length ||
        bytes.length > MAX_IMPORT_BYTES
      )
        throw new Error("Invalid import source");
      await requirePrivateVersionedBucket(client, config);
      const response = await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key,
          Body: bytes,
          ContentLength: bytes.length,
          ContentType: importContentType(format),
        }),
        options(),
      );
      return { versionId: pinned(response.VersionId ?? "") };
    },
    async read(objectKey, versionId) {
      const Key = key(objectKey),
        VersionId = pinned(versionId);
      await requirePrivateVersionedBucket(client, config);
      const response = await client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key, VersionId }),
        options(),
      );
      const body = response.Body as Readable | undefined;
      if (!body) throw new Error("Missing source body");
      try {
        if (
          response.VersionId !== VersionId ||
          !response.ContentLength ||
          response.ContentLength > MAX_IMPORT_BYTES
        )
          throw new Error("Invalid source metadata");
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of body) {
          size += chunk.length;
          if (size > MAX_IMPORT_BYTES)
            throw new Error("Source size limit exceeded");
          chunks.push(Buffer.from(chunk));
        }
        if (size !== response.ContentLength)
          throw new Error("Truncated source");
        return Buffer.concat(chunks);
      } finally {
        body.destroy();
      }
    },
    async remove(objectKey, versionId) {
      await client.send(
        new DeleteObjectCommand({
          Bucket: config.bucket,
          Key: key(objectKey),
          VersionId: pinned(versionId),
        }),
        options(),
      );
    },
    close() {
      client.destroy();
    },
  };
}
