import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { loadCalloutPreview } from "@/data/callout-preview.server";
import fs from "node:fs/promises";
import type { FigureDetail } from "@/types/catalog";
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("returns before touching fixture review files in API mode", async () => {
  vi.stubEnv("RUF_REPOSITORY_MODE", "api");
  vi.stubEnv("RUF_API_UPSTREAM_URL", "http://127.0.0.1:3999");
  vi.stubEnv("RUF_WEB_ORIGIN", "http://127.0.0.1:3199");
  const read = vi.spyOn(fs, "readFile");
  const detail = { figure: { id: "synthetic" } } as FigureDetail;
  expect(await loadCalloutPreview(detail)).toEqual({ detail, notice: null });
  expect(read).not.toHaveBeenCalled();
});
it("blocks direct and optimized fixture catalogue images in API mode while allowing branding", () => {
  vi.stubEnv("RUF_REPOSITORY_MODE", "api");
  vi.stubEnv("RUF_API_UPSTREAM_URL", "http://127.0.0.1:3999");
  vi.stubEnv("RUF_WEB_ORIGIN", "http://127.0.0.1:3199");
  for (const path of ["/drawings/ft3w/ft3w-cabin-6-1.png", "/review/figures/fig-cabin-6-1", "/_next/image?url=%2Fdrawings%2Fft3w%2Fft3w-cabin-6-1.png&w=640&q=75", "/_next/image?url=%2Fbrand%2F%252e%252e%252fdrawings%252ffoo.png&w=640&q=75"]) {
    const response = proxy(new NextRequest(`http://127.0.0.1:3199${path}`));
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  }
  expect(proxy(new NextRequest("http://127.0.0.1:3199/brand/header-logo.png")).headers.get("x-middleware-next")).toBe("1");
});
