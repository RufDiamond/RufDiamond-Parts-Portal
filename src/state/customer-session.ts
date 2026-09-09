import { MeResponseSchema, type MeResponse } from "@rufdiamond/contracts";
import { Value } from "@sinclair/typebox/value";

export function scopeKey(session: { id: string; companyId: string; capabilities: string[]; scopes: object }): string {
  return JSON.stringify([session.id, session.companyId, [...session.capabilities].sort(), session.scopes]);
}

export function clearCustomerStorage(storage: Pick<Storage, "length" | "key" | "removeItem"> = window.sessionStorage) {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
  for (const key of keys) if (key?.startsWith("rdpp:")) storage.removeItem(key);
}

export async function readCustomerSession(): Promise<MeResponse> {
  const response = await fetch("/api/v1/me", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error("Please sign in again.");
  const body: unknown = await response.json();
  if (!Value.Check(MeResponseSchema, body)) throw new Error("Session unavailable.");
  return body;
}

export async function signInCustomer(loginId: string, password: string): Promise<void> {
  const response = await fetch("/api/v1/auth/sign-in", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify({ loginId, password }) });
  if (!response.ok) throw new Error("Sign-in failed. Check your details and try again.");
}

export async function signOutCustomer(): Promise<void> {
  const me = await readCustomerSession();
  const response = await fetch("/api/v1/auth/sign-out", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json", "x-csrf-token": me.csrfToken }, body: "{}" });
  if (!response.ok) throw new Error("Sign-out failed. Please retry.");
}

/** Full document navigation discards prefetched Next router payloads across identities. */
export function resetCustomerNavigation(destination: string) {
  try { clearCustomerStorage(); } catch { /* Navigation must work with unavailable storage. */ }
  try { window.localStorage.setItem("rdpp:session-change", String(Date.now())); } catch { /* Other tabs also revalidate on focus. */ }
  window.location.replace(destination);
}
