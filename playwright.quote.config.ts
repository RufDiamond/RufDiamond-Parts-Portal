import { defineConfig } from "@playwright/test";

delete process.env.NO_COLOR;

export default defineConfig({
  testDir: "tests/browser",
  testMatch: "quote-commerce.spec.ts",
  workers: 1,
  timeout: 90000,
  outputDir: process.env.QUOTE_OUTPUT_DIR ?? "output/quote-browser",
  use: {
    channel: "chrome",
    headless: true,
    baseURL: process.env.QUOTE_BASE_URL ?? "http://127.0.0.1:3198",
    actionTimeout: 15000,
    navigationTimeout: 30000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: process.env.QUOTE_PACKAGED === "1" ? [] : [
    {
      command: "env RUF_REPOSITORY_MODE=fixture RUF_DEPLOYMENT_ENV=local RUF_WEB_ORIGIN=http://127.0.0.1:3198 RUF_NEXT_DIST_DIR=tmp/next-quote-3198 npm run dev -- --hostname 127.0.0.1 --port 3198",
      url: "http://127.0.0.1:3198/",
      reuseExistingServer: true,
      timeout: 120000,
    },
  ],
});

