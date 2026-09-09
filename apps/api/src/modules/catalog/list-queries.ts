import { sql, type SQL } from "drizzle-orm";
import type { Model, Part, PartUsageRow, PartUsageSummary, ProductLine, ReleasedFigure, System, Variant } from "@rufdiamond/contracts";
import type { Transaction } from "../../db/client.js";
import { unavailable } from "../publication/validation.js";
import { candidatePage, type CatalogQuery, type pageState } from "./pagination.js";
import { partProjection } from "./projection.js";
import { permittedVariants, releaseFilter, requiredId, scopedVariant, type CatalogScope } from "./scope.js";

type State = ReturnType<typeof pageState>;
type NavigationItem = ProductLine | Model | Variant | System | ReleasedFigure;
type PartItem = Part | PartUsageRow | { partId: string; summary: PartUsageSummary };

export async function navigationPage(tx: Transaction, scope: CatalogScope, query: CatalogQuery, state: State) {
  const ctes = permittedVariants(scope);
  let candidates: SQL;
  switch (query.kind) {
    case "product-lines":
      candidates = sql`SELECT DISTINCT ON (m.product_line_id) m.product_line_id::text AS key, m.release_id,
        jsonb_build_object('id',m.product_line_id,'name',m.product_line_name,'manufacturer',m.manufacturer,'country',m.country,'isDistributed',m.is_distributed) AS item
        FROM release_model m WHERE ${releaseFilter(sql`m.release_id`, scope)} ORDER BY m.product_line_id,m.release_id`;
      break;
    case "models":
      candidates = sql`SELECT m.working_id::text AS key,m.release_id,
        jsonb_build_object('id',m.working_id,'productLineId',m.product_line_id,'name',m.name,'status',m.status,'catalogState','live',
          'updatedAt',to_char(r.published_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) AS item
        FROM release_model m JOIN publication_release r ON r.id=m.release_id WHERE ${releaseFilter(sql`m.release_id`, scope)}`;
      break;
    case "variants": {
      const release = scope.releases.find(r => r.modelId === requiredId(query.id)); if (!release) unavailable();
      candidates = sql`SELECT v.working_id::text AS key,v.release_id,
        jsonb_build_object('id',v.working_id,'modelId',${release.modelId}::text,'label',v.label,'serialFrom',v.serial_from,'serialTo',v.serial_to,'catalogRevision',v.catalog_revision) AS item
        FROM release_variant v JOIN permitted_variants pv ON pv.release_id=v.release_id AND pv.id=v.id WHERE v.release_id=${release.releaseId}::uuid`;
      break;
    }
    case "systems": {
      const variant = await scopedVariant(tx, scope, query.id);
      candidates = sql`SELECT s.working_id::text AS key,s.release_id,jsonb_build_object('id',s.working_id,'name',s.name,'sortOrder',s.sort_order) AS item
        FROM release_system s WHERE s.release_id=${variant.release_id}::uuid`;
      break;
    }
    case "figures": {
      const variant = await scopedVariant(tx, scope, query.id);
      const result = await tx.execute<{ id: string }>(sql`SELECT id FROM release_system WHERE release_id=${variant.release_id}::uuid AND working_id=${requiredId(query.systemId)}::uuid LIMIT 1`);
      const system = result.rows[0]; if (!system) unavailable();
      candidates = sql`SELECT f.working_id::text AS key,f.release_id,
        jsonb_build_object('id',f.working_id,'variantId',${query.id}::text,'systemId',${query.systemId}::text,'name',f.name,'groupNo',f.group_no,'drawingFileId',d.working_id,'status','published') AS item
        FROM release_figure f JOIN release_drawing d ON d.release_id=f.release_id AND d.id=f.drawing_id
        WHERE f.release_id=${variant.release_id}::uuid AND f.variant_id=${variant.id}::uuid AND f.system_id=${system.id}::uuid`;
      break;
    }
    default: throw new Error("Unsupported navigation query");
  }
  return candidatePage<NavigationItem>(tx, scope, state, ctes, candidates);
}

function visibleRows(scope: CatalogScope): SQL {
  return sql`${permittedVariants(scope)}, visible_rows AS (
    SELECT fp.release_id,fp.id,fp.working_id,fp.figure_id,fp.part_id FROM release_figure_part fp
    JOIN release_figure f ON f.release_id=fp.release_id AND f.id=fp.figure_id
    JOIN permitted_variants pv ON pv.release_id=f.release_id AND pv.id=f.variant_id
  )`;
}

/** UNION makes recursive reachability finite even if legacy relationships cycle.
 * Each edge joins on release_id as well as local part identity. The traversal
 * stays inside PostgreSQL and never materializes unrelated parts in Node. */
function reachableParts(scope: CatalogScope): SQL {
  return sql`${visibleRows(scope)}, reachable(release_id,part_id) AS (
    SELECT DISTINCT release_id,part_id FROM visible_rows
    UNION
    SELECT r.release_id,edge.target FROM reachable r JOIN LATERAL (
      SELECT req.required_part_id AS target FROM release_part_requires req WHERE req.release_id=r.release_id AND req.part_id=r.part_id
      UNION ALL
      SELECT p.superseded_by_part_id AS target FROM release_part p WHERE p.release_id=r.release_id AND p.id=r.part_id AND p.superseded_by_part_id IS NOT NULL
    ) edge ON true
  )`;
}

function partMatch(query: CatalogQuery): SQL {
  if (query.kind === "part-usages") return sql`p.working_id=${requiredId(query.id)}::uuid`;
  const term = query.q?.trim().toLowerCase(); if (!term) return sql`false`;
  const number = term.replace(/[\s._/-]+/g, "");
  const byNumber = sql`strpos(regexp_replace(lower(p.part_number),'[[:space:]./_-]+','','g'),${number}) > 0`;
  const byDescription = sql`strpos(lower(p.description),${term}) > 0`;
  return query.mode === "part" ? byNumber : query.mode === "description" ? byDescription : sql`(${byNumber} OR ${byDescription})`;
}

const usageJoins = sql`
  FROM visible_rows vr JOIN release_part p ON p.release_id=vr.release_id AND p.id=vr.part_id
  JOIN release_figure f ON f.release_id=vr.release_id AND f.id=vr.figure_id
  JOIN release_variant v ON v.release_id=f.release_id AND v.id=f.variant_id
  JOIN release_system s ON s.release_id=f.release_id AND s.id=f.system_id
  JOIN release_model m ON m.release_id=v.release_id AND m.id=v.model_id`;
const usageSummary = sql`jsonb_build_object('figureId',f.working_id,'groupNo',f.group_no,'assemblyName',f.name,'systemName',s.name,'modelName',m.name,'serial',v.label)`;
const groupOrder = sql`ARRAY(SELECT CASE WHEN token[1] ~ '^[0-9]+$' THEN lpad(token[1],32,'0') ELSE token[1] END
  FROM regexp_matches(COALESCE(f.group_no,''),'([0-9]+|[^0-9]+)','g') WITH ORDINALITY AS segments(token,position) ORDER BY position)`;

export async function partPage(tx: Transaction, scope: CatalogScope, query: CatalogQuery, state: State) {
  if (query.kind === "usage-index") {
    const candidates = sql`SELECT DISTINCT ON (p.working_id) p.working_id::text AS key,p.release_id,
      jsonb_build_object('partId',p.working_id,'summary',${usageSummary} || jsonb_build_object('productLineName',m.product_line_name)) AS item
      ${usageJoins} ORDER BY p.working_id,f.sort_order,${groupOrder},f.working_id,vr.working_id,p.release_id`;
    return candidatePage<PartItem>(tx, scope, state, visibleRows(scope), candidates);
  }
  const ctes = reachableParts(scope);
  const match = partMatch(query);
  const part = partProjection("p", scope.authority.canViewPrices);
  const candidates = query.kind === "search"
    ? sql`SELECT p.working_id::text || ':' || p.release_id::text AS key,p.release_id,${part} AS item
        FROM reachable r JOIN release_part p ON p.release_id=r.release_id AND p.id=r.part_id WHERE ${match}`
    : sql`SELECT p.working_id::text || ':' || f.working_id::text || ':' || vr.working_id::text AS key,p.release_id,
        ${usageSummary} || jsonb_build_object('part',${part}) AS item ${usageJoins} WHERE ${match}
        UNION ALL
        SELECT p.working_id::text || ':' || p.release_id::text AS key,p.release_id,
          jsonb_build_object('part',${part},'figureId',NULL,'groupNo',NULL,'assemblyName',NULL,'systemName',NULL,'modelName',NULL,'serial',NULL) AS item
        FROM reachable r JOIN release_part p ON p.release_id=r.release_id AND p.id=r.part_id
        WHERE ${match} AND NOT EXISTS (SELECT 1 FROM visible_rows vr WHERE vr.release_id=p.release_id AND vr.part_id=p.id)`;
  const page = await candidatePage<PartItem>(tx, scope, state, ctes, candidates);
  if (query.kind === "part-usages" && !state.after && !page.items.length) unavailable();
  return page;
}
