import { readFileSync } from "node:fs";
import { GoogleAuth } from "google-auth-library";

if (!process.argv.includes("--apply")) {
  throw new Error("Uso seguro: node scripts/deploy-firebase-rules.mjs --apply");
}

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
const projectPath = `projects/${projectId}`;

async function createRuleset(fileName) {
  const response = await client.request({
    url: `https://firebaserules.googleapis.com/v1/${projectPath}/rulesets`,
    method: "POST",
    data: { source: { files: [{ name: fileName, content: readFileSync(fileName, "utf8") }] } },
  });
  const name = String(response.data?.name || "");
  if (!name) throw new Error(`Ruleset vazio retornado para ${fileName}.`);
  return name;
}

async function releaseExists(releaseId) {
  try {
    await client.request({ url: `https://firebaserules.googleapis.com/v1/${projectPath}/releases/${releaseId}` });
    return true;
  } catch (error) {
    const status = Number((error && typeof error === "object" && "status" in error) ? error.status : 0);
    if (status === 404) return false;
    throw error;
  }
}

async function publish(releaseId, rulesetName) {
  const release = { name: `${projectPath}/releases/${releaseId}`, rulesetName };
  if (await releaseExists(releaseId)) {
    await client.request({
      url: `https://firebaserules.googleapis.com/v1/${release.name}`,
      method: "PATCH",
      data: { release, updateMask: "rulesetName" },
    });
  } else {
    await client.request({
      url: `https://firebaserules.googleapis.com/v1/${projectPath}/releases`,
      method: "POST",
      data: release,
    });
  }
}

const firestoreRuleset = await createRuleset("firestore.rules");
const storageRuleset = await createRuleset("storage.rules");

try {
  await publish("cloud.firestore", firestoreRuleset);
  await publish("firebase.storage", storageRuleset);
  console.log("PUBLISHED firestore.rules");
  console.log("PUBLISHED storage.rules");
} catch (error) {
  // Rulesets sem release permanecem inertes. A excecao deixa claro que a
  // promocao nao foi concluida em vez de reportar um go-live parcial como OK.
  throw error;
}
