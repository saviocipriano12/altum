import { NextResponse } from "next/server";
import { AGENCY_TENANT_ID } from "@/app/lib/server/whatsapp-channel";
import {
  buildDiagnosticSummary,
  buildDiagnosticWhatsappMessage,
  classifyDiagnosticLead,
  getDiagnosticAnswerDetails,
  normalizeDiagnosticAnswers,
} from "@/lib/diagnostic";
import { buildWhatsappUrl } from "@/lib/public-site";
import { recordInboundLead } from "@/lib/server/lead-intake";
import { assertPublicRateLimit, PublicRateLimitError } from "@/lib/server/public-abuse";

type Body = {
  nome?: string;
  email?: string;
  telefone?: string;
  empresa?: string;
  mensagem?: string;
  answers?: Record<string, unknown>;
  entry?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  gclid?: string;
  fbclid?: string;
  landingPage?: string;
  referrer?: string;
};

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(req: Request) {
  try {
    await assertPublicRateLimit(req, {
      scope: "public_diagnostic_submit",
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    const body = (await req.json()) as Body;
    const answers = normalizeDiagnosticAnswers(body.answers);
    const classification = classifyDiagnosticLead(answers);
    const recommendation = classification.recommendation;
    const answerDetails = getDiagnosticAnswerDetails(answers);
    const summary = buildDiagnosticSummary(answers);

    const nome = clean(body.nome, 180);
    const email = clean(body.email, 180).toLowerCase();
    const telefone = clean(body.telefone, 40);
    const empresa = clean(body.empresa, 180);
    const mensagem = clean(body.mensagem, 4000);
    const utmSource = clean(body.utmSource, 120);
    const utmMedium = clean(body.utmMedium, 120);
    const utmCampaign = clean(body.utmCampaign, 180);
    const utmTerm = clean(body.utmTerm, 160);
    const utmContent = clean(body.utmContent, 240);
    const gclid = clean(body.gclid, 240);
    const fbclid = clean(body.fbclid, 240);
    const entry = clean(body.entry, 160);
    const landingPage = clean(body.landingPage, 500);
    const referrer = clean(body.referrer, 500);

    const hasAllAnswers = answerDetails.every((item) => item.value);
    if (!hasAllAnswers) {
      return NextResponse.json(
        { error: "Complete o diagnostico antes de enviar seus dados." },
        { status: 400 }
      );
    }

    if (!nome || (!email && !telefone)) {
      return NextResponse.json(
        { error: "Informe pelo menos nome e telefone ou email para continuar." },
        { status: 400 }
      );
    }

    const lead = await recordInboundLead({
      tenantId: AGENCY_TENANT_ID,
      sourceType: "site_diagnostic",
      sourceId: "diagnostico_altum",
      sourceLabel: "Diagnostico Altum",
      channel: "site_form",
      nome,
      email,
      telefone,
      empresa,
      mensagem,
      customFields: {
        diagnostico_resultado: recommendation.title,
        diagnostico_slug: recommendation.id,
        diagnostico_resumo: summary,
        diagnostico_faturamento: answers.revenue || "",
        diagnostico_faturamento_label:
          answerDetails.find((item) => item.id === "revenue")?.label || "",
        diagnostico_segmento: answers.segment || "",
        diagnostico_segmento_label:
          answerDetails.find((item) => item.id === "segment")?.label || "",
        diagnostico_cargo: answers.role || "",
        diagnostico_cargo_label: answerDetails.find((item) => item.id === "role")?.label || "",
        diagnostico_prazo: answers.timeline || "",
        diagnostico_prazo_label:
          answerDetails.find((item) => item.id === "timeline")?.label || "",
        diagnostico_verba: answers.budget || "",
        diagnostico_verba_label:
          answerDetails.find((item) => item.id === "budget")?.label || "",
        diagnostico_temperatura: classification.temperature,
        diagnostico_score: classification.score,
        diagnostico_icp: classification.isPrimaryIcp ? "principal" : "entrada",
        diagnostico_bucket: classification.contactBucket,
        diagnostico_entry: entry,
        rota_sugerida: recommendation.id,
        rota_sugerida_label: recommendation.title,
      },
      notes: [
        `Resultado do diagnostico: ${recommendation.title}`,
        `Temperatura: ${classification.temperature}`,
        `Bucket comercial: ${classification.contactBucket}`,
        entry ? `Entrada do quiz: ${entry}` : "",
        ...answerDetails.map((item) => `${item.title}: ${item.label}`),
      ],
      tags: [
        "diagnostico_altum",
        "lead_publico",
        "site_form",
        recommendation.id,
        `temperatura_${classification.temperature}`,
        classification.isPrimaryIcp ? "icp_principal" : "contato_entrada",
        entry ? `entry_${entry}` : "",
      ],
      defaultPipelineStage: "diagnostico",
      attribution: {
        source: utmSource || "diagnostico_altum",
        medium: utmMedium || "site",
        campaign: utmCampaign,
        term: utmTerm,
        content: utmContent,
        formId: "diagnostico_altum",
        formName: "Diagnostico Altum",
        sourceLabel: "Diagnostico Altum",
        channel: "site_form",
        sourceType: "site_diagnostic",
        landingPage,
        referrer,
        gclid,
        fbclid,
      },
      submission: {
        formId: "diagnostico_altum",
        formName: "Diagnostico Altum",
        sourceLabel: "Diagnostico Altum",
        utmSource,
        utmMedium,
        utmCampaign,
        utmTerm,
        utmContent,
        gclid,
        fbclid,
        landingPage,
        referrer,
      },
      automationActorId: "altum_public_diagnostic",
      automationActorName: "ALTUM Diagnostico",
    });

    return NextResponse.json({
      ok: true,
      leadId: lead.leadId,
      recommendation,
      classification,
      whatsappUrl: buildWhatsappUrl(
        buildDiagnosticWhatsappMessage(answers, recommendation, { nome, empresa })
      ),
      message:
        "Diagnostico recebido. A equipe ja pode ver esse lead no CRM com o contexto preenchido.",
    });
  } catch (error) {
    if (error instanceof PublicRateLimitError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: 429,
          headers: { "Retry-After": String(error.retryAfterSeconds) },
        }
      );
    }
    console.error("Erro ao processar diagnostico publico:", error);
    return NextResponse.json({ error: "Falha ao enviar diagnostico." }, { status: 500 });
  }
}
