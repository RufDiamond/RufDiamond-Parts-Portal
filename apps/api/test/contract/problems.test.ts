import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";

const config = {
  nodeEnv: "test" as const,
  port: 0,
  databaseUrl: "postgres://rufdiamond:rufdiamond@localhost:5432/rufdiamond",
  sessionSecret: "a-test-session-secret-that-is-long-enough",
  webOrigin: "http://localhost:3000",
  allowInsecureLoopbackCookie: false,
  deliveryEncryption: { activeKeyId: "test", keys: { test: Buffer.alloc(32, 1).toString("base64") } },
  s3: {
    endpoint: "http://localhost:9000",
    region: "us-east-1",
    bucket: "rufdiamond-test",
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
  },
};

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("problem responses", () => {
  it.each([
    ["malformed JSON", "application/json", '{"secret":"parser-input",'],
    ["unsupported content type", "application/x-unsupported", "parser-input"],
    ["empty JSON", "application/json", ""],
  ])("returns a safe client problem for %s", async (_scenario, contentType, payload) => {
    const app = await buildApp({ config });
    apps.push(app);
    app.post("/test/body", async () => ({ status: "ok" }));

    const response = await app.inject({ method: "POST", url: "/test/body", headers: { "content-type": contentType }, payload });
    const problem = response.json();

    expect(response.statusCode).toBe(400);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(problem).toMatchObject({ code: "INVALID_REQUEST", status: 400, title: "Invalid request", detail: "The request is invalid.", instance: "/test/body" });
    expect(response.headers["x-request-id"]).toBe(problem.requestId);
    expect(response.body).not.toMatch(/stack|Error:|parser-input|application\/x-unsupported/);
  });

  it.each(["invalid content length", "body exceeds limit"])("returns a safe client problem when %s", async scenario => {
    const app = await buildApp({ config });
    apps.push(app);
    app.post("/test/body", { bodyLimit: 128 }, async () => ({ status: "ok" }));
    const response = await app.inject({
      method: "POST", url: "/test/body",
      headers: { "content-type": "application/json", ...(scenario === "invalid content length" ? { "content-length": "1" } : {}) },
      payload: scenario === "invalid content length" ? "{}" : JSON.stringify({ value: "x".repeat(256) }),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "INVALID_REQUEST", status: 400, detail: "The request is invalid." });
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(response.headers["x-request-id"]).toBe(response.json().requestId);
    expect(response.body).not.toMatch(/stack|Error:|FST_ERR/);
  });

  it("keeps unknown exceptions generic even when they claim a client status", async () => {
    const app = await buildApp({ config });
    apps.push(app);
    app.get("/test/unexpected", async () => {
      throw Object.assign(new Error("SQL internal-secret"), { statusCode: 400, code: "UNEXPECTED_FAILURE" });
    });
    const response = await app.inject({ method: "GET", url: "/test/unexpected" });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ code: "INTERNAL_ERROR", status: 500, detail: "An unexpected error occurred." });
    expect(response.body).not.toMatch(/stack|SQL|internal-secret|UNEXPECTED_FAILURE/);
  });

  it("returns an RFC 9457 problem with the request ID for unknown routes", async () => {
    const app = await buildApp({ config });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/not-a-route" });
    const problem = response.json();

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(problem).toMatchObject({
      type: "https://rufdiamond.example/problems/not-found",
      title: "Not Found",
      status: 404,
      code: "ROUTE_NOT_FOUND",
    });
    expect(response.headers["x-request-id"]).toBe(problem.requestId);
  });

  it("returns a safe problem when schema input is invalid", async () => {
    const app = await buildApp({ config });
    apps.push(app);
    app.get("/test/validated", {
      schema: {
        querystring: {
          type: "object",
          required: ["quantity"],
          properties: { quantity: { type: "integer", minimum: 1 } },
        },
      },
    }, async () => ({ status: "ok" }));

    const response = await app.inject({ method: "GET", url: "/test/validated?quantity=nope" });
    const problem = response.json();

    expect(response.statusCode).toBe(400);
    expect(problem).toMatchObject({
      type: "https://rufdiamond.example/problems/invalid-request",
      title: "Invalid request",
      status: 400,
      code: "INVALID_REQUEST",
    });
    expect(JSON.stringify(problem)).not.toContain("stack");
    expect(JSON.stringify(problem)).not.toContain("Error:");
    expect(response.headers["x-request-id"]).toBe(problem.requestId);
  });
});
