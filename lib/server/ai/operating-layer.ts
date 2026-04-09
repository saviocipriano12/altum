export type AltumAiProvider = "altum_rules" | "openai" | "anthropic" | "gemini" | "mistral";
export type AltumAiTier = "essential" | "growth" | "premium" | "elite" | "enterprise";
export type AltumAiAutonomyMode = "copilot" | "hybrid" | "autonomous";
export type AltumAiReasoningLevel = "fast" | "balanced" | "deep";
export type AltumAiResponseStyle = "concise" | "consultative" | "premium_sales" | "closer";

export type TenantAiOperatingProfile = {
  tier: AltumAiTier;
  autonomyMode: AltumAiAutonomyMode;
  reasoningLevel: AltumAiReasoningLevel;
  responseStyle: AltumAiResponseStyle;
  preferredProviders: AltumAiProvider[];
  conversationModelOverride?: string;
  extractionModelOverride?: string;
  monthlyBudgetUsd: number;
  monthlyUsageCap: number;
};

export type TenantAiRuntimePolicy = {
  primaryProvider: AltumAiProvider;
  fallbackProviders: AltumAiProvider[];
  conversationModel: string;
  extractionModel: string;
  retrievalMode: "keyword" | "hybrid" | "semantic";
  supportsToolCalling: boolean;
  supportsDeepReasoning: boolean;
  budgetMode: "conservative" | "balanced" | "premium";
};

const PROVIDERS: AltumAiProvider[] = ["openai", "anthropic", "gemini", "mistral", "altum_rules"];

export const AI_TIER_LABELS: Record<AltumAiTier, string> = {
  essential: "Essencial",
  growth: "Crescimento",
  premium: "Premium",
  elite: "Elite",
  enterprise: "Enterprise",
};

export const AI_AUTONOMY_LABELS: Record<AltumAiAutonomyMode, string> = {
  copilot: "Copilot",
  hybrid: "Hibrido",
  autonomous: "Autonomo",
};

export const AI_REASONING_LABELS: Record<AltumAiReasoningLevel, string> = {
  fast: "Rapido",
  balanced: "Equilibrado",
  deep: "Profundo",
};

export const AI_RESPONSE_STYLE_LABELS: Record<AltumAiResponseStyle, string> = {
  concise: "Direto",
  consultative: "Consultivo",
  premium_sales: "Premium Sales",
  closer: "Closer",
};

export const DEFAULT_AI_PROVIDERS: AltumAiProvider[] = ["openai", "altum_rules"];

function cleanString(value: unknown, max = 80) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().slice(0, max);
}

function normalizeEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const normalized = cleanString(value) as T;
  return allowed.includes(normalized) ? normalized : fallback;
}

function normalizeProviders(value: unknown): AltumAiProvider[] {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/,|\n|\|/g)
      : [];

  const parsed = Array.from(
    new Set(
      source
        .map((item) => cleanString(item))
        .filter((item): item is AltumAiProvider => PROVIDERS.includes(item as AltumAiProvider))
    )
  );

  return parsed.length ? parsed : [...DEFAULT_AI_PROVIDERS];
}

function normalizePositiveNumber(value: unknown, fallback: number, max: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.min(max, Math.max(1, Math.round(numeric)));
}

function normalizeModelOverride(value: unknown) {
  const normalized = cleanString(value, 120);
  return normalized || undefined;
}

export function normalizeTenantAiOperatingProfile(value: unknown): TenantAiOperatingProfile {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    tier: normalizeEnum(source.tier, ["essential", "growth", "premium", "elite", "enterprise"], "growth"),
    autonomyMode: normalizeEnum(source.autonomyMode, ["copilot", "hybrid", "autonomous"], "hybrid"),
    reasoningLevel: normalizeEnum(source.reasoningLevel, ["fast", "balanced", "deep"], "balanced"),
    responseStyle: normalizeEnum(source.responseStyle, ["concise", "consultative", "premium_sales", "closer"], "consultative"),
    preferredProviders: normalizeProviders(source.preferredProviders),
    conversationModelOverride: normalizeModelOverride(source.conversationModelOverride),
    extractionModelOverride: normalizeModelOverride(source.extractionModelOverride),
    monthlyBudgetUsd: normalizePositiveNumber(source.monthlyBudgetUsd, 100, 100000),
    monthlyUsageCap: normalizePositiveNumber(source.monthlyUsageCap, 1500, 1000000),
  };
}

export function buildAiRuntimePolicy(profile: TenantAiOperatingProfile): TenantAiRuntimePolicy {
  const providers: AltumAiProvider[] = profile.preferredProviders.length
    ? [...profile.preferredProviders]
    : [...DEFAULT_AI_PROVIDERS];
  const primaryProvider = providers[0];
  const fallbackProviders: AltumAiProvider[] = providers.slice(1);

  const conversationModel =
    profile.conversationModelOverride ||
    (primaryProvider === "openai"
      ? "gpt-4.1-mini"
      : primaryProvider === "anthropic"
        ? profile.tier === "elite" || profile.tier === "enterprise"
          ? "claude-opus-4"
          : "claude-sonnet-4"
        : primaryProvider === "gemini"
          ? "gemini-2.5-pro"
          : primaryProvider === "mistral"
            ? "mistral-large"
            : "altum_rules_v1");

  const extractionModel =
    profile.extractionModelOverride ||
    (primaryProvider === "openai"
      ? "gpt-4.1-mini"
      : primaryProvider === "anthropic"
        ? "claude-sonnet-4"
      : primaryProvider === "gemini"
          ? "gemini-2.5-flash"
          : primaryProvider === "mistral"
            ? "mistral-small"
            : "altum_rules_v1");

  const retrievalMode =
    profile.reasoningLevel === "deep" || profile.tier === "elite" || profile.tier === "enterprise"
      ? "semantic"
      : profile.tier === "premium"
        ? "hybrid"
        : "keyword";

  return {
    primaryProvider,
    fallbackProviders,
    conversationModel,
    extractionModel,
    retrievalMode,
    supportsToolCalling: primaryProvider !== "altum_rules",
    supportsDeepReasoning: profile.reasoningLevel === "deep" && primaryProvider !== "altum_rules",
    budgetMode:
      profile.tier === "essential"
        ? "conservative"
        : profile.tier === "premium" || profile.tier === "elite" || profile.tier === "enterprise"
          ? "premium"
          : "balanced",
  };
}
