export type AppEnvironment = "development" | "test" | "production";

export interface AppConfig {
  nodeEnv: AppEnvironment;
  port: number;
  databaseUrl: string;
  sessionSecret: string;
  webOrigin: string;
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

  return {
    nodeEnv,
    port,
    databaseUrl,
    sessionSecret,
    webOrigin: validHttpUrl(required(environment, "WEB_ORIGIN"), "WEB_ORIGIN"),
    s3: {
      endpoint: validHttpUrl(required(environment, "S3_ENDPOINT"), "S3_ENDPOINT"),
      region: required(environment, "S3_REGION"),
      bucket: required(environment, "S3_BUCKET"),
      accessKeyId: required(environment, "S3_ACCESS_KEY_ID"),
      secretAccessKey: required(environment, "S3_SECRET_ACCESS_KEY"),
    },
  };
}
