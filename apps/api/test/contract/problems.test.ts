import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";

const config = {
  nodeEnv: "test" as const,
  port: 0,
  databaseUrl: "postgres://rufdiamond:rufdiamond@localhost:5432/rufdiamond",
  sessionSecret: "a-test-session-secret-that-is-long-enough",
  webOrigin: "http://localhost:3000",
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
