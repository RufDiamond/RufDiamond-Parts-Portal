import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Integration files each own a PostgreSQL container. Serial files avoid
    // resource-starvation timeouts while concurrency tests still run in-file.
    fileParallelism: false,
  },
});
