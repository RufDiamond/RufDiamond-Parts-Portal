"use client";
import { useState } from "react";
import type {
  AssemblyReferenceReviewInput,
  DepictionReviewInput,
  SourceReviewDetail,
} from "@rufdiamond/contracts";
import { MappingApiError } from "@/features/diagram-mapping/api-client";
import styles from "./source-review.module.css";
type Input = AssemblyReferenceReviewInput | DepictionReviewInput;
export type SourceReviewApi = {
  read(): Promise<SourceReviewDetail>;
  approve(
    id: string,
    version: number,
    input: Input,
    key: string,
  ): Promise<SourceReviewDetail>;
};
export function SourceReview({
  initial,
  api,
}: {
  initial: SourceReviewDetail;
  api: SourceReviewApi;
}) {
  const [source, setSource] = useState(initial),
    [selected, setSelected] = useState<string[]>([]),
    [preferredMode, setMode] = useState<
      "table-only" | "not-depicted" | "assembly-reference-unspecified"
    >("not-depicted"),
    [evidence, setEvidence] = useState("");
  const [pending, setPending] = useState<{
      input: Input;
      version: number;
      key: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const mode =
    !source.canReview && source.canReviewAssembly
      ? "assembly-reference-unspecified"
      : preferredMode === "assembly-reference-unspecified" &&
          !source.canReviewAssembly
        ? "not-depicted"
        : preferredMode;
  const canReview =
    source.target === "import"
      ? source.canReviewAssembly
      : source.canReview || source.canReviewAssembly;
  async function reload() {
    if (busy || uncertain) return;
    setBusy(true);
    try {
      setSource(await api.read());
      setSelected([]);
      setPending(null);
      setError("");
    } catch {
      setError("Source access is unavailable. Recheck access and retry.");
    } finally {
      setBusy(false);
    }
  }
  function prepare() {
    if (!canReview) return;
    const common = {
      sourceBindingSha256: source.sourceBindingSha256,
      evidence: evidence.trim(),
      confirmed: true as const,
    };
    let input: Input;
    if (source.target === "import") {
      const row = source.rows.find((r) => r.stagingRowId === selected[0]),
        issue = source.issues.find(
          (i) =>
            i.stagingRowId === row?.stagingRowId &&
            i.code === "INVALID_FIELD" &&
            i.field === "QTY",
        );
      if (!row || !issue || selected.length !== 1) {
        setError(
          "Select one exact quantity issue for this combined assembly decision.",
        );
        return;
      }
      input = {
        ...common,
        decision: "assembly-reference-unspecified",
        stagingRowId: row.stagingRowId,
        stagingRowVersion: row.stagingRowVersion,
        issueId: issue.id,
        issueVersion: issue.version,
      };
    } else if (mode === "assembly-reference-unspecified") {
      const original = source.approvals.find(
        (a) =>
          a.mode === mode &&
          a.rowIds.includes(selected[0]) &&
          a.quantityDecisionId,
      );
      if (!original?.quantityDecisionId || selected.length !== 1) {
        setError(
          "Select the exact existing assembly reference whose original combined decision needs re-review.",
        );
        return;
      }
      input = {
        ...common,
        mode,
        rowIds: selected,
        quantityDecisionId: original.quantityDecisionId,
      };
    } else input = { ...common, mode, rowIds: selected };
    setPending({ input, version: source.version, key: crypto.randomUUID() });
    setError("");
  }
  async function approve() {
    if (!pending || busy) return;
    setBusy(true);
    setError("");
    try {
      setSource(
        await api.approve(
          source.id,
          pending.version,
          pending.input,
          pending.key,
        ),
      );
      setPending(null);
      setUncertain(false);
      setSelected([]);
      setStatus(
        "Source decision recorded with your authenticated reviewer identity. Publication remains a separate action.",
      );
    } catch (failure) {
      const retryable =
        !(failure instanceof MappingApiError) || failure.status >= 500;
      setUncertain(retryable);
      if (!retryable) setPending(null);
      setError(
        retryable
          ? "Outcome uncertain. Retry this exact decision before making another."
          : "Decision rejected or source/version changed. Reload and review current source evidence.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.review}>
      <h1>Catalogue source review</h1>
      <p>
        Verify the original source before approving a table-only list or a row
        that is not physically depicted. Conflicting part identities and missing
        labels require source correction.
      </p>
      <p>
        Source binding <code>{source.sourceBindingSha256}</code> · Review
        version {source.version}
      </p>
      {source.sourceConflict && (
        <p role="alert">
          The source changed; earlier decisions may be stale. Review the current
          rows and source before making a new decision.
        </p>
      )}
      <button disabled={busy || uncertain} onClick={() => void reload()}>
        Reload source
      </button>
      <div
        className={styles.tableScroll}
        tabIndex={0}
        role="region"
        aria-label="Retained source rows"
      >
        <table>
          <caption>Exact retained source rows</caption>
          <thead>
            <tr>
              <th>Select</th>
              <th>Part</th>
              <th>Reference</th>
              <th>Raw quantity</th>
              <th>Source location and remarks</th>
            </tr>
          </thead>
          <tbody>
            {source.rows.map((row) => {
              const id =
                source.target === "import"
                  ? row.stagingRowId
                  : row.figurePartId!;
              return (
                <tr key={row.stagingRowId}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.partNumber}`}
                      checked={selected.includes(id)}
                      disabled={!canReview || busy || !!pending}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, id]
                            : selected.filter((v) => v !== id),
                        )
                      }
                    />
                  </td>
                  <td>
                    {row.partNumber} — {row.description}
                  </td>
                  <td>{row.reference ?? "No printed reference"}</td>
                  <td>{row.rawQuantity ?? "Not specified"}</td>
                  <td>
                    Row {row.rowNumber} · {row.remarks}
                    <br />
                    Source SHA256 <code>{row.sourceChecksum}</code>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {source.issues.length > 0 && (
        <ul>
          {source.issues.map((i) => (
            <li key={i.id}>
              {i.code}: {i.message}
            </li>
          ))}
        </ul>
      )}
      {source.approvals.length > 0 && (
        <ul aria-label="Attributable review history">
          {source.approvals.map((a) => (
            <li key={a.decisionId}>
              {a.mode} · {a.reviewerName} · {a.reviewedAt} ·{" "}
              {a.current ? "Current source" : "Stale source"} · {a.evidence}
            </li>
          ))}
        </ul>
      )}
      {canReview ? (
        <>
          <fieldset disabled={busy || !!pending}>
            {source.target === "figure" && (
              <label>
                Depiction decision{" "}
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as typeof mode)}
                >
                  {source.canReview && (
                    <option value="not-depicted">
                      Selected rows: not depicted
                    </option>
                  )}
                  {source.canReview && (
                    <option value="table-only">Complete table-only list</option>
                  )}
                  {source.canReviewAssembly && (
                    <option value="assembly-reference-unspecified">
                      Re-review assembly reference
                    </option>
                  )}
                </select>
              </label>
            )}
            <label>
              Source evidence{" "}
              <textarea
                rows={6}
                value={evidence}
                maxLength={4000}
                onChange={(e) => setEvidence(e.target.value)}
              />
            </label>
            <button
              disabled={selected.length === 0 || evidence.trim().length < 10}
              onClick={prepare}
            >
              Review source decision
            </button>
          </fieldset>
          {pending && (
            <section
              className={styles.confirmation}
              aria-label="Confirm source decision"
            >
              <p>
                {source.target === "import" ||
                mode === "assembly-reference-unspecified"
                  ? "Confirm BOTH unspecified installed quantity and informational nondepiction for this exact assembly reference. The raw quantity remains zero; order quantity is chosen independently."
                  : `Confirm ${mode} for exactly ${selected.length} selected source rows.`}
              </p>
              <p>{pending.input.evidence}</p>
              <button disabled={busy} onClick={() => void approve()}>
                {uncertain ? "Retry exact decision" : "Confirm source decision"}
              </button>
              {!uncertain && (
                <button disabled={busy} onClick={() => setPending(null)}>
                  Cancel decision
                </button>
              )}
            </section>
          )}
        </>
      ) : (
        <p>
          A named reviewer with current catalogue and publisher authority is
          required to approve.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
    </section>
  );
}
