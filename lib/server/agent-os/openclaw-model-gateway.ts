import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { decryptSecret } from "@/app/lib/server/secret-crypto";
import { requestFreeLlmChat, type FreeLlmApiMessage } from "@/lib/server/agent-os/freellmapi";
import { listOpenAiCompatibleModels, requestOpenAiCompatibleChat } from "@/lib/server/agent-os/openai-compatible";
import { selectCompatibleModels } from "@/lib/server/agent-os/compatible-model-routing";
import { canonicalOpenAiCompatibleBaseUrl, OPENAI_COMPATIBLE_PROVIDER_IDS } from "@/lib/server/agent-os/provider-endpoints";
import { mediaConnectionAvailability } from "@/lib/server/agent-os/creative-model-router";

export type RuntimeModelMessage = {
  role: "system" | "user" | "assistant" | "developer";
  content: string;
};

export type RuntimeModelRequest = {
  model: string;
  messages: RuntimeModelMessage[];
  maxTokens: number;
};

const RUNTIME_PROVIDER_ORDER = ["groq", "nvidia-nim", "cerebras", "google", "openrouter", "huggingface", "mistral", "alibaba-model-studio", "custom-openai-compatible", "openai", "xai"];

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
  displayName?: unknown;
  baseUrl: unknown;
  credential: unknown;
  chatModel: unknown;
  modelCatalog: unknown;
  capabilities: unknown;
  scope: unknown;
  status: unknown;
  health?: unknown;
};

type RuntimeConnection = Pick<SavedConnection, "id" | "providerId" | "displayName">;

function normalized(value: unknown) {
  return typeof value === "string"
    ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
    : "";
}

/** A manual request remains a preference, never a dead end: the saved
 * connection is tried first and the healthy pool is still the fallback. */
export function findExplicitTextConnectionRequest(input: { prompt: string; connections: RuntimeConnection[] }) {
  const prompt = normalized(input.prompt);
  if (!/\b(usar|use|via|pelo|pela|provider|conexao|conexão|modelo)\b/.test(prompt)) return null;
  const choices = [...input.connections].sort((left, right) => Math.max(normalized(right.displayName).length, normalized(right.providerId).length) - Math.max(normalized(left.displayName).length, normalized(left.providerId).length));
  return choices.find((connection) => [connection.displayName, connection.providerId]
    .map(normalized).filter((name) => name.length >= 3).some((name) => prompt.includes(name))) || null;
}

export function orderRuntimeConnections(input: { connections: RuntimeConnection[]; prompt: string }) {
  const explicit = findExplicitTextConnectionRequest(input);
  if (!explicit) return { connections: input.connections, explicitConnectionId: null as string | null };
  return { connections: [explicit, ...input.connections.filter((connection) => connection.id !== explicit.id)], explicitConnectionId: explicit.id };
}

function recordRuntimeConnectionOutcome(connection: SavedConnection, outcome: "success" | "failure", reason?: unknown) {
  const ref = adminDb.collection("tool_connections").doc(connection.id);
  const patch = outcome === "success"
    ? { status: "healthy", health: { status: "healthy", lastSucceededAt: FieldValue.serverTimestamp(), cooldownUntil: null, consecutiveFailures: 0, lastExecutionStatus: "text_completed" }, lastHealthAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }
    : { health: { status: "degraded", lastFailedAt: FieldValue.serverTimestamp(), cooldownUntil: new Date(Date.now() + 2 * 60_000), consecutiveFailures: FieldValue.increment(1), lastExecutionStatus: "text_failed", lastFailureReason: String(reason || "provider_unavailable").slice(0, 500) }, lastHealthAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
  return ref.set(patch, { merge: true }).catch(() => undefined);
}

async function configuredPlatformConnections() {
  const snapshot = await adminDb.collection("tool_connections").where("scope", "==", "platform").limit(200).get();
  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() } as SavedConnection))
    .filter((connection) => Boolean(connection.credential) && isTextCapability(connection.capabilities) && mediaConnectionAvailability({ status: String(connection.status || "pending_config"), health: connection.health }).available);
}

export type RuntimeModelResult = {
  answer: string;
  model: string;
  provider: string;
  connectionId?: string;
  routing: "automatic" | "manual";
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
  const savedConnections = await configuredPlatformConnections();
  const manual = orderRuntimeConnections({ connections: savedConnections, prompt: promptForRouting(input.messages) });
  const connections = manual.connections as SavedConnection[];
  const routing = manual.explicitConnectionId ? "manual" as const : "automatic" as const;
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
      return {
        answer: result.answer,
        model: result.routedVia || result.model,
        provider: "freellmapi",
        connectionId: freeGateway.id,
        routing,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      };
    } catch (error) {
      void recordRuntimeConnectionOutcome(freeGateway, "failure", error instanceof Error ? error.message : "freellmapi_unavailable");
      console.warn("[openclaw-model-gateway] FreeLLMAPI unavailable; trying a compatible connection.", error instanceof Error ? error.message.slice(0, 180) : "unknown");
    }
  }

  const compatible = connections
    .filter((connection) => OPENAI_COMPATIBLE_PROVIDER_IDS.has(connection.providerId))
    .sort((left, right) => {
      if (manual.explicitConnectionId === left.id) return -1;
      if (manual.explicitConnectionId === right.id) return 1;
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
        void recordRuntimeConnectionOutcome(connection, "success");
        return { answer: result.answer, model: result.model, provider: connection.providerId, connectionId: connection.id, routing, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
      } catch (error) {
        console.warn("[openclaw-model-gateway] compatible model unavailable.", { provider: connection.providerId, model, reason: error instanceof Error ? error.message.slice(0, 180) : "unknown" });
      }
    }
    void recordRuntimeConnectionOutcome(connection, "failure", "all_configured_models_failed");
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
