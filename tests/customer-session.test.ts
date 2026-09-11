import { afterEach, describe, expect, it, vi } from "vitest";
import { scopeKey, signInCustomer, clearCustomerStorage } from "@/state/customer-session";

afterEach(() => vi.unstubAllGlobals());
describe("customer identity boundary", () => {
  it("uses the actual identity endpoint and never navigates after denied credentials", async () => {
    const requests: [string, RequestInit | undefined][] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      requests.push([url, init]);
      return Response.json({ code: "INVALID_CREDENTIALS" }, { status: 401 });
    });
    await expect(signInCustomer("test", "synthetic-password")).rejects.toThrow();
    expect(requests[0][0]).toBe("/api/v1/auth/sign-in");
    expect(JSON.parse(String(requests[0][1]?.body))).toEqual({ loginId: "test", password: "synthetic-password" });
    expect(requests[0][1]?.cache).toBe("no-store");
  });
  it("changes scope identity for company, capabilities and price authority", () => {
    const base = { id: "user", companyId: "company", capabilities: ["catalog.figure.view"], scopes: { scopeVersion: "1", canViewPrices: true } };
    expect(scopeKey(base)).not.toBe(scopeKey({ ...base, companyId: "other" }));
    expect(scopeKey(base)).not.toBe(scopeKey({ ...base, capabilities: [] }));
    expect(scopeKey(base)).not.toBe(scopeKey({ ...base, scopes: { ...base.scopes, canViewPrices: false } }));
  });
  it("clears only portal state, including old price-bearing payloads", () => {
    const store = new Map([["rdpp:request:v1", "private"], ["rdpp:machine:v1", "private"], ["rdpp:recent-figures:v1", "private"], ["unrelated", "keep"]]);
    const storage = { get length() { return store.size; }, key: (i: number) => [...store.keys()][i], removeItem: (key: string) => store.delete(key) };
    clearCustomerStorage(storage);
    expect([...store.entries()]).toEqual([["unrelated", "keep"]]);
  });
});
