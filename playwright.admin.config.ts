import { defineConfig } from "@playwright/test";
delete process.env.NO_COLOR;
export default defineConfig({
  testDir: "tests/browser", testMatch: "admin.spec.mts", workers: 1, timeout: 180000,
  outputDir: process.env.ADMIN_OUTPUT_DIR ?? "output/admin-native",
  // Real credentials and presigned URLs must not be retained in network traces.
  use: { baseURL: "http://127.0.0.1:3207", trace: "off", screenshot: "off", video: "off", actionTimeout: 15000, navigationTimeout: 15000 },
});
