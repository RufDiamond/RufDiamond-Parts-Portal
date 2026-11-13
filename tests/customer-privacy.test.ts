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

it("maps the signed-in Fat Truck preview to the exact artwork served by its private route", async () => {
  vi.stubEnv("RUF_REPOSITORY_MODE", "api");
  vi.stubEnv("RUF_API_UPSTREAM_URL", "http://127.0.0.1:3999");
  vi.stubEnv("RUF_WEB_ORIGIN", "http://127.0.0.1:3199");
  const { getFatTruckPreviewFigure } = await import("@/data/fat-truck-preview.server");
  const { buildDiagramRegions, buildDrawingMarkers } = await import("@/lib/drawing");
  const detail = await getFatTruckPreviewFigure("fig-filters-1-1", false);
  expect(detail.drawing?.storagePath).toBe("/api/fat-truck-preview/fig-filters-1-1/drawing");
  const markers = buildDrawingMarkers(detail.rows, detail.callouts);
  expect(markers.map(marker => marker.number)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(buildDiagramRegions(detail.rows, detail.callouts, detail.drawing)?.occurrences).toHaveLength(6);
  expect(detail.rows.every(row => row.part.listPrice === undefined)).toBe(true);
});

it("uses the matching corrected plate and withholds a figure with unresolved references", async () => {
  const { getFatTruckPreviewFigure, readFatTruckPreviewDrawing } = await import("@/data/fat-truck-preview.server");
  const { buildDrawingMarkers } = await import("@/lib/drawing");
  const bumper = await getFatTruckPreviewFigure("fig-frame-assy-2-1", true);
  const png = await readFatTruckPreviewDrawing(bumper.figure.id);
  expect(bumper.drawing?.id).toMatch(/-source-review$/);
  expect(png?.equals(await fs.readFile("public/drawings/ft3w/review-source-20260908/ft3w-frame-assy-2-1.png"))).toBe(true);
  const bumperMarkers = buildDrawingMarkers(bumper.rows, bumper.callouts);
  expect(bumperMarkers.filter(marker => marker.number === 4)).toHaveLength(2);

  const seat = await getFatTruckPreviewFigure("fig-cabin-6-13", true);
  expect(seat.mappingNotice).toContain("unresolved source conflict");
  expect(buildDrawingMarkers(seat.rows, seat.callouts)).toHaveLength(0);
});
