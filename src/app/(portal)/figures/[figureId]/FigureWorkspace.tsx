"use client";

import Image from "next/image";
import Link from "next/link";
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
  ComingSoon,
  CroppedPart,
  DrawingViewer,
  FullIllustration,
  PartsTable,
  Trail,
  type CropRect,
} from "@/components";
import { buildDiagramRegions, buildDrawingMarkers } from "@/lib/drawing";
import { useMachine } from "@/state/MachineContext";
import { useRequest } from "@/state/RequestContext";
import { useRequestAddition } from "@/state/useRequestAddition";
import { useSelection } from "@/state/useSelection";
import { useDiagramSelection } from "@/state/useDiagramSelection";
import { recordRecentFigure } from "@/state/useRecentlyViewed";
import { useReleasedDrawing } from "@/state/useReleasedDrawing";
import type { FigureDetail, PartUsageSummary } from "@/types/catalog";
import { QuoteRequest } from "../../request/QuoteRequest";
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
  previewNotice?: string | null;
  /** Isolated hosted review: selection is allowed, commerce/export is not. */
  reviewOnly?: boolean;
  /** Where each part is used — the quote view opens inside this screen. */
  usage: Record<string, PartUsageSummary>;
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
  previewNotice = null,
  reviewOnly = false,
  usage,
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
  const releasedDrawing = useReleasedDrawing(detail);
  const { selectedModel } = useMachine();
  const { lines } = useRequest();
  const addition = useRequestAddition(figure.id);

  const { selectedPartIds: quotePartIds, toggle: toggleQuote, hoveredPartId, setHoveredPartId } =
    useSelection({ rows, callouts });
  const { selection, activation, selectedPartIds, selectPart, clear } = useDiagramSelection({
    figureId: figure.id, rows,
    releaseKey: `${variant.catalogRevision}/${drawing?.id}/${drawing?.version}/${drawing?.storagePath}/${reviewOnly}`,
  });

  const markers = useMemo(
    () => buildDrawingMarkers(rows, callouts),
    [rows, callouts],
  );
  const regions = useMemo(() => buildDiagramRegions(rows, callouts, drawing), [rows, callouts, drawing]);

  useEffect(() => {
    if (reviewOnly || detail.release) return;
    recordRecentFigure({
      figureId: figure.id,
      groupNo: figure.groupNo,
      figureName: figure.name,
      systemName: system.name,
    });
  }, [figure.id, figure.groupNo, figure.name, system.name, reviewOnly, detail.release]);

  const machineName = detail.release ? variant.label : selectedModel?.name ?? "FT3 Wagon";
  const machineLabel = detail.release ? machineName : `Fat Truck ${machineName}`;
  const variantQuery = `?variantId=${encodeURIComponent(variant.id)}`;
  const requestedPartIds = useMemo(
    () => new Set(lines.map((line) => line.partId)),
    [lines],
  );

  /** Ticked parts not already on the cart. */
  const pending = useMemo(
    () =>
      rows
        .filter(
          (row) =>
            quotePartIds.has(row.part.id) &&
            !requestedPartIds.has(row.part.id),
        )
        .map((row) => ({ part: row.part, qty: row.figurePart.qty ?? 1 })),
    [rows, quotePartIds, requestedPartIds],
  );

  const addSelectedToCart = (openQuote = false) => {
    if (reviewOnly) return;
    return addition.add(pending, () => { if (openQuote) setQuoting(true); });
  };

  const go = (id: string | null) => {
    if (id) router.push(`${reviewOnly ? "/review" : ""}/figures/${id}`);
  };

  const unplaced = callouts.length - markers.length;

  /*
   * The whole plate, opened over the workspace — slide 37. The deck puts this
   * on the second toolbar icon, where a "fit to view" used to sit; fitting is
   * what the zoom control already does.
   */
  const [fullScreen, setFullScreen] = useState(false);
  /* Check cart has no screen behind it yet — see clients.md. */
  const [cartComingSoon, setCartComingSoon] = useState(false);

  /*
   * The quote view opens IN PLACE of the plate and the parts list — slides 48
   * to 49 keep the same breadcrumb and the same toolbar, with Request a quote
   * lit, and change only what is underneath. Navigating away lost that.
   */
  const [quoting, setQuoting] = useState(false);

  /** Plate zoom. Markers are placed in percentages, so they scale with it. */
  const [zoom, setZoom] = useState(1);
  const [revealRequest, setRevealRequest] = useState(0);
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
    if (reviewOnly) return;
    const lines = rows.map(
      (row) =>
        `${row.calloutNumbers.join(", ") || "-"}\t${row.part.partNumber}\t` +
        `${row.part.description}\t${row.figurePart.qty===null?"Installed quantity unspecified":`x${row.figurePart.qty}`}`,
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
      {addition.pending && <p role="status">Validating selected parts…</p>}
      {addition.error && !quoting && <p role="alert">{addition.error}</p>}
      {releasedDrawing.error && <p role="alert">{releasedDrawing.error}</p>}
      <Trail
        steps={[
          { label: machineLabel, href: `/systems${variantQuery}` },
          {
            label: `${systemNumber} ${system.name}`.trim(),
            href: `/systems/${system.id}${variantQuery}`,
          },
          { label: figure.name },
        ]}
      />

      <div className={styles.controls}>
        {!detail.release && <p className={styles.previewNotice}>
          {reviewOnly ? (
            <>Read-only marker review. Select references to check their positions; ordering and exports are disabled. <Link href={`/figures/${figure.id}`}>Return to ordinary catalogue</Link></>
          ) : (
            <>Check proposed positions and unresolved drawing references. <Link href={`/review/figures/${figure.id}`}>Open marker review</Link> (unapproved; not for ordering).</>
          )}
        </p>}
        {previewNotice ? (
          <p role="status" className={styles.previewNotice}>
            {previewNotice} For crowded labels, use <strong>Zoom in</strong> or
            open the full illustration.
          </p>
        ) : null}

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
          disabled={reviewOnly}
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

        <button type="button" className={styles.button} onClick={() => setRevealRequest((value) => value + 1)} disabled={selectedPartIds.size === 0}>
          Show selected part
        </button>
        <button type="button" className={styles.button} onClick={clear} disabled={selectedPartIds.size === 0}>
          Clear selection
        </button>

        <button
          type="button"
          className={styles.button}
          /*
           * Takes the ticked parts with it. Selecting a part no longer puts it
           * on the cart, so jumping straight to the request list would have
           * arrived empty — which is exactly what it did.
           */
          onClick={() => { void addSelectedToCart(true); }}
          title="Add anything ticked, then draw up the request"
          disabled={reviewOnly || addition.pending}
          aria-pressed={quoting}
          data-armed={quoting || undefined}
        >
          <Image src="/toolbar/quote.png" alt="" width={40} height={52}
            className={styles.buttonIcon} />
          Request a quote
        </button>

        <button
          type="button"
          className={styles.button}
          onClick={() => { void addSelectedToCart(); }}
          disabled={reviewOnly || addition.pending || pending.length === 0}
          title={
            quotePartIds.size === 0
              ? "Tick a part first"
              : pending.length === 0
                ? "Everything ticked is already on the cart"
                : `Add ${pending.length} part${pending.length === 1 ? "" : "s"} to the cart`
          }
        >
          <Image src="/toolbar/cart-add.png" alt="" width={40} height={40}
            className={styles.buttonIcon} />
          Add to cart{pending.length > 0 ? ` · ${pending.length}` : ""}
        </button>

        <button
          type="button"
          className={styles.button}
          onClick={emailFigure}
          disabled={reviewOnly || rows.length === 0}
          title="Email this parts list"
        >
          <Image src="/toolbar/email.png" alt="" width={40} height={28}
            className={styles.buttonIcon} />
          Email
        </button>

        <button
          type="button"
          className={styles.button}
          onClick={() => { if (!reviewOnly) window.print(); }}
          disabled={reviewOnly}
        >
          <Image src="/toolbar/print.png" alt="" width={40} height={40}
            className={styles.buttonIcon} />
          Print
        </button>

        <button
          type="button"
          className={styles.button}
          onClick={() => { if (!reviewOnly) setCartComingSoon(true); }}
          disabled={reviewOnly}
          title="The cart screen has not been built yet"
        >
          <Image src="/toolbar/check-cart.png" alt="" width={40} height={40}
            className={styles.buttonIcon} />
          Check cart · {lines.length}
        </button>
        </div>
      </div>

      {quoting && !reviewOnly ? (
        <QuoteRequest
          usage={usage}
          embedded
          onAddMoreParts={() => setQuoting(false)}
        />
      ) : (
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
              src={releasedDrawing.src}
              width={drawing?.width}
              height={drawing?.height}
              note={figure.depictionMode==="table-only"?`Reviewed table-only parts list — ${figure.name}. No assembly illustration applies.`:`Assembly drawing not supplied — ${figure.name}`}
              markers={markers}
              document={regions}
              selectionActivation={activation}
              revealRequest={revealRequest}
              selectedPartIds={selectedPartIds}
              hoveredPartId={hoveredPartId}
              onSelectPart={selectPart}
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
                selectedFigurePartId={selection?.figurePartId}
                selectionActivation={activation}
                selectedPartIds={selectedPartIds}
                hoveredPartId={hoveredPartId}
                onSelectPart={selectPart}
                onHoverPart={setHoveredPartId}
                requestedPartIds={quotePartIds}
                onToggleRequested={reviewOnly ? undefined : toggleQuote}
              />
            )}
          </div>
        </div>
      )}

      {cartComingSoon ? (
        <ComingSoon
          title="Check cart — coming soon"
          onClose={() => setCartComingSoon(false)}
        >
          The cart screen has not been designed yet. Use{" "}
          <strong>Request a quote</strong> to review what you have gathered and
          send it to RUF Diamond.
        </ComingSoon>
      ) : null}

      {fullScreen ? (
        <FullIllustration
          label={`Sheet ${sheet}`}
          src={releasedDrawing.src}
          width={drawing?.width}
          height={drawing?.height}
          note={figure.depictionMode==="table-only"?`Reviewed table-only parts list — ${figure.name}. No assembly illustration applies.`:`Assembly drawing not supplied — ${figure.name}`}
          markers={markers}
          document={regions}
          selectionActivation={activation}
          previewNotice={previewNotice}
          selectedPartIds={selectedPartIds}
          hoveredPartId={hoveredPartId}
          onSelectPart={selectPart}
          onClearSelection={clear}
          onHoverPart={setHoveredPartId}
          trail={`Model image > ${machineLabel} > ${system.name} > ${figure.name}`}
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
          src={releasedDrawing.src ?? ""}
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
