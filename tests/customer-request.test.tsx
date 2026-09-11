// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { initialRequestState, requestReducer, RequestProvider, useRequest } from "@/state/RequestContext";
import type { MeResponse } from "@rufdiamond/contracts";
import { revalidateRequestIdentities, writeRequestIdentities } from "@/state/customer-request";
import { scopeKey } from "@/state/customer-session";
import { MachineProvider } from "@/state/MachineContext";
import { QuoteRequest } from "@/app/(portal)/request/QuoteRequest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const session: MeResponse = { id: "user", companyId: "company", displayName: "Synthetic", capabilities: ["catalog.figure.view", "parts.record.view"], csrfToken: "synthetic", company: { id: "company", name: "Test", type: "customer", defaultShippingAddress: null }, scopes: { brandIds: "all", accountIds: "all", fleet: "all", environment: "published", priceTier: "none", scopeVersion: "1", canViewPrices: false } };
afterEach(() => { cleanup(); sessionStorage.clear(); vi.unstubAllGlobals(); });
function ReadRequest() {
  const state = useRequest();
  return <div>{state.linesHydrated ? `Ready: ${state.lines.map(line => line.descriptionSnapshot).join(",")}` : "Loading"}<span>{state.lastConfirmation?.reference}</span></div>;
}
const currentPart = { id: "10000000-0000-4000-8000-000000000002", releasePartId: "rp-current", partNumber: "CURRENT", description: "Current authorized addition", manufacturer: null, currency: "CAD" as const, status: "active" as const, supersededByPartId: null, requires: [] };
function AddCurrentPart() {
  const { addParts } = useRequest();
  return <button onClick={() => { void addParts([{ part: currentPart }]); }}>Add current part</button>;
}
const usageResponse = (part = currentPart) => Response.json({ items: [{ part, figureId: "figure", groupNo: "A.1", assemblyName: "Assembly", systemName: "System", modelName: "Model", serial: "Range" }], nextCursor: null, releases: [{ modelId: "model", releaseId: "release", revision: 1 }] });
const recoveryTree = () => <MachineProvider persist={false}><RequestProvider apiSession={session}><AddCurrentPart /><QuoteRequest usage={{}} /></RequestProvider></MachineProvider>;
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

it("retains saved identities after transient failure and retries into current authorized quote lines", async () => {
  const partId = "10000000-0000-4000-8000-000000000001";
  const key = `rdpp:api-request:${scopeKey(session)}`;
  const saved = JSON.stringify([{ partId, releasePartId: "rp", qty: 2 }]);
  sessionStorage.setItem(key, saved);
  vi.stubGlobal("fetch", async () => new Response(null, { status: 503 }));
  render(<MachineProvider persist={false}><RequestProvider apiSession={session}><QuoteRequest usage={{}} /></RequestProvider></MachineProvider>);
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  expect(sessionStorage.getItem(key)).toBe(saved);
  expect(screen.queryByText("Nothing in the request list")).toBeNull();
  expect(screen.queryByText("Current authorized part")).toBeNull();
  vi.stubGlobal("fetch", async () => Response.json({ items: [{ part: { id: partId, releasePartId: "rp", partNumber: "P", description: "Current authorized part", manufacturer: null, currency: "CAD", status: "active", supersededByPartId: null, requires: [] }, figureId: "figure", groupNo: "A.1", assemblyName: "Current assembly", systemName: "System", modelName: "Model", serial: "Range" }], nextCursor: null, releases: [{ modelId: "model", releaseId: "release", revision: 1 }] }));
  fireEvent.click(screen.getByRole("button", { name: /retry/i }));
  await waitFor(() => expect(screen.getByText("Current authorized part")).toBeTruthy());
  expect(screen.queryByRole("alert")).toBeNull();
  expect(sessionStorage.getItem(key)).toBe(saved);
});

it("requires explicit discard of an unavailable saved release before current additions can proceed", async () => {
  const key = `rdpp:api-request:${scopeKey(session)}`;
  const saved = JSON.stringify([{ partId: "10000000-0000-4000-8000-000000000001", releasePartId: "rp-unavailable", qty: 2 }]);
  sessionStorage.setItem(key, saved);
  vi.stubGlobal("fetch", async () => Response.json({ items: [], nextCursor: null, releases: [] }));
  render(recoveryTree());
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Add current part" }));
  expect(sessionStorage.getItem(key)).toBe(saved);
  expect(screen.queryByText("Current authorized addition")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Discard saved request" }));
  await screen.findByText("Nothing in the request list");
  expect(sessionStorage.getItem(key)).toBe("[]");
  vi.stubGlobal("fetch", async () => usageResponse());
  fireEvent.click(screen.getByRole("button", { name: "Add current part" }));
  await screen.findByText("Current authorized addition");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(JSON.parse(sessionStorage.getItem(key)!)).toEqual([{ partId: currentPart.id, releasePartId: "rp-current", qty: 1 }]);
});

it.each(["success", "failure"])("ignores late hydration %s after explicit discard and a current addition", async outcome => {
  const oldId = "10000000-0000-4000-8000-000000000001";
  const key = `rdpp:api-request:${scopeKey(session)}`;
  sessionStorage.setItem(key, JSON.stringify([{ partId: oldId, releasePartId: "rp-old", qty: 2 }]));
  vi.stubGlobal("fetch", async () => new Response(null, { status: 503 }));
  render(recoveryTree()); await screen.findByRole("alert");
  let complete!: (response: Response) => void;
  vi.stubGlobal("fetch", (url: string) => url.includes(oldId) ? new Promise<Response>(resolve => { complete = resolve; }) : Promise.resolve(usageResponse()));
  fireEvent.click(screen.getByRole("button", { name: "Retry saved request" }));
  fireEvent.click(screen.getByRole("button", { name: "Discard saved request" }));
  await screen.findByText("Nothing in the request list");
  fireEvent.click(screen.getByRole("button", { name: "Add current part" }));
  await screen.findByText("Current authorized addition");
  await act(async () => complete(outcome === "success" ? usageResponse({ ...currentPart, id: oldId, releasePartId: "rp-old", description: "Discarded old snapshot" }) : new Response(null, { status: 503 })));
  expect(screen.queryByText("Discarded old snapshot")).toBeNull();
  expect(screen.getByText("Current authorized addition")).toBeTruthy();
  expect(JSON.parse(sessionStorage.getItem(key)!)).toEqual([{ partId: currentPart.id, releasePartId: "rp-current", qty: 1 }]);
});

it("settles an addition only after current authorized lines and identity storage commit", async () => {
  const part = { id: "10000000-0000-4000-8000-000000000001", releasePartId: "rp", partNumber: "P", description: "Authorized", manufacturer: null, currency: "CAD" as const, status: "active" as const, supersededByPartId: null, requires: [] };
  let complete!: (response: Response) => void;
  vi.stubGlobal("fetch", () => new Promise<Response>(resolve => { complete = resolve; }));
  const hook = renderHook(useRequest, { wrapper: ({ children }) => <RequestProvider apiSession={session}>{children}</RequestProvider> });
  await waitFor(() => expect(hook.result.current.linesHydrated).toBe(true));
  let addition!: Promise<boolean>;
  act(() => { addition = hook.result.current.addParts([{ part }]); });
  expect(addition).toBeInstanceOf(Promise);
  expect(hook.result.current.lines).toEqual([]);
  await act(async () => complete(Response.json({ items: [{ part, figureId: "figure", groupNo: "A.1", assemblyName: "Assembly", systemName: "System", modelName: "Model", serial: "Range" }], nextCursor: null, releases: [{ modelId: "model", releaseId: "release", revision: 1 }] })));
  expect(await addition).toBe(true);
  expect(hook.result.current.lines[0].descriptionSnapshot).toBe("Authorized");
  expect(JSON.parse(sessionStorage.getItem(`rdpp:api-request:${scopeKey(session)}`)!)).toEqual([{ partId: part.id, releasePartId: "rp", qty: 1 }]);
});

it("does not report success or persist an addition after its identity provider unmounts", async () => {
  const part = { id: "10000000-0000-4000-8000-000000000001", releasePartId: "rp", partNumber: "P", description: "Authorized", manufacturer: null, currency: "CAD" as const, status: "active" as const, supersededByPartId: null, requires: [] };
  let complete!: (response: Response) => void;
  vi.stubGlobal("fetch", () => new Promise<Response>(resolve => { complete = resolve; }));
  const hook = renderHook(useRequest, { wrapper: ({ children }) => <RequestProvider apiSession={session}>{children}</RequestProvider> });
  await waitFor(() => expect(hook.result.current.linesHydrated).toBe(true));
  let addition!: Promise<boolean>;
  act(() => { addition = hook.result.current.addParts([{ part }]); });
  hook.unmount();
  complete(Response.json({ items: [{ part, figureId: "figure", groupNo: "A.1", assemblyName: "Assembly", systemName: "System", modelName: "Model", serial: "Range" }], nextCursor: null, releases: [{ modelId: "model", releaseId: "release", revision: 1 }] }));
  expect(await addition).toBe(false);
  expect(sessionStorage.getItem(`rdpp:api-request:${scopeKey(session)}`)).toBe("[]");
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
