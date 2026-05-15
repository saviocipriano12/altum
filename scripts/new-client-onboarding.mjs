import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next.trim();
    i += 1;
  }
  return args;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceField(content, fieldLabel, value) {
  const regex = new RegExp(`^- ${escapeRegExp(fieldLabel)}:.*$`, "m");
  return content.replace(regex, `- ${fieldLabel}: ${value}`);
}

function replaceExactLine(content, fromLine, toLine) {
  const regex = new RegExp(`^${escapeRegExp(fromLine)}$`, "m");
  return content.replace(regex, toLine);
}

async function findAvailablePath(baseDir, baseName) {
  let candidate = path.join(baseDir, `${baseName}.md`);
  let counter = 2;
  while (true) {
    try {
      await access(candidate, constants.F_OK);
      candidate = path.join(baseDir, `${baseName}-${counter}.md`);
      counter += 1;
    } catch {
      return candidate;
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cliente = args.cliente || args.clienteNome || "";
  if (!cliente) {
    process.stderr.write(
      [
        "Uso:",
        "node scripts/new-client-onboarding.mjs --cliente \"Nome\" [--tenant \"TENANT_ID\"] [--ownerAltum \"Nome\"] [--ownerCliente \"Nome\"] [--fechamento \"YYYY-MM-DD\"] [--kickoff \"YYYY-MM-DD\"] [--prazo \"YYYY-MM-DD\"] [--escopo \"Plano\"]",
        "",
      ].join("\n")
    );
    process.exit(1);
  }

  const root = process.cwd();
  const templatePath = path.join(root, "docs", "CLIENTE_FECHADO_FICHA_OPERACIONAL_TEMPLATE.md");
  const outDir = path.join(root, "docs", "clientes");

  const fechamento = args.fechamento || todayIso();
  const kickoff = args.kickoff || "";
  const prazo = args.prazo || "";
  const tenant = args.tenant || "";
  const ownerAltum = args.ownerAltum || "";
  const ownerCliente = args.ownerCliente || "";
  const escopo = args.escopo || "";

  const template = await readFile(templatePath, "utf8");
  let content = template;

  content = replaceField(content, "Cliente", cliente);
  content = replaceField(content, "Tenant ID", tenant);
  content = replaceField(content, "Data fechamento comercial", fechamento);
  content = replaceField(content, "Data kickoff", kickoff);
  content = replaceField(content, "Plano/escopo vendido", escopo);
  content = replaceField(content, "Owner ALTUM atual", ownerAltum);
  content = replaceField(content, "Owner cliente", ownerCliente);
  content = replaceField(content, "Prazo alvo para go-live", prazo);
  content = replaceExactLine(content, "- Fase atual: `F0 | F1 | F2 | F3 | F4`", "- Fase atual: `F0`");
  content = replaceField(content, "Etapa atual (numero do checklist oficial)", "1");
  content = replaceExactLine(
    content,
    "- Status atual: `Nao iniciado | Em andamento | Bloqueado | Concluido`",
    "- Status atual: `Em andamento`"
  );
  content = replaceField(content, "Ultima atualizacao", todayIso());

  const header = [
    `# Onboarding - ${cliente}`,
    "",
    "- Gerado automaticamente por `npm run cliente:onboarding:new`.",
    `- Data geracao: ${todayIso()}.`,
    "- Checklist oficial: `docs/CLIENTE_FECHADO_CHECKLIST_OFICIAL.md`.",
    "",
  ].join("\n");

  const slug = slugify(cliente) || "cliente";
  const baseName = `${fechamento}-${slug}-onboarding`;

  await mkdir(outDir, { recursive: true });
  const outPath = await findAvailablePath(outDir, baseName);

  await writeFile(outPath, `${header}\n${content}`, "utf8");

  process.stdout.write(`Ficha criada: ${outPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`Erro ao criar ficha: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
