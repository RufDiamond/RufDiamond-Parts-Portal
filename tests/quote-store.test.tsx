// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DEMO_COMPANY } from "@/data/accounts";
import { fixtureQuoteRecords } from "@/data/quote-status.server";
import { mergeCustomerLines, toCustomerQuoteLines } from "@/lib/quote-status";
import { buildQuoteRecords, notifyCustomers, saveQuoteRecords } from "@/state/quote-store";
import { RequestProvider } from "@/state/RequestContext";
import { QuoteStatus } from "@/app/(portal)/quotes/QuoteStatus";
import type { QuoteStatusRecord } from "@/types/quotes";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); });

const TODAY = "2026-10-13";
const serverLines = () => toCustomerQuoteLines(fixtureQuoteRecords, DEMO_COMPANY.id, TODAY);

function submitted(quoteNo: string, parts: string[]): QuoteStatusRecord[] {
  return buildQuoteRecords({
    quoteNo,
    companyId: DEMO_COMPANY.id,
    customer: DEMO_COMPANY.name,
    productLine: "Fat Truck",
    requested: parts.map((partNumber) => ({ partId: null, partNumber, description: `Part ${partNumber}`, qty: 2 })),
    usage: {},
  });
}

it("a submitted request waits in Quote Status with nothing filled in (14 Oct, answer 3)", () => {
  const records = submitted("RD-00100", ["11-00001", "11-00002"]);
  const lines = toCustomerQuoteLines(records, DEMO_COMPANY.id, TODAY);
  expect(lines).toHaveLength(2);
  for (const line of lines) {
    expect(line.response).toBeNull();
    expect(line.orderable).toBeNull();
  }
});

it("notifying sends one notice per quote, however many lines it releases (follow-up A)", () => {
  const five = submitted("RD-00100", ["11-00001", "11-00002", "11-00003", "11-00004", "11-00005"]);
  const other = submitted("RD-00101", ["11-00009"]);
  const notices = notifyCustomers([...five, ...other], TODAY);

  expect(notices).toHaveLength(2);
  expect(notices.find((notice) => notice.quoteNo === "RD-00100")?.lineIds).toHaveLength(5);
  // Released lines are dated the day they were notified.
  const stored = JSON.parse(localStorage.getItem("rdpp:quote-records:v1")!);
  expect(stored[five[0].id]).toMatchObject({ notifyCustomer: true, responseDate: TODAY });
});

it("stored records replace the server's copy of the same line rather than duplicating it", () => {
  const answered = { ...fixtureQuoteRecords.find((record) => record.id === "qs-0007-1")!, available: "yes" as const,
    customerPrice: "12.00", newQty: 10, notifyCustomer: true };
  const merged = mergeCustomerLines(serverLines(), [answered], DEMO_COMPANY.id, TODAY);
  expect(merged.filter((line) => line.id === "qs-0007-1")).toHaveLength(1);
  expect(merged.find((line) => line.id === "qs-0007-1")?.response?.unitPrice).toBe("12.00");
});

it("an expired quote can be requested again from its own line (14 Oct, answer 5)", () => {
  render(<RequestProvider company={DEMO_COMPANY}><QuoteStatus lines={serverLines()} today={TODAY} /></RequestProvider>);
  // RD-00003 was requested 2 Sep: valid until 2 Oct, so it has expired by 13 Oct.
  const before = screen.getAllByText("RD-00003").length;
  fireEvent.click(screen.getByRole("button", { name: "Request new quote" }));

  expect(screen.getByRole("status").textContent).toMatch(/New quote .+ requested for 62-00184/);
  // The new request is listed, waiting for the factory; the expired line stays as a record.
  expect(screen.getAllByText("RD-00003")).toHaveLength(before);
  expect(screen.getAllByText("Awaiting RUF Diamond’s response").length).toBeGreaterThanOrEqual(2);
});

it("lines released since the customer last looked are marked New", () => {
  const records = submitted("RD-00100", ["11-00001"]).map((record) => ({ ...record, available: "yes" as const, customerPrice: "40.00" }));
  saveQuoteRecords(records);
  notifyCustomers(records, TODAY);

  render(<RequestProvider company={DEMO_COMPANY}><QuoteStatus lines={serverLines()} today={TODAY} /></RequestProvider>);
  expect(screen.getByText("New")).toBeTruthy();
  expect(screen.getByText(/RUF Diamond has answered 1 quoted line/)).toBeTruthy();
});

it("keeps New marked while the customer is on the page, even under React's development double-mount", async () => {
  const records = submitted("RD-00100", ["11-00001"]).map((record) => ({ ...record, available: "yes" as const, customerPrice: "40.00" }));
  saveQuoteRecords(records);
  notifyCustomers(records, TODAY);
  const seen = () => JSON.parse(localStorage.getItem("rdpp:quote-notices:v1")!)[0].seen;

  // StrictMode mounts, unmounts and remounts at once, as `next dev` does.
  const view = render(
    <React.StrictMode>
      <RequestProvider company={DEMO_COMPANY}><QuoteStatus lines={serverLines()} today={TODAY} /></RequestProvider>
    </React.StrictMode>,
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(seen()).toBe(false);
  expect(screen.getByText("New")).toBeTruthy();

  // Leaving the page is what marks them seen.
  view.unmount();
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(seen()).toBe(true);
});
