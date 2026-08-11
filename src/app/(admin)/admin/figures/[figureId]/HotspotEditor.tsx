"use client";

import { useCallback, useMemo, useReducer, useState } from "react";
import { getAllParts } from "@/data/repository";
import { formatAmount, formatFigureRef } from "@/lib/format";
import { useAsync } from "@/state/useAsync";
import type { AdminPartRow } from "@/types/admin";
import type { FigureDetail } from "@/types/catalog";
import { AdminShell } from "../../AdminShell";
import shell from "../../admin.module.css";
import catalog from "../../catalog.module.css";
import styles from "./editor.module.css";

/** Placeholder until accounts exist. */
const OPERATOR = "C. Kane";

/** What a callout has attached. Null means the plate numbers it, nothing more. */
interface Attachment {
  partId: string;
  qty: number;
}

interface EditorState {
  /** Callout id → attachment, or null when unmapped. */
  map: Record<string, Attachment | null>;
  selectedCalloutId: string | null;
  pickedPartId: string | null;
  qty: string;
  /** Set by "Mark figure complete"; any later edit clears it. */
  complete: boolean;
}

type EditorAction =
  | { type: "select"; calloutId: string }
  | { type: "pick"; partId: string }
  | { type: "setQty"; qty: string }
  | { type: "attach" }
  | { type: "detach"; calloutId: string }
  | { type: "cancel" }
  | { type: "markComplete" };

function reducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "select":
      return {
        ...state,
        selectedCalloutId: action.calloutId,
        // Offer the current attachment as the starting point, so re-picking
        // an already-mapped callout is a correction rather than a reset.
        pickedPartId: state.map[action.calloutId]?.partId ?? null,
        qty: String(state.map[action.calloutId]?.qty ?? 1),
      };

    case "pick":
      return { ...state, pickedPartId: action.partId };

    case "setQty":
      return { ...state, qty: action.qty.replace(/[^\d]/g, "") };

    case "attach": {
      const { selectedCalloutId, pickedPartId } = state;
      if (!selectedCalloutId || !pickedPartId) return state;

      const qty = Math.max(1, Number.parseInt(state.qty, 10) || 1);

      return {
        ...state,
        map: { ...state.map, [selectedCalloutId]: { partId: pickedPartId, qty } },
        selectedCalloutId: null,
        pickedPartId: null,
        qty: "1",
        // The figure has changed, so a previous completion no longer holds.
        complete: false,
      };
    }

    case "detach":
      return {
        ...state,
        map: { ...state.map, [action.calloutId]: null },
        complete: false,
      };

    case "cancel":
      return { ...state, selectedCalloutId: null, pickedPartId: null, qty: "1" };

    case "markComplete":
      return { ...state, complete: true };

    default:
      return state;
  }
}

export interface HotspotEditorProps {
  detail: FigureDetail;
  parts: AdminPartRow[];
  sheet: string;
}

export function HotspotEditor({ detail, parts, sheet }: HotspotEditorProps) {
  const { figure, system, variant, rows, callouts } = detail;

  const [query, setQuery] = useState("");

  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    map: Object.fromEntries(
      callouts.map((callout) => {
        const row = rows.find(
          (candidate) => candidate.figurePart.id === callout.figurePartId,
        );
        return [
          callout.id,
          row ? { partId: row.part.id, qty: row.figurePart.qty } : null,
        ];
      }),
    ),
    selectedCalloutId: null,
    pickedPartId: null,
    qty: "1",
    complete: false,
  }));

  // Search goes through the repository so it matches whatever the backend
  // will do, rather than reimplementing the matching here.
  const run = useCallback(
    () => getAllParts(query.trim() ? { query } : {}),
    [query],
  );
  const { data } = useAsync(run);
  const pickerParts = data ?? parts;

  const partById = useMemo(
    () => new Map(parts.map((row) => [row.part.id, row.part])),
    [parts],
  );

  const mappedCount = callouts.filter(
    (callout) => state.map[callout.id],
  ).length;
  const allMapped = mappedCount === callouts.length;

  /** How many callouts on THIS figure already carry a given part. */
  const attachedCount = (partId: string) =>
    callouts.filter((callout) => state.map[callout.id]?.partId === partId)
      .length;

  /** Other callout numbers carrying the same part — a fact, not a conflict. */
  const othersWithSamePart = (calloutId: string) => {
    const attached = state.map[calloutId];
    if (!attached) return [];
    return callouts
      .filter(
        (callout) =>
          callout.id !== calloutId &&
          state.map[callout.id]?.partId === attached.partId,
      )
      .map((callout) => callout.number);
  };

  /**
   * Selecting a callout starts a fresh pick, so the search box resets too —
   * otherwise a filter from the previous callout silently hides most parts.
   */
  const selectCallout = (calloutId: string) => {
    setQuery("");
    dispatch({ type: "select", calloutId });
  };

  const selected = callouts.find(
    (callout) => callout.id === state.selectedCalloutId,
  );
  const canAttach = Boolean(state.selectedCalloutId && state.pickedPartId);
  const figureRef = formatFigureRef(figure.groupNo);

  return (
    <AdminShell
      active="figures"
      title={`${system.name} · ${figureRef}`}
      operator={OPERATOR}
      record={[
        { label: "Model", value: "FT3 Wagon" },
        { label: "System", value: system.name },
        { label: "Figure", value: figureRef },
        { label: "State", value: state.complete ? "Complete" : "Draft" },
        {
          label: "Mapped",
          value: `${mappedCount} / ${callouts.length} callouts`,
        },
      ]}
      actions={
        <>
          <span
            className={`${catalog.chip} ${state.complete ? catalog.chipLive : catalog.chipDraft}`}
          >
            {state.complete ? "Complete" : "Draft"}
          </span>
          <button type="button" className={shell.button} disabled>
            Replace drawing
          </button>
          <button
            type="button"
            className={`${shell.button} ${allMapped ? shell.buttonPrimary : ""}`}
            disabled={!allMapped || state.complete}
            title={
              allMapped
                ? "Every callout has a part"
                : `${callouts.length - mappedCount} callouts still have no part attached`
            }
            onClick={() => dispatch({ type: "markComplete" })}
          >
            {state.complete ? "Figure marked complete" : "Mark figure complete"}
          </button>
        </>
      }
    >
      <p className={styles.intro}>
        Select a callout on the drawing, then attach the part it points at. A
        part may be attached to more than one callout in the same figure — a
        repeated part is a valid mapping, not an error. Nothing publishes until
        every callout has a part.
      </p>

      <div className={styles.editor}>
        <div className={styles.plateColumn}>
          <div className={styles.plate}>
            <span className={styles.plateNote}>
              {figure.drawingFileId
                ? `Drawing ${figure.drawingFileId}`
                : `Assembly drawing not supplied — callouts positioned to ${figureRef}`}
            </span>

            {callouts.map((callout) => {
              const isMapped = Boolean(state.map[callout.id]);
              const isSelected = callout.id === state.selectedCalloutId;
              const part = state.map[callout.id]
                ? partById.get(state.map[callout.id]!.partId)
                : undefined;

              return (
                <button
                  key={callout.id}
                  type="button"
                  // Percentages of the plate, never pixels.
                  style={{ left: `${callout.x}%`, top: `${callout.y}%` }}
                  className={`${styles.marker} ${isMapped ? "" : styles.markerUnmapped} ${isSelected ? styles.markerSelected : ""}`}
                  aria-pressed={isSelected}
                  title={
                    part
                      ? `Callout ${callout.number}: ${part.partNumber} — ${part.description}`
                      : `Callout ${callout.number}: no part attached`
                  }
                  onClick={() => selectCallout(callout.id)}
                >
                  {callout.number}
                </button>
              );
            })}
          </div>

          <div className={styles.legend}>
            <span className={styles.legendMark}>i</span>
            <span>
              Dashed callouts have no part attached. They stay hidden from
              customers until mapped. Solid callouts are mapped; the filled
              callout is the one selected.
            </span>
          </div>
        </div>

        <div className={styles.mapColumn}>
          <div className={styles.mapHead}>
            <p className={styles.mapEyebrow}>Callout mapping</p>
            <p className={styles.mapCount}>
              {mappedCount} of {callouts.length} mapped
            </p>
            <div className={styles.progress}>
              <i
                className={styles.progressFill}
                style={{
                  width: `${(mappedCount / Math.max(1, callouts.length)) * 100}%`,
                }}
              />
            </div>
          </div>

          <div className={styles.rows}>
            {callouts.map((callout) => {
              const attached = state.map[callout.id];
              const part = attached ? partById.get(attached.partId) : undefined;
              const isSelected = callout.id === state.selectedCalloutId;
              const others = othersWithSamePart(callout.id);

              return (
                <div
                  key={callout.id}
                  role="button"
                  tabIndex={0}
                  className={`${styles.row} ${isSelected ? styles.rowSelected : ""}`}
                  onClick={() => selectCallout(callout.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectCallout(callout.id);
                    }
                  }}
                >
                  <span
                    className={`${styles.rowNum} ${attached ? styles.rowNumMapped : ""}`}
                  >
                    {callout.number}
                  </span>

                  <span className={styles.rowBody}>
                    <span className={styles.rowLabel}>
                      Callout {callout.number} · {callout.x}% × {callout.y}%
                    </span>
                    <span
                      className={`${styles.rowPart} ${attached ? "" : styles.rowPartEmpty}`}
                    >
                      {part && attached
                        ? `${part.partNumber} · ${part.description}${attached.qty > 1 ? `  ×${attached.qty}` : ""}`
                        : "No part attached"}
                    </span>
                    {others.length > 0 ? (
                      <span className={styles.rowRepeat}>
                        Same part at callout {others.join(", ")}
                      </span>
                    ) : null}
                  </span>

                  {attached ? (
                    <button
                      type="button"
                      className={styles.detach}
                      onClick={(event) => {
                        event.stopPropagation();
                        dispatch({ type: "detach", calloutId: callout.id });
                      }}
                    >
                      Detach
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className={styles.attach}>
            <p className={styles.attachEyebrow}>Attach a part</p>

            {!selected ? (
              <p className={styles.attachHint}>
                Select a callout on the drawing to begin.
              </p>
            ) : (
              <div>
                <p className={styles.attachTarget}>
                  Callout {selected.number} — {selected.x}% × {selected.y}%
                </p>

                <input
                  className={styles.search}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search part number or description"
                  aria-label="Search parts"
                />

                <div className={styles.picker}>
                  {pickerParts.length === 0 ? (
                    <p className={styles.pickerEmpty}>
                      No part matches that search.
                    </p>
                  ) : (
                    pickerParts.map(({ part }) => {
                      const used = attachedCount(part.id);
                      const isActive = part.id === state.pickedPartId;

                      return (
                        <button
                          key={part.id}
                          type="button"
                          className={`${styles.pickerRow} ${isActive ? styles.pickerRowActive : ""}`}
                          aria-pressed={isActive}
                          onClick={() =>
                            dispatch({ type: "pick", partId: part.id })
                          }
                        >
                          <span className={styles.pickerNo}>
                            {part.partNumber}
                          </span>
                          <span className={styles.pickerDesc}>
                            {part.description}
                            {used > 0 ? (
                              <span className={styles.pickerUsed}>
                                Attached at {used}{" "}
                                {used === 1 ? "callout" : "callouts"} in this
                                figure
                              </span>
                            ) : null}
                          </span>
                          <span className={styles.pickerPrice}>
                            {formatAmount(part.listPrice, part.currency)}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                <div className={styles.attachControls}>
                  <div className={styles.qtyField}>
                    <label className={styles.qtyLabel} htmlFor="attach-qty">
                      Qty
                    </label>
                    <input
                      id="attach-qty"
                      className={styles.qtyInput}
                      inputMode="numeric"
                      value={state.qty}
                      onChange={(event) =>
                        dispatch({ type: "setQty", qty: event.target.value })
                      }
                    />
                  </div>
                  <button
                    type="button"
                    className={styles.attachButton}
                    disabled={!canAttach}
                    title={canAttach ? undefined : "Pick a part first"}
                    onClick={() => dispatch({ type: "attach" })}
                  >
                    {canAttach
                      ? `Attach to callout ${selected.number}`
                      : "Pick a part"}
                  </button>
                </div>

                <button
                  type="button"
                  className={styles.cancel}
                  onClick={() => dispatch({ type: "cancel" })}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <p className={styles.intro} style={{ marginTop: 16, marginBottom: 0 }}>
        {variant.label} · sheet {sheet}. Changes are held in this session only —
        there is no backend to save to yet.
      </p>
    </AdminShell>
  );
}
