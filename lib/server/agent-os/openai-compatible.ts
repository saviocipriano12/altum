import { RouteAuthError } from "@/app/lib/server/route-auth";

type CompatibleMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatCompletionPayload = {
  choices?: Array<{ message?: { content?: unknown } }>;
  model?: unknown;
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
  error?: { message?: unknown };
};

type ModelsPayload = { data?: Array<{ id?: unknown }> };

/**
 * A narrow, server-side adapter for providers that explicitly offer the
 * OpenAI-compatible Chat Completions contract (for example Alibaba Model
 * Studio). It intentionally only permits HTTPS remote endpoints: this avoids
 * turning a saved connection into an SSRF path inside the deployed Altum.
 */
export function normalizeOpenAiCompatibleBaseUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new RouteAuthError(409, "compatible_endpoint_missing", "Informe o endereço OpenAI-compatível informado pelo provider.");
  }
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new RouteAuthError(400, "compatible_endpoint_invalid", "O endereço da API é inválido."); }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname) {
    throw new RouteAuthError(400, "compatible_endpoint_unsafe", "A API compatível precisa usar um endereço HTTPS público, sem usuário ou senha na URL.");
  }
  url.search = ""; url.hash = "";
  url.pathname = url.pathname.replace(/\/$/, "");
  return url.toString().replace(/\/$/, "");
}

function providerMessage(payload: ChatCompletionPayload, fallback: string) {
  return typeof payload.error?.message === "string" && payload.error.message.trim()
    ? payload.error.message.trim().slice(0, 240) : fallback;
}

export async function requestOpenAiCompatibleChat(input: {
  baseUrl: unknown;
  apiKey: string;
  model: string;
  messages: CompatibleMessage[];
}) {
  const baseUrl = normalizeOpenAiCompatibleBaseUrl(input.baseUrl);
  const key = input.apiKey.trim();
  const model = input.model.trim();
  if (!key) throw new RouteAuthError(409, "compatible_key_missing", "A conexão não possui uma chave salva.");
  if (!model) throw new RouteAuthError(409, "compatible_model_missing", "Escolha um modelo disponível nesta conexão.");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature: 0.3, max_tokens: 1_000, messages: input.messages.map((item) => ({ role: item.role, content: item.content.slice(0, 24_000) })) }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({})) as ChatCompletionPayload;
  if (!response.ok) throw new Error(providerMessage(payload, `A API compatível retornou HTTP ${response.status}.`));
  const answer = typeof payload.choices?.[0]?.message?.content === "string" ? payload.choices[0].message.content.trim() : "";
  if (!answer) throw new Error("A API compatível retornou uma resposta vazia.");
  return {
    answer,
    model: typeof payload.model === "string" ? payload.model.slice(0, 180) : model,
    inputTokens: Number(payload.usage?.prompt_tokens || 0),
    outputTokens: Number(payload.usage?.completion_tokens || 0),
  };
}

/**
 * Performs the smallest useful live validation after a person explicitly asks
 * to test a saved connection. It deliberately exercises the selected model,
 * because accepting a key alone does not prove that campaign/workspace has
 * enabled that model.
 */
export async function probeOpenAiCompatibleChat(input: { baseUrl: unknown; apiKey: string; model: string }) {
  const result = await requestOpenAiCompatibleChat({
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    model: input.model,
    messages: [
      { role: "system", content: "Responda apenas OK." },
      { role: "user", content: "Teste de disponibilidade." },
    ],
  });
  const availableModels = await listOpenAiCompatibleModels({ baseUrl: input.baseUrl, apiKey: input.apiKey });
  return { model: result.model, responseReceived: true, availableModels };
}

/** Best-effort catalog discovery. Some compatible gateways intentionally do
 * not expose /models, so an unavailable catalog never invalidates a live
 * completion test. */
export async function listOpenAiCompatibleModels(input: { baseUrl: unknown; apiKey: string }) {
  const baseUrl = normalizeOpenAiCompatibleBaseUrl(input.baseUrl);
  const key = input.apiKey.trim();
  if (!key) return [];
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return [];
    const payload = await response.json().catch(() => ({})) as ModelsPayload;
    return Array.from(new Set((payload.data || [])
      .map((item) => typeof item.id === "string" ? item.id.trim() : "")
      .filter((id) => /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,179}$/.test(id))))
      .sort((left, right) => left.localeCompare(right)).slice(0, 200);
  } catch {
    return [];
  }
}
