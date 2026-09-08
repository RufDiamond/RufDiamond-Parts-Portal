export type AppEnvironment = "development" | "test" | "production";

export interface AppConfig {
  nodeEnv: AppEnvironment;
  port: number;
  databaseUrl: string;
  sessionSecret: string;
  webOrigin: string;
  allowInsecureLoopbackCookie: boolean;
  deliveryEncryption: {
    activeKeyId: string;
    keys: Readonly<Record<string, string>>;
  };
  s3: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
}

type Environment = Record<string, string | undefined>;

function required(environment: Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`Missing required configuration: ${name}`);
  }
  return value;
}

function validUrl(value: string, name: string): string {
  try {
    new URL(value);
    return value;
  } catch {
    throw new Error(`Invalid URL configuration: ${name}`);
  }
}

function validHttpUrl(value: string, name: string): string {
  const url = validUrl(value, name);
  const protocol = new URL(url).protocol;
  if (protocol !== "http:" && protocol !== "https:") {
    throw new Error(`${name} must use the http or https protocol`);
  }
  return url;
}

function validOrigin(value: string): string {
  const parsed = new URL(validHttpUrl(value, "WEB_ORIGIN"));
  if (value !== parsed.origin || parsed.username || parsed.password || parsed.hostname.includes("*")) {
    throw new Error("WEB_ORIGIN must be an exact origin without path, query, credentials, or wildcard host");
  }
  return value;
}

function deliveryEncryption(environment: Environment) {
  const activeKeyId = required(environment, "DELIVERY_ENCRYPTION_KEY_ID");
  let candidate: unknown;
  try { candidate = JSON.parse(required(environment, "DELIVERY_ENCRYPTION_KEYS_JSON")); }
  catch { throw new Error("DELIVERY_ENCRYPTION_KEYS_JSON must be a JSON object of canonical base64 keys"); }
  if (!candidate || Array.isArray(candidate) || typeof candidate !== "object") {
    throw new Error("DELIVERY_ENCRYPTION_KEYS_JSON must be a JSON object of canonical base64 keys");
  }
  const keys = candidate as Record<string, unknown>;
  for (const [keyId, encoded] of Object.entries(keys)) {
    if (!keyId || typeof encoded !== "string") throw new Error("Delivery encryption keys must have non-empty IDs and canonical base64 values");
    const decoded = Buffer.from(encoded, "base64");
    if (decoded.length !== 32 || decoded.toString("base64") !== encoded) {
      throw new Error("Each delivery encryption key must be a canonical base64-encoded 32-byte value");
    }
  }
  if (typeof keys[activeKeyId] !== "string") throw new Error("DELIVERY_ENCRYPTION_KEY_ID must identify a configured key");
  return { activeKeyId, keys: keys as Readonly<Record<string, string>> };
}

export function loadConfig(environment: Environment): AppConfig {
  const nodeEnv = required(environment, "NODE_ENV");
  if (nodeEnv !== "development" && nodeEnv !== "test" && nodeEnv !== "production") {
    throw new Error("NODE_ENV must be development, test, or production");
  }

  const portText = required(environment, "PORT");
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  const databaseUrl = validUrl(required(environment, "DATABASE_URL"), "DATABASE_URL");
  if (new URL(databaseUrl).protocol !== "postgres:" && new URL(databaseUrl).protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres or postgresql protocol");
  }

  const sessionSecret = required(environment, "SESSION_SECRET");
  if (sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters");
  }

  const webOrigin = validOrigin(required(environment, "WEB_ORIGIN"));
  const allowInsecureLoopbackCookie = environment.ALLOW_INSECURE_LOOPBACK_COOKIE === "true";
  if (environment.ALLOW_INSECURE_LOOPBACK_COOKIE !== undefined && environment.ALLOW_INSECURE_LOOPBACK_COOKIE !== "true" && environment.ALLOW_INSECURE_LOOPBACK_COOKIE !== "false") {
    throw new Error("ALLOW_INSECURE_LOOPBACK_COOKIE must be true or false");
  }
  if (allowInsecureLoopbackCookie) {
    const origin = new URL(webOrigin);
    if (nodeEnv !== "development" || origin.protocol !== "http:" || !["localhost", "127.0.0.1", "::1"].includes(origin.hostname)) {
      throw new Error("Insecure cookies require explicit development mode with an HTTP loopback WEB_ORIGIN");
    }
  }

  return {
    nodeEnv,
    port,
    databaseUrl,
    sessionSecret,
    webOrigin,
    allowInsecureLoopbackCookie,
    deliveryEncryption: deliveryEncryption(environment),
    s3: {
      endpoint: validHttpUrl(required(environment, "S3_ENDPOINT"), "S3_ENDPOINT"),
      region: required(environment, "S3_REGION"),
      bucket: required(environment, "S3_BUCKET"),
      accessKeyId: required(environment, "S3_ACCESS_KEY_ID"),
      secretAccessKey: required(environment, "S3_SECRET_ACCESS_KEY"),
    },
  };
}
