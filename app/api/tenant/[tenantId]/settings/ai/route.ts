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
  toneOfVoice?: string;
  businessSummary?: string;
  objective?: string;
  responsiblePhone?: string;
  guardrails?: string[] | string;
  mandatoryQuestions?: string[] | string;
  escalationTopics?: string[] | string;
  tier?: AltumAiTier;
  autonomyMode?: AltumAiAutonomyMode;
  reasoningLevel?: AltumAiReasoningLevel;
  responseStyle?: AltumAiResponseStyle;
  preferredProviders?: AltumAiProvider[] | string;
  conversationModelOverride?: string;
  extractionModelOverride?: string;
  monthlyBudgetUsd?: number;
  monthlyUsageCap?: number;
};

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

function normalizeAiConfig(settings: Awaited<ReturnType<typeof getTenantSettings>>) {
  const ai =
    settings && typeof settings.ai === "object" && settings.ai
      ? (settings.ai as Record<string, unknown>)
      : {};
  const businessProfile = getBusinessProfile(normalizeBusinessProfileId(settings?.businessProfileId));
  const operatingProfile = normalizeTenantAiOperatingProfile(ai.operatingProfile);
  const runtimePolicy = buildAiRuntimePolicy(operatingProfile);

  return {
    enabled: ai.enabled !== false,
    toneOfVoice: clean(ai.toneOfVoice, 120) || businessProfile.ai.toneOfVoice,
    businessSummary: clean(ai.businessSummary, 320) || clean(settings?.name, 180) || businessProfile.description,
    objective: clean(ai.objective, 200) || businessProfile.ai.objective,
    responsiblePhone: clean(ai.responsiblePhone, 40),
    guardrails: Array.from(new Set([...businessProfile.ai.guardrails, ...parseGuardrails(ai.guardrails)])).slice(0, 20),
    mandatoryQuestions: Array.from(new Set([...businessProfile.ai.mandatoryQuestions, ...parseLines(ai.mandatoryQuestions, 12)])).slice(0, 12),
    escalationTopics: Array.from(new Set([...businessProfile.ai.escalationTopics, ...parseLines(ai.escalationTopics, 12)])).slice(0, 12),
    tier: operatingProfile.tier,
    autonomyMode: operatingProfile.autonomyMode,
    reasoningLevel: operatingProfile.reasoningLevel,
    responseStyle: operatingProfile.responseStyle,
    preferredProviders: operatingProfile.preferredProviders,
    conversationModelOverride: operatingProfile.conversationModelOverride || "",
    extractionModelOverride: operatingProfile.extractionModelOverride || "",
    monthlyBudgetUsd: operatingProfile.monthlyBudgetUsd,
    monthlyUsageCap: operatingProfile.monthlyUsageCap,
    runtimePolicy,
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
    const current = normalizeAiConfig(await getTenantSettings(tenantId));

    const next = {
      enabled: typeof body.enabled === "boolean" ? body.enabled : current.enabled,
      toneOfVoice: clean(body.toneOfVoice, 120) || current.toneOfVoice,
      businessSummary: clean(body.businessSummary, 320) || current.businessSummary,
      objective: clean(body.objective, 200) || current.objective,
      responsiblePhone: clean(body.responsiblePhone, 40) || current.responsiblePhone,
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
      operatingProfile: normalizeTenantAiOperatingProfile({
        tier: body.tier ?? current.tier,
        autonomyMode: body.autonomyMode ?? current.autonomyMode,
        reasoningLevel: body.reasoningLevel ?? current.reasoningLevel,
        responseStyle: body.responseStyle ?? current.responseStyle,
        preferredProviders: body.preferredProviders ?? current.preferredProviders,
        conversationModelOverride: body.conversationModelOverride ?? current.conversationModelOverride,
        extractionModelOverride: body.extractionModelOverride ?? current.extractionModelOverride,
        monthlyBudgetUsd: body.monthlyBudgetUsd ?? current.monthlyBudgetUsd,
        monthlyUsageCap: body.monthlyUsageCap ?? current.monthlyUsageCap,
      }),
    };

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
