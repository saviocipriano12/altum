import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { GoogleAuth } from "google-auth-library";

function readLocalEnv(name) {
  const line = readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .find((item) => item.startsWith(`${name}=`));
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

const auth = new GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});
const client = await auth.getClient();

async function getRelease(name) {
  try {
    const response = await client.request({
      url: `https://firebaserules.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/releases/${name}`,
    });
    return { found: true, data: response.data || {} };
  } catch (error) {
    const status = Number((error && typeof error === "object" && "status" in error) ? error.status : 0);
    if (status === 404) return { found: false, data: {} };
    throw error;
  }
}

const [firestore, storage] = await Promise.all([
  getRelease("cloud.firestore"),
  getRelease("firebase.storage"),
]);

async function releaseMatchesLocal(release, fileName) {
  if (!release.found || !release.data.rulesetName) return false;
  const response = await client.request({ url: `https://firebaserules.googleapis.com/v1/${release.data.rulesetName}` });
  const remoteSource = Array.isArray(response.data?.source?.files)
    ? response.data.source.files.map((file) => String(file.content || "")).join("\n")
    : "";
  const localSource = readFileSync(fileName, "utf8");
  return createHash("sha256").update(remoteSource.replace(/\r\n/g, "\n")).digest("hex") ===
    createHash("sha256").update(localSource.replace(/\r\n/g, "\n")).digest("hex");
}

const [firestoreMatchesLocal, storageMatchesLocal] = await Promise.all([
  releaseMatchesLocal(firestore, "firestore.rules"),
  releaseMatchesLocal(storage, "storage.rules"),
]);

console.log(JSON.stringify({
  projectConfigured: true,
  firestoreRulesetPublished: firestore.found && Boolean(firestore.data.rulesetName),
  firestoreMatchesLocal,
  storageRulesetPublished: storage.found && Boolean(storage.data.rulesetName),
  storageMatchesLocal,
}, null, 2));
