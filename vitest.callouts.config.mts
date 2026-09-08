import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL(
          "./node_modules/next/dist/compiled/server-only/empty.js",
          import.meta.url,
        ),
      ),
    },
  },
  test: {
    include: [
      "tests/catalog-adapter.test.ts",
      "tests/callout-preview.test.ts",
      "tests/drawing-viewer-pan.test.tsx",
      "tests/drawing-viewer-wheel.test.ts",
      "tests/full-illustration-preview.test.tsx",
      "tests/hosted-marker-review.test.tsx",
      "tests/part-highlight-review.test.ts",
    ],
  },
});
