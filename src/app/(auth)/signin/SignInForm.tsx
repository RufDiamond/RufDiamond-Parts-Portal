"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./signin.module.css";

/**
 * Portal login — slide 1.
 *
 * One dark screen: the emblem oversized and bleeding off the left edge, the
 * wordmark and title across the top, account access down the right.
 *
 * No authentication behind it yet — there is no session, no user store and no
 * password handling. Signing in routes into the portal so the rest of the
 * screens can be walked. Auth is `build-plan.md` stage 5.
 */
export function SignInForm({ date }: { date: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [language, setLanguage] = useState("en-CA");

  return (
    <main className={styles.screen}>
      <Image
        src="/brand/login-emblem.png"
        alt=""
        width={700}
        height={1326}
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
            src="/brand/flag-ca.jpg"
            alt="Canada"
            width={60}
            height={40}
            className={styles.flag}
          />
          <span className={styles.dateBlock}>
            <Image
              src="/brand/calendar-light.png"
              alt=""
              width={200}
              height={200}
              className={styles.calendar}
            />
            <span className={styles.date}>{date}</span>
          </span>
          <h1 className={styles.title}>Parts &amp; Service Portal</h1>
        </header>

        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            router.push("/");
          }}
        >
          <p className={styles.formTitle}>Account access</p>

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
              src="/brand/lock.png"
              alt=""
              width={40}
              height={40}
              className={styles.linkIcon}
            />
          </p>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="language">
              Language:
            </label>
            <select
              id="language"
              className={styles.select}
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              <option value="en-CA">English (Canada)</option>
              <option value="fr-CA">Français (Canada)</option>
            </select>
          </div>

          <button type="submit" className={styles.submit}>
            Sign in
          </button>

          <p className={styles.linkRow}>
            <a className={styles.link} href="#request-account">
              Request a user account here{" "}
              <span aria-hidden="true">&gt;&gt;&gt;</span>
            </a>
          </p>
        </form>
      </div>
    </main>
  );
}
