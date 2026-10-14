// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Checkout } from "@/app/(portal)/checkout/Checkout";
import { emptyAddress, emptyDraft, readSavedAddresses, sectionProblem } from "@/lib/checkout";
import { RequestProvider, useRequest } from "@/state/RequestContext";
import type { Company, Part } from "@/types/catalog";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear(); });

const TODAY = "2026-10-13";
const address = { ...emptyAddress(), firstName: "J.", lastName: "Tremblay", company: "Savage Equipment", address: "62 Smelter Road",
  city: "Coniston", province: "Ontario", postalCode: "P0M 1M0", email: "parts@example.com", phone: "705-555-0142" };

it("asks for a future date on a scheduled order and then needs no carrier", () => {
  const draft = { ...emptyDraft(), orderType: "schedule" as const };
  expect(sectionProblem("type", draft, TODAY)).toMatch(/date/);
  expect(sectionProblem("type", { ...draft, scheduleDate: TODAY }, TODAY)).toMatch(/after today/);
  expect(sectionProblem("type", { ...draft, scheduleDate: "2026-10-20" }, TODAY)).toBeNull();
  expect(sectionProblem("shipping", draft, TODAY)).toBeNull();
  expect(sectionProblem("shipping", { ...draft, orderType: "regular" }, TODAY)).toMatch(/shipping method/);
});

it("requires both the PO and a typed VIN", () => {
  expect(sectionProblem("detail", { ...emptyDraft(), vin: "9924P250416" }, TODAY)).toMatch(/PO number/);
  expect(sectionProblem("detail", { ...emptyDraft(), poNumber: "4500689756" }, TODAY)).toMatch(/VIN/);
  expect(sectionProblem("detail", { ...emptyDraft(), poNumber: "4500689756", vin: " " }, TODAY)).toMatch(/VIN/);
  expect(sectionProblem("detail", { ...emptyDraft(), poNumber: "4500689756", vin: "9924P250416" }, TODAY)).toBeNull();
});

it("checks Canadian postal codes and skips billing when it is the shipping address", () => {
  const draft = { ...emptyDraft(), shipping: { ...address, postalCode: "12345" } };
  expect(sectionProblem("addresses", draft, TODAY)).toMatch(/postal code/);
  expect(sectionProblem("addresses", { ...draft, shipping: address }, TODAY)).toMatch(/Billing address/);
  expect(sectionProblem("addresses", { ...draft, shipping: address, billingSameAsShipping: true }, TODAY)).toBeNull();
});

it("starts a first order empty with saving ticked, and a later one from the saved addresses", () => {
  expect(emptyDraft()).toMatchObject({ shipping: emptyAddress(), saveShipping: true, saveBilling: true });
  expect(emptyDraft({ shipping: address, billing: null })).toMatchObject({ shipping: address, saveShipping: false, saveBilling: true });
});

const part: Part = { id: "p1", partNumber: "68-00032", description: "Heater panel control assy", manufacturer: null, listPrice: 559.93,
  currency: "CAD", status: "active", supersededByPartId: null, requires: [] };
const dealer = { id: "co-savage", name: "Savage Equipment", type: "dealer", discountRate: 0.1, defaultShippingAddress: null } as Company;

function Seed() {
  const { addParts, linesHydrated, lines } = useRequest();
  return <button type="button" disabled={!linesHydrated} onClick={() => { void addParts([{ part, qty: 2 }]); }}>seed {lines.length}</button>;
}

async function renderWithCart() {
  render(<RequestProvider company={dealer}><Seed /><Checkout today={TODAY} /></RequestProvider>);
  const seed = await screen.findByRole("button", { name: "seed 0" });
  await vi.waitFor(() => expect((seed as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(seed);
  await screen.findByRole("button", { name: "seed 1" });
}

const next = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));

function fillAddress(kind: "shipping" | "billing", value: typeof address) {
  const labels: [keyof typeof address, string][] = [["firstName", "First Name:"], ["lastName", "Last Name:"], ["company", "Company:"],
    ["address", "Address:"], ["city", "City:"], ["province", "Province:"], ["postalCode", "Postal Code:"], ["email", "Email:"], ["phone", "Phone No.:"]];
  const card = screen.getByRole("heading", { name: kind === "shipping" ? "Shipping Address" : "Billing Address" }).parentElement as HTMLElement;
  for (const [key, label] of labels) fireEvent.change(within(card).getByLabelText(label), { target: { value: value[key] } });
}

it("walks a first order through every section, saves the address, and offers it next time", async () => {
  await renderWithCart();

  // Nothing chosen yet: the arrow explains instead of moving on.
  next(/Continue to order type detail/);
  expect(screen.getByRole("alert").textContent).toMatch(/Choose an order type/);
  fireEvent.click(screen.getByRole("radio", { name: "Regular Order" }));
  next(/Continue to order type detail/);

  fireEvent.change(screen.getByLabelText("PO No.:"), { target: { value: "4500689756" } });
  fireEvent.change(screen.getByLabelText("VIN No.:"), { target: { value: "9924p250416" } });
  expect((screen.getByLabelText("VIN No.:") as HTMLInputElement).value).toBe("9924P250416");
  next(/Continue to shipping method/);
  fireEvent.click(screen.getByRole("radio", { name: "Purolator Ground" }));
  next(/Continue to shipping and billing address/);

  // First order: empty forms, "Save this new address" already ticked.
  expect((screen.getAllByLabelText("City:")[0] as HTMLInputElement).value).toBe("");
  expect((screen.getAllByRole("checkbox", { name: "Save this new address" })[0] as HTMLInputElement).checked).toBe(true);
  fillAddress("shipping", address);
  fireEvent.click(screen.getByRole("checkbox", { name: "Shipping address is same as billing address" }));
  next(/Continue to special instructions/);
  fireEvent.change(screen.getByRole("textbox", { name: "Special instructions" }), { target: { value: "Please send the invoice as soon as possible" } });
  next(/Review order/);

  expect(screen.getByRole("heading", { name: "Order Confirmation" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Pricing Disclaimer & Order Terms" })).toBeTruthy();
  // 2 × 559.93 = 1,119.86; 10% off = 111.99; total 1,007.87.
  const foot = document.querySelector("tfoot") as HTMLElement;
  expect(within(foot).getByText("$ 1,119.86")).toBeTruthy();
  expect(within(foot).getByText("$ 111.99")).toBeTruthy();
  expect(within(foot).getByText("$ 1,007.87")).toBeTruthy();
  expect(screen.getByText("Via: Purolator Ground")).toBeTruthy();
  expect(screen.getByText("VIN: 9924P250416")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  const done = screen.getByRole("dialog", { name: "Order Confirmation" });
  expect(within(done).getByText("Your order has been submitted successfully.")).toBeTruthy();
  fireEvent.click(within(done).getByRole("button", { name: "OK" }));
  expect(screen.getByRole("heading", { name: "Order No: 00001" })).toBeTruthy();
  expect(screen.getByRole("note").textContent).toMatch(/not been sent/);
  expect(screen.getByRole("button", { name: "seed 0" })).toBeTruthy();

  // The address was saved for the account, as shipping and billing alike.
  expect(readSavedAddresses("co-savage")).toEqual({ shipping: address, billing: address });
  fireEvent.click(screen.getByRole("button", { name: "seed 0" }));
  fireEvent.click(await screen.findByRole("button", { name: "New order" }));
  fireEvent.click(screen.getByRole("radio", { name: "Urgent Order" }));
  next(/Continue to order type detail/);
  fireEvent.change(screen.getByLabelText("PO No.:"), { target: { value: "4500689757" } });
  fireEvent.change(screen.getByLabelText("VIN No.:"), { target: { value: "9924P250416" } });
  next(/Continue to shipping method/);
  fireEvent.click(screen.getByRole("radio", { name: "Purolator Express" }));
  next(/Continue to shipping and billing address/);
  expect(screen.getAllByText("62 Smelter Road")).toHaveLength(2);
});

it("keeps every other answer when the order type changes (14 Oct)", async () => {
  await renderWithCart();
  fireEvent.click(screen.getByRole("radio", { name: "Regular Order" }));
  next(/Continue to order type detail/);
  fireEvent.change(screen.getByLabelText("PO No.:"), { target: { value: "4500689756" } });
  fireEvent.change(screen.getByLabelText("VIN No.:"), { target: { value: "9924P250416" } });
  next(/Continue to shipping method/);
  fireEvent.click(screen.getByRole("radio", { name: "Purolator Ground" }));

  fireEvent.click(screen.getByRole("radio", { name: "Urgent Order" }));
  expect((screen.getByLabelText("PO No.:") as HTMLInputElement).value).toBe("4500689756");
  expect((screen.getByLabelText("VIN No.:") as HTMLInputElement).value).toBe("9924P250416");
  expect((screen.getByRole("radio", { name: "Purolator Ground" }) as HTMLInputElement).checked).toBe(true);

  // Switching to Schedule asks for the date and still keeps the rest.
  fireEvent.click(screen.getByRole("radio", { name: "Schedule" }));
  expect(screen.getByRole("alert").textContent).toMatch(/Choose the date/);
  expect((screen.getByLabelText("PO No.:") as HTMLInputElement).value).toBe("4500689756");
});
