// Stage only reviewed test-isolation deltas, never this shared dirty checkout.
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
const run = promisify(execFile);
const cli = "C:/Users/Eu/AppData/Roaming/npm/node_modules/vercel/dist/index.js";
const directory = "C:/Users/Eu/AppData/Local/Temp/altum-lf-response-pause-20261019";
const expected = "dpl_4BVJ4FomrEm3XPwp2R9hSmLcdq5s";
const project = "prj_7STDUwhGQa5RcgTfx4elzWpabkbo";
async function api(path, body) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "api", path, "--raw", ...(body ? ["--method", "POST", "--input", "-"] : [])], { windowsHide: true });
    let out = "";
    child.stdout.on("data", chunk => out += chunk);
    child.stderr.on("data", () => {});
    child.on("error", reject);
    child.on("close", code => { try { if(code) throw Error(`Vercel request failed: ${path}`); resolve(JSON.parse(out)); } catch(error) { reject(error); } });
    child.stdin.end(body ? JSON.stringify(body) : undefined);
  });
}
const baseline = await api("/v13/deployments/altumia.com.br");
if (baseline.id !== expected || baseline.projectId !== project || baseline.readyState !== "READY") throw Error("Production changed; review new baseline before staging");
const tree = await api(`/v6/deployments/${baseline.id}/files`);
const files = new Map();
function collect(nodes, prefix = "") {
  for (const node of nodes) {
    const file = prefix ? `${prefix}/${node.name}` : node.name;
    if (file.startsWith("/") || file.includes("\\") || file.split("/").includes("..")) throw Error("Unsafe source path");
    if (node.type === "directory") collect(node.children || [], file);
    else if (node.type === "file" && /^[a-f0-9]{40}$/.test(node.uid)) files.set(file, { file, sha: node.uid });
    else throw Error("Invalid source tree");
  }
}
collect(tree.find(node => node.name === "src")?.children || []);
if (files.size < 100) throw Error("Missing production source");
const changed = ["app/cliente/painel/ia/page.tsx"];
for (const file of changed) {
  const entry = files.get(file);
  if (!entry) throw Error(`Missing production file ${file}`);
  const response = await api(`/v8/deployments/${baseline.id}/files/${entry.sha}`);
  const original = Buffer.from(response.data, "base64").toString("utf8").replaceAll("\r\n", "\n");
  const source = join(directory, "source", file);
  await mkdir(dirname(source), { recursive: true });
  await writeFile(source, original);
  await writeFile(join(directory, file.replaceAll("/", "__") + ".production-before"), original);
  let patch = "";
  try { await run("git", ["diff", "--no-index", "--no-ext-diff", "--", join(directory, file.replaceAll("/", "__") + ".local-before"), file], { windowsHide: true }); }
  catch(error) { if(error.code !== 1 || !error.stdout) throw error; patch = error.stdout; }
  patch = patch.split("\n").map(line => line.startsWith("diff --git ") ? `diff --git a/${file} b/${file}` : line.startsWith("--- ") ? `--- a/${file}` : line.startsWith("+++ ") ? `+++ b/${file}` : line).join("\n");
  if (!patch.trim()) throw Error(`Empty patch ${file}`);
  const patchPath = join(directory, file.replaceAll("/", "__") + ".patch");
  await writeFile(patchPath, patch);
  await run("git", ["apply", "--check", "--ignore-space-change", patchPath], { cwd: join(directory, "source"), windowsHide: true });
  await run("git", ["apply", "--ignore-space-change", patchPath], { cwd: join(directory, "source"), windowsHide: true });
  files.set(file, { file, data: (await readFile(source)).toString("base64"), encoding: "base64" });
  console.log(JSON.stringify({ reviewed: file }));
}
if ((await api("/v13/deployments/altumia.com.br")).id !== baseline.id) throw Error("Production changed during review");
if (process.argv.includes("--deploy")) {
  const deployed = await api("/v13/deployments", { name: "altum", project, target: "production", autoAssignCustomDomains: false,
    files: [...files.values()], meta: { actor: "codex", purpose: "lf-response-pause-control", baselineDeployment: baseline.id } });
  const receipt = { id: deployed.id, url: deployed.url, baseline: baseline.id, changed };
  await writeFile(join(directory, "deployment-receipt.json"), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
}
