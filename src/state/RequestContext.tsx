"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Company, Currency, OrderLine, Part } from "@/types/catalog";
import type { MeResponse } from "@rufdiamond/contracts";
import { scopeKey } from "./customer-session";
import { readRequestIdentities, writeRequestIdentities, revalidateRequestIdentities } from "./customer-request";

export const LINES_STORAGE_KEY = "rdpp:request:v1";
export const CONFIRMATION_STORAGE_KEY = "rdpp:last-request:v1";

/** What a caller hands to `addParts` — the part, and how many of it. */
export interface RequestPartInput {
  part: Part;
  /** Defaults to 1. */
  qty?: number;
}

export interface RequestTotals {
  /** Sum of the line totals at list price. */
  listTotal?: number;
  /** Money taken off by the current company's rate. */
  discountApplied?: number;
  /** listTotal − discountApplied. */
  netTotal?: number;
}

/** What the reader typed alongside the parts, carried into the documents. */
export interface RequestDetails {
  /** Per-part notes, keyed by part id. */
  comments: Record<string, string>;
  generalComment: string;
  /**
   * Null when the reader never asked for an estimate. Slide 53 is explicit:
   * the shipping section is omitted from the documents entirely in that case,
   * rather than printed empty.
   */
  shipping: {
    address: string;
    method: "standard" | "expedited" | null;
  } | null;
  /** Product line the parts belong to — "Fat Truck", "IronHorse", "Agilis". */
  brand: string | null;
  /** Serial range the machine falls in, printed against every part. */
  serial: string | null;
}

/** The record of a submitted request, kept so the confirmation can be re-read. */
export interface RequestConfirmation {
  reference: string;
  /** What the reader typed, so the documents can be rebuilt after a refresh. */
  details: RequestDetails;
  /** ISO timestamp. */
  submittedAt: string;
  lines: OrderLine[];
  totals: RequestTotals;
  /** The rate that applied at submission, for the record. */
  discountRate: number;
  companyName: string | null;
  currency: Currency;
}

export interface RequestState {
  lines: OrderLine[];
  /**
   * Parts on the list but left OUT of the request — the unticked rows on the
   * quote screen. Held as exclusions rather than inclusions so a newly added
   * part is in by default, which is what adding one means.
   */
  excluded: string[];
  /** Taken from the first part added; reset when the list empties. */
  currency: Currency;
  /** False until the stored request list has been read. */
  linesHydrated: boolean;
  lastConfirmation: RequestConfirmation | null;
  /** False until the stored confirmation has been read. */
  confirmationHydrated: boolean;
}

/** The slice of state that survives a refresh. */
export interface StoredRequest {
  lines: OrderLine[];
  currency: Currency;
  /** Optional: lists written before exclusions existed simply have none. */
  excluded?: string[];
}

export type RequestAction =
  | { type: "add"; parts: RequestPartInput[] }
  | { type: "updateQty"; partId: string; qty: number }
  | { type: "remove"; partId: string }
  | { type: "toggleIncluded"; partId: string }
  | { type: "setAllIncluded"; included: boolean }
  | { type: "clear" }
  | { type: "submit"; confirmation: RequestConfirmation }
  | { type: "hydrateLines"; stored: StoredRequest | null }
  | { type: "hydrateConfirmation"; confirmation: RequestConfirmation | null };

export const initialRequestState: RequestState = {
  lines: [],
  excluded: [],
  currency: "CAD",
  linesHydrated: false,
  lastConfirmation: null,
  confirmationHydrated: false,
};

/** Money is rounded to cents at each step to keep float dust out of totals. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toLine(part: Part, qty: number): OrderLine {
  return {
    partId: part.id,
    partNumberSnapshot: part.partNumber,
    descriptionSnapshot: part.description,
    qty,
    ...(part.releasePartId ? { releasePartId: part.releasePartId } : {}),
    ...(part.listPrice === undefined ? {} : { unitPriceSnapshot: part.listPrice, lineTotal: round2(Number(part.listPrice) * qty) }),
  };
}

export function requestReducer(
  state: RequestState,
  action: RequestAction,
): RequestState {
  switch (action.type) {
    case "add": {
      const additions = action.parts.filter(({ qty = 1 }) => qty > 0);
      if (additions.length === 0) return state;

      const lines = [...state.lines];
      for (const { part, qty = 1 } of additions) {
        const index = lines.findIndex((line) => line.partId === part.id);
        if (index === -1) {
          // Snapshot the part as it reads today; later catalogue edits must
          // not rewrite a request already in progress.
          lines.push(toLine(part, qty));
        } else {
          const existing = lines[index];
          const nextQty = existing.qty + qty;
          // API additions have just been revalidated. Do not preserve a stale
          // release snapshot or an old price that is now omitted by scope.
          lines[index] = part.releasePartId ? toLine(part, nextQty) : {
            ...existing,
            qty: nextQty,
            ...(existing.unitPriceSnapshot === undefined ? {} : { lineTotal: round2(Number(existing.unitPriceSnapshot) * nextQty) }),
          };
        }
      }

      return {
        ...state,
        lines,
        // The first part added sets the currency for the request.
        currency:
          state.lines.length === 0 ? additions[0].part.currency : state.currency,
      };
    }

    case "updateQty": {
      // Zero means "take it off the list" — that is what the stepper's floor
      // reads as, and it saves a second call to removeLine.
      if (action.qty <= 0) {
        return requestReducer(state, { type: "remove", partId: action.partId });
      }

      const index = state.lines.findIndex(
        (line) => line.partId === action.partId,
      );
      if (index === -1) return state;
      if (state.lines[index].qty === action.qty) return state;

      const lines = [...state.lines];
      const existing = lines[index];
      lines[index] = {
        ...existing,
        qty: action.qty,
        ...(existing.unitPriceSnapshot === undefined ? {} : { lineTotal: round2(Number(existing.unitPriceSnapshot) * action.qty) }),
      };
      return { ...state, lines };
    }

    case "remove": {
      const lines = state.lines.filter((line) => line.partId !== action.partId);
      if (lines.length === state.lines.length) return state;
      return {
        ...state,
        lines,
        // A part that is gone cannot be excluded from anything.
        excluded: state.excluded.filter((id) => id !== action.partId),
        currency: lines.length === 0 ? "CAD" : state.currency,
      };
    }

    case "toggleIncluded": {
      if (!state.lines.some((line) => line.partId === action.partId)) {
        return state;
      }
      const excluded = state.excluded.includes(action.partId)
        ? state.excluded.filter((id) => id !== action.partId)
        : [...state.excluded, action.partId];
      return { ...state, excluded };
    }

    case "setAllIncluded":
      return {
        ...state,
        excluded: action.included
          ? []
          : state.lines.map((line) => line.partId),
      };

    case "clear":
      if (state.lines.length === 0) return state;
      return { ...state, lines: [], excluded: [], currency: "CAD" };

    case "submit": {
      /*
       * Only the ticked parts go. Anything left unticked was deliberately held
       * back, so it stays on the list as a fresh working set rather than being
       * silently submitted or silently dropped.
       */
      const kept = state.lines.filter((line) =>
        state.excluded.includes(line.partId),
      );
      return {
        ...state,
        lines: kept,
        excluded: [],
        currency: kept.length === 0 ? "CAD" : state.currency,
        lastConfirmation: action.confirmation,
      };
    }

    case "hydrateLines":
      // Anything added before the read landed wins over the stored list.
      if (state.lines.length > 0) return { ...state, linesHydrated: true };
      return {
        ...state,
        linesHydrated: true,
        lines: action.stored?.lines ?? [],
        excluded: action.stored?.excluded ?? [],
        currency: action.stored?.currency ?? "CAD",
      };

    case "hydrateConfirmation":
      return {
        ...state,
        confirmationHydrated: true,
        lastConfirmation: state.lastConfirmation ?? action.confirmation,
      };

    default:
      return state;
  }
}

/**
 * Totals are derived, never stored. `OrderLine` deliberately has no discount
 * field: the rate belongs to the company reading the list, so a line written
 * under one account must not carry another account's price.
 */
export function computeTotals(
  lines: OrderLine[],
  discountRate: number,
): RequestTotals {
  if (lines.some(line => line.lineTotal === undefined)) return {};
  const listTotal = round2(lines.reduce((sum, line) => sum + (line.lineTotal ?? 0), 0));
  const rate = Math.min(1, Math.max(0, discountRate));
  const discountApplied = round2(listTotal * rate);

  return {
    listTotal,
    discountApplied,
    netTotal: round2(listTotal - discountApplied),
  };
}

/** RDP-20260809-4821 */
export function buildReference(now: Date, seed: number): string {
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const suffix = String(Math.floor(seed * 10000)).padStart(4, "0");
  return `RDP-${stamp}-${suffix}`;
}

function isOrderLine(value: unknown): value is OrderLine {
  if (typeof value !== "object" || value === null) return false;
  const line = value as Partial<OrderLine>;
  return (
    typeof line.partId === "string" &&
    typeof line.partNumberSnapshot === "string" &&
    typeof line.descriptionSnapshot === "string" &&
    typeof line.qty === "number" &&
    typeof line.unitPriceSnapshot === "number" &&
    typeof line.lineTotal === "number"
  );
}

export function readStoredRequest(): StoredRequest | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(LINES_STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const candidate = parsed as Partial<StoredRequest>;
    if (!Array.isArray(candidate.lines)) return null;

    // Drop anything malformed rather than failing the whole read: a partial
    // list beats an empty one when someone is twenty lines in.
    const lines = candidate.lines.filter(isOrderLine);
    const currency = candidate.currency === "USD" ? "USD" : "CAD";
    const excluded = Array.isArray(candidate.excluded)
      ? candidate.excluded.filter(
          (id): id is string =>
            typeof id === "string" &&
            lines.some((line) => line.partId === id),
        )
      : [];

    return { lines, currency, excluded };
  } catch {
    return null;
  }
}

export function writeStoredRequest(value: StoredRequest): void {
  if (typeof window === "undefined") return;
  try {
    if (value.lines.length === 0) {
      window.sessionStorage.removeItem(LINES_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(LINES_STORAGE_KEY, JSON.stringify(value));
    }
  } catch {
    // Persistence is a convenience; never let it break the request.
  }
}

function readStoredConfirmation(): RequestConfirmation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CONFIRMATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const candidate = parsed as Partial<RequestConfirmation>;
    return typeof candidate.reference === "string" &&
      Array.isArray(candidate.lines)
      ? (candidate as RequestConfirmation)
      : null;
  } catch {
    return null;
  }
}

function writeStoredConfirmation(value: RequestConfirmation | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      window.sessionStorage.setItem(
        CONFIRMATION_STORAGE_KEY,
        JSON.stringify(value),
      );
    } else {
      window.sessionStorage.removeItem(CONFIRMATION_STORAGE_KEY);
    }
  } catch {
    // Persistence is a convenience.
  }
}

export interface RequestContextValue extends RequestTotals {
  submissionAvailable: boolean;
  requestError: string;
  hydrationError: string;
  retryHydration: () => void;
  lines: OrderLine[];
  /**
   * The lines actually going on the request. Totals, the piece count and the
   * submission are all built from THESE, so unticking a part takes it out of
   * the cost and out of what ships.
   */
  includedLines: OrderLine[];
  isIncluded: (partId: string) => boolean;
  toggleIncluded: (partId: string) => void;
  setAllIncluded: (included: boolean) => void;
  currency: Currency;
  /** Total pieces across the INCLUDED lines. */
  itemCount: number;
  /** The account the discount comes from. Null until accounts exist. */
  company: Company | null;
  discountRate: number;
  /** False until the stored list has been read; guards the empty state. */
  linesHydrated: boolean;
  lastConfirmation: RequestConfirmation | null;
  confirmationHydrated: boolean;
  /** True only after validated lines and identity persistence commit. */
  addParts: (parts: RequestPartInput[]) => Promise<boolean>;
  updateQty: (partId: string, qty: number) => void;
  removeLine: (partId: string) => void;
  clear: () => void;
  /** Empties the list into a confirmation. Null when there is nothing to send. */
  submit: (details: RequestDetails) => RequestConfirmation | null;
}

const RequestContext = createContext<RequestContextValue | null>(null);

export interface RequestProviderProps {
  apiSession?: MeResponse | null;
  children: ReactNode;
  /**
   * The company the request is priced for. Passed in rather than read from a
   * session because there is no auth yet; when there is, this is the one line
   * that changes.
   */
  company?: Company | null;
}

/** The parts request being assembled across figures. */
export function RequestProvider(props: RequestProviderProps) {
  return <RequestProviderState key={props.apiSession ? scopeKey(props.apiSession) : "fixture"} {...props} />;
}

function RequestProviderState({
  children,
  company = null,
  apiSession = null,
}: RequestProviderProps) {
  const [state, dispatch] = useReducer(requestReducer, initialRequestState);
  const [requestError, setRequestError] = useState("");
  const [hydrationError, setHydrationError] = useState("");
  const [hydrationAttempt, retryHydration] = useReducer((attempt: number) => attempt + 1, 0);
  const apiKey = apiSession ? `rdpp:api-request:${scopeKey(apiSession)}` : null;
  const lifetime = useRef(0);
  const commits = useRef<((committed: boolean) => void)[]>([]);
  useEffect(() => {
    const token = ++lifetime.current;
    const pending = commits.current;
    return () => { lifetime.current = token + 1; for (const settle of pending.splice(0)) settle(false); };
  }, []);

  // A twenty-line request built on a mine site must survive an accidental
  // refresh. Read after mount — the server cannot see sessionStorage.
  useEffect(() => {
    if (!apiKey) { dispatch({ type: "hydrateLines", stored: readStoredRequest() }); return; }
    let cancelled = false;
    try { for (const key of [LINES_STORAGE_KEY, CONFIRMATION_STORAGE_KEY, "rdpp:machine:v1", "rdpp:recent-figures:v1"]) sessionStorage.removeItem(key); } catch { /* Storage is optional. */ }
    void revalidateRequestIdentities(readRequestIdentities(apiKey)).then(parts => {
      if (cancelled) return;
      dispatch({ type: "add", parts });
      dispatch({ type: "hydrateLines", stored: null });
      setHydrationError("");
    }).catch(() => { if (!cancelled) setHydrationError("Saved parts could not be revalidated. Your saved identities are retained; retry when catalogue access is available."); });
    return () => { cancelled = true; };
  }, [apiKey, hydrationAttempt]);

  useEffect(() => {
    // Don't write before the read has happened, or the empty initial state
    // would wipe what is already stored.
    if (!state.linesHydrated) return;
    if (apiKey) { writeRequestIdentities(apiKey, state.lines); return; }
    writeStoredRequest({
      lines: state.lines,
      currency: state.currency,
      excluded: state.excluded,
    });
  }, [apiKey, state.linesHydrated, state.lines, state.currency, state.excluded]);

  // Resolve after React commits the lines and the persistence effect above.
  useEffect(() => { for (const settle of commits.current.splice(0)) settle(true); }, [state.lines]);

  // The confirmation outlives the request list so /request/confirmed survives
  // a refresh too.
  useEffect(() => {
    dispatch({
      type: "hydrateConfirmation",
      confirmation: apiKey ? null : readStoredConfirmation(),
    });
  }, [apiKey]);

  useEffect(() => {
    if (!state.confirmationHydrated || apiKey) return;
    writeStoredConfirmation(state.lastConfirmation);
  }, [apiKey, state.confirmationHydrated, state.lastConfirmation]);

  const addParts = useCallback(
    async (parts: RequestPartInput[]): Promise<boolean> => {
      if (!state.linesHydrated) { setRequestError("Saved request loading has not completed. Open the request and retry before adding parts."); return false; }
      const token = lifetime.current;
      const additions = parts.filter(({ qty = 1 }) => Number.isFinite(qty) && qty > 0);
      if (!additions.length) return true;
      setRequestError("");
      try {
        const fresh = apiKey ? await revalidateRequestIdentities(additions.map(({ part, qty = 1 }) => ({ partId: part.id, releasePartId: part.releasePartId ?? "", qty }))) : additions;
        if (token !== lifetime.current) return false;
        return await new Promise<boolean>(resolve => {
          commits.current.push(resolve);
          dispatch({ type: "add", parts: fresh });
        });
      } catch {
        if (token === lifetime.current) setRequestError("Parts could not be revalidated. Refresh the catalogue and try again.");
        return false;
      }
    },
    [apiKey, state.linesHydrated],
  );
  const updateQty = useCallback(
    (partId: string, qty: number) =>
      dispatch({ type: "updateQty", partId, qty }),
    [],
  );
  const removeLine = useCallback(
    (partId: string) => dispatch({ type: "remove", partId }),
    [],
  );
  const clear = useCallback(() => dispatch({ type: "clear" }), []);
  const toggleIncluded = useCallback(
    (partId: string) => dispatch({ type: "toggleIncluded", partId }),
    [],
  );
  const setAllIncluded = useCallback(
    (included: boolean) => dispatch({ type: "setAllIncluded", included }),
    [],
  );

  const discountRate = company?.discountRate ?? 0;

  const excludedSet = useMemo(
    () => new Set(state.excluded),
    [state.excluded],
  );

  const includedLines = useMemo(
    () => state.lines.filter((line) => !excludedSet.has(line.partId)),
    [state.lines, excludedSet],
  );

  const isIncluded = useCallback(
    (partId: string) => !excludedSet.has(partId),
    [excludedSet],
  );

  // Cost follows the ticks, not the list.
  const totals = useMemo(
    () => apiSession && !apiSession.scopes.canViewPrices ? {} : computeTotals(includedLines, discountRate),
    [apiSession, includedLines, discountRate],
  );

  const itemCount = useMemo(
    () => includedLines.reduce((sum, line) => sum + line.qty, 0),
    [includedLines],
  );

  const submit = useCallback(
    (details: RequestDetails): RequestConfirmation | null => {
    if (apiKey) return null;
    // Nothing ticked is nothing to send, even with parts on the list.
    if (includedLines.length === 0) return null;

    const confirmation: RequestConfirmation = {
      // Generated in the handler, never during render, so the server and the
      // client never disagree on it.
      reference: buildReference(new Date(), Math.random()),
      details,
      submittedAt: new Date().toISOString(),
      lines: includedLines,
      totals: computeTotals(includedLines, discountRate),
      discountRate,
      companyName: company?.name ?? null,
      currency: state.currency,
    };

    dispatch({ type: "submit", confirmation });
    return confirmation;
    },
    [apiKey, includedLines, state.currency, discountRate, company],
  );

  const value = useMemo<RequestContextValue>(
    () => ({
      submissionAvailable: !apiKey,
      requestError,
      hydrationError,
      retryHydration,
      lines: state.lines,
      includedLines,
      isIncluded,
      toggleIncluded,
      setAllIncluded,
      currency: state.currency,
      itemCount,
      company,
      discountRate,
      linesHydrated: state.linesHydrated,
      lastConfirmation: state.lastConfirmation,
      confirmationHydrated: state.confirmationHydrated,
      ...totals,
      addParts,
      updateQty,
      removeLine,
      clear,
      submit,
    }),
    [
      apiKey,
      requestError,
      hydrationError,
      state.lines,
      includedLines,
      isIncluded,
      toggleIncluded,
      setAllIncluded,
      state.currency,
      state.linesHydrated,
      state.lastConfirmation,
      state.confirmationHydrated,
      itemCount,
      company,
      discountRate,
      totals,
      addParts,
      updateQty,
      removeLine,
      clear,
      submit,
    ],
  );

  return (
    <RequestContext.Provider value={value}>{children}</RequestContext.Provider>
  );
}

export function useRequest(): RequestContextValue {
  const value = useContext(RequestContext);
  if (!value) {
    throw new Error("useRequest must be used inside <RequestProvider>.");
  }
  return value;
}
