import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { LF_SCOPE, buildLfScopeMetadata } from "./ai-rebuild/lf-scope-metadata.mts";

if (process.argv.length !== 3 || process.argv[2] !== "--read-live-metadata") throw new Error("Exige --read-live-metadata; nenhum acesso implicito.");
const { loadEnvConfig } = await import("@next/env");
loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Inspecao real nao usa nem altera emulador.");
const { FieldPath } = await import("firebase-admin/firestore");
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
try {
  // Projection is server-side. Do not fetch tokens, full ai config, documents,
  // customer messages, leads, orders, sales or profile-training examples.
  const [settings, connections, channels, documents, pipelines, directPipeline] = await Promise.all([
    adminDb.collection("tenant_settings").where(FieldPath.documentId(), "==", LF_SCOPE.tenantId).select("tenantId", "name", "businessProfileId",
      "ai.enabled", "ai.responsePaused", "ai.businessSummary", "ai.guardrails", "ai.operatingProfile.autonomyMode",
      "ai.operatingProfile.monthlyBudgetUsd", "ai.rollout.exclusiveTest").limit(1).get(),
    adminDb.collection("ecommerce_connections").where("tenantId", "==", LF_SCOPE.tenantId)
      .select("tenantId", "provider", "status", "storeId", "liveCatalogPilot.enabled", "liveCatalogPilot.expiresAt").limit(21).get(),
    adminDb.collection("tenant_channels").where("tenantId", "==", LF_SCOPE.tenantId).select("tenantId", "type", "status").limit(101).get(),
    adminDb.collection("kb_docs").where("tenantId", "==", LF_SCOPE.tenantId).select("tenantId", "type").limit(201).get(),
    adminDb.collection("pipeline").where("tenantId", "==", LF_SCOPE.tenantId).select("tenantId", "stages").limit(21).get(),
    // Match the real consumer's legacy direct-doc fallback without broad reads.
    adminDb.collection("pipeline").where(FieldPath.documentId(), "==", LF_SCOPE.tenantId).select("tenantId", "stages").limit(1).get(),
  ]);
  if (settings.size !== 1) throw new Error("Configuracao LF nao encontrada; nao ampliar busca.");
  const rows = (snapshot: typeof channels) => snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
  const report = buildLfScopeMetadata({ settings: rows(settings)[0], connections: rows(connections),
    channels: rows(channels), documents: rows(documents),
    pipelines: [...rows(directPipeline), ...rows(pipelines).filter(row => row.id !== LF_SCOPE.tenantId)] });
  const directory = fileURLToPath(new URL("../.qa-artifacts/ai-rebuild/", import.meta.url));
  await mkdir(directory, { recursive: true });
  const path = join(directory, `lf-scope-metadata-${Date.now()}.json`);
  await writeFile(path, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ report: path, ...report }, null, 2));
} catch {
  throw new Error("Inspecao LF nao concluida; sem fallback, alteracao ou exposicao de credencial.");
} finally { await adminDb.terminate(); }
