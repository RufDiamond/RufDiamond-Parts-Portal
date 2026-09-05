"use client";

import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import { getAllParts } from "@/data/repository";
import { formatPrice, formatFigureRef } from "@/lib/format";
import { useAsync } from "@/state/useAsync";
import type { AdminPartRow } from "@/types/admin";
import type { FigureDetail } from "@/types/catalog";
import { AdminShell } from "../../AdminShell";
import shell from "../../admin.module.css";
import catalog from "../../catalog.module.css";
import styles from "./editor.module.css";

/** Placeholder until accounts exist. */
const OPERATOR = "C. Kane";

/** What the editor knows about one callout. */
interface CalloutState {
  /** Percentages of the plate, or null until the marker is placed. */
  x: number | null;
  y: number | null;
  /** Normally supplied by the import; null where the export was incomplete. */
  partId: string | null;
  qty: number;
}

interface EditorState {
  map: Record<string, CalloutState>;
  selectedCalloutId: string | null;
  /** Only used by the secondary attach-a-part path. */
  pickedPartId: string | null;
  qty: string;
  /** Set by "Mark figure complete"; any later edit clears it. */
  complete: boolean;
}

type EditorAction =
  | { type: "select"; calloutId: string }
  | { type: "place"; x: number; y: number }
  | { type: "clearPosition"; calloutId: string }
  | { type: "pick"; partId: string }
  | { type: "setQty"; qty: string }
  | { type: "attach" }
  | { type: "detach"; calloutId: string }
  | { type: "cancel" }
  | { type: "markComplete" };

function reducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "select": {
      const current = state.map[action.calloutId];
      return {
        ...state,
        selectedCalloutId: action.calloutId,
        pickedPartId: current?.partId ?? null,
        qty: String(current?.qty ?? 1),
      };
    }

    case "place": {
      const { selectedCalloutId } = state;
      if (!selectedCalloutId) return state;

      return {
        ...state,
        map: {
          ...state.map,
          [selectedCalloutId]: {
            ...state.map[selectedCalloutId],
            x: action.x,
            y: action.y,
          },
        },
        // Placing is a run of small actions, so selection clears ready for the
        // next callout rather than staying armed over the plate.
        selectedCalloutId: null,
        complete: false,
      };
    }

    case "clearPosition":
      return {
        ...state,
        map: {
          ...state.map,
          [action.calloutId]: {
            ...state.map[action.calloutId],
            x: null,
            y: null,
          },
        },
        complete: false,
      };

    case "pick":
      return { ...state, pickedPartId: action.partId };

    case "setQty":
      return { ...state, qty: action.qty.replace(/[^\d]/g, "") };

    case "attach": {
      const { selectedCalloutId, pickedPartId } = state;
      if (!selectedCalloutId || !pickedPartId) return state;

      return {
        ...state,
        map: {
          ...state.map,
          [selectedCalloutId]: {
            ...state.map[selectedCalloutId],
            partId: pickedPartId,
            qty: Math.max(1, Number.parseInt(state.qty, 10) || 1),
          },
        },
        pickedPartId: null,
        qty: "1",
        complete: false,
      };
    }

    case "detach":
      return {
        ...state,
        map: {
          ...state.map,
          [action.calloutId]: {
            ...state.map[action.calloutId],
            partId: null,
            qty: 1,
          },
        },
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
  const { figure, drawing, system, variant, rows, callouts } = detail;

  const [query, setQuery] = useState("");
  const plateRef = useRef<HTMLDivElement>(null);

  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    map: Object.fromEntries(
      callouts.map((callout) => {
        const row = rows.find(
          (candidate) => candidate.figurePart.id === callout.figurePartId,
        );
        return [
          callout.id,
          {
            x: callout.x,
            y: callout.y,
            partId: row?.part.id ?? null,
            qty: row?.figurePart.qty ?? 1,
          },
        ];
      }),
    ),
    selectedCalloutId: null,
    pickedPartId: null,
    qty: "1",
    complete: false,
  }));

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

  const placedCount = callouts.filter(
    (callout) => state.map[callout.id]?.x !== null,
  ).length;
  const partlessCount = callouts.filter(
    (callout) => state.map[callout.id]?.partId === null,
  ).length;

  // Both conditions gate publication, so both gate completion.
  const canComplete =
    placedCount === callouts.length && partlessCount === 0;

  const selected = callouts.find(
    (callout) => callout.id === state.selectedCalloutId,
  );
  const selectedState = selected ? state.map[selected.id] : undefined;

  const selectCallout = (calloutId: string) => {
    setQuery("");
    dispatch({ type: "select", calloutId });
  };

  /**
   * The primary gesture: click the plate to give the selected callout a
   * position. Stored as percentages of the plate, never pixels, so the
   * drawing can be replaced at another resolution.
   */
  const placeAtClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!state.selectedCalloutId || !plateRef.current) return;

    const rect = plateRef.current.getBoundingClientRect();
    const round = (value: number) => Math.round(value * 10) / 10;
    const clamp = (value: number) => Math.min(100, Math.max(0, value));

    dispatch({
      type: "place",
      x: round(clamp(((event.clientX - rect.left) / rect.width) * 100)),
      y: round(clamp(((event.clientY - rect.top) / rect.height) * 100)),
    });
  };

  const attachedCount = (partId: string) =>
    callouts.filter((callout) => state.map[callout.id]?.partId === partId)
      .length;

  const othersWithSamePart = (calloutId: string) => {
    const attached = state.map[calloutId];
    if (!attached?.partId) return [];
    return callouts
      .filter(
        (callout) =>
          callout.id !== calloutId &&
          state.map[callout.id]?.partId === attached.partId,
      )
      .map((callout) => callout.number);
  };

  const figureRef = formatFigureRef(figure.groupNo);
  const unplaced = callouts.length - placedCount;

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
          label: "Placed",
          value: `${placedCount} / ${callouts.length} callouts`,
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
            className={`${shell.button} ${canComplete ? shell.buttonPrimary : ""}`}
            disabled={!canComplete || state.complete}
            title={
              canComplete
                ? "Every callout has a position and a part"
                : [
                    unplaced > 0
                      ? `${unplaced} ${unplaced === 1 ? "callout has" : "callouts have"} no position`
                      : null,
                    partlessCount > 0
                      ? `${partlessCount} ${partlessCount === 1 ? "has" : "have"} no part attached`
                      : null,
                  ]
                    .filter(Boolean)
                    .join("; ")
            }
            onClick={() => dispatch({ type: "markComplete" })}
          >
            {state.complete ? "Figure marked complete" : "Mark figure complete"}
          </button>
        </>
      }
    >
      <p className={styles.intro}>
        The import brings the callout numbers and the parts they point at, but
        not where they sit on the plate. Select a callout, then click the
        drawing to place its marker. A part may key more than one callout — a
        repeated part is a valid mapping, not an error. Nothing publishes until
        every callout has both a position and a part.
      </p>

      <div className={styles.editor}>
        <div className={styles.plateColumn}>
          <div
            ref={plateRef}
            className={`${styles.plate} ${state.selectedCalloutId ? styles.plateArmed : ""}`}
            // Coordinates are read off this box as percentages, so it must
            // carry the plate's own aspect ratio. Any other shape letterboxes
            // the drawing and every placement lands off target.
            style={
              drawing
                ? { aspectRatio: `${drawing.width} / ${drawing.height}` }
                : undefined
            }
            onClick={placeAtClick}
          >
            {drawing ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={drawing.storagePath}
                alt={`${figureRef} ${figure.name}`}
                className={styles.plateImage}
                draggable={false}
              />
            ) : null}

            {selected || !drawing ? (
              <span
                className={`${styles.plateNote} ${drawing ? styles.plateHint : ""}`}
              >
                {selected
                  ? `Click to place callout ${selected.number}`
                  : `Assembly drawing not supplied — callouts placed against ${figureRef}`}
              </span>
            ) : null}

            {callouts.map((callout) => {
              const current = state.map[callout.id];
              if (!current || current.x === null || current.y === null) {
                return null;
              }

              const isSelected = callout.id === state.selectedCalloutId;
              const part = current.partId
                ? partById.get(current.partId)
                : undefined;

              return (
                <button
                  key={callout.id}
                  type="button"
                  style={{ left: `${current.x}%`, top: `${current.y}%` }}
                  className={`${styles.marker} ${part ? "" : styles.markerUnmapped} ${isSelected ? styles.markerSelected : ""}`}
                  aria-pressed={isSelected}
                  title={
                    part
                      ? `Callout ${callout.number}: ${part.partNumber} — ${part.description}`
                      : `Callout ${callout.number}: no part attached`
                  }
                  onClick={(event) => {
                    // Selecting a placed marker must not also re-place it.
                    event.stopPropagation();
                    selectCallout(callout.id);
                  }}
                >
                  {callout.number}
                </button>
              );
            })}
          </div>

          <div className={styles.legend}>
            <span className={styles.legendMark}>i</span>
            <span>
              Only placed callouts appear on the plate. A dashed marker has a
              position but no part attached; the filled marker is the one
              selected. Unplaced callouts are listed on the right.
            </span>
          </div>
        </div>

        <div className={styles.mapColumn}>
          <div className={styles.mapHead}>
            <p className={styles.mapEyebrow}>Callout mapping</p>
            <p className={styles.mapCount}>
              {placedCount} of {callouts.length} placed
            </p>
            <div className={styles.progress}>
              <i
                className={styles.progressFill}
                style={{
                  width: `${(placedCount / Math.max(1, callouts.length)) * 100}%`,
                }}
              />
            </div>
            {partlessCount > 0 ? (
              <p className={styles.mapSub}>
                {partlessCount}{" "}
                {partlessCount === 1 ? "callout has" : "callouts have"} no part
                attached
              </p>
            ) : null}
          </div>

          <div className={styles.rows}>
            {callouts.map((callout) => {
              const current = state.map[callout.id];
              const part = current?.partId
                ? partById.get(current.partId)
                : undefined;
              const isSelected = callout.id === state.selectedCalloutId;
              const isPlaced = Boolean(current && current.x !== null);
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
                    className={`${styles.rowNum} ${isPlaced ? styles.rowNumMapped : ""}`}
                  >
                    {callout.number}
                  </span>

                  <span className={styles.rowBody}>
                    <span className={styles.rowLabel}>
                      {isPlaced && current
                        ? `Placed at ${current.x}% × ${current.y}%`
                        : "Not placed"}
                    </span>
                    <span
                      className={`${styles.rowPart} ${part ? "" : styles.rowPartEmpty}`}
                    >
                      {part && current
                        ? `${part.partNumber} · ${part.description}${current.qty > 1 ? `  ×${current.qty}` : ""}`
                        : "No part attached"}
                    </span>
                    {others.length > 0 ? (
                      <span className={styles.rowRepeat}>
                        Same part at callout {others.join(", ")}
                      </span>
                    ) : null}
                  </span>

                  {isPlaced ? (
                    <button
                      type="button"
                      className={styles.detach}
                      title="Take the marker off the plate"
                      onClick={(event) => {
                        event.stopPropagation();
                        dispatch({
                          type: "clearPosition",
                          calloutId: callout.id,
                        });
                      }}
                    >
                      Unplace
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className={styles.attach}>
            {!selected || !selectedState ? (
              <>
                <p className={styles.attachEyebrow}>Place a callout</p>
                <p className={styles.attachHint}>
                  Select a callout to place it on the drawing.
                </p>
              </>
            ) : (
              <div>
                <p className={styles.attachEyebrow}>Callout {selected.number}</p>
                <p className={styles.attachTarget}>
                  {selectedState.x === null
                    ? "Click the drawing to place this marker."
                    : `Placed at ${selectedState.x}% × ${selectedState.y}%. Click the drawing again to move it.`}
                </p>

                {/* Secondary path: only offered where the import left no part. */}
                {selectedState.partId === null ? (
                  <>
                    <p className={styles.attachEyebrow}>Attach a part</p>
                    <p className={styles.attachHint}>
                      This callout arrived without a part — the export row was
                      incomplete.
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
                                {formatPrice(part.listPrice, part.currency)}
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
                        disabled={!state.pickedPartId}
                        title={
                          state.pickedPartId ? undefined : "Pick a part first"
                        }
                        onClick={() => dispatch({ type: "attach" })}
                      >
                        {state.pickedPartId
                          ? `Attach to callout ${selected.number}`
                          : "Pick a part"}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className={styles.attachHint}>
                    Part {partById.get(selectedState.partId)?.partNumber ?? "—"}{" "}
                    · {partById.get(selectedState.partId)?.description ?? ""}
                    <button
                      type="button"
                      className={styles.detachInline}
                      onClick={() =>
                        dispatch({ type: "detach", calloutId: selected.id })
                      }
                    >
                      Detach
                    </button>
                  </p>
                )}

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
