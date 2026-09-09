import { mkdtemp, mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { copyPublicPresentation } from "../tools/package-api-frontend.mjs";
it("packages branding without catalogue drawings or manifests and preserves originals", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ruf-package-test-"));
  for (const name of ["brand", "drawings", "manifests"]) {
    await mkdir(path.join(root, "public", name), { recursive: true });
    await writeFile(path.join(root, "public", name, "fixture.png"), name);
  }
  await copyPublicPresentation(path.join(root, "public"), path.join(root, "artifact"));
  expect(await readdir(path.join(root, "artifact"))).toEqual(["brand"]);
  expect(await readFile(path.join(root, "public/drawings/fixture.png"), "utf8")).toBe("drawings");
});
