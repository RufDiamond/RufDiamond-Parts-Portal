import { defineConfig } from "@playwright/test";
delete process.env.NO_COLOR;
export default defineConfig({
  testDir: "tests/browser", testMatch: "customer.spec.ts", workers: 1, timeout: 90000,
  outputDir: process.env.CUSTOMER_OUTPUT_DIR ?? "output/customer-browser", use: { baseURL: process.env.CUSTOMER_BASE_URL ?? "http://127.0.0.1:3199", channel: "chrome", headless: process.env.CUSTOMER_HEADED !== "1", actionTimeout: 15000, navigationTimeout: 15000, screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: process.env.CUSTOMER_PACKAGED === "1" ? [] : [
    { command: "node tests/browser/customer-api-fixture.mjs", url: "http://127.0.0.1:3299/__ready", reuseExistingServer: false },
    { command: "npm run dev -- --hostname 127.0.0.1 --port 3199", url: "http://127.0.0.1:3199/signin", reuseExistingServer: false, env: { RUF_REPOSITORY_MODE: "api", RUF_DEPLOYMENT_ENV: "local", RUF_API_UPSTREAM_URL: "http://127.0.0.1:3299", RUF_WEB_ORIGIN: "http://127.0.0.1:3199", RUF_NEXT_DIST_DIR: "tmp/next-customer-3199" } },
  ],
});
