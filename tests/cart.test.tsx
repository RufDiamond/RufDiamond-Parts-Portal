// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AddToCartDialog, CheckCart } from "@/components";
import { RequestProvider, useRequest } from "@/state/RequestContext";
import { Checkout } from "@/app/(portal)/checkout/Checkout";
import { canOrderRequestLine, hasAvailablePrice } from "@/lib/order-eligibility";
import type { Company, Part } from "@/types/catalog";

const customer = vi.hoisted(() => ({ hosted: false }));
vi.mock("@/state/SessionBoundary", () => ({ useCustomerSession: () => customer.hosted ? { capabilities: ["orders.submit"], companyId: "company", csrfToken: "test" } : null }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const part = (id: string, partNumber: string, listPrice?: number): Part => ({
  id, partNumber, description: `Part ${partNumber}`, manufacturer: null, currency: "CAD",
  status: "active", supersededByPartId: null, requires: [],
  ...(listPrice === undefined ? {} : { listPrice }),
});
const heater = part("p1", "68-00032", 559.93);
const fan = part("p2", "89-00026", 179.81);
const company: Company = { id: "c", name: "Synthetic", discountRate: 0.1, defaultShippingAddress: null } as Company;

afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear(); customer.hosted = false; });

it("confirms edited quantities with subtotal, discount and total before tax", async () => {
  const onConfirm = vi.fn(async () => true);
  render(<AddToCartDialog parts={[{ part: heater, qty: 1 }, { part: fan, qty: 4 }]} currency="CAD" discountRate={0.1} onConfirm={onConfirm} onClose={() => {}} />);
  const dialog = screen.getByRole("dialog", { name: "Confirm parts to add to the cart" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Increase Quantity for 68-00032" }));
  const foot = dialog.querySelector("tfoot") as HTMLElement;
  // 2 × 559.93 + 4 × 179.81 = 1,839.10; 10% off = 183.91; net 1,655.19.
  expect(within(foot).getByText("1,839.10")).toBeTruthy();
  expect(within(foot).getByText("183.91")).toBeTruthy();
  expect(within(foot).getByText("1,655.19")).toBeTruthy();
  expect(within(dialog).getByText(/exclude taxes/)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Add to cart" }));
  expect(onConfirm).toHaveBeenCalledWith([{ part: heater, qty: 2 }, { part: fan, qty: 4 }]);
  await screen.findByText(/successfully added to order list/i);
});

it("keeps the dialog open for another try when the addition fails", async () => {
  render(<AddToCartDialog parts={[{ part: heater }]} currency="CAD" discountRate={0} onConfirm={async () => false} onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));
  expect(await screen.findByRole("button", { name: "Add to cart" })).toBeTruthy();
  expect(screen.queryByText(/successfully added/i)).toBeNull();
});

it("shows no money columns when prices are withheld from the account", () => {
  render(<AddToCartDialog parts={[{ part: part("p3", "40-00006") }]} currency="CAD" discountRate={0} onConfirm={async () => true} onClose={() => {}} />);
  expect(screen.queryByText(/Unit price/)).toBeNull();
  expect(screen.queryByText("Total")).toBeNull();
});

function Seed() {
  const { addParts, linesHydrated } = useRequest();
  return <button type="button" disabled={!linesHydrated} onClick={() => { void addParts([{ part: heater, qty: 1 }, { part: fan, qty: 4 }]); }}>seed</button>;
}

it("lets the reader step, remove and clear cart lines from the drop-down", async () => {
  render(<RequestProvider company={company}><Seed /><CheckCart buttonClassName="" iconClassName="" /></RequestProvider>);
  const seed = screen.getByRole("button", { name: "seed" });
  await vi.waitFor(() => expect((seed as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(seed);
  fireEvent.click(await screen.findByRole("button", { name: "Check cart · 2" }));
  const menu = screen.getByRole("dialog", { name: "Cart" });
  expect(within(menu).getByText("2 items / 5 qty. in your cart")).toBeTruthy();
  expect(within(menu).getByText("CAD 1,279.17")).toBeTruthy();

  fireEvent.click(within(menu).getByRole("button", { name: "Decrease Quantity for 89-00026" }));
  expect(within(menu).getByText("2 items / 4 qty. in your cart")).toBeTruthy();

  fireEvent.click(within(menu).getByRole("button", { name: "Remove 68-00032 from the cart" }));
  expect(within(menu).getByText("1 item / 3 qty. in your cart")).toBeTruthy();

  fireEvent.click(within(menu).getByRole("button", { name: "Clear cart" }));
  expect(within(menu).getByText("Your cart is empty.")).toBeTruthy();
  expect(within(menu).getByRole("link", { name: "Checkout" }).getAttribute("aria-disabled")).toBe("true");
});

it("closes the drop-down on Escape", async () => {
  render(<RequestProvider><CheckCart buttonClassName="" iconClassName="" /></RequestProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Check cart · 0" }));
  expect(screen.getByRole("dialog", { name: "Cart" })).toBeTruthy();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "Cart" })).toBeNull();
});

it("shows no discount line to an account without a discount", () => {
  render(<AddToCartDialog parts={[{ part: heater, qty: 1 }]} currency="CAD" discountRate={0} onConfirm={async () => true} onClose={() => {}} />);
  const foot = screen.getByRole("dialog").querySelector("tfoot") as HTMLElement;
  expect(within(foot).queryByText(/Discount/)).toBeNull();
  expect(within(foot).queryByText(/Subtotal/)).toBeNull();
  expect(within(foot).getByText("559.93")).toBeTruthy();
});

it("retains quantity for the quote-only nut and keeps it out of the priced total", async () => {
  const nut = part("nut", "12-210000-12", 0);
  const onConfirm = vi.fn(async () => true);
  render(<AddToCartDialog parts={[{ part: heater }, { part: nut, qty: 3 }]} currency="CAD" discountRate={0.1} onConfirm={onConfirm} onClose={() => {}} />);
  const row = (await screen.findByText(nut.partNumber)).closest("tr")!;
  expect(within(row).getByText("Quote required")).toBeTruthy();
  expect(within(row).queryByText("0.00")).toBeNull();
  fireEvent.click(within(row).getByRole("button", { name: "Increase Quantity for 12-210000-12" }));
  fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));
  expect(onConfirm).toHaveBeenCalledWith([{ part: heater, qty: 1 }, { part: nut, qty: 4 }]);
  expect((await screen.findByRole("link", { name: "Request a quote for remaining items" })).getAttribute("href")).toBe("/request?quoteRequired=1");
});

it("shows a priced preview part in the cart confirmation without a quote-required label", () => {
  customer.hosted = true;
  const preview = { ...heater, id: "prt-68-00032", listPrice: "559.93" };
  render(<AddToCartDialog parts={[{ part: preview, qty: 2 }]} currency="CAD" discountRate={0} onConfirm={async () => true} onClose={() => {}} />);
  expect(screen.queryByText("Quote required")).toBeNull();
  expect(screen.getByText("559.93")).toBeTruthy();
  expect(screen.getByRole("button", { name: /^Add to cart$/ })).toBeTruthy();
  // Publication eligibility remains enforced when the actual order is built.
  expect(canOrderRequestLine({ partId: preview.id, partNumberSnapshot: preview.partNumber,
    descriptionSnapshot: preview.description, qty: 2, unitPriceSnapshot: "559.93" }, true)).toBe(false);
});

it.each([0, "0.00", undefined, -1, "", "unavailable", Number.NaN, Number.POSITIVE_INFINITY])("requires a quote for unavailable price %s", price => {
  expect(hasAvailablePrice(price)).toBe(false);
});

function SeedPreview() {
  const { addParts, linesHydrated } = useRequest();
  return <button disabled={!linesHydrated} onClick={() => { void addParts([
    { part: { ...heater, id: "prt-68-00032" }, qty: 2 },
    { part: { ...fan, id: "prt-89-00026", listPrice: 0 } },
  ]); }}>Add preview parts</button>;
}

it("keeps priced review items visible in the hosted cart and flags only the zero-price item", async () => {
  customer.hosted = true;
  render(<RequestProvider><SeedPreview /><CheckCart buttonClassName="" iconClassName="" /></RequestProvider>);
  const add = screen.getByRole("button", { name: "Add preview parts" });
  await vi.waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(add);
  fireEvent.click(await screen.findByRole("button", { name: "Check cart · 2" }));
  const cart = screen.getByRole("dialog");
  const priced = within(cart).getByText(/Part 68-00032/).closest("li")!;
  expect(within(priced).getByText("CAD 559.93 × 2")).toBeTruthy();
  expect(within(priced).queryByText("Quote required")).toBeNull();
  expect(within(cart).getAllByText("Quote required")).toHaveLength(1);
  expect(within(cart).getByRole("link", { name: "Checkout" }).getAttribute("href")).toBe("/checkout");
});

it("explains catalogue approval separately from missing pricing at hosted checkout", async () => {
  customer.hosted = true;
  render(<RequestProvider><SeedPreview /><Checkout today="2026-11-17" /></RequestProvider>);
  const add = screen.getByRole("button", { name: "Add preview parts" });
  await vi.waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(add);
  expect(await screen.findByText("Catalogue approval pending")).toBeTruthy();
  expect(screen.getByText(/1 item needs pricing/)).toBeTruthy();
  expect(screen.queryByText("A priced quote is required")).toBeNull();
  expect(screen.queryByRole("button", { name: "Submit order" })).toBeNull();
});
