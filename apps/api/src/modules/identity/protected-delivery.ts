import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { OutboxDelivery } from "../outbox/worker.js";

export interface ProtectedDeliveryContext {
  purpose: "password_reset";
  targetId: string;
  recordId: string;
  payloadVersion: 1;
  expiresAt: string;
}

export interface ProtectedDeliveryEnvelope {
  keyId: string;
  nonce: string;
  tag: string;
  ciphertext: string;
  context: ProtectedDeliveryContext;
}

export interface DeliveryKeyring {
  activeKeyId: string;
  keys: Readonly<Record<string, string>>;
}

export class ProtectedDeliveryError extends Error {
  readonly code = "PROTECTED_DELIVERY_REJECTED";
  constructor() {
    super("Protected delivery could not be processed");
    this.name = "ProtectedDeliveryError";
  }
}

function key(keyring: DeliveryKeyring, keyId: string): Buffer {
  const encoded = keyring.keys[keyId];
  if (!encoded) throw new ProtectedDeliveryError();
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.length !== 32 || decoded.toString("base64") !== encoded) throw new ProtectedDeliveryError();
  return decoded;
}

function additionalData(context: ProtectedDeliveryContext): Buffer {
  return Buffer.from(JSON.stringify({
    purpose: context.purpose,
    targetId: context.targetId,
    recordId: context.recordId,
    payloadVersion: context.payloadVersion,
    expiresAt: context.expiresAt,
  }));
}

function canonicalBase64(value: unknown, bytes?: number): value is string {
  if (typeof value !== "string") return false;
  const decoded = Buffer.from(value, "base64");
  return (bytes === undefined || decoded.length === bytes) && decoded.toString("base64") === value;
}

function isEnvelope(value: unknown): value is ProtectedDeliveryEnvelope {
  if (!value || typeof value !== "object") return false;
  const envelope = value as Partial<ProtectedDeliveryEnvelope>;
  const context = envelope.context as Partial<ProtectedDeliveryContext> | null | undefined;
  return typeof envelope.keyId === "string" && envelope.keyId.length > 0
    && canonicalBase64(envelope.nonce, 12)
    && canonicalBase64(envelope.tag, 16)
    && canonicalBase64(envelope.ciphertext)
    && Boolean(context)
    && context?.purpose === "password_reset"
    && typeof context.targetId === "string"
    && typeof context.recordId === "string"
    && context.payloadVersion === 1
    && typeof context.expiresAt === "string";
}

export function encryptProtectedDelivery(
  keyring: DeliveryKeyring,
  context: ProtectedDeliveryContext,
  plaintext: unknown,
): ProtectedDeliveryEnvelope {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(keyring, keyring.activeKeyId), nonce);
  cipher.setAAD(additionalData(context));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(plaintext), "utf8"), cipher.final()]);
  return {
    keyId: keyring.activeKeyId,
    nonce: nonce.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    context,
  };
}

export function decryptProtectedDelivery<T>(
  keyring: DeliveryKeyring,
  envelope: ProtectedDeliveryEnvelope,
  expected: { purpose: "password_reset"; targetId: string; recordId: string; payloadVersion: 1 },
  now: Date,
): T {
  if (!isEnvelope(envelope)) throw new ProtectedDeliveryError();
  const { context } = envelope;
  const expiresAt = new Date(context.expiresAt);
  if (context.purpose !== expected.purpose || context.targetId !== expected.targetId
    || context.recordId !== expected.recordId || context.payloadVersion !== expected.payloadVersion
    || !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) throw new ProtectedDeliveryError();
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(keyring, envelope.keyId), Buffer.from(envelope.nonce, "base64"));
    decipher.setAAD(additionalData(context));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch (error) {
    if (error instanceof ProtectedDeliveryError) throw error;
    throw new ProtectedDeliveryError();
  }
}

export interface PasswordResetNotification {
  recipient: string;
  resetToken: string;
  expiresAt: string;
  providerIdempotencyKey: string;
}

export interface PasswordResetDeliveryPort {
  deliverPasswordReset(notification: PasswordResetNotification): Promise<void>;
}

export function createPasswordResetDelivery(options: {
  keyring: DeliveryKeyring;
  port: PasswordResetDeliveryPort;
  now?: () => Date;
}): OutboxDelivery {
  return async message => {
    if (message.eventType !== "identity.password-reset.requested" || message.aggregateType !== "password_reset_token" || message.payloadVersion !== 1) {
      throw new ProtectedDeliveryError();
    }
    const envelope = message.payload as ProtectedDeliveryEnvelope;
    const decrypted = decryptProtectedDelivery<{ recipient: string; resetToken: string; targetId: string }>(options.keyring, envelope, {
      purpose: "password_reset",
      targetId: envelope?.context?.targetId,
      recordId: message.aggregateId,
      payloadVersion: 1,
    }, options.now?.() ?? new Date());
    if (typeof decrypted.recipient !== "string" || typeof decrypted.resetToken !== "string"
      || decrypted.targetId !== envelope.context.targetId) throw new ProtectedDeliveryError();
    await options.port.deliverPasswordReset({
      recipient: decrypted.recipient,
      resetToken: decrypted.resetToken,
      expiresAt: envelope.context.expiresAt,
      providerIdempotencyKey: message.providerIdempotencyKey,
    });
  };
}
