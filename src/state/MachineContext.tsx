"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { Model, Variant } from "@/types/catalog";

/** Bump the suffix when the stored shape changes; old payloads are dropped. */
export const MACHINE_STORAGE_KEY = "rdpp:machine:v1";

export interface MachineState {
  /** False until the sessionStorage read has run. Server renders as false. */
  hydrated: boolean;
  selectedModel: Model | null;
  selectedVariant: Variant | null;
}

export type MachineAction =
  | { type: "hydrate"; model: Model | null; variant: Variant | null }
  | { type: "set"; model: Model; variant: Variant }
  | { type: "clear" };

export const initialMachineState: MachineState = {
  hydrated: false,
  selectedModel: null,
  selectedVariant: null,
};

export function machineReducer(
  state: MachineState,
  action: MachineAction,
): MachineState {
  switch (action.type) {
    case "hydrate":
      // A machine chosen before hydration finished wins over the stored one.
      if (state.selectedVariant) return { ...state, hydrated: true };
      return {
        hydrated: true,
        selectedModel: action.model,
        selectedVariant: action.variant,
      };

    case "set":
      return {
        hydrated: state.hydrated,
        selectedModel: action.model,
        selectedVariant: action.variant,
      };

    case "clear":
      return { hydrated: state.hydrated, selectedModel: null, selectedVariant: null };

    default:
      return state;
  }
}

interface StoredMachine {
  model: Model;
  variant: Variant;
}

function isStoredMachine(value: unknown): value is StoredMachine {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<StoredMachine>;
  return (
    typeof candidate.model?.id === "string" &&
    typeof candidate.variant?.id === "string" &&
    candidate.variant.modelId === candidate.model.id
  );
}

export function readStoredMachine(): StoredMachine | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(MACHINE_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredMachine(parsed) ? parsed : null;
  } catch {
    // Private mode, quota, or a payload from an older shape. Start empty.
    return null;
  }
}

export function writeStoredMachine(value: StoredMachine | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      window.sessionStorage.setItem(MACHINE_STORAGE_KEY, JSON.stringify(value));
    } else {
      window.sessionStorage.removeItem(MACHINE_STORAGE_KEY);
    }
  } catch {
    // Persistence is a convenience; losing it must not break the session.
  }
}

export interface MachineContextValue extends MachineState {
  setMachine: (model: Model, variant: Variant) => void;
  clearMachine: () => void;
}

const MachineContext = createContext<MachineContextValue | null>(null);

/**
 * Holds the machine the catalogue is scoped to, surviving a refresh through
 * sessionStorage — per-tab, so two tabs can sit on different serial ranges.
 */
export function MachineProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(machineReducer, initialMachineState);

  // sessionStorage cannot be read while rendering: the server has no access to
  // it, so reading during render would make the first client render disagree
  // with the server HTML. Hydration therefore happens after mount, and
  // `hydrated` marks the moment the stored value has been applied.
  useEffect(() => {
    const stored = readStoredMachine();
    dispatch({
      type: "hydrate",
      model: stored?.model ?? null,
      variant: stored?.variant ?? null,
    });
  }, []);

  useEffect(() => {
    // Don't write before the read has happened, or an empty initial state
    // would overwrite what is already stored.
    if (!state.hydrated) return;
    writeStoredMachine(
      state.selectedModel && state.selectedVariant
        ? { model: state.selectedModel, variant: state.selectedVariant }
        : null,
    );
  }, [state.hydrated, state.selectedModel, state.selectedVariant]);

  const setMachine = useCallback((model: Model, variant: Variant) => {
    if (variant.modelId !== model.id) {
      throw new Error(
        `Variant ${variant.id} does not belong to model ${model.id}.`,
      );
    }
    dispatch({ type: "set", model, variant });
  }, []);

  const clearMachine = useCallback(() => dispatch({ type: "clear" }), []);

  const value = useMemo<MachineContextValue>(
    () => ({ ...state, setMachine, clearMachine }),
    [state, setMachine, clearMachine],
  );

  return (
    <MachineContext.Provider value={value}>{children}</MachineContext.Provider>
  );
}

export function useMachine(): MachineContextValue {
  const value = useContext(MachineContext);
  if (!value) {
    throw new Error("useMachine must be used inside <MachineProvider>.");
  }
  return value;
}
