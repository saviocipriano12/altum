import { randomUUID } from "node:crypto";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { decryptSecret } from "@/app/lib/server/secret-crypto";
import { requestFreeLlmChat, type FreeLlmApiMessage } from "@/lib/server/agent-os/freellmapi";
import { listOpenAiCompatibleModels, requestOpenAiCompatibleChat } from "@/lib/server/agent-os/openai-compatible";
import { selectCompatibleModels } from "@/lib/server/agent-os/compatible-model-routing";
import { canonicalOpenAiCompatibleBaseUrl, OPENAI_COMPATIBLE_PROVIDER_IDS } from "@/lib/server/agent-os/provider-endpoints";

export type RuntimeModelMessage = {
  role: "system" | "user" | "assistant" | "developer";
  content: string;
};

export type RuntimeModelRequest = {
  model: string;
  messages: RuntimeModelMessage[];
  maxTokens: number;
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
  status: unknown;
};

async function configuredPlatformConnections() {
  const snapshot = await adminDb.collection("tool_connections").where("scope", "==", "platform").limit(200).get();
  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() } as SavedConnection))
    .filter((connection) => connection.status !== "pending_config" && isTextCapability(connection.capabilities));
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
  const connections = await configuredPlatformConnections();
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
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      };
    } catch (error) {
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
        return { answer: result.answer, model: result.model, provider: connection.providerId, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
      } catch (error) {
        console.warn("[openclaw-model-gateway] compatible model unavailable.", { provider: connection.providerId, model, reason: error instanceof Error ? error.message.slice(0, 180) : "unknown" });
      }
    }
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
