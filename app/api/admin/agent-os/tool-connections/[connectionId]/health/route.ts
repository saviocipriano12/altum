import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { probeFreeLlmApi } from "@/lib/server/agent-os/freellmapi";
import { decryptSecret } from "@/app/lib/server/secret-crypto";
import { probeOpenJev } from "@/lib/server/agent-os/openjev";
import { probeCreativeExecutor, probeReplicate } from "@/lib/server/agent-os/creative-executor";
import { listOpenAiCompatibleModels, probeOpenAiCompatibleChat } from "@/lib/server/agent-os/openai-compatible";
import { selectCompatibleModels } from "@/lib/server/agent-os/compatible-model-routing";
import { canonicalOpenAiCompatibleBaseUrl, OPENAI_COMPATIBLE_PROVIDER_IDS } from "@/lib/server/agent-os/provider-endpoints";

function fail(error: unknown) { if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message }, { status: error.status }); const code = error instanceof Error ? error.message : ""; if (code.startsWith("freellmapi_") || code.startsWith("openjev_") || code.startsWith("creative_executor_") || code) { console.warn("Teste de conexão não passou:", code.slice(0, 240)); return NextResponse.json({ error: "A conexão não respondeu como esperado. Confira a chave, o endereço e o modelo escolhido." }, { status: 422 }); } console.error("Falha no health check da conexão:", error); return NextResponse.json({ error: "Não foi possível testar a conexão." }, { status: 500 }); }

export async function POST(request: Request, context: { params: Promise<{ connectionId: string }> }) {
  let checkedConnectionId = "";
  let checkedProviderId = "";
  try {
    const actor = await requireRequestUser(request, { roles: ["agency_admin"] });
    const { connectionId } = await context.params;
    if (!/^[A-Za-z0-9_-]{1,180}$/.test(connectionId)) throw new RouteAuthError(400, "invalid_connection", "Conexão inválida.");
    const ref = adminDb.collection("tool_connections").doc(connectionId); const snapshot = await ref.get();
    if (!snapshot.exists) throw new RouteAuthError(404, "connection_missing", "Conexão não encontrada.");
    const connection = snapshot.data() || {};
    const providerId = String(connection.providerId || "");
    checkedConnectionId = connectionId;
    checkedProviderId = providerId;
    const apiKey = decryptSecret(connection.credential);
    let result: Record<string, unknown>;
    if (providerId === "openjev") result = await probeOpenJev(connection.baseUrl, apiKey);
    else if (providerId === "freellmapi") result = await probeFreeLlmApi(connection.baseUrl, apiKey);
    else if (providerId === "replicate") result = await probeReplicate(connection);
    else if (OPENAI_COMPATIBLE_PROVIDER_IDS.has(providerId)) {
      const baseUrl = canonicalOpenAiCompatibleBaseUrl(providerId, connection.baseUrl);
      const catalog = await listOpenAiCompatibleModels({ baseUrl, apiKey });
      const configuredModel = typeof connection.chatModel === "string" ? connection.chatModel.trim() : "";
      const model = configuredModel || selectCompatibleModels({ preferredModel: null, modelCatalog: catalog, prompt: "Teste de disponibilidade da conexão." })[0] || "";
      if (!model) throw new RouteAuthError(409, "compatible_model_missing", "A conexão não informou nenhum modelo disponível. Salve um modelo ou revise o endereço da API.");
      result = await probeOpenAiCompatibleChat({ baseUrl, apiKey, model });
    } else if (["comfyui", "ltx", "openmontage"].includes(providerId)) result = await probeCreativeExecutor(connection);
    else throw new RouteAuthError(400, "unsupported_health_check", "Este provider ainda não possui um adaptador de teste. Ele não será tratado como rota disponível até possuir um.");
    await ref.set({ status: "healthy", health: { status: "healthy", checkedAt: FieldValue.serverTimestamp(), details: result }, ...(Array.isArray((result as { availableModels?: unknown }).availableModels) ? { modelCatalog: (result as { availableModels: string[] }).availableModels } : {}), lastHealthAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid }, { merge: true });
    await adminDb.collection("audit_logs").add({ type: "agent_tool_connection_health_checked", actorId: actor.uid, actorName: actor.name, connectionId, providerId: connection.providerId, healthy: true, createdAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ ok: true, healthy: true, details: result });
  } catch (error) {
    // A failed live probe is operational evidence. Do not keep advertising the
    // route as healthy (or let the router keep selecting it) until a later
    // successful test clears the degradation.
    if (checkedConnectionId) {
      const reason = error instanceof Error ? error.message.slice(0, 500) : "connection_probe_failed";
      await adminDb.collection("tool_connections").doc(checkedConnectionId).set({
        status: "degraded",
        health: { status: "degraded", lastFailedAt: FieldValue.serverTimestamp(), lastFailureReason: reason, cooldownUntil: new Date(Date.now() + 2 * 60_000), consecutiveFailures: FieldValue.increment(1) },
        lastHealthAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true }).catch(() => undefined);
      await adminDb.collection("audit_logs").add({ type: "agent_tool_connection_health_checked", connectionId: checkedConnectionId, providerId: checkedProviderId, healthy: false, createdAt: FieldValue.serverTimestamp() }).catch(() => undefined);
    }
    return fail(error);
  }
}
