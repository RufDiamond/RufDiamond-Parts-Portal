"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./signin.module.css";
import { LanguageSelect } from "./LanguageSelect";
import { signInCustomer, resetCustomerNavigation } from "@/state/customer-session";

/**
 * Portal login — slide 1.
 *
 * One dark screen: the emblem oversized and bleeding off the left edge, the
 * wordmark and title across the top, account access down the right.
 *
 * API mode signs in through the same-origin authenticated backend proxy.
 * The explicitly local fixture demo retains its walkthrough entry.
 */
const LANGUAGES = [
  { value: "en-CA", label: "English (Canada)" },
  { value: "fr-CA", label: "Français (Canada)" },
];

export function SignInForm({ date, apiMode = false }: { date: string; apiMode?: boolean }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [language, setLanguage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <main className={styles.screen}>
      {/* The supplied mark, used exactly as delivered. */}
      <Image
        src="/brand/rufdiamond-logo.png"
        alt=""
        width={801}
        height={957}
        className={styles.emblem}
        priority
      />

      <div className={styles.inner}>
        <header className={styles.masthead}>
          <Image
            src="/brand/login-wordmark.png"
            alt="RUF Diamond"
            width={900}
            height={317}
            className={styles.wordmark}
            priority
          />
          <Image
            src="/brand/flag.png"
            alt="Canada"
            width={698}
            height={379}
            className={styles.flag}
          />
          <span className={styles.dateBlock}>
            <span className={styles.date}>{date}</span>
            <Image
              src="/brand/calendar-light.png"
              alt=""
              width={200}
              height={200}
              className={styles.calendar}
            />
          </span>
          <h1 className={styles.title}>Parts &amp; Service Portal</h1>
        </header>

        <form
          className={styles.form}
          onSubmit={async (event) => {
            event.preventDefault();
            if (!apiMode) { router.push("/"); return; }
            setBusy(true); setError("");
            try { await signInCustomer(username, password); setPassword(""); resetCustomerNavigation("/"); }
            catch { setError("Sign-in failed. Check your details and try again."); setBusy(false); }
          }}
        >
          <p className={styles.formTitle}>Account access</p>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <div className={styles.field}>
            <label className={styles.label} htmlFor="username">
              Username:
            </label>
            <input
              id="username"
              className={styles.input}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Please enter your username here (e.g., XX###)."
              autoComplete="username"
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">
              Password:
            </label>
            <input
              id="password"
              type="password"
              className={styles.input}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Please enter your password here."
              autoComplete="current-password"
              required
            />
          </div>

          <p className={styles.linkRow}>
            <a className={styles.link} href="#forgot">
              Forgot Password <span aria-hidden="true">&gt;&gt;&gt;</span>
            </a>
            <Image
              src="/brand/icon-lock.png"
              alt=""
              width={256}
              height={256}
              className={styles.linkIcon}
            />
          </p>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="language">
              Language:
            </label>
            <LanguageSelect
              id="language"
              value={language}
              onChange={setLanguage}
              placeholder="Please select your preferred language."
              options={LANGUAGES}
            />
          </div>

          <button type="submit" className={styles.submit} disabled={busy}>
            Sign in
          </button>

          <p className={`${styles.linkRow} ${styles.requestRow}`}>
            <a className={styles.link} href="#request-account">
              Request a user account here{" "}
              <span aria-hidden="true">&gt;&gt;&gt;</span>
            </a>
            <Image
              src="/brand/icon-account.png"
              alt=""
              width={256}
              height={256}
              className={styles.linkIcon}
            />
          </p>
        </form>
      </div>
    </main>
  );
}
