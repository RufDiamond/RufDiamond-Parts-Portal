import { createHash } from "node:crypto";
import nodemailer from "nodemailer";
import type { QuoteEmailPort } from "./email-delivery.js";
import { createMicrosoftSmtpTokenProvider, type MicrosoftSmtpApplication } from "./microsoft-smtp-token.js";

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  microsoft?: MicrosoftSmtpApplication;
  from: string;
  replyTo?: string;
}

export interface SmtpMessage {
  from: string;
  to: string[];
  replyTo?: string;
  subject: string;
  text: string;
  messageId: string;
  disableFileAccess: true;
  disableUrlAccess: true;
}

export interface SmtpTransport {
  sendMail(message: SmtpMessage): Promise<{
    accepted?: Array<string | { address: string }>;
    rejected?: unknown[];
  }>;
}

class SmtpDeliveryError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "SmtpDeliveryError";
  }
}

// Deliberately one bare mailbox per setting/recipient, never an address list or header.
function mailbox(value: string): boolean {
  return /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/.test(value)
    && value.length <= 254 && value.split("@")[0].length <= 64;
}

export function loadSmtpConfig(env: Readonly<Record<string, string | undefined>>): SmtpConfig | null {
  if (env.QUOTE_EMAIL_SENDING !== "enabled") return null;
  const required = (key: string) => {
    const value = env[key];
    if (!value) throw new Error(`Missing required configuration: ${key}`);
    return value;
  };
  const host = required("SMTP_HOST");
  const portText = env.SMTP_PORT ?? "587";
  const port = Number(portText);
  if (!/^[A-Za-z0-9.-]+$/.test(host)) throw new Error("Invalid SMTP_HOST");
  if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid SMTP_PORT");
  const from = required("SMTP_FROM");
  if (!mailbox(from)) throw new Error("Invalid SMTP_FROM");
  const replyTo = env.SMTP_REPLY_TO || undefined;
  if (replyTo && !mailbox(replyTo)) throw new Error("Invalid SMTP_REPLY_TO");
  const user = required("SMTP_USER");
  const mode = env.SMTP_AUTH_MODE ?? "password";
  if (mode === "microsoft-oauth2") {
    if (host.toLowerCase() !== "smtp.office365.com" || port !== 587) throw new Error("Microsoft SMTP requires smtp.office365.com:587");
    if (!mailbox(user) || user.toLowerCase() !== from.toLowerCase()) throw new Error("Microsoft SMTP_USER must match SMTP_FROM");
    const tenantId = required("MICROSOFT_TENANT_ID"), clientId = required("MICROSOFT_CLIENT_ID");
    const guid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
    if (!guid.test(tenantId) || !guid.test(clientId)) throw new Error("Invalid Microsoft tenant or client ID");
    return { host, port, user, from, replyTo, microsoft: { tenantId, clientId, clientSecret: required("MICROSOFT_CLIENT_SECRET") } };
  }
  if (mode !== "password") throw new Error("Invalid SMTP_AUTH_MODE");
  return { host, port, user, password: required("SMTP_PASSWORD"), from, replyTo };
}

export function createSmtpQuoteEmailPort(config: SmtpConfig, transport?: SmtpTransport): QuoteEmailPort {
  const token = config.microsoft ? createMicrosoftSmtpTokenProvider(config.microsoft) : undefined;
  const sender = transport ?? nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: config.port !== 465,
    auth: token ? {
      type: "OAuth2", user: config.user,
      provisionCallback: (_user, renew, callback) => {
        token(renew).then(value => callback(null, value.accessToken, value.expiresAt), error => callback(error));
      },
    } : { user: config.user, pass: config.password },
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return {
    async deliver(message) {
      if (message.to.length === 0 || message.to.some(value => !mailbox(value))) {
        throw new SmtpDeliveryError("SMTP_RECIPIENT_INVALID");
      }
      const recipients = [...new Set(message.to)];
      const key = createHash("sha256").update(message.providerIdempotencyKey).digest("hex");
      const domain = config.from.split("@")[1];
      try {
        const result = await sender.sendMail({
          from: config.from,
          to: recipients,
          replyTo: config.replyTo,
          subject: message.subject,
          text: message.body,
          messageId: `<ruf-${key}@${domain}>`,
          disableFileAccess: true,
          disableUrlAccess: true,
        });
        const accepted = new Set((result.accepted ?? []).map(value =>
          (typeof value === "string" ? value : value.address).toLowerCase()));
        if (result.rejected?.length || recipients.some(value => !accepted.has(value.toLowerCase()))) {
          throw new SmtpDeliveryError("SMTP_RECIPIENT_REJECTED");
        }
      } catch (error) {
        if (error instanceof SmtpDeliveryError) throw error;
        // Provider errors may include addresses, credentials and message content.
        throw new SmtpDeliveryError("SMTP_DELIVERY_FAILED");
      }
    },
  };
}
