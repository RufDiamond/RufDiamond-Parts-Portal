"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { Company, Currency, OrderLine, Part } from "@/types/catalog";

/** What a caller hands to `addParts` — the part, and how many of it. */
export interface RequestPartInput {
  part: Part;
  /** Defaults to 1. */
  qty?: number;
}

export interface RequestTotals {
  /** Sum of the line totals at list price. */
  listTotal: number;
  /** Money taken off by the current company's rate. */
  discountApplied: number;
  /** listTotal − discountApplied. */
  netTotal: number;
}

export interface RequestState {
  lines: OrderLine[];
  /** Taken from the first part added; reset when the list empties. */
  currency: Currency;
}

export type RequestAction =
  | { type: "add"; parts: RequestPartInput[] }
  | { type: "updateQty"; partId: string; qty: number }
  | { type: "remove"; partId: string }
  | { type: "clear" };

export const initialRequestState: RequestState = { lines: [], currency: "CAD" };

/** Money is summed in cents to keep float dust out of the totals. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toLine(part: Part, qty: number): OrderLine {
  return {
    partId: part.id,
    partNumberSnapshot: part.partNumber,
    descriptionSnapshot: part.description,
    qty,
    unitPriceSnapshot: part.listPrice,
    lineTotal: round2(part.listPrice * qty),
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
          lines[index] = {
            ...existing,
            qty: nextQty,
            lineTotal: round2(existing.unitPriceSnapshot * nextQty),
          };
        }
      }

      return {
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
        lineTotal: round2(existing.unitPriceSnapshot * action.qty),
      };
      return { ...state, lines };
    }

    case "remove": {
      const lines = state.lines.filter((line) => line.partId !== action.partId);
      if (lines.length === state.lines.length) return state;
      return lines.length === 0 ? initialRequestState : { ...state, lines };
    }

    case "clear":
      return state.lines.length === 0 ? state : initialRequestState;

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
  const listTotal = round2(
    lines.reduce((sum, line) => sum + line.lineTotal, 0),
  );
  const rate = Math.min(1, Math.max(0, discountRate));
  const discountApplied = round2(listTotal * rate);

  return {
    listTotal,
    discountApplied,
    netTotal: round2(listTotal - discountApplied),
  };
}

export interface RequestContextValue extends RequestTotals {
  lines: OrderLine[];
  currency: Currency;
  /** Total pieces across all lines. */
  itemCount: number;
  /** The account the discount comes from. Null until accounts exist. */
  company: Company | null;
  discountRate: number;
  addParts: (parts: RequestPartInput[]) => void;
  updateQty: (partId: string, qty: number) => void;
  removeLine: (partId: string) => void;
  clear: () => void;
}

const RequestContext = createContext<RequestContextValue | null>(null);

export interface RequestProviderProps {
  children: ReactNode;
  /**
   * The company the request is priced for. Passed in rather than read from a
   * session because there is no auth yet; when there is, this is the one line
   * that changes.
   */
  company?: Company | null;
}

/** The parts request being assembled across figures. */
export function RequestProvider({
  children,
  company = null,
}: RequestProviderProps) {
  const [state, dispatch] = useReducer(requestReducer, initialRequestState);

  const addParts = useCallback(
    (parts: RequestPartInput[]) => dispatch({ type: "add", parts }),
    [],
  );
  const updateQty = useCallback(
    (partId: string, qty: number) => dispatch({ type: "updateQty", partId, qty }),
    [],
  );
  const removeLine = useCallback(
    (partId: string) => dispatch({ type: "remove", partId }),
    [],
  );
  const clear = useCallback(() => dispatch({ type: "clear" }), []);

  const discountRate = company?.discountRate ?? 0;

  const totals = useMemo(
    () => computeTotals(state.lines, discountRate),
    [state.lines, discountRate],
  );

  const itemCount = useMemo(
    () => state.lines.reduce((sum, line) => sum + line.qty, 0),
    [state.lines],
  );

  const value = useMemo<RequestContextValue>(
    () => ({
      lines: state.lines,
      currency: state.currency,
      itemCount,
      company,
      discountRate,
      ...totals,
      addParts,
      updateQty,
      removeLine,
      clear,
    }),
    [
      state.lines,
      state.currency,
      itemCount,
      company,
      discountRate,
      totals,
      addParts,
      updateQty,
      removeLine,
      clear,
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
