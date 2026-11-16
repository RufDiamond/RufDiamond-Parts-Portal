// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BrandParts } from "@/app/(portal)/parts/[brand]/BrandParts";
import { SearchResults } from "@/app/(portal)/search/SearchResults";
import { RequestProvider } from "@/state/RequestContext";
import { MachineProvider } from "@/state/MachineContext";
import type { ProductLine } from "@/types/catalog";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
afterEach(() => { cleanup(); navigation.push.mockClear(); });

const line = { id: "pl-fat-truck", name: "Fat Truck" } as ProductLine;

it("searches by part number and by description from the model page (slides 16 and 22)", () => {
  render(<MachineProvider><BrandParts productLine={line} models={[]} slug="fat-truck" /></MachineProvider>);
  fireEvent.change(screen.getByLabelText("Search by Description"), { target: { value: "hex nut" } });
  fireEvent.click(screen.getByRole("button", { name: "Search by description" }));
  expect(navigation.push).toHaveBeenCalledWith("/search?mode=description&q=hex%20nut&brand=fat-truck");
  fireEvent.change(screen.getByLabelText("Search by Part Number"), { target: { value: "19-00368" } });
  fireEvent.click(screen.getByRole("button", { name: "Search by part number" }));
  expect(navigation.push).toHaveBeenLastCalledWith("/search?mode=part&q=19-00368&brand=fat-truck");
});

it.each(["part", "description"] as const)("sorts %s results, keeps checks on their usage, and opens the figure from the row", (mode) => {
  const row = (figureId: string, modelName: string, serial: string, listPrice: number) => ({
    figureId, modelName, serial, groupNo: "1.1", systemName: "Filters", assemblyName: "Filters",
    part: { id: "part-a", partNumber: "36-00304", description: "Filter", manufacturer: null,
      currency: "CAD" as const, status: "active" as const, supersededByPartId: null, requires: [], listPrice },
  });
  render(<RequestProvider><SearchResults query="filter" mode={mode} brand="fat-truck" rows={[
    row("wagon-10", "FT3 Wagon", "FT3-10", 20),
    row("pickup-3", "2.8 Pickup", "FT3-3", 8),
    row("wagon-2", "FT3 Wagon", "FT3-2", 2),
  ]} /></RequestProvider>);
  const rows = () => [...document.querySelectorAll("tbody tr")];
  expect(rows().map(entry => entry.querySelector("a")?.getAttribute("href"))).toEqual([
    "/figures/pickup-3", "/figures/wagon-2", "/figures/wagon-10",
  ]);
  fireEvent.click(rows()[1].querySelector("input")!);
  fireEvent.click(screen.getByRole("button", { name: "Unit price" }));
  expect(rows().map(entry => entry.querySelector("a")?.getAttribute("href"))).toEqual([
    "/figures/wagon-2", "/figures/pickup-3", "/figures/wagon-10",
  ]);
  expect(rows()[0].querySelector("input")?.checked).toBe(true);
  expect(navigation.push).not.toHaveBeenCalled();
  fireEvent.click(rows()[2].querySelector("td:nth-child(4)")!);
  expect(navigation.push).toHaveBeenLastCalledWith("/figures/wagon-10");
});
