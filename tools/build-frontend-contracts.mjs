import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

// Contracts use NodeNext .js specifiers. Emit their actual JS for Next/Turbopack,
// preserving the shared source contracts and the API's NodeNext build conventions.
const source = path.resolve("packages/contracts/src");
const destination = path.resolve("tmp/frontend-contracts");
await fs.mkdir(destination, { recursive: true });
for (const name of await fs.readdir(source)) {
  if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
  const text = await fs.readFile(path.join(source, name), "utf8");
  const result = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext }, fileName: name });
  await fs.writeFile(path.join(destination, name.replace(/\.ts$/, ".js")), result.outputText);
}
