import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { encryptSecret, hasStoredSecret, maskStoredSecret } from "@/app/lib/server/secret-crypto";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { toolConnectionCreateSchema } from "@/lib/server/agent-os/tool-registry";

const DEFAULT_PROVIDER_URLS: Record<string, string> = {
  freellmapi: "http://127.0.0.1:31415",
  "nvidia-nim": "https://integrate.api.nvidia.com/v1",
  groq: "https://api.groq.com/openai/v1",
  cerebras: "https://api.cerebras.ai/v1",
  mistral: "https://api.mistral.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  huggingface: "https://router.huggingface.co/v1",
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
  openai: "https://api.openai.com/v1",
  xai: "https://api.x.ai/v1",
  fal: "https://queue.fal.run",
  replicate: "https://api.replicate.com/v1",
  higgsfield: "https://api.higgsfield.ai",
  "ltx-cloud": "https://api.ltx.video",
  heygen: "https://api.heygen.com",
};

function timestamp(value: unknown) {
  return value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function"
    ? (value as { toDate: () => Date }).toDate().toISOString() : null;
}
function safeHealth(value: unknown) {
  const health = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const details = health.details && typeof health.details === "object" ? health.details as Record<string, unknown> : {};
  return {
    status: typeof health.status === "string" ? health.status : null,
    checkedAt: timestamp(health.checkedAt),
    lastFailedAt: timestamp(health.lastFailedAt),
    lastSucceededAt: timestamp(health.lastSucceededAt),
    cooldownUntil: timestamp(health.cooldownUntil),
    consecutiveFailures: Number.isFinite(Number(health.consecutiveFailures)) ? Math.max(0, Number(health.consecutiveFailures)) : 0,
    // A failure reason is useful to the platform owner, but credentials and
    // arbitrary provider payloads never leave the vault.
    lastFailureReason: typeof health.lastFailureReason === "string" ? health.lastFailureReason.slice(0, 500) : null,
    availableModels: Array.isArray(details.availableModels) ? details.availableModels.map(String).slice(0, 200) : [],
  };
}
function errorResponse(error: unknown) {
  if (error instanceof RouteAuthError) return Response.json({ error: error.message }, { status: error.status });
  const message = error instanceof Error ? error.message : "";
  if (message === "secret_encryption_key_missing") return Response.json({ error: "O cofre de segredos ainda não está configurado. Defina SECRET_ENCRYPTION_KEY antes de salvar uma credencial." }, { status: 503 });
  console.error("Falha no cofre de conexões:", error);
  return Response.json({ error: "Não foi possível concluir a operação no cofre de conexões." }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    await requireRequestUser(request, { roles: ["agency_admin"] });
    const snap = await adminDb.collection("tool_connections").orderBy("__name__").limit(200).get();
    return Response.json({ items: snap.docs.map((doc) => { const data = doc.data(); const health = safeHealth(data.health); return { id: doc.id, providerId: String(data.providerId || ""), displayName: String(data.displayName || ""), scope: data.scope === "tenant" ? "tenant" : "platform", tenantId: typeof data.tenantId === "string" ? data.tenantId : null, connectionType: String(data.connectionType || "api"), baseUrl: typeof data.baseUrl === "string" ? data.baseUrl : null, chatModel: typeof data.chatModel === "string" ? data.chatModel : null, modelCatalog: Array.isArray(data.modelCatalog) ? data.modelCatalog.map(String).slice(0, 200) : [], capabilities: Array.isArray(data.capabilities) ? data.capabilities.map(String) : [], notes: typeof data.notes === "string" ? data.notes : "", status: String(data.status || "pending_config"), healthStatus: health.status, health, credential: maskStoredSecret(data.credential), credentialConfigured: hasStoredSecret(data.credential), createdAt: timestamp(data.createdAt), lastHealthAt: timestamp(data.lastHealthAt) }; }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requireRequestUser(request, { roles: ["agency_admin"] });
    const parsed = toolConnectionCreateSchema.safeParse(await request.json());
    if (!parsed.success) throw new RouteAuthError(400, "invalid_connection", "Revise provider, escopo, tipo e capacidades da conexão.");
    const input = parsed.data;
    if (input.scope === "tenant") {
      const tenant = await adminDb.collection("tenants").doc(input.tenantId!).get();
      if (!tenant.exists) throw new RouteAuthError(404, "tenant_missing", "Empresa da conexão não encontrada.");
    }
    const ref = adminDb.collection("tool_connections").doc();
    const credential = input.credential ? encryptSecret(input.credential) : "";
    const status = credential || input.connectionType === "local" ? "configured_unapproved" : "pending_config";
    const baseUrl = input.baseUrl || DEFAULT_PROVIDER_URLS[input.providerId] || null;
    const activationPolicy = "per_mission_approval";
    const batch = adminDb.batch();
    const creativeModel = input.providerId === "fal" ? "fal-ai/wan/v2.2-a14b/text-to-video"
      : input.providerId === "replicate" ? "bytedance/seedance-1-pro"
        : input.providerId === "higgsfield" ? "bytedance/seedance-2.0/text-to-video"
          : input.providerId === "alibaba-model-studio" ? "qwen-image-3.0" : null;
    batch.set(ref, { providerId: input.providerId, displayName: input.displayName, scope: input.scope, tenantId: input.scope === "tenant" ? input.tenantId : null, connectionType: input.connectionType, baseUrl, credential, chatModel: input.chatModel || null, capabilities: input.capabilities, notes: input.notes || "", creativeModel, status, activationPolicy, createdBy: actor.uid, createdByName: actor.name, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    batch.set(adminDb.collection("audit_logs").doc(), { type: "agent_tool_connection_created", actorId: actor.uid, actorName: actor.name, connectionId: ref.id, providerId: input.providerId, tenantId: input.scope === "tenant" ? input.tenantId : null, connectionType: input.connectionType, credentialConfigured: Boolean(credential), createdAt: FieldValue.serverTimestamp() });
    await batch.commit();
    return Response.json({ ok: true, id: ref.id, status }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
