// Scoped LF canary: preserve the deployed tree and every unrelated local edit.
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
const cli = "C:/Users/Eu/AppData/Roaming/npm/node_modules/vercel/dist/index.js";
const project = "prj_7STDUwhGQa5RcgTfx4elzWpabkbo";
async function api(path, body) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "api", path, "--raw", ...(body ? ["--method", "POST", "--input", "-"] : [])], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (data) => output += data);
    child.stderr.on("data", () => {});
    child.on("error", reject);
    child.on("close", (code) => { try { if (code) throw new Error(`Vercel API failed: ${path}`); resolve(JSON.parse(output)); } catch (error) { reject(error); } });
    child.stdin.end(body ? JSON.stringify(body) : undefined);
  });
}
const baseline = await api("/v13/deployments/altumia.com.br");
if (baseline.projectId !== project || baseline.readyState !== "READY") throw new Error("Unexpected production");
if (baseline.id !== "dpl_E5rHgdp8ffnzr53HkcEjf6CFaxFj") throw new Error("Production no longer matches the tested LF canary");
const tree = await api(`/v6/deployments/${baseline.id}/files`);
const files = new Map();
function collect(nodes, prefix = "") {
  for (const node of nodes) {
    const file = prefix ? `${prefix}/${node.name}` : node.name;
    if (file.startsWith("/") || file.includes("\\") || file.split("/").includes("..")) throw new Error("Unsafe path");
    if (node.type === "directory") collect(node.children || [], file);
    else if (node.type === "file" && /^[a-f0-9]{40}$/.test(node.uid)) files.set(file, { file, sha: node.uid });
    else throw new Error("Invalid snapshot");
  }
}
collect(tree.find((item) => item.name === "src")?.children || []);
if (files.size < 100) throw new Error("Missing source snapshot");
const changed = ["lib/shopify-conversation-catalog.ts", "lib/server/commerce/conversation-catalog.ts"];
const dir = join(tmpdir(), "altum-lf-followup-20261016");
await mkdir(dir, { recursive: true });
for (const file of changed) {
  const entry = files.get(file);
  if (!entry) throw new Error(`Missing deployed file: ${file}`);
  const response = await api(`/v8/deployments/${baseline.id}/files/${entry.sha}`);
  const production = Buffer.from(response.data, "base64").toString("utf8").replaceAll("\r\n", "\n");
  await writeFile(join(dir, file.replaceAll("/", "__") + ".before"), production);
  const reviewed = await readFile(join(tmpdir(), "altum-lf-pilot-20261016", file.replaceAll("/", "__") + ".after"), "utf8");
  if (reviewed.replaceAll("\r\n", "\n") !== production) throw new Error(`Production differs from reviewed canary: ${file}`);
  const source = await readFile(file, "utf8");
  await writeFile(join(dir, file.replaceAll("/", "__") + ".before"), production);
  await writeFile(join(dir, file.replaceAll("/", "__") + ".after"), source);
  files.set(file, { file, data: Buffer.from(source).toString("base64"), encoding: "base64" });
}
console.log(JSON.stringify({ baseline: baseline.id, changed }, null, 2));
if (process.argv.includes("--deploy")) {
  if ((await api("/v13/deployments/altumia.com.br")).id !== baseline.id) throw new Error("Production changed");
  const deployed = await api("/v13/deployments", { name: "altum", project, target: "production", autoAssignCustomDomains: false,
    files: [...files.values()], meta: { actor: "codex", purpose: "lf-shopify-exact-chat-canary", baselineDeployment: baseline.id } });
  const receipt = { id: deployed.id, url: deployed.url, baseline: baseline.id, changed };
  await writeFile(join(dir, "deployment-receipt.json"), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt, null, 2));
}
