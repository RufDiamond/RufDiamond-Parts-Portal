"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  DrawingViewer,
  ZOOM_STEPS,
  type DrawingMarker,
} from "./DrawingViewer";
import styles from "./FullIllustration.module.css";
import type { DiagramRegionDocument } from "@/lib/drawing";
import type { SelectDiagramPart } from "@/state/useDiagramSelection";

export interface FullIllustrationProps {
  /** Sheet caption, e.g. "Sheet 13 / 18". */
  label: string;
  src?: string;
  width?: number;
  height?: number;
  note?: string;
  markers: DrawingMarker[];
  document?: DiagramRegionDocument;
  onSelectPart?: SelectDiagramPart;
  onClearSelection?: () => void;
  previewNotice?: string | null;
  selectedPartIds?: ReadonlySet<string>;
  hoveredPartId?: string | null;
  onTogglePart?: (partId: string) => void;
  onHoverPart?: (partId: string | null) => void;
  /** "MODEL IMAGE > FAT TRUCK FT3 WAGON > CABIN > WINDOWS". */
  trail: string;
  date: string;
  onClose: () => void;
}

/**
 * The whole plate, opened over the workspace — slide 37.
 *
 * The same sheet as the cropped part, but showing the illustration entire
 * rather than a region, and carrying its own magnification: the deck puts zoom
 * out and zoom in at the top right, where the crop sheet keeps Print and
 * Export. Markers stay live, so a part can still be lit from here.
 */
export function FullIllustration({
  label,
  src,
  width,
  height,
  note,
  markers,
  document,
  onSelectPart,
  onClearSelection,
  previewNotice = null,
  selectedPartIds,
  hoveredPartId,
  onTogglePart,
  onHoverPart,
  trail,
  date,
  onClose,
}: FullIllustrationProps) {
  const [zoom, setZoom] = useState(1);

  const stepZoom = (direction: 1 | -1) =>
    setZoom((current) => {
      const i = ZOOM_STEPS.indexOf(current);
      const next = i === -1 ? 0 : i + direction;
      return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, next))];
    });

  // The deck draws no close control on this sheet, so Escape has to work.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-label="Illustration full screen"
    >
      <div className={styles.panel}>
        <header className={styles.head}>
          <div className={styles.brand}>
            <Image
              src="/brand/crop-logo.png"
              alt="RUFDIAMOND"
              width={300}
              height={58}
              className={styles.logo}
            />
          </div>

          <div className={styles.actions}>
            {onClearSelection ? <button type="button" onClick={onClearSelection}>Clear selection</button> : null}
            <button
              type="button"
              className={styles.action}
              onClick={() => stepZoom(-1)}
              disabled={zoom === ZOOM_STEPS[0]}
              aria-label="Zoom out"
              title="Zoom out"
            >
              <Image src="/toolbar/zoom-out.png" alt="" width={40} height={40}
                className={styles.actionIcon} />
            </button>
            <button
              type="button"
              className={styles.action}
              onClick={() => stepZoom(1)}
              disabled={zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1]}
              aria-label="Zoom in"
              title="Zoom in"
            >
              <Image src="/toolbar/zoom-in.png" alt="" width={40} height={40}
                className={styles.actionIcon} />
            </button>
            <button
              type="button"
              className={styles.close}
              onClick={onClose}
              aria-label="Close the illustration"
            >
              <svg
                viewBox="0 0 12 12"
                width="12"
                height="12"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M1.5 1.5 L10.5 10.5 M10.5 1.5 L1.5 10.5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          <div className={styles.titleBlock}>
            <Image
              src="/toolbar/fit.png"
              alt=""
              width={40}
              height={40}
              className={styles.titleIcon}
            />
            <div>
              <p className={styles.title}>Illustration full screen</p>
              <p className={styles.trail}>{trail}</p>
            </div>
          </div>

          <p className={styles.date}>Date: {date}</p>

          {previewNotice ? (
            <p role="status" className={styles.previewNotice}>
              {previewNotice} Use <strong>Zoom in</strong> for crowded labels.
            </p>
          ) : null}
        </header>

        <div className={styles.stage}>
          <DrawingViewer
            label={label}
            src={src}
            width={width}
            height={height}
            note={note}
            markers={markers}
            document={document}
            onSelectPart={onSelectPart}
            selectedPartIds={selectedPartIds}
            hoveredPartId={hoveredPartId}
            onTogglePart={onTogglePart}
            onHoverPart={onHoverPart}
            zoom={zoom}
            onZoomChange={setZoom}
          />
        </div>
      </div>
    </div>
  );
}
