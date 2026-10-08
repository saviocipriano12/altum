import { z } from "zod";

export const AGENT_CAPABILITIES = [
  "PLAN_MISSION", "ANALYZE_RESULTS", "WEB_RESEARCH", "BROWSER_ASSISTED", "CRM_READ", "CRM_WRITE",
  "EXTERNAL_MESSAGING", "EMAIL", "CALENDAR", "GENERATE_TEXT", "GENERATE_IMAGE", "GENERATE_VIDEO",
  "GENERATE_AUDIO", "TRANSCRIBE_AUDIO", "READ_DOCUMENTS", "GENERATE_CREATIVE", "BUILD_PRODUCT",
  "DEPLOY_SITE", "PUBLISH_CONTENT", "PUBLISH_OR_ADS_WRITE", "READ_ANALYTICS", "RUN_CODE",
  "GENERATE_EMBEDDINGS", "RERANK_DOCUMENTS", "CLASSIFY", "DECIDE_STRUCTURED", "GENERATE_AVATAR_VIDEO",
] as const;

export type AgentCapability = (typeof AGENT_CAPABILITIES)[number];
export type ProviderTier = "free" | "local" | "cheap" | "premium" | "internal";
export const ROUTING_MODES = ["FREE_FIRST", "BALANCED", "QUALITY_FIRST", "FASTEST", "CHEAPEST", "LOCAL_ONLY", "PRIVACY_FIRST"] as const;
export type RoutingMode = (typeof ROUTING_MODES)[number];
export const PROVIDER_AVAILABILITY = ["FREE", "FREE_TIER", "CREDIT", "SELF_HOSTED", "PAID", "SUBSCRIPTION"] as const;
export type ProviderAvailability = (typeof PROVIDER_AVAILABILITY)[number];

export const PROVIDER_CATALOG = [
  { slug: "altum-runtime", name: "Runtime Altum", tier: "internal" as const, kind: "runtime", capabilities: ["PLAN_MISSION", "ANALYZE_RESULTS", "CRM_READ", "CRM_WRITE"] },
  { slug: "freellmapi", name: "FreeLLMAPI (laboratório)", tier: "internal" as const, kind: "gateway", availability: "FREE_TIER" as const, capabilities: ["GENERATE_TEXT", "CLASSIFY", "ANALYZE_RESULTS"] },
  { slug: "openjev", name: "OpenJEV (decisões tipadas)", tier: "local" as const, kind: "decision-engine", availability: "SELF_HOSTED" as const, capabilities: ["CLASSIFY", "DECIDE_STRUCTURED"] },
  { slug: "nvidia-nim", name: "NVIDIA NIM", tier: "free" as const, kind: "model", availability: "FREE_TIER" as const, capabilities: ["GENERATE_TEXT", "READ_DOCUMENTS", "ANALYZE_RESULTS", "GENERATE_EMBEDDINGS", "RERANK_DOCUMENTS"] },
  { slug: "ollama", name: "Ollama / modelo local", tier: "local" as const, kind: "model", availability: "SELF_HOSTED" as const, capabilities: ["GENERATE_TEXT", "READ_DOCUMENTS", "ANALYZE_RESULTS", "GENERATE_EMBEDDINGS", "CLASSIFY", "DECIDE_STRUCTURED"] },
  { slug: "vllm", name: "vLLM / servidor próprio", tier: "local" as const, kind: "model-server", availability: "SELF_HOSTED" as const, capabilities: ["GENERATE_TEXT", "READ_DOCUMENTS", "ANALYZE_RESULTS", "GENERATE_EMBEDDINGS", "CLASSIFY", "DECIDE_STRUCTURED"] },
  { slug: "groq", name: "Groq", tier: "free" as const, kind: "model", availability: "FREE_TIER" as const, capabilities: ["GENERATE_TEXT", "CLASSIFY", "ANALYZE_RESULTS", "DECIDE_STRUCTURED"] },
  { slug: "cerebras", name: "Cerebras", tier: "free" as const, kind: "model", availability: "FREE_TIER" as const, capabilities: ["GENERATE_TEXT", "CLASSIFY", "ANALYZE_RESULTS", "DECIDE_STRUCTURED"] },
  { slug: "openrouter", name: "OpenRouter", tier: "cheap" as const, kind: "gateway", availability: "FREE_TIER" as const, capabilities: ["GENERATE_TEXT", "READ_DOCUMENTS", "ANALYZE_RESULTS", "CLASSIFY"] },
  { slug: "litellm", name: "LiteLLM Gateway", tier: "internal" as const, kind: "gateway", capabilities: ["GENERATE_TEXT", "READ_DOCUMENTS", "ANALYZE_RESULTS"] },
  { slug: "openai", name: "OpenAI", tier: "premium" as const, kind: "model", capabilities: ["GENERATE_TEXT", "GENERATE_IMAGE", "GENERATE_AUDIO", "TRANSCRIBE_AUDIO", "READ_DOCUMENTS"] },
  { slug: "anthropic", name: "Anthropic", tier: "premium" as const, kind: "model", capabilities: ["GENERATE_TEXT", "READ_DOCUMENTS", "ANALYZE_RESULTS"] },
  { slug: "google", name: "Google / Gemini", tier: "premium" as const, kind: "model", availability: "FREE_TIER" as const, capabilities: ["GENERATE_TEXT", "READ_DOCUMENTS", "ANALYZE_RESULTS", "GENERATE_EMBEDDINGS", "CLASSIFY"] },
  { slug: "alibaba-model-studio", name: "Alibaba Model Studio / Qwen", tier: "cheap" as const, kind: "openai-compatible", availability: "CREDIT" as const, capabilities: ["GENERATE_TEXT", "GENERATE_IMAGE", "GENERATE_VIDEO", "READ_DOCUMENTS", "ANALYZE_RESULTS", "CLASSIFY", "DECIDE_STRUCTURED"] },
  { slug: "custom-openai-compatible", name: "Outra API compatível com OpenAI", tier: "cheap" as const, kind: "openai-compatible", capabilities: ["GENERATE_TEXT", "READ_DOCUMENTS", "ANALYZE_RESULTS", "CLASSIFY", "DECIDE_STRUCTURED"] },
  { slug: "xai", name: "xAI / Grok", tier: "premium" as const, kind: "model", capabilities: ["GENERATE_TEXT", "GENERATE_IMAGE", "GENERATE_VIDEO", "GENERATE_AUDIO", "READ_DOCUMENTS"] },
  { slug: "huggingface", name: "Hugging Face", tier: "cheap" as const, kind: "model", availability: "FREE_TIER" as const, capabilities: ["GENERATE_TEXT", "GENERATE_IMAGE", "GENERATE_VIDEO", "GENERATE_AUDIO", "TRANSCRIBE_AUDIO", "GENERATE_EMBEDDINGS", "RERANK_DOCUMENTS"] },
  { slug: "fal", name: "fal (vídeo e imagem)", tier: "cheap" as const, kind: "creative-api", availability: "CREDIT" as const, capabilities: ["GENERATE_IMAGE", "GENERATE_VIDEO", "GENERATE_AUDIO", "GENERATE_AVATAR_VIDEO"] },
  { slug: "replicate", name: "Replicate (vídeo econômico)", tier: "cheap" as const, kind: "creative-api", availability: "CREDIT" as const, capabilities: ["GENERATE_IMAGE", "GENERATE_VIDEO", "GENERATE_AUDIO"] },
  { slug: "higgsfield", name: "Higgsfield (vídeo cinematográfico)", tier: "premium" as const, kind: "creative-api", availability: "CREDIT" as const, capabilities: ["GENERATE_IMAGE", "GENERATE_VIDEO", "GENERATE_AUDIO", "GENERATE_AVATAR_VIDEO"] },
  { slug: "ltx-cloud", name: "LTX Cloud (vídeo)", tier: "cheap" as const, kind: "creative-api", availability: "CREDIT" as const, capabilities: ["GENERATE_VIDEO", "GENERATE_AUDIO", "GENERATE_CREATIVE"] },
  { slug: "heygen", name: "HeyGen (avatar e apresentador)", tier: "premium" as const, kind: "creative-api", availability: "SUBSCRIPTION" as const, capabilities: ["GENERATE_VIDEO", "GENERATE_AUDIO", "GENERATE_AVATAR_VIDEO"] },
  { slug: "comfyui", name: "ComfyUI", tier: "local" as const, kind: "creative", availability: "SELF_HOSTED" as const, capabilities: ["GENERATE_IMAGE", "GENERATE_VIDEO"] },
  { slug: "remotion", name: "Remotion", tier: "local" as const, kind: "creative", availability: "SELF_HOSTED" as const, capabilities: ["GENERATE_VIDEO", "GENERATE_CREATIVE"] },
  { slug: "ltx", name: "LTX 2.3 / LTX Desktop", tier: "local" as const, kind: "creative", availability: "SELF_HOSTED" as const, capabilities: ["GENERATE_VIDEO", "GENERATE_CREATIVE"] },
  { slug: "openmontage", name: "OpenMontage (produção de vídeo)", tier: "local" as const, kind: "creative", availability: "SELF_HOSTED" as const, capabilities: ["WEB_RESEARCH", "GENERATE_VIDEO", "GENERATE_AUDIO", "GENERATE_CREATIVE"] },
  { slug: "voicestudio", name: "VoiceStudio (voz local)", tier: "local" as const, kind: "creative", availability: "SELF_HOSTED" as const, capabilities: ["GENERATE_AUDIO", "TRANSCRIBE_AUDIO", "GENERATE_AVATAR_VIDEO"] },
  { slug: "anydoc", name: "AnyDoc (leitura de documentos)", tier: "local" as const, kind: "document", availability: "SELF_HOSTED" as const, capabilities: ["READ_DOCUMENTS"] },
  { slug: "agent-reach", name: "Agent-Reach (pesquisa web)", tier: "local" as const, kind: "research", availability: "SELF_HOSTED" as const, capabilities: ["WEB_RESEARCH", "READ_DOCUMENTS"] },
  { slug: "mirofish", name: "MiroFish (simulação de cenários)", tier: "local" as const, kind: "analysis", availability: "SELF_HOSTED" as const, capabilities: ["ANALYZE_RESULTS", "PLAN_MISSION"] },
  { slug: "n8n", name: "n8n", tier: "internal" as const, kind: "automation", capabilities: ["EMAIL", "CALENDAR", "EXTERNAL_MESSAGING", "PUBLISH_CONTENT"] },
  { slug: "mcp", name: "MCP Hub", tier: "internal" as const, kind: "tool", capabilities: ["WEB_RESEARCH", "CRM_READ", "CRM_WRITE", "READ_ANALYTICS"] },
] as const;

export const providerCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_-]{1,60}$/),
  kind: z.string().trim().min(2).max(40),
  tier: z.enum(["free", "local", "cheap", "premium", "internal"]),
  capabilities: z.array(z.enum(AGENT_CAPABILITIES)).min(1).max(12),
  notes: z.string().trim().max(600).optional(),
});

export const toolConnectionCreateSchema = z.object({
  providerId: z.string().trim().min(2).max(80),
  displayName: z.string().trim().min(2).max(100),
  scope: z.enum(["platform", "tenant"]),
  tenantId: z.string().trim().min(1).max(180).optional(),
  connectionType: z.enum(["api", "oauth", "mcp", "local", "webhook", "browser"]),
  baseUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  credential: z.string().trim().min(4).max(12000).optional().or(z.literal("")),
  chatModel: z.string().trim().max(180).optional().or(z.literal("")),
  capabilities: z.array(z.enum(AGENT_CAPABILITIES)).min(1).max(12),
  notes: z.string().trim().max(600).optional(),
}).superRefine((value, context) => {
  if (value.scope === "tenant" && !value.tenantId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["tenantId"], message: "Selecione a empresa da conexão." });
  }
});
