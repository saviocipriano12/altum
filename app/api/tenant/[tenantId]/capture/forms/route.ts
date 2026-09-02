import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { normalizeCaptureFields } from "@/lib/capture-form";
import { normalizeCaptureLandingConfig } from "@/lib/capture-landing";
import { normalizePipelineStageId } from "@/lib/pipeline";
import { assertTenantAccess, assertTenantCapability, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";

type Body = {
  name?: string;
  description?: string;
  sourceLabel?: string;
  defaultPipelineStage?: string;
  defaultOwnerId?: string | null;
  tags?: string[] | string;
  status?: "draft" | "active" | "inactive";
  successMessage?: string;
  submitLabel?: string;
  widgetLauncherLabel?: string;
  widgetGreeting?: string;
  requirePhone?: boolean;
  requireEmail?: boolean;
  collectCompany?: boolean;
  collectMessage?: boolean;
  fields?: unknown;
  landing?: unknown;
};

function clean(value: unknown, max = 220) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function cleanTags(value: unknown) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return Array.from(
    new Set(
      source
        .map((item) => clean(item, 32).toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, 8);
}

function toIso(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return new Date((value as { _seconds: number })._seconds * 1000).toISOString();
  }
  return null;
}

function toBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  return fallback;
}

function countByKey<T extends string>(items: T[]) {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = item || "nao_informado";
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "marketing");
    assertTenantRole(membership, "client_viewer");

    const [formsSnap, submissionsSnap] = await Promise.all([
      adminDb.collection("capture_forms").where("tenantId", "==", tenantId).limit(80).get(),
      adminDb.collection("capture_submissions").where("tenantId", "==", tenantId).limit(80).get(),
    ]);

    const forms = formsSnap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          tenantId,
          name: String(data.name || "Formulario"),
          description: String(data.description || ""),
          sourceLabel: String(data.sourceLabel || "Formulario"),
          defaultPipelineStage: normalizePipelineStageId(data.defaultPipelineStage || "captado"),
          defaultOwnerId: String(data.defaultOwnerId || ""),
          defaultOwnerName: String(data.defaultOwnerName || ""),
          tags: cleanTags(data.tags),
          status: String(data.status || "draft"),
          successMessage: String(data.successMessage || "Lead recebido com sucesso."),
          submitLabel: String(data.submitLabel || "Enviar"),
          widgetLauncherLabel: String(data.widgetLauncherLabel || "Abrir chat"),
          widgetGreeting: String(data.widgetGreeting || "Digite sua mensagem para iniciar o atendimento."),
          requirePhone: toBoolean(data.requirePhone, false),
          requireEmail: toBoolean(data.requireEmail, false),
          collectCompany: toBoolean(data.collectCompany, true),
          collectMessage: toBoolean(data.collectMessage, true),
          fields: normalizeCaptureFields(data.fields),
          landing: normalizeCaptureLandingConfig(data.landing),
          submissionsCount: Number(data.submissionsCount || 0),
          lastSubmissionAt: toIso(data.lastSubmissionAt),
          updatedAt: toIso(data.updatedAt),
        };
      })
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

    const recentSubmissions = submissionsSnap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          formId: String(data.formId || ""),
          formName: String(data.formName || "Formulario"),
          leadId: String(data.leadId || ""),
          leadName: String(data.leadName || "Lead"),
          phone: String(data.phone || ""),
          email: String(data.email || ""),
          sourceLabel: String(data.sourceLabel || "Formulario"),
          utmSource: String(data.utmSource || ""),
          utmMedium: String(data.utmMedium || ""),
          utmCampaign: String(data.utmCampaign || ""),
          createdAt: toIso(data.createdAt),
        };
      })
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, 18);

    const rawSubmissions = submissionsSnap.docs.map((doc) => doc.data() as Record<string, unknown>);
    const topSources = countByKey(
      rawSubmissions.map((item) => String(item.utmSource || item.sourceLabel || "nao_informado").trim().toLowerCase())
    );
    const topCampaigns = countByKey(
      rawSubmissions
        .map((item) => String(item.utmCampaign || "").trim().toLowerCase())
        .filter(Boolean)
    );
    const formPerformance = forms
      .map((form) => ({
        id: form.id,
        name: form.name,
        total: Number(form.submissionsCount || 0),
        lastSubmissionAt: form.lastSubmissionAt,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    return NextResponse.json({
      ok: true,
      tenantId,
      forms,
      recentSubmissions,
      topSources,
      topCampaigns,
      formPerformance,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao carregar formularios do tenant:", error);
    return NextResponse.json({ error: "Falha ao carregar formularios." }, { status: 500 });
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
    await assertTenantModule(tenantId, "marketing");
    assertTenantCapability(membership, "manage_settings");

    const body = (await req.json()) as Body;
    const name = clean(body.name, 140);

    if (!name) {
      return NextResponse.json({ error: "Campo obrigatorio: name." }, { status: 400 });
    }

    const defaultOwnerId = clean(body.defaultOwnerId, 140);
    let defaultOwnerName = "";
    if (defaultOwnerId) {
      const membershipSnap = await adminDb.collection("tenant_users").doc(`${tenantId}_${defaultOwnerId}`).get();
      if (!membershipSnap.exists) {
        return NextResponse.json({ error: "Responsavel nao pertence a este tenant." }, { status: 400 });
      }
      defaultOwnerName = String((membershipSnap.data() as { name?: string }).name || "Usuario");
    }

    const formRef = adminDb.collection("capture_forms").doc();
    await formRef.set({
      tenantId,
      name,
      description: clean(body.description, 280),
      sourceLabel: clean(body.sourceLabel, 120) || "Formulario",
      defaultPipelineStage: normalizePipelineStageId(body.defaultPipelineStage || "captado"),
      defaultOwnerId: defaultOwnerId || null,
      defaultOwnerName: defaultOwnerName || null,
      tags: cleanTags(body.tags),
      status: clean(body.status, 20) || "draft",
      successMessage: clean(body.successMessage, 220) || "Lead recebido com sucesso.",
      submitLabel: clean(body.submitLabel, 80) || "Enviar",
      widgetLauncherLabel: clean(body.widgetLauncherLabel, 80) || "Abrir chat",
      widgetGreeting: clean(body.widgetGreeting, 220) || "Digite sua mensagem para iniciar o atendimento.",
      requirePhone: toBoolean(body.requirePhone, false),
      requireEmail: toBoolean(body.requireEmail, false),
      collectCompany: toBoolean(body.collectCompany, true),
      collectMessage: toBoolean(body.collectMessage, true),
      fields: normalizeCaptureFields(body.fields),
      landing: normalizeCaptureLandingConfig(body.landing),
      submissionsCount: 0,
      lastSubmissionAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: user.uid,
      updatedByName: user.name,
    });

    return NextResponse.json({ ok: true, tenantId, formId: formRef.id });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao criar formulario do tenant:", error);
    return NextResponse.json({ error: "Falha ao criar formulario." }, { status: 500 });
  }
}
