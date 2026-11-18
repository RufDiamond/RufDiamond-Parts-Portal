import { defineConfig } from "@playwright/test";

delete process.env.NO_COLOR;
export default defineConfig({
  testDir: "tests/browser",
  testMatch: ["ft3-live-checkout.spec.ts", "cart-pricing-header.spec.ts"],
  workers: 1,
  retries: 0,
  timeout: 180000,
  outputDir: "output/hosted-checkout",
  use: {
    baseURL: process.env.RUF_E2E_BASE_URL,
    channel: "chrome", headless: true,
    viewport: { width: 1440, height: 1000 },
    actionTimeout: 20000, navigationTimeout: 70000,
    // Authentication must not appear in traces, screenshots, or video.
    trace: "off", screenshot: "off", video: "off",
  },
});
