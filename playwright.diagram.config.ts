import { defineConfig } from "@playwright/test";

// Playwright forces color for its Vite server and worker subprocesses. Remove
// the conflicting inherited flag in this harness, leaving all warnings enabled.
delete process.env.NO_COLOR;

export default defineConfig({
  testDir: "tests/browser",
  testMatch: "diagram.spec.ts",
  timeout: 60000,
  workers: 1,
  outputDir: "output/diagram-browser",
  reporter:[["list"], ["json", { outputFile:"output/diagram-browser/results.json" }]],
  use: { channel:"chrome", headless:true, viewport:{ width:1440, height:1000 }, screenshot:"only-on-failure", trace:"retain-on-failure" },
  webServer: { command:"npx vite --config tests/browser/vite.config.ts --port 3101", url:"http://localhost:3101", reuseExistingServer:false },
});
