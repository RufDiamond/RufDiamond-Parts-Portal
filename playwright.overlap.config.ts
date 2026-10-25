import { defineConfig } from "@playwright/test";
delete process.env.NO_COLOR;
const baseURL = process.env.RUF_E2E_BASE_URL ?? "http://127.0.0.1:3199";
process.env.DIAGRAM_BASE_URL = baseURL;
const outputDir = process.env.RUF_E2E_OUTPUT ?? "output/overlap-e2e";
export default defineConfig({
  testDir: "tests/browser",
  testMatch: ["label-overlap.spec.ts", "diagram.spec.ts", "quote-commerce.spec.ts"],
  timeout: 90000,
  workers: 2,
  outputDir,
  reporter: [["list"], ["json", { outputFile: `${outputDir}/results.json` }]],
  use: { baseURL, channel: "chrome", headless: true,
    viewport: { width:1440, height:1000 }, actionTimeout: 10000,
    screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: process.env.RUF_E2E_BASE_URL ? [] : [
    { command: "env RUF_REPOSITORY_MODE=fixture RUF_DEPLOYMENT_ENV=local RUF_WEB_ORIGIN=http://127.0.0.1:3199 npm run start -- --hostname 127.0.0.1 --port 3199",
      url: "http://127.0.0.1:3199", reuseExistingServer:false, timeout:60000 },
    { command: "npx vite --config tests/browser/vite.config.ts --port 3101",
      url: "http://127.0.0.1:3101", reuseExistingServer:false, timeout:60000 },
  ],
});
