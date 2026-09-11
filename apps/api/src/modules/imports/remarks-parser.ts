export interface RelationshipHint {
  kind: "requires";
  partNumber: string;
  qty: number;
  reviewState: "pending";
  literal: string;
}
/** Narrow, explicitly unreviewed hints. Never rewrites literal remarks or approves an edge. */
export function parseRemarks(literal: string | null): RelationshipHint[] {
  if (!literal) return [];
  const match =
    /^\s*requires\s+([a-z0-9][a-z0-9-]*)\s*\(QTY\s+([1-9][0-9]{0,3})\)\s*$/i.exec(
      literal,
    );
  return match
    ? [
        {
          kind: "requires",
          partNumber: match[1].toUpperCase(),
          qty: Number(match[2]),
          reviewState: "pending",
          literal,
        },
      ]
    : [];
}
