import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Runtime validation reads exact source bytes. Explicitly include them in
  // the hosted review function; a dev server's filesystem is not a deployment.
  outputFileTracingIncludes: {
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
