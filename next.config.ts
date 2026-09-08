import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Runtime validation reads exact source bytes. Explicitly include them in
  // the hosted review function; a dev server's filesystem is not a deployment.
  outputFileTracingIncludes: {
    "/review/figures/*": [
      "./tools/callouts/review/proposals.json",
      "./src/data/ft3-wagon.ts",
      "./public/drawings/ft3w/*.png",
    ],
  },
};

export default nextConfig;
