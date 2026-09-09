"use client";

import { useEffect, useReducer } from "react";
import { useCustomerSession } from "./SessionBoundary";

export const RECENT_STORAGE_KEY = "rdpp:recent-figures:v1";
const LIMIT = 6;

/** A figure the user has opened. Denormalised so the home screen needs no fetch. */
export interface RecentFigure {
  figureId: string;
  groupNo: string;
  figureName: string;
  systemName: string;
  /** ISO timestamp. */
  viewedAt: string;
}

function isRecentFigure(value: unknown): value is RecentFigure {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<RecentFigure>;
  return (
    typeof candidate.figureId === "string" &&
    typeof candidate.groupNo === "string" &&
    typeof candidate.figureName === "string" &&
    typeof candidate.systemName === "string"
  );
}

export function readRecentFigures(): RecentFigure[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecentFigure) : [];
  } catch {
    return [];
  }
}

/**
 * Record a visit. Deliberately not a hook and holds no React state, so the
 * figure screen can call it from an effect without triggering a re-render.
 */
export function recordRecentFigure(entry: Omit<RecentFigure, "viewedAt">): void {
  if (typeof window === "undefined") return;
  try {
    const existing = readRecentFigures().filter(
      (item) => item.figureId !== entry.figureId,
    );
    const next = [
      { ...entry, viewedAt: new Date().toISOString() },
      ...existing,
    ].slice(0, LIMIT);
    window.sessionStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Recently-viewed is a convenience; never let it break the screen.
  }
}

/** Read the list for display. Empty on the server and until hydration lands. */
export function useRecentlyViewed(): {
  items: RecentFigure[];
  hydrated: boolean;
} {
  const session = useCustomerSession();
  const [state, dispatch] = useReducer(
    (
      _state: { items: RecentFigure[]; hydrated: boolean },
      items: RecentFigure[],
    ) => ({ items, hydrated: true }),
    { items: [], hydrated: false },
  );

  useEffect(() => {
    dispatch(session ? [] : readRecentFigures());
  }, [session]);

  return state;
}
