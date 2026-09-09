import { afterEach, describe, expect, it, vi } from "vitest";
import { createBackendTransport, proxyBackendRequest } from "@/lib/backend-transport.server";
import { loadFrontendBackendConfig } from "@/lib/backend-config.server";
import { handleBackendApiRequest } from "@/lib/backend-api.server";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const config = { upstream: "http://127.0.0.1:3201", webOrigin: "http://127.0.0.1:3200" };
const request = (path: string, init?: RequestInit) => new Request(`${config.webOrigin}/api/v1/${path}`, init);

describe("authenticated upstream boundary", () => {
  it("keeps the actual route dormant in fixture mode and hides configuration failures", async () => {
    vi.stubEnv("RUF_REPOSITORY_MODE", "fixture"); vi.stubEnv("RUF_DEPLOYMENT_ENV", "local");
    const fetcher = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", fetcher);
    expect((await handleBackendApiRequest(request("me"))).status).toBe(404);
    vi.stubEnv("RUF_REPOSITORY_MODE", "api");
    vi.stubEnv("RUF_API_UPSTREAM_URL", "https://user:secret@upstream.example");
    const invalid = await handleBackendApiRequest(request("me"));
    expect(invalid.status).toBe(503);
    expect(await invalid.text()).not.toContain("upstream.example");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("routes explicit API mode through the fixed server upstream with preserved sign-in cookie", async () => {
    vi.stubEnv("RUF_REPOSITORY_MODE", "api"); vi.stubEnv("RUF_DEPLOYMENT_ENV", "local");
    vi.stubEnv("RUF_API_UPSTREAM_URL", config.upstream); vi.stubEnv("RUF_WEB_ORIGIN", config.webOrigin);
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      expect(url).toBe("http://127.0.0.1:3201/api/v1/auth/sign-in");
      expect(init?.cache).toBe("no-store");
      return Response.json({ csrfToken: "synthetic-csrf" }, { headers: { "set-cookie": "ruf-session-dev=opaque; HttpOnly; Path=/; SameSite=Lax" } });
    });
    vi.stubGlobal("fetch", fetcher);
    const response = await handleBackendApiRequest(request("auth/sign-in", { method: "POST", headers: { origin: config.webOrigin, "content-type": "application/json" }, body: JSON.stringify({ loginId: "synthetic", password: "synthetic" }) }));
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual(["ruf-session-dev=opaque; HttpOnly; Path=/; SameSite=Lax"]);
    expect(await response.json()).toEqual({ csrfToken: "synthetic-csrf" });
  });
  it("allows only a release-pinned HTTPS storage redirect without fetching it", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 302, headers: { location: "https://storage.example/synthetic?versionId=pinned" } }));
    const response = await proxyBackendRequest(request("catalog/figures/00000000-0000-4000-8000-000000000001/drawing?releaseId=00000000-0000-4000-8000-000000000002"), config, fetcher);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://storage.example/synthetic?versionId=pinned");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("bounds chunked request bodies without Content-Length and cancels excess data", async () => {
    let cancelled = false;
    const body = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(4096)); }, cancel() { cancelled = true; } });
    const fetcher = vi.fn<typeof fetch>();
    const streamed = request("auth/sign-in", { method: "POST", headers: { origin: config.webOrigin, "content-type": "application/json" }, body, duplex: "half" } as RequestInit & { duplex: string });
    expect((await proxyBackendRequest(streamed, config, fetcher)).status).toBe(413);
    expect(cancelled).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("checks Origin on direct server transport writes too", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(createBackendTransport(config, fetcher)("auth/sign-in", new Headers({ origin: "https://foreign.example", "content-type": "application/json" }), { method: "POST", body: new TextEncoder().encode("{}") })).rejects.toMatchObject({ status: 403 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("cancels disconnected request reads before contacting the API", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const controller = new AbortController(); controller.abort();
    const response = await proxyBackendRequest(request("auth/sign-in", { method: "POST", signal: controller.signal, headers: { origin: config.webOrigin, "content-type": "application/json" }, body: "{}" }), config, fetcher);
    expect(response.status).toBe(408);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("treats an oversized upstream body as an upstream failure", async () => {
    const response = await proxyBackendRequest(request("me"), config, async () => new Response("a".repeat(8 * 1024 * 1024 + 1), { headers: { "content-type": "application/json" } }));
    expect(response.status).toBe(502);
  });
  it("requires explicit connected mode and exact trusted server origins", () => {
    expect(loadFrontendBackendConfig({})).toBeNull();
    expect(() => loadFrontendBackendConfig({ RUF_REPOSITORY_MODE: "other" })).toThrow();
    expect(() => loadFrontendBackendConfig({ RUF_DEPLOYMENT_ENV: "staging" })).toThrow();
    expect(() => loadFrontendBackendConfig({ RUF_REPOSITORY_MODE: "api" })).toThrow();
    const environment = { RUF_REPOSITORY_MODE: "api", RUF_API_UPSTREAM_URL: config.upstream, RUF_WEB_ORIGIN: config.webOrigin };
    expect(loadFrontendBackendConfig(environment)).toEqual(config);
    for (const origin of ["http://public.example", "https://user:secret@private.example", "https://api.example/path", "https://api.example?secret=private", "https://*.example"]) {
      expect(() => loadFrontendBackendConfig({ ...environment, RUF_API_UPSTREAM_URL: origin })).toThrow();
      expect(() => loadFrontendBackendConfig({ ...environment, RUF_WEB_ORIGIN: origin })).toThrow();
    }
  });
  it("blocks foreign origins before forwarding credentials", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await proxyBackendRequest(request("auth/sign-in", { method: "POST", headers: { origin: "https://foreign.example", "content-type": "application/json" }, body: "{}" }), config, fetcher);
    expect(result.status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["https://evil.example", "catalog/../me", "admin/accounts", "catalog/models?url=https://evil.example", "catalog/models?limit=101", "me?x=1"]) ("rejects non-allowlisted path/query %s", async path => {
    const transport = createBackendTransport(config, vi.fn());
    await expect(transport(path, new Headers())).rejects.toThrow();
  });
  it("forwards session cookies only and keeps separate Set-Cookie attributes", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("cookie")).toBe("ruf-session-dev=opaque");
      expect(headers.has("authorization")).toBe(false);
      expect(headers.has("x-forwarded-host")).toBe(false);
      expect(init?.redirect).toBe("manual");
      expect(init?.cache).toBe("no-store");
      const response = Response.json({ csrfToken: "csrf" });
      response.headers.append("set-cookie", "ruf-session-dev=next; HttpOnly; SameSite=Lax; Path=/");
      response.headers.append("set-cookie", "__Host-ruf-session=; Max-Age=0; Secure; HttpOnly; SameSite=Lax; Path=/");
      return response;
    });
    const result = await proxyBackendRequest(request("auth/sign-in", { method: "POST", headers: { origin: config.webOrigin, "content-type": "application/json", cookie: "irrelevant=private; ruf-session-dev=opaque", authorization: "private", "x-forwarded-host": "evil" }, body: "{}" }), config, fetcher);
    expect(result.status).toBe(200);
    expect(result.headers.getSetCookie()).toEqual(["ruf-session-dev=next; HttpOnly; SameSite=Lax; Path=/", "__Host-ruf-session=; Max-Age=0; Secure; HttpOnly; SameSite=Lax; Path=/"]);
    expect(result.headers.get("cache-control")).toBe("private, no-store");
  });
  it("rejects missing CSRF, duplicate queries, unsafe redirects and oversized streams", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const missing = await proxyBackendRequest(request("auth/sign-out", { method: "POST", headers: { origin: config.webOrigin, "content-type": "application/json" }, body: "{}" }), config, fetcher);
    expect(missing.status).toBe(403);
    const duplicate = await proxyBackendRequest(request("catalog/models?limit=1&limit=2"), config, fetcher);
    expect(duplicate.status).toBe(400);
    const large = await proxyBackendRequest(request("auth/sign-in", { method: "POST", headers: { origin: config.webOrigin, "content-type": "application/json" }, body: "a".repeat(17_000) }), config, fetcher);
    expect(large.status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
    const redirected = await proxyBackendRequest(request("me"), config, async () => new Response(null, { status: 302, headers: { location: "https://evil.example" } }));
    expect(redirected.status).toBe(502);
  });
  it("rejects malformed auth bodies and extra sensitive response fields", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ csrfToken: "token", passwordHash: "must-not-escape" }));
    const response = await proxyBackendRequest(request("auth/sign-in", { method: "POST", headers: { origin: config.webOrigin, "content-type": "application/json" }, body: JSON.stringify({ loginId: "test", password: "private" }) }), config, fetcher);
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("must-not-escape");
  });
  it("rejects a foreign Referer, including when its Origin is correct", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const response = await proxyBackendRequest(request("auth/sign-in", { method: "POST", headers: { origin: config.webOrigin, referer: "https://foreign.example/path", "content-type": "application/json" }, body: "{}" }), config, fetcher);
    expect(response.status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
