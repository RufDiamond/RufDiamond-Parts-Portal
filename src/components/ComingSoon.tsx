"use client";

import { useEffect } from "react";
import styles from "./ComingSoon.module.css";

export interface ComingSoonProps {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}

/**
 * A screen that has not been built yet, said plainly.
 *
 * The deck draws its dialogs this way — a titled box, a sentence, one way out
 * (slide 42). Using the same shape here means the real dialogs, when they
 * land, will not look like a different application.
 */
export function ComingSoon({ title, children, onClose }: ComingSoonProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className={styles.panel}
        onClick={(event) => event.stopPropagation()}
      >
        <p className={styles.title}>{title}</p>
        <div className={styles.body}>{children}</div>
        <button type="button" className={styles.ok} onClick={onClose} autoFocus>
          OK
        </button>
      </div>
    </div>
  );
}
