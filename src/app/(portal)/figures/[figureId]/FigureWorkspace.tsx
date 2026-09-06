"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DrawingViewer, PartsTable, Trail } from "@/components";
import { buildDrawingMarkers } from "@/lib/drawing";
import { useMachine } from "@/state/MachineContext";
import { useRequest } from "@/state/RequestContext";
import { useSelection } from "@/state/useSelection";
import { recordRecentFigure } from "@/state/useRecentlyViewed";
import type { FigureDetail } from "@/types/catalog";
import styles from "./figure.module.css";

/** The deck numbers the systems in catalogue order. */
const SYSTEM_NUMBERS: Record<string, string> = {
  "sys-filters": "1",
  "sys-frame-assy": "2",
  "sys-drive-system": "3",
  "sys-hydraulic": "4",
  "sys-tire-wheel": "5",
  "sys-cabin": "6",
  "sys-cowling-fender": "7",
  "sys-engine": "8",
  "sys-fuel-system": "9",
  "sys-electric": "10",
  "sys-tire-inflation": "11",
  "sys-accessories": "12",
};

const ZOOM_STEPS = [1, 1.5, 2, 3, 4];

export interface FigureWorkspaceProps {
  detail: FigureDetail;
  /** Sheet number as printed, e.g. "01 / 04". */
  sheet: string;
  /** Position within the system's figures, for the pager. */
  index: number;
  total: number;
  previousId: string | null;
  nextId: string | null;
  firstId: string | null;
  lastId: string | null;
}

export function FigureWorkspace({
  detail,
  sheet,
  index,
  total,
  previousId,
  nextId,
  firstId,
  lastId,
}: FigureWorkspaceProps) {
  const router = useRouter();
  const { figure, drawing, system, rows, callouts } = detail;
  const { selectedModel } = useMachine();
  const { addParts, removeLine, lines } = useRequest();

  const { selectedPartIds, toggle, hoveredPartId, setHoveredPartId } =
    useSelection({ rows, callouts });

  const markers = useMemo(
    () => buildDrawingMarkers(rows, callouts),
    [rows, callouts],
  );

  useEffect(() => {
    recordRecentFigure({
      figureId: figure.id,
      groupNo: figure.groupNo,
      figureName: figure.name,
      systemName: system.name,
    });
  }, [figure.id, figure.groupNo, figure.name, system.name]);

  const machineName = selectedModel?.name ?? "FT3 Wagon";
  const requestedPartIds = useMemo(
    () => new Set(lines.map((line) => line.partId)),
    [lines],
  );

  /** Ticking a row puts the part on the cart; clicking it only highlights. */
  const toggleRequested = (partId: string) => {
    if (requestedPartIds.has(partId)) {
      removeLine(partId);
      return;
    }
    const row = rows.find((candidate) => candidate.part.id === partId);
    if (row) addParts([{ part: row.part, qty: row.figurePart.qty }]);
  };

  const go = (id: string | null) => {
    if (id) router.push(`/figures/${id}`);
  };

  const unplaced = callouts.length - markers.length;

  /** Plate zoom. Markers are placed in percentages, so they scale with it. */
  const [zoom, setZoom] = useState(1);
  const stepZoom = (direction: 1 | -1) =>
    setZoom((current) => {
      const i = ZOOM_STEPS.indexOf(current);
      const next = i === -1 ? 0 : i + direction;
      return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, next))];
    });

  /** Hand the figure's parts list to the reader's mail client. */
  const emailFigure = () => {
    const lines = rows.map(
      (row) =>
        `${row.calloutNumbers.join(", ") || "-"}\t${row.part.partNumber}\t` +
        `${row.part.description}\tx${row.figurePart.qty}`,
    );
    const body = [
      `${figure.name} — Fat Truck ${machineName}`,
      "",
      "Ref\tPart no.\tDescription\tQty",
      ...lines,
    ].join("\n");
    window.location.href =
      `mailto:?subject=${encodeURIComponent(`Parts list — ${figure.name}`)}` +
      `&body=${encodeURIComponent(body)}`;
  };

  // The deck numbers the systems in catalogue order, e.g. "3 DRIVE SYSTEM".
  const systemNumber = SYSTEM_NUMBERS[system.id] ?? "";

  return (
    <div className={styles.screen}>
      <Trail
        steps={[
          `Fat Truck ${machineName}`,
          `${systemNumber} ${system.name}`.trim(),
          figure.name,
        ]}
      />

      <div className={styles.toolbar}>
        <div className={styles.pager}>
          <button
            type="button"
            className={styles.pagerStep}
            onClick={() => go(firstId)}
            disabled={!firstId || index === 0}
            aria-label="First sheet"
          >
            &laquo;
          </button>
          <button
            type="button"
            className={styles.pagerStep}
            onClick={() => go(previousId)}
            disabled={!previousId}
            aria-label="Previous sheet"
          >
            &lsaquo;
          </button>
          <span className={styles.pagerCount}>
            {index + 1} of {total}
          </span>
          <button
            type="button"
            className={styles.pagerStep}
            onClick={() => go(nextId)}
            disabled={!nextId}
            aria-label="Next sheet"
          >
            &rsaquo;
          </button>
          <button
            type="button"
            className={styles.pagerStep}
            onClick={() => go(lastId)}
            disabled={!lastId || index === total - 1}
            aria-label="Last sheet"
          >
            &raquo;
          </button>
        </div>

        <button
          type="button"
          className={`${styles.button} ${styles.iconButton}`}
          title="Crop a region — available in a later phase"
          aria-label="Crop a region"
          disabled
        >
          <Image src="/toolbar/crop.png" alt="" width={40} height={40}
            className={styles.buttonIcon} />
        </button>

        <button
          type="button"
          className={`${styles.button} ${styles.iconButton}`}
          onClick={() => setZoom(1)}
          disabled={zoom === 1}
          title="Fit the plate to the panel"
          aria-label="Fit to view"
        >
          <Image src="/toolbar/fit.png" alt="" width={40} height={40}
            className={styles.buttonIcon} />
        </button>

        <button
          type="button"
          className={`${styles.button} ${styles.iconButton}`}
          onClick={() => stepZoom(-1)}
          disabled={zoom === ZOOM_STEPS[0]}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <Image src="/toolbar/zoom-out.png" alt="" width={40} height={40}
            className={styles.buttonIcon} />
        </button>

        <button
          type="button"
          className={`${styles.button} ${styles.iconButton}`}
          onClick={() => stepZoom(1)}
          disabled={zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1]}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <Image src="/toolbar/zoom-in.png" alt="" width={40} height={40}
            className={styles.buttonIcon} />
        </button>

        <span className={styles.spacer} />

        <button type="button" className={styles.button} disabled
          title="The quote flow is a later phase">
          <Image src="/toolbar/quote.png" alt="" width={40} height={52}
            className={styles.buttonIcon} />
          Request a quote
        </button>

        <button
          type="button"
          className={styles.button}
          onClick={() =>
            rows.forEach((row) => {
              if (!requestedPartIds.has(row.part.id)) {
                addParts([{ part: row.part, qty: row.figurePart.qty }]);
              }
            })
          }
          disabled={rows.length === 0}
        >
          <Image src="/toolbar/cart-add.png" alt="" width={40} height={40}
            className={styles.buttonIcon} />
          Add to cart
        </button>

        <button
          type="button"
          className={styles.button}
          onClick={emailFigure}
          disabled={rows.length === 0}
          title="Email this parts list"
        >
          <Image src="/toolbar/email.png" alt="" width={40} height={28}
            className={styles.buttonIcon} />
          Email
        </button>

        <button
          type="button"
          className={styles.button}
          onClick={() => window.print()}
        >
          <Image src="/toolbar/print.png" alt="" width={40} height={40}
            className={styles.buttonIcon} />
          Print
        </button>

        <button
          type="button"
          className={styles.button}
          onClick={() => router.push("/request")}
        >
          <Image src="/toolbar/check-cart.png" alt="" width={40} height={40}
            className={styles.buttonIcon} />
          Check cart · {lines.length}
        </button>
      </div>

      <div className={styles.split}>
        <div className={styles.plate}>
          <DrawingViewer
            label={`Sheet ${sheet}`}
            src={drawing?.storagePath}
            width={drawing?.width}
            height={drawing?.height}
            note={`Assembly drawing not supplied — ${figure.name}`}
            markers={markers}
            selectedPartIds={selectedPartIds}
            hoveredPartId={hoveredPartId}
            onTogglePart={toggle}
            onHoverPart={setHoveredPartId}
            zoom={zoom}
          />
          {unplaced > 0 ? (
            <p className={styles.plateNotice}>
              {markers.length === 0
                ? `None of this figure's ${callouts.length} callout numbers have been positioned yet`
                : `${unplaced} of ${callouts.length} callout numbers are not positioned yet`}
              , so clicking a part cannot highlight it here. Match the Ref. no.
              column against the numbers printed on the plate.
            </p>
          ) : null}
        </div>

        <button
          type="button"
          className={styles.divider}
          aria-label="Collapse the drawing"
          title="Collapse — available in a later phase"
          disabled
        >
          &#10096;&#10097;
        </button>

        <div className={styles.list}>
          {rows.length === 0 ? (
            <p className={styles.empty}>
              The drawing for this figure is loaded, but its parts have not been
              imported yet.
            </p>
          ) : (
            <PartsTable
              rows={rows}
              selectedPartIds={selectedPartIds}
              hoveredPartId={hoveredPartId}
              onTogglePart={toggle}
              onHoverPart={setHoveredPartId}
              requestedPartIds={requestedPartIds}
              onToggleRequested={toggleRequested}
            />
          )}
        </div>
      </div>
    </div>
  );
}
