"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import {
  Breadcrumbs,
  DrawingViewer,
  Icon,
  PageHeader,
  Panel,
  PartsTable,
  SpecList,
  TitleBlock,
  WarningPanel,
} from "@/components";
import { buildDrawingMarkers } from "@/lib/drawing";
import { formatPrice, formatFigureRef } from "@/lib/format";
import { useMachine } from "@/state/MachineContext";
import { useRequest } from "@/state/RequestContext";
import { useSelection } from "@/state/useSelection";
import { recordRecentFigure } from "@/state/useRecentlyViewed";
import type { FigureDetail } from "@/types/catalog";
import screen from "@/styles/screen.module.css";
import styles from "./figure.module.css";

/** "3 and 4", or "3, 4 and 5". */
function formatList(numbers: number[]): string {
  if (numbers.length <= 1) return String(numbers[0] ?? "—");
  return `${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;
}

export interface FigureWorkspaceProps {
  detail: FigureDetail;
  /** Sheet number as printed, e.g. "01 / 01". */
  sheet: string;
}

export function FigureWorkspace({ detail, sheet }: FigureWorkspaceProps) {
  const { figure, drawing, system, variant, rows, callouts } = detail;
  const { selectedModel } = useMachine();
  const { addParts, removeLine, lines } = useRequest();

  const {
    selectedPartIds,
    toggle,
    hoveredPartId,
    setHoveredPartId,
    calloutsForPart,
  } = useSelection({ rows, callouts });

  const markers = useMemo(
    () => buildDrawingMarkers(rows, callouts),
    [rows, callouts],
  );

  // Writes straight to sessionStorage and holds no React state, so this
  // cannot loop.
  useEffect(() => {
    recordRecentFigure({
      figureId: figure.id,
      groupNo: figure.groupNo,
      figureName: figure.name,
      systemName: system.name,
    });
  }, [figure.id, figure.groupNo, figure.name, system.name]);

  // Placed markers vs callouts that exist. The export carries numbers but no
  // positions, so these differ on every figure until someone maps it, and
  // saying "0 callouts" when there are three reads as missing data.
  const placedCount = markers.length;
  const calloutCount = callouts.length;
  const unplaced = calloutCount - placedCount;

  const plateCount =
    calloutCount === 0
      ? `${rows.length} parts`
      : unplaced === 0
        ? `${calloutCount} callouts · ${rows.length} parts`
        : `${placedCount} of ${calloutCount} callouts placed · ${rows.length} parts`;

  const figureRef = formatFigureRef(figure.groupNo);
  const machineName = selectedModel?.name ?? "FT3 Wagon";
  const requestedPartIds = useMemo(
    () => new Set(lines.map((line) => line.partId)),
    [lines],
  );

  /** Ticking puts the part on the request list; clicking only highlights. */
  const toggleRequested = (partId: string) => {
    if (requestedPartIds.has(partId)) {
      removeLine(partId);
      return;
    }
    const row = rows.find((candidate) => candidate.part.id === partId);
    if (row) addParts([{ part: row.part, qty: row.figurePart.qty }]);
  };

  // Any part fitted in more than one place gets flagged: the reference calls
  // this out so nobody replaces one of a pair.
  const multiPosition = rows.filter(
    (row) => calloutsForPart(row.part.id).length > 1,
  );

  const activeRow =
    rows.find((row) => selectedPartIds.has(row.part.id)) ?? rows[0];

  return (
    <main className={screen.screen}>
      <div className={screen.trail}>
        <Breadcrumbs
          items={[
            { label: machineName, href: "/" },
            { label: "Systems", href: "/systems" },
            { label: system.name, href: `/systems/${system.id}` },
            { label: figureRef },
          ]}
        />
      </div>

      <PageHeader
        hasTrail
        eyebrow="Figure drawing"
        title={`${figureRef} — ${figure.name}`}
        meta={[`Fat Truck ${machineName}`, `Sheet ${sheet}`]}
        actions={
          <>
            <Link
              href={`/systems/${system.id}`}
              className={`${screen.button} ${screen.buttonGhost}`}
            >
              <Icon name="arrow-left" size="md" />
              Back to figures
            </Link>
            <Link
              href="/request"
              className={`${screen.button} ${screen.buttonPrimary}`}
            >
              <Icon name="clipboard-list" size="md" />
              Request list · {lines.length}
            </Link>
          </>
        }
      />

      <div className={screen.split57}>
        <div className={styles.sheetColumn}>
          <DrawingViewer
            label={`Sheet ${sheet} — exploded view`}
            count={plateCount}
            src={drawing?.storagePath}
            width={drawing?.width}
            height={drawing?.height}
            note={`Assembly drawing not supplied — callouts positioned to ${figureRef}`}
            markers={markers}
            selectedPartIds={selectedPartIds}
            hoveredPartId={hoveredPartId}
            onTogglePart={toggle}
            onHoverPart={setHoveredPartId}
          />
          {unplaced > 0 ? (
            <p className={styles.plateNotice}>
              {placedCount === 0
                ? `None of this figure's ${calloutCount} callout numbers have been positioned on the drawing yet`
                : `${unplaced} of this figure's ${calloutCount} callout numbers have not been positioned yet`}
              , so clicking a part cannot highlight it here. Match the{" "}
              <b>Ref</b> column against the numbers printed on the plate.
              Positions are added in the figure editor.
            </p>
          ) : null}

          <TitleBlock
            fields={[
              { label: "Section", value: system.name },
              { label: "Figure", value: figureRef },
              { label: "Sheet", value: sheet },
            ]}
          />
        </div>

        <div className={styles.listColumn}>
          {multiPosition.map((row) => (
            <WarningPanel
              key={row.part.id}
              severity="critical"
              title="Two positions"
            >
              {row.part.description} {row.part.partNumber} is fitted at
              callouts {formatList(row.calloutNumbers)}. Replace all of them at
              the same service interval.
            </WarningPanel>
          ))}

          <Panel
            eyebrow="Keyed to drawing"
            title="Parts list"
            padding="none"
            frame="strong"
          >
            {rows.length === 0 ? (
              // The plate is loaded but its parts have not been imported yet.
              // Say so plainly: a bare table header reads as a fault.
              <p className={styles.listEmpty}>
                The drawing for this figure is loaded, but its parts have not
                been imported yet. The numbered callouts on the plate come from
                the printed catalogue; they are keyed to records once the parts
                export for {figureRef} is loaded.
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
            <div className={styles.listFoot}>
              <span className={styles.listFootNote}>
                {rows.length === 0
                  ? "Nothing on this sheet can be ordered until its parts are imported."
                  : "Tick a row to add it to the request list. Click a row to highlight every callout for that part."}
              </span>
              <Link
                href="/request"
                className={`${screen.button} ${screen.buttonPrimary}`}
              >
                <Icon name="clipboard-list" size="md" />
                Review request
              </Link>
            </div>
          </Panel>

          {activeRow ? (
            <Panel eyebrow="Selected part" title={activeRow.part.description}>
              <SpecList
                columns={2}
                items={[
                  { label: "Part number", value: activeRow.part.partNumber },
                  {
                    label: "Callouts",
                    value:
                      activeRow.calloutNumbers.join(", ") || "—",
                  },
                  {
                    label: "Quantity per figure",
                    value: String(activeRow.figurePart.qty),
                  },
                  {
                    label: "Manufacturer",
                    value: activeRow.part.manufacturer ?? "—",
                  },
                  {
                    label: "List price",
                    value: formatPrice(
                      activeRow.part.listPrice,
                      activeRow.part.currency,
                    ),
                  },
                  {
                    label: "Catalog",
                    value: `REV ${variant.catalogRevision}`,
                  },
                ]}
              />
            </Panel>
          ) : null}
        </div>
      </div>
    </main>
  );
}
