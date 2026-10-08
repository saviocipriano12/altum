// O aplicativo oficial para Windows usa 31415. Instalações via Docker podem
// manter 3011 definindo FREELLMAPI_BASE_URL no ambiente da Altum.
const DEFAULT_RUNTIME_URL = "http://127.0.0.1:31415";

export type FreeLlmApiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatPayload = {
  choices?: Array<{ message?: { content?: unknown } }>;
  model?: unknown;
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
  error?: { message?: unknown };
};

function runtimeHosts() {
  return new Set(["127.0.0.1", "localhost", "::1", "host.docker.internal", "freellmapi", ...(process.env.ALTUM_AGENT_RUNTIME_HOSTS || "").split(",").map((host) => host.trim()).filter(Boolean)]);
}

export function normalizeFreeLlmApiUrl(value: unknown) {
  const raw = typeof value === "string" && value.trim() ? value.trim() : process.env.FREELLMAPI_BASE_URL || DEFAULT_RUNTIME_URL;
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("freellmapi_url_invalid"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !runtimeHosts().has(url.hostname)) throw new Error("freellmapi_url_untrusted");
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = ""; url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export async function probeFreeLlmApi(value: unknown, apiKey?: string) {
  const baseUrl = normalizeFreeLlmApiUrl(value);
  const response = await fetch(`${baseUrl}/api/ping`, { cache: "no-store", signal: AbortSignal.timeout(6_000) });
  const payload = await response.json().catch(() => ({})) as { status?: unknown; timestamp?: unknown };
  if (!response.ok || payload.status !== "ok") throw new Error(`freellmapi_unhealthy_${response.status}`);
  const key = apiKey?.trim() || "";
  if (!key) return { baseUrl, runtimeTimestamp: typeof payload.timestamp === "string" ? payload.timestamp : null, responseReceived: false };
  const completion = await requestFreeLlmChat({
    baseUrl,
    apiKey: key,
    model: "auto",
    messages: [{ role: "user", content: "Responda apenas OK." }],
  });
  return {
    baseUrl,
    runtimeTimestamp: typeof payload.timestamp === "string" ? payload.timestamp : null,
    responseReceived: true,
    model: completion.model,
    availableModels: completion.model ? [completion.model] : [],
  };
}

/**
 * Chamada OpenAI-compatível para a Central local. A chave continua apenas no
 * cofre da Altum; este módulo nunca a registra, devolve ou envia para outro host.
 */
export async function requestFreeLlmChat(input: {
  baseUrl?: unknown;
  apiKey: string;
  messages: FreeLlmApiMessage[];
  model?: string;
}) {
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new Error("freellmapi_key_missing");
  const baseUrl = normalizeFreeLlmApiUrl(input.baseUrl);
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      // "auto" é o modo oficial do FreeLLMAPI para escolher o provider/modelo.
      model: input.model?.trim() || "auto",
      temperature: 0.3,
      max_tokens: 1_000,
      stream: false,
      messages: input.messages.map((message) => ({ role: message.role, content: message.content.slice(0, 24_000) })),
    }),
  });
  const payload = await response.json().catch(() => ({})) as ChatPayload;
  if (!response.ok) {
    const providerMessage = typeof payload.error?.message === "string" ? payload.error.message.slice(0, 220) : "";
    throw new Error(providerMessage || `freellmapi_http_${response.status}`);
  }
  const content = payload.choices?.[0]?.message?.content;
  const answer = typeof content === "string" ? content.trim() : "";
  if (!answer) throw new Error("freellmapi_empty_response");
  return {
    answer,
    model: typeof payload.model === "string" ? payload.model.slice(0, 160) : "auto",
    routedVia: response.headers.get("x-routed-via")?.slice(0, 200) || null,
    inputTokens: Number(payload.usage?.prompt_tokens || 0),
    outputTokens: Number(payload.usage?.completion_tokens || 0),
  };
}
