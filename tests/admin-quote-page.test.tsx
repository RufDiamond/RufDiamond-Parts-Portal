// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeResponse } from "@rufdiamond/contracts";

const requireCustomerSession = vi.fn();
const getAdminQuoteRecords = vi.fn();

vi.mock("@/lib/customer-session.server", () => ({
  requireCustomerSession: () => requireCustomerSession(),
}));

vi.mock("@/data/quote-status.server", () => ({
  getAdminQuoteRecords: () => getAdminQuoteRecords(),
  fixtureQuoteRecords: [{ factoryPrice: "9999.00", customerPrice: "1111.00" }],
}));

vi.mock("@/app/(portal)/quotes/admin/AdminQuoteStatus", () => ({
  AdminQuoteStatus: ({ seed }: { seed: unknown[]; today: string }) => (
    <div data-testid="admin-quote-status" data-seed={JSON.stringify(seed)}>
      AdminQuoteStatus
    </div>
  ),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import AdminQuotesPage from "@/app/(portal)/quotes/admin/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function customerSession(capabilities: string[]): MeResponse {
  // A complete session, typed rather than cast: only `capabilities` matters to
  // the page, but a partial object cast to MeResponse fails `next build`.
  return {
    id: "user-1",
    companyId: "co-demo",
    displayName: "Demo",
    capabilities,
    csrfToken: "csrf-test",
    company: { id: "co-demo", name: "Demo Co", type: "dealer", defaultShippingAddress: null, discountRate: "0.100000" },
    scopes: { brandIds: "all", accountIds: "all", fleet: "all", environment: "published", priceTier: "list", scopeVersion: "1", canViewPrices: true },
  };
}

describe("/quotes/admin authorization", () => {
  beforeEach(() => {
    getAdminQuoteRecords.mockResolvedValue([{ factoryPrice: "6900.00" }]);
  });

  it("denies anonymous fixture access without loading admin quote fixtures", async () => {
    requireCustomerSession.mockResolvedValue(null);
    const ui = await AdminQuotesPage();
    render(ui);

    expect(screen.queryByTestId("admin-quote-status")).toBeNull();
    expect(screen.getByRole("heading", { name: /quote status — ruf diamond/i })).toBeTruthy();
    expect(screen.getByText(/quote capability is required/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /sign in/i }).getAttribute("href")).toBe("/signin");
    expect(getAdminQuoteRecords).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/6900|9999|Factory Price \(CAD\)/i);
  });

  it("denies signed-in customers without orders.quote and never serializes factory cost data", async () => {
    requireCustomerSession.mockResolvedValue(
      customerSession(["catalog.model.view", "catalog.figure.view", "parts.record.view", "orders.submit"]),
    );
    const ui = await AdminQuotesPage();
    render(ui);

    expect(screen.queryByTestId("admin-quote-status")).toBeNull();
    expect(screen.getByText(/quote capability is required/i)).toBeTruthy();
    expect(getAdminQuoteRecords).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/6900|factoryPrice|Factory Price \(CAD\)/i);
  });

  it("renders AdminQuoteStatus only for verified staff with orders.quote and empty seed", async () => {
    requireCustomerSession.mockResolvedValue(
      customerSession(["catalog.model.view", "catalog.figure.view", "parts.record.view", "orders.quote"]),
    );
    const ui = await AdminQuotesPage();
    render(ui);

    const admin = screen.getByTestId("admin-quote-status");
    expect(admin).toBeTruthy();
    expect(admin.getAttribute("data-seed")).toBe("[]");
    expect(getAdminQuoteRecords).not.toHaveBeenCalled();
  });
});
