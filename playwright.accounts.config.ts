import { defineConfig } from "@playwright/test";
delete process.env.NO_COLOR;
export default defineConfig({testDir:"tests/browser",testMatch:"accounts.spec.mts",workers:1,timeout:90000,
  outputDir:"output/accounts-browser",reporter:[["list"],["json",{outputFile:"output/accounts-browser/results.json"}]],
  use:{channel:"chrome",headless:true,viewport:{width:1440,height:900},actionTimeout:10000,navigationTimeout:20000,trace:"off",screenshot:"only-on-failure"}});
