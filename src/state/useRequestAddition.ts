"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRequest, type RequestPartInput } from "./RequestContext";

/** Global additions may finish after navigation; an old page must not navigate back. */
export function useRequestAddition(pageKey: string) {
  const { addParts, requestError } = useRequest();
  const pageLifetime = useMemo(() => Symbol(pageKey), [pageKey]);
  const lifecycle = useRef<symbol | null>(null);
  const inFlight = useRef<symbol | null>(null);
  const [pendingLifetime, setPendingLifetime] = useState<symbol | null>(null);
  useEffect(() => {
    lifecycle.current = pageLifetime;
    return () => { lifecycle.current = null; };
  }, [pageLifetime]);

  async function add(parts: RequestPartInput[], onSuccess: () => void = () => {}) {
    const token = lifecycle.current;
    if (!token || inFlight.current === token) return false;
    inFlight.current = token;
    setPendingLifetime(token);
    const committed = parts.length ? await addParts(parts) : true;
    if (lifecycle.current !== token) return false;
    inFlight.current = null;
    setPendingLifetime(null);
    if (committed) onSuccess();
    return committed;
  }

  return { add, pending: pendingLifetime === pageLifetime, error: requestError };
}
