/**
 * Verification, per spec §7.
 *
 * Runs the checks the design says it must survive against the real files.
 * Prints a pass/fail line for each and exits non-zero on any failure, so this
 * is usable as a gate rather than a report nobody reads.
 *
 * Usage: `npm run verify`
 */

import { sql } from "drizzle-orm";

import { db } from "../db/client";
import { getFigureBlockers } from "../db/publish";
import { SOURCE_VARIANT } from "./catalog-source";

interface Check {
  name: string;
  expected: string;
  actual: string;
  pass: boolean;
}

const checks: Check[] = [];

function record(name: string, expected: string, actual: string): void {
  checks.push({ name, expected, actual, pass: expected === actual });
}

async function scalar(query: ReturnType<typeof sql>): Promise<number> {
  const rows = await db.execute<{ value: number }>(query);
  return Number(rows[0]?.value ?? 0);
}

async function main(): Promise<void> {
  /* Structure ----------------------------------------------------- */

  record(
    "figure count",
    "47",
    String(await scalar(sql`select count(*)::int as value from figure`)),
  );

  record(
    "system count",
    "12",
    String(await scalar(sql`select count(*)::int as value from system`)),
  );

  record(
    "distinct plates stored",
    "43",
    String(
      await scalar(sql`select count(distinct checksum)::int as value from drawing_file`),
    ),
  );

  record(
    "serial range",
    "99FT3W251001",
    String(
      (
        await db.execute<{ value: string }>(
          sql`select serial_from as value from variant limit 1`,
        )
      )[0]?.value,
    ),
  );

  record(
    "printed group numbers preserved",
    "2",
    String(
      await scalar(
        sql`select count(*)::int as value from figure where printed_group_no is not null`,
      ),
    ),
  );

  /* The four pilot figures ---------------------------------------- */

  const pilots: { groupNo: string; rows: number; callouts: number; notShown: number }[] = [
    { groupNo: "1.1", rows: 6, callouts: 6, notShown: 0 },
    { groupNo: "2.1", rows: 9, callouts: 7, notShown: 2 },
    { groupNo: "2.2", rows: 17, callouts: 12, notShown: 4 },
    { groupNo: "3.1", rows: 8, callouts: 4, notShown: 4 },
  ];

  for (const pilot of pilots) {
    const id = `fig-ft3w-${pilot.groupNo.replace(/\./g, "-")}`;

    record(
      `FIG ${pilot.groupNo} rows`,
      String(pilot.rows),
      String(
        await scalar(
          sql`select count(*)::int as value from figure_part where figure_id = ${id}`,
        ),
      ),
    );

    record(
      `FIG ${pilot.groupNo} callouts`,
      String(pilot.callouts),
      String(
        await scalar(
          sql`select count(*)::int as value from callout where figure_id = ${id}`,
        ),
      ),
    );

    record(
      `FIG ${pilot.groupNo} not-shown rows`,
      String(pilot.notShown),
      String(
        await scalar(
          sql`select count(*)::int as value from figure_part where figure_id = ${id} and not shown`,
        ),
      ),
    );
  }

  /* The decisions the design turns on ------------------------------ */

  // Item numbers survive on rows with no marker — the reason item_no exists.
  record(
    "FIG 2.1 items 8 and 9 keep their numbers with no marker",
    "8,9",
    (
      await db.execute<{ value: string }>(sql`
        select string_agg(fp.item_no::text, ',' order by fp.item_no) as value
          from figure_part fp
         where fp.figure_id = 'fig-ft3w-2-1'
           and not fp.shown
           and not exists (select 1 from callout c where c.figure_part_id = fp.id)
      `)
    )[0]?.value ?? "",
  );

  // "MIDDLE NOT SHOWN" must not be read as not-shown.
  record(
    "FIG 2.1 item 2 (MIDDLE NOT SHOWN) counts as shown",
    "true",
    String(
      (
        await db.execute<{ value: boolean }>(
          sql`select shown as value from figure_part where id = 'fp-ft3w-2-1-2'`,
        )
      )[0]?.value,
    ),
  );

  // Options are parts, and the figure-level kit is linked.
  record(
    "FIG 2.2 carries an option kit",
    "88-00262",
    String(
      (
        await db.execute<{ value: string }>(sql`
          select p.part_number as value
            from figure f join part p on p.id = f.option_part_id
           where f.id = 'fig-ft3w-2-2'
        `)
      )[0]?.value,
    ),
  );

  record(
    "row-level option membership recorded",
    "true",
    String((await scalar(sql`select count(*)::int as value from part_kit`)) > 0),
  );

  // A part appearing on two figures is one global record.
  record(
    "82-00127 is one part across FIG 2.1 and 2.2",
    "2",
    String(
      await scalar(sql`
        select count(*)::int as value
          from figure_part fp join part p on p.id = fp.part_id
         where p.part_number = '82-00127'
      `),
    ),
  );

  // Prices are absent, not zero.
  record(
    "no part has a fabricated price",
    "0",
    String(
      await scalar(sql`select count(*)::int as value from part where list_price is not null`),
    ),
  );

  // Vision proposals are never servable.
  record(
    "no vision callout is confirmed",
    "0",
    String(
      await scalar(sql`
        select count(*)::int as value from callout
         where source = 'vision' and confirmed_at is not null
      `),
    ),
  );

  /* Publish blocking ----------------------------------------------- */

  const blockers = await getFigureBlockers(SOURCE_VARIANT.id);
  const byFigure = (groupNo: string) => blockers.filter((b) => b.groupNo === groupNo);

  // The case the old rule would have failed: not-shown rows must not block.
  record(
    "FIG 2.1 is not blocked by its two not-shown rows",
    "false",
    String(byFigure("2.1").some((b) => b.kind === "shown-row-without-marker")),
  );

  record(
    "FIG 1.1 is blocked only on unconfirmed coordinates",
    "callout-unconfirmed",
    byFigure("1.1")
      .map((b) => b.kind)
      .sort()
      .join(","),
  );

  record(
    "FIG 3.1 is blocked on its unconfirmed coordinates",
    "true",
    String(byFigure("3.1").some((b) => b.kind === "callout-unconfirmed")),
  );

  /* Idempotency ---------------------------------------------------- */

  record(
    "no duplicate figure_part item numbers",
    "0",
    String(
      await scalar(sql`
        select count(*)::int as value from (
          select figure_id, item_no from figure_part
           group by figure_id, item_no having count(*) > 1
        ) d
      `),
    ),
  );

  /* Report ---------------------------------------------------------- */

  const width = Math.max(...checks.map((c) => c.name.length));
  let failures = 0;

  for (const check of checks) {
    const mark = check.pass ? "pass" : "FAIL";
    if (!check.pass) failures += 1;
    const detail = check.pass ? check.actual : `expected ${check.expected}, got ${check.actual}`;
    console.log(`  ${mark}  ${check.name.padEnd(width)}  ${detail}`);
  }

  console.log(`\n  ${checks.length - failures}/${checks.length} checks passed`);
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
