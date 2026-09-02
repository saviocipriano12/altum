import { readFileSync } from "node:fs";
import { GoogleAuth } from "google-auth-library";

function readLocalEnv(name) {
  const line = readFileSync(".env.local", "utf8").split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  if (!line) return "";
  let value = line.slice(name.length + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1).replace(/\\n/g, "\n");
  }
  return value;
}

const rawCredentials = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || readLocalEnv("FIREBASE_SERVICE_ACCOUNT_KEY");
if (!rawCredentials) throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY ausente.");
const credentials = JSON.parse(rawCredentials);
const projectId = String(credentials.project_id || "").trim();
if (!projectId) throw new Error("project_id ausente no service account.");

const auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
const client = await auth.getClient();

async function validate(fileName) {
  const source = readFileSync(fileName, "utf8");
  const created = await client.request({
    url: `https://firebaserules.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/rulesets`,
    method: "POST",
    data: { source: { files: [{ name: fileName, content: source }] } },
  });
  const rulesetName = String(created.data?.name || "");
  if (!rulesetName) throw new Error(`Firebase nao retornou o ruleset temporario para ${fileName}.`);

  try {
    console.log(`VALID ${fileName}`);
  } finally {
    await client.request({
      url: `https://firebaserules.googleapis.com/v1/${rulesetName}`,
      method: "DELETE",
    });
  }
}

await validate("firestore.rules");
await validate("storage.rules");
