/** Providers whose documented chat API follows OpenAI's `/v1` contract. */
export const OPENAI_COMPATIBLE_PROVIDER_IDS = new Set([
  "alibaba-model-studio",
  "custom-openai-compatible",
  "nvidia-nim",
  "groq",
  "cerebras",
  "mistral",
  "openrouter",
  "huggingface",
  "google",
  "openai",
  "xai",
]);

const CANONICAL_OPENAI_BASE_URLS: Record<string, string> = {
  "nvidia-nim": "https://integrate.api.nvidia.com/v1",
  groq: "https://api.groq.com/openai/v1",
  cerebras: "https://api.cerebras.ai/v1",
  mistral: "https://api.mistral.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  huggingface: "https://router.huggingface.co/v1",
  // Official Gemini OpenAI-compatibility endpoint. It lets a saved AI Studio
  // key participate in the same text fallback chain as the other providers.
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
  openai: "https://api.openai.com/v1",
  xai: "https://api.x.ai/v1",
};

/**
 * Older connections may contain only a provider origin. Convert those friendly
 * values to the official OpenAI-compatible endpoint without asking someone to
 * know provider-specific URL paths. An explicit non-root URL is never changed.
 */
export function canonicalOpenAiCompatibleBaseUrl(providerId: string, savedBaseUrl: unknown) {
  const saved = typeof savedBaseUrl === "string" ? savedBaseUrl.trim().slice(0, 500) : "";
  const canonical = CANONICAL_OPENAI_BASE_URLS[providerId];
  if (!saved) return canonical || "";
  if (!canonical) return saved;
  try {
    const configured = new URL(saved);
    const expected = new URL(canonical);
    if (configured.origin === expected.origin && ["", "/"].includes(configured.pathname)) return canonical;
  } catch {
    return saved;
  }
  return saved;
}
