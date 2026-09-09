// Isolated HTTP contract fixture for the Next customer boundary, not Fastify/database proof.
import http from "node:http";
const ids = { model: "10000000-0000-4000-8000-000000000001", variant: "10000000-0000-4000-8000-000000000002", system: "10000000-0000-4000-8000-000000000003", figure: "10000000-0000-4000-8000-000000000004", part: "10000000-0000-4000-8000-000000000005", release: "10000000-0000-4000-8000-000000000006" };
const release = { modelId: ids.model, releaseId: ids.release, revision: 1 };
const model = { id: ids.model, productLineId: "line", name: "Synthetic machine", status: "active", catalogState: "live", updatedAt: null };
const variant = { id: ids.variant, modelId: ids.model, label: "Synthetic range", serialFrom: null, serialTo: null, catalogRevision: "R1" };
const system = { id: ids.system, name: "Synthetic system", sortOrder: 1 };
const figure = { id: ids.figure, variantId: ids.variant, systemId: ids.system, name: "Synthetic plate", groupNo: "A.1", drawingFileId: "drawing", status: "published" };
let priceAllowed = true;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:3299");
  const send = (value, status = 200) => { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(status >= 400 ? { type: "about:blank", title: "Synthetic unavailable", status, requestId: "synthetic-request", ...value } : value)); };
  let body = ""; for await (const chunk of req) body += chunk;
  if (url.pathname === "/__ready") return send({ ready: true });
  if (url.pathname === "/__reset" && req.method === "POST") { priceAllowed = true; return send({ reset: true }); }
  if (url.pathname === "/__scope" && req.method === "POST") { priceAllowed = !priceAllowed; return send({ changed: true }); }
  if (url.pathname === "/api/v1/auth/sign-in") {
    const input = JSON.parse(body);
    if (!["dealer", "technician"].includes(input.loginId) || input.password !== "synthetic-test-only") return send({ code: "INVALID_CREDENTIALS" }, 401);
    res.setHeader("set-cookie", `ruf-session-dev=${input.loginId}; Path=/; HttpOnly; SameSite=Lax`);
    return send({ csrfToken: "synthetic-csrf" });
  }
  const user = /ruf-session-dev=(dealer|technician)/.exec(req.headers.cookie ?? "")?.[1];
  if (!user) return send({ code: "AUTHENTICATION_REQUIRED" }, 401);
  if (url.pathname === "/api/v1/auth/sign-out") {
    if (req.headers["x-csrf-token"] !== "synthetic-csrf") return send({ code: "CSRF_REQUIRED" }, 403);
    res.setHeader("set-cookie", "ruf-session-dev=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    return send({ signedOut: true });
  }
  const priced = user === "dealer" && priceAllowed;
  if (url.pathname === "/api/v1/me") return send({ id: user, companyId: `${user}-company`, displayName: user, capabilities: ["catalog.model.view", "catalog.figure.view", "parts.record.view"], csrfToken: "synthetic-csrf", scopes: { brandIds: "all", accountIds: "all", fleet: "all", environment: "published", priceTier: priced ? "dealer" : "none", scopeVersion: priceAllowed ? "1" : "2", canViewPrices: priced }, company: { id: `${user}-company`, name: `${user} company`, type: "customer", defaultShippingAddress: null, ...(priced ? { discountRate: "0.100000" } : {}) } });
  const part = { id: ids.part, releasePartId: "released-part", partNumber: "SYN-PART", description: "Synthetic catalogue part", manufacturer: null, currency: "CAD", status: "active", supersededByPartId: null, requires: [], ...(priced ? { listPrice: "12.40" } : {}) };
  const usage = { part, figureId: ids.figure, groupNo: figure.groupNo, assemblyName: figure.name, systemName: system.name, modelName: model.name, serial: variant.label };
  const page = items => send({ items, nextCursor: null, releases: items.length ? [release] : [] });
  if (url.pathname.endsWith("/drawing")) return send({ code: "SOURCE_UNAVAILABLE" }, 409);
  if (url.pathname === `/api/v1/catalog/figures/${ids.figure}`) return send({ release, mapping: null, figure, system, variant, drawing: { id: "drawing", filename: "synthetic.png", format: "png", width: 100, height: 100, version: 1, contentUrl: `/api/v1/catalog/figures/${ids.figure}/drawing?releaseId=${ids.release}` }, rows: [{ figurePart: { id: "row", figureId: ids.figure, partId: ids.part, qty: 1, remarks: "* literal source remark", serviceable: true }, part, calloutNumbers: ["A*"] }], callouts: [{ id: "callout", figureId: ids.figure, figurePartId: "row", number: "A*", x: 10, y: 10, maskPath: null }] });
  if (url.pathname.endsWith("/product-lines")) return page([{ id: "line", name: "Fat Truck", manufacturer: null, country: null, isDistributed: false }]);
  if (url.pathname.endsWith("/models")) return page([model]);
  if (url.pathname.endsWith("/variants")) return page([variant]);
  if (url.pathname.endsWith("/systems")) return page([system]);
  if (url.pathname.endsWith("/figures")) return page([figure]);
  if (url.pathname.endsWith("/usages")) return page([usage, usage]);
  if (url.pathname.endsWith("/search")) return page([part]);
  if (url.pathname.endsWith("/usage-index")) { const { part: ignored, ...summary } = usage; void ignored; return page([{ partId: ids.part, summary: { ...summary, productLineName: "Fat Truck" } }]); }
  return send({ code: "CATALOGUE_UNAVAILABLE" }, 404);
});
server.listen(3299, "127.0.0.1");
