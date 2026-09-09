// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { initialRequestState, requestReducer, RequestProvider, useRequest } from "@/state/RequestContext";
import type { MeResponse } from "@rufdiamond/contracts";
import { revalidateRequestIdentities, writeRequestIdentities } from "@/state/customer-request";
const session: MeResponse = { id: "user", companyId: "company", displayName: "Synthetic", capabilities: ["catalog.figure.view", "parts.record.view"], csrfToken: "synthetic", company: { id: "company", name: "Test", type: "customer", defaultShippingAddress: null }, scopes: { brandIds: "all", accountIds: "all", fleet: "all", environment: "published", priceTier: "none", scopeVersion: "1", canViewPrices: false } };
afterEach(() => { cleanup(); sessionStorage.clear(); vi.unstubAllGlobals(); });
function ReadRequest() {
  const state = useRequest();
  return <div>{state.linesHydrated ? `Ready: ${state.lines.map(line => line.descriptionSnapshot).join(",")}` : "Loading"}<span>{state.lastConfirmation?.reference}</span></div>;
}
it("never hydrates old unscoped price-bearing requests or fake confirmations in API mode", async () => {
  sessionStorage.setItem("rdpp:request:v1", JSON.stringify({ lines: [{ partId: "old", partNumberSnapshot: "P", descriptionSnapshot: "OLD PRIVATE PART", qty: 1, unitPriceSnapshot: 120, lineTotal: 120 }], currency: "CAD" }));
  sessionStorage.setItem("rdpp:last-request:v1", JSON.stringify({ reference: "FAKE CONFIRMED", lines: [] }));
  render(<RequestProvider apiSession={session}><ReadRequest /></RequestProvider>);
  await waitFor(() => expect(screen.getByText(/^Ready:/)).toBeTruthy());
  expect(screen.queryByText(/OLD PRIVATE PART/)).toBeNull();
  expect(screen.queryByText(/FAKE CONFIRMED/)).toBeNull();
});

it("persists only identities and quantities, never prices or descriptions", () => {
  writeRequestIdentities("request-test", [{ partId: "part", releasePartId: "release-part", qty: 2, descriptionSnapshot: "PRIVATE DESCRIPTION", partNumberSnapshot: "SECRET", unitPriceSnapshot: "12.40", lineTotal: 24.8 }]);
  expect(JSON.parse(sessionStorage.getItem("request-test")!)).toEqual([{ partId: "part", releasePartId: "release-part", qty: 2 }]);
});

it("replaces an API line snapshot with the revalidated release part, including omitted prices", () => {
  const part = { id: "part", releasePartId: "rp-old", partNumber: "P", description: "Old", manufacturer: null, currency: "CAD" as const, status: "active" as const, supersededByPartId: null, requires: [], listPrice: "12.40" };
  const before = requestReducer(initialRequestState, { type: "add", parts: [{ part }] });
  const { listPrice: omitted, ...current } = part;
  void omitted;
  const after = requestReducer(before, { type: "add", parts: [{ part: { ...current, releasePartId: "rp-new", description: "Current" }, qty: 2 }] });
  expect(after.lines).toEqual([{ partId: "part", releasePartId: "rp-new", partNumberSnapshot: "P", descriptionSnapshot: "Current", qty: 3 }]);
});

it("rejects an entire request refresh when activation changes a contributing model between parts", async () => {
  let reads = 0;
  const ids = ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002"];
  vi.stubGlobal("fetch", async () => {
    const id = ids[reads++];
    return Response.json({ items: [{ part: { id, releasePartId: `rp${reads}`, partNumber: "P", description: "Current part", manufacturer: null, currency: "CAD", status: "active", supersededByPartId: null, requires: [] }, figureId: "figure", groupNo: "A.1", assemblyName: "Current assembly", systemName: "Current system", modelName: "Current model", serial: "Serial" }], nextCursor: null, releases: [{ modelId: "model", releaseId: `release${reads}`, revision: reads }] });
  });
  await expect(revalidateRequestIdentities(ids.map((partId, i) => ({ partId, releasePartId: `rp${i + 1}`, qty: 1 })))).rejects.toThrow(/changed/);
});
