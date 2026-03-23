import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { normalizeCaptureFields } from "@/lib/capture-form";
import { normalizeCaptureLandingConfig } from "@/lib/capture-landing";
import { normalizePipelineStageId } from "@/lib/pipeline";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";

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

function toBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  return fallback;
}

async function getForm(formId: string, tenantId: string) {
  const formRef = adminDb.collection("capture_forms").doc(formId);
  const formSnap = await formRef.get();
  if (!formSnap.exists) {
    throw new RouteAuthError(404, "form_not_found", "Formulario nao encontrado.");
  }
  const data = formSnap.data() as Record<string, unknown>;
  if (String(data.tenantId || "") !== tenantId) {
    throw new RouteAuthError(403, "forbidden_tenant", "Formulario fora do tenant informado.");
  }
  return { formRef, formSnap, data };
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ tenantId: string; formId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, formId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_settings");

    const { formRef } = await getForm(formId, tenantId);
    const body = (await req.json()) as Body;

    const defaultOwnerId = clean(body.defaultOwnerId, 140);
    let defaultOwnerName: string | null = null;
    if (body.defaultOwnerId !== undefined) {
      if (defaultOwnerId) {
        const membershipSnap = await adminDb.collection("tenant_users").doc(`${tenantId}_${defaultOwnerId}`).get();
        if (!membershipSnap.exists) {
          return NextResponse.json({ error: "Responsavel nao pertence a este tenant." }, { status: 400 });
        }
        defaultOwnerName = String((membershipSnap.data() as { name?: string }).name || "Usuario");
      }
    }

    const patch: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: user.uid,
      updatedByName: user.name,
    };

    if (body.name !== undefined) patch.name = clean(body.name, 140) || "Formulario";
    if (body.description !== undefined) patch.description = clean(body.description, 280);
    if (body.sourceLabel !== undefined) patch.sourceLabel = clean(body.sourceLabel, 120) || "Formulario";
    if (body.defaultPipelineStage !== undefined) {
      patch.defaultPipelineStage = normalizePipelineStageId(body.defaultPipelineStage || "captado");
    }
    if (body.tags !== undefined) patch.tags = cleanTags(body.tags);
    if (body.status !== undefined) patch.status = clean(body.status, 20) || "draft";
    if (body.successMessage !== undefined) {
      patch.successMessage = clean(body.successMessage, 220) || "Lead recebido com sucesso.";
    }
    if (body.submitLabel !== undefined) patch.submitLabel = clean(body.submitLabel, 80) || "Enviar";
    if (body.widgetLauncherLabel !== undefined) {
      patch.widgetLauncherLabel = clean(body.widgetLauncherLabel, 80) || "Abrir chat";
    }
    if (body.widgetGreeting !== undefined) {
      patch.widgetGreeting = clean(body.widgetGreeting, 220) || "Digite sua mensagem para iniciar o atendimento.";
    }
    if (body.requirePhone !== undefined) patch.requirePhone = toBoolean(body.requirePhone, false);
    if (body.requireEmail !== undefined) patch.requireEmail = toBoolean(body.requireEmail, false);
    if (body.collectCompany !== undefined) patch.collectCompany = toBoolean(body.collectCompany, true);
    if (body.collectMessage !== undefined) patch.collectMessage = toBoolean(body.collectMessage, true);
    if (body.fields !== undefined) patch.fields = normalizeCaptureFields(body.fields);
    if (body.landing !== undefined) patch.landing = normalizeCaptureLandingConfig(body.landing);
    if (body.defaultOwnerId !== undefined) {
      patch.defaultOwnerId = defaultOwnerId || null;
      patch.defaultOwnerName = defaultOwnerName;
    }

    await formRef.set(patch, { merge: true });
    return NextResponse.json({ ok: true, tenantId, formId });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao atualizar formulario do tenant:", error);
    return NextResponse.json({ error: "Falha ao atualizar formulario." }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ tenantId: string; formId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, formId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_settings");

    const { formRef } = await getForm(formId, tenantId);
    await formRef.delete();

    return NextResponse.json({ ok: true, tenantId, formId });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao remover formulario do tenant:", error);
    return NextResponse.json({ error: "Falha ao remover formulario." }, { status: 500 });
  }
}
