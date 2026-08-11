"use client";

import { useState } from "react";
import type { PublishQueue } from "@/types/admin";
import { AdminShell } from "../AdminShell";
import shell from "../admin.module.css";
import catalog from "../catalog.module.css";
import styles from "./publishing.module.css";

const OPERATOR = "C. Kane";

export function PublishingBoard({ queue }: { queue: PublishQueue }) {
  const { ready, blocked, history, environment, liveRevision } = queue;

  // Rollback is client-side: there is no backend to revert against yet.
  const [rollbackTarget, setRollbackTarget] = useState<string | null>(null);
  const [reverted, setReverted] = useState<Record<string, string>>({});

  const confirmRollback = () => {
    if (!rollbackTarget) return;
    setReverted((current) => ({
      ...current,
      [rollbackTarget]: `${new Date().toLocaleDateString("en-CA")} by ${OPERATOR}`,
    }));
    setRollbackTarget(null);
  };

  return (
    <AdminShell
      active="publish"
      title="Publishing"
      operator={OPERATOR}
      record={[
        { label: "Environment", value: environment },
        { label: "Live revision", value: liveRevision ?? "Never published" },
        {
          label: "Ready",
          value: `${ready.length} ${ready.length === 1 ? "change" : "changes"}`,
        },
        {
          label: "Blocked",
          value: `${blocked.length} ${blocked.length === 1 ? "change" : "changes"}`,
        },
        { label: "Rollback window", value: `Last ${history.length} revisions` },
      ]}
      actions={
        <>
          <button type="button" className={shell.button} disabled>
            Preview as customer
          </button>
          <button
            type="button"
            className={`${shell.button} ${shell.buttonPrimary}`}
            disabled={ready.length === 0}
            title={
              ready.length === 0
                ? "Nothing is ready to publish"
                : "No backend to publish to yet"
            }
          >
            Publish {ready.length}{" "}
            {ready.length === 1 ? "change" : "changes"}
          </button>
        </>
      }
    >
      <p className={catalog.blurb}>
        Edits stay in draft until published. Customers keep seeing the last
        published revision, so a half-mapped figure never reaches a machine.
      </p>

      <p className={catalog.sectionLabel}>Ready to publish</p>
      <table className={catalog.table} style={{ marginBottom: 28 }}>
        <thead>
          <tr>
            <th scope="col">Change</th>
            <th scope="col" style={{ width: 220 }}>
              Affects
            </th>
            <th scope="col" style={{ width: 150 }}>
              Edited by
            </th>
            <th scope="col" style={{ width: 150 }}>
              When
            </th>
          </tr>
        </thead>
        <tbody>
          {ready.map((change) => (
            <tr key={change.id}>
              <td>{change.change}</td>
              <td className={catalog.small}>{change.affects}</td>
              <td className={catalog.small}>{change.by ?? "—"}</td>
              <td className={catalog.mono}>{change.when ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className={catalog.sectionLabel}>Blocked</p>
      <table className={catalog.table} style={{ marginBottom: 16 }}>
        <thead>
          <tr>
            <th scope="col">Change</th>
            <th scope="col" style={{ width: 220 }}>
              Affects
            </th>
            <th scope="col" style={{ width: 400 }}>
              Why it is blocked
            </th>
            <th scope="col" className={catalog.colAction} style={{ width: 110 }} />
          </tr>
        </thead>
        <tbody>
          {blocked.map((change) => (
            <tr key={change.id}>
              <td>{change.change}</td>
              <td className={catalog.small}>{change.affects}</td>
              <td className={catalog.small}>{change.reason}</td>
              <td className={catalog.colAction}>
                {/* Kept visible and disabled, with the reason on the control
                    itself — a hidden button explains nothing. */}
                <button
                  type="button"
                  className={shell.button}
                  disabled
                  title={change.reason}
                >
                  Publish
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={catalog.note} style={{ marginBottom: 28, maxWidth: "80ch" }}>
        <span className={catalog.noteMark}>!</span>
        <span>
          A model cannot go live with unmapped callouts. Finish the mapping in
          the figure editor, then publish. Blocked controls stay visible and
          state the reason.
        </span>
      </div>

      <p className={catalog.sectionLabel}>Publish history</p>
      <table className={catalog.table}>
        <thead>
          <tr>
            <th scope="col" style={{ width: 160 }}>
              Revision
            </th>
            <th scope="col">Summary</th>
            <th scope="col" style={{ width: 150 }}>
              By
            </th>
            <th scope="col" style={{ width: 130 }}>
              When
            </th>
            <th scope="col" className={catalog.colAction} style={{ width: 110 }} />
          </tr>
        </thead>
        <tbody>
          {history.map((revision, index) => {
            const isLive = index === 0;
            return (
              <tr key={revision.id}>
                <td className={catalog.mono} style={{ fontSize: 13 }}>
                  {revision.revision}
                </td>
                <td>
                  {revision.summary}
                  {reverted[revision.revision] ? (
                    <span className={catalog.subline}>
                      Rolled back {reverted[revision.revision]}
                    </span>
                  ) : null}
                </td>
                <td className={catalog.small}>{revision.by}</td>
                <td className={catalog.mono}>{revision.when}</td>
                <td className={catalog.colAction}>
                  <button
                    type="button"
                    className={shell.button}
                    disabled={isLive}
                    title={
                      isLive
                        ? "This is the live revision. Publish a newer one to roll this back."
                        : `Restore ${revision.revision}`
                    }
                    onClick={() => setRollbackTarget(revision.revision)}
                  >
                    Roll back
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {rollbackTarget ? (
        <div
          className={styles.scrim}
          role="dialog"
          aria-modal="true"
          aria-label={`Roll back to ${rollbackTarget}`}
        >
          <div className={styles.dialog}>
            <div className={styles.dialogHead}>
              <p className={catalog.sectionLabel} style={{ margin: "0 0 4px" }}>
                Roll back
              </p>
              <h3 className={styles.dialogTitle}>Restore {rollbackTarget}?</h3>
            </div>
            <div className={styles.dialogBody}>
              <p className={styles.dialogCopy}>
                The live catalogue reverts to {rollbackTarget}. Draft edits are
                untouched; orders already raised keep the prices they were
                quoted at.
              </p>
              <div className={catalog.note}>
                <span className={catalog.noteMark}>!</span>
                <span>
                  Customers see the change within one minute. Roll forward again
                  from publish history.
                </span>
              </div>
            </div>
            <div className={styles.dialogFoot}>
              <button
                type="button"
                className={shell.button}
                onClick={() => setRollbackTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${shell.button} ${shell.buttonPrimary}`}
                onClick={confirmRollback}
              >
                Roll back
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}
