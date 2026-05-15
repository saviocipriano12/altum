import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, hasTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { normalizePipelineStageId } from "@/lib/pipeline";
import { syncLeadCommercialState } from "@/lib/server/crm/operations";
import { runPipelineStageSideEffects } from "@/lib/server/crm/stage-effects";

type Body = {
  stage?: string;
  status?: string;
  force?: boolean;
};

function clean(value: unknown, max = 80) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function hasMeaningfulText(value: unknown, min = 3) {
  return clean(value, 500).length >= min;
}

function hasAnyContextSignal(lead: Record<string, unknown>) {
  const customFields =
    lead.customFields && typeof lead.customFields === "object"
      ? (lead.customFields as Record<string, unknown>)
      : {};

  return Boolean(
    hasMeaningfulText(lead.notes, 12) ||
      hasMeaningfulText(lead.mensagem, 12) ||
      hasMeaningfulText(lead.aiLeadSummary, 12) ||
      hasMeaningfulText(customFields.objetivo_principal, 6) ||
      hasMeaningfulText(customFields.servico_interesse, 6) ||
      hasMeaningfulText(customFields.orcamento, 1) ||
      hasMeaningfulText(customFields.urgencia, 1)
  );
}

function validateStageContext(input: {
  targetStage: string;
  lead: Record<string, unknown>;
}) {
  const stage = normalizePipelineStageId(input.targetStage);
  const lead = input.lead;
  const missingFields: string[] = [];

  const hasName = hasMeaningfulText(lead.nome, 2);
  const hasContact = hasMeaningfulText(lead.telefone, 6) || hasMeaningfulText(lead.email, 6);
  const hasCompany = hasMeaningfulText(lead.empresa, 2);
  const hasContext = hasAnyContextSignal(lead);

  if (["qualificacao", "proposta", "fechamento", "ganho"].includes(stage)) {
    if (!hasName) missingFields.push("nome");
    if (!hasContact) missingFields.push("telefone_ou_email");
  }

  if (["proposta", "fechamento", "ganho"].includes(stage)) {
    if (!hasCompany) missingFields.push("empresa");
    if (!hasContext) missingFields.push("contexto_comercial_minimo");
  }

  return {
    ok: missingFields.length === 0,
    missingFields,
  };
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string; leadId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, leadId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    if (!hasTenantCapability(membership, "manage_pipeline") && !hasTenantCapability(membership, "edit_leads")) {
      throw new TenantAccessError("tenant_capability_denied", "Perfil sem capacidade para mover o lead no funil.");
    }

    const body = (await req.json()) as Body;
    const stage = normalizePipelineStageId(clean(body.stage, 80) || "captado");
    const status = clean(body.status, 80);

    if (!stage) {
      return NextResponse.json({ error: "Campo obrigatorio: stage." }, { status: 400 });
    }

    const leadRef = adminDb.collection("leads").doc(leadId);
    const leadSnap = await leadRef.get();
    if (!leadSnap.exists) {
      return NextResponse.json({ error: "Lead nao encontrado." }, { status: 404 });
    }

    const leadData = leadSnap.data() as Record<string, unknown>;
    if ((leadData.tenantId || "") !== tenantId) {
      return NextResponse.json({ error: "Lead fora do tenant informado." }, { status: 403 });
    }
    const forceStageMove = body.force === true;
    const stageValidation = validateStageContext({
      targetStage: stage,
      lead: leadData,
    });

    if (!stageValidation.ok && !forceStageMove) {
      return NextResponse.json(
        {
          error: "Bloqueado: contexto minimo insuficiente para avancar stage.",
          code: "stage_context_missing",
          tenantId,
          leadId,
          stage,
          missingFields: stageValidation.missingFields,
        },
        { status: 409 }
      );
    }

    const previousStage = normalizePipelineStageId(clean(leadData.pipelineStage, 80) || "captado");

    const patch: Record<string, unknown> = {
      pipelineStage: stage,
      stage,
      stageUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (status) {
      patch.status = status;
    }
    if (!stageValidation.ok && forceStageMove) {
      patch.stageContextOverride = {
        by: user.uid,
        byName: user.name,
        missingFields: stageValidation.missingFields,
        forcedAt: FieldValue.serverTimestamp(),
      };
    }

    await Promise.all([
      leadRef.set(patch, { merge: true }),
      leadRef.collection("events").add({
        type: !stageValidation.ok && forceStageMove ? "stage_change_forced" : "stage_change",
        title: !stageValidation.ok && forceStageMove ? "Stage atualizado com override" : "Stage atualizado",
        detail:
          !stageValidation.ok && forceStageMove
            ? `${previousStage} -> ${stage} (override: ${stageValidation.missingFields.join(", ")})`
            : `${previousStage} -> ${stage}`,
        previousStage,
        nextStage: stage,
        forced: !stageValidation.ok && forceStageMove,
        missingFields: !stageValidation.ok && forceStageMove ? stageValidation.missingFields : [],
        actorId: user.uid,
        actorName: user.name,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);

    await runPipelineStageSideEffects({
      tenantId,
      leadId,
      previousStage,
      nextStage: stage,
      actorId: user.uid,
      actorName: user.name,
      source: "pipeline_stage_update",
      forced: !stageValidation.ok && forceStageMove,
      metadata: {
        missingFields: !stageValidation.ok && forceStageMove ? stageValidation.missingFields : [],
      },
    });

    await syncLeadCommercialState({
      tenantId,
      leadId,
      actorId: user.uid,
      actorName: user.name,
      allowStageAdvance: false,
    });

    return NextResponse.json({ ok: true, tenantId, leadId, previousStage, stage });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao atualizar stage do lead:", error);
    return NextResponse.json({ error: "Falha ao atualizar stage." }, { status: 500 });
  }
}
