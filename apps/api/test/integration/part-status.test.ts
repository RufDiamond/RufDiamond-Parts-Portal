import { randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from "vitest";
import type { PartStatus } from "@rufdiamond/contracts";
import { createDatabase } from "../../src/db/client.js";
import { part, releasePart } from "../../src/db/schema/index.js";
import { migrationsFolder, startPostgres } from "../helpers/postgres.js";

describe("part status migration compatibility", () => {
  let postgres: Awaited<ReturnType<typeof startPostgres>>;
  beforeAll(async () => { postgres = await startPostgres(); }, 120_000);
  afterAll(async () => { await postgres?.stop(); }, 30_000);

  it("upgrades legacy working and sealed release statuses without losing other data or migration history", async () => {
    const historicalFolder = await mkdtemp(join(tmpdir(), "rufdiamond-migration-history-"));
    try {
      const journal = JSON.parse(await readFile(join(migrationsFolder, "meta/_journal.json"), "utf8"));
      journal.entries = journal.entries.slice(0, 4);
      await mkdir(join(historicalFolder, "meta"));
      await writeFile(join(historicalFolder, "meta/_journal.json"), JSON.stringify(journal));
      for (const entry of journal.entries) await copyFile(join(migrationsFolder, `${entry.tag}.sql`), join(historicalFolder, `${entry.tag}.sql`));
      await postgres.migrate(historicalFolder);
    } finally {
      await rm(historicalFolder, { recursive: true, force: true });
    }

    const q = (query: string, values?: unknown[]) => postgres.pool.query(query, values);
    const line = randomUUID();
    const model = randomUUID();
    await q("insert into product_line(id,name,normalized_name) values($1,'fat truck','fat truck')", [line]);
    await q("insert into model(id,product_line_id,name,status) values($1,$2,'FT3','discontinued')", [model, line]);
    for (const status of ["active", "superseded", "discontinued"]) {
      const id = randomUUID();
      await q("insert into part(id,part_number,normalized_part_number,description,list_price,status) values($1,$2,upper($2),'Original source description',12.34,$3)", [id, id, status]);
    }
    for (const [index, state] of ["active", "inactive", "building"].entries()) {
      const release = randomUUID();
      await q("insert into publication_release(id,model_id,revision,source_checksum) values($1,$2,$3,repeat('a',64))", [release, model, index + 1]);
      await q("insert into release_part(release_id,id,working_id,part_number,description,list_price,currency,status) select $1,id,id,part_number,description,list_price,currency,status from part", [release]);
      if (state !== "building") await q("update publication_release set status=$2,published_at=now() where id=$1", [release, state]);
    }
    const oldParts = (await q("select * from part order by id")).rows;
    const oldReleaseParts = (await q("select * from release_part order by release_id,id")).rows;
    const oldReleases = (await q("select * from publication_release order by id")).rows;
    const oldHistory = (await q("select * from drizzle.__drizzle_migrations order by id")).rows;

    await postgres.migrate();
    await postgres.migrate();

    const upgradedParts = (await q("select * from part order by id")).rows;
    const upgradedReleaseParts = (await q("select * from release_part order by release_id,id")).rows;
    expect(upgradedParts).toEqual(oldParts.map(row => ({ ...row, status: row.status === "discontinued" ? "obsolete" : row.status })));
    expect(upgradedReleaseParts).toEqual(oldReleaseParts.map(row => ({ ...row, status: row.status === "discontinued" ? "obsolete" : row.status })));
    expect((await q("select * from publication_release order by id")).rows).toEqual(oldReleases);
    expect((await q("select * from drizzle.__drizzle_migrations order by id")).rows.slice(0, 4)).toEqual(oldHistory);
    expect((await q("select status from model where id=$1", [model])).rows[0].status).toBe("discontinued");
    for (const release of oldReleases.filter(row => row.published_at !== null)) {
      await expect(q("update release_part set description='tampered' where release_id=$1", [release.id])).rejects.toMatchObject({ code: "23514" });
      await expect(q("delete from release_part where release_id=$1", [release.id])).rejects.toMatchObject({ code: "23514" });
    }
  });

  it("matches Drizzle status types to the shared public contract", () => {
    expectTypeOf<typeof part.$inferSelect.status>().toEqualTypeOf<PartStatus>();
    expectTypeOf<typeof releasePart.$inferSelect.status>().toEqualTypeOf<PartStatus>();
    const states = ["active", "superseded", "obsolete", "special-order"] as const;
    expect(part.status.enumValues).toEqual(states);
    expect(releasePart.status.enumValues).toEqual(states);
  });

  it("accepts every shared public status in working and release schemas and rejects legacy or unknown states", async () => {
    await postgres.migrate();
    const states = ["active", "superseded", "obsolete", "special-order"] as const;
    const connection = createDatabase(postgres.connectionString);
    try {
      const { rows: [release] } = await postgres.pool.query("select id from publication_release where status='building'");
      for (const status of states) {
        const id = randomUUID();
        await connection.db.insert(part).values({ id, partNumber: id, normalizedPartNumber: id.toUpperCase(), description: "Contract status", status });
        await connection.db.insert(releasePart).values({ id, releaseId: release.id, workingId: id, partNumber: id, description: "Contract status", currency: "CAD", status });
        expect((await postgres.pool.query("select status from part where id=$1", [id])).rows[0].status).toBe(status);
        expect((await postgres.pool.query("select status from release_part where release_id=$1 and id=$2", [release.id, id])).rows[0].status).toBe(status);
      }
      for (const status of ["discontinued", "unknown"]) {
        await expect(postgres.pool.query("update part set status=$1", [status])).rejects.toMatchObject({ code: "23514" });
        await expect(postgres.pool.query("update release_part set status=$1 where release_id=$2", [status, release.id])).rejects.toMatchObject({ code: "23514" });
      }
    } finally { await connection.close(); }
  });
});
