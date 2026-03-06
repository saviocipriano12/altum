import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, TenantAccessError, getTenantSettings } from "@/lib/server/tenant";

type Body = {
  enabled?: boolean;
  toneOfVoice?: string;
  businessSummary?: string;
  responsiblePhone?: string;
  guardrails?: string[] | string;
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

function normalizeAiConfig(settings: Awaited<ReturnType<typeof getTenantSettings>>) {
  const ai =
    settings && typeof settings.ai === "object" && settings.ai
      ? (settings.ai as Record<string, unknown>)
      : {};

  return {
    enabled: ai.enabled !== false,
    toneOfVoice: clean(ai.toneOfVoice, 120) || "consultivo e objetivo",
    businessSummary: clean(ai.businessSummary, 320),
    responsiblePhone: clean(ai.responsiblePhone, 40),
    guardrails: parseGuardrails(ai.guardrails),
  };
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;

    await assertTenantAccess(user.uid, tenantId);

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

    await assertTenantAccess(user.uid, tenantId);

    const body = (await req.json()) as Body;
    const current = normalizeAiConfig(await getTenantSettings(tenantId));

    const next = {
      enabled: typeof body.enabled === "boolean" ? body.enabled : current.enabled,
      toneOfVoice: clean(body.toneOfVoice, 120) || current.toneOfVoice,
      businessSummary: clean(body.businessSummary, 320) || current.businessSummary,
      responsiblePhone: clean(body.responsiblePhone, 40) || current.responsiblePhone,
      guardrails:
        body.guardrails === undefined ? current.guardrails : parseGuardrails(body.guardrails),
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

    return NextResponse.json({ ok: true, tenantId, ai: next });
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