"use client";
import { useEffect, useRef, useState } from "react";
import { useRequest, type RequestPartInput } from "./RequestContext";

/** Global additions may finish after navigation; an old page must not navigate back. */
export function useRequestAddition(pageKey: string) {
  const { addParts, requestError } = useRequest();
  const lifecycle = useRef<symbol | null>(null);
  const inFlight = useRef<symbol | null>(null);
  const [pendingPage, setPendingPage] = useState<string | null>(null);
  useEffect(() => {
    lifecycle.current = Symbol(pageKey);
    return () => { lifecycle.current = null; };
  }, [pageKey]);

  async function add(parts: RequestPartInput[], onSuccess: () => void = () => {}) {
    const token = lifecycle.current;
    if (!token || inFlight.current === token) return false;
    inFlight.current = token;
    setPendingPage(pageKey);
    const committed = parts.length ? await addParts(parts) : true;
    if (lifecycle.current !== token) return false;
    inFlight.current = null;
    setPendingPage(null);
    if (committed) onSuccess();
    return committed;
  }

  return { add, pending: pendingPage === pageKey, error: requestError };
}
