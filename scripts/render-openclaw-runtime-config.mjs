import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function valueFor(argument) {
  const prefix = `${argument}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) || "";
}

function parseEnv(source) {
  const values = new Map();
  for (const originalLine of source.split(/\r?\n/)) {
    const line = originalLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values.set(name, value);
  }
  return values;
}

const templatePath = resolve(valueFor("--template") || "resources/openclaw/runtime/openclaw.json.example");
const envPath = resolve(valueFor("--env") || ".env.openclaw-runtime");
const outputPath = resolve(valueFor("--output") || ".altum-openclaw/openclaw.json");
const withoutModel = process.argv.includes("--without-model");
const values = parseEnv(readFileSync(envPath, "utf8"));
const template = readFileSync(templatePath, "utf8");

const rendered = template.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_match, variable) => {
  const value = values.get(variable) || process.env[variable];
  if (withoutModel && variable.startsWith("ALTUM_OPENCLAW_MODEL_")) {
    return `__ALTUM_UNCONFIGURED_${variable}__`;
  }
  if (!value) throw new Error(`Variável obrigatória ausente para o runtime OpenClaw: ${variable}`);
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
});

// Validate before replacing the active configuration. This command never logs
// the rendered config or a credential value.
const config = JSON.parse(rendered);
if (withoutModel) {
  delete config.models;
  if (config.agents?.defaults) delete config.agents.defaults.model;
}
const output = JSON.stringify(config, null, 2);
mkdirSync(dirname(outputPath), { recursive: true, mode: 0o700 });
const temporaryPath = `${outputPath}.next`;
writeFileSync(temporaryPath, output, { encoding: "utf8", mode: 0o600 });
chmodSync(temporaryPath, 0o600);
renameSync(temporaryPath, outputPath);
chmodSync(outputPath, 0o600);
console.log(`Configuração privada do runtime preparada em ${outputPath}.`);
