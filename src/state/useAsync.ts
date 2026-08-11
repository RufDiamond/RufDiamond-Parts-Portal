"use client";

import { useEffect, useReducer } from "react";

export interface AsyncState<T> {
  data: T | null;
  /** True while a load is in flight, and on the first render before one starts. */
  loading: boolean;
  error: Error | null;
}

type AsyncAction<T> =
  | { type: "start" }
  | { type: "resolved"; data: T }
  | { type: "rejected"; error: Error }
  | { type: "idle" };

function reducer<T>(state: AsyncState<T>, action: AsyncAction<T>): AsyncState<T> {
  switch (action.type) {
    case "start":
      return { ...state, loading: true, error: null };
    case "resolved":
      return { data: action.data, loading: false, error: null };
    case "rejected":
      return { data: null, loading: false, error: action.error };
    case "idle":
      return { data: null, loading: false, error: null };
    default:
      return state;
  }
}

/**
 * Run a repository call from a client component.
 *
 * Screens scoped to the selected machine cannot fetch on the server: the
 * variant lives in sessionStorage, which the server cannot see. Those screens
 * load through here instead.
 *
 * `run` must be stable — wrap it in `useCallback`. Pass null to stay idle,
 * which is what a screen does before a machine has been chosen.
 */
export function useAsync<T>(run: (() => Promise<T>) | null): AsyncState<T> {
  const [state, dispatch] = useReducer(reducer<T>, {
    data: null,
    loading: run !== null,
    error: null,
  });

  useEffect(() => {
    if (!run) {
      dispatch({ type: "idle" });
      return;
    }

    let cancelled = false;
    dispatch({ type: "start" });

    run().then(
      (data) => {
        if (!cancelled) dispatch({ type: "resolved", data });
      },
      (cause: unknown) => {
        if (cancelled) return;
        dispatch({
          type: "rejected",
          error: cause instanceof Error ? cause : new Error(String(cause)),
        });
      },
    );

    // A stale response must not overwrite a newer one.
    return () => {
      cancelled = true;
    };
  }, [run]);

  return state;
}
