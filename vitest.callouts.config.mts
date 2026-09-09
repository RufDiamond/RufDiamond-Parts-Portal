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
      "tests/catalog-source-review.test.tsx",
      "tests/mapping-coverage.test.ts",
      "tests/admin-workflow.test.tsx",
      "tests/customer-repository.test.ts",
      "tests/customer-drawing.test.tsx",
      "tests/customer-session.test.ts",
      "tests/customer-boundary-state.test.tsx",
      "tests/customer-additions.test.tsx",
      "tests/customer-money.test.tsx",
      "tests/customer-request.test.tsx",
      "tests/customer-privacy.test.ts",
      "tests/customer-packaging.test.ts",
      "tests/backend-api.test.ts",
      "tests/api-repository.test.ts",
      "tests/catalog-adapter.test.ts",
      "tests/callout-preview.test.ts",
      "tests/drawing-viewer-pan.test.tsx",
      "tests/drawing-viewer-wheel.test.ts",
      "tests/full-illustration-preview.test.tsx",
      "tests/hosted-marker-review.test.tsx",
      "tests/part-highlight-review.test.ts",
      "tests/diagram-selection.test.tsx",
      "tests/diagram-regions.test.tsx",
      "tests/diagram-viewport.test.ts",
      "tests/diagram-table-reveal.test.tsx",
      "tests/mapping-editor-state.test.ts",
      "tests/mapping-editor.test.tsx",
    ],
  },
});
