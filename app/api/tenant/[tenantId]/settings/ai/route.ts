import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, assertTenantRole, TenantAccessError, getTenantSettings } from "@/lib/server/tenant";
import { getBusinessProfile, normalizeBusinessProfileId } from "@/lib/business-profiles";
import {
  buildAiRuntimePolicy,
  normalizeTenantAiOperatingProfile,
  type AltumAiAutonomyMode,
  type AltumAiProvider,
  type AltumAiReasoningLevel,
  type AltumAiResponseStyle,
  type AltumAiTier,
} from "@/lib/server/ai/operating-layer";

type Body = {
  enabled?: boolean;
  responsePaused?: boolean;
  agentName?: string;
  toneOfVoice?: string;
  businessSummary?: string;
  objective?: string;
  responsiblePhone?: string;
  handoffNotifyEnabled?: boolean;
  handoffNotifyPhones?: string[] | string;
  voiceReplyEnabled?: boolean;
  voiceReplyVoice?: string;
  voiceReplyMode?: "audio_only" | "smart" | "always";
  voiceReplyMaxChars?: number;
  guardrails?: string[] | string;
  mandatoryQuestions?: string[] | string;
  escalationTopics?: string[] | string;
  whatsappTemplateFollowUpEnabled?: boolean;
  whatsappTemplateFollowUpName?: string;
  whatsappTemplateFollowUpLanguage?: string;
  whatsappTemplateFollowUpParams?: string[] | string;
  tier?: AltumAiTier;
  autonomyMode?: AltumAiAutonomyMode;
  reasoningLevel?: AltumAiReasoningLevel;
  responseStyle?: AltumAiResponseStyle;
  allowPremiumModels?: boolean;
  preferredProviders?: AltumAiProvider[] | string;
  conversationModelOverride?: string;
  extractionModelOverride?: string;
  monthlyBudgetUsd?: number;
  monthlyUsageCap?: number;
};

function providerStatus() {
  return {
    openai: { ready: Boolean(process.env.OPENAI_API_KEY), label: "OpenAI" },
    anthropic: { ready: Boolean(process.env.ANTHROPIC_API_KEY), label: "Anthropic" },
    gemini: { ready: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY), label: "Gemini" },
    mistral: { ready: Boolean(process.env.MISTRAL_API_KEY), label: "Mistral" },
    altum_rules: { ready: true, label: "ALTUM Rules" },
  } as const;
}

function clean(value: unknown, max = 300) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function parseGuardrails(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => clean(item, 200))
      .filter(Boolean)
      .slice(0, 20);
  }

  if (typeof value === "string") {
    return value
      .split(/\n|\.|;|\|/)
      .map((item) => clean(item, 200))
      .filter(Boolean)
      .slice(0, 20);
  }

  return [] as string[];
}

function parseLines(value: unknown, maxItems = 20) {
  if (Array.isArray(value)) {
    return value
      .map((item) => clean(item, 200))
      .filter(Boolean)
      .slice(0, maxItems);
  }

  if (typeof value === "string") {
    return value
      .split(/\n|;|\|/)
      .map((item) => clean(item, 200))
      .filter(Boolean)
      .slice(0, maxItems);
  }

  return [] as string[];
}

function parseNotifyPhones(value: unknown) {
  return Array.from(new Set(parseLines(value, 8).map((item) => clean(item, 40)).filter(Boolean))).slice(0, 8);
}

function normalizeVoiceReplyMode(value: unknown) {
  const normalized = clean(value, 40).toLowerCase();
  if (normalized === "audio_only" || normalized === "smart" || normalized === "always") return normalized;
  return "smart";
}

function normalizeVoiceReplyMaxChars(value: unknown) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 760;
  return Math.max(260, Math.min(1400, Math.round(numeric)));
}

function pruneUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((item) => pruneUndefinedDeep(item))
      .filter((item) => item !== undefined) as T;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, pruneUndefinedDeep(item)] as const)
      .filter(([, item]) => item !== undefined);
    return Object.fromEntries(entries) as T;
  }

  return value;
}

type NormalizeMode = "resolved" | "stored";

function normalizeAiConfig(
  settings: Awaited<ReturnType<typeof getTenantSettings>>,
  mode: NormalizeMode = "resolved"
) {
  const ai =
    settings && typeof settings.ai === "object" && settings.ai
      ? (settings.ai as Record<string, unknown>)
      : {};
  const businessProfile = getBusinessProfile(normalizeBusinessProfileId(settings?.businessProfileId));
  const operatingProfile = normalizeTenantAiOperatingProfile(ai.operatingProfile);
  const runtimePolicy = buildAiRuntimePolicy(operatingProfile);
  const storedAgentName = clean(ai.agentName, 80);
  const storedToneOfVoice = clean(ai.toneOfVoice, 120);
  const storedBusinessSummary = clean(ai.businessSummary, 320);
  const storedObjective = clean(ai.objective, 200);
  const storedVoiceReplyVoice = clean(ai.voiceReplyVoice, 40);
  const storedGuardrails = parseGuardrails(ai.guardrails);
  const storedMandatoryQuestions = parseLines(ai.mandatoryQuestions, 12);
  const storedEscalationTopics = parseLines(ai.escalationTopics, 12);
  const resolveWithDefaults = mode === "resolved";

  return {
    enabled: ai.enabled !== false,
    responsePaused: ai.responsePaused === true,
    agentName: resolveWithDefaults
      ? storedAgentName || `Agente ${clean(settings?.name, 80) || businessProfile.label}`
      : storedAgentName,
    toneOfVoice: resolveWithDefaults
      ? storedToneOfVoice || businessProfile.ai.toneOfVoice
      : storedToneOfVoice,
    businessSummary: resolveWithDefaults
      ? storedBusinessSummary || clean(settings?.name, 180) || businessProfile.description
      : storedBusinessSummary,
    objective: resolveWithDefaults
      ? storedObjective || businessProfile.ai.objective
      : storedObjective,
    responsiblePhone: clean(ai.responsiblePhone, 40),
    handoffNotifyEnabled: ai.handoffNotifyEnabled !== false,
    handoffNotifyPhones: parseNotifyPhones(ai.handoffNotifyPhones),
    voiceReplyEnabled: ai.voiceReplyEnabled === true,
    voiceReplyVoice: storedVoiceReplyVoice || "alloy",
    voiceReplyMode: normalizeVoiceReplyMode(ai.voiceReplyMode),
    voiceReplyMaxChars: normalizeVoiceReplyMaxChars(ai.voiceReplyMaxChars),
    guardrails: resolveWithDefaults
      ? (storedGuardrails.length ? storedGuardrails : businessProfile.ai.guardrails)
      : storedGuardrails,
    mandatoryQuestions: resolveWithDefaults
      ? (storedMandatoryQuestions.length ? storedMandatoryQuestions : businessProfile.ai.mandatoryQuestions)
      : storedMandatoryQuestions,
    escalationTopics: resolveWithDefaults
      ? (storedEscalationTopics.length ? storedEscalationTopics : businessProfile.ai.escalationTopics)
      : storedEscalationTopics,
    whatsappTemplateFollowUpEnabled: ai.whatsappTemplateFollowUpEnabled !== false,
    whatsappTemplateFollowUpName: clean(ai.whatsappTemplateFollowUpName, 120) || "follow_up_geral",
    whatsappTemplateFollowUpLanguage: clean(ai.whatsappTemplateFollowUpLanguage, 24) || "pt_BR",
    whatsappTemplateFollowUpParams: parseLines(ai.whatsappTemplateFollowUpParams, 12),
    tier: operatingProfile.tier,
    autonomyMode: operatingProfile.autonomyMode,
    reasoningLevel: operatingProfile.reasoningLevel,
    responseStyle: operatingProfile.responseStyle,
    allowPremiumModels: operatingProfile.allowPremiumModels,
    preferredProviders: operatingProfile.preferredProviders,
    conversationModelOverride: operatingProfile.conversationModelOverride || "",
    extractionModelOverride: operatingProfile.extractionModelOverride || "",
    monthlyBudgetUsd: operatingProfile.monthlyBudgetUsd,
    monthlyUsageCap: operatingProfile.monthlyUsageCap,
    runtimePolicy,
    providerStatus: providerStatus(),
  };
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;

    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer");

    const settings = await getTenantSettings(tenantId);
    const ai = normalizeAiConfig(settings);

    return NextResponse.json({ ok: true, tenantId, ai });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }

    console.error("Erro ao carregar configuracao de IA do tenant:", error);
    return NextResponse.json({ error: "Falha ao carregar configuracoes de IA." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;

    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_ai");

    const body = (await req.json()) as Body;
    const current = normalizeAiConfig(await getTenantSettings(tenantId), "stored");

    const next = pruneUndefinedDeep({
      enabled: typeof body.enabled === "boolean" ? body.enabled : current.enabled,
      responsePaused:
        typeof body.responsePaused === "boolean" ? body.responsePaused : current.responsePaused,
      agentName: clean(body.agentName, 80) || current.agentName,
      toneOfVoice: clean(body.toneOfVoice, 120) || current.toneOfVoice,
      businessSummary: clean(body.businessSummary, 320) || current.businessSummary,
      objective: clean(body.objective, 200) || current.objective,
      responsiblePhone: clean(body.responsiblePhone, 40) || current.responsiblePhone,
      handoffNotifyEnabled:
        typeof body.handoffNotifyEnabled === "boolean"
          ? body.handoffNotifyEnabled
          : current.handoffNotifyEnabled,
      handoffNotifyPhones:
        body.handoffNotifyPhones === undefined
          ? current.handoffNotifyPhones
          : parseNotifyPhones(body.handoffNotifyPhones),
      voiceReplyEnabled:
        typeof body.voiceReplyEnabled === "boolean"
          ? body.voiceReplyEnabled
          : current.voiceReplyEnabled,
      voiceReplyVoice: clean(body.voiceReplyVoice, 40) || current.voiceReplyVoice,
      voiceReplyMode:
        body.voiceReplyMode === undefined ? current.voiceReplyMode : normalizeVoiceReplyMode(body.voiceReplyMode),
      voiceReplyMaxChars:
        body.voiceReplyMaxChars === undefined ? current.voiceReplyMaxChars : normalizeVoiceReplyMaxChars(body.voiceReplyMaxChars),
      guardrails:
        body.guardrails === undefined ? current.guardrails : parseGuardrails(body.guardrails),
      mandatoryQuestions:
        body.mandatoryQuestions === undefined
          ? current.mandatoryQuestions
          : parseLines(body.mandatoryQuestions, 12),
      escalationTopics:
        body.escalationTopics === undefined
          ? current.escalationTopics
          : parseLines(body.escalationTopics, 12),
      whatsappTemplateFollowUpEnabled:
        typeof body.whatsappTemplateFollowUpEnabled === "boolean"
          ? body.whatsappTemplateFollowUpEnabled
          : current.whatsappTemplateFollowUpEnabled,
      whatsappTemplateFollowUpName:
        clean(body.whatsappTemplateFollowUpName, 120) || current.whatsappTemplateFollowUpName,
      whatsappTemplateFollowUpLanguage:
        clean(body.whatsappTemplateFollowUpLanguage, 24) || current.whatsappTemplateFollowUpLanguage,
      whatsappTemplateFollowUpParams:
        body.whatsappTemplateFollowUpParams === undefined
          ? current.whatsappTemplateFollowUpParams
          : parseLines(body.whatsappTemplateFollowUpParams, 12),
      operatingProfile: normalizeTenantAiOperatingProfile({
        tier: body.tier ?? current.tier,
        autonomyMode: body.autonomyMode ?? current.autonomyMode,
        reasoningLevel: body.reasoningLevel ?? current.reasoningLevel,
        responseStyle: body.responseStyle ?? current.responseStyle,
        allowPremiumModels: body.allowPremiumModels ?? current.allowPremiumModels,
        preferredProviders: body.preferredProviders ?? current.preferredProviders,
        conversationModelOverride: body.conversationModelOverride ?? current.conversationModelOverride,
        extractionModelOverride: body.extractionModelOverride ?? current.extractionModelOverride,
        monthlyBudgetUsd: body.monthlyBudgetUsd ?? current.monthlyBudgetUsd,
        monthlyUsageCap: body.monthlyUsageCap ?? current.monthlyUsageCap,
      }),
    });

    const responseAi = {
      ...next,
      ...next.operatingProfile,
      runtimePolicy: buildAiRuntimePolicy(next.operatingProfile),
    };

    await adminDb.collection("tenant_settings").doc(tenantId).set(
      {
        tenantId,
        ai: next,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.name,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, tenantId, ai: responseAi });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }

    console.error("Erro ao salvar configuracao de IA do tenant:", error);
    return NextResponse.json({ error: "Falha ao salvar configuracoes de IA." }, { status: 500 });
  }
}
