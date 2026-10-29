// Publish only this turn's reviewed deltas over the exact production snapshot.
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
const execute = promisify(execFile);
const cli = "C:/Users/Eu/AppData/Roaming/npm/node_modules/vercel/dist/index.js";
const project = "prj_7STDUwhGQa5RcgTfx4elzWpabkbo";
const directory = join(tmpdir(), "altum-lf-recovery-20261016");
async function api(endpoint, body) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "api", endpoint, "--raw", ...(body ? ["--method", "POST", "--input", "-"] : [])], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => output += chunk);
    child.stderr.on("data", () => {});
    child.on("error", reject);
    child.on("close", (code) => { try { if (code) throw Error(`Vercel request failed: ${endpoint}`); resolve(JSON.parse(output)); } catch (error) { reject(error); } });
    child.stdin.end(body ? JSON.stringify(body) : undefined);
  });
}
const baseline = await api("/v13/deployments/altumia.com.br");
if (baseline.projectId !== project || baseline.readyState !== "READY" || baseline.id !== "dpl_36fR9LYcq6TjxHBQWGjXPH9EQ8F5") throw Error("Production changed; review against the new baseline first");
const tree = await api(`/v6/deployments/${baseline.id}/files`);
const files = new Map();
function collect(nodes, prefix = "") {
  for (const node of nodes) {
    const file = prefix ? `${prefix}/${node.name}` : node.name;
    if (file.startsWith("/") || file.includes("\\") || file.split("/").includes("..")) throw Error("Unsafe source path");
    if (node.type === "directory") collect(node.children || [], file);
    else if (node.type === "file" && /^[a-f0-9]{40}$/.test(node.uid)) files.set(file, { file, sha: node.uid });
    else throw Error("Invalid source node");
  }
}
collect(tree.find((node) => node.name === "src")?.children || []);
if (files.size < 100) throw Error("Missing production source snapshot");
const changed = ["lib/shopify-conversation-catalog.ts", "lib/server/commerce/conversation-catalog.ts", "lib/shopify-live-catalog.ts", "lib/server/ai/response-composer.ts", "lib/server/ai/agent.ts", "lib/server/ai/router.ts", "app/api/tenant/[tenantId]/ai-preview/route.ts"];
const reuseReview = process.argv.includes("--reuse-review");
if (reuseReview) {
  const previous = JSON.parse(await readFile(join(directory, "deployment-receipt.json"), "utf8"));
  if (previous.baseline !== baseline.id || JSON.stringify(previous.changed) !== JSON.stringify(changed)) throw Error("Cached review belongs to a different production snapshot");
}
for (const file of changed) {
  const entry = files.get(file);
  if (!entry) throw Error(`Missing source: ${file}`);
  const response = reuseReview ? null : await api(`/v8/deployments/${baseline.id}/files/${entry.sha}`);
  const original = reuseReview ? await readFile(join(directory, file.replaceAll("/", "__") + ".production-before"), "utf8")
    : Buffer.from(response.data, "base64").toString("utf8").replaceAll("\r\n", "\n");
  const sourcePath = join(directory, "source", file);
  await mkdir(dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, original);
  await writeFile(join(directory, file.replaceAll("/", "__") + ".production-before"), original);
  let patch = "";
  try { await execute("git", ["diff", "--no-index", "--no-ext-diff", "--", join(directory, file.replaceAll("/", "__") + ".local-before"), file], { encoding: "utf8", windowsHide: true }); }
  catch (error) { if (error.code !== 1 || !error.stdout) throw error; patch = error.stdout; }
  patch = patch.split("\n").map((line) => line.startsWith("diff --git ") ? `diff --git a/${file} b/${file}` : line.startsWith("--- ") ? `--- a/${file}` : line.startsWith("+++ ") ? `+++ b/${file}` : line).join("\n");
  if (!patch.trim()) throw Error(`Empty delta: ${file}`);
  const patchPath = join(directory, file.replaceAll("/", "__") + ".patch");
  await writeFile(patchPath, patch);
  await execute("git", ["apply", "--check", "--ignore-space-change", patchPath], { cwd: join(directory, "source"), windowsHide: true });
  await execute("git", ["apply", "--ignore-space-change", patchPath], { cwd: join(directory, "source"), windowsHide: true });
  const source = await readFile(sourcePath);
  files.set(file, { file, data: source.toString("base64"), encoding: "base64" });
  console.log(JSON.stringify({ reviewed: file }));
}
console.log(JSON.stringify({ baseline: baseline.id, changed, reviewDirectory: directory }));
if (process.argv.includes("--deploy")) {
  if ((await api("/v13/deployments/altumia.com.br")).id !== baseline.id) throw Error("Production changed during review");
  const deployed = await api("/v13/deployments", { name: "altum", project, target: "production", autoAssignCustomDomains: false, files: [...files.values()], meta: { actor: "codex", purpose: "lf-shopify-search-and-sales-recovery", baselineDeployment: baseline.id } });
  const receipt = { id: deployed.id, url: deployed.url, baseline: baseline.id, changed };
  await writeFile(join(directory, "deployment-receipt.json"), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
}
