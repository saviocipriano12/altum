import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readdir, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

const root = await realpath(process.cwd());
const artifactRoot = path.join(root, ".qa-artifacts");
await mkdir(artifactRoot, { recursive: true });
const snapshot = path.join(artifactRoot, `inbox-snapshot-${Date.now()}`);
await mkdir(snapshot);
const directories = new Set(["app", "lib", "components", "context", "public", "config", "data", "types", "resources", "scripts", "tests"]);
const manifest = [];

async function copy(relative) {
  const source = path.join(root, relative);
  const info = await lstat(source);
  if (info.isSymbolicLink()) throw new Error(`Snapshot refuses source symlink: ${relative}`);
  if (info.isDirectory()) {
    await mkdir(path.join(snapshot, relative), { recursive: true });
    for (const item of await readdir(source)) {
      if (item.startsWith(".env") || ["node_modules", ".next", ".qa-artifacts", ".git"].includes(item)) continue;
      await copy(path.join(relative, item));
    }
    return;
  }
  if (!info.isFile()) return;
  const bytes = await readFile(source);
  await copyFile(source, path.join(snapshot, relative));
  const copied = await readFile(path.join(snapshot, relative));
  const hash = (data) => createHash("sha256").update(data).digest("hex");
  if (hash(bytes) !== hash(copied)) throw new Error(`Concurrent source mutation during snapshot: ${relative}`);
  manifest.push({ path: relative.replaceAll("\\", "/"), sha256: hash(bytes) });
}

for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.isDirectory() && directories.has(entry.name)) await copy(entry.name);
  else if (entry.isFile() && !entry.name.startsWith(".env") && !entry.name.endsWith(".tsbuildinfo")
    && /\.(ts|tsx|mjs|cjs|json|css)$/.test(entry.name)) await copy(entry.name);
}
// Validate the complete copy still matches the source before calling it a baseline.
for (const item of manifest) {
  const current = await readFile(path.join(root, item.path));
  if (createHash("sha256").update(current).digest("hex") !== item.sha256) throw new Error(`Source changed during snapshot: ${item.path}`);
}
await symlink(path.join(root, "node_modules"), path.join(snapshot, "node_modules"), "junction");
await writeFile(path.join(snapshot, "qa-source-manifest.json"), JSON.stringify({ root, files: manifest }, null, 2));
console.log(JSON.stringify({ isolatedSnapshot: snapshot, copiedFiles: manifest.length, sourceHashesVerified: true,
  envFilesCopied: false, dependenciesSharedReadOnlyByConvention: true }));
