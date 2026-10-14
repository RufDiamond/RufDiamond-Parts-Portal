import "server-only";
import { DEMO_COMPANY } from "@/data/accounts";
import { isApiMode } from "@/data/repository";
import { toCustomerQuoteLines } from "@/lib/quote-status";
import type { CustomerQuoteLine, QuoteStatusRecord } from "@/types/quotes";

/**
 * The local demonstration account (`DEMO_COMPANY`). There is no quote service
 * behind the API yet, so Quote Status exists in fixture mode only.
 */
const FIXTURE_COMPANY_ID = DEMO_COMPANY.id;

const ft3 = { model: "FAT TRUCK FT3 WAGON", serialNumber: "99FT3W251004" };

/**
 * Sample quote lines in the shape of the deck's administrator table (p58),
 * using real FT3 Wagon parts. Factory prices are illustrative.
 */
export const fixtureQuoteRecords: QuoteStatusRecord[] = [
  {
    id: "qs-0007-1", companyId: FIXTURE_COMPANY_ID, productLine: "Fat Truck", quoteNo: "RD-00007",
    requestDate: "2026-10-12", customer: DEMO_COMPANY.name, user: "J. Tremblay",
    requested: { partNumber: "19-00511", description: "Oil resistant o-ring", qty: 10 }, catalogPartId: "prt-19-00511",
    responseDate: null, available: null, estAvailability: null, newPartNumber: null, newDescription: null, newQty: null,
    factoryPrice: null, customerPrice: null, comments: "", notifyCustomer: false,
    ...ft3, system: "DRIVE SYSTEM", figure: "FIG 3.1", assemblyName: "HYDRAULIC MOTOR ASSEMBLY",
  },
  {
    id: "qs-0006-1", companyId: FIXTURE_COMPANY_ID, productLine: "Fat Truck", quoteNo: "RD-00006",
    requestDate: "2026-10-01", customer: DEMO_COMPANY.name, user: "J. Tremblay",
    requested: { partNumber: "19-00368", description: "Trim seal 100100b3x1/4a", qty: 4 }, catalogPartId: "prt-19-00368",
    responseDate: "2026-10-02", available: "yes", estAvailability: "2026-10-06", newPartNumber: "19-00368", newDescription: "Trim seal 100100b3x1/4a", newQty: 4,
    factoryPrice: "16.40", customerPrice: "19.18", comments: "", notifyCustomer: true,
    ...ft3, system: "CABIN", figure: "FIG 6.2", assemblyName: "WINDSHIELD ASSEMBLY",
  },
  {
    id: "qs-0006-2", companyId: FIXTURE_COMPANY_ID, productLine: "Fat Truck", quoteNo: "RD-00006",
    requestDate: "2026-10-01", customer: DEMO_COMPANY.name, user: "J. Tremblay",
    requested: { partNumber: "62-00184", description: "Windshield hinge support", qty: 2 }, catalogPartId: "prt-62-00184",
    responseDate: "2026-10-03", available: "partial", estAvailability: "2026-10-30", newPartNumber: "62-00184", newDescription: "Windshield hinge support", newQty: 2,
    factoryPrice: "182.00", customerPrice: "214.12", comments: "One in stock, the second ships with the next factory consignment.", notifyCustomer: true,
    ...ft3, system: "CABIN", figure: "FIG 6.4", assemblyName: "WINDSHIELD CENTER HINGE",
  },
  {
    id: "qs-0006-3", companyId: FIXTURE_COMPANY_ID, productLine: "Fat Truck", quoteNo: "RD-00006",
    requestDate: "2026-10-01", customer: DEMO_COMPANY.name, user: "J. Tremblay",
    requested: { partNumber: "51-00045", description: "Hydraulic motor (poclain mse08)", qty: 1 }, catalogPartId: "prt-51-00045",
    responseDate: "2026-10-04", available: "no", estAvailability: "2026-11-20", newPartNumber: "51-00045", newDescription: "Hydraulic motor (poclain mse08)", newQty: 1,
    factoryPrice: "6900.00", customerPrice: "8000.00", comments: "On back order at the factory.", notifyCustomer: true,
    ...ft3, system: "DRIVE SYSTEM", figure: "FIG 3.1", assemblyName: "HYDRAULIC MOTOR ASSEMBLY",
  },
  {
    // A line the factory added to the quotation; the customer never asked for it.
    id: "qs-0006-4", companyId: FIXTURE_COMPANY_ID, productLine: "Fat Truck", quoteNo: "RD-00006",
    requestDate: "2026-10-01", customer: DEMO_COMPANY.name, user: "J. Tremblay",
    requested: null, catalogPartId: null,
    responseDate: "2026-10-04", available: "yes", estAvailability: "2026-10-08", newPartNumber: "98-00041", newDescription: "Hydraulic motor seal kit", newQty: 1,
    factoryPrice: "120.00", customerPrice: "145.00", comments: "Additional part required when replacing the motor.", notifyCustomer: true,
    ...ft3, system: "DRIVE SYSTEM", figure: "FIG 3.1", assemblyName: "HYDRAULIC MOTOR ASSEMBLY",
  },
  {
    id: "qs-0003-1", companyId: FIXTURE_COMPANY_ID, productLine: "Fat Truck", quoteNo: "RD-00003",
    requestDate: "2026-09-02", customer: DEMO_COMPANY.name, user: "J. Tremblay",
    requested: { partNumber: "62-00184", description: "Windshield hinge support", qty: 1 }, catalogPartId: "prt-62-00184",
    responseDate: "2026-09-03", available: "yes", estAvailability: "2026-09-08", newPartNumber: "62-00184", newDescription: "Windshield hinge support", newQty: 1,
    factoryPrice: "175.00", customerPrice: "205.00", comments: "", notifyCustomer: true,
    ...ft3, system: "CABIN", figure: "FIG 6.4", assemblyName: "WINDSHIELD CENTER HINGE",
  },
  {
    // Another account's request: must never appear on the demonstration account's screen.
    id: "qs-0005-1", companyId: "co-total-rentals", productLine: "Fat Truck", quoteNo: "RD-00005",
    requestDate: "2026-10-05", customer: "Total Rentals", user: "K. Sheldon",
    requested: { partNumber: "19-00368", description: "Trim seal 100100b3x1/4a", qty: 20 }, catalogPartId: "prt-19-00368",
    responseDate: "2026-10-06", available: "yes", estAvailability: "2026-10-09", newPartNumber: "19-00368", newDescription: "Trim seal 100100b3x1/4a", newQty: 20,
    factoryPrice: "16.40", customerPrice: "18.50", comments: "", notifyCustomer: true,
    ...ft3, system: "CABIN", figure: "FIG 6.2", assemblyName: "WINDSHIELD ASSEMBLY",
  },
];

/** Today in Ontario, as an ISO date — the portal's prices are quoted from there. */
function today(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

/** The signed-in customer's quote lines, or null where no quote service exists yet. */
export async function getCustomerQuoteStatus(): Promise<CustomerQuoteLine[] | null> {
  if (isApiMode()) return null;
  return toCustomerQuoteLines(fixtureQuoteRecords, FIXTURE_COMPANY_ID, today());
}
