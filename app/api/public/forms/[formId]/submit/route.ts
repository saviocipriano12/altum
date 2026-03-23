import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import {
  isCaptureFieldVisible,
  normalizeCaptureFields,
  normalizeCaptureFieldValue,
} from "@/lib/capture-form";
import { recordInboundLead } from "@/lib/server/lead-intake";

type Body = {
  nome?: string;
  email?: string;
  telefone?: string;
  empresa?: string;
  mensagem?: string;
  customFields?: Record<string, unknown>;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
};

type CustomFieldMap = Record<string, string | number | boolean>;

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(
  req: Request,
  context: { params: Promise<{ formId: string }> }
) {
  try {
    const { formId } = await context.params;
    const body = (await req.json()) as Body;

    const formSnap = await adminDb.collection("capture_forms").doc(formId).get();
    if (!formSnap.exists) {
      return NextResponse.json({ error: "Formulario nao encontrado." }, { status: 404 });
    }

    const form = formSnap.data() as Record<string, unknown>;
    if (String(form.status || "draft") !== "active") {
      return NextResponse.json({ error: "Formulario indisponivel no momento." }, { status: 403 });
    }

    const fields = normalizeCaptureFields(form.fields);
    const tenantId = clean(form.tenantId, 140);
    if (!tenantId) {
      return NextResponse.json({ error: "Formulario sem tenant vinculado." }, { status: 400 });
    }

    const nome = clean(body.nome, 180);
    const email = clean(body.email, 180).toLowerCase();
    const telefone = clean(body.telefone, 40);
    const empresa = clean(body.empresa, 180);
    const mensagem = clean(body.mensagem, 4000);
    const utmSource = clean(body.utmSource, 120).toLowerCase();
    const utmMedium = clean(body.utmMedium, 120).toLowerCase();
    const utmCampaign = clean(body.utmCampaign, 120).toLowerCase();

    const customFieldEntries = fields
      .map((field) => [field.id, normalizeCaptureFieldValue(field, body.customFields?.[field.id])] as const)
      .filter(
        (
          entry
        ): entry is readonly [string, string | number | boolean] => entry[1] !== null
      );
    const customFieldValues: CustomFieldMap = Object.fromEntries(customFieldEntries);

    const missingRequiredField = fields.find((field) => {
      if (!field.required) return false;
      if (!isCaptureFieldVisible(field, customFieldValues)) return false;
      const value = customFieldValues[field.id];
      return value === undefined || value === null || value === "";
    });

    if (missingRequiredField) {
      return NextResponse.json(
        { error: `Campo obrigatorio: ${missingRequiredField.label}.` },
        { status: 400 }
      );
    }

    if (!nome && !email && !telefone) {
      return NextResponse.json(
        { error: "Informe nome, telefone ou email para enviar o formulario." },
        { status: 400 }
      );
    }

    const lead = await recordInboundLead({
      tenantId,
      sourceType: "capture_form",
      sourceId: formId,
      sourceLabel: clean(form.sourceLabel, 120) || "Formulario",
      channel: "site_form",
      nome,
      email,
      telefone,
      empresa,
      mensagem,
      customFields: customFieldValues,
      tags: [...(Array.isArray(form.tags) ? form.tags : []), "captacao_formulario"],
      defaultOwnerId: clean(form.defaultOwnerId, 140) || null,
      defaultOwnerName: clean(form.defaultOwnerName, 140) || null,
      defaultPipelineStage: clean(form.defaultPipelineStage, 80) || "captado",
      attribution: {
        source: utmSource || clean(form.sourceLabel, 120) || "formulario",
        medium: utmMedium || "form",
        campaign: utmCampaign || "",
        formId,
        formName: clean(form.name, 140) || "Formulario",
      },
      submission: {
        formId,
        formName: clean(form.name, 140) || "Formulario",
        sourceLabel: clean(form.sourceLabel, 120) || "Formulario",
        utmSource,
        utmMedium,
        utmCampaign,
      },
      automationActorId: "altum_capture_form",
      automationActorName: "ALTUM Capture",
    });

    await formSnap.ref.set(
      {
        submissionsCount: FieldValue.increment(1),
        lastSubmissionAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      formId,
      leadId: lead.leadId,
      message: clean(form.successMessage, 220) || "Lead recebido com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao processar formulario publico:", error);
    return NextResponse.json({ error: "Falha ao enviar formulario." }, { status: 500 });
  }
}
