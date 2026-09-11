import type { NextConfig } from "next";
import path from "node:path";

const contractAliases = Object.fromEntries(["", "/diagram-geometry", "/diagram-mapping", "/drawing-upload"].map(suffix => [`@rufdiamond/contracts${suffix}`, `./tmp/frontend-contracts/${suffix ? suffix.slice(1) : "index"}.js`]));

const nextConfig: NextConfig = {
  distDir: process.env.RUF_NEXT_DIST_DIR ?? ".next",
  turbopack: { resolveAlias: contractAliases },
  webpack(config) {
    config.resolve.alias = { ...config.resolve.alias, ...Object.fromEntries(Object.entries(contractAliases).map(([name, target]) => [name, path.resolve(target)])) };
    return config;
  },
  ...(process.env.RUF_REPOSITORY_MODE === "api" ? { output: "standalone" as const } : {}),
  // Runtime validation reads exact source bytes. Explicitly include them in
  // the hosted review function; a dev server's filesystem is not a deployment.
  outputFileTracingIncludes: process.env.RUF_REPOSITORY_MODE === "api" ? {} : {
    "/review/figures/*": [
      "./tools/callouts/review/proposals.json",
      "./tools/callouts/review/part-highlights*.json",
      "./tools/callouts/review/source-corrections.json",
      "./src/data/ft3-wagon.ts",
      "./public/drawings/ft3w/*.png",
      "./public/drawings/ft3w/review-source-20260908/*.png",
    ],
  },
};

export default nextConfig;
