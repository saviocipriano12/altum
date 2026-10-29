// Build a scoped production release from production source references, not the dirty checkout.
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
const cli = "C:/Users/Eu/AppData/Roaming/npm/node_modules/vercel/dist/index.js";
const project = "prj_7STDUwhGQa5RcgTfx4elzWpabkbo";
const execute = promisify(execFile);
async function api(endpoint, body) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, [cli, "api", endpoint, "--raw", ...(body ? ["--method", "POST", "--input", "-"] : [])], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let output = ""; child.stdout.on("data", (chunk) => output += chunk);
    child.stderr.on("data", () => {});
    child.on("error", reject); child.on("close", (code) => {
      if (code) return reject(new Error(`Vercel API failed: ${endpoint.split("?")[0]}`));
      try { accept(JSON.parse(output)); } catch { reject(new Error("Invalid Vercel response")); }
    }); child.stdin.end(body ? JSON.stringify(body) : undefined);
  });
}
const root = join(tmpdir(), "altum-shopify-live-release");
const before = join(tmpdir(), "altum-shopify-live-before");
const incremental = new Map([
  ["lib/server/ai/agent.ts", "agent.ts"],
  ["app/api/tenant/[tenantId]/ai-preview/route.ts", "preview.ts"],
  ["app/cliente/painel/ia/page.tsx", "ia-page.tsx"],
]);
const complete = ["lib/shopify-live-catalog.ts", "lib/shopify-conversation-catalog.ts", "lib/server/commerce/conversation-catalog.ts",
  "lib/server/commerce/types.ts", "lib/server/commerce/providers/shopify.ts", "lib/ecommerce-journey.ts", "lib/server/ecommerce.ts",
  "app/api/tenant/[tenantId]/ecommerce/connections/[connectionId]/catalog/route.ts"];
const baseline = await api("/v13/deployments/altumia.com.br");
if (baseline.projectId !== project || baseline.readyState !== "READY") throw new Error("Unexpected production");
const tree = await api(`/v6/deployments/${baseline.id}/files`);
const files = new Map();
function collect(nodes, prefix = "") {
  for (const node of nodes) {
    const file = prefix ? `${prefix}/${node.name}` : node.name;
    if (file.includes("\\") || file.split("/").includes("..") || file.startsWith("/")) throw new Error("Unsafe source path");
    if (node.type === "directory") collect(node.children || [], file);
    else if (node.type === "file" && /^[a-f0-9]{40}$/.test(node.uid)) files.set(file, { file, sha: node.uid });
    else throw new Error("Unexpected source node");
  }
}
collect(tree.find((node) => node.name === "src")?.children || []);
if (files.size < 100) throw new Error("Missing production snapshot");
for (const file of [...incremental.keys(), ...complete]) {
  const entry = files.get(file);
  const path = join(root, "source", file);
  await mkdir(dirname(path), { recursive: true });
  if (entry) {
    const cached = process.argv.includes("--reuse-review") ? JSON.parse(await readFile(join(root, "review.json"), "utf8")) : null;
    if (cached && cached.baseline !== baseline.id) throw new Error("Review baseline changed");
    const response = cached ? null : await api(`/v8/deployments/${baseline.id}/files/${entry.sha}`);
    const original = cached ? await readFile(join(root, "production", file), "utf8")
      : Buffer.from(response.data, "base64").toString("utf8").replaceAll("\r\n", "\n");
    await writeFile(path, original);
    await mkdir(dirname(join(root, "production", file)), { recursive: true });
    await writeFile(join(root, "production", file), original);
  } else if (incremental.has(file)) throw new Error(`Missing production file: ${file}`);
  if (incremental.has(file)) {
    // Derive only this turn's changes; unrelated local edits are not included.
    const old = join(before, incremental.get(file));
    let patch;
    try { await execute("git", ["diff", "--no-index", "--no-ext-diff", "--", old, file], { encoding: "utf8", windowsHide: true }); patch = ""; }
    catch (error) { if (error.code !== 1 || !error.stdout) throw error; patch = error.stdout; }
    const lines = patch.split("\n");
    patch = lines.map((line) => line.startsWith("diff --git ") ? `diff --git a/${file} b/${file}`
      : line.startsWith("--- ") ? `--- a/${file}` : line.startsWith("+++ ") ? `+++ b/${file}` : line).join("\n");
    const patchPath = join(root, `patch-${incremental.get(file)}.diff`);
    await writeFile(patchPath, patch);
    await execute("git", ["apply", "--check", "--ignore-space-change", patchPath], { cwd: join(root, "source"), windowsHide: true });
    await execute("git", ["apply", "--ignore-space-change", patchPath], { cwd: join(root, "source"), windowsHide: true });
  } else {
    await writeFile(path, await readFile(file));
  }
  files.set(file, { file, data: (await readFile(path)).toString("base64"), encoding: "base64" });
}
await writeFile(join(root, "review.json"), JSON.stringify({ baseline: baseline.id, files: [...incremental.keys(), ...complete] }, null, 2));
console.log(JSON.stringify({ baseline: baseline.id, reviewDirectory: root, changedFiles: [...incremental.keys(), ...complete] }, null, 2));
if (process.argv.includes("--deploy")) {
  const current = await api("/v13/deployments/altumia.com.br");
  if (current.id !== baseline.id) throw new Error("Production changed during preparation");
  const vars = await api(`/v10/projects/${project}/env`);
  if (!vars.envs?.some((variable) => variable.key === "SHOPIFY_LIVE_CATALOG_STORES" && variable.target?.includes("production"))) {
    await api(`/v10/projects/${project}/env`, { key: "SHOPIFY_LIVE_CATALOG_STORES", value: "lf-multimarcas-vitoria-nm0fp51f.myshopify.com", type: "plain", target: ["production"] });
  }
  const deployment = await api("/v13/deployments", { name: "altum", project, target: "production", autoAssignCustomDomains: false,
    files: [...files.values()], meta: { actor: "codex", purpose: "shopify-live-catalog-pilot", baselineDeployment: baseline.id } });
  const receipt = { id: deployment.id, url: deployment.url, baseline: baseline.id };
  await writeFile(join(root, "deployment-receipt.json"), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt, null, 2));
}
