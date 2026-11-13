import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PUBLIC_FOLDERS = new Set(["brand", "home", "nav", "models", "systems", "toolbar"]);

/** Copy only public presentation artwork. Original catalogue files stay in the checkout. */
export async function copyPublicPresentation(source, destination) {
  await fs.mkdir(destination, { recursive: true });
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (entry.isDirectory() && PUBLIC_FOLDERS.has(entry.name)) {
      await fs.cp(path.join(source, entry.name), path.join(destination, entry.name), { recursive: true, dereference: false, filter: async file => !(await fs.lstat(file)).isSymbolicLink() });
    }
  }
}

export async function packageApiFrontend(root, destination, dist = ".next") {
  if (!path.isAbsolute(destination) || destination === root || destination === path.parse(destination).root) throw new Error("Use a new absolute artifact directory.");
  try { await fs.access(destination); throw new Error("Artifact destination already exists."); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const build = path.join(root, dist);
  await fs.cp(path.join(build, "standalone"), destination, { recursive: true, filter: file => !path.basename(file).startsWith(".env") && !file.includes("/public/drawings/") && !file.includes("/tools/callouts/review/") });
  await fs.cp(path.join(build, "static"), path.join(destination, dist, "static"), { recursive: true });
  await copyPublicPresentation(path.join(root, "public"), path.join(destination, "public"));
  const preview = path.join(destination, "private-fat-truck");
  const drawings = path.join("public", "drawings", "ft3w");
  const review = path.join("tools", "callouts", "review");
  for (const directory of [drawings, review, path.join("src", "data")]) {
    await fs.mkdir(path.join(preview, directory), { recursive: true });
  }
  // Keep the same relative paths used by the source hashes, outside public.
  await fs.cp(path.join(root, drawings), path.join(preview, drawings), {
    recursive: true,
    filter: async file => {
      const entry = await fs.lstat(file);
      return entry.isDirectory() || (entry.isFile() && /^ft3w-[\w-]+\.png$/.test(path.basename(file)));
    },
  });
  for (const name of await fs.readdir(path.join(root, review))) {
    if (/^(?:proposals|source-corrections|part-highlights(?:-[\w-]+)?)\.json$/.test(name)) {
      await fs.copyFile(path.join(root, review, name), path.join(preview, review, name));
    }
  }
  const catalogue = path.join("src", "data", "ft3-wagon.ts");
  await fs.copyFile(path.join(root, catalogue), path.join(preview, catalogue));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.RUF_REPOSITORY_MODE !== "api") throw new Error("Build and package with RUF_REPOSITORY_MODE=api.");
  await packageApiFrontend(process.cwd(), process.argv[2] ?? "", process.env.RUF_NEXT_DIST_DIR ?? ".next");
  console.log("API frontend artifact created; original catalogue assets remain in the checkout.");
}
