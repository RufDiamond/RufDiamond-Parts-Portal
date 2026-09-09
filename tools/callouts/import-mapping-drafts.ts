import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import ts from "typescript";
import { Value } from "@sinclair/typebox/value";
import {
  ImportDetailSchema,
  ImportUploadMetadataSchema,
  MappingDraftManifestSchema,
  MappingEditorDocumentSchema,
  MappingRevisionSchema,
  MeResponseSchema,
  percentagePoint,
  validateMappingGeometry,
  type ImportDetail,
  type ImportUploadMetadata,
  type MappingDraftManifest,
  type MappingEditorDocument,
  type MappingRevision,
  type MappingIssue,
} from "@rufdiamond/contracts";
export type { MappingDraftManifest } from "@rufdiamond/contracts";
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
type LegacyCatalog = {
  figures: Array<{ id: string; name: string }>;
  parts: Array<{ id: string; partNumber: string }>;
  figureParts: Array<{ id: string; figureId: string; partId: string }>;
  callouts: Array<{
    id: string;
    figureId: string;
    figurePartId: string | null;
    number: number;
  }>;
};

/** Literal AST extraction only: no eval/import/TypeScript execution of supplied source. */
function legacyCatalog(bytes: Buffer): LegacyCatalog {
  if (bytes.length > 25 * 1024 * 1024)
    throw new Error("Legacy source limit exceeded");
  const text = bytes.toString("utf8");
  let parsed: Record<string, unknown>;
  if (text.trimStart().startsWith("{")) parsed = JSON.parse(text);
  else {
    const file = ts.createSourceFile(
        "catalogue.ts",
        text,
        ts.ScriptTarget.Latest,
        true,
      ),
      data: Record<string, unknown> = {};
    const literal = (node: ts.Expression): unknown => {
      if (ts.isArrayLiteralExpression(node))
        return node.elements.map((element) => literal(element));
      if (ts.isObjectLiteralExpression(node))
        return Object.fromEntries(
          node.properties.map((property) => {
            if (
              !ts.isPropertyAssignment(property) ||
              !property.name ||
              !(
                ts.isIdentifier(property.name) ||
                ts.isStringLiteral(property.name)
              )
            )
              throw new Error("Only literal legacy properties are permitted");
            return [property.name.text, literal(property.initializer)];
          }),
        );
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
        return node.text;
      if (ts.isNumericLiteral(node)) return Number(node.text);
      if (node.kind === ts.SyntaxKind.NullKeyword) return null;
      if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
      if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
      if (
        ts.isPrefixUnaryExpression(node) &&
        node.operator === ts.SyntaxKind.MinusToken &&
        ts.isNumericLiteral(node.operand)
      )
        return -Number(node.operand.text);
      throw new Error("Executable legacy source expressions are not permitted");
    };
    for (const statement of file.statements)
      if (ts.isVariableStatement(statement))
        for (const declaration of statement.declarationList.declarations)
          if (
            ts.isIdentifier(declaration.name) &&
            ["figures", "parts", "figureParts", "callouts"].includes(
              declaration.name.text,
            )
          ) {
            if (
              !declaration.initializer ||
              Object.hasOwn(data, declaration.name.text)
            )
              throw new Error("Ambiguous legacy source arrays");
            data[declaration.name.text] = literal(declaration.initializer);
          }
    parsed = data;
  }
  if (
    !["figures", "parts", "figureParts", "callouts"].every((key) =>
      Array.isArray(parsed[key]),
    )
  )
    throw new Error("Missing legacy catalogue arrays");
  return parsed as unknown as LegacyCatalog;
}
const unique = <T>(rows: T[], match: (row: T) => boolean, label: string): T => {
  const found = rows.filter(match);
  if (found.length !== 1) throw new Error(`Missing or ambiguous ${label}`);
  return found[0];
};

export function buildMappingDraft(
  manifest: MappingDraftManifest,
  job: ImportDetail,
  editor: MappingEditorDocument,
  sourceBytes: Buffer,
  legacyBytes: Buffer,
  operatorId: string,
) {
  if (
    !Value.Check(MappingDraftManifestSchema, manifest) ||
    !Value.Check(ImportDetailSchema, job) ||
    !Value.Check(MappingEditorDocumentSchema, editor)
  )
    throw new Error("Invalid strict draft import envelope");
  if (manifest.operatorId !== operatorId)
    throw new Error(
      "The authenticated operator differs from the explicit manifest operator",
    );
  if (
    job.state !== "applied" ||
    job.id !== manifest.jobId ||
    job.modelId !== manifest.modelId ||
    job.variantId !== manifest.variantId ||
    editor.source.figure.modelId !== manifest.modelId ||
    editor.source.figure.variantId !== manifest.variantId ||
    editor.source.figure.id !== manifest.figureId
  )
    throw new Error("Canonical import target mismatch");
  if (
    sourceBytes.length > 25 * 1024 * 1024 ||
    hash(sourceBytes) !== manifest.sourceChecksum ||
    job.sourceChecksum !== manifest.sourceChecksum ||
    hash(legacyBytes) !== manifest.legacySourceChecksum
  )
    throw new Error("Full original or legacy source hash mismatch");
  if (
    editor.sourceConflict ||
    manifest.catalogueBindingSha256 !== editor.source.catalogueBindingSha256 ||
    manifest.drawingSha256 !== editor.source.drawing?.sha256 ||
    manifest.imageWidth !== editor.source.drawing.width ||
    manifest.imageHeight !== editor.source.drawing.height
  )
    throw new Error("Stale source drawing, dimensions or catalogue binding");
  const legacy = legacyCatalog(legacyBytes);
  const legacyFigure = unique(
    legacy.figures,
    (f) => f.id === manifest.legacyFigureId,
    "legacy figure",
  );
  if (
    legacyFigure.name.trim().toLowerCase() !==
    editor.source.figure.name.trim().toLowerCase()
  )
    throw new Error("Legacy and canonical figure source names conflict");
  const document = structuredClone(editor.document),
    issues: MappingIssue[] = [],
    fallbacks: MappingDraftManifest["proposals"] = [],
    seen = new Set<string>();
  for (const proposal of manifest.proposals) {
    if (seen.has(proposal.sourceRowKey))
      throw new Error("Ambiguous proposal source key");
    seen.add(proposal.sourceRowKey);
    const alias = unique(
        job.aliases,
        (a) => a.sourceRowKey === proposal.sourceRowKey,
        "canonical source alias",
      ),
      oldRow = unique(
        legacy.figureParts,
        (r) =>
          r.id === proposal.legacyFigurePartId &&
          r.figureId === manifest.legacyFigureId,
        "legacy row",
      ),
      oldCallout = unique(
        legacy.callouts,
        (c) =>
          c.id === proposal.legacyCalloutId &&
          c.figureId === manifest.legacyFigureId &&
          c.figurePartId === oldRow.id,
        "legacy occurrence",
      ),
      oldPart = unique(
        legacy.parts,
        (p) => p.id === oldRow.partId,
        "legacy part",
      );
    if (
      alias.figureId !== manifest.figureId ||
      !alias.calloutId ||
      alias.refNo !== proposal.refNo ||
      String(oldCallout.number) !== proposal.refNo ||
      oldPart.partNumber.trim().toUpperCase() !== alias.partNumber
    )
      throw new Error(
        "Legacy row/occurrence association conflicts with canonical source alias",
      );
    const sourceRow = unique(
      editor.source.rows,
      (r) => r.id === alias.figurePartId && r.partNumber === alias.partNumber,
      "current source row",
    );
    const occurrence = unique(
      document.occurrences,
      (c) =>
        c.calloutId === alias.calloutId &&
        c.figurePartId === sourceRow.id &&
        c.refNo === proposal.refNo,
      "current occurrence",
    );
    const point = (p: readonly [number, number]) => {
      if (
        p.some((value) => !Number.isFinite(value) || value < 0 || value > 100)
      )
        throw new Error("Proposal percentage is outside source bounds");
      return percentagePoint(p, manifest.imageWidth, manifest.imageHeight);
    };
    const converted = structuredClone(occurrence);
    converted.evidence = proposal.evidence;
    const label = proposal.labelRegion;
    converted.labelRegion = label
      ? {
          x: point([label.x, label.y])[0],
          y: point([label.x, label.y])[1],
          width: point([label.width, label.height])[0],
          height: point([label.width, label.height])[1],
        }
      : null;
    converted.regions = proposal.regions.map((region) => ({
      id: region.id,
      outer: region.outer.map(point),
      holes: region.holes.map((ring) => ring.map(point)),
    }));
    const invalid = validateMappingGeometry({
      ...document,
      occurrences: [converted],
    });
    if (proposal.legacyMaskPath)
      invalid.push({
        code: "legacy_mask_fallback",
        path: proposal.legacyCalloutId,
        message:
          "Legacy mask remains source display fallback; no arbitrary SVG conversion is allowed.",
      });
    if (invalid.length) {
      issues.push(
        ...invalid.map((issue) => ({
          ...issue,
          path: `${proposal.legacyCalloutId}:${issue.path}`,
        })),
      );
      fallbacks.push(structuredClone(proposal));
      continue;
    }
    if (
      (occurrence.labelRegion || occurrence.regions.length) &&
      JSON.stringify(occurrence) !== JSON.stringify(converted)
    )
      throw new Error(
        "Existing mapping geometry conflicts with draft proposal; preserve and review current edits",
      );
    Object.assign(occurrence, converted);
  }
  issues.push(...validateMappingGeometry(document));
  return {
    mode: "dry-run" as const,
    document,
    issues,
    fallbacks,
    sourceChecksum: manifest.sourceChecksum,
    legacySourceChecksum: manifest.legacySourceChecksum,
    operatorId,
  };
}
export interface OperatorTransport {
  operatorId: string;
  request(
    method: "GET" | "PUT" | "POST",
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<unknown>;
}
export async function importMappingDraft(
  transport: OperatorTransport,
  manifest: MappingDraftManifest,
  source: Buffer,
  legacy: Buffer,
  apply = false,
) {
  const job = await transport.request(
      "GET",
      `/api/v1/admin/imports/${manifest.jobId}`,
    ),
    editor = await transport.request(
      "GET",
      `/api/v1/admin/figures/${manifest.figureId}/diagram-mapping`,
    );
  const draft = buildMappingDraft(
    manifest,
    job as ImportDetail,
    editor as MappingEditorDocument,
    source,
    legacy,
    transport.operatorId,
  );
  if (!apply) return draft;
  if (draft.issues.length)
    throw new Error(
      "Draft has blocking geometry/fallback issues; review before applying",
    );
  const result = await transport.request(
    "PUT",
    `/api/v1/admin/figures/${manifest.figureId}/diagram-mapping`,
    { document: draft.document },
    {
      "if-match": `"${manifest.expectedMappingVersion}"`,
      "idempotency-key": manifest.idempotencyKey,
    },
  );
  if (!Value.Check(MappingRevisionSchema, result))
    throw new Error("Invalid mapping service response");
  return {
    mode: "applied-draft" as const,
    revision: result as MappingRevision,
    sourceChecksum: manifest.sourceChecksum,
    legacySourceChecksum: manifest.legacySourceChecksum,
  };
}

function boundedFile(path: string, maximum: number) {
  if (!isAbsolute(path))
    throw new Error("Supply an explicit absolute file path");
  const stat = statSync(path);
  if (!stat.isFile() || stat.size < 1 || stat.size > maximum)
    throw new Error("File is outside the bounded source limits");
  return readFileSync(path);
}
export async function authenticatedOperator(
  apiOrigin: string,
  webOrigin: string,
  cookieFile: string,
  operatorId: string,
): Promise<OperatorTransport> {
  const api = new URL(apiOrigin),
    web = new URL(webOrigin);
  if (
    api.origin !== apiOrigin ||
    web.origin !== webOrigin ||
    api.username ||
    api.password ||
    web.username ||
    web.password ||
    !(
      api.protocol === "https:" ||
      (api.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(api.hostname))
    )
  )
    throw new Error(
      "Explicit HTTPS API/web origins or local loopback API are required",
    );
  const stat = statSync(cookieFile);
  if (
    (stat.mode & 0o077) !== 0 ||
    (process.getuid && stat.uid !== process.getuid())
  )
    throw new Error(
      "Cookie file must be owned by the current user and private (0600)",
    );
  const cookie = boundedFile(cookieFile, 8192).toString("utf8").trim();
  if (!/^[^\r\n]+$/.test(cookie) || !cookie.includes("="))
    throw new Error("Cookie file must contain one Cookie header value");
  const get = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${apiOrigin}${path}`, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(60000),
      headers: {
        ...init.headers,
        cookie,
        origin: webOrigin,
        accept: "application/json",
      },
    });
    if (!response.ok)
      throw new Error(`Authenticated API request failed (${response.status})`);
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > 8 * 1024 * 1024) throw new Error("API response exceeds limit");
    return response.json();
  };
  const me = await get("/api/v1/me");
  if (!Value.Check(MeResponseSchema, me) || me.id !== operatorId)
    throw new Error("Authenticated operator identity does not match");
  return {
    operatorId,
    async request(method, path, body, headers) {
      if (
        !/^\/api\/v1\/(?:admin\/imports(?:[/?]|$)|admin\/figures\/[^/]+\/diagram-mapping$)/.test(
          path,
        ) ||
        path.includes("..") ||
        path.includes("#")
      )
        throw new Error("Operator path is outside import scope");
      const binary = Buffer.isBuffer(body);
      return get(path, {
        method,
        headers: {
          ...(method === "GET" ? {} : { "content-type": "application/json" }),
          ...headers,
          ...(method === "GET" ? {} : { "x-csrf-token": me.csrfToken }),
        },
        ...(body === undefined
          ? {}
          : {
              body: binary
                ? (Readable.toWeb(Readable.from([body])) as unknown as BodyInit)
                : JSON.stringify(body),
            }),
        ...(binary ? { duplex: "half" } : {}),
      } as RequestInit);
    },
  };
}
export async function stageCatalogSource(
  transport: OperatorTransport,
  metadata: ImportUploadMetadata,
  source: Buffer,
  write: { expectedVersion: number; idempotencyKey: string },
  apply = false,
) {
  if (
    !Value.Check(ImportUploadMetadataSchema, metadata) ||
    source.length > 25 * 1024 * 1024 ||
    hash(source) !== metadata.sha256
  )
    throw new Error("Invalid exact source upload metadata/hash");
  if (!apply) {
    const { parseImport } =
        await import("../../apps/api/src/modules/imports/parser.js"),
      { normalizeImport } =
        await import("../../apps/api/src/modules/imports/normalizer.js");
    const parsed = normalizeImport(await parseImport(source, metadata.format));
    return {
      mode: "dry-run",
      sourceChecksum: parsed.sourceChecksum,
      rowCount: parsed.rows.length,
      validRowCount: parsed.rows.filter((r) => r.normalizationState === "valid")
        .length,
      issues: parsed.issues,
    };
  }
  return transport.request(
    "POST",
    `/api/v1/admin/imports?${new URLSearchParams({ ...metadata })}`,
    source,
    {
      "content-type":
        metadata.format === "csv"
          ? "text/csv"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "if-match": `"${write.expectedVersion}"`,
      "idempotency-key": write.idempotencyKey,
    },
  );
}
async function main() {
  const args = new Map<string, string>();
  let apply = false;
  for (let i = 2; i < process.argv.length; i++) {
    const flag = process.argv[i];
    if (flag === "--apply") {
      apply = true;
      continue;
    }
    if (
      ![
        "--manifest",
        "--stage-plan",
        "--job-plan",
        "--source-file",
        "--legacy-source-file",
        "--api-origin",
        "--web-origin",
        "--cookie-file",
        "--operator",
      ].includes(flag) ||
      !process.argv[i + 1] ||
      args.has(flag)
    )
      throw new Error("Invalid or duplicate operator arguments");
    args.set(flag, process.argv[++i]);
  }
  const required = (flag: string) => {
    const value = args.get(flag);
    if (!value) throw new Error(`Missing ${flag}`);
    return value;
  };
  if (
    ["--manifest", "--stage-plan", "--job-plan"].filter((key) => args.has(key))
      .length !== 1
  )
    throw new Error("Choose exactly one explicit operation plan");
  const operator = await authenticatedOperator(
    required("--api-origin"),
    required("--web-origin"),
    required("--cookie-file"),
    required("--operator"),
  );
  if (args.has("--stage-plan") || args.has("--job-plan")) {
    const plan = JSON.parse(
      boundedFile(
        required(args.has("--stage-plan") ? "--stage-plan" : "--job-plan"),
        8192,
      ).toString("utf8"),
    );
    if (
      !plan ||
      plan.operatorId !== operator.operatorId ||
      !Number.isInteger(plan.expectedVersion) ||
      plan.expectedVersion < 1 ||
      typeof plan.idempotencyKey !== "string" ||
      !plan.idempotencyKey ||
      plan.idempotencyKey.length > 255
    )
      throw new Error("Invalid explicit operator plan");
    if (args.has("--stage-plan")) {
      if (
        Object.keys(plan).some(
          (key) =>
            ![
              "operatorId",
              "expectedVersion",
              "idempotencyKey",
              "metadata",
            ].includes(key),
        )
      )
        throw new Error("Unexpected stage-plan fields");
      const result = await stageCatalogSource(
        operator,
        plan.metadata,
        boundedFile(required("--source-file"), 25 * 1024 * 1024),
        plan,
        apply,
      );
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return;
    }
    if (
      Object.keys(plan).some(
        (key) =>
          ![
            "operatorId",
            "expectedVersion",
            "idempotencyKey",
            "jobId",
            "operation",
          ].includes(key),
      ) ||
      !/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(plan.jobId) ||
      !["validate", "apply"].includes(plan.operation)
    )
      throw new Error("Invalid job plan");
    const result = apply
      ? await operator.request(
          "POST",
          `/api/v1/admin/imports/${plan.jobId}/${plan.operation}`,
          {},
          {
            "if-match": `"${plan.expectedVersion}"`,
            "idempotency-key": plan.idempotencyKey,
          },
        )
      : {
          mode: "dry-run",
          job: await operator.request(
            "GET",
            `/api/v1/admin/imports/${plan.jobId}`,
          ),
          requestedOperation: plan.operation,
        };
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  const manifest = JSON.parse(
      boundedFile(required("--manifest"), 1024 * 1024).toString("utf8"),
    ) as MappingDraftManifest,
    source = boundedFile(required("--source-file"), 25 * 1024 * 1024),
    legacy = boundedFile(required("--legacy-source-file"), 25 * 1024 * 1024);
  const result = await importMappingDraft(
    operator,
    manifest,
    source,
    legacy,
    apply,
  );
  process.stdout.write(
    `${JSON.stringify(result.mode === "dry-run" ? { mode: result.mode, sourceChecksum: result.sourceChecksum, issues: result.issues, occurrences: result.document.occurrences.length } : { mode: result.mode, revisionId: result.revision.revisionId, checksum: result.revision.checksum, sourceChecksum: result.sourceChecksum })}\n`,
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch(() => {
    process.stderr.write(
      "Mapping import stopped. Check source bindings, operator access and arguments; no approval or publication was performed.\n",
    );
    process.exitCode = 1;
  });
