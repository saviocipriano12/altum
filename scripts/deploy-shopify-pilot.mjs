// Publish only the Shopify change on top of the currently deployed source tree.
// Unrelated local changes are deliberately not uploaded. Credentials use stdin.
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";

const project = "prj_7STDUwhGQa5RcgTfx4elzWpabkbo";
const cli = "C:/Users/Eu/AppData/Roaming/npm/node_modules/vercel/dist/index.js";
const changes = process.argv.includes("--sync-fix") ? [
  "lib/commerce-payload.ts",
  "lib/server/commerce/providers/shopify.ts",
] : [
  "app/cliente/painel/configuracoes/integracoes/page.tsx",
  "lib/shopify-connection.ts",
  "lib/server/commerce/oauth.ts",
  "lib/server/commerce/shopify-webhooks.ts",
  "app/api/integrations/commerce/shopify/start/route.ts",
  "app/api/integrations/commerce/shopify/callback/route.ts",
  "app/api/integrations/commerce/shopify/install/route.ts",
  "app/api/integrations/commerce/shopify/uninstall/route.ts",
];

async function api(endpoint, body, silent = false) {
  const args = [cli, "api", endpoint, "--raw"];
  if (body) args.push("--method", "POST", "--input", "-");
  if (silent) args.push("--silent");
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let output = "";
    let diagnostic = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    // Never forward provider responses or stderr that could include credentials.
    child.stderr.on("data", (chunk) => { diagnostic += chunk; });
    child.on("error", () => reject(new Error("Não foi possível iniciar o Vercel CLI.")));
    child.on("close", (code) => {
      if (code !== 0) {
        let reason = diagnostic;
        for (const item of Array.isArray(body) ? body : [body]) {
          if (typeof item?.value === "string") reason = reason.replaceAll(item.value, "[redacted]");
        }
        return reject(new Error(`Vercel API falhou (${code}) em ${endpoint.split("?")[0]}: ${reason.slice(0, 800)}`));
      }
      try { accept(output.trim() ? JSON.parse(output) : {}); } catch { reject(new Error("Resposta Vercel inválida.")); }
    });
    child.stdin.end(body ? JSON.stringify(body) : undefined);
  });
}

const baseline = await api("/v13/deployments/altumia.com.br");
if (baseline.readyState !== "READY" || baseline.projectId !== project) throw new Error("Produção inesperada; publicação interrompida.");
const tree = await api(`/v6/deployments/${baseline.id}/files`);
const source = tree.find((node) => node.name === "src" && node.type === "directory");
if (!source?.children) throw new Error("Snapshot de produção indisponível.");
const files = new Map();
function collect(nodes, prefix = "") {
  for (const node of nodes) {
    const file = prefix ? `${prefix}/${node.name}` : node.name;
    if (file.startsWith("/") || file.includes("\\") || file.split("/").includes("..")) throw new Error("Caminho de produção inválido.");
    if (node.type === "directory") collect(node.children || [], file);
    else if (node.type === "file" && /^[a-f0-9]{40}$/.test(node.uid)) files.set(file, { file, sha: node.uid });
    else throw new Error(`Tipo de arquivo não suportado: ${file}`);
  }
}
collect(source.children);
const execute = promisify(execFile);
for (const file of changes) {
  const deployed = files.get(file);
  if (deployed) {
    const { stdout: original } = await execute("git", ["show", `HEAD:${file}`], { encoding: "buffer", maxBuffer: 10 * 1024 * 1024, windowsHide: true });
    const lf = original.toString("utf8").replaceAll("\r\n", "\n");
    const hashes = [original, Buffer.from(lf), Buffer.from(lf.replaceAll("\n", "\r\n"))]
      .map((data) => createHash("sha1").update(data).digest("hex"));
    if (!hashes.includes(deployed.sha)) {
      const deployedFile = await api(`/v8/deployments/${baseline.id}/files/${deployed.sha}`);
      const deployedSource = Buffer.from(deployedFile.data, "base64").toString("utf8").replaceAll("\r\n", "\n");
      if (deployedSource !== lf) {
        const reviewDir = join(tmpdir(), "altum-shopify-pilot", "source-review");
        await mkdir(reviewDir, { recursive: true });
        await writeFile(join(reviewDir, file.replaceAll("/", "__")), deployedSource);
        throw new Error(`O arquivo em produção diverge da base revisada: ${file}. Snapshot salvo em ${reviewDir}; publicação interrompida.`);
      }
    }
  }
  const data = await readFile(resolve(file));
  files.set(file, { file, data: data.toString("base64"), encoding: "base64" });
}
console.log(JSON.stringify({ baseline: baseline.id, sourceFiles: files.size, changedFiles: changes }, null, 2));

const credentialsArg = process.argv.indexOf("--credentials");
if (credentialsArg !== -1) {
  const credentials = JSON.parse(await readFile(process.argv[credentialsArg + 1], "utf8"));
  if (credentials.clientId !== "2a77e3dd5a008aa2ed17c8397e15c069" || typeof credentials.clientSecret !== "string" || credentials.clientSecret.length < 20) {
    throw new Error("Credenciais não correspondem ao app piloto.");
  }
  const variables = [
    { key: "SHOPIFY_CLIENT_ID", value: credentials.clientId, type: "encrypted", target: ["production"] },
    { key: "SHOPIFY_CLIENT_SECRET", value: credentials.clientSecret, type: "encrypted", target: ["production"] },
    { key: "SHOPIFY_OAUTH_SCOPES", value: "read_products,read_orders,read_fulfillments,read_customers", type: "encrypted", target: ["production"] },
    { key: "SHOPIFY_ADMIN_API_VERSION", value: "2026-07", type: "encrypted", target: ["production"] },
  ];
  for (const variable of variables) await api(`/v10/projects/${project}/env`, variable, true);
  console.log("Configuração Shopify cadastrada no servidor de produção (valores ocultos).");
}

if (process.argv.includes("--deploy")) {
  const current = await api("/v13/deployments/altumia.com.br");
  if (current.id !== baseline.id) throw new Error("A produção mudou durante a preparação. Execute novamente.");
  const deployment = await api("/v13/deployments", {
    name: "altum", project, target: "production", autoAssignCustomDomains: false,
    files: [...files.values()],
    meta: { actor: "codex", purpose: "shopify-pilot", baselineDeployment: baseline.id },
  });
  const receiptDir = join(tmpdir(), "altum-shopify-pilot");
  await mkdir(receiptDir, { recursive: true });
  const receipt = { id: deployment.id, url: deployment.url, baseline: baseline.id, changedFiles: changes };
  await writeFile(join(receiptDir, "deployment-receipt.json"), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt, null, 2));
  console.log("Build iniciado sem trocar o domínio. Verifique READY e as rotas antes de promover.");
}
