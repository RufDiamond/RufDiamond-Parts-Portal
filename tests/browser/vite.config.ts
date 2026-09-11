import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root:fileURLToPath(new URL("./fixture", import.meta.url)),
  resolve:{ alias:{ "@":fileURLToPath(new URL("../../src", import.meta.url)) } },
  esbuild:{ jsx:"automatic" },
  server:{ host:"127.0.0.1", strictPort:true },
});
