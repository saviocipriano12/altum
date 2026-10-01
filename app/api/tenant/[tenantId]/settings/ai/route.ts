import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, assertTenantRole, hasTenantCapability, TenantAccessError, getTenantSettings } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { getBusinessProfile, normalizeBusinessProfileId } from "@/lib/business-profiles";
import { normalizeAltumAssistantRole, type AltumAssistantRole } from "@/lib/ai-assistant-role";
import { normalizeAiConversationRollout, type AiConversationRolloutMode } from "@/lib/ai-conversation-rollout";
import {
  canIncreaseAiConversationRollout,
  isAiEvaluationFreshForSettings,
  type AiRolloutQualityGate,
} from "@/lib/ai-rollout-quality-gate";
import {
  buildAiRuntimePolicy,
  normalizeTenantAiOperatingProfile,
  type AltumAiAutonomyMode,
  type AltumAiProvider,
  type AltumAiReasoningLevel,
  type AltumAiResponseStyle,
  type AltumAiTier,
} from "@/lib/server/ai/operating-layer";
import { deriveHandoffTopicsFromCommercialCriteria } from "@/lib/server/ai/tenant-context";

type Body = {
  enabled?: boolean;
  responsePaused?: boolean;
  agentName?: string;
  assistantRole?: AltumAssistantRole;
  toneOfVoice?: string;
  businessSummary?: string;
  objective?: string;
  commercialBrain?: CommercialBrainInput;
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
  rolloutMode?: AiConversationRolloutMode;
  rolloutPercent?: number;
  agentVersion?: string;
};

type CommercialBrainInput = {
  businessModel?: string;
  idealCustomer?: string;
  revenuePriorities?: string;
  diagnosisStyle?: string;
  customSolutionPolicy?: string;
  handoffCriteria?: string;
  proposalStyle?: string;
  followUpStrategy?: string;
  forbiddenSalesMoves?: string;
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

function normalizeCommercialBrain(value: unknown, fallback?: CommercialBrainInput) {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const resolve = (key: keyof CommercialBrainInput) =>
    Object.prototype.hasOwnProperty.call(source, key)
      ? clean(source[key], 420)
      : clean(fallback?.[key], 420);
  return {
    businessModel: resolve("businessModel"),
    idealCustomer: resolve("idealCustomer"),
    revenuePriorities: resolve("revenuePriorities"),
    diagnosisStyle: resolve("diagnosisStyle"),
    customSolutionPolicy: resolve("customSolutionPolicy"),
    handoffCriteria: resolve("handoffCriteria"),
    proposalStyle: resolve("proposalStyle"),
    followUpStrategy: resolve("followUpStrategy"),
    forbiddenSalesMoves: resolve("forbiddenSalesMoves"),
  };
}

function normalizeVoiceReplyMode(value: unknown) {
  const normalized = clean(value, 40).toLowerCase();
  if (normalized === "audio_only" || normalized === "smart" || normalized === "always") return normalized;
  return "smart";
}

function normalizeVoiceReplyMaxChars(value: unknown) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 460;
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

function timestampMillis(value: unknown) {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (value && typeof value === "object" && "_seconds" in value && typeof (value as { _seconds?: unknown })._seconds === "number") {
    return (value as { _seconds: number })._seconds * 1000;
  }
  return 0;
}

async function getLatestAiEvaluationGate(tenantId: string) {
  const snapshot = await adminDb
    .collection("ai_evaluation_runs")
    .where("tenantId", "==", tenantId)
    .orderBy("createdAt", "desc")
    .limit(30)
    .get();
  const latest = snapshot.docs
    .map((doc) => ({ id: doc.id, data: doc.data() as Record<string, unknown> }))
    .sort((left, right) => timestampMillis(right.data.createdAt) - timestampMillis(left.data.createdAt))[0];
  const summary = latest?.data.summary && typeof latest.data.summary === "object" ? latest.data.summary as Record<string, unknown> : null;
  const rawGate = clean(summary?.gate, 20);
  const gate: AiRolloutQualityGate = rawGate === "ready" || rawGate === "watch" || rawGate === "blocked" ? rawGate : null;
  return {
    gate,
    evaluatedAt: latest?.data.createdAt || null,
    scenarioVersion: clean(latest?.data.scenarioVersion, 40) || null,
  };
}

type AiEvaluationGate = Awaited<ReturnType<typeof getLatestAiEvaluationGate>>;

// O status de qualidade orienta o rollout, mas nao e requisito para abrir a
// operacao. Se um indice estiver sendo criado ou o Firestore oscilar, a Inbox
// continua acessivel e aumentos de rollout seguem bloqueados no POST.
async function getLatestAiEvaluationGateForRead(tenantId: string) {
  try {
    return { ...(await getLatestAiEvaluationGate(tenantId)), available: true };
  } catch (error) {
    console.warn("Status de qualidade da IA indisponivel ao carregar configuracoes:", { tenantId, error });
    return {
      gate: null,
      evaluatedAt: null,
      scenarioVersion: null,
      available: false,
    } satisfies AiEvaluationGate & { available: boolean };
  }
}

function isEvaluationFreshForSettings(evaluation: Awaited<ReturnType<typeof getLatestAiEvaluationGate>>, settings: Awaited<ReturnType<typeof getTenantSettings>>) {
  return isAiEvaluationFreshForSettings({
    settingsUpdatedAtMs: timestampMillis((settings as Record<string, unknown> | null)?.updatedAt),
    evaluatedAtMs: timestampMillis(evaluation.evaluatedAt),
  });
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
  const blueprintRoot = settings?.businessBlueprint && typeof settings.businessBlueprint === "object"
    ? settings.businessBlueprint as Record<string, unknown>
    : {};
  const activeBlueprint = blueprintRoot.active && typeof blueprintRoot.active === "object"
    ? blueprintRoot.active as Record<string, unknown>
    : {};
  const blueprintAiPolicy = activeBlueprint.aiPolicy && typeof activeBlueprint.aiPolicy === "object"
    ? activeBlueprint.aiPolicy as Record<string, unknown>
    : {};
  const blueprintToneOfVoice = clean(blueprintAiPolicy.toneOfVoice, 120);
  const blueprintSummary = clean(activeBlueprint.description || activeBlueprint.summary, 2000);
  const blueprintGuardrails = parseGuardrails(blueprintAiPolicy.guardrails);
  const blueprintHandoffTopics = parseLines(blueprintAiPolicy.handoffWhen, 12);
  const operatingProfile = normalizeTenantAiOperatingProfile(ai.operatingProfile);
  const rollout = normalizeAiConversationRollout(ai.rollout);
  const runtimePolicy = buildAiRuntimePolicy(operatingProfile);
  const storedAgentName = clean(ai.agentName, 80);
  const storedToneOfVoice = clean(ai.toneOfVoice, 120);
  const storedBusinessSummary = clean(ai.businessSummary, 2000);
  const storedObjective = clean(ai.objective, 800);
  const storedCommercialBrain = normalizeCommercialBrain(ai.commercialBrain);
  const storedVoiceReplyVoice = clean(ai.voiceReplyVoice, 40);
  const storedGuardrails = parseGuardrails(ai.guardrails);
  const storedMandatoryQuestions = parseLines(ai.mandatoryQuestions, 20);
  const storedEscalationTopics = parseLines(ai.escalationTopics, 12);
  const resolveWithDefaults = mode === "resolved";

  return {
    enabled: ai.enabled !== false,
    responsePaused: ai.responsePaused === true,
    agentName: resolveWithDefaults
      ? storedAgentName || `Agente ${clean(settings?.name, 80) || businessProfile.label}`
      : storedAgentName,
    assistantRole: normalizeAltumAssistantRole(ai.assistantRole),
    toneOfVoice: resolveWithDefaults
      ? storedToneOfVoice || blueprintToneOfVoice || businessProfile.ai.toneOfVoice
      : storedToneOfVoice,
    businessSummary: resolveWithDefaults
      ? storedBusinessSummary || blueprintSummary || clean(settings?.name, 180) || businessProfile.description
      : storedBusinessSummary,
    objective: resolveWithDefaults
      ? storedObjective || businessProfile.ai.objective
      : storedObjective,
    commercialBrain: storedCommercialBrain,
    responsiblePhone: resolveWithDefaults
      ? clean(ai.responsiblePhone, 40) || clean(settings?.responsiblePhone || settings?.ownerPhone || settings?.adminPhone, 40)
      : clean(ai.responsiblePhone, 40),
    handoffNotifyEnabled: ai.handoffNotifyEnabled !== false,
    handoffNotifyPhones: parseNotifyPhones(ai.handoffNotifyPhones),
    voiceReplyEnabled: ai.voiceReplyEnabled === true,
    voiceReplyVoice: storedVoiceReplyVoice || "marin",
    voiceReplyMode: normalizeVoiceReplyMode(ai.voiceReplyMode),
    voiceReplyMaxChars: normalizeVoiceReplyMaxChars(ai.voiceReplyMaxChars),
    guardrails: resolveWithDefaults
      ? Array.from(new Set([
          ...blueprintGuardrails,
          ...parseGuardrails(storedCommercialBrain.forbiddenSalesMoves),
          ...(storedGuardrails.length ? storedGuardrails : businessProfile.ai.guardrails),
        ])).slice(0, 20)
      : storedGuardrails,
    mandatoryQuestions: resolveWithDefaults
      ? (storedMandatoryQuestions.length ? storedMandatoryQuestions : businessProfile.ai.mandatoryQuestions)
      : storedMandatoryQuestions,
    escalationTopics: resolveWithDefaults
      ? Array.from(new Set([
          ...blueprintHandoffTopics,
          ...deriveHandoffTopicsFromCommercialCriteria(storedCommercialBrain.handoffCriteria),
          ...(storedEscalationTopics.length ? storedEscalationTopics : businessProfile.ai.escalationTopics),
        ])).slice(0, 12)
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
    rolloutMode: rollout.mode,
    rolloutPercent: rollout.rolloutPercent,
    agentVersion: rollout.agentVersion,
    runtimePolicy,
    providerStatus: providerStatus(),
  };
}

function publicAiConfig(ai: ReturnType<typeof normalizeAiConfig>) {
  return {
    enabled: ai.enabled,
    responsePaused: ai.responsePaused,
    agentName: ai.agentName,
    assistantRole: ai.assistantRole,
    toneOfVoice: ai.toneOfVoice,
    businessSummary: ai.businessSummary,
    objective: ai.objective,
    responsiblePhone: ai.responsiblePhone,
    handoffNotifyEnabled: ai.handoffNotifyEnabled,
    voiceReplyEnabled: ai.voiceReplyEnabled,
    voiceReplyMode: ai.voiceReplyMode,
    guardrailsCount: ai.guardrails.length,
    mandatoryQuestionsCount: ai.mandatoryQuestions.length,
    escalationTopicsCount: ai.escalationTopics.length,
    tier: ai.tier,
    autonomyMode: ai.autonomyMode,
    responseStyle: ai.responseStyle,
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
    await assertTenantModule(tenantId, "ai");
    assertTenantRole(membership, "client_viewer");

    const [settings, rolloutQuality] = await Promise.all([
      getTenantSettings(tenantId),
      getLatestAiEvaluationGateForRead(tenantId),
    ]);
    const rawAi = {
      ...normalizeAiConfig(settings),
      rolloutQuality: {
        ...rolloutQuality,
        fresh: rolloutQuality.available && isEvaluationFreshForSettings(rolloutQuality, settings),
      },
    };
    const ai = hasTenantCapability(membership, "manage_ai") ? rawAi : publicAiConfig(rawAi);

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
    await assertTenantModule(tenantId, "ai");
    assertTenantCapability(membership, "manage_ai");

    const body = (await req.json()) as Body;
    const currentSettings = await getTenantSettings(tenantId);
    const current = normalizeAiConfig(currentSettings, "stored");
    const requestedRollout = normalizeAiConversationRollout({
      mode: body.rolloutMode ?? current.rolloutMode,
      rolloutPercent: body.rolloutPercent ?? current.rolloutPercent,
      agentVersion: body.agentVersion ?? current.agentVersion,
    });
    const latestEvaluation = await getLatestAiEvaluationGate(tenantId);
    const rolloutGate = canIncreaseAiConversationRollout({
      currentPercent: current.rolloutPercent,
      nextPercent: requestedRollout.rolloutPercent,
      mode: requestedRollout.mode,
      latestQualityGate: isEvaluationFreshForSettings(latestEvaluation, currentSettings)
        ? latestEvaluation.gate
        : null,
    });
    if (!rolloutGate.allowed) {
      return NextResponse.json(
        {
          error: "Execute a bateria de qualidade e obtenha o status Pronto antes de aumentar o percentual de respostas automaticas.",
          code: rolloutGate.reason,
        },
        { status: 409 }
      );
    }

    const next = pruneUndefinedDeep({
      enabled: typeof body.enabled === "boolean" ? body.enabled : current.enabled,
      responsePaused:
        typeof body.responsePaused === "boolean" ? body.responsePaused : current.responsePaused,
      agentName: body.agentName === undefined ? current.agentName : clean(body.agentName, 80),
      assistantRole:
        body.assistantRole === undefined
          ? current.assistantRole
          : normalizeAltumAssistantRole(body.assistantRole),
      toneOfVoice: body.toneOfVoice === undefined ? current.toneOfVoice : clean(body.toneOfVoice, 120),
      businessSummary: body.businessSummary === undefined ? current.businessSummary : clean(body.businessSummary, 2000),
      objective: body.objective === undefined ? current.objective : clean(body.objective, 800),
      commercialBrain:
        body.commercialBrain === undefined
          ? normalizeCommercialBrain(current.commercialBrain)
          : normalizeCommercialBrain(body.commercialBrain, current.commercialBrain),
      responsiblePhone: body.responsiblePhone === undefined ? current.responsiblePhone : clean(body.responsiblePhone, 40),
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
          : parseLines(body.mandatoryQuestions, 20),
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
      rollout: requestedRollout,
    });

    // Devolvemos a configuracao resolvida (incluindo Blueprint ativo e
    // defaults do segmento), igual ao que o agente recebe no runtime. Assim a
    // tela nao mostra campos vazios ou defaults diferentes logo apos salvar.
    const responseAi = normalizeAiConfig(
      { ...(currentSettings || {}), ai: next } as Awaited<ReturnType<typeof getTenantSettings>>
    );

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
