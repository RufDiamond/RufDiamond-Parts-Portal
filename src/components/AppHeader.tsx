"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMachine } from "@/state/MachineContext";
import { useRequest } from "@/state/RequestContext";
import { Icon } from "./Icon";
import styles from "./AppHeader.module.css";

/** Account shown in the header. Placeholder until accounts exist. */
const SITE_NAME = "Red Lake Mine";
const ACCOUNT_NO = "ACCT 88-4102";

/** The persistent bar: which machine, and what has been collected. */
export function AppHeader() {
  const router = useRouter();
  const { hydrated, selectedModel, selectedVariant, clearMachine } =
    useMachine();
  const { lines } = useRequest();

  const machineChosen = Boolean(selectedModel && selectedVariant);

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <Link href="/" className={styles.brand}>
          <span className={styles.wordmark}>RufDiamond</span>
          <span className={styles.product}>Parts catalog</span>
        </Link>

        {/* Nothing machine-related renders until hydration, so the server HTML
            and the first client render agree. */}
        {!hydrated ? null : machineChosen ? (
          <div className={styles.machine}>
            <span className={styles.machineLabel}>
              {selectedModel!.name} · {selectedVariant!.label}
            </span>
            <button
              type="button"
              className={styles.change}
              onClick={() => {
                clearMachine();
                router.push("/machine");
              }}
            >
              Change
            </button>
          </div>
        ) : (
          <Link href="/machine" className={styles.headerButton}>
            Select machine
          </Link>
        )}
      </div>

      <div className={styles.right}>
        <Link href="/request" className={styles.headerButton}>
          <Icon name="clipboard-list" size="md" />
          Request list
          <span className={styles.count}>{lines.length}</span>
        </Link>

        <span aria-hidden="true" className={styles.divider} />

        <button
          type="button"
          className={styles.account}
          onClick={() => router.push("/signin")}
          title="Sign out"
        >
          <span className={styles.accountName}>{SITE_NAME}</span>
          <span className={styles.accountNo}>{ACCOUNT_NO}</span>
        </button>
      </div>
    </header>
  );
}
