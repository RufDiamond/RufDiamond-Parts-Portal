import "server-only";
import { isApiMode } from "@/data/repository";
import type { AccountProfile } from "@/types/checkout";

/**
 * What the demonstration account (`PLACEHOLDER_COMPANY` in
 * `src/state/AppProviders.tsx`) has on file. The shipping address is the one
 * that account already offers on the quote request.
 */
const fixtureProfile: AccountProfile = {
  serials: ["99FT3W251001", "99FT3W251002", "99FT3W251004"],
  shipping: {
    firstName: "J.", lastName: "Tremblay", company: "Red Lake Mine", address: "62 Smelter Road",
    city: "Coniston", province: "Ontario", country: "Canada", postalCode: "P0M 1M0",
    email: "parts@redlakemine.example", phone: "705-555-0142",
  },
  billing: {
    firstName: "Accounts", lastName: "Payable", company: "Red Lake Mine", address: "100 Elm Street",
    city: "Sudbury", province: "Ontario", country: "Canada", postalCode: "P3C 1T3",
    email: "accounts@redlakemine.example", phone: "705-555-0100",
  },
};

/** The signed-in account's profile, or null where no order service exists yet. */
export async function getAccountProfile(): Promise<AccountProfile | null> {
  if (isApiMode()) return null;
  return fixtureProfile;
}
