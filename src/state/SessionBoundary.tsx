"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { MeResponse } from "@rufdiamond/contracts";
import { readCustomerSession, resetCustomerNavigation, scopeKey, signOutCustomer } from "./customer-session";

const SessionContext = createContext<MeResponse | null>(null);
export const useCustomerSession = () => useContext(SessionContext);

export function SessionBoundary({ session, children }: { session: MeResponse | null; children: ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const route = `${pathname}?${search}`;
  const identity = session ? scopeKey(session) : "fixture";
  const [verified, setVerified] = useState("");
  const [failure, setFailure] = useState(false);
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const verify = async () => {
      try {
        const fresh = await readCustomerSession();
        if (cancelled) return;
        if (scopeKey(fresh) !== identity) { resetCustomerNavigation(window.location.href); return; }
        setVerified(`${identity}:${route}`);
        setFailure(false);
      } catch { if (!cancelled) { setVerified(""); setFailure(true); } }
    };
    const hide = () => setVerified("");
    const changed = () => { hide(); void verify(); };
    const visibility = () => { if (document.visibilityState === "visible") changed(); else hide(); };
    const storage = (event: StorageEvent) => { if (event.key === "rdpp:session-change") changed(); };
    void verify();
    const timer = window.setInterval(verify, 30000);
    window.addEventListener("focus", changed);
    window.addEventListener("pageshow", changed);
    window.addEventListener("pagehide", hide);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", visibility);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener("focus", changed); window.removeEventListener("pageshow", changed); window.removeEventListener("pagehide", hide); window.removeEventListener("storage", storage); document.removeEventListener("visibilitychange", visibility); };
  }, [identity, route, session]);
  if (session && verified !== `${identity}:${route}`) return <main role="status">{failure ? <a href="/signin">Session unavailable. Sign in again.</a> : "Checking catalogue access…"}</main>;
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function SignOutButton() {
  const session = useCustomerSession();
  const [error, setError] = useState("");
  if (!session) return null;
  return <span><button type="button" onClick={async () => { try { await signOutCustomer(); resetCustomerNavigation("/signin"); } catch { setError("Sign-out failed. Please retry."); } }}>Sign out</button>{error && <span role="alert">{error}</span>}</span>;
}
