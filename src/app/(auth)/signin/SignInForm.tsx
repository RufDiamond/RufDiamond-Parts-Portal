"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components";
import styles from "./signin.module.css";

/**
 * Portal login — slide 1.
 *
 * No authentication behind it yet: there is no session, no user store and no
 * password handling. Signing in routes to the portal so the rest of the
 * screens can be walked. Auth is `build-plan.md` stage 5.
 */
export function SignInForm({ date }: { date: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [language, setLanguage] = useState("en-CA");

  return (
    <main className={styles.screen}>
      <section className={styles.hero} aria-hidden="true">
        {/*
          * The deck's two hero images are linked rather than embedded, so they
          * did not travel with the file. Standing in until RUFDiamond supplies
          * them — see clients.md.
          */}
        <span className={styles.heroMark}>RUF DIAMOND</span>
        <span className={styles.heroNote}>Machine photography to follow</span>
      </section>

      <section className={styles.panel}>
        <header className={styles.panelHead}>
          <span className={styles.date}>{date}</span>
          <Image
            src="/brand/flag-ca.jpg"
            alt=""
            width={40}
            height={40}
            className={styles.flag}
          />
        </header>

        <h1 className={styles.title}>Parts &amp; Service Portal</h1>

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
              autoComplete="username"
              required
            />
            <p className={styles.hint}>
              Please enter your username here (e.g., XX###).
            </p>
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
              autoComplete="current-password"
              required
            />
            <p className={styles.hint}>Please enter your password here.</p>
          </div>

          <p className={styles.linkRow}>
            <a className={styles.link} href="#forgot">
              Forgot password
              <span aria-hidden="true"> &gt;&gt;&gt;</span>
            </a>
            <Icon name="lock" size="md" className={styles.linkIcon} />
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
            <p className={styles.hint}>Please select your preferred language.</p>
          </div>

          <button type="submit" className={styles.submit}>
            Sign in
          </button>

          <p className={styles.linkRow}>
            <a className={styles.link} href="#request-account">
              Request a user account here
              <span aria-hidden="true"> &gt;&gt;&gt;</span>
            </a>
            <Icon name="user-plus" size="md" className={styles.linkIcon} />
          </p>
        </form>
      </section>
    </main>
  );
}
