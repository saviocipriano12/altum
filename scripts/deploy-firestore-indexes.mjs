import nextEnv from "@next/env";
import { GoogleAuth } from "google-auth-library";
import { readFile } from "node:fs/promises";

nextEnv.loadEnvConfig(process.cwd());
const rawCredential = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawCredential) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY nao encontrada em .env.local.");
}

const serviceAccount = JSON.parse(rawCredential);
const projectId = String(serviceAccount.project_id || "").trim();
if (!/^[a-z0-9-]+$/.test(projectId)) {
  throw new Error("project_id Firebase invalido.");
}

const indexesConfig = JSON.parse(await readFile(new URL("../firestore.indexes.json", import.meta.url), "utf8"));
const configuredIndexes = Array.isArray(indexesConfig.indexes) ? indexesConfig.indexes : [];
if (configuredIndexes.length === 0) {
  throw new Error("Nenhum indice composto foi declarado em firestore.indexes.json.");
}

const auth = new GoogleAuth({
  credentials: serviceAccount,
  scopes: ["https://www.googleapis.com/auth/datastore"],
});
const client = await auth.getClient();

async function request(url, init = {}) {
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("Nao foi possivel obter token OAuth do Firestore.");
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token.token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Firestore API ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

function matchesExpectedIndex(index, expectedFields) {
  const fields = Array.isArray(index.fields) ? index.fields : [];
  // A API do Firestore inclui o campo interno __name__ no final de alguns
  // indices. Ele nao faz parte do arquivo firestore.indexes.json.
  return fields.length >= expectedFields.length && expectedFields.every(
    (expected, position) =>
      fields[position]?.fieldPath === expected.fieldPath && fields[position]?.order === expected.order
  );
}

function getEndpoint(collectionGroup) {
  const parent = `projects/${projectId}/databases/(default)/collectionGroups/${collectionGroup}`;
  return `https://firestore.googleapis.com/v1/${parent}/indexes`;
}

async function findIndex(endpoint, expectedFields) {
  const payload = await request(endpoint);
  return (payload.indexes || []).find((index) => matchesExpectedIndex(index, expectedFields)) || null;
}

async function ensureIndex(config, waitForReady = true) {
  const collectionGroup = String(config.collectionGroup || "").trim();
  const expectedFields = Array.isArray(config.fields) ? config.fields : [];
  if (!collectionGroup || expectedFields.length === 0) {
    throw new Error("Indice do Firestore invalido no arquivo de configuracao.");
  }

  const endpoint = getEndpoint(collectionGroup);
  let index = await findIndex(endpoint, expectedFields);
  if (!index) {
    try {
      await request(endpoint, {
        method: "POST",
        body: JSON.stringify({ queryScope: "COLLECTION", fields: expectedFields }),
      });
      console.log(`INDEX_CREATED collection=${collectionGroup} state=BUILDING`);
    } catch (error) {
      // A API pode demorar alguns segundos para listar um indice que acabou
      // de receber. Nesse intervalo ela responde ALREADY_EXISTS ao POST.
      if (!String(error).includes("Firestore API 409")) throw error;
      console.log(`INDEX_EXISTS collection=${collectionGroup} state=BUILDING`);
    }
  } else {
    console.log(`INDEX_FOUND collection=${collectionGroup} state=${index.state || "UNKNOWN"}`);
  }

  if (!waitForReady) return;

  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    index = await findIndex(endpoint, expectedFields);
    if (index?.state === "READY") {
      console.log(`INDEX_READY collection=${collectionGroup}`);
      return;
    }
    if (index?.state === "NEEDS_REPAIR") {
      throw new Error(`O indice ${collectionGroup} entrou em NEEDS_REPAIR.`);
    }
    console.log(`INDEX_WAIT collection=${collectionGroup} state=${index?.state || "BUILDING"}`);
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }

  throw new Error(`Tempo limite aguardando o indice ${collectionGroup}.`);
}

// Primeiro solicita todos os indices. Assim um indice lento nao impede que os
// demais recursos do release comecem a construir em paralelo.
for (const index of configuredIndexes) {
  await ensureIndex(index, false);
}

for (const index of configuredIndexes) {
  await ensureIndex(index, true);
}
