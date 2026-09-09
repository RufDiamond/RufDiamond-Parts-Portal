import { CatalogApiError } from "./api-error";

const uuid = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const rules: { path: RegExp; method: string; query?: string[]; bytes?: number; publicWrite?: boolean; drawing?: boolean }[] = [
  { path: /^me$/, method: "GET" },
  { path: /^auth\/(sign-in|password-reset\/(request|complete))$/, method: "POST", bytes: 16384, publicWrite: true },
  { path: /^auth\/sign-out$/, method: "POST", bytes: 4096 },
  { path: /^catalog\/(product-lines|models|parts\/usage-index)$/, method: "GET", query: ["cursor", "limit"] },
  { path: /^catalog\/parts\/(search|usages)$/, method: "GET", query: ["q", "mode", "cursor", "limit"] },
  { path: new RegExp(`^catalog/(models/${uuid}/variants|variants/${uuid}/systems|variants/${uuid}/systems/${uuid}/figures|parts/${uuid}/usages)$`), method: "GET", query: ["cursor", "limit"] },
  { path: new RegExp(`^catalog/figures/${uuid}$`), method: "GET" },
  { path: new RegExp(`^catalog/figures/${uuid}/drawing$`), method: "GET", query: ["releaseId"], drawing: true },
  { path: /^admin\/publication\/queue$/, method: "GET", query: ["cursor", "limit"] },
  { path: /^admin\/publication\/releases$/, method: "POST", bytes: 16384 },
  { path: new RegExp(`^admin/publication/releases/${uuid}/(activate|rollback)$`), method: "POST", bytes: 4096 },
  { path: new RegExp(`^admin/figures/${uuid}/diagram-mapping$`), method: "GET" },
  { path: new RegExp(`^admin/figures/${uuid}/diagram-mapping$`), method: "PUT", bytes: 1024 * 1024 },
  { path: new RegExp(`^admin/figures/${uuid}/diagram-mapping/approve$`), method: "POST", bytes: 1024 * 1024 },
  { path: new RegExp(`^admin/figures/${uuid}/diagram-mapping/revisions$`), method: "GET", query: ["before"] },
  { path: new RegExp(`^admin/figures/${uuid}/diagram-mapping/revisions/${uuid}$`), method: "GET" },
  { path: new RegExp(`^admin/figures/${uuid}/drawing$`), method: "GET" },
  { path: new RegExp(`^admin/figures/${uuid}/drawing-uploads(?:/${uuid}/finalize)?$`), method: "POST", bytes: 4096 },
];

/** Raw path validation precedes URL normalization. No URLs, encoded path separators or aliases. */
export function allowedApiRoute(path: string, method: string) {
  const [pathname, search = "", extra] = path.split("?");
  if (extra !== undefined || !/^[a-zA-Z0-9/-]+$/.test(pathname)) throw new CatalogApiError(400, "INVALID_API_PATH");
  const rule = rules.find(rule => rule.method === method && rule.path.test(pathname));
  if (!rule) throw new CatalogApiError(404, "API_ROUTE_UNAVAILABLE");
  const query = new URLSearchParams(search);
  const seen = new Set<string>();
  for (const [key, value] of query) {
    if (!rule.query?.includes(key) || seen.has(key) || value.length > 4096 || /[\u0000-\u001f]/.test(value)) throw new CatalogApiError(400, "INVALID_API_QUERY");
    seen.add(key);
    if (key === "limit" && !/^(?:[1-9]|[1-9][0-9]|100)$/.test(value)) throw new CatalogApiError(400, "INVALID_API_QUERY");
    if (key === "before" && (!/^[1-9][0-9]*$/.test(value) || Number(value) > 2147483647)) throw new CatalogApiError(400, "INVALID_API_QUERY");
    if (key === "mode" && !["any", "part", "description"].includes(value)) throw new CatalogApiError(400, "INVALID_API_QUERY");
    if (key === "releaseId" && !new RegExp(`^${uuid}$`).test(value)) throw new CatalogApiError(400, "INVALID_API_QUERY");
  }
  if (rule.drawing && !query.has("releaseId")) throw new CatalogApiError(400, "RELEASE_REQUIRED");
  return rule;
}
