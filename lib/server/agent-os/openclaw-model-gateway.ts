import { randomUUID } from "node:crypto";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { decryptSecret } from "@/app/lib/server/secret-crypto";
import { requestFreeLlmChat, type FreeLlmApiMessage } from "@/lib/server/agent-os/freellmapi";
import { listOpenAiCompatibleModels, requestOpenAiCompatibleChat } from "@/lib/server/agent-os/openai-compatible";
import { selectCompatibleModels } from "@/lib/server/agent-os/compatible-model-routing";
import { canonicalOpenAiCompatibleBaseUrl, OPENAI_COMPATIBLE_PROVIDER_IDS } from "@/lib/server/agent-os/provider-endpoints";
import { FieldValue } from "firebase-admin/firestore";

export type RuntimeModelMessage = {
  role: "system" | "user" | "assistant" | "developer";
  content: string;
};

export type RuntimeModelRequest = {
  model: string;
  messages: RuntimeModelMessage[];
  maxTokens: number;
  /** Optional explicit route used by the Comando or MCP. Automatic routing is
   * the default; a request is never silently pinned to a provider. */
  providerId?: string;
  connectionId?: string;
  tenantId?: string;
};

const RUNTIME_PROVIDER_ORDER = ["groq", "nvidia-nim", "cerebras", "openrouter", "huggingface", "mistral", "alibaba-model-studio", "custom-openai-compatible"];

function clean(value: unknown, max = 24_000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isTextCapability(value: unknown) {
  return Array.isArray(value) && value.some((capability) => capability === "GENERATE_TEXT");
}

/**
 * Earlier connection forms saved a provider origin without its OpenAI v1
 * suffix. Keep that friendly input compatible with the runtime rather than
 * making the operator understand each provider's URL convention.
 */
export const runtimeCompatibleBaseUrl = canonicalOpenAiCompatibleBaseUrl;

function messagesForProvider(messages: RuntimeModelMessage[]): FreeLlmApiMessage[] {
  return messages.map((message) => ({
    // OpenAI-compatible gateways do not universally accept the newer
    // developer role. It has the same policy meaning here.
    role: message.role === "developer" ? "system" : message.role,
    content: clean(message.content),
  })).filter((message) => message.content);
}

function promptForRouting(messages: RuntimeModelMessage[]) {
  return [...messages].reverse().find((message) => message.role === "user")?.content || "";
}

type SavedConnection = {
  id: string;
  providerId: string;
  baseUrl: unknown;
  credential: unknown;
  chatModel: unknown;
  modelCatalog: unknown;
  capabilities: unknown;
  scope: unknown;
  tenantId?: unknown;
  status: unknown;
  health?: unknown;
};

function connectionAvailable(connection: SavedConnection) {
  if (!["configured_unapproved", "healthy", "approved"].includes(String(connection.status || ""))) return false;
  const health = connection.health && typeof connection.health === "object" ? connection.health as Record<string, unknown> : {};
  if (["degraded", "down", "unavailable", "disabled"].includes(String(health.status || "").toLowerCase())) return false;
  const cooldown = health.cooldownUntil;
  const cooldownMillis = cooldown && typeof cooldown === "object" && "toMillis" in cooldown && typeof (cooldown as { toMillis?: unknown }).toMillis === "function"
    ? (cooldown as { toMillis: () => number }).toMillis()
    : new Date(String(cooldown || "")).getTime();
  return !Number.isFinite(cooldownMillis) || cooldownMillis <= Date.now();
}

async function configuredConnections(tenantId?: string) {
  const snapshot = await adminDb.collection("tool_connections").limit(200).get();
  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() } as SavedConnection))
    .filter((connection) => connectionAvailable(connection) && isTextCapability(connection.capabilities)
      && (connection.scope === "platform" || (connection.scope === "tenant" && Boolean(tenantId) && connection.tenantId === tenantId)));
}

async function recordRuntimeConnectionResult(input: { connectionId: string; succeeded: boolean; providerId: string; model?: string; reason?: string }) {
  const ref = adminDb.collection("tool_connections").doc(input.connectionId);
  const base = {
    lastRuntimeAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (input.succeeded) {
    await ref.set({ ...base, status: "healthy", health: { status: "healthy", lastSucceededAt: FieldValue.serverTimestamp(), lastRuntimeProvider: input.providerId, lastRuntimeModel: input.model || null, consecutiveFailures: 0 } }, { merge: true }).catch(() => undefined);
    return;
  }
  await ref.set({ ...base, status: "degraded", health: { status: "degraded", lastFailedAt: FieldValue.serverTimestamp(), lastFailureReason: String(input.reason || "runtime_request_failed").slice(0, 500), cooldownUntil: new Date(Date.now() + 2 * 60_000), consecutiveFailures: FieldValue.increment(1) } }, { merge: true }).catch(() => undefined);
}

export type RuntimeModelResult = {
  answer: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
};

/**
 * Routes runtime requests through credentials stored in the Altum vault. The
 * VPS receives neither provider API keys nor a provider-specific decision.
 */
export async function requestRuntimeModel(input: RuntimeModelRequest): Promise<RuntimeModelResult> {
  const messages = messagesForProvider(input.messages);
  if (!messages.length) throw new Error("runtime_model_messages_missing");
  const requestedProvider = clean(input.providerId, 120).toLowerCase();
  const requestedConnection = clean(input.connectionId, 180);
  const allConnections = await configuredConnections(input.tenantId);
  const connections = allConnections.filter((connection) => (!requestedProvider || connection.providerId === requestedProvider) && (!requestedConnection || connection.id === requestedConnection));
  if ((requestedProvider || requestedConnection) && !connections.length) throw new Error("runtime_requested_route_unavailable");
  const freeGateway = connections.find((connection) => connection.providerId === "freellmapi");
  const freeKey = freeGateway ? decryptSecret(typeof freeGateway.credential === "string" ? freeGateway.credential : "") : "";

  if (freeGateway && freeKey) {
    try {
      const result = await requestFreeLlmChat({
        baseUrl: freeGateway.baseUrl,
        apiKey: freeKey,
        model: input.model === "altum-agent" ? "auto" : input.model,
        messages,
      });
      await recordRuntimeConnectionResult({ connectionId: freeGateway.id, succeeded: true, providerId: "freellmapi", model: result.routedVia || result.model });
      return {
        answer: result.answer,
        model: result.routedVia || result.model,
        provider: "freellmapi",
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      };
    } catch (error) {
      await recordRuntimeConnectionResult({ connectionId: freeGateway.id, succeeded: false, providerId: "freellmapi", reason: error instanceof Error ? error.message : "freellmapi_unavailable" });
      console.warn("[openclaw-model-gateway] FreeLLMAPI unavailable; trying a compatible connection.", error instanceof Error ? error.message.slice(0, 180) : "unknown");
    }
  }

  const compatible = connections
    .filter((connection) => OPENAI_COMPATIBLE_PROVIDER_IDS.has(connection.providerId))
    .sort((left, right) => {
      const leftPriority = RUNTIME_PROVIDER_ORDER.indexOf(left.providerId);
      const rightPriority = RUNTIME_PROVIDER_ORDER.indexOf(right.providerId);
      return (leftPriority < 0 ? 999 : leftPriority) - (rightPriority < 0 ? 999 : rightPriority);
    });
  const routingPrompt = promptForRouting(input.messages);
  for (const connection of compatible) {
    const key = decryptSecret(typeof connection.credential === "string" ? connection.credential : "");
    if (!key) continue;
    const baseUrl = runtimeCompatibleBaseUrl(connection.providerId, connection.baseUrl);
    if (!baseUrl) continue;
    const preferredModel = input.model && input.model !== "altum-agent" ? input.model : clean(connection.chatModel, 180);
    let catalog = Array.isArray(connection.modelCatalog) ? connection.modelCatalog : [];
    if (!catalog.length) {
      try {
        catalog = await listOpenAiCompatibleModels({ baseUrl, apiKey: key });
      } catch {
        catalog = [];
      }
    }
    const candidates = selectCompatibleModels({ preferredModel, modelCatalog: catalog, prompt: routingPrompt });
    for (const model of candidates) {
      try {
        const result = await requestOpenAiCompatibleChat({ baseUrl, apiKey: key, model, messages });
        await recordRuntimeConnectionResult({ connectionId: connection.id, succeeded: true, providerId: connection.providerId, model: result.model });
        return { answer: result.answer, model: result.model, provider: connection.providerId, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
      } catch (error) {
        console.warn("[openclaw-model-gateway] compatible model unavailable.", { provider: connection.providerId, model, reason: error instanceof Error ? error.message.slice(0, 180) : "unknown" });
      }
    }
    await recordRuntimeConnectionResult({ connectionId: connection.id, succeeded: false, providerId: connection.providerId, reason: "all_candidate_models_failed" });
  }
  throw new Error("runtime_model_unavailable");
}

export function runtimeChatCompletion(result: RuntimeModelResult) {
  return {
    id: `chatcmpl_altum_${randomUUID().replaceAll("-", "")}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1_000),
    model: result.model,
    choices: [{ index: 0, message: { role: "assistant", content: result.answer }, finish_reason: "stop" }],
    usage: {
      prompt_tokens: Math.max(0, result.inputTokens || 0),
      completion_tokens: Math.max(0, result.outputTokens || 0),
      total_tokens: Math.max(0, result.inputTokens || 0) + Math.max(0, result.outputTokens || 0),
    },
    altum: { provider: result.provider },
  };
}
