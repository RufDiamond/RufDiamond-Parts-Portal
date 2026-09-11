import { test as base, expect, type Browser, type BrowserContext } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/** A private native Chrome profile with real tab visibility and focus events. */
export const test = base.extend({
  page: async ({ playwright }, runWithPage, testInfo) => {
    const executable = process.env.CUSTOMER_CHROME_EXECUTABLE ?? (process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : "google-chrome");
    const profile = await mkdtemp(path.join(tmpdir(), "ruf-customer-browser-"));
    const operationalOnly = process.env.CUSTOMER_CHROME_OPERATIONAL_HEADLESS === "true";
    const native = spawn(executable, [...(operationalOnly ? ["--headless=new"] : []), "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
    const exited = new Promise<void>(resolve => native.once("close", () => resolve()));
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    try {
      const endpoint = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Native Chrome did not expose its test connection.")), 10000);
        let output = "";
        native.once("error", error => { clearTimeout(timer); reject(error); });
        native.once("exit", () => { clearTimeout(timer); reject(new Error("Native Chrome exited before connecting.")); });
        native.stderr.on("data", (chunk: Buffer) => {
          output = (output + chunk.toString()).slice(-4000);
          const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
          if (match) { clearTimeout(timer); resolve(match[1]); }
        });
      });
      // Playwright otherwise forces every page visible/focused, even after
      // bringToFront(). noDefaults applies only to this native default context.
      browser = await playwright.chromium.connectOverCDP(endpoint, { noDefaults: true });
      context = browser.contexts()[0];
      context.setDefaultTimeout(15000);
      context.setDefaultNavigationTimeout(15000);
      const page = context.pages()[0] ?? await context.newPage();
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.bringToFront();
      testInfo.annotations.push({ type: "native-browser", description: `Chrome ${browser.version()}, noDefaults=true` });
      testInfo.annotations.push({ type: "browser-mode", description: operationalOnly ? "headless operational only; not native visibility evidence" : "headed native visibility" });
      await runWithPage(page);
    } finally {
      try {
        // Close the context first so the runner exports its browser/network
        // trace before the CDP connection is disconnected.
        await context?.close();
      }
      finally {
        try { await browser?.close(); }
        finally {
          if (native.pid && native.exitCode === null) { native.kill("SIGTERM"); await exited; }
          await rm(profile, { recursive: true, force: true });
        }
      }
    }
  },
});

export { expect };
