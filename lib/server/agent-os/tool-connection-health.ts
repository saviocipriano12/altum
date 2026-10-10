import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { decryptSecret } from "@/app/lib/server/secret-crypto";
import { RouteAuthError } from "@/app/lib/server/route-auth";
import { probeFreeLlmApi } from "@/lib/server/agent-os/freellmapi";
import { probeOpenJev } from "@/lib/server/agent-os/openjev";
import { probeCreativeExecutor, probeReplicate } from "@/lib/server/agent-os/creative-executor";
import { listOpenAiCompatibleModels, probeOpenAiCompatibleChat } from "@/lib/server/agent-os/openai-compatible";
import { selectCompatibleModels } from "@/lib/server/agent-os/compatible-model-routing";
import { canonicalOpenAiCompatibleBaseUrl, OPENAI_COMPATIBLE_PROVIDER_IDS } from "@/lib/server/agent-os/provider-endpoints";

type ConnectionData = Record<string, unknown>;

export type ToolConnectionHealthResult = {
  connectionId: string;
  providerId: string;
  healthy: boolean;
  details: Record<string, unknown>;
};

function safeDetails(value: Record<string, unknown>) {
  // Provider probes return only diagnostic/model metadata. Keep this explicit so
  // a future adapter cannot accidentally persist a credential-shaped field.
  const blocked = new Set(["credential", "token", "apiKey", "api_key", "authorization", "secret"]);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !blocked.has(key)));
}

async function probeConnection(connection: ConnectionData): Promise<Record<string, unknown>> {
  const providerId = String(connection.providerId || "");
  const apiKey = decryptSecret(connection.credential);
  if (providerId === "openjev") return probeOpenJev(connection.baseUrl, apiKey);
  if (providerId === "freellmapi") return probeFreeLlmApi(connection.baseUrl, apiKey);
  if (providerId === "replicate") return probeReplicate(connection);
  if (OPENAI_COMPATIBLE_PROVIDER_IDS.has(providerId)) {
    const baseUrl = canonicalOpenAiCompatibleBaseUrl(providerId, connection.baseUrl);
    const catalog = await listOpenAiCompatibleModels({ baseUrl, apiKey });
    const configuredModel = typeof connection.chatModel === "string" ? connection.chatModel.trim() : "";
    const model = configuredModel || selectCompatibleModels({ preferredModel: null, modelCatalog: catalog, prompt: "Teste de disponibilidade da conexão." })[0] || "";
    if (!model) throw new RouteAuthError(409, "compatible_model_missing", "A conexão não informou nenhum modelo disponível. Salve um modelo ou revise o endereço da API.");
    return probeOpenAiCompatibleChat({ baseUrl, apiKey, model });
  }
  if (["comfyui", "ltx", "openmontage"].includes(providerId)) return probeCreativeExecutor(connection);
  throw new RouteAuthError(409, "unsupported_health_check", "Este provider não oferece um teste sem custo. A Altum o validará na primeira geração autorizada e registrará o resultado.");
}

/**
 * Tests one saved provider without starting a media generation. Both the admin
 * route and MCP call this single implementation so the UI and ChatGPT cannot
 * disagree about whether a route is healthy.
 */
export async function checkToolConnectionHealth(input: { connectionId: string; actorId: string; actorName?: string | null; platformOnly?: boolean }): Promise<ToolConnectionHealthResult> {
  if (!/^[A-Za-z0-9_-]{1,180}$/.test(input.connectionId)) throw new RouteAuthError(400, "invalid_connection", "Conexão inválida.");
  const ref = adminDb.collection("tool_connections").doc(input.connectionId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new RouteAuthError(404, "connection_missing", "Conexão não encontrada.");
  const connection = snapshot.data() || {};
  if (input.platformOnly && connection.scope !== "platform") throw new RouteAuthError(404, "connection_missing", "Conexão não encontrada.");
  const providerId = String(connection.providerId || "");

  try {
    const details = safeDetails(await probeConnection(connection));
    const availableModels = Array.isArray(details.availableModels) ? details.availableModels.map(String).slice(0, 200) : null;
    await ref.set({
      status: "healthy",
      health: { status: "healthy", checkedAt: FieldValue.serverTimestamp(), details },
      ...(availableModels ? { modelCatalog: availableModels } : {}),
      lastHealthAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: input.actorId,
    }, { merge: true });
    await adminDb.collection("audit_logs").add({ type: "agent_tool_connection_health_checked", actorId: input.actorId, actorName: input.actorName || null, connectionId: input.connectionId, providerId, healthy: true, source: "shared_health_service", createdAt: FieldValue.serverTimestamp() });
    return { connectionId: input.connectionId, providerId, healthy: true, details };
  } catch (error) {
    // A provider without a safe, read-only probe is not broken. Media
    // providers such as fal, Higgsfield and LTX are intentionally validated
    // by their first approved generation; marking them degraded here would
    // remove a configured route before it ever had a chance to run.
    if (error instanceof RouteAuthError && error.code === "unsupported_health_check") throw error;
    const reason = error instanceof Error ? error.message.slice(0, 500) : "connection_probe_failed";
    await ref.set({
      status: "degraded",
      health: { status: "degraded", lastFailedAt: FieldValue.serverTimestamp(), lastFailureReason: reason, cooldownUntil: new Date(Date.now() + 2 * 60_000), consecutiveFailures: FieldValue.increment(1) },
      lastHealthAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: input.actorId,
    }, { merge: true }).catch(() => undefined);
    await adminDb.collection("audit_logs").add({ type: "agent_tool_connection_health_checked", actorId: input.actorId, actorName: input.actorName || null, connectionId: input.connectionId, providerId, healthy: false, source: "shared_health_service", createdAt: FieldValue.serverTimestamp() }).catch(() => undefined);
    throw error;
  }
}
