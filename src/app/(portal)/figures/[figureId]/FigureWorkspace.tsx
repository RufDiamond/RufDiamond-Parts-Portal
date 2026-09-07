"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  CroppedPart,
  DrawingViewer,
  FullIllustration,
  PartsTable,
  Trail,
  type CropRect,
} from "@/components";
import { buildDrawingMarkers } from "@/lib/drawing";
import { useMachine } from "@/state/MachineContext";
import { useRequest } from "@/state/RequestContext";
import { useSelection } from "@/state/useSelection";
import { recordRecentFigure } from "@/state/useRecentlyViewed";
import type { FigureDetail } from "@/types/catalog";
import styles from "./figure.module.css";

const ZOOM_STEPS = [1, 1.5, 2, 3, 4];

/*
 * The split between the drawing and the parts list, as a percentage of the
 * width. The deck draws it at 41/59; the handle moves it, stopping before
 * either side is too narrow to read.
 */
const SPLIT_DEFAULT = 41;
const SPLIT_MIN = 24;
const SPLIT_MAX = 76;
/** One press of an arrow key. */
const SPLIT_STEP = 2;

function clampSplit(value: number): number {
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, value));
}

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
  const { figure, drawing, system, variant, rows, callouts } = detail;
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

  /**
   * The tick and the lit marker are one state.
   *
   * Selecting a part — from a callout on the plate, a Ref number in the list,
   * or the row itself — puts it on the cart and ticks its box; clearing the
   * selection takes it off again. The two used to be separate, a click only
   * highlighting, but a reader who lights a part on the drawing means to order
   * it, and being made to tick it a second time reads as the click not having
   * worked.
   */
  const setRequested = (partId: string, wanted: boolean) => {
    if (wanted === requestedPartIds.has(partId)) return;
    if (!wanted) {
      removeLine(partId);
      return;
    }
    const row = rows.find((candidate) => candidate.part.id === partId);
    if (row) addParts([{ part: row.part, qty: row.figurePart.qty }]);
  };

  /** A callout, a Ref number or a row: select the part and tick it. */
  const toggleSelected = (partId: string) => {
    const selected = !selectedPartIds.has(partId);
    toggle(partId);
    setRequested(partId, selected);
  };

  /** The box itself, driving the same pair from the other end. */
  const toggleRequested = (partId: string) => {
    const wanted = !requestedPartIds.has(partId);
    setRequested(partId, wanted);
    if (wanted !== selectedPartIds.has(partId)) toggle(partId);
  };

  const go = (id: string | null) => {
    if (id) router.push(`/figures/${id}`);
  };

  const unplaced = callouts.length - markers.length;

  /*
   * The whole plate, opened over the workspace — slide 37. The deck puts this
   * on the second toolbar icon, where a "fit to view" used to sit; fitting is
   * what the zoom control already does.
   */
  const [fullScreen, setFullScreen] = useState(false);

  /** Plate zoom. Markers are placed in percentages, so they scale with it. */
  const [zoom, setZoom] = useState(1);
  const stepZoom = (direction: 1 | -1) =>
    setZoom((current) => {
      const i = ZOOM_STEPS.indexOf(current);
      const next = i === -1 ? 0 : i + direction;
      return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, next))];
    });

  /*
   * Crop. Arming the tool lets the reader drag a marquee over the plate; on
   * release the region opens enlarged in its own panel — slides 31 to 33. The
   * rectangle is kept in fractions of the plate so it survives any zoom.
   */
  const plateRef = useRef<HTMLDivElement>(null);
  const [cropping, setCropping] = useState(false);
  // The drag origin lives in a ref, not in state: mousedown and mouseup can
  // both land before React re-renders, and a state value would still read as
  // null by the time the release is handled.
  const splitRef = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(SPLIT_DEFAULT);
  /*
   * Whether the handle is being dragged. Held in a ref as well as in state:
   * the first pointermove can arrive before React has re-rendered, so a state
   * flag alone would read false and the opening moves would be dropped.
   */
  const resizingRef = useRef(false);
  /*
   * A drag ends in a click on whatever is under the pointer — a parts row, if
   * the handle was pulled that far — so the click that closes a drag is
   * swallowed before it can select anything.
   */
  const swallowClickRef = useRef(false);
  const [resizing, setResizing] = useState(false);

  /** Where the pointer is, as a share of the split's width. */
  const splitFromPointer = useCallback((clientX: number) => {
    const box = splitRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    setSplit(clampSplit(((clientX - box.left) / box.width) * 100));
  }, []);

  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [marquee, setMarquee] = useState<CropRect | null>(null);
  const [crop, setCrop] = useState<CropRect | null>(null);

  const pointFromEvent = (event: React.MouseEvent) => {
    const box = plateRef.current?.getBoundingClientRect();
    if (!box) return null;
    return {
      x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
    };
  };

  const rectBetween = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
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

  // The section number is the leading part of this figure's GROUPNO, e.g.
  // "6.1" puts it in section 6 — taken from the export, never assigned here.
  const systemNumber = figure.groupNo.split(".")[0] ?? "";

  return (
    <div className={styles.screen}>
      <Trail
        steps={[
          { label: `Fat Truck ${machineName}`, href: "/systems" },
          {
            label: `${systemNumber} ${system.name}`.trim(),
            href: `/systems/${system.id}`,
          },
          { label: figure.name },
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
          onClick={() => {
            setCropping((on) => !on);
            setMarquee(null);
          }}
          title={cropping ? "Cancel the crop" : "Crop a region of the plate"}
          aria-label="Crop a region"
          aria-pressed={cropping}
          data-armed={cropping || undefined}
        >
          <Image src="/toolbar/crop.png" alt="" width={40} height={40}
            className={styles.buttonIcon} />
        </button>

        <button
          type="button"
          className={`${styles.button} ${styles.iconButton}`}
          onClick={() => setFullScreen((on) => !on)}
          title="Open the illustration full screen"
          aria-label="Illustration full screen"
          aria-pressed={fullScreen}
          data-armed={fullScreen || undefined}
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

        <button
          type="button"
          className={styles.button}
          onClick={() => router.push("/request")}
          title="Review the cart and request a quote"
        >
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

      <div
        ref={splitRef}
        className={`${styles.split} ${resizing ? styles.splitResizing : ""}`}
        onClickCapture={(event) => {
          if (!swallowClickRef.current) return;
          swallowClickRef.current = false;
          event.stopPropagation();
          event.preventDefault();
        }}
        style={
          {
            "--split-left": `${split}fr`,
            "--split-right": `${100 - split}fr`,
            "--split-at": `${split}%`,
          } as CSSProperties
        }
      >
        <div
          ref={plateRef}
          className={`${styles.plate} ${cropping ? styles.plateArmed : ""}`}
          onMouseDown={(event) => {
            if (!cropping) return;
            const p = pointFromEvent(event);
            if (!p) return;
            event.preventDefault();
            dragRef.current = p;
            setMarquee({ x: p.x, y: p.y, w: 0, h: 0 });
          }}
          onMouseMove={(event) => {
            const origin = dragRef.current;
            if (!cropping || !origin) return;
            const p = pointFromEvent(event);
            if (p) setMarquee(rectBetween(origin, p));
          }}
          onMouseUp={(event) => {
            const origin = dragRef.current;
            if (!cropping || !origin) return;
            // Derive the rectangle from where the button was released rather
            // than from the last move: a drag can finish without any
            // intermediate mousemove ever firing.
            const end = pointFromEvent(event);
            const rect = end ? rectBetween(origin, end) : marquee;
            dragRef.current = null;
            setMarquee(null);
            // Ignore a stray click; a crop needs a real area.
            if (rect && rect.w > 0.02 && rect.h > 0.02) {
              setCrop(rect);
              setCropping(false);
            }
          }}
          onMouseLeave={() => {
            if (dragRef.current) {
              dragRef.current = null;
              setMarquee(null);
            }
          }}
        >
          <DrawingViewer
            label={`Sheet ${sheet}`}
            src={drawing?.storagePath}
            width={drawing?.width}
            height={drawing?.height}
            note={`Assembly drawing not supplied — ${figure.name}`}
            markers={markers}
            selectedPartIds={selectedPartIds}
            hoveredPartId={hoveredPartId}
            onTogglePart={toggleSelected}
            onHoverPart={setHoveredPartId}
            zoom={zoom}
            onZoomChange={setZoom}
          />
          {marquee ? (
            <span
              className={styles.marquee}
              style={{
                left: `${marquee.x * 100}%`,
                top: `${marquee.y * 100}%`,
                width: `${marquee.w * 100}%`,
                height: `${marquee.h * 100}%`,
              }}
            />
          ) : null}

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

        {/*
          The handle the deck draws between the two surfaces. Dragging it moves
          the split; the arrow keys move it a step at a time and a double-click
          puts it back where the deck has it.
        */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Width of the drawing"
          aria-valuenow={Math.round(split)}
          aria-valuemin={SPLIT_MIN}
          aria-valuemax={SPLIT_MAX}
          tabIndex={0}
          className={styles.divider}
          title="Drag to set the width of the drawing"
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            resizingRef.current = true;
            setResizing(true);
          }}
          onPointerMove={(event) => {
            if (!resizingRef.current) return;
            swallowClickRef.current = true;
            splitFromPointer(event.clientX);
          }}
          onPointerUp={(event) => {
            event.currentTarget.releasePointerCapture(event.pointerId);
            resizingRef.current = false;
            setResizing(false);
          }}
          onPointerCancel={() => {
            resizingRef.current = false;
            setResizing(false);
          }}
          onDoubleClick={() => setSplit(SPLIT_DEFAULT)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              setSplit((v) => clampSplit(v - SPLIT_STEP));
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              setSplit((v) => clampSplit(v + SPLIT_STEP));
            } else if (event.key === "Home") {
              event.preventDefault();
              setSplit(SPLIT_MIN);
            } else if (event.key === "End") {
              event.preventDefault();
              setSplit(SPLIT_MAX);
            } else if (event.key === "Enter") {
              event.preventDefault();
              setSplit(SPLIT_DEFAULT);
            }
          }}
        >
          <span aria-hidden="true">&#10096;&#10097;</span>
        </div>

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
              onTogglePart={toggleSelected}
              onHoverPart={setHoveredPartId}
              requestedPartIds={requestedPartIds}
              onToggleRequested={toggleRequested}
            />
          )}
        </div>
      </div>

      {fullScreen ? (
        <FullIllustration
          label={`Sheet ${sheet}`}
          src={drawing?.storagePath}
          width={drawing?.width}
          height={drawing?.height}
          note={`Assembly drawing not supplied — ${figure.name}`}
          markers={markers}
          selectedPartIds={selectedPartIds}
          hoveredPartId={hoveredPartId}
          onTogglePart={toggleSelected}
          onHoverPart={setHoveredPartId}
          trail={`Model image > Fat Truck ${machineName} > ${system.name} > ${figure.name}`}
          date={new Date().toLocaleDateString("en-CA", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
          onClose={() => setFullScreen(false)}
        />
      ) : null}

      {crop && drawing ? (
        <CroppedPart
          src={drawing.storagePath}
          rect={crop}
          trail={`Model image > Fat Truck ${machineName} > ${system.name} > ${figure.name}`}
          /*
           * The foot of the PDF retraces the whole route to the part, serial
           * range included — slide 36. It is the line that makes a printed
           * crop identifiable months later, off the screen it came from.
           */
          footerTrail={[
            "FIGURE SEARCH",
            "FAT TRUCK",
            `FAT TRUCK ${machineName}`,
            variant.serialFrom ?? variant.label,
            system.name,
            `${figure.name} (FIG ${figure.groupNo})`,
          ]
            .join(" >> ")
            .toUpperCase()}
          date={new Date().toLocaleDateString("en-CA", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
          onClose={() => setCrop(null)}
        />
      ) : null}
    </div>
  );
}
