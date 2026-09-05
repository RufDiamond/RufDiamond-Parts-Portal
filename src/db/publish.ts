/**
 * Publish blocking, derived rather than stored.
 *
 * `backend-specification.md` §4 makes publishability a derivation so there is
 * no flag anyone has to remember to clear: place the markers and the blocker
 * disappears on its own.
 *
 * The rules are restated from the spec, with two changes forced by the source
 * data (spec §5):
 *
 *   - Coverage is checked over rows that are *shown*, not over every row.
 *     "NOT SHOWN" is a permanent, intended state — FIG 2.1 items 8 and 9,
 *     FIG 3.1 items 5 to 8. Demanding a marker for them would block those
 *     figures forever.
 *   - A coordinate proposed by the vision pre-pass is not a mapping. An
 *     unconfirmed callout blocks publication just as an unplaced one does.
 */

import { sql } from "drizzle-orm";

import { db } from "./client";

export type BlockerKind =
  | "shown-row-without-marker"
  | "callout-without-position"
  | "callout-unconfirmed"
  | "callout-without-part"
  | "figure-without-plate";

export interface FigureBlocker {
  figureId: string;
  groupNo: string;
  figureName: string;
  kind: BlockerKind;
  count: number;
}

/**
 * Every reason each figure of a variant cannot be published. An empty result
 * for a figure means it is publishable.
 */
export async function getFigureBlockers(variantId: string): Promise<FigureBlocker[]> {
  const rows = await db.execute<{
    figure_id: string;
    group_no: string;
    name: string;
    kind: BlockerKind;
    count: number;
  }>(sql`
    with f as (
      select id, group_no, name, drawing_file_id
      from figure
      where variant_id = ${variantId}
    )
    -- Rule 1: a row that is drawn must have a marker.
    select f.id as figure_id, f.group_no, f.name,
           'shown-row-without-marker'::text as kind,
           count(*)::int as count
      from f
      join figure_part fp on fp.figure_id = f.id and fp.shown
     where not exists (
             select 1 from callout c where c.figure_part_id = fp.id
           )
     group by f.id, f.group_no, f.name

    union all
    -- Rule 2: every marker has a position.
    select f.id, f.group_no, f.name,
           'callout-without-position', count(*)::int
      from f join callout c on c.figure_id = f.id
     where c.x is null or c.y is null
     group by f.id, f.group_no, f.name

    union all
    -- Rule 3: a machine's guess is not a mapping.
    select f.id, f.group_no, f.name,
           'callout-unconfirmed', count(*)::int
      from f join callout c on c.figure_id = f.id
     where c.x is not null and c.confirmed_at is null
     group by f.id, f.group_no, f.name

    union all
    -- Rule 4: every marker resolves to a part.
    select f.id, f.group_no, f.name,
           'callout-without-part', count(*)::int
      from f join callout c on c.figure_id = f.id
     where c.figure_part_id is null
     group by f.id, f.group_no, f.name

    union all
    -- A figure with parts but no plate cannot show them.
    select f.id, f.group_no, f.name,
           'figure-without-plate', 1
      from f
     where f.drawing_file_id is null
       and exists (select 1 from figure_part fp where fp.figure_id = f.id)

    order by group_no, kind
  `);

  return rows.map((row) => ({
    figureId: row.figure_id,
    groupNo: row.group_no,
    figureName: row.name,
    kind: row.kind,
    count: Number(row.count),
  }));
}

/**
 * Counts only callouts a customer may actually be shown: positioned,
 * confirmed, and resolving to a part. A figure claiming six markers while four
 * can be drawn reads as a bug.
 */
export async function countServableCallouts(figureId: string): Promise<number> {
  const rows = await db.execute<{ count: number }>(sql`
    select count(*)::int as count
      from callout
     where figure_id = ${figureId}
       and x is not null and y is not null
       and confirmed_at is not null
       and figure_part_id is not null
  `);
  return Number(rows[0]?.count ?? 0);
}

export async function isFigurePublishable(
  variantId: string,
  figureId: string,
): Promise<boolean> {
  const blockers = await getFigureBlockers(variantId);
  return !blockers.some((b) => b.figureId === figureId);
}
