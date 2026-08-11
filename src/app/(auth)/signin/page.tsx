"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components";
import screen from "@/styles/screen.module.css";
import styles from "./signin.module.css";

const LANGUAGES = ["English", "Français", "Deutsch"];

const FACTS = [
  { label: "Catalog", value: "REV 11.4 · 2026-06-30" },
  { label: "Distributor", value: "RUFDIAMOND LTD · CA" },
  { label: "Support", value: "+1 800 555 0142" },
];

/**
 * Sign-in is presentation only. Any credentials proceed — there is no auth
 * layer yet, and nothing here is validated or stored.
 */
export default function SignInPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [language, setLanguage] = useState(LANGUAGES[0]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    router.push("/machine");
  };

  return (
    <main className={styles.page}>
      <section className={styles.pitch}>
        <div className={styles.brand}>
          <span className={styles.wordmark}>RufDiamond</span>
          <span className={styles.wordmarkSub}>Parts catalog</span>
        </div>

        <div className={styles.pitchBody}>
          <span className={styles.eyebrowInverse}>
            Electronic parts portal · Pilot build
          </span>
          <h1 className={styles.display}>Spare parts catalog</h1>
          <p className={styles.pitchCopy}>
            Sign in to identify parts against a machine serial and raise a
            parts request. Catalog revision 11.4 covers Fat Truck FT3 Wagon,
            serial number 99FT3WXXXXXX and up.
          </p>
        </div>

        <div className={styles.facts}>
          {FACTS.map((fact) => (
            <div key={fact.label} className={styles.fact}>
              <span className={styles.eyebrowInverse}>{fact.label}</span>
              <span className={styles.factValue}>{fact.value}</span>
            </div>
          ))}
        </div>
      </section>

      <form className={styles.form} onSubmit={onSubmit}>
        <div className={styles.formHead}>
          <span className="eyebrow">Account access</span>
          <h2 className={styles.formTitle}>Sign in</h2>
        </div>

        <div className={styles.fields}>
          <label className={styles.field}>
            <span className="eyebrow">Username</span>
            <input
              className={styles.input}
              type="text"
              name="username"
              autoComplete="username"
              placeholder="Site account or email"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className="eyebrow">Password</span>
            <input
              className={styles.input}
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className="eyebrow">Language</span>
            <select
              className={styles.input}
              name="language"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              {LANGUAGES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={styles.submitArea}>
          <button
            type="submit"
            className={`${screen.button} ${screen.buttonPrimary} ${screen.buttonLg} ${screen.buttonFull}`}
          >
            Sign in
            <Icon name="arrow-right" size="md" />
          </button>
          <span className={styles.note}>
            Pilot build. Any credentials are accepted; no account is created.
          </span>
        </div>
      </form>
    </main>
  );
}
